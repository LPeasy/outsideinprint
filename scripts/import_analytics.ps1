param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,
  [string]$OutputDir = "./data/analytics"
)

$ErrorActionPreference = "Stop"

$Sections = @(
  "overview",
  "essays",
  "sources",
  "modules",
  "periods",
  "timeseries_daily",
  "sections",
  "essays_timeseries",
  "journeys",
  "journey_by_source",
  "journey_by_collection",
  "journey_by_essay",
  "sources_timeseries"
)
$EssayPathPattern = "^/(essays|syd-and-oliver|working-papers)/[^/]+/?$"
$AllTimeLabel = "All time"
$GoatCounterExportNames = @("goatcounter-export.csv", "export.csv")
$DashboardSparklineDays = 14

function Read-Utf8Text {
  param([string]$Path)

  return [System.IO.File]::ReadAllText((Resolve-Path $Path), [System.Text.Encoding]::UTF8)
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
  } elseif ($Value -is [array]) {
    $json = ConvertTo-Json -InputObject @($Value) -Depth 20
  } else {
    $json = ConvertTo-Json -InputObject $Value -Depth 20
  }

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($Path), $json + [Environment]::NewLine, $encoding)
}

function Normalize-Key {
  param([string]$Name)

  if ([string]::IsNullOrWhiteSpace($Name)) {
    return ""
  }

  return (($Name.Trim().ToLowerInvariant() -replace "[^a-z0-9]+", "_") -replace "^_+|_+$", "")
}

function Convert-ToMap {
  param([object]$Value)

  $map = @{}
  if ($null -eq $Value) {
    return $map
  }

  if ($Value -is [System.Collections.IDictionary]) {
    foreach ($key in $Value.Keys) {
      $map[(Normalize-Key ([string]$key))] = $Value[$key]
    }
    return $map
  }

  foreach ($property in $Value.PSObject.Properties) {
    $map[(Normalize-Key $property.Name)] = $property.Value
  }

  return $map
}

function Get-FieldValue {
  param(
    [object]$Row,
    [string[]]$Aliases
  )

  $map = Convert-ToMap -Value $Row
  foreach ($alias in $Aliases) {
    $key = Normalize-Key $alias
    if ($map.ContainsKey($key)) {
      $value = $map[$key]
      if ($null -ne $value -and -not [string]::IsNullOrWhiteSpace([string]$value)) {
        return $value
      }
    }
  }

  return $null
}

