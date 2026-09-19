Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

$requiredFiles = @(
  'layouts/partials/collections/reading-path.html',
  'layouts/partials/collections/collection-progress.html',
  'layouts/partials/collections/reading-progress-script.html',
  'tests/collection_reading_path_contract.test.mjs',
  'tests/collection_reading_path_behavior.test.mjs',
  'tests/test_collection_reading_path_contract.ps1'
)

foreach ($relativePath in $requiredFiles) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing COA2 reading-path contract file: $relativePath"
  }
}

$articleSingle = Get-Content -Path (Join-Path $repoRoot 'layouts/_default/single.html') -Raw
foreach ($requiredSnippet in @(
  'partial "collections/resolve-page-collections.html" (dict "page" . "publicOnly" true)',
  '$showCollectionContinuation := false',
  '$isStandardReadingPage :=',
  '{{ if $isStandardReadingPage }}',
  '{{ if not $isStandardReadingPage }}',
  'partial "collections/reading-path.html" .',
  'class="article-publication-record"',
  'Cite this',
  'partial "newsletter_signup.html"',
  '"class" "newsletter-signup--article-exit"',
  '"sourceSlot" "article_exit_newsletter"',
  '"class" "journey-links--article-exit"',
  '"eyebrow" "Article paths"',
  '(dict "href" ("archive/" | absURL) "label" "Archive")',
  '(dict "href" ("collections/" | absURL) "label" "Collections")',
  '(dict "href" ("library/" | absURL) "label" "Library")',
  'partial "collections/reading-progress-script.html" .'
)) {
  if ($articleSingle -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/_default/single.html to contain: $requiredSnippet"
  }
}

if ($articleSingle -match [regex]::Escape('partial "collections/page-membership-block.html" .')) {
  throw 'Did not expect layouts/_default/single.html to mount the standalone collection membership block.'
}

if ($articleSingle -match [regex]::Escape('partial "read_next.html" .')) {
  throw 'Did not expect layouts/_default/single.html to call the retired Read Next partial.'
}

if ($articleSingle -match [regex]::Escape('"class" "journey-links--article"')) {
  throw 'Did not expect layouts/_default/single.html to render header-mounted article journey links.'
}

if ($articleSingle -match [regex]::Escape('partial "authors/card.html"')) {
  throw 'Did not expect layouts/_default/single.html to render the retired aftermatter author card.'
}

$readingPathIndex = $articleSingle.IndexOf('partial "collections/reading-path.html" .', [System.StringComparison]::Ordinal)
$aftermatterIndex = $articleSingle.IndexOf('class="piece-aftermatter"', [System.StringComparison]::Ordinal)
$recordIndex = $articleSingle.IndexOf('class="article-publication-record"', [System.StringComparison]::Ordinal)
$newsletterIndex = $articleSingle.IndexOf('"class" "newsletter-signup--article-exit"', [System.StringComparison]::Ordinal)
$journeyIndex = $articleSingle.IndexOf('"class" "journey-links--article-exit"', [System.StringComparison]::Ordinal)
if ($aftermatterIndex -lt 0 -or $readingPathIndex -le $aftermatterIndex -or $recordIndex -le $readingPathIndex -or
    $newsletterIndex -le $recordIndex -or $journeyIndex -le $newsletterIndex) {
  throw 'Expected the reading path immediately in aftermatter, before publication records and newsletter; exceptional exit links remain after signup.'
}

$collectionSingle = Get-Content -Path (Join-Path $repoRoot 'layouts/collections/single.html') -Raw
foreach ($requiredSnippet in @(
  '<article class="collection-section{{ if $state.public }} collection-section--public{{ end }}{{ if $hasSections }} collection-section--grouped{{ end }}',
  '<h2 id="collection-start-here-title">Start Here</h2>',
  'class="collection-section__ledger"',
  '<ol class="collection-section__items">',
  '{{ if not (and $startHere $isStartHere) }}'
)) {
  if ($collectionSingle -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/collections/single.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'partial "collections/collection-progress.html"',
  'data-collection-item-path="{{ .RelPermalink }}"',
  'class="collection-item-state" data-collection-item-state',
  'partial "collections/reading-progress-script.html" .',
  'Entry point',
  '<h2 id="collection-items-title">Contents</h2>',
  'pieces appear below in collection order',
  '$contentsCount',
  '$label }}: {{ $value'
)) {
  if ($collectionSingle -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/collections/single.html to omit the retired collection-page progress snippet: $retiredSnippet"
  }
}

