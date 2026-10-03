#requires -Version 7.0
param([string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public'), [string]$BaselineDir = '')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$paths = @{
  'weekend' = @('/collections/the-things-we-say/', '/essays/after-the-cup-falls/')
  'everyday-history' = @('/essays/fine-china-the-long-road-from-jingdezhen-to-grandmas-cabinet/', '/essays/the-bars-on-the-gum/')
  'dialogue' = @('/syd-and-oliver/', '/syd-and-oliver/what-i-had/')
}
foreach ($segment in $paths.Keys) {
  $html = Get-Content -LiteralPath (Join-Path $SiteDir "subscribe/$segment/index.html") -Raw
  foreach ($required in @('Bob', 'Get Bob', 'Every Saturday', 'newsletter_submit', "funnel_$segment", 'https://buttondown.com/api/emails/embed-subscribe/OutsideInPrint', 'outside-in-print', '/privacy/', 'Read the latest issue', 'data-oip-image-id', 'funnel-samples-title')) {
    if (-not $html.Contains($required)) { throw "$segment missing $required" }
  }
  if ([regex]::Matches($html, '<form\b').Count -ne 1) { throw "$segment must have one signup form" }
  if ($html.IndexOf('newsletter-signup__form') -gt $html.IndexOf('subscriber-funnel__art')) { throw "$segment signup form must precede the artwork" }
  if ($html -notmatch '<form\b[^>]*method=(?:"post"|post)') { throw "$segment must retain the native provider POST" }
  if ($html -notmatch '<input\b(?=[^>]*type=(?:"email"|email))(?=[^>]*\brequired\b)[^>]*>') { throw "$segment must retain native email validation" }
  if ($html -notmatch '<section\b(?=[^>]*id=(?:"get-almanack"|get-almanack))(?=[^>]*tabindex=(?:"-1"|-1))[^>]*>') { throw "$segment jump target must accept keyboard focus" }
  if ($html -match 'eligibleRead:(?:!0|true)|eligibleRead":true') { throw "$segment must not be an essay read" }
  if ($html.Contains([char]0x2014)) { throw "$segment contains an em dash" }
  foreach ($path in $paths[$segment]) {
    if (-not $html.Contains($path)) { throw "$segment missing sample $path" }
    if (-not (Test-Path -LiteralPath (Join-Path $SiteDir ($path.Trim('/') + '/index.html')))) { throw "Missing built sample $path" }
  }
}
$confirmation = Get-Content -LiteralPath (Join-Path $SiteDir 'subscribe/confirmation/index.html') -Raw
$confirmationText = "One more step: check your inbox and click the confirmation link to finish subscribing. If you don’t see the email, check spam."
if (-not ([System.Net.WebUtility]::HtmlDecode($confirmation).Contains($confirmationText))) { throw 'Missing exact inbox confirmation instructions' }
if ($confirmation -notmatch 'name=(?:"robots"|robots)\s+content="noindex, follow"') { throw 'Confirmation page must be noindex' }
if ($confirmation -match 'successfully subscribed|<form\b') { throw 'Confirmation page must not claim completed signup or prompt another submission' }
foreach ($issue in Get-ChildItem -LiteralPath (Join-Path $SiteDir 'almanack') -Directory) {
  $issueFile = Join-Path $issue.FullName 'index.html'
  if (-not (Test-Path -LiteralPath $issueFile)) { continue }
  $issueHtml = Get-Content -LiteralPath $issueFile -Raw
  if ($issueHtml -notmatch 'class=(?:"almanack-issue\b|almanack-issue\b)') { continue }
  if ($issueHtml -notmatch '<a\b[^>]*href=(?:"#bobs-almanack-signup"|#bobs-almanack-signup)[^>]*>Subscribe to Bob(?:&rsquo;|&#39;|&#8217;|\u2019|\x27)s Almanack</a>') { throw "$($issue.Name) missing heading shortcut" }
  if ($issueHtml -notmatch '<section\b(?=[^>]*id=(?:"bobs-almanack-signup"|bobs-almanack-signup))(?=[^>]*tabindex=(?:"-1"|-1))[^>]*>') { throw "$($issue.Name) missing focusable existing signup target" }
  if ([regex]::Matches($issueHtml, '<form\b').Count -ne 1) { throw "$($issue.Name) must keep one existing signup form" }
}
foreach ($path in @('index.html', 'gallery/index.html', 'library/index.html', 'archive/index.html')) {
  $html = Get-Content -LiteralPath (Join-Path $SiteDir $path) -Raw
  if ($html -match '/subscribe/(weekend|everyday-history|dialogue)/') { throw "Funnel leaked into $path" }
}
if ($BaselineDir) {
  $files = @{ 'index.html' = 'index.html'; 'gallery/index.html' = 'gallery.html'; 'library/index.html' = 'library.html'; 'archive/index.html' = 'archive.html' }
  foreach ($path in $files.Keys) {
    # The shared analytics adapter fingerprint changes; visible DOM and CSS must not.
    $before = Get-Content -LiteralPath (Join-Path $BaselineDir $files[$path]) -Raw
    $after = Get-Content -LiteralPath (Join-Path $SiteDir $path) -Raw
    $pattern = '<script\b[^>]*src=(?:"[^"]*/js/analytics[^\"]*"|[^\s>]*?/js/analytics[^\s>]*)[^>]*></script>'
    if ([regex]::Replace($before, $pattern, '') -cne [regex]::Replace($after, $pattern, '')) { throw "Existing output changed: $path" }
  }
}
Write-Host 'PASS: three higher signup forms, native POST/email validation, focusable issue shortcuts, pending confirmation page, and unchanged discovery surfaces.'
