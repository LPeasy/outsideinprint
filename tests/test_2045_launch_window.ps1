#requires -Version 7.0
[CmdletBinding()]
param(
  [string]$HugoPath = 'hugo'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$hugoCommand = Get-Command $HugoPath -ErrorAction Stop
$resolvedHugoPath = [string]$hugoCommand.Source
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("oip-2045-launch-window-{0}" -f [Guid]::NewGuid().ToString('N'))
$cases = @(
  @{ Name = 'before-expiry'; Clock = '2026-09-26T23:59:59-04:00'; ExpectPromotion = $true },
  @{ Name = 'at-expiry'; Clock = '2026-09-27T00:00:00-04:00'; ExpectPromotion = $false }
)

New-Item -ItemType Directory -Path $tempRoot | Out-Null
Push-Location $repoRoot
try {
  foreach ($case in $cases) {
    $destination = Join-Path $tempRoot $case.Name
    & $resolvedHugoPath `
      --clock $case.Clock `
      --environment production `
      --minify `
      --panicOnWarning `
      --quiet `
      --destination $destination
    if ($LASTEXITCODE -ne 0) {
      throw "Hugo failed while testing the 2045 launch window at $($case.Clock)."
    }

    $homePath = Join-Path $destination 'index.html'
    if (-not (Test-Path -LiteralPath $homePath -PathType Leaf)) {
      throw "Hugo did not render the homepage for the 2045 launch-window case '$($case.Name)'."
    }
    $homeHtml = Get-Content -LiteralPath $homePath -Raw -Encoding utf8
    $promotionCount = [regex]::Matches($homeHtml, '\bdata-home-2045-launch(?:[=\s>])', 'IgnoreCase').Count
    $expectedCount = if ($case.ExpectPromotion) { 1 } else { 0 }
    if ($promotionCount -ne $expectedCount) {
      throw "The 2045 launch strip count at $($case.Clock) was $promotionCount; expected $expectedCount."
    }

    if ($case.ExpectPromotion) {
      $strip = [regex]::Match($homeHtml, '(?is)<section\b[^>]*\bdata-home-2045-launch(?:=|\s|>).*?</section>').Value
      $sampleIndex = $strip.IndexOf('Read a complete story', [StringComparison]::Ordinal)
      $buyIndex = $strip.IndexOf('Buy EPUB — $19.99', [StringComparison]::Ordinal)
      if ($sampleIndex -lt 0 -or $buyIndex -le $sampleIndex -or $strip -notmatch 'DRM-free EPUB\s*(?:·|&middot;|&#183;)\s*U\.S\. customers only\.') {
        throw 'The pre-expiry launch strip lost its sample-first CTA order or U.S. EPUB restriction.'
      }
      if ($strip -match '<form\b|https://(?:square\.link|checkout\.square\.site|downloads\.outsideinprint\.org)') {
        throw 'The pre-expiry launch strip exposed a provider or direct checkout.'
      }
    }
  }
}
finally {
  Pop-Location
  if (Test-Path -LiteralPath $tempRoot -PathType Container) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

Write-Host '2045 launch-window boundary contract passed.'
