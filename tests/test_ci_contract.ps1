Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$agentsPath = Join-Path $repoRoot "AGENTS.md"
$publishingWorkflowDocPath = Join-Path $repoRoot "docs/publishing-workflow.md"
$localValidationPolicyPath = Join-Path $repoRoot "docs/local-validation-policy.md"
$legacyEssayNormalizationPath = Join-Path $repoRoot "docs/legacy-essay-normalization.md"
$seoRolloutDocPath = Join-Path $repoRoot "docs/seo-rollout.md"
$readmePath = Join-Path $repoRoot "README.md"
$packageJsonPath = Join-Path $repoRoot "package.json"
$codexWorkflowPath = Join-Path $repoRoot "CODEX_WORKFLOW.md"
$hugoConfigPath = Join-Path $repoRoot "hugo.toml"
$deployWorkflowPath = Join-Path $repoRoot ".github/workflows/deploy.yml"
$refreshWorkflowPath = Join-Path $repoRoot ".github/workflows/refresh-analytics.yml"
$seoMetadataAuditPath = Join-Path $repoRoot "scripts/audit_seo_metadata.ps1"
$authorDirectoryContractPath = Join-Path $repoRoot "tests/test_author_directory_contract.ps1"
$appsToolsContractPath = Join-Path $repoRoot "tests/test_apps_tools_contract.ps1"
$publicOutputHelperPath = Join-Path $repoRoot "tests/helpers/public_output_common.ps1"
$publicRouteDebugPath = Join-Path $repoRoot "tests/show_public_route_debug.ps1"
$publicManifestWriterPath = Join-Path $repoRoot "tests/write_public_build_manifest.ps1"
$publicOutputTestPath = Join-Path $repoRoot "tests/test_public_html_output.ps1"
$publicRouteSmokePath = Join-Path $repoRoot "tests/test_public_route_smoke.ps1"
$legacyRenderContractPath = Join-Path $repoRoot "tests/test_legacy_render_contract.ps1"
$essayImageAuditTestPath = Join-Path $repoRoot "tests/test_essay_image_audit.ps1"
$essayImageAuditPath = Join-Path $repoRoot "scripts/audit_essay_images.ps1"
$seoRolloutContractPath = Join-Path $repoRoot "tests/test_seo_rollout_contract.ps1"
$almanackModuleDataContractPath = Join-Path $repoRoot "tests/test_almanack_module_data.ps1"
$editorialCartoonScheduleContractPath = Join-Path $repoRoot "tests/test_editorial_cartoon_schedule_contract.ps1"
$affirmationContractPath = Join-Path $repoRoot "tests/test_affirmation_contract.ps1"
$responsiveImageSourceContractPath = Join-Path $repoRoot "tests/test_responsive_image_source_contract.ps1"
$responsiveImageOutputContractPath = Join-Path $repoRoot "tests/test_responsive_image_output_contract.ps1"
$responsiveImageNodeContractPath = Join-Path $repoRoot "tests/responsive_image_contract.test.mjs"
$responsiveImageGuidePath = Join-Path $repoRoot "docs/responsive-image-pipeline.md"

if (-not (Test-Path $agentsPath -PathType Leaf)) {
  throw "AGENTS.md is required for repo-local publishing session guidance."
}

if (-not (Test-Path $publishingWorkflowDocPath -PathType Leaf)) {
  throw "docs/publishing-workflow.md is required as the canonical publishing workflow guide."
}

if (-not (Test-Path $seoRolloutDocPath -PathType Leaf)) {
  throw "docs/seo-rollout.md is required as the SEO rollout operations guide."
}

if (-not (Test-Path $readmePath -PathType Leaf)) {
  throw "README.md is required for the CI contract test."
}

if (-not (Test-Path $packageJsonPath -PathType Leaf)) {
  throw "package.json is required for the CI contract test."
}

if (-not (Test-Path $codexWorkflowPath -PathType Leaf)) {
  throw "CODEX_WORKFLOW.md is required for the CI contract test."
}

if (-not (Test-Path $hugoConfigPath -PathType Leaf)) {
  throw "hugo.toml is required for the CI contract test."
}

