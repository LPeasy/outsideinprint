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

Ensure-Directory -Path $bootstrapRoot

$bootstrapAssets = @(
  @{
    AssetName = "PowerShell-7.5.0-win-x64.zip"
    LocalSource = (Join-Path $repoRoot ".tools\PowerShell-7.5.0-win-x64.zip")
    Url = "https://github.com/PowerShell/PowerShell/releases/download/v7.5.0/PowerShell-7.5.0-win-x64.zip"
  },
  @{
    AssetName = "hugo_extended_0.157.0_windows-amd64.zip"
    LocalSource = (Join-Path $repoRoot ".tools\hugo_extended_0.157.0_windows-amd64.zip")
    Url = "https://github.com/gohugoio/hugo/releases/download/v0.157.0/hugo_extended_0.157.0_windows-amd64.zip"
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
}

Write-Host ""
Write-Host "Bootstrap assets ready:" -ForegroundColor Cyan
Get-ChildItem -LiteralPath $bootstrapRoot -File | Sort-Object Name | ForEach-Object {
  Write-Host ("  {0}" -f $_.FullName)
}
