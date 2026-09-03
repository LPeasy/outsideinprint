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

function Get-PrimaryNavHtml {
  param([string]$Html)

  $match = [regex]::Match($Html, '(?is)<nav\b(?=[^>]*aria-label\s*=\s*(?:"Primary"|''Primary''|Primary))[^>]*>.*?</nav>')
  if (-not $match.Success) {
    return $null
  }

  return $match.Value
}

function Get-FooterNavHtml {
  param([string]$Html)

  $match = [regex]::Match($Html, '(?is)<nav\b(?=[^>]*aria-label\s*=\s*(?:"Footer"|''Footer''|Footer))[^>]*>.*?</nav>')
  if (-not $match.Success) {
    return $null
  }

  return $match.Value
}

function Get-PublicRoutePath {
  param([string]$RelativePath)

  $normalized = $RelativePath.Replace('\', '/')
  if ($normalized -ceq 'public/index.html') {
    return '/'
  }
  if ($normalized -match '^public/(.+)/index\.html$') {
    return '/' + $Matches[1] + '/'
  }
  if ($normalized -match '^public/(.+\.html)$') {
    return '/' + $Matches[1]
  }

  return $null
}

function Get-SitePathFromHref {
  param([string]$Href)

  if ([string]::IsNullOrWhiteSpace($Href)) {
    return $null
  }

  $decodedHref = [System.Net.WebUtility]::HtmlDecode($Href.Trim())
  if ($decodedHref.StartsWith('/')) {
    $path = ($decodedHref -split '[?#]', 2)[0]
    return [Uri]::UnescapeDataString($path)
  }

  $absoluteUri = $null
  if ([Uri]::TryCreate($decodedHref, [UriKind]::Absolute, [ref]$absoluteUri)) {
    if ($absoluteUri.Host -cne 'outsideinprint.org') {
      return $null
    }

    return [Uri]::UnescapeDataString($absoluteUri.AbsolutePath)
  }

  return $null
}

function Get-HeadingLevels {
  param([string]$Html)

  return @([regex]::Matches($Html, '<h([1-6])\b', 'IgnoreCase') | ForEach-Object { [int]$_.Groups[1].Value })
}

function Get-CanonicalAffirmations {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing canonical affirmation bank: $Path"
  }

  $source = [System.IO.File]::ReadAllText($Path)
  $headingMatch = [regex]::Match($source, '(?m)^## Affirmations\s*$')
  if (-not $headingMatch.Success) {
    throw "Canonical affirmation bank is missing its Affirmations heading: $Path"
  }

  $section = $source.Substring($headingMatch.Index + $headingMatch.Length)
  $nextHeading = [regex]::Match($section, '(?m)^##\s+')
  if ($nextHeading.Success) {
    $section = $section.Substring(0, $nextHeading.Index)
  }

  $affirmations = [System.Collections.Generic.List[string]]::new()
  foreach ($line in @([regex]::Split($section, '\r?\n'))) {
    if ([string]::IsNullOrEmpty($line)) {
      continue
    }
    if (-not $line.StartsWith('- ', [System.StringComparison]::Ordinal)) {
      throw "Malformed one-line affirmation in ${Path}: $line"
    }

    $value = $line.Substring(2)
    if ([string]::IsNullOrWhiteSpace($value) -or $value -cne $value.Trim()) {
      throw "Invalid affirmation text in ${Path}: $line"
    }
    $affirmations.Add($value) | Out-Null
  }

  return $affirmations.ToArray()
}

