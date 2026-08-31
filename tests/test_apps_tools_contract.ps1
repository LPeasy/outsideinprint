Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$requiredFiles = @(
  'content/apps/_index.md',
  'content/apps/bucks-machine/index.md',
  'content/apps/baseball-upside-risk/index.md',
  'content/apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.pdf',
  'content/apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.xlsx',
  'data/apps.yaml',
  'layouts/apps/list.html',
  'layouts/apps/single.html',
  'layouts/partials/apps/product-data.html',
  'layouts/partials/apps/actions.html',
  'layouts/partials/apps/sample-downloads.html',
  'layouts/partials/apps/companion-publication.html',
  'layouts/partials/schema/webpage.html',
  'layouts/partials/masthead.html',
  'layouts/partials/footer.html',
  'assets/css/main.css',
  'docs/layout-ownership-matrix.md',
  'hugo.toml'
)

foreach ($relativePath in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath) -PathType Leaf)) {
    throw "Missing Apps & Tools contract file: $relativePath"
  }
}

function Get-Source {
  param([Parameter(Mandatory)][string]$RelativePath)
  return Get-Content -LiteralPath (Join-Path $repoRoot $RelativePath) -Raw -Encoding utf8
}

function Assert-Matches {
  param([string]$Source, [string]$Pattern, [string]$Message)
  if ($Source -notmatch $Pattern) { throw $Message }
}

function Assert-Omits {
  param([string]$Source, [string]$Pattern, [string]$Message)
  if ($Source -match $Pattern) { throw $Message }
}

function Get-ProductBlock {
  param([string]$Source, [string]$Key, [string]$NextKey = '')
  $start = $Source.IndexOf("  $Key`:", [StringComparison]::Ordinal)
  if ($start -lt 0) { throw "Missing Apps product block: $Key" }
  $end = if ($NextKey) { $Source.IndexOf("  $NextKey`:", $start + 1, [StringComparison]::Ordinal) } else { $Source.Length }
  if ($end -le $start) { throw "Incomplete Apps product block: $Key" }
  return $Source.Substring($start, $end - $start)
}

function Get-FrontMatterBoolean {
  param([string]$Source, [string]$Key)
  $match = [regex]::Match($Source, "(?m)^$([regex]::Escape($Key)):\s*(true|false)\s*$")
  if (-not $match.Success) { throw "Missing $Key front matter." }
  return $match.Groups[1].Value -ceq 'true'
}

$appsIndex = Get-Source 'content/apps/_index.md'
$bucksPage = Get-Source 'content/apps/bucks-machine/index.md'
$baseballPage = Get-Source 'content/apps/baseball-upside-risk/index.md'
$appsData = Get-Source 'data/apps.yaml'
$bucks = Get-ProductBlock -Source $appsData -Key 'bucks_machine' -NextKey 'baseball_upside_risk'
$baseball = Get-ProductBlock -Source $appsData -Key 'baseball_upside_risk'
$appsList = Get-Source 'layouts/apps/list.html'
$appsSingle = Get-Source 'layouts/apps/single.html'
$productData = Get-Source 'layouts/partials/apps/product-data.html'
$actions = Get-Source 'layouts/partials/apps/actions.html'
$sampleDownloads = Get-Source 'layouts/partials/apps/sample-downloads.html'
$companion = Get-Source 'layouts/partials/apps/companion-publication.html'
$webpageSchema = Get-Source 'layouts/partials/schema/webpage.html'
$masthead = Get-Source 'layouts/partials/masthead.html'
$footer = Get-Source 'layouts/partials/footer.html'
$mainCss = Get-Source 'assets/css/main.css'
$layoutMatrix = Get-Source 'docs/layout-ownership-matrix.md'
$hugoConfig = Get-Source 'hugo.toml'

