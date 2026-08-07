#requires -Version 7.0

[CmdletBinding()]
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Unquote-YamlScalar {
  param([AllowNull()][string]$Value)

  if ($null -eq $Value) {
    return $null
  }

  $trimmed = $Value.Trim()
  if ($trimmed.Length -ge 2 -and $trimmed.StartsWith('"') -and $trimmed.EndsWith('"')) {
    return $trimmed.Substring(1, $trimmed.Length - 2).Replace('\"', '"')
  }
  if ($trimmed.Length -ge 2 -and $trimmed.StartsWith("'") -and $trimmed.EndsWith("'")) {
    return $trimmed.Substring(1, $trimmed.Length - 2).Replace("''", "'")
  }
  return $trimmed
}

function Get-FrontMatterValue {
  param(
    [Parameter(Mandatory = $true)][string]$FrontMatter,
    [Parameter(Mandatory = $true)][string]$Key
  )

  $match = [regex]::Match(
    $FrontMatter,
    '(?m)^\s*' + [regex]::Escape($Key) + '\s*:\s*(?<value>.*?)\s*$'
  )
  if (-not $match.Success) {
    return $null
  }
  return Unquote-YamlScalar $match.Groups['value'].Value
}

function Normalize-Text {
  param([AllowNull()][string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ''
  }

  return [regex]::Replace(
    [System.Net.WebUtility]::HtmlDecode($Value),
    '\s+',
    ' '
  ).Trim()
}

function Get-PngDimensions {
  param([Parameter(Mandatory = $true)][string]$Path)

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  Assert-True ($bytes.Length -ge 24) "PNG is too small: $Path"
  $signature = @(137, 80, 78, 71, 13, 10, 26, 10)
  for ($index = 0; $index -lt $signature.Count; $index++) {
    Assert-True ($bytes[$index] -eq $signature[$index]) "Invalid PNG signature: $Path"
  }

  $width = [uint32](
    ([uint32]$bytes[16] -shl 24) -bor
    ([uint32]$bytes[17] -shl 16) -bor
    ([uint32]$bytes[18] -shl 8) -bor
    [uint32]$bytes[19]
  )
  $height = [uint32](
    ([uint32]$bytes[20] -shl 24) -bor
    ([uint32]$bytes[21] -shl 16) -bor
    ([uint32]$bytes[22] -shl 8) -bor
    [uint32]$bytes[23]
  )

  return [pscustomobject]@{
    Width = [int]$width
    Height = [int]$height
  }
}

$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
$affirmationRoot = Join-Path $resolvedRoot 'content\essays\affirmations'
$bankPath = Join-Path $resolvedRoot 'editorial\affirmations-bank.md'
$galleryDataPath = Join-Path $resolvedRoot 'data\editorial_cartoons.yaml'
$contractPath = Join-Path $resolvedRoot 'editorial\the-things-we-say-publication-contract.md'

Assert-True (Test-Path -LiteralPath $affirmationRoot -PathType Container) 'Missing content/essays/affirmations.'
Assert-True (Test-Path -LiteralPath $bankPath -PathType Leaf) 'Missing editorial/affirmations-bank.md.'
Assert-True (Test-Path -LiteralPath $galleryDataPath -PathType Leaf) 'Missing data/editorial_cartoons.yaml.'
Assert-True (Test-Path -LiteralPath $contractPath -PathType Leaf) 'Missing The Things We Say publication contract.'
Assert-True (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot 'content\collections\what-you-tell-yourself.md'))) 'Retired collection source still exists.'
Assert-True (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot 'editorial\what-you-tell-yourself-series-contract.md'))) 'Retired series contract still exists.'

$bankText = [System.IO.File]::ReadAllText($bankPath)
$affirmationsHeading = [regex]::Match($bankText, '(?m)^## Affirmations\s*$')
Assert-True $affirmationsHeading.Success 'Affirmations Bank is missing its Affirmations section.'
$bankSection = $bankText.Substring($affirmationsHeading.Index + $affirmationsHeading.Length)
$nextBankHeading = [regex]::Match($bankSection, '(?m)^##\s+')
if ($nextBankHeading.Success) {
  $bankSection = $bankSection.Substring(0, $nextBankHeading.Index)
}
$bankAffirmations = [System.Collections.Generic.List[string]]::new()
$bankAffirmationSet = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::Ordinal
)
$bankLines = @([regex]::Split($bankSection, '\r?\n'))
foreach ($line in $bankLines) {
  if ([string]::IsNullOrEmpty($line)) {
    continue
  }

  Assert-True ($line.StartsWith('- ', [System.StringComparison]::Ordinal)) "Affirmations Bank contains a malformed one-line entry: $line"
  $affirmation = $line.Substring(2)
  Assert-True (-not [string]::IsNullOrWhiteSpace($affirmation)) 'Affirmations Bank contains an empty affirmation bullet.'
  Assert-True ($affirmation -ceq $affirmation.Trim()) "Affirmations Bank contains leading or trailing whitespace: $affirmation"
  Assert-True ($bankAffirmationSet.Add($affirmation)) "Affirmations Bank contains an exact duplicate: $affirmation"
  $bankAffirmations.Add($affirmation) | Out-Null
}
Assert-True ($bankAffirmations.Count -gt 0) 'Affirmations Bank contains no affirmation bullets.'

