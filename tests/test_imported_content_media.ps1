Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repoRoot "scripts/import_medium_export.ps1"
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$null, [ref]$null)

function Import-SharedFunction {
  param(
    [System.Management.Automation.Language.FunctionDefinitionAst[]]$Functions,
    [string]$Name,
    [string]$SourcePath = $scriptPath
  )

  $functionAst = $Functions | Where-Object { $_.Name -eq $Name } | Select-Object -First 1
  if ($null -eq $functionAst) {
    throw "Could not find function '$Name' in $SourcePath"
  }

  return $functionAst.Extent.Text
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

$functionAsts = $ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
  }, $true)

foreach ($name in @(
    "Decode-Html",
    "Get-CharCount",
    "Get-MojibakeScore",
    "Decode-1252AsUtf8",
    "Repair-Mojibake",
    "Strip-Html",
    "Get-HtmlAttributeValue",
    "Escape-HtmlAttribute",
    "Normalize-ImportedCaptionText",
    "Test-DescriptiveCaptionSegment",
    "Get-ImportedImageCaptionMetadata",
    "Set-ImageAltIfMissing",
    "Escape-MarkdownImageText",
    "New-MarkdownImage",
    "Wrap-ImportedFigureCaptionsInHtml",
    "Merge-ImportedImageCaptions",
    "Convert-HtmlFallback"
  )) {
  Invoke-Expression (Import-SharedFunction -Functions $functionAsts -Name $name)
}

$photoCredit = Get-ImportedImageCaptionMetadata "Photo by Markus Spiske on Unsplash"
Assert-True ([bool]$photoCredit.is_caption) "Expected Unsplash credits to be recognized as imported image captions."
Assert-True ([string]$photoCredit.alt_fallback -eq "") "Expected pure photo credits not to invent fallback alt text."

$mapCaption = Get-ImportedImageCaptionMetadata "Burmese Python Range | FL FWC | 2019"
Assert-True ([bool]$mapCaption.is_caption) "Expected descriptive pipe-delimited captions to be recognized."
Assert-True ([string]$mapCaption.alt_fallback -eq "Burmese Python Range") "Expected descriptive first caption segment to become fallback alt text."

$wrappedPhotoHtml = Wrap-ImportedFigureCaptionsInHtml '<p><img src="https://cdn.example.com/photo.jpeg" alt=""></p><p>Photo by Markus Spiske on Unsplash</p><p>Body paragraph.</p>'
Assert-True ($wrappedPhotoHtml -match '<figure><img src="https://cdn\.example\.com/photo\.jpeg" alt=""><figcaption>Photo by Markus Spiske on Unsplash</figcaption></figure>') "Expected image + photo credit paragraphs to be normalized into a figure."

$wrappedMapHtml = Wrap-ImportedFigureCaptionsInHtml '<p><img src="https://cdn.example.com/map.jpeg" alt=""></p><blockquote><p>Burmese Python Range | FL FWC | 2019</p></blockquote><p>Body paragraph.</p>'
Assert-True ($wrappedMapHtml -match 'alt="Burmese Python Range"') "Expected descriptive blockquote captions to populate fallback alt text in normalized HTML."
Assert-True ($wrappedMapHtml -match '<figcaption>Burmese Python Range \| FL FWC \| 2019</figcaption>') "Expected descriptive blockquote captions to become figure captions."

$mergedPhotoMarkdown = Merge-ImportedImageCaptions "![](https://cdn.example.com/photo.jpeg)`n`nPhoto by Markus Spiske on Unsplash`n`nBody paragraph.`n"
Assert-True ($mergedPhotoMarkdown -match '!\[\]\(https://cdn\.example\.com/photo\.jpeg "Photo by Markus Spiske on Unsplash"\)') "Expected markdown image + photo credit patterns to be merged into an image title."

$mergedMapMarkdown = Merge-ImportedImageCaptions "![](https://cdn.example.com/map.jpeg)`n`n> Burmese Python Range | FL FWC | 2019`n`nBody paragraph.`n"
Assert-True ($mergedMapMarkdown -match '!\[Burmese Python Range\]\(https://cdn\.example\.com/map\.jpeg "Burmese Python Range \| FL FWC \| 2019"\)') "Expected descriptive caption lines to become a titled image with fallback alt text."

