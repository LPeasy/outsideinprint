param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string[]]$Slugs = @(),
  [switch]$DryRun,
  [switch]$Apply,
  [int]$MaxBodyImages = 6,
  [int]$LongEssayMaxBodyImages = 8,
  [string]$ReportDir = "",
  [string]$DownloadFixturePath = "",
  [string]$ReportStamp = "",
  [switch]$EnableFuzzyPlacement,
  [switch]$AllowArchiveProvenanceCaption
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($DryRun -and $Apply) {
  throw "Use either -DryRun or -Apply, not both."
}
if (-not $DryRun -and -not $Apply) {
  $DryRun = $true
}
if ($MaxBodyImages -lt 1 -or $LongEssayMaxBodyImages -lt $MaxBodyImages) {
  throw "Expected -MaxBodyImages >= 1 and -LongEssayMaxBodyImages >= -MaxBodyImages."
}
$Slugs = @(
  foreach ($slug in $Slugs) {
    foreach ($part in ([string]$slug -split ',')) {
      $trimmed = $part.Trim()
      if (-not [string]::IsNullOrWhiteSpace($trimmed)) { $trimmed }
    }
  }
)

$Root = [System.IO.Path]::GetFullPath($Root)
if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
  throw "Root not found: $Root"
}
if ([string]::IsNullOrWhiteSpace($ReportDir)) {
  $ReportDir = Join-Path $Root "reports\medium-image-recovery"
}
if ([string]::IsNullOrWhiteSpace($ReportStamp)) {
  $ReportStamp = (Get-Date).ToString("yyyyMMdd")
}

$downloadFixture = @{}
if (-not [string]::IsNullOrWhiteSpace($DownloadFixturePath)) {
  $fixtureRaw = Get-Content -LiteralPath $DownloadFixturePath -Raw
  $fixtureObj = $fixtureRaw | ConvertFrom-Json
  foreach ($property in $fixtureObj.PSObject.Properties) {
    $downloadFixture[$property.Name] = [string]$property.Value
  }
}

$script:MediumImportReportFiles = $null
$script:MediumImportReportCache = @{}

function Ensure-Directory {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Write-TextNoBom {
  param([string]$Path, [string]$Content)
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Get-NewLineStyle {
  param([string]$Text)
  if ($Text -match "\r\n") { return "`r`n" }
  "`n"
}

function Convert-NewLines {
  param([string]$Text, [string]$NewLine)
  if ($NewLine -eq "`n") { return ($Text -replace "\r\n", "`n") }
  ($Text -replace "\r\n", "`n") -replace "\n", "`r`n"
}

function Invoke-Git {
  param([string[]]$Arguments, [switch]$AllowFailure)
  $output = & git -C $Root @Arguments 2>&1
  $exit = $LASTEXITCODE
  if ($exit -ne 0 -and -not $AllowFailure) {
    throw ("git {0} failed: {1}" -f ($Arguments -join " "), ($output | Out-String))
  }
  [pscustomobject]@{ ExitCode = $exit; Output = ($output | Out-String) }
}

function Get-BytesSha256Hex {
  param([byte[]]$Bytes)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha.ComputeHash($Bytes)
    return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
  }
}

function Get-FileSha256Hex {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return ""
  }
  return Get-BytesSha256Hex -Bytes ([System.IO.File]::ReadAllBytes($Path))
}

function Get-SafeExtension {
  param([string]$Url, [string]$ContentType)
  $ext = ""
  try { $ext = [System.IO.Path]::GetExtension(([uri]$Url).AbsolutePath) } catch { $ext = "" }
  if ($ext -match '^\.[A-Za-z0-9]{1,5}$') { return $ext.ToLowerInvariant() }
  if ($ContentType -match 'image/jpeg') { return ".jpg" }
  if ($ContentType -match 'image/png') { return ".png" }
  if ($ContentType -match 'image/webp') { return ".webp" }
  if ($ContentType -match 'image/gif') { return ".gif" }
  if ($ContentType -match 'image/svg') { return ".svg" }
  ".img"
}

function Get-ContentTypeFromPath {
  param([string]$Path)
  switch -Regex ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    '^\.jpe?g$' { return "image/jpeg" }
    '^\.png$' { return "image/png" }
    '^\.webp$' { return "image/webp" }
    '^\.gif$' { return "image/gif" }
    '^\.svg$' { return "image/svg+xml" }
    default { return "application/octet-stream" }
  }
}

function Split-MarkdownFile {
  param([string]$Text)
  $match = [regex]::Match($Text, '(?s)^---\s*\r?\n(?<front>.*?)\r?\n---\s*\r?\n(?<body>.*)$')
  if (-not $match.Success) {
    throw "Markdown file does not contain front matter."
  }
  [pscustomobject]@{
    Front = $match.Groups["front"].Value
    Body = $match.Groups["body"].Value
  }
}

function Split-Lines {
  param([string]$Text)
  [regex]::Split($Text, "\r?\n")
}

