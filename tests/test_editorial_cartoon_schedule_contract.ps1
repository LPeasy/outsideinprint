#requires -Version 7.0

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $repoRoot 'data/editorial_cartoons.yaml'
$essayDir = Join-Path $repoRoot 'content/essays'
. (Join-Path (Join-Path $repoRoot 'scripts') 'png_integrity.ps1')

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Convert-YamlScalarToString {
  param([string]$Value)

  $trimmed = $Value.Trim()
  if (($trimmed.StartsWith('"') -and $trimmed.EndsWith('"')) -or ($trimmed.StartsWith("'") -and $trimmed.EndsWith("'"))) {
    return $trimmed.Substring(1, $trimmed.Length - 2)
  }

  return $trimmed
}

function Get-OipEasternTimeZone {
  try {
    return [System.TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')
  }
  catch {
    return [System.TimeZoneInfo]::FindSystemTimeZoneById('America/New_York')
  }
}

function ConvertTo-OipDateTimeOffset {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $trimmed = $Value.Trim()
  if ($trimmed -match '^\d{4}-\d{2}-\d{2}$') {
    $date = [datetime]::ParseExact($trimmed, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $eastern = Get-OipEasternTimeZone
    $offset = $eastern.GetUtcOffset($date)
    return [datetimeoffset]::new($date.Year, $date.Month, $date.Day, 0, 0, 0, $offset)
  }

  $parsed = [datetimeoffset]::MinValue
  if ([datetimeoffset]::TryParse($trimmed, [Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
    return $parsed
  }

  throw "$Label must use yyyy-MM-dd or an ISO timestamp with timezone offset. Received: $Value"
}

function Read-FrontMatter {
  param([string]$Path)

  $result = @{}
  $started = $false
  foreach ($line in [System.IO.File]::ReadLines($Path)) {
    if (-not $started) {
      if ($line -eq '---') {
        $started = $true
        continue
      }

      break
    }

    if ($line -eq '---') {
      break
    }

    if ($line -match '^([A-Za-z0-9_]+):\s*(.*?)\s*$') {
      $result[$Matches[1].ToLowerInvariant()] = Convert-YamlScalarToString -Value $Matches[2]
    }
  }

  return $result
}

function Get-CartoonEntries {
  $current = ''
  $entries = New-Object System.Collections.Generic.List[object]
  $entry = $null

  foreach ($line in [System.IO.File]::ReadLines($dataPath)) {
    if ($line -match '^current:\s*(.+)\s*$') {
      $current = Convert-YamlScalarToString -Value $Matches[1]
      continue
    }

    if ($line -match '^\s*-\s+slug:\s*(.+)\s*$') {
      if ($null -ne $entry) {
        $entries.Add([pscustomobject]$entry)
      }

      $entry = [ordered]@{ slug = Convert-YamlScalarToString -Value $Matches[1] }
      continue
    }

    if ($null -ne $entry -and $line -match '^\s+([A-Za-z0-9_]+):\s*(.*?)\s*$') {
      $entry[$Matches[1]] = Convert-YamlScalarToString -Value $Matches[2]
    }
  }

  if ($null -ne $entry) {
    $entries.Add([pscustomobject]$entry)
  }

  return [pscustomobject]@{
    Current = $current
    Entries = $entries.ToArray()
  }
}

function Resolve-EssayMarkdownPath {
  param([string]$EssayPath)

  if ($EssayPath -notmatch '^/essays/([^/]+)/$') {
    throw "Cartoon essay path must use /essays/<slug>/ format. Received: $EssayPath"
  }

  $slug = $Matches[1]
  $directPath = Join-Path $essayDir "$slug.md"
  if (Test-Path -LiteralPath $directPath -PathType Leaf) {
    return $directPath
  }

  foreach ($file in Get-ChildItem -LiteralPath $essayDir -Filter '*.md' -File -Recurse) {
    $frontMatter = Read-FrontMatter -Path $file.FullName
    if ($frontMatter.ContainsKey('slug') -and [string]$frontMatter['slug'] -eq $slug) {
      return $file.FullName
    }
  }

  throw "Cartoon essay path does not resolve to an essay markdown file: $EssayPath"
}

function Get-EssayReleaseDate {
  param(
    [string]$MarkdownPath,
    [string]$EssayPath
  )

  $frontMatter = Read-FrontMatter -Path $MarkdownPath
  if (-not $frontMatter.ContainsKey('date')) {
    throw "Linked essay $EssayPath is missing front matter date."
  }

  if ($frontMatter.ContainsKey('draft') -and [string]$frontMatter['draft'] -eq 'true') {
    throw "Linked essay $EssayPath is draft:true."
  }

  $releaseValue = if ($frontMatter.ContainsKey('publishdate') -and -not [string]::IsNullOrWhiteSpace([string]$frontMatter['publishdate'])) {
    [string]$frontMatter['publishdate']
  }
  else {
    [string]$frontMatter['date']
  }

  return ConvertTo-OipDateTimeOffset -Value $releaseValue -Label "Linked essay release date for $EssayPath"
}

function Test-AssociationOnlyUpdate {
  $tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $tempRoot = Join-Path $tempBase ("oip-cartoon-association-{0}" -f [guid]::NewGuid().ToString('N'))
  $updateScript = Join-Path (Join-Path $repoRoot 'scripts') 'update_front_page_cartoon.ps1'

  try {
    $tempDataDir = Join-Path $tempRoot 'data'
    $tempEssayDir = Join-Path $tempRoot 'content/essays/musings'
    $ordinaryEssayDir = Join-Path $tempRoot 'content/essays'
    New-Item -ItemType Directory -Path $tempDataDir -Force | Out-Null
    New-Item -ItemType Directory -Path $tempEssayDir -Force | Out-Null

    @'
current: newest-cartoon
cartoons:
  - slug: target-cartoon
    title: "Target Cartoon"
    date: "2025-07-14"
    image: "/images/editorial/target-cartoon.png"
    alt: "Target cartoon fixture."
    width: 1
    height: 1
  - slug: newest-cartoon
    title: "Newest Cartoon"
    date: "2025-07-15"
    image: "/images/editorial/newest-cartoon.png"
    essay: "/essays/audited-essay/"
    alt: "Newest cartoon fixture."
    width: 1
    height: 1
'@ | Set-Content -LiteralPath (Join-Path $tempDataDir 'editorial_cartoons.yaml') -Encoding utf8NoBOM

    @'
---
title: "Source-Free Musing"
date: 2025-07-14
draft: false
slug: "source-free-musing"
section_label: "Musing"
library_type: "musing"
collections: ["musings"]
source_mode: "SOURCE_FREE"
external_factual_claims: "none"
description: "A source-free association fixture."
version: "1.0"
edition: "First web edition"
---

An ordinary personal reflection.
'@ | Set-Content -LiteralPath (Join-Path $tempEssayDir 'source-free-musing.md') -Encoding utf8NoBOM

    @'
---
title: "Unqualified Musing"
date: 2025-07-14
draft: false
slug: "unqualified-musing"
section_label: "Musing"
library_type: "musing"
collections: ["musings"]
source_mode: "SOURCE_FREE"
external_factual_claims: "unknown"
description: "An unqualified association fixture."
version: "1.0"
edition: "First web edition"
---

This fixture has not cleared the source-free declaration.
'@ | Set-Content -LiteralPath (Join-Path $tempEssayDir 'unqualified-musing.md') -Encoding utf8NoBOM

    @'
---
title: "Ordinary Essay"
date: 2025-07-14
draft: false
slug: "ordinary-essay"
section_label: "Essay"
description: "An ordinary essay association fixture."
version: "1.0"
edition: "First web edition"
---

This fixture requires an Editorial Philosophy Audit.
'@ | Set-Content -LiteralPath (Join-Path $ordinaryEssayDir 'ordinary-essay.md') -Encoding utf8NoBOM

    & $updateScript `
      -Root $tempRoot `
      -LinkExistingSlug 'target-cartoon' `
      -EssayPath '/essays/source-free-musing/' | Out-Null

    $updatedData = Get-Content -LiteralPath (Join-Path $tempDataDir 'editorial_cartoons.yaml') -Raw
    Assert-True `
      -Condition ([regex]::IsMatch($updatedData, '(?m)^current:\s+newest-cartoon\s*$')) `
      -Message 'Association-only cartoon update changed the current front-page cartoon.'
    Assert-True `
      -Condition ([regex]::IsMatch($updatedData, '(?ms)^\s*- slug: target-cartoon\s+.*?^\s+essay: "/essays/source-free-musing/"\s*$')) `
      -Message 'Association-only cartoon update did not add the source-free Musing route.'

    $unqualifiedBlocked = $false
    try {
      & $updateScript `
        -Root $tempRoot `
        -LinkExistingSlug 'target-cartoon' `
        -EssayPath '/essays/unqualified-musing/' | Out-Null
    }
    catch {
      $unqualifiedBlocked = $_.Exception.Message -match 'missing accepted Editorial Philosophy Audit evidence'
    }
    Assert-True $unqualifiedBlocked 'An incompletely declared Musing bypassed the cartoon-link audit.'

    $ordinaryBlocked = $false
    try {
      & $updateScript `
        -Root $tempRoot `
        -LinkExistingSlug 'target-cartoon' `
        -EssayPath '/essays/ordinary-essay/' | Out-Null
    }
    catch {
      $ordinaryBlocked = $_.Exception.Message -match 'missing accepted Editorial Philosophy Audit evidence'
    }
    Assert-True $ordinaryBlocked 'An ordinary unaudited essay bypassed the cartoon-link audit.'
  }
  finally {
    if (Test-Path -LiteralPath $tempRoot) {
      $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
      if (-not $resolvedTempRoot.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove association-test directory outside the system temp root: $resolvedTempRoot"
      }

      Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
    }
  }
}

if (-not (Test-Path -LiteralPath $dataPath -PathType Leaf)) {
  throw "Editorial cartoon data file not found: $dataPath"
}

$cartoonData = Get-CartoonEntries
if ([string]::IsNullOrWhiteSpace($cartoonData.Current)) {
  throw "data/editorial_cartoons.yaml must define current."
}

$slugSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$currentExists = $false
$nowEastern = [System.TimeZoneInfo]::ConvertTime([datetimeoffset]::UtcNow, (Get-OipEasternTimeZone))

foreach ($cartoon in @($cartoonData.Entries)) {
  foreach ($required in @('slug', 'title', 'date', 'image', 'alt', 'width', 'height')) {
    if ($cartoon.PSObject.Properties.Name -notcontains $required -or [string]::IsNullOrWhiteSpace([string]$cartoon.$required)) {
      throw "Cartoon entry '$($cartoon.slug)' is missing required field '$required'."
    }
  }

  if (-not $slugSet.Add([string]$cartoon.slug)) {
    throw "Duplicate editorial cartoon slug: $($cartoon.slug)"
  }

  if ([string]$cartoon.slug -eq [string]$cartoonData.Current) {
    $currentExists = $true
  }

  $imagePath = Join-Path $repoRoot ('static/' + ([string]$cartoon.image).TrimStart('/')).Replace('/', [IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
    throw "Cartoon image file is missing for '$($cartoon.slug)': $($cartoon.image)"
  }

  if ([System.IO.Path]::GetExtension($imagePath) -ieq '.png') {
    $png = Test-OipPngIntegrity -Path $imagePath
    if (-not $png.IsValid) {
      throw "Cartoon image file is invalid for '$($cartoon.slug)': $($png.Detail)"
    }
  }

  $cartoonReleaseValue = if ($cartoon.PSObject.Properties.Name -contains 'publishDate') { [string]$cartoon.publishDate } else { [string]$cartoon.date }
  $cartoonRelease = ConvertTo-OipDateTimeOffset -Value $cartoonReleaseValue -Label "Cartoon release date for $($cartoon.slug)"
  $isFutureCartoon = $cartoonRelease -gt $nowEastern

  if ($cartoon.PSObject.Properties.Name -notcontains 'essay' -or [string]::IsNullOrWhiteSpace([string]$cartoon.essay)) {
    if ($isFutureCartoon) {
      throw "Future queued cartoon '$($cartoon.slug)' must name its associated essay."
    }

    continue
  }

  $essayPath = [string]$cartoon.essay
  $essayMarkdownPath = Resolve-EssayMarkdownPath -EssayPath $essayPath
  $essayRelease = Get-EssayReleaseDate -MarkdownPath $essayMarkdownPath -EssayPath $essayPath

  if ($isFutureCartoon -and $cartoonRelease -lt $essayRelease) {
    throw ("Cartoon '{0}' releases at {1}, before its linked essay {2} releases at {3}." -f $cartoon.slug, $cartoonRelease.ToString('o'), $essayPath, $essayRelease.ToString('o'))
  }
}

if (-not $currentExists) {
  throw "Current editorial cartoon '$($cartoonData.Current)' does not match any cartoon entry."
}

Test-AssociationOnlyUpdate

Write-Host "Editorial cartoon schedule contract passed."
$global:LASTEXITCODE = 0
