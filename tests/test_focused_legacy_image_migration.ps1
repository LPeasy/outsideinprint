#requires -Version 7.0

param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$rootPath = [IO.Path]::GetFullPath($Root)
. (Join-Path $rootPath 'scripts/lib/image_asset_manifest.ps1')
$inventoryPath = Join-Path $rootPath 'reports/legacy-image-focused-cleanup-inventory.json'
$inventory = Get-Content -LiteralPath $inventoryPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 30
$baseline = [string]$inventory.baseline_commit
$pwsh = Join-Path $PSHOME $(if ($IsWindows) { 'pwsh.exe' } else { 'pwsh' })
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-focused-migration-contract-' + [guid]::NewGuid().ToString('N'))
$archivePath = Join-Path ([IO.Path]::GetTempPath()) ('oip-focused-migration-contract-' + [guid]::NewGuid().ToString('N') + '.zip')

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Invoke-GitFixture {
  param([Parameter(Mandatory)][string[]]$Arguments)
  $output = @(& git -C $fixtureRoot @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Fixture git command failed: git $($Arguments -join ' ') :: $($output -join ' ')"
  }
  return $output
}

function Invoke-FixtureMigration {
  param([Parameter(Mandatory)][string[]]$Arguments)

  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $pwsh
  $start.WorkingDirectory = $fixtureRoot
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($argument in @('-NoLogo','-NoProfile','-File',(Join-Path $fixtureRoot 'scripts/migrate_focused_legacy_images.ps1'),'-Root',$fixtureRoot) + $Arguments) {
    $null = $start.ArgumentList.Add($argument)
  }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $start
  $null = $process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  $result = [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr }
  $process.Dispose()
  return $result
}

function Assert-CleanFixture {
  param([string]$Context)
  $status = @(& git -C $fixtureRoot status --porcelain=v1 --untracked-files=all)
  Assert-True ($LASTEXITCODE -eq 0) "$Context could not read fixture status."
  Assert-True ($status.Count -eq 0) "$Context left fixture mutations: $($status -join '; ')"
}

