import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

const articleSingle = read("layouts/_default/single.html");
const collectionSingle = read("layouts/collections/single.html");
const readingPath = read("layouts/partials/collections/reading-path.html");
const collectionProgress = read("layouts/partials/collections/collection-progress.html");
const progressScript = read("layouts/partials/collections/reading-progress-script.html");
const css = read("assets/css/main.css");
const collectionsDoc = read("docs/collections-system.md");
const layoutMatrix = read("docs/layout-ownership-matrix.md");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("article single includes the reading-path partial and shared progress script", () => {
  assert.match(articleSingle, /partial "collections\/resolve-page-collections\.html" \(dict "page" \. "publicOnly" true\)/);
  assert.match(articleSingle, /\$showCollectionContinuation := false/);
  assert.match(articleSingle, /partial "collections\/reading-path\.html" \./);
  assert.match(articleSingle, /partial "read_next\.html" \./);
  assert.match(articleSingle, /\{\{ if \$showCollectionContinuation \}\}/);
  assert.match(articleSingle, /\{\{ if not \$showCollectionContinuation \}\}/);
  assert.doesNotMatch(articleSingle, /partial "collections\/page-membership-block\.html" \./);
  assert.ok(articleSingle.indexOf('partial "collections/reading-path.html" .') < articleSingle.indexOf('partial "authors/card.html"'));
  assert.match(articleSingle, /partial "collections\/reading-progress-script\.html" \./);
});

test("collection single includes the progress partial, progress script, and item hooks", () => {
  assert.match(collectionSingle, /partial "collections\/collection-progress\.html"/);
  assert.match(collectionSingle, /partial "collections\/reading-progress-script\.html" \./);
  assert.match(collectionSingle, /data-collection-item-path="\{\{ \.RelPermalink \}\}"/);
  assert.match(collectionSingle, /class="collection-item-state" data-collection-item-state/);
  assert.ok(collectionSingle.indexOf('partial "collections/collection-progress.html"') < collectionSingle.indexOf('id="collection-items-title"'));
});

test("reading-path partial uses the first public collection match and fixed continuation copy", () => {
  for (const snippet of [
    'partial "collections/resolve-page-collections.html" (dict "page" . "publicOnly" true)',
    'index $matches 0',
    'Continue This Collection',
    'Piece {{ $position }} of {{ $itemCount }}',
    'Visited 1 of {{ $itemCount }} in this browser.',
    'Remaining after this piece: {{ $remainingPieces }} pieces | {{ $remainingMinutes }} min',
    'Entry Point',
    'New to this thread? Start at <a href="{{ $startHere.RelPermalink }}">{{ $startHere.Title }}</a>.',
    'Continue to {{ .Title }}',
    'View Collection',
    'Start Again with {{ .Title }}',
    'Previous piece',
    'Up Next',
    'You&rsquo;re at the end of this collection.',
    'Browse collections',
    'Search the library',
    'data-reading-path-root',
    'data-item-paths="{{ $itemPaths | jsonify | htmlEscape }}"',
    'data-item-titles="{{ $itemTitles | jsonify | htmlEscape }}"',
    'data-start-here-path="{{ $startHerePath }}"'
  ]) {
    assert.match(readingPath, new RegExp(escapeRegex(snippet)));
  }
});

test("collection-progress partial exposes deterministic resume hooks", () => {
  for (const snippet of [
    'Reading Progress',
    'Visited 0 of {{ len $items }} pieces in this browser.',
    'data-collection-progress-root',
    'data-item-paths="{{ $itemPaths | jsonify | htmlEscape }}"',
    'data-item-titles="{{ $itemTitles | jsonify | htmlEscape }}"',
    'data-start-here-path="{{ $startHerePath }}"',
    'data-start-here-title="{{ $startHereTitle }}"',
    'data-collection-progress-summary',
    'data-collection-progress-resume',
    'Progress is stored only in this browser.'
  ]) {
    assert.match(collectionProgress, new RegExp(escapeRegex(snippet)));
  }
});

test("progress script uses the fixed storage key and resume labels", () => {
  for (const snippet of [
    'oip-reading-progress:v1:',
    'data-reading-path-root',
    'data-collection-progress-root',
    '"Visited " + countVisited(itemPaths, state.visited || nextState) + " of " + itemPaths.length + " in this browser."',
    '"Visited " + visitedCount + " of " + itemPaths.length + " pieces in this browser."',
    'return { available: false, visited: [], updatedAt: "" };',
    "return null;",
    'Start with ',
    'Resume with ',
    'Start Again with ',
    'Visited',
    'collection-pill--visited'
  ]) {
    assert.match(progressScript, new RegExp(escapeRegex(snippet)));
  }
});

test("css owns the new reading-path continuation selectors", () => {
  for (const selector of [
    ".reading-path{",
    ".reading-path__header{",
    ".reading-path__eyebrow{",
    ".reading-path__title{",
    ".reading-path__meta,",
    ".reading-path__status{",
    ".reading-path__actions,",
    ".reading-path__preview,",
    ".reading-path__archive-links{",
    ".reading-path__preview-item{",
    ".reading-path__archive-links a{",
    ".collection-progress{",
    ".collection-progress__summary,",
    ".collection-progress__actions{",
    ".collection-progress__note{",
    ".collection-item-state{",
    ".collection-pill--visited{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("documentation records the article-exit continuation model and storage contract", () => {
  for (const snippet of [
    "article-exit continuation zone",
    "Continue This Collection",
    "first public match",
    "The separate mounted collection-membership block is no longer part of the article-member flow.",
    "`oip-reading-progress:v1:<collection-slug>`",
    "Start with <title>",
    "Resume with <title>",
    "Start Again with <title>"
  ]) {
    assert.match(collectionsDoc, new RegExp(escapeRegex(snippet)));
  }

  for (const snippet of [
    "`reading-path`",
    "`reading-path__header`",
    "`reading-path__actions`",
    "`reading-path__preview`",
    "`reading-path__archive-links`",
    "article-exit continuation zone"
  ]) {
    assert.match(layoutMatrix, new RegExp(escapeRegex(snippet)));
  }
});

test("reading-path partial uses the fixed continuation analytics source slots", () => {
  for (const snippet of [
    'data-analytics-event="collection_click"',
    'data-analytics-source-slot="article_continuation_primary"',
    'data-analytics-source-slot="article_continuation_secondary"',
    'data-analytics-source-slot="article_continuation_previous"',
    'data-analytics-source-slot="article_continuation_restart"',
    'data-analytics-event="internal_promo_click"',
    'data-analytics-source-slot="article_continuation_archive"'
  ]) {
    assert.match(readingPath, new RegExp(escapeRegex(snippet)));
  }
});
