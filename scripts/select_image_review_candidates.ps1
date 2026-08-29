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

$legacyMediumIds = @(
  'medium/20f97dfa3cacfdad0e6ad4e8bd6b9f40259e269d01de4e85977a31d1468a0731',
  'medium/2cb1bd9d5e821673e5988fe08124a3a9270c9ef0cd5b494b7fea0a55bb4814e7',
  'medium/502c9af7d38343926679b4000c07f7938a7bb2ffb2de34fd307939daa7c4523a',
  'medium/79135b86692f72d399ab6e14643d150385b4419e4c10a2c66a7e32ccacd64cbe',
  'medium/982e8af5463df6dd09ee9b9aeb11f3c8764461085e2bf676f51d03a5fc9fe1fb',
  'medium/bae249c94478ad9d5603403fcd7b5141ffc06bc35a66bd782d1f4f259ed2a7cb',
  'medium/ec686e18de7c21b0892fabb04179d3a92b94245291f508d7fdc56af18af8fab7'
)
$focusedCleanupSydIds = @(
  'essays/dialogues/bobanonymous/hero',
  'essays/dialogues/broke-rich/hero',
  'essays/dialogues/infinite-incontent/hero',
  'essays/dialogues/pressure-makes-pearls/hero'
)
foreach ($row in @($rows | Where-Object {
  ($_.id.StartsWith('medium/', [System.StringComparison]::Ordinal) -and $legacyMediumIds -cnotcontains $_.id) -or
  $focusedCleanupSydIds -ccontains [string]$_.id
})) {
  Add-ReviewReason -Id $row.id -Reason 'focused_cleanup_migration'
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

$focusedCleanupCandidates = @($candidates | Where-Object { $_.reasons -contains 'focused_cleanup_migration' })
if ($focusedCleanupCandidates.Count -ne 109) {
  throw "Focused-cleanup review cohort must contain exactly 109 migrated assets; found $($focusedCleanupCandidates.Count)."
}
$focusedCleanupIdSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($candidate in $focusedCleanupCandidates) {
  [void]$focusedCleanupIdSet.Add([string]$candidate.id)
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

foreach ($id in $focusedCleanupSydIds) {
  Add-DeepReviewReason -Id $id -Reason 'focused_syd_hero'
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

foreach ($id in @(
  'medium/39e3617269bd3ce2757d8b6d0bf6990bda121d46a73fbc206ab41017d99c2fde',
  'medium/410a601d6503e9a566154c4622b5698c20f059c16bdabd976c0e2bb1cd67afc2',
  'medium/42145583d76ac3616def9f537a23dd218becdf4a7b344792606bfcc5f9e88c19',
  'medium/597f8a7cf6738f762be826d657b4934b810710e6a95e9d555d102551e0e315ca'
)) {
  Add-DeepReviewReason -Id $id -Reason 'focused_chart'
}

foreach ($id in @(
  'medium/4f31029a1c1552ee315750ba6fd54eabfc201c43c3b889388ad8777ec7b649d7',
  'medium/d5d6535a7eb0a21a23db5acb6801f1c8aebee162d072c53e03b818938512a56e',
  'medium/e310cf068f2005331d6c0d44ca19a81ee9223e9cd449724d13e282717ccbf203',
  'medium/fe49c38c26d28df6603266a66af7c98a5337fb7c9dca2d977f3331fdc40bbb3a'
)) {
  Add-DeepReviewReason -Id $id -Reason 'focused_map'
}

foreach ($id in @(
  'medium/41eed8f56249fdadda5c9bf6714146ebac1841b1a5f956a41c8369f729333c1f',
  'medium/76a6a378caa1eb3b58af6361ee589a730ede3716843b3cf89405795871ee2f5d',
  'medium/ed3b9f9e6208b9bfbcdab0d0460ba2217a8278685f91a746edc592a202c21a3f',
  'medium/edf9c9656e1f84536b0a965f37a58e7cb1e26100742c63990e5b133a04badb7c'
)) {
  Add-DeepReviewReason -Id $id -Reason 'focused_fine_text'
}

foreach ($id in @(
  'medium/4247da9d13f86756606baad8f9661f974e3c04e62ed489843878a13ad15c9ebe',
  'medium/57d2e2573cdbc659261cd4a869b43321fa96cd36a2a4f92c0efd3357c04c0318',
  'medium/d6b3a7394b6883ceeb4b5ff9cc7b775a30cd1dcab75999818ee1ff1b0e735f89',
  'medium/f4b292028370a2cbfdaaa85746c2a27aa0c34975f31b8064779f9d20e694af59'
)) {
  Add-DeepReviewReason -Id $id -Reason 'focused_portrait_or_tall'
}

foreach ($candidate in @($focusedCleanupCandidates | Sort-Object @{ Expression = 'aspect_ratio'; Descending = $true }, id | Select-Object -First 4)) {
  Add-DeepReviewReason -Id $candidate.id -Reason 'focused_extreme_aspect_ratio'
}
foreach ($candidate in @(
  $focusedCleanupCandidates |
    Where-Object { $visualMetrics.ContainsKey($_.id) } |
    Sort-Object @{ Expression = { $visualMetrics[$_.id].dark_fraction }; Descending = $true }, id |
    Select-Object -First 4
)) {
  Add-DeepReviewReason -Id $candidate.id -Reason 'focused_dark_tones'
}
foreach ($candidate in @(
  $focusedCleanupCandidates |
    Where-Object { $visualMetrics.ContainsKey($_.id) } |
    Sort-Object @{ Expression = { $visualMetrics[$_.id].saturated_fraction }; Descending = $true }, id |
    Select-Object -First 4
)) {
  Add-DeepReviewReason -Id $candidate.id -Reason 'focused_saturated_color'
}
foreach ($candidate in @($focusedCleanupCandidates | Sort-Object @{ Expression = 'bytes'; Descending = $true }, id | Select-Object -First 4)) {
  Add-DeepReviewReason -Id $candidate.id -Reason 'focused_largest_source_bytes'
}
foreach ($candidate in @($focusedCleanupCandidates | Sort-Object @{ Expression = 'pixels'; Descending = $true }, id | Select-Object -First 4)) {
  Add-DeepReviewReason -Id $candidate.id -Reason 'focused_largest_native_dimensions'
}

$focusedDeepReviewCount = @($deepReasons.Keys | Where-Object { $focusedCleanupIdSet.Contains([string]$_) }).Count
if ($focusedDeepReviewCount -lt 24) {
  foreach ($candidate in @($focusedCleanupCandidates | Sort-Object @{ Expression = { $_.reasons.Count }; Descending = $true }, @{ Expression = 'bytes'; Descending = $true }, id)) {
    if ($focusedDeepReviewCount -ge 24) { break }
    Add-DeepReviewReason -Id $candidate.id -Reason 'focused_deterministic_minimum_fill'
    $focusedDeepReviewCount = @($deepReasons.Keys | Where-Object { $focusedCleanupIdSet.Contains([string]$_) }).Count
  }
}

$requiredDeepCategories = @(
  'fine_text',
  'crosshatching',
  'focused_syd_hero',
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
$requiredFocusedDeepCategories = @(
  'focused_syd_hero',
  'focused_chart',
  'focused_map',
  'focused_fine_text',
  'focused_portrait_or_tall',
  'focused_extreme_aspect_ratio',
  'focused_dark_tones',
  'focused_saturated_color',
  'focused_largest_source_bytes',
  'focused_largest_native_dimensions'
)
foreach ($category in $requiredFocusedDeepCategories) {
  $focusedCategoryCount = @(
    $deepReasons.Keys | Where-Object {
      $focusedCleanupIdSet.Contains([string]$_) -and $deepReasons[$_] -contains $category
    }
  ).Count
  if ($focusedCategoryCount -lt 1) {
    throw "Focused deep-review selection is missing required category: $category"
  }
}
if ($focusedDeepReviewCount -lt 24) {
  throw "Focused deep-review selection produced $focusedDeepReviewCount migrated assets, below required minimum 24."
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
foreach ($category in @($requiredDeepCategories + $requiredFocusedDeepCategories)) {
  $deepCategoryCounts[$category] = @($deepReviewSelection | Where-Object { $_.categories -contains $category }).Count
}
$deepCategoryCounts['deterministic_minimum_fill'] = @($deepReviewSelection | Where-Object { $_.categories -contains 'deterministic_minimum_fill' }).Count
$deepCategoryCounts['focused_deterministic_minimum_fill'] = @($deepReviewSelection | Where-Object { $_.categories -contains 'focused_deterministic_minimum_fill' }).Count

$report = [ordered]@{
  schema_version = '1.0'
  manifest_sha256 = Get-OipCanonicalTextFileSha256 -Path $manifestPath -Label 'Image asset manifest' -RequireCanonical
  canonical_asset_count = $rows.Count
  candidate_count = $candidates.Count
  minimum_candidate_count = $MinimumCandidates
  deep_review_count = $deepReviewSelection.Count
  focused_deep_review_count = $focusedDeepReviewCount
  selection_rule = 'union_of_focused_cleanup_migrations_all_photos_and_medium_sources_top_12_bytes_top_12_pixels_top_12_aspect_ratio_and_text_fine_line_metadata'
  deep_review_rule = 'r3_carryovers_plus_at_least_24_focused_cleanup_assets_covering_all_syd_heroes_charts_maps_fine_text_portrait_or_tall_extreme_aspect_dark_saturated_largest_bytes_and_largest_dimensions'
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
  Write-OipCanonicalJsonFile -Path $resolvedOutput -Value $report -Depth 12
  Write-Host "Review candidate report: $resolvedOutput"
}

Write-Host "Canonical assets: $($rows.Count)"
Write-Host "High-risk review candidates: $($candidates.Count)"
Write-Host "Deep-review selection: $($deepReviewSelection.Count)"
