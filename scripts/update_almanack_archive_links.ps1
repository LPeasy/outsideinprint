param(
  [datetime]$IssueDate = (Get-Date).Date,
  [int]$MaxCandidatesPerGroup = 5,
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$OutputPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$generatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture)
$essaysDir = Join-Path $Root 'content\essays'
$archiveLinksPath = Join-Path $Root 'data\almanack\archive_links.yaml'
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $Root 'data\almanack\archive_link_candidates.yaml'
}

function ConvertTo-YamlScalar {
  param([object]$Value)
  if ($null -eq $Value) { return "''" }
  if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal] -or $Value -is [bool]) {
    return ([string]$Value).ToLowerInvariant()
  }
  $text = ([string]$Value).Trim() -replace '\s+', ' '
  return "'" + ($text -replace "'", "''") + "'"
}

function Write-Utf8NoBomLines {
  param(
    [string]$Path,
    [string[]]$Lines
  )
  $parent = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent | Out-Null
  }
  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllLines($Path, $Lines, $encoding)
}

function ConvertTo-Key {
  param([string]$Value)
  $key = $Value.ToLowerInvariant() -replace '[^a-z0-9]+', '-'
  return $key.Trim('-')
}

function Get-FrontMatterScalar {
  param(
    [string]$FrontMatter,
    [string]$Key
  )
  $match = [regex]::Match($FrontMatter, '(?m)^' + [regex]::Escape($Key) + ':\s*(.*?)\s*$')
  if (-not $match.Success) { return '' }
  $value = $match.Groups[1].Value.Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    return $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Get-FrontMatterArray {
  param(
    [string]$FrontMatter,
    [string]$Key
  )
  $values = New-Object System.Collections.Generic.List[string]
  $inline = [regex]::Match($FrontMatter, '(?m)^' + [regex]::Escape($Key) + ':\s*\[(.*?)\]\s*$')
  if ($inline.Success) {
    foreach ($part in ($inline.Groups[1].Value -split ',')) {
      $value = $part.Trim().Trim('"', "'")
      if ($value) { $values.Add($value) }
    }
    return $values.ToArray()
  }

  $block = [regex]::Match($FrontMatter, '(?m)^' + [regex]::Escape($Key) + ':\s*\r?\n(?<items>(?:[ \t]+-[ \t]*.*(?:\r?\n|$))+)' )
  if ($block.Success) {
    foreach ($line in ($block.Groups['items'].Value -split "\r?\n")) {
      $item = ([regex]::Match($line, '^[ \t]+-[ \t]*(.*?)[ \t]*$')).Groups[1].Value.Trim().Trim('"', "'")
      if ($item) { $values.Add($item) }
    }
  }
  return $values.ToArray()
}

function Convert-MarkdownToSearchText {
  param([string]$Markdown)
  $text = $Markdown -replace '(?s)```.*?```', ' '
  $text = $text -replace '\[([^\]]+)\]\([^)]+\)', '$1'
  $text = $text -replace '<[^>]+>', ' '
  $text = $text -replace '[#>*_`~\[\]()]', ' '
  return (($text -replace '\s+', ' ').Trim())
}

function Get-ArchiveSeedGroups {
  $groups = New-Object System.Collections.Generic.List[object]
  if (Test-Path -LiteralPath $archiveLinksPath -PathType Leaf) {
    $current = $null
    foreach ($line in Get-Content -LiteralPath $archiveLinksPath) {
      if ($line -match '^\s*-\s+key:\s*(.+?)\s*$') {
        if ($null -ne $current) { $groups.Add([pscustomobject]$current) }
        $current = [ordered]@{
          Key = $Matches[1].Trim().Trim('"', "'")
          Label = ''
          Phrase = ''
          ExistingPaths = New-Object System.Collections.Generic.List[string]
        }
        continue
      }
      if ($null -eq $current) { continue }
      if ($line -match '^\s+label:\s*(.+?)\s*$') {
        $current.Label = $Matches[1].Trim().Trim('"', "'")
      } elseif ($line -match '^\s+phrase:\s*(.+?)\s*$') {
        $current.Phrase = $Matches[1].Trim().Trim('"', "'")
      } elseif ($line -match '^\s+-\s+path:\s*(.+?)\s*$') {
        $current.ExistingPaths.Add($Matches[1].Trim().Trim('"', "'"))
      }
    }
    if ($null -ne $current) { $groups.Add([pscustomobject]$current) }
  }

  if ($groups.Count -gt 0) { return $groups.ToArray() }

  return @(
    [pscustomobject]@{ Key = 'public-costs'; Label = 'Public Costs'; Phrase = 'hidden public costs'; ExistingPaths = @() },
    [pscustomobject]@{ Key = 'risk-evidence'; Label = 'Risk and Evidence'; Phrase = 'risk, evidence, and uncertainty'; ExistingPaths = @() },
    [pscustomobject]@{ Key = 'public-power'; Label = 'Public Power'; Phrase = 'law, agencies, and voting power'; ExistingPaths = @() },
    [pscustomobject]@{ Key = 'counting-consequences'; Label = 'Counting Consequences'; Phrase = 'decision costs and consequences'; ExistingPaths = @() }
  )
}

function Get-TermsForGroup {
  param($Group)
  $defaultTerms = @{
    'public-costs' = @('public cost', 'infrastructure', 'flood', 'water', 'sewer', 'pipe', 'taxpayer', 'budget')
    'risk-evidence' = @('risk', 'uncertainty', 'evidence', 'model', 'forecast', 'hazard', 'probability')
    'public-power' = @('agency', 'court', 'law', 'statute', 'federal', 'state', 'power', 'rights', 'district')
    'counting-consequences' = @('consequence', 'outcome', 'decision', 'tradeoff', 'risk management', 'measure', 'count')
  }

  $terms = New-Object System.Collections.Generic.List[string]
  foreach ($source in @($Group.Label, $Group.Phrase)) {
    foreach ($word in (($source.ToLowerInvariant() -replace '[^a-z0-9 ]+', ' ') -split '\s+')) {
      if ($word.Length -ge 4) { $terms.Add($word) }
    }
    if ($source -and $source.Trim().Length -ge 4) { $terms.Add($source.ToLowerInvariant()) }
  }
  if ($defaultTerms.ContainsKey($Group.Key)) {
    foreach ($term in $defaultTerms[$Group.Key]) { $terms.Add($term) }
  }

  return @($terms | Where-Object { $_ } | Sort-Object -Unique)
}

function Get-EssayRecords {
  if (-not (Test-Path -LiteralPath $essaysDir -PathType Container)) {
    throw "Essay source directory is unavailable: $essaysDir"
  }

  $records = New-Object System.Collections.Generic.List[object]
  foreach ($file in Get-ChildItem -LiteralPath $essaysDir -Filter '*.md' -Recurse) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $frontMatterMatch = [regex]::Match($content, '(?s)^---\r?\n(.*?)\r?\n---')
    if (-not $frontMatterMatch.Success) { continue }

    $frontMatter = $frontMatterMatch.Groups[1].Value
    $draft = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'draft'
    if ($draft -match '^(?i:true)$') { continue }

    $relative = $file.FullName.Substring($essaysDir.Length + 1).Replace('\', '/')
    $relativeNoExt = $relative -replace '\.md$', ''
    $slug = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'slug'
    $path = if ($slug) { "/essays/$slug/" } else { "/essays/$relativeNoExt/" }
    $body = $content.Substring($frontMatterMatch.Length)
    $title = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'title'
    $description = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'description'
    $date = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'date'
    if ($date.Length -gt 10) { $date = $date.Substring(0, 10) }

    $records.Add([pscustomobject]@{
      Path = $path
      Url = "https://outsideinprint.org$path"
      Title = $title
      Date = $date
      Description = $description
      Tags = @(Get-FrontMatterArray -FrontMatter $frontMatter -Key 'tags')
      Collections = @(Get-FrontMatterArray -FrontMatter $frontMatter -Key 'collections')
      SearchText = (Convert-MarkdownToSearchText -Markdown (@($title, $description, $frontMatter, $body) -join ' '))
    })
  }

  if ($records.Count -eq 0) {
    throw "No published essay records were available under $essaysDir."
  }
  return $records.ToArray()
}

function Measure-CandidateScore {
  param(
    $Essay,
    [string[]]$Terms
  )
  $score = 0
  $matched = New-Object System.Collections.Generic.List[string]
  $titleText = ([string]$Essay.Title).ToLowerInvariant()
  $descriptionText = ([string]$Essay.Description).ToLowerInvariant()
  $metadataText = (@($Essay.Tags) + @($Essay.Collections) -join ' ').ToLowerInvariant()
  $searchText = ([string]$Essay.SearchText).ToLowerInvariant()

  foreach ($term in $Terms) {
    $needle = $term.ToLowerInvariant()
    $termScore = 0
    if ($titleText.Contains($needle)) { $termScore += 8 }
    if ($descriptionText.Contains($needle)) { $termScore += 5 }
    if ($metadataText.Contains($needle)) { $termScore += 6 }
    if ($searchText.Contains($needle)) { $termScore += 1 }
    if ($termScore -gt 0) {
      $score += $termScore
      $matched.Add($term)
    }
  }

  return [pscustomobject]@{
    Score = $score
    MatchedTerms = @($matched | Sort-Object -Unique)
  }
}

function Add-YamlArray {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    [string]$Indent,
    [string]$Name,
    [object[]]$Values
  )
  $Lines.Add("${Indent}${Name}:")
  if (-not $Values -or $Values.Count -eq 0) {
    $Lines[$Lines.Count - 1] = "${Indent}${Name}: []"
    return
  }
  foreach ($value in $Values) {
    $Lines.Add("$Indent  - $(ConvertTo-YamlScalar $value)")
  }
}

