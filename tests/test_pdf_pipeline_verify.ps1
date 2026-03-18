Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$verifyScript = Join-Path $repoRoot "scripts/verify_pdf_pipeline.ps1"
$shellCommand = Get-Command pwsh -ErrorAction SilentlyContinue
if ($null -eq $shellCommand) {
  $shellCommand = Get-Command powershell.exe -ErrorAction SilentlyContinue
}
if ($null -eq $shellCommand) {
  throw "A PowerShell host executable is required to run PDF pipeline verification tests."
}

function New-TestRoot {
  $root = Join-Path ([System.IO.Path]::GetTempPath()) ("oip-pdf-verify-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $root | Out-Null
  return $root
}

function Write-TestMarkdown {
  param(
    [string]$ContentRoot,
    [string]$Section,
    [string]$Slug,
    [string]$Engine
  )

  $sectionDir = Join-Path $ContentRoot $Section
  New-Item -ItemType Directory -Force -Path $sectionDir | Out-Null
  @"
---
title: "$Slug"
date: 2026-03-16
draft: false
slug: "$Slug"
section_label: "Essay"
version: "1.0"
edition: "Fixture edition"
pdf: "/pdfs/$Slug.pdf"
pdf_engine: $Engine
---

Fixture body for $Slug.
"@ | Set-Content -Path (Join-Path $sectionDir "$Slug.md") -Encoding UTF8
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
  $padded = $content + (" " * 400)
  [System.IO.File]::WriteAllText($Path, $padded, [System.Text.UTF8Encoding]::new($false))
}

function Write-BuildMeta {
  param(
    [string]$BuildMetaRoot,
    [string]$Slug,
    [string]$Engine,
    [string]$RenderStatus = "primary",
    [string]$FailureCause = "",
    [string]$FailureDetail = "",
    [string]$SourcePath = ""
  )

  New-Item -ItemType Directory -Force -Path $BuildMetaRoot | Out-Null
  $meta = [ordered]@{
    slug = $Slug
    engine = $Engine
    render_status = $RenderStatus
    failure_cause = $FailureCause
    failure_detail = $FailureDetail
  }
  if (-not [string]::IsNullOrWhiteSpace($SourcePath)) {
    $meta.source_path = $SourcePath
    $meta.source_url = "http://127.0.0.1:43123$SourcePath"
  }
  ($meta | ConvertTo-Json -Depth 5) | Set-Content -Path (Join-Path $BuildMetaRoot "$Slug.pdfmeta.json") -Encoding UTF8
}

function Invoke-Verify {
  param([string]$Root)

  $contentRoot = Join-Path $Root "content"
  $pdfRoot = Join-Path $Root "static/pdfs"
  $buildMetaRoot = Join-Path $Root "resources/typst_build"

  $output = & $shellCommand.Source -NoProfile -File $verifyScript `
    -ContentRoot $contentRoot `
    -PdfRoot $pdfRoot `
    -BuildMetaRoot $buildMetaRoot `
    -SkipToolChecks 2>&1 | Out-String

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
  Write-TestMarkdown -ContentRoot (Join-Path $successRoot "content") -Section "essays" -Slug "html-piece" -Engine "html"
  Write-TestMarkdown -ContentRoot (Join-Path $successRoot "content") -Section "reports" -Slug "typst-piece" -Engine "typst"
  New-Item -ItemType Directory -Force -Path (Join-Path $successRoot "static/pdfs") | Out-Null
  Write-ValidPdf -Path (Join-Path $successRoot "static/pdfs/html-piece.pdf")
  Write-ValidPdf -Path (Join-Path $successRoot "static/pdfs/typst-piece.pdf")
  Write-BuildMeta -BuildMetaRoot (Join-Path $successRoot "resources/typst_build") -Slug "html-piece" -Engine "html" -SourcePath "/essays/html-piece/"
  Write-BuildMeta -BuildMetaRoot (Join-Path $successRoot "resources/typst_build") -Slug "typst-piece" -Engine "typst"
  New-Item -ItemType Directory -Force -Path (Join-Path $successRoot "resources/typst_build/__html_site/essays/html-piece") | Out-Null
  "<html><body>fixture</body></html>" | Set-Content -Path (Join-Path $successRoot "resources/typst_build/__html_site/essays/html-piece/index.html") -Encoding UTF8

  $success = Invoke-Verify -Root $successRoot
  Assert-True ($success.ExitCode -eq 0) "Expected success fixture to pass verification. Output:`n$($success.Output)"
  Assert-True ($success.Output -match "PDF pipeline verification PASSED") "Expected pass output for success fixture."

  $degradedRoot = New-TestRoot
  $rootsToClean.Add($degradedRoot)
  Write-TestMarkdown -ContentRoot (Join-Path $degradedRoot "content") -Section "reports" -Slug "degraded-piece" -Engine "typst"
  New-Item -ItemType Directory -Force -Path (Join-Path $degradedRoot "static/pdfs") | Out-Null
  Write-ValidPdf -Path (Join-Path $degradedRoot "static/pdfs/degraded-piece.pdf")
  Write-BuildMeta -BuildMetaRoot (Join-Path $degradedRoot "resources/typst_build") -Slug "degraded-piece" -Engine "typst" -RenderStatus "fallback" -FailureCause "raw_html" -FailureDetail "fixture fallback"

  $degraded = Invoke-Verify -Root $degradedRoot
  Assert-True ($degraded.ExitCode -eq 0) "Expected explained fallback fixture to pass structural verification. Output:`n$($degraded.Output)"
  Assert-True ($degraded.Output -match "PASSED with degraded renders observed") "Expected degraded verification status output."

  $missingRoot = New-TestRoot
  $rootsToClean.Add($missingRoot)
  Write-TestMarkdown -ContentRoot (Join-Path $missingRoot "content") -Section "essays" -Slug "missing-piece" -Engine "html"
  Write-BuildMeta -BuildMetaRoot (Join-Path $missingRoot "resources/typst_build") -Slug "missing-piece" -Engine "html" -SourcePath "/essays/missing-piece/"
  New-Item -ItemType Directory -Force -Path (Join-Path $missingRoot "resources/typst_build/__html_site/essays/missing-piece") | Out-Null
  "<html><body>fixture</body></html>" | Set-Content -Path (Join-Path $missingRoot "resources/typst_build/__html_site/essays/missing-piece/index.html") -Encoding UTF8

  $missing = Invoke-Verify -Root $missingRoot
  Assert-True ($missing.ExitCode -ne 0) "Expected missing-PDF fixture to fail verification."
  Assert-True ($missing.Output -match "\[missing_pdf\] missing-piece") "Expected missing_pdf diagnostic."

  $corruptRoot = New-TestRoot
  $rootsToClean.Add($corruptRoot)
  Write-TestMarkdown -ContentRoot (Join-Path $corruptRoot "content") -Section "reports" -Slug "corrupt-piece" -Engine "typst"
  New-Item -ItemType Directory -Force -Path (Join-Path $corruptRoot "static/pdfs") | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $corruptRoot "static/pdfs/corrupt-piece.pdf"), ("NOT_A_PDF" + ("x" * 350)), [System.Text.UTF8Encoding]::new($false))
  Write-BuildMeta -BuildMetaRoot (Join-Path $corruptRoot "resources/typst_build") -Slug "corrupt-piece" -Engine "typst"

  $corrupt = Invoke-Verify -Root $corruptRoot
  Assert-True ($corrupt.ExitCode -ne 0) "Expected corrupt-PDF fixture to fail verification."
  Assert-True ($corrupt.Output -match "\[pdf_signature_invalid\] corrupt-piece") "Expected pdf_signature_invalid diagnostic."

  $fallbackRoot = New-TestRoot
  $rootsToClean.Add($fallbackRoot)
  Write-TestMarkdown -ContentRoot (Join-Path $fallbackRoot "content") -Section "reports" -Slug "fallback-piece" -Engine "typst"
  New-Item -ItemType Directory -Force -Path (Join-Path $fallbackRoot "static/pdfs") | Out-Null
  Write-ValidPdf -Path (Join-Path $fallbackRoot "static/pdfs/fallback-piece.pdf")
  Write-BuildMeta -BuildMetaRoot (Join-Path $fallbackRoot "resources/typst_build") -Slug "fallback-piece" -Engine "typst" -RenderStatus "fallback"

  $fallback = Invoke-Verify -Root $fallbackRoot
  Assert-True ($fallback.ExitCode -ne 0) "Expected unexplained typst fallback fixture to fail verification."
  Assert-True ($fallback.Output -match "\[typst_fallback_unexplained\] fallback-piece") "Expected typst_fallback_unexplained diagnostic."
}
finally {
  foreach ($root in $rootsToClean) {
    if (Test-Path $root) {
      Remove-Item -Recurse -Force $root
    }
  }
}

Write-Host "PDF pipeline verification tests passed."
