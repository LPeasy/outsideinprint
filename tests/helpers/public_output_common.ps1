Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRelativePath {
  param(
    [string]$RepoRoot,
    [string]$Path
  )

  $repoRootFull = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RepoRoot).Path)
  $pathFull = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path)
  $getRelativePath = [System.IO.Path].GetMethod('GetRelativePath', [Type[]]@([string], [string]))

  if ($null -ne $getRelativePath) {
    return ([System.IO.Path]::GetRelativePath($repoRootFull, $pathFull) -replace '\\', '/')
  }

  $repoRootUri = [System.Uri]($repoRootFull.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar)
  $pathUri = [System.Uri]$pathFull
  return ([System.Uri]::UnescapeDataString($repoRootUri.MakeRelativeUri($pathUri).ToString()) -replace '\\', '/')
}

function Get-StringSha256 {
  param([string]$Value)

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant())
  }
  finally {
    $sha.Dispose()
  }
}

function Get-ValidationSourceFiles {
  param([string]$RepoRoot)

  $files = New-Object System.Collections.Generic.List[string]

  foreach ($relativePath in @('hugo.toml')) {
    $fullPath = Join-Path $RepoRoot $relativePath
    if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
      $files.Add((Resolve-Path -LiteralPath $fullPath).Path)
    }
  }

  foreach ($relativeDir in @('assets', 'content', 'data', 'layouts', 'static')) {
    $fullDir = Join-Path $RepoRoot $relativeDir
    if (-not (Test-Path -LiteralPath $fullDir -PathType Container)) {
      continue
    }

    foreach ($file in @(Get-ChildItem -Path $fullDir -Recurse -File | Sort-Object FullName)) {
      $files.Add($file.FullName)
    }
  }

  return $files.ToArray()
}

function Get-SourceFingerprint {
  param([string]$RepoRoot)

  $records = New-Object System.Collections.Generic.List[string]
  foreach ($file in @(Get-ValidationSourceFiles -RepoRoot $RepoRoot)) {
    $relativePath = Get-RepoRelativePath -RepoRoot $RepoRoot -Path $file
    $hash = (Get-FileHash -Path $file -Algorithm SHA256).Hash.ToLowerInvariant()
    $records.Add(('{0}|{1}' -f $relativePath, $hash))
  }

  return Get-StringSha256 -Value ($records -join "`n")
}

function Get-PublicBuildManifestPath {
  param([string]$SiteDir)

  return (Join-Path $SiteDir '.oip-build-manifest.json')
}

function Resolve-PinnedHugo {
  param(
    [string]$RepoRoot,
    [string]$ExpectedVersion = '0.164.0'
  )

  $generatedHugo = Join-Path $RepoRoot 'tools\bin\generated\hugo.cmd'
  $hugoCommand = $null
  if ($env:OS -eq 'Windows_NT' -and (Test-Path -LiteralPath $generatedHugo -PathType Leaf)) {
    $hugoCommand = $generatedHugo
  }
  else {
    $resolvedHugo = Get-Command hugo -CommandType Application -ErrorAction SilentlyContinue
    if ($resolvedHugo) {
      $hugoCommand = $resolvedHugo.Source
    }
  }

  if ([string]::IsNullOrWhiteSpace($hugoCommand)) {
    throw 'Pinned Hugo command could not be resolved.'
  }

  $versionOutput = ((& $hugoCommand version 2>&1) | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Pinned Hugo version check failed through $hugoCommand."
  }
  if ($versionOutput -notmatch "^hugo v$([regex]::Escape($ExpectedVersion)).*\+extended") {
    throw "Expected Hugo Extended $ExpectedVersion, got: $versionOutput"
  }

  return [pscustomobject]@{
    Command = $hugoCommand
    Version = $versionOutput
  }
}

