param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ReportBasePath,
  [string[]]$Paths = @(),
  [switch]$Write
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:DefaultPlaceholderHero = '/images/social/outside-in-print-default.png'
$script:LeadImageLineLimit = 20
$script:ReportsRelativeDir = 'reports'
$script:RemoteRequestSpacingSeconds = 2
$script:RemoteRetryDelaysSeconds = @(12, 24, 36, 48)
$script:LastRemoteRequestAt = $null

function Write-TextNoBom {
  param(
    [string]$Path,
    [string]$Content
  )

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -Path $directory -ItemType Directory -Force | Out-Null
  }

  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Ensure-Directory {
  param([string]$Path)

  if ($Path -and -not (Test-Path -LiteralPath $Path -PathType Container)) {
    New-Item -Path $Path -ItemType Directory -Force | Out-Null
  }
}

function Get-NormalizedRepoPath {
  param(
    [string]$RepoRoot,
    [string]$PathValue
  )

  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    return $null
  }

  $candidate = $PathValue.Trim()
  if (-not [System.IO.Path]::IsPathRooted($candidate)) {
    $candidate = Join-Path $RepoRoot $candidate
  }

  if (-not (Test-Path -LiteralPath $candidate)) {
    return $null
  }

  return [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $candidate).Path)
}

