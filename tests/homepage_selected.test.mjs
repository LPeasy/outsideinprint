import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");

const homepage = read("layouts/index.html");
const homeFrontPage = read("layouts/partials/home_front_page.html");
const homeV2 = read("layouts/partials/home_v2_front_page.html");
const masthead = read("layouts/partials/masthead.html");
const selected = read("layouts/partials/home_v2_selected.html");
const readerBanner = read("layouts/partials/home_reader_banner.html");
const readerNewsletter = read("layouts/partials/home_reader_newsletter.html");
const leadSummary = read("layouts/partials/home_lead_summary.html");
const featuredImageButton = read("layouts/partials/home_featured_image_button.html");
const featuredImageDialog = read("layouts/partials/home_featured_image_dialog.html");
const metrics = read("data/homepage_metrics.yaml");
const config = read("hugo.toml");
const contributor = read("content/contribute/index.md");
const css = read("assets/css/main.css");
const readerNoteCopy = "Outside In Print publishes independent reporting, essays, dialogues, and reflections. Find the evidence behind public issues and fresh perspectives on everyday life. Step away from doomscrolling, ads, and algorithmic feeds, and follow your own curiosity.";

test("homepage delegates to the focused v2 composition", () => {
  assert.match(homepage, /partial "home_front_page\.html"/);
  assert.match(homeFrontPage, /partial "home_v2_front_page\.html"/);
  assert.doesNotMatch(homepage, /home_bookstore_spotlight|home_selected_collections|home_2045_launch|newsletter_signup/);
  assert.doesNotMatch(homeFrontPage, /home_bookstore_spotlight|home_selected_collections|home_2045_launch|newsletter_signup/);
});