function Convert-ToNumber {
  param(
    [object]$Value,
    [double]$Default = 0
  )

  if ($null -eq $Value) {
    return $Default
  }

  if ($Value -is [byte] -or $Value -is [int] -or $Value -is [long] -or $Value -is [decimal] -or $Value -is [double] -or $Value -is [single]) {
    return [double]$Value
  }

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return $Default
  }

  $text = ($text.Trim() -replace ",", "" -replace "%", "")
  $parsed = 0.0
  if ([double]::TryParse($text, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
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

function Normalize-SectionLabel {
  param(
    [object]$Value,
    [string]$Fallback = "Unlabeled"
  )

  $text = Convert-ToText $Value
  if (-not $text) {
    return $Fallback
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

$SiteBasePath = Convert-ToText $env:GOATCOUNTER_SITE_BASE_PATH "/outsideinprint"
$PublicSiteUrl = Convert-ToText $env:GOATCOUNTER_PUBLIC_SITE_URL "https://lpeasy.github.io/outsideinprint/"
$PublicSiteUri = $null
if ($PublicSiteUrl) {
  [void][System.Uri]::TryCreate($PublicSiteUrl, [System.UriKind]::Absolute, [ref]$PublicSiteUri)
}

function Convert-ToBoolean {
  param(
    [object]$Value,
    [bool]$Default = $false
  )

  if ($null -eq $Value) {
    return $Default
  }

  if ($Value -is [bool]) {
    return [bool]$Value
  }

  switch -Regex (([string]$Value).Trim().ToLowerInvariant()) {
    "^(1|true|yes|y)$" { return $true }
    "^(0|false|no|n)$" { return $false }
    default { return $Default }
  }
}

function Convert-ToDateTime {
  param([object]$Value)

  if ($null -eq $Value) {
    return $null
  }

  $text = Convert-ToText $Value
  if (-not $text) {
    return $null
  }

  $parsed = [datetimeoffset]::MinValue
  if ([datetimeoffset]::TryParse($text, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal, [ref]$parsed)) {
    return $parsed
  }

  return $null
}

function Test-IsPublicSiteUri {
  param([System.Uri]$Uri)

  if ($null -eq $Uri -or $null -eq $PublicSiteUri) {
    return $false
  }

  return (
    $Uri.Scheme.Equals($PublicSiteUri.Scheme, [System.StringComparison]::OrdinalIgnoreCase) -and
    $Uri.Host.Equals($PublicSiteUri.Host, [System.StringComparison]::OrdinalIgnoreCase) -and
    $Uri.Port -eq $PublicSiteUri.Port
  )
}

function Normalize-Path {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return ""
  }

  $value = $Path.Trim()
  $uri = $null
  if ([System.Uri]::TryCreate($value, [System.UriKind]::Absolute, [ref]$uri)) {
    $value = $uri.AbsolutePath
  }

  if (-not $value.StartsWith("/")) {
    $value = "/$value"
  }

  $basePath = Convert-ToText $SiteBasePath
  if ($basePath) {
    if (-not $basePath.StartsWith("/")) {
      $basePath = "/$basePath"
    }
    $basePath = $basePath.TrimEnd("/")

    if ($basePath -and $value -eq $basePath) {
      $value = "/"
    } elseif ($basePath -and $value.StartsWith("$basePath/")) {
      $value = $value.Substring($basePath.Length)
    }
  }

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
    "^/syd-and-oliver/" { return "S and O" }
    "^/working-papers/" { return "Working Papers" }
    "^/collections/" { return "Collections" }
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

function Get-SectionSlug {
  param([string]$SectionLabel)

  if ([string]::IsNullOrWhiteSpace($SectionLabel)) {
    return ""
  }

  return (($SectionLabel.Trim().ToLowerInvariant() -replace "&", "and") -replace "[^a-z0-9]+", "-").Trim("-")
}

function Get-Key {
  param([string[]]$Values)

  return (($Values | ForEach-Object { Convert-ToText $_ }) -join "|")
}

function Format-SourceLabel {
  param(
    [string]$Source,
    [string]$Medium,
    [string]$Campaign,
    [string]$Content
  )

  $source = Convert-ToText $Source
  $medium = Convert-ToText $Medium
  $campaign = Convert-ToText $Campaign
  $content = Convert-ToText $Content

  if (-not $source) {
    return ""
  }

  $parts = @($source, $medium, $campaign, $content) | Where-Object { $_ }
  return ($parts -join " / ")
}

function New-InternalAttribution {
  param([string]$Path)

  $normalizedPath = Normalize-Path -Path $Path
  $labelSuffix = if ($normalizedPath -eq "/") { "/" } else { $normalizedPath }

  return [ordered]@{
    source = "internal"
    medium = $normalizedPath
    campaign = ""
    content = ""
    key = Get-Key @("internal", $normalizedPath, "", "")
    label = "internal $labelSuffix"
  }
}

function Try-GetInternalReferrerPath {
  param([string]$Referrer)

  $referrerText = Convert-ToText $Referrer
  if (-not $referrerText) {
    return $null
  }

  foreach ($prefix in @("internal:path=", "path=")) {
    if ($referrerText.StartsWith($prefix)) {
      return [System.Uri]::UnescapeDataString($referrerText.Substring($prefix.Length))
    }
  }

  return $null
}

function Read-StructuredFile {
  param([string]$Path)

  $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  switch ($extension) {
    ".json" {
      return Read-Utf8Text -Path $Path | ConvertFrom-Json
    }
    ".csv" {
      return Import-Csv -Path $Path
    }
    default {
      throw "Unsupported input format: $Path"
    }
  }
}

function Get-GoatCounterHeaderInfo {
  param([string]$HeaderLine)

  $line = Convert-ToText $HeaderLine
  if (-not $line) {
    return $null
  }

  if ($line[0] -eq [char]0xFEFF) {
    $line = $line.Substring(1)
  }

  $tokens = @(
    $line.Split(",") |
      ForEach-Object { (Convert-ToText $_).Trim('"') } |
      Where-Object { $null -ne $_ }
  )

  if ($tokens.Count -eq 0) {
    return $null
  }

  $version = $null
  if ($tokens.Count -ge 2 -and $tokens[0] -match '^\d+$' -and $tokens[1] -eq "Path") {
    $version = [int]$tokens[0]
    $tokens = @($tokens | Select-Object -Skip 1)
  } elseif ($tokens[0] -match '^(?<version>\d+)Path$') {
    $version = [int]$Matches["version"]
    $tokens[0] = "Path"
  }

  return @{
    version = $version
    headers = $tokens
  }
}

function Test-HasHeaderAlias {
  param(
    [string[]]$Headers,
    [string[]]$Aliases
  )

  $normalizedHeaders = @($Headers | ForEach-Object { Normalize-Key $_ })
  foreach ($alias in $Aliases) {
    if ($normalizedHeaders -contains (Normalize-Key $alias)) {
      return $true
    }
  }

  return $false
}

function Read-GoatCounterBundle {
  param([string]$DirectoryPath)

  $csvPath = $null
  foreach ($candidate in $GoatCounterExportNames) {
    $resolvedCandidate = Join-Path $DirectoryPath $candidate
    if (Test-Path $resolvedCandidate) {
      $csvPath = $resolvedCandidate
      break
    }
  }

  if (-not $csvPath) {
    return $null
  }

  $headerLine = Get-Content -Path $csvPath -TotalCount 1
  if (-not $headerLine) {
    throw "GoatCounter export is empty: $csvPath"
  }

  $headerInfo = Get-GoatCounterHeaderInfo -HeaderLine $headerLine
  if ($null -eq $headerInfo -or @($headerInfo.headers).Count -eq 0) {
    throw "Unsupported GoatCounter export header in $csvPath. The file is missing a readable CSV header row."
  }

  $headerNames = @($headerInfo.headers)
  if (-not ($headerNames -contains "Path")) {
    $preview = Convert-ToText $headerLine
    if ($preview.Length -gt 120) {
      $preview = $preview.Substring(0, 120) + "..."
    }
    throw "Unsupported GoatCounter export header in $csvPath. Expected a CSV header containing 'Path'. First line: $preview"
  }

  $headerVersion = $headerInfo.version
  if ($null -ne $headerVersion -and $headerVersion -notin @(1, 2)) {
    Write-Warning "GoatCounter export version '$headerVersion' is not explicitly known, but the required columns were found. Continuing with column-based import."
  }

  $requiredColumnAliases = @(
    @{ Name = "Path"; Aliases = @("Path", "1Path", "2Path") }
    @{ Name = "Event"; Aliases = @("Event") }
    @{ Name = "Session"; Aliases = @("Session") }
    @{ Name = "Referrer"; Aliases = @("Referrer") }
    @{ Name = "Date"; Aliases = @("Date") }
  )

  foreach ($requiredColumn in $requiredColumnAliases) {
    if (-not (Test-HasHeaderAlias -Headers $headerNames -Aliases $requiredColumn.Aliases)) {
      throw "GoatCounter export in $csvPath is missing the required '$($requiredColumn.Name)' column."
    }
  }

  $metadataPath = Join-Path $DirectoryPath "metadata.json"
  $metadata = @{}
  if (Test-Path $metadataPath) {
    $metadata = Read-StructuredFile -Path $metadataPath
  }

  $rows = Import-Csv -Path $csvPath

  return @{
    source = "goatcounter"
    metadata = $metadata
    rows = $rows
  }
}

function Read-RawAnalyticsInput {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    throw "Input path not found: $Path"
  }

  $resolved = Resolve-Path $Path
  $item = Get-Item $resolved
  $raw = @{}

  if ($item.PSIsContainer) {
    $goatcounter = Read-GoatCounterBundle -DirectoryPath $item.FullName
    if ($null -ne $goatcounter) {
      return $goatcounter
    }

    foreach ($section in $Sections) {
      $sectionFile = @(
        (Join-Path $item.FullName "$section.json"),
        (Join-Path $item.FullName "$section.csv")
      ) | Where-Object { Test-Path $_ } | Select-Object -First 1

      if ($sectionFile) {
        $raw[$section] = Read-StructuredFile -Path $sectionFile
      }
    }

    return @{
      source = "legacy"
      sections = $raw
    }
  }

  if ([System.IO.Path]::GetExtension($item.FullName).ToLowerInvariant() -ne ".json") {
    throw "Single-file imports must be JSON bundles with overview/essays/sources/modules/periods keys."
  }

  $bundle = Read-StructuredFile -Path $item.FullName
  foreach ($section in $Sections) {
    if ($bundle.PSObject.Properties.Name -contains $section) {
      $raw[$section] = $bundle.$section
    }
  }

  return @{
    source = "legacy"
    sections = $raw
  }
}

function Parse-GoatCounterEventPath {
  param([string]$Path)

  $path = Convert-ToText $Path
  if (-not $path) {
    return @{
      name = ""
      metadata = @{}
    }
  }

  if (-not $path.StartsWith("oip:")) {
    return @{
      name = $path
      metadata = @{}
    }
  }

  $parts = $path.Split("|")
  $name = Convert-ToText $parts[0].Substring(4)
  $metadata = @{}

  foreach ($part in $parts | Select-Object -Skip 1) {
    $equalsIndex = $part.IndexOf("=")
    if ($equalsIndex -lt 1) {
      continue
    }

    $key = Normalize-Key $part.Substring(0, $equalsIndex)
    $value = [System.Uri]::UnescapeDataString($part.Substring($equalsIndex + 1))
    if ($key) {
      $metadata[$key] = $value
    }
  }

  return @{
    name = $name
    metadata = $metadata
  }
}

function Parse-AttributionReferrer {
  param(
    [string]$Referrer,
    [string]$ReferrerScheme
  )

  $referrer = Convert-ToText $Referrer
  $scheme = Convert-ToText $ReferrerScheme

  if (-not $referrer) {
    return [ordered]@{
      source = "direct"
      medium = ""
      campaign = ""
      content = ""
      key = Get-Key @("direct", "", "", "")
      label = "direct"
    }
  }

  if ($referrer.StartsWith("campaign:")) {
    $payload = $referrer.Substring("campaign:".Length)
    $data = @{}
    foreach ($part in $payload.Split("|")) {
      $equalsIndex = $part.IndexOf("=")
      if ($equalsIndex -lt 1) {
        continue
      }

      $data[(Normalize-Key $part.Substring(0, $equalsIndex))] = [System.Uri]::UnescapeDataString($part.Substring($equalsIndex + 1))
    }

    $source = Convert-ToText $data["source"] "campaign"
    $medium = Convert-ToText $data["medium"]
    $campaign = Convert-ToText $data["campaign"]
    $content = Convert-ToText $data["content"]

    return [ordered]@{
      source = $source
      medium = $medium
      campaign = $campaign
      content = $content
      key = Get-Key @($source, $medium, $campaign, $content)
      label = Format-SourceLabel -Source $source -Medium $medium -Campaign $campaign -Content $content
    }
  }

  if ($referrer.StartsWith("internal:path=")) {
    return New-InternalAttribution -Path ([System.Uri]::UnescapeDataString($referrer.Substring("internal:path=".Length)))
  }

  if ($referrer.StartsWith("path=")) {
    return New-InternalAttribution -Path ([System.Uri]::UnescapeDataString($referrer.Substring("path=".Length)))
  }

  if ($referrer.StartsWith("source=")) {
    $data = @{}
    foreach ($part in $referrer.Split("|")) {
      $equalsIndex = $part.IndexOf("=")
      if ($equalsIndex -lt 1) {
        continue
      }

      $data[(Normalize-Key $part.Substring(0, $equalsIndex))] = [System.Uri]::UnescapeDataString($part.Substring($equalsIndex + 1))
    }

    $source = Convert-ToText $data["source"] "campaign"
    $medium = Convert-ToText $data["medium"]
    $campaign = Convert-ToText $data["campaign"]
    $content = Convert-ToText $data["content"]

    return [ordered]@{
      source = $source
      medium = $medium
      campaign = $campaign
      content = $content
      key = Get-Key @($source, $medium, $campaign, $content)
      label = Format-SourceLabel -Source $source -Medium $medium -Campaign $campaign -Content $content
    }
  }

  $uri = $null
  if ([System.Uri]::TryCreate($referrer, [System.UriKind]::Absolute, [ref]$uri)) {
    if (Test-IsPublicSiteUri -Uri $uri) {
      return New-InternalAttribution -Path $uri.AbsolutePath
    }

    $hostName = Convert-ToText $uri.Host
    if ($hostName.StartsWith("www.")) {
      $hostName = $hostName.Substring(4)
    }

    $medium = switch ($scheme) {
      "g" { "generated" }
      "o" { "other" }
      "c" { "campaign" }
      default { "referral" }
    }

    return [ordered]@{
      source = $hostName
      medium = $medium
      campaign = ""
      content = ""
      key = Get-Key @($hostName, $medium, "", "")
      label = Format-SourceLabel -Source $hostName -Medium $medium -Campaign "" -Content ""
    }
  }

  $source = $referrer
  $medium = switch ($scheme) {
    "c" { "campaign" }
    "g" { "generated" }
    "o" { "other" }
    default { "" }
  }

  $internalPath = Try-GetInternalReferrerPath -Referrer $source
  if ($null -ne $internalPath) {
    return New-InternalAttribution -Path $internalPath
  }

  return [ordered]@{
    source = $source
    medium = $medium
    campaign = ""
    content = ""
    key = Get-Key @($source, $medium, "", "")
    label = Format-SourceLabel -Source $source -Medium $medium -Campaign "" -Content ""
  }
}

function Convert-GoatCounterRow {
  param([object]$Row)

  $path = Convert-ToText (Get-FieldValue -Row $Row -Aliases @("2Path", "1Path", "Path"))
  if (-not $path) {
    return $null
  }

  $isEvent = Convert-ToBoolean (Get-FieldValue -Row $Row -Aliases @("Event"))
  $eventInfo = Parse-GoatCounterEventPath -Path $path
  $metadata = $eventInfo.metadata

  $contentPath = ""
  if ($isEvent -and $metadata.ContainsKey("path")) {
    $contentPath = Normalize-Path -Path $metadata["path"]
  } elseif (-not $isEvent -and $path.StartsWith("/")) {
    $contentPath = Normalize-Path -Path $path
  }

  $title = Convert-ToText (Get-FieldValue -Row $Row -Aliases @("Title"))
  if (-not $title -and $contentPath) {
    $title = Get-TitleFallbackFromPath -Path $contentPath
  }

  $section = Normalize-SectionLabel -Value $metadata["section"] -Fallback ""
  if (-not $section -and $contentPath) {
    $section = Get-SectionLabelFromPath -Path $contentPath
  }

  $slug = Convert-ToText $metadata["slug"]
  if (-not $slug -and $contentPath) {
    $slug = Get-SlugFromPath -Path $contentPath
  }

  $referrer = Convert-ToText (Get-FieldValue -Row $Row -Aliases @("Referrer"))
  $referrerScheme = Convert-ToText (Get-FieldValue -Row $Row -Aliases @("Referrer scheme"))
  $attribution = Parse-AttributionReferrer -Referrer $referrer -ReferrerScheme $referrerScheme

  return [pscustomobject]@{
    raw_path = $path
    content_path = $contentPath
    title = $title
    is_event = $isEvent
    event_name = Convert-ToText $eventInfo.name
    slug = $slug
    section = $section
    source_slot = Convert-ToText $metadata["source_slot"]
    collection = Convert-ToText $metadata["collection"]
    format = Convert-ToText $metadata["format"]
    session = Convert-ToText (Get-FieldValue -Row $Row -Aliases @("Session"))
    is_bot = (Convert-ToNumber (Get-FieldValue -Row $Row -Aliases @("Bot"))) -ne 0
    referrer = $referrer
    referrer_scheme = $referrerScheme
    attribution = $attribution
    first_visit = Convert-ToBoolean (Get-FieldValue -Row $Row -Aliases @("FirstVisit"))
    occurred_at = Convert-ToDateTime (Get-FieldValue -Row $Row -Aliases @("Date"))
  }
}

function Get-UniqueSessionCount {
  param([object[]]$Rows)

  $sessions = @(
    $Rows |
      ForEach-Object { Convert-ToText $_.session } |
      Where-Object { $_ } |
      Sort-Object -Unique
  )

  return [double]$sessions.Count
}

function Get-DateKey {
  param([datetimeoffset]$OccurredAt)

  if ($null -eq $OccurredAt) {
    return ""
  }

  return $OccurredAt.UtcDateTime.ToString("yyyy-MM-dd")
}

function Get-DateRangeKeys {
  param([object[]]$Rows)

  $datedRows = @($Rows | Where-Object { $_.occurred_at })
  if ($datedRows.Count -eq 0) {
    return ,@()
  }

  $startDate = ($datedRows | Sort-Object -Property occurred_at | Select-Object -First 1).occurred_at.UtcDateTime.Date
  $endDate = ($datedRows | Sort-Object -Property occurred_at | Select-Object -Last 1).occurred_at.UtcDateTime.Date
  $keys = @()
  $cursor = $startDate

  while ($cursor -le $endDate) {
    $keys += $cursor.ToString("yyyy-MM-dd")
    $cursor = $cursor.AddDays(1)
  }

  return ,$keys
}

function New-DailyMetricBucket {
  return @{
    pageviews = 0.0
    reads = 0.0
    pdf_downloads = 0.0
    newsletter_submits = 0.0
    sessions = New-Object "System.Collections.Generic.HashSet[string]"
  }
}

function Get-OrCreateBucket {
  param(
    [hashtable]$Map,
    [string]$Key
  )

  if (-not $Map.ContainsKey($Key)) {
    $Map[$Key] = New-DailyMetricBucket
  }

  return $Map[$Key]
}

function Get-SafeMetricRate {
  param(
    [double]$Numerator,
    [double]$Denominator
  )

  if ($Denominator -le 0) {
    return 0.0
  }

  return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}

function Get-JourneyDiscoveryMode {
  param(
    [string]$DiscoveryType,
    [string]$ModuleSlot,
    [string]$Collection
  )

  if ((Convert-ToText $ModuleSlot) -or (Convert-ToText $Collection) -or (Convert-ToText $DiscoveryType) -eq "internal-module") {
    return "module-driven"
  }

  return "article-discovery"
}

function New-JourneyAggregate {
  param(
    [string]$Label,
    [string]$DiscoveryType = "",
    [string]$DiscoveryMode = "",
    [string]$ModuleSlot = "",
    [string]$Collection = "",
    [string]$Section = "",
    [string]$Slug = "",
    [string]$Path = "",
    [string]$Title = ""
  )

  return @{
    label = $Label
    discovery_type = $DiscoveryType
    discovery_mode = $DiscoveryMode
    module_slot = $ModuleSlot
    collection = $Collection
    section = $Section
    slug = $Slug
    path = $Path
    title = $Title
    views = 0.0
    reads = 0.0
    pdf_downloads = 0.0
    newsletter_submits = 0.0
  }
}

function Convert-JourneyAggregateToRecord {
  param(
    [hashtable]$Aggregate,
    [string]$LabelFieldName = "label"
  )

  $views = [double]$Aggregate.views
  $reads = [double]$Aggregate.reads
  $pdfDownloads = [double]$Aggregate.pdf_downloads
  $newsletterSubmits = [double]$Aggregate.newsletter_submits

  $record = [ordered]@{}
  $record[$LabelFieldName] = Convert-ToText $Aggregate.label
  if ($Aggregate.ContainsKey("discovery_type")) { $record["discovery_type"] = Convert-ToText $Aggregate.discovery_type }
  if ($Aggregate.ContainsKey("discovery_mode")) { $record["discovery_mode"] = Convert-ToText $Aggregate.discovery_mode }
  if ($Aggregate.ContainsKey("module_slot")) { $record["module_slot"] = Convert-ToText $Aggregate.module_slot }
  if ($Aggregate.ContainsKey("collection")) { $record["collection"] = Convert-ToText $Aggregate.collection }
  if ($Aggregate.ContainsKey("section")) { $record["section"] = Convert-ToText $Aggregate.section }
  if ($Aggregate.ContainsKey("slug")) { $record["slug"] = Convert-ToText $Aggregate.slug }
  if ($Aggregate.ContainsKey("path")) { $record["path"] = Convert-ToText $Aggregate.path }
  if ($Aggregate.ContainsKey("title")) { $record["title"] = Convert-ToText $Aggregate.title }
  $record["views"] = $views
  $record["reads"] = $reads
  $record["read_rate"] = Get-SafeMetricRate -Numerator $reads -Denominator $views
  $record["pdf_downloads"] = $pdfDownloads
  $record["pdf_rate"] = Get-SafeMetricRate -Numerator $pdfDownloads -Denominator $views
  $record["newsletter_submits"] = $newsletterSubmits
  $record["newsletter_rate"] = Get-SafeMetricRate -Numerator $newsletterSubmits -Denominator $views
  $record["approximate_downstream"] = $true
  $record["attribution_note"] = "Pageviews are measured directly. Read, PDF, and newsletter steps are approximate same-session downstream events."

  return $record
}

function Get-SourceType {
  param([object]$Attribution)

  $source = Convert-ToText (Get-FieldValue -Row $Attribution -Aliases @("source"))
  $medium = Convert-ToText (Get-FieldValue -Row $Attribution -Aliases @("medium"))
  $campaign = Convert-ToText (Get-FieldValue -Row $Attribution -Aliases @("campaign"))

  if ($source -eq "internal") {
    return "internal"
  }

  if ($source -eq "direct") {
    return "direct"
  }

  if ($campaign -or $medium -eq "campaign" -or $medium -eq "generated") {
    return "campaign"
  }

  if (-not $source) {
    return "unknown"
  }

  return "external"
}

function Get-DailySparkline {
  param(
    [hashtable]$DailyMap,
    [string[]]$DateKeys,
    [string]$MetricName,
    [int]$Window = $DashboardSparklineDays
  )

  if ($DateKeys.Count -eq 0) {
    return ,@()
  }

  $selectedKeys = @($DateKeys | Select-Object -Last $Window)
  return ,@(
    foreach ($dateKey in $selectedKeys) {
      if ($DailyMap.ContainsKey($dateKey)) {
        [double](Convert-ToNumber $DailyMap[$dateKey].$MetricName)
      } else {
        0.0
      }
    }
  )
}

function Get-GoatCounterOverview {
  param(
    [object[]]$PageRows,
    [object[]]$EventRows,
    [object]$Metadata
  )

  $updatedAt = Convert-ToText (Get-FieldValue -Row $Metadata -Aliases @("exported_at", "finished_at", "updated_at"))
  if (-not $updatedAt) {
    $updatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
  } else {
    $parsedUpdatedAt = Convert-ToDateTime $updatedAt
    if ($null -ne $parsedUpdatedAt) {
      $updatedAt = $parsedUpdatedAt.UtcDateTime.ToString("yyyy-MM-dd")
    }
  }

  $reads = @($EventRows | Where-Object { $_.event_name -eq "essay_read" }).Count
  $pageviews = @($PageRows).Count

  return [ordered]@{
    range_label = $AllTimeLabel
    updated_at = $updatedAt
    pageviews = [double]$pageviews
    unique_visitors = Get-UniqueSessionCount -Rows $PageRows
    reads = [double]$reads
    read_rate = if ($pageviews -gt 0) { [Math]::Round(($reads / $pageviews) * 100, 1) } else { 0.0 }
    pdf_downloads = [double](@($EventRows | Where-Object { $_.event_name -eq "pdf_download" }).Count)
    newsletter_submits = [double](@($EventRows | Where-Object { $_.event_name -eq "newsletter_submit" }).Count)
  }
}

function Get-GoatCounterEssays {
  param(
    [object[]]$PageRows,
    [object[]]$EventRows
  )

  $essayMap = @{}

  foreach ($row in $PageRows | Where-Object { $_.content_path -match $EssayPathPattern }) {
    if (-not $essayMap.ContainsKey($row.content_path)) {
      $essayMap[$row.content_path] = @{
        slug = Convert-ToText $row.slug (Get-SlugFromPath -Path $row.content_path)
        path = $row.content_path
        title = Convert-ToText $row.title (Get-TitleFallbackFromPath -Path $row.content_path)
        section = Normalize-SectionLabel -Value $row.section -Fallback (Get-SectionLabelFromPath -Path $row.content_path)
        views = 0.0
        reads = 0.0
        pdf_downloads = 0.0
        primary_sources = @{}
      }
    }

    $essayMap[$row.content_path].views += 1
    if ($row.attribution.label) {
      if (-not $essayMap[$row.content_path].primary_sources.ContainsKey($row.attribution.label)) {
        $essayMap[$row.content_path].primary_sources[$row.attribution.label] = 0
      }
      $essayMap[$row.content_path].primary_sources[$row.attribution.label] += 1
    }
  }

  foreach ($row in $EventRows | Where-Object { $_.content_path -match $EssayPathPattern }) {
    if (-not $essayMap.ContainsKey($row.content_path)) {
      $essayMap[$row.content_path] = @{
        slug = Convert-ToText $row.slug (Get-SlugFromPath -Path $row.content_path)
        path = $row.content_path
        title = Convert-ToText $row.title (Get-TitleFallbackFromPath -Path $row.content_path)
        section = Normalize-SectionLabel -Value $row.section -Fallback (Get-SectionLabelFromPath -Path $row.content_path)
        views = 0.0
        reads = 0.0
        pdf_downloads = 0.0
        primary_sources = @{}
      }
    }

    if ($row.event_name -eq "essay_read") {
      $essayMap[$row.content_path].reads += 1
    }

    if ($row.event_name -eq "pdf_download") {
      $essayMap[$row.content_path].pdf_downloads += 1
    }
  }

  return ,@(
    foreach ($entry in $essayMap.Values) {
      $topSource = ""
      if ($entry.primary_sources.Count -gt 0) {
        $topSource = @($entry.primary_sources.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 1)[0].Key
      }

      [ordered]@{
        slug = $entry.slug
        path = $entry.path
        title = $entry.title
        section = $entry.section
        views = [double]$entry.views
        reads = [double]$entry.reads
        read_rate = if ($entry.views -gt 0) { [Math]::Round(($entry.reads / $entry.views) * 100, 1) } else { 0.0 }
        pdf_downloads = [double]$entry.pdf_downloads
        primary_source = $topSource
      }
    }
  ) | Sort-Object -Property @{ Expression = { $_.views }; Descending = $true }, @{ Expression = { $_.reads }; Descending = $true } | Select-Object -First 100
}

function New-SourceAggregate {
  param([object]$Attribution)

  return @{
    source = Convert-ToText (Get-FieldValue -Row $Attribution -Aliases @("source"))
    medium = Convert-ToText (Get-FieldValue -Row $Attribution -Aliases @("medium"))
    campaign = Convert-ToText (Get-FieldValue -Row $Attribution -Aliases @("campaign"))
    content = Convert-ToText (Get-FieldValue -Row $Attribution -Aliases @("content"))
    pageviews = 0.0
    reads = 0.0
    sessions = New-Object "System.Collections.Generic.HashSet[string]"
  }
}

function Get-GoatCounterSources {
  param(
    [object[]]$PageRows,
    [object[]]$EventRows
  )

  $sourceMap = @{}

  foreach ($row in $PageRows) {
    $key = $row.attribution.key
    if (-not $sourceMap.ContainsKey($key)) {
      $sourceMap[$key] = New-SourceAggregate -Attribution $row.attribution
    }

    $sourceMap[$key].pageviews += 1
    if ($row.session) {
      [void]$sourceMap[$key].sessions.Add($row.session)
    }
  }

  foreach ($row in $EventRows | Where-Object { $_.event_name -eq "essay_read" }) {
    $key = $row.attribution.key
    if (-not $sourceMap.ContainsKey($key)) {
      $sourceMap[$key] = New-SourceAggregate -Attribution $row.attribution
    }

    $sourceMap[$key].reads += 1
  }

  return ,@(
    foreach ($entry in $sourceMap.Values) {
      [ordered]@{
        source = $entry.source
        medium = $entry.medium
        campaign = $entry.campaign
        content = $entry.content
        visitors = [double]$entry.sessions.Count
        pageviews = [double]$entry.pageviews
        reads = [double]$entry.reads
      }
    }
  ) | Sort-Object -Property @{ Expression = { $_.pageviews }; Descending = $true }, @{ Expression = { $_.reads }; Descending = $true } | Select-Object -First 50
}

function Get-GoatCounterModules {
  param([object[]]$EventRows)

  $moduleMap = @{}
  $clickEvents = @($EventRows | Where-Object { $_.event_name -in @("internal_promo_click", "collection_click") })

  foreach ($row in $clickEvents) {
    $slot = Convert-ToText $row.source_slot
    if (-not $slot) {
      continue
    }

    $key = Get-Key @($slot, $row.collection)
    if (-not $moduleMap.ContainsKey($key)) {
      $moduleMap[$key] = @{
        slot = $slot
        collection = Convert-ToText $row.collection
        clicks = 0.0
        downstream_reads = 0.0
      }
    }

    $moduleMap[$key].clicks += 1
  }

  foreach ($sessionGroup in ($EventRows | Where-Object { $_.session -and $_.occurred_at } | Group-Object -Property session)) {
    $recentClicksByPath = @{}
    $ordered = @($sessionGroup.Group | Sort-Object -Property occurred_at, raw_path)

    foreach ($row in $ordered) {
      if ($row.event_name -in @("internal_promo_click", "collection_click")) {
        if ($row.content_path) {
          $recentClicksByPath[$row.content_path] = $row
        }
        continue
      }

      if ($row.event_name -ne "essay_read" -or -not $row.content_path) {
        continue
      }

      if (-not $recentClicksByPath.ContainsKey($row.content_path)) {
        continue
      }

      $click = $recentClicksByPath[$row.content_path]
      $key = Get-Key @($click.source_slot, $click.collection)
      if ($moduleMap.ContainsKey($key)) {
        $moduleMap[$key].downstream_reads += 1
      }

      $recentClicksByPath.Remove($row.content_path)
    }
  }

  return ,@(
    foreach ($entry in $moduleMap.Values) {
      [ordered]@{
        slot = $entry.slot
        collection = $entry.collection
        clicks = [double]$entry.clicks
        downstream_reads = [double]$entry.downstream_reads
      }
    }
  ) | Sort-Object -Property @{ Expression = { $_.clicks }; Descending = $true }, @{ Expression = { $_.downstream_reads }; Descending = $true } | Select-Object -First 50
}

function Get-GoatCounterPeriodSnapshot {
  param(
    [string]$Label,
    [object[]]$PageRows,
    [object[]]$EventRows
  )

  $pageviews = @($PageRows).Count
  $reads = @($EventRows | Where-Object { $_.event_name -eq "essay_read" }).Count

  return [ordered]@{
    label = $Label
    pageviews = [double]$pageviews
    unique_visitors = Get-UniqueSessionCount -Rows $PageRows
    reads = [double]$reads
    read_rate = if ($pageviews -gt 0) { [Math]::Round(($reads / $pageviews) * 100, 1) } else { 0.0 }
    pdf_downloads = [double](@($EventRows | Where-Object { $_.event_name -eq "pdf_download" }).Count)
    newsletter_submits = [double](@($EventRows | Where-Object { $_.event_name -eq "newsletter_submit" }).Count)
  }
}

function Get-GoatCounterPeriods {
  param(
    [object[]]$PageRows,
    [object[]]$EventRows
  )

  $now = [datetimeoffset]::UtcNow

  $last7Cutoff = $now.AddDays(-7)
  $last30Cutoff = $now.AddDays(-30)

  $pageRowsWithDate = @($PageRows | Where-Object { $_.occurred_at })
  $eventRowsWithDate = @($EventRows | Where-Object { $_.occurred_at })

  return ,@(
    Get-GoatCounterPeriodSnapshot -Label "Last 7 days" -PageRows @($pageRowsWithDate | Where-Object { $_.occurred_at -ge $last7Cutoff }) -EventRows @($eventRowsWithDate | Where-Object { $_.occurred_at -ge $last7Cutoff })
    Get-GoatCounterPeriodSnapshot -Label "Last 30 days" -PageRows @($pageRowsWithDate | Where-Object { $_.occurred_at -ge $last30Cutoff }) -EventRows @($eventRowsWithDate | Where-Object { $_.occurred_at -ge $last30Cutoff })
    Get-GoatCounterPeriodSnapshot -Label $AllTimeLabel -PageRows $PageRows -EventRows $EventRows
  )
}

function Get-GoatCounterDailyTimeseries {
  param(
    [object[]]$PageRows,
    [object[]]$EventRows
  )

  $dateKeys = Get-DateRangeKeys -Rows @($PageRows + $EventRows)
  if ($dateKeys.Count -eq 0) {
    return ,@()
  }

  $dailyMap = @{}

  foreach ($dateKey in $dateKeys) {
    $dailyMap[$dateKey] = New-DailyMetricBucket
  }

  foreach ($row in $PageRows | Where-Object { $_.occurred_at }) {
    $dateKey = Get-DateKey -OccurredAt $row.occurred_at
    $bucket = Get-OrCreateBucket -Map $dailyMap -Key $dateKey
    $bucket.pageviews += 1
    if ($row.session) {
      [void]$bucket.sessions.Add($row.session)
    }
  }

  foreach ($row in $EventRows | Where-Object { $_.occurred_at }) {
    $dateKey = Get-DateKey -OccurredAt $row.occurred_at
    $bucket = Get-OrCreateBucket -Map $dailyMap -Key $dateKey

    switch ($row.event_name) {
      "essay_read" { $bucket.reads += 1 }
      "pdf_download" { $bucket.pdf_downloads += 1 }
      "newsletter_submit" { $bucket.newsletter_submits += 1 }
    }
  }

  return ,@(
    foreach ($dateKey in $dateKeys) {
      $bucket = $dailyMap[$dateKey]
      [ordered]@{
        date = $dateKey
        pageviews = [double]$bucket.pageviews
        unique_visitors = [double]$bucket.sessions.Count
        reads = [double]$bucket.reads
        read_rate = Get-SafeMetricRate -Numerator $bucket.reads -Denominator $bucket.pageviews
        pdf_downloads = [double]$bucket.pdf_downloads
        newsletter_submits = [double]$bucket.newsletter_submits
      }
    }
  )
}

function Get-GoatCounterSections {
  param(
    [object[]]$PageRows,
    [object[]]$EventRows
  )

  $sections = @{}
  $dateKeys = Get-DateRangeKeys -Rows @($PageRows + $EventRows)

  foreach ($row in $PageRows | Where-Object { $_.content_path -match $EssayPathPattern }) {
    $section = Normalize-SectionLabel -Value $row.section -Fallback (Get-SectionLabelFromPath -Path $row.content_path)
    if (-not $section) {
      continue
    }

    if (-not $sections.ContainsKey($section)) {
      $sections[$section] = @{
        section = $section
        pageviews = 0.0
        reads = 0.0
        pdf_downloads = 0.0
        newsletter_submits = 0.0
        daily = @{}
      }
    }

    $sections[$section].pageviews += 1
    if ($row.occurred_at) {
      $dateKey = Get-DateKey -OccurredAt $row.occurred_at
      $bucket = Get-OrCreateBucket -Map $sections[$section].daily -Key $dateKey
      $bucket.pageviews += 1
    }
  }

  foreach ($row in $EventRows | Where-Object { $_.content_path -match $EssayPathPattern }) {
    $section = Normalize-SectionLabel -Value $row.section -Fallback (Get-SectionLabelFromPath -Path $row.content_path)
    if (-not $section) {
      continue
    }

    if (-not $sections.ContainsKey($section)) {
      $sections[$section] = @{
        section = $section
        pageviews = 0.0
        reads = 0.0
        pdf_downloads = 0.0
        newsletter_submits = 0.0
        daily = @{}
      }
    }

    if ($row.event_name -eq "essay_read") {
      $sections[$section].reads += 1
    }

    if ($row.event_name -eq "pdf_download") {
      $sections[$section].pdf_downloads += 1
    }

    if ($row.event_name -eq "newsletter_submit") {
      $sections[$section].newsletter_submits += 1
    }

    if ($row.occurred_at) {
      $dateKey = Get-DateKey -OccurredAt $row.occurred_at
      $bucket = Get-OrCreateBucket -Map $sections[$section].daily -Key $dateKey
      switch ($row.event_name) {
        "essay_read" { $bucket.reads += 1 }
        "pdf_download" { $bucket.pdf_downloads += 1 }
        "newsletter_submit" { $bucket.newsletter_submits += 1 }
      }
    }
  }

  return ,@(
    foreach ($entry in $sections.Values) {
      [ordered]@{
        section = $entry.section
        pageviews = [double]$entry.pageviews
        reads = [double]$entry.reads
        read_rate = Get-SafeMetricRate -Numerator $entry.reads -Denominator $entry.pageviews
        pdf_downloads = [double]$entry.pdf_downloads
        newsletter_submits = [double]$entry.newsletter_submits
        sparkline_pageviews = Get-DailySparkline -DailyMap $entry.daily -DateKeys $dateKeys -MetricName "pageviews"
        sparkline_reads = Get-DailySparkline -DailyMap $entry.daily -DateKeys $dateKeys -MetricName "reads"
      }
    }
  ) | Sort-Object -Property @{ Expression = { $_.pageviews }; Descending = $true }, @{ Expression = { $_.reads }; Descending = $true }
}

function Get-GoatCounterEssayTimeseries {
  param(
    [object[]]$PageRows,
    [object[]]$EventRows
  )

  $essayMap = @{}
  $dateKeys = Get-DateRangeKeys -Rows @($PageRows + $EventRows)

  foreach ($row in $PageRows | Where-Object { $_.content_path -match $EssayPathPattern -and $_.occurred_at }) {
    $key = $row.content_path
    if (-not $essayMap.ContainsKey($key)) {
      $essayMap[$key] = @{
        slug = Convert-ToText $row.slug (Get-SlugFromPath -Path $row.content_path)
        path = $row.content_path
        title = Convert-ToText $row.title (Get-TitleFallbackFromPath -Path $row.content_path)
        section = Normalize-SectionLabel -Value $row.section -Fallback (Get-SectionLabelFromPath -Path $row.content_path)
        daily = @{}
        views = 0.0
      }
    }

    $essayMap[$key].views += 1
    $dateKey = Get-DateKey -OccurredAt $row.occurred_at
    $bucket = Get-OrCreateBucket -Map $essayMap[$key].daily -Key $dateKey
    $bucket.pageviews += 1
  }

  foreach ($row in $EventRows | Where-Object { $_.content_path -match $EssayPathPattern -and $_.occurred_at }) {
    $key = $row.content_path
    if (-not $essayMap.ContainsKey($key)) {
      $essayMap[$key] = @{
        slug = Convert-ToText $row.slug (Get-SlugFromPath -Path $row.content_path)
        path = $row.content_path
        title = Convert-ToText $row.title (Get-TitleFallbackFromPath -Path $row.content_path)
        section = Normalize-SectionLabel -Value $row.section -Fallback (Get-SectionLabelFromPath -Path $row.content_path)
        daily = @{}
        views = 0.0
      }
    }

    $dateKey = Get-DateKey -OccurredAt $row.occurred_at
    $bucket = Get-OrCreateBucket -Map $essayMap[$key].daily -Key $dateKey
    switch ($row.event_name) {
      "essay_read" { $bucket.reads += 1 }
      "pdf_download" { $bucket.pdf_downloads += 1 }
      "newsletter_submit" { $bucket.newsletter_submits += 1 }
    }
  }

  return ,@(
    foreach ($entry in ($essayMap.Values | Sort-Object -Property @{ Expression = { $_.views }; Descending = $true } | Select-Object -First 16)) {
      [ordered]@{
        slug = $entry.slug
        path = $entry.path
        title = $entry.title
        section = $entry.section
        series = @(
          foreach ($dateKey in $dateKeys) {
            $bucket = if ($entry.daily.ContainsKey($dateKey)) { $entry.daily[$dateKey] } else { New-DailyMetricBucket }
            [ordered]@{
              date = $dateKey
              pageviews = [double]$bucket.pageviews
              reads = [double]$bucket.reads
              pdf_downloads = [double]$bucket.pdf_downloads
              newsletter_submits = [double]$bucket.newsletter_submits
            }
          }
        )
      }
    }
  )
}

function Get-GoatCounterJourneys {
  param(
    [object[]]$PageRows,
    [object[]]$EventRows
  )

  $journeyMap = @{}
  $sessions = @{}

  foreach ($row in ($PageRows + $EventRows) | Where-Object { $_.session -and $_.occurred_at } | Group-Object -Property session) {
    $sessions[$row.Name] = @($row.Group | Sort-Object -Property occurred_at, raw_path)
  }

  foreach ($sessionKey in $sessions.Keys) {
    $ordered = $sessions[$sessionKey]
    $recentModuleByPath = @{}
    $anchorByPath = @{}

    foreach ($row in $ordered) {
      if ($row.event_name -in @("internal_promo_click", "collection_click") -and $row.content_path) {
        $recentModuleByPath[$row.content_path] = $row
        continue
      }

      if (-not $row.content_path -or $row.content_path -notmatch $EssayPathPattern) {
        continue
      }

      if (-not $row.is_event) {
        $module = $null
        if ($recentModuleByPath.ContainsKey($row.content_path)) {
          $module = $recentModuleByPath[$row.content_path]
        }

        $discoverySource = Convert-ToText $row.attribution.label "direct"
        $discoveryType = Get-SourceType -Attribution $row.attribution
        $slot = ""
        $collection = ""
        if ($null -ne $module) {
          $slot = Convert-ToText $module.source_slot
          $collection = Convert-ToText $module.collection
          if ($slot -or $collection) {
            $discoverySource = if ($collection) { "$slot / $collection" } else { $slot }
            $discoveryType = "internal-module"
          }
        }

        $journeyKey = Get-Key @($discoverySource, $discoveryType, $slot, $collection, $row.content_path)
        if (-not $journeyMap.ContainsKey($journeyKey)) {
          $journeyMap[$journeyKey] = @{
            discovery_source = $discoverySource
            discovery_type = $discoveryType
            module_slot = $slot
            collection = $collection
            slug = Convert-ToText $row.slug (Get-SlugFromPath -Path $row.content_path)
            path = $row.content_path
            title = Convert-ToText $row.title (Get-TitleFallbackFromPath -Path $row.content_path)
            section = Normalize-SectionLabel -Value $row.section -Fallback (Get-SectionLabelFromPath -Path $row.content_path)
            views = 0.0
            reads = 0.0
            pdf_downloads = 0.0
            newsletter_submits = 0.0
          }
        }

        $journeyMap[$journeyKey].views += 1
        $anchorByPath[$row.content_path] = $journeyKey
        continue
      }

      if (-not $anchorByPath.ContainsKey($row.content_path)) {
        continue
      }

      $journeyKey = $anchorByPath[$row.content_path]
      switch ($row.event_name) {
        "essay_read" { $journeyMap[$journeyKey].reads += 1 }
        "pdf_download" { $journeyMap[$journeyKey].pdf_downloads += 1 }
        "newsletter_submit" { $journeyMap[$journeyKey].newsletter_submits += 1 }
      }
    }
  }

  return ,@(
    foreach ($entry in $journeyMap.Values) {
      $discoveryMode = Get-JourneyDiscoveryMode -DiscoveryType $entry.discovery_type -ModuleSlot $entry.module_slot -Collection $entry.collection
      [ordered]@{
        discovery_source = $entry.discovery_source
        discovery_type = $entry.discovery_type
        discovery_mode = $discoveryMode
        module_slot = $entry.module_slot
        collection = $entry.collection
        slug = $entry.slug
        path = $entry.path
        title = $entry.title
        section = $entry.section
        views = [double]$entry.views
        reads = [double]$entry.reads
        read_rate = Get-SafeMetricRate -Numerator $entry.reads -Denominator $entry.views
        pdf_downloads = [double]$entry.pdf_downloads
        pdf_rate = Get-SafeMetricRate -Numerator $entry.pdf_downloads -Denominator $entry.views
        newsletter_submits = [double]$entry.newsletter_submits
        newsletter_rate = Get-SafeMetricRate -Numerator $entry.newsletter_submits -Denominator $entry.views
        approximate_downstream = $true
        attribution_note = "Pageviews are measured directly. Read, PDF, and newsletter steps are approximate same-session downstream events."
      }
    }
  ) | Sort-Object -Property @{ Expression = { $_.views }; Descending = $true }, @{ Expression = { $_.reads }; Descending = $true } | Select-Object -First 60
}

function Get-GoatCounterJourneyBySource {
  param([object[]]$Journeys)

  $aggregateMap = @{}
  foreach ($row in $Journeys) {
    $label = Convert-ToText $row.discovery_source "direct"
    $type = Convert-ToText $row.discovery_type
    $mode = Convert-ToText $row.discovery_mode
    $key = Get-Key @($label, $type, $mode)
    if (-not $aggregateMap.ContainsKey($key)) {
      $aggregateMap[$key] = New-JourneyAggregate -Label $label -DiscoveryType $type -DiscoveryMode $mode
    }

    $aggregateMap[$key].views += Convert-ToNumber $row.views
    $aggregateMap[$key].reads += Convert-ToNumber $row.reads
    $aggregateMap[$key].pdf_downloads += Convert-ToNumber $row.pdf_downloads
    $aggregateMap[$key].newsletter_submits += Convert-ToNumber $row.newsletter_submits
  }

  return ,@(
    foreach ($aggregate in $aggregateMap.Values) {
      Convert-JourneyAggregateToRecord -Aggregate $aggregate -LabelFieldName "discovery_source"
    }
  ) | Sort-Object -Property @{ Expression = { $_.views }; Descending = $true }, @{ Expression = { $_.reads }; Descending = $true }
}

function Get-GoatCounterJourneyByCollection {
  param([object[]]$Journeys)

  $aggregateMap = @{}
  foreach ($row in $Journeys | Where-Object { (Convert-ToText $_.collection) -or (Convert-ToText $_.module_slot) }) {
    $label = if (Convert-ToText $row.collection) { Convert-ToText $row.collection } else { Convert-ToText $row.module_slot "Unlabeled module" }
    $type = Convert-ToText $row.discovery_type
    $mode = Convert-ToText $row.discovery_mode
    $slot = Convert-ToText $row.module_slot
    $collection = Convert-ToText $row.collection
    $section = Normalize-SectionLabel -Value $row.section -Fallback ""
    $key = Get-Key @($label, $slot, $collection, $section)
    if (-not $aggregateMap.ContainsKey($key)) {
      $aggregateMap[$key] = New-JourneyAggregate -Label $label -DiscoveryType $type -DiscoveryMode $mode -ModuleSlot $slot -Collection $collection -Section $section
    }

    $aggregateMap[$key].views += Convert-ToNumber $row.views
    $aggregateMap[$key].reads += Convert-ToNumber $row.reads
    $aggregateMap[$key].pdf_downloads += Convert-ToNumber $row.pdf_downloads
    $aggregateMap[$key].newsletter_submits += Convert-ToNumber $row.newsletter_submits
  }

  return ,@(
    foreach ($aggregate in $aggregateMap.Values) {
      Convert-JourneyAggregateToRecord -Aggregate $aggregate -LabelFieldName "collection_label"
    }
  ) | Sort-Object -Property @{ Expression = { $_.reads }; Descending = $true }, @{ Expression = { $_.views }; Descending = $true }
}

function Get-GoatCounterJourneyByEssay {
  param([object[]]$Journeys)

  $aggregateMap = @{}
  foreach ($row in $Journeys) {
    $slug = Convert-ToText $row.slug
    $path = Convert-ToText $row.path
    $key = Get-Key @($slug, $path)
    if (-not $aggregateMap.ContainsKey($key)) {
      $aggregateMap[$key] = New-JourneyAggregate -Label (Convert-ToText $row.title "Untitled") -Section (Normalize-SectionLabel -Value $row.section -Fallback "Unlabeled") -Slug $slug -Path $path -Title (Convert-ToText $row.title "Untitled")
    }

    $aggregateMap[$key].views += Convert-ToNumber $row.views
    $aggregateMap[$key].reads += Convert-ToNumber $row.reads
    $aggregateMap[$key].pdf_downloads += Convert-ToNumber $row.pdf_downloads
    $aggregateMap[$key].newsletter_submits += Convert-ToNumber $row.newsletter_submits
  }

  return ,@(
    foreach ($aggregate in $aggregateMap.Values) {
      Convert-JourneyAggregateToRecord -Aggregate $aggregate -LabelFieldName "title"
    }
  ) | Sort-Object -Property @{ Expression = { $_.views }; Descending = $true }, @{ Expression = { $_.read_rate }; Descending = $true }
}

function Get-GoatCounterSourcesTimeseries {
  param(
    [object[]]$PageRows,
    [object[]]$EventRows
  )

  $dateKeys = Get-DateRangeKeys -Rows @($PageRows + $EventRows)
  if ($dateKeys.Count -eq 0) {
    return ,@()
  }

  $seriesMap = @{}

  foreach ($row in $PageRows | Where-Object { $_.occurred_at }) {
    $dateKey = Get-DateKey -OccurredAt $row.occurred_at
    $sourceType = Get-SourceType -Attribution $row.attribution
    $key = Get-Key @($dateKey, $sourceType, $row.attribution.label)
    if (-not $seriesMap.ContainsKey($key)) {
      $seriesMap[$key] = @{
        date = $dateKey
        source_type = $sourceType
        source = Convert-ToText $row.attribution.label
        pageviews = 0.0
        reads = 0.0
        pdf_downloads = 0.0
        newsletter_submits = 0.0
      }
    }

    $seriesMap[$key].pageviews += 1
  }

  foreach ($row in $EventRows | Where-Object { $_.occurred_at }) {
    $dateKey = Get-DateKey -OccurredAt $row.occurred_at
    $sourceType = Get-SourceType -Attribution $row.attribution
    $key = Get-Key @($dateKey, $sourceType, $row.attribution.label)
    if (-not $seriesMap.ContainsKey($key)) {
      $seriesMap[$key] = @{
        date = $dateKey
        source_type = $sourceType
        source = Convert-ToText $row.attribution.label
        pageviews = 0.0
        reads = 0.0
        pdf_downloads = 0.0
        newsletter_submits = 0.0
      }
    }

    switch ($row.event_name) {
      "essay_read" { $seriesMap[$key].reads += 1 }
      "pdf_download" { $seriesMap[$key].pdf_downloads += 1 }
      "newsletter_submit" { $seriesMap[$key].newsletter_submits += 1 }
    }
  }

  return ,@(
    foreach ($entry in $seriesMap.Values) {
      [ordered]@{
        date = $entry.date
        source_type = $entry.source_type
        source = $entry.source
        pageviews = [double]$entry.pageviews
        reads = [double]$entry.reads
        read_rate = Get-SafeMetricRate -Numerator $entry.reads -Denominator $entry.pageviews
        pdf_downloads = [double]$entry.pdf_downloads
        newsletter_submits = [double]$entry.newsletter_submits
      }
    }
  ) | Sort-Object -Property date, source_type, @{ Expression = { $_.pageviews }; Descending = $true }
}

function Normalize-GoatCounter {
  param(
    [object[]]$Rows,
    [object]$Metadata
  )

  $parsedRows = @(
    foreach ($row in $Rows) {
      $parsed = Convert-GoatCounterRow -Row $row
      if ($null -ne $parsed -and -not $parsed.is_bot) {
        $parsed
      }
    }
  )

  $pageRows = @($parsedRows | Where-Object { -not $_.is_event -and $_.content_path })
  $eventRows = @($parsedRows | Where-Object { $_.is_event })

  if (@($Rows).Count -gt 0 -and $pageRows.Count -eq 0 -and $eventRows.Count -eq 0) {
    throw "GoatCounter export rows were loaded but none could be normalized into pageviews or events. Check the export header version and column aliases."
  }

  $journeys = Get-GoatCounterJourneys -PageRows $pageRows -EventRows $eventRows

  return @{
    overview = Get-GoatCounterOverview -PageRows $pageRows -EventRows $eventRows -Metadata $Metadata
    essays = Get-GoatCounterEssays -PageRows $pageRows -EventRows $eventRows
    sources = Get-GoatCounterSources -PageRows $pageRows -EventRows $eventRows
    modules = Get-GoatCounterModules -EventRows $eventRows
    periods = Get-GoatCounterPeriods -PageRows $pageRows -EventRows $eventRows
    timeseries_daily = Get-GoatCounterDailyTimeseries -PageRows $pageRows -EventRows $eventRows
    sections = Get-GoatCounterSections -PageRows $pageRows -EventRows $eventRows
    essays_timeseries = Get-GoatCounterEssayTimeseries -PageRows $pageRows -EventRows $eventRows
    journeys = $journeys
    journey_by_source = Get-GoatCounterJourneyBySource -Journeys $journeys
    journey_by_collection = Get-GoatCounterJourneyByCollection -Journeys $journeys
    journey_by_essay = Get-GoatCounterJourneyByEssay -Journeys $journeys
    sources_timeseries = Get-GoatCounterSourcesTimeseries -PageRows $pageRows -EventRows $eventRows
  }
}

function Normalize-Overview {
  param([object]$InputData)

  $map = @{}

  if ($null -eq $InputData) {
    $map["updated_at"] = (Get-Date).ToString("yyyy-MM-dd")
    $map["range_label"] = "Snapshot"
    return $map
  }

  if ($InputData -is [System.Collections.IEnumerable] -and -not ($InputData -is [string])) {
    $items = @($InputData)

    if ($items.Count -eq 1) {
      $map = Convert-ToMap -Value $items[0]
    } else {
      foreach ($item in $items) {
        $metric = Convert-ToText (Get-FieldValue -Row $item -Aliases @("metric", "name", "label", "kpi"))
        if (-not $metric) {
          continue
        }
        $map[(Normalize-Key $metric)] = Get-FieldValue -Row $item -Aliases @("value", "total", "count")
      }
    }
  } else {
    $map = Convert-ToMap -Value $InputData
  }

  return [ordered]@{
    range_label = Convert-ToText (Get-FieldValue -Row $map -Aliases @("range_label", "range", "period", "window")) "Snapshot"
    updated_at = Convert-ToText (Get-FieldValue -Row $map -Aliases @("updated_at", "updated", "snapshot_date")) ((Get-Date).ToString("yyyy-MM-dd"))
    pageviews = Convert-ToNumber (Get-FieldValue -Row $map -Aliases @("pageviews", "views"))
    unique_visitors = Convert-ToNumber (Get-FieldValue -Row $map -Aliases @("unique_visitors", "visitors", "unique_users"))
    reads = Convert-ToNumber (Get-FieldValue -Row $map -Aliases @("reads", "essay_reads"))
    read_rate = Convert-ToNumber (Get-FieldValue -Row $map -Aliases @("read_rate", "reads_rate"))
    pdf_downloads = Convert-ToNumber (Get-FieldValue -Row $map -Aliases @("pdf_downloads", "downloads"))
    newsletter_submits = Convert-ToNumber (Get-FieldValue -Row $map -Aliases @("newsletter_submits", "submits", "newsletter"))
  }
}

function Normalize-Essays {
  param([object]$InputData)

  if ($null -eq $InputData) {
    return ,@()
  }

  $rows = @($InputData)
  if ($rows.Count -eq 1 -and $null -eq $rows[0]) {
    return ,@()
  }
  $normalized = @()

  foreach ($row in $rows) {
    $slug = Convert-ToText (Get-FieldValue -Row $row -Aliases @("slug", "page_slug"))
    $title = Convert-ToText (Get-FieldValue -Row $row -Aliases @("title", "page_title"))
    $section = Normalize-SectionLabel -Value (Get-FieldValue -Row $row -Aliases @("section", "section_label")) -Fallback "Essays"
    $path = Convert-ToText (Get-FieldValue -Row $row -Aliases @("path", "rel_permalink", "permalink"))

    if (-not $path -and $slug) {
      $sectionSlug = Get-SectionSlug -SectionLabel $section
      if ($sectionSlug) {
        $path = "/$sectionSlug/$slug/"
      }
    }

    $normalized += [ordered]@{
      slug = $slug
      path = $path
      title = $title
      section = $section
      views = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("views", "pageviews"))
      reads = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("reads", "essay_reads"))
      read_rate = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("read_rate"))
      pdf_downloads = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("pdf_downloads", "downloads"))
      primary_source = Convert-ToText (Get-FieldValue -Row $row -Aliases @("primary_source", "source", "top_source"))
    }
  }

  return ,$normalized
}

