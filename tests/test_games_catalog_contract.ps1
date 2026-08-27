#requires -Version 7.0

param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public'),
  [ValidateSet('Production')]
  [string]$Mode = 'Production'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-Source {
  param([Parameter(Mandatory)][string]$RelativePath)
  return Get-Content -LiteralPath (Join-Path $repoRoot $RelativePath) -Raw -Encoding utf8
}

function Get-BuiltHtml {
  param([Parameter(Mandatory)][string]$RelativePath)
  $fullPath = Join-Path $SiteDir $RelativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing Games route: $RelativePath"
  }
  return Get-Content -LiteralPath $fullPath -Raw -Encoding utf8
}

function Assert-OneH1 {
  param([Parameter(Mandatory)][string]$Html, [Parameter(Mandatory)][string]$Route)
  $count = [regex]::Matches($Html, '<h1\b', 'IgnoreCase').Count
  if ($count -ne 1) { throw "Expected one H1 at $Route; found $count." }
}

function Assert-GenericWebPage {
  param([Parameter(Mandatory)][string]$Html, [Parameter(Mandatory)][string]$Route)
  if ($Html -notmatch '"@type"\s*:\s*"WebPage"') { throw "Expected WebPage schema at $Route." }
  if ($Html -match '"@type"\s*:\s*"(?:Product|Offer|SoftwareApplication|VideoGame)"') {
    throw "Forbidden product or game schema at $Route."
  }
}

$gamesIndexSource = Get-Source 'content/games/_index.md'
$idleSource = Get-Source 'content/games/idle-times/index.md'
foreach ($source in @($gamesIndexSource, $idleSource)) {
  if ($source -notmatch '(?m)^draft:\s*false\s*$' -or $source -notmatch '(?m)^noindex:\s*false\s*$') {
    throw 'Games index and Idle Times must be public and indexable in this bounded release.'
  }
}

$sourcePages = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'content/games') -Filter '*.md' -File -Recurse)
if ($sourcePages.Count -ne 2) {
  throw "Expected exactly two Games source pages; found $($sourcePages.Count)."
}

$data = Get-Source 'data/games.yaml'
$gameKeys = @([regex]::Matches(($data -split '(?m)^games:\s*$')[1], '(?m)^  ([a-z0-9_]+):\s*$') | ForEach-Object { $_.Groups[1].Value })
if ($gameKeys.Count -ne 1 -or $gameKeys[0] -cne 'idle_times') {
  throw 'Bounded release data must contain only the Idle Times record.'
}
if ($data -notmatch '(?ms)^\s+order:\s*\r?\n\s+-\s+"idle_times"\s*\r?\n\s*\r?\ngames:') {
  throw 'Bounded release catalog order must contain only Idle Times.'
}
$requiredReleasedSourcePatterns = @(
  '(?m)^\s+release_date_state:\s*"released"\s*$',
  '(?m)^\s+status:\s*"Available now"\s*$',
  '(?m)^\s+availability:\s*"Available now on Steam\."\s*$',
  '(?m)^\s+action_state:\s*"external_purchase"\s*$',
  '(?m)^\s+action_label:\s*"Buy Idle Times on Steam"\s*$',
  '(?m)^\s+steam_app_id:\s*"4978200"\s*$',
  '(?m)^\s+platform:\s*"Windows"\s*$',
  '(?m)^\s+language:\s*"English"\s*$',
  '(?m)^\s+play_style:\s*"Single-player"\s*$',
  '(?m)^\s+privacy_route_state:\s*"public"\s*$',
  '(?m)^\s+privacy_route:\s*"/privacy/"\s*$'
)
foreach ($pattern in $requiredReleasedSourcePatterns) {
  if ($data -notmatch $pattern) { throw "Released Idle Times source contract is missing pattern: $pattern" }
}
$cleanStoreUrl = 'https://store.steampowered.com/app/4978200/Idle_Times/'
$storedActionUrl = [regex]::Match($data, '(?m)^\s+action_url:\s*"([^"]+)"\s*$')
if (-not $storedActionUrl.Success -or $storedActionUrl.Groups[1].Value -cne $cleanStoreUrl) {
  throw 'Idle Times must store the exact clean Steam URL without tracking parameters or a fragment.'
}
$approvedSlots = @('games_index_hero', 'games_index_widget', 'idle_times_detail_hero', 'idle_times_detail_widget')
$sourceSlots = @([regex]::Matches($data, '(?m)^\s{4}-\s+"(games_index_hero|games_index_widget|idle_times_detail_hero|idle_times_detail_widget)"\s*$') | ForEach-Object { $_.Groups[1].Value })
if (($sourceSlots -join "`n") -cne ($approvedSlots -join "`n")) {
  throw 'Games data must define the four approved Steam UTM source slots in contract order.'
}
$releasedSource = "$gamesIndexSource`n$idleSource`n$data"
if ($releasedSource -match '(?i)coming soon|coming to Steam|wishlist|not yet available|before Steam unlocks') {
  throw 'Released Games source contains stale pre-release language.'
}

