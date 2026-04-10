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
$pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue | Select-Object -First 1
$pwsh = if ($null -ne $pwshCommand) { $pwshCommand.Source } else { $null }
if ([string]::IsNullOrWhiteSpace($pwsh)) {
  $pwsh = (Get-Process -Id $PID).Path
}

$tempRoot = Join-Path $repoRoot (".tmp-essay-guardrails-" + [guid]::NewGuid().ToString("N"))

try {
  $scriptRoot = Join-Path $tempRoot "scripts"
  $essayRoot = Join-Path $tempRoot "content/essays"
  New-Item -Path $scriptRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $essayRoot -ItemType Directory -Force | Out-Null

  Copy-Item (Join-Path $repoRoot "scripts/audit_legacy_essays.ps1") $scriptRoot
  Copy-Item (Join-Path $repoRoot "scripts/check_essay_guardrails.ps1") $scriptRoot

  @'
---
title: "Blocker Essay"
date: 2025-07-14
draft: false
slug: "blocker-essay"
section_label: "Essay"
subtitle: "Blocker Subtitle"
description: "Blocker description"
version: "1.0"
edition: "First web edition"
pdf: "/pdfs/blocker-essay.pdf"
featured: false
medium_source_url: "https://medium.com/@example/blocker"
---

July 14th, 2025

Blocker Essay

Blocker Subtitle

[Embedded media: https://example.com/embed]

![](https://cdn-images-1.medium.com/max/800/placeholder)

The warning came in â€œlate.â€
'@ | Set-Content -Path (Join-Path $essayRoot "blocker.md") -Encoding UTF8

  @'
---
title: "Warning Essay"
date: 2025-07-14
draft: false
slug: "warning-essay"
section_label: "Essay"
subtitle: ""
version: "1.0"
edition: "First web edition"
pdf: "/pdfs/warning-essay.pdf"
featured: false
---

Overview

This paragraph is fine.
'@ | Set-Content -Path (Join-Path $essayRoot "warning.md") -Encoding UTF8

  @'
---
title: "Clean Essay"
date: 2025-07-14
draft: false
slug: "clean-essay"
section_label: "Essay"
subtitle: ""
description: "A clean essay fixture."
version: "1.0"
edition: "First web edition"
pdf: "/pdfs/clean-essay.pdf"
featured: false
---

## Overview

This paragraph is fine.
'@ | Set-Content -Path (Join-Path $essayRoot "clean.md") -Encoding UTF8

  @'
---
title: "Slug Echo"
date: 2025-07-14
draft: false
slug: "slug-echo"
section_label: "Essay"
subtitle: ""
description: "An imported essay whose localized media path includes the slug."
version: "1.0"
edition: "First web edition"
pdf: "/pdfs/slug-echo.pdf"
featured: false
medium_source_url: "https://medium.com/@example/slug-echo"
---

![](/images/medium/slug-echo/example.png)

This paragraph is fine.
'@ | Set-Content -Path (Join-Path $essayRoot "slug-echo.md") -Encoding UTF8

  $guardrailScript = Join-Path $scriptRoot "check_essay_guardrails.ps1"

  $blockerOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/blocker.md" 2>&1 | Out-String
  $blockerExit = $LASTEXITCODE
  Assert-True ($blockerExit -eq 1) "Expected blocker essay to fail the guardrail check."
  Assert-True ($blockerOutput.Contains("BLOCKER essays/blocker.md")) "Expected blocker output to identify the failing essay."
  Assert-True ($blockerOutput.Contains("duplicated_title")) "Expected blocker output to include duplicated_title."
  Assert-True ($blockerOutput.Contains("embed_remnants")) "Expected blocker output to include embed_remnants."
  Assert-True ($blockerOutput.Contains("medium_cdn_media")) "Expected blocker output to include medium_cdn_media."
  Assert-True ($blockerOutput.Contains("mojibake")) "Expected blocker output to include mojibake."

  $warningOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/warning.md" 2>&1 | Out-String
  $warningExit = $LASTEXITCODE
  Assert-True ($warningExit -eq 0) "Expected warning-only essay to pass by default."
  Assert-True ($warningOutput.Contains("WARNING essays/warning.md")) "Expected warning output to identify the warned essay."
  Assert-True ($warningOutput.Contains("pseudo_headings")) "Expected warning output to include pseudo_headings."
  Assert-True ($warningOutput.Contains("missing_description")) "Expected warning output to include missing_description."

  $strictWarningOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/warning.md" -StrictWarnings 2>&1 | Out-String
  $strictWarningExit = $LASTEXITCODE
  Assert-True ($strictWarningExit -eq 1) "Expected StrictWarnings to fail warning-only essays."
  Assert-True ($strictWarningOutput.Contains("StrictWarnings")) "Expected strict warning output to explain the failure mode."

  $requireDescriptionOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/warning.md" -RequireDescription 2>&1 | Out-String
  $requireDescriptionExit = $LASTEXITCODE
  Assert-True ($requireDescriptionExit -eq 1) "Expected RequireDescription to fail essays missing explicit descriptions."
  Assert-True ($requireDescriptionOutput.Contains("missing_description")) "Expected RequireDescription output to include missing_description as a blocker."

  $cleanOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/clean.md" 2>&1 | Out-String
  $cleanExit = $LASTEXITCODE
  Assert-True ($cleanExit -eq 0) "Expected clean essay to pass the guardrail check."
  Assert-True ($cleanOutput.Contains("Essay guardrails PASSED.")) "Expected clean essay output to report success."

  $slugEchoOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/slug-echo.md" 2>&1 | Out-String
  $slugEchoExit = $LASTEXITCODE
  Assert-True ($slugEchoExit -eq 0) "Expected localized media paths to avoid duplicated_title false positives."
  Assert-True (-not $slugEchoOutput.Contains("duplicated_title")) "Expected slug-only media paths not to trigger duplicated_title."
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Essay guardrail tests passed."
$global:LASTEXITCODE = 0
exit 0
