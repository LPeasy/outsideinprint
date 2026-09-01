param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public'),
  [switch]$SourceOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-RequiredText {
  param([string]$RelativePath)

  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing direct-commerce source file: $RelativePath"
  }

  return Get-Content -LiteralPath $path -Raw -Encoding utf8
}

function Assert-Contains {
  param(
    [string]$Text,
    [string]$Expected,
    [string]$Context
  )

  if (-not $Text.Contains($Expected, [StringComparison]::Ordinal)) {
    throw "$Context is missing required text: $Expected"
  }
}

function Assert-Ordered {
  param(
    [string]$Text,
    [string]$First,
    [string]$Second,
    [string]$Context
  )

  $firstIndex = $Text.IndexOf($First, [StringComparison]::Ordinal)
  $secondIndex = $Text.IndexOf($Second, [StringComparison]::Ordinal)
  if ($firstIndex -lt 0 -or $secondIndex -lt 0 -or $firstIndex -ge $secondIndex) {
    throw "$Context must place '$First' before '$Second'."
  }
}

$bookstoreData = Get-RequiredText -RelativePath 'data/bookstore.yaml'
$bookstoreIndexContent = Get-RequiredText -RelativePath 'content/shop/_index.md'
$usCheckoutRestriction = 'Direct EPUB checkout is currently available to U.S. customers only.'
Assert-Contains -Text $bookstoreIndexContent -Expected $usCheckoutRestriction -Context 'Bookstore geographic checkout notice'
Assert-Ordered -Text $bookstoreIndexContent -First $usCheckoutRestriction -Second '[Reader support](/support/) uses a separate checkout.' -Context 'Bookstore geographic checkout notice'
$americanNightmarePage = Get-RequiredText -RelativePath 'content/shop/the-american-nightmare-keep-dreaming-kid.md'
if ([regex]::Matches($americanNightmarePage, '(?m)^date: 2026-08-21\s*$').Count -ne 1) {
  throw 'The American Nightmare site edition metadata must bind the owner-accepted 2026-08-21 publication date exactly once.'
}
$catalogSkus = @(
  'OIP-AN-EPUB',
  'OIP-AN-PB',
  'OIP-PS-EPUB',
  'OIP-PS-PB',
  'OIP-WC-EPUB',
  'OIP-WC-PB'
)
$publicEpubSkus = @('OIP-AN-EPUB', 'OIP-PS-EPUB', 'OIP-WC-EPUB')
$liveEpubSkus = @('OIP-AN-EPUB', 'OIP-PS-EPUB', 'OIP-WC-EPUB')
$disabledOfferSkus = @('OIP-AN-PB', 'OIP-PS-PB', 'OIP-WC-PB')

foreach ($requiredCatalogText in @(
  'product_type: "Outside In Print EPUB"',
  'checkout_label: "Buy EPUB — $9.99"',
  'checkout_unavailable_label: "EPUB coming soon"',
  'checkout_note: "Secure checkout through Square. EPUB delivered by email."',
  'direct_offers_heading: "Outside In Print EPUB"',
  'direct_offers_note: "Secure checkout through Square. EPUB delivered by email."'
)) {
  Assert-Contains -Text $bookstoreData -Expected $requiredCatalogText -Context 'Square-first bookstore defaults'
}

foreach ($sku in $catalogSkus) {
  $skuPattern = '(?ms)^\s+- sku: "' + [regex]::Escape($sku) + '"\s*$(?<body>.*?)(?=^\s+- sku:|^\s{4}tags:|\z)'
  $skuMatches = @([regex]::Matches($bookstoreData, $skuPattern))
  if ($skuMatches.Count -ne 1) {
    throw "Expected one catalog block for $sku; found $($skuMatches.Count)."
  }

  $offerBlock = $skuMatches[0].Value
  foreach ($requiredField in @(
    'format:',
    'availability_status:',
    'availability_label:',
    'isbn_status:',
    'price_display:',
    'currency: "USD"',
    'permitted_geography:',
    'tax_class:',
    'fulfillment_type:',
    'checkout_action:',
    'checkout_url:',
    'checkout_endpoint:',
    'gate_note:'
  )) {
    Assert-Contains -Text $offerBlock -Expected $requiredField -Context "Catalog offer $sku"
  }

  if ($sku.EndsWith('-EPUB', [StringComparison]::Ordinal)) {
    Assert-Contains -Text $offerBlock -Expected 'checkout_action: "epub_checkout_api"' -Context "Catalog offer $sku"
  }
  else {
    Assert-Contains -Text $offerBlock -Expected 'checkout_action: "physical_checkout_api"' -Context "Catalog offer $sku"
  }

  if ($liveEpubSkus -contains $sku) {
    Assert-Contains -Text $offerBlock -Expected 'availability_status: "live"' -Context "Live catalog offer $sku"
    Assert-Contains -Text $offerBlock -Expected 'availability_label: "Available now"' -Context "Live catalog offer $sku"
    Assert-Contains -Text $offerBlock -Expected 'isbn_status: "Assigned"' -Context "Live catalog offer $sku"
    Assert-Contains -Text $offerBlock -Expected 'checkout_url: ""' -Context "Live catalog offer $sku"
    Assert-Contains -Text $offerBlock -Expected 'checkout_endpoint: "https://downloads.outsideinprint.org/api/books/epub"' -Context "Live catalog offer $sku"
  }
  elseif ($disabledOfferSkus -contains $sku) {
    Assert-Contains -Text $offerBlock -Expected 'availability_status: "disabled"' -Context "Closed catalog offer $sku"
    Assert-Contains -Text $offerBlock -Expected 'checkout_url: ""' -Context "Closed catalog offer $sku"
    Assert-Contains -Text $offerBlock -Expected 'checkout_endpoint: ""' -Context "Closed catalog offer $sku"
  }
}

foreach ($sku in $publicEpubSkus) {
  $skuPattern = '(?ms)^\s+- sku: "' + [regex]::Escape($sku) + '"\s*$(?<body>.*?)(?=^\s+- sku:|^\s{4}tags:|\z)'
  $offerBlock = [regex]::Match($bookstoreData, $skuPattern).Value
  Assert-Contains -Text $offerBlock -Expected 'price_display: "$9.99"' -Context "Direct EPUB price $sku"
  Assert-Contains -Text $offerBlock -Expected 'price_cents: 999' -Context "Direct EPUB cents $sku"
}
$parableProductPattern = '(?ms)^  parable_of_the_sheep:\s*$(?<body>.*?)(?=^  the_water_cycle:|\z)'
$parableProduct = [regex]::Match($bookstoreData, $parableProductPattern).Value
Assert-Contains -Text $parableProduct -Expected 'price_display: "$9.99"' -Context 'Parable direct EPUB price'
Assert-Contains -Text $parableProduct -Expected 'kindle_price_display: "$4.99"' -Context 'Parable secondary Kindle price'
Assert-Contains -Text $parableProduct -Expected 'kindle_label: "Kindle on Amazon · $4.99"' -Context 'Parable compact Kindle label'

