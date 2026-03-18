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

Invoke-Expression (Import-SharedFunction -Functions $functionAsts -Name "Read-JsonFile")
Invoke-Expression (Import-SharedFunction -Functions $functionAsts -Name "Get-PdfEngineDecision")
Invoke-Expression (Import-SharedFunction -Functions $functionAsts -Name "Get-LegacyEssayAuditMap")
Invoke-Expression (Import-SharedFunction -Functions $functionAsts -Name "Get-LegacyEssayAuditEntry")
Invoke-Expression (Import-SharedFunction -Functions $functionAsts -Name "Test-LegacyAuditEntryPrefersHtml")

$complexityProfile = [pscustomobject]@{
  ShouldUseHtml = $true
}

$autoHtml = Get-PdfEngineDecision -DeclaredEngine "" -ForceTypst:$false -ComplexityProfile $complexityProfile -LegacyPrefersHtml:$false -HtmlRendererUnavailableReason ""
Assert-True ($autoHtml.Engine -eq "html") "Expected HTML-heavy content to auto-select html when the renderer is available."
Assert-True ([bool]$autoHtml.AutoSelected) "Expected auto-select flag for HTML-heavy content when the renderer is available."

$autoTypst = Get-PdfEngineDecision -DeclaredEngine "" -ForceTypst:$false -ComplexityProfile $complexityProfile -LegacyPrefersHtml:$false -HtmlRendererUnavailableReason "node is not available in PATH"
Assert-True ($autoTypst.Engine -eq "typst") "Expected HTML-heavy content to remain on typst when the HTML renderer is unavailable."
Assert-True (-not [bool]$autoTypst.AutoSelected) "Expected auto-select flag to remain false when the HTML renderer is unavailable."

$forcedTypst = Get-PdfEngineDecision -DeclaredEngine "" -ForceTypst:$true -ComplexityProfile $complexityProfile -LegacyPrefersHtml:$false -HtmlRendererUnavailableReason ""
Assert-True ($forcedTypst.Engine -eq "typst") "Expected pdf_force_typst to keep the builder on typst."
Assert-True (-not [bool]$forcedTypst.AutoSelected) "Expected pdf_force_typst to disable auto-selection."

$declaredHtml = Get-PdfEngineDecision -DeclaredEngine "html" -ForceTypst:$false -ComplexityProfile ([pscustomobject]@{ ShouldUseHtml = $false }) -LegacyPrefersHtml:$false -HtmlRendererUnavailableReason "node is not available in PATH"
Assert-True ($declaredHtml.Engine -eq "html") "Expected an explicit html engine declaration to remain html."
Assert-True (-not [bool]$declaredHtml.AutoSelected) "Expected explicit html engine declarations not to be marked as auto-selected."

$legacyHtml = Get-PdfEngineDecision -DeclaredEngine "" -ForceTypst:$false -ComplexityProfile ([pscustomobject]@{ ShouldUseHtml = $false }) -LegacyPrefersHtml:$true -HtmlRendererUnavailableReason ""
Assert-True ($legacyHtml.Engine -eq "html") "Expected MANUAL_FIRST legacy audit entries to prefer html when the renderer is available."
Assert-True ([bool]$legacyHtml.AutoSelected) "Expected MANUAL_FIRST legacy audit entries to be treated as auto-selected html content."

$legacyTypst = Get-PdfEngineDecision -DeclaredEngine "" -ForceTypst:$false -ComplexityProfile ([pscustomobject]@{ ShouldUseHtml = $false }) -LegacyPrefersHtml:$true -HtmlRendererUnavailableReason "node is not available in PATH"
Assert-True ($legacyTypst.Engine -eq "typst") "Expected MANUAL_FIRST legacy audit entries to remain on typst when the HTML renderer is unavailable."
Assert-True (-not [bool]$legacyTypst.AutoSelected) "Expected MANUAL_FIRST legacy audit entries not to be marked auto-selected when the renderer is unavailable."

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("oip-legacy-audit-" + [guid]::NewGuid().ToString("N"))
try {
  New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
  $auditPath = Join-Path $testRoot "legacy-essay-audit.json"
  @'
{
  "files": [
    {
      "path": "essays/manual-first-piece.md",
      "slug": "manual-first-piece",
      "risk_tier": "MANUAL_FIRST"
    },
    {
      "path": "essays/manual-light-piece.md",
      "slug": "manual-light-piece",
      "risk_tier": "MANUAL_LIGHT"
    }
  ]
}
'@ | Set-Content -Path $auditPath -Encoding UTF8

  $auditMap = Get-LegacyEssayAuditMap -Path $auditPath
  $manualFirstEntry = Get-LegacyEssayAuditEntry -AuditMap $auditMap -RelativePath "essays/manual-first-piece.md" -Slug "manual-first-piece"
  $manualLightEntry = Get-LegacyEssayAuditEntry -AuditMap $auditMap -RelativePath "essays/manual-light-piece.md" -Slug "manual-light-piece"
  $missingEntry = Get-LegacyEssayAuditEntry -AuditMap $auditMap -RelativePath "essays/missing.md" -Slug "missing"

  Assert-True ($null -ne $manualFirstEntry) "Expected to resolve a MANUAL_FIRST legacy audit entry by path."
  Assert-True ($null -ne $manualLightEntry) "Expected to resolve a MANUAL_LIGHT legacy audit entry by path."
  Assert-True ($null -eq $missingEntry) "Expected missing legacy audit entries to return null."
  Assert-True ((Test-LegacyAuditEntryPrefersHtml -Entry $manualFirstEntry)) "Expected MANUAL_FIRST entries to prefer html."
  Assert-True (-not (Test-LegacyAuditEntryPrefersHtml -Entry $manualLightEntry)) "Expected MANUAL_LIGHT entries not to prefer html."
}
finally {
  if (Test-Path $testRoot) {
    Remove-Item -Recurse -Force $testRoot
  }
}

Write-Host "PDF engine selection tests passed."
$global:LASTEXITCODE = 0
exit 0
