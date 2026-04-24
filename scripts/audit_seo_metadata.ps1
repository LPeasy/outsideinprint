param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$ContentDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'content'),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout'),
  [string]$CanonicalBaseUrl = 'https://outsideinprint.org'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )

  ($Value | ConvertTo-Json -Depth 20) | Out-File -FilePath $Path -Encoding utf8
}

function Get-RepoRelativePath {
  param(
    [string]$RepoRoot,
    [string]$PathValue
  )

  $resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path $RepoRoot).Path).TrimEnd('\', '/')
  $resolvedPath = [System.IO.Path]::GetFullPath((Resolve-Path $PathValue).Path)
  if ($resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $resolvedPath.Substring($resolvedRoot.Length).TrimStart('\', '/').Replace('\', '/')
  }

  return $resolvedPath.Replace('\', '/')
}

function ConvertTo-PlainFrontMatterValue {
  param([string]$Value)

  $text = ([string]$Value).Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    return ''
  }

  if ($text -match '^\[(.*)\]$') {
    return @(
      $Matches[1] -split ',' |
        ForEach-Object { ConvertTo-PlainFrontMatterValue -Value $_ } |
        Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }
    )
  }

  if (($text.StartsWith('"') -and $text.EndsWith('"')) -or ($text.StartsWith("'") -and $text.EndsWith("'"))) {
    return $text.Substring(1, $text.Length - 2)
  }

  return $text
}

function Get-FrontMatterParts {
  param([string]$Content)

  $match = [regex]::Match($Content, '(?s)\A---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n|$)')
  if (-not $match.Success) {
    return [pscustomobject]@{
      front_matter = ''
      body = $Content
    }
  }

  return [pscustomobject]@{
    front_matter = $match.Groups[1].Value
    body = $Content.Substring($match.Index + $match.Length)
  }
}

function ConvertFrom-FrontMatter {
  param([string]$FrontMatter)

  $map = @{}
  $lines = @($FrontMatter -split "`r?`n")
  $i = 0
  while ($i -lt $lines.Count) {
    $line = $lines[$i]
    if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) {
      $i++
      continue
    }

    if ($line -match '^([A-Za-z0-9_-]+)\s*:\s*(.*)$') {
      $key = $Matches[1].ToLowerInvariant()
      $rawValue = $Matches[2]
      if ([string]::IsNullOrWhiteSpace($rawValue)) {
        $items = New-Object System.Collections.Generic.List[string]
        $j = $i + 1
        while ($j -lt $lines.Count -and $lines[$j] -match '^\s*-\s*(.+?)\s*$') {
          $items.Add([string](ConvertTo-PlainFrontMatterValue -Value $Matches[1]))
          $j++
        }

        if ($items.Count -gt 0) {
          $map[$key] = @($items)
          $i = $j
          continue
        }
      }

      $map[$key] = ConvertTo-PlainFrontMatterValue -Value $rawValue
    }

    $i++
  }

  return $map
}

function Get-FrontMatterValue {
  param(
    [hashtable]$Map,
    [string]$Key
  )

  $normalizedKey = $Key.ToLowerInvariant()
  if (-not $Map.ContainsKey($normalizedKey)) {
    return ''
  }

  $value = $Map[$normalizedKey]
  if ($value -is [array]) {
    if ($value.Count -eq 0) {
      return ''
    }

    return [string]$value[0]
  }

  return [string]$value
}

function Get-FrontMatterValues {
  param(
    [hashtable]$Map,
    [string]$Key
  )

  $normalizedKey = $Key.ToLowerInvariant()
  if (-not $Map.ContainsKey($normalizedKey)) {
    return @()
  }

  $value = $Map[$normalizedKey]
  if ($value -is [array]) {
    return @($value | ForEach-Object { [string]$_ })
  }

  return @([string]$value)
}

function Normalize-Text {
  param([string]$Value)

  return (([string]$Value -replace '\s+', ' ').Trim())
}

function Join-CanonicalUrl {
  param(
    [string]$BaseUrl,
    [string]$Path
  )

  $base = $BaseUrl.TrimEnd('/') + '/'
  $relative = $Path.TrimStart('/')
  return ([System.Uri]($base + $relative)).AbsoluteUri
}

