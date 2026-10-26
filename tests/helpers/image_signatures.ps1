#requires -Version 7.0

function Get-OipSignatureSha256 {
  param([Parameter(Mandatory)][byte[]]$Bytes)
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
}

function Assert-OipSignatureFields {
  param([object]$Value, [string[]]$Allowed, [string]$Label)
  if ($Value -isnot [System.Collections.IDictionary]) { throw "$Label must be an object." }
  foreach ($key in $Value.Keys) {
    if ($key -cnotin $Allowed) { throw "$Label has unknown field '$key'." }
  }
}

function Assert-OipSignatureRatio {
  param([object]$Value, [string]$Label, [switch]$AllowZero)
  if ($Value -isnot [ValueType] -or $Value -is [bool] -or
      $Value -is [char] -or $null -eq $Value -or
      [double]::IsNaN([double]$Value) -or [double]::IsInfinity([double]$Value) -or
      [double]$Value -gt 0.25 -or [double]$Value -lt 0 -or
      (-not $AllowZero -and [double]$Value -eq 0)) {
    throw "$Label must be a number no greater than 0.25 and above its allowed lower bound."
  }
}

function Get-OipImageSignaturePolicy {
  param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][object]$Manifest)
  $policyPath = Join-Path $Root 'data/image-signatures.json'
  if (-not (Test-Path -LiteralPath $policyPath -PathType Leaf)) { throw 'Missing data/image-signatures.json.' }
  $bytes = [IO.File]::ReadAllBytes($policyPath)
  $text = [Text.UTF8Encoding]::new($false, $true).GetString($bytes)
  if ($text.StartsWith([string][char]0xfeff, [StringComparison]::Ordinal) -or $text.Contains("`r", [StringComparison]::Ordinal) -or
      -not $text.EndsWith("`n", [StringComparison]::Ordinal) -or $text.EndsWith("`n`n", [StringComparison]::Ordinal)) {
    throw 'Image signature policy requires UTF-8 without BOM, LF, and exactly one final LF.'
  }
  $policy = $text | ConvertFrom-Json -AsHashtable -Depth 30
  $fields = @('version','mark','default_classes','width_ratio','inset_ratio','overrides','legacy_assets')
  Assert-OipSignatureFields $policy $fields 'Image signature policy'
  foreach ($field in $fields) {
    if (-not $policy.Contains($field)) { throw "Image signature policy is missing '$field'." }
  }
  if ($policy.version -isnot [long] -and $policy.version -isnot [int]) { throw 'Image signature version must be integer 1.' }
  if ($policy.version -ne 1) { throw 'Unsupported image signature policy version.' }
  if ($policy.mark -isnot [string] -or $policy.mark -cnotmatch '^images/signatures/[a-z0-9][a-z0-9._-]*\.png$') {
    throw 'Image signature mark must be a PNG inside assets/images/signatures.'
  }
  if ($policy.default_classes -isnot [array] -or $policy.default_classes.Count -eq 0 -or @($policy.default_classes | Select-Object -Unique).Count -ne $policy.default_classes.Count) {
    throw 'Image signature default_classes must be a nonempty unique array.'
  }
  foreach ($class in $policy.default_classes) {
    if ($class -cnotin @('essay_illustration','editorial_cartoon')) { throw "Image signature cannot default to class '$class'." }
  }
  Assert-OipSignatureRatio $policy.width_ratio 'Signature width_ratio'
  Assert-OipSignatureRatio $policy.inset_ratio 'Signature inset_ratio' -AllowZero
  Assert-OipSignatureFields $policy.legacy_assets @($policy.legacy_assets.Keys) 'Signature legacy_assets'
  $legacyPaths = @{}
  $legacyUrls = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($id in $policy.legacy_assets.Keys) {
    $entry=$policy.legacy_assets[$id]
    $legacyFields=@('id','source','sha256','width','height','image_class','processing_hint','processing_state','review_state','usage_state','url','reason')
    Assert-OipSignatureFields $entry $legacyFields "Legacy signature asset '$id'"
    foreach ($field in $legacyFields) { if (-not $entry.Contains($field)) { throw "Legacy signature asset '$id' is missing '$field'." } }
    if ($id -cnotmatch '^legacy/[0-9a-f]{64}$' -or $entry.id -cne $id -or $entry.sha256 -cne $id.Substring(7)) { throw "Legacy signature asset '$id' has inconsistent identity." }
    if ($id -cin @(Get-OipPropertyNames $Manifest.assets)) { throw "Duplicate signature asset '$id'." }
    if ($entry.url -isnot [string] -or $entry.url -cnotmatch '^/images/medium/[a-z0-9_-]+/[a-zA-Z0-9._-]+\.(?:jpeg|jpg)$' -or $entry.url.Contains('..') -or -not $legacyUrls.Add($entry.url)) { throw "Legacy signature asset '$id' has invalid or repeated URL." }
    if ('aliases' -cin @(Get-OipPropertyNames $Manifest) -and $entry.url -cin @(Get-OipPropertyNames $Manifest.aliases)) { throw "Legacy signature asset '$id' repeats a managed alias." }
    $expectedSource='images/legacy-medium/' + $entry.url.Substring('/images/medium/'.Length)
    if ($entry.source -cne $expectedSource) { throw "Legacy signature asset '$id' does not match its mounted source." }
    foreach ($pair in @(@('image_class','essay_illustration'),@('processing_hint','drawing'),@('processing_state','derivative_capable'),@('review_state','approved'),@('usage_state','referenced'))) {
      if ($entry[$pair[0]] -cne $pair[1]) { throw "Legacy signature asset '$id' has invalid $($pair[0])." }
    }
    if ($entry.reason -isnot [string] -or [string]::IsNullOrWhiteSpace($entry.reason)) { throw "Legacy signature asset '$id' requires ownership evidence." }
    $sourcePath=Join-Path $Root ('static' + $entry.url)
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf) -or (Get-OipSha256 $sourcePath) -cne $entry.sha256) { throw "Legacy signature asset '$id' source bytes changed or are missing." }
    $dimensions=Get-OipImageDimensions $sourcePath
    foreach ($dimension in @('width','height')) {
      if (($entry[$dimension] -isnot [long] -and $entry[$dimension] -isnot [int]) -or $entry[$dimension] -le 0 -or $entry[$dimension] -ne $dimensions.$dimension) { throw "Legacy signature asset '$id' has invalid $dimension." }
    }
    $legacyPaths[$id]=$sourcePath
  }
  $effectiveManifest=Get-OipSignatureManifest -Manifest $Manifest -LegacyAssets $policy.legacy_assets
  Assert-OipSignatureFields $policy.overrides @($policy.overrides.Keys) 'Image signature overrides'
  $assetNames = @(Get-OipPropertyNames -Value $effectiveManifest.assets)
  foreach ($id in $policy.overrides.Keys) {
    if ($id -cnotin $assetNames) { throw "Image signature override references unknown asset '$id'." }
    $override = $policy.overrides[$id]
    Assert-OipSignatureFields $override @('enabled','reason','position','width_ratio','inset_ratio') "Signature override '$id'"
    if ($override.Count -eq 0) { throw "Signature override '$id' must not be empty." }
    if ($override.Contains('enabled')) {
      if ($override.enabled -isnot [bool]) { throw "Signature override '$id' enabled must be boolean." }
      if (-not $override.Contains('reason') -or [string]::IsNullOrWhiteSpace($override.reason)) {
        throw "Explicit signature override '$id' requires a reason."
      }
      $asset = $effectiveManifest.assets.$id
      if ($override.enabled -and $asset.image_class -cnotin @('essay_illustration','editorial_cartoon','medium_import')) { throw "Asset '$id' cannot be signed." }
      if ($override.enabled -and $asset.image_class -ceq 'medium_import' -and (-not $override.Contains('reason') -or [string]::IsNullOrWhiteSpace($override.reason))) {
        throw "Enabled Medium signature override '$id' requires a provenance reason."
      }
    }
    if ($override.Contains('reason') -and ($override.reason -isnot [string] -or [string]::IsNullOrWhiteSpace($override.reason))) { throw "Signature override '$id' reason must be nonempty text." }
    if ($override.Contains('position') -and $override.position -cnotin @('bottom-right','bottom-left','top-right','top-left')) { throw "Signature override '$id' has invalid position." }
    if ($override.Contains('width_ratio')) { Assert-OipSignatureRatio $override.width_ratio "Signature '$id' width_ratio" }
    if ($override.Contains('inset_ratio')) { Assert-OipSignatureRatio $override.inset_ratio "Signature '$id' inset_ratio" -AllowZero }
  }
  $markPath = Join-Path (Join-Path $Root 'assets') $policy.mark
  if (-not (Test-Path -LiteralPath $markPath -PathType Leaf) -or -not (Test-OipImageSignature -Path $markPath)) { throw 'Image signature mark is missing or invalid.' }
  $markBytes = [IO.File]::ReadAllBytes($markPath)
  if ($markBytes.Length -lt 26 -or $markBytes[25] -notin @(4,6)) { throw 'Image signature mark must be a PNG with an alpha channel.' }
  $dimensions = Get-OipImageDimensions -Path $markPath
  if ($dimensions.Width -le 0 -or $dimensions.Height -le 0) { throw 'Image signature mark has invalid dimensions.' }
  return [pscustomobject]@{
    Policy = $policy
    PolicySha256 = Get-OipSignatureSha256 -Bytes $bytes
    MarkSha256 = Get-OipSignatureSha256 -Bytes $markBytes
    LegacySourcePaths = $legacyPaths
  }
}

