#requires -Version 7.0
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$publisher = Join-Path $repoRoot 'scripts/update_front_page_cartoon.ps1'
. (Join-Path $repoRoot 'scripts/lib/image_asset_manifest.ps1')
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$fixtureRoot = Join-Path $tempBase ('oip-dialogue-gallery-' + [guid]::NewGuid().ToString('N'))
$assetId = 'essays/dialogues/gallery-dialogue/hero'
$route = '/syd-and-oliver/gallery-dialogue/'
$sourceRelative = 'images/originals/essays/dialogues/gallery-dialogue/hero.jpg'
$sourcePath = Join-Path $fixtureRoot ('assets/' + $sourceRelative)
$contentPath = Join-Path $fixtureRoot 'content/essays/dialogues/gallery-dialogue.md'
$dataPath = Join-Path $fixtureRoot 'data/editorial_cartoons.yaml'
$manifestPath = Join-Path $fixtureRoot 'data/image-assets.json'
$utf8 = [Text.UTF8Encoding]::new($false)

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}
function Get-Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }
function Write-Fixture([string]$Path, [string]$Text) {
  [IO.File]::WriteAllText($Path, ($Text.TrimEnd() + [char]10), $utf8)
}
function Assert-Rejected([scriptblock]$Action, [string]$MessagePattern) {
  $before = Get-Hash $dataPath
  $beforeManifest = Get-Hash $manifestPath
  $rejected = $false
  try { & $Action | Out-Null }
  catch {
    if ($_.Exception.Message -notmatch $MessagePattern) { throw }
    $rejected = $true
  }
  Assert-True $rejected "Expected rejection matching '$MessagePattern'."
  Assert-True ((Get-Hash $dataPath) -ceq $before) 'Rejected dialogue publication changed Gallery data.'
  Assert-True ((Get-Hash $manifestPath) -ceq $beforeManifest) 'Rejected dialogue publication changed the image manifest.'
}

$baseData = @'
current: older-art
cartoons:
  - slug: older-art
    title: "An older \"quoted\" illustration"
    date: "1999-01-01"
    image: "editorial/older-art"
    alt: "Existing Gallery entry."
    width: 1
    height: 1
'@
$baseContent = @'
---
title: 'A "Good" Morning'
date: 2000-01-01T15:00:00Z
url: '/syd-and-oliver/gallery-dialogue/'
draft: false
library_type: 'dialogue'
collections: ['syd-and-oliver-dialogues']
featured_image: 'essays/dialogues/gallery-dialogue/hero'
featured_image_alt: 'Two men talk over breakfast.'
---

**Syd:** Good morning.

**Oliver:** Morning.
'@

