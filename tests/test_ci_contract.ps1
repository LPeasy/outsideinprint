Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $repoRoot "package.json"
$nvmrcPath = Join-Path $repoRoot ".nvmrc"
$deployWorkflowPath = Join-Path $repoRoot ".github/workflows/deploy.yml"
$dashboardWorkflowPath = Join-Path $repoRoot ".github/workflows/publish-dashboard.yml"
$refreshWorkflowPath = Join-Path $repoRoot ".github/workflows/refresh-analytics.yml"
$publicOutputHelperPath = Join-Path $repoRoot "tests/helpers/public_output_common.ps1"
$publicManifestWriterPath = Join-Path $repoRoot "tests/write_public_build_manifest.ps1"
$publicOutputTestPath = Join-Path $repoRoot "tests/test_public_html_output.ps1"
$legacyRenderContractPath = Join-Path $repoRoot "tests/test_legacy_render_contract.ps1"

if (-not (Test-Path $packagePath -PathType Leaf)) {
  throw "package.json is required for the CI contract test."
}

if (-not (Test-Path $nvmrcPath -PathType Leaf)) {
  throw ".nvmrc is required so local and CI Node versions stay aligned."
}

foreach ($requiredValidationPath in @($publicOutputHelperPath, $publicManifestWriterPath, $publicOutputTestPath, $legacyRenderContractPath)) {
  if (-not (Test-Path $requiredValidationPath -PathType Leaf)) {
    throw "Missing SEO validation helper: $requiredValidationPath"
  }
}

$package = Get-Content -Path $packagePath -Raw | ConvertFrom-Json
$recommendedNodeVersion = (Get-Content -Path $nvmrcPath -Raw).Trim()
$deployWorkflow = Get-Content -Path $deployWorkflowPath -Raw
$dashboardWorkflow = Get-Content -Path $dashboardWorkflowPath -Raw
$refreshWorkflow = Get-Content -Path $refreshWorkflowPath -Raw
$publicOutputHelper = Get-Content -Path $publicOutputHelperPath -Raw
$publicManifestWriter = Get-Content -Path $publicManifestWriterPath -Raw
$publicOutputTest = Get-Content -Path $publicOutputTestPath -Raw

if ([string]::IsNullOrWhiteSpace($recommendedNodeVersion)) {
  throw ".nvmrc must contain a Node major version."
}

$playwrightVersion = [string]$package.devDependencies.playwright
if ([string]::IsNullOrWhiteSpace($playwrightVersion)) {
  throw "package.json must declare Playwright as a devDependency."
}

if ($playwrightVersion -match '^[\^~<>=]') {
  throw "Playwright must be pinned to an exact version for reproducible browser tooling. Found '$playwrightVersion'."
}

$nodeEngine = [string]$package.engines.node
$npmEngine = [string]$package.engines.npm
if ($nodeEngine -ne "$recommendedNodeVersion.x") {
  throw "package.json engines.node must match .nvmrc. Expected '$recommendedNodeVersion.x', found '$nodeEngine'."
}

if ([string]::IsNullOrWhiteSpace($npmEngine)) {
  throw "package.json must declare an npm engine range for CI/tooling clarity."
}

if ($dashboardWorkflow -notmatch "node-version-file:\s*['""]?\.nvmrc['""]?") {
  throw "publish-dashboard.yml must read the Node version from .nvmrc."
}

if (($deployWorkflow -match "actions/setup-node@") -and ($deployWorkflow -notmatch "node-version-file:\s*['""]?\.nvmrc['""]?")) {
  throw "deploy.yml must read the Node version from .nvmrc whenever it provisions Node."
}

if ($deployWorkflow -match "node-version:\s*['""]?\d") {
  throw "deploy.yml should not hardcode a separate node-version once .nvmrc is the contract."
}

if ($dashboardWorkflow -match "node-version:\s*['""]?\d") {
  throw "publish-dashboard.yml should not hardcode a separate node-version once .nvmrc is the contract."
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

if ($deployWorkflow -notmatch "\.\/tests\/test_indexation_policy_contract\.ps1") {
  throw "deploy.yml must run the indexation policy contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_discovery_surface_contract\.ps1") {
  throw "deploy.yml must run the discovery surface contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_legacy_render_contract\.ps1") {
  throw "deploy.yml must run the legacy render contract test."
}

if ($deployWorkflow -notmatch "\.\/tests\/write_public_build_manifest\.ps1") {
  throw "deploy.yml must write a fresh-build manifest before running generated-output validation."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_public_html_output\.ps1\s+-RequireFreshBuild") {
  throw "deploy.yml must run the generated-output regression test with -RequireFreshBuild."
}

if ($deployWorkflow -notmatch "\.\/scripts\/check_essay_guardrails\.ps1") {
  throw "deploy.yml must run the essay guardrail check before building the site."
}

if ($deployWorkflow -notmatch "needs:\s*contracts") {
  throw "deploy.yml must separate contract tests from the Hugo build by making the build job depend on the contracts job."
}

if ($dashboardWorkflow -notmatch "\.\/tests\/test_ci_contract\.ps1") {
  throw "publish-dashboard.yml must run the CI contract test."
}

if ($refreshWorkflow -notmatch "GOATCOUNTER_API_URL:\s*\$\{\{\s*vars\.GOATCOUNTER_API_URL\s*\}\}") {
  throw "refresh-analytics.yml must pass GOATCOUNTER_API_URL through to the fetch step."
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

$dashboardLogicTestsIndex = $dashboardWorkflow.IndexOf("Run Dashboard Logic Tests")
$dashboardNpmInstallIndex = $dashboardWorkflow.IndexOf("npm ci --include=dev --no-audit --no-fund")
if ($dashboardNpmInstallIndex -lt 0) {
  $dashboardNpmInstallIndex = $dashboardWorkflow.IndexOf("npm install --include=dev --no-audit --no-fund")
}
$dashboardPlaywrightInstallIndex = $dashboardWorkflow.IndexOf("npx playwright install --with-deps chromium")

if ($dashboardLogicTestsIndex -lt 0) {
  throw "publish-dashboard.yml must run the Node dashboard logic test suite."
}

if ($dashboardNpmInstallIndex -lt 0) {
  throw "publish-dashboard.yml must install Node dependencies before the Node dashboard logic tests."
}

if ($dashboardPlaywrightInstallIndex -lt 0) {
  throw "publish-dashboard.yml must provision Playwright Chromium before the Node dashboard logic tests."
}

if ($dashboardNpmInstallIndex -gt $dashboardLogicTestsIndex -or $dashboardPlaywrightInstallIndex -gt $dashboardLogicTestsIndex) {
  throw "publish-dashboard.yml must install Node dependencies and Playwright before running the Node dashboard logic tests."
}

foreach ($requiredPathTrigger in @('".nvmrc"', '"package.json"')) {
  if ($dashboardWorkflow -notmatch [regex]::Escape($requiredPathTrigger)) {
    throw "publish-dashboard.yml must trigger when $requiredPathTrigger changes."
  }
}

Write-Host "CI contract tests passed."
$global:LASTEXITCODE = 0
exit 0
