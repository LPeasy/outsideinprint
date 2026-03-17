param(
  [string]$Mode = "Local",
  [string]$ContentRoot = "./content",
  [string]$PdfOutDir = "./static/pdfs",
  [string]$TempDir = "./resources/typst_build",
  [string]$PdfCatalogPath = "./data/pdfs/catalog.json",
  [string]$HtmlRendererScript = "./scripts/render_hugo_pdfs.mjs"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

Write-Host "Outside In Print ~ $Mode Hybrid PDF Builder" -ForegroundColor Cyan

$HtmlSiteDir = Join-Path $TempDir "__html_site"
$HtmlManifestPath = Join-Path $TempDir "__html_pdf_jobs.json"
$HtmlResultsPath = Join-Path $TempDir "__html_pdf_results.json"
$AllowedSections = @("essays", "literature", "reports", "syd-and-oliver", "working-papers")
$EditionTemplatePath = "./templates/edition.typ"
$CatalogSyncScript = "./scripts/sync_pdf_catalog.ps1"
$RepoRoot = (Resolve-Path ".").Path

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
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $($Arguments -join ' ')"
  }
}

function Invoke-NativeCapture {
  param(
    [string]$Command,
    [string[]]$Arguments,
    [string]$CaptureStem
  )

  $stdoutPath = Join-Path $TempDir "$CaptureStem.stdout.txt"
  $stderrPath = Join-Path $TempDir "$CaptureStem.stderr.txt"
  $startProcessArgs = @{
    FilePath = $Command
    ArgumentList = $Arguments
    Wait = $true
    PassThru = $true
    RedirectStandardOutput = $stdoutPath
    RedirectStandardError = $stderrPath
  }
  if ($IsWindows) {
    $startProcessArgs.WindowStyle = 'Hidden'
  }
  $process = Start-Process @startProcessArgs
  $stdout = if (Test-Path -Path $stdoutPath -PathType Leaf) { Get-Content -Path $stdoutPath -Raw } else { "" }
  $stderr = if (Test-Path -Path $stderrPath -PathType Leaf) { Get-Content -Path $stderrPath -Raw } else { "" }

  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $stdout
    Stderr = $stderr
  }
}

function Read-Utf8Text {
  param([string]$Path)
  return [System.IO.File]::ReadAllText((Resolve-Path $Path), [System.Text.Encoding]::UTF8)
}

function Write-Utf8Text {
  param([string]$Path,[string]$Value)
  [System.IO.File]::WriteAllText($Path, $Value, [System.Text.UTF8Encoding]::new($false))
}

function Write-JsonFile {
  param([string]$Path,[object]$Value)
  $json = $Value | ConvertTo-Json -Depth 8
  Write-Utf8Text -Path $Path -Value $json
}

function Remove-UnsupportedControlChars {
  param([string]$Value)

  if ($null -eq $Value) {
    return ""
  }

  return [regex]::Replace($Value, "[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]", "")
}

function Repair-CommonTextArtifacts {
  param([string]$Value)

  if ([string]::IsNullOrEmpty($Value)) {
    return ""
  }

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
  $fixed = $fixed.Replace([string][char]0x00C2, "")
  $fixed = $fixed.Replace([string][char]0xFFFD, "")
  return $fixed
}

function Get-TextArtifactScore {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return 0
  }

  $score = 0
  foreach ($marker in @(
      [string][char]0x00C2,
      [string][char]0x00C3,
      [string][char]0x00E2,
      [string][char]0x00F0,
      [string][char]0xFFFD
    )) {
    $score += ([regex]::Matches($Value, [regex]::Escape($marker))).Count
  }

  return $score
}

function Get-PlainTextFromHtml {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  $text = [System.Net.WebUtility]::HtmlDecode($Value)
  $text = [regex]::Replace($text, '(?is)<br\s*/?>', "`n")
  $text = [regex]::Replace($text, '(?is)</p\s*>', "`n`n")
  $text = [regex]::Replace($text, '(?is)<[^>]+>', ' ')
  $text = [regex]::Replace($text, '\s+', ' ').Trim()
  return (Repair-CommonTextArtifacts -Value $text)
}

function Get-StringSha256 {
  param([string]$Value)

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    $hash = $sha.ComputeHash($bytes)
    return ([System.BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant())
  }
  finally {
    $sha.Dispose()
  }
}

function Get-FileBytesSignatureExtension {
  param([string]$Path)

  if (-not (Test-Path -Path $Path -PathType Leaf)) {
    return ""
  }

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $buffer = New-Object byte[] 12
    $read = $stream.Read($buffer, 0, $buffer.Length)
  }
  finally {
    $stream.Dispose()
  }

  if ($read -ge 8 -and $buffer[0] -eq 0x89 -and $buffer[1] -eq 0x50 -and $buffer[2] -eq 0x4E -and $buffer[3] -eq 0x47) {
    return ".png"
  }

  if ($read -ge 3 -and $buffer[0] -eq 0xFF -and $buffer[1] -eq 0xD8 -and $buffer[2] -eq 0xFF) {
    return ".jpg"
  }

  if ($read -ge 6) {
    $header = [System.Text.Encoding]::ASCII.GetString($buffer, 0, [Math]::Min($read, 6))
    if ($header -in @("GIF87a", "GIF89a")) {
      return ".gif"
    }
  }

  if ($read -ge 12) {
    $riff = [System.Text.Encoding]::ASCII.GetString($buffer, 0, 4)
    $webp = [System.Text.Encoding]::ASCII.GetString($buffer, 8, 4)
    if ($riff -eq "RIFF" -and $webp -eq "WEBP") {
      return ".webp"
    }
  }

  return ""
}

function Test-ControlledRemoteImageUrl {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }

  try {
    $uri = [Uri]$Value
    return $uri.Host -match '(^|\.)medium\.com$|(^|\.)cdn-images-\d+\.medium\.com$|(^|\.)miro\.medium\.com$'
  }
  catch {
    return $false
  }
}

