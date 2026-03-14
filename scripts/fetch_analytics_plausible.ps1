param(
  [string]$ApiKey = $env:PLAUSIBLE_API_KEY,
  [string]$SiteId = $(if ($env:PLAUSIBLE_SITE_ID) { $env:PLAUSIBLE_SITE_ID } else { $env:PLAUSIBLE_DOMAIN }),
  [string]$ApiBaseUrl = $(if ($env:PLAUSIBLE_API_HOST) { $env:PLAUSIBLE_API_HOST } else { "https://plausible.io" }),
  [string]$OutputDir = "./.analytics-refresh/raw",
  [int]$EssayLimit = 100,
  [int]$SourceLimit = 50,
  [int]$ModuleLimit = 50,
  [int]$MaxRetries = 3,
  [int]$InitialRetryDelaySeconds = 2
)

$ErrorActionPreference = "Stop"

$EssayPathPattern = "^/(essays|literature|syd-and-oliver|working-papers)/[^/]+/?$"
$AllTimeLabel = "All time"
$UpdatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")

function Convert-ToNumber {
  param(
    [object]$Value,
    [double]$Default = 0
  )

  if ($null -eq $Value) {
    return $Default
  }

  $parsed = 0.0
  if ([double]::TryParse([string]$Value, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
    return $parsed
  }

  return $Default
}

function Convert-ToText {
  param(
    [object]$Value,
    [string]$Default = ""
  )

  if ($null -eq $Value) {
    return $Default
  }

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return $Default
  }

  return $text.Trim()
}

function Normalize-Path {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return ""
  }

  $value = $Path.Trim()
  if (-not $value.StartsWith("/")) {
    $value = "/$value"
  }

  if (-not $value.EndsWith("/")) {
    $value = "$value/"
  }

  return $value
}

function Get-SlugFromPath {
  param([string]$Path)

  $normalized = Normalize-Path -Path $Path
  if (-not $normalized) {
    return ""
  }

  return [System.IO.Path]::GetFileName($normalized.TrimEnd("/"))
}

function Get-SectionLabelFromPath {
  param([string]$Path)

  switch -Regex (Normalize-Path -Path $Path) {
    "^/essays/" { return "Essays" }
    "^/literature/" { return "Books" }
    "^/syd-and-oliver/" { return "Syd and Oliver" }
    "^/working-papers/" { return "Working Papers" }
    default { return "" }
  }
}

function Get-TitleFallbackFromPath {
  param([string]$Path)

  $slug = Get-SlugFromPath -Path $Path
  if (-not $slug) {
    return "Untitled"
  }

  $title = ($slug -replace "[-_]+", " ").Trim()
  return [System.Globalization.CultureInfo]::InvariantCulture.TextInfo.ToTitleCase($title)
}

function Write-Utf8Json {
  param(
    [string]$Path,
    [object]$Value
  )

  $directory = Split-Path -Parent $Path
  if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  if ($Value -is [System.Collections.IDictionary] -and $Value.Count -eq 0) {
    $json = "{}"
  } elseif ($Value -is [array] -and $Value.Count -eq 0) {
    $json = "[]"
  } else {
    $json = ConvertTo-Json -InputObject $Value -Depth 20
  }

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($Path), $json + [Environment]::NewLine, $encoding)
}

