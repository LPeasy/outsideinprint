#requires -Version 7.0
[CmdletBinding()]
param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public'),
  [switch]$SourceOnly,
  [switch]$Preview
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
function Read-Source([string]$Path) {
  Get-Content -LiteralPath (Join-Path $repoRoot $Path) -Raw -Encoding utf8
}
function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}
function Read-Output([string]$Path) {
  Get-Content -LiteralPath (Join-Path $SiteDir $Path) -Raw -Encoding utf8
}
function Plain-Text([string]$Html) {
  [regex]::Replace([Net.WebUtility]::HtmlDecode([regex]::Replace($Html, '<[^>]+>', ' ')), '\s+', ' ').Trim()
}
function Html-Attribute([string]$Tag, [string]$Name) {
  $pattern = '(?i)(?<![\w:-])' + [regex]::Escape($Name) + '\s*=\s*(?:"(?<double>[^"]*)"|''(?<single>[^'']*)''|(?<bare>[^\s>]+))'
  $attribute = [regex]::Match($Tag, $pattern)
  foreach ($group in @('double', 'single', 'bare')) {
    if ($attribute.Groups[$group].Success) { return [Net.WebUtility]::HtmlDecode($attribute.Groups[$group].Value) }
  }
  return ''
}
function Meta-Content([string]$Html, [string]$Name) {
  foreach ($tag in [regex]::Matches($Html, '(?is)<meta\b[^>]*>')) {
    if ((Html-Attribute $tag.Value 'property') -eq $Name -or (Html-Attribute $tag.Value 'name') -eq $Name) {
      return Html-Attribute $tag.Value 'content'
    }
  }
  return ''
}

$productSource = Read-Source 'content/shop/2045/_index.md'
$sampleSource = Read-Source 'content/shop/2045/sample.md'
$legacyStorySource = Read-Source 'content/essays/the-cracked-pot.md'
$shopSource = Read-Source 'content/shop/_index.md'
$shopTemplate = Read-Source 'layouts/shop/list.html'
$featureTemplate = Read-Source 'layouts/partials/shop/featured-book.html'
$detailTemplate = Read-Source 'layouts/shop/single.html'
$productDataTemplate = Read-Source 'layouts/partials/shop/product-data.html'
$launchTemplate = Read-Source 'layouts/partials/home_2045_launch.html'
$homeFrontTemplate = Read-Source 'layouts/partials/home_front_page.html'
$articleTemplate = Read-Source 'layouts/_default/single.html'
$sampleTemplate = Read-Source 'layouts/shop/sample.html'
$editionRelationshipTemplate = Read-Source 'layouts/partials/edition-relationship.html'
$siteCss = Read-Source 'assets/css/main.css'
$catalog = Read-Source 'data/bookstore.yaml'
$product = [regex]::Match($catalog, '(?ms)^  "2045":\r?\n(?<product>.*?)(?=^  [a-z_]+:)').Groups['product'].Value
Assert-True ($product.Length -gt 0) 'Missing 2045 catalog entry.'
Assert-True ($productSource -match '(?m)^book_key: "2045"\r?$') '2045 must use its own product key.'
Assert-True ($productSource -match '(?m)^weight: 5\r?$') '2045 must lead the weighted catalog.'
Assert-True ($product -match 'sku: "OIP-TD-EPUB"' -and $product -match '(?m)^\s+price_cents: 1999\r?$') 'Wrong 2045 SKU or price.'
Assert-True ([regex]::Matches($product, '(?m)^\s+price_display: "\$19\.99"\r?$').Count -eq 2) '2045 product and offer must display the approved $19.99 price.'
Assert-True ($product -match '(?m)^\s+checkout_label: "Buy EPUB — \$19\.99"\r?$') '2045 must override the shared checkout label with its approved price.'
Assert-True ($product -notmatch '\$9\.99|price_cents: 999\b') '2045 retains the obsolete price.'
Assert-True ($sampleTemplate.Contains('Explore 2045 · {{ index $product "price_display" }}', [StringComparison]::Ordinal)) '2045 sample CTA must read the canonical product price.'
Assert-True ((Read-Source 'layouts/partials/home_bookstore_spotlight.html') -notmatch '\$9\.99 each') 'Homepage must not claim every book has the same price.'
Assert-True ($product -notmatch '(?i)amazon|kindle|asin|paperback|urn:isbn|\b97[89]\d{10}\b') '2045 contains excluded metadata or an exact ISBN.'
$approvedAlt = [regex]::Match($product, '(?m)^\s+cover_alt: "(?<alt>[^"]+)"\r?$').Groups['alt'].Value
foreach ($source in @($productSource, $sampleSource, $shopSource)) {
  $socialAlt = [regex]::Match($source, '(?m)^image_alt: "(?<alt>[^"]+)"\r?$').Groups['alt'].Value
  Assert-True ($socialAlt -ceq $approvedAlt) '2045 social cover alt must match the approved catalog alt.'
}
Assert-True ($shopSource -match '(?m)^featured_book: "2045"\r?$') 'The bookstore must explicitly feature 2045.'
Assert-True ($shopSource -match '(?m)^image: "books/2045/cover"\r?$') 'Bookstore sharing metadata must use the approved 2045 cover.'
Assert-True ($shopTemplate -match 'where\s+\$shopPages\s+"Params\.book_key"' -and $shopTemplate.Contains('.Params.featured_book', [StringComparison]::Ordinal)) 'The feature must be selected only from publication-visible book pages.'
$featureCall = $shopTemplate.IndexOf('partial "shop/featured-book.html"', [StringComparison]::Ordinal)
$catalogStart = $shopTemplate.IndexOf('id="bookstore-catalog"', [StringComparison]::Ordinal)
Assert-True ($featureCall -ge 0 -and $catalogStart -gt $featureCall) 'The featured book must render above the ordinary catalog.'
Assert-True ($featureTemplate -match 'bookstore-feature' -and $featureTemplate -match 'bookstore-feature-title') 'The feature requires its own named accessible region.'
foreach ($field in @('images/picture.html', 'price_display', 'positioning_label', 'deck')) {
  Assert-True ($featureTemplate.Contains($field, [StringComparison]::Ordinal)) "Featured book must use canonical $field."
}
Assert-True ($featureTemplate -match '#bookstore-purchase' -and $featureTemplate -match '<button\b[^>]*\bdisabled\b') 'The feature must distinguish a product purchase link from a native disabled buy button.'
Assert-True ($featureTemplate -notmatch '<form\b|data-epub-checkout|https://(?:square\.link|checkout\.square\.site|downloads\.outsideinprint\.org)') 'The feature must not submit or open provider checkout directly.'
Assert-True ($detailTemplate -match '<section\b[^>]*id="bookstore-purchase"') 'The product purchase section needs the feature target anchor.'

