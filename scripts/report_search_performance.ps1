param(
  [string]$GoogleCsvPath = '',
  [string]$BingCsvPath = '',
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout'),
  [int]$MinImpressions = 25,
  [double]$WeakCtrThreshold = 0.02
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )

  ($Value | ConvertTo-Json -Depth 20) | Out-File -FilePath $Path -Encoding utf8
}

function Get-ColumnValue {
  param(
    [object]$Row,
    [string[]]$Names
  )

  foreach ($name in $Names) {
    foreach ($property in $Row.PSObject.Properties) {
      if ($property.Name -eq $name -or $property.Name.ToLowerInvariant() -eq $name.ToLowerInvariant()) {
        return [string]$property.Value
      }
    }
  }

  return ''
}

function ConvertTo-Integer {
  param([string]$Value)

  $text = ([string]$Value -replace ',', '').Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    return 0
  }

  return [int][double]$text
}

function ConvertTo-Rate {
  param(
    [string]$Value,
    [int]$Clicks,
    [int]$Impressions
  )

  $text = ([string]$Value).Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    if ($Impressions -gt 0) {
      return [double]$Clicks / [double]$Impressions
    }

    return 0
  }

  if ($text.EndsWith('%')) {
    return [double]($text.TrimEnd('%')) / 100.0
  }

  return [double]$text
}

function ConvertTo-Position {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return 0
  }

  return [double]$Value
}

function Read-SearchRows {
  param(
    [string]$Path,
    [string]$Source
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return @()
  }

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing search performance CSV: $Path"
  }

  return @(
    Import-Csv -Path $Path | ForEach-Object {
      $clicks = ConvertTo-Integer -Value (Get-ColumnValue -Row $_ -Names @('clicks', 'Clicks'))
      $impressions = ConvertTo-Integer -Value (Get-ColumnValue -Row $_ -Names @('impressions', 'Impressions'))
      $ctr = ConvertTo-Rate -Value (Get-ColumnValue -Row $_ -Names @('ctr', 'CTR', 'Click through rate')) -Clicks $clicks -Impressions $impressions

      [pscustomobject][ordered]@{
        source = $Source
        query = Get-ColumnValue -Row $_ -Names @('query', 'Top queries', 'Search term', 'Keyword')
        url = Get-ColumnValue -Row $_ -Names @('url', 'URL', 'page', 'Page', 'Landing page', 'Pages')
        clicks = $clicks
        impressions = $impressions
        ctr = $ctr
        position = ConvertTo-Position -Value (Get-ColumnValue -Row $_ -Names @('position', 'Position', 'Avg. position', 'Average position'))
      }
    }
  )
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$templatePath = Join-Path $OutputDir 'search-performance-input-template.csv'
$jsonPath = Join-Path $OutputDir 'search-performance-report.json'
$markdownPath = Join-Path $OutputDir 'search-performance-report.md'

$templateRows = @(
  [pscustomobject][ordered]@{
    source = 'google'
    query = ''
    url = 'https://outsideinprint.org/'
    clicks = ''
    impressions = ''
    ctr = ''
    position = ''
    notes = ''
  },
  [pscustomobject][ordered]@{
    source = 'bing'
    query = ''
    url = 'https://outsideinprint.org/'
    clicks = ''
    impressions = ''
    ctr = ''
    position = ''
    notes = ''
  }
)
$templateRows | Export-Csv -Path $templatePath -NoTypeInformation -Encoding utf8

$rows = @()
$rows += Read-SearchRows -Path $GoogleCsvPath -Source 'google'
$rows += Read-SearchRows -Path $BingCsvPath -Source 'bing'

$lowCtrOpportunities = @(
  $rows |
    Where-Object {
      [int]$_.impressions -ge $MinImpressions -and
      [double]$_.ctr -le $WeakCtrThreshold
    } |
    Sort-Object -Property @(
      @{ Expression = 'impressions'; Descending = $true },
      @{ Expression = 'clicks'; Descending = $false },
      @{ Expression = 'position'; Descending = $false }
    )
)

$urlSummaries = foreach ($group in @($rows | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.url) } | Group-Object url)) {
  $groupRows = @($group.Group)
  $clicks = [int]($groupRows | Measure-Object -Property clicks -Sum).Sum
  $impressions = [int]($groupRows | Measure-Object -Property impressions -Sum).Sum
  [pscustomobject][ordered]@{
    url = [string]$group.Name
    clicks = $clicks
    impressions = $impressions
    ctr = if ($impressions -gt 0) { [double]$clicks / [double]$impressions } else { 0 }
    query_rows = $groupRows.Count
  }
}

$report = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  inputs = [ordered]@{
    google_csv_path = $GoogleCsvPath
    bing_csv_path = $BingCsvPath
    template_path = $templatePath
  }
  thresholds = [ordered]@{
    min_impressions = $MinImpressions
    weak_ctr_threshold = $WeakCtrThreshold
  }
  rows = @($rows)
  url_summaries = @($urlSummaries)
  low_ctr_opportunities = @($lowCtrOpportunities)
}

Write-JsonFile -Path $jsonPath -Value $report

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# Search Performance Report')
$lines.Add('')
$lines.Add(('- Generated at: {0}' -f $report.generated_at))
$lines.Add(('- Input rows: {0}' -f $rows.Count))
$lines.Add(('- Template: {0}' -f $templatePath))
$lines.Add('')
$lines.Add('## Low CTR Opportunities')
$lines.Add('')
if ($lowCtrOpportunities.Count -eq 0) {
  $lines.Add('- None found with the current input and thresholds.')
}
else {
  $lines.Add('| Source | Query | URL | Clicks | Impressions | CTR | Position |')
  $lines.Add('| --- | --- | --- | ---: | ---: | ---: | ---: |')
  foreach ($row in $lowCtrOpportunities) {
    $lines.Add(('| {0} | {1} | {2} | {3} | {4} | {5:P2} | {6:N1} |' -f $row.source, ($row.query -replace '\|', '\|'), $row.url, $row.clicks, $row.impressions, $row.ctr, $row.position))
  }
}
$lines.Add('')
$lines.Add('Use this report for targeted title and description work only after canonical and indexation signals are stable.')

$lines -join [Environment]::NewLine | Out-File -FilePath $markdownPath -Encoding utf8

Write-Host ("Wrote search performance report to {0}" -f $OutputDir)
$global:LASTEXITCODE = 0
exit 0
