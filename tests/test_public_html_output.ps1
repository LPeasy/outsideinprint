#requires -Version 7.0

param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "public"),
  [string]$ExpectedHomePath = "/",
  [switch]$RequireFreshBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot 'helpers/public_output_common.ps1')

function Format-SampleList {
  param(
    [object[]]$Items,
    [int]$Limit = 5
  )

  if (-not $Items -or $Items.Count -eq 0) {
    return ""
  }

  return (($Items | Select-Object -First $Limit) -join "; ")
}

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

function Get-LinkHrefsByRelAndType {
  param(
    [string]$Html,
    [string]$Rel,
    [string]$Type
  )

  return @(
    Get-OpenTags -Html $Html -TagName 'link' |
      Where-Object {
        (Get-AttributeValue -Tag $_ -Name 'rel') -eq $Rel -and
        (Get-AttributeValue -Tag $_ -Name 'type') -eq $Type
      } |
      ForEach-Object { Get-AttributeValue -Tag $_ -Name 'href' } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
}

function Get-JsonLdObjects {
  param([string]$Html)

  $results = New-Object System.Collections.Generic.List[object]
  $matches = [regex]::Matches($Html, '(?is)<script\b[^>]*type\s*=\s*(?:"application/ld\+json"|''application/ld\+json''|application/ld\+json)[^>]*>(.*?)</script>')

  foreach ($match in $matches) {
    $json = $match.Groups[1].Value.Trim()
    if ([string]::IsNullOrWhiteSpace($json)) {
      continue
    }

    $results.Add(($json | ConvertFrom-Json -Depth 50))
  }

  return $results.ToArray()
}

function Get-JsonLdNodes {
  param([object[]]$Objects)

  $nodes = New-Object System.Collections.Generic.List[object]
  foreach ($object in $Objects) {
    if ($null -eq $object) {
      continue
    }

    if ($null -ne $object.'@graph') {
      foreach ($node in @($object.'@graph')) {
        $nodes.Add($node)
      }
    }
    else {
      $nodes.Add($object)
    }
  }

  return $nodes.ToArray()
}

function Get-JsonLdNodesByType {
  param(
    [object[]]$Nodes,
    [string]$Type
  )

  $matches = @(
    $Nodes | Where-Object {
      $nodeType = $_.'@type'
      if ($nodeType -is [System.Array]) {
        return $nodeType -contains $Type
      }

      return $nodeType -eq $Type
    }
  )

  return ,$matches
}

function Get-SitemapLocs {
  param([string]$Xml)

  return @([regex]::Matches($Xml, '(?is)<loc>\s*([^<]+)\s*</loc>') | ForEach-Object { $_.Groups[1].Value.Trim() })
}

function Test-TagHasClass {
  param(
    [string]$Tag,
    [string]$ClassName
  )

  $classValue = Get-AttributeValue -Tag $Tag -Name 'class'
  if ([string]::IsNullOrWhiteSpace($classValue)) {
    return $false
  }

  $classes = @($classValue -split '\s+' | Where-Object { $_ })
  return $classes -contains $ClassName
}

function Get-HeadingLevels {
  param([string]$Html)

  return @([regex]::Matches($Html, '<h([1-6])\b', 'IgnoreCase') | ForEach-Object { [int]$_.Groups[1].Value })
}

function Convert-YamlScalarToString {
  param([string]$Value)

  $trimmed = $Value.Trim()
  if (($trimmed.StartsWith('"') -and $trimmed.EndsWith('"')) -or ($trimmed.StartsWith("'") -and $trimmed.EndsWith("'"))) {
    return $trimmed.Substring(1, $trimmed.Length - 2)
  }

  return $trimmed
}

function Get-FrontMatterScalarFromMarkdownFile {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return ''
  }

  $content = Get-Content -Path $Path -Raw
  $match = [regex]::Match($content, '(?s)\A---\r?\n(.*?)\r?\n---\r?\n?')
  if (-not $match.Success) {
    return ''
  }

  $frontMatter = $match.Groups[1].Value
  $scalarMatch = [regex]::Match($frontMatter, '(?m)^' + [regex]::Escape($Key) + ':\s*(.+?)\s*$')
  if (-not $scalarMatch.Success) {
    return ''
  }

  return Convert-YamlScalarToString -Value $scalarMatch.Groups[1].Value
}

function Test-ExpectedEntryHasKey {
  param(
    [object]$Entry,
    [string]$Key
  )

  if ($null -eq $Entry) {
    return $false
  }

  if ($Entry -is [System.Collections.IDictionary]) {
    return $Entry.Contains($Key)
  }

  return ($null -ne $Entry.PSObject.Properties[$Key])
}

function Get-ExpectedEntryValue {
  param(
    [object]$Entry,
    [string]$Key,
    $Default = $null
  )

  if (-not (Test-ExpectedEntryHasKey -Entry $Entry -Key $Key)) {
    return $Default
  }

  if ($Entry -is [System.Collections.IDictionary]) {
    return $Entry[$Key]
  }

  return $Entry.PSObject.Properties[$Key].Value
}

function Test-ExpectedFlag {
  param(
    [object]$Entry,
    [string]$Key
  )

  return [bool](Get-ExpectedEntryValue -Entry $Entry -Key $Key -Default $false)
}

