param(
  [string]$ContentRoot = "./content",
  [string]$PdfRoot = "./static/pdfs",
  [string]$PdfCatalogPath = "./data/pdfs/catalog.json",
  [switch]$StrictPdfQuality
)

$ErrorActionPreference = "Stop"

Write-Host "Outside In Print ~ Preflight" -ForegroundColor Cyan

$AllowedSections = @("essays", "literature", "reports", "syd-and-oliver", "working-papers")
$RequiredFields = @("title", "date", "section_label", "version", "edition", "pdf", "draft")
$RawHtmlScoreThreshold = 14
$fail = $false
$slugSources = @{}
$qualitySummary = [ordered]@{
  fallback_pdfs = 0
  html_pdfs = 0
  auto_html_pdfs = 0
  placeholder_figures = 0
  remote_image_placeholders = 0
  raw_html_heavy_typst_pdfs = 0
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

    $key = $kv.Groups[1].Value
    $value = $kv.Groups[2].Value.Trim()

    if (
      ($value.Length -ge 2) -and (
        (($value.StartsWith('"')) -and ($value.EndsWith('"'))) -or
        (($value.StartsWith("'")) -and ($value.EndsWith("'")))
      )
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $map[$key] = $value
  }

  return $map
}

function Get-RelativePath {
  param(
    [string]$RootPath,
    [string]$FullPath
  )

  $root = [System.IO.Path]::GetFullPath($RootPath)
  $full = [System.IO.Path]::GetFullPath($FullPath)

  if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($root.Length).TrimStart('\', '/')
  }

  return $full
}

function Get-SectionFromFile {
  param(
    [string]$RootPath,
    [System.IO.FileInfo]$File
  )

  $relativePath = Get-RelativePath -RootPath $RootPath -FullPath $File.FullName
  $segments = $relativePath -split "[\\/]"

  if ($segments.Length -gt 1) {
    return $segments[0]
  }

  return ""
}

function Get-ResolvedSlug {
  param(
    [System.IO.FileInfo]$File,
    [string]$FrontMatterSlug
  )

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

function Test-BooleanLike {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $true
  }

  return ($Value.Trim() -match "^(?i:true|false|yes|no|1|0)$")
}

function Test-ContainsMojibake {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $false
  }

  foreach ($marker in @(
      [string][char]0x00C3,
      [string][char]0x00C2,
      [string][char]0x00E2,
      [string][char]0xFFFD
    )) {
    if ($Text.Contains($marker)) {
      return $true
    }
  }

  return $false
}

function Register-QualityIssue {
  param(
    [string]$Message,
    [switch]$AlwaysFail
  )

  if ($AlwaysFail -or $StrictPdfQuality) {
    Write-Host $Message -ForegroundColor Yellow
    $script:fail = $true
    return
  }

  Write-Host "QUALITY WARNING: $Message" -ForegroundColor DarkYellow
}

function Test-StaticAssetExists {
  param([string]$PathValue)

  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    return $true
  }

  if ($PathValue -match '^https?://') {
    return $true
  }

  if (-not $PathValue.StartsWith('/')) {
    return $true
  }

  $candidate = Join-Path "." ("static/" + $PathValue.TrimStart('/'))
  return (Test-Path -Path $candidate -PathType Leaf)
}

$pdfCatalog = Read-JsonFile -Path $PdfCatalogPath

$mdFiles = Get-ChildItem -Path $ContentRoot -Recurse -File -Filter "*.md" |
  Where-Object {
    $_.Name -ne "_index.md" -and
    ($AllowedSections -contains (Get-SectionFromFile -RootPath $ContentRoot -File $_))
  }

