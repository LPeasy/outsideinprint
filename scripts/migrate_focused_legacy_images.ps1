#requires -Version 7.0
[CmdletBinding()]
param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$Write,
  [switch]$Json,
  [int]$TestFailureAfterOperation = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
. (Join-Path $PSScriptRoot 'lib\image_asset_manifest.ps1')

$Expected = [ordered]@{
  baseline_medium_files = 471
  referenced_medium_files = 421
  migrated_medium_pngs = 105
  retained_medium_jpeg_jpg = 316
  removed_medium_orphans = 50
  migrated_syd_heroes = 4
  filename_hash_mismatches = 15
  post_manifest_assets = 459
  post_manifest_aliases = 500
}
$ExpectedMediumInventorySha256 = '851880a2e59635b660a6192385dff6cbb0eb73d3b8b3d5f747c6e730c6302c5a'
$ExpectedSydInventorySha256 = 'c53d8f9db266f5cba29cb4fd400a0dd72263e6eb492e706b2d1aedd07c0bd21e'
$InventoryDigestBasis = 'sorted_path_tab_actual_sha256_lf_utf8_no_bom'
$RewrittenContentSha256Basis = Get-OipPortableTextSha256Basis
$ReportRelativePath = 'reports/legacy-image-focused-cleanup-inventory.json'
$ReportPath = Join-Path $Root $ReportRelativePath
$StrictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$Utf8WithBom = [System.Text.UTF8Encoding]::new($true)
if ($TestFailureAfterOperation -lt 0 -or ($TestFailureAfterOperation -gt 0 -and -not $Write)) {
  throw '-TestFailureAfterOperation must be zero or a positive integer used together with -Write.'
}

function Invoke-OipGitText {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'git'
  $startInfo.WorkingDirectory = $Root
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.StandardOutputEncoding = $Utf8NoBom
  $startInfo.StandardErrorEncoding = $Utf8NoBom
  foreach ($argument in $Arguments) {
    $null = $startInfo.ArgumentList.Add($argument)
  }

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $null = $process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "git $($Arguments -join ' ') failed: $($stderr.Trim())"
  }
  return $stdout
}

