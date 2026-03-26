param(
  [string]$DataDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "data/analytics")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-SectionLabel {
  param([object]$Value)

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return "Unlabeled"
  }

  switch -Regex ($text.Trim().ToLowerInvariant()) {
    '^essay(s)?$' { return "Essays" }
    '^working[\s-]?paper(s)?$' { return "Working Papers" }
    '^syd(\s+and\s+|\s*&\s*)oliver$' { return "S and O" }
    '^s(?:\s+and\s+|\s*&\s*)o$' { return "S and O" }
    '^collection(s)?$' { return "Collections" }
    default { return $text.Trim() }
  }
}

function Assert-HasKeys {
  param(
    [object]$Value,
    [string[]]$Keys,
    [string]$Context
  )

  foreach ($key in $Keys) {
    if ($null -eq $Value.PSObject.Properties[$key]) {
      throw "$Context is missing required key '$key'."
    }
  }
}

function Assert-ArrayShape {
  param(
    [object]$Value,
    [string[]]$Keys,
    [string]$Context
  )

  if ($Value -isnot [System.Collections.IEnumerable] -or $Value -is [string]) {
    throw "$Context must be a JSON array."
  }

  $rows = @($Value)
  if ($rows.Count -gt 0) {
    Assert-HasKeys -Value $rows[0] -Keys $Keys -Context "$Context first row"
  }
}

function Convert-JsonDocument {
  param([string]$Json)

  $trimmed = $Json.Trim()
  $isArrayDocument = $trimmed.StartsWith("[") -and $trimmed.EndsWith("]")

  if ($isArrayDocument -and $trimmed -match '^\[\s*\]$') {
    return ,@()
  }

  $convertFromJson = Get-Command ConvertFrom-Json -ErrorAction Stop
  if ($convertFromJson.Parameters.ContainsKey("NoEnumerate")) {
    return ($Json | ConvertFrom-Json -NoEnumerate)
  }

  $parsed = $Json | ConvertFrom-Json
  if ($isArrayDocument -and $null -eq $parsed) {
    return ,@()
  }

  if ($isArrayDocument -and ($parsed -is [string] -or $parsed -isnot [System.Collections.IEnumerable])) {
    return ,$parsed
  }

  return $parsed
}

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

$parsed = @{}
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
    $parsed[$file] = Convert-JsonDocument -Json $raw
  }
  catch {
    throw "Analytics snapshot file is not valid JSON: $file"
  }

  if ($raw -match '\b(NaN|undefined)\b') {
    throw "Analytics snapshot file contains an invalid JavaScript sentinel: $file"
  }
}

Assert-HasKeys -Value $parsed["overview.json"] -Keys @(
  "range_label",
  "updated_at",
  "pageviews",
  "unique_visitors",
  "reads",
  "read_rate",
  "pdf_downloads",
  "newsletter_submits"
) -Context "overview.json"

Assert-ArrayShape -Value $parsed["essays.json"] -Keys @("slug", "path", "title", "section", "views", "reads", "read_rate", "pdf_downloads", "primary_source") -Context "essays.json"
Assert-ArrayShape -Value $parsed["sources.json"] -Keys @("source", "medium", "campaign", "content", "visitors", "pageviews", "reads") -Context "sources.json"
Assert-ArrayShape -Value $parsed["modules.json"] -Keys @("slot", "collection", "clicks", "downstream_reads") -Context "modules.json"
Assert-ArrayShape -Value $parsed["periods.json"] -Keys @("label", "pageviews", "unique_visitors", "reads", "read_rate", "pdf_downloads", "newsletter_submits") -Context "periods.json"
Assert-ArrayShape -Value $parsed["timeseries_daily.json"] -Keys @("date", "pageviews", "unique_visitors", "reads", "read_rate", "pdf_downloads", "newsletter_submits") -Context "timeseries_daily.json"
Assert-ArrayShape -Value $parsed["sections.json"] -Keys @("section", "pageviews", "reads", "read_rate", "pdf_downloads", "newsletter_submits", "sparkline_pageviews", "sparkline_reads") -Context "sections.json"
Assert-ArrayShape -Value $parsed["essays_timeseries.json"] -Keys @("slug", "path", "title", "section", "series") -Context "essays_timeseries.json"
Assert-ArrayShape -Value $parsed["journeys.json"] -Keys @("discovery_source", "discovery_type", "slug", "path", "title", "section", "views", "reads", "pdf_downloads", "newsletter_submits", "approximate_downstream", "attribution_note") -Context "journeys.json"
Assert-ArrayShape -Value $parsed["journey_by_source.json"] -Keys @("discovery_source", "discovery_type", "discovery_mode", "views", "reads", "read_rate", "pdf_downloads", "pdf_rate", "newsletter_submits", "newsletter_rate", "approximate_downstream", "attribution_note") -Context "journey_by_source.json"
Assert-ArrayShape -Value $parsed["journey_by_collection.json"] -Keys @("collection_label", "discovery_type", "discovery_mode", "module_slot", "collection", "section", "views", "reads", "read_rate", "pdf_downloads", "pdf_rate", "newsletter_submits", "newsletter_rate", "approximate_downstream", "attribution_note") -Context "journey_by_collection.json"
Assert-ArrayShape -Value $parsed["journey_by_essay.json"] -Keys @("title", "section", "slug", "path", "views", "reads", "read_rate", "pdf_downloads", "pdf_rate", "newsletter_submits", "newsletter_rate", "approximate_downstream", "attribution_note") -Context "journey_by_essay.json"
Assert-ArrayShape -Value $parsed["sources_timeseries.json"] -Keys @("date", "source_type", "source", "pageviews", "reads", "read_rate", "pdf_downloads", "newsletter_submits") -Context "sources_timeseries.json"

$canonicalSections = @($parsed["sections.json"]) | ForEach-Object { Normalize-SectionLabel -Value $_.section }
if (@($canonicalSections | Group-Object | Where-Object { $_.Count -gt 1 }).Count -gt 0) {
  throw "sections.json contains duplicate canonical section labels. Normalize section taxonomy in ETL output."
}

Write-Host "Analytics snapshot contract test passed."
