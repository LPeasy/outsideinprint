param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,
  [string]$OutputDir = "./data/analytics"
)

$ErrorActionPreference = "Stop"

$Sections = @("overview", "essays", "sources", "modules", "periods")
$EssayPathPattern = "^/(essays|literature|syd-and-oliver|working-papers)/[^/]+/?$"
$AllTimeLabel = "All time"
$GoatCounterExportNames = @("goatcounter-export.csv", "export.csv")

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
    "^/literature/" { return "Books" }
    "^/syd-and-oliver/" { return "Syd and Oliver" }
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

  $headerVersion = $null
  if ($headerLine -match '^(?<version>\d+),Path,') {
    $headerVersion = [int]$Matches["version"]
  }

  if ($null -eq $headerVersion) {
    throw "Unsupported GoatCounter export header in $csvPath. Expected a versioned Path header such as '2,Path'."
  }

  if ($headerVersion -notin @(1, 2)) {
    throw "Unsupported GoatCounter export version '$headerVersion' in $csvPath. Update scripts/import_analytics.ps1 for the new format."
  }

  $metadataPath = Join-Path $DirectoryPath "metadata.json"
  $metadata = @{}
  if (Test-Path $metadataPath) {
    $metadata = Read-StructuredFile -Path $metadataPath
  }

  $rows = Import-Csv -Path $csvPath
  if ($rows.Count -gt 0) {
    $firstRow = @($rows)[0]
    foreach ($requiredColumn in @("Event", "Session", "Referrer", "Date")) {
      if ($null -eq (Get-FieldValue -Row $firstRow -Aliases @($requiredColumn))) {
        throw "GoatCounter export in $csvPath is missing the required '$requiredColumn' column."
      }
    }
  }

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

  $section = Convert-ToText $metadata["section"]
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
        section = Convert-ToText $row.section (Get-SectionLabelFromPath -Path $row.content_path)
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
        section = Convert-ToText $row.section (Get-SectionLabelFromPath -Path $row.content_path)
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

  return @{
    overview = Get-GoatCounterOverview -PageRows $pageRows -EventRows $eventRows -Metadata $Metadata
    essays = Get-GoatCounterEssays -PageRows $pageRows -EventRows $eventRows
    sources = Get-GoatCounterSources -PageRows $pageRows -EventRows $eventRows
    modules = Get-GoatCounterModules -EventRows $eventRows
    periods = Get-GoatCounterPeriods -PageRows $pageRows -EventRows $eventRows
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
    $section = Convert-ToText (Get-FieldValue -Row $row -Aliases @("section", "section_label")) "Essays"
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

Write-Host "Outside In Print ~ Import Analytics" -ForegroundColor Cyan

$rawInput = Read-RawAnalyticsInput -Path $InputPath

if ($rawInput.source -eq "goatcounter") {
  $normalized = Normalize-GoatCounter -Rows $rawInput.rows -Metadata $rawInput.metadata
} else {
  $legacySections = $rawInput.sections
  $normalized = @{
    overview = Normalize-Overview -InputData $legacySections["overview"]
    essays = Normalize-Essays -InputData $legacySections["essays"]
    sources = Normalize-Sources -InputData $legacySections["sources"]
    modules = Normalize-Modules -InputData $legacySections["modules"]
    periods = Normalize-Periods -InputData $legacySections["periods"]
  }
}

foreach ($section in $Sections) {
  $targetPath = Join-Path $OutputDir "$section.json"
  Write-Utf8Json -Path $targetPath -Value $normalized[$section]
  Write-Host ("Wrote {0}" -f $targetPath) -ForegroundColor Green
}

Write-Host "`nAnalytics import complete." -ForegroundColor Green
