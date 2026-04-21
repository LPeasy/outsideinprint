import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const homeSelectedCollections = fs.readFileSync(path.resolve("layouts/partials/home_selected_collections.html"), "utf8");
const entryThreads = fs.readFileSync(path.resolve("layouts/partials/entry_threads.html"), "utf8");

test("homepage selected collections delegates directly to the curated entry threads module", () => {
  assert.match(homeSelectedCollections, /partial "entry_threads\.html" \./);
  assert.doesNotMatch(homeSelectedCollections, /"source" "homepage"/);
  assert.doesNotMatch(homeSelectedCollections, /showArchiveLink/);
  assert.doesNotMatch(homeSelectedCollections, /collection\.featured/);
  assert.doesNotMatch(homeSelectedCollections, /get-public-entries/);
});

test("entry threads partial hard-codes the curated collection trio in order", () => {
  const orderedSlugs = [
    "floods-water-built-environment",
    "modern-bios",
    "moral-religious-philosophical-essays"
  ];

  let lastIndex = -1;
  for (const slug of orderedSlugs) {
    const index = entryThreads.indexOf(`"${slug}"`);
    assert.ok(index > lastIndex, `expected ${slug} to appear after the previous curated slug`);
    lastIndex = index;
  }

  assert.match(entryThreads, /partial "collections\/lookup-definition\.html"/);
  assert.match(entryThreads, /partial "collections\/resolve-items\.html"/);
  assert.match(entryThreads, /partial "collections\/get-state\.html"/);
  assert.doesNotMatch(entryThreads, /collection\.featured/);
});

test("entry threads now exposes homepage-only analytics and no archive footer", () => {
  for (const slot of [
    "homepage_entry_thread_start",
    "homepage_entry_thread_collection"
  ]) {
    assert.match(entryThreads, new RegExp(slot));
  }

  assert.doesNotMatch(entryThreads, /start_here_entry_thread_/);
  assert.doesNotMatch(entryThreads, /homepage_entry_thread_archive/);
  assert.doesNotMatch(entryThreads, /showArchiveLink/);
  assert.doesNotMatch(entryThreads, /Browse all collections/);
  assert.match(entryThreads, /Start Reading/);
  assert.match(entryThreads, /"in-the-image-of-god" "In the Image of God"/);
});
