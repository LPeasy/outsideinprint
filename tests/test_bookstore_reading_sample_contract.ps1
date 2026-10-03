#requires -Version 7.0
[CmdletBinding()]
param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public'),
  [switch]$SourceOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-RequiredText {
  param([Parameter(Mandatory)][string]$RelativePath)

  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing bookstore reading-sample file: $RelativePath"
  }
  Get-Content -LiteralPath $path -Raw -Encoding utf8
}

function Assert-Contains {
  param(
    [Parameter(Mandatory)][string]$Text,
    [Parameter(Mandatory)][string]$Expected,
    [Parameter(Mandatory)][string]$Context
  )

  if (-not $Text.Contains($Expected, [StringComparison]::Ordinal)) {
   …6422 tokens truncated…h ($key in @('asset', 'alt', 'caption')) {
    if ([string]$parameters[$key] -cne [string]$expected[$key]) {
      throw "Water Cycle $id $key differs from the published R2 figure metadata."
    }
  }
  if (-not $manifest.assets.Contains([string]$expected.asset)) {
    throw "Water Cycle $id managed asset is missing."
  }
  $asset = $manifest.assets[[string]$expected.asset]
  if ([string]$asset.review_state -cne 'approved' -or [string]$asset.processing_state -cne 'derivative_capable') {
    throw "Water Cycle $id managed asset must be approved and derivative-capable."
  }
  if ([int]$asset.width -ne [int]$expected.width -or [int]$asset.height -ne [int]$expected.height) {
    throw "Water Cycle $id managed asset dimensions differ from the published R2 figure."
  }
  if ([string]$manifest.aliases[[string]$expected.alias] -cne [string]$expected.asset) {
    throw "Water Cycle $id must retain exactly one stable resolver alias."
  }
  $seenFigureIds.Add($id)
}
if (($seenFigureIds -join '|') -cne 'V01|V02|V03') {
  throw "Water Cycle figures must remain ordered V01, V02, V03; found $($seenFigureIds -join ', ')."
}

foreach ($spec in $sampleSpecs | Where-Object { $_.Slug -ne 'the-water-cycle' }) {
  $document = $documents[$spec.Slug]
  if ($document.Body -match '\{\{[<%]\s*sample-figure\b') {
    throw "$($spec.Slug) must not contain a reading-sample figure."
  }
}
$shortcodeNames = @(
  $documents.Values |
    ForEach-Object { [regex]::Matches($_.Body, '\{\{[<%]\s*(?<name>[A-Za-z0-9_-]+)') } |
    ForEach-Object { $_.Groups['name'].Value } |
    Sort-Object -Unique
)
if (($shortcodeNames -join '|') -cne 'sample-figure') {
  throw "Reading samples may use only sample-figure; found $($shortcodeNames -join ', ')."
}

$review = Get-RequiredText -RelativePath 'reports/bookstore-reading-sample-visual-review.json' | ConvertFrom-Json -AsHashtable
if (
  [string]$review.status -cne 'pass' -or
  [string]$review.scope -cne 'reading-sample responsive figures' -or
  [string]$review.source_revision -cne 'published-r2'
) {
  throw 'Water Cycle figure visual-review evidence is missing its responsive published-R2 PASS.'
}
if (@($review.methods) -cnotcontains 'responsive browser inspection at 1440x1000 and 390x844') {
  throw 'Water Cycle figure visual-review evidence is missing responsive desktop/mobile inspection.'
}
$reviewIds = @($review.assets | ForEach-Object { [string]$_.id })
if (($reviewIds -join '|') -cne (@($expectedFigures.Values | ForEach-Object { [string]$_.asset }) -join '|')) {
  throw 'Water Cycle visual-review evidence does not cover exactly V01-V03.'
}
for ($index = 0; $index -lt $seenFigureIds.Count; $index++) {
  $id = $seenFigureIds[$index]
  $expected = $expectedFigures[$id]
  $manifestAsset = $manifest.assets[[string]$expected.asset]
  $reviewAsset = @($review.assets)[$index]
  if (
    [string]$reviewAsset.source_revision -cne 'published-r2' -or
    [string]$reviewAsset.result -cne 'pass' -or
    [string]$reviewAsset.responsive_result -cne 'pass'
  ) {
    throw "Water Cycle $id visual-review result is not bound to a responsive published-R2 PASS."
  }
  if (
    [int]$reviewAsset.width -ne [int]$expected.width -or
    [int]$reviewAsset.height -ne [int]$expected.height
  ) {
    throw "Water Cycle $id visual-review dimensions differ from the published R2 figure."
  }
  if ([string]$reviewAsset.source_sha256 -cne [string]$manifestAsset.sha256) {
    throw "Water Cycle $id visual-review evidence is not bound to the managed source bytes."
  }
  $sourcePath = Join-Path $repoRoot ('assets/' + [string]$manifestAsset.source)
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Water Cycle $id managed source file is missing."
  }
  if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne [string]$manifestAsset.sha256) {
    throw "Water Cycle $id managed source bytes differ from the reviewed figure."
  }
}

