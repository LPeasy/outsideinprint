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
    "Remove-UnsupportedControlChars",
    "Repair-CommonTextArtifacts",
    "Get-RelativePathBetween",
    "Get-SiteBasePath",
    "Test-StaticImageReference",
    "Normalize-StaticAssetReference",
    "Resolve-StaticAssetPath",
    "Get-PdfFigurePlaceholderMarker",
    "Get-TypstPlaceholderBlock",
    "Resolve-TypstStaticAssetPath",
    "Test-RemoteUrl",
    "Resolve-ImageSourcePath",
    "Test-StandaloneHeadingCandidate",
    "Convert-StandaloneSectionLines",
    "Normalize-PandocSource",
    "Normalize-TypstBody"
  )) {
  Invoke-Expression (Import-SharedFunction -Functions $functionAsts -Name $name)
}

function Convert-HtmlAnchorToMarkdown {
  param([System.Text.RegularExpressions.Match]$Match)
  return $Match.Value
}

function Convert-HtmlFigureToMarkdown {
  param(
    [System.Text.RegularExpressions.Match]$Match,
    [System.IO.FileInfo]$SourceFile,
    [string]$TempSourcePath,
    [string]$CacheNamespace,
    [hashtable]$State
  )
  return $Match.Value
}

function Try-LocalizeRemoteImage {
  param(
    [string]$Url,
    [string]$TempSourcePath,
    [string]$CacheNamespace
  )
  return ""
}

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("oip-static-image-fn-" + [guid]::NewGuid().ToString("N"))
try {
  $script:IsWindowsHost = $true
  $script:RepoRoot = $testRoot
  $script:SiteBaseUrl = "https://lpeasy.github.io/outsideinprint/"

  $staticImageDir = Join-Path $testRoot "static/images"
  $contentDir = Join-Path $testRoot "content/essays"
  $tempDir = Join-Path $testRoot "resources/typst_build"
  New-Item -ItemType Directory -Force -Path $staticImageDir, $contentDir, $tempDir | Out-Null
  "fixture image" | Set-Content -Path (Join-Path $staticImageDir "fixture.jpg") -Encoding UTF8

  $bodyPath = Join-Path $tempDir "fixture.body.typ"
  @'
#image("/images/fixture.jpg")
#image("/outsideinprint/images/fixture.jpg")
#image("https://lpeasy.github.io/outsideinprint/images/fixture.jpg")
#image("../static/images/already-relative.jpg")
#image("https://example.com/remote.png")
#quote(block: true)[
OIP_PDF_FIGURE_PLACEHOLDER
]
'@ | Set-Content -Path $bodyPath -Encoding UTF8

  $normalized = Normalize-TypstBody -Path $bodyPath -Title "" -Subtitle ""
  $normalizedBody = Get-Content $bodyPath -Raw

  Assert-True ($normalized.StaticAssetRewriteCount -eq 3) "Expected Normalize-TypstBody to rewrite direct, base-path-prefixed, and absolute site image refs."
  Assert-True ($normalized.PlaceholderCount -eq 1) "Expected Normalize-TypstBody to preserve a single placeholder for the unresolved external remote image."
  Assert-True ($normalizedBody -notmatch 'image\("/images/') "Expected Normalize-TypstBody to remove root-relative /images references."
  Assert-True ($normalizedBody -notmatch 'image\("/outsideinprint/images/') "Expected Normalize-TypstBody to remove project-base-prefixed /outsideinprint/images references."
  Assert-True ($normalizedBody -notmatch 'image\("https://lpeasy\.github\.io/outsideinprint/images/') "Expected Normalize-TypstBody to localize absolute site image URLs."
  Assert-True (([regex]::Matches($normalizedBody, '#image\("\.\./\.\./static/images/fixture\.jpg"\)')).Count -eq 3) "Expected Normalize-TypstBody to rewrite all targeted static image references to relative compile paths."
  Assert-True ($normalizedBody -match '#image\("\.\./static/images/already-relative\.jpg"\)') "Expected Normalize-TypstBody to leave an already-relative Typst image path unchanged."
  Assert-True ($normalizedBody -notmatch 'https://example\.com/remote\.png') "Expected Normalize-TypstBody to replace unresolved external remote images with placeholders."
  Assert-True ($normalizedBody -match '#block\[#align\(center\)\[#emph\[Image kept on web edition only\.\]\]\]') "Expected Normalize-TypstBody to emit the simplified Typst placeholder block for unresolved external remote images."
  Assert-True ($normalizedBody -notmatch '#quote\(block:\s*true\)\[\s*(?:Image kept on web edition only\.|OIP_PDF_FIGURE_PLACEHOLDER)') "Expected Normalize-TypstBody not to leave quote-wrapped placeholder markers behind."

  $sourceFilePath = Join-Path $contentDir "fixture.md"
  @'
![](/images/fixture.jpg)

![](/outsideinprint/images/fixture.jpg)

![](https://lpeasy.github.io/outsideinprint/images/fixture.jpg)

![](https://example.com/remote.png)
'@ | Set-Content -Path $sourceFilePath -Encoding UTF8

  $normalizedSource = Normalize-PandocSource -RawBody (Get-Content $sourceFilePath -Raw) -SourceFile (Get-Item $sourceFilePath) -TempSourcePath (Join-Path $tempDir "fixture.source.md") -CacheNamespace "fixture"

  Assert-True ($normalizedSource.LocalImageCount -eq 3) "Expected Normalize-PandocSource to localize direct, base-path-prefixed, and absolute site markdown images."
  Assert-True ($normalizedSource.RemoteImageCount -eq 1) "Expected Normalize-PandocSource to leave non-local remote images as web-only placeholders."
  Assert-True ($normalizedSource.LocalizedRemoteImageCount -eq 0) "Expected Normalize-PandocSource not to count unresolved remote images as localized."
  Assert-True (([regex]::Matches($normalizedSource.Source, '\.\./\.\./static/images/fixture\.jpg')).Count -eq 3) "Expected Normalize-PandocSource to rewrite all local markdown images to compile-time relative paths."
  Assert-True (([regex]::Matches($normalizedSource.Source, [regex]::Escape((Get-PdfFigurePlaceholderMarker)))).Count -eq 1) "Expected Normalize-PandocSource to emit a single placeholder marker for the unresolved remote image."
}
finally {
  if (Test-Path $testRoot) {
    Remove-Item -Recurse -Force $testRoot
  }
}

Write-Host "PDF builder static-image path tests passed."
$global:LASTEXITCODE = 0
exit 0