function Invoke-PlausibleQuery {
  param(
    [string[]]$Metrics,
    [string[]]$Dimensions = @(),
    [object]$Filters = $null,
    [object]$DateRange = "all",
    [object[]]$OrderBy = @(),
    [int]$Limit = 0
  )

  $body = [ordered]@{
    site_id = $SiteId
    metrics = $Metrics
    date_range = $DateRange
  }

  if ($Dimensions.Count -gt 0) {
    $body["dimensions"] = $Dimensions
  }

  if ($null -ne $Filters) {
    $body["filters"] = $Filters
  }

  if ($OrderBy.Count -gt 0) {
    $body["order_by"] = $OrderBy
  }

  if ($Limit -gt 0) {
    $body["pagination"] = @{
      limit = $Limit
      offset = 0
    }
  }

  $uri = "{0}/api/v2/query" -f $ApiBaseUrl.TrimEnd("/")
  $headers = @{
    Authorization = "Bearer $ApiKey"
  }

  $attempt = 0
  $delaySeconds = [Math]::Max(1, $InitialRetryDelaySeconds)

  while ($true) {
    $attempt += 1

    try {
      return Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 20)
    } catch {
      $statusCode = 0
      $details = ""
      if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode.value__
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $details = $reader.ReadToEnd()
      }

      $isRetryable = ($statusCode -eq 0 -or $statusCode -eq 429 -or $statusCode -ge 500)
      if ($attempt -lt $MaxRetries -and $isRetryable) {
        Write-Warning ("Plausible query attempt {0}/{1} failed with status {2}. Retrying in {3}s." -f $attempt, $MaxRetries, $(if ($statusCode) { $statusCode } else { "network" }), $delaySeconds)
        Start-Sleep -Seconds $delaySeconds
        $delaySeconds = [Math]::Min($delaySeconds * 2, 30)
        continue
      }

      throw "Plausible query failed after $attempt attempt(s). Ensure the API key, site identifier, goals, and custom properties are configured correctly. $details"
    }
  }
}

function Convert-QueryRows {
  param(
    [object]$Response,
    [string[]]$Dimensions,
    [string[]]$Metrics
  )

  $rows = @()
  if ($null -eq $Response -or $null -eq $Response.results) {
    return ,@()
  }

  foreach ($result in @($Response.results)) {
    $entry = [ordered]@{}
    $dimensionValues = @()
    $metricValues = @()

    if ($null -ne $result.dimensions) {
      $dimensionValues = @($result.dimensions)
    }

    if ($null -ne $result.metrics) {
      $metricValues = @($result.metrics)
    }

    for ($i = 0; $i -lt $Dimensions.Count; $i++) {
      $entry[$Dimensions[$i]] = if ($i -lt $dimensionValues.Count) { Convert-ToText $dimensionValues[$i] } else { "" }
    }

    for ($i = 0; $i -lt $Metrics.Count; $i++) {
      $entry[$Metrics[$i]] = if ($i -lt $metricValues.Count) { Convert-ToNumber $metricValues[$i] } else { 0 }
    }

    $rows += [pscustomobject]$entry
  }

  return ,$rows
}

function Get-AggregateMap {
  param(
    [object]$Response,
    [string[]]$Metrics
  )

  $rows = Convert-QueryRows -Response $Response -Dimensions @() -Metrics $Metrics
  if ($rows.Count -eq 0) {
    $empty = [ordered]@{}
    foreach ($metric in $Metrics) {
      $empty[$metric] = 0
    }
    return $empty
  }

  $aggregate = [ordered]@{}
  foreach ($metric in $Metrics) {
    $aggregate[$metric] = Convert-ToNumber $rows[0].$metric
  }

  return $aggregate
}

function Get-OrCreateEssayEntry {
  param(
    [hashtable]$Map,
    [string]$Path
  )

  if (-not $Map.ContainsKey($Path)) {
    $Map[$Path] = [ordered]@{
      slug = Get-SlugFromPath -Path $Path
      path = $Path
      title = Get-TitleFallbackFromPath -Path $Path
      section = Get-SectionLabelFromPath -Path $Path
      views = 0.0
      reads = 0.0
      read_rate = 0.0
      pdf_downloads = 0.0
      primary_source = ""
    }
  }

  return $Map[$Path]
}

function Format-PrimarySource {
  param(
    [string]$Source,
    [string]$Medium,
    [string]$Campaign
  )

  $parts = @(
    (Convert-ToText $Source),
    (Convert-ToText $Medium),
    (Convert-ToText $Campaign)
  ) | Where-Object { $_ }

  return ($parts -join " / ")
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "PLAUSIBLE_API_KEY is required."
}

if ([string]::IsNullOrWhiteSpace($SiteId)) {
  throw "PLAUSIBLE_SITE_ID is required. You can also reuse PLAUSIBLE_DOMAIN if the site identifier is the domain."
}