$expectedStoryTitles = @(
  "The Cracked Pot",
  "Memory Lane",
  "Chicago ’96 / Tomorrow",
  "Zero Sum",
  "The Fair Advertising Tax Reform Act",
  "The Infinite Meeting / Tenebris",
  "Veritas Lex",
  "The Last Human Artist",
  "The Habeas Court",
  "Deus Machina"
)
foreach ($requiredCatalogValue in @(
  'metadata_title: "2045: Ten Dark Fables from the Machine Age"',
  'exclusive_note: "Available only from Outside In Print."',
  'release_date: "2026-09-12"',
  'story_count: 10',
  'word_count: 26749'
)) {
  Assert-True ($product.Contains($requiredCatalogValue, [StringComparison]::Ordinal)) "2045 catalog evidence must contain: $requiredCatalogValue"
}
$storyTitleBlock = [regex]::Match($product, '(?ms)^    story_titles:\r?\n(?<titles>(?:      - "[^"]+"\r?\n?)+)').Groups['titles'].Value
$actualStoryTitles = @([regex]::Matches($storyTitleBlock, '(?m)^      - "(?<title>[^"]+)"\r?$') | ForEach-Object { $_.Groups['title'].Value })
Assert-True ($actualStoryTitles.Count -eq 10) 'The canonical 2045 catalog must contain exactly ten EPUB story titles.'
Assert-True ([string]::Join("`n", $actualStoryTitles) -ceq [string]::Join("`n", $expectedStoryTitles)) 'The canonical 2045 story titles are not in authoritative EPUB order.'
foreach ($requiredValidation in @(
  'must define story_count and story_titles together',
  'must contain exactly ten EPUB story titles',
  'must provide a positive word_count',
  '(slice "sku" "price_cents" "currency")',
  'is missing availability_status',
  'must use numeric price_cents'
)) {
  Assert-True ($productDataTemplate.Contains($requiredValidation, [StringComparison]::Ordinal)) "Canonical bookstore validation must contain: $requiredValidation"
}

$launchConfig = [regex]::Match($catalog, '(?ms)^launch_promotion:\r?\n(?<launch>(?:  [^\r\n]+\r?\n)+)').Groups['launch'].Value
foreach ($requiredLaunchValue in @(
  '  book_key: "2045"',
  '  starts_at: "2026-09-12T00:00:00-04:00"',
  '  ends_at: "2026-09-27T00:00:00-04:00"'
)) {
  Assert-True ($launchConfig.Contains($requiredLaunchValue, [StringComparison]::Ordinal)) "2045 launch configuration must contain: $requiredLaunchValue"
}
$launchPartialIndex = $homeFrontTemplate.IndexOf('partial "home_2045_launch.html" .', [StringComparison]::Ordinal)
Assert-True ($launchPartialIndex -gt $homeFrontTemplate.IndexOf('class="home-front-page__orientation"', [StringComparison]::Ordinal) -and $launchPartialIndex -lt $homeFrontTemplate.IndexOf('class="home-front-page__stories"', [StringComparison]::Ordinal)) 'The launch strip must render below the reader note and above the editorial grid.'
foreach ($requiredLaunchTemplateValue in @(
  'if not $book.Draft',
  'where $epubOffers "availability_status" "live"',
  'New: 2045 — Ten Dark Fables from the Machine Age',
  'Read a complete story',
  'Buy EPUB — $19.99',
  'DRM-free EPUB · U.S. customers only.',
  'homepage_2045_launch_headline',
  'homepage_2045_launch_sample',
  'homepage_2045_launch_buy'
)) {
  Assert-True ($launchTemplate.Contains($requiredLaunchTemplateValue, [StringComparison]::Ordinal)) "2045 launch strip must contain: $requiredLaunchTemplateValue"
}
Assert-True ($launchTemplate.IndexOf('Read a complete story', [StringComparison]::Ordinal) -lt $launchTemplate.IndexOf('Buy EPUB — $19.99', [StringComparison]::Ordinal)) 'The launch strip must keep the complete-story CTA first.'
Assert-True ($launchTemplate -notmatch '<form\b|https://(?:square\.link|checkout\.square\.site|downloads\.outsideinprint\.org)') 'The launch strip must remain internal and never invoke checkout directly.'

$subtitleIndex = $detailTemplate.IndexOf('bookstore-product__subtitle', [StringComparison]::Ordinal)
$decisionIndex = $detailTemplate.IndexOf('data-bookstore-early-decision', [StringComparison]::Ordinal)
$deckIndex = $detailTemplate.IndexOf('bookstore-product__deck', [StringComparison]::Ordinal)
Assert-True ($subtitleIndex -ge 0 -and $decisionIndex -gt $subtitleIndex -and $deckIndex -gt $decisionIndex) 'The early 2045 decision module must sit after the subtitle and before the deck.'
Assert-True ($detailTemplate.Contains('About {{ lang.FormatNumber 0 $roundedWordCount }} words', [StringComparison]::Ordinal) -and $detailTemplate.Contains('data-analytics-source-slot="bookstore_detail_early_buy"', [StringComparison]::Ordinal)) 'The early decision module must render rounded proof and a tracked internal buy anchor.'
Assert-True ($detailTemplate.IndexOf('{{ $sampleLink }}', $decisionIndex, [StringComparison]::Ordinal) -lt $detailTemplate.IndexOf('class="shop-cta bookstore-product__early-buy"', $decisionIndex, [StringComparison]::Ordinal)) 'The early decision module must keep the sample before the buy anchor.'
Assert-True ($detailTemplate.Contains('data-bookstore-story-list', [StringComparison]::Ordinal) -and $detailTemplate.Contains('Inside 2045', [StringComparison]::Ordinal)) 'The product detail must render an Inside 2045 section from canonical story data.'
Assert-True ($siteCss -match '(?s)@media \(max-width:720px\).*?\.bookstore-product__cover\{\s*max-width:9\.5rem;' -and $siteCss -match '(?s)\.bookstore-product__early-buy\{.*?min-height:44px;') 'The mobile 2045 cover and early CTA sizing contract is missing.'

