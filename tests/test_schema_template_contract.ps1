Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

$requiredFiles = @(
  'data/organization.yaml',
  'data/authors.yaml',
  'layouts/partials/authors/resolve.html',
  'layouts/partials/authors/directory.html',
  'layouts/partials/schema.html',
  'layouts/partials/schema/organization.html',
  'layouts/partials/schema/website.html',
  'layouts/partials/schema/image.html',
  'layouts/partials/schema/resolve-author.html',
  'layouts/partials/schema/breadcrumbs.html',
  'layouts/partials/schema/significant-links.html',
  'layouts/partials/schema/webpage.html',
  'layouts/partials/schema/creative-work.html',
  'layouts/partials/schema/creative-work-series.html',
  'layouts/partials/schema/resolve-product-page.html',
  'layouts/partials/schema/book-product.html'
)

foreach ($relativePath in $requiredFiles) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing required schema file: $relativePath"
  }
}

$schemaPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema.html') -Raw
if ($schemaPartial -notmatch 'application/ld\+json') {
  throw 'Expected layouts/partials/schema.html to emit application/ld+json.'
}

if ($schemaPartial -match '<meta\s+itemprop=') {
  throw 'Expected layouts/partials/schema.html to stop emitting legacy itemprop meta tags.'
}

foreach ($requiredHelper in @(
  'partial "schema/organization.html"',
  'partial "schema/website.html"',
  'partial "schema/image.html"',
  'partial "schema/breadcrumbs.html"',
  'partial "schema/resolve-author.html"',
  'partial "schema/creative-work.html"',
  'partial "schema/creative-work-series.html"',
  'partial "schema/book-product.html"'
)) {
  if ($schemaPartial -notmatch [regex]::Escape($requiredHelper)) {
    throw "Expected schema partial to reference helper: $requiredHelper"
  }
}

$webpageHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/webpage.html') -Raw
if ($webpageHelper -notmatch [regex]::Escape('partial "schema/significant-links.html"')) {
  throw 'Expected schema/webpage.html to consume the discovery significant-links helper.'
}

$significantLinksHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/significant-links.html') -Raw
if ($significantLinksHelper -notmatch [regex]::Escape('"/shop"')) {
  throw 'Expected the homepage significantLink helper to include /shop.'
}
if ($significantLinksHelper -notmatch [regex]::Escape('"/collections/syd-and-oliver-dialogues"')) {
  throw 'Expected schema discovery links to use the canonical Syd and Oliver collection.'
}
if ($significantLinksHelper -match [regex]::Escape('"/syd-and-oliver"')) {
  throw 'Expected schema discovery links not to target the legacy Syd and Oliver hub.'
}

$organizationData = Get-Content -Path (Join-Path $repoRoot 'data/organization.yaml') -Raw
if ($organizationData -notmatch 'name:\s*Outside In Print') {
  throw 'Expected data/organization.yaml to define the Outside In Print organization.'
}

if ($organizationData -notmatch 'default_author_id:\s*robert-v-ussley') {
  throw 'Expected data/organization.yaml to default published authorship to robert-v-ussley.'
}

if ($organizationData -notmatch 'image:\s*/images/social/outside-in-print-default\.png') {
  throw 'Expected data/organization.yaml to define the default social image.'
}

$authorsData = Get-Content -Path (Join-Path $repoRoot 'data/authors.yaml') -Raw
if ($authorsData -notmatch 'Outside In Print Editorial') {
  throw 'Expected data/authors.yaml to define the editorial fallback author.'
}

if ($authorsData -notmatch 'Robert V\. Ussley') {
  throw 'Expected data/authors.yaml to define Robert V. Ussley as a canonical author entity.'
}

$authorResolveHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/authors/resolve.html') -Raw
foreach ($requiredSnippet in @(
  '$entry.image',
  '$authorPage.Params.featured_image',
  '$authorPage.Params.portrait'
)) {
  if ($authorResolveHelper -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/authors/resolve.html to support author-image resolution via: $requiredSnippet"
  }
}

$routeHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/metadata/route.html') -Raw
if ($routeHelper -notmatch '"social_type"') {
  throw 'Expected WS-01 route helper to remain available for schema routing.'
}

if ($routeHelper -notmatch [regex]::Escape('eq $relPermalink "/about/"')) {
  throw 'Expected the route helper to classify /about/ explicitly for schema routing.'
}

if ($routeHelper -notmatch '\^/authors/\[\^/\]\+/\$') {
  throw 'Expected the route helper to classify author profile URLs explicitly for schema routing.'
}

