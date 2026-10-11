param(
  [string]$FixtureRoot = '',
  [string]$HugoPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $HugoPath) {
  $HugoPath = if ($IsWindows) {
    Join-Path $repoRoot 'tools/bin/generated/hugo.cmd'
  } else {
    (Get-Command hugo -ErrorAction Stop).Source
  }
}
if (-not $FixtureRoot) {
  $FixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-contributor-header-' + [guid]::NewGuid().ToString('N'))
}
if (Test-Path -LiteralPath $FixtureRoot) {
  throw "Fixture path must be new: $FixtureRoot"
}

function Write-Fixture([string]$RelativePath, [string]$Text) {
  $path = Join-Path $FixtureRoot $RelativePath
  [IO.Directory]::CreateDirectory((Split-Path -Parent $path)) | Out-Null
  [IO.File]::WriteAllText($path, $Text, [Text.UTF8Encoding]::new($false))
}

function Assert-Contract([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

$version = & $HugoPath version
Assert-Contract ($LASTEXITCODE -eq 0 -and "$version" -match '^hugo v0\.167\.0') 'The contributor fixture requires pinned Hugo 0.167.0.'

foreach ($relativePath in @(
  'layouts/partials/authors/byline.html',
  'layouts/partials/authors/resolve.html',
  'layouts/partials/article/editorial-header.html',
  'layouts/partials/article/guest-links.html',
  'layouts/partials/schema/resolve-author.html',
  'data/authors.yaml',
  'data/organization.yaml'
)) {
  Write-Fixture $relativePath ([IO.File]::ReadAllText((Join-Path $repoRoot $relativePath)))
}

# Render the real production title block, without its unrelated image/library pipeline.
$single = [IO.File]::ReadAllText((Join-Path $repoRoot 'layouts/_default/single.html'))
$setup = [regex]::Match($single, '(?s)\{\{ \$editorialHeader := "" \}\}.*?(?=\s*\{\{ \$headerClasses :=)')
$titleBlock = [regex]::Match($single, '(?s)<div class="piece-title-block".*?</div>')
Assert-Contract ($setup.Success -and $titleBlock.Success) 'Cannot isolate the production contributor header.'
$fixtureTemplate = @'
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{ .Title }}</title><link rel="stylesheet" href="/fixture-main.css"></head><body class="article-reading-page"><div class="wrap"><main id="main-content"><article class="piece"><header class="piece-header piece-header--calm piece-header--text-only"><div class="piece-header-composition">
{{ $author := partial "authors/resolve.html" (dict "page" . "fallbackDefault" true) }}
{{ $meta := dict "author" $author }}
{{ $articleVariant := "" }}
'@ + "`n" + $setup.Value + "`n" + $titleBlock.Value + @'

</div></header></article></main></div>
{{ $schema := partial "schema/resolve-author.html" (dict "page" . "organization" (dict "@id" "https://example.test/#organization")) }}
<script id="author-schema" type="application/json">{{ $schema.nodes | jsonify | safeJS }}</script>
</body></html>
'@
Write-Fixture 'layouts/_default/single.html' $fixtureTemplate
Write-Fixture 'static/fixture-main.css' ([IO.File]::ReadAllText((Join-Path $repoRoot 'assets/css/main.css')))
Write-Fixture 'layouts/_default/list.html' '<!doctype html><title>Fixture index</title>'
Write-Fixture 'layouts/index.html' '<!doctype html><title>Fixture home</title>'
Write-Fixture 'hugo.toml' @'
baseURL = "https://example.test/"
disableKinds = ["taxonomy", "term", "RSS", "sitemap"]
'@

# Non-ASCII and supplementary Unicode limits count characters, not encoded bytes.
$unicodeLabel = ([char]::ConvertFromUtf32(0x1F31F) * 160)
$unicodeUrl = 'https://example.test/' + ([string][char]0xE9 * 1000)
$cases = [ordered]@{
  guest = @{
    author = 'Douglas B. Vandergraph'
    contributor_role = 'guest'
    editor_name = 'Robert V. Ussley'
    editor_url = 'https://outsideinprint.org/authors/robert-v-ussley/'
    editor_note = 'This guest essay considers how public institutions can keep their records accessible after an announcement leaves the feed.'
  }
  guest_links = @{
    author = 'Douglas B. Vandergraph'; contributor_role = 'guest'
    editor_name = 'Robert V. Ussley'; editor_url = 'https://outsideinprint.org/authors/robert-v-ussley/'
    guest_links = @(@{ label = 'YouTube'; url = 'https://www.youtube.com/@douglasvandergraph' }, @{ label = 'Website'; url = 'https://douglasvandergraph.com/' })
  }
  one_link = @{ author = 'Fixture Writer'; guest_links = @(@{ label = 'Website'; url = 'http://example.test/' }) }
  empty_links = @{ guest_links = @() }
  invalid_links = @{ guest_links = @(
    @{ label = 'Script'; url = 'javascript:alert(1)' },
    @{ label = 'Data'; url = 'data:text/html,test' },
    @{ label = 'Relative'; url = '/relative' },
    @{ label = 'Scheme relative'; url = '//example.test/' },
    @{ label = 'Credentials'; url = 'https://user:pass@example.test/' },
    @{ label = 'Empty credentials'; url = 'https://@example.test/' },
    @{ label = 'No host'; url = 'https://?q' },
    @{ label = 'Only port'; url = 'https://:80/' },
    @{ label = 'Malformed host'; url = 'https://[bad/' },
    @{ label = 'Bad port'; url = 'https://example.test:bad/' },
    @{ label = 'Port overflow'; url = 'https://example.test:65536/' },
    @{ label = 'Space'; url = 'https://exa mple.test/' },
    @{ label = 'Backslash'; url = 'https://example.test\@evil.test/' },
    @{ label = ''; url = 'https://example.test/' },
    @{ label = "Bad`nlabel"; url = 'https://example.test/' },
    @{ label = ('C1' + [char]0x85); url = 'https://example.test/' },
    @{ label = ('Line' + [char]0x2028); url = 'https://example.test/' },
    @{ label = 'C1 URL'; url = ('https://example.test/' + [char]0x80) },
    @{ label = 'Unicode URL whitespace'; url = ('https://example.test/a' + [char]0xA0 + 'b') },
    @{ label = ($unicodeLabel + 'x'); url = 'https://example.test/' },
    @{ label = 42; url = 'https://example.test/' },
    @{ label = 'Missing' },
    'not a pair'
  ) }
  escaped_links = @{ guest_links = @(@{ label = '<script>alert(1)</script> & Website'; url = 'https://example.test/?a=1&b=2' }) }
  mixed_links = @{ guest_links = @(@{ label = 'Bad'; url = 'javascript:alert(1)' }, @{ label = 'Good'; url = 'HTTPS://example.test/' }) }
  malformed_links = @{ guest_links = 'not a list' }
  unicode_links = @{ guest_links = @(@{ label = $unicodeLabel; url = $unicodeUrl }) }
  wrapped_links = @{ author = 'Fixture Writer'; contributor_role = 'guest'; editor_name = 'Fixture Editor'; guest_links = @(@{ label = 'Visit the complete collection of essays and research'; url = 'https://example.test/' }, @{ label = 'Watch the video channel and recorded conversations'; url = 'https://example.test/video' }) }
  contributing = @{ author = 'Fixture Writer'; contributor_role = 'contributing' }
  ordinary = @{}
  registered = @{ author_id = 'robert-v-ussley' }
  plain_editor = @{ author = 'Fixture Writer'; editor_name = 'Robert V. Ussley' }
  unsafe_url = @{ author = 'Fixture Writer'; editor_name = 'Robert V. Ussley'; editor_url = 'javascript:alert(1)' }
  credential_url = @{ author = 'Fixture Writer'; editor_name = 'Robert V. Ussley'; editor_url = 'https://user:pass@example.test/' }
  relative_url = @{ author = 'Fixture Writer'; editor_name = 'Robert V. Ussley'; editor_url = '/authors/robert-v-ussley/' }
  empty_host = @{ author = 'Fixture Writer'; editor_name = 'Robert V. Ussley'; editor_url = 'https://?q' }
  escaped = @{ author = 'Fixture Writer'; editor_name = '<b>Editor</b>'; editor_note = '<script>alert(1)</script> & a note' }
  blank = @{ contributor_role = 'unknown'; editor_name = ' '; editor_url = 'https://example.test/'; editor_note = ' ' }
}
foreach ($entry in $cases.GetEnumerator()) {
  $metadata = [ordered]@{ title = "Fixture $($entry.Key)"; subtitle = 'Fixture subtitle'; date = '2020-01-01' }
  foreach ($field in $entry.Value.GetEnumerator()) { $metadata[$field.Key] = $field.Value }
  if ($entry.Key -eq 'guest_links') {
    $metadata.title = 'A Public Record Must Outlast the Feed'
    $metadata.subtitle = 'People need a way to find what was said, who said it, and what changed.'
  }
  $frontMatter = ($metadata.GetEnumerator() | ForEach-Object {
    '{0}: {1}' -f $_.Key, (ConvertTo-Json -InputObject $_.Value -Depth 5 -Compress)
  }) -join "`n"
  Write-Fixture "content/essays/$($entry.Key).md" ("---`n$frontMatter`n---`nFixture body.`n")
}

$buildOutput = & $HugoPath --source $FixtureRoot --clock '2020-09-01T12:00:00Z' --panicOnWarning 2>&1
Assert-Contract ($LASTEXITCODE -eq 0) ("Contributor fixture build failed:`n" + ($buildOutput -join "`n"))
$html = @{}
foreach ($entry in $cases.GetEnumerator()) {
  $rendered = [IO.File]::ReadAllText((Join-Path $FixtureRoot "public/essays/$($entry.Key)/index.html"))
  $html[$entry.Key] = $rendered
  $schemaText = [regex]::Match($rendered, '(?s)<script id="author-schema" type="application/json">(.*?)</script>').Groups[1].Value
  $authors = @($schemaText | ConvertFrom-Json)
  $expectedAuthor = if ($entry.Value.ContainsKey('author')) { $entry.Value.author } else { 'Robert V. Ussley' }
  Assert-Contract ($authors.Count -eq 1 -and $authors[0].name -eq $expectedAuthor) "Author/schema attribution changed for $($entry.Key)."
  Assert-Contract ($rendered -match '(?s)<div class="piece-title-block"[^>]*>\s*<h1>.*?</h1>\s*(?:<p class="subtitle">.*?</p>\s*)?<p class="piece-byline">') "Byline is no longer a direct title-block child for $($entry.Key)."
}

$guest = $html.guest
Assert-Contract ($guest -match '<span>Douglas B\. Vandergraph</span>') 'Guest author must remain the visible byline.'
Assert-Contract ($guest -match '<span class="piece-byline__role">Guest contributor</span>') 'Guest role label is missing.'
Assert-Contract ($guest -match '<a href="https://outsideinprint.org/authors/robert-v-ussley/">Robert V\. Ussley</a>') 'Editor credit must link to the specified profile.'
Assert-Contract ($guest -match '(?s)<p class="piece-editor-credit">Edited by\s+<a') 'The linked editor name needs a word boundary after Edited by.'
$positions = @('<h1>', 'class="subtitle"', 'class="piece-byline"', 'class="piece-editor-credit"', 'class="piece-editor-note"') | ForEach-Object { $guest.IndexOf($_) }
for ($i = 1; $i -lt $positions.Count; $i++) {
  Assert-Contract ($positions[$i - 1] -ge 0 -and $positions[$i - 1] -lt $positions[$i]) 'Guest title, subtitle, author, editor and note order changed.'
}
Assert-Contract ($guest -match '<aside class="piece-editor-note" aria-labelledby="piece-editor-note-heading">') 'Editor note must be a visible named aside.'
Assert-Contract ($guest -notmatch '<details|<summary|\shidden\b|aria-expanded') 'Editor note must stay open without disclosure controls.'
Assert-Contract ($html.contributing -match 'Contributing writer') 'Contributing-writer role label is missing.'
foreach ($name in @('ordinary', 'blank', 'empty_links', 'invalid_links', 'malformed_links')) {
  Assert-Contract ($html[$name] -notmatch 'data-contributor-header|piece-byline__role|piece-guest-links|piece-editor-credit|piece-editor-note') "Empty contributor fields changed the ordinary header for $name."
  Assert-Contract ($html[$name].IndexOf('class="piece-byline"') -lt $html[$name].IndexOf('class="subtitle"')) "Ordinary subtitle order changed for $name."
}
foreach ($name in @('ordinary', 'registered')) {
  Assert-Contract ($html[$name] -match '<a href="/authors/robert-v-ussley/">Robert V\. Ussley</a>') "Existing Robert profile link changed for $name."
}
foreach ($name in @('plain_editor', 'unsafe_url', 'credential_url', 'relative_url', 'empty_host')) {
  $credit = [regex]::Match($html[$name], '(?s)<p class="piece-editor-credit">.*?</p>').Value
  Assert-Contract ($credit -match '<span>Robert V\. Ussley</span>' -and $credit -notmatch '<a\b') "Editor URL fallback failed for $name."
}
Assert-Contract ($html.escaped -match '&lt;b&gt;Editor&lt;/b&gt;') 'Editor name must be escaped plain text.'
Assert-Contract ($html.escaped -match '&lt;script&gt;alert\(1\)&lt;/script&gt; &amp; a note') 'Editor note must be escaped plain text.'

$linkedGuest = $html.guest_links
$positions = @('class="piece-byline"', 'class="piece-guest-links"', 'class="piece-editor-credit"') | ForEach-Object { $linkedGuest.IndexOf($_) }
Assert-Contract ($positions[0] -ge 0 -and $positions[0] -lt $positions[1] -and $positions[1] -lt $positions[2]) 'Guest links must appear between author byline and editor credit.'
$row = [regex]::Match($linkedGuest, '(?s)<ul class="piece-guest-links".*?</ul>').Value
Assert-Contract ($row -match 'aria-label="Guest author links" role="list"') 'Guest links need an accessible list label.'
Assert-Contract ($row -match '<a href="https://www.youtube.com/@douglasvandergraph">YouTube</a>' -and $row -match '<a href="https://douglasvandergraph.com/">Website</a>') 'Approved guest links changed.'
Assert-Contract ($row -notmatch 'target=|data-analytics|<svg|<img|<iframe') 'Guest links must use ordinary text navigation without tracking or embeds.'
Assert-Contract ([regex]::Matches($row, '<li>').Count -eq 2 -and [regex]::Matches($row, 'aria-hidden="true"').Count -eq 1) 'Multiple links need one decorative separator.'
$one = [regex]::Match($html.one_link, '(?s)<ul class="piece-guest-links".*?</ul>').Value
Assert-Contract ([regex]::Matches($one, '<li>').Count -eq 1 -and $one -notmatch 'aria-hidden') 'Single link must render without a separator.'
Assert-Contract ($html.guest -notmatch 'piece-guest-links') 'An existing guest header without links must not gain a row.'
Assert-Contract ($html.escaped_links -match '&lt;script&gt;alert\(1\)&lt;/script&gt; &amp; Website' -and $html.escaped_links -match 'href="https://example.test/\?a=1&amp;b=2"') 'Guest labels and URL attributes must be escaped.'
Assert-Contract ($html.mixed_links -match '>Good</a>' -and $html.mixed_links -notmatch '>Bad</a>') 'Invalid links must not suppress valid siblings.'
Assert-Contract ($html.unicode_links.Contains($unicodeLabel + '</a>')) 'Valid Unicode labels must use character limits across the Desk-to-site handoff.'
Assert-Contract ($html.unicode_links -match 'class="piece-guest-links"') 'Valid Unicode URLs must not be rejected by byte length.'
foreach ($name in @('empty_links', 'invalid_links', 'malformed_links')) {
  $actualBlock = [regex]::Match($html[$name], '(?s)<div class="piece-title-block".*?</div>').Value -replace ('Fixture ' + $name), 'Fixture ordinary'
  $ordinaryBlock = [regex]::Match($html.ordinary, '(?s)<div class="piece-title-block".*?</div>').Value
  Assert-Contract ($actualBlock -eq $ordinaryBlock) "No-links header markup changed for $name."
}

Write-Host "Contributor header contract passed: $($cases.Count) isolated rendered cases."
Write-Host "Fixture retained at: $FixtureRoot"
$global:LASTEXITCODE = 0
exit 0