foreach ($requiredValidationPath in @(
  $authorDirectoryContractPath,
  $appsToolsContractPath,
  $publicOutputHelperPath,
  $publicRouteDebugPath,
  $publicManifestWriterPath,
  $publicOutputTestPath,
  $publicRouteSmokePath,
  $legacyRenderContractPath,
  $essayImageAuditTestPath,
  $essayImageAuditPath,
  $seoRolloutContractPath,
  $almanackModuleDataContractPath,
  $editorialCartoonScheduleContractPath,
  $responsiveImageSourceContractPath,
  $responsiveImageOutputContractPath,
  $responsiveImageNodeContractPath,
  $responsiveImageGuidePath,
  $seoMetadataAuditPath
)) {
  if (-not (Test-Path $requiredValidationPath -PathType Leaf)) {
    throw "Missing SEO validation helper: $requiredValidationPath"
  }
}

$agents = Get-Content -Path $agentsPath -Raw
$publishingWorkflowDoc = Get-Content -Path $publishingWorkflowDocPath -Raw
$localValidationPolicy = Get-Content -Path $localValidationPolicyPath -Raw
$legacyEssayNormalization = Get-Content -Path $legacyEssayNormalizationPath -Raw
$seoRolloutDoc = Get-Content -Path $seoRolloutDocPath -Raw
$readme = Get-Content -Path $readmePath -Raw
$packageJson = Get-Content -Path $packageJsonPath -Raw
$codexWorkflow = Get-Content -Path $codexWorkflowPath -Raw
$hugoConfig = Get-Content -Path $hugoConfigPath -Raw
$deployWorkflow = Get-Content -Path $deployWorkflowPath -Raw
$refreshWorkflow = Get-Content -Path $refreshWorkflowPath -Raw
$publicOutputHelper = Get-Content -Path $publicOutputHelperPath -Raw
$publicManifestWriter = Get-Content -Path $publicManifestWriterPath -Raw
$publicOutputTest = Get-Content -Path $publicOutputTestPath -Raw
$seoMetadataAudit = Get-Content -Path $seoMetadataAuditPath -Raw
$responsiveImageOutputContract = Get-Content -Path $responsiveImageOutputContractPath -Raw

function Assert-WorkflowActionReferences {
  param(
    [Parameter(Mandatory)]
    [string]$WorkflowName,

    [Parameter(Mandatory)]
    [string]$WorkflowText,

    [Parameter(Mandatory)]
    [hashtable]$ExpectedReferences
  )

  $actualCounts = @{}
  foreach ($match in [regex]::Matches($WorkflowText, '(?m)^\s*uses:\s*(actions/[^\s#]+)\s*$')) {
    $reference = $match.Groups[1].Value
    if (-not $actualCounts.ContainsKey($reference)) {
      $actualCounts[$reference] = 0
    }
    $actualCounts[$reference]++
  }

  foreach ($expected in $ExpectedReferences.GetEnumerator()) {
    $actualCount = if ($actualCounts.ContainsKey($expected.Key)) {
      [int]$actualCounts[$expected.Key]
    }
    else {
      0
    }

    if ($actualCount -ne [int]$expected.Value) {
      throw "$WorkflowName must reference '$($expected.Key)' exactly $($expected.Value) time(s); found $actualCount."
    }
  }

  $unexpectedReferences = @(
    $actualCounts.Keys |
      Where-Object { -not $ExpectedReferences.ContainsKey($_) } |
      Sort-Object
  )
  if ($unexpectedReferences.Count -gt 0) {
    throw "$WorkflowName contains unexpected GitHub Action references: $($unexpectedReferences -join ', ')."
  }
}

function Get-WorkflowStepBlock {
  param(
    [Parameter(Mandatory)]
    [string]$WorkflowName,

    [Parameter(Mandatory)]
    [string]$WorkflowText,

    [Parameter(Mandatory)]
    [string]$StepName
  )

  $pattern = '(?ms)^      - name:\s*' + [regex]::Escape($StepName) + '\s*\r?\n.*?(?=^      - name:|\z)'
  $stepMatch = [regex]::Match($WorkflowText, $pattern)
  if (-not $stepMatch.Success) {
    throw "$WorkflowName must contain the '$StepName' step."
  }

  return $stepMatch.Value
}

