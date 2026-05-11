param(
  [Parameter(Mandatory = $true)]
  [string]$ImagePath,

  [Parameter(Mandatory = $true)]
  [string]$Title,

  [Parameter(Mandatory = $true)]
  [string]$Alt,

  [string]$EssayPath,

  [switch]$NoEssayLink,

  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),

  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

function ConvertTo-Slug {
  param([string]$Value)

  $slug = $Value.ToLowerInvariant()
  $slug = [regex]::Replace($slug, '[^a-z0-9]+', '-')
  $slug = $slug.Trim('-')

  if ([string]::IsNullOrWhiteSpace($slug)) {
    throw 'Unable to derive a slug from the supplied title.'
  }

  return $slug
}

function Quote-YamlValue {
  param([string]$Value)

  return '"' + ($Value -replace '"', '\"') + '"'
}

function Unquote-YamlValue {
  param([string]$Value)

  $trimmed = $Value.Trim()
  if (($trimmed.StartsWith('"') -and $trimmed.EndsWith('"')) -or ($trimmed.StartsWith("'") -and $trimmed.EndsWith("'"))) {
    return $trimmed.Substring(1, $trimmed.Length - 2)
  }

  return $trimmed
}

function Normalize-EssayPath {
  param([string]$Value)

  $path = ([string]$Value).Trim()
  if ([string]::IsNullOrWhiteSpace($path)) {
    throw 'Essay path cannot be empty.'
  }

  if ($path -match '^https?://') {
    throw "Essay path must be a site-relative /essays/ path. Received: $path"
  }

  if (-not $path.StartsWith('/')) {
    $path = '/' + $path
  }

  if (-not $path.EndsWith('/')) {
    $path = $path + '/'
  }

  if ($path -notmatch '^/essays/[^/]+/$') {
    throw "Essay path must use /essays/<slug>/ format. Received: $path"
  }

  return $path
}

function Read-MarkdownFrontMatter {
  param([string]$Path)

  $result = @{}
  $lines = [System.IO.File]::ReadLines($Path)
  $inFrontMatter = $false
  $started = $false

  foreach ($line in $lines) {
    if (-not $started) {
      if ($line -eq '---') {
        $started = $true
        $inFrontMatter = $true
      }
      else {
        break
      }
      continue
    }

    if ($inFrontMatter -and $line -eq '---') {
      break
    }

    if ($inFrontMatter -and $line -match '^([A-Za-z0-9_]+):\s*(.*?)\s*$') {
      $result[$Matches[1].ToLowerInvariant()] = Unquote-YamlValue $Matches[2]
    }
  }

  return $result
}

