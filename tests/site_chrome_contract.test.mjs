import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const masthead = fs.readFileSync(path.resolve("layouts/partials/masthead.html"), "utf8");
const homepage = fs.readFileSync(path.resolve("layouts/index.html"), "utf8");
const homeFrontPage = fs.readFileSync(path.resolve("layouts/partials/home_front_page.html"), "utf8");
const homeImprintStatement = fs.readFileSync(path.resolve("layouts/partials/home_imprint_statement.html"), "utf8");
const homeSelectedCollections = fs.readFileSync(path.resolve("layouts/partials/home_selected_collections.html"), "utf8");
const homeRecentWork = fs.readFileSync(path.resolve("layouts/partials/home_recent_work.html"), "utf8");
const footer = fs.readFileSync(path.resolve("layouts/partials/footer.html"), "utf8");
const startHereTemplate = fs.readFileSync(path.resolve("layouts/start-here/single.html"), "utf8");
const startHereContent = fs.readFileSync(path.resolve("content/start-here/index.md"), "utf8");
const dialoguesSection = fs.readFileSync(path.resolve("content/syd-and-oliver/_index.md"), "utf8");
const config = fs.readFileSync(path.resolve("hugo.toml"), "utf8");
const css = fs.readFileSync(path.resolve("assets/css/main.css"), "utf8");

test("masthead removes books and uses the Dialogues label", () => {
  assert.match(masthead, />Welcome</);
  assert.match(masthead, />Dialogues</);
  assert.match(masthead, />Feeling curious\?</);
  assert.doesNotMatch(masthead, />Start Here</);
  assert.doesNotMatch(masthead, />S and O</);
  assert.doesNotMatch(masthead, />Syd and Oliver</);
  assert.doesNotMatch(masthead, />Books</);
  assert.match(masthead, /aria-current="page"/);
});

test("dialogues rename is wired through the section landing and start-here prompts", () => {
  assert.match(dialoguesSection, /title: "Dialogues"/);
  assert.match(dialoguesSection, /description: "Dialogues and fiction from the recurring world of Syd and Oliver\."/);
  assert.doesNotMatch(startHereTemplate, /journey_links\.html/);
  assert.match(startHereContent, /title: "Welcome"/);
  assert.match(startHereContent, />Dialogues</);
  assert.match(startHereContent, /Feeling curious\?/);
  assert.doesNotMatch(startHereContent, /S and O/);
});

test("homepage no longer promotes the retired books section", () => {
  assert.doesNotMatch(homepage, /site-card--books/);
  assert.doesNotMatch(homepage, />Books</);
});

test("footer exposes persistent links to the imprint and author surfaces", () => {
  assert.match(footer, /aria-label="Footer"/);
  assert.match(footer, /href="\{\{ "about\/" \| absURL \}\}">About</);
  assert.match(footer, /href="\{\{ "authors\/robert-v-ussley\/" \| absURL \}\}">Author</);
  assert.match(footer, /href="\{\{ "library\/" \| absURL \}\}">Library</);
  assert.match(footer, /Robert V\. Ussley/);
});