foreach ($source in @($appsIndex, $bucksPage)) {
  if (Get-FrontMatterBoolean -Source $source -Key 'draft') { throw 'The Apps index and Bucks page must remain published.' }
  if (Get-FrontMatterBoolean -Source $source -Key 'noindex') { throw 'The Apps index and Bucks page must remain indexable.' }
}
$baseballDraft = Get-FrontMatterBoolean -Source $baseballPage -Key 'draft'
$baseballNoindex = Get-FrontMatterBoolean -Source $baseballPage -Key 'noindex'
if ($baseballDraft) { throw 'The frozen Baseball publication candidate must be non-draft.' }
if ($baseballNoindex) { throw 'The frozen Baseball publication candidate must be indexable.' }
Assert-Matches $bucksPage '(?m)^weight:\s*10\s*$' 'Bucks Machine must remain first at weight 10.'
Assert-Matches $baseballPage '(?m)^weight:\s*20\s*$' 'Baseball Upside Risk must remain second at weight 20.'
foreach ($source in @($bucksPage, $baseballPage)) {
  Assert-Matches $source '(?ms)^build:\s*\r?\n\s+publishResources:\s*false\s*$' 'Each Apps leaf bundle must disable automatic resource publication.'
}
Assert-Matches $hugoConfig '(?m)^apps\s*=\s*"/apps/:slug/"\s*$' 'hugo.toml must retain the Apps permalink family.'

$requiredStrings = @(
  'slug', 'title', 'category', 'status', 'availability', 'promise', 'audience', 'intake_note',
  'preview_eyebrow', 'preview_title', 'preview_badge', 'preview_footer', 'preview_accessible_label',
  'preview_components_label', 'workflow_heading', 'workflow_intro', 'output_kicker', 'output_heading',
  'limitations_heading', 'privacy_heading', 'privacy_warning', 'operator_legal_name', 'seller_legal_name',
  'operator_line', 'support_email', 'support_line', 'commercial_action_state', 'back_link_state',
  'sample_downloads_state'
)
$requiredCollections = @('workflow', 'deliverables', 'preview_rows', 'limitations')
foreach ($record in @(
  @{ Name = 'Bucks Machine'; Source = $bucks },
  @{ Name = 'Baseball Upside Risk'; Source = $baseball }
)) {
  foreach ($field in $requiredStrings + $requiredCollections) {
    Assert-Matches $record.Source ("(?m)^\s+" + [regex]::Escape($field) + ':') "$($record.Name) must define $field."
  }
  Assert-Matches $record.Source '(?m)^\s+operator_legal_name:\s*["'']?Outside In Print LLC["'']?\s*$' "$($record.Name) must use the LLC operator."
  Assert-Matches $record.Source '(?m)^\s+seller_legal_name:\s*["'']?Outside In Print LLC["'']?\s*$' "$($record.Name) must use the LLC seller."
  Assert-Matches $record.Source '(?m)^\s+support_email:\s*["'']?support@outsideinprint\.org["'']?\s*$' "$($record.Name) must use the approved support address."
  Assert-Matches $record.Source '(?m)^\s+commercial_action_state:\s*["'']?disabled["'']?\s*$' "$($record.Name) must keep commerce disabled."
}

foreach ($snippet in @(
  'Bucks Machine, a product operated and sold by Outside In Print LLC.',
  'Turn de-identified rough project notes into a human-reviewed scope, schedule, budget, risk, PDF, and workbook planning packet.',
  'bucks-machine-synthetic-professional-services-demo.pdf',
  'bucks-machine-synthetic-professional-services-demo.xlsx'
)) {
  Assert-Matches $bucks ([regex]::Escape($snippet)) "Bucks Machine must retain approved copy or resource: $snippet"
}
Assert-Matches $bucks '(?m)^\s+sample_downloads_state:\s*["'']?public_preview["'']?\s*$' 'Bucks samples must remain public_preview.'

foreach ($snippet in @(
  'Baseball Upside Risk, a product operated and sold by Outside In Print LLC.',
  'The interactive calculator and personalized reports are not currently available for use or purchase.',
  'This static preview collects no player profile, name, school, email address, payment, or report request.',
  'This frozen B-GERM snapshot was generated May 14, 2026. It uses 2024-25 participation inputs and 2025 draft inputs; it is not a live 2026 probability estimate.',
  'Long Shots in the Big League',
  'Baseball, Gross Earnings, and the Arithmetic of Risk',
  'Companion publication in preparation',
  'May 14, 2026',
  '1,000,000 fixed-seed draws',
  '20260512',
  'Gross professional baseball earnings only'
)) {
  Assert-Matches $baseball ([regex]::Escape($snippet)) "Baseball Upside Risk must retain approved copy: $snippet"
}
Assert-Matches $baseball '(?m)^\s+sample_downloads_state:\s*["'']?disabled["'']?\s*$' 'Baseball sample downloads must remain disabled.'
Assert-Omits $baseball '(?m)^\s+sample_downloads:\s*$' 'Baseball must not define sample resources while downloads are disabled.'

