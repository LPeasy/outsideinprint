Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

$requiredFiles = @(
  'layouts/partials/render_article_body.html',
  'layouts/partials/article/repair_mojibake.html',
  'layouts/_default/_markup/render-image.html',
  'assets/css/main.css'
)

foreach ($relativePath in $requiredFiles) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing required legacy-rendering file: $relativePath"
  }
}

$renderArticleBody = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/render_article_body.html') -Raw
$repairMojibake = Get-Content -Path (Join-Path $repoRoot 'layouts/partials/article/repair_mojibake.html') -Raw
$renderImage = Get-Content -Path (Join-Path $repoRoot 'layouts/_default/_markup/render-image.html') -Raw
$mainCss = Get-Content -Path (Join-Path $repoRoot 'assets/css/main.css') -Raw

foreach ($requiredSnippet in @(
  'partial "article/repair_mojibake.html"',
  'replace $content "<!-- raw HTML omitted -->" ""',
  'class="article-embed"',
  'Embedded media omitted.',
  '<figure[^>]*>\s*\[Embedded media:',
  '<ul>\s*<li>\s*(<a[^>]+>Embedded media</a>)\s*</li>\s*</ul>'
)) {
  if ($renderArticleBody -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected render_article_body.html to contain cleanup logic for: $requiredSnippet"
  }
}

foreach ($requiredEntity in @('&#8217;','&#8220;','&#8221;','&#8212;','&#8230;','&#8594;','&#233;','&#241;','&#174;')) {
  if ($repairMojibake -notmatch [regex]::Escape($requiredEntity)) {
    throw "Expected repair_mojibake.html to emit the repaired entity: $requiredEntity"
  }
}

if ($repairMojibake -notmatch 'return \$content') {
  throw 'Expected repair_mojibake.html to return the normalized HTML string.'
}

$repairRuleCount = ([regex]::Matches($repairMojibake, '\(dict "from" ')).Count
if ($repairRuleCount -lt 10) {
  throw 'Expected repair_mojibake.html to define a substantial set of targeted replacement rules.'
}

foreach ($requiredSnippet in @(
  'class="article-figure"',
  'class="article-source-caption"',
  '<figcaption'
)) {
  if ($renderImage -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected render-image.html to preserve imported figure/caption semantics: $requiredSnippet"
  }
}

foreach ($requiredSnippet in @(
  '.piece-body .article-embed',
  'article-embed__label',
  '.piece-body .article-embed__link',
  '.piece-body .article-embed__caption'
)) {
  if ($mainCss -notmatch [regex]::Escape($requiredSnippet)) {
    throw "Expected main.css to style the legacy embedded-media cleanup component: $requiredSnippet"
  }
}

Write-Host 'Legacy render contract test passed.'
$global:LASTEXITCODE = 0
exit 0
