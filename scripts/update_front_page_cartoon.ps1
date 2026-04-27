param(
  [Parameter(Mandatory = $true)]
  [string]$ImagePath,

  [Parameter(Mandatory = $true)]
  [string]$Title,

  [Parameter(Mandatory = $true)]
  [string]$Alt,

  [string]$EssayPath,

  [switch]$NoEssayLink,

  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),

  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

function ConvertTo-Slug {
  param([string]$Value)

  $slug = $Value.ToLowerInvariant()
  $slug = [regex]::Replace($slug, '[^a-z0-9]+', '-')
  $slug = $slug.Trim('-')

  if ([string]::IsNullOrWhiteSpace($slug)) {
    throw 'Unable to derive a slug from the supplied title.'
  }

  return $slug
}

function Quote-YamlValue {
  param([string]$Value)

  return '"' + ($Value -replace '"', '\"') + '"'
}

function Unquote-YamlValue {
  param([string]$Value)

  $trimmed = $Value.Trim()
  if (($trimmed.StartsWith('"') -and $trimmed.EndsWith('"')) -or ($trimmed.StartsWith("'") -and $trimmed.EndsWith("'"))) {
    return $trimmed.Substring(1, $trimmed.Length - 2)
  }

  return $trimmed
}

function Normalize-EssayPath {
  param([string]$Value)

  $path = ([string]$Value).Trim()
  if ([string]::IsNullOrWhiteSpace($path)) {
    throw 'Essay path cannot be empty.'
  }

  if ($path -match '^https?://') {
    throw "Essay path must be a site-relative /essays/ path. Received: $path"
  }

  if (-not $path.StartsWith('/')) {
    $path = '/' + $path
  }

  if (-not $path.EndsWith('/')) {
    $path = $path + '/'
  }

  if ($path -notmatch '^/essays/[^/]+/$') {
    throw "Essay path must use /essays/<slug>/ format. Received: $path"
  }

  return $path
}

function Read-MarkdownFrontMatter {
  param([string]$Path)

  $result = @{}
  $lines = [System.IO.File]::ReadLines($Path)
  $inFrontMatter = $false
  $started = $false

  foreach ($line in $lines) {
    if (-not $started) {
      if ($line -eq '---') {
        $started = $true
        $inFrontMatter = $true
      }
      else {
        break
      }
      continue
    }

    if ($inFrontMatter -and $line -eq '---') {
      break
    }

    if ($inFrontMatter -and $line -match '^\s*([A-Za-z0-9_]+):\s*(.*?)\s*$') {
      $result[$Matches[1].ToLowerInvariant()] = Unquote-YamlValue $Matches[2]
    }
  }

  return $result
}

function Get-LatestEssayPath {
  param([string]$Root)

  $essayDirectory = Join-Path $Root 'content\essays'
  if (-not (Test-Path -LiteralPath $essayDirectory -PathType Container)) {
    throw "Essay directory not found: $essayDirectory"
  }

  $candidates = @()
  foreach ($file in Get-ChildItem -LiteralPath $essayDirectory -Filter '*.md' -File) {
    if ($file.Name -eq '_index.md') {
      continue
    }

    $frontMatter = Read-MarkdownFrontMatter -Path $file.FullName
    if (-not $frontMatter.ContainsKey('date')) {
      continue
    }

    $draftValue = ''
    if ($frontMatter.ContainsKey('draft')) {
      $draftValue = ([string]$frontMatter['draft']).Trim().ToLowerInvariant()
    }
    if ($draftValue -eq 'true') {
      continue
    }

    $dateValue = [string]$frontMatter['date']
    if ($dateValue -notmatch '^\d{4}-\d{2}-\d{2}') {
      continue
    }

    $slug = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
    if ($frontMatter.ContainsKey('slug') -and -not [string]::IsNullOrWhiteSpace([string]$frontMatter['slug'])) {
      $slug = [string]$frontMatter['slug']
    }

    $candidates += [pscustomobject]@{
      Date = [datetime]::ParseExact($Matches[0], 'yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture)
      Slug = $slug
      Path = "/essays/$slug/"
    }
  }

  if ($candidates.Count -eq 0) {
    throw 'Unable to find a non-draft essay with a yyyy-MM-dd front matter date.'
  }

  return ($candidates | Sort-Object Date, Slug -Descending | Select-Object -First 1).Path
}

function Read-CartoonData {
  param([string]$Path)

  $result = [ordered]@{
    current = ''
    cartoons = @()
  }

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $result
  }

  $entries = @()
  $entry = $null

  foreach ($line in [System.IO.File]::ReadLines($Path)) {
    if ($line -match '^current:\s*(.+)\s*$') {
      $result.current = Unquote-YamlValue $Matches[1]
      continue
    }

    if ($line -match '^\s*-\s+slug:\s*(.+)\s*$') {
      if ($null -ne $entry) {
        $entries += $entry
      }
      $entry = [ordered]@{ slug = Unquote-YamlValue $Matches[1] }
      continue
    }

    if ($null -ne $entry -and $line -match '^\s+([a-zA-Z0-9_]+):\s*(.*)\s*$') {
      $key = $Matches[1]
      $value = Unquote-YamlValue $Matches[2]
      if ($key -in @('width', 'height')) {
        $entry[$key] = [int]$value
      } else {
        $entry[$key] = $value
      }
    }
  }

  if ($null -ne $entry) {
    $entries += $entry
  }

  $result.cartoons = @($entries)
  return $result
}