try {
  foreach ($directory in @((Split-Path $sourcePath), (Split-Path $contentPath), (Split-Path $dataPath))) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $jpegFixture = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'assets/images/originals/essays/dialogues') -File -Recurse |
    Where-Object { $_.Extension -in @('.jpg', '.jpeg') } | Select-Object -First 1
  Assert-True ($null -ne $jpegFixture) 'A managed dialogue JPEG is required for the reuse fixture.'
  Copy-Item -LiteralPath $jpegFixture.FullName -Destination $sourcePath
  Register-OipImageAsset -Root $fixtureRoot -Id $assetId -Source $sourceRelative -ImageClass 'essay_illustration' -ProcessingHint 'drawing' -ReviewState 'approved' -UsageState 'referenced' -Aliases @('/images/syd-and-oliver/gallery-dialogue/hero.jpg') | Out-Null
  Write-Fixture $contentPath $baseContent
  Write-Fixture $dataPath $baseData
  $originalManifestHash = Get-Hash $manifestPath
  $originalSourceHash = Get-Hash $sourcePath
  $originalContentHash = Get-Hash $contentPath

  & $publisher -Root $fixtureRoot -DialoguePath $route | Out-Null
  $published = [IO.File]::ReadAllText($dataPath)
  Assert-True ($published -match '(?m)^current: gallery-dialogue\r?$') 'Immediate dialogue publication did not select current.'
  Assert-True ($published -match 'image: "essays/dialogues/gallery-dialogue/hero"') 'Gallery failed to reuse the dialogue hero ID.'
  Assert-True ($published -match 'essay: "/syd-and-oliver/gallery-dialogue/"') 'Gallery failed to link the dialogue canonical URL.'
  Assert-True ($published -match 'publishDate: "2000-01-01T15:00:00') 'Default Gallery release lost the exact same-day dialogue timestamp.'
  Assert-True ($published -match 'alt: "Two men talk over breakfast\."') 'Gallery alt did not come from the dialogue.'
  $dimensions = Get-OipImageNativeDimensions -Path $sourcePath
  Assert-True ($published -match ('width: ' + $dimensions.Width + '\r?\n') -and $published -match ('height: ' + $dimensions.Height + '\r?\n')) 'Gallery dimensions did not come from the managed source.'
  $firstPublishHash = Get-Hash $dataPath
  & $publisher -Root $fixtureRoot -DialoguePath $route | Out-Null
  Assert-True ((Get-Hash $dataPath) -ceq $firstPublishHash) 'Repeated publication is not byte-idempotent, including quoted titles.'
  Assert-True ((Get-Hash $manifestPath) -ceq $originalManifestHash) 'Dialogue reuse changed image-assets.json.'
  Assert-True ((Get-Hash $sourcePath) -ceq $originalSourceHash) 'Dialogue reuse changed its original artwork.'
  Assert-True ((Get-Hash $contentPath) -ceq $originalContentHash) 'Dialogue reuse changed the story.'
  Assert-True (@(Get-ChildItem -LiteralPath (Join-Path $fixtureRoot 'assets') -File -Recurse).Count -eq 1) 'Dialogue reuse created a duplicate original.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $fixtureRoot 'static'))) 'Dialogue reuse created static artwork.'

  foreach ($case in @(
    @{ Old = 'draft: false'; New = 'draft: true'; Error = 'draft:false' },
    @{ Old = 'draft: false'; New = 'draft: unknown'; Error = 'draft:false' },
    @{ Old = "library_type: 'dialogue'"; New = "library_type: 'essay'"; Error = 'must declare library_type' },
    @{ Old = "collections: ['syd-and-oliver-dialogues']"; New = "collections: ['musings']"; Error = 'must declare library_type' },
    @{ Old = "url: '/syd-and-oliver/gallery-dialogue/'"; New = "url: '/essays/gallery-dialogue/'"; Error = 'must declare library_type' },
    @{ Old = "featured_image_alt: 'Two men talk over breakfast.'"; New = "featured_image_alt: ''"; Error = 'missing featured_image_alt' },
    @{ Old = "featured_image: 'essays/dialogues/gallery-dialogue/hero'"; New = "featured_image: '/images/syd-and-oliver/gallery-dialogue/hero.jpg'"; Error = 'registered bare managed asset ID' }
  )) {
    Write-Fixture $contentPath ($baseContent.Replace($case.Old, $case.New))
    Assert-Rejected { & $publisher -Root $fixtureRoot -DialoguePath $route } $case.Error
  }
  Write-Fixture $contentPath $baseContent
  Assert-Rejected { & $publisher -Root $fixtureRoot -DialoguePath '/essays/gallery-dialogue/' } 'DialoguePath'
  Assert-Rejected { & $publisher -Root $fixtureRoot -DialoguePath $route -Date '2000-01-01' } 'earlier than linked dialogue'

  $fixtureManifest = Read-OipImageAssetManifest -Root $fixtureRoot
  $fixtureManifest.assets[$assetId].review_state = 'pending_review'
  Write-OipImageAssetManifest -Root $fixtureRoot -Manifest $fixtureManifest
  Assert-Rejected { & $publisher -Root $fixtureRoot -DialoguePath $route } 'approved, referenced, and derivative_capable'
  $fixtureManifest.assets[$assetId].review_state = 'approved'
  Write-OipImageAssetManifest -Root $fixtureRoot -Manifest $fixtureManifest
  [IO.File]::AppendAllText($sourcePath, 'changed')
  Assert-Rejected { & $publisher -Root $fixtureRoot -DialoguePath $route } 'hash or dimensions differ'
  Copy-Item -LiteralPath $jpegFixture.FullName -Destination $sourcePath -Force

  Write-Fixture $dataPath ($baseData + [char]10 + '  - slug: gallery-dialogue' + [char]10 + '    image: "editorial/unrelated"')
  Assert-Rejected { & $publisher -Root $fixtureRoot -DialoguePath $route } 'already belongs to different artwork'
  Write-Fixture $dataPath ($published + '  - slug: gallery-dialogue' + [char]10 + '    image: "essays/dialogues/gallery-dialogue/hero"')
  Assert-Rejected { & $publisher -Root $fixtureRoot -DialoguePath $route } 'Duplicate Gallery slug'
  Write-Fixture $dataPath ($baseData + [char]10 + '  - slug: another-slug' + [char]10 + '    image: "essays/dialogues/gallery-dialogue/hero"')
  Assert-Rejected { & $publisher -Root $fixtureRoot -DialoguePath $route } 'different Gallery entry'

  Write-Fixture $dataPath $baseData
  $futureContent = $baseContent.Replace('date: 2000-01-01T15:00:00Z', 'date: 2099-01-01T15:00:00Z')
  Write-Fixture $contentPath $futureContent
  Assert-Rejected { & $publisher -Root $fixtureRoot -DialoguePath $route } 'Future dialogue Gallery publication requires an explicit'
  Assert-Rejected { & $publisher -Root $fixtureRoot -DialoguePath $route -PublishDate '2098-12-31T15:00:00Z' } 'earlier than linked dialogue'
  & $publisher -Root $fixtureRoot -DialoguePath $route -Date '2099-01-01' -PublishDate '2099-01-01T16:00:00Z' | Out-Null
  $queued = [IO.File]::ReadAllText($dataPath)
  Assert-True ($queued -match '(?m)^current: gallery-dialogue\r?$') 'Queued dialogue was not selected for automatic activation after release.'
  Assert-True ($queued -match 'slug: older-art') 'Queueing removed the previous artwork needed by the eligible-art fallback.'
  Assert-True ($queued -match 'publishDate: "2099-01-01T16:00:00Z"') 'Explicit future schedule was lost.'
  $queuedHash = Get-Hash $dataPath
  & $publisher -Root $fixtureRoot -DialoguePath $route | Out-Null
  Assert-True ((Get-Hash $dataPath) -ceq $queuedHash) 'Repeat invocation changed a queued dialogue release.'
  Write-Fixture $dataPath $baseData
  Write-Fixture $contentPath ($futureContent.Replace('draft: false', ('publishDate: 1999-01-01T00:00:00Z' + [char]10 + 'draft: false')))
  Assert-Rejected { & $publisher -Root $fixtureRoot -DialoguePath $route -PublishDate '2000-01-01T15:00:00Z' } 'earlier than linked dialogue'

  # The new route cannot grant ordinary essays the dialogue exemption.
  $ordinaryPath = Join-Path $fixtureRoot 'content/essays/ordinary-essay.md'
  Write-Fixture $ordinaryPath "---`ntitle: Ordinary Essay`ndate: 1999-01-01`ndraft: false`n---`nOrdinary essay."
  Assert-Rejected { & $publisher -Root $fixtureRoot -LinkExistingSlug 'older-art' -EssayPath '/essays/ordinary-essay/' } 'missing accepted Editorial Philosophy Audit evidence'
  Assert-True ((Get-Hash $manifestPath) -ceq $originalManifestHash) 'Fixtures found an unintended manifest write.'
  Assert-True ((Get-Hash $sourcePath) -ceq $originalSourceHash) 'Fixtures found an unintended original-art write.'
  Write-Host 'Dialogue Gallery publisher passed: managed reuse, idempotency, route/type checks, release safety, current selection, and essay gate isolation.'
}
finally {
  if (Test-Path -LiteralPath $fixtureRoot) {
    $resolvedFixture = [IO.Path]::GetFullPath($fixtureRoot)
    if (-not $resolvedFixture.StartsWith($tempBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove fixture outside system temp: $resolvedFixture"
    }
    Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
  }
}
$global:LASTEXITCODE = 0
