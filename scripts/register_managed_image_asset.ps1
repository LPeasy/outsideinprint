#requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$AssetId,
  [Parameter(Mandatory = $true)][string]$AssetSource,
  [Parameter(Mandatory = $true)]
  [ValidateSet('editorial_cartoon', 'essay_illustration', 'essay_photo', 'medium_import')]
  [string]$ImageClass,
  [Parameter(Mandatory = $true)]
  [ValidateSet('drawing', 'photo')]
  [string]$ProcessingHint,
  [string[]]$Aliases = @(),
  [ValidateSet('referenced', 'retained_unreferenced')]
  [string]$UsageState = 'referenced',
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$Replace
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
. (Join-Path $PSScriptRoot 'lib\image_asset_manifest.ps1')

if (-not (Test-Path -LiteralPath $resolvedInput -PathType Leaf)) {
  throw "Managed image input is not a file: $resolvedInput"
}
if (-not (Test-OipImageAssetId -Id $AssetId)) {
  throw "Invalid managed image asset ID: $AssetId"
}

$normalizedSource = $AssetSource.Replace('\', '/').TrimStart('/')
if ($normalizedSource -notmatch '^images/originals/[a-z0-9][a-z0-9._/-]*$' -or $normalizedSource -match '(^|/)\.\.?(/|$)|//') {
  throw "Invalid managed image source path: $AssetSource"
}

$inputExtension = [System.IO.Path]::GetExtension($resolvedInput).ToLowerInvariant()
$sourceExtension = [System.IO.Path]::GetExtension($normalizedSource).ToLowerInvariant()
if ($inputExtension -notin @('.png', '.jpg', '.jpeg') -or $inputExtension -ne $sourceExtension) {
  throw "Managed image input and source must use the same supported extension: input=$inputExtension source=$sourceExtension"
}
Assert-OipManagedImageFile -Path $resolvedInput -ExpectedExtension $inputExtension -Label 'Managed image input' | Out-Null

$manifest = Read-OipImageAssetManifest -Root $Root -AllowMissing
$inputHash = (Get-FileHash -LiteralPath $resolvedInput -Algorithm SHA256).Hash.ToLowerInvariant()
$reviewState = 'pending_review'
if ($manifest.assets.Contains($AssetId)) {
  $existing = $manifest.assets[$AssetId]
  if ([string]$existing.source -ne $normalizedSource) {
    throw "Managed image asset '$AssetId' already uses source '$($existing.source)', not '$normalizedSource'."
  }
  if ([string]$existing.sha256 -ne $inputHash -and -not $Replace) {
    throw "Managed image asset '$AssetId' already exists with different bytes. Use -Replace only after review."
  }
  if ([string]$existing.sha256 -eq $inputHash) {
    $reviewState = [string]$existing.review_state
  }
}

$destination = Join-Path (Join-Path $Root 'assets') $normalizedSource
$destinationDirectory = Split-Path -Parent $destination
if (-not (Test-Path -LiteralPath $destinationDirectory -PathType Container)) {
  New-Item -Path $destinationDirectory -ItemType Directory -Force | Out-Null
}

$copyRequired = $true
if (Test-Path -LiteralPath $destination -PathType Leaf) {
  $destinationHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($destinationHash -eq $inputHash) {
    $copyRequired = $false
  }
  elseif (-not $Replace) {
    throw "Managed image destination already exists with different bytes: $destination"
  }
}

if ($copyRequired) {
  $tempPath = Join-Path $destinationDirectory ('.managed-image.' + [guid]::NewGuid().ToString('N') + $sourceExtension)
  try {
    [System.IO.File]::Copy($resolvedInput, $tempPath, $true)
    [System.IO.File]::Move($tempPath, $destination, $true)
  }
  finally {
    if (Test-Path -LiteralPath $tempPath -PathType Leaf) {
      Remove-Item -LiteralPath $tempPath -Force
    }
  }
}

Register-OipImageAsset `
  -Root $Root `
  -Id $AssetId `
  -Source $normalizedSource `
  -ImageClass $ImageClass `
  -ProcessingHint $ProcessingHint `
  -ReviewState $reviewState `
  -UsageState $UsageState `
  -ProcessingState 'derivative_capable' `
  -Aliases $Aliases | Out-Null

$registered = Read-OipImageAssetManifest -Root $Root
$entry = $registered.assets[$AssetId]
[pscustomobject]@{
  id = $AssetId
  source = [string]$entry.source
  sha256 = [string]$entry.sha256
  width = [int]$entry.width
  height = [int]$entry.height
  review_state = [string]$entry.review_state
  usage_state = [string]$entry.usage_state
  processing_state = [string]$entry.processing_state
}
