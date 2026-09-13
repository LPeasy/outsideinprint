[CmdletBinding(DefaultParameterSetName = 'Publish')]
param(
  [Parameter(Mandatory = $true, ParameterSetName = 'Publish')]
  [string]$ImagePath,

  [Parameter(Mandatory = $true, ParameterSetName = 'Publish')]
  [string]$Title,

  [Parameter(Mandatory = $true, ParameterSetName = 'Publish')]
  [string]$Alt,

  [Parameter(ParameterSetName = 'Publish')]
  [ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)*$')]
  [string]$Slug,

  [Parameter(ParameterSetName = 'Publish')]
  [Parameter(Mandatory = $true, ParameterSetName = 'LinkExisting')]
  [string]$EssayPath,

  [Parameter(Mandatory = $true, ParameterSetName = 'LinkExisting')]
  [ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)*$')]
  [string]$LinkExistingSlug,

  [Parameter(Mandatory = $true, ParameterSetName = 'Dialogue')]
  [ValidatePattern('^/syd-and-oliver/[a-z0-9]+(?:-[a-z0-9]+)*/$')]
  [string]$DialoguePath,

  [Parameter(ParameterSetName = 'Publish')]
  [switch]$NoEssayLink,

  [Parameter(ParameterSetName = 'Publish')]
  [Parameter(ParameterSetName = 'Dialogue')]
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),

  [Parameter(ParameterSetName = 'Publish')]
  [Parameter(ParameterSetName = 'Dialogue')]
  [string]$PublishDate,

  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\image_asset_manifest.ps1')

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
    $inner = $trimmed.Substring(1, $trimmed.Length - 2)
    if ($trimmed.StartsWith('"')) { return $inner.Replace('\"', '"') }
    return $inner.Replace("''", "'")
  }

  return $trimmed
}

