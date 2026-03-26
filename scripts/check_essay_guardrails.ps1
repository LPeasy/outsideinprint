param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ReportBasePath,
  [string[]]$Paths = @(),
  [string]$BaseRef = '',
  [string]$HeadRef = 'HEAD',
  [switch]$AllEssays,
  [switch]$StrictWarnings,
  [switch]$RequireDescription
)

$ErrorActionPreference = 'Stop'

if (-not $ReportBasePath) {
  $ReportBasePath = Join-Path $Root 'reports\essay-guardrails'
}

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

function Get-WorkingTreeEssayPaths {
  param([string]$RepoRoot)

  $changed = @(& git -C $RepoRoot diff --name-only --diff-filter=ACMR HEAD -- content/essays 2>$null)
  $untracked = @(& git -C $RepoRoot ls-files --others --exclude-standard -- content/essays 2>$null)
  return @($changed + $untracked)
}

function Get-DiffEssayPaths {
  param(
    [string]$RepoRoot,
    [string]$FromRef,
    [string]$ToRef
  )

  return @(& git -C $RepoRoot diff --name-only --diff-filter=ACMR $FromRef $ToRef -- content/essays 2>$null)
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
    $essayRoot = Join-Path $RepoRoot 'content\essays'
    if (Test-Path $essayRoot -PathType Container) {
      $candidates.Add([System.IO.Path]::GetFullPath($essayRoot))
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

$targetPaths = Resolve-TargetEssayPaths `
  -RepoRoot $Root `
  -ExplicitPaths $Paths `
  -FromRef $BaseRef `
  -ToRef $HeadRef `
  -ScanAll:$AllEssays

if ($targetPaths.Count -eq 0) {
  Write-Host 'Essay guardrails: no target essays to check.' -ForegroundColor Yellow
  exit 0
}

& $auditScript -Root $Root -Sections @('essays') -Paths $targetPaths -ReportBasePath $ReportBasePath | Out-Null
$report = Get-Content ($ReportBasePath + '.json') -Raw | ConvertFrom-Json
$rows = @($report.files)

if ($rows.Count -eq 0) {
  Write-Host 'Essay guardrails: audit produced no matching essay rows.' -ForegroundColor Yellow
  exit 0
}

$blockingIssues = @('duplicated_title','embed_remnants','mojibake','medium_cta')
$warningIssues = @('caption_residue','pseudo_headings','manual_bullets','fake_lists','source_dumps','ornamental_breaks','escaped_linebreaks','author_note')

$blockingResults = New-Object System.Collections.Generic.List[object]
$warningResults = New-Object System.Collections.Generic.List[object]

foreach ($row in $rows) {
  $issueTypes = @($row.issue_types)
  $rowBlockers = @($issueTypes | Where-Object { $blockingIssues -contains $_ })
  $rowWarnings = @($issueTypes | Where-Object { $warningIssues -contains $_ })

  if ((-not [bool]$row.has_description) -and (-not [bool]$row.draft)) {
    if ($RequireDescription) {
      $rowBlockers += 'missing_description'
    } else {
      $rowWarnings += 'missing_description'
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

Write-Host 'Essay guardrails summary' -ForegroundColor Cyan
Write-Host "  Target essays: $($rows.Count)"
Write-Host "  Blocking files: $($blockingResults.Count)"
Write-Host "  Warning files: $($warningResults.Count)"
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

if ($blockingResults.Count -gt 0) {
  Write-Host "`nEssay guardrails FAILED." -ForegroundColor Red
  exit 1
}

if ($StrictWarnings -and $warningResults.Count -gt 0) {
  Write-Host "`nEssay guardrails FAILED because StrictWarnings is enabled." -ForegroundColor Red
  exit 1
}

Write-Host "`nEssay guardrails PASSED." -ForegroundColor Green
exit 0