foreach ($file in $mdFiles) {
  $raw = Read-Utf8Text -Path $file.FullName
  $frontMatter = Get-FrontMatterMap -Raw $raw

  if ($frontMatter.Count -eq 0) {
    Write-Host "MISSING front matter: $($file.FullName)" -ForegroundColor Red
    $fail = $true
    continue
  }

  if (Is-TrueValue -Value ($frontMatter["draft"])) {
    continue
  }

  foreach ($field in $RequiredFields) {
    if (-not $frontMatter.ContainsKey($field) -or [string]::IsNullOrWhiteSpace($frontMatter[$field])) {
      Write-Host "MISSING required field '$field': $($file.FullName)" -ForegroundColor Yellow
      $fail = $true
    }
  }

  $version = $frontMatter["version"]
  if (-not [string]::IsNullOrWhiteSpace($version) -and ($version -notmatch "^\d+(\.\d+)?$")) {
    Write-Host "MISSING/INVALID version: $($file.FullName)" -ForegroundColor Yellow
    $fail = $true
  }

  if ($frontMatter.ContainsKey("pdf_engine")) {
    $engine = $frontMatter["pdf_engine"].Trim().ToLowerInvariant()
    if ($engine -notin @("typst", "html")) {
      Write-Host "INVALID pdf_engine '$engine': $($file.FullName)" -ForegroundColor Yellow
      $fail = $true
    }
  }

  if ($frontMatter.ContainsKey("pdf_variant")) {
    $variant = $frontMatter["pdf_variant"].Trim().ToLowerInvariant()
    if ($variant -notin @("essay", "report", "visual")) {
      Write-Host "INVALID pdf_variant '$variant': $($file.FullName)" -ForegroundColor Yellow
      $fail = $true
    }
  }

  foreach ($booleanField in @("pdf_disable_toc", "pdf_allow_fallback", "pdf_allow_placeholder_figures", "pdf_force_typst")) {
    if ($frontMatter.ContainsKey($booleanField) -and -not (Test-BooleanLike -Value $frontMatter[$booleanField])) {
      Write-Host "INVALID boolean field '$booleanField': $($file.FullName)" -ForegroundColor Yellow
      $fail = $true
    }
  }

  if ($frontMatter.ContainsKey("pdf_cover_image") -and -not (Test-StaticAssetExists -PathValue $frontMatter["pdf_cover_image"])) {
    Write-Host "MISSING pdf_cover_image asset '$($frontMatter["pdf_cover_image"])': $($file.FullName)" -ForegroundColor Yellow
    $fail = $true
  }

  $declaredVariant = if ($frontMatter.ContainsKey("pdf_variant")) { $frontMatter["pdf_variant"].Trim().ToLowerInvariant() } else { "" }
  if ($declaredVariant -eq "visual" -and [string]::IsNullOrWhiteSpace($frontMatter["pdf_summary"])) {
    Register-QualityIssue -Message "VISUAL PDF missing pdf_summary: $($file.FullName)"
  }

  $slug = Get-ResolvedSlug -File $file -FrontMatterSlug ($frontMatter["slug"])
  if ([string]::IsNullOrWhiteSpace($slug)) {
    Write-Host "UNRESOLVABLE slug: $($file.FullName)" -ForegroundColor Red
    $fail = $true
    continue
  }

  if ($slugSources.ContainsKey($slug)) {
    Write-Host "DUPLICATE slug '$slug' across files: $($slugSources[$slug]) and $($file.FullName)" -ForegroundColor Red
    $fail = $true
  } else {
    $slugSources[$slug] = $file.FullName
  }

  $expectedPdf = "/pdfs/$slug.pdf"
  $declaredPdf = $frontMatter["pdf"]
  if ($declaredPdf -ne $expectedPdf) {
    Write-Host "PDF path mismatch (expected $expectedPdf): $($file.FullName)" -ForegroundColor Yellow
    $fail = $true
  }

  $pdfPath = Join-Path $PdfRoot "$slug.pdf"
  if (-not (Test-Path -Path $pdfPath -PathType Leaf)) {
    Write-Host "MISSING PDF file: $pdfPath (referenced by $($file.FullName))" -ForegroundColor Red
    $fail = $true
  }

  if (Test-ContainsMojibake -Text $raw) {
    Register-QualityIssue -Message "MOJIBAKE DETECTED in source: $($file.FullName)"
  }

  if ($null -ne $pdfCatalog) {
    $catalogEntry = $null
    if ($pdfCatalog.PSObject.Properties.Name -contains $slug) {
      $catalogEntry = $pdfCatalog.$slug
    }

    if ($null -eq $catalogEntry) {
      Register-QualityIssue -Message "PDF catalog entry missing for '$slug': $($file.FullName)"
      continue
    }

    if (($catalogEntry.PSObject.Properties.Name -contains "engine") -and ($catalogEntry.engine -eq "html")) {
      $qualitySummary.html_pdfs++
    }

    if (($catalogEntry.PSObject.Properties.Name -contains "auto_engine_selected") -and [bool]$catalogEntry.auto_engine_selected) {
      $qualitySummary.auto_html_pdfs++
    }

    if (
      ($catalogEntry.PSObject.Properties.Name -contains "render_status") -and
      ($catalogEntry.render_status -eq "fallback")
    ) {
      $qualitySummary.fallback_pdfs++
    }

    if (
      ($catalogEntry.PSObject.Properties.Name -contains "render_status") -and
      ($catalogEntry.render_status -eq "fallback") -and
      (-not (Is-TrueValue -Value $frontMatter["pdf_allow_fallback"]))
    ) {
      $failureCause = if ($catalogEntry.PSObject.Properties.Name -contains "failure_cause") { [string]$catalogEntry.failure_cause } else { "" }
      $failureDetail = if ($catalogEntry.PSObject.Properties.Name -contains "failure_detail") { [string]$catalogEntry.failure_detail } else { "" }
      $detailSuffix = ""
      if (-not [string]::IsNullOrWhiteSpace($failureCause)) {
        $detailSuffix = " cause=$failureCause"
      }
      if (-not [string]::IsNullOrWhiteSpace($failureDetail)) {
        $detailSuffix += " detail=$failureDetail"
      }
      Register-QualityIssue -Message "FALLBACK PDF DETECTED for '$slug': $($file.FullName)$detailSuffix"
    }

    if (
      ($catalogEntry.PSObject.Properties.Name -contains "placeholder_count") -and
      ([int]$catalogEntry.placeholder_count -gt 0)
    ) {
      $qualitySummary.placeholder_figures += [int]$catalogEntry.placeholder_count
    }

    if (
      ($catalogEntry.PSObject.Properties.Name -contains "placeholder_count") -and
      ([int]$catalogEntry.placeholder_count -gt 0) -and
      (-not (Is-TrueValue -Value $frontMatter["pdf_allow_placeholder_figures"]))
    ) {
      Register-QualityIssue -Message "PLACEHOLDER FIGURES DETECTED for '$slug': $($file.FullName)"
    }

    if (($catalogEntry.PSObject.Properties.Name -contains "omitted_remote_images") -and ([int]$catalogEntry.omitted_remote_images -gt 0)) {
      $qualitySummary.remote_image_placeholders += [int]$catalogEntry.omitted_remote_images
    }

    if (
      ($catalogEntry.PSObject.Properties.Name -contains "raw_html_score") -and
      ([int]$catalogEntry.raw_html_score -ge $RawHtmlScoreThreshold) -and
      ($catalogEntry.PSObject.Properties.Name -contains "engine") -and
      ($catalogEntry.engine -eq "typst")
    ) {
      $qualitySummary.raw_html_heavy_typst_pdfs++
      Register-QualityIssue -Message "RAW HTML-HEAVY ARTICLE STILL ON TYPST for '$slug': $($file.FullName)"
    }
  }
}

Write-Host "`nPDF quality summary:" -ForegroundColor Cyan
Write-Host "  Fallback PDFs: $($qualitySummary.fallback_pdfs)"
Write-Host "  HTML PDFs: $($qualitySummary.html_pdfs)"
Write-Host "  Auto-routed HTML PDFs: $($qualitySummary.auto_html_pdfs)"
Write-Host "  Placeholder figures: $($qualitySummary.placeholder_figures)"
Write-Host "  Remote-image placeholders: $($qualitySummary.remote_image_placeholders)"
Write-Host "  Raw HTML-heavy PDFs still on Typst: $($qualitySummary.raw_html_heavy_typst_pdfs)"

if ($fail) {
  Write-Host "`nPreflight FAILED. Fix issues above before publishing." -ForegroundColor Red
  exit 1
}

Write-Host "`nPreflight PASSED." -ForegroundColor Green
