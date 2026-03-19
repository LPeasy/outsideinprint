param(
  [Parameter(Mandatory = $true)] [string]$ZipPath,
  [string]$ContentOut = "./content/essays",
  [string]$MediaOut = "./static/images/medium",
  [string]$ReportOut,
  [string]$SlugMapPath = "./reports/medium-slug-map.json",
  [ValidateSet("legacy", "strict")] [string]$Mode = "legacy",
  [int]$MinWords = 250,
  [bool]$DraftDefault = $true,
  [string[]]$IncludeTags,
  [string[]]$ExcludeTags,
  [Nullable[datetime]]$SinceDate,
  [int]$Limit,
  [switch]$DryRun,
  [switch]$OverwriteExisting
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Ensure-Directory([string]$Path) {
  if ($Path -and -not (Test-Path $Path -PathType Container)) {
    New-Item -Path $Path -ItemType Directory -Force | Out-Null
  }
}

function Write-TextNoBom([string]$Path, [string]$Content) {
  $d = Split-Path -Path $Path -Parent
  if ($d) { Ensure-Directory $d }
  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Decode-Html([string]$Value) {
  if ($null -eq $Value) { return "" }
  [System.Net.WebUtility]::HtmlDecode($Value)
}

function Strip-Html([string]$Html) {
  if (-not $Html) { return "" }
  $tmp = [regex]::Replace($Html, "<[^>]+>", " ")
  $tmp = Decode-Html $tmp
  ([regex]::Replace($tmp, "\s+", " ")).Trim()
}

function Normalize-Slug([string]$Value) {
  if (-not $Value) { return "untitled" }
  $s = (Decode-Html $Value).ToLowerInvariant()
  $s = $s -replace "[^a-z0-9\s-]", ""
  $s = $s -replace "\s+", "-"
  $s = $s -replace "-+", "-"
  $s = $s.Trim('-')
  if (-not $s) { return "untitled" }
  $s
}

function Escape-Yaml([string]$Value) {
  if ($null -eq $Value) { return "" }
  (($Value -replace "\\", "\\\\") -replace '"', '\\"')
}

function Get-HtmlAttributeValue([string]$Tag, [string]$Name) {
  if (-not $Tag -or -not $Name) { return "" }

  $pattern = '\b' + [regex]::Escape($Name) + '\s*=\s*(?:"([^"]*)"|''([^'']*)''|([^\s>]+))'
  $match = [regex]::Match($Tag, $pattern, 'IgnoreCase')
  if (-not $match.Success) { return "" }

  foreach ($index in 1..3) {
    if ($match.Groups[$index].Success) {
      return Decode-Html $match.Groups[$index].Value
    }
  }

  ""
}

function Escape-HtmlAttribute([string]$Value) {
  if ($null -eq $Value) { return "" }
  [System.Net.WebUtility]::HtmlEncode($Value)
}

function Normalize-MetadataDescriptionText([string]$Value) {
  if ($null -eq $Value) { return "" }

  $clean = Decode-Html $Value
  $clean = $clean -replace '!\[[^\]]*\]\([^)]+\)', ' '
  $clean = $clean -replace '\[([^\]]+)\]\([^)]+\)', '$1'
  $clean = $clean -replace '\[Embedded media:\s*[^\]]+\]', ' '
  $clean = Strip-Html $clean
  $clean = $clean -replace '(?m)^\s*>\s*', ''
  $clean = $clean -replace '\s+', ' '
  (Repair-Mojibake $clean).Trim()
}

function Trim-MetadataDescription([string]$Value, [int]$MaxLength = 160) {
  $clean = Normalize-MetadataDescriptionText $Value
  if ([string]::IsNullOrWhiteSpace($clean)) { return "" }
  if ($clean.Length -le $MaxLength) { return $clean }

  $sliceLength = [Math]::Min($clean.Length, $MaxLength + 1)
  $truncated = $clean.Substring(0, $sliceLength)
  $boundary = $truncated.LastIndexOf(' ')
  if ($boundary -ge [Math]::Floor($MaxLength * 0.6)) {
    $truncated = $truncated.Substring(0, $boundary)
  } else {
    $truncated = $clean.Substring(0, $MaxLength)
  }

  $truncated.Trim().TrimEnd(' ', ',', ';', '-', ':', '~', '.', '!')
}

function Get-WordCount([string]$Text) {
  if (-not $Text) { return 0 }
  (($Text -split "\s+") | Where-Object { $_ -match "\w" }).Count
}

function Decode-1252AsUtf8([string]$Text) {
  if ($null -eq $Text) { return "" }
  $bytes = [System.Text.Encoding]::GetEncoding(1252).GetBytes($Text)
  [System.Text.Encoding]::UTF8.GetString($bytes)
}

function Get-CharCount([string]$Text, [char]$Ch) {
  if ($null -eq $Text) { return 0 }
  ([regex]::Matches($Text, [regex]::Escape([string]$Ch))).Count
}

function Get-MojibakeScore([string]$Text) {
  if ($null -eq $Text) { return 0 }
  $score = 0
  $score += Get-CharCount $Text ([char]0x00C3)
  $score += Get-CharCount $Text ([char]0x00C2)
  $score += Get-CharCount $Text ([char]0x00E2)
  $score += Get-CharCount $Text ([char]0x00F0)
  $score += 3 * (Get-CharCount $Text ([char]0xFFFD))
  $score
}

function Repair-Mojibake([string]$Text) {
  if ($null -eq $Text) { return "" }
  $best = $Text
  $bestScore = Get-MojibakeScore $Text

  $cand1 = Decode-1252AsUtf8 $Text
  $score1 = Get-MojibakeScore $cand1
  if ($score1 -lt $bestScore) { $best = $cand1; $bestScore = $score1 }

  $cand2 = Decode-1252AsUtf8 $cand1
  $score2 = Get-MojibakeScore $cand2
  if ($score2 -lt $bestScore) { $best = $cand2; $bestScore = $score2 }

  $best -replace ([char]0x00A0), " "
}

function Get-PostIdFromCanonical([string]$Url) {
  if (-not $Url) { return "" }
  $m = [regex]::Match($Url, "/p/([a-f0-9]{8,})", "IgnoreCase")
  if ($m.Success) { return $m.Groups[1].Value.ToLowerInvariant() }
  $m = [regex]::Match($Url, "-([a-f0-9]{8,})/?$", "IgnoreCase")
  if ($m.Success) { return $m.Groups[1].Value.ToLowerInvariant() }
  ""
}

function Get-CanonicalSlug([string]$Url) {
  if (-not $Url) { return "" }
  $uri = $null
  if (-not [uri]::TryCreate($Url, [uriKind]::Absolute, [ref]$uri)) { return "" }
  $last = ($uri.AbsolutePath.Trim('/') -split '/')[-1]
  if (-not $last -or $last -eq "p") { return "" }
  if ($last -match '^([a-z0-9-]+)-[a-f0-9]{8,}$') { return Normalize-Slug $Matches[1] }
  Normalize-Slug $last
}

function Parse-Post([string]$Html, [string]$FileName) {
  $title = ""
  $subtitle = ""
  $canonical = ""
  $publishedRaw = ""
  $body = ""

  $m = [regex]::Match($Html, '<h1 class="p-name">([\s\S]*?)</h1>', "IgnoreCase")
  if ($m.Success) { $title = Strip-Html $m.Groups[1].Value }

  $m = [regex]::Match($Html, '<section data-field="subtitle" class="p-summary">([\s\S]*?)</section>', "IgnoreCase")
  if ($m.Success) { $subtitle = Strip-Html $m.Groups[1].Value }

  $m = [regex]::Match($Html, '<a[^>]*href="([^"]+)"[^>]*class="p-canonical"', "IgnoreCase")
  if ($m.Success) { $canonical = Decode-Html $m.Groups[1].Value.Trim() }
  if (-not $canonical) {
    $m = [regex]::Match($Html, '<a[^>]*class="p-canonical"[^>]*href="([^"]+)"', "IgnoreCase")
    if ($m.Success) { $canonical = Decode-Html $m.Groups[1].Value.Trim() }
  }

  $m = [regex]::Match($Html, '<time class="dt-published" datetime="([^"]+)"', "IgnoreCase")
  if ($m.Success) { $publishedRaw = $m.Groups[1].Value.Trim() }

  $m = [regex]::Match($Html, '<section data-field="body" class="e-content">([\s\S]*?)</section>\s*<footer>', "IgnoreCase")
  if ($m.Success) { $body = $m.Groups[1].Value }
  if (-not $body) {
    $m = [regex]::Match($Html, '<section data-field="body" class="e-content">([\s\S]*?)</section>', "IgnoreCase")
    if ($m.Success) { $body = $m.Groups[1].Value }
  }

  $title = Repair-Mojibake $title
  $subtitle = Repair-Mojibake $subtitle
  $body = Repair-Mojibake $body

  [datetimeoffset]$dto = [datetimeoffset]::MinValue
  $hasDate = $false
  if ($publishedRaw) { $hasDate = [datetimeoffset]::TryParse($publishedRaw, [ref]$dto) }

  $images = New-Object System.Collections.Generic.List[string]
  foreach ($im in [regex]::Matches($body, '<img\b[^>]*src="([^"]+)"', "IgnoreCase")) {
    $u = Decode-Html $im.Groups[1].Value.Trim()
    if ($u -and -not $images.Contains($u)) { $images.Add($u) }
  }

  $embeds = New-Object System.Collections.Generic.List[string]
  foreach ($em in [regex]::Matches($body, '<iframe\b[^>]*src="([^"]+)"[^>]*>([\s\S]*?)</iframe>', "IgnoreCase")) {
    $u = Decode-Html $em.Groups[1].Value.Trim()
    if ($u -and -not $embeds.Contains($u)) { $embeds.Add($u) }
  }

  $tags = @()
  foreach ($tm in [regex]::Matches($Html, 'rel="tag"[^>]*>([^<]+)<', "IgnoreCase")) {
    $t = (Strip-Html $tm.Groups[1].Value).ToLowerInvariant()
    if ($t) { $tags += $t }
  }

  $publishedOut = $null
  if ($hasDate) { $publishedOut = $dto }

  [pscustomobject]@{
    file_name = $FileName
    title = $title
    subtitle = $subtitle
    canonical_url = $canonical
    published_raw = $publishedRaw
    published_dto = $publishedOut
    body_html = $body
    body_text = Strip-Html $body
    word_count = Get-WordCount (Strip-Html $body)
    image_urls = $images
    embed_urls = $embeds
    tags = $tags
  }
}

function Normalize-ImportedCaptionText([string]$Value) {
  if ($null -eq $Value) { return "" }

  $clean = Decode-Html $Value
  $clean = $clean -replace '\[([^\]]+)\]\([^)]+\)', '$1'
  $clean = $clean -replace '^\s*>\s*', ''
  $clean = $clean -replace '\s+', ' '
  (Repair-Mojibake $clean).Trim()
}

function Test-DescriptiveCaptionSegment([string]$Value) {
  $clean = Normalize-ImportedCaptionText $Value
  if ([string]::IsNullOrWhiteSpace($clean)) { return $false }
  if ($clean.Length -lt 6 -or $clean.Length -gt 120) { return $false }
  if ($clean -match '^(?i)(photo by|source:|courtesy of|image courtesy of|image source:)') { return $false }
  if ($clean -match '^(?i)https?://') { return $false }
  return @($clean -split '\s+' | Where-Object { $_ }).Count -ge 2
}

function Get-ImportedImageCaptionMetadata([string]$Caption) {
  $clean = Normalize-ImportedCaptionText $Caption
  $result = [ordered]@{
    is_caption = $false
    caption = $clean
    alt_fallback = ""
  }

  if ([string]::IsNullOrWhiteSpace($clean)) {
    return [pscustomobject]$result
  }

  if ($clean -match '^(?i)photo by .+ on unsplash$') {
    $result.is_caption = $true
    return [pscustomobject]$result
  }

  if ($clean -match '^(?i)(source:|courtesy of |image courtesy of |image source:)') {
    $result.is_caption = $true
    return [pscustomobject]$result
  }

  if ($clean.Contains('|')) {
    $segments = @($clean -split '\|' | ForEach-Object { (Normalize-ImportedCaptionText $_) } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($segments.Count -ge 2) {
      $result.is_caption = $true
      if (Test-DescriptiveCaptionSegment $segments[0]) {
        $result.alt_fallback = $segments[0]
      }
      return [pscustomobject]$result
    }
  }

  return [pscustomobject]$result
}

function Set-ImageAltIfMissing([string]$ImgHtml, [string]$AltText) {
  if ([string]::IsNullOrWhiteSpace($ImgHtml) -or [string]::IsNullOrWhiteSpace($AltText)) {
    return $ImgHtml
  }

  $existingAlt = Get-HtmlAttributeValue -Tag $ImgHtml -Name 'alt'
  if (-not [string]::IsNullOrWhiteSpace($existingAlt)) {
    return $ImgHtml
  }

  $escapedAlt = Escape-HtmlAttribute $AltText
  if ($ImgHtml -match '(?i)\balt\s*(?:=\s*(?:""|' + "''" + '))?') {
    return [regex]::Replace($ImgHtml, '(?i)\balt\s*(?:=\s*(?:""|' + "''" + '))?', ('alt="{0}"' -f $escapedAlt), 1)
  }

  return [regex]::Replace($ImgHtml, '\s*/?>$', (' alt="{0}"$0' -f $escapedAlt), 1)
}

function Escape-MarkdownImageText([string]$Value, [switch]$ForTitle) {
  if ($null -eq $Value) { return "" }

  $text = $Value -replace "`r?`n", ' '
  $text = $text -replace '\s+', ' '
  $text = $text.Trim()

  if ($ForTitle) {
    return ($text -replace '"', '\"')
  }

  return (($text -replace '\\', '\\\\') -replace '\]', '\]')
}

function New-MarkdownImage([string]$Alt, [string]$Src, [string]$Title) {
  $escapedAlt = Escape-MarkdownImageText -Value $Alt
  $escapedTitle = Escape-MarkdownImageText -Value $Title -ForTitle
  if ([string]::IsNullOrWhiteSpace($escapedTitle)) {
    return ('![{0}]({1})' -f $escapedAlt, $Src)
  }

  return ('![{0}]({1} "{2}")' -f $escapedAlt, $Src, $escapedTitle)
}

function Wrap-ImportedFigureCaptionsInHtml([string]$BodyHtml) {
  if ([string]::IsNullOrWhiteSpace($BodyHtml)) { return "" }

  $wrapped = $BodyHtml
  $imageWithParagraphCaptionPattern = '(?is)<p>\s*(?<img><img\b[^>]*>)\s*</p>\s*<p>\s*(?<caption>.*?)\s*</p>'
  $imageWithBlockquoteCaptionPattern = '(?is)<p>\s*(?<img><img\b[^>]*>)\s*</p>\s*<blockquote>\s*<p>\s*(?<caption>.*?)\s*</p>\s*</blockquote>'

  $wrapEvaluator = {
    param($match)

    $captionHtml = $match.Groups['caption'].Value.Trim()
    $metadata = Get-ImportedImageCaptionMetadata (Strip-Html $captionHtml)
    if (-not $metadata.is_caption) {
      return $match.Value
    }

    $imgHtml = $match.Groups['img'].Value
    if (-not [string]::IsNullOrWhiteSpace($metadata.alt_fallback)) {
      $imgHtml = Set-ImageAltIfMissing -ImgHtml $imgHtml -AltText $metadata.alt_fallback
    }

    return ('<figure>{0}<figcaption>{1}</figcaption></figure>' -f $imgHtml, $captionHtml)
  }

  $wrapped = [regex]::Replace($wrapped, $imageWithBlockquoteCaptionPattern, $wrapEvaluator)
  $wrapped = [regex]::Replace($wrapped, $imageWithParagraphCaptionPattern, $wrapEvaluator)
  $wrapped
}

function Merge-ImportedImageCaptions([string]$Markdown) {
  if ([string]::IsNullOrWhiteSpace($Markdown)) { return "" }

  $pattern = '(?ms)^(?<image>!\[(?<alt>[^\]]*)\]\((?<inner>[^\r\n]+)\))\s*\n+(?<caption>(?:>\s*)?[^\n]+?)\s*(?<separator>\n{2,}|\z)'
  [regex]::Replace($Markdown, $pattern, {
      param($match)

      $inner = $match.Groups['inner'].Value.Trim()
      $innerMatch = [regex]::Match($inner, '^(?<url>\S+?)(?:\s+"(?<title>[^"]*)")?$')
      if (-not $innerMatch.Success) {
        return $match.Value
      }

      $title = $innerMatch.Groups['title'].Value
      if (-not [string]::IsNullOrWhiteSpace($title)) {
        return $match.Value
      }

      $metadata = Get-ImportedImageCaptionMetadata $match.Groups['caption'].Value
      if (-not $metadata.is_caption) {
        return $match.Value
      }

      $alt = $match.Groups['alt'].Value
      if ([string]::IsNullOrWhiteSpace($alt) -and -not [string]::IsNullOrWhiteSpace($metadata.alt_fallback)) {
        $alt = $metadata.alt_fallback
      }

      return (New-MarkdownImage -Alt $alt -Src $innerMatch.Groups['url'].Value -Title $metadata.caption) + $match.Groups['separator'].Value
    })
}

function Get-ImportedDescriptionFromMarkdown([string]$Markdown) {
  if ([string]::IsNullOrWhiteSpace($Markdown)) { return "" }

  $blocks = [regex]::Split($Markdown.Trim(), '(?:\r?\n){2,}')
  foreach ($block in $blocks) {
    $clean = Normalize-MetadataDescriptionText $block
    if ([string]::IsNullOrWhiteSpace($clean)) { continue }
    if ($clean -match '^(?i)(photo by .+ on unsplash|source:|courtesy of |image courtesy of |image source:|embedded media:)') { continue }

    $captionMetadata = Get-ImportedImageCaptionMetadata $clean
    if ([bool]$captionMetadata.is_caption) { continue }
    if ($clean.Length -lt 40) { continue }

    return (Trim-MetadataDescription $clean)
  }

  return ""
}

function Get-ImportedPostDescription([string]$Subtitle, [string]$Markdown) {
  $subtitleDescription = Trim-MetadataDescription $Subtitle
  if (-not [string]::IsNullOrWhiteSpace($subtitleDescription)) {
    return $subtitleDescription
  }

  return (Get-ImportedDescriptionFromMarkdown $Markdown)
}

function Convert-HtmlFallback([string]$BodyHtml) {
  $m = $BodyHtml
  $m = [regex]::Replace($m, '(?is)<figure\b[^>]*>\s*(?<img><img\b[^>]*>)\s*(?:<figcaption\b[^>]*>(?<caption>.*?)</figcaption>)?\s*</figure>', {
      param($match)

      $imgTag = $match.Groups['img'].Value
      $src = Get-HtmlAttributeValue -Tag $imgTag -Name 'src'
      if ([string]::IsNullOrWhiteSpace($src)) {
        return "`n`n"
      }

      $alt = Get-HtmlAttributeValue -Tag $imgTag -Name 'alt'
      $caption = Normalize-ImportedCaptionText (Strip-Html $match.Groups['caption'].Value)
      $metadata = Get-ImportedImageCaptionMetadata $caption
      if ([string]::IsNullOrWhiteSpace($alt) -and -not [string]::IsNullOrWhiteSpace($metadata.alt_fallback)) {
        $alt = $metadata.alt_fallback
      }

      return ("`n`n{0}`n`n" -f (New-MarkdownImage -Alt $alt -Src $src -Title $caption))
    })
  $m = [regex]::Replace($m, '(?is)<img\b[^>]*>', {
      param($match)

      $tag = $match.Value
      $src = Get-HtmlAttributeValue -Tag $tag -Name 'src'
      if ([string]::IsNullOrWhiteSpace($src)) {
        return ''
      }

      $alt = Get-HtmlAttributeValue -Tag $tag -Name 'alt'
      return New-MarkdownImage -Alt $alt -Src $src -Title ''
    })
  $m = $m -replace '(?i)<br\s*/?>', "`n"
  $m = $m -replace '(?i)</p>', "`n`n"
  $m = $m -replace '(?i)<li[^>]*>', '- '
  $m = $m -replace '(?i)</li>', "`n"
  $m = $m -replace '(?i)</h[1-6]>', "`n`n"
  $m = $m -replace '<[^>]+>', ''
  $m = Decode-Html $m
  $m = $m -replace "`r`n", "`n"
  $m = $m -replace "[ `t]+$", ""
  $m = $m -replace "`n{3,}", "`n`n"
  Repair-Mojibake ($m.Trim() + "`n")
}

function Convert-BodyToMarkdown([string]$BodyHtml, [string]$TempRoot, [string]$FileStem) {
  $htmlPath = Join-Path $TempRoot ($FileStem + '.body.html')
  $mdPath = Join-Path $TempRoot ($FileStem + '.body.md')
  $normalizedHtml = Wrap-ImportedFigureCaptionsInHtml $BodyHtml
  Set-Content -Path $htmlPath -Value $normalizedHtml -Encoding UTF8

  $pandoc = Get-Command pandoc -ErrorAction SilentlyContinue
  if ($pandoc) {
    & pandoc $htmlPath -f html -t gfm -o $mdPath
    if ($LASTEXITCODE -ne 0) { throw "pandoc conversion failed for $FileStem" }
    $md = Get-Content -Path $mdPath -Raw
  } else {
    $md = Convert-HtmlFallback $BodyHtml
  }

  $md = $md -replace "`r`n", "`n"
  $md = $md -replace "[ `t]+$", ""
  $md = $md -replace "`n{3,}", "`n`n"
  $md = Merge-ImportedImageCaptions $md
  Repair-Mojibake ($md.Trim() + "`n")
}

function Get-BytesSha256Hex([byte[]]$Bytes) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $hashBytes = $sha.ComputeHash($Bytes) } finally { $sha.Dispose() }
  ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
}

function Get-SafeExtension([string]$Url, [string]$ContentType) {
  $ext = ''
  try { $ext = [System.IO.Path]::GetExtension(([uri]$Url).AbsolutePath) } catch { $ext = '' }
  if ($ext -match '^\.[A-Za-z0-9]{1,5}$') { return $ext.ToLowerInvariant() }
  if ($ContentType -match 'image/jpeg') { return '.jpg' }
  if ($ContentType -match 'image/png') { return '.png' }
  if ($ContentType -match 'image/webp') { return '.webp' }
  if ($ContentType -match 'image/gif') { return '.gif' }
  '.img'
}

function Localize-Media {
  param([string]$Slug,[string[]]$ImageUrls,[string]$MediaRoot,[string]$Mode,[bool]$DryRun)
  $result = [ordered]@{ replacements = @{}; downloaded = 0; failed = 0; warnings = New-Object System.Collections.Generic.List[string] }
  if ($ImageUrls.Count -eq 0) { return $result }

  $slugDir = Join-Path $MediaRoot $Slug
  if (-not $DryRun) { Ensure-Directory $slugDir }

  foreach ($url in $ImageUrls) {
    if ($DryRun) { $result.replacements[$url] = $url; continue }
    try {
      $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
      $bytes = $resp.Content
      if ($bytes -is [string]) { $bytes = [System.Text.Encoding]::UTF8.GetBytes($bytes) }
      $hash = Get-BytesSha256Hex -Bytes $bytes
      $ext = Get-SafeExtension -Url $url -ContentType $resp.Headers['Content-Type']
      $file = "$hash$ext"
      $dest = Join-Path $slugDir $file
      if (-not (Test-Path $dest -PathType Leaf)) { [System.IO.File]::WriteAllBytes($dest, $bytes) }
      $result.replacements[$url] = "/images/medium/$Slug/$file"
      $result.downloaded++
    } catch {
      $result.failed++
      $result.warnings.Add("media_fetch_failed:$url")
      if ($Mode -eq 'strict') { throw "media_fetch_failed:$url" }
      $result.replacements[$url] = $url
    }
  }
  $result
}

function Load-SlugMap([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path -PathType Leaf)) { return $map }
  $raw = Get-Content -Path $Path -Raw
  if (-not $raw) { return $map }
  $obj = $raw | ConvertFrom-Json
  if ($obj.entries) {
    $obj.entries.PSObject.Properties | ForEach-Object { $map[$_.Name] = $_.Value.slug }
  }
  $map
}