test("homepage cards keep only the main titles and use the shared grid flow", () => {
  assert.doesNotMatch(homepage, /<div class="k">(Start|Section|Index|Explore)<\/div>/);
  assert.doesNotMatch(homepage, /card-center/);
  assert.match(homepage, /class="home-browse home-browse--utility"/);
  assert.match(homepage, /data-analytics-source-slot="random_link"/);
  assert.match(homepage, /class="grid home-browse__grid"/);
  assert.match(css, /\.grid\{\s*display:grid;\s*grid-template-columns:1fr 1fr;/);
  assert.doesNotMatch(css, /\.card-center\{/);
  assert.match(css, /\.card \.v\{[\s\S]*font-size:16px;[\s\S]*line-height:1\.35;/);
  assert.match(css, /\.card \.k \+ \.v\{\s*margin-top:6px;\s*\}/);
});

test("sticky editorial chrome pins only the compact section rail", () => {
  assert.match(css, /#main-content\{\s*scroll-margin-top:56px;\s*\}/);
  assert.match(css, /\.masthead--sticky \.nav--section-rail\{\s*position:sticky;\s*top:0;/);
  assert.doesNotMatch(css, /\.masthead--sticky\{\s*position:sticky;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*#main-content\{\s*scroll-margin-top:0;\s*\}/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.masthead--sticky \.nav--section-rail\{\s*position:static;/);
});

test("homepage composition promotes front page and imprint before lower-priority utilities", () => {
  assert.match(homeFrontPage, /id="home-front-page-title"/);
  assert.match(homeFrontPage, /partial "home_selected\.html"/);
  assert.equal((homeFrontPage.match(/data-home-front-page-region="lead"/g) || []).length, 1);
  assert.equal((homeFrontPage.match(/data-home-front-page-region="secondary"/g) || []).length, 1);
  assert.match(homeFrontPage, /home-front-page__secondary-item/);
  assert.match(homeFrontPage, /<h1 id="home-front-page-title" class="title visually-hidden">\{\{ site\.Title \}\}<\/h1>/);
  assert.doesNotMatch(homeFrontPage, />Front Page</);
  assert.doesNotMatch(homeFrontPage, /A curated front page from Outside In Print/);
  assert.doesNotMatch(homeFrontPage, /class="home-manifesto"/);
  assert.doesNotMatch(homeFrontPage, /A digital imprint of essays, reports, dialogues, and literature\./);
  assert.doesNotMatch(homeFrontPage, /Color over the lines\. Read beyond the feed\. Think for yourself\./);
  assert.doesNotMatch(homeFrontPage, /Support independent journalism/);
  assert.doesNotMatch(homeFrontPage, /home-front-page__secondary-label/);
  assert.doesNotMatch(homeFrontPage, /Also on the front page/);
  assert.match(homeFrontPage, /Read essay &rarr;/);
  assert.match(homeImprintStatement, /<aside class="home-imprint-statement"/);
  assert.match(homeImprintStatement, /home-imprint-statement__inner/);
  assert.match(homeImprintStatement, /id="home-imprint-statement-title"/);
  assert.match(homeImprintStatement, /site\.Params\.homepage\.imprint_statement/);
  assert.match(homeSelectedCollections, /id="home-selected-collections-title"/);
  assert.match(homeSelectedCollections, /Guided reading paths drawn from the archive/);
  assert.match(homeSelectedCollections, /"variant" "item"/);
  assert.match(homeRecentWork, /id="home-recent-work-title"/);
  assert.match(homeRecentWork, /home_selected_keys/);
  assert.match(homeRecentWork, /"showCollections" false/);
  assert.doesNotMatch(homeRecentWork, /home-recent-essays/);
  assert.match(config, /\[params\.homepage\]/);
  assert.match(config, /imprint_statement = "/);
  assert.ok(homeFrontPage.indexOf('id="home-front-page-title"') < homeFrontPage.indexOf('class="home-front-page__stories"'));
  assert.ok(homepage.indexOf('partial "home_front_page.html"') < homepage.indexOf('partial "home_selected_collections.html"'));
  assert.ok(homepage.indexOf('partial "home_selected_collections.html"') < homepage.indexOf('partial "home_recent_work.html"'));
  assert.ok(homepage.indexOf('partial "home_recent_work.html"') < homepage.indexOf('partial "newsletter_signup.html"'));
  assert.match(homepage, /"title" "The weekly letter"/);
  assert.match(homepage, /"eyebrow" "Letter"/);
  assert.ok(homepage.indexOf('partial "newsletter_signup.html"') < homepage.indexOf('home-browse-title'));
});

test("homepage editorial layout stays scoped to home modules", () => {
  assert.doesNotMatch(css, /\.home-front-page__header\{/);
  assert.doesNotMatch(css, /\.home-front-page__header > \.list-title\{/);
  assert.doesNotMatch(css, /\.home-front-page__header \.title\{/);
  assert.doesNotMatch(css, /\.home-front-page__header \.page-intro\{/);
  assert.match(css, /:root\{[\s\S]*--bg-page:#121212;[\s\S]*--font-display:"Source Serif 4", Georgia, serif;[\s\S]*--measure-reading:68ch;/);
  assert.doesNotMatch(css, /repeating-linear-gradient/);
  assert.match(css, /\.page-header \.list-title,[\s\S]*font-family:var\(--font-display\);/);
  assert.doesNotMatch(css, /\.home-manifesto\{/);
  assert.match(css, /\.start-here-intro \.home-manifesto__line--primary\{[\s\S]*font-size:clamp\(1\.12rem, 1\.04rem \+ 0\.42vw, 1\.24rem\);/);
  assert.match(css, /\.start-here-intro \.home-manifesto__line--secondary\{[\s\S]*font-size:clamp\(1\.5rem, 1\.18rem \+ 1vw, 1\.9rem\);/);
  assert.match(css, /\.home-front-page__stories\{\s*display:grid;\s*grid-template-columns:minmax\(0, 1\.65fr\) minmax\(0, 1fr\);/);
  assert.match(css, /\.home-front-page__lead\{[\s\S]*border-right:1px solid rgba\(236,231,223,.1\);/);
  assert.match(css, /\.home-imprint-statement__inner\{[\s\S]*grid-template-columns:minmax\(110px, 136px\) minmax\(0, 1fr\);[\s\S]*border-top:1px solid rgba\(236,231,223,.12\);/);
  assert.match(css, /\.home-selected-collections__list\{\s*display:grid;\s*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.home-recent-work__list\{[\s\S]*max-width:64rem;/);
  assert.match(css, /\.newsletter-signup--home \.newsletter-signup__inner\{[\s\S]*padding:0;[\s\S]*border:none;[\s\S]*background:none;/);
  assert.match(css, /\.home-browse__grid \.card\{[\s\S]*border:none;[\s\S]*border-top:1px solid rgba\(236,231,223,.1\);[\s\S]*border-radius:0;/);
  assert.match(css, /\.piece-header\{[\s\S]*width:100%;[\s\S]*max-width:var\(--measure-wide\);[\s\S]*margin-left:auto;[\s\S]*margin-right:auto;/);
  assert.match(css, /\.piece-body,\s*\.piece-aftermatter\{[\s\S]*width:100%;[\s\S]*max-width:var\(--measure-reading\);[\s\S]*margin-left:auto;[\s\S]*margin-right:auto;/);
  assert.match(css, /\.piece-body figure\{[\s\S]*width:100%;[\s\S]*max-width:100%;[\s\S]*margin-left:auto;[\s\S]*margin-right:auto;/);
  assert.match(css, /\.piece-body > img\{[\s\S]*display:block;[\s\S]*width:100%;[\s\S]*max-width:100%;[\s\S]*margin-left:auto;[\s\S]*margin-right:auto;/);
  assert.match(css, /\.piece-body figure img\{\s*width:100%;\s*\}/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.piece-body\{[\s\S]*max-width:var\(--measure-reading\);[\s\S]*margin-left:auto;[\s\S]*margin-right:auto;[\s\S]*font-size:1\.03rem;[\s\S]*line-height:1\.78;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.piece-body :is\(p, ul, ol, blockquote, figure, hr\)\{[\s\S]*width:100%;[\s\S]*max-width:none;[\s\S]*margin-bottom:1\.1rem;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.piece-body figure\{\s*margin-left:0;\s*margin-right:0;\s*\}/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.piece-body > img\{[\s\S]*display:block;[\s\S]*width:100%;[\s\S]*max-width:100%;[\s\S]*margin-left:0;[\s\S]*margin-right:0;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.piece-body img\{[\s\S]*display:block;[\s\S]*width:100%;[\s\S]*max-width:100%;[\s\S]*height:auto;[\s\S]*margin-left:auto;[\s\S]*margin-right:auto;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.piece-body :is\(figcaption, \.article-source-caption\)\{[\s\S]*width:100%;[\s\S]*max-width:100%;/);
  assert.match(css, /\.newsletter-signup__input\{[\s\S]*font-family:var\(--font-ui\);/);
  assert.match(css, /\.newsletter-signup__button\{[\s\S]*background:var\(--accent-soft\);/);
  assert.match(css, /@media \(max-width:900px\)\{[\s\S]*\.home-front-page__stories\{\s*grid-template-columns:1fr;\s*\}/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.home-imprint-statement__inner\{\s*grid-template-columns:1fr;/);
  assert.doesNotMatch(css, /\.selected-hero\{/);
  assert.doesNotMatch(css, /\.selected-core\{/);
  assert.doesNotMatch(css, /\.selected-archive\{/);
  assert.doesNotMatch(css, /\.home-recent-essays/);
});