function Normalize-Sources {
  param([object]$InputData)

  if ($null -eq $InputData) {
    return ,@()
  }

  $rows = @($InputData)
  if ($rows.Count -eq 1 -and $null -eq $rows[0]) {
    return ,@()
  }
  $normalized = @()

  foreach ($row in $rows) {
    $normalized += [ordered]@{
      source = Convert-ToText (Get-FieldValue -Row $row -Aliases @("source", "utm_source"))
      medium = Convert-ToText (Get-FieldValue -Row $row -Aliases @("medium", "utm_medium"))
      campaign = Convert-ToText (Get-FieldValue -Row $row -Aliases @("campaign", "utm_campaign"))
      content = Convert-ToText (Get-FieldValue -Row $row -Aliases @("content", "utm_content"))
      visitors = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("visitors", "unique_visitors"))
      pageviews = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("pageviews", "views"))
      reads = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("reads"))
    }
  }

  return ,$normalized
}

function Normalize-Modules {
  param([object]$InputData)

  if ($null -eq $InputData) {
    return ,@()
  }

  $rows = @($InputData)
  if ($rows.Count -eq 1 -and $null -eq $rows[0]) {
    return ,@()
  }
  $normalized = @()

  foreach ($row in $rows) {
    $normalized += [ordered]@{
      slot = Convert-ToText (Get-FieldValue -Row $row -Aliases @("slot", "source_slot", "module"))
      collection = Convert-ToText (Get-FieldValue -Row $row -Aliases @("collection"))
      clicks = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("clicks"))
      downstream_reads = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("downstream_reads", "reads"))
    }
  }

  return ,$normalized
}

