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

function Get-Page {
  param([string]$Path)

  $uri = ([System.Uri]::new([System.Uri]$BaseUrl, $Path)).AbsoluteUri
  return (Invoke-WebRequest -Uri $uri -MaximumRedirection 5).Content
}

$home = Get-Page '/'
Assert-Match -Content $home -Pattern 'SearchAction' -Message 'Expected the homepage WebSite schema to expose SearchAction.'
Assert-Match -Content $home -Pattern '/library/\?q=\{search_term_string\}' -Message 'Expected SearchAction to target the library query route.'

$essay = Get-Page '/essays/the-risk-management-buffet/'
Assert-Match -Content $essay -Pattern '<meta\s+name="author"\s+content="Robert V\. Ussley"' -Message 'Expected essay pages to emit meta author tags for Robert V. Ussley.'
Assert-Match -Content $essay -Pattern '"@type":"Article"' -Message 'Expected essay pages to expose Article JSON-LD.'
Assert-Match -Content $essay -Pattern 'Robert V\. Ussley' -Message 'Expected essay pages to expose the Robert V. Ussley author entity.'

$author = Get-Page '/authors/robert-v-ussley/'
Assert-Match -Content $author -Pattern '"@type":"ProfilePage"' -Message 'Expected the author page to expose ProfilePage JSON-LD.'
Assert-Match -Content $author -Pattern 'Essay Archive' -Message 'Expected the author page to expose the essay archive.'

$about = Get-Page '/about/'
Assert-Match -Content $about -Pattern '"@type":"AboutPage"' -Message 'Expected the about page to expose AboutPage JSON-LD.'
Assert-Match -Content $about -Pattern 'Author and Publisher' -Message 'Expected the about page to explain the author/publisher relationship.'

$collection = Get-Page '/collections/risk-uncertainty/'
Assert-Match -Content $collection -Pattern '"@type":"CollectionPage"' -Message 'Expected public collection pages to expose CollectionPage JSON-LD.'

$random = Get-Page '/random/'
Assert-Match -Content $random -Pattern '<meta\s+name="robots"\s+content="noindex, follow"' -Message 'Expected the random route to stay noindex, follow.'

Write-Host 'Live SEO smoke test passed.'
$global:LASTEXITCODE = 0
exit 0
