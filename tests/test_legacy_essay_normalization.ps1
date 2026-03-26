Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot ".tools/python.cmd"
$normalizer = Join-Path $repoRoot "scripts/normalize_legacy_medium_essay.py"
$auditScript = Join-Path $repoRoot "scripts/audit_legacy_essays.ps1"

$tempRoot = Join-Path $repoRoot (".tmp-legacy-normalizer-" + [guid]::NewGuid().ToString("N"))

try {
  $essayRoot = Join-Path $tempRoot "content/essays"
  New-Item -Path $essayRoot -ItemType Directory -Force | Out-Null

  $fixturePath = Join-Path $essayRoot "fixture.md"
  @'
---
title: "Fixture Title"
date: 2025-07-14
draft: false
slug: "fixture"
section_label: "Essay"
subtitle: "Fixture Subtitle"
version: "1.0"
edition: "First web edition"
pdf: "/pdfs/fixture.pdf"
featured: false
medium_source_url: "https://medium.com/@example/fixture"
---

July 14th, 2025

Fixture Title

Fixture Subtitle

![](https://cdn.example.com/photo.jpg)

*Inundation Map | [Source](https://example.com/map)*

[Embedded media: https://example.com/embed]

<figure><img src="https://cdn.example.com/chart.jpg" /><figcaption>Range Map | [Source](https://example.com/chart)</figcaption></figure>
'@ | Set-Content -Path $fixturePath -Encoding UTF8

  $reportBefore = Join-Path $tempRoot "reports/before"
  powershell -ExecutionPolicy Bypass -File $auditScript -Root $tempRoot -ReportBasePath $reportBefore | Out-Null

  $before = Get-Content ($reportBefore + ".json") -Raw | ConvertFrom-Json
  $beforeRow = $before.files | Where-Object { $_.slug -eq "fixture" } | Select-Object -First 1
  $beforeIssues = @($beforeRow.issue_types)

  Assert-True ($beforeRow.has_embed_remnants) "Expected the audit to flag embedded media or raw HTML residue before normalization."
  Assert-True ($beforeRow.has_caption_residue) "Expected the audit to flag loose image caption residue before normalization."
  Assert-True ($beforeRow.has_duplicated_title) "Expected the audit to flag duplicated lead metadata before normalization."
  Assert-True ($beforeIssues -contains "embed_remnants") "Expected embed_remnants in the pre-normalization issue list."
  Assert-True ($beforeIssues -contains "caption_residue") "Expected caption_residue in the pre-normalization issue list."

  & $python $normalizer --write $fixturePath | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) "Expected the legacy normalizer to exit cleanly."

  $normalized = Get-Content $fixturePath -Raw
  Assert-True ($normalized -notmatch '(?m)^July 14th, 2025\s*$') "Expected the duplicated lead date to be removed."
  Assert-True ($normalized -notmatch '(?m)^Fixture Title\s*$') "Expected the duplicated lead title to be removed."
  Assert-True ($normalized -notmatch '(?m)^Fixture Subtitle\s*$') "Expected the duplicated lead subtitle to be removed."
  Assert-True ($normalized -match '(?m)^>\s*Inundation Map \| \[Source\]\(https://example\.com/map\)\s*$') "Expected italic image captions to normalize into blockquote captions."
  Assert-True ($normalized -match '(?m)^- \[Embedded media\]\(https://example\.com/embed\)\s*$') "Expected embedded-media placeholders to normalize into markdown links."
  Assert-True ($normalized -notmatch '<figure\b') "Expected raw HTML figure wrappers to be removed."
  Assert-True ($normalized -match '(?m)^>\s*Range Map \| \[Source\]\(https://example\.com/chart\)\s*$') "Expected figure captions to survive as normalized caption blocks."

  $reportAfter = Join-Path $tempRoot "reports/after"
  powershell -ExecutionPolicy Bypass -File $auditScript -Root $tempRoot -ReportBasePath $reportAfter | Out-Null

  $after = Get-Content ($reportAfter + ".json") -Raw | ConvertFrom-Json
  $afterRow = $after.files | Where-Object { $_.slug -eq "fixture" } | Select-Object -First 1
  $afterIssues = @($afterRow.issue_types)

  Assert-True (-not $afterRow.has_embed_remnants) "Expected embedded media and raw HTML residue to clear after normalization."
  Assert-True (-not $afterRow.has_caption_residue) "Expected loose image caption residue to clear after normalization."
  Assert-True (-not $afterRow.has_duplicated_title) "Expected duplicated lead metadata to clear after normalization."
  Assert-True (-not ($afterIssues -contains "embed_remnants")) "Expected embed_remnants to disappear after normalization."
  Assert-True (-not ($afterIssues -contains "caption_residue")) "Expected caption_residue to disappear after normalization."
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Legacy essay normalization regression test passed."
$global:LASTEXITCODE = 0
exit 0
