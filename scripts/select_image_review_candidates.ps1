#requires -Version 7.0
param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$OutputPath = './reports/image-review-candidates.json',
  [int]$MinimumCandidates = 24
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
. (Join-Path $PSScriptRoot 'lib\image_asset_manifest.ps1')

if ($MinimumCandidates -lt 24) {
  throw 'MinimumCandidates cannot be lower than the 24-asset review contract.'
}

$manifestPath = Get-OipImageAssetManifestPath -Root $Root
$manifest = Read-OipImageAssetManifest -Root $Root
$rows = [System.Collections.Generic.List[object]]::new()

foreach ($id in @($manifest.assets.Keys | Sort-Object)) {
  $entry = $manifest.assets[$id]
  $sourcePath = Join-Path (Join-Path $Root 'assets') ([string]$entry.source)
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Missing managed image source: $id :: $sourcePath"
  }

  $width = [int]$entry.width
  $height = [int]$entry.height
  $longEdge = [Math]::Max($width, $height)
  $shortEdge = [Math]::Min($width, $height)
  $rows.Add([pscustomobject]@{
    id = [string]$id
    source = [string]$entry.source
    sha256 = [string]$entry.sha256
    width = $width
    height = $height
    pixels = [int64]$width * [int64]$height
    bytes = [int64](Get-Item -LiteralPath $sourcePath).Length
    aspect_ratio = [Math]::Round(($longEdge / [double]$shortEdge), 4)
    image_class = [string]$entry.image_class
    processing_hint = [string]$entry.processing_hint
    review_state = [string]$entry.review_state
    usage_state = [string]$entry.usage_state
    processing_state = [string]$entry.processing_state
    processing_note = if ($null -eq $entry.processing_note) { $null } else { [string]$entry.processing_note }
  })
}

$reasons = @{}
function Add-ReviewReason {
  param([string]$Id, [string]$Reason)

  if (-not $reasons.ContainsKey($Id)) {
    $reasons[$Id] = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  }
  [void]$reasons[$Id].Add($Reason)
}

function Get-ImageVisualMetrics {
  param([Parameter(Mandatory = $true)][string]$Path)

  Add-Type -AssemblyName System.Drawing
  $bitmap = [System.Drawing.Bitmap]::new($Path)
  try {
    $xStep = [Math]::Max(1, [int][Math]::Floor($bitmap.Width / 32.0))
    $yStep = [Math]::Max(1, [int][Math]::Floor($bitmap.Height / 32.0))
    [double]$luminanceTotal = 0
    [double]$saturationTotal = 0
    [int]$darkCount = 0
    [int]$saturatedCount = 0
    [int]$sampleCount = 0

    for ($y = [int][Math]::Floor($yStep / 2.0); $y -lt $bitmap.Height; $y += $yStep) {
      for ($x = [int][Math]::Floor($xStep / 2.0); $x -lt $bitmap.Width; $x += $xStep) {
        $color = $bitmap.GetPixel($x, $y)
        $alpha = $color.A / 255.0
        $red = (($color.R * $alpha) + (255 * (1 - $alpha))) / 255.0
        $green = (($color.G * $alpha) + (255 * (1 - $alpha))) / 255.0
        $blue = (($color.B * $alpha) + (255 * (1 - $alpha))) / 255.0
        $maximum = [Math]::Max($red, [Math]::Max($green, $blue))
        $minimum = [Math]::Min($red, [Math]::Min($green, $blue))
        $saturation = if ($maximum -le 0) { 0 } else { ($maximum - $minimum) / $maximum }
        $luminance = (0.2126 * $red) + (0.7152 * $green) + (0.0722 * $blue)
        $luminanceTotal += $luminance
        $saturationTotal += $saturation
        if ($luminance -lt 0.28) { $darkCount++ }
        if ($saturation -gt 0.58) { $saturatedCount++ }
        $sampleCount++
      }
    }

    return [pscustomobject]@{
      average_luminance = [Math]::Round(($luminanceTotal / $sampleCount), 4)
      dark_fraction = [Math]::Round(($darkCount / [double]$sampleCount), 4)
      average_saturation = [Math]::Round(($saturationTotal / $sampleCount), 4)
      saturated_fraction = [Math]::Round(($saturatedCount / [double]$sampleCount), 4)
      sample_count = $sampleCount
    }
  }
  finally {
    $bitmap.Dispose()
  }
}

foreach ($row in @($rows | Where-Object { $_.processing_hint -eq 'photo' -or $_.image_class -eq 'medium_import' })) {
  Add-ReviewReason -Id $row.id -Reason 'all_photo_and_medium_sources'
}

foreach ($row in @($rows | Sort-Object @{ Expression = 'bytes'; Descending = $true }, id | Select-Object -First 12)) {
  Add-ReviewReason -Id $row.id -Reason 'largest_source_bytes'
}

foreach ($row in @($rows | Sort-Object @{ Expression = 'pixels'; Descending = $true }, id | Select-Object -First 12)) {
  Add-ReviewReason -Id $row.id -Reason 'largest_native_dimensions'
}