$legacyRelationship = [ordered]@{
  Label = 'Earlier web edition.'
  Text = 'This page preserves the 2025 web edition of “The Cracked Pot.” The revised book edition appears as the complete opening story in *2045*.'
  Href = '/shop/2045/sample/'
  Cta = 'Read the 2045 edition →'
}
$sampleRelationship = [ordered]@{
  Label = '2045 EPUB edition.'
  Text = 'This is the revised book edition of “The Cracked Pot,” the complete opening story in *2045*. The earlier 2025 web edition remains available in the archive.'
  Href = '/essays/the-cracked-pot/'
  Cta = 'Read the earlier web edition →'
}
foreach ($expected in @(
  'metadata_title: "The Cracked Pot — Earlier Web Edition"',
  'date: 2025-01-18',
  'version: "1.1"',
  'edition: "Second web edition"',
  'noindex: true',
  'edition_relationship:',
  ('  label: "' + $legacyRelationship.Label + '"'),
  ('  text: "' + $legacyRelationship.Text + '"'),
  ('  href: "' + $legacyRelationship.Href + '"'),
  ('  cta_label: "' + $legacyRelationship.Cta + '"')
)) {
  Assert-True ($legacyStorySource.Contains($expected, [StringComparison]::Ordinal)) "Legacy Cracked Pot metadata must contain: $expected"
}
Assert-True ($legacyStorySource -match '(?m)^build:\r?\n\s{2}list: never\r?$') 'The earlier web edition must remain readable while staying out of Hugo page collections.'
foreach ($expected in @(
  'metadata_title: "The Cracked Pot — Complete Story from 2045"',
  'date: 2026-09-12',
  'edition: "2045 EPUB edition"',
  'edition_relationship:',
  ('  label: "' + $sampleRelationship.Label + '"'),
  ('  text: "' + $sampleRelationship.Text + '"'),
  ('  href: "' + $sampleRelationship.Href + '"'),
  ('  cta_label: "' + $sampleRelationship.Cta + '"')
)) {
  Assert-True ($sampleSource.Contains($expected, [StringComparison]::Ordinal)) "2045 Cracked Pot metadata must contain: $expected"
}
foreach ($required in @(
  '.Params.edition_relationship',
  '.label',
  '.text',
  '.href',
  '.cta_label',
  'markdownify',
  'class="edition-relationship"',
  'class="edition-relationship__label"',
  'class="edition-relationship__text"',
  'class="edition-relationship__cta"',
  'data-edition-relationship'
)) {
  Assert-True ($editionRelationshipTemplate.Contains($required, [StringComparison]::Ordinal)) "Edition relationship partial must contain: $required"
}
$articleNoticeIndex = $articleTemplate.IndexOf('partial "edition-relationship.html" .', [StringComparison]::Ordinal)
$articleBodyIndex = $articleTemplate.IndexOf('<div class="piece-body">', [StringComparison]::Ordinal)
Assert-True ($articleNoticeIndex -ge 0 -and $articleBodyIndex -gt $articleNoticeIndex) 'Generic articles must render the edition relationship immediately before the article body.'
$sampleNoticeIndex = $sampleTemplate.IndexOf('partial "edition-relationship.html" .', [StringComparison]::Ordinal)
$sampleBodyIndex = $sampleTemplate.IndexOf('<div class="bookstore-reading-sample__body">', [StringComparison]::Ordinal)
Assert-True ($sampleNoticeIndex -ge 0 -and $sampleBodyIndex -gt $sampleNoticeIndex) 'The standalone 2045 page must render the edition relationship above the locked story body.'
foreach ($selector in @('.edition-relationship{', '.edition-relationship__label{', '.edition-relationship__text{', '.edition-relationship__cta{')) {
  Assert-True ($siteCss.Contains($selector, [StringComparison]::Ordinal)) "Edition relationship CSS must define $selector"
}
$isDraft = $productSource -match '(?m)^draft: true\r?$'
$sampleDraft = $sampleSource -match '(?m)^draft: true\r?$'
Assert-True ($isDraft -eq $sampleDraft) 'Product and sample draft states must move together.'
$isLiveOffer = $product -match 'availability_status: "live"'
if ($isLiveOffer) {
  Assert-True (-not $isDraft) 'Live 2045 must be published.'
  Assert-True ($product -match 'availability_label: "Available now"' -and $product -match 'isbn_status: "Assigned"') 'Live 2045 must have assigned metadata and current availability.'
  Assert-True ($product -match 'checkout_endpoint: "https://downloads\.outsideinprint\.org/api/books/epub"' -and $product -match 'checkout_url: ""') 'Live 2045 must use only the approved production checkout API.'
  Assert-True ($product -notmatch 'Pending assignment|coming September|Coming September|being prepared') 'Live 2045 must not retain prelaunch status copy.'
}
if ($isDraft) {
  Assert-True ($product -match 'availability_status: "disabled"') 'Draft 2045 must not enable checkout.'
  Assert-True ($product -match 'checkout_endpoint: ""' -and $product -match 'checkout_url: ""') 'Draft 2045 must not expose checkout destinations.'
}

$body = [regex]::Match($sampleSource, '(?s)\A---\r?\n.*?\r?\n---\r?\n(?<body>.*)\z').Groups['body'].Value.Trim()
$paragraphs = @([regex]::Split($body, '\r?\n\s*\r?\n'))
Assert-True ($paragraphs.Count -eq 30) 'The Cracked Pot must retain its 30 prose paragraphs.'
$bodyHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($body))).ToLowerInvariant()
Assert-True ($bodyHash -ceq 'a4a21a46551e5554287c170e405eab42f07102d4a1a86a7022592fb7db2f843a') 'The locked 2045 EPUB story text changed.'
Assert-True ($body.StartsWith("Morning light filtered through the apartment’s automatic blinds, right on time.")) 'Wrong story opening.'
$ending = 'The Optimus stood motionless. He hesitated, his fingers tight around the pot while his gaze lingered on the box.'
Assert-True ($body.EndsWith($ending)) 'The complete story ending is missing.'
Assert-True ([regex]::Matches($body, '\*[^*]+\*').Count -eq 2) 'The Cracked Pot must preserve both italic runs.'
Assert-True ($body -notmatch '(?m)^#{1,6} |Memory Lane|V:\\|urn:isbn|\uFFFD') 'Sample includes another story, private residue, or invalid text.'
$assets = Read-Source 'data/image-assets.json' | ConvertFrom-Json -AsHashtable
$cover = $assets.assets['books/2045/cover']
Assert-True ($cover.width -eq 1650 -and $cover.height -eq 2550 -and $cover.review_state -eq 'approved') '2045 cover is not the approved portrait asset.'
$sampleArtId = 'books/2045/stories/the-cracked-pot'
$sampleArt = $assets.assets[$sampleArtId]
$sampleArtAlt = 'A hand rests on a cracked handmade pot while a robotic hand offers a neatly wrapped gift beside an apartment window overlooking the city.'
Assert-True ($sampleSource.Contains(('sample_illustration: "' + $sampleArtId + '"'), [StringComparison]::Ordinal)) '2045 sample must reference its matching story illustration.'
Assert-True ($sampleSource.Contains(('sample_illustration_alt: "' + $sampleArtAlt + '"'), [StringComparison]::Ordinal)) '2045 sample must retain its reviewed descriptive alternative.'
Assert-True ($sampleArt.sha256 -ceq '553b9eeea8d8d8f25f2b91f95fd14a5137fc11c023ca20513d82a1077c177682' -and $sampleArt.width -eq 1275 -and $sampleArt.height -eq 1665 -and $sampleArt.review_state -eq 'approved') 'The sample must use the approved title-free production illustration bytes.'
Assert-True ($sampleArt.quality_override.webp_quality -eq 90 -and $sampleArt.quality_override.avif_quality -eq 70) 'Fine hatching requires the approved detail-quality derivatives.'
$sampleArtIndex = $sampleTemplate.IndexOf('data-sample-illustration', [StringComparison]::Ordinal)
Assert-True ($sampleArtIndex -gt $sampleTemplate.IndexOf('</header>', [StringComparison]::Ordinal) -and $sampleArtIndex -lt $sampleNoticeIndex) 'Sample illustration must sit between its title/byline and edition notice.'
Assert-True ($sampleTemplate.Contains('with .Params.sample_illustration', [StringComparison]::Ordinal) -and $sampleTemplate.Contains('images/picture.html', [StringComparison]::Ordinal)) 'Optional sample illustrations must use the shared responsive pipeline.'
Assert-True ($siteCss -match '(?s)\.bookstore-reading-sample__illustration\{\s*width:100%;\s*max-width:32rem;\s*margin:1\.65rem auto;') 'Sample illustration must be centered and bounded at 32rem.'
foreach ($otherSample in Get-ChildItem -LiteralPath (Join-Path $repoRoot 'content/shop') -Recurse -Filter 'sample.md') {
  if ($otherSample.FullName -eq (Join-Path $repoRoot 'content/shop/2045/sample.md')) { continue }
  Assert-True ((Get-Content -LiteralPath $otherSample.FullName -Raw) -notmatch '(?m)^sample_illustration:') 'Other existing samples must remain unchanged.'
}

