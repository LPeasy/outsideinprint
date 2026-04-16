param(
  [Parameter(Mandatory = $true)]
  [string]$ImagePath,

  [Parameter(Mandatory = $true)]
  [string]$Title,

  [Parameter(Mandatory = $true)]
  [string]$Alt,

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

  $lines = @()
  $lines += "current: $Current"
  $lines += 'cartoons:'

  foreach ($cartoon in $Cartoons) {
    $lines += "  - slug: $($cartoon.slug)"
    $lines += "    title: $(Quote-YamlValue $cartoon.title)"
    $lines += "    date: $(Quote-YamlValue $cartoon.date)"
    $lines += "    image: $(Quote-YamlValue $cartoon.image)"
    $lines += "    alt: $(Quote-YamlValue $cartoon.alt)"
    $lines += "    width: $($cartoon.width)"
    $lines += "    height: $($cartoon.height)"
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

$resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path $Root).Path)
$resolvedImagePath = [System.IO.Path]::GetFullPath((Resolve-Path $ImagePath).Path)
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
    $cartoons += [ordered]@{
      slug = $slug
      title = $Title
      date = $Date
      image = "/images/editorial/$slug.png"
      alt = $Alt
      width = $width
      height = $height
    }
    $updated = $true
  } else {
    $cartoons += $cartoon
  }
}

if (-not $updated) {
  $cartoons += [ordered]@{
    slug = $slug
    title = $Title
    date = $Date
    image = "/images/editorial/$slug.png"
    alt = $Alt
    width = $width
    height = $height
  }
}

Write-CartoonData -Path $dataPath -Current $slug -Cartoons @($cartoons)

Write-Host "Updated front page cartoon: $Title"
Write-Host "Image: $targetRelativePath"
Write-Host "Data: data\editorial_cartoons.yaml"
