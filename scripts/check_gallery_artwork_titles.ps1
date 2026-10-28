#requires -Version 7.0
[CmdletBinding()]
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$BaseRef = '',
  [string]$HeadRef = 'WORKTREE',
  [switch]$ConsistencyOnly,
  [string]$Clock = '',
  [string]$ReportPath = '',
  [switch]$PassThru
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/artwork_titles.ps1')
$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
$scratchRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-artwork-title-admission-' + [guid]::NewGuid().ToString('N'))
$readingRoots = @('content/essays', 'content/syd-and-oliver', 'content/reports', 'content/working-papers')

function Resolve-RequiredCommit([string]$Reference, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Reference) -or $Reference -match '^[-\s]' -or $Reference -match '^0+$') {
    throw "$Label must name a valid Git commit."
  }
  $result = @(& git -C $resolvedRoot rev-parse --verify --end-of-options ($Reference + '^{commit}') 2>$null)
  if ($LASTEXITCODE -ne 0 -or $result.Count -ne 1 -or [string]$result[0] -cnotmatch '^[0-9a-f]{40}$') {
    throw "$Label is not a valid Git commit: $Reference"
  }
  return [string]$result[0]
}

function New-SourceSnapshot([string]$Reference, [string]$Label) {
  if ($Reference -ceq 'WORKTREE') {
    return [pscustomobject]@{ Root = $resolvedRoot; Commit = 'WORKTREE' }
  }
  $commit = Resolve-RequiredCommit $Reference $Label
  $selected = @('data/image-assets.json', 'data/editorial_cartoons.yaml') + $readingRoots
  $existing = @(& git -C $resolvedRoot ls-tree --name-only $commit -- @selected)
  if ($LASTEXITCODE -ne 0) { throw "Cannot inspect $Label source inventory." }
  # ls-tree without -r returns only the selected roots, keeping command lines
  # bounded even when the archive contains hundreds of reading sources.
  $existing = @($existing | Where-Object { $_ -in $selected })
  $snapshotRoot = Join-Path $scratchRoot $Label
  [IO.Directory]::CreateDirectory($snapshotRoot) | Out-Null
  if ($existing.Count -gt 0) {
    $zipPath = Join-Path $scratchRoot ($Label + '.zip')
    & git -C $resolvedRoot archive --format=zip ("--output=$zipPath") $commit -- @existing
    if ($LASTEXITCODE -ne 0) { throw "Cannot read $Label source snapshot from $commit." }
    [IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $snapshotRoot)
  }
  return [pscustomobject]@{ Root = $snapshotRoot; Commit = $commit }
}

function Read-SourceManifest([string]$SnapshotRoot) {
  $path = Join-Path $SnapshotRoot 'data/image-assets.json'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return @{ assets = @{}; aliases = @{} } }
  $manifest = [IO.File]::ReadAllText($path) | ConvertFrom-Json -AsHashtable -Depth 30
  if (-not $manifest.Contains('assets') -or -not $manifest.Contains('aliases')) { throw 'Artwork title admission requires assets and aliases in the image manifest.' }
  return $manifest
}

function Get-OptionalValue($Object, [string]$Key) {
  if ($null -eq $Object) { return $null }
  if ($Object -is [Collections.IDictionary]) {
    if ($Object.Contains($Key)) { return $Object[$Key] }
  } elseif ($Object.PSObject.Properties.Name -contains $Key) { return $Object.$Key }
  return $null
}

function Test-HasArtworkTitle($Asset) {
  $value = Get-OptionalValue $Asset 'artwork_title'
  return $value -is [string] -and -not [string]::IsNullOrWhiteSpace($value)
}