function Get-RepoRelativePath {
  param(
    [string]$RepoRoot,
    [string]$PathValue
  )

  $resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RepoRoot).Path).TrimEnd('\', '/')
  $resolvedPath = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $PathValue).Path)
  if ($resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $resolvedPath.Substring($resolvedRoot.Length).TrimStart('\', '/').Replace('\', '/')
  }

  return $resolvedPath.Replace('\', '/')
}

function Resolve-TargetEssayPaths {
  param(
    [string]$RepoRoot,
    [string[]]$ExplicitPaths
  )

  $essayRoot = Join-Path $RepoRoot 'content\essays'
  $candidates = New-Object System.Collections.Generic.List[string]

  if ($ExplicitPaths -and $ExplicitPaths.Count -gt 0) {
    foreach ($rawPath in $ExplicitPaths) {
      foreach ($pathValue in @($rawPath -split ',' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
        $resolved = Get-NormalizedRepoPath -RepoRoot $RepoRoot -PathValue $pathValue
        if ($resolved) {
          $candidates.Add($resolved)
        }
      }
    }
  }
  elseif (Test-Path -LiteralPath $essayRoot -PathType Container) {
    Get-ChildItem -Path $essayRoot -File -Filter '*.md' | ForEach-Object {
      if ($_.Name -ne '_index.md') {
        $candidates.Add($_.FullName)
      }
    }
  }

  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $results = New-Object System.Collections.Generic.List[string]
  foreach ($candidate in $candidates) {
    if ($seen.Add($candidate)) {
      $results.Add($candidate)
    }
  }

  return @($results.ToArray() | Sort-Object)
}

function Escape-YamlDoubleQuoted {
  param([string]$Value)

  if ($null -eq $Value) {
    return ''
  }

  return (($Value -replace '\\', '\\\\') -replace '"', '\"')
}

function Format-YamlScalar {
  param([string]$Value)

  return '"' + (Escape-YamlDoubleQuoted -Value $Value) + '"'
}

function Convert-ScalarString {
  param([string]$Value)

  $trimmed = $Value.Trim()
  if ($trimmed.StartsWith('"') -and $trimmed.EndsWith('"')) {
    return ($trimmed.Substring(1, $trimmed.Length - 2) -replace '\\"', '"')
  }

  if ($trimmed.StartsWith("'") -and $trimmed.EndsWith("'")) {
    return ($trimmed.Substring(1, $trimmed.Length - 2) -replace "''", "'")
  }

  return $trimmed
}

function Convert-BodyLineToPlainText {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ''
  }

  $text = $Value
  $text = [regex]::Replace($text, '^\s*>\s*', '')
  $text = [regex]::Replace($text, '^\s*(?:\*+|_+)\s*', '')
  $text = [regex]::Replace($text, '\s*(?:\*+|_+)\s*$', '')
  $text = [regex]::Replace($text, '\[([^\]]+)\]\([^)]+\)', '$1')
  $text = [regex]::Replace($text, '<[^>]+>', ' ')
  $text = [System.Net.WebUtility]::HtmlDecode($text)
  $text = ($text -replace '\s+', ' ').Trim()
  return $text
}

function Get-CaptionAltFallback {
  param([string]$CaptionText)

  $plain = Convert-BodyLineToPlainText -Value $CaptionText
  if ([string]::IsNullOrWhiteSpace($plain)) {
    return ''
  }

  if ($plain -match '^(?i)(photo by|source:|courtesy of|image courtesy of|image source:)') {
    return ''
  }

  if ($plain -match '^(?i)(created by\b|made using\b|generated using\b|generated with\b|supplied by\b|imagery supplied by\b|illustration by\b|art by\b)') {
    return ''
  }

  $segments = @($plain -split '\|' | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($segments.Count -gt 1) {
    $segment = $segments[0]
    $wordCount = @($segment -split '\s+' | Where-Object { $_ }).Count
    if ($segment.Length -ge 6 -and $segment.Length -le 140 -and $wordCount -ge 2) {
      return $segment
    }
  }

  $wordCount = @($plain -split '\s+' | Where-Object { $_ }).Count
  if ($wordCount -ge 2 -and $plain.Length -le 140) {
    return $plain
  }

  return ''
}

function Test-WeakFeaturedImageAlt {
  param(
    [string]$AltText,
    [string]$CaptionText
  )

  if ([string]::IsNullOrWhiteSpace($AltText)) {
    return $false
  }

  $normalizedAlt = Convert-BodyLineToPlainText -Value $AltText
  if ([string]::IsNullOrWhiteSpace($normalizedAlt)) {
    return $true
  }

  $captionFallback = Get-CaptionAltFallback -CaptionText $CaptionText
  if ([string]::IsNullOrWhiteSpace($captionFallback)) {
    $normalizedCaption = Convert-BodyLineToPlainText -Value $CaptionText
    if (-not [string]::IsNullOrWhiteSpace($normalizedCaption) -and $normalizedAlt -eq $normalizedCaption) {
      return $true
    }
  }

  return $false
}

function Get-PreservedFeaturedImageAlt {
  param(
    [string]$CurrentAlt,
    [string]$CurrentCaption,
    [string]$EssayTitle
  )

  if (Test-WeakFeaturedImageAlt -AltText $CurrentAlt -CaptionText $CurrentCaption) {
    return $EssayTitle
  }

  return $CurrentAlt
}

function Normalize-CaptionText {
  param([string]$Value)

  $plain = Convert-BodyLineToPlainText -Value $Value
  if ([string]::IsNullOrWhiteSpace($plain)) {
    return ''
  }

  return $plain
}

function Test-ExplicitCaptionText {
  param([string]$Value)

  $plain = Normalize-CaptionText -Value $Value
  if ([string]::IsNullOrWhiteSpace($plain)) {
    return $false
  }

  if ($plain -match '^(?i)(photo by|source:|courtesy of|image courtesy of|image source:|created by|made by|made using|generated by|generated using|generated with|art by|illustration by)\b') {
    return $true
  }

  if ($plain -match '(?i)\|\s*(source(?::|\b)|courtesy of\b|image courtesy of\b|image source\b|photo by\b|created by\b|made by\b|made using\b|generated by\b|generated using\b|generated with\b|art by\b|illustration by\b)') {
    return $true
  }

  return $false
}

function Test-CaptionCandidateLine {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }

  return (Test-ExplicitCaptionText -Value $Value)
}

function Get-FrontMatterAndBody {
  param([string]$Path)

  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $match = [regex]::Match($content, '(?s)\A---\r?\n(.*?)\r?\n---\r?\n?(.*)\z')
  if (-not $match.Success) {
    throw "Expected YAML front matter in $Path"
  }

  return [pscustomobject]@{
    FrontMatter = $match.Groups[1].Value
    Body = $match.Groups[2].Value
    Original = $content
  }
}

function Get-FrontMatterScalar {
  param(
    [string]$FrontMatter,
    [string]$Key
  )

  $match = [regex]::Match($FrontMatter, '(?m)^' + [regex]::Escape($Key) + ':\s*(.+?)\s*$')
  if (-not $match.Success) {
    return ''
  }

  return Convert-ScalarString -Value $match.Groups[1].Value
}

function Set-FrontMatterScalar {
  param(
    [string[]]$Lines,
    [string]$Key,
    [string]$Value,
    [string[]]$InsertAfter = @()
  )

  $formatted = '{0}: {1}' -f $Key, (Format-YamlScalar -Value $Value)
  $updated = New-Object System.Collections.Generic.List[string]
  $replaced = $false

  foreach ($line in $Lines) {
    if ($line -match ('^(?<indent>\s*)' + [regex]::Escape($Key) + ':\s*')) {
      $updated.Add($formatted)
      $replaced = $true
    }
    else {
      $updated.Add($line)
    }
  }

  if ($replaced) {
    return $updated.ToArray()
  }

  $insertIndex = -1
  foreach ($insertAfterKey in $InsertAfter) {
    for ($i = 0; $i -lt $updated.Count; $i++) {
      if ($updated[$i] -match ('^\s*' + [regex]::Escape($insertAfterKey) + ':\s*')) {
        $insertIndex = $i + 1
      }
    }
  }

  if ($insertIndex -lt 0) {
    $updated.Add($formatted)
  }
  else {
    $updated.Insert($insertIndex, $formatted)
  }

  return $updated.ToArray()
}

function Remove-FrontMatterScalar {
  param(
    [string[]]$Lines,
    [string]$Key
  )

  return @($Lines | Where-Object { $_ -notmatch ('^\s*' + [regex]::Escape($Key) + ':\s*') })
}

function Get-FirstHeadingLineNumber {
  param([string[]]$Lines)

  for ($index = 0; $index -lt $Lines.Length; $index++) {
    $line = $Lines[$index].Trim()
    if ($line -match '^(#{2,6})\s+' -or $line -match '^(?i)<h[2-6]\b') {
      return ($index + 1)
    }
  }

  return $null
}

function Get-FirstImageOccurrence {
  param([string[]]$Lines)

  for ($index = 0; $index -lt $Lines.Length; $index++) {
    $line = $Lines[$index]
    $trimmed = $line.Trim()

    $markdownMatch = [regex]::Match($trimmed, '^!\[(?<alt>[^\]]*)\]\((?<src>[^)\s]+)(?:\s+"(?<title>[^"]*)")?\)\s*$')
    if ($markdownMatch.Success) {
      return [pscustomobject]@{
        Kind = 'markdown'
        LineIndex = $index
        LineNumber = $index + 1
        Source = $markdownMatch.Groups['src'].Value
        Alt = $markdownMatch.Groups['alt'].Value
        Title = $markdownMatch.Groups['title'].Value
      }
    }

    $htmlMatch = [regex]::Match($line, '(?is)<img[^>]+src=(?:"(?<src1>[^"]+)"|''(?<src2>[^'']+)'')[^>]*?(?:alt=(?:"(?<alt1>[^"]*)"|''(?<alt2>[^'']*)''))?')
    if ($htmlMatch.Success) {
      $source = if ($htmlMatch.Groups['src1'].Success) { $htmlMatch.Groups['src1'].Value } else { $htmlMatch.Groups['src2'].Value }
      $alt = if ($htmlMatch.Groups['alt1'].Success) { $htmlMatch.Groups['alt1'].Value } elseif ($htmlMatch.Groups['alt2'].Success) { $htmlMatch.Groups['alt2'].Value } else { '' }
      return [pscustomobject]@{
        Kind = 'html'
        LineIndex = $index
        LineNumber = $index + 1
        Source = $source
        Alt = $alt
        Title = ''
      }
    }
  }

  return $null
}

function Get-FollowingCaptionCandidate {
  param(
    [string[]]$Lines,
    [int]$ImageLineIndex
  )

  $nextIndex = $ImageLineIndex + 1
  while ($nextIndex -lt $Lines.Length -and [string]::IsNullOrWhiteSpace($Lines[$nextIndex])) {
    $nextIndex++
  }

  if ($nextIndex -ge $Lines.Length) {
    return $null
  }

  $candidate = $Lines[$nextIndex]
  if (-not (Test-CaptionCandidateLine -Value $candidate)) {
    return $null
  }

  return [pscustomobject]@{
    LineIndex = $nextIndex
    LineNumber = $nextIndex + 1
    Raw = $candidate
    Text = Normalize-CaptionText -Value $candidate
    AltFallback = Get-CaptionAltFallback -CaptionText $candidate
  }
}

function Get-SafeExtension {
  param(
    [string]$Url,
    [string]$ContentType
  )

  $ext = ''
  try {
    $ext = [System.IO.Path]::GetExtension(([uri]$Url).AbsolutePath)
  }
  catch {
    $ext = ''
  }

  if ($ext -match '^\.[A-Za-z0-9]{1,8}$') {
    return $ext.ToLowerInvariant()
  }

  if ($ContentType -match 'image/jpeg') { return '.jpg' }
  if ($ContentType -match 'image/png') { return '.png' }
  if ($ContentType -match 'image/webp') { return '.webp' }
  if ($ContentType -match 'image/gif') { return '.gif' }
  if ($ContentType -match 'image/svg\+xml') { return '.svg' }

  return '.img'
}

function Get-GeneratedPythonPath {
  param([string]$ScriptRoot)

  $candidate = Join-Path $ScriptRoot '..\tools\bin\generated\python.cmd'
  $resolved = Get-NormalizedRepoPath -RepoRoot (Resolve-Path (Join-Path $ScriptRoot '..')).Path -PathValue $candidate
  if ($resolved) {
    return $resolved
  }

  return $null
}

function Get-RemoteSourceCandidates {
  param([string]$SourceUrl)

  $candidates = New-Object System.Collections.Generic.List[string]
  if ([string]::IsNullOrWhiteSpace($SourceUrl)) {
    return @()
  }

  if ($SourceUrl -match '^https?://cdn-images-1\.medium\.com/max/(?<width>\d+)/(?<asset>.+)$') {
    $width = $Matches['width']
    $asset = $Matches['asset']
    $candidates.Add("https://miro.medium.com/v2/resize:fit:$width/$asset")
  }

  $candidates.Add($SourceUrl)
  return @($candidates.ToArray() | Select-Object -Unique)
}

function Wait-ForRemoteRequestSlot {
  $now = Get-Date
  if ($script:LastRemoteRequestAt) {
    $elapsed = ($now - $script:LastRemoteRequestAt).TotalSeconds
    $remaining = $script:RemoteRequestSpacingSeconds - $elapsed
    if ($remaining -gt 0) {
      Start-Sleep -Milliseconds ([int][Math]::Ceiling($remaining * 1000))
    }
  }

  $script:LastRemoteRequestAt = Get-Date
}

function Invoke-PythonImageDownload {
  param(
    [string]$PythonPath,
    [string]$Url
  )

  $tempFile = [System.IO.Path]::GetTempFileName()
  $tempScript = [System.IO.Path]::ChangeExtension($tempFile, '.py')
  $pythonCode = @'
import json
import ssl
import sys
import urllib.request

url = sys.argv[1]
target = sys.argv[2]
request = urllib.request.Request(url, headers={"User-Agent": "OutsideInPrint/1.0"})
context = ssl.create_default_context()

with urllib.request.urlopen(request, timeout=60, context=context) as response:
    data = response.read()
    with open(target, "wb") as handle:
        handle.write(data)
    payload = {
        "content_type": response.headers.get_content_type() or "",
        "length": len(data),
    }
    print(json.dumps(payload))
'@

  try {
    Write-TextNoBom -Path $tempScript -Content $pythonCode

    $attempt = 0
    while ($true) {
      Wait-ForRemoteRequestSlot
      $output = & $PythonPath $tempScript $Url $tempFile 2>&1
      if ($LASTEXITCODE -eq 0) {
        break
      }

      $attemptMessage = (($output | Out-String).Trim())
      $shouldRetry = ($attempt -lt $script:RemoteRetryDelaysSeconds.Count) -and (
        $attemptMessage -match 'HTTP Error 429' -or
        $attemptMessage -match 'timed out' -or
        $attemptMessage -match 'Temporary failure' -or
        $attemptMessage -match 'Connection reset'
      )

      if (-not $shouldRetry) {
        throw $attemptMessage
      }

      Start-Sleep -Seconds $script:RemoteRetryDelaysSeconds[$attempt]
      $attempt++
    }

    $jsonLine = ($output | Select-Object -Last 1)
    $contentType = ''
    if (-not [string]::IsNullOrWhiteSpace($jsonLine)) {
      $metadata = $jsonLine | ConvertFrom-Json
      $contentTypeProperty = $metadata.PSObject.Properties['content_type']
      if ($contentTypeProperty) {
        $contentType = [string]$contentTypeProperty.Value
      }
    }
    $bytes = [System.IO.File]::ReadAllBytes($tempFile)
    return [pscustomobject]@{
      Success = $true
      Bytes = $bytes
      ContentType = $contentType
      Error = ''
    }
  }
  catch {
    return [pscustomobject]@{
      Success = $false
      Bytes = $null
      ContentType = ''
      Error = $_.Exception.Message
    }
  }
  finally {
    if (Test-Path -LiteralPath $tempScript -PathType Leaf) {
      Remove-Item -LiteralPath $tempScript -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $tempFile -PathType Leaf) {
      Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
    }
  }
}

function Get-BytesSha256Hex {
  param([byte[]]$Bytes)

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha.ComputeHash($Bytes)
  }
  finally {
    $sha.Dispose()
  }

  return ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
}

