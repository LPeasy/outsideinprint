#requires -Version 7.0

param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$AllowPendingReview
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'helpers/responsive_image_common.ps1')

function Assert-Equal {
  param(
    [AllowNull()][object]$Actual,
    [AllowNull()][object]$Expected,
    [Parameter(Mandatory)][string]$Message
  )

  if ($Actual -ne $Expected) {
    throw "$Message Expected '$Expected'; found '$Actual'."
  }
}

function Assert-ExactProperties {
  param(
    [Parameter(Mandatory)][object]$Value,
    [Parameter(Mandatory)][string[]]$Expected,
    [Parameter(Mandatory)][string]$Context
  )

  $actualNames = @(Get-OipPropertyNames -Value $Value | Sort-Object)
  $expectedNames = @($Expected | Sort-Object)
  if (($actualNames -join "`n") -cne ($expectedNames -join "`n")) {
    throw "$Context properties differ. Expected: $($expectedNames -join ', '). Found: $($actualNames -join ', ')."
  }
}

$rootPath = [System.IO.Path]::GetFullPath($Root)
. (Join-Path $rootPath 'scripts/lib/image_asset_manifest.ps1')
$manifestPath = Join-Path $rootPath 'data/image-assets.json'
$assetsRoot = Join-Path $rootPath 'assets'
$staticRoot = Join-Path $rootPath 'static'
$canonicalFixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('oip-responsive-image-canonical-json-' + [guid]::NewGuid().ToString('N'))
$canonicalUtf8 = [System.Text.UTF8Encoding]::new($false)
New-Item -Path $canonicalFixtureRoot -ItemType Directory | Out-Null
try {
  $canonicalProbe = '{"probe":1}' + "`n"
  $canonicalProbeHash = '4bf48a3727db0ecd342ba1fbfe17331e958a4a0cbee43b9b749a5edef916c1be'
  $lfPath = Join-Path $canonicalFixtureRoot 'lf.json'
  $crlfPath = Join-Path $canonicalFixtureRoot 'crlf.json'
  $loneCrPath = Join-Path $canonicalFixtureRoot 'lone-cr.json'
  $missingFinalLfPath = Join-Path $canonicalFixtureRoot 'missing-final-lf.json'
  $doubleFinalLfPath = Join-Path $canonicalFixtureRoot 'double-final-lf.json'
  $bomPath = Join-Path $canonicalFixtureRoot 'bom.json'
  $invalidUtf8Path = Join-Path $canonicalFixtureRoot 'invalid-utf8.json'
  $writerPath = Join-Path $canonicalFixtureRoot 'writer.json'

  [System.IO.File]::WriteAllBytes($lfPath, $canonicalUtf8.GetBytes($canonicalProbe))
  [System.IO.File]::WriteAllBytes($crlfPath, $canonicalUtf8.GetBytes($canonicalProbe.Replace("`n", "`r`n")))
  [System.IO.File]::WriteAllBytes($loneCrPath, $canonicalUtf8.GetBytes($canonicalProbe.Replace("`n", "`r")))
  [System.IO.File]::WriteAllBytes($missingFinalLfPath, $canonicalUtf8.GetBytes($canonicalProbe.TrimEnd("`n")))
  [System.IO.File]::WriteAllBytes($doubleFinalLfPath, $canonicalUtf8.GetBytes($canonicalProbe + "`n"))
  [System.IO.File]::WriteAllBytes($bomPath, [byte[]](0xef, 0xbb, 0xbf) + $canonicalUtf8.GetBytes($canonicalProbe))
  [System.IO.File]::WriteAllBytes($invalidUtf8Path, [byte[]](0xc3, 0x28))

  Assert-Equal -Actual (Get-OipCanonicalTextFileSha256 -Path $lfPath -Label 'LF fixture' -RequireCanonical) -Expected $canonicalProbeHash -Message 'Canonical JSON known digest changed.'
  Assert-Equal -Actual (Get-OipCanonicalTextFileSha256 -Path $crlfPath -Label 'CRLF fixture') -Expected $canonicalProbeHash -Message 'LF and CRLF canonical hashes differ.'

  foreach ($nonCanonicalFixture in @($crlfPath, $loneCrPath, $missingFinalLfPath, $doubleFinalLfPath)) {
    $rejected = $false
    try {
      Get-OipCanonicalTextFileSha256 -Path $nonCanonicalFixture -Label 'Noncanonical fixture' -RequireCanonical | Out-Null
    }
    catch {
      $rejected = $true
    }
    if (-not $rejected) {
      throw "Canonical JSON validation accepted noncanonical line endings or final newline state: $nonCanonicalFixture"
    }
  }

  foreach ($invalidFixture in @($bomPath, $invalidUtf8Path)) {
    $rejected = $false
    try {
      Get-OipCanonicalTextFileSha256 -Path $invalidFixture -Label 'Invalid UTF-8 fixture' | Out-Null
    }
    catch {
      $rejected = $true
    }
    if (-not $rejected) {
      throw "Canonical JSON validation accepted BOM-prefixed or invalid UTF-8 input: $invalidFixture"
    }
  }

  Write-OipCanonicalJsonFile -Path $writerPath -Value ([ordered]@{ probe = 1 }) -Depth 4
  $writerText = Read-OipStrictUtf8Text -Path $writerPath -Label 'Canonical JSON writer fixture'
  if ($writerText.Contains("`r", [System.StringComparison]::Ordinal) -or
      -not $writerText.EndsWith("`n", [System.StringComparison]::Ordinal) -or
      $writerText.EndsWith("`n`n", [System.StringComparison]::Ordinal)) {
    throw 'Canonical JSON writer did not emit strict UTF-8/no-BOM/LF with exactly one final LF.'
  }
  Get-OipCanonicalTextFileSha256 -Path $writerPath -Label 'Canonical JSON writer fixture' -RequireCanonical | Out-Null
}
finally {
  if (Test-Path -LiteralPath $canonicalFixtureRoot -PathType Container) {
    Remove-Item -LiteralPath $canonicalFixtureRoot -Recurse -Force
  }
}

