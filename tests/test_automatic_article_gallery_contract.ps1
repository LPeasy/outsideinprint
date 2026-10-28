#requires -Version 7.0

param(
  [string]$FixtureRoot = '',
  [string]$HugoPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $HugoPath) {
  $HugoPath = if ($IsWindows) { Join-Path $repoRoot 'tools/bin/generated/hugo.cmd' } else { (Get-Command hugo -ErrorAction Stop).Source }
}
if (-not $FixtureRoot) {
  $FixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-automatic-gallery-' + [guid]::NewGuid().ToString('N'))
}
if (Test-Path -LiteralPath $FixtureRoot) { throw "Fixture path must be new: $FixtureRoot" }

function Assert-Contract([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Write-Fixture([string]$Root, [string]$RelativePath, [string]$Text) {
  $path = Join-Path $Root $RelativePath
  [IO.Directory]::CreateDirectory((Split-Path -Parent $path)) | Out-Null
  [IO.File]::WriteAllText($path, $Text, [Text.UTF8Encoding]::new($false))
}

function New-Page([string]$Name, [hashtable]$Fields = @{}, [string]$Section = 'essays', [hashtable]$AssetFields = @{}) {
  $assetId = "essays/fixture/$Name/hero"
  $metadata = [ordered]@{
    title = "Fixture $Name"; date = '2026-10-22T09:00:00-04:00'; draft = $false
    featured_image = $assetId; featured_image_alt = "Original illustration for $Name."
  }
  foreach ($field in $Fields.GetEnumerator()) { $metadata[$field.Key] = $field.Value }
  return @{ Source = "$Section/$Name.md"; Metadata = $metadata; AssetId = $assetId; AssetFields = $AssetFields }
}

function Get-ExpectedAutomaticSlug([string]$CanonicalRoute) {
  $digest = [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($CanonicalRoute))
  return 'article-' + [Convert]::ToHexString($digest).ToLowerInvariant().Substring(0, 16)
}

$version = & $HugoPath version
Assert-Contract ($LASTEXITCODE -eq 0 -and "$version" -match '^hugo v0\.167\.0') 'Automatic Gallery fixtures require pinned Hugo 0.167.0.'

$cases = @(
  @{
    Name = 'named-artwork-identity'; Pages = @(
      (New-Page 'daylight' @{ title = 'Why Daylight Saving Time?'; short_title = 'Daylight Essay' } 'essays' @{ artwork_title = 'Saving Daylight' }),
      (New-Page 'breach' @{ title = 'Breach of Confidence: How Private Are Your Therapy Records?' } 'essays' @{ artwork_title = 'Vulnerable Records' }),
      (New-Page 'no-audience' @{ title = 'No Audience'; publishDate = '2026-10-22T10:00:00-04:00' } 'essays' @{ artwork_title = 'A Capella' })
    )
    Manual = @(@{ slug = 'named-explicit'; title = 'No Audience'; date = '2026-10-22'; publishDate = '2026-10-22T10:00:00-04:00'; image = '/images/legacy/no-audience.png'; essay = '/essays/no-audience/'; alt = 'A grounded dance step.' })
    Aliases = @{ '/images/legacy/no-audience.png' = 'essays/fixture/no-audience/hero' }
    ExpectedRoutes = @('/essays/daylight/', '/essays/breach/', '/essays/no-audience/')
    ExpectedCurrentRoute = '/essays/no-audience/'
    ExpectedCurrentTitle = 'A Capella'
    ExpectedTitles = @{ '/essays/daylight/' = 'Saving Daylight'; '/essays/breach/' = 'Vulnerable Records'; '/essays/no-audience/' = 'A Capella' }
    ExpectedReadingTitles = @{ '/essays/daylight/' = 'Why Daylight Saving Time?'; '/essays/breach/' = 'Breach of Confidence: How Private Are Your Therapy Records?'; '/essays/no-audience/' = 'No Audience' }
  },
  @{
    Name = 'new-reading-illustrations'; Pages = @(
      (New-Page 'new-essay' @{ short_title = 'New Essay Illustration' }),
      (New-Page 'dialogues/new-dialogue' @{ url = '/syd-and-oliver/new-dialogue/'; library_type = 'dialogue'; publishDate = '2026-10-22T10:00:00-04:00' }),
      (New-Page 'new-report' @{} 'reports' @{ image_class = 'editorial_cartoon' }),
      (New-Page 'new-paper' @{} 'working-papers')
    )
    ExpectedRoutes = @('/essays/new-essay/', '/syd-and-oliver/new-dialogue/', '/reports/new-report/', '/working-papers/new-paper/')
    ExpectedCurrentRoute = '/syd-and-oliver/new-dialogue/'
    ExpectedLookups = @{
      '/essays/new-essay/' = 'essays/fixture/new-essay/hero'
      '/syd-and-oliver/new-dialogue/' = 'essays/fixture/dialogues/new-dialogue/hero'
      '/reports/new-report/' = 'essays/fixture/new-report/hero'
      '/working-papers/new-paper/' = 'essays/fixture/new-paper/hero'
    }
    ExpectedTitles = @{ '/essays/new-essay/' = 'New Essay Illustration' }
  },
  @{
    Name = 'custom-unicode-canonical-route'; Pages = @(
      (New-Page 'custom-route' @{ url = '/essays/café-history/' })
    )
    ExpectedRoutes = @('/essays/caf%C3%A9-history/')
    ExpectedCurrentRoute = '/essays/caf%C3%A9-history/'
    ExpectedLookups = @{ '/essays/caf%C3%A9-history/' = 'essays/fixture/custom-route/hero' }
  },
  @{
    Name = 'cutoff'; Pages = @(
      (New-Page 'old-article' @{ date = '2026-10-21T23:59:59-04:00' }),
      (New-Page 'cutoff-article' @{ date = '2026-10-22T00:00:00-04:00' }),
      (New-Page 'backdated-release' @{ date = '2026-10-01T00:00:00-04:00'; publishDate = '2026-10-22T08:00:00-04:00' })
    )
    ExpectedRoutes = @('/essays/cutoff-article/', '/essays/backdated-release/')
    AbsentLookups = @('/essays/old-article/')
    ExpectedCurrentRoute = '/essays/backdated-release/'
  },
  @{
    Name = 'preview-eligibility'; BuildFlags = @('-D', '-F'); Pages = @(
      (New-Page 'published' @{}),
      (New-Page 'draft' @{ draft = $true }),
      (New-Page 'future-publishdate' @{ publishDate = '2026-10-23T00:00:00-04:00' }),
      (New-Page 'future-date' @{ date = '2026-10-23T00:00:00-04:00'; publishDate = '2026-10-22T08:00:00-04:00' }),
      (New-Page 'expired' @{ expiryDate = '2026-10-22T10:00:00-04:00' }),
      (New-Page 'noindex' @{ noindex = $true }),
      (New-Page 'private' @{ private = $true }),
      (New-Page 'redirect' @{ redirect_to = '/essays/published/' }),
      (New-Page 'nonarticle' @{} 'about')
    )
    ExpectedRoutes = @('/essays/published/')
    ExpectedCurrentRoute = '/essays/published/'
    AbsentLookups = @('/essays/draft/', '/essays/future-publishdate/', '/essays/future-date/', '/essays/expired/', '/essays/noindex/', '/essays/private/', '/essays/redirect/', '/about/nonarticle/')
  },
  @{
    Name = 'release-boundary'; Clock = '2026-10-22T14:00:00-04:00'; BuildFlags = @('-D', '-F'); Pages = @(
      (New-Page 'date-boundary' @{ date = '2026-10-22T14:00:00-04:00'; publishDate = '2026-10-22T08:00:00-04:00' }),
      (New-Page 'publish-boundary' @{ date = '2026-10-22T08:00:00-04:00'; publishDate = '2026-10-22T14:00:00-04:00' }),
      (New-Page 'one-second-later' @{ publishDate = '2026-10-22T14:00:01-04:00' })
    )
    ExpectedRoutes = @('/essays/date-boundary/', '/essays/publish-boundary/')
    ExpectedReleases = @{ '/essays/date-boundary/' = '2026-10-22T18:00:00Z'; '/essays/publish-boundary/' = '2026-10-22T18:00:00Z' }
    AbsentLookups = @('/essays/one-second-later/')
  },
  @{
    Name = 'manual-authority-and-dedupe'; Pages = @(
      (New-Page 'route-target' @{}), (New-Page 'alias-target' @{}), (New-Page 'future-manual-target' @{})
    )
    ExtraAssets = @('essays/fixture/manual-separate/hero')
    Aliases = @{ '/images/legacy/alias-target.png' = 'essays/fixture/alias-target/hero' }
    Manual = @(
      @{ slug = 'manual-route'; title = 'Manual Route Title'; date = '2026-10-22'; image = 'essays/fixture/manual-separate/hero'; essay = 'essays/route-target/'; alt = 'Approved manual override.' },
      @{ slug = 'manual-alias'; title = 'Manual Alias Title'; date = '2026-10-22'; image = '/images/legacy/alias-target.png'; essay = '/essays/another-association/'; alt = 'Approved manual association.' },
      @{ slug = 'future-manual'; title = 'Scheduled Manual'; date = '2026-10-22'; publishDate = '2026-10-23T09:00:00-04:00'; image = 'essays/fixture/future-manual-target/hero'; essay = '/essays/future-manual-target/'; alt = 'Scheduled manual override.' }
    )
    ExpectedRoutes = @('essays/route-target/', '/essays/another-association/')
    ExpectedLookups = @{ '/essays/route-target/' = 'essays/fixture/manual-separate/hero' }
    ExpectedTitles = @{ 'essays/route-target/' = 'Manual Route Title'; '/essays/another-association/' = 'Manual Alias Title' }
    AbsentLookups = @('/essays/alias-target/', '/essays/future-manual-target/')
  },
  @{
    Name = 'automatic-managed-aliases'; Pages = @(
      (New-Page 'alias-hero' @{ featured_image = '/images/legacy/alias-hero.png' }),
      (New-Page 'explicit-managed-hero' @{ featured_image = 'oip-image:essays/fixture/explicit-managed-hero/hero' })
    )
    Aliases = @{ '/images/legacy/alias-hero.png' = 'essays/fixture/alias-hero/hero' }
    ExpectedRoutes = @('/essays/alias-hero/', '/essays/explicit-managed-hero/')
    ExpectedLookups = @{ '/essays/alias-hero/' = 'essays/fixture/alias-hero/hero'; '/essays/explicit-managed-hero/' = 'essays/fixture/explicit-managed-hero/hero' }
  },
  @{
    Name = 'illustration-and-approval-filter'; Pages = @(
      (New-Page 'approved' @{}),
      (New-Page 'photo' @{} 'essays' @{ image_class = 'photo' }),
      (New-Page 'pending' @{} 'essays' @{ review_state = 'pending' }),
      (New-Page 'unreferenced' @{} 'essays' @{ usage_state = 'unreferenced' }),
      (New-Page 'source-only' @{} 'essays' @{ processing_state = 'source_only_unprocessable' }),
      (New-Page 'body-only' @{ featured_image = ''; fixture_body = '![Body illustration](oip-image:essays/fixture/body-only/hero)' }),
      (New-Page 'external-photo' @{ featured_image = 'https://example.test/photo.jpg' })
    )
    ExpectedRoutes = @('/essays/approved/')
    ExpectedCurrentRoute = '/essays/approved/'
    AbsentLookups = @('/essays/photo/', '/essays/pending/', '/essays/unreferenced/', '/essays/source-only/', '/essays/body-only/', '/essays/external-photo/')
  },
  @{
    Name = 'reused-automatic-artwork'; Pages = @(
      (New-Page 'reuse-older' @{ featured_image = 'essays/fixture/reuse-newer/hero' }),
      (New-Page 'tie-zulu' @{ featured_image = 'essays/fixture/tie-alpha/hero' }),
      (New-Page 'reuse-newer' @{ publishDate = '2026-10-22T10:00:00-04:00' } 'essays' @{ artwork_title = 'One Lasting Name' }),
      (New-Page 'tie-alpha' @{})
    )
    ExpectedRoutes = @('/essays/reuse-newer/', '/essays/tie-alpha/')
    ExpectedCurrentRoute = '/essays/reuse-newer/'
    ExpectedCurrentTitle = 'One Lasting Name'
    ExpectedTitles = @{ '/essays/reuse-newer/' = 'One Lasting Name' }
    ExpectedLookups = @{ '/essays/reuse-newer/' = 'essays/fixture/reuse-newer/hero'; '/essays/tie-alpha/' = 'essays/fixture/tie-alpha/hero' }
    AbsentLookups = @('/essays/reuse-older/', '/essays/tie-zulu/')
  },
  @{
    Name = 'missing-alt-fails-closed'; Pages = @((New-Page 'missing-alt' @{ featured_image_alt = '   ' }))
    ExpectedFailure = 'featured_image_alt|alt text'
  },
  @{
    Name = 'unconfigured-named-artwork'; Disabled = $true; Pages = @((New-Page 'named-legacy' @{} 'essays' @{ artwork_title = 'An Established Artwork Name' }))
    Manual = @(@{ slug = 'legacy-named'; title = 'Older Registry Name'; date = '2026-10-01'; image = 'essays/fixture/named-legacy/hero'; essay = '/essays/named-legacy/'; alt = 'Named legacy artwork.' })
    ExpectedRoutes = @('/essays/named-legacy/')
    ExpectedCurrentRoute = '/essays/named-legacy/'
    ExpectedCurrentTitle = 'An Established Artwork Name'
    ExpectedTitles = @{ '/essays/named-legacy/' = 'An Established Artwork Name' }
  },
  @{
    Name = 'unconfigured-legacy-behavior'; Disabled = $true; Pages = @((New-Page 'automatic-disabled' @{}))
    Manual = @(@{ slug = 'legacy'; title = 'Legacy'; date = '2026-10-01'; image = 'essays/fixture/automatic-disabled/hero'; essay = '/essays/legacy/'; alt = 'Legacy art.' })
    ExpectedRoutes = @('/essays/legacy/')
    ExpectedCurrentRoute = '/essays/legacy/'
    AbsentLookups = @('/essays/automatic-disabled/')
  }
)

$partials = @(
  'editorial/registered-cartoons.html', 'editorial/published-cartoons.html', 'editorial/cartoon-is-published.html',
  'editorial/current-cartoon.html', 'editorial/cartoon-for-page.html', 'collections/is-published.html',
  'metadata/policy.html', 'metadata/route.html', 'images/resolve.html', 'images/signature-policy.html',
  'editorial/linked-reading-page.html', 'editorial/gallery-reading-link.html', 'editorial/gallery-download-link.html'
)
$homeTemplate = @'
{{- $entries := partial "editorial/published-cartoons.html" (hugo.Data.editorial_cartoons.cartoons | default (slice)) -}}
{{- $current := partial "editorial/current-cartoon.html" . -}}
{{- $lookups := dict -}}
{{- range $page := site.RegularPages -}}
  {{- with partial "editorial/cartoon-for-page.html" $page -}}
    {{- $lookups = merge $lookups (dict $page.RelPermalink .image) -}}
  {{- end -}}
{{- end -}}
{{- dict "entries" $entries "current" $current "lookups" $lookups | jsonify | safeHTML -}}
'@
$pngBytes = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=')
$sha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($pngBytes)).ToLowerInvariant()
$originalFutureSetting = [Environment]::GetEnvironmentVariable('HUGO_BUILD_FUTURE_CARTOONS')
try {
  $env:HUGO_BUILD_FUTURE_CARTOONS = 'false'
  foreach ($case in $cases) {
    $caseRoot = Join-Path $FixtureRoot $case.Name
    foreach ($partial in $partials) {
      $relativePath = "layouts/partials/$partial"
      Write-Fixture $caseRoot $relativePath ([IO.File]::ReadAllText((Join-Path $repoRoot $relativePath)))
    }
    Write-Fixture $caseRoot 'layouts/index.html' $homeTemplate
    Write-Fixture $caseRoot 'layouts/_default/single.html' 'Fixture article.'
    Write-Fixture $caseRoot 'layouts/_default/list.html' 'Fixture section.'
    Write-Fixture $caseRoot 'layouts/_default/baseof.html' '{{ block "main" . }}{{ end }}'
    Write-Fixture $caseRoot 'layouts/gallery/list.html' ([IO.File]::ReadAllText((Join-Path $repoRoot 'layouts/gallery/list.html')))
    Write-Fixture $caseRoot 'content/gallery/_index.md' "---`ntitle: Gallery`n---`n"
    Write-Fixture $caseRoot 'assets/js/gallery-load-more.js' ([IO.File]::ReadAllText((Join-Path $repoRoot 'assets/js/gallery-load-more.js')))
    # Title/link contracts use the production Gallery layout without generating image derivatives.
    Write-Fixture $caseRoot 'layouts/partials/images/model.html' '{{ return (dict "lightbox_url" "/fixture.webp" "lightbox_width" 1 "lightbox_height" 1 "signature_enabled" false "largest_webp_url" "/fixture.webp") }}'
    Write-Fixture $caseRoot 'layouts/partials/images/picture.html' '<img src="/fixture.webp" alt="{{ .alt }}">'
    Write-Fixture $caseRoot 'hugo.toml' "baseURL = 'https://example.test/'`ntimeZone = 'America/New_York'`ndisableKinds = ['taxonomy', 'term', 'RSS', 'sitemap']`n"
    $galleryData = @{ cartoons = @() }
    if (-not $case.ContainsKey('Disabled')) { $galleryData.automatic_articles_since = '2026-10-22T00:00:00-04:00' }
    if ($case.ContainsKey('Manual')) { $galleryData.cartoons = @($case.Manual) }
    Write-Fixture $caseRoot 'data/editorial_cartoons.json' (ConvertTo-Json -InputObject $galleryData -Depth 8)

    $assets = @{}
    foreach ($page in $case.Pages) {
      $metadata = $page.Metadata
      $body = if ($metadata.Contains('fixture_body')) { [string]$metadata.fixture_body } else { 'An article fixture.' }
      $frontMatter = ($metadata.GetEnumerator() | Where-Object { $_.Key -ne 'fixture_body' } | ForEach-Object {
        '{0}: {1}' -f $_.Key, (ConvertTo-Json -InputObject $_.Value -Depth 5 -Compress)
      }) -join "`n"
      Write-Fixture $caseRoot ("content/" + $page.Source) ("---`n$frontMatter`n---`n$body`n")
      $assets[$page.AssetId] = @{ id = $page.AssetId; source = "images/originals/$($page.AssetId).png"; sha256 = $sha256; width = 1; height = 1; image_class = 'essay_illustration'; review_state = 'approved'; usage_state = 'referenced'; processing_state = 'derivative_capable' }
      foreach ($field in $page.AssetFields.GetEnumerator()) { $assets[$page.AssetId][$field.Key] = $field.Value }
    }
    if ($case.ContainsKey('ExtraAssets')) {
      foreach ($assetId in $case.ExtraAssets) {
        $assets[$assetId] = @{ id = $assetId; source = "images/originals/$assetId.png"; sha256 = $sha256; width = 1; height = 1; image_class = 'essay_illustration'; review_state = 'approved'; usage_state = 'referenced'; processing_state = 'derivative_capable' }
      }
    }
    foreach ($asset in $assets.Values) {
      $sourcePath = Join-Path $caseRoot ("assets/" + $asset.source)
      [IO.Directory]::CreateDirectory((Split-Path -Parent $sourcePath)) | Out-Null
      [IO.File]::WriteAllBytes($sourcePath, $pngBytes)
    }
    $aliases = if ($case.ContainsKey('Aliases')) { $case.Aliases } else { @{} }
    Write-Fixture $caseRoot 'data/image-assets.json' (ConvertTo-Json -InputObject @{ assets = $assets; aliases = $aliases } -Depth 8)
    Write-Fixture $caseRoot 'data/image-signatures.json' ('{"version":1,"mark":"images/signatures/fixture.png","default_classes":["essay_illustration","editorial_cartoon"],"width_ratio":0.04,"inset_ratio":0.025,"overrides":{},"legacy_assets":{}}' + "`n")
    $markPath = Join-Path $caseRoot 'assets/images/signatures/fixture.png'
    [IO.Directory]::CreateDirectory((Split-Path -Parent $markPath)) | Out-Null
    [IO.File]::WriteAllBytes($markPath, $pngBytes)

    $clock = if ($case.ContainsKey('Clock')) { $case.Clock } else { '2026-10-22T12:00:00-04:00' }
    $buildFlags = if ($case.ContainsKey('BuildFlags')) { @($case.BuildFlags) } else { @() }
    $buildOutput = & $HugoPath --source $caseRoot --clock $clock --panicOnWarning @buildFlags 2>&1
    if ($case.ContainsKey('ExpectedFailure')) {
      Assert-Contract ($LASTEXITCODE -ne 0 -and ($buildOutput -join "`n") -match $case.ExpectedFailure) "Automatic Gallery fixture '$($case.Name)' did not reject its invalid artwork metadata."
      continue
    }
    Assert-Contract ($LASTEXITCODE -eq 0) ("Automatic Gallery fixture '$($case.Name)' failed to build:`n" + ($buildOutput -join "`n"))
    $actual = [IO.File]::ReadAllText((Join-Path $caseRoot 'public/index.html')) | ConvertFrom-Json -AsHashtable -Depth 20
    $galleryHtml = [IO.File]::ReadAllText((Join-Path $caseRoot 'public/gallery/index.html'))
    $entries = @($actual.entries)
    $manualSlugs = if ($case.ContainsKey('Manual')) { @($case.Manual | ForEach-Object { [string]$_.slug }) } else { @() }
    foreach ($entry in $entries) {
      if ($entry.slug -in $manualSlugs) { continue }
      Assert-Contract ($entry.slug -ceq (Get-ExpectedAutomaticSlug ([string]$entry.essay))) "Automatic Gallery fixture '$($case.Name)' has an unstable canonical-route slug."
    }
    $actualRoutes = @($entries | ForEach-Object { [string]$_.essay } | Sort-Object)
    $expectedRoutes = @($case.ExpectedRoutes | Sort-Object)
    Assert-Contract (($actualRoutes -join '|') -ceq ($expectedRoutes -join '|')) "Automatic Gallery fixture '$($case.Name)' routes differ: $($actualRoutes -join ', ')."
    if ($case.ContainsKey('ExpectedCurrentRoute')) {
      Assert-Contract ($actual.current.essay -ceq $case.ExpectedCurrentRoute) "Automatic Gallery fixture '$($case.Name)' selected the wrong current illustration."
    }
    if ($case.ContainsKey('ExpectedCurrentTitle')) {
      Assert-Contract ($actual.current.title -ceq $case.ExpectedCurrentTitle) "Automatic Gallery fixture '$($case.Name)' renamed current artwork from its article."
      $heading = [regex]::Match($galleryHtml, '(?s)<h2 id="current-cartoon-title">(?<title>.*?)</h2>')
      Assert-Contract ($heading.Success -and [Net.WebUtility]::HtmlDecode($heading.Groups['title'].Value) -ceq $case.ExpectedCurrentTitle) "Automatic Gallery fixture '$($case.Name)' lost the current illustration heading."
    }
    foreach ($field in @('ExpectedLookups', 'ExpectedTitles', 'ExpectedReleases')) {
      if (-not $case.ContainsKey($field)) { continue }
      foreach ($expected in $case[$field].GetEnumerator()) {
        if ($field -eq 'ExpectedLookups') {
          Assert-Contract ($actual.lookups.ContainsKey($expected.Key) -and $actual.lookups[$expected.Key] -ceq $expected.Value) "Automatic Gallery fixture '$($case.Name)' lost the shared page lookup for $($expected.Key)."
        } else {
          $entry = @($entries | Where-Object { $_.essay -ceq $expected.Key })[0]
          $matches = if ($field -eq 'ExpectedTitles') { $entry.title -ceq $expected.Value } else { [datetimeoffset]::Parse($entry.publishDate) -eq [datetimeoffset]::Parse($expected.Value) }
          Assert-Contract $matches "Automatic Gallery fixture '$($case.Name)' has wrong $field for $($expected.Key)."
          if ($field -eq 'ExpectedTitles') {
            $trigger = @([regex]::Matches($galleryHtml, '<button\b[^>]*>') | Where-Object { $_.Value -match ('data-cartoon-slug="' + [regex]::Escape([string]$entry.slug) + '"') })
            Assert-Contract ($trigger.Count -eq 1) "Automatic Gallery fixture '$($case.Name)' lost its unique lightbox trigger."
            $label = [regex]::Match($trigger[0].Value, 'data-title="(?<title>[^"]*)"')
            Assert-Contract ($label.Success -and [Net.WebUtility]::HtmlDecode($label.Groups['title'].Value) -ceq $expected.Value) "Automatic Gallery fixture '$($case.Name)' lost the artwork lightbox title."
          }
        }
      }
    }
    if ($case.ContainsKey('ExpectedReadingTitles')) {
      foreach ($reading in $case.ExpectedReadingTitles.GetEnumerator()) {
        $links = @([regex]::Matches($galleryHtml, '(?s)<a\b[^>]*class="cartoon-gallery__reading-link"[^>]*>.*?</a>') | Where-Object { $_.Value -match ('href="' + [regex]::Escape($reading.Key) + '"') })
        Assert-Contract ($links.Count -eq 1 -and [Net.WebUtility]::HtmlDecode($links[0].Value).Contains([string]$reading.Value)) "Automatic Gallery fixture '$($case.Name)' changed the associated article's reading-link title."
      }
    }
    if ($case.ContainsKey('AbsentLookups')) {
      foreach ($route in $case.AbsentLookups) {
        Assert-Contract (-not $actual.lookups.ContainsKey($route)) "Automatic Gallery fixture '$($case.Name)' exposed excluded artwork for $route."
      }
    }
  }
}
finally {
  [Environment]::SetEnvironmentVariable('HUGO_BUILD_FUTURE_CARTOONS', $originalFutureSetting)
}

Write-Host "Automatic article Gallery contract passed: $($cases.Count) isolated rendered cases."
Write-Host "Fixture retained at: $FixtureRoot"
$global:LASTEXITCODE = 0
