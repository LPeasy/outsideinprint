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

$waterNoteDefinition = '[^1]: **Maya drought caution**. NASA Earth Observatory summarizes research indicating that deforestation may have amplified naturally occurring drought. The source does not support a single-cause explanation of Maya collapse. [NASA Earth Observatory, *Mayan Deforestation and Drought*, February 1, 2012](https://science.nasa.gov/earth/earth-observatory/mayan-deforestation-and-drought-77060/). Accessed 2026-05-29. Use as narrow historical caution, not as a direct analogy to modern U.S. settlement.'

$sampleSpecs = @(
  [pscustomobject]@{
    Slug = 'the-american-nightmare-keep-dreaming-kid'
    BookKey = 'american_nightmare'
    Title = 'The American Nightmare: Keep Dreaming, Kid'
    SourceId = 'B0H37W2JK8'
    SourceChecked = '2026-09-02'
    EpubVersion = 'published American Nightmare direct EPUB; 2026-08-21 edition metadata; post-assignment final QA'
    Boundary = 'Preface; Prologue; Part I introduction; The Dream Was Not Immigration; first two paragraphs of Covenant, Household, and the Fear of Disorder; source notes 1-7'
    BodySha256 = 'c6994770f7d8eeae9ab95b0f4a0075f199de7694479b7cdd3f9b6bdd305f0984'
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
    SourceChecked = '2026-09-02'
    EpubVersion = 'published Water Cycle reader edition R2'
    Boundary = 'Complete published prologue, including figures V01-V03 and narrative note 1'
    BodySha256 = '6e11094ebfc8565d17c894138d1ab33cca64828256366fa3f75e2ac98afb8314'
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
  'Read a free sample'
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
  'partial "shop/direct-offers.html"',
  '"sourceSlot" "bookstore_sample_direct"',
  '"collapseCheckout" true',
  '"headingLevel" 3',
  'partial "shop/kindle-button.html"',
  '"sourceSlot" "bookstore_sample_kindle"'
)) {
  Assert-Contains -Text $renderer -Expected $required -Context 'Expanded reading-sample renderer'
}
if ($renderer -match '(?i)<details\b|<dialog\b|modal|download=|sample\.RelPermalink') {
  throw 'Reading sample must stay expanded on the product page without modal, download, or separate-route behavior.'
}

$shopList = Get-RequiredText -RelativePath 'layouts/shop/list.html'
$shopSingle = Get-RequiredText -RelativePath 'layouts/shop/single.html'
foreach ($slot in @(
  @{ Text = $shopList; Value = 'bookstore_index_sample'; Context = 'Shop catalog' },
  @{ Text = $shopSingle; Value = 'bookstore_detail_sample'; Context = 'Shop detail' },
  @{ Text = $renderer; Value = 'bookstore_sample_direct'; Context = 'Post-sample direct offer' },
  @{ Text = $renderer; Value = 'bookstore_sample_kindle'; Context = 'Post-sample Kindle offer' }
)) {
  if ([regex]::Matches($slot.Text, [regex]::Escape($slot.Value)).Count -ne 1) {
    throw "$($slot.Context) must use $($slot.Value) exactly once."
  }
}
Assert-Ordered -Text $shopList -First 'partial "shop/kindle-button.html"' -Second 'partial "shop/sample-link.html"' -Context 'Catalog purchase/sample-link order'
Assert-Ordered -Text $shopSingle -First '{{ .Content }}' -Second 'partial "shop/reading-sample.html"' -Context 'Product About/sample order'
Assert-Ordered -Text $shopSingle -First 'partial "shop/reading-sample.html"' -Second 'bookstore-format-ledger' -Context 'Product sample/formats order'

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

