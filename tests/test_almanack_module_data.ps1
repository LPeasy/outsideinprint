Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $repoRoot 'data\almanack'
$templatePath = Join-Path $repoRoot 'layouts\collections\bobs-almanack.html'
$scriptPath = Join-Path $repoRoot 'scripts\update_almanack_modules.ps1'
$archiveScriptPath = Join-Path $repoRoot 'scripts\update_almanack_archive_links.ps1'
$onThisDayScriptPath = Join-Path $repoRoot 'scripts\update_almanack_on_this_day.ps1'
$weatherScriptPath = Join-Path $repoRoot 'scripts\update_almanack_weather.ps1'
$worldWeekScriptPath = Join-Path $repoRoot 'scripts\update_almanack_world_week.ps1'

$archivePath = Join-Path $dataDir 'archive_links.yaml'
$archiveCandidatePath = Join-Path $dataDir 'archive_link_candidates.yaml'
$onThisDayPath = Join-Path $dataDir 'on_this_day.yaml'
$weatherPath = Join-Path $dataDir 'weather_city_records.yaml'
$worldWeekPath = Join-Path $dataDir 'world_week.yaml'

foreach ($requiredPath in @(
  $archivePath,
  $archiveCandidatePath,
  $onThisDayPath,
  $weatherPath,
  $worldWeekPath,
  $templatePath,
  $scriptPath,
  $archiveScriptPath,
  $onThisDayScriptPath,
  $weatherScriptPath,
  $worldWeekScriptPath
)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Missing Almanack module contract file: $requiredPath"
  }
}

$archive = Get-Content -LiteralPath $archivePath -Raw
$archiveCandidates = Get-Content -LiteralPath $archiveCandidatePath -Raw
$onThisDay = Get-Content -LiteralPath $onThisDayPath -Raw
$weather = Get-Content -LiteralPath $weatherPath -Raw
$worldWeek = Get-Content -LiteralPath $worldWeekPath -Raw
$template = Get-Content -LiteralPath $templatePath -Raw
$script = Get-Content -LiteralPath $scriptPath -Raw
$archiveScript = Get-Content -LiteralPath $archiveScriptPath -Raw

foreach ($requiredReference in @(
  'site.Data.almanack',
  '"on_this_day"',
  '"weather_city_records"',
  '"world_week"',
  '"archive_links"'
)) {
  if ($template -notmatch [regex]::Escape($requiredReference)) {
    throw "Bob's Almanack collection template must read local Almanack data key $requiredReference."
  }
}

if ($template -match 'archive_link_candidates') {
  throw 'Bob''s Almanack collection template must not consume generated archive-link candidates directly.'
}

foreach ($retiredMainSectionClass in @(
  'almanack-collection__world-week',
  'almanack-collection__archive-links'
)) {
  if ($template -match [regex]::Escape($retiredMainSectionClass)) {
    throw "Bob's Almanack data ornaments must render in the margins, not as main-column section $retiredMainSectionClass."
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

if ($archiveCandidates -notmatch 'candidate_note:.*Review before moving selected paths into archive_links\.yaml entries') {
  throw 'archive_link_candidates.yaml must be explicitly marked as a review artifact.'
}

if ($archiveCandidates -notmatch 'generated_at:\s*''\d{4}-\d{2}-\d{2}T' -or $archiveCandidates -notmatch 'source:\s*\r?\n\s+name: ''Outside In Print Hugo essays''') {
  throw 'archive_link_candidates.yaml must include generation metadata and local source details.'
}

if ($archiveCandidates -notmatch 'matched_terms:' -or $archiveCandidates -notmatch 'already_listed:\s*(?:true|false)' -or $archiveCandidates -notmatch 'url:\s*''https://outsideinprint\.org/essays/') {
  throw 'archive_link_candidates.yaml must include scored, source-linked candidates for editorial review.'
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

if ($worldWeek -notmatch 'selection_note:.*review weekly before publishing' -or $worldWeek -notmatch 'source_order:\s*\d+') {
  throw 'world_week.yaml must preserve source ordering and keep the generated list editorially gated.'
}

foreach ($requiredScriptTerm in @(
  'CacheDir',
  'RefreshCache',
  'ReviewOnly',
  'Unable to fetch',
  'Source data is unavailable'
)) {
  if ($script -notmatch [regex]::Escape($requiredScriptTerm)) {
    throw "update_almanack_modules.ps1 must support deterministic cached review refreshes and clear source failures: missing $requiredScriptTerm."
  }
}

foreach ($requiredArchiveScriptTerm in @(
  'content\essays',
  'candidate_note',
  'matched_terms',
  'already_listed',
  'archive_link_candidates.yaml'
)) {
  if ($archiveScript -notmatch [regex]::Escape($requiredArchiveScriptTerm)) {
    throw "update_almanack_archive_links.ps1 must generate reviewable archive-link candidates: missing $requiredArchiveScriptTerm."
  }
}

foreach ($renderedHeading in @('This Day in History', 'From the Archive', 'Weather Almanack', 'World Week')) {
  if ($template -notmatch [regex]::Escape($renderedHeading)) {
    throw "Bob's Almanack collection template must render '$renderedHeading'."
  }
}

Write-Host 'Almanack module data contract passed.'
