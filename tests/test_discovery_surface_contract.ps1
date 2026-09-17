Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$mainCss = Get-Content -Path (Join-Path $repoRoot 'assets/css/main.css') -Raw

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
  'layouts/archive/list.html',
  'layouts/archive/rss.xml',
  'layouts/essays/list.html',
  'layouts/syd-and-oliver/list.html',
  'layouts/syd-and-oliver/rss.xml',
  'layouts/collections/list.html',
  'layouts/collections/single.html',
  'layouts/collections/bobs-almanack.html',
  'layouts/almanack/single.html',
  'layouts/library/list.html',
  'layouts/apps/list.html',
  'layouts/apps/single.html',
  'layouts/studio/single.html',
  'layouts/partials/home_studio_offer.html',
  'layouts/partials/archive/longform-kind.html',
  'layouts/partials/archive/lane-label.html',
  'layouts/partials/archive/resolve-pages.html',
  'layouts/partials/archive/render-list.html',
  'layouts/partials/home_front_page.html',
  'layouts/partials/home_v2_front_page.html',
  'layouts/partials/home_v2_selected.html',
  'layouts/partials/home_reader_banner.html',
  'layouts/partials/home_reader_newsletter.html',
  'layouts/partials/home_featured_image_button.html',
  'layouts/partials/home_featured_image_dialog.html',
  'assets/js/home-featured-image.js',
  'assets/js/home-reader-note.js',
  'data/homepage_metrics.yaml',
  'layouts/partials/home_bookstore_spotlight.html',
  'layouts/partials/home_selected_collections.html',
  'layouts/partials/entry_threads.html',
  'layouts/partials/home_recent_work.html',
  'layouts/partials/discovery/page-summary.html',
  'layouts/partials/discovery/page-list-item.html',
  'layouts/partials/discovery/collection-card.html',
  'layouts/partials/schema/significant-links.html',
  'layouts/partials/legacy_host_redirect.html',
  'assets/js/studio-inquiry.js',
  'content/studio/index.md',
  'content/privacy/index.md',
  'content/contribute/index.md',
  'data/studio.yaml',
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
  'content/collections/bobs-almanack.md',
  'content/collections/floods-water-built-environment.md',
  'content/collections/geopolitics-trade-global-power.md',
  'content/collections/lit-review.md',
  'content/collections/modern-bios.md',
  'content/collections/moral-religious-philosophical-essays.md',
  'content/collections/musings.md',
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
if ($indexTemplate -notmatch [regex]::Escape('partial "home_front_page.html"')) {
  throw 'Expected layouts/index.html to delegate to the homepage composition partial.'
}
foreach ($retiredSnippet in @(
  'partial "newsletter_signup.html"',
  'partial "home_bookstore_spotlight.html"',
  'partial "home_selected_collections.html"',
  'partial "home_2045_launch.html"',
  'partial "home_studio_offer.html"',
  'class="home-browse'
)) {
  if ($indexTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/index.html to omit retired homepage module: $retiredSnippet"
  }
}

$homeFrontPageTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_front_page.html') -Raw -Encoding utf8
if ($homeFrontPageTemplate -notmatch [regex]::Escape('partial "home_v2_front_page.html"')) {
  throw 'Expected home_front_page.html to delegate to the focused V2 composition.'
}

$homeSelectionTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_v2_selected.html') -Raw -Encoding utf8
$featuredRoutes = @(
  '"/essays/the-dolphin-company/"',
  '"/syd-and-oliver/what-i-had/"',
  '"/essays/default-owner/"',
  '"/essays/reverse-origami/"'
)
$previousFeaturedIndex = -1
foreach ($route in $featuredRoutes) {
  $routeIndex = $homeSelectionTemplate.IndexOf($route, [System.StringComparison]::Ordinal)
  if ($routeIndex -le $previousFeaturedIndex) {
    throw "Expected homepage featured route order to include $route after the preceding route."
  }
  $previousFeaturedIndex = $routeIndex
}
foreach ($requiredSnippet in @(
  'partial "archive/longform-kind.html"',
  '$eligible = sort (sort $eligible "Title" "asc") "PublishDate" "desc"',
  'range first 1 $eligible',
  'not (in $selectedPaths .RelPermalink)',
  'first (sub 5 (len $featured)) $fallback',
  'return $featured'
)) {
  if ($homeSelectionTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected homepage V2 selection fallback to contain: $requiredSnippet"
  }
}

$homeV2Template = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_v2_front_page.html') -Raw -Encoding utf8
$homeReaderBanner = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_reader_banner.html') -Raw -Encoding utf8
$homeReaderNewsletter = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_reader_newsletter.html') -Raw -Encoding utf8
$homeImageButton = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_featured_image_button.html') -Raw -Encoding utf8
$homeImageDialog = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_featured_image_dialog.html') -Raw -Encoding utf8
foreach ($requiredSnippet in @(
  'eq $page.RelPermalink "/essays/the-dolphin-company/"',
  '$sectionLabel = "Case study"',
  'home-v2-featured__item--illustrated',
  'class="home-v2-featured__item-media" href="{{ $page.RelPermalink }}"',
  'class="home-v2-featured__item-copy"',
  '"loading" "lazy"',
  '"sizes" "120px"',
  'partial "home_featured_image_button.html"',
  'partial "home_featured_image_dialog.html"',
  'resources.Get "js/home-featured-image.js" | minify | fingerprint "sha384"'
)) {
  if (-not $homeV2Template.Contains($requiredSnippet, [System.StringComparison]::Ordinal)) {
    throw "Expected homepage supporting illustrations and labels to contain: $requiredSnippet"
  }
}
$dolphinSource = Get-Content -Path (Join-Path $repoRoot 'content/essays/the-dolphin-company.md') -Raw -Encoding utf8
if ($dolphinSource -notmatch '(?m)^section_label: "Essay"\r?$') {
  throw 'Expected the homepage-only Case study label to preserve the Dolphin Company canonical Essay classification.'
}
if ($homeImageButton -notmatch '(?s)<button\b[^>]*type="button"[^>]*data-home-featured-image-trigger[^>]*aria-haspopup="dialog"[^>]*aria-controls="home-featured-image-dialog" hidden>' -or
    $homeImageButton -notmatch '(?s)<a\b[^>]*data-home-featured-image-fallback[^>]*href="\{\{ \$model.lightbox_url \}\}"[^>]*>Image</a>') {
  throw 'Expected a native mobile image button, initially hidden, and a working image-link fallback without JavaScript.'
}
if ($homeImageDialog -notmatch '<dialog id="home-featured-image-dialog"[^>]*aria-labelledby="home-featured-image-title"' -or
    $homeImageDialog -notmatch '<button\b[^>]*data-home-featured-image-close[^>]*aria-label="Close illustration"') {
  throw 'Expected one labelled native image dialog with an image click-to-close control.'
}
if ($mainCss -notmatch '(?s)\.home-v2-featured__item-media\{[^}]*aspect-ratio:1;' -or
    $mainCss -notmatch '(?s)@media \(max-width:768px\)\{\s*\.home-v2-featured__item--illustrated\{[^}]*display:block;[^}]*\}\s*\.home-v2-featured__item-media\{[^}]*display:none;[^}]*\}\s*\.home-v2-featured__image-toggle:not\(\[hidden\]\)\{[^}]*display:inline-flex;') {
  throw 'Expected supporting square illustrations on desktop and compact image controls through 768px.'
}
foreach ($requiredSnippet in @(
  '<section class="home-reader-banner page-shell page-shell--wide" aria-label="Outside In Print at a glance">',
  'hugo.Data.homepage_metrics',
  '<strong>Weekly</strong>',
  '<span>Newsletter</span>'
)) {
  if ($homeReaderBanner -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected homepage stats banner to contain: $requiredSnippet"
  }
}
if ($homeReaderBanner -match '<form\b|home-reader-banner__signup|home-reader-email|homepage_reader_banner') {
  throw 'Expected the homepage stats banner to contain no signup form, email field, or signup analytics.'
}
foreach ($requiredSnippet in @(
  '<section class="home-reader-banner home-reader-newsletter page-shell page-shell--wide" aria-labelledby="home-reader-banner-title">',
  'From the imprint',
  'Independent writing on history, economics, culture, and public life.',
  'One thoughtful letter each week.',
  'No spam ever. Unsubscribe anytime.',
  'Join the newsletter',
  'class="home-reader-banner__form"',
  'action="https://buttondown.com/api/emails/embed-subscribe/{{ $buttondownUsername }}"',
  'method="post"',
  'data-analytics-event="newsletter_submit"',
  'data-analytics-source-slot="homepage_reader_banner"',
  '<label for="home-reader-email">Email address</label>',
  'name="email"',
  '<input type="hidden" name="embed" value="1">',
  '<input type="hidden" name="tag" value="{{ . }}">',
  '<a href="{{ "privacy/" | relURL }}">Privacy details</a>',
  'eq $provider "buttondown"'
)) {
  if ($homeReaderNewsletter -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected homepage newsletter partial to contain: $requiredSnippet"
  }
}
foreach ($singlePattern in @('<form\b', 'id="home-reader-banner-title"', 'id="home-reader-email"')) {
  if ([regex]::Matches($homeReaderNewsletter, $singlePattern).Count -ne 1) {
    throw "Expected one homepage newsletter form and one of each retained ID: $singlePattern"
  }
}
if ($homeReaderNewsletter -match 'home-reader-banner__proof') {
  throw 'Expected the separate homepage newsletter partial to omit the opening proof strip.'
}
foreach ($partial in @('home_reader_banner.html', 'home_reader_newsletter.html')) {
  if ([regex]::Matches($homeV2Template, [regex]::Escape('partial "' + $partial + '"')).Count -ne 1) {
    throw "Expected exactly one homepage invocation of $partial."
  }
}
if ($homeV2Template -match '<form\b') {
  throw 'Expected the homepage newsletter form to remain owned by its single signup partial.'
}
foreach ($requiredSnippet in @(
  '<h1 id="home-front-page-title" class="title visually-hidden">{{ site.Title }}</h1>',
  'partial "home_reader_banner.html"',
  'A note to the reader',
  '<h2 id="home-v2-featured-title">Featured Articles</h2>',
  'homepage_v2_featured_lead',
  'homepage_v2_featured_supporting',
  'hugo.Data.homepage_metrics',
  'The latest publication, reader favorites, and defining work.',
  'Read the piece',
  'Browse the library',
  'Surprise me',
  '<section class="home-v2-next page-shell page-shell--wide" aria-label="Publish with us">',
  'Become a contributor'
)) {
  if ($homeV2Template -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected focused homepage composition to contain: $requiredSnippet"
  }
}