try {
  [IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null
  & git -C $rootPath archive --format=zip --output=$archivePath $baseline -- content data/image-assets.json static/images/medium static/images/syd-and-oliver
  Assert-True ($LASTEXITCODE -eq 0 -and [IO.File]::Exists($archivePath)) 'Could not create focused-migration baseline fixture archive.'
  [IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $fixtureRoot)
  [IO.Directory]::CreateDirectory((Join-Path $fixtureRoot 'scripts/lib')) | Out-Null
  [IO.File]::Copy((Join-Path $rootPath 'scripts/migrate_focused_legacy_images.ps1'), (Join-Path $fixtureRoot 'scripts/migrate_focused_legacy_images.ps1'), $true)
  [IO.File]::Copy((Join-Path $rootPath 'scripts/lib/image_asset_manifest.ps1'), (Join-Path $fixtureRoot 'scripts/lib/image_asset_manifest.ps1'), $true)

  # Materialize one selected content input as CRLF before the fixture commit.
  # Its Git blob and tracked evidence use LF, so the successful migration below
  # proves that producer hashes are independent of checkout line endings.
  $portableProbeRelativePath = [string]$inventory.modified_reference_files[0].path
  $portableProbePath = Join-Path $fixtureRoot $portableProbeRelativePath
  $strictUtf8 = [Text.UTF8Encoding]::new($false, $true)
  $utf8NoBom = [Text.UTF8Encoding]::new($false)
  $portableProbeText = $strictUtf8.GetString([IO.File]::ReadAllBytes($portableProbePath))
  $portableProbeCrLfBytes = $utf8NoBom.GetBytes($portableProbeText.Replace("`r`n", "`n").Replace("`r", "`n").Replace("`n", "`r`n"))
  [IO.File]::WriteAllBytes($portableProbePath, $portableProbeCrLfBytes)
  $portableProbeBeforeSha256 = Get-OipPortableTextSha256ForBytes -Bytes $portableProbeCrLfBytes -Label 'Focused migration CRLF producer fixture'

  & git -C $fixtureRoot init --quiet
  & git -C $fixtureRoot config user.name 'OIP Contract Fixture'
  & git -C $fixtureRoot config user.email 'contract-fixture@invalid.example'
  & git -C $fixtureRoot config core.longpaths true
  & git -C $fixtureRoot add --all
  Assert-True ($LASTEXITCODE -eq 0) 'Could not stage the long-path migration fixture.'
  & git -C $fixtureRoot commit --quiet -m 'Focused image migration fixture'
  Assert-True ($LASTEXITCODE -eq 0) 'Could not commit the migration fixture.'
  Assert-CleanFixture -Context 'Fixture initialization'

  $dryRun = Invoke-FixtureMigration -Arguments @('-Json')
  Assert-True ($dryRun.ExitCode -eq 0) "Baseline dry-run failed: $($dryRun.Stderr)"
  $dryRunResult = $dryRun.Stdout | ConvertFrom-Json -AsHashtable
  foreach ($expectation in @(
    @{ Key = 'baseline_medium_files'; Value = 471 },
    @{ Key = 'referenced_medium_files'; Value = 421 },
    @{ Key = 'migrated_medium_pngs'; Value = 105 },
    @{ Key = 'retained_medium_jpeg_jpg'; Value = 316 },
    @{ Key = 'removed_medium_orphans'; Value = 50 },
    @{ Key = 'migrated_syd_heroes'; Value = 4 },
    @{ Key = 'filename_hash_mismatches'; Value = 15 },
    @{ Key = 'post_manifest_assets'; Value = 459 },
    @{ Key = 'post_manifest_aliases'; Value = 500 }
  )) {
    Assert-True ([int]$dryRunResult[$expectation.Key] -eq $expectation.Value) "Dry-run count changed: $($expectation.Key)."
  }
  Assert-True ([string]$dryRunResult.medium_inventory_sha256 -ceq '851880a2e59635b660a6192385dff6cbb0eb73d3b8b3d5f747c6e730c6302c5a') 'Dry-run Medium path/actual-SHA digest changed.'
  Assert-True ([string]$dryRunResult.syd_inventory_sha256 -ceq 'c53d8f9db266f5cba29cb4fd400a0dd72263e6eb492e706b2d1aedd07c0bd21e') 'Dry-run Syd path/actual-SHA digest changed.'
  Assert-CleanFixture -Context 'Default dry-run'

  $mediumDriftRelativePath = [string]$inventory.medium_migrations[0].legacy_path
  $mediumDriftPath = Join-Path $fixtureRoot $mediumDriftRelativePath
  $mediumOriginalBytes = [IO.File]::ReadAllBytes($mediumDriftPath)
  $mediumDriftBytes = [byte[]]::new($mediumOriginalBytes.Length + 1)
  [Array]::Copy($mediumOriginalBytes, 0, $mediumDriftBytes, 0, $mediumOriginalBytes.Length)
  $mediumDriftBytes[$mediumDriftBytes.Length - 1] = 0
  try {
    [IO.File]::WriteAllBytes($mediumDriftPath, $mediumDriftBytes)
    $mediumByteDrift = Invoke-FixtureMigration -Arguments @('-Json')
    Assert-True ($mediumByteDrift.ExitCode -ne 0) 'Migration accepted same-count Medium byte drift.'
    Assert-True (($mediumByteDrift.Stderr + $mediumByteDrift.Stdout).Contains('Focused legacy Medium inventory digest drifted', [StringComparison]::Ordinal)) 'Same-count Medium byte drift failed for the wrong reason.'
  }
  finally {
    [IO.File]::WriteAllBytes($mediumDriftPath, $mediumOriginalBytes)
  }
  Assert-CleanFixture -Context 'Same-count Medium byte-drift rejection'

  $mediumPathDriftSource = [string]$inventory.removed_orphans[0].legacy_path
  $mediumPathDriftDirectory = [IO.Path]::GetDirectoryName($mediumPathDriftSource).Replace('\','/')
  $mediumPathDriftTarget = $mediumPathDriftDirectory + '/digest-drift-' + [IO.Path]::GetFileName($mediumPathDriftSource)
  Invoke-GitFixture -Arguments @('mv','--',$mediumPathDriftSource,$mediumPathDriftTarget) | Out-Null
  try {
    $mediumPathDrift = Invoke-FixtureMigration -Arguments @('-Json')
    Assert-True ($mediumPathDrift.ExitCode -ne 0) 'Migration accepted same-count Medium path drift.'
    Assert-True (($mediumPathDrift.Stderr + $mediumPathDrift.Stdout).Contains('Focused legacy Medium inventory digest drifted', [StringComparison]::Ordinal)) 'Same-count Medium path drift failed for the wrong reason.'
  }
  finally {
    Invoke-GitFixture -Arguments @('mv','--',$mediumPathDriftTarget,$mediumPathDriftSource) | Out-Null
  }
  Assert-CleanFixture -Context 'Same-count Medium path-drift rejection'

  $sydDriftRelativePath = [string]$inventory.syd_migrations[0].legacy_path
  $sydDriftPath = Join-Path $fixtureRoot $sydDriftRelativePath
  $sydOriginalBytes = [IO.File]::ReadAllBytes($sydDriftPath)
  $sydDriftBytes = [byte[]]::new($sydOriginalBytes.Length + 1)
  [Array]::Copy($sydOriginalBytes, 0, $sydDriftBytes, 0, $sydOriginalBytes.Length)
  $sydDriftBytes[$sydDriftBytes.Length - 1] = 0
  try {
    [IO.File]::WriteAllBytes($sydDriftPath, $sydDriftBytes)
    $sydByteDrift = Invoke-FixtureMigration -Arguments @('-Json')
    Assert-True ($sydByteDrift.ExitCode -ne 0) 'Migration accepted same-count Syd byte drift.'
    Assert-True (($sydByteDrift.Stderr + $sydByteDrift.Stdout).Contains('Focused legacy Syd inventory digest drifted', [StringComparison]::Ordinal)) 'Same-count Syd byte drift failed for the wrong reason.'
  }
  finally {
    [IO.File]::WriteAllBytes($sydDriftPath, $sydOriginalBytes)
  }
  Assert-CleanFixture -Context 'Same-count Syd byte-drift rejection'

  $orphanPath = [string]$inventory.removed_orphans[0].legacy_path
  $orphanAlias = '/' + $orphanPath.Substring('static/'.Length)
  $trackedProbePath = Join-Path $fixtureRoot 'scripts/tracked-orphan-probe.ps1'
  [IO.File]::WriteAllText($trackedProbePath, "# $orphanAlias`n", [Text.UTF8Encoding]::new($false))
  Invoke-GitFixture -Arguments @('add','scripts/tracked-orphan-probe.ps1') | Out-Null
  Invoke-GitFixture -Arguments @('commit','--quiet','-m','Track orphan runtime probe') | Out-Null
  $orphanProbe = Invoke-FixtureMigration -Arguments @('-Json')
  Assert-True ($orphanProbe.ExitCode -ne 0) 'Migration accepted an orphan alias in a tracked script fixture.'
  Assert-True (($orphanProbe.Stderr + $orphanProbe.Stdout).Contains('Medium orphan candidate is referenced by runtime source', [StringComparison]::Ordinal)) 'Tracked orphan fixture did not fail for the expected runtime-reference reason.'
  Assert-CleanFixture -Context 'Tracked orphan rejection'
  Invoke-GitFixture -Arguments @('rm','--quiet','scripts/tracked-orphan-probe.ps1') | Out-Null
  Invoke-GitFixture -Arguments @('commit','--quiet','-m','Remove orphan runtime probe') | Out-Null

  $collisionItem = $inventory.medium_migrations[0]
  $collisionPath = Join-Path $fixtureRoot ('assets/' + [string]$collisionItem.source)
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($collisionPath)) | Out-Null
  [IO.File]::WriteAllBytes($collisionPath, [byte[]](0x63,0x6f,0x6c,0x6c,0x69,0x73,0x69,0x6f,0x6e))
  $collisionHash = (Get-FileHash -LiteralPath $collisionPath -Algorithm SHA256).Hash
  $collision = Invoke-FixtureMigration -Arguments @('-Write','-Json')
  Assert-True ($collision.ExitCode -ne 0) 'Migration overwrote a differing untracked managed-source destination.'
  Assert-True (($collision.Stderr + $collision.Stdout).Contains('refuses pre-existing new destination', [StringComparison]::Ordinal)) 'Untracked managed-source collision failed for the wrong reason.'
  Assert-True ((Get-FileHash -LiteralPath $collisionPath -Algorithm SHA256).Hash -ceq $collisionHash) 'Rejected managed-source collision changed the pre-existing bytes.'
  [IO.File]::Delete($collisionPath)
  Assert-CleanFixture -Context 'Managed-source collision rejection'

  $reportCollisionPath = Join-Path $fixtureRoot 'reports/legacy-image-focused-cleanup-inventory.json'
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($reportCollisionPath)) | Out-Null
  [IO.File]::WriteAllText($reportCollisionPath, "{}`n", [Text.UTF8Encoding]::new($false))
  $reportCollisionHash = (Get-FileHash -LiteralPath $reportCollisionPath -Algorithm SHA256).Hash
  $reportCollision = Invoke-FixtureMigration -Arguments @('-Write','-Json')
  Assert-True ($reportCollision.ExitCode -ne 0) 'Migration overwrote a pre-existing report destination.'
  Assert-True (($reportCollision.Stderr + $reportCollision.Stdout).Contains('refuses pre-existing new destination', [StringComparison]::Ordinal)) 'Pre-existing report collision failed for the wrong reason.'
  Assert-True ((Get-FileHash -LiteralPath $reportCollisionPath -Algorithm SHA256).Hash -ceq $reportCollisionHash) 'Rejected report collision changed the pre-existing bytes.'
  [IO.File]::Delete($reportCollisionPath)
  Assert-CleanFixture -Context 'Report collision rejection'

  $rollback = Invoke-FixtureMigration -Arguments @('-Write','-Json','-TestFailureAfterOperation','3')
  Assert-True ($rollback.ExitCode -ne 0) 'Injected operation failure unexpectedly completed the migration.'
  Assert-True (($rollback.Stderr + $rollback.Stdout).Contains('Injected focused-migration test failure after operation 3', [StringComparison]::Ordinal)) 'Injected rollback test failed for an unexpected reason.'
  Assert-CleanFixture -Context 'Injected operation rollback'

  $write = Invoke-FixtureMigration -Arguments @('-Write','-Json')
  Assert-True ($write.ExitCode -eq 0) "Successful migration fixture failed: $($write.Stderr)"
  $generatedInventoryPath = Join-Path $fixtureRoot 'reports/legacy-image-focused-cleanup-inventory.json'
  $generatedInventory = Get-Content -LiteralPath $generatedInventoryPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 30
  Assert-True ([string]$generatedInventory.schema_version -ceq '1.1') 'Generated focused-cleanup report did not declare schema 1.1.'
  Assert-True ([string]$generatedInventory.action_id -ceq 'WEB-LEGACY-IMAGE-CLEANUP-001-R2') 'Generated focused-cleanup report did not declare R2.'
  Assert-True ([string]$generatedInventory.rewritten_content_sha256_basis -ceq (Get-OipPortableTextSha256Basis)) 'Generated focused-cleanup report did not declare the shared portable-text digest basis.'
  Assert-True (@($generatedInventory.modified_reference_files).Count -eq 32) 'Generated focused-cleanup report did not bind all 32 rewritten content files.'

  $expectedRows = @{}
  foreach ($row in @($inventory.modified_reference_files)) { $expectedRows[[string]$row.path] = $row }
  foreach ($row in @($generatedInventory.modified_reference_files)) {
    $path = [string]$row.path
    Assert-True ($expectedRows.ContainsKey($path)) "Generated report added an unexpected rewritten-content path: $path"
    Assert-True ([string]$row.before_sha256 -ceq [string]$expectedRows[$path].before_sha256) "Producer/consumer before hash differs for $path."
    Assert-True ([string]$row.after_sha256 -ceq [string]$expectedRows[$path].after_sha256) "Producer/consumer after hash differs for $path."
    Assert-True ([string]$row.after_sha256 -ceq (Get-OipPortableTextFileSha256 -Path (Join-Path $fixtureRoot $path) -Label "Fixture rewritten content '$path'")) "Generated report after hash does not match the shared portable digest for $path."
  }
  Assert-True ([string]$generatedInventory.modified_reference_files[0].before_sha256 -ceq $portableProbeBeforeSha256) 'CRLF checkout input did not reproduce the portable baseline-content hash.'

  $completed = Invoke-FixtureMigration -Arguments @('-Json')
  Assert-True ($completed.ExitCode -eq 0) "Completed-state producer verification failed: $($completed.Stderr)"

  $rewrittenProbeBytes = [IO.File]::ReadAllBytes($portableProbePath)
  $rewrittenProbeText = $strictUtf8.GetString($rewrittenProbeBytes)
  $rewrittenProbeLfText = $rewrittenProbeText.Replace("`r`n", "`n").Replace("`r", "`n")
  [IO.File]::WriteAllBytes($portableProbePath, $utf8NoBom.GetBytes($rewrittenProbeLfText.Replace("`n", "`r")))
  $loneCrCompleted = Invoke-FixtureMigration -Arguments @('-Json')
  Assert-True ($loneCrCompleted.ExitCode -eq 0) "Completed-state verification did not accept portable lone-CR checkout materialization: $($loneCrCompleted.Stderr)"

  [IO.File]::WriteAllBytes($portableProbePath, $utf8NoBom.GetBytes($rewrittenProbeLfText + 'changed'))
  $changedContent = Invoke-FixtureMigration -Arguments @('-Json')
  Assert-True ($changedContent.ExitCode -ne 0) 'Completed-state verification accepted changed rewritten content.'
  Assert-True (($changedContent.Stderr + $changedContent.Stdout).Contains('Rewritten-content portable hash differs', [StringComparison]::Ordinal)) 'Changed rewritten content failed for an unexpected reason.'

  Write-Host 'Focused legacy image migration behavioral contract passed.'
}
finally {
  foreach ($path in @($fixtureRoot, $archivePath)) {
    if ([string]::IsNullOrWhiteSpace($path)) { continue }
    $resolved = [IO.Path]::GetFullPath($path)
    if (-not $resolved.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetFileName($resolved) -notlike 'oip-focused-migration-contract-*') {
      throw "Refusing to clean unexpected focused-migration fixture path: $resolved"
    }
    if ([IO.Directory]::Exists($resolved)) {
      Get-ChildItem -LiteralPath $resolved -Force -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $_.Attributes = 'Normal' }
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    if ([IO.File]::Exists($resolved)) { [IO.File]::Delete($resolved) }
  }
}

$global:LASTEXITCODE = 0
exit 0