function Get-FrontMatterScalar {
  param([string]$Front, [string]$Key)
  $match = [regex]::Match($Front, ('(?m)^{0}:\s*(?<value>.*)$' -f [regex]::Escape($Key)))
  if (-not $match.Success) { return "" }
  $value = $match.Groups["value"].Value.Trim()
  if (($value.Length -ge 2) -and (($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') -or ($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'"))) {
    return $value.Substring(1, $value.Length - 2)
  }
  $value
}

function Escape-YamlDoubleQuoted {
  param([string]$Value)
  ($Value -replace '\\', '\\' -replace '"', '\"')
}

function Set-FrontMatterScalar {
  param([string]$Front, [string]$Key, [string]$Value)
  $line = ('{0}: "{1}"' -f $Key, (Escape-YamlDoubleQuoted $Value))
  if ($Front -match ('(?m)^{0}:\s*.*$' -f [regex]::Escape($Key))) {
    return [regex]::Replace($Front, ('(?m)^{0}:\s*.*$' -f [regex]::Escape($Key)), [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line })
  }
  return ($Front.TrimEnd() + "`n" + $line)
}

function Get-NextVersion {
  param([string]$Version)
  if ($Version -match '^(?<major>\d+)\.(?<minor>\d+)$') {
    return ("{0}.{1}" -f $Matches["major"], ([int]$Matches["minor"] + 1))
  }
  if ($Version -match '^(?<major>\d+)$') {
    return ("{0}.1" -f $Matches["major"])
  }
  "1.1"
}

function Get-NextEdition {
  param([string]$Edition)
  $ordinals = @(
    "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth",
    "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth",
    "Eighteenth", "Nineteenth", "Twentieth"
  )
  $prefix = "First"
  if ($Edition -match '^(?<ordinal>[A-Za-z]+)\s+web\s+edition$') {
    $prefix = $Matches["ordinal"]
  }
  $index = [Array]::IndexOf($ordinals, $prefix)
  if ($index -lt 0) { return "Second web edition" }
  if ($index -ge ($ordinals.Count - 1)) { return $Edition }
  return ("{0} web edition" -f $ordinals[$index + 1])
}

function Add-RevisionHistoryEntry {
  param([string]$Front, [string]$Version, [string]$Date, [string]$Note)
  if ($Front -match [regex]::Escape(('version: "{0}"' -f $Version)) -and $Front -match [regex]::Escape($Note)) {
    return $Front
  }
  $entry = @(
    ('  - version: "{0}"' -f (Escape-YamlDoubleQuoted $Version)),
    ('    date: "{0}"' -f (Escape-YamlDoubleQuoted $Date)),
    ('    note: "{0}"' -f (Escape-YamlDoubleQuoted $Note))
  )
  $lines = New-Object System.Collections.Generic.List[string]
  $Front -split "\r?\n" | ForEach-Object { $lines.Add($_) }
  $revisionIndex = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^revision_history:\s*$') { $revisionIndex = $i; break }
  }
  if ($revisionIndex -ge 0) {
    $insertIndex = $lines.Count
    for ($i = $revisionIndex + 1; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match '^\S[^:]*:\s*') {
        $insertIndex = $i
        break
      }
    }
    for ($i = $entry.Count - 1; $i -ge 0; $i--) {
      $lines.Insert($insertIndex, $entry[$i])
    }
  }
  else {
    $insertIndex = $lines.Count
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match '^edition:\s*') { $insertIndex = $i + 1; break }
    }
    $lines.Insert($insertIndex, "revision_history:")
    for ($i = 0; $i -lt $entry.Count; $i++) {
      $lines.Insert($insertIndex + 1 + $i, $entry[$i])
    }
  }
  ($lines -join "`n")
}

function Normalize-Text {
  param([string]$Text)
  $plain = [regex]::Replace($Text, '<[^>]+>', ' ')
  $plain = [regex]::Replace($plain, '[\*_`\[\]\(\)>#~|]', ' ')
  $plain = [System.Net.WebUtility]::HtmlDecode($plain)
  $plain = $plain.ToLowerInvariant()
  $plain = [regex]::Replace($plain, '[^a-z0-9]+', ' ').Trim()
  if ($plain.Length -gt 96) { return $plain.Substring(0, 96) }
  $plain
}

function Remove-TrackingParamsFromUrl {
  param([string]$Url)

  $decoded = $Url -replace '&amp;', '&'
  $fragment = ""
  $hashIndex = $decoded.IndexOf("#")
  if ($hashIndex -ge 0) {
    $fragment = $decoded.Substring($hashIndex)
    $decoded = $decoded.Substring(0, $hashIndex)
  }

  $queryIndex = $decoded.IndexOf("?")
  if ($queryIndex -lt 0) { return $decoded + $fragment }

  $base = $decoded.Substring(0, $queryIndex)
  $query = $decoded.Substring($queryIndex + 1)
  $kept = @(
    $query -split '&' |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Where-Object { $_ -notmatch '^(?i:utm_|fbclid=|gclid=|mc_cid=|mc_eid=)' }
  )

  if ($kept.Count -eq 0) { return $base + $fragment }
  return $base + "?" + ($kept -join "&") + $fragment
}

function Remove-TrackingParams {
  param([string]$Text)
  $evaluator = [System.Text.RegularExpressions.MatchEvaluator]{
    param([System.Text.RegularExpressions.Match]$Match)
    Remove-TrackingParamsFromUrl $Match.Value
  }
  [regex]::Replace($Text, 'https?://[^\s\)]+' , $evaluator)
}

function Normalize-CaptionPunctuation {
  param([string]$Text)

  if ($null -eq $Text) { return "" }

  $normalized = $Text
  $replacements = @{
    ([string][char]0x2018) = "'"
    ([string][char]0x2019) = "'"
    ([string][char]0x201C) = '"'
    ([string][char]0x201D) = '"'
    ([string][char]0x2013) = '-'
    ([string][char]0x2014) = '-'
    ([string][char]0x2009) = ' '
    ([string][char]0x200A) = ' '
  }

  foreach ($key in $replacements.Keys) {
    $normalized = $normalized.Replace($key, [string]$replacements[$key])
  }

  return $normalized
}

function Get-CaptionPlainText {
  param([string]$Caption)
  $text = $Caption.Trim()
  $text = $text -replace '^\s*>\s*', ''
  $text = $text.Trim()
  if ($text.StartsWith("*") -and $text.EndsWith("*") -and $text.Length -gt 1) {
    $text = $text.Substring(1, $text.Length - 2)
  }
  $text = [regex]::Replace($text, '\[([^\]]+)\]\([^)]+\)', '$1')
  $text = [regex]::Replace($text, '[*_`]+', '')
  [System.Net.WebUtility]::HtmlDecode($text).Trim()
}

function Get-AltFromCaption {
  param([string]$Alt, [string]$Caption)
  if (-not [string]::IsNullOrWhiteSpace($Alt)) {
    return $Alt.Trim()
  }
  $plain = Get-CaptionPlainText $Caption
  if ($plain -match '^(?<first>[^|:.;]+)') {
    $candidate = $Matches["first"].Trim()
    if ($candidate.Length -gt 4 -and $candidate.Length -lt 120 -and $candidate -notmatch '^(photo by|source)$') {
      return $candidate
    }
  }
  ""
}

function Format-CaptionLine {
  param([string]$Caption)
  $caption = Normalize-CaptionPunctuation (Remove-TrackingParams $Caption.Trim())
  $caption = $caption -replace '^\s*>\s*', ''
  $caption = $caption -replace '^\s*\^\s*', ''
  $caption = $caption -replace '(?i)\bChat\s+GPT\b', 'ChatGPT'
  if ([string]::IsNullOrWhiteSpace($caption)) { return "" }
  if ($caption.StartsWith("*") -and $caption.EndsWith("*")) { return $caption }
  return ("*{0}*" -f $caption)
}