. (Join-Path $repoRoot "tools/lib/Toolchain.Wrapper.ps1")

$wrapperArgumentFixture = [pscustomobject]@{
  default_arguments = @()
}
$singleWrapperArgument = Get-WrapperArguments -Wrapper $wrapperArgumentFixture -Arguments @('version') -RepoRoot $repoRoot -ProfileContext @{}
if ($singleWrapperArgument -isnot [array] -or $singleWrapperArgument.Count -ne 1 -or $singleWrapperArgument[0] -ne 'version') {
  throw "Toolchain wrappers must preserve single runtime arguments as one-element arrays."
}

$multipleWrapperArguments = Get-WrapperArguments -Wrapper $wrapperArgumentFixture -Arguments @('--gc', '--minify') -RepoRoot $repoRoot -ProfileContext @{}
if ($multipleWrapperArguments.Count -ne 2 -or $multipleWrapperArguments[0] -ne '--gc' -or $multipleWrapperArguments[1] -ne '--minify') {
  throw "Toolchain wrappers must preserve ordered runtime arguments."
}

if ($agents -notmatch 'docs/publishing-workflow\.md') {
  throw "AGENTS.md must point publishing sessions at docs/publishing-workflow.md."
}

if ($publishingWorkflowDoc -notmatch 'tools\\bin\\generated\\') {
  throw "docs/publishing-workflow.md must reference the repo-local generated wrappers."
}

if ($packageJson -match '"(?:audit:essays|check:essays|check:essays:publish)"\s*:\s*"pwsh\s+-File') {
  throw "package.json essay scripts must use the repo-local generated pwsh wrapper, not bare pwsh."
}

if ($packageJson -notmatch '\.\\\\tools\\\\bin\\\\generated\\\\pwsh\.cmd -NoLogo -NoProfile -File \./scripts/check_essay_guardrails\.ps1') {
  throw "package.json essay guardrail scripts must call scripts/check_essay_guardrails.ps1 through .\\tools\\bin\\generated\\pwsh.cmd."
}

if ($publishingWorkflowDoc -notmatch 'main') {
  throw "docs/publishing-workflow.md must describe publishing through main."
}

if ($readme -notmatch 'docs/publishing-workflow\.md') {
  throw "README.md must reference docs/publishing-workflow.md."
}

foreach ($publishGuide in @(
  @{ Name = 'README.md'; Text = $readme },
  @{ Name = 'CODEX_WORKFLOW.md'; Text = $codexWorkflow },
  @{ Name = 'docs/local-validation-policy.md'; Text = $localValidationPolicy },
  @{ Name = 'docs/legacy-essay-normalization.md'; Text = $legacyEssayNormalization },
  @{ Name = 'docs/publishing-workflow.md'; Text = $publishingWorkflowDoc }
)) {
  if ($publishGuide.Text -notmatch 'RequireEditorialPhilosophyAudit') {
    throw "$($publishGuide.Name) must document the Editorial Philosophy Audit publish gate."
  }
}

if ($publishingWorkflowDoc -notmatch 'reports, and working papers') {
  throw "docs/publishing-workflow.md must say reports and working papers are covered by the Editorial Philosophy Audit gate."
}

if ($publishingWorkflowDoc -notmatch 'Syd & Oliver') {
  throw "docs/publishing-workflow.md must document the Syd & Oliver exclusion from the hard Editorial Philosophy Audit gate."
}

if ($readme -notmatch 'docs/seo-rollout\.md') {
  throw "README.md must reference docs/seo-rollout.md."
}

if ($codexWorkflow -notmatch 'docs/publishing-workflow\.md') {
  throw "CODEX_WORKFLOW.md must reference docs/publishing-workflow.md."
}

if ($seoRolloutDoc -notmatch 'freeze_seo_rollout_baseline\.ps1') {
  throw "docs/seo-rollout.md must document baseline freezing."
}

