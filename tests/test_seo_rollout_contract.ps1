Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$freezeScriptPath = Join-Path $repoRoot 'scripts/freeze_seo_rollout_baseline.ps1'
$probeScriptPath = Join-Path $repoRoot 'scripts/probe_seo_rollout.ps1'
$reportScriptPath = Join-Path $repoRoot 'scripts/report_seo_rollout_window.ps1'
$hostDiagnosticScriptPath = Join-Path $repoRoot 'scripts/diagnose_seo_hosts.ps1'
$legacyAuditScriptPath = Join-Path $repoRoot 'scripts/audit_legacy_host_references.ps1'
$docPath = Join-Path $repoRoot 'docs/seo-rollout.md'
$adminChecklistPath = Join-Path $repoRoot 'docs/seo-admin-checklist.md'
$baselinePath = Join-Path $repoRoot 'reports/seo-rollout/baseline.json'
$priorityUrlsPath = Join-Path $repoRoot 'reports/seo-rollout/priority-urls.json'
$worksheetPath = Join-Path $repoRoot 'reports/seo-rollout/rollout-worksheet.csv'
$deployWorkflowPath = Join-Path $repoRoot '.github/workflows/deploy.yml'
$refreshWorkflowPath = Join-Path $repoRoot '.github/workflows/refresh-analytics.yml'
$analyticsDocPath = Join-Path $repoRoot 'docs/analytics-system.md'

foreach ($path in @(
  $freezeScriptPath,
  $probeScriptPath,
  $reportScriptPath,
  $hostDiagnosticScriptPath,
  $legacyAuditScriptPath,
  $docPath,
  $adminChecklistPath,
  $baselinePath,
  $priorityUrlsPath,
  $worksheetPath,
  $deployWorkflowPath,
  $refreshWorkflowPath,
  $analyticsDocPath
)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing required SEO rollout artifact: $path"
  }
}

$freezeScript = Get-Content -Path $freezeScriptPath -Raw
$probeScript = Get-Content -Path $probeScriptPath -Raw
$reportScript = Get-Content -Path $reportScriptPath -Raw
$hostDiagnosticScript = Get-Content -Path $hostDiagnosticScriptPath -Raw
$legacyAuditScript = Get-Content -Path $legacyAuditScriptPath -Raw
$doc = Get-Content -Path $docPath -Raw
$adminChecklist = Get-Content -Path $adminChecklistPath -Raw
$deployWorkflow = Get-Content -Path $deployWorkflowPath -Raw
$refreshWorkflow = Get-Content -Path $refreshWorkflowPath -Raw
$analyticsDoc = Get-Content -Path $analyticsDocPath -Raw

foreach ($requiredSnippet in @(
  'baseline.json',
  'priority-urls.json',
  'rollout-worksheet.csv',
  'journey_by_essay.json',
  'acquisition_channels'
)) {
  if ($freezeScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "freeze_seo_rollout_baseline.ps1 must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'full_path_301',
  'redirect_wrong_destination',
  'live_duplicate_html',
  'broken_or_stale',
  'UpdateWorksheet',
  'llms_probe'
)) {
  if ($probeScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "probe_seo_rollout.ps1 must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'organic_search',
  'ai_answer_engine',
  'legacy_domain',
  'priority_url_status',
  'measurement-window-report.md'
)) {
  if ($reportScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "report_seo_rollout_window.ps1 must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'Invoke-WebRequest',
  'curl.exe',
  'host-diagnostics.md',
  'outsideinprint.org/llms.txt'
)) {
  if ($hostDiagnosticScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "diagnose_seo_hosts.ps1 must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'legacy-reference-audit.md',
  'intentional_legacy_classification',
  'fixture_compatibility',
  'manual_follow_up'
)) {
  if ($legacyAuditScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "audit_legacy_host_references.ps1 must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'freeze_seo_rollout_baseline.ps1',
  'probe_seo_rollout.ps1',
  'report_seo_rollout_window.ps1',
  'diagnose_seo_hosts.ps1',
  'audit_legacy_host_references.ps1',
  'Google Search Console',
  'Bing Webmaster Tools',
  'outsideinprint.org'
)) {
  if ($doc -notmatch [regex]::Escape($requiredSnippet)) {
    throw "docs/seo-rollout.md must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'GitHub Pages',
  'DNS',
  'Google Search Console',
  'Bing Webmaster Tools',
  'outsideinprint.org/sitemap.xml'
)) {
  if ($adminChecklist -notmatch [regex]::Escape($requiredSnippet)) {
    throw "docs/seo-admin-checklist.md must contain '$requiredSnippet'."
  }
}