function Get-BodyImageUrls {
  param([string]$Body)
  $urls = New-Object System.Collections.Generic.List[string]
  foreach ($match in [regex]::Matches($Body, '!\[[^\]]*\]\((?<url><[^>]+>|[^\s\)]+)(?:\s+["''][^"'']*["''])?\)')) {
    $url = $match.Groups["url"].Value.Trim("<>")
    $urls.Add($url)
  }
  foreach ($match in [regex]::Matches($Body, '<img\b[^>]*\bsrc=["''](?<url>[^"'']+)["'']', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
    $urls.Add($match.Groups["url"].Value)
  }
  $urls.ToArray()
}

function Get-WordCount {
  param([string]$Body)
  $plain = [regex]::Replace($Body, '!\[[^\]]*\]\([^)]+\)', ' ')
  $plain = [regex]::Replace($plain, '<[^>]+>', ' ')
  @([regex]::Matches($plain, '\b[\p{L}\p{N}][\p{L}\p{N}''-]*\b')).Count
}

function Get-StaticPathFromUrl {
  param([string]$Url)
  if ($Url -notmatch '^/images/') { return "" }
  Join-Path $Root ("static\" + ($Url.TrimStart("/") -replace '/', '\'))
}

function Get-ImageDimensions {
  param([byte[]]$Bytes, [string]$ContentType)
  if ($ContentType -match 'image/svg') {
    $text = [System.Text.Encoding]::UTF8.GetString($Bytes)
    if ($text -match 'viewBox=["'']\s*[-\d.]+\s+[-\d.]+\s+(?<w>[\d.]+)\s+(?<h>[\d.]+)\s*["'']') {
      return [pscustomobject]@{ Width = [int][double]$Matches["w"]; Height = [int][double]$Matches["h"] }
    }
    if ($text -match 'width=["''](?<w>[\d.]+)' -and $text -match 'height=["''](?<h>[\d.]+)') {
      return [pscustomobject]@{ Width = [int][double]$Matches["w"]; Height = [int][double]$Matches["h"] }
    }
    return [pscustomobject]@{ Width = 1; Height = 1 }
  }
  Add-Type -AssemblyName System.Drawing
  $stream = New-Object System.IO.MemoryStream(,$Bytes)
  try {
    $image = [System.Drawing.Image]::FromStream($stream, $false, $true)
    try { return [pscustomobject]@{ Width = [int]$image.Width; Height = [int]$image.Height } }
    finally { $image.Dispose() }
  }
  finally {
    $stream.Dispose()
  }
}

function Get-DownloadCandidates {
  param([string]$Url)
  $urls = New-Object System.Collections.Generic.List[string]
  $urls.Add($Url)
  if ($Url -match '^https?://cdn-images-1\.medium\.com/max/(?<width>\d+)/(?<asset>.+)$') {
    $urls.Add(("https://miro.medium.com/v2/resize:fit:{0}/{1}" -f $Matches["width"], $Matches["asset"]))
  }
  $urls.ToArray() | Select-Object -Unique
}

function Invoke-ImageDownload {
  param([string]$Url)
  foreach ($candidateUrl in (Get-DownloadCandidates $Url)) {
    if ($downloadFixture.ContainsKey($candidateUrl)) {
      $fixturePath = [System.IO.Path]::GetFullPath((Join-Path $Root $downloadFixture[$candidateUrl]))
      if (-not (Test-Path -LiteralPath $fixturePath -PathType Leaf)) {
        $fixturePath = [System.IO.Path]::GetFullPath($downloadFixture[$candidateUrl])
      }
      if (-not (Test-Path -LiteralPath $fixturePath -PathType Leaf)) {
        continue
      }
      $bytes = [System.IO.File]::ReadAllBytes($fixturePath)
      $contentType = Get-ContentTypeFromPath $fixturePath
      $dimensions = Get-ImageDimensions -Bytes $bytes -ContentType $contentType
      return [pscustomobject]@{ Success = $true; Url = $candidateUrl; Bytes = $bytes; ContentType = $contentType; Dimensions = $dimensions; Error = "" }
    }

    $headers = @{
      "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
      "Accept" = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      $temp = [System.IO.Path]::GetTempFileName()
      try {
        $response = Invoke-WebRequest -Uri $candidateUrl -UseBasicParsing -TimeoutSec 30 -Headers $headers -MaximumRedirection 5 -OutFile $temp -PassThru
        $bytes = [System.IO.File]::ReadAllBytes($temp)
        $contentType = [string]$response.Headers["Content-Type"]
        if ($bytes.Length -le 0) { throw "empty_image_response" }
        if ($contentType -notmatch '^image/') { throw "non_image_content_type:$contentType" }
        $dimensions = Get-ImageDimensions -Bytes $bytes -ContentType $contentType
        if ($dimensions.Width -le 0 -or $dimensions.Height -le 0) { throw "invalid_image_dimensions" }
        return [pscustomobject]@{ Success = $true; Url = $candidateUrl; Bytes = $bytes; ContentType = $contentType; Dimensions = $dimensions; Error = "" }
      }
      catch {
        if ($attempt -lt 3) {
          Start-Sleep -Milliseconds ([int](300 * [Math]::Pow(2, $attempt - 1)))
        }
        else {
          $lastError = $_.Exception.Message
        }
      }
      finally {
        if (Test-Path -LiteralPath $temp -PathType Leaf) {
          Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
        }
      }
    }
  }
  [pscustomobject]@{ Success = $false; Url = $Url; Bytes = [byte[]]@(); ContentType = ""; Dimensions = $null; Error = $lastError }
}

function Test-CaptionLike {
  param([string]$Line)
  $trimmed = $Line.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed)) { return $false }
  if ($trimmed -match '^\*.+\*$') { return $true }
  if ($trimmed -match '^_.+_$') { return $true }
  $plain = ($trimmed -replace '^\s*>\s*', '').Trim()
  $plain = ($plain -replace '^\s*\^\s*', '').Trim()
  if ($plain -match '^(?i)(Photo by|Source:|Created by Author|Created (?:using|in) Chat\s*GPT|Made (?:using|in|with) Chat\s*GPT|Generated (?:using|in|with) Chat\s*GPT|Image Generated by Author(?:\s+(?:from|with))?\s+Chat\s*GPT|Image generated by author(?:\s+(?:from|with))?\s+ChatGPT|Screenshot by Author|Chart by Author|Map by Author|[^|]+\|.+)') { return $true }
  $false
}

function Get-MediumImportReportFiles {
  if ($null -ne $script:MediumImportReportFiles) {
    return $script:MediumImportReportFiles
  }
  $reportsRoot = Join-Path $Root "reports"
  if (-not (Test-Path -LiteralPath $reportsRoot -PathType Container)) {
    $script:MediumImportReportFiles = @()
    return $script:MediumImportReportFiles
  }
  $script:MediumImportReportFiles = @(
    Get-ChildItem -LiteralPath $reportsRoot -File -Filter "medium-import-*.json" |
      Sort-Object Name -Descending
  )
  $script:MediumImportReportFiles
}

