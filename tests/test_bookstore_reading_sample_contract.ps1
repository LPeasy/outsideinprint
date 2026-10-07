#requires -Version 7.0
[CmdletBinding()]
param(
  [string]$SiteDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public'),
  [switch]$SourceOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-RequiredText {
  param([Parameter(Mandatory)][string]$RelativePath)

  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing bookstore reading-sample file: $RelativePath"
  }
  Get-Content -LiteralPath $path -Raw -Encoding utf8
}

function Assert-Contains {
  param(
    [Parameter(Mandatory)][string]$Text,
    [Parameter(Mandatory)][string]$Expected,
    [Parameter(Mandatory)][string]$Context
  )

  if (-not $Text.Contains($Expected, [StringComparison]::Ordinal)) {
    throw "$Context is missing required text: $Expected"
  }
}

function Assert-Ordered {
  param(
    [Parameter(Mandatory)][string]$Text,
    [Parameter(Mandatory)][string]$First,
    [Parameter(Mandatory)][string]$Second,
    [Parameter(Mandatory)][string]$Context
  )

  $firstIndex = $Text.IndexOf($First, [StringComparison]::Ordinal)
  $secondIndex = $Text.IndexOf($Second, [StringComparison]::Ordinal)
  if ($firstIndex -lt 0 -or $secondIndex -lt 0 -or $firstIndex -ge $secondIndex) {
    throw "$Context must place '$First' before '$Second'."
  }
}

function Get-FrontMatterValue {
  param(
    [Parameter(Mandatory)][string]$FrontMatter,
    [Parameter(Mandatory)][string]$Key,
    [Parameter(Mandatory)][string]$Context
  )

  $pattern = '(?m)^' + [regex]::Escape($Key) + ':\s*(?:"(?<double>[^"]*)"|''(?<single>[^'']*)''|(?<plain>[^\r\n#]*?))\s*$'
  $matches = @([regex]::Matches($FrontMatter, $pattern))
  if ($matches.Count -ne 1) {
    throw "$Context must define $Key exactly once; found $($matches.Count)."
  }
  $match = $matches[0]
  if ($match.Groups['double'].Success) { return $match.Groups['double'].Value }
  if ($match.Groups['single'].Success) { return $match.Groups['single'].Value }
  $match.Groups['plain'].Value.Trim()
}

function Get-ProseWordCount {
  param([Parameter(Mandatory)][string]$Markdown)

  $text = [regex]::Replace($Markdown, '(?m)^\s*\{\{<\s*sample-figure\b.*?>\}\}\s*$', ' ')
  $text = [regex]::Replace($text, '(?m)^#{1,6}\s+', '')
  $text = [regex]::Replace($text, '(?m)^\[\^[^]]+\]:\s*', '')
  $text = [regex]::Replace($text, '\[\^[^]]+\]', ' ')
  $text = [regex]::Replace($text, 'https?://\S+', ' ')
  $text = [regex]::Replace($text, '[*_\x60~>|\[\](){}]', ' ')
  [regex]::Matches($text, "\b[\p{L}\p{N}][\p{L}\p{N}'’.-]*\b").Count
}

function Get-NormalizedBodyDigest {
  param([Parameter(Mandatory)][string]$Body)

  $lf = [string][char]10
  $normalized = (($Body -replace '\r\n', $lf -replace '\r', $lf).Trim() + $lf)
  [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($normalized))
  ).ToLowerInvariant()
}

function Get-NormalizedHtmlText {
  param([Parameter(Mandatory)][string]$Html)

  $decoded = [Net.WebUtility]::HtmlDecode($Html)
  $withoutTags = [regex]::Replace($decoded, '(?s)<[^>]+>', ' ')
  [regex]::Replace($withoutTags, '\s+', ' ').Trim()
}

function Get-SampleDocument {
  param(
    [Parameter(Mandatory)][string]$RelativePath,
    [Parameter(Mandatory)][string[]]$RequiredKeys
  )

  $text = Get-RequiredText -RelativePath $RelativePath
  $match = [regex]::Match($text, '(?s)\A---\s*\r?\n(?<frontMatter>.*?)\r?\n---\s*\r?\n(?<body>.*)\z')
  if (-not $match.Success) {
    throw "$RelativePath must contain YAML front matter followed by Markdown."
  }

  $frontMatter = $match.Groups['frontMatter'].Value
  $fields = [ordered]@{}
  foreach ($key in $RequiredKeys) {
    $fields[$key] = Get-FrontMatterValue -FrontMatter $frontMatter -Key $key -Context $RelativePath
  }

  [pscustomobject]@{
    RelativePath = $RelativePath
    Text = $text
    FrontMatter = $frontMatter
    Body = $match.Groups['body'].Value
    Fields = $fields
  }
}

function Get-ContextualHtmlAttribute {
  param([Parameter(Mandatory)][string]$Tag, [Parameter(Mandatory)][string]$Name)
  $match = [regex]::Match($Tag, '(?is)(?:^|\s)' + [regex]::Escape($Name) + '=(?:"(?<quoted>[^"]*)"|(?<bare>[^\s>]+))')
  $value = if ($match.Groups['quoted'].Success) { $match.Groups['quoted'].Value } else { $match.Groups['bare'].Value }
  [Net.WebUtility]::HtmlDecode($value)
}

