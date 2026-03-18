Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$auditScript = Join-Path $repoRoot "scripts/audit_pdf_failures.ps1"
$policyPath = Join-Path $repoRoot "data/pdfs/validation-policy.json"
$shellCommand = Get-Command pwsh -ErrorAction SilentlyContinue
if ($null -eq $shellCommand) {
  $shellCommand = Get-Command powershell.exe -ErrorAction SilentlyContinue
}
if ($null -eq $shellCommand) {
  throw "A PowerShell host executable is required to run PDF failure audit tests."
}

function New-TestRoot {
  $root = Join-Path ([System.IO.Path]::GetTempPath()) ("oip-pdf-audit-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  return $root
}

function Write-TestMarkdown {
  param(
    [string]$EssayRoot,
    [string]$Slug
  )

  New-Item -ItemType Directory -Force -Path $EssayRoot | Out-Null
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
"@ | Set-Content -Path (Join-Path $EssayRoot "$Slug.md") -Encoding UTF8
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
    [string]$FailureCause,
    [int]$RawHtmlScore,
    [int]$EmbedCount,
    [int]$OmittedRemoteImages,
    [string]$FailureDetail = "fixture failure"
  )

  New-Item -ItemType Directory -Force -Path $BuildMetaRoot | Out-Null
  $meta = [ordered]@{
    slug = $Slug
    engine = "typst"
    variant = "essay"
    render_status = "fallback"
    failure_cause = $FailureCause
    failure_detail = $FailureDetail
    failure_message = $FailureDetail
    raw_html_score = $RawHtmlScore
    embed_count = $EmbedCount
    omitted_remote_images = $OmittedRemoteImages
    warnings = @()
  }
  ($meta | ConvertTo-Json -Depth 5) | Set-Content -Path (Join-Path $BuildMetaRoot "$Slug.pdfmeta.json") -Encoding UTF8
}

function Write-PrimaryMeta {
  param(
    [string]$BuildMetaRoot,
    [string]$Slug
  )

  New-Item -ItemType Directory -Force -Path $BuildMetaRoot | Out-Null
  $meta = [ordered]@{
    slug = $Slug
    engine = "typst"
    variant = "essay"
    render_status = "primary"
    failure_cause = ""
    failure_detail = ""
    failure_message = ""
    raw_html_score = 0
    embed_count = 0
    omitted_remote_images = 0
    warnings = @()
  }
  ($meta | ConvertTo-Json -Depth 5) | Set-Content -Path (Join-Path $BuildMetaRoot "$Slug.pdfmeta.json") -Encoding UTF8
}

function Write-Stderr {
  param(
    [string]$BuildMetaRoot,
    [string]$Slug,
    [string]$Value
  )

  Set-Content -Path (Join-Path $BuildMetaRoot "$Slug.primary-compile.stderr.txt") -Value $Value -Encoding UTF8
}