$groups = Get-ArchiveSeedGroups
$essays = Get-EssayRecords
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("generated_at: $(ConvertTo-YamlScalar $generatedAt)")
$lines.Add("issue_date: $(ConvertTo-YamlScalar ($IssueDate.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)))")
$lines.Add("source:")
$lines.Add("  name: 'Outside In Print Hugo essays'")
$lines.Add("  path: 'content/essays'")
$lines.Add("candidate_note: 'Generated from local metadata and body text. Review before moving selected paths into archive_links.yaml entries.'")
$lines.Add("entries:")

foreach ($group in $groups) {
  $terms = @(Get-TermsForGroup -Group $group)
  $candidates = New-Object System.Collections.Generic.List[object]
  foreach ($essay in $essays) {
    $measurement = Measure-CandidateScore -Essay $essay -Terms $terms
    if ($measurement.Score -le 0) { continue }
    $candidates.Add([pscustomobject]@{
      Essay = $essay
      Score = $measurement.Score
      MatchedTerms = $measurement.MatchedTerms
      AlreadyListed = @($group.ExistingPaths) -contains $essay.Path
    })
  }

  $selected = $candidates |
    Sort-Object @{ Expression = 'Score'; Descending = $true }, @{ Expression = { $_.Essay.Date }; Descending = $true }, @{ Expression = { $_.Essay.Title } } |
    Select-Object -First $MaxCandidatesPerGroup

  $label = if ($group.Label) { $group.Label } else { $group.Key }
  $lines.Add("  - key: $(ConvertTo-YamlScalar $group.Key)")
  $lines.Add("    label: $(ConvertTo-YamlScalar $label)")
  $lines.Add("    phrase: $(ConvertTo-YamlScalar $group.Phrase)")
  Add-YamlArray -Lines $lines -Indent '    ' -Name 'terms' -Values $terms
  $lines.Add("    candidates:")
  if (-not $selected) {
    $lines.Add("      []")
    continue
  }
  foreach ($candidate in $selected) {
    $essay = $candidate.Essay
    $lines.Add("      - path: $(ConvertTo-YamlScalar $essay.Path)")
    $lines.Add("        url: $(ConvertTo-YamlScalar $essay.Url)")
    $lines.Add("        title: $(ConvertTo-YamlScalar $essay.Title)")
    $lines.Add("        date: $(ConvertTo-YamlScalar $essay.Date)")
    $lines.Add("        description: $(ConvertTo-YamlScalar $essay.Description)")
    $lines.Add("        score: $($candidate.Score)")
    $lines.Add("        already_listed: $($candidate.AlreadyListed.ToString().ToLowerInvariant())")
    Add-YamlArray -Lines $lines -Indent '        ' -Name 'matched_terms' -Values $candidate.MatchedTerms
    Add-YamlArray -Lines $lines -Indent '        ' -Name 'tags' -Values $essay.Tags
    Add-YamlArray -Lines $lines -Indent '        ' -Name 'collections' -Values $essay.Collections
  }
}

Write-Utf8NoBomLines -Path $OutputPath -Lines $lines.ToArray()
Write-Host "Wrote Almanack archive-link candidates to $OutputPath"
