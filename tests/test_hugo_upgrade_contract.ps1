Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$expectedVersion = '0.164.0'
$windowsSha256 = '59109d4e05d0cc9e1743688166e5323a71bd8b67a6e928db07c61720cc49a7cc'
$windowsInstalledSha256 = 'd6253c7438dec3959b3a63336b46ff4160285018bbe1d4e855bf5fb4384dc930'
$linuxSha256 = 'fea17b8c076f950bb2e9f9486667bdaa29422883888d509d63931c73e8a9b3a4'

$manifestPath = Join-Path $repoRoot 'tools\toolchain.manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$hugoTool = @($manifest.tools | Where-Object { $_.name -eq 'hugo' })
if ($hugoTool.Count -ne 1) {
  throw 'Toolchain manifest must define exactly one Hugo tool.'
}

$hugoTool = $hugoTool[0]
if ($hugoTool.version -ne $expectedVersion) {
  throw "Toolchain manifest must pin Hugo $expectedVersion."
}
if ($hugoTool.sha256 -ne $windowsSha256) {
  throw 'Toolchain manifest must pin the official Windows Extended archive SHA-256.'
}
if ($hugoTool.installed_sha256 -ne $windowsInstalledSha256) {
  throw 'Toolchain manifest must pin the extracted Windows Hugo executable SHA-256.'
}
if ($hugoTool.install_path -ne "tools/vendor/hugo-$expectedVersion") {
  throw 'Hugo install path must be version-specific.'
}
if ($hugoTool.asset_name -ne "hugo_extended_${expectedVersion}_windows-amd64.zip") {
  throw 'Hugo asset name must identify the pinned Windows Extended archive.'
}
if ($hugoTool.validate.match_regex -notmatch '\\\+extended') {
  throw 'Hugo validation must require the Extended build.'
}

$workflow = Get-Content -LiteralPath (Join-Path $repoRoot '.github\workflows\deploy.yml') -Raw
foreach ($requiredWorkflowText in @(
  "version=`"$expectedVersion`"",
  "archive_sha256=`"$linuxSha256`"",
  'sha256sum --check --strict',
  '+extended*',
  'hugo --gc --minify --panicOnWarning'
)) {
  if (-not $workflow.Contains($requiredWorkflowText)) {
    throw "Deploy workflow is missing Hugo integrity contract: $requiredWorkflowText"
  }
}
if (-not $workflow.Contains('./tests/test_hugo_upgrade_contract.ps1')) {
  throw 'Deploy workflow must run the Hugo upgrade contract before building.'
}

$bootstrap = Get-Content -LiteralPath (Join-Path $repoRoot 'tools\bootstrap_toolchain_assets.ps1') -Raw
foreach ($requiredBootstrapText in @(
  "hugo_extended_${expectedVersion}_windows-amd64.zip",
  $windowsSha256,
  'Assert-BootstrapAssetHash'
)) {
  if (-not $bootstrap.Contains($requiredBootstrapText)) {
    throw "Bootstrap script is missing Hugo integrity contract: $requiredBootstrapText"
  }
}

$installer = Get-Content -LiteralPath (Join-Path $repoRoot 'tools\lib\Toolchain.Install.ps1') -Raw
foreach ($hashImplementation in @($bootstrap, $installer)) {
  if (-not $hashImplementation.Contains('[System.Security.Cryptography.SHA256]::Create()')) {
    throw 'Tool archive hashing must use the PowerShell 5.1-compatible SHA-256 implementation.'
  }
}

$manifestValidatorPath = Join-Path $repoRoot 'tools\lib\Toolchain.Manifest.ps1'
. (Join-Path $repoRoot 'tools\lib\Toolchain.Common.ps1')
. $manifestValidatorPath
foreach ($hashField in @('sha256', 'installed_sha256')) {
  $invalidManifest = ($manifest | ConvertTo-Json -Depth 20 | ConvertFrom-Json)
  $invalidHugo = $invalidManifest.tools | Where-Object { $_.name -eq 'hugo' } | Select-Object -First 1
  $invalidHugo.$hashField = 'not-a-sha256'
  $rejected = $false
  try {
    Test-ToolchainManifest -Manifest $invalidManifest
  }
  catch {
    $rejected = $true
  }
  if (-not $rejected) {
    throw "Toolchain manifest validation must reject malformed $hashField values."
  }
}

