param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ReportPath
)

$ErrorActionPreference = 'Stop'

if (-not $ReportPath) {
  $ReportPath = Join-Path $Root 'reports\collections-audit.md'
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

function Parse-CollectionRegistry {
  param([string]$Path)
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
        Kind = 'topic'
        Public = $false
        ForcePublic = $false
        MinItems = 0
        ExplicitOnly = $false
        Featured = $false
        Weight = 0
        StartHere = ''
        Description = ''
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

    if ($line -match '^\s{4}metadata:\s*$') {
      $mode = 'metadata'
      $activeFallbackKey = ''
      continue
    }

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
        'kind' { $current.Kind = Normalize-Token ([string]$value) }
        'public' { $current.Public = [bool]$value }
        'force_public' { $current.ForcePublic = [bool]$value }
        'min_items' { $current.MinItems = [int]$value }
        'explicit_only' { $current.ExplicitOnly = [bool]$value }
        'featured' { $current.Featured = [bool]$value }
        'weight' { $current.Weight = [int]$value }
        'start_here' { $current.StartHere = Normalize-Token ([string]$value) }
        'description' { $current.Description = [string]$value }
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
      continue
    }
  }

  if ($current) { $collections.Add([pscustomobject]$current) }
  return $collections.ToArray()
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
function Get-FrontMatter {
  param([string]$Path)
  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $matches = [regex]::Matches($content, '(?m)^---\s*$')
  if ($matches.Count -lt 2) { return $null }
  $start = $matches[0].Index + $matches[0].Length
  $length = $matches[1].Index - $start
  return $content.Substring($start, $length).Trim("`r", "`n")
}

function Parse-Page {
  param([string]$Path,[string]$ContentRoot)
  $frontMatter = Get-FrontMatter $Path
  if (-not $frontMatter) { return $null }

  $front = [ordered]@{
    Title = ''
    Slug = ''
    Date = ''
    Section = ''
    RelativePath = Get-RelativePath $ContentRoot $Path
    Path = $Path
    Collections = @()
    Series = ''
    Topics = @()
    Tags = @()
    CollectionWeight = $null
  }

  $front.Section = ($front.RelativePath -split '/')[0]
  $lines = $frontMatter -split "`r?`n"
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
        'series' { $front.Series = Normalize-Token ([string](Convert-Scalar $raw)) }
        'collection_weight' { $front.CollectionWeight = [int](Convert-Scalar $raw) }
        'collections' {
          if ($raw.Trim()) {
            $front.Collections = Parse-InlineList $raw
          } else {
            $front.Collections = @()
            $activeList = 'collections'
          }
        }
        'topics' {
          if ($raw.Trim()) {
            $front.Topics = Parse-InlineList $raw
          } else {
            $front.Topics = @()
            $activeList = 'topics'
          }
        }
        'tags' {
          if ($raw.Trim()) {
            $front.Tags = Parse-InlineList $raw
          } else {
            $front.Tags = @()
            $activeList = 'tags'
          }
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
  if ($Collection.Slug -eq 'syd-and-oliver-dialogues') { return $Page.Section -eq 'syd-and-oliver' }
  if ($Collection.ExplicitOnly) { return $false }
  if ($Page.Series -and ($Collection.Fallback.Series -contains $Page.Series)) { return $true }
  if (@($Page.Topics | Where-Object { $Collection.Fallback.Topics -contains $_ }).Count -gt 0) { return $true }
  if (@($Page.Tags | Where-Object { $Collection.Fallback.Tags -contains $_ }).Count -gt 0) { return $true }
  if ($Page.Section -and ($Collection.Fallback.Sections -contains $Page.Section.ToLowerInvariant())) { return $true }
  return $false
}

function Get-ExplicitCollections {
  param($Page)
  if ($Page.Collections.Count -le 2) { return $Page.Collections }
  return ($Page.Collections | Select-Object -First 2)
}

function Resolve-CollectionItems {
  param($Collection,$Pages)
  $items = New-Object System.Collections.Generic.List[object]
  foreach ($page in $Pages) {
    $explicit = Get-ExplicitCollections $page
    $include = $false
    if ($explicit.Count -gt 0) {
      $include = $explicit -contains $Collection.Slug
    } elseif (Test-FallbackMatch $page $Collection) {
      $include = $true
    }
    if ($include) { $items.Add($page) }
  }

  $weighted = @($items | Where-Object { $null -ne $_.CollectionWeight } | Sort-Object CollectionWeight, @{Expression='Date';Descending=$true})
  $dated = @($items | Where-Object { $null -eq $_.CollectionWeight } | Sort-Object @{Expression='Date';Descending=$true})
  return ($weighted + $dated)
}

function Get-CollectionState {
  param($Collection,$Items)
  $minItems = if ($Collection.MinItems -gt 0) { $Collection.MinItems } elseif ($Collection.Kind -eq 'series') { 2 } else { 3 }
  $count = @($Items).Count
  $visible = $Collection.Public -and (($count -ge $minItems) -or $Collection.ForcePublic)
  return [pscustomobject]@{
    Count = $count
    MinItems = $minItems
    Visible = $visible
  }
}

function Get-HeuristicSuggestions {
  param($Page,$Collections)
  $search = ('{0} {1} {2}' -f $Page.Title, $Page.Slug, $Page.Section).ToLowerInvariant()
  $suggestions = New-Object System.Collections.Generic.List[object]
  foreach ($collection in $Collections) {
    $keywords = Normalize-List ($collection.Fallback.Series + $collection.Fallback.Topics + $collection.Fallback.Tags + $collection.Fallback.Sections)
    $hits = @($keywords | Where-Object { $_ -and $search.Contains($_) })
    if ($hits.Count -gt 0) {
      $suggestions.Add([pscustomobject]@{
        Collection = $collection
        Hits = $hits
      })
    }
  }
  return $suggestions.ToArray()
}

$contentRoot = Join-Path $Root 'content'
$registryPath = Join-Path $Root 'data\collections.yaml'
$collections = Parse-CollectionRegistry $registryPath
$pages = Get-ChildItem $contentRoot -Recurse -File -Filter '*.md' |
  Where-Object { $_.Name -ne '_index.md' -and $_.DirectoryName -notlike '*\content\collections*' } |
  ForEach-Object { Parse-Page $_.FullName $contentRoot } |
  Where-Object { $null -ne $_ }

$collectionSummaries = foreach ($collection in ($collections | Sort-Object Weight, Title)) {
  $items = Resolve-CollectionItems $collection $pages
  $state = Get-CollectionState $collection $items
  $legacyFallbackItems = @($items | Where-Object { (Get-ExplicitCollections $_).Count -eq 0 })
  [pscustomobject]@{
    Collection = $collection
    Items = $items
    State = $state
    LegacyFallbackCount = $legacyFallbackItems.Count
  }
}

$explicitOverLimit = @($pages | Where-Object { $_.Collections.Count -gt 2 })
$unknownExplicit = foreach ($page in $pages) {
  $missing = @((Get-ExplicitCollections $page) | Where-Object { $_ -and -not ($collections.Slug -contains $_) })
  if ($missing.Count -gt 0) {
    [pscustomobject]@{ Page = $page; Missing = $missing }
  }
}

$legacyCandidates = foreach ($page in $pages) {
  if ((Get-ExplicitCollections $page).Count -gt 0) { continue }
  $matches = @($collections | Where-Object { Test-FallbackMatch $page $_ })
  if ($matches.Count -gt 0) {
    [pscustomobject]@{ Page = $page; Matches = $matches }
  }
}

$heuristicCandidates = foreach ($page in $pages) {
  if ((Get-ExplicitCollections $page).Count -gt 0) { continue }
  $matches = Get-HeuristicSuggestions $page $collections
  if ($matches.Count -gt 0) {
    [pscustomobject]@{ Page = $page; Matches = $matches }
  }
}

$reportLines = New-Object System.Collections.Generic.List[string]
$reportLines.Add('# Collections Audit')
$reportLines.Add('')
$reportLines.Add('This report is read-only. It suggests candidate memberships but does not write front matter changes.')
$reportLines.Add('')
$reportLines.Add(('Generated: {0}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')))
$reportLines.Add('')
$reportLines.Add('## Public Collection Status')
$reportLines.Add('')
$reportLines.Add('| Collection | Kind | Pieces | Min | Public | Listed | Featured | Legacy fallback |')
$reportLines.Add('| --- | --- | ---: | ---: | --- | --- | --- | ---: |')
foreach ($summary in $collectionSummaries) {
  $row = '| {0} | {1} | {2} | {3} | {4} | {5} | {6} | {7} |' -f 
    $summary.Collection.Title,
    $summary.Collection.Kind,
    $summary.State.Count,
    $summary.State.MinItems,
    $summary.Collection.Public,
    $summary.State.Visible,
    $summary.Collection.Featured,
    $summary.LegacyFallbackCount
  $reportLines.Add($row)
}