$productExpectations = @(
  @{ Key = 'american_nightmare'; Next = 'parable_of_the_sheep'; Kindle = 'Kindle on Amazon · $9.99' },
  @{ Key = 'parable_of_the_sheep'; Next = 'the_water_cycle'; Kindle = 'Kindle on Amazon · $4.99' },
  @{ Key = 'the_water_cycle'; Next = ''; Kindle = 'Kindle on Amazon · $9.99' }
)
foreach ($expectation in $productExpectations) {
  $endPattern = if ($expectation.Next) { '(?=^  ' + [regex]::Escape($expectation.Next) + ':|\z)' } else { '\z' }
  $productPattern = '(?ms)^  ' + [regex]::Escape($expectation.Key) + ':\s*$(?<body>.*?)' + $endPattern
  $productBlock = [regex]::Match($bookstoreData, $productPattern).Value
  Assert-Contains -Text $productBlock -Expected 'author: "Robert V. Ussley"' -Context "Bookstore product $($expectation.Key) author"
  Assert-Contains -Text $productBlock -Expected 'publisher: "Outside In Print"' -Context "Bookstore product $($expectation.Key) publisher"
  Assert-Contains -Text $productBlock -Expected 'price_display: "$9.99"' -Context "Bookstore product $($expectation.Key) EPUB price"
  Assert-Contains -Text $productBlock -Expected ('kindle_label: "' + $expectation.Kindle + '"') -Context "Bookstore product $($expectation.Key) Kindle label"
}

if ($bookstoreData -match '(?im)^\s+(?:purchase_url|fallback_url|fallback_label):') {
  throw 'Bookstore data must not retain Amazon-primary purchase_url or direct-offer fallback fields.'
}
if ($bookstoreData -match '(?im)^\s+checkout_note:\s+"[^"]*Amazon') {
  throw 'Bookstore data must not retain an Amazon checkout note.'
}

if ([regex]::Matches($bookstoreData, '(?m)^\s+availability_status: "live"\s*$').Count -ne 3) {
  throw 'All three direct EPUB offers must be live.'
}
if ([regex]::Matches($bookstoreData, '(?m)^\s+availability_status: "disabled"\s*$').Count -ne 3) {
  throw 'All three paperback offers must remain disabled.'
}
if ($bookstoreData -match '(?im)^\s+checkout_url:\s+"https?://') {
  throw 'The API-based direct EPUB launch must not expose a hosted checkout URL.'
}
if ([regex]::Matches($bookstoreData, '(?m)^\s+checkout_endpoint: "https://downloads\.outsideinprint\.org/api/books/epub"\s*$').Count -ne 3) {
  throw 'All three direct EPUB offers must expose the approved production endpoint.'
}
if ($bookstoreData -match '(?i)stripe') {
  throw 'The Square-only catalog must not contain Stripe configuration.'
}

$hugoConfig = Get-RequiredText -RelativePath 'hugo.toml'
foreach ($requiredConfig in @(
  '[params.commerce]',
  'api_base = "https://downloads.outsideinprint.org"',
  'support_checkout_enabled = true',
  'custom_monthly_enabled = false',
  'publication_tag = "new-publications"',
  'cadence = "Every Saturday"',
  'title = "Bob''s Almanack"',
  'contents = "Each Saturday''s issue usually brings four new essays or notes with cartoons, a weekly virtue, one number, one public document, results, records, final bows, obituaries, and one piece worth reprinting."',
  'price_promise = "Bob''s Almanack will remain free. No ads, ever."',
  'button_label = "Subscribe free"',
  'checkout_label = "Send me Bob''s Almanack every Saturday. It will remain free. No ads, ever."',
  'sample_url = "/almanack/2026-07-25/"',
  'sample_label = "Read a sample issue"',
  'privacy_promise = "Your email goes to Buttondown to deliver and manage Bob''s Almanack. Outside In Print does not sell or rent subscriber information. Unsubscribe anytime."',
  'privacy_url = "/privacy/"',
  'privacy_label = "Privacy details"'
)) {
  Assert-Contains -Text $hugoConfig -Expected $requiredConfig -Context 'Hugo commerce configuration'
}

$directOffersTemplate = Get-RequiredText -RelativePath 'layouts/partials/shop/direct-offers.html'
foreach ($requiredTemplateText in @(
  'availability_status',
  'must not expose checkout_url or checkout_endpoint while disabled',
  'index $product "direct_offers_heading" | default "Outside In Print EPUB"',
  'index $product "checkout_note" | default (index $product "direct_offers_note" | default "Secure checkout through Square. EPUB delivered by email.")',
  '$headingLevel := .headingLevel | default 2',
  'if eq $headingLevel 3',
  'index $product "checkout_label" | default "Buy EPUB"',
  'index $product "checkout_unavailable_label" | default "EPUB coming soon"',
  'epub_checkout_api',
  'https://downloads.outsideinprint.org/api/books/epub',
  'data-epub-checkout',
  'data-epub-sku="{{ $sku }}"',
  'type="email"',
  'name="email"',
  'name="weekly_email"',
  'name="publication_notifications"',
  '$newsletterCheckoutLabel',
  '$newsletterContents',
  '$newsletterSampleURL',
  '$newsletterSampleLabel',
  '$newsletterPrivacyPromise',
  '$newsletterPrivacyURL',
  '$newsletterPrivacyLabel',
  'class="bookstore-epub-checkout__newsletter-details"',
  'Optional. Not required to buy.',
  'aria-describedby="{{ $preferencesID }}"',
  'data-analytics-event="internal_promo_click"',
  'data-analytics-source-slot="{{ $newsletterSampleSourceSlot }}"',
  '$collapseCheckout := .collapseCheckout | default false',
  'class="bookstore-epub-checkout-disclosure"',
  'data-bookstore-checkout-disclosure',
  '<summary aria-label="{{ $checkoutSummaryLabel }}: {{ $productTitle }}">',
  'data-buttondown-endpoint="https://buttondown.com/api/emails/embed-subscribe/{{ . }}"',
  'https://square.link/',
  'https://checkout.square.site/',
  'data-analytics-event="checkout_start"',
  'data-analytics-product="{{ $sku }}"',
  'data-analytics-format="{{ $format }}"',
  'data-analytics-path="/shop/{{ $productSlug }}/{{ $format | urlize }}/checkout"'
)) {
  Assert-Contains -Text $directOffersTemplate -Expected $requiredTemplateText -Context 'Direct-offer template'
}
if ($directOffersTemplate -match '(?i)physical_checkout_api|data-physical-checkout|/api/books/physical|USPS Media Mail') {
  throw 'Direct-offer template must render EPUBs only during the digital-first launch.'
}
Assert-Contains -Text $directOffersTemplate -Expected '$offers := where $allOffers "format" "EPUB"' -Context 'Direct-offer EPUB filter'
if ($directOffersTemplate -match '(?i)fallback_(?:url|label)|amazon') {
  throw 'Direct-offer template must not contain an Amazon fallback field or redirect.'
}

