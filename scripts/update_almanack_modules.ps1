param(
  [datetime]$IssueDate = (Get-Date).Date,
  [int]$StartYear = 1990,
  [int]$MaxOnThisDay = 5,
  [int]$MaxWorldEvents = 8,
  [ValidateSet('all', 'archive-links', 'on-this-day', 'weather', 'world-week')]
  [string[]]$Modules = @('all'),
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$CacheDir = '',
  [switch]$RefreshCache,
  [switch]$ReviewOnly,
  [string]$ReviewDir = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($CacheDir)) {
  $CacheDir = Join-Path $Root '.tmp-almanack-cache'
}

if ([string]::IsNullOrWhiteSpace($ReviewDir)) {
  $ReviewDir = Join-Path $Root ('reports\almanack-data-review\{0}' -f $IssueDate.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture))
}

$dataDir = if ($ReviewOnly) { $ReviewDir } else { Join-Path $Root 'data\almanack' }
if (-not (Test-Path -LiteralPath $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}
if (-not (Test-Path -LiteralPath $CacheDir)) {
  New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null
}

$generatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture)
$dateKey = $IssueDate.ToString('MM-dd', [Globalization.CultureInfo]::InvariantCulture)
$dateLabel = $IssueDate.ToString('MMMM d', [Globalization.CultureInfo]::InvariantCulture)
$weekKey = $IssueDate.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
$weekStart = $IssueDate.Date.AddDays(-6)
$runAllModules = $Modules -contains 'all'

function Test-RunModule {
  param([string]$Name)
  return ($runAllModules -or ($Modules -contains $Name))
}

function ConvertTo-YamlScalar {
  param([object]$Value)
  if ($null -eq $Value) { return "''" }
  if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) {
    return ([string]$Value)
  }
  $text = ([string]$Value).Trim() -replace '\s+', ' '
  return "'" + ($text -replace "'", "''") + "'"
}

function Write-Utf8NoBomLines {
  param(
    [string]$Path,
    [string[]]$Lines
  )
  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllLines($Path, $Lines, $encoding)
}

function Get-SafeCacheFileName {
  param(
    [string]$Key,
    [string]$Extension
  )
  $safeKey = $Key.ToLowerInvariant() -replace '[^a-z0-9._-]+', '-'
  $safeKey = $safeKey.Trim('-')
  if ([string]::IsNullOrWhiteSpace($safeKey)) { $safeKey = 'source' }
  return "$safeKey.$Extension"
}

function Get-CachedSourcePath {
  param(
    [string]$Url,
    [string]$CacheKey,
    [string]$Extension,
    [string]$Description
  )

  $cachePath = Join-Path $CacheDir (Get-SafeCacheFileName -Key $CacheKey -Extension $Extension)
  if ((-not $RefreshCache) -and (Test-Path -LiteralPath $cachePath -PathType Leaf)) {
    return $cachePath
  }

  $tempPath = "$cachePath.tmp"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $tempPath -Headers @{ 'User-Agent' = 'OutsideInPrintAlmanack/1.0 (outsideinprint.org)' }
    $tempItem = Get-Item -LiteralPath $tempPath
    if ($tempItem.Length -le 0) {
      throw "Source returned an empty response."
    }
    Move-Item -LiteralPath $tempPath -Destination $cachePath -Force
    return $cachePath
  } catch {
    Remove-Item -LiteralPath $tempPath -ErrorAction SilentlyContinue
    throw "Unable to fetch $Description from $Url. Source data is unavailable and the Almanack data file was not updated. $($_.Exception.Message)"
  }
}

function Get-CachedJsonSource {
  param(
    [string]$Url,
    [string]$CacheKey,
    [string]$Description
  )

  $cachePath = Get-CachedSourcePath -Url $Url -CacheKey $CacheKey -Extension 'json' -Description $Description
  try {
    return Get-Content -LiteralPath $cachePath -Raw | ConvertFrom-Json
  } catch {
    throw "Cached $Description source is not valid JSON: $cachePath. $($_.Exception.Message)"
  }
}

function Convert-HtmlToText {
  param([string]$Html)
  $withoutRefs = $Html -replace '<sup[^>]*>.*?</sup>', ' '
  $withoutTags = $withoutRefs -replace '<[^>]+>', ' '
  $decoded = [System.Net.WebUtility]::HtmlDecode($withoutTags)
  $text = ($decoded -replace '\s+', ' ').Trim()
  $text = $text -replace '\s+([,.;:!?])', '$1'
  $text = $text -replace '\(\s+', '('
  $text = $text -replace '\s+\)', ')'
  return $text
}

