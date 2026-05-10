param(
  [datetime]$IssueDate = (Get-Date).Date,
  [int]$MaxOnThisDay = 5,
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$CacheDir = '',
  [switch]$RefreshCache,
  [switch]$ReviewOnly,
  [string]$ReviewDir = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$params = @{
  IssueDate = $IssueDate
  MaxOnThisDay = $MaxOnThisDay
  Modules = @('on-this-day')
  Root = $Root
}
if ($CacheDir) { $params.CacheDir = $CacheDir }
if ($RefreshCache) { $params.RefreshCache = $true }
if ($ReviewOnly) { $params.ReviewOnly = $true }
if ($ReviewDir) { $params.ReviewDir = $ReviewDir }

& (Join-Path $PSScriptRoot 'update_almanack_modules.ps1') @params
if (-not $?) { exit 1 }
exit 0