$legacyCheckoutActions = Join-Path $repoRoot 'layouts/partials/shop/checkout-actions.html'
if (Test-Path -LiteralPath $legacyCheckoutActions) {
  throw 'Unused legacy checkout-actions partial must be removed.'
}

$kindleButtonTemplate = Get-RequiredText -RelativePath 'layouts/partials/shop/kindle-button.html'
foreach ($requiredKindleText in @(
  '$promoteKindle := and (gt (len $epubOffers) 0) (eq (len $liveEpubOffers) 0)',
  'class="bookstore-kindle-button{{ if $promoteKindle }} bookstore-kindle-button--available-primary{{ end }}"',
  'bookstore-kindle-offer--available-primary',
  'data-bookstore-kindle-button',
  'data-bookstore-kindle-role="{{ cond $promoteKindle "primary-available" "secondary" }}"',
  'index $product "kindle_url"',
  'index $product "kindle_label"',
  'data-analytics-source-slot="{{ $sourceSlot }}"',
  'data-analytics-path="{{ . }}"'
)) {
  Assert-Contains -Text $kindleButtonTemplate -Expected $requiredKindleText -Context 'Status-aware Kindle offer'
}
if ($kindleButtonTemplate -match '(?i)data-analytics-event|<img|amazon[^<]*logo|width:\s*100%') {
  throw 'Status-aware Kindle partial must rely on external-link analytics and must not use a logo or hard-coded full-width treatment.'
}

$shopListTemplate = Get-RequiredText -RelativePath 'layouts/shop/list.html'
foreach ($requiredDigitalFirstText in @(
  'partial "shop/direct-offers.html"',
  'partial "shop/kindle-button.html"',
  '"sourceSlot" "bookstore_index_direct"',
  '"collapseCheckout" true',
  '"headingLevel" 3',
  '"sourceSlot" "bookstore_index_kindle"',
  'resources.Get "js/epub-checkout.js"'
)) {
  Assert-Contains -Text $shopListTemplate -Expected $requiredDigitalFirstText -Context 'Digital-first shop list'
}
if ([regex]::Matches($shopListTemplate, 'partial\s+"shop/kindle-button\.html"').Count -ne 1) {
  throw 'Bookstore index must render the shared compact Kindle partial exactly once per product loop.'
}
Assert-Ordered -Text $shopListTemplate -First 'partial "shop/direct-offers.html"' -Second 'partial "shop/kindle-button.html"' -Context 'Bookstore index purchase order'
Assert-Ordered -Text $shopListTemplate -First '{{ with .Content }}' -Second 'partial "shop/direct-offers.html"' -Context 'Bookstore geographic checkout notice placement'
if ($shopListTemplate -match '(?i)paperback|physical-cart|physical-checkout|/api/books/physical|js/physical-checkout') {
  throw 'Shop list must not expose paperback, physical-cart, shipping, or physical-checkout UI.'
}

$shopSingleTemplate = Get-RequiredText -RelativePath 'layouts/shop/single.html'
foreach ($requiredDetailText in @(
  'partial "shop/direct-offers.html"',
  'partial "shop/kindle-button.html"',
  '"sourceSlot" "bookstore_detail_direct"',
  '"sourceSlot" "bookstore_detail_kindle"',
  $usCheckoutRestriction,
  'if gt (len $liveEpubOffers) 0'
)) {
  Assert-Contains -Text $shopSingleTemplate -Expected $requiredDetailText -Context 'Square-first shop detail'
}
if ([regex]::Matches($shopSingleTemplate, 'partial\s+"shop/kindle-button\.html"').Count -ne 1) {
  throw 'Bookstore detail must render the shared compact Kindle partial exactly once.'
}
Assert-Ordered -Text $shopSingleTemplate -First 'partial "shop/direct-offers.html"' -Second 'partial "shop/kindle-button.html"' -Context 'Bookstore detail purchase order'
Assert-Ordered -Text $shopSingleTemplate -First $usCheckoutRestriction -Second 'partial "shop/direct-offers.html"' -Context 'Bookstore detail geographic checkout notice placement'
if ($shopSingleTemplate -match 'collapseCheckout') {
  throw 'Book detail pages must keep the direct EPUB checkout form expanded.'
}
if ($shopSingleTemplate -match 'headingLevel') {
  throw 'Book detail pages must retain the direct-offer partial default H2 hierarchy.'
}
if ($shopListTemplate -match '(?i)bookstore-secondary-channel|checkout-actions' -or
    $shopSingleTemplate -match '(?i)bookstore-panel|Other formats and channels|checkout-actions') {
  throw 'Bookstore templates must not retain the legacy secondary-channel block, sidebar panel, or checkout-actions partial.'
}

$physicalCartTemplate = Get-RequiredText -RelativePath 'layouts/partials/shop/physical-cart.html'
foreach ($requiredPhysicalCartText in @(
  '(gt (len $offers) 0)',
  'https://downloads.outsideinprint.org/api/books/physical',
  'data-physical-checkout',
  'data-physical-cart-checkout',
  'data-physical-cart-item',
  'data-physical-sku="{{ $sku }}"',
  'min="0"',
  'max="6"',
  'name="address_line_1"',
  'name="address_line_2"',
  'name="locality"',
  'name="administrative_district_level_1"',
  'name="postal_code"',
  'data-analytics-format="Paperback"'
)) {
  Assert-Contains -Text $physicalCartTemplate -Expected $requiredPhysicalCartText -Context 'Paperback-cart template'
}
if ($physicalCartTemplate -match '(?i)EPUB|data-epub|price_cents|tax_cents') {
  throw 'Paperback cart must not mix EPUB offers or submit client-supplied price or tax values.'
}

