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
$currentCartoonImagePattern = [regex]::Escape((Get-CurrentCartoonValue -RepoRoot $repoRoot -Key 'image'))
$currentCartoonCaption = Get-CurrentCartoonValue -RepoRoot $repoRoot -Key 'caption'
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
$legacyCleanupIssues = New-Object System.Collections.Generic.List[string]
$retiredRouteIssues = New-Object System.Collections.Generic.List[string]
$publicPdfAffordanceHits = New-Object System.Collections.Generic.List[string]
$localizedMediumImageCount = 0
$targetPageHtml = @{}
$manifestoSupportArrowPattern = ('(?:&rarr;|&#8594;|&#x2192;|' + [regex]::Escape([string][char]0x2192) + ')')
$manifestoSupportLinePattern = ('Support independent journalism\s*' + $manifestoSupportArrowPattern)
$manifestoPlacementPattern = '(?s)home-manifesto.*?data-home-front-page-region=(?:"lead"|lead)'
$manifestoLinkPattern = ('(?s)home-manifesto__line--support.*?home-manifesto__support-link.*?#newsletter-signup-title.*?Support independent journalism\s*' + $manifestoSupportArrowPattern + '</a>')

$requiredSemanticPages = [ordered]@{
  'public/index.html' = @{ ExpectedH1Class = 'title'; RequireSecondaryHeading = $true }
  'public/essays/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/library/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/gallery/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/collections/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/random/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
}

$optionalDefaultListPages = @(
  'public/syd-and-oliver/index.html',
  'public/working-papers/index.html'
)

$requiredImportedMediaPages = @(
  'public/essays/biter-the-slang-word-that-hits/index.html',
  'public/essays/rethinking-invasive-species-management/index.html',
  'public/essays/the-risk-management-buffet/index.html',
  'public/essays/camp-mystic-evacuation-timeline-guadalupe-river-flash-flood-july-4-2025/index.html'
)

$requiredEssayHeroPages = @(
  'public/essays/2025-supreme-court-wrap-up/index.html',
  'public/essays/synthetic-reasoning/index.html',
  'public/essays/biter-the-slang-word-that-hits/index.html',
  'public/essays/the-fair-price-of-bitcoin-69420/index.html',
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
    PublicPath = 'public/essays/beyond-moores-law/index.html'
    SourcePath = 'content/essays/beyond-moores-law.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $false
  },
  @{
    PublicPath = 'public/essays/charlie-kirk-how-a-campus-activist-learned-to-command-the-national-conversation/index.html'
    SourcePath = 'content/essays/charlie-kirk-how-a-campus-activist-learned-to-command-the-national-conversation.md'
    ExpectVisibleHero = $false
    ExpectHeroAbsentFromBody = $false
  }
)

$requiredMetadataPages = [ordered]@{
  'public/index.html' = @{
    Title = 'Outside In Print'
    Description = 'Outside In Print is a digital imprint for essays, fiction, dialogues, and working papers published for the web with stable URLs and versioned records.'
    Canonical = 'https://outsideinprint.org/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/library/index.html' = @{
    Title = 'Library'
    Description = 'The full catalog of published work from Outside In Print, searchable by title, section, collection, and version.'
    Canonical = 'https://outsideinprint.org/library/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/gallery/index.html' = @{
    Title = 'Gallery'
    Description = 'A digital gallery of Outside In Print front page political cartoons.'
    Canonical = 'https://outsideinprint.org/gallery/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/collections/index.html' = @{
    Title = 'Collections'
    Description = 'Curated collections that gather essays, projects, dossiers, and recurring questions into coherent reading threads across the archive.'
    Canonical = 'https://outsideinprint.org/collections/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/about/index.html' = @{
    Title = 'About Outside In Print'
    Description = 'About Outside In Print: the imprint''s mission, editorial model, publishing structure, and the relationship between the site and Robert V. Ussley.'
    Canonical = 'https://outsideinprint.org/about/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/authors/robert-v-ussley/index.html' = @{
    Title = 'Robert V. Ussley'
    Description = 'Essays by Robert V. Ussley on risk, institutions, technology, public life, and the systems people live inside.'
    Canonical = 'https://outsideinprint.org/authors/robert-v-ussley/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/collections/risk-uncertainty/index.html' = @{
    Title = 'Risk, Uncertainty, and Decision-Making'
    Description = 'Essays about uncertainty, tradeoffs, risk framing, and decision-making under imperfect information.'
    Canonical = 'https://outsideinprint.org/collections/risk-uncertainty/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/random/index.html' = @{
    Title = 'Random'
    Description = 'A random path into the Outside In Print archive. If the random route is not useful, browse the full library instead.'
    Canonical = 'https://outsideinprint.org/random/'
    OgType = 'website'
    TwitterCard = 'summary'
  }
  'public/essays/biter-the-slang-word-that-hits/index.html' = @{
    Title = 'Biter'
    Description = ("Biter delivers an accusation in a word. A copycat {0} someone who steals another person{1}s ideas, aesthetic, or work and passes it off as their own" -f [char]0x2014, [char]0x2019)
    Canonical = 'https://outsideinprint.org/essays/biter-the-slang-word-that-hits/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/the-risk-management-buffet/index.html' = @{
    Title = 'The Risk Management Buffet'
    Canonical = 'https://outsideinprint.org/essays/the-risk-management-buffet/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    AuthorMeta = 'Robert V. Ussley'
  }
}

$requiredStructuredDataPages = [ordered]@{
  'public/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'WebPage', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork', 'CollectionPage')
    RequirePublisherNode = $true
    RequireSearchAction = $true
    RequirePublisherImage = $true
  }
  'public/library/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'CollectionPage', 'BreadcrumbList', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
    RequireSearchAction = $true
  }
  'public/gallery/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'CollectionPage', 'BreadcrumbList', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
  }
  'public/about/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'AboutPage', 'BreadcrumbList', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork', 'CollectionPage', 'ProfilePage')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
    RequirePublisherImage = $true
  }
  'public/authors/robert-v-ussley/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'ProfilePage', 'Person', 'BreadcrumbList', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork', 'CollectionPage', 'AboutPage')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
    RequirePersonNodeName = 'Robert V. Ussley'
    RequirePersonImage = $true
  }
  'public/collections/risk-uncertainty/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'CollectionPage', 'BreadcrumbList', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
  }
  'public/essays/the-risk-management-buffet/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'WebPage', 'BreadcrumbList', 'Article', 'ImageObject')
    ForbiddenTypes = @('CollectionPage')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
    RequireWorkPublisher = $true
    RequireWorkAuthor = $true
    RequireWorkImage = $true
    RequirePersonImage = $true
  }
}

