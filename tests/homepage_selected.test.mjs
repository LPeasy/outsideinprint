import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readCurrentCartoonRecord(source) {
  const currentMatch = source.match(/^current:\s*(.+)$/m);
  assert.ok(currentMatch, "expected editorial cartoons data to define a current slug");

  const currentSlug = currentMatch[1].trim();
  const entryPattern = new RegExp(
    `^\\s*-\\s+slug:\\s+${escapeRegex(currentSlug)}\\s*\\r?\\n([\\s\\S]*?)(?=^\\s*-\\s+slug:|(?![\\s\\S]))`,
    "m"
  );
  const entryMatch = source.match(entryPattern);
  assert.ok(entryMatch, `expected editorial cartoons data to include the current slug entry: ${currentSlug}`);

  const imageMatch = entryMatch[1].match(/^\s+image:\s+"([^"]+)"$/m);
  assert.ok(imageMatch, `expected editorial cartoons data to include an image for current slug: ${currentSlug}`);

  return {
    slug: currentSlug,
    image: imageMatch[1]
  };
}

function normalizeDateString(value) {
  const match = String(value ?? "").match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function selectHomepageLongform(pages) {
  const frontPagePages = pages
    .filter((page) => (page.kind === "essay" || page.kind === "dialogue") && page.draft !== true)
    .sort((left, right) => right.date - left.date);

  const latest = frontPagePages[0] ?? null;
  const hero = latest ?? null;
  const showLatestSlot = false;
  const selected = [];
  const seen = new Set();

  if (hero) {
    selected.push(hero);
    seen.add(hero.relPermalink);
  }

  if (showLatestSlot && latest) {
    selected.push(latest);
    seen.add(latest.relPermalink);
  }

  const secondary = [];
  for (const candidate of frontPagePages) {
    if (secondary.length >= 4 || seen.has(candidate.relPermalink)) continue;
    secondary.push(candidate);
    selected.push(candidate);
    seen.add(candidate.relPermalink);
  }

  return {
    hero,
    lead: hero,
    latest,
    showLatestSlot,
    secondary,
    selected,
    keys: selected.map((page) => page.relPermalink)
  };
}

function parseFrontMatter(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, `expected front matter in ${filePath}`);

  const data = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    if (!rawLine || /^\s/.test(rawLine)) continue;
    const separator = rawLine.indexOf(":");
    if (separator === -1) continue;

    const key = rawLine.slice(0, separator).trim();
    let value = rawLine.slice(separator + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");

    if (value === "true" || value === "false") {
      data[key] = value === "true";
    } else if (/^[1-9]\d*$/.test(value)) {
      data[key] = Number(value);
    } else {
      data[key] = value;
    }
  }

  return data;
}

