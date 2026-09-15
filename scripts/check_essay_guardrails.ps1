param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ReportBasePath,
  [string[]]$Paths = @(),
  [string]$BaseRef = '',
  [string]$HeadRef = 'HEAD',
  [switch]$AllEssays,
  [switch]$StrictWarnings,
  [switch]$RequireDescription,
  [switch]$RequireFeaturedImage,
  [switch]$RequireEditorialPhilosophyAudit
)

$ErrorActionPreference = 'Stop'

if (-not $ReportBasePath) {
  $ReportBasePath = Join-Path $Root 'reports\essay-guardrails'
}

$philosophyContentRoots = @(
  'content/essays',
  'content/reports',
  'content/working-papers'
)

$auditScript = Join-Path $Root 'scripts\audit_legacy_essays.ps1'
if (-not (Test-Path $auditScript -PathType Leaf)) {
  throw "Missing audit script: $auditScript"
}

function Get-NormalizedRepoPath {
  param([string]$RepoRoot,[string]$PathValue)

  if ([string]::IsNullOrWhiteSpace($PathValue)) { return $null }

  $candidate = $PathValue.Trim()
  if (-not [System.IO.Path]::IsPathRooted($candidate)) {
    $candidate = Join-Path $RepoRoot $candidate
  }

  if (-not (Test-Path $candidate)) { return $null }
  return [System.IO.Path]::GetFullPath((Resolve-Path $candidate).Path)
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Content
  )

  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path $dir -PathType Container)) {
    New-Item -Path $dir -ItemType Directory -Force | Out-Null
  }

  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-RepoRelativePath {
  param(
    [string]$RepoRoot,
    [string]$PathValue
  )

  $resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path $RepoRoot).Path).TrimEnd('\', '/')
  $resolvedPath = [System.IO.Path]::GetFullPath((Resolve-Path $PathValue).Path)
  if ($resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $resolvedPath.Substring($resolvedRoot.Length).TrimStart('\', '/').Replace('\', '/')
  }

  return $resolvedPath.Replace('\', '/')
}

function Test-FrontMatterHasSocialImage {
  param([string]$Path)

  if (-not (Test-Path $Path -PathType Leaf)) {
    return $false
  }

  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $matches = [regex]::Matches($content, '(?m)^---\s*$')
  if ($matches.Count -lt 2) {
    return $false
  }

  $frontStart = $matches[0].Index + $matches[0].Length
  $frontLength = $matches[1].Index - $frontStart
  if ($frontLength -le 0) {
    return $false
  }

  $frontMatter = $content.Substring($frontStart, $frontLength)
  return [regex]::IsMatch($frontMatter, '(?mi)^(images|image|featured_image)\s*:')
}

function Test-FrontMatterHasImageExemption {
  param([string]$Path)

  $frontMatter = Get-FrontMatterMap -Path $Path
  if (-not $frontMatter.ContainsKey('image_exempt')) {
    return $false
  }

  $exemptValue = ([string]$frontMatter['image_exempt']).Trim()
  if ($exemptValue -notmatch '^(?i:true|yes|1)$') {
    return $false
  }

  if (-not $frontMatter.ContainsKey('image_exempt_reason')) {
    return $false
  }

  return -not [string]::IsNullOrWhiteSpace([string]$frontMatter['image_exempt_reason'])
}

function Get-FrontMatterMap {
  param([string]$Path)

  $result = @{}
  if (-not (Test-Path $Path -PathType Leaf)) {
    return $result
  }

  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $matches = [regex]::Matches($content, '(?m)^---\s*$')
  if ($matches.Count -lt 2) {
    return $result
  }

  $frontStart = $matches[0].Index + $matches[0].Length
  $frontLength = $matches[1].Index - $frontStart
  if ($frontLength -le 0) {
    return $result
  }

  $frontMatter = $content.Substring($frontStart, $frontLength)
  foreach ($line in @($frontMatter -split "`r?`n")) {
    if ($line -match '^\s*([A-Za-z0-9_]+):\s*(.*?)\s*$') {
      $value = $Matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $result[$Matches[1].ToLowerInvariant()] = $value
    }
  }

  return $result
}

function Get-PhilosophyContentKind {
  param(
    [string]$RepoRoot,
    [string]$PathValue
  )

  $relativePath = Get-RepoRelativePath -RepoRoot $RepoRoot -PathValue $PathValue
  foreach ($rootName in $philosophyContentRoots) {
    if ($relativePath.StartsWith($rootName + '/', [System.StringComparison]::OrdinalIgnoreCase)) {
      return $rootName
    }
  }

  return ''
}

function Test-IsEssayContentPath {
  param(
    [string]$RepoRoot,
    [string]$PathValue
  )

  $relativePath = Get-RepoRelativePath -RepoRoot $RepoRoot -PathValue $PathValue
  return $relativePath.StartsWith('content/essays/', [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-PhilosophyAuditSubject {
  param(
    [string]$RepoRoot,
    [string]$PathValue
  )

  $frontMatter = Get-FrontMatterMap -Path $PathValue
  $slug = ''
  if ($frontMatter.ContainsKey('slug')) {
    $slug = [string]$frontMatter['slug']
  }
  if ([string]::IsNullOrWhiteSpace($slug)) {
    $slug = [System.IO.Path]::GetFileNameWithoutExtension($PathValue)
  }

  $draft = $false
  if ($frontMatter.ContainsKey('draft')) {
    $draft = ([string]$frontMatter['draft']).Trim().ToLowerInvariant() -eq 'true'
  }

  return [pscustomobject]@{
    Path = Get-RepoRelativePath -RepoRoot $RepoRoot -PathValue $PathValue
    Slug = $slug
    Draft = $draft
    Kind = Get-PhilosophyContentKind -RepoRoot $RepoRoot -PathValue $PathValue
    SourceFreeMusing = Test-IsSourceFreeMusing -Path $PathValue
    SourceFreeAffirmation = Test-IsSourceFreeAffirmation -Path $PathValue
  }
}

function Test-IsDialogueEssayPath {
  param([string]$Path)

  if (-not (Test-Path $Path -PathType Leaf)) {
    return $false
  }

  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $matches = [regex]::Matches($content, '(?m)^---\s*$')
  if ($matches.Count -lt 2) {
    return $false
  }

  $frontStart = $matches[0].Index + $matches[0].Length
  $frontLength = $matches[1].Index - $frontStart
  if ($frontLength -le 0) {
    return $false
  }

  $frontMatter = $content.Substring($frontStart, $frontLength)
  return [regex]::IsMatch($frontMatter, '(?mi)^library_type:\s*[''"]?dialogue(?:[''"]|\s|$)')
}

function Test-IsSourceFreeMusing {
  param([string]$Path)

  $frontMatter = Get-FrontMatterMap -Path $Path
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

  $frontMatter = Get-FrontMatterMap -Path $Path
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

function Test-OnlyCanonicalPullQuoteHtml {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $false
  }

  $content = [System.IO.File]::ReadAllText($Path)
  $pullQuotePattern = '(?is)<figure\b[^>]*class\s*=\s*["''][^"'']*\bfranklin-pullquote\b[^"'']*["''][^>]*>\s*<blockquote\b[^>]*>.+?</blockquote>\s*<figcaption\b[^>]*>.+?</figcaption>\s*</figure>'
  $pullQuotes = @([regex]::Matches($content, $pullQuotePattern))
  if ($pullQuotes.Count -lt 1) {
    return $false
  }

  $withoutPullQuotes = [regex]::Replace($content, $pullQuotePattern, '')
  return -not [regex]::IsMatch($withoutPullQuotes, '(?is)<\s*/?\s*[a-z][^>]*>')
}

function Test-AuditPassLine {
  param(
    [string]$Text,
    [string]$Label
  )

  $escapedLabel = [regex]::Escape($Label)
  if ([regex]::IsMatch($Text, "(?im)^\s*(?:[-*]\s*)?$escapedLabel\s*:\s*PASS\b")) {
    return $true
  }

  return [regex]::IsMatch($Text, "(?im)^\|\s*$escapedLabel\s*\|\s*PASS\s*\|")
}

function Test-EditorialPhilosophyAuditText {
  param([string]$Text)

  if (-not [regex]::IsMatch($Text, '(?im)^##\s+Editorial Philosophy Audit\s*$')) {
    return $false
  }

  if (-not [regex]::IsMatch($Text, '(?im)^\s*(?:[-*]\s*)?Decision\s*:\s*PASS\b')) {
    return $false
  }

  foreach ($label in @(
    'Evidence',
    'Logic',
    'Incentives',
    'Tradeoffs',
    'Consequences',
    'Uncertainty',
    'Institutional Behavior'
  )) {
    if (-not (Test-AuditPassLine -Text $Text -Label $label)) {
      return $false
    }
  }

  return $true
}

function Test-LedgerEditorialPhilosophyEntry {
  param(
    [object]$Entry,
    [string]$RepoRoot
  )

  if ($null -eq $Entry -or ($Entry.PSObject.Properties.Name -notcontains 'editorial_philosophy')) {
    return $false
  }

  $audit = $Entry.editorial_philosophy
  if ($null -eq $audit -or [string]$audit.status -ne 'PASS') {
    return $false
  }

  foreach ($field in @(
    'evidence',
    'logic',
    'incentives',
    'tradeoffs',
    'consequences',
    'uncertainty',
    'institutional_behavior'
  )) {
    if ($audit.PSObject.Properties.Name -notcontains $field) {
      return $false
    }
    if ([string]$audit.$field -ne 'PASS') {
      return $false
    }
  }

  if ($Entry.PSObject.Properties.Name -notcontains 'report' -or [string]::IsNullOrWhiteSpace([string]$Entry.report)) {
    return $false
  }

  $reportPath = Join-Path $RepoRoot ([string]$Entry.report)
  if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
    return $false
  }

  $reportText = [System.IO.File]::ReadAllText($reportPath, [System.Text.Encoding]::UTF8)
  foreach ($snippet in @(
    'Editorial philosophy: PASS',
    'Evidence: PASS',
    'Logic: PASS',
    'Incentives: PASS',
    'Tradeoffs: PASS',
    'Consequences: PASS',
    'Uncertainty: PASS',
    'Institutional behavior: PASS'
  )) {
    if ($reportText -notmatch [regex]::Escape($snippet)) {
      return $false
    }
  }

  return $true
}

function Test-LedgerEditorialPhilosophyEvidence {
  param(
    [string]$RepoRoot,
    [string]$Slug,
    [string]$LedgerRelativePath
  )

  $ledgerPath = Join-Path $RepoRoot $LedgerRelativePath
  if (-not (Test-Path -LiteralPath $ledgerPath -PathType Leaf)) {
    return $false
  }

  try {
    $ledger = Get-Content -LiteralPath $ledgerPath -Raw | ConvertFrom-Json
  } catch {
    return $false
  }

  if ($null -eq $ledger.completed) {
    return $false
  }

  $entryProperty = $ledger.completed.PSObject.Properties[$Slug]
  if ($null -eq $entryProperty) {
    return $false
  }

  return (Test-LedgerEditorialPhilosophyEntry -Entry $entryProperty.Value -RepoRoot $RepoRoot)
}

function Test-EditorialPhilosophyAuditEvidence {
  param(
    [string]$RepoRoot,
    [string]$Slug
  )

  if ([string]::IsNullOrWhiteSpace($Slug)) {
    return $false
  }

  $refinementReport = Join-Path $RepoRoot "docs\editorial-audits\99-refinement\$Slug-99-refinement-report.md"
  if (Test-Path -LiteralPath $refinementReport -PathType Leaf) {
    $reportText = [System.IO.File]::ReadAllText($refinementReport, [System.Text.Encoding]::UTF8)
    if (Test-EditorialPhilosophyAuditText -Text $reportText) {
      return $true
    }
  }

  foreach ($ledgerRelativePath in @(
    'docs\editorial-audits\daily-backfill\ledger.json',
    'docs\editorial-audits\coa2-value-review\ledger.json'
  )) {
    if (Test-LedgerEditorialPhilosophyEvidence -RepoRoot $RepoRoot -Slug $Slug -LedgerRelativePath $ledgerRelativePath) {
      return $true
    }
  }

  return $false
}

function Get-AdverbialStillConstructionHits {
  param([string]$Path)

  $hits = New-Object System.Collections.Generic.List[object]
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $hits.ToArray()
  }

  $allowedNextWords = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($word in @('image', 'images', 'frame', 'frames', 'photo', 'photos', 'photograph', 'photographs', 'life', 'lifes', 'water', 'waters')) {
    [void]$allowedNextWords.Add($word)
  }

  $allowedPreviousWords = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($word in @('stand', 'stands', 'standing', 'stood', 'sit', 'sits', 'sitting', 'sat', 'lie', 'lies', 'lying', 'lay', 'hold', 'holds', 'held', 'remain', 'remains', 'remained')) {
    [void]$allowedPreviousWords.Add($word)
  }

  $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $lines = @($text -split "`r?`n")
  $inFence = $false

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = [string]$lines[$i]

    if ($line -match '^\s*```') {
      $inFence = -not $inFence
      continue
    }
    if ($inFence -or $line -match '^\s*>') {
      continue
    }

    foreach ($match in [regex]::Matches($line, '\bstill\b', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
      $before = $line.Substring(0, $match.Index)
      $after = $line.Substring($match.Index + $match.Length)
      $previousMatch = [regex]::Match($before, '([A-Za-z]+)\W*$')
      $nextMatch = [regex]::Match($after, '^\W*([A-Za-z]+)')

      if ($nextMatch.Success -and $allowedNextWords.Contains($nextMatch.Groups[1].Value)) {
        continue
      }
      if ($previousMatch.Success -and $allowedPreviousWords.Contains($previousMatch.Groups[1].Value)) {
        continue
      }

      $excerpt = ($line.Trim() -replace '\s+', ' ')
      if ($excerpt.Length -gt 220) {
        $excerpt = $excerpt.Substring(0, 217) + '...'
      }

      $hits.Add([pscustomobject]@{
        Line = $i + 1
        Excerpt = $excerpt
      })
    }
  }

  return $hits.ToArray()
}

function Get-ThatMattersFramingHits {
  param([string]$Path)

  $hits = New-Object System.Collections.Generic.List[object]
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $hits.ToArray()
  }

  $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $lines = @($text -split "`r?`n")
  $inFence = $false

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = [string]$lines[$i]

    if ($line -match '^\s*```') {
      $inFence = -not $inFence
      continue
    }
    if ($inFence -or $line -match '^\s*>') {
      continue
    }

    if ($line -match '(?i)\bthat\s+matters\b|(?:^|[.!?]\s+)that\s+[^.!?]{1,80}\bmatters\b') {
      $excerpt = ($line.Trim() -replace '\s+', ' ')
      if ($excerpt.Length -gt 220) {
        $excerpt = $excerpt.Substring(0, 217) + '...'
      }

      $hits.Add([pscustomobject]@{
        Line = $i + 1
        Excerpt = $excerpt
      })
    }
  }

  return $hits.ToArray()
}

function Add-BlockingIssue {
  param(
    [System.Collections.Generic.List[object]]$Results,
    [string]$Path,
    [string]$Issue
  )

  $existing = $null
  foreach ($item in $Results) {
    if ([string]$item.Path -eq $Path) {
      $existing = $item
      break
    }
  }

  if ($null -eq $existing) {
    $Results.Add([pscustomobject]@{
      Path = $Path
      Issues = @($Issue)
    })
    return
  }

  $existing.Issues = @(@($existing.Issues) + $Issue | Sort-Object -Unique)
}

function Expand-EssayPaths {
  param(
    [string[]]$EssayPaths
  )

  $expanded = New-Object System.Collections.Generic.List[string]
  foreach ($essayPath in $EssayPaths) {
    if (Test-Path $essayPath -PathType Container) {
      Get-ChildItem -Path $essayPath -File -Filter '*.md' -Recurse |
        Where-Object { $_.Name -ne '_index.md' } |
        ForEach-Object {
          if (-not (Test-IsDialogueEssayPath -Path $_.FullName)) {
            $expanded.Add($_.FullName)
          }
        }
      continue
    }

    if (-not (Test-IsDialogueEssayPath -Path $essayPath)) {
      $expanded.Add($essayPath)
    }
  }

  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $results = New-Object System.Collections.Generic.List[string]
  foreach ($candidate in $expanded) {
    if ($seen.Add($candidate)) {
      $results.Add($candidate)
    }
  }

  return $results.ToArray()
}

function Expand-DiscoveryLongformPaths {
  param(
    [string]$RepoRoot,
    [string[]]$ContentPaths
  )

  $expanded = New-Object System.Collections.Generic.List[string]
  foreach ($contentPath in $ContentPaths) {
    if (Test-Path $contentPath -PathType Container) {
      Get-ChildItem -Path $contentPath -File -Filter '*.md' -Recurse |
        Where-Object { $_.Name -ne '_index.md' } |
        ForEach-Object {
          if (-not [string]::IsNullOrWhiteSpace((Get-PhilosophyContentKind -RepoRoot $RepoRoot -PathValue $_.FullName))) {
            $expanded.Add($_.FullName)
          }
        }
      continue
    }

    if (
      ([System.IO.Path]::GetFileName($contentPath) -ne '_index.md') -and
      (-not [string]::IsNullOrWhiteSpace((Get-PhilosophyContentKind -RepoRoot $RepoRoot -PathValue $contentPath)))
    ) {
      $expanded.Add($contentPath)
    }
  }

  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $results = New-Object System.Collections.Generic.List[string]
  foreach ($candidate in $expanded) {
    if ($seen.Add($candidate)) {
      $results.Add($candidate)
    }
  }

  return $results.ToArray()
}

function ConvertFrom-SimpleYamlScalar {
  param([string]$Value)

  $normalized = ([string]$Value).Trim()
  if (
    $normalized.Length -ge 2 -and
    (($normalized.StartsWith('"') -and $normalized.EndsWith('"')) -or ($normalized.StartsWith("'") -and $normalized.EndsWith("'")))
  ) {
    $normalized = $normalized.Substring(1, $normalized.Length - 2)
  }
  return $normalized.Trim()
}

function Get-FrontMatterListValues {
  param(
    [string]$Path,
    [string]$Key
  )

  $values = New-Object System.Collections.Generic.List[string]
  if (-not (Test-Path $Path -PathType Leaf)) {
    return $values.ToArray()
  }

  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $frontMatterMatch = [regex]::Match(
    (($content -replace "`r`n", "`n") -replace "`r", "`n"),
    '\A---\s*\n(?<front>.*?)\n---\s*(?:\n|$)',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
  if (-not $frontMatterMatch.Success) {
    return $values.ToArray()
  }

  $collecting = $false
  $escapedKey = [regex]::Escape($Key)
  foreach ($line in @([regex]::Split([string]$frontMatterMatch.Groups['front'].Value, "`n"))) {
    if ($line -match ("^\s*" + $escapedKey + "\s*:\s*(.*?)\s*$")) {
      $collecting = $true
      $inlineValue = ([string]$Matches[1]).Trim()
      if (-not [string]::IsNullOrWhiteSpace($inlineValue)) {
        $collecting = $false
        $inlineValue = $inlineValue.TrimStart('[').TrimEnd(']')
        foreach ($item in @($inlineValue -split ',')) {
          $normalized = ConvertFrom-SimpleYamlScalar -Value $item
          if (-not [string]::IsNullOrWhiteSpace($normalized)) {
            $values.Add($normalized)
          }
        }
      }
      continue
    }

    if (-not $collecting) {
      continue
    }

    if ($line -match '^\s+-\s*(.*?)\s*$') {
      $normalized = ConvertFrom-SimpleYamlScalar -Value ([string]$Matches[1])
      if (-not [string]::IsNullOrWhiteSpace($normalized)) {
        $values.Add($normalized)
      }
      continue
    }

    if (-not [string]::IsNullOrWhiteSpace($line)) {
      $collecting = $false
    }
  }

  return @($values.ToArray() | Sort-Object -Unique)
}

function Get-PublicCollectionSlugs {
  param([string]$RepoRoot)

  $slugs = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $collectionsPath = Join-Path $RepoRoot 'data\collections.yaml'
  if (-not (Test-Path $collectionsPath -PathType Leaf)) {
    return ,$slugs
  }

  $content = [System.IO.File]::ReadAllText($collectionsPath, [System.Text.Encoding]::UTF8)
  $matches = [regex]::Matches(
    (($content -replace "`r`n", "`n") -replace "`r", "`n"),
    '(?ms)^  - slug:\s*(?<slug>[^\n#]+?)\s*\n(?<body>.*?)(?=^  - slug:|\z)'
  )
  foreach ($match in $matches) {
    if ([regex]::IsMatch([string]$match.Groups['body'].Value, '(?m)^    public:\s*true\s*$')) {
      $slug = ConvertFrom-SimpleYamlScalar -Value ([string]$match.Groups['slug'].Value)
      if (-not [string]::IsNullOrWhiteSpace($slug)) {
        [void]$slugs.Add($slug)
      }
    }
  }

  return ,$slugs
}

function Test-IsGitRepositoryRoot {
  param([string]$RepoRoot)

  $topLevelOutput = @(& git -C $RepoRoot rev-parse --show-toplevel 2>$null)
  if ($LASTEXITCODE -ne 0 -or $topLevelOutput.Count -eq 0) {
    return $false
  }

  $topLevel = [System.IO.Path]::GetFullPath(([string]($topLevelOutput -join '')).Trim()).TrimEnd('\', '/')
  $resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path $RepoRoot).Path).TrimEnd('\', '/')
  return $topLevel.Equals($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-GitRefContainsPath {
  param(
    [string]$RepoRoot,
    [string]$Ref,
    [string]$RelativePath
  )

  if ([string]::IsNullOrWhiteSpace($Ref) -or ($Ref -match '^0+$')) {
    return $false
  }

  & git -C $RepoRoot cat-file -e "$Ref`:$RelativePath" 2>$null
  return ($LASTEXITCODE -eq 0)
}

function Get-WorkingTreeEssayPaths {
  param([string]$RepoRoot)

  $paths = New-Object System.Collections.Generic.List[string]
  foreach ($rootName in $philosophyContentRoots) {
    foreach ($pathValue in @(& git -C $RepoRoot diff --name-only --diff-filter=ACMR HEAD -- $rootName 2>$null)) {
      $paths.Add($pathValue)
    }
    foreach ($pathValue in @(& git -C $RepoRoot ls-files --others --exclude-standard -- $rootName 2>$null)) {
      $paths.Add($pathValue)
    }
  }
  return $paths.ToArray()
}

function Get-DiffEssayPaths {
  param(
    [string]$RepoRoot,
    [string]$FromRef,
    [string]$ToRef
  )

  $paths = New-Object System.Collections.Generic.List[string]
  foreach ($rootName in $philosophyContentRoots) {
    foreach ($pathValue in @(& git -C $RepoRoot diff --name-only --diff-filter=ACMR $FromRef $ToRef -- $rootName 2>$null)) {
      $paths.Add($pathValue)
    }
  }
  return $paths.ToArray()
}

function Normalize-GuardrailText {
  param([string]$Text)

  if ($null -eq $Text) {
    return ''
  }

  return (($Text -replace "`r`n", "`n") -replace "`r", "`n").TrimEnd()
}

function Remove-GuardrailExemptFrontMatterFields {
  param([string]$Text)

  if ($null -eq $Text) {
    return ''
  }

  $normalized = ($Text -replace "`r`n", "`n") -replace "`r", "`n"
  $frontMatterMatch = [regex]::Match(
    $normalized,
    '\A---\s*\n(?<front>.*?)\n---\s*(?<after>\n|$)',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  if (-not $frontMatterMatch.Success) {
    return $normalized
  }

  $allowedKeys = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($key in @(
    'build',
    'collections',
    'collection_weight',
    'description',
    'discovery_exempt_reason',
    'edition_relationship',
    'featured_image',
    'featured_image_alt',
    'featured_image_caption',
    'image',
    'image_alt',
    'image_caption',
    'image_exempt',
    'image_exempt_reason',
    'images',
    'metadata_title',
    'noindex',
    'series',
    'tags',
    'topics'
  )) {
    [void]$allowedKeys.Add($key)
  }

  $frontMatter = [string]$frontMatterMatch.Groups['front'].Value
  $lines = @([regex]::Split($frontMatter, "`n"))
  $keptLines = New-Object System.Collections.Generic.List[string]
  $skipAllowedBlock = $false

  foreach ($line in $lines) {
    if ($line -match '^([A-Za-z0-9_-]+)\s*:') {
      $key = [string]$Matches[1]
      if ($allowedKeys.Contains($key)) {
        $skipAllowedBlock = $true
        continue
      }

      $skipAllowedBlock = $false
      $keptLines.Add($line)
      continue
    }

    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    if ($skipAllowedBlock) {
      if ([string]::IsNullOrWhiteSpace($line)) {
        continue
      }

      if ($line -match '^\s+') {
        continue
      }

      $skipAllowedBlock = $false
    }

    $keptLines.Add($line)
  }

  $frontStart = $frontMatterMatch.Index
  $frontEnd = $frontMatterMatch.Index + $frontMatterMatch.Length
  $afterText = $normalized.Substring($frontEnd)
  if ($frontMatterMatch.Groups['after'].Value -eq "`n") {
    $afterText = "`n" + $afterText
  }

  return ('---' + "`n" + (($keptLines.ToArray()) -join "`n") + "`n" + '---' + $afterText)
}

function Remove-GuardrailImageRecoveryFrontMatterFields {
  param([string]$Text)

  if ($null -eq $Text) {
    return ''
  }

  $normalized = ($Text -replace "`r`n", "`n") -replace "`r", "`n"
  $frontMatterMatch = [regex]::Match(
    $normalized,
    '\A---\s*\n(?<front>.*?)\n---\s*(?<after>\n|$)',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  if (-not $frontMatterMatch.Success) {
    return $normalized
  }

  $allowedKeys = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($key in @('version', 'edition', 'revision_history')) {
    [void]$allowedKeys.Add($key)
  }

  $frontMatter = [string]$frontMatterMatch.Groups['front'].Value
  $lines = @([regex]::Split($frontMatter, "`n"))
  $keptLines = New-Object System.Collections.Generic.List[string]
  $skipAllowedBlock = $false

  foreach ($line in $lines) {
    if ($line -match '^([A-Za-z0-9_-]+)\s*:') {
      $key = [string]$Matches[1]
      if ($allowedKeys.Contains($key)) {
        $skipAllowedBlock = $true
        continue
      }

      $skipAllowedBlock = $false
      $keptLines.Add($line)
      continue
    }

    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    if ($skipAllowedBlock) {
      if ($line -match '^\s+') {
        continue
      }

      $skipAllowedBlock = $false
    }

    $keptLines.Add($line)
  }

  $frontEnd = $frontMatterMatch.Index + $frontMatterMatch.Length
  $afterText = $normalized.Substring($frontEnd)
  if ($frontMatterMatch.Groups['after'].Value -eq "`n") {
    $afterText = "`n" + $afterText
  }

  return ('---' + "`n" + (($keptLines.ToArray()) -join "`n") + "`n" + '---' + $afterText)
}

function ConvertTo-ImageRecoveryComparableText {
  param([string]$Text)

  $metadataComparable = Remove-GuardrailImageRecoveryFrontMatterFields -Text (Remove-GuardrailExemptFrontMatterFields -Text $Text)
  $normalized = ($metadataComparable -replace "`r`n", "`n") -replace "`r", "`n"
  $lines = @([regex]::Split($normalized, "`n"))
  $keptLines = New-Object System.Collections.Generic.List[string]
  $removedImageBlocks = 0

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = [string]$lines[$i]
    if ($line -match '^\s*!\[[^\]]*\]\((?:/images/medium/[^)\s]+/[0-9a-f]{64}\.[A-Za-z0-9]+|oip-image:medium/[0-9a-f]{64})(?:\s+["''][^"'']*["''])?\)\s*$') {
      $removedImageBlocks++
      $j = $i + 1
      while ($j -lt $lines.Count -and [string]::IsNullOrWhiteSpace([string]$lines[$j])) {
        $j++
      }

      if ($j -lt $lines.Count -and ([string]$lines[$j]) -match '^\s*\*.+\*\s*$') {
        $j++
        while ($j -lt $lines.Count -and [string]::IsNullOrWhiteSpace([string]$lines[$j])) {
          $j++
        }
      }

      $i = $j - 1
      continue
    }

    $keptLines.Add($line)
  }

  $comparable = ($keptLines.ToArray() -join "`n")
  $comparable = [regex]::Replace($comparable, "([ \t]*\n){3,}", "`n`n")

  return [pscustomobject]@{
    Text = Normalize-GuardrailText -Text $comparable
    RemovedImageBlocks = $removedImageBlocks
  }
}

function Get-GitBlobText {
  param(
    [string]$RepoRoot,
    [string]$Ref,
    [string]$RelativePath
  )

  if ([string]::IsNullOrWhiteSpace($Ref) -or ($Ref -match '^0+$')) {
    return $null
  }

  $blobLines = @(& git -C $RepoRoot show "$Ref`:$RelativePath" 2>$null)
  if ($LASTEXITCODE -ne 0) {
    return $null
  }

  return (($blobLines -join "`n") + "`n")
}

function Test-IsGuardrailExemptMetadataOnlyDiff {
  param(
    [string]$RepoRoot,
    [string]$PathValue,
    [string]$FromRef,
    [string]$ToRef
  )

  if ([string]::IsNullOrWhiteSpace($FromRef) -or ($FromRef -match '^0+$')) {
    return $false
  }

  if ([string]::IsNullOrWhiteSpace($ToRef)) {
    return $false
  }

  $relativePath = Get-RepoRelativePath -RepoRoot $RepoRoot -PathValue $PathValue
  $beforeText = Get-GitBlobText -RepoRoot $RepoRoot -Ref $FromRef -RelativePath $relativePath
  $afterText = Get-GitBlobText -RepoRoot $RepoRoot -Ref $ToRef -RelativePath $relativePath
  if ($null -eq $beforeText -or $null -eq $afterText) {
    return $false
  }

  $beforeComparable = Normalize-GuardrailText -Text (Remove-GuardrailExemptFrontMatterFields -Text $beforeText)
  $afterComparable = Normalize-GuardrailText -Text (Remove-GuardrailExemptFrontMatterFields -Text $afterText)
  return ($beforeComparable -eq $afterComparable)
}

function Test-IsGuardrailExemptImageRecoveryDiff {
  param(
    [string]$RepoRoot,
    [string]$PathValue,
    [string]$FromRef,
    [string]$ToRef
  )

  if ([string]::IsNullOrWhiteSpace($FromRef) -or ($FromRef -match '^0+$')) {
    return $false
  }

  if ([string]::IsNullOrWhiteSpace($ToRef)) {
    return $false
  }

  $relativePath = Get-RepoRelativePath -RepoRoot $RepoRoot -PathValue $PathValue
  $beforeText = Get-GitBlobText -RepoRoot $RepoRoot -Ref $FromRef -RelativePath $relativePath
  $afterText = Get-GitBlobText -RepoRoot $RepoRoot -Ref $ToRef -RelativePath $relativePath
  if ($null -eq $beforeText -or $null -eq $afterText) {
    return $false
  }

  $beforeComparable = ConvertTo-ImageRecoveryComparableText -Text $beforeText
  $afterComparable = ConvertTo-ImageRecoveryComparableText -Text $afterText
  if ([int]$afterComparable.RemovedImageBlocks -eq 0 -and [int]$beforeComparable.RemovedImageBlocks -eq 0) {
    return $false
  }

  if ([int]$afterComparable.RemovedImageBlocks -lt [int]$beforeComparable.RemovedImageBlocks) {
    return $false
  }

  return ([string]$beforeComparable.Text -eq [string]$afterComparable.Text)
}

function Resolve-TargetEssayPaths {
  param(
    [string]$RepoRoot,
    [string[]]$ExplicitPaths,
    [string]$FromRef,
    [string]$ToRef,
    [switch]$ScanAll
  )

  $candidates = New-Object System.Collections.Generic.List[string]

  if ($ExplicitPaths -and $ExplicitPaths.Count -gt 0) {
    foreach ($rawPath in $ExplicitPaths) {
      foreach ($pathValue in @($rawPath -split ',' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
        $resolved = Get-NormalizedRepoPath -RepoRoot $RepoRoot -PathValue $pathValue
        if ($resolved) { $candidates.Add($resolved) }
      }
    }
  } elseif ($ScanAll) {
    foreach ($rootName in $philosophyContentRoots) {
      $contentRoot = Join-Path $RepoRoot ($rootName -replace '/', '\')
      if (Test-Path $contentRoot -PathType Container) {
        $candidates.Add([System.IO.Path]::GetFullPath($contentRoot))
      }
    }
  } elseif (-not [string]::IsNullOrWhiteSpace($FromRef) -and ($FromRef -notmatch '^0+$')) {
    foreach ($pathValue in (Get-DiffEssayPaths -RepoRoot $RepoRoot -FromRef $FromRef -ToRef $ToRef)) {
      $resolved = Get-NormalizedRepoPath -RepoRoot $RepoRoot -PathValue $pathValue
      if ($resolved) { $candidates.Add($resolved) }
    }
  } else {
    foreach ($pathValue in (Get-WorkingTreeEssayPaths -RepoRoot $RepoRoot)) {
      $resolved = Get-NormalizedRepoPath -RepoRoot $RepoRoot -PathValue $pathValue
      if ($resolved) { $candidates.Add($resolved) }
    }
  }

  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $results = New-Object System.Collections.Generic.List[string]
  foreach ($candidate in $candidates) {
    $leaf = [System.IO.Path]::GetFileName($candidate)
    $isDirectory = Test-Path $candidate -PathType Container
    if ((-not $isDirectory) -and (($leaf -eq '_index.md') -or (-not $leaf.EndsWith('.md', [System.StringComparison]::OrdinalIgnoreCase)))) {
      continue
    }
    if ($seen.Add($candidate)) {
      $results.Add($candidate)
    }
  }

  return $results.ToArray()
}

function Get-AuditRowsForGitRef {
  param(
    [string]$RepoRoot,
    [string]$AuditScriptPath,
    [string]$Ref,
    [string[]]$EssayPaths
  )

  if ([string]::IsNullOrWhiteSpace($Ref) -or ($Ref -match '^0+$')) {
    return @()
  }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('.tmp-essay-guardrails-base-' + [guid]::NewGuid().ToString('N'))
  $reportBasePath = Join-Path $tempRoot 'reports\essay-guardrails'
  $restoredPaths = New-Object System.Collections.Generic.List[string]

  try {
    $expandedEssayPaths = @(Expand-EssayPaths -EssayPaths $EssayPaths)

    foreach ($essayPath in $expandedEssayPaths) {
      $relativePath = Get-RepoRelativePath -RepoRoot $RepoRoot -PathValue $essayPath
      $blob = @(& git -C $RepoRoot show "$Ref`:$relativePath" 2>$null)
      if ($LASTEXITCODE -ne 0 -or -not $blob -or $blob.Count -eq 0) {
        continue
      }

      $restoredPath = Join-Path $tempRoot ($relativePath -replace '/', '\')
      Write-Utf8NoBom -Path $restoredPath -Content (($blob -join [Environment]::NewLine) + [Environment]::NewLine)
      $restoredPaths.Add($restoredPath)
    }

    if ($restoredPaths.Count -eq 0) {
      return @()
    }

    & $AuditScriptPath -Root $tempRoot -Sections @('essays') -Paths $restoredPaths.ToArray() -ReportBasePath $reportBasePath | Out-Null
    $report = Get-Content ($reportBasePath + '.json') -Raw | ConvertFrom-Json
    return @($report.files)
  }
  finally {
    if (Test-Path $tempRoot) {
      Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Get-CurrentPowerShellExecutable {
  $generatedPwsh = Join-Path $Root 'tools\bin\generated\pwsh.cmd'
  $isWindowsHost = [System.IO.Path]::DirectorySeparatorChar -eq '\'
  if ($isWindowsHost -and (Test-Path -LiteralPath $generatedPwsh -PathType Leaf)) {
    $probeOutput = & $generatedPwsh -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion.ToString()' 2>$null
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($probeOutput -join ''))) {
      return $generatedPwsh
    }
  }

  $currentProcess = Get-Process -Id $PID
  if ($currentProcess.Path -and (Test-Path $currentProcess.Path -PathType Leaf) -and ([System.IO.Path]::GetFileNameWithoutExtension($currentProcess.Path) -ieq 'pwsh')) {
    return $currentProcess.Path
  }

  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pwsh -and $pwsh.Source) {
    return $pwsh.Source
  }

  throw 'Unable to locate PowerShell 7 for the legacy import preflight. Run tools\generate_tool_wrappers.cmd and tools\provision_toolchain.cmd first.'
}

function Invoke-LegacyImportPreflight {
  param(
    [string]$RepoRoot,
    [string[]]$EssayPaths,
    [string]$GuardrailReportBasePath,
    [switch]$FailOnWarnings
  )

  if (-not $EssayPaths -or $EssayPaths.Count -eq 0) {
    Write-Host 'Legacy import preflight: no essay cleanup targets; skipping focused legacy scan.' -ForegroundColor Yellow
    return 0
  }

  $preflightScript = Join-Path $RepoRoot 'scripts\check_legacy_import_preflight.ps1'
  if (-not (Test-Path $preflightScript -PathType Leaf)) {
    Write-Host 'Legacy import preflight: script not found; skipping focused legacy scan.' -ForegroundColor Yellow
    return 0
  }

  $pwsh = Get-CurrentPowerShellExecutable
  $preflightArgs = @(
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    $preflightScript,
    '-Root',
    $RepoRoot,
    '-ReportBasePath',
    ($GuardrailReportBasePath + '-legacy-import-preflight'),
    '-Paths',
    ($EssayPaths -join ',')
  )

  if ($FailOnWarnings) {
    $preflightArgs += '-StrictWarnings'
  }

  $preflightOutput = & $pwsh @preflightArgs 2>&1
  $preflightExitCode = $LASTEXITCODE
  foreach ($line in @($preflightOutput)) {
    Write-Host $line
  }
  return $preflightExitCode
}

$resolvedTargetPaths = Resolve-TargetEssayPaths `
  -RepoRoot $Root `
  -ExplicitPaths $Paths `
  -FromRef $BaseRef `
  -ToRef $HeadRef `
  -ScanAll:$AllEssays

$discoveryPublishedTargetCount = 0
$discoveryBlockingResults = New-Object System.Collections.Generic.List[object]
if (Test-IsGitRepositoryRoot -RepoRoot $Root) {
  $discoveryBaselineRef = if ((-not [string]::IsNullOrWhiteSpace($BaseRef)) -and ($BaseRef -notmatch '^0+$')) { $BaseRef } else { 'HEAD' }
  $publicCollectionSlugs = Get-PublicCollectionSlugs -RepoRoot $Root
  $discoveryTargetPaths = @(Expand-DiscoveryLongformPaths -RepoRoot $Root -ContentPaths $resolvedTargetPaths)

  foreach ($discoveryTargetPath in $discoveryTargetPaths) {
    $relativePath = Get-RepoRelativePath -RepoRoot $Root -PathValue $discoveryTargetPath
    if (Test-GitRefContainsPath -RepoRoot $Root -Ref $discoveryBaselineRef -RelativePath $relativePath) {
      continue
    }

    $frontMatter = Get-FrontMatterMap -Path $discoveryTargetPath
    $isDraft = $frontMatter.ContainsKey('draft') -and ([string]$frontMatter['draft']).Trim() -match '^(?i:true|yes|1)$'
    if ($isDraft) {
      continue
    }

    $discoveryPublishedTargetCount++
    $hasExemption = $frontMatter.ContainsKey('discovery_exempt_reason') -and (-not [string]::IsNullOrWhiteSpace([string]$frontMatter['discovery_exempt_reason']))
    $hasPublicCollection = $false
    foreach ($collectionSlug in @(Get-FrontMatterListValues -Path $discoveryTargetPath -Key 'collections')) {
      if ($publicCollectionSlugs.Contains($collectionSlug)) {
        $hasPublicCollection = $true
        break
      }
    }

    if (-not $hasPublicCollection -and -not $hasExemption) {
      $displayPath = if ($relativePath.StartsWith('content/', [System.StringComparison]::OrdinalIgnoreCase)) {
        $relativePath.Substring('content/'.Length)
      } else {
        $relativePath
      }
      $discoveryBlockingResults.Add([pscustomobject]@{
        Path = $displayPath
        Issues = @('missing_discovery_route')
      })
    }
  }
}

$targetPaths = @(Expand-EssayPaths -EssayPaths $resolvedTargetPaths)

$metadataOnlyPaths = New-Object System.Collections.Generic.List[string]
$imageRecoveryOnlyPaths = New-Object System.Collections.Generic.List[string]
if (
  (-not $AllEssays) -and
  (-not ($Paths -and $Paths.Count -gt 0)) -and
  (-not [string]::IsNullOrWhiteSpace($BaseRef)) -and
  ($BaseRef -notmatch '^0+$') -and
  (-not [string]::IsNullOrWhiteSpace($HeadRef))
) {
  $filteredTargets = New-Object System.Collections.Generic.List[string]
  foreach ($targetPath in $targetPaths) {
    if (Test-IsGuardrailExemptMetadataOnlyDiff -RepoRoot $Root -PathValue $targetPath -FromRef $BaseRef -ToRef $HeadRef) {
      $metadataOnlyPaths.Add((Get-RepoRelativePath -RepoRoot $Root -PathValue $targetPath))
      continue
    }

    if (Test-IsGuardrailExemptImageRecoveryDiff -RepoRoot $Root -PathValue $targetPath -FromRef $BaseRef -ToRef $HeadRef) {
      $imageRecoveryOnlyPaths.Add((Get-RepoRelativePath -RepoRoot $Root -PathValue $targetPath))
      continue
    }

    $filteredTargets.Add($targetPath)
  }

  $targetPaths = $filteredTargets.ToArray()
}

if ($metadataOnlyPaths.Count -gt 0) {
  Write-Host ("Essay guardrails: skipped {0} allowlisted front matter-only change(s)." -f $metadataOnlyPaths.Count) -ForegroundColor Yellow
  foreach ($metadataPath in $metadataOnlyPaths) {
    Write-Host "  - $metadataPath" -ForegroundColor Yellow
  }
}

if ($imageRecoveryOnlyPaths.Count -gt 0) {
  Write-Host ("Essay guardrails: skipped {0} Medium image recovery-only change(s)." -f $imageRecoveryOnlyPaths.Count) -ForegroundColor Yellow
  foreach ($imageRecoveryPath in $imageRecoveryOnlyPaths) {
    Write-Host "  - $imageRecoveryPath" -ForegroundColor Yellow
  }
}

if ($targetPaths.Count -eq 0) {
  if ($discoveryBlockingResults.Count -gt 0) {
    Write-Host 'Essay guardrails summary' -ForegroundColor Cyan
    Write-Host "  New published longform targets: $discoveryPublishedTargetCount"
    Write-Host "  Discovery blocking files: $($discoveryBlockingResults.Count)"
    foreach ($item in $discoveryBlockingResults) {
      Write-Host ''
      Write-Host "BLOCKER $($item.Path)" -ForegroundColor Red
      foreach ($issue in $item.Issues) {
        Write-Host "  - $issue" -ForegroundColor Red
      }
    }
    Write-Host "`nEssay guardrails FAILED." -ForegroundColor Red
    exit 1
  }
  Write-Host 'Essay guardrails: no target files to check.' -ForegroundColor Yellow
  exit 0
}

$essayAuditPaths = @($targetPaths | Where-Object { Test-IsEssayContentPath -RepoRoot $Root -PathValue $_ })
$legacyImportPaths = @($essayAuditPaths | Where-Object { -not (Test-IsSourceFreeReflection -Path $_) })
$philosophyAuditSubjects = @(
  $targetPaths |
    Where-Object { -not [string]::IsNullOrWhiteSpace((Get-PhilosophyContentKind -RepoRoot $Root -PathValue $_)) } |
    ForEach-Object { Get-PhilosophyAuditSubject -RepoRoot $Root -PathValue $_ }
)

$rows = @()
if ($essayAuditPaths.Count -gt 0) {
  & $auditScript -Root $Root -Sections @('essays') -Paths $essayAuditPaths -ReportBasePath $ReportBasePath | Out-Null
  $report = Get-Content ($ReportBasePath + '.json') -Raw | ConvertFrom-Json
  $rows = @($report.files)
}

$baselineRowsByPath = @{}
if ($essayAuditPaths.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($BaseRef) -and ($BaseRef -notmatch '^0+$')) {
  $baselineRows = @(Get-AuditRowsForGitRef -RepoRoot $Root -AuditScriptPath $auditScript -Ref $BaseRef -EssayPaths $essayAuditPaths)
  foreach ($baselineRow in $baselineRows) {
    $baselineRowsByPath[[string]$baselineRow.path] = $baselineRow
  }
}

if ($rows.Count -eq 0 -and $philosophyAuditSubjects.Count -eq 0) {
  Write-Host 'Essay guardrails: audit produced no matching governed rows.' -ForegroundColor Yellow
  exit 0
}

$blockingIssues = @('duplicated_title','embed_remnants','mojibake','medium_cta','medium_cdn_media','hero_placeholder_conflict','hero_missing_with_lead','ai_tell_title_subtitle_structure')
$warningIssues = @('caption_residue','pseudo_headings','manual_bullets','fake_lists','source_dumps','ornamental_breaks','escaped_linebreaks','author_note','hero_duplicate_lead','hero_current_wins_conflict')

$blockingResults = New-Object System.Collections.Generic.List[object]
$warningResults = New-Object System.Collections.Generic.List[object]
$philosophyAuditResults = New-Object System.Collections.Generic.List[object]
$stillConstructionResults = New-Object System.Collections.Generic.List[object]
$thatMattersResults = New-Object System.Collections.Generic.List[object]

foreach ($row in $rows) {
  $issueTypes = @($row.issue_types)
  $baselineIssueTypes = @()
  $baselineMissingDescription = $false

  if ($baselineRowsByPath.ContainsKey([string]$row.path)) {
    $baselineRow = $baselineRowsByPath[[string]$row.path]
    $baselineIssueTypes = @($baselineRow.issue_types)
    $baselineMissingDescription = -not [bool]$baselineRow.has_description
  }

  $rowBlockers = @($issueTypes | Where-Object {
    ($blockingIssues -contains $_) -and ($baselineIssueTypes -notcontains $_)
  })
  $rowWarnings = @($issueTypes | Where-Object {
    ($warningIssues -contains $_) -and ($baselineIssueTypes -notcontains $_)
  })

  $rowFullPath = Get-NormalizedRepoPath -RepoRoot $Root -PathValue ([string]$row.path)
  if (-not $rowFullPath) {
    $rowFullPath = Get-NormalizedRepoPath -RepoRoot $Root -PathValue ("content/" + [string]$row.path)
  }
  if (
    ($rowBlockers -contains 'embed_remnants') -and
    $rowFullPath -and
    (Test-IsSourceFreeReflection -Path $rowFullPath) -and
    (Test-OnlyCanonicalPullQuoteHtml -Path $rowFullPath)
  ) {
    $rowBlockers = @($rowBlockers | Where-Object { $_ -ne 'embed_remnants' })
  }

  if ((-not [bool]$row.has_description) -and (-not [bool]$row.draft)) {
    if ($RequireDescription) {
      $rowBlockers += 'missing_description'
    } elseif (-not $baselineMissingDescription) {
      $rowWarnings += 'missing_description'
    }
  }

  if ($RequireFeaturedImage -and (-not [bool]$row.draft)) {
    if ($rowFullPath -and -not (Test-FrontMatterHasSocialImage -Path $rowFullPath) -and -not (Test-FrontMatterHasImageExemption -Path $rowFullPath)) {
      $rowBlockers += 'missing_featured_image'
    }
  }

  if ($rowBlockers.Count -gt 0) {
    $blockingResults.Add([pscustomobject]@{
      Path = [string]$row.path
      Issues = @($rowBlockers | Sort-Object -Unique)
    })
  }

  if ($rowWarnings.Count -gt 0) {
    $warningResults.Add([pscustomobject]@{
      Path = [string]$row.path
      Issues = @($rowWarnings | Sort-Object -Unique)
    })
  }
}

foreach ($targetPath in $targetPaths) {
  $thatMattersHits = @(Get-ThatMattersFramingHits -Path $targetPath)
  if ($thatMattersHits.Count -gt 0) {
    $relativePath = Get-RepoRelativePath -RepoRoot $Root -PathValue $targetPath
    $displayPath = if ($relativePath.StartsWith('content/', [System.StringComparison]::OrdinalIgnoreCase)) {
      $relativePath.Substring('content/'.Length)
    } else {
      $relativePath
    }

    Add-BlockingIssue -Results $blockingResults -Path $displayPath -Issue 'that_matters_framing'
    foreach ($hit in $thatMattersHits) {
      $thatMattersResults.Add([pscustomobject]@{
        Path = $displayPath
        Line = $hit.Line
        Excerpt = $hit.Excerpt
      })
    }
  }

  # Fully declared source-free reflections preserve authorial personal cadence.
  # Their narrow exemptions are defined by their separate publication contracts.
  if (Test-IsSourceFreeReflection -Path $targetPath) {
    continue
  }

  $stillHits = @(Get-AdverbialStillConstructionHits -Path $targetPath)
  if ($stillHits.Count -eq 0) {
    continue
  }

  $relativePath = Get-RepoRelativePath -RepoRoot $Root -PathValue $targetPath
  $displayPath = if ($relativePath.StartsWith('content/', [System.StringComparison]::OrdinalIgnoreCase)) {
    $relativePath.Substring('content/'.Length)
  } else {
    $relativePath
  }

  Add-BlockingIssue -Results $blockingResults -Path $displayPath -Issue 'adverbial_still_construction'
  foreach ($hit in $stillHits) {
    $stillConstructionResults.Add([pscustomobject]@{
      Path = $displayPath
      Line = $hit.Line
      Excerpt = $hit.Excerpt
    })
  }
}

if ($RequireEditorialPhilosophyAudit) {
  foreach ($subject in $philosophyAuditSubjects) {
    if ([bool]$subject.Draft) {
      continue
    }

    if ([bool]$subject.SourceFreeMusing -or [bool]$subject.SourceFreeAffirmation) {
      continue
    }

    if (-not (Test-EditorialPhilosophyAuditEvidence -RepoRoot $Root -Slug ([string]$subject.Slug))) {
      $philosophyAuditResults.Add([pscustomobject]@{
        Path = [string]$subject.Path
        Slug = [string]$subject.Slug
        Issues = @('missing_editorial_philosophy_audit')
      })
    }
  }
}

Write-Host 'Essay guardrails summary' -ForegroundColor Cyan
Write-Host "  New published longform targets: $discoveryPublishedTargetCount"
Write-Host "  Discovery blocking files: $($discoveryBlockingResults.Count)"
Write-Host "  Essay cleanup targets: $($rows.Count)"
Write-Host "  Philosophy audit targets: $($philosophyAuditSubjects.Count)"
Write-Host "  Source-free Musing audit exemptions: $(@($philosophyAuditSubjects | Where-Object { [bool]$_.SourceFreeMusing }).Count)"
Write-Host "  Source-free Affirmation audit exemptions: $(@($philosophyAuditSubjects | Where-Object { [bool]$_.SourceFreeAffirmation }).Count)"
Write-Host "  Blocking files: $($blockingResults.Count)"
Write-Host "  Warning files: $($warningResults.Count)"
Write-Host "  Philosophy audit blocking files: $($philosophyAuditResults.Count)"
Write-Host "  That-matters framing hits: $($thatMattersResults.Count)"
Write-Host "  Adverbial still construction hits: $($stillConstructionResults.Count)"
Write-Host "  Audit report: $($ReportBasePath).json"

foreach ($item in $blockingResults) {
  Write-Host ''
  Write-Host "BLOCKER $($item.Path)" -ForegroundColor Red
  foreach ($issue in $item.Issues) {
    Write-Host "  - $issue" -ForegroundColor Red
  }
}

foreach ($item in $discoveryBlockingResults) {
  Write-Host ''
  Write-Host "BLOCKER $($item.Path)" -ForegroundColor Red
  foreach ($issue in $item.Issues) {
    Write-Host "  - $issue" -ForegroundColor Red
  }
}

foreach ($item in $warningResults) {
  Write-Host ''
  Write-Host "WARNING $($item.Path)" -ForegroundColor Yellow
  foreach ($issue in $item.Issues) {
    Write-Host "  - $issue" -ForegroundColor Yellow
  }
}

foreach ($item in $philosophyAuditResults) {
  Write-Host ''
  Write-Host "BLOCKER $($item.Path)" -ForegroundColor Red
  foreach ($issue in $item.Issues) {
    Write-Host "  - $issue for slug $($item.Slug)" -ForegroundColor Red
  }
}

foreach ($item in $thatMattersResults) {
  Write-Host ''
  Write-Host "THAT-MATTERS $($item.Path):$($item.Line)" -ForegroundColor Red
  Write-Host "  $($item.Excerpt)" -ForegroundColor Red
}

foreach ($item in $stillConstructionResults) {
  Write-Host ''
  Write-Host "STILL $($item.Path):$($item.Line)" -ForegroundColor Red
  Write-Host "  $($item.Excerpt)" -ForegroundColor Red
}

$legacyPreflightExitCode = Invoke-LegacyImportPreflight `
  -RepoRoot $Root `
  -EssayPaths $legacyImportPaths `
  -GuardrailReportBasePath $ReportBasePath `
  -FailOnWarnings:$StrictWarnings

if ($discoveryBlockingResults.Count -gt 0 -or $blockingResults.Count -gt 0 -or $philosophyAuditResults.Count -gt 0 -or $legacyPreflightExitCode -ne 0) {
  Write-Host "`nEssay guardrails FAILED." -ForegroundColor Red
  exit 1
}

if ($StrictWarnings -and $warningResults.Count -gt 0) {
  Write-Host "`nEssay guardrails FAILED because StrictWarnings is enabled." -ForegroundColor Red
  exit 1
}

Write-Host "`nEssay guardrails PASSED." -ForegroundColor Green
exit 0
