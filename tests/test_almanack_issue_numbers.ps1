Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$almanackDir = Join-Path $repoRoot 'content\almanack'

function Get-FrontMatterScalar {
  param(
    [string] $FrontMatter,
    [string] $Key
  )

  $pattern = '(?m)^' + [regex]::Escape($Key) + ':\s*(.*?)\s*$'
  $match = [regex]::Match($FrontMatter, $pattern)
  if (-not $match.Success) {
    return ''
  }

  $value = $match.Groups[1].Value.Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    return $value.Substring(1, $value.Length - 2)
  }

  return $value
}

if (-not (Test-Path -LiteralPath $almanackDir)) {
  Write-Host 'No Almanack content directory found.'
  exit 0
}

$issues = New-Object System.Collections.Generic.List[object]

foreach ($file in Get-ChildItem -LiteralPath $almanackDir -Filter '*.md' | Where-Object { $_.Name -ne '_index.md' }) {
  $content = Get-Content -LiteralPath $file.FullName -Raw
  $frontMatterMatch = [regex]::Match($content, '(?s)^---\r?\n(.*?)\r?\n---')
  if (-not $frontMatterMatch.Success) {
    throw "$($file.FullName) must start with YAML front matter."
  }

  $frontMatter = $frontMatterMatch.Groups[1].Value
  $dateText = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'date'
  $issueNumberText = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'issue_number'

  if (-not $dateText) {
    throw "$($file.FullName) must define date."
  }

  try {
    $issueDate = [datetime]::ParseExact($dateText, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture).Date
  } catch {
    throw "$($file.FullName) date must use YYYY-MM-DD."
  }

  if ($issueNumberText -notmatch '^\d+$') {
    throw "$($file.FullName) issue_number must be a positive integer."
  }

  $issueNumber = [int]$issueNumberText
  if ($issueNumber -le 0) {
    throw "$($file.FullName) issue_number must be greater than zero."
  }

  $issues.Add([pscustomobject]@{
    Path = $file.FullName
    Date = $issueDate
    IssueNumber = $issueNumber
  })
}

$seenIssueNumbers = @{}
foreach ($issue in $issues) {
  if ($seenIssueNumbers.ContainsKey($issue.IssueNumber)) {
    throw "Duplicate Almanack issue_number $($issue.IssueNumber): $($seenIssueNumbers[$issue.IssueNumber]) and $($issue.Path)."
  }
  $seenIssueNumbers[$issue.IssueNumber] = $issue.Path
}

$expectedIssueNumber = 1
foreach ($issue in ($issues | Sort-Object Date)) {
  if ($issue.IssueNumber -ne $expectedIssueNumber) {
    throw "$($issue.Path) has issue_number $($issue.IssueNumber); expected $expectedIssueNumber by issue date order."
  }
  $expectedIssueNumber++
}

Write-Host 'Almanack issue number contract passed.'