if ($seoRolloutDoc -notmatch 'probe_seo_rollout\.ps1') {
  throw "docs/seo-rollout.md must document canonical and legacy host probing."
}

if ($seoRolloutDoc -notmatch 'report_seo_rollout_window\.ps1') {
  throw "docs/seo-rollout.md must document rollout measurement reporting."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_ci_contract\.ps1") {
  throw "deploy.yml must run the CI contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_hugo_upgrade_contract\.ps1") {
  throw "deploy.yml must run the Hugo upgrade contract test."
}

if ($deployWorkflow -notmatch 'node --test tests/all\.test\.mjs') {
  throw "deploy.yml must run the complete Node contract suite through tests/all.test.mjs."
}

$setupNodeStep = Get-WorkflowStepBlock `
  -WorkflowName "deploy.yml" `
  -WorkflowText $deployWorkflow `
  -StepName "Setup Node for contract tests"
if ($setupNodeStep -notmatch '(?m)^\s*uses:\s*actions/setup-node@v6\s*$' -or
  $setupNodeStep -notmatch '(?m)^\s*node-version:\s*"20\.20\.2"\s*$' -or
  $setupNodeStep -notmatch '(?m)^\s*package-manager-cache:\s*false\s*$') {
  throw "deploy.yml must run Node contracts with the pinned Node 20.20.2 runtime and no package-manager cache."
}

$responsiveImageSourceStep = Get-WorkflowStepBlock `
  -WorkflowName "deploy.yml" `
  -WorkflowText $deployWorkflow `
  -StepName "Test Responsive Image Source Contract"
if ($responsiveImageSourceStep -notmatch "\.\/tests\/test_responsive_image_source_contract\.ps1") {
  throw "deploy.yml must run the responsive-image source contract before building."
}
if ($responsiveImageSourceStep -match '(?i)AllowPendingReview') {
  throw "CI must run the fail-closed responsive-image source contract without -AllowPendingReview."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_responsive_image_output_contract\.ps1\s+-SiteDir\s+public") {
  throw "deploy.yml must run the responsive-image generated-output contract."
}

$cacheStep = Get-WorkflowStepBlock `
  -WorkflowName "deploy.yml" `
  -WorkflowText $deployWorkflow `
  -StepName "Cache Hugo image resources"
foreach ($requiredCacheSnippet in @(
  'actions/cache@v5',
  'path: resources/_gen',
  'tools/toolchain.manifest.json',
  'hugo.toml',
  'data/image-assets.json',
  'assets/images/originals/**',
  'layouts/partials/images/**',
  'layouts/_default/_markup/render-image.html',
  'layouts/partials/metadata_image.html',
  'layouts/partials/opengraph.html',
  'layouts/partials/twitter_cards.html',
  'layouts/partials/schema/image.html'
)) {
  if (-not $cacheStep.Contains($requiredCacheSnippet, [System.StringComparison]::Ordinal)) {
    throw "Hugo image cache key is missing dependency: $requiredCacheSnippet"
  }
}
if ($cacheStep -match '(?m)^\s*restore-keys:') {
  throw "Hugo image resources must use an exact content key; broad restore keys can restore stale derivatives."
}

if ($deployWorkflow -notmatch '(?ms)^\s{2}build:\s*\r?\n.*?^\s{4}timeout-minutes:\s*20\s*$') {
  throw "The image-generating Hugo build job must have a 20-minute timeout."
}

$hugoBuildStep = Get-WorkflowStepBlock `
  -WorkflowName "deploy.yml" `
  -WorkflowText $deployWorkflow `
  -StepName "Build Hugo"
foreach ($requiredBuildSnippet in @(
  'hugo --gc --minify --panicOnWarning',
  'steps.hugo-image-cache.outputs.cache-hit',
  'limit_seconds=900',
  'limit_seconds=300'
)) {
  if (-not $hugoBuildStep.Contains($requiredBuildSnippet, [System.StringComparison]::Ordinal)) {
    throw "Build Hugo must enforce cold/restored-cache timing through: $requiredBuildSnippet"
  }
}