$issueSource = Read-Source 'content/almanack/2026-09-12.md'
$launchMessage = "A grieving father enters a memory world with his children—and finds that the dead may remember him back. 2045 collects ten dark fables about artificial intelligence, grief, ambition, faith, and the ways people seek meaning. By Robert V. Ussley. The EPUB is `$19.99, sold directly by Outside In Print to U.S. readers, with a private download link delivered by email."
$launchNote = "Today I’m publishing 2045, ten dark fables from the machine age. In the free opening story, a man whose machines do everything for him struggles to find something worth doing himself."
$launchLabel = 'Read “The Cracked Pot” — a complete story · 7 minutes'
$datedFed = 'https://www.federalreserve.gov/releases/z1/20260911/recent_developments.htm'
foreach ($copy in @($launchMessage, $launchNote, $launchLabel, $datedFed)) {
  Assert-True ([regex]::Matches($issueSource, [regex]::Escape($copy)).Count -eq 2) 'Launch copy must agree in issue data and Markdown.'
}
Assert-True ($issueSource -match 'version: "0.3"' -and $issueSource -notmatch '/z1/current/|We can lose our footing') 'Issue revision or retired copy is wrong.'
$campaignTemplate = Read-Source 'layouts/almanack/single.html'
Assert-True ($campaignTemplate.Contains('.image_link_url | default $campaignHref')) 'Campaign cover must fall back to the primary CTA.'
Assert-True ($detailTemplate.IndexOf('{{ $sampleLink }}') -gt 0 -and $detailTemplate.IndexOf('{{ $sampleLink }}') -lt $detailTemplate.IndexOf('index $product "tags"')) '2045 sample invitation must precede topics.'
foreach ($template in @($featureTemplate, (Read-Source 'layouts/partials/shop/sample-link.html'))) {
  Assert-True ($template.Contains('.Title') -and $template.Contains('.ReadingTime') -and $template.Contains('a complete story')) 'Sample invitation must derive title and reading time.'
}

if ($SourceOnly) {
  Write-Host '2045 storefront source contract passed.'
  exit 0
}

$detailPath = Join-Path $SiteDir 'shop/2045/index.html'
$samplePath = Join-Path $SiteDir 'shop/2045/sample/index.html'
$homeHtml = Read-Output 'index.html'
$shopHtml = Read-Output 'shop/index.html'
$authorHtml = Read-Output 'authors/robert-v-ussley/index.html'
$shopSocialImage = Meta-Content $shopHtml 'og:image'
Assert-True ($shopSocialImage -match '^https://outsideinprint\.org/images/rendered/books/2045/cover/[0-9a-f]+/social-1200w\.jpg$') 'Bookstore Open Graph image must be the managed 2045 social JPEG.'
Assert-True ((Meta-Content $shopHtml 'twitter:image') -ceq $shopSocialImage) 'Bookstore Twitter and Open Graph images must agree.'
foreach ($name in @('og:image:alt', 'twitter:image:alt')) {
  Assert-True ((Meta-Content $shopHtml $name) -ceq $approvedAlt) "Bookstore $name must use approved cover alt text."
}
$catalogMatch = [regex]::Match($shopHtml, '(?is)<div\b[^>]*id="?bookstore-catalog"?(?:\s|>).*?(?=<aside\b|$)')
$catalogHtml = $catalogMatch.Value
$catalogImages = @([regex]::Matches($catalogHtml, '(?is)<img\b[^>]*>'))
$catalogRecords = @([regex]::Matches($catalogHtml, '(?is)<article\b[^>]*class="?bookstore-record"?(?:\s|>).*?</article>'))
$features = @([regex]::Matches($shopHtml, '(?is)<(?<tag>section|article)\b[^>]*class="bookstore-feature(?:\s[^"]*)?"[^>]*>.*?</\k<tag>>|<(?<baretag>section|article)\b[^>]*class=bookstore-feature(?:\s|>).*?</\k<baretag>>'))
if ($isDraft -and -not $Preview) {
  Assert-True (-not (Test-Path $detailPath) -and -not (Test-Path $samplePath)) 'Draft 2045 routes leaked into production.'
  Assert-True ($homeHtml -notmatch 'data-analytics-slug="?2045"?' -and $shopHtml -notmatch 'data-direct-offer-sku="?OIP-TD-EPUB"?') 'Draft 2045 promotion or offer leaked into production.'
  Assert-True ($authorHtml -notmatch 'href="?/shop/2045/') 'Draft 2045 leaked into the author bibliography.'
  Assert-True ($features.Count -eq 0 -and $shopHtml -notmatch 'id="?bookstore-feature-title"?') 'Draft 2045 must not render the bookstore feature.'
  Assert-True ($catalogRecords.Count -eq 3 -and $catalogImages.Count -eq 3) 'Dormant production must retain the three existing shelf books.'
  Assert-True ($catalogRecords[0].Value -match 'href="?/shop/the-american-nightmare-keep-dreaming-kid/') 'Without the feature, the previous first book must remain first.'
  Assert-True ((Html-Attribute $catalogImages[0].Value 'loading') -eq 'eager' -and (Html-Attribute $catalogImages[0].Value 'fetchpriority') -eq 'high') 'Without the feature, the first existing cover must retain eager/high loading.'
  Assert-True ((Plain-Text $shopHtml) -match 'Catalog 3 titles') 'Dormant bookstore count must remain three titles.'
  Write-Host '2045 storefront source and dormant production contract passed.'
  exit 0
}

