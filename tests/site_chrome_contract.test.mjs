import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readCurrentCartoonSlug(source) {
  const currentMatch = source.match(/^current:\s*(.+)$/m);
  assert.ok(currentMatch, "expected editorial cartoons data to define a current slug");
  return currentMatch[1].trim();
}

const masthead = fs.readFileSync(path.resolve("layouts/partials/masthead.html"), "utf8");
const homepage = fs.readFileSync(path.resolve("layouts/index.html"), "utf8");
const homeFrontPage = fs.readFileSync(path.resolve("layouts/partials/home_front_page.html"), "utf8");
const homeImprintStatement = fs.readFileSync(path.resolve("layouts/partials/home_imprint_statement.html"), "utf8");
const homeSelectedCollections = fs.readFileSync(path.resolve("layouts/partials/home_selected_collections.html"), "utf8");
const entryThreads = fs.readFileSync(path.resolve("layouts/partials/entry_threads.html"), "utf8");
const footer = fs.readFileSync(path.resolve("layouts/partials/footer.html"), "utf8");
const randomTemplate = fs.readFileSync(path.resolve("layouts/random/single.html"), "utf8");
const galleryTemplate = fs.readFileSync(path.resolve("layouts/gallery/list.html"), "utf8");
const galleryContent = fs.readFileSync(path.resolve("content/gallery/_index.md"), "utf8");
const cartoonData = fs.readFileSync(path.resolve("data/editorial_cartoons.yaml"), "utf8");
const currentCartoonSlug = readCurrentCartoonSlug(cartoonData);
const dialoguesSection = fs.readFileSync(path.resolve("content/syd-and-oliver/_index.md"), "utf8");
const css = fs.readFileSync(path.resolve("assets/css/main.css"), "utf8");

test("masthead removes Welcome and keeps the Dialogues label", () => {
  assert.doesNotMatch(masthead, />Welcome</);
  assert.match(masthead, />Essays</);
  assert.match(masthead, />Dialogues</);
  assert.match(masthead, />Collections</);
  assert.match(masthead, />Library</);
  assert.match(masthead, />Gallery</);
  assert.match(masthead, />Feeling curious\?</);
  assert.match(masthead, /\$isGallery := eq \.Section "gallery"/);
  assert.match(masthead, /href="\{\{ "gallery\/" \| absURL \}\}"/);
  assert.doesNotMatch(masthead, /href="\{\{ "start-here\/" \| absURL \}\}"/);
  assert.doesNotMatch(masthead, /\$isWelcome/);
  assert.doesNotMatch(masthead, />Books</);
  assert.match(masthead, /aria-current="page"/);
});

test("dialogues rename stays wired through the live discovery surfaces", () => {
  assert.match(dialoguesSection, /title: "Dialogues"/);
  assert.match(dialoguesSection, /description: "Dialogues and fiction from the recurring world of Syd and Oliver\."/);
  assert.doesNotMatch(dialoguesSection, /S and O/);
  assert.match(randomTemplate, /"label" "Home"/);
  assert.doesNotMatch(randomTemplate, /"label" "Welcome"/);
});

test("footer and random route now point readers home instead of Welcome", () => {
  assert.match(footer, /aria-label="Footer"/);
  assert.match(footer, /href="\{\{ "" \| absURL \}\}">Home</);
  assert.match(footer, /href="\{\{ "about\/" \| absURL \}\}">About</);
  assert.match(footer, /href="\{\{ "authors\/robert-v-ussley\/" \| absURL \}\}">Author</);
  assert.match(footer, /href="\{\{ "library\/" \| absURL \}\}">Library</);
  assert.doesNotMatch(footer, /href="\{\{ "start-here\/" \| absURL \}\}">Welcome</);

  assert.match(randomTemplate, /class="page-header page-shell page-shell--wide"/);
  assert.match(randomTemplate, /Feeling curious\? Let the archive choose the next piece\./);
  assert.match(randomTemplate, /partial "journey_links\.html"/);
  assert.match(randomTemplate, /"label" "Library"/);
  assert.match(randomTemplate, /"label" "Collections"/);
  assert.match(randomTemplate, /"label" "Home"/);
  assert.match(randomTemplate, /class="item random-route__status"/);
  assert.match(randomTemplate, /Finding a piece from the archive\.\.\./);
  assert.match(randomTemplate, /window\.location\.replace\(randomUrl\)/);
  assert.match(randomTemplate, /window\.location\.replace\(fallback\)/);
  assert.match(randomTemplate, /Open the Library/);
});