$epubCheckoutScript = Get-RequiredText -RelativePath 'assets/js/epub-checkout.js'
foreach ($requiredScriptText in @(
  'window.crypto.randomUUID()',
  'window.crypto.getRandomValues(bytes)',
  'form.matches("[data-epub-checkout]")',
  'form.dataset.epubSku',
  '"Idempotency-Key": idempotencyKey',
  'JSON.stringify({ sku: sku, country_code: "US", email: email })',
  'emailInput.checkValidity()',
  'body.append("tag", tag)',
  'keepalive: true',
  'payload.checkout_url || payload.url',
  'parsed.protocol !== "https:"',
  'parsed.hostname !== "square.link"',
  'parsed.hostname !== "checkout.square.site"',
  'credentials: "omit"',
  'button.disabled = false;',
  'button.removeAttribute("aria-busy")',
  'button.textContent = originalLabel;',
  'Secure checkout could not be opened. Please try again or email support@outsideinprint.org.'
)) {
  Assert-Contains -Text $epubCheckoutScript -Expected $requiredScriptText -Context 'EPUB checkout script'
}
if ($epubCheckoutScript -match '(?i)analyticsAmount|order_id|customer_email|shipping_address|payment_id') {
  throw 'EPUB checkout script must not expose amounts, order IDs, customer email, addresses, or payment IDs to analytics.'
}
if ($epubCheckoutScript -match '(?i)amazon|fallback_url|window\.location\.(?:assign|replace)\([^)]*amazon') {
  throw 'EPUB checkout failures must never redirect or suggest redirecting to Amazon.'
}

foreach ($shopLayoutPath in @('layouts/shop/list.html', 'layouts/shop/single.html')) {
  $shopLayout = Get-RequiredText -RelativePath $shopLayoutPath
  Assert-Contains -Text $shopLayout -Expected 'resources.Get "js/epub-checkout.js"' -Context $shopLayoutPath
  if ($shopLayout -match '(?i)resources\.Get "js/physical-checkout\.js"|data-physical-checkout|/api/books/physical') {
    throw "$shopLayoutPath must not load or render physical checkout during the digital-first launch."
  }
}

$mainCss = Get-RequiredText -RelativePath 'assets/css/main.css'
foreach ($requiredCssContract in @(
  '.bookstore-direct-offers__grid{',
  'grid-template-columns:1fr;',
  '.bookstore-direct-offer__action{',
  'width:100%;',
  'min-height:3.2rem;',
  '.bookstore-direct-offer__action:not(.shop-cta--disabled){',
  'background:var(--accent);',
  '.bookstore-kindle-button{',
  'display:inline-flex;',
  'width:auto;',
  'max-width:100%;',
  'background:transparent;',
  '.bookstore-kindle-button--available-primary{',
  'min-height:3.2rem;',
  'background:var(--accent);',
  '.bookstore-direct-offers--unavailable{'
)) {
  Assert-Contains -Text $mainCss -Expected $requiredCssContract -Context 'Square-first storefront CSS'
}

$physicalCheckoutScript = Get-RequiredText -RelativePath 'assets/js/physical-checkout.js'
foreach ($requiredScriptText in @(
  'window.crypto.randomUUID()',
  'form.matches("[data-physical-checkout]")',
  'form.dataset.physicalSku',
  'form.matches("[data-physical-cart-checkout]")',
  'form.querySelectorAll("[data-physical-cart-item]")',
  'sku === "OIP-AN-PB"',
  'sku === "OIP-PS-PB"',
  'sku === "OIP-WC-PB"',
  'totalQuantity < 1 || totalQuantity > 6',
  'var checkoutIntents = new WeakMap();',
  'idempotencyKeyFor(form, requestBody)',
  '"Idempotency-Key": idempotencyKey',
  'checkoutIntents.delete(form)',
  'requestBody = JSON.stringify(payload)',
  'items: items',
  'country: "US"',
  'address_line_1:',
  'administrative_district_level_1:',
  'postal_code:',
  'payload.checkout_url || payload.url',
  'parsed.hostname !== "square.link"',
  'credentials: "omit"'
)) {
  Assert-Contains -Text $physicalCheckoutScript -Expected $requiredScriptText -Context 'Physical checkout script'
}
if ($physicalCheckoutScript -match '(?i)analyticsAmount|order_id|customer_email|payment_id') {
  throw 'Physical checkout script must not expose amounts, order IDs, customer email, or payment IDs to analytics.'
}

$supportTemplate = Get-RequiredText -RelativePath 'layouts/support/list.html'
foreach ($requiredSupportText in @(
  'support_checkout_enabled',
  'data-support-checkout-enabled="{{ $supportCheckoutEnabled }}"',
  '/api/support/one-time',
  '/api/support/monthly',
  'OIP-SUPPORT-ONCE',
  'OIP-SUPPORT-MONTHLY-5',
  'min="5" max="500" step="1"',
  'data-analytics-event="checkout_start"',
  'Reader support checkout opens after its activation gate passes.',
  'Monthly support is charged today and renews each month until canceled.'
)) {
  Assert-Contains -Text $supportTemplate -Expected $requiredSupportText -Context 'Support template'
}
if ($supportTemplate -match '(?i)OIP-SUPPORT-MONTHLY-CUSTOM|support_monthly_custom|Choose a monthly amount|custom_monthly_enabled') {
  throw 'Public support template must expose only one-time and fixed $5 monthly support.'
}

$supportScript = Get-RequiredText -RelativePath 'assets/js/support-checkout.js'
foreach ($requiredScriptText in @(
  'window.crypto.randomUUID()',
  'window.crypto.getRandomValues(bytes)',
  '"Idempotency-Key": idempotencyKey',
  'JSON.stringify({ amount_cents: amountCents })',
  'payload.checkout_url || payload.url',
  'parsed.hostname !== "square.link"',
  'parsed.hostname !== "checkout.square.site"',
  'credentials: "omit"'
)) {
  Assert-Contains -Text $supportScript -Expected $requiredScriptText -Context 'Support checkout script'
}

$analyticsScript = Get-RequiredText -RelativePath 'assets/js/analytics.js'
foreach ($requiredAnalyticsText in @(
  '"product", "format"',
  'node.dataset.analyticsProduct',
  'node.dataset.analyticsFormat',
  'form.matches("[data-analytics-event]")',
  'function getReferrer()',
  'return "";'
)) {
  Assert-Contains -Text $analyticsScript -Expected $requiredAnalyticsText -Context 'Analytics script'
}
if ($analyticsScript -match '(?i)analyticsAmount|order[_-]?id|payment[_-]?id|customer[_-]?(?:id|email)|shipping[_-]?address|document\.referrer|location\.(?:search|hash)|URLSearchParams|get_query') {
  throw 'Analytics code must not collect checkout amounts, processor IDs, customer data, URL query data, fragments, or raw referrers.'
}

$analyticsTemplate = Get-RequiredText -RelativePath 'layouts/partials/analytics.html'
foreach ($requiredAnalyticsPrivacyText in @(
  'window.oipAnalyticsEventReferrer = function ()',
  'window.goatcounter.path = function ()',
  'return window.location.pathname || "/";',
  'window.goatcounter.referrer = function ()',
  'return "";'
)) {
  Assert-Contains -Text $analyticsTemplate -Expected $requiredAnalyticsPrivacyText -Context 'Analytics privacy boundary'
}
if ($analyticsTemplate -match '(?i)URLSearchParams|location\.(?:search|hash)|document\.referrer|oipAnalyticsCampaignReferrer|get_query|order[_-]?id|payment[_-]?id|customer[_-]?(?:id|email)|shipping[_-]?address') {
  throw 'Analytics template must expose only the current pathname and must suppress query data, fragments, campaign values, processor IDs, customer data, and raw referrers.'
}