$reportLines.Add('')
$reportLines.Add('## Explicit Membership Issues')
$reportLines.Add('')
if ($explicitOverLimit.Count -eq 0 -and @($unknownExplicit).Count -eq 0) {
  $reportLines.Add('- No explicit membership violations found.')
} else {
  foreach ($page in $explicitOverLimit) {
    $reportLines.Add(('- `{0}` declares more than 2 collections: {1}' -f $page.RelativePath, ($page.Collections -join ', ')))
  }
  foreach ($entry in $unknownExplicit) {
    $reportLines.Add(('- `{0}` references unknown collection slugs: {1}' -f $entry.Page.RelativePath, ($entry.Missing -join ', ')))
  }
}

$reportLines.Add('')
$reportLines.Add('## Legacy Fallback Matches')
$reportLines.Add('')
if (@($legacyCandidates).Count -eq 0) {
  $reportLines.Add('- No fallback-driven pages found.')
} else {
  foreach ($entry in $legacyCandidates) {
    $reportLines.Add(('- `{0}` -> {1}' -f $entry.Page.RelativePath, (($entry.Matches | ForEach-Object { $_.Title }) -join ', ')))
  }
}

$reportLines.Add('')
$reportLines.Add('## Heuristic Suggestions')
$reportLines.Add('')
if (@($heuristicCandidates).Count -eq 0) {
  $reportLines.Add('- No heuristic candidates found.')
} else {
  foreach ($entry in $heuristicCandidates) {
    $parts = foreach ($match in $entry.Matches) {
      '{0} ({1})' -f $match.Collection.Title, ($match.Hits -join ', ')
    }
    $reportLines.Add(('- `{0}` -> {1}' -f $entry.Page.RelativePath, ($parts -join '; ')))
  }
}

$reportDir = Split-Path -Parent $ReportPath
if (-not (Test-Path $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir | Out-Null
}
[System.IO.File]::WriteAllLines($ReportPath, $reportLines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Collections audit written to $ReportPath"