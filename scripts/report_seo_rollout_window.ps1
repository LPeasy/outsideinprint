param(
  [string]$DataDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'data/analytics'),
  [string]$BaselinePath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/baseline.json'),
  [string]$WorksheetPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/rollout-worksheet.csv'),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout'),
  [string]$Label = 'measurement-window'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-JsonDocument {
  param([string]$Json)

  $trimmed = $Json.Trim()
  $isArrayDocument = $trimmed.StartsWith('[') -and $trimmed.EndsWith(']')

  if ($isArrayDocument -and $trimmed -match '^\[\s*\]$') {
    return ,@()
  }

  $convertFromJson = Get-Command ConvertFrom-Json -ErrorAction Stop
  if ($convertFromJson.Parameters.ContainsKey('NoEnumerate')) {
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

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing required JSON input: $Path"
  }

  return (Convert-JsonDocument -Json (Get-Content -Path $Path -Raw))
}

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )

  ($Value | ConvertTo-Json -Depth 20) | Out-File -FilePath $Path -Encoding utf8
}

function Format-Number {
  param([object]$Value)

  return ('{0:N0}' -f [double]$Value)
}

function Get-DisplayTitle {
  param([object]$Value)

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return ''
  }

  return (($text -replace '\s*\|\s*Outside In Print\s*$', '').Trim())
}

function Get-ChannelSummaries {
  param([object[]]$SourceRows)

  $summaries = foreach ($group in @($SourceRows | Group-Object acquisition_channel)) {
    $rows = @($group.Group)
    [pscustomobject][ordered]@{
      acquisition_channel = [string]$group.Name
      pageviews = [int]($rows | Measure-Object -Property pageviews -Sum).Sum
      visitors = [int]($rows | Measure-Object -Property visitors -Sum).Sum
      reads = [int]($rows | Measure-Object -Property reads -Sum).Sum
      source_rows = $rows.Count
    }
  }

  return @(
    $summaries |
      Sort-Object -Property @(
        @{ Expression = 'pageviews'; Descending = $true },
        @{ Expression = 'acquisition_channel'; Descending = $false }
      )
  )
}

function Get-ChannelPageviews {
  param(
    [object[]]$Channels,
    [string]$Name
  )

  $match = @($Channels | Where-Object { $_.acquisition_channel -eq $Name } | Select-Object -First 1)
  if ($match.Count -eq 0) {
    return 0
  }

  return [int]$match[0].pageviews
}

function Get-ExternalPageviews {
  param([object[]]$Channels)

  return [int](($Channels | Where-Object { $_.acquisition_channel -notin @('internal', 'legacy_domain') } | Measure-Object -Property pageviews -Sum).Sum)
}

