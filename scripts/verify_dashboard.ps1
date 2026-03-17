param(
  [switch]$Strict,
  [switch]$SkipNode,
  [switch]$SkipBrowserSmoke,
  [switch]$SkipPublicBuild,
  [switch]$SkipDashboardBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$failures = @()
$skipped = @()

function Test-ExternalCommand {
  param(
    [string]$Command,
    [string[]]$Arguments = @()
  )

  try {
    & $Command @Arguments *> $null
    return $true
  }
  catch {
    return $false
  }
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name"
  & $Action
}

try {
  Invoke-Step -Name "Analytics importer contract" -Action { & (Join-Path $repoRoot "tests/test_analytics_import.ps1") }
  Invoke-Step -Name "Committed snapshot contract" -Action { & (Join-Path $repoRoot "tests/test_analytics_snapshot_contract.ps1") }

  if (-not $SkipNode) {
    if (Test-ExternalCommand -Command "node" -Arguments @("--version")) {
      Invoke-Step -Name "Node dashboard tests" -Action { node --test tests/*.test.mjs }
    }
    elseif ($Strict) {
      throw "node is required for the Node dashboard test suite."
    }
    else {
      $skipped += "Node dashboard tests skipped because node is not installed."
    }
  }

  if (-not $SkipDashboardBuild) {
    if (Test-ExternalCommand -Command "hugo" -Arguments @("version")) {
      Invoke-Step -Name "Dashboard build smoke" -Action { & (Join-Path $repoRoot "tests/test_dashboard_build.ps1") }
      Invoke-Step -Name "Dashboard Hugo build" -Action { hugo --config hugo-dashboard.toml --gc --minify --destination .dashboard-public }
    }
    elseif ($Strict) {
      throw "hugo is required for dashboard build verification."
    }
    else {
      $skipped += "Dashboard build smoke and Hugo build skipped because hugo is not installed."
    }
  }

  if (-not $SkipPublicBuild) {
    if (Test-ExternalCommand -Command "hugo" -Arguments @("version")) {
      Invoke-Step -Name "Public Hugo build" -Action { hugo --minify --baseURL "https://lpeasy.github.io/outsideinprint/" }
    }
    elseif ($Strict) {
      throw "hugo is required for the public site build."
    }
    else {
      $skipped += "Public Hugo build skipped because hugo is not installed."
    }
  }

  if (-not $SkipBrowserSmoke) {
    $hasBrowser = (Test-Path "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe") -or (Test-Path "C:\Program Files\Microsoft\Edge\Application\msedge.exe") -or (Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe") -or (Test-Path "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")

    if ($hasBrowser -and (Test-ExternalCommand -Command "hugo" -Arguments @("version"))) {
      Invoke-Step -Name "Browser smoke build" -Action {
        $baseUrl = ([System.Uri]((Resolve-Path $repoRoot).Path + [System.IO.Path]::DirectorySeparatorChar + ".dashboard-public-browser" + [System.IO.Path]::DirectorySeparatorChar)).AbsoluteUri
        hugo --config hugo-dashboard.toml --gc --minify --baseURL $baseUrl --destination .dashboard-public-browser
      }
      Invoke-Step -Name "Browser smoke" -Action { & (Join-Path $repoRoot "tests/test_dashboard_browser_smoke.ps1") }
    }
    elseif ($Strict) {
      throw "Browser smoke requires hugo and Chrome/Edge."
    }
    else {
      $skipped += "Browser smoke skipped because hugo or a supported browser is missing."
    }
  }
}
catch {
  $failures += $_.Exception.Message
}

if ($skipped.Count -gt 0) {
  Write-Host ""
  Write-Host "Skipped checks:"
  $skipped | ForEach-Object { Write-Host "- $_" }
}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Verification failed:"
  $failures | ForEach-Object { Write-Host "- $_" }
  exit 1
}

Write-Host ""
Write-Host "Dashboard verification completed successfully."
