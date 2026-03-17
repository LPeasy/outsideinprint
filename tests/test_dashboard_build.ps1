Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$fixtures = @("empty", "sparse", "rich")
$tempRoot = Join-Path $repoRoot ".tmp-dashboard-build-tests"
$requiredEntries = @(
  "archetypes",
  "assets",
  "content-dashboard",
  "data",
  "layouts",
  "static/favicon.svg",
  "hugo-dashboard.toml"
)

if (-not (Get-Command hugo -ErrorAction SilentlyContinue)) {
  throw "hugo is required for dashboard build smoke tests."
}

if (Test-Path $tempRoot) {
  Remove-Item -Recurse -Force $tempRoot
}

New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
  foreach ($fixture in $fixtures) {
    $workdir = Join-Path $tempRoot $fixture
    New-Item -ItemType Directory -Path $workdir | Out-Null

    foreach ($entryName in $requiredEntries) {
      $sourcePath = Join-Path $repoRoot $entryName
      if (-not (Test-Path $sourcePath)) {
        throw "Required dashboard build entry '$entryName' was not found."
      }

      $destinationPath = Join-Path $workdir $entryName
      $destinationParent = Split-Path -Parent $destinationPath
      if ($destinationParent -and -not (Test-Path $destinationParent)) {
        New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
      }

      Copy-Item $sourcePath -Destination $destinationPath -Recurse -Force
    }

    Copy-Item (Join-Path $PSScriptRoot "fixtures/analytics/$fixture/data/analytics") (Join-Path $workdir "data") -Recurse -Force

    Push-Location $workdir
    try {
      & hugo --config hugo-dashboard.toml --destination .dashboard-public | Out-Null
    }
    finally {
      Pop-Location
    }

    $indexPath = Join-Path $workdir ".dashboard-public/index.html"
    if (-not (Test-Path $indexPath)) {
      throw "Expected dashboard build output for fixture '$fixture'."
    }

    $html = Get-Content $indexPath -Raw
    foreach ($needle in @("Key readership totals", "Reader momentum over time", "dashboard-data", "Section Explorer", "Essay Explorer")) {
      if ($html -notmatch [regex]::Escape($needle)) {
        throw "Fixture '$fixture' build is missing expected marker '$needle'."
      }
    }

    if ($html -match 'id=dashboard-data type=application/json>"\{') {
      throw "Fixture '$fixture' build output still double-encodes dashboard-data as a JSON string."
    }

    $payloadMatch = [regex]::Match($html, '<script id="dashboard-data" type="application/json">(.*?)</script>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $payloadMatch.Success) {
      throw "Fixture '$fixture' build output is missing the dashboard-data payload."
    }

    try {
      $payload = $payloadMatch.Groups[1].Value | ConvertFrom-Json
    }
    catch {
      throw "Fixture '$fixture' dashboard-data payload is not valid JSON."
    }

    foreach ($key in @("overview", "essays", "sections", "timeseries_daily", "journeys")) {
      if ($null -eq $payload.PSObject.Properties[$key]) {
        throw "Fixture '$fixture' dashboard-data payload is missing key '$key'."
      }
    }

    $invalidPatterns = @{
      "NaN" = '(?<![A-Za-z0-9+/=])NaN(?![A-Za-z0-9+/=])'
      "undefined" = '(?<![A-Za-z0-9+/=])undefined(?![A-Za-z0-9+/=])'
    }

    foreach ($invalid in $invalidPatterns.Keys) {
      if ($html -match $invalidPatterns[$invalid]) {
        throw "Fixture '$fixture' build output contains invalid marker '$invalid'."
      }
    }
  }
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -Recurse -Force $tempRoot
  }
}

Write-Host "Dashboard build smoke tests passed."
