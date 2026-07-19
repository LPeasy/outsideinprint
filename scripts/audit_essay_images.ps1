#requires -Version 7.0
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$FailOnIssues,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot 'png_integrity.ps1')

function Get-FrontMatterAndBody {
  param([string]$Path)

  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $match = [regex]::Match($content, '(?s)\A---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n|$)')
  if (-not $match.Success) {
    return [pscustomobject]@{
      FrontMatter = ''
      Body = $content
    }
  }

  return [pscustomobject]@{
    FrontMatter = $match.Groups[1].Value
    Body = $content.Substring($match.Length)
  }
}

function Get-FrontMatterMap {
  param([string]$FrontMatter)

  $result = @{}
  foreach ($line in @($FrontMatter -split "`r?`n")) {
    if ($line -match '^\s*([A-Za-z0-9_]+):\s*(.*?)\s*$') {
      $value = $Matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $result[$Matches[1].ToLowerInvariant()] = $value
    }
  }

  return $result
}

function Get-LocalImageReferences {
  param(
    [hashtable]$FrontMatter,
    [string]$Body
  )

  $refs = New-Object System.Collections.Generic.List[string]
  foreach ($key in @('featured_image', 'image')) {
    if ($FrontMatter.ContainsKey($key)) {
      $value = ([string]$FrontMatter[$key]).Trim()
      if (-not [string]::IsNullOrWhiteSpace($value)) {
        $refs.Add($value)
      }
    }
  }

  foreach ($match in [regex]::Matches($Body, '!\[[^\]]*\]\((/images/[^)\s]+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
    $refs.Add($match.Groups[1].Value)
  }

  foreach ($match in [regex]::Matches($Body, '<img[^>]+src=(?:"([^"]+)"|''([^'']+)''|([^\s>]+))', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
    $src = ($match.Groups[1].Value + $match.Groups[2].Value + $match.Groups[3].Value).Trim()
    if ($src.StartsWith('/images/', [System.StringComparison]::OrdinalIgnoreCase)) {
      $refs.Add($src)
    }
  }

  return @($refs | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
}

function Test-ImageExempt {
  param([hashtable]$FrontMatter)

  if (-not $FrontMatter.ContainsKey('image_exempt')) {
    return $false
  }

  if (([string]$FrontMatter['image_exempt']).Trim() -notmatch '^(?i:true|yes|1)$') {
    return $false
  }

  return $FrontMatter.ContainsKey('image_exempt_reason') -and -not [string]::IsNullOrWhiteSpace([string]$FrontMatter['image_exempt_reason'])
}

function Resolve-StaticImagePath {
  param(
    [string]$Root,
    [string]$ImageRef
  )

  $relative = $ImageRef.Trim()
  if ($relative.StartsWith('/')) {
    $relative = $relative.Substring(1)
  }

  if (-not $relative.StartsWith('images/', [System.StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }

  return Join-Path (Join-Path $Root 'static') $relative
}

$contentRoot = Join-Path $Root 'content\essays'
if (-not (Test-Path -LiteralPath $contentRoot -PathType Container)) {
  throw "Missing essay content root: $contentRoot"
}

$issues = New-Object System.Collections.Generic.List[object]
$imageWarnings = New-Object System.Collections.Generic.List[object]

$essayFiles = Get-ChildItem -LiteralPath $contentRoot -Recurse -File -Filter '*.md' |
  Where-Object { $_.Name -ne '_index.md' } |
  Sort-Object FullName

foreach ($file in $essayFiles) {
  $relativePath = $file.FullName.Substring($Root.Length + 1).Replace('\', '/')
  $parts = Get-FrontMatterAndBody -Path $file.FullName
  $front = Get-FrontMatterMap -FrontMatter $parts.FrontMatter
  $draft = $front.ContainsKey('draft') -and ([string]$front['draft']).Trim() -match '^(?i:true|yes|1)$'
  if ($draft) {
    continue
  }

  $isExempt = Test-ImageExempt -FrontMatter $front
  $localRefs = @(Get-LocalImageReferences -FrontMatter $front -Body $parts.Body)
  $hasDeclaredImage = $localRefs.Count -gt 0 -or $front.ContainsKey('images')

  if (-not $hasDeclaredImage -and -not $isExempt) {
    $issues.Add([pscustomobject]@{
      Type = 'no_image'
      Path = $relativePath
      Detail = 'Published essay has no featured_image, image, images, or local body image reference.'
    })
  }

  $scanText = $parts.FrontMatter + "`n" + $parts.Body
  foreach ($match in [regex]::Matches($scanText, 'https://(?:cdn-images-\d+|miro)\.medium\.com/[^\s)"''<>]+', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
    $issues.Add([pscustomobject]@{
      Type = 'external_medium_image'
      Path = $relativePath
      Detail = $match.Value
    })
  }

  foreach ($imageRef in $localRefs) {
    $staticPath = Resolve-StaticImagePath -Root $Root -ImageRef $imageRef
    if ($null -eq $staticPath) {
      continue
    }

    if (-not (Test-Path -LiteralPath $staticPath -PathType Leaf)) {
      $issues.Add([pscustomobject]@{
        Type = 'missing_local_image'
        Path = $relativePath
        Detail = $imageRef
      })
      continue
    }

    if ([System.IO.Path]::GetExtension($staticPath) -ieq '.svg') {
      $svgContent = [System.IO.File]::ReadAllText($staticPath, [System.Text.Encoding]::UTF8)
      if ($svgContent -match '(?i)Imported image placeholder|Localized placeholder|runtime dependency on Medium CDN') {
        $issues.Add([pscustomobject]@{
          Type = 'placeholder_svg'
          Path = $relativePath
          Detail = $imageRef
        })
      }
    }

    if ([System.IO.Path]::GetExtension($staticPath) -ieq '.png') {
      $png = Test-OipPngIntegrity -Path $staticPath
      if (-not $png.IsValid) {
        $issues.Add([pscustomobject]@{
          Type = 'invalid_png'
          Path = $relativePath
          Detail = "$imageRef :: $($png.Detail)"
        })
      }
    }
  }
}

$report = [pscustomobject][ordered]@{
  checked = $essayFiles.Count
  issue_count = $issues.Count
  warning_count = $imageWarnings.Count
  issues = @($issues.ToArray())
  warnings = @($imageWarnings.ToArray())
}

if ($Json) {
  $report | ConvertTo-Json -Depth 6
} else {
  Write-Output "Essay image audit checked $($report.checked) essay files."
  Write-Output "Issues: $($report.issue_count)"
  foreach ($issue in $issues) {
    Write-Output ("ISSUE {0} {1} :: {2}" -f $issue.Type, $issue.Path, $issue.Detail)
  }
  Write-Output "Warnings: $($report.warning_count)"
  foreach ($warning in $imageWarnings) {
    Write-Output ("WARNING {0} {1} :: {2}" -f $warning.Type, $warning.Path, $warning.Detail)
  }
}

if ($FailOnIssues -and $issues.Count -gt 0) {
  exit 1
}

exit 0
