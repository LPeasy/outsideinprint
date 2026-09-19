#requires -Version 7.0
[CmdletBinding()]
param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public'),
  [switch]$SourceOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Assert-True {
  param(
    [Parameter(Mandatory)][bool]$Condition,
    [Parameter(Mandatory)][string]$Message
  )

  if (-not $Condition) { throw $Message }
}

function Read-RequiredText {
  param([Parameter(Mandatory)][string]$RelativePath)

  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing feed-policy file: $RelativePath"
  }
  Get-Content -LiteralPath $path -Raw -Encoding utf8
}

$wrapperModes = [ordered]@{
  'layouts/home.rss.xml' = 'root'
  'layouts/archive/rss.xml' = 'longform'
  'layouts/essays/rss.xml' = 'longform'
  'layouts/syd-and-oliver/rss.xml' = 'dialogue'
  'layouts/almanack/rss.xml' = 'almanack'
  'layouts/shop/rss.xml' = 'shop'
}

foreach ($entry in $wrapperModes.GetEnumerator()) {
  $template = Read-RequiredText $entry.Key
  Assert-True ($template.Contains('partial "feeds/resolve-entries.html"', [StringComparison]::Ordinal)) "$($entry.Key) must use the shared feed resolver."
  Assert-True ($template.Contains(('"mode" "' + $entry.Value + '"'), [StringComparison]::Ordinal)) "$($entry.Key) must resolve the $($entry.Value) feed mode."
  Assert-True ($template.Contains('partial "feeds/render-rss.xml"', [StringComparison]::Ordinal)) "$($entry.Key) must use the shared RSS renderer."
}

$canonicalChannelLinks = [ordered]@{
  'layouts/almanack/rss.xml' = '"channelURL" ("collections/bobs-almanack/" | absURL)'
  'layouts/essays/rss.xml' = '"channelURL" ("archive/" | absURL)'
  'layouts/syd-and-oliver/rss.xml' = '"channelURL" ("collections/syd-and-oliver-dialogues/" | absURL)'
}
foreach ($entry in $canonicalChannelLinks.GetEnumerator()) {
  $template = Read-RequiredText $entry.Key
  Assert-True ($template.Contains($entry.Value, [StringComparison]::Ordinal)) "$($entry.Key) must point its RSS channel at the canonical HTML landing page."
}

$config = Read-RequiredText 'hugo.toml'
$outputsBlock = [regex]::Match($config, '(?ms)^\[outputs\]\s*\r?\n(?<body>.*?)(?=^\[|\z)').Groups['body'].Value
Assert-True ($outputsBlock.Length -gt 0) 'hugo.toml must define an explicit outputs policy.'
foreach ($line in @(
  'home = ["HTML", "RSS"]',
  'page = ["HTML"]',
  'section = ["HTML"]'
)) {
  Assert-True ($outputsBlock.Contains($line, [StringComparison]::Ordinal)) "hugo.toml outputs policy is missing: $line"
}