function Localize-LeadImage {
  param(
    [string]$Root,
    [string]$Slug,
    [string]$SourceUrl,
    [switch]$Write
  )

  if ($SourceUrl -notmatch '^https?://') {
    return [pscustomobject]@{
      Success = $true
      Path = $SourceUrl
      Localized = $false
      Error = ''
    }
  }

  try {
    $pythonPath = Get-GeneratedPythonPath -ScriptRoot $PSScriptRoot
    if (-not $pythonPath) {
      throw 'Missing generated Python runtime at tools\bin\generated\python.cmd'
    }

    $download = $null
    $lastError = ''
    foreach ($candidateUrl in (Get-RemoteSourceCandidates -SourceUrl $SourceUrl)) {
      $attempt = Invoke-PythonImageDownload -PythonPath $pythonPath -Url $candidateUrl
      if ($attempt.Success) {
        $download = $attempt
        break
      }

      $lastError = $attempt.Error
    }

    if ($null -eq $download -or -not $download.Success) {
      throw $lastError
    }

    $hash = Get-BytesSha256Hex -Bytes $download.Bytes
    $extension = Get-SafeExtension -Url $SourceUrl -ContentType $download.ContentType
    $relativePath = "/images/medium/$Slug/$hash$extension"
    $destination = Join-Path $Root ("static\images\medium\{0}\{1}{2}" -f $Slug, $hash, $extension)

    if ($Write) {
      Ensure-Directory -Path (Split-Path -Parent $destination)
      if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) {
        [System.IO.File]::WriteAllBytes($destination, $download.Bytes)
      }
    }

    return [pscustomobject]@{
      Success = $true
      Path = $relativePath
      Localized = $true
      Error = ''
    }
  }
  catch {
    return [pscustomobject]@{
      Success = $false
      Path = ''
      Localized = $false
      Error = $_.Exception.Message
    }
  }
}