function Convert-HtmlFragmentToText {
  param([string]$Html)

  $withoutTags = [regex]::Replace($Html, '(?is)<[^>]+>', '')
  return [System.Net.WebUtility]::HtmlDecode($withoutTags).Trim()
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

function Get-ManagedSocialImageUrl {
  param(
    [hashtable]$Manifest,
    [string]$AssetId
  )

  if ([string]::IsNullOrWhiteSpace($AssetId) -or -not $Manifest.assets.ContainsKey($AssetId)) {
    throw "Managed social-image asset is not registered: $AssetId"
  }

  $asset = $Manifest.assets[$AssetId]
  if ([string]$asset.processing_state -ne 'derivative_capable') {
    throw "Managed social-image asset cannot produce derivatives: $AssetId"
  }

  $hashPrefix = ([string]$asset.sha256).Substring(0, 12)
  $socialWidth = [Math]::Min([int]$asset.width, [int]$Manifest.defaults.social_max_width)
  return "https://outsideinprint.org/images/rendered/$AssetId/$hashPrefix/social-${socialWidth}w.jpg"
}

function Get-ManagedVisibleImagePath {
  param(
    [hashtable]$Manifest,
    [string]$AssetId
  )

  if ([string]::IsNullOrWhiteSpace($AssetId) -or -not $Manifest.assets.ContainsKey($AssetId)) {
    throw "Managed visible-image asset is not registered: $AssetId"
  }

  $asset = $Manifest.assets[$AssetId]
  if ([string]$asset.processing_state -ne 'derivative_capable') {
    throw "Managed visible-image asset cannot produce derivatives: $AssetId"
  }

  $hashPrefix = ([string]$asset.sha256).Substring(0, 12)
  $visibleWidth = [Math]::Min([int]$asset.width, [int]$Manifest.defaults.max_render_width)
  return "/images/rendered/$AssetId/$hashPrefix/${visibleWidth}w.webp"
}

function ConvertTo-CanonicalImageUrl {
  param([AllowNull()][string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -match '^https?://') {
    return $Value
  }
  if (-not $Value.StartsWith('/', [System.StringComparison]::Ordinal)) {
    return "https://outsideinprint.org/$Value"
  }
  return "https://outsideinprint.org$Value"
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
$studioDataSource = Get-Content -LiteralPath (Join-Path $repoRoot 'data\studio.yaml') -Raw
$studioEnabledMatch = [regex]::Match($studioDataSource, '(?m)^enabled:[ \t]*(true|false)[ \t]*\r?$')
$studioInquiryEnabledMatch = [regex]::Match($studioDataSource, '(?m)^inquiry:[ \t]*\r?\n[ \t]+enabled:[ \t]*(true|false)[ \t]*\r?$')
$studioFoundingActiveMatch = [regex]::Match($studioDataSource, '(?m)^\s*founding_offer_active:\s*(true|false)\s*$')
$studioFoundingPriceMatch = [regex]::Match($studioDataSource, '(?m)^\s*founding_price_display:\s*"([^"]+)"\s*$')
$studioStandardPriceMatch = [regex]::Match($studioDataSource, '(?m)^\s*standard_price_display:\s*"([^"]+)"\s*$')
if (-not $studioEnabledMatch.Success -or -not $studioInquiryEnabledMatch.Success -or -not $studioFoundingActiveMatch.Success -or -not $studioFoundingPriceMatch.Success -or -not $studioStandardPriceMatch.Success) {
  throw 'Unable to resolve the Studio feature and pricing configuration from data/studio.yaml.'
}
$studioEnabled = $studioEnabledMatch.Groups[1].Value -ceq 'true'
$studioInquiryEnabled = $studioInquiryEnabledMatch.Groups[1].Value -ceq 'true'
$studioComposerEnabled = $studioEnabled -and $studioInquiryEnabled
$studioFoundingOfferActive = $studioFoundingActiveMatch.Groups[1].Value -ceq 'true'
$studioFoundingPrice = $studioFoundingPriceMatch.Groups[1].Value
$studioStandardPrice = $studioStandardPriceMatch.Groups[1].Value
$studioActivePrice = if ($studioFoundingOfferActive) { $studioFoundingPrice } else { $studioStandardPrice }
$studioActiveRateLabel = if ($studioFoundingOfferActive) { 'Founding-client rate' } else { 'Standard rate' }
$studioActiveRateText = "$studioActiveRateLabel $studioActivePrice"
$imageManifestPath = Join-Path $repoRoot 'data\image-assets.json'
if (-not (Test-Path -LiteralPath $imageManifestPath -PathType Leaf)) {
  throw "Responsive image manifest not found: $imageManifestPath"
}
$imageManifest = Get-Content -LiteralPath $imageManifestPath -Raw | ConvertFrom-Json -AsHashtable -Depth 20
$canonicalAffirmations = @(Get-CanonicalAffirmations -Path (Join-Path $repoRoot 'editorial\affirmations-bank.md'))
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
$appsPreviewIssues = New-Object System.Collections.Generic.List[string]
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
  'public/shop/thanks/index.html' = @{ ExpectedH1Class = 'commerce-policy__title'; RequireSecondaryHeading = $false }
  'public/shop/the-water-cycle/index.html' = @{ ExpectedH1Class = 'shop-title'; RequireSecondaryHeading = $true }
  'public/studio/index.html' = @{ ExpectedH1Class = 'studio-hero__title'; RequireSecondaryHeading = $true }
  'public/support/index.html' = @{ ExpectedH1Class = 'support-page__title'; RequireSecondaryHeading = $true }
  'public/support/cancellation-refunds/index.html' = @{ ExpectedH1Class = 'commerce-policy__title'; RequireSecondaryHeading = $true }
  'public/support/thanks/index.html' = @{ ExpectedH1Class = 'commerce-policy__title'; RequireSecondaryHeading = $false }
  'public/privacy/index.html' = @{ ExpectedH1Class = 'commerce-policy__title'; RequireSecondaryHeading = $true }
  'public/terms/index.html' = @{ ExpectedH1Class = 'commerce-policy__title'; RequireSecondaryHeading = $true }
  'public/epub-license-refunds/index.html' = @{ ExpectedH1Class = 'commerce-policy__title'; RequireSecondaryHeading = $true }
  'public/contact/index.html' = @{ ExpectedH1Class = 'commerce-policy__title'; RequireSecondaryHeading = $true }
  'public/apps/index.html' = @{ ExpectedH1Class = 'apps-index__title'; RequireSecondaryHeading = $true }
  'public/apps/bucks-machine/index.html' = @{ ExpectedH1Class = 'apps-product__title'; RequireSecondaryHeading = $true }
  'public/apps/baseball-upside-risk/index.html' = @{ ExpectedH1Class = 'apps-product__title'; RequireSecondaryHeading = $true }
  'public/random/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
}

$optionalDefaultListPages = @(
  'public/working-papers/index.html'
)

$requiredImportedMediaPages = [ordered]@{
  'public/essays/biter-the-slang-word-that-hits/index.html' = @{
    ExpectedImagePrefix = '/images/rendered/essays/biter-the-slang-word-that-hits/'
    ForbiddenImagePattern = '/images/medium/biter-the-slang-word-that-hits/[^"''<>\s]+\.svg'
  }
  'public/essays/rethinking-invasive-species-management/index.html' = @{
    ExpectedImagePrefix = '/images/rendered/essays/rethinking-invasive-species-management/'
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
    PublicPath = 'public/essays/the-ai-data-center-wants-its-own-power-plant/index.html'
    SourcePath = 'content/essays/the-ai-data-center-wants-its-own-power-plant.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'The AI campus no longer arrives alone. It now shows up with turbines, towers, and a power strategy of its own.'
  },
  @{
    PublicPath = 'public/essays/the-model-that-could-not-leave/index.html'
    SourcePath = 'content/essays/the-model-that-could-not-leave.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'An acquisition can be written on paper. Capability is harder to move cleanly.'
  },
  @{
    PublicPath = 'public/essays/smokestack-spreadsheets/index.html'
    SourcePath = 'content/essays/smokestack-spreadsheets.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'A private forecast can become a public infrastructure claim.'
  },
  @{
    PublicPath = 'public/essays/canvas-fails-finals-week/index.html'
    SourcePath = 'content/essays/canvas-fails-finals-week.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = "The operational layer is the institution now."
  },
  @{
    PublicPath = 'public/essays/the-bet-slip-in-the-briefing-room/index.html'
    SourcePath = 'content/essays/the-bet-slip-in-the-briefing-room.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = "The bet slip looks harmless until it sits beside tomorrow's official decision."
  },
  @{
    PublicPath = 'public/essays/can-you-pass-the-pepper-please/index.html'
    SourcePath = 'content/essays/can-you-pass-the-pepper-please.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'The room clears. The report remains.'
  },
  @{
    PublicPath = 'public/essays/the-factory-in-the-footnote/index.html'
    SourcePath = 'content/essays/the-factory-in-the-footnote.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'A factory can disappear into a footnote before anyone votes to close it.'
  },
  @{
    PublicPath = 'public/essays/id-required/index.html'
    SourcePath = 'content/essays/id-required.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'The voter roll is a public trust before it is a database.'
  },
  @{
    PublicPath = 'public/essays/the-strait-that-holds-the-price/index.html'
    SourcePath = 'content/essays/the-strait-that-holds-the-price.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'Before a price shock reaches land, it passes through a narrow place.'
  },
  @{
    PublicPath = 'public/essays/the-blockade-has-a-phone-number/index.html'
    SourcePath = 'content/essays/the-blockade-has-a-phone-number.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'A phone line can stay open while the waterway stays closed.'
  },
  @{
    PublicPath = 'public/essays/the-warning-label-in-the-weeds/index.html'
    SourcePath = 'content/essays/the-warning-label-in-the-weeds.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'The label looks like packaging until the legal system asks it to carry public trust.'
  },
  @{
    PublicPath = 'public/essays/nothing-to-see-here/index.html'
    SourcePath = 'content/essays/nothing-to-see-here.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'The map is a public-record problem before it is an origin story.'
  },
  @{
    PublicPath = 'public/essays/the-tank-at-the-fence-line/index.html'
    SourcePath = 'content/essays/the-tank-at-the-fence-line.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'The fence line is where private storage becomes public geography.'
  },
  @{
    PublicPath = 'public/essays/the-war-premium-at-the-auction/index.html'
    SourcePath = 'content/essays/the-war-premium-at-the-auction.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'The auction turns public power into a price.'
  },
  @{
    PublicPath = 'public/essays/the-sewer-under-the-sidewalk/index.html'
    SourcePath = 'content/essays/the-sewer-under-the-sidewalk.md'
    ExpectVisibleHero = $true
    ExpectHeroAbsentFromBody = $true
    ForbiddenBodyText = 'The public version of infrastructure can look like a ribbon cutting. The working version is often buried below it.'
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
    ExpectedManagedImageId = $currentCartoonImagePath
  }
  'public/apps/index.html' = @{
    Title = 'Apps & Tools'
    Description = 'Public development previews of software products and educational tools from Outside In Print LLC.'
    Canonical = 'https://outsideinprint.org/apps/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/apps/bucks-machine/index.html' = @{
    Title = 'Bucks Machine'
    Description = 'A public development preview of planning support that turns de-identified rough notes into a human-reviewed scope, schedule, budget, risk, PDF, and workbook packet.'
    Canonical = 'https://outsideinprint.org/apps/bucks-machine/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/apps/baseball-upside-risk/index.html' = @{
    Title = 'Baseball Upside Risk'
    Description = 'An educational cohort-level preview of the zero-heavy gross-earnings distribution and rare upside tail in professional baseball.'
    Canonical = 'https://outsideinprint.org/apps/baseball-upside-risk/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/studio/index.html' = @{
    Title = 'Outside In Print Studio'
    Description = 'Turn one recording, transcript, draft, or source packet into a clear, bylined essay through a fixed-scope publication sprint.'
    Canonical = 'https://outsideinprint.org/studio/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/outside-in-print-default.png'
    ExpectedImageAlt = 'Outside In Print Studio'
  }
  'public/archive/index.html' = @{
    Title = 'Archive'
    Description = 'The full Outside In Print long-form archive, gathering essays, dialogues, reports, working papers, and stable editions by date.'
    Canonical = 'https://outsideinprint.org/archive/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/oip-archive.png'
    ExpectedImageAlt = 'Outside In Print social card for the long-form archive.'
  }
  'public/syd-and-oliver/index.html' = @{
    Title = 'Syd and Oliver Dialogues'
    Description = 'Dialogue pieces from the recurring world of Syd and Oliver, where power, obligation, money, intimacy, and moral pressure are worked out in conversation.'
    Canonical = 'https://outsideinprint.org/syd-and-oliver/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/library/index.html' = @{
    Title = 'Library'
    Description = 'The full catalog of published work from Outside In Print, searchable by title, type, collection, and version.'
    Canonical = 'https://outsideinprint.org/library/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
  }
  'public/gallery/index.html' = @{
    Title = 'Gallery'
    Description = 'A digital gallery of Outside In Print front-page illustrations.'
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
    ExpectedImage = 'https://outsideinprint.org/images/social/oip-collections.png'
    ExpectedImageAlt = 'Outside In Print social card for the collections directory.'
  }
  'public/collections/musings/index.html' = @{
    Title = 'Musings'
    Description = 'Short source-free reflections on attention, ordinary life, and questions that remain open.'
    Canonical = 'https://outsideinprint.org/collections/musings/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/outside-in-print-default.png'
    ExpectedImageAlt = 'Outside In Print social card for the Musings collection.'
  }
  'public/collections/the-things-we-say/index.html' = @{
    Title = 'The Things We Say'
    Description = 'Plain personal reflections built around the words we choose and the lives we practice.'
    Canonical = 'https://outsideinprint.org/collections/the-things-we-say/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/outside-in-print-default.png'
    ExpectedImageAlt = 'Outside In Print social card for The Things We Say collection.'
  }
  'public/shop/index.html' = @{
    Title = 'Bookstore'
    Description = 'Digital books from Outside In Print, including The American Nightmare: Keep Dreaming, Kid, The Parable of the Sheep, and The Water Cycle.'
    Canonical = 'https://outsideinprint.org/shop/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/books/american-nightmare/american-nightmare-cover-v1.6.jpg'
  }
  'public/shop/the-american-nightmare-keep-dreaming-kid/index.html' = @{
    Title = 'The American Nightmare: Keep Dreaming, Kid'
    Description = 'An OIP digital book on how the American Dream became a global slogan just as the American good life came apart at home.'
    Canonical = 'https://outsideinprint.org/shop/the-american-nightmare-keep-dreaming-kid/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/books/american-nightmare/american-nightmare-cover-v1.6.jpg'
  }
  'public/shop/the-parable-of-the-sheep/index.html' = @{
    Title = 'The Parable of the Sheep'
    Description = 'A compact allegorical fiction about a flock, a vanished shepherd, and the predators that return when memory fails.'
    Canonical = 'https://outsideinprint.org/shop/the-parable-of-the-sheep/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/books/parable-of-the-sheep/parable-of-the-sheep-cover-v1.0.jpg'
  }
  'public/shop/the-water-cycle/index.html' = @{
    Title = 'The Water Cycle: Risk, Infrastructure, and Public Memory'
    Description = 'A compact OIP book about water risk, infrastructure, public memory, and the records that connect communities to the water cycle.'
    Canonical = 'https://outsideinprint.org/shop/the-water-cycle/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/books/the-water-cycle/the-water-cycle-cover-v2.0.jpg'
  }
  'public/about/index.html' = @{
    Title = 'About Outside In Print'
    Description = 'A digital imprint for disciplined public judgment: essays, dialogues, reports, and working papers built from evidence, incentives, tradeoffs, and consequences.'
    Canonical = 'https://outsideinprint.org/about/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/oip-about.png'
    ExpectedImageAlt = 'Outside In Print social card for the About page.'
  }
  'public/authors/index.html' = @{
    Title = 'Authors'
    Description = 'Public author archive pages for Outside In Print, gathering bylines, dossiers, and reading routes for the people behind the work.'
    Canonical = 'https://outsideinprint.org/authors/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/oip-authors.png'
    ExpectedImageAlt = 'Outside In Print social card for the author directory.'
  }
  'public/authors/robert-v-ussley/index.html' = @{
    Title = 'Robert V. Ussley'
    Description = 'Essays and reported writing by Robert V. Ussley on risk, institutions, technology, law, religion, and public life.'
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
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-risk-uncertainty.png'
    ExpectedImageAlt = 'Outside In Print social card for the Risk, Uncertainty, and Decision-Making collection.'
  }
  'public/collections/geopolitics-trade-global-power/index.html' = @{
    Title = 'Geopolitics, Trade, and Global Power'
    Description = 'Essays on foreign policy, trade, energy chokepoints, strategic technology, and the hard machinery of global power.'
    Canonical = 'https://outsideinprint.org/collections/geopolitics-trade-global-power/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-geopolitics-trade-global-power.png'
    ExpectedImageAlt = 'Outside In Print social card for the Geopolitics, Trade, and Global Power collection.'
  }
  'public/collections/civic-institutions-and-public-power/index.html' = @{
    Title = 'Civic Institutions and Public Power'
    Description = 'Essays on courts, federalism, public institutions, and the exercise of public power.'
    Canonical = 'https://outsideinprint.org/collections/civic-institutions-and-public-power/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-civic-institutions-and-public-power.png'
    ExpectedImageAlt = 'Outside In Print social card for the Civic Institutions and Public Power collection.'
  }
  'public/collections/bobs-almanack/index.html' = @{
    Title = 'Bob''s Almanack'
    Description = 'Weekly Outside In Print issues from Robert V. Ussley, gathering new essays, editorial cartoons, compact notices, and one piece worth reprinting.'
    Canonical = 'https://outsideinprint.org/collections/bobs-almanack/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-bobs-almanack.png'
    ExpectedImageAlt = 'Outside In Print social card for the Bob''s Almanack collection.'
  }
  'public/collections/the-ledger/index.html' = @{
    Title = 'The Ledger'
    Description = 'Newsletter-style dispatches that gather recent Outside In Print essays, themes, and recurring concerns into one archival thread.'
    Canonical = 'https://outsideinprint.org/collections/the-ledger/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-the-ledger.png'
    ExpectedImageAlt = 'Outside In Print social card for The Ledger collection.'
  }
  'public/collections/syd-and-oliver-dialogues/index.html' = @{
    Title = 'Syd and Oliver Dialogues'
    Description = 'A conversational archive of Syd and Oliver pieces on truth, power, money, obligation, intimacy, and meaning.'
    Canonical = 'https://outsideinprint.org/collections/syd-and-oliver-dialogues/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-syd-and-oliver-dialogues.png'
    ExpectedImageAlt = 'Outside In Print social card for the Syd and Oliver Dialogues collection.'
  }
  'public/collections/modern-bios/index.html' = @{
    Title = 'Modern Bios'
    Description = 'Archival civic biographies of recent public figures, written as restrained record-driven essays for the imprint.'
    Canonical = 'https://outsideinprint.org/collections/modern-bios/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-modern-bios.png'
    ExpectedImageAlt = 'Outside In Print social card for the Modern Bios collection.'
  }
  'public/collections/lit-review/index.html' = @{
    Title = 'Lit Review'
    Description = 'Reviews and close readings of books and narrative works that stay with theme, structure, and why a story endures.'
    Canonical = 'https://outsideinprint.org/collections/lit-review/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-lit-review.png'
    ExpectedImageAlt = 'Outside In Print social card for the Lit Review collection.'
  }
  'public/collections/floods-water-built-environment/index.html' = @{
    Title = 'Floods, Water, and the Built Environment'
    Description = 'Reporting and essays on flood risk, water systems, riverine disasters, and the places we keep building anyway.'
    Canonical = 'https://outsideinprint.org/collections/floods-water-built-environment/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-floods-water-built-environment.png'
    ExpectedImageAlt = 'Outside In Print social card for the Floods, Water, and the Built Environment collection.'
  }
  'public/collections/technology-ai-machine-future/index.html' = @{
    Title = 'Technology, AI, and the Machine Future'
    Description = 'Essays on artificial intelligence, compute, machine systems, and the social future they are dragging into view.'
    Canonical = 'https://outsideinprint.org/collections/technology-ai-machine-future/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-technology-ai-machine-future.png'
    ExpectedImageAlt = 'Outside In Print social card for the Technology, AI, and the Machine Future collection.'
  }
  'public/collections/moral-religious-philosophical-essays/index.html' = @{
    Title = 'Moral, Religious, and Philosophical Essays'
    Description = 'Essays on moral formation, religion, conscience, and the philosophical habits needed to see clearly.'
    Canonical = 'https://outsideinprint.org/collections/moral-religious-philosophical-essays/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-moral-religious-philosophical-essays.png'
    ExpectedImageAlt = 'Outside In Print social card for the Moral, Religious, and Philosophical Essays collection.'
  }
  'public/collections/reported-case-studies/index.html' = @{
    Title = 'Reported Case Studies'
    Description = 'Tightly reported case studies that stay with one event, institution, or failure long enough to learn something durable.'
    Canonical = 'https://outsideinprint.org/collections/reported-case-studies/'
    OgType = 'website'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedImage = 'https://outsideinprint.org/images/social/collection-reported-case-studies.png'
    ExpectedImageAlt = 'Outside In Print social card for the Reported Case Studies collection.'
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
  'public/essays/the-ai-data-center-wants-its-own-power-plant/index.html' = @{
    Title = 'The AI Data Center Wants Its Own Power Plant'
    Canonical = 'https://outsideinprint.org/essays/the-ai-data-center-wants-its-own-power-plant/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'essays/the-ai-data-center-wants-its-own-power-plant/hero'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/the-model-that-could-not-leave/index.html' = @{
    Title = 'The Model That Could Not Leave'
    Description = "China's block of Meta's Manus acquisition shows how AI companies, talent, and capability are becoming strategic territory."
    Canonical = 'https://outsideinprint.org/essays/the-model-that-could-not-leave/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'essays/the-model-that-could-not-leave/hero'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/smokestack-spreadsheets/index.html' = @{
    Title = 'Smokestack Spreadsheets'
    Description = "OpenAI's missed internal targets show how frontier AI has become a wager on electricity, cloud contracts, data centers, capital, and patience."
    Canonical = 'https://outsideinprint.org/essays/smokestack-spreadsheets/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'essays/smokestack-spreadsheets/hero'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/canvas-fails-finals-week/index.html' = @{
    Title = 'Canvas Fails Finals Week'
    Description = "A reported finals-week Canvas incident becomes a window into public higher education's dependence on private-equity-owned operating layers."
    Canonical = 'https://outsideinprint.org/essays/canvas-fails-finals-week/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'essays/canvas-fails-finals-week/hero'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/the-bet-slip-in-the-briefing-room/index.html' = @{
    Title = 'The Bet Slip in the Briefing Room'
    Description = "The Senate's prediction-market ban shows why event markets become dangerous when public officials can trade on tomorrow's public acts."
    Canonical = 'https://outsideinprint.org/essays/the-bet-slip-in-the-briefing-room/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'essays/the-bet-slip-in-the-briefing-room/hero'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/can-you-pass-the-pepper-please/index.html' = @{
    Title = 'Can You Pass the Pepper, Please?'
    Description = 'Internal ICE force reports show how civil detention can turn requests for property, water, food, and medical care into compliance events.'
    Canonical = 'https://outsideinprint.org/essays/can-you-pass-the-pepper-please/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'essays/can-you-pass-the-pepper-please/hero'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/the-factory-in-the-footnote/index.html' = @{
    Title = 'The Factory in the Footnote'
    Description = 'The SEC climate-disclosure reversal turns a dormant rule into a larger test of investor materiality, carbon accounting, industrial capacity, and national cost.'
    Canonical = 'https://outsideinprint.org/essays/the-factory-in-the-footnote/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'essays/the-factory-in-the-footnote/hero'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/the-blue-pool-at-the-memorial/index.html' = @{
    Title = 'The Blue Pool at the Memorial'
    Description = "Trump's blue Reflecting Pool and East Potomac plans turn Washington maintenance into a case for clean, beautiful, useful public space."
    Canonical = 'https://outsideinprint.org/essays/the-blue-pool-at-the-memorial/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'essays/the-blue-pool-at-the-memorial/hero'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/outside-the-garden/index.html' = @{
    Title = 'Outside the Garden'
    Description = 'A moral and religious essay on America, exile, sacrifice, and the collapse of inherited moral order.'
    Canonical = 'https://outsideinprint.org/essays/outside-the-garden/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'essays/outside-the-garden/hero'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/the-strait-that-holds-the-price/index.html' = @{
    Title = 'The Strait That Holds the Price'
    Description = "Iran's offer to reopen the Strait of Hormuz shows how one narrow passage governs energy security, commodity prices, and public life."
    Canonical = 'https://outsideinprint.org/essays/the-strait-that-holds-the-price/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'editorial/lines-of-fire'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/the-blockade-has-a-phone-number/index.html' = @{
    Title = 'The Blockade Has a Phone Number'
    Description = "Trump's canceled Iran envoy trip shows how quickly diplomacy becomes theater when the real machinery of conflict is a blocked waterway."
    Canonical = 'https://outsideinprint.org/essays/the-blockade-has-a-phone-number/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'essays/the-blockade-has-a-phone-number/hero'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/the-warning-label-in-the-weeds/index.html' = @{
    Title = 'The Warning Label in the Weeds'
    Description = "The Supreme Court's Roundup case turns a weedkiller label into a test of federal power, state lawsuits, farming, and public trust."
    Canonical = 'https://outsideinprint.org/essays/the-warning-label-in-the-weeds/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'essays/the-warning-label-in-the-weeds/hero'
    AuthorMeta = 'Robert V. Ussley'
  }
  'public/essays/the-sewer-under-the-sidewalk/index.html' = @{
    Title = 'The Sewer Under the Sidewalk'
    Description = "An essay on Alewife Brook, Boston-area combined sewer overflows, MWRA's cleanup plan, and the public cost of climate-era pipe decisions."
    Canonical = 'https://outsideinprint.org/essays/the-sewer-under-the-sidewalk/'
    OgType = 'article'
    TwitterCard = 'summary_large_image'
    RequireImage = $true
    ExpectedManagedImageId = 'editorial/the-sewer-under-the-sidewalk'
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
  'public/apps/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'WebPage', 'BreadcrumbList', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork', 'CollectionPage', 'Product', 'SoftwareApplication', 'Offer')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
  }
  'public/apps/bucks-machine/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'WebPage', 'BreadcrumbList', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork', 'CollectionPage', 'Product', 'SoftwareApplication', 'Offer')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
  }
  'public/apps/baseball-upside-risk/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'WebPage', 'BreadcrumbList', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork', 'CollectionPage', 'Product', 'SoftwareApplication', 'Offer')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
  }
  'public/archive/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'CollectionPage', 'BreadcrumbList', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
    RequireSearchAction = $true
  }
  'public/syd-and-oliver/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'CollectionPage', 'BreadcrumbList', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
    RequireSearchAction = $true
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
  'public/shop/index.html' = @{
    RequiredTypes = @('Organization', 'WebSite', 'CollectionPage', 'BreadcrumbList', 'ImageObject')
    ForbiddenTypes = @('Article', 'CreativeWork')
    RequirePublisherNode = $true
    RequireBreadcrumb = $true
    RequireSearchAction = $true
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
  'public/collections/geopolitics-trade-global-power/index.html' = @{
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
  'public/studio/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/apps/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/apps/bucks-machine/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/apps/baseball-upside-risk/index.html' = @{
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
  'public/shop/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/about/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/archive/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'index, follow, max-image-preview:large'
  }
  'public/essays/index.html' = @{
    ExpectRobotsMeta = $true
    Robots = 'noindex, follow'
  }
  'public/syd-and-oliver/index.html' = @{
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
  'public/collections/geopolitics-trade-global-power/index.html' = @{
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
  'public/essays/canvas-fails-finals-week/index.html' = @{
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
  'public/archive/index.html' = @{
    SiteFeed = 'https://outsideinprint.org/index.xml'
    SectionFeed = 'https://outsideinprint.org/archive/index.xml'
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
  'https://outsideinprint.org/archive/',
  'https://outsideinprint.org/essays/the-risk-management-buffet/',
  'https://outsideinprint.org/syd-and-oliver/',
  'https://outsideinprint.org/collections/',
  'https://outsideinprint.org/collections/risk-uncertainty/',
  'https://outsideinprint.org/library/',
  'https://outsideinprint.org/apps/',
  'https://outsideinprint.org/apps/bucks-machine/',
  'https://outsideinprint.org/apps/baseball-upside-risk/'
  'https://outsideinprint.org/studio/'
)

$requiredSitemapExclusions = @(
  'https://outsideinprint.org/authors/',
  'https://outsideinprint.org/random/',
  'https://outsideinprint.org/start-here/',
  'https://outsideinprint.org/almanack/',
  'https://outsideinprint.org/essays/',
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
    'https://outsideinprint.org/archive/',
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
  'public/archive/index.html',
  'public/essays/index.html',
  'public/essays/your-part/index.html',
  'public/essays/togetherness/index.html',
  'public/essays/in-hand/index.html',
  'public/syd-and-oliver/index.html',
  'public/library/index.html',
  'public/gallery/index.html',
  'public/collections/index.html',
  'public/collections/the-things-we-say/index.html',
  'public/collections/bobs-almanack/index.html',
  'public/almanack/2026-05-02/index.html',
  'public/almanack/2026-05-09/index.html',
  'public/almanack/2026-05-16/index.html',
  'public/almanack/2026-05-23/index.html',
  'public/almanack/2026-05-30/index.html',
  'public/almanack/2026-06-06/index.html',
  'public/almanack/2026-06-20/index.html',
  'public/almanack/2026-06-27/index.html',
  'public/almanack/2026-07-04/index.html',
  'public/almanack/2026-07-11/index.html',
  'public/almanack/2026-07-18/index.html',
  'public/almanack/2026-07-25/index.html',
  'public/almanack/2026-08-01/index.html',
  'public/almanack/2026-08-08/index.html',
  'public/almanack/2026-08-15/index.html',
  'public/almanack/2026-08-22/index.html',
  'public/almanack/2026-08-29/index.html',
  'public/shop/index.html',
  'public/shop/the-american-nightmare-keep-dreaming-kid/index.html',
  'public/shop/the-parable-of-the-sheep/index.html',
  'public/shop/the-water-cycle/index.html',
  'public/studio/index.html',
  'public/games/index.html',
  'public/games/idle-times/index.html',
  'public/random/index.html',
  'public/collections/the-ledger/index.html',
  'public/collections/syd-and-oliver-dialogues/index.html',
  'public/collections/modern-bios/index.html',
  'public/collections/lit-review/index.html',
  'public/collections/risk-uncertainty/index.html',
  'public/collections/geopolitics-trade-global-power/index.html',
  'public/collections/civic-institutions-and-public-power/index.html',
  'public/collections/floods-water-built-environment/index.html',
  'public/collections/technology-ai-machine-future/index.html',
  'public/collections/moral-religious-philosophical-essays/index.html',
  'public/collections/reported-case-studies/index.html',
  'public/essays/presidential-elections/index.html',
  'public/essays/the-risk-management-buffet/index.html',
  'public/essays/synthetic-reasoning/index.html',
  'public/essays/modern-prometheus/index.html',
  'public/essays/in-the-image-of-god/index.html',
  'public/essays/the-hate-ledger/index.html',
  'public/essays/canvas-fails-finals-week/index.html',
  'public/essays/can-you-pass-the-pepper-please/index.html',
  'public/essays/the-factory-in-the-footnote/index.html',
  'public/essays/the-ash-pond-under-the-cloud/index.html',
  'public/essays/the-mailbox-at-the-clinic-door/index.html',
  'public/essays/the-text-message-in-the-archive-box/index.html',
  'public/essays/the-courthouse-that-ate-the-republic/index.html',
  'public/essays/the-card-in-the-catalog/index.html',
  'public/essays/the-brass-disk-in-the-sidewalk/index.html',
  'public/essays/the-map-that-priced-the-fire/index.html',
  'public/essays/the-bolt-beside-the-gas-tank/index.html',
  'public/essays/the-ledger-vol-1/index.html',
  'public/essays/the-ledger-vol-2/index.html',
  'public/essays/the-ledger-vol-3/index.html',
  'public/essays/what-happened-at-camp-mystic/index.html',
  'public/syd-and-oliver/peaches-or-greece/index.html',
  'public/essays/save-some-air-for-the-fishies/index.html',
  'public/essays/the-easement-under-the-lake/index.html',
  'public/essays/multiple-shmultiple/index.html',
  'public/essays/the-door-that-would-not-open/index.html',
  'public/essays/the-world-is-back-at-the-poker-table/index.html'
)

$collectionRoomExpectations = [ordered]@{
  'public/collections/the-ledger/index.html' = 'ledger-editorial-desk'
  'public/collections/syd-and-oliver-dialogues/index.html' = 'syd-and-oliver-smoky-lounge'
  'public/collections/modern-bios/index.html' = 'modern-bios-records-archive'
  'public/collections/lit-review/index.html' = 'lit-review-lamplit-shelf'
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
  'lit-review-lamplit-shelf'
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
  $primaryNavHtml = Get-PrimaryNavHtml -Html $content
  if (-not [string]::IsNullOrWhiteSpace($primaryNavHtml)) {
    $routePath = Get-PublicRoutePath -RelativePath $relativePath
    foreach ($anchor in (Get-OpenTags -Html $primaryNavHtml -TagName 'a')) {
      $ariaCurrent = Get-AttributeValue -Tag $anchor -Name 'aria-current'
      if ($null -eq $ariaCurrent) {
        continue
      }

      if ($ariaCurrent -cne 'page') {
        $uxIssues.Add("$relativePath => primary navigation uses unsupported aria-current='$ariaCurrent'")
        continue
      }

      $href = Get-AttributeValue -Tag $anchor -Name 'href'
      $hrefPath = Get-SitePathFromHref -Href $href
      if ([string]::IsNullOrWhiteSpace($routePath) -or $hrefPath -cne $routePath) {
        $uxIssues.Add("$relativePath => aria-current='page' points to '$hrefPath' instead of the rendered route '$routePath'")
      }
    }
  }
  $footerNavHtml = Get-FooterNavHtml -Html $content
  if (-not [string]::IsNullOrWhiteSpace($footerNavHtml)) {
    $routePath = Get-PublicRoutePath -RelativePath $relativePath
    foreach ($anchor in (Get-OpenTags -Html $footerNavHtml -TagName 'a')) {
      $ariaCurrent = Get-AttributeValue -Tag $anchor -Name 'aria-current'
      if ($null -eq $ariaCurrent) {
        continue
      }

      if ($ariaCurrent -cne 'page') {
        $uxIssues.Add("$relativePath => footer navigation uses unsupported aria-current='$ariaCurrent'")
        continue
      }

      $hrefPath = Get-SitePathFromHref -Href (Get-AttributeValue -Tag $anchor -Name 'href')
      if ([string]::IsNullOrWhiteSpace($routePath) -or $hrefPath -cne $routePath) {
        $uxIssues.Add("$relativePath => footer aria-current='page' points to '$hrefPath' instead of the rendered route '$routePath'")
      }
    }
  }
  $isArticleContentPage = (
    $relativePath -match '^public/(?:essays|syd-and-oliver)/[^/]+/index\.html$' -and
    $content -match '<article\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece\b[^"]*"|''[^'']*\bpiece\b[^'']*''|[^\s>]*\bpiece\b[^\s>]*)'
  )

  if ($isArticleContentPage) {
    $articleLightboxContainerCount = [regex]::Matches($content, '<div\b(?=[^>]*\bdata-article-plate-lightbox\b)[^>]*>', 'IgnoreCase').Count
    if ($articleLightboxContainerCount -ne 1) {
      $articleLightboxIssues.Add("$relativePath => expected exactly one article image lightbox container, found $articleLightboxContainerCount")
    }

    $articleLightboxTitleCount = [regex]::Matches(
      $content,
      '<p\b(?=[^>]*\bid\s*=\s*(?:"article-plate-lightbox-title"|''article-plate-lightbox-title''|article-plate-lightbox-title))(?=[^>]*\bclass\s*=\s*(?:"[^"]*\bcartoon-lightbox__title\b[^"]*"|''[^'']*\bcartoon-lightbox__title\b[^'']*''|[^\s>]*\bcartoon-lightbox__title\b[^\s>]*))(?=[^>]*\bdata-article-plate-lightbox-title(?:=|\s|>))[^>]*>\s*</p>',
      'IgnoreCase'
    ).Count
    if ($articleLightboxTitleCount -ne 1) {
      $articleLightboxIssues.Add("$relativePath => expected one non-heading article lightbox dialog label, found $articleLightboxTitleCount")
    }
    if ($content -match '(?is)<h[1-6]\b[^>]*\bdata-article-plate-lightbox-title(?:=|\s|>)') {
      $articleLightboxIssues.Add("$relativePath => article lightbox title hook must not render as an empty heading")
    }

    $pieceBodyMatch = [regex]::Match(
      $content,
      '(?is)<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-body\b[^"]*"|''[^'']*\bpiece-body\b[^'']*''|[^\s>]*\bpiece-body\b[^\s>]*)[^>]*>(.*?)</div>\s*<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-aftermatter\b[^"]*"|''[^'']*\bpiece-aftermatter\b[^'']*''|[^\s>]*\bpiece-aftermatter\b[^\s>]*)'
    )
    $articleBodyHasImage = $pieceBodyMatch.Success -and $pieceBodyMatch.Groups[1].Value -match '<img\b'
    $articleLightboxScriptSupportsBodyImages = (
      $content -match [regex]::Escape('[data-article-plate-lightbox-trigger]') -and
      $content -match [regex]::Escape('.piece-body img') -and
      $content -match [regex]::Escape('article-lightbox-image')
    )

    if ($articleBodyHasImage -and -not $articleLightboxScriptSupportsBodyImages) {
      $articleLightboxIssues.Add("$relativePath => expected article body images to be covered by the progressive lightbox script")
    }
  }

  if (
    $requiredSemanticPages.Contains($relativePath) -or
    ($optionalDefaultListPages -contains $relativePath) -or
    $requiredImportedMediaPages.Contains($relativePath) -or
    $requiredIndexationPages.Contains($relativePath) -or
    $requiredMetadataPages.Contains($relativePath) -or
    $requiredStructuredDataPages.Contains($relativePath) -or
    ($requiredLegacyHostRedirectPages -contains $relativePath) -or
    ($requiredLegacyCleanupPages -contains $relativePath) -or
    ($requiredUxPages -contains $relativePath) -or
    ($requiredEssayHeroPages -contains $relativePath) -or
    ($relativePath -ceq 'public/essays/jack-stratton-and-the-vulfpeck-model/index.html')
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
      if ([System.IO.Path]::GetExtension(($src -split '[?#]', 2)[0]).ToLowerInvariant() -in @('.png','.gif')) {
        $legacyCleanupIssues.Add("$relativePath => retired raw Medium PNG/GIF leaked into generated HTML: $src")
      }
    }

    if ($src.StartsWith('/images/syd-and-oliver/', [System.StringComparison]::OrdinalIgnoreCase)) {
      $legacyCleanupIssues.Add("$relativePath => retired raw Syd-and-Oliver hero leaked into generated HTML: $src")
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

  if ($content -match '(?:https://outsideinprint\.org)?/shop/(?:hat|shirt|tote)/') {
    $retiredRouteIssues.Add("$relativePath => retired merch route leaked into generated HTML")
  }

  $allStudioScriptTags = @(
    Get-OpenTags -Html $content -TagName 'script' |
      Where-Object {
        $scriptSrc = Get-AttributeValue -Tag $_ -Name 'src'
        $scriptSrc -match '(?i)studio-inquiry'
      }
  )
  if ($relativePath -eq 'public/studio/index.html') {
    if ($studioComposerEnabled) {
      $fingerprintedStudioScriptTags = @(
        $allStudioScriptTags |
          Where-Object {
            $scriptSrc = Get-AttributeValue -Tag $_ -Name 'src'
            $scriptSrc -match '(?i)/js/studio-inquiry(?:\.min)?\.[a-f0-9]{16,}\.js(?:[?#].*)?$'
          }
      )
      if ($allStudioScriptTags.Count -ne 1 -or $fingerprintedStudioScriptTags.Count -ne 1) {
        $uxIssues.Add("$relativePath => expected exactly one fingerprinted Studio inquiry script, found $($allStudioScriptTags.Count) Studio-named and $($fingerprintedStudioScriptTags.Count) fingerprinted")
      }
    }
    elseif ($allStudioScriptTags.Count -ne 0) {
      $uxIssues.Add("$relativePath => disabled Studio composer must omit the inquiry script")
    }
  }
  elseif ($allStudioScriptTags.Count -ne 0) {
    $uxIssues.Add("$relativePath => Studio-only inquiry script leaked onto another route")
  }

}

if ($targetPageHtml.ContainsKey('public/studio/index.html')) {
  $studioHtml = [string]$targetPageHtml['public/studio/index.html']
  $studioVisibleText = Convert-HtmlFragmentToText -Html $studioHtml

  foreach ($requiredText in @(
    'You have the material. We make it ready to publish.',
    'Fixed scope · First draft in 7 business days · One revision',
    $studioActiveRateText,
    '50% deposit to book the project',
    'Final 50% due before we release the final files',
    '90 minutes',
    '15,000 words',
    '25 pages',
    'One finished essay with your byline, 1,500–2,000 words',
    'The 7-business-day clock starts after three things happen: you approve the written scope, pay the deposit, and send all agreed source material.',
    'How much source material do you have?',
    'Who should read the essay?',
    'I have not attached or pasted confidential, classified, privileged, export-controlled, or restricted source material. I will wait for Outside In Print to ask for source files and tell me what it can accept and how to send it.',
    'This form does not send your answers to Outside In Print or site analytics. When you select “Prepare inquiry email,” your answers go to your email app or provider to make a draft. That app or provider may save or sync the draft under its own privacy rules. Outside In Print gets your answers only if you send the email and it reaches support@outsideinprint.org.',
    'More interviews',
    'Major new research beyond your material and basic fact-checking',
    'Custom artwork',
    'Website design or coding',
    'Long-term social media work or content plans',
    'Book-length projects',
    'More than one revision round',
    'A promise that Outside In Print will publish the essay',
    'These are examples of our own editorial work. They are not client testimonials.',
    'We give you a complete finished file set. Outside In Print reserves the right to publish the essay on outsideinprint.org.',
    'The written scope states which rights transfer to you after full payment. Outside In Print keeps the right to publish the finished essay on outsideinprint.org.',
    'We will reply within 2 business days with either a fit decision or a request for more details.',
    'You cannot pay on this page. We review each project and agree on the written scope before you pay.'
  )) {
    if ($studioVisibleText.IndexOf($requiredText, [System.StringComparison]::Ordinal) -lt 0) {
      $uxIssues.Add("public/studio/index.html => expected approved Studio text: $requiredText")
    }
  }

  foreach ($obsoleteText in @(
    'Fixed scope · 7 business days · One revision',
    '7-business-day production window',
    'Your answers remain on your device until you open and send'
  )) {
    if ($studioVisibleText.IndexOf($obsoleteText, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      $uxIssues.Add("public/studio/index.html => obsolete Studio claim remains: $obsoleteText")
    }
  }

  $studioForms = @(
    Get-OpenTags -Html $studioHtml -TagName 'form' |
      Where-Object { $null -ne (Get-AttributeValue -Tag $_ -Name 'data-studio-email-form') -or $_ -match '\bdata-studio-email-form(?:\s|>)' }
  )
  if ($studioComposerEnabled) {
    if ($studioForms.Count -ne 1) {
      $uxIssues.Add("public/studio/index.html => expected one guided Studio inquiry form, found $($studioForms.Count)")
    }
    else {
      $studioFormTag = $studioForms[0]
      foreach ($attributeExpectation in @(
        @{ Name = 'action'; Value = '/studio/#studio-inquiry' },
        @{ Name = 'method'; Value = 'post' },
        @{ Name = 'data-inquiry-email'; Value = 'support@outsideinprint.org' },
        @{ Name = 'data-inquiry-subject-prefix'; Value = 'Outside In Print Studio Inquiry' },
        @{ Name = 'data-current-rate'; Value = $studioActivePrice },
        @{ Name = 'data-deposit-percent'; Value = '50' },
        @{ Name = 'data-offer-code'; Value = 'OIP-STUDIO-EXPERT-ESSAY' },
        @{ Name = 'data-source-page'; Value = 'https://outsideinprint.org/studio/' },
        @{ Name = 'data-analytics-event'; Value = 'studio_inquiry_email_prepare' },
        @{ Name = 'data-analytics-product'; Value = 'OIP-STUDIO-EXPERT-ESSAY' },
        @{ Name = 'data-analytics-format'; Value = 'service_inquiry_email' },
        @{ Name = 'data-analytics-source-slot'; Value = 'studio_inquiry_form' },
        @{ Name = 'data-analytics-slug'; Value = 'studio' }
      )) {
        $actualValue = Get-AttributeValue -Tag $studioFormTag -Name $attributeExpectation.Name
        if ($actualValue -cne $attributeExpectation.Value) {
          $uxIssues.Add("public/studio/index.html => Studio form $($attributeExpectation.Name) expected '$($attributeExpectation.Value)', found '$actualValue'")
        }
      }
    }

    $studioFieldExpectations = @(
      @{ Name = 'name'; Tag = 'input'; Type = 'text'; MaxLength = '100'; Required = $true },
      @{ Name = 'email'; Tag = 'input'; Type = 'email'; MaxLength = '254'; Required = $true },
      @{ Name = 'website'; Tag = 'input'; Type = 'url'; MaxLength = '300'; Required = $false },
      @{ Name = 'role'; Tag = 'select'; Required = $true },
      @{ Name = 'source_material'; Tag = 'select'; Required = $true },
      @{ Name = 'source_size'; Tag = 'input'; Type = 'text'; MaxLength = '80'; Required = $true },
      @{ Name = 'intended_reader'; Tag = 'input'; Type = 'text'; MaxLength = '160'; Required = $true },
      @{ Name = 'project_subject'; Tag = 'input'; Type = 'text'; MaxLength = '160'; Required = $true },
      @{ Name = 'desired_outcome'; Tag = 'textarea'; MaxLength = '800'; Required = $true },
      @{ Name = 'timeline'; Tag = 'select'; Required = $true },
      @{ Name = 'source_safety_acknowledgement'; Tag = 'input'; Type = 'checkbox'; Required = $true },
      @{ Name = 'commercial_acknowledgement'; Tag = 'input'; Type = 'checkbox'; Required = $true }
    )
    foreach ($fieldExpectation in $studioFieldExpectations) {
      $fieldTags = @(
        Get-OpenTags -Html $studioHtml -TagName ([string]$fieldExpectation.Tag) |
          Where-Object { (Get-AttributeValue -Tag $_ -Name 'name') -ceq [string]$fieldExpectation.Name }
      )
      if ($fieldTags.Count -ne 1) {
        $uxIssues.Add("public/studio/index.html => expected one '$($fieldExpectation.Name)' field, found $($fieldTags.Count)")
        continue
      }
      $fieldTag = $fieldTags[0]
      if ($fieldExpectation.ContainsKey('Type') -and (Get-AttributeValue -Tag $fieldTag -Name 'type') -cne [string]$fieldExpectation.Type) {
        $uxIssues.Add("public/studio/index.html => field '$($fieldExpectation.Name)' has the wrong type")
      }
      if ($fieldExpectation.ContainsKey('MaxLength') -and (Get-AttributeValue -Tag $fieldTag -Name 'maxlength') -cne [string]$fieldExpectation.MaxLength) {
        $uxIssues.Add("public/studio/index.html => field '$($fieldExpectation.Name)' has the wrong maxlength")
      }
      $fieldIsRequired = $fieldTag -match '\brequired(?:\s|>)'
      if ($fieldIsRequired -ne [bool]$fieldExpectation.Required) {
        $uxIssues.Add("public/studio/index.html => field '$($fieldExpectation.Name)' required state is incorrect")
      }
    }

    $studioQualificationFieldOrderPattern = '(?s)name=(?:"source_material"|source_material)(?:\s|>).*?name=(?:"source_size"|source_size)(?:\s|>).*?name=(?:"intended_reader"|intended_reader)(?:\s|>).*?name=(?:"project_subject"|project_subject)(?:\s|>)'
    if ($studioHtml -notmatch $studioQualificationFieldOrderPattern) {
      $uxIssues.Add('public/studio/index.html => qualification fields must render in Source material, Source size, Intended reader, Proposed essay order')
    }

    $studioSubmitButtons = @(
      Get-OpenTags -Html $studioHtml -TagName 'button' |
        Where-Object { (Get-AttributeValue -Tag $_ -Name 'type') -ceq 'submit' }
    )
    if ($studioSubmitButtons.Count -ne 1 -or $studioSubmitButtons[0] -notmatch '\bdisabled(?:\s|>)') {
      $uxIssues.Add('public/studio/index.html => inquiry submit button must render disabled in source HTML')
    }
    if ($studioHtml -notmatch '<p\b(?=[^>]*\brole=(?:"status"|status))(?=[^>]*\baria-live=(?:"polite"|polite))[^>]*>') {
      $uxIssues.Add('public/studio/index.html => inquiry form must expose a polite live status element')
    }
  }
  elseif ($studioForms.Count -ne 0) {
    $uxIssues.Add("public/studio/index.html => disabled Studio composer must omit the guided form")
  }

  if ($studioHtml -match '<input\b[^>]*type=(?:"file"|file)') {
    $uxIssues.Add('public/studio/index.html => inquiry form must not contain a file input')
  }
  if ($studioHtml -notmatch 'href=(?:"/privacy/"|/privacy/)>Privacy Policy</a>') {
    $uxIssues.Add('public/studio/index.html => Studio inquiry section must link to the Privacy Policy')
  }

  $directEmailAnchors = @(
    Get-OpenTags -Html $studioHtml -TagName 'a' |
      Where-Object { (Get-AttributeValue -Tag $_ -Name 'data-analytics-event') -ceq 'studio_inquiry_direct_email' }
  )
  if ($directEmailAnchors.Count -ne 1) {
    $uxIssues.Add("public/studio/index.html => expected one tracked direct-email fallback, found $($directEmailAnchors.Count)")
  }
  else {
    $directEmailHref = [System.Net.WebUtility]::HtmlDecode((Get-AttributeValue -Tag $directEmailAnchors[0] -Name 'href'))
    if ($directEmailHref -notmatch '^mailto:support@outsideinprint\.org\?') {
      $uxIssues.Add('public/studio/index.html => direct-email fallback must use the configured support address')
    }
    if ($directEmailHref -match '\+' -or $directEmailHref -notmatch '%20' -or $directEmailHref -notmatch '(?i)%0D%0A') {
      $uxIssues.Add('public/studio/index.html => direct-email fallback must encode spaces and CRLF for mailto compatibility')
    }
    $directEmailBodyMatch = [regex]::Match($directEmailHref, '(?:\?|&)body=([^&]*)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $directEmailBodyMatch.Success) {
      $uxIssues.Add('public/studio/index.html => direct-email fallback must include an encoded body')
    }
    else {
      $directEmailBody = [Uri]::UnescapeDataString($directEmailBodyMatch.Groups[1].Value)
      foreach ($requiredBodyText in @(
        'Source size:',
        'Intended reader:',
        'Current base rate: $1,250. A 50% deposit is required to book the project.',
        'Safety reminder: Do not attach or paste confidential, classified, privileged, export-controlled, or restricted source material. Wait for Outside In Print to tell you what it can accept and how to send it.'
      )) {
        if ($directEmailBody.IndexOf($requiredBodyText, [System.StringComparison]::Ordinal) -lt 0) {
          $uxIssues.Add("public/studio/index.html => direct-email fallback body must include: $requiredBodyText")
        }
      }
      $previousDirectEmailPromptIndex = -1
      foreach ($orderedDirectEmailPrompt in @('Source material:', 'Source size:', 'Intended reader:', 'Proposed essay:')) {
        $currentDirectEmailPromptIndex = $directEmailBody.IndexOf($orderedDirectEmailPrompt, [System.StringComparison]::Ordinal)
        if ($currentDirectEmailPromptIndex -le $previousDirectEmailPromptIndex) {
          $uxIssues.Add("public/studio/index.html => direct-email fallback prompt '$orderedDirectEmailPrompt' is missing or out of order")
        }
        $previousDirectEmailPromptIndex = $currentDirectEmailPromptIndex
      }
      if ($directEmailBody.IndexOf('I have not attached', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $uxIssues.Add('public/studio/index.html => direct-email fallback must use a non-assertive safety reminder')
      }
      if ($directEmailBody.IndexOf('acknowledged', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $uxIssues.Add('public/studio/index.html => direct-email fallback must not claim an unchecked commercial acknowledgment')
      }
      if ($directEmailBody -match '(?:Offer code|Source page):') {
        $uxIssues.Add('public/studio/index.html => direct-email fallback must not expose removed internal offer-code or source-page fields')
      }
    }
    foreach ($attributeExpectation in @(
      @{ Name = 'data-analytics-source-slot'; Value = 'studio_inquiry_fallback' },
      @{ Name = 'data-analytics-product'; Value = 'OIP-STUDIO-EXPERT-ESSAY' },
      @{ Name = 'data-analytics-format'; Value = 'direct_email' },
      @{ Name = 'data-analytics-slug'; Value = 'studio' }
    )) {
      if ((Get-AttributeValue -Tag $directEmailAnchors[0] -Name $attributeExpectation.Name) -cne $attributeExpectation.Value) {
        $uxIssues.Add("public/studio/index.html => direct-email fallback has incorrect $($attributeExpectation.Name)")
      }
    }
  }
}

if ($targetPageHtml.ContainsKey('public/privacy/index.html')) {
  $privacyVisibleText = Convert-HtmlFragmentToText -Html ([string]$targetPageHtml['public/privacy/index.html'])
  $requiredPrivacyText = 'When you enter information in the Studio inquiry form, the form does not send the inquiry-field contents to Outside In Print, a hosted form provider, or site analytics. Selecting “Prepare inquiry email” passes those contents to your configured email application or provider through a mailto: draft; that application or provider may store or sync the draft under its own privacy practices. Outside In Print receives the information only if you send the message and it reaches support@outsideinprint.org.'
  if ($privacyVisibleText.IndexOf($requiredPrivacyText, [System.StringComparison]::Ordinal) -lt 0) {
    $uxIssues.Add('public/privacy/index.html => expected corrected Studio mailto and email-provider privacy disclosure')
  }
  foreach ($obsoletePrivacyText in @(
    'remains in your browser',
    'preparing the draft does not transmit',
    'The information is transmitted only when you send'
  )) {
    if ($privacyVisibleText.IndexOf($obsoletePrivacyText, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      $uxIssues.Add("public/privacy/index.html => obsolete Studio privacy claim remains: $obsoletePrivacyText")
    }
  }
}

$almanackLandmarkPaths = @(
  $targetPageHtml.Keys |
    Where-Object { $_ -eq 'public/collections/bobs-almanack/index.html' -or $_ -match '^public/almanack/\d{4}-\d{2}-\d{2}/index\.html$' }
)
foreach ($relativePath in $almanackLandmarkPaths) {
  $mainTags = @(Get-OpenTags -Html ([string]$targetPageHtml[$relativePath]) -TagName 'main')
  if ($mainTags.Count -ne 1) {
    $semanticIssues.Add("$relativePath => expected exactly one <main>, found $($mainTags.Count)")
    continue
  }
  if ((Get-AttributeValue -Tag $mainTags[0] -Name 'id') -ne 'main-content') {
    $semanticIssues.Add("$relativePath => expected the sole main landmark to be <main id=""main-content"">")
  }
}

foreach ($requiredOutput in @(
  'apps/index.html',
  'apps/bucks-machine/index.html',
  'apps/baseball-upside-risk/index.html'
)) {
  $fullPath = Join-Path $SiteDir $requiredOutput
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    $appsPreviewIssues.Add("public/$requiredOutput => public Apps & Tools route was not emitted")
  }
}

foreach ($sample in @(
  @{ RelativePath = 'apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.pdf'; Sha256 = 'D9DA9DA6FBD32592F36DAEA063488E3E90E4307681B98944A7887BF31B3B0718' },
  @{ RelativePath = 'apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.xlsx'; Sha256 = 'FD1B0CFD5C7230CF31235E5E3C15CBAE2289BB5E808868D667F9175BBCE9B4F8' }
)) {
  $samplePath = Join-Path $SiteDir ([string]$sample.RelativePath)
  if (-not (Test-Path -LiteralPath $samplePath -PathType Leaf)) {
    $appsPreviewIssues.Add("public/$($sample.RelativePath) => reviewed synthetic sample was not emitted")
    continue
  }
  $actualHash = (Get-FileHash -LiteralPath $samplePath -Algorithm SHA256).Hash
  if ($actualHash -ne [string]$sample.Sha256) {
    $appsPreviewIssues.Add("public/$($sample.RelativePath) => synthetic sample hash differs from the reviewed artifact")
  }
}

$appsIndexPath = 'public/apps/index.html'
$bucksPreviewPath = 'public/apps/bucks-machine/index.html'
$baseballPreviewPath = 'public/apps/baseball-upside-risk/index.html'
if ($targetPageHtml.ContainsKey($appsIndexPath) -and $targetPageHtml.ContainsKey($bucksPreviewPath) -and $targetPageHtml.ContainsKey($baseballPreviewPath)) {
  $appsHtml = [string]$targetPageHtml[$appsIndexPath]
  $bucksHtml = [string]$targetPageHtml[$bucksPreviewPath]
  $baseballHtml = [string]$targetPageHtml[$baseballPreviewPath]
  foreach ($requiredSnippet in @(
    'Development preview.',
    'Not currently available for use or purchase.',
    'Bucks Machine, a product operated and sold by Outside In Print LLC.'
  )) {
    if (($appsHtml + $bucksHtml) -notmatch [regex]::Escape($requiredSnippet)) {
      $appsPreviewIssues.Add("Apps preview => expected public snippet missing: $requiredSnippet")
    }
  }
  foreach ($requiredSnippet in @(
    'support@outsideinprint.org',
    'bucks-machine-synthetic-professional-services-demo.pdf',
    'bucks-machine-synthetic-professional-services-demo.xlsx'
  )) {
    if ($bucksHtml -notmatch [regex]::Escape($requiredSnippet)) {
      $appsPreviewIssues.Add("$bucksPreviewPath => expected public snippet missing: $requiredSnippet")
    }
  }
  foreach ($requiredSnippet in @(
    'Baseball Upside Risk, a product operated and sold by Outside In Print LLC.',
    'This static preview collects no player profile, name, school, email address, payment, or report request.',
    'This frozen B-GERM snapshot was generated May 14, 2026. It uses 2024-25 participation inputs and 2025 draft inputs; it is not a live 2026 probability estimate.',
    '99.509%',
    '$27,201',
    'Long Shots in the Big League',
    'Companion publication in preparation',
    'support@outsideinprint.org'
  )) {
    if ($baseballHtml -notmatch [regex]::Escape($requiredSnippet)) {
      $appsPreviewIssues.Add("$baseballPreviewPath => expected public snippet missing: $requiredSnippet")
    }
  }
  if ($appsHtml.IndexOf('Bucks Machine', [StringComparison]::Ordinal) -ge $appsHtml.IndexOf('Baseball Upside Risk', [StringComparison]::Ordinal)) {
    $appsPreviewIssues.Add('Apps preview => expected Bucks Machine first and Baseball Upside Risk second')
  }
  if (($appsHtml + $bucksHtml + $baseballHtml) -match '(?i)<form\b|stripe|checkout|waitlist|available now|\$19|\$49|\$500') {
    $appsPreviewIssues.Add('Apps preview => forbidden commercial, intake, or legacy-price surface was emitted')
  }
  if ($baseballHtml -match '(?i)SoftwareApplication|"@type"\s*:\s*"(?:Product|Offer)"') {
    $appsPreviewIssues.Add("$baseballPreviewPath => forbidden product, software, or offer schema was emitted")
  }
}

$sitemapPath = Join-Path $SiteDir 'sitemap.xml'
if (Test-Path -LiteralPath $sitemapPath -PathType Leaf) {
  $targetPageHtml['public/sitemap.xml'] = Get-Content -Path $sitemapPath -Raw
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

foreach ($relativePath in $requiredImportedMediaPages.Keys) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $importedMediaIssues.Add("Missing generated page required for imported-media regression coverage: $relativePath")
    continue
  }

  $html = $targetPageHtml[$relativePath]
  $expectedMedia = $requiredImportedMediaPages[$relativePath]
  $expectedPrefix = [string]$expectedMedia.ExpectedImagePrefix
  if ($html -notmatch [regex]::Escape($expectedPrefix)) {
    $importedMediaIssues.Add("$relativePath => expected localized $expectedPrefix media references")
  }

  if ($expectedMedia.ContainsKey('ForbiddenImagePattern') -and $html -match [string]$expectedMedia.ForbiddenImagePattern) {
    $importedMediaIssues.Add("$relativePath => found retired Medium placeholder SVG reference")
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

    if ($expected.Contains('ExpectedImage')) {
      $expectedImage = [string]$expected.ExpectedImage
      if ($ogImage -ne $expectedImage) {
        $metadataIssues.Add("$relativePath => expected og:image '$expectedImage', found '$ogImage'")
      }
      if ($twitterImage -ne $expectedImage) {
        $metadataIssues.Add("$relativePath => expected twitter:image '$expectedImage', found '$twitterImage'")
      }
    }

    if ($expected.Contains('ExpectedManagedImageId')) {
      $expectedImageAssetId = [string]$expected.ExpectedManagedImageId
      $expectedImage = Get-ManagedSocialImageUrl -Manifest $imageManifest -AssetId $expectedImageAssetId
      if ($ogImage -ne $expectedImage) {
        $metadataIssues.Add("$relativePath => expected managed og:image '$expectedImage', found '$ogImage'")
      }
      if ($twitterImage -ne $expectedImage) {
        $metadataIssues.Add("$relativePath => expected managed twitter:image '$expectedImage', found '$twitterImage'")
      }
    }

    if ($expected.Contains('ExpectedImageAlt')) {
      $expectedImageAlt = [string]$expected.ExpectedImageAlt
      $ogImageAlt = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:image:alt'
      $twitterImageAlt = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:image:alt'
      if ($ogImageAlt -ne $expectedImageAlt) {
        $metadataIssues.Add("$relativePath => expected og:image:alt '$expectedImageAlt', found '$ogImageAlt'")
      }
      if ($twitterImageAlt -ne $expectedImageAlt) {
        $metadataIssues.Add("$relativePath => expected twitter:image:alt '$expectedImageAlt', found '$twitterImageAlt'")
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
    '(?is)<figure\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-hero\b[^"]*"|''[^'']*\bpiece-hero\b[^'']*''|[^\s>]*\bpiece-hero\b[^\s>]*)[^>]*>.*?<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|''([^'']+)''|([^\s>]+))'
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

    $isManagedFeaturedImage = $imageManifest.assets.ContainsKey($featuredImage)
    $expectedHeroPath = if ($isManagedFeaturedImage) {
      Get-ManagedVisibleImagePath -Manifest $imageManifest -AssetId $featuredImage
    }
    else {
      $featuredImage
    }
    $expectedHeroUrl = ConvertTo-CanonicalImageUrl -Value $expectedHeroPath
    $actualHeroUrl = ConvertTo-CanonicalImageUrl -Value $heroSrc

    if ($actualHeroUrl -ne $expectedHeroUrl) {
      $metadataIssues.Add("$relativePath => expected visible hero '$expectedHeroUrl', found '$actualHeroUrl'")
    }

    $expectedSocialImage = if ($isManagedFeaturedImage) {
      Get-ManagedSocialImageUrl -Manifest $imageManifest -AssetId $featuredImage
    }
    else {
      ConvertTo-CanonicalImageUrl -Value $featuredImage
    }
    $ogImage = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:image'
    if ($ogImage -ne $expectedSocialImage) {
      $metadataIssues.Add("$relativePath => expected hero social JPEG or canonical fallback '$expectedSocialImage', found og:image '$ogImage'")
    }

    $twitterImage = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:image'
    if ($twitterImage -ne $expectedSocialImage) {
      $metadataIssues.Add("$relativePath => expected hero social JPEG or canonical fallback '$expectedSocialImage', found twitter:image '$twitterImage'")
    }

    if ([bool]$check.ExpectHeroAbsentFromBody) {
      $bodyMatch = [regex]::Match(
        $html,
        '(?is)<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-body\b[^"]*"|''[^'']*\bpiece-body\b[^'']*''|[^\s>]*\bpiece-body\b[^\s>]*)[^>]*>(.*?)</div>\s*<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-aftermatter\b[^"]*"|''[^'']*\bpiece-aftermatter\b[^'']*''|[^\s>]*\bpiece-aftermatter\b[^\s>]*)'
      )
      if (-not $bodyMatch.Success) {
        $metadataIssues.Add("$relativePath => expected a piece-body region for hero-deduplication coverage")
      }
      else {
        $pieceBodyHtml = $bodyMatch.Groups[1].Value
        $bodyRepeatsHero = if ($isManagedFeaturedImage) {
          @(
            Get-OpenTags -Html $pieceBodyHtml -TagName 'img' |
              Where-Object { (Get-AttributeValue -Tag $_ -Name 'data-oip-image-id') -ceq $featuredImage }
          ).Count -gt 0
        }
        else {
          $pieceBodyHtml -match [regex]::Escape($heroSrc)
        }
        if ($bodyRepeatsHero) {
          $metadataIssues.Add("$relativePath => expected the promoted or deduped hero image not to repeat inside the article body")
        }

        $forbiddenBodyText = [string](Get-ExpectedEntryValue -Entry $check -Key 'ForbiddenBodyText' -Default '')
        if (-not [string]::IsNullOrWhiteSpace($forbiddenBodyText) -and ($pieceBodyHtml -match [regex]::Escape($forbiddenBodyText))) {
          $metadataIssues.Add("$relativePath => expected the duplicated hero caption text not to repeat inside the article body")
        }
      }
    }
  }
  else {
    if ($heroMatch.Success) {
      $metadataIssues.Add("$relativePath => expected essays without a promoted hero candidate to omit the visible piece hero")
    }
  }
}

$jackStrattonPath = 'public/essays/jack-stratton-and-the-vulfpeck-model/index.html'
if (-not $targetPageHtml.ContainsKey($jackStrattonPath)) {
  $metadataIssues.Add("Missing generated page required for Jack Stratton visual-sequence coverage: $jackStrattonPath")
}
else {
  $jackStrattonHtml = [string]$targetPageHtml[$jackStrattonPath]
  $jackStrattonBodyMatch = [regex]::Match(
    $jackStrattonHtml,
    '(?is)<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-body\b[^"]*"|''[^'']*\bpiece-body\b[^'']*''|[^\s>]*\bpiece-body\b[^\s>]*)[^>]*>(.*?)</div>\s*<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-aftermatter\b[^"]*"|''[^'']*\bpiece-aftermatter\b[^'']*''|[^\s>]*\bpiece-aftermatter\b[^\s>]*)'
  )

  if (-not $jackStrattonBodyMatch.Success) {
    $metadataIssues.Add("$jackStrattonPath => expected a piece-body region for restored visual-sequence coverage")
  }
  else {
    $jackStrattonBodyHtml = $jackStrattonBodyMatch.Groups[1].Value
    $expectedJackStrattonImages = @(
      '/images/medium/jack-stratton-and-the-vulfpeck-model/2c3762584e6a4b03acaf71a5ca668741cc0c78e9cd714f4238aef65d56c37c7b.jpeg',
      '/images/medium/jack-stratton-and-the-vulfpeck-model/3a73bf5eef98b4652561ecd257f3a7a2a22726d60f3a5d8f6d30549cfe507aa2.jpeg',
      '/images/medium/jack-stratton-and-the-vulfpeck-model/552e548f82e4a9edd9b3ab53f9354751fecc3c03c5f74518fb15a8d45af58242.jpeg',
      '/images/medium/jack-stratton-and-the-vulfpeck-model/f36a6e470efd2fd38b93abfd2d8056a951f956e6f1f61d698ce43edc4f73d4f6.jpeg',
      '/images/medium/jack-stratton-and-the-vulfpeck-model/4e545f452e9f1601fc923051b9bcfa772947549b4592a059c8e598d3259d050c.jpeg',
      '/images/medium/jack-stratton-and-the-vulfpeck-model/e4ba5e54a975b44557c9a40bf259fa87c4bd6c5ee0f0ea2d99486d083acc3ea5.jpeg',
      '/images/article-media/jack-stratton-and-the-vulfpeck-model/97337aed41250cd4d04217fb2cb2485dea733d71fecbae5684362779c6bf1d12.jpg',
      '/images/article-media/jack-stratton-and-the-vulfpeck-model/3eebf467f71ac2479bf14032516dedf69768b753f762f4e0bc24cac9689b74ad.jpeg',
      '/images/article-media/jack-stratton-and-the-vulfpeck-model/9064a56cc18deb31888bcf508a36ea371b034c27c6c8e3b9cca7f63c46028d71.jpeg',
      '/images/article-media/jack-stratton-and-the-vulfpeck-model/950149cea33f580c4a00ce8a602f6b3248b1fc61121c0ea5940038a4d293ca69.jpeg',
      '/images/article-media/jack-stratton-and-the-vulfpeck-model/c120d4582d9ed24545009806966a4df4ec01d1dcc2d725d2fc1d19b4d847af50.jpeg',
      '/images/article-media/jack-stratton-and-the-vulfpeck-model/18ff47191c4b5d441d9ab279a7e997f5c6150c85143fc857194f40e9c858a14d.jpeg'
    )
    $jackStrattonImageTags = @(Get-OpenTags -Html $jackStrattonBodyHtml -TagName 'img')

    if ($jackStrattonImageTags.Count -ne $expectedJackStrattonImages.Count) {
      $metadataIssues.Add("$jackStrattonPath => expected exactly 12 restored body images, found $($jackStrattonImageTags.Count)")
    }

    for ($imageIndex = 0; $imageIndex -lt [Math]::Min($jackStrattonImageTags.Count, $expectedJackStrattonImages.Count); $imageIndex++) {
      $imageTag = $jackStrattonImageTags[$imageIndex]
      $imagePath = Get-SitePathFromHref -Href (Get-AttributeValue -Tag $imageTag -Name 'src')
      if ($imagePath -cne $expectedJackStrattonImages[$imageIndex]) {
        $metadataIssues.Add("$jackStrattonPath => restored image $($imageIndex + 1) expected '$($expectedJackStrattonImages[$imageIndex])', found '$imagePath'")
      }

      $alt = Get-AttributeValue -Tag $imageTag -Name 'alt'
      if ([string]::IsNullOrWhiteSpace($alt)) {
        $metadataIssues.Add("$jackStrattonPath => restored image $($imageIndex + 1) requires nonempty alt text")
      }
      if ((Get-AttributeValue -Tag $imageTag -Name 'loading') -cne 'lazy') {
        $metadataIssues.Add("$jackStrattonPath => restored image $($imageIndex + 1) must use lazy loading")
      }
      if ((Get-AttributeValue -Tag $imageTag -Name 'decoding') -cne 'async') {
        $metadataIssues.Add("$jackStrattonPath => restored image $($imageIndex + 1) must use async decoding")
      }

      $imageWidth = 0
      $imageHeight = 0
      if (-not [int]::TryParse((Get-AttributeValue -Tag $imageTag -Name 'width'), [ref]$imageWidth) -or $imageWidth -le 0) {
        $metadataIssues.Add("$jackStrattonPath => restored image $($imageIndex + 1) requires a positive width")
      }
      if (-not [int]::TryParse((Get-AttributeValue -Tag $imageTag -Name 'height'), [ref]$imageHeight) -or $imageHeight -le 0) {
        $metadataIssues.Add("$jackStrattonPath => restored image $($imageIndex + 1) requires a positive height")
      }
    }

    $concertPosterPath = $expectedJackStrattonImages[6]
    $concertPosterFigure = [regex]::Match(
      $jackStrattonBodyHtml,
      '(?is)<figure\b[^>]*>.*?' + [regex]::Escape($concertPosterPath) + '.*?</figure>'
    )
    $concertWatchUrl = 'https://www.youtube.com/watch?v=8bLinctYcno'
    $concertWatchLinks = @()
    if ($concertPosterFigure.Success) {
      $concertWatchLinks = @(
        Get-OpenTags -Html $concertPosterFigure.Value -TagName 'a' |
          Where-Object { (Get-AttributeValue -Tag $_ -Name 'href') -ceq $concertWatchUrl }
      )
    }
    if ($concertWatchLinks.Count -ne 1) {
      $metadataIssues.Add("$jackStrattonPath => expected the localized concert-film poster caption to link once to '$concertWatchUrl'")
    }

    if ($jackStrattonBodyHtml -match '!\[' -or $jackStrattonBodyHtml -match 'Embedded media') {
      $metadataIssues.Add("$jackStrattonPath => literal Markdown or the retired embedded-media fallback remains in the restored article body")
    }
    if ($jackStrattonBodyHtml -match 'cdn-images-1\.medium\.com|miro\.medium\.com') {
      $metadataIssues.Add("$jackStrattonPath => remote Medium image dependencies remain in the restored article body")
    }
  }
}

$campMysticPath = 'public/essays/what-happened-at-camp-mystic/index.html'
if (-not $targetPageHtml.ContainsKey($campMysticPath)) {
  $metadataIssues.Add("Missing generated page required for Camp Mystic timeline and visual-sequence coverage: $campMysticPath")
}
else {
  $campMysticHtml = [string]$targetPageHtml[$campMysticPath]
  $campMysticBodyMatch = [regex]::Match(
    $campMysticHtml,
    '(?is)<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-body\b[^"]*"|''[^'']*\bpiece-body\b[^'']*''|[^\s>]*\bpiece-body\b[^\s>]*)[^>]*>(.*?)</div>\s*<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-aftermatter\b[^"]*"|''[^'']*\bpiece-aftermatter\b[^'']*''|[^\s>]*\bpiece-aftermatter\b[^\s>]*)'
  )

  if (-not $campMysticBodyMatch.Success) {
    $metadataIssues.Add("$campMysticPath => expected a piece-body region for timeline and restored visual-sequence coverage")
  }
  else {
    $campMysticBodyHtml = $campMysticBodyMatch.Groups[1].Value
    $campMysticTimelineMatches = @(
      [regex]::Matches(
        $campMysticBodyHtml,
        '(?is)<(?<tag>[a-z][a-z0-9:-]*)\b(?=[^>]*\bclass\s*=\s*(?:"[^"]*\barticle-timeline\b[^"]*"|''[^'']*\barticle-timeline\b[^'']*''|[^\s>]*\barticle-timeline\b[^\s>]*))[^>]*>(?<body>.*?)</\k<tag>>'
      )
    )

    if ($campMysticTimelineMatches.Count -ne 1) {
      $metadataIssues.Add("$campMysticPath => expected exactly one article-timeline, found $($campMysticTimelineMatches.Count)")
    }
    else {
      $campMysticTimelineHtml = $campMysticTimelineMatches[0].Groups['body'].Value
      $campMysticTimelineTagName = $campMysticTimelineMatches[0].Groups['tag'].Value
      $campMysticTimelineListBody = $null
      if ($campMysticTimelineTagName -ieq 'ol') {
        $campMysticTimelineListBody = $campMysticTimelineHtml
      }
      else {
        $campMysticTimelineLists = @([regex]::Matches($campMysticTimelineHtml, '(?is)<ol\b[^>]*>(?<body>.*?)</ol>'))
        if ($campMysticTimelineLists.Count -ne 1) {
          $metadataIssues.Add("$campMysticPath => expected the article-timeline to contain exactly one ordered list, found $($campMysticTimelineLists.Count)")
        }
        else {
          $campMysticTimelineListBody = $campMysticTimelineLists[0].Groups['body'].Value
        }
      }

      if ($null -ne $campMysticTimelineListBody) {
        $campMysticTimelineItems = @([regex]::Matches($campMysticTimelineListBody, '(?is)<li\b[^>]*>(.*?)</li>'))
        $expectedCampMysticTimes = @(
          '1:14 a.m.',
          '1:20 a.m.',
          '1:51 to 2:01 a.m.',
          '2:20 to 2:30 a.m.',
          'around 3:00 a.m.',
          '3:23 a.m.'
        )

        if ($campMysticTimelineItems.Count -ne $expectedCampMysticTimes.Count) {
          $metadataIssues.Add("$campMysticPath => expected exactly six ordered timeline items, found $($campMysticTimelineItems.Count)")
        }

        for ($timelineIndex = 0; $timelineIndex -lt [Math]::Min($campMysticTimelineItems.Count, $expectedCampMysticTimes.Count); $timelineIndex++) {
          $timelineItemText = [regex]::Replace(
            (Convert-HtmlFragmentToText -Html $campMysticTimelineItems[$timelineIndex].Groups[1].Value),
            '\s+',
            ' '
          )
          $expectedTime = $expectedCampMysticTimes[$timelineIndex]
          if (-not $timelineItemText.Contains($expectedTime, [System.StringComparison]::OrdinalIgnoreCase)) {
            $metadataIssues.Add("$campMysticPath => timeline item $($timelineIndex + 1) expected visible time '$expectedTime', found '$timelineItemText'")
          }
        }
      }
    }

    $expectedCampMysticImageIds = @(
      'medium/a920fa69779c6bdb1900f3bb4221da3835781decd2517f6d5449ec61eaaef7d3',
      'medium/41eed8f56249fdadda5c9bf6714146ebac1841b1a5f956a41c8369f729333c1f',
      'medium/7c4bad63f769d3b86b88aed8b2e32ee2596d415762d2505dec77aa7e9b03da49'
    )
    $campMysticManagedImageTags = @(
      Get-OpenTags -Html $campMysticBodyHtml -TagName 'img' |
        Where-Object { $expectedCampMysticImageIds -ccontains (Get-AttributeValue -Tag $_ -Name 'data-oip-image-id') }
    )

    if ($campMysticManagedImageTags.Count -ne $expectedCampMysticImageIds.Count) {
      $metadataIssues.Add("$campMysticPath => expected each of the three restored managed body images exactly once, found $($campMysticManagedImageTags.Count) matching occurrences")
    }

    for ($imageIndex = 0; $imageIndex -lt [Math]::Min($campMysticManagedImageTags.Count, $expectedCampMysticImageIds.Count); $imageIndex++) {
      $imageTag = $campMysticManagedImageTags[$imageIndex]
      $imageId = Get-AttributeValue -Tag $imageTag -Name 'data-oip-image-id'
      if ($imageId -cne $expectedCampMysticImageIds[$imageIndex]) {
        $metadataIssues.Add("$campMysticPath => restored managed image $($imageIndex + 1) expected '$($expectedCampMysticImageIds[$imageIndex])', found '$imageId'")
      }

      $alt = [System.Net.WebUtility]::HtmlDecode((Get-AttributeValue -Tag $imageTag -Name 'alt'))
      if ([string]::IsNullOrWhiteSpace($alt)) {
        $metadataIssues.Add("$campMysticPath => restored managed image $($imageIndex + 1) requires nonempty alt text")
      }
      if ((Get-AttributeValue -Tag $imageTag -Name 'loading') -cne 'lazy') {
        $metadataIssues.Add("$campMysticPath => restored managed image $($imageIndex + 1) must use lazy loading")
      }
      if ((Get-AttributeValue -Tag $imageTag -Name 'decoding') -cne 'async') {
        $metadataIssues.Add("$campMysticPath => restored managed image $($imageIndex + 1) must use async decoding")
      }

      $imageWidth = 0
      $imageHeight = 0
      if (-not [int]::TryParse((Get-AttributeValue -Tag $imageTag -Name 'width'), [ref]$imageWidth) -or $imageWidth -le 0) {
        $metadataIssues.Add("$campMysticPath => restored managed image $($imageIndex + 1) requires a positive width")
      }
      if (-not [int]::TryParse((Get-AttributeValue -Tag $imageTag -Name 'height'), [ref]$imageHeight) -or $imageHeight -le 0) {
        $metadataIssues.Add("$campMysticPath => restored managed image $($imageIndex + 1) requires a positive height")
      }
    }

    if ($campMysticBodyHtml -match '!\[') {
      $metadataIssues.Add("$campMysticPath => literal Markdown remains in the revised article body")
    }
    if ($campMysticBodyHtml -match 'cdn-images-\d+\.medium\.com|miro\.medium\.com') {
      $metadataIssues.Add("$campMysticPath => remote Medium image dependencies remain in the revised article body")
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
    'Sitemap: https://outsideinprint.org/sitemap.xml'
  )) {
    if ($robotsTxt -notmatch [regex]::Escape($requiredLine)) {
      $indexationIssues.Add("robots.txt => expected line '$requiredLine'")
    }
  }

  foreach ($allowedAgent in @('GPTBot', 'ClaudeBot', 'Google-Extended')) {
    $allowPattern = "(?m)User-agent:\s+$([regex]::Escape($allowedAgent))\s*\r?\nAllow:\s+/"
    if ($robotsTxt -notmatch $allowPattern) {
      $indexationIssues.Add("robots.txt => expected $allowedAgent to be allowed")
    }

    $disallowPattern = "(?m)User-agent:\s+$([regex]::Escape($allowedAgent))\s*\r?\nDisallow:\s+/"
    if ($robotsTxt -match $disallowPattern) {
      $indexationIssues.Add("robots.txt => expected $allowedAgent not to be disallowed")
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

$studioHomepageOrderPattern = if ($studioEnabled) {
  '(?s)data-home-front-page-region=(?:"lead"|lead).*?home-studio-offer.*?home-bookstore.*?home-manifesto.*?entry-threads--home.*?newsletter-signup--home-ribbon.*?home-browse'
}
else {
  '(?s)data-home-front-page-region=(?:"lead"|lead).*?home-bookstore.*?home-manifesto.*?entry-threads--home.*?newsletter-signup--home-ribbon.*?home-browse'
}
$studioHomepageOrderMessage = if ($studioEnabled) {
  'expected the homepage to place Studio after the story grid and before the bookstore, manifesto, and lower-page signoff'
}
else {
  'expected disabled Studio configuration to preserve the homepage story, bookstore, manifesto, and lower-page order'
}
$studioHomepageModulePattern = if ($studioEnabled) {
  '(?s)<section[^>]*class=(?:"[^"]*\bhome-studio-offer\b[^"]*"|''[^'']*\bhome-studio-offer\b[^'']*''|[^>]*\bhome-studio-offer\b[^>]*)[^>]*>.*?You have the material\. We make it publishable\..*?' + [regex]::Escape($studioActiveRateLabel) + '.*?' + [regex]::Escape($studioActivePrice) + '.*?href=(?:"/studio/"|/studio/)[^>]*data-analytics-source-slot=(?:"homepage_studio_offer"|homepage_studio_offer)[^>]*>.*?Start a Publication Sprint.*?</section>'
}
else {
  '\bhome-studio-offer\b'
}
$studioHomepageModuleMessage = if ($studioEnabled) {
  'expected the homepage Studio module to expose the approved promise, active rate, CTA, and analytics slot'
}
else {
  'expected disabled Studio configuration to omit the homepage Studio module'
}

$requiredUxChecks = @(
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<h1[^>]*class=(?:"[^"]*\btitle\b[^"]*"|''[^'']*\btitle\b[^'']*''|[^>]*\btitle\b[^>]*)[^>]*>\s*Outside In Print\s*</h1>'
    Message = 'expected the homepage to expose a semantic h1 for the site title'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<h1[^>]*>\s*Outside In Print\s*</h1>.*?<section[^>]*class=(?:"[^"]*\bhome-front-page__stories\b[^"]*"|''[^'']*\bhome-front-page__stories\b[^'']*''|[^>]*\bhome-front-page__stories\b[^>]*)[^>]*aria-labelledby=(?:"home-front-page-stories-title"|home-front-page-stories-title)[^>]*>\s*<h2[^>]*id=(?:"home-front-page-stories-title"|home-front-page-stories-title)[^>]*class=(?:"[^"]*\bvisually-hidden\b[^"]*"|''[^'']*\bvisually-hidden\b[^'']*''|[^>]*\bvisually-hidden\b[^>]*)[^>]*>\s*Front page stories\s*</h2>.*?<h3[^>]*class=(?:"[^"]*\bhome-front-page__lead-title\b[^"]*"|''[^'']*\bhome-front-page__lead-title\b[^'']*''|[^>]*\bhome-front-page__lead-title\b[^>]*)'
    Message = 'expected the homepage story area to expose a visually hidden h2 before its story h3 headings'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<h1[^>]*>\s*Outside In Print\s*</h1>.*?<p[^>]*class=(?:"[^"]*\bhome-front-page__orientation\b[^"]*"|''[^'']*\bhome-front-page__orientation\b[^'']*''|[^>]*\bhome-front-page__orientation\b[^>]*)[^>]*>\s*Independent essays, selected writings, and original books by Robert V\. Ussley\s*</p>.*?home-front-page__stories'
    Message = 'expected the homepage orientation line to appear before the story grid'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<p[^>]*class=(?:"[^"]*\blist-title\b[^"]*"|''[^'']*\blist-title\b[^'']*''|[^>]*\blist-title\b[^>]*)[^>]*>\s*Front Page\s*</p>'
    Message = 'expected the homepage not to retain the retired visible Front Page label block'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = $studioHomepageOrderPattern
    Message = $studioHomepageOrderMessage
  },
  @{
    Path = 'public/index.html'
    Pattern = $studioHomepageModulePattern
    Message = $studioHomepageModuleMessage
    ShouldNotMatch = -not $studioEnabled
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<section[^>]*class=(?:"[^"]*\bhome-bookstore\b[^"]*"|''[^'']*\bhome-bookstore\b[^'']*''|[^>]*\bhome-bookstore\b[^>]*)[^>]*>.*?Books from Outside In Print.*?The Bookstore.*?Three Outside In Print EPUB editions at \$9\.99 each, prepared for secure digital delivery\..*?Browse the bookstore.*?american-nightmare-cover-v1\.6\.jpg.*?Robert V\. Ussley.*?The American Nightmare.*?Outside In Print EPUB.*?\$9\.99.*?parable-of-the-sheep-cover-v1\.0\.jpg.*?Robert V\. Ussley.*?The Parable of the Sheep.*?Outside In Print EPUB.*?\$9\.99.*?the-water-cycle-cover-v2\.0\.jpg.*?Robert V\. Ussley.*?The Water Cycle.*?Outside In Print EPUB.*?\$9\.99.*?</section>'
    Message = 'expected the homepage bookstore shelf to present three $9.99 Outside In Print EPUB records with the canonical author and publisher data'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?is)<section[^>]*class=(?:"[^"]*\bhome-bookstore\b[^"]*"|''[^'']*\bhome-bookstore\b[^'']*''|[^>]*\bhome-bookstore\b[^>]*)[^>]*>.*?(?:\bshop-cta\b|carousel|autoplay|direct bundle|stripe).*?</section>'
    Message = 'expected the homepage bookstore shelf to remain internal-first and free of direct-buy, carousel, and stale checkout presentation'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?i)(?:https?://(?:www\.)?amazon\.com/|Kindle on Amazon|View on Amazon Kindle|\bdata-bookstore-kindle-button\b|\bbookstore-kindle-button\b)'
    Message = 'expected the homepage to contain no Amazon URL or Kindle purchase CTA'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)home-bookstore.*?data-analytics-source-slot=(?:"homepage_bookstore_promo"|homepage_bookstore_promo).*?Browse the bookstore.*?/shop/the-american-nightmare-keep-dreaming-kid/.*?/shop/the-parable-of-the-sheep/.*?/shop/the-water-cycle/'
    Message = 'expected homepage bookstore links to use the shared promotion source slot and internal OIP routes'
  },
  @{
    Path = 'public/index.html'
    Pattern = '"significantLink":\[[^\]]*"https://outsideinprint\.org/shop/"'
    Message = 'expected homepage structured data to include the bookstore as a significant link'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'Start Reading'
    Message = 'expected the homepage not to render the retired curated Start Reading module label'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'Check out the collections below\.'
    Message = 'expected the homepage not to render the retired collection helper sentence'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'Browse the Archive|Use Archive, Gallery, Collections, or Library when you want to move beyond the front page\.'
    Message = 'expected the homepage not to render the retired archive navigation heading or helper copy'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<section[^>]*class=(?:"[^"]*\bhome-browse\b[^"]*"|''[^'']*\bhome-browse\b[^'']*''|[^>]*\bhome-browse\b[^>]*)[^>]*>.*?Essays.*?Gallery.*?Collections.*?Library.*?</section>'
    Message = 'expected the homepage browse band to render the curated route set in editorial order'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<section[^>]*class=(?:"[^"]*\bhome-browse\b[^"]*"|''[^'']*\bhome-browse\b[^'']*''|[^>]*\bhome-browse\b[^>]*)[^>]*>.*?home-browse__item-title>(?:Welcome|Dialogues|Feeling curious\?)<.*?</section>'
    Message = 'expected the homepage browse band to omit retired Welcome, Dialogues, and Feeling curious? browse items'
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
    Pattern = 'data-home-cartoon-recent'
    Message = 'expected the homepage generated output to include the recent editorial cartoon grid'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-home-cartoon-recent-trigger'
    Message = 'expected homepage recent cartoon cards to open the shared fullscreen lightbox'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)editorial-cartoon.*?View gallery'
    Message = 'expected the homepage editorial cartoon block to link to the gallery'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-home-cartoon-lightbox'
    Message = 'expected the homepage to include the fullscreen cartoon lightbox'
  },
  @{
    Path = 'public/index.html'
    Pattern = '<p id=(?:"home-cartoon-lightbox-title"|home-cartoon-lightbox-title) class=(?:"cartoon-lightbox__title"|cartoon-lightbox__title) data-home-cartoon-lightbox-title(?:="")?></p>'
    Message = 'expected the homepage lightbox to use a non-heading dialog label'
  },
  @{
    Path = 'public/index.html'
    Pattern = '<h2 id=(?:"home-cartoon-lightbox-title"|home-cartoon-lightbox-title)'
    Message = 'expected the homepage lightbox not to emit an empty heading'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-home-cartoon-lightbox-trigger'
    Message = 'expected the homepage cartoon image to open the fullscreen lightbox'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-home-cartoon-lightbox-essay'
    Message = 'expected the homepage fullscreen cartoon lightbox to expose a Read essay link'
  },
  @{
    Path = 'public/index.html'
    Pattern = $currentCartoonEssayPattern
    Message = 'expected the homepage cartoon trigger to carry the associated essay path'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)data-home-cartoon-lightbox.*?data-home-cartoon-lightbox-image-button.*?addEventListener\("click",[A-Za-z_$][A-Za-z0-9_$]*\)'
    Message = 'expected a second click on the fullscreen homepage cartoon image to close the lightbox'
  },

  @{
    Path = 'public/index.html'
    Pattern = 'essay-cartoon-thumb'
    Message = 'expected linked homepage essay cards to expose cartoon thumbnail links'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-essay-cartoon-lightbox'
    Message = 'expected essay cartoon thumbnails to mount the shared fullscreen lightbox'
  },
  @{
    Path = 'public/index.html'
    Pattern = '<p id=(?:"essay-cartoon-lightbox-title"|essay-cartoon-lightbox-title) class=(?:"cartoon-lightbox__title"|cartoon-lightbox__title) data-essay-cartoon-lightbox-title(?:="")?></p>'
    Message = 'expected the shared essay cartoon lightbox to use a non-heading dialog label'
  },
  @{
    Path = 'public/index.html'
    Pattern = '<h2 id=(?:"essay-cartoon-lightbox-title"|essay-cartoon-lightbox-title)'
    Message = 'expected the shared essay cartoon lightbox not to emit an empty heading'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-essay-cartoon-lightbox-trigger'
    Message = 'expected essay cartoon thumbnails to open in-page fullscreen instead of navigating directly'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)data-essay-cartoon-lightbox-gallery.*?View in gallery'
    Message = 'expected the essay cartoon fullscreen lightbox to expose a View in gallery action'
  },

  @{
    Path = 'public/index.html'
    Pattern = '(?s)data-analytics-source-slot="?homepage_selected_core"?.*?\bessay-cartoon-thumb--home\b.*?data-essay-cartoon-lightbox-trigger.*?data-cartoon-slug="?[^"\s>]+"?.*?data-gallery="?https://outsideinprint\.org/gallery/\?cartoon=[^"\s>]+"?'
    Message = 'expected a homepage essay-card cartoon thumbnail to open the matching gallery-backed lightbox'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'A curated front page from Outside In Print, with selected collections, recent work, and archive paths below\.'
    Message = 'expected the homepage not to retain the retired front-page intro blurb'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'Ask for the evidence\. Read past the headlines\. Think for yourself\.'
    Message = 'expected the homepage to carry the typeset manifesto motto above selected collections'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'A digital imprint of essays, reports, dialogues, and literature\.|Color over the lines\. Read beyond the feed\. Think for yourself\.'
    Message = 'expected the homepage not to carry the retired imprint and manifesto copy'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)newsletter-signup--home-ribbon.*?Every Saturday.*?Bob(?:''|&#39;)s Almanack.*?Each Saturday(?:''|&#39;)s issue usually brings four new essays or notes with cartoons, a weekly virtue, one number, one public document, results, records, final bows, obituaries, and one piece worth reprinting\..*?Subscribe free.*?Bob(?:''|&#39;)s Almanack will remain free\. No ads, ever\..*?(?:https://outsideinprint\.org)?/almanack/2026-07-25/[^>]*>\s*Read a sample issue\s*<.*?(?:https://outsideinprint\.org)?/privacy/[^>]*>\s*Privacy details\s*<.*?Your email goes to Buttondown to deliver and manage Bob(?:''|&#39;)s Almanack\. Outside In Print does not sell or rent subscriber information\. Unsubscribe anytime\.'
    Message = 'expected the homepage Bob''s Almanack ribbon to state the canonical cadence, contents, permanent-free promise, sample, and privacy promise'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-analytics-source-slot="?homepage_bobs_almanack_offer"?'
    Message = 'expected the homepage signup form to preserve the Bob''s Almanack analytics source slot'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)home-front-page__lead-action.*?newsletter-prompt--home.*?href=(?:"|'''')?#bobs-almanack-signup(?:"|'''')?.*?data-analytics-source-slot=(?:"|'''')?homepage_bobs_almanack_prompt(?:"|'''')?.*?Get Bob(?:''|&#39;)s Almanack every Saturday — free, no ads\.'
    Message = 'expected the homepage lead to expose one quiet tracked jump to the full Bob''s Almanack signup'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?is)href=(?:"|'''')?(?:https://outsideinprint\.org)?/almanack/2026-07-25/(?:"|'''')?[^>]*data-analytics-event=(?:"|'''')?internal_promo_click(?:"|'''')?[^>]*data-analytics-source-slot=(?:"|'''')?homepage_bobs_almanack_offer_sample_issue(?:"|'''')?'
    Message = 'expected the homepage sample issue link to use the existing internal-promotion event and derived newsletter source slot'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?is)<section\b(?=[^>]*newsletter-signup--home-ribbon)[^>]*>.*?(?:Limited time|launch window|No spam|Easy to leave).*?</section>'
    Message = 'expected the homepage newsletter proposition to omit retired temporary and vague trust copy'
    ShouldNotMatch = $true
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
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?(?:https://outsideinprint\.org)?/archive/[^>]*>\s*<span[^>]*>\s*Archive\s*</span>'
    Message = 'expected the homepage masthead to expose the Archive label'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*data-primary-nav[^>]*>.*?class=(?:"nav__desktop"|nav__desktop).*?class=(?:"nav-disclosure[^>]*"|nav-disclosure[^\s>]*).*?<span>Read</span>.*?class=(?:"nav-disclosure[^>]*"|nav-disclosure[^\s>]*).*?<span>Explore</span>.*?(?:https://outsideinprint\.org)?/studio/[^>]*data-analytics-source-slot=(?:"primary_nav_studio"|primary_nav_studio)[^>]*>\s*<span[^>]*>Studio</span>.*?(?:https://outsideinprint\.org)?/shop/[^>]*data-analytics-source-slot=(?:"primary_nav_bookstore"|primary_nav_bookstore)[^>]*>\s*<span[^>]*>Bookstore</span>.*?(?:https://outsideinprint\.org)?/about/[^>]*>\s*<span[^>]*>About</span>.*?(?:https://outsideinprint\.org)?/support/[^>]*data-analytics-source-slot=(?:"primary_nav_support"|primary_nav_support)[^>]*>\s*<span[^>]*>Support</span>'
    Message = 'expected the homepage desktop ribbon to expose Read, Explore, Studio, Bookstore, About, and Support in order'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)class=(?:"nav__mobile"|nav__mobile).*?(?:https://outsideinprint\.org)?/archive/[^>]*>\s*<span[^>]*>Archive</span>.*?(?:https://outsideinprint\.org)?/collections/[^>]*>\s*<span[^>]*>Collections</span>.*?(?:https://outsideinprint\.org)?/studio/[^>]*>\s*<span[^>]*>Studio</span>.*?class=(?:"nav-mobile-menu__summary"|nav-mobile-menu__summary)[^>]*>.*?<span>Menu</span>.*?mobile-nav-read-heading.*?<span[^>]*>Latest</span>.*?<span[^>]*>Library</span>.*?<span[^>]*>Feeling curious\?</span>.*?mobile-nav-explore-heading.*?<span[^>]*>Gallery</span>.*?<span[^>]*>Apps & Tools</span>.*?<span[^>]*>Games</span>.*?mobile-nav-imprint-heading.*?<span[^>]*>Bookstore</span>.*?<span[^>]*>About</span>.*?<span[^>]*>Support</span>'
    Message = 'expected the homepage mobile ribbon and Menu to expose the approved responsive hierarchy'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?(?:https://outsideinprint\.org)?/literature/'
    Message = 'expected the homepage masthead not to expose the retired literature section'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-launch'
    Message = 'expected the homepage masthead to expose the Paper-Bob launcher button'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-overlay'
    Message = 'expected the homepage to include the Paper-Bob dialog shell'
  },
  @{
    Path = 'public/index.html'
    Pattern = '<h2[^>]*id=(?:"paper-route-title"|paper-route-title)[^>]*>\s*Paper-Bob\s*</h2>'
    Message = 'expected the homepage arcade dialog title to use the Paper-Bob name'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-phaser-src=(?:"[^"]*phaser-3\.90\.0-arcade-physics[^"]*"|[^\s>]*phaser-3\.90\.0-arcade-physics[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the pinned same-origin Phaser asset URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-rules-src=(?:"[^"]*paper-route-rules[^"]*"|[^\s>]*paper-route-rules[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded rules URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-plan-src=(?:"[^"]*paper-route-plan[^"]*"|[^\s>]*paper-route-plan[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell not to expose the removed route planner URL'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-bob-src=(?:"[^"]*paper-bob-sprite[^"]*"|[^\s>]*paper-bob-sprite[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded Paper-Bob sprite URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-bob-sheet-webp-src=(?:"[^"]*paper-bob-sprite-sheet[^"]*\.webp[^"]*"|[^\s>]*paper-bob-sprite-sheet[^\s>]*\.webp[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded Paper-Bob WebP sprite sheet URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-paper-webp-src=(?:"[^"]*paper-projectile-default[^"]*\.webp[^"]*"|[^\s>]*paper-projectile-default[^\s>]*\.webp[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded WebP paper projectile URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-props-atlas-src=(?:"[^"]*paper-route-props-atlas[^"]*\.png[^"]*"|[^\s>]*paper-route-props-atlas[^\s>]*\.png[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded route prop atlas PNG URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-props-atlas-webp-src=(?:"[^"]*paper-route-props-atlas[^"]*\.webp[^"]*"|[^\s>]*paper-route-props-atlas[^\s>]*\.webp[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded route prop atlas WebP URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-props-atlas-json-src=(?:"[^"]*paper-route-props-atlas[^"]*\.json[^"]*"|[^\s>]*paper-route-props-atlas[^\s>]*\.json[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded route prop atlas JSON URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-lots-atlas-src=(?:"[^"]*paper-bob-lots-atlas[^"]*\.png[^"]*"|[^\s>]*paper-bob-lots-atlas[^\s>]*\.png[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded property lot atlas PNG URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-lots-atlas-webp-src=(?:"[^"]*paper-bob-lots-atlas[^"]*\.webp[^"]*"|[^\s>]*paper-bob-lots-atlas[^\s>]*\.webp[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded property lot atlas WebP URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-lots-atlas-json-src=(?:"[^"]*paper-bob-lots-atlas[^"]*\.json[^"]*"|[^\s>]*paper-bob-lots-atlas[^\s>]*\.json[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded property lot atlas JSON URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-track-atlas-src=(?:"[^"]*paper-bob-track-atlas[^"]*\.png[^"]*"|[^\s>]*paper-bob-track-atlas[^\s>]*\.png[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded route track atlas PNG URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-track-atlas-webp-src=(?:"[^"]*paper-bob-track-atlas[^"]*\.webp[^"]*"|[^\s>]*paper-bob-track-atlas[^\s>]*\.webp[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded route track atlas WebP URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-track-atlas-json-src=(?:"[^"]*paper-bob-track-atlas[^"]*\.json[^"]*"|[^\s>]*paper-bob-track-atlas[^\s>]*\.json[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded route track atlas JSON URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-intro-atlas-src=(?:"[^"]*paper-bob-intro-atlas[^"]*\.png[^"]*"|[^\s>]*paper-bob-intro-atlas[^\s>]*\.png[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded intro atlas PNG URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-intro-atlas-webp-src=(?:"[^"]*paper-bob-intro-atlas[^"]*\.webp[^"]*"|[^\s>]*paper-bob-intro-atlas[^\s>]*\.webp[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded intro atlas WebP URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'data-paper-route-intro-atlas-json-src=(?:"[^"]*paper-bob-intro-atlas[^"]*\.json[^"]*"|[^\s>]*paper-bob-intro-atlas[^\s>]*\.json[^\s>]*)'
    Message = 'expected the homepage Paper-Bob shell to expose the lazy-loaded intro atlas JSON URL as data only'
  },
  @{
    Path = 'public/index.html'
    Pattern = 'paper-route-launcher'
    Message = 'expected the homepage to include only the small Paper-Bob launcher script on initial load'
  },
  @{
    Path = 'public/index.html'
    Pattern = '<script\b[^>]*src=(?:"[^"]*phaser-3\.90\.0-arcade-physics[^"]*"|[^\s>]*phaser-3\.90\.0-arcade-physics[^\s>]*)'
    Message = 'expected the homepage not to load Phaser before the Paper-Bob launcher is clicked'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '<script\b[^>]*src=(?:"[^"]*paper-route-rules[^"]*"|[^\s>]*paper-route-rules[^\s>]*)'
    Message = 'expected the homepage not to load Paper-Bob rules before the launcher is clicked'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '<script\b[^>]*src=(?:"[^"]*paper-route-plan[^"]*"|[^\s>]*paper-route-plan[^\s>]*)'
    Message = 'expected the homepage not to load Paper-Bob route planner before the launcher is clicked'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '<img\b[^>]*src=(?:"[^"]*paper-bob-sprite[^"]*"|[^\s>]*paper-bob-sprite[^\s>]*)'
    Message = 'expected the homepage not to request the Paper-Bob game sprite before the launcher is clicked'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = 'data-paper-route-|paper-route-launcher|paper-route-rules|paper-bob-sprite|paper-route-props-atlas|paper-bob-lots-atlas|paper-bob-track-atlas|paper-bob-intro-atlas|phaser-3\.90\.0-arcade-physics'
    Message = 'expected the Paper-Bob launcher and runtime URLs to stay off archive pages'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'data-paper-route-|paper-route-launcher|paper-route-rules|paper-bob-sprite|paper-route-props-atlas|paper-bob-lots-atlas|paper-bob-track-atlas|paper-bob-intro-atlas|phaser-3\.90\.0-arcade-physics'
    Message = 'expected the Paper-Bob launcher and runtime URLs to stay off library pages'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/404.html'
    Pattern = 'data-paper-route-|paper-route-launcher|paper-route-rules|paper-bob-sprite|paper-route-props-atlas|paper-bob-lots-atlas|paper-bob-track-atlas|paper-bob-intro-atlas|phaser-3\.90\.0-arcade-physics'
    Message = 'expected the Paper-Bob launcher and runtime URLs to stay off the 404 page'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/404.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*data-primary-nav[^>]*>.*?<span>Read</span>.*?<span>Explore</span>.*?<span[^>]*>Studio</span>.*?<span[^>]*>Bookstore</span>.*?<span[^>]*>About</span>.*?<span[^>]*>Support</span>.*?class=(?:"nav__mobile"|nav__mobile).*?<span[^>]*>Archive</span>.*?<span[^>]*>Collections</span>.*?<span[^>]*>Studio</span>.*?<span>Menu</span>.*?mobile-nav-imprint-heading.*?<span[^>]*>Bookstore</span>'
    Message = 'expected the 404 page to use the same grouped desktop and mobile Primary navigation'
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
    Path = 'public/archive/index.html'
    Pattern = 'journey-links'
    Message = 'expected the archive front not to retain the route-level utility pill row'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = 'page-header--section-centered'
    Message = 'expected the archive landing header block to emit the centered section-header hook'
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?nav-disclosure--read[^>]*nav-disclosure--current.*?(?:https://outsideinprint\.org)?/archive/[^>]*aria-current=(?:"page"|page)[^>]*>\s*<span[^>]*>Archive</span>'
    Message = 'expected Archive to be the exact current destination and Read to be the current desktop group'
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = '\d+\s+published pieces.*?Latest:\s*[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}'
    Message = 'expected the archive landing page to collapse to a compact archive stats line'
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = '(?s)<main\b[^>]*>.*?Essays on economics, risk, culture, technology, and public life from Outside In Print\.'
    Message = 'expected the archive landing page not to render the route-level visible deck copy'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = 'Current Edition|Late Edition|Rolling Archive|By Month|essays-front__lead|essays-front__rail'
    Message = 'expected the archive landing page not to retain the retired front-page-style edition structure'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = 'essays-front__year-nav'
    Message = 'expected the archive landing page to render the inline year-jump archive navigation'
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = 'class=(?:"[^"]*\beditorial-cartoon\b[^"]*"|''[^'']*\beditorial-cartoon\b[^'']*''|[^>]*\beditorial-cartoon\b)'
    Message = 'expected the archive landing page not to reuse the homepage editorial cartoon block'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = 'essays-front__cartoon|View gallery'
    Message = 'expected the archive landing page not to render the retired essays-route cartoon module'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = '(?s)href=(?:"?#archive-month-20\d{2}-(?:0[1-9]|1[0-2])"?).*?>20\d{2}<.*?href=(?:"?#archive-month-20\d{2}-(?:0[1-9]|1[0-2])"?).*?>20\d{2}<'
    Message = 'expected the archive landing page to expose inline year jumps keyed to archive month anchors'
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = '(?s)May 2026.*?April 2026.*?March 2026.*?February 2026.*?January 2026'
    Message = 'expected the archive to group entries by descending month-year bands'
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = '(?s)/essays/hindsight-2026-d4vd-alleged-romantic-homicide/.*?/essays/the-world-is-back-at-the-poker-table/.*?/essays/1929-2029-americas-century-of-humiliation/'
    Message = 'expected the archive landing page to keep the newest stories in descending chronological order'
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = '/syd-and-oliver/without-a-word/'
    Message = 'expected the merged archive to include representative dialogue pieces alongside essays'
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = '>Read PDF<'
    Message = 'expected the archive front to avoid PDF affordances'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = '(?s)<meta\s+name=(?:"robots"|robots)\s+content=(?:"noindex, follow"|noindex,\s*follow).*?<link\s+rel=(?:"canonical"|canonical)\s+href=(?:"https://outsideinprint\.org/archive/"|https://outsideinprint\.org/archive/).*?<meta\s+http-equiv=(?:"refresh"|refresh)\s+content=(?:"0; url=/archive/"|0;\s*url=/archive/).*?window\.location\.replace\("/archive/"\)'
    Message = 'expected /essays/ to be a legacy redirect document targeting /archive/'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = '>Archive<'
    Message = 'expected /essays/ to expose a visible Archive fallback link'
  },
  @{
    Path = 'public/essays/index.html'
    Pattern = 'essays-front__year-nav|Current Edition|Syd and Oliver Dialogues'
    Message = 'expected /essays/ not to render the live archive shell'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/library/index.html'
    Pattern = '(?s)<main\b[^>]*>.*?The full catalog of published work from Outside In Print, searchable by title, type, collection, and version\.'
    Message = 'expected the library page not to render the metadata description in visible header copy'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'The library is the full catalog of the imprint:'
    Message = 'expected the library page not to render the visible catalog stats sentence at the top of the page'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'Search the archive by title, type, collection, or version\.'
    Message = 'expected the library page to render the new utility line under the title'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'section-front section-front--library'
    Message = 'expected the library page to wrap its header and controls in the shared top-zone shell'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'Dialogues and fiction from the recurring world of Syd and Oliver'
    Message = 'expected the library page to surface lane descriptions from section metadata'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'page-header--section-centered'
    Message = 'expected the library landing header block to emit the centered section-header hook'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'Search titles, types, collections, and versions'
    Message = 'expected the library page search placeholder to reflect type-based grouping'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = '(?s)<label[^>]*for=(?:"library-type"|library-type)[^>]*>\s*Type\s*</label>.*?<option(?:\s+value(?:=(?:""|''''|[^\s>]+))?)?>All types</option>'
    Message = 'expected the library page to expose the renamed Type filter control'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = '(?s)id=(?:"library-group-dialogue"|library-group-dialogue).*?/syd-and-oliver/without-a-word/'
    Message = 'expected the library page to group representative dialogue pieces under Dialogues'
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'data-section='
    Message = 'expected the library page to stop rendering section-keyed filter attributes'
    ShouldNotMatch = $true
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
    Pattern = '(?s)<h1[^>]*>\s*Syd and Oliver Dialogues\s*</h1>'
    Message = 'expected the /syd-and-oliver/ route to render the filtered dialogue archive title'
  },
  @{
    Path = 'public/syd-and-oliver/index.html'
    Pattern = 'page-header--section-centered'
    Message = 'expected /syd-and-oliver/ to emit the centered section-header hook'
  },
  @{
    Path = 'public/syd-and-oliver/index.html'
    Pattern = 'Current Edition|essays-front__lead|essays-front__rail|essays-front__cartoon'
    Message = 'expected /syd-and-oliver/ to avoid the retired front-page-style edition structure'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/syd-and-oliver/index.html'
    Pattern = 'essays-front__year-nav'
    Message = 'expected /syd-and-oliver/ to reuse the filtered archive shell with year-jump navigation'
  },
  @{
    Path = 'public/syd-and-oliver/index.html'
    Pattern = '/syd-and-oliver/without-a-word/'
    Message = 'expected /syd-and-oliver/ to list representative dialogue pieces'
  },
  @{
    Path = 'public/syd-and-oliver/index.html'
    Pattern = '/essays/the-risk-management-buffet/'
    Message = 'expected /syd-and-oliver/ not to mix essay-only pieces into the filtered dialogue archive'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/working-papers/index.html'
    Pattern = 'Current Edition|Rolling Archive|essays-front__lead|essays-front__year-nav'
    Message = 'expected /working-papers/ to remain on the shared generic list layout'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/working-papers/index.html'
    Pattern = 'page-header--section-centered'
    Message = 'expected /working-papers/ to emit the centered section-header hook on the shared list layout'
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
    Message = 'expected the random route to present a framed archive-selection status before redirecting'
  },
  @{
    Path = 'public/random/index.html'
    Pattern = '(?s)random-route.*?lpeasy\.github\.io.*?/outsideinprint.*?https://outsideinprint\.org.*?window\.location\.hostname===\w+.*?window\.location\.replace\(\w+\+\w+\+window\.location\.search\+window\.location\.hash\).*?Math\.floor'
    Message = 'expected the random route script to preserve legacy-host canonical redirects before selecting a random piece'
  },
  @{
    Path = 'public/random/index.html'
    Pattern = '(?s)"/library/".*?if\(!\w+\.length\)\{window\.location\.replace\(\w+\);return\}.*?Math\.floor\(Math\.random\(\)\*\w+\.length\).*?window\.location\.replace\(\w+\)'
    Message = 'expected the random route to keep the automatic redirect and library fallback behavior'
  },
  @{
    Path = 'public/random/index.html'
    Pattern = 'data-random-route-choices|data-random-route-refresh|random_choice|Draw again|Three pieces from the archive'
    Message = 'expected the random route not to render the retired three-choice redraw UI'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/library/index.html'
    Pattern = 'journey-links'
    Message = 'expected the library page not to render the retired guided-path block'
    ShouldNotMatch = $true
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
    Path = 'public/apps/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?nav-disclosure--explore[^>]*nav-disclosure--current.*?(?:https://outsideinprint\.org)?/apps/[^>]*aria-current=(?:"page"|page)[^>]*>\s*<span[^>]*>Apps & Tools</span>'
    Message = 'expected Apps & Tools to be the exact current destination and Explore to be the current group'
  },
  @{
    Path = 'public/apps/index.html'
    Pattern = '(?s)aria-label="?Footer"?[^>]*>.*?<a(?=[^>]*href=(?:"/apps/"|/apps/))(?=[^>]*aria-current=(?:"page"|page))[^>]*>\s*Apps (?:&amp;|&) Tools\s*</a>'
    Message = 'expected the Apps footer link to claim the current page only on the Apps landing route'
  },
  @{
    Path = 'public/games/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?nav-disclosure--explore[^>]*nav-disclosure--current.*?(?:https://outsideinprint\.org)?/games/[^>]*aria-current=(?:"page"|page)[^>]*>\s*<span[^>]*>Games</span>'
    Message = 'expected Games to be the exact current destination and Explore to be the current group'
  },
  @{
    Path = 'public/games/index.html'
    Pattern = '(?s)aria-label="?Footer"?[^>]*>.*?<a(?=[^>]*href=(?:"/games/"|/games/))(?=[^>]*aria-current=(?:"page"|page))[^>]*>\s*Games\s*</a>'
    Message = 'expected the Games footer link to claim the current page only on the Games landing route'
  },
  @{
    Path = 'public/contact/index.html'
    Pattern = 'For factual corrections, editorial questions, rights inquiries, or reprint requests, email'
    Message = 'expected Contact to expose the editorial, correction, rights, and reprint channel'
  },
  @{
    Path = 'public/about/index.html'
    Pattern = 'Imprint Record'
    Message = 'expected the about page to expose the imprint-record opening surface'
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
    Path = 'public/about/index.html'
    Pattern = '(?s)Reading Map.*?Home.*?Browse collections.*?Search the library.*?Meet the author'
    Message = 'expected the about page to keep a calm reading map into Home, Collections, Library, and the author archive'
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?(?:https://outsideinprint\.org)?/shop/[^>]*aria-current=(?:"page"|page)[^>]*>\s*<span[^>]*>\s*Bookstore\s*</span>'
    Message = 'expected the bookstore index to mark Bookstore as the current primary destination'
  },
  @{
    Path = 'public/shop/the-water-cycle/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?<a[^>]*class=(?:"[^"]*\bnav-link--current-section\b[^"]*"|''[^'']*\bnav-link--current-section\b[^'']*''|[^\s>]*\bnav-link--current-section\b[^\s>]*)[^>]*href=(?:"(?:https://outsideinprint\.org)?/shop/"|(?:https://outsideinprint\.org)?/shop/)[^>]*>.*?Bookstore.*?current section.*?</a>'
    Message = 'expected bookstore detail pages to expose Bookstore as the current section without claiming it is the current page'
  },
  @{
    Path = 'public/shop/the-water-cycle/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?<a(?=[^>]*href=(?:"(?:https://outsideinprint\.org)?/shop/"|(?:https://outsideinprint\.org)?/shop/))(?=[^>]*aria-current=(?:"page"|page))[^>]*>'
    Message = 'expected bookstore detail pages not to mark the Bookstore landing URL as the current page'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = '(?s)data-bookstore-kindle-button.*?data-analytics-source-slot=(?:"bookstore_index_kindle"|bookstore_index_kindle).*?data-analytics-slug=(?:"the-american-nightmare-keep-dreaming-kid"|the-american-nightmare-keep-dreaming-kid).*?data-analytics-path=(?:"https://www\.amazon\.com/dp/B0H37W2JK8"|https://www\.amazon\.com/dp/B0H37W2JK8)'
    Message = 'expected the compact Kindle button on the bookstore index to carry per-book analytics metadata'
  },
  @{
    Path = 'public/shop/the-water-cycle/index.html'
    Pattern = '(?s)data-bookstore-kindle-button.*?data-analytics-source-slot=(?:"bookstore_detail_kindle"|bookstore_detail_kindle).*?data-analytics-slug=(?:"the-water-cycle"|the-water-cycle).*?data-analytics-path=(?:"https://www\.amazon\.com/dp/B0H46WMGJQ"|https://www\.amazon\.com/dp/B0H46WMGJQ)'
    Message = 'expected the compact Kindle button on bookstore detail pages to carry per-book analytics metadata'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)aria-label="?Footer"?[^>]*>.*?(?:https://outsideinprint\.org)?/studio/[^>]*data-analytics-source-slot=(?:"footer_studio"|footer_studio)[^>]*>\s*Studio\s*<'
    Message = 'expected the footer Studio link to emit its dedicated analytics source slot'
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)aria-label="?Footer"?[^>]*>.*?(?:https://outsideinprint\.org)?/shop/[^>]*data-analytics-source-slot=(?:"footer_bookstore"|footer_bookstore)[^>]*>\s*Bookstore\s*<'
    Message = 'expected the footer Bookstore link to emit its dedicated analytics source slot'
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = '(?s)Bookstore.*?The American Nightmare: Keep Dreaming, Kid.*?Robert V\. Ussley.*?Outside In Print.*?Outside In Print EPUB.*?Secure checkout through Square\. EPUB delivered by email\..*?data-direct-offer-sku=(?:"OIP-AN-EPUB"|OIP-AN-EPUB).*?data-direct-offer-status=(?:"live"|live).*?\$9\.99.*?action=(?:"https://downloads\.outsideinprint\.org/api/books/epub"|https://downloads\.outsideinprint\.org/api/books/epub).*?data-epub-checkout.*?https://www\.amazon\.com/dp/B0H37W2JK8.*?data-bookstore-kindle-button.*?Kindle on Amazon\s*(?:·|&middot;|&#183;)\s*\$9\.99.*?The Parable of the Sheep.*?Robert V\. Ussley.*?Outside In Print.*?Outside In Print EPUB.*?Secure checkout through Square\. EPUB delivered by email\..*?data-direct-offer-sku=(?:"OIP-PS-EPUB"|OIP-PS-EPUB).*?data-direct-offer-status=(?:"live"|live).*?\$9\.99.*?action=(?:"https://downloads\.outsideinprint\.org/api/books/epub"|https://downloads\.outsideinprint\.org/api/books/epub).*?data-epub-checkout.*?https://www\.amazon\.com/dp/B0GN18LLWB.*?data-bookstore-kindle-button.*?Kindle on Amazon\s*(?:·|&middot;|&#183;)\s*\$9\.99.*?The Water Cycle: Risk, Infrastructure, and Public Memory.*?Robert V\. Ussley.*?Outside In Print.*?Outside In Print EPUB.*?Secure checkout through Square\. EPUB delivered by email\..*?data-direct-offer-sku=(?:"OIP-WC-EPUB"|OIP-WC-EPUB).*?data-direct-offer-status=(?:"live"|live).*?\$9\.99.*?action=(?:"https://downloads\.outsideinprint\.org/api/books/epub"|https://downloads\.outsideinprint\.org/api/books/epub).*?data-epub-checkout.*?https://www\.amazon\.com/dp/B0H46WMGJQ.*?data-bookstore-kindle-button.*?Kindle on Amazon\s*(?:·|&middot;|&#183;)\s*\$9\.99'
    Message = 'expected the bookstore index to render each $9.99 direct EPUB offer before its single compact Kindle button'
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = '(?s)/shop/the-american-nightmare-keep-dreaming-kid/.*?Outside In Print EPUB.*?Secure checkout through Square\. EPUB delivered by email\..*?data-direct-offer-sku=(?:"OIP-AN-EPUB"|OIP-AN-EPUB).*?data-direct-offer-status=(?:"live"|live).*?\$9\.99.*?action=(?:"https://downloads\.outsideinprint\.org/api/books/epub"|https://downloads\.outsideinprint\.org/api/books/epub).*?data-epub-checkout.*?https://www\.amazon\.com/dp/B0H37W2JK8.*?data-bookstore-kindle-button.*?Kindle on Amazon\s*(?:·|&middot;|&#183;)\s*\$9\.99'
    Message = 'expected the bookstore index to expose The American Nightmare live direct EPUB before its compact Kindle button'
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = '(?s)/shop/the-parable-of-the-sheep/.*?Outside In Print EPUB.*?Secure checkout through Square\. EPUB delivered by email\..*?data-direct-offer-sku=(?:"OIP-PS-EPUB"|OIP-PS-EPUB).*?data-direct-offer-status=(?:"live"|live).*?\$9\.99.*?action=(?:"https://downloads\.outsideinprint\.org/api/books/epub"|https://downloads\.outsideinprint\.org/api/books/epub).*?data-epub-checkout.*?https://www\.amazon\.com/dp/B0GN18LLWB.*?data-bookstore-kindle-button.*?Kindle on Amazon\s*(?:·|&middot;|&#183;)\s*\$9\.99'
    Message = 'expected the bookstore index to expose Parable live at $9.99 before its compact $9.99 Kindle button'
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = 'bookstore-record'
    Message = 'expected the bookstore index to render reusable OIP book records'
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = 'Each is available directly as an Outside In Print EPUB through secure Square checkout\.'
    Message = 'expected the bookstore introduction to describe individual direct editions without implying a bundle'
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = 'Buy all three directly'
    Message = 'expected the bookstore introduction to omit the ambiguous three-book purchase wording'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = '(?s)american-nightmare-cover-v1\.6\.jpg.*?parable-of-the-sheep-cover-v1\.0\.jpg.*?the-water-cycle-cover-v2\.0\.jpg'
    Message = 'expected the bookstore index to use the official cover images'
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = '(?i)(american-nightmare-bookstore-render-v1\.6\.png|bookstore-woodgrain-v1\.6\.svg|Short Book|short book)'
    Message = 'expected the bookstore index not to use the wood-library render, woodgrain asset, or Short Book language'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = '(?s)/shop/(?:hat|shirt|tote)/|\b(?:hat|shirt|tote)\b|United States only'
    Message = 'expected the bookstore landing page to remove retired merch products and shipping copy'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = '(?i)(direct bundle|stripe|paperback|USPS|shipping address|physical checkout)'
    Message = 'expected the bookstore index to contain no physical-commerce or stale Stripe presentation'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/shop/the-american-nightmare-keep-dreaming-kid/index.html'
    Pattern = '(?s)Book.*?The American Nightmare: Keep Dreaming, Kid.*?Robert V\. Ussley.*?Outside In Print.*?Outside In Print EPUB.*?Secure checkout through Square\. EPUB delivered by email\..*?data-direct-offer-sku=(?:"OIP-AN-EPUB"|OIP-AN-EPUB).*?data-direct-offer-status=(?:"live"|live).*?\$9\.99.*?action=(?:"https://downloads\.outsideinprint\.org/api/books/epub"|https://downloads\.outsideinprint\.org/api/books/epub).*?data-epub-checkout.*?https://www\.amazon\.com/dp/B0H37W2JK8.*?data-bookstore-kindle-button.*?Kindle on Amazon\s*(?:·|&middot;|&#183;)\s*\$9\.99'
    Message = 'expected The American Nightmare page to place its live $9.99 direct EPUB offer before one compact Kindle button'
  },
  @{
    Path = 'public/shop/the-american-nightmare-keep-dreaming-kid/index.html'
    Pattern = '(?i)(direct_download|\.zip|direct bundle|stripe|print-on-demand|\bPOD\b|paperback|USPS|shipping address)'
    Message = 'expected The American Nightmare product page not to expose stale or physical purchase paths'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/shop/the-parable-of-the-sheep/index.html'
    Pattern = '(?s)Book.*?The Parable of the Sheep.*?Robert V\. Ussley.*?Outside In Print.*?Outside In Print EPUB.*?Secure checkout through Square\. EPUB delivered by email\..*?data-direct-offer-sku=(?:"OIP-PS-EPUB"|OIP-PS-EPUB).*?data-direct-offer-status=(?:"live"|live).*?\$9\.99.*?action=(?:"https://downloads\.outsideinprint\.org/api/books/epub"|https://downloads\.outsideinprint\.org/api/books/epub).*?data-epub-checkout.*?https://www\.amazon\.com/dp/B0GN18LLWB.*?data-bookstore-kindle-button.*?Kindle on Amazon\s*(?:·|&middot;|&#183;)\s*\$9\.99'
    Message = 'expected Parable page to place its live $9.99 direct EPUB offer before one compact $9.99 Kindle button'
  },
  @{
    Path = 'public/shop/the-parable-of-the-sheep/index.html'
    Pattern = '(?i)(direct_download|\.zip|direct bundle|stripe|print-on-demand|\bPOD\b|paperback|USPS|shipping address)'
    Message = 'expected The Parable of the Sheep product page not to expose stale or physical purchase paths'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/shop/index.html'
    Pattern = '(?s)/shop/the-water-cycle/.*?Robert V\. Ussley.*?Outside In Print.*?Outside In Print EPUB.*?Secure checkout through Square\. EPUB delivered by email\..*?data-direct-offer-sku=(?:"OIP-WC-EPUB"|OIP-WC-EPUB).*?data-direct-offer-status=(?:"live"|live).*?\$9\.99.*?action=(?:"https://downloads\.outsideinprint\.org/api/books/epub"|https://downloads\.outsideinprint\.org/api/books/epub).*?data-epub-checkout.*?https://www\.amazon\.com/dp/B0H46WMGJQ.*?data-bookstore-kindle-button.*?Kindle on Amazon\s*(?:·|&middot;|&#183;)\s*\$9\.99'
    Message = 'expected the bookstore index to expose The Water Cycle live direct EPUB before its compact Kindle button'
  },
  @{
    Path = 'public/shop/the-water-cycle/index.html'
    Pattern = '(?s)Book.*?The Water Cycle: Risk, Infrastructure, and Public Memory.*?Robert V\. Ussley.*?Outside In Print.*?Outside In Print EPUB.*?Secure checkout through Square\. EPUB delivered by email\..*?data-direct-offer-sku=(?:"OIP-WC-EPUB"|OIP-WC-EPUB).*?data-direct-offer-status=(?:"live"|live).*?\$9\.99.*?action=(?:"https://downloads\.outsideinprint\.org/api/books/epub"|https://downloads\.outsideinprint\.org/api/books/epub).*?data-epub-checkout.*?https://www\.amazon\.com/dp/B0H46WMGJQ.*?data-bookstore-kindle-button.*?Kindle on Amazon\s*(?:·|&middot;|&#183;)\s*\$9\.99'
    Message = 'expected The Water Cycle page to place its live $9.99 direct EPUB offer before one compact Kindle button with canonical author and publisher data'
  },
  @{
    Path = 'public/shop/the-water-cycle/index.html'
    Pattern = '(?i)(direct_download|\.zip|direct bundle|stripe|print-on-demand|\bPOD\b|paperback|USPS|shipping address)'
    Message = 'expected The Water Cycle product page not to expose stale or physical purchase paths'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/authors/robert-v-ussley/index.html'
    Pattern = 'Robert V\. Ussley'
    Message = 'expected the refined author page to name Robert V. Ussley explicitly'
  },
  @{
    Path = 'public/authors/robert-v-ussley/index.html'
    Pattern = 'Bobviously_Portrait_v1\.png'
    Message = 'expected the refined author page to keep the portrait surface'
  },
  @{
    Path = 'public/authors/robert-v-ussley/index.html'
    Pattern = 'Author, designer, developer, and publisher of Outside In Print\.'
    Message = 'expected the author page to state Robert V. Ussley''s professional role'
  },
  @{
    Path = 'public/authors/robert-v-ussley/index.html'
    Pattern = '(?s)author of three books published by Outside In Print.*?The American Nightmare: Keep Dreaming, Kid.*?The Parable of the Sheep.*?The Water Cycle: Risk, Infrastructure, and Public Memory'
    Message = 'expected the author page to name and link all three published books'
  },
  @{
    Path = 'public/authors/robert-v-ussley/index.html'
    Pattern = '(?s)Browse archive.*?Browse collections.*?Search the library.*?Visit the Bookstore.*?About the imprint'
    Message = 'expected the refined author page to expose the compact route-based reading map'
  },
  @{
    Path = 'public/authors/robert-v-ussley/index.html'
    Pattern = 'Author Dossier'
    Message = 'expected the refined author page to remove the retired Author Dossier label'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/authors/robert-v-ussley/index.html'
    Pattern = 'Selected Works|Themes|From the Archive'
    Message = 'expected the refined author page to remove the retired lower dossier sections'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'Collections gather connected essays into guided reading lanes across the archive\. Use them when you want an editorial thread instead of a simple timeline\.'
    Message = 'expected the collections index to explain collections in plain editorial language'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '\d+ public collections.*\d+ published pieces'
    Message = 'expected the collections index to expose the compact collections summary line beneath the intro without pinning a date-sensitive piece count'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'collections-broadsheet'
    Message = 'expected the collections index to render the broadsheet directory shell'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)collections-broadsheet__section.*?collections-group-series.*?collections-broadsheet__section.*?collections-group-topic'
    Message = 'expected the collections broadsheet to expose series and topics as two editorial sections'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'page-header--section-centered'
    Message = 'expected the collections landing header block to emit the centered section-header hook'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'section-front section-front--collections'
    Message = 'expected the collections page to wrap the header in the shared top-zone shell'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)<main\b[^>]*>.*?Curated collections that gather essays, projects, dossiers, and recurring questions into coherent reading threads across the archive\.'
    Message = 'expected the collections index not to render the old descriptive intro paragraph in visible copy'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)<main\b[^>]*>.*?Collections are curated reading threads across the archive: \d+ public collections linking \d+ published pieces\.'
    Message = 'expected the collections index not to render the old prose stats sentence in visible copy'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)journey-links.*?(?:https://outsideinprint\.org)?/library/.*?(?:https://outsideinprint\.org)?/'
    Message = 'expected the collections index not to render the retired top journey-links block'
    ShouldNotMatch = $true
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
    Pattern = "Bob(?:'|&#39;)s Almanack"
    Message = 'expected the public collections index to link Bob''s Almanack after the issue and collection page are published'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '/collections/bobs-almanack/'
    Message = 'expected the public collections index to point to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'compact notices, and one piece worth reprinting\.'
    Message = 'expected the collections index to use the complete Bob''s Almanack proposition'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'compact notices, and worth reprinting\.'
    Message = 'expected the collections index not to retain the incomplete Bob''s Almanack proposition'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/bobs-almanack/index.html'
    Pattern = "Bob(?:'|&#39;)s Almanack"
    Message = 'expected the Bob''s Almanack collection page to render its bespoke nameplate'
  },
  @{
    Path = 'public/collections/bobs-almanack/index.html'
    Pattern = 'compact notices, and one piece worth reprinting\.'
    Message = 'expected the Bob''s Almanack collection page to use the complete proposition'
  },
  @{
    Path = 'public/collections/bobs-almanack/index.html'
    Pattern = 'compact notices, and worth reprinting\.'
    Message = 'expected the Bob''s Almanack collection page not to retain the incomplete proposition'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/bobs-almanack/index.html'
    Pattern = '(?s)Latest Issue.*?July 25, 2026.*?Paperwork cannot repair a car\..*?The Bolt Beside the Gas Tank'
    Message = 'expected the Bob''s Almanack collection page to feature the July 25 issue and lead essay'
  },
  @{
    Path = 'public/almanack/2026-05-02/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?May 2, 2026.*?Issue 1.*?A public cost does not disappear because someone learned to price it\.'
    Message = 'expected the May 2 Almanack issue page to render the dominant nameplate, date, issue number, and opening Robert quote'
  },
  @{
    Path = 'public/almanack/2026-07-25/index.html'
    Pattern = '(?s)</article>\s*<section\b(?=[^>]*newsletter-signup--article-exit)(?=[^>]*page-shell)(?=[^>]*page-shell--wide)[^>]*>.*?Every Saturday.*?Each Saturday(?:''|&#39;)s issue usually brings four new essays or notes with cartoons.*?data-analytics-source-slot=(?:"|'''')?almanack_issue_exit_newsletter(?:"|'''')?.*?Bob(?:''|&#39;)s Almanack will remain free\. No ads, ever\..*?You(?:&rsquo;|&#8217;|\u2019)re reading the sample issue\..*?(?:https://outsideinprint\.org)?/privacy/.*?Your email goes to Buttondown'
    Message = 'expected the sample Almanack issue to end with the canonical signup proposition and issue-exit analytics slot'
  },
  @{
    Path = 'public/almanack/2026-07-25/index.html'
    Pattern = '(?s)newsletter-signup--article-exit.*?<a[^>]*href=(?:"|'''')?(?:https://outsideinprint\.org)?/almanack/2026-07-25/(?:"|'''')?[^>]*>\s*Read a sample issue\s*</a>'
    Message = 'expected the configured sample issue signup not to link back to itself'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-08-29/index.html'
    Pattern = '(?s)</article>\s*<section\b(?=[^>]*newsletter-signup--article-exit)[^>]*>.*?action=(?:"|'''')?https://buttondown\.com/api/emails/embed-subscribe/OutsideInPrint(?:"|'''')?.*?data-analytics-event=(?:"|'''')?newsletter_submit(?:"|'''')?.*?data-analytics-source-slot=(?:"|'''')?almanack_issue_exit_newsletter'
    Message = 'expected an ordinary Almanack issue to reuse the shared Buttondown signup after the issue content'
  },
  @{
    Path = 'public/almanack/2026-05-09/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?May 9, 2026.*?Issue 2.*?A machine is innocent only until the bill arrives\.'
    Message = 'expected the May 9 Almanack issue page to render the dominant nameplate, date, issue number, and opening Robert quote'
  },
  @{
    Path = 'public/almanack/2026-05-09/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the May 9 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-05-09/index.html'
    Pattern = '(?s)/images/rendered/editorial/modern-prometheus/.*?/images/rendered/editorial/lump-of-coal/.*?/images/rendered/editorial/pass-the-pepper/.*?/images/rendered/editorial/who-paid-the-nazis/'
    Message = 'expected the May 9 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-05-09/index.html'
    Pattern = '/images/essays/(modern-prometheus|the-factory-in-the-footnote|can-you-pass-the-pepper-please|the-hate-ledger)/hero\.png'
    Message = 'expected the May 9 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-05-16/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?May 16, 2026.*?Issue 3.*?An institution shows its faith by what it audits\.'
    Message = 'expected the May 16 Almanack issue page to render the dominant nameplate, date, issue number, and opening Robert quote'
  },
  @{
    Path = 'public/almanack/2026-05-16/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the May 16 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-05-16/index.html'
    Pattern = '(?s)/images/rendered/editorial/not-my-river-not-my-problem/.*?/images/rendered/editorial/delivering-the-goods/.*?/images/rendered/editorial/made-in-china/.*?/images/rendered/editorial/see-the-world/'
    Message = 'expected the May 16 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-05-16/index.html'
    Pattern = '/images/essays/(the-ash-pond-under-the-cloud|the-mailbox-at-the-clinic-door|fine-china-the-long-road-from-jingdezhen-to-grandmas-cabinet|outside-the-garden)/hero\.png'
    Message = 'expected the May 16 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-05-23/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?May 23, 2026.*?Issue 4.*?A record is not the truth\. It is where the hiding starts\.'
    Message = 'expected the May 23 Almanack issue page to render the dominant nameplate, date, issue number, and opening Robert quote'
  },
  @{
    Path = 'public/almanack/2026-05-23/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the May 23 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-05-23/index.html'
    Pattern = '(?s)/images/rendered/editorial/memory-hole/.*?/images/rendered/editorial/beneficial-use/.*?/images/rendered/editorial/papers-please/.*?/images/rendered/editorial/the-altar-of-consent/'
    Message = 'expected the May 23 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-05-23/index.html'
    Pattern = '/images/essays/(the-text-message-in-the-archive-box|save-some-air-for-the-fishies|id-required|consent-from-permission-to-sanctity)/hero\.png'
    Message = 'expected the May 23 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-05-30/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?May 30, 2026.*?Issue 5.*?Ask for evidence and watch them\.'
    Message = 'expected the May 30 Almanack issue page to render the dominant nameplate, date, issue number, and opening Robert quote'
  },
  @{
    Path = 'public/almanack/2026-05-30/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the May 30 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-05-30/index.html'
    Pattern = '(?s)/images/rendered/editorial/hit-after-hit/.*?/images/rendered/editorial/warbonds/.*?/images/rendered/editorial/human-resources/.*?/images/rendered/editorial/on-the-fence/'
    Message = 'expected the May 30 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-05-30/index.html'
    Pattern = '/images/essays/(the-scenario-that-ate-the-future|the-war-premium-at-the-auction|the-courthouse-that-ate-the-republic|the-tank-at-the-fence-line)/hero\.png'
    Message = 'expected the May 30 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-06-06/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?June 6, 2026.*?Issue 6.*?Um, yeah, I(?:''|&#39;)m going to need the details\.'
    Message = 'expected the June 6 Almanack issue page to render the dominant nameplate, date, issue number, and opening Robert quote'
  },
  @{
    Path = 'public/almanack/2026-06-06/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the June 6 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-06-06/index.html'
    Pattern = '(?s)/images/rendered/editorial/the-ruler-of-the-road/.*?/images/rendered/editorial/post-malonely/.*?/images/rendered/editorial/blowing-smoke/'
    Message = 'expected the June 6 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-06-06/index.html'
    Pattern = '/images/essays/(the-bell-at-the-crossing-flagship|the-mailbox-at-the-edge-of-the-road|the-examiners-red-pencil|colored-glasses-the-lens-of-race)/hero\.png'
    Message = 'expected the June 6 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-06-20/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?June 20, 2026.*?Issue 7.*?A public rule is only as clean as the place where it lands\.'
    Message = 'expected the June 20 Almanack issue page to render the dominant nameplate, date, issue number, and opening Robert quote'
  },
  @{
    Path = 'public/almanack/2026-06-20/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the June 20 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-06-20/index.html'
    Pattern = '(?s)/images/rendered/editorial/prime-suspect/.*?/images/rendered/editorial/escape-clause/.*?/images/rendered/editorial/the-meter/'
    Message = 'expected the June 20 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-06-20/index.html'
    Pattern = '/images/essays/(the-stamp-on-the-meat-flagship|the-ladder-outside-the-window|the-meter-at-the-curb)/hero\.png'
    Message = 'expected the June 20 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-06-27/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?June 27, 2026.*?Issue 8.*?Vacuum the house everyday if you have a pet that sheds\.'
    Message = 'expected the June 27 Almanack issue page to render the dominant nameplate, date, issue number, and opening Robert quote'
  },
  @{
    Path = 'public/almanack/2026-06-27/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the June 27 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-06-27/index.html'
    Pattern = '(?s)/images/rendered/editorial/shadow-price/.*?/images/rendered/editorial/the-cone-in-the-lane/.*?/images/rendered/editorial/break-seal/.*?/images/rendered/editorial/curb-appeal/'
    Message = 'expected the June 27 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-06-27/index.html'
    Pattern = '/images/essays/(the-bars-on-the-gum|the-cone-in-the-lane|the-seal-around-the-cap|the-curb-cut-at-the-corner)/hero\.png'
    Message = 'expected the June 27 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)data-home-cartoon-recent.*?home-almanack.*?Bob(?:''|&#39;)s Almanack.*?August 29, 2026.*?In the Margins.*?Number.*?Document.*?Navy Readiness: Actions Needed to Address Costly Attack Submarine Maintenance Challenges.*?Virtue.*?Read issue'
    Message = 'expected the homepage Almanack insert to sit below recent cartoons and feature the compact margin ledger'
  },
  @{
    Path = 'public/almanack/2026-07-04/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?July 4, 2026.*?Issue 9.*?A number is useful only after you know what it counts\.'
    Message = 'expected the July 4 Almanack issue page to render the dominant nameplate, date, issue number, and opening Robert quote'
  },
  @{
    Path = 'public/almanack/2026-07-04/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the July 4 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-07-04/index.html'
    Pattern = '(?s)/images/rendered/editorial/the-minute-drawer/.*?/images/rendered/editorial/claim-check/.*?/images/rendered/editorial/after-the-tone/.*?/images/rendered/editorial/the-sorting-counter/'
    Message = 'expected the July 4 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-07-04/index.html'
    Pattern = '/images/essays/(the-clock-by-the-door|the-little-machine-in-the-glass-case|the-siren-on-the-pole|the-charge-ledger)/hero\.png'
    Message = 'expected the July 4 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-07-11/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?July 11, 2026.*?Issue 10.*?Read the small words\. They decide who works and who pays\..*?A duty undefined becomes someone else(?:''|&#39;)s\.'
    Message = 'expected the July 11 Almanack issue page to render the nameplate, issue number, opening quote, and final user-supplied closing quote'
  },
  @{
    Path = 'public/almanack/2026-07-11/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the July 11 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-07-11/index.html'
    Pattern = '(?s)/images/rendered/editorial/the-trophy-case/.*?/images/rendered/editorial/house-gravity/.*?/images/rendered/editorial/whose-yes/.*?/images/rendered/editorial/minimum-door/'
    Message = 'expected the July 11 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-07-11/index.html'
    Pattern = '/images/essays/(first-step|default-owner|whose-yes|minimum-due)/hero\.png'
    Message = 'expected the July 11 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-07-18/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?July 18, 2026.*?Issue 11.*?You go through the things you tolerate\..*?Don(?:''|&#39;)t let the moment catch you ~ catch yourself\.'
    Message = 'expected the July 18 Almanack issue page to render the nameplate, issue number, opening quote, and final user-supplied closing quote'
  },
  @{
    Path = 'public/almanack/2026-07-18/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the July 18 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-07-18/index.html'
    Pattern = '(?s)/images/rendered/editorial/passed-down/.*?/images/rendered/editorial/the-returning-water/.*?/images/rendered/editorial/mending-table/.*?/images/rendered/editorial/the-tiller/'
    Message = 'expected the July 18 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-07-18/index.html'
    Pattern = '/images/essays/(the-warning-reached-the-bridge|the-fit|the-repair|your-part)/hero\.png'
    Message = 'expected the July 18 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-07-25/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?July 25, 2026.*?Issue 12.*?Paperwork cannot repair a car\..*?Plans change\. An update lets other people change theirs\.'
    Message = 'expected the July 25 Almanack issue page to render the nameplate, issue number, opening quote, and closing quote'
  },
  @{
    Path = 'public/almanack/2026-07-25/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the July 25 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-07-25/index.html'
    Pattern = '(?s)/images/rendered/editorial/the-closed-window/.*?/images/rendered/editorial/signal-at-the-turn/.*?/images/rendered/editorial/the-empty-hooks/.*?/images/rendered/editorial/serpent-at-supper/'
    Message = 'expected the July 25 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-07-25/index.html'
    Pattern = '/images/essays/(the-bolt-beside-the-gas-tank|the-update|return|the-six-hour-news-cycle)/hero\.png'
    Message = 'expected the July 25 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-08-01/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?August 1, 2026.*?Issue 13.*?I do what I say I do\..*?Choose one good thing and do it today\.'
    Message = 'expected the August 1 Almanack issue page to render the nameplate, issue number, and affirmation pull quotes'
  },
  @{
    Path = 'public/almanack/2026-08-01/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the August 1 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-08-01/index.html'
    Pattern = '(?s)/images/rendered/editorial/the-shape-opens/.*?/images/rendered/editorial/feet-on-the-floor/.*?/images/rendered/editorial/the-road-rises/.*?/images/rendered/editorial/filled-with-life/'
    Message = 'expected the August 1 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-08-01/index.html'
    Pattern = '/images/essays/(reverse-origami|i-do-what-i-say|my-friend-the-universe|i-am-healed)/hero\.png'
    Message = 'expected the August 1 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-08-08/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?August 8, 2026.*?Issue 14.*?I don(?:''|&#39;|&rsquo;)t make excuses ~ I make myself\..*?My focus is my domain\.'
    Message = 'expected the August 8 Almanack issue page to render the nameplate, issue number, and affirmation pull quotes'
  },
  @{
    Path = 'public/almanack/2026-08-08/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the August 8 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-08-08/index.html'
    Pattern = '(?s)/images/rendered/editorial/the-turn/.*?/images/rendered/editorial/birthright/.*?/images/rendered/editorial/life-opens-the-door/.*?/images/rendered/editorial/not-mine-to-carry/'
    Message = 'expected the August 8 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-08-08/index.html'
    Pattern = '/images/essays/(i-make-myself|rich-in-spirit|open-hands|pay-attention-to-you)/hero\.png'
    Message = 'expected the August 8 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-08-15/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?August 15, 2026.*?Issue 15.*?I(?:''|&#39;|&rsquo;)m not who I used to be\.\.\. I(?:''|&#39;|&rsquo;)m who I decide to be\..*?I move boldly, and I correct as I go\.'
    Message = 'expected the August 15 Almanack issue page to render the nameplate, issue number, and affirmation pull quotes'
  },
  @{
    Path = 'public/almanack/2026-08-15/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the August 15 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-08-15/index.html'
    Pattern = '(?s)/images/rendered/editorial/the-weight-falls-away/.*?/images/rendered/editorial/energy-in-motion/.*?/images/rendered/editorial/the-next-stone/.*?/images/rendered/editorial/the-open-hand/'
    Message = 'expected the August 15 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-08-15/index.html'
    Pattern = '/images/essays/(who-i-decide-to-be|spiritual-being-physical|correct-as-i-go|rise-into-today)/hero\.png'
    Message = 'expected the August 15 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-08-22/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?August 22, 2026.*?Issue 16.*?The light in me recognizes the light in all other beings\..*?I don(?:''|&#39;|&rsquo;)t try to control things\. I only control myself!'
    Message = 'expected the August 22 Almanack issue page to render the nameplate, issue number, and affirmation pull quotes'
  },
  @{
    Path = 'public/almanack/2026-08-22/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the August 22 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-08-22/index.html'
    Pattern = '(?s)/images/rendered/editorial/the-morning-holds-us/.*?/images/rendered/editorial/what-remains/.*?/images/rendered/editorial/both-hands/.*?/images/rendered/editorial/the-impression/'
    Message = 'expected the August 22 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-08-22/index.html'
    Pattern = '(?s)<a\b(?=[^>]*href="?/essays/love-in-the-mirror/"?)(?=[^>]*class="?almanack-image-button"?)[^>]*>.*?/images/rendered/editorial/the-morning-holds-us/.*?<a\b(?=[^>]*href="?/essays/welcome-the-heat/"?)(?=[^>]*class="?almanack-secondary-card__thumb"?)[^>]*>.*?/images/rendered/editorial/what-remains/.*?<a\b(?=[^>]*href="?/essays/after-the-cup-falls/"?)(?=[^>]*class="?almanack-secondary-card__thumb"?)[^>]*>.*?/images/rendered/editorial/both-hands/.*?<a\b(?=[^>]*href="?/essays/the-part-that-is-mine/"?)(?=[^>]*class="?almanack-secondary-card__thumb"?)[^>]*>.*?/images/rendered/editorial/the-impression/'
    Message = 'expected each August 22 paired cartoon to link to its matching public essay'
  },
  @{
    Path = 'public/almanack/2026-08-22/index.html'
    Pattern = '/images/essays/(love-in-the-mirror|welcome-the-heat|after-the-cup-falls|the-part-that-is-mine)/hero\.png'
    Message = 'expected the August 22 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-08-22/index.html'
    Pattern = 'A Note from Robert V\. Ussley|almanack-note|This week begins|opening_note'
    Message = 'expected the August 22 Almanack issue to contain no weekly introduction or Robert note section'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-08-22/index.html'
    Pattern = '(?s)Love in the Mirror.*?Morning gathers all of us in the same light\..*?Welcome the Heat.*?I let failure show me what can carry me forward\..*?After the Cup Falls.*?I repair what happened without punishing myself\..*?The Part That Is Mine.*?I leave the performance in the mirror and take charge of my next move\.'
    Message = 'expected the August 22 story cards to render exact linked titles and source decks in order'
  },
  @{
    Path = 'public/almanack/2026-08-22/index.html'
    Pattern = 'class="almanack-read-link"[^>]*>Read<|class="almanack-read-link"[^>]*>Read\s*<'
    Message = 'expected the August 22 story cards and Worth Reprinting to omit separate Read labels'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-08-29/index.html'
    Pattern = '(?s)Bob(?:''|&#39;)s Almanack.*?August 29, 2026.*?Issue 17.*?The other end keeps changing hands\. The help stays\..*?The work continues even when the surface looks still\.'
    Message = 'expected the August 29 Almanack issue page to render the nameplate, issue number, and Robert pull quotes'
  },
  @{
    Path = 'public/almanack/2026-08-29/index.html'
    Pattern = '(?s)<h1[^>]*id="?almanack-title"?[^>]*>\s*<a[^>]*href="?/collections/bobs-almanack/"?[^>]*>\s*Bob(?:''|&#39;)s Almanack\s*</a>\s*</h1>'
    Message = 'expected the August 29 Almanack nameplate to link back to the Bob''s Almanack collection page'
  },
  @{
    Path = 'public/almanack/2026-08-29/index.html'
    Pattern = '(?s)/images/rendered/editorial/hands-find-the-weight/.*?/images/rendered/editorial/the-bridge-makes-room/.*?/images/rendered/editorial/toward-the-light/.*?/images/rendered/editorial/the-street-keeps-time/'
    Message = 'expected the August 29 Almanack essay cards to use the paired editorial cartoons from the gallery'
  },
  @{
    Path = 'public/almanack/2026-08-29/index.html'
    Pattern = '(?s)<a\b(?=[^>]*href="?/essays/the-other-end/"?)(?=[^>]*class="?almanack-image-button"?)[^>]*>.*?/images/rendered/editorial/hands-find-the-weight/.*?<a\b(?=[^>]*href="?/essays/the-bridge-is-up/"?)(?=[^>]*class="?almanack-secondary-card__thumb"?)[^>]*>.*?/images/rendered/editorial/the-bridge-makes-room/.*?<a\b(?=[^>]*href="?/essays/what-grows/"?)(?=[^>]*class="?almanack-secondary-card__thumb"?)[^>]*>.*?/images/rendered/editorial/toward-the-light/.*?<a\b(?=[^>]*href="?/essays/the-song-we-make/"?)(?=[^>]*class="?almanack-secondary-card__thumb"?)[^>]*>.*?/images/rendered/editorial/the-street-keeps-time/'
    Message = 'expected each August 29 paired cartoon to link to its matching public essay'
  },
  @{
    Path = 'public/almanack/2026-08-29/index.html'
    Pattern = '/images/(?:rendered/)?essays/(the-other-end|the-bridge-is-up|what-grows|the-song-we-make)/'
    Message = 'expected the August 29 Almanack issue not to use essay hero images for essay cards'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-08-29/index.html'
    Pattern = 'A Note from Robert V\. Ussley|almanack-note|This week begins|opening_note'
    Message = 'expected the August 29 Almanack issue to contain no weekly introduction or Robert note section'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/almanack/2026-08-29/index.html'
    Pattern = '(?s)The Other End.*?A willing hand is waiting where the weight continues\..*?The Bridge Is Up.*?I let this minute be this minute\..*?What Grows.*?I care for the things I can.t hurry\..*?The Song We Make.*?My step joins the music moving through everything\.'
    Message = 'expected the August 29 story cards to render exact linked titles and source decks in order'
  },
  @{
    Path = 'public/almanack/2026-08-29/index.html'
    Pattern = 'class="almanack-read-link"[^>]*>Read<|class="almanack-read-link"[^>]*>Read\s*<'
    Message = 'expected the August 29 story cards and Worth Reprinting to omit separate Read labels'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/index.html'
    Pattern = '(?s)<aside\b(?=[^>]*\bhome-almanack\b)[^>]*>.*?Collection.*?</aside>'
    Message = 'expected the homepage Almanack insert not to render a generic collection label'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)Series.*?Syd and Oliver Dialogues.*?Modern Bios.*?Lit Review.*?Reported Case Studies'
    Message = 'expected the unified collections directory to group visible series collections together'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'The Ledger|/collections/the-ledger/'
    Message = 'expected The Ledger to be hidden from the collections directory'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/lit-review/index.html'
    Pattern = '(?s)The Three-Body Problem.*?The Little Prince: 10 Powerful Quotes That Will Change How You See Life.*?6 Reasons Redwall Is a Timeless Classic.*?35 Years of Yellow: The Simpsons Time Loop'
    Message = 'expected the Lit Review collection page to list the launch pieces in explicit collection order'
  },
  @{
    Path = 'public/collections/lit-review/index.html'
    Pattern = 'The Max Mistake'
    Message = 'expected the Lit Review launch page not to include The Max Mistake'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = '(?s)Topics.*?Risk, Uncertainty, and Decision-Making.*?Geopolitics, Trade, and Global Power.*?Floods, Water, and the Built Environment.*?Technology, AI, and the Machine Future.*?Moral, Religious, and Philosophical Essays.*?Civic Institutions and Public Power'
    Message = 'expected the unified collections directory to group visible topic collections together without subgroup labels'
  },
  @{
    Path = 'public/collections/index.html'
    Pattern = 'collection-card--room-echo|class=(?:"[^"]*\bcard\b[^"]*\bcollection-card\b[^"]*"|''[^'']*\bcard\b[^'']*\bcollection-card\b[^'']*''|[^\s>]*\bcard\b[^\s>]*\bcollection-card\b[^\s>]*)'
    Message = 'expected the collections broadsheet to omit room-echo card styling'
    ShouldNotMatch = $true
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
    Message = 'expected the collections index to render the now-public Civic Institutions and Public Power topic lane'
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = 'How to Use This Collection'
    Message = 'expected collection detail pages not to retain the retired overview block'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/gallery/index.html'
    Pattern = 'page-header--section-centered'
    Message = 'expected the gallery landing header block to emit the centered section-header hook'
  },
  @{
    Path = 'public/gallery/index.html'
    Pattern = 'section-front section-front--gallery'
    Message = 'expected the gallery page to wrap the header and spotlight in the shared top-zone shell'
  },
  @{
    Path = 'public/gallery/index.html'
    Pattern = 'data-cartoon-lightbox'
    Message = 'expected the gallery page to include the fullscreen cartoon lightbox'
  },
  @{
    Path = 'public/gallery/index.html'
    Pattern = '<p id=(?:"cartoon-lightbox-title"|cartoon-lightbox-title) class=(?:"cartoon-lightbox__title"|cartoon-lightbox__title) data-cartoon-lightbox-title(?:="")?>\s*</p>'
    Message = 'expected the Gallery lightbox to use a non-heading dialog label'
  },
  @{
    Path = 'public/gallery/index.html'
    Pattern = '<h[1-6]\b[^>]*data-cartoon-lightbox-title(?:=|\s|>)'
    Message = 'expected the Gallery lightbox title hook not to render as an empty heading'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/gallery/index.html'
    Pattern = 'data-cartoon-lightbox-trigger'
    Message = 'expected gallery cartoon images to open the fullscreen lightbox'
  },
  @{
    Path = 'public/gallery/index.html'
    Pattern = 'data-cartoon-slug=certified-safe'
    Message = 'expected gallery cartoon triggers to expose stable cartoon deep-link slugs'
  },
  @{
    Path = 'public/gallery/index.html'
    Pattern = 'URLSearchParams'
    Message = 'expected gallery to resolve cartoon query-string deep links'
  },
  @{
    Path = 'public/gallery/index.html'
    Pattern = 'data-cartoon-lightbox-essay'
    Message = 'expected the fullscreen cartoon lightbox to expose an essay link target'
  },
  @{
    Path = 'public/gallery/index.html'
    Pattern = 'data-essay=(?:"/essays/the-warning-label-in-the-weeds/"|/essays/the-warning-label-in-the-weeds/)'
    Message = 'expected the certified-safe cartoon to link to its associated essay'
  },
  @{
    Path = 'public/gallery/index.html'
    Pattern = '(?s)data-title="Think Outside the Box"[^>]*data-essay='
    Message = 'expected Think Outside the Box to remain image-only without an essay link'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/archive/index.html'
    Pattern = 'section-front'
    Message = 'expected the archive route to remain on its essays-front shell without the new shared top-zone wrapper'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = '(?s)collection-section__header.*?<h1>Risk, Uncertainty, and Decision-Making</h1>.*?<li>Essays</li>.*?<li>Risk, uncertainty, and decisions</li>'
    Message = 'expected collection detail pages to use the actual collection title and a compact label-free ledger'
  },
  @{
    Path = 'public/collections/syd-and-oliver-dialogues/index.html'
    Pattern = '(?s)collection-section__header(?:(?!</header>).)*(Conversational series|Start here:)'
    Message = 'expected collection detail ledgers to omit lane metadata and start-here links'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = '<h2[^>]*>Contents</h2>|pieces appear below in collection order'
    Message = 'expected collection detail pages to omit the contents label and explanatory contents copy'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = 'Format:|Scope:|Lane:'
    Message = 'expected collection detail ledgers to omit metadata labels and keep only values'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/civic-institutions-and-public-power/index.html'
    Pattern = '(?s)<li>Essays</li>.*?<li>Courts, institutions, and public power</li>'
    Message = 'expected collection detail ledgers to keep metadata values after dropping labels'
  },
  @{
    Path = 'public/collections/civic-institutions-and-public-power/index.html'
    Pattern = 'Essays on courts, federalism, public institutions, and the exercise of public power\.'
    Message = 'expected the public Civic Institutions collection to use reader-facing published-lane copy'
  },
  @{
    Path = 'public/collections/civic-institutions-and-public-power/index.html'
    Pattern = 'A staged lane'
    Message = 'expected the public Civic Institutions collection to omit obsolete staging copy'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = '(?s)collection-section__lead.*?<h2[^>]*>Start Here</h2>'
    Message = 'expected collection detail pages to promote the marked entry point in a Start Here section'
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = '(?s)<ol[^>]*class=(?:"[^"]*\bcollection-section__items\b[^"]*"|''[^'']*\bcollection-section__items\b[^'']*''|[^\s>]*\bcollection-section__items\b[^\s>]*)[^>]*>(?:(?!</ol>).)*?/essays/what-is-risk-a-four-part-framework/'
    Message = 'expected the Risk, Uncertainty, and Decision-Making Start Here essay not to be duplicated in the contents list'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = '/collections/the-ledger/|data-analytics-collection=(?:"the-ledger"|the-ledger)'
    Message = 'expected related collection rows to omit the hidden Ledger collection'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/the-ledger/index.html'
    Pattern = '(?s)<ol[^>]*class=(?:"[^"]*\bcollection-section__items\b[^"]*"|''[^'']*\bcollection-section__items\b[^'']*''|[^\s>]*\bcollection-section__items\b[^\s>]*)[^>]*>(?:(?!</ol>).)*?/essays/the-ledger-vol-1/'
    Message = 'expected The Ledger Start Here essay not to be duplicated in the contents list'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/the-ledger/index.html'
    Pattern = '<meta name=robots content="noindex, follow"'
    Message = 'expected the hidden Ledger collection page to be noindexed while remaining directly reachable'
  },
  @{
    Path = 'public/sitemap.xml'
    Pattern = '/collections/the-ledger/'
    Message = 'expected the hidden Ledger collection page to be excluded from the sitemap'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-ledger-vol-1/index.html'
    Pattern = '/collections/the-ledger/|data-analytics-collection=(?:"the-ledger"|the-ledger)'
    Message = 'expected Ledger essay pages not to expose the hidden collection as a public reader path'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-ledger-vol-2/index.html'
    Pattern = '/collections/the-ledger/|data-analytics-collection=(?:"the-ledger"|the-ledger)'
    Message = 'expected Ledger essay pages not to expose the hidden collection as a public reader path'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-ledger-vol-3/index.html'
    Pattern = '/collections/the-ledger/|data-analytics-collection=(?:"the-ledger"|the-ledger)'
    Message = 'expected Ledger essay pages not to expose the hidden collection as a public reader path'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/floods-water-built-environment/index.html'
    Pattern = '(?s)<ol[^>]*class=(?:"[^"]*\bcollection-section__items\b[^"]*"|''[^'']*\bcollection-section__items\b[^'']*''|[^\s>]*\bcollection-section__items\b[^\s>]*)[^>]*>(?:(?!</ol>).)*?/essays/what-happened-at-camp-mystic/'
    Message = 'expected the Floods, Water, and the Built Environment Start Here essay not to be duplicated in the contents list'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = 'Related Collections'
    Message = 'expected collection detail pages to link onward to related collections'
  },
  @{
    Path = 'public/collections/risk-uncertainty/index.html'
    Pattern = 'Nearby lanes for continuing through the archive\.'
    Message = 'expected collection detail pages to explain why related collections are shown'
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
    Pattern = 'First web edition'
    Message = 'expected article record rails to normalize legacy digital-edition labels for the web'
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = 'First digital edition'
    Message = 'expected article headers not to expose legacy digital-edition wording'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = '(?s)article-publication-record.*?newsletter-signup--article-exit.*?Every Saturday.*?Each Saturday(?:''|&#39;)s issue usually brings four new essays or notes with cartoons.*?data-analytics-source-slot=(?:"|'''')?article_exit_newsletter(?:"|'''')?.*?Bob(?:''|&#39;)s Almanack will remain free\. No ads, ever\..*?(?:https://outsideinprint\.org)?/almanack/2026-07-25/[^>]*>\s*Read a sample issue\s*<.*?(?:https://outsideinprint\.org)?/privacy/[^>]*>\s*Privacy details\s*<.*?Your email goes to Buttondown.*?journey-links--article-exit.*?(?:https://outsideinprint\.org)?/archive/.*?(?:https://outsideinprint\.org)?/collections/.*?(?:https://outsideinprint\.org)?/library/'
    Message = 'expected article aftermatter to place the full canonical Bob''s Almanack signup and article paths after the publication record'
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = '(?s)article-publication-record.*?newsletter-prompt--article-exit.*?data-analytics-source-slot=(?:"|'''')?article_exit_newsletter_prompt(?:"|'''')?.*?reading-path.*?Curated position\s+\d+\s+of\s+\d+.*?Reading progress on this device:\s+\d+\s+of\s+\d+\s+pieces\..*?newsletter-signup--article-exit'
    Message = 'expected a curated collection essay to expose the early newsletter jump and reader-facing device progress before the full signup'
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?<a[^>]*class=(?:"[^"]*\bnav-link--current-section\b[^"]*"|''[^'']*\bnav-link--current-section\b[^'']*''|[^\s>]*\bnav-link--current-section\b[^\s>]*)[^>]*href=(?:"(?:https://outsideinprint\.org)?/archive/"|(?:https://outsideinprint\.org)?/archive/)[^>]*>.*?Archive.*?current section.*?</a>'
    Message = 'expected article pages to expose Archive as the current section'
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?<a(?=[^>]*href=(?:"(?:https://outsideinprint\.org)?/archive/"|(?:https://outsideinprint\.org)?/archive/))(?=[^>]*aria-current=(?:"page"|page))[^>]*>'
    Message = 'expected article pages not to mark the Archive landing URL as the current page'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = '(?s)aria-label="?Primary"?[^>]*>.*?(?:https://outsideinprint\.org)?/literature/'
    Message = 'expected article mastheads not to expose the retired literature section'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/the-risk-management-buffet/index.html'
    Pattern = 'running-header'
    Message = 'expected article pages not to render the retired article-level running header'
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
    Pattern = 'newsletter-signup--article-exit'
    Message = 'expected non-collection essays to render the full canonical Bob''s Almanack signup'
  },
  @{
    Path = 'public/essays/the-world-is-back-at-the-poker-table/index.html'
    Pattern = '(?is)<section\b(?=[^>]*newsletter-signup--article-exit)[^>]*>.*?(?:Limited time|launch window|No spam|Easy to leave).*?</section>'
    Message = 'expected article newsletter propositions to omit retired temporary and vague trust copy'
    ShouldNotMatch = $true
  }
)

$articleCollectionBoundaryPages = @(
  @{ Path = 'public/essays/your-part/index.html'; Slug = 'simple-logic'; Label = 'Your Part' },
  @{ Path = 'public/essays/togetherness/index.html'; Slug = 'musings'; Label = 'Togetherness' },
  @{ Path = 'public/essays/in-hand/index.html'; Slug = 'musings'; Label = 'In Hand' },
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
  @{ Path = 'public/essays/the-bolt-beside-the-gas-tank/index.html'; Slug = 'risk-uncertainty'; Label = 'The Bolt Beside the Gas Tank' },
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
  },
  @{
    Path = 'public/essays/what-happened-at-camp-mystic/index.html'
    Pattern = '(?s)Sixth web edition.*?July 4: Warning, Rising Water, and Evacuation.*?Further Reading.*?The Water.s Rising: What the Data Really Says About Extreme Weather'
    Message = 'expected the Camp Mystic essay to render its revised edition, consolidated timeline heading, and finished further-reading close'
  },
  @{
    Path = 'public/essays/what-happened-at-camp-mystic/index.html'
    Pattern = 'Deep Dive Teaser|Combined Full Timeline|upcoming piece|Thanks for reading!|COA2|back-archive review|Medium import residue|Recovered and localized|localized USGS terrain visuals'
    Message = 'expected the Camp Mystic page to omit stale preview and internal production language'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/what-happened-at-camp-mystic/index.html'
    Pattern = 'What Happened at Camp Mystic\?\.'
    Message = 'expected terminal punctuation in the Camp Mystic citation not to receive a duplicate period'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/essays/jack-stratton-and-the-vulfpeck-model/index.html'
    Pattern = '(?s)Fifth web edition.*?What(?:&rsquo;|&#39;|'')s Next for Jack Stratton and Vulfpeck.*?Source: Blue Funky Mamma'
    Message = 'expected the Jack Stratton bio to render its revised edition, completed source label, and evergreen closing heading'
  },
  @{
    Path = 'public/essays/jack-stratton-and-the-vulfpeck-model/index.html'
    Pattern = 'back-archive review|Recovered and localized|localized visual sequence|What(?:&rsquo;|&#39;|'')s Next for Jack Stratton and Vulfpeck in 2025|At publication, the band had|more recently'
    Message = 'expected the Jack Stratton page to omit stale and internal production language'
    ShouldNotMatch = $true
  },
  @{
    Path = 'public/syd-and-oliver/peaches-or-greece/index.html'
    Pattern = '(?s)Second web edition.*?Athens, Georgia, and Athens, Greece\..*?Oliver repeated the word\..*?Manufactured global citizenship\..*?romanticizing stale potato chips'
    Message = 'expected Peaches or Greece to render the corrected dialogue and revised edition'
  },
  @{
    Path = 'public/syd-and-oliver/peaches-or-greece/index.html'
    Pattern = 'intersting|citezenship|romaticizing|Perhaps, both'
    Message = 'expected Peaches or Greece to omit the repaired spelling and punctuation errors'
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

$exactPrimaryNavExpectations = @(
  @{ Path = 'public/index.html'; Destination = '/'; GroupClass = 'nav-disclosure--read'; MenuCurrent = $true },
  @{ Path = 'public/archive/index.html'; Destination = '/archive/'; GroupClass = 'nav-disclosure--read'; MenuCurrent = $false },
  @{ Path = 'public/collections/index.html'; Destination = '/collections/'; GroupClass = 'nav-disclosure--read'; MenuCurrent = $false },
  @{ Path = 'public/library/index.html'; Destination = '/library/'; GroupClass = 'nav-disclosure--read'; MenuCurrent = $true },
  @{ Path = 'public/gallery/index.html'; Destination = '/gallery/'; GroupClass = 'nav-disclosure--explore'; MenuCurrent = $true },
  @{ Path = 'public/apps/index.html'; Destination = '/apps/'; GroupClass = 'nav-disclosure--explore'; MenuCurrent = $true },
  @{ Path = 'public/games/index.html'; Destination = '/games/'; GroupClass = 'nav-disclosure--explore'; MenuCurrent = $true },
  @{ Path = 'public/studio/index.html'; Destination = '/studio/'; GroupClass = $null; MenuCurrent = $false },
  @{ Path = 'public/shop/index.html'; Destination = '/shop/'; GroupClass = $null; MenuCurrent = $true },
  @{ Path = 'public/about/index.html'; Destination = '/about/'; GroupClass = $null; MenuCurrent = $true },
  @{ Path = 'public/support/index.html'; Destination = '/support/'; GroupClass = $null; MenuCurrent = $true },
  @{ Path = 'public/random/index.html'; Destination = '/random/'; GroupClass = 'nav-disclosure--read'; MenuCurrent = $true }
)

foreach ($expectation in $exactPrimaryNavExpectations) {
  $relativePath = [string]$expectation.Path
  $destinationPath = [string]$expectation.Destination
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $uxIssues.Add("$relativePath => missing exact-destination primary-navigation coverage")
    continue
  }

  $primaryNavHtml = Get-PrimaryNavHtml -Html ([string]$targetPageHtml[$relativePath])
  $destinationAnchors = @(
    Get-OpenTags -Html $primaryNavHtml -TagName 'a' |
      Where-Object { (Get-SitePathFromHref -Href (Get-AttributeValue -Tag $_ -Name 'href')) -ceq $destinationPath }
  )
  if ($destinationAnchors.Count -ne 2) {
    $uxIssues.Add("$relativePath => expected two responsive links for exact destination '$destinationPath', found $($destinationAnchors.Count)")
    continue
  }

  foreach ($destinationAnchor in $destinationAnchors) {
    if ((Get-AttributeValue -Tag $destinationAnchor -Name 'aria-current') -cne 'page') {
      $uxIssues.Add("$relativePath => exact destination '$destinationPath' must carry aria-current='page'")
    }
    if (Test-TagHasClass -Tag $destinationAnchor -ClassName 'nav-link--current-section') {
      $uxIssues.Add("$relativePath => exact destination '$destinationPath' must not use the descendant-only current-section class")
    }
  }

  $groupClass = [string]$expectation.GroupClass
  if (-not [string]::IsNullOrWhiteSpace($groupClass)) {
    $currentGroup = @(
      Get-OpenTags -Html $primaryNavHtml -TagName 'details' |
        Where-Object {
          (Test-TagHasClass -Tag $_ -ClassName $groupClass) -and
          (Test-TagHasClass -Tag $_ -ClassName 'nav-disclosure--current')
        }
    )
    if ($currentGroup.Count -ne 1) {
      $uxIssues.Add("$relativePath => exact destination '$destinationPath' must activate $groupClass")
    }
  }

  $mobileMenuCurrent = @(
    Get-OpenTags -Html $primaryNavHtml -TagName 'details' |
      Where-Object { Test-TagHasClass -Tag $_ -ClassName 'nav-mobile-menu--current' }
  ).Count -eq 1
  if ($mobileMenuCurrent -ne [bool]$expectation.MenuCurrent) {
    $uxIssues.Add("$relativePath => mobile Menu current-section state did not match the exact destination placement")
  }
}

$descendantPrimaryNavExpectations = @(
  @{ Path = 'public/essays/the-risk-management-buffet/index.html'; Destination = '/archive/'; GroupClass = 'nav-disclosure--read'; MenuCurrent = $false },
  @{ Path = 'public/collections/the-ledger/index.html'; Destination = '/collections/'; GroupClass = 'nav-disclosure--read'; MenuCurrent = $false },
  @{ Path = 'public/shop/the-water-cycle/index.html'; Destination = '/shop/'; GroupClass = $null; MenuCurrent = $true },
  @{ Path = 'public/apps/bucks-machine/index.html'; Destination = '/apps/'; GroupClass = 'nav-disclosure--explore'; MenuCurrent = $true },
  @{ Path = 'public/games/idle-times/index.html'; Destination = '/games/'; GroupClass = 'nav-disclosure--explore'; MenuCurrent = $true },
  @{ Path = 'public/support/cancellation-refunds/index.html'; Destination = '/support/'; GroupClass = $null; MenuCurrent = $true }
)

foreach ($expectation in $descendantPrimaryNavExpectations) {
  $relativePath = [string]$expectation.Path
  $destinationPath = [string]$expectation.Destination
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $uxIssues.Add("$relativePath => missing descendant primary-navigation coverage")
    continue
  }

  $primaryNavHtml = Get-PrimaryNavHtml -Html ([string]$targetPageHtml[$relativePath])
  $destinationAnchors = @(
    Get-OpenTags -Html $primaryNavHtml -TagName 'a' |
      Where-Object { (Get-SitePathFromHref -Href (Get-AttributeValue -Tag $_ -Name 'href')) -ceq $destinationPath }
  )
  if ($destinationAnchors.Count -ne 2) {
    $uxIssues.Add("$relativePath => expected two responsive section links for '$destinationPath', found $($destinationAnchors.Count)")
  }
  foreach ($destinationAnchor in $destinationAnchors) {
    if (-not (Test-TagHasClass -Tag $destinationAnchor -ClassName 'nav-link--current-section')) {
      $uxIssues.Add("$relativePath => descendant destination '$destinationPath' must carry the current-section class")
    }
    if ($null -ne (Get-AttributeValue -Tag $destinationAnchor -Name 'aria-current')) {
      $uxIssues.Add("$relativePath => descendant destination '$destinationPath' must not carry aria-current")
    }
  }

  $groupClass = [string]$expectation.GroupClass
  if (-not [string]::IsNullOrWhiteSpace($groupClass)) {
    $currentGroup = @(
      Get-OpenTags -Html $primaryNavHtml -TagName 'details' |
        Where-Object {
          (Test-TagHasClass -Tag $_ -ClassName $groupClass) -and
          (Test-TagHasClass -Tag $_ -ClassName 'nav-disclosure--current')
        }
    )
    if ($currentGroup.Count -ne 1) {
      $uxIssues.Add("$relativePath => expected $groupClass to expose the current-section state")
    }
  }

  $mobileMenuCurrent = @(
    Get-OpenTags -Html $primaryNavHtml -TagName 'details' |
      Where-Object { Test-TagHasClass -Tag $_ -ClassName 'nav-mobile-menu--current' }
  ).Count -eq 1
  if ($mobileMenuCurrent -ne [bool]$expectation.MenuCurrent) {
    $uxIssues.Add("$relativePath => mobile Menu current-section state did not match the location of the active destination")
  }
}

if ($targetPageHtml.ContainsKey('public/404.html')) {
  $notFoundPrimaryNav = Get-PrimaryNavHtml -Html ([string]$targetPageHtml['public/404.html'])
  if ($notFoundPrimaryNav -match 'aria-current\s*=|nav-link--current-section|nav-disclosure--current|nav-mobile-menu--current') {
    $uxIssues.Add('public/404.html => primary navigation must not claim an exact page or current section')
  }
}

foreach ($forbiddenPath in @(
  'public/shipping-returns/index.html'
)) {
  $fullForbiddenPath = Join-Path $repoRoot $forbiddenPath
  if (Test-Path -LiteralPath $fullForbiddenPath -PathType Leaf) {
    $uxIssues.Add("$forbiddenPath => expected excluded route to remain absent")
  }
}

$homeBookstoreTargets = @(
  @{ Href = '/shop/'; Slug = 'bookstore'; Title = 'The Bookstore'; Count = 1 },
  @{ Href = '/shop/the-american-nightmare-keep-dreaming-kid/'; Slug = 'the-american-nightmare-keep-dreaming-kid'; Title = 'The American Nightmare: Keep Dreaming, Kid'; Count = 2 },
  @{ Href = '/shop/the-parable-of-the-sheep/'; Slug = 'the-parable-of-the-sheep'; Title = 'The Parable of the Sheep'; Count = 2 },
  @{ Href = '/shop/the-water-cycle/'; Slug = 'the-water-cycle'; Title = 'The Water Cycle: Risk, Infrastructure, and Public Memory'; Count = 2 }
)

if ($targetPageHtml.ContainsKey('public/index.html')) {
  $homeIndexHtml = [string]$targetPageHtml['public/index.html']
  $bookstoreSectionMatch = [regex]::Match($homeIndexHtml, '(?is)<section\b(?=[^>]*\bhome-bookstore\b)[^>]*>.*?</section>')
  if (-not $bookstoreSectionMatch.Success) {
    $uxIssues.Add('public/index.html => expected a rendered homepage bookstore section')
  }
  else {
    $bookstoreAnchors = @(Get-OpenTags -Html $bookstoreSectionMatch.Value -TagName 'a')
    if ($bookstoreAnchors.Count -ne 7) {
      $uxIssues.Add("public/index.html => expected exactly 7 homepage bookstore links, found $($bookstoreAnchors.Count)")
    }

    foreach ($anchor in $bookstoreAnchors) {
      $href = Get-AttributeValue -Tag $anchor -Name 'href'
      $target = @($homeBookstoreTargets | Where-Object { $_.Href -ceq $href }) | Select-Object -First 1
      if (-not $target) {
        $uxIssues.Add("public/index.html => unexpected homepage bookstore destination '$href'")
        continue
      }

      foreach ($attributeExpectation in @(
        @{ Name = 'data-analytics-event'; Value = 'internal_promo_click' },
        @{ Name = 'data-analytics-source-slot'; Value = 'homepage_bookstore_promo' },
        @{ Name = 'data-analytics-slug'; Value = $target.Slug },
        @{ Name = 'data-analytics-title'; Value = $target.Title },
        @{ Name = 'data-analytics-section'; Value = 'Bookstore' },
        @{ Name = 'data-analytics-path'; Value = $target.Href }
      )) {
        $actualValue = Get-AttributeValue -Tag $anchor -Name $attributeExpectation.Name
        if ($actualValue -cne $attributeExpectation.Value) {
          $uxIssues.Add("public/index.html => homepage bookstore link '$href' expected $($attributeExpectation.Name)='$($attributeExpectation.Value)', found '$actualValue'")
        }
      }
    }

    foreach ($target in $homeBookstoreTargets) {
      $matchingAnchorCount = @($bookstoreAnchors | Where-Object { (Get-AttributeValue -Tag $_ -Name 'href') -ceq $target.Href }).Count
      if ($matchingAnchorCount -ne $target.Count) {
        $uxIssues.Add("public/index.html => expected $($target.Count) homepage bookstore links to '$($target.Href)', found $matchingAnchorCount")
      }
    }
  }

  $bookstoreCardCount = [regex]::Matches($homeIndexHtml, '\bdata-home-bookstore-card(?:[=\s>])', 'IgnoreCase').Count
  if ($bookstoreCardCount -ne 3) {
    $uxIssues.Add("public/index.html => expected exactly 3 homepage bookstore cards, found $bookstoreCardCount")
  }

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

$bookstoreProducts = @(
  @{
    DetailPath = 'public/shop/the-american-nightmare-keep-dreaming-kid/index.html'
    Slug = 'the-american-nightmare-keep-dreaming-kid'
    Title = 'The American Nightmare: Keep Dreaming, Kid'
    PurchaseUrl = 'https://www.amazon.com/dp/B0H37W2JK8'
    KindleRole = 'secondary'
  },
  @{
    DetailPath = 'public/shop/the-parable-of-the-sheep/index.html'
    Slug = 'the-parable-of-the-sheep'
    Title = 'The Parable of the Sheep'
    PurchaseUrl = 'https://www.amazon.com/dp/B0GN18LLWB'
    KindleRole = 'secondary'
  },
  @{
    DetailPath = 'public/shop/the-water-cycle/index.html'
    Slug = 'the-water-cycle'
    Title = 'The Water Cycle: Risk, Infrastructure, and Public Memory'
    PurchaseUrl = 'https://www.amazon.com/dp/B0H46WMGJQ'
    KindleRole = 'secondary'
  }
)

foreach ($surface in @(
  @{ Path = 'public/shop/index.html'; ExpectedCount = 3; Slots = @('bookstore_index_kindle') },
  @{ Path = $null; ExpectedCount = 1; Slots = @('bookstore_detail_kindle') }
)) {
  $surfacePaths = if ($surface.Path) { @($surface.Path) } else { @($bookstoreProducts | ForEach-Object { $_.DetailPath }) }

  foreach ($surfacePath in $surfacePaths) {
    if (-not $targetPageHtml.ContainsKey($surfacePath)) {
      $uxIssues.Add("Missing generated bookstore page required for Amazon-exit coverage: $surfacePath")
      continue
    }

    $surfaceHtml = [string]$targetPageHtml[$surfacePath]
    $surfaceProducts = if ($surface.Path) {
      $bookstoreProducts
    }
    else {
      @($bookstoreProducts | Where-Object { $_.DetailPath -ceq $surfacePath })
    }
    $amazonAnchors = @(Get-OpenTags -Html $surfaceHtml -TagName 'a' | Where-Object {
      (Get-AttributeValue -Tag $_ -Name 'href') -match '^https://www\.amazon\.com/'
    })
    $expectedExitCount = [int]$surface.ExpectedCount
    if ($amazonAnchors.Count -ne $expectedExitCount) {
      $uxIssues.Add("$surfacePath => expected exactly $expectedExitCount Amazon exits, found $($amazonAnchors.Count)")
    }

    foreach ($product in $surfaceProducts) {
      $productAnchors = @($amazonAnchors | Where-Object {
        (Get-AttributeValue -Tag $_ -Name 'href') -ceq $product.PurchaseUrl
      })
      if ($productAnchors.Count -ne 1) {
        $uxIssues.Add("$surfacePath => expected exactly 1 active Kindle exit for '$($product.Title)', found $($productAnchors.Count)")
        continue
      }

      $expectedSlots = @($surface.Slots)
      $actualSlots = @($productAnchors | ForEach-Object { Get-AttributeValue -Tag $_ -Name 'data-analytics-source-slot' } | Sort-Object)
      if (($actualSlots -join '|') -cne (($expectedSlots | Sort-Object) -join '|')) {
        $uxIssues.Add("$surfacePath => expected Amazon source slots '$($expectedSlots -join ', ')', found '$($actualSlots -join ', ')' for '$($product.Title)'")
      }

      foreach ($anchor in $productAnchors) {
        $kindleRole = Get-AttributeValue -Tag $anchor -Name 'data-bookstore-kindle-role'
        if ($kindleRole -cne $product.KindleRole) {
          $uxIssues.Add("$surfacePath => Kindle exit for '$($product.Title)' expected data-bookstore-kindle-role='$($product.KindleRole)', found '$kindleRole'")
        }

        $kindleClasses = @((Get-AttributeValue -Tag $anchor -Name 'class') -split '\s+' | Where-Object { $_ })
        if ($product.KindleRole -ceq 'primary-available' -and $kindleClasses -cnotcontains 'bookstore-kindle-button--available-primary') {
          $uxIssues.Add("$surfacePath => active Kindle exit for '$($product.Title)' must carry bookstore-kindle-button--available-primary")
        }
        if ($product.KindleRole -ceq 'secondary' -and $kindleClasses -ccontains 'bookstore-kindle-button--available-primary') {
          $uxIssues.Add("$surfacePath => secondary Kindle exit for '$($product.Title)' must not carry bookstore-kindle-button--available-primary")
        }

        foreach ($attributeExpectation in @(
          @{ Name = 'data-analytics-slug'; Value = $product.Slug },
          @{ Name = 'data-analytics-title'; Value = $product.Title },
          @{ Name = 'data-analytics-section'; Value = 'Bookstore' },
          @{ Name = 'data-analytics-path'; Value = $product.PurchaseUrl }
        )) {
          $actualValue = Get-AttributeValue -Tag $anchor -Name $attributeExpectation.Name
          if ($actualValue -cne $attributeExpectation.Value) {
            $uxIssues.Add("$surfacePath => Amazon exit for '$($product.Title)' expected $($attributeExpectation.Name)='$($attributeExpectation.Value)', found '$actualValue'")
          }
        }
        if ($anchor -match '\bdata-analytics-event(?:\s*=|\s|>)') {
          $uxIssues.Add("$surfacePath => Amazon exit for '$($product.Title)' must not declare data-analytics-event")
        }
      }
    }

    if (-not $surface.Path) {
      $primaryNavHtml = Get-PrimaryNavHtml -Html $surfaceHtml
      $bookstoreNavAnchors = @(
        Get-OpenTags -Html $primaryNavHtml -TagName 'a' |
          Where-Object { (Get-SitePathFromHref -Href (Get-AttributeValue -Tag $_ -Name 'href')) -ceq '/shop/' }
      )
      if ($bookstoreNavAnchors.Count -ne 2) {
        $uxIssues.Add("$surfacePath => expected two responsive Bookstore navigation links, found $($bookstoreNavAnchors.Count)")
      }
      foreach ($bookstoreNavAnchor in $bookstoreNavAnchors) {
        if (-not (Test-TagHasClass -Tag $bookstoreNavAnchor -ClassName 'nav-link--current-section')) {
          $uxIssues.Add("$surfacePath => expected Bookstore to carry the current-section cue")
        }
        if ($null -ne (Get-AttributeValue -Tag $bookstoreNavAnchor -Name 'aria-current')) {
          $uxIssues.Add("$surfacePath => Bookstore detail page must not mark /shop/ as aria-current")
        }
      }
    }
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
  $newsletterSectionMatch = [regex]::Match($articleHtml, '(?is)<section\b(?=[^>]*newsletter-signup--article-exit)[^>]*>.*?</section>')
  $newsletterHtml = if ($newsletterSectionMatch.Success) { $newsletterSectionMatch.Value } else { '' }
  $recordIndex = $articleHtml.IndexOf('article-publication-record', [System.StringComparison]::Ordinal)
  $newsletterIndex = $articleHtml.IndexOf('newsletter-signup--article-exit', [System.StringComparison]::Ordinal)
  $journeyIndex = $articleHtml.IndexOf('journey-links--article-exit', [System.StringComparison]::Ordinal)
  if ($recordIndex -lt 0 -or $newsletterIndex -lt 0 -or $journeyIndex -lt 0 -or
      $recordIndex -ge $newsletterIndex -or $newsletterIndex -ge $journeyIndex) {
    $uxIssues.Add("$articlePath => expected publication record, full Bob's Almanack signup, and article paths in that order")
  }

  if ($newsletterHtml -notmatch '(?s)newsletter-signup--article-exit.*?Every Saturday.*?Each Saturday(?:''|&#39;)s issue usually brings four new essays or notes with cartoons.*?Bob(?:''|&#39;)s Almanack will remain free\. No ads, ever\..*?(?:https://outsideinprint\.org)?/almanack/2026-07-25/.*?(?:https://outsideinprint\.org)?/privacy/.*?Your email goes to Buttondown') {
    $uxIssues.Add("$articlePath => expected the canonical Bob's Almanack cadence, contents, permanent-free, sample, and privacy proposition")
  }

  if ($newsletterHtml -match '(?i)Limited time|launch window|No spam|Easy to leave') {
    $uxIssues.Add("$articlePath => retained retired newsletter trust copy")
  }

  if ($articleHtml -notmatch '(?s)journey-links--article-exit.*?(?:https://outsideinprint\.org)?/archive/.*?(?:https://outsideinprint\.org)?/collections/.*?(?:https://outsideinprint\.org)?/library/.*?https://buttondown\.com/OutsideInPrint[^>]*>\s*Newsletter\s*<') {
    $uxIssues.Add("$articlePath => expected article-exit links to include Archive, Collections, Library, and Newsletter")
  }
}

$affirmationCollectionPath = 'public/collections/the-things-we-say/index.html'
if (-not $targetPageHtml.ContainsKey($affirmationCollectionPath)) {
  $uxIssues.Add("Missing generated page required for affirmation-bank coverage: $affirmationCollectionPath")
}
else {
  $affirmationCollectionHtml = [string]$targetPageHtml[$affirmationCollectionPath]
  $bankSectionMatch = [regex]::Match(
    $affirmationCollectionHtml,
    '(?is)<section\b(?=[^>]*\bid=(?:"the-words-we-say"|''the-words-we-say''|the-words-we-say))(?=[^>]*\bclass=(?:"[^"]*\baffirmation-bank\b[^"]*"|''[^'']*\baffirmation-bank\b[^'']*''|[^\s>]*\baffirmation-bank\b[^\s>]*))[^>]*>(?<body>.*?)</section>'
  )

  if (-not $bankSectionMatch.Success) {
    $uxIssues.Add("$affirmationCollectionPath => expected the canonical affirmation-bank section")
  }
  else {
    $bankSectionHtml = $bankSectionMatch.Groups['body'].Value
    if ($bankSectionMatch.Value -notmatch 'aria-label=(?:"Affirmations"|''Affirmations''|Affirmations)') {
      $uxIssues.Add("$affirmationCollectionPath => expected an accessible Affirmations section label")
    }
    if ($bankSectionHtml -match '(?is)<h2\b|The Words We Say|Current bank\s*[·&]|affirmation-bank__meta') {
      $uxIssues.Add("$affirmationCollectionPath => expected no visible bank title or count")
    }

    $decodedBankSection = [System.Net.WebUtility]::HtmlDecode($bankSectionHtml)
    $expectedIntro = 'These are the things that I say to myself every morning. The more I say them, the more I believe them. I am becoming more and more myself every single day. If any of these resonate with you, I encourage you to use this list (or start your own!) and begin speaking love, beauty, and faith into your own life. I know this practice has radically changed the way I see the world and, I think, the way the world sees me. Life is beautiful!'
    if (-not $decodedBankSection.Contains($expectedIntro, [System.StringComparison]::Ordinal)) {
      $uxIssues.Add("$affirmationCollectionPath => expected the approved centered introduction copy")
    }

    $bankListMatch = [regex]::Match(
      $bankSectionHtml,
      '(?is)<ul\b[^>]*class=(?:"[^"]*\baffirmation-bank__list\b[^"]*"|''[^'']*\baffirmation-bank__list\b[^'']*''|[^\s>]*\baffirmation-bank__list\b[^\s>]*)[^>]*>(?<body>.*?)</ul>'
    )
    if (-not $bankListMatch.Success) {
      $uxIssues.Add("$affirmationCollectionPath => expected one semantic affirmation list")
    }
    else {
      $renderedAffirmationMatches = @(
        [regex]::Matches(
          $bankListMatch.Groups['body'].Value,
          '(?is)<li\b[^>]*class=(?:"[^"]*\baffirmation-bank__item\b[^"]*"|''[^'']*\baffirmation-bank__item\b[^'']*''|[^\s>]*\baffirmation-bank__item\b[^\s>]*)[^>]*>(?<value>.*?)</li>'
        )
      )
      $renderedAffirmations = @(
        $renderedAffirmationMatches |
          ForEach-Object { Convert-HtmlFragmentToText -Html $_.Groups['value'].Value }
      )

      if ($renderedAffirmations.Count -ne $canonicalAffirmations.Count) {
        $uxIssues.Add("$affirmationCollectionPath => expected $($canonicalAffirmations.Count) canonical affirmations, found $($renderedAffirmations.Count)")
      }
      else {
        for ($index = 0; $index -lt $canonicalAffirmations.Count; $index++) {
          if ($renderedAffirmations[$index] -cne $canonicalAffirmations[$index]) {
            $uxIssues.Add("$affirmationCollectionPath => affirmation $($index + 1) differs from canonical order/text")
            break
          }
        }
      }
    }
  }

  $startHereIndex = $affirmationCollectionHtml.IndexOf('collection-section__lead', [System.StringComparison]::Ordinal)
  $bankIndex = $affirmationCollectionHtml.IndexOf('id=the-words-we-say', [System.StringComparison]::Ordinal)
  $publishedIndex = $affirmationCollectionHtml.IndexOf('collection-published-reflections-title', [System.StringComparison]::Ordinal)
  $relatedIndex = $affirmationCollectionHtml.IndexOf('collection-section__related', [System.StringComparison]::Ordinal)
  if ($startHereIndex -lt 0 -or $bankIndex -le $startHereIndex -or $publishedIndex -le $bankIndex -or ($relatedIndex -ge 0 -and $relatedIndex -le $publishedIndex)) {
    $uxIssues.Add("$affirmationCollectionPath => expected Start Here, bank, Published Reflections, then Related Collections")
  }
}

$nonAffirmationCollectionPath = 'public/collections/musings/index.html'
if (-not $targetPageHtml.ContainsKey($nonAffirmationCollectionPath)) {
  $uxIssues.Add("Missing generated page required for affirmation-bank non-leak coverage: $nonAffirmationCollectionPath")
}
elseif ([string]$targetPageHtml[$nonAffirmationCollectionPath] -match 'id=(?:"the-words-we-say"|''the-words-we-say''|the-words-we-say)|affirmation-bank__list|the-words-we-say-title') {
  $uxIssues.Add("$nonAffirmationCollectionPath => target-only affirmation bank leaked into another collection")
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

$focusedSydHeroPages = [ordered]@{
  'bobanonymous' = 'essays/dialogues/bobanonymous/hero'
  'broke-rich' = 'essays/dialogues/broke-rich/hero'
  'infinite-incontent' = 'essays/dialogues/infinite-incontent/hero'
  'pressure-makes-pearls' = 'essays/dialogues/pressure-makes-pearls/hero'
}
foreach ($slug in $focusedSydHeroPages.Keys) {
  $relativePath = "public/syd-and-oliver/$slug/index.html"
  $fullPath = Join-Path $SiteDir ($relativePath.Substring('public/'.Length).Replace('/', [System.IO.Path]::DirectorySeparatorChar))
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    $legacyCleanupIssues.Add("$relativePath => focused-cleanup dialogue route is missing")
    continue
  }

  $html = Get-Content -LiteralPath $fullPath -Raw -Encoding utf8
  $assetId = [string]$focusedSydHeroPages[$slug]
  if ($html -notmatch ('data-oip-image-id=(?:"|'''')?' + [regex]::Escape($assetId) + '(?:"|'''')?')) {
    $legacyCleanupIssues.Add("$relativePath => expected managed Syd-and-Oliver hero $assetId")
  }
  if ($html -match '(?i)/images/syd-and-oliver/') {
    $legacyCleanupIssues.Add("$relativePath => retired Syd-and-Oliver source URL remains in HTML")
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

if ($appsPreviewIssues.Count -gt 0) {
  throw ("Found Apps & Tools public-preview regressions. Samples: {0}" -f (Format-SampleList -Items $appsPreviewIssues))
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
