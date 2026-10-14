import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Start the local Hugo preview separately. Requests never leave that origin.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = new URL(process.env.OIP_BASE_URL || "http://127.0.0.1:1326/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname));
const output = path.join(root, "output", "playwright", "persistent-navigation");
let browser;
test.before(async () => {
  const modulePath = process.env.OIP_PLAYWRIGHT_MODULE;
  const { chromium } = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : "playwright");
  browser = await chromium.launch({ headless: true, executablePath: process.env.OIP_BROWSER_EXECUTABLE || undefined });
  fs.mkdirSync(output, { recursive: true });
});
test.after(async () => { await browser?.close(); });

async function createPage({ analytics = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ enableAnalytics }) => {
    window.__qaRoutes = [];
    window.__qaSettledRoutes = [];
    document.addEventListener("oip:route", (event) => window.__qaRoutes.push(event.detail.url));
    document.addEventListener("oip:after-route", (event) => window.__qaSettledRoutes.push(event.detail.url));
    // Keep references to actual native audio objects, without changing playback.
    window.__qaAudioElements = [];
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this instanceof HTMLAudioElement && !window.__qaAudioElements.includes(this)) window.__qaAudioElements.push(this);
      return nativePlay.apply(this, args);
    };
    if (enableAnalytics && window === window.top) {
      window.__qaCounts = [];
      window.goatcounter = { count: (payload) => window.__qaCounts.push(payload) };
      let configuration;
      Object.defineProperty(window, "oipAnalytics", {
        configurable: true,
        get: () => configuration,
        set: (value) => { configuration = { ...value, enabled: true, allowLocal: true }; },
      });
      document.addEventListener("oip:route", () => {
        const node = document.querySelector('script[data-oip-route-config="analytics"]');
        const config = JSON.parse(node.textContent);
        node.textContent = JSON.stringify({ ...config, enabled: true, allowLocal: true });
      }, { capture: true });
    }
  }, { enableAnalytics: analytics });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [], requests = [], recommendationRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "warning") console.error("Preview warning:", message.text()); });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/bob/recommend") {
      recommendationRequests.push(url.pathname);
      return route.abort("blockedbyclient");
    }
    if (url.origin !== origin.origin) return route.abort("blockedbyclient");
    requests.push({ url: url.pathname, type: route.request().resourceType() });
    return route.continue();
  });
  return { context, page, errors, requests, recommendationRequests };
}