Write-Host "Outside In Print ~ Fetch Plausible Analytics" -ForegroundColor Cyan
Write-Host ("Site: {0}" -f $SiteId) -ForegroundColor DarkCyan

$pageMetrics = @("pageviews", "visitors")
$eventMetric = @("events")

$overviewTraffic = Get-AggregateMap -Response (Invoke-PlausibleQuery -Metrics $pageMetrics -DateRange "all") -Metrics $pageMetrics
$overviewReads = Get-AggregateMap -Response (Invoke-PlausibleQuery -Metrics $eventMetric -Filters @("is", "event:goal", @("essay_read")) -DateRange "all") -Metrics $eventMetric
$overviewPdfDownloads = Get-AggregateMap -Response (Invoke-PlausibleQuery -Metrics $eventMetric -Filters @("is", "event:goal", @("pdf_download")) -DateRange "all") -Metrics $eventMetric
$overviewNewsletter = Get-AggregateMap -Response (Invoke-PlausibleQuery -Metrics $eventMetric -Filters @("is", "event:goal", @("newsletter_submit")) -DateRange "all") -Metrics $eventMetric

$overview = [ordered]@{
  range_label = $AllTimeLabel
  updated_at = $UpdatedAt
  pageviews = $overviewTraffic.pageviews
  unique_visitors = $overviewTraffic.visitors
  reads = $overviewReads.events
  read_rate = if ($overviewTraffic.pageviews -gt 0) { [Math]::Round(($overviewReads.events / $overviewTraffic.pageviews) * 100, 1) } else { 0.0 }
  pdf_downloads = $overviewPdfDownloads.events
  newsletter_submits = $overviewNewsletter.events
}

$pageRows = Convert-QueryRows -Response (
  Invoke-PlausibleQuery -Metrics @("pageviews") -Dimensions @("event:page") -Filters @("matches", "event:page", @($EssayPathPattern)) -DateRange "all" -OrderBy @(@("pageviews", "desc")) -Limit $EssayLimit
) -Dimensions @("event:page") -Metrics @("pageviews")

$readRows = Convert-QueryRows -Response (
  Invoke-PlausibleQuery -Metrics $eventMetric -Dimensions @("event:props:path", "event:props:slug", "event:props:title", "event:props:section") -Filters @("and", @(
    @("is", "event:goal", @("essay_read")),
    @("matches", "event:props:path", @($EssayPathPattern))
  )) -DateRange "all" -OrderBy @(@("events", "desc")) -Limit $EssayLimit
) -Dimensions @("event:props:path", "event:props:slug", "event:props:title", "event:props:section") -Metrics $eventMetric

$pdfRows = Convert-QueryRows -Response (
  Invoke-PlausibleQuery -Metrics $eventMetric -Dimensions @("event:props:path", "event:props:slug", "event:props:title", "event:props:section") -Filters @("and", @(
    @("is", "event:goal", @("pdf_download")),
    @("matches", "event:props:path", @($EssayPathPattern))
  )) -DateRange "all" -OrderBy @(@("events", "desc")) -Limit $EssayLimit
) -Dimensions @("event:props:path", "event:props:slug", "event:props:title", "event:props:section") -Metrics $eventMetric

$primarySourceRows = Convert-QueryRows -Response (
  Invoke-PlausibleQuery -Metrics $eventMetric -Dimensions @("event:props:path", "visit:source", "visit:utm_medium", "visit:utm_campaign") -Filters @("and", @(
    @("is", "event:goal", @("essay_read")),
    @("matches", "event:props:path", @($EssayPathPattern))
  )) -DateRange "all" -OrderBy @(@("events", "desc")) -Limit ($EssayLimit * 5)
) -Dimensions @("event:props:path", "visit:source", "visit:utm_medium", "visit:utm_campaign") -Metrics $eventMetric

$essayMap = @{}

foreach ($row in $pageRows) {
  $path = Normalize-Path -Path $row."event:page"
  if (-not $path) {
    continue
  }

  $entry = Get-OrCreateEssayEntry -Map $essayMap -Path $path
  $entry.views = Convert-ToNumber $row.pageviews
}