function Save-SlugMap([string]$Path, [hashtable]$Map) {
  $entries = [ordered]@{}
  foreach ($k in ($Map.Keys | Sort-Object)) { $entries[$k] = [ordered]@{ slug = $Map[$k] } }
  $obj = [pscustomobject]@{ version = 1; updated_at = (Get-Date).ToString('o'); entries = $entries }
  Write-TextNoBom $Path ($obj | ConvertTo-Json -Depth 10)
}

$tempRoot = $null
$zipArchive = $null
try {
  if (-not (Test-Path $ZipPath -PathType Leaf)) { Write-Error "Zip not found: $ZipPath"; exit 2 }
  if ($Limit -lt 0) { Write-Error 'Limit must be >= 0'; exit 2 }

  $zipFullPath = [System.IO.Path]::GetFullPath($ZipPath)
  if (-not $ReportOut) { $ReportOut = "./reports/medium-import-$((Get-Date).ToString('yyyyMMdd-HHmmss')).json" }

  Ensure-Directory (Split-Path $ReportOut -Parent)
  Ensure-Directory (Split-Path $SlugMapPath -Parent)
  if (-not $DryRun) {
    Ensure-Directory $ContentOut
    Ensure-Directory $MediaOut
  }

  $slugMap = Load-SlugMap $SlugMapPath
  $usedSlugs = @{}
  Get-ChildItem -Path $ContentOut -File -Filter '*.md' -ErrorAction SilentlyContinue | ForEach-Object {
    $usedSlugs[[System.IO.Path]::GetFileNameWithoutExtension($_.Name)] = $true
  }
  foreach ($v in $slugMap.Values) { $usedSlugs[$v] = $true }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("medium-import-" + [guid]::NewGuid().ToString('N'))
  Ensure-Directory $tempRoot

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zipArchive = [System.IO.Compression.ZipFile]::OpenRead($zipFullPath)
  $postEntries = @(
    $zipArchive.Entries |
    Where-Object {
      $ep = $_.FullName -replace '\\','/'
      $ep -match '(^|/)posts/' -and $ep -match '\.html$' -and -not $ep.EndsWith('/')
    } |
    Sort-Object FullName
  )

  if ($postEntries.Count -eq 0) { Write-Error 'posts/*.html not found in export'; exit 2 }

  $reportEntries = New-Object System.Collections.Generic.List[object]
  $candidates = New-Object System.Collections.Generic.List[object]

  foreach ($entry in $postEntries) {
    $sourceFile = [System.IO.Path]::GetFileName($entry.FullName)
    $sr = New-Object System.IO.StreamReader($entry.Open())
    try { $html = $sr.ReadToEnd() } finally { $sr.Dispose() }
    $post = Parse-Post -Html $html -FileName $sourceFile

    if ($sourceFile -like 'draft_*') { $reportEntries.Add([pscustomobject]@{source_file=$sourceFile;status='skipped';reason_code='draft_filename'}); continue }
    if (-not $post.canonical_url -or -not $post.published_dto -or -not $post.body_html) { $reportEntries.Add([pscustomobject]@{source_file=$sourceFile;status='skipped';reason_code='unverifiable_published_state'}); continue }
    if ($post.word_count -lt $MinWords) { $reportEntries.Add([pscustomobject]@{source_file=$sourceFile;title=$post.title;status='skipped';reason_code='below_min_words';word_count=$post.word_count}); continue }
    if ($SinceDate -and $post.published_dto.DateTime -lt $SinceDate.Value) { $reportEntries.Add([pscustomobject]@{source_file=$sourceFile;status='skipped';reason_code='before_since_date'}); continue }
    if ($ExcludeTags -and @($post.tags | Where-Object { $ExcludeTags -contains $_ }).Count -gt 0) { $reportEntries.Add([pscustomobject]@{source_file=$sourceFile;status='skipped';reason_code='filter_tag_excluded'}); continue }
    if ($IncludeTags -and @($post.tags | Where-Object { $IncludeTags -contains $_ }).Count -eq 0) { $reportEntries.Add([pscustomobject]@{source_file=$sourceFile;status='skipped';reason_code='filter_tag_not_included'}); continue }

    $candidates.Add([pscustomobject]@{ source_file = $sourceFile; post = $post })
  }

  $ordered = $candidates | Sort-Object { $_.post.published_dto }
  if ($Limit -gt 0) { $ordered = $ordered | Select-Object -First $Limit }

  foreach ($cand in $ordered) {
    $sourceFile = $cand.source_file
    $post = $cand.post
    try {
      $postId = Get-PostIdFromCanonical $post.canonical_url
      $slugKey = if ($postId) { "id:$postId" } else { "url:$($post.canonical_url)" }
      if (-not $slugMap.ContainsKey($slugKey)) {
        $base = Get-CanonicalSlug $post.canonical_url
        if (-not $base) { $base = Normalize-Slug $post.title }
        if (-not $base) { $base = 'untitled' }
        $slug = $base
        $i = 2
        while ($usedSlugs.ContainsKey($slug)) { $slug = "$base-$i"; $i++ }
        $slugMap[$slugKey] = $slug
      }

      $slug = $slugMap[$slugKey]
      $usedSlugs[$slug] = $true
      $destPath = Join-Path $ContentOut ($slug + '.md')

      if ((-not $OverwriteExisting) -and (Test-Path $destPath -PathType Leaf)) {
        $reportEntries.Add([pscustomobject]@{source_file=$sourceFile;title=$post.title;canonical_url=$post.canonical_url;slug=$slug;status='skipped';reason_code='existing_target';output_path=$destPath})
        continue
      }

      $bodyHtml = $post.body_html
      $warnings = New-Object System.Collections.Generic.List[string]
      foreach ($embed in $post.embed_urls) {
        $warnings.Add("embed_fallback:$embed")
        $bodyHtml = [regex]::Replace($bodyHtml, '<iframe\b[^>]*src="' + [regex]::Escape($embed) + '"[^>]*>([\s\S]*?)</iframe>', '<p>[Embedded media: <a href="' + $embed + '">' + $embed + '</a>]</p>', 'IgnoreCase')
      }

      $mediaResult = Localize-Media -Slug $slug -ImageUrls @($post.image_urls) -MediaRoot $MediaOut -Mode $Mode -DryRun:$DryRun
      foreach ($w in $mediaResult.warnings) { $warnings.Add($w) }
      foreach ($img in $mediaResult.replacements.Keys) {
        $bodyHtml = $bodyHtml.Replace($img, [System.Net.WebUtility]::HtmlEncode($mediaResult.replacements[$img]))
      }

      $markdown = ''
      if (-not $DryRun) { $markdown = Convert-BodyToMarkdown -BodyHtml $bodyHtml -TempRoot $tempRoot -FileStem $slug }
      $description = Get-ImportedPostDescription -Subtitle $post.subtitle -Markdown $markdown

      $frontLines = @(
        '---',
        ('title: "{0}"' -f (Escape-Yaml $post.title)),
        ('date: {0}' -f $post.published_dto.ToString('yyyy-MM-dd')),
        ('draft: {0}' -f ($(if($DraftDefault){'true'}else{'false'}))),
        ('slug: "{0}"' -f (Escape-Yaml $slug)),
        'section_label: "Essay"',
        ('subtitle: "{0}"' -f (Escape-Yaml $post.subtitle)),
        'version: "1.0"',
        'edition: "First digital edition"',
        ('pdf: "/pdfs/{0}.pdf"' -f $slug),
        'featured: false',
        ('medium_source_url: "{0}"' -f (Escape-Yaml $post.canonical_url))
      )
      if (-not [string]::IsNullOrWhiteSpace($description)) {
        $frontLines += ('description: "{0}"' -f (Escape-Yaml $description))
      }
      $front = (@($frontLines) + '---') -join "`n"

      if (-not $DryRun) { Write-TextNoBom $destPath ($front + "`n`n" + $markdown) }

      $reportEntries.Add([pscustomobject]@{
        source_file = $sourceFile
        title = $post.title
        canonical_url = $post.canonical_url
        slug = $slug
        status = 'converted'
        reason_code = ''
        output_path = $destPath
        dry_run = [bool]$DryRun
        word_count = $post.word_count
        image_count = $post.image_urls.Count
        embed_count = $post.embed_urls.Count
        media_downloaded = $mediaResult.downloaded
        media_failed = $mediaResult.failed
        warnings = @($warnings)
      })
    } catch {
      $reportEntries.Add([pscustomobject]@{source_file=$sourceFile;title=$post.title;canonical_url=$post.canonical_url;status='failed';reason_code='conversion_failed';error=$_.Exception.Message})
    }
  }

  if (-not $DryRun) { Save-SlugMap $SlugMapPath $slugMap }

  $converted = @($reportEntries | Where-Object { $_.status -eq 'converted' }).Count
  $skipped = @($reportEntries | Where-Object { $_.status -eq 'skipped' }).Count
  $failed = @($reportEntries | Where-Object { $_.status -eq 'failed' }).Count

  $sinceDateStr = if ($SinceDate) { $SinceDate.Value.ToString('yyyy-MM-dd') } else { '' }
  $runObj = [pscustomobject]@{ started_at=(Get-Date).ToString('o'); zip_path=$zipFullPath; mode=$Mode; dry_run=[bool]$DryRun; overwrite_existing=[bool]$OverwriteExisting; min_words=$MinWords; draft_default=$DraftDefault; include_tags=@($IncludeTags); exclude_tags=@($ExcludeTags); since_date=$sinceDateStr; limit=$Limit }
  $totalsObj = [pscustomobject]@{ total_post_files=$postEntries.Count; converted=$converted; skipped=$skipped; failed=$failed }
  $entriesOut = $reportEntries.ToArray(); $payload = [ordered]@{ run = $runObj; totals = $totalsObj; entries = $entriesOut }

  Write-TextNoBom $ReportOut ($payload | ConvertTo-Json -Depth 10)
  $summary = @(
    '# Medium Import Summary','',
    ('- Zip: ' + $zipFullPath),
    ('- Mode: ' + $Mode),
    ('- Dry run: ' + [bool]$DryRun),
    ('- Overwrite existing: ' + [bool]$OverwriteExisting),
    ('- Min words: ' + $MinWords),'',
    '## Totals','',
    ('- Converted: ' + $converted),
    ('- Skipped: ' + $skipped),
    ('- Failed: ' + $failed),''
  ) -join "`n"
  Write-TextNoBom ([System.IO.Path]::ChangeExtension($ReportOut, '.md')) ($summary + "`n")

  Write-Host 'Medium import complete' -ForegroundColor Cyan
  Write-Host "Converted: $converted" -ForegroundColor Green
  Write-Host "Skipped: $skipped" -ForegroundColor Yellow
  Write-Host "Failed: $failed" -ForegroundColor Red
  Write-Host "Report: $ReportOut"

  if ($failed -gt 0) { exit 1 }
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 2
} finally {
  if ($zipArchive) { $zipArchive.Dispose() }
  if ($tempRoot -and (Test-Path $tempRoot)) { Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
