param(
  [string]$ContentRoot = "./content",
  [string]$PdfRoot = "./static/pdfs",
  [string]$BuildMetaRoot = "./resources/typst_build",
  [int]$MinPdfBytes = 256,
  [switch]$SkipToolChecks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Outside In Print ~ Verify PDF Pipeline" -ForegroundColor Cyan

$AllowedSections = @("essays", "literature", "reports", "syd-and-oliver", "working-papers")
$HtmlSiteDir = Join-Path $BuildMetaRoot "__html_site"
$failures = New-Object System.Collections.Generic.List[object]
$summary = [ordered]@{
  total = 0
  html = 0
  typst = 0
  typst_fallback = 0
  failures = 0
}

function Read-Utf8Text {
  param([string]$Path)
  return [System.IO.File]::ReadAllText((Resolve-Path $Path), [System.Text.Encoding]::UTF8)
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -Path $Path -PathType Leaf)) {
    return $null
  }

  return (Read-Utf8Text -Path $Path | ConvertFrom-Json)
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

function Get-RelativePath {
  param([string]$RootPath,[string]$FullPath)

  $root = [System.IO.Path]::GetFullPath($RootPath)
  $full = [System.IO.Path]::GetFullPath($FullPath)

  if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($root.Length).TrimStart('\', '/')
  }

  return $full
}

function Get-SectionFromFile {
  param([string]$RootPath,[System.IO.FileInfo]$File)

  $relativePath = Get-RelativePath -RootPath $RootPath -FullPath $File.FullName
  $segments = $relativePath -split "[\\/]"
  if ($segments.Length -gt 1) {
    return $segments[0]
  }

  return ""
}

function Get-ResolvedSlug {
  param([System.IO.FileInfo]$File,[string]$FrontMatterSlug)

  if (-not [string]::IsNullOrWhiteSpace($FrontMatterSlug)) {
    return $FrontMatterSlug.Trim()
  }

  $fileSlug = [System.IO.Path]::GetFileNameWithoutExtension($File.Name)
  if ($fileSlug -ieq "index") {
    return [System.IO.Path]::GetFileName($File.DirectoryName)
  }

  return $fileSlug
}

function Is-TrueValue {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }

  return $Value.Trim() -match "^(?i:true|yes|1)$"
}

function Register-Failure {
  param(
    [string]$Category,
    [string]$Slug,
    [string]$Engine,
    [string]$Message
  )

  $script:failures.Add([pscustomobject]@{
      Category = $Category
      Slug = $Slug
      Engine = $Engine
      Message = $Message
    })
}

function Test-PdfSignature {
  param([string]$Path)

  $stream = [System.IO.File]::OpenRead((Resolve-Path $Path))
  try {
    $buffer = New-Object byte[] 5
    $read = $stream.Read($buffer, 0, $buffer.Length)
    if ($read -lt 5) {
      return $false
    }

    return ([System.Text.Encoding]::ASCII.GetString($buffer) -eq "%PDF-")
  }
  finally {
    $stream.Dispose()
  }
}

function Resolve-HtmlArtifactPath {
  param(
    [string]$Slug,
    [string]$Section,
    [object]$BuildMeta
  )

  if ($null -ne $BuildMeta -and $BuildMeta.PSObject.Properties.Name -contains "source_path" -and -not [string]::IsNullOrWhiteSpace([string]$BuildMeta.source_path)) {
    $sourcePath = ([string]$BuildMeta.source_path).Trim()
    $trimmed = $sourcePath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
      return (Join-Path $HtmlSiteDir "index.html")
    }

    $normalized = $trimmed -replace '/', [System.IO.Path]::DirectorySeparatorChar
    if ($sourcePath.EndsWith('/')) {
      return (Join-Path $HtmlSiteDir (Join-Path $normalized "index.html"))
    }

    return (Join-Path $HtmlSiteDir $normalized)
  }

  foreach ($candidate in @(
      (Join-Path $HtmlSiteDir "$Section/$Slug/index.html"),
      (Join-Path $HtmlSiteDir "$Section/$Slug.html"),
      (Join-Path $HtmlSiteDir "$Slug/index.html")
    )) {
    if (Test-Path -Path $candidate -PathType Leaf) {
      return $candidate
    }
  }

  return ""
}

function Test-RequiredTool {
  param(
    [string]$Name,
    [string]$Reason
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Register-Failure -Category "tool_missing" -Slug "(toolchain)" -Engine "n/a" -Message "Missing required command '$Name' for $Reason. Install it and ensure it is in PATH."
  }
}