$priorIndex = -1
foreach ($value in @('$0', '99.509%', '0.491%', '0.535%', '0.495%', '0.141%', '$27,201')) {
  $valueIndex = $baseball.IndexOf($value, $priorIndex + 1, [StringComparison]::Ordinal)
  if ($valueIndex -le $priorIndex) { throw "Frozen Baseball value is missing or out of order: $value" }
  $priorIndex = $valueIndex
}

foreach ($template in @($appsList, $appsSingle)) {
  Assert-Matches $template 'partial\s+"apps/product-data\.html"' 'Apps routes must use the product-data contract.'
}
Assert-Matches $appsSingle 'partial\s+"apps/actions\.html"' 'Apps product pages must render the inert action gate.'
Assert-Matches $appsSingle 'partial\s+"apps/sample-downloads\.html"' 'Apps product pages must render the sample gate.'
Assert-Matches $appsSingle 'partial\s+"apps/companion-publication\.html"' 'Apps product pages must render the optional companion panel.'
Assert-Matches $appsList '\$densePreview\s*:=\s*gt\s+\(len\s+\$previewRows\)\s+4' 'The Apps index must select dense scorecards from row count rather than product identity.'
Assert-Matches $appsList 'apps-card__preview--dense' 'The Apps index must expose the generic dense-scorecard modifier.'
Assert-Matches $appsSingle 'href="mailto:\{\{ index \$product "support_email" \}\}"' 'Apps product pages must expose the approved support mailto.'
Assert-Matches $appsSingle 'back_link_state' 'Apps product pages must data-gate the optional back link.'
foreach ($term in @('local_draft', 'public_preview', 'sample_downloads', 'Outside In Print LLC', 'errorf')) {
  Assert-Matches $productData ([regex]::Escape($term)) "The product-data contract must validate $term."
}
Assert-Matches $appsSingle 'source_vintage_note' 'The Apps product template must render the optional frozen-source-vintage disclosure.'
foreach ($term in @('hugo.IsServer', 'Resources.GetMatch', '.RelPermalink')) {
  Assert-Matches $sampleDownloads ([regex]::Escape($term)) "The sample gate must retain $term."
}
Assert-Omits $actions '(?i)<a\b|<form\b|mailto:|stripe|checkout|price|waitlist' 'The action gate must remain inert.'
Assert-Omits $companion '(?i)<a\b|href=|Robert V\. Ussley|\bbyline\b|\bcover\b|\bprice\b|\bpre-?order\b' 'The public companion panel must remain non-clickable and omit release data and byline.'

foreach ($chrome in @($masthead, $footer)) {
  Assert-Matches $chrome 'site\.GetPage\s+"/apps"' 'Site chrome must resolve the published Apps section.'
  Assert-Matches $chrome '\$showApps\s*:=\s*and\s+\$appsPage\s+\(not\s+\$appsPage\.Draft\)' 'Site chrome must gate Apps on the published section.'
  Assert-Omits $chrome '\$showApps\s*:=[^\r\n]*hugo\.IsServer' 'Apps navigation must not acquire a server-only draft alternative.'
}
Assert-Matches $masthead '"label"\s+"Apps & Tools"' 'The masthead destination model must retain the Apps & Tools label.'
Assert-Matches $footer '>Apps\s*&amp;\s*Tools<' 'Footer navigation must retain the Apps & Tools label.'
Assert-Matches $masthead '\$isApps\s*:=\s*eq\s+\.Section\s+"apps"' 'The masthead must retain Apps aria-current routing.'
Assert-Matches $masthead '"current"\s+\$isApps' 'The masthead destination model must bind Apps & Tools to its exact current state.'