test("reader banner contains only owner-provided proof and the newsletter offer has one separate form", () => {
  assert.doesNotMatch(config, /article_count_label|reader_count_label/);
  assert.match(readerBanner, /hugo\.Data\.homepage_metrics/);
  assert.match(metrics, /250\+/);
  assert.match(metrics, /10,000\+/);
  assert.match(metrics, /compact_label: "10k\+"/);
  assert.match(readerBanner, /<strong>Weekly<\/strong>\s*<span>Newsletter<\/span>/);
  assert.match(readerBanner, /<section class="masthead-proof"/);
  assert.match(readerBanner, /class="home-reader-banner__audience-short" aria-hidden="true"/);
  assert.match(readerBanner, /aria-label="Outside In Print at a glance"/);
  assert.doesNotMatch(readerBanner, /<form\b|home-reader-banner__signup|home-reader-email|id="home-reader-banner-title"/);
  assert.match(readerBanner, /<a class="home-reader-banner__proof-item home-reader-banner__newsletter-link" href="#home-reader-banner-title">\s*<strong>Weekly<\/strong>\s*<span>Newsletter<\/span>\s*<\/a>/);
  assert.match(readerNewsletter, /class="home-reader-banner home-reader-newsletter page-shell page-shell--wide"/);
  assert.match(readerNewsletter, /aria-labelledby="home-reader-banner-title"/);
  assert.match(readerNewsletter, /From the imprint/);
  assert.doesNotMatch(readerNewsletter, /Independent writing on history, economics, culture, and public life\./);
  assert.match(readerNewsletter, /<h2 id="home-reader-banner-title" tabindex="-1">/);
  assert.match(readerNewsletter, /One thoughtful letter each week\./);
  assert.match(readerNewsletter, /No spam ever\. Unsubscribe anytime\./);
  assert.match(readerNewsletter, /Join the newsletter/);
  assert.match(readerNewsletter, /eq \$provider "buttondown"/);
  assert.match(readerNewsletter, /data-analytics-event="newsletter_submit"/);
  assert.match(readerNewsletter, /data-analytics-source-slot="homepage_reader_banner"/);
  assert.match(readerNewsletter, /action="https:\/\/buttondown\.com\/api\/emails\/embed-subscribe\/\{\{ \$buttondownUsername \}\}"/);
  assert.match(readerNewsletter, /method="post"/);
  assert.match(readerNewsletter, /<label for="home-reader-email">Email address<\/label>/);
  const composition = `${homeV2}\n${readerBanner}\n${readerNewsletter}`;
  assert.equal((composition.match(/<form\b/g) || []).length, 1);
  assert.equal((composition.match(/id="home-reader-email"/g) || []).length, 1);
  assert.equal((composition.match(/id="home-reader-banner-title"/g) || []).length, 1);
  assert.equal((homeV2.match(/partial "home_reader_newsletter\.html"/g) || []).length, 1);
  assert.doesNotMatch(readerNewsletter, /home-reader-banner__proof|No ads ever|beyond the feed/);
  assert.match(readerNewsletter, /partial "collections\/lookup-definition\.html" "bobs-almanack"/);
  assert.match(readerNewsletter, /partial "collections\/resolve-items\.html"[\s\S]*"publishedOnly" true/);
  assert.match(readerNewsletter, /home-reader-newsletter__issue/);
  assert.match(readerNewsletter, /New writing:|One number:|This week's virtue:/);
});

test("masthead proof sits between its controls and lead summaries keep supporting precedence", () => {
  assert.doesNotMatch(homeV2, /home-v2__support|Support Independent Media/);
  assert.match(masthead, /\{\{ if \$isHomeMasthead \}\}\{\{ partial "home_reader_banner\.html" \. \}\}\{\{ end \}\}/);
  assert.ok(masthead.indexOf('data-paper-route-launch') < masthead.indexOf('partial "home_reader_banner.html"'));
  assert.ok(masthead.indexOf('partial "home_reader_banner.html"') < masthead.indexOf('data-theme-toggle'));
  assert.doesNotMatch(homeV2, /partial "home_reader_banner\.html"/);
  assert.doesNotMatch(homeV2, /home-v2__subjects|Independent writing on history, economics, culture, and public life\./);
  assert.match(leadSummary, /strings\.TrimSpace[\s\S]*\.Params\.description[\s\S]*plainify/);
  assert.match(leadSummary, /if not \$summary[\s\S]*partial "discovery\/page-summary\.html"/);
  const lead = homeV2.slice(homeV2.indexOf('<article class="home-v2-featured__lead">'), homeV2.indexOf("{{- else }}", homeV2.indexOf('<article class="home-v2-featured__lead">')));
  assert.match(lead, /partial "home_lead_summary\.html" \$page/);
  assert.doesNotMatch(lead, /partial "discovery\/page-summary\.html"/);
  assert.equal((homeV2.match(/partial "home_lead_summary\.html"/g) || []).length, 1);
  assert.equal((homeV2.match(/partial "discovery\/page-summary\.html"/g) || []).length, 1);
});

test("featured reading leads with Dolphin, then the latest publication and curated supports", () => {
  const routes = [
    "/essays/the-dolphin-company/",
    "/syd-and-oliver/what-i-had/",
    "/essays/default-owner/",
    "/essays/reverse-origami/",
  ];
  const indexes = routes.map((route) => selected.indexOf(`"${route}"`));
  assert.ok(indexes.every((index) => index >= 0));
  assert.deepEqual(indexes, [...indexes].sort((left, right) => left - right));
  assert.doesNotMatch(selected, /what-happened-at-camp-mystic|why-a-return-to-the-gold-standard|the-little-prince|russias-slow-surrender/);
  assert.match(selected, /\$eligible = sort \(sort \$eligible "Title" "asc"\) "PublishDate" "desc"/);
  assert.match(selected, /\$flagshipRoute := "\/essays\/the-dolphin-company\/"/);
  assert.match(selected, /range where \$eligible "RelPermalink" \$flagshipRoute/);
  assert.match(selected, /range first 1 \$eligible/);
  assert.ok(selected.indexOf('range where $eligible "RelPermalink" $flagshipRoute') < selected.indexOf("range first 1 $eligible"));
  assert.ok(selected.indexOf("range $eligible") < selected.indexOf("range $route := $supportingRoutes"));
  assert.match(selected, /partial "archive\/longform-kind\.html"/);
  assert.match(selected, /not \(in \$selectedPaths \.RelPermalink\)/);
  assert.match(selected, /first \(sub 5 \(len \$featured\)\) \$fallback/);

  for (const label of ["3.4K reads", "1.95K reads", "1.8K reads", "1.4K reads", "1.1K reads", "25 reads"]) {
    assert.ok(metrics.includes(label), `retain inherited metric ${label}`);
    assert.ok(!homeV2.includes(label), "metric values belong in the internal data record");
  }
  assert.match(homeV2, /hugo\.Data\.homepage_metrics/);
  assert.match(homeV2, /A flagship case study, the latest publication, and selected work\./);
  assert.match(homeV2, /Read the piece/);
  assert.doesNotMatch(homeV2, /Read the essay/);
  assert.doesNotMatch(metrics, /\d(?:K)? readers/);
  assert.doesNotMatch(homeV2, /Medium reads/i);
});

test("internal metric records retain provenance and disclose unverified inherited observations", () => {
  const figures = [...metrics.matchAll(/^ {4}value: (\d+)$/gm)].map((match) => Number(match[1]));
  assert.equal(figures.length, 8, "retain the two banner claims and six inherited article figures");
  for (const field of ["display_label", "source", "metric_definition", "period", "observed_at", "evidence_ref", "verification_status", "recorded_at"]) {
    assert.equal((metrics.match(new RegExp(`^ {4}${field}:`, "gm")) || []).length, figures.length, `every figure needs ${field}`);
  }
  assert.match(metrics, /^reader_threshold: 1000$/m);
  assert.equal((metrics.match(/^ {4}observed_at: null$/gm) || []).length, 7);
  assert.equal((metrics.match(/^ {4}evidence_ref: null$/gm) || []).length, 7);
  assert.match(metrics, /owner_supplied_unverified_aggregation/);
  assert.equal((metrics.match(/verification_status: "inherited_unverified_snapshot"/g) || []).length, 6);
  assert.match(metrics, /do not establish unique people or accounts|neither[^\n]*establish unique people or accounts/i);
  assert.doesNotMatch(metrics, /^ {2}"\/(?:essays\/what-happened-at-camp-mystic|syd-and-oliver\/what-i-had)\/":/m);
  assert.match(homeV2, /if ge \.value \$readerThreshold/);
  assert.match(homeV2, /index \$readerMetrics \$page\.RelPermalink/);
});

test("featured eligibility excludes drafts, future and expired work before choosing a duplicate-free fallback", () => {
  assert.match(selected, /not \.Draft/);
  assert.match(selected, /le \.PublishDate\.Unix \$now\.Unix/);
  assert.match(selected, /le \.Date\.Unix \$now\.Unix/);
  assert.match(selected, /or \.ExpiryDate\.IsZero \(gt \.ExpiryDate\.Unix \$now\.Unix\)/);
  assert.match(selected, /range where \$eligible "RelPermalink" \$route/);
  assert.match(selected, /\$fallbackPaths := \$selectedPaths/);
  assert.match(selected, /not \(in \$fallbackPaths \.RelPermalink\)/);
  assert.match(homeV2, /partial "archive\/longform-kind\.html" \$page\) "dialogue"/);
  assert.match(homeV2, /\$page\.Params\.section_label \| default "Essay"/);
  assert.match(homeV2, /eq \$page\.RelPermalink "\/essays\/the-dolphin-company\/"/);
  assert.match(homeV2, /\$sectionLabel = "Case study"/);
  assert.doesNotMatch(homeV2, /what-happened-at-camp-mystic|\$sectionLabel = "Reported analysis"/);
  const campSource = read("content/essays/what-happened-at-camp-mystic.md");
  assert.doesNotMatch(campSource, /^section_label: ["']?Reported analysis/m, "homepage curation must not reclassify the canonical essay");
  assert.match(read("content/essays/the-dolphin-company.md"), /^section_label: "Essay"\r?$/m, "Case study is a homepage label, not a canonical classification change");
  assert.match(read("content/essays/musings/reverse-origami.md"), /^section_label: "Musing"\r?$/m);
  assert.match(read("content/essays/dialogues/what-i-had.md"), /^section_label: 'Dialogue'\r?$/m);
});

test("homepage follows the proof, note, featured reading, library, newsletter, contributor sequence", () => {
  assert.equal((homeV2.match(/<h1\b/g) || []).length, 1);
  assert.match(homeV2, /<h1 id="home-front-page-title" class="title visually-hidden">/);
  assert.match(masthead, /partial "home_reader_banner\.html"/);
  assert.match(homeV2, /A note to the reader/);
  const welcomeCopyParagraphs = Array.from(homeV2.matchAll(/<p class="home-front-page__welcome-copy">([\s\S]*?)<\/p>/g));
  assert.equal(welcomeCopyParagraphs.length, 1);
  assert.equal(welcomeCopyParagraphs[0][1].trim(), readerNoteCopy);
  assert.doesNotMatch(homeV2, /home-reader-note-rest|data-reader-note-toggle|home-front-page__note-toggle|js\/home-reader-note\.js/);
  assert.match(
    homeV2,
    /<p class="home-front-page__welcome-links"><a href="\{\{ "about\/" \| relURL \}\}">About the imprint<\/a><a href="\{\{ "authors\/robert-v-ussley\/" \| relURL \}\}">About the author<\/a><\/p>/,
  );
  assert.doesNotMatch(homeV2, /<p class="home-front-page__welcome-links">[\s\S]*?Start reading[\s\S]*?<\/p>/);
  assert.match(homeV2, /<h2 id="home-v2-featured-title">Featured Articles<\/h2>/);
  assert.doesNotMatch(homeV2, /Where to begin/);
  assert.match(homeV2, /homepage_v2_featured_lead/);
  assert.match(homeV2, /homepage_v2_featured_supporting/);
  const library = homeV2.match(/<nav\b[^>]*class="home-v2-library [^"]*"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(library, "the reading links need their own navigation region");
  assert.deepEqual([...library.matchAll(/<a href="\{\{ "([^"]+)" \| relURL \}\}">([^<]+)<\/a>/g)].map((match) => match.slice(1)), [
    ["library/", "Browse the library"],
    ["random/", "Surprise me"],
  ]);
  assert.equal((library.match(/<a\b/g) || []).length, 2);
  assert.match(homeV2, /aria-label="Keep reading"/);
  assert.match(homeV2, /aria-label="Become a contributor"/);
  assert.doesNotMatch(homeV2, /The full imprint|Find your next question|Browse the archive|Search the library|home-v2-next__browse|"archive\/"/);
  assert.match(homeV2, /Become a contributor/);
  assert.doesNotMatch(homeV2, /home_imprint_statement|home-manifesto/);

  const order = [
    'class="home-front-page__orientation"',
    'class="home-v2-featured',
    'class="home-v2-library',
    'partial "home_reader_newsletter.html"',
    'class="home-v2-next',
  ].map((marker) => homeV2.indexOf(marker));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));

  assert.doesNotMatch(homeV2, /home-bookstore|home-almanack|home-selected-collections|home_2045_launch|Bob(?:'|’)s Almanack/);
});

test("featured lead reuses a published image and responsive rendering", () => {
  assert.match(homeV2, /with \$page\.Params\.featured_image/);
  assert.match(homeV2, /partial "images\/model\.html"/);
  assert.match(homeV2, /partial "images\/picture\.html"/);
  assert.match(homeV2, /"loading" "eager"/);
  assert.match(homeV2, /"fetchpriority" "high"/);
  assert.doesNotMatch(homeV2, /<img\b/);
});

test("supporting illustrations open articles on mobile with a separate zoom control", () => {
  assert.match(homeV2, /home-v2-featured__item\{\{ if \$imageModel \}\} home-v2-featured__item--illustrated/);
  assert.match(homeV2, /class="home-v2-featured__item-media" href="\{\{ \$page\.RelPermalink \}\}"/);
  assert.match(homeV2, /class="home-v2-featured__item-copy"/);
  assert.match(homeV2, /\$supportImageSizes := "120px"/);
  assert.match(homeV2, /if eq \$index 1[\s\S]*?\$supportImageSizes = "\(min-width: 72rem\) 24rem, \(min-width: 48rem\) 38vw, 100vw"/);
  assert.match(homeV2, /"loading" "lazy"[\s\S]*?"sizes" \$supportImageSizes/);
  assert.match(homeV2, /<span class="home-v2-featured__new-tag">New!<\/span>/);
  const mobileArtIndex = homeV2.indexOf('partial "home_featured_image_button.html"');
  assert.ok(mobileArtIndex > homeV2.indexOf('class="home-v2-featured__item-media"'));
  assert.ok(mobileArtIndex < homeV2.indexOf('class="home-v2-featured__item-copy"'));
  assert.doesNotMatch(homeV2, /home-v2-featured__meta[^\n]*partial "home_featured_image_button\.html"/);
  assert.equal((homeV2.match(/partial "home_featured_image_dialog\.html"/g) || []).length, 1);
  assert.match(homeV2, /resources\.Get "js\/home-featured-image\.js" \| minify \| fingerprint "sha384"/);
  assert.match(featuredImageButton, /<button\b[^>]*type="button"[^>]*data-home-featured-image-trigger[^>]*aria-haspopup="dialog"[^>]*aria-controls="home-featured-image-dialog" hidden>/);
  assert.match(featuredImageButton, /data-image="\{\{ \$model\.lightbox_url \}\}"/);
  assert.match(featuredImageButton, /data-alt="\{\{ \$page\.Params\.featured_image_alt/);
  assert.match(featuredImageButton, /<a\b[^>]*data-home-featured-image-fallback[^>]*href="\{\{ \$model\.lightbox_url \}\}"/);
  for (const tag of ["button", "a"]) {
    const artwork = featuredImageButton.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1];
    assert.ok(artwork);
    assert.doesNotMatch(artwork, /partial "images\/picture\.html"|<img\b/);
    assert.match(artwork, /<svg\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<circle\b[\s\S]*?<path\b[\s\S]*?<\/svg>/);
  }
  assert.match(featuredImageDialog, /<dialog id="home-featured-image-dialog"[^>]*aria-labelledby="home-featured-image-title"/);
  assert.match(featuredImageDialog, /<button\b[^>]*data-home-featured-image-close[^>]*aria-label="Close illustration"/);
  assert.match(css, /\.home-v2-featured__image-toggle\{[^}]*display:grid;/);
  assert.match(css, /\.home-v2-featured__image-toggle::before\{[^}]*background:rgba\(247,238,216,\.92\);/);
  assert.match(css, /\.home-v2-featured__art\{position:relative;/);
  assert.match(css, /\.home-v2-featured__item--latest\.home-v2-featured__item--illustrated\{[^}]*display:block;/);
  assert.match(css, /\.home-v2-featured__item--latest \.home-v2-featured__item-media img\{[^}]*object-fit:contain;/);
  assert.match(css, /@media \(max-width:768px\)[\s\S]*\.home-v2-featured__item--illustrated\{[^}]*grid-template-columns:minmax\(0, 6rem\) minmax\(0, 1fr\);/);
  assert.match(css, /@media \(max-width:768px\)[\s\S]*\.home-v2-featured__item-media\{[^}]*display:block;/);
});

test("contributor lane is public, specific, and linked from the homepage", () => {
  assert.match(contributor, /^title: "Write for Outside In Print"$/m);
  assert.match(contributor, /original essays and reported articles/);
  assert.match(contributor, /## What Fits/);
  assert.match(contributor, /## Start With a Pitch/);
  assert.match(contributor, /support@outsideinprint\.org/);
  assert.match(contributor, /Sending a pitch does not guarantee publication\./);
  assert.match(homeV2, /href="\{\{ "contribute\/" \| relURL \}\}">Become a contributor<\/a>/);
  assert.match(homeV2, /partial "home_reader_newsletter\.html"[^]*?<section class="home-v2-next page-shell page-shell--wide" aria-label="Become a contributor">\s*<a class="home-v2-next__cta" href="\{\{ "contribute\/" \| relURL \}\}">Become a contributor<\/a>\s*<\/section>/);
  assert.doesNotMatch(homeV2, /home-v2-next__contribute|Publish with us|Write for Outside In Print\.|Have an original article or essay/);
  assert.match(css, /\.home-v2-next\{[^}]*display:flex;[^}]*justify-content:center;[^}]*margin-top:\.5rem;/);
  assert.doesNotMatch(css.match(/\.home-v2-next\{([^}]*)\}/)?.[1] || "", /border|background/);
});

test("new homepage system has responsive, keyboard-visible editorial styling", () => {
  for (const selector of [
    ".home-reader-banner",
    ".home-v2-featured",
    ".home-v2-featured__grid",
    ".home-v2-featured__lead",
    ".home-v2-featured__supporting",
    ".home-v2-library.home-v2-next__links",
    ".home-v2-next",
    ".home-v2-next__cta",
  ]) {
    assert.match(css, new RegExp(`\\${selector}\\{`), `missing CSS rule for ${selector}`);
  }
  assert.match(css, /\.home-v2-featured h3 a:focus-visible,[\s\S]*outline:3px solid var\(--focus-ring\)/);
  assert.match(css, /\.home-v2-next__links a,[\s\S]*min-height:44px/);
  assert.match(css, /\.home-reader-banner\.page-shell--wide\{[^}]*max-width:70rem;/);
  assert.doesNotMatch(css, /\.home-v2__support/);
  assert.match(css, /\.home-reader-banner__newsletter-link span\{[^}]*text-decoration:underline;/);
  assert.match(css, /\.home-reader-banner__newsletter-link:focus-visible[^{}]*\{[^}]*outline:3px solid var\(--focus-ring\);/);
  assert.match(css, /\.home-reader-banner__newsletter-link\{[^}]*min-height:34px;/);
  assert.match(css, /\.home-reader-banner__newsletter-link::before\{[^}]*inset:-5px 0;/);
  assert.match(css, /\.home-v2-featured\{[^}]*margin-top:1\.25rem;/);
  assert.match(css, /@media \(max-width:520px\)[\s\S]*\.home-v2-featured\{[^}]*margin-top:1rem;/);
  assert.match(css, /\.home-v2-featured\.page-shell--wide,\s*\.home-v2-library\.page-shell--wide,\s*\.home-v2-next\.page-shell--wide\{[^}]*max-width:70rem;/);
  assert.match(css, /\.home-front-page__orientation\{[^}]*display:grid;[^}]*grid-template-areas:\s*"label"\s*"copy"\s*"links";[^}]*max-width:70rem;/);
  assert.match(css, /\.home-front-page__welcome-copy\{[^}]*margin:0;[^}]*font-size:\.94rem;[^}]*line-height:1\.42;/);
  assert.match(css, /@media \(max-width:900px\)[\s\S]*\.home-v2-featured__grid\{[^}]*grid-template-columns:1fr/);
  assert.match(css, /@media \(max-width:900px\)[\s\S]*\.home-v2-featured__header\{[^}]*grid-template-columns:1fr;[^}]*gap:\.55rem;/);
  assert.match(css, /@media \(max-width:520px\)[\s\S]*\.home-v2-featured__supporting\{\s*display:block/);
  assert.match(css, /@media \(max-width:520px\)[\s\S]*\.home-reader-banner__proof-item\{[^}]*padding:0 \.2rem/);
  assert.match(css, /@media \(max-width:520px\)[\s\S]*\.home-reader-banner__controls\{[\s\S]*grid-template-columns:minmax\(0, 1fr\) auto/);
  assert.match(css, /@media \(max-width:360px\)[\s\S]*\.home-reader-banner__controls\{\s*grid-template-columns:1fr/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.home-front-page__welcome-links\{[^}]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width:360px\)[\s\S]*\.home-v2-featured__meta span \+ span::before\{[^}]*content:none;/);
});
