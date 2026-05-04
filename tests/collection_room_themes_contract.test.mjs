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
const collectionCard = read("layouts/partials/discovery/collection-card.html");
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
    '<article class="collection-section">',
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

  assert.doesNotMatch(collectionSingle, /\$definition\.description/);
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
    '<article class="collection-record{{ with $class }} {{ . }}{{ end }}">',
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