$appsMarkup = $appsList + "`n" + $appsSingle + "`n" + $sampleDownloads + "`n" + $companion
foreach ($family in @(
  'apps-index', 'apps-card', 'apps-product', 'apps-status', 'apps-packet-preview', 'apps-interpretation',
  'apps-snapshot', 'apps-workflow', 'apps-deliverables', 'apps-samples', 'apps-limitations',
  'apps-companion', 'apps-identity'
)) {
  Assert-Matches $appsMarkup ([regex]::Escape($family)) "Apps markup must use $family."
  Assert-Matches $mainCss ('\.' + [regex]::Escape($family)) "Apps CSS must own $family."
  Assert-Matches $layoutMatrix ('`' + [regex]::Escape($family)) "The layout matrix must document $family."
}
Assert-Matches $layoutMatrix '\| Baseball Upside Risk product \| `/apps/baseball-upside-risk/`' 'The layout matrix must own the Baseball route.'

$appsCssMatch = [regex]::Match($mainCss, '(?s)/\* Apps & Tools public development preview \*/(.*?)(?=\r?\n/\* Games storefront and product \*/|\r?\n@media print)')
if (-not $appsCssMatch.Success) { throw 'Missing bounded Apps CSS section.' }
$appsCss = $appsCssMatch.Groups[1].Value
Assert-Matches $appsCss '@media\s*\(max-width:640px\)' 'Apps CSS must include the 320px layout.'
Assert-Matches $appsCss ':focus-visible' 'Apps CSS must preserve visible keyboard focus.'
Assert-Matches $appsCss '\.apps-card__preview dt,[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;' 'Scorecard labels must wrap inside their grid column instead of colliding with values.'
Assert-Matches $appsCss '\.apps-card__preview--dense dl > div\s*\{[\s\S]*?grid-template-columns:\s*minmax\(6\.4rem,\s*\.62fr\)\s+minmax\(0,\s*\.38fr\);' 'Dense scorecards must allocate enough width to complete label words.'
Assert-Matches $appsCss '\.apps-card__preview--dense dt\s*\{[\s\S]*?font-size:\s*\.62rem;[\s\S]*?overflow-wrap:\s*normal;[\s\S]*?word-break:\s*normal;' 'Dense scorecard labels must retain normal whole-word wrapping.'
Assert-Matches $appsCss '@media\s*\(max-width:640px\)[\s\S]*?\.apps-card__preview--dense dl > div\s*\{[\s\S]*?grid-template-columns:\s*1fr;' 'Dense scorecard rows must stack on narrow screens.'
Assert-Omits $appsCss '(?i)(?:linear|radial|conic)-gradient\s*\(|@keyframes\b|\banimation(?:-name)?\s*:' 'Apps CSS must not introduce gradients or animation.'
Assert-Omits $appsCss '(?i)@font-face\b|url\([^)]*\.(?:woff2?|ttf|otf)' 'Apps CSS must not introduce a font system.'

$baseballSurface = $baseballPage + "`n" + $baseball + "`n" + $companion
foreach ($forbidden in @(
  '(?i)Robert V\. Ussley', '(?i)\bbyline\b', '(?i)\bASIN\b', '(?i)\bKDP\b', '(?i)\bpre-?order\b',
  '(?i)<form\b', '(?i)stripe', '(?i)checkout', '(?i)waitlist', '(?i)SoftwareApplication',
  '(?i)"@type"\s*:\s*"(?:Product|Offer)"', '(?i)\b[A-F0-9]{64}\b', '(?i)\bSHA-?256\b',
  '(?i)\bartifact hash\b'
)) {
  Assert-Omits $baseballSurface $forbidden "The Baseball public-source surface contains a forbidden release, commerce, schema, byline, or private-binding value: $forbidden"
}
Assert-Matches $webpageSchema '\(and\s+\(eq\s+\$meta\.route\.name\s+"section-list"\)\s+\(not\s+\(in\s+\(slice\s+"apps"\s+"games"\)\s+\$page\.Section\)\)\)' 'Apps metadata must remain generic WebPage.'

Write-Host 'Apps & Tools contract test passed.'
$global:LASTEXITCODE = 0
exit 0