function Get-RemoteImageCachePath {
  param(
    [string]$Url,
    [string]$CacheNamespace
  )

  $cacheRoot = Join-Path $TempDir "__remote_cache"
  $namespace = if ([string]::IsNullOrWhiteSpace($CacheNamespace)) { "shared" } else { $CacheNamespace }
  $targetDirectory = Join-Path $cacheRoot $namespace
  New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null

  $hash = Get-StringSha256 -Value $Url
  $path = [Uri]$Url
  $extension = [System.IO.Path]::GetExtension($path.AbsolutePath)
  if ([string]::IsNullOrWhiteSpace($extension) -or $extension.Length -gt 5) {
    $extension = ".img"
  }

  return [pscustomobject]@{
    TempPath = Join-Path $targetDirectory "$hash.download"
    FinalPath = Join-Path $targetDirectory "$hash$extension"
  }
}

function Try-LocalizeRemoteImage {
  param(
    [string]$Url,
    [string]$TempSourcePath,
    [string]$CacheNamespace
  )

  if (-not (Test-ControlledRemoteImageUrl -Value $Url)) {
    return ""
  }

  $cachePaths = Get-RemoteImageCachePath -Url $Url -CacheNamespace $CacheNamespace
  if (Test-Path -Path $cachePaths.FinalPath -PathType Leaf) {
    return Get-RelativePathBetween -FromPath $TempSourcePath -ToPath $cachePaths.FinalPath
  }

  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $cachePaths.TempPath -TimeoutSec 25 | Out-Null
    $sniffedExtension = Get-FileBytesSignatureExtension -Path $cachePaths.TempPath
    $finalPath = $cachePaths.FinalPath

    if ($sniffedExtension) {
      $finalPath = [System.IO.Path]::ChangeExtension($cachePaths.FinalPath, $sniffedExtension)
    }

    if (Test-Path -Path $finalPath -PathType Leaf) {
      Remove-Item -Path $finalPath -Force
    }

    Move-Item -Path $cachePaths.TempPath -Destination $finalPath
    return Get-RelativePathBetween -FromPath $TempSourcePath -ToPath $finalPath
  }
  catch {
    if (Test-Path -Path $cachePaths.TempPath -PathType Leaf) {
      Remove-Item -Path $cachePaths.TempPath -Force -ErrorAction SilentlyContinue
    }
    return ""
  }
}

function Convert-HtmlAnchorToMarkdown {
  param([System.Text.RegularExpressions.Match]$Match)

  $url = (Repair-CommonTextArtifacts -Value $Match.Groups["url"].Value).Trim()
  if ([string]::IsNullOrWhiteSpace($url)) {
    return Get-PlainTextFromHtml -Value $Match.Groups["text"].Value
  }

  $text = Get-PlainTextFromHtml -Value $Match.Groups["text"].Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    $text = $url
  }

  return "[$text]($url)"
}

function Get-FigureCaptionMarkdown {
  param([string]$Caption)

  $cleanCaption = Get-PlainTextFromHtml -Value $Caption
  if ([string]::IsNullOrWhiteSpace($cleanCaption)) {
    return ""
  }

  return "`r`n> $cleanCaption"
}

function Convert-HtmlFigureToMarkdown {
  param(
    [System.Text.RegularExpressions.Match]$Match,
    [System.IO.FileInfo]$SourceFile,
    [string]$TempSourcePath,
    [string]$CacheNamespace,
    [hashtable]$State
  )

  $content = $Match.Groups["content"].Value
  $captionMatch = [regex]::Match($content, '(?is)<figcaption\b[^>]*>(?<caption>.*?)</figcaption>')
  $captionMarkdown = Get-FigureCaptionMarkdown -Caption $captionMatch.Groups["caption"].Value

  if ($content -match '(?is)<iframe\b|graf--iframe|<video\b|<audio\b|<script\b') {
    $State.Embeds++
    return "> Web-only embed preserved in the HTML edition.$captionMarkdown`r`n"
  }

  $imgMatch = [regex]::Match($content, '(?is)<img\b(?<attrs>[^>]*)/?\s*>')
  if (-not $imgMatch.Success) {
    return $captionMarkdown
  }

  $attrs = $imgMatch.Groups["attrs"].Value
  $srcMatch = [regex]::Match($attrs, '(?is)\bsrc\s*=\s*["''](?<src>[^"'']+)["'']')
  if (-not $srcMatch.Success) {
    return $captionMarkdown
  }

  $imageRef = (Repair-CommonTextArtifacts -Value $srcMatch.Groups["src"].Value).Trim()
  $altMatch = [regex]::Match($attrs, '(?is)\balt\s*=\s*["''](?<alt>[^"'']*)["'']')
  $alt = Get-PlainTextFromHtml -Value $altMatch.Groups["alt"].Value
  $resolved = Resolve-ImageSourcePath -ImageRef $imageRef -SourceFile $SourceFile -TempSourcePath $TempSourcePath

  if (-not $resolved -and (Test-RemoteUrl -Value $imageRef)) {
    $localized = Try-LocalizeRemoteImage -Url $imageRef -TempSourcePath $TempSourcePath -CacheNamespace $CacheNamespace
    if ($localized) {
      $resolved = $localized
      $State.LocalizedRemote++
    }
  }

  if ($resolved) {
    $State.Local++
    return "![${alt}]($resolved)$captionMarkdown`r`n"
  }

  if (Test-RemoteUrl -Value $imageRef) {
    $State.Remote++
    return "> Image kept on web edition only.$captionMarkdown`r`n"
  }

  return $captionMarkdown
}

function Get-ContentComplexityProfile {
  param([string]$RawBody)

  $htmlBlockCount = ([regex]::Matches($RawBody, '(?im)^\s*</?(?:div|figure|figcaption|iframe|img|picture|video|audio|details|summary|span|a)\b')).Count
  $embedCount = ([regex]::Matches($RawBody, '(?is)<iframe\b|graf--iframe|youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|substackcdn\.com')).Count
  $wrapperCount = ([regex]::Matches($RawBody, '(?is)graf--|section-inner|section-content|section-divider|markup--anchor|js-mixtapeImage')).Count
  $remoteImageCount = ([regex]::Matches($RawBody, '!\[[^\]]*\]\((?<url>https?://[^)\s]+)')).Count + ([regex]::Matches($RawBody, '(?is)<img\b[^>]*\bsrc\s*=\s*["'']https?://')).Count
  $mojibakeCount = Get-TextArtifactScore -Value $RawBody
  $rawHtmlScore = ($htmlBlockCount * 2) + ($embedCount * 4) + $wrapperCount + $remoteImageCount + [Math]::Min($mojibakeCount * 2, 8)

  return [pscustomobject]@{
    HtmlBlockCount = $htmlBlockCount
    EmbedCount = $embedCount
    WrapperCount = $wrapperCount
    RemoteImageCount = $remoteImageCount
    MojibakeCount = $mojibakeCount
    RawHtmlScore = $rawHtmlScore
    ShouldUseHtml = ($rawHtmlScore -ge 14) -or ($embedCount -ge 2) -or (($htmlBlockCount -ge 6) -and ($remoteImageCount -ge 2))
  }
}

