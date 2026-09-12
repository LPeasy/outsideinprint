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
$shopSource = Read-Source 'content/shop/_index.md'
$shopTemplate = Read-Source 'layouts/shop/list.html'
$featureTemplate = Read-Source 'layouts/partials/shop/featured-book.html'
$catalog = Read-Source 'data/bookstore.yaml'
$product = [regex]::Match($catalog, '(?ms)^  "2045":\r?\n(?<product>.*?)(?=^  [a-z_]+:)').Groups['product'].Value
Assert-True ($product.Length -gt 0) 'Missing 2045 catalog entry.'
Assert-True ($productSource -match '(?m)^book_key: "2045"\r?$') '2045 must use its own product key.'
Assert-True ($productSource -match '(?m)^weight: 5\r?$') '2045 must lead the weighted catalog.'
Assert-True ($product -match 'sku: "OIP-TD-EPUB"' -and $product -match '(?m)^\s+price_cents: 1999\r?$') 'Wrong 2045 SKU or price.'
Assert-True ([regex]::Matches($product, '(?m)^\s+price_display: "\$19\.99"\r?$').Count -eq 2) '2045 product and offer must display the approved $19.99 price.'
Assert-True ($product -match '(?m)^\s+checkout_label: "Buy EPUB — \$19\.99"\r?$') '2045 must override the shared checkout label with its approved price.'
Assert-True ($product -notmatch '\$9\.99|price_cents: 999\b') '2045 retains the obsolete price.'
$sampleTemplate = Read-Source 'layouts/shop/sample.html'
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
Assert-True ((Read-Source 'layouts/shop/single.html') -match '<section\b[^>]*id="bookstore-purchase"') 'The product purchase section needs the feature target anchor.'
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
Assert-True ($body.StartsWith("Morning light filtered through the apartment’s automatic blinds, right on time.")) 'Wrong story opening.'
$ending = 'The Optimus stood motionless. He hesitated, his fingers tight around the pot while his gaze lingered on the box.'
Assert-True ($body.EndsWith($ending)) 'The complete story ending is missing.'
Assert-True ([regex]::Matches($body, '\*[^*]+\*').Count -eq 2) 'The Cracked Pot must preserve both italic runs.'
Assert-True ($body -notmatch '(?m)^#{1,6} |Memory Lane|V:\\|urn:isbn|\uFFFD') 'Sample includes another story, private residue, or invalid text.'
$assets = Read-Source 'data/image-assets.json' | ConvertFrom-Json -AsHashtable
$cover = $assets.assets['books/2045/cover']
Assert-True ($cover.width -eq 1650 -and $cover.height -eq 2550 -and $cover.review_state -eq 'approved') '2045 cover is not the approved portrait asset.'

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
foreach ($html in @($homeHtml, $shopHtml, $authorHtml)) {
  foreach ($slug in @('2045', 'the-american-nightmare-keep-dreaming-kid', 'the-parable-of-the-sheep', 'the-water-cycle')) {
    Assert-True ($html -match ('href="?(?:https://outsideinprint\.org)?/shop/' + $slug + '/')) "Book $slug is missing from a discovery surface."
  }
}
Assert-True ($features.Count -eq 1) 'Published or preview 2045 must have exactly one bookstore feature.'
$featureHtml = $features[0].Value
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
foreach ($html in @($detailHtml, $sampleHtml)) {
  $decoded = [Net.WebUtility]::HtmlDecode($html)
  Assert-True ($decoded.Contains($approvedAlt, [StringComparison]::Ordinal)) '2045 output lost the approved cover alt.'
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