$detailHtml = Read-Output 'shop/2045/index.html'
$sampleHtml = Read-Output 'shop/2045/sample/index.html'
$legacyStoryHtml = Read-Output 'essays/the-cracked-pot/index.html'
$detailTitleMatch = [regex]::Match($detailHtml, '(?is)<title\b[^>]*>(?<title>.*?)</title>')
$detailBrowserTitle = [Net.WebUtility]::HtmlDecode($detailTitleMatch.Groups['title'].Value).Trim()
Assert-True ($detailBrowserTitle -ceq '2045: Ten Dark Fables from the Machine Age | Robert V. Ussley') '2045 must use the approved disambiguated browser title.'
Assert-True ((Meta-Content $detailHtml 'og:title') -ceq '2045: Ten Dark Fables from the Machine Age') '2045 must use the approved Open Graph title.'
Assert-True ((Meta-Content $detailHtml 'twitter:title') -ceq '2045: Ten Dark Fables from the Machine Age') '2045 must use the approved Twitter title.'

$decisionModule = [regex]::Match($detailHtml, '(?is)<aside\b[^>]*\bdata-bookstore-early-decision(?:=|\s|>).*?</aside>')
Assert-True ($decisionModule.Success) '2045 must render the early decision module.'
$decisionText = Plain-Text $decisionModule.Value
foreach ($proof in @('10 stories', 'About 26,700 words', 'DRM-free EPUB', 'Available only from Outside In Print.')) {
  Assert-True ($decisionText.Contains($proof, [StringComparison]::Ordinal)) "The early decision module is missing proof: $proof"
}
$decisionLinks = @([regex]::Matches($decisionModule.Value, '(?is)<a\b[^>]*>.*?</a>'))
Assert-True ($decisionLinks.Count -eq 2) 'The early decision module must contain only its sample and internal buy links.'
Assert-True ((Html-Attribute $decisionLinks[0].Value 'href') -eq '/shop/2045/sample/' -and (Html-Attribute $decisionLinks[0].Value 'data-analytics-source-slot') -eq 'bookstore_detail_early_sample') 'The early decision module must put the tracked complete-story sample first.'
Assert-True ((Html-Attribute $decisionLinks[1].Value 'href') -eq '#bookstore-purchase' -and (Html-Attribute $decisionLinks[1].Value 'data-analytics-source-slot') -eq 'bookstore_detail_early_buy' -and (Plain-Text $decisionLinks[1].Value) -ceq 'Buy EPUB — $19.99') 'The early buy control must be a tracked internal anchor to the existing form.'
Assert-True ($decisionModule.Value -notmatch '<form\b|downloads\.outsideinprint\.org|square\.link|checkout\.square\.site') 'The early decision module must not duplicate or invoke checkout.'
$purchaseIndex = $detailHtml.IndexOf('id=bookstore-purchase', [StringComparison]::Ordinal)
if ($purchaseIndex -lt 0) { $purchaseIndex = $detailHtml.IndexOf('id="bookstore-purchase"', [StringComparison]::Ordinal) }
Assert-True ($decisionModule.Index -lt $purchaseIndex) 'The early decision module must precede the checkout form.'

$inside2045 = [regex]::Match($detailHtml, '(?is)<section\b[^>]*\bdata-bookstore-story-list(?:=|\s|>).*?</section>')
Assert-True ($inside2045.Success -and (Plain-Text $inside2045.Value).Contains('Inside 2045', [StringComparison]::Ordinal)) '2045 must render its complete contents section.'
$renderedStoryTitles = @([regex]::Matches($inside2045.Value, '(?is)<li\b[^>]*>(?<title>.*?)</li>') | ForEach-Object { Plain-Text $_.Groups['title'].Value })
Assert-True ($renderedStoryTitles.Count -eq 10) 'Inside 2045 must render exactly ten story titles.'
Assert-True ([string]::Join("`n", $renderedStoryTitles) -ceq [string]::Join("`n", $expectedStoryTitles)) 'Inside 2045 does not match authoritative EPUB order.'

$launchStrip = [regex]::Match($homeHtml, '(?is)<section\b[^>]*\bdata-home-2045-launch(?:=|\s|>).*?</section>')
Assert-True ($launchStrip.Success) 'The active launch window must render one homepage 2045 strip.'
$launchText = Plain-Text $launchStrip.Value
foreach ($launchCopy in @('New: 2045 — Ten Dark Fables from the Machine Age', 'Read a complete story', 'Buy EPUB — $19.99', 'DRM-free EPUB · U.S. customers only.')) {
  Assert-True ($launchText.Contains($launchCopy, [StringComparison]::Ordinal)) "The homepage launch strip is missing: $launchCopy"
}
$launchLinks = @([regex]::Matches($launchStrip.Value, '(?is)<a\b[^>]*>.*?</a>'))
$launchSlots = @($launchLinks | ForEach-Object { Html-Attribute $_.Value 'data-analytics-source-slot' })
Assert-True ($launchLinks.Count -eq 3 -and [string]::Join('|', $launchSlots) -ceq 'homepage_2045_launch_headline|homepage_2045_launch_sample|homepage_2045_launch_buy') 'The launch headline, sample, and buy links need distinct analytics slots in that order.'
Assert-True ((Html-Attribute $launchLinks[0].Value 'href') -eq '/shop/2045/' -and (Html-Attribute $launchLinks[1].Value 'href') -eq '/shop/2045/sample/' -and (Html-Attribute $launchLinks[2].Value 'href') -eq '/shop/2045/#bookstore-purchase') 'The launch strip must use only the canonical internal product, sample, and purchase-anchor URLs.'
Assert-True ($launchStrip.Value -notmatch '<form\b|https://(?:square\.link|checkout\.square\.site|downloads\.outsideinprint\.org)') 'The launch strip exposed a provider or direct checkout.'
$orientationIndex = $homeHtml.IndexOf('class=home-front-page__orientation', [StringComparison]::Ordinal)
if ($orientationIndex -lt 0) { $orientationIndex = $homeHtml.IndexOf('class="home-front-page__orientation"', [StringComparison]::Ordinal) }
$storyGridIndex = $homeHtml.IndexOf('class=home-front-page__stories', [StringComparison]::Ordinal)
if ($storyGridIndex -lt 0) { $storyGridIndex = $homeHtml.IndexOf('class="home-front-page__stories"', [StringComparison]::Ordinal) }
Assert-True ($orientationIndex -ge 0 -and $launchStrip.Index -gt $orientationIndex -and $storyGridIndex -gt $launchStrip.Index) 'The launch strip must stay between the reader note and editorial story grid.'