function Normalize-Periods {
  param([object]$InputData)

  if ($null -eq $InputData) {
    return ,@()
  }

  $rows = @($InputData)
  if ($rows.Count -eq 1 -and $null -eq $rows[0]) {
    return ,@()
  }
  $normalized = @()

  foreach ($row in $rows) {
    $normalized += [ordered]@{
      label = Convert-ToText (Get-FieldValue -Row $row -Aliases @("label", "period", "name"))
      pageviews = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("pageviews", "views"))
      unique_visitors = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("unique_visitors", "visitors"))
      reads = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("reads"))
      read_rate = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("read_rate"))
      pdf_downloads = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("pdf_downloads", "downloads"))
      newsletter_submits = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("newsletter_submits", "submits"))
    }
  }

  return ,$normalized
}

function Normalize-TimeseriesDaily {
  param([object]$InputData)

  if ($null -eq $InputData) {
    return ,@()
  }

  $rows = @($InputData)
  if ($rows.Count -eq 1 -and $null -eq $rows[0]) {
    return ,@()
  }

  return ,@(
    foreach ($row in $rows) {
      [ordered]@{
        date = Convert-ToText (Get-FieldValue -Row $row -Aliases @("date", "day"))
        pageviews = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("pageviews", "views"))
        unique_visitors = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("unique_visitors", "visitors"))
        reads = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("reads"))
        read_rate = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("read_rate"))
        pdf_downloads = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("pdf_downloads", "downloads"))
        newsletter_submits = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("newsletter_submits", "submits"))
      }
    }
  )
}