function Get-OipSignatureManifest {
  param([Parameter(Mandatory)][object]$Manifest, [Parameter(Mandatory)][object]$LegacyAssets)
  $assets=[ordered]@{}
  foreach ($id in @(Get-OipPropertyNames $Manifest.assets)) { $assets[$id]=$Manifest.assets.$id }
  foreach ($id in $LegacyAssets.Keys) { $assets[$id]=[pscustomobject]$LegacyAssets[$id] }
  $aliases=[ordered]@{}
  if ('aliases' -cin @(Get-OipPropertyNames $Manifest)) { foreach ($url in @(Get-OipPropertyNames $Manifest.aliases)) { $aliases[$url]=$Manifest.aliases.$url } }
  foreach ($id in $LegacyAssets.Keys) { $aliases[$LegacyAssets[$id].url]=$id }
  return [pscustomobject]@{ assets=[pscustomobject]$assets; defaults=$Manifest.defaults; aliases=[pscustomobject]$aliases }
}

function Test-OipImageSignatureEnabled {
  param([Parameter(Mandatory)][object]$Asset, [AllowNull()][object]$SignaturePolicy)
  if ($null -eq $SignaturePolicy) { return $false }
  $policy = $SignaturePolicy.Policy
  $enabled = [string]$Asset.image_class -cin $policy.default_classes
  if ($policy.overrides.Contains([string]$Asset.id)) {
    $override = $policy.overrides[[string]$Asset.id]
    if ($override.Contains('enabled')) { $enabled = $override.enabled }
  }
  return $enabled
}

