#requires -Version 7.0
[CmdletBinding()]
param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$EvidencePath = 'reports/focused-image-visual-review.json',
  [switch]$InitializeEvidence,
  [switch]$Write,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
. (Join-Path $PSScriptRoot 'lib\image_asset_manifest.ps1')

$InventoryPath = Join-Path $Root 'reports/legacy-image-focused-cleanup-inventory.json'
$ManifestPath = Get-OipImageAssetManifestPath -Root $Root
$CandidatePath = Join-Path $Root 'reports/image-review-candidates.json'
$VisualReviewPath = Join-Path $Root 'reports/image-visual-review.json'
$CleanupActionPattern = '^WEB-LEGACY-IMAGE-CLEANUP-001-R(?<revision>[1-9][0-9]*)$'
$SupportedInventorySchemas = @('1.0', '1.1')
$ResolvedEvidencePath = if ([IO.Path]::IsPathRooted($EvidencePath)) {
  [IO.Path]::GetFullPath($EvidencePath)
}
else {
  [IO.Path]::GetFullPath((Join-Path $Root $EvidencePath))
}
$RequiredReviewMethods = @(
  'original_largest_webp_largest_avif_contact_sheet_comparison',
  'deep_review_browser_100_percent_zoom',
  'deep_review_browser_200_percent_zoom',
  'browser_canvas_decode_and_pixel_sanity'
)
$Utf8NoBom = [Text.UTF8Encoding]::new($false)

function Read-OipJsonHashtable {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (-not [IO.File]::Exists($Path)) {
    throw "Missing ${Label}: $Path"
  }
  Get-OipCanonicalTextFileSha256 -Path $Path -Label $Label -RequireCanonical | Out-Null
  return (Get-Content -LiteralPath $Path -Raw -Encoding utf8) | ConvertFrom-Json -AsHashtable -Depth 40
}