foreach ($budgetContract in @(
  @{ Pattern = '(?m)^\$maxArtifactBytes\s*=\s*600MB\s*$'; Name = '600 MiB Pages artifact' },
  @{ Pattern = '(?m)^\$maxPublicImageBytes\s*=\s*500MB\s*$'; Name = '500 MiB public/images' },
  @{ Pattern = '(?m)^\$maxDerivativeBytes\s*=\s*1MB\s*$'; Name = '1 MiB derivative' },
  @{ Pattern = '(?m)^\$maxGeneratedImages\s*=\s*5000\s*$'; Name = '5,000 generated images' },
  @{ Pattern = '(?m)^\$maxPublicFiles\s*=\s*6500\s*$'; Name = '6,500 public files' }
)) {
  if ($responsiveImageOutputContract -notmatch $budgetContract.Pattern) {
    throw "Responsive-image output contract must enforce the $($budgetContract.Name) budget."
  }
}

Assert-WorkflowActionReferences `
  -WorkflowName "deploy.yml" `
  -WorkflowText $deployWorkflow `
  -ExpectedReferences @{
    'actions/checkout@v7' = 3
    'actions/setup-node@v6' = 1
    'actions/cache@v5' = 1
    'actions/configure-pages@v6' = 1
    'actions/deploy-pages@v5' = 1
    'actions/upload-artifact@v7' = 2
    'actions/upload-pages-artifact@v5' = 1
  }

Assert-WorkflowActionReferences `
  -WorkflowName "refresh-analytics.yml" `
  -WorkflowText $refreshWorkflow `
  -ExpectedReferences @{
    'actions/checkout@v7' = 1
  }

if (($deployWorkflow + "`n" + $refreshWorkflow) -match 'ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION') {
  throw "GitHub Actions workflows must not opt back into the unsupported Node 20 runtime."
}

if ($deployWorkflow -notmatch "fetch-depth:\s*0") {
  throw "deploy.yml must fetch full history so changed-file guardrails can diff essay edits."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_essay_guardrails\.ps1") {
  throw "deploy.yml must run the essay guardrail regression test."
}

if (-not (Test-Path $affirmationContractPath -PathType Leaf)) {
  throw "tests/test_affirmation_contract.ps1 is required for The Things We Say."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_affirmation_contract\.ps1") {
  throw "deploy.yml must run the Affirmation publication contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_essay_image_audit\.ps1") {
  throw "deploy.yml must run the essay image audit regression test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_schema_template_contract\.ps1") {
  throw "deploy.yml must run the schema template contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_author_directory_contract\.ps1") {
  throw "deploy.yml must run the author directory contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_apps_tools_contract\.ps1") {
  throw "deploy.yml must run the Apps & Tools contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_indexation_policy_contract\.ps1") {
  throw "deploy.yml must run the indexation policy contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_discovery_surface_contract\.ps1") {
  throw "deploy.yml must run the discovery surface contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_almanack_module_data\.ps1") {
  throw "deploy.yml must run the Almanack module data contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_editorial_cartoon_schedule_contract\.ps1") {
  throw "deploy.yml must run the editorial cartoon schedule contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_seo_rollout_contract\.ps1") {
  throw "deploy.yml must run the SEO rollout contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_legacy_render_contract\.ps1") {
  throw "deploy.yml must run the legacy render contract test."
}

if ($deployWorkflow -notmatch "\.\/scripts\/audit_essay_images\.ps1\s+-FailOnIssues") {
  throw "deploy.yml must run the essay image audit before building the site."
}

if ($deployWorkflow -notmatch "\.\/tests\/write_public_build_manifest\.ps1") {
  throw "deploy.yml must write a fresh-build manifest before running generated-output validation."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_public_route_smoke\.ps1") {
  throw "deploy.yml must run the public route smoke test before generated-output validation."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_public_html_output\.ps1\s+-RequireFreshBuild") {
  throw "deploy.yml must run the generated-output regression test with -RequireFreshBuild."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_games_catalog_contract\.ps1\s+-SiteDir\s+public\s+-Mode\s+Production") {
  throw "deploy.yml must run the Games catalog production-output contract."
}

