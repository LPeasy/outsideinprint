$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

Write-Host "Outside In Print ~ CI PDF Build (Pandoc -> Typst -> PDF)" -ForegroundColor Cyan

$ContentRoot = "./content"
$PdfOutDir = "./static/pdfs"
$TempDir = "./resources/typst_build"
$AllowedSections = @("essays", "literature", "reports", "working-papers")

New-Item -ItemType Directory -Force -Path $PdfOutDir | Out-Null
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

function Invoke-NativeOrThrow {
  param(
    [string]$Command,
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $($Arguments -join ' ')"
  }
}

function Get-FrontMatterMap {
  param([string]$Raw)

  $map = @{}
  $match = [regex]::Match($Raw, "(?ms)^---\s*\r?\n(.*?)\r?\n---\s*(\r?\n|$)")
  if (-not $match.Success) {
    return $map
  }

  $frontMatterBlock = $match.Groups[1].Value
  foreach ($line in ($frontMatterBlock -split "`r?`n")) {
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

function Escape-TypstString {
  param([string]$Value)

  if ($null -eq $Value) {
    return ""
  }

  $escaped = $Value -replace "\\", "\\\\"
  $escaped = $escaped -replace '"', '\\"'
  $escaped = $escaped -replace "`r?`n", "\\n"
  return $escaped
}

function Get-SiteBaseUrl {
  param([string]$ConfigPath)

  if (-not (Test-Path -Path $ConfigPath -PathType Leaf)) {
    return ""
  }

  $config = Get-Content -Path $ConfigPath -Raw
  $match = [regex]::Match($config, '(?m)^\s*baseURL\s*=\s*"(.*?)"\s*$')
  if (-not $match.Success) {
    return ""
  }

  $base = $match.Groups[1].Value.Trim()
  if ([string]::IsNullOrWhiteSpace($base)) {
    return ""
  }

  if (-not $base.EndsWith('/')) {
    $base += '/'
  }

  return $base
}

function Get-TypstDateExpression {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return "none"
  }

  $match = [regex]::Match($Value, "(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})")
  if (-not $match.Success) {
    return "none"
  }

  $year = [int]$match.Groups["y"].Value
  $month = [int]$match.Groups["m"].Value
  $day = [int]$match.Groups["d"].Value
  return "datetime(year: $year, month: $month, day: $day)"
}

$siteBaseUrl = Get-SiteBaseUrl -ConfigPath "./hugo.toml"

$mdFiles = Get-ChildItem -Path $ContentRoot -Recurse -File -Filter "*.md" |
  Where-Object {
    $_.Name -ne "_index.md" -and
    ($AllowedSections -contains (Get-SectionFromFile -RootPath $ContentRoot -File $_))
  }

foreach ($file in $mdFiles) {
  $raw = Get-Content -Path $file.FullName -Raw
  $frontMatter = Get-FrontMatterMap -Raw $raw

  if (Is-TrueValue -Value ($frontMatter["draft"])) {
    Write-Host "Skipping draft: $($file.FullName)" -ForegroundColor DarkGray
    continue
  }

  $section = Get-SectionFromFile -RootPath $ContentRoot -File $file
  $slug = Get-ResolvedSlug -File $file -FrontMatterSlug ($frontMatter["slug"])

  $title = $frontMatter["title"]
  $subtitle = $frontMatter["subtitle"]
  $version = $frontMatter["version"]
  $edition = $frontMatter["edition"]
  $issue = $frontMatter["issue"]
  $sectionLabel = $frontMatter["section_label"]
  $date = $frontMatter["date"]

  if ([string]::IsNullOrWhiteSpace($title)) { $title = $slug }
  if ([string]::IsNullOrWhiteSpace($version)) { $version = "1.0" }
  if ([string]::IsNullOrWhiteSpace($edition)) { $edition = "First digital edition" }
  if ([string]::IsNullOrWhiteSpace($issue)) { $issue = "Issue 001" }
  if ([string]::IsNullOrWhiteSpace($sectionLabel)) { $sectionLabel = "Piece" }

  $pdfPath = Join-Path $PdfOutDir "$slug.pdf"
  $typBodyPath = Join-Path $TempDir "$slug.body.typ"
  $typDocPath = Join-Path $TempDir "$slug.typ"

  Invoke-NativeOrThrow -Command "pandoc" -Arguments @(
    $file.FullName,
    "-f", "markdown+yaml_metadata_block+raw_attribute",
    "-t", "typst",
    "-o", $typBodyPath
  )

  $escapedTitle = Escape-TypstString -Value $title
  $escapedSubtitle = Escape-TypstString -Value $subtitle
  $escapedSectionLabel = Escape-TypstString -Value $sectionLabel
  $escapedIssue = Escape-TypstString -Value $issue
  $escapedDate = Escape-TypstString -Value $date
  $escapedVersion = Escape-TypstString -Value $version
  $escapedEdition = Escape-TypstString -Value $edition
  $articleRelativePath = "$section/$slug/"
  if ([string]::IsNullOrWhiteSpace($siteBaseUrl)) {
    $articleUrl = "/$articleRelativePath"
  } else {
    $articleUrl = "$siteBaseUrl$articleRelativePath"
  }
  $escapedUrl = Escape-TypstString -Value $articleUrl
  $docDateExpression = Get-TypstDateExpression -Value $date
  $bodyFileName = "$slug.body.typ"

  $doc = @"
#import "../../templates/edition.typ": render
#let article_body = include("$bodyFileName")

#render(
  title: "$escapedTitle",
  subtitle: "$escapedSubtitle",
  section_label: "$escapedSectionLabel",
  issue: "$escapedIssue",
  date: "$escapedDate",
  version: "$escapedVersion",
  edition: "$escapedEdition",
  author: "Outside In Print",
  url: "$escapedUrl",
  doc_date: $docDateExpression,
  body: article_body
)
"@

  Set-Content -Path $typDocPath -Value $doc -Encoding utf8

  Invoke-NativeOrThrow -Command "typst" -Arguments @(
    "compile",
    "--root", ".",
    $typDocPath,
    $pdfPath
  )

  Write-Host "Built: $pdfPath" -ForegroundColor Green
}

Write-Host "`nCI PDF build complete." -ForegroundColor Cyan
