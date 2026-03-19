param(
  [switch]$Strict,
  [switch]$SkipNode,
  [switch]$SkipBrowserSmoke,
  [switch]$SkipPublicBuild,
  [switch]$SkipDashboardBuild,
  [string]$BrowserPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$failures = @()
$skipped = @()

. (Join-Path $repoRoot "scripts/dashboard_process_tools.ps1")

function Test-ExternalCommand {
  param([string]$Command)

  return ($null -ne (Get-Command $Command -ErrorAction SilentlyContinue | Select-Object -First 1))
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
    if (Test-ExternalCommand -Command "node") {
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
    if (Test-ExternalCommand -Command "hugo") {
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
    if (Test-ExternalCommand -Command "hugo") {
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
    $hasHugo = Test-ExternalCommand -Command "hugo"
    $browserResolution = Resolve-DashboardBrowserPath -PreferredPath $BrowserPath
    $browserLaunch = $null

    if ($browserResolution.Found) {
      $browserLaunch = Test-DashboardBrowserHeadlessLaunch -BrowserPath $browserResolution.Path
    }

    if ($browserResolution.Found -and $browserLaunch.Success -and $hasHugo) {
      Invoke-Step -Name "Browser smoke build" -Action {
        $baseUrl = ([System.Uri]((Resolve-Path $repoRoot).Path + [System.IO.Path]::DirectorySeparatorChar + ".dashboard-public-browser" + [System.IO.Path]::DirectorySeparatorChar)).AbsoluteUri
        hugo --config hugo-dashboard.toml --gc --minify --baseURL $baseUrl --destination .dashboard-public-browser
      }
      Invoke-Step -Name "Browser smoke" -Action { & (Join-Path $repoRoot "tests/test_dashboard_browser_smoke.ps1") -BrowserPath $browserResolution.Path }
    }
    elseif ($Strict) {
      $requirements = @()
      if (-not $hasHugo) {
        $requirements += "hugo"
      }
      if (-not $browserResolution.Found) {
        $requirements += ("Edge/Chrome browser (checked: {0})" -f ($browserResolution.CheckedPaths -join "; "))
      }
      elseif (-not $browserLaunch.Success) {
        $requirements += ("a working headless browser launch for {0} (exit code {1}; user data dir {2})" -f $browserResolution.Path, $browserLaunch.ExitCode, $browserLaunch.UserDataDir)
      }
      throw ("Browser smoke requires {0}." -f ($requirements -join " and "))
    }
    else {
      $reasons = @()
      if (-not $hasHugo) {
        $reasons += "hugo is not installed"
      }
      if (-not $browserResolution.Found) {
        $reasons += ("no supported browser was found (checked: {0})" -f ($browserResolution.CheckedPaths -join "; "))
      }
      elseif (-not $browserLaunch.Success) {
        $stderrSummary = if ([string]::IsNullOrWhiteSpace($browserLaunch.StdErr)) { "no stderr output" } else { ($browserLaunch.StdErr -split "`r?`n" | Where-Object { $_ } | Select-Object -First 1) }
        $reasons += ("the detected browser could not complete a headless launch probe (browser: {0}; exit code: {1}; user data dir: {2}; stderr: {3})" -f $browserResolution.Path, $browserLaunch.ExitCode, $browserLaunch.UserDataDir, $stderrSummary)
      }
      $skipped += ("Browser smoke skipped because {0}." -f ($reasons -join " and "))
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
