import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");

const homepage = read("layouts/index.html");
const homeFrontPage = read("layouts/partials/home_front_page.html");
const homeV2 = read("layouts/partials/home_v2_front_page.html");
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
const readerNoteCopy = "However you found this site—through a search, a shared link, or a single essay—you are welcome here. Outside In Print is for readers tired of being hurried from clip to clip and headline to headline. Step outside the feed, stay with an idea, ask for the evidence, and make up your own mind. Read whatever catches your eye. Follow a question farther than the algorithm would. Come back when you want something worth your attention.";

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
  assert.match(readerBanner, /<strong>Weekly<\/strong>\s*<span>Newsletter<\/span>/);
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
  assert.doesNotMatch(readerNewsletter, /home-reader-banner__proof|Bob(?:'|’)s Almanack|No ads ever|beyond the feed/);
});

test("subject territory appears once before the proof strip and lead summaries do not change supporting precedence", () => {
  const subjects = "Independent writing on history, economics, culture, and public life.";
  assert.match(homeV2, /<p class="home-v2__subjects page-shell page-shell--wide">Independent writing on history, economics, culture, and public life\.<\/p>/);
  assert.equal(`${homeV2}\n${readerBanner}\n${readerNewsletter}`.split(subjects).length - 1, 1);
  assert.ok(homeV2.indexOf(subjects) < homeV2.indexOf('partial "home_reader_banner.html"'));
  assert.match(leadSummary, /strings\.TrimSpace[\s\S]*\.Params\.description[\s\S]*plainify/);
  assert.match(leadSummary, /if not \$summary[\s\S]*partial "discovery\/page-summary\.html"/);
  const lead = homeV2.slice(homeV2.indexOf('<article class="home-v2-featured__lead">'), homeV2.indexOf("{{- else }}", homeV2.indexOf('<article class="home-v2-featured__lead">')));
  assert.match(lead, /partial "home_lead_summary\.html" \$page/);
  assert.doesNotMatch(lead, /partial "discovery\/page-summary\.html"/);
  assert.equal((homeV2.match(/partial "home_lead_summary\.html"/g) || []).length, 1);
  assert.equal((homeV2.match(/partial "discovery\/page-summary\.html"/g) || []).length, 1);
});

