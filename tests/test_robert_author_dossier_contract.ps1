Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$authorPagePath = Join-Path $repoRoot 'content/authors/robert-v-ussley/index.md'
$portraitPath = Join-Path $repoRoot 'content/authors/robert-v-ussley/Bobviously_Portrait_v1.png'
$layoutPath = Join-Path $repoRoot 'layouts/authors/dossier.html'
$buildDir = Join-Path $repoRoot '.tmp-test-robert-dossier'
$builtPagePath = Join-Path $buildDir 'authors/robert-v-ussley/index.html'
$layoutTemplate = Get-Content -Path $layoutPath -Raw

. (Join-Path $PSScriptRoot 'helpers/public_output_common.ps1')
$hugo = Resolve-PinnedHugo -RepoRoot $repoRoot

foreach ($requiredPath in @($authorPagePath, $portraitPath, $layoutPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Missing Robert dossier contract file: $requiredPath"
  }
}

$authorPage = Get-Content -Path $authorPagePath -Raw
foreach ($requiredPattern in @(
  'layout:\s*"?dossier"?',
  'description:\s*".+?"',
  'portrait:\s*"?Bobviously_Portrait_v1\.png"?',
  'header_bio:\s*".+?"',
  'reader_note:\s*".+?"',
  'role_line:\s*"Author, designer, developer, and publisher of Outside In Print\."'
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
  'About the imprint',
  'author-route__role',
  'author-route__invitation',
  'author-route__actions',
  'these pieces are a few places to begin.',
  'href="#author-selected-title"',
  'href="#author-newsletter"',
  'partial "newsletter_signup.html"',
  '"sourceSlot" "author_newsletter"',
  '"anchorID" "author-newsletter"',
  'Visit the Bookstore'
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
  'author-dossier__',
  'author-route__books'
)) {
  if ($layoutTemplate -match [regex]::Escape($forbiddenSnippet)) {
    throw "Expected layouts/authors/dossier.html to omit '$forbiddenSnippet'."
  }
}

try {
  if (Test-Path -LiteralPath $buildDir) {
    Remove-Item -LiteralPath $buildDir -Recurse -Force
  }

  & $hugo.Command --quiet --panicOnWarning --destination $buildDir | Out-Null
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
    'Author, designer, developer, and publisher of Outside In Print.',
    'The American Nightmare: Keep Dreaming, Kid',
    'The Parable of the Sheep',
    'The Water Cycle: Risk, Infrastructure, and Public Memory',
    'Visit the Bookstore',
    'journey-links--page author-route__journey'
  )) {
    if ($builtPage -notmatch [regex]::Escape($requiredSnippet)) {
      throw "Expected rendered Robert dossier page to include '$requiredSnippet'."
    }
  }

  foreach ($requiredPattern in @(
    'href=(?:"#author-selected-title"|#author-selected-title)',
    'href=(?:"#author-newsletter"|#author-newsletter)',
    '(?s)<section[^>]*id=(?:"author-newsletter"|author-newsletter)[^>]*>.*?<form[^>]*action=(?:"https://buttondown\.com/api/emails/embed-subscribe/[^"]+"|https://buttondown\.com/api/emails/embed-subscribe/[^\s>]+)[^>]*data-analytics-event=(?:"newsletter_submit"|newsletter_submit)[^>]*data-analytics-source-slot=(?:"author_newsletter"|author_newsletter)',
    'class=(?:"author-route"|author-route)',
    'class=(?:"author-route__profile"|author-route__profile)',
    'class=(?:"author-route__portrait"|author-route__portrait)',
    'class=(?:"author-route__summary"|author-route__summary)',
    'class=(?:"author-route__bio"|author-route__bio)',
    'class=(?:"[^"]*\bauthor-route__reading-map\b[^"]*"|[^\s>]*author-route__reading-map[^\s>]*)'
  )) {
    if ($builtPage -notmatch $requiredPattern) {
      throw "Expected rendered Robert dossier page to match '$requiredPattern'."
    }
  }

  $sectionOrder = [regex]::Matches($builtPage, '\bid=(?:"(author-selected-title|author-newsletter|author-recent-title|author-books-title)"|(author-selected-title|author-newsletter|author-recent-title|author-books-title)(?=[\s>]))') | ForEach-Object {
    if ($_.Groups[1].Success) { $_.Groups[1].Value } else { $_.Groups[2].Value }
  }
  if (($sectionOrder -join ',') -cne 'author-selected-title,author-newsletter,author-recent-title,author-books-title') {
    throw 'Expected Selected Writing, Newsletter, Recent Writing, then Books exactly once in the rendered author page.'
  }

  $workPaths = @()
  foreach ($slot in @('author_selected', 'author_recent')) {
    $links = [regex]::Matches($builtPage, ('<a\b[^>]*data-analytics-source-slot=(?:"' + $slot + '"|' + $slot + '(?=[\s>]))[^>]*>'))
    if ($links.Count -ne 6) {
      throw "Expected six rendered $slot writing links; found $($links.Count)."
    }
    foreach ($link in $links) {
      $href = [regex]::Match($link.Value, '\bhref=(?:"([^"]+)"|([^\s>]+))')
      $workPaths += if ($href.Groups[1].Success) { $href.Groups[1].Value } else { $href.Groups[2].Value }
    }
  }
  if (@($workPaths | Select-Object -Unique).Count -ne 12) {
    throw 'Expected selected and recent writing destinations to remain duplicate-free.'
  }
  if ($workPaths[3] -cne '/syd-and-oliver/what-i-had/') {
    throw 'Expected What I Had in the fourth selected slot, using its canonical dialogue URL.'
  }
  $selectedSection = [regex]::Match($builtPage, '(?s)<section[^>]*aria-labelledby=(?:"author-selected-title"|author-selected-title)[^>]*>(.*?)</section>').Value
  if ($selectedSection -notmatch 'Dialogue' -or $selectedSection -match '/essays/synthetic-reasoning/') {
    throw 'Selected Writing must demonstrate dialogue work in place of Synthetic Reasoning.'
  }

  $booksSection = [regex]::Match($builtPage, '(?s)<section[^>]*aria-labelledby=(?:"author-books-title"|author-books-title)[^>]*>(.*?)</section>').Value
  $bookLinks = [regex]::Matches($booksSection, '<a\b[^>]*href=(?:"(?:https://outsideinprint\.org)?/shop/[^"]+/"|(?:https://outsideinprint\.org)?/shop/[^\s>]+/)[^>]*>')
  if ($bookLinks.Count -ne 4) {
    throw "Expected all four books in the author page; found $($bookLinks.Count)."
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
finally {
  if (Test-Path -LiteralPath $buildDir) {
    Remove-Item -LiteralPath $buildDir -Recurse -Force
  }
}

Write-Host 'Robert author dossier contract test passed.'
$global:LASTEXITCODE = 0
exit 0
