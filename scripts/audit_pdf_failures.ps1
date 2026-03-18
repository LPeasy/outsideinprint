param(
  [string]$ContentRoot = "./content/essays",
  [string]$BuildContentRoot = "./content",
  [string]$PdfRoot = "./static/pdfs",
  [string]$BuildMetaRoot = "./resources/typst_build",
  [string]$PdfCatalogPath = "./data/pdfs/catalog.json",
  [string]$PolicyPath = "./data/pdfs/validation-policy.json",
  [string]$LegacyAuditPath = "./reports/legacy-essay-audit.json",
  [string]$JsonOutputPath = "./reports/pdf-failure-audit.json",
  [string]$MarkdownOutputPath = "./reports/pdf-failure-audit.md",
  [switch]$Rebuild,
  [switch]$SkipToolChecks,
  [switch]$FailOnContentIssues
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Outside In Print ~ Audit PDF Failures" -ForegroundColor Cyan

function Read-Utf8Text {
  param([string]$Path)
  return [System.IO.File]::ReadAllText((Resolve-Path $Path), [System.Text.Encoding]::UTF8)
}

function Write-Utf8Text {
  param([string]$Path,[string]$Value)

  $dir = Split-Path -Path $Path -Parent
  if (-not [string]::IsNullOrWhiteSpace($dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }

  [System.IO.File]::WriteAllText($Path, $Value, [System.Text.UTF8Encoding]::new($false))
}

function Write-JsonFile {
  param([string]$Path,[object]$Value)
  Write-Utf8Text -Path $Path -Value ($Value | ConvertTo-Json -Depth 8)
}

function Get-FrontMatterMap {
  param([string]$Raw)

  $map = @{}
  $match = [regex]::Match($Raw, "(?ms)^---\s*\r?\n(.*?)\r?\n---\s*(\r?\n|$)")
  if (-not $match.Success) {
    return $map
  }

  foreach ($line in ($match.Groups[1].Value -split "`r?`n")) {
    if ($line -match "^\s*#") {
      continue
    }

    $kv = [regex]::Match($line, "^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$")
    if (-not $kv.Success) {
      continue
    }

    $value = $kv.Groups[2].Value.Trim()
    if (
      ($value.Length -ge 2) -and (
        (($value.StartsWith('"')) -and ($value.EndsWith('"'))) -or
        (($value.StartsWith("'")) -and ($value.EndsWith("'")))
      )
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $map[$kv.Groups[1].Value] = $value
  }

  return $map
}

function Get-ResolvedSlug {
  param([System.IO.FileInfo]$File,[string]$FrontMatterSlug)

  if (-not [string]::IsNullOrWhiteSpace($FrontMatterSlug)) {
    return $FrontMatterSlug.Trim()
  }

  return [System.IO.Path]::GetFileNameWithoutExtension($File.Name)
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -Path $Path -PathType Leaf)) {
    return $null
  }

  return (Read-Utf8Text -Path $Path | ConvertFrom-Json)
}

$policy = Read-JsonFile -Path $PolicyPath
if ($null -eq $policy) {
  throw "Missing PDF validation policy at '$PolicyPath'."
}

function Get-PolicyCodes {
  param(
    [object]$Policy,
    [string]$Name
  )

  if ($null -eq $Policy -or -not ($Policy.PSObject.Properties.Name -contains $Name)) {
    return @()
  }

  return @(
    $Policy.$Name |
      ForEach-Object { [string]$_ } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      ForEach-Object { $_.Trim().ToLowerInvariant() }
  )
}

function Get-ValidationStatus {
  param(
    [int]$BlockingPipelineProblemCount,
    [int]$BlockingFailureCount,
    [int]$WarningFailureCount,
    [switch]$TreatWarningsAsBlocking
  )

  if ($BlockingPipelineProblemCount -gt 0 -or $BlockingFailureCount -gt 0) {
    return "blocking"
  }

  if ($TreatWarningsAsBlocking -and $WarningFailureCount -gt 0) {
    return "blocking"
  }

  if ($WarningFailureCount -gt 0) {
    return "degraded_allowed"
  }

  return "success"
}

function Get-MetaStringValue {
  param(
    [object]$Meta,
    [string]$Name
  )

  if ($null -eq $Meta -or -not ($Meta.PSObject.Properties.Name -contains $Name)) {
    return ""
  }

  return [string]$Meta.$Name
}

function Get-MetaIntValue {
  param(
    [object]$Meta,
    [string]$Name
  )

  if ($null -eq $Meta -or -not ($Meta.PSObject.Properties.Name -contains $Name)) {
    return 0
  }

  return [int]$Meta.$Name
}

function Get-ReasonLabel {
  param([string]$Code)

  switch ($Code) {
    "remote_image_placeholder_typst" { return "invalid Typst remote-image placeholder" }
    "local_image_path_missing" { return "root-relative image path not localized for Typst" }
    "embed_remnant" { return "embed remnants still in PDF source" }
    "raw_html_complexity" { return "HTML-heavy import on Typst path" }
    "mojibake_content" { return "encoding artifacts survived normalization" }
    "metadata_missing" { return "missing build metadata" }
    "pdf_missing" { return "missing generated PDF" }
    default { return "unknown fallback" }
  }
}

function Get-FailureReasonCode {
  param(
    [object]$Meta,
    [string]$Stderr,
    [bool]$PdfExists
  )

  if (-not $PdfExists) {
    return "pdf_missing"
  }

  if ($null -eq $Meta) {
    return "metadata_missing"
  }

  if ([string]$Meta.render_status -ne "fallback") {
    return ""
  }

  if (($Stderr -match '(?is)error:\s+file not found') -and ($Stderr -match '(?is)image\("')) {
    return "local_image_path_missing"
  }

  if (($Stderr -match '(?is)unexpected argument') -and ($Stderr -match 'Image kept on web edition only\.') -and ((Get-MetaIntValue -Meta $Meta -Name "omitted_remote_images") -gt 0)) {
    return "remote_image_placeholder_typst"
  }

  if ((Get-MetaStringValue -Meta $Meta -Name "failure_cause") -eq "embed" -or (Get-MetaIntValue -Meta $Meta -Name "embed_count") -gt 0) {
    return "embed_remnant"
  }

  if ((Get-MetaStringValue -Meta $Meta -Name "failure_cause") -eq "raw_html" -or (Get-MetaIntValue -Meta $Meta -Name "raw_html_score") -ge 14) {
    return "raw_html_complexity"
  }

  if ((Get-MetaStringValue -Meta $Meta -Name "failure_cause") -eq "mojibake") {
    return "mojibake_content"
  }

  return "unknown_fallback"
}

function Get-FailureMessage {
  param(
    [string]$ReasonCode,
    [object]$Meta
  )

  switch ($ReasonCode) {
    "remote_image_placeholder_typst" {
      return "Typst failed on the generated 'Image kept on web edition only.' placeholder after $(Get-MetaIntValue -Meta $Meta -Name "omitted_remote_images") remote image(s) were omitted."
    }
    "local_image_path_missing" {
      return "Typst tried to resolve an /images/... reference as a filesystem path and could not find the asset from the compile root."
    }
    "embed_remnant" {
      return "The body still contains embed or iframe remnants that the Typst path cannot render cleanly."
    }
    "raw_html_complexity" {
      return "The article remained on the Typst path despite a high HTML-complexity profile and fell back to the archival edition."
    }
    "mojibake_content" {
      return "The article still contains encoding artifacts that survived normalization and degraded the Typst conversion."
    }
    "metadata_missing" {
      return "No per-essay build metadata was found, so the PDF outcome cannot be diagnosed from the last build."
    }
    "pdf_missing" {
      return "The expected PDF file was not generated."
    }
    default {
      $failureMessage = Get-MetaStringValue -Meta $Meta -Name "failure_message"
      if (-not [string]::IsNullOrWhiteSpace($failureMessage)) {
        return $failureMessage
      }
      return "The PDF builder fell back, but the stored metadata does not identify a stronger reason code."
    }
  }
}

$pipelineProblems = New-Object System.Collections.Generic.List[object]

if ($Rebuild) {
  try {
    & (Join-Path $PSScriptRoot "build_pdfs_typst_shared.ps1") -Mode "Audit" -ContentRoot $BuildContentRoot -PdfOutDir $PdfRoot -TempDir $BuildMetaRoot -PdfCatalogPath $PdfCatalogPath
  }
  catch {
    $pipelineProblems.Add([pscustomobject]@{
        code = "build_invocation_failed"
        count = 1
        message = $_.Exception.Message
      })
  }
}

$toolStatus = @()
if (-not $SkipToolChecks) {
  foreach ($name in @("pandoc", "typst", "node", "hugo")) {
    $available = $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
    $toolStatus += [pscustomobject]@{
      name = $name
      available = $available
    }
    if (-not $available) {
      $pipelineProblems.Add([pscustomobject]@{
          code = "tool_missing"
          count = 1
          message = "Missing required command '$name' in PATH."
        })
    }
  }
}

$legacyAudit = Read-JsonFile -Path $LegacyAuditPath
$legacyBySlug = @{}
if ($null -ne $legacyAudit -and $legacyAudit.PSObject.Properties.Name -contains "files") {
  foreach ($entry in $legacyAudit.files) {
    $legacyBySlug[[string]$entry.slug] = $entry
  }
}

$essayFiles = Get-ChildItem -Path $ContentRoot -File -Filter "*.md" | Where-Object { $_.Name -ne "_index.md" }
$rows = New-Object System.Collections.Generic.List[object]

foreach ($file in $essayFiles) {
  $raw = Read-Utf8Text -Path $file.FullName
  $frontMatter = Get-FrontMatterMap -Raw $raw
  $slug = Get-ResolvedSlug -File $file -FrontMatterSlug ($frontMatter["slug"])
  $pdfPath = Join-Path $PdfRoot "$slug.pdf"
  $metaPath = Join-Path $BuildMetaRoot "$slug.pdfmeta.json"
  $stderrPath = Join-Path $BuildMetaRoot "$slug.primary-compile.stderr.txt"
  $meta = Read-JsonFile -Path $metaPath
  $stderr = if (Test-Path -Path $stderrPath -PathType Leaf) { Read-Utf8Text -Path $stderrPath } else { "" }
  $pdfExists = Test-Path -Path $pdfPath -PathType Leaf
  $warnings = @()
  if ($null -ne $meta -and $meta.PSObject.Properties.Name -contains "warnings") {
    $warnings = @($meta.warnings)
  }
  $reasonCode = Get-FailureReasonCode -Meta $meta -Stderr $stderr -PdfExists $pdfExists
  $legacy = if ($legacyBySlug.ContainsKey($slug)) { $legacyBySlug[$slug] } else { $null }

  $rows.Add([pscustomobject]@{
      file = $file.Name
      slug = $slug
      title = [string]$frontMatter["title"]
      pdf_exists = $pdfExists
      engine = Get-MetaStringValue -Meta $meta -Name "engine"
      render_status = Get-MetaStringValue -Meta $meta -Name "render_status"
      reason_code = $reasonCode
      reason_label = Get-ReasonLabel -Code $reasonCode
      exact_reason = Get-FailureMessage -ReasonCode $reasonCode -Meta $meta
      failure_detail = Get-MetaStringValue -Meta $meta -Name "failure_detail"
      raw_html_score = Get-MetaIntValue -Meta $meta -Name "raw_html_score"
      omitted_remote_images = Get-MetaIntValue -Meta $meta -Name "omitted_remote_images"
      embed_count = Get-MetaIntValue -Meta $meta -Name "embed_count"
      auto_html_unavailable = ($warnings -contains "auto_html_unavailable")
      legacy_issue_types = if ($null -ne $legacy) { [string]$legacy.issue_types } else { "" }
      legacy_risk_tier = if ($null -ne $legacy) { [string]$legacy.risk_tier } else { "" }
    })
}

$failures = @($rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_.reason_code) })
$topCategories = @(
  $failures |
    Group-Object reason_code |
    Sort-Object Count -Descending |
    ForEach-Object {
      [pscustomobject]@{
        code = $_.Name
        label = Get-ReasonLabel -Code $_.Name
        count = $_.Count
      }
    }
)

