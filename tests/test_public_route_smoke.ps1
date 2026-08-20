param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "public")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-AttributeValue {
  param(
    [string]$Tag,
    [string]$Name
  )

  $pattern = '\b' + [regex]::Escape($Name) + '\s*=\s*(?:"([^"]*)"|''([^'']*)''|([^\s>]+))'
  $match = [regex]::Match($Tag, $pattern, 'IgnoreCase')
  if (-not $match.Success) {
    return $null
  }

  foreach ($index in 1..3) {
    if ($match.Groups[$index].Success) {
      return $match.Groups[$index].Value
    }
  }

  return $null
}

function Get-OpenTags {
  param(
    [string]$Html,
    [string]$TagName
  )

  return @([regex]::Matches($Html, '<' + [regex]::Escape($TagName) + '\b[^>]*>', 'IgnoreCase') | ForEach-Object { $_.Value })
}

function Get-MetaContent {
  param(
    [string]$Html,
    [string]$AttributeName,
    [string]$AttributeValue
  )

  foreach ($tag in (Get-OpenTags -Html $Html -TagName 'meta')) {
    if ((Get-AttributeValue -Tag $tag -Name $AttributeName) -eq $AttributeValue) {
      return (Get-AttributeValue -Tag $tag -Name 'content')
    }
  }

  return $null
}

function Get-LinkHrefByRel {
  param(
    [string]$Html,
    [string]$Rel
  )

  foreach ($tag in (Get-OpenTags -Html $Html -TagName 'link')) {
    if ((Get-AttributeValue -Tag $tag -Name 'rel') -eq $Rel) {
      return (Get-AttributeValue -Tag $tag -Name 'href')
    }
  }

  return $null
}

function Get-RequiredPageHtml {
  param([string]$RelativePath)

  $fullPath = Join-Path $SiteDir $RelativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing built route required for smoke coverage: $RelativePath"
  }

  return (Get-Content -Path $fullPath -Raw)
}

foreach ($requiredPath in @(
  'about/index.html',
  'authors/index.html',
  'authors/robert-v-ussley/index.html',
  'apps/index.html',
  'apps/bucks-machine/index.html',
  'apps/baseball-upside-risk/index.html',
  'almanack/2026-05-02/index.html',
  'almanack/2026-05-09/index.html',
  'almanack/2026-05-16/index.html',
  'almanack/2026-05-23/index.html',
  'almanack/2026-05-30/index.html',
  'almanack/2026-06-06/index.html',
  'almanack/2026-07-18/index.html',
  'almanack/2026-07-25/index.html',
  'almanack/2026-08-08/index.html',
  'almanack/2026-08-15/index.html',
  'collections/bobs-almanack/index.html',
  'collections/musings/index.html',
  'collections/the-things-we-say/index.html',
  'collections/what-you-tell-yourself/index.html',
  'essays/i-do-what-i-say/index.html',
  'gallery/index.html',
  'contact/index.html',
  'epub-license-refunds/index.html',
  'privacy/index.html',
  'random/index.html',
  'shop/index.html',
  'shop/the-american-nightmare-keep-dreaming-kid/index.html',
  'shop/the-parable-of-the-sheep/index.html',
  'shop/the-water-cycle/index.html',
  'support/index.html',
  'support/cancellation-refunds/index.html',
  'support/thanks/index.html',
  'terms/index.html'
)) {
  $null = Get-RequiredPageHtml -RelativePath $requiredPath
}

