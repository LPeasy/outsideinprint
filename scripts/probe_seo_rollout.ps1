param(
  [string]$PriorityUrlsPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/priority-urls.json'),
  [string]$WorksheetPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/rollout-worksheet.csv'),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout'),
  [int]$MaxRedirects = 5,
  [switch]$UpdateWorksheet = $true
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

function Join-BaseRelativeUrl {
  param(
    [string]$BaseUrl,
    [string]$Path
  )

  $base = $BaseUrl.TrimEnd('/') + '/'
  $relative = $Path.TrimStart('/')
  return ([System.Uri]($base + $relative)).AbsoluteUri
}

function Get-AttributeValue {
  param(
    [string]$Tag,
    [string]$Name
  )

  $pattern = '\b' + [regex]::Escape($Name) + '\s*=\s*(?:"([^"]*)"|''([^'']*)''|([^\s>]+))'
  $match = [regex]::Match($Tag, $pattern, 'IgnoreCase')
  if (-not $match.Success) {
    return $null
  }

  foreach ($index in 1..3) {
    if ($match.Groups[$index].Success) {
      return $match.Groups[$index].Value
    }
  }

  return $null
}

function Get-OpenTags {
  param(
    [string]$Html,
    [string]$TagName
  )

  return @([regex]::Matches($Html, '<' + [regex]::Escape($TagName) + '\b[^>]*>', 'IgnoreCase') | ForEach-Object { $_.Value })
}

function Get-MetaContent {
  param(
    [string]$Html,
    [string]$AttributeName,
    [string]$AttributeValue
  )

  foreach ($tag in (Get-OpenTags -Html $Html -TagName 'meta')) {
    if ((Get-AttributeValue -Tag $tag -Name $AttributeName) -eq $AttributeValue) {
      return (Get-AttributeValue -Tag $tag -Name 'content')
    }
  }

  return $null
}

function Get-CanonicalHref {
  param([string]$Html)

  foreach ($tag in (Get-OpenTags -Html $Html -TagName 'link')) {
    if ((Get-AttributeValue -Tag $tag -Name 'rel') -eq 'canonical') {
      return (Get-AttributeValue -Tag $tag -Name 'href')
    }
  }

  return $null
}

function Get-RssFeedUrls {
  param([string]$Html)

  return @(
    Get-OpenTags -Html $Html -TagName 'link' |
      Where-Object {
        (Get-AttributeValue -Tag $_ -Name 'rel') -eq 'alternate' -and
        (Get-AttributeValue -Tag $_ -Name 'type') -eq 'application/rss+xml'
      } |
      ForEach-Object { Get-AttributeValue -Tag $_ -Name 'href' } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
}

function Get-JsonLdTypes {
  param([string]$Html)

  $types = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)
  $matches = [regex]::Matches($Html, '(?is)<script\b[^>]*type\s*=\s*(?:"application/ld\+json"|''application/ld\+json''|application/ld\+json)[^>]*>(.*?)</script>')

  foreach ($match in $matches) {
    $json = $match.Groups[1].Value.Trim()
    if ([string]::IsNullOrWhiteSpace($json)) {
      continue
    }

    try {
      $objects = @((Convert-JsonDocument -Json $json))
    }
    catch {
      continue
    }

    foreach ($object in $objects) {
      $nodes = if ($null -ne $object.'@graph') { @($object.'@graph') } else { @($object) }
      foreach ($node in $nodes) {
        foreach ($nodeType in @($node.'@type')) {
          if (-not [string]::IsNullOrWhiteSpace([string]$nodeType)) {
            [void]$types.Add([string]$nodeType)
          }
        }
      }
    }
  }

  return @($types)
}

function Get-ExpectedJsonLdType {
  param([string]$Path)

  switch -Regex ($Path) {
    '^/$' { return 'WebSite' }
    '^/about/$' { return 'AboutPage' }
    '^/authors/' { return 'ProfilePage' }
    '^/collections/' { return 'CollectionPage' }
    '^/essays/' { return 'Article' }
    default { return $null }
  }
}

function Invoke-CanonicalRequest {
  param(
    [string]$Url,
    [int]$RedirectLimit
  )

  $response = Invoke-WebRequest -Uri $Url -MaximumRedirection $RedirectLimit
  return [pscustomobject]@{
    StatusCode = [int]$response.StatusCode
    FinalUrl = [string]$response.BaseResponse.ResponseUri.AbsoluteUri
    Content = [string]$response.Content
  }
}