function Get-OipSignatureRenderPrefix {
  param([Parameter(Mandatory)][object]$Asset, [AllowNull()][object]$SignaturePolicy)
  if (-not (Test-OipImageSignatureEnabled -Asset $Asset -SignaturePolicy $SignaturePolicy)) { return ([string]$Asset.sha256).Substring(0,12) }
  $identity = [string]$Asset.sha256 + '|' + $SignaturePolicy.PolicySha256 + '|' + $SignaturePolicy.MarkSha256 + '|bob-v1'
  return (Get-OipSignatureSha256 -Bytes ([Text.Encoding]::UTF8.GetBytes($identity))).Substring(0,12)
}

function Get-OipImageSignatureCompatibility {
  param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][object]$Manifest, [Parameter(Mandatory)][object]$SignaturePolicy)
  $path=Join-Path $Root 'data/image-signature-compatibility.json'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Missing data/image-signature-compatibility.json.' }
  $bytes=[IO.File]::ReadAllBytes($path)
  $text=[Text.UTF8Encoding]::new($false,$true).GetString($bytes)
  if ($text.StartsWith([string][char]0xfeff,[StringComparison]::Ordinal) -or $text.Contains("`r",[StringComparison]::Ordinal) -or
      -not $text.EndsWith("`n",[StringComparison]::Ordinal) -or $text.EndsWith("`n`n",[StringComparison]::Ordinal)) {
    throw 'Image signature compatibility requires UTF-8 without BOM, LF, and exactly one final LF.'
  }
  $registry=$text | ConvertFrom-Json -AsHashtable -Depth 10
  Assert-OipSignatureFields $registry @('version','aliases') 'Image signature compatibility'
  if (-not $registry.Contains('version') -or -not $registry.Contains('aliases') -or
      ($registry.version -isnot [long] -and $registry.version -isnot [int]) -or $registry.version -ne 1) {
    throw 'Image signature compatibility requires version 1 and aliases.'
  }
  Assert-OipSignatureFields $registry.aliases @($registry.aliases.Keys) 'Image signature compatibility aliases'
  $effective=Get-OipSignatureManifest -Manifest $Manifest -LegacyAssets $SignaturePolicy.Policy.legacy_assets
  $ids=@(Get-OipPropertyNames $effective.assets)
  $canonical=@{}
  foreach ($url in $registry.aliases.Keys) {
    $id=$registry.aliases[$url]
    if ($id -isnot [string] -or $id -cnotin $ids) { throw "Compatibility URL '$url' has an unknown asset." }
    $asset=$effective.assets.$id
    if ($asset.review_state -cne 'approved' -or $asset.processing_state -cne 'derivative_capable' -or
        -not (Test-OipImageSignatureEnabled $asset $SignaturePolicy)) { throw "Compatibility asset '$id' must be approved signed artwork." }
    $width=[Math]::Min([int]$asset.width,[int]$effective.defaults.social_max_width)
    $expected='/images/rendered/' + $id + '/' + $asset.sha256.Substring(0,12) + '/social-' + $width + 'w.jpg'
    if ($url -cne $expected) { throw "Compatibility URL '$url' must match its exact historical source prefix, social width, and JPEG format." }
    $prefix=Get-OipSignatureRenderPrefix $asset $SignaturePolicy
    $canonical[$url]='/images/rendered/' + $id + '/' + $prefix + '/social-' + $width + 'w.jpg'
    if ($url -ceq $canonical[$url]) { throw "Compatibility URL '$url' must differ from the signed canonical URL." }
  }
  return [pscustomobject]@{ Aliases=$registry.aliases; CanonicalByAlias=$canonical; FileSha256=(Get-OipSignatureSha256 $bytes) }
}