function Get-OnThisDayEntries {
  $month = $IssueDate.ToString('MM', [Globalization.CultureInfo]::InvariantCulture)
  $day = $IssueDate.ToString('dd', [Globalization.CultureInfo]::InvariantCulture)
  $sourceUrl = "https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/$month/$day"
  $response = Get-CachedJsonSource -Url $sourceUrl -CacheKey "wikimedia-on-this-day-$dateKey" -Description 'Wikimedia On This Day entries'
  if (-not $response.events) {
    throw "Wikimedia On This Day source returned no events for $dateKey."
  }
  $entries = New-Object System.Collections.Generic.List[object]

  foreach ($event in @($response.events | Select-Object -First $MaxOnThisDay)) {
    $page = @($event.pages | Select-Object -First 1)[0]
    $url = ''
    if ($page -and $page.content_urls -and $page.content_urls.desktop) {
      $url = [string]$page.content_urls.desktop.page
    }
    if (-not $url -and $page.title) {
      $url = 'https://en.wikipedia.org/wiki/' + [uri]::EscapeDataString([string]$page.title)
    }
    $entries.Add([pscustomobject]@{
      Year = [int]$event.year
      Text = [string]$event.text
      SourceUrl = $url
    })
  }

  return [pscustomobject]@{
    SourceUrl = $sourceUrl
    Entries = $entries.ToArray()
  }
}

function Convert-TenthsCToF {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $tenths = [double]$Value.Trim()
  $celsius = $tenths / 10.0
  return [Math]::Round(($celsius * 9.0 / 5.0) + 32.0, 1)
}

function Get-CsvFieldValue {
  param(
    [pscustomobject]$Row,
    [string]$Name
  )
  $property = $Row.PSObject.Properties[$Name]
  if ($null -eq $property) { return $null }
  return [string]$property.Value
}

