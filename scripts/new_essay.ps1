param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Show-Usage {
  @'
Usage:
  .\tools\bin\custom\new-essay.cmd --title "Essay Title" [--slug "essay-slug"] [--date YYYY-MM-DD] [--subtitle "..."] [--description "..."]

Options:
  --title         Required. Essay title.
  --slug          Optional. Defaults to a slug derived from the title.
  --date          Optional. Defaults to today's date in YYYY-MM-DD format.
  --subtitle      Optional. Defaults to an empty string.
  --description   Optional. Defaults to an empty string.
  --root          Optional. Alternate repo root, intended for tests.
  --help          Show this help text.
'@ | Write-Host
}

function Get-OptionValue {
  param(
    [string[]]$Arguments,
    [ref]$Index,
    [string]$Token,
    [string]$OptionName
  )

  if ($Token -match '^[^=]+=(.*)$') {
    return $matches[1]
  }

  $Index.Value++
  if ($Index.Value -ge $Arguments.Count) {
    throw "Missing value for $OptionName."
  }

  return $Arguments[$Index.Value]
}

function Parse-Options {
  param([string[]]$Arguments)

  $options = [ordered]@{
    Title = ''
    Slug = ''
    Date = ''
    Subtitle = ''
    Description = ''
    Root = ''
    Help = $false
  }

  for ($i = 0; $i -lt $Arguments.Count; $i++) {
    $token = [string]$Arguments[$i]
    switch -Regex ($token) {
      '^--?help$' {
        $options.Help = $true
        continue
      }
      '^--?title(?:=.*)?$' {
        $options.Title = Get-OptionValue -Arguments $Arguments -Index ([ref]$i) -Token $token -OptionName '--title'
        continue
      }
      '^--?slug(?:=.*)?$' {
        $options.Slug = Get-OptionValue -Arguments $Arguments -Index ([ref]$i) -Token $token -OptionName '--slug'
        continue
      }
      '^--?date(?:=.*)?$' {
        $options.Date = Get-OptionValue -Arguments $Arguments -Index ([ref]$i) -Token $token -OptionName '--date'
        continue
      }
      '^--?subtitle(?:=.*)?$' {
        $options.Subtitle = Get-OptionValue -Arguments $Arguments -Index ([ref]$i) -Token $token -OptionName '--subtitle'
        continue
      }
      '^--?description(?:=.*)?$' {
        $options.Description = Get-OptionValue -Arguments $Arguments -Index ([ref]$i) -Token $token -OptionName '--description'
        continue
      }
      '^--?root(?:=.*)?$' {
        $options.Root = Get-OptionValue -Arguments $Arguments -Index ([ref]$i) -Token $token -OptionName '--root'
        continue
      }
      default {
        throw "Unknown argument: $token"
      }
    }
  }

  return [pscustomobject]$options
}

function Resolve-RepoRoot {
  param([string]$OverrideRoot)

  if (-not [string]::IsNullOrWhiteSpace($OverrideRoot)) {
    if (-not (Test-Path -LiteralPath $OverrideRoot -PathType Container)) {
      throw "Root path not found: $OverrideRoot"
    }

    return [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $OverrideRoot).Path)
  }

  return [System.IO.Path]::GetFullPath((Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
}

function Convert-ToSlug {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ''
  }

  $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
  $builder = New-Object System.Text.StringBuilder
  foreach ($character in $normalized.ToCharArray()) {
    $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($character)
    if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($character)
    }
  }

  $slug = $builder.ToString().Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant()
  $slug = $slug -replace '&', ' and '
  $slug = $slug -replace '[^a-z0-9]+', '-'
  $slug = $slug -replace '^-+|-+$', ''
  $slug = $slug -replace '-{2,}', '-'
  return $slug
}

function Get-IsoDate {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return (Get-Date).ToString('yyyy-MM-dd')
  }

  $culture = [Globalization.CultureInfo]::InvariantCulture
  try {
    $parsed = [DateTime]::ParseExact($Value, 'yyyy-MM-dd', $culture)
  }
  catch {
    throw "Date must use YYYY-MM-DD format."
  }

  return $parsed.ToString('yyyy-MM-dd')
}

function Convert-ToYamlString {
  param([string]$Value)

  if ($null -eq $Value) {
    return "''"
  }

  return "'" + ($Value -replace "'", "''") + "'"
}

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

try {
  $options = Parse-Options -Arguments $CliArgs
  if ($options.Help) {
    Show-Usage
    exit 0
  }

  if ([string]::IsNullOrWhiteSpace($options.Title)) {
    throw 'A non-empty --title value is required.'
  }

  $repoRoot = Resolve-RepoRoot -OverrideRoot $options.Root
  $slug = if ([string]::IsNullOrWhiteSpace($options.Slug)) { Convert-ToSlug $options.Title } else { Convert-ToSlug $options.Slug }
  if ([string]::IsNullOrWhiteSpace($slug)) {
    throw 'Unable to derive a valid slug. Provide --slug with letters or numbers.'
  }

  $dateValue = Get-IsoDate -Value $options.Date
  $essayPath = Join-Path $repoRoot ("content\essays\{0}.md" -f $slug)
  if (Test-Path -LiteralPath $essayPath) {
    throw "Essay already exists: $essayPath"
  }

  $body = @(
    '---'
    ('title: {0}' -f (Convert-ToYamlString $options.Title))
    ('date: {0}' -f $dateValue)
    'draft: true'
    ('slug: {0}' -f (Convert-ToYamlString $slug))
    "section_label: 'Essay'"
    ('subtitle: {0}' -f (Convert-ToYamlString $options.Subtitle))
    ('description: {0}' -f (Convert-ToYamlString $options.Description))
    "featured_image: ''"
    "featured_image_alt: ''"
    "featured_image_caption: ''"
    "version: '1.0'"
    "edition: 'First web edition'"
    'featured: false'
    ''
    'collections: []'
    'topics: []'
    'series: []'
    '---'
    ''
    '## Lead'
    ''
    'Write 1-2 opening paragraphs that state the central claim early.'
    ''
    '## Main Argument'
    ''
    'Develop the core idea here.'
    ''
    '## Evidence'
    ''
    'If you include a lead image, set featured_image, featured_image_alt, and featured_image_caption in front matter.'
    'Do not repeat that same image as the first body image.'
    ''
    '## Why It Matters'
    ''
    'Close with the implication, takeaway, or unresolved question.'
    ''
  ) -join [Environment]::NewLine

  Write-TextNoBom -Path $essayPath -Content $body

  Write-Host ("Created essay draft: {0}" -f $essayPath) -ForegroundColor Green
  Write-Host ("Next: .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\{0}.md" -f $slug)
  Write-Host 'Then build with: .\tools\bin\generated\hugo.cmd --gc --minify'
}
catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
