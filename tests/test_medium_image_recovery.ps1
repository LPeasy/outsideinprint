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

function Copy-FixturePng {
  param(
    [string]$Source,
    [string]$Path,
    [string]$Label
  )

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -Path $directory -ItemType Directory -Force | Out-Null
  }
  Copy-Item -LiteralPath $Source -Destination $Path -Force
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Could not create $Label PNG fixture."
  }
}

function Get-ImageDimensions {
  param([string]$Path)

  Add-Type -AssemblyName System.Drawing
  $image = [System.Drawing.Image]::FromFile($Path)
  try {
    return [pscustomobject]@{ Width = [int]$image.Width; Height = [int]$image.Height }
  }
  finally {
    $image.Dispose()
  }
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
  $managedRoot = Join-Path $tempRoot "assets\images\originals\medium"
  $reportRoot = Join-Path $tempRoot "reports\medium-image-recovery"
  New-Item -Path $essayRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $fixtureRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $staticRoot -ItemType Directory -Force | Out-Null

  $spriteRoot = Join-Path $repoRoot 'assets\images\paper-route\sprites\intro'
  $heroPng = Join-Path $staticRoot "hero.png"
  $mapPng = Join-Path $fixtureRoot "map.png"
  $authorPng = Join-Path $fixtureRoot "author.png"
  $chartPng = Join-Path $fixtureRoot "chart.png"
  $uncaptionedPng = Join-Path $fixtureRoot "uncaptioned.png"
  $importOnlyPng = Join-Path $fixtureRoot "import-only.png"
  Copy-FixturePng -Source (Join-Path $spriteRoot 'end-run-edition-unfold-01.png') -Path $heroPng -Label "hero"
  Copy-FixturePng -Source (Join-Path $spriteRoot 'end-run-edition-unfold-02.png') -Path $mapPng -Label "map"
  Copy-FixturePng -Source (Join-Path $spriteRoot 'end-run-edition-unfold-03.png') -Path $authorPng -Label "author"
  Copy-FixturePng -Source (Join-Path $spriteRoot 'end-run-edition-unfold-04.png') -Path $chartPng -Label "chart"
  Copy-FixturePng -Source (Join-Path $spriteRoot 'end-run-front-page-oip.png') -Path $uncaptionedPng -Label "uncaptioned"
  Copy-FixturePng -Source (Join-Path $spriteRoot 'end-run-bob-skid-chill-06.png') -Path $importOnlyPng -Label "import-only"

  $heroUrl = "https://cdn-images-1.medium.com/max/800/1*hero-fixture.png"
  $mapUrl = "https://cdn-images-1.medium.com/max/800/1*map-fixture.png"
  $authorUrl = "https://cdn-images-1.medium.com/max/800/1*author-fixture.png"
  $chartUrl = "https://cdn-images-1.medium.com/max/800/1*chart-fixture.png"
  $uncaptionedUrl = "https://cdn-images-1.medium.com/max/800/1*uncaptioned-fixture.png"
  $importOnlyUrl = "https://cdn-images-1.medium.com/max/800/1*import-only-fixture.png"
  $mapHash = Get-Sha256Hex $mapPng
  $authorHash = Get-Sha256Hex $authorPng
  $chartHash = Get-Sha256Hex $chartPng
  $importOnlyHash = Get-Sha256Hex $importOnlyPng
  $mapDimensions = Get-ImageDimensions $mapPng
  $authorDimensions = Get-ImageDimensions $authorPng
  $chartDimensions = Get-ImageDimensions $chartPng
  $mapAsset = "oip-image:medium/$mapHash"
  $authorAsset = "oip-image:medium/$authorHash"
  $chartAsset = "oip-image:medium/$chartHash"
  $importOnlyAsset = "oip-image:medium/$importOnlyHash"

  $fixtureMap = [ordered]@{
    $heroUrl = "static/images/medium/fixture-recovery/hero.png"
    $mapUrl = "fixtures/map.png"
    $authorUrl = "fixtures/author.png"
    $chartUrl = "fixtures/chart.png"
    $uncaptionedUrl = "fixtures/uncaptioned.png"
    $importOnlyUrl = "fixtures/import-only.png"
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
featured_image: "/images/medium/fixture-recovery/hero.png"
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

The author paragraph anchors a generated image.

![]($authorUrl)

Image Generated by Author from Chat GPT

The uncaptioned paragraph should not be restored.

![]($uncaptionedUrl)

The chart paragraph anchors the second useful image.

![]($chartUrl)

*Fixture Chart | [Source](https://example.com/chart?utm_campaign=test&utm_source=medium)*
"@

  $importOnlyPath = Join-Path $essayRoot "import-only-recovery.md"
  Write-Utf8NoBom -Path $importOnlyPath -Content @"
---
title: "Import Only Recovery"
date: 2026-01-02
draft: false
slug: "import-only-recovery"
section_label: "Essay"
featured_image: "/images/social/outside-in-print-default.png"
version: "1.0"
edition: "First web edition"
medium_source_url: "https://medium.com/@outsideinprint/import-only"
---

## Import Only Section

This essay has no image URLs in git history. Its only image candidate comes from the import report.
"@

  $importReportPath = Join-Path $tempRoot "reports\medium-import-20260101-000000.json"
  $importReport = [ordered]@{
    run = [ordered]@{ started_at = "2026-01-01T00:00:00-05:00" }
    totals = [ordered]@{ converted = 1 }
    entries = @(
      [ordered]@{
        source_file = "import-only.html"
        title = "Import Only Recovery"
        canonical_url = "https://medium.com/@outsideinprint/import-only"
        slug = "import-only-recovery"
        status = "converted"
        output_path = ".\content\essays\import-only-recovery.md"
        word_count = 100
        image_count = 1
        media_failed = 1
        warnings = @("media_fetch_failed:$importOnlyUrl")
      }
    )
  }
  Write-Utf8NoBom -Path $importReportPath -Content ($importReport | ConvertTo-Json -Depth 8)

  Invoke-Git -Root $tempRoot -Arguments @("add", ".")
  Invoke-Git -Root $tempRoot -Arguments @("commit", "-m", "Add imported fixture with Medium images")

  Write-Utf8NoBom -Path $essayPath -Content @"
---
title: "Fixture Recovery"
date: 2026-01-01
draft: false
slug: "fixture-recovery"
section_label: "Essay"
featured_image: "/images/medium/fixture-recovery/hero.png"
version: "1.0"
edition: "First web edition"
medium_source_url: "https://medium.com/@outsideinprint/fixture"
---

Opening paragraph.

The first useful map paragraph anchors this image.

The author paragraph anchors a generated image.

The uncaptioned paragraph should not be restored.

The chart paragraph anchors the second useful image.
"@
  $currentMarkdown = Get-Content -LiteralPath $essayPath -Raw
  $currentImportOnlyMarkdown = Get-Content -LiteralPath $importOnlyPath -Raw
  Invoke-Git -Root $tempRoot -Arguments @("add", ".")
  Invoke-Git -Root $tempRoot -Arguments @("commit", "-m", "Remove remote body images")

  & $pwsh -NoLogo -NoProfile -File $scriptPath -Root $tempRoot -Slugs fixture-recovery,import-only-recovery -DryRun -DownloadFixturePath $fixtureMapPath -ReportDir $reportRoot -ReportStamp dryrun -EnableFuzzyPlacement -AllowArchiveProvenanceCaption | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) "Expected dry-run recovery to exit cleanly."
  Assert-True ((Get-Content -LiteralPath $essayPath -Raw) -eq $currentMarkdown) "Dry-run must not change essay Markdown."
  Assert-True ((Get-Content -LiteralPath $importOnlyPath -Raw) -eq $currentImportOnlyMarkdown) "Dry-run must not change import-only essay Markdown."
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $managedRoot "$mapHash.png") -PathType Leaf)) "Dry-run must not write localized image assets."
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $managedRoot "$importOnlyHash.png") -PathType Leaf)) "Dry-run must not write import-report localized assets."

  $dryRunReport = Get-Content -LiteralPath (Join-Path $reportRoot "dryrun-recovery.json") -Raw | ConvertFrom-Json
  Assert-True (@($dryRunReport.images | Where-Object { $_.status -eq "would_insert" }).Count -eq 4) "Expected four recoverable images to be selected in dry-run."
  Assert-True (@($dryRunReport.images | Where-Object { $_.rejection_reason -eq "missing_caption_or_provenance" }).Count -eq 1) "Expected the uncaptioned image to be rejected."
  Assert-True (@($dryRunReport.images | Where-Object { $_.rejection_reason -eq "duplicate_existing_or_featured_image_hash" }).Count -eq 1) "Expected the hero duplicate to be skipped by hash."
  Assert-True (@($dryRunReport.images | Where-Object { $_.source_url -eq $importOnlyUrl -and $_.candidate_source -eq "import_report" -and $_.fallback_caption_used -eq $true -and $_.placement_method -eq "section_order_fallback" }).Count -eq 1) "Expected import-report image to use archive provenance caption and section-order placement."
  Assert-True (@($dryRunReport.images | Where-Object { $_.source_url -eq $mapUrl -and $_.placement_method -eq "fuzzy_paragraph" }).Count -eq 1) "Expected rewritten map anchor to be placed by fuzzy paragraph matching."

  & $pwsh -NoLogo -NoProfile -File $scriptPath -Root $tempRoot -Slugs fixture-recovery,import-only-recovery -Apply -DownloadFixturePath $fixtureMapPath -ReportDir $reportRoot -ReportStamp apply -EnableFuzzyPlacement -AllowArchiveProvenanceCaption | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) "Expected apply recovery to exit cleanly."

  $updatedMarkdown = Get-Content -LiteralPath $essayPath -Raw
  $updatedImportOnlyMarkdown = Get-Content -LiteralPath $importOnlyPath -Raw
  Assert-True ($updatedMarkdown.Contains("version: `"1.1`"")) "Expected patch version bump after image recovery."
  Assert-True ($updatedMarkdown.Contains("edition: `"Second web edition`"")) "Expected edition ordinal bump after image recovery."
  Assert-True ($updatedImportOnlyMarkdown.Contains("version: `"1.1`"")) "Expected import-only patch version bump after image recovery."
  Assert-True ($updatedMarkdown.Contains("Recovered and localized body images from Medium import archive; no substantive text change.")) "Expected revision history note."
  Assert-True ($updatedMarkdown.Contains("![]($heroUrl)") -eq $false) "Expected hero duplicate CDN image not to be restored."
  Assert-True ($updatedMarkdown.Contains($uncaptionedUrl) -eq $false) "Expected uncaptioned CDN image not to be restored."
  Assert-True ($updatedMarkdown.Contains($mapAsset)) "Expected map asset to be inserted with deterministic hash path."
  Assert-True ($updatedMarkdown.Contains($authorAsset)) "Expected author-generated asset to be inserted with deterministic hash path."
  Assert-True ($updatedMarkdown.Contains($chartAsset)) "Expected chart asset to be inserted with deterministic hash path."
  Assert-True ($updatedImportOnlyMarkdown.Contains($importOnlyAsset)) "Expected import-report asset to be inserted with deterministic hash path."
  Assert-True ($updatedMarkdown.Contains("*Source: [Map Office](https://example.com/map)*")) "Expected Medium tracking params to be removed from map caption."
  Assert-True ($updatedMarkdown.Contains("*Image Generated by Author from ChatGPT*")) "Expected clear author provenance caption to be accepted and normalized."
  Assert-True ($updatedMarkdown.Contains("*Fixture Chart | [Source](https://example.com/chart)*")) "Expected Medium tracking params to be removed from chart caption."
  Assert-True ($updatedImportOnlyMarkdown.Contains("*Recovered from the original Medium import archive; original caption unavailable.*")) "Expected import-report fallback caption."
  Assert-True (Test-Path -LiteralPath (Join-Path $managedRoot "$mapHash.png") -PathType Leaf) "Expected localized map asset under assets/images/originals."
  Assert-True (Test-Path -LiteralPath (Join-Path $managedRoot "$authorHash.png") -PathType Leaf) "Expected localized author asset under assets/images/originals."
  Assert-True (Test-Path -LiteralPath (Join-Path $managedRoot "$chartHash.png") -PathType Leaf) "Expected localized chart asset under assets/images/originals."
  Assert-True (Test-Path -LiteralPath (Join-Path $managedRoot "$importOnlyHash.png") -PathType Leaf) "Expected localized import-report asset under assets/images/originals."
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $staticRoot "$mapHash.png"))) "Recovery must not duplicate new managed images under static/."

  $fixtureManifest = Get-Content -LiteralPath (Join-Path $tempRoot 'data\image-assets.json') -Raw | ConvertFrom-Json -Depth 20
  foreach ($url in ((Get-MarkdownBodyImageUrls $updatedMarkdown) + (Get-MarkdownBodyImageUrls $updatedImportOnlyMarkdown) | Where-Object { $_ -match '^oip-image:medium/' })) {
    $id = $url.Substring('oip-image:'.Length)
    $entry = $fixtureManifest.assets.$id
    Assert-True ($null -ne $entry) "Expected body image ID to be registered: $url"
    $localPath = Join-Path (Join-Path $tempRoot 'assets') ([string]$entry.source)
    Assert-True (Test-Path -LiteralPath $localPath -PathType Leaf) "Expected body image source to exist outside static/: $url"
  }

  $applyReport = Get-Content -LiteralPath (Join-Path $reportRoot "apply-recovery.json") -Raw | ConvertFrom-Json
  Assert-True (@($applyReport.images | Where-Object { $_.status -eq "inserted" }).Count -eq 4) "Expected apply report to mark four images inserted."
  Assert-True (@($applyReport.images | Where-Object { $_.local_path -eq $mapAsset -and $_.sha256 -eq $mapHash -and $_.width -eq $mapDimensions.Width -and $_.height -eq $mapDimensions.Height }).Count -eq 1) "Expected deterministic map ID, hash, and dimensions in report."
  Assert-True (@($applyReport.images | Where-Object { $_.local_path -eq $authorAsset -and $_.sha256 -eq $authorHash -and $_.width -eq $authorDimensions.Width -and $_.height -eq $authorDimensions.Height }).Count -eq 1) "Expected deterministic author ID, hash, and dimensions in report."
  Assert-True (@($applyReport.images | Where-Object { $_.local_path -eq $chartAsset -and $_.sha256 -eq $chartHash -and $_.width -eq $chartDimensions.Width -and $_.height -eq $chartDimensions.Height }).Count -eq 1) "Expected deterministic chart ID, hash, and dimensions in report."
  Assert-True (@($applyReport.images | Where-Object { $_.local_path -eq $importOnlyAsset -and $_.sha256 -eq $importOnlyHash -and $_.candidate_source -eq "import_report" }).Count -eq 1) "Expected deterministic import-report path, hash, and provenance in report."

  $beforeSecondApply = Get-Content -LiteralPath $essayPath -Raw
  $beforeSecondImportOnlyApply = Get-Content -LiteralPath $importOnlyPath -Raw
  & $pwsh -NoLogo -NoProfile -File $scriptPath -Root $tempRoot -Slugs fixture-recovery,import-only-recovery -Apply -DownloadFixturePath $fixtureMapPath -ReportDir $reportRoot -ReportStamp apply-again -EnableFuzzyPlacement -AllowArchiveProvenanceCaption | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) "Expected second apply recovery to exit cleanly."
  Assert-True ((Get-Content -LiteralPath $essayPath -Raw) -eq $beforeSecondApply) "Expected second apply to be idempotent."
  Assert-True ((Get-Content -LiteralPath $importOnlyPath -Raw) -eq $beforeSecondImportOnlyApply) "Expected second import-only apply to be idempotent."
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

$missingRepoImages = New-Object System.Collections.Generic.List[string]
$repoRawMediumUrls = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $repoRoot "content\essays") -Recurse -File -Filter "*.md") {
  $markdown = Get-Content -LiteralPath $file.FullName -Raw
  foreach ($url in (Get-MarkdownBodyImageUrls $markdown | Where-Object { $_ -match '^/images/medium/' })) {
    Assert-True ([System.IO.Path]::GetExtension($url).ToLowerInvariant() -in @('.jpg','.jpeg')) "Expected focused cleanup to retire every raw Medium PNG/GIF body reference: $url"
    [void]$repoRawMediumUrls.Add($url)
    $localPath = Join-Path $repoRoot ("static\" + ($url.TrimStart("/") -replace '/', '\'))
    if (-not (Test-Path -LiteralPath $localPath -PathType Leaf)) {
      $relativePath = [System.IO.Path]::GetRelativePath($repoRoot, $file.FullName) -replace '\\', '/'
      $missingRepoImages.Add("$relativePath -> $url")
    }
  }
}
Assert-True ($missingRepoImages.Count -eq 0) ("Expected every /images/medium/ body image in repo essays to exist under static/. Missing: {0}" -f ($missingRepoImages -join "; "))

$repoStaticMediumRoot = Join-Path $repoRoot 'static/images/medium'
$repoStaticMediumFiles = @(Get-ChildItem -LiteralPath $repoStaticMediumRoot -File -Recurse)
Assert-True ($repoStaticMediumFiles.Count -eq 316) "Expected exactly 316 retained compact Medium JPEG/JPG files."
Assert-True (@($repoStaticMediumFiles | Where-Object { $_.Extension.ToLowerInvariant() -notin @('.jpg','.jpeg') }).Count -eq 0) "Expected no Medium PNG/GIF to remain under static/."

$allEssayText = @(
  Get-ChildItem -LiteralPath (Join-Path $repoRoot 'content/essays') -Recurse -File -Filter '*.md' |
    ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }
) -join "`n"
$allRawMediumMatches = @([regex]::Matches($allEssayText, '(?i)/images/medium/[^\s"''<>\(\)\[\]]+\.(?:png|gif|jpe?g)'))
$allRawMediumUrls = @($allRawMediumMatches | ForEach-Object { $_.Value } | Sort-Object -Unique)
Assert-True ($allRawMediumUrls.Count -eq 316) "Expected exactly 316 unique raw Medium JPEG/JPG references after focused cleanup."
Assert-True (@($allRawMediumUrls | Where-Object { [System.IO.Path]::GetExtension($_).ToLowerInvariant() -notin @('.jpg','.jpeg') }).Count -eq 0) "Expected no raw Medium PNG/GIF reference in essay front matter or body Markdown."

Write-Host "Medium image recovery tests passed."
exit 0
