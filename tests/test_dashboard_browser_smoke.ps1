param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) ".dashboard-public-browser"),
  [string]$AnalyticsDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "data/analytics"),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) ".tmp-dashboard-browser-smoke"),
  [string]$BrowserPath,
  [string]$ProfileRoot,
  [string]$BaseUrl = "http://127.0.0.1:41713/"
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

function Start-StaticSiteServer {
  param(
    [string]$RootPath,
    [string]$Prefix
  )

  $job = Start-Job -ScriptBlock {
    param($InnerRootPath, $InnerPrefix)

    Set-StrictMode -Version Latest
    $ErrorActionPreference = "Stop"

    function Get-InnerContentType {
      param([string]$InnerPath)

      switch ([System.IO.Path]::GetExtension($InnerPath).ToLowerInvariant()) {
        ".css" { return "text/css; charset=utf-8" }
        ".js" { return "application/javascript; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".svg" { return "image/svg+xml" }
        ".png" { return "image/png" }
        ".jpg" { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".ico" { return "image/x-icon" }
        ".txt" { return "text/plain; charset=utf-8" }
        default { return "text/html; charset=utf-8" }
      }
    }

    $listener = [System.Net.HttpListener]::new()
    $listener.Prefixes.Add($InnerPrefix)
    $listener.Start()

    try {
      while ($listener.IsListening) {
        $context = $listener.GetContext()
        $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)

        if ($requestPath -eq "/__shutdown__") {
          $context.Response.StatusCode = 204
          $context.Response.Close()
          break
        }

        $relativePath = $requestPath.TrimStart("/")
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
          $relativePath = "index.html"
        }

        $localPath = Join-Path $InnerRootPath ($relativePath -replace "/", [System.IO.Path]::DirectorySeparatorChar)
        if (Test-Path $localPath -PathType Container) {
          $localPath = Join-Path $localPath "index.html"
        }

        if (-not (Test-Path $localPath -PathType Leaf)) {
          $context.Response.StatusCode = 404
          $context.Response.Close()
          continue
        }

        $bytes = [System.IO.File]::ReadAllBytes($localPath)
        $context.Response.ContentType = Get-InnerContentType -InnerPath $localPath
        $context.Response.ContentLength64 = $bytes.Length
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $context.Response.OutputStream.Close()
        $context.Response.Close()
      }
    }
    finally {
      if ($listener.IsListening) {
        $listener.Stop()
      }
      $listener.Close()
    }
  } -ArgumentList $RootPath, $Prefix

  Start-Sleep -Milliseconds 500
  return $job
}

function Stop-StaticSiteServer {
  param(
    [System.Management.Automation.Job]$Job,
    [string]$Prefix
  )

  try {
    Invoke-WebRequest -Uri ($Prefix.TrimEnd("/") + "/__shutdown__") -UseBasicParsing | Out-Null
  }
  catch {
  }

  if ($Job) {
    Wait-Job -Job $Job -Timeout 10 | Out-Null
    Remove-Job -Job $Job -Force -ErrorAction SilentlyContinue
  }
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

$serverJob = $null

try {
  if (Test-Path $ProfileRoot) {
    Remove-Item -Recurse -Force $ProfileRoot
  }
  New-Item -ItemType Directory -Path $ProfileRoot | Out-Null

  $serverJob = Start-StaticSiteServer -RootPath (Resolve-Path $SiteDir).Path -Prefix $BaseUrl
  $baseUrl = $BaseUrl
  $drilldownUrl = if ($selectedSection -and $selectedEssay) {
    $baseUrl + "?selectedSection=$([System.Uri]::EscapeDataString([string]$selectedSection))&selectedEssay=$([System.Uri]::EscapeDataString([string]$selectedEssay))"
  } else {
    $baseUrl
  }
  $sourcesUrl = $baseUrl + "#sources"

  $dom = Invoke-BrowserCapture -BrowserPath $browserPath -UserDataDir (Join-Path $ProfileRoot "profile-dom") -TargetUrl $drilldownUrl -WindowSize "1440,2200" -DumpDom
  $dom | Set-Content -Path (Join-Path $OutputDir "dashboard-dom.html")
  $sourcesDom = Invoke-BrowserCapture -BrowserPath $browserPath -UserDataDir (Join-Path $ProfileRoot "profile-sources-dom") -TargetUrl $sourcesUrl -WindowSize "1440,2200" -DumpDom
  $sourcesDom | Set-Content -Path (Join-Path $OutputDir "dashboard-sources-dom.html")

  Invoke-BrowserCapture -BrowserPath $browserPath -UserDataDir (Join-Path $ProfileRoot "profile-desktop") -TargetUrl $baseUrl -WindowSize "1440,2200" -ShotPath (Join-Path $screensDir "desktop.png") | Out-Null
  Invoke-BrowserCapture -BrowserPath $browserPath -UserDataDir (Join-Path $ProfileRoot "profile-mobile") -TargetUrl $baseUrl -WindowSize "390,1200" -ShotPath (Join-Path $screensDir "mobile.png") | Out-Null

  if ($dom -notmatch 'data-dashboard-shell') {
    throw "Hydrated dashboard DOM is missing data-dashboard-shell."
  }

  if ($dom -notmatch 'data-dashboard-category-link="overview"') {
    throw "Hydrated dashboard DOM is missing the category chooser links."
  }

  if ($dom -notmatch 'data-dashboard-active-title">Overview<') {
    throw "Hydrated dashboard DOM does not default to the overview category."
  }

  if ($dom -notmatch '(data-dashboard-category-panel="performance"[^>]*hidden|hidden[^>]*data-dashboard-category-panel="performance")') {
    throw "Hydrated dashboard DOM is not hiding non-active category panels by default."
  }

  if ($dom -notmatch 'dashboard-kpi__delta') {
    throw "Hydrated dashboard DOM is missing KPI delta markup."
  }

  if ($sourcesDom -notmatch 'data-dashboard-active-title">Traffic sources<') {
    throw "Hydrated dashboard DOM does not switch categories when a hash deep link is used."
  }

  if ($sourcesDom -notmatch 'data-dashboard-category-panel="sources"') {
    throw "Hydrated dashboard DOM is missing the traffic sources category panel."
  }

  $pageviewsPattern = '(?s)dashboard-kpi__label">Pageviews</p>.*?<p class="dashboard-kpi__value">' + $expectedPageviews + '<'
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
  Stop-StaticSiteServer -Job $serverJob -Prefix $BaseUrl
  if (Test-Path $ProfileRoot) {
    Remove-Item -Recurse -Force $ProfileRoot -ErrorAction SilentlyContinue
  }
}

Write-Host "Dashboard browser smoke test passed."
