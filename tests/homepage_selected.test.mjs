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
    `^\\s*-\\s+slug:\\s+${escapeRegex(currentSlug)}\\s*$([\\s\\S]*?)(?=^\\s*-\\s+slug:|$)`,
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

function selectHomepageEssays(pages, today = "2026-04-16") {
  const essays = pages
    .filter((page) => page.section === "essays" && page.draft !== true)
    .sort((left, right) => right.date - left.date);

  const featuredCandidates = essays
    .filter((page) => page.homepage_featured === true && normalizeDateString(page.homepage_featured_until) >= today)
    .sort((left, right) => right.date - left.date);

  const hero = featuredCandidates[0] ?? essays[0] ?? null;
  const latest = essays[0] ?? null;
  const showLatestSlot = Boolean(hero && latest && hero.relPermalink !== latest.relPermalink);
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
  for (const candidate of essays) {
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

test("homepage partial keeps one curated lead and fills the right rail with newest essays", () => {
  const source = fs.readFileSync(path.resolve("layouts/partials/home_selected.html"), "utf8");
  const frontPageSource = fs.readFileSync(path.resolve("layouts/partials/home_front_page.html"), "utf8");
  const indexSource = fs.readFileSync(path.resolve("layouts/index.html"), "utf8");
  const cartoonData = fs.readFileSync(path.resolve("data/editorial_cartoons.yaml"), "utf8");
  const currentCartoon = readCurrentCartoonRecord(cartoonData);
  const galleryContent = fs.readFileSync(path.resolve("content/gallery/_index.md"), "utf8");
  const galleryTemplate = fs.readFileSync(path.resolve("layouts/gallery/list.html"), "utf8");

  assert.match(source, /where site\.RegularPages "Section" "essays"/);
  assert.match(source, /Homepage selection is essays-only by design/);
  assert.match(source, /Params\.homepage_featured/);
  assert.match(source, /Params\.homepage_featured_until/);
  assert.match(source, /findRE "\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}"/);
  assert.match(source, /sort \(where site\.RegularPages "Section" "essays"\) "Date" "desc"/);
  assert.match(source, /\$hero = index \(sort \$featuredCandidates "Date" "desc"\) 0/);
  assert.match(source, /else if gt \(len \$essays\) 0/);
  assert.match(source, /range \$candidate := \$essays/);
  assert.match(source, /lt \(len \$secondary\) 4/);
  assert.match(source, /home_selected_keys/);
  assert.match(source, /"pages" \$selectedPages/);
  assert.match(source, /"keys" \$selectedKeys/);
  assert.match(source, /return \(dict/);
  assert.doesNotMatch(source, /Params\.featured/);
  assert.doesNotMatch(source, /Read Essay/);
  assert.doesNotMatch(source, /Download PDF/);
  assert.match(frontPageSource, /home_selected\.html/);
  assert.match(frontPageSource, /site\.Data\.editorial_cartoons/);
  assert.match(frontPageSource, /currentCartoonSlug/);
  assert.match(frontPageSource, /View gallery/);
  assert.match(frontPageSource, /"gallery\/" \| absURL/);
  assert.doesNotMatch(frontPageSource, /cartoon-think-outside-the-box\.png/);
  assert.match(frontPageSource, /data-home-front-page-region="lead"/);
  assert.match(frontPageSource, /data-home-front-page-region="secondary"/);
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
  assert.ok(indexSource.indexOf('partial "home_front_page.html"') < indexSource.indexOf('partial "home_imprint_statement.html"'));
  assert.ok(indexSource.indexOf('partial "home_imprint_statement.html"') < indexSource.indexOf('partial "home_selected_collections.html"'));
  assert.ok(indexSource.indexOf('partial "home_selected_collections.html"') < indexSource.indexOf('partial "newsletter_signup.html"'));
  assert.match(cartoonData, /slug: think-outside-the-box/);
  assert.match(cartoonData, new RegExp(`current: ${escapeRegex(currentCartoon.slug)}`));
  assert.match(cartoonData, new RegExp(`slug: ${escapeRegex(currentCartoon.slug)}`));
  assert.match(cartoonData, new RegExp(`image: "${escapeRegex(currentCartoon.image)}"`));
  assert.match(galleryContent, /title: "Gallery"/);
  assert.match(galleryTemplate, /cartoon-gallery-spotlight/);
  assert.match(galleryTemplate, /cartoon-gallery__grid/);
});

test("active featured essays lead while the right rail uses the newest published essays", () => {
  const pages = [
    { relPermalink: "/essays/latest/", section: "essays", draft: false, date: new Date("2026-03-01") },
    { relPermalink: "/essays/hero/", section: "essays", draft: false, date: new Date("2026-01-01"), homepage_featured: true, homepage_featured_until: "2026-04-30" },
    { relPermalink: "/essays/expired/", section: "essays", draft: false, date: new Date("2026-02-25"), homepage_featured: true, homepage_featured_until: "2026-04-01" },
    { relPermalink: "/essays/core-a/", section: "essays", draft: false, date: new Date("2026-02-20") },
    { relPermalink: "/essays/core-b/", section: "essays", draft: false, date: new Date("2026-02-10") },
    { relPermalink: "/essays/core-c/", section: "essays", draft: false, date: new Date("2026-02-05") },
    { relPermalink: "/essays/core-d/", section: "essays", draft: false, date: new Date("2026-02-01") },
    { relPermalink: "/syd-and-oliver/not-eligible/", section: "syd-and-oliver", draft: false, date: new Date("2026-04-01"), homepage_featured: true, homepage_featured_until: "2026-04-30" },
    { relPermalink: "/essays/draft/", section: "essays", draft: true, date: new Date("2026-04-02"), homepage_featured: true, homepage_featured_until: "2026-04-30" }
  ];

  const result = selectHomepageEssays(pages);

  assert.equal(result.hero?.relPermalink, "/essays/hero/");
  assert.equal(result.latest?.relPermalink, "/essays/latest/");
  assert.equal(result.showLatestSlot, true);
  assert.deepEqual(result.secondary.map((page) => page.relPermalink), ["/essays/expired/", "/essays/core-a/", "/essays/core-b/", "/essays/core-c/"]);
  assert.equal(result.secondary.length, 4);
  assert.equal(new Set(result.selected.map((page) => page.relPermalink)).size, result.selected.length);
  assert.deepEqual(result.keys, result.selected.map((page) => page.relPermalink));
});

test("duplicate active feature flags break ties by newest date first", () => {
  const pages = [
    { relPermalink: "/essays/older/", section: "essays", draft: false, date: new Date("2026-01-01"), homepage_featured: true, homepage_featured_until: "2026-04-30" },
    { relPermalink: "/essays/newer/", section: "essays", draft: false, date: new Date("2026-02-01"), homepage_featured: true, homepage_featured_until: "2026-04-30" },
    { relPermalink: "/essays/latest/", section: "essays", draft: false, date: new Date("2026-03-01") }
  ];

  const result = selectHomepageEssays(pages);

  assert.deepEqual(result.selected.map((page) => page.relPermalink), ["/essays/newer/", "/essays/latest/", "/essays/older/"]);
});

test("recent fallback remains stable when no active feature exists", () => {
  const pages = [
    { relPermalink: "/essays/a/", section: "essays", draft: false, date: new Date("2026-03-03"), homepage_featured: true, homepage_featured_until: "2026-03-31" },
    { relPermalink: "/essays/b/", section: "essays", draft: false, date: new Date("2026-03-02") },
    { relPermalink: "/essays/c/", section: "essays", draft: false, date: new Date("2026-03-01") },
    { relPermalink: "/essays/d/", section: "essays", draft: false, date: new Date("2026-02-28") }
  ];

  const result = selectHomepageEssays(pages);

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
  assert.doesNotMatch(frontPageSource, /Also on the front page/);
  assert.match(frontPageSource, /Read essay &rarr;/);
  assert.match(frontPageSource, /View gallery/);
  assert.doesNotMatch(frontPageSource, /cartoon-think-outside-the-box\.png/);
  assert.doesNotMatch(frontPageSource, /A curated front page from Outside In Print/);
  assert.ok(frontPageSource.indexOf('id="home-front-page-title"') < frontPageSource.indexOf('class="home-front-page__stories"'));
  assert.match(partialSource, /"lead" \$lead/);
  assert.match(partialSource, /"secondary" \$secondary/);
  assert.ok(source.indexOf('partial "home_front_page.html"') < source.indexOf('partial "home_imprint_statement.html"'));
  assert.ok(source.indexOf('partial "home_imprint_statement.html"') < source.indexOf('partial "home_selected_collections.html"'));
  assert.ok(source.indexOf('partial "home_selected_collections.html"') < source.indexOf('partial "newsletter_signup.html"'));
});

test("homepage lead control still lives in expiring essay feature front matter", () => {
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
