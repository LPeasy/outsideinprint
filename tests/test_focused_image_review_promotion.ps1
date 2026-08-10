#requires -Version 7.0

param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$rootPath = [IO.Path]::GetFullPath($Root)
. (Join-Path $rootPath 'scripts/lib/image_asset_manifest.ps1')
$promoterPath = Join-Path $rootPath 'scripts/promote_focused_image_review.ps1'
$pwsh = Join-Path $PSHOME $(if ($IsWindows) { 'pwsh.exe' } else { 'pwsh' })
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-focused-review-contract-' + [guid]::NewGuid().ToString('N'))

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Invoke-FocusedReviewPromotion {
  param(
    [Parameter(Mandatory = $true)][string]$ReviewRoot,
    [string[]]$Arguments = @()
  )

  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $pwsh
  $start.WorkingDirectory = $ReviewRoot
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($argument in @('-NoLogo', '-NoProfile', '-File', $promoterPath, '-Root', $ReviewRoot) + $Arguments) {
    $null = $start.ArgumentList.Add($argument)
  }

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $start
  $null = $process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  $result = [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $stdout
    Stderr = $stderr
  }
  $process.Dispose()
  return $result
}

function Copy-ReviewFixtureFiles {
  foreach ($relativePath in @(
    'data/image-assets.json',
    'reports/legacy-image-focused-cleanup-inventory.json',
    'reports/focused-image-visual-review.json',
    'reports/image-review-candidates.json',
    'reports/image-visual-review.json'
  )) {
    $source = Join-Path $rootPath $relativePath
    $target = Join-Path $fixtureRoot $relativePath
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
    [IO.File]::Copy($source, $target, $true)
  }
}