foreach ($requiredSnippet in @(
  '(eq $section "shop")',
  '.Params.book_key',
  '$name = "shop-product"'
)) {
  if ($routeHelper -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected the route helper to classify every shop page with book_key as shop-product via: $requiredSnippet"
  }
}

foreach ($requiredSnippet in @(
  '.Params.library_type',
  '$name = "dialogue"',
  '.Params.sample_of_book_key',
  '$name = "shop-sample"',
  '$isArticleLike = true'
)) {
  if ($routeHelper -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected the route helper to classify dialogues and mapped book samples via: $requiredSnippet"
  }
}

$metadataPageHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/metadata/page.html') -Raw
foreach ($requiredSnippet in @(
  'partial "shop/product-data.html"',
  '.Params.metadata_title',
  'index . "metadata_title"',
  '$fullTitle = printf "%s | %s" $title .',
  '"product" $product'
)) {
  if ($metadataPageHelper -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected metadata/page.html to expose shop-product metadata via: $requiredSnippet"
  }
}

$websiteHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/website.html') -Raw
if ($websiteHelper -match 'SearchAction|potentialAction|search_term_string') {
  throw 'Expected schema/website.html to omit the retired sitelinks SearchAction markup.'
}

$organizationHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/organization.html') -Raw
foreach ($requiredSnippet in @(
  '$organizationData.image',
  'dict "image" (dict',
  '"@type" "ImageObject"'
)) {
  if ($organizationHelper -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected schema/organization.html to emit organization image support via: $requiredSnippet"
  }
}

$resolveAuthorHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/resolve-author.html') -Raw
foreach ($requiredSnippet in @(
  '$entry.image',
  'dict "image" (dict',
  '"@type" "ImageObject"'
)) {
  if ($resolveAuthorHelper -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected schema/resolve-author.html to emit author image support via: $requiredSnippet"
  }
}

$webpageHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/webpage.html') -Raw
foreach ($pageType in @('AboutPage', 'ProfilePage')) {
  if ($webpageHelper -notmatch $pageType) {
    throw "Expected schema/webpage.html to support $pageType."
  }
}

if ($webpageHelper -notmatch [regex]::Escape('(eq $meta.route.name "shop-product")')) {
  throw 'Expected schema/webpage.html to connect each shop-product WebPage to its primary entity.'
}

foreach ($requiredSnippet in @(
  '.schema_type',
  '(printf "%s#series" $meta.canonical)'
)) {
  if ($webpageHelper -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected schema/webpage.html to connect the Syd-series primary entity via: $requiredSnippet"
  }
}

$creativeWorkHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/creative-work.html') -Raw
foreach ($requiredSnippet in @(
  'eq $meta.route.name "dialogue"',
  '$workType = "ShortStory"',
  '"genre" "Literary dialogue"',
  '(printf "%s#series" .Permalink)',
  'eq $meta.route.name "shop-sample"',
  '.Params.sample_work_type',
  'partial "schema/resolve-product-page.html"',
  '(printf "%s#primaryentity" .Permalink)',
  '.Params.tags',
  '.Params.topics',
  '$topicKeys'
)) {
  if ($creativeWorkHelper -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected schema/creative-work.html to emit dialogue and sample relationships via: $requiredSnippet"
  }
}

$seriesHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/creative-work-series.html') -Raw
foreach ($requiredSnippet in @(
  '"@type" "CreativeWorkSeries"',
  '.schema_type',
  'partial "collections/resolve-items.html"',
  '"hasPart" $hasPart',
  '"genre" "Literary dialogue"'
)) {
  if ($seriesHelper -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected the Syd collection series schema to contain: $requiredSnippet"
  }
}

$productPageResolver = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/resolve-product-page.html') -Raw
foreach ($requiredSnippet in @(
  'site.GetPage "/shop"',
  '.Params.book_key',
  'sample_of_book_key',
  'errorf'
)) {
  if ($productPageResolver -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected the sample product-page resolver to contain: $requiredSnippet"
  }
}

$bookProductHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/book-product.html') -Raw
foreach ($requiredSnippet in @(
  '(slice "Book" "Product")',
  '"mainEntityOfPage"',
  'index $product "release_date"',
  'index $product "publisher"',
  'index $product "tags"',
  'index $product "direct_offers"',
  'index $offer "price_cents"',
  '(eq $status "live")',
  '"url" $meta.canonical',
  '"availability" "https://schema.org/InStock"',
  '"brand" (dict "@type" "Brand" "name" $brandName)',
  '"seller" $organizationRef'
)) {
  if ($bookProductHelper -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected schema/book-product.html to emit connected book commerce metadata via: $requiredSnippet"
  }
}
if ($bookProductHelper -match 'checkout_(?:url|endpoint)') {
  throw 'Product Offer schema must use the canonical page URL, never a private checkout field.'
}

$breadcrumbHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/breadcrumbs.html') -Raw
if ($breadcrumbHelper -notmatch [regex]::Escape('if not $page.IsHome')) {
  throw 'Expected schema/breadcrumbs.html to provide the generic Home-to-page trail used by About and other top-level routes.'
}
foreach ($routeName in @('"author"', '"article"', '"dialogue"', '"shop-product"', '"shop-sample"')) {
  if ($breadcrumbHelper -notmatch [regex]::Escape($routeName)) {
    throw "Expected schema/breadcrumbs.html to support route $routeName."
  }
}
foreach ($parentPath in @('"/archive"', '"/collections/syd-and-oliver-dialogues"', '"/shop"')) {
  if ($breadcrumbHelper -notmatch [regex]::Escape($parentPath)) {
    throw "Expected schema/breadcrumbs.html to use canonical parent $parentPath."
  }
}
if ($breadcrumbHelper -match '\.CurrentSection') {
  throw 'Schema breadcrumbs must not derive public hierarchy from Hugo source sections.'
}

$sampleMappings = [ordered]@{
  'content/shop/2045/sample.md' = '2045'
  'content/shop/the-american-nightmare-keep-dreaming-kid/sample.md' = 'american_nightmare'
  'content/shop/the-parable-of-the-sheep/sample.md' = 'parable_of_the_sheep'
  'content/shop/the-water-cycle/sample.md' = 'the_water_cycle'
}
foreach ($entry in $sampleMappings.GetEnumerator()) {
  $sampleSource = Get-Content -Path (Join-Path $repoRoot $entry.Key) -Raw
  $mappingPattern = '(?m)^sample_of_book_key:\s*["'']?' + [regex]::Escape($entry.Value) + '["'']?\s*$'
  if ($sampleSource -notmatch $mappingPattern) {
    throw "Expected $($entry.Key) to map to bookstore key $($entry.Value)."
  }
}
$sample2045 = Get-Content -Path (Join-Path $repoRoot 'content/shop/2045/sample.md') -Raw
if ($sample2045 -notmatch '(?m)^sample_work_type:\s*["'']?short-story["'']?\s*$') {
  throw 'Expected the complete 2045 sample to declare the short-story work type.'
}

$webPageOnlySampleTitles = [ordered]@{
  'content/shop/the-american-nightmare-keep-dreaming-kid/sample.md' = 'The American Nightmare — Reading Sample'
  'content/shop/the-parable-of-the-sheep/sample.md' = 'The Parable of the Sheep — Reading Sample'
  'content/shop/the-water-cycle/sample.md' = 'The Water Cycle — Reading Sample'
}
foreach ($entry in $webPageOnlySampleTitles.GetEnumerator()) {
  $sampleSource = Get-Content -Path (Join-Path $repoRoot $entry.Key) -Raw
  if ($sampleSource -match '(?m)^sample_work_type:') {
    throw "Expected $($entry.Key) to remain WebPage-only."
  }
  $titlePattern = '(?m)^metadata_title:\s*["'']' + [regex]::Escape($entry.Value) + '["'']\s*$'
  if ($sampleSource -notmatch $titlePattern) {
    throw "Expected $($entry.Key) metadata title to be $($entry.Value)."
  }
}

$schemaReturnFiles = @(
  'layouts/partials/schema/book-product.html',
  'layouts/partials/schema/breadcrumbs.html',
  'layouts/partials/schema/creative-work.html',
  'layouts/partials/schema/creative-work-series.html',
  'layouts/partials/schema/image.html',
  'layouts/partials/schema/organization.html',
  'layouts/partials/schema/resolve-author.html',
  'layouts/partials/schema/resolve-product-page.html',
  'layouts/partials/schema/significant-links.html',
  'layouts/partials/schema/webpage.html',
  'layouts/partials/schema/website.html'
)

foreach ($relativePath in $schemaReturnFiles) {
  $content = Get-Content -Path (Join-Path $repoRoot $relativePath) -Raw
  $returnMatches = @([regex]::Matches($content, '\{\{[-\s]*return(?:\s+[^}]*)?\}\}'))
  if ($returnMatches.Count -gt 1) {
    throw "Expected $relativePath to contain at most one template return statement."
  }
}

Write-Host 'Schema template contract test passed.'
$global:LASTEXITCODE = 0
exit 0
