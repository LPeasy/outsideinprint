import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.resolve(process.env.OIP_SITE_DIR || path.join(repoRoot, "public"));
const siteOrigin = "https://outsideinprint.org";
const articlePath = "/essays/one-more-block/";
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

let browser;

test.before(async () => {
  assert.ok(fs.existsSync(path.join(siteDir, articlePath, "index.html")), `Missing Hugo article output: ${siteDir}`);
  browser = await chromium.launch({ headless: true, executablePath: process.env.OIP_BROWSER_EXECUTABLE || undefined });
});

test.after(async () => {
  await browser?.close();
});

async function createPage(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  // Serve the production Hugo output without contacting analytics or providers.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== siteOrigin) {
      await route.abort("blockedbyclient");
      return;
    }
    let relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (!relativePath || relativePath.endsWith("/")) relativePath += "index.html";
    const filePath = path.resolve(siteDir, relativePath);
    assert.ok(filePath.startsWith(siteDir + path.sep), `Refusing path outside Hugo output: ${url.pathname}`);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
      path: filePath,
    });
  });
  return { context, page };
}

async function geometry(page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".nav__mobile");
    const heading = document.querySelector(".piece-title-block h1");
    const read = nav.querySelector(".nav-mobile-disclosure--read");
    const explore = nav.querySelector(".nav-mobile-disclosure--explore");
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height };
    };
    return {
      nav: rect(nav),
      heading: rect(heading),
      readOpen: read.open,
      exploreOpen: explore.open,
      panel: read.open ? rect(read.querySelector(".nav-mobile-disclosure__panel")) : null,
      links: read.open ? Array.from(read.querySelectorAll(".nav-mobile-disclosure__panel a"), (link) => ({
        ...rect(link),
        text: link.textContent.trim(),
        visible: link.checkVisibility(),
      })) : [],
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      navWidth: nav.clientWidth,
      navScrollWidth: nav.scrollWidth,
    };
  });
}

function assertSamePlacement(actual, expected, state) {
  for (const [name, value, baseline] of [
    ["navigation height", actual.nav.height, expected.nav.height],
    ["article heading", actual.heading.top, expected.heading.top],
  ]) {
    assert.ok(Math.abs(value - baseline) <= 1, `${state} ${name} moved: ${value} vs ${baseline}`);
  }
}

for (const width of [320, 390]) {
  for (const fontPercent of [100, 125, 200]) {
    test(`mobile Read clears the article at ${width}px and ${fontPercent}% root text size`, async () => {
      const { context, page } = await createPage(width);
      try {
        const response = await page.goto(`${siteOrigin}${articlePath}`, { waitUntil: "load" });
        assert.equal(response.status(), 200);
        await page.evaluate(async (size) => {
          document.documentElement.style.fontSize = `${size}%`;
          await document.fonts.ready;
        }, fontPercent);
        const read = page.locator(".nav__mobile .nav-mobile-disclosure--read");
        const explore = page.locator(".nav__mobile .nav-mobile-disclosure--explore");
        const closed = await geometry(page);
        assert.equal(closed.readOpen, false);
        assert.equal(closed.exploreOpen, false);

        // Capture Explore before exercising Read, without changing its layout contract.
        await explore.locator("summary").click();
        const exploreBefore = await geometry(page);
        assert.equal(exploreBefore.exploreOpen, true);
        await explore.locator("summary").click();

        await read.locator("summary").click();
        const open = await geometry(page);
        assert.equal(open.readOpen, true);
        assert.equal(open.exploreOpen, false);
        assert.ok(open.panel.bottom <= open.nav.bottom + 1,
          `Read panel extends beyond reserved navigation space: ${open.panel.bottom} > ${open.nav.bottom}`);
        assert.ok(open.panel.bottom <= open.heading.top,
          `Read panel overlaps article heading: ${open.panel.bottom} > ${open.heading.top}`);
        assert.equal(open.links.length, 7, "Read must retain all seven destinations, including Bookstore.");
        for (const link of open.links) {
          assert.equal(link.visible, true, `${link.text} must remain visible`);
          assert.ok(link.height >= 44, `${link.text} target is only ${link.height}px tall`);
          assert.ok(link.left >= -1 && link.right <= open.viewportWidth + 1, `${link.text} extends outside the viewport`);
        }
        assert.ok(open.documentWidth <= open.viewportWidth + 1, "Read must not introduce horizontal page overflow.");
        assert.ok(open.navScrollWidth <= open.navWidth + 1, "Read must not overflow its navigation width.");

        await read.locator("summary").click();
        assertSamePlacement(await geometry(page), closed, "Closed menu");
        await explore.locator("summary").click();
        assertSamePlacement(await geometry(page), exploreBefore, "Explore menu");
      } finally {
        await context.close();
      }
    });
  }
}
