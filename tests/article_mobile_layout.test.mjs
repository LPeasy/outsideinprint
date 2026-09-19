import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(file, "utf8");
const base = read("layouts/_default/baseof.html");
const single = read("layouts/_default/single.html");
const css = read("assets/css/main.css");
const mobileSizes = "(max-width: 768px) min(306px, calc(100vw - 50px)), (min-width: 72rem) 30rem, (min-width: 48rem) 42vw, 100vw";
const illustratedRoutes = [
  "essays/why-a-return-to-the-gold-standard-would-break-the-economy",
  "essays/jack-stratton-and-the-vulfpeck-model",
  "essays/pope-leo-xiv-from-chicago-altar-boy-to-the-chair-of-saint-peter",
  "essays/whos-drinking-all-the-modelo",
  "syd-and-oliver/what-i-had",
];

// Enough CSS structure to distinguish mobile rules from desktop rules; quoted
// strings are skipped so embedded SVG data cannot create false block boundaries.
function cssRules(source, ancestors = []) {
  source = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let start = 0;
  while (start < source.length) {
    const open = source.indexOf("{", start);
    if (open < 0) break;
    const selector = source.slice(start, open).trim();
    let depth = 1;
    let quote = "";
    let close = open + 1;
    for (; close < source.length && depth; close++) {
      const char = source[close];
      if (quote) {
        if (char === "\\") close++;
        else if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === "{") depth++;
      else if (char === "}") depth--;
    }
    assert.equal(depth, 0, `unbalanced CSS block: ${selector}`);
    const declarations = source.slice(open + 1, close - 1);
    if (selector.startsWith("@")) rules.push(...cssRules(declarations, [...ancestors, selector]));
    else rules.push({ selector, declarations, ancestors });
    start = close;
  }
  return rules;
}

const mobileRules = cssRules(css).filter((rule) => rule.selector.includes(".article-reading-page"));
function declarationsFor(selector) {
  const matches = mobileRules.filter((rule) => rule.selector.split(",").some((part) => part.trim() === selector));
  assert.ok(matches.length, `expected mobile rule for ${selector}`);
  return matches.map((rule) => rule.declarations).join("\n");
}