if ($deployWorkflow -notmatch '(?m)^\s+schedule:\s*\r?\n\s+-\s+cron:\s*"17 0 \* \* \*"\s*\r?\n\s+timezone:\s*"America/New_York"') {
  throw "deploy.yml must schedule regular rebuilds so future-dated essays can become public without a new commit."
}

if ($deployWorkflow -notmatch '(?m)^\s+TZ:\s*America/New_York\s*$') {
  throw "deploy.yml must build in the Outside In Print publishing timezone."
}

if ($hugoConfig -notmatch '(?m)^timeZone\s*=\s*"America/New_York"\s*$') {
  throw "hugo.toml must set the Outside In Print publishing timezone."
}

if ($deployWorkflow -match '(?m)^\s*run:\s*hugo\s+--gc\s+--minify\s+--buildFuture\b') {
  throw "deploy.yml must not publish future-dated content early with --buildFuture."
}

$publicRouteSmokeIndex = $deployWorkflow.IndexOf("./tests/test_public_route_smoke.ps1")
$publicHtmlOutputIndex = $deployWorkflow.IndexOf("./tests/test_public_html_output.ps1 -RequireFreshBuild")
if ($publicRouteSmokeIndex -lt 0 -or $publicHtmlOutputIndex -lt 0 -or $publicRouteSmokeIndex -gt $publicHtmlOutputIndex) {
  throw "deploy.yml must run the public route smoke test before the full generated-output regression test."
}

if ($deployWorkflow -notmatch "\.\/tests\/show_public_route_debug\.ps1") {
  throw "deploy.yml must expose a failure-only public route debug step."
}

$publicRouteDebugArtifactStep = Get-WorkflowStepBlock `
  -WorkflowName "deploy.yml" `
  -WorkflowText $deployWorkflow `
  -StepName "Upload Public Route Debug Artifact"
if ($publicRouteDebugArtifactStep -notmatch '(?m)^\s*include-hidden-files:\s*true\s*$') {
  throw "The public route debug artifact must include hidden files so it captures .oip-build-manifest.json."
}

$pagesArtifactStep = Get-WorkflowStepBlock `
  -WorkflowName "deploy.yml" `
  -WorkflowText $deployWorkflow `
  -StepName "Upload artifact"
if ($pagesArtifactStep -notmatch '(?m)^\s*include-hidden-files:\s*true\s*$') {
  throw "The GitHub Pages artifact must include hidden files so .oip-build-manifest.json remains public."
}

foreach ($requiredDebugPath in @(
  'public/authors/**',
  'public/about/**',
  'public/random/**',
  'public/games/**',
  'public/.oip-build-manifest.json'
)) {
  if ($deployWorkflow -notmatch [regex]::Escape($requiredDebugPath)) {
    throw "deploy.yml must include '$requiredDebugPath' in the failure-only public route debug artifact."
  }
}

if ($deployWorkflow -notmatch 'if:\s*failure\(\)') {
  throw "deploy.yml must keep the public route debug steps failure-only."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_live_seo_smoke\.ps1\s+-BaseUrl\s+""https://outsideinprint\.org""") {
  throw "deploy.yml must run the canonical-host smoke test against https://outsideinprint.org."
}

if ($deployWorkflow -notmatch "\.\/scripts\/probe_seo_rollout\.ps1") {
  throw "deploy.yml must probe the canonical and legacy hosts after deploy."
}

if ($deployWorkflow -notmatch "\.\/scripts\/check_essay_guardrails\.ps1") {
  throw "deploy.yml must run the essay guardrail check before building the site."
}

if ($deployWorkflow -notmatch "RequireEditorialPhilosophyAudit") {
  throw "deploy.yml must require Editorial Philosophy Audit evidence for changed non-draft essays, reports, and working papers."
}

if ($deployWorkflow -notmatch "needs:\s*contracts") {
  throw "deploy.yml must separate contract tests from the Hugo build by making the build job depend on the contracts job."
}

