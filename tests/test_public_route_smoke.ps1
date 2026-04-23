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
  'gallery/index.html',
  'random/index.html',
  'shop/index.html',
  'shop/hat/index.html',
  'shop/shirt/index.html',
  'shop/tote/index.html'
)) {
  $null = Get-RequiredPageHtml -RelativePath $requiredPath
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
