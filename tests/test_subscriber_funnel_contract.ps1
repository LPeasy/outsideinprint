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
  foreach ($required in @('Bob', 'Get Bob', 'Every Saturday', 'newsletter_submit', "funnel_$segment", 'https://buttondown.com/api/emails/embed-subscribe/OutsideInPrint', 'outside-in-print', '/privacy/', '/almanack/2026-07-25/', 'data-oip-image-id', 'funnel-samples-title')) {
    if (-not $html.Contains($required)) { throw "$segment missing $required" }
  }
  if ([regex]::Matches($html, '<form\b').Count -ne 1) { throw "$segment must have one signup form" }
  if ($html -match 'eligibleRead:(?:!0|true)|eligibleRead":true') { throw "$segment must not be an essay read" }
  if ($html.Contains([char]0x2014)) { throw "$segment contains an em dash" }
  foreach ($path in $paths[$segment]) {
    if (-not $html.Contains($path)) { throw "$segment missing sample $path" }
    if (-not (Test-Path -LiteralPath (Join-Path $SiteDir ($path.Trim('/') + '/index.html')))) { throw "Missing built sample $path" }
  }
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
Write-Host 'PASS: three funnels, one existing newsletter, real samples, and unchanged discovery surfaces.'
