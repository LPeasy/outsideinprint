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
  'almanack/index.html',
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
  'almanack/2026-08-22/index.html',
  'almanack/2026-08-29/index.html',
  'almanack/2026-09-26/index.html',
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
  'shop/thanks/index.html',
  'shop/the-water-cycle/index.html',
  'studio/index.html',
  'support/index.html',
  'support/cancellation-refunds/index.html',
  'support/thanks/index.html',
  'terms/index.html'
)) {
  $null = Get-RequiredPageHtml -RelativePath $requiredPath
}

foreach ($forbiddenPath in @(
  'shipping-returns/index.html',
  'shop/long-shots-in-the-big-league/index.html'
)) {
  $fullPath = Join-Path $SiteDir $forbiddenPath
  if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
    throw "Expected excluded route not to be emitted: $forbiddenPath"
  }
}

$almanackFrontDoorHtml = Get-RequiredPageHtml -RelativePath 'almanack/index.html'
$almanackFrontDoorCanonical = Get-LinkHrefByRel -Html $almanackFrontDoorHtml -Rel 'canonical'
if ($almanackFrontDoorCanonical -ne 'https://outsideinprint.org/collections/bobs-almanack/') {
  throw "Expected /almanack/ to canonicalize to the Bob's Almanack collection, found '$almanackFrontDoorCanonical'."
}
if ($almanackFrontDoorHtml -notmatch '<meta\s+name=(?:"robots"|robots)\s+content=(?:"noindex, follow"|noindex,\s*follow)' -or
    $almanackFrontDoorHtml -notmatch '<meta\s+http-equiv=(?:"refresh"|refresh)\s+content=(?:"0; url=/collections/bobs-almanack/"|0;\s*url=/collections/bobs-almanack/)' -or
    $almanackFrontDoorHtml -notmatch 'window\.location\.replace\("/collections/bobs-almanack/"\)' -or
    $almanackFrontDoorHtml -notmatch 'href=(?:"/collections/bobs-almanack/"|/collections/bobs-almanack/)>\s*Bob(?:''|&#39;)s Almanack\s*</a>') {
  throw 'Expected /almanack/ to be a noindex canonical redirect with a visible fallback link to the existing Bob''s Almanack register.'
}
if ($almanackFrontDoorHtml -match 'almanack-collection__register|newsletter-signup') {
  throw 'Expected /almanack/ not to duplicate the collection register or newsletter form.'
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

$appsOutput = Join-Path $SiteDir 'apps'
if ((Test-Path -LiteralPath $appsOutput) -and @(Get-ChildItem -LiteralPath $appsOutput -File -Recurse).Count -gt 0) {
  throw 'Hidden Apps routes and sample resources must not be emitted.'
}
$studioHtml = Get-RequiredPageHtml -RelativePath 'studio/index.html'
$studioHeadings = @([regex]::Matches($studioHtml, '<h1\b[^>]*>\s*You have the material\. I make it ready to publish\.\s*</h1>', 'IgnoreCase'))
if ($studioHeadings.Count -ne 1) {
  throw 'Expected the public Studio route to render one approved H1.'
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
