import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const siteDir = process.env.OIP_SITE_DIR;
const page = (route) => fs.readFileSync(path.join(siteDir, route, "index.html"), "utf8");

test("card artwork reads first, while zoom stays separate", { skip: !siteDir }, () => {
  const home = page("");
  const library = page("library");
  const gallery = page("gallery");
  assert.match(home, /class=home-v2-featured__lead-media href=\/essays\/the-dolphin-company\//);
  assert.match(home, /class=home-v2-featured__item-media href=\/(?:essays|syd-and-oliver)\/[^/]+\//);
  assert.match(home, /data-home-featured-image-trigger/);
  assert.match(library, /class=(?:"essay-cartoon-thumb[^"]*"|essay-cartoon-thumb) href=\/essays\//);
  assert.match(library, /class=essay-cartoon-zoom/);
  assert.match(gallery, /class=cartoon-gallery__read href=\/essays\//);
  assert.match(gallery, /data-gallery-load-more/);
  assert.match(gallery, /gallery-load-more\.min\./);
});

test("article, navigation, and sharing expose their new reader paths", { skip: !siteDir }, () => {
  const html = page("essays/the-dolphin-company");
  assert.match(html, /<template data-article-inline-signup>/);
  assert.match(html, /data-analytics-source-slot=article_inline_newsletter/);
  assert.match(html, /newsletter-signup--article-exit/);
  assert.match(html, /article-inline-signup\.min\./);
  assert.match(html, /aria-label="Archive, current section"/);
  assert.match(html, /data-share-trigger[\s\S]*?data-share-copy[\s\S]*?data-share-panel/);
  assert.match(html, /href=\/index\.xml[^>]*>RSS<\/a>/);
});

test("non-editorial destinations and Paper-Bob results return to reading", { skip: !siteDir }, () => {
  for (const route of ["apps", "games", "shop", "studio", "support", "gallery"]) {
    const html = page(route);
    assert.match(html, /class="reader-bridge/);
    assert.match(html, /href=\/essays\/the-clock-by-the-door\//);
    assert.match(html, /href=\/syd-and-oliver\/what-i-had\//);
    assert.match(html, /href=\/collections\/bobs-almanack\/#almanack-collection-newsletter/);
  }
  assert.doesNotMatch(page("shop/thanks"), /class="reader-bridge/);
  const home = page("");
  assert.match(home, /paper-route-summary__actions/);
  assert.match(home, /Read a featured story/);
  assert.match(home, /Get Saturday/);
});
