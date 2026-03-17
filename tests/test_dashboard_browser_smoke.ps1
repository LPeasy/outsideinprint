param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) ".dashboard-public-browser"),
  [string]$AnalyticsDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "data/analytics"),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) ".tmp-dashboard-browser-smoke")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Get-BrowserPath {
  $candidates = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  )

  return $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
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
  New-Item -ItemType Directory -Path $UserDataDir | Out-Null

  $args = @(
    "--headless=new",
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
  $stdoutPath = Join-Path $UserDataDir "stdout.txt"
  $stderrPath = Join-Path $UserDataDir "stderr.txt"
  $process = Start-Process -FilePath $BrowserPath -ArgumentList $args -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $stdout = if (Test-Path $stdoutPath) { Get-Content $stdoutPath -Raw } else { "" }
  $stderr = if (Test-Path $stderrPath) { Get-Content $stderrPath -Raw } else { "" }

  if ($process.ExitCode -ne 0) {
    throw "Browser smoke capture failed for $TargetUrl. $stderr"
  }

  if (-not $DumpDom -and -not (Test-Path $ShotPath)) {
    throw "Expected screenshot was not created for $TargetUrl."
  }

  return $stdout
}

if (-not (Test-Path $SiteDir)) {
  throw "Built dashboard site directory was not found: $SiteDir"
}

$browserPath = Get-BrowserPath
if (-not $browserPath) {
  throw "No Edge/Chrome browser was found for dashboard browser smoke tests."
}

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

$indexUri = [System.Uri]::new((Resolve-Path (Join-Path $SiteDir "index.html")).Path)
$baseUrl = $indexUri.AbsoluteUri
$drilldownUrl = if ($selectedSection -and $selectedEssay) {
  $baseUrl + "?selectedSection=$([System.Uri]::EscapeDataString([string]$selectedSection))&selectedEssay=$([System.Uri]::EscapeDataString([string]$selectedEssay))"
} else {
  $baseUrl
}

$dom = Invoke-BrowserCapture -BrowserPath $browserPath -UserDataDir (Join-Path $OutputDir "profile-dom") -TargetUrl $drilldownUrl -WindowSize "1440,2200" -DumpDom
$dom | Set-Content -Path (Join-Path $OutputDir "dashboard-dom.html")

Invoke-BrowserCapture -BrowserPath $browserPath -UserDataDir (Join-Path $OutputDir "profile-desktop") -TargetUrl $baseUrl -WindowSize "1440,2200" -ShotPath (Join-Path $screensDir "desktop.png") | Out-Null
Invoke-BrowserCapture -BrowserPath $browserPath -UserDataDir (Join-Path $OutputDir "profile-mobile") -TargetUrl $baseUrl -WindowSize "390,1200" -ShotPath (Join-Path $screensDir "mobile.png") | Out-Null

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

Write-Host "Dashboard browser smoke test passed."