$gamesHtml = Get-BuiltHtml 'games/index.html'
$idleHtml = Get-BuiltHtml 'games/idle-times/index.html'
$publicRouteRecords = @(
  @{ Html = $gamesHtml; Route = 'games/index.html'; Canonical = 'https://outsideinprint.org/games/' },
  @{ Html = $idleHtml; Route = 'games/idle-times/index.html'; Canonical = 'https://outsideinprint.org/games/idle-times/' }
)
foreach ($entry in $publicRouteRecords) {
  Assert-OneH1 -Html $entry.Html -Route $entry.Route
  Assert-GenericWebPage -Html $entry.Html -Route $entry.Route
  if ($entry.Html -notmatch '<meta\s+name=(?:"robots"|robots)\s+content="index, follow, max-image-preview:large"') {
    throw "Public route is not indexable: $($entry.Route)"
  }
  $canonicalPattern = '<link\s+rel=(?:"canonical"|canonical)\s+href=(?:"' + [regex]::Escape($entry.Canonical) + '"|' + [regex]::Escape($entry.Canonical) + '(?:\s|>))'
  if ($entry.Html -notmatch $canonicalPattern) { throw "Public route has the wrong canonical: $($entry.Route)" }
}

$idleCardLinks = [regex]::Matches($gamesHtml, 'href=(?:"/games/idle-times/"|/games/idle-times/(?:\s|>))').Count
if ($idleCardLinks -lt 1) { throw 'Public catalog must link Idle Times.' }

foreach ($required in @(
  'Available now on Steam.',
  'Buy Idle Times on Steam',
  'Full Desk, Mini Companion, and Pet Desk',
  '78 illustrated rewards',
  'Progress occurs only while a desk view is open.',
  'There is no offline progression.',
  'fixed and pre-generated',
  'no runtime generative-AI service or API calls',
  'support@outsideinprint.org',
  '/privacy/'
)) {
  if ($idleHtml -notmatch [regex]::Escape($required)) { throw "Public Idle output is missing: $required" }
}
foreach ($required in @(
  'Available now',
  'Buy Idle Times on Steam',
  '/games/idle-times/'
)) {
  if ($gamesHtml -notmatch [regex]::Escape($required)) { throw "Public Games catalog is missing: $required" }
}

$utmPrefix = 'utm_source=outsideinprint&utm_medium=owned_web&utm_campaign=games_hub&utm_content='
$gamesDecoded = [System.Net.WebUtility]::HtmlDecode($gamesHtml)
$idleDecoded = [System.Net.WebUtility]::HtmlDecode($idleHtml)
$trackedOutput = @(
  @{ Html = $gamesDecoded; Slot = 'games_index_hero'; Base = $cleanStoreUrl; Label = 'Games hero CTA' },
  @{ Html = $gamesDecoded; Slot = 'games_index_widget'; Base = $cleanStoreUrl; Label = 'Games widget fallback' },
  @{ Html = $gamesDecoded; Slot = 'games_index_widget'; Base = 'https://store.steampowered.com/widget/4978200/'; Label = 'Games Steam widget' },
  @{ Html = $idleDecoded; Slot = 'idle_times_detail_hero'; Base = $cleanStoreUrl; Label = 'Idle Times hero CTA' },
  @{ Html = $idleDecoded; Slot = 'idle_times_detail_widget'; Base = $cleanStoreUrl; Label = 'Idle Times widget fallback' },
  @{ Html = $idleDecoded; Slot = 'idle_times_detail_widget'; Base = 'https://store.steampowered.com/widget/4978200/'; Label = 'Idle Times Steam widget' }
)
foreach ($record in $trackedOutput) {
  $expectedUrl = "$($record.Base)?$utmPrefix$($record.Slot)"
  if ([regex]::Matches($record.Html, [regex]::Escape($expectedUrl)).Count -ne 1) {
    throw "$($record.Label) must emit exactly one approved tracked Steam URL."
  }
}
$allSteamUrls = @([regex]::Matches("$gamesDecoded`n$idleDecoded", 'https://store\.steampowered\.com/(?:app/4978200/Idle_Times/|widget/4978200/)\?[^\s"''<>]+') | ForEach-Object { $_.Value })
if ($allSteamUrls.Count -ne $trackedOutput.Count) {
  throw "Expected exactly $($trackedOutput.Count) tracked Steam URLs; found $($allSteamUrls.Count)."
}
foreach ($url in $allSteamUrls) {
  if ($url -notmatch ('^https://store\.steampowered\.com/(?:app/4978200/Idle_Times/|widget/4978200/)\?' + [regex]::Escape($utmPrefix) + '(?:' + (($approvedSlots | ForEach-Object { [regex]::Escape($_) }) -join '|') + ')$')) {
    throw "Public Games output contains an unapproved Steam URL: $url"
  }
}

