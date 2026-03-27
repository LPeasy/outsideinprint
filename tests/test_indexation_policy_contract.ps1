Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

$requiredFiles = @(
  'layouts/partials/metadata/policy.html',
  'layouts/sitemap.xml',
  'layouts/robots.txt'
)

foreach ($relativePath in $requiredFiles) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing required indexation-policy file: $relativePath"
  }
}

$policyPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/metadata/policy.html') -Raw
foreach ($requiredSnippet in @(
  'partial "metadata/route.html"',
  'eq $route.name "utility"',
  'eq $route.name "section-list"',
  'slice "noindex" "follow"',
  '"in_sitemap"'
)) {
  if ($policyPartial -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected metadata/policy.html to contain: $requiredSnippet"
  }
}

$pageMetaPartial = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/metadata/page.html') -Raw
if ($pageMetaPartial -notmatch [regex]::Escape('partial "metadata/policy.html"')) {
  throw 'Expected metadata/page.html to delegate route policy to metadata/policy.html.'
}

if ($pageMetaPartial -notmatch '"policy"\s+\$policy') {
  throw 'Expected metadata/page.html to expose the resolved policy dictionary.'
}

if ($pageMetaPartial -notmatch '"robots"\s+\$policy\.robots') {
  throw 'Expected metadata/page.html to source robots directives from the shared policy helper.'
}

$baseTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/_default/baseof.html') -Raw
if ($baseTemplate -notmatch '<meta name="robots" content="\{\{ delimit \. ", " \}\}" />') {
  throw 'Expected baseof.html to keep emitting route-aware robots meta tags from $meta.robots.'
}

$robotsTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/robots.txt') -Raw
foreach ($requiredLine in @('User-agent: *', 'Allow: /', 'Sitemap: {{ "sitemap.xml" | absURL }}')) {
  if ($robotsTemplate -notmatch [regex]::Escape($requiredLine)) {
    throw "Expected layouts/robots.txt to include: $requiredLine"
  }
}

$sitemapTemplate = Get-Content -Path (Join-Path $repoRoot 'layouts/sitemap.xml') -Raw
foreach ($requiredSnippet in @(
  'where site.Pages "Kind" "in" (slice "home" "page" "section")',
  'partial "metadata/policy.html" .',
  '$policy.in_sitemap',
  '<loc>{{ .Permalink }}</loc>'
)) {
  if ($sitemapTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/sitemap.xml to contain: $requiredSnippet"
  }
}

$workflow = Get-Content -Path (Join-Path $repoRoot '.github/workflows/deploy.yml') -Raw
if ($workflow -notmatch '\.\/tests\/test_indexation_policy_contract\.ps1') {
  throw 'Expected deploy.yml to run the indexation policy contract test.'
}

Write-Host 'Indexation policy contract test passed.'
$global:LASTEXITCODE = 0
exit 0