if ($deployWorkflow -notmatch '\.\/tests\/test_seo_rollout_contract\.ps1') {
  throw 'deploy.yml must run the SEO rollout contract test.'
}

if ($deployWorkflow -notmatch '\.\/tests\/test_live_seo_smoke\.ps1\s+-BaseUrl\s+"https://outsideinprint\.org"') {
  throw 'deploy.yml must run the canonical-host live SEO smoke test against https://outsideinprint.org.'
}

if ($deployWorkflow -notmatch '\.\/scripts\/probe_seo_rollout\.ps1') {
  throw 'deploy.yml must run the SEO rollout probe script after deploy.'
}

if ($refreshWorkflow -notmatch '\.\/scripts\/report_seo_rollout_window\.ps1') {
  throw 'refresh-analytics.yml must generate a rollout measurement report.'
}

if ($analyticsDoc -notmatch 'GOATCOUNTER_PUBLIC_SITE_URL`?\s+Default:\s+`?https://outsideinprint\.org/') {
  throw 'docs/analytics-system.md must document https://outsideinprint.org/ as the GOATCOUNTER_PUBLIC_SITE_URL default.'
}

$baseline = Get-Content -Path $baselinePath -Raw | ConvertFrom-Json
foreach ($requiredKey in @('data_snapshot', 'acquisition_channels', 'priority_urls', 'legacy_sample_urls', 'worksheet_columns')) {
  if ($null -eq $baseline.PSObject.Properties[$requiredKey]) {
    throw "reports/seo-rollout/baseline.json is missing '$requiredKey'."
  }
}

$priorityUrls = @(Get-Content -Path $priorityUrlsPath -Raw | ConvertFrom-Json)
if ($priorityUrls.Count -lt 10) {
  throw 'reports/seo-rollout/priority-urls.json must contain the frozen priority URL set.'
}

$worksheetRows = @(Import-Csv -Path $worksheetPath)
if ($worksheetRows.Count -eq 0) {
  throw 'reports/seo-rollout/rollout-worksheet.csv must contain the frozen rollout rows.'
}

$expectedWorksheetColumns = @(
  'url',
  'priority_tier',
  'deployed',
  'live_smoke_passed',
  'legacy_redirect_passed',
  'google_verified',
  'bing_verified',
  'selected_canonical',
  'indexed',
  'notes'
)

foreach ($column in $expectedWorksheetColumns) {
  if ($null -eq $worksheetRows[0].PSObject.Properties[$column]) {
    throw "reports/seo-rollout/rollout-worksheet.csv must contain column '$column'."
  }
}

$tempDir = Join-Path $repoRoot ('.tmp-seo-rollout-contract-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
  & $freezeScriptPath -OutputDir $tempDir
  foreach ($expectedPath in @(
    (Join-Path $tempDir 'baseline.json'),
    (Join-Path $tempDir 'priority-urls.json'),
    (Join-Path $tempDir 'rollout-worksheet.csv'),
    (Join-Path $tempDir 'baseline.md')
  )) {
    if (-not (Test-Path -LiteralPath $expectedPath -PathType Leaf)) {
      throw "freeze_seo_rollout_baseline.ps1 did not write expected artifact: $expectedPath"
    }
  }

  & $reportScriptPath -BaselinePath (Join-Path $tempDir 'baseline.json') -WorksheetPath (Join-Path $tempDir 'rollout-worksheet.csv') -OutputDir $tempDir -Label 'contract-test'
  foreach ($expectedPath in @(
    (Join-Path $tempDir 'measurement-window-report.json'),
    (Join-Path $tempDir 'measurement-window-report.md')
  )) {
    if (-not (Test-Path -LiteralPath $expectedPath -PathType Leaf)) {
      throw "report_seo_rollout_window.ps1 did not write expected artifact: $expectedPath"
    }
  }
}
finally {
  Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
}

Write-Host 'SEO rollout contract test passed.'
$global:LASTEXITCODE = 0
exit 0
