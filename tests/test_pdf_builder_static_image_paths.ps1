Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$sharedScript = Join-Path $repoRoot "scripts/build_pdfs_typst_shared.ps1"

function Assert-True {
  param([bool]$Condition,[string]$Message)
  if (-not $Condition) {
    throw $Message
  }
}

function Import-SharedFunction {
  param(
    [System.Management.Automation.Language.FunctionDefinitionAst[]]$Functions,
    [string]$Name
  )

  $functionAst = $Functions | Where-Object { $_.Name -eq $Name } | Select-Object -First 1
  if ($null -eq $functionAst) {
    throw "Could not find function '$Name' in $sharedScript."
  }

  return $functionAst.Extent.Text
}

$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($sharedScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) {
  throw "Could not parse $sharedScript"
}

$functionAsts = $ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
  }, $true)

foreach ($name in @(
    "Read-Utf8Text",
    "Write-Utf8Text",
    "Repair-CommonTextArtifacts",
    "Get-RelativePathBetween",
    "Get-TypstPlaceholderBlock",
    "Resolve-TypstStaticAssetPath",
    "Normalize-TypstBody"
  )) {
  Invoke-Expression (Import-SharedFunction -Functions $functionAsts -Name $name)
}

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("oip-static-image-fn-" + [guid]::NewGuid().ToString("N"))
try {
  $script:IsWindowsHost = $true
  $script:RepoRoot = $testRoot

  $staticImageDir = Join-Path $testRoot "static/images"
  $tempDir = Join-Path $testRoot "resources/typst_build"
  New-Item -ItemType Directory -Force -Path $staticImageDir, $tempDir | Out-Null
  "fixture image" | Set-Content -Path (Join-Path $staticImageDir "fixture.jpg") -Encoding UTF8

  $bodyPath = Join-Path $tempDir "fixture.body.typ"
  '#box(image("/images/fixture.jpg"))' | Set-Content -Path $bodyPath -Encoding UTF8

  $normalized = Normalize-TypstBody -Path $bodyPath -Title "" -Subtitle ""
  $normalizedBody = Get-Content $bodyPath -Raw

  Assert-True ($normalized.StaticAssetRewriteCount -gt 0) "Expected Normalize-TypstBody to record a static asset rewrite."
  Assert-True ($normalizedBody -notmatch 'image\("/images/') "Expected Normalize-TypstBody to remove root-relative /images references."
  Assert-True ($normalizedBody -match 'image\("\.\./') "Expected Normalize-TypstBody to rewrite the asset to a relative compile path."
}
finally {
  if (Test-Path $testRoot) {
    Remove-Item -Recurse -Force $testRoot
  }
}

Write-Host "PDF builder static-image path tests passed."
$global:LASTEXITCODE = 0
exit 0
