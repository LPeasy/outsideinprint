Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

$requiredFiles = @(
  'data/organization.yaml',
  'data/authors.yaml',
  'layouts/partials/schema.html',
  'layouts/partials/schema/organization.html',
  'layouts/partials/schema/website.html',
  'layouts/partials/schema/image.html',
  'layouts/partials/schema/resolve-author.html',
  'layouts/partials/schema/breadcrumbs.html',
  'layouts/partials/schema/significant-links.html',
  'layouts/partials/schema/webpage.html',
  'layouts/partials/schema/creative-work.html'
)

foreach ($relativePath in $requiredFiles) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing required schema file: $relativePath"
  }
}

$schemaPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema.html') -Raw
if ($schemaPartial -notmatch 'application/ld\+json') {
  throw 'Expected layouts/partials/schema.html to emit application/ld+json.'
}

if ($schemaPartial -match '<meta\s+itemprop=') {
  throw 'Expected layouts/partials/schema.html to stop emitting legacy itemprop meta tags.'
}

foreach ($requiredHelper in @(
  'partial "schema/organization.html"',
  'partial "schema/website.html"',
  'partial "schema/image.html"',
  'partial "schema/breadcrumbs.html"',
  'partial "schema/resolve-author.html"',
  'partial "schema/creative-work.html"'
)) {
  if ($schemaPartial -notmatch [regex]::Escape($requiredHelper)) {
    throw "Expected schema partial to reference helper: $requiredHelper"
  }
}

$webpageHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/webpage.html') -Raw
if ($webpageHelper -notmatch [regex]::Escape('partial "schema/significant-links.html"')) {
  throw 'Expected schema/webpage.html to consume the discovery significant-links helper.'
}

$organizationData = Get-Content -Path (Join-Path $repoRoot 'data/organization.yaml') -Raw
if ($organizationData -notmatch 'name:\s*Outside In Print') {
  throw 'Expected data/organization.yaml to define the Outside In Print organization.'
}

if ($organizationData -notmatch 'default_author_id:\s*robert-v-ussley') {
  throw 'Expected data/organization.yaml to default published authorship to robert-v-ussley.'
}

$authorsData = Get-Content -Path (Join-Path $repoRoot 'data/authors.yaml') -Raw
if ($authorsData -notmatch 'Outside In Print Editorial') {
  throw 'Expected data/authors.yaml to define the editorial fallback author.'
}

if ($authorsData -notmatch 'Robert V\. Ussley') {
  throw 'Expected data/authors.yaml to define Robert V. Ussley as a canonical author entity.'
}

$routeHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/metadata/route.html') -Raw
if ($routeHelper -notmatch '"social_type"') {
  throw 'Expected WS-01 route helper to remain available for schema routing.'
}

if ($routeHelper -notmatch [regex]::Escape('eq $relPermalink "/about/"')) {
  throw 'Expected the route helper to classify /about/ explicitly for schema routing.'
}

if ($routeHelper -notmatch '\^/authors/\[\^/\]\+/\$') {
  throw 'Expected the route helper to classify author profile URLs explicitly for schema routing.'
}

$websiteHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/website.html') -Raw
if ($websiteHelper -notmatch 'SearchAction') {
  throw 'Expected schema/website.html to emit SearchAction metadata for the library route.'
}

$webpageHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/webpage.html') -Raw
foreach ($pageType in @('AboutPage', 'ProfilePage')) {
  if ($webpageHelper -notmatch $pageType) {
    throw "Expected schema/webpage.html to support $pageType."
  }
}

$breadcrumbHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/schema/breadcrumbs.html') -Raw
foreach ($routeName in @('"about"', '"author"')) {
  if ($breadcrumbHelper -notmatch [regex]::Escape($routeName)) {
    throw "Expected schema/breadcrumbs.html to support route $routeName."
  }
}

$schemaReturnFiles = @(
  'layouts/partials/schema/breadcrumbs.html',
  'layouts/partials/schema/creative-work.html',
  'layouts/partials/schema/image.html',
  'layouts/partials/schema/organization.html',
  'layouts/partials/schema/resolve-author.html',
  'layouts/partials/schema/significant-links.html',
  'layouts/partials/schema/webpage.html',
  'layouts/partials/schema/website.html'
)

foreach ($relativePath in $schemaReturnFiles) {
  $content = Get-Content -Path (Join-Path $repoRoot $relativePath) -Raw
  $returnMatches = @([regex]::Matches($content, '\{\{[-\s]*return(?:\s+[^}]*)?\}\}'))
  if ($returnMatches.Count -gt 1) {
    throw "Expected $relativePath to contain at most one template return statement."
  }
}

Write-Host 'Schema template contract test passed.'
$global:LASTEXITCODE = 0
exit 0