$normalizedBankAffirmations = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::Ordinal
)
foreach ($affirmation in $bankAffirmations) {
  $normalizedBankAffirmations.Add((Normalize-Text $affirmation)) | Out-Null
}

$galleryData = [System.IO.File]::ReadAllText($galleryDataPath)
$articles = @(Get-ChildItem -LiteralPath $affirmationRoot -File -Filter '*.md' -Recurse)
Assert-True ($articles.Count -gt 0) 'The Things We Say has no Affirmation entries.'

foreach ($article in $articles) {
  $content = [System.IO.File]::ReadAllText($article.FullName)
  $documentMatch = [regex]::Match(
    $content,
    '(?s)\A---\r?\n(?<frontmatter>.*?)\r?\n---\r?\n(?<body>.*)\z'
  )
  Assert-True $documentMatch.Success "Invalid front matter delimiters: $($article.FullName)"

  $frontMatter = $documentMatch.Groups['frontmatter'].Value
  $body = $documentMatch.Groups['body'].Value
  $slug = Get-FrontMatterValue -FrontMatter $frontMatter -Key 'slug'
  Assert-True (-not [string]::IsNullOrWhiteSpace($slug)) "Missing slug: $($article.FullName)"

  $expected = [ordered]@{
    section_label = 'Affirmation'
    library_type = 'affirmation'
    collections = '["the-things-we-say"]'
    source_mode = 'SOURCE_FREE'
    external_factual_claims = 'none'
  }
  foreach ($key in $expected.Keys) {
    $actual = Get-FrontMatterValue -FrontMatter $frontMatter -Key $key
    Assert-True ($actual -ceq $expected[$key]) "$slug has invalid $key. Expected '$($expected[$key])'; found '$actual'."
  }

  $pullQuotes = @(
    [regex]::Matches(
      $body,
      '(?is)<figure\b[^>]*class\s*=\s*["''][^"'']*\bfranklin-pullquote\b[^"'']*["''][^>]*>(?<inner>.*?)</figure>'
    )
  )
  Assert-True ($pullQuotes.Count -ge 1 -and $pullQuotes.Count -le 2) "$slug must contain one or two pull quotes."

  $bankMatchFound = $false
  foreach ($pullQuote in $pullQuotes) {
    $blockquote = [regex]::Match(
      $pullQuote.Groups['inner'].Value,
      '(?is)<blockquote\b[^>]*>\s*(?<value>.+?)\s*</blockquote>'
    )
    Assert-True $blockquote.Success "$slug contains a pull quote without one blockquote."
    if ($normalizedBankAffirmations.Contains((Normalize-Text $blockquote.Groups['value'].Value))) {
      $bankMatchFound = $true
    }
  }
  Assert-True $bankMatchFound "$slug has no pull quote matching the Affirmations Bank."

  $featuredImage = Get-FrontMatterValue -FrontMatter $frontMatter -Key 'featured_image'
  $featuredAlt = Get-FrontMatterValue -FrontMatter $frontMatter -Key 'featured_image_alt'
  Assert-True ($featuredImage -ceq "/images/essays/$slug/hero.png") "$slug must use its shared hero path."
  Assert-True (-not [string]::IsNullOrWhiteSpace($featuredAlt)) "$slug is missing featured_image_alt."

  $heroPath = Join-Path $resolvedRoot ('static\' + ($featuredImage.TrimStart('/') -replace '/', '\'))
  Assert-True (Test-Path -LiteralPath $heroPath -PathType Leaf) "$slug hero is missing: $heroPath"
  $dimensions = Get-PngDimensions -Path $heroPath
  Assert-True ($dimensions.Width -ge 1200 -and $dimensions.Height -ge 675) "$slug hero must be at least 1200x675."
  $ratio = $dimensions.Width / [double]$dimensions.Height
  Assert-True ([math]::Abs($ratio - (16.0 / 9.0)) -le 0.03) "$slug hero must use a 16:9 frame."

  $route = "/essays/$slug/"
  $entryMatches = @(
    [regex]::Matches(
      $galleryData,
      '(?ms)^\s{2}-\s+slug:\s*(?<gallerySlug>[a-z0-9-]+)\s*$' +
      '(?<entry>.*?)(?=^\s{2}-\s+slug:|\z)'
    ) |
      Where-Object {
        $_.Groups['entry'].Value -match (
          '(?m)^\s+essay:\s*"' + [regex]::Escape($route) + '"\s*$'
        )
      }
  )
  Assert-True ($entryMatches.Count -eq 1) "$slug must have exactly one linked Gallery entry."

  $imageMatch = [regex]::Match(
    $entryMatches[0].Groups['entry'].Value,
    '(?m)^\s+image:\s*"(?<value>/images/editorial/[a-z0-9-]+\.png)"\s*$'
  )
  Assert-True $imageMatch.Success "$slug Gallery entry is missing its image."
  $galleryImagePath = Join-Path $resolvedRoot ('static\' + ($imageMatch.Groups['value'].Value.TrimStart('/') -replace '/', '\'))
  Assert-True (Test-Path -LiteralPath $galleryImagePath -PathType Leaf) "$slug Gallery image is missing."

  $heroHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $heroPath).Hash
  $galleryHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $galleryImagePath).Hash
  Assert-True ($heroHash -eq $galleryHash) "$slug hero and Gallery image are not byte-identical."
}

Write-Host "Affirmation publication contract: PASS ($($articles.Count) entry/entries)." -ForegroundColor Green
