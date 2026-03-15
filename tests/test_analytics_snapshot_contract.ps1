param(
  [string]$DataDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "data/analytics")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
  $path = Join-Path $DataDir $file
  if (-not (Test-Path $path)) {
    throw "Missing required analytics snapshot file: $file"
  }

  $raw = Get-Content $path -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    throw "Analytics snapshot file is empty: $file"
  }

  try {
    $null = $raw | ConvertFrom-Json
  }
  catch {
    throw "Analytics snapshot file is not valid JSON: $file"
  }

  if ($raw -match '\b(NaN|undefined)\b') {
    throw "Analytics snapshot file contains an invalid JavaScript sentinel: $file"
  }
}

Write-Host "Analytics snapshot contract test passed."
