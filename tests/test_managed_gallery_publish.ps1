#requires -Version 7.0
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$publisher = Join-Path $repoRoot 'scripts/update_front_page_cartoon.ps1'
. (Join-Path $repoRoot 'scripts/lib/image_asset_manifest.ps1')
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$fixtureRoot = Join-Path $tempBase ('oip-managed-gallery-' + [guid]::NewGuid().ToString('N'))
$assetId = 'essays/gallery-essay/hero'
$sourceRelative = 'images/originals/essays/gallery-essay/hero.png'
$sourcePath = Join-Path $fixtureRoot ('assets/' + $sourceRelative)
$contentPath = Join-Path $fixtureRoot 'content/essays/gallery-essay.md'
$reportPath = Join-Path $fixtureRoot 'docs/editorial-audits/99-refinement/gallery-essay-99-refinement-report.md'
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
function Invoke-Publish {
  & $publisher -Root $fixtureRoot -ManagedImageId $assetId -Title 'An "Approved" Hero' -Alt 'The approved essay illustration.' -Slug 'gallery-essay-art' -Date '2000-01-01' -PublishDate '2000-01-01T15:00:00Z' -EssayPath '/essays/gallery-essay/' | Out-Null
}
function Assert-Rejected([scriptblock]$Action, [string]$MessagePattern) {
  $beforeData = Get-Hash $dataPath
  $beforeManifest = Get-Hash $manifestPath
  $beforeSource = Get-Hash $sourcePath
  $rejected = $false
  try { & $Action | Out-Null }
  catch {
    if ($_.Exception.Message -notmatch $MessagePattern) { throw }
    $rejected = $true
  }
  Assert-True $rejected "Expected rejection matching '$MessagePattern'."
  Assert-True ((Get-Hash $dataPath) -ceq $beforeData) 'Rejected managed publication changed Gallery data.'
  Assert-True ((Get-Hash $manifestPath) -ceq $beforeManifest) 'Rejected managed publication changed the image manifest.'
  Assert-True ((Get-Hash $sourcePath) -ceq $beforeSource) 'Rejected managed publication changed its original artwork.'
}

$baseData = @'
current: older-art
automatic_articles_since: "2026-10-22T00:00:00-04:00"
cartoons:
  - slug: older-art
    title: "Older illustration"
    date: "1999-01-01"
    image: "editorial/older-art"
    alt: "Existing Gallery entry."
    width: 1
    height: 1
'@
$baseContent = @'
---
title: Gallery Essay
date: 2000-01-01T15:00:00Z
draft: false
featured_image: essays/gallery-essay/hero
---
Approved essay.
'@
$audit = @'
## Editorial Philosophy Audit
Decision: PASS
Evidence: PASS
Logic: PASS
Incentives: PASS
Tradeoffs: PASS
Consequences: PASS
Uncertainty: PASS
Institutional Behavior: PASS
'@