$mastheadTemplate = Get-RequiredText -RelativePath 'layouts/partials/masthead.html'
$footerTemplate = Get-RequiredText -RelativePath 'layouts/partials/footer.html'
foreach ($requiredNavigationText in @(
  'primary_nav_support',
  'Support Outside In Print'
)) {
  Assert-Contains -Text $mastheadTemplate -Expected $requiredNavigationText -Context 'Primary navigation'
}
foreach ($requiredFooterRoute in @(
  'support/',
  'contact/',
  'epub-license-refunds/',
  'support/cancellation-refunds/',
  'privacy/',
  'terms/'
)) {
  Assert-Contains -Text $footerTemplate -Expected $requiredFooterRoute -Context 'Footer navigation'
}

$requiredPolicySources = @(
  'content/privacy/index.md',
  'content/terms/index.md',
  'content/epub-license-refunds/index.md',
  'content/support/cancellation-refunds.md',
  'content/contact/index.md'
)
foreach ($relativePath in $requiredPolicySources) {
  $policy = Get-RequiredText -RelativePath $relativePath
  Assert-Contains -Text $policy -Expected 'type: "commerce-policy"' -Context $relativePath
  Assert-Contains -Text $policy -Expected 'draft: false' -Context $relativePath
  Assert-Contains -Text $policy -Expected 'support@outsideinprint.org' -Context $relativePath
}
$supportTermsSource = Get-RequiredText -RelativePath 'content/support/cancellation-refunds.md'
foreach ($requiredSupportTermsText in @(
  'effective_date: "August 31, 2026"',
  'one-time support in a whole-dollar amount from $5 to $500;',
  'fixed support of $5 per month.'
)) {
  Assert-Contains -Text $supportTermsSource -Expected $requiredSupportTermsText -Context 'Reader Support Cancellation and Refund Terms'
}
if ($supportTermsSource -match '(?i)custom monthly support|recurring-price validation') {
  throw 'Reader Support Cancellation and Refund Terms must not promise unavailable custom monthly support.'
}
$shippingPolicy = Get-RequiredText -RelativePath 'content/shipping-returns/index.md'
Assert-Contains -Text $shippingPolicy -Expected 'draft: true' -Context 'Deferred shipping policy'
if ($footerTemplate -match '(?i)shipping-returns|Shipping &amp; returns') {
  throw 'Footer must not expose shipping policy during the EPUB-first launch.'
}

$thanksSource = Get-RequiredText -RelativePath 'content/support/thanks.md'
foreach ($requiredThanksText in @(
  'title: "Thank you for supporting Outside In Print"',
  'type: "commerce-policy"',
  'eyebrow: "Support confirmation"',
  'draft: false',
  'noindex: true',
  'list: never',
  "You’re back from Square checkout. Thank you for supporting Outside In Print.",
  'Check your Square receipt email for confirmation:',
  '**One-time support:** The receipt confirms the amount charged.',
  '**Monthly support:** The receipt confirms the $5 monthly subscription',
  'Your Square receipt is the authoritative confirmation.',
  '[return to the support options](/support/)',
  '[contact Outside In Print](/contact/)'
)) {
  Assert-Contains -Text $thanksSource -Expected $requiredThanksText -Context 'Support thanks source'
}
if ($thanksSource -match '(?i)<form|<input|URLSearchParams|location\.search|order[_ -]?id|payment[_ -]?id') {
  throw 'Support thanks source must not capture or display redirect identifiers.'
}

$epubThanksSource = Get-RequiredText -RelativePath 'content/shop/thanks.md'
foreach ($requiredEpubThanksText in @(
  'title: "Thanks for your purchase"',
  'type: "commerce-policy"',
  'eyebrow: "Order confirmation"',
  'draft: false',
  'noindex: true',
  'list: never',
  'Expect your secure EPUB download link at the delivery email address you entered during checkout.',
  'Square is confirming your payment.',
  'does not confirm that payment succeeded',
  '[contact Outside In Print](/contact/)',
  '[return to the bookstore](/shop/)'
)) {
  Assert-Contains -Text $epubThanksSource -Expected $requiredEpubThanksText -Context 'EPUB thanks source'
}
if ($epubThanksSource -match '(?i)<form|<input|URLSearchParams|location\.search|order[_ -]?id|payment[_ -]?id|email has been sent') {
  throw 'EPUB thanks source must remain query-agnostic and avoid unverified fulfillment claims.'
}

if ($SourceOnly) {
  Write-Host 'Direct-commerce storefront source contract passed.'
  return
}

$requiredOutputFiles = @(
  'shop/index.html',
  'shop/the-american-nightmare-keep-dreaming-kid/index.html',
  'shop/the-parable-of-the-sheep/index.html',
  'shop/thanks/index.html',
  'shop/the-water-cycle/index.html',
  'support/index.html',
  'support/cancellation-refunds/index.html',
  'support/thanks/index.html',
  'privacy/index.html',
  'terms/index.html',
  'epub-license-refunds/index.html',
  'contact/index.html'
)
$output = @{}
foreach ($relativePath in $requiredOutputFiles) {
  $fullPath = Join-Path $SiteDir $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing built direct-commerce route: $relativePath"
  }
  $output[$relativePath] = Get-Content -LiteralPath $fullPath -Raw -Encoding utf8
}