foreach ($row in $readRows) {
  $path = Normalize-Path -Path $row."event:props:path"
  if (-not $path) {
    continue
  }

  $entry = Get-OrCreateEssayEntry -Map $essayMap -Path $path
  $entry.slug = Convert-ToText $row."event:props:slug" $entry.slug
  $entry.title = Convert-ToText $row."event:props:title" $entry.title
  $entry.section = Convert-ToText $row."event:props:section" $entry.section
  $entry.reads = Convert-ToNumber $row.events
}

foreach ($row in $pdfRows) {
  $path = Normalize-Path -Path $row."event:props:path"
  if (-not $path) {
    continue
  }

  $entry = Get-OrCreateEssayEntry -Map $essayMap -Path $path
  $entry.slug = Convert-ToText $row."event:props:slug" $entry.slug
  $entry.title = Convert-ToText $row."event:props:title" $entry.title
  $entry.section = Convert-ToText $row."event:props:section" $entry.section
  $entry.pdf_downloads = Convert-ToNumber $row.events
}

foreach ($row in $primarySourceRows) {
  $path = Normalize-Path -Path $row."event:props:path"
  if (-not $path -or -not $essayMap.ContainsKey($path)) {
    continue
  }

  $entry = $essayMap[$path]
  if ($entry.primary_source) {
    continue
  }

  $entry.primary_source = Format-PrimarySource -Source $row."visit:source" -Medium $row."visit:utm_medium" -Campaign $row."visit:utm_campaign"
}

$essays = @(
  foreach ($entry in $essayMap.Values) {
    $entry.read_rate = if ($entry.views -gt 0) { [Math]::Round(($entry.reads / $entry.views) * 100, 1) } else { 0.0 }
    [ordered]@{
      slug = $entry.slug
      path = $entry.path
      title = $entry.title
      section = $entry.section
      views = $entry.views
      reads = $entry.reads
      read_rate = $entry.read_rate
      pdf_downloads = $entry.pdf_downloads
      primary_source = $entry.primary_source
    }
  }
) | Sort-Object -Property @{ Expression = { $_.views }; Descending = $true }, @{ Expression = { $_.reads }; Descending = $true } | Select-Object -First $EssayLimit

$sourceDimensions = @("visit:source", "visit:utm_medium", "visit:utm_campaign", "visit:utm_content")
$sourceTrafficRows = Convert-QueryRows -Response (
  Invoke-PlausibleQuery -Metrics $pageMetrics -Dimensions $sourceDimensions -DateRange "all" -OrderBy @(@("pageviews", "desc")) -Limit $SourceLimit
) -Dimensions $sourceDimensions -Metrics $pageMetrics

$sourceReadRows = Convert-QueryRows -Response (
  Invoke-PlausibleQuery -Metrics $eventMetric -Dimensions $sourceDimensions -Filters @("is", "event:goal", @("essay_read")) -DateRange "all" -OrderBy @(@("events", "desc")) -Limit $SourceLimit
) -Dimensions $sourceDimensions -Metrics $eventMetric

$sourceMap = @{}

foreach ($row in $sourceTrafficRows) {
  $key = @(
    Convert-ToText $row."visit:source",
    Convert-ToText $row."visit:utm_medium",
    Convert-ToText $row."visit:utm_campaign",
    Convert-ToText $row."visit:utm_content"
  ) -join "|"

  $sourceMap[$key] = [ordered]@{
    source = Convert-ToText $row."visit:source"
    medium = Convert-ToText $row."visit:utm_medium"
    campaign = Convert-ToText $row."visit:utm_campaign"
    content = Convert-ToText $row."visit:utm_content"
    visitors = Convert-ToNumber $row.visitors
    pageviews = Convert-ToNumber $row.pageviews
    reads = 0.0
  }
}

