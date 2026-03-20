Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $repoRoot "package.json"
$nvmrcPath = Join-Path $repoRoot ".nvmrc"
$deployWorkflowPath = Join-Path $repoRoot ".github/workflows/deploy.yml"
$dashboardWorkflowPath = Join-Path $repoRoot ".github/workflows/publish-dashboard.yml"

if (-not (Test-Path $packagePath -PathType Leaf)) {
  throw "package.json is required for the CI contract test."
}

if (-not (Test-Path $nvmrcPath -PathType Leaf)) {
  throw ".nvmrc is required so local and CI Node versions stay aligned."
}

$package = Get-Content -Path $packagePath -Raw | ConvertFrom-Json
$recommendedNodeVersion = (Get-Content -Path $nvmrcPath -Raw).Trim()
$deployWorkflow = Get-Content -Path $deployWorkflowPath -Raw
$dashboardWorkflow = Get-Content -Path $dashboardWorkflowPath -Raw

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

if ($deployWorkflow -notmatch "node-version-file:\s*['""]?\.nvmrc['""]?") {
  throw "deploy.yml must read the Node version from .nvmrc."
}

if ($dashboardWorkflow -notmatch "node-version-file:\s*['""]?\.nvmrc['""]?") {
  throw "publish-dashboard.yml must read the Node version from .nvmrc."
}

if ($deployWorkflow -match "node-version:\s*['""]?\d") {
  throw "deploy.yml should not hardcode a separate node-version once .nvmrc is the contract."
}

if ($dashboardWorkflow -match "node-version:\s*['""]?\d") {
  throw "publish-dashboard.yml should not hardcode a separate node-version once .nvmrc is the contract."
}

if ($deployWorkflow -notmatch "npm install --include=dev --no-audit --no-fund") {
  throw "deploy.yml must use the deterministic npm install flags documented by the repo."
}

if ($deployWorkflow -notmatch "npx playwright install --with-deps chromium") {
  throw "deploy.yml must continue provisioning the Playwright Chromium browser explicitly."
}

if ($deployWorkflow -notmatch "\.\/tests\/test_ci_contract\.ps1") {
  throw "deploy.yml must run the CI contract test."
}

if ($dashboardWorkflow -notmatch "\.\/tests\/test_ci_contract\.ps1") {
  throw "publish-dashboard.yml must run the CI contract test."
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