if ($refreshWorkflow -notmatch "GOATCOUNTER_API_URL:\s*\$\{\{\s*vars\.GOATCOUNTER_API_URL\s*\}\}") {
  throw "refresh-analytics.yml must pass GOATCOUNTER_API_URL through to the fetch step."
}

if ($refreshWorkflow -notmatch "\.\/scripts\/report_seo_rollout_window\.ps1") {
  throw "refresh-analytics.yml must generate the rollout measurement report."
}

if ($publicOutputHelper -notmatch 'function\s+Test-PublicBuildFreshness') {
  throw "tests/helpers/public_output_common.ps1 must expose Test-PublicBuildFreshness."
}

if ($publicManifestWriter -notmatch 'Write-PublicBuildManifest') {
  throw "tests/write_public_build_manifest.ps1 must write the public build manifest."
}

if ($publicManifestWriter -notmatch '#requires\s+-Version\s+7\.0') {
  throw "tests/write_public_build_manifest.ps1 must require PowerShell 7 so freshness fingerprints match CI."
}

if ($publicOutputTest -notmatch '\[switch\]\$RequireFreshBuild') {
  throw "tests/test_public_html_output.ps1 must accept -RequireFreshBuild."
}

if ($publicOutputTest -notmatch '#requires\s+-Version\s+7\.0') {
  throw "tests/test_public_html_output.ps1 must require PowerShell 7 so generated-output validation uses the supported engine."
}

if ($seoMetadataAudit -notmatch '#requires\s+-Version\s+7\.0') {
  throw "scripts/audit_seo_metadata.ps1 must require PowerShell 7 because it uses PS7-only syntax."
}

if ($publicOutputTest -notmatch 'Test-PublicBuildFreshness') {
  throw "tests/test_public_html_output.ps1 must verify fresh build state before asserting generated output."
}

if ($publicOutputTest -notmatch 'Skipping generated-output regression test') {
  throw "tests/test_public_html_output.ps1 must explain when generated-output validation is skipped outside a fresh build."
}

if ($publicOutputTest -notmatch 'requiredIndexationPages\.Contains\(\$relativePath\)') {
  throw "tests/test_public_html_output.ps1 must load indexation coverage pages into the generated-output validation set."
}

$templateSyntaxGuardPaths = @(
  (Join-Path $repoRoot 'layouts/partials/article'),
  (Join-Path $repoRoot 'layouts/partials/discovery'),
  (Join-Path $repoRoot 'layouts/partials/collections'),
  (Join-Path $repoRoot 'layouts/partials/metadata'),
  (Join-Path $repoRoot 'layouts/partials/schema')
)

foreach ($guardPath in $templateSyntaxGuardPaths) {
  foreach ($templatePath in @(Get-ChildItem -Path $guardPath -Recurse -File)) {
    $lines = @(Get-Content -Path $templatePath.FullName)
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -notmatch '\$\w+\s*:?=\s*dict\s*$') {
        continue
      }

      for ($j = $i + 1; $j -lt $lines.Count; $j++) {
        if ($lines[$j] -match '\}\}') {
          if ($lines[$j] -match '^\s*\)\s*-?\}\}\s*$') {
            $relativeTemplatePath = $templatePath.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
            throw "Found malformed Hugo dict assignment with a dangling closing parenthesis in $relativeTemplatePath."
          }

          break
        }
      }
    }
  }
}

foreach ($guardPath in $templateSyntaxGuardPaths) {
  foreach ($templatePath in @(Get-ChildItem -Path $guardPath -Recurse -File)) {
    $templateContent = Get-Content -Path $templatePath.FullName -Raw
    if ($templateContent -match '\{\{-\s*return\s+[^}]+-\}\}') {
      $relativeTemplatePath = $templatePath.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
      throw "Found trim-marked Hugo return syntax in $relativeTemplatePath; use plain {{ return ... }} for value-returning partials."
    }
  }
}

Write-Host "CI contract tests passed."
$global:LASTEXITCODE = 0
exit 0