if ($SourceOnly) {
  Write-Host 'Three-title bookstore reading-sample source contract passed.'
  exit 0
}
if (-not (Test-Path -LiteralPath $SiteDir -PathType Container)) {
  throw "Reading-sample output validation requires a built site at $SiteDir."
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

if ($homeHtml -match '(?i)book_sample_open|#reading-sample|bookstore_(?:index|detail)_sample|bookstore-reading-sample') {
  throw 'Reading-sample links or expanded excerpts leaked into production homepage output.'
}

if ([regex]::Matches($catalogHtml, 'data-analytics-source-slot="?bookstore_index_sample"?', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore catalog must expose exactly three reading-sample links.'
}
if ([regex]::Matches($combinedDetails, 'data-analytics-source-slot="?bookstore_detail_sample"?(?=\s|>)', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore details must expose exactly three reading-sample fragment links.'
}
if ([regex]::Matches($combinedDetails, '\bid="?reading-sample"?(?:\s|>)', 'IgnoreCase').Count -ne 3) {
  throw 'Built bookstore details must expose exactly three expanded reading-sample sections.'
}
if ([regex]::Matches($combinedDetails, 'data-analytics-source-slot="?bookstore_sample_direct"?(?=\s|>)', 'IgnoreCase').Count -ne 3) {
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

  $detailHtml = [string]$output[$spec.OutputPath]
  $detailAnchorPattern = '(?is)<a(?=[^>]*\bhref="?#reading-sample"?)(?=[^>]*data-analytics-event="?book_sample_open"?)(?=[^>]*data-analytics-source-slot="?bookstore_detail_sample"?)(?=[^>]*data-analytics-slug="?' + $slug + '"?)[^>]*>'
  if ([regex]::Matches($detailHtml, $detailAnchorPattern).Count -ne 1) {
    throw "Built detail sample link is missing or duplicated for $($spec.Slug)."
  }
  if ([regex]::Matches($detailHtml, '\bid="?reading-sample"?(?:\s|>)', 'IgnoreCase').Count -ne 1) {
    throw "Built detail must contain one expanded reading sample for $($spec.Slug)."
  }
  if ([regex]::Matches($detailHtml, 'data-analytics-source-slot="?bookstore_sample_direct"?(?=\s|>)', 'IgnoreCase').Count -ne 1) {
    throw "Built detail must contain one direct continuation offer for $($spec.Slug)."
  }

  $sampleStart = [regex]::Match($detailHtml, '\bid="?reading-sample"?(?:\s|>)', 'IgnoreCase')
  $formatStart = $detailHtml.IndexOf('bookstore-format-ledger', $sampleStart.Index, [StringComparison]::OrdinalIgnoreCase)
  if (-not $sampleStart.Success -or $formatStart -lt 0 -or $formatStart -le $sampleStart.Index) {
    throw "Built detail $($spec.Slug) must place the expanded sample before the format ledger."
  }
  $sampleRegion = $detailHtml.Substring($sampleStart.Index, $formatStart - $sampleStart.Index)
  if ([regex]::Matches($sampleRegion, 'data-analytics-source-slot="?bookstore_sample_direct"?(?=\s|>)', 'IgnoreCase').Count -ne 1) {
    throw "Built detail $($spec.Slug) must place one direct continuation offer inside the sample section."
  }
  Assert-Contains -Text $sampleRegion -Expected ([string]$spec.ExpectedDirectSku) -Context "Built post-sample offer $($spec.Slug)"
  Assert-Contains -Text $sampleRegion -Expected 'End of sample' -Context "Built detail $($spec.Slug)"
  $sampleEndIndex = $sampleRegion.IndexOf('End of sample', [StringComparison]::Ordinal)
  $sampleDirectMatch = [regex]::Match($sampleRegion, 'data-analytics-source-slot="?bookstore_sample_direct"?(?=\s|>)', 'IgnoreCase')
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
    Where-Object { $_.Name -match '^sample(?:\.|$)' -or $_.DirectoryName -match '[\\/]sample$' }
)
if ($sampleArtifacts.Count -gt 0) {
  throw "Standalone sample artifacts were generated: $($sampleArtifacts.FullName -join ', ')"
}
foreach ($routeIndex in @('sitemap.xml', 'index.xml', 'shop/index.xml')) {
  $path = Join-Path $SiteDir $routeIndex
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    $text = Get-Content -LiteralPath $path -Raw -Encoding utf8
    if ($text -match '(?i)/shop/[^<"'']+/sample(?:/|\.|<|"|''|$)') {
      throw "Standalone reading-sample route leaked into public/$routeIndex."
    }
  }
}

Write-Host 'Three-title bookstore reading-sample source and production-output contract passed.'
exit 0