$requiredIndexationPages = [ordered]@{
  'public/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/start-here/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'noindex, follow'
  }
  'public/library/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/gallery/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/about/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/authors/robert-v-ussley/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/collections/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/collections/risk-uncertainty/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/authors/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'noindex, follow'
  }
  'public/essays/the-risk-management-buffet/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/random/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'noindex, follow'
  }
  'public/working-papers/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'noindex, follow'
  }
}

$requiredFeedPages = [ordered]@{
  'public/index.html' = @{
    SiteFeed = 'https://outsideinprint.org/index.xml'
  }
  'public/about/index.html' = @{
    SiteFeed = 'https://outsideinprint.org/index.xml'
  }
  'public/essays/index.html' = @{
    SiteFeed = 'https://outsideinprint.org/index.xml'
    SectionFeed = 'https://outsideinprint.org/essays/index.xml'
  }
  'public/syd-and-oliver/index.html' = @{
    SiteFeed = 'https://outsideinprint.org/index.xml'
    SectionFeed = 'https://outsideinprint.org/syd-and-oliver/index.xml'
  }
}

$requiredSitemapInclusions = @(
  'https://outsideinprint.org/',
  'https://outsideinprint.org/about/',
  'https://outsideinprint.org/authors/robert-v-ussley/',
  'https://outsideinprint.org/essays/',
  'https://outsideinprint.org/essays/the-risk-management-buffet/',
  'https://outsideinprint.org/syd-and-oliver/',
  'https://outsideinprint.org/collections/',
  'https://outsideinprint.org/collections/risk-uncertainty/',
  'https://outsideinprint.org/library/'
)

$requiredSitemapExclusions = @(
  'https://outsideinprint.org/authors/',
  'https://outsideinprint.org/random/',
  'https://outsideinprint.org/start-here/',
  'https://outsideinprint.org/working-papers/',
  'https://outsideinprint.org/literature/'
)

$requiredLlmsOutputs = [ordered]@{
  'public/llms.txt' = @(
    'https://outsideinprint.org/',
    'https://outsideinprint.org/about/',
    'https://outsideinprint.org/authors/robert-v-ussley/',
    'https://outsideinprint.org/index.xml'
  )
  'public/llms-full.txt' = @(
    'Canonical policy:',
    'https://outsideinprint.org/sitemap.xml',
    'https://outsideinprint.org/index.xml',
    'https://outsideinprint.org/essays/',
    'https://outsideinprint.org/library/',
    'Legacy GitHub Pages URLs are not canonical.'
  )
}

$requiredLegacyHostRedirectPages = @(
  'public/index.html',
  'public/about/index.html',
  'public/essays/the-risk-management-buffet/index.html',
  'public/404.html'
)

$requiredLegacyHostRedirectPatterns = @(
  'lpeasy\.github\.io',
  '/outsideinprint',
  'https://outsideinprint\.org',
  'window\.location\.hostname\s*!==',
  '\.indexOf\(',
  '\.slice\(',
  'window\.location\.replace\(',
  'window\.location\.search',
  'window\.location\.hash'
)

$requiredUxPages = @(
  'public/index.html',
  'public/start-here/index.html',
  'public/about/index.html',
  'public/authors/robert-v-ussley/index.html',
  'public/essays/index.html',
  'public/library/index.html',
  'public/gallery/index.html',
  'public/collections/index.html',
  'public/random/index.html',
  'public/collections/the-ledger/index.html',
  'public/collections/syd-and-oliver-dialogues/index.html',
  'public/collections/modern-bios/index.html',
  'public/collections/risk-uncertainty/index.html',
  'public/collections/floods-water-built-environment/index.html',
  'public/collections/technology-ai-machine-future/index.html',
  'public/collections/moral-religious-philosophical-essays/index.html',
  'public/collections/reported-case-studies/index.html',
  'public/essays/the-risk-management-buffet/index.html',
  'public/essays/synthetic-reasoning/index.html',
  'public/essays/in-the-image-of-god/index.html',
  'public/essays/what-happened-at-camp-mystic/index.html',
  'public/essays/the-world-is-back-at-the-poker-table/index.html'
)

$collectionRoomExpectations = [ordered]@{
  'public/collections/the-ledger/index.html' = 'ledger-editorial-desk'
  'public/collections/syd-and-oliver-dialogues/index.html' = 'syd-and-oliver-smoky-lounge'
  'public/collections/modern-bios/index.html' = 'modern-bios-records-archive'
  'public/collections/risk-uncertainty/index.html' = 'risk-systems-notebook'
  'public/collections/floods-water-built-environment/index.html' = 'floods-survey-table'
  'public/collections/technology-ai-machine-future/index.html' = 'ai-screen-glow-archive'
  'public/collections/moral-religious-philosophical-essays/index.html' = 'moral-chapel-library'
  'public/collections/reported-case-studies/index.html' = 'reported-case-studies-evidence-room'
}

$collectionDirectoryThemes = @(
  'ledger-editorial-desk'
  'syd-and-oliver-smoky-lounge'
  'modern-bios-records-archive'
  'risk-systems-notebook'
  'floods-survey-table'
  'ai-screen-glow-archive'
  'moral-chapel-library'
  'reported-case-studies-evidence-room'
)

$requiredLegacyCleanupPages = @(
  'public/essays/biter-the-slang-word-that-hits/index.html',
  'public/essays/the-risk-management-buffet/index.html',
  'public/essays/camp-mystic-evacuation-timeline-guadalupe-river-flash-flood-july-4-2025/index.html'
)

