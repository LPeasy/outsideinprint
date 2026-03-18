Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$preflightScript = Join-Path $repoRoot "scripts/preflight.ps1"
$shellCommand = Get-Command pwsh -ErrorAction SilentlyContinue
if ($null -eq $shellCommand) {
  $shellCommand = Get-Command powershell.exe -ErrorAction SilentlyContinue
}
if ($null -eq $shellCommand) {
  throw "A PowerShell host executable is required to run PDF preflight tests."
}

function New-TestRoot {
  $root = Join-Path ([System.IO.Path]::GetTempPath()) ("oip-pdf-preflight-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  return $root
}

function Write-TestMarkdown {
  param(
    [string]$ContentRoot,
    [string]$Slug
  )

  $essayRoot = Join-Path $ContentRoot "essays"
  New-Item -ItemType Directory -Force -Path $essayRoot | Out-Null
  @"
---
title: "$Slug"
date: 2026-03-17
draft: false
slug: "$Slug"
section_label: "Essay"
version: "1.0"
edition: "Fixture edition"
pdf: "/pdfs/$Slug.pdf"
---

Fixture body for $Slug.
"@ | Set-Content -Path (Join-Path $essayRoot "$Slug.md") -Encoding UTF8
}

function Write-ValidPdf {
  param([string]$Path)

  $content = @"
%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 1 /Kids [3 0 R] >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
"@
  [System.IO.File]::WriteAllText($Path, $content + (" " * 400), [System.Text.UTF8Encoding]::new($false))
}

function Write-BuildMeta {
  param(
    [string]$BuildMetaRoot,
    [string]$Slug,
    [string]$RenderStatus,
    [int]$OmittedRemoteImages,
    [int]$RawHtmlScore,
    [string]$FailureCause = "",
    [string]$FailureDetail = ""
  )

  New-Item -ItemType Directory -Force -Path $BuildMetaRoot | Out-Null
  $meta = [ordered]@{
    slug = $Slug
    engine = "typst"
    variant = "essay"
    auto_engine_selected = $false
    render_status = $RenderStatus
    placeholder_count = 0
    omitted_remote_images = $OmittedRemoteImages
    localized_remote_images = 0
    local_image_count = 0
    raw_html_score = $RawHtmlScore
    failure_cause = $FailureCause
    failure_detail = $FailureDetail
  }
  ($meta | ConvertTo-Json -Depth 5) | Set-Content -Path (Join-Path $BuildMetaRoot "$Slug.pdfmeta.json") -Encoding UTF8
}

function Write-CatalogEntry {
  param(
    [string]$CatalogPath,
    [string]$Slug,
    [string]$RenderStatus,
    [int]$OmittedRemoteImages,
    [int]$RawHtmlScore
  )

  $dir = Split-Path -Path $CatalogPath -Parent
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $catalog = [ordered]@{}
  $catalog[$Slug] = [ordered]@{
    slug = $Slug
    engine = "typst"
    render_status = $RenderStatus
    omitted_remote_images = $OmittedRemoteImages
    raw_html_score = $RawHtmlScore
    placeholder_count = 0
    auto_engine_selected = $false
    failure_cause = ""
    failure_detail = ""
  }
  ($catalog | ConvertTo-Json -Depth 5) | Set-Content -Path $CatalogPath -Encoding UTF8
}

function Invoke-Preflight {
  param(
    [string]$Root,
    [switch]$StrictPdfQuality
  )

  $commandArgs = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $preflightScript,
    "-ContentRoot",
    (Join-Path $Root "content"),
    "-PdfRoot",
    (Join-Path $Root "static/pdfs"),
    "-PdfCatalogPath",
    (Join-Path $Root "data/pdfs/catalog.json"),
    "-BuildMetaRoot",
    (Join-Path $Root "resources/typst_build")
  )
  if ($StrictPdfQuality) {
    $commandArgs += "-StrictPdfQuality"
  }

  $output = & $shellCommand.Source @commandArgs 2>&1 | Out-String
  return [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = $output
  }
}

function Assert-True {
  param([bool]$Condition,[string]$Message)
  if (-not $Condition) {
    throw $Message
  }
}

$rootsToClean = New-Object System.Collections.Generic.List[string]
try {
  $successRoot = New-TestRoot
  $rootsToClean.Add($successRoot)
  Write-TestMarkdown -ContentRoot (Join-Path $successRoot "content") -Slug "primary-case"
  New-Item -ItemType Directory -Force -Path (Join-Path $successRoot "static/pdfs") | Out-Null
  Write-ValidPdf -Path (Join-Path $successRoot "static/pdfs/primary-case.pdf")
  Write-BuildMeta -BuildMetaRoot (Join-Path $successRoot "resources/typst_build") -Slug "primary-case" -RenderStatus "primary" -OmittedRemoteImages 0 -RawHtmlScore 0
  Write-CatalogEntry -CatalogPath (Join-Path $successRoot "data/pdfs/catalog.json") -Slug "primary-case" -RenderStatus "unknown" -OmittedRemoteImages 0 -RawHtmlScore 0

  $success = Invoke-Preflight -Root $successRoot
  Assert-True ($success.ExitCode -eq 0) "Expected success preflight fixture to pass. Output:`n$($success.Output)"
  Assert-True ($success.Output -match 'Preflight PASSED\.') "Expected clean preflight pass output."

  $warningRoot = New-TestRoot
  $rootsToClean.Add($warningRoot)
  Write-TestMarkdown -ContentRoot (Join-Path $warningRoot "content") -Slug "warning-case"
  New-Item -ItemType Directory -Force -Path (Join-Path $warningRoot "static/pdfs") | Out-Null
  Write-ValidPdf -Path (Join-Path $warningRoot "static/pdfs/warning-case.pdf")
  Write-BuildMeta -BuildMetaRoot (Join-Path $warningRoot "resources/typst_build") -Slug "warning-case" -RenderStatus "fallback" -OmittedRemoteImages 4 -RawHtmlScore 18 -FailureCause "raw_html" -FailureDetail "fixture fallback"
  Write-CatalogEntry -CatalogPath (Join-Path $warningRoot "data/pdfs/catalog.json") -Slug "warning-case" -RenderStatus "unknown" -OmittedRemoteImages 0 -RawHtmlScore 0

  $warning = Invoke-Preflight -Root $warningRoot
  Assert-True ($warning.ExitCode -eq 0) "Expected warning preflight fixture to pass without strict mode. Output:`n$($warning.Output)"
  Assert-True ($warning.Output -match 'Fallback PDFs:\s+1') "Expected preflight to count fallback PDFs from build metadata."
  Assert-True ($warning.Output -match 'Remote-image placeholders:\s+4') "Expected preflight to count omitted remote images from build metadata."
  Assert-True ($warning.Output -match 'Preflight PASSED with PDF quality warnings\.') "Expected warning-level preflight status."

  $strictWarning = Invoke-Preflight -Root $warningRoot -StrictPdfQuality
  Assert-True ($strictWarning.ExitCode -ne 0) "Expected strict preflight fixture to fail on the same warning state."
  Assert-True ($strictWarning.Output -match 'FALLBACK PDF DETECTED') "Expected strict mode to surface the fallback diagnostic."
}
finally {
  foreach ($root in $rootsToClean) {
    if (Test-Path $root) {
      Remove-Item -Recurse -Force $root
    }
  }
}

Write-Host "PDF preflight tests passed."
$global:LASTEXITCODE = 0
exit 0
