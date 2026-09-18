#requires -Version 7.0
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$HugoPath = $env:OIP_HUGO_BIN,
  [switch]$PassThru
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
$implementationRoot = Split-Path -Parent $PSScriptRoot

if (-not $HugoPath) {
  $localHugo = Join-Path $implementationRoot '.tools/hugo-0.164.0/hugo'
  $HugoPath = if (Test-Path -LiteralPath $localHugo -PathType Leaf) { $localHugo } else { 'hugo' }
}

$registry = Join-Path $Root 'data/collections.yaml'
$content = Join-Path $Root 'content'
if (-not (Test-Path -LiteralPath $registry -PathType Leaf)) { throw "Missing collection registry: $registry" }
if (-not (Test-Path -LiteralPath $content -PathType Container)) { throw "Missing content source: $content" }

# Use Hugo's own YAML/front-matter parsing and membership resolver. This tiny site
# never evaluates article bodies, production templates, images, or assets.
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('oip-collection-source-' + [guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $fixture)
try {
  [void](New-Item -ItemType Directory -Path (Join-Path $fixture 'layouts/partials') -Force)
  Copy-Item -LiteralPath (Join-Path $implementationRoot 'layouts/partials/collections') -Destination (Join-Path $fixture 'layouts/partials/collections') -Recurse
  $configOutput = & $HugoPath config --source $Root --format json 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Collection source configuration failed:`n$($configOutput -join "`n")" }
  $sourceConfig = ($configOutput -join "`n") | ConvertFrom-Json -AsHashtable -Depth 100
  $config = @{
    baseURL = 'https://collection-contract.invalid/'
    timeZone = $sourceConfig['timezone']
    permalinks = $sourceConfig['permalinks']
    frontmatter = $sourceConfig['frontmatter']
    mediaTypes = $sourceConfig['mediatypes']
    outputFormats = $sourceConfig['outputformats']
    disableKinds = @('taxonomy', 'term', 'RSS', 'sitemap')
    outputs = @{ home = @('JSON'); page = @('HTML'); section = @('HTML') }
    module = @{ mounts = @(
      @{ source = $content; target = 'content' },
      @{ source = $registry; target = 'data/collections.yaml' }
    ) }
  }
  # Hugo checks shortcode existence while loading content, even without .Content.
  # Declare inert signatures; never copy or execute the production shortcode body.
  $shortcodes = Join-Path $implementationRoot 'layouts/shortcodes'
  [void](New-Item -ItemType Directory -Path (Join-Path $fixture 'layouts/shortcodes') -Force)
  foreach ($shortcode in @(Get-ChildItem -LiteralPath $shortcodes -File)) {
    $source = [System.IO.File]::ReadAllText($shortcode.FullName)
    $stub = if ($source -match '\.Inner\b|\.InnerDeindent\b') { '{{ .Inner }}' } else { '{{ "" }}' }
    [System.IO.File]::WriteAllText((Join-Path $fixture ('layouts/shortcodes/' + $shortcode.Name)), $stub)
  }
  [System.IO.File]::WriteAllText((Join-Path $fixture 'hugo.json'), ($config | ConvertTo-Json -Depth 10))
  $inventoryTemplate = @'
{{ $pages := slice }}
{{ range site.RegularPages }}
  {{ $pages = $pages | append (dict "slug" (lower (printf "%v" (.Params.slug | default .File.BaseFileName))) "path" .File.Path "draft" .Draft "section" .Section "layout" .Layout) }}
{{ end }}
{{ $members := dict }}
{{ range hugo.Data.collections.collections }}
  {{ $items := slice }}
  {{ range partial "collections/resolve-items.html" (dict "collection" . "publishedOnly" false) }}
    {{ $items = $items | append (dict "slug" (lower (printf "%v" (.Params.slug | default .File.BaseFileName))) "path" .File.Path "url" .RelPermalink "draft" .Draft "published" (partial "collections/is-published.html" .)) }}
  {{ end }}
  {{ $members = merge $members (dict .slug $items) }}
{{ end }}
{{ $publicSlugs := slice }}
{{ range partial "collections/get-public-entries.html" site }}
  {{ $publicSlugs = $publicSlugs | append .collection.slug }}
{{ end }}
{{ dict "collections" hugo.Data.collections.collections "pages" $pages "members" $members "public_collection_slugs" $publicSlugs | jsonify }}
'@
  [System.IO.File]::WriteAllText((Join-Path $fixture 'layouts/index.json'), $inventoryTemplate)
  [void](New-Item -ItemType Directory -Path (Join-Path $fixture 'layouts/_default') -Force)
  [System.IO.File]::WriteAllText((Join-Path $fixture 'layouts/_default/single.html'), '{{ .Title }}')
  [System.IO.File]::WriteAllText((Join-Path $fixture 'layouts/_default/list.html'), '{{ .Title }}')
  [System.IO.File]::WriteAllText((Join-Path $fixture 'layouts/_default/list.libraryindex.json'), '{{ dict | jsonify }}')
  [System.IO.File]::WriteAllText((Join-Path $fixture 'layouts/_default/rss.xml'), '<rss version="2.0"/>')
  $buildOutput = & $HugoPath --source $fixture --buildDrafts --buildFuture --buildExpired --panicOnWarning 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Collection source inventory failed:`n$($buildOutput -join "`n")" }
  $inventory = Get-Content -LiteralPath (Join-Path $fixture 'public/index.json') -Raw | ConvertFrom-Json -AsHashtable -Depth 100

  $issues = [System.Collections.Generic.List[string]]::new()
  $definitions = @{}
  $pagesBySlug = @{}
  foreach ($definition in $inventory.collections) {
    $slug = [string]$definition.slug
    if ($definitions.ContainsKey($slug)) { $issues.Add("Duplicate collection slug: $slug") }
    $definitions[$slug] = $definition
  }
  foreach ($page in $inventory.pages) {
    $slug = [string]$page.slug
    if (-not $pagesBySlug.ContainsKey($slug)) { $pagesBySlug[$slug] = @() }
    $pagesBySlug[$slug] += $page
  }

  $groupedCount = 0
  $standardCount = 0
  foreach ($definition in $inventory.collections) {
    $slug = [string]$definition.slug
    $related = @()
    if ($definition.ContainsKey('related_collections')) { $related = @($definition['related_collections']) }
    if ($definition.public -and $slug -ne 'bobs-almanack') {
      $standardCount++
      if ($definition['related_collections'] -isnot [array]) { $issues.Add("${slug}: related_collections must be a list") }
      if ($related.Count -lt 2 -or $related.Count -gt 3) { $issues.Add("${slug}: related_collections must contain two or three destinations") }
      $seenRelated = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
      foreach ($target in $related) {
        if ($target -isnot [string] -or $target -cnotmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
          $issues.Add("${slug}: related destination must be a canonical collection slug")
          continue
        }
        if (-not $seenRelated.Add($target)) { $issues.Add("${slug}: duplicate related destination $target") }
        if ($target -ceq $slug) { $issues.Add("${slug}: related destination must not be itself") }
        if (-not $definitions.ContainsKey($target)) {
          $issues.Add("${slug}: unknown related destination $target")
        } elseif (-not $definitions[$target].public) {
          $issues.Add("${slug}: private related destination $target")
        }
      }
    } elseif ($definition.ContainsKey('related_collections')) {
      $issues.Add("${slug}: private or bespoke collections must not receive a standard related map")
    }

    if (-not $definition.ContainsKey('sections')) { continue }
    $groupedCount++
    if ($definition.sections -isnot [array] -or $definition.sections.Count -eq 0) {
      $issues.Add("${slug}: sections must be a nonempty list")
      continue
    }
    $members = @($inventory.members[$slug])
    $memberPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($member in $members) { [void]$memberPaths.Add([string]$member.path) }
    $seenIDs = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $assigned = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($section in $definition.sections) {
      if ($section -isnot [System.Collections.IDictionary]) {
        $issues.Add("${slug}: each section must define id, title, and items")
        continue
      }
      $id = [string]$section['id']
      if ($id -cnotmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') { $issues.Add("${slug}: invalid section ID '$id'") }
      if (-not $seenIDs.Add($id)) { $issues.Add("${slug}: duplicate section ID '$id'") }
      if ([string]::IsNullOrWhiteSpace([string]$section['title'])) { $issues.Add("${slug}/${id}: section title is required") }
      if ($section['items'] -isnot [array] -or $section['items'].Count -eq 0) {
        $issues.Add("${slug}/${id}: items must be a nonempty list of canonical slugs")
        continue
      }
      foreach ($item in $section.items) {
        if ($item -isnot [string] -or $item -cnotmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
          $issues.Add("${slug}/${id}: item must be a canonical article slug")
          continue
        }
        if (-not $assigned.Add($item)) { $issues.Add("${slug}: duplicate section assignment '$item'") }
        if (-not $pagesBySlug.ContainsKey($item)) {
          $issues.Add("${slug}/${id}: unknown canonical article slug '$item'")
        } elseif ($pagesBySlug[$item].Count -ne 1) {
          $issues.Add("${slug}/${id}: ambiguous canonical article slug '$item'")
        } elseif (-not $memberPaths.Contains([string]$pagesBySlug[$item][0].path)) {
          $issues.Add("${slug}/${id}: '$item' is not a collection member; sections cannot grant membership")
        }
      }
    }
    foreach ($member in $members) {
      # Intentionally include queued and expired non-draft source files: grouping
      # must be complete before a scheduled publication becomes publicly visible.
      if (-not $member.draft -and -not $assigned.Contains([string]$member.slug)) {
        $issues.Add("${slug}: non-draft member '$($member.slug)' has no section assignment ($($member.path))")
      }
    }
  }

  if ($issues.Count -gt 0) { throw ("Collection organization contract failed:`n- " + ($issues -join "`n- ")) }
  Write-Host "Collection organization contract passed: $standardCount related maps; $groupedCount grouped collections; all non-draft source members covered."
  if ($PassThru) { return $inventory }
} finally {
  if (Test-Path -LiteralPath $fixture -PathType Container) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
