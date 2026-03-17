param(
  [string]$ContentRoot = "./content",
  [string]$PdfRoot = "./static/pdfs",
  [string]$OutputPath = "./data/pdfs/catalog.json",
  [string]$BuildMetaRoot = "./resources/typst_build"
)

$ErrorActionPreference = "Stop"

$AllowedSections = @("essays", "literature", "reports", "syd-and-oliver", "working-papers")

function Read-Utf8Text {
  param([string]$Path)
  return [System.IO.File]::ReadAllText((Resolve-Path $Path), [System.Text.Encoding]::UTF8)
}

function Write-Utf8Text {
  param([string]$Path,[string]$Value)
  $directory = Split-Path -Path $Path -Parent
  if ($directory -and -not (Test-Path -Path $directory -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }
  [System.IO.File]::WriteAllText($Path, $Value, [System.Text.UTF8Encoding]::new($false))
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

function Get-BodyWithoutFrontMatter {
  param([string]$Raw)

  $match = [regex]::Match($Raw, "(?ms)^---\s*\r?\n.*?\r?\n---\s*(\r?\n)?")
  if ($match.Success) {
    return $Raw.Substring($match.Length)
  }

  return $Raw
}

function Get-ApproximateWordCount {
  param([string]$Raw)

  $body = Get-BodyWithoutFrontMatter -Raw $Raw
  $body = [regex]::Replace($body, "<[^>]+>", " ")
  $body = [regex]::Replace($body, "https?://\S+", " ")
  return ([regex]::Matches($body, "\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b")).Count
}

function Get-ArticleSummary {
  param([hashtable]$FrontMatter,[string]$Raw)

  foreach ($key in @("pdf_summary", "description", "summary", "subtitle")) {
    if ($FrontMatter.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($FrontMatter[$key])) {
      return $FrontMatter[$key].Trim()
    }
  }

  $body = Get-BodyWithoutFrontMatter -Raw $Raw
  foreach ($paragraph in ($body -split "(?:\r?\n){2,}")) {
    $candidate = [regex]::Replace($paragraph, "!\[[^\]]*\]\([^)]+\)", "")
    $candidate = [regex]::Replace($candidate, "<[^>]+>", " ")
    $candidate = [regex]::Replace($candidate, "\s+", " ").Trim()
    if ($candidate.Length -lt 40) {
      continue
    }
    if ($candidate.Length -gt 220) {
      return $candidate.Substring(0, 217).TrimEnd() + "..."
    }
    return $candidate
  }

  return ""
}

function Get-PdfPageCount {
  param([string]$Path)

  if (-not (Test-Path -Path $Path -PathType Leaf)) {
    return 0
  }

  $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $Path))
  $text = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($bytes)
  $typePageCount = ([regex]::Matches($text, "/Type\s*/Page\b")).Count
  $countValues = @(
    [regex]::Matches($text, "/Count\s+(\d+)") |
      ForEach-Object { [int]$_.Groups[1].Value } |
      Where-Object { $_ -gt 0 }
  )

  if ($countValues.Count -gt 0) {
    $maxCount = ($countValues | Measure-Object -Maximum).Maximum
    if ($maxCount -gt $typePageCount) {
      return $maxCount
    }
  }

  return $typePageCount
}

function Format-FileSizeLabel {
  param([long]$Bytes)

  if ($Bytes -le 0) {
    return ""
  }

  if ($Bytes -ge 1MB) {
    return ("{0:N1} MB" -f ($Bytes / 1MB))
  }

  return ("{0:N0} KB" -f [math]::Ceiling($Bytes / 1KB))
}

function Get-PdfVariant {
  param([hashtable]$FrontMatter,[string]$Section)

  if ($FrontMatter.ContainsKey("pdf_variant") -and -not [string]::IsNullOrWhiteSpace($FrontMatter["pdf_variant"])) {
    return $FrontMatter["pdf_variant"].Trim().ToLowerInvariant()
  }

  if ($FrontMatter.ContainsKey("pdf_engine") -and ($FrontMatter["pdf_engine"].Trim().ToLowerInvariant() -eq "html")) {
    return "visual"
  }

  if ($Section -in @("reports", "working-papers")) {
    return "report"
  }

  return "essay"
}

function Get-PdfEngine {
  param([hashtable]$FrontMatter)

  if ($FrontMatter.ContainsKey("pdf_engine") -and -not [string]::IsNullOrWhiteSpace($FrontMatter["pdf_engine"])) {
    return $FrontMatter["pdf_engine"].Trim().ToLowerInvariant()
  }

  return "typst"
}

function Get-LengthBucket {
  param([int]$PageCount,[int]$WordCount)

  if ($PageCount -gt 0) {
    if ($PageCount -le 8) { return "short" }
    if ($PageCount -le 20) { return "medium" }
    return "long"
  }

  if ($WordCount -le 1200) { return "short" }
  if ($WordCount -le 3200) { return "medium" }
  return "long"
}

