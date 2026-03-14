param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,
  [string]$OutputDir = "./data/analytics"
)

$ErrorActionPreference = "Stop"

$Sections = @("overview", "essays", "sources", "modules", "periods")

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

function Get-SectionSlug {
  param([string]$SectionLabel)

  if ([string]::IsNullOrWhiteSpace($SectionLabel)) {
    return ""
  }

  return (($SectionLabel.Trim().ToLowerInvariant() -replace "&", "and") -replace "[^a-z0-9]+", "-").Trim("-")
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

function Read-RawAnalyticsInput {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    throw "Input path not found: $Path"
  }

  $resolved = Resolve-Path $Path
  $item = Get-Item $resolved
  $raw = @{}

  if ($item.PSIsContainer) {
    foreach ($section in $Sections) {
      $sectionFile = @(
        (Join-Path $item.FullName "$section.json"),
        (Join-Path $item.FullName "$section.csv")
      ) | Where-Object { Test-Path $_ } | Select-Object -First 1

      if ($sectionFile) {
        $raw[$section] = Read-StructuredFile -Path $sectionFile
      }
    }

    return $raw
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

  return $raw
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
$normalized = @{
  overview = Normalize-Overview -InputData $rawInput["overview"]
  essays = Normalize-Essays -InputData $rawInput["essays"]
  sources = Normalize-Sources -InputData $rawInput["sources"]
  modules = Normalize-Modules -InputData $rawInput["modules"]
  periods = Normalize-Periods -InputData $rawInput["periods"]
}

foreach ($section in $Sections) {
  $targetPath = Join-Path $OutputDir "$section.json"
  Write-Utf8Json -Path $targetPath -Value $normalized[$section]
  Write-Host ("Wrote {0}" -f $targetPath) -ForegroundColor Green
}

Write-Host "`nAnalytics import complete." -ForegroundColor Green
