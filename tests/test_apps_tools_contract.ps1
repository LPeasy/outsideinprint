Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$requiredFiles = @(
  'content/apps/_index.md',
  'content/apps/bucks-machine/index.md',
  'content/apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.pdf',
  'content/apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.xlsx',
  'data/apps.yaml',
  'layouts/apps/list.html',
  'layouts/apps/single.html',
  'layouts/partials/apps/product-data.html',
  'layouts/partials/apps/actions.html',
  'layouts/partials/apps/sample-downloads.html',
  'layouts/partials/masthead.html',
  'layouts/partials/footer.html',
  'assets/css/main.css',
  'hugo.toml'
)

foreach ($relativePath in $requiredFiles) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing Apps & Tools contract file: $relativePath"
  }
}

function Get-Source {
  param([Parameter(Mandatory)][string]$RelativePath)

  return Get-Content -LiteralPath (Join-Path $repoRoot $RelativePath) -Raw -Encoding utf8
}

function Assert-Matches {
  param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$Pattern,
    [Parameter(Mandatory)][string]$Message
  )

  if ($Source -notmatch $Pattern) {
    throw $Message
  }
}

function Assert-Omits {
  param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$Pattern,
    [Parameter(Mandatory)][string]$Message
  )

  if ($Source -match $Pattern) {
    throw $Message
  }
}

$appsIndex = Get-Source 'content/apps/_index.md'
$bucksPage = Get-Source 'content/apps/bucks-machine/index.md'
$appsData = Get-Source 'data/apps.yaml'
$appsList = Get-Source 'layouts/apps/list.html'
$appsSingle = Get-Source 'layouts/apps/single.html'
$productData = Get-Source 'layouts/partials/apps/product-data.html'
$actions = Get-Source 'layouts/partials/apps/actions.html'
$sampleDownloads = Get-Source 'layouts/partials/apps/sample-downloads.html'
$masthead = Get-Source 'layouts/partials/masthead.html'
$footer = Get-Source 'layouts/partials/footer.html'
$mainCss = Get-Source 'assets/css/main.css'
$hugoConfig = Get-Source 'hugo.toml'
$homepage = Get-Source 'layouts/index.html'
$shopList = Get-Source 'layouts/shop/list.html'
$shopSingle = Get-Source 'layouts/shop/single.html'

foreach ($draftSource in @(
  @{ Name = 'content/apps/_index.md'; Source = $appsIndex },
  @{ Name = 'content/apps/bucks-machine/index.md'; Source = $bucksPage }
)) {
  Assert-Matches $draftSource.Source '(?m)^draft:\s*true\s*$' "$($draftSource.Name) must remain a draft."
  Assert-Matches $draftSource.Source '(?m)^noindex:\s*true\s*$' "$($draftSource.Name) must remain noindex."
}

Assert-Matches $bucksPage '(?ms)^build:\s*\r?\n\s+publishResources:\s*false\s*$' 'The Bucks Machine leaf bundle must set build.publishResources to false.'
Assert-Matches $hugoConfig '(?m)^apps\s*=\s*"/apps/:slug/"\s*$' 'hugo.toml must define the explicit Apps permalink family.'

foreach ($requiredKey in @(
  'slug',
  'title',
  'status',
  'availability',
  'promise',
  'audience',
  'workflow',
  'deliverables',
  'limitations',
  'privacy_warning',
  'operator_legal_name',
  'seller_legal_name',
  'operator_line',
  'support_email',
  'support_line',
  'commercial_action_state',
  'sample_downloads_state',
  'sample_downloads'
)) {
  Assert-Matches $appsData ("(?m)^\s+" + [regex]::Escape($requiredKey) + ':') "data/apps.yaml must define Bucks Machine field '$requiredKey'."
}