function Get-TopExternalEssays {
  param(
    [object[]]$JourneyRows,
    [int]$Limit = 10
  )

  $externalRows = @(
    $JourneyRows |
      Where-Object {
        $channel = [string]$_.acquisition_channel
        -not [string]::IsNullOrWhiteSpace([string]$_.path) -and
        $channel -notin @('internal', 'legacy_domain')
      }
  )

  $grouped = foreach ($group in @($externalRows | Group-Object path)) {
    $rows = @($group.Group)
    $first = $rows[0]
    [pscustomobject][ordered]@{
      title = Get-DisplayTitle -Value $first.title
      path = [string]$group.Name
      pageviews = [int]($rows | Measure-Object -Property views -Sum).Sum
      reads = [int]($rows | Measure-Object -Property reads -Sum).Sum
      pdf_downloads = [int]($rows | Measure-Object -Property pdf_downloads -Sum).Sum
      newsletter_submits = [int]($rows | Measure-Object -Property newsletter_submits -Sum).Sum
    }
  }

  return @(
    $grouped |
      Sort-Object -Property @(
        @{ Expression = 'pageviews'; Descending = $true },
        @{ Expression = 'title'; Descending = $false }
      ) |
      Select-Object -First $Limit
  )
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$baseline = Read-JsonFile -Path $BaselinePath
$overview = Read-JsonFile -Path (Join-Path $DataDir 'overview.json')
$sources = @((Read-JsonFile -Path (Join-Path $DataDir 'sources.json')))
$journeys = @((Read-JsonFile -Path (Join-Path $DataDir 'journeys.json')))
$currentChannels = @(Get-ChannelSummaries -SourceRows $sources)
$baselineChannels = @($baseline.acquisition_channels)
$topExternalEssays = @(Get-TopExternalEssays -JourneyRows $journeys)
$worksheetRows = if (Test-Path -LiteralPath $WorksheetPath -PathType Leaf) { @((Import-Csv -Path $WorksheetPath)) } else { @() }

$allChannelNames = @(
  @($baselineChannels | ForEach-Object { [string]$_.acquisition_channel }) +
  @($currentChannels | ForEach-Object { [string]$_.acquisition_channel })
) | Sort-Object -Unique

$channelComparisons = foreach ($channelName in $allChannelNames) {
  $baselinePageviews = Get-ChannelPageviews -Channels $baselineChannels -Name $channelName
  $currentPageviews = Get-ChannelPageviews -Channels $currentChannels -Name $channelName
  [pscustomobject][ordered]@{
    acquisition_channel = $channelName
    baseline_pageviews = $baselinePageviews
    current_pageviews = $currentPageviews
    delta_pageviews = ($currentPageviews - $baselinePageviews)
  }
}

$baselineExternal = Get-ExternalPageviews -Channels $baselineChannels
$currentExternal = Get-ExternalPageviews -Channels $currentChannels

$priorityStatus = @(
  $worksheetRows |
    Select-Object url, priority_tier, deployed, live_smoke_passed, legacy_redirect_passed, google_verified, bing_verified, selected_canonical, indexed, notes
)

$summary = [ordered]@{
  label = $Label
  generated_at = (Get-Date).ToString('o')
  baseline_snapshot_date = [string]$baseline.data_snapshot.updated_at
  current_snapshot_date = [string]$overview.updated_at
  baseline_external_pageviews = $baselineExternal
  current_external_pageviews = $currentExternal
  external_pageview_delta = ($currentExternal - $baselineExternal)
  legacy_domain_pageviews_baseline = (Get-ChannelPageviews -Channels $baselineChannels -Name 'legacy_domain')
  legacy_domain_pageviews_current = (Get-ChannelPageviews -Channels $currentChannels -Name 'legacy_domain')
  organic_search_pageviews_baseline = (Get-ChannelPageviews -Channels $baselineChannels -Name 'organic_search')
  organic_search_pageviews_current = (Get-ChannelPageviews -Channels $currentChannels -Name 'organic_search')
  ai_answer_engine_pageviews_current = (Get-ChannelPageviews -Channels $currentChannels -Name 'ai_answer_engine')
  thresholds = [ordered]@{
    legacy_domain_trending_down = ((Get-ChannelPageviews -Channels $currentChannels -Name 'legacy_domain') -lt (Get-ChannelPageviews -Channels $baselineChannels -Name 'legacy_domain'))
    organic_search_above_baseline = ((Get-ChannelPageviews -Channels $currentChannels -Name 'organic_search') -gt (Get-ChannelPageviews -Channels $baselineChannels -Name 'organic_search'))
    ai_answer_engine_detected = ((Get-ChannelPageviews -Channels $currentChannels -Name 'ai_answer_engine') -gt 0)
  }
}

$report = [ordered]@{
  summary = $summary
  channel_comparisons = @($channelComparisons)
  current_channels = @($currentChannels)
  top_external_essays = @($topExternalEssays)
  priority_url_status = @($priorityStatus)
}

$jsonPath = Join-Path $OutputDir 'measurement-window-report.json'
$markdownPath = Join-Path $OutputDir 'measurement-window-report.md'
Write-JsonFile -Path $jsonPath -Value $report

$markdown = New-Object System.Collections.Generic.List[string]
$markdown.Add(('## SEO Rollout Window: {0}' -f $Label))
$markdown.Add('')
$markdown.Add(('- Baseline snapshot: {0}' -f $summary.baseline_snapshot_date))
$markdown.Add(('- Current snapshot: {0}' -f $summary.current_snapshot_date))
$markdown.Add(('- External pageviews excluding `internal` and `legacy_domain`: baseline {0}, current {1}, delta {2:+#;-#;0}' -f $summary.baseline_external_pageviews, $summary.current_external_pageviews, $summary.external_pageview_delta))
$markdown.Add(('- Legacy-domain pageviews: baseline {0}, current {1}' -f $summary.legacy_domain_pageviews_baseline, $summary.legacy_domain_pageviews_current))
$markdown.Add(('- Organic-search pageviews: baseline {0}, current {1}' -f $summary.organic_search_pageviews_baseline, $summary.organic_search_pageviews_current))
$markdown.Add(('- AI-answer-engine pageviews: current {0}' -f $summary.ai_answer_engine_pageviews_current))
$markdown.Add('')
$markdown.Add('| Channel | Baseline | Current | Delta |')
$markdown.Add('| --- | ---: | ---: | ---: |')
foreach ($row in $channelComparisons) {
  $markdown.Add(('| {0} | {1} | {2} | {3:+#;-#;0} |' -f $row.acquisition_channel, $row.baseline_pageviews, $row.current_pageviews, $row.delta_pageviews))
}

$markdown.Add('')
$markdown.Add('### Top Externally Discovered Essays')
$markdown.Add('')
$markdown.Add('| Title | Path | Pageviews | Reads |')
$markdown.Add('| --- | --- | ---: | ---: |')
foreach ($row in $topExternalEssays) {
  $markdown.Add(('| {0} | {1} | {2} | {3} |' -f $row.title, $row.path, (Format-Number -Value $row.pageviews), (Format-Number -Value $row.reads)))
}

if ($priorityStatus.Count -gt 0) {
  $markdown.Add('')
  $markdown.Add('### Priority URL Status')
  $markdown.Add('')
  $markdown.Add('| URL | Tier | Deployed | Live smoke | Legacy redirect | Indexed | Selected canonical |')
  $markdown.Add('| --- | --- | --- | --- | --- | --- | --- |')
  foreach ($row in $priorityStatus) {
    $markdown.Add(('| {0} | {1} | {2} | {3} | {4} | {5} | {6} |' -f $row.url, $row.priority_tier, $row.deployed, $row.live_smoke_passed, $row.legacy_redirect_passed, $row.indexed, $row.selected_canonical))
  }
}

$markdown -join [Environment]::NewLine | Out-File -FilePath $markdownPath -Encoding utf8

Write-Host ("Wrote SEO rollout measurement report to {0}" -f $OutputDir)
$global:LASTEXITCODE = 0
exit 0
