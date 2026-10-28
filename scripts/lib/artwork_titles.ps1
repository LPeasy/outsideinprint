function ConvertTo-OipArtworkTitleKey {
  param([Alias('Value')][AllowNull()][object]$Title)
  if ($null -eq $Title) { return '' }
  $plain = [Net.WebUtility]::HtmlDecode([string]$Title).Normalize([Text.NormalizationForm]::FormC)
  $plain = [regex]::Replace($plain, '\p{P}', ' ')
  return [regex]::Replace($plain, '\s+', ' ').Trim().ToLowerInvariant()
}

function Assert-OipArtworkTitle {
  param([Alias('Value')][AllowNull()][object]$Title, [string[]]$ArticleTitles = @(), [string]$Context = 'Artwork title')
  if ($Title -isnot [string] -or [string]::IsNullOrWhiteSpace($Title) -or
      $Title -match '[<>\p{Cc}\p{Zl}\p{Zp}]' -or $Title.Length -gt 200) {
    throw "$Context must be a nonempty plain-text string of at most 200 characters."
  }
  $key = ConvertTo-OipArtworkTitleKey -Title $Title
  if (-not $key) { throw "$Context must contain a meaningful title." }
  foreach ($articleTitle in $ArticleTitles) {
    if ($articleTitle -and $key -ceq (ConvertTo-OipArtworkTitleKey -Title $articleTitle)) {
      throw "$Context must be independent of the article title or short_title: $Title"
    }
  }
}

function Resolve-OipArtworkAssetId {
  param([AllowNull()][string]$Reference, [Parameter(Mandatory)][Collections.IDictionary]$Manifest)
  $ref = ([string]$Reference).Trim()
  if ($ref.StartsWith('oip-image:', [StringComparison]::Ordinal)) { $ref = $ref.Substring(10).Trim() }
  $lookupKeys = @($ref)
  if ($ref.StartsWith('/')) { $lookupKeys += $ref.Substring(1) }
  elseif ($ref.StartsWith('images/', [StringComparison]::Ordinal)) { $lookupKeys += '/' + $ref }
  foreach ($key in $lookupKeys) {
    if (@($Manifest.assets.Keys) -ccontains $key) { return $key }
    if (@($Manifest.aliases.Keys) -ccontains $key) { return [string]$Manifest.aliases[$key] }
  }
  return $null
}

function ConvertFrom-OipArtworkYamlScalar {
  param([AllowEmptyString()][string]$Value)
  $value = $Value.Trim()
  if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
    try { return [string]($value | ConvertFrom-Json) } catch { return $value.Substring(1, $value.Length - 2).Replace('\"', '"') }
  }
  if ($value.Length -ge 2 -and $value.StartsWith("'") -and $value.EndsWith("'")) { return $value.Substring(1, $value.Length - 2).Replace("''", "'") }
  return ([regex]::Replace($value, '\s+#.*$', '')).Trim()
}

function Read-OipArtworkFrontMatter {
  param([Parameter(Mandatory)][AllowEmptyString()][string]$Text)
  $result = [ordered]@{}
  $match = [regex]::Match($Text, '(?s)\A\uFEFF?---\r?\n(?<fm>.*?)\r?\n---(?:\r?\n|$)')
  if ($match.Success) {
    foreach ($line in ($match.Groups['fm'].Value -split '\r?\n')) {
      if ($line -match '^([A-Za-z0-9_]+):\s*(.*?)\s*$') { $result[$Matches[1].ToLowerInvariant()] = ConvertFrom-OipArtworkYamlScalar $Matches[2] }
    }
  }
  return $result
}

function Read-OipArtworkGallery {
  param([AllowEmptyString()][string]$Text = '')
  $entry = $null
  foreach ($line in ($Text -split '\r?\n')) {
    if ($line -match '^\s*-\s+slug:\s*(.*?)\s*$') {
      if ($null -ne $entry) { $entry }
      $entry = [ordered]@{ slug = ConvertFrom-OipArtworkYamlScalar $Matches[1] }
    } elseif ($null -ne $entry -and $line -match '^\s+([A-Za-z0-9_]+):\s*(.*?)\s*$') {
      $entry[$Matches[1]] = ConvertFrom-OipArtworkYamlScalar $Matches[2]
    }
  }
  if ($null -ne $entry) { $entry }
}

