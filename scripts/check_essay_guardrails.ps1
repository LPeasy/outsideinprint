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

  $ledgerPath = Join-Path $RepoRoot 'docs\editorial-audits\daily-backfill\ledger.json'
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

function Remove-TaxonomyFrontMatterFields {
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
    'collections',
    'collection_weight',
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

function Test-IsTaxonomyOnlyDiff {
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

  $beforeComparable = Normalize-GuardrailText -Text (Remove-TaxonomyFrontMatterFields -Text $beforeText)
  $afterComparable = Normalize-GuardrailText -Text (Remove-TaxonomyFrontMatterFields -Text $afterText)
  return ($beforeComparable -eq $afterComparable)
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
    return $generatedPwsh
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

$targetPaths = Resolve-TargetEssayPaths `
  -RepoRoot $Root `
  -ExplicitPaths $Paths `
  -FromRef $BaseRef `
  -ToRef $HeadRef `
  -ScanAll:$AllEssays

$targetPaths = @(Expand-EssayPaths -EssayPaths $targetPaths)

$taxonomyOnlyPaths = New-Object System.Collections.Generic.List[string]
if (
  (-not $AllEssays) -and
  (-not ($Paths -and $Paths.Count -gt 0)) -and
  (-not [string]::IsNullOrWhiteSpace($BaseRef)) -and
  ($BaseRef -notmatch '^0+$') -and
  (-not [string]::IsNullOrWhiteSpace($HeadRef))
) {
  $filteredTargets = New-Object System.Collections.Generic.List[string]
  foreach ($targetPath in $targetPaths) {
    if (Test-IsTaxonomyOnlyDiff -RepoRoot $Root -PathValue $targetPath -FromRef $BaseRef -ToRef $HeadRef) {
      $taxonomyOnlyPaths.Add((Get-RepoRelativePath -RepoRoot $Root -PathValue $targetPath))
      continue
    }

    $filteredTargets.Add($targetPath)
  }

  $targetPaths = $filteredTargets.ToArray()
}

if ($taxonomyOnlyPaths.Count -gt 0) {
  Write-Host ("Essay guardrails: skipped {0} taxonomy-only front matter change(s)." -f $taxonomyOnlyPaths.Count) -ForegroundColor Yellow
  foreach ($taxonomyPath in $taxonomyOnlyPaths) {
    Write-Host "  - $taxonomyPath" -ForegroundColor Yellow
  }
}

if ($targetPaths.Count -eq 0) {
  Write-Host 'Essay guardrails: no target files to check.' -ForegroundColor Yellow
  exit 0
}

$essayAuditPaths = @($targetPaths | Where-Object { Test-IsEssayContentPath -RepoRoot $Root -PathValue $_ })
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

  if ((-not [bool]$row.has_description) -and (-not [bool]$row.draft)) {
    if ($RequireDescription) {
      $rowBlockers += 'missing_description'
    } elseif (-not $baselineMissingDescription) {
      $rowWarnings += 'missing_description'
    }
  }

  if ($RequireFeaturedImage -and (-not [bool]$row.draft)) {
    $fullPath = Get-NormalizedRepoPath -RepoRoot $Root -PathValue ([string]$row.path)
    if ($fullPath -and -not (Test-FrontMatterHasSocialImage -Path $fullPath)) {
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

if ($RequireEditorialPhilosophyAudit) {
  foreach ($subject in $philosophyAuditSubjects) {
    if ([bool]$subject.Draft) {
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
Write-Host "  Essay cleanup targets: $($rows.Count)"
Write-Host "  Philosophy audit targets: $($philosophyAuditSubjects.Count)"
Write-Host "  Blocking files: $($blockingResults.Count)"
Write-Host "  Warning files: $($warningResults.Count)"
Write-Host "  Philosophy audit blocking files: $($philosophyAuditResults.Count)"
Write-Host "  Audit report: $($ReportBasePath).json"

foreach ($item in $blockingResults) {
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

$legacyPreflightExitCode = Invoke-LegacyImportPreflight `
  -RepoRoot $Root `
  -EssayPaths $essayAuditPaths `
  -GuardrailReportBasePath $ReportBasePath `
  -FailOnWarnings:$StrictWarnings

if ($blockingResults.Count -gt 0 -or $philosophyAuditResults.Count -gt 0 -or $legacyPreflightExitCode -ne 0) {
  Write-Host "`nEssay guardrails FAILED." -ForegroundColor Red
  exit 1
}

if ($StrictWarnings -and $warningResults.Count -gt 0) {
  Write-Host "`nEssay guardrails FAILED because StrictWarnings is enabled." -ForegroundColor Red
  exit 1
}

Write-Host "`nEssay guardrails PASSED." -ForegroundColor Green
exit 0