function Get-WeatherCityRecords {
  $stations = @(
    @{
      Key = 'new-york'
      City = 'New York'
      StationId = 'USW00094728'
      StationName = 'NY City Central Park, NY US'
      Latitude = 40.77898
      Longitude = -73.96925
    },
    @{
      Key = 'los-angeles'
      City = 'Los Angeles'
      StationId = 'USC00045118'
      StationName = 'Los Angeles Downtown USC Campus, CA US'
      Latitude = 34.0236
      Longitude = -118.2911
    },
    @{
      Key = 'chicago'
      City = 'Chicago'
      StationId = 'USW00094846'
      StationName = "Chicago O'Hare International Airport, IL US"
      Latitude = 41.995
      Longitude = -87.9336
    },
    @{
      Key = 'atlanta'
      City = 'Atlanta'
      StationId = 'USW00013874'
      StationName = 'Atlanta Hartsfield International Airport, GA US'
      Latitude = 33.6301
      Longitude = -84.4418
    },
    @{
      Key = 'miami'
      City = 'Miami'
      StationId = 'USW00012839'
      StationName = 'Miami International Airport, FL US'
      Latitude = 25.7906
      Longitude = -80.3164
    }
  )

  $records = New-Object System.Collections.Generic.List[object]

  foreach ($station in $stations) {
    $sourceUrl = "https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/$($station.StationId).csv"
    $cachePath = Get-CachedSourcePath -Url $sourceUrl -CacheKey "noaa-ghcnd-$($station.StationId)" -Extension 'csv' -Description "NOAA/GHCN daily station data for $($station.City)"
    $rows = Import-Csv -LiteralPath $cachePath
    if (-not $rows) {
      throw "NOAA/GHCN station file for $($station.City) contained no rows: $cachePath"
    }

    $lows = New-Object System.Collections.Generic.List[double]
    $highs = New-Object System.Collections.Generic.List[double]
    $averages = New-Object System.Collections.Generic.List[double]
    $usedDates = New-Object System.Collections.Generic.List[datetime]

    foreach ($row in $rows) {
      $date = [datetime]::ParseExact($row.DATE, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
      if ($date.Year -lt $StartYear -or $date.Date -gt $IssueDate.Date) { continue }
      if ($date.ToString('MM-dd', [Globalization.CultureInfo]::InvariantCulture) -ne $dateKey) { continue }

      $low = Convert-TenthsCToF (Get-CsvFieldValue -Row $row -Name 'TMIN')
      $high = Convert-TenthsCToF (Get-CsvFieldValue -Row $row -Name 'TMAX')
      $avg = Convert-TenthsCToF (Get-CsvFieldValue -Row $row -Name 'TAVG')
      if ($null -eq $avg -and $null -ne $low -and $null -ne $high) {
        $avg = [Math]::Round(($low + $high) / 2.0, 1)
      }

      if ($null -ne $low) { $lows.Add($low) }
      if ($null -ne $high) { $highs.Add($high) }
      if ($null -ne $avg) { $averages.Add($avg) }
      if ($null -ne $low -or $null -ne $high -or $null -ne $avg) { $usedDates.Add($date.Date) }
    }

    if ($usedDates.Count -eq 0) {
      throw "No weather observations found for $($station.City) on $dateKey since $StartYear."
    }

    $records.Add([pscustomobject]@{
      Key = $station.Key
      City = $station.City
      StationId = $station.StationId
      StationName = $station.StationName
      Latitude = $station.Latitude
      Longitude = $station.Longitude
      SourceUrl = $sourceUrl
      PeriodStart = ($usedDates | Sort-Object | Select-Object -First 1).ToString('yyyy-MM-dd')
      PeriodEnd = ($usedDates | Sort-Object | Select-Object -Last 1).ToString('yyyy-MM-dd')
      Observations = $usedDates.Count
      MinLowF = [Math]::Round(($lows | Measure-Object -Minimum).Minimum, 1)
      MeanAverageF = [Math]::Round(($averages | Measure-Object -Average).Average, 1)
      MaxHighF = [Math]::Round(($highs | Measure-Object -Maximum).Maximum, 1)
    })
  }

  return $records.ToArray()
}

function Get-WorldWeekEntries {
  $events = New-Object System.Collections.Generic.List[object]
  $sequence = 0

  for ($date = $weekStart.Date; $date -le $IssueDate.Date; $date = $date.AddDays(1)) {
    $pageDate = $date.ToString('yyyy_MMMM_d', [Globalization.CultureInfo]::InvariantCulture)
    $pageTitle = "Portal:Current_events/$pageDate"
    $apiUrl = 'https://en.wikipedia.org/w/api.php?action=parse&page=' + [uri]::EscapeDataString($pageTitle) + '&format=json&prop=text&formatversion=2'
    $response = Get-CachedJsonSource -Url $apiUrl -CacheKey "wikipedia-current-events-$($date.ToString('yyyy-MM-dd'))" -Description "Wikipedia Current Events page $pageTitle"
    if (-not $response.parse -or -not $response.parse.text) {
      throw "Wikipedia Current Events source returned no parse text for $pageTitle."
    }

    $html = [string]$response.parse.text
    $categoryMatches = [regex]::Matches($html, '(?is)<p>\s*<b>(?<category>.*?)</b>\s*</p>(?<body>.*?)(?=<p>\s*<b>|</div></div><div class="current-events-nav")')
    foreach ($categoryMatch in $categoryMatches) {
      $category = Convert-HtmlToText $categoryMatch.Groups['category'].Value
      $body = $categoryMatch.Groups['body'].Value
      $itemMatches = [regex]::Matches($body, '(?is)<li>(?<item>.*?<a\s+rel="nofollow"\s+class="external text"\s+href="(?<url>[^"]+)">(?<source>.*?)</a>).*?</li>')
      foreach ($itemMatch in $itemMatches) {
        $itemHtml = $itemMatch.Groups['item'].Value -replace '<a\s+rel="nofollow"\s+class="external text"\s+href="[^"]+">.*?</a>', ' '
        $text = Convert-HtmlToText $itemHtml
        if ($text.Length -lt 50) { continue }
        if ($text.Length -gt 260) {
          $truncated = $text.Substring(0, 257).TrimEnd()
          $lastSpace = $truncated.LastIndexOf(' ')
          if ($lastSpace -gt 180) {
            $truncated = $truncated.Substring(0, $lastSpace).TrimEnd()
          }
          $truncated = $truncated -replace '\s+\S{1,3}$', ''
          $text = $truncated + '...'
        }
        $score = 10
        if ($category -match 'Armed conflicts|attacks|International relations') { $score += 50 }
        if ($category -match 'Politics and elections|Law and crime') { $score += 35 }
        if ($category -match 'Business and economy|Disasters and accidents|Health and environment|Science and technology') { $score += 20 }
        if ($text -match '(?i)\b(war|conflict|ceasefire|election|president|prime minister|parliament|court|sanction|United Nations|NATO|European Union|China|Russia|Ukraine|Israel|Gaza|India|United States)\b') { $score += 15 }
        if ($text -match '\b([1-9][0-9]{2,}|million|billion)\b') { $score += 5 }

        $sequence++
        $events.Add([pscustomobject]@{
          Date = $date.ToString('yyyy-MM-dd')
          Category = $category
          Text = $text
          SourceName = (Convert-HtmlToText $itemMatch.Groups['source'].Value).Trim('(', ')')
          SourceUrl = [System.Net.WebUtility]::HtmlDecode($itemMatch.Groups['url'].Value)
          Score = $score
          Sequence = $sequence
        })
      }
    }
  }

  if ($events.Count -eq 0) {
    throw "No world-week candidate events were parsed for $($weekStart.ToString('yyyy-MM-dd')) through $weekKey."
  }

  $ranked = $events |
    Sort-Object @{ Expression = 'Score'; Descending = $true }, @{ Expression = 'Date'; Descending = $true }, Sequence |
    Group-Object SourceUrl |
    ForEach-Object { $_.Group | Select-Object -First 1 }

  $selectedBuffer = New-Object System.Collections.Generic.List[object]
  $dateCounts = @{}
  foreach ($event in $ranked) {
    if ($selectedBuffer.Count -ge $MaxWorldEvents) { break }
    if (-not $dateCounts.ContainsKey($event.Date)) { $dateCounts[$event.Date] = 0 }
    if ($dateCounts[$event.Date] -ge 2) { continue }
    $selectedBuffer.Add($event)
    $dateCounts[$event.Date]++
  }

  if ($selectedBuffer.Count -lt $MaxWorldEvents) {
    foreach ($event in $ranked) {
      if ($selectedBuffer.Count -ge $MaxWorldEvents) { break }
      if ($selectedBuffer | Where-Object { $_.SourceUrl -eq $event.SourceUrl }) { continue }
      $selectedBuffer.Add($event)
    }
  }

  $selected = $selectedBuffer | Sort-Object Date, Sequence

  return @($selected)
}

function Write-OnThisDayFile {
  param($Payload)
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("generated_at: $(ConvertTo-YamlScalar $generatedAt)")
  $lines.Add("source:")
  $lines.Add("  name: 'Wikimedia On This Day API'")
  $lines.Add("  url: $(ConvertTo-YamlScalar $Payload.SourceUrl)")
  $lines.Add("dates:")
  $lines.Add("  $(ConvertTo-YamlScalar $dateKey):")
  $lines.Add("    label: $(ConvertTo-YamlScalar $dateLabel)")
  $lines.Add("    events:")
  foreach ($event in $Payload.Entries) {
    $lines.Add("      - year: $($event.Year)")
    $lines.Add("        text: $(ConvertTo-YamlScalar $event.Text)")
    $lines.Add("        source_url: $(ConvertTo-YamlScalar $event.SourceUrl)")
  }
  Write-Utf8NoBomLines -Path (Join-Path $dataDir 'on_this_day.yaml') -Lines $lines.ToArray()
}

function Write-WeatherFile {
  param($Records)
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("generated_at: $(ConvertTo-YamlScalar $generatedAt)")
  $lines.Add("source:")
  $lines.Add("  name: 'NOAA NCEI Global Historical Climatology Network Daily'")
  $lines.Add("  url: 'https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily'")
  $lines.Add("unit: 'F'")
  $lines.Add("dates:")
  $lines.Add("  $(ConvertTo-YamlScalar $dateKey):")
  $lines.Add("    label: $(ConvertTo-YamlScalar $dateLabel)")
  $lines.Add("    start_year: $StartYear")
  $lines.Add("    cities:")
  foreach ($record in $Records) {
    $lines.Add("      - key: $(ConvertTo-YamlScalar $record.Key)")
    $lines.Add("        city: $(ConvertTo-YamlScalar $record.City)")
    $lines.Add("        station_id: $(ConvertTo-YamlScalar $record.StationId)")
    $lines.Add("        station_name: $(ConvertTo-YamlScalar $record.StationName)")
    $lines.Add("        latitude: $($record.Latitude)")
    $lines.Add("        longitude: $($record.Longitude)")
    $lines.Add("        period_start: $(ConvertTo-YamlScalar $record.PeriodStart)")
    $lines.Add("        period_end: $(ConvertTo-YamlScalar $record.PeriodEnd)")
    $lines.Add("        observations: $($record.Observations)")
    $lines.Add("        min_low_f: $($record.MinLowF)")
    $lines.Add("        mean_average_f: $($record.MeanAverageF)")
    $lines.Add("        max_high_f: $($record.MaxHighF)")
    $lines.Add("        source_url: $(ConvertTo-YamlScalar $record.SourceUrl)")
  }
  Write-Utf8NoBomLines -Path (Join-Path $dataDir 'weather_city_records.yaml') -Lines $lines.ToArray()
}

function Write-WorldWeekFile {
  param($Events)
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("generated_at: $(ConvertTo-YamlScalar $generatedAt)")
  $lines.Add("source:")
  $lines.Add("  name: 'Wikipedia Current Events Portal'")
  $lines.Add("  url: 'https://en.wikipedia.org/wiki/Portal:Current_events'")
  $lines.Add("weeks:")
  $lines.Add("  $(ConvertTo-YamlScalar $weekKey):")
  $lines.Add("    start_date: $(ConvertTo-YamlScalar ($weekStart.ToString('yyyy-MM-dd')))")
  $lines.Add("    end_date: $(ConvertTo-YamlScalar $weekKey)")
  $lines.Add("    selection_note: 'Script-generated draft from dated Current Events pages; review weekly before publishing.'")
  $lines.Add("    events:")
  $order = 1
  foreach ($event in $Events) {
    $lines.Add("      - order: $order")
    $lines.Add("        date: $(ConvertTo-YamlScalar $event.Date)")
    $lines.Add("        category: $(ConvertTo-YamlScalar $event.Category)")
    $lines.Add("        text: $(ConvertTo-YamlScalar $event.Text)")
    $lines.Add("        source_name: $(ConvertTo-YamlScalar $event.SourceName)")
    $lines.Add("        source_url: $(ConvertTo-YamlScalar $event.SourceUrl)")
    $lines.Add("        source_order: $($event.Sequence)")
    $order++
  }
  Write-Utf8NoBomLines -Path (Join-Path $dataDir 'world_week.yaml') -Lines $lines.ToArray()
}

$updatedFiles = New-Object System.Collections.Generic.List[string]

if (Test-RunModule -Name 'archive-links') {
  $archiveScript = Join-Path $PSScriptRoot 'update_almanack_archive_links.ps1'
  if (-not (Test-Path -LiteralPath $archiveScript -PathType Leaf)) {
    throw "Archive-link candidate script is missing: $archiveScript"
  }
  $archiveOutputPath = Join-Path $dataDir 'archive_link_candidates.yaml'
  & $archiveScript -IssueDate $IssueDate -Root $Root -OutputPath $archiveOutputPath
  if (-not $?) {
    throw "Archive-link candidate generation failed."
  }
  $updatedFiles.Add($archiveOutputPath)
}

if (Test-RunModule -Name 'on-this-day') {
  $onThisDay = Get-OnThisDayEntries
  Write-OnThisDayFile -Payload $onThisDay
  $updatedFiles.Add((Join-Path $dataDir 'on_this_day.yaml'))
}

if (Test-RunModule -Name 'weather') {
  $weather = Get-WeatherCityRecords
  Write-WeatherFile -Records $weather
  $updatedFiles.Add((Join-Path $dataDir 'weather_city_records.yaml'))
}

if (Test-RunModule -Name 'world-week') {
  $worldWeek = Get-WorldWeekEntries
  Write-WorldWeekFile -Events $worldWeek
  $updatedFiles.Add((Join-Path $dataDir 'world_week.yaml'))
}

Write-Host "Updated Almanack module data for $($IssueDate.ToString('yyyy-MM-dd')) in $dataDir"
foreach ($updatedFile in $updatedFiles) {
  Write-Host " - $updatedFile"
}
