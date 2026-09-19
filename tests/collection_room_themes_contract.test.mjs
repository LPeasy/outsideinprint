import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const collectionsData = read("data/collections.yaml");
const articleSingle = read("layouts/_default/single.html");
const collectionList = read("layouts/collections/list.html");
const collectionSingle = read("layouts/collections/single.html");
const collectionAlmanack = read("layouts/collections/bobs-almanack.html");
const collectionCard = read("layouts/partials/discovery/collection-card.html");
const collectionIdentities = JSON.parse(read("data/collection_identities.json"));
const css = read("assets/css/main.css");
const collectionsDoc = read("docs/collections-system.md");
const layoutMatrix = read("docs/layout-ownership-matrix.md");
const analyticsDoc = read("docs/analytics-system.md");

const expectedLegacyThemes = new Map([
  ["the-ledger", "ledger-editorial-desk"],
  ["syd-and-oliver-dialogues", "syd-and-oliver-smoky-lounge"],
  ["modern-bios", "modern-bios-records-archive"],
  ["lit-review", "lit-review-lamplit-shelf"],
  ["risk-uncertainty", "risk-systems-notebook"],
  ["floods-water-built-environment", "floods-survey-table"],
  ["technology-ai-machine-future", "ai-screen-glow-archive"],
  ["moral-religious-philosophical-essays", "moral-chapel-library"],
  ["reported-case-studies", "reported-case-studies-evidence-room"]
]);

test("legacy room_theme metadata remains data-only and no longer drives presentation", () => {
  for (const [slug, roomTheme] of expectedLegacyThemes) {
    assert.match(
      collectionsData,
      new RegExp(`- slug: ${escapeRegex(slug)}[\\s\\S]*?room_theme: ${escapeRegex(roomTheme)}`)
    );
  }

  assert.match(
    collectionsData,
    /- slug: the-ledger[\s\S]*?public: false[\s\S]*?featured: false/
  );

  for (const source of [collectionSingle, collectionCard, css]) {
    assert.doesNotMatch(source, /collection-room/);
    assert.doesNotMatch(source, /collection-card--room/);
    assert.doesNotMatch(source, /roomTheme/);
    assert.doesNotMatch(source, /data-collection-room-theme/);
  }
});

test("collection detail template renders a newspaper section front", () => {
  for (const snippet of [
    '<article class="collection-section{{ if $state.public }} collection-section--public{{ end }}{{ if $hasSections }} collection-section--grouped{{ end }}"',
    'class="page-shell page-shell--grid collection-section__header"',
    '<h1>{{ $definition.title }}</h1>',
    'class="collection-section__ledger"',
    '(ne $label "lane")',
    'class="page-shell page-shell--grid collection-section__lead"',
    '<h2 id="collection-start-here-title">Start Here</h2>',
    'class="page-shell page-shell--grid collection-section__contents"',
    '<ol class="collection-section__items">',
    '{{ if not (and $startHere $isStartHere) }}',
    'class="page-shell page-shell--grid collection-section__related"',
    'Related Collections',
    'Nearby lanes for continuing through the archive.',
    '"variant" "broadsheet"',
    'partial "discovery/page-list-item.html"',
    'partial "discovery/collection-card.html"'
  ]) {
    assert.match(collectionSingle, new RegExp(escapeRegex(snippet)));
  }

  for (const retiredSnippet of [
    'partial "collections/collection-progress.html"',
    'partial "collections/reading-progress-script.html" .',
    'data-collection-item-path="{{ .RelPermalink }}"',
    'class="collection-item-state" data-collection-item-state',
    'Entry point',
    'Best first read for this lane.',
    '<h2 id="collection-items-title">Contents</h2>',
    'pieces appear below in collection order',
    '$contentsCount',
    '$label }}: {{ $value',
    'Start here: <a href="{{ .RelPermalink }}">{{ .Title }}</a>'
  ]) {
    assert.doesNotMatch(collectionSingle, new RegExp(escapeRegex(retiredSnippet)));
  }

  assert.match(collectionSingle, /\$definition\.description[\s\S]*?collection-section__description/);
});

