import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const continuations = JSON.parse(read("data/featured_continuations.json"));
const template = read("layouts/partials/article/featured-continuation.html");
const articleSingle = read("layouts/_default/single.html");
const sampleExit = read("layouts/partials/article/studio-sample-exit.html");
const css = read("assets/css/main.css");

const expectedDestinations = {
  "/essays/jack-stratton-and-the-vulfpeck-model/": "/essays/benjamin-franklin-how-americas-funniest-founder-made-greatness-feel-possible/",
  "/syd-and-oliver/a-thousand-brick-walls/": "/syd-and-oliver/pressure-makes-pearls/",
  "/essays/what-is-risk-a-four-part-framework/": "/essays/risk-management-vs-risk-analysis-whats-the-difference/",
};

test("featured continuations are three explicit editorial choices with a connection sentence for each path", () => {
  assert.deepEqual(Object.keys(continuations).sort(), Object.keys(expectedDestinations).sort());
  for (const [source, destination] of Object.entries(expectedDestinations)) {
    const entry = continuations[source];
    const expectedFields = ["reading_connection", "reading_path", "studio_connection"];
    if (source !== "/essays/jack-stratton-and-the-vulfpeck-model/") expectedFields.push("reading_collection");
    assert.deepEqual(Object.keys(entry).sort(), expectedFields.sort());
    if (source === "/syd-and-oliver/a-thousand-brick-walls/") assert.equal(entry.reading_collection, "syd-and-oliver-dialogues");
    if (source === "/essays/what-is-risk-a-four-part-framework/") assert.equal(entry.reading_collection, "risk-uncertainty");
    assert.equal(entry.reading_path, destination, `${source} keeps its approved next reading`);
    assert.notEqual(source, destination, "a continuation must not point back to the current article");
    for (const key of ["reading_connection", "studio_connection"]) {
      assert.equal(typeof entry[key], "string");
      assert.equal(entry[key], entry[key].trim());
      assert.ok(entry[key].split(/\s+/).length >= 8, `${source} ${key} needs a real connection, not a label`);
      assert.match(entry[key], /[.!?]$/, `${source} ${key} must end as a sentence`);
      assert.doesNotMatch(entry[key], /<[^>]+>|https?:\/\//, "connection copy stays plain text, with links owned by markup");
    }
  }
});

test("featured exit offers only one reading link and one described Studio inquiry link", () => {
  assert.match(template, /<aside\b[^>]*class="featured-continuation"/);
  assert.equal((template.match(/<a\b/g) || []).length, 2);
  for (const kind of ["reading", "studio"]) {
    assert.match(template, new RegExp(`<p\\b[^>]*id="featured-${kind}-connection"`));
    assert.match(template, new RegExp(`aria-describedby="featured-${kind}-connection"`));
    assert.match(template, new RegExp(`\\$entry\\.${kind}_connection`));
  }
  assert.match(template, /href="\/studio\/#studio-inquiry"/);
  assert.match(template, /data-analytics-source-slot="article_continuation_primary"/);
  for (const sourceSlot of ["studio_sample_exit", "article_exit_paths"]) {
    assert.ok(template.includes(sourceSlot), `preserve the ${sourceSlot} Studio analytics source`);
  }
  for (const event of ["collection_click", "internal_promo_click"]) {
    assert.ok(template.includes(event), `preserve the ${event} event`);
  }
  assert.doesNotMatch(template, /<form\b|<input\b|<script\b|newsletter_signup|newsletter_prompt/);
  assert.match(articleSingle, /featured_continuations/);
  assert.match(articleSingle, /partial "article\/featured-continuation\.html"/);
  assert.match(articleSingle, /\{\{ if \$featuredContinuation \}\}[\s\S]*?partial "article\/featured-continuation\.html"[\s\S]*?\{\{ else if \$showCollectionContinuation \}\}\s*\{\{ partial "collections\/reading-path\.html" \./);
  assert.match(articleSingle, /"hideCTA" \(not \(not \$featuredContinuation\)\)/);
  assert.match(sampleExit, /hideCTA/);
  assert.match(template, /errorf "Featured continuation on %q requires a published reading destination/);
  assert.match(template, /errorf "Featured continuation on %q requires both connection sentences/);
  assert.match(css, /\.featured-continuation__link\{[^}]*min-height:44px;[^}]*max-width:100%;[^}]*overflow-wrap:anywhere;/);
  assert.match(css, /\.featured-continuation__link:focus-visible\{[^}]*outline:3px solid var\(--focus-ring\);/);
});