function Remove-BodyImageAndCaption {
  param(
    [string[]]$Lines,
    [int]$ImageLineIndex,
    [nullable[int]]$CaptionLineIndex
  )

  $skipIndexes = [System.Collections.Generic.HashSet[int]]::new()
  [void]$skipIndexes.Add($ImageLineIndex)
  if ($CaptionLineIndex -ne $null) {
    [void]$skipIndexes.Add([int]$CaptionLineIndex)
  }

  $updated = New-Object System.Collections.Generic.List[string]
  for ($index = 0; $index -lt $Lines.Length; $index++) {
    if ($skipIndexes.Contains($index)) {
      continue
    }

    $updated.Add($Lines[$index])
  }

  $body = ($updated.ToArray() -join "`n")
  $body = $body -replace "`r`n", "`n"
  $body = [regex]::Replace($body, "\n{3,}", "`n`n")
  $body = $body.Trim("`n")
  if ($body) {
    $body += "`n"
  }

  return $body
}

function Get-BodyImageNormalization {
  param(
    [string]$Body,
    [string]$FeaturedImage,
    [string]$FeaturedImageAlt,
    [string]$FeaturedImageCaption,
    [string]$EssayTitle,
    [string]$Slug,
    [string]$Root,
    [switch]$Write
  )

  $lines = $Body -replace "`r`n", "`n" -split "`n", 0, 'SimpleMatch'
  $image = Get-FirstImageOccurrence -Lines $lines
  $firstHeadingLine = Get-FirstHeadingLineNumber -Lines $lines
  $effectiveFeaturedImageAlt = Get-PreservedFeaturedImageAlt -CurrentAlt $FeaturedImageAlt -CurrentCaption $FeaturedImageCaption -EssayTitle $EssayTitle

  if ($null -eq $image) {
    return [pscustomobject]@{
      Status = 'SKIPPED_NO_LEAD_CANDIDATE'
      Reason = 'No body image found.'
      LeadSource = ''
      LeadLineNumber = $null
      FirstHeadingLineNumber = $firstHeadingLine
      NewFeaturedImage = $FeaturedImage
      NewFeaturedImageAlt = $effectiveFeaturedImageAlt
      NewFeaturedImageCaption = $FeaturedImageCaption
      Body = $Body
      BodyImageRemoved = $false
      CaptionMigrated = $false
      Localized = $false
      Error = ''
    }
  }

  if ($image.Source -eq $script:DefaultPlaceholderHero) {
    return [pscustomobject]@{
      Status = 'SKIPPED_PLACEHOLDER_CANDIDATE'
      Reason = 'First body image is the placeholder image.'
      LeadSource = $image.Source
      LeadLineNumber = $image.LineNumber
      FirstHeadingLineNumber = $firstHeadingLine
      NewFeaturedImage = $FeaturedImage
      NewFeaturedImageAlt = $effectiveFeaturedImageAlt
      NewFeaturedImageCaption = $FeaturedImageCaption
      Body = $Body
      BodyImageRemoved = $false
      CaptionMigrated = $false
      Localized = $false
      Error = ''
    }
  }

  if (($image.LineNumber -gt $script:LeadImageLineLimit) -or ($firstHeadingLine -and ($image.LineNumber -ge $firstHeadingLine))) {
    return [pscustomobject]@{
      Status = 'REVIEW_LEAD_OUTSIDE_HEURISTIC'
      Reason = 'First body image falls outside the lead-image heuristic.'
      LeadSource = $image.Source
      LeadLineNumber = $image.LineNumber
      FirstHeadingLineNumber = $firstHeadingLine
      NewFeaturedImage = $FeaturedImage
      NewFeaturedImageAlt = $effectiveFeaturedImageAlt
      NewFeaturedImageCaption = $FeaturedImageCaption
      Body = $Body
      BodyImageRemoved = $false
      CaptionMigrated = $false
      Localized = $false
      Error = ''
    }
  }

  $captionCandidate = Get-FollowingCaptionCandidate -Lines $lines -ImageLineIndex $image.LineIndex
  $captionFromTitle = Normalize-CaptionText -Value $image.Title
  $captionText = if (-not [string]::IsNullOrWhiteSpace($captionFromTitle)) {
    $captionFromTitle
  }
  elseif ($null -ne $captionCandidate) {
    $captionCandidate.Text
  }
  else {
    ''
  }

  $captionAltFallback = if ($null -ne $captionCandidate) {
    $captionCandidate.AltFallback
  }
  elseif (-not [string]::IsNullOrWhiteSpace($captionFromTitle)) {
    Get-CaptionAltFallback -CaptionText $captionFromTitle
  }
  else {
    ''
  }

  if ($FeaturedImage -and ($FeaturedImage -ne $script:DefaultPlaceholderHero)) {
    if ($FeaturedImage -eq $image.Source) {
      $body = Remove-BodyImageAndCaption -Lines $lines -ImageLineIndex $image.LineIndex -CaptionLineIndex $(if ($null -ne $captionCandidate) { $captionCandidate.LineIndex } else { $null })
      return [pscustomobject]@{
        Status = 'DEDUPED_EXISTING_HERO'
        Reason = 'Body lead image duplicates the existing hero.'
        LeadSource = $image.Source
        LeadLineNumber = $image.LineNumber
        FirstHeadingLineNumber = $firstHeadingLine
        NewFeaturedImage = $FeaturedImage
        NewFeaturedImageAlt = if ($effectiveFeaturedImageAlt) { $effectiveFeaturedImageAlt } elseif ($image.Alt) { $image.Alt } elseif ($captionAltFallback) { $captionAltFallback } else { $EssayTitle }
        NewFeaturedImageCaption = if ($FeaturedImageCaption) { $FeaturedImageCaption } else { $captionText }
        Body = $body
        BodyImageRemoved = $true
        CaptionMigrated = [bool](-not [string]::IsNullOrWhiteSpace($captionText) -or ($null -ne $captionCandidate))
        Localized = $false
        Error = ''
      }
    }

    return [pscustomobject]@{
      Status = 'SKIPPED_CURRENT_HERO_WINS'
      Reason = 'Essay already has a non-placeholder hero.'
      LeadSource = $image.Source
      LeadLineNumber = $image.LineNumber
      FirstHeadingLineNumber = $firstHeadingLine
      NewFeaturedImage = $FeaturedImage
      NewFeaturedImageAlt = $effectiveFeaturedImageAlt
      NewFeaturedImageCaption = $FeaturedImageCaption
      Body = $Body
      BodyImageRemoved = $false
      CaptionMigrated = $false
      Localized = $false
      Error = ''
    }
  }

  $localization = Localize-LeadImage -Root $Root -Slug $Slug -SourceUrl $image.Source -Write:$Write
  if (-not $localization.Success) {
    return [pscustomobject]@{
      Status = 'FAILED_LOCALIZATION'
      Reason = 'Failed to localize the promoted hero image.'
      LeadSource = $image.Source
      LeadLineNumber = $image.LineNumber
      FirstHeadingLineNumber = $firstHeadingLine
      NewFeaturedImage = $FeaturedImage
      NewFeaturedImageAlt = $FeaturedImageAlt
      NewFeaturedImageCaption = $FeaturedImageCaption
      Body = $Body
      BodyImageRemoved = $false
      CaptionMigrated = $false
      Localized = $false
      Error = $localization.Error
    }
  }

  $newFeaturedImage = $localization.Path
  $newFeaturedImageAlt = if ($effectiveFeaturedImageAlt) {
    $effectiveFeaturedImageAlt
  }
  elseif (-not [string]::IsNullOrWhiteSpace($image.Alt)) {
    $image.Alt
  }
  elseif (-not [string]::IsNullOrWhiteSpace($captionAltFallback)) {
    $captionAltFallback
  }
  else {
    $EssayTitle
  }
  $newFeaturedImageCaption = if ($FeaturedImageCaption) { $FeaturedImageCaption } else { $captionText }
  $body = Remove-BodyImageAndCaption -Lines $lines -ImageLineIndex $image.LineIndex -CaptionLineIndex $(if ($null -ne $captionCandidate) { $captionCandidate.LineIndex } else { $null })

  return [pscustomobject]@{
    Status = 'PROMOTED'
    Reason = 'Promoted lead image into frontmatter hero.'
    LeadSource = $image.Source
    LeadLineNumber = $image.LineNumber
    FirstHeadingLineNumber = $firstHeadingLine
    NewFeaturedImage = $newFeaturedImage
    NewFeaturedImageAlt = $newFeaturedImageAlt
    NewFeaturedImageCaption = $newFeaturedImageCaption
    Body = $body
    BodyImageRemoved = $true
    CaptionMigrated = [bool](-not [string]::IsNullOrWhiteSpace($captionText) -or ($null -ne $captionCandidate))
    Localized = [bool]$localization.Localized
    Error = ''
  }
}

