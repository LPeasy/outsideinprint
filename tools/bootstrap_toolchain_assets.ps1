Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$bootstrapRoot = Join-Path $PSScriptRoot "_downloads\bootstrap"
$legacyPythonPath = Join-Path $repoRoot ".tools\python\python.exe"

function Ensure-Directory {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    $null = New-Item -ItemType Directory -Path $Path -Force
  }
}

function Copy-BootstrapAsset {
  param(
    [string]$SourcePath,
    [string]$AssetName
  )

  if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    return $false
  }

  $destinationPath = Join-Path $bootstrapRoot $AssetName
  Copy-Item -LiteralPath $SourcePath -Destination $destinationPath -Force
  Write-Host ("Staged local asset: {0}" -f $destinationPath)
  return $true
}

function Download-BootstrapAsset {
  param(
    [string]$Url,
    [string]$AssetName
  )

  $destinationPath = Join-Path $bootstrapRoot $AssetName
  if (Test-Path -LiteralPath $destinationPath -PathType Leaf) {
    Write-Host ("Bootstrap asset already present: {0}" -f $destinationPath)
    return
  }

  if (-not (Test-Path -LiteralPath $legacyPythonPath -PathType Leaf)) {
    throw "Legacy bootstrap Python not found at $legacyPythonPath. Cannot download $AssetName."
  }

  $pythonScript = @'
import pathlib
import ssl
import sys
import urllib.request

url = sys.argv[1]
destination = pathlib.Path(sys.argv[2])
destination.parent.mkdir(parents=True, exist_ok=True)

context = ssl._create_unverified_context()
with urllib.request.urlopen(url, context=context, timeout=120) as response:
    with destination.open("wb") as handle:
        handle.write(response.read())
'@

  $pythonScript | & $legacyPythonPath - $Url $destinationPath
  if (-not (Test-Path -LiteralPath $destinationPath -PathType Leaf)) {
    throw "Failed to download bootstrap asset: $destinationPath"
  }

  Write-Host ("Downloaded asset: {0}" -f $destinationPath)
}

function Assert-BootstrapAssetHash {
  param(
    [string]$AssetName,
    [string]$ExpectedSha256
  )

  if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
    return
  }

  $assetPath = Join-Path $bootstrapRoot $AssetName
  $stream = [System.IO.File]::OpenRead($assetPath)
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $hasher.ComputeHash($stream)
  } finally {
    $hasher.Dispose()
    $stream.Dispose()
  }

  $actualSha256 = [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLowerInvariant()
  if ($actualSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
    throw "SHA-256 mismatch for bootstrap asset $AssetName. Expected $ExpectedSha256, got $actualSha256."
  }

  Write-Host ("Verified SHA-256: {0}" -f $assetPath)
}

Ensure-Directory -Path $bootstrapRoot

$bootstrapAssets = @(
  @{
    AssetName = "PowerShell-7.5.0-win-x64.zip"
    LocalSource = (Join-Path $repoRoot ".tools\PowerShell-7.5.0-win-x64.zip")
    Url = "https://github.com/PowerShell/PowerShell/releases/download/v7.5.0/PowerShell-7.5.0-win-x64.zip"
  },
  @{
    AssetName = "hugo_extended_0.164.0_windows-amd64.zip"
    LocalSource = (Join-Path $repoRoot ".tools\hugo_extended_0.164.0_windows-amd64.zip")
    Url = "https://github.com/gohugoio/hugo/releases/download/v0.164.0/hugo_extended_0.164.0_windows-amd64.zip"
    Sha256 = "59109d4e05d0cc9e1743688166e5323a71bd8b67a6e928db07c61720cc49a7cc"
  },
  @{
    AssetName = "node-v20.20.2-win-x64.zip"
    LocalSource = $null
    Url = "https://nodejs.org/dist/v20.20.2/node-v20.20.2-win-x64.zip"
  },
  @{
    AssetName = "python-3.12.9-embed-amd64.zip"
    LocalSource = $null
    Url = "https://www.python.org/ftp/python/3.12.9/python-3.12.9-embed-amd64.zip"
  }
)

foreach ($asset in $bootstrapAssets) {
  $copied = $false
  if (-not [string]::IsNullOrWhiteSpace($asset.LocalSource)) {
    $copied = Copy-BootstrapAsset -SourcePath $asset.LocalSource -AssetName $asset.AssetName
  }

  if (-not $copied) {
    Download-BootstrapAsset -Url $asset.Url -AssetName $asset.AssetName
  }

  $expectedSha256 = if ($asset.ContainsKey("Sha256")) { [string]$asset.Sha256 } else { "" }
  Assert-BootstrapAssetHash -AssetName $asset.AssetName -ExpectedSha256 $expectedSha256
}

Write-Host ""
Write-Host "Bootstrap assets ready:" -ForegroundColor Cyan
Get-ChildItem -LiteralPath $bootstrapRoot -File | Sort-Object Name | ForEach-Object {
  Write-Host ("  {0}" -f $_.FullName)
}