test("homepage partial keeps one lead and fills the right rail with newest essays and dialogues", () => {
  const source = fs.readFileSync(path.resolve("layouts/partials/home_selected.html"), "utf8");
  const frontPageSource = fs.readFileSync(path.resolve("layouts/partials/home_front_page.html"), "utf8");
  const frontPageCopySource = fs.readFileSync(path.resolve("layouts/partials/home_front_page_copy.html"), "utf8");
  const indexSource = fs.readFileSync(path.resolve("layouts/index.html"), "utf8");
  const baseLayout = fs.readFileSync(path.resolve("layouts/_default/baseof.html"), "utf8");
  const cartoonData = fs.readFileSync(path.resolve("data/editorial_cartoons.yaml"), "utf8");
  const currentCartoon = readCurrentCartoonRecord(cartoonData);
  const galleryContent = fs.readFileSync(path.resolve("content/gallery/_index.md"), "utf8");
  const galleryTemplate = fs.readFileSync(path.resolve("layouts/gallery/list.html"), "utf8");
  const cartoonLookupPartial = fs.readFileSync(path.resolve("layouts/partials/editorial/cartoon-for-page.html"), "utf8");
  const cartoonLinkPartial = fs.readFileSync(path.resolve("layouts/partials/editorial/cartoon-gallery-link.html"), "utf8");
  const cartoonThumbnailLightbox = fs.readFileSync(path.resolve("layouts/partials/editorial/cartoon-thumbnail-lightbox.html"), "utf8");
  const pageListItem = fs.readFileSync(path.resolve("layouts/partials/discovery/page-list-item.html"), "utf8");

  assert.match(source, /partial "archive\/longform-kind\.html"/);
  assert.match(source, /Homepage selection follows the archive longform model for essays and dialogues/);
  assert.match(source, /\{\{ range site\.RegularPages \}\}/);
  assert.match(source, /\{\{ \$kind := partial "archive\/longform-kind\.html" \. \}\}/);
  assert.match(source, /\{\{ if or \(eq \$kind "essay"\) \(eq \$kind "dialogue"\) \}\}/);
  assert.match(source, /sort \(sort \$frontPagePages "Title" "asc"\) "Date" "desc"/);
  assert.match(source, /\{\{ \$hero := \$latest \}\}/);
  assert.match(source, /\{\{ \$showLatestSlot := false \}\}/);
  assert.match(source, /range \$candidate := \$frontPagePages/);
  assert.match(source, /lt \(len \$secondary\) 4/);
  assert.match(source, /home_selected_keys/);
  assert.match(source, /"pages" \$selectedPages/);
  assert.match(source, /"keys" \$selectedKeys/);
  assert.match(source, /return \(dict/);
  assert.doesNotMatch(source, /Params\.featured/);
  assert.doesNotMatch(source, /Params\.homepage_featured/);
  assert.doesNotMatch(source, /Params\.homepage_featured_until/);
  assert.doesNotMatch(source, /currentCartoonPage/);
  assert.doesNotMatch(source, /findRE "\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}"/);
  assert.doesNotMatch(source, /where site\.RegularPages "Section" "essays"/);
  assert.doesNotMatch(source, /Read Essay/);
  assert.doesNotMatch(source, /Download PDF/);
  assert.match(frontPageSource, /home_selected\.html/);
  assert.match(frontPageSource, /home_front_page_copy\.html/);
  assert.match(frontPageSource, /\{\{ \$leadReadLabel \}\} &rarr;/);
  assert.match(frontPageSource, /\{\{ \$latestReadLabel \}\} &rarr;/);
  assert.match(frontPageSource, /\{\{ \$readLabel \}\} &rarr;/);
  assert.match(frontPageCopySource, /partial "archive\/longform-kind\.html"/);
  assert.match(frontPageCopySource, /Latest Essay/);
  assert.match(frontPageCopySource, /Latest Dialogue/);
  assert.match(frontPageCopySource, /Read essay/);
  assert.match(frontPageCopySource, /Read dialogue/);
  assert.match(frontPageCopySource, /Dialogues/);
  assert.match(frontPageSource, /site\.Data\.editorial_cartoons/);
  assert.match(frontPageSource, /currentCartoonSlug/);
  assert.match(frontPageSource, /\$orderedCartoons := sort \$cartoons "date" "desc"/);
  assert.match(frontPageSource, /\$recentCartoons := slice/);
  assert.match(frontPageSource, /lt \(len \$recentCartoons\) 2/);
  assert.match(frontPageSource, /View gallery/);
  assert.match(frontPageSource, /"gallery\/" \| absURL/);
  assert.match(frontPageSource, /data-home-cartoon-recent/);
  assert.match(frontPageSource, /data-home-cartoon-recent-card/);
  assert.match(frontPageSource, /data-home-cartoon-recent-trigger/);
  assert.match(frontPageSource, /home-almanack-divider/);
  assert.match(frontPageSource, /class="home-almanack home-almanack--lead"/);
  assert.match(frontPageSource, /home-almanack__ledger/);
  assert.match(frontPageSource, /home-almanack__ledger-row--number/);
  assert.match(frontPageSource, /home-almanack__ledger-row--virtue/);
  assert.ok(frontPageSource.indexOf('data-home-cartoon-recent') < frontPageSource.indexOf('home-almanack-divider'));
  assert.ok(frontPageSource.indexOf('home-almanack--lead') < frontPageSource.indexOf('data-home-front-page-region="secondary"'));
  assert.match(frontPageSource, /data-home-cartoon-lightbox-trigger/);
  assert.match(frontPageSource, /data-home-cartoon-lightbox/);
  assert.match(frontPageSource, /data-home-cartoon-lightbox-image-button/);
  assert.match(frontPageSource, /data-home-cartoon-lightbox-essay/);
  assert.match(frontPageSource, /querySelectorAll\("\[data-home-cartoon-lightbox-trigger\]"\)/);
  assert.match(frontPageSource, /triggers\.forEach\(function \(trigger\)/);
  assert.doesNotMatch(frontPageSource, /var trigger = document\.querySelector\("\[data-home-cartoon-lightbox-trigger\]"\)/);
  assert.match(frontPageSource, /imageButton\.addEventListener\("click", closeLightbox\)/);
  assert.match(frontPageSource, /editorial\/cartoon-for-page\.html/);
  assert.match(frontPageSource, /editorial\/cartoon-gallery-link\.html/);
  assert.doesNotMatch(frontPageSource, /window\.location\.href/);
  assert.doesNotMatch(frontPageSource, /cartoon-think-outside-the-box\.png/);
  assert.match(frontPageSource, /data-home-front-page-region="lead"/);
  assert.match(frontPageSource, /data-home-front-page-region="secondary"/);
  assert.doesNotMatch(frontPageSource, /Featured Essay/);
  assert.doesNotMatch(frontPageSource, /Front Page Essay/);
  assert.match(frontPageSource, /range \$secondary/);
  assert.match(frontPageSource, /<h1 id="home-front-page-title" class="title visually-hidden">\{\{ site\.Title \}\}<\/h1>/);
  assert.doesNotMatch(frontPageSource, />Front Page</);
  assert.doesNotMatch(frontPageSource, /A curated front page from Outside In Print/);
  assert.doesNotMatch(frontPageSource, /class="home-manifesto"/);
  assert.doesNotMatch(frontPageSource, /A digital imprint of essays, reports, dialogues, and literature\./);
  assert.doesNotMatch(frontPageSource, /Color over the lines\. Read beyond the feed\. Think for yourself\./);
  assert.doesNotMatch(frontPageSource, /Support independent journalism/);
  assert.doesNotMatch(frontPageSource, /home-front-page__secondary-label/);
  assert.doesNotMatch(frontPageSource, /Read by guided path/);
  assert.match(indexSource, /home_front_page\.html/);
  assert.doesNotMatch(indexSource, /home_recent_work\.html/);
  assert.match(indexSource, /partial "home_imprint_statement\.html"/);
  assert.match(indexSource, /"label" "Gallery"/);
  assert.match(indexSource, /"label" "Library"/);
  assert.doesNotMatch(indexSource, /"label" "Welcome"/);
  assert.doesNotMatch(indexSource, /"label" "Feeling curious\?"/);
  assert.ok(indexSource.indexOf('partial "home_front_page.html"') < indexSource.indexOf('partial "home_bookstore_spotlight.html"'));
  assert.ok(indexSource.indexOf('partial "home_bookstore_spotlight.html"') < indexSource.indexOf('partial "home_imprint_statement.html"'));
  assert.ok(indexSource.indexOf('partial "home_imprint_statement.html"') < indexSource.indexOf('partial "home_selected_collections.html"'));
  assert.ok(indexSource.indexOf('partial "home_selected_collections.html"') < indexSource.indexOf('partial "newsletter_signup.html"'));
  assert.ok(indexSource.indexOf('partial "newsletter_signup.html"') < indexSource.indexOf('class="home-browse'));
  assert.match(cartoonData, /slug: think-outside-the-box/);
  assert.match(cartoonData, new RegExp(`current: ${escapeRegex(currentCartoon.slug)}`));
  assert.match(cartoonData, new RegExp(`slug: ${escapeRegex(currentCartoon.slug)}`));
  assert.match(cartoonData, new RegExp(`image: "${escapeRegex(currentCartoon.image)}"`));
  assert.match(galleryContent, /title: "Gallery"/);
  assert.match(galleryTemplate, /cartoon-gallery-spotlight/);
  assert.match(galleryTemplate, /cartoon-gallery__grid/);
  assert.match(galleryTemplate, /\$archiveCartoons := slice/);
  assert.match(galleryTemplate, /if ne \.slug \$currentSlug/);
  assert.match(galleryTemplate, /\$archiveCartoons = \$archiveCartoons \| append \./);
  assert.match(galleryTemplate, /range \$archiveCartoons/);
  assert.doesNotMatch(galleryTemplate, /cartoon-gallery__item--current/);
  assert.match(galleryTemplate, /data-cartoon-lightbox-trigger/);
  assert.match(galleryTemplate, /data-cartoon-slug/);
  assert.match(galleryTemplate, /data-cartoon-lightbox-image-button/);
  assert.match(galleryTemplate, /data-cartoon-lightbox-essay/);
  assert.match(galleryTemplate, /getRequestedCartoonSlug/);
  assert.match(galleryTemplate, /URLSearchParams\(window\.location\.search/);
  assert.match(galleryTemplate, /openLightbox\(requestedTrigger\)/);
  assert.match(cartoonLookupPartial, /site\.Data\.editorial_cartoons/);
  assert.match(cartoonLookupPartial, /\.essay/);
  assert.match(cartoonLinkPartial, /gallery\/\?cartoon=%s/);
  assert.match(cartoonLinkPartial, /essay-cartoon-thumb/);
  assert.match(cartoonLinkPartial, /<button/);
  assert.match(cartoonLinkPartial, /data-essay-cartoon-lightbox-trigger/);
  assert.match(cartoonLinkPartial, /data-gallery/);
  assert.match(cartoonLinkPartial, /<img/);
  assert.doesNotMatch(cartoonLinkPartial, /<a class="essay-cartoon-thumb/);
  assert.match(baseLayout, /editorial\/cartoon-thumbnail-lightbox\.html/);
  assert.match(cartoonThumbnailLightbox, /data-essay-cartoon-lightbox/);
  assert.match(cartoonThumbnailLightbox, /data-essay-cartoon-lightbox-gallery/);
  assert.match(cartoonThumbnailLightbox, /View in gallery/);
  assert.match(cartoonThumbnailLightbox, /imageButton\.addEventListener\("click", closeLightbox\)/);
  assert.doesNotMatch(cartoonThumbnailLightbox, /window\.location\.href/);
  assert.match(pageListItem, /editorial\/cartoon-for-page\.html/);
  assert.match(pageListItem, /editorial\/cartoon-gallery-link\.html/);
  assert.match(cartoonData, /essay: "\/essays\/the-warning-label-in-the-weeds\/"/);
  const thinkOutsideEntry = cartoonData.match(/  - slug: think-outside-the-box[\s\S]*?(?=\n  - slug:|\n?$)/)?.[0] || "";
  assert.doesNotMatch(thinkOutsideEntry, /essay:/);
});

test("latest essay or dialogue leads while the right rail uses the next newest longform pages", () => {
  const pages = [
    { relPermalink: "/essays/latest/", kind: "essay", draft: false, date: new Date("2026-03-01") },
    { relPermalink: "/essays/hero/", kind: "essay", draft: false, date: new Date("2026-01-01"), homepage_featured: true, homepage_featured_until: "2026-04-30" },
    { relPermalink: "/essays/expired/", kind: "essay", draft: false, date: new Date("2026-02-25"), homepage_featured: true, homepage_featured_until: "2026-04-01" },
    { relPermalink: "/essays/core-a/", kind: "essay", draft: false, date: new Date("2026-02-20") },
    { relPermalink: "/essays/core-b/", kind: "essay", draft: false, date: new Date("2026-02-10") },
    { relPermalink: "/essays/core-c/", kind: "essay", draft: false, date: new Date("2026-02-05") },
    { relPermalink: "/essays/core-d/", kind: "essay", draft: false, date: new Date("2026-02-01") },
    { relPermalink: "/syd-and-oliver/latest-dialogue/", kind: "dialogue", draft: false, date: new Date("2026-04-01"), homepage_featured: true, homepage_featured_until: "2026-04-30" },
    { relPermalink: "/essays/draft/", kind: "essay", draft: true, date: new Date("2026-04-02"), homepage_featured: true, homepage_featured_until: "2026-04-30" }
  ];

  const result = selectHomepageLongform(pages);

  assert.equal(result.hero?.relPermalink, "/syd-and-oliver/latest-dialogue/");
  assert.equal(result.latest?.relPermalink, "/syd-and-oliver/latest-dialogue/");
  assert.equal(result.showLatestSlot, false);
  assert.deepEqual(result.secondary.map((page) => page.relPermalink), ["/essays/latest/", "/essays/expired/", "/essays/core-a/", "/essays/core-b/"]);
  assert.equal(result.secondary.length, 4);
  assert.equal(new Set(result.selected.map((page) => page.relPermalink)).size, result.selected.length);
  assert.deepEqual(result.keys, result.selected.map((page) => page.relPermalink));
});

test("current cartoon essay does not override the latest essay lead", () => {
  const pages = [
    { relPermalink: "/essays/the-easement-under-the-lake/", kind: "essay", draft: false, date: new Date("2026-05-22") },
    { relPermalink: "/essays/id-required/", kind: "essay", draft: false, date: new Date("2026-05-19") },
    { relPermalink: "/essays/consent-from-permission-to-sanctity/", kind: "essay", draft: false, date: new Date("2026-05-18"), homepage_featured: true, homepage_featured_until: "2026-05-31" },
    { relPermalink: "/essays/from-variety-to-virtue/", kind: "essay", draft: false, date: new Date("2026-05-17") },
    { relPermalink: "/essays/the-ash-pond-under-the-cloud/", kind: "essay", draft: false, date: new Date("2026-05-16") }
  ];

  const result = selectHomepageLongform(pages, "2026-05-20", "/essays/id-required/");

  assert.equal(result.hero?.relPermalink, "/essays/the-easement-under-the-lake/");
  assert.equal(result.latest?.relPermalink, "/essays/the-easement-under-the-lake/");
  assert.equal(result.showLatestSlot, false);
  assert.deepEqual(result.secondary.map((page) => page.relPermalink), [
    "/essays/id-required/",
    "/essays/consent-from-permission-to-sanctity/",
    "/essays/from-variety-to-virtue/",
    "/essays/the-ash-pond-under-the-cloud/"
  ]);
  assert.equal(new Set(result.selected.map((page) => page.relPermalink)).size, result.selected.length);
});

test("active feature flags do not override newest essay lead", () => {
  const pages = [
    { relPermalink: "/essays/older/", kind: "essay", draft: false, date: new Date("2026-01-01"), homepage_featured: true, homepage_featured_until: "2026-04-30" },
    { relPermalink: "/essays/newer/", kind: "essay", draft: false, date: new Date("2026-02-01"), homepage_featured: true, homepage_featured_until: "2026-04-30" },
    { relPermalink: "/essays/latest/", kind: "essay", draft: false, date: new Date("2026-03-01") }
  ];

  const result = selectHomepageLongform(pages);

  assert.deepEqual(result.selected.map((page) => page.relPermalink), ["/essays/latest/", "/essays/newer/", "/essays/older/"]);
});

test("recent fallback remains stable when no active feature exists", () => {
  const pages = [
    { relPermalink: "/essays/a/", kind: "essay", draft: false, date: new Date("2026-03-03"), homepage_featured: true, homepage_featured_until: "2026-03-31" },
    { relPermalink: "/essays/b/", kind: "essay", draft: false, date: new Date("2026-03-02") },
    { relPermalink: "/essays/c/", kind: "essay", draft: false, date: new Date("2026-03-01") },
    { relPermalink: "/essays/d/", kind: "essay", draft: false, date: new Date("2026-02-28") }
  ];

  const result = selectHomepageLongform(pages);

  assert.deepEqual(result.selected.map((page) => page.relPermalink), ["/essays/a/", "/essays/b/", "/essays/c/", "/essays/d/"]);
});

test("front page stays structurally primary to collections and newsletter follow-up", () => {
  const source = fs.readFileSync(path.resolve("layouts/index.html"), "utf8");
  const frontPageSource = fs.readFileSync(path.resolve("layouts/partials/home_front_page.html"), "utf8");
  const partialSource = fs.readFileSync(path.resolve("layouts/partials/home_selected.html"), "utf8");

  assert.match(frontPageSource, /id="home-front-page-title"/);
  assert.match(frontPageSource, /<h1 id="home-front-page-title" class="title visually-hidden">\{\{ site\.Title \}\}<\/h1>/);
  assert.match(frontPageSource, /data-home-front-page-region="lead"/);
  assert.match(frontPageSource, /data-home-front-page-region="secondary"/);
  assert.match(frontPageSource, /site\.Data\.editorial_cartoons/);
  assert.match(frontPageSource, /data-home-cartoon-recent/);
  assert.match(frontPageSource, /data-home-cartoon-recent-trigger/);
  assert.doesNotMatch(frontPageSource, /Also on the front page/);
  assert.match(frontPageSource, /\{\{ \$leadReadLabel \}\} &rarr;/);
  assert.match(frontPageSource, /\{\{ \$readLabel \}\} &rarr;/);
  assert.match(frontPageSource, /View gallery/);
  assert.match(frontPageSource, /data-home-cartoon-lightbox-trigger/);
  assert.match(frontPageSource, /data-home-cartoon-lightbox-essay/);
  assert.match(frontPageSource, /querySelectorAll\("\[data-home-cartoon-lightbox-trigger\]"\)/);
  assert.match(frontPageSource, /essay-cartoon-thumb--home/);
  assert.match(frontPageSource, /editorial\/cartoon-gallery-link\.html/);
  assert.match(frontPageSource, /imageButton\.addEventListener\("click", closeLightbox\)/);
  assert.doesNotMatch(frontPageSource, /window\.location\.href/);
  assert.doesNotMatch(frontPageSource, /cartoon-think-outside-the-box\.png/);
  assert.doesNotMatch(frontPageSource, /A curated front page from Outside In Print/);
  assert.ok(frontPageSource.indexOf('id="home-front-page-title"') < frontPageSource.indexOf('class="home-front-page__stories"'));
  assert.match(partialSource, /"lead" \$hero/);
  assert.match(partialSource, /"secondary" \$secondary/);
  assert.ok(source.indexOf('partial "home_front_page.html"') < source.indexOf('partial "home_bookstore_spotlight.html"'));
  assert.ok(source.indexOf('partial "home_bookstore_spotlight.html"') < source.indexOf('partial "home_imprint_statement.html"'));
  assert.ok(source.indexOf('partial "home_imprint_statement.html"') < source.indexOf('partial "home_selected_collections.html"'));
  assert.ok(source.indexOf('partial "home_selected_collections.html"') < source.indexOf('partial "newsletter_signup.html"'));
  assert.ok(source.indexOf('partial "newsletter_signup.html"') < source.indexOf('class="home-browse'));
});

test("homepage bookstore spotlight stays weighted, data-driven, and internal-first", () => {
  const source = fs.readFileSync(path.resolve("layouts/index.html"), "utf8");
  const spotlight = fs.readFileSync(path.resolve("layouts/partials/home_bookstore_spotlight.html"), "utf8");

  assert.match(source, /partial "home_bookstore_spotlight\.html"/);
  assert.match(spotlight, /site\.GetPage "\/shop"/);
  assert.match(spotlight, /first 3 \(sort \.RegularPages "Weight" "asc"\)/);
  assert.match(spotlight, /if gt \(len \$books\) 0/);
  assert.match(spotlight, /partial "shop\/product-data\.html"/);
  assert.match(spotlight, /index \$product "display_title"/);
  assert.match(spotlight, /index \$product "author"/);
  assert.match(spotlight, /index \$product "product_type"/);
  assert.match(spotlight, /index \$product "price_display"/);
  assert.match(spotlight, /data-home-bookstore-card/);
  assert.match(spotlight, /data-analytics-source-slot="homepage_bookstore_promo"/);
  assert.doesNotMatch(spotlight, /https:\/\/www\.amazon\.com|purchase_url|checkout-actions|carousel|autoplay/);
});

test("homepage lead control ignores expiring essay feature front matter", () => {
  const essayDir = path.resolve("content/essays");
  const essays = fs
    .readdirSync(essayDir)
    .filter((name) => name.endsWith(".md") && name !== "_index.md")
    .map((name) => ({
      name,
      frontMatter: parseFrontMatter(path.join(essayDir, name))
    }));

  assert.equal(essays.length >= 1, true);
  assert.equal(essays.some(({ frontMatter }) => Object.hasOwn(frontMatter, "homepage_rank")), false);
});