try {
  foreach ($directory in @((Split-Path $sourcePath), (Split-Path $contentPath), (Split-Path $dataPath), (Split-Path $reportPath))) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $png = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz8AAAAASUVORK5CYII=')
  [IO.File]::WriteAllBytes($sourcePath, $png)
  Register-OipImageAsset -Root $fixtureRoot -Id $assetId -Source $sourceRelative -ImageClass 'essay_illustration' -ProcessingHint 'drawing' -ReviewState 'approved' -UsageState 'referenced' -ArtworkTitle 'An "Approved" Hero' -Aliases @('/images/essays/gallery-essay/hero.png') | Out-Null
  Write-Fixture $contentPath $baseContent
  Write-Fixture $reportPath $audit
  Write-Fixture $dataPath $baseData
  $originalManifestHash = Get-Hash $manifestPath
  $originalSourceHash = Get-Hash $sourcePath
  $originalContentHash = Get-Hash $contentPath

  Invoke-Publish
  $published = [IO.File]::ReadAllText($dataPath)
  Assert-True ($published -match '(?m)^automatic_articles_since: "2026-10-22T00:00:00-04:00"\r?$') 'Managed publication removed or changed the automatic Gallery cutoff.'
  Assert-True ($published -match 'image: "essays/gallery-essay/hero"') 'Gallery did not reuse the managed ID.'
  Assert-True ($published -match 'essay: "/essays/gallery-essay/"') 'Gallery did not preserve the explicit essay association.'
  Assert-True ($published -match 'publishDate: "2000-01-01T15:00:00Z"') 'Gallery lost the exact essay release timestamp.'
  Assert-True ($published -match 'alt: "The approved essay illustration\."') 'Gallery lost the supplied alt text.'
  Assert-True ($published -match 'width: 1\r?\n' -and $published -match 'height: 1\r?\n') 'Gallery did not use the managed source dimensions.'
  $firstPublishHash = Get-Hash $dataPath
  Invoke-Publish
  Assert-True ((Get-Hash $dataPath) -ceq $firstPublishHash) 'Repeated managed publication is not byte-idempotent.'
  & $publisher -Root $fixtureRoot -ManagedImageId $assetId -Title 'An "Approved" Hero' -Alt 'The approved essay illustration.' -Slug 'gallery-essay-art' -EssayPath '/essays/gallery-essay/' | Out-Null
  Assert-True ((Get-Hash $dataPath) -ceq $firstPublishHash) 'A repeat invocation changed the existing Gallery release.'
  Assert-True ((Get-Hash $manifestPath) -ceq $originalManifestHash) 'Managed reuse changed image-assets.json.'
  Assert-True ((Get-Hash $sourcePath) -ceq $originalSourceHash) 'Managed reuse changed its original artwork.'
  Assert-True ((Get-Hash $contentPath) -ceq $originalContentHash) 'Managed reuse changed its linked essay.'
  Assert-True (@(Get-ChildItem -LiteralPath (Join-Path $fixtureRoot 'assets') -File -Recurse).Count -eq 1) 'Managed reuse created a duplicate original.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $fixtureRoot 'static'))) 'Managed reuse created static artwork.'
  $prospectiveCopy = $baseContent.Replace('title: Gallery Essay', 'title: An "Approved" Hero').Replace('featured_image: essays/gallery-essay/hero', 'featured_image: https://example.test/other.png')
  Write-Fixture $contentPath $prospectiveCopy
  Assert-Rejected { Invoke-Publish } 'independent'
  Write-Fixture $contentPath $baseContent

  $fixtureManifest = Read-OipImageAssetManifest -Root $fixtureRoot
  foreach ($state in @('review_state', 'usage_state')) {
    $oldValue = $fixtureManifest.assets[$assetId][$state]
    $fixtureManifest.assets[$assetId][$state] = if ($state -eq 'review_state') { 'pending_review' } else { 'retained_unreferenced' }
    Write-OipImageAssetManifest -Root $fixtureRoot -Manifest $fixtureManifest
    Assert-Rejected { Invoke-Publish } 'approved, referenced, and derivative_capable'
    $fixtureManifest.assets[$assetId][$state] = $oldValue
    Write-OipImageAssetManifest -Root $fixtureRoot -Manifest $fixtureManifest
  }
  $fixtureManifest.assets[$assetId].width = 2
  Write-OipImageAssetManifest -Root $fixtureRoot -Manifest $fixtureManifest
  Assert-Rejected { Invoke-Publish } 'hash or dimensions differ'
  $fixtureManifest.assets[$assetId].width = 1
  Write-OipImageAssetManifest -Root $fixtureRoot -Manifest $fixtureManifest
  [IO.File]::AppendAllText($sourcePath, 'changed')
  Assert-Rejected { Invoke-Publish } 'hash or dimensions differ'
  [IO.File]::WriteAllBytes($sourcePath, $png)
  Assert-Rejected { & $publisher -Root $fixtureRoot -ManagedImageId '/images/essays/gallery-essay/hero.png' -Title Art -Alt Art -EssayPath '/essays/gallery-essay/' } 'registered bare managed asset ID'

  Write-Fixture $reportPath ($audit.Replace('Decision: PASS', 'Decision: FAIL'))
  Assert-Rejected { Invoke-Publish } 'missing accepted Editorial Philosophy Audit evidence'
  Write-Fixture $reportPath $audit
  Write-Fixture $contentPath ($baseContent.Replace('draft: false', 'draft: true'))
  Assert-Rejected { Invoke-Publish } 'still draft:true'
  Write-Fixture $contentPath ($baseContent.Replace('date: 2000-01-01T15:00:00Z', 'date: 2099-01-01T15:00:00Z'))
  Assert-Rejected { Invoke-Publish } 'earlier than linked essay'
  Write-Fixture $contentPath $baseContent
  Write-Fixture $dataPath ($published + '  - slug: gallery-essay-art' + [char]10 + '    image: "essays/gallery-essay/hero"')
  Assert-Rejected { Invoke-Publish } 'Duplicate Gallery slug'
  Write-Fixture $dataPath ($baseData + [char]10 + '  - slug: another-entry' + [char]10 + '    image: "essays/gallery-essay/hero"')
  Assert-Rejected { Invoke-Publish } 'different Gallery entry'
  Write-Fixture $dataPath ($baseData + [char]10 + '  - slug: gallery-essay-art' + [char]10 + '    image: "editorial/unrelated"')
  Assert-Rejected { Invoke-Publish } 'already belongs to different artwork'
  Assert-True ((Get-Hash $manifestPath) -ceq $originalManifestHash) 'Fixtures found an unintended manifest write.'
  Assert-True ((Get-Hash $sourcePath) -ceq $originalSourceHash) 'Fixtures found an unintended original-art write.'
  Write-Fixture $dataPath $published
  Assert-Rejected { & $publisher -Root $fixtureRoot -RenameManagedImageId $assetId -Title 'Older illustration' } 'already claimed'
  Assert-Rejected { & $publisher -Root $fixtureRoot -RenameManagedImageId $assetId -Title 'Gallery Essay' } 'independent'
  # Alias pairings share the same art identity. Rename changes only titles.
  $renameData = $published + '  - slug: alias-pairing' + [char]10 + '    title: "An \"Approved\" Hero"' + [char]10 + '    image: "/images/essays/gallery-essay/hero.png"' + [char]10
  Write-Fixture $dataPath $renameData
  $renameBefore = [IO.File]::ReadAllText($dataPath)
  $renameManifestBefore = Read-OipImageAssetManifest -Root $fixtureRoot
  & $publisher -Root $fixtureRoot -RenameManagedImageId '/images/essays/gallery-essay/hero.png' -Title 'The Quiet Threshold' | Out-Null
  $renameAfter = [IO.File]::ReadAllText($dataPath)
  $renameManifestAfter = Read-OipImageAssetManifest -Root $fixtureRoot
  Assert-True ($renameAfter -ceq $renameBefore.Replace('An \"Approved\" Hero', 'The Quiet Threshold')) 'Rename changed fields besides matching explicit Gallery titles.'
  Assert-True ($renameManifestAfter.assets[$assetId].artwork_title -ceq 'The Quiet Threshold') 'Rename failed to update the canonical asset title.'
  $renameManifestAfter.assets[$assetId].artwork_title = $renameManifestBefore.assets[$assetId].artwork_title
  Assert-True (($renameManifestAfter | ConvertTo-Json -Depth 12 -Compress) -ceq ($renameManifestBefore | ConvertTo-Json -Depth 12 -Compress)) 'Rename changed asset properties besides artwork_title.'
  Assert-True ((Get-Hash $sourcePath) -ceq $originalSourceHash -and (Get-Hash $contentPath) -ceq $originalContentHash) 'Rename changed original art or article bytes.'
  $renameDataHash = Get-Hash $dataPath
  $renameManifestHash = Get-Hash $manifestPath
  & $publisher -Root $fixtureRoot -RenameManagedImageId $assetId -Title 'The Quiet Threshold' | Out-Null
  Assert-True ((Get-Hash $dataPath) -ceq $renameDataHash -and (Get-Hash $manifestPath) -ceq $renameManifestHash) 'Repeated rename is not byte-idempotent.'
  Write-Host 'Managed Gallery publisher passed: approved reuse, idempotency, unchanged artwork/manifest, association safety, and essay editorial/schedule gates.'
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
