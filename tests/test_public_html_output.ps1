param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "public"),
  [string]$ExpectedHomePath = "/outsideinprint/"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRelativePath {
  param(
    [string]$RepoRoot,
    [string]$Path
  )

  $repoRootFull = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RepoRoot).Path)
  $pathFull = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path)
  $getRelativePath = [System.IO.Path].GetMethod('GetRelativePath', [Type[]]@([string], [string]))

  if ($null -ne $getRelativePath) {
    return ([System.IO.Path]::GetRelativePath($repoRootFull, $pathFull) -replace '\\', '/')
  }

  $repoRootUri = [System.Uri]($repoRootFull.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar)
  $pathUri = [System.Uri]$pathFull
  return ([System.Uri]::UnescapeDataString($repoRootUri.MakeRelativeUri($pathUri).ToString()) -replace '\\', '/')
}

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
if (-not (Test-Path $SiteDir -PathType Container)) {
  throw "Site output directory not found: $SiteDir"
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
$uxIssues = New-Object System.Collections.Generic.List[string]
$hasHomepageAnalytics = $false
$hasLibraryPdfAnalytics = $false
$localizedMediumImageCount = 0
$targetPageHtml = @{}

$requiredSemanticPages = [ordered]@{
  'public/index.html' = @{ ExpectedH1Class = 'title'; RequireSecondaryHeading = $true }
  'public/essays/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $false }
  'public/library/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/collections/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
}

$optionalDefaultListPages = @(
  'public/literature/index.html',
  'public/syd-and-oliver/index.html',
  'public/working-papers/index.html'
)

$requiredImportedMediaPages = @(
  'public/essays/biter-the-slang-word-that-hits/index.html',
  'public/essays/rethinking-invasive-species-management/index.html'
)

$requiredMetadataPages = [ordered]@{
  'public/index.html' = @{
    Title = 'Outside In Print'
    Description = 'Outside In Print is a digital imprint for essays, literature, dialogues, and working papers published as stable web editions and free PDFs.'
    Canonical = 'https://lpeasy.github.io/outsideinprint/'
  }
  'public/start-here/index.html' = @{
    Title = 'Start Here'
    Description = 'An editorial welcome to Outside In Print and a measured guide into the archive.'
    Canonical = 'https://lpeasy.github.io/outsideinprint/start-here/'
  }
  'public/library/index.html' = @{
    Title = 'Library'
    Description = 'The full catalog of published editions from Outside In Print, searchable by title, section, and version.'
    Canonical = 'https://lpeasy.github.io/outsideinprint/library/'
  }
  'public/collections/index.html' = @{
    Title = 'Collections'
    Description = 'Curated collections that gather essays, projects, and recurring questions into coherent reading threads.'
    Canonical = 'https://lpeasy.github.io/outsideinprint/collections/'
  }
  'public/essays/biter-the-slang-word-that-hits/index.html' = @{
    Title = 'Biter'
    Description = 'A word to describe artistic thieves'
    Canonical = 'https://lpeasy.github.io/outsideinprint/essays/biter-the-slang-word-that-hits/'
  }
  'public/essays/the-risk-management-buffet/index.html' = @{
    Title = 'The Risk Management Buffet'
    Canonical = 'https://lpeasy.github.io/outsideinprint/essays/the-risk-management-buffet/'
  }
}

$requiredUxPages = @(
  'public/index.html',
  'public/essays/index.html',
  'public/library/index.html',
  'public/collections/index.html',
  'public/collections/risk-uncertainty/index.html',
  'public/essays/the-risk-management-buffet/index.html'
)

foreach ($file in $htmlFiles) {
  $content = Get-Content -Path $file.FullName -Raw
  $relativePath = Get-RepoRelativePath -RepoRoot $repoRoot -Path $file.FullName

  if (
    $requiredSemanticPages.Contains($relativePath) -or
    ($optionalDefaultListPages -contains $relativePath) -or
    ($requiredImportedMediaPages -contains $relativePath) -or
    $requiredMetadataPages.Contains($relativePath) -or
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

    if ($src.StartsWith('/images/', [System.StringComparison]::OrdinalIgnoreCase)) {
      $rootRelativeImageIssues.Add("$relativePath => $src")
    }

    if ($src.StartsWith('/outsideinprint/images/medium/', [System.StringComparison]::OrdinalIgnoreCase)) {
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

  if ($relativePath.EndsWith('public/library/index.html', [System.StringComparison]::OrdinalIgnoreCase) -and $content -match 'data-analytics-format=(?:"pdf"|pdf)') {
    $hasLibraryPdfAnalytics = $true
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

foreach ($relativePath in $optionalDefaultListPages) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    continue
  }

  $issues = Get-SemanticPageIssues `
    -RelativePath $relativePath `
    -Html $targetPageHtml[$relativePath] `
    -ExpectedH1Class 'list-title' `
    -RequireSecondaryHeading $false

  foreach ($issue in $issues) {
    $semanticIssues.Add($issue)
  }
}

$requiredImportedMediaChecks = @(
  @{
    Path = 'public/essays/biter-the-slang-word-that-hits/index.html'
    Pattern = '(?s)<figure class=article-figure><img[^>]+><figcaption class=article-source-caption>Photo by Markus Spiske on Unsplash</figcaption></figure>'
    Message = 'expected imported photo-credit media to render as a figure with figcaption'
  },
  @{
    Path = 'public/essays/biter-the-slang-word-that-hits/index.html'
    Pattern = '(?s)<p>\s*Photo by Markus Spiske on Unsplash\s*</p>'
    Message = 'expected imported photo credits not to remain as loose paragraphs after image rendering'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/rethinking-invasive-species-management/index.html'
    Pattern = '(?s)<figure class=article-figure><img[^>]+><figcaption class=article-source-caption>Crested Floating Heart \| Source: iNaturalist</figcaption></figure>'
    Message = 'expected descriptive imported image captions to render as figure captions'
  }
)

foreach ($check in $requiredImportedMediaChecks) {
  $relativePath = [string]$check.Path
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $importedMediaIssues.Add("Missing generated page required for imported media regression coverage: $relativePath")
    continue
  }

  $isNegative = [bool]($check.ContainsKey('ShouldNotMatch') -and $check.ShouldNotMatch)
  $matches = $targetPageHtml[$relativePath] -match ([string]$check.Pattern)
  if (($isNegative -and $matches) -or (-not $isNegative -and -not $matches)) {
    $importedMediaIssues.Add("$relativePath => $($check.Message)")
  }
}

foreach ($relativePath in $requiredMetadataPages.Keys) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $metadataIssues.Add("Missing generated page required for metadata regression coverage: $relativePath")
    continue
  }

  $html = $targetPageHtml[$relativePath]
  $expected = $requiredMetadataPages[$relativePath]
  $canonical = Get-LinkHrefByRel -Html $html -Rel 'canonical'
  $metaDescription = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'description'
  $ogUrl = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:url'
  $ogTitle = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:title'
  $ogDescription = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:description'
  $twitterCard = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:card'
  $twitterTitle = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:title'
  $twitterDescription = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:description'
  $itempropDescription = Get-MetaContent -Html $html -AttributeName 'itemprop' -AttributeValue 'description'

  if ($canonical -ne [string]$expected.Canonical) {
    $metadataIssues.Add("$relativePath => expected canonical $($expected.Canonical), found $canonical")
  }

  if ($ogUrl -ne [string]$expected.Canonical) {
    $metadataIssues.Add("$relativePath => expected og:url to match canonical")
  }

  if ($ogTitle -ne [string]$expected.Title) {
    $metadataIssues.Add("$relativePath => expected og:title '$($expected.Title)', found '$ogTitle'")
  }

  if ($twitterTitle -ne [string]$expected.Title) {
    $metadataIssues.Add("$relativePath => expected twitter:title '$($expected.Title)', found '$twitterTitle'")
  }

  if ([string]::IsNullOrWhiteSpace($twitterCard)) {
    $metadataIssues.Add("$relativePath => expected twitter:card metadata")
  }

  if ($expected.Contains('Description')) {
    $expectedDescription = [string]$expected.Description
    if ($metaDescription -ne $expectedDescription) {
      $metadataIssues.Add("$relativePath => expected meta description '$expectedDescription', found '$metaDescription'")
    }
    if ($ogDescription -ne $expectedDescription) {
      $metadataIssues.Add("$relativePath => expected og:description '$expectedDescription', found '$ogDescription'")
    }
    if ($twitterDescription -ne $expectedDescription) {
      $metadataIssues.Add("$relativePath => expected twitter:description '$expectedDescription', found '$twitterDescription'")
    }
    if ($itempropDescription -ne $expectedDescription) {
      $metadataIssues.Add("$relativePath => expected itemprop description '$expectedDescription', found '$itempropDescription'")
    }
  } else {
    if ([string]::IsNullOrWhiteSpace($metaDescription) -or [string]::IsNullOrWhiteSpace($ogDescription) -or [string]::IsNullOrWhiteSpace($twitterDescription)) {
      $metadataIssues.Add("$relativePath => expected non-empty description metadata across meta, og, and twitter tags")
    }
    if (($metaDescription -ne $ogDescription) -or ($metaDescription -ne $twitterDescription) -or ($metaDescription -ne $itempropDescription)) {
      $metadataIssues.Add("$relativePath => expected meta, og, twitter, and schema descriptions to stay in sync")
    }
    if ($metaDescription -match 'Photo by .+ on Unsplash|Golden Corral in Fredericksburg, VA \| Source|\[Embedded media:') {
      $metadataIssues.Add("$relativePath => expected metadata description to exclude imported media caption noise")
    }
  }
}

