import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (relativePath) => fs.readFileSync(path.resolve(relativePath), "utf8");

const route = read("layouts/partials/metadata/route.html");
const schema = read("layouts/partials/schema.html");
const webpage = read("layouts/partials/schema/webpage.html");
const breadcrumbs = read("layouts/partials/schema/breadcrumbs.html");
const creativeWork = read("layouts/partials/schema/creative-work.html");
const series = read("layouts/partials/schema/creative-work-series.html");
const productPageResolver = read("layouts/partials/schema/resolve-product-page.html");
const significantLinks = read("layouts/partials/schema/significant-links.html");
const base = read("layouts/_default/baseof.html");
const sydIndex = read("content/syd-and-oliver/_index.md");
const sydRedirect = read("layouts/syd-and-oliver/list.html");
const collections = read("data/collections.yaml");

test("dialogues and mapped bookstore samples have explicit metadata routes", () => {
  assert.match(route, /\.Params\.library_type/);
  assert.match(route, /\$name = "dialogue"/);
  assert.match(route, /\.Params\.sample_of_book_key/);
  assert.match(route, /\$name = "shop-sample"/);
  assert.match(route, /\$sectionLabel = "Dialogue"/);
  assert.match(route, /\.Params\.sample_work_type/);
  assert.match(route, /\$socialType = "article"/);
  assert.match(route, /\$isArticleLike = true/);
  assert.ok(route.indexOf('$name = "dialogue"') < route.indexOf('$name = "article"'), "dialogue routing must precede the generic essay route");
});

test("all bookstore reading samples map to their canonical product keys", () => {
  const mappings = new Map([
    ["content/shop/2045/sample.md", "2045"],
    ["content/shop/the-american-nightmare-keep-dreaming-kid/sample.md", "american_nightmare"],
    ["content/shop/the-parable-of-the-sheep/sample.md", "parable_of_the_sheep"],
    ["content/shop/the-water-cycle/sample.md", "the_water_cycle"],
  ]);

  for (const [file, key] of mappings) {
    assert.match(read(file), new RegExp(`^sample_of_book_key: ["']?${key}["']?$`, "m"));
  }
  assert.match(read("content/shop/2045/sample.md"), /^sample_work_type: ["']?short-story["']?$/m);
  for (const file of [...mappings.keys()].slice(1)) {
    assert.doesNotMatch(read(file), /^sample_work_type:/m, `${file} must remain WebPage-only`);
  }

  const metadataTitles = new Map([
    ["content/shop/the-american-nightmare-keep-dreaming-kid/sample.md", "The American Nightmare — Reading Sample"],
    ["content/shop/the-parable-of-the-sheep/sample.md", "The Parable of the Sheep — Reading Sample"],
    ["content/shop/the-water-cycle/sample.md", "The Water Cycle — Reading Sample"],
  ]);
  for (const [file, title] of metadataTitles) {
    assert.match(read(file), new RegExp(`^metadata_title: ["']${title}["']$`, "m"));
  }
});

test("dialogues and the complete 2045 sample emit connected ShortStory entities", () => {
  for (const snippet of [
    'eq $meta.route.name "dialogue"',
    '$workType = "ShortStory"',
    '"genre" "Literary dialogue"',
    '(printf "%s#series" .Permalink)',
    'eq $meta.route.name "shop-sample"',
    '.Params.sample_work_type',
    'partial "schema/resolve-product-page.html"',
    '(printf "%s#primaryentity" .Permalink)',
    '.Params.tags',
    '.Params.topics',
    '$topicKeys',
  ]) {
    assert.ok(creativeWork.includes(snippet), `missing creative-work contract: ${snippet}`);
  }
  assert.match(productPageResolver, /site\.GetPage "\/shop"/);
  assert.match(productPageResolver, /\.Params\.book_key/);
  assert.match(productPageResolver, /errorf "Schema could not resolve bookstore page for sample_of_book_key/);
});

test("the canonical Syd collection exposes one explicit CreativeWorkSeries", () => {
  for (const snippet of [
    'partial "schema/creative-work-series.html"',
    '"@type" "CreativeWorkSeries"',
    '.schema_type',
    'partial "collections/resolve-items.html"',
    '"hasPart" $hasPart',
  ]) {
    assert.ok(`${schema}\n${series}`.includes(snippet), `missing series contract: ${snippet}`);
  }
  assert.match(webpage, /printf "%s#series" \$meta\.canonical/);
});

test("schema breadcrumbs use canonical discovery parents", () => {
  assert.doesNotMatch(breadcrumbs, /\.CurrentSection/);
  for (const routeName of ["dialogue", "article", "shop-product", "shop-sample"]) {
    assert.ok(breadcrumbs.includes(`$meta.route.name "${routeName}"`), `missing ${routeName} breadcrumb route`);
  }
  for (const parent of ["/archive", "/collections/syd-and-oliver-dialogues", "/shop"]) {
    assert.ok(breadcrumbs.includes(`site.GetPage "${parent}"`), `missing canonical breadcrumb parent ${parent}`);
  }
  assert.match(breadcrumbs, /partial "schema\/resolve-product-page\.html"/);
  assert.match(significantLinks, /"\/collections\/syd-and-oliver-dialogues"/);
  assert.doesNotMatch(significantLinks, /"\/syd-and-oliver"/);
});

test("the old Syd hub is a noindex compatibility route while its children and feed stay stable", () => {
  assert.match(sydIndex, /^noindex: true$/m);
  assert.match(sydIndex, /^redirect_to: "\/collections\/syd-and-oliver-dialogues\/"$/m);
  assert.match(sydIndex, /^outputs: \["HTML", "RSS"\]$/m);
  assert.match(sydRedirect, /<meta name="robots" content="noindex, follow"/);
  assert.match(sydRedirect, /<link rel="canonical" href="\{\{ \$target \| absURL \}\}"/);
  assert.match(sydRedirect, /\.OutputFormats\.Get "RSS"/);
  assert.match(sydRedirect, /window\.location\.replace\("\{\{ \$target \| relURL \}\}"\)/);
  assert.doesNotMatch(sydRedirect, /archive\/render-list\.html/);
  assert.match(collections, /^\s+legacy_path: \/syd-and-oliver\/$/m);
  assert.match(collections, /^\s+feed_path: \/syd-and-oliver\/index\.xml$/m);
  assert.equal((collections.match(/^\s+schema_type: CreativeWorkSeries$/gm) || []).length, 1);
  assert.match(base, /with \.feed_path/);
  assert.match(base, /type="application\/rss\+xml"/);

  const dialogueFiles = fs.readdirSync(path.resolve("content/essays/dialogues")).filter((name) => name.endsWith(".md"));
  assert.equal(dialogueFiles.length, 19);
  const urls = dialogueFiles.map((name) => {
    const source = read(path.join("content/essays/dialogues", name));
    const match = source.match(/^url:\s*["'](\/syd-and-oliver\/[^"']+\/)["']$/m);
    assert.ok(match, `${name} must retain its public Syd and Oliver child URL`);
    return match[1];
  });
  assert.equal(new Set(urls).size, 19);

  const allTi = read("content/essays/dialogues/all-ti.md");
  assert.match(allTi, /^aliases:\s*\[["']\/syd-and-oliver\/all-time-highs\/["']\]$/m);
});