function Assert-OipSignatureEmailReferences {
  param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][object]$Manifest, [Parameter(Mandatory)][object]$SignaturePolicy, [Parameter(Mandatory)][object]$SignatureCompatibility)
  $effective=Get-OipSignatureManifest -Manifest $Manifest -LegacyAssets $SignaturePolicy.Policy.legacy_assets
  $ids=@(Get-OipPropertyNames $effective.assets)
  $count=0
  foreach ($source in @(Get-ChildItem -LiteralPath (Join-Path $Root 'content/almanack') -File -Recurse -Filter '*.md')) {
    $text=[IO.File]::ReadAllText($source.FullName)
    foreach ($reference in [regex]::Matches($text,'(?m)^[ \t]*email_image:\s*["'']?(?<url>https://outsideinprint\.org/images/rendered/[^"''\s]+)')) {
      $count++
      $url=([uri]$reference.Groups['url'].Value).AbsolutePath
      $match=[regex]::Match($url,'^/images/rendered/(?<id>.+)/[0-9a-f]{12}/social-[1-9][0-9]*w\.jpg$')
      if (-not $match.Success -or $match.Groups['id'].Value -cnotin $ids) { throw "Almanack email_image has an invalid rendered artwork URL: $url" }
      $asset=$effective.assets.($match.Groups['id'].Value)
      $width=[Math]::Min([int]$asset.width,[int]$effective.defaults.social_max_width)
      $canonical='/images/rendered/' + $asset.id + '/' + (Get-OipSignatureRenderPrefix $asset $SignaturePolicy) + '/social-' + $width + 'w.jpg'
      if ($url -cne $canonical -and -not $SignatureCompatibility.Aliases.Contains($url)) { throw "Almanack email_image needs its signed compatibility alias: $url" }
    }
  }
  return $count
}