function Get-OipGitPaths {
  param([Parameter(Mandatory = $true)][string[]]$PathSpecs)

  $arguments = [Collections.Generic.List[string]]::new()
  foreach ($argument in @('-c', 'core.quotepath=false', 'ls-files', '-z', '--')) {
    $arguments.Add($argument)
  }
  foreach ($pathSpec in $PathSpecs) {
    $arguments.Add($pathSpec)
  }

  $raw = Invoke-OipGitText -Arguments $arguments.ToArray()
  return @(
    $raw.Split([char]0, [StringSplitOptions]::RemoveEmptyEntries) |
      ForEach-Object { $_.Replace('\', '/') } |
      Sort-Object -Unique
  )
}

function Get-OipFullPath {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  return [IO.Path]::GetFullPath((Join-Path $Root $RelativePath.Replace('/', [IO.Path]::DirectorySeparatorChar)))
}

function Get-OipExistingGitPaths {
  param([Parameter(Mandatory = $true)][string[]]$PathSpecs)

  return @(
    Get-OipGitPaths -PathSpecs $PathSpecs |
      Where-Object { [IO.File]::Exists((Get-OipFullPath -RelativePath $_)) }
  )
}

function Read-OipUtf8File {
  param([Parameter(Mandatory = $true)][string]$Path)

  $bytes = [IO.File]::ReadAllBytes($Path)
  $hasBom = (
    $bytes.Length -ge 3 -and
    $bytes[0] -eq 0xef -and $bytes[1] -eq 0xbb -and $bytes[2] -eq 0xbf
  )
  try {
    if ($hasBom) {
      return $StrictUtf8.GetString($bytes, 3, $bytes.Length - 3)
    }
    return $StrictUtf8.GetString($bytes)
  }
  catch {
    throw "Text input is not valid UTF-8: $Path"
  }
}

function Test-OipUtf8Bom {
  param([Parameter(Mandatory = $true)][string]$Path)

  $bytes = [IO.File]::ReadAllBytes($Path)
  return (
    $bytes.Length -ge 3 -and
    $bytes[0] -eq 0xef -and $bytes[1] -eq 0xbb -and $bytes[2] -eq 0xbf
  )
}

function Get-OipEncodedTextBytes {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [switch]$WithBom
  )

  if (-not $WithBom) {
    return $Utf8NoBom.GetBytes($Text)
  }
  $preamble = $Utf8WithBom.GetPreamble()
  $body = $Utf8NoBom.GetBytes($Text)
  $bytes = [byte[]]::new($preamble.Length + $body.Length)
  [Array]::Copy($preamble, 0, $bytes, 0, $preamble.Length)
  [Array]::Copy($body, 0, $bytes, $preamble.Length, $body.Length)
  return $bytes
}

function Get-OipRawFileHash {
  param([Parameter(Mandatory = $true)][string]$Path)

  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-OipInventoryDigest {
  param([Parameter(Mandatory = $true)][object[]]$Rows)

  $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $lines = [Collections.Generic.List[string]]::new()
  foreach ($row in $Rows) {
    $path = if ($row -is [Collections.IDictionary] -and $row.Contains('path')) {
      [string]$row.path
    }
    else {
      [string]$row.legacy_path
    }
    $sha256 = [string]$row.sha256
    if ([string]::IsNullOrWhiteSpace($path) -or $path.Contains("`t") -or $path.Contains("`r") -or $path.Contains("`n") -or
      $sha256 -cnotmatch '^[0-9a-f]{64}$' -or -not $paths.Add($path)) {
      throw "Inventory digest row has an invalid or duplicate path/SHA: $path"
    }
    $lines.Add($path + "`t" + $sha256)
  }
  $lines.Sort([StringComparer]::Ordinal)
  $text = ([string]::Join("`n", $lines)) + "`n"
  return Get-OipSha256ForBytes -Bytes $Utf8NoBom.GetBytes($text)
}

function Get-OipOccurrences {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $count = 0
  $offset = 0
  while (($offset = $Text.IndexOf($Value, $offset, [StringComparison]::Ordinal)) -ge 0) {
    $count++
    $offset += $Value.Length
  }
  return $count
}

function Get-OipReferenceTexts {
  $paths = Get-OipExistingGitPaths -PathSpecs @('content')
  $texts = [ordered]@{}
  foreach ($relativePath in $paths) {
    if ([IO.Path]::GetExtension($relativePath).ToLowerInvariant() -eq '.md') {
      $texts[$relativePath] = Read-OipUtf8File -Path (Get-OipFullPath -RelativePath $relativePath)
    }
  }
  return $texts
}

function Get-OipRuntimeTextPaths {
  $extensions = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($extension in @(
    '.md', '.html', '.htm', '.yaml', '.yml', '.json', '.toml', '.xml', '.txt', '.csv',
    '.css', '.scss', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.ps1', '.psm1', '.psd1',
    '.py', '.cmd', '.bat', '.sh', '.svg', '.typ', '.gitattributes', '.gitignore', '.gitkeep', '.nvmrc'
  )) {
    $null = $extensions.Add($extension)
  }

  # docs/ and reports/ are deliberately excluded because they preserve historical
  # paths as audit evidence, not runtime consumers. The image manifest is likewise
  # excluded because its aliases are retired-path resolver history. Every other
  # tracked text file is treated as executable, configured, tested, or publishable
  # source and therefore blocks orphan removal when it names an exact raw URL.
  $paths = @(Get-OipExistingGitPaths -PathSpecs @('.'))
  return @(
    $paths |
      Where-Object {
        $extensions.Contains([IO.Path]::GetExtension($_)) -and
        $_ -ne 'data/image-assets.json' -and
        -not $_.StartsWith('docs/', [StringComparison]::Ordinal) -and
        -not $_.StartsWith('reports/', [StringComparison]::Ordinal)
      } |
      Sort-Object -Unique
  )
}

function Get-OipImageRecord {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$PublicAlias,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Consumers
  )

  $fullPath = Get-OipFullPath -RelativePath $RelativePath
  $hash = Get-OipRawFileHash -Path $fullPath
  $file = [IO.FileInfo]::new($fullPath)
  $extension = [IO.Path]::GetExtension($RelativePath).ToLowerInvariant()
  $dimensions = if ($extension -in @('.png', '.jpg', '.jpeg')) {
    Get-OipImageNativeDimensions -Path $fullPath
  }
  else {
    [pscustomobject]@{ Width = 0; Height = 0 }
  }
  $stem = [IO.Path]::GetFileNameWithoutExtension($RelativePath)
  return [ordered]@{
    legacy_path = $RelativePath
    public_alias = $PublicAlias
    sha256 = $hash
    width = [int]$dimensions.Width
    height = [int]$dimensions.Height
    bytes = [int64]$file.Length
    extension = $extension
    filename_hash_match = ($stem -ceq $hash)
    consumers = @($Consumers | Sort-Object -Unique)
  }
}

function Get-OipFrontMatterLength {
  param([Parameter(Mandatory = $true)][string]$Text)

  $match = [regex]::Match($Text, '\A---(?:\r?\n)(?:.|\r|\n)*?(?:\r?\n)---(?:\r?\n)', [Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) {
    return $match.Length
  }
  return 0
}

function New-OipMigratedText {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][System.Collections.IDictionary[]]$Migrations
  )

  $frontMatterLength = Get-OipFrontMatterLength -Text $Text
  $frontMatter = if ($frontMatterLength -gt 0) { $Text.Substring(0, $frontMatterLength) } else { '' }
  $body = $Text.Substring($frontMatterLength)
  foreach ($migration in $Migrations) {
    $alias = [string]$migration.public_alias
    $assetId = [string]$migration.asset_id
    $frontMatter = $frontMatter.Replace($alias, $assetId, [StringComparison]::Ordinal)
    $body = $body.Replace($alias, "oip-image:$assetId", [StringComparison]::Ordinal)
  }
  return $frontMatter + $body
}