$gitattributesPath = Join-Path $rootPath '.gitattributes'
if (-not (Test-Path -LiteralPath $gitattributesPath -PathType Leaf)) {
  throw 'Missing .gitattributes controls for canonical responsive-image JSON.'
}
$gitattributes = [System.IO.File]::ReadAllText($gitattributesPath, [System.Text.Encoding]::UTF8)
foreach ($requiredAttribute in @(
  '/data/image-assets.json text eol=lf',
  '/reports/image-review-candidates.json text eol=lf',
  '/reports/image-visual-review.json text eol=lf',
  '/reports/responsive-image-build-evidence.json text eol=lf'
)) {
  if ($gitattributes -notmatch ('(?m)^' + [regex]::Escape($requiredAttribute) + '$')) {
    throw "Missing canonical LF attribute: $requiredAttribute"
  }
}

$manifestCanonicalSha256 = Get-OipCanonicalTextFileSha256 -Path $manifestPath -Label 'Image asset manifest' -RequireCanonical
$manifest = Get-OipImageManifest -Path $manifestPath

Assert-ExactProperties -Value $manifest -Expected @('schema_version','defaults','assets','aliases') -Context 'Manifest root'
Assert-Equal -Actual ([string]$manifest.schema_version) -Expected '1.0' -Message 'Manifest schema_version changed.'

$expectedDefaultProperties = @(
  'widths',
  'webp_quality',
  'avif_quality',
  'detail_webp_quality',
  'detail_avif_quality',
  'social_jpeg_quality',
  'max_render_width',
  'social_max_width'
)
Assert-ExactProperties -Value $manifest.defaults -Expected $expectedDefaultProperties -Context 'Manifest defaults'

$expectedWidths = @(320,640,960,1280,1600)
$actualWidths = @($manifest.defaults.widths | ForEach-Object { [int]$_ })
if (($actualWidths -join ',') -cne ($expectedWidths -join ',')) {
  throw "Responsive widths must remain 320,640,960,1280,1600; found $($actualWidths -join ',')."
}

foreach ($defaultExpectation in @(
  @{ Name = 'webp_quality'; Value = 82 },
  @{ Name = 'avif_quality'; Value = 60 },
  @{ Name = 'detail_webp_quality'; Value = 90 },
  @{ Name = 'detail_avif_quality'; Value = 70 },
  @{ Name = 'social_jpeg_quality'; Value = 85 },
  @{ Name = 'max_render_width'; Value = 1600 },
  @{ Name = 'social_max_width'; Value = 1200 }
)) {
  Assert-Equal -Actual ([int]$manifest.defaults.($defaultExpectation.Name)) -Expected $defaultExpectation.Value -Message "Manifest default $($defaultExpectation.Name) changed."
}

$assetIds = @(Get-OipPropertyNames -Value $manifest.assets | Sort-Object)
Assert-Equal -Actual $assetIds.Count -Expected 350 -Message 'Canonical managed-image inventory changed; reconcile and document any variance before release.'

$allowedAssetProperties = @('id','source','sha256','width','height','image_class','processing_hint','processing_state','processing_note','review_state','quality_override','usage_state')
$allowedClasses = @('editorial_cartoon','essay_illustration','medium_import','essay_photo')
$allowedHints = @('drawing','photo')
$allowedProcessingStates = @('derivative_capable','source_only_unprocessable')
$allowedReviewStates = @('pending_review','approved','rejected_corrupt_source')
$expectedSourceOnlyId = 'essays/the-gold-card-and-the-price-of-belonging/section-2-jpg'
$expectedSourceOnlyNote = 'legacy_jpeg_decoder_warning_premature_end_of_data_segment_and_gray_lower_region'
$pendingReviewIds = [System.Collections.Generic.List[string]]::new()
$sourceOnlyIds = [System.Collections.Generic.List[string]]::new()
$sourcePaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$sourceHashes = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$sourceFiles = [System.Collections.Generic.List[object]]::new()
$classCounts = @{}
$usageCounts = @{}