$editionMetadataCases = @(
  @{ Html = $legacyStoryHtml; Title = 'The Cracked Pot — Earlier Web Edition' },
  @{ Html = $sampleHtml; Title = 'The Cracked Pot — Complete Story from 2045' }
)
foreach ($metadataCase in $editionMetadataCases) {
  $titleMatch = [regex]::Match([string]$metadataCase.Html, '(?is)<title\b[^>]*>(?<title>.*?)</title>')
  $browserTitle = [Net.WebUtility]::HtmlDecode($titleMatch.Groups['title'].Value).Trim()
  Assert-True ($browserTitle -ceq $metadataCase.Title) "Edition browser title must be '$($metadataCase.Title)'."
  Assert-True ((Meta-Content $metadataCase.Html 'og:title') -ceq $metadataCase.Title) "Edition Open Graph title must be '$($metadataCase.Title)'."
  Assert-True ((Meta-Content $metadataCase.Html 'twitter:title') -ceq $metadataCase.Title) "Edition Twitter title must be '$($metadataCase.Title)'."
}
foreach ($html in @($homeHtml, $shopHtml, $authorHtml)) {
  foreach ($slug in @('2045', 'the-american-nightmare-keep-dreaming-kid', 'the-parable-of-the-sheep', 'the-water-cycle')) {
    Assert-True ($html -match ('href="?(?:https://outsideinprint\.org)?/shop/' + $slug + '/')) "Book $slug is missing from a discovery surface."
  }
}
Assert-True ($features.Count -eq 1) 'Published or preview 2045 must have exactly one bookstore feature.'
$featureHtml = $features[0].Value
$issueHtml = Read-Output 'almanack/2026-09-12/index.html'
foreach ($html in @($featureHtml, $detailHtml, $issueHtml)) {
  $invitations = @([regex]::Matches($html, '(?is)<a\b[^>]*>.*?</a>') | Where-Object { (Html-Attribute $_.Value 'href') -eq '/shop/2045/sample/' })
  Assert-True ($invitations.Count -eq 1 -and (Plain-Text $invitations[0].Value) -ceq $launchLabel) 'Each launch surface needs one complete-story invitation.'
}
$detailSample = [regex]::Matches($detailHtml, '(?is)<a\b[^>]*>.*?</a>') | Where-Object { (Html-Attribute $_.Value 'href') -eq '/shop/2045/sample/' }
Assert-True ($detailSample.Index -lt $detailHtml.IndexOf('id=bookstore-purchase') -or $detailSample.Index -lt $detailHtml.IndexOf('id="bookstore-purchase"')) 'The sample invitation must precede checkout in DOM order.'
foreach ($copy in @($launchMessage, $launchNote)) {
  Assert-True ((Plain-Text $issueHtml).Contains($copy)) 'Rendered launch copy differs from approved text.'
}
$campaignCover = @([regex]::Matches($issueHtml, '(?is)<a\b[^>]*>') | Where-Object { (Html-Attribute $_.Value 'class') -eq 'almanack-campaign__cover' })
Assert-True ($campaignCover.Count -eq 1 -and (Html-Attribute $campaignCover[0].Value 'href') -eq '/shop/2045/') 'Campaign cover must lead to the book overview.'
Assert-True ($issueHtml.Contains('/shop/2045/#bookstore-purchase') -and $issueHtml.Contains($datedFed) -and $issueHtml -notmatch '/z1/current/') 'Issue must use the purchase anchor and dated citation.'
Assert-True ($features[0].Index -lt $catalogMatch.Index -and $featureHtml -match 'id="?bookstore-feature-title"?') 'The named 2045 feature must precede the ordinary catalog.'
Assert-True ($catalogRecords.Count -eq 3 -and $catalogHtml -notmatch '/shop/2045/|OIP-TD-EPUB') '2045 must not be duplicated among the three remaining shelf books.'
foreach ($slug in @('the-american-nightmare-keep-dreaming-kid', 'the-parable-of-the-sheep', 'the-water-cycle')) {
  Assert-True ($catalogHtml -match ('href="?/shop/' + $slug + '/')) "Existing shelf book $slug is missing."
}
Assert-True ((Plain-Text $shopHtml) -match 'Catalog 4 titles') 'The total catalog count must include the featured book.'
$featureImages = @([regex]::Matches($featureHtml, '(?is)<img\b[^>]*>'))
Assert-True ($featureImages.Count -eq 1 -and $featureHtml -match 'image/avif' -and $featureHtml -match 'image/webp') 'The feature must render one managed responsive cover.'
Assert-True ((Html-Attribute $featureImages[0].Value 'src') -match '/images/rendered/books/2045/cover/' -and (Html-Attribute $featureImages[0].Value 'alt') -ceq $approvedAlt) 'The feature must preserve the approved cover and alt text.'
Assert-True ((Html-Attribute $featureImages[0].Value 'loading') -eq 'eager' -and (Html-Attribute $featureImages[0].Value 'fetchpriority') -eq 'high') 'The featured cover must own eager/high loading.'
Assert-True ($catalogImages.Count -eq 3) 'The remaining shelf must retain exactly three cover images.'
foreach ($image in $catalogImages) {
  Assert-True ((Html-Attribute $image.Value 'loading') -eq 'lazy' -and (Html-Attribute $image.Value 'fetchpriority') -ne 'high') 'Remaining shelf covers must be lazy when the feature exists.'
}
$featureText = Plain-Text $featureHtml
foreach ($field in @('title', 'subtitle', 'author', 'deck', 'positioning_label', 'price_display')) {
  $expected = [regex]::Match($product, ('(?m)^\s+' + $field + ': "(?<value>[^"]+)"\r?$')).Groups['value'].Value
  Assert-True ($expected.Length -gt 0 -and $featureText.Contains($expected, [StringComparison]::Ordinal)) "The feature must display canonical $field."
}
$featureLinks = @([regex]::Matches($featureHtml, '(?is)<a\b[^>]*>'))
$sampleLinks = @($featureLinks | Where-Object { (Html-Attribute $_.Value 'href') -eq '/shop/2045/sample/' })
Assert-True ($sampleLinks.Count -eq 1 -and (Html-Attribute $sampleLinks[0].Value 'data-analytics-event') -eq 'book_sample_open') 'The feature needs one free sample link with normal sample analytics.'
Assert-True ($featureHtml -notmatch '<form\b|data-epub-checkout|https://(?:square\.link|checkout\.square\.site|downloads\.outsideinprint\.org)') 'The feature must not activate provider checkout itself.'
if ($isLiveOffer) {
  $buyLinks = @($featureLinks | Where-Object { (Html-Attribute $_.Value 'href') -eq '/shop/2045/#bookstore-purchase' })
  Assert-True ($buyLinks.Count -eq 1 -and $featureHtml -notmatch '<button\b[^>]*\bdisabled\b') 'The live feature must link to the product purchase section, not a provider.'
  $checkoutForms = @([regex]::Matches($detailHtml, '(?is)<form\b[^>]*\bdata-epub-checkout(?:\s|>).*?</form>'))
  Assert-True ($checkoutForms.Count -eq 1) 'Live 2045 requires one primary checkout form; its free sample is on a separate page.'
  foreach ($form in $checkoutForms) {
    $formTag = [regex]::Match($form.Value, '(?is)<form\b[^>]*>').Value
    Assert-True ((Html-Attribute $formTag 'action') -ceq 'https://downloads.outsideinprint.org/api/books/epub') '2045 checkout must use the production endpoint.'
    Assert-True ($form.Value -match 'OIP-TD-EPUB' -and (Plain-Text $form.Value) -match '\$19\.99') '2045 checkout must bind its SKU and approved price.'
    $emailInputs = @([regex]::Matches($form.Value, '(?is)<input\b[^>]*>') | Where-Object { (Html-Attribute $_.Value 'type') -eq 'email' })
    Assert-True ($emailInputs.Count -eq 1 -and $emailInputs[0].Value -match '\brequired(?:\s|=|>)') 'Each 2045 checkout must require a delivery email.'
  }
} else {
  $disabledBuy = [regex]::Match($featureHtml, '(?is)<button\b(?=[^>]*\sdisabled(?:\s|=|>))[^>]*>.*?</button>').Value
  $describedBy = Html-Attribute ([regex]::Match($disabledBuy, '(?is)<button\b[^>]*>').Value) 'aria-describedby'
  Assert-True ($disabledBuy -match 'Buy EPUB' -and $describedBy.Length -gt 0) 'An unavailable feature needs a native disabled Buy EPUB button and release-status description.'
  foreach ($statusID in ($describedBy -split '\s+')) {
    Assert-True ($featureHtml -match ('\bid="?' + [regex]::Escape($statusID) + '"?(?:\s|>)')) 'The disabled buy button must reference a real release-status description.'
  }
  Assert-True ($featureText -match 'September 12|Coming|coming|preparation|prepared') 'The unavailable feature must explain its release status.'
  Assert-True ($featureHtml -notmatch 'href="?[^\s">]*#bookstore-purchase') 'The unavailable feature must not expose a live purchase link.'
}
Assert-True ($detailHtml -match 'books/2045/cover' -and $detailHtml -match 'image/avif' -and $detailHtml -match 'OIP Exclusive') '2045 product is missing managed artwork or exclusive positioning.'
Assert-True ($detailHtml -match 'href="?/shop/2045/sample/' -and $sampleHtml -match 'href="?/shop/2045/') 'Product and standalone sample do not link to one another.'
Assert-True ($detailHtml -match '\$19\.99' -and $sampleHtml -match 'Explore 2045\s*(?:·|&middot;|&#183;)\s*\$19\.99') '2045 product and sample must display the approved $19.99 price.'
Assert-True ($detailHtml -notmatch 'data-bookstore-kindle-button|data-bookstore-kindle-role') '2045 has a Kindle purchase offer.'
Assert-True ($detailHtml -match '"@type"\s*:\s*"WebPage"' -and $detailHtml -notmatch '"@type"\s*:\s*"CollectionPage"') '2045 must use product-page WebPage metadata.'
$jsonLdMatch = [regex]::Match($detailHtml, '(?is)<script\b[^>]*\btype=(?:"application/ld\+json"|''application/ld\+json''|application/ld\+json)[^>]*>(?<json>.*?)</script>')
Assert-True ($jsonLdMatch.Success) '2045 must emit one connected JSON-LD graph.'
$jsonLdText = $jsonLdMatch.Groups['json'].Value
$jsonLd = $jsonLdText | ConvertFrom-Json
$graph = @($jsonLd.'@graph')
$bookProducts = @($graph | Where-Object { @($_.'@type') -contains 'Book' -and @($_.'@type') -contains 'Product' })
$webPages = @($graph | Where-Object { @($_.'@type') -contains 'WebPage' })
Assert-True ($bookProducts.Count -eq 1 -and $webPages.Count -eq 1 -and $webPages[0].mainEntity.'@id' -ceq $bookProducts[0].'@id') '2045 must connect one WebPage to one combined Book/Product entity.'
$bookOffer = @($bookProducts[0].offers)
Assert-True ($bookOffer.Count -eq 1 -and $bookOffer[0].price -isnot [string] -and "$($bookOffer[0].price)" -ceq '19.99' -and $bookOffer[0].priceCurrency -ceq 'USD' -and $bookOffer[0].availability -ceq 'https://schema.org/InStock' -and $bookOffer[0].sku -ceq 'OIP-TD-EPUB' -and $bookOffer[0].url -ceq 'https://outsideinprint.org/shop/2045/') '2045 must expose its numeric canonical live Offer.'
Assert-True ($bookProducts[0].bookFormat -ceq 'https://schema.org/EBook' -and $bookProducts[0].author -and $bookProducts[0].publisher -and $bookProducts[0].brand -and $bookProducts[0].image) '2045 Book/Product schema is missing its EPUB, author, publisher, brand, or managed-cover evidence.'
Assert-True ($jsonLdText -notmatch '(?i)downloads\.outsideinprint\.org|checkout_(?:url|endpoint)|aggregateRating|review|isbn') '2045 schema must not expose private checkout, fabricated reviews, ratings, or an unstored ISBN.'
foreach ($html in @($detailHtml, $sampleHtml)) {
  $decoded = [Net.WebUtility]::HtmlDecode($html)
  Assert-True ($decoded.Contains($approvedAlt, [StringComparison]::Ordinal)) '2045 output lost the approved cover alt.'
}

