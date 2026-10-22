import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  const modulePath = process.env.OIP_PLAYWRIGHT_MODULE;
  const { chromium } = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : "playwright");
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

test("homepage masthead and reader controls stay visible without overflow", async () => {
  for (const width of [360, 390, 768, 1280]) {
    const { context, page } = await createPage(width);
    try {
      await page.goto(siteOrigin + "/", { waitUntil: "networkidle" });
      const state = await page.evaluate(() => {
        const title = document.querySelector(".masthead--full .title");
        const newsletter = document.querySelector(".home-reader-banner__newsletter-link");
        const box = title.getBoundingClientRect();
        return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, title: { left: box.left, right: box.right, height: box.height }, newsletter: newsletter?.getAttribute("href") };
      });
      assert.ok(state.documentWidth <= state.width + 1, "homepage must not overflow at " + width);
      assert.ok(state.title.height > 0 && state.title.left >= -1 && state.title.right <= state.width + 1, "wordmark must fit at " + width);
      assert.equal(state.newsletter, "#home-reader-banner-title");
    } finally { await context.close(); }
  }
});

test("Guest Feature fits below the lead beside supporting stories and stacks safely across breakpoints", async () => {
  const guestRoute = "/essays/a-public-record-must-outlast-the-feed/";
  for (const width of [360, 768, 769, 900, 901, 1280]) {
    const { context, page } = await createPage(width);
    try {
      await page.goto(siteOrigin + "/", { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const state = await page.evaluate(() => {
        const rect = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
        };
        const titles = [...document.querySelectorAll('[data-analytics-source-slot="homepage_v2_featured_lead"], [data-analytics-source-slot="homepage_v2_featured_supporting"], [data-analytics-source-slot="homepage_guest_feature"]')];
        return {
          width: innerWidth, documentWidth: document.documentElement.scrollWidth,
          primary: rect(".home-v2-featured__primary"), lead: rect(".home-v2-featured__lead"),
          guest: rect(".home-v2-guest"), supporting: rect(".home-v2-featured__supporting"),
          media: rect(".home-v2-guest__media"), title: rect('[data-analytics-source-slot="homepage_guest_feature"]'),
          routes: titles.map((link) => new URL(link.href).pathname),
          guestCards: document.querySelectorAll(".home-v2-guest").length,
          byline: document.querySelector(".home-v2-guest__byline")?.textContent.trim(),
        };
      });
      assert.ok(state.documentWidth <= state.width + 1, `no homepage overflow at ${width}px`);
      assert.equal(state.guestCards, 1);
      assert.equal(state.byline, "By Douglas B. Vandergraph");
      assert.equal(state.routes.length, 6);
      assert.equal(new Set(state.routes).size, 6, "the guest must be promoted once");
      assert.ok(state.routes.includes(guestRoute));
      for (const name of ["primary", "lead", "guest", "supporting", "media", "title"]) {
        assert.ok(state[name]?.height > 0 && state[name].width > 0, `${name} visible at ${width}px`);
        assert.ok(state[name].left >= -1 && state[name].right <= state.width + 1, `${name} fits at ${width}px`);
      }
      assert.ok(state.guest.top >= state.lead.bottom - 1, `guest follows lead at ${width}px`);
      assert.ok(state.guest.left >= state.primary.left - 1 && state.guest.right <= state.primary.right + 1);
      assert.ok(state.title.height >= 44, "the guest title retains a 44px target");
      if (width > 900) {
        assert.ok(state.guest.right <= state.supporting.left + 1, "guest stays in the left column");
        assert.ok(state.supporting.top < state.guest.top, "supporting stories remain beside the primary stack");
        assert.ok(state.primary.bottom - state.guest.bottom <= 24, "guest fills the remaining primary column with only its bottom inset");
      } else {
        assert.ok(state.supporting.top >= state.primary.bottom - 1, "supporting stories follow the complete primary stack");
      }
      const guestTitle = page.locator('[data-analytics-source-slot="homepage_guest_feature"]');
      await guestTitle.focus();
      const focus = await guestTitle.evaluate((link) => {
        const style = getComputedStyle(link, "::after");
        return { active: document.activeElement === link, style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      assert.ok(focus.active && focus.style !== "none" && focus.width >= 2, "the guest title has visible keyboard focus");
    } finally { await context.close(); }
  }
});

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
      scroll: { x: scrollX, y: scrollY },
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
  assert.deepEqual(actual.scroll, expected.scroll, `${state} must not scroll to evade Bob's controls.`);
  for (const name of ["Read", "Explore", "About"]) {
    for (const dimension of ["height", "width", "left", "top"]) {
      const value = actual.controls[name][dimension];
      const baseline = expected.controls[name][dimension];
      assert.ok(Math.abs(value - baseline) <= 1,
        `${state} moved ${name} control ${dimension}: ${value} vs ${baseline}`);
    }
  }
}

async function assertNavigationReceivesPointer(page) {
  // Collapsing also updates the iframe's pointer mask asynchronously.
  await page.waitForFunction(() => [...document.querySelectorAll('.nav__mobile summary, .nav__mobile-link--about')].every(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
  }), undefined, { timeout: 5000 });
  const controls = page.locator('.nav__mobile summary, .nav__mobile-link--about');
  for (const control of await controls.all()) {
    const state = await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { label: element.textContent.trim(), receivesPointer: Boolean(hit && element.contains(hit)) };
    });
    assert.ok(state.receivesPointer, `${state.label} must receive pointer input with Bob's controls collapsed.`);
  }
}

