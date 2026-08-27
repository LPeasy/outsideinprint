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

  $portableBasis = 'strict_utf8_bom_preserved_crlf_and_cr_to_lf_terminal_newlines_preserved_sha256'
  Assert-Equal -Actual (Get-OipPortableTextSha256Basis) -Expected $portableBasis -Message 'Portable rewritten-content digest basis changed.'
  $portableLfBytes = $canonicalUtf8.GetBytes("alpha`nbeta`n")
  $portableCrLfBytes = $canonicalUtf8.GetBytes("alpha`r`nbeta`r`n")
  $portableLoneCrBytes = $canonicalUtf8.GetBytes("alpha`rbeta`r")
  $portableChangedBytes = $canonicalUtf8.GetBytes("alpha`ngamma`n")
  $portableMissingFinalLfBytes = $canonicalUtf8.GetBytes("alpha`nbeta")
  $portableDoubleFinalLfBytes = $canonicalUtf8.GetBytes("alpha`nbeta`n`n")
  $portableBomBytes = [byte[]](0xef, 0xbb, 0xbf) + $portableLfBytes
  $portableHash = Get-OipSha256ForBytes -Bytes $portableLfBytes
  Assert-Equal -Actual (Get-OipPortableTextSha256ForBytes -Bytes $portableLfBytes -Label 'Portable LF fixture') -Expected $portableHash -Message 'Portable LF digest changed.'
  Assert-Equal -Actual (Get-OipPortableTextSha256ForBytes -Bytes $portableCrLfBytes -Label 'Portable CRLF fixture') -Expected $portableHash -Message 'Portable LF and CRLF digests differ.'
  Assert-Equal -Actual (Get-OipPortableTextSha256ForBytes -Bytes $portableLoneCrBytes -Label 'Portable lone-CR fixture') -Expected $portableHash -Message 'Portable LF and lone-CR digests differ.'
  if ((Get-OipPortableTextSha256ForBytes -Bytes $portableChangedBytes) -ceq $portableHash) {
    throw 'Portable rewritten-content digest did not detect changed text.'
  }
  $terminalDigests = @(
    Get-OipPortableTextSha256ForBytes -Bytes $portableMissingFinalLfBytes
    Get-OipPortableTextSha256ForBytes -Bytes $portableLfBytes
    Get-OipPortableTextSha256ForBytes -Bytes $portableDoubleFinalLfBytes
  ) | Sort-Object -Unique
  Assert-Equal -Actual $terminalDigests.Count -Expected 3 -Message 'Portable digest did not preserve terminal-newline presence and count.'
  $portableBomHash = Get-OipPortableTextSha256ForBytes -Bytes $portableBomBytes -Label 'Portable BOM fixture'
  Assert-Equal -Actual $portableBomHash -Expected (Get-OipSha256ForBytes -Bytes $portableBomBytes) -Message 'Portable digest did not preserve the leading UTF-8 BOM.'
  if ($portableBomHash -ceq $portableHash) {
    throw 'Portable digest did not distinguish BOM and no-BOM text.'
  }
  $portableCrLfPath = Join-Path $canonicalFixtureRoot 'portable-crlf.txt'
  [System.IO.File]::WriteAllBytes($portableCrLfPath, $portableCrLfBytes)
  Assert-Equal -Actual (Get-OipPortableTextFileSha256 -Path $portableCrLfPath) -Expected $portableHash -Message 'Portable file and byte digests differ.'
  $portableInvalidRejected = $false
  try {
    Get-OipPortableTextSha256ForBytes -Bytes ([byte[]](0xc3, 0x28)) -Label 'Portable invalid UTF-8 fixture' | Out-Null
  }
  catch {
    $portableInvalidRejected = $_.Exception.Message -match 'not valid UTF-8'
  }
  if (-not $portableInvalidRejected) {
    throw 'Portable rewritten-content digest accepted invalid UTF-8.'
  }
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
$gitattributes = [System.IO.File]::ReadAllText($gitattributesPath, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n").Replace("`r", "`n")
foreach ($requiredAttribute in @(
  '/data/image-assets.json text eol=lf',
  '/reports/image-review-candidates.json text eol=lf',
  '/reports/image-visual-review.json text eol=lf',
  '/reports/responsive-image-build-evidence.json text eol=lf',
  '/reports/legacy-image-focused-cleanup-inventory.json text eol=lf',
  '/reports/focused-image-visual-review.json text eol=lf'
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

$focusedCleanupBaselineAssetCount = 459
$focusedCleanupBaselineAliasCount = 500
$focusedCleanupBaselineCoreReviewCount = 446
$focusedCleanupBaselineReferencedCount = 454
$focusedCleanupBaselineDerivativeCapableCount = 458

$assetIds = @(Get-OipPropertyNames -Value $manifest.assets | Sort-Object)
$routineManagedAssetCount = $assetIds.Count - $focusedCleanupBaselineAssetCount
if ($routineManagedAssetCount -lt 0) {
  throw "Focused-cleanup managed-image inventory shrank below the release baseline. Expected at least '$focusedCleanupBaselineAssetCount'; found '$($assetIds.Count)'."
}

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
  if ($assetId -cnotmatch '^(?:editorial/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|essays(?:/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?){2,3}|medium/[0-9a-f]{64})$') {
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
    $expectedSourcePrefix = 'images/originals/' + (($assetIdParts[0..($assetIdParts.Count - 2)]) -join '/') + '/'
    $sourceStem = [System.IO.Path]::GetFileNameWithoutExtension($source)
    $expectedStem = $assetIdParts[-1]
    $isExplicitJpegCollision = $expectedStem.EndsWith('-jpg', [System.StringComparison]::Ordinal) -and
      $sourceStem -ceq $expectedStem.Substring(0, $expectedStem.Length - 4) -and
      [System.IO.Path]::GetExtension($source) -ceq '.jpg'
    if (-not $source.StartsWith($expectedSourcePrefix, [System.StringComparison]::Ordinal) -or
      ($sourceStem -cne $expectedStem -and -not $isExplicitJpegCollision)) {
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

Assert-Equal -Actual ([int]($classCounts['medium_import'] ?? 0)) -Expected 112 -Message 'Managed Medium canonical count changed.'
Assert-Equal -Actual ([int]($classCounts['essay_photo'] ?? 0)) -Expected 13 -Message 'Supplemental essay-photo count changed.'
$coreIllustrationCount = [int]($classCounts['editorial_cartoon'] ?? 0) + [int]($classCounts['essay_illustration'] ?? 0) + [int]($classCounts['medium_import'] ?? 0)
Assert-Equal -Actual $coreIllustrationCount -Expected ($focusedCleanupBaselineCoreReviewCount + $routineManagedAssetCount) -Message 'Core responsive-image review cohort changed outside routine managed-art growth.'
Assert-Equal -Actual ([int]($usageCounts['retained_unreferenced'] ?? 0)) -Expected 5 -Message 'The explicit retained-but-unreferenced source count changed.'
Assert-Equal -Actual ([int]($usageCounts['referenced'] ?? 0)) -Expected ($focusedCleanupBaselineReferencedCount + $routineManagedAssetCount) -Message 'Referenced managed-source count changed outside routine managed-art growth.'
Assert-Equal -Actual $sourceOnlyIds.Count -Expected 1 -Message 'Exactly one corrupt supplemental source may be quarantined as source_only_unprocessable.'
Assert-Equal -Actual $sourceOnlyIds[0] -Expected $expectedSourceOnlyId -Message 'The quarantined source-only asset changed.'
Assert-Equal -Actual ([string]$manifest.assets.$expectedSourceOnlyId.processing_note) -Expected $expectedSourceOnlyNote -Message 'The tracked-safe quarantine reason changed.'

$legacyMediumIds = @(
  'medium/20f97dfa3cacfdad0e6ad4e8bd6b9f40259e269d01de4e85977a31d1468a0731',
  'medium/2cb1bd9d5e821673e5988fe08124a3a9270c9ef0cd5b494b7fea0a55bb4814e7',
  'medium/502c9af7d38343926679b4000c07f7938a7bb2ffb2de34fd307939daa7c4523a',
  'medium/79135b86692f72d399ab6e14643d150385b4419e4c10a2c66a7e32ccacd64cbe',
  'medium/982e8af5463df6dd09ee9b9aeb11f3c8764461085e2bf676f51d03a5fc9fe1fb',
  'medium/bae249c94478ad9d5603403fcd7b5141ffc06bc35a66bd782d1f4f259ed2a7cb',
  'medium/ec686e18de7c21b0892fabb04179d3a92b94245291f508d7fdc56af18af8fab7'
)
$mediumIds = @($assetIds | Where-Object { $_.StartsWith('medium/', [System.StringComparison]::Ordinal) })
Assert-Equal -Actual $mediumIds.Count -Expected 112 -Message 'Managed Medium inventory must contain the seven R3 assets plus 105 focused-cleanup migrations.'
Assert-Equal -Actual @($mediumIds | Where-Object { $legacyMediumIds -cnotcontains $_ }).Count -Expected 105 -Message 'Focused cleanup must add exactly 105 actual-hash Medium IDs.'
foreach ($legacyMediumId in $legacyMediumIds) {
  if ($mediumIds -cnotcontains $legacyMediumId) {
    throw "Focused cleanup removed a pre-existing managed Medium asset: $legacyMediumId"
  }
}

$expectedSydIds = @(
  'essays/dialogues/bobanonymous/hero',
  'essays/dialogues/broke-rich/hero',
  'essays/dialogues/infinite-incontent/hero',
  'essays/dialogues/pressure-makes-pearls/hero'
)
$actualSydIds = @($assetIds | Where-Object { $_.StartsWith('essays/dialogues/', [System.StringComparison]::Ordinal) })
if (($actualSydIds -join "`n") -cne ($expectedSydIds -join "`n")) {
  throw "Focused cleanup must register exactly the four approved Syd-and-Oliver heroes. Found: $($actualSydIds -join ', ')."
}

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
$routineAliasCount = $aliasNames.Count - $focusedCleanupBaselineAliasCount
if ($routineAliasCount -lt 0) {
  throw "Focused-cleanup retired-path alias inventory shrank below the release baseline. Expected at least '$focusedCleanupBaselineAliasCount'; found '$($aliasNames.Count)'."
}
Assert-Equal -Actual $routineAliasCount -Expected $routineManagedAssetCount -Message 'Routine managed artwork must add exactly one resolver alias per new canonical asset.'
$mediumAliases = @($aliasNames | Where-Object { $_.StartsWith('/images/medium/', [System.StringComparison]::Ordinal) })
$sydAliases = @($aliasNames | Where-Object { $_.StartsWith('/images/syd-and-oliver/', [System.StringComparison]::Ordinal) })
Assert-Equal -Actual $mediumAliases.Count -Expected 119 -Message 'Medium alias count must equal 14 R3 aliases plus 105 retired PNG URLs.'
Assert-Equal -Actual $sydAliases.Count -Expected 4 -Message 'Each retired Syd-and-Oliver hero URL must have one resolver alias.'
$actualSydAliasTargets = @($sydAliases | ForEach-Object { [string]$manifest.aliases.$_ } | Sort-Object)
if (($actualSydAliasTargets -join "`n") -cne ($expectedSydIds -join "`n")) {
  throw 'Syd-and-Oliver aliases do not map one-to-one to the four managed dialogue heroes.'
}
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
  if ($alias -cnotmatch '^/images/(?:editorial|essays|medium|syd-and-oliver)/.+\.(?:png|jpe?g)$') {
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

foreach ($retiredDirectory in @('static/images/editorial','static/images/essays','static/images/syd-and-oliver')) {
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

$staticMediumRoot = Join-Path $staticRoot 'images/medium'
if (-not (Test-Path -LiteralPath $staticMediumRoot -PathType Container)) {
  throw 'Focused cleanup must retain the referenced compact Medium JPEG/JPG fleet under static/images/medium.'
}
$staticMediumFiles = @(Get-ChildItem -LiteralPath $staticMediumRoot -File -Recurse)
Assert-Equal -Actual $staticMediumFiles.Count -Expected 316 -Message 'Focused cleanup must retain exactly 316 referenced Medium JPEG/JPG files.'
$unsupportedStaticMediumFiles = @($staticMediumFiles | Where-Object { $_.Extension.ToLowerInvariant() -notin @('.jpg','.jpeg') })
if ($unsupportedStaticMediumFiles.Count -gt 0) {
  $sample = @($unsupportedStaticMediumFiles | Select-Object -First 8 | ForEach-Object { $_.FullName.Substring($rootPath.Length + 1).Replace('\','/') })
  throw "Medium PNG/GIF or another unsupported legacy file remains under static/: $($sample -join ', ')"
}
if (Test-Path -LiteralPath (Join-Path $staticRoot 'images/syd-and-oliver')) {
  throw 'The retired static/images/syd-and-oliver source directory must be absent after migration.'
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
$rawMediumReferences = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$referenceTextByPath = @{}
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
  $referenceTextByPath[$referenceFile.FullName] = $text
  foreach ($rawMediumMatch in [regex]::Matches(
    $text,
    '(?i)(?<url>/images/medium/[^\s"''<>\(\)\[\]]+\.(?:png|gif|jpe?g))',
    [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
  )) {
    $rawMediumUrl = $rawMediumMatch.Groups['url'].Value
    if ([System.IO.Path]::GetExtension($rawMediumUrl).ToLowerInvariant() -notin @('.jpg','.jpeg')) {
      throw "Content/data retains a raw Medium PNG or GIF reference after migration: $rawMediumUrl"
    }
    [void]$rawMediumReferences.Add($rawMediumUrl)
  }
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

Assert-Equal -Actual $rawMediumReferences.Count -Expected 316 -Message 'Content/data must retain exactly the 316 compact Medium JPEG/JPG references.'
$expectedRawMediumReferences = @(
  $staticMediumFiles |
    ForEach-Object { '/' + $_.FullName.Substring($staticRoot.Length + 1).Replace('\','/') } |
    Sort-Object
)
$actualRawMediumReferences = @($rawMediumReferences | Sort-Object)
if (($actualRawMediumReferences -join "`n") -cne ($expectedRawMediumReferences -join "`n")) {
  $missingStaticFiles = @($actualRawMediumReferences | Where-Object { $expectedRawMediumReferences -cnotcontains $_ })
  $unreferencedStaticFiles = @($expectedRawMediumReferences | Where-Object { $actualRawMediumReferences -cnotcontains $_ })
  throw "Raw Medium references and retained static JPEG/JPG files differ. Missing files: $($missingStaticFiles -join ', '). Unreferenced files: $($unreferencedStaticFiles -join ', ')."
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

$migrationReportPath = Join-Path $rootPath 'reports/legacy-image-focused-cleanup-inventory.json'
if (-not (Test-Path -LiteralPath $migrationReportPath -PathType Leaf)) {
  throw "Missing frozen focused-cleanup inventory evidence: $migrationReportPath"
}
Get-OipCanonicalTextFileSha256 -Path $migrationReportPath -Label 'Focused legacy image cleanup inventory' -RequireCanonical | Out-Null
$migrationReport = Get-Content -LiteralPath $migrationReportPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 30
Assert-ExactProperties -Value $migrationReport -Expected @(
  'schema_version',
  'action_id',
  'baseline_commit',
  'rewritten_content_sha256_basis',
  'baseline',
  'result',
  'medium_migrations',
  'syd_migrations',
  'retained_medium_files',
  'removed_orphans',
  'modified_reference_files'
) -Context 'Focused legacy image cleanup report root'
Assert-Equal -Actual ([string]$migrationReport.schema_version) -Expected '1.1' -Message 'Focused-cleanup report schema changed.'
Assert-Equal -Actual ([string]$migrationReport.action_id) -Expected 'WEB-LEGACY-IMAGE-CLEANUP-001-R2' -Message 'Focused-cleanup action binding changed.'
Assert-Equal -Actual ([string]$migrationReport.rewritten_content_sha256_basis) -Expected (Get-OipPortableTextSha256Basis) -Message 'Focused-cleanup rewritten-content digest basis changed.'
Assert-ExactProperties -Value $migrationReport.baseline -Expected @(
  'inventory_digest_basis',
  'medium_inventory_sha256',
  'syd_inventory_sha256',
  'medium_files',
  'referenced_medium_files',
  'referenced_medium_pngs',
  'referenced_medium_jpeg_jpg',
  'medium_orphans',
  'syd_heroes',
  'filename_hash_mismatches',
  'long_paths_over_260'
) -Context 'Focused legacy image cleanup baseline'
Assert-Equal -Actual ([string]$migrationReport.baseline.inventory_digest_basis) -Expected 'sorted_path_tab_actual_sha256_lf_utf8_no_bom' -Message 'Focused-cleanup inventory digest basis changed.'
Assert-Equal -Actual ([string]$migrationReport.baseline.medium_inventory_sha256) -Expected '851880a2e59635b660a6192385dff6cbb0eb73d3b8b3d5f747c6e730c6302c5a' -Message 'Frozen 471-file Medium inventory digest changed.'
Assert-Equal -Actual ([string]$migrationReport.baseline.syd_inventory_sha256) -Expected 'c53d8f9db266f5cba29cb4fd400a0dd72263e6eb492e706b2d1aedd07c0bd21e' -Message 'Frozen four-file Syd inventory digest changed.'
Assert-ExactProperties -Value $migrationReport.result -Expected @(
  'manifest_assets',
  'manifest_aliases',
  'migrated_source_bytes',
  'removed_orphan_bytes',
  'retained_medium_bytes'
) -Context 'Focused legacy image cleanup result'
if ([string]$migrationReport.baseline_commit -cnotmatch '^[0-9a-f]{40}$') {
  throw 'Focused-cleanup report baseline_commit must be one exact Git commit.'
}
& git -C $rootPath cat-file -e (([string]$migrationReport.baseline_commit) + '^{commit}') 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "Focused-cleanup baseline commit is unavailable: $($migrationReport.baseline_commit)"
}
$excludedLaneChanges = @(
  & git -C $rootPath diff --name-only ([string]$migrationReport.baseline_commit) -- `
    'assets/images/paper-route' `
    'assets/js/paper-route-launcher.js' `
    'assets/js/paper-route-rules.js' `
    'assets/js/paper-route.js' `
    'content/games/idle-times/idle-times-main-capsule.png' `
    'content/games/idle-times/idle-times-packaged-desk-1920x1080.png' `
    'content/games/idle-times/idle-times-packaged-library-1920x1080.png' `
    'static/images/books' `
    'static/images/social' `
    'content/authors/robert-v-ussley/Bobviously_Portrait_v1.png'
)
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to compare excluded image/game lanes with the focused-cleanup baseline.'
}
if ($excludedLaneChanges.Count -gt 0) {
  throw "Focused cleanup changed excluded Paper-Bob, Idle Times binary, book, social-card, or author-portrait assets: $($excludedLaneChanges -join ', ')"
}

function Get-OipBaselineBlobMap {
  param(
    [Parameter(Mandatory)][string]$Commit,
    [Parameter(Mandatory)][string[]]$RelativePaths
  )

  $paths = @($RelativePaths | Sort-Object -Unique)
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'git'
  $startInfo.WorkingDirectory = $rootPath
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $null = $startInfo.ArgumentList.Add('cat-file')
  $null = $startInfo.ArgumentList.Add('--batch')
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $null = $process.Start()
  $memory = [System.IO.MemoryStream]::new()
  try {
    $outputTask = $process.StandardOutput.BaseStream.CopyToAsync($memory)
    $errorTask = $process.StandardError.ReadToEndAsync()
    foreach ($relativePath in $paths) {
      $process.StandardInput.WriteLine("${Commit}:$relativePath")
    }
    $process.StandardInput.Close()
    $null = $outputTask.GetAwaiter().GetResult()
    $stderr = $errorTask.GetAwaiter().GetResult()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
      throw "Unable to batch-read baseline Git blobs: $($stderr.Trim())"
    }

    $output = $memory.ToArray()
    $offset = 0
    $result = @{}
    foreach ($relativePath in $paths) {
      $newline = [Array]::IndexOf($output, [byte]10, $offset)
      if ($newline -lt $offset) {
        throw "Malformed Git batch header for baseline path: $relativePath"
      }
      $header = [Text.Encoding]::ASCII.GetString($output, $offset, $newline - $offset)
      if ($header.EndsWith(' missing', [StringComparison]::Ordinal)) {
        throw "Baseline Git blob is missing: $relativePath"
      }
      $headerParts = $header.Split(' ', [StringSplitOptions]::RemoveEmptyEntries)
      if ($headerParts.Count -ne 3 -or $headerParts[1] -cne 'blob') {
        throw "Unexpected Git batch header for baseline path '$relativePath': $header"
      }
      $blobLength = [int]$headerParts[2]
      $blobStart = $newline + 1
      $delimiterOffset = $blobStart + $blobLength
      if ($delimiterOffset -ge $output.Length -or $output[$delimiterOffset] -ne 10) {
        throw "Malformed Git batch payload for baseline path: $relativePath"
      }
      $blobBytes = [byte[]]::new($blobLength)
      [Array]::Copy($output, $blobStart, $blobBytes, 0, $blobLength)
      $result[$relativePath] = $blobBytes
      $offset = $delimiterOffset + 1
    }
    if ($offset -ne $output.Length) {
      throw 'Git baseline blob batch returned unexpected trailing bytes.'
    }
    return $result
  }
  finally {
    $memory.Dispose()
    $process.Dispose()
  }
}

function Get-OipEvidenceInventoryDigest {
  param([Parameter(Mandatory)][object[]]$Rows)

  $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $lines = [Collections.Generic.List[string]]::new()
  foreach ($row in $Rows) {
    $path = if ($row.Contains('path')) { [string]$row.path } else { [string]$row.legacy_path }
    $sha256 = [string]$row.sha256
    if (-not $paths.Add($path) -or $path.Contains("`t") -or $path.Contains("`r") -or $path.Contains("`n") -or $sha256 -cnotmatch '^[0-9a-f]{64}$') {
      throw "Focused inventory digest contains an invalid or duplicate path/SHA: $path"
    }
    $lines.Add($path + "`t" + $sha256)
  }
  $lines.Sort([StringComparer]::Ordinal)
  return Get-OipSha256ForBytes -Bytes $canonicalUtf8.GetBytes(([string]::Join("`n", $lines)) + "`n")
}

function Assert-OipNoTrackedRuntimeReferences {
  param(
    [Parameter(Mandatory)][string[]]$Values,
    [Parameter(Mandatory)][string]$Label
  )

  $patternPath = [IO.Path]::GetTempFileName()
  try {
    [IO.File]::WriteAllLines($patternPath, @($Values | Sort-Object -Unique), [Text.UTF8Encoding]::new($false))
    $hits = @(& git -C $rootPath grep -I -n -F -f $patternPath -- . ':(exclude)reports' 2>$null)
    $grepExit = $LASTEXITCODE
    if ($grepExit -notin @(0,1)) {
      throw "Tracked runtime-source scan failed for $Label."
    }
    if ($hits.Count -gt 0) {
      throw "Tracked nonhistorical source retains ${Label}: $($hits -join '; ')"
    }
  }
  finally {
    [IO.File]::Delete($patternPath)
  }
}

foreach ($expectation in @(
  @{ Value = $migrationReport.baseline.medium_files; Expected = 471; Message = 'Baseline Medium inventory changed.' },
  @{ Value = $migrationReport.baseline.referenced_medium_files; Expected = 421; Message = 'Baseline referenced Medium inventory changed.' },
  @{ Value = $migrationReport.baseline.referenced_medium_pngs; Expected = 105; Message = 'Focused Medium PNG migration count changed.' },
  @{ Value = $migrationReport.baseline.referenced_medium_jpeg_jpg; Expected = 316; Message = 'Retained Medium JPEG/JPG count changed.' },
  @{ Value = $migrationReport.baseline.medium_orphans; Expected = 50; Message = 'Removed Medium orphan count changed.' },
  @{ Value = $migrationReport.baseline.syd_heroes; Expected = 4; Message = 'Migrated Syd hero count changed.' },
  @{ Value = $migrationReport.baseline.filename_hash_mismatches; Expected = 15; Message = 'Legacy filename/hash mismatch count changed.' },
  @{ Value = $migrationReport.baseline.long_paths_over_260; Expected = 61; Message = 'Long-path baseline coverage changed.' },
  @{ Value = $migrationReport.result.manifest_assets; Expected = 459; Message = 'Post-cleanup manifest asset count changed.' },
  @{ Value = $migrationReport.result.manifest_aliases; Expected = 500; Message = 'Post-cleanup manifest alias count changed.' },
  @{ Value = $migrationReport.result.migrated_source_bytes; Expected = 69683954; Message = 'Focused migrated-source byte total changed.' },
  @{ Value = $migrationReport.result.removed_orphan_bytes; Expected = 5207258; Message = 'Focused orphan-removal byte total changed.' }
)) {
  Assert-Equal -Actual ([int]$expectation.Value) -Expected ([int]$expectation.Expected) -Message ([string]$expectation.Message)
}
if ([int]$migrationReport.baseline.long_paths_over_260 -lt 1) {
  throw 'Focused-cleanup evidence must prove that NUL-delimited enumeration handled at least one path longer than 260 characters.'
}

$reportedMediumMigrations = @($migrationReport.medium_migrations)
$reportedSydMigrations = @($migrationReport.syd_migrations)
$reportedRetainedMedium = @($migrationReport.retained_medium_files)
$reportedOrphans = @($migrationReport.removed_orphans)
Assert-Equal -Actual $reportedMediumMigrations.Count -Expected 105 -Message 'Focused-cleanup report must enumerate all 105 Medium PNG migrations.'
Assert-Equal -Actual $reportedSydMigrations.Count -Expected 4 -Message 'Focused-cleanup report must enumerate all four Syd migrations.'
Assert-Equal -Actual $reportedRetainedMedium.Count -Expected 316 -Message 'Focused-cleanup report must enumerate all 316 retained Medium JPEG/JPG files.'
Assert-Equal -Actual $reportedOrphans.Count -Expected 50 -Message 'Focused-cleanup report must enumerate all 50 removed Medium orphans.'
Assert-Equal -Actual @($migrationReport.modified_reference_files).Count -Expected 32 -Message 'Focused cleanup must rewrite exactly the frozen 32 content files.'
$baselineBlobPaths = @(
  $migrationReport.modified_reference_files | ForEach-Object { [string]$_.path }
  $reportedMediumMigrations | ForEach-Object { [string]$_.legacy_path }
  $reportedSydMigrations | ForEach-Object { [string]$_.legacy_path }
  $reportedRetainedMedium | ForEach-Object { [string]$_.path }
  $reportedOrphans | ForEach-Object { [string]$_.legacy_path }
)
$baselineBlobMap = Get-OipBaselineBlobMap -Commit ([string]$migrationReport.baseline_commit) -RelativePaths $baselineBlobPaths
$currentCommit = (& git -C $rootPath rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $currentCommit -cnotmatch '^[0-9a-f]{40}$') {
  throw 'Unable to resolve the current commit for rewritten-content Git-blob parity.'
}
$currentContentBlobMap = Get-OipBaselineBlobMap -Commit $currentCommit -RelativePaths @(
  $migrationReport.modified_reference_files | ForEach-Object { [string]$_.path }
)
Assert-Equal -Actual $baselineBlobMap.Count -Expected 507 -Message 'Baseline Git-blob batch must bind the 32 rewritten content files, 105 Medium PNGs, four Syd heroes, 316 retained Medium JPEG/JPG files, and 50 removed orphans.'
Assert-Equal -Actual $currentContentBlobMap.Count -Expected 32 -Message 'Current Git-blob batch must bind all 32 rewritten content files.'
Assert-Equal -Actual (Get-OipEvidenceInventoryDigest -Rows @(@($reportedMediumMigrations) + @($reportedRetainedMedium) + @($reportedOrphans))) -Expected ([string]$migrationReport.baseline.medium_inventory_sha256) -Message 'Reported Medium rows do not reproduce the frozen canonical path/actual-SHA digest.'
Assert-Equal -Actual (Get-OipEvidenceInventoryDigest -Rows @($reportedSydMigrations)) -Expected ([string]$migrationReport.baseline.syd_inventory_sha256) -Message 'Reported Syd rows do not reproduce the frozen canonical path/actual-SHA digest.'
$reportedModifiedPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($item in @($migrationReport.modified_reference_files)) {
  $relativePath = [string]$item.path
  if (-not $reportedModifiedPaths.Add($relativePath) -or $relativePath -cnotmatch '^content/essays/.+\.md$') {
    throw "Focused-cleanup report contains a duplicate or out-of-scope rewritten content path: $relativePath"
  }
  $fullPath = Join-Path $rootPath $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf) -or
    (Get-OipPortableTextFileSha256 -Path $fullPath -Label "Rewritten content '$relativePath'") -cne [string]$item.after_sha256) {
    throw "Focused-cleanup rewritten-content hash is stale: $relativePath"
  }
  if ([string]$item.before_sha256 -ceq [string]$item.after_sha256 -or [int]$item.replacement_count -lt 1) {
    throw "Focused-cleanup rewritten-content evidence lacks a real bounded replacement: $relativePath"
  }
  $baselineBlobBytes = [byte[]]$baselineBlobMap[$relativePath]
  Assert-Equal -Actual ([string]$item.before_sha256) -Expected (Get-OipPortableTextSha256ForBytes -Bytes $baselineBlobBytes -Label "Baseline Git blob '$relativePath'") -Message "Focused-cleanup before-content portable hash differs from the exact baseline Git blob: $relativePath"
  Assert-Equal -Actual ([string]$item.after_sha256) -Expected (Get-OipPortableTextSha256ForBytes -Bytes ([byte[]]$currentContentBlobMap[$relativePath]) -Label "Current Git blob '$relativePath'") -Message "Focused-cleanup after-content portable hash differs between the fresh Git blob and checkout: $relativePath"
}

$reportedMigrationIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$reportedLegacyPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($item in $reportedMediumMigrations) {
  $actualHash = ([string]$item.sha256).ToLowerInvariant()
  $expectedId = 'medium/' + $actualHash
  Assert-Equal -Actual ([string]$item.asset_id) -Expected $expectedId -Message "Medium migration ID is not based on actual file bytes: $($item.legacy_path)"
  Assert-Equal -Actual ([string]$item.source) -Expected ("images/originals/medium/$actualHash.png") -Message "Medium migration source is not named by actual file bytes: $($item.legacy_path)"
  if ([string]$item.legacy_path -cnotmatch '^static/images/medium/.+\.png$' -or [string]$item.public_alias -cne ('/' + ([string]$item.legacy_path).Substring('static/'.Length))) {
    throw "Invalid retired Medium migration path or alias: $($item.legacy_path)"
  }
  if (-not $reportedMigrationIds.Add($expectedId) -or -not $reportedLegacyPaths.Add([string]$item.legacy_path)) {
    throw "Duplicate focused Medium migration evidence: $($item.legacy_path)"
  }
  Assert-Equal -Actual (Get-OipSha256ForBytes -Bytes ([byte[]]$baselineBlobMap[[string]$item.legacy_path])) -Expected $actualHash -Message "Migrated Medium source hash does not match the exact baseline Git blob: $($item.legacy_path)"
  $legacyFilenameStem = [IO.Path]::GetFileNameWithoutExtension([string]$item.legacy_path)
  Assert-Equal -Actual ([bool]$item.filename_hash_match) -Expected ($legacyFilenameStem -ceq $actualHash) -Message "Medium filename_hash_match flag disagrees with the baseline-blob SHA: $($item.legacy_path)"
  if ($mediumIds -cnotcontains $expectedId -or [string]$manifest.aliases.([string]$item.public_alias) -cne $expectedId) {
    throw "Focused Medium migration report does not match the manifest: $($item.legacy_path)"
  }
  if (Test-Path -LiteralPath (Join-Path $rootPath ([string]$item.legacy_path))) {
    throw "Retired Medium PNG remains in the working tree: $($item.legacy_path)"
  }
}
Assert-Equal -Actual @($reportedMediumMigrations | Where-Object { -not [bool]$_.filename_hash_match }).Count -Expected 15 -Message 'Focused-cleanup report must identify exactly 15 filename/hash mismatches.'

foreach ($item in $reportedSydMigrations) {
  if (-not $reportedMigrationIds.Add([string]$item.asset_id) -or -not $reportedLegacyPaths.Add([string]$item.legacy_path)) {
    throw "Duplicate focused Syd migration evidence: $($item.legacy_path)"
  }
  if ($expectedSydIds -cnotcontains [string]$item.asset_id -or
    [string]$manifest.aliases.([string]$item.public_alias) -cne [string]$item.asset_id -or
    [string]$manifest.assets.([string]$item.asset_id).sha256 -cne [string]$item.sha256) {
    throw "Focused Syd migration report does not match the manifest: $($item.legacy_path)"
  }
  Assert-Equal -Actual (Get-OipSha256ForBytes -Bytes ([byte[]]$baselineBlobMap[[string]$item.legacy_path])) -Expected ([string]$item.sha256) -Message "Migrated Syd source hash does not match the exact baseline Git blob: $($item.legacy_path)"
  $legacyFilenameStem = [IO.Path]::GetFileNameWithoutExtension([string]$item.legacy_path)
  Assert-Equal -Actual ([bool]$item.filename_hash_match) -Expected ($legacyFilenameStem -ceq [string]$item.sha256) -Message "Syd filename_hash_match flag disagrees with the baseline-blob SHA: $($item.legacy_path)"
  if (Test-Path -LiteralPath (Join-Path $rootPath ([string]$item.legacy_path))) {
    throw "Retired Syd hero remains in the working tree: $($item.legacy_path)"
  }
}
Assert-Equal -Actual $reportedMigrationIds.Count -Expected 109 -Message 'Focused-cleanup report must bind exactly 109 unique managed asset IDs.'

foreach ($item in $reportedRetainedMedium) {
  $relativePath = [string]$item.path
  if ([System.IO.Path]::GetExtension($relativePath).ToLowerInvariant() -notin @('.jpg','.jpeg')) {
    throw "Focused-cleanup retained inventory contains a non-JPEG file: $relativePath"
  }
  $fullPath = Join-Path $rootPath $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf) -or (Get-OipSha256 -Path $fullPath) -cne [string]$item.sha256) {
    throw "Focused-cleanup retained Medium evidence is stale: $relativePath"
  }
  Assert-Equal -Actual (Get-OipSha256ForBytes -Bytes ([byte[]]$baselineBlobMap[$relativePath])) -Expected ([string]$item.sha256) -Message "Retained Medium source hash does not match the exact baseline Git blob: $relativePath"
}
$reportedOrphanAliases = [System.Collections.Generic.List[string]]::new()
foreach ($item in $reportedOrphans) {
  $relativePath = [string]$item.legacy_path
  if (-not $reportedLegacyPaths.Add($relativePath)) {
    throw "Focused-cleanup orphan evidence duplicates another retired path: $relativePath"
  }
  if (Test-Path -LiteralPath (Join-Path $rootPath $relativePath)) {
    throw "Confirmed Medium orphan remains in the working tree: $relativePath"
  }
  $publicAlias = '/' + $relativePath.Substring('static/'.Length)
  Assert-Equal -Actual (Get-OipSha256ForBytes -Bytes ([byte[]]$baselineBlobMap[$relativePath])) -Expected ([string]$item.sha256) -Message "Removed orphan hash does not match the baseline Git blob: $relativePath"
  $reportedOrphanAliases.Add($publicAlias)
}
Assert-OipNoTrackedRuntimeReferences -Values $reportedOrphanAliases -Label 'removed orphan aliases'
Assert-Equal -Actual $reportedLegacyPaths.Count -Expected 159 -Message 'Focused-cleanup report must bind 105 Medium migrations, four Syd migrations, and 50 orphan removals.'

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
  'focused_deep_review_count',
  'selection_rule',
  'deep_review_rule',
  'reason_counts',
  'deep_review_category_counts',
  'candidates',
  'deep_review_selection'
) -Context 'Image review report root'
Assert-Equal -Actual ([string]$reviewReport.schema_version) -Expected '1.0' -Message 'Image review report schema changed.'
$reviewReportIsCurrent = [int]$reviewReport.canonical_asset_count -eq $assetIds.Count
$reviewReportIsFocusedBaseline = [int]$reviewReport.canonical_asset_count -eq $focusedCleanupBaselineAssetCount -and $routineManagedAssetCount -gt 0
if ($reviewReportIsCurrent) {
  Assert-Equal -Actual ([string]$reviewReport.manifest_sha256) -Expected $manifestCanonicalSha256 -Message 'Image review report is stale relative to the canonical manifest.'
}
elseif (-not $reviewReportIsFocusedBaseline) {
  throw "Image review report canonical count is stale. Expected current '$($assetIds.Count)' or focused-cleanup baseline '$focusedCleanupBaselineAssetCount'; found '$([int]$reviewReport.canonical_asset_count)'."
}
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
$focusedCleanupReviewIds = @(
  $assetIds | Where-Object {
    ($_.StartsWith('medium/', [System.StringComparison]::Ordinal) -and $legacyMediumIds -cnotcontains $_) -or
    $_.StartsWith('essays/dialogues/', [System.StringComparison]::Ordinal)
  }
)
Assert-Equal -Actual $focusedCleanupReviewIds.Count -Expected 109 -Message 'Focused-cleanup visual-review cohort must contain exactly 105 Medium PNGs and four Syd heroes.'
foreach ($focusedCleanupReviewId in $focusedCleanupReviewIds) {
  if (-not $candidateIds.Contains($focusedCleanupReviewId)) {
    throw "Focused-cleanup migration is missing from the deterministic review report: $focusedCleanupReviewId"
  }
  $focusedCandidate = @($reviewCandidates | Where-Object { [string]$_.id -ceq $focusedCleanupReviewId })[0]
  if (@($focusedCandidate.reasons) -cnotcontains 'focused_cleanup_migration') {
    throw "Focused-cleanup review candidate is missing its migration reason: $focusedCleanupReviewId"
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
$focusedDeepReviewIds = @(
  $deepReviewSelection |
    Where-Object { $focusedCleanupReviewIds -ccontains [string]$_.id } |
    ForEach-Object { [string]$_.id } |
    Sort-Object -Unique
)
Assert-Equal -Actual ([int]$reviewReport.focused_deep_review_count) -Expected $focusedDeepReviewIds.Count -Message 'Image review report focused_deep_review_count is stale.'
if ($focusedDeepReviewIds.Count -lt 24) {
  throw "Focused-cleanup deep review must select at least 24 migrated assets; found $($focusedDeepReviewIds.Count)."
}
foreach ($requiredSydId in $expectedSydIds) {
  if ($focusedDeepReviewIds -cnotcontains $requiredSydId) {
    throw "Focused-cleanup deep review must include Syd-and-Oliver hero: $requiredSydId"
  }
}
foreach ($requiredCategory in @('fine_text','crosshatching','focused_syd_hero','faces_or_photos','dark_tones','saturated_color','extreme_aspect_ratio','largest_source_bytes','largest_native_dimensions')) {
  if (-not $reviewReport.deep_review_category_counts.ContainsKey($requiredCategory) -or [int]$reviewReport.deep_review_category_counts[$requiredCategory] -lt 1) {
    throw "Deep-review selection does not cover required high-risk category: $requiredCategory"
  }
}
foreach ($requiredFocusedCategory in @('focused_syd_hero','focused_chart','focused_map','focused_fine_text','focused_portrait_or_tall','focused_extreme_aspect_ratio','focused_dark_tones','focused_saturated_color','focused_largest_source_bytes','focused_largest_native_dimensions')) {
  if (-not $reviewReport.deep_review_category_counts.ContainsKey($requiredFocusedCategory) -or [int]$reviewReport.deep_review_category_counts[$requiredFocusedCategory] -lt 1) {
    throw "Focused deep-review selection does not cover required migrated-asset category: $requiredFocusedCategory"
  }
}

$focusedReviewEvidencePath = Join-Path $rootPath 'reports/focused-image-visual-review.json'
Get-OipCanonicalTextFileSha256 -Path $focusedReviewEvidencePath -Label 'Focused image visual-review evidence' -RequireCanonical | Out-Null
$focusedReviewEvidence = Get-Content -LiteralPath $focusedReviewEvidencePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 30
Assert-ExactProperties -Value $focusedReviewEvidence -Expected @(
  'schema_version',
  'action_id',
  'review_state',
  'review_date',
  'review_actor',
  'review_surface',
  'manifest_sha256_before_promotion',
  'manifest_sha256_basis',
  'candidate_report_sha256_before_promotion',
  'candidate_report_sha256_basis',
  'expected_asset_count',
  'expected_asset_ids',
  'reviewed_asset_ids',
  'required_review_methods',
  'completed_review_methods',
  'expected_deep_review_count',
  'expected_deep_review_ids',
  'deep_reviewed_asset_ids',
  'decode_sanity',
  'quality_overrides',
  'notes'
) -Context 'Focused image visual-review evidence'
Assert-Equal -Actual ([string]$focusedReviewEvidence.schema_version) -Expected '1.0' -Message 'Focused visual-review schema changed.'
Assert-Equal -Actual ([string]$focusedReviewEvidence.action_id) -Expected 'WEB-LEGACY-IMAGE-CLEANUP-001-R1' -Message 'Focused visual-review action binding changed.'
Assert-Equal -Actual ([int]$focusedReviewEvidence.expected_asset_count) -Expected 109 -Message 'Focused visual-review asset count changed.'
Assert-Equal -Actual ([int]$focusedReviewEvidence.expected_deep_review_count) -Expected $focusedDeepReviewIds.Count -Message 'Focused deep-review count is stale.'
if ((@($focusedReviewEvidence.expected_asset_ids | Sort-Object -Unique) -join "`n") -cne (@($focusedCleanupReviewIds | Sort-Object -Unique) -join "`n")) {
  throw 'Focused visual-review evidence does not bind the exact 109 migrated assets.'
}
if ((@($focusedReviewEvidence.expected_deep_review_ids | Sort-Object -Unique) -join "`n") -cne (@($focusedDeepReviewIds | Sort-Object -Unique) -join "`n")) {
  throw 'Focused visual-review evidence does not bind the deterministic migrated-asset deep-review selection.'
}
$focusedReviewState = [string]$focusedReviewEvidence.review_state
if ($focusedReviewState -cnotin @('pending_review','pass')) {
  throw "Focused visual-review evidence has unsupported review_state '$focusedReviewState'."
}
if ($focusedReviewState -ceq 'pending_review') {
  Assert-Equal -Actual ([string]$focusedReviewEvidence.manifest_sha256_before_promotion) -Expected $manifestCanonicalSha256 -Message 'Pending focused visual-review evidence is stale relative to the manifest.'
  Assert-Equal -Actual ([string]$focusedReviewEvidence.candidate_report_sha256_before_promotion) -Expected $reviewReportCanonicalSha256 -Message 'Pending focused visual-review evidence is stale relative to the candidate report.'
  if (@($focusedReviewEvidence.reviewed_asset_ids).Count -ne 0 -or @($focusedReviewEvidence.deep_reviewed_asset_ids).Count -ne 0) {
    throw 'Pending focused visual-review evidence must not claim completed asset review.'
  }
}
else {
  if ((@($focusedReviewEvidence.reviewed_asset_ids | Sort-Object -Unique) -join "`n") -cne (@($focusedCleanupReviewIds | Sort-Object -Unique) -join "`n") -or
    (@($focusedReviewEvidence.deep_reviewed_asset_ids | Sort-Object -Unique) -join "`n") -cne (@($focusedDeepReviewIds | Sort-Object -Unique) -join "`n")) {
    throw 'PASS focused visual-review evidence must cover all 109 migrations and the complete deterministic deep-review selection.'
  }
  if ([int]$focusedReviewEvidence.decode_sanity.asset_count -ne 109 -or
    [int]$focusedReviewEvidence.decode_sanity.decode_failure_count -ne 0 -or
    [string]$focusedReviewEvidence.decode_sanity.outcome -cne 'pass') {
    throw 'PASS focused visual-review evidence must record zero decode failures across all 109 migrations.'
  }
}

$visualReviewPath = Join-Path $rootPath 'reports/image-visual-review.json'
Get-OipCanonicalTextFileSha256 -Path $visualReviewPath -Label 'Image visual review evidence' -RequireCanonical | Out-Null
$visualReview = Get-Content -LiteralPath $visualReviewPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 20
Assert-Equal -Actual ([string]$visualReview.manifest_sha256_after_review_basis) -Expected 'canonical_utf8_no_bom_lf_single_terminal_lf' -Message 'Current manifest hash basis changed.'
Assert-Equal -Actual ([string]$visualReview.candidate_report_sha256_basis) -Expected 'canonical_utf8_no_bom_lf_single_terminal_lf' -Message 'Candidate report hash basis changed.'
$pendingStructuralReview = $pendingReviewIds.Count -gt 0 -and $AllowPendingReview
if (-not $pendingStructuralReview) {
  Assert-Equal -Actual ([string]$visualReview.manifest_sha256_before_review_basis) -Expected 'canonical_utf8_no_bom_lf_single_terminal_lf' -Message 'Focused pre-review manifest hash basis changed.'
  if ($reviewReportIsCurrent) {
    Assert-Equal -Actual ([string]$visualReview.manifest_sha256_after_review) -Expected $manifestCanonicalSha256 -Message 'Image visual review evidence is stale relative to the canonical manifest.'
    Assert-Equal -Actual ([string]$visualReview.candidate_report_sha256) -Expected $reviewReportCanonicalSha256 -Message 'Image visual review evidence is stale relative to the canonical candidate report.'
  }
  else {
    Assert-Equal -Actual ([int]$visualReview.canonical_asset_count) -Expected $focusedCleanupBaselineAssetCount -Message 'Focused-cleanup visual evidence must bind the release baseline when routine artwork has been added.'
    Assert-Equal -Actual ([int]$visualReview.derivative_capable_asset_count) -Expected $focusedCleanupBaselineDerivativeCapableCount -Message 'Focused-cleanup visual evidence derivative-capable count changed.'
    Assert-Equal -Actual ([int]$visualReview.approved_derivative_capable_asset_count) -Expected $focusedCleanupBaselineDerivativeCapableCount -Message 'Focused-cleanup visual evidence approved derivative-capable count changed.'
    Assert-Equal -Actual ([string]$visualReview.manifest_sha256_after_review) -Expected ([string]$reviewReport.manifest_sha256) -Message 'Focused-cleanup visual evidence is stale relative to the tracked focused-cleanup candidate report.'
    Assert-Equal -Actual ([string]$visualReview.candidate_report_sha256) -Expected $reviewReportCanonicalSha256 -Message 'Focused-cleanup visual evidence is stale relative to the tracked candidate report.'
  }
  Assert-Equal -Actual ([int]$visualReview.quantitative_decode_sanity.asset_count) -Expected $focusedCleanupBaselineDerivativeCapableCount -Message 'Aggregate decode evidence must preserve the prior 349 approved assets and add all 109 focused migrations.'
  Assert-Equal -Actual ([int]$visualReview.quantitative_decode_sanity.decode_failure_count) -Expected 0 -Message 'Aggregate decode evidence records a failure.'
  Assert-Equal -Actual ([string]$visualReview.quantitative_decode_sanity.outcome) -Expected 'pass' -Message 'Aggregate decode evidence has not passed.'
  Assert-Equal -Actual ([int]$visualReview.deep_review.asset_count) -Expected $deepReviewIds.Count -Message 'Aggregate deep-review count must cover the complete current selection, including carryovers.'
  Assert-Equal -Actual ([string]$visualReview.deep_review.outcome) -Expected 'pass' -Message 'Aggregate deep review has not passed.'
  Assert-ExactProperties -Value $visualReview.deep_review.category_counts -Expected @($reviewReport.deep_review_category_counts.Keys) -Context 'Aggregate deep-review category counts'
  foreach ($category in $reviewReport.deep_review_category_counts.Keys) {
    Assert-Equal -Actual ([int]$visualReview.deep_review.category_counts[$category]) -Expected ([int]$reviewReport.deep_review_category_counts[$category]) -Message "Aggregate deep-review category count is stale: $category"
  }
  Assert-Equal -Actual ([string]$visualReview.focused_cleanup_review.action_id) -Expected 'WEB-LEGACY-IMAGE-CLEANUP-001-R1' -Message 'Aggregate focused visual-review action binding changed.'
  Assert-Equal -Actual ([string]$visualReview.focused_cleanup_review.outcome) -Expected 'pass' -Message 'Aggregate focused visual review has not passed.'
  Assert-Equal -Actual ([int]$visualReview.focused_cleanup_review.reviewed_asset_count) -Expected 109 -Message 'Aggregate focused visual review must cover all 109 migrations.'
  Assert-Equal -Actual ([int]$visualReview.focused_cleanup_review.deep_review_asset_count) -Expected $focusedDeepReviewIds.Count -Message 'Aggregate focused deep-review count is stale.'
  Assert-Equal -Actual ([int]$visualReview.focused_cleanup_review.decode_failure_count) -Expected 0 -Message 'Aggregate focused visual review records a decode failure.'
  Assert-Equal -Actual ([int]$visualReview.focused_cleanup_review.quality_override_count) -Expected (@($focusedReviewEvidence.quality_overrides).Count) -Message 'Aggregate focused quality-override count is stale.'
  $focusedReviewedIdsSha256 = Get-OipSha256ForBytes -Bytes $canonicalUtf8.GetBytes(((@($focusedCleanupReviewIds | Sort-Object -Unique) -join "`n") + "`n"))
  $focusedDeepIdsSha256 = Get-OipSha256ForBytes -Bytes $canonicalUtf8.GetBytes(((@($focusedDeepReviewIds | Sort-Object -Unique) -join "`n") + "`n"))
  Assert-Equal -Actual ([string]$visualReview.focused_cleanup_review.reviewed_asset_ids_sha256) -Expected $focusedReviewedIdsSha256 -Message 'Aggregate focused reviewed-ID digest is stale.'
  Assert-Equal -Actual ([string]$visualReview.focused_cleanup_review.deep_review_asset_ids_sha256) -Expected $focusedDeepIdsSha256 -Message 'Aggregate focused deep-review digest is stale.'
}

$buildEvidencePath = Join-Path $rootPath 'reports/responsive-image-build-evidence.json'
Get-OipCanonicalTextFileSha256 -Path $buildEvidencePath -Label 'Responsive image build evidence' -RequireCanonical | Out-Null
$buildEvidence = Get-Content -LiteralPath $buildEvidencePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 20
Assert-Equal -Actual ([string]$buildEvidence.source_manifest_sha256_basis) -Expected 'canonical_utf8_no_bom_lf_single_terminal_lf' -Message 'Responsive image build evidence hash basis changed.'
if (-not $pendingStructuralReview) {
  if ($reviewReportIsCurrent) {
    Assert-Equal -Actual ([string]$buildEvidence.source_manifest_sha256) -Expected $manifestCanonicalSha256 -Message 'Responsive image build evidence is stale relative to the canonical manifest.'
  }
  else {
    Assert-Equal -Actual ([string]$buildEvidence.source_manifest_sha256) -Expected ([string]$reviewReport.manifest_sha256) -Message 'Responsive image build evidence must bind the focused-cleanup baseline when routine artwork has been added.'
  }
}

if (-not $AllowPendingReview -and $pendingReviewIds.Count -gt 0) {
  $sample = @($pendingReviewIds | Select-Object -First 12)
  $suffix = if ($pendingReviewIds.Count -gt $sample.Count) { ', ...' } else { '' }
  throw "$($pendingReviewIds.Count) managed image assets have not passed visual review. Pending sample: $($sample -join ', ')$suffix. Use -AllowPendingReview only for local structural validation; CI and publication gates must omit it."
}

Write-Host "Responsive-image source contract passed: $($assetIds.Count) canonical assets, $($aliasNames.Count) retired-path aliases."
$global:LASTEXITCODE = 0
exit 0