function Get-CurrentCartoonValue {
  param(
    [string]$RepoRoot,
    [string]$Key
  )

  $dataPath = Join-Path $RepoRoot 'data\editorial_cartoons.yaml'
  if (-not (Test-Path -LiteralPath $dataPath -PathType Leaf)) {
    throw "Editorial cartoon data file not found: $dataPath"
  }

  $currentSlug = $null
  $inCurrentEntry = $false
  foreach ($line in Get-Content -Path $dataPath) {
    if ($line -match '^current:\s*(.+)\s*$') {
      $currentSlug = Convert-YamlScalarToString -Value $Matches[1]
      continue
    }

    if ($line -match '^\s*-\s+slug:\s*(.+)\s*$') {
      $slug = Convert-YamlScalarToString -Value $Matches[1]
      $inCurrentEntry = ($null -ne $currentSlug -and $slug -eq $currentSlug)
      continue
    }

    if ($inCurrentEntry -and $line -match ('^\s+' + [regex]::Escape($Key) + ':\s*(.+)\s*$')) {
      return (Convert-YamlScalarToString -Value $Matches[1])
    }
  }

  return ''
}

function Get-CurrentCartoonSlug {
  param([string]$RepoRoot)

  $dataPath = Join-Path $RepoRoot 'data\editorial_cartoons.yaml'
  if (-not (Test-Path -LiteralPath $dataPath -PathType Leaf)) {
    throw "Editorial cartoon data file not found: $dataPath"
  }

  foreach ($line in Get-Content -Path $dataPath) {
    if ($line -match '^current:\s*(.+)\s*$') {
      return (Convert-YamlScalarToString -Value $Matches[1])
    }
  }

  return ''
}

function Get-CartoonEntries {
  param([string]$RepoRoot)

  $dataPath = Join-Path $RepoRoot 'data\editorial_cartoons.yaml'
  if (-not (Test-Path -LiteralPath $dataPath -PathType Leaf)) {
    throw "Editorial cartoon data file not found: $dataPath"
  }

  $entries = New-Object System.Collections.Generic.List[object]
  $entry = $null
  foreach ($line in Get-Content -Path $dataPath) {
    if ($line -match '^\s*-\s+slug:\s*(.+)\s*$') {
      if ($null -ne $entry) {
        $entries.Add([pscustomobject]$entry)
      }
      $entry = [ordered]@{ slug = (Convert-YamlScalarToString -Value $Matches[1]) }
      continue
    }

    if ($null -ne $entry -and $line -match '^\s+([A-Za-z_]+):\s*(.+?)\s*$') {
      $entry[$Matches[1]] = Convert-YamlScalarToString -Value $Matches[2]
    }
  }

  if ($null -ne $entry) {
    $entries.Add([pscustomobject]$entry)
  }

  return $entries.ToArray()
}