function Build-UpdatedEssayText {
  param(
    [string]$FrontMatter,
    [string]$Body,
    [string]$FeaturedImage,
    [string]$FeaturedImageAlt,
    [string]$FeaturedImageCaption
  )

  $lines = $FrontMatter -replace "`r`n", "`n" -split "`n", 0, 'SimpleMatch'
  $lines = Set-FrontMatterScalar -Lines $lines -Key 'featured_image' -Value $FeaturedImage -InsertAfter @('description', 'subtitle')

  if ([string]::IsNullOrWhiteSpace($FeaturedImageAlt)) {
    $lines = Remove-FrontMatterScalar -Lines $lines -Key 'featured_image_alt'
  }
  else {
    $lines = Set-FrontMatterScalar -Lines $lines -Key 'featured_image_alt' -Value $FeaturedImageAlt -InsertAfter @('featured_image')
  }

  if ([string]::IsNullOrWhiteSpace($FeaturedImageCaption)) {
    $lines = Remove-FrontMatterScalar -Lines $lines -Key 'featured_image_caption'
  }
  else {
    $lines = Set-FrontMatterScalar -Lines $lines -Key 'featured_image_caption' -Value $FeaturedImageCaption -InsertAfter @('featured_image_alt', 'featured_image')
  }

  $front = ($lines -join "`n").TrimEnd("`n")
  $bodyNormalized = ($Body -replace "`r`n", "`n").Trim("`n")

  if ($bodyNormalized) {
    return "---`n$front`n---`n`n$bodyNormalized`n"
  }

  return "---`n$front`n---`n"
}

