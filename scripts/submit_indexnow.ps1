param(
  [string]$PriorityUrlsPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/priority-urls.json'),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout'),
  [string[]]$Urls = @(),
  [switch]$UsePriorityUrls,
  [switch]$DryRun,
  [string]$HostName = 'outsideinprint.org',
  [string]$Key = $env:INDEXNOW_KEY,
  [string]$Endpoint = 'https://api.indexnow.org/indexnow'
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
  if ($null -eq $property -or $null -eq $property.Value) {
    return $Default
  }

  return $property.Value
}

function Assert-CanonicalUrl {
  param(
    [string]$Url,
    [string]$ExpectedHost
  )

  if ([string]::IsNullOrWhiteSpace($Url)) {
    throw 'IndexNow URL list contains a blank URL.'
  }

  $uri = [System.Uri]$Url
  if ($uri.Scheme -ne 'https' -or $uri.Host -ne $ExpectedHost) {
    throw "IndexNow submissions must use canonical https://$ExpectedHost URLs only. Invalid URL: $Url"
  }
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$candidateUrls = New-Object System.Collections.Generic.List[string]
if ($UsePriorityUrls) {
  foreach ($row in @((Read-JsonFile -Path $PriorityUrlsPath))) {
    $candidateUrls.Add([string](Get-PropertyValue -Object $row -Name 'canonical_url'))
  }
}

foreach ($url in $Urls) {
  $candidateUrls.Add([string]$url)
}

$canonicalUrls = @(
  $candidateUrls |
    Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } |
    Select-Object -Unique
)

if ($canonicalUrls.Count -eq 0) {
  throw 'No IndexNow URLs were provided. Use -UsePriorityUrls or pass -Urls.'
}

foreach ($url in $canonicalUrls) {
  Assert-CanonicalUrl -Url $url -ExpectedHost $HostName
}

$keyLocation = if ([string]::IsNullOrWhiteSpace($Key)) { '' } else { "https://$HostName/$Key.txt" }
$submission = $null
$submitted = $false

if (-not $DryRun) {
  if ([string]::IsNullOrWhiteSpace($Key)) {
    throw 'INDEXNOW_KEY is required for a real IndexNow submission. Re-run with -DryRun to inspect the plan.'
  }

  $body = [ordered]@{
    host = $HostName
    key = $Key
    keyLocation = $keyLocation
    urlList = @($canonicalUrls)
  }

  $submission = Invoke-RestMethod -Method Post -Uri $Endpoint -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 5)
  $submitted = $true
}

$plan = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  dry_run = [bool]$DryRun
  endpoint = $Endpoint
  host = $HostName
  key_present = -not [string]::IsNullOrWhiteSpace($Key)
  key_location = $keyLocation
  url_count = $canonicalUrls.Count
  urls = @($canonicalUrls)
  submitted = $submitted
  response = $submission
}

$jsonPath = Join-Path $OutputDir 'indexnow-submit-plan.json'
$markdownPath = Join-Path $OutputDir 'indexnow-submit-plan.md'
Write-JsonFile -Path $jsonPath -Value $plan

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# IndexNow Submit Plan')
$lines.Add('')
$lines.Add(('- Generated at: {0}' -f $plan.generated_at))
$lines.Add(('- Endpoint: {0}' -f $plan.endpoint))
$lines.Add(('- Host: {0}' -f $plan.host))
$lines.Add(('- Dry run: {0}' -f $plan.dry_run))
$lines.Add(('- INDEXNOW_KEY present: {0}' -f $plan.key_present))
$lines.Add(('- URL count: {0}' -f $plan.url_count))
$lines.Add('')
$lines.Add('## URLs')
$lines.Add('')
foreach ($url in $canonicalUrls) {
  $lines.Add(('- {0}' -f $url))
}
$lines.Add('')
if ($DryRun) {
  $lines.Add('Dry run only. No IndexNow request was sent.')
}
else {
  $lines.Add('IndexNow request sent.')
}

$lines -join [Environment]::NewLine | Out-File -FilePath $markdownPath -Encoding utf8

Write-Host ("Wrote IndexNow submit plan to {0}" -f $OutputDir)
$global:LASTEXITCODE = 0
exit 0