foreach ($file in $htmlFiles) {
  $content = Get-Content -Path $file.FullName -Raw
  $relativePath = Get-RepoRelativePath -RepoRoot $repoRoot -Path $file.FullName

  if (
    $requiredSemanticPages.Contains($relativePath) -or
    ($optionalDefaultListPages -contains $relativePath) -or
    ($requiredImportedMediaPages -contains $relativePath) -or
    $requiredIndexationPages.Contains($relativePath) -or
    $requiredMetadataPages.Contains($relativePath) -or
    $requiredStructuredDataPages.Contains($relativePath) -or
    ($requiredLegacyHostRedirectPages -contains $relativePath) -or
    ($requiredLegacyCleanupPages -contains $relativePath) -or
    ($requiredUxPages -contains $relativePath) -or
    ($requiredEssayHeroPages -contains $relativePath)
  ) {
    $targetPageHtml[$relativePath] = $content
  }

  foreach ($match in [regex]::Matches($content, '<a\b[^>]*>', 'IgnoreCase')) {
    $tag = $match.Value
    $classValue = Get-AttributeValue -Tag $tag -Name 'class'
    if ([string]::IsNullOrWhiteSpace($classValue)) {
      continue
    }

    $classes = @($classValue -split '\s+' | Where-Object { $_ })
    if ($classes -notcontains 'running-header__home') {
      continue
    }

    $runningHeaderMatches++
    $href = Get-AttributeValue -Tag $tag -Name 'href'
    if ($href -ne $ExpectedHomePath) {
      $runningHeaderIssues.Add("$relativePath => $href")
    }
  }

  foreach ($match in [regex]::Matches($content, '<img\b[^>]*>', 'IgnoreCase')) {
    $tag = $match.Value
    $src = Get-AttributeValue -Tag $tag -Name 'src'
    if ([string]::IsNullOrWhiteSpace($src)) {
      continue
    }

    if ($src.StartsWith('/outsideinprint/images/', [System.StringComparison]::OrdinalIgnoreCase)) {
      $rootRelativeImageIssues.Add("$relativePath => $src")
    }

    if ($src.StartsWith('/images/medium/', [System.StringComparison]::OrdinalIgnoreCase)) {
      $localizedMediumImageCount++
    }
  }

  if ($content.IndexOf('ZgotmplZ', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
    $zgotmplzIssues.Add($relativePath)
  }

  if (
    ($content -match 'data-analytics-format=(?:"pdf"|pdf)') -or
    ($content -match '>Read PDF<') -or
    ($content -match 'edition-download')
  ) {
    $publicPdfAffordanceHits.Add($relativePath)
  }

  if ($content -match '(?:https://outsideinprint\.org)?/literature/') {
    $retiredRouteIssues.Add("$relativePath => literature route leaked into generated HTML")
  }
}

foreach ($relativePath in $requiredSemanticPages.Keys) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $semanticIssues.Add("Missing generated page required for semantic regression coverage: $relativePath")
    continue
  }

  $issues = Get-SemanticPageIssues `
    -RelativePath $relativePath `
    -Html $targetPageHtml[$relativePath] `
    -ExpectedH1Class ([string]$requiredSemanticPages[$relativePath].ExpectedH1Class) `
    -RequireSecondaryHeading ([bool]$requiredSemanticPages[$relativePath].RequireSecondaryHeading)

  foreach ($issue in $issues) {
    $semanticIssues.Add($issue)
  }
}

foreach ($relativePath in $requiredImportedMediaPages) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $importedMediaIssues.Add("Missing generated page required for imported-media regression coverage: $relativePath")
    continue
  }

  $html = $targetPageHtml[$relativePath]
  if ($html -notmatch '/images/medium/') {
    $importedMediaIssues.Add("$relativePath => expected localized /images/medium/ media references")
  }
}

foreach ($relativePath in $requiredMetadataPages.Keys) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $metadataIssues.Add("Missing generated page required for metadata regression coverage: $relativePath")
    continue
  }

  $html = $targetPageHtml[$relativePath]
  $expected = $requiredMetadataPages[$relativePath]

  $titleMatch = [regex]::Match($html, '(?is)<title>(.*?)</title>')
  $title = if ($titleMatch.Success) { $titleMatch.Groups[1].Value.Trim() } else { $null }
  if ($title -ne [string]$expected.Title) {
    $metadataIssues.Add("$relativePath => expected <title> '$($expected.Title)', found '$title'")
  }

  if (Test-ExpectedEntryHasKey -Entry $expected -Key 'Description') {
    $metaDescription = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'description'
    if ($metaDescription -ne [string]$expected.Description) {
      $metadataIssues.Add("$relativePath => expected meta description '$($expected.Description)', found '$metaDescription'")
    }

    $ogDescription = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:description'
    if ($ogDescription -ne [string]$expected.Description) {
      $metadataIssues.Add("$relativePath => expected og:description '$($expected.Description)', found '$ogDescription'")
    }

    $twitterDescription = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:description'
    if ($twitterDescription -ne [string]$expected.Description) {
      $metadataIssues.Add("$relativePath => expected twitter:description '$($expected.Description)', found '$twitterDescription'")
    }
  }

  $canonicalHref = Get-LinkHrefByRel -Html $html -Rel 'canonical'
  if ($canonicalHref -ne [string]$expected.Canonical) {
    $metadataIssues.Add("$relativePath => expected canonical '$($expected.Canonical)', found '$canonicalHref'")
  }

  $ogType = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:type'
  if ($ogType -ne [string]$expected.OgType) {
    $metadataIssues.Add("$relativePath => expected og:type '$($expected.OgType)', found '$ogType'")
  }

  if (Test-ExpectedEntryHasKey -Entry $expected -Key 'TwitterCard') {
    $twitterCard = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:card'
    if ($twitterCard -ne [string]$expected.TwitterCard) {
      $metadataIssues.Add("$relativePath => expected twitter:card '$($expected.TwitterCard)', found '$twitterCard'")
    }
  }

  if (Test-ExpectedFlag -Entry $expected -Key 'RequireImage') {
    $ogImage = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:image'
    if ([string]::IsNullOrWhiteSpace($ogImage)) {
      $metadataIssues.Add("$relativePath => expected og:image to be present")
    }

    $twitterImage = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:image'
    if ([string]::IsNullOrWhiteSpace($twitterImage)) {
      $metadataIssues.Add("$relativePath => expected twitter:image to be present")
    }

    foreach ($imageValue in @($ogImage, $twitterImage)) {
      if (-not [string]::IsNullOrWhiteSpace($imageValue) -and -not $imageValue.StartsWith('https://outsideinprint.org/', [System.StringComparison]::OrdinalIgnoreCase)) {
        $metadataIssues.Add("$relativePath => expected social image URLs to be canonical absolute outsideinprint.org URLs, found '$imageValue'")
      }
    }
  }

  if (Test-ExpectedEntryHasKey -Entry $expected -Key 'AuthorMeta') {
    $authorMeta = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'author'
    if ($authorMeta -ne [string]$expected.AuthorMeta) {
      $metadataIssues.Add("$relativePath => expected author meta '$($expected.AuthorMeta)', found '$authorMeta'")
    }
  }
}

foreach ($relativePath in $requiredFeedPages.Keys) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $metadataIssues.Add("Missing generated page required for feed-autodiscovery coverage: $relativePath")
    continue
  }

  $html = $targetPageHtml[$relativePath]
  $expected = $requiredFeedPages[$relativePath]
  $alternateFeeds = @(Get-LinkHrefsByRelAndType -Html $html -Rel 'alternate' -Type 'application/rss+xml')

  if ((Test-ExpectedEntryHasKey -Entry $expected -Key 'SiteFeed') -and ($alternateFeeds -notcontains [string]$expected.SiteFeed)) {
    $metadataIssues.Add("$relativePath => expected site RSS autodiscovery link '$($expected.SiteFeed)'")
  }

  if ((Test-ExpectedEntryHasKey -Entry $expected -Key 'SectionFeed') -and ($alternateFeeds -notcontains [string]$expected.SectionFeed)) {
    $metadataIssues.Add("$relativePath => expected section RSS autodiscovery link '$($expected.SectionFeed)'")
  }
}