$homeLibraryNavigation = [regex]::Matches($homeV2Template, '(?s)<nav class="home-v2-library home-v2-next__links page-shell page-shell--wide" aria-label="Keep reading">(?<links>.*?)</nav>')
if ($homeLibraryNavigation.Count -ne 1) {
  throw 'Expected one standalone Keep reading navigation with the shared wide page shell.'
}
$homeLibraryLinks = $homeLibraryNavigation[0].Groups['links'].Value
$expectedHomeLibraryLinks = @(
  '<a href="{{ "library/" | relURL }}">Browse the library</a>',
  '<a href="{{ "random/" | relURL }}">Surprise me</a>'
)
foreach ($expectedLink in $expectedHomeLibraryLinks) {
  if ([regex]::Matches($homeLibraryLinks, [regex]::Escape($expectedLink)).Count -ne 1) {
    throw "Expected the homepage library navigation to contain exactly one canonical link: $expectedLink"
  }
  $homeLibraryLinks = $homeLibraryLinks.Replace($expectedLink, '')
}
if (-not [string]::IsNullOrWhiteSpace($homeLibraryLinks)) {
  throw 'Expected the homepage library navigation to contain only its two reading links, without a heading or description.'
}

$homeContribution = [regex]::Match($homeV2Template, '(?s)<section class="home-v2-next page-shell page-shell--wide" aria-label="Publish with us">(?<body>.*?)</section>')
if (-not $homeContribution.Success -or [regex]::Matches($homeContribution.Groups['body'].Value, '<article\b').Count -ne 1 -or $homeContribution.Groups['body'].Value -notmatch [regex]::Escape('class="home-v2-next__contribute"')) {
  throw 'Expected Publish with us to contain only the contributor article.'
}

$expectedHomeReaderNote = 'However you found this site—through a search, a shared link, or a single essay—you are welcome here. Outside In Print is for readers tired of being hurried from clip to clip and headline to headline. Step outside the feed, stay with an idea, ask for the evidence, and make up your own mind. Read whatever catches your eye. Follow a question farther than the algorithm would. Come back when you want something worth your attention.'
$homeReaderNoteMatches = [regex]::Matches($homeV2Template, '(?s)<p class="home-front-page__welcome-copy">(?<copy>.*?)</p>')
if ($homeReaderNoteMatches.Count -ne 1 -or ([regex]::Replace($homeReaderNoteMatches[0].Groups['copy'].Value, '<[^>]+>', '').Trim()) -cne $expectedHomeReaderNote) {
  throw 'Expected the focused homepage composition to keep the full reader note in one home-front-page__welcome-copy paragraph.'
}

$homeReaderLinks = '<p class="home-front-page__welcome-links"><a href="{{ "about/" | relURL }}">About the imprint</a><a href="{{ "authors/robert-v-ussley/" | relURL }}">About the author</a></p>'
if (-not $homeV2Template.Contains($homeReaderLinks, [System.StringComparison]::Ordinal)) {
  throw 'Expected the reader note links to show About the imprint first and About the author second, with their canonical destinations.'
}
if ($homeV2Template -match '(?s)<p class="home-front-page__welcome-links">.*?Start reading.*?</p>') {
  throw 'Expected the reader note links to replace Start reading with About the author.'
}

if ($homeV2Template -match 'Medium reads') {
  throw 'Expected featured reader badges to omit the Medium label.'
}

$homepageOrder = @(
  'partial "home_reader_banner.html"',
  'class="home-front-page__orientation"',
  'class="home-v2-featured',
  'class="home-v2-library ',
  'partial "home_reader_newsletter.html"',
  'class="home-v2-next '
)
$lastIndex = -1
foreach ($snippet in $homepageOrder) {
  $currentIndex = $homeV2Template.IndexOf($snippet, [System.StringComparison]::Ordinal)
  if ($currentIndex -le $lastIndex) {
    throw "Expected focused homepage document order to preserve: $snippet"
  }
  $lastIndex = $currentIndex
}

foreach ($retiredSnippet in @(
  'home_bookstore',
  'home-almanack',
  'home_selected_collections',
  'home_2045_launch',
  'Bob''s Almanack',
  'newsletter-signup--home-ribbon',
  'home_imprint_statement.html',
  'home-manifesto',
  'home-v2-next__browse',
  'The full imprint',
  'Find your next question',
  'Browse the archive',
  'Search the library',
  '"archive/" | relURL',
  'Ask for the evidence. Read past the headlines. Think for yourself.'
)) {
  if ($homeV2Template -match [regex]::Escape($retiredSnippet)) {
    throw "Expected focused homepage composition to omit retired module: $retiredSnippet"
  }
}

$contributorContent = Get-Content -Path (Join-Path $repoRoot 'content/contribute/index.md') -Raw -Encoding utf8
foreach ($requiredSnippet in @(
  'title: "Write for Outside In Print"',
  'original essays and reported articles',
  '## What Fits',
  '## Start With a Pitch',
  'support@outsideinprint.org',
  'Sending a pitch does not guarantee publication.'
)) {
  if ($contributorContent -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected contributor route content to contain: $requiredSnippet"
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
  'https://outsideinprint.org/archive/',
  'https://outsideinprint.org/collections/syd-and-oliver-dialogues/',
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
  'https://outsideinprint.org/collections/syd-and-oliver-dialogues/',
  'https://outsideinprint.org/syd-and-oliver/index.xml',
  'https://outsideinprint.org/about/',
  'https://outsideinprint.org/authors/robert-v-ussley/',
  'Legacy GitHub Pages URLs are not canonical.'
)) {
  if ($llmsFull -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected static/llms-full.txt to contain discovery guidance snippet: $requiredSnippet"
  }
}

