import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const siteDir = path.resolve(process.env.OIP_SITE_DIR || "public");
const read = (route) => fs.readFileSync(path.join(siteDir, route, "index.html"), "utf8");
const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
};
const links = (html) => [...html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)];
const articleAftermatter = (html) => {
  const fragment = html.match(/<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpiece-aftermatter\b[^"]*"|'[^']*\bpiece-aftermatter\b[^']*'|[^\s>]*\bpiece-aftermatter\b[^\s>]*)[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  assert.ok(fragment, "article aftermatter must exist before scoped assertions run");
  return fragment.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
};

test("rendered Library offers catalog browsing and retains a no-script fallback", () => {
  const html = read("library");
  assert.match(html, /Browse all \d+ pieces/);
  assert.match(html, /newest within each type/i);
  assert.match(html, /library-pagination/);
  assert.match(html, /<noscript>.*?Archive/s);
});

test("standard article endings have one next piece, one collection link, and one newsletter", () => {
  for (const route of ["essays/default-owner", "essays/the-dolphin-company", "syd-and-oliver/what-i-had", "essays/the-risk-management-buffet", "essays/the-world-is-back-at-the-poker-table"]) {
    const html = read(route);
    const card = html.match(/<aside\b[^>]*class=(?:"reading-path"|reading-path)[\s\S]*?<\/aside>/)?.[0];
    assert.ok(card, route);
    assert.match(card, /Read next/);
    assert.equal(links(card).length, 2, route);
    assert.match(card, /\d+ min read/);
    assert.match(card, /reading-path__summary/);
    for (const link of links(card)) {
      const target = new URL(attr(link[1], "href"), "https://outsideinprint.org").pathname;
      assert.notEqual(target, `/${route}/`);
      assert.ok(fs.existsSync(path.join(siteDir, target, "index.html")), target);
    }
    assert.doesNotMatch(card, /Reading progress|Newest-first position|Curated position|Up Next|Previous piece|Recommended starting point/);
    assert.doesNotMatch(html, /newsletter-prompt--article-exit|journey-links--article-exit/);
    assert.doesNotMatch(articleAftermatter(html), /Reading progress on this device|Curated position|Newest-first position|Up Next|Previous piece|Recommended starting point/);
    assert.doesNotMatch(html, /\bid=(?:"read-next-title"|'read-next-title'|read-next-title)(?=[\s>])/i);
    assert.equal((html.match(/data-analytics-source-slot=(?:"article_exit_newsletter"|article_exit_newsletter)(?=[\s>])/g) || []).length, 1);
    assert.ok(html.indexOf("article-publication-record") < html.indexOf(card));
    assert.ok(html.indexOf(card) < html.indexOf("newsletter-signup--article-exit"));
  }
});

test("retained progress-script strings do not count as visible article progress", () => {
  const html = read("essays/the-risk-management-buffet");
  assert.match(html, /Reading progress on this device/);
  assert.doesNotMatch(articleAftermatter(html), /Reading progress on this device/);
  const injectedVisibleCounter = html.replace(/(<div\b[^>]*class=(?:"piece-aftermatter"|piece-aftermatter)[^>]*>)/, "$1<p>Reading progress on this device: 1 of 3 pieces.</p>");
  assert.match(articleAftermatter(injectedVisibleCounter), /Reading progress on this device/);
});

test("hidden-only collection membership preserves the no-public-collection exit", () => {
  const html = read("essays/the-ledger-vol-3");
  const aftermatter = articleAftermatter(html);
  assert.match(aftermatter, /article-publication-record[\s\S]*newsletter-signup--article-exit[\s\S]*journey-links--article-exit[\s\S]*Article paths/);
  assert.doesNotMatch(aftermatter, /data-reading-path-root|newsletter-prompt--article-exit/);
  assert.doesNotMatch(html, /data-piece-collection-slug=/);
});

test("Gallery exposes titled reading links outside the lightbox, including a differently named illustration", () => {
  const html = read("gallery");
  const captionLinks = links(html).filter((link) => attr(link[1], "class") === "cartoon-gallery__reading-link");
  assert.ok(captionLinks.length > 10);
  assert.ok(captionLinks.some((link) => attr(link[1], "href") === "/syd-and-oliver/what-i-had/" && link[2].includes("What I Had")));
  assert.ok(captionLinks.some((link) => attr(link[1], "href") === "/essays/we-dont-miss/" && /We Don/.test(link[2])));
  for (const link of captionLinks) {
    assert.ok(fs.existsSync(path.join(siteDir, attr(link[1], "href"), "index.html")));
    assert.ok(html.indexOf(link[0]) < html.indexOf('data-cartoon-lightbox aria-hidden'));
  }
});

test("author selected writing uses Dialogue and does not duplicate it in Recent Writing", () => {
  const html = read("authors/robert-v-ussley");
  const selected = links(html).filter((link) => attr(link[1], "data-analytics-source-slot") === "author_selected");
  const recent = links(html).filter((link) => attr(link[1], "data-analytics-source-slot") === "author_recent");
  assert.equal(selected.length, 6);
  assert.equal(recent.length, 6);
  assert.equal(attr(selected[3][1], "href"), "/syd-and-oliver/what-i-had/");
  assert.equal(new Set([...selected, ...recent].map((link) => attr(link[1], "href"))).size, 12);
  assert.match(html, /these pieces are a few places to begin/);
  assert.match(html.slice(html.indexOf('author-selected-title'), html.indexOf('id=author-newsletter')), /Dialogue/);
});

test("bookstore sales use e-book while checkout formats and explanatory help remain EPUB", () => {
  for (const route of ["shop", "shop/2045", "shop/the-american-nightmare-keep-dreaming-kid", "shop/the-parable-of-the-sheep", "shop/the-water-cycle", "shop/2045/sample"]) {
    const html = read(route);
    assert.doesNotMatch(html, /DRM-free EPUB|Buy(?: direct)? EPUB|Outside In Print EPUB/);
    assert.match(html, /[Ee]-book/);
    assert.match(html, /How to read it/);
    assert.match(html, /The download is an EPUB file/);
    if (route !== "shop/2045/sample") {
      assert.match(html, /https:\/\/downloads.outsideinprint.org\/api\/books\/epub/);
      assert.match(html, /OIP-[A-Z]{2}-EPUB/);
    }
  }
});