function Normalize-Sections {
  param(
    [object]$InputData,
    [object[]]$Essays
  )

  if ($null -ne $InputData) {
    $rows = @($InputData)
    if (-not ($rows.Count -eq 1 -and $null -eq $rows[0])) {
      return ,@(
        foreach ($row in $rows) {
          [ordered]@{
            section = Normalize-SectionLabel -Value (Get-FieldValue -Row $row -Aliases @("section"))
            pageviews = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("pageviews", "views"))
            reads = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("reads"))
            read_rate = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("read_rate"))
            pdf_downloads = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("pdf_downloads", "downloads"))
            newsletter_submits = Convert-ToNumber (Get-FieldValue -Row $row -Aliases @("newsletter_submits", "submits"))
            sparkline_pageviews = @()
            sparkline_reads = @()
          }
        }
      )
    }
  }

  $sectionMap = @{}
  foreach ($essay in $Essays) {
    $section = Normalize-SectionLabel -Value $essay.section -Fallback "Unlabeled"
    if (-not $sectionMap.ContainsKey($section)) {
      $sectionMap[$section] = @{
        section = $section
        pageviews = 0.0
        reads = 0.0
        pdf_downloads = 0.0
      }
    }

    $sectionMap[$section].pageviews += Convert-ToNumber $essay.views
    $sectionMap[$section].reads += Convert-ToNumber $essay.reads
    $sectionMap[$section].pdf_downloads += Convert-ToNumber $essay.pdf_downloads
  }

  return ,@(
    foreach ($entry in $sectionMap.Values) {
      [ordered]@{
        section = $entry.section
        pageviews = [double]$entry.pageviews
        reads = [double]$entry.reads
        read_rate = Get-SafeMetricRate -Numerator $entry.reads -Denominator $entry.pageviews
        pdf_downloads = [double]$entry.pdf_downloads
        newsletter_submits = 0.0
        sparkline_pageviews = @()
        sparkline_reads = @()
      }
    }
  ) | Sort-Object -Property @{ Expression = { $_.pageviews }; Descending = $true }
}

