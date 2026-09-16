#requires -Version 7.0
[CmdletBinding()]
param(
  [string]$HugoPath = 'hugo'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$hugoCommand = Get-Command $HugoPath -ErrorAction Stop
$resolvedHugoPath = [string]$hugoCommand.Source
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("oip-2045-launch-window-{0}" -f [Guid]::NewGuid().ToString('N'))
$cases = @(
  @{ Name = 'before-expiry'; Clock = '2026-09-26T23:59:59-04:00' },
  @{ Name = 'at-expiry'; Clock = '2026-09-27T00:00:00-04:00' }
)

New-Item -ItemType Directory -Path $tempRoot | Out-Null
Push-Location $repoRoot
try {
  foreach ($case in $cases) {
    $destination = Join-Path $tempRoot $case.Name
    & $resolvedHugoPath `
      --clock $case.Clock `
      --environment production `
      --minify `
      --panicOnWarning `
      --quiet `
      --destination $destination
    if ($LASTEXITCODE -ne 0) {
      throw "Hugo failed while testing the 2045 launch window at $($case.Clock)."
    }

    $homePath = Join-Path $destination 'index.html'
    if (-not (Test-Path -LiteralPath $homePath -PathType Leaf)) {
      throw "Hugo did not render the homepage for the 2045 launch-window case '$($case.Name)'."
    }
    $homeHtml = Get-Content -LiteralPath $homePath -Raw -Encoding utf8
    $promotionCount = [regex]::Matches(
      $homeHtml,
      '\bdata-home-2045-launch(?:[=\s>])|homepage_2045_launch_(?:headline|sample|buy)|href="?(?:https://outsideinprint\.org)?/shop/2045/',
      'IgnoreCase'
    ).Count
    if ($promotionCount -ne 0) {
      throw "The Coleman V2 homepage exposed $promotionCount 2045 launch strips at $($case.Clock); expected none."
    }
  }
}
finally {
  Pop-Location
  if (Test-Path -LiteralPath $tempRoot -PathType Container) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

Write-Host '2045 homepage-exclusion clock-boundary contract passed.'
