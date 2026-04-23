param(
  [string]$BaseUrl = 'https://outsideinprint.org'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Match {
  param(
    [string]$Content,
    [string]$Pattern,
    [string]$Message
  )

  if ($Content -notmatch $Pattern) {
    throw $Message
  }
}

function Assert-Canonical {
  param(
    [string]$Content,
    [string]$ExpectedUrl,
    [string]$Message
  )

  $pattern = '<link\s+rel=(?:"canonical"|canonical)\s+href=(?:"' + [regex]::Escape($ExpectedUrl) + '"|' + [regex]::Escape($ExpectedUrl) + ')'
  Assert-Match -Content $Content -Pattern $pattern -Message $Message
}

function Assert-Robots {
  param(
    [string]$Content,
    [string]$ExpectedRobots,
    [string]$Message
  )

  $pattern = '<meta\s+name=(?:"robots"|robots)\s+content=(?:"' + [regex]::Escape($ExpectedRobots) + '"|' + [regex]::Escape($ExpectedRobots) + ')'
  Assert-Match -Content $Content -Pattern $pattern -Message $Message
}

function Get-Page {
  param([string]$Path)

  $uri = ([System.Uri]::new([System.Uri]$BaseUrl, $Path)).AbsoluteUri
  return (Invoke-WebRequest -Uri $uri -MaximumRedirection 5).Content
}

$homePage = Get-Page '/'
Assert-Canonical -Content $homePage -ExpectedUrl 'https://outsideinprint.org/' -Message 'Expected the homepage canonical URL to point to outsideinprint.org.'
Assert-Robots -Content $homePage -ExpectedRobots 'index, follow, max-image-preview:large' -Message 'Expected the homepage robots policy to allow indexation with large image previews.'
Assert-Match -Content $homePage -Pattern 'SearchAction' -Message 'Expected the homepage WebSite schema to expose SearchAction.'
Assert-Match -Content $homePage -Pattern '/library/\?q=\{search_term_string\}' -Message 'Expected SearchAction to target the library query route.'
Assert-Match -Content $homePage -Pattern '<meta\s+property=(?:"og:image"|og:image)\s+content=' -Message 'Expected the homepage to emit og:image.'
Assert-Match -Content $homePage -Pattern '<meta\s+name=(?:"twitter:image"|twitter:image)\s+content=' -Message 'Expected the homepage to emit twitter:image.'
Assert-Match -Content $homePage -Pattern '<link\b[^>]*rel=(?:"alternate"|alternate)[^>]*type=(?:"application/rss\+xml"|application/rss\+xml)[^>]*href=(?:"https://outsideinprint\.org/index\.xml"|https://outsideinprint\.org/index\.xml)' -Message 'Expected the homepage to expose RSS autodiscovery.'
Assert-Match -Content $homePage -Pattern 'lpeasy\.github\.io' -Message 'Expected the homepage to include the legacy GitHub Pages host redirect guard.'
Assert-Match -Content $homePage -Pattern '/outsideinprint' -Message 'Expected the homepage to include the legacy /outsideinprint prefix guard.'
Assert-Match -Content $homePage -Pattern 'window\.location\.hostname\s*!==' -Message 'Expected the legacy redirect script not to redirect canonical-host pages.'
Assert-Match -Content $homePage -Pattern 'window\.location\.replace\(' -Message 'Expected the legacy redirect script to forward legacy project paths.'
Assert-Match -Content $homePage -Pattern 'window\.location\.search' -Message 'Expected the legacy redirect script to preserve query strings.'
Assert-Match -Content $homePage -Pattern 'window\.location\.hash' -Message 'Expected the legacy redirect script to preserve hash fragments.'

$essay = Get-Page '/essays/the-risk-management-buffet/'
Assert-Canonical -Content $essay -ExpectedUrl 'https://outsideinprint.org/essays/the-risk-management-buffet/' -Message 'Expected essay pages to emit canonical URLs on outsideinprint.org.'
Assert-Robots -Content $essay -ExpectedRobots 'index, follow, max-image-preview:large' -Message 'Expected essay pages to allow indexation with large image previews.'
Assert-Match -Content $essay -Pattern '<meta\s+name=(?:"author"|author)\s+content=(?:"Robert V\. Ussley"|Robert V\. Ussley)' -Message 'Expected essay pages to emit meta author tags for Robert V. Ussley.'
Assert-Match -Content $essay -Pattern '"@type":"Article"' -Message 'Expected essay pages to expose Article JSON-LD.'
Assert-Match -Content $essay -Pattern 'Robert V\. Ussley' -Message 'Expected essay pages to expose the Robert V. Ussley author entity.'
Assert-Match -Content $essay -Pattern '<meta\s+property=(?:"og:image"|og:image)\s+content=' -Message 'Expected essay pages to emit og:image.'
Assert-Match -Content $essay -Pattern '<meta\s+name=(?:"twitter:image"|twitter:image)\s+content=' -Message 'Expected essay pages to emit twitter:image.'
Assert-Match -Content $essay -Pattern '<link\b[^>]*rel=(?:"alternate"|alternate)[^>]*type=(?:"application/rss\+xml"|application/rss\+xml)[^>]*href=(?:"https://outsideinprint\.org/index\.xml"|https://outsideinprint\.org/index\.xml)' -Message 'Expected essay pages to expose site RSS autodiscovery.'

$author = Get-Page '/authors/robert-v-ussley/'
Assert-Canonical -Content $author -ExpectedUrl 'https://outsideinprint.org/authors/robert-v-ussley/' -Message 'Expected the author page canonical URL to point to outsideinprint.org.'
Assert-Robots -Content $author -ExpectedRobots 'index, follow, max-image-preview:large' -Message 'Expected the author page to allow indexation with large image previews.'
Assert-Match -Content $author -Pattern '"@type":"ProfilePage"' -Message 'Expected the author page to expose ProfilePage JSON-LD.'
Assert-Match -Content $author -Pattern 'Browse archive' -Message 'Expected the author page to expose the route-based reading map.'
Assert-Match -Content $author -Pattern '<meta\s+property=(?:"og:image"|og:image)\s+content=' -Message 'Expected the author page to emit og:image.'
Assert-Match -Content $author -Pattern '"@type":"Person".*"image"' -Message 'Expected the author page Person entity to include an image.'

$about = Get-Page '/about/'
Assert-Canonical -Content $about -ExpectedUrl 'https://outsideinprint.org/about/' -Message 'Expected the about page canonical URL to point to outsideinprint.org.'
Assert-Robots -Content $about -ExpectedRobots 'index, follow, max-image-preview:large' -Message 'Expected the about page to allow indexation with large image previews.'
Assert-Match -Content $about -Pattern '"@type":"AboutPage"' -Message 'Expected the about page to expose AboutPage JSON-LD.'
Assert-Match -Content $about -Pattern 'Author and Publisher' -Message 'Expected the about page to explain the author/publisher relationship.'
Assert-Match -Content $about -Pattern '<meta\s+property=(?:"og:image"|og:image)\s+content=' -Message 'Expected the about page to emit og:image.'
Assert-Match -Content $about -Pattern '<link\b[^>]*rel=(?:"alternate"|alternate)[^>]*type=(?:"application/rss\+xml"|application/rss\+xml)[^>]*href=(?:"https://outsideinprint\.org/index\.xml"|https://outsideinprint\.org/index\.xml)' -Message 'Expected the about page to expose site RSS autodiscovery.'

$collection = Get-Page '/collections/risk-uncertainty/'
Assert-Canonical -Content $collection -ExpectedUrl 'https://outsideinprint.org/collections/risk-uncertainty/' -Message 'Expected collection pages to emit canonical URLs on outsideinprint.org.'
Assert-Robots -Content $collection -ExpectedRobots 'index, follow, max-image-preview:large' -Message 'Expected collection pages to allow indexation with large image previews.'
Assert-Match -Content $collection -Pattern '"@type":"CollectionPage"' -Message 'Expected public collection pages to expose CollectionPage JSON-LD.'
Assert-Match -Content $collection -Pattern '<meta\s+property=(?:"og:image"|og:image)\s+content=' -Message 'Expected public collection pages to emit og:image.'
Assert-Match -Content $collection -Pattern '<link\b[^>]*rel=(?:"alternate"|alternate)[^>]*type=(?:"application/rss\+xml"|application/rss\+xml)[^>]*href=(?:"https://outsideinprint\.org/index\.xml"|https://outsideinprint\.org/index\.xml)' -Message 'Expected collection pages to expose site RSS autodiscovery.'

$random = Get-Page '/random/'
Assert-Match -Content $random -Pattern '<meta\s+name=(?:"robots"|robots)\s+content=(?:"noindex, follow"|noindex,\s*follow)' -Message 'Expected the random route to stay noindex, follow.'

$llms = Get-Page '/llms.txt'
Assert-Match -Content $llms -Pattern 'https://outsideinprint\.org/' -Message 'Expected llms.txt to expose canonical site URLs.'

$notFound = Get-Page '/404.html'
Assert-Match -Content $notFound -Pattern '<meta\s+name=(?:"robots"|robots)\s+content=(?:"noindex, follow"|noindex,\s*follow)' -Message 'Expected the 404 page to stay noindex, follow.'
Assert-Match -Content $notFound -Pattern 'lpeasy\.github\.io' -Message 'Expected the 404 page to include the legacy GitHub Pages host redirect guard.'
Assert-Match -Content $notFound -Pattern 'window\.location\.replace\(' -Message 'Expected the 404 page to redirect legacy project paths to canonical equivalents.'
Assert-Match -Content $notFound -Pattern 'window\.location\.search' -Message 'Expected the 404 page to preserve query strings.'
Assert-Match -Content $notFound -Pattern 'window\.location\.hash' -Message 'Expected the 404 page to preserve hash fragments.'

Write-Host 'Live SEO smoke test passed.'
$global:LASTEXITCODE = 0
exit 0