foreach ($check in $essayHeroChecks) {
  $relativePath = [string]$check.PublicPath
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $metadataIssues.Add("Missing generated page required for essay-hero coverage: $relativePath")
    continue
  }

  $sourcePath = Join-Path $repoRoot ([string]$check.SourcePath -replace '/', '\')
  $featuredImage = Get-FrontMatterScalarFromMarkdownFile -Path $sourcePath -Key 'featured_image'
  $html = $targetPageHtml[$relativePath]

  $heroMatch = [regex]::Match(
    $html,
    '(?is)<figure\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-hero\b[^"]*"|''[^'']*\bpiece-hero\b[^'']*''|[^\s>]*\bpiece-hero\b[^\s>]*)[^>]*>\s*<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|''([^'']+)''|([^\s>]+))'
  )
  $heroSrc = ''
  if ($heroMatch.Success) {
    foreach ($groupIndex in 1..3) {
      if ($heroMatch.Groups[$groupIndex].Success -and -not [string]::IsNullOrWhiteSpace($heroMatch.Groups[$groupIndex].Value)) {
        $heroSrc = $heroMatch.Groups[$groupIndex].Value
        break
      }
    }
  }

  if ([bool]$check.ExpectVisibleHero) {
    if ([string]::IsNullOrWhiteSpace($featuredImage)) {
      $metadataIssues.Add("$relativePath => expected source front matter to define featured_image for hero alignment coverage")
      continue
    }

    $expectedHeroSrc = if ($featuredImage -match '^https?://') {
      $featuredImage
    }
    else {
      'https://outsideinprint.org' + $featuredImage
    }

    if ($heroSrc -ne $expectedHeroSrc) {
      $metadataIssues.Add("$relativePath => expected visible hero '$expectedHeroSrc', found '$heroSrc'")
    }

    $ogImage = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:image'
    if ($ogImage -ne $expectedHeroSrc) {
      $metadataIssues.Add("$relativePath => expected og:image to match the visible hero '$expectedHeroSrc', found '$ogImage'")
    }

    $twitterImage = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:image'
    if ($twitterImage -ne $expectedHeroSrc) {
      $metadataIssues.Add("$relativePath => expected twitter:image to match the visible hero '$expectedHeroSrc', found '$twitterImage'")
    }

    if ([bool]$check.ExpectHeroAbsentFromBody) {
      $bodyMatch = [regex]::Match(
        $html,
        '(?is)<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-body\b[^"]*"|''[^'']*\bpiece-body\b[^'']*''|[^\s>]*\bpiece-body\b[^\s>]*)[^>]*>(.*?)</div>\s*<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-aftermatter\b[^"]*"|''[^'']*\bpiece-aftermatter\b[^'']*''|[^\s>]*\bpiece-aftermatter\b[^\s>]*)'
      )
      if (-not $bodyMatch.Success) {
        $metadataIssues.Add("$relativePath => expected a piece-body region for hero-deduplication coverage")
      }
      elseif ($bodyMatch.Groups[1].Value -match [regex]::Escape($expectedHeroSrc)) {
        $metadataIssues.Add("$relativePath => expected the promoted or deduped hero image not to repeat inside the article body")
      }
    }
  }
  else {
    if ($heroMatch.Success) {
      $metadataIssues.Add("$relativePath => expected essays without a promoted hero candidate to omit the visible piece hero")
    }
  }
}

foreach ($relativePath in $requiredStructuredDataPages.Keys) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $structuredDataIssues.Add("Missing generated page required for structured-data regression coverage: $relativePath")
    continue
  }

  $html = $targetPageHtml[$relativePath]
  $expected = $requiredStructuredDataPages[$relativePath]
  $jsonLdObjects = @(Get-JsonLdObjects -Html $html)
  if ($jsonLdObjects.Count -eq 0) {
    $structuredDataIssues.Add("$relativePath => expected at least one application/ld+json block")
    continue
  }

  $nodes = @(Get-JsonLdNodes -Objects $jsonLdObjects)
  foreach ($requiredType in @($expected.RequiredTypes)) {
    if ((Get-JsonLdNodesByType -Nodes $nodes -Type ([string]$requiredType)).Count -eq 0) {
      $structuredDataIssues.Add("$relativePath => expected JSON-LD node type '$requiredType'")
    }
  }

  foreach ($forbiddenType in @($expected.ForbiddenTypes)) {
    if ((Get-JsonLdNodesByType -Nodes $nodes -Type ([string]$forbiddenType)).Count -gt 0) {
      $structuredDataIssues.Add("$relativePath => did not expect JSON-LD node type '$forbiddenType'")
    }
  }

  $organizationNodes = @(Get-JsonLdNodesByType -Nodes $nodes -Type 'Organization')
  $personNodes = @(Get-JsonLdNodesByType -Nodes $nodes -Type 'Person')
  if (Test-ExpectedFlag -Entry $expected -Key 'RequirePublisherNode') {
    if (@($organizationNodes | Where-Object { $_.name -eq 'Outside In Print' }).Count -eq 0) {
      $structuredDataIssues.Add("$relativePath => expected an Organization node named 'Outside In Print'")
    }
  }

  if (Test-ExpectedFlag -Entry $expected -Key 'RequirePublisherImage') {
    if (@($organizationNodes | Where-Object { $null -ne $_.image }).Count -eq 0) {
      $structuredDataIssues.Add("$relativePath => expected the Organization node to include image")
    }
  }

  if (Test-ExpectedEntryHasKey -Entry $expected -Key 'RequirePersonNodeName') {
    if (@($personNodes | Where-Object { $_.name -eq [string]$expected.RequirePersonNodeName }).Count -eq 0) {
      $structuredDataIssues.Add("$relativePath => expected a Person node named '$($expected.RequirePersonNodeName)'")
    }
  }

  if (Test-ExpectedFlag -Entry $expected -Key 'RequirePersonImage') {
    if (@($personNodes | Where-Object { $null -ne $_.image }).Count -eq 0) {
      $structuredDataIssues.Add("$relativePath => expected a Person node with image")
    }
  }

  if (Test-ExpectedFlag -Entry $expected -Key 'RequireBreadcrumb') {
    if ((Get-JsonLdNodesByType -Nodes $nodes -Type 'BreadcrumbList').Count -eq 0) {
      $structuredDataIssues.Add("$relativePath => expected BreadcrumbList JSON-LD")
    }
  }

  if (Test-ExpectedFlag -Entry $expected -Key 'RequireSearchAction') {
    $websiteNode = @(Get-JsonLdNodesByType -Nodes $nodes -Type 'WebSite') | Select-Object -First 1
    if ($null -eq $websiteNode -or $null -eq $websiteNode.potentialAction) {
      $structuredDataIssues.Add("$relativePath => expected WebSite JSON-LD to expose SearchAction")
    } else {
      $action = $websiteNode.potentialAction
      if ($action.'@type' -ne 'SearchAction') {
        $structuredDataIssues.Add("$relativePath => expected WebSite potentialAction to be SearchAction")
      }

      $targetTemplate = $null
      if ($null -ne $action.target) {
        if ($action.target.urlTemplate) {
          $targetTemplate = [string]$action.target.urlTemplate
        } elseif ($action.target -is [string]) {
          $targetTemplate = [string]$action.target
        }
      }

      if ($targetTemplate -ne 'https://outsideinprint.org/library/?q={search_term_string}') {
        $structuredDataIssues.Add("$relativePath => expected SearchAction target to point at the library query route")
      }
    }
  }

  $workNode = @(
    (Get-JsonLdNodesByType -Nodes $nodes -Type 'Article') +
    (Get-JsonLdNodesByType -Nodes $nodes -Type 'CreativeWork')
  ) | Select-Object -First 1

  if (Test-ExpectedFlag -Entry $expected -Key 'RequireWorkPublisher') {
    if ($null -eq $workNode -or $null -eq $workNode.publisher) {
      $structuredDataIssues.Add("$relativePath => expected the primary work node to include publisher")
    }
  }

  if (Test-ExpectedFlag -Entry $expected -Key 'RequireWorkAuthor') {
    if ($null -eq $workNode -or $null -eq $workNode.author) {
      $structuredDataIssues.Add("$relativePath => expected the primary work node to include author")
    }
  }

  if (Test-ExpectedFlag -Entry $expected -Key 'RequireWorkImage') {
    if ($null -eq $workNode -or $null -eq $workNode.image) {
      $structuredDataIssues.Add("$relativePath => expected the primary work node to include image")
    }
  }
}

