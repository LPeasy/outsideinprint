param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ReportBasePath,
  [string[]]$Sections = @('essays','literature','syd-and-oliver','working-papers')
)

$ErrorActionPreference = 'Stop'

if (-not $ReportBasePath) {
  $ReportBasePath = Join-Path $Root 'reports\legacy-essay-audit'
}

function Write-TextNoBom {
  param([string]$Path,[string]$Content)
  $dir = Split-Path -Path $Path -Parent
  if ($dir -and -not (Test-Path $dir -PathType Container)) {
    New-Item -Path $dir -ItemType Directory -Force | Out-Null
  }
  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Normalize-Token {
  param([string]$Value)
  if ($null -eq $Value) { return '' }
  return $Value.Trim().Trim('"', "'").ToLowerInvariant()
}

function Normalize-List {
  param([object[]]$Values)
  $seen = [System.Collections.Generic.HashSet[string]]::new()
  $result = New-Object System.Collections.Generic.List[string]
  foreach ($value in ($Values | Where-Object { $null -ne $_ })) {
    $token = Normalize-Token ([string]$value)
    if ($token -and $seen.Add($token)) {
      $result.Add($token)
    }
  }
  return $result.ToArray()
}

function Parse-InlineList {
  param([string]$Value)
  $trimmed = $Value.Trim()
  if (-not ($trimmed.StartsWith('[') -and $trimmed.EndsWith(']'))) {
    return @(Normalize-Token $trimmed)
  }
  $inner = $trimmed.TrimStart('[').TrimEnd(']')
  if (-not $inner.Trim()) { return @() }
  return Normalize-List ($inner.Split(',') | ForEach-Object { $_.Trim() })
}

function Convert-Scalar {
  param([string]$Value)
  $trimmed = $Value.Trim()
  if (-not $trimmed) { return '' }
  $unquoted = $trimmed.Trim('"', "'")
  switch -Regex ($unquoted.ToLowerInvariant()) {
    '^true$' { return $true }
    '^false$' { return $false }
    '^-?\d+$' { return [int]$unquoted }
    default { return $unquoted }
  }
}

function Get-RelativePath {
  param([string]$BasePath,[string]$TargetPath)
  $baseResolved = (Resolve-Path $BasePath).Path.TrimEnd('\')
  $targetResolved = (Resolve-Path $TargetPath).Path
  if ($targetResolved.StartsWith($baseResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $targetResolved.Substring($baseResolved.Length).TrimStart('\').Replace('\','/')
  }
  return $targetResolved.Replace('\','/')
}

function Get-FrontMatterAndBody {
  param([string]$Path)
  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $matches = [regex]::Matches($content, '(?m)^---\s*$')
  if ($matches.Count -lt 2) {
    return [pscustomobject]@{ FrontMatter = ''; Body = $content }
  }
  $frontStart = $matches[0].Index + $matches[0].Length
  $frontLength = $matches[1].Index - $frontStart
  $bodyStart = $matches[1].Index + $matches[1].Length
  return [pscustomobject]@{
    FrontMatter = $content.Substring($frontStart, $frontLength).Trim("`r", "`n")
    Body = $content.Substring($bodyStart).TrimStart("`r", "`n")
  }
}

function Parse-CollectionRegistry {
  param([string]$Path)
  if (-not (Test-Path $Path -PathType Leaf)) { return @() }
  $lines = [System.IO.File]::ReadAllLines($Path, [System.Text.Encoding]::UTF8)
  $collections = New-Object System.Collections.Generic.List[object]
  $current = $null
  $mode = ''
  $activeFallbackKey = ''

  foreach ($line in $lines) {
    if ($line -match '^\s*-\s+slug:\s*(.+)$') {
      if ($current) { $collections.Add([pscustomobject]$current) }
      $current = [ordered]@{
        Slug = Normalize-Token $matches[1]
        Title = ''
        Featured = $false
        ExplicitOnly = $false
        StartHere = ''
        Fallback = [ordered]@{
          Series = @()
          Topics = @()
          Tags = @()
          Sections = @()
        }
      }
      $mode = ''
      $activeFallbackKey = ''
      continue
    }

    if (-not $current) { continue }

    if ($line -match '^\s{4}fallback:\s*$') {
      $mode = 'fallback'
      $activeFallbackKey = ''
      continue
    }

    if ($line -match '^\s{4}([a-z_]+):\s*(.*)$') {
      $mode = 'root'
      $activeFallbackKey = ''
      $key = $matches[1]
      $value = Convert-Scalar $matches[2]
      switch ($key) {
        'title' { $current.Title = [string]$value }
        'featured' { $current.Featured = [bool]$value }
        'explicit_only' { $current.ExplicitOnly = [bool]$value }
        'start_here' { $current.StartHere = Normalize-Token ([string]$value) }
      }
      continue
    }

    if ($mode -eq 'fallback' -and $line -match '^\s{6}([a-z_]+):\s*(.*)$') {
      $activeFallbackKey = $matches[1]
      $raw = $matches[2]
      $items = if ($raw.Trim()) { Parse-InlineList $raw } else { @() }
      switch ($activeFallbackKey) {
        'series' { $current.Fallback.Series = $items }
        'topics' { $current.Fallback.Topics = $items }
        'tags' { $current.Fallback.Tags = $items }
        'sections' { $current.Fallback.Sections = $items }
      }
      continue
    }

    if ($mode -eq 'fallback' -and $activeFallbackKey -and $line -match '^\s{8}-\s*(.+)$') {
      $item = Normalize-Token $matches[1]
      switch ($activeFallbackKey) {
        'series' { $current.Fallback.Series += $item }
        'topics' { $current.Fallback.Topics += $item }
        'tags' { $current.Fallback.Tags += $item }
        'sections' { $current.Fallback.Sections += $item }
      }
    }
  }

  if ($current) { $collections.Add([pscustomobject]$current) }
  return $collections.ToArray()
}

function Parse-PageFrontMatter {
  param([string]$Path,[string]$ContentRoot)
  $parts = Get-FrontMatterAndBody $Path
  $front = [ordered]@{
    Path = $Path
    RelativePath = Get-RelativePath $ContentRoot $Path
    Section = ''
    Title = ''
    Slug = ''
    Date = ''
    Featured = $false
    MediumSourceUrl = ''
    SourceUrl = ''
    Collections = @()
    Series = ''
    Topics = @()
    Tags = @()
    Subtitle = ''
    Body = $parts.Body
  }
  $front.Section = ($front.RelativePath -split '/')[0]
  $lines = $parts.FrontMatter -split "`r?`n"
  $activeList = ''

  foreach ($line in $lines) {
    if ($line -match '^([A-Za-z0-9_]+):\s*(.*)$') {
      $key = $matches[1]
      $raw = $matches[2]
      $activeList = ''
      switch ($key) {
        'title' { $front.Title = [string](Convert-Scalar $raw) }
        'slug' { $front.Slug = Normalize-Token ([string](Convert-Scalar $raw)) }
        'date' { $front.Date = [string](Convert-Scalar $raw) }
        'featured' { $front.Featured = [bool](Convert-Scalar $raw) }
        'medium_source_url' { $front.MediumSourceUrl = [string](Convert-Scalar $raw) }
        'source_url' { $front.SourceUrl = [string](Convert-Scalar $raw) }
        'subtitle' { $front.Subtitle = [string](Convert-Scalar $raw) }
        'series' { $front.Series = Normalize-Token ([string](Convert-Scalar $raw)) }
        'collections' {
          if ($raw.Trim()) { $front.Collections = Parse-InlineList $raw }
          else { $front.Collections = @(); $activeList = 'collections' }
        }
        'topics' {
          if ($raw.Trim()) { $front.Topics = Parse-InlineList $raw }
          else { $front.Topics = @(); $activeList = 'topics' }
        }
        'tags' {
          if ($raw.Trim()) { $front.Tags = Parse-InlineList $raw }
          else { $front.Tags = @(); $activeList = 'tags' }
        }
      }
      continue
    }

    if ($activeList -and $line -match '^\s*-\s*(.+)$') {
      $item = Normalize-Token $matches[1]
      switch ($activeList) {
        'collections' { $front.Collections += $item }
        'topics' { $front.Topics += $item }
        'tags' { $front.Tags += $item }
      }
    }
  }

  if (-not $front.Slug) {
    $front.Slug = Normalize-Token ([System.IO.Path]::GetFileNameWithoutExtension($Path))
  }
  $front.Collections = Normalize-List $front.Collections
  $front.Topics = Normalize-List $front.Topics
  $front.Tags = Normalize-List $front.Tags
  return [pscustomobject]$front
}

function Test-FallbackMatch {
  param($Page,$Collection)
  if ($Collection.ExplicitOnly) { return $false }
  if ($Page.Series -and ($Collection.Fallback.Series -contains $Page.Series)) { return $true }
  if (@($Page.Topics | Where-Object { $Collection.Fallback.Topics -contains $_ }).Count -gt 0) { return $true }
  if (@($Page.Tags | Where-Object { $Collection.Fallback.Tags -contains $_ }).Count -gt 0) { return $true }
  if ($Page.Section -and ($Collection.Fallback.Sections -contains $Page.Section.ToLowerInvariant())) { return $true }
  return $false
}

function Get-StartHereEssaySlugs {
  param([string]$Path)
  if (-not (Test-Path $Path -PathType Leaf)) { return @() }
  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $matches = [regex]::Matches($content, '../essays/([^/]+)/', 'IgnoreCase')
  $slugs = foreach ($match in $matches) { Normalize-Token $match.Groups[1].Value }
  return Normalize-List $slugs
}

function Count-Matches {
  param([string]$Text,[string[]]$Patterns)
  $count = 0
  foreach ($pattern in $Patterns) {
    $count += ([regex]::Matches($Text, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Multiline)).Count
  }
  return $count
}

function Get-PseudoHeadingCount {
  param([string]$Body)
  $count = 0
  $lines = $Body -split "`r?`n"
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i].Trim()
    if (-not $line) { continue }
    if ($line -match '^(#|>|-|\*|\d+\.|!\[|<|\[Embedded media)') { continue }
    if ($line -match 'https?://') { continue }
    if ($line.Length -lt 4 -or $line.Length -gt 90) { continue }
    if ($line -match '[\.!?]$') { continue }
    if ($line -match '^[A-Z0-9][A-Za-z0-9''":,()&/\-~ ]+$') {
      $prevBlank = ($i -eq 0) -or (-not $lines[$i - 1].Trim())
      $nextBlank = ($i -eq ($lines.Count - 1)) -or (-not $lines[$i + 1].Trim())
      if ($prevBlank -and $nextBlank) { $count++ }
    }
  }
  return $count
}

function Get-TopBodyWindow {
  param([string]$Body,[int]$LineCount = 60)
  return (($Body -split "`r?`n") | Select-Object -First $LineCount) -join "`n"
}

function Build-IssueSummary {
  param($Counts)
  $types = New-Object System.Collections.Generic.List[string]
  foreach ($prop in $Counts.PSObject.Properties) {
    if ([int]$prop.Value -gt 0) { $types.Add($prop.Name) }
  }
  return $types.ToArray()
}

$rootContent = Join-Path $Root 'content'
$collectionsPath = Join-Path $Root 'data\collections.yaml'
$startHerePath = Join-Path $Root 'content\start-here\index.md'
$collections = Parse-CollectionRegistry $collectionsPath
$startHereEssaySlugs = Get-StartHereEssaySlugs $startHerePath
$pages = New-Object System.Collections.Generic.List[object]

foreach ($section in $Sections) {
  $sectionRoot = Join-Path $rootContent $section
  if (-not (Test-Path $sectionRoot -PathType Container)) { continue }
  Get-ChildItem -Path $sectionRoot -File -Filter '*.md' -Recurse |
    Where-Object { $_.Name -ne '_index.md' } |
    ForEach-Object { $pages.Add((Parse-PageFrontMatter -Path $_.FullName -ContentRoot $rootContent)) }
}

$ctaPatterns = @(
  '\bclap this piece\b',
  '\bclap if\b',
  '\bgive (?:it|this) a (?:few )?clap',
  '\bfollow (?:me|us|the balance sheet)\b',
  '\bfollow .* on medium\b',
  '\bsubscribe to\b',
  '\bsubscribe for more\b',
  '\bsubscribe now\b',
  '\bcomment your thoughts\b',
  '\bcomments below\b',
  '\boriginally appeared on\b',
  '\boriginally published in\b',
  '\bpublished in\b(?=[^\r\n]{0,80}\bon medium\b)',
  '\bmember-only\b',
  '\bi read every comment\b',
  '\bshare this (?:story|piece)\b'
)

$mojibakePatterns = @(
  '\u00E2\u20AC[\u2122\u0153\u009D]',
  '\u00E2\u20AC(?:\u201D|\u201C|\u2019|\u2014|\u2013)',
  '\u00E2\u20A6',
  '\u00E2\u20A0',
  '\u00E2\u20B0',
  '\u00E2\u2020\u2019',
  '\u00E2\u2030\u02C6',
  '\u00E2\u02C6\u2019',
  '\u00C2[\u00A0-\u00FF]',
  '\u00C3[\u0080-\u00BF]',
  '\u00F0[\u009F-\u00BF]'
)

$rows = New-Object System.Collections.Generic.List[object]
foreach ($page in $pages) {
  $body = $page.Body
  $topWindow = Get-TopBodyWindow $body
  $matchedCollections = New-Object System.Collections.Generic.List[object]
  foreach ($collection in $collections) {
    $matchesExplicit = $page.Collections -contains $collection.Slug
    if ($matchesExplicit -or (Test-FallbackMatch -Page $page -Collection $collection)) {
      $matchedCollections.Add($collection)
    }
  }

  $issueCounts = [ordered]@{
    medium_cta = Count-Matches -Text $body -Patterns $ctaPatterns
    author_note = Count-Matches -Text $body -Patterns @('(?im)^\s{0,3}(?:#+\s*)?(?:author''?s note|note from the author)\b')
    embed_remnants = Count-Matches -Text $body -Patterns @('mixtapeEmbed','js-mixtapeImage','markup--anchor','class="section section','class="section-divider"','class="section-inner"','<iframe\b','raw HTML omitted')
    mojibake = Count-Matches -Text $body -Patterns $mojibakePatterns
    manual_bullets = Count-Matches -Text $body -Patterns @('(?m)^\s*(?:\u2022|\u00E2\u20AC\u00A2)\s+')
    fake_lists = Count-Matches -Text $body -Patterns @('(?m)^\s*-\s+[A-Z][^\n]{0,90}$','(?m)^\s*\d+\)\s+')
    pseudo_headings = Get-PseudoHeadingCount -Body $body
    source_dumps = Count-Matches -Text $body -Patterns @('(?im)^\s*(?:>\s*)?Source:\s*','(?im)^\s*(?:>\s*)?https?://\S+\s*$')
    duplicated_title = 0
    ornamental_breaks = Count-Matches -Text $body -Patterns @('(?m)^-{20,}\s*$','(?m)^\*\s*\*\s*\*\s*$','(?m)^\\\s*$')
    escaped_linebreaks = Count-Matches -Text $body -Patterns @('(?m)[^\\]\\$')
  }

  if ($page.MediumSourceUrl) {
    if ($topWindow -match [regex]::Escape($page.Title)) { $issueCounts.duplicated_title++ }
    if ($page.Subtitle -and $topWindow -match [regex]::Escape($page.Subtitle)) { $issueCounts.duplicated_title++ }
  }

  $issueTypes = Build-IssueSummary ([pscustomobject]$issueCounts)
  $hasIssues = $issueTypes.Count -gt 0

  $priorityReasons = New-Object System.Collections.Generic.List[string]
  $priorityScore = 0
  if ($page.Featured) {
    $priorityScore += 40
    $priorityReasons.Add('homepage_selected')
  }
  if ($startHereEssaySlugs -contains $page.Slug) {
    $priorityScore += 45
    $priorityReasons.Add('start_here_direct')
  }

  $collectionStartHere = @($matchedCollections | Where-Object { $_.StartHere -eq $page.Slug })
  $featuredCollectionMatches = @($matchedCollections | Where-Object { $_.Featured })
  $featuredCollectionStartHere = @($collectionStartHere | Where-Object { $_.Featured })

  if ($featuredCollectionStartHere.Count -gt 0) {
    $priorityScore += 35
    $priorityReasons.Add('featured_collection_start_here')
  } elseif ($collectionStartHere.Count -gt 0) {
    $priorityScore += 25
    $priorityReasons.Add('collection_start_here')
  }

  if ($featuredCollectionMatches.Count -gt 0) {
    $priorityScore += 18
    $priorityReasons.Add('featured_collection_member')
  } elseif ($matchedCollections.Count -gt 0) {
    $priorityScore += 8
    $priorityReasons.Add('collection_member')
  }

  if ($page.MediumSourceUrl -and $page.Date -match '^(2025|2026)') {
    $priorityScore += 5
    $priorityReasons.Add('newer_imported_piece')
  }

  $severityScore =
    (4 * [Math]::Min(1, $issueCounts.medium_cta)) +
    (3 * [Math]::Min(1, $issueCounts.author_note)) +
    (4 * [Math]::Min(1, $issueCounts.embed_remnants)) +
    (5 * [Math]::Min(1, $issueCounts.mojibake)) +
    (3 * [Math]::Min(1, ($issueCounts.manual_bullets + $issueCounts.fake_lists))) +
    (3 * [Math]::Min(1, $issueCounts.pseudo_headings)) +
    (2 * [Math]::Min(1, $issueCounts.source_dumps)) +
    (3 * [Math]::Min(1, $issueCounts.duplicated_title)) +
    (2 * [Math]::Min(1, ($issueCounts.ornamental_breaks + $issueCounts.escaped_linebreaks)))

  $cleanupScore = $priorityScore + $severityScore
  $batch = if (-not $hasIssues) {
    'clean'
  } elseif ($priorityScore -ge 70 -or ($priorityScore -ge 55 -and $severityScore -ge 12)) {
    'batch_1'
  } elseif ($priorityScore -ge 35 -or $severityScore -ge 12) {
    'batch_2'
  } else {
    'batch_3'
  }

  $safeAutoIssues = @('duplicated_title','embed_remnants','mojibake','ornamental_breaks')
  $assistedReviewIssues = @('medium_cta','escaped_linebreaks') + $safeAutoIssues
  $manualLightIssues = @('author_note','manual_bullets','fake_lists','pseudo_headings','source_dumps') + $assistedReviewIssues
  $highSensitivity = $page.Featured -or
    ($startHereEssaySlugs -contains $page.Slug) -or
    ($featuredCollectionStartHere.Count -gt 0) -or
    ($collectionStartHere.Count -gt 0)
  $highStructuralAmbiguity =
    ($severityScore -ge 12) -or
    (
      @($issueTypes | Where-Object { $_ -in @('pseudo_headings','fake_lists','source_dumps') }).Count -ge 2 -and
      $issueTypes.Count -ge 3
    )
  $riskTier = $null
  if ($hasIssues) {
    if (@($issueTypes | Where-Object { $_ -notin $safeAutoIssues }).Count -eq 0) {
      $riskTier = 'SAFE_AUTO'
    } elseif (@($issueTypes | Where-Object { $_ -notin $assistedReviewIssues }).Count -eq 0) {
      $riskTier = 'ASSISTED_REVIEW'
    } elseif (
      @($issueTypes | Where-Object { $_ -notin $manualLightIssues }).Count -eq 0 -and
      -not $highSensitivity -and
      -not $highStructuralAmbiguity
    ) {
      $riskTier = 'MANUAL_LIGHT'
    } else {
      $riskTier = 'MANUAL_FIRST'
    }
  }

  $status = switch ($riskTier) {
    'SAFE_AUTO' { 'READY_SAFE_AUTO' }
    'ASSISTED_REVIEW' { 'READY_ASSISTED_REVIEW' }
    'MANUAL_LIGHT' { 'READY_MANUAL_LIGHT' }
    'MANUAL_FIRST' { 'READY_MANUAL_FIRST' }
    default { 'CLEAN' }
  }
  $manualReview = $hasIssues -and ($riskTier -ne 'SAFE_AUTO')

  $rows.Add([pscustomobject]@{
    path = $page.RelativePath
    title = $page.Title
    slug = $page.Slug
    section = $page.Section
    date = $page.Date
    imported = [bool]($page.MediumSourceUrl -or $page.SourceUrl)
    featured = [bool]$page.Featured
    start_here_direct = [bool]($startHereEssaySlugs -contains $page.Slug)
    collection_start_here = [bool]($collectionStartHere.Count -gt 0)
    featured_collection_member = [bool]($featuredCollectionMatches.Count -gt 0)
    collections = @($matchedCollections | ForEach-Object { $_.Slug })
    has_medium_cta = [bool]($issueCounts.medium_cta -gt 0)
    has_author_note = [bool]($issueCounts.author_note -gt 0)
    has_embed_remnants = [bool]($issueCounts.embed_remnants -gt 0)
    has_encoding_damage = [bool]($issueCounts.mojibake -gt 0)
    has_manual_bullets = [bool](($issueCounts.manual_bullets + $issueCounts.fake_lists) -gt 0)
    has_pseudo_headings = [bool]($issueCounts.pseudo_headings -gt 0)
    has_source_dump = [bool]($issueCounts.source_dumps -gt 0)
    has_duplicated_title = [bool]($issueCounts.duplicated_title -gt 0)
    has_separator_residue = [bool](($issueCounts.ornamental_breaks + $issueCounts.escaped_linebreaks) -gt 0)
    medium_cta_count = $issueCounts.medium_cta
    author_note_count = $issueCounts.author_note
    embed_remnant_count = $issueCounts.embed_remnants
    encoding_damage_count = $issueCounts.mojibake
    manual_bullet_count = ($issueCounts.manual_bullets + $issueCounts.fake_lists)
    pseudo_heading_count = $issueCounts.pseudo_headings
    source_dump_count = $issueCounts.source_dumps
    duplicated_title_count = $issueCounts.duplicated_title
    separator_residue_count = ($issueCounts.ornamental_breaks + $issueCounts.escaped_linebreaks)
    issue_types = $issueTypes
    issue_type_count = $issueTypes.Count
    severity_score = $severityScore
    priority_score = $priorityScore
    cleanup_score = $cleanupScore
    batch = $batch
    risk_tier = $riskTier
    status = $status
    priority_reasons = $priorityReasons.ToArray()
    manual_review = [bool]$manualReview
  })
}

$rowsArray = $rows.ToArray()
$affected = @($rowsArray | Where-Object { $_.issue_type_count -gt 0 })
$issueSummary = @{}
foreach ($row in $affected) {
  foreach ($type in $row.issue_types) {
    if (-not $issueSummary.ContainsKey($type)) { $issueSummary[$type] = 0 }
    $issueSummary[$type]++
  }
}
$issueSummaryRows = foreach ($key in ($issueSummary.Keys | Sort-Object)) {
  [pscustomobject]@{ issue_type = $key; affected_files = $issueSummary[$key] }
}
$riskTierSummaryRows = foreach ($tier in @('SAFE_AUTO','ASSISTED_REVIEW','MANUAL_LIGHT','MANUAL_FIRST')) {
  [pscustomobject]@{
    risk_tier = $tier
    file_count = @($affected | Where-Object { $_.risk_tier -eq $tier }).Count
  }
}
$statusSummaryRows = foreach ($statusName in @('CLEAN','READY_SAFE_AUTO','READY_ASSISTED_REVIEW','READY_MANUAL_LIGHT','READY_MANUAL_FIRST')) {
  [pscustomobject]@{
    status = $statusName
    file_count = @($rowsArray | Where-Object { $_.status -eq $statusName }).Count
  }
}

$report = [pscustomobject]@{
  generated_at = (Get-Date).ToString('o')
  scanned_sections = $Sections
  totals = [pscustomobject]@{
    scanned_files = $rowsArray.Count
    affected_files = $affected.Count
    imported_files = @($rowsArray | Where-Object { $_.imported }).Count
    batch_1 = @($affected | Where-Object { $_.batch -eq 'batch_1' }).Count
    batch_2 = @($affected | Where-Object { $_.batch -eq 'batch_2' }).Count
    batch_3 = @($affected | Where-Object { $_.batch -eq 'batch_3' }).Count
  }
  issue_categories = $issueSummaryRows
  risk_tiers = $riskTierSummaryRows
  status_counts = $statusSummaryRows
  priority_logic = @(
    'homepage_selected = featured: true',
    'start_here_direct = linked from content/start-here/index.md',
    'featured_collection_start_here = start_here slug of a featured collection',
    'collection_start_here = start_here slug of any collection',
    'featured_collection_member = member of a featured collection',
    'collection_member = explicit or fallback collection match',
    'newer_imported_piece = imported essay dated 2025 or 2026'
  )
  files = $rowsArray
}

$jsonPath = "$ReportBasePath.json"
$csvPath = "$ReportBasePath.csv"
$mdPath = "$ReportBasePath.md"
Write-TextNoBom $jsonPath ($report | ConvertTo-Json -Depth 8)
$rowsArray |
  Select-Object path,title,section,date,imported,featured,start_here_direct,collection_start_here,featured_collection_member,priority_score,severity_score,cleanup_score,batch,risk_tier,status,manual_review,has_medium_cta,has_author_note,has_embed_remnants,has_encoding_damage,has_manual_bullets,has_pseudo_headings,has_source_dump,has_duplicated_title,has_separator_residue |
  Export-Csv -Path $csvPath -NoTypeInformation -Encoding utf8

$issueSort = @(
  @{ Expression = 'affected_files'; Descending = $true },
  @{ Expression = 'issue_type'; Descending = $false }
)
$fileSort = @(
  @{ Expression = 'cleanup_score'; Descending = $true },
  @{ Expression = 'priority_score'; Descending = $true },
  @{ Expression = 'title'; Descending = $false }
)
$manualSort = @(
  @{ Expression = 'cleanup_score'; Descending = $true },
  @{ Expression = 'title'; Descending = $false }
)

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# Legacy Essay Audit')
$lines.Add('')
$lines.Add("- Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))")
$lines.Add("- Scanned files: $($report.totals.scanned_files)")
$lines.Add("- Affected files: $($report.totals.affected_files)")
$lines.Add('')
$lines.Add('## Issue Categories')
$lines.Add('')
foreach ($item in ($issueSummaryRows | Sort-Object -Property $issueSort)) {
  $lines.Add("- $($item.issue_type): $($item.affected_files)")
}
$lines.Add('')
$lines.Add('## Risk Tiers')
$lines.Add('')
foreach ($item in $riskTierSummaryRows) {
  $lines.Add("- $($item.risk_tier): $($item.file_count)")
}
$lines.Add('')
$lines.Add('## Status Counts')
$lines.Add('')
foreach ($item in $statusSummaryRows) {
  $lines.Add("- $($item.status): $($item.file_count)")
}
foreach ($batchName in @('batch_1','batch_2','batch_3')) {
  $pretty = $batchName.Replace('_',' ').ToUpperInvariant()
  $batchRows = @($affected | Where-Object { $_.batch -eq $batchName } | Sort-Object -Property $fileSort)
  $lines.Add('')
  $lines.Add("## $pretty")
  $lines.Add('')
  if ($batchRows.Count -eq 0) {
    $lines.Add('- No files in this batch.')
    continue
  }
  foreach ($row in $batchRows) {
    $reasons = if ($row.priority_reasons.Count -gt 0) { ($row.priority_reasons -join ', ') } else { 'issue-driven' }
    $issues = $row.issue_types -join ', '
    $lines.Add("- ``$($row.path)`` :: priority $($row.priority_score), severity $($row.severity_score) :: $reasons :: $issues")
  }
}
$lines.Add('')
$lines.Add('## Manual Review Candidates')
$lines.Add('')
$manualRows = @($affected | Where-Object { $_.manual_review } | Sort-Object -Property $manualSort)
if ($manualRows.Count -eq 0) {
  $lines.Add('- None flagged.')
} else {
  foreach ($row in $manualRows) {
    $lines.Add("- ``$($row.path)`` :: $($row.risk_tier) :: $($row.issue_types -join ', ')")
  }
}
Write-TextNoBom $mdPath (($lines -join "`r`n") + "`r`n")

Write-Host 'Legacy essay audit complete' -ForegroundColor Cyan
Write-Host "JSON report: $jsonPath"
Write-Host "CSV report: $csvPath"
Write-Host "Markdown report: $mdPath"
