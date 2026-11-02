#requires -Version 7.0
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'helpers/homepage_reading_authorship.ps1')
$bob = [pscustomobject]@{ '@id' = 'https://outsideinprint.org/#author-robert-v-ussley' }
$guest = [pscustomobject]@{ '@id' = 'https://outsideinprint.org/#author-other-writer' }
foreach ($type in @('Article', 'CreativeWork', 'ShortStory')) {
  $work = [pscustomobject]@{ '@type' = $type; author = $bob }
  if (-not (Test-JsonLdBobReadingWork -Nodes @($work))) { throw "Bob's $type must be eligible" }
  foreach ($author in @($guest, @($bob, $guest), @(), $null)) {
    $work = [pscustomobject]@{ '@type' = $type; author = $author }
    if (Test-JsonLdBobReadingWork -Nodes @($work)) { throw "Invalid $type authors must be excluded" }
  }
}
$missing = [pscustomobject]@{ '@type' = 'ShortStory' }
if (Test-JsonLdBobReadingWork -Nodes @($missing)) { throw 'Missing authors must be excluded' }
$arrayType = [pscustomobject]@{ '@type' = @('ShortStory', 'CreativeWork'); author = $bob }
if (-not (Test-JsonLdBobReadingWork -Nodes @($arrayType))) { throw 'Type arrays must be recognized' }
$page = [pscustomobject]@{ '@type' = 'WebPage'; author = $bob }
if (Test-JsonLdBobReadingWork -Nodes @($page)) { throw 'WebPage is not a reading work' }
Write-Output 'PowerShell homepage reading authorship regression: PASS'