function Normalize-EssaysTimeseries {
  param([object]$InputData)

  if ($null -eq $InputData) {
    return ,@()
  }

  return ,@($InputData)
}

function Normalize-Journeys {
  param([object]$InputData)

  if ($null -eq $InputData) {
    return ,@()
  }

  return ,@($InputData)
}

function Normalize-JourneyBySource {
  param([object]$InputData)

  if ($null -eq $InputData) {
    return ,@()
  }

  return ,@($InputData)
}

function Normalize-JourneyByCollection {
  param([object]$InputData)

  if ($null -eq $InputData) {
    return ,@()
  }

  return ,@($InputData)
}

function Normalize-JourneyByEssay {
  param([object]$InputData)

  if ($null -eq $InputData) {
    return ,@()
  }

  return ,@($InputData)
}

function Normalize-SourcesTimeseries {
  param([object]$InputData)

  if ($null -eq $InputData) {
    return ,@()
  }

  return ,@($InputData)
}

Write-Host "Outside In Print ~ Import Analytics" -ForegroundColor Cyan

$rawInput = Read-RawAnalyticsInput -Path $InputPath

if ($rawInput.source -eq "goatcounter") {
  $normalized = Normalize-GoatCounter -Rows $rawInput.rows -Metadata $rawInput.metadata
} else {
  $legacySections = $rawInput.sections
  $normalizedEssays = Normalize-Essays -InputData $legacySections["essays"]
  $normalized = @{
    overview = Normalize-Overview -InputData $legacySections["overview"]
    essays = $normalizedEssays
    sources = Normalize-Sources -InputData $legacySections["sources"]
    modules = Normalize-Modules -InputData $legacySections["modules"]
    periods = Normalize-Periods -InputData $legacySections["periods"]
    timeseries_daily = Normalize-TimeseriesDaily -InputData $legacySections["timeseries_daily"]
    sections = Normalize-Sections -InputData $legacySections["sections"] -Essays $normalizedEssays
    essays_timeseries = Normalize-EssaysTimeseries -InputData $legacySections["essays_timeseries"]
    journeys = Normalize-Journeys -InputData $legacySections["journeys"]
    journey_by_source = Normalize-JourneyBySource -InputData $legacySections["journey_by_source"]
    journey_by_collection = Normalize-JourneyByCollection -InputData $legacySections["journey_by_collection"]
    journey_by_essay = Normalize-JourneyByEssay -InputData $legacySections["journey_by_essay"]
    sources_timeseries = Normalize-SourcesTimeseries -InputData $legacySections["sources_timeseries"]
  }
}

foreach ($section in $Sections) {
  $targetPath = Join-Path $OutputDir "$section.json"
  Write-Utf8Json -Path $targetPath -Value $normalized[$section]
  Write-Host ("Wrote {0}" -f $targetPath) -ForegroundColor Green
}

Write-Host "`nAnalytics import complete." -ForegroundColor Green
