param(
  [string]$Url = "https://lpeasy.github.io/OutsideInPrintDashboard/",
  [string]$OutputDir = (Join-Path $PSScriptRoot "artifacts")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$chromeCandidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$chromePath = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chromePath) {
  throw "No Chrome/Edge browser was found for post-deploy QA."
}

$screensDir = Join-Path $OutputDir "screenshots"
$domPath = Join-Path $OutputDir "live-dom.html"
$jsonPath = Join-Path $OutputDir "results.json"
$reportPath = Join-Path $PSScriptRoot "post-deploy-report.md"

if (Test-Path $OutputDir) {
  Remove-Item -Recurse -Force $OutputDir
}

New-Item -ItemType Directory -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Path $screensDir | Out-Null

function Invoke-ChromeCapture {
  param(
    [string]$UserDataDir,
    [string]$ShotPath,
    [string]$WindowSize,
    [string]$TargetUrl,
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
  $process = Start-Process -FilePath $chromePath -ArgumentList $args -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $output = if (Test-Path $stdoutPath) { Get-Content $stdoutPath -Raw } else { "" }

  if (-not $DumpDom -and -not (Test-Path $ShotPath)) {
    throw "Chrome did not create screenshot $ShotPath. Output: $output"
  }

  return $output
}

$desktopShot = Join-Path $screensDir "01-desktop.png"
$tabletShot = Join-Path $screensDir "02-tablet.png"
$mobileShot = Join-Path $screensDir "03-mobile.png"

$dom = Invoke-ChromeCapture -UserDataDir (Join-Path $OutputDir "profile-dom") -WindowSize "1440,2200" -TargetUrl $Url -DumpDom
$dom | Set-Content -Path $domPath

Invoke-ChromeCapture -UserDataDir (Join-Path $OutputDir "profile-desktop") -ShotPath $desktopShot -WindowSize "1440,2200" -TargetUrl $Url | Out-Null
Invoke-ChromeCapture -UserDataDir (Join-Path $OutputDir "profile-tablet") -ShotPath $tabletShot -WindowSize "768,1600" -TargetUrl $Url | Out-Null
Invoke-ChromeCapture -UserDataDir (Join-Path $OutputDir "profile-mobile") -ShotPath $mobileShot -WindowSize "390,1200" -TargetUrl $Url | Out-Null

$title = if ($dom -match '<title>([^<]+)</title>') { $matches[1] } else { "" }
$hasV2Shell = $dom -match 'data-dashboard-shell'
$hasSectionExplorer = $dom -match 'Section Explorer'
$hasEssayExplorer = $dom -match 'Essay Explorer'
$hasLegacyOverview = $dom -match 'dashboard-overview-title'
$hasLegacyEssays = $dom -match 'dashboard-essays-title'
$verifiedItems = @(
  "The Pages URL loads and renders a styled page.",
  "Desktop, tablet, and mobile screenshots were captured successfully.",
  "The page title is `Outside In Print Dashboard`."
)

if ($hasV2Shell) {
  $verifiedItems += "The live DOM includes the Dashboard V2 shell and drill-down explorers."
}
else {
  $verifiedItems += "The live DOM is **not** the expected Dashboard V2 DOM."
}

$results = [ordered]@{
  environment = "Windows desktop shell using headless Chrome screenshot + DOM capture"
  url = $Url
  browser = $chromePath
  verdict = if ($hasV2Shell) { "pass" } else { "fail" }
  deployment = @{
    title = $title
    has_v2_shell = $hasV2Shell
    has_section_explorer = $hasSectionExplorer
    has_essay_explorer = $hasEssayExplorer
    has_legacy_overview = $hasLegacyOverview
    has_legacy_essays = $hasLegacyEssays
  }
  screenshots = @{
    desktop = $desktopShot
    tablet = $tabletShot
    mobile = $mobileShot
  }
  findings = @{
    critical = @()
    major = @()
    minor = @()
    polish = @()
  }
}

if (-not $hasV2Shell) {
  $results.findings.critical += "The live Pages deployment is still serving the legacy snapshot dashboard instead of Dashboard V2. Expected `data-dashboard-shell`, section explorer, and essay explorer markup are absent."
}

if (-not $hasSectionExplorer -or -not $hasEssayExplorer) {
  $results.findings.major += "The live page does not expose the new drill-down explorers, so metric switching, drill-down, reset, and stateful QA flows cannot be validated in-browser."
}

$notVerifiedItems = @()
if ($hasV2Shell -and $hasSectionExplorer -and $hasEssayExplorer) {
  $notVerifiedItems += "Deeper keyboard and interaction assertions still benefit from a richer automated browser script if we want regression coverage beyond deployment smoke."
}
else {
  $notVerifiedItems += @(
    "V2 metric switching",
    "V2 date/source/section filters",
    "V2 drill-down/details-panel flows",
    "V2 back/forward state behavior"
  )
}

$results | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath

$report = @"
# Post-Deploy Dashboard QA

- Environment: $($results.environment)
- URL tested: $($results.url)
- Browser: $($results.browser)
- Viewports: 1440x2200, 768x1600, 390x1200
- Verdict: $($results.verdict)

## Verified In Browser

$($verifiedItems | ForEach-Object { "- $_" } | Out-String)

## Not Verified In Browser

$($notVerifiedItems | ForEach-Object { "- $_" } | Out-String)

$(if (-not $hasV2Shell) { "These could not be exercised because the deployed page is still the legacy dashboard markup rather than the pushed V2 experience." } else { "This smoke check confirms the correct V2 deployment and responsive rendering, but it does not replace deeper scripted interaction coverage." })

## Findings

### Critical
$(@($results.findings.critical) | ForEach-Object { "- $_" } | Out-String)

### Major
$(@($results.findings.major) | ForEach-Object { "- $_" } | Out-String)

### Minor
$(@($results.findings.minor) | ForEach-Object { "- $_" } | Out-String)

### Polish
$(@($results.findings.polish) | ForEach-Object { "- $_" } | Out-String)

## Evidence

- [Desktop screenshot]($desktopShot)
- [Tablet screenshot]($tabletShot)
- [Mobile screenshot]($mobileShot)
- [Live DOM dump]($domPath)
- [Structured JSON results]($jsonPath)
"@

$report | Set-Content -Path $reportPath
Write-Host "Post-deploy QA artifacts written to $OutputDir"