foreach ($llmsDocument in @($llms, $llmsFull)) {
  if ($llmsDocument -match '(?m)^- Syd and Oliver Dialogues:\s+https://outsideinprint\.org/syd-and-oliver/\s*$') {
    throw 'Expected LLM discovery documents not to advertise the noindex Syd compatibility hub.'
  }
}

$homeReaderBannerCssChecks = @(
  '.home-reader-banner__proof{',
  '.home-v2-featured__grid{',
  '.home-v2-library.home-v2-next__links{',
  '.home-v2-next{',
  '.home-v2-next__cta{'
)
foreach ($selector in $homeReaderBannerCssChecks) {
  if ($mainCss -notmatch [regex]::Escape($selector)) {
    throw "Expected assets/css/main.css to own the focused homepage selector: $selector"
  }
}

$homeReaderBannerWideOverrideCss = [regex]::Match($mainCss, '(?s)\.home-reader-banner\.page-shell--wide\{(?<rules>.*?)\}')
if (-not $homeReaderBannerWideOverrideCss.Success -or $homeReaderBannerWideOverrideCss.Groups['rules'].Value -notmatch [regex]::Escape('max-width:70rem;')) {
  throw 'Expected the home-reader-banner page-shell--wide override to align the separate stats and newsletter regions at 70rem.'
}

$homeV2ContentWidthCss = [regex]::Match($mainCss, '(?s)\.home-v2-featured\.page-shell--wide,\s*\.home-v2-library\.page-shell--wide,\s*\.home-v2-next\.page-shell--wide\{(?<rules>.*?)\}')
if (-not $homeV2ContentWidthCss.Success -or $homeV2ContentWidthCss.Groups['rules'].Value -notmatch [regex]::Escape('max-width:70rem;')) {
  throw 'Expected Featured Articles, library navigation, and contribution to share the stats, newsletter, and reader-note 70rem width.'
}

$homeContributionCss = [regex]::Match($mainCss, '(?s)\.home-v2-next\{(?<rules>.*?)\}')
if (-not $homeContributionCss.Success -or $homeContributionCss.Groups['rules'].Value -match 'display\s*:\s*grid|grid-template-columns\s*:') {
  throw 'Expected the homepage contribution region to use one natural block column rather than the retired two-column grid.'
}
$homeContributionArticleCss = [regex]::Match($mainCss, '(?s)\.home-v2-next__contribute\{(?<rules>.*?)\}')
if (-not $homeContributionArticleCss.Success -or $homeContributionArticleCss.Groups['rules'].Value -match 'border-left\s*:') {
  throw 'Expected the homepage contributor article to omit its retired left border.'
}
if ($mainCss -notmatch '(?s)\.home-v2-next__links a,\s*\.home-v2-next__cta\{[^}]*min-height:44px;') {
  throw 'Expected the library links and contribution control to retain 44px interaction targets.'
}

$homeOrientationCss = [regex]::Match($mainCss, '(?s)\.home-front-page__orientation\{(?<rules>.*?)\}')
if (-not $homeOrientationCss.Success) {
  throw 'Expected assets/css/main.css to style the compact homepage reader note.'
}
foreach ($requiredRule in @(
  'display:grid;',
  'grid-template-columns:minmax(0, 1fr);',
  'grid-template-areas:',
  '"label"',
  '"copy"',
  '"links";',
  'gap:.12rem 1.5rem;',
  'max-width:70rem;',
  'margin:0 auto 1rem;',
  'padding:0 0 .7rem;'
)) {
  if ($homeOrientationCss.Groups['rules'].Value -notmatch [regex]::Escape($requiredRule)) {
    throw "Expected the compact homepage reader note CSS to contain: $requiredRule"
  }
}
if ($homeOrientationCss.Groups['rules'].Value -match [regex]::Escape('max-width:52rem;')) {
  throw 'Expected the compact homepage reader note to use the 70rem orientation width instead of the retired 52rem measure.'
}

$homeWelcomeCopyCss = [regex]::Match($mainCss, '(?s)\.home-front-page__welcome-copy\{(?<rules>.*?)\}')
if (-not $homeWelcomeCopyCss.Success) {
  throw 'Expected assets/css/main.css to style the compact homepage reader-note copy.'
}
foreach ($requiredRule in @('margin:0;', 'font-size:.94rem;', 'line-height:1.42;')) {
  if ($homeWelcomeCopyCss.Groups['rules'].Value -notmatch [regex]::Escape($requiredRule)) {
    throw "Expected the compact homepage reader-note type CSS to contain: $requiredRule"
  }
}

$homeStudioTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_studio_offer.html') -Raw
foreach ($requiredSnippet in @(
  'hugo.Data.studio',
  'if $enabled',
  'founding_offer_active',
  'You have the material. I make it publishable.',
  'data-analytics-source-slot="homepage_studio_offer"',
  'data-analytics-path="{{ "studio/" | relURL }}"'
)) {
  if ($homeStudioTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/home_studio_offer.html to contain: $requiredSnippet"
  }
}

$studioData = Get-Content -Path (Join-Path $repoRoot 'data/studio.yaml') -Raw
foreach ($requiredSnippet in @(
  'offer_code: "OIP-STUDIO-EXPERT-ESSAY"',
  'founding_price_display: "$1,250"',
  'standard_price_display: "$1,500"',
  'deposit_percent: 50',
  'turnaround_business_days: 7',
  'recording_limit_minutes: 90',
  'transcript_limit_words: 15000',
  'source_packet_limit_pages: 25',
  'output_word_minimum: 1500',
  'output_word_maximum: 2000',
  'email: "support@outsideinprint.org"',
  'subject_prefix: "Outside In Print Studio Inquiry"'
)) {
  if ($studioData -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected data/studio.yaml to contain: $requiredSnippet"
  }
}

if ($studioData -notmatch '(?m)^\s*founding_offer_active:\s*(?:true|false)\s*$') {
  throw 'Expected data/studio.yaml to expose a boolean pricing.founding_offer_active switch.'
}

$studioTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/studio/single.html') -Raw
$privacyPolicy = Get-Content -Path (Join-Path $repoRoot 'content/privacy/index.md') -Raw
$studioTerms = Get-Content -Path (Join-Path $repoRoot 'content/terms/index.md') -Raw
foreach ($requiredSnippet in @(
  'errorf "Studio inquiry configuration requires inquiry.email',
  'errorf "Studio inquiry configuration requires inquiry.subject_prefix',
  '$composerEnabled := and $enabled $inquiryEnabled',
  'action="/studio/#studio-inquiry"',
  'method="post"',
  'data-studio-email-form',
  'data-inquiry-email="{{ $email }}"',
  'data-inquiry-subject-prefix="{{ $subjectPrefix }}"',
  'data-current-rate="{{ $activePrice }}"',
  'data-deposit-percent="{{ $depositPercent }}"',
  'data-offer-code="{{ $offerCode }}"',
  'data-source-page="{{ $sourcePage }}"',
  'data-analytics-event="studio_inquiry_email_prepare"',
  'data-analytics-source-slot="studio_inquiry_form"',
  'data-analytics-slug="studio"',
  'You have the material. I make it ready to publish.',
  'Fixed scope <span aria-hidden="true">&middot;</span> First draft in {{ $turnaroundDays }} business days <span aria-hidden="true">&middot;</span> One revision',
  'The {{ $turnaroundDays }}-business-day clock starts after three things happen: you approve the written scope, pay the deposit, and send all agreed source material.',
  'A standard visual layout and image treatment tailored to your preferences',
  'class="studio-operator"',
  'Your writer and editor',
  'I handle each Publication Sprint directly',
  'Robert V. Ussley',
  ', the writer and editor behind Outside In Print. I handle each Publication Sprint directly and produce reported essays and literary analysis on risk, institutions, technology, and public life.',
  "These are examples of my own editorial work, not client testimonials. Their visuals represent the standard deliverable and can be tailored to the client’s preferences.",
  'Outside In Print may publish it at your request, with your written approval, but publication is not guaranteed.',
  'After full payment, you receive the complete finished file set and own the finished work exclusively. Outside In Print retains no publication right unless you give written permission.',
  'This form does not send your answers to Outside In Print or site analytics. When you select “Prepare inquiry email,” your answers go to your email app or provider to make a draft. That app or provider may save or sync the draft under its own privacy rules. Outside In Print gets your answers only if you send the email and it reaches {{ $email }}.',
  'name="role"',
  'name="source_material"',
  'name="source_size"',
  'name="intended_reader"',
  'name="timeline"',
  'name="source_safety_acknowledgement"',
  'name="commercial_acknowledgement"',
  'Source size:\r\n',
  'Intended reader:\r\n',
  'Safety reminder: Do not attach or paste confidential, classified, privileged, export-controlled, or restricted source material. Wait for Outside In Print to tell you what it can accept and how to send it.',
  'type="submit" disabled>Prepare inquiry email',
  'role="status" aria-live="polite"',
  'data-analytics-event="studio_inquiry_direct_email"',
  'data-analytics-source-slot="studio_inquiry_fallback"',
  'href="/privacy/">Privacy Policy',
  'resources.Get "js/studio-inquiry.js" | resources.Minify | resources.Fingerprint'
)) {
  if ($studioTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/studio/single.html to contain: $requiredSnippet"
  }
}