foreach ($row in @($rows | Sort-Object @{ Expression = 'aspect_ratio'; Descending = $true }, id | Select-Object -First 12)) {
  Add-ReviewReason -Id $row.id -Reason 'extreme_aspect_ratio'
}

$cartoonDataPath = Join-Path $Root 'data\editorial_cartoons.yaml'
if (Test-Path -LiteralPath $cartoonDataPath -PathType Leaf) {
  $cartoonData = [System.IO.File]::ReadAllText($cartoonDataPath, [System.Text.Encoding]::UTF8)
  $blocks = [regex]::Matches($cartoonData, '(?ms)^  - slug:.*?(?=^  - slug:|\z)')
  foreach ($block in $blocks) {
    $imageMatch = [regex]::Match($block.Value, '(?m)^\s+image:\s*["'']?(?<value>[^"''\r\n]+)')
    $altMatch = [regex]::Match($block.Value, '(?m)^\s+alt:\s*["'']?(?<value>[^"''\r\n]+)')
    if (-not $imageMatch.Success -or -not $altMatch.Success) {
      continue
    }

    $id = $imageMatch.Groups['value'].Value.Trim()
    $alt = $altMatch.Groups['value'].Value
    if ($manifest.assets.Contains($id) -and $alt -match '(?i)\b(sign|label|screen|letter|menu|receipt|meter|document|form|headline|placard|button|card|words?|stamp|file|drawer|counter|chart|map|ballot)\b') {
      Add-ReviewReason -Id $id -Reason 'text_or_fine_line_metadata'
    }
  }
}

foreach ($id in @(
  'editorial/cartoon-think-outside-the-box',
  'editorial/claim-check',
  'editorial/papers-please',
  'editorial/the-meter',
  'editorial/the-minute-drawer',
  'editorial/the-tab',
  'editorial/whose-yes'
)) {
  if ($manifest.assets.Contains($id)) {
    Add-ReviewReason -Id $id -Reason 'known_text_or_fine_line_cartoon'
  }
}

$rowById = @{}
foreach ($row in $rows) {
  $rowById[$row.id] = $row
}

$candidates = [System.Collections.Generic.List[object]]::new()
foreach ($id in @($reasons.Keys | Sort-Object)) {
  $row = $rowById[$id]
  $candidates.Add([ordered]@{
    id = $row.id
    source = $row.source
    sha256 = $row.sha256
    width = $row.width
    height = $row.height
    pixels = $row.pixels
    bytes = $row.bytes
    aspect_ratio = $row.aspect_ratio
    image_class = $row.image_class
    processing_hint = $row.processing_hint
    review_state = $row.review_state
    usage_state = $row.usage_state
    processing_state = $row.processing_state
    processing_note = $row.processing_note
    reasons = @($reasons[$id] | Sort-Object)
  })
}

if ($candidates.Count -lt $MinimumCandidates) {
  throw "Review candidate selection produced $($candidates.Count), below required minimum $MinimumCandidates."
}

$visualMetrics = @{}
foreach ($candidate in @($candidates | Where-Object { $_.processing_state -eq 'derivative_capable' })) {
  $sourcePath = Join-Path (Join-Path $Root 'assets') ([string]$candidate.source)
  $visualMetrics[$candidate.id] = Get-ImageVisualMetrics -Path $sourcePath
}

$deepReasons = @{}
function Add-DeepReviewReason {
  param([string]$Id, [string]$Reason)

  if (-not $reasons.ContainsKey($Id)) {
    return
  }
  if (-not $deepReasons.ContainsKey($Id)) {
    $deepReasons[$Id] = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  }
  [void]$deepReasons[$Id].Add($Reason)
}

foreach ($id in @(
  'editorial/claim-check',
  'editorial/papers-please',
  'editorial/the-meter',
  'editorial/whose-yes'
)) {
  Add-DeepReviewReason -Id $id -Reason 'fine_text'
}

foreach ($id in @(
  'editorial/cartoon-think-outside-the-box',
  'editorial/lines-of-fire',
  'editorial/the-sewer-under-the-sidewalk',
  'editorial/very-fine-lines-on-both-sides'
)) {
  Add-DeepReviewReason -Id $id -Reason 'crosshatching'
}

foreach ($candidate in @($candidates | Where-Object { $_.processing_hint -eq 'photo' } | Sort-Object @{ Expression = 'bytes'; Descending = $true }, id | Select-Object -First 4)) {
  Add-DeepReviewReason -Id $candidate.id -Reason 'faces_or_photos'
}

foreach ($candidate in @(
  $candidates |
    Where-Object { $visualMetrics.ContainsKey($_.id) } |
    Sort-Object @{ Expression = { $visualMetrics[$_.id].dark_fraction }; Descending = $true }, id |
    Select-Object -First 4
)) {
  Add-DeepReviewReason -Id $candidate.id -Reason 'dark_tones'
}

foreach ($candidate in @(
  $candidates |
    Where-Object { $visualMetrics.ContainsKey($_.id) } |
    Sort-Object @{ Expression = { $visualMetrics[$_.id].saturated_fraction }; Descending = $true }, id |
    Select-Object -First 4
)) {
  Add-DeepReviewReason -Id $candidate.id -Reason 'saturated_color'
}