test("collection page identities are explicit opt-ins and related cards stay neutral", () => {
  const publicSlugs = [...collectionsData.matchAll(/^  - slug: (?<slug>[a-z0-9-]+)\r?\n(?<body>[\s\S]*?)(?=^  - slug:|(?![\s\S]))/gm)]
    .filter(({ groups }) => /^    public: true[ \t]*\r?$/m.test(groups.body))
    .map(({ groups }) => groups.slug)
    .sort();
  const pageEnabledSlugs = Object.entries(collectionIdentities)
    .filter(([, identity]) => identity.page_enabled === true)
    .map(([slug]) => slug)
    .sort();
  assert.equal(publicSlugs.length, 17);
  assert.deepEqual(Object.keys(collectionIdentities).sort(), publicSlugs);
  assert.deepEqual(pageEnabledSlugs, publicSlugs);
  assert.ok(!pageEnabledSlugs.includes("the-ledger"));

  for (const source of [collectionSingle, collectionAlmanack]) {
    for (const snippet of [
      '$pageIdentity := false',
      'index hugo.Data.collection_identities $definition.slug',
      'and $state.visible (eq .page_enabled true)',
      '$pageIdentity = .'
    ]) {
      assert.match(source, new RegExp(escapeRegex(snippet)));
    }
    const openingTag = source.match(/<article class="(?:collection-section|almanack-collection)[\s\S]*?>/)?.[0] || "";
    assert.match(openingTag, /with \$pageIdentity[\s\S]*?data-collection-identity=[\s\S]*?data-collection-type=[\s\S]*?--collection-ink-dark:[\s\S]*?--collection-ink-light:[\s\S]*?end/);
    assert.match(source, /with \$pageIdentity\s*}}\s*<div class="collection-section__nameplate">\s*{{\s*partial "collections\/directory-mark\.html" \.mark\s*}}\s*{{\s*end/);
  }

  const relatedCardCalls = [...collectionSingle.matchAll(/partial "discovery\/collection-card\.html" \(dict\b[\s\S]*?\)\s*}}/g)];
  assert.ok(relatedCardCalls.length > 0);
  for (const [call] of relatedCardCalls) {
    assert.doesNotMatch(call, /"identity"|collection_identities|\$pageIdentity/);
  }
});

test("page nameplates honor the four identity typography choices without replacing the Almanack sheet", () => {
  for (const [type, declaration] of [
    ["serif", "font-family:var(--font-display);"],
    ["sans", "font-family:var(--font-ui);"],
    ["italic", "font-style:italic;"],
    ["smallcaps", "font-variant-caps:small-caps;"]
  ]) {
    const selector = `.collection-section[data-collection-identity][data-collection-type="${type}"] .collection-section__nameplate h1`;
    assert.match(css, new RegExp(`${escapeRegex(selector)}\\s*\\{[^}]*${escapeRegex(declaration)}`));
  }
  assert.match(css, /\.collection-section\[data-collection-identity\] \.collection-section__nameplate h1\s*\{[^}]*overflow-wrap:anywhere;/);
  for (const snippet of [
    '<article class="almanack-collection page-shell page-shell--wide"',
    '<h1 id="almanack-collection-title">Bob\'s Almanack</h1>',
    'class="almanack-collection__register"',
    'class="almanack-collection__sheet"',
    'class="almanack-collection__principal"',
    'aria-label="Issue marginalia"',
    'class="almanack-collection__archive"'
  ]) {
    assert.ok(collectionAlmanack.includes(snippet), snippet);
  }
  assert.doesNotMatch(collectionAlmanack, /partial "discovery\/page-list-item\.html"/);
});

