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
const collectionSingle = read("layouts/collections/single.html");
const css = read("assets/css/main.css");
const collectionsDoc = read("docs/collections-system.md");
const layoutMatrix = read("docs/layout-ownership-matrix.md");

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
    'class="collection-room__section collection-room__section--overview page-shell page-shell--reading"',
    'class="collection-room__section collection-room__section--entry page-shell page-shell--reading"',
    'class="collection-room__section collection-room__section--progress"',
    'class="collection-room__section collection-room__section--items page-shell page-shell--reading"',
    'class="collection-room__section collection-room__section--related page-shell page-shell--reading"'
  ]) {
    assert.match(collectionSingle, new RegExp(escapeRegex(snippet)));
  }
});

test("css owns the shared collection-room namespace and all theme modifiers", () => {
  for (const selector of [
    ".collection-room{",
    ".collection-room::before{",
    ".collection-room::after{",
    ".collection-room__section{",
    ".collection-room__header,",
    ".collection-room__section--overview,",
    ".collection-room__section--entry,",
    ".collection-room__section--items,",
    ".collection-room__section--related,",
    ".collection-room__section--progress{",
    ".collection-room .collection-meta-block,",
    ".collection-room .collection-progress,",
    ".collection-room .journey-links--page{",
    ".collection-room--ledger-editorial-desk{",
    ".collection-room--syd-and-oliver-smoky-lounge{",
    ".collection-room--modern-bios-records-archive{",
    ".collection-room--risk-systems-notebook{",
    ".collection-room--floods-survey-table{",
    ".collection-room--ai-screen-glow-archive{",
    ".collection-room--moral-chapel-library{",
    ".collection-room--reported-case-studies-evidence-room{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("docs record room_theme and collection-room ownership", () => {
  for (const snippet of [
    "`room_theme`",
    "collection-detail-page presentation key",
    "reading-room treatment",
    "collection-detail-page only in this pass"
  ]) {
    assert.match(collectionsDoc, new RegExp(escapeRegex(snippet)));
  }

  for (const snippet of [
    "`collection-room`",
    "`collection-room__header`",
    "`collection-room__section`",
    "`collection-room__section--overview`",
    "`collection-room__section--entry`",
    "`collection-room__section--progress`",
    "`collection-room__section--items`",
    "`collection-room__section--related`"
  ]) {
    assert.match(layoutMatrix, new RegExp(escapeRegex(snippet)));
  }
});