function Assert-OipCounts {
  param([Parameter(Mandatory = $true)][System.Collections.IDictionary]$Actual)

  foreach ($key in $Expected.Keys) {
    if ($Actual.Contains($key) -and [int]$Actual[$key] -ne [int]$Expected[$key]) {
      throw "Focused legacy image inventory drifted at '$key': expected $($Expected[$key]), found $($Actual[$key])."
    }
  }
}

function Remove-OipTransactionDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not [IO.Directory]::Exists($Path)) {
    return
  }
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  $resolved = [IO.Path]::GetFullPath($Path)
  if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'oip-legacy-image-*') {
    throw "Refusing to remove unexpected transaction directory: $resolved"
  }
  [IO.Directory]::Delete($resolved, $true)
}

function Remove-OipEmptySydDirectories {
  foreach ($relativePath in @(
    'static/images/syd-and-oliver/bobanonymous'
    'static/images/syd-and-oliver/broke-rich'
    'static/images/syd-and-oliver/infinite-incontent'
    'static/images/syd-and-oliver/pressure-makes-pearls'
  )) {
    $directory = Get-OipFullPath -RelativePath $relativePath
    if ([IO.Directory]::Exists($directory) -and [IO.Directory]::GetFileSystemEntries($directory).Count -eq 0) {
      [IO.Directory]::Delete($directory, $false)
    }
  }
  $sydRoot = Get-OipFullPath -RelativePath 'static/images/syd-and-oliver'
  if ([IO.Directory]::Exists($sydRoot) -and [IO.Directory]::GetFileSystemEntries($sydRoot).Count -eq 0) {
    [IO.Directory]::Delete($sydRoot, $false)
  }
}

function Get-OipResultFromReport {
  param([Parameter(Mandatory = $true)][System.Collections.IDictionary]$Report)

  $reportedMediumDigest = Get-OipInventoryDigest -Rows @(
    @($Report.medium_migrations) + @($Report.retained_medium_files) + @($Report.removed_orphans)
  )
  $reportedSydDigest = Get-OipInventoryDigest -Rows @($Report.syd_migrations)
  if ([string]$Report.baseline.inventory_digest_basis -cne $InventoryDigestBasis -or
    [string]$Report.rewritten_content_sha256_basis -cne $RewrittenContentSha256Basis -or
    [string]$Report.baseline.medium_inventory_sha256 -cne $ExpectedMediumInventorySha256 -or
    [string]$Report.baseline.syd_inventory_sha256 -cne $ExpectedSydInventorySha256 -or
    $reportedMediumDigest -cne $ExpectedMediumInventorySha256 -or
    $reportedSydDigest -cne $ExpectedSydInventorySha256) {
    throw 'Completed migration report does not bind the exact frozen Medium and Syd path/actual-SHA inventories.'
  }

  $result = [ordered]@{
    mode = if ($Write) { 'already_applied' } else { 'verify_applied' }
    baseline_commit = [string]$Report.baseline_commit
    baseline_medium_files = [int]$Report.baseline.medium_files
    referenced_medium_files = [int]$Report.baseline.referenced_medium_files
    migrated_medium_pngs = @($Report.medium_migrations).Count
    retained_medium_jpeg_jpg = @($Report.retained_medium_files).Count
    removed_medium_orphans = @($Report.removed_orphans).Count
    migrated_syd_heroes = @($Report.syd_migrations).Count
    filename_hash_mismatches = @($Report.medium_migrations | Where-Object { -not [bool]$_.filename_hash_match }).Count
    long_paths_over_260 = [int]$Report.baseline.long_paths_over_260
    medium_inventory_sha256 = [string]$Report.baseline.medium_inventory_sha256
    syd_inventory_sha256 = [string]$Report.baseline.syd_inventory_sha256
    post_manifest_assets = [int]$Report.result.manifest_assets
    post_manifest_aliases = [int]$Report.result.manifest_aliases
    migrated_source_bytes = [int64]$Report.result.migrated_source_bytes
    removed_orphan_bytes = [int64]$Report.result.removed_orphan_bytes
    modified_reference_files = @($Report.modified_reference_files).Count
    report = $ReportRelativePath
  }
  Assert-OipCounts -Actual $result
  return [pscustomobject]$result
}

