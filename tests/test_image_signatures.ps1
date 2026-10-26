#requires -Version 7.0
param([string]$Root = (Split-Path -Parent $PSScriptRoot))
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'helpers/responsive_image_common.ps1')
. (Join-Path $PSScriptRoot 'helpers/image_signatures.ps1')
. (Join-Path $PSScriptRoot 'helpers/responsive_image_recipe.ps1')

$productionManifest = Get-OipImageManifest -Path (Join-Path $Root 'data/image-assets.json')
$production = Get-OipImageSignaturePolicy -Root $Root -Manifest $productionManifest
$productionCompatibility = Get-OipImageSignatureCompatibility -Root $Root -Manifest $productionManifest -SignaturePolicy $production
$temp = Join-Path ([IO.Path]::GetTempPath()) ('oip-signature-policy-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $temp 'data'),(Join-Path $temp 'assets/images/signatures') -Force | Out-Null
$manifest = @'
{"defaults":{"widths":[32,64],"max_render_width":96,"social_max_width":64},"assets":{
"editorial/fixture":{"id":"editorial/fixture","image_class":"editorial_cartoon","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","width":96,"review_state":"approved","processing_state":"derivative_capable"},
"essays/photo":{"id":"essays/photo","image_class":"essay_photo","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","width":96,"review_state":"approved","processing_state":"derivative_capable"},
"medium/fixture":{"id":"medium/fixture","image_class":"medium_import","sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","width":96,"review_state":"approved","processing_state":"derivative_capable"}
}}
'@ | ConvertFrom-Json -Depth 20
$policy = [ordered]@{ version=1; mark='images/signatures/bob.png'; default_classes=@('editorial_cartoon','essay_illustration'); width_ratio=0.04; inset_ratio=0.025; overrides=@{}; legacy_assets=@{} }
$markPath = Join-Path $temp 'assets/images/signatures/bob.png'
Copy-Item -LiteralPath (Join-Path (Join-Path $Root 'assets') $production.Policy.mark) -Destination $markPath
function Read-FixturePolicy {
  param([object]$Value = $policy)
  [IO.File]::WriteAllText((Join-Path $temp 'data/image-signatures.json'), ($Value | ConvertTo-Json -Depth 20) + "`n", [Text.UTF8Encoding]::new($false))
  return Get-OipImageSignaturePolicy -Root $temp -Manifest $manifest
}
function Assert-Rejected {
  param([scriptblock]$Action, [string]$Label)
  $rejected=$false
  try { & $Action | Out-Null } catch { $rejected=$true }
  if (-not $rejected) { throw "Accepted invalid signature policy: $Label" }
}
try {
  $first = Read-FixturePolicy
  $art = $manifest.assets.'editorial/fixture'
  $photo = $manifest.assets.'essays/photo'
  $medium = $manifest.assets.'medium/fixture'
  $firstPrefix = Get-OipSignatureRenderPrefix -Asset $art -SignaturePolicy $first
  if ($firstPrefix -eq 'aaaaaaaaaaaa') { throw 'Eligible artwork retained unsigned URL.' }
  foreach ($asset in @($photo,$medium)) {
    if ((Get-OipSignatureRenderPrefix $asset $first) -cne $asset.sha256.Substring(0,12)) { throw 'Excluded asset URL changed.' }
  }
  $paths = Get-OipAllowedDerivativePaths -Manifest $manifest -SignaturePolicy $first
  foreach ($suffix in @('32w.avif','32w.webp','64w.avif','64w.webp','96w.avif','96w.webp','social-64w.jpg')) {
    if (-not $paths.Contains("images/rendered/editorial/fixture/$firstPrefix/$suffix")) { throw "Signed recipe is missing $suffix." }
  }
  $policy.width_ratio=0.05
  $changed = Read-FixturePolicy
  if ((Get-OipSignatureRenderPrefix $art $changed) -ceq $firstPrefix) { throw 'Settings change did not change rendition URL.' }
  if ((Get-OipSignatureRenderPrefix $photo $changed) -cne 'bbbbbbbbbbbb') { throw 'Settings changed excluded asset URL.' }
  $beforeMark = Get-OipSignatureRenderPrefix $art $changed
  [IO.File]::WriteAllBytes($markPath, [IO.File]::ReadAllBytes($markPath) + [byte[]]@(0))
  $changed = Read-FixturePolicy
  if ((Get-OipSignatureRenderPrefix $art $changed) -ceq $beforeMark) { throw 'Mark bytes did not change rendition URL.' }
  $beforeSource = Get-OipSignatureRenderPrefix $art $changed
  $art.sha256='d' * 64
  if ((Get-OipSignatureRenderPrefix $art $changed) -ceq $beforeSource) { throw 'Source change did not change rendition URL.' }
  $policy.overrides=@{ 'editorial/fixture'=@{enabled=$false;reason='Already signed in original'} }
  $disabled=Read-FixturePolicy
  if ((Get-OipSignatureRenderPrefix $art $disabled) -cne 'dddddddddddd') { throw 'Already-signed override was stamped again.' }
  $policy.overrides=@{ 'medium/fixture'=@{enabled=$true;reason='Confirmed original BOB artwork'} }
  if ((Get-OipSignatureRenderPrefix $medium (Read-FixturePolicy)) -ceq 'cccccccccccc') { throw 'Explicit original Medium artwork was excluded.' }
  $legacySource=$productionManifest.assets.'books/2045/cover'
  $legacyId='legacy/' + $legacySource.sha256
  $legacyPath=Join-Path $temp 'static/images/medium/fixture/source.jpg'
  [IO.Directory]::CreateDirectory((Split-Path -Parent $legacyPath)) | Out-Null
  Copy-Item -LiteralPath (Join-Path $Root ('assets/' + $legacySource.source)) -Destination $legacyPath
  $policy.legacy_assets=@{}
  $currentPolicy=Read-FixturePolicy
  $historicalUrl='/images/rendered/editorial/fixture/' + $art.sha256.Substring(0,12) + '/social-64w.jpg'
  $compatibility=@{version=1;aliases=@{$historicalUrl='editorial/fixture'}}
  $compatibilityPath=Join-Path $temp 'data/image-signature-compatibility.json'
  function Read-FixtureCompatibility([object]$Value=$compatibility) {
    [IO.File]::WriteAllText($compatibilityPath,($Value | ConvertTo-Json -Depth 10) + "`n",[Text.UTF8Encoding]::new($false))
    return Get-OipImageSignatureCompatibility -Root $temp -Manifest $manifest -SignaturePolicy $currentPolicy
  }
  $compatibilityRecord=Read-FixtureCompatibility
  $compatibilityPaths=Get-OipAllowedDerivativePaths -Manifest $manifest -SignaturePolicy $currentPolicy -SignatureCompatibility $compatibilityRecord
  $canonicalPaths=Get-OipAllowedDerivativePaths -Manifest $manifest -SignaturePolicy $currentPolicy
  if ($compatibilityPaths.Count -ne $canonicalPaths.Count + 1 -or -not $compatibilityPaths.Contains($historicalUrl.TrimStart('/'))) { throw 'Historical social alias did not add exactly one legal recipe path.' }
  if ($compatibilityRecord.CanonicalByAlias[$historicalUrl] -ceq $historicalUrl) { throw 'Historical alias replaced canonical signed identity.' }
  $emailFixturePath=Join-Path $temp 'content/almanack/fixture.md'
  [IO.Directory]::CreateDirectory((Split-Path -Parent $emailFixturePath)) | Out-Null
  $emailFixture="---`nnewsletter:`n  email_image: 'https://outsideinprint.org$historicalUrl'`n---`nFixture.`n"
  [IO.File]::WriteAllText($emailFixturePath,$emailFixture,[Text.UTF8Encoding]::new($false))
  if ((Assert-OipSignatureEmailReferences $temp $manifest $currentPolicy $compatibilityRecord) -ne 1) { throw 'Indented email_image fixture was not matched exactly once.' }
  $missingAlias=Read-FixtureCompatibility @{version=1;aliases=@{}}
  Assert-Rejected { Assert-OipSignatureEmailReferences $temp $manifest $currentPolicy $missingAlias } 'removed compatibility alias for indented email_image'
  [IO.File]::WriteAllText($emailFixturePath,$emailFixture.Replace($historicalUrl,$compatibilityRecord.CanonicalByAlias[$historicalUrl]),[Text.UTF8Encoding]::new($false))
  if ((Assert-OipSignatureEmailReferences $temp $manifest $currentPolicy $missingAlias) -ne 1) { throw 'Canonical indented email_image wrongly requires a compatibility alias.' }
  foreach ($badCompatibility in @(
    @{version=2;aliases=@{}}, @{version=1;aliases=@{};unknown=1}, @{version=1;aliases=@{$historicalUrl='unknown'}},
    @{version=1;aliases=@{$historicalUrl='essays/photo'}}, @{version=1;aliases=@{($historicalUrl.Replace('social-64w','social-32w'))='editorial/fixture'}},
    @{version=1;aliases=@{($historicalUrl.Replace('dddddddddddd','aaaaaaaaaaaa'))='editorial/fixture'}},
    @{version=1;aliases=@{($historicalUrl.Replace('.jpg','.webp'))='editorial/fixture'}}
  )) { Assert-Rejected { Read-FixtureCompatibility $badCompatibility } 'invalid historical compatibility alias' }
  Read-FixtureCompatibility | Out-Null
  $policy.legacy_assets[$legacyId]=@{ id=$legacyId; source='images/legacy-medium/fixture/source.jpg'; sha256=$legacySource.sha256; width=$legacySource.width; height=$legacySource.height; image_class='essay_illustration'; processing_hint='drawing'; processing_state='derivative_capable'; review_state='approved'; usage_state='referenced'; url='/images/medium/fixture/source.jpg'; reason='Fixture ownership evidence' }
  $legacyPolicy=Read-FixturePolicy
  $legacyPrefix=Get-OipSignatureRenderPrefix -Asset ([pscustomobject]$policy.legacy_assets[$legacyId]) -SignaturePolicy $legacyPolicy
  $legacyPaths=Get-OipAllowedDerivativePaths -Manifest $manifest -SignaturePolicy $legacyPolicy
  if (-not $legacyPaths.Contains("images/rendered/$legacyId/$legacyPrefix/96w.webp")) { throw 'Legacy asset is missing from effective output recipe.' }
  $sourceBytes=[IO.File]::ReadAllBytes($legacyPath)
  [IO.File]::WriteAllBytes($legacyPath,$sourceBytes + [byte[]]@(0))
  Assert-Rejected { Read-FixturePolicy } 'changed legacy original bytes'
  [IO.File]::WriteAllBytes($legacyPath,$sourceBytes)
  $policy.legacy_assets[$legacyId].width++
  Assert-Rejected { Read-FixturePolicy } 'stale legacy dimensions'
  $policy.legacy_assets=@{}
  foreach ($bad in @(
    @{field='width_ratio';value=0}, @{field='width_ratio';value=0.251}, @{field='width_ratio';value='0.04'},
    @{field='inset_ratio';value=-0.01}, @{field='inset_ratio';value=$true}, @{field='version';value=2},
    @{field='default_classes';value=@()}, @{field='default_classes';value=@('essay_photo')}, @{field='default_classes';value=@('editorial_cartoon','editorial_cartoon')},
    @{field='mark';value='../outside.png'}, @{field='unexpected';value=1},
    @{field='overrides';value=@{missing=@{enabled=$false;reason='Unknown'}}},
    @{field='overrides';value=@{'editorial/fixture'=@{enabled=$false}}},
    @{field='overrides';value=@{'medium/fixture'=@{enabled=$true}}},
    @{field='overrides';value=@{'essays/photo'=@{enabled=$true;reason='Not permitted'}}},
    @{field='overrides';value=@{'editorial/fixture'=@{position='center'}}},
    @{field='overrides';value=@{'editorial/fixture'=@{width_ratio='0.04'}}},
    @{field='overrides';value=@{'editorial/fixture'=@{enabled='false';reason='Wrong type'}}},
    @{field='overrides';value=@{'editorial/fixture'=@{unknown=1}}}
  )) {
    $copy=($policy | ConvertTo-Json -Depth 20 | ConvertFrom-Json -AsHashtable -Depth 20)
    $copy[$bad.field]=$bad.value
    Assert-Rejected { Read-FixturePolicy $copy } ($bad.field + '=' + ($bad.value | ConvertTo-Json -Compress -Depth 20))
  }
  Read-FixturePolicy | Out-Null
  $policyPath=Join-Path $temp 'data/image-signatures.json'
  $text=[IO.File]::ReadAllText($policyPath)
  [IO.File]::WriteAllText($policyPath,$text.Replace("`n","`r`n"),[Text.UTF8Encoding]::new($false))
  Assert-Rejected { Get-OipImageSignaturePolicy $temp $manifest } 'CRLF policy bytes'
  Remove-Item -LiteralPath $policyPath
  Assert-Rejected { Get-OipImageSignaturePolicy $temp $manifest } 'missing production policy'
  Write-Host 'Image signature policy, recipe, exclusions, and rendition invalidation passed.'
} finally {
  Remove-Item -LiteralPath $temp -Recurse -Force
}
