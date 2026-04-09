param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "public")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot 'helpers/public_output_common.ps1')

$repoRoot = Split-Path -Parent $PSScriptRoot

function Show-RouteTree {
  param([string]$RelativePath)

  $fullPath = Join-Path $SiteDir $RelativePath
  if (-not (Test-Path -LiteralPath $fullPath)) {
    Write-Host ("[missing] {0}" -f $RelativePath)
    return
  }

  Write-Host ("[present] {0}" -f $RelativePath)
  foreach ($entry in @(Get-ChildItem -Path $fullPath -Recurse -Force | Sort-Object FullName)) {
    Write-Host ("  {0}" -f (Get-RepoRelativePath -RepoRoot $repoRoot -Path $entry.FullName))
  }
}

Write-Host ("public/authors/index.html exists: {0}" -f (Test-Path -LiteralPath (Join-Path $SiteDir 'authors/index.html') -PathType Leaf))
Write-Host ("public/.oip-build-manifest.json exists: {0}" -f (Test-Path -LiteralPath (Join-Path $SiteDir '.oip-build-manifest.json') -PathType Leaf))

foreach ($route in @('authors', 'about', 'random')) {
  Show-RouteTree -RelativePath $route
}
