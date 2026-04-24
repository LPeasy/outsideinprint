param(
  [string]$PriorityUrlsPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/priority-urls.json'),
  [string]$WorksheetPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/rollout-worksheet.csv'),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout'),
  [string]$CanonicalHost = 'outsideinprint.org'
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

function Get-PropertyValue {
  param(
    [object]$Object,
    [string]$Name,
    [object]$Default = ''
  )

  if ($null -eq $Object) {
    return $Default
  }

  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $Default
  }

  if ($null -eq $property.Value) {
    return $Default
  }

  return $property.Value
}

function Test-CanonicalHost {
  param(
    [string]$Url,
    [string]$ExpectedHost
  )

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $true
  }

  try {
    return ([System.Uri]$Url).Host -eq $ExpectedHost
  }
  catch {
    return $false
  }
}

function Get-WorksheetRowsByUrl {
  param([string]$Path)

  $lookup = @{}
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $lookup
  }

  foreach ($row in @(Import-Csv -Path $Path)) {
    $url = [string](Get-PropertyValue -Object $row -Name 'url')
    if (-not [string]::IsNullOrWhiteSpace($url) -and -not $lookup.ContainsKey($url)) {
      $lookup[$url] = $row
    }
  }

  return $lookup
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$priorityRows = @((Read-JsonFile -Path $PriorityUrlsPath))
if ($priorityRows.Count -eq 0) {
  throw "Priority URL list is empty: $PriorityUrlsPath"
}

$worksheetLookup = Get-WorksheetRowsByUrl -Path $WorksheetPath

$inspectionRows = foreach ($priorityRow in $priorityRows) {
  $url = [string](Get-PropertyValue -Object $priorityRow -Name 'canonical_url')
  $worksheetRow = if ($worksheetLookup.ContainsKey($url)) { $worksheetLookup[$url] } else { $null }
  $selectedCanonical = [string](Get-PropertyValue -Object $worksheetRow -Name 'selected_canonical')
  $indexed = [string](Get-PropertyValue -Object $worksheetRow -Name 'indexed')
  $priorityTier = [string](Get-PropertyValue -Object $priorityRow -Name 'priority_tier')
  $blockingFindings = New-Object System.Collections.Generic.List[string]

  if (-not (Test-CanonicalHost -Url $selectedCanonical -ExpectedHost $CanonicalHost)) {
    $blockingFindings.Add('selected_canonical_not_canonical_host')
  }

  if ($priorityTier -in @('tier_0', 'tier_1') -and $indexed -match '^(no|false|excluded)$') {
    $blockingFindings.Add('priority_core_url_not_indexed')
  }

  $googleSelectedCanonical = [string](Get-PropertyValue -Object $worksheetRow -Name 'google_selected_canonical' -Default $selectedCanonical)
  $bingSelectedCanonical = [string](Get-PropertyValue -Object $worksheetRow -Name 'bing_selected_canonical' -Default $selectedCanonical)

  [pscustomobject][ordered]@{
    url = $url
    path = [string](Get-PropertyValue -Object $priorityRow -Name 'path')
    title = [string](Get-PropertyValue -Object $priorityRow -Name 'title')
    kind = [string](Get-PropertyValue -Object $priorityRow -Name 'kind')
    priority_tier = $priorityTier
    google_verified = [string](Get-PropertyValue -Object $worksheetRow -Name 'google_verified')
    google_indexed = $indexed
    google_selected_canonical = $googleSelectedCanonical
    google_exclusion_reason = [string](Get-PropertyValue -Object $worksheetRow -Name 'google_exclusion_reason')
    bing_verified = [string](Get-PropertyValue -Object $worksheetRow -Name 'bing_verified')
    bing_indexed = $indexed
    bing_selected_canonical = $bingSelectedCanonical
    bing_exclusion_reason = [string](Get-PropertyValue -Object $worksheetRow -Name 'bing_exclusion_reason')
    blocking_finding = if ($blockingFindings.Count -gt 0) { ($blockingFindings -join '; ') } else { '' }
    notes = [string](Get-PropertyValue -Object $worksheetRow -Name 'notes')
  }
}

$csvPath = Join-Path $OutputDir 'search-console-inspection-pack.csv'
$markdownPath = Join-Path $OutputDir 'search-console-inspection-pack.md'

$inspectionRows | Export-Csv -Path $csvPath -NoTypeInformation -Encoding utf8

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# Search Console Inspection Pack')
$lines.Add('')
$lines.Add(('- Generated at: {0}' -f (Get-Date).ToString('o')))
$lines.Add(('- Canonical host: https://{0}' -f $CanonicalHost))
$lines.Add(('- Priority URLs: {0}' -f $inspectionRows.Count))
$lines.Add('')
$lines.Add('Use this sheet to record Google Search Console and Bing Webmaster Tools inspection outcomes. Do not infer these fields from local probes.')
$lines.Add('')
$lines.Add('## Blocking Findings')
$lines.Add('')
$blockingRows = @($inspectionRows | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.blocking_finding) })
if ($blockingRows.Count -eq 0) {
  $lines.Add('- None recorded in the current worksheet.')
}
else {
  foreach ($row in $blockingRows) {
    $lines.Add(('- {0}: {1}' -f $row.url, $row.blocking_finding))
  }
}
$lines.Add('')
$lines.Add('## Inspection Rows')
$lines.Add('')
$lines.Add('| Tier | Kind | URL | Google selected canonical | Bing selected canonical | Blocking finding |')
$lines.Add('| --- | --- | --- | --- | --- | --- |')
foreach ($row in $inspectionRows) {
  $lines.Add(('| {0} | {1} | {2} | {3} | {4} | {5} |' -f $row.priority_tier, $row.kind, $row.url, $row.google_selected_canonical, $row.bing_selected_canonical, $row.blocking_finding))
}
$lines.Add('')
$lines.Add('## Manual Fields')
$lines.Add('')
$lines.Add('- `google_selected_canonical` and `bing_selected_canonical` should come from the search-engine inspection tools.')
$lines.Add('- `google_exclusion_reason` and `bing_exclusion_reason` should record the exact tool-facing exclusion reason.')
$lines.Add('- `blocking_finding` is reserved for canonical-host mismatches, excluded Tier 0 or Tier 1 pages, and other manual acceptance blockers.')

$lines -join [Environment]::NewLine | Out-File -FilePath $markdownPath -Encoding utf8

Write-Host ("Wrote Search Console inspection pack to {0}" -f $OutputDir)
$global:LASTEXITCODE = 0
exit 0
