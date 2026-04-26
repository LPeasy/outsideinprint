param(
  [string]$DataDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'data/analytics'),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout'),
  [string]$CanonicalBaseUrl = 'https://outsideinprint.org',
  [string]$LegacyBaseUrl = 'https://lpeasy.github.io/outsideinprint',
  [int]$TopEssayCount = 10
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

function Normalize-SectionLabel {
  param([object]$Value)

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return 'Unlabeled'
  }

  switch -Regex ($text.Trim().ToLowerInvariant()) {
    '^essay(s)?$' { return 'Essays' }
    '^working[\s-]?paper(s)?$' { return 'Working Papers' }
    '^dialogue(s)?$' { return 'Dialogues' }
    '^syd(\s+and\s+|\s*&\s*)oliver$' { return 'Dialogues' }
    '^s(?:\s+and\s+|\s*&\s*)o$' { return 'Dialogues' }
    '^collection(s)?$' { return 'Collections' }
    default { return $text.Trim() }
  }
}

function Join-CanonicalUrl {
  param(
    [string]$BaseUrl,
    [string]$Path
  )

  $base = $BaseUrl.TrimEnd('/') + '/'
  $relative = $Path.TrimStart('/')
  return ([System.Uri]($base + $relative)).AbsoluteUri
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

function Get-TopExternalEssays {
  param(
    [object[]]$JourneyRows,
    [int]$Limit
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
      slug = [string]$first.slug
      section = [string]$first.section
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

$overview = Read-JsonFile -Path (Join-Path $DataDir 'overview.json')
$sources = @((Read-JsonFile -Path (Join-Path $DataDir 'sources.json')))
$essays = @((Read-JsonFile -Path (Join-Path $DataDir 'essays.json')))
$journeyByEssay = @((Read-JsonFile -Path (Join-Path $DataDir 'journey_by_essay.json')))
$journeys = @((Read-JsonFile -Path (Join-Path $DataDir 'journeys.json')))

$priorityEssays = @(
  $essays |
    Where-Object {
      (Normalize-SectionLabel -Value $_.section) -eq 'Essays' -and
      ([string]$_.path).StartsWith('/essays/')
    } |
    Sort-Object -Property @(
      @{ Expression = 'views'; Descending = $true },
      @{ Expression = 'title'; Descending = $false }
    ) |
    Select-Object -First $TopEssayCount
)

$priorityUrlRows = @()
foreach ($coreRow in @(
  [pscustomobject]@{ path = '/'; title = 'Homepage'; kind = 'core'; priority_tier = 'tier_0'; views = [int][double]$overview.pageviews },
  [pscustomobject]@{ path = '/about/'; title = 'About'; kind = 'core'; priority_tier = 'tier_0'; views = 0 },
  [pscustomobject]@{ path = '/authors/robert-v-ussley/'; title = 'Robert V. Ussley'; kind = 'core'; priority_tier = 'tier_0'; views = 0 },
  [pscustomobject]@{ path = '/collections/'; title = 'Collections'; kind = 'core'; priority_tier = 'tier_0'; views = 0 },
  [pscustomobject]@{ path = '/library/'; title = 'Library'; kind = 'core'; priority_tier = 'tier_0'; views = 0 },
  [pscustomobject]@{ path = '/collections/risk-uncertainty/'; title = 'Risk, Uncertainty, and Decision-Making'; kind = 'collection'; priority_tier = 'tier_1'; views = 0 }
)) {
  $priorityUrlRows += [pscustomobject][ordered]@{
      path = [string]$coreRow.path
      canonical_url = Join-CanonicalUrl -BaseUrl $CanonicalBaseUrl -Path ([string]$coreRow.path)
      legacy_url = Join-CanonicalUrl -BaseUrl $LegacyBaseUrl -Path ([string]$coreRow.path)
      priority_tier = [string]$coreRow.priority_tier
      kind = [string]$coreRow.kind
      title = [string]$coreRow.title
      views = [int]$coreRow.views
    }
}

foreach ($essay in $priorityEssays) {
  $path = [string]$essay.path
  if (@($priorityUrlRows | Where-Object { $_.path -eq $path }).Count -gt 0) {
    continue
  }

  $priorityUrlRows += [pscustomobject][ordered]@{
      path = $path
      canonical_url = Join-CanonicalUrl -BaseUrl $CanonicalBaseUrl -Path $path
      legacy_url = Join-CanonicalUrl -BaseUrl $LegacyBaseUrl -Path $path
      priority_tier = 'tier_1'
      kind = 'essay'
      title = Get-DisplayTitle -Value $essay.title
      views = [int][double]$essay.views
    }
}

$channelSummaries = @(Get-ChannelSummaries -SourceRows $sources)
$topJourneyEssays = @(
  $journeyByEssay |
    Sort-Object -Property @(
      @{ Expression = 'views'; Descending = $true },
      @{ Expression = 'title'; Descending = $false }
    ) |
    Select-Object -First $TopEssayCount |
    ForEach-Object {
      [pscustomobject][ordered]@{
        title = Get-DisplayTitle -Value $_.title
        path = [string]$_.path
        slug = [string]$_.slug
        section = [string]$_.section
        pageviews = [int][double]$_.views
        reads = [int][double]$_.reads
        pdf_downloads = [int][double]$_.pdf_downloads
        newsletter_submits = [int][double]$_.newsletter_submits
      }
    }
)

$topExternalEssays = @(Get-TopExternalEssays -JourneyRows $journeys -Limit $TopEssayCount)
$priorityUrls = @($priorityUrlRows)
$legacySampleRows = @(
  $priorityUrlRows | ForEach-Object {
    [pscustomobject][ordered]@{
      title = [string]$_.title
      path = [string]$_.path
      legacy_url = [string]$_.legacy_url
      expected_canonical_url = [string]$_.canonical_url
      priority_tier = [string]$_.priority_tier
      kind = [string]$_.kind
    }
  }
)
$worksheetColumns = @(
  'url',
  'priority_tier',
  'deployed',
  'live_smoke_passed',
  'legacy_redirect_passed',
  'google_verified',
  'bing_verified',
  'selected_canonical',
  'indexed',
  'notes'
)

$baseline = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  canonical_base_url = $CanonicalBaseUrl.TrimEnd('/')
  legacy_base_url = $LegacyBaseUrl.TrimEnd('/')
  data_snapshot = [ordered]@{
    updated_at = [string]$overview.updated_at
    range_label = [string]$overview.range_label
    pageviews = [int][double]$overview.pageviews
    unique_visitors = [int][double]$overview.unique_visitors
    reads = [int][double]$overview.reads
    read_rate = [double]$overview.read_rate
    pdf_downloads = [int][double]$overview.pdf_downloads
    newsletter_submits = [int][double]$overview.newsletter_submits
  }
  acquisition_channels = $channelSummaries
  top_journey_essays = $topJourneyEssays
  top_external_essays = $topExternalEssays
  priority_urls = $priorityUrls
  legacy_sample_urls = $legacySampleRows
  worksheet_columns = $worksheetColumns
}

$worksheetRows = foreach ($row in $priorityUrls) {
  [pscustomobject][ordered]@{
    url = [string]$row.canonical_url
    priority_tier = [string]$row.priority_tier
    deployed = ''
    live_smoke_passed = ''
    legacy_redirect_passed = ''
    google_verified = ''
    bing_verified = ''
    selected_canonical = ''
    indexed = ''
    notes = ''
  }
}

$baselinePath = Join-Path $OutputDir 'baseline.json'
$priorityUrlsPath = Join-Path $OutputDir 'priority-urls.json'
$worksheetPath = Join-Path $OutputDir 'rollout-worksheet.csv'
$markdownPath = Join-Path $OutputDir 'baseline.md'

Write-JsonFile -Path $baselinePath -Value $baseline
Write-JsonFile -Path $priorityUrlsPath -Value $priorityUrls
$worksheetRows | Export-Csv -Path $worksheetPath -NoTypeInformation -Encoding utf8

$externalBaselinePageviews = [int](($channelSummaries | Where-Object { $_.acquisition_channel -notin @('internal', 'legacy_domain') } | Measure-Object -Property pageviews -Sum).Sum)
$markdownLines = New-Object System.Collections.Generic.List[string]
$markdownLines.Add('# SEO Rollout Baseline')
$markdownLines.Add('')
$markdownLines.Add(('- Generated at: {0}' -f $baseline.generated_at))
$markdownLines.Add(('- Snapshot date: {0}' -f $baseline.data_snapshot.updated_at))
$markdownLines.Add(('- Time range: {0}' -f $baseline.data_snapshot.range_label))
$markdownLines.Add(('- Pageviews: {0}' -f (Format-Number -Value $baseline.data_snapshot.pageviews)))
$markdownLines.Add(('- Unique visitors: {0}' -f (Format-Number -Value $baseline.data_snapshot.unique_visitors)))
$markdownLines.Add(('- Reads: {0}' -f (Format-Number -Value $baseline.data_snapshot.reads)))
$markdownLines.Add(('- PDF downloads: {0}' -f (Format-Number -Value $baseline.data_snapshot.pdf_downloads)))
$markdownLines.Add(('- Newsletter submits: {0}' -f (Format-Number -Value $baseline.data_snapshot.newsletter_submits)))
$markdownLines.Add(('- External pageviews excluding `internal` and `legacy_domain`: {0}' -f (Format-Number -Value $externalBaselinePageviews)))
$markdownLines.Add('')
$markdownLines.Add('## Acquisition Channels')
$markdownLines.Add('')
$markdownLines.Add('| Channel | Pageviews | Visitors | Reads | Source rows |')
$markdownLines.Add('| --- | ---: | ---: | ---: | ---: |')
foreach ($channel in $channelSummaries) {
  $markdownLines.Add(('| {0} | {1} | {2} | {3} | {4} |' -f $channel.acquisition_channel, (Format-Number -Value $channel.pageviews), (Format-Number -Value $channel.visitors), (Format-Number -Value $channel.reads), (Format-Number -Value $channel.source_rows)))
}

$markdownLines.Add('')
$markdownLines.Add('## Priority URLs')
$markdownLines.Add('')
$markdownLines.Add('| Tier | Kind | Title | Canonical URL | Legacy URL | Views |')
$markdownLines.Add('| --- | --- | --- | --- | --- | ---: |')
foreach ($row in $priorityUrls) {
  $markdownLines.Add(('| {0} | {1} | {2} | {3} | {4} | {5} |' -f $row.priority_tier, $row.kind, $row.title, $row.canonical_url, $row.legacy_url, (Format-Number -Value $row.views)))
}

$markdownLines.Add('')
$markdownLines.Add('## Top External Essays')
$markdownLines.Add('')
$markdownLines.Add('| Title | Path | Pageviews | Reads |')
$markdownLines.Add('| --- | --- | ---: | ---: |')
foreach ($row in $topExternalEssays) {
  $markdownLines.Add(('| {0} | {1} | {2} | {3} |' -f $row.title, $row.path, (Format-Number -Value $row.pageviews), (Format-Number -Value $row.reads)))
}

$markdownLines -join [Environment]::NewLine | Out-File -FilePath $markdownPath -Encoding utf8

Write-Host ("Wrote SEO rollout baseline artifacts to {0}" -f $OutputDir)
$global:LASTEXITCODE = 0
exit 0
