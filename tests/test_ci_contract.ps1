Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$agentsPath = Join-Path $repoRoot "AGENTS.md"
$publishingWorkflowDocPath = Join-Path $repoRoot "docs/publishing-workflow.md"
$seoRolloutDocPath = Join-Path $repoRoot "docs/seo-rollout.md"
$readmePath = Join-Path $repoRoot "README.md"
$codexWorkflowPath = Join-Path $repoRoot "CODEX_WORKFLOW.md"
$deployWorkflowPath = Join-Path $repoRoot ".github/workflows/deploy.yml"
$refreshWorkflowPath = Join-Path $repoRoot ".github/workflows/refresh-analytics.yml"
$authorDirectoryContractPath = Join-Path $repoRoot "tests/test_author_directory_contract.ps1"
$publicOutputHelperPath = Join-Path $repoRoot "tests/helpers/public_output_common.ps1"
$publicRouteDebugPath = Join-Path $repoRoot "tests/show_public_route_debug.ps1"
$publicManifestWriterPath = Join-Path $repoRoot "tests/write_public_build_manifest.ps1"
$publicOutputTestPath = Join-Path $repoRoot "tests/test_public_html_output.ps1"
$publicRouteSmokePath = Join-Path $repoRoot "tests/test_public_route_smoke.ps1"
$legacyRenderContractPath = Join-Path $repoRoot "tests/test_legacy_render_contract.ps1"
$seoRolloutContractPath = Join-Path $repoRoot "tests/test_seo_rollout_contract.ps1"

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

if (-not (Test-Path $codexWorkflowPath -PathType Leaf)) {
  throw "CODEX_WORKFLOW.md is required for the CI contract test."
}

foreach ($requiredValidationPath in @(
  $authorDirectoryContractPath,
  $publicOutputHelperPath,
  $publicRouteDebugPath,
  $publicManifestWriterPath,
  $publicOutputTestPath,
  $publicRouteSmokePath,
  $legacyRenderContractPath,
  $seoRolloutContractPath
)) {
  if (-not (Test-Path $requiredValidationPath -PathType Leaf)) {
    throw "Missing SEO validation helper: $requiredValidationPath"
  }
}

$agents = Get-Content -Path $agentsPath -Raw
$publishingWorkflowDoc = Get-Content -Path $publishingWorkflowDocPath -Raw
$seoRolloutDoc = Get-Content -Path $seoRolloutDocPath -Raw
$readme = Get-Content -Path $readmePath -Raw
$codexWorkflow = Get-Content -Path $codexWorkflowPath -Raw
$deployWorkflow = Get-Content -Path $deployWorkflowPath -Raw
$refreshWorkflow = Get-Content -Path $refreshWorkflowPath -Raw
$publicOutputHelper = Get-Content -Path $publicOutputHelperPath -Raw
$publicManifestWriter = Get-Content -Path $publicManifestWriterPath -Raw
$publicOutputTest = Get-Content -Path $publicOutputTestPath -Raw

if ($agents -notmatch 'docs/publishing-workflow\.md') {
  throw "AGENTS.md must point publishing sessions at docs/publishing-workflow.md."
}

if ($publishingWorkflowDoc -notmatch 'tools\\bin\\generated\\') {
  throw "docs/publishing-workflow.md must reference the repo-local generated wrappers."
}

if ($publishingWorkflowDoc -notmatch 'main') {
  throw "docs/publishing-workflow.md must describe publishing through main."
}

if ($readme -notmatch 'docs/publishing-workflow\.md') {
  throw "README.md must reference docs/publishing-workflow.md."
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

if ($deployWorkflow -notmatch "fetch-depth:\s*0") {
  throw "deploy.yml must fetch full history so changed-file guardrails can diff essay edits."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_essay_guardrails\.ps1") {
  throw "deploy.yml must run the essay guardrail regression test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_schema_template_contract\.ps1") {
  throw "deploy.yml must run the schema template contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_author_directory_contract\.ps1") {
  throw "deploy.yml must run the author directory contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_indexation_policy_contract\.ps1") {
  throw "deploy.yml must run the indexation policy contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_discovery_surface_contract\.ps1") {
  throw "deploy.yml must run the discovery surface contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_seo_rollout_contract\.ps1") {
  throw "deploy.yml must run the SEO rollout contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_legacy_render_contract\.ps1") {
  throw "deploy.yml must run the legacy render contract test."
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

$publicRouteSmokeIndex = $deployWorkflow.IndexOf("./tests/test_public_route_smoke.ps1")
$publicHtmlOutputIndex = $deployWorkflow.IndexOf("./tests/test_public_html_output.ps1 -RequireFreshBuild")
if ($publicRouteSmokeIndex -lt 0 -or $publicHtmlOutputIndex -lt 0 -or $publicRouteSmokeIndex -gt $publicHtmlOutputIndex) {
  throw "deploy.yml must run the public route smoke test before the full generated-output regression test."
}

if ($deployWorkflow -notmatch "\.\/tests\/show_public_route_debug\.ps1") {
  throw "deploy.yml must expose a failure-only public route debug step."
}

if ($deployWorkflow -notmatch "actions\/upload-artifact@v4") {
  throw "deploy.yml must upload a failure-only public route debug artifact."
}

foreach ($requiredDebugPath in @(
  'public/authors/**',
  'public/about/**',
  'public/random/**',
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

if ($publicOutputTest -notmatch '\[switch\]\$RequireFreshBuild') {
  throw "tests/test_public_html_output.ps1 must accept -RequireFreshBuild."
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
