function New-OipImageAssetManifest {
  return [ordered]@{
    schema_version = '1.0'
    defaults = [ordered]@{
      widths = @(320, 640, 960, 1280, 1600)
      webp_quality = 82
      avif_quality = 60
      detail_webp_quality = 90
      detail_avif_quality = 70
      social_jpeg_quality = 85
      max_render_width = 1600
      social_max_width = 1200
    }
    assets = [ordered]@{}
    aliases = [ordered]@{}
  }
}

function Get-OipImageAssetManifestPath {
  param([Parameter(Mandatory = $true)][string]$Root)

  return Join-Path $Root 'data\image-assets.json'
}

function ConvertTo-OipCanonicalText {
  param([AllowEmptyString()][string]$Text)

  $normalized = $Text.Replace("`r`n", "`n").Replace("`r", "`n")
  $normalized = $normalized.TrimEnd([char[]]@([char]10))
  return $normalized + "`n"
}

function Read-OipStrictUtf8Text {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Label = 'Text file'
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label is not a file: $Path"
  }

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if (
    $bytes.Length -ge 3 -and
    $bytes[0] -eq 0xef -and $bytes[1] -eq 0xbb -and $bytes[2] -eq 0xbf
  ) {
    throw "$Label must use UTF-8 without a byte-order mark: $Path"
  }

  $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
  try {
    return $strictUtf8.GetString($bytes)
  }
  catch {
    throw "$Label is not valid UTF-8: $Path"
  }
}

function Get-OipSha256ForBytes {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digest = $sha256.ComputeHash($Bytes)
  }
  finally {
    $sha256.Dispose()
  }
  return [System.BitConverter]::ToString($digest).Replace('-', '').ToLowerInvariant()
}

function Get-OipPortableTextSha256Basis {
  return 'strict_utf8_bom_preserved_crlf_and_cr_to_lf_terminal_newlines_preserved_sha256'
}

function Get-OipPortableTextSha256ForBytes {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Bytes,
    [string]$Label = 'Portable text'
  )

  # Decode the complete byte stream. A leading UTF-8 BOM therefore becomes
  # U+FEFF and is emitted again by the no-preamble encoder below. This makes
  # BOM state part of the digest while avoiding an implicit encoder preamble.
  $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
  try {
    $text = $strictUtf8.GetString($Bytes)
  }
  catch {
    throw "$Label is not valid UTF-8."
  }

  # Preserve every other code point and the exact terminal-newline count.
  # Only platform-dependent newline spellings are normalized.
  $portableText = $text.Replace("`r`n", "`n").Replace("`r", "`n")
  $utf8NoPreamble = [System.Text.UTF8Encoding]::new($false)
  $portableBytes = $utf8NoPreamble.GetBytes($portableText)
  return Get-OipSha256ForBytes -Bytes $portableBytes
}

function Get-OipPortableTextFileSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Label = 'Portable text file'
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label is not a file: $Path"
  }
  return Get-OipPortableTextSha256ForBytes -Bytes ([System.IO.File]::ReadAllBytes($Path)) -Label $Label
}

function Get-OipCanonicalTextFileSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Label = 'Text file',
    [switch]$RequireCanonical
  )

  $text = Read-OipStrictUtf8Text -Path $Path -Label $Label
  $canonicalText = ConvertTo-OipCanonicalText -Text $text
  if ($RequireCanonical -and $text -cne $canonicalText) {
    throw "$Label must use LF line endings and exactly one final LF: $Path"
  }

  $encoding = [System.Text.UTF8Encoding]::new($false)
  return Get-OipSha256ForBytes -Bytes ($encoding.GetBytes($canonicalText))
}

function Write-OipCanonicalJsonFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][object]$Value,
    [ValidateRange(2, 100)][int]$Depth = 12
  )

  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -Path $directory -ItemType Directory -Force | Out-Null
  }

  $json = $Value | ConvertTo-Json -Depth $Depth
  $canonicalText = ConvertTo-OipCanonicalText -Text $json
  $tempPath = Join-Path $directory ('.canonical-json.' + [guid]::NewGuid().ToString('N') + '.tmp')
  $encoding = [System.Text.UTF8Encoding]::new($false)
  try {
    [System.IO.File]::WriteAllText($tempPath, $canonicalText, $encoding)
    [System.IO.File]::Move($tempPath, $Path, $true)
  }
  finally {
    if (Test-Path -LiteralPath $tempPath -PathType Leaf) {
      Remove-Item -LiteralPath $tempPath -Force
    }
  }
}