$explicitAltMarkdown = Merge-ImportedImageCaptions "![Original chart alt](https://cdn.example.com/chart.jpeg)`n`nSource: Congressional Budget Office`n`nBody paragraph.`n"
Assert-True ($explicitAltMarkdown -match '!\[Original chart alt\]\(https://cdn\.example\.com/chart\.jpeg "Source: Congressional Budget Office"\)') "Expected explicit source alt text to be preserved when adding a caption title."

$fallbackHtml = Convert-HtmlFallback '<figure><img src="https://cdn.example.com/chart.jpeg" alt=""><figcaption>Federal Outlays by Category | Source: CBO</figcaption></figure>'
Assert-True ($fallbackHtml -match '!\[Federal Outlays by Category\]\(https://cdn\.example\.com/chart\.jpeg "Federal Outlays by Category \| Source: CBO"\)') "Expected fallback HTML conversion to preserve figure captions and derive safe alt text."

$recoveryScriptPath = Join-Path $repoRoot "scripts/recover_medium_body_images.ps1"
$recoveryAst = [System.Management.Automation.Language.Parser]::ParseFile($recoveryScriptPath, [ref]$null, [ref]$null)
$recoveryFunctions = $recoveryAst.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
  }, $true)
foreach ($name in @("Get-CaptionPlainText", "Get-AltFromCaption", "New-RecoveredMarkdownImage")) {
  Invoke-Expression (Import-SharedFunction -Functions $recoveryFunctions -Name $name -SourcePath $recoveryScriptPath)
}

$recoveredImageDestination = 'oip-image:medium/fixture'
foreach ($case in @(
    @{ Caption = '*HBO Logo Timeline \| Source: Me lol*'; Alt = 'HBO Logo Timeline' },
    @{ Caption = '*HBO Classic Titles \| Source: User with ChatGPT*'; Alt = 'HBO Classic Titles' },
    @{ Caption = '*Tommy Boy Classic Quote \| Source: Movieclips.com*'; Alt = 'Tommy Boy Classic Quote' },
    @{ Caption = '*Fixture Chart | Source: Archive*'; Alt = 'Fixture Chart' }
  )) {
  $originalCaption = $case.Caption
  $recoveredAlt = Get-AltFromCaption -Alt '' -Caption $case.Caption
  Assert-True ($recoveredAlt -ceq $case.Alt) "Expected caption separator escapes not to leak into recovered alt text: $originalCaption"
  $recoveredImage = New-RecoveredMarkdownImage -Alt $recoveredAlt -Destination $recoveredImageDestination
  Assert-True ($recoveredImage -ceq ('![{0}]({1})' -f $case.Alt, $recoveredImageDestination)) "Expected valid image Markdown for recovered caption: $originalCaption"
  Assert-True ($case.Caption -ceq $originalCaption) "Alt derivation must preserve the original caption."
}

$explicitRecoveryAlt = Get-AltFromCaption -Alt 'Original chart alt' -Caption '*A different caption \| Source: Archive*'
Assert-True ($explicitRecoveryAlt -ceq 'Original chart alt') "Expected recovery to preserve explicit alt text instead of replacing it with a caption."
Assert-True ((New-RecoveredMarkdownImage -Alt $explicitRecoveryAlt -Destination $recoveredImageDestination) -ceq '![Original chart alt](oip-image:medium/fixture)') "Expected ordinary explicit alt text to remain unchanged."
$literalRecoveryAlt = Get-AltFromCaption -Alt 'Explicit [chart] C:\Images\' -Caption '*Unused caption*'
Assert-True ($literalRecoveryAlt -ceq 'Explicit [chart] C:\Images\') "Expected literal brackets and backslashes to survive alt selection."
Assert-True ((New-RecoveredMarkdownImage -Alt $literalRecoveryAlt -Destination $recoveredImageDestination) -ceq '![Explicit \[chart\] C:\\Images\\](oip-image:medium/fixture)') "Expected brackets and trailing literal backslashes to be safely escaped in recovered image Markdown."
Assert-True ((New-RecoveredMarkdownImage -Alt '' -Destination $recoveredImageDestination) -ceq '![](oip-image:medium/fixture)') "Expected an empty recovered alt to remain valid image Markdown."

Write-Host "Imported content media normalization tests passed."
$global:LASTEXITCODE = 0
exit 0
