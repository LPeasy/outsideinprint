#requires -Version 7.0
param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public'),
  [string]$HugoPath = $env:OIP_HUGO_BIN,
  [string[]]$PublishedIssuePaths = @(),
  [string]$Clock = '',
  [switch]$FixtureOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'helpers/public_output_common.ps1')
if (-not $HugoPath) { $HugoPath = (Resolve-PinnedHugo -RepoRoot $repoRoot).Command }

function Get-DiscoveryAttribute {
  param([string]$Tag, [string]$Name)
  $match = [regex]::Match($Tag, '\b' + [regex]::Escape($Name) + '\s*=\s*(?:"([^"]*)"|''([^'']*)''|([^\s>]+))', 'IgnoreCase')
  foreach ($index in 1..3) {
    if ($match.Groups[$index].Success) { return [Net.WebUtility]::HtmlDecode($match.Groups[$index].Value) }
  }
  return ''
}

function Get-DiscoveryPath {
  param([string]$Href)
  if ($Href -match '^https?://') { return ([uri]$Href).AbsolutePath }
  return $Href
}

function Assert-Discovery {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

# Render the real shared signup and selector with preview flags deliberately on.
# A fixed fixture clock makes every publication boundary independent of today's date.
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('oip-newsletter-discovery-' + [guid]::NewGuid().ToString('N'))
$fixture = [IO.Path]::GetFullPath($fixture)
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
Assert-Discovery ($fixture.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) 'Fixture must stay inside the temporary directory.'
try {
  foreach ($directory in @('layouts/partials/almanack', 'layouts/_default', 'content/almanack', 'content/collections', 'data')) {
    [void](New-Item -ItemType Directory -Path (Join-Path $fixture $directory) -Force)
  }
  Copy-Item -LiteralPath (Join-Path $repoRoot 'layouts/partials/collections') -Destination (Join-Path $fixture 'layouts/partials/collections') -Recurse
  foreach ($partial in @('newsletter_signup.html', 'almanack/latest-issue-url.html')) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "layouts/partials/$partial") -Destination (Join-Path $fixture "layouts/partials/$partial")
  }
  $configOutput = & $HugoPath config --source $repoRoot --format json 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Newsletter fixture configuration failed: $($configOutput -join "`n")" }
  $sourceConfig = ($configOutput -join "`n") | ConvertFrom-Json -AsHashtable -Depth 100
  $config = @{
    baseURL = 'https://newsletter-contract.invalid/'
    disableKinds = @('taxonomy', 'term', 'RSS', 'sitemap')
    params = @{ newsletter = $sourceConfig['params']['newsletter'] }
  }
  [IO.File]::WriteAllText((Join-Path $fixture 'hugo.json'), ($config | ConvertTo-Json -Depth 20))
  [IO.File]::WriteAllText((Join-Path $fixture 'data/collections.json'), (@{
    collections = @(@{ slug = 'bobs-almanack'; explicit_only = $true; order = 'newest-first' })
  } | ConvertTo-Json -Depth 5))
  $signup = '{{ partial "newsletter_signup.html" (dict "page" . "sourceSlot" "fixture_newsletter") }}'
  [IO.File]::WriteAllText((Join-Path $fixture 'layouts/index.html'), $signup)
  [IO.File]::WriteAllText((Join-Path $fixture 'layouts/_default/single.html'), $signup)
  [IO.File]::WriteAllText((Join-Path $fixture 'layouts/_default/list.html'), '{{ .Title }}')
  [IO.File]::WriteAllText((Join-Path $fixture 'content/collections/bobs-almanack.md'), '{"title":"Almanack archive","date":"2010-01-01"}')
  $entries = [ordered]@{
    older = @{ title = 'Older eligible issue'; date = '2020-05-01' }
    latest = @{ title = 'Latest eligible issue'; date = '2020-06-01'; publishDate = '2020-09-01T12:00:00Z' }
    draft = @{ title = 'Draft issue'; date = '2020-08-01'; draft = $true }
    future = @{ title = 'Future issue date'; date = '2030-01-01'; publishDate = '2020-08-01' }
    queued = @{ title = 'Future publication'; date = '2020-08-01'; publishDate = '2030-01-01' }
    expired = @{ title = 'Expired issue'; date = '2020-08-01'; expiryDate = '2020-08-15' }
    expiring = @{ title = 'Expires at build time'; date = '2020-08-01'; expiryDate = '2020-09-01T12:00:00Z' }
    unrelated = @{ title = 'Newer unrelated page'; date = '2020-08-01'; collections = @('other') }
  }
  foreach ($slug in $entries.Keys) {
    $metadata = $entries[$slug]
    if (-not $metadata.ContainsKey('collections')) { $metadata['collections'] = @('bobs-almanack') }
    $frontMatter = $metadata | ConvertTo-Json -Depth 5
    [IO.File]::WriteAllText((Join-Path $fixture "content/almanack/$slug.md"), ($frontMatter + "`nFixture body.`n"))
  }
  foreach ($scenario in @(
    @{ Clock = '2020-09-01T12:00:00Z'; Expected = '/almanack/latest/'; Self = $true },
    @{ Clock = '2019-01-01T12:00:00Z'; Expected = '/collections/bobs-almanack/'; Self = $false }
  )) {
    $buildOutput = & $HugoPath --source $fixture --clock $scenario.Clock --buildDrafts --buildFuture --buildExpired --panicOnWarning 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Newsletter fixture build failed: $($buildOutput -join "`n")" }
    $html = Get-Content -LiteralPath (Join-Path $fixture 'public/index.html') -Raw
    $links = @([regex]::Matches($html, '(?is)<a\b[^>]*>.*?</a>') | Where-Object { (Get-DiscoveryAttribute $_.Value 'data-analytics-source-slot') -ceq 'fixture_newsletter_sample_issue' })
    Assert-Discovery ($links.Count -eq 1) 'Fixture signup must expose one tracked latest-issue link.'
    Assert-Discovery ((Get-DiscoveryAttribute $links[0].Value 'href') -ceq $scenario.Expected) "Fixture must select $($scenario.Expected), skipping preview-only issues."
    Assert-Discovery (([Net.WebUtility]::HtmlDecode([regex]::Replace($links[0].Value, '<[^>]+>', '')).Trim()) -ceq 'Read the latest issue') 'Fixture latest-issue label changed.'
    Assert-Discovery ((Get-DiscoveryAttribute $links[0].Value 'data-analytics-path') -ceq $scenario.Expected) 'Tracked newsletter destination must match the visible link.'
    if ($scenario.Self) {
      $selfHtml = Get-Content -LiteralPath (Join-Path $fixture 'public/almanack/latest/index.html') -Raw
      Assert-Discovery ([Net.WebUtility]::HtmlDecode($selfHtml).Contains("You’re reading the latest issue.")) 'Latest issue must identify itself without a redundant self-link.'
      Assert-Discovery ($selfHtml -notmatch 'data-analytics-source-slot="fixture_newsletter_sample_issue"') 'Latest issue must omit its tracked self-link.'
      $olderHtml = Get-Content -LiteralPath (Join-Path $fixture 'public/almanack/older/index.html') -Raw
      Assert-Discovery ($olderHtml -match 'href="/almanack/latest/"') 'An older issue must link to the latest eligible issue.'
    } else {
      $archiveHtml = Get-Content -LiteralPath (Join-Path $fixture 'public/collections/bobs-almanack/index.html') -Raw
      Assert-Discovery ($archiveHtml -match 'href="/collections/bobs-almanack/"') 'Empty archive must keep the archive fallback link.'
      Assert-Discovery (-not [Net.WebUtility]::HtmlDecode($archiveHtml).Contains("You’re reading the latest issue.")) 'Empty archive must not claim to be a published issue.'
    }
  }
}
finally {
  if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
Write-Host 'Newsletter fixture passed: newest eligible issue, preview exclusions, self-link, and empty archive fallback.'
if ($FixtureOnly) { return }

if ($PublishedIssuePaths.Count -eq 0) {
  $inventory = & (Join-Path $PSScriptRoot 'test_collection_organization_contract.ps1') -PassThru -HugoPath $HugoPath -Clock $Clock
  $PublishedIssuePaths = @($inventory.members['bobs-almanack'] | Where-Object published | ForEach-Object url)
}
Assert-Discovery ($PublishedIssuePaths.Count -gt 0) 'Production coverage requires at least one published Almanack issue.'
$latestPath = $PublishedIssuePaths[0]
$routes = @(
  '/', '/about/', '/collections/bobs-almanack/', '/collections/the-things-we-say/',
  '/essays/one-more-block/', '/essays/rain-before-breakfast/',
  '/subscribe/weekend/', '/subscribe/everyday-history/', '/subscribe/dialogue/',
  '/shop/2045/', '/shop/the-water-cycle/'
) + $PublishedIssuePaths
$previewCount = 0
foreach ($route in $routes) {
  $file = Join-Path $SiteDir ($route.Trim('/') + '/index.html').TrimStart('/')
  $html = Get-Content -LiteralPath $file -Raw
  $nav = [regex]::Match($html, '(?is)<nav\b(?=[^>]*aria-label=(?:"Primary"|Primary))[^>]*>.*?</nav>').Value
  foreach ($class in @('nav-disclosure--read', 'nav-mobile-disclosure--read')) {
    $menu = [regex]::Match($nav, '(?is)<details\b(?=[^>]*\b' + $class + '\b)[^>]*>.*?</details>').Value
    $links = @([regex]::Matches($menu, '(?is)<a\b[^>]*>.*?</a>') | Where-Object { (Get-DiscoveryPath (Get-DiscoveryAttribute $_.Value 'href')) -ceq '/collections/bobs-almanack/' })
    Assert-Discovery ($links.Count -eq 1) "$route must contain one Bob's Almanack link in $class."
    $link = $links[0].Value
    Assert-Discovery ([Net.WebUtility]::HtmlDecode($link) -match 'Bob[\u2019'']s Almanack') "$route Almanack navigation label changed."
    $current = Get-DiscoveryAttribute $link 'aria-current'
    $section = (Get-DiscoveryAttribute $link 'class') -match '\bnav-link--current-section\b'
    if ($route -ceq '/collections/bobs-almanack/') {
      Assert-Discovery ($current -ceq 'page' -and -not $section) 'Almanack archive must mark its navigation link as the current page.'
    } elseif ($route.StartsWith('/almanack/')) {
      Assert-Discovery ($current -ceq '' -and $section) 'Almanack issues must mark their archive link as the current section.'
    } else {
      Assert-Discovery ($current -ceq '' -and -not $section) "$route must not mark Almanack navigation current."
    }
  }
  $routePreviewCount = 0
  foreach ($link in [regex]::Matches($html, '(?is)<a\b[^>]*>.*?</a>')) {
    if ((Get-DiscoveryAttribute $link.Value 'data-analytics-slug') -cne 'bobs-almanack-sample') { continue }
    $previewCount++
    $routePreviewCount++
    Assert-Discovery ((Get-DiscoveryPath (Get-DiscoveryAttribute $link.Value 'href')) -ceq $latestPath) "$route newsletter preview must link to $latestPath."
    Assert-Discovery ((Get-DiscoveryPath (Get-DiscoveryAttribute $link.Value 'data-analytics-path')) -ceq $latestPath) "$route newsletter tracking must use $latestPath."
    Assert-Discovery (([Net.WebUtility]::HtmlDecode([regex]::Replace($link.Value, '<[^>]+>', '')).Trim()) -ceq 'Read the latest issue') "$route newsletter preview must use the shared latest-issue label."
  }
  if ($route -cnotin @('/', '/collections/the-things-we-say/', $latestPath)) {
    Assert-Discovery ($routePreviewCount -gt 0) "$route must retain a tracked newsletter preview link."
  }
  if ($route -ceq '/about/') {
    $inlineLink = @([regex]::Matches($html, '(?s)<a\b[^>]*>\s*read the latest issue\s*</a>'))
    Assert-Discovery ($inlineLink.Count -eq 1 -and (Get-DiscoveryPath (Get-DiscoveryAttribute $inlineLink[0].Value 'href')) -ceq $latestPath) 'About inline newsletter link must use the current issue.'
  }
  if ($route -ceq '/collections/bobs-almanack/') {
    $latestHeading = [regex]::Match($html, '(?is)<h2\b(?=[^>]*id=(?:"almanack-collection-latest-title"|almanack-collection-latest-title))[^>]*>.*?</h2>').Value
    $headingLink = [regex]::Match($latestHeading, '(?is)<a\b[^>]*>').Value
    Assert-Discovery ((Get-DiscoveryPath (Get-DiscoveryAttribute $headingLink 'href')) -ceq $latestPath) 'Almanack collection preview must feature the same latest published issue.'
  }
  if ($route -ceq $latestPath) {
    Assert-Discovery ([Net.WebUtility]::HtmlDecode($html).Contains("You’re reading the latest issue.")) 'Current published issue must render its self-issue message.'
    Assert-Discovery ($html -notmatch 'data-analytics-slug=(?:"bobs-almanack-sample"|bobs-almanack-sample)') 'Current issue must not render a newsletter self-link.'
  }
}
Assert-Discovery ($previewCount -ge $PublishedIssuePaths.Count) 'Expected newsletter preview links across issue, article, funnel, collection, and bookstore surfaces.'
$collectionHtml = [Net.WebUtility]::HtmlDecode((Get-Content -LiteralPath (Join-Path $SiteDir 'collections/the-things-we-say/index.html') -Raw))
$library = Get-Content -LiteralPath (Join-Path $SiteDir 'library/index.json') -Raw | ConvertFrom-Json
$summaries = @{
  '/essays/one-more-block/' = "A morning walk brings a neighbor’s greeting, a short hill, and sunlight on the sidewalk."
  '/essays/rain-before-breakfast/' = 'A morning shower leaves time to sit on the porch and watch a drop fall from a leaf.'
}
foreach ($path in $summaries.Keys) {
  $entry = @($library.items | Where-Object { (Get-DiscoveryPath $_.url) -ceq $path })
  Assert-Discovery ($entry.Count -eq 1 -and $entry[0].summary -ceq $summaries[$path]) "Library summary mismatch for $path."
  $cards = @([regex]::Matches($collectionHtml, '(?is)<article\b(?=[^>]*\breading-card\b)[^>]*>.*?</article>') | Where-Object { $_.Value.Contains($path) })
  Assert-Discovery (@($cards | Where-Object { $_.Value.Contains($summaries[$path]) }).Count -gt 0) "Collection card summary mismatch for $path."
}
Write-Host "Newsletter discovery output passed: latest $latestPath, responsive navigation, preserved preview tracking, and both card summaries."
$global:LASTEXITCODE = 0