async function start(page, pathname = "/") {
  await page.goto(new URL(pathname, origin).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oipNavigation === "ready");
  await page.waitForFunction(() => window.render_bob_to_text && JSON.parse(window.render_bob_to_text()).ready);
  return child(page);
}
async function child(page) {
  const frame = await (await page.locator("iframe[data-bob-frame]").elementHandle()).contentFrame();
  await frame.waitForFunction(() => window.__idleTimesPetDebug?.media.status === "ready");
  return frame;
}
async function routeTo(page, action, expectedPath) {
  const previous = await page.evaluate(() => window.__qaRoutes.length);
  await action();
  try {
    await page.waitForFunction(({ previous, expectedPath }) => window.__qaRoutes.length > previous && location.pathname === expectedPath,
      { previous, expectedPath });
  } catch (error) {
    console.error("Route evidence:", await page.evaluate(() => ({ href: location.href, routes: window.__qaRoutes,
      ready: document.documentElement.dataset.oipNavigation, title: document.title })));
    await capture(page, "route-failure.png");
    throw error;
  }
  await page.locator("[data-site-page] main").waitFor();
}
async function firstArticle(page) {
  const link = page.locator("[data-site-page] main a.reading-card__link[href^='/essays/']").first();
  const pathname = new URL(await link.getAttribute("href"), origin).pathname;
  await routeTo(page, () => link.click(), pathname);
  return pathname;
}
async function footerLink(page, name, pathname) {
  await routeTo(page, () => page.locator("[data-site-page] footer").getByRole("link", { name, exact: true }).click(), pathname);
}
async function settings(frame) {
  if (await frame.locator("[data-pet-settings-panel]").isVisible()) return;
  const button = frame.locator("[data-pet-settings-button]");
  await button.focus(); await button.press("Enter");
  await frame.locator("[data-pet-settings-panel]").waitFor({ state: "visible" });
}
async function saveIdentity(page, includeAudio = false) {
  await page.evaluate((includeAudio) => {
    const frame = document.querySelector("iframe[data-bob-frame]");
    const audio = frame.contentWindow.__qaAudioElements.find((element) => !element.paused);
    if (includeAudio && !audio) throw new Error("No actual playing audio element to preserve.");
    window.__qaIdentity = { frame, document: frame.contentDocument, audio, time: audio?.currentTime || 0,
      instanceId: frame.contentWindow.__idleTimesMusicDebug?.instanceId };
  }, includeAudio);
}
async function assertIdentity(page, includeAudio = false) {
  const evidence = await page.evaluate(() => {
    const saved = window.__qaIdentity, frame = document.querySelector("iframe[data-bob-frame]");
    if (!saved) return { sameFrame: false, sameDocument: false };
    return { sameFrame: frame === saved.frame, sameDocument: frame?.contentDocument === saved.document,
      sameAudio: Boolean(saved.audio && frame.contentWindow.__qaAudioElements.includes(saved.audio)),
      sameInstance: frame?.contentWindow.__idleTimesMusicDebug?.instanceId === saved.instanceId,
      paused: saved.audio?.paused, currentTime: saved.audio?.currentTime || 0, initialTime: saved.time };
  });
  assert.equal(evidence.sameFrame, true, "Navigation must retain the exact iframe element.");
  assert.equal(evidence.sameDocument, true, "Navigation must retain the exact native Bob document.");
  if (includeAudio) {
    assert.equal(evidence.sameAudio, true, "Navigation must preserve the actual audio object.");
    assert.equal(evidence.sameInstance, true, "Navigation must preserve the music player instance.");
    assert.equal(evidence.paused, false, "Music must continue during ordinary browsing and menus.");
    assert.ok(evidence.currentTime >= evidence.initialTime, "Playback must not restart.");
  }
  return evidence;
}
async function capture(page, filename) {
  await page.screenshot({ path: path.join(output, filename), animations: "disabled" });
}