function Read-MediumImportReport {
  param([string]$Path)
  if ($script:MediumImportReportCache.ContainsKey($Path)) {
    return $script:MediumImportReportCache[$Path]
  }
  try {
    $report = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  }
  catch {
    $report = $null
  }
  $script:MediumImportReportCache[$Path] = $report
  $report
}

function Get-ImportReportEntriesForSlug {
  param([string]$Slug)
  $entries = New-Object System.Collections.Generic.List[object]
  foreach ($file in (Get-MediumImportReportFiles)) {
    $report = Read-MediumImportReport -Path $file.FullName
    if ($null -eq $report) { continue }
    $entriesProperty = $report.PSObject.Properties["entries"]
    if ($null -eq $entriesProperty) { continue }
    foreach ($entry in @($entriesProperty.Value)) {
      $slugProperty = $entry.PSObject.Properties["slug"]
      if ($null -eq $slugProperty -or [string]$slugProperty.Value -ne $Slug) { continue }
      $entries.Add([pscustomobject]@{
          Entry = $entry
          ReportPath = ([System.IO.Path]::GetRelativePath($Root, $file.FullName) -replace '\\', '/')
          ReportName = $file.Name
        })
    }
  }
  $entries.ToArray()
}

function Get-LatestImportReportEntryForSlug {
  param([string]$Slug)
  $entries = @(Get-ImportReportEntriesForSlug -Slug $Slug)
  if ($entries.Count -eq 0) { return $null }
  $entries[0]
}

function Get-HistoricalImageCandidates {
  param([string]$RelativePath)
  $log = Invoke-Git -Arguments @("log", "--all", "--follow", "--format=%H", "--", $RelativePath) -AllowFailure
  if ($log.ExitCode -ne 0) { return @() }
  $best = @()
  $bestCount = 0
  $commits = @(Split-Lines $log.Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
  foreach ($commit in $commits) {
    $blob = Invoke-Git -Arguments @("show", ("{0}:{1}" -f $commit, $RelativePath)) -AllowFailure
    if ($blob.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($blob.Output)) { continue }
    try { $split = Split-MarkdownFile $blob.Output } catch { continue }
    $lines = @(Split-Lines $split.Body)
    $heading = ""
    $records = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $lines.Count; $i++) {
      $line = $lines[$i]
      if ($line -match '^\s{0,3}#{2,6}\s+') { $heading = $line.Trim() }
      $match = [regex]::Match($line, '^\s*!\[(?<alt>[^\]]*)\]\((?<url><[^>]+>|[^\s\)]+)(?:\s+["''](?<title>[^"'']*)["''])?\)\s*$')
      if (-not $match.Success) { continue }
      $url = $match.Groups["url"].Value.Trim("<>")
      if ($url -notmatch 'cdn-images-1\.medium\.com|^/images/(medium|essays)/') { continue }
      $caption = ""
      $captionLineIndex = $null
      for ($j = $i + 1; $j -lt [Math]::Min($lines.Count, $i + 5); $j++) {
        if ([string]::IsNullOrWhiteSpace($lines[$j])) { continue }
        if (Test-CaptionLike $lines[$j]) {
          $caption = $lines[$j].Trim()
          $captionLineIndex = $j
        }
        break
      }
      if ([string]::IsNullOrWhiteSpace($caption) -and $match.Groups["title"].Success) {
        $caption = $match.Groups["title"].Value.Trim()
      }
      $previousText = ""
      for ($j = $i - 1; $j -ge 0; $j--) {
        $candidate = $lines[$j].Trim()
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        if ($candidate -match '^\s*!\[') { continue }
        if (Test-CaptionLike $candidate) { continue }
        $previousText = $candidate
        break
      }
      $records.Add([pscustomobject]@{
          Url = $url
          Alt = $match.Groups["alt"].Value
          Caption = $caption
          Heading = $heading
          PreviousText = $previousText
          SourceCommit = $commit
          CandidateSource = "git_history"
          SourceReport = ""
          FallbackCaptionUsed = $false
          HistoricalLine = $i + 1
          CaptionLine = if ($null -ne $captionLineIndex) { $captionLineIndex + 1 } else { 0 }
        })
    }
    if ($records.Count -gt $bestCount) {
      $best = @($records.ToArray())
      $bestCount = $records.Count
    }
  }
  $seen = @{}
  $deduped = New-Object System.Collections.Generic.List[object]
  foreach ($record in $best) {
    if ($seen.ContainsKey($record.Url)) { continue }
    $seen[$record.Url] = $true
    $deduped.Add($record)
  }
  $deduped.ToArray()
}

function Get-ImportReportImageCandidates {
  param([string]$Slug)
  $records = New-Object System.Collections.Generic.List[object]
  foreach ($reportEntry in (Get-ImportReportEntriesForSlug -Slug $Slug)) {
    $warningsProperty = $reportEntry.Entry.PSObject.Properties["warnings"]
    if ($null -eq $warningsProperty) { continue }
    foreach ($warning in @($warningsProperty.Value)) {
      $warningText = [string]$warning
      $match = [regex]::Match($warningText, '^media_fetch_failed:(?<url>https?://cdn-images-1\.medium\.com/\S+)$')
      if (-not $match.Success) { continue }
      $records.Add([pscustomobject]@{
          Url = $match.Groups["url"].Value
          Alt = ""
          Caption = ""
          Heading = ""
          PreviousText = ""
          SourceCommit = ""
          CandidateSource = "import_report"
          SourceReport = $reportEntry.ReportPath
          FallbackCaptionUsed = $false
          HistoricalLine = 0
          CaptionLine = 0
        })
    }
  }
  $records.ToArray()
}

function Get-RecoveryImageCandidates {
  param([string]$RelativePath, [string]$Slug)
  $seen = @{}
  $records = New-Object System.Collections.Generic.List[object]
  foreach ($candidate in (Get-HistoricalImageCandidates -RelativePath $RelativePath)) {
    if ($seen.ContainsKey($candidate.Url)) { continue }
    $seen[$candidate.Url] = $true
    $records.Add($candidate)
  }
  foreach ($candidate in (Get-ImportReportImageCandidates -Slug $Slug)) {
    if ($seen.ContainsKey($candidate.Url)) { continue }
    $seen[$candidate.Url] = $true
    $records.Add($candidate)
  }
  $records.ToArray()
}

