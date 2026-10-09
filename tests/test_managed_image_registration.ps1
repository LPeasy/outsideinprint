#requires -Version 7.0
param([string]$Root = (Split-Path -Parent $PSScriptRoot))
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $Root 'scripts/lib/image_asset_manifest.ps1')
. (Join-Path $PSScriptRoot 'helpers/responsive_image_common.ps1')
. (Join-Path $PSScriptRoot 'helpers/responsive_image_recipe.ps1')
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('oip-registration-' + [guid]::NewGuid().ToString('N'))

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}

try {
  [IO.Directory]::CreateDirectory($fixture) | Out-Null
  $inputPath = Join-Path $fixture 'input.png'
  $first = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==')
  $second = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg==')
  [IO.File]::WriteAllBytes($inputPath, $first)
  $arguments = @{
    Root = $fixture; InputPath = $inputPath; AssetId = 'essays/test/hero'
    AssetSource = 'images/originals/essays/test/hero.png'
    ImageClass = 'essay_illustration'; ProcessingHint = 'drawing'
    Aliases = @('/images/test.png')
  }
  $registrar = Join-Path $Root 'scripts/register_managed_image_asset.ps1'
  & $registrar @arguments | Out-Null
  $manifest = Read-OipImageAssetManifest -Root $fixture
  $asset = $manifest.assets['essays/test/hero']
  Assert-True ($null -eq $asset.processing_note) 'CLI registration must serialize a JSON null processing note.'
  Assert-True ($asset.review_state -ceq 'pending_review') 'New assets need review.'
  Assert-True ($manifest.aliases['/images/test.png'] -ceq 'essays/test/hero') 'Registration must preserve aliases.'
  $asset.review_state = 'approved'
  Write-OipImageAssetManifest -Root $fixture -Manifest $manifest
  $before = [IO.File]::ReadAllBytes((Get-OipImageAssetManifestPath -Root $fixture))
  & $registrar @arguments | Out-Null
  $after = [IO.File]::ReadAllBytes((Get-OipImageAssetManifestPath -Root $fixture))
  Assert-True ([Convert]::ToBase64String($before) -ceq [Convert]::ToBase64String($after)) 'Unchanged approved registration must be byte-idempotent.'

  [IO.File]::WriteAllBytes($inputPath, $second)
  $failed = $false
  try { & $registrar @arguments | Out-Null } catch { $failed = $true }
  Assert-True $failed 'Changed source bytes require explicit replacement.'
  & $registrar @arguments -Replace | Out-Null
  $manifest = Read-OipImageAssetManifest -Root $fixture
  $asset = $manifest.assets['essays/test/hero']
  Assert-True ($asset.review_state -ceq 'pending_review') 'Replacement must reset approval.'
  Assert-True ($null -eq $asset.processing_note) 'Replacement must retain JSON null.'

  foreach ($emptyNote in @($null, '')) {
    $asset.processing_note = $emptyNote
    Write-OipImageAssetManifest -Root $fixture -Manifest $manifest
    $roundTrip = Read-OipImageAssetManifest -Root $fixture
    Assert-True ($null -eq $roundTrip.assets['essays/test/hero'].processing_note) 'The writer must normalize null and empty notes.'
  }
  $asset.Remove('processing_note')
  Write-OipImageAssetManifest -Root $fixture -Manifest $manifest
  $roundTrip = Read-OipImageAssetManifest -Root $fixture
  Assert-True ($null -eq $roundTrip.assets['essays/test/hero'].processing_note) 'The writer must normalize an absent note.'
  $asset.processing_note = 'Invalid derivative note'
  $failed = $false
  try { Write-OipImageAssetManifest -Root $fixture -Manifest $manifest } catch { $failed = $true }
  Assert-True $failed 'A nonempty derivative processing note must fail.'
  $asset.processing_state = 'source_only_unprocessable'
  $asset.review_state = 'rejected_corrupt_source'
  $asset.usage_state = 'retained_unreferenced'
  $asset.processing_note = 'Retained corrupt source for historical evidence.'
  Write-OipImageAssetManifest -Root $fixture -Manifest $manifest
  $roundTrip = Read-OipImageAssetManifest -Root $fixture
  Assert-True ($roundTrip.assets['essays/test/hero'].processing_note -ceq $asset.processing_note) 'A quarantine note must survive round trips.'
  Assert-True ((Get-OipAllowedDerivativePaths -Manifest $roundTrip).Count -eq 0) 'Quarantined assets must permit no derivatives.'

  # The count scales with approved source inventory, without weakening variant
  # or source-identity checks. These are inventory rows, not thousands of files.
  $inventory = New-OipImageAssetManifest
  for ($i = 0; $i -lt 470; $i++) {
    $id = 'essays/test/' + $i
    $inventory.assets[$id] = @{
      width = 1800; sha256 = ('a' * 64); review_state = 'approved'
      processing_state = 'derivative_capable'
    }
  }
  $paths = Get-OipAllowedDerivativePaths -Manifest $inventory
  Assert-True ($paths.Count -eq 5170) '470 full-width approved assets must allow 5,170 variants.'
  Assert-True ($paths.Contains('images/rendered/essays/test/0/aaaaaaaaaaaa/1600w.webp')) 'The maximum display variant must be allowed.'
  Assert-True (-not $paths.Contains('images/rendered/essays/test/0/aaaaaaaaaaaa/social-640w.jpg')) 'Unexpected social widths must fail.'
  Assert-True (-not $paths.Contains('images/rendered/essays/test/0/bbbbbbbbbbbb/640w.avif')) 'Obsolete hash paths must fail.'
  Assert-True (-not $paths.Contains('images/rendered/essays/test/unknown/aaaaaaaaaaaa/640w.webp')) 'Unknown asset paths must fail.'
  $inventory.assets['essays/test/0'].review_state = 'pending_review'
  Assert-True ((Get-OipAllowedDerivativePaths -Manifest $inventory).Count -eq 5159) 'Pending assets must permit no derivatives.'
  Write-Host 'Managed-image registration and derivative recipe tests passed.'
}
finally {
  $resolvedFixture = [IO.Path]::GetFullPath($fixture)
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  if (-not $resolvedFixture.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing fixture cleanup outside the temporary directory.'
  }
  if (Test-Path -LiteralPath $resolvedFixture) { Remove-Item -LiteralPath $resolvedFixture -Recurse -Force }
}