try {
  [IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null

  $applied = Invoke-FocusedReviewPromotion -ReviewRoot $rootPath -Arguments @('-Json')
  Assert-True ($applied.ExitCode -eq 0) "R2 applied-state verification failed: $($applied.Stderr)"
  $appliedResult = $applied.Stdout | ConvertFrom-Json -AsHashtable
  Assert-True ([string]$appliedResult.mode -ceq 'verify_applied') 'R2 promoter did not recognize the completed promotion.'
  Assert-True ([string]$appliedResult.inventory_action_id -ceq 'WEB-LEGACY-IMAGE-CLEANUP-001-R2') 'Promoter did not derive the current R2 action from the inventory.'
  Assert-True ([string]$appliedResult.review_action_id -ceq 'WEB-LEGACY-IMAGE-CLEANUP-001-R1') 'Promoter did not preserve the completed R1 visual-review lineage.'

  $initializedEvidencePath = Join-Path $fixtureRoot 'initialized-focused-review.json'
  $initialized = Invoke-FocusedReviewPromotion -ReviewRoot $rootPath -Arguments @(
    '-InitializeEvidence',
    '-EvidencePath',
    $initializedEvidencePath,
    '-Json'
  )
  Assert-True ($initialized.ExitCode -eq 0) "R2 evidence initialization failed: $($initialized.Stderr)"
  $initializedEvidence = Get-Content -LiteralPath $initializedEvidencePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  Assert-True ([string]$initializedEvidence.action_id -ceq 'WEB-LEGACY-IMAGE-CLEANUP-001-R2') 'New focused-review evidence was not bound to the inventory R2 action.'

  Copy-ReviewFixtureFiles
  $inventoryPath = Join-Path $fixtureRoot 'reports/legacy-image-focused-cleanup-inventory.json'
  $evidencePath = Join-Path $fixtureRoot 'reports/focused-image-visual-review.json'

  $inventory = Get-Content -LiteralPath $inventoryPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 40
  $inventory.action_id = 'WEB-UNRELATED-IMAGE-CLEANUP-999-R2'
  Write-OipCanonicalJsonFile -Path $inventoryPath -Value $inventory -Depth 40
  $unrelatedInventory = Invoke-FocusedReviewPromotion -ReviewRoot $fixtureRoot -Arguments @('-Json')
  Assert-True ($unrelatedInventory.ExitCode -ne 0) 'Promoter accepted an unrelated inventory action ID.'
  Assert-True (($unrelatedInventory.Stdout + $unrelatedInventory.Stderr).Contains('does not identify the WEB-LEGACY-IMAGE-CLEANUP-001 revision family', [StringComparison]::Ordinal)) 'Unrelated inventory action failed for an unexpected reason.'

  Copy-ReviewFixtureFiles
  $evidence = Get-Content -LiteralPath $evidencePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 40
  $evidence.action_id = 'WEB-UNRELATED-IMAGE-CLEANUP-999-R1'
  Write-OipCanonicalJsonFile -Path $evidencePath -Value $evidence -Depth 40
  $unrelatedEvidence = Invoke-FocusedReviewPromotion -ReviewRoot $fixtureRoot -Arguments @('-Json')
  Assert-True ($unrelatedEvidence.ExitCode -ne 0) 'Promoter accepted an unrelated visual-review action ID.'
  Assert-True (($unrelatedEvidence.Stdout + $unrelatedEvidence.Stderr).Contains('does not identify the WEB-LEGACY-IMAGE-CLEANUP-001 revision family', [StringComparison]::Ordinal)) 'Unrelated visual-review action failed for an unexpected reason.'

  Copy-ReviewFixtureFiles
  $evidence = Get-Content -LiteralPath $evidencePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 40
  $evidence.reviewed_asset_ids = @($evidence.reviewed_asset_ids | Select-Object -Skip 1)
  Write-OipCanonicalJsonFile -Path $evidencePath -Value $evidence -Depth 40
  $reviewCohortDrift = Invoke-FocusedReviewPromotion -ReviewRoot $fixtureRoot -Arguments @('-Json')
  Assert-True ($reviewCohortDrift.ExitCode -ne 0) 'Promoter accepted prior-revision evidence for a different reviewed cohort.'
  Assert-True (($reviewCohortDrift.Stdout + $reviewCohortDrift.Stderr).Contains('Evidence reviewed_asset_ids differs from the deterministic expected set', [StringComparison]::Ordinal)) 'Prior-revision reviewed-cohort drift failed for an unexpected reason.'

  Copy-ReviewFixtureFiles
  $evidence = Get-Content -LiteralPath $evidencePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 40
  $evidence.manifest_sha256_before_promotion = Get-OipCanonicalTextFileSha256 -Path (Join-Path $fixtureRoot 'data/image-assets.json') -Label 'Fixture image manifest' -RequireCanonical
  $evidence.candidate_report_sha256_before_promotion = Get-OipCanonicalTextFileSha256 -Path (Join-Path $fixtureRoot 'reports/image-review-candidates.json') -Label 'Fixture candidate report' -RequireCanonical
  Write-OipCanonicalJsonFile -Path $evidencePath -Value $evidence -Depth 40
  $priorRevisionPromotion = Invoke-FocusedReviewPromotion -ReviewRoot $fixtureRoot -Arguments @('-Json')
  Assert-True ($priorRevisionPromotion.ExitCode -ne 0) 'Promoter allowed prior-revision evidence to authorize a new promotion.'
  Assert-True (($priorRevisionPromotion.Stdout + $priorRevisionPromotion.Stderr).Contains('Prior-revision visual-review evidence may verify an already-applied', [StringComparison]::Ordinal)) "Prior-revision promotion attempt failed for an unexpected reason: $($priorRevisionPromotion.Stdout) $($priorRevisionPromotion.Stderr)"

  Copy-ReviewFixtureFiles
  $inventory = Get-Content -LiteralPath $inventoryPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 40
  $inventory.schema_version = '9.9'
  Write-OipCanonicalJsonFile -Path $inventoryPath -Value $inventory -Depth 40
  $unsupportedSchema = Invoke-FocusedReviewPromotion -ReviewRoot $fixtureRoot -Arguments @('-Json')
  Assert-True ($unsupportedSchema.ExitCode -ne 0) 'Promoter accepted an unsupported focused-cleanup inventory schema.'
  Assert-True (($unsupportedSchema.Stdout + $unsupportedSchema.Stderr).Contains('Focused cleanup inventory uses unsupported schema', [StringComparison]::Ordinal)) 'Unsupported inventory schema failed for an unexpected reason.'

  Copy-ReviewFixtureFiles
  $inventory = Get-Content -LiteralPath $inventoryPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 40
  $inventory.medium_migrations = @($inventory.medium_migrations | Select-Object -Skip 1)
  Write-OipCanonicalJsonFile -Path $inventoryPath -Value $inventory -Depth 40
  $cohortDrift = Invoke-FocusedReviewPromotion -ReviewRoot $fixtureRoot -Arguments @('-Json')
  Assert-True ($cohortDrift.ExitCode -ne 0) 'Promoter accepted focused-cleanup cohort drift.'
  Assert-True (($cohortDrift.Stdout + $cohortDrift.Stderr).Contains('not the exact approved 105 Medium plus four Syd cohort', [StringComparison]::Ordinal)) 'Focused-cleanup cohort drift failed for an unexpected reason.'

  Write-Host 'Focused image review promotion contract passed.'
}
finally {
  $resolvedFixture = [IO.Path]::GetFullPath($fixtureRoot)
  if (-not $resolvedFixture.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($resolvedFixture) -notlike 'oip-focused-review-contract-*') {
    throw "Refusing to clean unexpected focused-review fixture path: $resolvedFixture"
  }
  if ([IO.Directory]::Exists($resolvedFixture)) {
    Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
  }
}

$global:LASTEXITCODE = 0
exit 0