$pages = New-Object System.Collections.Generic.List[object]
$mdFiles = Get-ChildItem -Path $ContentRoot -Recurse -File -Filter "*.md" |
  Where-Object {
    $_.Name -ne "_index.md" -and
    ($AllowedSections -contains (Get-SectionFromFile -RootPath $ContentRoot -File $_))
  }

foreach ($file in $mdFiles) {
  $frontMatter = Get-FrontMatterMap -Raw (Read-Utf8Text -Path $file.FullName)
  if ($frontMatter.Count -eq 0 -or (Is-TrueValue -Value $frontMatter["draft"])) {
    continue
  }

  if (-not $frontMatter.ContainsKey("pdf") -or [string]::IsNullOrWhiteSpace($frontMatter["pdf"])) {
    continue
  }

  $slug = Get-ResolvedSlug -File $file -FrontMatterSlug ($frontMatter["slug"])
  if ([string]::IsNullOrWhiteSpace($slug)) {
    Register-Failure -Category "slug_missing" -Slug "(unknown)" -Engine "n/a" -Message "Could not resolve a slug for '$($file.FullName)'."
    continue
  }

  $buildMetaPath = Join-Path $BuildMetaRoot "$slug.pdfmeta.json"
  $buildMeta = Read-JsonFile -Path $buildMetaPath
  $engine = if ($null -ne $buildMeta -and $buildMeta.PSObject.Properties.Name -contains "engine" -and -not [string]::IsNullOrWhiteSpace([string]$buildMeta.engine)) {
    ([string]$buildMeta.engine).Trim().ToLowerInvariant()
  }
  elseif ($frontMatter.ContainsKey("pdf_engine") -and -not [string]::IsNullOrWhiteSpace($frontMatter["pdf_engine"])) {
    $frontMatter["pdf_engine"].Trim().ToLowerInvariant()
  }
  else {
    "typst"
  }

  $pages.Add([pscustomobject]@{
      File = $file
      Section = Get-SectionFromFile -RootPath $ContentRoot -File $file
      Slug = $slug
      Engine = $engine
      DeclaredPdf = [string]$frontMatter["pdf"]
      ExpectedPdf = "/pdfs/$slug.pdf"
      PdfPath = Join-Path $PdfRoot "$slug.pdf"
      BuildMetaPath = $buildMetaPath
      BuildMeta = $buildMeta
    })
}

if (-not $SkipToolChecks) {
  if (@($pages | Where-Object { $_.Engine -eq "html" }).Count -gt 0) {
    Test-RequiredTool -Name "node" -Reason "browser-print PDF verification"
    Test-RequiredTool -Name "hugo" -Reason "browser-print PDF verification"
  }

  if (@($pages | Where-Object { $_.Engine -eq "typst" }).Count -gt 0) {
    Test-RequiredTool -Name "pandoc" -Reason "Typst PDF verification"
    Test-RequiredTool -Name "typst" -Reason "Typst PDF verification"
  }
}

