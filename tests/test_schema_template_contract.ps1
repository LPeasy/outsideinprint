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

$authorsData = Get-Content -Path (Join-Path $repoRoot 'data/authors.yaml') -Raw
if ($authorsData -notmatch 'Outside In Print Editorial') {
  throw 'Expected data/authors.yaml to define the editorial fallback author.'
}

$routeHelper = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/metadata/route.html') -Raw
if ($routeHelper -notmatch '"social_type"') {
  throw 'Expected WS-01 route helper to remain available for schema routing.'
}

Write-Host 'Schema template contract test passed.'
$global:LASTEXITCODE = 0
exit 0