$legacyNotice = [regex]::Match($legacyStoryHtml, '(?is)<aside\b[^>]*\bdata-edition-relationship(?:=|\s|>).*?</aside>')
$sampleNotice = [regex]::Match($sampleHtml, '(?is)<aside\b[^>]*\bdata-edition-relationship(?:=|\s|>).*?</aside>')
Assert-True ($legacyNotice.Success -and $sampleNotice.Success) 'Both Cracked Pot editions must render one shared edition relationship notice.'
foreach ($noticeCase in @(
  @{ Html = $legacyNotice.Value; Relationship = $legacyRelationship },
  @{ Html = $sampleNotice.Value; Relationship = $sampleRelationship }
)) {
  $relationship = $noticeCase.Relationship
  $noticeHtml = [string]$noticeCase.Html
  $noticeText = Plain-Text $noticeHtml
  Assert-True ($noticeText.Contains($relationship.Label, [StringComparison]::Ordinal)) "Edition notice lost label: $($relationship.Label)"
  $renderedRelationshipText = $relationship.Text.Replace('*2045*', '<em>2045</em>')
  Assert-True ($noticeHtml.Contains($renderedRelationshipText, [StringComparison]::Ordinal)) "Edition notice lost text: $($relationship.Text)"
  $cta = @([regex]::Matches($noticeHtml, '(?is)<a\b[^>]*>.*?</a>'))
  Assert-True ($cta.Count -eq 1 -and (Html-Attribute $cta[0].Value 'href') -eq $relationship.Href -and (Plain-Text $cta[0].Value) -ceq $relationship.Cta) 'Edition notice CTA differs from its front matter contract.'
  Assert-True ($noticeHtml -match '<em>2045</em>') 'Edition relationship copy must render the book title with Markdown emphasis.'
}
$legacyBodyTag = [regex]::Match($legacyStoryHtml, '(?is)<div\b[^>]*\bclass="?piece-body"?(?:\s|>)')
$renderedSampleBodyTag = [regex]::Match($sampleHtml, '(?is)<div\b[^>]*\bclass="?bookstore-reading-sample__body"?(?:\s|>)')
Assert-True ($legacyBodyTag.Success -and $legacyNotice.Index -lt $legacyBodyTag.Index) 'Earlier-edition notice must precede the legacy story body.'
Assert-True ($renderedSampleBodyTag.Success -and $sampleNotice.Index -lt $renderedSampleBodyTag.Index) '2045-edition notice must precede the locked story body.'
$sampleArtBlock = [regex]::Match($sampleHtml, '(?is)<div\b[^>]*\bdata-sample-illustration(?:=|\s|>).*?</div>')
Assert-True ($sampleArtBlock.Success -and $sampleArtBlock.Index -lt $sampleNotice.Index) 'The illustration must render before the edition notice and outside the story body.'
$sampleArtImages = @([regex]::Matches($sampleArtBlock.Value, '(?is)<img\b[^>]*>'))
Assert-True ($sampleArtImages.Count -eq 1) 'The sample must render exactly one story illustration.'
$sampleArtImage = $sampleArtImages[0].Value
Assert-True ((Html-Attribute $sampleArtImage 'data-oip-image-id') -ceq $sampleArtId -and (Html-Attribute $sampleArtImage 'alt') -ceq $sampleArtAlt) 'Rendered story artwork or alternative differs from its source.'
Assert-True ((Html-Attribute $sampleArtImage 'width') -eq '1275' -and (Html-Attribute $sampleArtImage 'height') -eq '1665') 'Story artwork must preserve intrinsic portrait proportions.'
Assert-True ($sampleArtBlock.Value -match 'image/avif' -and $sampleArtBlock.Value -match 'image/webp' -and (Html-Attribute $sampleArtImage 'loading') -eq 'eager') 'Story artwork must have responsive AVIF/WebP resources and explicit loading.'
Assert-True ([regex]::Matches($sampleHtml, '(?is)<h1\b[^>]*>').Count -eq 1) 'The sample must retain one live title.'
Assert-True ((Meta-Content $sampleHtml 'og:image') -match '/books/2045/cover/' -and (Meta-Content $sampleHtml 'twitter:image') -match '/books/2045/cover/') 'The story illustration must not replace cover sharing metadata.'
foreach ($untouchedSurface in @($homeHtml, $legacyStoryHtml, (Read-Output 'gallery/index.html'))) {
  Assert-True (-not $untouchedSurface.Contains($sampleArtId, [StringComparison]::Ordinal)) 'Story illustration leaked onto the homepage, Gallery, or earlier web edition.'
}
Assert-True ((Meta-Content $legacyStoryHtml 'robots') -ceq 'noindex, follow') 'The earlier web edition must render noindex, follow.'
Assert-True ((Meta-Content $sampleHtml 'robots') -ceq 'index, follow, max-image-preview:large') 'The 2045 edition must remain indexable.'
Assert-True ($legacyStoryHtml -match '(?is)<link\b(?=[^>]*\brel="?canonical"?(?:\s|>))(?=[^>]*\bhref="?https://outsideinprint\.org/essays/the-cracked-pot/"?(?:\s|>))[^>]*>') 'The earlier web edition must retain its self-canonical URL.'
Assert-True ($sampleHtml -match '(?is)<link\b(?=[^>]*\brel="?canonical"?(?:\s|>))(?=[^>]*\bhref="?https://outsideinprint\.org/shop/2045/sample/"?(?:\s|>))[^>]*>') 'The 2045 edition must retain its self-canonical URL.'
$legacyDocumentTitle = [Net.WebUtility]::HtmlDecode([regex]::Match($legacyStoryHtml, '(?is)<title>(?<title>.*?)</title>').Groups['title'].Value).Trim()
$sampleDocumentTitle = [Net.WebUtility]::HtmlDecode([regex]::Match($sampleHtml, '(?is)<title>(?<title>.*?)</title>').Groups['title'].Value).Trim()
Assert-True ($legacyDocumentTitle -ceq 'The Cracked Pot — Earlier Web Edition') 'The earlier web edition must render its disambiguated metadata title.'
Assert-True ($sampleDocumentTitle -ceq 'The Cracked Pot — Complete Story from 2045') 'The 2045 edition must render its disambiguated metadata title.'