function Get-TypstFailureDetail {
  param([string]$Stderr)

  if ([string]::IsNullOrWhiteSpace($Stderr)) {
    return ""
  }

  $lineMatch = [regex]::Match($Stderr, ':(?<line>\d+):(?<column>\d+)')
  $firstLine = ($Stderr -split "\r?\n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)

  if ($lineMatch.Success) {
    return "line $($lineMatch.Groups['line'].Value):$($lineMatch.Groups['column'].Value) - $firstLine".Trim()
  }

  return $firstLine.Trim()
}

function Get-TypstFailureCause {
  param(
    [string]$Stderr,
    [string]$Body,
    [pscustomobject]$Profile
  )

  $errorText = "$Stderr`n$Body"
  if ($errorText -match '(?is)<iframe\b|graf--iframe|youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|Web-only embed') {
    return "embed"
  }

  if ((Get-TextArtifactScore -Value $errorText) -gt 0) {
    return "mojibake"
  }

  if ($errorText -match '(?is)<(?:div|span|figure|figcaption|iframe|picture|video|audio|details|summary|section|article)\b') {
    return "raw_html"
  }

  if ($errorText -match '(?is)image\("|Image kept on web edition only\.') {
    return "image_ref"
  }

  if ($null -ne $Profile -and $Profile.RawHtmlScore -ge 14) {
    return "raw_html"
  }

  return "unknown"
}

function Get-FailureCauseLabel {
  param([string]$Cause)

  switch ($Cause) {
    "raw_html" { return "complex imported HTML" }
    "embed" { return "unsupported embedded media" }
    "mojibake" { return "text encoding artifacts" }
    "image_ref" { return "image handling issues" }
    default { return "" }
  }
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
    return $full.Substring($root.Length).TrimStart([char[]]@([char]'\', [char]'/'))
  }
  return $full
}

function Get-RelativePathBetween {
  param([string]$FromPath,[string]$ToPath)

  $fromDirectory = Split-Path -Path $FromPath -Parent
  return ([System.IO.Path]::GetRelativePath($fromDirectory, $ToPath) -replace '\\', '/')
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

function Get-SafeFileSlug {
  param([string]$Slug)

  if ([string]::IsNullOrWhiteSpace($Slug)) {
    return "untitled"
  }

  $safe = $Slug -replace '[^A-Za-z0-9._-]', '-'
  $safe = $safe -replace '-+', '-'
  $safe = $safe.Trim('-')
  if ([string]::IsNullOrWhiteSpace($safe)) {
    return "untitled"
  }

  return $safe
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

  $escaped = $Value -replace '\\', '\\\\'
  $escaped = $escaped -replace '"', '\"'
  $escaped = $escaped -replace "`r?`n", "\\n"
  return $escaped
}

function Get-SiteBaseUrl {
  param([string]$ConfigPath)

  if (-not (Test-Path -Path $ConfigPath -PathType Leaf)) {
    return ""
  }

  $config = Read-Utf8Text -Path $ConfigPath
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
  return ([regex]::Matches($body, "\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b")).Count
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

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return ""
  }

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
  if ([string]::IsNullOrWhiteSpace($cleanUrl)) {
    return
  }

  if ($cleanUrl -match "\.(jpg|jpeg|png|gif|webp|svg)(\?|$)") {
    return
  }

  if ($Seen.ContainsKey($cleanUrl)) {
    return
  }

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

function Get-PdfEngine {
  param([hashtable]$FrontMatter)

  if ($FrontMatter.ContainsKey("pdf_engine") -and -not [string]::IsNullOrWhiteSpace($FrontMatter["pdf_engine"])) {
    return $FrontMatter["pdf_engine"].Trim().ToLowerInvariant()
  }

  return ""
}

function Get-PdfVariant {
  param([hashtable]$FrontMatter,[string]$Section,[string]$Engine)

  if ($FrontMatter.ContainsKey("pdf_variant") -and -not [string]::IsNullOrWhiteSpace($FrontMatter["pdf_variant"])) {
    return $FrontMatter["pdf_variant"].Trim().ToLowerInvariant()
  }

  if ($Engine -eq "html") {
    return "visual"
  }

  if ($Section -in @("reports", "working-papers")) {
    return "report"
  }

  return "essay"
}

function Test-RemoteUrl {
  param([string]$Value)
  return $Value -match '^(?i:https?://)'
}

function Resolve-ImageSourcePath {
  param(
    [string]$ImageRef,
    [System.IO.FileInfo]$SourceFile,
    [string]$TempSourcePath
  )

  if ([string]::IsNullOrWhiteSpace($ImageRef)) {
    return ""
  }

  $cleanRef = $ImageRef.Trim().Trim('<', '>')
  if (Test-RemoteUrl -Value $cleanRef) {
    return ""
  }

  $candidatePaths = [System.Collections.Generic.List[string]]::new()
  if ($cleanRef.StartsWith('/')) {
    $candidatePaths.Add((Join-Path $RepoRoot ("static/" + $cleanRef.TrimStart('/'))))
  }
  else {
    $candidatePaths.Add((Join-Path $SourceFile.DirectoryName $cleanRef))
    $candidatePaths.Add((Join-Path $RepoRoot $cleanRef))
    $candidatePaths.Add((Join-Path $RepoRoot ("static/" + $cleanRef.TrimStart('./'))))
  }

  foreach ($candidate in $candidatePaths) {
    try {
      $resolved = [System.IO.Path]::GetFullPath($candidate)
      if (Test-Path -Path $resolved -PathType Leaf) {
        return Get-RelativePathBetween -FromPath $TempSourcePath -ToPath $resolved
      }
    }
    catch {
    }
  }

  return ""
}

function Test-StandaloneHeadingCandidate {
  param([string]$Line)

  $trimmed = $Line.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    return $false
  }

  if ($trimmed.Length -gt 84) {
    return $false
  }

  if ($trimmed -match '^(#|>|[-*+]\s|\d+\.\s|!\[|<|```|---$)') {
    return $false
  }

  if ($trimmed -match '[:;,.!?]$') {
    return $false
  }

  if ($trimmed -match 'https?://|\[|\]|\(|\)|\|') {
    return $false
  }

  if ($trimmed -notmatch '^[A-Z0-9"'']') {
    return $false
  }

  return $true
}

function Convert-StandaloneSectionLines {
  param([string]$Text)

  $lines = $Text -split "\r?\n"
  $result = [System.Collections.Generic.List[string]]::new()

  for ($index = 0; $index -lt $lines.Length; $index++) {
    $line = $lines[$index]
    $prevLine = if ($index -gt 0) { $lines[$index - 1] } else { "" }
    $nextLine = if ($index -lt ($lines.Length - 1)) { $lines[$index + 1] } else { "" }

    if (
      (Test-StandaloneHeadingCandidate -Line $line) -and
      [string]::IsNullOrWhiteSpace($prevLine) -and
      [string]::IsNullOrWhiteSpace($nextLine)
    ) {
      $result.Add("## $($line.Trim())")
      continue
    }

    $result.Add($line)
  }

  return ($result -join "`r`n")
}

function Normalize-PandocSource {
  param(
    [string]$RawBody,
    [System.IO.FileInfo]$SourceFile,
    [string]$TempSourcePath,
    [string]$CacheNamespace
  )

  $source = Remove-UnsupportedControlChars -Value $RawBody
  $source = Repair-CommonTextArtifacts -Value $source
  $state = @{
    Local = 0
    Remote = 0
    LocalizedRemote = 0
    Embeds = 0
  }

  $source = [regex]::Replace($source, '(?is)<a\b[^>]*href=["''](?<url>[^"'']+)["''][^>]*>(?<text>.*?)</a>', {
      param($match)
      Convert-HtmlAnchorToMarkdown -Match $match
    })

  $source = [regex]::Replace($source, '(?is)<figure\b[^>]*>(?<content>.*?)</figure>', {
      param($match)
      Convert-HtmlFigureToMarkdown -Match $match -SourceFile $SourceFile -TempSourcePath $TempSourcePath -CacheNamespace $CacheNamespace -State $state
    })

  $source = [regex]::Replace($source, '(?is)<img\b(?<attrs>[^>]*)/?\s*>', {
      param($match)

      $attrs = $match.Groups["attrs"].Value
      $srcMatch = [regex]::Match($attrs, '(?is)\bsrc\s*=\s*["''](?<src>[^"'']+)["'']')
      if (-not $srcMatch.Success) {
        return ''
      }

      $imageRef = (Repair-CommonTextArtifacts -Value $srcMatch.Groups["src"].Value).Trim()
      $altMatch = [regex]::Match($attrs, '(?is)\balt\s*=\s*["''](?<alt>[^"'']*)["'']')
      $alt = Get-PlainTextFromHtml -Value $altMatch.Groups["alt"].Value
      $resolved = Resolve-ImageSourcePath -ImageRef $imageRef -SourceFile $SourceFile -TempSourcePath $TempSourcePath

      if (-not $resolved -and (Test-RemoteUrl -Value $imageRef)) {
        $localized = Try-LocalizeRemoteImage -Url $imageRef -TempSourcePath $TempSourcePath -CacheNamespace $CacheNamespace
        if ($localized) {
          $resolved = $localized
          $state.LocalizedRemote++
        }
      }

      if ($resolved) {
        $state.Local++
        return "![${alt}]($resolved)"
      }

      if (Test-RemoteUrl -Value $imageRef) {
        $state.Remote++
        return "> Image kept on web edition only."
      }

      return ''
    })

  $source = [regex]::Replace($source, '(?is)</?(?:div|span|section|article)\b[^>]*>', '')
  $source = [regex]::Replace($source, '(?im)^\s*-{20,}\s*$', '')
  $source = $source -replace '(?m)^\s*(Read more|Continue reading|Read the full story)\b.*$', ''
  $source = $source -replace '(?m)^\s*(class=|data-href=|target=|markup--|js-mixtapeImage).*$',''
  $source = $source -replace '(?m)^\s*\[\s*\]\(\s*[^)]*\)\s*$', ''
  $source = $source -replace '(?m)\[\s*([^\]]+?)\s*\]\(\s*\)', '$1'
  $source = $source -replace '(?m)^[\u2022]\s+', '- '
  $source = $source -replace '(?m)^\s*</?(?:figcaption|figure|iframe|picture|video|audio|details|summary)\b[^>]*>\s*$', ''
  $source = $source -replace '(?m)^\s*(?:Read the full opinion \(PDF\)|Read More)\s*$', '$0'

  $lines = $source -split "\r?\n"
  $normalizedLines = [System.Collections.Generic.List[string]]::new()
  for ($index = 0; $index -lt $lines.Length; $index++) {
    $line = $lines[$index]
    if ($line -match '^\s*(?:-|\d+\.)\s+(.+?)\s*$') {
      $nextLine = ""
      if ($index -lt ($lines.Length - 1)) {
        $nextLine = $lines[$index + 1]
      }
      if (-not [string]::IsNullOrWhiteSpace($nextLine) -and $nextLine -notmatch '^\s*(?:-|\d+\.)\s+') {
        $normalizedLines.Add("### $($Matches[1])")
        continue
      }
    }
    $normalizedLines.Add($line)
  }

  $source = ($normalizedLines -join "`r`n")
  $source = Convert-StandaloneSectionLines -Text $source

  $imagePattern = '!\[(?<alt>[^\]]*)\]\((?<url>[^)\s]+)(?<tail>[^)]*)\)'
  $source = [regex]::Replace($source, $imagePattern, {
      param($match)

      $url = $match.Groups["url"].Value
      $resolved = Resolve-ImageSourcePath -ImageRef $url -SourceFile $SourceFile -TempSourcePath $TempSourcePath
      if ($resolved) {
        $state.Local++
        return ('![{0}]({1}{2})' -f $match.Groups["alt"].Value, $resolved, $match.Groups["tail"].Value)
      }

      if (Test-RemoteUrl -Value $url) {
        $localized = Try-LocalizeRemoteImage -Url $url -TempSourcePath $TempSourcePath -CacheNamespace $CacheNamespace
        if ($localized) {
          $state.Local++
          $state.LocalizedRemote++
          return ('![{0}]({1}{2})' -f $match.Groups["alt"].Value, $localized, $match.Groups["tail"].Value)
        }

        $state.Remote++
        return "> Image kept on web edition only."
      }

      return $match.Value
    })

  $source = $source -replace '(?m)^\s*>\s*Image kept on web edition only\.\s*>\s*Image kept on web edition only\.\s*$', '> Image kept on web edition only.'
  $source = [regex]::Replace($source, '(?m)^[^\p{L}\p{N}\[]+(?=Read the full (?:opinion|report) \(PDF\))', '')
  $source = $source -replace '(?m)^\s*Read the full opinion \(PDF\)\s*\[(?<url>https?://[^\]]+)\]$', '[Read the full opinion (PDF)](${url})'
  $source = [regex]::Replace($source, '(?m)^\s*(Read the full opinion \(PDF\)|Read the full report \(PDF\))\s*$', '$1')
  $source = [regex]::Replace($source, '(?:\r?\n){3,}', "`r`n`r`n")
  $source = $source.Trim() + "`r`n"

  return @{
    Source = $source
    LocalImageCount = $state.Local
    RemoteImageCount = $state.Remote
    LocalizedRemoteImageCount = $state.LocalizedRemote
    EmbedCount = $state.Embeds
  }
}

function Normalize-TypstBody {
  param(
    [string]$Path,
    [string]$Title,
    [string]$Subtitle
  )

  if (-not (Test-Path -Path $Path -PathType Leaf)) {
    return @{
      Body = ''
      HeadingCount = 0
      PlaceholderCount = 0
    }
  }

  $body = Read-Utf8Text -Path $Path
  $body = Repair-CommonTextArtifacts -Value $body
  $placeholderState = @{
    Count = 0
  }

  $body = $body -replace '(?m)^#horizontalrule\s*$', ''
  $body = $body -replace '(?m)^#line\(length: 100%\)\s*$', ''
  $body = [regex]::Replace($body, '#box\(image\("https?://[^"\r\n]+"\)\)', {
      $placeholderState.Count++
      '#block(inset: 12pt, stroke: 0.45pt + luma(175), radius: 4pt, above: 1.1em, below: 1.1em)[#align(center)[#set text(size: 9pt, style: "italic", fill: luma(120))[Image kept on web edition only.]]]'
    })
  $body = [regex]::Replace($body, '#image\("https?://[^"\r\n]+"\)', {
      $placeholderState.Count++
      '#block(inset: 12pt, stroke: 0.45pt + luma(175), radius: 4pt, above: 1.1em, below: 1.1em)[#align(center)[#set text(size: 9pt, style: "italic", fill: luma(120))[Image kept on web edition only.]]]'
    })
  $body = [regex]::Replace($body, '#cite\([^\)]*\)', '')
  $body = [regex]::Replace($body, '(?ms)#block\[\s*[^#\[\]]*?www\.[^\]]*?\]', '')
  $body = [regex]::Replace($body, '(?m)^\s*</?(?:div|span|figure|figcaption|iframe|picture|video|audio|details|summary|section|article)[^>]*>\s*$', '')
  $body = [regex]::Replace($body, '(?is)<(?:div|span|figure|figcaption|iframe|picture|video|audio|details|summary|section|article)\b[^>]*>', '')
  $body = [regex]::Replace($body, '(?is)</(?:div|span|figure|figcaption|iframe|picture|video|audio|details|summary|section|article)>', '')
  $body = [regex]::Replace($body, '(?m)^<[A-Za-z0-9_.-]+>\s*$', '')
  $body = $body -replace '\\~', '~'
  $body = $body -replace '(?m)^[\u2022]\s+', '+ '
  $body = [regex]::Replace($body, '(?m)^[^\p{L}\p{N}\[]+(?=Read the full (?:opinion|report) \(PDF\))', '')
  $body = $body.Replace([string][char]0x00C2, '')
  $body = $body.Replace([string][char]0xFFFD, '')
  $body = [regex]::Replace($body, '(?m)^\s*Image kept on web edition only\.\s*$', '#block(inset: 12pt, stroke: 0.45pt + luma(175), radius: 4pt, above: 1.1em, below: 1.1em)[#align(center)[#set text(size: 9pt, style: "italic", fill: luma(120))[Image kept on web edition only.]]]')

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

  $body = [regex]::Replace($body, '(?m)^[ \t]+$', '')
  $body = [regex]::Replace($body, '(?:\r?\n){3,}', "`r`n`r`n")
  $body = $body.Trim() + "`r`n"

  Write-Utf8Text -Path $Path -Value $body
  $headingCount = ([regex]::Matches($body, '(?m)^=+\s+')).Count
  return @{
    Body = $body
    HeadingCount = $headingCount
    PlaceholderCount = $placeholderState.Count
  }
}

function Resolve-CoverImagePath {
  param(
    [hashtable]$FrontMatter,
    [System.IO.FileInfo]$SourceFile,
    [string]$TypDocPath
  )

  if (-not $FrontMatter.ContainsKey("pdf_cover_image")) {
    return ""
  }

  $resolved = Resolve-ImageSourcePath -ImageRef $FrontMatter["pdf_cover_image"] -SourceFile $SourceFile -TempSourcePath $TypDocPath
  if (-not $resolved) {
    return ""
  }

  return $resolved
}

function Get-AvailableTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  }
  finally {
    $listener.Stop()
  }
}