$studioSectionOrder = @([regex]::Matches($studioTemplate, 'data-studio-section="([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
if (($studioSectionOrder -join ',') -cne 'offer,scope,proof,details,inquiry') {
  throw 'Expected Studio to contain exactly five offer, scope, proof, details, and inquiry sections in order.'
}
$studioDisclosures = @([regex]::Matches($studioTemplate, '(?s)<details\b(?<attributes>[^>]*)>.*?<summary[^>]*>(?<label>[^<]+)</summary>.*?</details>'))
if ((@($studioDisclosures | ForEach-Object { $_.Groups['label'].Value }) -join ',') -cne 'Source limits and exclusions,How the sprint works,Common questions') {
  throw 'Expected three approved native Studio disclosures in order.'
}
foreach ($studioDisclosure in $studioDisclosures) {
  if ($studioDisclosure.Groups['attributes'].Value -match '\bopen(?:\s|=|$)' -or $studioDisclosure.Value -match '<form\b|<fieldset\b|name="(?:commercial|source_safety)_acknowledgement"') {
    throw 'Expected secondary Studio details to start closed and never contain inquiry fields or acknowledgments.'
  }
}
$studioLegends = @([regex]::Matches($studioTemplate, '<legend[^>]*>([^<]+)</legend>') | ForEach-Object { $_.Groups[1].Value })
if (($studioLegends -join ',') -cne 'About you,Source material,Your essay') {
  throw 'Expected three Studio form fieldsets with meaningful legends.'
}
foreach ($requiredSnippet in @(
  'I turn one recording, transcript, presentation, draft, or source packet into a clear, {{ lang.FormatNumber 0 $outputMinimum }}–{{ lang.FormatNumber 0 $outputMaximum }}-word essay in your voice, with your byline.',
  "You’ll work directly with <a href=`"/authors/robert-v-ussley/`">Robert V. Ussley</a>.",
  '>Discuss your project</a>',
  'Tell me about your project. This form prepares an email draft; you review and send it yourself.',
  'I will reply within {{ $replyDays }} business days after I receive your email',
  'I review each project and agree on the written scope with you before you pay.'
)) {
  if (-not $studioTemplate.Contains($requiredSnippet)) {
    throw "Expected the streamlined Studio offer to contain: $requiredSnippet"
  }
}
if ([regex]::Matches($studioTemplate, 'href="#studio-inquiry"').Count -ne 1) {
  throw 'Expected one primary Studio hero-to-inquiry CTA without a duplicate conversion block.'
}
if ($studioTemplate -match 'studio-problem|studio-conversion|studio-pricing__panel|studio-proof__card|studio-cta--secondary') {
  throw 'Expected the Studio template to omit retired panels and competing calls to action.'
}

foreach ($obsoletePublicationClaim in @(
  'We give you a complete finished file set. Outside In Print reserves the right to publish the essay on outsideinprint.org.',
  'Outside In Print keeps the right to publish the finished essay on outsideinprint.org.',
  'Outside In Print publishes it only if you ask us to and approve publication.'
)) {
  if ($studioTemplate.IndexOf($obsoletePublicationClaim, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
    throw "Expected the Studio template to remove obsolete automatic publication-right claim: $obsoletePublicationClaim"
  }
}
if ($studioTemplate -match '(?i)publication is guaranteed|guarantee(?:d|s)? publication') {
  throw 'Expected the Studio template not to guarantee publication.'
}

$requiredStudioTermsText = "After full payment, the client owns the finished deliverable exclusively. Pre-existing client materials and identified third-party materials are not included in that transfer. Outside In Print may publish the finished work only with the client’s written permission."
if ($studioTerms -notmatch '(?m)^effective_date: "September 3, 2026"$') {
  throw 'Expected the Studio Terms effective date to match the September 3, 2026 ownership revision.'
}
if ($studioTerms.IndexOf($requiredStudioTermsText, [System.StringComparison]::Ordinal) -lt 0) {
  throw 'Expected the Studio Terms to grant exclusive ownership after payment and require written permission for Outside In Print publication.'
}
if ($studioTerms -match '(?i)reserves the right to publish|keeps the right to publish') {
  throw 'Expected the Studio Terms to omit obsolete automatic publication-right language.'
}

foreach ($field in @(
  @{ Name = 'name'; MaxLength = 100 },
  @{ Name = 'email'; MaxLength = 254 },
  @{ Name = 'website'; MaxLength = 300 },
  @{ Name = 'source_size'; MaxLength = 80 },
  @{ Name = 'intended_reader'; MaxLength = 160 },
  @{ Name = 'project_subject'; MaxLength = 160 },
  @{ Name = 'desired_outcome'; MaxLength = 800 }
)) {
  $pattern = '(?s)name="{0}"[^>]*maxlength="{1}"' -f [regex]::Escape($field.Name), $field.MaxLength
  if ($studioTemplate -notmatch $pattern) {
    throw "Expected Studio field '$($field.Name)' to use maxlength '$($field.MaxLength)'."
  }
}

if ($studioTemplate -notmatch 'name="source_size" type="text" maxlength="80"[^>]* required>') {
  throw "Expected Studio field 'source_size' to be a required text input with maxlength '80'."
}

if ($studioTemplate -notmatch 'name="intended_reader" type="text" maxlength="160" required>') {
  throw "Expected Studio field 'intended_reader' to be a required text input with maxlength '160'."
}

if ($studioTemplate -notmatch 'name="source_safety_acknowledgement" type="checkbox" value="acknowledged" required>') {
  throw "Expected Studio field 'source_safety_acknowledgement' to be a required acknowledged checkbox."
}

$previousStudioFieldIndex = -1
foreach ($orderedFieldSnippet in @(
  'name="source_material"',
  'name="source_size"',
  'name="intended_reader"',
  'name="project_subject"'
)) {
  $currentStudioFieldIndex = $studioTemplate.IndexOf($orderedFieldSnippet, [System.StringComparison]::Ordinal)
  if ($currentStudioFieldIndex -le $previousStudioFieldIndex) {
    throw "Expected Studio qualification field order to include '$orderedFieldSnippet' after the preceding field."
  }
  $previousStudioFieldIndex = $currentStudioFieldIndex
}

if ($studioTemplate -match 'Your answers remain on your device until you open and send') {
  throw 'Expected the Studio template to remove the obsolete on-device-until-send privacy claim.'
}

$fallbackBodyMatch = [regex]::Match($studioTemplate, '\$fallbackBody := printf "(?<body>[^"]+)"')
if (-not $fallbackBodyMatch.Success) {
  throw 'Expected the Studio template to define a direct-email fallback body.'
}
if ($fallbackBodyMatch.Groups['body'].Value -match 'I have not attached') {
  throw 'Expected the direct-email fallback to use a non-assertive safety reminder.'
}
$fallbackBodySource = $fallbackBodyMatch.Groups['body'].Value
if ($fallbackBodySource -match '(?i)acknowledged') {
  throw 'Expected the direct-email fallback not to claim an unchecked commercial acknowledgment.'
}
if ($fallbackBodySource -notmatch [regex]::Escape('Current base rate: %s. A %d%% deposit is required to book the project.')) {
  throw 'Expected the direct-email fallback to state the current rate and deposit without claiming acknowledgment.'
}
$previousFallbackPromptIndex = -1
foreach ($orderedFallbackPrompt in @('Source material:', 'Source size:', 'Intended reader:', 'Proposed essay:')) {
  $currentFallbackPromptIndex = $fallbackBodySource.IndexOf($orderedFallbackPrompt, [System.StringComparison]::Ordinal)
  if ($currentFallbackPromptIndex -le $previousFallbackPromptIndex) {
    throw "Expected direct-email fallback prompt order to include '$orderedFallbackPrompt' after the preceding prompt."
  }
  $previousFallbackPromptIndex = $currentFallbackPromptIndex
}
if ($fallbackBodySource -match '(?:Offer code|Source page):') {
  throw 'Expected the direct-email fallback not to expose removed internal offer-code or source-page fields.'
}

$requiredPrivacyPolicyText = 'When you enter information in the Studio inquiry form, the form does not send the inquiry-field contents to Outside In Print, a hosted form provider, or site analytics. Selecting “Prepare inquiry email” passes those contents to your configured email application or provider through a `mailto:` draft; that application or provider may store or sync the draft under its own privacy practices. Outside In Print receives the information only if you send the message and it reaches `support@outsideinprint.org`.'
if ($privacyPolicy.IndexOf($requiredPrivacyPolicyText, [System.StringComparison]::Ordinal) -lt 0) {
  throw 'Expected the Privacy Policy to describe mailto draft handoff, provider storage or sync, and receipt only after delivery.'
}
foreach ($obsoletePrivacyClaim in @(
  'remains in your browser',
  'preparing the draft does not transmit',
  'The information is transmitted only when you send'
)) {
  if ($privacyPolicy.IndexOf($obsoletePrivacyClaim, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
    throw "Expected the Privacy Policy to remove obsolete claim: $obsoletePrivacyClaim"
  }
}

if ($studioTemplate -match 'type="file"') {
  throw 'Expected the Studio inquiry form not to expose a file input.'
}

if ($studioTemplate -notmatch '(?s)\{\{-?\s*if \$composerEnabled\s*-?\}\}(?:(?!\{\{-?\s*end).)*?<form.*?data-studio-email-form.*?</form>\s*\{\{-?\s*end\s*-?\}\}\s*<p id="studio-inquiry-direct-email" class="studio-form__fallback">') {
  throw 'Expected inquiry.enabled=false to omit the guided form while preserving the direct-email fallback.'
}

if ($studioTemplate -notmatch '(?s)\{\{-?\s*if \$composerEnabled\s*-?\}\}(?:(?!\{\{-?\s*end).)*?resources\.Get "js/studio-inquiry\.js".*?<script defer.*?</script>\s*\{\{-?\s*end\s*-?\}\}') {
  throw 'Expected inquiry.enabled=false to omit the Studio composer script.'
}

$studioScript = Get-Content -Path (Join-Path $repoRoot 'assets/js/studio-inquiry.js') -Raw
foreach ($requiredSnippet in @(
  'new FormData(form)',
  '"mailto:" + recipient',
  'encodeURIComponent(subject)',
  'encodeURIComponent(body)',
  'event.preventDefault()',
  'window.location.href = mailtoUri',
  '.join("\n").replace(/\n/g, "\r\n")',
  '\u007F-\u009F',
  '"Source size: " + value(data, "source_size")',
  '"Intended reader: " + value(data, "intended_reader")',
  'clean(form.dataset.depositPercent).length > 0',
  '"Price acknowledgment: I understand that the current rate is " + clean(form.dataset.currentRate) + ". A " + clean(form.dataset.depositPercent) + "% deposit is required to book the project."',
  '"Safety acknowledgment: I have not attached or pasted confidential, classified, privileged, export-controlled, or restricted source material. I will wait for Outside In Print to ask for source files and tell me what it can accept and how to send it."',
  'I will receive your inquiry only if you send the email and it reaches me.'
)) {
  if ($studioScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected assets/js/studio-inquiry.js to contain: $requiredSnippet"
  }
}

$previousGuidedBodyIndex = -1
foreach ($orderedGuidedBodySnippet in @(
  '"Source material: " + value(data, "source_material")',
  '"Source size: " + value(data, "source_size")',
  '"Intended reader: " + value(data, "intended_reader")',
  '"Proposed essay: " + value(data, "project_subject")'
)) {
  $currentGuidedBodyIndex = $studioScript.IndexOf($orderedGuidedBodySnippet, [System.StringComparison]::Ordinal)
  if ($currentGuidedBodyIndex -le $previousGuidedBodyIndex) {
    throw "Expected guided-email field order to include '$orderedGuidedBodySnippet' after the preceding field."
  }
  $previousGuidedBodyIndex = $currentGuidedBodyIndex
}

if ($studioScript -match '"(?:Offer code|Source page): "') {
  throw 'Expected the guided email not to expose removed internal offer-code or source-page fields.'
}

$listenerIndex = $studioScript.IndexOf('form.addEventListener("submit", prepareInquiry)', [System.StringComparison]::Ordinal)
$enableIndex = $studioScript.IndexOf('submitButton.disabled = false', [System.StringComparison]::Ordinal)
if ($listenerIndex -lt 0 -or $enableIndex -le $listenerIndex) {
  throw 'Expected the Studio script to attach its submit listener before enabling the submit button.'
}

if ($studioScript -match 'fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|document\.cookie|localStorage|sessionStorage|navigator\.clipboard') {
  throw 'Expected the Studio script to avoid network, cookie, storage, and clipboard APIs.'
}

if ($studioScript -match '(?i)delivery confirmed|successfully sent|inquiry received') {
  throw 'Expected the Studio script not to claim delivery or receipt.'
}

if ($mainCss -notmatch '(?s)\.home-reader-banner__proof\{[^}]*grid-template-columns:repeat\(3, minmax\(0, 1fr\)\);') {
  throw 'Expected the homepage proof strip to retain three compact proof cells.'
}
if ($mainCss -notmatch '(?s)\.home-v2-featured__grid\{[^}]*grid-template-columns:minmax\(0, 1\.45fr\) minmax\(18rem, \.8fr\);') {
  throw 'Expected the featured-reading surface to use a lead-and-supporting desktop grid.'
}
if ($mainCss -notmatch '(?s)@media \(max-width:900px\)\{.*?\.home-v2-featured__grid\{[^}]*grid-template-columns:1fr;') {
  throw 'Expected the featured-reading grid to collapse at 900px.'
}
if ($mainCss -notmatch '(?s)@media \(max-width:520px\)\{.*?\.home-v2-featured__supporting\{\s*display:block;') {
  throw 'Expected supporting featured stories to stack at 520px.'
}
if ($mainCss -notmatch '(?s)@media \(max-width:520px\)\{.*?\.home-reader-banner\{[^}]*width:calc\(100% - \.75rem\);[^}]*margin-bottom:1\.15rem;') {
  throw 'Expected the mobile homepage reader banner to use the compact inset footprint.'
}
if ($mainCss -notmatch '(?s)@media \(max-width:520px\)\{.*?\.home-reader-banner__controls\{[^}]*grid-template-columns:minmax\(0, 1fr\) auto;') {
  throw 'Expected the newsletter controls to remain on one compact row on standard mobile widths.'
}
if ($mainCss -notmatch '(?s)@media \(max-width:360px\)\{.*?\.home-reader-banner__controls\{\s*grid-template-columns:1fr;') {
  throw 'Expected the newsletter controls to stack only on the narrowest supported mobile width.'
}
$significantLinksTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/significant-links.html') -Raw
if ($significantLinksTemplate -notmatch [regex]::Escape('"/shop"')) {
  throw 'Expected homepage significant links to include /shop.'
}

$checkoutActionsPath = Join-Path $repoRoot 'layouts/partials/shop/checkout-actions.html'
if (Test-Path -LiteralPath $checkoutActionsPath) {
  throw 'Expected the unused legacy checkout-actions partial to be removed.'
}

$kindleButtonTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/shop/kindle-button.html') -Raw
foreach ($requiredSnippet in @(
  '.sourceSlot | default "bookstore_kindle"',
  'index $product "kindle_url"',
  'index $product "kindle_label"',
  'class="bookstore-kindle-button{{ if $promoteKindle }} bookstore-kindle-button--available-primary{{ end }}"',
  'data-bookstore-kindle-button',
  'data-bookstore-kindle-role="{{ cond $promoteKindle "primary-available" "secondary" }}"',
  'data-analytics-source-slot="{{ $sourceSlot }}"',
  'data-analytics-path="{{ . }}"'
)) {
  if ($kindleButtonTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/shop/kindle-button.html to preserve status-aware Kindle analytics: $requiredSnippet"
  }
}

$shopListTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/shop/list.html') -Raw
$shopSingleTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/shop/single.html') -Raw
if ($kindleButtonTemplate -match 'data-analytics-event') {
  throw 'Expected Kindle Amazon exits to rely on automatic external_link_click tracking without data-analytics-event.'
}

foreach ($requiredSlot in @('bookstore_index_direct', 'bookstore_index_kindle')) {
  if ($shopListTemplate -notmatch [regex]::Escape($requiredSlot)) {
    throw "Expected layouts/shop/list.html to include analytics source slot: $requiredSlot"
  }
}

$analyticsScript = Get-Content -Path (Join-Path $repoRoot 'assets/js/analytics.js') -Raw
foreach ($requiredSnippet in @(
  'if (isExternalLink(url))',
  'track("external_link_click", mergeProps(datasetProps(anchor), currentPageProps()))'
)) {
  if ($analyticsScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected assets/js/analytics.js to preserve automatic external-link tracking: $requiredSnippet"
  }
}

foreach ($requiredSlot in @('bookstore_detail_direct', 'bookstore_detail_kindle')) {
  if ($shopSingleTemplate -notmatch [regex]::Escape($requiredSlot)) {
    throw "Expected layouts/shop/single.html to include analytics source slot: $requiredSlot"
  }
}

$publicCollectionEntriesPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/collections/get-public-entries.html') -Raw
foreach ($requiredSnippet in @(
  '{{ $page := site.GetPage (printf "/collections/%s" .slug) }}',
  '{{ if and $state.visible $page }}'
)) {
  if ($publicCollectionEntriesPartial -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/collections/get-public-entries.html to require a rendered collection page before emitting a public entry: $requiredSnippet"
  }
}

$entryThreadsPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/entry_threads.html') -Raw
foreach ($requiredSnippet in @(
  '"floods-water-built-environment"',
  '"modern-bios"',
  '"moral-religious-philosophical-essays"',
  'homepage_entry_thread_start',
  'homepage_entry_thread_collection',
  'aria-label="Selected collections"',
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
  'Start Reading',
  'Check out the collections below.',
  'showArchiveLink'
)) {
  if ($entryThreadsPartial -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/partials/entry_threads.html not to depend on featured collection state: $retiredSnippet"
  }
}

$collectionsListTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/collections/list.html') -Raw
foreach ($requiredSnippet in @(
  '{{ len $entries }} public collections &middot; {{ $totalPieces }} published pieces',
  'section-front section-front--collections',
  'section-front__header',
  'page-header--section-centered',
  'partial "discovery/collection-card.html"',
  'collections-broadsheet',
  'collections-broadsheet__summary',
  'collections-broadsheet__section',
  'collections-broadsheet__section-title',
  'collections-broadsheet__section-meta',
  'collections-broadsheet__records',
  '"variant" "broadsheet"',
  'Series',
  'Topics'
)) {
  if ($collectionsListTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/collections/list.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  '.Params.description',
  'partial "journey_links.html"',
  'Collections are curated reading threads across the archive',
  'All Collections',
  'Featured %s',
  'Featured Collections',
  'Collections Index',
  'collections-directory__guide',
  'collections-directory__grid',
  'class="grid collection-grid',
  '"title" "Risk"',
  '"title" "Floods"',
  '"title" "AI"',
  '"title" "Moral / Religious"',
  '"title" "Public Power"'
)) {
  if ($collectionsListTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/collections/list.html to remove the retired collections-index snippet: $retiredSnippet"
  }
}

$collectionSingleTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/collections/single.html') -Raw
foreach ($requiredSnippet in @(
  '<article class="collection-section">',
  'collection-section__header',
  'collection-section__ledger',
  'collection-section__lead',
  'collection-section__contents',
  'collection-section__items',
  'collection-section__related',
  '<h2 id="collection-start-here-title">Start Here</h2>',
  '{{ if not (and $startHere $isStartHere) }}',
  'Related Collections',
  'partial "discovery/page-list-item.html"',
  'partial "discovery/collection-card.html"'
)) {
  if ($collectionSingleTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/collections/single.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'collection-room',
  'data-collection-room-theme',
  'partial "collections/collection-progress.html"',
  'data-collection-item-path',
  'collection-item-state',
  'How to Use This Collection',
  'collection-meta-row'
)) {
  if ($collectionSingleTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/collections/single.html to remove the retired collection overview snippet: $retiredSnippet"
  }
}

$articleSingleTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/_default/single.html') -Raw
foreach ($requiredSnippet in @(
  'data-piece-collection-slug="{{ $primaryCollection.collection.slug }}"',
  'class="piece-record-rail"',
  'piece-record-rail__item--collection',
  'data-analytics-source-slot="article_collection_context"'
)) {
  if ($articleSingleTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/_default/single.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'piece--collection-accent',
  'data-piece-collection-room-theme="{{ $primaryCollection.collection.room_theme }}"',
  'class="piece-collection-context"'
)) {
  if ($articleSingleTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/_default/single.html to omit retired collection article skin snippet: $retiredSnippet"
  }
}

$collectionsData = Get-Content -Path (Join-Path $repoRoot 'data/collections.yaml') -Raw
foreach ($requiredSnippet in @(
  'slug: bobs-almanack',
  'slug: musings',
  "title: Bob's Almanack",
  'sections:',
  '- almanack',
  'room_theme: ledger-editorial-desk',
  'room_theme: syd-and-oliver-smoky-lounge',
  'room_theme: modern-bios-records-archive',
  'room_theme: lit-review-lamplit-shelf',
  'room_theme: risk-systems-notebook',
  'room_theme: floods-survey-table',
  'room_theme: ai-screen-glow-archive',
  'room_theme: moral-chapel-library',
  'room_theme: reported-case-studies-evidence-room'
)) {
  if ($collectionsData -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected data/collections.yaml to contain: $requiredSnippet"
  }
}

$correctedAlmanackDescription = 'description: Weekly Outside In Print issues from Robert V. Ussley, gathering new essays, cartoons, compact notices, and one piece worth reprinting.'
if ($collectionsData -notmatch [regex]::Escape($correctedAlmanackDescription)) {
  throw 'Expected data/collections.yaml to use the corrected Bob''s Almanack proposition.'
}
if ($collectionsData -match 'compact notices, and worth reprinting\.') {
  throw 'Expected data/collections.yaml not to retain the incomplete Bob''s Almanack sentence.'
}

if ($collectionsData -match '(?s)- slug: civic-institutions-and-public-power.*?room_theme:') {
  throw 'Expected non-live collection civic-institutions-and-public-power not to define room_theme yet.'
}

$collectionsDoc = Get-Content -Path (Join-Path $repoRoot 'docs/collections-system.md') -Raw
foreach ($requiredSnippet in @(
  'article record rail',
  'first public match',
  'compact collection boundary',
  'legacy metadata retained for compatibility',
  'broadsheet directory',
  'newspaper section front'
)) {
  if ($collectionsDoc -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected docs/collections-system.md to contain: $requiredSnippet"
  }
}

$analyticsDoc = Get-Content -Path (Join-Path $repoRoot 'docs/analytics-system.md') -Raw
foreach ($requiredSnippet in @(
  'article_collection_context',
  'studio_sample_exit'
)) {
  if ($analyticsDoc -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected docs/analytics-system.md to contain: $requiredSnippet"
  }
}

$libraryTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/library/list.html') -Raw
foreach ($requiredSnippet in @(
  'section-front section-front--library',
  'section-front__header',
  'section-front__body',
  'page-header--section-centered',
  'Search published work by title, topic, tag, type, year, or collection.',
  'partial "library/resolve-entries.html"',
  '$initialLimit := 12',
  'Search titles, topics, tags, types, years, and collections',
  'for="library-type">Type</label>',
  '<option value="">All types</option>',
  'for="library-year">Year</label>',
  'for="library-collection">Collection</label>',
  'for="library-sort">Sort</label>',
  'data-library-group-key="{{ $group.key }}"',
  "url.searchParams.get('type')",
  "url.searchParams.get('year')",
  "url.searchParams.get('collection')",
  "url.searchParams.delete('section')",
  'fetch(indexUrl',
  'node.textContent = value',
  'partial "discovery/page-list-item.html"'
)) {
  if ($libraryTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/library/list.html to contain: $requiredSnippet"
  }
}

$libraryResolver = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/library/resolve-entries.html') -Raw
foreach ($requiredSnippet in @(
  'partial "archive/longform-kind.html"',
  '"title" "Essays"',
  '"title" "Affirmations"',
  '"title" "Dialogues"',
  '"title" "Working Papers"',
  'partial "collections/resolve-page-collections.html"',
  '"tags" $tagTerms',
  '"topics" $topicTerms',
  '"search_text"'
)) {
  if ($libraryResolver -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/library/resolve-entries.html to contain: $requiredSnippet"
  }
}

$libraryIndexTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/library/list.libraryindex.json') -Raw
foreach ($requiredSnippet in @(
  'partial "library/resolve-entries.html"',
  '"version" 1',
  '"count" (len $items)',
  '"items" $items',
  '| jsonify'
)) {
  if ($libraryIndexTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/library/list.libraryindex.json to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'partial "journey_links.html"',
  'Search titles, sections, collections, and versions',
  'for="library-section">Section</label>',
  '<option value="">All sections</option>',
  'data-section="{{ index . "sectionKey" }}"'
)) {
  if ($libraryTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/library/list.html to remove the retired library-section snippet: $retiredSnippet"
  }
}

$dialogueFiles = Get-ChildItem -Path (Join-Path $repoRoot 'content/essays/dialogues') -Filter '*.md' | Where-Object { $_.Name -ne '_index.md' }
foreach ($dialogueFile in $dialogueFiles) {
  $dialogueContent = Get-Content -Path $dialogueFile.FullName -Raw
  if ($dialogueContent -notmatch "(?m)^library_type:\s*['""]?dialogue['""]?\s*$") {
    throw "Expected dialogue content to declare library_type: $($dialogueFile.Name)"
  }

  if ($dialogueContent -notmatch "(?m)^collections:\s*\[\s*['""]syd-and-oliver-dialogues['""]\s*\]\s*$") {
    throw "Expected dialogue content to declare the Syd and Oliver collection explicitly: $($dialogueFile.Name)"
  }

  if ($dialogueContent -notmatch "(?m)^url:\s*['""]?/syd-and-oliver/") {
    throw "Expected migrated dialogue content to preserve the public /syd-and-oliver/ URL: $($dialogueFile.Name)"
  }

  if ($dialogueContent -match "(?m)^section_label:\s*['""]?Dialogues['""]?\s*$") {
    throw "Expected migrated dialogue content not to keep the retired Dialogues lane label: $($dialogueFile.Name)"
  }
}

$defaultListTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/_default/list.html') -Raw
foreach ($requiredSnippet in @(
  'Home',
  'page-header--section-centered',
  'partial "discovery/page-list-item.html"',
  'No published pieces are listed here yet.',
  '$orderedPages := sort $pages "Title" "asc"'
)) {
  if ($defaultListTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/_default/list.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'if eq .Section "essays"',
  '$orderedPages = sort $pages "Date" "desc"'
)) {
  if ($defaultListTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/_default/list.html to remove the retired essays-specific list branch: $retiredSnippet"
  }
}

$archiveListTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/archive/list.html') -Raw
foreach ($requiredSnippet in @(
  'partial "archive/resolve-pages.html"',
  '"mode" "archive"',
  'partial "archive/render-list.html"',
  '"idPrefix" "archive"'
)) {
  if ($archiveListTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/archive/list.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'partial "journey_links.html"',
  'hugo.Data.editorial_cartoons',
  'Current Edition',
  'Rolling Archive',
  '"mode" "dialogue"'
)) {
  if ($archiveListTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/archive/list.html to remove the retired archive-shell snippet: $retiredSnippet"
  }
}

$archiveRenderListPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/archive/render-list.html') -Raw
foreach ($requiredSnippet in @(
  'page-header--section-centered',
  'essays-front__year-nav',
  'essays-front__month-title'
)) {
  if ($archiveRenderListPartial -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/archive/render-list.html to contain: $requiredSnippet"
  }
}

$galleryListTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/gallery/list.html') -Raw
foreach ($requiredSnippet in @(
  'section-front section-front--gallery',
  'section-front__header',
  'section-front__body',
  'page-header--section-centered',
  'cartoon-gallery-spotlight',
  'cartoon-gallery-title'
)) {
  if ($galleryListTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/gallery/list.html to contain: $requiredSnippet"
  }
}

$essaysRedirectTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/essays/list.html') -Raw
foreach ($requiredSnippet in @(
  'Redirecting to Outside In Print Archive',
  'noindex, follow',
  '<link rel="canonical" href="{{ "archive/" | absURL }}" />',
  '<meta http-equiv="refresh" content="0; url={{ "archive/" | relURL }}" />',
  'window.location.replace("{{ "archive/" | relURL }}");'
)) {
  if ($essaysRedirectTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/essays/list.html to contain the legacy redirect snippet: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'define "main"',
  'class="essays-front"',
  'partial "archive/render-list.html"'
)) {
  if ($essaysRedirectTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/essays/list.html to remain redirect-only: $retiredSnippet"
  }
}

$dialoguesListTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/syd-and-oliver/list.html') -Raw
foreach ($requiredSnippet in @(
  'Redirecting to Syd and Oliver Dialogues',
  'noindex, follow',
  '.Params.redirect_to',
  '<link rel="canonical" href="{{ $target | absURL }}" />',
  '.OutputFormats.Get "RSS"',
  '<meta http-equiv="refresh" content="0; url={{ $target | relURL }}" />',
  'window.location.replace("{{ $target | relURL }}");'
)) {
  if ($dialoguesListTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/syd-and-oliver/list.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'define "main"',
  'partial "archive/resolve-pages.html"',
  'partial "archive/render-list.html"',
  'partial "journey_links.html"',
  'Current Edition',
  'No published pieces are listed here yet.'
)) {
  if ($dialoguesListTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/syd-and-oliver/list.html to remain a compatibility redirect: $retiredSnippet"
  }
}

$dialoguesSectionSource = Get-Content -Path (Join-Path $repoRoot 'content/syd-and-oliver/_index.md') -Raw
foreach ($requiredSnippet in @(
  'noindex: true',
  'redirect_to: "/collections/syd-and-oliver-dialogues/"',
  'outputs: ["HTML", "RSS"]'
)) {
  if ($dialoguesSectionSource -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected the legacy dialogue hub to declare: $requiredSnippet"
  }
}

foreach ($requiredSnippet in @(
  'legacy_path: /syd-and-oliver/',
  'feed_path: /syd-and-oliver/index.xml'
)) {
  if ($collectionsData -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected the canonical Syd collection definition to declare: $requiredSnippet"
  }
}

$baseTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/_default/baseof.html') -Raw
foreach ($requiredSnippet in @(
  'with $meta.collection',
  'with .feed_path',
  'type="application/rss+xml"',
  '{{ . | absURL }}'
)) {
  if ($baseTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected canonical collection feed autodiscovery via: $requiredSnippet"
  }
}

foreach ($requiredSnippet in @(
  '.section-front{',
  '.section-front__header{',
  '.section-front__body{',
  '.essays-front{',
  '.essays-front__masthead{',
  '.essays-front__stats{',
  '.essays-front__year-nav{',
  '.essays-front__year-jumps{',
  '.essays-front__year-link{',
  '.essays-front__archive{',
  '.essays-front__month{',
  '.essays-front__month-title{',
  '.essays-front__month-list{',
  '.item-series-marker{',
  '.item-kicker{',
  '.item-kicker--collection{'
)) {
  if ($mainCss -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected assets/css/main.css to contain essays-front selector: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  '.essays-front__deck{',
  '.essays-front__label{',
  '.essays-front__section-title{',
  '.essays-front__meta{',
  '.essays-front__edition{',
  '.essays-front__edition-grid{',
  '.essays-front__lead{',
  '.essays-front__rail{',
  '.essays-front__rail-item{',
  '.essays-front__rail-item--with-summary{',
  '.essays-front__cartoon{',
  '.essays-front__cartoon-caption{'
)) {
  if ($mainCss -match [regex]::Escape($retiredSnippet)) {
    throw "Expected assets/css/main.css to remove the retired essays-front selector: $retiredSnippet"
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
  'printf "%d min read"',
  'collectionPlacement',
  'item-kicker item-kicker--collection',
  'item-series-marker',
  'Modern Bios'
)) {
  if ($pageListItemPartial -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected discovery/page-list-item.html to contain: $requiredSnippet"
  }
}

if ($pageListItemPartial -match [regex]::Escape('printf "%s min read"')) {
  throw 'Expected discovery/page-list-item.html to format ReadingTime as an integer, not a string.'
}

if ($pageListItemPartial -match [regex]::Escape('item--variant-modernbio')) {
  throw 'Expected discovery/page-list-item.html to stop appending the Modern Bios row-variant class in shared archive rows.'
}

if ($mainCss -match [regex]::Escape('.item--variant-modernbio')) {
  throw 'Expected assets/css/main.css to remove the shared-row Modern Bios inset rule styling.'
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

if ($mastheadPartial -notmatch '(?s)<div class="masthead-side-deck masthead-side-deck--left"[^>]*>\s*<span>ESSAYS</span>\s*<span>REPORTS</span>\s*<span>LITERATURE</span>\s*</div>') {
  throw 'Expected the homepage masthead left deck to contain only Essays, Reports, and Literature.'
}

if ($mastheadPartial -notmatch '(?s)nav-disclosure--read.*<span>Read</span>.*nav-disclosure--explore.*<span>Explore</span>.*range \$directItems') {
  throw 'Expected layouts/partials/masthead.html to render grouped Read and Explore disclosures before the direct desktop links.'
}

if ($mastheadPartial -notmatch '(?s)class="nav__mobile".*nav-mobile-disclosure--read.*<span>Read</span>.*nav-mobile-disclosure--explore.*<span>Explore</span>.*range \$mobilePrimaryItems') {
  throw 'Expected layouts/partials/masthead.html to render the mobile ribbon as Read, Explore, and About.'
}

if ($mastheadPartial -match '(?s)class="nav__mobile".*?<span>Menu</span>') {
  throw 'Expected the mobile navigation to use separate Read and Explore controls instead of a generic Menu control.'
}

foreach ($requiredNavigationSnippet in @(
  '"label" "Latest"',
  '"description" "Front page"',
  '"label" "Archive"',
  '"description" "By date"',
  '"label" "Collections"',
  '"description" "By topic"',
  '"label" "Library"',
  '"description" "Search all"',
  '"label" "Feeling curious?"',
  '"description" "Surprise me"',
  '"label" "Gallery"',
  '"description" "Editorial art"',
  '"label" "Bookstore"',
  '"label" "About"',
  '"label" "Contribute"',
  'aria-label="Primary" data-primary-nav',
  'nav-mobile-disclosure--read',
  'nav-mobile-disclosure--explore'
)) {
  if ($mastheadPartial -notmatch [regex]::Escape($requiredNavigationSnippet)) {
    throw "Expected grouped primary navigation contract to contain: $requiredNavigationSnippet"
  }
}

if ($mastheadPartial -notmatch '(?s)"label" "Latest".*?"label" "Archive".*?"label" "Collections".*?"label" "Library".*?"label" "Feeling curious\?"') {
  throw 'Expected the Read destinations to remain ordered Latest, Archive, Collections, Library, Feeling curious?.'
}

if ($mastheadPartial -match '"label" "(?:Studio|Support)"|primary_nav_(?:studio|support)') {
  throw 'Expected Studio and Support to remain footer destinations rather than primary-navigation items.'
}

foreach ($requiredAppsNavigationSnippet in @(
  'site.GetPage "/apps"',
  'not $appsPage.Draft',
  '"label" "Apps & Tools"',
  '"description" "Digital experiments"'
)) {
  if ($mastheadPartial -notmatch [regex]::Escape($requiredAppsNavigationSnippet)) {
    throw "Expected the public Apps & Tools navigation contract to contain: $requiredAppsNavigationSnippet"
  }
}

if ($mastheadPartial -notmatch '\$showApps\s*:=\s*and\s+\$appsPage\s+\(not\s+\$appsPage\.Draft\)') {
  throw 'Expected the published Apps & Tools navigation link to retain its public section gate.'
}

if ($mastheadPartial -match '\$showApps\s*:=[^\r\n]*hugo\.IsServer') {
  throw 'Expected the published Apps & Tools navigation link not to acquire a server-only draft alternative.'
}

if ($mastheadPartial -notmatch '"analyticsSourceSlot" "primary_nav_bookstore"') {
  throw 'Expected the primary Bookstore destination to retain its analytics source slot.'
}

if ($mastheadPartial -notmatch [regex]::Escape('range $directKey := slice "about" "bookstore" "contribute"')) {
  throw 'Expected direct desktop navigation order to be About, Bookstore, Contribute.'
}
if ($mastheadPartial -notmatch [regex]::Escape('range $mobileKey := slice "about"')) {
  throw 'Expected About to be the only direct mobile-primary link after the Read and Explore controls.'
}
if ($mastheadPartial -notmatch '(?s)"label" "Archive".*?"group" "read".*?"mobilePrimary" false') {
  throw 'Expected Archive to move into the Read disclosure instead of remaining a direct mobile-primary destination.'
}
if ($mastheadPartial -notmatch '(?s)"label" "About".*?"group" "direct".*?"mobilePrimary" true') {
  throw 'Expected About to be a direct mobile-primary destination.'
}
if ($mastheadPartial -notmatch '(?s)"label" "Contribute".*?"group" "direct".*?"mobilePrimary" false') {
  throw 'Expected Contribute to appear in desktop navigation and the mobile Explore disclosure.'
}
if ($mastheadPartial -notmatch '(?s)nav-mobile-disclosure--read.*range \$mobileReadItems.*nav-mobile-disclosure--explore.*range \$mobileExploreItems') {
  throw 'Expected mobile Read and Explore disclosures to expose their dedicated destination lists.'
}
if ($mastheadPartial -notmatch '(?s)\$mobileReadItems := slice.*?range \$readItems.*?"key" "bookstore"') {
  throw 'Expected Bookstore to remain accessible after the standard mobile Read destinations.'
}
if ($mastheadPartial -notmatch '\$mobileReadCurrent := gt \(len \(where \$mobileReadItems "currentSection" true\)\) 0') {
  throw 'Expected the mobile Read disclosure to expose current-section state for Bookstore as well as reading destinations.'
}
if ($mastheadPartial -notmatch '(?s)\$mobileExploreItems := slice.*?range \$exploreItems.*?"key" "contribute"') {
  throw 'Expected Contribute to remain accessible alongside the mobile Explore destinations.'
}
if ($mastheadPartial -notmatch '(?s)"label" "Bookstore".*?"group" "direct".*?"mobilePrimary" false') {
  throw 'Expected Bookstore to leave the visible mobile row and move into the Read disclosure.'
}

$collectionCardPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/discovery/collection-card.html') -Raw
if ($collectionCardPartial -notmatch 'Start Here') {
  throw 'Expected discovery/collection-card.html to surface the collection start-here link when present.'
}

if ($collectionCardPartial -notmatch '\$eyebrow := \$label') {
  throw 'Expected discovery/collection-card.html to seed the collection-card eyebrow from the optional label input.'
}

if ($collectionCardPartial -notmatch 'if not \$eyebrow') {
  throw 'Expected discovery/collection-card.html to fall back to the collection kind only when no eyebrow label is provided.'
}

if ($collectionCardPartial -notmatch '\$eyebrow = title \$entry\.state\.kind') {
  throw 'Expected discovery/collection-card.html to default the eyebrow to the collection kind when no label is provided.'
}

$webpageHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/webpage.html') -Raw
if ($webpageHelper -notmatch 'significantLink') {
  throw 'Expected schema/webpage.html to emit significantLink for discovery surfaces.'
}

& (Join-Path $PSScriptRoot 'test_direct_commerce_storefront_contract.ps1') -SourceOnly

Write-Host 'Discovery surface contract test passed.'
$global:LASTEXITCODE = 0
exit 0