function Normalize-FullText {
  param([string]$Text)
  $plain = [regex]::Replace($Text, '<[^>]+>', ' ')
  $plain = [regex]::Replace($plain, '[\*_`\[\]\(\)>#~|]', ' ')
  $plain = [System.Net.WebUtility]::HtmlDecode($plain)
  $plain = $plain.ToLowerInvariant()
  [regex]::Replace($plain, '[^a-z0-9]+', ' ').Trim()
}

function Get-TextTokens {
  param([string]$Text)
  $stop = @{
    "the" = $true; "and" = $true; "for" = $true; "with" = $true; "that" = $true; "this" = $true
    "from" = $true; "into" = $true; "about" = $true; "what" = $true; "when" = $true; "where" = $true
    "why" = $true; "how" = $true; "are" = $true; "was" = $true; "were" = $true; "will" = $true
  }
  $tokens = New-Object System.Collections.Generic.List[string]
  foreach ($token in ((Normalize-FullText $Text) -split '\s+')) {
    if ($token.Length -lt 3) { continue }
    if ($stop.ContainsKey($token)) { continue }
    if ($tokens -notcontains $token) { $tokens.Add($token) }
  }
  $tokens.ToArray()
}

function Get-TokenOverlapScore {
  param([string]$Target, [string]$Line)
  $targetTokens = @(Get-TextTokens $Target)
  if ($targetTokens.Count -eq 0) {
    return [pscustomobject]@{ Score = 0.0; Matches = 0; TargetCount = 0 }
  }
  $lineSet = @{}
  foreach ($token in (Get-TextTokens $Line)) { $lineSet[$token] = $true }
  $matches = 0
  foreach ($token in $targetTokens) {
    if ($lineSet.ContainsKey($token)) { $matches++ }
  }
  [pscustomobject]@{
    Score = [double]($matches / [double]$targetTokens.Count)
    Matches = $matches
    TargetCount = $targetTokens.Count
  }
}

function Find-SectionOrderFallbackIndex {
  param([string[]]$Lines, [int]$Order, [int]$TotalCandidates)
  $anchors = New-Object System.Collections.Generic.List[int]
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    if ($Lines[$i] -match '^\s{0,3}#{2,6}\s+') { $anchors.Add($i) }
  }
  if ($anchors.Count -eq 0) {
    for ($i = 0; $i -lt $Lines.Count; $i++) {
      $line = $Lines[$i].Trim()
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      if ($line -match '^\s*!\[') { continue }
      if (Test-CaptionLike $line) { continue }
      $anchors.Add($i)
    }
  }
  if ($anchors.Count -eq 0) { return -1 }
  $divisor = [Math]::Max($TotalCandidates, 1)
  $position = [int][Math]::Floor(([double]$Order / [double]$divisor) * [double]$anchors.Count)
  if ($position -ge $anchors.Count) { $position = $anchors.Count - 1 }
  $anchors[$position]
}

function Find-InsertionPlacement {
  param(
    [string[]]$Lines,
    [object]$Candidate,
    [int]$Order,
    [int]$TotalCandidates,
    [int]$OriginalBodyImageCount
  )
  $target = Normalize-Text $Candidate.PreviousText
  if (-not [string]::IsNullOrWhiteSpace($target)) {
    for ($i = 0; $i -lt $Lines.Count; $i++) {
      if ((Normalize-Text $Lines[$i]) -eq $target) {
        return [pscustomobject]@{ Index = $i; Method = "exact_previous_text"; Score = 1.0 }
      }
    }
  }
  $heading = Normalize-Text $Candidate.Heading
  if (-not [string]::IsNullOrWhiteSpace($heading)) {
    for ($i = 0; $i -lt $Lines.Count; $i++) {
      if ((Normalize-Text $Lines[$i]) -eq $heading) {
        return [pscustomobject]@{ Index = $i; Method = "exact_heading"; Score = 1.0 }
      }
    }
  }
  if (-not $EnableFuzzyPlacement) {
    return [pscustomobject]@{ Index = -1; Method = "not_found"; Score = 0.0 }
  }

  $targets = @(
    [pscustomobject]@{ Text = $Candidate.PreviousText; Kind = "previous_text" },
    [pscustomobject]@{ Text = $Candidate.Heading; Kind = "heading" }
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Text) }
  $bestIndex = -1
  $bestScore = 0.0
  $bestMethod = "not_found"
  foreach ($targetItem in $targets) {
    for ($i = 0; $i -lt $Lines.Count; $i++) {
      $line = $Lines[$i].Trim()
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      if ($line -match '^\s*!\[') { continue }
      if (Test-CaptionLike $line) { continue }
      $overlap = Get-TokenOverlapScore -Target $targetItem.Text -Line $line
      if ($overlap.Matches -lt 2) { continue }
      $threshold = if ($overlap.TargetCount -le 4) { 0.75 } else { 0.5 }
      if ($overlap.Score -lt $threshold) { continue }
      $lineKind = if ($line -match '^\s{0,3}#{2,6}\s+') { "heading" } else { "paragraph" }
      $score = $overlap.Score
      if ($lineKind -eq "heading") { $score = [Math]::Min(1.0, $score + 0.05) }
      if ($score -gt $bestScore) {
        $bestScore = $score
        $bestIndex = $i
        $bestMethod = "fuzzy_$lineKind"
      }
    }
  }
  if ($bestIndex -ge 0) {
    return [pscustomobject]@{ Index = $bestIndex; Method = $bestMethod; Score = [Math]::Round($bestScore, 3) }
  }

  if ($OriginalBodyImageCount -eq 0) {
    $fallbackIndex = Find-SectionOrderFallbackIndex -Lines $Lines -Order $Order -TotalCandidates $TotalCandidates
    if ($fallbackIndex -ge 0) {
      return [pscustomobject]@{ Index = $fallbackIndex; Method = "section_order_fallback"; Score = 0.0 }
    }
  }

  [pscustomobject]@{ Index = -1; Method = "not_found"; Score = 0.0 }
}

function Get-ReportEntry {
  param([object]$Image, [string]$Status, [string]$Reason, [string]$LocalPath, [string]$Hash, [object]$Dimensions)
  [pscustomobject]@{
    slug = $Image.Slug
    title = $Image.Title
    source_url = $Image.SourceUrl
    attempted_url = $Image.AttemptedUrl
    local_path = $LocalPath
    hash = $Hash
    sha256 = $Hash
    width = if ($null -ne $Dimensions) { $Dimensions.Width } else { 0 }
    height = if ($null -ne $Dimensions) { $Dimensions.Height } else { 0 }
    status = $Status
    reason = $Reason
    rejection_reason = $Reason
    caption = $Image.Caption
    anchor = $Image.Anchor
    candidate_source = $Image.CandidateSource
    source_report = $Image.SourceReport
    placement_method = $Image.PlacementMethod
    placement_score = $Image.PlacementScore
    fallback_caption_used = $Image.FallbackCaptionUsed
  }
}

