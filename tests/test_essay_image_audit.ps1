#requires -Version 7.0
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
$auditScript = Join-Path $repoRoot "scripts/audit_essay_images.ps1"
$tempRoot = Join-Path $repoRoot (".tmp-essay-image-audit-" + [guid]::NewGuid().ToString("N"))

try {
  $essayRoot = Join-Path $tempRoot "content/essays"
  $imageRoot = Join-Path $tempRoot "static/images/essays/clean"
  $placeholderRoot = Join-Path $tempRoot "static/images/essays/placeholder"
  New-Item -Path $essayRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $imageRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $placeholderRoot -ItemType Directory -Force | Out-Null
  [System.IO.File]::WriteAllBytes((Join-Path $imageRoot "hero.png"), [byte[]](0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))
  @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">
  <title>Imported image placeholder</title>
  <desc>Localized placeholder retained to remove runtime dependency on Medium CDN.</desc>
</svg>
'@ | Set-Content -Path (Join-Path $placeholderRoot "hero.svg") -Encoding UTF8

  @'
---
title: "Clean"
date: 2026-01-01
draft: false
featured_image: "/images/essays/clean/hero.png"
---

Body.
'@ | Set-Content -Path (Join-Path $essayRoot "clean.md") -Encoding UTF8

  @'
---
title: "No Image"
date: 2026-01-01
draft: false
---

Body.
'@ | Set-Content -Path (Join-Path $essayRoot "no-image.md") -Encoding UTF8

  @'
---
title: "Exempt"
date: 2026-01-01
draft: false
image_exempt: true
image_exempt_reason: "Text-only archival notice."
---

Body.
'@ | Set-Content -Path (Join-Path $essayRoot "exempt.md") -Encoding UTF8

  @'
---
title: "Missing"
date: 2026-01-01
draft: false
featured_image: "/images/essays/missing/hero.png"
---

![](/images/essays/missing/body.png)
'@ | Set-Content -Path (Join-Path $essayRoot "missing.md") -Encoding UTF8

  @'
---
title: "Remote"
date: 2026-01-01
draft: false
featured_image: "/images/essays/clean/hero.png"
---

![](https://cdn-images-1.medium.com/max/800/example.png)
'@ | Set-Content -Path (Join-Path $essayRoot "remote.md") -Encoding UTF8

  @'
---
title: "Placeholder"
date: 2026-01-01
draft: false
featured_image: "/images/essays/placeholder/hero.svg"
---

Body.
'@ | Set-Content -Path (Join-Path $essayRoot "placeholder.md") -Encoding UTF8

  $jsonOutput = & $auditScript -Root $tempRoot -Json 2>&1 | Out-String
  $auditExit = $LASTEXITCODE
  Assert-True ($auditExit -eq 0) "Expected JSON audit run to complete without FailOnIssues."
  $report = $jsonOutput | ConvertFrom-Json
  Assert-True ($report.issue_count -eq 5) "Expected five image issues in the fixture audit."
  Assert-True (($report.issues | Where-Object Type -eq 'no_image').Count -eq 1) "Expected only the non-exempt no-image essay to be reported."
  Assert-True (($report.issues | Where-Object Type -eq 'missing_local_image').Count -eq 2) "Expected two missing local image references."
  Assert-True (($report.issues | Where-Object Type -eq 'external_medium_image').Count -eq 1) "Expected one external Medium image reference."
  Assert-True (($report.issues | Where-Object Type -eq 'placeholder_svg').Count -eq 1) "Expected one placeholder SVG issue."
  Assert-True ($report.warning_count -eq 0) "Expected placeholder SVGs to be hard issues, not warnings."

  $failOutput = & $auditScript -Root $tempRoot -FailOnIssues 2>&1 | Out-String
  $failExit = $LASTEXITCODE
  Assert-True ($failExit -eq 1) "Expected -FailOnIssues to fail when image issues exist."
  Assert-True ($failOutput.Contains("ISSUE no_image")) "Expected text output to include no_image issue details."
  Assert-True ($failOutput.Contains("ISSUE placeholder_svg")) "Expected text output to include placeholder_svg issue details."
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

Write-Host "Essay image audit tests passed."
exit 0
