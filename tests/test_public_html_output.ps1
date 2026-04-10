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
$hasHomepageAnalytics = $false
$publicPdfAffordanceHits = New-Object System.Collections.Generic.List[string]
$localizedMediumImageCount = 0
$targetPageHtml = @{}
$manifestoSupportArrowPattern = ('(?:&rarr;|&#8594;|&#x2192;|' + [regex]::Escape([string][char]0x2192) + ')')
$manifestoSupportLinePattern = ('Support independent journalism\s*' + $manifestoSupportArrowPattern)
$manifestoPlacementPattern = '(?s)home-manifesto.*?data-home-front-page-region=(?:"lead"|lead)'
$manifestoLinkPattern = ('(?s)home-manifesto__line--support.*?home-manifesto__support-link.*?#newsletter-signup-title.*?Support independent journalism\s*' + $manifestoSupportArrowPattern + '</a>')

$requiredSemanticPages = [ordered]@{
  'public/index.html' = @{ ExpectedH1Class = 'title'; RequireSecondaryHeading = $true }
  'public/essays/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $false }
  'public/library/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/collections/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
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

$requiredMetadataPages = [ordered]@{
  'public/index.html' = @{
    Title = 'Outside In Print'
    Description = 'Outside In Print is a digital imprint for essays, fiction, dialogues, and working papers published for the web with stable URLs and versioned records.'
    Canonical = 'https://outsideinprint.org/'
    OgType = 'website'
    TwitterCard = 'summary'
  }
  'public/start-here/index.html' = @{
    Title = 'Start Here'
    Description = 'An editorial welcome to Outside In Print and a measured guide into the archive.'
    Canonical = 'https://outsideinprint.org/start-here/'
    OgType = 'website'
    TwitterCard = 'summary'
  }
  'public/library/index.html' = @{
    Title = 'Library'
    Description = 'The full catalog of published work from Outside In Print, searchable by title, section, collection, and version.'
    Canonical = 'https://outsideinprint.org/library/'
    OgType = 'website'
    TwitterCard = 'summary'
  }
  'public/collections/index.html' = @{
    Title = 'Collections'
    Description = 'Curated collections that gather essays, projects, dossiers, and recurring questions into coherent reading threads across the archive.'
    Canonical = 'https://outsideinprint.org/collections/'
    OgType = 'website'
    TwitterCard = 'summary'
  }
  'public/about/index.html' = @{
    Title = 'About Outside In Print'
    Description = 'About Outside In Print: the imprint''s mission, editorial model, publishing structure, and the relationship between the site and Robert V. Ussley.'
    Canonical = 'https://outsideinprint.org/about/'
    OgType = 'website'
    TwitterCard = 'summary'
  }
  'public/authors/robert-v-ussley/index.html' = @{
    Title = 'Robert V. Ussley'
    Description = 'Essays by Robert V. Ussley on risk, institutions, technology, public life, and the systems people live inside.'
    Canonical = 'https://outsideinprint.org/authors/robert-v-ussley/'
    OgType = 'website'
    TwitterCard = 'summary'
  }
  'public/collections/risk-uncertainty/index.html' = @{
    Title = 'Risk, Uncertainty, and Decision-Making'
    Description = 'Essays about uncertainty, tradeoffs, risk framing, and decision-making under imperfect information.'
    Canonical = 'https://outsideinprint.org/collections/risk-uncertainty/'
    OgType = 'website'
    TwitterCard = 'summary'
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
    RequiredTypes = @('Organization', 'WebSite', 'WebPage')
    ForbiddenTypes = @('Article', 'CreativeWork', 'CollectionPage')
    RequirePublisherNode = $true
    RequireSearchAction = $true
  }
  'public/start-here/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'WebPage', 'BreadcrumbList')
    ForbiddenTypes = @('Article', 'CreativeWork', 'CollectionPage')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
  }
  'public/library/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'CollectionPage', 'BreadcrumbList')
    ForbiddenTypes = @('Article', 'CreativeWork')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
    RequireSearchAction = $true
  }
  'public/about/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'AboutPage', 'BreadcrumbList')
    ForbiddenTypes = @('Article', 'CreativeWork', 'CollectionPage', 'ProfilePage')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
  }
  'public/authors/robert-v-ussley/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'ProfilePage', 'Person', 'BreadcrumbList')
    ForbiddenTypes = @('Article', 'CreativeWork', 'CollectionPage', 'AboutPage')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
    RequirePersonNodeName = 'Robert V. Ussley'
  }
  'public/collections/risk-uncertainty/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'CollectionPage', 'BreadcrumbList')
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
  }
}

