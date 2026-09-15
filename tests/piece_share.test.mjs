import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const eligibility = read("layouts/partials/article/share-eligible.html");
const share = read("layouts/partials/article/share.html");
const shareScript = read("layouts/partials/article/share-script.html");
const client = read("assets/js/piece-share.js");
const readingTemplates = [
  "layouts/_default/single.html",
  "layouts/almanack/single.html",
  "layouts/shop/sample.html",
];

test("piece sharing uses one published, indexable reading-page eligibility rule", () => {
  assert.match(eligibility, /\.IsPage/);
  assert.match(eligibility, /not \.Draft/);
  assert.match(eligibility, /le \.Date\.Unix \$now\.Unix/);
  assert.match(eligibility, /le \.PublishDate\.Unix \$now\.Unix/);
  assert.match(eligibility, /partial "metadata\/page\.html" \./);
  assert.match(eligibility, /\$meta\.policy\.indexable/);
  assert.match(eligibility, /eq \$meta\.route\.name "shop-sample"/);

  const sections = eligibility.match(/\(slice ([^)]+)\) \.Section/);
  assert.ok(sections, "reading sections must be an explicit allowlist");
  assert.deepEqual(
    [...sections[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort(),
    ["almanack", "essays", "reports", "syd-and-oliver", "working-papers"]
  );
  for (const partial of [share, shareScript]) {
    assert.match(partial, /^\{\{-? if partial "article\/share-eligible\.html" \. -?\}\}/);
  }
});

test("all three reading templates share canonical resolved metadata and one eligible script", () => {
  for (const file of readingTemplates) {
    assert.equal(
      (read(file).match(/partial "article\/share\.html" \./g) || []).length,
      1,
      `${file} must contain one shared control`
    );
  }
  assert.match(share, /partial "metadata\/page\.html" \./);
  assert.match(share, /data-share-title="\{\{ \$meta\.title \}\}"/);
  assert.match(share, /data-share-url="\{\{ \$meta\.canonical \}\}"/);
  assert.doesNotMatch(share, /\.RelPermalink|\.Permalink|\.Params\.title/);
  assert.equal((read("layouts/_default/baseof.html").match(/partial "article\/share-script\.html" \./g) || []).length, 1);
  assert.match(shareScript, /resources\.Get "js\/piece-share\.js" \| resources\.Minify \| resources\.Fingerprint/);
  assert.match(shareScript, /<script defer src="\{\{ \$script\.RelPermalink \}\}" integrity="\{\{ \$script\.Data\.Integrity \}\}"><\/script>/);
});

test("piece sharing adds no analytics events or remote sharing dependencies", () => {
  const sources = [share, shareScript, client].join("\n");
  assert.doesNotMatch(sources, /data-analytics|oipTrack|goatcounter|sendBeacon|XMLHttpRequest|\bfetch\s*\(/i);
  assert.doesNotMatch(sources, /<iframe\b|<script\b[^>]*src=["']https?:|connect\.facebook\.net|platform\.twitter\.com|addthis|sharethis/i);
  assert.doesNotMatch(client, /\b(?:import\s*\(|require\s*\(|createElement\s*\(\s*["']script)/);
});