$resolver = Get-RequiredText -RelativePath 'layouts/partials/shop/resolve-reading-sample.html'
foreach ($required in @(
  '.Resources.GetMatch "sample.md"',
  'eq $state "ready"',
  'eq $state "local_draft"',
  'if .Draft',
  'if not .Draft',
  'if hugo.IsServer',
  'return $sample'
)) {
  Assert-Contains -Text $resolver -Expected $required -Context 'Reading-sample resolver'
}
Assert-Ordered -Text $resolver -First 'eq $state "ready"' -Second 'eq $state "local_draft"' -Context 'Reading-sample state precedence'
if ($resolver -match '(?i)buildDrafts|sample\.RelPermalink') {
  throw 'Reading-sample resolver must not use a broad draft bypass or expose a sample route.'
}

$sampleLink = Get-RequiredText -RelativePath 'layouts/partials/shop/sample-link.html'
foreach ($required in @(
  'partial "shop/resolve-reading-sample.html"',
  '#reading-sample',
  'data-analytics-event="book_sample_open"',
  'data-analytics-source-slot="{{ $sourceSlot }}"',
  'Read a sample'
)) {
  Assert-Contains -Text $sampleLink -Expected $required -Context 'Reading-sample link'
}
if ($sampleLink -match '(?i)sample\.RelPermalink|href\s*=\s*["''][^"'']*/sample(?:/|\.|["''])') {
  throw 'Reading-sample links must target the product-page fragment, never a sample route.'
}

$renderer = Get-RequiredText -RelativePath 'layouts/partials/shop/reading-sample.html'
foreach ($required in @(
  'id="reading-sample"',
  'aria-labelledby="reading-sample-title"',
  '{{ .Content }}',
  'End of sample',
  'where $epubOffers "availability_status" "live"',
  'href="#bookstore-purchase"',
  'data-analytics-source-slot="bookstore_sample_buy"',
  'href="#page-title"',
  'Return to the book',
  'partial "shop/kindle-button.html"',
  '"sourceSlot" "bookstore_sample_kindle"'
)) {
  Assert-Contains -Text $renderer -Expected $required -Context 'Expanded reading-sample renderer'
}
if ($renderer -match '(?i)<details\b|<dialog\b|<form\b|data-epub-checkout|shop/direct-offers\.html|modal|download=|sample\.RelPermalink') {
  throw 'Reading sample must stay expanded on the product page without modal, download, or separate-route behavior.'
}

$shopList = Get-RequiredText -RelativePath 'layouts/shop/list.html'
$shopSingle = Get-RequiredText -RelativePath 'layouts/shop/single.html'
foreach ($slot in @(
  @{ Text = $shopList; Value = 'bookstore_index_sample'; Context = 'Shop catalog' },
  @{ Text = $shopSingle; Value = 'bookstore_detail_sample'; Context = 'Shop detail' },
  @{ Text = $renderer; Value = 'bookstore_sample_buy'; Context = 'Post-sample direct offer' },
  @{ Text = $renderer; Value = 'bookstore_sample_kindle'; Context = 'Post-sample Kindle offer' }
)) {
  if ([regex]::Matches($slot.Text, [regex]::Escape($slot.Value)).Count -ne 1) {
    throw "$($slot.Context) must use $($slot.Value) exactly once."
  }
}
if ($shopList -match 'shop/(?:direct-offers|kindle-button)\.html|data-epub-checkout') {
  throw 'Catalog discovery cards must send purchase decisions to the product page.'
}
Assert-Contains -Text $shopList -Expected 'View book' -Context 'Catalog product-page action'
Assert-Ordered -Text $shopSingle -First '{{ .Content }}' -Second 'partial "shop/reading-sample.html"' -Context 'Product About/sample order'
Assert-Contains -Text $shopSingle -Expected 'id="page-title"' -Context 'Sample return target'