function Get-OipEasternTimeZone {
  try {
    return [System.TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')
  }
  catch {
    return [System.TimeZoneInfo]::FindSystemTimeZoneById('America/New_York')
  }
}

function ConvertTo-OipDateTimeOffset {
  param([string]$Value)

  $trimmed = ([string]$Value).Trim()
  if ($trimmed -match '^\d{4}-\d{2}-\d{2}$') {
    $date = [datetime]::ParseExact($trimmed, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $eastern = Get-OipEasternTimeZone
    $offset = $eastern.GetUtcOffset($date)
    return [datetimeoffset]::new($date.Year, $date.Month, $date.Day, 0, 0, 0, $offset)
  }

  return [datetimeoffset]::Parse($trimmed, [Globalization.CultureInfo]::InvariantCulture)
}

function Test-CartoonEntryPublished {
  param([object]$Entry)

  if ([string]$env:HUGO_BUILD_FUTURE_CARTOONS -match '(?i)^(true|1|yes)$') {
    return $true
  }

  $releaseValue = if ($Entry.PSObject.Properties.Name -contains 'publishDate') { [string]$Entry.publishDate } else { [string]$Entry.date }
  if ([string]::IsNullOrWhiteSpace($releaseValue)) {
    return $false
  }

  $easternNow = [System.TimeZoneInfo]::ConvertTime([datetimeoffset]::UtcNow, (Get-OipEasternTimeZone))
  return (ConvertTo-OipDateTimeOffset -Value $releaseValue) -le $easternNow
}

function Get-PublishedCartoonEntries {
  param([string]$RepoRoot)

  return @(
    Get-CartoonEntries -RepoRoot $RepoRoot |
      Where-Object { Test-CartoonEntryPublished -Entry $_ }
  )
}

function Get-PublicCurrentCartoonEntry {
  param([string]$RepoRoot)

  $rawCurrentSlug = Get-CurrentCartoonSlug -RepoRoot $RepoRoot
  $publishedCartoons = @(Get-PublishedCartoonEntries -RepoRoot $RepoRoot)
  $current = @($publishedCartoons | Where-Object { $_.slug -eq $rawCurrentSlug } | Select-Object -First 1)
  if ($current.Count -gt 0) {
    return $current[0]
  }

  $latest = @(
    $publishedCartoons |
      Sort-Object @{ Expression = { $_.date }; Descending = $true }, @{ Expression = { $_.slug }; Ascending = $true } |
      Select-Object -First 1
  )
  if ($latest.Count -gt 0) {
    return $latest[0]
  }

  return $null
}
function Get-SemanticPageIssues {
  param(
    [string]$RelativePath,
    [string]$Html,
    [string]$ExpectedH1Class,
    [bool]$RequireSecondaryHeading
  )

  $issues = New-Object System.Collections.Generic.List[string]
  $headingLevels = @(Get-HeadingLevels -Html $Html)
  $h1Tags = @(Get-OpenTags -Html $Html -TagName 'h1')
  $mainTags = @(Get-OpenTags -Html $Html -TagName 'main')
  $headerTags = @(Get-OpenTags -Html $Html -TagName 'header')
  $navTags = @(Get-OpenTags -Html $Html -TagName 'nav')

  if ($mainTags.Count -ne 1) {
    $issues.Add("$RelativePath => expected exactly one <main>, found $($mainTags.Count)")
  }
  elseif ((Get-AttributeValue -Tag $mainTags[0] -Name 'id') -ne 'main-content') {
    $issues.Add("$RelativePath => expected <main id=""main-content"">")
  }

  $siteHeaderCount = @($headerTags | Where-Object { Test-TagHasClass -Tag $_ -ClassName 'site-header' }).Count
  if ($siteHeaderCount -ne 1) {
    $issues.Add("$RelativePath => expected exactly one site header, found $siteHeaderCount")
  }

  $primaryNavCount = @($navTags | Where-Object { (Get-AttributeValue -Tag $_ -Name 'aria-label') -eq 'Primary' }).Count
  if ($primaryNavCount -ne 1) {
    $issues.Add("$RelativePath => expected exactly one primary navigation landmark, found $primaryNavCount")
  }

  if ($h1Tags.Count -ne 1) {
    $issues.Add("$RelativePath => expected exactly one <h1>, found $($h1Tags.Count)")
  }
  elseif (-not (Test-TagHasClass -Tag $h1Tags[0] -ClassName $ExpectedH1Class)) {
    $issues.Add("$RelativePath => expected the page-level h1 to carry class '$ExpectedH1Class'")
  }

  if ($headingLevels.Count -eq 0) {
    $issues.Add("$RelativePath => expected at least one heading")
  }
  elseif ($headingLevels[0] -ne 1) {
    $issues.Add("$RelativePath => expected the first heading level to be h1, found h$($headingLevels[0])")
  }

  if ($RequireSecondaryHeading) {
    $h2Count = @($headingLevels | Where-Object { $_ -eq 2 }).Count
    if ($h2Count -eq 0) {
      $issues.Add("$RelativePath => expected at least one h2 after the page-level h1")
    }
  }

  return $issues
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$currentCartoon = Get-PublicCurrentCartoonEntry -RepoRoot $repoRoot
$currentCartoonSlug = if ($null -ne $currentCartoon) { [string]$currentCartoon.slug } else { '' }
$currentCartoonImagePath = if ($null -ne $currentCartoon -and ($currentCartoon.PSObject.Properties.Name -contains 'image')) { [string]$currentCartoon.image } else { '' }
$currentCartoonImagePattern = [regex]::Escape($currentCartoonImagePath)
$currentCartoonEssayPath = if ($null -ne $currentCartoon -and ($currentCartoon.PSObject.Properties.Name -contains 'essay')) { [string]$currentCartoon.essay } else { '' }
$currentCartoonEssayPattern = 'data-essay=(?:"' + [regex]::Escape($currentCartoonEssayPath) + '"|' + [regex]::Escape($currentCartoonEssayPath) + ')'
$currentCartoonCaption = if ($null -ne $currentCartoon -and ($currentCartoon.PSObject.Properties.Name -contains 'caption')) { [string]$currentCartoon.caption } else { '' }
$recentHomeCartoons = @(
  Get-PublishedCartoonEntries -RepoRoot $repoRoot |
    Where-Object { $_.slug -ne $currentCartoonSlug } |
    Sort-Object @{ Expression = { $_.date }; Descending = $true }, @{ Expression = { $_.slug }; Ascending = $true } |
    Select-Object -First 4
)
$recentHomeCartoonSlugs = @($recentHomeCartoons | ForEach-Object { $_.slug })
$freshness = Test-PublicBuildFreshness -RepoRoot $repoRoot -SiteDir $SiteDir
if (-not $freshness.IsFresh) {
  $message = "Generated-output regression test requires a fresh Hugo build. $($freshness.Reason)"
  if ($RequireFreshBuild) {
    throw $message
  }

  Write-Host ("Skipping generated-output regression test: {0}" -f $freshness.Reason)
  Write-Host "Template-contract tests remain authoritative until public/ is rebuilt."
  $global:LASTEXITCODE = 0
  exit 0
}

$htmlFiles = @(Get-ChildItem -Path $SiteDir -Recurse -File -Filter "*.html")
if ($htmlFiles.Count -eq 0) {
  throw "No HTML files found under $SiteDir"
}

$runningHeaderMatches = 0
$runningHeaderIssues = New-Object System.Collections.Generic.List[string]
$rootRelativeImageIssues = New-Object System.Collections.Generic.List[string]
$zgotmplzIssues = New-Object System.Collections.Generic.List[string]
$semanticIssues = New-Object System.Collections.Generic.List[string]
$importedMediaIssues = New-Object System.Collections.Generic.List[string]
$metadataIssues = New-Object System.Collections.Generic.List[string]
$structuredDataIssues = New-Object System.Collections.Generic.List[string]
$indexationIssues = New-Object System.Collections.Generic.List[string]
$uxIssues = New-Object System.Collections.Generic.List[string]
$articleLightboxIssues = New-Object System.Collections.Generic.List[string]
$legacyCleanupIssues = New-Object System.Collections.Generic.List[string]
$retiredRouteIssues = New-Object System.Collections.Generic.List[string]
$publicPdfAffordanceHits = New-Object System.Collections.Generic.List[string]
$localizedMediumImageCount = 0
$targetPageHtml = @{}

$requiredSemanticPages = [ordered]@{
  'public/index.html' = @{ ExpectedH1Class = 'title'; RequireSecondaryHeading = $true }
  'public/archive/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/syd-and-oliver/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/library/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/gallery/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/collections/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/shop/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/shop/the-american-nightmare-keep-dreaming-kid/index.html' = @{ ExpectedH1Class = 'shop-title'; RequireSecondaryHeading = $true }
  'public/shop/the-parable-of-the-sheep/index.html' = @{ ExpectedH1Class = 'shop-title'; RequireSecondaryHeading = $true }
  'public/random/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
}

$optionalDefaultListPages = @(
  'public/working-papers/index.html'
)

$requiredImportedMediaPages = [ordered]@{
  'public/essays/biter-the-slang-word-that-hits/index.html' = @{
    ExpectedImagePrefix = '/images/essays/biter-the-slang-word-that-hits/'
    ForbiddenImagePattern = '/images/medium/biter-the-slang-word-that-hits/[^"''<>\s]+\.svg'
  }
  'public/essays/rethinking-invasive-species-management/index.html' = @{
    ExpectedImagePrefix = '/images/essays/rethinking-invasive-species-management/'
    ForbiddenImagePattern = '/images/medium/rethinking-invasive-species-management/[^"''<>\s]+\.svg'
  }
  'public/essays/the-risk-management-buffet/index.html' = @{
    ExpectedImagePrefix = '/images/medium/'
  }
  'public/essays/camp-mystic-evacuation-timeline-guadalupe-river-flash-flood-july-4-2025/index.html' = @{
    ExpectedImagePrefix = '/images/medium/'
  }
}

$requiredEssayHeroPages = @(
  'public/essays/2025-supreme-court-wrap-up/index.html',
  'public/essays/synthetic-reasoning/index.html',
  'public/essays/modern-prometheus/index.html',
  'public/essays/biter-the-slang-word-that-hits/index.html',
  'public/essays/the-fair-price-of-bitcoin-69420/index.html',
  'public/essays/the-ai-data-center-wants-its-own-power-plant/index.html',
  'public/essays/the-model-that-could-not-leave/index.html',
  'public/essays/smokestack-spreadsheets/index.html',
  'public/essays/canvas-fails-finals-week/index.html',
  'public/essays/the-bet-slip-in-the-briefing-room/index.html',
  'public/essays/can-you-pass-the-pepper-please/index.html',
  'public/essays/the-factory-in-the-footnote/index.html',
  'public/essays/id-required/index.html',
  'public/essays/the-examiners-red-pencil/index.html',
  'public/essays/the-strait-that-holds-the-price/index.html',
  'public/essays/the-blockade-has-a-phone-number/index.html',
  'public/essays/the-warning-label-in-the-weeds/index.html',
  'public/essays/nothing-to-see-here/index.html',
  'public/essays/the-tank-at-the-fence-line/index.html',
  'public/essays/the-war-premium-at-the-auction/index.html',
  'public/essays/beyond-moores-law/index.html',
  'public/essays/charlie-kirk-how-a-campus-activist-learned-to-command-the-national-conversation/index.html'
)

$essayHeroChecks = @(
  @{
    PublicPath = 'public/essays/2025-supreme-court-wrap-up/index.html'
    SourcePath = 'content/essays/2025-supreme-court-wrap-up.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
  },
  @{
    PublicPath = 'public/essays/synthetic-reasoning/index.html'
    SourcePath = 'content/essays/synthetic-reasoning.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
  },
  @{
    PublicPath = 'public/essays/biter-the-slang-word-that-hits/index.html'
    SourcePath = 'content/essays/biter-the-slang-word-that-hits.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
  },
  @{
    PublicPath = 'public/essays/the-fair-price-of-bitcoin-69420/index.html'
    SourcePath = 'content/essays/the-fair-price-of-bitcoin-69420.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
  },
  @{
    PublicPath = 'public/essays/the-ai-data-center-wants-its-own-power-pla…33625 tokens truncated…to remain unaccented'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-world-is-back-at-the-poker-table/index.html'
    Pattern = 'piece-collection-context'
    Message = 'expected non-collection essays not to render the collection context block'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-world-is-back-at-the-poker-table/index.html'
    Pattern = 'data-piece-collection-room-theme='
    Message = 'expected non-collection essays not to emit collection room-theme data attributes'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-world-is-back-at-the-poker-table/index.html'
    Pattern = 'class=(?:"read-next"|read-next)\b'
    Message = 'expected non-collection essays not to render the retired read-next module'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-world-is-back-at-the-poker-table/index.html'
    Pattern = 'read-next-title|Read Next'
    Message = 'expected non-collection essays not to render retired Read Next title markup'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-world-is-back-at-the-poker-table/index.html'
    Pattern = 'data-analytics-source-slot=(?:"related_content"|related_content)'
    Message = 'expected non-collection essays not to render related_content analytics links from Read Next'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-world-is-back-at-the-poker-table/index.html'
    Pattern = 'journey-links--article(?=["\s])'
    Message = 'expected article headers not to render the old journey-links--article modifier'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-world-is-back-at-the-poker-table/index.html'
    Pattern = 'journey-links--article-exit'
    Message = 'expected non-collection essays to render the article-exit Keep Reading links'
  },
  @{
    Path = 'public/essays/the-world-is-back-at-the-poker-table/index.html'
    Pattern = 'newsletter-signup--page'
    Message = 'expected non-collection essays to omit the retired full newsletter module'
    ShouldNotMatch = $true
  }
)

$articleCollectionBoundaryPages = @(
  @{ Path = 'public/essays/your-part/index.html'; Slug = 'simple-logic'; Label = 'Your Part' },
  @{ Path = 'public/essays/togetherness/index.html'; Slug = 'musings'; Label = 'Togetherness' },
  @{ Path = 'public/essays/synthetic-reasoning/index.html'; Slug = 'technology-ai-machine-future'; Label = 'synthetic-reasoning' },
  @{ Path = 'public/essays/the-ai-data-center-wants-its-own-power-plant/index.html'; Slug = 'technology-ai-machine-future'; Label = 'the AI data center essay' },
  @{ Path = 'public/essays/the-model-that-could-not-leave/index.html'; Slug = 'technology-ai-machine-future'; Label = 'the Manus essay' },
  @{ Path = 'public/essays/smokestack-spreadsheets/index.html'; Slug = 'technology-ai-machine-future'; Label = 'Smokestack Spreadsheets' },
  @{ Path = 'public/essays/modern-prometheus/index.html'; Slug = 'technology-ai-machine-future'; Label = 'Modern Prometheus' },
  @{ Path = 'public/essays/the-ash-pond-under-the-cloud/index.html'; Slug = 'technology-ai-machine-future'; Label = 'The Ash Pond Under the Cloud' },
  @{ Path = 'public/essays/canvas-fails-finals-week/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'Canvas Fails Finals Week' },
  @{ Path = 'public/essays/the-bet-slip-in-the-briefing-room/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'The Bet Slip in the Briefing Room' },
  @{ Path = 'public/essays/can-you-pass-the-pepper-please/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'Can You Pass the Pepper, Please?' },
  @{ Path = 'public/essays/the-factory-in-the-footnote/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'The Factory in the Footnote' },
  @{ Path = 'public/essays/the-blue-pool-at-the-memorial/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'The Blue Pool at the Memorial' },
  @{ Path = 'public/essays/the-mailbox-at-the-clinic-door/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'The Mailbox at the Clinic Door' },
  @{ Path = 'public/essays/id-required/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'ID Required' },
  @{ Path = 'public/essays/the-text-message-in-the-archive-box/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'The Text Message in the Archive Box' },
  @{ Path = 'public/essays/the-courthouse-that-ate-the-republic/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'The Courthouse That Ate the Republic' },
  @{ Path = 'public/essays/the-examiners-red-pencil/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'The Examiner''s Red Pencil' },
  @{ Path = 'public/essays/the-card-in-the-catalog/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'The Card in the Catalog' },
  @{ Path = 'public/essays/the-brass-disk-in-the-sidewalk/index.html'; Slug = 'civic-institutions-and-public-power'; Label = 'The Brass Disk in the Sidewalk' },
  @{ Path = 'public/essays/the-strait-that-holds-the-price/index.html'; Slug = 'risk-uncertainty'; Label = 'the Hormuz price essay' },
  @{ Path = 'public/essays/the-blockade-has-a-phone-number/index.html'; Slug = 'risk-uncertainty'; Label = 'the Hormuz blockade essay' },
  @{ Path = 'public/essays/the-warning-label-in-the-weeds/index.html'; Slug = 'risk-uncertainty'; Label = 'the warning-label essay' },
  @{ Path = 'public/essays/nothing-to-see-here/index.html'; Slug = 'risk-uncertainty'; Label = 'Nothing to See Here' },
  @{ Path = 'public/essays/the-tank-at-the-fence-line/index.html'; Slug = 'risk-uncertainty'; Label = 'The Tank at the Fence Line' },
  @{ Path = 'public/essays/the-war-premium-at-the-auction/index.html'; Slug = 'risk-uncertainty'; Label = 'The War Premium at the Auction' },
  @{ Path = 'public/essays/the-map-that-priced-the-fire/index.html'; Slug = 'risk-uncertainty'; Label = 'The Map That Priced the Fire' },
  @{ Path = 'public/essays/in-the-image-of-god/index.html'; Slug = 'moral-religious-philosophical-essays'; Label = 'the moral collection essay' },
  @{ Path = 'public/essays/the-hate-ledger/index.html'; Slug = 'moral-religious-philosophical-essays'; Label = 'The Hate Ledger' },
  @{ Path = 'public/essays/outside-the-garden/index.html'; Slug = 'moral-religious-philosophical-essays'; Label = 'Outside the Garden' },
  @{ Path = 'public/essays/what-happened-at-camp-mystic/index.html'; Slug = 'floods-water-built-environment'; Label = 'the Camp Mystic essay' },
  @{ Path = 'public/essays/save-some-air-for-the-fishies/index.html'; Slug = 'floods-water-built-environment'; Label = 'Save Some Air for the Fishies' },
  @{ Path = 'public/essays/the-easement-under-the-lake/index.html'; Slug = 'floods-water-built-environment'; Label = 'The Easement Under the Lake' },
  @{ Path = 'public/essays/multiple-shmultiple/index.html'; Slug = 'reported-case-studies'; Label = 'Multiple Shmultiple' },
  @{ Path = 'public/essays/the-door-that-would-not-open/index.html'; Slug = 'reported-case-studies'; Label = 'The Door That Would Not Open' }
)

foreach ($page in $articleCollectionBoundaryPages) {
  $requiredUxChecks += @(
    @{
      Path = $page.Path
      Pattern = ('data-piece-collection-slug=(?:"' + [regex]::Escape($page.Slug) + '"|' + [regex]::Escape($page.Slug) + ')')
      Message = "expected $($page.Label) to key the article collection boundary to collection slug '$($page.Slug)'"
    },
    @{
      Path = $page.Path
      Pattern = 'From the Collection'
      Message = "expected $($page.Label) not to render the retired visible collection header phrase"
      ShouldNotMatch = $true
    },
    @{
      Path = $page.Path
      Pattern = 'article_collection_context'
      Message = "expected $($page.Label) collection link to emit the dedicated analytics source slot"
    },
    @{
      Path = $page.Path
      Pattern = 'piece--collection-accent'
      Message = "expected $($page.Label) not to render retired article collection-accent hooks"
      ShouldNotMatch = $true
    },
    @{
      Path = $page.Path
      Pattern = 'data-piece-collection-room-theme='
      Message = "expected $($page.Label) not to emit retired collection room-theme article attributes"
      ShouldNotMatch = $true
    }
  )
}

$requiredUxChecks += @(
  @{
    Path = 'public/essays/what-happened-at-camp-mystic/index.html'
    Pattern = 'piece--collection-accent--reported-case-studies-evidence-room'
    Message = 'expected dual-membership essays not to blend the secondary collection skin hook into article pages'
    ShouldNotMatch = $true
  }
)

foreach ($entry in $collectionRoomExpectations.GetEnumerator()) {
  $relativePath = [string]$entry.Key
  $theme = [string]$entry.Value

  $requiredUxChecks += @(
    @{
      Path = $relativePath
      Pattern = ('data-collection-room-theme=(?:"' + [regex]::Escape($theme) + '"|' + [regex]::Escape($theme) + ')')
      Message = "expected the live collection page to omit retired data-collection-room-theme='$theme'"
      ShouldNotMatch = $true
    },
    @{
      Path = $relativePath
      Pattern = ('collection-room--' + [regex]::Escape($theme))
      Message = "expected the live collection page to omit retired collection-room modifier class '$theme'"
      ShouldNotMatch = $true
    }
  )
}

foreach ($theme in $collectionDirectoryThemes) {
  $requiredUxChecks += @(
    @{
      Path = 'public/collections/index.html'
      Pattern = ('collection-card--' + [regex]::Escape($theme))
      Message = "expected the broadsheet collections directory to omit retired room-echo theme class '$theme'"
      ShouldNotMatch = $true
    }
  )
}

foreach ($check in $requiredUxChecks) {
  $relativePath = [string]$check.Path
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $uxIssues.Add("Missing generated page required for UX regression coverage: $relativePath")
    continue
  }

  if ($check.Contains('Type') -and $check.Type -eq 'library-empty-state') {
    $html = $targetPageHtml[$relativePath]
    $hasEmptyStateText = $html -match 'No matching pieces found'
    $hasCollectionsText = $html -match 'Collections'
    $hasHomeText = $html -match 'Home'
    $hasCollectionsDestination = $html -match '(?:https://outsideinprint\.org)?/collections/'
    $hasHomeDestination = $html -match '(?:https://outsideinprint\.org)?/'

    if (-not ($hasEmptyStateText -and $hasCollectionsText -and $hasHomeText -and $hasCollectionsDestination -and $hasHomeDestination)) {
      $uxIssues.Add("$relativePath => $($check.Message)")
    }
  }
  else {
    $isNegative = [bool]($check.ContainsKey('ShouldNotMatch') -and $check.ShouldNotMatch)
    $matches = $targetPageHtml[$relativePath] -match ([string]$check.Pattern)
    if (($isNegative -and $matches) -or (-not $isNegative -and -not $matches)) {
      $uxIssues.Add("$relativePath => $($check.Message)")
    }
  }
}

foreach ($forbiddenPath in @(
  'public/almanack/index.html'
)) {
  $fullForbiddenPath = Join-Path $repoRoot $forbiddenPath
  if (Test-Path -LiteralPath $fullForbiddenPath -PathType Leaf) {
    $uxIssues.Add("$forbiddenPath => expected the Almanack section index to remain unpublished")
  }
}

if ($targetPageHtml.ContainsKey('public/index.html')) {
  $homeIndexHtml = [string]$targetPageHtml['public/index.html']
  $currentSlugPattern = 'data-cartoon-slug=(?:"' + [regex]::Escape($currentCartoonSlug) + '"|' + [regex]::Escape($currentCartoonSlug) + ')'
  $currentTriggerMatch = [regex]::Match($homeIndexHtml, '<button\b(?=[^>]*\beditorial-cartoon__trigger\b)(?=[^>]*' + $currentSlugPattern + ')[^>]*>', 'IgnoreCase')
  $recentGridIndex = $homeIndexHtml.IndexOf('data-home-cartoon-recent', [System.StringComparison]::Ordinal)

  if (-not $currentTriggerMatch.Success) {
    $uxIssues.Add('public/index.html => expected the current homepage cartoon trigger to keep the current data slug')
  }
  elseif ($recentGridIndex -lt 0 -or $currentTriggerMatch.Index -gt $recentGridIndex) {
    $uxIssues.Add('public/index.html => expected the current cartoon block to render before the recent cartoon grid')
  }

  $recentMatches = @([regex]::Matches($homeIndexHtml, '<figure\b(?=[^>]*\beditorial-cartoon-recent__item\b)(?=[^>]*\bdata-home-cartoon-recent-card\b)[^>]*data-cartoon-slug=(?:"([^">]+)"|([^\s>]+))', 'IgnoreCase'))
  if ($recentMatches.Count -ne [Math]::Min(2, $recentHomeCartoonSlugs.Count)) {
    $uxIssues.Add("public/index.html => expected exactly $([Math]::Min(2, $recentHomeCartoonSlugs.Count)) recent homepage cartoon cards, found $($recentMatches.Count)")
  }
  else {
    $actualRecentSlugs = @($recentMatches | ForEach-Object {
      if ($_.Groups[1].Success) { $_.Groups[1].Value } else { $_.Groups[2].Value }
    })
    $expectedRecentSlugs = @($recentHomeCartoonSlugs | Select-Object -First $recentMatches.Count)
    if (($actualRecentSlugs -join '|') -ne ($expectedRecentSlugs -join '|')) {
      $uxIssues.Add("public/index.html => expected recent homepage cartoons in date order '$($expectedRecentSlugs -join ', ')', found '$($actualRecentSlugs -join ', ')'")
    }
  }

  if ($currentCartoonSlug -eq 'lines-of-fire' -and $homeIndexHtml -notmatch 'data-title=(?:"Lines of Fire"|Lines\ of\ Fire)') {
    $uxIssues.Add('public/index.html => expected Lines of Fire to remain the current homepage cartoon')
  }
  if (($recentHomeCartoonSlugs | Select-Object -First 1) -eq 'cloched-for-business' -and $homeIndexHtml -notmatch '<figure\b(?=[^>]*\beditorial-cartoon-recent__item\b)(?=[^>]*data-cartoon-slug=(?:"cloched-for-business"|cloched-for-business))(?s).*?<figcaption><span>Cloched for Business</span></figcaption>') {
    $uxIssues.Add('public/index.html => expected Cloched for Business to be the first recent homepage cartoon card')
  }
}
foreach ($articlePath in @(
  'public/essays/presidential-elections/index.html',
  'public/essays/the-risk-management-buffet/index.html',
  'public/essays/the-world-is-back-at-the-poker-table/index.html'
)) {
  if (-not $targetPageHtml.ContainsKey($articlePath)) {
    $uxIssues.Add("Missing generated page required for article-exit regression coverage: $articlePath")
    continue
  }

  $articleHtml = [string]$targetPageHtml[$articlePath]
  $newsletterIndex = $articleHtml.IndexOf('newsletter-signup--page', [System.StringComparison]::Ordinal)
  if ($newsletterIndex -ge 0) {
    $uxIssues.Add("$articlePath => expected article aftermatter to omit newsletter-signup--page")
  }

  $recordIndex = $articleHtml.IndexOf('article-publication-record', [System.StringComparison]::Ordinal)
  $journeyIndex = $articleHtml.IndexOf('journey-links--article-exit', [System.StringComparison]::Ordinal)
  if ($recordIndex -lt 0 -or $journeyIndex -lt 0 -or $recordIndex -ge $journeyIndex) {
    $uxIssues.Add("$articlePath => expected article-publication-record to appear before journey-links--article-exit")
  }

  if ($articleHtml -notmatch '(?s)journey-links--article-exit.*?(?:https://outsideinprint\.org)?/archive/.*?(?:https://outsideinprint\.org)?/collections/.*?(?:https://outsideinprint\.org)?/library/.*?https://buttondown\.com/OutsideInPrint[^>]*>\s*Newsletter\s*<') {
    $uxIssues.Add("$articlePath => expected article-exit links to include Archive, Collections, Library, and Newsletter")
  }
}

if ($targetPageHtml.ContainsKey('public/archive/index.html')) {
  $archiveIndexHtml = [string]$targetPageHtml['public/archive/index.html']
  $archiveDeskTagCount = [regex]::Matches($archiveIndexHtml, 'class=(?:"[^"]*\bitem-kicker--collection\b[^"]*"|''[^'']*\bitem-kicker--collection\b[^'']*''|[^\s>]*\bitem-kicker--collection\b[^\s>]*)', 'IgnoreCase').Count
  if ($archiveDeskTagCount -eq 0) {
    $uxIssues.Add('public/archive/index.html => expected archive collection labels to render in the muted desk-tag kicker position')
  }

  $yearJumpCount = [regex]::Matches($archiveIndexHtml, 'class=(?:"[^"]*\bessays-front__year-link\b[^"]*"|''[^'']*\bessays-front__year-link\b[^'']*''|[^\s>]*\bessays-front__year-link\b[^\s>]*)', 'IgnoreCase').Count
  if ($yearJumpCount -lt 2) {
    $uxIssues.Add("public/archive/index.html => expected at least 2 year-jump links, found $yearJumpCount")
  }

  if (-not [string]::IsNullOrWhiteSpace($currentCartoonCaption) -and $archiveIndexHtml -match [regex]::Escape($currentCartoonCaption)) {
    $uxIssues.Add('public/archive/index.html => expected the archive shell not to render the homepage cartoon caption text')
  }
}

$modernBioSharedRowPages = @(
  'public/archive/index.html',
  'public/library/index.html',
  'public/collections/modern-bios/index.html'
)

foreach ($relativePath in $modernBioSharedRowPages) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $uxIssues.Add("$relativePath => expected generated HTML to be available for Modern Bios shared-row coverage")
    continue
  }

  $html = [string]$targetPageHtml[$relativePath]
  if ($html -notmatch 'Modern Bios') {
    $uxIssues.Add("$relativePath => expected representative shared rows to keep the Modern Bios text kicker")
  }

  if ($html -match 'item--variant-modernbio') {
    $uxIssues.Add("$relativePath => expected shared archive rows to stop rendering the retired Modern Bios inset-rule class")
  }
}

if ($runningHeaderIssues.Count -gt 0) {
  throw ("Found running-header home links outside the expected base path '{0}'. Samples: {1}" -f $ExpectedHomePath, (Format-SampleList -Items $runningHeaderIssues))
}

if ($rootRelativeImageIssues.Count -gt 0) {
  throw ('Found stale project-path <img src="/outsideinprint/images/..."> paths in generated HTML. Samples: {0}' -f (Format-SampleList -Items $rootRelativeImageIssues))
}

if ($localizedMediumImageCount -eq 0) {
  throw "Did not find any base-path-safe localized /images/medium/ image URLs in generated HTML."
}

if ($zgotmplzIssues.Count -gt 0) {
  throw ("Found ZgotmplZ in generated HTML. Samples: {0}" -f (Format-SampleList -Items $zgotmplzIssues))
}

if ($publicPdfAffordanceHits.Count -gt 0) {
  throw ("Found public HTML that still exposes PDF affordances. Samples: {0}" -f (Format-SampleList -Items $publicPdfAffordanceHits))
}

if ($retiredRouteIssues.Count -gt 0) {
  throw ("Found retired routes in generated HTML. Samples: {0}" -f (Format-SampleList -Items $retiredRouteIssues))
}

if ($semanticIssues.Count -gt 0) {
  throw ("Found semantic accessibility regressions in generated HTML. Samples: {0}" -f (Format-SampleList -Items $semanticIssues))
}

if ($importedMediaIssues.Count -gt 0) {
  throw ("Found imported media rendering regressions in generated HTML. Samples: {0}" -f (Format-SampleList -Items $importedMediaIssues))
}

if ($articleLightboxIssues.Count -gt 0) {
  throw ("Found article image lightbox regressions in generated HTML. Samples: {0}" -f (Format-SampleList -Items $articleLightboxIssues))
}

if ($metadataIssues.Count -gt 0) {
  throw ("Found metadata regressions in generated HTML. Samples: {0}" -f (Format-SampleList -Items $metadataIssues))
}

if ($structuredDataIssues.Count -gt 0) {
  throw ("Found structured-data regressions in generated HTML. Samples: {0}" -f (Format-SampleList -Items $structuredDataIssues))
}

if ($indexationIssues.Count -gt 0) {
  throw ("Found indexation-policy regressions in generated output. Samples: {0}" -f (Format-SampleList -Items $indexationIssues))
}

if ($legacyCleanupIssues.Count -gt 0) {
  throw ("Found legacy content-cleanup regressions in generated HTML. Samples: {0}" -f (Format-SampleList -Items $legacyCleanupIssues))
}

if ($uxIssues.Count -gt 0) {
  throw ("Found UX/navigation regressions in generated HTML. Samples: {0}" -f (Format-SampleList -Items $uxIssues))
}

Write-Host "Public HTML output regression test passed."
$global:LASTEXITCODE = 0
exit 0