$shopOutput = @(
  $output['shop/index.html'],
  $output['shop/the-american-nightmare-keep-dreaming-kid/index.html'],
  $output['shop/the-parable-of-the-sheep/index.html'],
  $output['shop/the-water-cycle/index.html']
) -join "`n"
$shopIndexOutput = [string]$output['shop/index.html']
$shopDetailOutput = @(
  $output['shop/the-american-nightmare-keep-dreaming-kid/index.html'],
  $output['shop/the-parable-of-the-sheep/index.html'],
  $output['shop/the-water-cycle/index.html']
) -join "`n"
$catalogDisclosures = @([regex]::Matches($shopIndexOutput, '<details\b[^>]*\bdata-bookstore-checkout-disclosure(?:=|\s|>)', 'IgnoreCase'))
if ($catalogDisclosures.Count -ne 3) {
  throw "Bookstore index must render exactly three direct-EPUB checkout disclosures; found $($catalogDisclosures.Count)."
}
$decodedShopIndexOutput = [Net.WebUtility]::HtmlDecode($shopIndexOutput)
Assert-Contains -Text $decodedShopIndexOutput -Expected $usCheckoutRestriction -Context 'Built bookstore geographic checkout notice'
$restrictionIndex = $decodedShopIndexOutput.IndexOf($usCheckoutRestriction, [StringComparison]::Ordinal)
$firstDisclosureIndex = $decodedShopIndexOutput.IndexOf('data-bookstore-checkout-disclosure', [StringComparison]::Ordinal)
if ($restrictionIndex -lt 0 -or $firstDisclosureIndex -lt 0 -or $restrictionIndex -ge $firstDisclosureIndex) {
  throw 'Built bookstore must place the U.S.-only direct EPUB notice before the first checkout disclosure.'
}
if ($shopIndexOutput -match '(?is)<details\b[^>]*\bdata-bookstore-checkout-disclosure[^>]*\bopen(?:\s*=|\s|>)') {
  throw 'Bookstore index direct-EPUB checkout disclosures must be closed by default.'
}
if ([regex]::Matches([Net.WebUtility]::HtmlDecode($shopIndexOutput), '<summary\b[^>]*\baria-label="Buy direct EPUB — \$9\.99: [^"]+"[^>]*>\s*<span>Buy direct EPUB — \$9\.99</span>\s*</summary>', 'IgnoreCase').Count -ne 3) {
  throw 'Every bookstore index checkout disclosure must show the $9.99 direct-EPUB label and include the book title in its accessible name.'
}
if ([regex]::Matches($shopIndexOutput, '(?is)<details\b[^>]*\bdata-bookstore-checkout-disclosure(?:=|\s|>).*?<form\b[^>]*\bdata-epub-checkout(?:=|\s|>).*?</form>\s*</div>\s*</details>').Count -ne 3) {
  throw 'Every bookstore index disclosure must contain its complete EPUB checkout form.'
}
if ($shopDetailOutput -match '\bdata-bookstore-checkout-disclosure(?:=|\s|>)') {
  throw 'Book detail pages must render their EPUB checkout forms without the catalog disclosure.'
}
foreach ($detailPath in @(
  'shop/the-american-nightmare-keep-dreaming-kid/index.html',
  'shop/the-parable-of-the-sheep/index.html',
  'shop/the-water-cycle/index.html'
)) {
  $detailHtml = [Net.WebUtility]::HtmlDecode([string]$output[$detailPath])
  if ([regex]::Matches($detailHtml, [regex]::Escape($usCheckoutRestriction), 'IgnoreCase').Count -ne 1) {
    throw "Built bookstore detail $detailPath must expose the U.S.-only direct EPUB notice exactly once."
  }
  $detailRestrictionIndex = $detailHtml.IndexOf($usCheckoutRestriction, [StringComparison]::Ordinal)
  $detailCheckoutIndex = $detailHtml.IndexOf('data-direct-offer', [StringComparison]::Ordinal)
  if ($detailRestrictionIndex -lt 0 -or $detailCheckoutIndex -lt 0 -or $detailRestrictionIndex -ge $detailCheckoutIndex) {
    throw "Built bookstore detail $detailPath must place the U.S.-only notice before direct checkout."
  }
}
foreach ($sku in $publicEpubSkus) {
  if ($shopOutput -notmatch ('data-direct-offer-sku=(?:"|'''')?' + [regex]::Escape($sku) + '(?:"|'''')?')) {
    throw "Built shop output does not expose the gated catalog record for $sku."
  }
}
if ($shopOutput -match '(?is)<a\b[^>]*bookstore-direct-offer__action') {
  throw 'The API-based EPUB launch must not expose a hosted direct-offer checkout link.'
}
if ([regex]::Matches($shopOutput, 'data-direct-offer-status=(?:"|'''')?live(?:"|'''')?', 'IgnoreCase').Count -ne 6) {
  throw 'Expected all three live EPUB offers on the index and their detail pages.'
}
if ([regex]::Matches($shopOutput, 'data-direct-offer-status=(?:"|'''')?disabled(?:"|'''')?', 'IgnoreCase').Count -ne 0) {
  throw 'No closed EPUB offer may remain on the storefront.'
}
if ([regex]::Matches($shopOutput, '\bdata-epub-checkout(?:=|\s|>)', 'IgnoreCase').Count -ne 6) {
  throw 'Expected six rendered checkout forms for the three live EPUB offers.'
}
if ([regex]::Matches($shopOutput, 'action=(?:"|'''')?https://downloads\.outsideinprint\.org/api/books/epub(?:"|'''')?', 'IgnoreCase').Count -ne 6) {
  throw 'Expected the approved production endpoint on all live EPUB index and detail forms.'
}
if ([regex]::Matches($shopOutput, 'type=(?:"|'''')?email(?:"|'''')?', 'IgnoreCase').Count -lt 6) {
  throw 'Every live EPUB checkout must require a delivery email field.'
}
if ([regex]::Matches($shopOutput, 'name=(?:"|'''')?weekly_email(?:"|'''')?', 'IgnoreCase').Count -ne 6) {
  throw 'Every live EPUB checkout must expose the optional weekly-email choice.'
}
if ([regex]::Matches($shopOutput, 'name=(?:"|'''')?publication_notifications(?:"|'''')?', 'IgnoreCase').Count -ne 6) {
  throw 'Every live EPUB checkout must expose the optional new-publication choice.'
}
$marketingCheckboxes = @([regex]::Matches($shopOutput, '(?is)<input\b[^>]*\bname=(?:"|'''')?(?:weekly_email|publication_notifications)(?:"|'''')?[^>]*>'))
if ($marketingCheckboxes.Count -ne 12 -or @($marketingCheckboxes | Where-Object { $_.Value -match '\bchecked(?:\s*=|\s|>)' }).Count -ne 0) {
  throw 'All weekly-email and new-publication preferences must render unchecked and remain optional.'
}
foreach ($requiredNewsletterText in @(
  'Send me Bob''s Almanack every Saturday. It will remain free. No ads, ever.',
  'Each Saturday''s issue usually brings four new essays or notes with cartoons, a weekly virtue, one number, one public document, results, records, final bows, obituaries, and one piece worth reprinting.',
  'Read a sample issue',
  'Privacy details',
  'Your email goes to Buttondown to deliver and manage Bob''s Almanack. Outside In Print does not sell or rent subscriber information. Unsubscribe anytime.',
  'Optional. Not required to buy.'
)) {
  Assert-Contains -Text ([Net.WebUtility]::HtmlDecode($shopOutput)) -Expected $requiredNewsletterText -Context 'Built bookstore Bob''s Almanack opt-in'
}
if ($shopOutput -notmatch '(?is)href=(?:"|'''')?(?:https://outsideinprint\.org)?/almanack/2026-07-25/(?:"|'''')?[^>]*data-analytics-event=(?:"|'''')?internal_promo_click(?:"|'''')?[^>]*data-analytics-source-slot=(?:"|'''')?(?:bookstore_index_direct|bookstore_detail_direct)_sample_issue(?:"|'''')?') {
  throw 'Built bookstore sample links must use the existing internal-promotion event and derived direct-offer source slot.'
}
if ($shopOutput -notmatch '(?is)href=(?:"|'''')?(?:https://outsideinprint\.org)?/privacy/(?:"|'''')?[^>]*>\s*Privacy details\s*</a>') {
  throw 'Built bookstore newsletter opt-ins must link the privacy details.'
}
if ($shopOutput -match '(?i)Limited time|launch window|No spam|Easy to leave') {
  throw 'Built bookstore retained retired temporary or vague newsletter trust copy.'
}
if ($shopOutput -match '(?i)OIP-(?:AN|PS|WC)-PB|data-physical|bookstore-physical|/api/books/physical|USPS Media Mail|Shipping &amp; returns') {
  throw 'Built shop output exposed physical-commerce UI during the EPUB-first launch.'
}
if ($shopOutput -match '(?i)Amazon handles purchase|fallback_(?:url|label)|purchase_url') {
  throw 'Built shop output retained an obsolete Amazon-primary or fallback field.'
}
if ([regex]::Matches($shopOutput, 'data-bookstore-kindle-button(?:=|\s|>)', 'IgnoreCase').Count -ne 6) {
  throw 'Built bookstore must render exactly one compact Kindle button per title on the index and detail surfaces.'
}
$decodedShopOutput = [Net.WebUtility]::HtmlDecode($shopOutput)
if ([regex]::Matches($decodedShopOutput, '>Kindle on Amazon · \$9\.99</a>', 'IgnoreCase').Count -ne 4) {
  throw 'American Nightmare and Water Cycle must each show the exact $9.99 compact Kindle label on index and detail pages.'
}
if ([regex]::Matches($decodedShopOutput, '>Kindle on Amazon · \$4\.99</a>', 'IgnoreCase').Count -ne 2) {
  throw 'Parable must show the exact $4.99 compact Kindle label on index and detail pages.'
}