$requiredUxChecks = @(
  @{
    Path = 'public/index.html'
    Pattern = '(?s)journey-links.*?/outsideinprint/essays/.*?/outsideinprint/collections/.*?/outsideinprint/library/'
    Message = 'expected the homepage to expose browse-next links for essays, collections, and the library'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = '(?s)journey-links.*?/outsideinprint/collections/.*?/outsideinprint/library/'
    Message = 'expected the default list template to expose collection and library next steps'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = '>Read PDF<'
    Message = 'expected section list pages to label PDF affordances as Read PDF'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = '(?s)journey-links.*?/outsideinprint/collections/.*?/outsideinprint/start-here/'
    Message = 'expected the library page to expose collection and Start Here navigation'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'No matching pieces found\.\s*Try a broader term,\s*browse\s*<a href=(?:https://lpeasy\.github\.io)?/outsideinprint/collections/>Collections</a>,\s*or start with\s*<a href=(?:https://lpeasy\.github\.io)?/outsideinprint/start-here/>Start Here</a>\.'
    Message = 'expected the library empty state to point readers toward collections and Start Here'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = '>Read PDF<'
    Message = 'expected the library index to label PDF affordances as Read PDF'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)journey-links.*?/outsideinprint/library/.*?/outsideinprint/start-here/'
    Message = 'expected the collections index to expose library and Start Here navigation'
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = '(?s)journey-links.*?/outsideinprint/collections/.*?/outsideinprint/library/'
    Message = 'expected collection pages to expose follow-on navigation back to collections and the library'
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = '>Read PDF<'
    Message = 'expected collection pages to label PDF affordances as Read PDF'
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = '(?s)journey-links.*?/outsideinprint/essays/.*?/outsideinprint/collections/.*?/outsideinprint/library/'
    Message = 'expected article chrome to expose section, collections, and library next steps near the top of the page'
  }
)

