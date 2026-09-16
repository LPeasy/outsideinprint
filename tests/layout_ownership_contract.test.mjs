import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const homeFrontPage = fs.readFileSync(path.resolve("layouts/partials/home_front_page.html"), "utf8");
const homeV2FrontPage = fs.readFileSync(path.resolve("layouts/partials/home_v2_front_page.html"), "utf8");
const homeReaderBanner = fs.readFileSync(path.resolve("layouts/partials/home_reader_banner.html"), "utf8");
const aboutSingle = fs.readFileSync(path.resolve("layouts/about/single.html"), "utf8");
const aboutContent = fs.readFileSync(path.resolve("content/about/index.md"), "utf8");
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

test("retired homepage manifesto and start-here selectors stay absent", () => {
  assert.equal(fs.existsSync(path.resolve("layouts/partials/home_imprint_statement.html")), false);

  for (const retiredSelector of [
    ".home-manifesto{",
    ".home-manifesto__inner{",
    ".home-manifesto__copy{",
    ".home-manifesto__line{",
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

test("homepage V2 owns its proof, featured-reading, and contributor layout hooks", () => {
  assert.match(homeFrontPage, /partial "home_v2_front_page\.html" \./);
  assert.doesNotMatch(homeFrontPage, /home_bookstore_spotlight|home_selected_collections|newsletter_signup|home_2045_launch/);

  for (const snippet of [
    'partial "home_reader_banner.html" .',
    'class="home-front-page__orientation"',
    'class="home-v2-featured page-shell page-shell--wide"',
    'class="home-v2-featured__grid"',
    'class="home-v2-featured__lead"',
    'class="home-v2-featured__supporting"',
    'class="home-v2-next page-shell page-shell--wide"',
    'class="home-v2-next__contribute"',
    'class="home-v2-next__cta"'
  ]) {
    assert.match(homeV2FrontPage, new RegExp(escapeRegex(snippet)));
  }
  assert.doesNotMatch(homeV2FrontPage, /home-bookstore|home-almanack|entry-threads--home|newsletter-signup--home-ribbon|home_imprint_statement|home-manifesto/);

  for (const snippet of [
    'class="home-reader-banner page-shell page-shell--wide"',
    'class="home-reader-banner__proof"',
    'class="home-reader-banner__signup"',
    'class="home-reader-banner__controls"',
    'data-analytics-source-slot="homepage_reader_banner"'
  ]) {
    assert.match(homeReaderBanner, new RegExp(escapeRegex(snippet)));
  }

  for (const selector of [
    ".home-reader-banner{",
    ".home-reader-banner__proof{",
    ".home-reader-banner__signup{",
    ".home-reader-banner__controls{",
    ".home-front-page__orientation{",
    ".home-front-page__welcome-label{",
    ".home-front-page__welcome-copy{",
    ".home-front-page__welcome-links{",
    ".home-v2{",
    ".home-v2-featured{",
    ".home-v2-featured__grid{",
    ".home-v2-featured__lead{",
    ".home-v2-featured__supporting{",
    ".home-v2-next{",
    ".home-v2-next__contribute{",
    ".home-v2-next__cta{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }

  assert.match(css, /\.home-reader-banner\.page-shell--wide\{[^}]*max-width:70rem;/);
  assert.match(css, /\.home-v2-featured\.page-shell--wide,\s*\.home-v2-next\.page-shell--wide\{[^}]*max-width:70rem;/);
  assert.match(css, /\.home-front-page__orientation\{[^}]*display:grid;[^}]*grid-template-areas:\s*"label"\s*"copy"\s*"links";[^}]*max-width:70rem;/);
  assert.match(css, /\.home-front-page__welcome-label\{[^}]*font-size:\.8125rem;[^}]*letter-spacing:\.1em;/);
  assert.match(css, /\.home-front-page__welcome-copy\{[^}]*margin:0;[^}]*font-size:\.94rem;[^}]*line-height:1\.42;/);
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
  assert.match(libraryList, /Search published work by title, topic, tag, type, year, or collection\./);
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

test("archive shell owns /archive/ while section compatibility routes redirect", () => {
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
    'hugo.Data.editorial_cartoons',
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
    'Redirecting to Syd and Oliver Dialogues',
    'noindex, follow',
    '.Params.redirect_to',
    '<link rel="canonical" href="{{ $target | absURL }}" />',
    '.OutputFormats.Get "RSS"',
    'window.location.replace("{{ $target | relURL }}");'
  ]) {
    assert.match(dialoguesList, new RegExp(escapeRegex(snippet)));
  }

  for (const retiredSnippet of [
    'partial "archive/resolve-pages.html"',
    'partial "archive/render-list.html"',
    '"idPrefix" "dialogues"'
  ]) {
    assert.doesNotMatch(dialoguesList, new RegExp(escapeRegex(retiredSnippet)));
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
  assert.match(articleSingle, /partial "newsletter_signup\.html"/);
  assert.match(articleSingle, /newsletter-signup--article-exit/);
  assert.match(articleSingle, /article_exit_newsletter/);
  assert.match(articleSingle, /\{\{ with \.Params\.studio_sample \}\}[\s\S]*?partial "article\/studio-sample-exit\.html"[\s\S]*?\{\{ else \}\}/);
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
  for (const snippet of [
    "`studio_sample` front matter",
    "`layouts/partials/article/studio-sample-exit.html`",
    "replace the standard newsletter, reading-path, signup, and journey-link exit stack",
  ]) {
    assert.match(layoutMatrix, new RegExp(escapeRegex(snippet)));
  }
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
  assert.match(aboutSingle, /"label" "Featured reading"/);
  assert.match(aboutSingle, /"label" "Meet the author"/);
  assert.match(aboutSingle, /<p class="about-route__artifact-kicker">Behind Outside In Print<\/p>/);
  assert.match(aboutSingle, /<h2 id="about-imprint-record-title" class="about-route__artifact-title">[^<]+<\/h2>/);
  assert.match(aboutSingle, /with \.Params\.description[\s\S]*?class="about-route__artifact-dek"/);
  assert.match(aboutSingle, /class="about-route__actions"[\s\S]*?<a href="#about-newsletter">[^<]*newsletter<\/a>[\s\S]*?#home-v2-featured-title/);
  assert.match(aboutSingle, /partial "newsletter_signup\.html"[\s\S]*?"sourceSlot" "about_newsletter"[\s\S]*?"anchorID" "about-newsletter"/);
  assert.doesNotMatch(aboutSingle, /"shop\/"/);
  assert.match(aboutSingle, /<h3[^>]*>At a glance<\/h3>/);
  assert.match(aboutSingle, /<dt class="about-route__record-label">Author<\/dt>/);
  assert.doesNotMatch(aboutSingle, />Imprint Record<|>Current File<|>Principal Byline</);
  assert.match(aboutContent, /description: "Independent writing on history, economics, culture, and public life\./);
  assert.match(aboutContent, /## Author and Publisher[\s\S]*?\]\(\/authors\/robert-v-ussley\/\)/);
  assert.match(aboutContent, /\]\(\/contribute\/\)/);
  assert.doesNotMatch(aboutContent, /principal authorial byline|essay corpus|without pretending to be a large editorial institution/);
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
  assert.match(authorDossier, /author-route__invitation/);
  assert.match(authorDossier, /author-route__actions/);
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
  for (const selector of [".about-route__actions", ".author-route__actions"]) {
    assert.match(css, new RegExp(`${escapeRegex(selector)}\\s*[,\\{]`));
  }
});

test("layout ownership matrix tracks homepage V2, contributor, archive, Apps, and Games routes", () => {
  for (const snippet of [
    "`.home-reader-banner`",
    "`.home-reader-banner__proof`",
    "`.home-reader-banner__signup`",
    "`.home-reader-banner__controls`",
    "`.home-front-page__orientation`",
    "`.home-v2-featured`",
    "`.home-v2-featured__grid`",
    "`.home-v2-featured__lead`",
    "`.home-v2-featured__supporting`",
    "`.home-v2-next`",
    "`.home-v2-next__contribute`",
    "`.home-v2-next__cta`",
    "| Contributor route | `/contribute/`",
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
    "| Apps & Tools index | `/apps/`",
    "| Bucks Machine product | `/apps/bucks-machine/`",
    "`apps-index`",
    "`apps-card`",
    "`apps-product`",
    "`apps-status`",
    "`apps-packet-preview`",
    "`apps-workflow`",
    "`apps-deliverables`",
    "`apps-samples`",
    "`apps-limitations`",
    "`apps-identity`",
    "| Games index | `/games/`",
    "| Games product family | `/games/:slug/`",
    "`games-index`",
    "`games-card`",
    "`games-product`",
    "`games-facts`",
    "`games-features`",
    "`games-gallery`",
    "`games-notices`",
    "`games-requirements`",
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
    "| Archive shell | `/archive/`",
    "| Section compatibility redirects | `/essays/`, `/syd-and-oliver/`",
    "## Removed Layout Hooks"
  ]) {
    assert.match(layoutMatrix, new RegExp(escapeRegex(snippet)));
  }

  for (const stalePhrase of [
    "`start-here-page`",
    "`newsletter-signup--start-here`",
    "`home-manifesto`",
    "`home-manifesto__inner`",
    "`home-manifesto__copy`",
    "`home-manifesto__line`",
    "`home-manifesto__line--primary`",
    "`home-manifesto__line--secondary`",
    "`collection-room`",
    "`collections-directory__guide*`",
    "`home-almanack`",
    "`newsletter-signup--home-ribbon`",
    "`home-bookstore`",
    "`home-front-page__stories`",
    "`entry-threads`",
    "| Essays front | `/essays/`",
    "| Section landing family | `/syd-and-oliver/`,",
    "Start Here | `/start-here/`",
    "Verify that most content-authored `start-here-*` classes remain unstyled",
    "Verify `content/start-here/index.md` against `assets/css/main.css`."
  ]) {
    assert.doesNotMatch(layoutMatrix, new RegExp(escapeRegex(stalePhrase)));
  }
});
