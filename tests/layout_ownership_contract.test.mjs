import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const homeImprintStatement = fs.readFileSync(path.resolve("layouts/partials/home_imprint_statement.html"), "utf8");
const aboutSingle = fs.readFileSync(path.resolve("layouts/about/single.html"), "utf8");
const authorDirectory = fs.readFileSync(path.resolve("layouts/partials/authors/directory.html"), "utf8");
const authorDossier = fs.readFileSync(path.resolve("layouts/authors/dossier.html"), "utf8");
const authorList = fs.readFileSync(path.resolve("layouts/authors/list.html"), "utf8");
const authorSection = fs.readFileSync(path.resolve("layouts/authors/section.html"), "utf8");
const archiveList = fs.readFileSync(path.resolve("layouts/archive/list.html"), "utf8");
const essaysRedirect = fs.readFileSync(path.resolve("layouts/essays/list.html"), "utf8");
const dialoguesList = fs.readFileSync(path.resolve("layouts/syd-and-oliver/list.html"), "utf8");
const collectionList = fs.readFileSync(path.resolve("layouts/collections/list.html"), "utf8");
const galleryList = fs.readFileSync(path.resolve("layouts/gallery/list.html"), "utf8");
const libraryList = fs.readFileSync(path.resolve("layouts/library/list.html"), "utf8");
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
  assert.match(collectionSingle, /collection-room__eyebrow/);
  assert.match(collectionSingle, /collection-room__summary/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--entry/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--progress/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--items/);
  assert.match(collectionSingle, /collection-room__section collection-room__section--related/);
  assert.match(collectionSingle, /collection-room__section-intro/);
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
    ".collection-room__eyebrow{",
    ".collection-room__summary,",
    ".collection-room__section--entry,",
    ".collection-room__section--progress{",
    ".collection-room__section--items,",
    ".collection-room__section--related,",
    ".collection-room__section-intro{",
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
  assert.match(collectionList, /section-front section-front--collections/);
  assert.match(collectionList, /section-front__header/);
  assert.match(collectionList, /class="page-shell page-shell--wide collections-directory__guide"/);
  assert.match(collectionList, /collections-directory__guide-card/);
  assert.match(collectionList, /collections-directory__guide-title/);
  assert.match(collectionList, /class="page-shell page-shell--grid collections-directory"/);
  assert.match(collectionList, /class="collections-directory__group"/);
  assert.match(collectionList, /class="collections-directory__group-header"/);
  assert.match(collectionList, /class="collections-directory__group-title"/);
  assert.match(collectionList, /class="collections-directory__group-meta"/);
  assert.match(collectionList, /class="collections-directory__group-intro"/);
  assert.match(collectionList, /class="grid collection-grid collections-directory__grid"/);
  assert.doesNotMatch(collectionList, /partial "journey_links\.html"/);
  assert.doesNotMatch(collectionList, /Featured Collections/);
  assert.doesNotMatch(collectionList, /Collections Index/);
  assert.doesNotMatch(collectionList, /"variant" "item"/);

  for (const selector of [
    ".collections-directory__summary{",
    ".collections-directory__guide{",
    ".collections-directory__guide-card{",
    ".collections-directory__guide-kicker,",
    ".collections-directory__guide-title{",
    ".collections-directory__guide-copy{",
    ".collections-directory__guide-meta{",
    ".collections-directory{",
    ".collections-directory__group{",
    ".collections-directory__group-header{",
    ".collections-directory__group-title{",
    ".collections-directory__group-meta{",
    ".collections-directory__group-intro{",
    ".collections-directory__grid{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("gallery and library use the shared section-front top-zone shell while archive stays route-owned", () => {
  assert.match(galleryList, /section-front section-front--gallery/);
  assert.match(galleryList, /section-front__header/);
  assert.match(galleryList, /section-front__body/);
  assert.match(galleryList, /cartoon-gallery-spotlight/);

  assert.match(libraryList, /section-front section-front--library/);
  assert.match(libraryList, /section-front__header/);
  assert.match(libraryList, /section-front__body/);
  assert.match(libraryList, /Search the archive by title, type, collection, or version\./);
  assert.doesNotMatch(libraryList, /partial "journey_links\.html"/);

  for (const selector of [
    ".section-front{",
    ".section-front__header{",
    ".section-front__body{",
    ".section-front--gallery .cartoon-gallery-spotlight{",
    ".section-front--library .library-search--filters,"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("archive shell owns the long-form list routes while /essays/ becomes a redirect alias", () => {
  for (const snippet of [
    'partial "archive/resolve-pages.html"',
    '"mode" "archive"',
    'partial "archive/render-list.html"',
    '"idPrefix" "archive"'
  ]) {
    assert.match(archiveList, new RegExp(escapeRegex(snippet)));
  }

  for (const retiredSnippet of [
    'partial "journey_links.html"',
    'Current Edition',
    'Rolling Archive',
    'site.Data.editorial_cartoons',
    '"mode" "dialogue"'
  ]) {
    assert.doesNotMatch(archiveList, new RegExp(escapeRegex(retiredSnippet)));
  }

  for (const selector of [
    ".essays-front{",
    ".essays-front__masthead{",
    ".essays-front__stats{",
    ".essays-front__year-nav{",
    ".essays-front__year-jumps{",
    ".essays-front__year-link{",
    ".essays-front__archive{",
    ".essays-front__month{",
    ".essays-front__month-title{",
    ".essays-front__month-list{",
    ".item-kicker{",
    ".item-kicker--collection{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }

  for (const snippet of [
    'partial "archive/resolve-pages.html"',
    '"mode" "dialogue"',
    'partial "archive/render-list.html"',
    '"idPrefix" "dialogues"'
  ]) {
    assert.match(dialoguesList, new RegExp(escapeRegex(snippet)));
  }

  for (const snippet of [
    'Redirecting to Outside In Print Archive',
    'noindex, follow',
    '<link rel="canonical" href="{{ "archive/" | absURL }}" />',
    '<meta http-equiv="refresh" content="0; url={{ "archive/" | relURL }}" />',
    'window.location.replace("{{ "archive/" | relURL }}");'
  ]) {
    assert.match(essaysRedirect, new RegExp(escapeRegex(snippet)));
  }

  for (const retiredSnippet of [
    'define "main"',
    'class="essays-front"',
    'partial "archive/render-list.html"'
  ]) {
    assert.doesNotMatch(essaysRedirect, new RegExp(escapeRegex(retiredSnippet)));
  }
});

test("article single template removes dead generic layout hooks and uses page-flow ownership", () => {
  assert.match(articleSingle, new RegExp(escapeRegex('<article class="{{ delimit $articleClasses " " }}"')));
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

test("about and author routes own distinct imprint-aligned shells", () => {
  assert.match(aboutSingle, /class="about-route"/);
  assert.match(aboutSingle, /section-front section-front--about/);
  assert.match(aboutSingle, /about-route__artifact/);
  assert.match(aboutSingle, /about-route__record/);
  assert.match(aboutSingle, /Reading Map/);
  assert.match(aboutSingle, /"label" "Home"/);
  assert.match(aboutSingle, /"label" "Meet the author"/);
  assert.match(authorList, /partial "authors\/directory\.html" \./);
  assert.match(authorSection, /partial "authors\/directory\.html" \./);
  assert.match(authorDirectory, /class="profile-page profile-page--authors"/);
  assert.match(authorDirectory, /id="authors-directory-title"/);
  assert.match(authorDirectory, /View author archive/);
  assert.match(authorDossier, /class="author-route"/);
  assert.match(authorDossier, /section-front section-front--author/);
  assert.match(authorDossier, /author-route__profile/);
  assert.match(authorDossier, /author-route__portrait/);
  assert.match(authorDossier, /author-route__summary/);
  assert.match(authorDossier, /author-route__bio/);
  assert.match(authorDossier, /author-route__reading-map/);
  assert.match(authorDossier, /journey-links--page author-route__journey/);
  assert.doesNotMatch(authorDossier, /Author Dossier/);
  assert.doesNotMatch(authorDossier, /Selected Works/);
  assert.doesNotMatch(authorDossier, /Themes/);
  assert.doesNotMatch(authorDossier, /From the Archive/);

  for (const selector of [
    ".about-route{",
    ".about-route__artifact{",
    ".about-route__artifact-panel,",
    ".about-route__record{",
    ".about-route__record-row{",
    ".about-route__journey{",
    ".section-front--author{",
    ".author-route{",
    ".author-route__profile{",
    ".author-route__portrait{",
    ".author-route__summary{",
    ".author-route__bio{",
    ".author-route__reading-map{",
    ".author-route__journey{",
    ".piece-byline{",
    ".author-note{",
    ".profile-page{",
    ".site-footer{",
    ".site-footer__nav{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("layout ownership matrix tracks archive-shell ownership and the essays redirect alias", () => {
  for (const snippet of [
    "`home-manifesto`",
    "`home-manifesto__inner`",
    "`.home-manifesto__line--primary`",
    "`.home-manifesto__line--secondary`",
    "| About route | `/about/`",
    "`section-front--about`",
    "`about-route`",
    "`about-route__artifact`",
    "`about-route__record`",
    "`about-route__journey`",
    "| Author route | `/authors/robert-v-ussley/`",
    "`section-front--author`",
    "`author-route`",
    "`author-route__profile`",
    "`author-route__portrait`",
    "`author-route__summary`",
    "`author-route__bio`",
    "`author-route__reading-map`",
    "`author-route__journey`",
    "`essays-front`",
    "`essays-front__masthead`",
    "`essays-front__stats`",
    "`essays-front__year-nav`",
    "`essays-front__year-jumps`",
    "`essays-front__year-link`",
    "`essays-front__archive`",
    "`essays-front__month`",
    "`essays-front__month-title`",
    "`essays-front__month-list`",
    "`section-front`",
    "`section-front__header`",
    "`section-front__body`",
    "`collection-room`",
    "`collection-room__header`",
    "`collection-room__eyebrow`",
    "`collection-room__summary`",
    "`collection-room__section`",
    "`collection-room__section--entry`",
    "`collection-room__section--progress`",
    "`collection-room__section--items`",
    "`collection-room__section--related`",
    "`collection-room__section-intro`",
    "`collections-directory`",
    "`collections-directory__guide*`",
    "`collections-directory__group`",
    "`collections-directory__group-title`",
    "`collections-directory__grid`",
    "| Gallery | `/gallery/`",
    "`collection-item-note`",
    "`collection-card__description`",
    "`piece--collection-accent`",
    "`piece-collection-context`",
    "`piece-collection-context__eyebrow`",
    "`piece-collection-context__title`",
    "`piece-collection-context__meta`",
    "`.running-header__inner`",
    "`reading-path__header`",
    "`reading-path__actions`",
    "`reading-path__preview`",
    "`reading-path__archive-links`",
    "| Archive shell | `/archive/`, `/syd-and-oliver/`",
    "| Essays redirect alias | `/essays/`",
    "## Removed Layout Hooks"
  ]) {
    assert.match(layoutMatrix, new RegExp(escapeRegex(snippet)));
  }

  for (const stalePhrase of [
    "`start-here-page`",
    "`newsletter-signup--start-here`",
    "| Essays front | `/essays/`",
    "| Section landing family | `/syd-and-oliver/`,",
    "Start Here | `/start-here/`",
    "Verify that most content-authored `start-here-*` classes remain unstyled",
    "Verify `content/start-here/index.md` against `assets/css/main.css`."
  ]) {
    assert.doesNotMatch(layoutMatrix, new RegExp(escapeRegex(stalePhrase)));
  }
});