foreach ($row in $sourceReadRows) {
  $key = @(
    Convert-ToText $row."visit:source",
    Convert-ToText $row."visit:utm_medium",
    Convert-ToText $row."visit:utm_campaign",
    Convert-ToText $row."visit:utm_content"
  ) -join "|"

  if (-not $sourceMap.ContainsKey($key)) {
    $sourceMap[$key] = [ordered]@{
      source = Convert-ToText $row."visit:source"
      medium = Convert-ToText $row."visit:utm_medium"
      campaign = Convert-ToText $row."visit:utm_campaign"
      content = Convert-ToText $row."visit:utm_content"
      visitors = 0.0
      pageviews = 0.0
      reads = 0.0
    }
  }

  $sourceMap[$key].reads = Convert-ToNumber $row.events
}

$sources = @($sourceMap.Values) | Sort-Object -Property @{ Expression = { $_.pageviews }; Descending = $true }, @{ Expression = { $_.reads }; Descending = $true } | Select-Object -First $SourceLimit

$moduleRows = Convert-QueryRows -Response (
  Invoke-PlausibleQuery -Metrics $eventMetric -Dimensions @("event:props:source_slot", "event:props:collection") -Filters @("is", "event:goal", @("internal_promo_click", "collection_click")) -DateRange "all" -OrderBy @(@("events", "desc")) -Limit $ModuleLimit
) -Dimensions @("event:props:source_slot", "event:props:collection") -Metrics $eventMetric

$modules = @(
  foreach ($row in $moduleRows) {
    $slot = Convert-ToText $row."event:props:source_slot"
    if (-not $slot) {
      continue
    }

    [ordered]@{
      slot = $slot
      collection = Convert-ToText $row."event:props:collection"
      clicks = Convert-ToNumber $row.events
      downstream_reads = 0.0
    }
  }
) | Sort-Object -Property @{ Expression = { $_.clicks }; Descending = $true } | Select-Object -First $ModuleLimit

function Get-PeriodSnapshot {
  param(
    [string]$Label,
    [object]$DateRange
  )

  $traffic = Get-AggregateMap -Response (Invoke-PlausibleQuery -Metrics $pageMetrics -DateRange $DateRange) -Metrics $pageMetrics
  $reads = Get-AggregateMap -Response (Invoke-PlausibleQuery -Metrics $eventMetric -Filters @("is", "event:goal", @("essay_read")) -DateRange $DateRange) -Metrics $eventMetric
  $downloads = Get-AggregateMap -Response (Invoke-PlausibleQuery -Metrics $eventMetric -Filters @("is", "event:goal", @("pdf_download")) -DateRange $DateRange) -Metrics $eventMetric
  $newsletter = Get-AggregateMap -Response (Invoke-PlausibleQuery -Metrics $eventMetric -Filters @("is", "event:goal", @("newsletter_submit")) -DateRange $DateRange) -Metrics $eventMetric

  return [ordered]@{
    label = $Label
    pageviews = $traffic.pageviews
    unique_visitors = $traffic.visitors
    reads = $reads.events
    read_rate = if ($traffic.pageviews -gt 0) { [Math]::Round(($reads.events / $traffic.pageviews) * 100, 1) } else { 0.0 }
    pdf_downloads = $downloads.events
    newsletter_submits = $newsletter.events
  }
}

$periods = @(
  Get-PeriodSnapshot -Label "Last 7 days" -DateRange "7d"
  Get-PeriodSnapshot -Label "Last 30 days" -DateRange "30d"
  Get-PeriodSnapshot -Label $AllTimeLabel -DateRange "all"
)

$output = @{
  overview = $overview
  essays = $essays
  sources = $sources
  modules = $modules
  periods = $periods
}

foreach ($section in @("overview", "essays", "sources", "modules", "periods")) {
  $targetPath = Join-Path $OutputDir "$section.json"
  Write-Utf8Json -Path $targetPath -Value $output[$section]
  Write-Host ("Wrote {0}" -f $targetPath) -ForegroundColor Green
}

Write-Host ("`nFetched {0} essays, {1} sources, {2} modules, and {3} period snapshots." -f $essays.Count, $sources.Count, $modules.Count, $periods.Count) -ForegroundColor Green
