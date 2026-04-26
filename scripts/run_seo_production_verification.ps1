param(
  [string]$BaseUrl = 'https://outsideinprint.org',
  [string]$PriorityUrlsPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/priority-urls.json'),
  [string]$WorksheetPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/rollout-worksheet.csv'),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/production-verification'),
  [switch]$FailOnError
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )

  ($Value | ConvertTo-Json -Depth 20) | Out-File -FilePath $Path -Encoding utf8
}

function Get-CurrentPowerShellPath {
  try {
    $processPath = (Get-Process -Id $PID).Path
    if (-not [string]::IsNullOrWhiteSpace($processPath) -and (Test-Path -LiteralPath $processPath -PathType Leaf)) {
      return $processPath
    }
  }
  catch {
  }

  return 'pwsh'
}

function Invoke-VerificationStep {
  param(
    [string]$Name,
    [string]$ScriptPath,
    [string[]]$Arguments,
    [string]$PowerShellPath
  )

  $startedAt = Get-Date
  $output = @()
  $exitCode = 0
  try {
    $powerShellArguments = @('-NoLogo', '-NoProfile', '-File', $ScriptPath) + $Arguments
    $output = @(& $PowerShellPath @powerShellArguments 2>&1 | ForEach-Object { [string]$_ })
    $exitCode = if ($null -ne $global:LASTEXITCODE) { [int]$global:LASTEXITCODE } else { 0 }
  }
  catch {
    $output = @([string]$_.Exception.Message)
    $exitCode = 1
  }

  return [pscustomobject][ordered]@{
    name = $Name
    script = $ScriptPath
    exit_code = $exitCode
    passed = ($exitCode -eq 0)
    started_at = $startedAt.ToString('o')
    finished_at = (Get-Date).ToString('o')
    output = @($output)
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$liveSmokeScript = Join-Path $repoRoot 'tests/test_live_seo_smoke.ps1'
$probeScript = Join-Path $repoRoot 'scripts/probe_seo_rollout.ps1'
$hostDiagnosticsScript = Join-Path $repoRoot 'scripts/diagnose_seo_hosts.ps1'
$legacyAuditScript = Join-Path $repoRoot 'scripts/audit_legacy_host_references.ps1'

foreach ($path in @($liveSmokeScript, $probeScript, $hostDiagnosticsScript, $legacyAuditScript, $PriorityUrlsPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing required SEO production verification input: $path"
  }
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$localPriorityUrlsPath = Join-Path $OutputDir 'priority-urls.json'
$localWorksheetPath = Join-Path $OutputDir 'rollout-worksheet.csv'
Copy-Item -LiteralPath $PriorityUrlsPath -Destination $localPriorityUrlsPath -Force
if (Test-Path -LiteralPath $WorksheetPath -PathType Leaf) {
  Copy-Item -LiteralPath $WorksheetPath -Destination $localWorksheetPath -Force
}

$powerShellPath = Get-CurrentPowerShellPath
$steps = New-Object System.Collections.Generic.List[object]

$steps.Add((Invoke-VerificationStep -Name 'canonical_live_smoke' -ScriptPath $liveSmokeScript -Arguments @('-BaseUrl', $BaseUrl) -PowerShellPath $powerShellPath))
$steps.Add((Invoke-VerificationStep -Name 'seo_rollout_probe' -ScriptPath $probeScript -Arguments @('-PriorityUrlsPath', $localPriorityUrlsPath, '-WorksheetPath', $localWorksheetPath, '-OutputDir', $OutputDir) -PowerShellPath $powerShellPath))
$steps.Add((Invoke-VerificationStep -Name 'host_diagnostics' -ScriptPath $hostDiagnosticsScript -Arguments @('-PriorityUrlsPath', $localPriorityUrlsPath, '-WorksheetPath', $localWorksheetPath, '-OutputDir', $OutputDir) -PowerShellPath $powerShellPath))
$steps.Add((Invoke-VerificationStep -Name 'legacy_reference_audit' -ScriptPath $legacyAuditScript -Arguments @('-OutputDir', $OutputDir) -PowerShellPath $powerShellPath))

$failedSteps = @($steps | Where-Object { -not $_.passed })
$report = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  base_url = $BaseUrl
  output_dir = $OutputDir
  fail_on_error = [bool]$FailOnError
  passed = ($failedSteps.Count -eq 0)
  step_count = $steps.Count
  failed_step_count = $failedSteps.Count
  steps = @($steps)
}

$jsonPath = Join-Path $OutputDir 'production-verification.json'
$markdownPath = Join-Path $OutputDir 'production-verification.md'
Write-JsonFile -Path $jsonPath -Value $report

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# SEO Production Verification')
$lines.Add('')
$lines.Add(('- Generated at: {0}' -f $report.generated_at))
$lines.Add(('- Base URL: {0}' -f $report.base_url))
$lines.Add(('- Passed: {0}' -f $report.passed))
$lines.Add(('- Failed steps: {0}' -f $report.failed_step_count))
$lines.Add('')
$lines.Add('| Step | Status | Exit code |')
$lines.Add('| --- | --- | ---: |')
foreach ($step in $steps) {
  $lines.Add(('| {0} | {1} | {2} |' -f $step.name, $(if ($step.passed) { 'passed' } else { 'failed' }), $step.exit_code))
}
$lines.Add('')
$lines.Add('## Step Output')
foreach ($step in $steps) {
  $lines.Add('')
  $lines.Add(('### {0}' -f $step.name))
  $lines.Add('')
  if (@($step.output).Count -eq 0) {
    $lines.Add('- No output.')
  }
  else {
    $lines.Add('```text')
    foreach ($line in @($step.output | Select-Object -First 80)) {
      $lines.Add($line)
    }
    $lines.Add('```')
  }
}

$lines -join [Environment]::NewLine | Out-File -FilePath $markdownPath -Encoding utf8

if ($FailOnError -and $failedSteps.Count -gt 0) {
  throw ("SEO production verification failed: {0}" -f ((@($failedSteps | ForEach-Object { $_.name })) -join ', '))
}

Write-Host ("Wrote SEO production verification to {0}" -f $OutputDir)
$global:LASTEXITCODE = 0
exit 0
