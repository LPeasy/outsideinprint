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
  'layouts/partials/home_bookstore_spotlight.html',
  'layouts/partials/home_imprint_statement.html',
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
foreach ($requiredSnippet in @(
  'partial "home_front_page.html"',
  'partial "home_studio_offer.html"',
  'partial "home_bookstore_spotlight.html"',
  'partial "home_imprint_statement.html"',
  'partial "home_selected_collections.html"',
  'partial "newsletter_signup.html"',
  'site.GetPage "/archive"',
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
  'partial "home_studio_offer.html"',
  'partial "home_bookstore_spotlight.html"',
  'partial "home_imprint_statement.html"',
  'partial "home_selected_collections.html"',
  'partial "newsletter_signup.html"',
  'class="home-browse'
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
  '<p class="home-front-page__orientation">Independent essays, selected writings, and original books by Robert V. Ussley</p>',
  'id="home-front-page-title"',
  'data-home-front-page-region="lead"',
  'data-home-front-page-region="secondary"',
  '$almanackIssues := where site.RegularPages "Section" "almanack"',
  '<aside class="home-almanack home-almanack--lead" aria-labelledby="home-almanack-title">',
  'home-almanack-divider',
  'home-almanack__ledger-row--number',
  'home-almanack__ledger-row--virtue',
  '<a href="{{ .RelPermalink }}">Read issue &rarr;</a>'
)) {
  if ($homeFrontPageTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/home_front_page.html to contain: $requiredSnippet"
  }
}

$homepageOrder = @(
  'id="home-front-page-title"',
  'class="home-front-page__orientation"',
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
  'https://outsideinprint.org/archive/',
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
  'class="home-manifesto__line"',
  'Ask for the evidence. Read past the headlines. Think for yourself.'
)) {
  if ($homeImprintTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/home_imprint_statement.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'id="home-manifesto-title"',
  'home-manifesto__line--primary',
  'home-manifesto__line--secondary',
  'A digital imprint of essays, reports, dialogues, and literature.',
  'Color over the lines. Read beyond the feed. Think for yourself.'
)) {
  if ($homeImprintTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/partials/home_imprint_statement.html to remove: $retiredSnippet"
  }
}

$homeBookstoreTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_bookstore_spotlight.html') -Raw
foreach ($requiredSnippet in @(
  'site.GetPage "/shop"',
  'first 3 (sort .RegularPages "Weight" "asc")',
  'if gt (len $books) 0',
  'partial "shop/product-data.html"',
  'Books from Outside In Print',
  'Three Outside In Print EPUB editions at $9.99 each, prepared for secure digital delivery.',
  'Browse the bookstore',
  'data-home-bookstore-card',
  'data-analytics-source-slot="homepage_bookstore_promo"'
)) {
  if ($homeBookstoreTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/home_bookstore_spotlight.html to contain: $requiredSnippet"
  }
}

foreach ($forbiddenSnippet in @(
  'https://www.amazon.com',
  'Amazon',
  'Kindle',
  'purchase_url',
  'checkout-actions',
  'carousel',
  'autoplay'
)) {
  if ($homeBookstoreTemplate -match [regex]::Escape($forbiddenSnippet)) {
    throw "Expected the homepage bookstore spotlight to omit: $forbiddenSnippet"
  }
}

$homeStudioTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/home_studio_offer.html') -Raw
foreach ($requiredSnippet in @(
  'hugo.Data.studio',
  'if $enabled',
  'founding_offer_active',
  'You have the material. We make it publishable.',
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
  'You have the material. We make it ready to publish.',
  'Fixed scope <span aria-hidden="true">&middot;</span> First draft in {{ $turnaroundDays }} business days <span aria-hidden="true">&middot;</span> One revision',
  'The {{ $turnaroundDays }}-business-day clock starts after three things happen: you approve the written scope, pay the deposit, and send all agreed source material.',
  'A standard visual layout and image treatment, tailored to your preferences',
  'class="studio-operator"',
  'Your writer and editor',
  'Each Publication Sprint is handled by ',
  'Robert V. Ussley',
  ', the writer and editor behind Outside In Print. He produces reported essays and literary analysis on risk, institutions, technology, and public life.',
  "These are examples of our own editorial work, not client testimonials. Their visuals represent the standard deliverable and can be tailored to the client’s preferences.",
  'You receive the complete finished file set and own the finished work exclusively. Outside In Print may publish it at your request, with your written approval, but publication is not guaranteed.',
  'After full payment, you own the finished work exclusively. Outside In Print retains no publication right unless you give written permission.',
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
  'Outside In Print will receive your inquiry only if you send the email and it reaches us.'
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

if ($mainCss -notmatch '(?s)\.home-bookstore__grid\{[^}]*grid-template-columns:repeat\(3, minmax\(0, 1fr\)\);[^}]*\}') {
  throw 'Expected the homepage bookstore grid to use three columns above 900px.'
}

if ($mainCss -notmatch '(?s)@media \(max-width:900px\)\{\s*\.home-bookstore__grid\{[^}]*grid-template-columns:1fr;[^}]*\}\s*\.home-bookstore__card\{[^}]*grid-template-columns:8rem minmax\(0, 1fr\);[^}]*\}\s*\}') {
  throw 'Expected the homepage bookstore to use compact horizontal single-column records at 900px and below.'
}

if ($mainCss -notmatch '(?s)@media \(max-width:420px\)\{\s*\.home-bookstore__card\{[^}]*grid-template-columns:5\.75rem minmax\(0, 1fr\);[^}]*\}\s*\.home-bookstore__cta\{[^}]*width:100%;[^}]*\}\s*\}') {
  throw 'Expected the homepage bookstore to shrink the cover column and use a full-width CTA at 420px and below.'
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
  'Search the archive by title, type, collection, or version.',
  'partial "archive/longform-kind.html"',
  '"title" "Essays"',
  '"title" "Affirmations"',
  '"title" "Dialogues"',
  '"title" "Working Papers"',
  'Search titles, types, collections, and versions',
  'for="library-type">Type</label>',
  '<option value="">All types</option>',
  'data-type="{{ index . "typeKey" }}"',
  "url.searchParams.get('type')",
  "url.searchParams.delete('section')",
  'partial "collections/resolve-page-collections.html"',
  'partial "discovery/page-list-item.html"'
)) {
  if ($libraryTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/library/list.html to contain: $requiredSnippet"
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
  'partial "archive/resolve-pages.html"',
  '"mode" "dialogue"',
  'partial "archive/render-list.html"',
  '"idPrefix" "dialogues"'
)) {
  if ($dialoguesListTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/syd-and-oliver/list.html to contain: $requiredSnippet"
  }
}

foreach ($retiredSnippet in @(
  'partial "journey_links.html"',
  'Current Edition',
  'No published pieces are listed here yet.'
)) {
  if ($dialoguesListTemplate -match [regex]::Escape($retiredSnippet)) {
    throw "Expected layouts/syd-and-oliver/list.html to use the shared filtered archive shell cleanly: $retiredSnippet"
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

if ($mastheadPartial -notmatch '(?s)nav-disclosure--read.*<span>Read</span>.*nav-disclosure--explore.*<span>Explore</span>.*range \$directItems') {
  throw 'Expected layouts/partials/masthead.html to render grouped Read and Explore disclosures before the direct desktop links.'
}

if ($mastheadPartial -notmatch '(?s)class="nav__mobile".*range \$mobilePrimaryItems.*<span>Menu</span>') {
  throw 'Expected layouts/partials/masthead.html to render the Archive, Collections, and Studio mobile-primary items before Menu.'
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
  '"label" "Studio"',
  '"label" "Bookstore"',
  '"label" "About"',
  '"label" "Support"',
  'aria-label="Primary" data-primary-nav',
  'mobile-nav-read-heading',
  'mobile-nav-explore-heading',
  'mobile-nav-imprint-heading'
)) {
  if ($mastheadPartial -notmatch [regex]::Escape($requiredNavigationSnippet)) {
    throw "Expected grouped primary navigation contract to contain: $requiredNavigationSnippet"
  }
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

if ($mastheadPartial -notmatch '"analyticsSourceSlot" "primary_nav_studio"') {
  throw 'Expected the primary Studio destination to expose its analytics source slot.'
}

$studioNavIndex = $mastheadPartial.IndexOf('"label" "Studio"', [System.StringComparison]::Ordinal)
$bookstoreNavIndex = $mastheadPartial.IndexOf('"label" "Bookstore"', [System.StringComparison]::Ordinal)
$aboutNavIndex = $mastheadPartial.IndexOf('"label" "About"', [System.StringComparison]::Ordinal)
$supportNavIndex = $mastheadPartial.IndexOf('"label" "Support"', [System.StringComparison]::Ordinal)
if ($studioNavIndex -lt 0 -or $bookstoreNavIndex -le $studioNavIndex -or $aboutNavIndex -le $bookstoreNavIndex -or $supportNavIndex -le $aboutNavIndex) {
  throw 'Expected direct desktop navigation order to be Studio, Bookstore, About, Support.'
}

if ($mastheadPartial -notmatch '(?s)"label" "Studio".*?"mobilePrimary" true' -or $mastheadPartial -notmatch '(?s)"label" "Bookstore".*?"mobilePrimary" false') {
  throw 'Expected Studio to own the closed mobile slot while Bookstore remains in the expanded Menu.'
}

if ($mastheadPartial -notmatch '"analyticsSourceSlot" "primary_nav_support"') {
  throw 'Expected the primary Support destination to retain its analytics source slot.'
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
