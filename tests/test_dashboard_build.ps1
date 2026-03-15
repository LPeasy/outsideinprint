Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$fixtures = @("empty", "sparse", "rich")
$tempRoot = Join-Path $repoRoot ".tmp-dashboard-build-tests"

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

    foreach ($entry in Get-ChildItem $repoRoot) {
      if ($entry.Name -in @(".git", "public", "resources", ".tmp-dashboard-build-tests", ".tmp-analytics-fixture")) {
        continue
      }

      Copy-Item $entry.FullName -Destination (Join-Path $workdir $entry.Name) -Recurse -Force
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

    foreach ($invalid in @("NaN", "undefined")) {
      if ($html -match [regex]::Escape($invalid)) {
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
