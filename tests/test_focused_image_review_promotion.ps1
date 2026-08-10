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

function Get-CombinedProcessDiagnostics {
  param([Parameter(Mandatory = $true)][object]$Result)

  return @([string]$Result.Stdout, [string]$Result.Stderr) -join [Environment]::NewLine
}

function ConvertTo-NormalizedProcessDiagnostics {
  param([AllowEmptyString()][string]$Text)

  $escape = [string][char]27
  $ansiCsiPattern = [regex]::Escape($escape) + '\[[0-?]*[ -/]*[@-~]'
  $withoutAnsi = [regex]::Replace($Text, $ansiCsiPattern, '')
  return [regex]::Replace($withoutAnsi, '\s+', ' ').Trim()
}

function Assert-PromotionFailure {
  param(
    [Parameter(Mandatory = $true)][object]$Result,
    [Parameter(Mandatory = $true)][string]$ExpectedMessage,
    [Parameter(Mandatory = $true)][string]$Scenario
  )

  $combined = Get-CombinedProcessDiagnostics -Result $Result
  $normalized = ConvertTo-NormalizedProcessDiagnostics -Text $combined
  $normalizedExpected = ConvertTo-NormalizedProcessDiagnostics -Text $ExpectedMessage
  if ($Result.ExitCode -ne 0 -and
    $normalized.Contains($normalizedExpected, [StringComparison]::Ordinal)) {
    return
  }

  throw @(
    "$Scenario failed for an unexpected reason.",
    "Exit code: $($Result.ExitCode)",
    "Expected normalized message: $normalizedExpected",
    "Normalized diagnostics: $normalized",
    "Raw stdout:",
    [string]$Result.Stdout,
    "Raw stderr:",
    [string]$Result.Stderr
  ) -join [Environment]::NewLine
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
  $start.Environment['NO_COLOR'] = '1'
  foreach ($argument in @('-NoLogo', '-NoProfile', '-NonInteractive', '-File', $promoterPath, '-Root', $ReviewRoot) + $Arguments) {
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

  $escape = [string][char]27
  $normalizationFixture = [pscustomobject]@{
    ExitCode = 1
    Stdout = "${escape}[36mFocused cleanup inventory is${escape}[0m"
    Stderr = "not the exact`r`n  approved`t105 Medium plus four Syd cohort."
  }
  Assert-PromotionFailure `
    -Result $normalizationFixture `
    -ExpectedMessage 'Focused cleanup inventory is not the exact approved 105 Medium plus four Syd cohort.' `
    -Scenario 'ANSI/wrapped diagnostic normalization fixture'

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
  Assert-PromotionFailure -Result $unrelatedInventory -ExpectedMessage 'does not identify the WEB-LEGACY-IMAGE-CLEANUP-001 revision family' -Scenario 'Unrelated inventory action'

  Copy-ReviewFixtureFiles
  $evidence = Get-Content -LiteralPath $evidencePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 40
  $evidence.action_id = 'WEB-UNRELATED-IMAGE-CLEANUP-999-R1'
  Write-OipCanonicalJsonFile -Path $evidencePath -Value $evidence -Depth 40
  $unrelatedEvidence = Invoke-FocusedReviewPromotion -ReviewRoot $fixtureRoot -Arguments @('-Json')
  Assert-PromotionFailure -Result $unrelatedEvidence -ExpectedMessage 'does not identify the WEB-LEGACY-IMAGE-CLEANUP-001 revision family' -Scenario 'Unrelated visual-review action'

  Copy-ReviewFixtureFiles
  $evidence = Get-Content -LiteralPath $evidencePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 40
  $evidence.reviewed_asset_ids = @($evidence.reviewed_asset_ids | Select-Object -Skip 1)
  Write-OipCanonicalJsonFile -Path $evidencePath -Value $evidence -Depth 40
  $reviewCohortDrift = Invoke-FocusedReviewPromotion -ReviewRoot $fixtureRoot -Arguments @('-Json')
  Assert-PromotionFailure -Result $reviewCohortDrift -ExpectedMessage 'Evidence reviewed_asset_ids differs from the deterministic expected set' -Scenario 'Prior-revision reviewed-cohort drift'

  Copy-ReviewFixtureFiles
  $evidence = Get-Content -LiteralPath $evidencePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 40
  $evidence.manifest_sha256_before_promotion = Get-OipCanonicalTextFileSha256 -Path (Join-Path $fixtureRoot 'data/image-assets.json') -Label 'Fixture image manifest' -RequireCanonical
  $evidence.candidate_report_sha256_before_promotion = Get-OipCanonicalTextFileSha256 -Path (Join-Path $fixtureRoot 'reports/image-review-candidates.json') -Label 'Fixture candidate report' -RequireCanonical
  Write-OipCanonicalJsonFile -Path $evidencePath -Value $evidence -Depth 40
  $priorRevisionPromotion = Invoke-FocusedReviewPromotion -ReviewRoot $fixtureRoot -Arguments @('-Json')
  Assert-PromotionFailure -Result $priorRevisionPromotion -ExpectedMessage 'Prior-revision visual-review evidence may verify an already-applied' -Scenario 'Prior-revision promotion attempt'

  Copy-ReviewFixtureFiles
  $inventory = Get-Content -LiteralPath $inventoryPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 40
  $inventory.schema_version = '9.9'
  Write-OipCanonicalJsonFile -Path $inventoryPath -Value $inventory -Depth 40
  $unsupportedSchema = Invoke-FocusedReviewPromotion -ReviewRoot $fixtureRoot -Arguments @('-Json')
  Assert-PromotionFailure -Result $unsupportedSchema -ExpectedMessage 'Focused cleanup inventory uses unsupported schema' -Scenario 'Unsupported inventory schema'

  Copy-ReviewFixtureFiles
  $inventory = Get-Content -LiteralPath $inventoryPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 40
  $inventory.medium_migrations = @($inventory.medium_migrations | Select-Object -Skip 1)
  Write-OipCanonicalJsonFile -Path $inventoryPath -Value $inventory -Depth 40
  $cohortDrift = Invoke-FocusedReviewPromotion -ReviewRoot $fixtureRoot -Arguments @('-Json')
  Assert-PromotionFailure -Result $cohortDrift -ExpectedMessage 'not the exact approved 105 Medium plus four Syd cohort' -Scenario 'Focused-cleanup cohort drift'

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
