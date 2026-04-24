Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$freezeScriptPath = Join-Path $repoRoot 'scripts/freeze_seo_rollout_baseline.ps1'
$probeScriptPath = Join-Path $repoRoot 'scripts/probe_seo_rollout.ps1'
$reportScriptPath = Join-Path $repoRoot 'scripts/report_seo_rollout_window.ps1'
$hostDiagnosticScriptPath = Join-Path $repoRoot 'scripts/diagnose_seo_hosts.ps1'
$legacyAuditScriptPath = Join-Path $repoRoot 'scripts/audit_legacy_host_references.ps1'
$productionVerificationScriptPath = Join-Path $repoRoot 'scripts/run_seo_production_verification.ps1'
$inspectionPackScriptPath = Join-Path $repoRoot 'scripts/prepare_search_console_inspection_pack.ps1'
$metadataAuditScriptPath = Join-Path $repoRoot 'scripts/audit_seo_metadata.ps1'
$imageReviewQueueScriptPath = Join-Path $repoRoot 'scripts/prepare_essay_image_review_queue.ps1'
$searchPerformanceScriptPath = Join-Path $repoRoot 'scripts/report_search_performance.ps1'
$indexNowScriptPath = Join-Path $repoRoot 'scripts/submit_indexnow.ps1'
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
  $productionVerificationScriptPath,
  $inspectionPackScriptPath,
  $metadataAuditScriptPath,
  $imageReviewQueueScriptPath,
  $searchPerformanceScriptPath,
  $indexNowScriptPath,
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
$productionVerificationScript = Get-Content -Path $productionVerificationScriptPath -Raw
$inspectionPackScript = Get-Content -Path $inspectionPackScriptPath -Raw
$metadataAuditScript = Get-Content -Path $metadataAuditScriptPath -Raw
$imageReviewQueueScript = Get-Content -Path $imageReviewQueueScriptPath -Raw
$searchPerformanceScript = Get-Content -Path $searchPerformanceScriptPath -Raw
$indexNowScript = Get-Content -Path $indexNowScriptPath -Raw
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
  'outsideinprint.org/llms.txt',
  'local_windows_tls_credentials_failure',
  'SEC_E_NO_CREDENTIALS'
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
  'production-verification.md',
  'canonical_live_smoke',
  'seo_rollout_probe',
  'host_diagnostics',
  'legacy_reference_audit',
  'FailOnError'
)) {
  if ($productionVerificationScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "run_seo_production_verification.ps1 must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'search-console-inspection-pack.csv',
  'google_selected_canonical',
  'bing_selected_canonical',
  'google_exclusion_reason',
  'blocking_finding'
)) {
  if ($inspectionPackScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "prepare_search_console_inspection_pack.ps1 must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'seo-metadata-audit.csv',
  'missing_description',
  'description_ends_with_ellipsis',
  'default_social_image',
  'possible_encoding_damage',
  'duplicate_description'
)) {
  if ($metadataAuditScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "audit_seo_metadata.ps1 must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'essay-image-review-queue.csv',
  'essay-image-review-queue.md',
  'essay-image-review-worklog.csv',
  'Batch A',
  'missing_image',
  'default_social_image',
  'missing_image_alt',
  'review_risk',
  'image_prompt'
)) {
  if ($imageReviewQueueScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "prepare_essay_image_review_queue.ps1 must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'search-performance-input-template.csv',
  'search-performance-report.md',
  'Low CTR Opportunities',
  'GoogleCsvPath',
  'BingCsvPath'
)) {
  if ($searchPerformanceScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "report_search_performance.ps1 must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'IndexNow',
  'INDEXNOW_KEY',
  'DryRun',
  'outsideinprint.org',
  'indexnow-submit-plan.md'
)) {
  if ($indexNowScript -notmatch [regex]::Escape($requiredSnippet)) {
    throw "submit_indexnow.ps1 must contain '$requiredSnippet'."
  }
}

foreach ($requiredSnippet in @(
  'freeze_seo_rollout_baseline.ps1',
  'probe_seo_rollout.ps1',
  'report_seo_rollout_window.ps1',
  'diagnose_seo_hosts.ps1',
  'audit_legacy_host_references.ps1',
  'run_seo_production_verification.ps1',
  'prepare_search_console_inspection_pack.ps1',
  'audit_seo_metadata.ps1',
  'prepare_essay_image_review_queue.ps1',
  'report_search_performance.ps1',
  'submit_indexnow.ps1',
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

  & $inspectionPackScriptPath -PriorityUrlsPath (Join-Path $tempDir 'priority-urls.json') -WorksheetPath (Join-Path $tempDir 'rollout-worksheet.csv') -OutputDir $tempDir
  foreach ($expectedPath in @(
    (Join-Path $tempDir 'search-console-inspection-pack.csv'),
    (Join-Path $tempDir 'search-console-inspection-pack.md')
  )) {
    if (-not (Test-Path -LiteralPath $expectedPath -PathType Leaf)) {
      throw "prepare_search_console_inspection_pack.ps1 did not write expected artifact: $expectedPath"
    }
  }

  & $metadataAuditScriptPath -OutputDir $tempDir
  foreach ($expectedPath in @(
    (Join-Path $tempDir 'seo-metadata-audit.csv'),
    (Join-Path $tempDir 'seo-metadata-audit.json'),
    (Join-Path $tempDir 'seo-metadata-audit.md')
  )) {
    if (-not (Test-Path -LiteralPath $expectedPath -PathType Leaf)) {
      throw "audit_seo_metadata.ps1 did not write expected artifact: $expectedPath"
    }
  }

  & $imageReviewQueueScriptPath -MetadataAuditPath (Join-Path $tempDir 'seo-metadata-audit.csv') -PriorityUrlsPath (Join-Path $tempDir 'priority-urls.json') -OutputDir $tempDir
  foreach ($expectedPath in @(
    (Join-Path $tempDir 'essay-image-review-queue.csv'),
    (Join-Path $tempDir 'essay-image-review-queue.md'),
    (Join-Path $tempDir 'essay-image-review-worklog.csv')
  )) {
    if (-not (Test-Path -LiteralPath $expectedPath -PathType Leaf)) {
      throw "prepare_essay_image_review_queue.ps1 did not write expected artifact: $expectedPath"
    }
  }

  & $searchPerformanceScriptPath -OutputDir $tempDir
  foreach ($expectedPath in @(
    (Join-Path $tempDir 'search-performance-input-template.csv'),
    (Join-Path $tempDir 'search-performance-report.json'),
    (Join-Path $tempDir 'search-performance-report.md')
  )) {
    if (-not (Test-Path -LiteralPath $expectedPath -PathType Leaf)) {
      throw "report_search_performance.ps1 did not write expected artifact: $expectedPath"
    }
  }

  & $indexNowScriptPath -PriorityUrlsPath (Join-Path $tempDir 'priority-urls.json') -OutputDir $tempDir -UsePriorityUrls -DryRun
  foreach ($expectedPath in @(
    (Join-Path $tempDir 'indexnow-submit-plan.json'),
    (Join-Path $tempDir 'indexnow-submit-plan.md')
  )) {
    if (-not (Test-Path -LiteralPath $expectedPath -PathType Leaf)) {
      throw "submit_indexnow.ps1 did not write expected artifact: $expectedPath"
    }
  }
}
finally {
  Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
}

Write-Host 'SEO rollout contract test passed.'
$global:LASTEXITCODE = 0
exit 0