$shopSurfaceExpectations = @(
  @{ Path = 'shop/index.html'; KindleCount = 3; Expected = @('Outside In Print EPUB', 'Secure checkout through Square. EPUB delivered by email.', 'Buy EPUB — $9.99', '$9.99', 'Robert V. Ussley', 'Outside In Print') },
  @{ Path = 'shop/the-american-nightmare-keep-dreaming-kid/index.html'; KindleCount = 1; Expected = @('Outside In Print EPUB', 'Secure checkout through Square. EPUB delivered by email.', 'Buy EPUB — $9.99', '$9.99', 'Robert V. Ussley', 'Outside In Print', 'Kindle on Amazon · $9.99') },
  @{ Path = 'shop/the-parable-of-the-sheep/index.html'; KindleCount = 1; Expected = @('Outside In Print EPUB', 'Secure checkout through Square. EPUB delivered by email.', 'Buy EPUB — $9.99', '$9.99', 'Robert V. Ussley', 'Outside In Print', 'Kindle on Amazon · $4.99') },
  @{ Path = 'shop/the-water-cycle/index.html'; KindleCount = 1; Expected = @('Outside In Print EPUB', 'Secure checkout through Square. EPUB delivered by email.', 'Buy EPUB — $9.99', '$9.99', 'Robert V. Ussley', 'Outside In Print', 'Kindle on Amazon · $9.99') }
)
foreach ($surface in $shopSurfaceExpectations) {
  $surfaceHtml = [Net.WebUtility]::HtmlDecode([string]$output[$surface.Path])
  foreach ($expectedText in $surface.Expected) {
    Assert-Contains -Text $surfaceHtml -Expected $expectedText -Context "Built storefront $($surface.Path)"
  }
  $kindleCount = [regex]::Matches($surfaceHtml, 'data-bookstore-kindle-button(?:=|\s|>)', 'IgnoreCase').Count
  if ($kindleCount -ne $surface.KindleCount) {
    throw "Built storefront $($surface.Path) expected $($surface.KindleCount) compact Kindle button(s); found $kindleCount."
  }
}