function Test-OipImageAssetId {
  param([string]$Id)

  if ([string]::IsNullOrWhiteSpace($Id)) {
    return $false
  }

  if ($Id -notmatch '^[a-z0-9][a-z0-9/-]*[a-z0-9]$') {
    return $false
  }

  return $Id -notmatch '(^|/)\.\.?(/|$)|//'
}

function Get-OipManagedImageFormatFromBytes {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)

  if (
    $Bytes.Length -ge 8 -and
    $Bytes[0] -eq 0x89 -and $Bytes[1] -eq 0x50 -and $Bytes[2] -eq 0x4e -and $Bytes[3] -eq 0x47 -and
    $Bytes[4] -eq 0x0d -and $Bytes[5] -eq 0x0a -and $Bytes[6] -eq 0x1a -and $Bytes[7] -eq 0x0a
  ) {
    return 'png'
  }

  if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xff -and $Bytes[1] -eq 0xd8 -and $Bytes[2] -eq 0xff) {
    return 'jpeg'
  }

  return $null
}

function Get-OipManagedImageFormatFromExtension {
  param([Parameter(Mandatory = $true)][string]$Extension)

  switch ($Extension.ToLowerInvariant()) {
    '.png' { return 'png' }
    '.jpg' { return 'jpeg' }
    '.jpeg' { return 'jpeg' }
    default { return $null }
  }
}

function Get-OipManagedUInt16BigEndian {
  param(
    [Parameter(Mandatory = $true)][byte[]]$Bytes,
    [Parameter(Mandatory = $true)][int]$Offset
  )

  if ($Offset -lt 0 -or $Offset + 2 -gt $Bytes.Length) {
    throw 'Image dimension data ended before a 16-bit value could be read.'
  }
  return ([int]$Bytes[$Offset] -shl 8) -bor [int]$Bytes[$Offset + 1]
}

function Get-OipManagedUInt32BigEndian {
  param(
    [Parameter(Mandatory = $true)][byte[]]$Bytes,
    [Parameter(Mandatory = $true)][int]$Offset
  )

  if ($Offset -lt 0 -or $Offset + 4 -gt $Bytes.Length) {
    throw 'Image dimension data ended before a 32-bit value could be read.'
  }
  return ([uint32]$Bytes[$Offset] -shl 24) -bor
    ([uint32]$Bytes[$Offset + 1] -shl 16) -bor
    ([uint32]$Bytes[$Offset + 2] -shl 8) -bor
    [uint32]$Bytes[$Offset + 3]
}

function Get-OipManagedImageDimensionsFromBytes {
  param(
    [Parameter(Mandatory = $true)][byte[]]$Bytes,
    [Parameter(Mandatory = $true)][string]$Extension,
    [string]$Label = 'Managed image'
  )

  $format = Get-OipManagedImageFormatFromExtension -Extension $Extension
  if ($null -eq $format) {
    throw "$Label uses unsupported extension '$Extension'. Managed originals must be PNG, JPG, or JPEG."
  }

  if ($format -eq 'png') {
    if ((Get-OipManagedImageFormatFromBytes -Bytes $Bytes) -ne 'png') {
      throw "$Label does not have a PNG file signature."
    }
    if ($Bytes.Length -lt 33) {
      throw "$Label has a truncated PNG IHDR chunk."
    }
    $ihdrLength = Get-OipManagedUInt32BigEndian -Bytes $Bytes -Offset 8
    $ihdrType = [System.Text.Encoding]::ASCII.GetString($Bytes, 12, 4)
    if ($ihdrLength -ne 13 -or $ihdrType -cne 'IHDR') {
      throw "$Label does not begin with a valid PNG IHDR chunk."
    }
    $width = [uint32](Get-OipManagedUInt32BigEndian -Bytes $Bytes -Offset 16)
    $height = [uint32](Get-OipManagedUInt32BigEndian -Bytes $Bytes -Offset 20)
    if ($width -eq 0 -or $height -eq 0 -or $width -gt [int]::MaxValue -or $height -gt [int]::MaxValue) {
      throw "$Label has invalid native dimensions."
    }
    return [pscustomobject]@{ Width = [int]$width; Height = [int]$height }
  }

  if ((Get-OipManagedImageFormatFromBytes -Bytes $Bytes) -ne 'jpeg') {
    throw "$Label does not have a JPEG file signature."
  }
  $offset = 2
  $startOfFrameMarkers = @(0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf)
  while ($offset + 3 -lt $Bytes.Length) {
    if ($Bytes[$offset] -ne 0xff) {
      $offset++
      continue
    }
    while ($offset -lt $Bytes.Length -and $Bytes[$offset] -eq 0xff) {
      $offset++
    }
    if ($offset -ge $Bytes.Length) {
      break
    }

    $marker = [int]$Bytes[$offset]
    $offset++
    if ($marker -eq 0xd9 -or $marker -eq 0xda) {
      break
    }
    if ($marker -eq 0x01 -or ($marker -ge 0xd0 -and $marker -le 0xd7)) {
      continue
    }
    if ($offset + 1 -ge $Bytes.Length) {
      break
    }

    $segmentLength = Get-OipManagedUInt16BigEndian -Bytes $Bytes -Offset $offset
    if ($segmentLength -lt 2 -or $offset + $segmentLength -gt $Bytes.Length) {
      break
    }
    if ($startOfFrameMarkers -contains $marker) {
      if ($segmentLength -lt 7) {
        throw "$Label has a malformed JPEG start-of-frame segment."
      }
      $height = Get-OipManagedUInt16BigEndian -Bytes $Bytes -Offset ($offset + 3)
      $width = Get-OipManagedUInt16BigEndian -Bytes $Bytes -Offset ($offset + 5)
      if ($width -le 0 -or $height -le 0) {
        throw "$Label has invalid native dimensions."
      }
      return [pscustomobject]@{ Width = [int]$width; Height = [int]$height }
    }
    $offset += $segmentLength
  }

  throw "$Label has no readable JPEG start-of-frame dimensions."
}

