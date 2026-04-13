import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function normalizeRank(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return Number(value);
  return null;
}

function selectHomepageEssays(pages) {
  const publishedEssays = pages
    .filter((page) => page.section === "essays" && page.draft !== true)
    .map((page) => ({ ...page, normalizedRank: normalizeRank(page.homepage_rank) }))
    .sort((left, right) => right.date - left.date);

  const ranked = publishedEssays
    .filter((page) => page.normalizedRank !== null)
    .sort((left, right) => left.normalizedRank - right.normalizedRank || right.date - left.date);

  const lead = ranked[0] ?? publishedEssays[0] ?? null;
  const selected = lead ? [lead] : [];
  const seen = new Set(lead ? [lead.relPermalink] : []);

  for (const page of publishedEssays) {
    if (selected.length >= 4 || seen.has(page.relPermalink)) continue;
    seen.add(page.relPermalink);
    selected.push(page);
  }

  return {
    lead,
    secondary: selected.slice(1, 5),
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

  assert.match(source, /where site\.RegularPages "Section" "essays"/);
  assert.match(source, /one curated lead, then the newest published essays in the right rail/);
  assert.match(source, /Params\.homepage_rank/);
  assert.match(source, /findRE "\^\[1-9\]\[0-9\]\*\$"/);
  assert.match(source, /sort \(uniq \$ranks\)/);
  assert.match(source, /sort \$rankGroup "Date" "desc"/);
  assert.match(source, /sort \(where site\.RegularPages "Section" "essays"\) "Date" "desc"/);
  assert.match(source, /\$lead = index \$rankedOrdered 0/);
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
  assert.match(indexSource, /Feeling curious\?/);
  assert.match(indexSource, /"label" "Welcome"/);
  assert.ok(indexSource.indexOf('partial "home_front_page.html"') < indexSource.indexOf('partial "home_selected_collections.html"'));
  assert.ok(indexSource.indexOf('partial "home_selected_collections.html"') < indexSource.indexOf('partial "newsletter_signup.html"'));
});

test("lead stays curated while the right rail uses the newest published essays", () => {
  const pages = [
    { relPermalink: "/essays/latest/", section: "essays", draft: false, date: new Date("2026-03-01"), homepage_rank: null },
    { relPermalink: "/essays/hero/", section: "essays", draft: false, date: new Date("2026-01-01"), homepage_rank: 1 },
    { relPermalink: "/essays/core-a/", section: "essays", draft: false, date: new Date("2026-01-02"), homepage_rank: "2" },
    { relPermalink: "/essays/core-b/", section: "essays", draft: false, date: new Date("2026-01-03"), homepage_rank: 5 },
    { relPermalink: "/essays/archive-ranked/", section: "essays", draft: false, date: new Date("2026-01-04"), homepage_rank: 8 },
    { relPermalink: "/essays/unranked-2/", section: "essays", draft: false, date: new Date("2026-02-20"), homepage_rank: null },
    { relPermalink: "/essays/unranked-3/", section: "essays", draft: false, date: new Date("2026-02-10"), homepage_rank: "bad" },
    { relPermalink: "/essays/unranked-4/", section: "essays", draft: false, date: new Date("2026-02-05"), homepage_rank: 0 },
    { relPermalink: "/essays/unranked-5/", section: "essays", draft: false, date: new Date("2026-02-01"), homepage_rank: null },
    { relPermalink: "/syd-and-oliver/not-eligible/", section: "syd-and-oliver", draft: false, date: new Date("2026-04-01"), homepage_rank: 1, featured: true },
    { relPermalink: "/essays/draft/", section: "essays", draft: true, date: new Date("2026-04-02"), homepage_rank: 3 },
    { relPermalink: "/essays/latest/", section: "essays", draft: false, date: new Date("2026-02-28"), homepage_rank: null }
  ];

  const result = selectHomepageEssays(pages);

  assert.equal(result.lead?.relPermalink, "/essays/hero/");
  assert.deepEqual(result.secondary.map((page) => page.relPermalink), ["/essays/latest/", "/essays/unranked-2/", "/essays/unranked-3/", "/essays/unranked-4/"]);
  assert.equal(result.secondary.length, 4);
  assert.equal(new Set(result.selected.map((page) => page.relPermalink)).size, result.selected.length);
  assert.deepEqual(result.keys, result.selected.map((page) => page.relPermalink));
});

test("duplicate ranks break ties by newest date first", () => {
  const pages = [
    { relPermalink: "/essays/older/", section: "essays", draft: false, date: new Date("2026-01-01"), homepage_rank: 2 },
    { relPermalink: "/essays/newer/", section: "essays", draft: false, date: new Date("2026-02-01"), homepage_rank: 2 },
    { relPermalink: "/essays/hero/", section: "essays", draft: false, date: new Date("2026-03-01"), homepage_rank: 1 }
  ];

  const result = selectHomepageEssays(pages);

  assert.deepEqual(result.selected.map((page) => page.relPermalink), ["/essays/hero/", "/essays/newer/", "/essays/older/"]);
});

test("recent fallback remains stable when no valid ranks exist", () => {
  const pages = [
    { relPermalink: "/essays/a/", section: "essays", draft: false, date: new Date("2026-03-03"), homepage_rank: "hero" },
    { relPermalink: "/essays/b/", section: "essays", draft: false, date: new Date("2026-03-02"), homepage_rank: null },
    { relPermalink: "/essays/c/", section: "essays", draft: false, date: new Date("2026-03-01"), homepage_rank: -1 },
    { relPermalink: "/essays/d/", section: "essays", draft: false, date: new Date("2026-02-28"), homepage_rank: "03x" }
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
  assert.doesNotMatch(frontPageSource, /Also on the front page/);
  assert.match(frontPageSource, /Read essay &rarr;/);
  assert.doesNotMatch(frontPageSource, /A curated front page from Outside In Print/);
  assert.ok(frontPageSource.indexOf('id="home-front-page-title"') < frontPageSource.indexOf('class="home-front-page__stories"'));
  assert.match(partialSource, /"lead" \$lead/);
  assert.match(partialSource, /"secondary" \$secondary/);
  assert.ok(source.indexOf('partial "home_front_page.html"') < source.indexOf('partial "home_selected_collections.html"'));
  assert.ok(source.indexOf('partial "home_selected_collections.html"') < source.indexOf('partial "newsletter_signup.html"'));
});

test("homepage lead control still lives in essay front matter ranks", () => {
  const essayDir = path.resolve("content/essays");
  const rankedEssays = fs
    .readdirSync(essayDir)
    .filter((name) => name.endsWith(".md") && name !== "_index.md")
    .map((name) => ({
      name,
      frontMatter: parseFrontMatter(path.join(essayDir, name))
    }))
    .filter(({ frontMatter }) => normalizeRank(frontMatter.homepage_rank) !== null)
    .sort((left, right) => left.frontMatter.homepage_rank - right.frontMatter.homepage_rank);

  assert.equal(rankedEssays.length >= 1, true);
  assert.equal(rankedEssays[0].frontMatter.homepage_rank, 1);
  assert.equal(
    rankedEssays.some(({ frontMatter }) => frontMatter.slug === "why-a-return-to-the-gold-standard-would-break-the-economy"),
    true
  );
});
