#requires -Version 7.0
[CmdletBinding()]
param([string]$FixtureRoot = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$gate = Join-Path $repoRoot 'scripts/check_gallery_artwork_titles.ps1'
. (Join-Path $repoRoot 'scripts/lib/artwork_titles.ps1')
if (-not $FixtureRoot) { $FixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-artwork-title-fixture-' + [guid]::NewGuid().ToString('N')) }
if (Test-Path -LiteralPath $FixtureRoot) { throw "Fixture path must be new: $FixtureRoot" }
[IO.Directory]::CreateDirectory($FixtureRoot) | Out-Null
$FixtureRoot = (Resolve-Path -LiteralPath $FixtureRoot).Path
$utf8 = [Text.UTF8Encoding]::new($false)
$ownedFiles = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$caseCount = 0

function Write-FixtureFile([string]$RelativePath, [string]$Text) {
  $path = [IO.Path]::GetFullPath((Join-Path $FixtureRoot $RelativePath))
  if (-not $path.StartsWith($FixtureRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture path escaped its root.' }
  [IO.Directory]::CreateDirectory((Split-Path -Parent $path)) | Out-Null
  [IO.File]::WriteAllText($path, $Text, $utf8)
  [void]$ownedFiles.Add($path)
}

function New-Asset([string]$Name, [string]$HashLetter, [string]$Title = '') {
  $entry = [ordered]@{ id = "essays/$Name/hero"; source = "images/originals/essays/$Name/hero.png"; sha256 = ($HashLetter * 64); width = 1200; height = 675; image_class = 'essay_illustration'; processing_hint = 'drawing'; review_state = 'approved'; usage_state = 'referenced'; processing_state = 'derivative_capable'; processing_note = $null; quality_override = $null }
  if ($Title) { $entry.artwork_title = $Title }
  return $entry
}

function Write-Story([string]$Slug, [string]$Title, [string]$Image, [hashtable]$Extra = @{}) {
  $fields = [ordered]@{ title = $Title; slug = $Slug; date = '2000-01-01'; draft = $false; featured_image = $Image; featured_image_alt = 'An original scene.' }
  foreach ($key in $Extra.Keys) { $fields[$key] = $Extra[$key] }
  $front = ($fields.GetEnumerator() | ForEach-Object { $_.Key + ': ' + (ConvertTo-Json -InputObject $_.Value -Compress) }) -join "`n"
  Write-FixtureFile "content/essays/$Slug.md" ("---`n$front`n---`n`nA complete scene.`n")
}

function Write-Manifest { Write-FixtureFile 'data/image-assets.json' (($script:manifest | ConvertTo-Json -Depth 12) + "`n") }
function Write-Gallery([string]$AutomaticSince = '1999-01-01T00:00:00-05:00') {
  $lines = [Collections.Generic.List[string]]::new()
  $lines.Add('current: legacy-a')
  if ($AutomaticSince) { $lines.Add('automatic_articles_since: ' + (ConvertTo-Json -InputObject $AutomaticSince -Compress)) }
  $lines.Add('cartoons:')
  foreach ($row in $script:rows) {
    $lines.Add('  - slug: ' + $row.slug)
    foreach ($key in @('title','date','publishDate','image','essay','alt','width','height')) {
      if ($row.Contains($key)) { $lines.Add('    ' + $key + ': ' + (ConvertTo-Json -InputObject $row[$key] -Compress)) }
    }
  }
  Write-FixtureFile 'data/editorial_cartoons.yaml' (($lines -join "`n") + "`n")
}

function Set-UpBaseline {
  foreach ($path in @($ownedFiles)) {
    if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force }
  }
  $script:manifest = @{ schema_version = '1.0'; defaults = @{}; assets = @{}; aliases = @{ '/images/named.png' = 'essays/named/hero'; '/images/legacy.png' = 'essays/legacy-a/hero' } }
  foreach ($spec in @(@('legacy-a','a',''), @('legacy-b','b',''), @('named','c','Borrowed Light'), @('draft','d',''), @('unused','e',''), @('hidden','0',''), @('suppressed','1',''), @('pairing','2',''))) {
    $entry = New-Asset $spec[0] $spec[1] $spec[2]
    $script:manifest.assets[$entry.id] = $entry
  }
  $script:rows = @(
    [ordered]@{ slug='legacy-a'; title='Old Lantern'; date='2000-01-01'; image='essays/legacy-a/hero'; essay='/essays/legacy-a/'; alt='An old lantern.'; width=1200; height=675 },
    [ordered]@{ slug='legacy-b'; title='Old Lantern'; date='2000-01-01'; image='essays/legacy-b/hero'; essay='/essays/legacy-b/'; alt='Another old lantern.'; width=1200; height=675 },
    [ordered]@{ slug='substitute'; title='The Substitute Scene'; date='2000-01-01'; image='essays/pairing/hero'; essay='/essays/suppressed/'; alt='A custom paired scene.'; width=1200; height=675 }
  )
  Write-Manifest
  Write-Gallery
  Write-Story 'legacy-a' 'An Old Story' 'essays/legacy-a/hero'
  Write-Story 'legacy-b' 'Another Old Story' 'essays/legacy-b/hero'
  Write-Story 'named' 'A Different Story' '/images/named.png'
  Write-Story 'draft' 'An Unpublished Story' 'essays/draft/hero' @{ draft = $true }
  Write-Story 'hidden' 'A Hidden Legacy Story' 'essays/hidden/hero' @{ date='1900-01-01' }
  Write-Story 'suppressed' 'A Suppressed Hero' 'essays/suppressed/hero'
}

function Assert-Case([string]$Name, [scriptblock]$Change, [string]$ExpectedError = '', [switch]$Consistency) {
  Set-UpBaseline
  & $Change
  $report = Join-Path $FixtureRoot 'result.json'
  $arguments = @{ Root=$FixtureRoot; HeadRef='WORKTREE'; Clock='2030-01-01T12:00:00Z'; ReportPath=$report }
  if ($Consistency) { $arguments.ConsistencyOnly = $true } else { $arguments.BaseRef = $script:baseCommit }
  $caught = ''
  try { & $gate @arguments | Out-Null } catch { $caught = $_.Exception.Message }
  if ($ExpectedError) {
    if (-not $caught -or $caught -notmatch $ExpectedError) { throw "Case '$Name' expected '$ExpectedError', got: $caught" }
  } elseif ($caught) { throw "Case '$Name' unexpectedly failed: $caught" }
  $script:caseCount++
}

function Assert-AvailabilityCase([string]$Name, [scriptblock]$Change, [string]$Title, [string]$ExpectedError = '') {
  Set-UpBaseline
  & $Change
  $manifestPath = Join-Path $FixtureRoot 'data/image-assets.json'
  $galleryPath = Join-Path $FixtureRoot 'data/editorial_cartoons.yaml'
  $beforeManifest = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
  $beforeGallery = (Get-FileHash -LiteralPath $galleryPath -Algorithm SHA256).Hash
  $caught = ''
  try { Assert-OipArtworkTitleAvailable -Root $FixtureRoot -Manifest $script:manifest -AssetId 'essays/pairing/hero' -Title $Title }
  catch { $caught = $_.Exception.Message }
  if ($ExpectedError) {
    if (-not $caught -or $caught -notmatch $ExpectedError) { throw "Case '$Name' expected '$ExpectedError', got: $caught" }
  } elseif ($caught) { throw "Case '$Name' unexpectedly failed: $caught" }
  if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash -cne $beforeManifest -or
      (Get-FileHash -LiteralPath $galleryPath -Algorithm SHA256).Hash -cne $beforeGallery) {
    throw "Case '$Name' changed metadata during title preflight."
  }
  $script:caseCount++
}

Set-UpBaseline
& git -C $FixtureRoot init --quiet
if ($LASTEXITCODE) { throw 'Cannot initialize isolated fixture Git repository.' }
& git -C $FixtureRoot -c core.autocrlf=false add --all
& git -C $FixtureRoot -c user.name=Fixture -c user.email=fixture@example.test commit --quiet -m 'fixture baseline'
if ($LASTEXITCODE) { throw 'Cannot commit isolated fixture baseline.' }
$baseCommit = (& git -C $FixtureRoot rev-parse HEAD).Trim()
$originalEvent = $env:GITHUB_EVENT_NAME
$env:GITHUB_EVENT_NAME = ''
try {
  Assert-Case 'unchanged unnamed legacy and duplicate legacy names remain buildable' {}
  Assert-Case 'full consistency accepts unchanged legacy' {} -Consistency
  Assert-Case 'unrelated body edit keeps unnamed legacy artwork' { Write-Story 'legacy-a' 'An Old Story' 'essays/legacy-a/hero'; Add-Content -LiteralPath (Join-Path $FixtureRoot 'content/essays/legacy-a.md') -Value 'One corrected sentence.' }
  Assert-Case 'new unnamed backdated article fails' { Write-Story 'new' 'A New Story' 'essays/unused/hero' } 'ARTWORK-TITLE-MISSING'
  Assert-Case 'new unnamed future article fails' { Write-Story 'new' 'A New Story' 'essays/unused/hero' @{ date='2099-01-01'; publishDate='2099-01-01T09:00:00-05:00' } } 'ARTWORK-TITLE-(MISSING|QUEUE)'
  Assert-Case 'draft to public fails without name' { Write-Story 'draft' 'An Unpublished Story' 'essays/draft/hero' } 'ARTWORK-TITLE-MISSING'
  Assert-Case 'new named article passes' { $script:manifest.assets['essays/unused/hero'].artwork_title = 'The Open Window'; Write-Manifest; Write-Story 'new' 'A New Story' 'essays/unused/hero' }
  Assert-Case 'named reuse through alias preserves identity' { Write-Story 'reuse' 'A Reused Scene' '/images/named.png' }
  Assert-Case 'newly reused unnamed legacy through alias fails' { Write-Story 'reuse' 'A Reused Scene' '/images/legacy.png' } 'ARTWORK-TITLE-MISSING'
  Assert-Case 'new article copying full title fails' { $script:manifest.assets['essays/unused/hero'].artwork_title = 'A New Story'; Write-Manifest; Write-Story 'new' 'A New Story' 'essays/unused/hero' } 'ARTWORK-TITLE-COPIED'
  Assert-Case 'new article copying short title fails' { $script:manifest.assets['essays/unused/hero'].artwork_title = 'Short Story'; Write-Manifest; Write-Story 'new' 'A Longer Article Headline' 'essays/unused/hero' @{short_title='Short Story'} } 'ARTWORK-TITLE-COPIED'
  Assert-Case 'escaped Unicode association cannot evade headline comparison' {
    $script:manifest.assets['essays/unused/hero'].artwork_title = 'A Different Story'
    Write-Manifest
    Write-Story 'cafe' 'A Different Story' 'essays/named/hero' @{url='/essays/café/'}
    $script:rows += [ordered]@{slug='unicode';title='A Different Story';date='2000-01-01';image='essays/unused/hero';essay='/essays/caf%C3%A9/';alt='A custom paired scene.';width=1200;height=675}
    Write-Gallery
  } 'ARTWORK-TITLE-COPIED'
  Assert-Case 'new name collides with legacy effective title' { $script:manifest.assets['essays/unused/hero'].artwork_title = 'Old Lantern'; Write-Manifest; Write-Story 'new' 'A New Story' 'essays/unused/hero' } 'ARTWORK-TITLE-DUPLICATE'
  Assert-Case 'pre-cutoff hidden headline does not reserve a Gallery name' { $script:manifest.assets['essays/unused/hero'].artwork_title = 'A Hidden Legacy Story'; Write-Manifest; Write-Story 'new' 'A New Story' 'essays/unused/hero' }
  Assert-Case 'lower cutoff admits newly exposed unnamed automatic artwork' { Write-Gallery '1899-01-01T00:00:00-05:00' } 'ARTWORK-TITLE-MISSING'
  Assert-Case 'lower cutoff accepts newly exposed independently named artwork' { $script:manifest.assets['essays/hidden/hero'].artwork_title = 'A Distant Window'; Write-Manifest; Write-Gallery '1899-01-01T00:00:00-05:00' }
  Assert-Case 'removed alternate pairing admits newly exposed unnamed hero' { $script:rows = @($script:rows | Where-Object { $_.slug -cne 'substitute' }); Write-Gallery } 'ARTWORK-TITLE-MISSING'
  Assert-Case 'removed alternate pairing accepts independently named hero' { $script:manifest.assets['essays/suppressed/hero'].artwork_title = 'Behind the Curtain'; Write-Manifest; $script:rows = @($script:rows | Where-Object { $_.slug -cne 'substitute' }); Write-Gallery }
  Assert-Case 'explicit removal preserves an existing unnamed canonical artwork identity' {
    $script:rows = @($script:rows | Where-Object { $_.slug -cne 'legacy-a' })
    Write-Gallery
    $claims = @(Get-OipArtworkTitleClaims -Root $FixtureRoot -Manifest $script:manifest | Where-Object { $_.Origin -cne 'Manifest' -and $_.AssetId -ceq 'essays/legacy-a/hero' })
    if ($claims.Count -ne 1) { throw 'Explicit-to-automatic transition duplicated canonical artwork.' }
  }
  Assert-Case 'renamed canonical artwork reused through an alias remains one Gallery identity' {
    $script:manifest.assets['essays/named/hero'].artwork_title = 'The Quiet Stage'
    Write-Manifest
    Write-Story 'reuse' 'A Reused Scene' '/images/named.png'
    $claims = @(Get-OipArtworkTitleClaims -Root $FixtureRoot -Manifest $script:manifest | Where-Object { $_.Origin -cne 'Manifest' -and $_.AssetId -ceq 'essays/named/hero' })
    if ($claims.Count -ne 1 -or $claims[0].Title -cne 'The Quiet Stage') { throw 'Renamed reused artwork lost its canonical Gallery identity or title.' }
  }
  Assert-Case 'explicitly suppressed hero does not claim paired artwork title' { $script:manifest.assets['essays/pairing/hero'].artwork_title = 'The Substitute Scene'; Write-Manifest }
  Assert-Case 'normalized modern title collision fails' { $script:manifest.assets['essays/unused/hero'].artwork_title = '  BORROWED LIGHT!  '; Write-Manifest; Write-Story 'new' 'A New Story' 'essays/unused/hero' } 'ARTWORK-TITLE-DUPLICATE'
  Assert-Case 'new explicit row requires name' { $script:rows += [ordered]@{slug='new-row';title='A Fine Scene';date='2000-01-01';image='essays/unused/hero';alt='An original scene.';width=1200;height=675}; Write-Gallery } 'ARTWORK-TITLE-MISSING'
  Assert-Case 'retitled legacy row requires canonical name' { $script:rows[0].title='A Different Lantern'; Write-Gallery } 'ARTWORK-TITLE-MISSING'
  Assert-Case 'new hero on existing article requires name' { Write-Story 'legacy-a' 'An Old Story' 'essays/unused/hero' } 'ARTWORK-TITLE-MISSING'
  Assert-Case 'replacement bytes on unnamed art require name' { $script:manifest.assets['essays/legacy-a/hero'].sha256 = ('f' * 64); Write-Manifest } 'ARTWORK-TITLE-MISSING'
  Assert-Case 'alias remapping cannot evade admission' { $script:manifest.aliases['/images/named.png'] = 'essays/unused/hero'; Write-Manifest } 'ARTWORK-TITLE-MISSING'
  Assert-Case 'established title removal fails' { $script:manifest.assets['essays/named/hero'].Remove('artwork_title'); Write-Manifest } 'ARTWORK-TITLE-REMOVED'
  Assert-Case 'empty established title fails' { $script:manifest.assets['essays/named/hero'].artwork_title = ' '; Write-Manifest } 'ARTWORK-TITLE-(REMOVED|INVALID)'
  Assert-Case 'non-scalar title fails' { $script:manifest.assets['essays/named/hero'].artwork_title = @('First','Second'); Write-Manifest } 'ARTWORK-TITLE-INVALID'
  Assert-Case 'explicit row cannot override canonical name' { $script:manifest.assets['essays/legacy-a/hero'].artwork_title = 'An Independent Lantern'; Write-Manifest } 'ARTWORK-TITLE-CONFLICT'
  Assert-Case 'canonical row and asset agree' { $script:manifest.assets['essays/legacy-a/hero'].artwork_title = 'An Independent Lantern'; $script:rows[0].title='An Independent Lantern'; Write-Manifest; Write-Gallery }
  Assert-Case 'consistency mode rejects an untitled future queue' { Write-Story 'legacy-a' 'An Old Story' 'essays/legacy-a/hero' @{publishDate='2099-01-01T09:00:00-05:00'} } 'ARTWORK-TITLE-QUEUE' -Consistency

  Assert-AvailabilityCase 'explicit alternate pairing rejects its article headline before writes' {} 'A Suppressed Hero' 'independent'
  Assert-AvailabilityCase 'explicit alternate pairing rejects its short title before writes' {
    Write-Story 'suppressed' 'A Suppressed Hero' 'essays/suppressed/hero' @{short_title='Private Notes'}
  } 'Private Notes' 'independent'
  Assert-AvailabilityCase 'encoded explicit association and image alias retain headline protection' {
    $script:manifest.aliases['/images/pairing.png']='essays/pairing/hero'
    $script:rows[2].image='images/pairing.png'
    $script:rows[2].essay='/essays/caf%C3%A9/'
    Write-Manifest
    Write-Gallery
    Write-Story 'suppressed' 'A Suppressed Hero' 'essays/suppressed/hero' @{url='/essays/café/'}
  } 'A Suppressed Hero' 'independent'
  Assert-AvailabilityCase 'explicit association rejects normalized headline copies' {} ' A SUPPRESSED HERO! ' 'independent'
  Assert-AvailabilityCase 'same explicitly paired asset accepts a distinct title without writes' {} 'A Separate Scene'

  Set-UpBaseline
  foreach ($case in @(
    @{Name='missing base';Args=@{};Error='requires BaseRef'},
    @{Name='invalid base';Args=@{BaseRef='not-a-ref'};Error='valid Git commit'},
    @{Name='invalid head';Args=@{BaseRef=$baseCommit;HeadRef='not-a-ref'};Error='valid Git commit'},
    @{Name='working base';Args=@{BaseRef='WORKTREE'};Error='immutable Git commit'},
    @{Name='ambiguous consistency';Args=@{BaseRef=$baseCommit;ConsistencyOnly=$true};Error='not both'}
  )) {
    $arguments = @{Root=$FixtureRoot;HeadRef='WORKTREE';Clock='2030-01-01T12:00:00Z'}
    foreach ($key in $case.Args.Keys) { $arguments[$key] = $case.Args[$key] }
    $caught = ''
    try { & $gate @arguments | Out-Null } catch { $caught = $_.Exception.Message }
    if ($caught -notmatch $case.Error) { throw "Case '$($case.Name)' did not reject required references: $caught" }
    $caseCount++
  }
  $env:GITHUB_EVENT_NAME='pull_request'
  $caught = ''
  try { & $gate -Root $FixtureRoot -ConsistencyOnly | Out-Null } catch { $caught=$_.Exception.Message }
  if ($caught -notmatch 'cannot bypass admission') { throw 'PR consistency bypass was not rejected.' }
  $caseCount++
  $env:GITHUB_EVENT_NAME=''

  # Immutable head verification must ignore an unrelated dirty working copy.
  Set-UpBaseline
  $script:manifest.assets['essays/unused/hero'].artwork_title = 'The Open Window'
  Write-Manifest
  Write-Story 'new' 'A New Story' 'essays/unused/hero'
  & git -C $FixtureRoot -c core.autocrlf=false add --all
  & git -C $FixtureRoot -c user.name=Fixture -c user.email=fixture@example.test commit --quiet -m 'named publication fixture'
  if ($LASTEXITCODE) { throw 'Cannot commit isolated named-publication fixture.' }
  Write-Story 'dirty-only' 'A Dirty Unnamed Draft' 'essays/unused/hero'
  $script:manifest.assets['essays/unused/hero'].Remove('artwork_title')
  Write-Manifest
  & $gate -Root $FixtureRoot -BaseRef $baseCommit -HeadRef HEAD -Clock '2030-01-01T12:00:00Z' | Out-Null
  $caseCount++
} finally {
  $env:GITHUB_EVENT_NAME=$originalEvent
}

Write-Host "Gallery artwork title admission fixtures passed: $caseCount cases."
Write-Host "Fixture retained at: $FixtureRoot"
$global:LASTEXITCODE = 0