function Get-EssayFiles {
  $files = Get-ChildItem -LiteralPath (Join-Path $Root "content\essays") -Recurse -File -Filter "*.md" |
    Where-Object { $_.Name -ne "_index.md" }
  $results = New-Object System.Collections.Generic.List[object]
  foreach ($file in $files) {
    $text = Get-Content -LiteralPath $file.FullName -Raw
    if ($text -notmatch '(?m)^medium_source_url:\s*') { continue }
    $split = Split-MarkdownFile $text
    $slug = Get-FrontMatterScalar -Front $split.Front -Key "slug"
    if ([string]::IsNullOrWhiteSpace($slug)) { $slug = [System.IO.Path]::GetFileNameWithoutExtension($file.Name) }
    if ($Slugs.Count -gt 0 -and ($Slugs -notcontains $slug)) { continue }
    $relative = [System.IO.Path]::GetRelativePath($Root, $file.FullName) -replace '\\', '/'
    $results.Add([pscustomobject]@{ Path = $file.FullName; RelativePath = $relative; Slug = $slug; Text = $text; Split = $split })
  }
  $results.ToArray() | Sort-Object Slug
}

function Get-AllMediumEssaySummaries {
  $files = Get-ChildItem -LiteralPath (Join-Path $Root "content\essays") -Recurse -File -Filter "*.md" |
    Where-Object { $_.Name -ne "_index.md" }
  $results = New-Object System.Collections.Generic.List[object]
  foreach ($file in $files) {
    $text = Get-Content -LiteralPath $file.FullName -Raw
    if ($text -notmatch '(?m)^medium_source_url:\s*') { continue }
    try { $split = Split-MarkdownFile $text } catch { continue }
    $slug = Get-FrontMatterScalar -Front $split.Front -Key "slug"
    if ([string]::IsNullOrWhiteSpace($slug)) { $slug = [System.IO.Path]::GetFileNameWithoutExtension($file.Name) }
    $title = Get-FrontMatterScalar -Front $split.Front -Key "title"
    $relative = [System.IO.Path]::GetRelativePath($Root, $file.FullName) -replace '\\', '/'
    $results.Add([pscustomobject]@{
        Slug = $slug
        Title = $title
        RelativePath = $relative
        BodyImageCount = @(Get-BodyImageUrls $split.Body).Count
      })
  }
  $results.ToArray() | Sort-Object Slug
}

function Get-ImportEntryInt {
  param([object]$Entry, [string]$Name)
  if ($null -eq $Entry) { return 0 }
  $property = $Entry.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) { return 0 }
  try { return [int]$property.Value } catch { return 0 }
}

function Get-ExcludedZeroBodyEssays {
  if ($Slugs.Count -eq 0) { return @() }
  $slugSet = @{}
  foreach ($slug in $Slugs) { $slugSet[$slug] = $true }

  $previousImages = @()
  $previousPath = Join-Path $Root "reports\medium-image-recovery\20260706-recovery.json"
  if (Test-Path -LiteralPath $previousPath -PathType Leaf) {
    try {
      $previousReport = Get-Content -LiteralPath $previousPath -Raw | ConvertFrom-Json
      $imagesProperty = $previousReport.PSObject.Properties["images"]
      if ($null -ne $imagesProperty) { $previousImages = @($imagesProperty.Value) }
    }
    catch {
      $previousImages = @()
    }
  }

  $excluded = New-Object System.Collections.Generic.List[object]
  foreach ($essay in (Get-AllMediumEssaySummaries)) {
    if ($slugSet.ContainsKey($essay.Slug)) { continue }
    if ($essay.BodyImageCount -ne 0) { continue }
    $latestImport = Get-LatestImportReportEntryForSlug -Slug $essay.Slug
    $importImageCount = 0
    if ($null -ne $latestImport) {
      $importImageCount = Get-ImportEntryInt -Entry $latestImport.Entry -Name "image_count"
    }
    $essayPreviousImages = @($previousImages | Where-Object { $_.slug -eq $essay.Slug })
    $reason = "excluded_not_targeted"
    if (@($essayPreviousImages | Where-Object { $_.reason -eq "already_referenced" }).Count -gt 0) {
      $reason = "already_featured"
    }
    elseif ($importImageCount -eq 0) {
      $reason = "true_image_count_0"
    }
    elseif ($essayPreviousImages.Count -gt 0 -and @($essayPreviousImages | Where-Object { $_.reason -ne "duplicate_existing_or_featured_image_hash" }).Count -eq 0) {
      $reason = "hero_duplicate_only"
    }
    $excluded.Add([pscustomobject]@{
        slug = $essay.Slug
        title = $essay.Title
        path = $essay.RelativePath
        reason = $reason
        import_image_count = $importImageCount
        previous_candidate_count = $essayPreviousImages.Count
      })
  }
  $excluded.ToArray()
}

Ensure-Directory $ReportDir
$revisionDate = (Get-Date).ToString("yyyy-MM-dd")
$revisionNote = "Recovered and localized body images from Medium import archive; no substantive text change."
$allImageReports = New-Object System.Collections.Generic.List[object]
$essayReports = New-Object System.Collections.Generic.List[object]
$changedPaths = New-Object System.Collections.Generic.List[string]