$allowedRssSections = @(
  'content/almanack/_index.md',
  'content/archive/_index.md',
  'content/essays/_index.md',
  'content/shop/_index.md',
  'content/syd-and-oliver/_index.md'
)
$actualRssSections = @()
foreach ($indexFile in Get-ChildItem -LiteralPath (Join-Path $repoRoot 'content') -Filter '_index.md' -File -Recurse) {
  $text = Get-Content -LiteralPath $indexFile.FullName -Raw -Encoding utf8
  $frontMatter = [regex]::Match($text, '(?s)\A(?:\uFEFF)?---\s*\r?\n(?<value>.*?)\r?\n---').Groups['value'].Value
  if ($frontMatter -match '(?ms)^outputs\s*:\s*(?:\[[^\r\n]*\bRSS\b[^\r\n]*\]|.*?^\s*-\s*RSS\s*$)') {
    $actualRssSections += [IO.Path]::GetRelativePath($repoRoot, $indexFile.FullName).Replace('\', '/')
  }
}
$actualRssSections = @($actualRssSections | Sort-Object)
$allowedRssSections = @($allowedRssSections | Sort-Object)
Assert-True (($actualRssSections -join "`n") -ceq ($allowedRssSections -join "`n")) "Only the five approved sections may opt into RSS. Found: $($actualRssSections -join ', ')"

$resolver = Read-RequiredText 'layouts/partials/feeds/resolve-entries.html'
foreach ($snippet in @(
  'slice "essay" "dialogue" "affirmation"',
  '$page.Params.noindex',
  '$page.Params.redirect_to',
  '$page.Params.metadata_title',
  '$page.Date.IsZero',
  '$page.Date.Unix',
  '$page.Draft',
  'now.Unix',
  'eq $layout "sample"',
  'strings.HasSuffix $page.RelPermalink "/sample/"',
  '$site.GetPage "/shop"',
  'partial "shop/product-data.html"',
  'release_date',
  'availability_status',
  'price_cents',
  'currency',
  'first 50 $entries'
)) {
  Assert-True ($resolver.Contains($snippet, [StringComparison]::Ordinal)) "Shared feed resolver is missing policy guard: $snippet"
}

$renderer = Read-RequiredText 'layouts/partials/feeds/render-rss.xml'
foreach ($snippet in @(
  'xmlns:atom="http://www.w3.org/2005/Atom"',
  '<atom:link href="{{ $selfURL }}" rel="self" type="application/rss+xml" />',
  '<language>',
  '$channelURL := .channelURL',
  '<link>{{ $channelURL',
  '<guid isPermaLink="true">',
  'transform.XMLEscape',
  'htmlUnescape'
)) {
  Assert-True ($renderer.Contains($snippet, [StringComparison]::Ordinal)) "Shared RSS renderer is missing: $snippet"
}
Assert-True ($renderer -notmatch '\|\s*html(?:\s|\}\})') 'RSS renderer must not use the double-escaping html pipeline.'

$catalog = Read-RequiredText 'data/bookstore.yaml'
$americanProduct = [regex]::Match($catalog, '(?ms)^  american_nightmare:\s*\r?\n(?<value>.*?)(?=^  [a-z0-9_"]+:|\z)').Groups['value'].Value
Assert-True ($americanProduct -match '(?m)^\s+release_date:\s*"2026-08-21"\s*$') 'American Nightmare must declare its feed release date in bookstore data.'

$almanackList = Read-RequiredText 'layouts/almanack/list.html'
Assert-True ($almanackList.Contains('site.Home.OutputFormats.Get "RSS"', [StringComparison]::Ordinal)) 'Almanack redirect page must advertise the root feed.'
Assert-True ($almanackList.Contains('.OutputFormats.Get "RSS"', [StringComparison]::Ordinal)) 'Almanack redirect page must advertise its own feed.'
$archiveList = Read-RequiredText 'layouts/archive/list.html'
Assert-True (-not $archiveList.Contains('/essays/index.xml', [StringComparison]::Ordinal)) 'Archive must not advertise the Essays compatibility feed.'

$storefrontTest = Read-RequiredText 'tests/test_2045_storefront.ps1'
Assert-True ($storefrontTest.Contains('Book samples must remain outside publication feeds.', [StringComparison]::Ordinal)) '2045 storefront test must enforce the new sample-exclusion feed policy.'
Assert-True ($storefrontTest -notmatch 'dated 2045 story must remain in the site feed') 'The retired root-feed sample requirement is still present.'

if ($SourceOnly) {
  Write-Host 'Feed source policy contract passed.'
  return
}

if (-not (Test-Path -LiteralPath $SiteDir -PathType Container)) {
  throw "Rendered site directory not found: $SiteDir"
}
$siteRoot = (Resolve-Path -LiteralPath $SiteDir).Path
$expectedFeedPaths = @(
  'almanack/index.xml',
  'archive/index.xml',
  'essays/index.xml',
  'index.xml',
  'shop/index.xml',
  'syd-and-oliver/index.xml'
)
$actualFeedPaths = @(
  Get-ChildItem -LiteralPath $siteRoot -Filter 'index.xml' -File -Recurse |
    ForEach-Object { [IO.Path]::GetRelativePath($siteRoot, $_.FullName).Replace('\', '/') } |
    Sort-Object
)
Assert-True (($actualFeedPaths -join "`n") -ceq ($expectedFeedPaths -join "`n")) "Rendered RSS inventory must contain exactly six feeds. Found: $($actualFeedPaths -join ', ')"

function Read-Feed {
  param(
    [Parameter(Mandatory)][string]$RelativePath,
    [Parameter(Mandatory)][string]$ExpectedSelf,
    [Parameter(Mandatory)][string]$ExpectedChannelLink,
    [Parameter(Mandatory)][int]$ExpectedCount
  )

  $path = Join-Path $siteRoot $RelativePath
  $raw = Get-Content -LiteralPath $path -Raw -Encoding utf8
  try {
    [xml]$document = $raw
  }
  catch {
    throw "$RelativePath is not well-formed XML: $($_.Exception.Message)"
  }

  $namespaceManager = [Xml.XmlNamespaceManager]::new($document.NameTable)
  $namespaceManager.AddNamespace('atom', 'http://www.w3.org/2005/Atom')
  $channel = $document.SelectSingleNode('/rss/channel')
  $selfLink = $document.SelectSingleNode('/rss/channel/atom:link', $namespaceManager)
  Assert-True ($null -ne $channel) "$RelativePath is missing its RSS channel."
  Assert-True ($null -ne $selfLink -and $selfLink.GetAttribute('href') -ceq $ExpectedSelf -and $selfLink.GetAttribute('rel') -ceq 'self') "$RelativePath has the wrong Atom self link."
  Assert-True ($channel.SelectSingleNode('link').InnerText -ceq $ExpectedChannelLink) "$RelativePath has the wrong canonical channel link."
  Assert-True ($channel.SelectSingleNode('language').InnerText -ceq 'en-US') "$RelativePath must declare en-US."

  $items = @($channel.SelectNodes('item'))
  Assert-True ($items.Count -eq $ExpectedCount) "$RelativePath must contain $ExpectedCount items; found $($items.Count)."
  Assert-True ($raw -notmatch '(?i)&amp;amp;|&amp;#(?:39|x0*27);') "$RelativePath contains a double-escaped entity."
  Assert-True ($raw -notmatch 'Mon, 01 Jan 0001|year 0001') "$RelativePath contains a zero publication date."

  $links = [Collections.Generic.List[string]]::new()
  $titles = [Collections.Generic.List[string]]::new()
  $dates = [Collections.Generic.List[DateTimeOffset]]::new()
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($item in $items) {
    $title = $item.SelectSingleNode('title').InnerText
    Assert-True (-not [string]::IsNullOrWhiteSpace($title)) "$RelativePath contains an empty item title."
    $link = $item.SelectSingleNode('link').InnerText
    $guid = $item.SelectSingleNode('guid')
    Assert-True ($link.StartsWith('https://outsideinprint.org/', [StringComparison]::Ordinal)) "$RelativePath contains a noncanonical item URL: $link"
    Assert-True ($guid.InnerText -ceq $link -and $guid.GetAttribute('isPermaLink') -ceq 'true') "$RelativePath GUID must be the canonical item URL."
    Assert-True ($seen.Add($link)) "$RelativePath contains duplicate item URL: $link"
    $description = $item.SelectSingleNode('description').InnerText
    Assert-True ($description -notmatch '(?i)&(?:amp|#(?:39|x0*27));') "$RelativePath contains an entity that survived XML decoding."

    $dateText = $item.SelectSingleNode('pubDate').InnerText
    try {
      $date = [DateTimeOffset]::Parse($dateText, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AllowWhiteSpaces)
    }
    catch {
      throw "$RelativePath contains an invalid pubDate '$dateText'."
    }
    Assert-True ($date.Year -gt 2000 -and $date.UtcDateTime -le [DateTime]::UtcNow.AddMinutes(5)) "$RelativePath contains an invalid or future pubDate: $dateText"
    if ($dates.Count -gt 0) {
      Assert-True ($dates[$dates.Count - 1] -ge $date) "$RelativePath items are not sorted newest first."
    }
    $links.Add($link)
    $titles.Add($title)
    $dates.Add($date)
  }

  [pscustomobject]@{
    Raw = $raw
    Links = @($links)
    Titles = @($titles)
    Dates = @($dates)
  }
}

$rootFeed = Read-Feed 'index.xml' 'https://outsideinprint.org/index.xml' 'https://outsideinprint.org/' 50
$archiveFeed = Read-Feed 'archive/index.xml' 'https://outsideinprint.org/archive/index.xml' 'https://outsideinprint.org/archive/' 50
$essaysFeed = Read-Feed 'essays/index.xml' 'https://outsideinprint.org/essays/index.xml' 'https://outsideinprint.org/archive/' 50
$dialogueFeed = Read-Feed 'syd-and-oliver/index.xml' 'https://outsideinprint.org/syd-and-oliver/index.xml' 'https://outsideinprint.org/collections/syd-and-oliver-dialogues/' 19
[xml]$sitemap = Get-Content -LiteralPath (Join-Path $siteRoot 'sitemap.xml') -Raw -Encoding utf8
$expectedAlmanackLinks = @(
  $sitemap.urlset.url | ForEach-Object { [string]$_.loc } |
    Where-Object { $_ -match '^https://outsideinprint\.org/almanack/\d{4}-\d{2}-\d{2}/$' } |
    Sort-Object
)
Assert-True ($expectedAlmanackLinks.Count -gt 0) 'Production sitemap must contain published Almanack issues.'
$almanackFeed = Read-Feed 'almanack/index.xml' 'https://outsideinprint.org/almanack/index.xml' 'https://outsideinprint.org/collections/bobs-almanack/' $expectedAlmanackLinks.Count
Assert-True ((@($almanackFeed.Links | Sort-Object) -join "`n") -ceq ($expectedAlmanackLinks -join "`n")) 'Almanack feed must contain every published issue in the production sitemap exactly once.'
$shopFeed = Read-Feed 'shop/index.xml' 'https://outsideinprint.org/shop/index.xml' 'https://outsideinprint.org/shop/' 2

$archiveHtml = Get-Content -LiteralPath (Join-Path $siteRoot 'archive/index.html') -Raw -Encoding utf8
Assert-True (-not $archiveHtml.Contains('https://outsideinprint.org/essays/index.xml', [StringComparison]::Ordinal)) 'Rendered Archive page must not advertise the Essays compatibility feed.'

Assert-True (($archiveFeed.Links -join "`n") -ceq ($essaysFeed.Links -join "`n")) '/essays/index.xml must mirror the Archive item list exactly.'
Assert-True ((@($dialogueFeed.Links | Where-Object { $_ -notmatch '^https://outsideinprint\.org/syd-and-oliver/[^/]+/$' })).Count -eq 0) 'Syd feed may contain dialogue canonical URLs only.'
Assert-True ((@($almanackFeed.Links | Where-Object { $_ -notmatch '^https://outsideinprint\.org/almanack/[^/]+/$' })).Count -eq 0) 'Almanack feed may contain Almanack issue URLs only.'
Assert-True ((@($almanackFeed.Titles | Select-Object -Unique)).Count -eq $almanackFeed.Titles.Count) 'Almanack feed item titles must be unique.'
Assert-True ((@($almanackFeed.Titles | Where-Object { $_ -notmatch '^Bob''s Almanack — [A-Z][a-z]+ \d{1,2}, \d{4}$' })).Count -eq 0) 'Almanack feed titles must carry their issue dates.'

$rootAlmanackTitles = @()
for ($index = 0; $index -lt $rootFeed.Links.Count; $index++) {
  if ($rootFeed.Links[$index] -match '^https://outsideinprint\.org/almanack/[^/]+/$') {
    $rootAlmanackTitles += $rootFeed.Titles[$index]
  }
}
Assert-True ($rootAlmanackTitles.Count -gt 0) 'Root feed must contain at least one Almanack issue.'
Assert-True ((@($rootAlmanackTitles | Select-Object -Unique)).Count -eq $rootAlmanackTitles.Count) 'Root-feed Almanack titles must be unique.'
Assert-True ((@($rootAlmanackTitles | Where-Object { $_ -notmatch '^Bob''s Almanack — [A-Z][a-z]+ \d{1,2}, \d{4}$' })).Count -eq 0) 'Root-feed Almanack titles must carry their issue dates.'

$expectedShopLinks = @(
  'https://outsideinprint.org/shop/2045/',
  'https://outsideinprint.org/shop/the-american-nightmare-keep-dreaming-kid/'
) | Sort-Object
Assert-True ((@($shopFeed.Links | Sort-Object) -join "`n") -ceq ($expectedShopLinks -join "`n")) 'Shop feed must contain exactly the two release-dated products with live numeric offers.'

foreach ($requiredRootLink in @(
  'https://outsideinprint.org/shop/2045/',
  'https://outsideinprint.org/shop/the-american-nightmare-keep-dreaming-kid/',
  'https://outsideinprint.org/almanack/2026-09-12/'
)) {
  Assert-True ($rootFeed.Links -ccontains $requiredRootLink) "Root feed is missing eligible current item: $requiredRootLink"
}

foreach ($rootLink in $rootFeed.Links) {
  Assert-True ($rootLink -match '^https://outsideinprint\.org/(?:essays|syd-and-oliver|almanack|shop)/') "Root feed contains an ineligible route: $rootLink"
}

$allFeeds = @($rootFeed, $archiveFeed, $essaysFeed, $dialogueFeed, $almanackFeed, $shopFeed)
foreach ($excludedFragment in @(
  '/sample/',
  '/essays/the-cracked-pot/',
  '/apps/',
  '/collections/',
  '/games/',
  '/random/',
  '/shop/thanks/',
  '/support/',
  '/working-papers/'
)) {
  foreach ($feed in $allFeeds) {
    $matchingItemLinks = @($feed.Links | Where-Object { $_.Contains($excludedFragment, [StringComparison]::Ordinal) })
    Assert-True ($matchingItemLinks.Count -eq 0) "Publication feed leaked excluded item route fragment: $excludedFragment"
  }
}

Write-Host 'Rendered feed policy contract passed.'
