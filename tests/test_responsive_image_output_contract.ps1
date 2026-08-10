#requires -Version 7.0

param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public'),
  [string]$ManifestPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'data/image-assets.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'helpers/responsive_image_common.ps1')

$maxArtifactBytes = 600MB
$maxPublicImageBytes = 500MB
$focusedCleanupPublicImageCeilingBytes = 450MB
$boundLivePublicImageBytes = 512308750
$focusedCleanupMinimumSavingsBytes = 40MB
$maxDerivativeBytes = 1MB
$maxGeneratedImages = 5000
$maxPublicFiles = 6500

function Get-HtmlAttribute {
  param(
    [Parameter(Mandatory)][string]$Tag,
    [Parameter(Mandatory)][string]$Name
  )

  $pattern = '(?is)(?:^|\s)' + [regex]::Escape($Name) + '\s*=\s*(?:"(?<dq>[^"]*)"|''(?<sq>[^'']*)''|(?<bare>[^\s>]+))'
  $match = [regex]::Match($Tag, $pattern)
  if (-not $match.Success) {
    return $null
  }
  foreach ($groupName in @('dq','sq','bare')) {
    if ($match.Groups[$groupName].Success) {
      return [System.Net.WebUtility]::HtmlDecode($match.Groups[$groupName].Value)
    }
  }
  return $null
}