foreach ($page in $pages) {
  $summary.total++
  switch ($page.Engine) {
    "html" { $summary.html++ }
    "typst" { $summary.typst++ }
    default {
      Register-Failure -Category "engine_invalid" -Slug $page.Slug -Engine $page.Engine -Message "Unsupported engine '$($page.Engine)' in verification. Check front matter or build metadata."
      continue
    }
  }

  if ($page.DeclaredPdf -ne $page.ExpectedPdf) {
    Register-Failure -Category "path_mismatch" -Slug $page.Slug -Engine $page.Engine -Message "Front matter declares '$($page.DeclaredPdf)' but slug '$($page.Slug)' must publish to '$($page.ExpectedPdf)'."
  }

  if ($null -eq $page.BuildMeta) {
    Register-Failure -Category "metadata_missing" -Slug $page.Slug -Engine $page.Engine -Message "Missing build metadata '$($page.BuildMetaPath)'. Re-run the PDF build so the renderer records diagnostics."
  }

  if (-not (Test-Path -Path $page.PdfPath -PathType Leaf)) {
    $detail = if ($null -ne $page.BuildMeta -and $page.BuildMeta.PSObject.Properties.Name -contains "failure_detail" -and -not [string]::IsNullOrWhiteSpace([string]$page.BuildMeta.failure_detail)) {
      " Detail: $([string]$page.BuildMeta.failure_detail)"
    }
    else {
      ""
    }
    Register-Failure -Category "missing_pdf" -Slug $page.Slug -Engine $page.Engine -Message "Expected PDF '$($page.PdfPath)' was not generated.$detail Re-run the PDF build and inspect '$($page.BuildMetaPath)'."
    continue
  }

  $pdfInfo = Get-Item -LiteralPath $page.PdfPath
  if ($pdfInfo.Length -lt $MinPdfBytes) {
    Register-Failure -Category "pdf_too_small" -Slug $page.Slug -Engine $page.Engine -Message "Generated PDF '$($page.PdfPath)' is only $($pdfInfo.Length) bytes. This usually means the render failed early or wrote an empty/corrupt file."
  }

  if (-not (Test-PdfSignature -Path $page.PdfPath)) {
    Register-Failure -Category "pdf_signature_invalid" -Slug $page.Slug -Engine $page.Engine -Message "Generated file '$($page.PdfPath)' does not start with '%PDF-'. The file is missing or corrupt."
  }

  if ($page.Engine -eq "html") {
    if (-not (Test-Path -Path $HtmlSiteDir -PathType Container)) {
      Register-Failure -Category "html_site_missing" -Slug $page.Slug -Engine $page.Engine -Message "Expected browser-print site output at '$HtmlSiteDir' was not found. Confirm the Hugo localhost build completed during PDF generation."
      continue
    }

    $htmlArtifactPath = Resolve-HtmlArtifactPath -Slug $page.Slug -Section $page.Section -BuildMeta $page.BuildMeta
    if ([string]::IsNullOrWhiteSpace($htmlArtifactPath) -or -not (Test-Path -Path $htmlArtifactPath -PathType Leaf)) {
      Register-Failure -Category "html_source_missing" -Slug $page.Slug -Engine $page.Engine -Message "Could not locate rendered Hugo HTML for '$($page.Section)/$($page.Slug)' under '$HtmlSiteDir'. Re-run the browser-print build and inspect '$($page.BuildMetaPath)'."
    }

    if ($null -ne $page.BuildMeta -and $page.BuildMeta.PSObject.Properties.Name -contains "render_status" -and ([string]$page.BuildMeta.render_status) -ne "primary") {
      Register-Failure -Category "html_render_status" -Slug $page.Slug -Engine $page.Engine -Message "HTML engine finished with render_status='$([string]$page.BuildMeta.render_status)'. Expected 'primary'."
    }
  }

  if ($page.Engine -eq "typst" -and $null -ne $page.BuildMeta -and $page.BuildMeta.PSObject.Properties.Name -contains "render_status") {
    $renderStatus = [string]$page.BuildMeta.render_status
    if ($renderStatus -eq "fallback") {
      $summary.typst_fallback++
      $failureCause = if ($page.BuildMeta.PSObject.Properties.Name -contains "failure_cause") { [string]$page.BuildMeta.failure_cause } else { "" }
      $failureDetail = if ($page.BuildMeta.PSObject.Properties.Name -contains "failure_detail") { [string]$page.BuildMeta.failure_detail } else { "" }
      if ([string]::IsNullOrWhiteSpace($failureCause) -or [string]::IsNullOrWhiteSpace($failureDetail)) {
        Register-Failure -Category "typst_fallback_unexplained" -Slug $page.Slug -Engine $page.Engine -Message "Typst fell back but '$($page.BuildMetaPath)' does not include both failure_cause and failure_detail."
      }
    }
  }
}

$summary.failures = $failures.Count

Write-Host "`nVerification summary:" -ForegroundColor Cyan
Write-Host "  Pages requiring PDFs: $($summary.total)"
Write-Host "  HTML-engine pages: $($summary.html)"
Write-Host "  Typst-engine pages: $($summary.typst)"
Write-Host "  Typst fallbacks observed: $($summary.typst_fallback)"
Write-Host "  Failures: $($summary.failures)"

if ($failures.Count -gt 0) {
  Write-Host "`nVerification failures:" -ForegroundColor Red
  foreach ($failure in $failures) {
    Write-Host "  [$($failure.Category)] $($failure.Slug) ($($failure.Engine)): $($failure.Message)" -ForegroundColor Yellow
  }

  Write-Host "`nPDF pipeline verification FAILED." -ForegroundColor Red
  exit 1
}

Write-Host "`nPDF pipeline verification PASSED." -ForegroundColor Green