foreach ($requiredPattern in @(
  '(?m)^products:\s*$',
  '(?m)^\s{2}bucks_machine:\s*$',
  '(?m)^\s+slug:\s*["'']?bucks-machine["'']?\s*$',
  '(?m)^\s+title:\s*["'']?Bucks Machine["'']?\s*$',
  '(?m)^\s+status:\s*["'']?In development["'']?\s*$',
  '(?m)^\s+availability:\s*["'']?Not currently available for use or purchase\.["'']?\s*$',
  '(?m)^\s+operator_legal_name:\s*["'']?Outside In Print LLC["'']?\s*$',
  '(?m)^\s+seller_legal_name:\s*["'']?Outside In Print LLC["'']?\s*$',
  '(?m)^\s+operator_line:\s*["'']?Bucks Machine, a product operated and sold by Outside In Print LLC\.["'']?\s*$',
  '(?m)^\s+support_email:\s*["'']?support@outsideinprint\.org["'']?\s*$',
  '(?m)^\s+support_line:\s*["'']?Support for Bucks Machine is provided by Outside In Print LLC: support@outsideinprint\.org\.["'']?\s*$',
  '(?m)^\s+commercial_action_state:\s*["'']?disabled["'']?\s*$',
  '(?m)^\s+sample_downloads_state:\s*["'']?local_draft["'']?\s*$'
)) {
  Assert-Matches $appsData $requiredPattern "data/apps.yaml is missing an approved Bucks Machine identity or release-state value: $requiredPattern"
}

foreach ($requiredSnippet in @(
  'Turn de-identified rough project notes into a human-reviewed scope, schedule, budget, risk, PDF, and workbook planning packet.',
  'independent consultants',
  'de-identified notes',
  'structured draft',
  'human review',
  'planning packet',
  'bucks-machine-synthetic-professional-services-demo.pdf',
  'bucks-machine-synthetic-professional-services-demo.xlsx'
)) {
  Assert-Matches $appsData ([regex]::Escape($requiredSnippet)) "data/apps.yaml must retain approved Bucks Machine copy: $requiredSnippet"
}

foreach ($requiredSafetyTerm in @(
  'planning support',
  'human review',
  'certified estimate',
  'final contract',
  'formal approval',
  'government deliverable',
  'professional certification',
  'confidential',
  'government-sensitive',
  'export-controlled',
  'classified',
  'procurement-sensitive',
  'health',
  'payment',
  'identity',
  'credential',
  'legal-client',
  'regulated'
)) {
  Assert-Matches $appsData ([regex]::Escape($requiredSafetyTerm)) "data/apps.yaml must retain the '$requiredSafetyTerm' safety boundary."
}

foreach ($template in @(
  @{ Name = 'layouts/apps/list.html'; Source = $appsList },
  @{ Name = 'layouts/apps/single.html'; Source = $appsSingle }
)) {
  Assert-Matches $template.Source 'partial\s+"apps/product-data\.html"' "$($template.Name) must use the Apps product-data contract."
}

Assert-Matches $appsSingle 'partial\s+"apps/actions\.html"' 'The Bucks Machine page must render the inert commercial-action partial.'
Assert-Matches $appsSingle 'partial\s+"apps/sample-downloads\.html"' 'The Bucks Machine page must render localhost-only sample downloads through their gate partial.'

foreach ($requiredProductCheck in @(
  'Outside In Print LLC',
  'operator_legal_name',
  'seller_legal_name',
  'operator_line',
  'support_email',
  'support_line',
  'errorf'
)) {
  Assert-Matches $productData ([regex]::Escape($requiredProductCheck)) "apps/product-data.html must validate '$requiredProductCheck'."
}

foreach ($requiredDownloadGate in @(
  'hugo.IsServer',
  '.Draft',
  'local_draft',
  'Resources.GetMatch',
  '.RelPermalink'
)) {
  Assert-Matches $sampleDownloads ([regex]::Escape($requiredDownloadGate)) "apps/sample-downloads.html must gate downloads with '$requiredDownloadGate'."
}

Assert-Omits $actions '(?i)<a\b|<form\b|mailto:|stripe|checkout|price|waitlist' 'apps/actions.html must not expose a sales, intake, pricing, checkout, email, or waitlist control.'
Assert-Matches $appsSingle 'href="mailto:\{\{ index \$product "support_email" \}\}"' 'The Bucks page must expose only the approved LLC support email control.'
Assert-Matches $appsSingle 'Support for \{\{ index \$product "title" \}\} is provided by \{\{ index \$product "operator_legal_name" \}\}' 'The Bucks page must render the approved LLC support identity line.'