$shopIndexHtml = [Net.WebUtility]::HtmlDecode([string]$output['shop/index.html'])
if ([regex]::Matches($shopIndexHtml, '<h3\b[^>]*>\s*Outside In Print EPUB\s*</h3>', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore index must nest each direct EPUB offer under its book H2 with an H3.'
}
foreach ($detailPath in @(
  'shop/the-american-nightmare-keep-dreaming-kid/index.html',
  'shop/the-parable-of-the-sheep/index.html',
  'shop/the-water-cycle/index.html'
)) {
  $detailHtml = [Net.WebUtility]::HtmlDecode([string]$output[$detailPath])
  if ([regex]::Matches($detailHtml, '<h2\b[^>]*>\s*Outside In Print EPUB\s*</h2>', 'IgnoreCase').Count -ne 1) {
    throw "Built bookstore detail $detailPath must retain one direct EPUB H2."
  }
}
if ([regex]::Matches($shopOutput, 'Secure checkout through Square\. EPUB delivered by email after payment is confirmed\.', 'IgnoreCase').Count -ne 0) {
  throw 'Built bookstore must not repeat the live Square and delivery helper beneath each direct offer.'
}

$privacyOutput = ([Net.WebUtility]::HtmlDecode([string]$output['privacy/index.html'])).Replace([char]0x2019, [char]0x27)
foreach ($requiredPrivacyText in @(
  'Effective August 31, 2026',
  'standalone Bob''s Almanack signup form',
  'IP address, browser or device information, and referring page',
  'selected preference tags',
  'message-open or link-click information',
  'email-client, browser, device, IP-address, or referrer metadata',
  'Outside In Print does not sell or rent personal information.',
  'Unsubscribing stops the selected emails but is not the same as deleting subscription records.'
)) {
  Assert-Contains -Text $privacyOutput -Expected $requiredPrivacyText -Context 'Built privacy policy'
}
if ($privacyOutput -match [regex]::Escape('This policy explains how Outside In Print handles information connected to this website')) {
  throw 'Built privacy policy must not repeat its scope in a second opening paragraph.'
}

$orderedOffers = @(
  @{ Path = 'shop/index.html'; Sku = 'OIP-AN-EPUB'; Kindle = 'Kindle on Amazon · $9.99' },
  @{ Path = 'shop/index.html'; Sku = 'OIP-PS-EPUB'; Kindle = 'Kindle on Amazon · $4.99' },
  @{ Path = 'shop/index.html'; Sku = 'OIP-WC-EPUB'; Kindle = 'Kindle on Amazon · $9.99' },
  @{ Path = 'shop/the-american-nightmare-keep-dreaming-kid/index.html'; Sku = 'OIP-AN-EPUB'; Kindle = 'Kindle on Amazon · $9.99' },
  @{ Path = 'shop/the-parable-of-the-sheep/index.html'; Sku = 'OIP-PS-EPUB'; Kindle = 'Kindle on Amazon · $4.99' },
  @{ Path = 'shop/the-water-cycle/index.html'; Sku = 'OIP-WC-EPUB'; Kindle = 'Kindle on Amazon · $9.99' }
)
foreach ($offer in $orderedOffers) {
  $surfaceHtml = [Net.WebUtility]::HtmlDecode([string]$output[$offer.Path])
  $pattern = '(?is)data-direct-offer-sku=(?:"|'''')?' + [regex]::Escape($offer.Sku) + '(?:"|'''')?.*?' + [regex]::Escape($offer.Kindle)
  if ($surfaceHtml -notmatch $pattern) {
    throw "Built storefront $($offer.Path) must place direct EPUB $($offer.Sku) before its one compact Kindle button."
  }
}
if ($shopOutput -match '(?i)data-analytics-(?:amount|order|email|address|customer|payment|transaction)') {
  throw 'Built shop analytics attributes exposed sensitive, financial, customer, or processor data.'
}

$supportOutput = [Net.WebUtility]::HtmlDecode([string]$output['support/index.html'])
foreach ($requiredSupportOutput in @(
  'Support Outside In Print',
  'If you value the work, you can support Outside In Print directly.',
  'Support once',
  'Support $5 monthly',
  'Monthly support is charged today and renews each month until canceled. Cancel anytime through the link in your Square receipt email.',
  'data-support-checkout-enabled=true',
  'https://downloads.outsideinprint.org/api/support/one-time',
  'https://downloads.outsideinprint.org/api/support/monthly',
  'Continue to Square'
)) {
  Assert-Contains -Text $supportOutput -Expected $requiredSupportOutput -Context 'Built support page'
}
if ([regex]::Matches($supportOutput, '<section\b[^>]*class=(?:"|'''')?support-option\b', 'IgnoreCase').Count -ne 2) {
  throw 'Built support page must contain exactly two public support options.'
}
if ([regex]::Matches($supportOutput, '<form\b[^>]*data-support-checkout', 'IgnoreCase').Count -ne 2) {
  throw 'Live support output must expose exactly two checkout forms.'
}
if ($supportOutput -match '(?i)Checkout not yet open|activation gate passes|Choose a monthly amount|OIP-SUPPORT-MONTHLY-CUSTOM') {
  throw 'Live support output must not expose a closed-gate message or custom-monthly option.'
}
if ($supportOutput -match '(?i)data-analytics-(?:amount|order|email|address)') {
  throw 'Built support analytics attributes exposed sensitive or financial data.'
}
if ($supportOutput -match '(?i)data-analytics-(?:customer|payment|subscription|transaction)') {
  throw 'Built support analytics attributes exposed customer or processor identifiers.'
}

$supportTermsOutput = [Net.WebUtility]::HtmlDecode([string]$output['support/cancellation-refunds/index.html'])
foreach ($requiredSupportTermsOutput in @(
  'Effective August 31, 2026',
  'one-time support in a whole-dollar amount from $5 to $500;',
  'fixed support of $5 per month.'
)) {
  Assert-Contains -Text $supportTermsOutput -Expected $requiredSupportTermsOutput -Context 'Built reader support terms'
}
if ($supportTermsOutput -match '(?i)custom monthly support|recurring-price validation') {
  throw 'Built reader support terms must not promise unavailable custom monthly support.'
}

$thanksOutput = [Net.WebUtility]::HtmlDecode([string]$output['support/thanks/index.html'])
foreach ($requiredThanksOutput in @(
  'Support confirmation',
  'Thank you for supporting Outside In Print',
  "You’re back from Square checkout. Thank you for supporting Outside In Print.",
  'Check your Square receipt email for confirmation:',
  'One-time support:',
  'The receipt confirms the amount charged.',
  'Monthly support:',
  'The receipt confirms the $5 monthly subscription',
  'Your Square receipt is the authoritative confirmation.',
  'href=/support/',
  'href=/contact/'
)) {
  Assert-Contains -Text $thanksOutput -Expected $requiredThanksOutput -Context 'Built support thanks page'
}
if ($thanksOutput -match '(?i)<form\b|<input\b|data-support-checkout|order[_ -]?id|payment[_ -]?id') {
  throw 'Built support thanks page must remain query-agnostic and free of identifier capture.'
}

$epubThanksOutput = [Net.WebUtility]::HtmlDecode([string]$output['shop/thanks/index.html'])
foreach ($requiredEpubThanksOutput in @(
  'Order confirmation',
  'Thanks for your purchase',
  'Expect your secure EPUB download link at the delivery email address you entered during checkout.',
  'Square is confirming your payment.',
  'does not confirm that payment succeeded',
  'href=/contact/',
  'href=/shop/'
)) {
  Assert-Contains -Text $epubThanksOutput -Expected $requiredEpubThanksOutput -Context 'Built EPUB thanks page'
}
if ($epubThanksOutput -match '(?i)<form\b|<input\b|data-epub-checkout|order[_ -]?id|payment[_ -]?id|email has been sent') {
  throw 'Built EPUB thanks page must remain query-agnostic and avoid unverified fulfillment claims.'
}

foreach ($commercePage in @($shopOutput, $supportOutput, $thanksOutput, $epubThanksOutput)) {
  if ($commercePage -notmatch '(?i)data-goatcounter=') {
    continue
  }

  $analyticsBootstrap = [regex]::Match(
    $commercePage,
    '(?is)<script\b[^>]*>(?<body>(?:(?!</script>).)*window\.oipAnalyticsEventReferrer(?:(?!</script>).)*)</script>'
  )
  if (-not $analyticsBootstrap.Success) {
    throw 'An analytics-enabled commerce route is missing the fail-closed analytics bootstrap.'
  }

  $analyticsBody = $analyticsBootstrap.Groups['body'].Value
  if ($analyticsBody -notmatch '(?i)location\.pathname') {
    throw 'Analytics-enabled commerce routes must reduce automatic pageview paths to the current pathname.'
  }
  if ($analyticsBody -match '(?i)URLSearchParams|location\.(?:search|hash)|document\.referrer|oipAnalyticsCampaignReferrer|get_query|order[_-]?id|payment[_-]?id|customer[_-]?(?:id|email)|shipping[_-]?address') {
    throw 'Built commerce analytics must not expose query parsing, fragments, processor IDs, customer data, campaign values, or raw referrers.'
  }
}

Write-Host 'Direct-commerce storefront source and output contract passed.'
