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
const articlePlateLightbox = fs.readFileSync(path.resolve("layouts/partials/article/plate-lightbox.html"), "utf8");
const layoutMatrix = fs.readFileSync(path.resolve("docs/layout-ownership-matrix.md"), "utf8");
const css = fs.readFileSync(path.resolve("assets/css/main.css"), "utf8");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("homepage manifesto owns deliberate route-level hooks and drops dead start-here selectors", () => {
  assert.match(homeImprintStatement, /class="home-manifesto"/);
  assert.match(homeImprintStatement, /class="home-manifesto__inner page-shell page-shell--wide"/);
  assert.match(homeImprintStatement, /class="home-manifesto__copy"/);
  assert.match(homeImprintStatement, /class="home-manifesto__line"/);
  assert.match(homeImprintStatement, /Ask for the evidence\. Read past the headlines\. Think for yourself\./);
  assert.doesNotMatch(homeImprintStatement, /home-manifesto__line--primary/);
  assert.doesNotMatch(homeImprintStatement, /home-manifesto__line--secondary/);
  assert.doesNotMatch(homeImprintStatement, /A digital imprint of essays, reports, dialogues, and literature\./);

  for (const selector of [
    ".home-manifesto{",
    ".home-manifesto__inner{",
    ".home-manifesto__copy{",
    ".home-manifesto__line{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }

  for (const retiredSelector of [
    ".home-manifesto__line--primary{",
    ".home-manifesto__line--secondary{"
  ]) {
    assert.doesNotMatch(css, new RegExp(escapeRegex(retiredSelector)));
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

test("collection detail section-front hooks have explicit inner-structure styling", () => {
  assert.match(collectionSingle, /class="collection-section"/);
  assert.match(collectionSingle, /collection-section__header/);
  assert.match(collectionSingle, /collection-section__ledger/);
  assert.match(collectionSingle, /collection-section__lead/);
  assert.match(collectionSingle, /collection-section__contents/);
  assert.match(collectionSingle, /collection-section__items/);
  assert.match(collectionSingle, /collection-section__item/);
  assert.match(collectionSingle, /collection-section__related/);
  assert.match(collectionSingle, /collection-section__related-list/);
  assert.match(collectionSingle, /collection-section__next/);
  assert.match(collectionSingle, /<h1>\{\{ \$definition\.title \}\}<\/h1>/);
  assert.match(collectionSingle, /<h2 id="collection-start-here-title">Start Here<\/h2>/);
  assert.match(collectionSingle, /\{\{ if not \(and \$startHere \$isStartHere\) \}\}/);
  assert.doesNotMatch(collectionSingle, /\$definition\.description/);
  assert.doesNotMatch(collectionSingle, /collection-room/);
  assert.doesNotMatch(collectionSingle, /data-collection-room-theme/);
  assert.doesNotMatch(collectionSingle, /partial "collections\/collection-progress\.html"/);
  assert.doesNotMatch(collectionSingle, /data-collection-item-path/);
  assert.doesNotMatch(collectionSingle, /collection-item-state/);

  assert.match(collectionMembership, /class="collection-membership__eyebrow"/);
  assert.match(collectionMembership, /class="collection-membership__row"/);
  assert.match(collectionMembership, /class="collection-membership__title"/);
  assert.match(collectionMembership, /class="collection-membership__meta"/);

  for (const selector of [
    ".collection-section{",
    ".collection-section__header{",
    ".collection-section__ledger{",
    ".collection-section__lead,",
    ".collection-section__contents,",
    ".collection-section__heading{",
    ".collection-section__items{",
    ".collection-section__item{",
    ".collection-section__related-list{",
    ".collection-section__next{",
    ".collection-membership__eyebrow{",
    ".collection-membership__row{",
    ".collection-membership__title{",
    ".collection-membership__meta{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }
});

test("collections index uses a ruled broadsheet directory and drops card-grid guidance", () => {
  assert.match(collectionList, /section-front section-front--collections/);
  assert.match(collectionList, /section-front__header/);
  assert.match(collectionList, /collections-broadsheet__summary/);
  assert.match(collectionList, /class="page-shell page-shell--grid collections-broadsheet"/);
  assert.match(collectionList, /class="collections-broadsheet__section"/);
  assert.match(collectionList, /class="collections-broadsheet__section-header"/);
  assert.match(collectionList, /class="collections-broadsheet__section-title"/);
  assert.match(collectionList, /class="collections-broadsheet__section-meta"/);
  assert.match(collectionList, /class="collections-broadsheet__section-intro"/);
  assert.match(collectionList, /class="collections-broadsheet__records"/);
  assert.match(collectionList, /"variant" "broadsheet"/);
  assert.doesNotMatch(collectionList, /partial "journey_links\.html"/);
  assert.doesNotMatch(collectionList, /Featured Collections/);
  assert.doesNotMatch(collectionList, /Collections Index/);
  assert.doesNotMatch(collectionList, /"variant" "item"/);
  assert.doesNotMatch(collectionList, /collections-directory__guide/);
  assert.doesNotMatch(collectionList, /class="grid collection-grid/);

  for (const selector of [
    ".collections-broadsheet__summary{",
    ".collections-broadsheet{",
    ".collections-broadsheet::before{",
    ".collections-broadsheet__section{",
    ".collections-broadsheet__section::before{",
    ".collections-broadsheet__section-header{",
    ".collections-broadsheet__section-title{",
    ".collections-broadsheet__section-meta{",
    ".collections-broadsheet__section-intro{",
    ".collections-broadsheet__records{",
    ".collection-record{",
    ".collection-record__title{",
    ".collection-record__start{"
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
  const bodyIndex = articleSingle.indexOf('class="piece-body"');
  const articleClose = articleSingle.indexOf("</article>", bodyIndex);
  const lightboxInclude = articleSingle.indexOf('partial "article/plate-lightbox.html" .', articleClose);

  assert.ok(articleClose >= 0);
  assert.ok(lightboxInclude > articleClose);
  assert.equal(articleSingle.indexOf("{{ if $plateImage }}", articleClose), -1);
  assert.match(articleSingle, new RegExp(escapeRegex('<article class="{{ delimit $articleClasses " " }}"')));
  assert.match(articleSingle, /data-piece-collection-slug="\{\{ \$primaryCollection\.collection\.slug \}\}"/);
  assert.match(articleSingle, /class="piece-fleuron"/);
  assert.match(articleSingle, /class="piece-header-composition"/);
  assert.match(articleSingle, /class="piece-record-rail"/);
  assert.match(articleSingle, /piece-record-rail__item--collection/);
  assert.match(articleSingle, /data-article-plate-lightbox-trigger/);
  assert.match(articleSingle, /partial "article\/plate-lightbox\.html"/);
  assert.match(articleSingle, /class="piece-title-block/);
  assert.match(articleSingle, /class="article-publication-record"/);
  assert.match(articleSingle, /data-analytics-source-slot="article_collection_context"/);
  assert.match(articleSingle, /partial "authors\/byline\.html"/);
  assert.doesNotMatch(articleSingle, /partial "authors\/card\.html"/);
  assert.doesNotMatch(articleSingle, /partial "newsletter_signup\.html"/);
  assert.doesNotMatch(articleSingle, /partial "running_header\.html"/);
  assert.doesNotMatch(articleSingle, /From the Collection/);
  assert.match(articleSingle, /journey-links--article-exit/);
  assert.doesNotMatch(articleSingle, /journey-links--article"/);
  assert.doesNotMatch(articleSingle, /partial "read_next\.html"/);
  assert.match(articleSingle, /<div class="piece-body">/);
  assert.match(articlePlateLightbox, /closest\("\[data-article-plate-lightbox-trigger\]"\)/);
  assert.match(articlePlateLightbox, /bodyImageSelector = "\.piece-body img"/);
  assert.match(articlePlateLightbox, /article-lightbox-image/);
  assert.match(articlePlateLightbox, /parent\.closest\("a, button, \[role=\\"button\\"\], \[data-article-plate-lightbox-trigger\]"\)/);
  assert.match(articlePlateLightbox, /setAttribute\("tabindex", "0"\)/);
  assert.match(articlePlateLightbox, /setAttribute\("role", "button"\)/);
  assert.match(articlePlateLightbox, /setAttribute\("aria-label", "Open image fullscreen: " \+ imageTitle\)/);
  assert.match(articlePlateLightbox, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(articlePlateLightbox, /event\.key === "Spacebar"/);
  assert.match(articlePlateLightbox, /figure\.querySelector\("figcaption"\)/);
  assert.match(articlePlateLightbox, /figure\.querySelector\("\.article-source-caption"\)/);
  assert.match(articlePlateLightbox, /normalizeCaptionText\(captionText \|\| elementText\(sourceCaption\)\)/);
  assert.match(articlePlateLightbox, /captionText === normalizeCaptionText\(imageTitle\)/);
  assert.doesNotMatch(articlePlateLightbox, /captionText \|\| elementText\(sourceCaption\) \|\| imageTitle/);
  assert.doesNotMatch(articleSingle, /single-page/);
  assert.doesNotMatch(articleSingle, /single-content/);
  assert.match(css, /\.piece-title-block\{/);
  assert.match(css, /\.piece-fleuron\{/);
  assert.match(css, /\.piece-media-plate\{/);
  assert.match(css, /\.piece-media-plate__trigger\{/);
  assert.match(css, /\.piece-record-rail\{/);
  assert.match(css, /\.article-publication-record\{/);
  assert.doesNotMatch(css, /\.piece--collection-accent/);
  assert.doesNotMatch(css, /\.piece-collection-context/);
  assert.match(css, /\.piece-body img\.article-lightbox-image\{/);
  assert.match(css, /\.piece-body img\.article-lightbox-image:focus-visible\{/);
  assert.match(css, /\.journey-links--article-exit\{/);
  assert.doesNotMatch(css, /\.read-next/);
  assert.doesNotMatch(css, /\.running-header\{/);
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
    "`home-manifesto__copy`",
    "`home-manifesto__line`",
    "`home-almanack`",
    "`home-almanack__ledger`",
    "`newsletter-signup--home-ribbon`",
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
    "`collections-broadsheet`",
    "`collections-broadsheet__section`",
    "`collections-broadsheet__records`",
    "`collection-record`",
    "`collection-record__title`",
    "`collection-record__start`",
    "`collection-section`",
    "`collection-section__header`",
    "`collection-section__ledger`",
    "`collection-section__lead`",
    "`collection-section__contents`",
    "`collection-section__items`",
    "`collection-section__related`",
    "| Gallery | `/gallery/`",
    "`piece-title-block`",
    "`piece-fleuron`",
    "`piece-media-plate`",
    "`piece-media-plate__trigger`",
    "`piece-record-rail`",
    "`piece-record-rail__item--collection`",
    "`.article-lightbox-image`",
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
    "`home-manifesto__line--primary`",
    "`home-manifesto__line--secondary`",
    "`collection-room`",
    "`collections-directory__guide*`",
    "| Essays front | `/essays/`",
    "| Section landing family | `/syd-and-oliver/`,",
    "Start Here | `/start-here/`",
    "Verify that most content-authored `start-here-*` classes remain unstyled",
    "Verify `content/start-here/index.md` against `assets/css/main.css`."
  ]) {
    assert.doesNotMatch(layoutMatrix, new RegExp(escapeRegex(stalePhrase)));
  }
});
