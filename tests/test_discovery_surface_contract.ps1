Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Test-FrontMatterHasImageKey {
  param([string]$RelativePath)

  $fullPath = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    return $false
  }

  $content = Get-Content -Path $fullPath -Raw
  return [regex]::IsMatch($content, '(?m)^(featured_image|image|images):')
}

$requiredFiles = @(
  'layouts/_default/baseof.html',
  'layouts/404.html',
  'layouts/index.html',
  'layouts/_default/list.html',
  'layouts/collections/list.html',
  'layouts/collections/single.html',
  'layouts/library/list.html',
  'layouts/partials/home_front_page.html',
  'layouts/partials/home_imprint_statement.html',
  'layouts/partials/home_selected_collections.html',
  'layouts/partials/entry_threads.html',
  'layouts/partials/home_recent_work.html',
  'layouts/partials/discovery/page-summary.html',
  'layouts/partials/discovery/page-list-item.html',
  'layouts/partials/discovery/collection-card.html',
  'layouts/partials/schema/significant-links.html',
  'layouts/partials/legacy_host_redirect.html',
  'static/start-here/index.html',
  'static/llms.txt',
  'static/llms-full.txt'
)

foreach ($relativePath in $requiredFiles) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing required discovery-surface file: $relativePath"
  }
}

$requiredImageFrontMatterFiles = @(
  'content/about/index.md',
  'content/authors/robert-v-ussley/index.md',
  'content/collections/_index.md',
  'content/collections/floods-water-built-environment.md',
  'content/collections/modern-bios.md',
  'content/collections/moral-religious-philosophical-essays.md',
  'content/collections/reported-case-studies.md',
  'content/collections/risk-uncertainty.md',
  'content/collections/syd-and-oliver-dialogues.md',
  'content/collections/technology-ai-machine-future.md',
  'content/collections/the-ledger.md'
)

foreach ($relativePath in $requiredImageFrontMatterFiles) {
  if (-not (Test-FrontMatterHasImageKey -RelativePath $relativePath)) {
    throw "Expected explicit image front matter on discovery page source: $relativePath"
  }
}

$indexTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/index.html') -Raw
foreach ($requiredSnippet in @(
  'partial "home_front_page.html"',
  'partial "home_imprint_statement.html"',
  'partial "home_selected_collections.html"',
  'partial "newsletter_signup.html"',
  'site.GetPage "/essays"',
  'site.GetPage "/gallery"',
  'site.GetPage "/collections"',
  'site.GetPage "/library"'
)) {
  if ($indexTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/index.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'site.GetPage "/start-here"',
  'site.GetPage "/syd-and-oliver"',
  '"Feeling curious?"',
  'data-analytics-source-slot="random_link"',
  'data-analytics-path="/random/"'
)) {
  if ($indexTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/index.html to omit the retired homepage browse route: $retiredSnippet"
  }
}

$homepageOrder = @(
  'partial "home_front_page.html"',
  'partial "home_imprint_statement.html"',
  'partial "home_selected_collections.html"',
  'home-browse-title',
  'partial "newsletter_signup.html"'
)

$lastIndex = -1
foreach ($snippet in $homepageOrder) {
  $currentIndex = $indexTemplate.IndexOf($snippet, [System.StringComparison]::Ordinal)
  if ($currentIndex -lt 0) {
    throw "Expected layouts/index.html to contain ordered homepage snippet: $snippet"
  }

  if ($currentIndex -le $lastIndex) {
    throw "Expected homepage composition in layouts/index.html to preserve editorial order through: $snippet"
  }

  $lastIndex = $currentIndex
}

$homeFrontPageTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_front_page.html') -Raw -Encoding utf8
foreach ($requiredSnippet in @(
  '<h1 id="home-front-page-title" class="title visually-hidden">{{ site.Title }}</h1>',
  'id="home-front-page-title"',
  'data-home-front-page-region="lead"',
  'data-home-front-page-region="secondary"'
)) {
  if ($homeFrontPageTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/home_front_page.html to contain: $requiredSnippet"
  }
}

$homepageOrder = @(
  'id="home-front-page-title"',
  'class="home-front-page__stories"'
)

$lastManifestoIndex = -1
foreach ($snippet in $homepageOrder) {
  $currentIndex = $homeFrontPageTemplate.IndexOf($snippet, [System.StringComparison]::Ordinal)
  if ($currentIndex -lt 0) {
    throw "Expected layouts/partials/home_front_page.html to contain ordered homepage snippet: $snippet"
  }

  if ($currentIndex -le $lastManifestoIndex) {
    throw "Expected the hidden homepage heading to remain above the homepage story grid in layouts/partials/home_front_page.html."
  }

  $lastManifestoIndex = $currentIndex
}