function Assert-OipManagedImageBytes {
  param(
    [Parameter(Mandatory = $true)][byte[]]$Bytes,
    [Parameter(Mandatory = $true)][string]$Extension,
    [string]$Label = 'Managed image'
  )

  $normalizedExtension = $Extension.ToLowerInvariant()
  $expectedFormat = Get-OipManagedImageFormatFromExtension -Extension $normalizedExtension
  if ($null -eq $expectedFormat) {
    throw "$Label uses unsupported extension '$Extension'. Managed originals must be PNG, JPG, or JPEG."
  }

  $actualFormat = Get-OipManagedImageFormatFromBytes -Bytes $Bytes
  if ($null -eq $actualFormat) {
    throw "$Label does not have a supported PNG or JPEG file signature."
  }
  if ($actualFormat -ne $expectedFormat) {
    throw "$Label extension '$Extension' does not match its $actualFormat file signature."
  }

  Get-OipManagedImageDimensionsFromBytes -Bytes $Bytes -Extension $normalizedExtension -Label $Label | Out-Null

  return $actualFormat
}

function Assert-OipManagedImageFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [AllowEmptyString()][string]$ExpectedExtension = '',
    [string]$Label = 'Managed image'
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label is not a file: $Path"
  }

  $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  if (-not [string]::IsNullOrWhiteSpace($ExpectedExtension) -and $extension -ne $ExpectedExtension.ToLowerInvariant()) {
    throw "$Label extension '$extension' does not match expected extension '$ExpectedExtension'."
  }

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  return Assert-OipManagedImageBytes -Bytes $bytes -Extension $extension -Label $Label
}

