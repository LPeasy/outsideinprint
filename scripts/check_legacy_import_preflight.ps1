param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ReportBasePath,
  [string[]]$Paths = @(),
  [string]$BatchPath = '',
  [switch]$AllEssays,
  [switch]$StrictWarnings
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ReportBasePath) {
  $ReportBasePath = Join-Path $Root 'reports\legacy-import-preflight'
}

$script:PunctuationArtifacts = @(
  [pscustomobject]@{ Code = 0x2018; Label = 'left smart apostrophe/quote' },
  [pscustomobject]@{ Code = 0x2019; Label = 'right smart apostrophe/quote' },
  [pscustomobject]@{ Code = 0x201C; Label = 'left smart double quote' },
  [pscustomobject]@{ Code = 0x201D; Label = 'right smart double quote' },
  [pscustomobject]@{ Code = 0x2013; Label = 'en dash' },
  [pscustomobject]@{ Code = 0x2014; Label = 'em dash' },
  [pscustomobject]@{ Code = 0x2009; Label = 'thin space' },
  [pscustomobject]@{ Code = 0x200A; Label = 'hair space' },
  [pscustomobject]@{ Code = 0x00E2; Label = 'mojibake marker 0x00E2' },
  [pscustomobject]@{ Code = 0x00C2; Label = 'mojibake marker 0x00C2' },
  [pscustomobject]@{ Code = 0xFFFD; Label = 'replacement character' }
)

$script:RemoteMediumImagePatterns = @(
  '!\[[^\]]*\]\(\s*(?:https?:)?//(?:cdn-images-\d+\.medium\.com|cdn-images\.medium\.com|miro\.medium\.com)[^)\s]*',
  '<img\b[^>]*\bsrc\s*=\s*["''](?:https?:)?//(?:cdn-images-\d+\.medium\.com|cdn-images\.medium\.com|miro\.medium\.com)[^"'']*["'']'
)

$script:DiscussionPromptPatterns = @(
  '(?i)\bwhat do you think\?',
  '(?i)\blet.{0,2}s discuss\b',
  '(?i)\bcomments below\b',
  '(?i)\bshare your thoughts\b',
  '(?i)\bjoin the discussion\b',
  '(?i)\btell (?:me|us) (?:what|your)[^\r\n]{0,80}\bcomments?\b'
)

$script:ReadMorePromptPatterns = @(
  '(?i)\bread more on medium\b',
  '(?i)\bcontinue reading on medium\b',
  '(?i)\bcontinue reading\b(?=[^\r\n]{0,80}\bmedium\b)'
)

$script:HeadingStopWords = @(
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into',
  'of', 'on', 'or', 'the', 'to', 'v', 'vs', 'with', 'without'
)

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

