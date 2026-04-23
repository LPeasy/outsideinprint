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

const expectedThemes = new Map([
  ["the-ledger", "ledger-editorial-desk"],
  ["syd-and-oliver-dialogues", "syd-and-oliver-smoky-lounge"],
  ["modern-bios", "modern-bios-records-archive"],
  ["risk-uncertainty", "risk-systems-notebook"],
  ["floods-water-built-environment", "floods-survey-table"],
  ["technology-ai-machine-future", "ai-screen-glow-archive"],
  ["moral-religious-philosophical-essays", "moral-chapel-library"],
  ["reported-case-studies", "reported-case-studies-evidence-room"]
]);

test("live collections define the exact room themes and hidden collections stay unassigned", () => {
  for (const [slug, roomTheme] of expectedThemes) {
    assert.match(
      collectionsData,
      new RegExp(`- slug: ${escapeRegex(slug)}[\\s\\S]*?room_theme: ${escapeRegex(roomTheme)}`)
    );
  }

  assert.doesNotMatch(
    collectionsData,
    /- slug: civic-institutions-and-public-power[\s\S]*?room_theme:/
  );
});

test("collection detail template emits room root and section hooks", () => {
  for (const snippet of [
    'class="collection-room{{ with $roomTheme }} collection-room--{{ . }}{{ end }}"',
    'data-collection-room-theme="{{ $roomTheme }}"',
    'class="page-header page-shell page-shell--wide collection-room__header"',
    'class="collection-room__eyebrow"',
    'class="collection-room__summary"',
    'class="collection-room__section collection-room__section--entry page-shell page-shell--reading"',
    'class="collection-room__section collection-room__section--progress"',
    'class="collection-room__section collection-room__section--items page-shell page-shell--reading"',
    'class="collection-room__section collection-room__section--related page-shell page-shell--reading"',
    'class="collection-room__section-intro"'
  ]) {
    assert.match(collectionSingle, new RegExp(escapeRegex(snippet)));
  }
});

test("collection list template emits the lane guide and grouped directory hooks", () => {
  for (const snippet of [
    'class="page-shell page-shell--wide collections-directory__guide"',
    'class="collections-directory__guide-card"',
    'class="collections-directory__guide-kicker"',
    'class="collections-directory__guide-title"',
    'class="collections-directory__guide-copy"',
    'class="collections-directory__guide-meta"',
    'class="collections-directory__group-meta"'
  ]) {
    assert.match(collectionList, new RegExp(escapeRegex(snippet)));
  }
});

test("article template emits primary-collection light-accent hooks", () => {
  for (const snippet of [
    '{{ $showCollectionAccent := false }}',
    '{{ $primaryCollection = $candidateCollection }}',
    'append "piece--collection-accent"',
    'piece--collection-accent--%s',
    'data-piece-collection-slug="{{ $primaryCollection.collection.slug }}"',
    'data-piece-collection-room-theme="{{ $primaryCollection.collection.room_theme }}"',
    'class="piece-collection-context"',
    'From the Collection',
    'data-analytics-source-slot="article_collection_context"'
  ]) {
    assert.match(articleSingle, new RegExp(escapeRegex(snippet)));
  }
});

test("collection-card partial emits room-echo classes only in the grid branch", () => {
  for (const snippet of [
    '{{- $roomTheme := $entry.collection.room_theme | default "" -}}',
    '{{- if eq $variant "item" -}}',
    'collection-card__eyebrow',
    'collection-card__description',
    'collection-card__meta-line',
    'collection-card__start-here',
    'collection-meta',
    '<article class="item{{ with $class }} {{ . }}{{ end }}">',
    '<a class="card collection-card{{ with $roomTheme }} collection-card--room-echo collection-card--{{ . }}{{ end }}{{ with $class }} {{ . }}{{ end }}" href="{{ $url }}"'
  ]) {
    assert.match(collectionCard, new RegExp(escapeRegex(snippet)));
  }

  assert.doesNotMatch(
    collectionCard,
    /\{\{- if eq \$variant "item" -\}\}[\s\S]*?collection-card--room-echo[\s\S]*?\{\{- else -\}\}/
  );
});