async function assertBobAboveNavigation(page) {
  const result = await page.waitForFunction(() => {
    const nav = document.querySelector('.nav__mobile').getBoundingClientRect();
    const frame = document.querySelector('[data-bob-frame]');
    const bounds = frame.getBoundingClientRect();
    const doc = frame.contentDocument;
    const overlapping = [];
    for (const control of doc.querySelectorAll('button')) {
      if (!control.checkVisibility()) continue;
      const box = control.getBoundingClientRect();
      const left = Math.max(0, nav.left, bounds.left + box.left);
      const right = Math.min(innerWidth, nav.right, bounds.left + box.right);
      const top = Math.max(0, nav.top, bounds.top + box.top);
      const bottom = Math.min(innerHeight, nav.bottom, bounds.top + box.bottom);
      if (right - left < 4 || bottom - top < 4) continue;
      const x = (left + right) / 2, y = (top + bottom) / 2;
      // Only test painted controls, not transparent space in the iframe.
      if (!control.contains(doc.elementFromPoint(x - bounds.left, y - bounds.top))) continue;
      const hit = document.elementFromPoint(x, y);
      overlapping.push({ label: control.getAttribute('aria-label') || control.textContent.trim(), above: hit === frame, hit: hit?.outerHTML.slice(0, 180), x, y });
    }
    // Runtime hit masks arrive asynchronously after controls finish laying out.
    return overlapping.length && overlapping.every(hit => hit.above) ? overlapping : false;
  }, undefined, { timeout: 5000 });
  const hits = await result.jsonValue();
  assert.ok(hits.length > 0, 'The open jukebox must exercise a real control/navigation overlap.');
  for (const hit of hits) assert.ok(hit.above, `${hit.label} must receive pointer input above the navigation banner: ${JSON.stringify(hit)}`);
}

async function collapseBob(page) {
  await page.frameLocator('[data-bob-frame]').getByRole('button', { name: 'Collapse music and settings', exact: true }).click();
  await page.waitForFunction(() => !JSON.parse(window.render_bob_reading_to_text()).composer?.visible);
}

