Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $repoRoot 'data\almanack'
$templatePath = Join-Path $repoRoot 'layouts\collections\bobs-almanack.html'
$scriptPath = Join-Path $repoRoot 'scripts\update_almanack_modules.ps1'

$archivePath = Join-Path $dataDir 'archive_links.yaml'
$onThisDayPath = Join-Path $dataDir 'on_this_day.yaml'
$weatherPath = Join-Path $dataDir 'weather_city_records.yaml'
$worldWeekPath = Join-Path $dataDir 'world_week.yaml'

foreach ($requiredPath in @($archivePath, $onThisDayPath, $weatherPath, $worldWeekPath, $templatePath, $scriptPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Missing Almanack module contract file: $requiredPath"
  }
}

$archive = Get-Content -LiteralPath $archivePath -Raw
$onThisDay = Get-Content -LiteralPath $onThisDayPath -Raw
$weather = Get-Content -LiteralPath $weatherPath -Raw
$worldWeek = Get-Content -LiteralPath $worldWeekPath -Raw
$template = Get-Content -LiteralPath $templatePath -Raw
$script = Get-Content -LiteralPath $scriptPath -Raw

foreach ($requiredReference in @(
  'site.Data.almanack.on_this_day',
  'site.Data.almanack.weather_city_records',
  'site.Data.almanack.world_week',
  'site.Data.almanack.archive_links'
)) {
  if ($template -notmatch [regex]::Escape($requiredReference)) {
    throw "Bob's Almanack collection template must read $requiredReference."
  }
}

foreach ($forbiddenTemplateText in @(
  'Invoke-RestMethod',
  'Invoke-WebRequest',
  'api.wikimedia.org',
  'ncei.noaa.gov/data',
  'Portal:Current_events',
  '/w/api.php'
)) {
  if ($template -match [regex]::Escape($forbiddenTemplateText)) {
    throw "Bob's Almanack collection template must not contain acquisition text: $forbiddenTemplateText"
  }
}

foreach ($requiredArchiveKey in @(
  'public-costs',
  'risk-evidence',
  'public-power',
  'counting-consequences'
)) {
  if ($archive -notmatch "key:\s*'$([regex]::Escape($requiredArchiveKey))'") {
    throw "archive_links.yaml must include stable key '$requiredArchiveKey'."
  }
}

if ($archive -notmatch 'reviewed_at:\s*''\d{4}-\d{2}-\d{2}T') {
  throw 'archive_links.yaml must include a reviewed_at timestamp.'
}

if ($archive -notmatch 'phrase:\s*''[^'']+''' -or $archive -notmatch 'url:\s*''https://outsideinprint\.org/essays/[^'']+/''') {
  throw 'archive_links.yaml must include human phrase labels and verified public OIP essay URLs.'
}

foreach ($scriptedData in @(
  @{ Name = 'on_this_day.yaml'; Text = $onThisDay },
  @{ Name = 'weather_city_records.yaml'; Text = $weather },
  @{ Name = 'world_week.yaml'; Text = $worldWeek }
)) {
  if ($scriptedData.Text -notmatch 'generated_at:\s*''\d{4}-\d{2}-\d{2}T') {
    throw "$($scriptedData.Name) must include a generated_at timestamp."
  }
}

foreach ($sourceLinkedData in @(
  @{ Name = 'on_this_day.yaml'; Text = $onThisDay },
  @{ Name = 'weather_city_records.yaml'; Text = $weather },
  @{ Name = 'world_week.yaml'; Text = $worldWeek }
)) {
  if ($sourceLinkedData.Text -notmatch 'source_url:\s*''https?://') {
    throw "$($sourceLinkedData.Name) must include source_url fields for external facts."
  }
}

foreach ($stationId in @(
  'USW00094728',
  'USC00045118',
  'USW00094846',
  'USW00013874',
  'USW00012839'
)) {
  if ($weather -notmatch [regex]::Escape("station_id: '$stationId'")) {
    throw "weather_city_records.yaml must include fixed station ID $stationId."
  }
  if ($script -notmatch [regex]::Escape("StationId = '$stationId'")) {
    throw "update_almanack_modules.ps1 must acquire weather for fixed station ID $stationId."
  }
}

foreach ($weatherField in @('min_low_f', 'mean_average_f', 'max_high_f')) {
  if ($weather -notmatch "$weatherField`:") {
    throw "weather_city_records.yaml must store display-ready $weatherField aggregates."
  }
}

if ($weather -match '(?m)^(STATION,DATE|DATE,)' -or $weather -match '\b(TMAX|TMIN|TAVG)\b') {
  throw 'weather_city_records.yaml must not store raw NOAA/GHCN rows or daily element columns.'
}

foreach ($renderedHeading in @('This Day', 'Weather Almanack', 'World Week')) {
  if ($template -notmatch [regex]::Escape($renderedHeading)) {
    throw "Bob's Almanack collection template must render '$renderedHeading'."
  }
}

Write-Host 'Almanack module data contract passed.'
