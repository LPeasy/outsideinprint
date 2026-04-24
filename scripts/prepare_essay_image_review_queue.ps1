param(
  [string]$MetadataAuditPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/seo-metadata-audit.csv'),
  [string]$PriorityUrlsPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/priority-urls.json'),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout')
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
  if ($null -eq $property -or $null -eq $property.Value) {
    return $Default
  }

  return $property.Value
}

function ConvertTo-Bool {
  param([object]$Value)

  $text = ([string]$Value).Trim()
  return $text -match '^(true|yes|1)$'
}

function Get-ReviewRisk {
  param(
    [bool]$MissingImage,
    [bool]$DefaultSocialImage,
    [bool]$MissingImageAlt,
    [bool]$PossibleEncodingDamage
  )

  if ($MissingImage -or $DefaultSocialImage) {
    return 'high'
  }

  if ($MissingImageAlt -or $PossibleEncodingDamage) {
    return 'medium'
  }

  return 'low'
}

function New-ImagePrompt {
  param(
    [string]$Title,
    [string]$Description
  )

  $context = if ([string]::IsNullOrWhiteSpace($Description)) { 'Use the essay title and Outside In Print editorial style as context.' } else { "Use this description as context: $Description" }
  return "Create a serious editorial illustration for Outside In Print for an essay titled `"$Title`". $context No readable text, no logos, no watermarks, no stock-photo feel, strong composition."
}

if (-not (Test-Path -LiteralPath $MetadataAuditPath -PathType Leaf)) {
  throw "Missing metadata audit CSV: $MetadataAuditPath"
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$auditRows = @(Import-Csv -Path $MetadataAuditPath)
$priorityRows = @((Read-JsonFile -Path $PriorityUrlsPath))
$priorityEssayUrls = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$priorityEssayPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

foreach ($row in $priorityRows) {
  if ([string](Get-PropertyValue -Object $row -Name 'kind') -ne 'essay') {
    continue
  }

  [void]$priorityEssayUrls.Add([string](Get-PropertyValue -Object $row -Name 'canonical_url'))
  [void]$priorityEssayPaths.Add([string](Get-PropertyValue -Object $row -Name 'path'))
}

$queueRows = foreach ($auditRow in $auditRows) {
  if ([string](Get-PropertyValue -Object $auditRow -Name 'section') -ne 'essays') {
    continue
  }

  $url = [string](Get-PropertyValue -Object $auditRow -Name 'canonical_url')
  $path = ([System.Uri]$url).AbsolutePath
  $missingImage = ConvertTo-Bool -Value (Get-PropertyValue -Object $auditRow -Name 'missing_image')
  $defaultSocialImage = ConvertTo-Bool -Value (Get-PropertyValue -Object $auditRow -Name 'default_social_image')
  $missingImageAlt = ConvertTo-Bool -Value (Get-PropertyValue -Object $auditRow -Name 'missing_image_alt')
  $possibleEncodingDamage = ConvertTo-Bool -Value (Get-PropertyValue -Object $auditRow -Name 'possible_encoding_damage')
  $isPriority = $priorityEssayUrls.Contains($url) -or $priorityEssayPaths.Contains($path)
  $hasImageIssue = $missingImage -or $defaultSocialImage -or $missingImageAlt

  if (-not $isPriority -and -not $hasImageIssue) {
    continue
  }

  $flags = @()
  if ($missingImage) { $flags += 'missing_image' }
  if ($defaultSocialImage) { $flags += 'default_social_image' }
  if ($missingImageAlt) { $flags += 'missing_image_alt' }
  if ($possibleEncodingDamage) { $flags += 'possible_encoding_damage' }
  if ($flags.Count -eq 0) { $flags += 'manual_review' }

  $batch = if ($isPriority) { 'Batch A' } else { 'Batch B' }
  $reviewRisk = Get-ReviewRisk -MissingImage $missingImage -DefaultSocialImage $defaultSocialImage -MissingImageAlt $missingImageAlt -PossibleEncodingDamage $possibleEncodingDamage

  [pscustomobject][ordered]@{
    batch = $batch
    review_risk = $reviewRisk
    url = $url
    path = [string](Get-PropertyValue -Object $auditRow -Name 'path')
    title = [string](Get-PropertyValue -Object $auditRow -Name 'title')
    description = [string](Get-PropertyValue -Object $auditRow -Name 'description')
    missing_image = $missingImage
    default_social_image = $defaultSocialImage
    missing_image_alt = $missingImageAlt
    possible_encoding_damage = $possibleEncodingDamage
    issue_flags = ($flags -join '; ')
    current_images = [string](Get-PropertyValue -Object $auditRow -Name 'images')
    image_prompt = New-ImagePrompt -Title ([string](Get-PropertyValue -Object $auditRow -Name 'title')) -Description ([string](Get-PropertyValue -Object $auditRow -Name 'description'))
  }
}

$queueRows = @(
  $queueRows |
    Sort-Object -Property @(
      @{ Expression = { if ($_.batch -eq 'Batch A') { 0 } else { 1 } }; Descending = $false },
      @{ Expression = { switch ($_.review_risk) { 'high' { 0 } 'medium' { 1 } default { 2 } } }; Descending = $false },
      @{ Expression = 'title'; Descending = $false }
    )
)

$worklogRows = foreach ($row in $queueRows) {
  [pscustomobject][ordered]@{
    batch = $row.batch
    url = $row.url
    title = $row.title
    approved = ''
    approved_asset_path = ''
    front_matter_patched = ''
    validation_notes = ''
  }
}

$csvPath = Join-Path $OutputDir 'essay-image-review-queue.csv'
$markdownPath = Join-Path $OutputDir 'essay-image-review-queue.md'
$worklogPath = Join-Path $OutputDir 'essay-image-review-worklog.csv'

$queueRows | Export-Csv -Path $csvPath -NoTypeInformation -Encoding utf8
$worklogRows | Export-Csv -Path $worklogPath -NoTypeInformation -Encoding utf8

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# Essay Image Review Queue')
$lines.Add('')
$lines.Add(('- Generated at: {0}' -f (Get-Date).ToString('o')))
$lines.Add(('- Queue rows: {0}' -f $queueRows.Count))
$lines.Add('')
$lines.Add('Batch A is the frozen priority essay set from the SEO rollout baseline. Batch B is the later essay image cleanup queue.')
$lines.Add('')
$lines.Add('| Batch | Risk | Title | Flags |')
$lines.Add('| --- | --- | --- | --- |')
foreach ($row in $queueRows) {
  $lines.Add(('| {0} | {1} | {2} | {3} |' -f $row.batch, $row.review_risk, ($row.title -replace '\|', '\|'), $row.issue_flags))
}
$lines.Add('')
$lines.Add('Use `essay-image-review-worklog.csv` to record approval, generated asset paths, and whether front matter has been patched.')

$lines -join [Environment]::NewLine | Out-File -FilePath $markdownPath -Encoding utf8

Write-Host ("Wrote essay image review queue to {0}" -f $OutputDir)
$global:LASTEXITCODE = 0
exit 0