foreach ($entry in @(
  @{ Html = $gamesHtml; Route = 'games/index.html'; PictureCount = 1; Slot = 'games_index_widget' },
  @{ Html = $idleHtml; Route = 'games/idle-times/index.html'; PictureCount = 3; Slot = 'idle_times_detail_widget' }
)) {
  if ([regex]::Matches($entry.Html, '<picture\b', 'IgnoreCase').Count -ne $entry.PictureCount) {
    throw "Expected $($entry.PictureCount) responsive pictures at $($entry.Route)."
  }
  foreach ($pattern in @(
    'type=(?:"image/avif"|image/avif(?:\s|>))',
    'type=(?:"image/webp"|image/webp(?:\s|>))',
    '<img\b[^>]*\bsrcset=',
    '<img\b[^>]*\bsizes=',
    '<iframe\b[^>]*\bloading=(?:"lazy"|lazy(?:\s|>))',
    'games-widget__fallback',
    'data-analytics-event=(?:"game_store_click"|game_store_click(?:\s|>))',
    'data-analytics-product=(?:"idle_times"|idle_times(?:\s|>))',
    ('data-analytics-source-slot=(?:"' + [regex]::Escape($entry.Slot) + '"|' + [regex]::Escape($entry.Slot) + '(?:\s|>))')
  )) {
    if ($entry.Html -notmatch $pattern) { throw "Public Games responsive/widget interface is missing at $($entry.Route): $pattern" }
  }
}

foreach ($html in @($gamesHtml, $idleHtml)) {
  if ($html -match '(?i)<(?:form|input|select|textarea)\b|stripe|checkout|waitlist|[$€£]\s*\d|<video\b|\.(?:webm|mp4)') {
    throw 'Public Games output exposed onsite commerce, intake, price claims, or trailer media.'
  }
  if ($html -match '(?i)Steam (?:seller|payee|tax|bank)') {
    throw 'Public Games output makes an unverified Steam account-identity claim.'
  }
  if ($html -match '(?i)<a\b[^>]*\btarget=(?:"_blank"|_blank(?:\s|>))') {
    throw 'Public Games output must not force Steam links into an unannounced new tab.'
  }
}

$rawSocialPath = Join-Path $SiteDir 'games/idle-times/idle-times-packaged-desk-1920x1080.png'
if (Test-Path -LiteralPath $rawSocialPath -PathType Leaf) {
  throw 'Idle Times metadata must not publish the original full-size gameplay PNG.'
}
$processedSocialRelativePath = 'images/games/idle-times/social-1200w.jpg'
$processedSocialPath = Join-Path $SiteDir $processedSocialRelativePath
if (-not (Test-Path -LiteralPath $processedSocialPath -PathType Leaf)) {
  throw 'Idle Times metadata must publish the processed 1200px social image.'
}
$processedSocialUrl = "https://outsideinprint.org/$processedSocialRelativePath"
if ($idleHtml -notmatch [regex]::Escape($processedSocialUrl)) {
  throw 'Idle Times metadata must reference the processed social image.'
}

$sitemapPath = Join-Path $SiteDir 'sitemap.xml'
if (-not (Test-Path -LiteralPath $sitemapPath -PathType Leaf)) { throw 'Public build is missing sitemap.xml.' }
$sitemap = Get-Content -LiteralPath $sitemapPath -Raw -Encoding utf8
$expectedGamesUrls = @('https://outsideinprint.org/games/', 'https://outsideinprint.org/games/idle-times/')
foreach ($url in $expectedGamesUrls) {
  $entryPattern = '<loc>' + [regex]::Escape($url) + '</loc>'
  if ([regex]::Matches($sitemap, $entryPattern).Count -ne 1) { throw "Expected one Games sitemap entry: $url" }
}
$actualGamesUrls = @([regex]::Matches($sitemap, '<loc>(https://outsideinprint\.org/games/[^<]*)</loc>') | ForEach-Object { $_.Groups[1].Value })
if ($actualGamesUrls.Count -ne 2) { throw "Expected exactly two Games sitemap entries; found $($actualGamesUrls.Count)." }

Write-Host 'Idle Times-only Games public-candidate contract passed.'
$global:LASTEXITCODE = 0
exit 0