function Get-ValueProps {
  param(
    [string]$Variant,
    [bool]$HasReferences,
    [string]$Engine
  )

  $props = [System.Collections.Generic.List[string]]::new()
  $props.Add("offline reading")
  $props.Add("printable layout")

  if ($HasReferences) {
    $props.Add("references")
  } else {
    $props.Add("citation-ready")
  }

  if ($Variant -eq "visual" -or $Engine -eq "html") {
    $props.Add("image-preserving layout")
  } else {
    $props.Add("clean typography")
  }

  return $props
}

function Read-BuildMeta {
  param([string]$Path)

  if (-not (Test-Path -Path $Path -PathType Leaf)) {
    return $null
  }

  return (Read-Utf8Text -Path $Path | ConvertFrom-Json)
}

$records = [ordered]@{}
$mdFiles = Get-ChildItem -Path $ContentRoot -Recurse -File -Filter "*.md" |
  Where-Object {
    $_.Name -ne "_index.md" -and
    ($AllowedSections -contains (Get-SectionFromFile -RootPath $ContentRoot -File $_))
  }

foreach ($file in $mdFiles) {
  $raw = Read-Utf8Text -Path $file.FullName
  $frontMatter = Get-FrontMatterMap -Raw $raw
  if ($frontMatter.Count -eq 0) {
    continue
  }

  if (Is-TrueValue -Value ($frontMatter["draft"])) {
    continue
  }

  $slug = Get-ResolvedSlug -File $file -FrontMatterSlug ($frontMatter["slug"])
  if ([string]::IsNullOrWhiteSpace($slug)) {
    continue
  }

  $pdfPath = Join-Path $PdfRoot "$slug.pdf"
  if (-not (Test-Path -Path $pdfPath -PathType Leaf)) {
    continue
  }

  $section = Get-SectionFromFile -RootPath $ContentRoot -File $file
  $pdfInfo = Get-Item -LiteralPath $pdfPath
  $pageCount = Get-PdfPageCount -Path $pdfPath
  $wordCount = Get-ApproximateWordCount -Raw $raw
  $engine = Get-PdfEngine -FrontMatter $frontMatter
  $variant = Get-PdfVariant -FrontMatter $frontMatter -Section $section
  $summary = Get-ArticleSummary -FrontMatter $frontMatter -Raw $raw
  $buildMetaPath = Join-Path $BuildMetaRoot "$slug.pdfmeta.json"
  $buildMeta = Read-BuildMeta -Path $buildMetaPath
  $referenceCount = 0
  if ($null -ne $buildMeta -and $buildMeta.PSObject.Properties.Name -contains "reference_count") {
    $referenceCount = [int]$buildMeta.reference_count
  }

  $entry = [ordered]@{
    slug = $slug
    title = $frontMatter["title"]
    section = $section
    section_label = $frontMatter["section_label"]
    pdf_path = "/pdfs/$slug.pdf"
    engine = $engine
    variant = $variant
    cta_label = if ($frontMatter.ContainsKey("pdf_cta_label") -and -not [string]::IsNullOrWhiteSpace($frontMatter["pdf_cta_label"])) { $frontMatter["pdf_cta_label"] } else { "Download clean reading edition (PDF)" }
    summary = $summary
    helper = "Offline, printable, citation-ready"
    page_count = $pageCount
    page_count_label = if ($pageCount -gt 0) { if ($pageCount -eq 1) { "1 page" } else { "$pageCount pages" } } else { "" }
    file_bytes = [long]$pdfInfo.Length
    file_size_label = Format-FileSizeLabel -Bytes $pdfInfo.Length
    word_count = $wordCount
    length_bucket = Get-LengthBucket -PageCount $pageCount -WordCount $wordCount
    show_toc = if ($null -ne $buildMeta -and $buildMeta.PSObject.Properties.Name -contains "show_toc") { [bool]$buildMeta.show_toc } else { $false }
    render_status = if ($null -ne $buildMeta -and $buildMeta.PSObject.Properties.Name -contains "render_status") { [string]$buildMeta.render_status } else { "unknown" }
    placeholder_count = if ($null -ne $buildMeta -and $buildMeta.PSObject.Properties.Name -contains "placeholder_count") { [int]$buildMeta.placeholder_count } else { 0 }
    omitted_remote_images = if ($null -ne $buildMeta -and $buildMeta.PSObject.Properties.Name -contains "omitted_remote_images") { [int]$buildMeta.omitted_remote_images } else { 0 }
    local_image_count = if ($null -ne $buildMeta -and $buildMeta.PSObject.Properties.Name -contains "local_image_count") { [int]$buildMeta.local_image_count } else { 0 }
    reference_count = $referenceCount
    value_props = Get-ValueProps -Variant $variant -HasReferences ($referenceCount -gt 0) -Engine $engine
  }

  $records[$slug] = $entry
}

$json = $records | ConvertTo-Json -Depth 8
Write-Utf8Text -Path $OutputPath -Value $json
Write-Host "PDF catalog synced to $OutputPath" -ForegroundColor Green
