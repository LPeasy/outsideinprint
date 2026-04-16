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
  'layouts/index.html',
  'layouts/_default/list.html',
  'layouts/collections/list.html',
  'layouts/collections/single.html',
  'layouts/library/list.html',
  'layouts/start-here/single.html',
  'layouts/partials/home_front_page.html',
  'layouts/partials/home_imprint_statement.html',
  'layouts/partials/home_selected_collections.html',
  'layouts/partials/home_recent_work.html',
  'layouts/partials/discovery/page-summary.html',
  'layouts/partials/discovery/page-list-item.html',
  'layouts/partials/discovery/collection-card.html',
  'layouts/partials/schema/significant-links.html',
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
  'partial "home_selected_collections.html"',
  'partial "newsletter_signup.html"',
  'site.GetPage "/collections"',
  'site.GetPage "/library"'
)) {
  if ($indexTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/index.html to contain: $requiredSnippet"
  }
}

$homepageOrder = @(
  'partial "home_front_page.html"',
  'partial "home_selected_collections.html"',
  'partial "newsletter_signup.html"',
  'home-browse-title'
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

if ($indexTemplate -match [regex]::Escape('partial "home_imprint_statement.html"')) {
  throw 'Expected layouts/index.html to omit the homepage imprint partial from the homepage composition.'
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
  '.MediaType.Type'
)) {
  if ($baseTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/_default/baseof.html to contain feed autodiscovery support: $requiredSnippet"
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
  'site.Params.homepage.imprint_statement',
  'id="home-imprint-statement-title"'
)) {
  if ($homeImprintTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/home_imprint_statement.html to contain: $requiredSnippet"
  }
}

$homeSelectedCollectionsTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_selected_collections.html') -Raw
foreach ($requiredSnippet in @(
  'partial "collections/get-public-entries.html"',
  'partial "discovery/collection-card.html"',
  '"variant" "item"'
)) {
  if ($homeSelectedCollectionsTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/home_selected_collections.html to contain: $requiredSnippet"
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
  'Welcome',
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

$startHereTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/start-here/single.html') -Raw
foreach ($requiredSnippet in @(
  '.Params.description',
  'start-here-content'
)) {
  if ($startHereTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/start-here/single.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'journey_links.html',
  'Choose a path into the archive'
)) {
  if ($startHereTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/start-here/single.html to remove the retired Welcome-page guidance shell snippet: $retiredSnippet"
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
