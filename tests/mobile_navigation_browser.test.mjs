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
const readDestinations = [
  { label: "Archive", href: "/archive/" },
  { label: "Collections", href: "/collections/" },
  { label: "Library", href: "/library/" },
  { label: "Bob\u2019s Almanack", href: "/collections/bobs-almanack/" },
  { label: "Feeling curious?", href: "/random/" },
  { label: "Bookstore", href: "/shop/" },
];
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
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
    };
    return {
      nav: rect(nav),
      heading: rect(heading),
      readOpen: read.open,
      exploreOpen: explore.open,
      controls: {
        Read: rect(read.querySelector("summary")),
        Explore: rect(explore.querySelector("summary")),
        About: rect(nav.querySelector(".nav__mobile-link--about")),
      },
      panel: read.open ? rect(read.querySelector(".nav-mobile-disclosure__panel")) : null,
      links: read.open ? Array.from(read.querySelectorAll(".nav-mobile-disclosure__panel a"), (link) => {
        const label = link.querySelector(".nav-link__label");
        return {
          ...rect(link),
          text: label.textContent.trim(),
          href: new URL(link.href).pathname,
          visible: link.checkVisibility(),
          labelWidth: label.clientWidth,
          labelScrollWidth: label.scrollWidth,
        };
      }) : [],
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

function assertSameControls(actual, expected, state) {
  for (const name of ["Read", "Explore", "About"]) {
    for (const dimension of ["height", "width", "left", "top"]) {
      const value = actual.controls[name][dimension];
      const baseline = expected.controls[name][dimension];
      assert.ok(Math.abs(value - baseline) <= 1,
        `${state} moved ${name} control ${dimension}: ${value} vs ${baseline}`);
    }
  }
}

async function waitForOpenMenu(page, menu) {
  await page.waitForFunction((expected) => {
    const nav = document.querySelector(".nav__mobile");
    return nav.querySelector(".nav-mobile-disclosure--read").open === (expected === "read") &&
      nav.querySelector(".nav-mobile-disclosure--explore").open === (expected === "explore");
  }, menu);
}

async function assertBrandHome(page) {
  const brand = page.locator(".masthead .brand-link");
  assert.equal(await brand.isVisible(), true, "The masthead brand must remain visible.");
  assert.equal(new URL(await brand.getAttribute("href"), siteOrigin).pathname, "/",
    "The masthead brand must retain its home link.");
}

function assertReadDestinations(destinations) {
  assert.deepEqual(destinations, readDestinations, "Read must contain the six requested destinations in order.");
  assert.ok(destinations.every(({ label, href }) => label !== "Latest" && href !== "/"),
    "Read must not repeat the masthead home destination.");
}

for (const width of [320, 390]) {
  for (const fontPercent of [100, 125, 200]) {
    test(`mobile Read clears the article at ${width}px and ${fontPercent}% root text size`, async (t) => {
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
        assertSameControls(open, closed, "Read open");
        assert.ok(open.panel.bottom <= open.nav.bottom + 1,
          `Read panel extends beyond reserved navigation space: ${open.panel.bottom} > ${open.nav.bottom}`);
        assert.ok(open.panel.bottom <= open.heading.top,
          `Read panel overlaps article heading: ${open.panel.bottom} > ${open.heading.top}`);
        assertReadDestinations(open.links.map(({ text: label, href }) => ({ label, href })));
        await assertBrandHome(page);
        for (const link of open.links) {
          assert.equal(link.visible, true, `${link.text} must remain visible`);
          assert.ok(link.height >= 44, `${link.text} target is only ${link.height}px tall`);
          assert.ok(link.left >= -1 && link.right <= open.viewportWidth + 1, `${link.text} extends outside the viewport`);
          assert.ok(link.labelWidth > 0 && link.labelScrollWidth <= link.labelWidth + 1,
            `${link.text} label overflows its cell: ${link.labelScrollWidth} > ${link.labelWidth}`);
        }
        if (closed.documentWidth > closed.viewportWidth + 1) {
          t.diagnostic(`Existing page width at ${width}px/${fontPercent}%: closed=${closed.documentWidth}, Read-open=${open.documentWidth}, viewport=${open.viewportWidth}`);
        }
        assert.ok(open.documentWidth <= Math.max(closed.documentWidth, open.viewportWidth) + 1,
          `Read must not increase horizontal page overflow: closed=${closed.documentWidth}, open=${open.documentWidth}, viewport=${open.viewportWidth}`);
        assert.ok(open.navScrollWidth <= open.navWidth + 1, "Read must not overflow its navigation width.");

        // Opening Explore must close Read without retaining its expanded layout.
        await explore.locator("summary").click();
        await waitForOpenMenu(page, "explore");
        assertSamePlacement(await geometry(page), exploreBefore, "Explore menu");

        await read.locator("summary").click();
        await waitForOpenMenu(page, "read");
        await read.locator(".nav-mobile-disclosure__panel a").first().focus();
        await page.keyboard.press("Escape");
        await waitForOpenMenu(page, "closed");
        assert.equal(await read.locator("summary").evaluate((summary) => document.activeElement === summary), true,
          "Escape from a Read link must return focus to its summary.");
        const afterEscape = await geometry(page);
        assertSamePlacement(afterEscape, closed, "Closed menu");
        assertSameControls(afterEscape, closed, "Closed menu");
      } finally {
        await context.close();
      }
    });
  }
}

test("desktop Read keeps six destinations and the masthead home link", async () => {
  const { context, page } = await createPage(1440);
  try {
    const response = await page.goto(`${siteOrigin}${articlePath}`, { waitUntil: "load" });
    assert.equal(response.status(), 200);
    const read = page.locator(".nav__desktop .nav-disclosure--read");
    await read.locator("summary").click();
    const links = read.locator(".nav-disclosure__panel a");
    assertReadDestinations(await links.evaluateAll((anchors) => anchors.map((link) => ({
      label: link.querySelector(".nav-link__label").textContent.trim(),
      href: new URL(link.href).pathname,
    }))));
    for (const link of await links.all()) {
      assert.equal(await link.isVisible(), true, "Every desktop Read destination must be visible.");
    }
    const directBookstore = page.locator('.nav__desktop > .nav__direct-link').filter({ hasText: "Bookstore" });
    assert.equal(await directBookstore.count(), 1, "The existing direct desktop Bookstore link must remain.");
    assert.equal(new URL(await directBookstore.getAttribute("href"), siteOrigin).pathname, "/shop/");
    await assertBrandHome(page);
  } finally {
    await context.close();
  }
});