function Get-RenderedRelativePath {
  param(
    [Parameter(Mandatory)][string]$Url
  )

  $decoded = [System.Net.WebUtility]::HtmlDecode($Url).Trim()
  if ($decoded -match '^https?://') {
    try {
      $decoded = ([uri]$decoded).AbsolutePath
    }
    catch {
      throw "Invalid absolute rendered-image URL: $Url"
    }
  }
  $decoded = ($decoded -split '[?#]', 2)[0]
  return $decoded.TrimStart('/').Replace('\','/')
}

function Get-RenderedUrlModel {
  param(
    [Parameter(Mandatory)][string]$Url,
    [Parameter(Mandatory)][object]$Manifest,
    [Parameter(Mandatory)][string]$SiteRoot
  )

  $relativePath = Get-RenderedRelativePath -Url $Url
  $match = [regex]::Match(
    $relativePath,
    '^images/rendered/(?<id>.+)/(?<prefix>[0-9a-f]{8,64})/(?:(?<social>social-)?(?<width>[1-9][0-9]*)w)\.(?<extension>avif|webp|jpg)$',
    [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
  )
  if (-not $match.Success) {
    throw "Generated image URL violates the stable rendered path contract: $Url"
  }

  $assetId = $match.Groups['id'].Value
  $assetNames = @(Get-OipPropertyNames -Value $Manifest.assets)
  if ($assetNames -cnotcontains $assetId) {
    throw "Generated image URL references unknown asset '$assetId': $Url"
  }
  $asset = $Manifest.assets.$assetId
  $prefix = $match.Groups['prefix'].Value
  if (-not ([string]$asset.sha256).StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Generated image URL hash prefix does not match '$assetId': $Url"
  }

  $fullPath = Join-Path $SiteRoot $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Generated image URL points at a missing public file: $Url"
  }

  return [pscustomobject]@{
    Url = $Url
    RelativePath = $relativePath
    FullPath = $fullPath
    Id = $assetId
    Asset = $asset
    HashPrefix = $prefix
    Width = [int]$match.Groups['width'].Value
    Extension = $match.Groups['extension'].Value
    IsSocial = $match.Groups['social'].Success
  }
}

function Get-SrcsetCandidates {
  param(
    [Parameter(Mandatory)][string]$Srcset
  )

  $results = [System.Collections.Generic.List[object]]::new()
  foreach ($candidateText in $Srcset.Split(',')) {
    $candidate = $candidateText.Trim()
    $match = [regex]::Match($candidate, '^(?<url>\S+)\s+(?<width>[1-9][0-9]*)w$')
    if (-not $match.Success) {
      throw "Invalid width-descriptor srcset candidate: $candidate"
    }
    $results.Add([pscustomobject]@{
      Url = [System.Net.WebUtility]::HtmlDecode($match.Groups['url'].Value)
      Width = [int]$match.Groups['width'].Value
    })
  }
  return @($results.ToArray())
}

function Test-RenderedModel {
  param(
    [Parameter(Mandatory)][object]$Model,
    [Parameter(Mandatory)][int[]]$AllowedWidths,
    [Parameter(Mandatory)][int]$MaxRenderWidth,
    [Parameter(Mandatory)][int]$MaxSocialWidth
  )

  $maxAllowed = if ($Model.IsSocial) { $MaxSocialWidth } else { $MaxRenderWidth }
  if ($Model.Width -gt $maxAllowed) {
    throw "Generated image exceeds its pipeline width cap: $($Model.RelativePath)"
  }
  if ($Model.Width -gt [int]$Model.Asset.width) {
    throw "Generated image upscales '$($Model.Id)' beyond source width $($Model.Asset.width): $($Model.RelativePath)"
  }
  $terminalWidth = [Math]::Min([int]$Model.Asset.width, $MaxRenderWidth)
  if (-not $Model.IsSocial -and $AllowedWidths -notcontains $Model.Width -and $Model.Width -ne $terminalWidth) {
    throw "Generated responsive width is outside the approved width set and is not the bounded terminal native width: $($Model.RelativePath)"
  }
  if ($Model.IsSocial -and $Model.Extension -cne 'jpg') {
    throw "Social derivative must be JPEG: $($Model.RelativePath)"
  }
  if (-not $Model.IsSocial -and $Model.Extension -cnotin @('avif','webp')) {
    throw "Responsive derivative must be AVIF or WebP: $($Model.RelativePath)"
  }

  $file = Get-Item -LiteralPath $Model.FullPath
  if ($file.Length -gt $maxDerivativeBytes) {
    throw "Generated derivative exceeds 1 MiB: $($Model.RelativePath) ($($file.Length) bytes)"
  }
  if (-not (Test-OipImageSignature -Path $Model.FullPath)) {
    throw "Generated derivative signature does not match its extension: $($Model.RelativePath)"
  }
  $dimensions = Get-OipImageDimensions -Path $Model.FullPath
  if ([int]$dimensions.Width -ne $Model.Width) {
    throw "Generated derivative filename width differs from its encoded width: $($Model.RelativePath) => $($dimensions.Width)"
  }
  if ([int]$dimensions.Width -gt [int]$Model.Asset.width -or [int]$dimensions.Height -gt [int]$Model.Asset.height) {
    throw "Generated derivative dimensions upscale '$($Model.Id)': $($Model.RelativePath)"
  }
  $expectedHeight = [Math]::Round(([double]$Model.Asset.height * [double]$dimensions.Width) / [double]$Model.Asset.width)
  if ([Math]::Abs([double]$dimensions.Height - $expectedHeight) -gt 2) {
    throw "Generated derivative changes '$($Model.Id)' aspect ratio: $($Model.RelativePath)"
  }
}

$siteRoot = [System.IO.Path]::GetFullPath($SiteDir)
if (-not (Test-Path -LiteralPath $siteRoot -PathType Container)) {
  throw "Missing generated public directory: $siteRoot"
}

$manifest = Get-OipImageManifest -Path $ManifestPath
$allowedWidths = @($manifest.defaults.widths | ForEach-Object { [int]$_ })
$maxRenderWidth = [int]$manifest.defaults.max_render_width
$maxSocialWidth = [int]$manifest.defaults.social_max_width
$assetIds = @(Get-OipPropertyNames -Value $manifest.assets)
$aliasNames = @(Get-OipPropertyNames -Value $manifest.aliases)
$sourceOnlyAssetIds = @($assetIds | Where-Object { [string]$manifest.assets.$_.processing_state -ceq 'source_only_unprocessable' })
if ($sourceOnlyAssetIds.Count -ne 1) {
  throw "Generated-output validation requires exactly one quarantined source-only asset; found $($sourceOnlyAssetIds.Count)."
}

$publicFiles = @(Get-ChildItem -LiteralPath $siteRoot -File -Recurse)
if ($publicFiles.Count -gt $maxPublicFiles) {
  throw "Public output exceeds 6,500 files: $($publicFiles.Count)"
}
$publicBytes = ($publicFiles | Measure-Object -Property Length -Sum).Sum
if ($publicBytes -gt $maxArtifactBytes) {
  throw "Prepared Pages payload exceeds the 600 MiB artifact budget: $publicBytes bytes"
}

foreach ($reviewOutputPath in @('image-review','image-review/originals')) {
  if (Test-Path -LiteralPath (Join-Path $siteRoot $reviewOutputPath)) {
    throw "Local image-review material leaked into production output: $reviewOutputPath"
  }
}

$publicImagesRoot = Join-Path $siteRoot 'images'
$publicImageFiles = if (Test-Path -LiteralPath $publicImagesRoot -PathType Container) {
  @(Get-ChildItem -LiteralPath $publicImagesRoot -File -Recurse)
}
else {
  @()
}
$publicImageBytes = ($publicImageFiles | Measure-Object -Property Length -Sum).Sum
if ($publicImageBytes -gt $maxPublicImageBytes) {
  throw "public/images exceeds the 500 MiB budget: $publicImageBytes bytes"
}
if ($publicImageBytes -gt $focusedCleanupPublicImageCeilingBytes) {
  throw "Focused cleanup release exceeds its 450 MiB public/images acceptance ceiling: $publicImageBytes bytes"
}
$focusedCleanupSavingsBytes = $boundLivePublicImageBytes - $publicImageBytes
if ($focusedCleanupSavingsBytes -lt $focusedCleanupMinimumSavingsBytes) {
  throw "Focused cleanup saves only $focusedCleanupSavingsBytes bytes from the bound $boundLivePublicImageBytes-byte live baseline; at least 40 MiB is required."
}

$originalsLeak = @($publicFiles | Where-Object { $_.FullName.Replace('\','/') -match '/images/originals/' })
if ($originalsLeak.Count -gt 0) {
  throw "Managed original source paths leaked into public output."
}

$renderedRoot = Join-Path $publicImagesRoot 'rendered'
if (-not (Test-Path -LiteralPath $renderedRoot -PathType Container)) {
  throw 'Production output is missing public/images/rendered.'
}
$renderedFiles = @(Get-ChildItem -LiteralPath $renderedRoot -File -Recurse)
if ($renderedFiles.Count -eq 0) {
  throw 'Production output contains no generated responsive images.'
}
if ($renderedFiles.Count -gt $maxGeneratedImages) {
  throw "Generated image count exceeds 5,000: $($renderedFiles.Count)"
}

$renderedModelsByRelativePath = @{}
foreach ($renderedFile in $renderedFiles) {
  $relativePath = $renderedFile.FullName.Substring($siteRoot.Length + 1).Replace('\','/')
  $model = Get-RenderedUrlModel -Url ('/' + $relativePath) -Manifest $manifest -SiteRoot $siteRoot
  if ($sourceOnlyAssetIds -ccontains $model.Id) {
    throw "Quarantined source-only asset produced a public derivative: $relativePath"
  }
  Test-RenderedModel -Model $model -AllowedWidths $allowedWidths -MaxRenderWidth $maxRenderWidth -MaxSocialWidth $maxSocialWidth
  if ($renderedModelsByRelativePath.ContainsKey($relativePath)) {
    throw "Duplicate generated-image output path: $relativePath"
  }
  $renderedModelsByRelativePath[$relativePath] = $model
}

$legacyMediumIds = @(
  'medium/20f97dfa3cacfdad0e6ad4e8bd6b9f40259e269d01de4e85977a31d1468a0731',
  'medium/2cb1bd9d5e821673e5988fe08124a3a9270c9ef0cd5b494b7fea0a55bb4814e7',
  'medium/502c9af7d38343926679b4000c07f7938a7bb2ffb2de34fd307939daa7c4523a',
  'medium/79135b86692f72d399ab6e14643d150385b4419e4c10a2c66a7e32ccacd64cbe',
  'medium/982e8af5463df6dd09ee9b9aeb11f3c8764461085e2bf676f51d03a5fc9fe1fb',
  'medium/bae249c94478ad9d5603403fcd7b5141ffc06bc35a66bd782d1f4f259ed2a7cb',
  'medium/ec686e18de7c21b0892fabb04179d3a92b94245291f508d7fdc56af18af8fab7'
)
$focusedCleanupIds = @(
  $assetIds | Where-Object {
    ($_.StartsWith('medium/', [System.StringComparison]::Ordinal) -and $legacyMediumIds -cnotcontains $_) -or
    $_.StartsWith('essays/dialogues/', [System.StringComparison]::Ordinal)
  }
)
if ($focusedCleanupIds.Count -ne 109) {
  throw "Focused cleanup output validation requires exactly 109 newly migrated managed assets; found $($focusedCleanupIds.Count)."
}
$renderedAssetIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($renderedModel in $renderedModelsByRelativePath.Values) {
  [void]$renderedAssetIds.Add([string]$renderedModel.Id)
}
$missingFocusedCleanupDerivatives = @($focusedCleanupIds | Where-Object { -not $renderedAssetIds.Contains($_) })
if ($missingFocusedCleanupDerivatives.Count -gt 0) {
  throw "Focused-cleanup assets are missing generated derivatives: $($missingFocusedCleanupDerivatives -join ', ')"
}

$sourceLengths = @{}
foreach ($assetId in $assetIds) {
  $asset = $manifest.assets.$assetId
  $sourceFullPath = Join-Path (Split-Path -Parent (Split-Path -Parent $ManifestPath)) ('assets/' + ([string]$asset.source))
  $sourceFile = Get-Item -LiteralPath $sourceFullPath
  $lengthKey = [string]$sourceFile.Length
  if (-not $sourceLengths.ContainsKey($lengthKey)) {
    $sourceLengths[$lengthKey] = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  }
  $sourceLengths[$lengthKey].Add([string]$asset.sha256) | Out-Null
}

foreach ($publicImage in $publicImageFiles) {
  $lengthKey = [string]$publicImage.Length
  if (-not $sourceLengths.ContainsKey($lengthKey)) {
    continue
  }
  $hash = Get-OipSha256 -Path $publicImage.FullName
  if ($sourceLengths[$lengthKey].Contains($hash)) {
    throw "Managed original source bytes leaked into public output: $($publicImage.FullName.Substring($siteRoot.Length + 1).Replace('\','/'))"
  }
}

foreach ($retiredDirectory in @('images/editorial','images/essays','images/syd-and-oliver')) {
  $fullDirectory = Join-Path $siteRoot $retiredDirectory
  if (-not (Test-Path -LiteralPath $fullDirectory -PathType Container)) {
    continue
  }
  $retiredRasterFiles = @(Get-ChildItem -LiteralPath $fullDirectory -File -Recurse | Where-Object { $_.Extension -in @('.png','.jpg','.jpeg') })
  if ($retiredRasterFiles.Count -gt 0) {
    throw "Retired managed editorial/essay raster paths remain in public output: $retiredDirectory"
  }
}

$publicMediumRoot = Join-Path $publicImagesRoot 'medium'
if (-not (Test-Path -LiteralPath $publicMediumRoot -PathType Container)) {
  throw 'Production output is missing the retained compact Medium JPEG/JPG fleet.'
}
$publicMediumFiles = @(Get-ChildItem -LiteralPath $publicMediumRoot -File -Recurse)
if ($publicMediumFiles.Count -ne 316) {
  throw "Production output must contain exactly 316 retained Medium JPEG/JPG files; found $($publicMediumFiles.Count)."
}
$unsupportedPublicMediumFiles = @($publicMediumFiles | Where-Object { $_.Extension.ToLowerInvariant() -notin @('.jpg','.jpeg') })
if ($unsupportedPublicMediumFiles.Count -gt 0) {
  $sample = @($unsupportedPublicMediumFiles | Select-Object -First 8 | ForEach-Object { $_.FullName.Substring($siteRoot.Length + 1).Replace('\','/') })
  throw "Production output contains retired Medium PNG/GIF or another unsupported format: $($sample -join ', ')"
}

$htmlFiles = @(Get-ChildItem -LiteralPath $siteRoot -File -Recurse -Filter '*.html')
$managedPictureCount = 0
$multiCandidatePictureCount = 0
$eagerPictureCount = 0
$lazyPictureCount = 0
$managedLightboxCount = 0
$managedSocialPageCount = 0

foreach ($htmlFile in $htmlFiles) {
  $relativeHtmlPath = $htmlFile.FullName.Substring($siteRoot.Length + 1).Replace('\','/')
  $html = Get-Content -LiteralPath $htmlFile.FullName -Raw -Encoding utf8
  if ($html -match '(?i)/images/originals/') {
    throw "Generated HTML exposes /images/originals/: $relativeHtmlPath"
  }
  if ($html -match '(?i)/image-review(?:/|["''<\s])') {
    throw "Local image-review route leaked into generated HTML: $relativeHtmlPath"
  }
  foreach ($alias in $aliasNames) {
    if ($html.Contains($alias, [System.StringComparison]::Ordinal)) {
      throw "Generated HTML retains retired managed image URL '$alias': $relativeHtmlPath"
    }
  }

  $documentEagerCount = 0
  foreach ($pictureMatch in [regex]::Matches($html, '(?is)<picture\b(?<open>[^>]*)\bdata-oip-image-id=(?:"(?<id1>[^"]+)"|''(?<id2>[^'']+)''|(?<id3>[^\s>]+))[^>]*>(?<body>.*?)</picture>')) {
    $managedPictureCount++
    $pictureHtml = $pictureMatch.Value
    $assetId = $pictureMatch.Groups['id1'].Value + $pictureMatch.Groups['id2'].Value + $pictureMatch.Groups['id3'].Value
    if ($assetIds -cnotcontains $assetId) {
      throw "Managed picture references unknown asset '$assetId': $relativeHtmlPath"
    }

    $sourceMatches = @([regex]::Matches($pictureHtml, '(?is)<source\b[^>]*>'))
    if ($sourceMatches.Count -ne 2) {
      throw "Managed picture must contain exactly AVIF and WebP sources: $relativeHtmlPath => $assetId"
    }
    $avifType = Get-HtmlAttribute -Tag $sourceMatches[0].Value -Name 'type'
    $webpType = Get-HtmlAttribute -Tag $sourceMatches[1].Value -Name 'type'
    if ($avifType -cne 'image/avif' -or $webpType -cne 'image/webp') {
      throw "Managed picture MIME order must be image/avif then image/webp: $relativeHtmlPath => $assetId"
    }

    $avifSrcset = Get-HtmlAttribute -Tag $sourceMatches[0].Value -Name 'srcset'
    $webpSrcset = Get-HtmlAttribute -Tag $sourceMatches[1].Value -Name 'srcset'
    $avifSizes = Get-HtmlAttribute -Tag $sourceMatches[0].Value -Name 'sizes'
    $webpSizes = Get-HtmlAttribute -Tag $sourceMatches[1].Value -Name 'sizes'
    if ([string]::IsNullOrWhiteSpace($avifSrcset) -or [string]::IsNullOrWhiteSpace($webpSrcset)) {
      throw "Managed picture sources require srcset: $relativeHtmlPath => $assetId"
    }
    if ([string]::IsNullOrWhiteSpace($avifSizes) -or $avifSizes -cne $webpSizes) {
      throw "Managed picture sources require one consistent sizes policy: $relativeHtmlPath => $assetId"
    }
    $avifCandidates = @(Get-SrcsetCandidates -Srcset $avifSrcset)
    $webpCandidates = @(Get-SrcsetCandidates -Srcset $webpSrcset)
    if ($avifCandidates.Count -gt 1 -or $webpCandidates.Count -gt 1) {
      $multiCandidatePictureCount++
    }
    $avifWidths = @($avifCandidates.Width | Sort-Object -Unique)
    $webpWidths = @($webpCandidates.Width | Sort-Object -Unique)
    if ($avifCandidates.Count -ne $avifWidths.Count -or $webpCandidates.Count -ne $webpWidths.Count) {
      throw "Managed picture srcset contains duplicate width descriptors: $relativeHtmlPath => $assetId"
    }
    if (($avifWidths -join ',') -cne ($webpWidths -join ',')) {
      throw "AVIF and WebP srcsets must expose identical widths: $relativeHtmlPath => $assetId"
    }

    foreach ($formatSet in @(
      @{ Extension = 'avif'; Candidates = $avifCandidates },
      @{ Extension = 'webp'; Candidates = $webpCandidates }
    )) {
      foreach ($candidate in $formatSet.Candidates) {
        $model = Get-RenderedUrlModel -Url $candidate.Url -Manifest $manifest -SiteRoot $siteRoot
        if ($model.Id -cne $assetId -or $model.Extension -cne $formatSet.Extension -or $model.IsSocial) {
          throw "Managed picture srcset mixes assets or formats: $relativeHtmlPath => $assetId"
        }
        if ($model.Width -ne $candidate.Width) {
          throw "Managed picture srcset descriptor differs from URL width: $relativeHtmlPath => $assetId"
        }
      }
    }

    $imgMatches = @([regex]::Matches($pictureHtml, '(?is)<img\b[^>]*>'))
    if ($imgMatches.Count -ne 1) {
      throw "Managed picture must contain exactly one img fallback: $relativeHtmlPath => $assetId"
    }
    $imgTag = $imgMatches[0].Value
    $imgSrc = Get-HtmlAttribute -Tag $imgTag -Name 'src'
    $imgSrcset = Get-HtmlAttribute -Tag $imgTag -Name 'srcset'
    $imgWidth = Get-HtmlAttribute -Tag $imgTag -Name 'width'
    $imgHeight = Get-HtmlAttribute -Tag $imgTag -Name 'height'
    $imgSizes = Get-HtmlAttribute -Tag $imgTag -Name 'sizes'
    $imgDecoding = Get-HtmlAttribute -Tag $imgTag -Name 'decoding'
    $imgLoading = Get-HtmlAttribute -Tag $imgTag -Name 'loading'
    $imgFetchPriority = Get-HtmlAttribute -Tag $imgTag -Name 'fetchpriority'
    if ([string]::IsNullOrWhiteSpace($imgSrc) -or [string]::IsNullOrWhiteSpace($imgSrcset) -or [string]::IsNullOrWhiteSpace($imgSizes) -or
      [string]::IsNullOrWhiteSpace($imgWidth) -or [string]::IsNullOrWhiteSpace($imgHeight)) {
      throw "Managed img fallback requires src, srcset, sizes, width, and height: $relativeHtmlPath => $assetId"
    }
    if ($imgSizes -cne $avifSizes) {
      throw "Managed picture sources and fallback must share one sizes policy: $relativeHtmlPath => $assetId"
    }
    $imgCandidates = @(Get-SrcsetCandidates -Srcset $imgSrcset)
    $imgWidths = @($imgCandidates.Width | Sort-Object -Unique)
    if (($imgWidths -join ',') -cne ($webpWidths -join ',')) {
      throw "Managed WebP source and img fallback must expose identical srcset widths: $relativeHtmlPath => $assetId"
    }
    foreach ($candidate in $imgCandidates) {
      $candidateModel = Get-RenderedUrlModel -Url $candidate.Url -Manifest $manifest -SiteRoot $siteRoot
      if ($candidateModel.Id -cne $assetId -or $candidateModel.Extension -cne 'webp' -or
        $candidateModel.IsSocial -or $candidateModel.Width -ne $candidate.Width) {
        throw "Managed img srcset mixes assets, formats, or width descriptors: $relativeHtmlPath => $assetId"
      }
    }
    if ($imgDecoding -cne 'async') {
      throw "Managed img fallback must use decoding=async: $relativeHtmlPath => $assetId"
    }
    if ($imgLoading -cnotin @('eager','lazy')) {
      throw "Managed img fallback must declare eager or lazy loading: $relativeHtmlPath => $assetId"
    }
    if ($imgLoading -ceq 'eager') {
      $eagerPictureCount++
      $documentEagerCount++
      if ($imgFetchPriority -cne 'high') {
        throw "Eager managed image must use fetchpriority=high: $relativeHtmlPath => $assetId"
      }
    }
    else {
      $lazyPictureCount++
      if ($imgFetchPriority -ceq 'high') {
        throw "Lazy managed image must not use fetchpriority=high: $relativeHtmlPath => $assetId"
      }
    }
    $fallbackModel = Get-RenderedUrlModel -Url $imgSrc -Manifest $manifest -SiteRoot $siteRoot
    if ($fallbackModel.Id -cne $assetId -or $fallbackModel.Extension -cne 'webp' -or $fallbackModel.IsSocial) {
      throw "Managed img fallback must be the same asset's WebP derivative: $relativeHtmlPath => $assetId"
    }
    $fallbackDimensions = Get-OipImageDimensions -Path $fallbackModel.FullPath
    if ([int]$imgWidth -ne [int]$fallbackDimensions.Width -or [int]$imgHeight -ne [int]$fallbackDimensions.Height) {
      throw "Managed img intrinsic dimensions differ from fallback file: $relativeHtmlPath => $assetId"
    }
  }

  if ($documentEagerCount -gt 1) {
    throw "A page may expose at most one high-priority LCP image: $relativeHtmlPath"
  }

  foreach ($lightboxMatch in [regex]::Matches($html, '(?is)\b(?:data-image|data-lightbox-src)=(?:"(?<dq>[^"]+)"|''(?<sq>[^'']+)''|(?<bare>[^\s>]+))')) {
    $lightboxUrl = $lightboxMatch.Groups['dq'].Value + $lightboxMatch.Groups['sq'].Value + $lightboxMatch.Groups['bare'].Value
    if ($lightboxUrl -notmatch '/images/rendered/') {
      continue
    }
    $lightboxModel = Get-RenderedUrlModel -Url $lightboxUrl -Manifest $manifest -SiteRoot $siteRoot
    if ($lightboxModel.Extension -cne 'webp' -or $lightboxModel.IsSocial -or $lightboxModel.Width -gt 1600) {
      throw "Managed lightbox must defer a maximum-1600px WebP: $relativeHtmlPath"
    }
    $managedLightboxCount++
  }

  if ($html -match '(?i)/images/medium/[^"''<>\s\)]+\.(?:png|gif)') {
    throw "Generated HTML retains a retired raw Medium PNG/GIF URL: $relativeHtmlPath"
  }
  if ($html -match '(?i)/images/syd-and-oliver/') {
    throw "Generated HTML retains a retired raw Syd-and-Oliver hero URL: $relativeHtmlPath"
  }

  $socialUrlMatches = @([regex]::Matches($html, '(?i)(?:https?://[^"''<>\s]+)?/images/rendered/(?:editorial/[a-z0-9-]+|essays/[a-z0-9/-]+|medium/[0-9a-f]{64})/[0-9a-f]{8,64}/social-[1-9][0-9]*w\.jpg'))
  if ($socialUrlMatches.Count -gt 0) {
    $uniqueSocialUrls = @($socialUrlMatches | ForEach-Object { Get-RenderedRelativePath -Url $_.Value } | Sort-Object -Unique)
    if ($uniqueSocialUrls.Count -ne 1) {
      throw "Open Graph, Twitter, and JSON-LD must share one social JPEG per page: $relativeHtmlPath"
    }
    $ogImageValues = [System.Collections.Generic.List[string]]::new()
    $twitterImageValues = [System.Collections.Generic.List[string]]::new()
    foreach ($metaMatch in [regex]::Matches($html, '(?is)<meta\b[^>]*>')) {
      $metaTag = $metaMatch.Value
      $property = Get-HtmlAttribute -Tag $metaTag -Name 'property'
      $name = Get-HtmlAttribute -Tag $metaTag -Name 'name'
      if ($property -ceq 'og:image') {
        $ogImageValues.Add([string](Get-HtmlAttribute -Tag $metaTag -Name 'content'))
      }
      if ($name -ceq 'twitter:image') {
        $twitterImageValues.Add([string](Get-HtmlAttribute -Tag $metaTag -Name 'content'))
      }
    }
    if ($ogImageValues.Count -ne 1 -or $twitterImageValues.Count -ne 1) {
      throw "Managed social pages require exactly one og:image and one twitter:image: $relativeHtmlPath"
    }
    $socialRelativePath = $uniqueSocialUrls[0]
    if ((Get-RenderedRelativePath -Url $ogImageValues[0]) -cne $socialRelativePath -or
      (Get-RenderedRelativePath -Url $twitterImageValues[0]) -cne $socialRelativePath) {
      throw "Open Graph and Twitter do not share the page's social JPEG: $relativeHtmlPath"
    }
    $jsonLdBlocks = @([regex]::Matches($html, '(?is)<script\b[^>]*type=(?:"application/ld\+json"|''application/ld\+json''|application/ld\+json)[^>]*>(?<json>.*?)</script>'))
    if ($jsonLdBlocks.Count -eq 0 -or -not ($jsonLdBlocks | Where-Object { $_.Groups['json'].Value.Contains('/' + $socialRelativePath, [System.StringComparison]::Ordinal) })) {
      throw "JSON-LD does not share the page's social JPEG: $relativeHtmlPath"
    }
    $socialModel = Get-RenderedUrlModel -Url ('/' + $uniqueSocialUrls[0]) -Manifest $manifest -SiteRoot $siteRoot
    if (-not $socialModel.IsSocial -or $socialModel.Extension -cne 'jpg' -or $socialModel.Width -gt $maxSocialWidth) {
      throw "Managed social metadata image violates the max-1200 JPEG contract: $relativeHtmlPath"
    }
    $managedSocialPageCount++
  }
}

foreach ($discoveryFile in $publicFiles | Where-Object { $_.Extension -in @('.xml','.json','.txt') }) {
  $discoveryText = Get-Content -LiteralPath $discoveryFile.FullName -Raw -Encoding utf8
  if ($discoveryText -match '(?i)/image-review(?:/|["''<\s])') {
    throw "Local image-review route leaked into production discovery output: $($discoveryFile.FullName.Substring($siteRoot.Length + 1).Replace('\','/'))"
  }
}

if ($managedPictureCount -eq 0) {
  throw 'Generated HTML contains no managed responsive <picture> elements.'
}
if ($multiCandidatePictureCount -eq 0) {
  throw 'Generated HTML contains no multi-width managed srcset.'
}
if ($eagerPictureCount -eq 0) {
  throw 'Generated HTML contains no eager, high-priority managed LCP image.'
}
if ($lazyPictureCount -eq 0) {
  throw 'Generated HTML contains no lazy managed body/card images.'
}
if ($managedLightboxCount -eq 0) {
  throw 'Generated HTML contains no deferred managed WebP lightbox target.'
}
if ($managedSocialPageCount -eq 0) {
  throw 'Generated HTML contains no managed shared social JPEG metadata.'
}

Write-Host "Responsive-image output contract passed: $($renderedFiles.Count) derivatives, $managedPictureCount managed pictures, $publicImageBytes public image bytes, $publicBytes total public bytes."
$global:LASTEXITCODE = 0
exit 0