. (Join-Path $repoRoot 'tools\lib\Toolchain.Resolve.ps1')
. (Join-Path $repoRoot 'tools\lib\Toolchain.Install.ps1')
$hashFixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('oip-hugo-hash-' + [guid]::NewGuid().ToString('N'))
$priorToolCache = $env:CODEX_TOOLCACHE
try {
  $fixtureRepo = Join-Path $hashFixtureRoot 'repo'
  $fixtureCache = Join-Path $hashFixtureRoot 'cache'
  $fixtureInstall = Join-Path $fixtureRepo 'tools\vendor\hugo-fixture'
  New-Item -ItemType Directory -Path $fixtureRepo -Force | Out-Null
  $env:CODEX_TOOLCACHE = $fixtureCache

  $fixtureTool = [pscustomobject]@{
    name = 'hugo-cache-fixture'
    version = $expectedVersion
    install_path = 'tools/vendor/hugo-fixture'
    launch_path = 'hugo.exe'
    installed_sha256 = ('0' * 64)
  }
  $fixtureCachePath = Get-ToolCachePath -Tool $fixtureTool
  New-Item -ItemType Directory -Path $fixtureCachePath -Force | Out-Null
  $fixtureExecutable = Join-Path $fixtureCachePath 'hugo.exe'
  [System.IO.File]::WriteAllBytes($fixtureExecutable, [byte[]](1, 2, 3, 4, 5))
  $fixtureLog = Join-Path $hashFixtureRoot 'install.log'

  $corruptCacheRejected = $false
  try {
    Install-PortableTool -Tool $fixtureTool -RepoRoot $fixtureRepo -LogPath $fixtureLog -InstallRoot $fixtureInstall
  }
  catch {
    $corruptCacheRejected = $true
  }
  if (-not $corruptCacheRejected) {
    throw 'Tool provisioning must reject a shared-cache executable whose installed SHA-256 does not match.'
  }

  if (Test-Path -LiteralPath $fixtureInstall) {
    Remove-Item -LiteralPath $fixtureInstall -Recurse -Force
  }
  $fixtureTool.installed_sha256 = Get-ToolFileSha256 -Path $fixtureExecutable
  Install-PortableTool -Tool $fixtureTool -RepoRoot $fixtureRepo -LogPath $fixtureLog -InstallRoot $fixtureInstall

  [System.IO.File]::WriteAllBytes((Join-Path $fixtureInstall 'hugo.exe'), [byte[]](9, 9, 9))
  $corruptInstalledRejected = $false
  try {
    Install-PortableTool -Tool $fixtureTool -RepoRoot $fixtureRepo -LogPath $fixtureLog -InstallRoot $fixtureInstall
  }
  catch {
    $corruptInstalledRejected = $true
  }
  if (-not $corruptInstalledRejected) {
    throw 'Tool provisioning must reverify and reject a corrupted existing executable.'
  }
}
finally {
  $env:CODEX_TOOLCACHE = $priorToolCache
  if (Test-Path -LiteralPath $hashFixtureRoot) {
    Remove-Item -LiteralPath $hashFixtureRoot -Recurse -Force
  }
}

$config = Get-Content -LiteralPath (Join-Path $repoRoot 'hugo.toml') -Raw
if ($config -notmatch '(?m)^locale\s*=\s*"en-US"\s*$') {
  throw 'hugo.toml must use locale = "en-US".'
}
if ($config -match '(?m)^languageCode\s*=') {
  throw 'hugo.toml must not use deprecated languageCode.'
}

$deprecatedPatterns = @(
  '\.Language\.LanguageCode',
  '(?<![A-Za-z0-9_])site\.Data'
)
$layoutFiles = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'layouts') -Recurse -File
foreach ($layoutFile in $layoutFiles) {
  $layoutText = Get-Content -LiteralPath $layoutFile.FullName -Raw
  foreach ($pattern in $deprecatedPatterns) {
    if ($layoutText -match $pattern) {
      throw "Deprecated Hugo interface remains in $($layoutFile.FullName): $pattern"
    }
  }
}

$resourceIntegrityContracts = @(
  @{ Path = 'layouts\_default\baseof.html'; Snippet = '$css.Data.Integrity' },
  @{ Path = 'layouts\404.html'; Snippet = '$css.Data.Integrity' },
  @{ Path = 'layouts\partials\analytics.html'; Snippet = '$analyticsScript.Data.Integrity' },
  @{ Path = 'layouts\partials\paper_route.html'; Snippet = '$launcher.Data.Integrity' }
)
foreach ($contract in $resourceIntegrityContracts) {
  $resourceTemplate = Get-Content -LiteralPath (Join-Path $repoRoot $contract.Path) -Raw
  if (-not $resourceTemplate.Contains($contract.Snippet)) {
    throw "Hugo resource integrity access must retain $($contract.Snippet) in $($contract.Path)."
  }
}

$vscodeTasks = Get-Content -LiteralPath (Join-Path $repoRoot '.vscode\tasks.json') -Raw
if ($vscodeTasks -match '"command"\s*:\s*"hugo"') {
  throw 'VS Code Hugo tasks must not bypass the pinned wrapper.'
}
if ([regex]::Matches($vscodeTasks, [regex]::Escape('.\\tools\\bin\\generated\\hugo.cmd')).Count -ne 3) {
  throw 'All three VS Code Hugo tasks must use the pinned wrapper.'
}

$dossierContract = Get-Content -LiteralPath (Join-Path $repoRoot 'tests\test_robert_author_dossier_contract.ps1') -Raw
if (-not $dossierContract.Contains('Resolve-PinnedHugo') -or $dossierContract -match 'Get-Command\s+hugo|\.tools/hugo/hugo\.exe') {
  throw 'Robert dossier rendering must use the pinned Hugo resolver without global or legacy fallback.'
}

