param(
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )

  ($Value | ConvertTo-Json -Depth 10) | Out-File -FilePath $Path -Encoding utf8
}

function Get-ReferenceCategory {
  param([string]$Path)

  $normalized = $Path.Replace('\', '/')

  if ($normalized -match '/data/analytics/') {
    return 'generated_historical_data'
  }

  if ($normalized -match '/scripts/import_analytics\.ps1$' -or
      $normalized -match '/scripts/freeze_seo_rollout_baseline\.ps1$' -or
      $normalized -match '/assets/js/dashboard-core\.mjs$' -or
      $normalized -match '/tests/test_analytics_snapshot_contract\.ps1$') {
    return 'intentional_legacy_classification'
  }

  if ($normalized -match '/scripts/verify_dashboard\.ps1$' -or
      $normalized -match '/docs/analytics-system\.md$' -or
      $normalized -match '/layouts/partials/masthead_dashboard\.html$' -or
      $normalized -match '/tests/test_pdf_builder_static_image_paths\.ps1$') {
    return 'dashboard_or_fixture_compatibility'
  }

  if ($normalized -match '/docs/seo-admin-checklist\.md$' -or
      $normalized -match '/scripts/diagnose_seo_hosts\.ps1$') {
    return 'intentional_probe_target'
  }

  return 'manual_follow_up'
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$repoRoot = Split-Path -Parent $PSScriptRoot
$targets = @(
  (Join-Path $repoRoot 'README.md'),
  (Join-Path $repoRoot '.github/workflows'),
  (Join-Path $repoRoot 'docs'),
  (Join-Path $repoRoot 'scripts'),
  (Join-Path $repoRoot 'tests'),
  (Join-Path $repoRoot 'layouts'),
  (Join-Path $repoRoot 'assets'),
  (Join-Path $repoRoot 'content'),
  (Join-Path $repoRoot 'data')
)

$files = foreach ($target in $targets) {
  if (-not (Test-Path -LiteralPath $target)) {
    continue
  }

  $item = Get-Item -LiteralPath $target
  if ($item.PSIsContainer) {
    Get-ChildItem -LiteralPath $target -Recurse -File
  }
  else {
    $item
  }
}

$matches = foreach ($file in $files) {
  $normalized = $file.FullName.Replace('\', '/')
  if ($normalized -match '/(\.git|public|output|reports|resources|\.tmp[^/]*)/') {
    continue
  }

  Select-String -Path $file.FullName -Pattern 'lpeasy\.github\.io/outsideinprint' -SimpleMatch:$false | ForEach-Object {
    [pscustomobject]@{
      path = $_.Path
      line_number = $_.LineNumber
      line = $_.Line.Trim()
      category = Get-ReferenceCategory -Path $_.Path
    }
  }
}

$rows = @($matches | Sort-Object path, line_number)
$summary = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  total_matches = $rows.Count
  categories = [ordered]@{
    generated_historical_data = @($rows | Where-Object { $_.category -eq 'generated_historical_data' }).Count
    intentional_legacy_classification = @($rows | Where-Object { $_.category -eq 'intentional_legacy_classification' }).Count
    dashboard_or_fixture_compatibility = @($rows | Where-Object { $_.category -eq 'dashboard_or_fixture_compatibility' }).Count
    intentional_probe_target = @($rows | Where-Object { $_.category -eq 'intentional_probe_target' }).Count
    manual_follow_up = @($rows | Where-Object { $_.category -eq 'manual_follow_up' }).Count
  }
  rows = $rows
}

$jsonPath = Join-Path $OutputDir 'legacy-reference-audit.json'
$markdownPath = Join-Path $OutputDir 'legacy-reference-audit.md'

Write-JsonFile -Path $jsonPath -Value $summary

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# Legacy Host Reference Audit')
$lines.Add('')
$lines.Add(('- Generated at: {0}' -f $summary.generated_at))
$lines.Add(('- Total repo-controlled matches: {0}' -f $summary.total_matches))
$lines.Add('')
$lines.Add('## Category Totals')
$lines.Add('')
$lines.Add('| Category | Count | Meaning |')
$lines.Add('| --- | ---: | --- |')
$lines.Add(('| generated_historical_data | {0} | Generated analytics snapshots that still contain legacy-host strings from historical traffic. |' -f $summary.categories.generated_historical_data))
$lines.Add(('| intentional_legacy_classification | {0} | Legacy host references used to classify historical analytics or frozen rollout samples. |' -f $summary.categories.intentional_legacy_classification))
$lines.Add(('| dashboard_or_fixture_compatibility | {0} | Dashboard-specific public-site links or fixture/test references that still assume the legacy host. |' -f $summary.categories.dashboard_or_fixture_compatibility))
$lines.Add(('| intentional_probe_target | {0} | Diagnostic scripts or owner checklists that intentionally mention the legacy host while validating the cutover. |' -f $summary.categories.intentional_probe_target))
$lines.Add(('| manual_follow_up | {0} | Repo-controlled references that likely still need explicit human review. |' -f $summary.categories.manual_follow_up))
$lines.Add('')
$lines.Add('## Matches')
$lines.Add('')
$lines.Add('| Category | File | Line | Snippet |')
$lines.Add('| --- | --- | ---: | --- |')
foreach ($row in $summary.rows) {
  $lines.Add(('| {0} | {1} | {2} | {3} |' -f `
      $row.category,
      (($row.path.Replace($repoRoot + '\', '')) -replace '\|', '\|'),
      $row.line_number,
      (($row.line -replace '\|', '\|'))))
}
$lines.Add('')
$lines.Add('## Operator Notes')
$lines.Add('')
$lines.Add('- Historical analytics snapshots are expected to preserve legacy-host strings until new data replaces them.')
$lines.Add('- Dashboard build and fixture references should be reviewed manually before changing them, because some still describe compatibility flows rather than the canonical public site.')
$lines.Add('- Diagnostic scripts and owner checklists intentionally mention the legacy host so the cutover can be tested directly.')
$lines.Add('- Any `manual_follow_up` entry is the short list for repo cleanup once the host cutover is complete.')

$lines -join "`r`n" | Out-File -FilePath $markdownPath -Encoding utf8

Write-Host "Wrote legacy host reference audit to $OutputDir"