foreach ($relativePath in $requiredLegacyCleanupPages) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $legacyCleanupIssues.Add("Missing generated page required for legacy cleanup coverage: $relativePath")
    continue
  }

  $html = $targetPageHtml[$relativePath]
  if ($html -match '<a\b[^>]*href\s*=\s*(?:"https?://(?:www\.)?(?:[^/\s"''>]+\.)?medium\.com/|https?://(?:www\.)?(?:[^/\s"''>]+\.)?medium\.com/)') {
    $legacyCleanupIssues.Add("$relativePath => expected canonical pages not to retain visible Medium links")
  }
}

# These checks validate the generated route-policy output once public/ is refreshed from the current templates.
foreach ($relativePath in $requiredIndexationPages.Keys) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $indexationIssues.Add("Missing generated page required for indexation regression coverage: $relativePath")
    continue
  }

  $html = $targetPageHtml[$relativePath]
  $expected = $requiredIndexationPages[$relativePath]
  $robotsMeta = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'robots'

  if (Test-ExpectedFlag -Entry $expected -Key 'ExpectRobotsMeta') {
    if ($robotsMeta -ne [string]$expected.Robots) {
      $indexationIssues.Add("$relativePath => expected robots meta '$($expected.Robots)', found '$robotsMeta'")
    }
  }
  elseif (-not [string]::IsNullOrWhiteSpace($robotsMeta)) {
    $indexationIssues.Add("$relativePath => did not expect a page-level robots meta tag, found '$robotsMeta'")
  }
}

$robotsTxtPath = Join-Path $SiteDir 'robots.txt'
if (-not (Test-Path $robotsTxtPath -PathType Leaf)) {
  $indexationIssues.Add('Missing generated robots.txt output.')
}
else {
  $robotsTxt = Get-Content -Path $robotsTxtPath -Raw
  foreach ($requiredLine in @(
    'User-agent: OAI-SearchBot',
    'User-agent: Claude-SearchBot',
    'User-agent: Claude-User',
    'User-agent: PerplexityBot',
    'User-agent: GPTBot',
    'User-agent: ClaudeBot',
    'User-agent: Google-Extended',
    'User-agent: *',
    'Allow: /',
    'Disallow: /',
    'Sitemap: https://outsideinprint.org/sitemap.xml'
  )) {
    if ($robotsTxt -notmatch [regex]::Escape($requiredLine)) {
      $indexationIssues.Add("robots.txt => expected line '$requiredLine'")
    }
  }
}

$sitemapPath = Join-Path $SiteDir 'sitemap.xml'
if (-not (Test-Path $sitemapPath -PathType Leaf)) {
  $indexationIssues.Add('Missing generated sitemap.xml output.')
}
else {
  $sitemapLocs = @(Get-SitemapLocs -Xml (Get-Content -Path $sitemapPath -Raw))
  foreach ($requiredLoc in $requiredSitemapInclusions) {
    if ($sitemapLocs -notcontains $requiredLoc) {
      $indexationIssues.Add("sitemap.xml => expected sitemap inclusion '$requiredLoc'")
    }
  }

  foreach ($excludedLoc in $requiredSitemapExclusions) {
    if ($sitemapLocs -contains $excludedLoc) {
      $indexationIssues.Add("sitemap.xml => did not expect sitemap inclusion '$excludedLoc'")
    }
  }
}

foreach ($relativePath in $requiredLlmsOutputs.Keys) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path $fullPath -PathType Leaf)) {
    $indexationIssues.Add("Missing generated discovery output: $relativePath")
    continue
  }

  $content = Get-Content -Path $fullPath -Raw
  foreach ($requiredSnippet in @($requiredLlmsOutputs[$relativePath])) {
    if ($content -notmatch [regex]::Escape([string]$requiredSnippet)) {
      $indexationIssues.Add("$relativePath => expected discovery snippet '$requiredSnippet'")
    }
  }
}

foreach ($relativePath in $requiredLegacyHostRedirectPages) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $legacyCleanupIssues.Add("Missing generated page required for legacy-host redirect coverage: $relativePath")
    continue
  }

  $html = $targetPageHtml[$relativePath]
  foreach ($pattern in $requiredLegacyHostRedirectPatterns) {
    if ($html -notmatch $pattern) {
      $legacyCleanupIssues.Add("$relativePath => expected legacy-host redirect pattern '$pattern'")
    }
  }

  if ($html -match 'outsideinprint\.org/outsideinprint') {
    $legacyCleanupIssues.Add("$relativePath => expected legacy-host redirect not to preserve /outsideinprint on the canonical host")
  }
}

if ($targetPageHtml.ContainsKey('public/404.html')) {
  $notFoundHtml = $targetPageHtml['public/404.html']
  $notFoundRobots = Get-MetaContent -Html $notFoundHtml -AttributeName 'name' -AttributeValue 'robots'
  if ($notFoundRobots -ne 'noindex, follow') {
    $legacyCleanupIssues.Add("public/404.html => expected robots meta 'noindex, follow', found '$notFoundRobots'")
  }
}

