Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$authorPagePath = Join-Path $repoRoot 'content/authors/robert-v-ussley/index.md'
$portraitPath = Join-Path $repoRoot 'content/authors/robert-v-ussley/Bobviously_Portrait_v1.png'
$layoutPath = Join-Path $repoRoot 'layouts/authors/dossier.html'
$buildDir = Join-Path $repoRoot '.tmp-test-robert-dossier'
$builtPagePath = Join-Path $buildDir 'authors/robert-v-ussley/index.html'
$localHugoPath = Join-Path $repoRoot '.tools/hugo/hugo.exe'
$hugoCommand = $null
$layoutTemplate = Get-Content -Path $layoutPath -Raw

foreach ($requiredPath in @($authorPagePath, $portraitPath, $layoutPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Missing Robert dossier contract file: $requiredPath"
  }
}

$hugoBinary = Get-Command hugo -ErrorAction SilentlyContinue
if ($hugoBinary) {
  $hugoCommand = $hugoBinary.Source
} elseif (Test-Path -LiteralPath $localHugoPath -PathType Leaf) {
  $hugoCommand = $localHugoPath
}

$authorPage = Get-Content -Path $authorPagePath -Raw
foreach ($requiredPattern in @(
  'layout:\s*"?dossier"?',
  'description:\s*".+?"',
  'portrait:\s*"?Bobviously_Portrait_v1\.png"?',
  'header_bio:\s*".+?"'
)) {
  if ($authorPage -notmatch $requiredPattern) {
    throw "Expected content/authors/robert-v-ussley/index.md to match '$requiredPattern'."
  }
}

foreach ($forbiddenPattern in @(
  'style_variant:\s*"?literary-dossier"?'
)) {
  if ($authorPage -match $forbiddenPattern) {
    throw "Expected content/authors/robert-v-ussley/index.md to omit '$forbiddenPattern'."
  }
}

foreach ($requiredSnippet in @(
  'class="author-route"',
  'section-front section-front--author',
  'author-route__profile',
  'author-route__summary',
  'author-route__bio',
  'Bobviously_Portrait_v1.png',
  'Reading Map',
  'journey-links--page author-route__journey',
  'Browse archive',
  'Browse collections',
  'Search the library',
  'About the imprint'
)) {
  if ($layoutTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/authors/dossier.html to include '$requiredSnippet'."
  }
}

foreach ($forbiddenSnippet in @(
  'Author Dossier',
  'Selected Works',
  'Themes',
  'From the Archive',
  'style-variant-literary-dossier',
  'author-dossier__'
)) {
  if ($layoutTemplate -match [regex]::Escape($forbiddenSnippet)) {
    throw "Expected layouts/authors/dossier.html to omit '$forbiddenSnippet'."
  }
}

if ($hugoCommand) {
  if (Test-Path -LiteralPath $buildDir) {
    Remove-Item -LiteralPath $buildDir -Recurse -Force
  }

  & $hugoCommand --quiet --destination $buildDir | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Hugo build failed while validating the Robert dossier page.'
  }

  if (-not (Test-Path -LiteralPath $builtPagePath -PathType Leaf)) {
    throw "Expected Hugo to render the Robert dossier page at $builtPagePath."
  }

  $builtPage = Get-Content -Path $builtPagePath -Raw
  foreach ($requiredSnippet in @(
    'Robert V. Ussley',
    'Bobviously_Portrait_v1.png',
    'Reading Map',
    'Browse archive',
    'Browse collections',
    'Search the library',
    'About the imprint',
    'journey-links--page author-route__journey'
  )) {
    if ($builtPage -notmatch [regex]::Escape($requiredSnippet)) {
      throw "Expected rendered Robert dossier page to include '$requiredSnippet'."
    }
  }

  foreach ($requiredPattern in @(
    'class=(?:"author-route"|author-route)',
    'class=(?:"author-route__profile"|author-route__profile)',
    'class=(?:"author-route__portrait"|author-route__portrait)',
    'class=(?:"author-route__summary"|author-route__summary)',
    'class=(?:"author-route__bio"|author-route__bio)',
    'class=(?:"author-route__reading-map"|author-route__reading-map)'
  )) {
    if ($builtPage -notmatch $requiredPattern) {
      throw "Expected rendered Robert dossier page to match '$requiredPattern'."
    }
  }

  foreach ($forbiddenSnippet in @(
    'Author Dossier',
    'Selected Works',
    'Themes',
    'From the Archive',
    'style-variant-literary-dossier',
    'author-dossier__'
  )) {
    if ($builtPage -match [regex]::Escape($forbiddenSnippet)) {
      throw "Expected rendered Robert dossier page to omit '$forbiddenSnippet'."
    }
  }
}

Write-Host 'Robert author dossier contract test passed.'
$global:LASTEXITCODE = 0
exit 0