foreach ($chrome in @(
  @{ Name = 'masthead'; Source = $masthead },
  @{ Name = 'footer'; Source = $footer }
)) {
  Assert-Matches $chrome.Source 'site\.GetPage\s+"/apps"' "The $($chrome.Name) must resolve the draft Apps section before rendering its link."
  Assert-Matches $chrome.Source 'and\s+hugo\.IsServer\s+\$appsDraft' "The $($chrome.Name) must show Apps & Tools only on the local Hugo server."
  Assert-Matches $chrome.Source '>Apps\s*&amp;\s*Tools<' "The $($chrome.Name) must label the local link Apps & Tools."
}

Assert-Matches $masthead '\$isApps\s*:=\s*eq\s+\.Section\s+"apps"' 'The masthead must identify Apps routes for aria-current.'
Assert-Matches $masthead '\$isApps[^\r\n]*aria-current="page"|aria-current="page"[^\r\n]*\$isApps' 'The Apps masthead link must expose aria-current on Apps routes.'

foreach ($classFamily in @(
  'apps-index',
  'apps-card',
  'apps-product',
  'apps-status',
  'apps-packet-preview',
  'apps-workflow',
  'apps-deliverables',
  'apps-samples',
  'apps-limitations',
  'apps-identity'
)) {
  Assert-Matches ($appsList + "`n" + $appsSingle + "`n" + $sampleDownloads) ([regex]::Escape($classFamily)) "Apps markup must use the '$classFamily' route namespace."
  Assert-Matches $mainCss ('\.' + [regex]::Escape($classFamily)) "assets/css/main.css must explicitly own the '$classFamily' route namespace."
}

$appsCssMatch = [regex]::Match($mainCss, '(?s)/\* Apps & Tools local draft \*/(.*?)(?=\r?\n@media print)')
if (-not $appsCssMatch.Success) {
  throw 'assets/css/main.css must contain a bounded Apps & Tools local-draft section.'
}
$appsCss = $appsCssMatch.Groups[1].Value
Assert-Matches $appsCss '@media\s*\(max-width:640px\)' 'Apps CSS must include the narrow-screen layout used for 320px and zoom testing.'
Assert-Matches $appsCss ':focus-visible' 'Apps CSS must preserve visible keyboard focus.'
Assert-Omits $appsCss '(?i)(?:linear|radial|conic)-gradient\s*\(|@keyframes\b|\banimation(?:-name)?\s*:' 'Apps CSS must not introduce gradients or animation.'
Assert-Omits $appsCss '(?i)@font-face\b|url\([^)]*\.(?:woff2?|ttf|otf)' 'Apps CSS must not introduce a separate font system.'

$appsSurface = $appsIndex + "`n" + $bucksPage + "`n" + $appsData + "`n" + $appsList + "`n" + $appsSingle + "`n" + $productData + "`n" + $actions + "`n" + $sampleDownloads
foreach ($forbiddenPattern in @(
  '(?i)SoftwareApplication',
  '(?i)"@type"\s*:\s*"(?:Product|Offer)"',
  '(?i)Kure Beach',
  '(?i)Freeport',
  '(?i)USACE',
  '(?i)trademark(?:ed| clearance)?',
  '(?i)legally cleared',
  '(?i)available now',
  '(?i)<form\b',
  '(?i)stripe',
  '(?i)checkout',
  '(?i)waitlist'
)) {
  Assert-Omits $appsSurface $forbiddenPattern "The unpublished Apps surface contains forbidden commercial, customer, legal-clearance, or structured-data language: $forbiddenPattern"
}

foreach ($unchangedSurface in @(
  @{ Name = 'layouts/index.html'; Source = $homepage },
  @{ Name = 'layouts/shop/list.html'; Source = $shopList },
  @{ Name = 'layouts/shop/single.html'; Source = $shopSingle }
)) {
  Assert-Omits $unchangedSurface.Source '(?i)apps/product-data|/apps/|Apps\s*&amp;\s*Tools|Bucks Machine' "$($unchangedSurface.Name) must remain outside the Apps & Tools draft."
}

Write-Host 'Apps & Tools contract test passed.'
$global:LASTEXITCODE = 0
exit 0