test("enabled collections expand existing artwork without changing shared thumbnail defaults", () => {
  const pageListItem = read("layouts/partials/discovery/page-list-item.html");
  const cartoonLink = read("layouts/partials/editorial/cartoon-gallery-link.html");
  const pageListCalls = [...collectionSingle.matchAll(/partial "discovery\/page-list-item\.html" \(dict\b[\s\S]*?\)\s*}}/g)];
  assert.equal(pageListCalls.length, 3);
  for (const [call] of pageListCalls) {
    assert.ok(call.includes('"collectionArtwork" (not (not $pageIdentity))'));
  }
  for (const snippet of [
    '$collectionImage := false',
    'if .collectionArtwork | default false',
    'partial "collections/artwork-for-page.html" (dict "page" $page "cartoon" $linkedCartoon)',
    '$collectionArtwork := not (not $collectionImage)',
    'item--collection-artwork',
    'class="item__copy"',
    'if not (.collectionArtwork | default false)',
    '"cartoon" $collectionImage',
    '"collectionArtwork" true',
    '"analyticsEvent" $analyticsEvent',
    '"analyticsSourceSlot" $analyticsSourceSlot',
    '"analyticsCollection" $analyticsCollection'
  ]) {
    assert.ok(pageListItem.includes(snippet), snippet);
  }
  assert.ok(pageListItem.indexOf('class="item__copy"') < pageListItem.indexOf('with $summary'));
  assert.ok(pageListItem.indexOf('with $summary') < pageListItem.lastIndexOf('partial "editorial/cartoon-gallery-link.html"'));

  for (const snippet of [
    '$collectionArtwork := .collectionArtwork | default false',
    '$imageSizes := "7rem"',
    '(min-width: 72rem) 30rem, (min-width: 641px) 46vw, calc(100vw - 2.25rem)',
    '"sizes" $imageSizes',
    '"loading" "lazy"',
    'essay-cartoon-thumb-wrap--collection-artwork',
    'class="essay-cartoon-zoom"',
    'data-essay-cartoon-lightbox-trigger',
    'data-image="{{ $imageModel.lightbox_url }}"',
    '<circle cx="10.5" cy="10.5" r="6.5"></circle>',
    '<path d="m16 16 5 5"></path>',
    '<span aria-hidden="true">⌕</span>'
  ]) {
    assert.ok(cartoonLink.includes(snippet), snippet);
  }
  assert.doesNotMatch(cartoonLink, /data-home-featured-image-trigger/);
  const imageAnchor = cartoonLink.match(/<a class="essay-cartoon-thumb[\s\S]*?>/)?.[0] || "";
  assert.match(imageAnchor, /if and \$collectionArtwork \$analyticsSourceSlot/);
  for (const attribute of ["event", "source-slot", "slug", "title", "section", "path", "collection"]) {
    const pattern = new RegExp(`data-analytics-${attribute}="[^"]*"`);
    const titleAttribute = pageListItem.match(pattern)?.[0]
      ?.replace("$slug", "$page.Params.slug | default $page.File.BaseFileName")
      .replace("$sectionLabel", "$page.Params.section_label | default (humanize $page.Section)");
    assert.equal(imageAnchor.match(pattern)?.[0], titleAttribute, `${attribute} must match the title-link metadata.`);
    assert.match(imageAnchor, pattern);
  }
  const zoomButton = cartoonLink.match(/<button\b[\s\S]*?<\/button>/)?.[0] || "";
  assert.match(zoomButton, /data-essay-cartoon-lightbox-trigger/);
  assert.doesNotMatch(zoomButton, /data-analytics-/);
  assert.match(zoomButton, /if \.slug[\s\S]*?data-cartoon-slug=[\s\S]*?end/);
  assert.match(zoomButton, /if \.slug[\s\S]*?data-gallery=[\s\S]*?end/);
  assert.match(css, /\.collection-section__lead-record\.item--collection-artwork\s*\{[^}]*grid-column:1 \/ -1;/);
});

test("collection artwork falls back to an article's own image without inventing gallery entries", () => {
  const artwork = read("layouts/partials/collections/artwork-for-page.html");
  assert.match(artwork, /\$artwork := false[\s\S]*?if not \$page\.Params\.image_exempt[\s\S]*?with \.cartoon/);
  assert.match(artwork, /with \.cartoon[\s\S]*?\$artwork = \.[\s\S]*?else[\s\S]*?\$page\.Params\.featured_image/);
  assert.match(artwork, /partial "article\/variant-key\.html" \$page/);
  assert.match(artwork, /modernbio/);
  assert.match(artwork, /portrait_image/);
  assert.ok(artwork.includes('$page.Params.portrait_image_alt | default $page.Params.featured_image_alt | default $page.Title'));
  assert.match(artwork, /featured_image/);
  assert.match(artwork, /featured_image_alt/);
  assert.match(artwork, /\$page\.Title/);
  assert.ok(artwork.includes('(not (in (lower $image) "images/social/"))'));
  for (const key of ["image", "alt", "title", "date"]) {
    assert.ok(artwork.includes(`"${key}"`), `Fallback artwork must provide ${key}.`);
  }
  assert.doesNotMatch(artwork, /"slug"|data-gallery|hugo\.Data\.editorial_cartoons|Params\.images/);
});

