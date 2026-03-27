Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

$requiredFiles = @(
  'layouts/index.html',
  'layouts/_default/list.html',
  'layouts/collections/list.html',
  'layouts/collections/single.html',
  'layouts/library/list.html',
  'layouts/start-here/single.html',
  'layouts/partials/discovery/page-summary.html',
  'layouts/partials/discovery/page-list-item.html',
  'layouts/partials/discovery/collection-card.html',
  'layouts/partials/schema/significant-links.html'
)

foreach ($relativePath in $requiredFiles) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing required discovery-surface file: $relativePath"
  }
}

$indexTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/index.html') -Raw
foreach ($requiredSnippet in @(
  '<h1 class="title">Outside In Print</h1>',
  'Read by Path',
  'partial "discovery/collection-card.html"',
  'site.GetPage "/collections"',
  'site.GetPage "/library"'
)) {
  if ($indexTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/index.html to contain: $requiredSnippet"
  }
}

$collectionsListTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/collections/list.html') -Raw
foreach ($requiredSnippet in @(
  'Collections are curated reading threads across the archive',
  'partial "discovery/collection-card.html"',
  'Featured Collections',
  'All Collections'
)) {
  if ($collectionsListTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/collections/list.html to contain: $requiredSnippet"
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
  'Read Start Here',
  'partial "discovery/page-list-item.html"',
  'No published pieces are listed here yet.'
)) {
  if ($defaultListTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/_default/list.html to contain: $requiredSnippet"
  }
}

$startHereTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/start-here/single.html') -Raw
foreach ($requiredSnippet in @(
  '.Params.description',
  'Choose a path into the archive',
  'Follow a Collection',
  'Search the Library'
)) {
  if ($startHereTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/start-here/single.html to contain: $requiredSnippet"
  }
}

$pageListItemPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/discovery/page-list-item.html') -Raw
foreach ($requiredSnippet in @(
  'partial "discovery/page-summary.html"',
  'partial "collections/resolve-page-collections.html"',
  'data-analytics-source-slot'
)) {
  if ($pageListItemPartial -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected discovery/page-list-item.html to contain: $requiredSnippet"
  }
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

$collectionCardPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/discovery/collection-card.html') -Raw
if ($collectionCardPartial -notmatch 'Recommended entry point') {
  throw 'Expected discovery/collection-card.html to surface the collection start-here link when present.'
}

$webpageHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/webpage.html') -Raw
if ($webpageHelper -notmatch 'significantLink') {
  throw 'Expected schema/webpage.html to emit significantLink for discovery surfaces.'
}

Write-Host 'Discovery surface contract test passed.'
$global:LASTEXITCODE = 0
exit 0