function Resolve-LegacyRequest {
  param(
    [string]$Url,
    [int]$RedirectLimit
  )

  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect = $false
  $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
  $client = [System.Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(20)
  $client.DefaultRequestHeaders.UserAgent.ParseAdd('OutsideInPrintSEOProbe/1.0')

  try {
    $currentUrl = $Url
    $hops = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -le $RedirectLimit; $i++) {
      $response = $client.GetAsync($currentUrl).GetAwaiter().GetResult()
      $statusCode = [int]$response.StatusCode
      $locationHeader = $response.Headers.Location
      $resolvedLocation = $null
      if ($locationHeader) {
        $resolvedLocation = ([System.Uri]::new([System.Uri]$currentUrl, $locationHeader)).AbsoluteUri
        $hops.Add(('{0} -> {1}' -f $statusCode, $resolvedLocation))
        if ($statusCode -ge 300 -and $statusCode -lt 400) {
          $currentUrl = $resolvedLocation
          continue
        }
      }

      $content = $null
      if ($response.Content) {
        $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      }

      return [pscustomobject]@{
        StatusCode = $statusCode
        FinalUrl = $currentUrl
        RedirectLocation = $resolvedLocation
        RedirectHops = @($hops)
        Content = $content
      }
    }

    throw "Exceeded redirect limit while probing $Url"
  }
  finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

function Join-Notes {
  param([string[]]$Items)

  return (($Items | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join '; ')
}

function Format-Bool {
  param([bool]$Value)

  if ($Value) {
    return 'yes'
  }

  return 'no'
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$priorityRows = @((Read-JsonFile -Path $PriorityUrlsPath))
if ($priorityRows.Count -eq 0) {
  throw "Priority URL list is empty: $PriorityUrlsPath"
}

$canonicalResults = @()
$legacyResults = @()
$canonicalBaseUrl = ([System.Uri]$priorityRows[0].canonical_url).GetLeftPart([System.UriPartial]::Authority)

foreach ($row in $priorityRows) {
  $path = [string]$row.path
  $canonicalUrl = [string]$row.canonical_url
  $legacyUrl = [string]$row.legacy_url
  $title = [string]$row.title
  $priorityTier = [string]$row.priority_tier
  $kind = [string]$row.kind

  try {
    $response = Invoke-CanonicalRequest -Url $canonicalUrl -RedirectLimit $MaxRedirects
    $html = [string]$response.Content
    $canonicalHref = Get-CanonicalHref -Html $html
    $robots = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'robots'
    $ogImage = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:image'
    $twitterImage = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:image'
    $rssFeeds = @(Get-RssFeedUrls -Html $html)
    $jsonLdTypes = @(Get-JsonLdTypes -Html $html)
    $expectedJsonLdType = Get-ExpectedJsonLdType -Path $path
    $issues = New-Object System.Collections.Generic.List[string]

    if ([string]$response.FinalUrl -ne $canonicalUrl) {
      $issues.Add(("final URL was '{0}'" -f $response.FinalUrl))
    }

    if ($canonicalHref -ne $canonicalUrl) {
      $issues.Add(("canonical href was '{0}'" -f $canonicalHref))
    }

    if ([string]::IsNullOrWhiteSpace($robots) -or $robots -notmatch 'max-image-preview:large') {
      $issues.Add('robots meta missing max-image-preview:large')
    }

    if ([string]::IsNullOrWhiteSpace($ogImage)) {
      $issues.Add('missing og:image')
    }

    if ([string]::IsNullOrWhiteSpace($twitterImage)) {
      $issues.Add('missing twitter:image')
    }

    if ($rssFeeds.Count -eq 0) {
      $issues.Add('missing RSS autodiscovery')
    }

    if (-not [string]::IsNullOrWhiteSpace($expectedJsonLdType) -and $jsonLdTypes -notcontains $expectedJsonLdType) {
      $issues.Add(("missing JSON-LD type '{0}'" -f $expectedJsonLdType))
    }

    if ($path -eq '/' -and $jsonLdTypes -notcontains 'SearchAction') {
      $issues.Add('homepage missing SearchAction')
    }

    $canonicalResults += [pscustomobject][ordered]@{
        probe_type = 'canonical'
        title = $title
        priority_tier = $priorityTier
        kind = $kind
        path = $path
        url = $canonicalUrl
        status_code = [int]$response.StatusCode
        final_url = [string]$response.FinalUrl
        canonical_href = [string]$canonicalHref
        robots = [string]$robots
        has_og_image = -not [string]::IsNullOrWhiteSpace($ogImage)
        has_twitter_image = -not [string]::IsNullOrWhiteSpace($twitterImage)
        rss_feed_count = $rssFeeds.Count
        rss_feed_urls = @($rssFeeds)
        expected_jsonld_type = $expectedJsonLdType
        jsonld_types = @($jsonLdTypes)
        smoke_passed = ($issues.Count -eq 0)
        issues = @($issues)
      }
  }
  catch {
    $canonicalResults += [pscustomobject][ordered]@{
        probe_type = 'canonical'
        title = $title
        priority_tier = $priorityTier
        kind = $kind
        path = $path
        url = $canonicalUrl
        status_code = 0
        final_url = ''
        canonical_href = ''
        robots = ''
        has_og_image = $false
        has_twitter_image = $false
        rss_feed_count = 0
        rss_feed_urls = @()
        expected_jsonld_type = Get-ExpectedJsonLdType -Path $path
        jsonld_types = @()
        smoke_passed = $false
        issues = @([string]$_.Exception.Message)
      }
  }

  try {
    $legacyResponse = Resolve-LegacyRequest -Url $legacyUrl -RedirectLimit $MaxRedirects
    $classification = 'broken_or_stale'
    if ($legacyResponse.StatusCode -eq 301 -and [string]$legacyResponse.RedirectLocation -eq $canonicalUrl) {
      $classification = 'full_path_301'
    }
    elseif ($legacyResponse.StatusCode -eq 200 -and ([string]$legacyResponse.FinalUrl).StartsWith('https://lpeasy.github.io/', [System.StringComparison]::OrdinalIgnoreCase)) {
      $classification = 'live_duplicate_html'
    }
    elseif ($legacyResponse.StatusCode -ge 300 -and $legacyResponse.StatusCode -lt 400) {
      $classification = 'redirect_wrong_destination'
    }

    $legacyResults += [pscustomobject][ordered]@{
        probe_type = 'legacy'
        title = $title
        priority_tier = $priorityTier
        kind = $kind
        path = $path
        url = $legacyUrl
        status_code = [int]$legacyResponse.StatusCode
        final_url = [string]$legacyResponse.FinalUrl
        redirect_location = [string]$legacyResponse.RedirectLocation
        classification = $classification
        redirect_requirement_met = ($classification -eq 'full_path_301')
        redirect_hops = @($legacyResponse.RedirectHops)
      }
  }
  catch {
    $legacyResults += [pscustomobject][ordered]@{
        probe_type = 'legacy'
        title = $title
        priority_tier = $priorityTier
        kind = $kind
        path = $path
        url = $legacyUrl
        status_code = 0
        final_url = ''
        redirect_location = ''
        classification = 'broken_or_stale'
        redirect_requirement_met = $false
        redirect_hops = @([string]$_.Exception.Message)
      }
  }
}

$llmsProbe = [ordered]@{
  url = Join-BaseRelativeUrl -BaseUrl $canonicalBaseUrl -Path '/llms.txt'
  reachable = $false
  contains_canonical_url = $false
  issues = @()
}

try {
  $llmsContent = Invoke-WebRequest -Uri $llmsProbe.url -MaximumRedirection $MaxRedirects
  $llmsProbe.reachable = $true
  $llmsProbe.contains_canonical_url = [string]$llmsContent.Content -match [regex]::Escape($canonicalBaseUrl)
  if (-not $llmsProbe.contains_canonical_url) {
    $llmsProbe.issues += 'llms.txt did not contain the canonical host'
  }
}
catch {
  $llmsProbe.issues += [string]$_.Exception.Message
}

if ($UpdateWorksheet -and (Test-Path -LiteralPath $WorksheetPath -PathType Leaf)) {
  $worksheetRows = @((Import-Csv -Path $WorksheetPath))
  foreach ($worksheetRow in $worksheetRows) {
    $canonicalMatch = @($canonicalResults | Where-Object { $_.url -eq [string]$worksheetRow.url }) | Select-Object -First 1
    $legacyMatch = @($legacyResults | Where-Object { $_.path -eq (([System.Uri]$worksheetRow.url).AbsolutePath) }) | Select-Object -First 1

    if ($canonicalMatch) {
      $worksheetRow.deployed = Format-Bool -Value ([int]$canonicalMatch.status_code -eq 200)
      $worksheetRow.live_smoke_passed = Format-Bool -Value ([bool]$canonicalMatch.smoke_passed)
      $worksheetRow.selected_canonical = [string]$canonicalMatch.canonical_href
      $canonicalNote = if (@($canonicalMatch.issues).Count -gt 0) { ('canonical: ' + ((@($canonicalMatch.issues)) -join ', ')) } else { 'canonical: passed' }
      $worksheetRow.notes = $canonicalNote
    }

    if ($legacyMatch) {
      $worksheetRow.legacy_redirect_passed = Format-Bool -Value ([bool]$legacyMatch.redirect_requirement_met)
      $legacyNote = ('legacy: {0}' -f [string]$legacyMatch.classification)
      $worksheetRow.notes = Join-Notes -Items @([string]$worksheetRow.notes, $legacyNote)
    }
  }

  $worksheetRows | Export-Csv -Path $WorksheetPath -NoTypeInformation -Encoding utf8
}

$summary = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  canonical_base_url = $canonicalBaseUrl
  canonical_pages_total = $canonicalResults.Count
  canonical_pages_passed = @($canonicalResults | Where-Object { $_.smoke_passed }).Count
  legacy_pages_total = $legacyResults.Count
  legacy_redirects_passing = @($legacyResults | Where-Object { $_.redirect_requirement_met }).Count
  llms_reachable = [bool]$llmsProbe.reachable
  llms_contains_canonical_url = [bool]$llmsProbe.contains_canonical_url
}

$report = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  canonical_base_url = $canonicalBaseUrl
  llms_probe = $llmsProbe
  summary = $summary
  canonical_results = @($canonicalResults)
  legacy_results = @($legacyResults)
}

$reportPath = Join-Path $OutputDir 'probe-results.json'
$csvPath = Join-Path $OutputDir 'probe-results.csv'
$markdownPath = Join-Path $OutputDir 'probe-results.md'
Write-JsonFile -Path $reportPath -Value $report

$flatRows = @($canonicalResults) + @($legacyResults)
$flatRows | Export-Csv -Path $csvPath -NoTypeInformation -Encoding utf8

$markdown = New-Object System.Collections.Generic.List[string]
$markdown.Add('# SEO Rollout Probe')
$markdown.Add('')
$markdown.Add(('- Generated at: {0}' -f $report.generated_at))
$markdown.Add(('- Canonical host: {0}' -f $canonicalBaseUrl))
$markdown.Add(('- Canonical pages passed: {0}/{1}' -f $summary.canonical_pages_passed, $summary.canonical_pages_total))
$markdown.Add(('- Legacy redirects passing: {0}/{1}' -f $summary.legacy_redirects_passing, $summary.legacy_pages_total))
$markdown.Add(('- llms.txt reachable: {0}' -f (Format-Bool -Value $summary.llms_reachable)))
$markdown.Add(('- llms.txt contains canonical host: {0}' -f (Format-Bool -Value $summary.llms_contains_canonical_url)))
$markdown.Add('')
$markdown.Add('## Canonical Host Results')
$markdown.Add('')
$markdown.Add('| Title | URL | Smoke | Canonical href | Robots | Issues |')
$markdown.Add('| --- | --- | --- | --- | --- | --- |')
foreach ($row in $canonicalResults) {
  $issueText = if (@($row.issues).Count -gt 0) { (@($row.issues) -join ', ') } else { 'passed' }
  $markdown.Add(('| {0} | {1} | {2} | {3} | {4} | {5} |' -f $row.title, $row.url, (Format-Bool -Value ([bool]$row.smoke_passed)), $row.canonical_href, $row.robots, $issueText))
}

$markdown.Add('')
$markdown.Add('## Legacy Host Results')
$markdown.Add('')
$markdown.Add('| Title | Legacy URL | Status | Final URL | Redirect target |')
$markdown.Add('| --- | --- | --- | --- | --- |')
foreach ($row in $legacyResults) {
  $markdown.Add(('| {0} | {1} | {2} | {3} | {4} |' -f $row.title, $row.url, $row.classification, $row.final_url, $row.redirect_location))
}

$markdown -join [Environment]::NewLine | Out-File -FilePath $markdownPath -Encoding utf8

Write-Host ("Wrote SEO rollout probe outputs to {0}" -f $OutputDir)
$global:LASTEXITCODE = 0
exit 0
