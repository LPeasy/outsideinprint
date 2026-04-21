Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Assert-Match {
  param(
    [string]$Text,
    [string]$Pattern,
    [string]$Message
  )

  if ($Text -notmatch $Pattern) {
    throw $Message
  }
}

function Assert-NotMatch {
  param(
    [string]$Text,
    [string]$Pattern,
    [string]$Message
  )

  if ($Text -match $Pattern) {
    throw $Message
  }
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  }
  finally {
    $listener.Stop()
  }
}

function Write-BytesFromBase64 {
  param(
    [string]$Path,
    [string]$Base64
  )

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -Path $directory -ItemType Directory -Force | Out-Null
  }

  [System.IO.File]::WriteAllBytes($Path, [Convert]::FromBase64String($Base64))
}

function Wait-HttpServerReady {
  param(
    [int]$Port,
    [string]$Path
  )

  $url = "http://127.0.0.1:$Port/$Path"
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
      $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      return
    }
    catch {
      Start-Sleep -Milliseconds 250
    }
  }

  throw "Timed out waiting for local fixture server at $url"
}

function Get-MarkdownBody {
  param([string]$Markdown)

  $match = [regex]::Match($Markdown, '(?s)\A---\r?\n.*?\r?\n---\r?\n?(.*)\z')
  if ($match.Success) {
    return $match.Groups[1].Value
  }

  return $Markdown
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot 'tools\bin\generated\python.cmd'
$normalizer = Join-Path $repoRoot 'scripts\normalize_essay_hero_images.ps1'

$tempRoot = Join-Path $repoRoot ('.tmp-essay-hero-normalization-' + [guid]::NewGuid().ToString('N'))
$serverProcess = $null

try {
  $essayRoot = Join-Path $tempRoot 'content\essays'
  $staticMediumRoot = Join-Path $tempRoot 'static\images\medium'
  $mediaRoot = Join-Path $tempRoot '.tmp-media'
  New-Item -Path $essayRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $staticMediumRoot -ItemType Directory -Force | Out-Null
  New-Item -Path $mediaRoot -ItemType Directory -Force | Out-Null

  $pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZP7sAAAAASUVORK5CYII='
  Write-BytesFromBase64 -Path (Join-Path $mediaRoot 'lead-a.png') -Base64 $pngBase64
  Write-BytesFromBase64 -Path (Join-Path $mediaRoot 'lead-b.png') -Base64 $pngBase64
  Write-BytesFromBase64 -Path (Join-Path $staticMediumRoot 'existing-duplicate\lead.png') -Base64 $pngBase64
  Write-BytesFromBase64 -Path (Join-Path $staticMediumRoot 'current-hero-wins\hero.png') -Base64 $pngBase64
  New-Item -Path (Join-Path $staticMediumRoot 'svg-no-hero') -ItemType Directory -Force | Out-Null
  @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" role="img" aria-label="SVG lead">
  <rect width="20" height="20" fill="#111"/>
  <circle cx="10" cy="10" r="6" fill="#f5f1ea"/>
</svg>
'@ | Set-Content -Path (Join-Path $staticMediumRoot 'svg-no-hero\lead.svg') -Encoding UTF8

  $port = Get-FreeTcpPort
  $serverProcess = Start-Process -FilePath $python -ArgumentList @('-m', 'http.server', $port, '--bind', '127.0.0.1', '--directory', $mediaRoot) -PassThru -WindowStyle Hidden
  Wait-HttpServerReady -Port $port -Path 'lead-a.png'

  @"
---
title: "Remote No Hero"
date: 2026-04-21
draft: false
slug: "remote-no-hero"
section_label: "Essay"
subtitle: ""
description: "Fixture for remote hero promotion."
version: "1.0"
edition: "First web edition"
featured: false
---

![](http://127.0.0.1:$port/lead-a.png)

*River basin overview | Source: Test Archive*

Lead paragraph.
"@ | Set-Content -Path (Join-Path $essayRoot 'remote-no-hero.md') -Encoding UTF8

  @"
---
title: "Placeholder Hero"
date: 2026-04-21
draft: false
slug: "placeholder-hero"
section_label: "Essay"
subtitle: ""
description: "Fixture for placeholder replacement."
featured_image: "/images/social/outside-in-print-default.png"
version: "1.0"
edition: "First web edition"
featured: false
---

![](http://127.0.0.1:$port/lead-b.png)

Photo by Test Photographer on Unsplash

Lead paragraph.
"@ | Set-Content -Path (Join-Path $essayRoot 'placeholder-hero.md') -Encoding UTF8

  @"
---
title: "Blockquote Not Caption"
date: 2026-04-21
draft: false
slug: "blockquote-not-caption"
section_label: "Essay"
subtitle: ""
description: "Fixture for quote preservation."
version: "1.0"
edition: "First web edition"
featured: false
---

![](http://127.0.0.1:$port/lead-a.png)

> "I didn't set out to build an audience."

Lead paragraph.
"@ | Set-Content -Path (Join-Path $essayRoot 'blockquote-not-caption.md') -Encoding UTF8

  @"
---
title: "Pipe Prose Not Caption"
date: 2026-04-21
draft: false
slug: "pipe-prose-not-caption"
section_label: "Essay"
subtitle: ""
description: "Fixture for pipe prose preservation."
version: "1.0"
edition: "First web edition"
featured: false
---

![](http://127.0.0.1:$port/lead-b.png)

Risk | uncertainty | tradeoffs shape every decision.

Lead paragraph.
"@ | Set-Content -Path (Join-Path $essayRoot 'pipe-prose-not-caption.md') -Encoding UTF8

  @'
---
title: "SVG No Hero"
date: 2026-04-21
draft: false
slug: "svg-no-hero"
section_label: "Essay"
subtitle: ""
description: "Fixture for local SVG promotion."
version: "1.0"
edition: "First web edition"
featured: false
---

![Diagram of a stylized signal](/images/medium/svg-no-hero/lead.svg)

Lead paragraph.
'@ | Set-Content -Path (Join-Path $essayRoot 'svg-no-hero.md') -Encoding UTF8

  @'
---
title: "Existing Duplicate"
date: 2026-04-21
draft: false
slug: "existing-duplicate"
section_label: "Essay"
subtitle: ""
description: "Fixture for duplicate hero cleanup."
featured_image: "/images/medium/existing-duplicate/lead.png"
version: "1.0"
edition: "First web edition"
featured: false
---

![](/images/medium/existing-duplicate/lead.png)

Lead paragraph.
'@ | Set-Content -Path (Join-Path $essayRoot 'existing-duplicate.md') -Encoding UTF8

  @"
---
title: "Current Hero Wins"
date: 2026-04-21
draft: false
slug: "current-hero-wins"
section_label: "Essay"
subtitle: ""
description: "Fixture for existing hero preservation."
featured_image: "/images/medium/current-hero-wins/hero.png"
version: "1.0"
edition: "First web edition"
featured: false
---

![](http://127.0.0.1:$port/lead-a.png)

Lead paragraph.
"@ | Set-Content -Path (Join-Path $essayRoot 'current-hero-wins.md') -Encoding UTF8

  $outsideLines = @(
    '---'
    'title: "Outside Heuristic"'
    'date: 2026-04-21'
    'draft: false'
    'slug: "outside-heuristic"'
    'section_label: "Essay"'
    'subtitle: ""'
    'description: "Fixture for heuristic review."'
    'version: "1.0"'
    'edition: "First web edition"'
    'featured: false'
    '---'
    ''
  )
  $outsideLines += @(1..21 | ForEach-Object { "Paragraph $_." })
  $outsideLines += @(
    ''
    "![](http://127.0.0.1:$port/lead-b.png)"
    ''
    'Tail paragraph.'
    ''
  )
  $outsideLines -join "`r`n" | Set-Content -Path (Join-Path $essayRoot 'outside-heuristic.md') -Encoding UTF8

  $reportBase = Join-Path $tempRoot 'reports\essay-hero-normalization'
  & $normalizer -Root $tempRoot -Write -ReportBasePath $reportBase | Out-Null

  $report = Get-Content ($reportBase + '.json') -Raw | ConvertFrom-Json
  $rowsBySlug = @{}
  foreach ($row in @($report.files)) {
    $rowsBySlug[[string]$row.Slug] = $row
  }

  Assert-True ($rowsBySlug['remote-no-hero'].Status -eq 'PROMOTED') 'Expected remote-no-hero to be promoted.'
  Assert-True ($rowsBySlug['placeholder-hero'].Status -eq 'PROMOTED') 'Expected placeholder-hero to be promoted.'
  Assert-True ($rowsBySlug['blockquote-not-caption'].Status -eq 'PROMOTED') 'Expected blockquote-not-caption to be promoted.'
  Assert-True ($rowsBySlug['pipe-prose-not-caption'].Status -eq 'PROMOTED') 'Expected pipe-prose-not-caption to be promoted.'
  Assert-True ($rowsBySlug['svg-no-hero'].Status -eq 'PROMOTED') 'Expected svg-no-hero to be promoted.'
  Assert-True ($rowsBySlug['existing-duplicate'].Status -eq 'DEDUPED_EXISTING_HERO') 'Expected existing-duplicate to dedupe the existing hero.'
  Assert-True ($rowsBySlug['current-hero-wins'].Status -eq 'SKIPPED_CURRENT_HERO_WINS') 'Expected current-hero-wins to keep its existing hero.'
  Assert-True ($rowsBySlug['outside-heuristic'].Status -eq 'REVIEW_LEAD_OUTSIDE_HEURISTIC') 'Expected outside-heuristic to enter the review queue.'

  $remoteNoHero = Get-Content (Join-Path $essayRoot 'remote-no-hero.md') -Raw
  $remoteNoHeroBody = Get-MarkdownBody -Markdown $remoteNoHero
  Assert-Match -Text $remoteNoHero -Pattern '(?m)^featured_image:\s*"/images/medium/remote-no-hero/[a-f0-9]{64}\.png"$' -Message 'Expected remote-no-hero to localize the promoted PNG hero.'
  Assert-Match -Text $remoteNoHero -Pattern '(?m)^featured_image_caption:\s*"River basin overview \| Source: Test Archive"$' -Message 'Expected remote-no-hero to migrate the following caption line.'
  Assert-Match -Text $remoteNoHero -Pattern '(?m)^featured_image_alt:\s*"River basin overview"$' -Message 'Expected remote-no-hero to derive alt text from the descriptive caption segment.'
  Assert-NotMatch -Text $remoteNoHeroBody -Pattern 'http://127\.0\.0\.1:' -Message 'Expected remote-no-hero to remove the promoted remote image from the body.'
  Assert-NotMatch -Text $remoteNoHeroBody -Pattern 'River basin overview \| Source: Test Archive' -Message 'Expected remote-no-hero to remove the migrated caption line from the body.'

  $placeholderHero = Get-Content (Join-Path $essayRoot 'placeholder-hero.md') -Raw
  $placeholderHeroBody = Get-MarkdownBody -Markdown $placeholderHero
  Assert-NotMatch -Text $placeholderHero -Pattern [regex]::Escape('/images/social/outside-in-print-default.png') -Message 'Expected placeholder-hero to replace the placeholder hero.'
  Assert-Match -Text $placeholderHero -Pattern '(?m)^featured_image:\s*"/images/medium/placeholder-hero/[a-f0-9]{64}\.png"$' -Message 'Expected placeholder-hero to localize the replacement hero.'
  Assert-Match -Text $placeholderHero -Pattern '(?m)^featured_image_caption:\s*"Photo by Test Photographer on Unsplash"$' -Message 'Expected placeholder-hero to migrate the provenance caption.'
  Assert-Match -Text $placeholderHero -Pattern '(?m)^featured_image_alt:\s*"Placeholder Hero"$' -Message 'Expected placeholder-hero to fall back to the essay title for non-descriptive provenance captions.'
  Assert-NotMatch -Text $placeholderHeroBody -Pattern 'Photo by Test Photographer on Unsplash' -Message 'Expected placeholder-hero to remove the migrated caption line from the body.'

  $blockquoteNotCaption = Get-Content (Join-Path $essayRoot 'blockquote-not-caption.md') -Raw
  $blockquoteNotCaptionBody = Get-MarkdownBody -Markdown $blockquoteNotCaption
  Assert-NotMatch -Text $blockquoteNotCaption -Pattern '(?m)^featured_image_caption:' -Message 'Expected blockquote-not-caption not to migrate the quote line into a hero caption.'
  Assert-Match -Text $blockquoteNotCaption -Pattern '(?m)^featured_image_alt:\s*"Blockquote Not Caption"$' -Message 'Expected blockquote-not-caption to fall back to the essay title for alt text.'
  Assert-Match -Text $blockquoteNotCaptionBody -Pattern '(?m)^>\s*"I didn''t set out to build an audience\."$' -Message 'Expected blockquote-not-caption to preserve the opening quote in the body.'

  $pipeProseNotCaption = Get-Content (Join-Path $essayRoot 'pipe-prose-not-caption.md') -Raw
  $pipeProseNotCaptionBody = Get-MarkdownBody -Markdown $pipeProseNotCaption
  Assert-NotMatch -Text $pipeProseNotCaption -Pattern '(?m)^featured_image_caption:' -Message 'Expected pipe-prose-not-caption not to migrate pipe-delimited prose into a hero caption.'
  Assert-Match -Text $pipeProseNotCaption -Pattern '(?m)^featured_image_alt:\s*"Pipe Prose Not Caption"$' -Message 'Expected pipe-prose-not-caption to fall back to the essay title for alt text.'
  Assert-Match -Text $pipeProseNotCaptionBody -Pattern '(?m)^Risk \| uncertainty \| tradeoffs shape every decision\.$' -Message 'Expected pipe-prose-not-caption to preserve the pipe-delimited prose line in the body.'

  $svgNoHero = Get-Content (Join-Path $essayRoot 'svg-no-hero.md') -Raw
  Assert-Match -Text $svgNoHero -Pattern '(?m)^featured_image:\s*"/images/medium/svg-no-hero/lead\.svg"$' -Message 'Expected svg-no-hero to promote the local SVG path directly.'
  Assert-Match -Text $svgNoHero -Pattern '(?m)^featured_image_alt:\s*"Diagram of a stylized signal"$' -Message 'Expected svg-no-hero to reuse the markdown alt text.'
  Assert-NotMatch -Text $svgNoHero -Pattern '(?m)^!\[Diagram of a stylized signal\]\(/images/medium/svg-no-hero/lead\.svg\)$' -Message 'Expected svg-no-hero to remove the promoted SVG from the body.'

  $existingDuplicate = Get-Content (Join-Path $essayRoot 'existing-duplicate.md') -Raw
  Assert-Match -Text $existingDuplicate -Pattern '(?m)^featured_image:\s*"/images/medium/existing-duplicate/lead\.png"$' -Message 'Expected existing-duplicate to keep its current hero.'
  Assert-Match -Text $existingDuplicate -Pattern '(?m)^featured_image_alt:\s*"Existing Duplicate"$' -Message 'Expected existing-duplicate to fall back to the essay title for alt text.'
  Assert-NotMatch -Text $existingDuplicate -Pattern '(?m)^!\[\]\(/images/medium/existing-duplicate/lead\.png\)$' -Message 'Expected existing-duplicate to remove the duplicated body image.'

  $currentHeroWins = Get-Content (Join-Path $essayRoot 'current-hero-wins.md') -Raw
  Assert-Match -Text $currentHeroWins -Pattern '(?m)^featured_image:\s*"/images/medium/current-hero-wins/hero\.png"$' -Message 'Expected current-hero-wins to preserve the existing hero.'
  Assert-Match -Text $currentHeroWins -Pattern 'http://127\.0\.0\.1:' -Message 'Expected current-hero-wins to keep the early body image in place for manual review.'

  $outsideHeuristic = Get-Content (Join-Path $essayRoot 'outside-heuristic.md') -Raw
  Assert-NotMatch -Text $outsideHeuristic -Pattern '(?m)^featured_image:' -Message 'Expected outside-heuristic not to receive an auto-promoted hero.'
  Assert-Match -Text $outsideHeuristic -Pattern 'http://127\.0\.0\.1:' -Message 'Expected outside-heuristic to keep the out-of-window body image.'

  $localizedRemoteHero = Join-Path $tempRoot ('static\' + ($rowsBySlug['remote-no-hero'].NewHero.TrimStart('/') -replace '/', '\'))
  $localizedPlaceholderHero = Join-Path $tempRoot ('static\' + ($rowsBySlug['placeholder-hero'].NewHero.TrimStart('/') -replace '/', '\'))
  Assert-True (Test-Path -LiteralPath $localizedRemoteHero -PathType Leaf) 'Expected the promoted remote-no-hero image to be localized on disk.'
  Assert-True (Test-Path -LiteralPath $localizedPlaceholderHero -PathType Leaf) 'Expected the promoted placeholder-hero image to be localized on disk.'
}
finally {
  if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }

  if (Test-Path $tempRoot) {
    Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host 'Essay hero normalization regression test passed.'
$global:LASTEXITCODE = 0
exit 0
