param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "public"),
  [string]$ExpectedHomePath = "/outsideinprint/"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRelativePath {
  param(
    [string]$RepoRoot,
    [string]$Path
  )

  $repoUri = [System.Uri]((Resolve-Path $RepoRoot).Path + [System.IO.Path]::DirectorySeparatorChar)
  $pathUri = [System.Uri](Resolve-Path $Path).Path
  return [System.Uri]::UnescapeDataString($repoUri.MakeRelativeUri($pathUri).ToString()).Replace('/', '\')
}

function Format-SampleList {
  param(
    [object[]]$Items,
    [int]$Limit = 5
  )

  if (-not $Items -or $Items.Count -eq 0) {
    return ""
  }

  return (($Items | Select-Object -First $Limit) -join "; ")
}

function Get-AttributeValue {
  param(
    [string]$Tag,
    [string]$Name
  )

  $pattern = '\b' + [regex]::Escape($Name) + '\s*=\s*(?:"([^"]*)"|''([^'']*)''|([^\s>]+))'
  $match = [regex]::Match($Tag, $pattern, 'IgnoreCase')
  if (-not $match.Success) {
    return $null
  }

  foreach ($index in 1..3) {
    if ($match.Groups[$index].Success) {
      return $match.Groups[$index].Value
    }
  }

  return $null
}

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path $SiteDir -PathType Container)) {
  throw "Site output directory not found: $SiteDir"
}

$htmlFiles = @(Get-ChildItem -Path $SiteDir -Recurse -File -Filter "*.html")
if ($htmlFiles.Count -eq 0) {
  throw "No HTML files found under $SiteDir"
}

$runningHeaderMatches = 0
$runningHeaderIssues = New-Object System.Collections.Generic.List[string]
$rootRelativeImageIssues = New-Object System.Collections.Generic.List[string]
$zgotmplzIssues = New-Object System.Collections.Generic.List[string]
$hasHomepageAnalytics = $false
$hasLibraryPdfAnalytics = $false
$localizedMediumImageCount = 0

foreach ($file in $htmlFiles) {
  $content = Get-Content -Path $file.FullName -Raw
  $relativePath = Get-RepoRelativePath -RepoRoot $repoRoot -Path $file.FullName

  foreach ($match in [regex]::Matches($content, '<a\b[^>]*>', 'IgnoreCase')) {
    $tag = $match.Value
    $classValue = Get-AttributeValue -Tag $tag -Name 'class'
    if ([string]::IsNullOrWhiteSpace($classValue)) {
      continue
    }

    $classes = @($classValue -split '\s+' | Where-Object { $_ })
    if ($classes -notcontains 'running-header__home') {
      continue
    }

    $runningHeaderMatches++
    $href = Get-AttributeValue -Tag $tag -Name 'href'
    if ($href -ne $ExpectedHomePath) {
      $runningHeaderIssues.Add("$relativePath => $href")
    }
  }

  foreach ($match in [regex]::Matches($content, '<img\b[^>]*>', 'IgnoreCase')) {
    $tag = $match.Value
    $src = Get-AttributeValue -Tag $tag -Name 'src'
    if ([string]::IsNullOrWhiteSpace($src)) {
      continue
    }

    if ($src.StartsWith('/images/', [System.StringComparison]::OrdinalIgnoreCase)) {
      $rootRelativeImageIssues.Add("$relativePath => $src")
    }

    if ($src.StartsWith('/outsideinprint/images/medium/', [System.StringComparison]::OrdinalIgnoreCase)) {
      $localizedMediumImageCount++
    }
  }

  if ($content.IndexOf('ZgotmplZ', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
    $zgotmplzIssues.Add($relativePath)
  }

  if (
    $relativePath.EndsWith('public\index.html', [System.StringComparison]::OrdinalIgnoreCase) -and
    $content -match 'data-analytics-event=(?:"internal_promo_click"|internal_promo_click)' -and
    $content -match 'data-analytics-source-slot=(?:"random_link"|random_link)'
  ) {
    $hasHomepageAnalytics = $true
  }

  if ($relativePath.EndsWith('public\library\index.html', [System.StringComparison]::OrdinalIgnoreCase) -and $content -match 'data-analytics-format=(?:"pdf"|pdf)') {
    $hasLibraryPdfAnalytics = $true
  }
}

if ($runningHeaderMatches -eq 0) {
  throw "Did not find any running-header home links in generated HTML."
}

if ($runningHeaderIssues.Count -gt 0) {
  throw ("Found running-header home links outside the expected base path '{0}'. Samples: {1}" -f $ExpectedHomePath, (Format-SampleList -Items $runningHeaderIssues))
}

if ($rootRelativeImageIssues.Count -gt 0) {
  throw ('Found root-relative <img src="/images/..."> paths in generated HTML. Samples: {0}' -f (Format-SampleList -Items $rootRelativeImageIssues))
}

if ($localizedMediumImageCount -eq 0) {
  throw "Did not find any base-path-safe localized /outsideinprint/images/medium/ image URLs in generated HTML."
}

if ($zgotmplzIssues.Count -gt 0) {
  throw ("Found ZgotmplZ in generated HTML. Samples: {0}" -f (Format-SampleList -Items $zgotmplzIssues))
}

if (-not $hasHomepageAnalytics) {
  throw "Homepage random-card analytics attributes were not emitted as expected in public/index.html."
}

if (-not $hasLibraryPdfAnalytics) {
  throw "Library PDF analytics attributes were not emitted as expected in public/library/index.html."
}

Write-Host "Public HTML output regression test passed."
$global:LASTEXITCODE = 0
exit 0