function Get-EasternTimeZone {
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
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    throw "$Label cannot be empty."
  }

  if ($trimmed -match '^\d{4}-\d{2}-\d{2}$') {
    $date = [datetime]::ParseExact($trimmed, 'yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture)
    $eastern = Get-EasternTimeZone
    $offset = $eastern.GetUtcOffset($date)
    return [datetimeoffset]::new($date.Year, $date.Month, $date.Day, 0, 0, 0, $offset)
  }

  $parsed = [datetimeoffset]::MinValue
  if ([datetimeoffset]::TryParse($trimmed, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
    return $parsed
  }

  throw "$Label must use yyyy-MM-dd or an ISO timestamp with timezone offset. Received: $Value"
}

function Get-CurrentEasternTime {
  $eastern = Get-EasternTimeZone
  return [System.TimeZoneInfo]::ConvertTime([datetimeoffset]::UtcNow, $eastern)
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
  # Front matter files are small; read eagerly so Windows does not retain a
  # lazy file handle after an audit or association-only update.
  $lines = [System.IO.File]::ReadAllLines($Path)
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

function Test-IsSourceFreeMusing {
  param([string]$Path)

  $frontMatter = Read-MarkdownFrontMatter -Path $Path
  foreach ($key in @('library_type', 'collections', 'source_mode', 'external_factual_claims')) {
    if (-not $frontMatter.ContainsKey($key)) {
      return $false
    }
  }

  if (([string]$frontMatter['library_type']).Trim() -ine 'musing') {
    return $false
  }
  if (([string]$frontMatter['source_mode']).Trim() -ine 'source_free') {
    return $false
  }
  if (([string]$frontMatter['external_factual_claims']).Trim() -ine 'none') {
    return $false
  }

  return ([string]$frontMatter['collections']).Trim() -match '^\s*\[\s*["'']?musings["'']?\s*\]\s*$'
}

function Test-IsSourceFreeAffirmation {
  param([string]$Path)

  $frontMatter = Read-MarkdownFrontMatter -Path $Path
  foreach ($key in @('section_label', 'library_type', 'collections', 'source_mode', 'external_factual_claims')) {
    if (-not $frontMatter.ContainsKey($key)) {
      return $false
    }
  }

  if (([string]$frontMatter['section_label']).Trim() -ine 'affirmation') {
    return $false
  }
  if (([string]$frontMatter['library_type']).Trim() -ine 'affirmation') {
    return $false
  }
  if (([string]$frontMatter['source_mode']).Trim() -ine 'source_free') {
    return $false
  }
  if (([string]$frontMatter['external_factual_claims']).Trim() -ine 'none') {
    return $false
  }

  return ([string]$frontMatter['collections']).Trim() -match '^\s*\[\s*["'']?the-things-we-say["'']?\s*\]\s*$'
}

function Test-IsSourceFreeReflection {
  param([string]$Path)

  return (
    (Test-IsSourceFreeMusing -Path $Path) -or
    (Test-IsSourceFreeAffirmation -Path $Path)
  )
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
  foreach ($file in Get-ChildItem -LiteralPath $essayDirectory -Filter '*.md' -File -Recurse) {
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

  foreach ($file in Get-ChildItem -LiteralPath $essayDirectory -Filter '*.md' -File -Recurse) {
    $frontMatter = Read-MarkdownFrontMatter -Path $file.FullName
    if ($frontMatter.ContainsKey('slug') -and ([string]$frontMatter['slug']) -eq $slug) {
      return $file.FullName
    }
  }

  throw "Linked essay not found for $SiteEssayPath under content\essays."
}

function Get-EssayReleaseInfo {
  param(
    [string]$Root,
    [string]$SiteEssayPath
  )

  $markdownPath = Resolve-EssayMarkdownPath -Root $Root -SiteEssayPath $SiteEssayPath
  $frontMatter = Read-MarkdownFrontMatter -Path $markdownPath
  if (-not $frontMatter.ContainsKey('date')) {
    throw "Linked essay $SiteEssayPath is missing front matter date."
  }

  $draftValue = ''
  if ($frontMatter.ContainsKey('draft')) {
    $draftValue = ([string]$frontMatter['draft']).Trim().ToLowerInvariant()
  }
  if ($draftValue -eq 'true') {
    throw "Linked essay $SiteEssayPath is still draft:true."
  }

  $releaseValue = if ($frontMatter.ContainsKey('publishdate') -and -not [string]::IsNullOrWhiteSpace([string]$frontMatter['publishdate'])) {
    [string]$frontMatter['publishdate']
  }
  else {
    [string]$frontMatter['date']
  }

  return [pscustomobject]@{
    Path = $markdownPath
    ReleaseAt = ConvertTo-OipDateTimeOffset -Value $releaseValue -Label "Linked essay release date for $SiteEssayPath"
  }
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
  $markdownPath = Resolve-EssayMarkdownPath -Root $Root -SiteEssayPath $normalizedEssayPath

  # Separate Musings and Affirmation contracts exempt only their exact
  # source-free predicates from the essay-specific OIP-99 package.
  if (Test-IsSourceFreeReflection -Path $markdownPath) {
    return
  }

  if (-not (Test-EditorialPhilosophyAuditEvidence -Root $Root -Slug $slug)) {
    throw "Linked essay $normalizedEssayPath is missing accepted Editorial Philosophy Audit evidence. Add a per-essay OIP-99 report or daily backfill ledger entry, use a fully declared source-free Musing or Affirmation, or pass -NoEssayLink only for an explicitly standalone Gallery image."
  }
}

function Assert-LinkedEssayScheduleCompatibility {
  param(
    [string]$Root,
    [string]$SiteEssayPath,
    [datetimeoffset]$CartoonReleaseAt
  )

  if ([string]::IsNullOrWhiteSpace($SiteEssayPath)) {
    return
  }

  $normalizedEssayPath = Normalize-EssayPath -Value $SiteEssayPath
  $essayRelease = Get-EssayReleaseInfo -Root $Root -SiteEssayPath $normalizedEssayPath
  if ($CartoonReleaseAt -lt $essayRelease.ReleaseAt) {
    throw ("Cartoon release {0} is earlier than linked essay {1} release {2}. Queue the cartoon at or after the essay publishDate." -f $CartoonReleaseAt.ToString('o'), $normalizedEssayPath, $essayRelease.ReleaseAt.ToString('o'))
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

  $preferredKeyOrder = @('title', 'date', 'publishDate', 'image', 'essay', 'alt', 'caption', 'width', 'height')

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

$resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path $Root).Path)

if ($PSCmdlet.ParameterSetName -eq 'Dialogue') {
  # Reuse the dialogue's approved managed hero. This branch never copies art,
  # registers an asset, infers an essay, or invokes an essay editorial gate.
  $dialogueSlug = ($DialoguePath.Trim('/') -split '/')[-1]
  $markdownPath = Join-Path $resolvedRoot "content/essays/dialogues/$dialogueSlug.md"
  if (-not (Test-Path -LiteralPath $markdownPath -PathType Leaf)) {
    throw "Dialogue source not found: $DialoguePath"
  }
  $frontMatter = Read-MarkdownFrontMatter -Path $markdownPath
  if ([string]$frontMatter['library_type'] -cne 'dialogue' -or
      [string]$frontMatter['url'] -cne $DialoguePath -or
      [string]$frontMatter['collections'] -cnotmatch '^\s*\[\s*["'']?syd-and-oliver-dialogues["'']?\s*\]\s*$') {
    throw "Dialogue must declare library_type: dialogue, the Syd and Oliver collection, and its canonical URL: $DialoguePath"
  }
  if ([string]$frontMatter['draft'] -ine 'false') {
    throw "Dialogue must explicitly declare draft:false before Gallery publication: $DialoguePath"
  }
  foreach ($field in @('title', 'date', 'featured_image', 'featured_image_alt')) {
    if ([string]::IsNullOrWhiteSpace([string]$frontMatter[$field])) {
      throw "Dialogue $DialoguePath is missing $field."
    }
  }
  $dialogueReleaseAt = ConvertTo-OipDateTimeOffset -Value $frontMatter['date'] -Label 'Dialogue date'
  if (-not [string]::IsNullOrWhiteSpace([string]$frontMatter['publishdate'])) {
    $dialoguePublishAt = ConvertTo-OipDateTimeOffset -Value $frontMatter['publishdate'] -Label 'Dialogue publishDate'
    if ($dialoguePublishAt -gt $dialogueReleaseAt) { $dialogueReleaseAt = $dialoguePublishAt }
  }

  $manifest = Read-OipImageAssetManifest -Root $resolvedRoot
  $assetId = [string]$frontMatter['featured_image']
  if (-not $manifest.assets.Contains($assetId)) {
    throw "Dialogue featured_image must be a registered bare managed asset ID: $assetId"
  }
  $asset = $manifest.assets[$assetId]
  if ([string]$asset.review_state -cne 'approved' -or
      [string]$asset.processing_state -cne 'derivative_capable' -or
      [string]$asset.usage_state -cne 'referenced') {
    throw "Dialogue hero must be approved, referenced, and derivative_capable: $assetId"
  }
  $resolvedAsset = Resolve-OipImageAsset -Root $resolvedRoot -Reference $assetId -Manifest $manifest
  Assert-OipManagedImageFile -Path $resolvedAsset.Path -ExpectedExtension ([IO.Path]::GetExtension($resolvedAsset.Path)) -Label 'Dialogue hero' | Out-Null
  $dimensions = Get-OipImageNativeDimensions -Path $resolvedAsset.Path
  $sourceHash = (Get-FileHash -LiteralPath $resolvedAsset.Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($sourceHash -cne [string]$asset.sha256 -or $dimensions.Width -ne [int]$asset.width -or $dimensions.Height -ne [int]$asset.height) {
    throw "Dialogue hero source hash or dimensions differ from its manifest: $assetId"
  }

  $dataPath = Join-Path $resolvedRoot 'data/editorial_cartoons.yaml'
  $data = Read-CartoonData -Path $dataPath
  $existing = @($data.cartoons | Where-Object { $_.slug -ceq $dialogueSlug })
  if ($existing.Count -gt 1) { throw "Duplicate Gallery slug: $dialogueSlug" }
  foreach ($cartoon in @($data.cartoons)) {
    if ($cartoon.slug -ceq $dialogueSlug) {
      if ([string]$cartoon.image -cne $assetId -or ($cartoon.Contains('essay') -and [string]$cartoon.essay -cne $DialoguePath)) {
        throw "Gallery slug already belongs to different artwork or a different piece: $dialogueSlug"
      }
    }
    elseif ([string]$cartoon.image -ceq $assetId -or ($cartoon.Contains('essay') -and [string]$cartoon.essay -ceq $DialoguePath)) {
      throw "Dialogue artwork or route already has a different Gallery entry: $($cartoon.slug)"
    }
  }

  # Keep an existing release unchanged on repeat invocations. For a new entry,
  # derive the full article release instant so same-day art cannot precede it.
  $galleryDate = if ($PSBoundParameters.ContainsKey('Date')) { $Date }
    elseif ($existing.Count -eq 1) { [string]$existing[0].date }
    else { ([string]$frontMatter['date']).Substring(0, 10) }
  if ($galleryDate -notmatch '^\d{4}-\d{2}-\d{2}$') { throw "Date must use yyyy-MM-dd format. Received: $galleryDate" }
  $galleryPublishDate = if ($PSBoundParameters.ContainsKey('PublishDate')) { $PublishDate }
    elseif ($PSBoundParameters.ContainsKey('Date')) { '' }
    elseif ($existing.Count -eq 1 -and $existing[0].Contains('publishDate')) { [string]$existing[0].publishDate }
    elseif ($existing.Count -eq 0) { $dialogueReleaseAt.ToString('o') }
    else { '' }
  $galleryReleaseValue = if ([string]::IsNullOrWhiteSpace($galleryPublishDate)) { $galleryDate } else { $galleryPublishDate }
  $galleryReleaseAt = ConvertTo-OipDateTimeOffset -Value $galleryReleaseValue -Label 'Dialogue Gallery release'
  if ($galleryReleaseAt -lt $dialogueReleaseAt) {
    throw "Gallery release is earlier than linked dialogue release $($dialogueReleaseAt.ToString('o')). Set -PublishDate at or after the dialogue release."
  }
  $isQueuedPublish = $galleryReleaseAt -gt (Get-CurrentEasternTime)
  if ($isQueuedPublish -and -not ($PSBoundParameters.ContainsKey('Date') -or $PSBoundParameters.ContainsKey('PublishDate')) -and $existing.Count -eq 0) {
    throw 'Future dialogue Gallery publication requires an explicit -Date or -PublishDate schedule.'
  }
  if ($isQueuedPublish -and ([string]::IsNullOrWhiteSpace([string]$data.current) -or @($data.cartoons | Where-Object { $_.slug -ceq [string]$data.current }).Count -ne 1)) {
    throw 'Queued dialogue art requires an existing current Gallery entry.'
  }

  $entry = [ordered]@{}
  if ($existing.Count -eq 1) {
    foreach ($property in $existing[0].GetEnumerator()) { $entry[$property.Key] = $property.Value }
  }
  $entry.slug = $dialogueSlug
  $entry.title = [string]$frontMatter['title']
  $entry.date = $galleryDate
  if (-not [string]::IsNullOrWhiteSpace($galleryPublishDate)) { $entry.publishDate = $galleryPublishDate }
  elseif ($entry.Contains('publishDate')) { $entry.Remove('publishDate') }
  $entry.image = $assetId
  $entry.essay = $DialoguePath
  $entry.alt = [string]$frontMatter['featured_image_alt']
  $entry.width = $dimensions.Width
  $entry.height = $dimensions.Height
  $cartoons = @(foreach ($cartoon in @($data.cartoons)) {
    if ($cartoon.slug -ceq $dialogueSlug) { $entry } else { $cartoon }
  })
  if ($existing.Count -eq 0) { $cartoons += $entry }
  # The current selector falls back to eligible art while this entry is future,
  # then selects this slug automatically on the first build after its release.
  $current = $dialogueSlug
  Write-CartoonData -Path $dataPath -Current $current -Cartoons $cartoons
  Write-Host "Updated dialogue Gallery illustration: $($entry.title)"
  Write-Host "Reused managed image: $assetId"
  Write-Host "Dialogue: $DialoguePath"
  Write-Host "Current front page illustration: $current"
  if ($isQueuedPublish) { Write-Host "Queued release: $galleryPublishDate" }
  return
}

if ($PSCmdlet.ParameterSetName -eq 'LinkExisting') {
  $resolvedEssayPath = Normalize-EssayPath -Value $EssayPath
  $dataPath = Join-Path $resolvedRoot 'data\editorial_cartoons.yaml'
  $data = Read-CartoonData -Path $dataPath
  if ([string]::IsNullOrWhiteSpace([string]$data.current)) {
    throw 'Association-only updates require data/editorial_cartoons.yaml to define current.'
  }

  $cartoons = @()
  $updated = $false
  foreach ($cartoon in @($data.cartoons)) {
    if ($cartoon.slug -ne $LinkExistingSlug) {
      $cartoons += $cartoon
      continue
    }

    if ($updated) {
      throw "Association-only update found duplicate cartoon slug: $LinkExistingSlug"
    }

    $updatedCartoon = [ordered]@{}
    foreach ($property in $cartoon.GetEnumerator()) {
      $updatedCartoon[$property.Key] = $property.Value
    }

    if (-not $updatedCartoon.Contains('date') -or [string]::IsNullOrWhiteSpace([string]$updatedCartoon.date)) {
      throw "Cartoon '$LinkExistingSlug' is missing its release date."
    }

    $cartoonReleaseValue = if ($updatedCartoon.Contains('publishDate') -and -not [string]::IsNullOrWhiteSpace([string]$updatedCartoon.publishDate)) {
      [string]$updatedCartoon.publishDate
    }
    else {
      [string]$updatedCartoon.date
    }
    $cartoonReleaseAt = ConvertTo-OipDateTimeOffset -Value $cartoonReleaseValue -Label "Cartoon release date for $LinkExistingSlug"

    Assert-LinkedEssayPhilosophyAudit -Root $resolvedRoot -SiteEssayPath $resolvedEssayPath
    Assert-LinkedEssayScheduleCompatibility -Root $resolvedRoot -SiteEssayPath $resolvedEssayPath -CartoonReleaseAt $cartoonReleaseAt

    $updatedCartoon.essay = $resolvedEssayPath
    $cartoons += $updatedCartoon
    $updated = $true
  }

  if (-not $updated) {
    throw "Association-only update could not find cartoon slug: $LinkExistingSlug"
  }

  Write-CartoonData -Path $dataPath -Current ([string]$data.current) -Cartoons @($cartoons)
  Write-Host "Associated cartoon: $LinkExistingSlug"
  Write-Host "Essay: $resolvedEssayPath"
  Write-Host "Current front page cartoon preserved: $($data.current)"
  return
}

if (-not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) {
  throw "Image not found: $ImagePath"
}

if ($Date -notmatch '^\d{4}-\d{2}-\d{2}$') {
  throw "Date must use yyyy-MM-dd format. Received: $Date"
}

$cartoonReleaseValue = if (-not [string]::IsNullOrWhiteSpace($PublishDate)) { $PublishDate } else { $Date }
$cartoonReleaseAt = ConvertTo-OipDateTimeOffset -Value $cartoonReleaseValue -Label 'Cartoon publish date'
$isQueuedPublish = $cartoonReleaseAt -gt (Get-CurrentEasternTime)

if ($NoEssayLink -and -not [string]::IsNullOrWhiteSpace($EssayPath)) {
  throw 'Use either -EssayPath or -NoEssayLink, not both.'
}

$resolvedImagePath = [System.IO.Path]::GetFullPath((Resolve-Path $ImagePath).Path)
if ([System.IO.Path]::GetExtension($resolvedImagePath) -ine '.png') {
  throw 'Front-page cartoon source must use a .png extension.'
}
Assert-OipManagedImageFile -Path $resolvedImagePath -ExpectedExtension '.png' -Label 'Front-page cartoon source' | Out-Null
$defaultEssayPath = $null
if ($isQueuedPublish -and -not $NoEssayLink -and [string]::IsNullOrWhiteSpace($EssayPath)) {
  throw 'Queued future cartoon publishes require -EssayPath "/essays/<slug>/". Default latest-essay inference is only safe for immediate cartoon publishes.'
}

if (-not $NoEssayLink -and [string]::IsNullOrWhiteSpace($EssayPath)) {
  Assert-DefaultEssaySourceCurrent -Root $resolvedRoot
  $defaultEssayPath = Get-LatestEssayPath -Root $resolvedRoot
  Write-Host "Default linked essay: $defaultEssayPath"
}

$resolvedEssayPath = $null
if (-not [string]::IsNullOrWhiteSpace($EssayPath)) {
  $resolvedEssayPath = Normalize-EssayPath -Value $EssayPath
}

$resolvedSlug = if ([string]::IsNullOrWhiteSpace($Slug)) { ConvertTo-Slug $Title } else { $Slug }
$assetId = "editorial/$resolvedSlug"
$assetSource = "images/originals/editorial/$resolvedSlug.png"
$targetRelativePath = "assets\images\originals\editorial\$resolvedSlug.png"
$targetPath = Join-Path $resolvedRoot $targetRelativePath
$targetDirectory = Split-Path -Parent $targetPath

if (-not (Test-Path -LiteralPath $targetDirectory -PathType Container)) {
  New-Item -Path $targetDirectory -ItemType Directory -Force | Out-Null
}

Copy-Item -LiteralPath $resolvedImagePath -Destination $targetPath -Force

$manifest = Read-OipImageAssetManifest -Root $resolvedRoot -AllowMissing
$sourceHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
$reviewState = 'pending_review'
if ($manifest.assets.Contains($assetId) -and [string]$manifest.assets[$assetId].sha256 -eq $sourceHash) {
  $reviewState = [string]$manifest.assets[$assetId].review_state
}

$dimensions = Get-OipImageNativeDimensions -Path $targetPath
$width = $dimensions.Width
$height = $dimensions.Height

Register-OipImageAsset `
  -Root $resolvedRoot `
  -Id $assetId `
  -Source $assetSource `
  -ImageClass 'editorial_cartoon' `
  -ProcessingHint 'drawing' `
  -ReviewState $reviewState `
  -UsageState 'referenced' `
  -Aliases @("/images/editorial/$resolvedSlug.png") | Out-Null

$dataPath = Join-Path $resolvedRoot 'data\editorial_cartoons.yaml'
$data = Read-CartoonData -Path $dataPath
$cartoons = @()
$updated = $false

foreach ($cartoon in @($data.cartoons)) {
  if ($cartoon.slug -eq $resolvedSlug) {
    $updatedCartoon = [ordered]@{}
    foreach ($property in $cartoon.GetEnumerator()) {
      $updatedCartoon[$property.Key] = $property.Value
    }

    $updatedCartoon.slug = $resolvedSlug
    $updatedCartoon.title = $Title
    $updatedCartoon.date = $Date
    if (-not [string]::IsNullOrWhiteSpace($PublishDate)) {
      $updatedCartoon.publishDate = $PublishDate
    }
    elseif ($updatedCartoon.Contains('publishDate')) {
      $updatedCartoon.Remove('publishDate')
    }
    $updatedCartoon.image = $assetId
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
      Assert-LinkedEssayScheduleCompatibility -Root $resolvedRoot -SiteEssayPath $updatedCartoon.essay -CartoonReleaseAt $cartoonReleaseAt
    }

    $cartoons += $updatedCartoon
    $updated = $true
  } else {
    $cartoons += $cartoon
  }
}

if (-not $updated) {
  $newCartoon = [ordered]@{
    slug = $resolvedSlug
    title = $Title
    date = $Date
    image = $assetId
    alt = $Alt
    width = $width
    height = $height
  }

  if (-not [string]::IsNullOrWhiteSpace($PublishDate)) {
    $newCartoon.publishDate = $PublishDate
  }

  if (-not $NoEssayLink) {
    $newCartoon.essay = if ($resolvedEssayPath) { $resolvedEssayPath } else { $defaultEssayPath }
  }

  if (-not $NoEssayLink -and $newCartoon.Contains('essay')) {
    Assert-LinkedEssayPhilosophyAudit -Root $resolvedRoot -SiteEssayPath $newCartoon.essay
    Assert-LinkedEssayScheduleCompatibility -Root $resolvedRoot -SiteEssayPath $newCartoon.essay -CartoonReleaseAt $cartoonReleaseAt
  }

  $cartoons += $newCartoon
}

Write-CartoonData -Path $dataPath -Current $resolvedSlug -Cartoons @($cartoons)

$linkedEssay = $null
foreach ($cartoon in @($cartoons)) {
  if ($cartoon.slug -eq $resolvedSlug -and $cartoon.Contains('essay')) {
    $linkedEssay = [string]$cartoon.essay
    break
  }
}

Write-Host "Updated front page cartoon: $Title"
Write-Host "Image: $targetRelativePath"
if (-not [string]::IsNullOrWhiteSpace($linkedEssay)) {
  Write-Host "Essay: $linkedEssay"
}
if (-not [string]::IsNullOrWhiteSpace($PublishDate)) {
  Write-Host "Publish date: $PublishDate"
}
Write-Host "Data: data\editorial_cartoons.yaml"