test("collections index renders a ruled broadsheet directory", () => {
  for (const snippet of [
    '{{ len $entries }} public collections &middot; {{ $totalPieces }} published pieces',
    'section-front section-front--collections',
    'section-front__header',
    'page-header--section-centered',
    'class="page-shell page-shell--grid collections-broadsheet"',
    'class="collections-broadsheet__section"',
    'class="collections-broadsheet__section-title"',
    'class="collections-broadsheet__section-meta"',
    'class="collections-broadsheet__records"',
    'partial "discovery/collection-card.html"',
    '"variant" "broadsheet"',
    'Series',
    'Topics'
  ]) {
    assert.match(collectionList, new RegExp(escapeRegex(snippet)));
  }

  for (const retiredSnippet of [
    'collections-directory__guide',
    'collections-directory__guide-card',
    'collections-directory__grid',
    'class="grid collection-grid',
    '"variant" "grid"',
    'How to use collections'
  ]) {
    assert.doesNotMatch(collectionList, new RegExp(escapeRegex(retiredSnippet)));
  }
});

test("collection-card partial owns a neutral broadsheet row branch", () => {
  for (const snippet of [
    '{{- if eq $variant "broadsheet" -}}',
    '<article class="collection-record{{ with $class }} {{ . }}{{ end }}"',
    'class="collection-record__meta"',
    'class="collection-record__title"',
    'class="collection-record__description"',
    'class="collection-record__scope"',
    'class="collection-record__start"',
    'data-analytics-source-slot="{{ $sourceSlot }}"',
    'data-analytics-collection="{{ $entry.collection.slug }}"',
    'Start here:'
  ]) {
    assert.match(collectionCard, new RegExp(escapeRegex(snippet)));
  }

  assert.match(collectionCard, /<article class="item\{\{ with \$class \}\} \{\{ \. \}\}\{\{ end \}\}">/);
  assert.match(collectionCard, /<a class="card collection-card\{\{ with \$class \}\} \{\{ \. \}\}\{\{ end \}\}" href="\{\{ \$url \}\}"/);
});

test("css owns the broadsheet and section-front selectors only", () => {
  for (const selector of [
    ".collections-broadsheet__summary{",
    ".collections-broadsheet{",
    ".collections-broadsheet::before{",
    ".collections-broadsheet__section{",
    ".collections-broadsheet__section::before{",
    ".collections-broadsheet__section-title{",
    ".collections-broadsheet__section-meta{",
    ".collections-broadsheet__records{",
    ".collection-record{",
    ".collection-record__meta{",
    ".collection-record__title{",
    ".collection-record__description{",
    ".collection-record__scope,",
    ".collection-record__start{",
    ".collection-section{",
    ".collection-section__header{",
    ".collection-section__ledger{",
    ".collection-section__lead,",
    ".collection-section__heading{",
    ".collection-section__items{",
    ".collection-section__item{",
    ".collection-section__related-list{",
    ".collection-section__next{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("article collection boundary stays compact and docs track the new collection architecture", () => {
  for (const snippet of [
    '{{ $showCollectionContext := false }}',
    '{{ $primaryCollection = $candidateCollection }}',
    'data-piece-collection-slug="{{ $primaryCollection.collection.slug }}"',
    'class="piece-record-rail"',
    'piece-record-rail__item--collection',
    'data-analytics-source-slot="article_collection_context"'
  ]) {
    assert.match(articleSingle, new RegExp(escapeRegex(snippet)));
  }
  assert.doesNotMatch(articleSingle, /From the Collection/);
  assert.doesNotMatch(articleSingle, /piece--collection-accent/);
  assert.doesNotMatch(articleSingle, /data-piece-collection-room-theme/);

  for (const snippet of [
    "`room_theme`",
    "legacy metadata retained for compatibility",
    "broadsheet directory",
    "newspaper section front",
    "Start Here item is promoted once and omitted from the contents list",
    "`collections-broadsheet`",
    "`collection-record`",
    "`collection-section`",
    "`collection-section__ledger`",
    "`collection-section__items`"
  ]) {
    assert.match(collectionsDoc + "\n" + layoutMatrix, new RegExp(escapeRegex(snippet)));
  }

  assert.match(analyticsDoc, /article_collection_context/);
});
