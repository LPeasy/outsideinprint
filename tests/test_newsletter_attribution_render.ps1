param(
  [string]$FixtureRoot = '',
  [string]$HugoPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $HugoPath) {
  if ($IsWindows) { $HugoPath = Join-Path $repoRoot 'tools/bin/generated/hugo.cmd' }
  else { $HugoPath = (Get-Command hugo -ErrorAction Stop).Source }
}
if (-not $FixtureRoot) {
  $FixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-newsletter-attribution-' + [guid]::NewGuid().ToString('N'))
}
if (Test-Path -LiteralPath $FixtureRoot) { throw "Fixture path must be new: $FixtureRoot" }

function Write-Fixture([string]$RelativePath, [string]$Text) {
  $path = Join-Path $FixtureRoot $RelativePath
  [IO.Directory]::CreateDirectory((Split-Path -Parent $path)) | Out-Null
  [IO.File]::WriteAllText($path, $Text, [Text.UTF8Encoding]::new($false))
}
function Assert-Contract([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

foreach ($relativePath in @(
  'layouts/partials/newsletter_signup.html',
  'layouts/partials/home_reader_newsletter.html',
  'layouts/partials/newsletter_attribution_fields.html',
  'layouts/partials/newsletter_attribution_script.html',
  'layouts/partials/analytics.html',
  'assets/js/newsletter-attribution.js',
  'assets/js/analytics.js',
  'assets/js/vendor/goatcounter.v5.js'
)) { Write-Fixture $relativePath ([IO.File]::ReadAllText((Join-Path $repoRoot $relativePath))) }

Write-Fixture 'layouts/partials/almanack/latest-issue-url.html' '{{ return "/collections/bobs-almanack/" }}'
Write-Fixture 'layouts/partials/collections/lookup-definition.html' '{{ return false }}'
Write-Fixture 'layouts/partials/collections/resolve-items.html' '{{ return slice }}'
Write-Fixture 'layouts/index.html' @'
<!doctype html><html><body>
{{ partial "home_reader_newsletter.html" . }}
{{ partial "newsletter_signup.html" (dict "page" . "sourceSlot" "fixture_signup") }}
{{ partial "analytics.html" . }}
{{ partial "newsletter_attribution_script.html" . }}
</body></html>
'@
Write-Fixture 'data/newsletter_campaigns.json' @'
{"campaigns":[{"code":"fixture-post","utm_campaign":"fixture-post","utm_source":"facebook","utm_medium":"organic_social","utm_content":""},{"code":"legacy-post","legacy":true,"utm_campaign":"almanack-organic","utm_source":"facebook","utm_medium":"organic_social","utm_content":"weekend-01"}]}
'@
$common = @'
baseURL = "https://outsideinprint.org/"
title = "Attribution fixture"
disableKinds = ["taxonomy", "term", "RSS", "sitemap"]
[security.funcs]
getenv = ['^HUGO_', '^ANALYTICS_']
[params.newsletter]
provider = "buttondown"
buttondown_username = "OutsideInPrint"
tag = "outside-in-print"
title = "The weekly newsletter"
cadence = "Every Saturday"
contents = "New essays and original visuals."
price_promise = "Free."
button_label = "Join the newsletter"
sample_label = "Read the latest issue"
privacy_url = "/privacy/"
privacy_label = "Privacy details"
privacy_promise = "Unsubscribe anytime."
[params.newsletter.attribution]
storage_enabled = false
endpoint = "https://newsletter.example.test/signup"
'@

foreach ($enabled in @('false', 'true')) {
  Write-Fixture 'hugo.toml' ($common + "`nenabled = $enabled`n")
  $destination = Join-Path $FixtureRoot "output-$enabled"
  & $HugoPath --source $FixtureRoot --destination $destination --panicOnWarning
  Assert-Contract ($LASTEXITCODE -eq 0) "Newsletter Hugo fixture failed: enabled=$enabled"
  $html = [IO.File]::ReadAllText((Join-Path $destination 'index.html'))
  $analyticsMatch = [regex]::Match($html, '<script type="application/json" data-oip-route-config="analytics">(.*?)</script>')
  Assert-Contract $analyticsMatch.Success 'Analytics route configuration is missing.'
  $analyticsConfig = $analyticsMatch.Groups[1].Value | ConvertFrom-Json
  Assert-Contract (([regex]::Matches($html, 'action="https://buttondown.com/api/emails/embed-subscribe/OutsideInPrint"')).Count -eq 2) 'Both forms must retain the existing native signup action.'
  Assert-Contract (([regex]::Matches($html, 'name="tag" value="outside-in-print"')).Count -eq 2) 'Both forms must retain the existing newsletter tag.'
  if ($enabled -eq 'false') {
    Assert-Contract (-not $html.Contains('data-newsletter-attribution')) 'Disabled integration must not add attribution form controls.'
    Assert-Contract (-not $html.Contains('data-oip-route-config="newsletter-attribution"')) 'Disabled integration must not load campaign tracking.'
    Assert-Contract ($analyticsConfig.campaignAttributionEnabled -eq $false -and $analyticsConfig.registeredCampaigns.Count -eq 0) 'Disabled integration must preserve legacy analytics mapping.'
  } else {
    Assert-Contract (([regex]::Matches($html, '(?m)^\s*data-newsletter-attribution\s*$')).Count -eq 2) 'Both forms must expose the enabled integration marker.'
    Assert-Contract (([regex]::Matches($html, 'data-newsletter-attribution-status')).Count -eq 2) 'Both forms need an accessible response status.'
    Assert-Contract (([regex]::Matches($html, 'name="website"')).Count -eq 2) 'Both forms need the honeypot.'
    $match = [regex]::Match($html, '<script type="application/json" data-oip-route-config="newsletter-attribution">(.*?)</script>')
    Assert-Contract $match.Success 'Enabled integration must emit route configuration.'
    $config = $match.Groups[1].Value | ConvertFrom-Json
    Assert-Contract ($config.pagePath -eq '/' -and $config.campaigns[0].code -eq 'fixture-post') 'Generated campaign allowlist or canonical landing path is incorrect.'
    Assert-Contract ($config.storageEnabled -eq $false) 'The separate storage switch must stay disabled.'
    Assert-Contract ($html.Contains('data-oip-route-script="newsletter-attribution"')) 'Enabled integration must load the lifecycle-managed client.'
    Assert-Contract ($analyticsConfig.campaignAttributionEnabled -eq $true -and $analyticsConfig.registeredCampaigns.Count -eq 1 -and $analyticsConfig.registeredCampaigns[0].code -eq 'fixture-post') 'Analytics must receive only new registered campaign mappings; legacy labels remain unchanged.'
  }
}
Write-Output "PASS: newsletter attribution disabled/enabled Hugo fixture ($FixtureRoot)"