$requiredUxChecks = @(
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<h1[^>]*class=(?:"[^"]*\btitle\b[^"]*"|''[^'']*\btitle\b[^'']*''|[^>]*\btitle\b[^>]*)[^>]*>\s*Outside In Print\s*</h1>'
    Message = 'expected the homepage to expose a semantic h1 for the site title'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<p[^>]*class=(?:"[^"]*\blist-title\b[^"]*"|''[^'']*\blist-title\b[^'']*''|[^>]*\blist-title\b[^>]*)[^>]*>\s*Front Page\s*</p>'
    Message = 'expected the homepage not to retain the retired visible Front Page label block'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)data-home-front-page-region=(?:"lead"|lead).*?home-manifesto.*?entry-threads--home.*?home-browse-title.*?newsletter-signup-title'
    Message = 'expected the homepage to preserve the editorial module order from the story grid through the lower-page signoff'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'Start Reading'
    Message = 'expected the homepage to render the curated Start Reading module label'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<section[^>]*class=(?:"[^"]*\bhome-browse\b[^"]*"|''[^'']*\bhome-browse\b[^'']*''|[^>]*\bhome-browse\b[^>]*)[^>]*>.*?Essays.*?Gallery.*?Collections.*?Library.*?</section>'
    Message = 'expected the homepage browse band to render the curated route set in editorial order'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<section[^>]*class=(?:"[^"]*\bhome-browse\b[^"]*"|''[^'']*\bhome-browse\b[^'']*''|[^>]*\bhome-browse\b[^>]*)[^>]*>.*?(?:Welcome|Dialogues|Feeling curious\?).*?</section>'
    Message = 'expected the homepage browse band to omit the retired Welcome, Dialogues, and Feeling curious? routes'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<section[^>]*class=(?:"[^"]*\bentry-threads--home\b[^"]*"|''[^'']*\bentry-threads--home\b[^'']*''|[^>]*\bentry-threads--home\b[^>]*)[^>]*>.*?Browse all collections.*?</section>'
    Message = 'expected the homepage Start Reading module not to render the archive footer link'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'home-imprint-statement'
    Message = 'expected the homepage generated output not to include the retired homepage imprint module'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-home-front-page-region=(?:"lead"|lead)'
    Message = 'expected the homepage to render a dedicated lead-story region'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-home-front-page-region=(?:"secondary"|secondary)'
    Message = 'expected the homepage to render a secondary editorial rail'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'home-recent-work'
    Message = 'expected the homepage not to render the retired Recent Work module'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = $currentCartoonImagePattern
    Message = 'expected the homepage generated output to include the current editorial cartoon image block'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)editorial-cartoon.*?View gallery'
    Message = 'expected the homepage editorial cartoon block to link to the gallery'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'A curated front page from Outside In Print, with selected collections, recent work, and archive paths below\.'
    Message = 'expected the homepage not to retain the retired front-page intro blurb'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)A digital imprint of essays, reports, dialogues, and literature\..*?Color over the lines\. Read beyond the feed\. Think for yourself\.'
    Message = 'expected the homepage to carry the preserved manifesto lines above Start Reading'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'Support independent journalism'
    Message = 'expected the homepage not to retain the moved manifesto support line'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'Also on the front page'
    Message = 'expected the homepage not to retain the explicit front-page rail label'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'Feeling curious\?'
    Message = 'expected the homepage to expose the renamed exploratory route label'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'Read by Path'
    Message = 'expected the homepage not to retain the retired path-chooser heading'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'journey-links'
    Message = 'expected the homepage not to retain the old browse-next journey-links module'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?(?:https://outsideinprint\.org)?/syd-and-oliver/[^>]*>\s*Dialogues\s*<'
    Message = 'expected the homepage masthead to expose the Dialogues label'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?(?:https://outsideinprint\.org)?/literature/'
    Message = 'expected the homepage masthead not to expose the retired literature section'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/start-here/index.html'
    Pattern = '(?s)<link rel="canonical" href="https://outsideinprint\.org/"'
    Message = 'expected /start-here/ to canonicalize to the homepage'
  },
  @{
    Path = 'public/start-here/index.html'
    Pattern = '(?s)<meta name="robots" content="noindex, follow"'
    Message = 'expected /start-here/ to remain non-indexable'
  },
  @{
    Path = 'public/start-here/index.html'
    Pattern = '(?s)<meta http-equiv="refresh" content="0; url=/"'
    Message = 'expected /start-here/ to include an immediate meta refresh to home'
  },
  @{
    Path = 'public/start-here/index.html'
    Pattern = 'window\.location\.replace\("/"\)'
    Message = 'expected /start-here/ to include a JavaScript redirect to home'
  },
  @{
    Path = 'public/start-here/index.html'
    Pattern = '>Home<'
    Message = 'expected /start-here/ to expose a visible Home fallback link'
  },
  @{
    Path = 'public/start-here/index.html'
    Pattern = 'Ways Into the Archive|Browse all collections|Start Reading'
    Message = 'expected /start-here/ not to retain the retired Welcome-page content'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = 'journey-links'
    Message = 'expected the essays front not to retain the route-level utility pill row'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = 'Essay Desk'
    Message = 'expected the essays landing page to render the route-owned newsprint masthead label'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = '(?s)Late Edition.*?Current Edition'
    Message = 'expected the essays landing page to render the current-edition band'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = 'essays-front__lead'
    Message = 'expected the essays landing page to render a dominant lead-story region'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = 'essays-front__rail'
    Message = 'expected the essays landing page to render the stacked dispatch rail'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = $currentCartoonImagePattern
    Message = 'expected the essays landing page to render the current editorial cartoon break'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = 'essays-front__cartoon-caption'
    Message = 'expected the essays landing page to render the optional visible cartoon caption when provided'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = '(?s)Rolling Archive.*?By Month'
    Message = 'expected the essays landing page to render the rolling archive header'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = '(?s)March 2026.*?February 2026.*?January 2026'
    Message = 'expected the essays archive to group entries by descending month-year bands'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = '(?s)/essays/hindsight-2026-d4vd-alleged-romantic-homicide/.*?/essays/the-world-is-back-at-the-poker-table/.*?/essays/1929-2029-americas-century-of-humiliation/'
    Message = 'expected the essays landing page to keep the newest stories in descending chronological order'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = '>Read PDF<'
    Message = 'expected the essays front to avoid PDF affordances'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'The library is the full catalog of the imprint'
    Message = 'expected the library page to explain its catalog role in visible copy'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'Dialogues and fiction from the recurring world of Syd and Oliver'
    Message = 'expected the library page to surface lane descriptions from section metadata'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = '\|\s*\d+\s+min read'
    Message = 'expected the library page to render numeric reading-time metadata in list rows'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = '%![sS]\(int=\d+\)\s+min read'
    Message = 'expected the library page not to expose Go-formatting error strings in reading-time metadata'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/syd-and-oliver/index.html'
    Pattern = '(?s)<h1[^>]*>\s*Dialogues\s*</h1>'
    Message = 'expected the /syd-and-oliver/ route to render the renamed Dialogues section title'
  },
  @{
    Path = 'public/syd-and-oliver/index.html'
    Pattern = 'Essay Desk|Late Edition|Rolling Archive|essays-front__lead'
    Message = 'expected /syd-and-oliver/ to remain on the shared generic list layout'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/working-papers/index.html'
    Pattern = 'Essay Desk|Late Edition|Rolling Archive|essays-front__lead'
    Message = 'expected /working-papers/ to remain on the shared generic list layout'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/random/index.html'
    Pattern = 'Feeling curious\? Let the archive choose the next piece\.'
    Message = 'expected the random route to frame archive exploration with the reader-facing exploratory label'
  },
  @{
    Path = 'public/random/index.html'
    Pattern = '(?s)journey-links.*?(?:https://outsideinprint\.org)?/library/.*?(?:https://outsideinprint\.org)?/collections/.*?(?:https://outsideinprint\.org)?/'
    Message = 'expected the random route to expose library, collections, and home fallbacks'
  },
  @{
    Path = 'public/random/index.html'
    Pattern = 'Finding a piece from the archive\.\.\.'
    Message = 'expected the random route to present a framed archive-selection status instead of a bare redirect stub'
  },
  @{
    Path = 'public/random/index.html'
    Pattern = '(?s)https://outsideinprint\.org/library/.*?if\(!\w+\.length\)\{window\.location\.replace\(\w+\);return\}.*?Math\.floor\(Math\.random\(\)\*\w+\.length\).*?window\.location\.replace\(\w+\)'
    Message = 'expected the random route to keep the automatic redirect and library fallback behavior'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = '(?s)journey-links.*?(?:https://outsideinprint\.org)?/collections/.*?(?:https://outsideinprint\.org)?/'
    Message = 'expected the library page to expose collection and home navigation'
  },
  @{
    Path = 'public/library/index.html'
    Type = 'library-empty-state'
    Message = 'expected the library empty state to point readers toward collections and Home'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = '(?s)searchParams\.get\((?:"q"|''q'')\).*searchParams\.set\((?:"q"|''q''),\s*[^)]+\).*replaceState'
    Message = 'expected the library page to sync the search input with the q query parameter'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = '>Read PDF<'
    Message = 'expected the library index to avoid PDF affordances'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/about/index.html'
    Pattern = 'Author and Publisher'
    Message = 'expected the about page to explain the author and publisher relationship'
  },
  @{
    Path = 'public/about/index.html'
    Pattern = 'Robert V\. Ussley'
    Message = 'expected the about page to name Robert V. Ussley explicitly'
  },
  @{
    Path = 'public/authors/robert-v-ussley/index.html'
    Pattern = 'Selected Works'
    Message = 'expected the author dossier page to expose selected works'
  },
  @{
    Path = 'public/authors/robert-v-ussley/index.html'
    Pattern = 'Themes'
    Message = 'expected the author dossier page to expose themes'
  },
  @{
    Path = 'public/authors/robert-v-ussley/index.html'
    Pattern = 'From the Archive'
    Message = 'expected the author dossier page to expose archive entries'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '8 collections(?:\s|&nbsp;|Â|&Acirc;)*(?:&middot;|&#183;|&#x0*B7;|·|Â·|&Acirc;&middot;)(?:\s|&nbsp;|Â|&Acirc;)*61 published pieces'
    Message = 'expected the collections index to collapse the visible header copy to a compact stats line'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)<main\b[^>]*>.*?Curated collections that gather essays, projects, dossiers, and recurring questions into coherent reading threads across the archive\.'
    Message = 'expected the collections index not to render the old descriptive intro paragraph in visible copy'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)<main\b[^>]*>.*?Collections are curated reading threads across the archive: 8 public collections linking 61 published pieces\.'
    Message = 'expected the collections index not to render the old prose stats sentence in visible copy'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)journey-links.*?(?:https://outsideinprint\.org)?/library/.*?(?:https://outsideinprint\.org)?/'
    Message = 'expected the collections index to expose library and home navigation'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'Featured Collections'
    Message = 'expected the unified collections directory to remove the separate featured collections section'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'Collections Index'
    Message = 'expected the unified collections directory to remove the retired collections index heading'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'All Collections'
    Message = 'expected the collections index not to retain the retired flat list heading'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'Featured Series|Featured Topic'
    Message = 'expected featured collection cards not to retain featured-type kicker labels'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)Series.*?The Ledger.*?Syd and Oliver Dialogues.*?Modern Bios.*?Reported Case Studies'
    Message = 'expected the unified collections directory to group series collections together'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)Topics.*?Risk, Uncertainty, and Decision-Making.*?Floods, Water, and the Built Environment.*?Technology, AI, and the Machine Future.*?Moral, Religious, and Philosophical Essays'
    Message = 'expected the unified collections directory to group topic collections together without subgroup labels'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'collection-card--room-echo'
    Message = 'expected the unified collections directory to render room-echo cards'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'Moral / Religious'
    Message = 'expected the unified collections directory to drop the old topic subgroup labels'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'Public Power|Civic Institutions and Public Power'
    Message = 'expected the collections index not to render the hidden Public Power subgroup until that collection becomes visible'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = 'How to Use This Collection'
    Message = 'expected collection detail pages not to retain the retired overview block'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = 'Related Collections'
    Message = 'expected collection detail pages to link onward to related collections'
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = '(?s)journey-links.*?(?:https://outsideinprint\.org)?/collections/.*?(?:https://outsideinprint\.org)?/library/'
    Message = 'expected collection pages to expose follow-on navigation back to collections and the library'
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = '>Read PDF<'
    Message = 'expected collection pages to avoid PDF affordances'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = 'collection-card--room-echo'
    Message = 'expected related-collection rows on collection detail pages to remain neutral and omit room-echo classes'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/authors/robert-v-ussley/index.html'
    Pattern = 'collection-card--room-echo'
    Message = 'expected author-page collection rows to remain neutral and omit room-echo classes'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = 'edition-download'
    Message = 'expected article pages to avoid PDF download blocks'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = 'Edition <b>First web edition</b>'
    Message = 'expected article headers to normalize legacy digital-edition labels for the web'
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = 'First digital edition'
    Message = 'expected article headers not to expose legacy digital-edition wording'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = '(?s)journey-links.*?(?:https://outsideinprint\.org)?/essays/.*?(?:https://outsideinprint\.org)?/collections/.*?(?:https://outsideinprint\.org)?/library/'
    Message = 'expected article chrome to expose section, collections, and library next steps near the top of the page'
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?(?:https://outsideinprint\.org)?/syd-and-oliver/[^>]*>\s*Dialogues\s*<'
    Message = 'expected article pages to keep the Dialogues masthead link visible'
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?(?:https://outsideinprint\.org)?/literature/'
    Message = 'expected article mastheads not to expose the retired literature section'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/synthetic-reasoning/index.html'
    Pattern = 'piece--collection-accent'
    Message = 'expected single-collection essays to render the shared article collection-accent hook'
  },
  @{
    Path = 'public/essays/synthetic-reasoning/index.html'
    Pattern = 'data-piece-collection-slug=(?:"technology-ai-machine-future"|technology-ai-machine-future)'
    Message = 'expected synthetic-reasoning to key article accents to the AI collection slug'
  },
  @{
    Path = 'public/essays/synthetic-reasoning/index.html'
    Pattern = 'data-piece-collection-room-theme=(?:"ai-screen-glow-archive"|ai-screen-glow-archive)'
    Message = 'expected synthetic-reasoning to render the AI article collection-accent theme'
  },
  @{
    Path = 'public/essays/synthetic-reasoning/index.html'
    Pattern = 'From the Collection'
    Message = 'expected collection essays to render the compact article collection context block'
  },
  @{
    Path = 'public/essays/synthetic-reasoning/index.html'
    Pattern = 'article_collection_context'
    Message = 'expected the article collection context link to emit the dedicated analytics source slot'
  },
  @{
    Path = 'public/essays/in-the-image-of-god/index.html'
    Pattern = 'data-piece-collection-room-theme=(?:"moral-chapel-library"|moral-chapel-library)'
    Message = 'expected moral collection essays to render their room-theme accent'
  },
  @{
    Path = 'public/essays/what-happened-at-camp-mystic/index.html'
    Pattern = 'data-piece-collection-slug=(?:"floods-water-built-environment"|floods-water-built-environment)'
    Message = 'expected dual-membership essays to key article accents to the first public collection slug'
  },
  @{
    Path = 'public/essays/what-happened-at-camp-mystic/index.html'
    Pattern = 'data-piece-collection-room-theme=(?:"floods-survey-table"|floods-survey-table)'
    Message = 'expected dual-membership essays to use the first collection room theme for article accents'
  },
  @{
    Path = 'public/essays/what-happened-at-camp-mystic/index.html'
    Pattern = 'piece--collection-accent--reported-case-studies-evidence-room'
    Message = 'expected dual-membership essays not to blend the secondary collection theme into article accents'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-world-is-back-at-the-poker-table/index.html'
    Pattern = 'piece--collection-accent'
    Message = 'expected non-collection essays to remain unaccented'
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
    Message = 'expected non-collection essays to keep the neutral read-next module'
  },
  @{
    Path = 'public/essays/the-world-is-back-at-the-poker-table/index.html'
    Pattern = 'newsletter-signup--page'
    Message = 'expected non-collection essays to keep the neutral page-newsletter module'
  }
)