foreach ($essay in (Get-EssayFiles)) {
  $front = $essay.Split.Front
  $body = $essay.Split.Body
  $title = Get-FrontMatterScalar -Front $front -Key "title"
  $featuredImage = Get-FrontMatterScalar -Front $front -Key "featured_image"
  $currentBodyUrls = @(Get-BodyImageUrls $body)
  $currentBodyCount = $currentBodyUrls.Count
  $originalBodyCount = $currentBodyCount
  $wordCount = Get-WordCount $body
  $limit = if ($wordCount -gt 2500) { $LongEssayMaxBodyImages } else { $MaxBodyImages }
  $desiredMinimum = if ($currentBodyCount -eq 0) { $limit } else { [Math]::Min(3, $limit) }
  $candidates = @(Get-RecoveryImageCandidates -RelativePath $essay.RelativePath -Slug $essay.Slug)
  $bodyLines = New-Object System.Collections.Generic.List[string]
  Split-Lines $body | ForEach-Object { $bodyLines.Add($_) }
  $existingUrlSet = @{}
  foreach ($url in $currentBodyUrls) { $existingUrlSet[$url] = $true }
  $existingHashSet = @{}
  foreach ($url in $currentBodyUrls + @($featuredImage)) {
    $path = Get-StaticPathFromUrl $url
    if (-not [string]::IsNullOrWhiteSpace($path)) {
      $hash = Get-FileSha256Hex $path
      if (-not [string]::IsNullOrWhiteSpace($hash)) { $existingHashSet[$hash] = $true }
    }
  }
  $insertions = New-Object System.Collections.Generic.List[object]
  $eligibleCount = 0
  $insertedCount = 0

  for ($order = 0; $order -lt $candidates.Count; $order++) {
    $candidate = $candidates[$order]
    $image = [pscustomobject]@{
      Slug = $essay.Slug
      Title = $title
      SourceUrl = $candidate.Url
      AttemptedUrl = ""
      Caption = $candidate.Caption
      Anchor = if (-not [string]::IsNullOrWhiteSpace($candidate.PreviousText)) { $candidate.PreviousText } else { $candidate.Heading }
      CandidateSource = $candidate.CandidateSource
      SourceReport = $candidate.SourceReport
      PlacementMethod = ""
      PlacementScore = 0.0
      FallbackCaptionUsed = $false
    }

    if ($existingUrlSet.ContainsKey($candidate.Url) -or (-not [string]::IsNullOrWhiteSpace($featuredImage) -and $candidate.Url -eq $featuredImage)) {
      $allImageReports.Add((Get-ReportEntry -Image $image -Status "skipped" -Reason "already_referenced" -LocalPath "" -Hash "" -Dimensions $null))
      continue
    }
    $candidateCaption = $candidate.Caption
    if ([string]::IsNullOrWhiteSpace($candidateCaption) -and $candidate.CandidateSource -eq "import_report" -and $AllowArchiveProvenanceCaption) {
      $candidateCaption = "Recovered from the original Medium import archive; original caption unavailable."
      $image.Caption = $candidateCaption
      $image.FallbackCaptionUsed = $true
    }
    if ([string]::IsNullOrWhiteSpace($candidateCaption)) {
      $allImageReports.Add((Get-ReportEntry -Image $image -Status "rejected" -Reason "missing_caption_or_provenance" -LocalPath "" -Hash "" -Dimensions $null))
      continue
    }
    if ($currentBodyCount -ge $desiredMinimum -and $candidateCaption -notmatch '(?i)\b(map|chart|diagram|figure|source|timeline|data|framework|model|scenario)\b') {
      $allImageReports.Add((Get-ReportEntry -Image $image -Status "skipped" -Reason "current_body_quota_met" -LocalPath "" -Hash "" -Dimensions $null))
      continue
    }
    if ($insertedCount -ge $limit) {
      $allImageReports.Add((Get-ReportEntry -Image $image -Status "skipped" -Reason "essay_image_limit_met" -LocalPath "" -Hash "" -Dimensions $null))
      continue
    }

    $localPath = ""
    $hash = ""
    $dimensions = $null
    $attemptedUrl = ""
    if ($candidate.Url -match '^/images/') {
      $assetPath = Get-StaticPathFromUrl $candidate.Url
      if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
        $allImageReports.Add((Get-ReportEntry -Image $image -Status "rejected" -Reason "historical_local_asset_missing" -LocalPath $candidate.Url -Hash "" -Dimensions $null))
        continue
      }
      $bytes = [System.IO.File]::ReadAllBytes($assetPath)
      $contentType = Get-ContentTypeFromPath $assetPath
      $dimensions = Get-ImageDimensions -Bytes $bytes -ContentType $contentType
      $hash = Get-BytesSha256Hex $bytes
      $localPath = $candidate.Url
    }
    else {
      $download = Invoke-ImageDownload $candidate.Url
      $attemptedUrl = $download.Url
      $image.AttemptedUrl = $attemptedUrl
      if (-not $download.Success) {
        $allImageReports.Add((Get-ReportEntry -Image $image -Status "failed" -Reason ("download_failed:" + $download.Error) -LocalPath "" -Hash "" -Dimensions $null))
        continue
      }
      $hash = Get-BytesSha256Hex $download.Bytes
      if ($existingHashSet.ContainsKey($hash)) {
        $allImageReports.Add((Get-ReportEntry -Image $image -Status "skipped" -Reason "duplicate_existing_or_featured_image_hash" -LocalPath "" -Hash $hash -Dimensions $download.Dimensions))
        continue
      }
      $extension = Get-SafeExtension -Url $candidate.Url -ContentType $download.ContentType
      $fileName = "$hash$extension"
      $assetDir = Join-Path $Root ("static\images\medium\{0}" -f $essay.Slug)
      $assetPath = Join-Path $assetDir $fileName
      $localPath = "/images/medium/$($essay.Slug)/$fileName"
      if ($Apply) {
        Ensure-Directory $assetDir
        if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
          [System.IO.File]::WriteAllBytes($assetPath, $download.Bytes)
        }
      }
      $dimensions = $download.Dimensions
    }

    if ($existingHashSet.ContainsKey($hash)) {
      $allImageReports.Add((Get-ReportEntry -Image $image -Status "skipped" -Reason "duplicate_existing_or_featured_image_hash" -LocalPath $localPath -Hash $hash -Dimensions $dimensions))
      continue
    }
    $placement = Find-InsertionPlacement -Lines $bodyLines.ToArray() -Candidate $candidate -Order $order -TotalCandidates $candidates.Count -OriginalBodyImageCount $originalBodyCount
    $image.PlacementMethod = $placement.Method
    $image.PlacementScore = $placement.Score
    if ($placement.Index -lt 0) {
      $allImageReports.Add((Get-ReportEntry -Image $image -Status "rejected" -Reason "anchor_not_found_in_current_body" -LocalPath $localPath -Hash $hash -Dimensions $dimensions))
      continue
    }
    $caption = Format-CaptionLine $candidateCaption
    $alt = Get-AltFromCaption -Alt $candidate.Alt -Caption $caption
    $block = @(
      "",
      ('![{0}]({1})' -f ($alt -replace '\]', '\]'), $localPath),
      "",
      $caption,
      ""
    )
    $insertions.Add([pscustomobject]@{ Index = $placement.Index; Order = $order; Lines = $block; ReportImage = $image; LocalPath = $localPath; Hash = $hash; Dimensions = $dimensions })
    $existingHashSet[$hash] = $true
    $existingUrlSet[$localPath] = $true
    $currentBodyCount++
    $eligibleCount++
    $insertedCount++
  }

  if ($insertions.Count -gt 0) {
    foreach ($item in ($insertions | Sort-Object @{Expression = "Index"; Descending = $true}, @{Expression = "Order"; Descending = $true})) {
      for ($i = $item.Lines.Count - 1; $i -ge 0; $i--) {
        $bodyLines.Insert($item.Index + 1, $item.Lines[$i])
      }
      $allImageReports.Add((Get-ReportEntry -Image $item.ReportImage -Status $(if ($Apply) { "inserted" } else { "would_insert" }) -Reason "" -LocalPath $item.LocalPath -Hash $item.Hash -Dimensions $item.Dimensions))
    }

    if ($Apply) {
      $newVersion = Get-NextVersion (Get-FrontMatterScalar -Front $front -Key "version")
      $newEdition = Get-NextEdition (Get-FrontMatterScalar -Front $front -Key "edition")
      $newFront = Set-FrontMatterScalar -Front $front -Key "version" -Value $newVersion
      $newFront = Set-FrontMatterScalar -Front $newFront -Key "edition" -Value $newEdition
      $newFront = Add-RevisionHistoryEntry -Front $newFront -Version $newVersion -Date $revisionDate -Note $revisionNote
      $newLine = Get-NewLineStyle $essay.Text
      $newBody = ($bodyLines -join $newLine).TrimEnd() + $newLine
      $newContent = "---`n{0}`n---`n`n{1}" -f $newFront.Trim(), $newBody
      Write-TextNoBom -Path $essay.Path -Content (Convert-NewLines -Text $newContent -NewLine $newLine)
      $changedPaths.Add($essay.RelativePath)
    }
  }

  $essayReports.Add([pscustomobject]@{
      slug = $essay.Slug
      title = $title
      path = $essay.RelativePath
      word_count = $wordCount
      before_body_images = @(Get-BodyImageUrls $body).Count
      historical_candidates = $candidates.Count
      git_history_candidates = @($candidates | Where-Object { $_.CandidateSource -eq "git_history" }).Count
      import_report_candidates = @($candidates | Where-Object { $_.CandidateSource -eq "import_report" }).Count
      selected_insertions = $insertions.Count
      changed = [bool]($Apply -and $insertions.Count -gt 0)
    })
}