foreach ($candidate in @($candidates | Sort-Object @{ Expression = 'aspect_ratio'; Descending = $true }, id | Select-Object -First 4)) {
  Add-DeepReviewReason -Id $candidate.id -Reason 'extreme_aspect_ratio'
}
foreach ($candidate in @($candidates | Sort-Object @{ Expression = 'bytes'; Descending = $true }, id | Select-Object -First 4)) {
  Add-DeepReviewReason -Id $candidate.id -Reason 'largest_source_bytes'
}
foreach ($candidate in @($candidates | Sort-Object @{ Expression = 'pixels'; Descending = $true }, id | Select-Object -First 4)) {
  Add-DeepReviewReason -Id $candidate.id -Reason 'largest_native_dimensions'
}

if ($deepReasons.Count -lt 24) {
  foreach ($candidate in @($candidates | Sort-Object @{ Expression = { $_.reasons.Count }; Descending = $true }, @{ Expression = 'bytes'; Descending = $true }, id)) {
    if ($deepReasons.Count -ge 24) { break }
    Add-DeepReviewReason -Id $candidate.id -Reason 'deterministic_minimum_fill'
  }
}

$requiredDeepCategories = @(
  'fine_text',
  'crosshatching',
  'faces_or_photos',
  'dark_tones',
  'saturated_color',
  'extreme_aspect_ratio',
  'largest_source_bytes',
  'largest_native_dimensions'
)
foreach ($category in $requiredDeepCategories) {
  if (@($deepReasons.Values | Where-Object { $_ -contains $category }).Count -eq 0) {
    throw "Deep-review selection is missing required category: $category"
  }
}
if ($deepReasons.Count -lt 24) {
  throw "Deep-review selection produced $($deepReasons.Count), below required minimum 24."
}

$candidateById = @{}
foreach ($candidate in $candidates) {
  $candidateById[$candidate.id] = $candidate
}
$deepReviewSelection = [System.Collections.Generic.List[object]]::new()
foreach ($id in @($deepReasons.Keys | Sort-Object)) {
  $candidate = $candidateById[$id]
  $metrics = if ($visualMetrics.ContainsKey($id)) { $visualMetrics[$id] } else { $null }
  $deepReviewSelection.Add([ordered]@{
    id = $id
    source = $candidate.source
    sha256 = $candidate.sha256
    width = $candidate.width
    height = $candidate.height
    bytes = $candidate.bytes
    aspect_ratio = $candidate.aspect_ratio
    image_class = $candidate.image_class
    processing_hint = $candidate.processing_hint
    review_state = $candidate.review_state
    usage_state = $candidate.usage_state
    processing_state = $candidate.processing_state
    categories = @($deepReasons[$id] | Sort-Object)
    visual_metrics = $metrics
  })
}

$reasonCounts = [ordered]@{}
foreach ($reason in @($reasons.Values | ForEach-Object { $_ } | Sort-Object -Unique)) {
  $reasonCounts[$reason] = @($candidates | Where-Object { $_.reasons -contains $reason }).Count
}
$deepCategoryCounts = [ordered]@{}
foreach ($category in $requiredDeepCategories) {
  $deepCategoryCounts[$category] = @($deepReviewSelection | Where-Object { $_.categories -contains $category }).Count
}
$deepCategoryCounts['deterministic_minimum_fill'] = @($deepReviewSelection | Where-Object { $_.categories -contains 'deterministic_minimum_fill' }).Count

$report = [ordered]@{
  schema_version = '1.0'
  manifest_sha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  canonical_asset_count = $rows.Count
  candidate_count = $candidates.Count
  minimum_candidate_count = $MinimumCandidates
  deep_review_count = $deepReviewSelection.Count
  selection_rule = 'union_of_all_photos_and_medium_sources_top_12_bytes_top_12_pixels_top_12_aspect_ratio_and_text_fine_line_metadata'
  deep_review_rule = 'fixed_fine_text_and_crosshatching_assets_plus_top_4_photos_dark_tones_saturated_color_aspect_ratio_source_bytes_native_pixels_then_deterministic_fill_to_24'
  reason_counts = $reasonCounts
  deep_review_category_counts = $deepCategoryCounts
  candidates = $candidates
  deep_review_selection = $deepReviewSelection
}

if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
  $resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    [System.IO.Path]::GetFullPath($OutputPath)
  }
  else {
    [System.IO.Path]::GetFullPath((Join-Path $Root $OutputPath))
  }
  $directory = Split-Path -Parent $resolvedOutput
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -Path $directory -ItemType Directory -Force | Out-Null
  }
  $json = $report | ConvertTo-Json -Depth 12
  [System.IO.File]::WriteAllText($resolvedOutput, $json + "`n", [System.Text.UTF8Encoding]::new($false))
  Write-Host "Review candidate report: $resolvedOutput"
}

Write-Host "Canonical assets: $($rows.Count)"
Write-Host "High-risk review candidates: $($candidates.Count)"
Write-Host "Deep-review selection: $($deepReviewSelection.Count)"