$readingPath = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/collections/reading-path.html') -Raw
foreach ($requiredSnippet in @(
  'More on',
  'More from',
  'Explore all',
  'Browse the library',
  'class="reading-path__summary"',
  'data-reading-path-root',
  'data-analytics-source-slot="article_continuation_primary"',
  'data-analytics-event="internal_promo_click"',
  'data-analytics-source-slot="article_exit_paths"',
  'data-item-paths="{{ $itemPaths | jsonify }}"',
  'data-item-titles="{{ $itemTitles | jsonify }}"'
)) {
  if ($readingPath -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected reading-path partial to contain: $requiredSnippet"
  }
}

if ($readingPath -match 'Read next|View collection|ReadingTime|Curated position|Newest-first position|Reading progress|After this position|Recommended starting point|Previous piece|Start Again|Up Next|Browse collections|Search the library|data-reading-path-progress|article_continuation_(previous|restart|archive|secondary)|<script|onclick') {
  throw 'Expected a native collection continuation or Library fallback without essay recommendations, visible progress, or new JavaScript.'
}

$publishedPredicate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/collections/is-published.html') -Raw
foreach ($requiredSnippet in @('.Draft', '.Date', '.PublishDate', '.ExpiryDate', 'now')) {
  if ($publishedPredicate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected the shared publication predicate to check $requiredSnippet"
  }
}

$collectionProgress = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/collections/collection-progress.html') -Raw
foreach ($requiredSnippet in @(
  'Reading Progress',
  'Reading progress on this device: 0 of {{ len $items }} pieces.',
  'data-collection-progress-root',
  'data-collection-progress-summary',
  'data-collection-progress-resume',
  'Progress is stored only on this device in your browser.'
)) {
  if ($collectionProgress -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected collection-progress partial to contain: $requiredSnippet"
  }
}

$progressScript = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/collections/reading-progress-script.html') -Raw
foreach ($requiredSnippet in @(
  'oip-reading-progress:v1:',
  'return { available: false, visited: [], updatedAt: "" };',
  'return null;',
  'Start with ',
  'Resume with ',
  'Start Again with ',
  'collection-pill--visited',
  'if (progressNode) {'
)) {
  if ($progressScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected reading-progress script to contain: $requiredSnippet"
  }
}

if ($progressScript -match [regex]::Escape('if (!slug || !currentPath || !itemPaths.length || !progressNode)')) {
  throw 'Article progress recording must not depend on a visible progress label.'
}

$progressSurfaces = $readingPath + "`n" + $collectionProgress + "`n" + $progressScript
if ($progressSurfaces -match 'Visited .* in this browser') {
  throw 'Expected collection progress surfaces to omit the retired browser-visit phrasing.'
}

$docs = Get-Content -Path (Join-Path $repoRoot 'docs/collections-system.md') -Raw
if ($docs -notmatch [regex]::Escape('`oip-reading-progress:v1:<collection-slug>`')) {
  throw 'Expected docs/collections-system.md to document the exact localStorage key.'
}

$layoutMatrix = Get-Content -Path (Join-Path $repoRoot 'docs/layout-ownership-matrix.md') -Raw
foreach ($requiredSnippet in @(
  '`reading-path`',
  '`reading-path__title`',
  '`reading-path__summary`',
  '`reading-path__collection-link`'
)) {
  if ($layoutMatrix -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected docs/layout-ownership-matrix.md to contain: $requiredSnippet"
  }
}

Write-Host 'Collection reading-path contract test passed.'
$global:LASTEXITCODE = 0
exit 0
