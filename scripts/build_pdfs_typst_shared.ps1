param(
  [string]$Mode = "Local"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

Write-Host "Outside In Print ~ $Mode Typst PDF Builder" -ForegroundColor Cyan

$ContentRoot = "./content"
$PdfOutDir = "./static/pdfs"
$TempDir = "./resources/typst_build"
$AllowedSections = @("essays", "literature", "syd-and-oliver", "working-papers")
$EditionTemplatePath = "./templates/edition.typ"

New-Item -ItemType Directory -Force -Path $PdfOutDir | Out-Null
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

function Require-NativeCommand {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command '$Name'. Install it and ensure it is in PATH."
  }
}

function Invoke-NativeOrThrow {
  param([string]$Command,[string[]]$Arguments)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Command failed: $Command $($Arguments -join ' ')" }
}

function Read-Utf8Text {
  param([string]$Path)
  return [System.IO.File]::ReadAllText((Resolve-Path $Path), [System.Text.Encoding]::UTF8)
}

function Write-Utf8Text {
  param([string]$Path,[string]$Value)
  [System.IO.File]::WriteAllText($Path, $Value, [System.Text.UTF8Encoding]::new($false))
}

function Remove-UnsupportedControlChars {
  param([string]$Value)
  if ($null -eq $Value) { return "" }
  return [regex]::Replace($Value, "[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]", "")
}

function Repair-CommonTextArtifacts {
  param([string]$Value)
  if ([string]::IsNullOrEmpty($Value)) { return "" }

  $fixed = $Value
  $cpMarker1 = [string][char]0x00C3
  $cpMarker2 = [string][char]0x00C2
  $cpMarker3 = [string][char]0x00E2
  if ($fixed.Contains($cpMarker1) -or $fixed.Contains($cpMarker2) -or $fixed.Contains($cpMarker3)) {
    try {
      $bytes = [System.Text.Encoding]::GetEncoding(1252).GetBytes($fixed)
      $decoded = [System.Text.Encoding]::UTF8.GetString($bytes)
      if ($decoded -and (-not $decoded.Contains($cpMarker1)) -and (-not $decoded.Contains($cpMarker2))) {
        $fixed = $decoded
      }
    }
    catch {
    }
  }

  $fixed = $fixed.Replace([string][char]0x2019, "'")
  $fixed = $fixed.Replace([string][char]0x2018, "'")
  $fixed = $fixed.Replace([string][char]0x201C, '"')
  $fixed = $fixed.Replace([string][char]0x201D, '"')
  $fixed = $fixed.Replace([string][char]0x2013, "-")
  $fixed = $fixed.Replace([string][char]0x2014, "--")
  $fixed = $fixed.Replace([string][char]0x2026, "...")
  $fixed = $fixed.Replace([string][char]0x2212, "-")
  $fixed = $fixed.Replace([string][char]0x00A0, " ")
  return $fixed
}

