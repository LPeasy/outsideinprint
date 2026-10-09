#requires -Version 7.0
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$node = Join-Path $repoRoot 'tools/bin/generated/node.cmd'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { $node = (Get-Command node -ErrorAction Stop).Source }
Push-Location $repoRoot
try {
  & $node --test tests/ci_workflow.test.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Structural CI safety checks failed.' }
}
finally { Pop-Location }
Write-Host 'CI safety contract passed.'