async function openBobFromArrival(page) {
  await page.waitForFunction(() => {
    const bob = window.render_bob_to_text && JSON.parse(window.render_bob_to_text());
    return bob?.ready && bob.active && bob.interactiveRegions > 0;
  });
  if (await page.evaluate(() => matchMedia('(max-width: 768px), (pointer: coarse)').matches)) {
    const frame = page.frameLocator('[data-bob-frame]');
    const canvas = frame.locator('canvas').first(), bounds = await canvas.boundingBox();
    assert.ok(bounds, 'Bob must be painted before opening his controls.');
    const point = await canvas.evaluate(element => {
      const { width, height } = element, pixels = element.getContext('2d').getImageData(0, 0, width, height).data;
      let nearest = null, distance = Infinity;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] < 220) continue;
        const next = (x - width / 2) ** 2 + (y - height * .58) ** 2;
        if (next < distance) { distance = next; nearest = { x: x / width, y: y / height }; }
      }
      return nearest;
    });
    assert.ok(point, 'Bob must have an opaque sprite target.');
    const gear = frame.locator('[data-pet-settings-button]');
    assert.equal(await gear.isVisible(), false, 'Mobile arrival shows only the sprite.');
    const target = { x: bounds.x + point.x * bounds.width, y: bounds.y + point.y * bounds.height };
    await page.waitForFunction(({ x, y }) => document.elementFromPoint(x, y)?.matches('[data-bob-frame]'), target, { timeout: 5000 });
    await page.mouse.click(target.x, target.y);
    await gear.waitFor({ state: 'visible' });
    assert.equal(await frame.locator('#pet-settings-dock').isVisible(), false, 'The first activation reveals only the wheel.');
    await gear.click();
  }
  await waitForOpenBob(page);
}

async function waitForOpenBob(page) {
  await page.waitForFunction(() => {
    const bob = window.render_bob_to_text && JSON.parse(window.render_bob_to_text());
    const reading = window.render_bob_reading_to_text && JSON.parse(window.render_bob_reading_to_text());
    return bob?.active && bob.interactiveRegions > 0 && reading?.composer?.visible;
  });
}

async function assertMenuHidesBob(page) {
  await page.waitForFunction(() => {
    const host = document.querySelector('[data-bob-companion]');
    return host?.hidden && host.querySelector('[data-bob-frame]').inert;
  });
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
        // Production can show the first-visit consent panel above the masthead.
        // Resolve it through the real UI before exercising navigation beneath it.
        const consent = page.locator('[data-purchase-consent]');
        if (await consent.count()) {
          await consent.locator('[data-purchase-choice="denied"]').click();
          await consent.waitFor({ state: 'hidden' });
          await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
        }
        await page.evaluate(async (size) => {
          document.documentElement.style.fontSize = `${size}%`;
          await document.fonts.ready;
        }, fontPercent);
        // Bob's painted controls intentionally float above the navigation rail.
        // Collapse them through the real UI before testing all navigation targets.
        await openBobFromArrival(page);
        const read = page.locator(".nav__mobile .nav-mobile-disclosure--read");
        const explore = page.locator(".nav__mobile .nav-mobile-disclosure--explore");
        const closed = await geometry(page);
        assert.equal(closed.readOpen, false);
        assert.equal(closed.exploreOpen, false);
        await assertBobAboveNavigation(page);
        await collapseBob(page);
        assertSameControls(await geometry(page), closed, "Bob controls collapsed");
        await assertNavigationReceivesPointer(page);

        // Capture Explore before exercising Read, without changing its layout contract.
        await explore.locator("summary").click();
        await assertMenuHidesBob(page);
        const exploreBefore = await geometry(page);
        assert.equal(exploreBefore.exploreOpen, true);
        assertSameControls(exploreBefore, closed, "Explore open");
        await explore.locator("summary").click();

        await read.locator("summary").click();
        await assertMenuHidesBob(page);
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

        // Controls remain usable after navigation closes, including at enlarged text sizes.
        await openBobFromArrival(page);
        await collapseBob(page);
        assertSameControls(await geometry(page), closed, "Bob controls collapsed");
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