test("one native Bob document and audio object survive Home, article, Library, filters, Back and menus", async () => {
  const { context, page, errors, requests, recommendationRequests } = await createPage();
  try {
    const frame = await start(page); await settings(frame);
    await frame.getByRole("button", { name: "Play music", exact: true }).click();
    await frame.waitForFunction(() => window.__qaAudioElements.some((audio) => !audio.paused && audio.currentTime > .08));
    await saveIdentity(page, true);
    assert.equal(await frame.locator("[data-pet-talk-button]").count(), 0, "The site adapter must remove the scripted Talk button.");
    await frame.locator("[data-pet-settings-button]").click();
    await frame.locator("[data-pet-settings-panel]").waitFor({ state: "hidden" });
    await frame.locator("[data-pet-reading-composer]").waitFor({ state: "visible" });
    const localLauncher = frame.getByRole("button", { name: "Explore collections", exact: false });
    if (await localLauncher.isVisible()) await localLauncher.click();
    else await page.locator(".bob-reading-launch").click();
    const chooser = page.locator(".bob-reading[data-state='collections']");
    await chooser.waitFor({ state: "visible" });
    assert.equal(await chooser.locator(".bob-reading__collection").count(), 3);
    await chooser.locator(".bob-reading__collection").first().click();
    const choices = page.locator(".bob-reading[data-state='collection'] a.bob-reading__title");
    await choices.first().waitFor({ state: "visible" });
    assert.equal(await choices.count(), 3);
    const readingChoices = await choices.allTextContents();
    await page.locator(".nav__desktop .nav-disclosure--read > summary").click();
    await page.waitForTimeout(200); await assertIdentity(page, true);
    await page.locator(".nav__desktop .nav-disclosure--read > summary").click();
    await choices.first().waitFor({ state: "visible" });
    assert.deepEqual(await choices.allTextContents(), readingChoices, "Menu concealment must preserve the current reading choices.");
    await page.getByRole("button", { name: "Dismiss reading suggestions", exact: true }).click();
    await frame.getByRole("button", { name: "Collapse music and settings", exact: true }).click();
    await firstArticle(page); await assertIdentity(page, true);
    await footerLink(page, "Library", "/library/"); await assertIdentity(page, true);
    await page.locator("#library-browse-all").click();
    await page.locator("#library-search").fill("water");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "water" && !document.querySelector("#library-flat-results").hidden);
    const queryRouteCount = await page.evaluate(() => window.__qaRoutes.length);
    await page.locator("#library-search").fill("music");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "music" && !document.querySelector("#library-flat-results").hidden);
    await page.goBack();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "water" && document.querySelector("#library-search")?.value === "water");
    assert.equal(await page.evaluate(() => window.__qaRoutes.length), queryRouteCount, "Library query history must not replace the page.");
    assert.equal(await page.evaluate(() => history.state.oipLibrary?.path), "/library/", "Library query states must retain their namespace alongside router metadata.");
    await page.goForward();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "music" && document.querySelector("#library-search")?.value === "music");
    await page.locator("[data-site-page] footer").getByRole("link", { name: "Library", exact: true }).click();
    await page.waitForFunction(() => !location.search && document.querySelector("#library-search")?.value === "" && !document.querySelector("#library-grouped-results").hidden);
    assert.equal(await page.evaluate(() => window.__qaRoutes.length), queryRouteCount, "A Library link must clear filters without replacing its document.");
    await page.goBack();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "music" && document.querySelector("#library-search")?.value === "music");
    await page.goBack();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "water" && document.querySelector("#library-search")?.value === "water");
    await assertIdentity(page, true);
    const result = page.locator("#library-results-list a.reading-card__link").first();
    const resultPath = new URL(await result.getAttribute("href"), origin).pathname;
    await routeTo(page, () => result.click(), resultPath); await assertIdentity(page, true);
    await routeTo(page, () => page.goBack(), "/library/");
    await page.waitForFunction(() => document.querySelector("#library-search")?.value === "water" && !document.querySelector("#library-flat-results").hidden);
    await assertIdentity(page, true); await capture(page, "library-history-music.png");
    await footerLink(page, "Home", "/");
    const final = await assertIdentity(page, true);
    assert.ok(final.currentTime > final.initialTime + .5, "Music time must advance through the entire route sequence.");
    assert.equal(requests.filter((request) => request.type === "document" && request.url === "/companion-bob/runtime/").length, 1,
      "The runtime document must load only once.");
    assert.deepEqual(recommendationRequests, [], "Collection discovery and navigation must not call the recommendation endpoint.");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("leaving Library cancels pending filtering and index work without changing the next page URL", async () => {
  const { context, page, errors } = await createPage();
  let release, started = false;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/library/index.json", async (route) => {
    started = true; await gate;
    try { await route.continue(); } catch { /* The expected route disposal may abort this fetch first. */ }
  });
  try {
    await start(page, "/library/"); await saveIdentity(page);
    await page.locator("#library-search").fill("water");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "water");
    assert.equal(started, true);
    await footerLink(page, "Home", "/"); release();
    await page.waitForTimeout(250);
    assert.equal(new URL(page.url()).pathname, "/"); assert.equal(new URL(page.url()).search, "");
    assert.equal(await page.locator("#library-search").count(), 0); await assertIdentity(page);
    await footerLink(page, "Library", "/library/");
    await page.locator("#library-search").fill("music");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "music" && !document.querySelector("#library-flat-results").hidden);
    assert.deepEqual(errors, []);
  } finally { release(); await context.close(); }
});

