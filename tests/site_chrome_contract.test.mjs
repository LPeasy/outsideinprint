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
const config = fs.readFileSync(path.resolve("hugo.toml"), "utf8");
const css = fs.readFileSync(path.resolve("assets/css/main.css"), "utf8");

test("masthead removes books and shortens the Syd and Oliver label", () => {
  assert.match(masthead, />S and O</);
  assert.doesNotMatch(masthead, />Syd and Oliver</);
  assert.doesNotMatch(masthead, />Books</);
});

test("homepage no longer promotes the retired books section", () => {
  assert.doesNotMatch(homepage, /site-card--books/);
  assert.doesNotMatch(homepage, />Books</);
});

test("homepage cards keep only the main titles and use the shared grid flow", () => {
  assert.doesNotMatch(homepage, /<div class="k">(Start|Section|Index|Explore)<\/div>/);
  assert.doesNotMatch(homepage, /card-center/);
  assert.match(homepage, /class="home-browse home-browse--utility"/);
  assert.match(homepage, /data-analytics-source-slot="random_link"/);
  assert.match(homepage, /class="grid home-browse__grid"/);
  assert.match(css, /\.grid\{\s*display:grid;\s*grid-template-columns:1fr 1fr;/);
  assert.doesNotMatch(css, /\.card-center\{/);
  assert.match(css, /\.card \.v\{\s*font-size:16px;\s*\}/);
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
  assert.match(homeFrontPage, /A curated front page from Outside In Print/);
  assert.match(homeFrontPage, /class="home-manifesto"/);
  assert.match(homeFrontPage, /A digital imprint of essays, reports, dialogues, and literature\./);
  assert.match(homeFrontPage, /Color over the lines\. Read beyond the feed\. Think for yourself\./);
  assert.match(homeFrontPage, /<a class="home-manifesto__support-link" href="#newsletter-signup-title">Support independent journalism \u2192<\/a>/);
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
  assert.ok(homeFrontPage.indexOf('class="page-intro"') < homeFrontPage.indexOf('class="home-manifesto"'));
  assert.ok(homeFrontPage.indexOf('class="home-manifesto"') < homeFrontPage.indexOf('class="home-front-page__stories"'));
  assert.ok(homepage.indexOf('partial "home_front_page.html"') < homepage.indexOf('partial "home_imprint_statement.html"'));
  assert.ok(homepage.indexOf('partial "home_imprint_statement.html"') < homepage.indexOf('partial "home_selected_collections.html"'));
  assert.ok(homepage.indexOf('partial "home_selected_collections.html"') < homepage.indexOf('partial "home_recent_work.html"'));
  assert.ok(homepage.indexOf('partial "home_recent_work.html"') < homepage.indexOf('partial "newsletter_signup.html"'));
  assert.match(homepage, /"title" "The weekly letter"/);
  assert.match(homepage, /"eyebrow" "Letter"/);
  assert.ok(homepage.indexOf('partial "newsletter_signup.html"') < homepage.indexOf('home-browse-title'));
});

test("homepage editorial layout stays scoped to home modules", () => {
  assert.match(css, /\.home-manifesto__inner\{[\s\S]*max-width:42rem;[\s\S]*margin:0 auto;[\s\S]*border-top:1px solid rgba\(232,226,216,.14\);[\s\S]*border-bottom:1px solid rgba\(232,226,216,.12\);[\s\S]*text-align:center;/);
  assert.match(css, /\.home-manifesto__line--primary\{[\s\S]*font-size:clamp\(1\.15rem, 1\.02rem \+ 0\.68vw, 1\.3rem\);/);
  assert.match(css, /\.home-manifesto__line--secondary\{[\s\S]*font-size:clamp\(1\.4rem, 1\.12rem \+ 1\.1vw, 1\.7rem\);/);
  assert.match(css, /\.home-manifesto__line--support\{[\s\S]*font-family:var\(--sans\);[\s\S]*font-size:0\.78rem;/);
  assert.match(css, /\.home-manifesto__support-link\{[\s\S]*border-bottom:1px solid transparent;/);
  assert.match(css, /\.home-front-page__stories\{\s*display:grid;\s*grid-template-columns:minmax\(0, 1\.65fr\) minmax\(0, 1fr\);/);
  assert.match(css, /\.home-front-page__lead\{[\s\S]*border-right:1px solid rgba\(232,226,216,.12\);/);
  assert.match(css, /\.home-imprint-statement__inner\{[\s\S]*grid-template-columns:minmax\(110px, 136px\) minmax\(0, 1fr\);[\s\S]*border-top:1px solid rgba\(232,226,216,.14\);/);
  assert.match(css, /\.home-selected-collections__list\{\s*display:grid;\s*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.home-recent-work__list\{[\s\S]*max-width:44rem;/);
  assert.match(css, /\.home-recent-work \.item \.d\{\s*display:block;\s*\}/);
  assert.match(css, /\.newsletter-signup--home \.newsletter-signup__inner\{[\s\S]*padding:0;[\s\S]*border:none;[\s\S]*background:none;/);
  assert.match(css, /\.home-browse__grid \.card\{[\s\S]*border:none;[\s\S]*border-top:1px solid rgba\(232,226,216,.12\);[\s\S]*border-radius:0;/);
  assert.match(css, /@media \(max-width:900px\)\{[\s\S]*\.home-front-page__stories\{\s*grid-template-columns:1fr;\s*\}/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.home-manifesto__inner\{[\s\S]*max-width:42rem;[\s\S]*padding:1\.05rem 0 1\.15rem;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.home-imprint-statement__inner\{\s*grid-template-columns:1fr;/);
  assert.doesNotMatch(css, /\.selected-hero\{/);
  assert.doesNotMatch(css, /\.selected-core\{/);
  assert.doesNotMatch(css, /\.selected-archive\{/);
  assert.doesNotMatch(css, /\.home-recent-essays/);
});
