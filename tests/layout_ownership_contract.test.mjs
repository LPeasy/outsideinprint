import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const startHereTemplate = fs.readFileSync(path.resolve("layouts/start-here/single.html"), "utf8");
const startHereContent = fs.readFileSync(path.resolve("content/start-here/index.md"), "utf8");
const collectionSingle = fs.readFileSync(path.resolve("layouts/collections/single.html"), "utf8");
const collectionMembership = fs.readFileSync(path.resolve("layouts/partials/collections/page-membership-block.html"), "utf8");
const articleSingle = fs.readFileSync(path.resolve("layouts/_default/single.html"), "utf8");
const layoutMatrix = fs.readFileSync(path.resolve("docs/layout-ownership-matrix.md"), "utf8");
const css = fs.readFileSync(path.resolve("assets/css/main.css"), "utf8");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("start-here owns a deliberate route layout and drops dead generic single hooks", () => {
  assert.match(startHereTemplate, /class="start-here-page"/);
  assert.match(startHereTemplate, /journey-links--page start-here-journey-links/);
  assert.match(startHereTemplate, /class="start-here-content page-shell page-shell--reading"/);
  assert.doesNotMatch(startHereTemplate, /single-page/);
  assert.doesNotMatch(startHereTemplate, /single-content/);

  for (const deadHook of [
    "start-here-map-section",
    "start-here-featured",
    "start-here-featured-intro",
    "start-here-collections",
    "start-here-editions",
    "start-here-archive"
  ]) {
    assert.doesNotMatch(startHereContent, new RegExp(deadHook));
  }

  for (const selector of [
    ".start-here-page{",
    ".start-here-journey-links{",
    ".start-here-section{",
    ".start-here-intro{",
    ".start-here-map{",
    ".start-here-map-row{",
    ".start-here-feature-list{",
    ".start-here-feature{",
    ".start-here-thread{",
    ".start-here-edition-list{",
    ".newsletter-signup--start-here .newsletter-signup__inner{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("collection detail and membership hooks have explicit inner-structure styling", () => {
  assert.match(collectionSingle, /class="collection-meta-row"/);
  assert.match(collectionSingle, /class="collection-item-note"/);
  assert.match(collectionSingle, /class="collection-pill"/);
  assert.match(collectionSingle, /"class" \(cond \(eq \$itemSlug \$startHereSlug\) "collection-item--start-here"/);

  assert.match(collectionMembership, /class="collection-membership__eyebrow"/);
  assert.match(collectionMembership, /class="collection-membership__row"/);
  assert.match(collectionMembership, /class="collection-membership__title"/);
  assert.match(collectionMembership, /class="collection-membership__meta"/);

  for (const selector of [
    ".collection-grid{",
    ".collection-card{",
    ".collection-meta{",
    ".collection-meta-row{",
    ".collection-meta-label{",
    ".collection-meta-value{",
    ".collection-items{",
    ".collection-item-note{",
    ".collection-start-here,",
    ".collection-pill{",
    ".collection-membership__eyebrow{",
    ".collection-membership__row{",
    ".collection-membership__title{",
    ".collection-membership__meta{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("article single template removes dead generic layout hooks and uses page-flow ownership", () => {
  assert.match(articleSingle, /<article class="piece"/);
  assert.match(articleSingle, /<div class="piece-body">/);
  assert.doesNotMatch(articleSingle, /single-page/);
  assert.doesNotMatch(articleSingle, /single-content/);
  assert.match(css, /\.newsletter-signup--page\{\s*margin-top:0;\s*\}/);
  assert.match(css, /\.running-header\{/);
  assert.match(css, /\.running-header__inner\{/);
});

test("layout ownership matrix tracks the integrated cleanup state", () => {
  for (const snippet of [
    "`start-here-page`",
    "`start-here-journey-links`",
    "`newsletter-signup--page`",
    "`newsletter-signup--start-here`",
    "`collection-item-note`",
    "`collection-membership__eyebrow`",
    "`running-header__inner`",
    "## Removed Layout Hooks"
  ]) {
    assert.match(layoutMatrix, new RegExp(escapeRegex(snippet)));
  }

  for (const stalePhrase of [
    "`single-page`, `single-content`, `single-page--imported`, and `newsletter-signup--page` have no dedicated CSS",
    "`collection-grid` and `collection-card` appear in markup but have no dedicated CSS",
    "Verify that most content-authored `start-here-*` classes remain unstyled",
    "Verify that only the outer `collection-meta-block` container is explicitly styled",
    "`running-header*` has only mobile and print CSS overrides"
  ]) {
    assert.doesNotMatch(layoutMatrix, new RegExp(escapeRegex(stalePhrase)));
  }
});