function Resolve-OipManagedImageExtension {
  param(
    [Parameter(Mandatory = $true)][byte[]]$Bytes,
    [AllowEmptyString()][string]$Url = '',
    [AllowEmptyString()][string]$ContentType = '',
    [string]$Label = 'Managed image download'
  )

  $urlExtension = ''
  if (-not [string]::IsNullOrWhiteSpace($Url)) {
    try {
      $urlExtension = [System.IO.Path]::GetExtension(([uri]$Url).AbsolutePath).ToLowerInvariant()
    }
    catch {
      throw "$Label has an invalid source URL."
    }
  }

  $urlFormat = $null
  if (-not [string]::IsNullOrWhiteSpace($urlExtension)) {
    $urlFormat = Get-OipManagedImageFormatFromExtension -Extension $urlExtension
    if ($null -eq $urlFormat) {
      throw "$Label URL uses unsupported extension '$urlExtension'. Managed originals must be PNG, JPG, or JPEG."
    }
  }

  $mediaType = ([string]$ContentType -split ';', 2)[0].Trim().ToLowerInvariant()
  $contentFormat = $null
  if (-not [string]::IsNullOrWhiteSpace($mediaType)) {
    switch ($mediaType) {
      'image/png' { $contentFormat = 'png' }
      'image/jpeg' { $contentFormat = 'jpeg' }
      default { throw "$Label has unsupported content type '$mediaType'. Managed originals must be PNG or JPEG." }
    }
  }

  if ($null -ne $urlFormat -and $null -ne $contentFormat -and $urlFormat -ne $contentFormat) {
    throw "$Label URL extension '$urlExtension' conflicts with content type '$mediaType'."
  }

  $actualFormat = Get-OipManagedImageFormatFromBytes -Bytes $Bytes
  if ($null -eq $actualFormat) {
    throw "$Label does not have a supported PNG or JPEG file signature."
  }
  if ($null -ne $urlFormat -and $urlFormat -ne $actualFormat) {
    throw "$Label URL extension '$urlExtension' does not match its $actualFormat file signature."
  }
  if ($null -ne $contentFormat -and $contentFormat -ne $actualFormat) {
    throw "$Label content type '$mediaType' does not match its $actualFormat file signature."
  }

  $extension = if (-not [string]::IsNullOrWhiteSpace($urlExtension)) {
    $urlExtension
  }
  elseif ($actualFormat -eq 'png') {
    '.png'
  }
  else {
    '.jpg'
  }

  Assert-OipManagedImageBytes -Bytes $Bytes -Extension $extension -Label $Label | Out-Null
  return $extension
}

function Assert-OipImageAssetManifest {
  param([Parameter(Mandatory = $true)][System.Collections.IDictionary]$Manifest)

  if ([string]$Manifest.schema_version -ne '1.0') {
    throw "Unsupported image asset manifest schema: $($Manifest.schema_version)"
  }

  foreach ($key in @('defaults', 'assets', 'aliases')) {
    if (-not $Manifest.Contains($key) -or $null -eq $Manifest[$key]) {
      throw "Image asset manifest is missing '$key'."
    }
  }

  foreach ($id in @($Manifest.assets.Keys)) {
    if (-not (Test-OipImageAssetId -Id ([string]$id))) {
      throw "Invalid image asset ID in manifest: $id"
    }

    $entry = $Manifest.assets[$id]
    if ([string]$entry.id -ne [string]$id) {
      throw "Image asset entry ID differs from its key: $id"
    }

    $source = ([string]$entry.source).Replace('\', '/')
    if ($source -notmatch '^images/originals/[a-z0-9][a-z0-9._/-]*$' -or $source -match '(^|/)\.\.?(/|$)|//') {
      throw "Image asset '$id' has an invalid source path: $source"
    }
    if ($null -eq (Get-OipManagedImageFormatFromExtension -Extension ([System.IO.Path]::GetExtension($source)))) {
      throw "Image asset '$id' has an unsupported source extension: $source"
    }

    if ([string]$entry.sha256 -notmatch '^[0-9a-f]{64}$') {
      throw "Image asset '$id' has an invalid SHA-256 value."
    }

    if ([int]$entry.width -le 0 -or [int]$entry.height -le 0) {
      throw "Image asset '$id' has invalid native dimensions."
    }

    if ([string]$entry.image_class -notin @('editorial_cartoon', 'essay_illustration', 'essay_photo', 'medium_import')) {
      throw "Image asset '$id' has an unsupported image_class: $($entry.image_class)"
    }

    if ([string]$entry.processing_hint -notin @('drawing', 'photo')) {
      throw "Image asset '$id' has an unsupported processing_hint: $($entry.processing_hint)"
    }

    if ([string]$entry.review_state -notin @('pending_review', 'approved', 'rejected_corrupt_source')) {
      throw "Image asset '$id' has an unsupported review_state: $($entry.review_state)"
    }

    if ([string]$entry.usage_state -notin @('referenced', 'retained_unreferenced')) {
      throw "Image asset '$id' has an unsupported usage_state: $($entry.usage_state)"
    }

    if ([string]$entry.processing_state -notin @('derivative_capable', 'source_only_unprocessable')) {
      throw "Image asset '$id' has an unsupported processing_state: $($entry.processing_state)"
    }
    if ([string]$entry.processing_state -eq 'source_only_unprocessable') {
      if ([string]$entry.usage_state -ne 'retained_unreferenced') {
        throw "Source-only image asset '$id' must be retained_unreferenced."
      }
      if ([string]$entry.review_state -ne 'rejected_corrupt_source') {
        throw "Source-only image asset '$id' must be rejected_corrupt_source."
      }
      if ([string]::IsNullOrWhiteSpace([string]$entry.processing_note)) {
        throw "Source-only image asset '$id' requires a tracked-safe processing_note."
      }
    }
    elseif ([string]$entry.review_state -eq 'rejected_corrupt_source') {
      throw "Rejected corrupt image asset '$id' must be source_only_unprocessable."
    }

    if ($null -ne $entry.quality_override) {
      foreach ($qualityKey in @('webp_quality', 'avif_quality')) {
        if (-not $entry.quality_override.Contains($qualityKey)) {
          throw "Image asset '$id' quality_override is missing '$qualityKey'."
        }
        $quality = [int]$entry.quality_override[$qualityKey]
        if ($quality -lt 1 -or $quality -gt 100) {
          throw "Image asset '$id' has invalid $qualityKey value: $quality"
        }
      }
    }
  }

  foreach ($alias in @($Manifest.aliases.Keys)) {
    $target = [string]$Manifest.aliases[$alias]
    if (-not $Manifest.assets.Contains($target)) {
      throw "Image alias '$alias' points to missing asset '$target'."
    }
  }
}

function Read-OipImageAssetManifest {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [switch]$AllowMissing
  )

  $path = Get-OipImageAssetManifestPath -Root $Root
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    if ($AllowMissing) {
      return New-OipImageAssetManifest
    }
    throw "Missing image asset manifest: $path"
  }

  $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $manifest = $raw | ConvertFrom-Json -AsHashtable
  Assert-OipImageAssetManifest -Manifest $manifest
  return $manifest
}