foreach ($forbiddenPath in @(
  'almanack/index.html',
  'shipping-returns/index.html',
  'shop/long-shots-in-the-big-league/index.html'
)) {
  $fullPath = Join-Path $SiteDir $forbiddenPath
  if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
    throw "Expected excluded route not to be emitted: $forbiddenPath"
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$gamesIndexSourcePath = Join-Path $repoRoot 'content/games/_index.md'
if (Test-Path -LiteralPath $gamesIndexSourcePath -PathType Leaf) {
  $gamesIndexSource = Get-Content -LiteralPath $gamesIndexSourcePath -Raw -Encoding utf8
  $gamesSourceIsDraft = $gamesIndexSource -match '(?m)^draft:\s*true\s*$'
  if ($gamesSourceIsDraft) {
    foreach ($forbiddenGamesPath in @(
      'games/index.html',
      'games/idle-times/index.html'
    )) {
      if (Test-Path -LiteralPath (Join-Path $SiteDir $forbiddenGamesPath) -PathType Leaf) {
        throw "Expected draft Games route not to be emitted: $forbiddenGamesPath"
      }
    }
  }
  else {
    $null = Get-RequiredPageHtml -RelativePath 'games/index.html'
    $null = Get-RequiredPageHtml -RelativePath 'games/idle-times/index.html'
    $gamesIndexFiles = @(Get-ChildItem -LiteralPath (Join-Path $SiteDir 'games') -Filter 'index.html' -File -Recurse)
    if ($gamesIndexFiles.Count -ne 2) {
      throw "Expected exactly two public Games routes; found $($gamesIndexFiles.Count)."
    }
  }
}

foreach ($sampleRelativePath in @(
  'apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.pdf',
  'apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.xlsx'
)) {
  $samplePath = Join-Path $SiteDir $sampleRelativePath
  if (-not (Test-Path -LiteralPath $samplePath -PathType Leaf)) {
    throw "Missing reviewed public Bucks Machine sample: $sampleRelativePath"
  }
}

$appsHtml = Get-RequiredPageHtml -RelativePath 'apps/index.html'
$bucksHtml = Get-RequiredPageHtml -RelativePath 'apps/bucks-machine/index.html'
$baseballHtml = Get-RequiredPageHtml -RelativePath 'apps/baseball-upside-risk/index.html'

if ($appsHtml -notmatch '<h1\b[^>]*>Apps (?:&amp;|&) Tools</h1>') {
  throw 'Expected the public Apps & Tools route to render its single H1.'
}
if ($bucksHtml -notmatch '<h1\b[^>]*>Bucks Machine</h1>') {
  throw 'Expected the public Bucks Machine route to render its single H1.'
}
if ($baseballHtml -notmatch '<h1\b[^>]*>Baseball Upside Risk</h1>') {
  throw 'Expected the public Baseball Upside Risk route to render its single H1.'
}
if ($appsHtml.IndexOf('Bucks Machine', [StringComparison]::Ordinal) -ge $appsHtml.IndexOf('Baseball Upside Risk', [StringComparison]::Ordinal)) {
  throw 'Expected Bucks Machine to remain the first Apps card and Baseball Upside Risk to remain second.'
}
foreach ($requiredText in @(
  'Bucks Machine, a product operated and sold by Outside In Print LLC.',
  'support@outsideinprint.org',
  'Not currently available for use or purchase.',
  'bucks-machine-synthetic-professional-services-demo.pdf',
  'bucks-machine-synthetic-professional-services-demo.xlsx'
)) {
  if ($bucksHtml -notmatch [regex]::Escape($requiredText)) {
    throw "Expected public Bucks Machine output to include: $requiredText"
  }
}
if ($bucksHtml -match '(?i)<form\b|stripe|checkout|waitlist|available now') {
  throw 'Public Bucks Machine output exposed a forbidden commercial or intake surface.'
}

foreach ($requiredText in @(
  'Baseball Upside Risk, a product operated and sold by Outside In Print LLC.',
  'The interactive calculator and personalized reports are not currently available for use or purchase.',
  'This static preview collects no player profile, name, school, email address, payment, or report request.',
  'This frozen B-GERM snapshot was generated May 14, 2026. It uses 2024-25 participation inputs and 2025 draft inputs; it is not a live 2026 probability estimate.',
  'May 14, 2026',
  '1,000,000 fixed-seed draws',
  'Long Shots in the Big League',
  'Baseball, Gross Earnings, and the Arithmetic of Risk',
  'Companion publication in preparation',
  'support@outsideinprint.org'
)) {
  if ($baseballHtml -notmatch [regex]::Escape($requiredText)) {
    throw "Expected public Baseball Upside Risk output to include: $requiredText"
  }
}
$priorIndex = -1
foreach ($value in @('$0', '99.509%', '0.491%', '0.535%', '0.495%', '0.141%', '$27,201')) {
  $valueIndex = $baseballHtml.IndexOf($value, $priorIndex + 1, [StringComparison]::Ordinal)
  if ($valueIndex -le $priorIndex) {
    throw "Frozen Baseball value is missing or out of order in public output: $value"
  }
  $priorIndex = $valueIndex
}
$baseballMainMatch = [regex]::Match($baseballHtml, '(?is)<main\b[^>]*>(.*?)</main>')
if (-not $baseballMainMatch.Success) {
  throw 'Public Baseball output is missing its main region.'
}
$baseballMain = $baseballMainMatch.Groups[1].Value
$mainAnchors = @([regex]::Matches($baseballMain, '<a\b[^>]*>', 'IgnoreCase'))
if ($mainAnchors.Count -ne 1 -or $mainAnchors[0].Value -notmatch 'href=(?:["''])?mailto:support@outsideinprint\.org') {
  throw 'The LLC support mailto must be the only interactive link in the Baseball product main region.'
}
if ($baseballMain -match '(?i)<(?:form|input|select|textarea|button)\b|\bdownload(?:\s|=|>)|stripe|checkout|waitlist|\$19|\$49|\$500') {
  throw 'Public Baseball output exposed an intake, download, interactive, commercial, or legacy-price surface.'
}
$companionMatch = [regex]::Match($baseballMain, '(?is)<section\b[^>]*class=(?:["''])?apps-companion(?:["''])?[^>]*>(.*?)</section>')
if (-not $companionMatch.Success) {
  throw 'Public Baseball output is missing the companion-publication notice.'
}
if ($companionMatch.Value -match '(?i)<a\b|Robert V\. Ussley|\bbyline\b|\bcover\b|\bprice\b|\bASIN\b|\bKDP\b|\bpre-?order\b') {
  throw 'The public companion notice exposed a link, byline, cover, or release/commerce data.'
}

$authorDirectoryHtml = Get-RequiredPageHtml -RelativePath 'authors/index.html'
$authorDirectoryCanonical = Get-LinkHrefByRel -Html $authorDirectoryHtml -Rel 'canonical'
if ($authorDirectoryCanonical -ne 'https://outsideinprint.org/authors/') {
  throw "Expected authors directory canonical to be https://outsideinprint.org/authors/, found '$authorDirectoryCanonical'."
}

$authorDirectoryRobots = Get-MetaContent -Html $authorDirectoryHtml -AttributeName 'name' -AttributeValue 'robots'
if ($authorDirectoryRobots -ne 'noindex, follow') {
  throw "Expected authors directory robots meta to be 'noindex, follow', found '$authorDirectoryRobots'."
}

& (Join-Path $PSScriptRoot 'test_direct_commerce_storefront_contract.ps1') -SiteDir $SiteDir

Write-Host 'Public route smoke test passed.'
$global:LASTEXITCODE = 0
exit 0