function Test-OipCompletedMigration {
  $mediumFiles = @(Get-OipExistingGitPaths -PathSpecs @('static/images/medium'))
  $sydFiles = @(Get-OipExistingGitPaths -PathSpecs @('static/images/syd-and-oliver'))
  if ($mediumFiles.Count -ne $Expected.retained_medium_jpeg_jpg -or $sydFiles.Count -ne 0 -or -not [IO.File]::Exists($ReportPath)) {
    return $null
  }

  $report = (Read-OipUtf8File -Path $ReportPath) | ConvertFrom-Json -AsHashtable
  if ([string]$report.schema_version -ne '1.1' -or [string]$report.action_id -ne 'WEB-LEGACY-IMAGE-CLEANUP-001-R2' -or
    [string]$report.rewritten_content_sha256_basis -cne $RewrittenContentSha256Basis) {
    throw "Unsupported focused legacy image migration report: $ReportPath"
  }

  $manifest = Read-OipImageAssetManifest -Root $Root
  if ($manifest.assets.Count -ne $Expected.post_manifest_assets -or $manifest.aliases.Count -ne $Expected.post_manifest_aliases) {
    throw "Completed migration manifest count mismatch: assets=$($manifest.assets.Count), aliases=$($manifest.aliases.Count)."
  }

  $actualRetained = @($mediumFiles | Sort-Object)
  $reportedRetained = @($report.retained_medium_files | ForEach-Object { [string]$_.path } | Sort-Object)
  if ([string]::Join("`n", $actualRetained) -cne [string]::Join("`n", $reportedRetained)) {
    throw 'The retained Medium JPEG/JPG inventory differs from the frozen migration report.'
  }

  foreach ($item in @($report.retained_medium_files)) {
    $path = Get-OipFullPath -RelativePath ([string]$item.path)
    if (-not [IO.File]::Exists($path) -or (Get-OipRawFileHash -Path $path) -cne [string]$item.sha256) {
      throw "Retained Medium file differs from the frozen migration report: $($item.path)"
    }
  }
  foreach ($item in @($report.modified_reference_files)) {
    $path = Get-OipFullPath -RelativePath ([string]$item.path)
    if (-not [IO.File]::Exists($path) -or
      (Get-OipPortableTextFileSha256 -Path $path -Label "Rewritten content '$($item.path)'") -cne [string]$item.after_sha256) {
      throw "Rewritten-content portable hash differs from the frozen migration report: $($item.path)"
    }
  }
  foreach ($item in @($report.removed_orphans) + @($report.medium_migrations) + @($report.syd_migrations)) {
    if ([IO.File]::Exists((Get-OipFullPath -RelativePath ([string]$item.legacy_path)))) {
      throw "Retired legacy image remains after migration: $($item.legacy_path)"
    }
  }
  foreach ($item in @($report.medium_migrations) + @($report.syd_migrations)) {
    $assetId = [string]$item.asset_id
    if (-not $manifest.assets.Contains($assetId)) {
      throw "Migrated asset is missing from the manifest: $assetId"
    }
    $entry = $manifest.assets[$assetId]
    if ([string]$entry.sha256 -cne [string]$item.sha256 -or [string]$manifest.aliases[[string]$item.public_alias] -cne $assetId) {
      throw "Migrated asset or alias differs from the frozen report: $assetId"
    }
    $sourcePath = Get-OipFullPath -RelativePath ('assets/' + [string]$entry.source)
    if (-not [IO.File]::Exists($sourcePath) -or (Get-OipRawFileHash -Path $sourcePath) -cne [string]$item.sha256) {
      throw "Migrated managed original differs from the frozen report: $assetId"
    }
  }

  $runtimeTexts = [ordered]@{}
  foreach ($relativePath in Get-OipRuntimeTextPaths) {
    $runtimeTexts[$relativePath] = Read-OipUtf8File -Path (Get-OipFullPath -RelativePath $relativePath)
  }
  foreach ($item in @($report.medium_migrations) + @($report.syd_migrations) + @($report.removed_orphans)) {
    $alias = if ($item.Contains('public_alias')) { [string]$item.public_alias } else { '/' + ([string]$item.legacy_path).Substring('static/'.Length) }
    foreach ($relativePath in $runtimeTexts.Keys) {
      if ($runtimeTexts[$relativePath].Contains($alias, [StringComparison]::Ordinal)) {
        throw "Retired legacy image is still referenced by runtime source '$relativePath': $alias"
      }
    }
  }

  return Get-OipResultFromReport -Report $report
}

$completed = Test-OipCompletedMigration
if ($null -ne $completed) {
  if ($TestFailureAfterOperation -gt 0) {
    throw '-TestFailureAfterOperation requires an unmigrated baseline fixture.'
  }
  if ($Write) {
    Remove-OipEmptySydDirectories
  }
  if ($Json) {
    $completed | ConvertTo-Json -Depth 8
  }
  else {
    $completed
  }
  exit 0
}

$mediumFiles = @(Get-OipExistingGitPaths -PathSpecs @('static/images/medium'))
$sydFiles = @(Get-OipExistingGitPaths -PathSpecs @('static/images/syd-and-oliver'))
if ($mediumFiles.Count -ne $Expected.baseline_medium_files -or $sydFiles.Count -ne $Expected.migrated_syd_heroes) {
  throw "Focused legacy image migration is neither at its verified baseline nor its completed state: Medium=$($mediumFiles.Count), Syd=$($sydFiles.Count)."
}

