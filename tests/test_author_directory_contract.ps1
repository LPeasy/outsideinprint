Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$authorIndexPath = Join-Path $repoRoot 'content/authors/_index.md'
$authorListPath = Join-Path $repoRoot 'layouts/authors/list.html'
$authorSectionPath = Join-Path $repoRoot 'layouts/authors/section.html'
$authorDirectoryPartialPath = Join-Path $repoRoot 'layouts/partials/authors/directory.html'

foreach ($requiredPath in @($authorIndexPath, $authorListPath, $authorSectionPath, $authorDirectoryPartialPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Missing author directory contract file: $requiredPath"
  }
}

$authorIndex = Get-Content -Path $authorIndexPath -Raw
foreach ($requiredPattern in @(
  'noindex:\s*true',
  'url:\s*"?/authors/"?',
  'type:\s*"?authors"?',
  'layout:\s*"?section"?',
  'outputs:\s*\[\s*"HTML"\s*\]'
)) {
  if ($authorIndex -notmatch $requiredPattern) {
    throw "Expected content/authors/_index.md to match '$requiredPattern'."
  }
}

if ($authorIndex -notmatch '(?s)^---\s+.*?---\s+\S') {
  throw 'Expected content/authors/_index.md to include body copy after front matter.'
}

$listTemplate = Get-Content -Path $authorListPath -Raw
$sectionTemplate = Get-Content -Path $authorSectionPath -Raw
foreach ($templatePath in @(
  @{ Path = 'layouts/authors/list.html'; Content = $listTemplate },
  @{ Path = 'layouts/authors/section.html'; Content = $sectionTemplate }
)) {
  if ($templatePath.Content -notmatch [regex]::Escape('partial "authors/directory.html" .')) {
    throw "Expected $($templatePath.Path) to delegate to layouts/partials/authors/directory.html."
  }
}

$directoryPartial = Get-Content -Path $authorDirectoryPartialPath -Raw
foreach ($requiredSnippet in @(
  'profile-page profile-page--authors',
  'authors-directory-title',
  'View author archive'
)) {
  if ($directoryPartial -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected layouts/partials/authors/directory.html to include '$requiredSnippet'."
  }
}

Write-Host 'Author directory contract test passed.'
$global:LASTEXITCODE = 0
exit 0
