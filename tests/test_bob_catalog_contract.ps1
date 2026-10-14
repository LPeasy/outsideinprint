param([string]$FixtureRoot = '', [string]$HugoPath = '')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $HugoPath) { $HugoPath = if ($IsWindows) { Join-Path $repoRoot 'tools/bin/generated/hugo.cmd' } else { (Get-Command hugo -ErrorAction Stop).Source } }
if (-not $FixtureRoot) { $FixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-bob-catalog-' + [guid]::NewGuid().ToString('N')) }
if (Test-Path -LiteralPath $FixtureRoot) { throw "Fixture path must be new: $FixtureRoot" }
function Write-Fixture([string]$Path, [string]$Text) {
  $file = Join-Path $FixtureRoot $Path
  [IO.Directory]::CreateDirectory((Split-Path -Parent $file)) | Out-Null
  [IO.File]::WriteAllText($file, $Text, [Text.UTF8Encoding]::new($false))
}
function Assert-Contract([bool]$Value, [string]$Message) { if (-not $Value) { throw $Message } }
$version = & $HugoPath version
Assert-Contract ($LASTEXITCODE -eq 0 -and "$version" -match '^hugo v0\.167\.0') 'Pinned Hugo 0.167.0 is required.'
Write-Fixture 'hugo.toml' @'
baseURL = "https://outsideinprint.org/"
disableKinds = ["taxonomy", "term", "RSS", "sitemap"]
[outputFormats.BobCatalog]
mediaType = "application/json"
baseName = "catalog"
isPlainText = true
notAlternative = true
[outputs]
home = ["HTML"]
[permalinks]
essays = "/essays/:slug/"
'@
[IO.Directory]::CreateDirectory((Join-Path $FixtureRoot 'layouts')) | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot 'layouts/partials') -Destination (Join-Path $FixtureRoot 'layouts') -Recurse
Write-Fixture 'layouts/companion-bob/list.bobcatalog.json' ([IO.File]::ReadAllText((Join-Path $repoRoot 'layouts/companion-bob/list.bobcatalog.json')))
Write-Fixture 'content/companion-bob/_index.md' ([IO.File]::ReadAllText((Join-Path $repoRoot 'content/companion-bob/_index.md')))
Write-Fixture 'layouts/_default/single.html' '<!doctype html><title>{{ .Title }}</title>'
Write-Fixture 'layouts/_default/list.html' '<!doctype html><title>{{ .Title }}</title>'
$definitions = @('collections:')
foreach ($group in @('alpha','beta','gamma')) {
  $definitions += "  - slug: $group`n    title: $group collection`n    public: true`n    explicit_only: true"
  Write-Fixture "content/collections/$group.md" "---`ntitle: $group`ndate: 2020-01-01`n---"
  foreach ($number in 1..3) {
    $hero = if ($number -eq 1) { "featured_image: /fixture-hero.png`nfeatured_image_alt: Exact hero alt" } elseif ($number -eq 2) { "article_variant: modernbio`nfeatured_image: /fixture-hero.png`nportrait_image: /fixture-portrait.png`nportrait_image_alt: Exact portrait alt" } else { '' }
    Write-Fixture "content/essays/nested/$group-$number.md" "---`ntitle: $group piece $number`nslug: $group-$number`ndate: 2020-01-01`ncollections: [$group]`ndescription: Published summary $number`n$hero`n---`nA published piece."
  }
}
Write-Fixture 'data/collections.yaml' ($definitions -join "`n")
foreach ($case in @(
  @{Name='draft'; Extra='draft: true'},
  @{Name='future'; Extra='publishDate: 2099-01-01'},
  @{Name='expired'; Extra='expiryDate: 2001-01-01'},
  @{Name='private'; Extra='noindex: true'}
)) { Write-Fixture "content/essays/$($case.Name).md" "---`ntitle: $($case.Name)`ndate: 2000-01-01`ncollections: [alpha]`n$($case.Extra)`n---`nNot eligible." }
[IO.Directory]::CreateDirectory((Join-Path $FixtureRoot 'static')) | Out-Null
$pixel = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVJkAAAAASUVORK5CYII=')
foreach ($image in @('fixture-hero.png','fixture-portrait.png')) { [IO.File]::WriteAllBytes((Join-Path $FixtureRoot "static/$image"), $pixel) }
function Build-Catalog([string]$BaseURL = 'https://outsideinprint.org/') {
  & $HugoPath --source $FixtureRoot --destination (Join-Path $FixtureRoot 'public') --baseURL $BaseURL --buildDrafts --buildFuture --buildExpired --panicOnWarning --quiet
  Assert-Contract ($LASTEXITCODE -eq 0) 'Catalog fixture did not build.'
  return (Get-Content -LiteralPath (Join-Path $FixtureRoot 'public/companion-bob/catalog.json') -Raw | ConvertFrom-Json -Depth 30)
}
$first = Build-Catalog
Assert-Contract ($first.version -eq 1 -and $first.catalogVersion -match '^[a-f0-9]{64}$') 'Catalog schema/version is invalid.'
Assert-Contract ($first.items.Count -eq 9 -and $first.collections.Count -eq 3) 'Draft, future, expired, or private content leaked into the catalog.'
Assert-Contract (@($first.items | Where-Object { $_.id -notmatch '^/essays/(alpha|beta|gamma)-[123]/$' }).Count -eq 0) 'Canonical paths do not match public routes.'
Assert-Contract (@($first.items | Where-Object { $_.url -ne ('https://outsideinprint.org' + $_.id) }).Count -eq 0) 'Catalog URLs are not canonical.'
Assert-Contract (($first.items | Where-Object id -eq '/essays/alpha-1/').image.src -eq 'https://outsideinprint.org/fixture-hero.png') 'Hero source differs from article hero.'
Assert-Contract (($first.items | Where-Object id -eq '/essays/alpha-2/').image.alt -eq 'Exact portrait alt') 'Modern Bio portrait metadata was lost.'
Assert-Contract (($first.items | Where-Object id -eq '/essays/alpha-3/').image.src -eq '') 'Image-less pieces must not receive invented artwork.'
Assert-Contract (@($first.collections | Where-Object { $_.itemCount -ne 3 -or $_.itemIds.Count -ne 3 }).Count -eq 0) 'Collection membership/counts disagree.'
Write-Fixture 'content/essays/new-release.md' "---`ntitle: Newly published piece`nslug: newly-published-piece`ndate: 2020-01-02`ncollections: [alpha]`ndescription: New summary`n---`nNewly published text."
$second = Build-Catalog
Assert-Contract ($second.items.Count -eq 10 -and $second.catalogVersion -ne $first.catalogVersion) 'A new publication did not update the same-release catalog version.'
Assert-Contract (($second.collections | Where-Object id -eq 'alpha').itemIds -contains '/essays/newly-published-piece/') 'A new publication did not enter its real collection.'
$local = Build-Catalog 'http://127.0.0.1:8769/'
Assert-Contract ($local.catalogVersion -eq $second.catalogVersion) 'Loopback preview changed canonical catalog metadata/version.'
Assert-Contract (@($local.collections | Where-Object { $_.url -notlike 'https://outsideinprint.org/collections/*' }).Count -eq 0) 'Loopback preview leaked local collection URLs.'
[ordered]@{passed=$true;count=$second.items.Count;collections=$second.collections.Count;catalogVersion=$second.catalogVersion;localBaseURLCanonical=$true;fixture=$FixtureRoot} | ConvertTo-Json | Write-Output