foreach ($check in $requiredUxChecks) {
  $relativePath = [string]$check.Path
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $uxIssues.Add("Missing generated page required for UX regression coverage: $relativePath")
    continue
  }

  if ($targetPageHtml[$relativePath] -notmatch ([string]$check.Pattern)) {
    $uxIssues.Add("$relativePath => $($check.Message)")
  }
}

if ($runningHeaderMatches -eq 0) {
  throw "Did not find any running-header home links in generated HTML."
}

if ($runningHeaderIssues.Count -gt 0) {
  throw ("Found running-header home links outside the expected base path '{0}'. Samples: {1}" -f $ExpectedHomePath, (Format-SampleList -Items $runningHeaderIssues))
}

if ($rootRelativeImageIssues.Count -gt 0) {
  throw ('Found root-relative <img src="/images/..."> paths in generated HTML. Samples: {0}' -f (Format-SampleList -Items $rootRelativeImageIssues))
}

if ($localizedMediumImageCount -eq 0) {
  throw "Did not find any base-path-safe localized /outsideinprint/images/medium/ image URLs in generated HTML."
}

if ($zgotmplzIssues.Count -gt 0) {
  throw ("Found ZgotmplZ in generated HTML. Samples: {0}" -f (Format-SampleList -Items $zgotmplzIssues))
}

if (-not $hasHomepageAnalytics) {
  throw "Homepage random-card analytics attributes were not emitted as expected in public/index.html."
}

if (-not $hasLibraryPdfAnalytics) {
  throw "Library PDF analytics attributes were not emitted as expected in public/library/index.html."
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

if ($uxIssues.Count -gt 0) {
  throw ("Found UX/navigation regressions in generated HTML. Samples: {0}" -f (Format-SampleList -Items $uxIssues))
}

Write-Host "Public HTML output regression test passed."
$global:LASTEXITCODE = 0
exit 0