$figureTemplate = Get-RequiredText -RelativePath 'layouts/shortcodes/sample-figure.html'
foreach ($required in @(
  '.Get "asset"',
  '.Get "alt"',
  '.Get "caption"',
  '.Get "id"',
  'partial "images/model.html"',
  'ne $model.review_state "approved"',
  'partial "images/picture.html"',
  '<figcaption>'
)) {
  Assert-Contains -Text $figureTemplate -Expected $required -Context 'Managed sample-figure renderer'
}
if ($figureTemplate -match '(?i)<img\b|resources\.Get|static/images|\.Resources\.Get') {
  throw 'Sample figures must delegate to the approved responsive-image pipeline.'
}

$css = Get-RequiredText -RelativePath 'assets/css/main.css'
foreach ($required in @(
  'max-width:68ch;',
  'scroll-margin-top:1.5rem;',
  '.bookstore-reading-sample:target,',
  '.bookstore-reading-sample__body{',
  'line-height:1.72;',
  '.bookstore-reading-sample__figure{'
)) {
  Assert-Contains -Text $css -Expected $required -Context 'Reading-sample CSS'
}
foreach ($selector in @('bookstore-sample-link', 'bookstore-reading-sample')) {
  if ([regex]::Matches($css, ('(?m)^\.' + [regex]::Escape($selector) + '\{\r?$')).Count -ne 1) {
    throw "Reading-sample CSS must define .$selector as a valid top-level selector exactly once."
  }
}
if ($css -match '(?m)^\+\.') {
  throw 'Reading-sample CSS contains a literal diff-marker prefix before a selector.'
}

$homepageSampleMatches = @(
  Get-ChildItem -LiteralPath (Join-Path $repoRoot 'layouts') -Recurse -File -Include '*.html' |
    Where-Object { $_.FullName -match '[\\/](?:home|index)\.' -or $_.FullName -match '[\\/]index\.html$' } |
    Where-Object { (Get-Content -LiteralPath $_.FullName -Raw -Encoding utf8) -match 'bookstore_(?:home|shelf)' } |
    Where-Object { (Get-Content -LiteralPath $_.FullName -Raw -Encoding utf8) -match 'sample-link|book_sample_open' }
)
if ($homepageSampleMatches.Count -gt 0) {
  throw 'The compact homepage shelf must not include reading-sample links.'
}

if ($SourceOnly) {
  Write-Host 'Three-title bookstore reading-sample source contract passed.'
  exit 0
}
if (-not (Test-Path -LiteralPath $SiteDir -PathType Container)) {
  throw "Reading-sample output validation requires a built site at $SiteDir."
}
Test-SampleLinkDirectionFixtures

$outputPaths = @('index.html', 'shop/index.html') + @($sampleSpecs | ForEach-Object { $_.OutputPath })
$output = [ordered]@{}
foreach ($relativePath in $outputPaths) {
  $fullPath = Join-Path $SiteDir $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Existing bookstore route changed or disappeared: public/$relativePath"
  }
  $output[$relativePath] = Get-Content -LiteralPath $fullPath -Raw -Encoding utf8
}

$homeHtml = [string]$output['index.html']
$catalogHtml = [string]$output['shop/index.html']
$detailHtmlValues = @($sampleSpecs | ForEach-Object { [string]$output[$_.OutputPath] })
$combinedDetails = $detailHtmlValues -join [Environment]::NewLine

$homeLaunchStrips = @([regex]::Matches($homeHtml, '(?is)<section\b[^>]*\bdata-home-2045-launch(?:=|\s|>).*?</section>'))
if ($homeLaunchStrips.Count -gt 1) {
  throw 'The homepage rendered more than one 2045 launch strip.'
}
$homeWithoutLaunchStrip = $homeHtml
if ($homeLaunchStrips.Count -eq 1) {
  $launchStrip = $homeLaunchStrips[0]
  if ($launchStrip.Value -notmatch '(?is)<a\b(?=[^>]*\bhref="?/shop/2045/sample/"?)(?=[^>]*\bdata-analytics-event="?book_sample_open"?)(?=[^>]*\bdata-analytics-source-slot="?homepage_2045_launch_sample"?)[^>]*>\s*Read a complete story\s*</a>') {
    throw 'The temporary 2045 launch strip must contain its one approved complete-story link.'
  }
  $homeWithoutLaunchStrip = $homeHtml.Remove($launchStrip.Index, $launchStrip.Length)
}
if ($homeWithoutLaunchStrip -match '(?i)book_sample_open|#reading-sample|bookstore_(?:index|detail)_sample|bookstore-reading-sample') {
  throw 'Reading-sample links or expanded excerpts leaked into the production homepage outside the temporary 2045 launch strip.'
}