$remotePlaceholderCount = @($failures | Where-Object { $_.reason_code -eq "remote_image_placeholder_typst" }).Count
if ($remotePlaceholderCount -gt 0) {
  $pipelineProblems.Add([pscustomobject]@{
      code = "invalid_typst_placeholder"
      count = $remotePlaceholderCount
      message = "The builder emitted an invalid Typst placeholder for omitted remote images, turning skipped web-only images into fallback renders."
    })
}

$localImageCount = @($failures | Where-Object { $_.reason_code -eq "local_image_path_missing" }).Count
if ($localImageCount -gt 0) {
  $pipelineProblems.Add([pscustomobject]@{
      code = "root_relative_image_resolution"
      count = $localImageCount
      message = "Root-relative /images/... assets survived into Typst instead of being localized to compile-time paths."
    })
}

$autoHtmlBlocked = @($rows | Where-Object { $_.auto_html_unavailable }).Count
if ($autoHtmlBlocked -gt 0) {
  $pipelineProblems.Add([pscustomobject]@{
      code = "auto_html_renderer_unavailable"
      count = $autoHtmlBlocked
      message = "HTML-heavy essays were auto-routed toward browser print, but the renderer was unavailable and they were forced back onto Typst."
    })
}

$blockingPipelineProblemCodes = @(Get-PolicyCodes -Policy $policy -Name "blocking_pipeline_problem_codes")
$blockingFailureReasonCodes = @(Get-PolicyCodes -Policy $policy -Name "blocking_failure_reason_codes")
$warningFailureReasonCodes = @(Get-PolicyCodes -Policy $policy -Name "warning_failure_reason_codes")
$manualDiagnosticSections = @(Get-PolicyCodes -Policy $policy -Name "manual_diagnostic_sections")