function Get-HtmlRenderUnavailableReason {
  if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    return "node is not available in PATH"
  }

  if (-not (Get-Command "hugo" -ErrorAction SilentlyContinue)) {
    return "hugo is not available in PATH"
  }

  if (-not (Test-Path -Path $HtmlRendererScript -PathType Leaf)) {
    return "the Playwright renderer script is missing at $HtmlRendererScript"
  }

  $probe = Invoke-NativeCapture -Command "node" -Arguments @(
    '--input-type=module',
    '-e',
    "import('playwright').then(async ({ chromium }) => { const browser = await chromium.launch({ headless: true }); await browser.close(); }).catch((error) => { console.error(error && error.message ? error.message : String(error)); process.exit(1); });"
  ) -CaptureStem "html-renderer-probe"

  if ($probe.ExitCode -eq 0) {
    return ""
  }

  $detail = ($probe.Stderr, $probe.Stdout | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
  if ($detail) {
    return "$($detail.Trim()) Run 'npm install' and 'npx playwright install chromium'."
  }

  return "Playwright/Chromium could not be started. Run 'npm install' and 'npx playwright install chromium'."
}

function Resolve-HtmlOutputPath {
  param([string]$Section,[string]$Slug)

  $candidates = @(
    (Join-Path $HtmlSiteDir "$Section/$Slug/index.html"),
    (Join-Path $HtmlSiteDir "$Section/$Slug.html"),
    (Join-Path $HtmlSiteDir "$Slug/index.html")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -Path $candidate -PathType Leaf) {
      return $candidate
    }
  }

  return ""
}

