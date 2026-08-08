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

$idleAssets = @(
  'games/idle-times/idle-times-main-capsule.png',
  'games/idle-times/idle-times-packaged-desk-1920x1080.png',
  'games/idle-times/idle-times-packaged-library-1920x1080.png'
)
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

if ([regex]::Matches($gamesHtml, '<article\s+class=(?:"games-card"|games-card(?:\s|>))').Count -ne 1) {
  throw 'Public Games catalog must contain exactly one game card.'
}
$idleCardLinks = [regex]::Matches($gamesHtml, 'href=(?:"/games/idle-times/"|/games/idle-times/(?:\s|>))').Count
if ($idleCardLinks -lt 1) { throw 'Public catalog must link Idle Times.' }

foreach ($asset in $idleAssets) {
  if (-not (Test-Path -LiteralPath (Join-Path $SiteDir $asset) -PathType Leaf)) {
    throw "Public Idle media is missing: $asset"
  }
}
$expectedAssetHashes = @{
  'games/idle-times/idle-times-main-capsule.png' = '5797E830C285688A3E5F6840FD189D8281AD31320AF2388074FB3016EE853109'
  'games/idle-times/idle-times-packaged-desk-1920x1080.png' = '0D5C4E1D01F10F4E8D070DB2CE555C55D66655F1ECFD66DF4ADBFD38EEF7B339'
  'games/idle-times/idle-times-packaged-library-1920x1080.png' = '0EAC2DD310F4A6365666F1662B814AD28D6B8EE3E3558DDF3947FD1658A7B954'
}
foreach ($asset in $expectedAssetHashes.Keys) {
  $actualHash = (Get-FileHash -LiteralPath (Join-Path $SiteDir $asset) -Algorithm SHA256).Hash
  if ($actualHash -cne $expectedAssetHashes[$asset]) { throw "Public Idle media hash changed: $asset" }
}

foreach ($required in @(
  'Coming to Steam August 25, 2026.',
  'Full Desk, Mini Companion, and Pet Desk',
  '78 illustrated rewards',
  'Seven bundled tracks',
  'fixed, pre-generated AI-assisted visual art',
  'support@outsideinprint.org',
  'https://store.steampowered.com/app/4978200/Idle_Times/'
)) {
  if ($idleHtml -notmatch [regex]::Escape($required)) { throw "Public Idle output is missing: $required" }
}
foreach ($required in @(
  'Coming to Steam August 25, 2026.',
  'Games is a descriptive catalog operated by <strong>Outside In Print LLC</strong>. It is not a separate business or publisher identity.'
)) {
  if ($gamesHtml -notmatch [regex]::Escape($required)) { throw "Public Games catalog is missing: $required" }
}

foreach ($html in @($gamesHtml, $idleHtml)) {
  if ($html -match '(?i)<(?:form|input|select|textarea)\b|stripe|checkout|waitlist|[$€£]\s*\d|\?utm_|<video\b|\.(?:webm|mp4)') {
    throw 'Public Games output exposed commerce, intake, tracking, or trailer media.'
  }
  if ($html -match '(?i)Steam (?:seller|payee|tax|bank)') {
    throw 'Public Games output makes an unverified Steam account-identity claim.'
  }
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