function Get-FrontMatterMap {
  param([string]$Raw)
  $map = @{}
  $match = [regex]::Match($Raw, "(?ms)^---\s*\r?\n(.*?)\r?\n---\s*(\r?\n|$)")
  if (-not $match.Success) { return $map }
  foreach ($line in ($match.Groups[1].Value -split "`r?`n")) {
    if ($line -match "^\s*#") { continue }
    $kv = [regex]::Match($line, "^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$")
    if (-not $kv.Success) { continue }
    $key = $kv.Groups[1].Value
    $value = $kv.Groups[2].Value.Trim()
    if ((($value.StartsWith('"')) -and ($value.EndsWith('"'))) -or (($value.StartsWith("'")) -and ($value.EndsWith("'")))) {
      if ($value.Length -ge 2) { $value = $value.Substring(1, $value.Length - 2) }
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
    return $full.Substring($root.Length).TrimStart([char[]]@([char]'\', [char]'/' ))
  }
  return $full
}

function Get-SectionFromFile {
  param([string]$RootPath,[System.IO.FileInfo]$File)
  $relativePath = Get-RelativePath -RootPath $RootPath -FullPath $File.FullName
  $segments = $relativePath -split "[\\/]"
  if ($segments.Length -gt 1) { return $segments[0] }
  return ""
}

function Get-ResolvedSlug {
  param([System.IO.FileInfo]$File,[string]$FrontMatterSlug)
  if (-not [string]::IsNullOrWhiteSpace($FrontMatterSlug)) { return $FrontMatterSlug.Trim() }
  $fileSlug = [System.IO.Path]::GetFileNameWithoutExtension($File.Name)
  if ($fileSlug -ieq "index") { return [System.IO.Path]::GetFileName($File.DirectoryName) }
  return $fileSlug
}

function Get-SafeFileSlug {
  param([string]$Slug)
  if ([string]::IsNullOrWhiteSpace($Slug)) { return "untitled" }
  $safe = $Slug -replace '[^A-Za-z0-9._-]', '-'
  $safe = $safe -replace '-+', '-'
  $safe = $safe.Trim('-')
  if ([string]::IsNullOrWhiteSpace($safe)) { return "untitled" }
  return $safe
}

function Is-TrueValue {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  return $Value.Trim() -match "^(?i:true|yes|1)$"
}

function Escape-TypstString {
  param([string]$Value)
  if ($null -eq $Value) { return "" }
  $escaped = $Value -replace '\\', '\\\\'
  $escaped = $escaped -replace '"', '\"'
  $escaped = $escaped -replace "`r?`n", "\\n"
  return $escaped
}


function Get-SiteBaseUrl {
  param([string]$ConfigPath)
  if (-not (Test-Path -Path $ConfigPath -PathType Leaf)) { return "" }
  $config = Read-Utf8Text -Path $ConfigPath
  $match = [regex]::Match($config, '(?m)^\s*baseURL\s*=\s*"(.*?)"\s*$')
  if (-not $match.Success) { return "" }
  $base = $match.Groups[1].Value.Trim()
  if ([string]::IsNullOrWhiteSpace($base)) { return "" }
  if (-not $base.EndsWith('/')) { $base += '/' }
  return $base
}

function Get-TypstDateExpression {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "none" }
  $match = [regex]::Match($Value, "(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})")
  if (-not $match.Success) { return "none" }
  $year = [int]$match.Groups["y"].Value
  $month = [int]$match.Groups["m"].Value
  $day = [int]$match.Groups["d"].Value
  return "datetime(year: $year, month: $month, day: $day)"
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
  $body = Repair-CommonTextArtifacts -Value $body
  $words = [regex]::Matches($body, "\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b")
  return $words.Count
}

function Get-ReferenceHost {
  param([string]$Url)
  try {
    return ([Uri]$Url).Host
  }
  catch {
    return $Url
  }
}

function Normalize-ReferenceUrl {
  param([string]$Url)

  if ([string]::IsNullOrWhiteSpace($Url)) { return "" }

  $normalized = Repair-CommonTextArtifacts -Value ([System.Net.WebUtility]::HtmlDecode($Url))
  $normalized = $normalized.Trim()
  $normalized = $normalized.Trim('"', "'", "[", "]", "<", ">")
  $normalized = $normalized -replace '\\([)\]])', '$1'
  $normalized = $normalized.TrimEnd('\', '.', ',', ';', ':')

  return $normalized
}

function Add-ReferenceEntry {
  param(
    [System.Collections.Generic.List[object]]$References,
    [hashtable]$Seen,
    [string]$Url,
    [string]$Title
  )

  $cleanUrl = Normalize-ReferenceUrl -Url $Url
  if ([string]::IsNullOrWhiteSpace($cleanUrl)) { return }
  if ($cleanUrl -match "\.(jpg|jpeg|png|gif|webp|svg)(\?|$)") { return }
  if ($Seen.ContainsKey($cleanUrl)) { return }

  $cleanTitle = Repair-CommonTextArtifacts -Value ([System.Net.WebUtility]::HtmlDecode($Title))
  $cleanTitle = [regex]::Replace($cleanTitle, "<[^>]+>", " ")
  $cleanTitle = $cleanTitle -replace '[""\[\]<>]', ''
  $cleanTitle = [regex]::Replace($cleanTitle, "\s+", " ").Trim()
  if ($cleanTitle -match 'class=|data-href=|target=|markup--|js-mixtapeImage') {
    $cleanTitle = ''
  }
  if ([string]::IsNullOrWhiteSpace($cleanTitle)) {
    $cleanTitle = Get-ReferenceHost -Url $cleanUrl
  }
  $null = $References.Add([pscustomobject]@{
    Url = $cleanUrl
    Title = $cleanTitle
    Host = Get-ReferenceHost -Url $cleanUrl
  })
  $Seen[$cleanUrl] = $true
}

function Get-ReferenceEntries {
  param([string]$Raw,[hashtable]$FrontMatter)

  $references = [System.Collections.Generic.List[object]]::new()
  $seen = @{}

  foreach ($frontMatterKey in @('source_url', 'medium_source_url')) {
    if ($FrontMatter.ContainsKey($frontMatterKey)) {
      $label = if ($frontMatterKey -eq 'medium_source_url') { 'Original publication' } else { 'Primary source' }
      Add-ReferenceEntry -References $references -Seen $seen -Url $FrontMatter[$frontMatterKey] -Title $label
    }
  }

  $anchorPattern = '<a\b[^>]*href=["''][^"'']*(?<url>https?://[^"'']+)["''][^>]*>(?<text>.*?)</a>'
  foreach ($match in [regex]::Matches($Raw, $anchorPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
    Add-ReferenceEntry -References $references -Seen $seen -Url $match.Groups['url'].Value -Title $match.Groups['text'].Value
  }

  $markdownPattern = '\[(?<text>[^\]]+)\]\((?<url>https?://[^)\s]+)'
  foreach ($match in [regex]::Matches($Raw, $markdownPattern)) {
    Add-ReferenceEntry -References $references -Seen $seen -Url $match.Groups['url'].Value -Title $match.Groups['text'].Value
  }

  $bareUrlPattern = 'https?://[^\s<>"\)\]]+'
  foreach ($match in [regex]::Matches($Raw, $bareUrlPattern)) {
    Add-ReferenceEntry -References $references -Seen $seen -Url $match.Value -Title ''
  }

  return $references
}

function Get-ReferencesTypContent {
  param([System.Collections.Generic.List[object]]$References)

  if ($null -eq $References -or $References.Count -eq 0) {
    return '[]'
  }

  $builder = [System.Text.StringBuilder]::new()
  [void]$builder.AppendLine('#import "../../templates/edition.typ": reference_entry')

  for ($index = 0; $index -lt $References.Count; $index++) {
    $reference = $References[$index]
    $escapedTitle = Escape-TypstString -Value $reference.Title
    $escapedUrl = Escape-TypstString -Value $reference.Url
    $escapedHost = Escape-TypstString -Value $reference.Host
    [void]$builder.AppendLine(('#reference_entry(index: {0}, title: "{1}", url: "{2}", host: "{3}")' -f ($index + 1), $escapedTitle, $escapedUrl, $escapedHost))
  }

  return $builder.ToString().Trim()
}

function Normalize-TypstBody {
  param(
    [string]$Path,
    [string]$Title,
    [string]$Subtitle
  )

  if (-not (Test-Path -Path $Path -PathType Leaf)) { return @{ Body = ''; HeadingCount = 0 } }
  $body = Read-Utf8Text -Path $Path
  $body = Repair-CommonTextArtifacts -Value $body

  $body = $body -replace '(?m)^#horizontalrule\s*$', ''
  $body = $body -replace '(?m)^#line\(length: 100%\)\s*$', ''
  $body = [regex]::Replace($body, '#box\(image\("https?://[^"\r\n]+"\)\)', '#align(center)[#emph[Figure omitted in this print edition.]]')
  $body = [regex]::Replace($body, '#image\("https?://[^"\r\n]+"\)', '#align(center)[#emph[Figure omitted in this print edition.]]')
  $body = [regex]::Replace($body, '#cite\([^\)]*\)', '')
  $body = [regex]::Replace($body, '(?ms)#block\[\s*[^#\[\]]*?www\.[^\]]*?\]', '')
  $body = [regex]::Replace($body, '(?m)^<[A-Za-z0-9_-]+>\s*$', '')
  $body = $body -replace '\\~', '~'

  if (-not [string]::IsNullOrWhiteSpace($Title)) {
    $escapedTitle = [regex]::Escape((Repair-CommonTextArtifacts -Value $Title).Trim())
    $body = [regex]::Replace($body, "(?m)^=+\s+$escapedTitle\s*$", '', 1)
  }
  if (-not [string]::IsNullOrWhiteSpace($Subtitle)) {
    $cleanSubtitle = (Repair-CommonTextArtifacts -Value $Subtitle).Trim().TrimEnd('~').Trim()
    if ($cleanSubtitle) {
      $escapedSubtitle = [regex]::Escape($cleanSubtitle)
      $body = [regex]::Replace($body, "(?m)^$escapedSubtitle\s*~?\s*$", '', 1)
    }
  }

  $body = $body -replace '(?m)^=====\s+', '=== '
  $body = $body -replace '(?m)^====\s+', '== '
  $body = $body -replace '(?m)^===\s+', '= '
  $body = $body -replace '(?m)^-\s+', '+ '

  $captionPatterns = @(
    '(?m)^(Art by .*?)$'
    '(?m)^(.*?\bSource\b.*?)$'
    '(?m)^(Still shot of .*?)$'
  )
  foreach ($pattern in $captionPatterns) {
    $body = [regex]::Replace($body, $pattern, { param($m) "#align(center)[#emph[$($m.Groups[1].Value)]]" })
  }

  $body = [regex]::Replace($body, '(?m)^[ \t]+$', '')
  $body = [regex]::Replace($body, '(?:\r?\n){3,}', "`r`n`r`n")
  $body = $body.Trim() + "`r`n"

  Write-Utf8Text -Path $Path -Value $body
  $headingCount = ([regex]::Matches($body, '(?m)^=+\s+')).Count
  return @{ Body = $body; HeadingCount = $headingCount }
}

Require-NativeCommand -Name "pandoc"
Require-NativeCommand -Name "typst"
if (-not (Test-Path -Path $EditionTemplatePath -PathType Leaf)) { throw "Missing Typst template: $EditionTemplatePath" }

$siteBaseUrl = Get-SiteBaseUrl -ConfigPath "./hugo.toml"

$mdFiles = Get-ChildItem -Path $ContentRoot -Recurse -File -Filter "*.md" |
  Where-Object {
    $_.Name -ne "_index.md" -and
    ($AllowedSections -contains (Get-SectionFromFile -RootPath $ContentRoot -File $_))
  }

foreach ($file in $mdFiles) {
  $raw = Read-Utf8Text -Path $file.FullName
  $raw = Remove-UnsupportedControlChars -Value $raw
  $raw = Repair-CommonTextArtifacts -Value $raw
  $frontMatter = Get-FrontMatterMap -Raw $raw

  if (Is-TrueValue -Value ($frontMatter['draft'])) {
    Write-Host "Skipping draft: $($file.FullName)" -ForegroundColor DarkGray
    continue
  }

  $section = Get-SectionFromFile -RootPath $ContentRoot -File $file
  $slug = Get-ResolvedSlug -File $file -FrontMatterSlug ($frontMatter['slug'])
  $safeSlug = Get-SafeFileSlug -Slug $slug

  $title = Repair-CommonTextArtifacts -Value $frontMatter['title']
  $subtitle = Repair-CommonTextArtifacts -Value $frontMatter['subtitle']
  $version = Repair-CommonTextArtifacts -Value $frontMatter['version']
  $edition = Repair-CommonTextArtifacts -Value $frontMatter['edition']
  $sectionLabel = Repair-CommonTextArtifacts -Value $frontMatter['section_label']
  $date = Repair-CommonTextArtifacts -Value $frontMatter['date']

  if ([string]::IsNullOrWhiteSpace($title)) { $title = $slug }
  if ([string]::IsNullOrWhiteSpace($version)) { $version = '1.0' }
  if ([string]::IsNullOrWhiteSpace($edition)) { $edition = 'First digital edition' }
  if ([string]::IsNullOrWhiteSpace($sectionLabel)) { $sectionLabel = 'Piece' }

  $pdfPath = Join-Path $PdfOutDir "$safeSlug.pdf"
  $sanitizedSourcePath = Join-Path $TempDir "$safeSlug.source.md"
  $typBodyPath = Join-Path $TempDir "$safeSlug.body.typ"
  $typRefsPath = Join-Path $TempDir "$safeSlug.refs.typ"
  $typDocPath = Join-Path $TempDir "$safeSlug.typ"

  $pandocSource = Get-BodyWithoutFrontMatter -Raw $raw
  Write-Utf8Text -Path $sanitizedSourcePath -Value $pandocSource

  Invoke-NativeOrThrow -Command "pandoc" -Arguments @(
    $sanitizedSourcePath,
    '-f', 'markdown+raw_attribute+raw_html',
    '-t', 'typst',
    '-o', $typBodyPath
  )

  $normalizedBody = Normalize-TypstBody -Path $typBodyPath -Title $title -Subtitle $subtitle
  $references = Get-ReferenceEntries -Raw $raw -FrontMatter $frontMatter
  $referencesContent = Get-ReferencesTypContent -References $references
  Write-Utf8Text -Path $typRefsPath -Value $referencesContent

  $wordCount = Get-ApproximateWordCount -Raw $raw
  $showToc = ($wordCount -ge 2600) -or ($normalizedBody.HeadingCount -ge 7)

  $escapedTitle = Escape-TypstString -Value $title
  $escapedSubtitle = Escape-TypstString -Value $subtitle
  $escapedSectionLabel = Escape-TypstString -Value $sectionLabel
  $escapedDate = Escape-TypstString -Value $date
  $escapedVersion = Escape-TypstString -Value $version
  $escapedEdition = Escape-TypstString -Value $edition

  $articleRelativePath = "$section/$slug/"
  $articleUrl = if ([string]::IsNullOrWhiteSpace($siteBaseUrl)) { "/$articleRelativePath" } else { "$siteBaseUrl$articleRelativePath" }
  $escapedUrl = Escape-TypstString -Value $articleUrl

  $docDateExpression = Get-TypstDateExpression -Value $date
  $bodyFileName = "$safeSlug.body.typ"
  $refsFileName = "$safeSlug.refs.typ"
  $showTocTypst = if ($showToc) { 'true' } else { 'false' }

  $doc = @"
#import "../../templates/edition.typ": render
#let article_body = include("$bodyFileName")
#let reference_body = include("$refsFileName")

#render(
  title: "$escapedTitle",
  subtitle: "$escapedSubtitle",
  section_label: "$escapedSectionLabel",
  date: "$escapedDate",
  version: "$escapedVersion",
  edition: "$escapedEdition",
  author: "Outside In Print",
  url: "$escapedUrl",
  doc_date: $docDateExpression,
  show_toc: $showTocTypst,
  body: article_body,
  references: reference_body,
)
"@

  Write-Utf8Text -Path $typDocPath -Value $doc

  try {
    Invoke-NativeOrThrow -Command "typst" -Arguments @(
      'compile',
      '--root', '.',
      $typDocPath,
      $pdfPath
    )
    Write-Host "Built: $pdfPath" -ForegroundColor Green
  }
  catch {
    Write-Warning "Primary PDF render failed for '$slug'. Generating fallback PDF."

    $fallbackBodyPath = Join-Path $TempDir "$safeSlug.fallback.body.typ"
    $fallbackRefsPath = Join-Path $TempDir "$safeSlug.fallback.refs.typ"
    $fallbackDocPath = Join-Path $TempDir "$safeSlug.fallback.typ"

    $fallbackBody = @"
#align(center)[#emph[PDF fallback edition]]

The original article body contained markup that could not be rendered automatically in Typst. A simplified archival edition was generated instead.
"@
    Write-Utf8Text -Path $fallbackBodyPath -Value $fallbackBody
    Write-Utf8Text -Path $fallbackRefsPath -Value $referencesContent

    $fallbackFileName = "$safeSlug.fallback.body.typ"
    $fallbackRefsFileName = "$safeSlug.fallback.refs.typ"
    $fallbackDoc = @"
#import "../../templates/edition.typ": render
#let article_body = include("$fallbackFileName")
#let reference_body = include("$fallbackRefsFileName")

#render(
  title: "$escapedTitle",
  subtitle: "$escapedSubtitle",
  section_label: "$escapedSectionLabel",
  date: "$escapedDate",
  version: "$escapedVersion",
  edition: "$escapedEdition",
  author: "Outside In Print",
  url: "$escapedUrl",
  doc_date: $docDateExpression,
  show_toc: false,
  body: article_body,
  references: reference_body,
)
"@
    Write-Utf8Text -Path $fallbackDocPath -Value $fallbackDoc

    Invoke-NativeOrThrow -Command "typst" -Arguments @(
      'compile',
      '--root', '.',
      $fallbackDocPath,
      $pdfPath
    )

    Write-Host "Built (fallback): $pdfPath" -ForegroundColor Yellow
  }
}

Write-Host "`n$Mode PDF build complete." -ForegroundColor Cyan

