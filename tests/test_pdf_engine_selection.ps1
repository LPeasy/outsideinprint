Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repoRoot "scripts/build_pdfs_typst_shared.ps1"
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$null, [ref]$null)

function Import-SharedFunction {
  param(
    [System.Management.Automation.Language.FunctionDefinitionAst[]]$Functions,
    [string]$Name
  )

  $functionAst = $Functions | Where-Object { $_.Name -eq $Name } | Select-Object -First 1
  if ($null -eq $functionAst) {
    throw "Could not find function '$Name' in $scriptPath"
  }

  return $functionAst.Extent.Text
}

function Assert-True {
  param([bool]$Condition,[string]$Message)

  if (-not $Condition) {
    throw $Message
  }
}

$functionAsts = $ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
  }, $true)

Invoke-Expression (Import-SharedFunction -Functions $functionAsts -Name "Get-PdfEngineDecision")

$complexityProfile = [pscustomobject]@{
  ShouldUseHtml = $true
}

$autoHtml = Get-PdfEngineDecision -DeclaredEngine "" -ForceTypst:$false -ComplexityProfile $complexityProfile -HtmlRendererUnavailableReason ""
Assert-True ($autoHtml.Engine -eq "html") "Expected HTML-heavy content to auto-select html when the renderer is available."
Assert-True ([bool]$autoHtml.AutoSelected) "Expected auto-select flag for HTML-heavy content when the renderer is available."

$autoTypst = Get-PdfEngineDecision -DeclaredEngine "" -ForceTypst:$false -ComplexityProfile $complexityProfile -HtmlRendererUnavailableReason "node is not available in PATH"
Assert-True ($autoTypst.Engine -eq "typst") "Expected HTML-heavy content to remain on typst when the HTML renderer is unavailable."
Assert-True (-not [bool]$autoTypst.AutoSelected) "Expected auto-select flag to remain false when the HTML renderer is unavailable."

$forcedTypst = Get-PdfEngineDecision -DeclaredEngine "" -ForceTypst:$true -ComplexityProfile $complexityProfile -HtmlRendererUnavailableReason ""
Assert-True ($forcedTypst.Engine -eq "typst") "Expected pdf_force_typst to keep the builder on typst."
Assert-True (-not [bool]$forcedTypst.AutoSelected) "Expected pdf_force_typst to disable auto-selection."

$declaredHtml = Get-PdfEngineDecision -DeclaredEngine "html" -ForceTypst:$false -ComplexityProfile ([pscustomobject]@{ ShouldUseHtml = $false }) -HtmlRendererUnavailableReason "node is not available in PATH"
Assert-True ($declaredHtml.Engine -eq "html") "Expected an explicit html engine declaration to remain html."
Assert-True (-not [bool]$declaredHtml.AutoSelected) "Expected explicit html engine declarations not to be marked as auto-selected."

Write-Host "PDF engine selection tests passed."
$global:LASTEXITCODE = 0
exit 0