function Test-ContextualBookFixtures {
  # Exercise the real helper chain with one static fixture cover, without managed derivatives.
  $hugoPath = $env:OIP_HUGO_BIN
  if (-not $hugoPath) {
    $localHugo = Join-Path $repoRoot '.tools/hugo-0.164.0/hugo'
    $hugoPath = if (Test-Path -LiteralPath $localHugo -PathType Leaf) { $localHugo } else { 'hugo' }
  }
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $fixture = Join-Path $tempRoot ('oip-contextual-book-' + [guid]::NewGuid().ToString('N'))
  [void](New-Item -ItemType Directory -Path $fixture)
  try {
    foreach ($directory in @('layouts/partials/shop', 'layouts/partials/images', 'static/images/books/the-water-cycle', 'layouts/_default', 'content/essays', 'data')) {
      [void](New-Item -ItemType Directory -Path (Join-Path $fixture $directory) -Force)
    }
    foreach ($partial in @('contextual-book', 'product-data', 'sample-link', 'resolve-reading-sample')) {
      Copy-Item -LiteralPath (Join-Path $repoRoot "layouts/partials/shop/$partial.html") -Destination (Join-Path $fixture "layouts/partials/shop/$partial.html")
    }
    foreach ($partial in @('picture', 'model', 'resolve')) {
      Copy-Item -LiteralPath (Join-Path $repoRoot "layouts/partials/images/$partial.html") -Destination (Join-Path $fixture "layouts/partials/images/$partial.html")
    }
    $fixtureCover = '/images/books/the-water-cycle/the-water-cycle-cover-v2.0.jpg'
    Copy-Item -LiteralPath (Join-Path $repoRoot "static$fixtureCover") -Destination (Join-Path $fixture "static$fixtureCover")
    [IO.File]::WriteAllText((Join-Path $fixture 'layouts/_default/single.html'), '{{ .Title }}')
    [IO.File]::WriteAllText((Join-Path $fixture 'layouts/_default/list.html'), '{{ .Title }}')
    $bookSpecs = @($contextualEntries | Group-Object key | ForEach-Object { $_.Group[0] })
    $cases = @('valid', 'absent', 'inherited', 'unrelated', 'hidden', 'bad-target', 'missing-target', 'wrong-key', 'missing-catalog', 'draft-target', 'future-target', 'expired-target', 'missing-sample', 'unready-sample', 'draft-sample', 'wrong-sample-key', 'missing-sku', 'sample-override', 'extra-field',
      'new-book-substitution', 'new-book-wrong-key', 'new-book-missing-catalog', 'bad-route', 'bad-placement',
      '2045-missing-override', '2045-wrong-override', '2045-missing-sample', '2045-draft-sample', '2045-unpublished-sample', '2045-future-sample', '2045-expired-sample', '2045-wrong-sample-key', '2045-wrong-sku')
    foreach ($case in $cases) {
      [IO.File]::WriteAllText((Join-Path $fixture 'hugo.toml'), 'baseURL = "https://fixture.invalid/"' + "`n" + 'disableKinds = ["taxonomy", "term", "RSS", "sitemap"]')
      $products = @{}
      foreach ($bookSpec in $bookSpecs) {
        $key = [string]$bookSpec.key
        $bookDir = Join-Path $fixture ('content' + $bookSpec.book_path)
        [void](New-Item -ItemType Directory -Path $bookDir -Force)
        $isWater = $key -eq 'the_water_cycle'
        $is2045 = $key -eq '2045'
        $bookKey = if (($isWater -and $case -eq 'wrong-key') -or ($key -eq 'american_nightmare' -and $case -eq 'new-book-wrong-key')) { 'unrelated' } else { $key }
        $productFields = 'book_key: "' + $bookKey + '"'
        if ($isWater) {
          $productFields += switch ($case) {
            'draft-target' { "`ndraft: true" }
            'future-target' { "`npublishDate: 2099-01-01" }
            'expired-target' { "`nexpiryDate: 2000-01-01" }
            'sample-override' { "`nsample_page: /essays/unrelated" }
            default { '' }
          }
        }
        if ($is2045 -and $case -ne '2045-missing-override') {
          $override = if ($case -eq '2045-wrong-override') { '/shop/the-water-cycle' } else { '/shop/2045/sample' }
          $productFields += "`nsample_page: $override"
        }
        $indexName = if ($is2045) { '_index.md' } else { 'index.md' }
        [IO.File]::WriteAllText((Join-Path $bookDir $indexName), "---`ntitle: Fixture $key`ndate: 2020-01-01`n$productFields`n---`n")
        $sampleStatus = if ($is2045) { 'published' } else { 'ready' }
        $sampleKey = $key
        $sampleDraft = 'false'
        $sampleExtra = ''
        if ($isWater) {
          if ($case -eq 'unready-sample') { $sampleStatus = 'local_draft'; $sampleDraft = 'true' }
          if ($case -eq 'draft-sample') { $sampleDraft = 'true' }
          if ($case -eq 'wrong-sample-key') { $sampleKey = 'unrelated' }
        }
        if ($is2045) {
          if ($case -eq '2045-draft-sample') { $sampleDraft = 'true' }
          if ($case -eq '2045-unpublished-sample') { $sampleStatus = 'ready' }
          if ($case -eq '2045-future-sample') { $sampleExtra = "publishDate: 2099-01-01`n" }
          if ($case -eq '2045-expired-sample') { $sampleExtra = "expiryDate: 2000-01-01`n" }
          if ($case -eq '2045-wrong-sample-key') { $sampleKey = 'the_water_cycle' }
        }
        [IO.File]::WriteAllText((Join-Path $bookDir 'sample.md'), "---`ntitle: Fixture story`ndate: 2020-01-01`nsample_of_book_key: `"$sampleKey`"`nsample_release_status: $sampleStatus`ndraft: $sampleDraft`n$sampleExtra---`nA brief sample.")
        if (($isWater -and $case -in @('missing-target', 'missing-sample')) -or ($is2045 -and $case -eq '2045-missing-sample')) {
          Remove-Item -LiteralPath (Join-Path $bookDir 'sample.md')
        }
        if ($isWater -and $case -eq 'missing-target') { Remove-Item -LiteralPath (Join-Path $bookDir $indexName) }
        $sku = if (($isWater -and $case -eq 'missing-sku') -or ($is2045 -and $case -eq '2045-wrong-sku')) { 'OIP-OTHER-EPUB' } else { $bookSpec.sku }
        $offer = @{ sku = $sku; format = 'EPUB'; availability_status = 'live'; price_display = '$12.34'; price_cents = 1234; currency = 'USD'; permitted_geography = 'Fixture customers' }
        $product = @{ title = "Fixture $key"; product_type = 'Fixture e-book'; suggested_slug = ($bookSpec.book_path -split '/')[-1]; cover_image = $fixtureCover; cover_alt = 'Fixture cover alternative text'; direct_offers = @($offer) }
        $products[$key] = $product
      }
      # Defaults deliberately look valid: catalog membership must be checked first.
      $defaults = $products['the_water_cycle']
      if ($case -eq 'missing-catalog') { $products.Remove('the_water_cycle') }
      if ($case -eq 'new-book-missing-catalog') { $products.Remove('parable_of_the_sheep') }
      [IO.File]::WriteAllText((Join-Path $fixture 'data/bookstore.json'), (@{ defaults = $defaults; products = $products } | ConvertTo-Json -Depth 8))
      foreach ($entry in $contextualEntries) {
        $sourcePath = Join-Path $fixture ('content/' + $entry.source)
        [void](New-Item -ItemType Directory -Path (Split-Path -Parent $sourcePath) -Force)
        $bookPath = $entry.book_path
        if ($case -eq 'bad-target' -and $entry.source -eq 'collections/floods-water-built-environment.md') { $bookPath = '/shop/2045' }
        if ($case -eq 'new-book-substitution' -and $entry.key -eq 'american_nightmare') { $bookPath = '/shop/the-parable-of-the-sheep' }
        $declaration = "book_promo:`n  book_path: $bookPath`n  heading: 'Fixture invitation'`n  connection: 'Fixture <strong>plain text</strong> & connection.'`n"
        if ($case -in @('absent', 'inherited', 'unrelated')) { $declaration = '' }
        if ($case -eq 'extra-field' -and $entry.key -eq 'the_water_cycle') { $declaration += "  source_slot: arbitrary`n" }
        $route = if ($case -eq 'bad-route' -and $entry.source -eq 'collections/floods-water-built-environment.md') { '/collections/changed-route/' } else { $entry.route }
        [IO.File]::WriteAllText($sourcePath, "---`ntitle: Fixture entry`ndate: 2020-01-01`nurl: $route`n$declaration---`nExisting body.")
      }
      $unrelatedPromo = "book_promo:`n  book_path: /shop/the-water-cycle`n  heading: Fixture invitation`n  connection: Fixture connection`n"
      [IO.File]::WriteAllText((Join-Path $fixture 'content/essays/unrelated.md'), "---`ntitle: Unrelated`n$unrelatedPromo---`nUnrelated body.")
      $inherited = if ($case -eq 'inherited') { "cascade:`n" + (($unrelatedPromo.TrimEnd() -split "`n" | ForEach-Object { '  ' + $_ }) -join "`n") } else { '' }
      [IO.File]::WriteAllText((Join-Path $fixture 'content/_index.md'), "---`ntitle: Fixture`n$inherited`n---`n")
      $visible = if ($case -eq 'hidden') { 'false' } else { 'true' }
      $template = foreach ($entry in $contextualEntries) {
        $placement = if ($case -eq 'bad-placement' -and $entry.source -eq 'collections/floods-water-built-environment.md') { 'article' } else { $entry.placement }
        '{{ partial "shop/contextual-book.html" (dict "page" (site.GetPage "' + ($entry.source -replace '\.md$', '') + '") "placement" "' + $placement + '" "visible" ' + $visible + ') }}'
      }
      if ($case -eq 'unrelated') { $template += '{{ partial "shop/contextual-book.html" (dict "page" (site.GetPage "/essays/unrelated") "placement" "article" "visible" true) }}' }
      [IO.File]::WriteAllText((Join-Path $fixture 'layouts/index.html'), ($template -join "`n"))
      $buildOutput = & $hugoPath --source $fixture --clock '2026-10-07T12:00:00Z' --buildDrafts --buildFuture --buildExpired --panicOnWarning 2>&1
      $exitCode = $LASTEXITCODE
      if ($case -notin @('valid', 'absent', 'inherited', 'unrelated', 'hidden')) {
        if ($exitCode -eq 0 -or ($buildOutput -join "`n") -notmatch '(?i)Contextual book|Ready reading sample') {
          throw "Contextual-book invalid fixture $case must fail with a specific validation error:`n$($buildOutput -join "`n")"
        }
        continue
      }
      if ($exitCode -ne 0) { throw "Contextual-book fixture $case failed:`n$($buildOutput -join "`n")" }
      $html = Get-Content -LiteralPath (Join-Path $fixture 'public/index.html') -Raw -Encoding utf8
      $modules = @([regex]::Matches($html, '(?s)<aside\b[^>]*class="[^"]*\bcontextual-book\b[^>]*>.*?</aside>'))
      if ($case -ne 'valid') {
        if ($modules.Count -ne 0) { throw "Contextual-book fixture $case must render no module." }
        continue
      }
      if ($modules.Count -ne $contextualEntries.Count) { throw 'Valid fixture must render exactly the eight explicitly allowed modules.' }
      foreach ($index in 0..($contextualEntries.Count - 1)) {
        $entry = $contextualEntries[$index]
        $module = $modules[$index].Value
        $plain = Get-NormalizedHtmlText -Html $module
        foreach ($probe in @('Fixture e-book', '$12.34', 'EPUB', 'USD', 'Fixture customers', '1 min read')) {
          Assert-Contains -Text $plain -Expected $probe -Context 'Contextual-book catalog and sample derivation'
        }
        Assert-Contains -Text $module -Expected '&lt;strong&gt;plain text&lt;/strong&gt;' -Context 'Escaped contextual connection'
        if ($module -match '<strong>|<form\b|<script\b|onclick=') { throw 'Fixture must retain escaped copy and native links.' }
        if ([regex]::Matches($module, '<a\b').Count -ne 3 -or [regex]::Matches($module, '<img\b').Count -ne 1) { throw 'Fixture requires two text links and one linked cover.' }
        Assert-Contains -Text $module -Expected ('src="' + $fixtureCover + '"') -Context 'Fixture catalog cover source'
        Assert-Contains -Text $module -Expected 'alt="Fixture cover alternative text"' -Context 'Fixture catalog cover alt'
        Assert-Contains -Text $module -Expected ('aria-label="View Fixture ' + $entry.key + ' and buying options"') -Context 'Fixture cover accessible name'
        $sampleHref = if ($entry.key -eq '2045') { '/shop/2045/sample/' } else { $entry.book_path + '/#reading-sample' }
        $samplePath = if ($entry.key -eq '2045') { '/shop/2045/sample/' } else { $entry.book_path + '/' }
        $sampleAnchor = [regex]::Match($module, '(?is)<a\b(?=[^>]*data-analytics-source-slot="' + $entry.placement + '_book_sample")[^>]*>.*?</a>').Value
        if ((Get-ContextualHtmlAttribute -Tag $sampleAnchor -Name 'href') -cne $sampleHref -or (Get-ContextualHtmlAttribute -Tag $sampleAnchor -Name 'data-analytics-path') -cne $samplePath) {
          throw "Fixture $($entry.key) must retain its exact sample destination and analytics path."
        }
        if ($entry.key -eq '2045') { Assert-Contains -Text $plain -Expected 'complete story' -Context '2045 standalone sample distinction' }
      }
    }
    Write-Host "Contextual-book tiny fixtures passed: $($cases.Count) cases, eight explicitly bound placements."
  }
  finally {
    $resolvedFixture = [IO.Path]::GetFullPath($fixture)
    if (-not $resolvedFixture.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolvedFixture) -notmatch '^oip-contextual-book-[a-f0-9]{32}$') { throw 'Refusing unsafe fixture cleanup path.' }
    if (Test-Path -LiteralPath $resolvedFixture -PathType Container) { Remove-Item -LiteralPath $resolvedFixture -Recurse -Force }
  }
}

function Test-SampleLinkDirectionFixtures {
  # This small Hugo fixture runs only with output checks, after CI installs Hugo.
  # It renders the real link partial without processing production assets.
  $hugoPath = $env:OIP_HUGO_BIN
  if (-not $hugoPath) {
    $localHugo = Join-Path $repoRoot '.tools/hugo-0.164.0/hugo'
    $hugoPath = if (Test-Path -LiteralPath $localHugo -PathType Leaf) { $localHugo } else { 'hugo' }
  }
  $fixture = Join-Path ([IO.Path]::GetTempPath()) ('oip-sample-directions-' + [guid]::NewGuid().ToString('N'))
  [void](New-Item -ItemType Directory -Path $fixture)
  try {
    foreach ($directory in @('layouts/partials/shop', 'layouts/_default', 'content/shop')) {
      [void](New-Item -ItemType Directory -Path (Join-Path $fixture $directory) -Force)
    }
    [IO.File]::WriteAllText((Join-Path $fixture 'hugo.toml'), 'baseURL = "https://fixture.invalid/"' + "`n" + 'disableKinds = ["taxonomy", "term", "RSS", "sitemap"]')
    Copy-Item -LiteralPath (Join-Path $repoRoot 'layouts/partials/shop/sample-link.html') -Destination (Join-Path $fixture 'layouts/partials/shop/sample-link.html')
    [IO.File]::WriteAllText((Join-Path $fixture 'layouts/partials/shop/resolve-reading-sample.html'), '{{ return (site.GetPage "/fixture-sample") }}')
    [IO.File]::WriteAllText((Join-Path $fixture 'layouts/_default/single.html'), '{{ .Title }}')
    [IO.File]::WriteAllText((Join-Path $fixture 'layouts/_default/list.html'), '{{ .Title }}')
    [IO.File]::WriteAllText((Join-Path $fixture 'content/fixture-sample.md'), "---`ntitle: Fixture story`n---`nA short fixture story.")
    foreach ($page in @(
      @{ Slug = 'inline'; Fields = 'book_key: fixture' },
      @{ Slug = 'standalone'; Fields = "book_key: fixture`nsample_page: /fixture-sample" },
      @{ Slug = '2045'; Fields = "book_key: `"2045`"`nsample_page: /fixture-sample" }
    )) {
      [IO.File]::WriteAllText((Join-Path $fixture "content/shop/$($page.Slug).md"), "---`ntitle: Fixture book`n$($page.Fields)`n---`n")
    }
    $cases = @(
      @{ Name = 'catalog'; Page = 'inline'; Fragment = 'false'; Href = '/shop/inline/#reading-sample'; Arrow = '→'; Path = '/shop/inline/' },
      @{ Name = 'detail'; Page = 'inline'; Fragment = 'true'; Href = '#reading-sample'; Arrow = '↓'; Path = '/shop/inline/' },
      @{ Name = 'standalone-override'; Page = 'standalone'; Fragment = 'true'; Href = '/fixture-sample/'; Arrow = '→'; Path = '/fixture-sample/' },
      @{ Name = '2045-unchanged'; Page = '2045'; Fragment = 'true'; Href = '/fixture-sample/'; Arrow = ''; Path = '/fixture-sample/' }
    )
    $template = foreach ($case in $cases) {
      '<section id="' + $case.Name + '">{{ partial "shop/sample-link.html" (dict "page" (site.GetPage "/shop/' + $case.Page + '") "fragmentOnly" ' + $case.Fragment + ' "sourceSlot" "' + $case.Name + '") }}</section>'
    }
    [IO.File]::WriteAllText((Join-Path $fixture 'layouts/index.html'), ($template -join "`n"))
    $buildOutput = & $hugoPath --source $fixture --panicOnWarning 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Sample-link fixture failed:`n$($buildOutput -join "`n")" }
    $html = Get-Content -LiteralPath (Join-Path $fixture 'public/index.html') -Raw -Encoding utf8
    foreach ($case in $cases) {
      $region = [regex]::Match($html, '(?s)<section id="' + $case.Name + '">(?<body>.*?)</section>').Groups['body'].Value
      foreach ($attribute in @(
        ('href="' + $case.Href + '"'),
        ('data-analytics-path="' + $case.Path + '"'),
        ('data-analytics-source-slot="' + $case.Name + '"')
      )) {
        Assert-Contains -Text $region -Expected $attribute -Context "Sample-link fixture $($case.Name)"
      }
      $label = [regex]::Match($region, '(?s)<a\b[^>]*>(?<text>.*?)</a>').Groups['text'].Value
      if ((Get-NormalizedHtmlText -Html $label) -cne 'Read a sample') {
        throw "Sample-link fixture $($case.Name) must use the concise sample action."
      }
      if ($case.Name -eq '2045-unchanged' -and (Get-NormalizedHtmlText -Html $region) -notmatch 'Fixture story.*complete story') {
        throw 'The 2045 sample must retain its complete-story distinction beside the action.'
      }
    }
  }
  finally {
    if (Test-Path -LiteralPath $fixture -PathType Container) { Remove-Item -LiteralPath $fixture -Recurse -Force }
  }
}

$waterNoteDefinition = '[^1]: **Maya drought caution**. NASA Earth Observatory summarizes research indicating that deforestation may have amplified naturally occurring drought. The source does not support a single-cause explanation of Maya collapse. [NASA Earth Observatory, *Mayan Deforestation and Drought*, February 1, 2012](https://science.nasa.gov/earth/earth-observatory/mayan-deforestation-and-drought-77060/). Accessed 2026-05-29. Caveat: This example offers a narrow historical caution, not a direct analogy to modern U.S. settlement.'

$sampleSpecs = @(
  [pscustomobject]@{
    Slug = 'the-american-nightmare-keep-dreaming-kid'
    BookKey = 'american_nightmare'
    Title = 'The American Nightmare: Keep Dreaming, Kid'
    SourceId = 'B0H37W2JK8'
    SourceChecked = '2026-10-03'
    EpubVersion = 'American Nightmare direct EPUB; original publication 2026-08-21; combined edition v1.7 dated 2026-10-03; includes public source ledger and claims-evidence appendix'
    Boundary = 'Preface; Prologue; Part I introduction; The Dream Was Not Immigration; first two paragraphs of Covenant, Household, and the Fear of Disorder; source notes 1-7'
    BodySha256 = '2e7aefbc200964af117017f207429435e5c35aea546c04d019e095c92fc26859'
    WordMin = 2500
    WordMax = 3300
    ParagraphCount = 63
    OpeningProbe = 'This book began as an essay about the American Dream. It became something larger because the phrase was carrying too much weight for one article to hold.'
    EndingProbe = 'The Puritan imagination did not begin with the self-made man. It began with covenant. A people crossed the water not to become whatever they wanted, but to form a disciplined commonwealth under divine judgment. In the sermon traditionally known as “A Model of Christian Charity,” John Winthrop warned that the new community would be like a city upon a hill. The eyes of the world would be upon it.[^7]'
    HeadingSignatures = @(
      '3:Preface: The Floor and the Door',
      '3:Prologue: Liberty Island, 1965',
      '3:Part I: The Dream Before the Break',
      '4:The Dream Was Not Immigration',
      '4:Covenant, Household, and the Fear of Disorder'
    )
    ExpectedNotes = [ordered]@{
      '1' = '[^1]: Viet Thanh Nguyen, “The Hidden Scars All Refugees Carry,” September 7, 2016, author archive of an essay originally published by *The New York Times*, https://vietnguyen.info/2016/the-hidden-scars-all-refugees-carry. Used here as a named post-1965 Vietnamese refugee countervoice; no direct quotation is used.'
      '2' = '[^2]: Lyndon B. Johnson, “Remarks at the Signing of the Immigration Bill, Liberty Island, New York,” October 3, 1965, The American Presidency Project, https://www.presidency.ucsb.edu/documents/remarks-the-signing-the-immigration-bill-liberty-island-new-york. Text checked against the American Presidency Project transcript for the skills/family language, “a nation of strangers,” “The days of unlimited immigration are past,” and the golden-door passage.'
      '3' = '[^3]: Benjamin Franklin, “Information to Those Who Would Remove to America,” 1782, Founders Constitution, University of Chicago Press, https://press-pubs.uchicago.edu/founders/documents/v1ch15s27.html.'
      '4' = '[^4]: Thomas Paine, *Common Sense*, 1776, https://www.ushistory.org/paine/commonsense/.'
      '5' = '[^5]: J. Hector St. John de Crèvecoeur, “What Is an American?” in *Letters from an American Farmer*, 1782, Avalon Project, Yale Law School, https://avalon.law.yale.edu/18th_century/letter_03.asp.'
      '6' = '[^6]: Naturalization Act of 1790, 1 Stat. 103. See National Archives and Founders-era legal collections.'
      '7' = '[^7]: John Winthrop, “A Model of Christian Charity,” 1630. A widely used text is available through the American Yawp Reader, https://www.americanyawp.com/reader/colliding-cultures/john-winthrop-dreams-of-a-city-on-a-hill-1630/.'
    }
    FigureIds = @()
    ForbiddenBoundaryPattern = '(?im)^#{3,6}\s+Land, Labor'
    OutputPath = 'shop/the-american-nightmare-keep-dreaming-kid/index.html'
    ExpectedDirectSku = 'OIP-AN-EPUB'
  },
  [pscustomobject]@{
    Slug = 'the-parable-of-the-sheep'
    BookKey = 'parable_of_the_sheep'
    Title = 'The Parable of the Sheep'
    SourceId = 'B0GN18LLWB'
    SourceChecked = '2026-09-02'
    EpubVersion = 'published Parable direct EPUB; release-ready R1'
    Boundary = 'The Shepherd and the Flock; The Plentiful Land; stop before The End of History'
    BodySha256 = 'f9d6e9e84943022bc524e485075ae92d48b042060facbdfc71999a9f4d559adf'
    WordMin = 500
    WordMax = 1000
    ParagraphCount = 34
    OpeningProbe = 'In the first warmth of spring, when the mud still held the hoofprints of winter and grass had that bright young color that makes even a tired old animal feel young again, a flock of sheep grazed in a wide and generous land.'
    EndingProbe = 'A sheep does not recognize limits. For sheep, tomorrow is tomorrow is tomorrow is tomorrow. Today is today, and yesterday is not.'
    HeadingSignatures = @(
      '3:The Shepherd and the Flock',
      '3:The Plentiful Land'
    )
    ExpectedNotes = [ordered]@{}
    FigureIds = @()
    ForbiddenBoundaryPattern = '(?im)^#{3,6}\s+The End of History'
    OutputPath = 'shop/the-parable-of-the-sheep/index.html'
    ExpectedDirectSku = 'OIP-PS-EPUB'
  },
  [pscustomobject]@{
    Slug = 'the-water-cycle'
    BookKey = 'the_water_cycle'
    Title = 'The Water Cycle: Risk, Infrastructure, and Public Memory'
    SourceId = 'B0H46WMGJQ'
    SourceChecked = '2026-10-03'
    EpubVersion = 'Water Cycle Reader R2; corrected 2026-10-03; focused text and figure-label correction'
    Boundary = 'Complete published prologue, including figures V01-V03 and narrative note 1'
    BodySha256 = 'b83129726e67d91247edf197b7f33ea117e0c101bf09057b6038b14a46d433ed'
    WordMin = 1800
    WordMax = 2300
    ParagraphCount = 33
    OpeningProbe = 'Many early settlements grew near reliable water.'
    EndingProbe = 'Water is good and dangerous at the same time. The river that feeds can flood. The harbor that enriches can expose. The aquifer that sustains can decline. The pipe that protects can overflow. The reservoir that secures a city can reveal absence. The same thing that made settlement possible keeps asking for public honesty.'
    HeadingSignatures = @(
      '3:Prologue: A Beach House in Idaho',
      '4:Water at the Center',
      '4:The Mental Map Changes',
      '4:A Beach House in Idaho',
      '4:The River Enters the Paperwork'
    )
    ExpectedNotes = [ordered]@{
      '1' = $waterNoteDefinition
    }
    FigureIds = @('V01', 'V02', 'V03')
    ForbiddenBoundaryPattern = '(?im)^#{3,6}\s+Part\s+(?:I|1)\b'
    OutputPath = 'shop/the-water-cycle/index.html'
    ExpectedDirectSku = 'OIP-WC-EPUB'
  }
)

$placeholderFields = @(
  'EpubVersion',
  'BodySha256',
  'ParagraphCount',
  'OpeningProbe',
  'EndingProbe'
)
$unresolvedPlaceholders = [Collections.Generic.List[string]]::new()
foreach ($spec in $sampleSpecs) {
  foreach ($field in $placeholderFields) {
    $value = [string]$spec.$field
    if ($value -match '^__[A-Z0-9_]+__$') {
      $unresolvedPlaceholders.Add($value)
    }
  }
  foreach ($definition in $spec.ExpectedNotes.Values) {
    if ([string]$definition -match '^__[A-Z0-9_]+__$') {
      $unresolvedPlaceholders.Add([string]$definition)
    }
  }
}
if ($unresolvedPlaceholders.Count -gt 0) {
  throw "Unresolved final-EPUB reading-sample fixtures: $($unresolvedPlaceholders -join ', ')"
}

$expectedSamplePaths = @(
  $sampleSpecs |
    ForEach-Object { "content/shop/$($_.Slug)/sample.md" } |
    Sort-Object
)
$samplePaths = @(
  Get-ChildItem -LiteralPath (Join-Path $repoRoot 'content/shop') -Recurse -File -Filter 'sample.md' |
    ForEach-Object { [IO.Path]::GetRelativePath($repoRoot, $_.FullName).Replace('\', '/') } |
    Where-Object { $_ -ne 'content/shop/2045/sample.md' } |
    Sort-Object
)
if (($samplePaths -join '|') -cne ($expectedSamplePaths -join '|')) {
  throw "Expected exactly the three approved reading-sample resources. Found: $($samplePaths -join ', ')"
}

$requiredFrontMatterKeys = @(
  'title',
  'draft',
  'sample_source',
  'sample_source_id',
  'sample_source_checked',
  'sample_epub_version',
  'sample_boundary',
  'sample_release_status'
)
$documents = [ordered]@{}

foreach ($spec in $sampleSpecs) {
  $legacyPath = "content/shop/$($spec.Slug).md"
  if (Test-Path -LiteralPath (Join-Path $repoRoot $legacyPath)) {
    throw "Legacy flat product page remains after leaf-bundle conversion: $legacyPath"
  }

  $indexRelativePath = "content/shop/$($spec.Slug)/index.md"
  $indexText = Get-RequiredText -RelativePath $indexRelativePath
  Assert-Contains -Text $indexText -Expected ('book_key: "' + $spec.BookKey + '"') -Context $indexRelativePath
  Assert-Contains -Text $indexText -Expected ('slug: "' + $spec.Slug + '"') -Context $indexRelativePath

  $sampleRelativePath = "content/shop/$($spec.Slug)/sample.md"
  $document = Get-SampleDocument -RelativePath $sampleRelativePath -RequiredKeys $requiredFrontMatterKeys
  $documents[$spec.Slug] = $document

  if ($document.Fields.title -cne 'Reading sample') {
    throw "$sampleRelativePath title must remain Reading sample."
  }
  if ($document.Fields.draft -cne 'false') {
    throw "$sampleRelativePath must set draft:false for the approved public teaser."
  }
  if ($document.Fields.sample_source -cne 'final_epub') {
    throw "$sampleRelativePath must identify the final EPUB as its source."
  }
  if ($document.Fields.sample_source_id -cne $spec.SourceId) {
    throw "$sampleRelativePath uses the wrong public title identifier."
  }
  if ($document.Fields.sample_source_checked -cne $spec.SourceChecked) {
    throw "$sampleRelativePath source verification date differs from the approved fixture."
  }
  if ($document.Fields.sample_epub_version -cne $spec.EpubVersion) {
    throw "$sampleRelativePath source revision differs from the approved final EPUB."
  }
  if ($document.Fields.sample_boundary -cne $spec.Boundary) {
    throw "$sampleRelativePath excerpt boundary differs from the approved fixture."
  }
  if ($document.Fields.sample_release_status -cne 'ready') {
    throw "$sampleRelativePath must use sample_release_status:ready for public rendering."
  }
  if ($document.FrontMatter -match '(?m)^sample_release_blockers\s*:') {
    throw "$sampleRelativePath retains release blockers after ready-state promotion."
  }
  if ($document.FrontMatter -match 'FINAL_EPUB_ARTIFACT_ABSENT|POSTASSIGNMENT_FINAL_QA_PASS_ABSENT|KINDLE_EPUB_PARITY_UNCONFIRMED|KDP_SELECT_CLEARANCE_UNCONFIRMED|PUBLICATION_APPROVAL_PENDING|_RECHECK_PENDING') {
    throw "$sampleRelativePath retains a blocked or pending release token."
  }

  $body = $document.Body
  $wordCount = Get-ProseWordCount -Markdown $body
  if ($wordCount -lt $spec.WordMin -or $wordCount -gt $spec.WordMax) {
    throw "$sampleRelativePath contains $wordCount prose words; expected $($spec.WordMin) through $($spec.WordMax)."
  }
  $bodyDigest = Get-NormalizedBodyDigest -Body $body
  if ($bodyDigest -cne $spec.BodySha256) {
    throw "$sampleRelativePath differs from the normalized final-EPUB fixture."
  }
  if ($body -match '(?m)^#{1,2}\s+' -or $body -match '(?i)<h1\b') {
    throw "$sampleRelativePath must reserve h1 and h2 for the product page and reading-sample container."
  }
  if ($body -match '(?m)^\x60\x60\x60' -or $body -match '(?is)<\/?[A-Za-z][^>]*>') {
    throw "$sampleRelativePath must contain Markdown only, with no fenced code or raw HTML."
  }
  if ($body -match '(?i)<\/?(?:script|iframe|form|input|button)\b|data-(?:analytics|checkout)|checkout_(?:url|endpoint)|square\.link|checkout\.square\.site') {
    throw "$sampleRelativePath contains executable or checkout markup/data."
  }
  if ($body -match '(?i)You are viewing|Go to the store|Enjoying this sample|Buy now with 1-Click|Kindle reader|Amazon\.com review') {
    throw "$sampleRelativePath contains reader or storefront interface copy."
  }
  if ($document.Text -match '(?i)LLC_PRIVATE_ROOT|outside-in-llc-management-private|file://|[A-Z]:\\|/Users/|/home/|AppData|sha(?:-?256)?\s*[:=]|fulfillment|order[_ -]?id') {
    throw "$sampleRelativePath exposes private, machine-local, digest, or fulfillment metadata."
  }

  $actualHeadingSignatures = @(
    [regex]::Matches($body, '(?m)^(?<marks>#{3,6})\s+(?<heading>.+?)\s*$') |
      ForEach-Object { "$($_.Groups['marks'].Value.Length):$($_.Groups['heading'].Value)" }
  )
  if (($actualHeadingSignatures -join '|') -cne ($spec.HeadingSignatures -join '|')) {
    throw "$sampleRelativePath heading levels or text differ from the approved fixture: $($actualHeadingSignatures -join ' | ')"
  }
  if ($body -match $spec.ForbiddenBoundaryPattern) {
    throw "$sampleRelativePath extends beyond its approved excerpt boundary."
  }

  $definitionMatches = @([regex]::Matches($body, '(?m)^\[\^(?<id>[^]]+)\]:(?<definition>.*)$'))
  $definitionIds = @($definitionMatches | ForEach-Object { $_.Groups['id'].Value })
  $expectedNoteIds = @($spec.ExpectedNotes.Keys)
  if (($definitionIds -join '|') -cne ($expectedNoteIds -join '|')) {
    throw "$sampleRelativePath footnote definitions differ from the approved IDs: $($definitionIds -join ', ')"
  }

  $firstDefinitionIndex = if ($definitionMatches.Count -gt 0) { $definitionMatches[0].Index } else { $body.Length }
  $proseBody = $body.Substring(0, $firstDefinitionIndex)
  $referenceIds = @(
    [regex]::Matches($proseBody, '\[\^(?<id>[^]]+)\]') |
      ForEach-Object { $_.Groups['id'].Value } |
      Sort-Object -Unique
  )
  if (($referenceIds -join '|') -cne ($expectedNoteIds -join '|')) {
    throw "$sampleRelativePath inline footnote references differ from the approved IDs: $($referenceIds -join ', ')"
  }
  foreach ($noteId in $expectedNoteIds) {
    $expectedDefinition = [string]$spec.ExpectedNotes[$noteId]
    if (@([regex]::Matches($body, '(?m)^' + [regex]::Escape($expectedDefinition) + '\r?$')).Count -ne 1) {
      throw "$sampleRelativePath note $noteId differs from the approved final-EPUB fixture."
    }
  }

  $paragraphs = @(
    [regex]::Split($proseBody, '\r?\n\s*\r?\n') |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ -and $_ -notmatch '^(?:#{3,6}|\{\{<)' }
  )
  if ($paragraphs.Count -ne [int]$spec.ParagraphCount) {
    throw "$sampleRelativePath must contain $($spec.ParagraphCount) approved prose paragraphs; found $($paragraphs.Count)."
  }
  if ($paragraphs.Count -eq 0 -or $paragraphs[0] -cne $spec.OpeningProbe) {
    throw "$sampleRelativePath does not begin with the approved final-EPUB paragraph."
  }
  if ($paragraphs[-1] -cne $spec.EndingProbe) {
    throw "$sampleRelativePath does not end at the approved final-EPUB boundary."
  }
}

$expectedFigures = [ordered]@{
  V01 = [ordered]@{
    asset = 'essays/the-water-cycle/sample/v01-water-city-plate'
    alt = 'Ink-and-watercolor scene of an early settlement beside water, with small details suggesting food, transport, trade, power, waste removal, and civic life.'
    caption = 'Figure 1. Water was the first reason to build. Many early settlements grew near reliable water because water supported food, transport, trade, power, waste removal, settlement, and defense.'
    width = 1600
    height = 1067
    alias = '/images/essays/the-water-cycle/sample/v01-water-city-plate.png'
  }
  V02 = [ordered]@{
    asset = 'essays/the-water-cycle/sample/v02-waterway-rail-shift'
    alt = 'Projected Northeast frame overlaying blue solid navigable waterways and rust dashed rail corridors from the fixed samples.'
    caption = 'Figure 2. Water routes and rail corridors. The railroad did not erase water. It made water easier to ignore by changing the public mental map of distance and settlement.'
    width = 1600
    height = 1120
    alias = '/images/essays/the-water-cycle/sample/v02-waterway-rail-shift.png'
  }
  V03 = [ordered]@{
    asset = 'essays/the-water-cycle/sample/v03-idaho-nfip-claim-records'
    alt = 'Projected Idaho county-outline map with proportional circles for NFIP claim-record counts and labels for the four largest displayed totals.'
    caption = 'Figure 3. Idaho NFIP claim records by county. Inland is not outside the water cycle.'
    width = 1600
    height = 1385
    alias = '/images/essays/the-water-cycle/sample/v03-idaho-nfip-claim-records.png'
  }
}

$manifest = Get-RequiredText -RelativePath 'data/image-assets.json' | ConvertFrom-Json -AsHashtable
$waterDocument = $documents['the-water-cycle']
$waterShortcodes = @([regex]::Matches($waterDocument.Body, '(?m)^\s*\{\{<\s*sample-figure\s+(?<params>.*?)\s*>\}\}\s*$'))
if ($waterShortcodes.Count -ne 3) {
  throw "Water Cycle sample must contain exactly three figures; found $($waterShortcodes.Count)."
}
$seenFigureIds = [Collections.Generic.List[string]]::new()
foreach ($shortcode in $waterShortcodes) {
  $parameters = @{}
  foreach ($parameter in [regex]::Matches($shortcode.Groups['params'].Value, '(?<name>[a-z]+)="(?<value>[^"]*)"')) {
    $parameters[$parameter.Groups['name'].Value] = $parameter.Groups['value'].Value
  }
  foreach ($required in @('id', 'asset', 'alt', 'caption')) {
    if (-not $parameters.ContainsKey($required) -or [string]::IsNullOrWhiteSpace($parameters[$required])) {
      throw "Water Cycle figure is missing nonempty $required."
    }
  }
  $id = [string]$parameters.id
  if (-not $expectedFigures.Contains($id)) { throw "Unexpected Water Cycle figure ID: $id" }
  $expected = $expectedFigures[$id]
  foreach ($key in @('asset', 'alt', 'caption')) {
    if ([string]$parameters[$key] -cne [string]$expected[$key]) {
      throw "Water Cycle $id $key differs from the published R2 figure metadata."
    }
  }
  if (-not $manifest.assets.Contains([string]$expected.asset)) {
    throw "Water Cycle $id managed asset is missing."
  }
  $asset = $manifest.assets[[string]$expected.asset]
  if ([string]$asset.review_state -cne 'approved' -or [string]$asset.processing_state -cne 'derivative_capable') {
    throw "Water Cycle $id managed asset must be approved and derivative-capable."
  }
  if ([int]$asset.width -ne [int]$expected.width -or [int]$asset.height -ne [int]$expected.height) {
    throw "Water Cycle $id managed asset dimensions differ from the published R2 figure."
  }
  if ([string]$manifest.aliases[[string]$expected.alias] -cne [string]$expected.asset) {
    throw "Water Cycle $id must retain exactly one stable resolver alias."
  }
  $seenFigureIds.Add($id)
}
if (($seenFigureIds -join '|') -cne 'V01|V02|V03') {
  throw "Water Cycle figures must remain ordered V01, V02, V03; found $($seenFigureIds -join ', ')."
}

foreach ($spec in $sampleSpecs | Where-Object { $_.Slug -ne 'the-water-cycle' }) {
  $document = $documents[$spec.Slug]
  if ($document.Body -match '\{\{[<%]\s*sample-figure\b') {
    throw "$($spec.Slug) must not contain a reading-sample figure."
  }
}
$shortcodeNames = @(
  $documents.Values |
    ForEach-Object { [regex]::Matches($_.Body, '\{\{[<%]\s*(?<name>[A-Za-z0-9_-]+)') } |
    ForEach-Object { $_.Groups['name'].Value } |
    Sort-Object -Unique
)
if (($shortcodeNames -join '|') -cne 'sample-figure') {
  throw "Reading samples may use only sample-figure; found $($shortcodeNames -join ', ')."
}

$review = Get-RequiredText -RelativePath 'reports/bookstore-reading-sample-visual-review.json' | ConvertFrom-Json -AsHashtable
if (
  [string]$review.status -cne 'pass' -or
  [string]$review.scope -cne 'reading-sample responsive figures' -or
  [string]$review.source_revision -cne 'published-r2'
) {
  throw 'Water Cycle figure visual-review evidence is missing its responsive published-R2 PASS.'
}
if (@($review.methods) -cnotcontains 'responsive browser inspection at 1440x1000 and 390x844') {
  throw 'Water Cycle figure visual-review evidence is missing responsive desktop/mobile inspection.'
}
$reviewIds = @($review.assets | ForEach-Object { [string]$_.id })
if (($reviewIds -join '|') -cne (@($expectedFigures.Values | ForEach-Object { [string]$_.asset }) -join '|')) {
  throw 'Water Cycle visual-review evidence does not cover exactly V01-V03.'
}
for ($index = 0; $index -lt $seenFigureIds.Count; $index++) {
  $id = $seenFigureIds[$index]
  $expected = $expectedFigures[$id]
  $manifestAsset = $manifest.assets[[string]$expected.asset]
  $reviewAsset = @($review.assets)[$index]
  if (
    [string]$reviewAsset.source_revision -cne 'published-r2' -or
    [string]$reviewAsset.result -cne 'pass' -or
    [string]$reviewAsset.responsive_result -cne 'pass'
  ) {
    throw "Water Cycle $id visual-review result is not bound to a responsive published-R2 PASS."
  }
  if (
    [int]$reviewAsset.width -ne [int]$expected.width -or
    [int]$reviewAsset.height -ne [int]$expected.height
  ) {
    throw "Water Cycle $id visual-review dimensions differ from the published R2 figure."
  }
  if ([string]$reviewAsset.source_sha256 -cne [string]$manifestAsset.sha256) {
    throw "Water Cycle $id visual-review evidence is not bound to the managed source bytes."
  }
  $sourcePath = Join-Path $repoRoot ('assets/' + [string]$manifestAsset.source)
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Water Cycle $id managed source file is missing."
  }
  if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne [string]$manifestAsset.sha256) {
    throw "Water Cycle $id managed source bytes differ from the reviewed figure."
  }
}

$resolver = Get-RequiredText -RelativePath 'layouts/partials/shop/resolve-reading-sample.html'
foreach ($required in @(
  '.Resources.GetMatch "sample.md"',
  'eq $state "ready"',
  'eq $state "local_draft"',
  'if .Draft',
  'if not .Draft',
  'if hugo.IsServer',
  'return $sample'
)) {
  Assert-Contains -Text $resolver -Expected $required -Context 'Reading-sample resolver'
}
Assert-Ordered -Text $resolver -First 'eq $state "ready"' -Second 'eq $state "local_draft"' -Context 'Reading-sample state precedence'
if ($resolver -match '(?i)buildDrafts|sample\.RelPermalink') {
  throw 'Reading-sample resolver must not use a broad draft bypass or expose a sample route.'
}

$sampleLink = Get-RequiredText -RelativePath 'layouts/partials/shop/sample-link.html'
foreach ($required in @(
  'partial "shop/resolve-reading-sample.html"',
  '#reading-sample',
  'data-analytics-event="book_sample_open"',
  'data-analytics-source-slot="{{ $sourceSlot }}"',
  'Read a sample'
)) {
  Assert-Contains -Text $sampleLink -Expected $required -Context 'Reading-sample link'
}
if ($sampleLink -match '(?i)sample\.RelPermalink|href\s*=\s*["''][^"'']*/sample(?:/|\.|["''])') {
  throw 'Reading-sample links must target the product-page fragment, never a sample route.'
}

$renderer = Get-RequiredText -RelativePath 'layouts/partials/shop/reading-sample.html'
foreach ($required in @(
  'id="reading-sample"',
  'aria-labelledby="reading-sample-title"',
  '{{ .Content }}',
  'End of sample',
  'where $epubOffers "availability_status" "live"',
  'href="#bookstore-purchase"',
  'data-analytics-source-slot="bookstore_sample_buy"',
  'href="#page-title"',
  'Return to the book',
  'partial "shop/kindle-button.html"',
  '"sourceSlot" "bookstore_sample_kindle"'
)) {
  Assert-Contains -Text $renderer -Expected $required -Context 'Expanded reading-sample renderer'
}
if ($renderer -match '(?i)<details\b|<dialog\b|<form\b|data-epub-checkout|shop/direct-offers\.html|modal|download=|sample\.RelPermalink') {
  throw 'Reading sample must stay expanded on the product page without modal, download, or separate-route behavior.'
}

$shopList = Get-RequiredText -RelativePath 'layouts/shop/list.html'
$shopSingle = Get-RequiredText -RelativePath 'layouts/shop/single.html'
foreach ($slot in @(
  @{ Text = $shopList; Value = 'bookstore_index_sample'; Context = 'Shop catalog' },
  @{ Text = $shopSingle; Value = 'bookstore_detail_sample'; Context = 'Shop detail' },
  @{ Text = $renderer; Value = 'bookstore_sample_buy'; Context = 'Post-sample direct offer' },
  @{ Text = $renderer; Value = 'bookstore_sample_kindle'; Context = 'Post-sample Kindle offer' }
)) {
  if ([regex]::Matches($slot.Text, [regex]::Escape($slot.Value)).Count -ne 1) {
    throw "$($slot.Context) must use $($slot.Value) exactly once."
  }
}
if ($shopList -match 'shop/(?:direct-offers|kindle-button)\.html|data-epub-checkout') {
  throw 'Catalog discovery cards must send purchase decisions to the product page.'
}
Assert-Contains -Text $shopList -Expected 'View book' -Context 'Catalog product-page action'
Assert-Ordered -Text $shopSingle -First '{{ .Content }}' -Second 'partial "shop/reading-sample.html"' -Context 'Product About/sample order'
Assert-Contains -Text $shopSingle -Expected 'id="page-title"' -Context 'Sample return target'

$figureTemplate = Get-RequiredText -RelativePath 'layouts/shortcodes/sample-figure.html'
foreach ($required in @(
  '.Get "asset"',
  '.Get "alt"',
  '.Get "caption"',
  '.Get "id"',
  'partial "images/model.html"',
  'ne $model.review_state "approved"',
  'partial "images/picture.html"',
  '<figcaption>'
)) {
  Assert-Contains -Text $figureTemplate -Expected $required -Context 'Managed sample-figure renderer'
}
if ($figureTemplate -match '(?i)<img\b|resources\.Get|static/images|\.Resources\.Get') {
  throw 'Sample figures must delegate to the approved responsive-image pipeline.'
}

$css = Get-RequiredText -RelativePath 'assets/css/main.css'
foreach ($required in @(
  'max-width:68ch;',
  'scroll-margin-top:1.5rem;',
  '.bookstore-reading-sample:target,',
  '.bookstore-reading-sample__body{',
  'line-height:1.72;',
  '.bookstore-reading-sample__figure{'
)) {
  Assert-Contains -Text $css -Expected $required -Context 'Reading-sample CSS'
}
foreach ($selector in @('bookstore-sample-link', 'bookstore-reading-sample')) {
  if ([regex]::Matches($css, ('(?m)^\.' + [regex]::Escape($selector) + '\{\r?$')).Count -ne 1) {
    throw "Reading-sample CSS must define .$selector as a valid top-level selector exactly once."
  }
}
if ($css -match '(?m)^\+\.') {
  throw 'Reading-sample CSS contains a literal diff-marker prefix before a selector.'
}

$homepageSampleMatches = @(
  Get-ChildItem -LiteralPath (Join-Path $repoRoot 'layouts') -Recurse -File -Include '*.html' |
    Where-Object { $_.FullName -match '[\\/](?:home|index)\.' -or $_.FullName -match '[\\/]index\.html$' } |
    Where-Object { (Get-Content -LiteralPath $_.FullName -Raw -Encoding utf8) -match 'bookstore_(?:home|shelf)' } |
    Where-Object { (Get-Content -LiteralPath $_.FullName -Raw -Encoding utf8) -match 'sample-link|book_sample_open' }
)
if ($homepageSampleMatches.Count -gt 0) {
  throw 'The compact homepage shelf must not include reading-sample links.'
}

$contextualEntries = @'
[
  {
    "source": "collections/technology-ai-machine-future.md",
    "route": "/collections/technology-ai-machine-future/",
    "placement": "collection",
    "key": "2045",
    "sku": "OIP-TD-EPUB",
    "book_path": "/shop/2045",
    "heading": "Continue with 2045",
    "connection": "Follow these questions about AI into fiction. 2045 brings together ten dark fables about machine intelligence, grief, ambition, faith, and the search for meaning.",
    "before": "collection-section__lead"
  },
  {
    "source": "essays/the-new-meta-economy.md",
    "route": "/essays/the-new-meta-economy/",
    "placement": "article",
    "key": "2045",
    "sku": "OIP-TD-EPUB",
    "book_path": "/shop/2045",
    "heading": "Continue with 2045",
    "connection": "This essay asks what happens when AI reshapes work, attention, and everyday life. 2045 explores those pressures through dark fables, beginning with a man surrounded by helpful machines and searching for a purpose.",
    "before": "reading-path"
  },
  {
    "source": "collections/household-economy-work-and-cost.md",
    "route": "/collections/household-economy-work-and-cost/",
    "placement": "collection",
    "key": "american_nightmare",
    "sku": "OIP-AN-EPUB",
    "book_path": "/shop/the-american-nightmare-keep-dreaming-kid",
    "heading": "Continue with The American Nightmare",
    "connection": "The pressures on a household are also questions about the American promise. The American Nightmare follows work, home, and citizenship through the gap between national opportunity and ordinary security.",
    "before": "collection-section__lead"
  },
  {
    "source": "essays/1929-2029-americas-century-of-humiliation.md",
    "route": "/essays/1929-2029-americas-century-of-humiliation/",
    "placement": "article",
    "key": "american_nightmare",
    "sku": "OIP-AN-EPUB",
    "book_path": "/shop/the-american-nightmare-keep-dreaming-kid",
    "heading": "Continue with The American Nightmare",
    "connection": "This essay traces a country’s success alongside the strain felt at home. The American Nightmare extends that inquiry into work, housing, citizenship, and the changing promise of the American Dream.",
    "before": "reading-path"
  },
  {
    "source": "collections/syd-and-oliver-dialogues.md",
    "route": "/collections/syd-and-oliver-dialogues/",
    "placement": "collection",
    "key": "parable_of_the_sheep",
    "sku": "OIP-PS-EPUB",
    "book_path": "/shop/the-parable-of-the-sheep",
    "heading": "Continue with The Parable of the Sheep",
    "connection": "Questions of truth, obligation, and shared life can take the form of a fable, too. The Parable of the Sheep follows a flock whose comfort outlasts its memory of what kept it safe.",
    "before": "collection-section__header"
  },
  {
    "source": "essays/dialogues/infrastructure.md",
    "route": "/syd-and-oliver/infrastructure/",
    "placement": "article",
    "key": "parable_of_the_sheep",
    "sku": "OIP-PS-EPUB",
    "book_path": "/shop/the-parable-of-the-sheep",
    "heading": "Continue with The Parable of the Sheep",
    "connection": "When care works, it can become easy to take the person behind it for granted. The Parable of the Sheep carries that question into a short allegory about a flock that forgets its shepherd.",
    "before": "reading-path"
  },
  {
    "source": "collections/floods-water-built-environment.md",
    "route": "/collections/floods-water-built-environment/",
    "placement": "collection",
    "key": "the_water_cycle",
    "sku": "OIP-WC-EPUB",
    "book_path": "/shop/the-water-cycle",
    "heading": "Continue with The Water Cycle",
    "connection": "Follow water risk beyond the flood map. The Water Cycle connects floodplains, infrastructure, insurance and public decisions in one illustrated book.",
    "preserve": true,
    "before": "collection-section__lead"
  },
  {
    "source": "essays/the-100-year-flood-is-not-what-you-think.md",
    "route": "/essays/the-100-year-flood-is-not-what-you-think/",
    "placement": "article",
    "key": "the_water_cycle",
    "sku": "OIP-WC-EPUB",
    "book_path": "/shop/the-water-cycle",
    "heading": "Continue with The Water Cycle",
    "connection": "Follow water risk beyond the flood map. The Water Cycle connects floodplains, infrastructure, insurance and public decisions in one illustrated book.",
    "preserve": true,
    "before": "reading-path"
  }
]
'@ | ConvertFrom-Json
$contextualSources = @($contextualEntries | ForEach-Object { 'content/' + $_.source })
$contextualBySource = @{}
foreach ($entry in $contextualEntries) { $contextualBySource['content/' + $entry.source] = $entry }
$declaredPromos = @()
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $repoRoot 'content') -Recurse -File -Filter '*.md') {
  $source = Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8
  $frontMatter = [regex]::Match($source, '(?s)\A---\r?\n(?<frontMatter>.*?)\r?\n---(?:\r?\n|$)').Groups['frontMatter'].Value
  if ($source -notmatch '(?i)book_promo') { continue }
  $relativePath = [IO.Path]::GetRelativePath($repoRoot, $file.FullName).Replace('\', '/')
  if ($relativePath -cnotin $contextualSources -or [regex]::Matches($source, '(?i)book_promo').Count -ne 1) {
    throw "Only the eight approved source front matters may declare book_promo; found $relativePath."
  }
  $promo = [regex]::Match($frontMatter, '(?m)^book_promo:\s*\r?\n(?<fields>(?:[ \t]+[^\r\n]*\r?\n?)+)')
  if (-not $promo.Success -or $frontMatter -match '(?im)^\s*cascade\s*:') {
    throw "$relativePath must use an explicit top-level book_promo without cascade."
  }
  $fields = $promo.Groups['fields'].Value
  $keys = @([regex]::Matches($fields, '(?m)^  ([a-z_]+):') | ForEach-Object { $_.Groups[1].Value } | Sort-Object)
  if (($keys -join '|') -cne 'book_path|connection|heading' -or [regex]::Matches($fields, '(?m)^\s*\S').Count -ne 3) {
    throw "$relativePath book_promo may only contain book_path, heading and connection."
  }
  $entry = $contextualBySource[$relativePath]
  foreach ($expected in @{ book_path = $entry.book_path; heading = $entry.heading; connection = $entry.connection }.GetEnumerator()) {
    $unindented = $fields -replace '(?m)^  ', ''
    if ((Get-FrontMatterValue -FrontMatter $unindented -Key $expected.Key -Context $relativePath) -cne $expected.Value) {
      throw "$relativePath book_promo $($expected.Key) differs from the approved scope."
    }
  }
  $declaredPromos += $relativePath
}
if ((($declaredPromos | Sort-Object) -join '|') -cne (($contextualSources | Sort-Object) -join '|')) {
  throw 'Exactly the eight approved Markdown front matters must opt in to contextual books.'
}
foreach ($file in @(
  Get-ChildItem -LiteralPath $repoRoot -File | Where-Object { $_.Name -match '^(?:hugo|config)\.(?:toml|ya?ml|json)$' }
  foreach ($directory in @('config', 'data')) {
    if (Test-Path -LiteralPath (Join-Path $repoRoot $directory)) {
      Get-ChildItem -LiteralPath (Join-Path $repoRoot $directory) -Recurse -File
    }
  }
)) {
  if ((Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8) -match '(?i)book_promo') {
    throw "Global, catalog and collection defaults must not declare book_promo: $($file.FullName)"
  }
}
$contextualPartial = Get-RequiredText -RelativePath 'layouts/partials/shop/contextual-book.html'
foreach ($required in @(
  'collections/floods-water-built-environment.md', 'essays/the-100-year-flood-is-not-what-you-think.md',
  '/collections/floods-water-built-environment/', '/essays/the-100-year-flood-is-not-what-you-think/',
  'readFile', 'transform.Unmarshal', 'isset $sourceParams "book_promo"',
  'shop/product-data.html', 'shop/sample-link.html', 'images/picture.html', 'OIP-WC-EPUB', 'the_water_cycle',
  'contextual-book__copy', 'contextual-book__cover', 'cover_image', 'cover_alt', '"loading" "lazy"',
  'printf "%s_book_cover" $placement',
  'price_display', 'permitted_geography', 'data-analytics-event="internal_promo_click"',
  'data-analytics-section="Bookstore"', 'View book and buying options'
)) { Assert-Contains -Text $contextualPartial -Expected $required -Context 'Contextual-book source contract' }
$allowedMap = [regex]::Match($contextualPartial, '(?s)\$allowed := dict(?<entries>.*?)\r?\n-\}\}').Groups['entries'].Value
$allowedLines = @([regex]::Matches($allowedMap, '(?m)^\s*"(?<source>[^"]+\.md)"(?<definition>[^\r\n]+)\r?$'))
if ((($allowedLines | ForEach-Object { $_.Groups['source'].Value } | Sort-Object) -join '|') -cne (($contextualEntries.source | Sort-Object) -join '|')) {
  throw 'The contextual partial must allow exactly the eight approved source files.'
}
foreach ($entry in $contextualEntries) {
  $definition = @($allowedLines | Where-Object { $_.Groups['source'].Value -ceq $entry.source })[0].Groups['definition'].Value
  foreach ($binding in @{ path = $entry.route; placement = $entry.placement; book_key = $entry.key }.GetEnumerator()) {
    Assert-Contains -Text $definition -Expected ('"' + $binding.Key + '" "' + $binding.Value + '"') -Context "Explicit source binding for $($entry.source)"
  }
  foreach ($required in @($entry.source, $entry.route, $entry.key, $entry.sku, $entry.book_path)) {
    Assert-Contains -Text $contextualPartial -Expected $required -Context 'Source-bound contextual book map'
  }
}
Assert-Ordered -Text $contextualPartial -First 'isset $catalog ' -Second 'partial "shop/product-data.html"' -Context 'Exact product membership before helper defaults'
if ($contextualPartial -match '(?i)safeHTML|<form\b|<img\b|<script\b|onclick|localStorage|sessionStorage|utm_|checkout_start|\$9\.99|U\.S\. customers|featured-book\.html|featured-continuation\.html') {
  throw 'Contextual books must use plain native links and catalog facts without adding commerce, storage or promotion defaults.'
}

if ($SourceOnly) {
  Write-Host 'Three-title bookstore reading-sample source contract passed.'
  exit 0
}
if (-not (Test-Path -LiteralPath $SiteDir -PathType Container)) {
  throw "Reading-sample output validation requires a built site at $SiteDir."
}
Test-SampleLinkDirectionFixtures
Test-ContextualBookFixtures

$contextualOutput = @($contextualEntries | ForEach-Object { $_.route.TrimStart('/') + 'index.html' })
$catalogSource = Get-RequiredText -RelativePath 'data/bookstore.yaml'
. (Join-Path $PSScriptRoot 'helpers/responsive_image_common.ps1')
foreach ($entry in $contextualEntries) {
  $outputPath = $entry.route.TrimStart('/') + 'index.html'
  $slug = ($entry.book_path -split '/')[-1]
  $bookPath = $entry.book_path + '/'
  $catalogFields = [regex]::Match($catalogSource, '(?ms)^  "?' + [regex]::Escape($entry.key) + '"?:\r?\n(?<fields>.*?)(?=^  [^\s]|\z)').Groups['fields'].Value
  $offerFields = [regex]::Match($catalogFields, '(?ms)^      - sku: "' + [regex]::Escape($entry.sku) + '"\r?\n(?<fields>.*?)(?=^      - sku:|\z)').Groups['fields'].Value -replace '(?m)^        ', ''
  $productFields = $catalogFields -replace '(?m)^    ', ''
  $expectedOfferFacts = @('format', 'price_display', 'currency', 'permitted_geography') | ForEach-Object {
    Get-FrontMatterValue -FrontMatter $offerFields -Key $_ -Context "$($entry.key) EPUB offer"
  }
  $expectedCover = Get-FrontMatterValue -FrontMatter $productFields -Key 'cover_image' -Context $entry.key
  $expectedCoverAlt = Get-FrontMatterValue -FrontMatter $productFields -Key 'cover_alt' -Context $entry.key
  $expectedTitle = Get-FrontMatterValue -FrontMatter $productFields -Key 'title' -Context $entry.key
  $expectedCoverName = 'View ' + $expectedTitle + ' and buying options'
  $productHtml = Get-Content -LiteralPath (Join-Path $SiteDir ($bookPath.TrimStart('/') + 'index.html')) -Raw -Encoding utf8
  $productCover = [regex]::Match($productHtml, '(?is)<figure\b[^>]*class=(?:"[^"]*\bbookstore-product__cover\b[^"]*"|bookstore-product__cover)[^>]*>(?<body>.*?)</figure>').Groups['body'].Value
  $canonicalImage = [regex]::Match($productCover, '(?is)<img\b[^>]*>').Value
  if (-not $canonicalImage) { throw "$($entry.key) product must retain its canonical rendered cover." }
  $expectedSrc = Get-ContextualHtmlAttribute -Tag $canonicalImage -Name 'src'
  if ($entry.key -eq '2045') {
    if ($expectedCover -cne 'books/2045/cover' -or (Get-ContextualHtmlAttribute -Tag $canonicalImage -Name 'data-oip-image-id') -cne $expectedCover) { throw '2045 must retain its exact managed catalog cover.' }
    $asset = $manifest.assets[$expectedCover]
    $prefix = '/images/rendered/' + $expectedCover + '/' + $asset.sha256.Substring(0, 12) + '/'
    if (-not $expectedSrc.StartsWith($prefix, [StringComparison]::Ordinal)) { throw '2045 cover must resolve to its managed source-hash derivatives.' }
  } elseif ($expectedSrc -cne $expectedCover) { throw "$($entry.key) must retain its exact static catalog cover." }
  $coverDimensions = Get-OipImageDimensions -Path (Join-Path $SiteDir $expectedSrc.TrimStart('/'))
  $html = Get-Content -LiteralPath (Join-Path $SiteDir $outputPath) -Raw -Encoding utf8
  $modules = @([regex]::Matches($html, '(?is)<aside\b[^>]*\bclass=(?:"[^"]*\bcontextual-book\b[^"]*"|contextual-book(?:\s|>))[^>]*>.*?</aside>'))
  if ($modules.Count -ne 1) { throw "$outputPath must contain exactly one contextual book aside." }
  $module = $modules[0].Value
  $headingId = 'contextual-book-' + $entry.placement + '-' + $slug
  if ([regex]::Matches($html, '\bid="?' + $headingId + '"?(?=\s|>)').Count -ne 1 -or $module -notmatch ('aria-labelledby="?' + $headingId + '"?(?=\s|>)')) {
    throw "$outputPath must have one unique, labelled contextual-book heading."
  }
  $plain = Get-NormalizedHtmlText -Html $module
  foreach ($probe in @($entry.heading, $entry.connection) + $expectedOfferFacts) { Assert-Contains -Text $plain -Expected $probe -Context $outputPath }
  if ([regex]::Matches($module, '<a\b').Count -ne 3 -or [regex]::Matches($module, '<img\b').Count -ne 1 -or $module -match '(?i)<form\b|<script\b|onclick=|target=|utm_|order_id|payment_id|download_token|email=|checkout_start') {
    throw "$outputPath must contain two text links and one native cover link without private fields."
  }
  foreach ($action in @('sample', 'detail', 'cover')) {
    $slot = $entry.placement + '_book_' + $action
    $event = if ($action -eq 'sample') { 'book_sample_open' } else { 'internal_promo_click' }
    $href = if ($action -eq 'sample') { if ($entry.key -eq '2045') { '/shop/2045/sample/' } else { $bookPath + '#reading-sample' } } else { $bookPath }
    $analyticsPath = if ($action -eq 'sample' -and $entry.key -eq '2045') { '/shop/2045/sample/' } else { $bookPath }
    $anchor = [regex]::Match($module, '(?is)<a\b(?=[^>]*data-analytics-source-slot="?' + $slot + '"?(?=\s|>))[^>]*>.*?</a>').Value
    foreach ($attribute in @{ href = $href; 'data-analytics-event' = $event; 'data-analytics-slug' = $slug; 'data-analytics-title' = $expectedTitle; 'data-analytics-section' = 'Bookstore'; 'data-analytics-path' = $analyticsPath }.GetEnumerator()) {
      if ((Get-ContextualHtmlAttribute -Tag $anchor -Name $attribute.Key) -cne $attribute.Value) { throw "$outputPath $slot has a missing or wrong $($attribute.Key)." }
    }
    if ($action -eq 'cover') {
      $image = [regex]::Match($anchor, '(?is)<img\b[^>]*>').Value
      if ([regex]::Matches($anchor, '<img\b').Count -ne 1 -or (Get-ContextualHtmlAttribute -Tag $anchor -Name 'aria-label') -cne $expectedCoverName) { throw "$outputPath must give its one linked cover the catalog accessible name." }
      foreach ($attribute in @{ src = $expectedSrc; alt = $expectedCoverAlt; width = [string]$coverDimensions.Width; height = [string]$coverDimensions.Height; loading = 'lazy'; decoding = 'async' }.GetEnumerator()) {
        if ((Get-ContextualHtmlAttribute -Tag $image -Name $attribute.Key) -cne $attribute.Value) { throw "$outputPath cover $($attribute.Key) must preserve the canonical catalog cover." }
      }
      if ($entry.key -eq '2045') {
        if ((Get-ContextualHtmlAttribute -Tag $image -Name 'data-oip-image-id') -cne $expectedCover -or [regex]::Matches($anchor, '<picture\b').Count -ne 1) { throw '2045 invitation must use its managed responsive cover.' }
        foreach ($type in @('image/avif', 'image/webp')) {
          $pattern = '(?is)<source\b(?=[^>]*\btype="?' + [regex]::Escape($type) + '"?(?=\s|>))[^>]*>'
          $source = [regex]::Match($anchor, $pattern).Value
          $canonicalSource = [regex]::Match($productCover, $pattern).Value
          if (-not $source -or (Get-ContextualHtmlAttribute -Tag $source -Name 'srcset') -cne (Get-ContextualHtmlAttribute -Tag $canonicalSource -Name 'srcset')) { throw "2045 invitation $type must retain canonical responsive candidates." }
        }
        if ([Math]::Abs(($coverDimensions.Width / $coverDimensions.Height) - ($asset.width / $asset.height)) -gt 0.001) { throw '2045 cover must preserve the source aspect ratio.' }
      }
    } else {
      $label = if ($action -eq 'sample') { 'Read a sample' } else { 'View book and buying options' }
      if ((Get-NormalizedHtmlText -Html $anchor) -cne $label) { throw "$outputPath $slot uses the wrong action label." }
    }
  }
  if ($module -notmatch '\d+ min read') { throw "$outputPath must retain calculated sample reading time." }
  if ($entry.key -eq '2045') {
    foreach ($probe in @('The Cracked Pot', 'complete story')) { Assert-Contains -Text $plain -Expected $probe -Context '2045 standalone sample distinction' }
    if (-not (Test-Path -LiteralPath (Join-Path $SiteDir 'shop/2045/sample/index.html') -PathType Leaf)) { throw '2045 sample destination must be published.' }
  }
  $before = $entry.before
  if ($entry.source -eq 'collections/syd-and-oliver-dialogues.md') {
    if ($html -match '\bcollection-section__lead\b|\bid="?collection-start-here-title"?(?=\s|>)') { throw 'The Syd and Oliver collection must retain its existing layout without Start Here.' }
    $header = [regex]::Match($html, '(?is)<header\b(?=[^>]*\bcollection-section__header\b)[^>]*>.*?</header>')
    if (-not $header.Success -or $header.Index + $header.Length -gt $html.IndexOf($module, [StringComparison]::Ordinal)) { throw 'The Syd and Oliver invitation must follow the complete collection header.' }
  }
  $after = if ($entry.placement -eq 'article') { 'article-publication-record' } else { 'collection-section__contents' }
  Assert-Ordered -Text $html -First $before -Second $module -Context "$outputPath primary reading path"
  Assert-Ordered -Text $html -First $module -Second $after -Context "$outputPath continuation placement"
}
foreach ($file in Get-ChildItem -LiteralPath $SiteDir -Recurse -File -Filter '*.html') {
  $relativePath = [IO.Path]::GetRelativePath($SiteDir, $file.FullName).Replace('\', '/')
  if ($relativePath -cin $contextualOutput) { continue }
  if ((Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8) -match '(?i)<aside\b[^>]*\bcontextual-book\b|data-analytics-source-slot="?(?:article|collection)_book_(?:sample|detail|cover)') {
    throw "Contextual-book module leaked outside its eight approved pages: $relativePath"
  }
}

$outputPaths = @('index.html', 'shop/index.html') + @($sampleSpecs | ForEach-Object { $_.OutputPath })
$output = [ordered]@{}
foreach ($relativePath in $outputPaths) {
  $fullPath = Join-Path $SiteDir $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Existing bookstore route changed or disappeared: public/$relativePath"
  }
  $output[$relativePath] = Get-Content -LiteralPath $fullPath -Raw -Encoding utf8
}

$homeHtml = [string]$output['index.html']
$catalogHtml = [string]$output['shop/index.html']
$detailHtmlValues = @($sampleSpecs | ForEach-Object { [string]$output[$_.OutputPath] })
$combinedDetails = $detailHtmlValues -join [Environment]::NewLine

$homeLaunchStrips = @([regex]::Matches($homeHtml, '(?is)<section\b[^>]*\bdata-home-2045-launch(?:=|\s|>).*?</section>'))
if ($homeLaunchStrips.Count -gt 1) {
  throw 'The homepage rendered more than one 2045 launch strip.'
}
$homeWithoutLaunchStrip = $homeHtml
if ($homeLaunchStrips.Count -eq 1) {
  $launchStrip = $homeLaunchStrips[0]
  if ($launchStrip.Value -notmatch '(?is)<a\b(?=[^>]*\bhref="?/shop/2045/sample/"?)(?=[^>]*\bdata-analytics-event="?book_sample_open"?)(?=[^>]*\bdata-analytics-source-slot="?homepage_2045_launch_sample"?)[^>]*>\s*Read a complete story\s*</a>') {
    throw 'The temporary 2045 launch strip must contain its one approved complete-story link.'
  }
  $homeWithoutLaunchStrip = $homeHtml.Remove($launchStrip.Index, $launchStrip.Length)
}
if ($homeWithoutLaunchStrip -match '(?i)book_sample_open|#reading-sample|bookstore_(?:index|detail)_sample|bookstore-reading-sample') {
  throw 'Reading-sample links or expanded excerpts leaked into the production homepage outside the temporary 2045 launch strip.'
}

$standalone2045 = Test-Path -LiteralPath (Join-Path $SiteDir 'shop/2045/sample/index.html') -PathType Leaf
if ([regex]::Matches($catalogHtml, 'data-analytics-source-slot="?bookstore_index_sample"?', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore catalog must expose exactly three shelf reading-sample links.'
}
if ([regex]::Matches($catalogHtml, 'data-analytics-source-slot="?bookstore_feature_sample"?', 'IgnoreCase').Count -ne [int]$standalone2045) {
  throw 'Built bookstore catalog must expose exactly one featured reading-sample link when the 2045 sample is published, otherwise none.'
}
if ([regex]::Matches($combinedDetails, 'data-analytics-source-slot="?bookstore_detail_sample"?(?=\s|>)', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore details must expose exactly three reading-sample fragment links.'
}
if ([regex]::Matches($combinedDetails, '\bid="?reading-sample"?(?:\s|>)', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore details must expose exactly three expanded reading-sample sections.'
}
if ([regex]::Matches($combinedDetails, 'data-analytics-source-slot="?bookstore_sample_buy"?(?=\s|>)', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore details must expose exactly three post-sample direct-EPUB continuation offers.'
}
if ($combinedDetails -match 'data-analytics-source-slot="?bookstore_sample_kindle"?') {
  throw 'Post-sample Kindle fallback rendered even though all three direct EPUB offers are live.'
}

foreach ($spec in $sampleSpecs) {
  $slug = [regex]::Escape([string]$spec.Slug)
  $catalogAnchorPattern = '(?is)<a(?=[^>]*\bhref="?(?:https://outsideinprint\.org)?/shop/' + $slug + '/#reading-sample"?)(?=[^>]*data-analytics-event="?book_sample_open"?)(?=[^>]*data-analytics-source-slot="?bookstore_index_sample"?)(?=[^>]*data-analytics-slug="?' + $slug + '"?)[^>]*>'
  if ([regex]::Matches($catalogHtml, $catalogAnchorPattern).Count -ne 1) {
    throw "Built catalog sample link is missing or duplicated for $($spec.Slug)."
  }
  $catalogAnchor = [regex]::Match($catalogHtml, $catalogAnchorPattern + '.*?</a>').Value
  if ((Get-NormalizedHtmlText -Html $catalogAnchor) -cne 'Read a sample') {
    throw "Built catalog sample action must read Read a sample for $($spec.Slug)."
  }

  $detailHtml = [string]$output[$spec.OutputPath]
  $detailAnchorPattern = '(?is)<a(?=[^>]*\bhref="?#reading-sample"?)(?=[^>]*data-analytics-event="?book_sample_open"?)(?=[^>]*data-analytics-source-slot="?bookstore_detail_sample"?)(?=[^>]*data-analytics-slug="?' + $slug + '"?)[^>]*>'
  if ([regex]::Matches($detailHtml, $detailAnchorPattern).Count -ne 1) {
    throw "Built detail sample link is missing or duplicated for $($spec.Slug)."
  }
  $detailAnchor = [regex]::Match($detailHtml, $detailAnchorPattern + '.*?</a>').Value
  if ((Get-NormalizedHtmlText -Html $detailAnchor) -cne 'Read a sample') {
    throw "Built detail sample action must read Read a sample for $($spec.Slug)."
  }
  if ([regex]::Matches($detailHtml, '\bid="?reading-sample"?(?:\s|>)', 'IgnoreCase').Count -ne 1) {
    throw "Built detail must contain one expanded reading sample for $($spec.Slug)."
  }
  if ([regex]::Matches($detailHtml, 'data-analytics-source-slot="?bookstore_sample_buy"?(?=\s|>)', 'IgnoreCase').Count -ne 1) {
    throw "Built detail must contain one direct continuation offer for $($spec.Slug)."
  }

  $sampleStart = [regex]::Match($detailHtml, '\bid="?reading-sample"?(?:\s|>)', 'IgnoreCase')
  $sampleEnd = $detailHtml.IndexOf('</section>', $sampleStart.Index, [StringComparison]::OrdinalIgnoreCase)
  if (-not $sampleStart.Success -or $sampleEnd -lt 0) {
    throw "Built detail $($spec.Slug) must expose the complete reading section."
  }
  $sampleRegion = $detailHtml.Substring($sampleStart.Index, $sampleEnd - $sampleStart.Index)
  if ([regex]::Matches($sampleRegion, 'data-analytics-source-slot="?bookstore_sample_buy"?(?=\s|>)', 'IgnoreCase').Count -ne 1) {
    throw "Built detail $($spec.Slug) must place one direct continuation offer inside the sample section."
  }
  if ($sampleRegion -match '<form\b|data-epub-checkout|bookstore-checkout-disclosure') {
    throw "Built sample $($spec.Slug) must return to the single product checkout, without a duplicate form."
  }
  if ($sampleRegion -notmatch '<a\b(?=[^>]*href="?#bookstore-purchase"?)(?=[^>]*data-analytics-source-slot="?bookstore_sample_buy"?)[^>]*>') {
    throw "Built sample $($spec.Slug) must link to its product purchase anchor."
  }
  if ($sampleRegion -notmatch '<a\b[^>]*href="?#page-title"?[^>]*>\s*Return to the book\b.*?</a>') {
    throw "Built sample $($spec.Slug) must provide a return-to-book link."
  }
  Assert-Contains -Text $sampleRegion -Expected 'End of sample' -Context "Built detail $($spec.Slug)"
  $sampleEndIndex = $sampleRegion.IndexOf('End of sample', [StringComparison]::Ordinal)
  $sampleDirectMatch = [regex]::Match($sampleRegion, 'data-analytics-source-slot="?bookstore_sample_buy"?(?=\s|>)', 'IgnoreCase')
  if ($sampleEndIndex -lt 0 -or -not $sampleDirectMatch.Success -or $sampleEndIndex -ge $sampleDirectMatch.Index) {
    throw "Built detail $($spec.Slug) must place the direct EPUB continuation after the excerpt end marker."
  }

  $normalizedDetail = Get-NormalizedHtmlText -Html $detailHtml
  foreach ($probe in @([string]$spec.OpeningProbe, [string]$spec.EndingProbe)) {
    $renderedProbe = [regex]::Replace($probe, '\[\^[^]]+\]', '')
    if (-not $normalizedDetail.Contains($renderedProbe, [StringComparison]::Ordinal)) {
      throw "Built detail $($spec.Slug) is missing an approved sample prose boundary."
    }
  }
  foreach ($signature in $spec.HeadingSignatures) {
    $parts = $signature.Split(':', 2)
    $level = [int]$parts[0]
    $heading = $parts[1]
    $headingPattern = '(?is)<h' + $level + '\b[^>]*>\s*' + [regex]::Escape($heading) + '\s*</h' + $level + '>'
    if ([regex]::Matches([Net.WebUtility]::HtmlDecode($detailHtml), $headingPattern).Count -ne 1) {
      throw "Built detail $($spec.Slug) is missing heading signature $signature."
    }
  }

  if ($spec.Slug -eq 'the-water-cycle') {
    foreach ($id in $spec.FigureIds) {
      $assetId = [string]$expectedFigures[$id].asset
      if ($detailHtml -notmatch ('data-oip-image-id="?' + [regex]::Escape($assetId) + '"?(?:\s|>)')) {
        throw "Built Water Cycle sample is missing managed figure $id."
      }
    }
  }
  elseif ($detailHtml -match 'bookstore-reading-sample__figure') {
    throw "Built detail $($spec.Slug) unexpectedly contains a sample figure."
  }

  if ((Get-NormalizedHtmlText -Html $catalogHtml).Contains([string]$spec.OpeningProbe, [StringComparison]::Ordinal)) {
    throw "Sample prose leaked from $($spec.Slug) into the compact catalog."
  }
}

$sampleArtifacts = @(
  Get-ChildItem -LiteralPath (Join-Path $SiteDir 'shop') -Recurse -File |
    Where-Object { $_.Name -match '^sample(?:\.|$)' -or $_.DirectoryName -match '[\\/]sample$' } |
    Where-Object { [IO.Path]::GetRelativePath($SiteDir, $_.FullName).Replace('\', '/') -ne 'shop/2045/sample/index.html' }
)
if ($sampleArtifacts.Count -gt 0) {
  throw "Standalone sample artifacts were generated: $($sampleArtifacts.FullName -join ', ')"
}
foreach ($routeIndex in @('sitemap.xml', 'index.xml', 'shop/index.xml')) {
  $path = Join-Path $SiteDir $routeIndex
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    $text = Get-Content -LiteralPath $path -Raw -Encoding utf8
    if ($text -match '(?i)/shop/(?!2045/sample/)[^<"'']+/sample(?:/|\.|<|"|''|$)') {
      throw "Standalone reading-sample route leaked into public/$routeIndex."
    }
  }
}

Write-Host 'Three-title bookstore reading-sample source and production-output contract passed.'
exit 0
