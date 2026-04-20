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
  assert.match(articleSingle, /partial "collections\/reading-path\.html" \./);
  assert.match(articleSingle, /partial "collections\/page-membership-block\.html" \./);
  assert.ok(articleSingle.indexOf('partial "collections/reading-path.html" .') < articleSingle.indexOf('partial "collections/page-membership-block.html" .'));
  assert.match(articleSingle, /partial "collections\/reading-progress-script\.html" \./);
});

test("collection single includes the progress partial, progress script, and item hooks", () => {
  assert.match(collectionSingle, /partial "collections\/collection-progress\.html"/);
  assert.match(collectionSingle, /partial "collections\/reading-progress-script\.html" \./);
  assert.match(collectionSingle, /data-collection-item-path="\{\{ \.RelPermalink \}\}"/);
  assert.match(collectionSingle, /class="collection-item-state" data-collection-item-state/);
  assert.ok(collectionSingle.indexOf('partial "collections/collection-progress.html"') < collectionSingle.indexOf('id="collection-items-title"'));
});

test("reading-path partial uses the first public collection match and fixed sequence copy", () => {
  for (const snippet of [
    'partial "collections/resolve-page-collections.html" (dict "page" . "publicOnly" true)',
    'index $matches 0',
    'Piece {{ $position }} of {{ $itemCount }}',
    'Remaining after this piece: {{ $remainingPieces }} pieces | {{ $remainingMinutes }} min',
    'Entry Point',
    'Visited 1 of {{ $itemCount }} in this browser.',
    'Continue to {{ .Title }}',
    'View Collection',
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
    'Start with ',
    'Resume with ',
    'Start Again with ',
    'Visited',
    'collection-pill--visited'
  ]) {
    assert.match(progressScript, new RegExp(escapeRegex(snippet)));
  }
});

test("css owns the new reading-path and collection-progress selectors", () => {
  for (const selector of [
    ".reading-path{",
    ".reading-path__eyebrow{",
    ".reading-path__title{",
    ".reading-path__meta,",
    ".reading-path__status{",
    ".reading-path__nav{",
    ".reading-path__cta{",
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

test("documentation records the reading-path ownership and storage contract", () => {
  for (const snippet of [
    "first public match",
    "`oip-reading-progress:v1:<collection-slug>`",
    "Start with <title>",
    "Resume with <title>",
    "Start Again with <title>"
  ]) {
    assert.match(collectionsDoc, new RegExp(escapeRegex(snippet)));
  }

  for (const snippet of [
    "`reading-path`",
    "`collection-progress`",
    "`collection-item-state`",
    "reading-path__eyebrow",
    "collection-pill--visited"
  ]) {
    assert.match(layoutMatrix, new RegExp(escapeRegex(snippet)));
  }
});