test("featured reading leads with the latest publication and keeps four ordered editorial supports", () => {
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
  assert.match(selected, /range first 1 \$eligible/);
  assert.ok(selected.indexOf("range first 1 $eligible") < selected.indexOf("range $route := $supportingRoutes"));
  assert.match(selected, /partial "archive\/longform-kind\.html"/);
  assert.match(selected, /not \(in \$selectedPaths \.RelPermalink\)/);
  assert.match(selected, /first \(sub 5 \(len \$featured\)\) \$fallback/);

  for (const label of ["3.4K reads", "1.95K reads", "1.8K reads", "1.4K reads", "1.1K reads", "25 reads"]) {
    assert.ok(metrics.includes(label), `retain inherited metric ${label}`);
    assert.ok(!homeV2.includes(label), "metric values belong in the internal data record");
  }
  assert.match(homeV2, /hugo\.Data\.homepage_metrics/);
  assert.match(homeV2, /The latest publication, reader favorites, and defining work\./);
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
  assert.match(homeV2, /partial "home_reader_banner\.html"/);
  assert.match(homeV2, /A note to the reader/);
  const welcomeCopyParagraphs = Array.from(homeV2.matchAll(/<p class="home-front-page__welcome-copy">([\s\S]*?)<\/p>/g));
  assert.equal(welcomeCopyParagraphs.length, 1);
  assert.equal(welcomeCopyParagraphs[0][1].replace(/<[^>]+>/g, "").trim(), readerNoteCopy);
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
    'class="home-v2__subjects ',
    'partial "home_reader_banner.html"',
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

test("supporting illustrations stay square on mobile with a dialog and an artwork-link fallback", () => {
  assert.match(homeV2, /home-v2-featured__item\{\{ if \$imageModel \}\} home-v2-featured__item--illustrated/);
  assert.match(homeV2, /class="home-v2-featured__item-media" href="\{\{ \$page\.RelPermalink \}\}"/);
  assert.match(homeV2, /class="home-v2-featured__item-copy"/);
  assert.match(homeV2, /"loading" "lazy"[\s\S]*?"sizes" "120px"/);
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
    assert.match(artwork, /partial "images\/picture\.html"/);
    assert.match(artwork, /"loading" "lazy"/);
    assert.match(artwork, /"sizes" "120px"/);
    assert.doesNotMatch(artwork, /<svg\b|\bImage\b/);
  }
  assert.match(featuredImageDialog, /<dialog id="home-featured-image-dialog"[^>]*aria-labelledby="home-featured-image-title"/);
  assert.match(featuredImageDialog, /<button\b[^>]*data-home-featured-image-close[^>]*aria-label="Close illustration"/);
  assert.match(css, /\.home-v2-featured__image-toggle\{[^}]*aspect-ratio:1;/);
  assert.match(css, /\.home-v2-featured__image-toggle img\{[^}]*object-fit:cover;/);
  assert.match(css, /\.home-v2-featured__image-toggle\{[^}]*display:none;/);
  assert.match(css, /@media \(max-width:768px\)[\s\S]*\.home-v2-featured__item--illustrated\{[^}]*grid-template-columns:minmax\(0, 6rem\) minmax\(0, 1fr\);/);
  assert.match(css, /@media \(max-width:768px\)[\s\S]*\.home-v2-featured__image-toggle:not\(\[hidden\]\)\{[^}]*display:block;/);
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
  const subjectsCss = css.match(/\.home-v2__subjects\.page-shell--wide\{([^}]*)\}/)?.[1] || "";
  assert.match(subjectsCss, /max-width:70rem;/);
  assert.match(subjectsCss, /font-size:1rem;/);
  assert.match(subjectsCss, /line-height:1\.4;/);
  assert.match(css, /\.home-reader-banner__newsletter-link span\{[^}]*text-decoration:underline;/);
  assert.match(css, /\.home-reader-banner__newsletter-link:focus-visible[^{}]*\{[^}]*outline:3px solid var\(--focus-ring\);/);
  assert.match(css, /\.home-reader-banner__newsletter-link\{[^}]*min-height:44px;/);
  assert.match(css, /\.home-v2-featured\{[^}]*margin-top:1\.25rem;/);
  assert.match(css, /@media \(max-width:520px\)[\s\S]*\.home-v2-featured\{[^}]*margin-top:1rem;/);
  assert.match(css, /\.home-v2-featured\.page-shell--wide,\s*\.home-v2-library\.page-shell--wide,\s*\.home-v2-next\.page-shell--wide\{[^}]*max-width:70rem;/);
  assert.match(css, /\.home-front-page__orientation\{[^}]*display:grid;[^}]*grid-template-areas:\s*"label"\s*"copy"\s*"links";[^}]*max-width:70rem;/);
  assert.match(css, /\.home-front-page__welcome-copy\{[^}]*margin:0;[^}]*font-size:\.94rem;[^}]*line-height:1\.42;/);
  assert.match(css, /@media \(max-width:900px\)[\s\S]*\.home-v2-featured__grid\{[^}]*grid-template-columns:1fr/);
  assert.match(css, /@media \(max-width:520px\)[\s\S]*\.home-v2-featured__supporting\{\s*display:block/);
  assert.match(css, /@media \(max-width:520px\)[\s\S]*\.home-reader-banner__proof-item\{[\s\S]*padding:\.45rem \.3rem \.42rem/);
  assert.match(css, /@media \(max-width:520px\)[\s\S]*\.home-reader-banner__controls\{[\s\S]*grid-template-columns:minmax\(0, 1fr\) auto/);
  assert.match(css, /@media \(max-width:360px\)[\s\S]*\.home-reader-banner__controls\{\s*grid-template-columns:1fr/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.home-front-page__welcome-links\{[^}]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width:360px\)[\s\S]*\.home-v2-featured__meta span \+ span::before\{[^}]*content:none;/);
});
