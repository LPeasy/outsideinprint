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
$pwsh = Join-Path $repoRoot "tools\bin\generated\pwsh.cmd"
if (-not (Test-Path -LiteralPath $pwsh -PathType Leaf)) {
  throw "The repo-local PowerShell wrapper is required to run essay guardrail tests."
}

$tempRoot = Join-Path $repoRoot (".tmp-essay-guardrails-" + [guid]::NewGuid().ToString("N"))

try {
  $scriptRoot = Join-Path $tempRoot "scripts"
  $essayRoot = Join-Path $tempRoot "content/essays"
  $reportRoot = Join-Path $tempRoot "content/reports"
  $workingPaperRoot = Join-Path $tempRoot "content/working-papers"
  $sydRoot = Join-Path $tempRoot "content/syd-and-oliver"
  $refinementRoot = Join-Path $tempRoot "docs/editorial-audits/99-refinement"
  New-Item -Path $scriptRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $essayRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $reportRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $workingPaperRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $sydRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $refinementRoot -ItemType Directory -Force | Out-Null

  Copy-Item (Join-Path $repoRoot "scripts/audit_legacy_essays.ps1") $scriptRoot
  Copy-Item (Join-Path $repoRoot "scripts/check_essay_guardrails.ps1") $scriptRoot
  Copy-Item (Join-Path $repoRoot "scripts/check_legacy_import_preflight.ps1") $scriptRoot

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
featured_image: "/images/social/clean-essay.png"
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
title: "AI Tell Subtitle"
date: 2025-07-14
draft: false
slug: "ai-tell-subtitle"
section_label: "Essay"
subtitle: "OpenAI's missed targets did not just expose a software forecast. They exposed a wager on chips, contracts, substations, and time."
description: "A subtitle fixture with a forbidden contrast scaffold."
featured_image: "/images/social/ai-tell-subtitle.png"
version: "1.0"
edition: "First web edition"
featured: false
---

## Overview

This paragraph is fine.
'@ | Set-Content -Path (Join-Path $essayRoot "ai-tell-subtitle.md") -Encoding UTF8

  @'
---
title: "Inflation Myths: Why Private Banks, Not Just Government Spending, Drive Prices Up"
date: 2025-07-14
draft: false
slug: "allowed-not-just-title"
section_label: "Essay"
subtitle: ""
description: "A title fixture that uses not just without the banned two-sentence scaffold."
featured_image: "/images/social/allowed-not-just-title.png"
version: "1.0"
edition: "First web edition"
featured: false
---

## Overview

This paragraph is fine.
'@ | Set-Content -Path (Join-Path $essayRoot "allowed-not-just-title.md") -Encoding UTF8

  @'
---
title: "Slug Echo"
date: 2025-07-14
draft: false
slug: "slug-echo"
section_label: "Essay"
subtitle: ""
description: "An imported essay whose localized media path includes the slug."
featured_image: "/images/medium/slug-echo/example.png"
version: "1.0"
edition: "First web edition"
pdf: "/pdfs/slug-echo.pdf"
featured: false
medium_source_url: "https://medium.com/@example/slug-echo"
---

![](/images/medium/slug-echo/example.png)

This paragraph is fine.
'@ | Set-Content -Path (Join-Path $essayRoot "slug-echo.md") -Encoding UTF8

  @'
---
title: "Placeholder Hero Conflict"
date: 2025-07-14
draft: false
slug: "placeholder-hero-conflict"
section_label: "Essay"
subtitle: ""
description: "A placeholder hero fixture."
featured_image: "/images/social/outside-in-print-default.png"
version: "1.0"
edition: "First web edition"
featured: false
---

![](https://example.com/lead.png)

This paragraph is fine.
'@ | Set-Content -Path (Join-Path $essayRoot "placeholder-hero-conflict.md") -Encoding UTF8

  @'
---
title: "Missing Hero Lead"
date: 2025-07-14
draft: false
slug: "missing-hero-lead"
section_label: "Essay"
subtitle: ""
description: "A missing hero fixture."
version: "1.0"
edition: "First web edition"
featured: false
---

![](https://example.com/lead.png)

This paragraph is fine.
'@ | Set-Content -Path (Join-Path $essayRoot "missing-hero-lead.md") -Encoding UTF8

  @'
---
title: "Duplicate Hero Lead"
date: 2025-07-14
draft: false
slug: "duplicate-hero-lead"
section_label: "Essay"
subtitle: ""
description: "A duplicate hero fixture."
featured_image: "/images/medium/duplicate-hero-lead/lead.png"
version: "1.0"
edition: "First web edition"
featured: false
---

![](/images/medium/duplicate-hero-lead/lead.png)

This paragraph is fine.
'@ | Set-Content -Path (Join-Path $essayRoot "duplicate-hero-lead.md") -Encoding UTF8

  @'
---
title: "Current Hero Wins Conflict"
date: 2025-07-14
draft: false
slug: "current-hero-wins-conflict"
section_label: "Essay"
subtitle: ""
description: "A current hero wins fixture."
featured_image: "/images/medium/current-hero-wins-conflict/hero.png"
version: "1.0"
edition: "First web edition"
featured: false
---

![](https://example.com/lead.png)

This paragraph is fine.
'@ | Set-Content -Path (Join-Path $essayRoot "current-hero-wins-conflict.md") -Encoding UTF8

  $guardrailScript = Join-Path $scriptRoot "check_essay_guardrails.ps1"
  $legacyPreflightScript = Join-Path $scriptRoot "check_legacy_import_preflight.ps1"

  @'
{
  "batch_id": "2026-04-28",
  "selection_policy": "test",
  "campaign_complete": false,
  "essays": [
    {
      "title": "Blocker Essay",
      "slug": "blocker-essay",
      "source_file": "content/essays/blocker.md",
      "live_url": "https://outsideinprint.org/essays/blocker-essay/"
    }
  ]
}
'@ | Set-Content -Path (Join-Path $tempRoot ".oip-daily-batch.json") -Encoding UTF8

  $batchPreflightOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $legacyPreflightScript -Root $tempRoot -BatchPath ".oip-daily-batch.json" 2>&1 | Out-String
  $batchPreflightExit = $LASTEXITCODE
  Assert-True ($batchPreflightExit -eq 1) "Expected legacy import preflight batch scan to fail on concrete Medium import residue."
  Assert-True ($batchPreflightOutput.Contains("remote_medium_body_image")) "Expected batch preflight to flag remote Medium body images."
  Assert-True ($batchPreflightOutput.Contains("medium_punctuation_artifact")) "Expected batch preflight to flag Medium punctuation or mojibake artifacts."

  $blockerOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/blocker.md" 2>&1 | Out-String
  $blockerExit = $LASTEXITCODE
  Assert-True ($blockerExit -eq 1) "Expected blocker essay to fail the guardrail check."
  Assert-True ($blockerOutput.Contains("BLOCKER essays/blocker.md")) "Expected blocker output to identify the failing essay."
  Assert-True ($blockerOutput.Contains("duplicated_title")) "Expected blocker output to include duplicated_title."
  Assert-True ($blockerOutput.Contains("embed_remnants")) "Expected blocker output to include embed_remnants."
  Assert-True ($blockerOutput.Contains("medium_cdn_media")) "Expected blocker output to include medium_cdn_media."
  Assert-True ($blockerOutput.Contains("mojibake")) "Expected blocker output to include mojibake."
  Assert-True ($blockerOutput.Contains("Legacy import preflight summary")) "Expected guardrails to run the focused legacy import preflight."
  Assert-True ($blockerOutput.Contains("remote_medium_body_image")) "Expected guardrails to include legacy import preflight findings."

  $aiTellSubtitleOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/ai-tell-subtitle.md" 2>&1 | Out-String
  $aiTellSubtitleExit = $LASTEXITCODE
  Assert-True ($aiTellSubtitleExit -eq 1) "Expected forbidden title/subtitle AI-tell scaffolds to fail the guardrail check."
  Assert-True ($aiTellSubtitleOutput.Contains("ai_tell_title_subtitle_structure")) "Expected forbidden title/subtitle scaffold output to include ai_tell_title_subtitle_structure."

  $allowedNotJustTitleOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/allowed-not-just-title.md" 2>&1 | Out-String
  $allowedNotJustTitleExit = $LASTEXITCODE
  Assert-True ($allowedNotJustTitleExit -eq 0) "Expected non-scaffold not-just title phrasing to remain allowed."
  Assert-True (-not $allowedNotJustTitleOutput.Contains("ai_tell_title_subtitle_structure")) "Expected non-scaffold not-just title phrasing not to trigger the title/subtitle AI-tell rule."

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

  $blockerRequireFeaturedImageOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/blocker.md" -RequireFeaturedImage 2>&1 | Out-String
  $blockerRequireFeaturedImageExit = $LASTEXITCODE
  Assert-True ($blockerRequireFeaturedImageExit -eq 1) "Expected RequireFeaturedImage to keep failing essays without explicit social images."
  Assert-True ($blockerRequireFeaturedImageOutput.Contains("BLOCKER essays/blocker.md")) "Expected RequireFeaturedImage output to keep identifying the failing essay."

  $cleanOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/clean.md" 2>&1 | Out-String
  $cleanExit = $LASTEXITCODE
  Assert-True ($cleanExit -eq 0) "Expected clean essay to pass the guardrail check."
  Assert-True ($cleanOutput.Contains("Essay guardrails PASSED.")) "Expected clean essay output to report success."

  $cleanRequireFeaturedImageOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/clean.md" -RequireFeaturedImage 2>&1 | Out-String
  $cleanRequireFeaturedImageExit = $LASTEXITCODE
  Assert-True ($cleanRequireFeaturedImageExit -eq 0) "Expected essays with featured_image to satisfy RequireFeaturedImage."
  Assert-True ($cleanRequireFeaturedImageOutput.Contains("Essay guardrails PASSED.")) "Expected RequireFeaturedImage clean output to report success."

  $cleanMissingPhilosophyOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/clean.md" -RequireEditorialPhilosophyAudit 2>&1 | Out-String
  $cleanMissingPhilosophyExit = $LASTEXITCODE
  Assert-True ($cleanMissingPhilosophyExit -eq 1) "Expected RequireEditorialPhilosophyAudit to fail without audit evidence."
  Assert-True ($cleanMissingPhilosophyOutput.Contains("missing_editorial_philosophy_audit")) "Expected missing philosophy audit output."

  @'
# OIP 99-Point Refinement Report

## Editorial Philosophy Audit

Decision: PASS

Evidence: PASS
Logic: PASS
Incentives: PASS
Tradeoffs: PASS
Consequences: PASS
Uncertainty: PASS
Institutional Behavior: PASS
'@ | Set-Content -Path (Join-Path $refinementRoot "clean-essay-99-refinement-report.md") -Encoding UTF8

  $cleanRequirePhilosophyOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/clean.md" -RequireEditorialPhilosophyAudit 2>&1 | Out-String
  $cleanRequirePhilosophyExit = $LASTEXITCODE
  Assert-True ($cleanRequirePhilosophyExit -eq 0) "Expected RequireEditorialPhilosophyAudit to pass with valid OIP-99 report evidence."
  Assert-True ($cleanRequirePhilosophyOutput.Contains("Essay guardrails PASSED.")) "Expected philosophy audit clean output to report success."

  @'
---
title: "Clean Report"
date: 2025-07-14
draft: false
slug: "clean-report"
section_label: "Report"
description: "A clean report fixture."
version: "1.0"
edition: "First web edition"
featured: false
---

## Overview

This report paragraph is fine.
'@ | Set-Content -Path (Join-Path $reportRoot "clean-report.md") -Encoding UTF8

  @'
---
title: "Clean Working Paper"
date: 2025-07-14
draft: false
slug: "clean-working-paper"
section_label: "Working Paper"
description: "A clean working paper fixture."
version: "1.0"
edition: "First web edition"
featured: false
---

## Overview

This working paper paragraph is fine.
'@ | Set-Content -Path (Join-Path $workingPaperRoot "clean-working-paper.md") -Encoding UTF8

  @'
---
title: "Syd Dialogue"
date: 2025-07-14
draft: false
slug: "syd-dialogue"
section_label: "Dialogue"
library_type: "dialogue"
description: "A Syd and Oliver dialogue fixture."
version: "1.0"
edition: "First web edition"
featured: false
---

Syd: This line is fine.
'@ | Set-Content -Path (Join-Path $sydRoot "syd-dialogue.md") -Encoding UTF8

  $reportMissingPhilosophyOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/reports/clean-report.md" -RequireEditorialPhilosophyAudit 2>&1 | Out-String
  $reportMissingPhilosophyExit = $LASTEXITCODE
  Assert-True ($reportMissingPhilosophyExit -eq 1) "Expected reports to require Editorial Philosophy Audit evidence."
  Assert-True ($reportMissingPhilosophyOutput.Contains("missing_editorial_philosophy_audit")) "Expected missing philosophy audit output for reports."

  $workingPaperMissingPhilosophyOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/working-papers/clean-working-paper.md" -RequireEditorialPhilosophyAudit 2>&1 | Out-String
  $workingPaperMissingPhilosophyExit = $LASTEXITCODE
  Assert-True ($workingPaperMissingPhilosophyExit -eq 1) "Expected working papers to require Editorial Philosophy Audit evidence."
  Assert-True ($workingPaperMissingPhilosophyOutput.Contains("missing_editorial_philosophy_audit")) "Expected missing philosophy audit output for working papers."

  $sydPhilosophyOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/syd-and-oliver/syd-dialogue.md" -RequireEditorialPhilosophyAudit 2>&1 | Out-String
  $sydPhilosophyExit = $LASTEXITCODE
  Assert-True ($sydPhilosophyExit -eq 0) "Expected Syd and Oliver dialogue pieces to remain outside the hard philosophy audit gate."
  Assert-True (-not $sydPhilosophyOutput.Contains("missing_editorial_philosophy_audit")) "Expected Syd and Oliver dialogue pieces not to report missing philosophy audit evidence."

  @'
# OIP 99-Point Refinement Report

## Editorial Philosophy Audit

Decision: PASS

Evidence: PASS
Logic: PASS
Incentives: PASS
Tradeoffs: PASS
Consequences: PASS
Uncertainty: PASS
Institutional Behavior: PASS
'@ | Set-Content -Path (Join-Path $refinementRoot "clean-report-99-refinement-report.md") -Encoding UTF8

  @'
# OIP 99-Point Refinement Report

## Editorial Philosophy Audit

Decision: PASS

Evidence: PASS
Logic: PASS
Incentives: PASS
Tradeoffs: PASS
Consequences: PASS
Uncertainty: PASS
Institutional Behavior: PASS
'@ | Set-Content -Path (Join-Path $refinementRoot "clean-working-paper-99-refinement-report.md") -Encoding UTF8

  $reportRequirePhilosophyOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/reports/clean-report.md" -RequireEditorialPhilosophyAudit 2>&1 | Out-String
  $reportRequirePhilosophyExit = $LASTEXITCODE
  Assert-True ($reportRequirePhilosophyExit -eq 0) "Expected reports to pass with valid OIP-99 report evidence."
  Assert-True ($reportRequirePhilosophyOutput.Contains("Essay guardrails PASSED.")) "Expected report philosophy audit output to report success."

  $workingPaperRequirePhilosophyOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/working-papers/clean-working-paper.md" -RequireEditorialPhilosophyAudit 2>&1 | Out-String
  $workingPaperRequirePhilosophyExit = $LASTEXITCODE
  Assert-True ($workingPaperRequirePhilosophyExit -eq 0) "Expected working papers to pass with valid OIP-99 report evidence."
  Assert-True ($workingPaperRequirePhilosophyOutput.Contains("Essay guardrails PASSED.")) "Expected working paper philosophy audit output to report success."

  $slugEchoOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/slug-echo.md" 2>&1 | Out-String
  $slugEchoExit = $LASTEXITCODE
  Assert-True ($slugEchoExit -eq 0) "Expected localized media paths to avoid duplicated_title false positives."
  Assert-True (-not $slugEchoOutput.Contains("duplicated_title")) "Expected slug-only media paths not to trigger duplicated_title."

  $placeholderHeroOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/placeholder-hero-conflict.md" 2>&1 | Out-String
  $placeholderHeroExit = $LASTEXITCODE
  Assert-True ($placeholderHeroExit -eq 1) "Expected placeholder hero conflicts to fail the guardrail check."
  Assert-True ($placeholderHeroOutput.Contains("hero_placeholder_conflict")) "Expected placeholder hero conflicts to be reported as blockers."

  $missingHeroOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/missing-hero-lead.md" 2>&1 | Out-String
  $missingHeroExit = $LASTEXITCODE
  Assert-True ($missingHeroExit -eq 1) "Expected missing-hero lead-image cases to fail the guardrail check."
  Assert-True ($missingHeroOutput.Contains("hero_missing_with_lead")) "Expected missing hero lead-image cases to be reported as blockers."

  $duplicateHeroOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/duplicate-hero-lead.md" 2>&1 | Out-String
  $duplicateHeroExit = $LASTEXITCODE
  Assert-True ($duplicateHeroExit -eq 0) "Expected duplicate hero/body cases to remain warnings by default."
  Assert-True ($duplicateHeroOutput.Contains("hero_duplicate_lead")) "Expected duplicate hero/body cases to be reported as warnings."

  $currentHeroWinsOutput = & $pwsh -NoProfile -ExecutionPolicy Bypass -File $guardrailScript -Root $tempRoot -Paths "content/essays/current-hero-wins-conflict.md" 2>&1 | Out-String
  $currentHeroWinsExit = $LASTEXITCODE
  Assert-True ($currentHeroWinsExit -eq 0) "Expected current-hero-wins conflicts to remain warnings by default."
  Assert-True ($currentHeroWinsOutput.Contains("hero_current_wins_conflict")) "Expected current-hero-wins conflicts to be reported as warnings."
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Essay guardrail tests passed."
$global:LASTEXITCODE = 0
exit 0