$referenceTexts = Get-OipReferenceTexts
$mediumRows = [Collections.Generic.List[System.Collections.IDictionary]]::new()
foreach ($relativePath in $mediumFiles) {
  $publicAlias = '/' + $relativePath.Substring('static/'.Length)
  $consumers = @(
    $referenceTexts.Keys |
      Where-Object { $referenceTexts[$_].Contains($publicAlias, [StringComparison]::Ordinal) } |
      Sort-Object
  )
  $mediumRows.Add((Get-OipImageRecord -RelativePath $relativePath -PublicAlias $publicAlias -Consumers $consumers))
}
$mediumInventorySha256 = Get-OipInventoryDigest -Rows @($mediumRows)
if ($mediumInventorySha256 -cne $ExpectedMediumInventorySha256) {
  throw "Focused legacy Medium inventory digest drifted: expected $ExpectedMediumInventorySha256, found $mediumInventorySha256."
}

$referenced = @($mediumRows | Where-Object { @($_.consumers).Count -gt 0 })
$mediumMigrations = @($referenced | Where-Object { $_.extension -eq '.png' } | Sort-Object legacy_path)
$retainedMedium = @($referenced | Where-Object { $_.extension -in @('.jpg', '.jpeg') } | Sort-Object legacy_path)
$orphans = @($mediumRows | Where-Object { @($_.consumers).Count -eq 0 } | Sort-Object legacy_path)
$hashMismatches = @($mediumMigrations | Where-Object { -not [bool]$_.filename_hash_match })

$baselineCounts = [ordered]@{
  baseline_medium_files = $mediumFiles.Count
  referenced_medium_files = $referenced.Count
  migrated_medium_pngs = $mediumMigrations.Count
  retained_medium_jpeg_jpg = $retainedMedium.Count
  removed_medium_orphans = $orphans.Count
  migrated_syd_heroes = $sydFiles.Count
  filename_hash_mismatches = $hashMismatches.Count
}
Assert-OipCounts -Actual $baselineCounts

if (@($mediumMigrations.sha256 | Sort-Object -Unique).Count -ne $Expected.migrated_medium_pngs) {
  throw 'Referenced Medium PNGs do not have 105 unique actual-byte SHA-256 values.'
}
if (@($retainedMedium | Where-Object { $_.extension -notin @('.jpg', '.jpeg') }).Count -ne 0) {
  throw 'The retained Medium cohort contains a non-JPEG file.'
}

$manifest = Read-OipImageAssetManifest -Root $Root
$knownHashes = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($entry in $manifest.assets.Values) {
  $null = $knownHashes.Add([string]$entry.sha256)
}

foreach ($item in $mediumMigrations) {
  $item.asset_id = 'medium/' + [string]$item.sha256
  $item.source = 'images/originals/medium/' + [string]$item.sha256 + '.png'
  if ($manifest.assets.Contains([string]$item.asset_id) -or $knownHashes.Contains([string]$item.sha256)) {
    throw "Referenced Medium PNG collides with an existing managed asset: $($item.legacy_path)"
  }
}

$sydMigrations = [Collections.Generic.List[System.Collections.IDictionary]]::new()
foreach ($relativePath in ($sydFiles | Sort-Object)) {
  if ($relativePath -notmatch '^static/images/syd-and-oliver/(?<slug>[a-z0-9-]+)/hero\.png$') {
    throw "Unexpected Syd-and-Oliver image path: $relativePath"
  }
  $slug = [string]$Matches.slug
  $publicAlias = '/' + $relativePath.Substring('static/'.Length)
  $consumers = @(
    $referenceTexts.Keys |
      Where-Object { $referenceTexts[$_].Contains($publicAlias, [StringComparison]::Ordinal) } |
      Sort-Object
  )
  if ($consumers.Count -eq 0) {
    throw "Syd-and-Oliver hero has no content consumer: $relativePath"
  }
  $record = Get-OipImageRecord -RelativePath $relativePath -PublicAlias $publicAlias -Consumers $consumers
  $record.asset_id = "essays/dialogues/$slug/hero"
  $record.source = "images/originals/essays/dialogues/$slug/hero.png"
  if ($manifest.assets.Contains([string]$record.asset_id) -or $knownHashes.Contains([string]$record.sha256)) {
    throw "Syd-and-Oliver hero collides with an existing managed asset: $relativePath"
  }
  $null = $knownHashes.Add([string]$record.sha256)
  $sydMigrations.Add($record)
}
$sydInventorySha256 = Get-OipInventoryDigest -Rows @($sydMigrations)
if ($sydInventorySha256 -cne $ExpectedSydInventorySha256) {
  throw "Focused legacy Syd inventory digest drifted: expected $ExpectedSydInventorySha256, found $sydInventorySha256."
}

$allMigrations = @($mediumMigrations) + @($sydMigrations)
if (@($allMigrations.asset_id | Sort-Object -Unique).Count -ne 109) {
  throw 'Focused migration does not produce exactly 109 unique managed asset IDs.'
}