function Get-NormalizedRepoPath {
  param(
    [string]$RepoRoot,
    [string]$PathValue
  )

  if ([string]::IsNullOrWhiteSpace($PathValue)) { return $null }

  $candidate = $PathValue.Trim()
  if (-not [System.IO.Path]::IsPathRooted($candidate)) {
    $candidate = Join-Path $RepoRoot $candidate
  }

  if (-not (Test-Path $candidate)) { return $null }
  return [System.IO.Path]::GetFullPath((Resolve-Path $candidate).Path)
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

function Expand-EssayPaths {
  param([string[]]$EssayPaths)

  $expanded = New-Object System.Collections.Generic.List[string]
  foreach ($essayPath in $EssayPaths) {
    if (-not $essayPath) { continue }

    if (Test-Path $essayPath -PathType Container) {
      Get-ChildItem -Path $essayPath -File -Filter '*.md' -Recurse |
        Where-Object { $_.Name -ne '_index.md' } |
        ForEach-Object { $expanded.Add($_.FullName) }
      continue
    }

    $leaf = [System.IO.Path]::GetFileName($essayPath)
    if (($leaf -ne '_index.md') -and $leaf.EndsWith('.md', [System.StringComparison]::OrdinalIgnoreCase)) {
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

function Get-BatchEssayPaths {
  param(
    [string]$RepoRoot,
    [string]$BatchFile
  )

  $resolvedBatch = $BatchFile
  if (-not [System.IO.Path]::IsPathRooted($resolvedBatch)) {
    $resolvedBatch = Join-Path $RepoRoot $resolvedBatch
  }

  if (-not (Test-Path $resolvedBatch -PathType Leaf)) {
    throw "Missing selected essay batch: $resolvedBatch"
  }

  $batch = Get-Content $resolvedBatch -Raw | ConvertFrom-Json
  $paths = New-Object System.Collections.Generic.List[string]
  foreach ($essay in @($batch.essays)) {
    if ($null -ne $essay -and ($essay.PSObject.Properties.Name -contains 'source_file') -and -not [string]::IsNullOrWhiteSpace([string]$essay.source_file)) {
      $paths.Add([string]$essay.source_file)
    }
  }

  return $paths.ToArray()
}

function Get-WorkingTreeEssayPaths {
  param([string]$RepoRoot)

  $changed = @(& git -C $RepoRoot diff --name-only --diff-filter=ACMR HEAD -- content/essays 2>$null)
  $untracked = @(& git -C $RepoRoot ls-files --others --exclude-standard -- content/essays 2>$null)
  return @($changed + $untracked)
}

function Resolve-TargetEssayPaths {
  param(
    [string]$RepoRoot,
    [string[]]$ExplicitPaths,
    [string]$SelectedBatchPath,
    [switch]$ScanAll
  )

  $candidates = New-Object System.Collections.Generic.List[string]

  foreach ($rawPath in @($ExplicitPaths)) {
    foreach ($pathValue in @($rawPath -split ',' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
      $resolved = Get-NormalizedRepoPath -RepoRoot $RepoRoot -PathValue $pathValue
      if ($resolved) { $candidates.Add($resolved) }
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($SelectedBatchPath)) {
    foreach ($pathValue in (Get-BatchEssayPaths -RepoRoot $RepoRoot -BatchFile $SelectedBatchPath)) {
      $resolved = Get-NormalizedRepoPath -RepoRoot $RepoRoot -PathValue $pathValue
      if ($resolved) { $candidates.Add($resolved) }
    }
  } elseif ($candidates.Count -eq 0 -and -not $ScanAll) {
    $defaultBatch = Join-Path $RepoRoot '.oip-daily-batch.json'
    if (Test-Path $defaultBatch -PathType Leaf) {
      foreach ($pathValue in (Get-BatchEssayPaths -RepoRoot $RepoRoot -BatchFile $defaultBatch)) {
        $resolved = Get-NormalizedRepoPath -RepoRoot $RepoRoot -PathValue $pathValue
        if ($resolved) { $candidates.Add($resolved) }
      }
    } else {
      foreach ($pathValue in (Get-WorkingTreeEssayPaths -RepoRoot $RepoRoot)) {
        $resolved = Get-NormalizedRepoPath -RepoRoot $RepoRoot -PathValue $pathValue
        if ($resolved) { $candidates.Add($resolved) }
      }
    }
  }

  if ($ScanAll) {
    $essayRoot = Join-Path $RepoRoot 'content\essays'
    if (Test-Path $essayRoot -PathType Container) {
      $candidates.Add([System.IO.Path]::GetFullPath($essayRoot))
    }
  }

  return (Expand-EssayPaths -EssayPaths $candidates.ToArray())
}

function Split-Lines {
  param([string]$Text)

  if ($null -eq $Text -or $Text.Length -eq 0) {
    return @()
  }

  return [regex]::Split($Text, '\r\n|\n|\r')
}

function Get-BodySection {
  param([string]$Text)

  $match = [regex]::Match($Text, '\A---\s*\r?\n.*?\r?\n---\s*(?:\r?\n|$)', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $match.Success) {
    return [pscustomobject]@{
      Body = $Text
      LineOffset = 0
    }
  }

  $bodyStart = $match.Index + $match.Length
  $prefix = $Text.Substring(0, $bodyStart)
  return [pscustomobject]@{
    Body = $Text.Substring($bodyStart)
    LineOffset = [regex]::Matches($prefix, '\r\n|\n|\r').Count
  }
}

function Get-Excerpt {
  param([string]$Line)

  $excerpt = ($Line -replace '\s+', ' ').Trim()
  if ($excerpt.Length -gt 140) {
    return $excerpt.Substring(0, 137) + '...'
  }

  return $excerpt
}

function Add-Issue {
  param(
    [System.Collections.Generic.List[object]]$Issues,
    [string]$Type,
    [string]$Severity,
    [int]$LineNumber,
    [string]$Message,
    [string]$Line
  )

  $Issues.Add([pscustomobject]@{
    type = $Type
    severity = $Severity
    line = $LineNumber
    message = $Message
    excerpt = Get-Excerpt -Line $Line
  })
}

function Get-PunctuationArtifactLabels {
  param([string]$Line)

  $labels = New-Object System.Collections.Generic.List[string]
  foreach ($artifact in $script:PunctuationArtifacts) {
    $needle = [string][char]$artifact.Code
    if ($Line.Contains($needle)) {
      $labels.Add([string]$artifact.Label)
    }
  }

  return $labels.ToArray()
}

function Test-AnyRegexMatch {
  param(
    [string]$Line,
    [string[]]$Patterns
  )

  foreach ($pattern in $Patterns) {
    if ([regex]::IsMatch($Line, $pattern)) {
      return $true
    }
  }

  return $false
}

function Test-RemoteMediumBodyImage {
  param([string]$Line)

  return (Test-AnyRegexMatch -Line $Line -Patterns $script:RemoteMediumImagePatterns)
}

function Test-DiscussionPrompt {
  param([string]$Line)

  return (Test-AnyRegexMatch -Line $Line -Patterns $script:DiscussionPromptPatterns)
}

function Test-ReadMorePrompt {
  param([string]$Line)

  return (Test-AnyRegexMatch -Line $Line -Patterns $script:ReadMorePromptPatterns)
}

function Test-LegacyListMarker {
  param([string]$Line)

  $bullet = [regex]::Escape([string][char]0x2022)
  if ([regex]::IsMatch($Line, "^\s*(?:$bullet|[-*+]\s*$bullet)\s+")) { return $true }
  if ($Line -match '^\s*\d+\)\s+') { return $true }
  if ($Line -match '^\s*(?:[-*+]\s*)?\d+\.\t+') { return $true }
  if ($Line -match '^\s*(?:[-*+]\s*)?[IVXLCDM]+\.\t+') { return $true }
  if ($Line -match '^\s*#{1,6}\s+\d+\.\t+') { return $true }

  return $false
}

function Test-MarkdownImageLine {
  param([string]$Line)
  return $Line.Trim() -match '^!\[[^\]]*\]\([^)]+\)\s*$'
}

function Get-PreviousNonBlankLine {
  param(
    [string[]]$Lines,
    [int]$Index
  )

  for ($j = $Index - 1; $j -ge 0; $j--) {
    $candidate = [string]$Lines[$j]
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      return $candidate.Trim()
    }
  }

  return ''
}

function Get-NextNonBlankLine {
  param(
    [string[]]$Lines,
    [int]$Index
  )

  for ($j = $Index + 1; $j -lt $Lines.Count; $j++) {
    $candidate = [string]$Lines[$j]
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      return $candidate.Trim()
    }
  }

  return ''
}

function Test-PlainImageCaptionLine {
  param([string]$Line)

  $trimmed = $Line.Trim()
  return (
    $trimmed -match '^(?i)photo by .+ on (?:unsplash|pexels)$' -or
    $trimmed -match '^(?i)(?:source|caption|credit):\s+\S' -or
    $trimmed -match '^[^|]{2,90}\s+\|\s+(?i:Source|Credit):\s+\S'
  )
}

function Test-PlainImageCaptionAfterMarkdownImage {
  param(
    [string]$Line,
    [string]$PreviousContentLine
  )

  return (Test-MarkdownImageLine -Line $PreviousContentLine) -and (Test-PlainImageCaptionLine -Line $Line)
}

function Test-ColonLeadInLine {
  param(
    [string]$Line,
    [string]$NextContentLine
  )

  $trimmed = $Line.Trim()
  if ($trimmed -notmatch ':$') { return $false }
  if ($trimmed -match '^(?i:Introduction|Conclusion|Works Cited|References|Bibliography|Read More)\s*:?\s*$') { return $false }
  if ([string]::IsNullOrWhiteSpace($NextContentLine)) { return $false }

  return $true
}

function Test-NonHeadingLine {
  param([string]$Trimmed)

  if ([string]::IsNullOrWhiteSpace($Trimmed)) { return $true }
  if ($Trimmed -match '^(#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+|!\[|\[|<|\||```|~~~|---\s*$)') { return $true }
  if ($Trimmed -match '^(?i:Source|Caption|Photo|Image|Figure|Credit|Note):\s+') { return $true }
  if ($Trimmed -match '^https?://') { return $true }
  if ($Trimmed -match '^[-*_]{3,}\s*$') { return $true }

  return $false
}

function Test-PlainHeadingCandidate {
  param(
    [string]$Line,
    [string]$PreviousLine,
    [string]$NextLine,
    [string]$PreviousContentLine = '',
    [string]$NextContentLine = ''
  )

  $trimmed = $Line.Trim()
  if (Test-NonHeadingLine -Trimmed $trimmed) { return $false }
  if ($trimmed.Length -lt 3 -or $trimmed.Length -gt 120) { return $false }
  if ($trimmed -match '^(?i:Consider the following|The following|For example|Examples include):\s*$') { return $false }

  $hasBlankNeighbor = [string]::IsNullOrWhiteSpace($PreviousLine) -or [string]::IsNullOrWhiteSpace($NextLine)
  if (-not $hasBlankNeighbor) { return $false }

  if ($trimmed -match '^(?i:Introduction|Conclusion|Works Cited|References|Bibliography|Read More)\s*:?\s*$') { return $true }
  if ($trimmed -match '^(?:[IVXLCDM]+\.|[0-9]+\.|[A-Z]\.)\s+\S.{0,110}$') { return $true }
  if (Test-PlainImageCaptionAfterMarkdownImage -Line $trimmed -PreviousContentLine $PreviousContentLine) { return $false }
  if (Test-ColonLeadInLine -Line $trimmed -NextContentLine $NextContentLine) { return $false }
  if ($trimmed -match '[.!?;,]$') { return $false }
  if ($trimmed -notmatch '^[A-Z][A-Za-z0-9''()/:,&\-\s]{2,110}:?$') { return $false }

  $wordMatches = [regex]::Matches($trimmed, "[A-Za-z][A-Za-z0-9']*")
  if ($wordMatches.Count -lt 2 -or $wordMatches.Count -gt 14) { return $false }

  $scored = 0
  $titleLike = 0
  foreach ($match in $wordMatches) {
    $word = [string]$match.Value
    if ($word.Length -le 1) { continue }

    $scored++
    $lower = $word.ToLowerInvariant()
    if ($script:HeadingStopWords -contains $lower) {
      $titleLike++
      continue
    }
    if ([char]::IsUpper($word[0]) -or ($word -ceq $word.ToUpperInvariant())) {
      $titleLike++
    }
  }

  if ($scored -eq 0) { return $false }
  return (($titleLike / $scored) -ge 0.65)
}

function Scan-LegacyImportIssues {
  param(
    [string]$Path,
    [string]$RepoRoot
  )

  $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $issues = New-Object System.Collections.Generic.List[object]

  $bodySection = Get-BodySection -Text $text
  $bodyLines = @(Split-Lines -Text ([string]$bodySection.Body))
  $lineOffset = [int]$bodySection.LineOffset

  for ($i = 0; $i -lt $bodyLines.Count; $i++) {
    $line = [string]$bodyLines[$i]
    $lineNumber = $lineOffset + $i + 1

    $labels = @(Get-PunctuationArtifactLabels -Line $line)
    if ($labels.Count -gt 0) {
      Add-Issue `
        -Issues $issues `
        -Type 'medium_punctuation_artifact' `
        -Severity 'blocker' `
        -LineNumber $lineNumber `
        -Message ("Replace Medium smart punctuation or mojibake residue: {0}" -f (($labels | Sort-Object -Unique) -join ', ')) `
        -Line $line
    }

    if (Test-RemoteMediumBodyImage -Line $line) {
      Add-Issue `
        -Issues $issues `
        -Type 'remote_medium_body_image' `
        -Severity 'blocker' `
        -LineNumber $lineNumber `
        -Message 'Localize remote Medium body images under static/images/medium/<slug>/ before publishing.' `
        -Line $line
    }

    if (Test-DiscussionPrompt -Line $line) {
      Add-Issue `
        -Issues $issues `
        -Type 'medium_discussion_prompt' `
        -Severity 'blocker' `
        -LineNumber $lineNumber `
        -Message 'Remove imported Medium discussion/comment prompts from essay body copy.' `
        -Line $line
    }

    if (Test-ReadMorePrompt -Line $line) {
      Add-Issue `
        -Issues $issues `
        -Type 'medium_read_more_prompt' `
        -Severity 'blocker' `
        -LineNumber $lineNumber `
        -Message 'Remove Medium read-more prompts or convert real aftermatter into local Markdown.' `
        -Line $line
    }

    if (Test-LegacyListMarker -Line $line) {
      Add-Issue `
        -Issues $issues `
        -Type 'legacy_list_marker' `
        -Severity 'warning' `
        -LineNumber $lineNumber `
        -Message 'Normalize imported bullet, tabbed numbered, or fake-list formatting into Markdown list syntax.' `
        -Line $line
    }

    $previousLine = if ($i -gt 0) { [string]$bodyLines[$i - 1] } else { '' }
    $nextLine = if ($i + 1 -lt $bodyLines.Count) { [string]$bodyLines[$i + 1] } else { '' }
    $previousContentLine = Get-PreviousNonBlankLine -Lines $bodyLines -Index $i
    $nextContentLine = Get-NextNonBlankLine -Lines $bodyLines -Index $i
    if (Test-PlainHeadingCandidate -Line $line -PreviousLine $previousLine -NextLine $nextLine -PreviousContentLine $previousContentLine -NextContentLine $nextContentLine) {
      $trimmed = $line.Trim()
      $issueType = if ($trimmed -match '^(?i:Read More)\s*:?\s*$') { 'legacy_read_more_heading' } else { 'plain_heading_candidate' }
      Add-Issue `
        -Issues $issues `
        -Type $issueType `
        -Severity 'warning' `
        -LineNumber $lineNumber `
        -Message 'Convert imported standalone heading text into Markdown heading syntax when it is truly a section break.' `
        -Line $line
    }
  }

  return $issues.ToArray()
}

$targetPaths = @(Resolve-TargetEssayPaths `
  -RepoRoot $Root `
  -ExplicitPaths $Paths `
  -SelectedBatchPath $BatchPath `
  -ScanAll:$AllEssays)

if ($targetPaths.Count -eq 0) {
  Write-Host 'Legacy import preflight: no target essays to check.' -ForegroundColor Yellow
  exit 0
}

$fileResults = New-Object System.Collections.Generic.List[object]
foreach ($targetPath in $targetPaths) {
  $relativePath = Get-RepoRelativePath -RepoRoot $Root -PathValue $targetPath
  $issues = @(Scan-LegacyImportIssues -Path $targetPath -RepoRoot $Root)
  $blockerCount = @($issues | Where-Object { $_.severity -eq 'blocker' }).Count
  $warningCount = @($issues | Where-Object { $_.severity -eq 'warning' }).Count
  $fileResults.Add([pscustomobject]@{
    path = $relativePath
    issue_count = $issues.Count
    blocker_count = $blockerCount
    warning_count = $warningCount
    issues = $issues
  })
}

$filesWithIssues = @($fileResults | Where-Object { $_.issue_count -gt 0 })
$blockingFiles = @($fileResults | Where-Object { $_.blocker_count -gt 0 })
$warningFiles = @($fileResults | Where-Object { $_.warning_count -gt 0 })
$allIssues = @($fileResults | ForEach-Object { $_.issues } | Where-Object { $null -ne $_ })
$blockerIssueCount = @($allIssues | Where-Object { $_.severity -eq 'blocker' }).Count
$warningIssueCount = @($allIssues | Where-Object { $_.severity -eq 'warning' }).Count

$report = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  root = [System.IO.Path]::GetFullPath((Resolve-Path $Root).Path)
  target_count = $targetPaths.Count
  totals = [ordered]@{
    files_scanned = $targetPaths.Count
    files_with_issues = $filesWithIssues.Count
    blocking_files = $blockingFiles.Count
    warning_files = $warningFiles.Count
    blocker_issues = $blockerIssueCount
    warning_issues = $warningIssueCount
  }
  files = $fileResults.ToArray()
}

$jsonPath = $ReportBasePath + '.json'
$mdPath = $ReportBasePath + '.md'
Write-Utf8NoBom -Path $jsonPath -Content ($report | ConvertTo-Json -Depth 8)

$markdown = New-Object System.Collections.Generic.List[string]
$markdown.Add('# Legacy Import Preflight')
$markdown.Add('')
$markdown.Add(('- Generated: {0}' -f $report.generated_at))
$markdown.Add(('- Target essays: {0}' -f $report.target_count))
$markdown.Add(('- Blocking files: {0}' -f $report.totals.blocking_files))
$markdown.Add(('- Warning files: {0}' -f $report.totals.warning_files))
$markdown.Add('')

if ($filesWithIssues.Count -eq 0) {
  $markdown.Add('No legacy import preflight issues found.')
} else {
  $markdown.Add('## Findings')
  $markdown.Add('')
  foreach ($file in $filesWithIssues) {
    $markdown.Add(('- `{0}`: {1} blocker(s), {2} warning(s)' -f $file.path, $file.blocker_count, $file.warning_count))
    foreach ($issue in @($file.issues)) {
      $markdown.Add(('  - line {0}: `{1}` ({2}) - {3}' -f $issue.line, $issue.type, $issue.severity, $issue.message))
    }
  }
}

Write-Utf8NoBom -Path $mdPath -Content (($markdown -join [Environment]::NewLine) + [Environment]::NewLine)

Write-Host 'Legacy import preflight summary' -ForegroundColor Cyan
Write-Host "  Target essays: $($targetPaths.Count)"
Write-Host "  Blocking files: $($blockingFiles.Count)"
Write-Host "  Warning files: $($warningFiles.Count)"
Write-Host "  Report: $jsonPath"

foreach ($file in $blockingFiles) {
  Write-Host ''
  Write-Host "BLOCKER $($file.path)" -ForegroundColor Red
  foreach ($issue in @($file.issues | Where-Object { $_.severity -eq 'blocker' })) {
    Write-Host ("  - line {0}: {1}" -f $issue.line, $issue.type) -ForegroundColor Red
  }
}

foreach ($file in $warningFiles) {
  Write-Host ''
  Write-Host "WARNING $($file.path)" -ForegroundColor Yellow
  foreach ($issue in @($file.issues | Where-Object { $_.severity -eq 'warning' })) {
    Write-Host ("  - line {0}: {1}" -f $issue.line, $issue.type) -ForegroundColor Yellow
  }
}

if ($blockingFiles.Count -gt 0) {
  Write-Host "`nLegacy import preflight FAILED." -ForegroundColor Red
  exit 1
}

if ($StrictWarnings -and $warningFiles.Count -gt 0) {
  Write-Host "`nLegacy import preflight FAILED because StrictWarnings is enabled." -ForegroundColor Red
  exit 1
}

if ($warningFiles.Count -gt 0) {
  Write-Host "`nLegacy import preflight PASSED with warnings." -ForegroundColor Yellow
  exit 0
}

Write-Host "`nLegacy import preflight PASSED." -ForegroundColor Green
exit 0