function Get-ReleaseInstant([string]$Date, [string]$PublishDate) {
  $release = [datetimeoffset]::MinValue
  foreach ($value in @($Date, $PublishDate)) {
    if ([string]::IsNullOrWhiteSpace($value)) { continue }
    if ($value -match '^\d{4}-\d{2}-\d{2}$') {
      $calendar = [datetime]::ParseExact($value, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
      $zone = [TimeZoneInfo]::FindSystemTimeZoneById('America/New_York')
      $instant = [datetimeoffset]::new($calendar.Year, $calendar.Month, $calendar.Day, 0, 0, 0, $zone.GetUtcOffset($calendar))
    } else {
      $instant = [datetimeoffset]::Parse($value, [Globalization.CultureInfo]::InvariantCulture)
    }
    if ($instant -gt $release) { $release = $instant }
  }
  return $release
}

function Add-AdmissionError([string]$Code, [string]$Message) {
  $errors.Add([pscustomobject]@{ code = $Code; message = $Message })
}

function Test-SameClaim($Before, $After) {
  foreach ($key in @('AssetId', 'Route', 'Title', 'ArticleTitle', 'ShortTitle', 'Date', 'PublishDate', 'SourceHash')) {
    if ([string](Get-OptionalValue $Before $key) -cne [string](Get-OptionalValue $After $key)) { return $false }
  }
  return $true
}

function Get-ClaimKey($Claim) {
  $slug = [string](Get-OptionalValue $Claim 'ExplicitSlug')
  if ($slug) { return 'gallery:' + $slug }
  return 'article:' + [string](Get-OptionalValue $Claim 'Route')
}

function ConvertTo-CanonicalArtworkRoute([string]$Route) {
  if ([string]::IsNullOrWhiteSpace($Route)) { return '' }
  $uri = [uri]::new([uri]'https://outsideinprint.org/', $Route)
  return '/' + $uri.AbsolutePath.Trim('/') + '/'
}

function Get-AdmissionClaims([string]$SnapshotRoot, [Collections.IDictionary]$Manifest) {
  $records = @(Get-OipArtworkSourceRecords -Root $SnapshotRoot -Manifest $Manifest)
  $byRoute = @{}
  foreach ($record in $records) {
    $route = ConvertTo-CanonicalArtworkRoute ([string](Get-OptionalValue $record 'Route'))
    if ($route) { $byRoute[$route] = $record }
    if (-not [bool](Get-OptionalValue $record 'PublicEligible')) { continue }
    $assetId = [string](Get-OptionalValue $record 'AssetId')
    if (-not $assetId -or -not $Manifest.assets.Contains($assetId)) { continue }
    $asset = $Manifest.assets[$assetId]
    if ([string]$asset.image_class -notin @('editorial_cartoon', 'essay_illustration')) { continue }
    $short = [string](Get-OptionalValue $record 'ShortTitle')
    $title = [string](Get-OptionalValue $record 'ArticleTitle')
    [pscustomobject]@{
      AssetId=$assetId; Route=$route; Title=$(if ($short) { $short } else { $title })
      ArticleTitle=$title; ShortTitle=$short; SourcePath=[string](Get-OptionalValue $record 'SourcePath')
      Date=[string](Get-OptionalValue $record 'Date'); PublishDate=[string](Get-OptionalValue $record 'PublishDate')
      ExplicitSlug=''; SourceHash=[string]$asset.sha256
    }
  }
  $galleryPath = Join-Path $SnapshotRoot 'data/editorial_cartoons.yaml'
  if (-not (Test-Path -LiteralPath $galleryPath -PathType Leaf)) { return }
  foreach ($row in @(Read-OipArtworkGallery -Text ([IO.File]::ReadAllText($galleryPath)))) {
    $assetId = [string](Resolve-OipArtworkAssetId -Reference ([string](Get-OptionalValue $row 'image')) -Manifest $Manifest)
    $route = ConvertTo-CanonicalArtworkRoute ([string](Get-OptionalValue $row 'essay'))
    $article = if ($route -and $byRoute.ContainsKey($route)) { $byRoute[$route] } else { $null }
    $asset = if ($assetId -and $Manifest.assets.Contains($assetId)) { $Manifest.assets[$assetId] } else { $null }
    [pscustomobject]@{
      AssetId=$assetId; Route=$route; Title=[string](Get-OptionalValue $row 'title')
      ArticleTitle=[string](Get-OptionalValue $article 'ArticleTitle'); ShortTitle=[string](Get-OptionalValue $article 'ShortTitle')
      SourcePath=[string](Get-OptionalValue $article 'SourcePath'); Date=[string](Get-OptionalValue $row 'date')
      PublishDate=[string](Get-OptionalValue $row 'publishDate'); ExplicitSlug=[string](Get-OptionalValue $row 'slug')
      SourceHash=[string](Get-OptionalValue $asset 'sha256')
    }
  }
}

$errors = [Collections.Generic.List[object]]::new()
$admitted = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$queuedMissing = [Collections.Generic.List[object]]::new()
$clockInstant = if ($Clock) { [datetimeoffset]::Parse($Clock, [Globalization.CultureInfo]::InvariantCulture) } else { [datetimeoffset]::UtcNow }

try {
  if ($ConsistencyOnly -and $BaseRef) { throw 'Choose BaseRef/HeadRef admission or -ConsistencyOnly, not both.' }
  if (-not $ConsistencyOnly -and -not $BaseRef) { throw 'Artwork title admission requires BaseRef; use -ConsistencyOnly only for a legitimate full/daily consistency check.' }
  if ($ConsistencyOnly -and $env:GITHUB_EVENT_NAME -in @('pull_request', 'push')) {
    throw 'Publication events require the actual Git comparison base; consistency mode cannot bypass admission.'
  }
  if ($BaseRef -ceq 'WORKTREE') { throw 'BaseRef must be an immutable Git commit, not WORKTREE.' }
  $headSnapshot = New-SourceSnapshot $HeadRef 'head'
  $headManifest = Read-SourceManifest $headSnapshot.Root
  foreach ($assetId in $headManifest.assets.Keys) {
    $asset = $headManifest.assets[$assetId]
    if ($asset.Contains('artwork_title')) {
      try { Assert-OipArtworkTitle -Value $asset.artwork_title -Context "Asset '$assetId' artwork_title" }
      catch { throw ('ARTWORK-TITLE-INVALID: ' + $_.Exception.Message) }
    }
  }
  $headClaims = @(Get-AdmissionClaims -SnapshotRoot $headSnapshot.Root -Manifest $headManifest)
  $headEffectiveClaims = @(Get-OipArtworkTitleClaims -Root $headSnapshot.Root -Manifest $headManifest)
  $baseClaims = @()
  $baseManifest = @{ assets = @{}; aliases = @{} }
  $baseCommit = ''
  if (-not $ConsistencyOnly) {
    $baseSnapshot = New-SourceSnapshot $BaseRef 'base'
    $baseCommit = $baseSnapshot.Commit
    $baseManifest = Read-SourceManifest $baseSnapshot.Root
    $baseClaims = @(Get-AdmissionClaims -SnapshotRoot $baseSnapshot.Root -Manifest $baseManifest)
  }

  # The remainder compares source claims, not prose-audit target lists. Legacy
  # exemptions therefore cannot hide a new image, alias target, or Gallery row.
  $beforeByKey = @{}
  foreach ($claim in $baseClaims) { $beforeByKey[(Get-ClaimKey $claim)] = $claim }
  foreach ($claim in $headClaims) {
    $key = Get-ClaimKey $claim
    $assetId = [string](Get-OptionalValue $claim 'AssetId')
    $asset = if ($assetId -and $headManifest.assets.Contains($assetId)) { $headManifest.assets[$assetId] } else { $null }
    $changed = -not $ConsistencyOnly -and (-not $beforeByKey.ContainsKey($key) -or -not (Test-SameClaim $beforeByKey[$key] $claim))
    if (-not $ConsistencyOnly -and $beforeByKey.ContainsKey($key)) {
      $oldAssetId = [string](Get-OptionalValue $beforeByKey[$key] 'AssetId')
      $baseAsset = if ($oldAssetId -and $baseManifest.assets.Contains($oldAssetId)) { $baseManifest.assets[$oldAssetId] } else { $null }
      if ([string](Get-OptionalValue $baseAsset 'sha256') -cne [string](Get-OptionalValue $asset 'sha256')) { $changed = $true }
    }
    if ($changed) { [void]$admitted.Add($key) }
    $release = Get-ReleaseInstant ([string](Get-OptionalValue $claim 'Date')) ([string](Get-OptionalValue $claim 'PublishDate'))
    if ($release -gt $clockInstant -and -not (Test-HasArtworkTitle $asset)) {
      $queuedMissing.Add([pscustomobject]@{ key = $key; assetId = $assetId; release = $release.ToString('o') })
      Add-AdmissionError 'ARTWORK-TITLE-QUEUE' "Future queued artwork '$assetId' requires a canonical artwork_title ($key)."
    }
    if ($changed -and -not (Test-HasArtworkTitle $asset)) {
      Add-AdmissionError 'ARTWORK-TITLE-MISSING' "New or changed publication artwork '$assetId' requires a canonical artwork_title ($key)."
    }
  }

  if (-not $ConsistencyOnly) {
    foreach ($assetId in $baseManifest.assets.Keys) {
      $before = $baseManifest.assets[$assetId]
      if (-not (Test-HasArtworkTitle $before)) { continue }
      $after = if ($headManifest.assets.Contains($assetId)) { $headManifest.assets[$assetId] } else { $null }
      if (-not (Test-HasArtworkTitle $after)) {
        Add-AdmissionError 'ARTWORK-TITLE-REMOVED' "Established artwork_title cannot disappear from '$assetId'."
      }
    }
  }

  # Canonical names are validated and reserved even when an asset has not yet
  # reached the public Gallery. Reusing its canonical ID is one artwork claim.
  $names = @{}
  foreach ($assetId in $headManifest.assets.Keys) {
    $asset = $headManifest.assets[$assetId]
    if (-not $asset.Contains('artwork_title')) { continue }
    $nameKey = ConvertTo-OipArtworkTitleKey -Value $asset.artwork_title
    if (-not $names.ContainsKey($nameKey)) { $names[$nameKey] = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal) }
    [void]$names[$nameKey].Add([string]$assetId)
  }
  foreach ($claim in $headEffectiveClaims) {
    $assetId = [string](Get-OptionalValue $claim 'AssetId')
    if (-not $assetId) { continue }
    $asset = if ($headManifest.assets.Contains($assetId)) { $headManifest.assets[$assetId] } else { $null }
    $effectiveName = if (Test-HasArtworkTitle $asset) { [string]$asset.artwork_title } else { [string](Get-OptionalValue $claim 'Title') }
    if ($effectiveName) {
      $nameKey = ConvertTo-OipArtworkTitleKey -Value $effectiveName
      if (-not $names.ContainsKey($nameKey)) { $names[$nameKey] = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal) }
      [void]$names[$nameKey].Add($assetId)
    }
  }
  foreach ($claim in $headClaims) {
    $assetId = [string](Get-OptionalValue $claim 'AssetId')
    if (-not $assetId) { continue }
    $asset = if ($headManifest.assets.Contains($assetId)) { $headManifest.assets[$assetId] } else { $null }
    if (-not (Test-HasArtworkTitle $asset)) { continue }
    $canonicalKey = ConvertTo-OipArtworkTitleKey -Value $asset.artwork_title
    foreach ($field in @('ArticleTitle', 'ShortTitle')) {
      $headline = [string](Get-OptionalValue $claim $field)
      if ($headline -and $canonicalKey -ceq (ConvertTo-OipArtworkTitleKey -Value $headline)) {
        Add-AdmissionError 'ARTWORK-TITLE-COPIED' "Artwork '$assetId' copies its associated $field '$headline'."
      }
    }
    if ([string](Get-OptionalValue $claim 'ExplicitSlug') -and [string](Get-OptionalValue $claim 'Title') -cne [string]$asset.artwork_title) {
      Add-AdmissionError 'ARTWORK-TITLE-CONFLICT' "Gallery row '$([string](Get-OptionalValue $claim 'ExplicitSlug'))' must retain canonical artwork title '$($asset.artwork_title)'."
    }
  }
  foreach ($nameKey in $names.Keys) {
    if ($names[$nameKey].Count -lt 2) { continue }
    $modernOwners = @($names[$nameKey] | Where-Object { $headManifest.assets.Contains($_) -and (Test-HasArtworkTitle $headManifest.assets[$_]) })
    if ($modernOwners.Count -gt 0) {
      Add-AdmissionError 'ARTWORK-TITLE-DUPLICATE' "Artwork title key '$nameKey' is claimed by distinct assets: $(@($names[$nameKey] | Sort-Object) -join ', ')."
    }
  }

  $result = [ordered]@{
    status = $(if ($errors.Count) { 'FAIL' } else { 'PASS' })
    mode = $(if ($ConsistencyOnly) { 'consistency' } else { 'admission' })
    baseCommit = $baseCommit
    headCommit = $headSnapshot.Commit
    checkedAtUtc = $clockInstant.ToString('o')
    sourceClaimCount = $headClaims.Count
    admittedClaimCount = $admitted.Count
    futureQueueMissingTitles = $queuedMissing.ToArray()
    errors = $errors.ToArray()
  }
  if ($ReportPath) {
    $reportParent = Split-Path -Parent ([IO.Path]::GetFullPath($ReportPath))
    [IO.Directory]::CreateDirectory($reportParent) | Out-Null
    [IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath), (($result | ConvertTo-Json -Depth 10) + "`n"), [Text.UTF8Encoding]::new($false))
  }
  if ($PassThru) { [pscustomobject]$result }
  if ($errors.Count) { throw ("Gallery artwork title contract failed:`n" + (($errors | ForEach-Object { "$($_.code): $($_.message)" }) -join "`n")) }
  Write-Host "Gallery artwork title contract passed: $($headClaims.Count) source claims; $($admitted.Count) admitted or changed; mode $($result.mode)."
  $global:LASTEXITCODE = 0
} finally {
  if (Test-Path -LiteralPath $scratchRoot) {
    $absoluteScratch = [IO.Path]::GetFullPath($scratchRoot)
    $allowedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $absoluteScratch.StartsWith($allowedParent, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($absoluteScratch) -notmatch '^oip-artwork-title-admission-[0-9a-f]{32}$') {
      throw 'Refusing to remove an unexpected artwork-title snapshot directory.'
    }
    Remove-Item -LiteralPath $absoluteScratch -Recurse -Force
  }
}