$legacyUrl = 'https://outsideinprint.org/essays/the-cracked-pot/'
$sampleUrl = 'https://outsideinprint.org/shop/2045/sample/'
$sitemapXml = Read-Output 'sitemap.xml'
$libraryHtml = Read-Output 'library/index.html'
$archiveHtml = Read-Output 'archive/index.html'
$randomHtml = Read-Output 'random/index.html'
$siteFeed = Read-Output 'index.xml'
$essayFeed = Read-Output 'essays/index.xml'
$archiveFeed = Read-Output 'archive/index.xml'
Assert-True (-not $sitemapXml.Contains($legacyUrl, [StringComparison]::Ordinal) -and $sitemapXml.Contains($sampleUrl, [StringComparison]::Ordinal)) 'Sitemap must exclude the earlier web edition and retain the 2045 edition.'
foreach ($surface in @($libraryHtml, $archiveHtml, $randomHtml, $siteFeed, $essayFeed, $archiveFeed)) {
  Assert-True (-not $surface.Contains($legacyUrl, [StringComparison]::Ordinal) -and $surface -notmatch 'href="?/essays/the-cracked-pot/') 'The earlier web edition leaked into a discovery collection or feed.'
}
foreach ($feed in @($siteFeed, $essayFeed, $archiveFeed)) {
  Assert-True (-not $feed.Contains($sampleUrl, [StringComparison]::Ordinal)) 'Book samples must remain outside publication feeds.'
}
if ($isDraft) {
  Assert-True ($detailHtml -notmatch '<form[^>]*data-epub-checkout') 'Preview exposes a live 2045 checkout.'
}
$sampleBody = [regex]::Match($sampleHtml, '(?s)<div[^>]*class="?bookstore-reading-sample__body"?[^>]*>(?<body>.*?)</div>').Groups['body'].Value
Assert-True ([regex]::Matches($sampleBody, '<p(?:\s|>)').Count -eq 30) 'Rendered sample paragraph count changed.'
Assert-True ([regex]::Matches($sampleBody, '<em(?:\s|>)').Count -eq 2) 'Rendered sample italic runs changed.'
# Markdown escapes prevent Goldmark typography from changing locked literal dots.
$expectedText = [regex]::Replace($body.Replace('*', '').Replace('\.', '.'), '\s+', ' ').Trim()
Assert-True ((Plain-Text $sampleBody) -ceq $expectedText) 'Rendered sample text differs from its approved source.'
Write-Host '2045 storefront source and rendered preview/release contract passed.'