foreach ($assetId in $assetIds) {
  if ($assetId -cnotmatch '^(?:editorial/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|essays/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|medium/[0-9a-f]{64})$') {
    throw "Invalid stable image asset ID: $assetId"
  }

  $asset = $manifest.assets.$assetId
  Assert-ExactProperties -Value $asset -Expected $allowedAssetProperties -Context "Asset '$assetId'"
  Assert-Equal -Actual ([string]$asset.id) -Expected $assetId -Message "Asset key/id mismatch for '$assetId'."

  $source = ([string]$asset.source).Replace('\','/')
  if ($source -cnotmatch '^images/originals/(?:editorial|essays|medium)/[^/].*\.(?:png|jpe?g)$') {
    throw "Asset '$assetId' has an invalid managed source path: $source"
  }
  if ($source.Contains('../', [System.StringComparison]::Ordinal) -or $source.StartsWith('/', [System.StringComparison]::Ordinal)) {
    throw "Asset '$assetId' source must be asset-relative and traversal-free: $source"
  }
  $assetIdParts = $assetId.Split('/')
  if ($assetIdParts[0] -ceq 'editorial') {
    $expectedSourcePattern = '^images/originals/editorial/' + [regex]::Escape($assetIdParts[1]) + '\.(?:png|jpe?g)$'
    if ($source -cnotmatch $expectedSourcePattern) {
      throw "Editorial asset '$assetId' source does not match its stable ID: $source"
    }
  }
  elseif ($assetIdParts[0] -ceq 'essays') {
    $sourceDirectoryPattern = '^images/originals/essays/' + [regex]::Escape($assetIdParts[1]) + '/'
    $sourceStem = [System.IO.Path]::GetFileNameWithoutExtension($source)
    $expectedStem = $assetIdParts[2]
    $isExplicitJpegCollision = $expectedStem.EndsWith('-jpg', [System.StringComparison]::Ordinal) -and
      $sourceStem -ceq $expectedStem.Substring(0, $expectedStem.Length - 4) -and
      [System.IO.Path]::GetExtension($source) -ceq '.jpg'
    if ($source -cnotmatch $sourceDirectoryPattern -or ($sourceStem -cne $expectedStem -and -not $isExplicitJpegCollision)) {
      throw "Essay asset '$assetId' source does not match its stable ID: $source"
    }
  }
  elseif ($assetIdParts[0] -ceq 'medium') {
    $sourceStem = [System.IO.Path]::GetFileNameWithoutExtension($source)
    if ($source -cnotmatch '^images/originals/medium/[^/]+\.(?:png|jpe?g)$' -or $sourceStem -cne $assetIdParts[1]) {
      throw "Medium asset '$assetId' source must be named by its canonical SHA-256 ID: $source"
    }
  }
  if (-not $sourcePaths.Add($source)) {
    throw "Multiple canonical assets point at the same source path: $source"
  }

  $sourceFullPath = [System.IO.Path]::GetFullPath((Join-Path $assetsRoot $source))
  $assetsPrefix = $assetsRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $sourceFullPath.StartsWith($assetsPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Asset '$assetId' source escaped assets/: $source"
  }
  if (-not (Test-Path -LiteralPath $sourceFullPath -PathType Leaf)) {
    throw "Asset '$assetId' source is missing: $source"
  }
  if (-not (Test-OipImageSignature -Path $sourceFullPath)) {
    throw "Asset '$assetId' source signature does not match its extension: $source"
  }

  $sha256 = ([string]$asset.sha256).ToLowerInvariant()
  if ($sha256 -cnotmatch '^[0-9a-f]{64}$') {
    throw "Asset '$assetId' has an invalid SHA-256 value."
  }
  $actualSha256 = Get-OipSha256 -Path $sourceFullPath
  Assert-Equal -Actual $actualSha256 -Expected $sha256 -Message "Asset '$assetId' source hash changed."
  if (-not $sourceHashes.Add($sha256)) {
    throw "Duplicate canonical source hash found for '$assetId': $sha256"
  }

  $dimensions = Get-OipImageDimensions -Path $sourceFullPath
  Assert-Equal -Actual ([int]$asset.width) -Expected ([int]$dimensions.Width) -Message "Asset '$assetId' source width is stale."
  Assert-Equal -Actual ([int]$asset.height) -Expected ([int]$dimensions.Height) -Message "Asset '$assetId' source height is stale."
  if ([int]$asset.width -le 0 -or [int]$asset.height -le 0) {
    throw "Asset '$assetId' dimensions must be positive."
  }

  $imageClass = [string]$asset.image_class
  if ($allowedClasses -cnotcontains $imageClass) {
    throw "Asset '$assetId' has unsupported image_class '$imageClass'."
  }
  if (-not $classCounts.ContainsKey($imageClass)) {
    $classCounts[$imageClass] = 0
  }
  $classCounts[$imageClass]++

  $processingHint = [string]$asset.processing_hint
  if ($allowedHints -cnotcontains $processingHint) {
    throw "Asset '$assetId' has unsupported processing_hint '$processingHint'."
  }
  if ($imageClass -eq 'essay_photo' -and $processingHint -cne 'photo') {
    throw "Essay photo '$assetId' must use processing_hint 'photo'."
  }
  if ($imageClass -in @('editorial_cartoon','essay_illustration') -and $processingHint -cne 'drawing') {
    throw "Illustration '$assetId' must use processing_hint 'drawing'."
  }

  $processingState = [string]$asset.processing_state
  if ($allowedProcessingStates -cnotcontains $processingState) {
    throw "Asset '$assetId' has unsupported processing_state '$processingState'."
  }
  if ($processingState -ceq 'source_only_unprocessable') {
    $sourceOnlyIds.Add($assetId)
    if ($imageClass -cne 'essay_photo' -or [string]$asset.usage_state -cne 'retained_unreferenced') {
      throw "Source-only asset '$assetId' must be an intentionally retained, unreferenced essay_photo."
    }
    if ([string]::IsNullOrWhiteSpace([string]$asset.processing_note)) {
      throw "Source-only asset '$assetId' must record a tracked-safe processing_note."
    }
  }
  elseif ($null -ne $asset.processing_note) {
    throw "Derivative-capable asset '$assetId' must keep processing_note null."
  }

  $reviewState = [string]$asset.review_state
  if ($allowedReviewStates -cnotcontains $reviewState) {
    throw "Asset '$assetId' has unsupported review_state '$reviewState'."
  }
  if ($reviewState -ceq 'rejected_corrupt_source' -and $processingState -cne 'source_only_unprocessable') {
    throw "Only the quarantined source-only asset may use review_state rejected_corrupt_source: '$assetId'."
  }
  if ($processingState -ceq 'source_only_unprocessable' -and $reviewState -cne 'rejected_corrupt_source') {
    throw "Source-only asset '$assetId' must be quarantined with review_state rejected_corrupt_source."
  }
  if ($reviewState -cne 'approved' -and $reviewState -cne 'rejected_corrupt_source') {
    $pendingReviewIds.Add($assetId)
  }

  $usageState = [string]$asset.usage_state
  if ($usageState -cnotin @('referenced','retained_unreferenced')) {
    throw "Asset '$assetId' has unsupported usage_state '$usageState'."
  }
  if (-not $usageCounts.ContainsKey($usageState)) {
    $usageCounts[$usageState] = 0
  }
  $usageCounts[$usageState]++
  if ($usageState -ceq 'referenced' -and $processingState -cne 'derivative_capable') {
    throw "Referenced asset '$assetId' must remain derivative_capable."
  }

  if ($null -ne $asset.quality_override) {
    Assert-ExactProperties -Value $asset.quality_override -Expected @('webp_quality','avif_quality') -Context "Asset '$assetId' quality_override"
    Assert-Equal -Actual ([int]$asset.quality_override.webp_quality) -Expected 90 -Message "Asset '$assetId' detail WebP override changed."
    Assert-Equal -Actual ([int]$asset.quality_override.avif_quality) -Expected 70 -Message "Asset '$assetId' detail AVIF override changed."
  }

  if ($imageClass -eq 'medium_import') {
    $sourceName = [System.IO.Path]::GetFileNameWithoutExtension($source)
    Assert-Equal -Actual $sourceName -Expected $sha256 -Message "Shared Medium source for '$assetId' must be named by SHA-256."
  }

  $sourceFiles.Add([pscustomobject]@{
    Id = $assetId
    Path = $sourceFullPath
    RelativePath = $source
    Sha256 = $sha256
    Bytes = (Get-Item -LiteralPath $sourceFullPath).Length
  })
}

Assert-Equal -Actual ([int]($classCounts['medium_import'] ?? 0)) -Expected 7 -Message 'Shared Medium canonical count changed.'
Assert-Equal -Actual ([int]($classCounts['essay_photo'] ?? 0)) -Expected 13 -Message 'Supplemental essay-photo count changed.'
$coreIllustrationCount = [int]($classCounts['editorial_cartoon'] ?? 0) + [int]($classCounts['essay_illustration'] ?? 0) + [int]($classCounts['medium_import'] ?? 0)
Assert-Equal -Actual $coreIllustrationCount -Expected 337 -Message 'Core responsive-image review cohort changed.'
Assert-Equal -Actual ([int]($usageCounts['retained_unreferenced'] ?? 0)) -Expected 5 -Message 'The explicit retained-but-unreferenced source count changed.'
Assert-Equal -Actual ([int]($usageCounts['referenced'] ?? 0)) -Expected 345 -Message 'Referenced managed-source count changed.'
Assert-Equal -Actual $sourceOnlyIds.Count -Expected 1 -Message 'Exactly one corrupt supplemental source may be quarantined as source_only_unprocessable.'
Assert-Equal -Actual $sourceOnlyIds[0] -Expected $expectedSourceOnlyId -Message 'The quarantined source-only asset changed.'
Assert-Equal -Actual ([string]$manifest.assets.$expectedSourceOnlyId.processing_note) -Expected $expectedSourceOnlyNote -Message 'The tracked-safe quarantine reason changed.'

$managedSourceFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $assetsRoot 'images/originals') -File -Recurse |
    Where-Object { $_.Extension -in @('.png','.jpg','.jpeg') }
)
$managedSourceRelativePaths = @(
  $managedSourceFiles |
    ForEach-Object { $_.FullName.Substring($assetsRoot.Length + 1).Replace('\','/') } |
    Sort-Object
)
$manifestSourceRelativePaths = @($sourcePaths | Sort-Object)
if (($managedSourceRelativePaths -join "`n") -cne ($manifestSourceRelativePaths -join "`n")) {
  $missingFromManifest = @($managedSourceRelativePaths | Where-Object { -not $sourcePaths.Contains($_) })
  $missingOnDisk = @($manifestSourceRelativePaths | Where-Object { -not (Test-Path -LiteralPath (Join-Path $assetsRoot $_) -PathType Leaf) })
  throw "Managed source files and manifest entries differ. Unregistered: $($missingFromManifest -join ', '). Missing: $($missingOnDisk -join ', ')."
}

$aliasNames = @(Get-OipPropertyNames -Value $manifest.aliases | Sort-Object)
Assert-Equal -Actual $aliasNames.Count -Expected 391 -Message 'Frozen retired-path alias inventory changed; reconcile and document any variance before release.'
$sourceOnlyAliasCount = @($aliasNames | Where-Object { [string]$manifest.aliases.$_ -ceq $sourceOnlyIds[0] }).Count
Assert-Equal -Actual $sourceOnlyAliasCount -Expected 1 -Message 'The quarantined source must retain exactly one historical retired-path alias.'

$aliasResolutionState = @{}
function Resolve-OipAlias {
  param(
    [Parameter(Mandatory)][string]$Alias,
    [Parameter(Mandatory)][AllowEmptyCollection()][System.Collections.Generic.HashSet[string]]$Trail
  )

  if ($assetIds -ccontains $Alias) {
    return $Alias
  }
  if ($aliasNames -cnotcontains $Alias) {
    throw "Alias target does not resolve to a canonical asset: $Alias"
  }
  if (-not $Trail.Add($Alias)) {
    throw "Responsive-image alias cycle detected: $($Trail -join ' -> ') -> $Alias"
  }
  $target = [string]$manifest.aliases.$Alias
  $resolved = Resolve-OipAlias -Alias $target -Trail $Trail
  $Trail.Remove($Alias) | Out-Null
  return $resolved
}

foreach ($alias in $aliasNames) {
  if ($alias -cnotmatch '^/images/(?:editorial|essays|medium)/.+\.(?:png|jpe?g)$') {
    throw "Managed alias must be an exact former public image URL: $alias"
  }
  if ($alias.Contains('/originals/', [System.StringComparison]::Ordinal)) {
    throw "Alias exposes the private source-art namespace: $alias"
  }
  $trail = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $resolved = Resolve-OipAlias -Alias $alias -Trail $trail
  if ($assetIds -cnotcontains $resolved) {
    throw "Alias '$alias' failed to resolve to a canonical asset."
  }
  $aliasResolutionState[$alias] = $resolved

  $retiredStaticPath = Join-Path $staticRoot $alias.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  if (Test-Path -LiteralPath $retiredStaticPath) {
    throw "Retired managed source remains under static/: $alias"
  }
}

foreach ($retiredDirectory in @('static/images/editorial','static/images/essays')) {
  $fullDirectory = Join-Path $rootPath $retiredDirectory
  if (-not (Test-Path -LiteralPath $fullDirectory -PathType Container)) {
    continue
  }
  $retiredRasterFiles = @(Get-ChildItem -LiteralPath $fullDirectory -File -Recurse | Where-Object { $_.Extension -in @('.png','.jpg','.jpeg') })
  if ($retiredRasterFiles.Count -gt 0) {
    $sample = @($retiredRasterFiles | Select-Object -First 8 | ForEach-Object { $_.FullName.Substring($rootPath.Length + 1).Replace('\','/') })
    throw "Managed editorial/essay raster originals remain under static/. Samples: $($sample -join ', ')"
  }
}

$sourceLengths = @{}
foreach ($sourceFile in $sourceFiles) {
  $lengthKey = [string]$sourceFile.Bytes
  if (-not $sourceLengths.ContainsKey($lengthKey)) {
    $sourceLengths[$lengthKey] = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  }
  $sourceLengths[$lengthKey].Add($sourceFile.Sha256) | Out-Null
}

if (Test-Path -LiteralPath $staticRoot -PathType Container) {
  foreach ($staticImage in Get-ChildItem -LiteralPath $staticRoot -File -Recurse | Where-Object { $_.Extension -in @('.png','.jpg','.jpeg','.webp','.avif') }) {
    $lengthKey = [string]$staticImage.Length
    if (-not $sourceLengths.ContainsKey($lengthKey)) {
      continue
    }
    $staticHash = Get-OipSha256 -Path $staticImage.FullName
    if ($sourceLengths[$lengthKey].Contains($staticHash)) {
      throw "Managed original is duplicated under static/: $($staticImage.FullName.Substring($rootPath.Length + 1).Replace('\','/'))"
    }
  }
}

# Every managed-image producer shares one byte/signature gate. Keep the reachable
# producer call sites bound to that gate before any managed-source write.
$producerGuardContracts = @(
  @{ Path = 'scripts/import_medium_export.ps1'; Mutation = '[System.IO.File]::WriteAllBytes($dest, $bytes)' },
  @{ Path = 'scripts/normalize_essay_hero_images.ps1'; Mutation = '[System.IO.File]::WriteAllBytes($destination, $download.Bytes)' },
  @{ Path = 'scripts/recover_medium_body_images.ps1'; Mutation = '[System.IO.File]::WriteAllBytes($assetPath, $download.Bytes)' }
)
foreach ($producerContract in $producerGuardContracts) {
  $producerPath = Join-Path $rootPath $producerContract.Path
  $producerText = Get-Content -LiteralPath $producerPath -Raw -Encoding utf8
  $guardIndex = $producerText.IndexOf('Resolve-OipManagedImageExtension', [System.StringComparison]::Ordinal)
  $mutationIndex = $producerText.IndexOf([string]$producerContract.Mutation, [System.StringComparison]::Ordinal)
  if ($guardIndex -lt 0 -or $mutationIndex -lt 0 -or $guardIndex -gt $mutationIndex) {
    throw "Managed-image producer must validate downloaded bytes before writing: $($producerContract.Path)"
  }
  if ($producerText.Contains('function Get-SafeExtension', [System.StringComparison]::Ordinal)) {
    throw "Managed-image producer reintroduced an extension-only bypass: $($producerContract.Path)"
  }
}

$guardFixture = @($sourceFiles | Where-Object {
  [System.IO.Path]::GetExtension([string]$_.Path) -ceq '.png' -and [string]$_.Id -cne $expectedSourceOnlyId
} | Select-Object -First 1)
if ($guardFixture.Count -ne 1) {
  throw 'Managed-image producer guard test requires one decodable PNG fixture.'
}
$guardBytes = [System.IO.File]::ReadAllBytes([string]$guardFixture[0].Path)
Assert-Equal -Actual (Resolve-OipManagedImageExtension -Bytes $guardBytes -Url 'https://example.test/image.png' -ContentType 'image/png') -Expected '.png' -Message 'Managed PNG producer guard rejected a valid source.'

foreach ($unsupportedCase in @(
  @{ Url = 'https://example.test/image.webp'; ContentType = 'image/webp' },
  @{ Url = 'https://example.test/image.gif'; ContentType = 'image/gif' },
  @{ Url = 'https://example.test/image.svg'; ContentType = 'image/svg+xml' },
  @{ Url = 'https://example.test/image.bin'; ContentType = 'application/octet-stream' },
  @{ Url = 'https://example.test/image'; ContentType = 'image/webp' }
)) {
  $rejected = $false
  try {
    Resolve-OipManagedImageExtension -Bytes $guardBytes -Url $unsupportedCase.Url -ContentType $unsupportedCase.ContentType | Out-Null
  }
  catch {
    $rejected = $_.Exception.Message -match 'unsupported'
  }
  if (-not $rejected) {
    throw "Managed-image producer guard accepted unsupported input: $($unsupportedCase.Url) [$($unsupportedCase.ContentType)]"
  }
}

$signatureMismatchRejected = $false
try {
  Resolve-OipManagedImageExtension -Bytes $guardBytes -Url 'https://example.test/image.jpg' -ContentType 'image/jpeg' | Out-Null
}
catch {
  $signatureMismatchRejected = $_.Exception.Message -match 'file signature'
}
if (-not $signatureMismatchRejected) {
  throw 'Managed-image producer guard accepted a PNG payload labeled as JPEG.'
}

$malformedPng = [byte[]]::new(33)
[byte[]](0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a) | ForEach-Object -Begin { $index = 0 } -Process {
  $malformedPng[$index] = $_
  $index++
}
$malformedPng[11] = 13
[System.Text.Encoding]::ASCII.GetBytes('IHDR').CopyTo($malformedPng, 12)
$malformedPngRejected = $false
try {
  Assert-OipManagedImageBytes -Bytes $malformedPng -Extension '.png' -Label 'Malformed PNG fixture' | Out-Null
}
catch {
  $malformedPngRejected = $_.Exception.Message -match 'invalid native dimensions'
}
if (-not $malformedPngRejected) {
  throw 'Managed-image producer guard accepted a PNG with zero native dimensions.'
}

$malformedJpeg = [byte[]](0xff,0xd8,0xff,0xc0,0x00,0x08,0x08,0x00,0x00,0x00,0x01,0x01)
$malformedJpegRejected = $false
try {
  Assert-OipManagedImageBytes -Bytes $malformedJpeg -Extension '.jpg' -Label 'Malformed JPEG fixture' | Out-Null
}
catch {
  $malformedJpegRejected = $_.Exception.Message -match 'invalid native dimensions'
}
if (-not $malformedJpegRejected) {
  throw 'Managed-image producer guard accepted a JPEG with zero native dimensions.'
}

$producerTempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$producerTempRoot = Join-Path $producerTempBase ('oip-managed-producer-guard-' + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $producerTempRoot -Force | Out-Null
  $unsupportedInput = Join-Path $producerTempRoot 'unsupported.webp'
  [System.IO.File]::WriteAllBytes($unsupportedInput, $guardBytes)
  $registrarRejected = $false
  try {
    & (Join-Path $rootPath 'scripts/register_managed_image_asset.ps1') `
      -Root $producerTempRoot `
      -InputPath $unsupportedInput `
      -AssetId 'medium/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' `
      -AssetSource 'images/originals/medium/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.webp' `
      -ImageClass 'medium_import' `
      -ProcessingHint 'photo' | Out-Null
  }
  catch {
    $registrarRejected = $_.Exception.Message -match 'supported extension'
  }
  if (-not $registrarRejected) {
    throw 'Generic managed-image registrar accepted a WebP source.'
  }
  if (
    (Test-Path -LiteralPath (Join-Path $producerTempRoot 'data/image-assets.json')) -or
    (Test-Path -LiteralPath (Join-Path $producerTempRoot 'assets/images/originals/medium/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.webp'))
  ) {
    throw 'Generic managed-image registrar mutated the manifest or managed-source tree before rejecting WebP.'
  }

  $mislabeledInput = Join-Path $producerTempRoot 'mislabeled.png'
  $jpegFixture = @($sourceFiles | Where-Object { [System.IO.Path]::GetExtension([string]$_.Path) -in @('.jpg','.jpeg') } | Select-Object -First 1)
  if ($jpegFixture.Count -ne 1) {
    throw 'Managed-image producer guard test requires one decodable JPEG fixture.'
  }
  [System.IO.File]::Copy([string]$jpegFixture[0].Path, $mislabeledInput, $true)
  $signatureRejected = $false
  try {
    & (Join-Path $rootPath 'scripts/register_managed_image_asset.ps1') `
      -Root $producerTempRoot `
      -InputPath $mislabeledInput `
      -AssetId 'medium/fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210' `
      -AssetSource 'images/originals/medium/fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210.png' `
      -ImageClass 'medium_import' `
      -ProcessingHint 'drawing' | Out-Null
  }
  catch {
    $signatureRejected = $_.Exception.Message -match 'file signature'
  }
  if (-not $signatureRejected) {
    throw 'Generic managed-image registrar accepted JPEG bytes under a PNG extension.'
  }
  if (
    (Test-Path -LiteralPath (Join-Path $producerTempRoot 'data/image-assets.json')) -or
    (Test-Path -LiteralPath (Join-Path $producerTempRoot 'assets/images/originals/medium/fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210.png'))
  ) {
    throw 'Generic managed-image registrar mutated the manifest or managed-source tree before rejecting a signature mismatch.'
  }
}
finally {
  if (Test-Path -LiteralPath $producerTempRoot -PathType Container) {
    $resolvedProducerTempRoot = [System.IO.Path]::GetFullPath($producerTempRoot)
    if (-not $resolvedProducerTempRoot.StartsWith($producerTempBase, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove managed-producer fixture outside the system temp root: $resolvedProducerTempRoot"
    }
    Remove-Item -LiteralPath $resolvedProducerTempRoot -Recurse -Force
  }
}

$referenceFiles = @()
$logicalReferenceCounts = @{}
foreach ($assetId in $assetIds) {
  $logicalReferenceCounts[$assetId] = 0
}
foreach ($referenceRoot in @('content','data')) {
  $fullReferenceRoot = Join-Path $rootPath $referenceRoot
  if (Test-Path -LiteralPath $fullReferenceRoot -PathType Container) {
    $referenceFiles += @(Get-ChildItem -LiteralPath $fullReferenceRoot -File -Recurse | Where-Object {
      $_.FullName -cne $manifestPath -and $_.Extension -in @('.md','.html','.yaml','.yml','.json','.toml')
    })
  }
}

foreach ($referenceFile in $referenceFiles) {
  $text = Get-Content -LiteralPath $referenceFile.FullName -Raw -Encoding utf8
  if ($text.Contains($sourceOnlyIds[0], [System.StringComparison]::Ordinal)) {
    throw "Content/data must not reference quarantined source-only asset '$($sourceOnlyIds[0])': $($referenceFile.FullName.Substring($rootPath.Length + 1).Replace('\','/'))"
  }
  foreach ($alias in $aliasNames) {
    if ($text.Contains($alias, [System.StringComparison]::Ordinal)) {
      throw "Content/data must use a stable asset ID (or oip-image: in Markdown), not retired managed URL '$alias': $($referenceFile.FullName.Substring($rootPath.Length + 1).Replace('\','/'))"
    }
  }
  if ($text -match '(?i)/images/originals/') {
    throw "Content/data exposes the managed originals namespace: $($referenceFile.FullName.Substring($rootPath.Length + 1).Replace('\','/'))"
  }
  foreach ($assetId in $assetIds) {
    $assetPattern = '(?<![a-z0-9/-])' + [regex]::Escape($assetId) + '(?![a-z0-9/-])'
    if ([regex]::IsMatch($text, $assetPattern, [System.Text.RegularExpressions.RegexOptions]::CultureInvariant)) {
      $logicalReferenceCounts[$assetId]++
    }
  }
}

foreach ($assetId in $assetIds) {
  $usageState = [string]$manifest.assets.$assetId.usage_state
  $referenceCount = [int]$logicalReferenceCounts[$assetId]
  if ($usageState -ceq 'referenced' -and $referenceCount -eq 0) {
    throw "Managed asset is marked referenced but has no logical content/data reference: $assetId"
  }
  if ($usageState -ceq 'retained_unreferenced' -and $referenceCount -ne 0) {
    throw "Managed asset is marked retained_unreferenced but appears in content/data: $assetId"
  }
}

$reviewReportPath = Join-Path $rootPath 'reports/image-review-candidates.json'
if (-not (Test-Path -LiteralPath $reviewReportPath -PathType Leaf)) {
  throw "Missing deterministic high-risk image review report: $reviewReportPath"
}
$reviewReportCanonicalSha256 = Get-OipCanonicalTextFileSha256 -Path $reviewReportPath -Label 'Image review candidate report' -RequireCanonical
$reviewReport = Get-Content -LiteralPath $reviewReportPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 20
Assert-ExactProperties -Value $reviewReport -Expected @(
  'schema_version',
  'manifest_sha256',
  'canonical_asset_count',
  'candidate_count',
  'minimum_candidate_count',
  'deep_review_count',
  'selection_rule',
  'deep_review_rule',
  'reason_counts',
  'deep_review_category_counts',
  'candidates',
  'deep_review_selection'
) -Context 'Image review report root'
Assert-Equal -Actual ([string]$reviewReport.schema_version) -Expected '1.0' -Message 'Image review report schema changed.'
Assert-Equal -Actual ([string]$reviewReport.manifest_sha256) -Expected $manifestCanonicalSha256 -Message 'Image review report is stale relative to the canonical manifest.'
Assert-Equal -Actual ([int]$reviewReport.canonical_asset_count) -Expected $assetIds.Count -Message 'Image review report canonical count is stale.'
$reviewCandidates = @($reviewReport.candidates)
$deepReviewSelection = @($reviewReport.deep_review_selection)
Assert-Equal -Actual ([int]$reviewReport.candidate_count) -Expected $reviewCandidates.Count -Message 'Image review report candidate_count is stale.'
Assert-Equal -Actual ([int]$reviewReport.deep_review_count) -Expected $deepReviewSelection.Count -Message 'Image review report deep_review_count is stale.'
if ([int]$reviewReport.minimum_candidate_count -lt 24 -or $reviewCandidates.Count -lt [int]$reviewReport.minimum_candidate_count) {
  throw 'Image review report must include at least 24 high-risk candidates.'
}
if ($deepReviewSelection.Count -lt 24) {
  throw 'Image review report must select at least 24 assets for deep review.'
}

$candidateIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($candidate in $reviewCandidates) {
  $candidateId = [string]$candidate.id
  if (-not $candidateIds.Add($candidateId)) {
    throw "Image review report contains duplicate candidate: $candidateId"
  }
  if ($assetIds -cnotcontains $candidateId) {
    throw "Image review report contains an unregistered candidate: $candidateId"
  }
  $candidateAsset = $manifest.assets.$candidateId
  foreach ($field in @('source','sha256','width','height','image_class','processing_hint','processing_state','processing_note','review_state','usage_state')) {
    $rawCandidateValue = if ($candidate -is [System.Collections.IDictionary]) { $candidate[$field] } else { $candidate.$field }
    $candidateValue = if ($null -eq $rawCandidateValue) { $null } else { [string]$rawCandidateValue }
    $manifestValue = if ($null -eq $candidateAsset.$field) { $null } else { [string]$candidateAsset.$field }
    if ($candidateValue -cne $manifestValue) {
      throw "Image review candidate '$candidateId' has stale $field evidence."
    }
  }
}
if (-not $candidateIds.Contains($expectedSourceOnlyId)) {
  throw 'The quarantined corrupt source must remain in the raw-source review candidate report.'
}

$deepReviewIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($selection in $deepReviewSelection) {
  $selectionId = [string]$selection.id
  if (-not $deepReviewIds.Add($selectionId)) {
    throw "Image review report contains a duplicate deep-review selection: $selectionId"
  }
  if (-not $candidateIds.Contains($selectionId)) {
    throw "Deep-review selection is not part of the high-risk candidate cohort: $selectionId"
  }
  if ([string]$manifest.assets.$selectionId.processing_state -cne 'derivative_capable') {
    throw "Deep-review selection cannot produce comparison derivatives: $selectionId"
  }
}
foreach ($requiredCategory in @('fine_text','crosshatching','faces_or_photos','dark_tones','saturated_color','extreme_aspect_ratio','largest_source_bytes','largest_native_dimensions')) {
  if (-not $reviewReport.deep_review_category_counts.ContainsKey($requiredCategory) -or [int]$reviewReport.deep_review_category_counts[$requiredCategory] -lt 1) {
    throw "Deep-review selection does not cover required high-risk category: $requiredCategory"
  }
}

$visualReviewPath = Join-Path $rootPath 'reports/image-visual-review.json'
Get-OipCanonicalTextFileSha256 -Path $visualReviewPath -Label 'Image visual review evidence' -RequireCanonical | Out-Null
$visualReview = Get-Content -LiteralPath $visualReviewPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 20
Assert-Equal -Actual ([string]$visualReview.manifest_sha256_before_review_basis) -Expected 'historical_windows_worktree_bytes' -Message 'Historical pre-review manifest hash basis changed.'
Assert-Equal -Actual ([string]$visualReview.manifest_sha256_after_review_basis) -Expected 'canonical_utf8_no_bom_lf_single_terminal_lf' -Message 'Current manifest hash basis changed.'
Assert-Equal -Actual ([string]$visualReview.candidate_report_sha256_basis) -Expected 'canonical_utf8_no_bom_lf_single_terminal_lf' -Message 'Candidate report hash basis changed.'
Assert-Equal -Actual ([string]$visualReview.manifest_sha256_after_review) -Expected $manifestCanonicalSha256 -Message 'Image visual review evidence is stale relative to the canonical manifest.'
Assert-Equal -Actual ([string]$visualReview.candidate_report_sha256) -Expected $reviewReportCanonicalSha256 -Message 'Image visual review evidence is stale relative to the canonical candidate report.'

$buildEvidencePath = Join-Path $rootPath 'reports/responsive-image-build-evidence.json'
Get-OipCanonicalTextFileSha256 -Path $buildEvidencePath -Label 'Responsive image build evidence' -RequireCanonical | Out-Null
$buildEvidence = Get-Content -LiteralPath $buildEvidencePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 20
Assert-Equal -Actual ([string]$buildEvidence.source_manifest_sha256_basis) -Expected 'canonical_utf8_no_bom_lf_single_terminal_lf' -Message 'Responsive image build evidence hash basis changed.'
Assert-Equal -Actual ([string]$buildEvidence.source_manifest_sha256) -Expected $manifestCanonicalSha256 -Message 'Responsive image build evidence is stale relative to the canonical manifest.'

if (-not $AllowPendingReview -and $pendingReviewIds.Count -gt 0) {
  $sample = @($pendingReviewIds | Select-Object -First 12)
  $suffix = if ($pendingReviewIds.Count -gt $sample.Count) { ', ...' } else { '' }
  throw "$($pendingReviewIds.Count) managed image assets have not passed visual review. Pending sample: $($sample -join ', ')$suffix. Use -AllowPendingReview only for local structural validation; CI and publication gates must omit it."
}

Write-Host "Responsive-image source contract passed: $($assetIds.Count) canonical assets, $($aliasNames.Count) retired-path aliases."
$global:LASTEXITCODE = 0
exit 0