$unclassifiedFailures = @(
  $failures | Where-Object {
    $reasonCode = ([string]$_.reason_code).Trim().ToLowerInvariant()
    ($blockingFailureReasonCodes -notcontains $reasonCode) -and
    ($warningFailureReasonCodes -notcontains $reasonCode)
  }
)

if ($unclassifiedFailures.Count -gt 0) {
  $unknownReasonCodes = @(
    $unclassifiedFailures |
      ForEach-Object { ([string]$_.reason_code).Trim().ToLowerInvariant() } |
      Sort-Object -Unique
  )
  $pipelineProblems.Add([pscustomobject]@{
      code = "unclassified_failure_reason"
      count = $unclassifiedFailures.Count
      message = "Audit failures used reason codes that are not classified by '$PolicyPath': $($unknownReasonCodes -join ', ')."
    })
}

$blockingPipelineProblems = @(
  $pipelineProblems | Where-Object {
    $blockingPipelineProblemCodes -contains ([string]$_.code).Trim().ToLowerInvariant()
  }
)

$blockingFailures = @(
  $failures | Where-Object {
    $blockingFailureReasonCodes -contains ([string]$_.reason_code).Trim().ToLowerInvariant()
  }
)

$warningFailures = @(
  $failures | Where-Object {
    $warningFailureReasonCodes -contains ([string]$_.reason_code).Trim().ToLowerInvariant()
  }
)

