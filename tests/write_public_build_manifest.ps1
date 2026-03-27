param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot 'helpers/public_output_common.ps1')

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Write-PublicBuildManifest -RepoRoot $repoRoot -SiteDir $SiteDir

Write-Host ("Public build manifest written to {0}" -f $manifestPath)
$global:LASTEXITCODE = 0
exit 0