function Assert-GeneratedSiteHugoVersion {
  param(
    [string]$SiteDir,
    [string]$HugoVersion
  )

  $versionMatch = [regex]::Match($HugoVersion, '^hugo v(?<version>\d+\.\d+\.\d+)')
  if (-not $versionMatch.Success) {
    throw "Could not parse Hugo semantic version from: $HugoVersion"
  }

  $indexPath = Join-Path $SiteDir 'index.html'
  if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    throw "Generated homepage not found: $indexPath"
  }

  $indexHtml = Get-Content -LiteralPath $indexPath -Raw
  $generatorMatch = [regex]::Match($indexHtml, '<meta\s+name=(?:"generator"|generator)\s+content=(?:"Hugo (?<version>\d+\.\d+\.\d+)"|Hugo\s+(?<version>\d+\.\d+\.\d+))\s*/?>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if (-not $generatorMatch.Success) {
    throw "Generated homepage does not contain a parseable Hugo generator meta tag: $indexPath"
  }

  $expectedVersion = $versionMatch.Groups['version'].Value
  $generatedVersion = $generatorMatch.Groups['version'].Value
  if ($generatedVersion -ne $expectedVersion) {
    throw "Generated homepage was built by Hugo $generatedVersion, but the manifest command resolved Hugo $expectedVersion."
  }
}

function Write-PublicBuildManifest {
  param(
    [string]$RepoRoot,
    [string]$SiteDir,
    [string]$HugoVersion
  )

  if (-not (Test-Path -LiteralPath $SiteDir -PathType Container)) {
    throw "Site output directory not found: $SiteDir"
  }

  $manifestPath = Get-PublicBuildManifestPath -SiteDir $SiteDir
  $commitSha = (& git rev-parse HEAD 2>$null)
  if ($LASTEXITCODE -ne 0) {
    $commitSha = $null
  }

  if ([string]::IsNullOrWhiteSpace($HugoVersion)) {
    throw 'Pinned Hugo version is required for the public build manifest.'
  }
  Assert-GeneratedSiteHugoVersion -SiteDir $SiteDir -HugoVersion $HugoVersion

  $manifest = [ordered]@{
    schemaVersion = 1
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    sourceFingerprint = Get-SourceFingerprint -RepoRoot $RepoRoot
    commitSha = $commitSha
    hugoVersion = $HugoVersion
  }

  $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath
  return $manifestPath
}

function Test-PublicBuildFreshness {
  param(
    [string]$RepoRoot,
    [string]$SiteDir
  )

  if (-not (Test-Path -LiteralPath $SiteDir -PathType Container)) {
    return @{
      IsFresh = $false
      Reason = "site output directory not found: $SiteDir"
      ManifestPath = (Get-PublicBuildManifestPath -SiteDir $SiteDir)
    }
  }

  $manifestPath = Get-PublicBuildManifestPath -SiteDir $SiteDir
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    return @{
      IsFresh = $false
      Reason = "fresh-build manifest missing at $manifestPath"
      ManifestPath = $manifestPath
    }
  }

  try {
    $manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
  }
  catch {
    return @{
      IsFresh = $false
      Reason = "fresh-build manifest is unreadable at $manifestPath"
      ManifestPath = $manifestPath
    }
  }

  if ([int]$manifest.schemaVersion -ne 1) {
    return @{
      IsFresh = $false
      Reason = "fresh-build manifest schemaVersion is unsupported at $manifestPath"
      ManifestPath = $manifestPath
    }
  }

  try {
    $pinnedHugo = Resolve-PinnedHugo -RepoRoot $RepoRoot
    if ([string]$manifest.hugoVersion -ne [string]$pinnedHugo.Version) {
      return @{
        IsFresh = $false
        Reason = "fresh-build manifest Hugo version does not match the pinned Hugo command"
        ManifestPath = $manifestPath
      }
    }
    Assert-GeneratedSiteHugoVersion -SiteDir $SiteDir -HugoVersion ([string]$manifest.hugoVersion)
  }
  catch {
    return @{
      IsFresh = $false
      Reason = "generated-output Hugo binding failed: $($_.Exception.Message)"
      ManifestPath = $manifestPath
    }
  }

  $currentFingerprint = Get-SourceFingerprint -RepoRoot $RepoRoot
  if ([string]$manifest.sourceFingerprint -ne $currentFingerprint) {
    return @{
      IsFresh = $false
      Reason = "public/ does not match the current repo source fingerprint"
      ManifestPath = $manifestPath
    }
  }

  return @{
    IsFresh = $true
    Reason = "fresh build manifest matches current repo sources"
    ManifestPath = $manifestPath
  }
}