function Write-OipImageAssetManifest {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Manifest
  )

  Assert-OipImageAssetManifest -Manifest $Manifest

  $assets = [ordered]@{}
  foreach ($id in @($Manifest.assets.Keys | Sort-Object)) {
    $entry = $Manifest.assets[$id]
    $qualityOverride = $null
    if ($null -ne $entry.quality_override) {
      $qualityOverride = [ordered]@{
        webp_quality = [int]$entry.quality_override.webp_quality
        avif_quality = [int]$entry.quality_override.avif_quality
      }
    }

    $assets[$id] = [ordered]@{
      id = [string]$id
      source = ([string]$entry.source).Replace('\', '/')
      sha256 = ([string]$entry.sha256).ToLowerInvariant()
      width = [int]$entry.width
      height = [int]$entry.height
      image_class = [string]$entry.image_class
      processing_hint = [string]$entry.processing_hint
      review_state = [string]$entry.review_state
      usage_state = [string]$entry.usage_state
      processing_state = [string]$entry.processing_state
      processing_note = if ($null -eq $entry.processing_note) { $null } else { [string]$entry.processing_note }
      quality_override = $qualityOverride
    }
  }

  $aliases = [ordered]@{}
  foreach ($alias in @($Manifest.aliases.Keys | Sort-Object)) {
    $aliases[[string]$alias] = [string]$Manifest.aliases[$alias]
  }

  $defaults = $Manifest.defaults
  $orderedManifest = [ordered]@{
    schema_version = '1.0'
    defaults = [ordered]@{
      widths = @($defaults.widths | ForEach-Object { [int]$_ })
      webp_quality = [int]$defaults.webp_quality
      avif_quality = [int]$defaults.avif_quality
      detail_webp_quality = [int]$defaults.detail_webp_quality
      detail_avif_quality = [int]$defaults.detail_avif_quality
      social_jpeg_quality = [int]$defaults.social_jpeg_quality
      max_render_width = [int]$defaults.max_render_width
      social_max_width = [int]$defaults.social_max_width
    }
    assets = $assets
    aliases = $aliases
  }

  $path = Get-OipImageAssetManifestPath -Root $Root
  Write-OipCanonicalJsonFile -Path $path -Value $orderedManifest -Depth 12
}

function Get-OipImageNativeDimensions {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Image source is not a file: $Path"
  }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  return Get-OipManagedImageDimensionsFromBytes -Bytes $bytes -Extension $extension -Label "Image source '$Path'"
}

