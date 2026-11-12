#requires -Version 7.0
param([string]$FixtureRoot = '', [string]$HugoPath = '')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $HugoPath) { $HugoPath = Join-Path $root 'tools/bin/generated/hugo.cmd' }
if (-not $FixtureRoot) { $FixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-timeline-' + [guid]::NewGuid().ToString('N')) }
if (Test-Path -LiteralPath $FixtureRoot) { throw 'Fixture root must be new.' }
$single = [IO.File]::ReadAllText((Join-Path $root 'layouts/_default/single.html'))
$branch = [regex]::Match($single, '(?s)\{\{ if and \.Params.timeline_sidebar \.Params.timeline_sidebar.start_heading \}\}.*?(?=\s*<div class="piece-aftermatter">)')
if (-not $branch.Success) { throw 'Production timeline branch was not found.' }
$cases = @(
  @{ Name='bounded'; Start='history'; End='conclusion'; Expected='' },
  @{ Name='legacy'; Start=''; End=''; Expected='' },
  @{ Name='missing'; Start='not-a-heading'; End='conclusion'; Expected='distinct, unique H2 IDs' },
  @{ Name='reversed'; Start='conclusion'; End='history'; Expected='end_heading after start_heading' }
)
foreach ($case in $cases) {
  $site = Join-Path $FixtureRoot $case.Name
  foreach ($dir in @('content','layouts/_default','layouts/partials/article','assets/js')) { [void][IO.Directory]::CreateDirectory((Join-Path $site $dir)) }
  Copy-Item -LiteralPath (Join-Path $root 'assets/js/timeline-scale.js') -Destination (Join-Path $site 'assets/js/timeline-scale.js')
  foreach ($partial in @('bounded-timeline.html','timeline-sidebar.html')) {
    Copy-Item -LiteralPath (Join-Path $root "layouts/partials/article/$partial") -Destination (Join-Path $site "layouts/partials/article/$partial")
  }
  [IO.File]::WriteAllText((Join-Path $site 'hugo.json'), '{"baseURL":"https://fixture.invalid/","disableKinds":["taxonomy","term","RSS","sitemap"],"outputs":{"home":["HTML"]}}')
  [IO.File]::WriteAllText((Join-Path $site 'layouts/index.html'), '<p>Timeline fixture</p>')
  [IO.File]::WriteAllText((Join-Path $site 'layouts/_default/single.html'), '{{ $articleBody := .Content }}' + $branch.Value)
  $bounds = if ($case.Start) { "  start_heading: $($case.Start)`n  end_heading: $($case.End)`n" } else { '' }
  $content = @"
---
title: Timeline fixture
timeline_sidebar:
  title: Timeline
${bounds}  entries:
    - date: "[1949](https://example.test/record)"
      text: "Contract signed."
---
*INTRODUCTION TOKEN*

---

## History

HISTORY TOKEN

## Conclusion

CONCLUSION TOKEN
"@
  [IO.File]::WriteAllText((Join-Path $site 'content/piece.md'), $content)
  $output = & $HugoPath --source $site --config hugo.json 2>&1
  $code = $LASTEXITCODE
  if ($case.Expected) {
    if ($code -eq 0 -or ($output -join "`n") -notmatch [regex]::Escape($case.Expected)) { throw "Invalid-boundary case $($case.Name) did not fail with its expected diagnostic." }
    continue
  }
  if ($code -ne 0) { throw ($output -join "`n") }
  $html = [IO.File]::ReadAllText((Join-Path $site 'public/piece/index.html'))
  foreach ($token in @('INTRODUCTION TOKEN','HISTORY TOKEN','CONCLUSION TOKEN','Contract signed.')) {
    if ([regex]::Matches($html,[regex]::Escape($token)).Count -ne 1) { throw "Case $($case.Name) lost or duplicated $token" }
  }
  if ($html -notmatch 'href="https://example.test/record"') { throw 'Timeline source link was lost.' }
  if ($case.Name -eq 'bounded') {
    if ($html -notmatch '(?s)piece-timeline-introduction.*?INTRODUCTION TOKEN.*?piece-reading-layout--bounded.*?HISTORY TOKEN.*?piece-timeline-title.*?piece-timeline-conclusion.*?CONCLUSION TOKEN') { throw 'Bounded reading order changed.' }
  } elseif ($html -match 'piece-timeline-introduction|piece-timeline-conclusion|piece-reading-layout--bounded') { throw 'Legacy timeline acquired bounded layout.' }
}
Write-Host 'Bounded timeline contract PASSED: exact content/link preservation, reading order, legacy default, missing/reversed boundary rejection.'