foreach ($entry in $collectionRoomExpectations.GetEnumerator()) {
  $relativePath = [string]$entry.Key
  $theme = [string]$entry.Value

  $requiredUxChecks += @(
    @{
      Path = $relativePath
      Pattern = ('data-collection-room-theme=(?:"' + [regex]::Escape($theme) + '"|' + [regex]::Escape($theme) + ')')
      Message = "expected the live collection page to render data-collection-room-theme='$theme'"
    },
    @{
      Path = $relativePath
      Pattern = ('collection-room--' + [regex]::Escape($theme))
      Message = "expected the live collection page to render the collection-room modifier class '$theme'"
    }
  )
}

foreach ($theme in $collectionDirectoryThemes) {
  $requiredUxChecks += @(
    @{
      Path = 'public/collections/index.html'
      Pattern = ('collection-card--' + [regex]::Escape($theme))
      Message = "expected the unified collections directory to render the room-echo theme class '$theme'"
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

if ($targetPageHtml.ContainsKey('public/essays/index.html')) {
  $essaysIndexHtml = [string]$targetPageHtml['public/essays/index.html']
  $railItemCount = [regex]::Matches($essaysIndexHtml, 'class=(?:"[^"]*\bessays-front__rail-item\b[^"]*"|''[^'']*\bessays-front__rail-item\b[^'']*''|[^\s>]*\bessays-front__rail-item\b[^\s>]*)', 'IgnoreCase').Count
  if ($railItemCount -ne 4) {
    $uxIssues.Add("public/essays/index.html => expected exactly 4 dispatch rail items, found $railItemCount")
  }

  $railSummaryCount = [regex]::Matches($essaysIndexHtml, 'class=(?:"[^"]*\bessays-front__rail-item--with-summary\b[^"]*"|''[^'']*\bessays-front__rail-item--with-summary\b[^'']*''|[^\s>]*\bessays-front__rail-item--with-summary\b[^\s>]*)', 'IgnoreCase').Count
  if ($railSummaryCount -ne 2) {
    $uxIssues.Add("public/essays/index.html => expected exactly 2 dispatch rail items with summaries, found $railSummaryCount")
  }

  $archiveDeskTagCount = [regex]::Matches($essaysIndexHtml, 'class=(?:"[^"]*\bitem-kicker--collection\b[^"]*"|''[^'']*\bitem-kicker--collection\b[^'']*''|[^\s>]*\bitem-kicker--collection\b[^\s>]*)', 'IgnoreCase').Count
  if ($archiveDeskTagCount -eq 0) {
    $uxIssues.Add('public/essays/index.html => expected archive collection labels to render in the muted desk-tag kicker position')
  }

  if (-not [string]::IsNullOrWhiteSpace($currentCartoonCaption) -and $essaysIndexHtml -notmatch [regex]::Escape($currentCartoonCaption)) {
    $uxIssues.Add('public/essays/index.html => expected the current cartoon caption text to render when configured')
  }
}

$modernBioSharedRowPages = @(
  'public/essays/index.html',
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

if ($runningHeaderMatches -eq 0) {
  throw "Did not find any running-header home links in generated HTML."
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
  throw ("Found retired literature routes in generated HTML. Samples: {0}" -f (Format-SampleList -Items $retiredRouteIssues))
}

if ($semanticIssues.Count -gt 0) {
  throw ("Found semantic accessibility regressions in generated HTML. Samples: {0}" -f (Format-SampleList -Items $semanticIssues))
}

if ($importedMediaIssues.Count -gt 0) {
  throw ("Found imported media rendering regressions in generated HTML. Samples: {0}" -f (Format-SampleList -Items $importedMediaIssues))
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

