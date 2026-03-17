Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$fixtureInput = Join-Path $PSScriptRoot "fixtures/analytics/import-raw"
$outputDir = Join-Path $repoRoot ".tmp-test-analytics-import"

if (Test-Path $outputDir) {
  Remove-Item -Recurse -Force $outputDir
}

try {
  & (Join-Path $repoRoot "scripts/import_analytics.ps1") -InputPath $fixtureInput -OutputDir $outputDir

  $requiredFiles = @(
    "overview.json",
    "essays.json",
    "sources.json",
    "modules.json",
    "periods.json",
    "timeseries_daily.json",
    "sections.json",
    "essays_timeseries.json",
    "journeys.json",
    "journey_by_source.json",
    "journey_by_collection.json",
    "journey_by_essay.json",
    "sources_timeseries.json"
  )

  foreach ($file in $requiredFiles) {
    $path = Join-Path $outputDir $file
    if (-not (Test-Path $path)) {
      throw "Missing expected analytics snapshot: $file"
    }
  }

  $overview = Get-Content (Join-Path $outputDir "overview.json") -Raw | ConvertFrom-Json
  $daily = Get-Content (Join-Path $outputDir "timeseries_daily.json") -Raw | ConvertFrom-Json
  $sections = Get-Content (Join-Path $outputDir "sections.json") -Raw | ConvertFrom-Json
  $journeys = Get-Content (Join-Path $outputDir "journeys.json") -Raw | ConvertFrom-Json
  $journeyBySource = Get-Content (Join-Path $outputDir "journey_by_source.json") -Raw | ConvertFrom-Json
  $journeyByCollection = Get-Content (Join-Path $outputDir "journey_by_collection.json") -Raw | ConvertFrom-Json

  if ([int][double]$overview.pageviews -ne 8) {
    throw "Expected 8 pageviews in importer fixture output."
  }

  if (@($daily).Count -lt 4) {
    throw "Expected at least 4 daily timeseries rows."
  }

  if (-not (@($sections | Where-Object { $_.section -eq "Essays" }).Count -ge 1)) {
    throw "Expected an Essays section summary."
  }

  if (@($sections | Group-Object section | Where-Object { $_.Count -gt 1 }).Count -gt 0) {
    throw "Expected importer output to collapse duplicate section labels."
  }

  if (-not (@($journeys | Where-Object { $_.discovery_type -eq "internal-module" }).Count -ge 1)) {
    throw "Expected at least one inferred internal-module journey."
  }

  if (-not (@($journeyBySource | Where-Object { $_.discovery_source -eq "google.com / referral" }).Count -ge 1)) {
    throw "Expected a source-level journey rollup for google.com / referral."
  }

  if (-not (@($journeyByCollection | Where-Object { $_.collection -eq "risk-uncertainty" }).Count -ge 1)) {
    throw "Expected a collection-level journey rollup for risk-uncertainty."
  }
}
finally {
  if (Test-Path $outputDir) {
    Remove-Item -Recurse -Force $outputDir
  }
}

Write-Host "Analytics importer test passed."
