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

  $repoRootFull = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RepoRoot).Path)
  $pathFull = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path)
  $getRelativePath = [System.IO.Path].GetMethod('GetRelativePath', [Type[]]@([string], [string]))

  if ($null -ne $getRelativePath) {
    return ([System.IO.Path]::GetRelativePath($repoRootFull, $pathFull) -replace '\\', '/')
  }

  $repoRootUri = [System.Uri]($repoRootFull.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar)
  $pathUri = [System.Uri]$pathFull
  return ([System.Uri]::UnescapeDataString($repoRootUri.MakeRelativeUri($pathUri).ToString()) -replace '\\', '/')
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

function Get-OpenTags {
  param(
    [string]$Html,
    [string]$TagName
  )

  return @([regex]::Matches($Html, '<' + [regex]::Escape($TagName) + '\b[^>]*>', 'IgnoreCase') | ForEach-Object { $_.Value })
}

function Test-TagHasClass {
  param(
    [string]$Tag,
    [string]$ClassName
  )

  $classValue = Get-AttributeValue -Tag $Tag -Name 'class'
  if ([string]::IsNullOrWhiteSpace($classValue)) {
    return $false
  }

  $classes = @($classValue -split '\s+' | Where-Object { $_ })
  return $classes -contains $ClassName
}

function Get-HeadingLevels {
  param([string]$Html)

  return @([regex]::Matches($Html, '<h([1-6])\b', 'IgnoreCase') | ForEach-Object { [int]$_.Groups[1].Value })
}

function Get-SemanticPageIssues {
  param(
    [string]$RelativePath,
    [string]$Html,
    [string]$ExpectedH1Class,
    [bool]$RequireSecondaryHeading
  )

  $issues = New-Object System.Collections.Generic.List[string]
  $headingLevels = @(Get-HeadingLevels -Html $Html)
  $h1Tags = @(Get-OpenTags -Html $Html -TagName 'h1')
  $mainTags = @(Get-OpenTags -Html $Html -TagName 'main')
  $headerTags = @(Get-OpenTags -Html $Html -TagName 'header')
  $navTags = @(Get-OpenTags -Html $Html -TagName 'nav')

  if ($mainTags.Count -ne 1) {
    $issues.Add("$RelativePath => expected exactly one <main>, found $($mainTags.Count)")
  }
  elseif ((Get-AttributeValue -Tag $mainTags[0] -Name 'id') -ne 'main-content') {
    $issues.Add("$RelativePath => expected <main id=""main-content"">")
  }

  $siteHeaderCount = @($headerTags | Where-Object { Test-TagHasClass -Tag $_ -ClassName 'site-header' }).Count
  if ($siteHeaderCount -ne 1) {
    $issues.Add("$RelativePath => expected exactly one site header, found $siteHeaderCount")
  }

  $primaryNavCount = @($navTags | Where-Object { (Get-AttributeValue -Tag $_ -Name 'aria-label') -eq 'Primary' }).Count
  if ($primaryNavCount -ne 1) {
    $issues.Add("$RelativePath => expected exactly one primary navigation landmark, found $primaryNavCount")
  }

  if ($h1Tags.Count -ne 1) {
    $issues.Add("$RelativePath => expected exactly one <h1>, found $($h1Tags.Count)")
  }
  elseif (-not (Test-TagHasClass -Tag $h1Tags[0] -ClassName $ExpectedH1Class)) {
    $issues.Add("$RelativePath => expected the page-level h1 to carry class '$ExpectedH1Class'")
  }

  if ($headingLevels.Count -eq 0) {
    $issues.Add("$RelativePath => expected at least one heading")
  }
  elseif ($headingLevels[0] -ne 1) {
    $issues.Add("$RelativePath => expected the first heading level to be h1, found h$($headingLevels[0])")
  }

  if ($RequireSecondaryHeading) {
    $h2Count = @($headingLevels | Where-Object { $_ -eq 2 }).Count
    if ($h2Count -eq 0) {
      $issues.Add("$RelativePath => expected at least one h2 after the page-level h1")
    }
  }

  return $issues
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
$semanticIssues = New-Object System.Collections.Generic.List[string]
$hasHomepageAnalytics = $false
$hasLibraryPdfAnalytics = $false
$localizedMediumImageCount = 0
$targetPageHtml = @{}

$requiredSemanticPages = [ordered]@{
  'public/index.html' = @{ ExpectedH1Class = 'title'; RequireSecondaryHeading = $true }
  'public/essays/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $false }
  'public/library/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
  'public/collections/index.html' = @{ ExpectedH1Class = 'list-title'; RequireSecondaryHeading = $true }
}

$optionalDefaultListPages = @(
  'public/literature/index.html',
  'public/syd-and-oliver/index.html',
  'public/working-papers/index.html'
)

foreach ($file in $htmlFiles) {
  $content = Get-Content -Path $file.FullName -Raw
  $relativePath = Get-RepoRelativePath -RepoRoot $repoRoot -Path $file.FullName

  if ($requiredSemanticPages.Contains($relativePath) -or ($optionalDefaultListPages -contains $relativePath)) {
    $targetPageHtml[$relativePath] = $content
  }

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
    $relativePath.EndsWith('public/index.html', [System.StringComparison]::OrdinalIgnoreCase) -and
    $content -match 'data-analytics-event=(?:"internal_promo_click"|internal_promo_click)' -and
    $content -match 'data-analytics-source-slot=(?:"random_link"|random_link)'
  ) {
    $hasHomepageAnalytics = $true
  }

  if ($relativePath.EndsWith('public/library/index.html', [System.StringComparison]::OrdinalIgnoreCase) -and $content -match 'data-analytics-format=(?:"pdf"|pdf)') {
    $hasLibraryPdfAnalytics = $true
  }
}

foreach ($relativePath in $requiredSemanticPages.Keys) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    $semanticIssues.Add("Missing generated page required for semantic regression coverage: $relativePath")
    continue
  }

  $issues = Get-SemanticPageIssues `
    -RelativePath $relativePath `
    -Html $targetPageHtml[$relativePath] `
    -ExpectedH1Class ([string]$requiredSemanticPages[$relativePath].ExpectedH1Class) `
    -RequireSecondaryHeading ([bool]$requiredSemanticPages[$relativePath].RequireSecondaryHeading)

  foreach ($issue in $issues) {
    $semanticIssues.Add($issue)
  }
}

foreach ($relativePath in $optionalDefaultListPages) {
  if (-not $targetPageHtml.ContainsKey($relativePath)) {
    continue
  }

  $issues = Get-SemanticPageIssues `
    -RelativePath $relativePath `
    -Html $targetPageHtml[$relativePath] `
    -ExpectedH1Class 'list-title' `
    -RequireSecondaryHeading $false

  foreach ($issue in $issues) {
    $semanticIssues.Add($issue)
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

if ($semanticIssues.Count -gt 0) {
  throw ("Found semantic accessibility regressions in generated HTML. Samples: {0}" -f (Format-SampleList -Items $semanticIssues))
}

Write-Host "Public HTML output regression test passed."
$global:LASTEXITCODE = 0
exit 0
