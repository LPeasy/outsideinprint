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
  'almanack/index.html'
)) {
  $fullPath = Join-Path $SiteDir $forbiddenPath
  if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
    throw "Expected excluded route not to be emitted: $forbiddenPath"
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

if ($appsHtml -notmatch '<h1\b[^>]*>Apps (?:&amp;|&) Tools</h1>') {
  throw 'Expected the public Apps & Tools route to render its single H1.'
}
if ($bucksHtml -notmatch '<h1\b[^>]*>Bucks Machine</h1>') {
  throw 'Expected the public Bucks Machine route to render its single H1.'
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

$authorDirectoryHtml = Get-RequiredPageHtml -RelativePath 'authors/index.html'
$authorDirectoryCanonical = Get-LinkHrefByRel -Html $authorDirectoryHtml -Rel 'canonical'
if ($authorDirectoryCanonical -ne 'https://outsideinprint.org/authors/') {
  throw "Expected authors directory canonical to be https://outsideinprint.org/authors/, found '$authorDirectoryCanonical'."
}

$authorDirectoryRobots = Get-MetaContent -Html $authorDirectoryHtml -AttributeName 'name' -AttributeValue 'robots'
if ($authorDirectoryRobots -ne 'noindex, follow') {
  throw "Expected authors directory robots meta to be 'noindex, follow', found '$authorDirectoryRobots'."
}

Write-Host 'Public route smoke test passed.'
$global:LASTEXITCODE = 0
exit 0