# Baseline application is fail-closed. Managed originals and the frozen report
# are new destinations in this release, so a pre-existing file or directory is
# an ambiguous partial/untracked state and must never be overwritten. A fully
# applied byte-identical state is handled earlier by Test-OipCompletedMigration.
$newDestinations = @(
  @($allMigrations | ForEach-Object { Get-OipFullPath -RelativePath ('assets/' + [string]$_.source) }) +
  @($ReportPath)
) | Sort-Object -Unique
foreach ($destination in $newDestinations) {
  if ([IO.File]::Exists($destination) -or [IO.Directory]::Exists($destination)) {
    throw "Focused migration refuses pre-existing new destination outside the verified completed state: $destination"
  }
}

$runtimeTexts = [ordered]@{}
foreach ($relativePath in Get-OipRuntimeTextPaths) {
  $runtimeTexts[$relativePath] = Read-OipUtf8File -Path (Get-OipFullPath -RelativePath $relativePath)
}
foreach ($orphan in $orphans) {
  foreach ($relativePath in $runtimeTexts.Keys) {
    if ($runtimeTexts[$relativePath].Contains([string]$orphan.public_alias, [StringComparison]::Ordinal)) {
      throw "Medium orphan candidate is referenced by runtime source '$relativePath': $($orphan.public_alias)"
    }
  }
}

$modifiedTexts = [ordered]@{}
$modifiedReferenceFiles = [Collections.Generic.List[System.Collections.IDictionary]]::new()
foreach ($relativePath in $referenceTexts.Keys) {
  $before = [string]$referenceTexts[$relativePath]
  $relevant = @($allMigrations | Where-Object { $before.Contains([string]$_.public_alias, [StringComparison]::Ordinal) })
  if ($relevant.Count -eq 0) {
    continue
  }
  $replacementCount = 0
  foreach ($item in $relevant) {
    $replacementCount += Get-OipOccurrences -Text $before -Value ([string]$item.public_alias)
  }
  $after = New-OipMigratedText -Text $before -Migrations $relevant
  foreach ($item in $relevant) {
    if ($after.Contains([string]$item.public_alias, [StringComparison]::Ordinal)) {
      throw "Reference rewrite left a retired alias in '$relativePath': $($item.public_alias)"
    }
  }
  $fullPath = Get-OipFullPath -RelativePath $relativePath
  $withBom = Test-OipUtf8Bom -Path $fullPath
  $afterBytes = Get-OipEncodedTextBytes -Text $after -WithBom:$withBom
  $modifiedTexts[$relativePath] = $after
  $modifiedReferenceFiles.Add([ordered]@{
    path = $relativePath
    before_sha256 = Get-OipPortableTextFileSha256 -Path $fullPath -Label "Pre-migration content '$relativePath'"
    after_sha256 = Get-OipPortableTextSha256ForBytes -Bytes $afterBytes -Label "Rewritten content '$relativePath'"
    utf8_bom = $withBom
    replacement_count = $replacementCount
  })
}

foreach ($item in $allMigrations) {
  $seen = 0
  foreach ($relativePath in $referenceTexts.Keys) {
    $seen += Get-OipOccurrences -Text ([string]$referenceTexts[$relativePath]) -Value ([string]$item.public_alias)
  }
  if ($seen -eq 0) {
    throw "Selected migration alias has no content reference: $($item.public_alias)"
  }
}

foreach ($item in $mediumMigrations) {
  $manifest.assets[[string]$item.asset_id] = [ordered]@{
    id = [string]$item.asset_id
    source = [string]$item.source
    sha256 = [string]$item.sha256
    width = [int]$item.width
    height = [int]$item.height
    image_class = 'medium_import'
    processing_hint = 'drawing'
    review_state = 'pending_review'
    usage_state = 'referenced'
    processing_state = 'derivative_capable'
    processing_note = $null
    quality_override = $null
  }
  $manifest.aliases[[string]$item.public_alias] = [string]$item.asset_id
}
foreach ($item in $sydMigrations) {
  $manifest.assets[[string]$item.asset_id] = [ordered]@{
    id = [string]$item.asset_id
    source = [string]$item.source
    sha256 = [string]$item.sha256
    width = [int]$item.width
    height = [int]$item.height
    image_class = 'essay_illustration'
    processing_hint = 'drawing'
    review_state = 'pending_review'
    usage_state = 'referenced'
    processing_state = 'derivative_capable'
    processing_note = $null
    quality_override = $null
  }
  $manifest.aliases[[string]$item.public_alias] = [string]$item.asset_id
}
Assert-OipImageAssetManifest -Manifest $manifest
if ($manifest.assets.Count -ne $Expected.post_manifest_assets -or $manifest.aliases.Count -ne $Expected.post_manifest_aliases) {
  throw "Post-migration manifest count mismatch: assets=$($manifest.assets.Count), aliases=$($manifest.aliases.Count)."
}