function Get-OipArtworkSourceRecords {
  param([Parameter(Mandatory)][string]$Root, [Collections.IDictionary]$Manifest, [Collections.IDictionary]$ContentTexts)
  if ($null -eq $Manifest) { $Manifest = [IO.File]::ReadAllText((Join-Path $Root 'data/image-assets.json')) | ConvertFrom-Json -AsHashtable }
  if ($null -eq $ContentTexts) {
    $ContentTexts = [ordered]@{}
    foreach ($section in @('essays', 'reports', 'working-papers', 'syd-and-oliver')) {
      $directory = Join-Path $Root "content/$section"
      if (-not [IO.Directory]::Exists($directory)) { continue }
      foreach ($file in Get-ChildItem -LiteralPath $directory -File -Filter '*.md' -Recurse) {
        $relative = [IO.Path]::GetRelativePath($Root, $file.FullName).Replace('\', '/')
        $ContentTexts[$relative] = [IO.File]::ReadAllText($file.FullName)
      }
    }
  }
  foreach ($path in $ContentTexts.Keys) {
    $sourcePath = ([string]$path).Replace('\', '/')
    $sectionMatch = [regex]::Match($sourcePath, '^content/(essays|reports|working-papers|syd-and-oliver)/')
    if (-not $sectionMatch.Success -or [IO.Path]::GetFileName($sourcePath) -eq '_index.md') { continue }
    $section = $sectionMatch.Groups[1].Value
    $fm = Read-OipArtworkFrontMatter -Text ([string]$ContentTexts[$path])
    if (-not $fm.Contains('featured_image') -or -not $fm['featured_image']) { continue }
    $assetId = Resolve-OipArtworkAssetId -Reference ([string]$fm['featured_image']) -Manifest $Manifest
    if (-not $assetId) { continue }
    $slug = if ($fm['slug']) { [string]$fm['slug'] } else { [IO.Path]::GetFileNameWithoutExtension($sourcePath) }
    $route = if ($fm['url']) { [string]$fm['url'] } else { "/$section/$slug/" }
    $draft = [string]$fm['draft'] -ieq 'true'
    $eligible = -not $draft
    foreach ($flag in @('private', 'noindex', 'redirect_to')) { if ($fm[$flag] -and [string]$fm[$flag] -ine 'false') { $eligible = $false } }
    [pscustomobject]@{
      AssetId = $assetId; Route = $route; SourcePath = $sourcePath
      ArticleTitle = [string]$fm['title']; ShortTitle = [string]$fm['short_title']
      Draft = $draft; PublicEligible = $eligible; Date = [string]$fm['date']; PublishDate = [string]$fm['publishdate']
    }
  }
}

function Get-OipArtworkTitleClaims {
  param([Parameter(Mandatory)][string]$Root, [Collections.IDictionary]$Manifest, [Collections.IDictionary]$ContentTexts, [AllowNull()][string]$GalleryText)
  if ($null -eq $Manifest) { $Manifest = [IO.File]::ReadAllText((Join-Path $Root 'data/image-assets.json')) | ConvertFrom-Json -AsHashtable }
  if (-not $PSBoundParameters.ContainsKey('GalleryText')) {
    $galleryPath = Join-Path $Root 'data/editorial_cartoons.yaml'
    $GalleryText = if ([IO.File]::Exists($galleryPath)) { [IO.File]::ReadAllText($galleryPath) } else { '' }
  }
  $entries = @(Read-OipArtworkGallery -Text $GalleryText)
  foreach ($id in $Manifest.assets.Keys) {
    $asset = $Manifest.assets[$id]
    if ($asset.Contains('artwork_title')) {
      [pscustomobject]@{ AssetId = [string]$id; Title = $asset['artwork_title']; Origin = 'Manifest'; Route = ''; SourcePath = ''; ArticleTitle = ''; ShortTitle = ''; ExplicitSlug = ''; Date = ''; PublishDate = '' }
    }
  }
  foreach ($entry in $entries) {
    $id = Resolve-OipArtworkAssetId -Reference ([string]$entry['image']) -Manifest $Manifest
    if (-not $id) { $id = [string]$entry['image'] }
    [pscustomobject]@{ AssetId = $id; Title = [string]$entry['title']; Origin = 'Explicit'; Route = [string]$entry['essay']; SourcePath = 'data/editorial_cartoons.yaml'; ArticleTitle = ''; ShortTitle = ''; ExplicitSlug = [string]$entry['slug']; Date = [string]$entry['date']; PublishDate = [string]$entry['publishDate'] }
  }
  $claimedRoutes = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $claimedAssets = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($entry in $entries) {
    if ($entry['essay']) { [void]$claimedRoutes.Add(([string]$entry['essay']).Trim('/')) }
    $explicitId = Resolve-OipArtworkAssetId -Reference ([string]$entry['image']) -Manifest $Manifest
    if ($explicitId) { [void]$claimedAssets.Add($explicitId) }
  }
  $cutoff = [datetimeoffset]::MaxValue
  if ($GalleryText -match '(?m)^automatic_articles_since:\s*(.*?)\s*$') {
    $cutoffText = ConvertFrom-OipArtworkYamlScalar $Matches[1]
    if ($cutoffText) { $cutoff = [datetimeoffset]::Parse($cutoffText, [Globalization.CultureInfo]::InvariantCulture) }
  }
  $candidates = @(foreach ($record in @(Get-OipArtworkSourceRecords -Root $Root -Manifest $Manifest -ContentTexts $ContentTexts)) {
    $release = [datetimeoffset]::MinValue
    foreach ($stamp in @($record.Date, $record.PublishDate)) {
      if ($stamp) { $parsed = [datetimeoffset]::Parse($stamp, [Globalization.CultureInfo]::InvariantCulture); if ($parsed -gt $release) { $release = $parsed } }
    }
    [pscustomobject]@{ Record = $record; Release = $release }
  })
  foreach ($candidate in @($candidates | Sort-Object @{ Expression = 'Release'; Descending = $true }, @{ Expression = { $_.Record.Route }; Descending = $false })) {
    $record = $candidate.Record
    if (-not $record.PublicEligible -or $Manifest.assets[$record.AssetId]['image_class'] -cnotin @('essay_illustration', 'editorial_cartoon')) { continue }
    if ($candidate.Release -lt $cutoff -or $claimedRoutes.Contains($record.Route.Trim('/')) -or $claimedAssets.Contains($record.AssetId)) { continue }
    $asset = $Manifest.assets[$record.AssetId]
    $title = if ($asset.Contains('artwork_title')) { $asset['artwork_title'] } elseif ($record.ShortTitle) { $record.ShortTitle } else { $record.ArticleTitle }
    [void]$claimedAssets.Add($record.AssetId)
    [pscustomobject]@{ AssetId = $record.AssetId; Title = $title; Origin = 'Article'; Route = $record.Route; SourcePath = $record.SourcePath; ArticleTitle = $record.ArticleTitle; ShortTitle = $record.ShortTitle; ExplicitSlug = ''; Date = $record.Date; PublishDate = $record.PublishDate }
  }
}

function Assert-OipArtworkTitleAvailable {
  param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][Collections.IDictionary]$Manifest,
    [Parameter(Mandatory)][string]$AssetId, [Alias('Value')][AllowNull()][object]$Title, [switch]$AllowRename, [string[]]$ArticleTitles = @())
  $articleNames = [Collections.Generic.List[string]]::new()
  foreach ($name in $ArticleTitles) { $articleNames.Add($name) }
  $associationKey = {
    param([AllowNull()][string]$Route)
    if ([string]::IsNullOrWhiteSpace($Route)) { return '' }
    # Match Hugo's escaped canonical path for both literal Unicode and encoded
    # Gallery associations; query strings and fragments do not change the piece.
    $uri = [uri]::new([uri]'https://outsideinprint.org/', $Route)
    return '/' + $uri.AbsolutePath.Trim('/') + '/'
  }
  $explicitRoutes = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $galleryPath = Join-Path $Root 'data/editorial_cartoons.yaml'
  if ([IO.File]::Exists($galleryPath)) {
    foreach ($row in @(Read-OipArtworkGallery -Text ([IO.File]::ReadAllText($galleryPath)))) {
      if ((Resolve-OipArtworkAssetId -Reference ([string]$row['image']) -Manifest $Manifest) -cne $AssetId) { continue }
      $route = & $associationKey ([string]$row['essay'])
      if ($route) { [void]$explicitRoutes.Add($route) }
    }
  }
  foreach ($record in @(Get-OipArtworkSourceRecords -Root $Root -Manifest $Manifest)) {
    $route = & $associationKey $record.Route
    if ($record.AssetId -ceq $AssetId -or ($route -and $explicitRoutes.Contains($route))) {
      $articleNames.Add($record.ArticleTitle)
      $articleNames.Add($record.ShortTitle)
    }
  }
  Assert-OipArtworkTitle -Title $Title -ArticleTitles $articleNames.ToArray()
  if ($Manifest.assets.Contains($AssetId) -and $Manifest.assets[$AssetId].Contains('artwork_title') -and
      [string]$Manifest.assets[$AssetId]['artwork_title'] -cne [string]$Title -and -not $AllowRename) {
    throw "Artwork '$AssetId' already has an artwork_title. Use the explicit title-only rename mode to change it."
  }
  $key = ConvertTo-OipArtworkTitleKey -Title $Title
  foreach ($claim in @(Get-OipArtworkTitleClaims -Root $Root -Manifest $Manifest)) {
    if ($claim.AssetId -cne $AssetId -and $key -ceq (ConvertTo-OipArtworkTitleKey -Title $claim.Title)) {
      throw "Artwork title '$Title' is already claimed by different artwork '$($claim.AssetId)'."
    }
  }
}
