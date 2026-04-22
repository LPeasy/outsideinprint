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
const essaysList = fs.readFileSync(path.resolve("layouts/essays/list.html"), "utf8");
const collectionList = fs.readFileSync(path.resolve("layouts/collections/list.html"), "utf8");
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
  assert.match(collectionSingle, /collection-room__section collection-room__section--entry/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--progress/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--items/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--related/);
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
    ".collection-room__section--entry,",
    ".collection-room__section--progress{",
    ".collection-room__section--items,",
    ".collection-room__section--related,",
    ".collection-grid{",
    ".collection-card{",
    ".collection-meta{",
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

test("collections index uses a unified card directory and drops the retired split sections", () => {
  assert.match(collectionList, /class="page-shell page-shell--grid collections-directory"/);
  assert.match(collectionList, /class="collections-directory__group"/);
  assert.match(collectionList, /class="collections-directory__group-title"/);
  assert.match(collectionList, /class="grid collection-grid collections-directory__grid"/);
  assert.doesNotMatch(collectionList, /Featured Collections/);
  assert.doesNotMatch(collectionList, /Collections Index/);
  assert.doesNotMatch(collectionList, /"variant" "item"/);

  for (const selector of [
    ".collections-directory{",
    ".collections-directory__group{",
    ".collections-directory__group-title{",
    ".collections-directory__grid{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("essays front owns a dedicated route layout and drops the generic section-list path", () => {
  for (const snippet of [
    'class="essays-front"',
    'class="page-header page-shell page-shell--wide essays-front__masthead"',
    'class="page-intro essays-front__deck"',
    'class="page-intro essays-front__stats"',
    'class="page-shell page-shell--wide essays-front__edition"',
    'class="essays-front__lead"',
    'class="essays-front__rail"',
    'essays-front__rail-item--with-summary',
    'class="page-shell page-shell--wide essays-front__cartoon"',
    'class="essays-front__cartoon-caption"',
    'class="page-shell page-shell--wide essays-front__archive"',
    'class="essays-front__month-title"',
    'partial "discovery/page-list-item.html"',
    'collectionPlacement" "kicker"'
  ]) {
    assert.match(essaysList, new RegExp(escapeRegex(snippet)));
  }

  assert.doesNotMatch(essaysList, /partial "journey_links\.html"/);

  for (const selector of [
    ".essays-front{",
    ".essays-front__masthead{",
    ".essays-front__edition{",
    ".essays-front__edition-grid{",
    ".essays-front__lead{",
    ".essays-front__rail{",
    ".essays-front__rail-item{",
    ".essays-front__rail-item--with-summary{",
    ".essays-front__cartoon{",
    ".essays-front__cartoon-caption{",
    ".essays-front__archive{",
    ".essays-front__month{",
    ".essays-front__month-title{",
    ".essays-front__month-list{",
    ".item-kicker{",
    ".item-kicker--collection{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("article single template removes dead generic layout hooks and uses page-flow ownership", () => {
  assert.match(articleSingle, /<article class="piece"/);
  assert.match(articleSingle, /append "piece--collection-accent"/);
  assert.match(articleSingle, /data-piece-collection-slug="\{\{ \$primaryCollection\.collection\.slug \}\}"/);
  assert.match(articleSingle, /data-piece-collection-room-theme="\{\{ \$primaryCollection\.collection\.room_theme \}\}"/);
  assert.match(articleSingle, /class="piece-collection-context"/);
  assert.match(articleSingle, /From the Collection/);
  assert.match(articleSingle, /data-analytics-source-slot="article_collection_context"/);
  assert.match(articleSingle, /partial "authors\/byline\.html"/);
  assert.match(articleSingle, /partial "authors\/card\.html"/);
  assert.match(articleSingle, /<div class="piece-body">/);
  assert.doesNotMatch(articleSingle, /single-page/);
  assert.doesNotMatch(articleSingle, /single-content/);
  assert.match(css, /\.piece--collection-accent\{/);
  assert.match(css, /\.piece--collection-accent \.piece-collection-context,/);
  assert.match(css, /\.piece--collection-accent \.reading-path\{/);
  assert.match(css, /\.piece--collection-accent--ai-screen-glow-archive\{/);
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
    "`essays-front`",
    "`essays-front__masthead`",
    "`essays-front__edition`",
    "`essays-front__edition-grid`",
    "`essays-front__lead`",
    "`essays-front__rail`",
    "`essays-front__rail-item`",
    "`essays-front__rail-item--with-summary`",
    "`essays-front__cartoon`",
    "`essays-front__cartoon-caption`",
    "`essays-front__archive`",
    "`essays-front__month`",
    "`essays-front__month-title`",
    "`essays-front__month-list`",
    "`collection-room`",
    "`collection-room__header`",
    "`collection-room__section`",
    "`collection-room__section--entry`",
    "`collection-room__section--progress`",
    "`collection-room__section--items`",
    "`collection-room__section--related`",
    "`collections-directory`",
    "`collections-directory__group`",
    "`collections-directory__group-title`",
    "`collections-directory__grid`",
    "`collection-item-note`",
    "`piece--collection-accent`",
    "`piece-collection-context`",
    "`piece-collection-context__eyebrow`",
    "`piece-collection-context__title`",
    "`piece-collection-context__meta`",
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
    "| Section landing family | `/essays/`,",
    "Start Here | `/start-here/`",
    "Verify that most content-authored `start-here-*` classes remain unstyled",
    "Verify `content/start-here/index.md` against `assets/css/main.css`."
  ]) {
    assert.doesNotMatch(layoutMatrix, new RegExp(escapeRegex(stalePhrase)));
  }
});