$baselineCommit = (Invoke-OipGitText -Arguments @('rev-parse', 'HEAD')).Trim()
$longPaths = @($mediumFiles | Where-Object { (Get-OipFullPath -RelativePath $_).Length -gt 260 })
$migratedBytes = [int64]0
foreach ($item in $allMigrations) {
  $migratedBytes += [int64]$item.bytes
}
$orphanBytes = [int64]0
foreach ($item in $orphans) {
  $orphanBytes += [int64]$item.bytes
}
$retainedBytes = [int64]0
foreach ($item in $retainedMedium) {
  $retainedBytes += [int64]$item.bytes
}

$report = [ordered]@{
  schema_version = '1.1'
  action_id = 'WEB-LEGACY-IMAGE-CLEANUP-001-R2'
  baseline_commit = $baselineCommit
  rewritten_content_sha256_basis = $RewrittenContentSha256Basis
  baseline = [ordered]@{
    inventory_digest_basis = $InventoryDigestBasis
    medium_inventory_sha256 = $mediumInventorySha256
    syd_inventory_sha256 = $sydInventorySha256
    medium_files = $mediumFiles.Count
    referenced_medium_files = $referenced.Count
    referenced_medium_pngs = $mediumMigrations.Count
    referenced_medium_jpeg_jpg = $retainedMedium.Count
    medium_orphans = $orphans.Count
    syd_heroes = $sydMigrations.Count
    filename_hash_mismatches = $hashMismatches.Count
    long_paths_over_260 = $longPaths.Count
  }
  result = [ordered]@{
    manifest_assets = $manifest.assets.Count
    manifest_aliases = $manifest.aliases.Count
    migrated_source_bytes = $migratedBytes
    removed_orphan_bytes = $orphanBytes
    retained_medium_bytes = $retainedBytes
  }
  medium_migrations = @($mediumMigrations)
  syd_migrations = @($sydMigrations)
  retained_medium_files = @(
    $retainedMedium | ForEach-Object {
      [ordered]@{
        path = [string]$_.legacy_path
        sha256 = [string]$_.sha256
        bytes = [int64]$_.bytes
        extension = [string]$_.extension
        consumers = @($_.consumers)
      }
    }
  )
  removed_orphans = @(
    $orphans | ForEach-Object {
      [ordered]@{
        legacy_path = [string]$_.legacy_path
        sha256 = [string]$_.sha256
        bytes = [int64]$_.bytes
        extension = [string]$_.extension
      }
    }
  )
  modified_reference_files = @($modifiedReferenceFiles)
}

$transactionRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-legacy-image-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($transactionRoot) | Out-Null
$stagedWrites = [ordered]@{}
$counter = 0
try {
  foreach ($item in $allMigrations) {
    $counter++
    $stagedPath = Join-Path $transactionRoot ("stage-$counter.bin")
    [IO.File]::Copy((Get-OipFullPath -RelativePath ([string]$item.legacy_path)), $stagedPath, $true)
    if ((Get-OipRawFileHash -Path $stagedPath) -cne [string]$item.sha256) {
      throw "Staged managed original hash mismatch: $($item.legacy_path)"
    }
    $stagedWrites[(Get-OipFullPath -RelativePath ('assets/' + [string]$item.source))] = $stagedPath
  }
  foreach ($relativePath in $modifiedTexts.Keys) {
    $counter++
    $stagedPath = Join-Path $transactionRoot ("stage-$counter.txt")
    $sourcePath = Get-OipFullPath -RelativePath $relativePath
    $encoded = Get-OipEncodedTextBytes -Text ([string]$modifiedTexts[$relativePath]) -WithBom:(Test-OipUtf8Bom -Path $sourcePath)
    [IO.File]::WriteAllBytes($stagedPath, $encoded)
    $stagedWrites[(Get-OipFullPath -RelativePath $relativePath)] = $stagedPath
  }
  $counter++
  $stagedManifestRoot = Join-Path $transactionRoot 'manifest-root'
  [IO.Directory]::CreateDirectory((Join-Path $stagedManifestRoot 'data')) | Out-Null
  Write-OipImageAssetManifest -Root $stagedManifestRoot -Manifest $manifest
  $stagedManifest = Get-OipImageAssetManifestPath -Root $stagedManifestRoot
  $stagedWrites[(Get-OipImageAssetManifestPath -Root $Root)] = $stagedManifest

  $counter++
  $stagedReport = Join-Path $transactionRoot ("stage-$counter.json")
  Write-OipCanonicalJsonFile -Path $stagedReport -Value $report -Depth 16
  $stagedWrites[$ReportPath] = $stagedReport

  $deletePaths = @(
    @($mediumMigrations | ForEach-Object { Get-OipFullPath -RelativePath ([string]$_.legacy_path) }) +
    @($orphans | ForEach-Object { Get-OipFullPath -RelativePath ([string]$_.legacy_path) }) +
    @($sydMigrations | ForEach-Object { Get-OipFullPath -RelativePath ([string]$_.legacy_path) })
  ) | Sort-Object -Unique
  if ($deletePaths.Count -ne 159) {
    throw "Focused migration expected 159 retired source files, found $($deletePaths.Count)."
  }

  $preconditions = [ordered]@{}
  foreach ($path in @($stagedWrites.Keys) + $deletePaths | Sort-Object -Unique) {
    if ([IO.File]::Exists($path)) {
      $preconditions[$path] = Get-OipRawFileHash -Path $path
    }
    elseif ($deletePaths -contains $path) {
      throw "Retired source disappeared during migration staging: $path"
    }
    elseif ($path -ne $ReportPath -and $path -notlike (Join-Path $Root 'assets\images\originals\*')) {
      throw "Expected existing write target is missing: $path"
    }
  }

  $result = [ordered]@{
    mode = if ($Write) { 'write' } else { 'dry_run' }
    baseline_commit = $baselineCommit
    baseline_medium_files = $mediumFiles.Count
    referenced_medium_files = $referenced.Count
    migrated_medium_pngs = $mediumMigrations.Count
    retained_medium_jpeg_jpg = $retainedMedium.Count
    removed_medium_orphans = $orphans.Count
    migrated_syd_heroes = $sydMigrations.Count
    filename_hash_mismatches = $hashMismatches.Count
    long_paths_over_260 = $longPaths.Count
    medium_inventory_sha256 = $mediumInventorySha256
    syd_inventory_sha256 = $sydInventorySha256
    post_manifest_assets = $manifest.assets.Count
    post_manifest_aliases = $manifest.aliases.Count
    migrated_source_bytes = $migratedBytes
    removed_orphan_bytes = $orphanBytes
    modified_reference_files = $modifiedReferenceFiles.Count
    report = $ReportRelativePath
  }

  if ($Write) {
    foreach ($path in $preconditions.Keys) {
      if (-not [IO.File]::Exists($path) -or (Get-OipRawFileHash -Path $path) -cne [string]$preconditions[$path]) {
        throw "Migration input changed after staging: $path"
      }
    }

    $backupRoot = Join-Path $transactionRoot 'backup'
    [IO.Directory]::CreateDirectory($backupRoot) | Out-Null
    $backups = [ordered]@{}
    $backupCounter = 0
    foreach ($path in $preconditions.Keys) {
      $backupCounter++
      $backupPath = Join-Path $backupRoot ("backup-$backupCounter.bin")
      [IO.File]::Copy($path, $backupPath, $true)
      $backups[$path] = $backupPath
    }

    $commitSucceeded = $false
    $operationCount = 0
    try {
      foreach ($target in $stagedWrites.Keys) {
        $parent = [IO.Path]::GetDirectoryName($target)
        if (-not [IO.Directory]::Exists($parent)) {
          [IO.Directory]::CreateDirectory($parent) | Out-Null
        }
        [IO.File]::Move([string]$stagedWrites[$target], $target, $true)
        $operationCount++
        if ($TestFailureAfterOperation -eq $operationCount) {
          throw "Injected focused-migration test failure after operation $operationCount."
        }
      }
      foreach ($path in $deletePaths) {
        [IO.File]::Delete($path)
        $operationCount++
        if ($TestFailureAfterOperation -eq $operationCount) {
          throw "Injected focused-migration test failure after operation $operationCount."
        }
      }

      foreach ($item in $allMigrations) {
        $target = Get-OipFullPath -RelativePath ('assets/' + [string]$item.source)
        if (-not [IO.File]::Exists($target) -or (Get-OipRawFileHash -Path $target) -cne [string]$item.sha256) {
          throw "Committed managed original failed verification: $($item.asset_id)"
        }
      }
      foreach ($path in $deletePaths) {
        if ([IO.File]::Exists($path)) {
          throw "Retired source remained after commit: $path"
        }
      }
      $committedManifest = Read-OipImageAssetManifest -Root $Root
      if ($committedManifest.assets.Count -ne 459 -or $committedManifest.aliases.Count -ne 500) {
        throw 'Committed image manifest failed count verification.'
      }
      $commitSucceeded = $true
    }
    finally {
      if (-not $commitSucceeded) {
        foreach ($target in $stagedWrites.Keys) {
          if ([IO.File]::Exists($target)) {
            [IO.File]::Delete($target)
          }
        }
        foreach ($path in $backups.Keys) {
          $parent = [IO.Path]::GetDirectoryName($path)
          if (-not [IO.Directory]::Exists($parent)) {
            [IO.Directory]::CreateDirectory($parent) | Out-Null
          }
          [IO.File]::Copy([string]$backups[$path], $path, $true)
        }
      }
    }

    Remove-OipEmptySydDirectories
  }

  if ($Json) {
    [pscustomobject]$result | ConvertTo-Json -Depth 8
  }
  else {
    [pscustomobject]$result
  }
}
finally {
  Remove-OipTransactionDirectory -Path $transactionRoot
}
