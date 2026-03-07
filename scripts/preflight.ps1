param(
  [string]$ContentRoot = "./content",
  [string]$PdfRoot = "./static/pdfs"
)

$ErrorActionPreference = "Stop"

Write-Host "Outside In Print ~ Preflight" -ForegroundColor Cyan

$AllowedSections = @("essays", "literature", "reports", "working-papers")
$RequiredFields = @("title", "date", "section_label", "version", "edition", "pdf", "draft")
$fail = $false
$slugSources = @{}

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

$mdFiles = Get-ChildItem -Path $ContentRoot -Recurse -File -Filter "*.md" |
  Where-Object {
    $_.Name -ne "_index.md" -and
    ($AllowedSections -contains (Get-SectionFromFile -RootPath $ContentRoot -File $_))
  }

foreach ($file in $mdFiles) {
  $raw = Get-Content -Path $file.FullName -Raw
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
}

if ($fail) {
  Write-Host "`nPreflight FAILED. Fix issues above before publishing." -ForegroundColor Red
  exit 1
}

Write-Host "`nPreflight PASSED." -ForegroundColor Green