function Write-CartoonData {
  param(
    [string]$Path,
    [string]$Current,
    [object[]]$Cartoons
  )

  $preferredKeyOrder = @('title', 'date', 'image', 'essay', 'alt', 'caption', 'width', 'height')

  $lines = @()
  $lines += "current: $Current"
  $lines += 'cartoons:'

  foreach ($cartoon in $Cartoons) {
    $lines += "  - slug: $($cartoon.slug)"

    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

    foreach ($key in $preferredKeyOrder) {
      if (-not $cartoon.Contains($key)) {
        continue
      }

      $seen.Add($key) | Out-Null
      $value = $cartoon[$key]
      if ($value -is [int] -or $value -is [long]) {
        $lines += "    ${key}: $value"
      } else {
        $lines += "    ${key}: $(Quote-YamlValue ([string]$value))"
      }
    }

    foreach ($property in $cartoon.GetEnumerator()) {
      $key = [string]$property.Key
      if ($key -eq 'slug' -or $seen.Contains($key)) {
        continue
      }

      $value = $property.Value
      if ($value -is [int] -or $value -is [long]) {
        $lines += "    ${key}: $value"
      } else {
        $lines += "    ${key}: $(Quote-YamlValue ([string]$value))"
      }
    }
  }

  $parent = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    New-Item -Path $parent -ItemType Directory -Force | Out-Null
  }

  [System.IO.File]::WriteAllText($Path, (($lines -join [Environment]::NewLine) + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) {
  throw "Image not found: $ImagePath"
}

if ($Date -notmatch '^\d{4}-\d{2}-\d{2}$') {
  throw "Date must use yyyy-MM-dd format. Received: $Date"
}

if ($NoEssayLink -and -not [string]::IsNullOrWhiteSpace($EssayPath)) {
  throw 'Use either -EssayPath or -NoEssayLink, not both.'
}

$resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path $Root).Path)
$resolvedImagePath = [System.IO.Path]::GetFullPath((Resolve-Path $ImagePath).Path)
$defaultEssayPath = $null
if (-not $NoEssayLink -and [string]::IsNullOrWhiteSpace($EssayPath)) {
  $defaultEssayPath = Get-LatestEssayPath -Root $resolvedRoot
}

$resolvedEssayPath = $null
if (-not [string]::IsNullOrWhiteSpace($EssayPath)) {
  $resolvedEssayPath = Normalize-EssayPath -Value $EssayPath
}

$slug = ConvertTo-Slug $Title
$targetRelativePath = "static\images\editorial\$slug.png"
$targetPath = Join-Path $resolvedRoot $targetRelativePath
$targetDirectory = Split-Path -Parent $targetPath

if (-not (Test-Path -LiteralPath $targetDirectory -PathType Container)) {
  New-Item -Path $targetDirectory -ItemType Directory -Force | Out-Null
}

Copy-Item -LiteralPath $resolvedImagePath -Destination $targetPath -Force

Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($targetPath)
try {
  $width = $image.Width
  $height = $image.Height
}
finally {
  $image.Dispose()
}

$dataPath = Join-Path $resolvedRoot 'data\editorial_cartoons.yaml'
$data = Read-CartoonData -Path $dataPath
$cartoons = @()
$updated = $false

foreach ($cartoon in @($data.cartoons)) {
  if ($cartoon.slug -eq $slug) {
    $updatedCartoon = [ordered]@{}
    foreach ($property in $cartoon.GetEnumerator()) {
      $updatedCartoon[$property.Key] = $property.Value
    }

    $updatedCartoon.slug = $slug
    $updatedCartoon.title = $Title
    $updatedCartoon.date = $Date
    $updatedCartoon.image = "/images/editorial/$slug.png"
    $updatedCartoon.alt = $Alt
    $updatedCartoon.width = $width
    $updatedCartoon.height = $height

    if ($NoEssayLink) {
      if ($updatedCartoon.Contains('essay')) {
        $updatedCartoon.Remove('essay')
      }
    } elseif ($resolvedEssayPath) {
      $updatedCartoon.essay = $resolvedEssayPath
    }

    $cartoons += $updatedCartoon
    $updated = $true
  } else {
    $cartoons += $cartoon
  }
}

if (-not $updated) {
  $newCartoon = [ordered]@{
    slug = $slug
    title = $Title
    date = $Date
    image = "/images/editorial/$slug.png"
    alt = $Alt
    width = $width
    height = $height
  }

  if (-not $NoEssayLink) {
    $newCartoon.essay = if ($resolvedEssayPath) { $resolvedEssayPath } else { $defaultEssayPath }
  }

  $cartoons += $newCartoon
}

Write-CartoonData -Path $dataPath -Current $slug -Cartoons @($cartoons)

Write-Host "Updated front page cartoon: $Title"
Write-Host "Image: $targetRelativePath"
Write-Host "Data: data\editorial_cartoons.yaml"
