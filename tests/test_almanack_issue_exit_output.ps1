#requires -Version 7.0
param([string]$HugoPath = $env:OIP_HUGO_BIN)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $HugoPath) { $HugoPath = 'hugo' }
function Assert-Exit { param([bool]$Condition,[string]$Message) if (-not $Condition) { throw $Message } }

# Load only these constant assertion records, not the full-site validator.
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'test_public_html_output.ps1'),[ref]$tokens,[ref]$errors)
Assert-Exit ($errors.Count -eq 0) 'Public HTML validator must parse.'
$boundary=$ast.Find({param($node) $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -ceq '$almanackIssueExitBoundary'},$true)
$almanackIssueExitBoundary=$boundary.Right.Find({param($node) $node -is [System.Management.Automation.Language.StringConstantExpressionAst]},$true).Value
$checks=@('2026-07-25','2026-08-29' | ForEach-Object {
  $target="public/almanack/$_/index.html"
  $entry=$ast.Find({param($node) $node -is [System.Management.Automation.Language.HashtableAst] -and $node.Extent.Text -match ('Path\s*=\s*''' + [regex]::Escape($target) + '''')},$true)
  Assert-Exit ($null -ne $entry) "Missing newsletter assertion for $target"
  Invoke-Expression $entry.Extent.Text
})

$fixture=Join-Path ([IO.Path]::GetTempPath()) ('oip-almanack-exit-' + [guid]::NewGuid().ToString('N'))
function Write-Fixture { param([string]$Name,[string]$Value) $path=Join-Path $fixture $Name;[void][IO.Directory]::CreateDirectory((Split-Path -Parent $path));[IO.File]::WriteAllText($path,$Value) }
$configText=& $HugoPath config --source $repo --format json
Assert-Exit ($LASTEXITCODE -eq 0) 'Read production newsletter configuration.'
$config=($configText -join "`n") | ConvertFrom-Json -AsHashtable -Depth 100
Write-Fixture 'hugo.json' (@{baseURL='https://outsideinprint.org/';timeZone='America/New_York';disableKinds=@('home','section','taxonomy','term','rss','sitemap');params=@{newsletter=$config.params.newsletter}} | ConvertTo-Json -Depth 20)
foreach ($partial in @('almanack/share-toolbar.html','article/share.html','article/share-eligible.html','newsletter_signup.html')) {
  Write-Fixture "layouts/partials/$partial" ([IO.File]::ReadAllText((Join-Path $repo "layouts/partials/$partial")))
}
Write-Fixture 'layouts/partials/metadata/page.html' '{{ return (dict "title" .Title "canonical" .Permalink "policy" (dict "indexable" true)) }}'
# Latest-issue selection has a separate source/output contract. Keep these two
# archives eligible to display the real signup's existing latest-issue link.
Write-Fixture 'layouts/partials/almanack/latest-issue-url.html' '{{ return "/almanack/2026-10-31/" }}'
Write-Fixture 'layouts/_default/baseof.html' '<html><body>{{ block "main" . }}{{ end }}</body></html>'
Write-Fixture 'layouts/almanack/single.html' '{{ define "main" }}<article><p>Protected archive content.</p></article>{{ partial "almanack/share-toolbar.html" (dict "page" . "position" "bottom") }}{{ partial "newsletter_signup.html" (dict "page" . "class" "newsletter-signup--article-exit page-shell page-shell--wide" "anchorID" "bobs-almanack-signup" "focusTarget" true "sourceSlot" "almanack_issue_exit_newsletter") }}{{ end }}'
foreach ($date in @('2026-07-25','2026-08-29')) { Write-Fixture "content/almanack/$date.md" ("---`ntitle: Archive fixture`ndate: $date`ndraft: false`nurl: /almanack/$date/`n---`n") }
$assertions=0
foreach ($minified in @($false,$true)) {
  $destination=Join-Path $fixture ("public-"+$minified)
  $arguments=@('--source',$fixture,'--destination',$destination,'--clock','2026-10-31T20:00:00Z','--panicOnWarning')
  if ($minified) { $arguments+='--minify' }
  $build=& $HugoPath @arguments 2>&1
  Assert-Exit ($LASTEXITCODE -eq 0) ($build -join "`n")
  foreach ($check in $checks) {
    $html=[IO.File]::ReadAllText((Join-Path $destination ($check.Path.Substring(7))))
    Assert-Exit ($html -match $check.Pattern) "Actual toolbar+newsletter must pass: $($check.Path), minified=$minified";$assertions++
    $toolbar=[regex]::Match($html,'(?s)<section\b(?=[^>]*almanack-share-toolbar--bottom)[^>]*>(?:(?!</?section\b).)*</section>')
    Assert-Exit $toolbar.Success 'Fixture must contain the real bottom toolbar.'
    $bad=@{
      missing=$html.Remove($toolbar.Index,$toolbar.Length)
      duplicate=$html.Insert($toolbar.Index,$toolbar.Value)
      wrong=$html.Replace('almanack-share-toolbar--bottom','almanack-share-toolbar--top')
      dataClass=$html.Replace($toolbar.Value,($toolbar.Value -replace '^<section\b([^>]*?)\sclass=','<section$1 data-class='))
      wrongRealClass=$html.Replace($toolbar.Value,($toolbar.Value -replace '^<section\b([^>]*?)\sclass=','<section$1 class="wrong" data-class='))
      extra=$html.Insert($toolbar.Index+$toolbar.Length,'<section>Unrelated region</section>')
      nested=$html.Insert($toolbar.Index+$toolbar.Length-10,'<section>Unrelated region</section>')
      wrongSlot=$html.Replace('almanack_issue_exit_newsletter','unrelated_slot')
      noSlot=[regex]::Replace($html,'\sdata-analytics-source-slot=(?:"[^"]*"|''[^'']*''|[^\s>]+)','')
      misplaced=$html.Insert(0,$toolbar.Value).Remove($toolbar.Index+$toolbar.Length,$toolbar.Length)
    }
    foreach ($name in $bad.Keys) { Assert-Exit ($bad[$name] -notmatch $check.Pattern) "Must reject $name for $($check.Path), minified=$minified";$assertions++ }
    if ($check.Path -like '*2026-07-25*') { Assert-Exit ($html.Replace('The weekly newsletter','Altered proposition') -notmatch $check.Pattern) 'Keep exact archived newsletter copy.';$assertions++ }
    else { Assert-Exit ($html.Replace('newsletter_submit','wrong_event') -notmatch $check.Pattern) 'Keep newsletter submit attribution.';$assertions++ }
  }
}
Write-Host "Almanack issue-exit assertions passed: $assertions positive/negative checks; real toolbar/signup, pretty/minified, no image build. Fixture: $fixture"