function Get-HtmlPageRoute {
  param([string]$HtmlPath)

  $relativePath = Get-RelativePath -RootPath $HtmlSiteDir -FullPath $HtmlPath
  $webPath = ($relativePath -replace '\\', '/').TrimStart('/')

  if ($webPath.EndsWith('/index.html')) {
    return "/" + $webPath.Substring(0, $webPath.Length - '/index.html'.Length) + "/"
  }

  if ($webPath -eq 'index.html') {
    return "/"
  }

  return "/" + $webPath
}

function Invoke-HtmlPdfBatchRender {
  param(
    [System.Collections.IList]$Jobs
  )

  if ($Jobs.Count -eq 0) {
    return @{}
  }

  Require-NativeCommand -Name "node"
  Require-NativeCommand -Name "hugo"

  if (Test-Path -Path $HtmlSiteDir -PathType Container) {
    Remove-Item -Recurse -Force $HtmlSiteDir
  }
  New-Item -ItemType Directory -Force -Path $HtmlSiteDir | Out-Null

  $port = Get-AvailableTcpPort
  $baseUrl = "http://127.0.0.1:$port/"

  $priorAnalyticsEnabled = $env:ANALYTICS_ENABLED
  $priorAnalyticsAllowLocal = $env:ANALYTICS_ALLOW_LOCAL
  try {
    $env:ANALYTICS_ENABLED = "false"
    $env:ANALYTICS_ALLOW_LOCAL = "false"

    Invoke-NativeOrThrow -Command "hugo" -Arguments @(
      '--contentDir', $ContentRoot,
      '--destination', $HtmlSiteDir,
      '--baseURL', $baseUrl,
      '--quiet'
    )
  }
  finally {
    $env:ANALYTICS_ENABLED = $priorAnalyticsEnabled
    $env:ANALYTICS_ALLOW_LOCAL = $priorAnalyticsAllowLocal
  }

  $manifestJobs = New-Object System.Collections.Generic.List[object]
  foreach ($job in $Jobs) {
    $htmlPath = Resolve-HtmlOutputPath -Section $job.section -Slug $job.slug
    if (-not $htmlPath) {
      throw "Could not locate built HTML for $($job.section)/$($job.slug)"
    }

    $manifestJobs.Add([ordered]@{
      slug = $job.slug
      route = Get-HtmlPageRoute -HtmlPath $htmlPath
      outputPath = $job.pdf_path
      waitForSelector = '[data-pdf-render-root]'
    })
  }

  Write-JsonFile -Path $HtmlManifestPath -Value ([ordered]@{
      outputDir = $HtmlSiteDir
      baseUrl = $baseUrl
      timeoutMs = 45000
      viewport = [ordered]@{
        width = 1400
        height = 1900
      }
      pdf = [ordered]@{
        format = 'Letter'
        printBackground = $true
        preferCSSPageSize = $true
        margin = [ordered]@{
          top = '0.55in'
          right = '0.6in'
          bottom = '0.65in'
          left = '0.6in'
        }
      }
      jobs = $manifestJobs
    })

  $render = Invoke-NativeCapture -Command "node" -Arguments @(
    $HtmlRendererScript,
    '--manifest', $HtmlManifestPath,
    '--results', $HtmlResultsPath
  ) -CaptureStem "html-renderer"

  if ($render.ExitCode -ne 0) {
    $detail = ($render.Stderr, $render.Stdout | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
    if (-not $detail) {
      $detail = "Unknown Playwright rendering error."
    }
    throw "HTML PDF rendering failed. $($detail.Trim())"
  }

  $results = Get-Content -Raw $HtmlResultsPath | ConvertFrom-Json
  $bySlug = @{}
  foreach ($result in $results.results) {
    if (-not [bool]$result.ok) {
      throw "HTML PDF rendering failed for '$($result.slug)'. $($result.error)"
    }

    $bySlug[[string]$result.slug] = $result
  }

  return $bySlug
}

$siteBaseUrl = Get-SiteBaseUrl -ConfigPath "./hugo.toml"
$typstReady = $false
$htmlRendererUnavailableReason = $null
$htmlJobs = New-Object System.Collections.Generic.List[object]

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
  $summary = Repair-CommonTextArtifacts -Value $frontMatter['pdf_summary']
  $rawBody = Get-BodyWithoutFrontMatter -Raw $raw
  $complexityProfile = Get-ContentComplexityProfile -RawBody $rawBody
  $declaredEngine = Get-PdfEngine -FrontMatter $frontMatter
  $forceTypst = Is-TrueValue -Value ($frontMatter['pdf_force_typst'])
  $autoEngineSelected = $false
  $engine = if ($declaredEngine) { $declaredEngine } else { "typst" }
  if ((-not $declaredEngine) -and (-not $forceTypst) -and $complexityProfile.ShouldUseHtml) {
    $engine = "html"
    $autoEngineSelected = $true
  }
  $variant = Get-PdfVariant -FrontMatter $frontMatter -Section $section -Engine $engine

  if ([string]::IsNullOrWhiteSpace($title)) { $title = $slug }
  if ([string]::IsNullOrWhiteSpace($version)) { $version = '1.0' }
  if ([string]::IsNullOrWhiteSpace($edition)) { $edition = 'First digital edition' }
  if ([string]::IsNullOrWhiteSpace($sectionLabel)) { $sectionLabel = 'Piece' }

  if ($engine -notin @('typst', 'html')) {
    throw "Unsupported pdf_engine '$engine' for $($file.FullName)"
  }

  $pdfPath = Join-Path $PdfOutDir "$safeSlug.pdf"
  $buildMetaPath = Join-Path $TempDir "$safeSlug.pdfmeta.json"
  $wordCount = Get-ApproximateWordCount -Raw $raw
  $references = Get-ReferenceEntries -Raw $raw -FrontMatter $frontMatter
  $buildMeta = [ordered]@{
    slug = $slug
    engine = $engine
    variant = $variant
    auto_engine_selected = $autoEngineSelected
    raw_html_score = $complexityProfile.RawHtmlScore
    render_status = "unknown"
    show_toc = $false
    placeholder_count = 0
    omitted_remote_images = 0
    localized_remote_images = 0
    embed_count = $complexityProfile.EmbedCount
    local_image_count = 0
    reference_count = $references.Count
    failure_cause = ""
    failure_detail = ""
    failure_stderr = ""
    warnings = @()
  }

  if ($autoEngineSelected) {
    $buildMeta.warnings += "auto_engine_html"
  }

  if ($engine -eq 'html') {
    if ($null -eq $htmlRendererUnavailableReason) {
      $htmlRendererUnavailableReason = Get-HtmlRenderUnavailableReason
    }

    if (-not [string]::IsNullOrWhiteSpace($htmlRendererUnavailableReason)) {
      if ($autoEngineSelected) {
        Write-Warning "Auto-selected HTML PDF rendering is unavailable for '$slug' because $htmlRendererUnavailableReason. Falling back to Typst."
        $engine = "typst"
        $variant = Get-PdfVariant -FrontMatter $frontMatter -Section $section -Engine $engine
        $buildMeta.engine = $engine
        $buildMeta.variant = $variant
        $buildMeta.auto_engine_selected = $false
        $buildMeta.warnings += "auto_html_unavailable"
      }
      else {
        throw "HTML PDF rendering is unavailable because $htmlRendererUnavailableReason."
      }
    }

    if ($engine -eq 'html') {
      $htmlJobs.Add([ordered]@{
        slug = $slug
        section = $section
        pdf_path = $pdfPath
        build_meta_path = $buildMetaPath
        build_meta = $buildMeta
      })
      continue
    }
  }

  if (-not $typstReady) {
    Require-NativeCommand -Name "pandoc"
    Require-NativeCommand -Name "typst"
    if (-not (Test-Path -Path $EditionTemplatePath -PathType Leaf)) {
      throw "Missing Typst template: $EditionTemplatePath"
    }
    $typstReady = $true
  }

  $sanitizedSourcePath = Join-Path $TempDir "$safeSlug.source.md"
  $typBodyPath = Join-Path $TempDir "$safeSlug.body.typ"
  $typRefsPath = Join-Path $TempDir "$safeSlug.refs.typ"
  $typDocPath = Join-Path $TempDir "$safeSlug.typ"

  $normalizedSource = Normalize-PandocSource -RawBody $rawBody -SourceFile $file -TempSourcePath $sanitizedSourcePath -CacheNamespace $safeSlug
  $buildMeta.local_image_count = $normalizedSource.LocalImageCount
  $buildMeta.omitted_remote_images = $normalizedSource.RemoteImageCount
  $buildMeta.localized_remote_images = $normalizedSource.LocalizedRemoteImageCount
  $buildMeta.embed_count = $normalizedSource.EmbedCount
  if ($normalizedSource.RemoteImageCount -gt 0) {
    $buildMeta.warnings += "remote_images_omitted"
  }
  if ($normalizedSource.LocalizedRemoteImageCount -gt 0) {
    $buildMeta.warnings += "remote_images_localized"
  }

  Write-Utf8Text -Path $sanitizedSourcePath -Value $normalizedSource.Source
  Invoke-NativeOrThrow -Command "pandoc" -Arguments @(
    $sanitizedSourcePath,
    '-f', 'markdown+raw_attribute+raw_html',
    '-t', 'typst',
    '-o', $typBodyPath
  )

  $normalizedBody = Normalize-TypstBody -Path $typBodyPath -Title $title -Subtitle $subtitle
  $buildMeta.placeholder_count = $normalizedBody.PlaceholderCount
  $referencesContent = Get-ReferencesTypContent -References $references
  Write-Utf8Text -Path $typRefsPath -Value $referencesContent

  $tocDisabled = Is-TrueValue -Value ($frontMatter['pdf_disable_toc'])
  $showToc = (-not $tocDisabled) -and (
    ($wordCount -ge 2600) -or
    ($normalizedBody.HeadingCount -ge 7) -or
    (($variant -eq 'report') -and ($normalizedBody.HeadingCount -ge 4))
  )
  $compactFrontmatter = ($variant -ne 'report') -and (-not $showToc) -and ($wordCount -lt 1400)
  $showColophon = -not $compactFrontmatter
  $buildMeta.show_toc = $showToc

  $escapedTitle = Escape-TypstString -Value $title
  $escapedSubtitle = Escape-TypstString -Value $subtitle
  $escapedSummary = Escape-TypstString -Value $summary
  $escapedSectionLabel = Escape-TypstString -Value $sectionLabel
  $escapedDate = Escape-TypstString -Value $date
  $escapedVersion = Escape-TypstString -Value $version
  $escapedEdition = Escape-TypstString -Value $edition
  $escapedVariant = Escape-TypstString -Value $variant

  $articleRelativePath = "$section/$slug/"
  $articleUrl = if ([string]::IsNullOrWhiteSpace($siteBaseUrl)) { "/$articleRelativePath" } else { "$siteBaseUrl$articleRelativePath" }
  $escapedUrl = Escape-TypstString -Value $articleUrl
  $coverImagePath = Resolve-CoverImagePath -FrontMatter $frontMatter -SourceFile $file -TypDocPath $typDocPath
  $escapedCoverImagePath = Escape-TypstString -Value $coverImagePath
  $docDateExpression = Get-TypstDateExpression -Value $date
  $bodyFileName = "$safeSlug.body.typ"
  $refsFileName = "$safeSlug.refs.typ"
  $showTocTypst = if ($showToc) { 'true' } else { 'false' }
  $compactFrontmatterTypst = if ($compactFrontmatter) { 'true' } else { 'false' }
  $showColophonTypst = if ($showColophon) { 'true' } else { 'false' }

  $doc = @"
#import "../../templates/edition.typ": render
#let article_body = include("$bodyFileName")
#let reference_body = include("$refsFileName")

#render(
  title: "$escapedTitle",
  subtitle: "$escapedSubtitle",
  summary: "$escapedSummary",
  variant: "$escapedVariant",
  section_label: "$escapedSectionLabel",
  date: "$escapedDate",
  version: "$escapedVersion",
  edition: "$escapedEdition",
  author: "Outside In Print",
  url: "$escapedUrl",
  cover_image_path: "$escapedCoverImagePath",
  doc_date: $docDateExpression,
  show_toc: $showTocTypst,
  compact_frontmatter: $compactFrontmatterTypst,
  show_colophon: $showColophonTypst,
  body: article_body,
  references: reference_body,
)
"@

  Write-Utf8Text -Path $typDocPath -Value $doc

  $primaryCompile = Invoke-NativeCapture -Command "typst" -Arguments @(
    'compile',
    '--root', '.',
    $typDocPath,
    $pdfPath
  ) -CaptureStem "$safeSlug.primary-compile"

  if ($primaryCompile.ExitCode -eq 0 -and (Test-Path -Path $pdfPath -PathType Leaf)) {
    $buildMeta.render_status = "primary"
    Write-Host "Built: $pdfPath" -ForegroundColor Green
  }
  else {
    $buildMeta.failure_cause = Get-TypstFailureCause -Stderr $primaryCompile.Stderr -Body $normalizedBody.Body -Profile $complexityProfile
    $buildMeta.failure_detail = Get-TypstFailureDetail -Stderr $primaryCompile.Stderr
    $buildMeta.failure_stderr = ($primaryCompile.Stderr | Out-String).Trim()
    Write-Warning "Primary PDF render failed for '$slug'. Generating fallback PDF."

    $fallbackBodyPath = Join-Path $TempDir "$safeSlug.fallback.body.typ"
    $fallbackRefsPath = Join-Path $TempDir "$safeSlug.fallback.refs.typ"
    $fallbackDocPath = Join-Path $TempDir "$safeSlug.fallback.typ"
    $failureLabel = Get-FailureCauseLabel -Cause $buildMeta.failure_cause
    $fallbackDetailLine = if ([string]::IsNullOrWhiteSpace($failureLabel)) {
      "The original article body contained markup that could not be rendered automatically in Typst. A simplified archival edition was generated instead."
    } else {
      "The original article body included $failureLabel that could not be rendered automatically in Typst. A simplified archival edition was generated instead."
    }

    $fallbackBody = @"
#block(
  inset: 14pt,
  stroke: 0.45pt + luma(120),
  radius: 4pt,
  above: 1.2em,
  below: 1.2em,
)[
  #set text(size: 9.25pt)
  #strong[Reading edition notice]
  #v(0.45em)
  $fallbackDetailLine
]
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
  summary: "$escapedSummary",
  variant: "$escapedVariant",
  section_label: "$escapedSectionLabel",
  date: "$escapedDate",
  version: "$escapedVersion",
  edition: "$escapedEdition",
  author: "Outside In Print",
  url: "$escapedUrl",
  cover_image_path: "$escapedCoverImagePath",
  doc_date: $docDateExpression,
  show_toc: false,
  compact_frontmatter: $compactFrontmatterTypst,
  show_colophon: $showColophonTypst,
  body: article_body,
  references: reference_body,
)
"@
    Write-Utf8Text -Path $fallbackDocPath -Value $fallbackDoc

    $fallbackCompile = Invoke-NativeCapture -Command "typst" -Arguments @(
      'compile',
      '--root', '.',
      $fallbackDocPath,
      $pdfPath
    ) -CaptureStem "$safeSlug.fallback-compile"

    if ($fallbackCompile.ExitCode -ne 0 -or -not (Test-Path -Path $pdfPath -PathType Leaf)) {
      $fallbackDetail = Get-TypstFailureDetail -Stderr $fallbackCompile.Stderr
      throw "Fallback PDF compile failed for '$slug'. $fallbackDetail"
    }

    $buildMeta.render_status = "fallback"
    $buildMeta.warnings += "fallback_render"
    Write-Host "Built (fallback): $pdfPath" -ForegroundColor Yellow
  }

  Write-JsonFile -Path $buildMetaPath -Value $buildMeta
}

if ($htmlJobs.Count -gt 0) {
  $htmlResults = Invoke-HtmlPdfBatchRender -Jobs $htmlJobs

  foreach ($job in $htmlJobs) {
    $result = $htmlResults[$job.slug]
    if ($null -eq $result) {
      throw "HTML PDF rendering completed without a result entry for '$($job.slug)'."
    }

    $buildMeta = $job.build_meta
    $buildMeta.render_status = "primary"
    $buildMeta.source_path = [string]$result.route
    $buildMeta.source_url = [string]$result.url
    Write-JsonFile -Path $job.build_meta_path -Value $buildMeta
    Write-Host "Built (html): $($job.pdf_path)" -ForegroundColor Green
  }
}

if (Test-Path -Path $CatalogSyncScript -PathType Leaf) {
  & $CatalogSyncScript -ContentRoot $ContentRoot -PdfRoot $PdfOutDir -BuildMetaRoot $TempDir -OutputPath $PdfCatalogPath | Out-Null
}

Write-Host "`n$Mode PDF build complete." -ForegroundColor Cyan