$validationStatus = Get-ValidationStatus `
  -BlockingPipelineProblemCount $blockingPipelineProblems.Count `
  -BlockingFailureCount $blockingFailures.Count `
  -WarningFailureCount $warningFailures.Count `
  -TreatWarningsAsBlocking:$FailOnContentIssues

$representativeFailures = @(
  $failures |
    Sort-Object @{ Expression = "reason_code"; Ascending = $true }, @{ Expression = "raw_html_score"; Descending = $true }, @{ Expression = "omitted_remote_images"; Descending = $true }, @{ Expression = "slug"; Ascending = $true } |
    Select-Object -First 15
)

$contentSummary = $null
if ($null -ne $legacyAudit) {
  $contentSummary = [pscustomobject]@{
    affected_files = [int]$legacyAudit.totals.affected_files
    scanned_files = [int]$legacyAudit.totals.scanned_files
    issue_categories = @(
      $legacyAudit.issue_categories |
        Sort-Object affected_files -Descending |
        Select-Object @{ Name = "code"; Expression = { [string]$_.issue_type } }, @{ Name = "count"; Expression = { [int]$_.affected_files } }
    )
    risk_tiers = @(
      $legacyAudit.risk_tiers |
        Sort-Object file_count -Descending |
        Select-Object @{ Name = "tier"; Expression = { [string]$_.risk_tier } }, @{ Name = "count"; Expression = { [int]$_.file_count } }
    )
  }
}

$report = [ordered]@{
  generated_at = (Get-Date).ToString("o")
  scope = "essays"
  policy = [ordered]@{
    path = $PolicyPath
    blocking_pipeline_problem_codes = $blockingPipelineProblemCodes
    blocking_failure_reason_codes = $blockingFailureReasonCodes
    warning_failure_reason_codes = $warningFailureReasonCodes
    manual_diagnostic_sections = $manualDiagnosticSections
    fail_on_content_issues = [bool]$FailOnContentIssues
  }
  toolchain = [ordered]@{
    powershell_host = $PSVersionTable.PSVersion.ToString()
    commands = $toolStatus
  }
  summary = [ordered]@{
    essays_scanned = $rows.Count
    pdfs_expected = $rows.Count
    pdfs_generated = @($rows | Where-Object pdf_exists).Count
    failures = $failures.Count
    primary = @($rows | Where-Object { $_.render_status -eq "primary" }).Count
    fallback = @($rows | Where-Object { $_.render_status -eq "fallback" }).Count
    auto_html_candidates_blocked = $autoHtmlBlocked
    validation_status = $validationStatus
    blocking_pipeline_problems = $blockingPipelineProblems.Count
    blocking_failures = $blockingFailures.Count
    warning_failures = $warningFailures.Count
  }
  top_failure_categories = $topCategories
  pipeline_problems = $pipelineProblems
  content_problems = $contentSummary
  representative_failures = $representativeFailures
  failures = $failures
}