function Register-OipImageAsset {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)]
    [ValidateSet('editorial_cartoon', 'essay_illustration', 'essay_photo', 'medium_import')]
    [string]$ImageClass,
    [Parameter(Mandatory = $true)]
    [ValidateSet('drawing', 'photo')]
    [string]$ProcessingHint,
    [ValidateSet('pending_review', 'approved', 'rejected_corrupt_source')]
    [string]$ReviewState = 'pending_review',
    [ValidateSet('referenced', 'retained_unreferenced')]
    [string]$UsageState = 'referenced',
    [ValidateSet('derivative_capable', 'source_only_unprocessable')]
    [string]$ProcessingState = 'derivative_capable',
    [AllowNull()][string]$ProcessingNote = $null,
    [AllowNull()][System.Collections.IDictionary]$QualityOverride = $null,
    [string[]]$Aliases = @(),
    [AllowNull()][System.Collections.IDictionary]$Manifest = $null,
    [switch]$DeferWrite
  )

  if (-not (Test-OipImageAssetId -Id $Id)) {
    throw "Invalid image asset ID: $Id"
  }

  $normalizedSource = $Source.Replace('\', '/').TrimStart('/')
  if ($normalizedSource -notmatch '^images/originals/[a-z0-9][a-z0-9._/-]*$' -or $normalizedSource -match '(^|/)\.\.?(/|$)|//') {
    throw "Invalid image source path for '$Id': $Source"
  }

  $sourcePath = Join-Path (Join-Path $Root 'assets') $normalizedSource
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Image source does not exist for '$Id': $sourcePath"
  }
  Assert-OipManagedImageFile -Path $sourcePath -ExpectedExtension ([System.IO.Path]::GetExtension($normalizedSource)) -Label "Image source for '$Id'" | Out-Null

  if ($null -eq $Manifest) {
    $Manifest = Read-OipImageAssetManifest -Root $Root -AllowMissing
  }

  $hash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $dimensions = Get-OipImageNativeDimensions -Path $sourcePath
  $normalizedOverride = $null
  if ($null -ne $QualityOverride) {
    $normalizedOverride = [ordered]@{
      webp_quality = [int]$QualityOverride.webp_quality
      avif_quality = [int]$QualityOverride.avif_quality
    }
  }

  $Manifest.assets[$Id] = [ordered]@{
    id = $Id
    source = $normalizedSource
    sha256 = $hash
    width = $dimensions.Width
    height = $dimensions.Height
    image_class = $ImageClass
    processing_hint = $ProcessingHint
    review_state = $ReviewState
    usage_state = $UsageState
    processing_state = $ProcessingState
    processing_note = $ProcessingNote
    quality_override = $normalizedOverride
  }

  foreach ($alias in @($Aliases)) {
    $normalizedAlias = ([string]$alias).Trim()
    if ([string]::IsNullOrWhiteSpace($normalizedAlias)) {
      continue
    }

    if ($Manifest.aliases.Contains($normalizedAlias) -and [string]$Manifest.aliases[$normalizedAlias] -ne $Id) {
      throw "Image alias '$normalizedAlias' already points to '$($Manifest.aliases[$normalizedAlias])'."
    }
    $Manifest.aliases[$normalizedAlias] = $Id
  }

  Assert-OipImageAssetManifest -Manifest $Manifest
  if (-not $DeferWrite) {
    Write-OipImageAssetManifest -Root $Root -Manifest $Manifest
  }

  return $Manifest
}

function Resolve-OipImageAsset {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Reference,
    [AllowNull()][System.Collections.IDictionary]$Manifest = $null
  )

  if ([string]::IsNullOrWhiteSpace($Reference)) {
    return $null
  }

  if ($null -eq $Manifest) {
    $Manifest = Read-OipImageAssetManifest -Root $Root
  }

  $candidate = $Reference.Trim().Trim('<', '>')
  if ($candidate.StartsWith('oip-image:', [System.StringComparison]::OrdinalIgnoreCase)) {
    $candidate = $candidate.Substring('oip-image:'.Length)
  }

  $id = $candidate
  if (-not $Manifest.assets.Contains($id)) {
    if (-not $Manifest.aliases.Contains($candidate)) {
      return $null
    }
    $id = [string]$Manifest.aliases[$candidate]
  }

  $entry = $Manifest.assets[$id]
  $sourcePath = Join-Path (Join-Path $Root 'assets') ([string]$entry.source)
  return [pscustomobject]@{
    Id = $id
    Entry = $entry
    Path = $sourcePath
  }
}