function Invoke-Audit {
  param([string]$Root)

  $contentRoot = Join-Path $Root "content/essays"
  $pdfRoot = Join-Path $Root "static/pdfs"
  $buildMetaRoot = Join-Path $Root "resources/typst_build"
  $jsonPath = Join-Path $Root "reports/pdf-failure-audit.json"
  $markdownPath = Join-Path $Root "reports/pdf-failure-audit.md"

  $output = & $shellCommand.Source -NoProfile -ExecutionPolicy Bypass -File $auditScript `
    -ContentRoot $contentRoot `
    -BuildContentRoot (Join-Path $Root "content") `
    -PdfRoot $pdfRoot `
    -BuildMetaRoot $buildMetaRoot `
    -PolicyPath $policyPath `
    -JsonOutputPath $jsonPath `
    -MarkdownOutputPath $markdownPath `
    -SkipToolChecks 2>&1 | Out-String

  return [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = $output
    JsonPath = $jsonPath
    MarkdownPath = $markdownPath
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
  $successEssayRoot = Join-Path $successRoot "content/essays"
  $successPdfRoot = Join-Path $successRoot "static/pdfs"
  $successMetaRoot = Join-Path $successRoot "resources/typst_build"
  New-Item -ItemType Directory -Force -Path $successPdfRoot | Out-Null

  Write-TestMarkdown -EssayRoot $successEssayRoot -Slug "primary-case"
  Write-ValidPdf -Path (Join-Path $successPdfRoot "primary-case.pdf")
  Write-PrimaryMeta -BuildMetaRoot $successMetaRoot -Slug "primary-case"
  Write-Stderr -BuildMetaRoot $successMetaRoot -Slug "primary-case" -Value ""

  $successAudit = Invoke-Audit -Root $successRoot
  Assert-True ($successAudit.ExitCode -eq 0) "Expected success audit fixture to exit cleanly. Output:`n$($successAudit.Output)"
  $successReport = Get-Content $successAudit.JsonPath -Raw | ConvertFrom-Json
  Assert-True ([string]$successReport.summary.validation_status -eq "success") "Expected success fixture to report validation_status=success."

  $contentOnlyRoot = New-TestRoot
  $rootsToClean.Add($contentOnlyRoot)
  $essayRoot = Join-Path $contentOnlyRoot "content/essays"
  $pdfRoot = Join-Path $contentOnlyRoot "static/pdfs"
  $metaRoot = Join-Path $contentOnlyRoot "resources/typst_build"
  New-Item -ItemType Directory -Force -Path $pdfRoot | Out-Null

  foreach ($slug in @("raw-html-case", "embed-case", "mojibake-case", "primary-case")) {
    Write-TestMarkdown -EssayRoot $essayRoot -Slug $slug
    Write-ValidPdf -Path (Join-Path $pdfRoot "$slug.pdf")
  }

  Write-BuildMeta -BuildMetaRoot $metaRoot -Slug "raw-html-case" -FailureCause "raw_html" -RawHtmlScore 24 -EmbedCount 0 -OmittedRemoteImages 0
  Write-BuildMeta -BuildMetaRoot $metaRoot -Slug "embed-case" -FailureCause "embed" -RawHtmlScore 8 -EmbedCount 2 -OmittedRemoteImages 0
  Write-BuildMeta -BuildMetaRoot $metaRoot -Slug "mojibake-case" -FailureCause "mojibake" -RawHtmlScore 2 -EmbedCount 0 -OmittedRemoteImages 0
  Write-PrimaryMeta -BuildMetaRoot $metaRoot -Slug "primary-case"

  Write-Stderr -BuildMetaRoot $metaRoot -Slug "raw-html-case" -Value "error: fallback fixture"
  Write-Stderr -BuildMetaRoot $metaRoot -Slug "embed-case" -Value "error: fallback fixture"
  Write-Stderr -BuildMetaRoot $metaRoot -Slug "mojibake-case" -Value "error: fallback fixture"
  Write-Stderr -BuildMetaRoot $metaRoot -Slug "primary-case" -Value ""

  $contentOnlyAudit = Invoke-Audit -Root $contentOnlyRoot
  Assert-True ($contentOnlyAudit.ExitCode -eq 0) "Expected content-only audit fixture to exit cleanly. Output:`n$($contentOnlyAudit.Output)"
  Assert-True (Test-Path $contentOnlyAudit.JsonPath) "Expected JSON report to be written."
  Assert-True (Test-Path $contentOnlyAudit.MarkdownPath) "Expected Markdown report to be written."

  $contentOnlyReport = Get-Content $contentOnlyAudit.JsonPath -Raw | ConvertFrom-Json
  $contentReasonCodes = @($contentOnlyReport.failures | ForEach-Object { [string]$_.reason_code })
  Assert-True ([string]$contentOnlyReport.summary.validation_status -eq "degraded_allowed") "Expected content-only audit fixture to report validation_status=degraded_allowed."
  Assert-True ([int]$contentOnlyReport.summary.blocking_pipeline_problems -eq 0) "Expected no blocking pipeline problems for content-only fixture."
  Assert-True ([int]$contentOnlyReport.summary.warning_failures -eq 3) "Expected three warning-only failures for content-only fixture."
  Assert-True ($contentReasonCodes -contains "raw_html_complexity") "Expected raw_html_complexity reason code."
  Assert-True ($contentReasonCodes -contains "embed_remnant") "Expected embed_remnant reason code."
  Assert-True ($contentReasonCodes -contains "mojibake_content") "Expected mojibake_content reason code."

  $pipelineRoot = New-TestRoot
  $rootsToClean.Add($pipelineRoot)
  $pipelineEssayRoot = Join-Path $pipelineRoot "content/essays"
  $pipelinePdfRoot = Join-Path $pipelineRoot "static/pdfs"
  $pipelineMetaRoot = Join-Path $pipelineRoot "resources/typst_build"
  New-Item -ItemType Directory -Force -Path $pipelinePdfRoot | Out-Null

  foreach ($slug in @("remote-image-case", "local-image-case")) {
    Write-TestMarkdown -EssayRoot $pipelineEssayRoot -Slug $slug
    Write-ValidPdf -Path (Join-Path $pipelinePdfRoot "$slug.pdf")
  }

  Write-BuildMeta -BuildMetaRoot $pipelineMetaRoot -Slug "remote-image-case" -FailureCause "mojibake" -RawHtmlScore 6 -EmbedCount 0 -OmittedRemoteImages 3
  Write-Stderr -BuildMetaRoot $pipelineMetaRoot -Slug "remote-image-case" -Value "error: unexpected argument`nImage kept on web edition only."

  Write-BuildMeta -BuildMetaRoot $pipelineMetaRoot -Slug "local-image-case" -FailureCause "mojibake" -RawHtmlScore 4 -EmbedCount 0 -OmittedRemoteImages 0
  Write-Stderr -BuildMetaRoot $pipelineMetaRoot -Slug "local-image-case" -Value "error: file not found`n#box(image(""/images/fixture.jpeg""))"

  $pipelineAudit = Invoke-Audit -Root $pipelineRoot
  Assert-True ($pipelineAudit.ExitCode -ne 0) "Expected pipeline audit fixture to fail with a non-zero exit code."

  $pipelineReport = Get-Content $pipelineAudit.JsonPath -Raw | ConvertFrom-Json
  $pipelineReasonCodes = @($pipelineReport.failures | ForEach-Object { [string]$_.reason_code })
  Assert-True ([string]$pipelineReport.summary.validation_status -eq "blocking") "Expected pipeline fixture to report validation_status=blocking."
  Assert-True ([int]$pipelineReport.summary.blocking_pipeline_problems -ge 2) "Expected blocking pipeline problems to be counted for the pipeline fixture."
  Assert-True ($pipelineReasonCodes -contains "remote_image_placeholder_typst") "Expected remote_image_placeholder_typst reason code."
  Assert-True ($pipelineReasonCodes -contains "local_image_path_missing") "Expected local_image_path_missing reason code."
}
finally {
  foreach ($root in $rootsToClean) {
    if (Test-Path $root) {
      Remove-Item -Recurse -Force $root
    }
  }
}

Write-Host "PDF failure audit tests passed."
$global:LASTEXITCODE = 0
exit 0