test("route analytics use current page metadata once and dispose the prior article reading timer", async () => {
  const { context, page, errors } = await createPage({ analytics: true });
  try {
    await start(page); await saveIdentity(page); await page.clock.install();
    const articlePath = await firstArticle(page);
    await page.waitForFunction((path) => window.oipAnalytics.page.path === path, articlePath);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.clock.fastForward(16000);
    const firstCounts = await page.evaluate(() => window.__qaCounts);
    assert.equal(firstCounts.filter((count) => !count.event && count.path === articlePath).length, 1, "A soft article visit must count exactly one pageview.");
    assert.equal(firstCounts.filter((count) => count.event && count.path.startsWith("oip:essay_read_start|")).length, 1);
    await footerLink(page, "Library", "/library/");
    await page.clock.fastForward(95000);
    const counts = await page.evaluate(() => window.__qaCounts);
    assert.deepEqual(counts.filter((count) => !count.event).map((count) => count.path), [articlePath, "/library/"], "Route pageviews must use destination paths without duplicates.");
    assert.equal(counts.filter((count) => count.event && count.path.startsWith("oip:essay_read|")).length, 0,
      "A departed article cannot continue accruing read time on Library.");
    assert.equal(await page.evaluate(() => window.oipAnalytics.page.path), "/library/");
    await assertIdentity(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the previous article bottom cannot complete reading the next article without a new scroll", async () => {
  const { context, page, errors } = await createPage({ analytics: true });
  try {
    await start(page); await page.clock.install();
    await firstArticle(page);
    await page.waitForFunction(() => window.__qaSettledRoutes.length === 1);
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await page.waitForFunction(() => scrollY > 1000);
    await page.evaluate(() => document.addEventListener("oip:route", () => {
      window.__qaDepthBeforeRouteScroll = (scrollY + innerHeight) / document.documentElement.scrollHeight;
    }, { once: true }));
    const nextPath = "/essays/one-more-block/";
    await routeTo(page, () => page.evaluate((path) => window.oipNavigation.navigate(path), nextPath), nextPath);
    await page.waitForFunction(() => window.__qaSettledRoutes.length === 2 && scrollY === 0);
    assert.ok(await page.evaluate(() => window.__qaDepthBeforeRouteScroll >= .75),
      "Regression setup must expose the prior scroll position before the destination scroll resets.");
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight / .75),
      "The destination must require scrolling to reach its 75% reading threshold.");
    await page.clock.fastForward(95000);
    const readEvents = () => page.evaluate((path) => window.__qaCounts.filter((count) => count.event && count.path.startsWith("oip:essay_read|") &&
      count.path.includes("path=" + encodeURIComponent(path))), nextPath);
    assert.equal((await readEvents()).length, 0, "Time spent at the new article top must not inherit the prior article's scroll depth.");
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await page.waitForFunction(() => (scrollY + innerHeight) / document.documentElement.scrollHeight >= .75);
    await page.clock.fastForward(1000);
    assert.equal((await readEvents()).length, 1, "Reading must complete after the reader actually scrolls through the new article: " + JSON.stringify(await page.evaluate(() => window.__qaCounts)));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("collection reading progress records newly mounted articles and retains prior visits after Back", async () => {
  const { context, page, errors } = await createPage();
  try {
    await start(page); await saveIdentity(page);
    await footerLink(page, "Collections", "/collections/");
    const collection = page.locator("[data-site-page] main").getByRole("link", { name: "Simple Logic", exact: true }).first();
    await routeTo(page, () => collection.click(), "/collections/simple-logic/");
    const lead = page.locator(".collection-section__lead a.reading-card__link").first();
    const articlePath = new URL(await lead.getAttribute("href"), origin).pathname;
    await routeTo(page, () => lead.click(), articlePath);
    const readingPath = page.locator("[data-reading-path-root]");
    const slug = await readingPath.getAttribute("data-collection-slug");
    await page.waitForFunction(({ slug, articlePath }) => JSON.parse(localStorage.getItem(`oip-reading-progress:v1:${slug}`) || "{}").visited?.includes(articlePath), { slug, articlePath });
    await routeTo(page, () => page.goBack(), "/collections/simple-logic/");
    const next = page.locator(`main a.reading-card__link:not([href='${articlePath}'])`).first();
    const nextPath = new URL(await next.getAttribute("href"), origin).pathname;
    await routeTo(page, () => next.click(), nextPath);
    const nextSlug = await page.locator("[data-reading-path-root]").getAttribute("data-collection-slug");
    await page.waitForFunction(({ slug, articlePath }) => JSON.parse(localStorage.getItem(`oip-reading-progress:v1:${slug}`) || "{}").visited?.includes(articlePath), { slug: nextSlug, articlePath: nextPath });
    const oldVisits = await page.evaluate((slug) => JSON.parse(localStorage.getItem(`oip-reading-progress:v1:${slug}`)).visited, slug);
    assert.equal(oldVisits.filter((path) => path === articlePath).length, 1, "Re-entry cannot duplicate or forget the earlier article visit.");
    await routeTo(page, () => page.goBack(), "/collections/simple-logic/");
    await assertIdentity(page); await capture(page, "collection-progress-back.png"); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