function Get-CanonicalPath {
  param(
    [string]$ContentRoot,
    [string]$MarkdownPath,
    [hashtable]$FrontMatter
  )

  $relative = Get-RepoRelativePath -RepoRoot $ContentRoot -PathValue $MarkdownPath
  $relativeNoExtension = [regex]::Replace($relative, '\.md$', '', 'IgnoreCase')
  $parts = @($relativeNoExtension -split '/')
  $slug = Get-FrontMatterValue -Map $FrontMatter -Key 'slug'

  if ($parts.Count -eq 1 -and $parts[0] -eq '_index') {
    return '/'
  }

  if ($parts[-1] -in @('_index', 'index')) {
    $pathParts = @($parts[0..($parts.Count - 2)] | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    return '/' + (($pathParts -join '/').Trim('/')) + '/'
  }

  if (-not [string]::IsNullOrWhiteSpace($slug) -and $parts.Count -ge 2) {
    return '/' + $parts[0] + '/' + $slug.Trim('/') + '/'
  }

  return '/' + $relativeNoExtension.Trim('/') + '/'
}

function Get-ContentSection {
  param(
    [string]$ContentRoot,
    [string]$MarkdownPath
  )

  $relative = Get-RepoRelativePath -RepoRoot $ContentRoot -PathValue $MarkdownPath
  $parts = @($relative -split '/')
  if ($parts.Count -eq 0) {
    return ''
  }

  return $parts[0]
}

function Test-DefaultSocialImage {
  param([string[]]$Images)

  foreach ($image in $Images) {
    if ([string]::IsNullOrWhiteSpace($image)) {
      continue
    }

    if ($image -match '(^|/)images/social/outside-in-print-default\.png$') {
      return $true
    }
  }

  return $false
}

function Get-ImageValues {
  param([hashtable]$FrontMatter)

  $values = New-Object System.Collections.Generic.List[string]
  foreach ($key in @('images', 'image', 'featured_image', 'portrait')) {
    foreach ($value in (Get-FrontMatterValues -Map $FrontMatter -Key $key)) {
      if (-not [string]::IsNullOrWhiteSpace($value)) {
        $values.Add($value)
      }
    }
  }

  return @($values | Select-Object -Unique)
}

function Test-PossibleEncodingDamage {
  param([string]$Text)

  return [regex]::IsMatch($Text, 'â|Ã|Â|�|â€™|â€œ|â€|â€“|â€”|â€¦')
}

if (-not (Test-Path -LiteralPath $ContentDir -PathType Container)) {
  throw "Missing content directory: $ContentDir"
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$markdownFiles = @(
  Get-ChildItem -LiteralPath $ContentDir -Recurse -File -Filter '*.md' |
    Sort-Object FullName
)

$rows = foreach ($file in $markdownFiles) {
  $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
  $parts = Get-FrontMatterParts -Content $content
  $frontMatter = ConvertFrom-FrontMatter -FrontMatter $parts.front_matter
  $title = Normalize-Text -Value (Get-FrontMatterValue -Map $frontMatter -Key 'title')
  $description = Normalize-Text -Value (Get-FrontMatterValue -Map $frontMatter -Key 'description')
  $images = @(Get-ImageValues -FrontMatter $frontMatter)
  $section = Get-ContentSection -ContentRoot $ContentDir -MarkdownPath $file.FullName
  $canonicalPath = Get-CanonicalPath -ContentRoot $ContentDir -MarkdownPath $file.FullName -FrontMatter $frontMatter
  $isArticleLike = $section -in @('essays', 'syd-and-oliver', 'working-papers', 'reports')
  $hasImageAlt = -not [string]::IsNullOrWhiteSpace((Get-FrontMatterValue -Map $frontMatter -Key 'featured_image_alt')) -or
    -not [string]::IsNullOrWhiteSpace((Get-FrontMatterValue -Map $frontMatter -Key 'image_alt')) -or
    -not [string]::IsNullOrWhiteSpace((Get-FrontMatterValue -Map $frontMatter -Key 'portrait_alt'))

  $missingDescription = [string]::IsNullOrWhiteSpace($description)
  $weakDescription = (-not $missingDescription) -and ($description.Length -lt 70 -or $description.Length -gt 170)
  $descriptionEndsWithEllipsis = (-not $missingDescription) -and ($description -match '(\.\.\.|…)\s*$')
  $missingImage = ($images.Count -eq 0)
  $defaultSocialImage = Test-DefaultSocialImage -Images $images
  $possibleEncodingDamage = Test-PossibleEncodingDamage -Text ($parts.front_matter + "`n" + $parts.body)
  $missingImageAlt = $isArticleLike -and (-not $missingImage) -and (-not $hasImageAlt)

  [pscustomobject][ordered]@{
    path = Get-RepoRelativePath -RepoRoot $Root -PathValue $file.FullName
    section = $section
    canonical_url = Join-CanonicalUrl -BaseUrl $CanonicalBaseUrl -Path $canonicalPath
    title = $title
    description = $description
    description_length = $description.Length
    draft = Get-FrontMatterValue -Map $frontMatter -Key 'draft'
    images = ($images -join '; ')
    missing_description = $missingDescription
    weak_description = $weakDescription
    description_ends_with_ellipsis = $descriptionEndsWithEllipsis
    missing_image = $missingImage
    default_social_image = $defaultSocialImage
    missing_image_alt = $missingImageAlt
    possible_encoding_damage = $possibleEncodingDamage
    duplicate_title = $false
    duplicate_description = $false
    needs_review = $false
  }
}

$titleCounts = @{}
$descriptionCounts = @{}
foreach ($row in $rows) {
  $normalizedTitle = ([string]$row.title).ToLowerInvariant()
  $normalizedDescription = ([string]$row.description).ToLowerInvariant()
  if (-not [string]::IsNullOrWhiteSpace($normalizedTitle)) {
    $titleCounts[$normalizedTitle] = 1 + [int]($titleCounts[$normalizedTitle] ?? 0)
  }
  if (-not [string]::IsNullOrWhiteSpace($normalizedDescription)) {
    $descriptionCounts[$normalizedDescription] = 1 + [int]($descriptionCounts[$normalizedDescription] ?? 0)
  }
}

foreach ($row in $rows) {
  $normalizedTitle = ([string]$row.title).ToLowerInvariant()
  $normalizedDescription = ([string]$row.description).ToLowerInvariant()
  $row.duplicate_title = (-not [string]::IsNullOrWhiteSpace($normalizedTitle)) -and [int]($titleCounts[$normalizedTitle] ?? 0) -gt 1
  $row.duplicate_description = (-not [string]::IsNullOrWhiteSpace($normalizedDescription)) -and [int]($descriptionCounts[$normalizedDescription] ?? 0) -gt 1
  $row.needs_review = [bool](
    $row.missing_description -or
    $row.weak_description -or
    $row.description_ends_with_ellipsis -or
    $row.missing_image -or
    $row.default_social_image -or
    $row.missing_image_alt -or
    $row.possible_encoding_damage -or
    $row.duplicate_title -or
    $row.duplicate_description
  )
}

$summary = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  files_scanned = $rows.Count
  missing_description = @($rows | Where-Object { $_.missing_description }).Count
  weak_description = @($rows | Where-Object { $_.weak_description }).Count
  description_ends_with_ellipsis = @($rows | Where-Object { $_.description_ends_with_ellipsis }).Count
  missing_image = @($rows | Where-Object { $_.missing_image }).Count
  default_social_image = @($rows | Where-Object { $_.default_social_image }).Count
  missing_image_alt = @($rows | Where-Object { $_.missing_image_alt }).Count
  possible_encoding_damage = @($rows | Where-Object { $_.possible_encoding_damage }).Count
  duplicate_title = @($rows | Where-Object { $_.duplicate_title }).Count
  duplicate_description = @($rows | Where-Object { $_.duplicate_description }).Count
  needs_review = @($rows | Where-Object { $_.needs_review }).Count
}

$report = [ordered]@{
  summary = $summary
  rows = @($rows)
}

$csvPath = Join-Path $OutputDir 'seo-metadata-audit.csv'
$jsonPath = Join-Path $OutputDir 'seo-metadata-audit.json'
$markdownPath = Join-Path $OutputDir 'seo-metadata-audit.md'

$rows | Export-Csv -Path $csvPath -NoTypeInformation -Encoding utf8
Write-JsonFile -Path $jsonPath -Value $report

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# SEO Metadata Audit')
$lines.Add('')
$lines.Add(('- Generated at: {0}' -f $summary.generated_at))
$lines.Add(('- Files scanned: {0}' -f $summary.files_scanned))
$lines.Add(('- Needs review: {0}' -f $summary.needs_review))
$lines.Add('')
$lines.Add('## Issue Totals')
$lines.Add('')
$lines.Add('| Flag | Count |')
$lines.Add('| --- | ---: |')
foreach ($flag in @('missing_description', 'weak_description', 'description_ends_with_ellipsis', 'missing_image', 'default_social_image', 'missing_image_alt', 'possible_encoding_damage', 'duplicate_title', 'duplicate_description')) {
  $lines.Add(('| {0} | {1} |' -f $flag, $summary[$flag]))
}
$lines.Add('')
$lines.Add('## Highest Priority Rows')
$lines.Add('')
$lines.Add('| Path | Section | Title | Flags |')
$lines.Add('| --- | --- | --- | --- |')
foreach ($row in @($rows | Where-Object { $_.needs_review } | Select-Object -First 40)) {
  $flags = @()
  foreach ($flag in @('missing_description', 'weak_description', 'description_ends_with_ellipsis', 'missing_image', 'default_social_image', 'missing_image_alt', 'possible_encoding_damage', 'duplicate_title', 'duplicate_description')) {
    if ($row.$flag) {
      $flags += $flag
    }
  }
  $lines.Add(('| {0} | {1} | {2} | {3} |' -f $row.path, $row.section, ($row.title -replace '\|', '\|'), ($flags -join ', ')))
}
$lines.Add('')
$lines.Add('This is a read-only audit. Use it to plan tiered metadata cleanup after canonical and indexation signals are stable.')

$lines -join [Environment]::NewLine | Out-File -FilePath $markdownPath -Encoding utf8

Write-Host ("Wrote SEO metadata audit to {0}" -f $OutputDir)
$global:LASTEXITCODE = 0
exit 0