$standalone2045 = Test-Path -LiteralPath (Join-Path $SiteDir 'shop/2045/sample/index.html') -PathType Leaf
if ([regex]::Matches($catalogHtml, 'data-analytics-source-slot="?bookstore_index_sample"?', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore catalog must expose exactly three shelf reading-sample links.'
}
if ([regex]::Matches($catalogHtml, 'data-analytics-source-slot="?bookstore_feature_sample"?', 'IgnoreCase').Count -ne [int]$standalone2045) {
  throw 'Built bookstore catalog must expose exactly one featured reading-sample link when the 2045 sample is published, otherwise none.'
}
if ([regex]::Matches($combinedDetails, 'data-analytics-source-slot="?bookstore_detail_sample"?(?=\s|>)', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore details must expose exactly three reading-sample fragment links.'
}
if ([regex]::Matches($combinedDetails, '\bid="?reading-sample"?(?:\s|>)', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore details must expose exactly three expanded reading-sample sections.'
}
if ([regex]::Matches($combinedDetails, 'data-analytics-source-slot="?bookstore_sample_buy"?(?=\s|>)', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore details must expose exactly three post-sample direct-EPUB continuation offers.'
}
if ($combinedDetails -match 'data-analytics-source-slot="?bookstore_sample_kindle"?') {
  throw 'Post-sample Kindle fallback rendered even though all three direct EPUB offers are live.'
}

foreach ($spec in $sampleSpecs) {
  $slug = [regex]::Escape([string]$spec.Slug)
  $catalogAnchorPattern = '(?is)<a(?=[^>]*\bhref="?(?:https://outsideinprint\.org)?/shop/' + $slug + '/#reading-sample"?)(?=[^>]*data-analytics-event="?book_sample_open"?)(?=[^>]*data-analytics-source-slot="?bookstore_index_sample"?)(?=[^>]*data-analytics-slug="?' + $slug + '"?)[^>]*>'
  if ([regex]::Matches($catalogHtml, $catalogAnchorPattern).Count -ne 1) {
    throw "Built catalog sample link is missing or duplicated for $($spec.Slug)."
  }
  $catalogAnchor = [regex]::Match($catalogHtml, $catalogAnchorPattern + '.*?</a>').Value
  if ((Get-NormalizedHtmlText -Html $catalogAnchor) -cne 'Read a sample') {
    throw "Built catalog sample action must read Read a sample for $($spec.Slug)."
  }

  $detailHtml = [string]$output[$spec.OutputPath]
  $detailAnchorPattern = '(?is)<a(?=[^>]*\bhref="?#reading-sample"?)(?=[^>]*data-analytics-event="?book_sample_open"?)(?=[^>]*data-analytics-source-slot="?bookstore_detail_sample"?)(?=[^>]*data-analytics-slug="?' + $slug + '"?)[^>]*>'
  if ([regex]::Matches($detailHtml, $detailAnchorPattern).Count -ne 1) {
    throw "Built detail sample link is missing or duplicated for $($spec.Slug)."
  }
  $detailAnchor = [regex]::Match($detailHtml, $detailAnchorPattern + '.*?</a>').Value
  if ((Get-NormalizedHtmlText -Html $detailAnchor) -cne 'Read a sample') {
    throw "Built detail sample action must read Read a sample for $($spec.Slug)."
  }
  if ([regex]::Matches($detailHtml, '\bid="?reading-sample"?(?:\s|>)', 'IgnoreCase').Count -ne 1) {
    throw "Built detail must contain one expanded reading sample for $($spec.Slug)."
  }
  if ([regex]::Matches($detailHtml, 'data-analytics-source-slot="?bookstore_sample_buy"?(?=\s|>)', 'IgnoreCase').Count -ne 1) {
    throw "Built detail must contain one direct continuation offer for $($spec.Slug)."
  }

  $sampleStart = [regex]::Match($detailHtml, '\bid="?reading-sample"?(?:\s|>)', 'IgnoreCase')
  $sampleEnd = $detailHtml.IndexOf('</section>', $sampleStart.Index, [StringComparison]::OrdinalIgnoreCase)
  if (-not $sampleStart.Success -or $sampleEnd -lt 0) {
    throw "Built detail $($spec.Slug) must expose the complete reading section."
  }
  $sampleRegion = $detailHtml.Substring($sampleStart.Index, $sampleEnd - $sampleStart.Index)
  if ([regex]::Matches($sampleRegion, 'data-analytics-source-slot="?bookstore_sample_buy"?(?=\s|>)', 'IgnoreCase').Count -ne 1) {
    throw "Built detail $($spec.Slug) must place one direct continuation offer inside the sample section."
  }
  if ($sampleRegion -match '<form\b|data-epub-checkout|bookstore-checkout-disclosure') {
    throw "Built sample $($spec.Slug) must return to the single product checkout, without a duplicate form."
  }
  if ($sampleRegion -notmatch '<a\b(?=[^>]*href="?#bookstore-purchase"?)(?=[^>]*data-analytics-source-slot="?bookstore_sample_buy"?)[^>]*>') {
    throw "Built sample $($spec.Slug) must link to its product purchase anchor."
  }
  if ($sampleRegion -notmatch '<a\b[^>]*href="?#page-title"?[^>]*>\s*Return to the book\b.*?</a>') {
    throw "Built sample $($spec.Slug) must provide a return-to-book link."
  }
  Assert-Contains -Text $sampleRegion -Expected 'End of sample' -Context "Built detail $($spec.Slug)"
  $sampleEndIndex = $sampleRegion.IndexOf('End of sample', [StringComparison]::Ordinal)
  $sampleDirectMatch = [regex]::Match($sampleRegion, 'data-analytics-source-slot="?bookstore_sample_buy"?(?=\s|>)', 'IgnoreCase')
  if ($sampleEndIndex -lt 0 -or -not $sampleDirectMatch.Success -or $sampleEndIndex -ge $sampleDirectMatch.Index) {
    throw "Built detail $($spec.Slug) must place the direct EPUB continuation after the excerpt end marker."
  }

  $normalizedDetail = Get-NormalizedHtmlText -Html $detailHtml
  foreach ($probe in @([string]$spec.OpeningProbe, [string]$spec.EndingProbe)) {
    $renderedProbe = [regex]::Replace($probe, '\[\^[^]]+\]', '')
    if (-not $normalizedDetail.Contains($renderedProbe, [StringComparison]::Ordinal)) {
      throw "Built detail $($spec.Slug) is missing an approved sample prose boundary."
    }
  }
  foreach ($signature in $spec.HeadingSignatures) {
    $parts = $signature.Split(':', 2)
    $level = [int]$parts[0]
    $heading = $parts[1]
    $headingPattern = '(?is)<h' + $level + '\b[^>]*>\s*' + [regex]::Escape($heading) + '\s*</h' + $level + '>'
    if ([regex]::Matches([Net.WebUtility]::HtmlDecode($detailHtml), $headingPattern).Count -ne 1) {
      throw "Built detail $($spec.Slug) is missing heading signature $signature."
    }
  }

  if ($spec.Slug -eq 'the-water-cycle') {
    foreach ($id in $spec.FigureIds) {
      $assetId = [string]$expectedFigures[$id].asset
      if ($detailHtml -notmatch ('data-oip-image-id="?' + [regex]::Escape($assetId) + '"?(?:\s|>)')) {
        throw "Built Water Cycle sample is missing managed figure $id."
      }
    }
  }
  elseif ($detailHtml -match 'bookstore-reading-sample__figure') {
    throw "Built detail $($spec.Slug) unexpectedly contains a sample figure."
  }

  if ((Get-NormalizedHtmlText -Html $catalogHtml).Contains([string]$spec.OpeningProbe, [StringComparison]::Ordinal)) {
    throw "Sample prose leaked from $($spec.Slug) into the compact catalog."
  }
}

$sampleArtifacts = @(
  Get-ChildItem -LiteralPath (Join-Path $SiteDir 'shop') -Recurse -File |
    Where-Object { $_.Name -match '^sample(?:\.|$)' -or $_.DirectoryName -match '[\\/]sample$' } |
    Where-Object { [IO.Path]::GetRelativePath($SiteDir, $_.FullName).Replace('\', '/') -ne 'shop/2045/sample/index.html' }
)
if ($sampleArtifacts.Count -gt 0) {
  throw "Standalone sample artifacts were generated: $($sampleArtifacts.FullName -join ', ')"
}
foreach ($routeIndex in @('sitemap.xml', 'index.xml', 'shop/index.xml')) {
  $path = Join-Path $SiteDir $routeIndex
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    $text = Get-Content -LiteralPath $path -Raw -Encoding utf8
    if ($text -match '(?i)/shop/(?!2045/sample/)[^<"'']+/sample(?:/|\.|<|"|''|$)') {
      throw "Standalone reading-sample route leaked into public/$routeIndex."
    }
  }
}

Write-Host 'Three-title bookstore reading-sample source and production-output contract passed.'
exit 0