foreach ($retiredSnippet in @(
  '>Front Page<',
  'A curated front page from Outside In Print, with selected collections, recent work, and archive paths below.',
  'class="home-manifesto"',
  'A digital imprint of essays, reports, dialogues, and literature.',
  'Color over the lines. Read beyond the feed. Think for yourself.',
  'Support independent journalism',
  'Also on the front page'
)) {
  if ($homeFrontPageTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/partials/home_front_page.html to remove the retired visible front-page intro block snippet: $retiredSnippet"
  }
}

$baseTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/_default/baseof.html') -Raw
foreach ($requiredSnippet in @(
  'site.Home.OutputFormats.Get "RSS"',
  '.IsSection',
  '.OutputFormats.Get "RSS"',
  '.MediaType.Type',
  'partial "legacy_host_redirect.html"'
)) {
  if ($baseTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/_default/baseof.html to contain feed autodiscovery support: $requiredSnippet"
  }
}

$legacyRedirectPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/legacy_host_redirect.html') -Raw
foreach ($requiredSnippet in @(
  'legacyHost = "lpeasy.github.io"',
  'legacyPrefix = "/outsideinprint"',
  'canonicalHost = "https://outsideinprint.org"',
  'window.location.hostname !== legacyHost',
  'path.indexOf(legacyPrefix + "/") !== 0',
  'path.slice(legacyPrefix.length)',
  'window.location.replace(canonicalHost + canonicalPath + window.location.search + window.location.hash)'
)) {
  if ($legacyRedirectPartial -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/legacy_host_redirect.html to contain legacy-host redirect support: $requiredSnippet"
  }
}

if ($legacyRedirectPartial -match [regex]::Escape('outsideinprint.org/outsideinprint')) {
  throw 'Expected legacy-host redirect not to preserve the retired /outsideinprint project path on the canonical host.'
}

$notFoundTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/404.html') -Raw
foreach ($requiredSnippet in @(
  'partial "legacy_host_redirect.html"',
  'noindex, follow',
  'Page not found',
  '/library/',
  '/collections/'
)) {
  if ($notFoundTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/404.html to contain legacy-aware not-found support: $requiredSnippet"
  }
}

$llms = Get-Content -Path (Join-Path $repoRoot 'static/llms.txt') -Raw
foreach ($requiredSnippet in @(
  'https://outsideinprint.org/',
  'https://outsideinprint.org/about/',
  'https://outsideinprint.org/authors/robert-v-ussley/',
  'https://outsideinprint.org/essays/',
  'https://outsideinprint.org/syd-and-oliver/',
  'https://outsideinprint.org/collections/',
  'https://outsideinprint.org/library/',
  'https://outsideinprint.org/index.xml'
)) {
  if ($llms -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected static/llms.txt to contain canonical discovery URL: $requiredSnippet"
  }
}

$llmsFull = Get-Content -Path (Join-Path $repoRoot 'static/llms-full.txt') -Raw
foreach ($requiredSnippet in @(
  'Canonical policy:',
  'https://outsideinprint.org/sitemap.xml',
  'https://outsideinprint.org/index.xml',
  'https://outsideinprint.org/about/',
  'https://outsideinprint.org/authors/robert-v-ussley/',
  'Legacy GitHub Pages URLs are not canonical.'
)) {
  if ($llmsFull -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected static/llms-full.txt to contain discovery guidance snippet: $requiredSnippet"
  }
}

$homeImprintTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_imprint_statement.html') -Raw
foreach ($requiredSnippet in @(
  'class="home-manifesto"',
  'id="home-manifesto-title"',
  'home-manifesto__line--primary',
  'home-manifesto__line--secondary',
  'A digital imprint of essays, reports, dialogues, and literature.',
  'Color over the lines. Read beyond the feed. Think for yourself.'
)) {
  if ($homeImprintTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/home_imprint_statement.html to contain: $requiredSnippet"
  }
}

$homeSelectedCollectionsTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_selected_collections.html') -Raw
foreach ($requiredSnippet in @(
  'partial "entry_threads.html" .'
)) {
  if ($homeSelectedCollectionsTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/home_selected_collections.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'collections/get-public-entries.html',
  '.collection.featured',
  'homepage_featured_collection'
)) {
  if ($homeSelectedCollectionsTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/partials/home_selected_collections.html to ignore the retired featured-collection selection path: $retiredSnippet"
  }
}

$entryThreadsPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/entry_threads.html') -Raw
foreach ($requiredSnippet in @(
  '"floods-water-built-environment"',
  '"modern-bios"',
  '"moral-religious-philosophical-essays"',
  'homepage_entry_thread_start',
  'homepage_entry_thread_collection',
  'Start Reading',
  '"in-the-image-of-god" "In the Image of God"',
  'partial "collections/lookup-definition.html"',
  'partial "collections/resolve-items.html"',
  'partial "collections/get-state.html"'
)) {
  if ($entryThreadsPartial -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/entry_threads.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  '.collection.featured',
  'get-public-entries',
  'start_here_entry_thread_',
  'homepage_entry_thread_archive',
  'Browse all collections',
  'showArchiveLink'
)) {
  if ($entryThreadsPartial -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/partials/entry_threads.html not to depend on featured collection state: $retiredSnippet"
  }
}

$collectionsListTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/collections/list.html') -Raw
foreach ($requiredSnippet in @(
  'Collections are curated reading threads across the archive',
  'partial "discovery/collection-card.html"',
  'Featured Collections',
  'Collections Index',
  'Series',
  'Topics',
  'Risk',
  'Floods',
  'AI',
  'Moral / Religious',
  'Public Power'
)) {
  if ($collectionsListTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/collections/list.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'All Collections',
  'Featured %s'
)) {
  if ($collectionsListTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/collections/list.html to remove the retired collections-index snippet: $retiredSnippet"
  }
}

$collectionSingleTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/collections/single.html') -Raw
foreach ($requiredSnippet in @(
  'How to Use This Collection',
  'Related Collections',
  'partial "discovery/page-list-item.html"',
  'partial "discovery/collection-card.html"'
)) {
  if ($collectionSingleTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/collections/single.html to contain: $requiredSnippet"
  }
}

$libraryTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/library/list.html') -Raw
foreach ($requiredSnippet in @(
  'The library is the full catalog of the imprint',
  'partial "collections/resolve-page-collections.html"',
  'partial "discovery/page-list-item.html"'
)) {
  if ($libraryTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/library/list.html to contain: $requiredSnippet"
  }
}

$defaultListTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/_default/list.html') -Raw
foreach ($requiredSnippet in @(
  'Home',
  'partial "discovery/page-list-item.html"',
  'No published pieces are listed here yet.',
  '$orderedPages := sort $pages "Title" "asc"',
  'if eq .Section "essays"',
  '$orderedPages = sort $pages "Date" "desc"'
)) {
  if ($defaultListTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/_default/list.html to contain: $requiredSnippet"
  }
}

$startHereRedirect = Get-Content -Path (Join-Path $repoRoot 'static/start-here/index.html') -Raw
foreach ($requiredSnippet in @(
  '<meta name="robots" content="noindex, follow"',
  '<link rel="canonical" href="https://outsideinprint.org/"',
  '<meta http-equiv="refresh" content="0; url=/"',
  'window.location.replace("/")',
  '>Home<'
)) {
  if ($startHereRedirect -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected static/start-here/index.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'Ways Into the Archive',
  'Browse all collections',
  'Start Reading'
)) {
  if ($startHereRedirect -match [regex]::Escape($retiredSnippet)) {
    throw "Expected static/start-here/index.html to remove the retired Welcome-page discovery snippet: $retiredSnippet"
  }
}

$pageListItemPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/discovery/page-list-item.html') -Raw
foreach ($requiredSnippet in @(
  'partial "discovery/page-summary.html"',
  'partial "collections/resolve-page-collections.html"',
  'data-analytics-source-slot',
  'printf "%d min read"'
)) {
  if ($pageListItemPartial -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected discovery/page-list-item.html to contain: $requiredSnippet"
  }
}

if ($pageListItemPartial -match [regex]::Escape('printf "%s min read"')) {
  throw 'Expected discovery/page-list-item.html to format ReadingTime as an integer, not a string.'
}

$pageSummaryPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/discovery/page-summary.html') -Raw
foreach ($requiredSnippet in @(
  'reflect.IsMap',
  'index . "page"',
  'partial "metadata_description.html" $page'
)) {
  if ($pageSummaryPartial -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected discovery/page-summary.html to contain: $requiredSnippet"
  }
}

$mastheadPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/masthead.html') -Raw
if ($mastheadPartial -match '<h1 class="title">') {
  throw 'Expected the editorial masthead brand to remain non-heading markup so homepage heading ownership stays in layouts/partials/home_front_page.html.'
}

if ($mastheadPartial -notmatch '<div class="title">') {
  throw 'Expected layouts/partials/masthead.html to keep the shared non-heading title container for the editorial brand.'
}

$collectionCardPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/discovery/collection-card.html') -Raw
if ($collectionCardPartial -notmatch 'Recommended entry point') {
  throw 'Expected discovery/collection-card.html to surface the collection start-here link when present.'
}

if ($collectionCardPartial -notmatch 'if \$label') {
  throw 'Expected discovery/collection-card.html to keep grid-card kicker rendering optional rather than unconditional.'
}

if ($collectionCardPartial -match '\{\{- else -\}\}\s*<div class="k">\{\{ title \$entry\.state\.kind \}\}</div>') {
  throw 'Expected discovery/collection-card.html not to fall back to a default kind kicker on grid cards when no label is provided.'
}

$webpageHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/webpage.html') -Raw
if ($webpageHelper -notmatch 'significantLink') {
  throw 'Expected schema/webpage.html to emit significantLink for discovery surfaces.'
}

Write-Host 'Discovery surface contract test passed.'
$global:LASTEXITCODE = 0
exit 0
