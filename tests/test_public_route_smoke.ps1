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
  'duel/privacy/index.html',
  'duel/support/index.html',
  'authors/index.html',
  'authors/robert-v-ussley/index.html',
  'almanack/2026-05-02/index.html',
  'almanack/2026-05-09/index.html',
  'almanack/2026-05-16/index.html',
  'almanack/2026-05-23/index.html',
  'almanack/2026-05-30/index.html',
  'almanack/2026-06-06/index.html',
  'almanack/2026-07-18/index.html',
  'almanack/2026-07-25/index.html',
  'collections/bobs-almanack/index.html',
  'collections/musings/index.html',
  'collections/the-things-we-say/index.html',
  'collections/what-you-tell-yourself/index.html',
  'essays/i-do-what-i-say/index.html',
  'gallery/index.html',
  'random/index.html',
  'shop/index.html',
  'shop/the-american-nightmare-keep-dreaming-kid/index.html',
  'shop/the-parable-of-the-sheep/index.html',
  'shop/the-water-cycle/index.html'
)) {
  $null = Get-RequiredPageHtml -RelativePath $requiredPath
}

foreach ($forbiddenPath in @(
  'almanack/index.html',
  'duel/index.html'
)) {
  $fullPath = Join-Path $SiteDir $forbiddenPath
  if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
    throw "Expected the Almanack section index not to be emitted: $forbiddenPath"
  }
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

$duelSupportHtml = Get-RequiredPageHtml -RelativePath 'duel/support/index.html'
$duelSupportCanonical = Get-LinkHrefByRel -Html $duelSupportHtml -Rel 'canonical'
if ($duelSupportCanonical -ne 'https://outsideinprint.org/duel/support/') {
  throw "Expected Duel support canonical to be https://outsideinprint.org/duel/support/, found '$duelSupportCanonical'."
}
$duelSupportRobots = Get-MetaContent -Html $duelSupportHtml -AttributeName 'name' -AttributeValue 'robots'
if ($duelSupportRobots -ne 'index, follow, max-image-preview:large') {
  throw "Expected Duel support robots meta to allow indexation, found '$duelSupportRobots'."
}
if ($duelSupportHtml -notmatch 'class="duel-info-route"') {
  throw 'Expected Duel support to use the dedicated Duel information layout.'
}
if ($duelSupportHtml -notmatch 'mailto:support@outsideinprint\.org') {
  throw 'Expected Duel support to expose the support email.'
}
if ($duelSupportHtml -notmatch 'href="https://outsideinprint\.org/duel/privacy/"') {
  throw 'Expected Duel support to link to the Duel privacy policy.'
}

$duelPrivacyHtml = Get-RequiredPageHtml -RelativePath 'duel/privacy/index.html'
$duelPrivacyCanonical = Get-LinkHrefByRel -Html $duelPrivacyHtml -Rel 'canonical'
if ($duelPrivacyCanonical -ne 'https://outsideinprint.org/duel/privacy/') {
  throw "Expected Duel privacy canonical to be https://outsideinprint.org/duel/privacy/, found '$duelPrivacyCanonical'."
}
$duelPrivacyRobots = Get-MetaContent -Html $duelPrivacyHtml -AttributeName 'name' -AttributeValue 'robots'
if ($duelPrivacyRobots -ne 'index, follow, max-image-preview:large') {
  throw "Expected Duel privacy robots meta to allow indexation, found '$duelPrivacyRobots'."
}
if ($duelPrivacyHtml -notmatch 'class="duel-info-route"') {
  throw 'Expected Duel privacy to use the dedicated Duel information layout.'
}
if ($duelPrivacyHtml -notmatch 'mailto:support@outsideinprint\.org') {
  throw 'Expected Duel privacy to expose the support email.'
}
if ($duelPrivacyHtml -notmatch 'href="https://outsideinprint\.org/duel/support/"') {
  throw 'Expected Duel privacy to link to Duel support.'
}

Write-Host 'Public route smoke test passed.'
$global:LASTEXITCODE = 0
exit 0
