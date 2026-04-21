import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const homeSelectedCollections = fs.readFileSync(path.resolve("layouts/partials/home_selected_collections.html"), "utf8");
const entryThreads = fs.readFileSync(path.resolve("layouts/partials/entry_threads.html"), "utf8");
const entryThreadsShortcode = fs.readFileSync(path.resolve("layouts/shortcodes/entry_threads.html"), "utf8");
const startHereContent = fs.readFileSync(path.resolve("content/start-here/index.md"), "utf8");

test("homepage selected collections delegates to the curated entry threads module", () => {
  assert.match(homeSelectedCollections, /partial "entry_threads\.html"/);
  assert.match(homeSelectedCollections, /"source" "homepage"/);
  assert.match(homeSelectedCollections, /"showArchiveLink" false/);
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

test("entry threads analytics slots stay fixed across homepage and start-here", () => {
  for (const slot of [
    "homepage_entry_thread_start",
    "homepage_entry_thread_collection",
    "start_here_entry_thread_start",
    "start_here_entry_thread_collection",
    "homepage_entry_thread_archive",
    "start_here_entry_thread_archive"
  ]) {
    assert.match(entryThreads, new RegExp(slot));
  }

  assert.match(entryThreads, /if \$showArchiveLink/);
  assert.match(entryThreads, /Start Reading/);
  assert.match(entryThreads, /Browse all collections/);
  assert.match(entryThreads, /"in-the-image-of-god" "In the Image of God"/);
});

test("welcome uses the shortcode wrapper before the archive route map", () => {
  assert.match(entryThreadsShortcode, /partial "entry_threads\.html"/);
  assert.match(entryThreadsShortcode, /"source" "start_here"/);
  assert.match(entryThreadsShortcode, /"showArchiveLink" true/);
  assert.match(startHereContent, /\{\{< entry_threads >\}\}/);
  assert.ok(startHereContent.indexOf("{{< entry_threads >}}") < startHereContent.indexOf("Ways Into the Archive"));
});