Write-JsonFile -Path $JsonOutputPath -Value $report

$markdown = New-Object System.Text.StringBuilder
[void]$markdown.AppendLine("# PDF Failure Audit")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
[void]$markdown.AppendLine("- Essays scanned: $($report.summary.essays_scanned)")
[void]$markdown.AppendLine("- PDFs expected: $($report.summary.pdfs_expected)")
[void]$markdown.AppendLine("- PDFs generated: $($report.summary.pdfs_generated)")
[void]$markdown.AppendLine("- Failures: $($report.summary.failures)")
[void]$markdown.AppendLine("- Primary renders: $($report.summary.primary)")
[void]$markdown.AppendLine("- Fallback renders: $($report.summary.fallback)")
[void]$markdown.AppendLine("- Auto-HTML candidates blocked by missing renderer: $($report.summary.auto_html_candidates_blocked)")
[void]$markdown.AppendLine("- Validation status: $($report.summary.validation_status)")
[void]$markdown.AppendLine("- Blocking pipeline problems: $($report.summary.blocking_pipeline_problems)")
[void]$markdown.AppendLine("- Blocking failures: $($report.summary.blocking_failures)")
[void]$markdown.AppendLine("- Warning-only failures: $($report.summary.warning_failures)")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("## Validation Policy")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("- Policy file: $PolicyPath")
[void]$markdown.AppendLine("- Blocking pipeline problem codes: $($blockingPipelineProblemCodes -join ', ')")
[void]$markdown.AppendLine("- Blocking failure reason codes: $($blockingFailureReasonCodes -join ', ')")
[void]$markdown.AppendLine("- Warning-only failure reason codes: $($warningFailureReasonCodes -join ', ')")
[void]$markdown.AppendLine("- Manual diagnostics: $($manualDiagnosticSections -join ', ')")
[void]$markdown.AppendLine("- Fail on content issues override: $([bool]$FailOnContentIssues)")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("## Top Failure Categories")
[void]$markdown.AppendLine()
foreach ($category in $topCategories) {
  [void]$markdown.AppendLine("- $($category.code): $($category.count) ($($category.label))")
}
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("## Pipeline / Tooling Problems")
[void]$markdown.AppendLine()
if ($pipelineProblems.Count -eq 0) {
  [void]$markdown.AppendLine("- None detected.")
} else {
  foreach ($problem in $pipelineProblems) {
    [void]$markdown.AppendLine("- $($problem.code): $($problem.count) :: $($problem.message)")
  }
}
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("## Content Problems")
[void]$markdown.AppendLine()
if ($null -eq $contentSummary) {
  [void]$markdown.AppendLine("- Legacy essay audit not available.")
} else {
  [void]$markdown.AppendLine("- Affected files: $($contentSummary.affected_files) of $($contentSummary.scanned_files)")
  foreach ($issue in ($contentSummary.issue_categories | Select-Object -First 8)) {
    [void]$markdown.AppendLine("- $($issue.code): $($issue.count)")
  }
}
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("## Representative Failures")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("| File | Reason | Detail | Legacy issues |")
[void]$markdown.AppendLine("| --- | --- | --- | --- |")
foreach ($row in $representativeFailures) {
  $detail = if (-not [string]::IsNullOrWhiteSpace($row.failure_detail)) { $row.failure_detail } else { $row.exact_reason }
  $detail = ($detail -replace '\|', '\|')
  $issues = if (-not [string]::IsNullOrWhiteSpace($row.legacy_issue_types)) { $row.legacy_issue_types } else { "-" }
  [void]$markdown.AppendLine("| $($row.file) | $($row.reason_code) | $detail | $issues |")
}

Write-Utf8Text -Path $MarkdownOutputPath -Value $markdown.ToString()

Write-Host "JSON report: $JsonOutputPath"
Write-Host "Markdown report: $MarkdownOutputPath"
Write-Host "Validation status: $validationStatus"
Write-Host "  Blocking pipeline problems: $($blockingPipelineProblems.Count)"
Write-Host "  Blocking failures: $($blockingFailures.Count)"
Write-Host "  Warning-only failures: $($warningFailures.Count)"

switch ($validationStatus) {
  "blocking" {
    Write-Host "`nPDF failure audit status: BLOCKING." -ForegroundColor Red
    exit 1
  }
  "degraded_allowed" {
    Write-Host "`nPDF failure audit status: DEGRADED_ALLOWED." -ForegroundColor Yellow
    exit 0
  }
  default {
    Write-Host "`nPDF failure audit status: SUCCESS." -ForegroundColor Green
    exit 0
  }
}