$manifestWriter = Get-Content -LiteralPath (Join-Path $repoRoot 'tests\write_public_build_manifest.ps1') -Raw
$publicOutputHelper = Get-Content -LiteralPath (Join-Path $repoRoot 'tests\helpers\public_output_common.ps1') -Raw
if (-not $manifestWriter.Contains('Resolve-PinnedHugo') -or -not $manifestWriter.Contains('-HugoVersion $hugo.Version')) {
  throw 'Public build manifest writer must record the version resolved through the pinned Hugo contract.'
}
foreach ($resolverSnippet in @('tools\bin\generated\hugo.cmd', "ExpectedVersion = '0.164.0'", 'Expected Hugo Extended')) {
  if (-not $publicOutputHelper.Contains($resolverSnippet)) {
    throw "Public output helper is missing pinned Hugo resolver text: $resolverSnippet"
  }
}
if ($publicOutputHelper -match '&\s+hugo\s+version') {
  throw 'Public build metadata must not query an unqualified global Hugo command.'
}
foreach ($bindingSnippet in @('Assert-GeneratedSiteHugoVersion', 'Generated homepage was built by Hugo', 'manifest Hugo version does not match the pinned Hugo command')) {
  if (-not $publicOutputHelper.Contains($bindingSnippet)) {
    throw "Public output helper is missing generated-output binding text: $bindingSnippet"
  }
}

. (Join-Path $repoRoot 'tests\helpers\public_output_common.ps1')
$generatorFixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('oip-hugo-generator-' + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $generatorFixtureRoot -Force | Out-Null
  $generatorIndex = Join-Path $generatorFixtureRoot 'index.html'
  [System.IO.File]::WriteAllText($generatorIndex, '<!doctype html><meta name=generator content="Hugo 0.157.0">')
  $oldGeneratorRejected = $false
  try {
    Assert-GeneratedSiteHugoVersion -SiteDir $generatorFixtureRoot -HugoVersion 'hugo v0.164.0+extended fixture'
  }
  catch {
    $oldGeneratorRejected = $true
  }
  if (-not $oldGeneratorRejected) {
    throw 'Public build manifest binding must reject output rendered by an older Hugo version.'
  }

  [System.IO.File]::WriteAllText($generatorIndex, '<!doctype html><meta name=generator content="Hugo 0.164.0">')
  Assert-GeneratedSiteHugoVersion -SiteDir $generatorFixtureRoot -HugoVersion 'hugo v0.164.0+extended fixture'
}
finally {
  if (Test-Path -LiteralPath $generatorFixtureRoot) {
    Remove-Item -LiteralPath $generatorFixtureRoot -Recurse -Force
  }
}

$pdfResolver = Get-Content -LiteralPath (Join-Path $repoRoot 'scripts\lib\resolve_pinned_hugo.ps1') -Raw
$pdfBuilder = Get-Content -LiteralPath (Join-Path $repoRoot 'scripts\build_pdfs_typst_shared.ps1') -Raw
foreach ($pdfResolverSnippet in @(
  'tools\bin\generated\hugo.cmd',
  "DirectorySeparatorChar -eq '\'",
  'Get-Command hugo -CommandType Application',
  "ExpectedVersion = '0.164.0'",
  'path-non-windows',
  'expected Hugo Extended'
)) {
  if (-not $pdfResolver.Contains($pdfResolverSnippet)) {
    throw "Shared PDF Hugo resolver is missing platform/version contract: $pdfResolverSnippet"
  }
}
foreach ($pdfBuilderSnippet in @(
  'lib\resolve_pinned_hugo.ps1',
  'Resolve-OipPinnedHugo',
  '-Command $HugoCommand',
  '--panicOnWarning'
)) {
  if (-not $pdfBuilder.Contains($pdfBuilderSnippet)) {
    throw "Paused PDF builder must retain shared pinned Hugo resolution: $pdfBuilderSnippet"
  }
}
if ($pdfBuilder -match 'Require-NativeCommand\s+-Name\s+"hugo"|Invoke-NativeOrThrow\s+-Command\s+"hugo"') {
  throw 'Paused PDF builder must not resolve Hugo from PATH.'
}

foreach ($pdfCheckPath in @('scripts\verify_pdf_pipeline.ps1', 'scripts\audit_pdf_failures.ps1')) {
  $pdfCheck = Get-Content -LiteralPath (Join-Path $repoRoot $pdfCheckPath) -Raw
  foreach ($sharedResolverSnippet in @('lib\resolve_pinned_hugo.ps1', 'Resolve-OipPinnedHugo')) {
    if (-not $pdfCheck.Contains($sharedResolverSnippet)) {
      throw "$pdfCheckPath must use the shared pinned Hugo resolver: $sharedResolverSnippet"
    }
  }
}

Write-Host 'Hugo 0.164.0 upgrade contract passed.'