test("homepage browse band stays curated and replaces Welcome with Library", () => {
  assert.doesNotMatch(homepage, /<div class="k">(Start|Section|Index|Explore)<\/div>/);
  assert.doesNotMatch(homepage, /card-center/);
  assert.match(homepage, /class="home-browse home-browse--utility home-browse--home-curated/);
  assert.match(homepage, /"page" \(site\.GetPage "\/library"\) "label" "Library"/);
  assert.match(homepage, /"page" \(site\.GetPage "\/gallery"\) "label" "Gallery"/);
  assert.doesNotMatch(homepage, /"label" "Welcome"/);
  assert.doesNotMatch(homepage, /"label" "Feeling curious\?"/);
  assert.match(homepage, /class="home-browse__list"/);
  assert.match(homepage, /home-browse__item-title">\{\{ \$title \}\}<\/div>/);
  assert.match(homepage, /Use Essays, Gallery, Collections, or Library when you want to move beyond the front page\./);
  assert.match(css, /\.home-browse__list\{[\s\S]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(css, /\.card-center\{/);
  assert.match(css, /\.home-browse__item-title\{[\s\S]*font-size:14px;[\s\S]*line-height:1\.45;/);
});

test("homepage composition inserts the manifesto between the hero and Start Reading", () => {
  assert.match(homeFrontPage, /id="home-front-page-title"/);
  assert.match(homeFrontPage, /partial "home_selected\.html"/);
  assert.match(homeFrontPage, /site\.Data\.editorial_cartoons/);
  assert.match(homeFrontPage, /View gallery/);
  assert.doesNotMatch(homeFrontPage, /cartoon-think-outside-the-box\.png/);
  assert.equal((homeFrontPage.match(/data-home-front-page-region="lead"/g) || []).length, 1);
  assert.equal((homeFrontPage.match(/data-home-front-page-region="secondary"/g) || []).length, 1);
  assert.match(homeFrontPage, /home-front-page__secondary-item/);
  assert.match(homeFrontPage, /<h1 id="home-front-page-title" class="title visually-hidden">\{\{ site\.Title \}\}<\/h1>/);
  assert.doesNotMatch(homeFrontPage, />Front Page</);
  assert.doesNotMatch(homeFrontPage, /A curated front page from Outside In Print/);
  assert.doesNotMatch(homeFrontPage, /class="home-manifesto"/);
  assert.doesNotMatch(homeFrontPage, /A digital imprint of essays, reports, dialogues, and literature\./);
  assert.doesNotMatch(homeFrontPage, /Color over the lines\. Read beyond the feed\. Think for yourself\./);
  assert.match(homeFrontPage, /Read essay &rarr;/);

  assert.match(homeImprintStatement, /class="home-manifesto"/);
  assert.match(homeImprintStatement, /home-manifesto__inner/);
  assert.match(homeImprintStatement, /home-manifesto__line--primary/);
  assert.match(homeImprintStatement, /home-manifesto__line--secondary/);
  assert.match(homeImprintStatement, /A digital imprint of essays, reports, dialogues, and literature\./);
  assert.match(homeImprintStatement, /Color over the lines\. Read beyond the feed\. Think for yourself\./);

  assert.match(homeSelectedCollections, /partial "entry_threads\.html" \./);
  assert.doesNotMatch(homeSelectedCollections, /showArchiveLink/);
  assert.doesNotMatch(homeSelectedCollections, /"source" "homepage"/);

  assert.match(entryThreads, /Start Reading/);
  assert.match(entryThreads, /floods-water-built-environment/);
  assert.match(entryThreads, /modern-bios/);
  assert.match(entryThreads, /moral-religious-philosophical-essays/);
  assert.match(entryThreads, /homepage_entry_thread_start/);
  assert.match(entryThreads, /homepage_entry_thread_collection/);
  assert.doesNotMatch(entryThreads, /start_here_entry_thread_/);
  assert.doesNotMatch(entryThreads, /Browse all collections/);
  assert.doesNotMatch(entryThreads, /showArchiveLink/);

  assert.ok(homepage.indexOf('partial "home_front_page.html"') < homepage.indexOf('partial "home_imprint_statement.html"'));
  assert.ok(homepage.indexOf('partial "home_imprint_statement.html"') < homepage.indexOf('partial "home_selected_collections.html"'));
  assert.ok(homepage.indexOf('partial "home_selected_collections.html"') < homepage.indexOf('home-browse-title'));
  assert.ok(homepage.indexOf('home-browse-title') < homepage.indexOf('partial "newsletter_signup.html"'));
  assert.match(homepage, /"title" "The weekly letter"/);
  assert.match(homepage, /"eyebrow" "Letter"/);

  assert.match(galleryContent, /title: "Gallery"/);
  assert.match(galleryContent, /digital gallery/i);
  assert.match(galleryTemplate, /cartoon-gallery-spotlight/);
  assert.match(galleryTemplate, /cartoon-gallery__grid/);
  assert.match(cartoonData, /slug: think-outside-the-box/);
  assert.match(cartoonData, new RegExp(`current: ${escapeRegex(currentCartoonSlug)}`));
  assert.match(cartoonData, new RegExp(`slug: ${escapeRegex(currentCartoonSlug)}`));
});

test("homepage editorial layout uses the new manifesto namespace and drops dead start-here hooks", () => {
  assert.match(css, /:root\{[\s\S]*--bg-page:#121212;[\s\S]*--font-display:"Source Serif 4", Georgia, serif;[\s\S]*--measure-reading:68ch;/);
  assert.doesNotMatch(css, /repeating-linear-gradient/);
  assert.match(css, /\.home-manifesto\{\s*margin-top:2\.35rem;\s*\}/);
  assert.match(css, /\.home-manifesto__inner\{[\s\S]*grid-template-columns:minmax\(110px, 136px\) minmax\(0, 1fr\);[\s\S]*border-top:1px solid rgba\(236,231,223,.12\);/);
  assert.match(css, /\.home-manifesto__copy\{[\s\S]*display:grid;[\s\S]*max-width:46rem;/);
  assert.match(css, /\.home-manifesto__line--primary\{[\s\S]*font-size:clamp\(1\.12rem, 1\.04rem \+ 0\.42vw, 1\.24rem\);/);
  assert.match(css, /\.home-manifesto__line--secondary\{[\s\S]*font-size:clamp\(1\.5rem, 1\.18rem \+ 1vw, 1\.9rem\);/);
  assert.match(css, /\.entry-threads__grid\{\s*display:grid;/);
  assert.match(css, /\.entry-threads--home \.entry-threads__grid\{\s*grid-template-columns:repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.newsletter-signup--home-signoff \.newsletter-signup__inner\{[\s\S]*max-width:30rem;/);
  assert.match(css, /\.home-browse__list\{[\s\S]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.home-front-page__stories\{\s*display:grid;\s*grid-template-columns:minmax\(0, 1\.65fr\) minmax\(0, 1fr\);/);
  assert.match(css, /\.home-front-page__lead\{[\s\S]*border-right:1px solid rgba\(236,231,223,.1\);/);
  assert.match(css, /\.cartoon-gallery-spotlight\{[\s\S]*grid-template-columns:minmax\(12rem, \.38fr\) minmax\(0, 1fr\);/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.home-manifesto__inner\{\s*grid-template-columns:1fr;/);
  assert.doesNotMatch(css, /\.entry-thread__archive\{/);
  assert.doesNotMatch(css, /\.start-here-page\{/);
  assert.doesNotMatch(css, /\.newsletter-signup--start-here/);
});
