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

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Content
  )

  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir -PathType Container)) {
    New-Item -Path $dir -ItemType Directory -Force | Out-Null
  }

  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-TestPowerShellExecutable {
  $wrapper = Join-Path $repoRoot "tools\bin\generated\pwsh.cmd"
  $isWindowsHost = [System.IO.Path]::DirectorySeparatorChar -eq '\'
  if ($isWindowsHost -and (Test-Path -LiteralPath $wrapper -PathType Leaf)) {
    $probeOutput = & $wrapper -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion.ToString()' 2>$null
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($probeOutput -join ''))) {
      return $wrapper
    }
  }

  $currentProcess = Get-Process -Id $PID
  if ($currentProcess.Path -and (Test-Path -LiteralPath $currentProcess.Path -PathType Leaf) -and ([System.IO.Path]::GetFileNameWithoutExtension($currentProcess.Path) -ieq 'pwsh')) {
    return $currentProcess.Path
  }

  $command = Get-Command pwsh -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command -and $command.Source) {
    return $command.Source
  }

  throw "PowerShell 7 is required to run Medium image recovery tests."
}

function New-FixtureSvg {
  param(
    [string]$Path,
    [string]$Label,
    [string]$Fill
  )

  Write-Utf8NoBom -Path $Path -Content @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
  <rect width="120" height="80" fill="$Fill"/>
  <text x="8" y="42" font-size="12" fill="white">$Label</text>
</svg>
"@
}

function Invoke-Git {
  param(
    [string]$Root,
    [string[]]$Arguments
  )

  $output = & git -C $Root @Arguments 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw ("git {0} failed: {1}" -f ($Arguments -join " "), $output)
  }
}

function Get-Sha256Hex {
  param([string]$Path)

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha.ComputeHash([System.IO.File]::ReadAllBytes($Path))
    return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
  }
}