function Invoke-EssayHeroNormalization {
  param(
    [string]$Path,
    [string]$Root,
    [switch]$Write
  )

  $parts = Get-FrontMatterAndBody -Path $Path
  $frontMatter = $parts.FrontMatter
  $body = $parts.Body
  $title = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'title'
  $slug = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'slug'
  if (-not $slug) {
    $slug = [System.IO.Path]::GetFileNameWithoutExtension($Path)
  }

  $featuredImage = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'featured_image'
  $featuredImageAlt = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'featured_image_alt'
  $featuredImageCaption = Get-FrontMatterScalar -FrontMatter $frontMatter -Key 'featured_image_caption'

  $normalization = Get-BodyImageNormalization `
    -Body $body `
    -FeaturedImage $featuredImage `
    -FeaturedImageAlt $featuredImageAlt `
    -FeaturedImageCaption $featuredImageCaption `
    -EssayTitle $title `
    -Slug $slug `
    -Root $Root `
    -Write:$Write

  $updatedText = $parts.Original
  $fileChanged = $false
  $needsRewrite =
    ($normalization.NewFeaturedImage -ne $featuredImage) -or
    ($normalization.NewFeaturedImageAlt -ne $featuredImageAlt) -or
    ($normalization.NewFeaturedImageCaption -ne $featuredImageCaption) -or
    ($normalization.Body -ne $body)

  if ($needsRewrite) {
    $updatedText = Build-UpdatedEssayText `
      -FrontMatter $frontMatter `
      -Body $normalization.Body `
      -FeaturedImage $normalization.NewFeaturedImage `
      -FeaturedImageAlt $normalization.NewFeaturedImageAlt `
      -FeaturedImageCaption $normalization.NewFeaturedImageCaption

    $fileChanged = ($updatedText -ne $parts.Original)
    if ($Write -and $fileChanged) {
      Write-TextNoBom -Path $Path -Content $updatedText
    }
  }

  return [pscustomobject]@{
    Path = $Path
    RelativePath = Get-RepoRelativePath -RepoRoot $Root -PathValue $Path
    Slug = $slug
    Title = $title
    Status = $normalization.Status
    Reason = $normalization.Reason
    OldHero = $featuredImage
    NewHero = $normalization.NewFeaturedImage
    LeadCandidate = $normalization.LeadSource
    LeadLineNumber = $normalization.LeadLineNumber
    FirstHeadingLineNumber = $normalization.FirstHeadingLineNumber
    Localized = [bool]$normalization.Localized
    CaptionMigrated = [bool]$normalization.CaptionMigrated
    BodyImageRemoved = [bool]$normalization.BodyImageRemoved
    Changed = [bool]$fileChanged
    Error = $normalization.Error
  }
}

if (-not $ReportBasePath) {
  $ReportBasePath = Join-Path $Root ($script:ReportsRelativeDir + '\essay-hero-normalization')
}

$paths = Resolve-TargetEssayPaths -RepoRoot $Root -ExplicitPaths $Paths
if ($paths.Count -eq 0) {
  throw 'No essay markdown files found to normalize.'
}

$results = New-Object System.Collections.Generic.List[object]
foreach ($path in $paths) {
  $results.Add((Invoke-EssayHeroNormalization -Path $path -Root $Root -Write:$Write))
}

$jsonPath = "$ReportBasePath.json"
$csvPath = "$ReportBasePath.csv"
$mdPath = "$ReportBasePath.md"

$reportPayload = [pscustomobject]@{
  generated_at = (Get-Date).ToString('o')
  write = [bool]$Write
  totals = [pscustomobject]@{
    scanned_files = $results.Count
    promoted = @($results | Where-Object { $_.Status -eq 'PROMOTED' }).Count
    deduped_existing_hero = @($results | Where-Object { $_.Status -eq 'DEDUPED_EXISTING_HERO' }).Count
    skipped_current_hero_wins = @($results | Where-Object { $_.Status -eq 'SKIPPED_CURRENT_HERO_WINS' }).Count
    skipped_no_lead_candidate = @($results | Where-Object { $_.Status -eq 'SKIPPED_NO_LEAD_CANDIDATE' }).Count
    skipped_placeholder_candidate = @($results | Where-Object { $_.Status -eq 'SKIPPED_PLACEHOLDER_CANDIDATE' }).Count
    review_lead_outside_heuristic = @($results | Where-Object { $_.Status -eq 'REVIEW_LEAD_OUTSIDE_HEURISTIC' }).Count
    failed_localization = @($results | Where-Object { $_.Status -eq 'FAILED_LOCALIZATION' }).Count
  }
  files = $results
}

Write-TextNoBom -Path $jsonPath -Content ($reportPayload | ConvertTo-Json -Depth 8)
$results |
  Select-Object RelativePath,Title,Status,Reason,OldHero,NewHero,LeadCandidate,LeadLineNumber,FirstHeadingLineNumber,Localized,CaptionMigrated,BodyImageRemoved,Changed,Error |
  Export-Csv -Path $csvPath -NoTypeInformation -Encoding utf8

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# Essay Hero Normalization')
$lines.Add('')
$lines.Add("- Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))")
$lines.Add("- Write mode: $([bool]$Write)")
$lines.Add("- Scanned files: $($results.Count)")
$lines.Add('')
$lines.Add('## Status Totals')
$lines.Add('')
foreach ($property in $reportPayload.totals.PSObject.Properties) {
  $lines.Add("- $($property.Name): $($property.Value)")
}
$lines.Add('')
$lines.Add('## Results')
$lines.Add('')
foreach ($row in ($results | Sort-Object Status, RelativePath)) {
  $detail = @(
    "status=$($row.Status)",
    "oldHero=$($row.OldHero)",
    "newHero=$($row.NewHero)",
    "lead=$($row.LeadCandidate)"
  ) -join ' :: '
  $lines.Add("- ``$($row.RelativePath)`` :: $detail")
  if ($row.Reason) {
    $lines.Add("  reason: $($row.Reason)")
  }
  if ($row.Error) {
    $lines.Add("  error: $($row.Error)")
  }
}

Write-TextNoBom -Path $mdPath -Content (($lines -join "`r`n") + "`r`n")

Write-Host 'Essay hero normalization complete' -ForegroundColor Cyan
Write-Host "JSON report: $jsonPath"
Write-Host "CSV report: $csvPath"
Write-Host "Markdown report: $mdPath"