$requiredIndexationPages = [ordered]@{
  'public/index.html' = @{
    ExpectRobotsMeta = $false
  }
  'public/start-here/index.html' = @{
    ExpectRobotsMeta = $false
  }
  'public/library/index.html' = @{
    ExpectRobotsMeta = $false
  }
  'public/about/index.html' = @{
    ExpectRobotsMeta = $false
  }
  'public/authors/robert-v-ussley/index.html' = @{
    ExpectRobotsMeta = $false
  }
  'public/collections/index.html' = @{
    ExpectRobotsMeta = $false
  }
  'public/collections/risk-uncertainty/index.html' = @{
    ExpectRobotsMeta = $false
  }
  'public/authors/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'noindex, follow'
  }
  'public/essays/the-risk-management-buffet/index.html' = @{
    ExpectRobotsMeta = $false
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

$requiredSitemapInclusions = @(
  'https://outsideinprint.org/',
  'https://outsideinprint.org/about/',
  'https://outsideinprint.org/authors/robert-v-ussley/',
  'https://outsideinprint.org/essays/',
  'https://outsideinprint.org/essays/the-risk-management-buffet/',
  'https://outsideinprint.org/syd-and-oliver/',
  'https://outsideinprint.org/collections/',
  'https://outsideinprint.org/collections/risk-uncertainty/',
  'https://outsideinprint.org/library/',
  'https://outsideinprint.org/start-here/'
)

$requiredSitemapExclusions = @(
  'https://outsideinprint.org/authors/',
  'https://outsideinprint.org/random/',
  'https://outsideinprint.org/working-papers/',
  'https://outsideinprint.org/literature/'
)

$requiredUxPages = @(
  'public/index.html',
  'public/start-here/index.html',
  'public/about/index.html',
  'public/authors/robert-v-ussley/index.html',
  'public/essays/index.html',
  'public/library/index.html',
  'public/collections/index.html',
  'public/collections/risk-uncertainty/index.html',
  'public/essays/the-risk-management-buffet/index.html'
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
    ($requiredLegacyCleanupPages -contains $relativePath) -or
    ($requiredUxPages -contains $relativePath)
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
    $relativePath.EndsWith('public/index.html', [System.StringComparison]::OrdinalIgnoreCase) -and
    $content -match 'data-analytics-event=(?:"internal_promo_click"|internal_promo_click)' -and
    $content -match 'data-analytics-source-slot=(?:"random_link"|random_link)'
  ) {
    $hasHomepageAnalytics = $true
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

  if ($expected.Contains('Description')) {
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

  if ($expected.Contains('TwitterCard')) {
    $twitterCard = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:card'
    if ($twitterCard -ne [string]$expected.TwitterCard) {
      $metadataIssues.Add("$relativePath => expected twitter:card '$($expected.TwitterCard)', found '$twitterCard'")
    }
  }

  if ($expected.Contains('RequireImage') -and [bool]$expected.RequireImage) {
    $ogImage = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:image'
    if ([string]::IsNullOrWhiteSpace($ogImage)) {
      $metadataIssues.Add("$relativePath => expected og:image to be present")
    }
  }

  if ($expected.Contains('AuthorMeta')) {
    $authorMeta = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'author'
    if ($authorMeta -ne [string]$expected.AuthorMeta) {
      $metadataIssues.Add("$relativePath => expected author meta '$($expected.AuthorMeta)', found '$authorMeta'")
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
  if ($expected.Contains('RequirePublisherNode') -and [bool]$expected.RequirePublisherNode) {
    if (@($organizationNodes | Where-Object { $_.name -eq 'Outside In Print' }).Count -eq 0) {
      $structuredDataIssues.Add("$relativePath => expected an Organization node named 'Outside In Print'")
    }
  }

  if ($expected.Contains('RequirePersonNodeName')) {
    if (@($personNodes | Where-Object { $_.name -eq [string]$expected.RequirePersonNodeName }).Count -eq 0) {
      $structuredDataIssues.Add("$relativePath => expected a Person node named '$($expected.RequirePersonNodeName)'")
    }
  }

  if ($expected.Contains('RequireBreadcrumb') -and [bool]$expected.RequireBreadcrumb) {
    if ((Get-JsonLdNodesByType -Nodes $nodes -Type 'BreadcrumbList').Count -eq 0) {
      $structuredDataIssues.Add("$relativePath => expected BreadcrumbList JSON-LD")
    }
  }

  if ($expected.Contains('RequireSearchAction') -and [bool]$expected.RequireSearchAction) {
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

  if ($expected.Contains('RequireWorkPublisher') -and [bool]$expected.RequireWorkPublisher) {
    if ($null -eq $workNode -or $null -eq $workNode.publisher) {
      $structuredDataIssues.Add("$relativePath => expected the primary work node to include publisher")
    }
  }

  if ($expected.Contains('RequireWorkAuthor') -and [bool]$expected.RequireWorkAuthor) {
    if ($null -eq $workNode -or $null -eq $workNode.author) {
      $structuredDataIssues.Add("$relativePath => expected the primary work node to include author")
    }
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

  if ([bool]$expected.ExpectRobotsMeta) {
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
  foreach ($requiredLine in @('User-agent: *', 'Allow: /', 'Sitemap: https://outsideinprint.org/sitemap.xml')) {
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
    Pattern = '(?s)data-home-front-page-region=(?:"lead"|lead).*?Imprint.*?Selected Collections.*?Recent Work.*?The weekly letter.*?Browse the Archive'
    Message = 'expected the homepage to preserve the editorial module order from the story grid through archive browse'
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
    Pattern = 'A digital imprint of essays, reports, dialogues, and literature\.'
    Message = 'expected the homepage to render the manifesto''s first line'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'Color over the lines\. Read beyond the feed\. Think for yourself\.'
    Message = 'expected the homepage to render the manifesto''s second line'
  },
  @{
    Path = 'public/index.html'
    Pattern = $manifestoSupportLinePattern
    Message = 'expected the homepage to render the manifesto''s support line'
  },
  @{
    Path = 'public/index.html'
    Pattern = $manifestoPlacementPattern
    Message = 'expected the homepage manifesto strip to appear above the story grid'
  },
  @{
    Path = 'public/index.html'
    Pattern = $manifestoLinkPattern
    Message = 'expected the homepage manifesto support line to render as a real text link to the newsletter module'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'A curated front page from Outside In Print, with selected collections, recent work, and archive paths below\.'
    Message = 'expected the homepage not to retain the retired front-page intro blurb'
    ShouldNotMatch = $true
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
    Pattern = '(?s)journey-links.*?(?:https://outsideinprint\.org)?/essays/.*?(?:https://outsideinprint\.org)?/syd-and-oliver/.*?(?:https://outsideinprint\.org)?/collections/.*?(?:https://outsideinprint\.org)?/library/'
    Message = 'expected Start Here to expose direct navigation into the site''s major discovery lanes'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = '(?s)journey-links.*?(?:https://outsideinprint\.org)?/collections/.*?(?:https://outsideinprint\.org)?/library/'
    Message = 'expected the default list template to expose collection and library next steps'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = '>Read PDF<'
    Message = 'expected section list pages to avoid PDF affordances'
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
    Path = 'public/start-here/index.html'
    Pattern = 'Dialogues \| 5 min read \| Fiction'
    Message = 'expected Start Here to use the Dialogues label in featured lane metadata'
  },
  @{
    Path = 'public/start-here/index.html'
    Pattern = 'S and O'
    Message = 'expected Start Here not to retain the retired S and O label'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/library/index.html'
    Pattern = '(?s)journey-links.*?(?:https://outsideinprint\.org)?/collections/.*?(?:https://outsideinprint\.org)?/start-here/'
    Message = 'expected the library page to expose collection and Start Here navigation'
  },
  @{
    Path = 'public/library/index.html'
    Type = 'library-empty-state'
    Message = 'expected the library empty state to point readers toward collections and Start Here'
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
    Pattern = '(?s)journey-links.*?(?:https://outsideinprint\.org)?/library/.*?(?:https://outsideinprint\.org)?/start-here/'
    Message = 'expected the collections index to expose library and Start Here navigation'
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = 'How to Use This Collection'
    Message = 'expected collection detail pages to include a visible overview section explaining how to use the collection'
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
  }
)

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
    $hasStartHereText = $html -match 'Start Here'
    $hasCollectionsDestination = $html -match '(?:https://outsideinprint\.org)?/collections/'
    $hasStartHereDestination = $html -match '(?:https://outsideinprint\.org)?/start-here/'

    if (-not ($hasEmptyStateText -and $hasCollectionsText -and $hasStartHereText -and $hasCollectionsDestination -and $hasStartHereDestination)) {
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

if (-not $hasHomepageAnalytics) {
  throw "Homepage random-card analytics attributes were not emitted as expected in public/index.html."
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