function Get-MarkdownBodyImageUrls {
  param([string]$Markdown)

  $matches = [regex]::Matches($Markdown, '!\[[^\]]*\]\((?<url><[^>]+>|[^\s\)]+)(?:\s+["''][^"'']*["''])?\)')
  @($matches | ForEach-Object { $_.Groups["url"].Value.Trim("<>") })
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repoRoot "scripts\recover_medium_body_images.ps1"
$pwsh = Get-TestPowerShellExecutable
$tempRoot = Join-Path $repoRoot (".tmp-medium-image-recovery-" + [guid]::NewGuid().ToString("N"))

try {
  $essayRoot = Join-Path $tempRoot "content\essays"
  $fixtureRoot = Join-Path $tempRoot "fixtures"
  $staticRoot = Join-Path $tempRoot "static\images\medium\fixture-recovery"
  $reportRoot = Join-Path $tempRoot "reports\medium-image-recovery"
  New-Item -Path $essayRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $fixtureRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $staticRoot -ItemType Directory -Force | Out-Null

  $heroSvg = Join-Path $staticRoot "hero.svg"
  $mapSvg = Join-Path $fixtureRoot "map.svg"
  $chartSvg = Join-Path $fixtureRoot "chart.svg"
  $uncaptionedSvg = Join-Path $fixtureRoot "uncaptioned.svg"
  New-FixtureSvg -Path $heroSvg -Label "hero" -Fill "#444444"
  New-FixtureSvg -Path $mapSvg -Label "map" -Fill "#2255aa"
  New-FixtureSvg -Path $chartSvg -Label "chart" -Fill "#227744"
  New-FixtureSvg -Path $uncaptionedSvg -Label "uncaptioned" -Fill "#aa5522"

  $heroUrl = "https://cdn-images-1.medium.com/max/800/1*hero-fixture.svg"
  $mapUrl = "https://cdn-images-1.medium.com/max/800/1*map-fixture.svg"
  $chartUrl = "https://cdn-images-1.medium.com/max/800/1*chart-fixture.svg"
  $uncaptionedUrl = "https://cdn-images-1.medium.com/max/800/1*uncaptioned-fixture.svg"
  $mapHash = Get-Sha256Hex $mapSvg
  $chartHash = Get-Sha256Hex $chartSvg
  $mapAsset = "/images/medium/fixture-recovery/$mapHash.svg"
  $chartAsset = "/images/medium/fixture-recovery/$chartHash.svg"

  $fixtureMap = [ordered]@{
    $heroUrl = "static/images/medium/fixture-recovery/hero.svg"
    $mapUrl = "fixtures/map.svg"
    $chartUrl = "fixtures/chart.svg"
    $uncaptionedUrl = "fixtures/uncaptioned.svg"
  }
  $fixtureMapPath = Join-Path $tempRoot "download-fixtures.json"
  Write-Utf8NoBom -Path $fixtureMapPath -Content ($fixtureMap | ConvertTo-Json -Depth 5)

  Invoke-Git -Root $tempRoot -Arguments @("init")
  Invoke-Git -Root $tempRoot -Arguments @("config", "user.email", "codex@example.test")
  Invoke-Git -Root $tempRoot -Arguments @("config", "user.name", "Codex Test")

  $essayPath = Join-Path $essayRoot "fixture-recovery.md"
  Write-Utf8NoBom -Path $essayPath -Content @"
---
title: "Fixture Recovery"
date: 2026-01-01
draft: false
slug: "fixture-recovery"
section_label: "Essay"
featured_image: "/images/medium/fixture-recovery/hero.svg"
version: "1.0"
edition: "First web edition"
medium_source_url: "https://medium.com/@outsideinprint/fixture"
---

Opening paragraph.

![]($heroUrl)

*Hero image duplicated from featured image.*

The map paragraph anchors the first useful image.

![]($mapUrl)

*Source: [Map Office](https://example.com/map?utm_source=medium&utm_medium=referral)*

The uncaptioned paragraph should not be restored.

![]($uncaptionedUrl)

The chart paragraph anchors the second useful image.

![]($chartUrl)

*Fixture Chart | [Source](https://example.com/chart?utm_campaign=test&utm_source=medium)*
"@
  Invoke-Git -Root $tempRoot -Arguments @("add", ".")
  Invoke-Git -Root $tempRoot -Arguments @("commit", "-m", "Add imported fixture with Medium images")

  Write-Utf8NoBom -Path $essayPath -Content @"
---
title: "Fixture Recovery"
date: 2026-01-01
draft: false
slug: "fixture-recovery"
section_label: "Essay"
featured_image: "/images/medium/fixture-recovery/hero.svg"
version: "1.0"
edition: "First web edition"
medium_source_url: "https://medium.com/@outsideinprint/fixture"
---

Opening paragraph.

The map paragraph anchors the first useful image.

The uncaptioned paragraph should not be restored.

The chart paragraph anchors the second useful image.
"@
  $currentMarkdown = Get-Content -LiteralPath $essayPath -Raw
  Invoke-Git -Root $tempRoot -Arguments @("add", ".")
  Invoke-Git -Root $tempRoot -Arguments @("commit", "-m", "Remove remote body images")

  & $pwsh -NoLogo -NoProfile -File $scriptPath -Root $tempRoot -Slugs fixture-recovery -DryRun -DownloadFixturePath $fixtureMapPath -ReportDir $reportRoot -ReportStamp dryrun | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) "Expected dry-run recovery to exit cleanly."
  Assert-True ((Get-Content -LiteralPath $essayPath -Raw) -eq $currentMarkdown) "Dry-run must not change essay Markdown."
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $staticRoot "$mapHash.svg") -PathType Leaf)) "Dry-run must not write localized image assets."

  $dryRunReport = Get-Content -LiteralPath (Join-Path $reportRoot "dryrun-recovery.json") -Raw | ConvertFrom-Json
  Assert-True (($dryRunReport.images | Where-Object { $_.status -eq "would_insert" }).Count -eq 2) "Expected two captioned non-hero images to be selected in dry-run."
  Assert-True (($dryRunReport.images | Where-Object { $_.rejection_reason -eq "missing_caption_or_provenance" }).Count -eq 1) "Expected the uncaptioned image to be rejected."
  Assert-True (($dryRunReport.images | Where-Object { $_.rejection_reason -eq "duplicate_existing_or_featured_image_hash" }).Count -eq 1) "Expected the hero duplicate to be skipped by hash."

  & $pwsh -NoLogo -NoProfile -File $scriptPath -Root $tempRoot -Slugs fixture-recovery -Apply -DownloadFixturePath $fixtureMapPath -ReportDir $reportRoot -ReportStamp apply | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) "Expected apply recovery to exit cleanly."

  $updatedMarkdown = Get-Content -LiteralPath $essayPath -Raw
  Assert-True ($updatedMarkdown.Contains("version: `"1.1`"")) "Expected patch version bump after image recovery."
  Assert-True ($updatedMarkdown.Contains("edition: `"Second web edition`"")) "Expected edition ordinal bump after image recovery."
  Assert-True ($updatedMarkdown.Contains("Recovered and localized body images from Medium import archive; no substantive text change.")) "Expected revision history note."
  Assert-True ($updatedMarkdown.Contains("![]($heroUrl)") -eq $false) "Expected hero duplicate CDN image not to be restored."
  Assert-True ($updatedMarkdown.Contains($uncaptionedUrl) -eq $false) "Expected uncaptioned CDN image not to be restored."
  Assert-True ($updatedMarkdown.Contains($mapAsset)) "Expected map asset to be inserted with deterministic hash path."
  Assert-True ($updatedMarkdown.Contains($chartAsset)) "Expected chart asset to be inserted with deterministic hash path."
  Assert-True ($updatedMarkdown.Contains("*Source: [Map Office](https://example.com/map)*")) "Expected Medium tracking params to be removed from map caption."
  Assert-True ($updatedMarkdown.Contains("*Fixture Chart | [Source](https://example.com/chart)*")) "Expected Medium tracking params to be removed from chart caption."
  Assert-True (Test-Path -LiteralPath (Join-Path $staticRoot "$mapHash.svg") -PathType Leaf) "Expected localized map asset to be written."
  Assert-True (Test-Path -LiteralPath (Join-Path $staticRoot "$chartHash.svg") -PathType Leaf) "Expected localized chart asset to be written."

  foreach ($url in (Get-MarkdownBodyImageUrls $updatedMarkdown | Where-Object { $_ -match '^/images/medium/' })) {
    $localPath = Join-Path $tempRoot ("static\" + ($url.TrimStart("/") -replace '/', '\'))
    Assert-True (Test-Path -LiteralPath $localPath -PathType Leaf) "Expected body image asset to exist under static: $url"
  }

  $applyReport = Get-Content -LiteralPath (Join-Path $reportRoot "apply-recovery.json") -Raw | ConvertFrom-Json
  Assert-True (($applyReport.images | Where-Object { $_.status -eq "inserted" }).Count -eq 2) "Expected apply report to mark two images inserted."
  Assert-True (($applyReport.images | Where-Object { $_.local_path -eq $mapAsset -and $_.sha256 -eq $mapHash -and $_.width -eq 120 -and $_.height -eq 80 }).Count -eq 1) "Expected deterministic map path, hash, and dimensions in report."
  Assert-True (($applyReport.images | Where-Object { $_.local_path -eq $chartAsset -and $_.sha256 -eq $chartHash -and $_.width -eq 120 -and $_.height -eq 80 }).Count -eq 1) "Expected deterministic chart path, hash, and dimensions in report."

  $beforeSecondApply = Get-Content -LiteralPath $essayPath -Raw
  & $pwsh -NoLogo -NoProfile -File $scriptPath -Root $tempRoot -Slugs fixture-recovery -Apply -DownloadFixturePath $fixtureMapPath -ReportDir $reportRoot -ReportStamp apply-again | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) "Expected second apply recovery to exit cleanly."
  Assert-True ((Get-Content -LiteralPath $essayPath -Raw) -eq $beforeSecondApply) "Expected second apply to be idempotent."
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

$missingRepoImages = New-Object System.Collections.Generic.List[string]
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $repoRoot "content\essays") -Recurse -File -Filter "*.md") {
  $markdown = Get-Content -LiteralPath $file.FullName -Raw
  foreach ($url in (Get-MarkdownBodyImageUrls $markdown | Where-Object { $_ -match '^/images/medium/' })) {
    $localPath = Join-Path $repoRoot ("static\" + ($url.TrimStart("/") -replace '/', '\'))
    if (-not (Test-Path -LiteralPath $localPath -PathType Leaf)) {
      $relativePath = [System.IO.Path]::GetRelativePath($repoRoot, $file.FullName) -replace '\\', '/'
      $missingRepoImages.Add("$relativePath -> $url")
    }
  }
}
Assert-True ($missingRepoImages.Count -eq 0) ("Expected every /images/medium/ body image in repo essays to exist under static/. Missing: {0}" -f ($missingRepoImages -join "; "))

Write-Host "Medium image recovery tests passed."
exit 0
