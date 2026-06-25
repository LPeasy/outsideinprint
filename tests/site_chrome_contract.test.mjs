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

function classTokensForElement(source, elementPattern, label) {
  const elementMatch = source.match(elementPattern);
  assert.ok(elementMatch, `expected ${label} element`);
  const classMatch = elementMatch[0].match(/\bclass="([^"]+)"/);
  assert.ok(classMatch, `expected ${label} element to have a class attribute`);
  return new Set(classMatch[1].trim().split(/\s+/));
}

function cssRule(source, selector) {
  const ruleMatch = source.match(new RegExp(`(?:^|\\n)${escapeRegex(selector)}\\s*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(ruleMatch, `expected CSS rule for ${selector}`);
  return ruleMatch[0];
}

const masthead = fs.readFileSync(path.resolve("layouts/partials/masthead.html"), "utf8");
const homepage = fs.readFileSync(path.resolve("layouts/index.html"), "utf8");
const baseLayout = fs.readFileSync(path.resolve("layouts/_default/baseof.html"), "utf8");
const notFound = fs.readFileSync(path.resolve("layouts/404.html"), "utf8");
const themeBootstrap = fs.readFileSync(path.resolve("layouts/partials/theme_bootstrap.html"), "utf8");
const themeToggleScript = fs.readFileSync(path.resolve("layouts/partials/theme_toggle_script.html"), "utf8");
const homeFrontPage = fs.readFileSync(path.resolve("layouts/partials/home_front_page.html"), "utf8");
const homeFrontPageCopy = fs.readFileSync(path.resolve("layouts/partials/home_front_page_copy.html"), "utf8");
const homeImprintStatement = fs.readFileSync(path.resolve("layouts/partials/home_imprint_statement.html"), "utf8");
const homeSelectedCollections = fs.readFileSync(path.resolve("layouts/partials/home_selected_collections.html"), "utf8");
const entryThreads = fs.readFileSync(path.resolve("layouts/partials/entry_threads.html"), "utf8");
const footer = fs.readFileSync(path.resolve("layouts/partials/footer.html"), "utf8");
const randomTemplate = fs.readFileSync(path.resolve("layouts/random/single.html"), "utf8");
const galleryTemplate = fs.readFileSync(path.resolve("layouts/gallery/list.html"), "utf8");
const galleryContent = fs.readFileSync(path.resolve("content/gallery/_index.md"), "utf8");
const cartoonData = fs.readFileSync(path.resolve("data/editorial_cartoons.yaml"), "utf8");
const cartoonLookupPartial = fs.readFileSync(path.resolve("layouts/partials/editorial/cartoon-for-page.html"), "utf8");
const cartoonLinkPartial = fs.readFileSync(path.resolve("layouts/partials/editorial/cartoon-gallery-link.html"), "utf8");
const cartoonThumbnailLightbox = fs.readFileSync(path.resolve("layouts/partials/editorial/cartoon-thumbnail-lightbox.html"), "utf8");
const pageListItem = fs.readFileSync(path.resolve("layouts/partials/discovery/page-list-item.html"), "utf8");
const currentCartoonSlug = readCurrentCartoonSlug(cartoonData);
const dialoguesSection = fs.readFileSync(path.resolve("content/syd-and-oliver/_index.md"), "utf8");
const css = fs.readFileSync(path.resolve("assets/css/main.css"), "utf8");
const styleThemeWorkflow = fs.readFileSync(path.resolve("docs/style-theme-workflow.md"), "utf8");

test("masthead removes Welcome and promotes Archive as the long-form lane", () => {
  assert.doesNotMatch(masthead, />Welcome</);
  assert.match(masthead, />Archive</);
  assert.doesNotMatch(masthead, />Essays</);
  assert.doesNotMatch(masthead, />Dialogues</);
  assert.doesNotMatch(masthead, />Shop</);
  assert.match(masthead, />Collections</);
  assert.match(masthead, />Gallery</);
  assert.match(masthead, />Library</);
  assert.match(masthead, />Feeling curious\?</);
  assert.match(
    masthead,
    /aria-label="Primary"[\s\S]*?archive\/"[\s\S]*?>Archive<[\s\S]*?collections\/"[\s\S]*?>Collections<[\s\S]*?gallery\/"[\s\S]*?>Gallery<[\s\S]*?library\/"[\s\S]*?>Library<[\s\S]*?random\/"[\s\S]*?>Feeling curious\?</
  );
  assert.match(masthead, /\$isGallery := eq \.Section "gallery"/);
  assert.match(masthead, /href="\{\{ "gallery\/" \| absURL \}\}"/);
  assert.doesNotMatch(masthead, /href="\{\{ "start-here\/" \| absURL \}\}"/);
  assert.doesNotMatch(masthead, /\$isWelcome/);
  assert.doesNotMatch(masthead, />Books</);
  assert.match(masthead, /aria-current="page"/);
});

test("shared masthead exposes the public light and dark theme selector", () => {
  assert.match(masthead, /class="theme-toggle masthead-theme-toggle"/);
  assert.match(masthead, /data-theme-toggle/);
  assert.match(masthead, /aria-pressed="true"/);
  assert.match(masthead, /theme-toggle__icon--sun/);
  assert.match(masthead, /theme-toggle__icon--moon/);
  assert.match(masthead, /<nav class="nav nav--section-rail"[\s\S]*Feeling curious\?/);
  assert.match(masthead, /\$mastheadVariant := cond \$isHomeMasthead "masthead--full" "masthead--compressed"/);
  assert.match(masthead, /\{\{ if \$isHomeMasthead \}\}[\s\S]*masthead-side-deck--left/);
  assert.doesNotMatch(
    masthead.match(/<nav class="nav nav--section-rail"[\s\S]*?<\/nav>/)?.[0] || "",
    /data-theme-toggle/
  );
  assert.match(baseLayout, /partial "theme_bootstrap\.html"[\s\S]*resources\.Get "css\/main\.css"/);
  assert.match(baseLayout, /partial "theme_toggle_script\.html"/);
  assert.match(notFound, /partial "theme_bootstrap\.html"[\s\S]*resources\.Get "css\/main\.css"/);
  assert.match(notFound, /partial "theme_toggle_script\.html"/);
  assert.match(themeBootstrap, /localStorage\.getItem\(storageKey\)/);
  assert.match(themeBootstrap, /prefers-color-scheme:\s*dark/);
  assert.match(themeBootstrap, /document\.documentElement\.setAttribute\("data-theme", theme\)/);
  assert.match(themeToggleScript, /localStorage\.setItem\(storageKey, theme\)/);
  assert.match(themeToggleScript, /setTheme\(currentTheme\(\) === "dark" \? "light" : "dark"\)/);
  assert.match(css, /html\[data-theme="light"\]\{[\s\S]*--bg-page:var\(--oip-paper\);[\s\S]*--accent:var\(--oip-link\);/);
  assert.match(css, /\.theme-toggle\{[\s\S]*display:none;[\s\S]*\}/);
  assert.match(css, /html\.theme-enabled \.theme-toggle\{[\s\S]*display:inline-flex;[\s\S]*\}/);
  assert.match(css, /\.masthead--compressed \.title\{[\s\S]*font-size:clamp\(1\.75rem, 3vw, 2\.35rem\)/);
  assert.match(css, /html\[data-theme="light"\] \.masthead--compressed\{[\s\S]*background:transparent;/);
  assert.match(css, /\/\* Light-mode paper edition \*\//);
  assert.match(css, /html\[data-theme="light"\] \.card,[\s\S]*background:var\(--paper-surface-wash\), var\(--bg-surface\)/);
  assert.doesNotMatch(cssRule(css, 'html[data-theme="light"] body'), /radial-gradient/);
});

test("filtered dialogue archive stays wired through the live discovery surfaces", () => {
  assert.match(dialoguesSection, /title: "Syd and Oliver Dialogues"/);
  assert.match(dialoguesSection, /description: "Dialogue pieces from the recurring world of Syd and Oliver/);
  assert.doesNotMatch(dialoguesSection, /^title: "Dialogues"$/m);
  assert.match(randomTemplate, /"label" "Home"/);
  assert.doesNotMatch(randomTemplate, /"label" "Welcome"/);
});

test("footer and random route now point readers home instead of Welcome", () => {
  assert.match(footer, /aria-label="Footer"/);
  assert.match(footer, /href="\{\{ "" \| absURL \}\}">Home</);
  assert.match(footer, /href="\{\{ "about\/" \| absURL \}\}">About</);
  assert.match(footer, /href="\{\{ "authors\/robert-v-ussley\/" \| absURL \}\}">Author</);
  assert.match(footer, /href="\{\{ "library\/" \| absURL \}\}">Library</);
  assert.match(footer, /href="\{\{ "shop\/" \| absURL \}\}">Bookstore</);
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
  assert.match(randomTemplate, /\.RelPermalink/);
  assert.doesNotMatch(randomTemplate, /data-random-route-choices/);
  assert.doesNotMatch(randomTemplate, /data-random-route-refresh/);
  assert.doesNotMatch(randomTemplate, /data-analytics-source-slot", "random_choice"/);
  assert.match(randomTemplate, /Open the Library/);
});

test("homepage browse band stays curated and replaces Welcome with Library", () => {
  assert.doesNotMatch(homepage, /<div class="k">(Start|Section|Index|Explore)<\/div>/);
  assert.doesNotMatch(homepage, /card-center/);
  const homeBrowseClasses = classTokensForElement(homepage, /<section\b[^>]*aria-label="Archive navigation"[^>]*>/, "homepage browse");
  for (const token of ["home-browse", "home-browse--utility", "home-browse--home-curated", "page-shell", "page-shell--wide"]) {
    assert.ok(homeBrowseClasses.has(token), `expected homepage browse class token: ${token}`);
  }
  assert.match(homepage, /"page" \(site\.GetPage "\/library"\) "label" "Library"/);
  assert.match(homepage, /"page" \(site\.GetPage "\/gallery"\) "label" "Gallery"/);
  assert.doesNotMatch(homepage, /"label" "Welcome"/);
  assert.doesNotMatch(homepage, /"label" "Feeling curious\?"/);
  assert.match(homepage, /class="home-browse__list"/);
  assert.match(homepage, /home-browse__item-title">\{\{ \$title \}\}<\/div>/);
  assert.doesNotMatch(homepage, /Browse the Archive/);
  assert.doesNotMatch(homepage, /Use Archive, Gallery, Collections, or Library when you want to move beyond the front page\./);
  assert.match(css, /\.home-browse__list\{[\s\S]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(css, /\.card-center\{/);
  assert.match(css, /\.home-browse__item-title\{[\s\S]*font-size:14px;[\s\S]*line-height:1\.45;/);
});

test("homepage composition keeps the motto, collections, signup ribbon, and archive navigation in order", () => {
  assert.match(homeFrontPage, /id="home-front-page-title"/);
  assert.match(homeFrontPage, /partial "home_selected\.html"/);
  assert.match(homeFrontPage, /home_front_page_copy\.html/);
  assert.match(homeFrontPage, /site\.Data\.editorial_cartoons/);
  assert.match(homeFrontPage, /\$orderedCartoons := sort \$cartoons "date" "desc"/);
  assert.match(homeFrontPage, /\$recentCartoons := slice/);
  assert.match(homeFrontPage, /lt \(len \$recentCartoons\) 2/);
  assert.match(homeFrontPage, /View gallery/);
  assert.match(homeFrontPage, /data-home-cartoon-recent/);
  assert.match(homeFrontPage, /data-home-cartoon-recent-card/);
  assert.match(homeFrontPage, /data-home-cartoon-recent-trigger/);
  assert.match(homeFrontPage, /data-home-cartoon-lightbox-trigger/);
  assert.match(homeFrontPage, /data-home-cartoon-lightbox/);
  assert.match(homeFrontPage, /data-home-cartoon-lightbox-essay/);
  assert.match(homeFrontPage, /querySelectorAll\("\[data-home-cartoon-lightbox-trigger\]"\)/);
  assert.match(homeFrontPage, /triggers\.forEach\(function \(trigger\)/);
  assert.match(homeFrontPage, /editorial\/cartoon-for-page\.html/);
  assert.match(homeFrontPage, /editorial\/cartoon-gallery-link\.html/);
  assert.doesNotMatch(homeFrontPage, /var trigger = document\.querySelector\("\[data-home-cartoon-lightbox-trigger\]"\)/);
  assert.match(homeFrontPage, /imageButton\.addEventListener\("click", closeLightbox\)/);
  assert.doesNotMatch(homeFrontPage, /window\.location\.href/);
  assert.doesNotMatch(homeFrontPage, /cartoon-think-outside-the-box\.png/);
  assert.equal((homeFrontPage.match(/data-home-front-page-region="lead"/g) || []).length, 1);
  assert.equal((homeFrontPage.match(/data-home-front-page-region="secondary"/g) || []).length, 1);
  assert.match(homeFrontPage, /home-front-page__secondary-item/);
  assert.match(homeFrontPage, /home-almanack-divider/);
  assert.match(homeFrontPage, /class="home-almanack home-almanack--lead"/);
  assert.match(homeFrontPage, /home-almanack__ledger/);
  assert.match(homeFrontPage, /home-almanack__ledger-row--number/);
  assert.match(homeFrontPage, /home-almanack__ledger-row--virtue/);
  assert.ok(homeFrontPage.indexOf('data-home-cartoon-recent') < homeFrontPage.indexOf('home-almanack-divider'));
  assert.ok(homeFrontPage.indexOf('home-almanack--lead') < homeFrontPage.indexOf('data-home-front-page-region="secondary"'));
  assert.match(homeFrontPage, /<h1 id="home-front-page-title" class="title visually-hidden">\{\{ site\.Title \}\}<\/h1>/);
  assert.doesNotMatch(homeFrontPage, />Front Page</);
  assert.doesNotMatch(homeFrontPage, /A curated front page from Outside In Print/);
  assert.doesNotMatch(homeFrontPage, /class="home-manifesto"/);
  assert.doesNotMatch(homeFrontPage, /A digital imprint of essays, reports, dialogues, and literature\./);
  assert.doesNotMatch(homeFrontPage, /Color over the lines\. Read beyond the feed\. Think for yourself\./);
  assert.match(homeFrontPage, /\{\{ \$leadReadLabel \}\} &rarr;/);
  assert.match(homeFrontPage, /\{\{ \$readLabel \}\} &rarr;/);
  assert.match(homeFrontPageCopy, /Latest Essay/);
  assert.match(homeFrontPageCopy, /Latest Dialogue/);
  assert.match(homeFrontPageCopy, /Read essay/);
  assert.match(homeFrontPageCopy, /Read dialogue/);

  assert.match(homeImprintStatement, /class="home-manifesto"/);
  assert.match(homeImprintStatement, /home-manifesto__inner/);
  assert.match(homeImprintStatement, /class="home-manifesto__line"/);
  assert.match(homeImprintStatement, /Ask for the evidence\. Read past the headlines\. Think for yourself\./);
  assert.doesNotMatch(homeImprintStatement, /home-manifesto__line--primary/);
  assert.doesNotMatch(homeImprintStatement, /home-manifesto__line--secondary/);
  assert.doesNotMatch(homeImprintStatement, /A digital imprint of essays, reports, dialogues, and literature\./);
  assert.doesNotMatch(homeImprintStatement, /Color over the lines\. Read beyond the feed\. Think for yourself\./);

  assert.match(homeSelectedCollections, /partial "entry_threads\.html" \./);
  assert.doesNotMatch(homeSelectedCollections, /showArchiveLink/);
  assert.doesNotMatch(homeSelectedCollections, /"source" "homepage"/);

  assert.doesNotMatch(entryThreads, /Start Reading/);
  assert.doesNotMatch(entryThreads, /Check out the collections below\./);
  assert.match(entryThreads, /aria-label="Selected collections"/);
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
  assert.ok(homepage.indexOf('partial "home_selected_collections.html"') < homepage.indexOf('partial "newsletter_signup.html"'));
  assert.ok(homepage.indexOf('partial "newsletter_signup.html"') < homepage.indexOf('class="home-browse'));
  assert.match(homepage, /newsletter-signup--home-ribbon/);
  assert.match(homepage, /"sourceSlot" "homepage_bobs_almanack_offer"/);
  assert.match(homepage, /"title" "Free subscription to Bob's Almanack"/);
  assert.match(homepage, /"eyebrow" "Limited time"/);

  assert.match(galleryContent, /title: "Gallery"/);
  assert.match(galleryContent, /digital gallery/i);
  assert.match(galleryTemplate, /cartoon-gallery-spotlight/);
  assert.match(galleryTemplate, /cartoon-gallery__grid/);
  assert.match(galleryTemplate, /\$archiveCartoons := slice/);
  assert.match(galleryTemplate, /if ne \.slug \$currentSlug/);
  assert.match(galleryTemplate, /\$archiveCartoons = \$archiveCartoons \| append \./);
  assert.match(galleryTemplate, /range \$archiveCartoons/);
  assert.doesNotMatch(galleryTemplate, /cartoon-gallery__item--current/);
  assert.match(galleryTemplate, /data-cartoon-lightbox-trigger/);
  assert.match(galleryTemplate, /data-cartoon-slug/);
  assert.match(galleryTemplate, /data-cartoon-lightbox-essay/);
  assert.match(galleryTemplate, /window\.location\.href = activeEssay/);
  assert.match(galleryTemplate, /getRequestedCartoonSlug/);
  assert.match(galleryTemplate, /openLightbox\(requestedTrigger\)/);
  assert.match(cartoonLookupPartial, /site\.Data\.editorial_cartoons/);
  assert.match(cartoonLinkPartial, /gallery\/\?cartoon=%s/);
  assert.match(cartoonLinkPartial, /essay-cartoon-thumb/);
  assert.match(cartoonLinkPartial, /<button/);
  assert.match(cartoonLinkPartial, /data-essay-cartoon-lightbox-trigger/);
  assert.match(cartoonLinkPartial, /data-gallery/);
  assert.doesNotMatch(cartoonLinkPartial, /<a class="essay-cartoon-thumb/);
  assert.match(baseLayout, /editorial\/cartoon-thumbnail-lightbox\.html/);
  assert.match(cartoonThumbnailLightbox, /data-essay-cartoon-lightbox/);
  assert.match(cartoonThumbnailLightbox, /data-essay-cartoon-lightbox-gallery/);
  assert.match(cartoonThumbnailLightbox, /View in gallery/);
  assert.match(cartoonThumbnailLightbox, /imageButton\.addEventListener\("click", closeLightbox\)/);
  assert.doesNotMatch(cartoonThumbnailLightbox, /window\.location\.href/);
  assert.match(pageListItem, /editorial\/cartoon-gallery-link\.html/);
  assert.match(cartoonData, /slug: think-outside-the-box/);
  assert.match(cartoonData, /essay: "\/essays\/the-warning-label-in-the-weeds\/"/);
  const thinkOutsideEntry = cartoonData.match(/  - slug: think-outside-the-box[\s\S]*?(?=\n  - slug:|\n?$)/)?.[0] || "";
  assert.doesNotMatch(thinkOutsideEntry, /essay:/);
  assert.match(cartoonData, new RegExp(`current: ${escapeRegex(currentCartoonSlug)}`));
  assert.match(cartoonData, new RegExp(`slug: ${escapeRegex(currentCartoonSlug)}`));
});

test("homepage editorial layout uses the new manifesto namespace and drops dead start-here hooks", () => {
  assert.match(css, /:root\{[\s\S]*--bg-page:#121212;[\s\S]*--font-display:"Source Serif 4", Georgia, serif;[\s\S]*--measure-reading:68ch;/);
  assert.match(css, /:root,\s*\.oip-theme-rules-print-20260429-161813\{[\s\S]*--oip-rule-hairline:rgba\(236,231,223,.06\);[\s\S]*--oip-rule-clear:rgba\(236,231,223,.17\);[\s\S]*--oip-rule-engraved:rgba\(213,190,150,.22\);[\s\S]*--oip-rule-engraved-strong:rgba\(213,190,150,.34\);[\s\S]*\}/);
  assert.match(css, /\.oip-theme-rules-clear-20260429-115754\{[\s\S]*--oip-rule-hairline:rgba\(236,231,223,.055\);[\s\S]*--oip-rule-clear:rgba\(236,231,223,.155\);[\s\S]*--oip-rule-engraved-strong:rgba\(213,190,150,.24\);[\s\S]*\}/);
  assert.match(css, /\.oip-theme-rules-classic-20260429-115754\{[\s\S]*--oip-rule-hairline:rgba\(236,231,223,.04\);[\s\S]*--oip-rule-clear:rgba\(236,231,223,.12\);[\s\S]*--oip-rule-engraved-strong:rgba\(213,190,150,.18\);[\s\S]*\}/);
  assert.match(css, /--oip-rule-engraved-gradient:linear-gradient\(90deg, rgba\(236,231,223,0\), var\(--oip-rule-engraved-strong\) 18%, var\(--oip-rule-engraved\) 52%, rgba\(236,231,223,0\)\);/);
  assert.match(css, /--oip-rule-engraved-rail:linear-gradient\(180deg, var\(--oip-rule-engraved-strong\), var\(--oip-rule-engraved\) 48%, rgba\(213,190,150,0\)\);/);
  const dividerTokens = new Set(Array.from(css.matchAll(/--oip-rule-[a-z-]+:/g), ([token]) => token.slice(0, -1)));
  assert.deepEqual(Array.from(dividerTokens).sort(), [
    "--oip-rule-clear",
    "--oip-rule-engraved",
    "--oip-rule-engraved-gradient",
    "--oip-rule-engraved-rail",
    "--oip-rule-engraved-strong",
    "--oip-rule-faint",
    "--oip-rule-hairline",
    "--oip-rule-list",
    "--oip-rule-standard",
  ]);
  assert.match(styleThemeWorkflow, /oip-theme-<area>-<descriptor>-YYYYMMDD-HHMMSS/);
  assert.match(styleThemeWorkflow, /oip-theme-rules-classic-20260429-115754/);
  assert.match(styleThemeWorkflow, /oip-theme-rules-clear-20260429-115754/);
  assert.match(styleThemeWorkflow, /oip-theme-rules-print-20260429-161813/);
  assert.match(styleThemeWorkflow, /--oip-rule-engraved/);
  assert.match(styleThemeWorkflow, /--oip-rule-engraved-gradient/);
  assert.match(styleThemeWorkflow, /--oip-rule-engraved-rail/);
  assert.match(styleThemeWorkflow, /semantic threshold tools, not general borders/);
  assert.match(styleThemeWorkflow, /signature thresholds only/);
  assert.match(styleThemeWorkflow, /approved public theme selector/);
  assert.match(styleThemeWorkflow, /html\[data-theme="light"\]/);
  assert.match(styleThemeWorkflow, /localStorage\["oip-theme"\]/);
  assert.match(css, /#main-content\{\s*scroll-margin-top:56px;\s*\}/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?#main-content\{\s*scroll-margin-top:0;\s*\}/);
  for (const selector of ["body", ".home-manifesto", ".home-manifesto__inner"]) {
    assert.doesNotMatch(cssRule(css, selector), /repeating-linear-gradient/);
  }
  assert.match(css, /\.home-manifesto\{\s*margin-top:2\.35rem;\s*\}/);
  assert.match(css, /\.home-manifesto__inner\{[\s\S]*padding:1\.08rem 0 1\.02rem;[\s\S]*border-top:1px solid var\(--oip-rule-engraved\);[\s\S]*border-bottom:1px solid var\(--oip-rule-engraved\);/);
  assert.match(css, /\.home-manifesto__inner::before,\s*\.home-manifesto__inner::after\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.home-manifesto__copy\{[\s\S]*max-width:54rem;[\s\S]*text-align:center;/);
  assert.match(css, /\.home-manifesto__line\{[\s\S]*font-size:1\.48rem;[\s\S]*letter-spacing:0;/);
  assert.doesNotMatch(css, /\.home-manifesto__line--primary\{/);
  assert.doesNotMatch(css, /\.home-manifesto__line--secondary\{/);
  assert.match(css, /\.entry-threads__grid\{\s*display:grid;/);
  assert.match(css, /\.entry-threads--home \.entry-threads__grid\{\s*grid-template-columns:repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.newsletter-signup--home-ribbon\{[\s\S]*margin-top:2\.15rem;[\s\S]*border-top:0;/);
  assert.match(css, /\.newsletter-signup--home-ribbon \.newsletter-signup__inner\{[\s\S]*grid-template-columns:minmax\(0, 1fr\) minmax\(18rem, \.86fr\);[\s\S]*background:/);
  assert.match(css, /\.home-browse__list\{[\s\S]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.home-front-page__stories\{\s*display:grid;\s*grid-template-columns:minmax\(0, 1\.65fr\) minmax\(0, 1fr\);/);
  assert.match(css, /\.home-front-page__lead\{[\s\S]*border-right:1px solid var\(--oip-rule-standard\);/);
  assert.match(css, /\.home-front-page__secondary-item\{[\s\S]*border-top:1px solid var\(--oip-rule-faint\);/);
  assert.match(css, /\.item\{[\s\S]*border-bottom:1px solid var\(--oip-rule-list\);/);
  assert.match(css, /\.author-route__reading-map\{[\s\S]*border-top:1px solid var\(--oip-rule-engraved\);/);
  assert.match(css, /\.about-route__reading-map::before,\s*\.author-route__reading-map::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.essays-front__masthead,\s*\.section-front__header\{[\s\S]*border-bottom:1px solid var\(--oip-rule-engraved\);/);
  assert.match(css, /\.nav--section-rail\{[\s\S]*border-top-color:var\(--oip-rule-engraved\);[\s\S]*border-bottom-color:var\(--oip-rule-engraved\);/);
  assert.match(css, /\.nav--section-rail::before,\s*\.nav--section-rail::after\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.site-footer\{[\s\S]*border-top:1px solid var\(--oip-rule-engraved\);/);
  assert.match(css, /\.site-footer::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.imprint-header,\s*\.article-publication-record,\s*\.article-record,\s*\.reading-path\{[\s\S]*border-color:var\(--oip-rule-standard\);/);
  assert.match(css, /\.imprint-header::before,\s*\.article-publication-record::before,\s*\.article-record::before,\s*\.reading-path::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.library-group::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.library-group \[data-library-item\],\s*\.library-results__list \[data-library-item\]\{[\s\S]*position:relative;[\s\S]*padding-top:\.55rem;/);
  assert.match(css, /\.library-group \[data-library-item\]:not\(\[hidden\]\) ~ \[data-library-item\]:not\(\[hidden\]\),\s*\.library-results__list \[data-library-item\]:not\(\[hidden\]\) ~ \[data-library-item\]:not\(\[hidden\]\)\{[\s\S]*border-top:1px solid var\(--oip-rule-standard\);/);
  assert.match(css, /\.library-group \[data-library-item\]:not\(\[hidden\]\) ~ \[data-library-item\]:not\(\[hidden\]\)::before,\s*\.library-results__list \[data-library-item\]:not\(\[hidden\]\) ~ \[data-library-item\]:not\(\[hidden\]\)::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.library-group \[data-library-item\] > \.item,\s*\.library-results__list \[data-library-item\] > \.item\{[\s\S]*border-bottom:none;/);
  assert.match(css, /\.library-group \[data-library-item\] > \.item::before,\s*\.library-results__list \[data-library-item\] > \.item::before\{[\s\S]*background:var\(--oip-rule-engraved-rail\);/);
  assert.match(css, /\.library-group \[data-library-item\]:focus-within > \.item::before,\s*\.library-results__list \[data-library-item\]:focus-within > \.item::before\{[\s\S]*opacity:\.82;/);
  assert.doesNotMatch(css, /\.library-group \.item,\s*\.library-results__list \.item\{/);
  assert.doesNotMatch(css, /\.library-group \.item::before,\s*\.library-results__list \.item::before\{/);
  assert.match(css, /\.essays-front__month::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.essays-front__month-list \.item\{[\s\S]*border-bottom-color:var\(--oip-rule-faint\);/);
  assert.match(css, /\.essays-front__month-list \.item::before\{[\s\S]*background:var\(--oip-rule-engraved-rail\);/);
  assert.match(css, /\.home-almanack-divider\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.home-almanack__ledger\{[\s\S]*grid-template-columns:repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.home-almanack__ledger-row\{[\s\S]*grid-template-columns:1fr;[\s\S]*border-left:1px solid rgba\(32,26,21,\.16\);/);
  assert.match(css, /\.editorial-cartoon-recent\{[\s\S]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.editorial-cartoon-recent__item:nth-child\(odd\):not\(:last-child\)::after\{[\s\S]*background:var\(--oip-rule-engraved-rail\);/);
  assert.match(css, /\.editorial-cartoon::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.editorial-cartoon-recent__trigger\{[\s\S]*aspect-ratio:16 \/ 9;/);
  assert.match(css, /\.essay-cartoon-thumb img\{[\s\S]*aspect-ratio:16 \/ 9;/);
  assert.match(css, /\.home-front-page__secondary-title-row\{[\s\S]*justify-content:space-between;/);
  assert.match(css, /\.cartoon-gallery-spotlight\{[\s\S]*grid-template-columns:minmax\(12rem, \.38fr\) minmax\(0, 1fr\);/);
  assert.match(css, /\.cartoon-gallery\{[\s\S]*border-top:1px solid var\(--oip-rule-engraved\);/);
  assert.match(css, /\.cartoon-gallery::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.piece-body h2::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.piece-body figure\{[\s\S]*border-top:1px solid var\(--oip-rule-faint\);/);
  assert.match(css, /\.piece-body \.article-embed::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.collections-broadsheet__section::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.collection-section__header::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(cssRule(css, ".bookstore-index__header"), /border-top:1px solid var\(--oip-rule-engraved\);/);
  assert.match(cssRule(css, ".bookstore-record"), /border-top:1px solid var\(--oip-rule-standard\);/);
  assert.match(cssRule(css, ".bookstore-record::before"), /background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(cssRule(css, ".bookstore-panel"), /border:1px solid var\(--oip-rule-standard\);/);
  assert.match(cssRule(css, ".bookstore-panel::before"), /background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(cssRule(css, ".shop-cta"), /background:var\(--accent-soft\);/);
  assert.doesNotMatch(css, /bookstore-woodgrain-v1\.6|#7f1f1c|#9a2a24/);
  assert.match(css, /@media \(max-width:420px\)\{[\s\S]*\.editorial-cartoon-recent\{\s*grid-template-columns:1fr;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.home-almanack__ledger\{\s*grid-template-columns:1fr;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.home-manifesto__inner\{\s*padding:\.9rem 0 \.85rem;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.newsletter-signup--home-ribbon \.newsletter-signup__inner\{\s*grid-template-columns:1fr;/);
  assert.doesNotMatch(css, /\.entry-thread__archive\{/);
  assert.doesNotMatch(css, /\.start-here-page\{/);
  assert.doesNotMatch(css, /\.newsletter-signup--start-here/);
});