function Assert-OipExactSet {
  param(
    [Parameter(Mandatory = $true)][object[]]$Actual,
    [Parameter(Mandatory = $true)][object[]]$Expected,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $actualValues = @($Actual | ForEach-Object { [string]$_ } | Sort-Object -Unique)
  $expectedValues = @($Expected | ForEach-Object { [string]$_ } | Sort-Object -Unique)
  if ([string]::Join("`n", $actualValues) -cne [string]::Join("`n", $expectedValues)) {
    throw "$Label differs from the deterministic expected set."
  }
}

function Get-OipSha256ForStrings {
  param([Parameter(Mandatory = $true)][string[]]$Values)

  $text = ([string]::Join("`n", @($Values | Sort-Object -Unique))) + "`n"
  return Get-OipSha256ForBytes -Bytes $Utf8NoBom.GetBytes($text)
}

function Get-OipCleanupActionRevision {
  param(
    [Parameter(Mandatory = $true)][string]$ActionId,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $actionMatch = [regex]::Match($ActionId, $CleanupActionPattern)
  if (-not $actionMatch.Success) {
    throw "$Label does not identify the WEB-LEGACY-IMAGE-CLEANUP-001 revision family: $ActionId"
  }
  return [int]$actionMatch.Groups['revision'].Value
}

function Get-OipInventoryActionBinding {
  param([Parameter(Mandatory = $true)][System.Collections.IDictionary]$Inventory)

  $schemaVersion = [string]$Inventory.schema_version
  if ($SupportedInventorySchemas -cnotcontains $schemaVersion) {
    throw "Focused cleanup inventory uses unsupported schema: $schemaVersion"
  }

  $actionId = [string]$Inventory.action_id
  $revision = Get-OipCleanupActionRevision -ActionId $actionId -Label 'Focused cleanup inventory action_id'
  if (($schemaVersion -ceq '1.0' -and $revision -ne 1) -or
    ($schemaVersion -ceq '1.1' -and $revision -lt 2)) {
    throw "Focused cleanup inventory schema/action binding is unsupported: schema $schemaVersion, action $actionId"
  }

  return [pscustomobject]@{
    ActionId = $actionId
    Revision = $revision
  }
}

function Assert-OipPassEvidenceCoverage {
  param(
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Evidence,
    [Parameter(Mandatory = $true)][object]$Context
  )

  if ([string]$Evidence.review_state -cne 'pass') {
    throw 'Focused image visual-review record is not PASS.'
  }
  if ([string]$Evidence.review_date -cnotmatch '^20[0-9]{2}-[01][0-9]-[0-3][0-9]$' -or
    [string]::IsNullOrWhiteSpace([string]$Evidence.review_actor)) {
    throw 'PASS evidence requires a review_date and review_actor.'
  }
  Assert-OipExactSet -Actual @($Evidence.expected_asset_ids) -Expected $Context.AssetIds -Label 'Evidence expected_asset_ids'
  Assert-OipExactSet -Actual @($Evidence.reviewed_asset_ids) -Expected $Context.AssetIds -Label 'Evidence reviewed_asset_ids'
  Assert-OipExactSet -Actual @($Evidence.required_review_methods) -Expected $RequiredReviewMethods -Label 'Evidence required_review_methods'
  Assert-OipExactSet -Actual @($Evidence.completed_review_methods) -Expected $RequiredReviewMethods -Label 'Evidence completed_review_methods'
  Assert-OipExactSet -Actual @($Evidence.expected_deep_review_ids) -Expected $Context.DeepIds -Label 'Evidence expected_deep_review_ids'
  Assert-OipExactSet -Actual @($Evidence.deep_reviewed_asset_ids) -Expected $Context.DeepIds -Label 'Evidence deep_reviewed_asset_ids'
  if ([int]$Evidence.expected_asset_count -ne 109 -or
    [int]$Evidence.expected_deep_review_count -ne $Context.DeepIds.Count -or
    [int]$Evidence.decode_sanity.asset_count -ne 109 -or
    [int]$Evidence.decode_sanity.decode_failure_count -ne 0 -or
    [string]$Evidence.decode_sanity.outcome -cne 'pass') {
    throw 'PASS evidence does not cover all 109 assets, the deterministic deep-review set, and zero decode failures.'
  }
}

function Get-OipReviewContext {
  $inventory = Read-OipJsonHashtable -Path $InventoryPath -Label 'focused cleanup inventory'
  $actionBinding = Get-OipInventoryActionBinding -Inventory $inventory
  if (@($inventory.medium_migrations).Count -ne 105 -or
    @($inventory.syd_migrations).Count -ne 4) {
    throw 'Focused cleanup inventory is not the exact approved 105 Medium plus four Syd cohort.'
  }

  $assetIds = @(
    @($inventory.medium_migrations) + @($inventory.syd_migrations) |
      ForEach-Object { [string]$_.asset_id } |
      Sort-Object -Unique
  )
  if ($assetIds.Count -ne 109) {
    throw "Focused cleanup inventory must resolve to 109 unique asset IDs; found $($assetIds.Count)."
  }

  $manifest = Read-OipImageAssetManifest -Root $Root
  $candidate = Read-OipJsonHashtable -Path $CandidatePath -Label 'image review candidate report'
  $manifestSha = Get-OipCanonicalTextFileSha256 -Path $ManifestPath -Label 'image asset manifest' -RequireCanonical
  $candidateSha = Get-OipCanonicalTextFileSha256 -Path $CandidatePath -Label 'image review candidate report' -RequireCanonical
  if ([string]$candidate.manifest_sha256 -cne $manifestSha) {
    throw 'Image review candidate report is stale relative to the pending manifest.'
  }

  $candidateIds = @($candidate.candidates | ForEach-Object { [string]$_.id })
  foreach ($assetId in $assetIds) {
    if (-not $manifest.assets.Contains($assetId)) {
      throw "Focused review asset is missing from the manifest: $assetId"
    }
    if ($candidateIds -cnotcontains $assetId) {
      throw "Focused review asset is missing from the candidate report: $assetId"
    }
  }

  $allDeepIds = @($candidate.deep_review_selection | ForEach-Object { [string]$_.id } | Sort-Object -Unique)
  $deepIds = @($allDeepIds | Where-Object { $assetIds -ccontains $_ })
  if ($deepIds.Count -lt 24 -or [int]$candidate.focused_deep_review_count -ne $deepIds.Count) {
    throw "Focused review candidate report must bind at least 24 migrated deep-review assets and an exact focused_deep_review_count; found $($deepIds.Count)."
  }
  foreach ($sydId in @($assetIds | Where-Object { $_.StartsWith('essays/dialogues/', [StringComparison]::Ordinal) })) {
    if ($deepIds -cnotcontains $sydId) {
      throw "Focused deep-review selection omits Syd-and-Oliver hero: $sydId"
    }
  }

  return [pscustomobject]@{
    ActionId = $actionBinding.ActionId
    ActionRevision = $actionBinding.Revision
    Inventory = $inventory
    Manifest = $manifest
    Candidate = $candidate
    ManifestSha = $manifestSha
    CandidateSha = $candidateSha
    AssetIds = $assetIds
    AllDeepIds = $allDeepIds
    DeepIds = $deepIds
  }
}

$context = Get-OipReviewContext
$ActionId = [string]$context.ActionId

if ($InitializeEvidence) {
  if ($Write) {
    throw '-InitializeEvidence and -Write are separate explicit operations.'
  }
  if ([IO.File]::Exists($ResolvedEvidencePath)) {
    throw "Refusing to overwrite an existing focused visual-review record: $ResolvedEvidencePath"
  }

  $template = [ordered]@{
    schema_version = '1.0'
    action_id = $ActionId
    review_state = 'pending_review'
    review_date = $null
    review_actor = $null
    review_surface = '/image-review/'
    manifest_sha256_before_promotion = $context.ManifestSha
    manifest_sha256_basis = 'canonical_utf8_no_bom_lf_single_terminal_lf'
    candidate_report_sha256_before_promotion = $context.CandidateSha
    candidate_report_sha256_basis = 'canonical_utf8_no_bom_lf_single_terminal_lf'
    expected_asset_count = 109
    expected_asset_ids = $context.AssetIds
    reviewed_asset_ids = @()
    required_review_methods = $RequiredReviewMethods
    completed_review_methods = @()
    expected_deep_review_count = $context.DeepIds.Count
    expected_deep_review_ids = $context.DeepIds
    deep_reviewed_asset_ids = @()
    decode_sanity = [ordered]@{
      asset_count = 0
      decode_failure_count = $null
      outcome = 'pending'
    }
    quality_overrides = @()
    notes = @()
  }
  $parent = Split-Path -Parent $ResolvedEvidencePath
  if (-not [IO.Directory]::Exists($parent)) {
    [IO.Directory]::CreateDirectory($parent) | Out-Null
  }
  Write-OipCanonicalJsonFile -Path $ResolvedEvidencePath -Value $template -Depth 20
  $result = [ordered]@{
    mode = 'initialized_pending_evidence'
    action_id = $ActionId
    evidence_path = [IO.Path]::GetRelativePath($Root, $ResolvedEvidencePath).Replace('\','/')
    review_state = 'pending_review'
    expected_asset_count = 109
    expected_deep_review_count = $context.DeepIds.Count
    promoted_assets = 0
  }
  if ($Json) { [pscustomobject]$result | ConvertTo-Json -Depth 8 } else { [pscustomobject]$result }
  exit 0
}

$evidence = Read-OipJsonHashtable -Path $ResolvedEvidencePath -Label 'focused image visual-review record'
if ([string]$evidence.schema_version -cne '1.0') {
  throw 'Focused image visual-review record has an unsupported schema or action binding.'
}
$evidenceActionId = [string]$evidence.action_id
$evidenceActionRevision = Get-OipCleanupActionRevision -ActionId $evidenceActionId -Label 'Focused image visual-review action_id'
if ($evidenceActionRevision -gt [int]$context.ActionRevision) {
  throw "Focused image visual-review record targets a newer cleanup revision than the inventory: $evidenceActionId"
}
$evidenceUsesPriorRevision = $evidenceActionRevision -lt [int]$context.ActionRevision
if ([string]$evidence.manifest_sha256_before_promotion -cne $context.ManifestSha -or
  [string]$evidence.candidate_report_sha256_before_promotion -cne $context.CandidateSha) {
  $allApproved = @($context.AssetIds | Where-Object { [string]$context.Manifest.assets[$_].review_state -ceq 'approved' }).Count -eq 109
  if ($allApproved -and [IO.File]::Exists($VisualReviewPath)) {
    $visual = Read-OipJsonHashtable -Path $VisualReviewPath -Label 'aggregate image visual-review evidence'
    if ([string]$evidence.review_state -ceq 'pass') {
      Assert-OipPassEvidenceCoverage -Evidence $evidence -Context $context
    }
    if ([string]$evidence.review_state -ceq 'pass' -and
      [string]$visual.focused_cleanup_review.action_id -ceq $evidenceActionId -and
      [string]$visual.focused_cleanup_review.outcome -ceq 'pass' -and
      [int]$visual.focused_cleanup_review.reviewed_asset_count -eq 109 -and
      [string]$visual.focused_cleanup_review.reviewed_asset_ids_sha256 -ceq (Get-OipSha256ForStrings -Values $context.AssetIds) -and
      [int]$visual.focused_cleanup_review.deep_review_asset_count -eq $context.DeepIds.Count -and
      [string]$visual.focused_cleanup_review.deep_review_asset_ids_sha256 -ceq (Get-OipSha256ForStrings -Values $context.DeepIds) -and
      [int]$visual.quantitative_decode_sanity.asset_count -eq 458 -and
      [int]$visual.quantitative_decode_sanity.decode_failure_count -eq 0 -and
      [int]$visual.deep_review.asset_count -eq $context.AllDeepIds.Count -and
      [string]$visual.deep_review.outcome -ceq 'pass') {
      $result = [ordered]@{
        mode = 'verify_applied'
        inventory_action_id = $ActionId
        review_action_id = $evidenceActionId
        review_state = 'pass'
        expected_asset_count = 109
        expected_deep_review_count = $context.DeepIds.Count
        promoted_assets = 109
      }
      if ($Json) { [pscustomobject]$result | ConvertTo-Json -Depth 8 } else { [pscustomobject]$result }
      exit 0
    }
  }
  throw 'Focused visual-review record is stale relative to the pending manifest or candidate report.'
}

if ($evidenceUsesPriorRevision) {
  throw 'Prior-revision visual-review evidence may verify an already-applied promotion but cannot authorize a new promotion.'
}

if ([string]$evidence.review_state -cne 'pass') {
  if ($Write) {
    throw 'Promotion refused: focused image visual-review record is not PASS.'
  }
  $result = [ordered]@{
    mode = 'pending_review'
    review_state = [string]$evidence.review_state
    expected_asset_count = 109
    reviewed_asset_count = @($evidence.reviewed_asset_ids).Count
    expected_deep_review_count = $context.DeepIds.Count
    deep_reviewed_asset_count = @($evidence.deep_reviewed_asset_ids).Count
    promoted_assets = 0
  }
  if ($Json) { [pscustomobject]$result | ConvertTo-Json -Depth 8 } else { [pscustomobject]$result }
  exit 0
}

Assert-OipPassEvidenceCoverage -Evidence $evidence -Context $context

$overridesById = @{}
foreach ($override in @($evidence.quality_overrides)) {
  $id = [string]$override.id
  if ($context.AssetIds -cnotcontains $id -or $overridesById.ContainsKey($id)) {
    throw "Quality override is duplicate or outside the focused cohort: $id"
  }
  if ([int]$override.webp_quality -ne 90 -or [int]$override.avif_quality -ne 70 -or
    [string]::IsNullOrWhiteSpace([string]$override.reason)) {
    throw "Quality override must use the reviewed detail profile and record a reason: $id"
  }
  $overridesById[$id] = $override
}

foreach ($assetId in $context.AssetIds) {
  if ([string]$context.Manifest.assets[$assetId].review_state -cne 'pending_review') {
    throw "Promotion requires every focused asset to remain pending until the one bounded write: $assetId"
  }
}

$dryRunResult = [ordered]@{
  mode = if ($Write) { 'write' } else { 'dry_run' }
  review_state = 'pass'
  expected_asset_count = 109
  expected_deep_review_count = $context.DeepIds.Count
  quality_override_count = $overridesById.Count
  promoted_assets = if ($Write) { 109 } else { 0 }
}
if (-not $Write) {
  if ($Json) { [pscustomobject]$dryRunResult | ConvertTo-Json -Depth 8 } else { [pscustomobject]$dryRunResult }
  exit 0
}

foreach ($assetId in $context.AssetIds) {
  $context.Manifest.assets[$assetId].review_state = 'approved'
  if ($overridesById.ContainsKey($assetId)) {
    $context.Manifest.assets[$assetId].quality_override = [ordered]@{
      webp_quality = 90
      avif_quality = 70
    }
  }
}
Assert-OipImageAssetManifest -Manifest $context.Manifest

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-focused-review-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($tempRoot) | Out-Null
$stagedManifest = Join-Path $tempRoot 'image-assets.json'
$stagedCandidates = Join-Path $tempRoot 'image-review-candidates.json'
$stagedVisual = Join-Path $tempRoot 'image-visual-review.json'
try {
  Write-OipCanonicalJsonFile -Path $stagedManifest -Value ([ordered]@{
    schema_version = '1.0'
    defaults = $context.Manifest.defaults
    assets = $context.Manifest.assets
    aliases = $context.Manifest.aliases
  }) -Depth 14
  $promotedManifestSha = Get-OipCanonicalTextFileSha256 -Path $stagedManifest -Label 'staged promoted manifest' -RequireCanonical

  $context.Candidate.manifest_sha256 = $promotedManifestSha
  foreach ($candidate in @($context.Candidate.candidates)) {
    if ($context.AssetIds -ccontains [string]$candidate.id) {
      $candidate.review_state = 'approved'
    }
  }
  foreach ($selection in @($context.Candidate.deep_review_selection)) {
    if ($context.AssetIds -ccontains [string]$selection.id) {
      $selection.review_state = 'approved'
    }
  }
  Write-OipCanonicalJsonFile -Path $stagedCandidates -Value $context.Candidate -Depth 20
  $promotedCandidateSha = Get-OipCanonicalTextFileSha256 -Path $stagedCandidates -Label 'staged promoted candidate report' -RequireCanonical

  $visual = Read-OipJsonHashtable -Path $VisualReviewPath -Label 'aggregate image visual-review evidence'
  $approvedIds = @($context.Manifest.assets.Keys | Where-Object { [string]$context.Manifest.assets[$_].review_state -ceq 'approved' } | Sort-Object)
  if ($approvedIds.Count -ne 458) {
    throw "Promoted manifest must have 458 approved derivative-capable assets; found $($approvedIds.Count)."
  }
  $visual.review_date = [string]$evidence.review_date
  $visual.review_actor = [string]$evidence.review_actor
  $visual.manifest_sha256_before_review = $context.ManifestSha
  $visual.manifest_sha256_before_review_basis = 'canonical_utf8_no_bom_lf_single_terminal_lf'
  $visual.manifest_sha256_after_review = $promotedManifestSha
  $visual.manifest_sha256_after_review_basis = 'canonical_utf8_no_bom_lf_single_terminal_lf'
  $visual.candidate_report_sha256 = $promotedCandidateSha
  $visual.candidate_report_sha256_basis = 'canonical_utf8_no_bom_lf_single_terminal_lf'
  $visual.hash_reconciliation_date = [string]$evidence.review_date
  $visual.canonical_asset_count = 459
  $visual.all_contact_sheet_entries_reviewed = $true
  $visual.derivative_capable_asset_count = 458
  $visual.approved_derivative_capable_asset_count = 458
  $visual.approved_asset_ids_sha256 = Get-OipSha256ForStrings -Values $approvedIds
  $visual.review_method = @($evidence.completed_review_methods)
  $visual.quantitative_decode_sanity = [ordered]@{
    asset_count = 458
    decode_failure_count = 0
    outcome = 'pass'
  }
  $visual.deep_review = [ordered]@{
    asset_count = $context.AllDeepIds.Count
    outcome = 'pass'
    category_counts = $context.Candidate.deep_review_category_counts
  }
  $visual.quality_override_count = $overridesById.Count
  $visual.quality_override_decision = if ($overridesById.Count -eq 0) {
    'No focused-cleanup asset required the reviewed detail-quality override.'
  }
  else {
    "$($overridesById.Count) focused-cleanup assets use the reviewed detail-quality override."
  }
  $visual.focused_cleanup_review = [ordered]@{
    action_id = $ActionId
    outcome = 'pass'
    review_date = [string]$evidence.review_date
    review_actor = [string]$evidence.review_actor
    reviewed_asset_count = 109
    reviewed_asset_ids_sha256 = Get-OipSha256ForStrings -Values $context.AssetIds
    deep_review_asset_count = $context.DeepIds.Count
    deep_review_asset_ids_sha256 = Get-OipSha256ForStrings -Values $context.DeepIds
    decode_failure_count = 0
    quality_override_count = $overridesById.Count
  }
  Write-OipCanonicalJsonFile -Path $stagedVisual -Value $visual -Depth 30

  $targets = [ordered]@{
    $ManifestPath = $stagedManifest
    $CandidatePath = $stagedCandidates
    $VisualReviewPath = $stagedVisual
  }
  $preconditionHashes = [ordered]@{}
  $backups = [ordered]@{}
  foreach ($target in $targets.Keys) {
    $preconditionHashes[$target] = Get-OipCanonicalTextFileSha256 -Path $target -Label "promotion target $target" -RequireCanonical
    $backup = Join-Path $tempRoot ([IO.Path]::GetFileName($target) + '.backup')
    [IO.File]::Copy($target, $backup, $true)
    $backups[$target] = $backup
  }

  $commitSucceeded = $false
  try {
    foreach ($target in $targets.Keys) {
      if ((Get-OipCanonicalTextFileSha256 -Path $target -Label "promotion precondition $target" -RequireCanonical) -cne [string]$preconditionHashes[$target]) {
        throw "Promotion input changed after staging: $target"
      }
    }
    foreach ($target in $targets.Keys) {
      [IO.File]::Copy([string]$targets[$target], $target, $true)
    }
    $commitSucceeded = $true
  }
  finally {
    if (-not $commitSucceeded) {
      foreach ($target in $backups.Keys) {
        [IO.File]::Copy([string]$backups[$target], $target, $true)
      }
    }
  }

  if ($Json) { [pscustomobject]$dryRunResult | ConvertTo-Json -Depth 8 } else { [pscustomobject]$dryRunResult }
}
finally {
  if ([IO.Directory]::Exists($tempRoot) -and
    [IO.Path]::GetFullPath($tempRoot).StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -and
    [IO.Path]::GetFileName($tempRoot) -like 'oip-focused-review-*') {
    [IO.Directory]::Delete($tempRoot, $true)
  }
}
