Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

$requiredFiles = @(
  'layouts/partials/collections/reading-path.html',
  'layouts/partials/collections/collection-progress.html',
  'layouts/partials/collections/reading-progress-script.html',
  'tests/collection_reading_path_contract.test.mjs',
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
  'partial "collections/reading-path.html" .',
  'partial "read_next.html" .',
  'partial "collections/reading-progress-script.html" .'
)) {
  if ($articleSingle -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/_default/single.html to contain: $requiredSnippet"
  }
}

if ($articleSingle -match [regex]::Escape('partial "collections/page-membership-block.html" .')) {
  throw 'Did not expect layouts/_default/single.html to mount the standalone collection membership block.'
}

if ($articleSingle.IndexOf('partial "collections/reading-path.html" .', [System.StringComparison]::Ordinal) -ge $articleSingle.IndexOf('partial "authors/card.html"', [System.StringComparison]::Ordinal)) {
  throw 'Expected layouts/_default/single.html to place the reading-path partial before the author card.'
}

$collectionSingle = Get-Content -Path (Join-Path $repoRoot 'layouts/collections/single.html') -Raw
foreach ($requiredSnippet in @(
  'partial "collections/collection-progress.html"',
  'data-collection-item-path="{{ .RelPermalink }}"',
  'class="collection-item-state" data-collection-item-state',
  'partial "collections/reading-progress-script.html" .'
)) {
  if ($collectionSingle -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/collections/single.html to contain: $requiredSnippet"
  }
}

$readingPath = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/collections/reading-path.html') -Raw
foreach ($requiredSnippet in @(
  'Continue This Collection',
  'Piece {{ $position }} of {{ $itemCount }}',
  'Visited 1 of {{ $itemCount }} in this browser.',
  'Remaining after this piece: {{ $remainingPieces }} pieces | {{ $remainingMinutes }} min',
  'New to this thread? Start at <a href="{{ $startHere.RelPermalink }}">{{ $startHere.Title }}</a>.',
  'Previous piece',
  'Start Again with {{ .Title }}',
  'Up Next',
  'You&rsquo;re at the end of this collection.',
  'Browse collections',
  'Search the library',
  'data-reading-path-root',
  'data-analytics-source-slot="article_continuation_primary"',
  'data-analytics-source-slot="article_continuation_secondary"',
  'data-analytics-source-slot="article_continuation_previous"',
  'data-analytics-source-slot="article_continuation_restart"',
  'data-analytics-source-slot="article_continuation_archive"',
  'data-item-paths="{{ $itemPaths | jsonify | htmlEscape }}"',
  'data-item-titles="{{ $itemTitles | jsonify | htmlEscape }}"'
)) {
  if ($readingPath -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected reading-path partial to contain: $requiredSnippet"
  }
}

$collectionProgress = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/collections/collection-progress.html') -Raw
foreach ($requiredSnippet in @(
  'Reading Progress',
  'Visited 0 of {{ len $items }} pieces in this browser.',
  'data-collection-progress-root',
  'data-collection-progress-summary',
  'data-collection-progress-resume',
  'Progress is stored only in this browser.'
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
  'collection-pill--visited'
)) {
  if ($progressScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected reading-progress script to contain: $requiredSnippet"
  }
}

$docs = Get-Content -Path (Join-Path $repoRoot 'docs/collections-system.md') -Raw
if ($docs -notmatch [regex]::Escape('`oip-reading-progress:v1:<collection-slug>`')) {
  throw 'Expected docs/collections-system.md to document the exact localStorage key.'
}

$layoutMatrix = Get-Content -Path (Join-Path $repoRoot 'docs/layout-ownership-matrix.md') -Raw
foreach ($requiredSnippet in @(
  '`reading-path`',
  '`reading-path__header`',
  '`reading-path__actions`',
  '`reading-path__preview`',
  '`reading-path__archive-links`'
)) {
  if ($layoutMatrix -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected docs/layout-ownership-matrix.md to contain: $requiredSnippet"
  }
}

Write-Host 'Collection reading-path contract test passed.'
$global:LASTEXITCODE = 0
exit 0