function attr(tag, name) {
  return tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`))?.slice(1).find((value) => value !== undefined) ?? "";
}

function hasBodyClass(html, className) {
  return attr(html.match(/<body\b[^>]*>/)?.[0] || "", "class").split(/\s+/).includes(className);
}

function articleHeader(html) {
  return html.match(/<article\b[^>]*>[\s\S]*?<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
}

test("compact article class is restricted to single reading pages", () => {
  assert.match(base, /if\s+(?:and\s+)?\.IsPage/);
  assert.match(base, /in\s+\(slice\s+"essays"\s+"syd-and-oliver"\s+"reports"\s+"working-papers"\)\s+\.Section/);
  assert.equal((base.match(/append "article-reading-page"/g) || []).length, 1);
  assert.ok(base.indexOf(".IsPage") < base.indexOf('append "article-reading-page"'));
});

test("every compact-opening rule is article-only and limited to 768px", () => {
  assert.ok(mobileRules.length >= 8, "expected masthead, header, and illustration refinements");
  for (const rule of mobileRules) {
    assert.ok(rule.ancestors.some((ancestor) => /^@media\s*\(max-width:\s*768px\)$/.test(ancestor)), rule.selector);
    for (const selector of rule.selector.split(",")) {
      assert.match(selector.trim(), /^\.article-reading-page\s+/, selector);
      assert.doesNotMatch(selector, /\.piece-body|\.piece-aftermatter|\.home-v2|\.masthead--full/);
    }
    assert.doesNotMatch(rule.declarations, /--font-body\s*:|--measure(?:-\w+)?\s*:/);
  }
  assert.match(declarationsFor(".article-reading-page .piece-fleuron"), /display:\s*none\s*;/);
  assert.match(declarationsFor(".article-reading-page .piece-title-block h1"), /font-size:\s*clamp\(1\.875rem,\s*4\.2vw,\s*2rem\)\s*;/);
  assert.match(declarationsFor(".article-reading-page .piece-header-composition"), /grid-template-columns:\s*(?:1fr|minmax\(0,\s*1fr\))\s*;/);
});

test("opening artwork stays visible, contained, and proportional instead of cropped", () => {
  const image = declarationsFor(".article-reading-page .piece-media-plate img");
  assert.match(image, /max-height:\s*148px\s*;/);
  assert.match(image, /object-fit:\s*contain\s*;/);
  assert.match(image, /height:\s*auto\s*;/);
  assert.match(image, /width:\s*auto\s*;/);
  assert.match(image, /max-width:\s*(?:100%|min\(100%,\s*20rem\))\s*;/);
  assert.ok(mobileRules.some((rule) => /piece-media-plate/.test(rule.selector) && /max-width:\s*min\(100%,\s*20rem\)\s*;/.test(rule.declarations)));
  for (const rule of mobileRules.filter((item) => /piece-media-plate/.test(item.selector))) {
    assert.doesNotMatch(rule.declarations, /object-fit:\s*cover|overflow:\s*hidden|display:\s*none/);
  }
  assert.ok(single.includes(mobileSizes), "image sizes must describe the compact mobile slot and retain desktop sizes");
});

test("the existing native image button, credits, and unchanged article-body rendering are retained", () => {
  const figure = single.match(/<figure class="\{\{ delimit \$plateClasses " " \}\}">([\s\S]*?)<\/figure>/)?.[1];
  assert.ok(figure);
  assert.equal((figure.match(/<button\b/g) || []).length, 1);
  assert.match(figure, /type="button"/);
  assert.match(figure, /data-article-plate-lightbox-trigger/);
  assert.match(figure, /aria-label="Open image fullscreen: \{\{ \.Title \}\}"/);
  assert.match(figure, /data-caption="\{\{ \$plateImageCaption \}\}"/);
  assert.match(figure, /with \$plateImageCaption\s*}}<figcaption>\{\{ \. \}\}<\/figcaption>/);
  assert.match(single, /partial "article\/plate-lightbox.html" \./);
  assert.match(single, /\$articleBody := partial "render_article_body.html" \./);
  assert.match(single, /<div class="piece-body">\s*{{ \$articleBody }}\s*<\/div>/);
  assert.doesNotMatch(single, /\$articleBody\s*\|\s*(?:truncate|replace|plainify)/);
});

test("rendered reading pages receive the compact class, but homepage, About, shop, and section landings do not", { skip: !process.env.OIP_SITE_DIR }, () => {
  const root = path.resolve(process.env.OIP_SITE_DIR);
  for (const route of [...illustratedRoutes, "working-papers/rcp85-bibliometrics-methods-and-tables"]) {
    assert.ok(hasBodyClass(read(path.join(root, route, "index.html")), "article-reading-page"), route);
  }
  for (const route of ["", "about", "authors/robert-v-ussley", "shop", "shop/2045", "shop/2045/sample", "essays", "syd-and-oliver", "working-papers"]) {
    assert.ok(!hasBodyClass(read(path.join(root, route, "index.html")), "article-reading-page"), route || "homepage");
  }
});

test("rendered article headers keep one eager image, responsive sizes when managed, one fullscreen button, and any image credit", { skip: !process.env.OIP_SITE_DIR }, () => {
  const root = path.resolve(process.env.OIP_SITE_DIR);
  const credits = new Map([
    [illustratedRoutes[0], "Photo by Jingming Pan on Unsplash"],
    [illustratedRoutes[1], "Jack Stratton on stage | Source: Michelle Shiers"],
    [illustratedRoutes[2], "Pope Leo Waving to the Vatican | Source: Wikimedia Commons"],
  ]);
  for (const route of illustratedRoutes) {
    const header = articleHeader(read(path.join(root, route, "index.html")));
    assert.ok(header, route);
    const triggers = [...header.matchAll(/<button\b[^>]*\bdata-article-plate-lightbox-trigger\b[^>]*>/g)];
    assert.equal(triggers.length, 1, route);
    assert.equal(attr(triggers[0][0], "type"), "button", route);
    assert.match(attr(triggers[0][0], "aria-label"), /^Open image fullscreen: /);
    assert.ok(attr(triggers[0][0], "data-image"), `${route} fullscreen image`);
    const images = [...header.matchAll(/<img\b[^>]*>/g)];
    assert.equal(images.length, 1, route);
    assert.equal(attr(images[0][0], "loading"), "eager", route);
    assert.equal(attr(images[0][0], "fetchpriority"), "high", route);
    assert.ok(attr(images[0][0], "alt"), `${route} image description`);
    assert.ok(attr(images[0][0], "data-lightbox-src"), `${route} full-size source`);
    const managed = !!attr(images[0][0], "data-oip-image-id");
    if (managed) {
      assert.ok(attr(images[0][0], "srcset"), `${route} responsive sources`);
      assert.equal(attr(images[0][0], "sizes"), mobileSizes, route);
    } else {
      assert.ok(attr(images[0][0], "src"), `${route} existing unmanaged fallback`);
    }
    assert.ok(Number(attr(images[0][0], "width")) > 0 && Number(attr(images[0][0], "height")) > 0, `${route} intrinsic ratio`);
    for (const source of header.matchAll(/<source\b[^>]*>/g)) assert.equal(attr(source[0], "sizes"), mobileSizes, route);
    if ([illustratedRoutes[2], illustratedRoutes[4]].includes(route)) assert.ok(managed, `${route} managed image path`);
    if (credits.has(route)) {
      assert.equal(attr(triggers[0][0], "data-caption"), credits.get(route), route);
      assert.ok(header.includes(`<figcaption>${credits.get(route)}</figcaption>`), `${route} visible credit`);
    }
  }
});

test("layout-only verification preserves article bodies and publication records against an optional baseline build", {
  skip: !process.env.OIP_SITE_DIR || !process.env.OIP_ARTICLE_BASELINE_SITE_DIR,
}, () => {
  const root = path.resolve(process.env.OIP_SITE_DIR);
  const baseline = path.resolve(process.env.OIP_ARTICLE_BASELINE_SITE_DIR);
  function pages(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? pages(file) : entry.name === "index.html" ? [file] : [];
    });
  }
  let checked = 0;
  for (const section of ["essays", "syd-and-oliver", "reports", "working-papers"]) {
    for (const file of pages(path.join(root, section))) {
      const html = read(file);
      if (!hasBodyClass(html, "article-reading-page")) continue;
      const old = read(path.join(baseline, path.relative(root, file)));
      const bodyPattern = /<div class=(?:"piece-body"|piece-body)>([\s\S]*?)<div class=(?:"piece-aftermatter"|piece-aftermatter)>/;
      const recordPattern = /<aside\b[^>]*class=(?:"article-publication-record"|article-publication-record)[^>]*>([\s\S]*?)<\/aside>/;
      assert.ok(html.match(bodyPattern), `${file} article body`);
      assert.equal(html.match(bodyPattern)?.[1], old.match(bodyPattern)?.[1], `${file} body copy and markup`);
      assert.equal(html.match(recordPattern)?.[1], old.match(recordPattern)?.[1], `${file} publication record`);
      checked++;
    }
  }
  assert.ok(checked >= illustratedRoutes.length, "baseline comparison must cover published reading pages");
});