$essayReportArray = @($essayReports.ToArray())
$imageReportArray = @($allImageReports.ToArray())
$changedPathArray = @($changedPaths.ToArray())
$excludedEssayArray = @(Get-ExcludedZeroBodyEssays)
$tucsonReport = @($essayReportArray | Where-Object { $_.slug -eq "how-tucson-az-plans-for-water-scarcity" } | Select-Object -First 1)

$summary = [ordered]@{
  generated_at = (Get-Date).ToString("o")
  mode = $(if ($Apply) { "apply" } else { "dry_run" })
  root = $Root
  essay_count = $essayReportArray.Count
  changed_essay_count = $changedPathArray.Count
  image_report_count = $imageReportArray.Count
  inserted_or_would_insert = @($imageReportArray | Where-Object { $_.status -in @("inserted", "would_insert") }).Count
  failed_downloads = @($imageReportArray | Where-Object { $_.status -eq "failed" }).Count
  rejected = @($imageReportArray | Where-Object { $_.status -eq "rejected" }).Count
  skipped = @($imageReportArray | Where-Object { $_.status -eq "skipped" }).Count
  excluded_essay_count = $excludedEssayArray.Count
  changed_paths = $changedPathArray
  tucson = $tucsonReport
}

$payload = [ordered]@{
  summary = $summary
  essays = $essayReportArray
  images = $imageReportArray
  excluded_essays = $excludedEssayArray
}

$jsonPath = Join-Path $ReportDir "$ReportStamp-recovery.json"
$csvPath = Join-Path $ReportDir "$ReportStamp-recovery.csv"
$mdPath = Join-Path $ReportDir "$ReportStamp-recovery.md"
Write-TextNoBom -Path $jsonPath -Content ($payload | ConvertTo-Json -Depth 10)
$allImageReports | Export-Csv -Path $csvPath -NoTypeInformation -Encoding utf8

$md = New-Object System.Collections.Generic.List[string]
$md.Add("# Medium Body Image Recovery")
$md.Add("")
$md.Add(("- Generated: {0}" -f $summary.generated_at))
$md.Add(("- Mode: {0}" -f $summary.mode))
$md.Add(("- Essays scanned: {0}" -f $summary.essay_count))
$md.Add(("- Changed essays: {0}" -f $summary.changed_essay_count))
$md.Add(("- Images inserted/would insert: {0}" -f $summary.inserted_or_would_insert))
$md.Add(("- Failed downloads: {0}" -f $summary.failed_downloads))
$md.Add(("- Rejected images: {0}" -f $summary.rejected))
$md.Add(("- Skipped images: {0}" -f $summary.skipped))
$md.Add(("- Excluded zero-body essays: {0}" -f $summary.excluded_essay_count))
$md.Add("")
$tucson = $summary.tucson | Select-Object -First 1
if ($null -ne $tucson) {
  $md.Add("## Tucson Check")
  $md.Add("")
  $md.Add(("- Before body images: {0}" -f $tucson.before_body_images))
  $md.Add(("- Historical candidates: {0}" -f $tucson.historical_candidates))
  $md.Add(("- Selected insertions: {0}" -f $tucson.selected_insertions))
  $md.Add("")
}
$md.Add("## Changed Essays")
$md.Add("")
foreach ($essayReport in ($essayReports | Where-Object { $_.selected_insertions -gt 0 } | Sort-Object slug)) {
  $md.Add(("- `{0}`: {1} image(s)" -f $essayReport.slug, $essayReport.selected_insertions))
}
if ($excludedEssayArray.Count -gt 0) {
  $md.Add("")
  $md.Add("## Excluded Zero-Body Essays")
  $md.Add("")
  foreach ($excluded in ($excludedEssayArray | Sort-Object reason, slug)) {
    $md.Add(("- `{0}`: {1}" -f $excluded.slug, $excluded.reason))
  }
}
Write-TextNoBom -Path $mdPath -Content (($md -join "`n") + "`n")

Write-Host ("Medium body image recovery {0} complete. Report: {1}" -f $summary.mode, $jsonPath)
if ($Apply -and $changedPaths.Count -gt 0) {
  Write-Host ("Changed essays: {0}" -f ($changedPaths -join ", "))
}