function Invoke-GitRequired {
  param(
    [string]$Root,
    [string[]]$Arguments,
    [string]$FailureMessage
  )

  $output = & git -C $Root @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    $detail = (($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
    if (-not [string]::IsNullOrWhiteSpace($detail)) {
      throw "$FailureMessage`n$detail"
    }

    throw $FailureMessage
  }

  return @($output)
}

function Assert-DefaultEssaySourceCurrent {
  param([string]$Root)

  $inside = Invoke-GitRequired `
    -Root $Root `
    -Arguments @('rev-parse', '--is-inside-work-tree') `
    -FailureMessage 'Unable to verify git worktree before inferring the latest essay link.'

  if (([string]($inside | Select-Object -First 1)).Trim() -ne 'true') {
    throw 'Latest essay inference requires running inside the Outside In Print git worktree.'
  }

  [void](Invoke-GitRequired `
    -Root $Root `
    -Arguments @('remote', 'get-url', 'origin') `
    -FailureMessage 'Unable to verify the origin remote before inferring the latest essay link.')

  [void](Invoke-GitRequired `
    -Root $Root `
    -Arguments @('fetch', 'origin', 'main', '--quiet') `
    -FailureMessage 'Unable to refresh origin/main before inferring the latest essay link. Use a fresh worktree from origin/main or pass -EssayPath explicitly.')

  $head = ([string]((Invoke-GitRequired `
    -Root $Root `
    -Arguments @('rev-parse', 'HEAD') `
    -FailureMessage 'Unable to read the current HEAD before inferring the latest essay link.') | Select-Object -First 1)).Trim()

  $originMain = ([string]((Invoke-GitRequired `
    -Root $Root `
    -Arguments @('rev-parse', 'origin/main') `
    -FailureMessage 'Unable to read origin/main before inferring the latest essay link.') | Select-Object -First 1)).Trim()

  if ($head -ne $originMain) {
    throw "Latest essay inference requires a fresh worktree at origin/main. Current HEAD is $head; origin/main is $originMain. Create a fresh worktree from origin/main or pass -EssayPath explicitly."
  }
}

function Get-LatestEssayPath {
  param([string]$Root)

  $essayDirectory = Join-Path $Root 'content\essays'
  if (-not (Test-Path -LiteralPath $essayDirectory -PathType Container)) {
    throw "Essay directory not found: $essayDirectory"
  }

  $candidates = @()
  foreach ($file in Get-ChildItem -LiteralPath $essayDirectory -Filter '*.md' -File) {
    if ($file.Name -eq '_index.md') {
      continue
    }

    $frontMatter = Read-MarkdownFrontMatter -Path $file.FullName
    if (-not $frontMatter.ContainsKey('date')) {
      continue
    }

    $draftValue = ''
    if ($frontMatter.ContainsKey('draft')) {
      $draftValue = ([string]$frontMatter['draft']).Trim().ToLowerInvariant()
    }
    if ($draftValue -eq 'true') {
      continue
    }

    $dateValue = [string]$frontMatter['date']
    if ($dateValue -match '^(?<date>\d{4}-\d{2}-\d{2})') {
      $candidateDate = [datetime]::ParseExact($Matches['date'], 'yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture)
    } else {
      continue
    }

    $slug = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
    if ($frontMatter.ContainsKey('slug') -and -not [string]::IsNullOrWhiteSpace([string]$frontMatter['slug'])) {
      $slug = [string]$frontMatter['slug']
    }

    $candidates += [pscustomobject]@{
      Date = $candidateDate
      Slug = $slug
      Path = "/essays/$slug/"
    }
  }

  if ($candidates.Count -eq 0) {
    throw 'Unable to find a non-draft essay with a yyyy-MM-dd front matter date.'
  }

  return ($candidates | Sort-Object Date, Slug -Descending | Select-Object -First 1).Path
}

function Get-SlugFromSiteEssayPath {
  param([string]$SiteEssayPath)

  $normalized = Normalize-EssayPath -Value $SiteEssayPath
  return ($normalized.Trim('/') -split '/')[-1]
}

function Resolve-EssayMarkdownPath {
  param(
    [string]$Root,
    [string]$SiteEssayPath
  )

  $slug = Get-SlugFromSiteEssayPath -SiteEssayPath $SiteEssayPath
  $essayDirectory = Join-Path $Root 'content\essays'
  $directPath = Join-Path $essayDirectory "$slug.md"
  if (Test-Path -LiteralPath $directPath -PathType Leaf) {
    return $directPath
  }

  foreach ($file in Get-ChildItem -LiteralPath $essayDirectory -Filter '*.md' -File) {
    $frontMatter = Read-MarkdownFrontMatter -Path $file.FullName
    if ($frontMatter.ContainsKey('slug') -and ([string]$frontMatter['slug']) -eq $slug) {
      return $file.FullName
    }
  }

  throw "Linked essay not found for $SiteEssayPath under content\essays."
}

function Test-EditorialPhilosophyPassLine {
  param(
    [string]$Text,
    [string]$Label
  )

  $pattern = '(?im)^\s*(?:[-*]\s*)?(?:\|\s*)?' + [regex]::Escape($Label) + '\b.*\bPASS\b'
  return [regex]::IsMatch($Text, $pattern)
}

function Test-EditorialPhilosophyReportText {
  param([string]$Text)

  if (-not [regex]::IsMatch($Text, '(?im)^##\s+Editorial Philosophy Audit\s*$')) {
    return $false
  }

  if (-not [regex]::IsMatch($Text, '(?im)^\s*Decision:\s*PASS\s*$')) {
    return $false
  }

  foreach ($label in @('Evidence', 'Logic', 'Incentives', 'Tradeoffs', 'Consequences', 'Uncertainty', 'Institutional Behavior')) {
    if (-not (Test-EditorialPhilosophyPassLine -Text $Text -Label $label)) {
      return $false
    }
  }

  return $true
}

function Test-EditorialPhilosophyLedgerEntry {
  param([object]$Entry)

  if ($null -eq $Entry -or ($Entry.PSObject.Properties.Name -notcontains 'editorial_philosophy')) {
    return $false
  }

  $audit = $Entry.editorial_philosophy
  if ($null -eq $audit -or [string]$audit.status -ne 'PASS') {
    return $false
  }

  foreach ($field in @('evidence', 'logic', 'incentives', 'tradeoffs', 'consequences', 'uncertainty', 'institutional_behavior')) {
    if ($audit.PSObject.Properties.Name -notcontains $field) {
      return $false
    }

    if ([string]$audit.$field -ne 'PASS') {
      return $false
    }
  }

  return $true
}

function Test-EditorialPhilosophyAuditEvidence {
  param(
    [string]$Root,
    [string]$Slug
  )

  $refinementReport = Join-Path $Root "docs\editorial-audits\99-refinement\$Slug-99-refinement-report.md"
  if (Test-Path -LiteralPath $refinementReport -PathType Leaf) {
    $reportText = Get-Content -LiteralPath $refinementReport -Raw
    if (Test-EditorialPhilosophyReportText -Text $reportText) {
      return $true
    }
  }

  $ledgerPath = Join-Path $Root 'docs\editorial-audits\daily-backfill\ledger.json'
  if (-not (Test-Path -LiteralPath $ledgerPath -PathType Leaf)) {
    return $false
  }

  try {
    $ledger = Get-Content -LiteralPath $ledgerPath -Raw | ConvertFrom-Json
  }
  catch {
    return $false
  }

  if ($null -eq $ledger.completed) {
    return $false
  }

  $entryProperty = $ledger.completed.PSObject.Properties | Where-Object { $_.Name -eq $Slug } | Select-Object -First 1
  if ($null -eq $entryProperty) {
    return $false
  }

  return (Test-EditorialPhilosophyLedgerEntry -Entry $entryProperty.Value)
}

function Assert-LinkedEssayPhilosophyAudit {
  param(
    [string]$Root,
    [string]$SiteEssayPath
  )

  if ([string]::IsNullOrWhiteSpace($SiteEssayPath)) {
    return
  }

  $normalizedEssayPath = Normalize-EssayPath -Value $SiteEssayPath
  $slug = Get-SlugFromSiteEssayPath -SiteEssayPath $normalizedEssayPath
  [void](Resolve-EssayMarkdownPath -Root $Root -SiteEssayPath $normalizedEssayPath)

  if (-not (Test-EditorialPhilosophyAuditEvidence -Root $Root -Slug $slug)) {
    throw "Linked essay $normalizedEssayPath is missing accepted Editorial Philosophy Audit evidence. Add a per-essay OIP-99 report or daily backfill ledger entry before linking the front-page cartoon, or pass -NoEssayLink only for an explicitly standalone cartoon."
  }
}

function Read-CartoonData {
  param([string]$Path)

  $result = [ordered]@{
    current = ''
    cartoons = @()
  }

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $result
  }

  $entries = @()
  $entry = $null

  foreach ($line in [System.IO.File]::ReadLines($Path)) {
    if ($line -match '^current:\s*(.+)\s*$') {
      $result.current = Unquote-YamlValue $Matches[1]
      continue
    }

    if ($line -match '^\s*-\s+slug:\s*(.+)\s*$') {
      if ($null -ne $entry) {
        $entries += $entry
      }
      $entry = [ordered]@{ slug = Unquote-YamlValue $Matches[1] }
      continue
    }

    if ($null -ne $entry -and $line -match '^\s+([a-zA-Z0-9_]+):\s*(.*)\s*$') {
      $key = $Matches[1]
      $value = Unquote-YamlValue $Matches[2]
      if ($key -in @('width', 'height')) {
        $entry[$key] = [int]$value
      } else {
        $entry[$key] = $value
      }
    }
  }

  if ($null -ne $entry) {
    $entries += $entry
  }

  $result.cartoons = @($entries)
  return $result
}

function Write-CartoonData {
  param(
    [string]$Path,
    [string]$Current,
    [object[]]$Cartoons
  )

  $preferredKeyOrder = @('title', 'date', 'image', 'essay', 'alt', 'caption', 'width', 'height')

  $lines = @()
  $lines += "current: $Current"
  $lines += 'cartoons:'

  foreach ($cartoon in $Cartoons) {
    $lines += "  - slug: $($cartoon.slug)"

    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

    foreach ($key in $preferredKeyOrder) {
      if (-not $cartoon.Contains($key)) {
        continue
      }

      $seen.Add($key) | Out-Null
      $value = $cartoon[$key]
      if ($value -is [int] -or $value -is [long]) {
        $lines += "    ${key}: $value"
      } else {
        $lines += "    ${key}: $(Quote-YamlValue ([string]$value))"
      }
    }

    foreach ($property in $cartoon.GetEnumerator()) {
      $key = [string]$property.Key
      if ($key -eq 'slug' -or $seen.Contains($key)) {
        continue
      }

      $value = $property.Value
      if ($value -is [int] -or $value -is [long]) {
        $lines += "    ${key}: $value"
      } else {
        $lines += "    ${key}: $(Quote-YamlValue ([string]$value))"
      }
    }
  }

  $parent = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    New-Item -Path $parent -ItemType Directory -Force | Out-Null
  }

  [System.IO.File]::WriteAllText($Path, (($lines -join [Environment]::NewLine) + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) {
  throw "Image not found: $ImagePath"
}

if ($Date -notmatch '^\d{4}-\d{2}-\d{2}$') {
  throw "Date must use yyyy-MM-dd format. Received: $Date"
}

if ($NoEssayLink -and -not [string]::IsNullOrWhiteSpace($EssayPath)) {
  throw 'Use either -EssayPath or -NoEssayLink, not both.'
}

$resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path $Root).Path)
$resolvedImagePath = [System.IO.Path]::GetFullPath((Resolve-Path $ImagePath).Path)
$defaultEssayPath = $null
if (-not $NoEssayLink -and [string]::IsNullOrWhiteSpace($EssayPath)) {
  Assert-DefaultEssaySourceCurrent -Root $resolvedRoot
  $defaultEssayPath = Get-LatestEssayPath -Root $resolvedRoot
  Write-Host "Default linked essay: $defaultEssayPath"
}

$resolvedEssayPath = $null
if (-not [string]::IsNullOrWhiteSpace($EssayPath)) {
  $resolvedEssayPath = Normalize-EssayPath -Value $EssayPath
}

$slug = ConvertTo-Slug $Title
$targetRelativePath = "static\images\editorial\$slug.png"
$targetPath = Join-Path $resolvedRoot $targetRelativePath
$targetDirectory = Split-Path -Parent $targetPath

if (-not (Test-Path -LiteralPath $targetDirectory -PathType Container)) {
  New-Item -Path $targetDirectory -ItemType Directory -Force | Out-Null
}

Copy-Item -LiteralPath $resolvedImagePath -Destination $targetPath -Force

Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($targetPath)
try {
  $width = $image.Width
  $height = $image.Height
}
finally {
  $image.Dispose()
}

$dataPath = Join-Path $resolvedRoot 'data\editorial_cartoons.yaml'
$data = Read-CartoonData -Path $dataPath
$cartoons = @()
$updated = $false

foreach ($cartoon in @($data.cartoons)) {
  if ($cartoon.slug -eq $slug) {
    $updatedCartoon = [ordered]@{}
    foreach ($property in $cartoon.GetEnumerator()) {
      $updatedCartoon[$property.Key] = $property.Value
    }

    $updatedCartoon.slug = $slug
    $updatedCartoon.title = $Title
    $updatedCartoon.date = $Date
    $updatedCartoon.image = "/images/editorial/$slug.png"
    $updatedCartoon.alt = $Alt
    $updatedCartoon.width = $width
    $updatedCartoon.height = $height

    if ($NoEssayLink) {
      if ($updatedCartoon.Contains('essay')) {
        $updatedCartoon.Remove('essay')
      }
    } elseif ($resolvedEssayPath) {
      $updatedCartoon.essay = $resolvedEssayPath
    } else {
      $updatedCartoon.essay = $defaultEssayPath
    }

    if (-not $NoEssayLink -and $updatedCartoon.Contains('essay')) {
      Assert-LinkedEssayPhilosophyAudit -Root $resolvedRoot -SiteEssayPath $updatedCartoon.essay
    }

    $cartoons += $updatedCartoon
    $updated = $true
  } else {
    $cartoons += $cartoon
  }
}

if (-not $updated) {
  $newCartoon = [ordered]@{
    slug = $slug
    title = $Title
    date = $Date
    image = "/images/editorial/$slug.png"
    alt = $Alt
    width = $width
    height = $height
  }

  if (-not $NoEssayLink) {
    $newCartoon.essay = if ($resolvedEssayPath) { $resolvedEssayPath } else { $defaultEssayPath }
  }

  if (-not $NoEssayLink -and $newCartoon.Contains('essay')) {
    Assert-LinkedEssayPhilosophyAudit -Root $resolvedRoot -SiteEssayPath $newCartoon.essay
  }

  $cartoons += $newCartoon
}

Write-CartoonData -Path $dataPath -Current $slug -Cartoons @($cartoons)

$linkedEssay = $null
foreach ($cartoon in @($cartoons)) {
  if ($cartoon.slug -eq $slug -and $cartoon.Contains('essay')) {
    $linkedEssay = [string]$cartoon.essay
    break
  }
}

Write-Host "Updated front page cartoon: $Title"
Write-Host "Image: $targetRelativePath"
if (-not [string]::IsNullOrWhiteSpace($linkedEssay)) {
  Write-Host "Essay: $linkedEssay"
}
Write-Host "Data: data\editorial_cartoons.yaml"
