param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) ".dashboard-public-browser"),
  [string]$AnalyticsDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "data/analytics"),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) ".tmp-dashboard-browser-smoke"),
  [string]$BrowserPath,
  [string]$ProfileRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

. (Join-Path (Split-Path -Parent $PSScriptRoot) "scripts/dashboard_process_tools.ps1")

if ([string]::IsNullOrWhiteSpace($ProfileRoot)) {
  $ProfileRoot = New-DashboardScratchPath -Prefix "oip-dashboard-browser"
}

function Invoke-BrowserCapture {
  param(
    [string]$BrowserPath,
    [string]$UserDataDir,
    [string]$TargetUrl,
    [string]$WindowSize,
    [string]$ShotPath,
    [switch]$DumpDom
  )

  if (Test-Path $UserDataDir) {
    Remove-Item -Recurse -Force $UserDataDir
  }
  $userDataParent = Split-Path -Parent $UserDataDir
  if ($userDataParent -and -not (Test-Path $userDataParent)) {
    New-Item -ItemType Directory -Path $userDataParent -Force | Out-Null
  }

  $args = @(
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-crash-reporter",
    "--disable-breakpad",
    "--allow-file-access-from-files",
    "--user-data-dir=$UserDataDir",
    "--virtual-time-budget=15000",
    "--window-size=$WindowSize"
  )

  if ($DumpDom) {
    $args += "--dump-dom"
  }
  else {
    $args += "--screenshot=$ShotPath"
  }

  $args += $TargetUrl
  $result = Invoke-CapturedProcess -FilePath $BrowserPath -ArgumentList $args
  $stdout = [string]$result.StdOut
  $stderr = [string]$result.StdErr

  if ($result.ExitCode -ne 0) {
    $details = @(
      "Browser smoke capture failed for $TargetUrl.",
      "Browser: $BrowserPath",
      "User data dir: $UserDataDir",
      "Exit code: $($result.ExitCode)"
    )
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
      $details += "stderr: $($stderr.Trim())"
    }
    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
      $details += "stdout: $($stdout.Trim())"
    }
    throw ($details -join " ")
  }

  if (-not $DumpDom -and -not (Test-Path $ShotPath)) {
    throw "Expected screenshot was not created for $TargetUrl."
  }

  return $stdout
}

if (-not (Test-Path $SiteDir)) {
  throw "Built dashboard site directory was not found: $SiteDir"
}

$browserResolution = Resolve-DashboardBrowserPath -PreferredPath $BrowserPath
if (-not $browserResolution.Found) {
  throw ("No Edge/Chrome browser was found for dashboard browser smoke tests. Checked: {0}" -f ($browserResolution.CheckedPaths -join "; "))
}
$browserPath = $browserResolution.Path
Write-Host "Using browser: $browserPath"

$overview = Get-Content (Join-Path $AnalyticsDir "overview.json") -Raw | ConvertFrom-Json
$sections = Get-Content (Join-Path $AnalyticsDir "sections.json") -Raw | ConvertFrom-Json
$essays = Get-Content (Join-Path $AnalyticsDir "essays.json") -Raw | ConvertFrom-Json

$expectedPageviews = [int][double]$overview.pageviews
$sectionRows = @($sections)
$essayRows = @($essays)
$selectedSection = if ($sectionRows.Count -gt 1) { [string]$sectionRows[1].section } elseif ($sectionRows.Count -gt 0) { [string]$sectionRows[0].section } else { "" }
$selectedEssayRow = @($essayRows | Where-Object { $_.section -eq $selectedSection } | Select-Object -First 1)
if ($selectedEssayRow.Count -eq 0) {
  $selectedEssayRow = @($essayRows | Select-Object -First 1)
}
$selectedEssay = if ($selectedEssayRow.Count -gt 0) { [string]$selectedEssayRow[0].path } else { "" }

if (Test-Path $OutputDir) {
  Remove-Item -Recurse -Force $OutputDir
}
New-Item -ItemType Directory -Path $OutputDir | Out-Null

$screensDir = Join-Path $OutputDir "screenshots"
New-Item -ItemType Directory -Path $screensDir | Out-Null

try {
  if (Test-Path $ProfileRoot) {
    Remove-Item -Recurse -Force $ProfileRoot
  }
  New-Item -ItemType Directory -Path $ProfileRoot | Out-Null

  $indexUri = [System.Uri]::new((Resolve-Path (Join-Path $SiteDir "index.html")).Path)
  $baseUrl = $indexUri.AbsoluteUri
  $drilldownUrl = if ($selectedSection -and $selectedEssay) {
    $baseUrl + "?selectedSection=$([System.Uri]::EscapeDataString([string]$selectedSection))&selectedEssay=$([System.Uri]::EscapeDataString([string]$selectedEssay))"
  } else {
    $baseUrl
  }

  $dom = Invoke-BrowserCapture -BrowserPath $browserPath -UserDataDir (Join-Path $ProfileRoot "profile-dom") -TargetUrl $drilldownUrl -WindowSize "1440,2200" -DumpDom
  $dom | Set-Content -Path (Join-Path $OutputDir "dashboard-dom.html")

  Invoke-BrowserCapture -BrowserPath $browserPath -UserDataDir (Join-Path $ProfileRoot "profile-desktop") -TargetUrl $baseUrl -WindowSize "1440,2200" -ShotPath (Join-Path $screensDir "desktop.png") | Out-Null
  Invoke-BrowserCapture -BrowserPath $browserPath -UserDataDir (Join-Path $ProfileRoot "profile-mobile") -TargetUrl $baseUrl -WindowSize "390,1200" -ShotPath (Join-Path $screensDir "mobile.png") | Out-Null

  if ($dom -notmatch 'data-dashboard-shell') {
    throw "Hydrated dashboard DOM is missing data-dashboard-shell."
  }

  if ($dom -notmatch 'dashboard-kpi__delta') {
    throw "Hydrated dashboard DOM is missing KPI delta markup."
  }

  $pageviewsPattern = 'dashboard-kpi__label">Pageviews</p>\s*<p class="dashboard-kpi__value">' + $expectedPageviews + '<'
  if ($expectedPageviews -gt 0 -and $dom -notmatch $pageviewsPattern) {
    throw "Hydrated dashboard DOM does not show the expected nonzero pageviews KPI ($expectedPageviews)."
  }

  if ($selectedSection -and $dom -notmatch [regex]::Escape("<h3>$selectedSection</h3>")) {
    throw "Hydrated dashboard DOM does not reflect the selected section drill-down state."
  }

  if ($selectedEssay) {
    $essayTitle = @($essays | Where-Object { $_.path -eq $selectedEssay } | Select-Object -First 1)[0].title
    if ($essayTitle -and $dom -notmatch [regex]::Escape($essayTitle)) {
      throw "Hydrated dashboard DOM does not reflect the selected essay drill-down state."
    }
  }
}
finally {
  if (Test-Path $ProfileRoot) {
    Remove-Item -Recurse -Force $ProfileRoot -ErrorAction SilentlyContinue
  }
}

Write-Host "Dashboard browser smoke test passed."
