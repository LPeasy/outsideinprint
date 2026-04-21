import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const homeImprintStatement = fs.readFileSync(path.resolve("layouts/partials/home_imprint_statement.html"), "utf8");
const aboutSingle = fs.readFileSync(path.resolve("layouts/about/single.html"), "utf8");
const authorDirectory = fs.readFileSync(path.resolve("layouts/partials/authors/directory.html"), "utf8");
const authorList = fs.readFileSync(path.resolve("layouts/authors/list.html"), "utf8");
const authorSection = fs.readFileSync(path.resolve("layouts/authors/section.html"), "utf8");
const authorSingle = fs.readFileSync(path.resolve("layouts/authors/single.html"), "utf8");
const collectionSingle = fs.readFileSync(path.resolve("layouts/collections/single.html"), "utf8");
const collectionMembership = fs.readFileSync(path.resolve("layouts/partials/collections/page-membership-block.html"), "utf8");
const articleSingle = fs.readFileSync(path.resolve("layouts/_default/single.html"), "utf8");
const layoutMatrix = fs.readFileSync(path.resolve("docs/layout-ownership-matrix.md"), "utf8");
const css = fs.readFileSync(path.resolve("assets/css/main.css"), "utf8");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("homepage manifesto owns deliberate route-level hooks and drops dead start-here selectors", () => {
  assert.match(homeImprintStatement, /class="home-manifesto"/);
  assert.match(homeImprintStatement, /class="home-manifesto__inner page-shell page-shell--wide"/);
  assert.match(homeImprintStatement, /class="home-manifesto__copy"/);
  assert.match(homeImprintStatement, /home-manifesto__line--primary/);
  assert.match(homeImprintStatement, /home-manifesto__line--secondary/);

  for (const selector of [
    ".home-manifesto{",
    ".home-manifesto__inner{",
    ".home-manifesto__copy{",
    ".home-manifesto__line{",
    ".home-manifesto__line--primary{",
    ".home-manifesto__line--secondary{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }

  for (const deadSelector of [
    ".start-here-page{",
    ".start-here-journey-links{",
    ".start-here-section{",
    ".start-here-intro{",
    ".start-here-map{",
    ".start-here-feature{",
    ".start-here-thread{",
    ".newsletter-signup--start-here .newsletter-signup__inner{"
  ]) {
    assert.doesNotMatch(css, new RegExp(escapeRegex(deadSelector)));
  }
});

test("collection detail and membership hooks have explicit inner-structure styling", () => {
  assert.match(collectionSingle, /class="collection-room\{\{ with \$roomTheme \}\} collection-room--\{\{ \. \}\}\{\{ end \}\}"/);
  assert.match(collectionSingle, /data-collection-room-theme="\{\{ \$roomTheme \}\}"/);
  assert.match(collectionSingle, /collection-room__header/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--overview/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--entry/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--progress/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--items/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--related/);
  assert.match(collectionSingle, /class="collection-meta-row"/);
  assert.match(collectionSingle, /class="collection-item-note"/);
  assert.match(collectionSingle, /class="collection-pill"/);
  assert.match(collectionSingle, /"class" \(cond \(eq \$itemSlug \$startHereSlug\) "collection-item--start-here"/);

  assert.match(collectionMembership, /class="collection-membership__eyebrow"/);
  assert.match(collectionMembership, /class="collection-membership__row"/);
  assert.match(collectionMembership, /class="collection-membership__title"/);
  assert.match(collectionMembership, /class="collection-membership__meta"/);

  for (const selector of [
    ".collection-room{",
    ".collection-room__section{",
    ".collection-room__header,",
    ".collection-room__section--overview,",
    ".collection-room__section--entry,",
    ".collection-room__section--progress{",
    ".collection-room__section--items,",
    ".collection-room__section--related,",
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
  assert.match(articleSingle, /partial "authors\/byline\.html"/);
  assert.match(articleSingle, /partial "authors\/card\.html"/);
  assert.match(articleSingle, /<div class="piece-body">/);
  assert.doesNotMatch(articleSingle, /single-page/);
  assert.doesNotMatch(articleSingle, /single-content/);
  assert.match(css, /\.newsletter-signup--page\{\s*margin-top:0;\s*\}/);
  assert.match(css, /\.running-header\{/);
  assert.match(css, /\.running-header__inner\{/);
});

test("about and author pages own dedicated profile layouts and styling", () => {
  assert.match(aboutSingle, /class="profile-page profile-page--about"/);
  assert.match(aboutSingle, /id="about-highlights-title"/);
  assert.match(aboutSingle, /Meet the author/);
  assert.match(aboutSingle, /"label" "Home"/);
  assert.match(authorList, /partial "authors\/directory\.html" \./);
  assert.match(authorSection, /partial "authors\/directory\.html" \./);
  assert.match(authorDirectory, /class="profile-page profile-page--authors"/);
  assert.match(authorDirectory, /id="authors-directory-title"/);
  assert.match(authorDirectory, /View author archive/);
  assert.match(authorSingle, /class="profile-page profile-page--author"/);
  assert.match(authorSingle, /Recent Essays/);
  assert.match(authorSingle, /Essay Archive/);

  for (const selector of [
    ".piece-byline{",
    ".author-note{",
    ".profile-page{",
    ".profile-stats{",
    ".profile-stat{",
    ".site-footer{",
    ".site-footer__nav{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("layout ownership matrix tracks the Welcome-route removal cleanly", () => {
  for (const snippet of [
    "`home-manifesto`",
    "`home-manifesto__inner`",
    "`home-manifesto__line--primary`",
    "`home-manifesto__line--secondary`",
    "`collection-room`",
    "`collection-room__header`",
    "`collection-room__section`",
    "`collection-room__section--overview`",
    "`collection-room__section--entry`",
    "`collection-room__section--progress`",
    "`collection-room__section--items`",
    "`collection-room__section--related`",
    "`collection-item-note`",
    "`running-header__inner`",
    "`reading-path__header`",
    "`reading-path__actions`",
    "`reading-path__preview`",
    "`reading-path__archive-links`",
    "## Removed Layout Hooks"
  ]) {
    assert.match(layoutMatrix, new RegExp(escapeRegex(snippet)));
  }

  for (const stalePhrase of [
    "`start-here-page`",
    "`newsletter-signup--start-here`",
    "Start Here | `/start-here/`",
    "Verify that most content-authored `start-here-*` classes remain unstyled",
    "Verify `content/start-here/index.md` against `assets/css/main.css`."
  ]) {
    assert.doesNotMatch(layoutMatrix, new RegExp(escapeRegex(stalePhrase)));
  }
});