test("css owns the shared collection-room namespace and all theme modifiers", () => {
  for (const selector of [
    ".collections-directory__summary{",
    ".collections-directory__guide{",
    ".collections-directory__guide-card{",
    ".collections-directory__guide-kicker,",
    ".collections-directory__guide-title{",
    ".collections-directory__guide-copy{",
    ".collections-directory__guide-meta{",
    ".collections-directory__group-header{",
    ".collections-directory__group-meta{",
    ".collections-directory__group-intro{",
    ".collection-card__eyebrow{",
    ".collection-card__description{",
    ".collection-card__meta-line{",
    ".collection-card__start-here{",
    ".piece--collection-accent{",
    ".piece--collection-accent .piece-collection-context,",
    ".piece--collection-accent .piece-collection-context__eyebrow{",
    ".piece--collection-accent .piece-collection-context__title{",
    ".piece--collection-accent .piece-collection-context__meta{",
    ".piece--collection-accent .reading-path{",
    ".piece--collection-accent .reading-path__action--primary{",
    ".piece--collection-accent--ledger-editorial-desk{",
    ".piece--collection-accent--syd-and-oliver-smoky-lounge{",
    ".piece--collection-accent--modern-bios-records-archive{",
    ".piece--collection-accent--risk-systems-notebook{",
    ".piece--collection-accent--floods-survey-table{",
    ".piece--collection-accent--ai-screen-glow-archive{",
    ".piece--collection-accent--moral-chapel-library{",
    ".piece--collection-accent--reported-case-studies-evidence-room{",
    ".collection-room{",
    ".collection-room::before{",
    ".collection-room::after{",
    ".collection-room__section{",
    ".collection-room__header,",
    ".collection-room__eyebrow{",
    ".collection-room__summary,",
    ".collection-room__section--entry,",
    ".collection-room__section--items,",
    ".collection-room__section--related,",
    ".collection-room__section-intro{",
    ".collection-room__section--progress{",
    ".collection-room .collection-progress,",
    ".collection-room .journey-links--page{",
    ".collection-room--ledger-editorial-desk{",
    ".collection-room--syd-and-oliver-smoky-lounge{",
    ".collection-room--modern-bios-records-archive{",
    ".collection-room--risk-systems-notebook{",
    ".collection-room--floods-survey-table{",
    ".collection-room--ai-screen-glow-archive{",
    ".collection-room--moral-chapel-library{",
    ".collection-room--reported-case-studies-evidence-room{",
    ".collection-card--room-echo{",
    ".collection-card--ledger-editorial-desk{",
    ".collection-card--syd-and-oliver-smoky-lounge{",
    ".collection-card--modern-bios-records-archive{",
    ".collection-card--risk-systems-notebook{",
    ".collection-card--floods-survey-table{",
    ".collection-card--ai-screen-glow-archive{",
    ".collection-card--moral-chapel-library{",
    ".collection-card--reported-case-studies-evidence-room{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("docs record room_theme, article light accents, and collection-room ownership", () => {
  for (const snippet of [
    "`room_theme`",
    "presentation key reused by collection-detail reading rooms",
    "reading-room treatment",
    "curated editorial reading lanes",
    "Read in sequence",
    "Follow a question",
    "Start Here",
    "table of contents for the lane",
    "Best first read for this lane.",
    "From the Collection",
    "first public match",
    "primary-collection light-accent layer"
  ]) {
    assert.match(collectionsDoc, new RegExp(escapeRegex(snippet)));
  }

  for (const snippet of [
    "`piece--collection-accent`",
    "`piece-collection-context`",
    "`piece-collection-context__eyebrow`",
    "`piece-collection-context__title`",
    "`piece-collection-context__meta`",
    "`collections-directory__guide*`",
    "`collection-card__description`",
    "`collection-room`",
    "`collection-room__header`",
    "`collection-room__eyebrow`",
    "`collection-room__summary`",
    "`collection-room__section`",
    "`collection-room__section--entry`",
    "`collection-room__section--progress`",
    "`collection-room__section--items`",
    "`collection-room__section--related`",
    "`collection-card__eyebrow`",
    "`collection-card__meta-line`",
    "`collection-card__start-here`",
    "`collection-room__section-intro`"
  ]) {
    assert.match(layoutMatrix, new RegExp(escapeRegex(snippet)));
  }

  assert.match(analyticsDoc, /article_collection_context/);
});
