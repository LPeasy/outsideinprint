Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$authorPagePath = Join-Path $repoRoot 'content/authors/robert-v-ussley/index.md'
$portraitPath = Join-Path $repoRoot 'content/authors/robert-v-ussley/Bobviously_Portrait_v1.jpg'
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
  'style_variant:\s*"?literary-dossier"?',
  'portrait:\s*"?Bobviously_Portrait_v1\.jpg"?',
  'header_bio:\s*".+?"'
)) {
  if ($authorPage -notmatch $requiredPattern) {
    throw "Expected content/authors/robert-v-ussley/index.md to match '$requiredPattern'."
  }
}

foreach ($requiredSnippet in @(
  'Selected Works',
  'Themes',
  'From the Archive',
  'Bobviously_Portrait_v1.jpg',
  'Author Dossier'
)) {
  if ($layoutTemplate -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/authors/dossier.html to include '$requiredSnippet'."
  }
}

foreach ($forbiddenSnippet in @(
  'Author Overview',
  'Recent Essays',
  'Essay Archive',
  'author-overview-title',
  'author-recent-title',
  'author-collections-title',
  'journey-links--page'
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
    'Selected Works',
    'Themes',
    'From the Archive',
    'Bobviously_Portrait_v1.jpg',
    'Author Dossier'
  )) {
    if ($builtPage -notmatch [regex]::Escape($requiredSnippet)) {
      throw "Expected rendered Robert dossier page to include '$requiredSnippet'."
    }
  }

  foreach ($forbiddenSnippet in @(
    'Author Overview',
    'Recent Essays',
    'Essay Archive',
    'author-overview-title',
    'author-recent-title',
    'author-collections-title',
    'journey-links--page'
  )) {
    if ($builtPage -match [regex]::Escape($forbiddenSnippet)) {
      throw "Expected rendered Robert dossier page to omit '$forbiddenSnippet'."
    }
  }
}

Write-Host 'Robert author dossier contract test passed.'
$global:LASTEXITCODE = 0
exit 0
