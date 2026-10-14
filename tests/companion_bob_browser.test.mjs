import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Uses an already-running local Hugo preview and installed Playwright. No
// external requests, provider writes, installs, or synthetic DOM pointer input.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseURL = new URL(process.env.OIP_BASE_URL || process.argv.find((arg) => /^https?:\/\//.test(arg)) || "http://127.0.0.1:1326/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(baseURL.hostname), "Bob browser QA must target a local preview.");
const outputDir = path.join(repoRoot, "output", "playwright", "companion-bob");
const visitorKey = "oip-bob-visitor:v1";
let browser;

test.before(async () => {
  const modulePath = process.env.OIP_PLAYWRIGHT_MODULE;
  const { chromium } = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : "playwright");
  fs.mkdirSync(outputDir, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.OIP_BROWSER_EXECUTABLE || undefined });
});
test.after(async () => { await browser?.close(); });

async function createPage(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 1000 },
    reducedMotion: options.reducedMotion || "no-preference",
    hasTouch: Boolean(options.touch), isMobile: Boolean(options.touch),
    ...(options.storageState ? { storageState: options.storageState } : {}),
  });
  if (options.initScript) await context.addInitScript(options.initScript);
  const errors = [], requests = [], recommendationRequests = [];
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/bob/recommend") {
      recommendationRequests.push(url.pathname);
      return route.abort("blockedbyclient");
    }
    if (url.origin !== baseURL.origin) return route.abort("blockedbyclient");
    requests.push(url.pathname);
    return route.continue();
  });
  return { context, page, requests, errors, recommendationRequests };
}

function savedVisitor(value) {
  return { cookies: [], origins: [{ origin: baseURL.origin, localStorage: [{ name: visitorKey, value: typeof value === "string" ? value : JSON.stringify(value) }] }] };
}
async function bobState(page) { return page.evaluate(() => JSON.parse(window.render_bob_to_text())); }
async function waitForMode(page, mode) {
  await page.waitForFunction((expected) => window.render_bob_to_text && JSON.parse(window.render_bob_to_text()).mode === expected, mode);
}
async function visit(page, pathname = "/", expectedStatus = 200) {
  const response = await page.goto(new URL(pathname, baseURL).href, { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), expectedStatus, `Preview route ${pathname} must load.`);
  await page.locator("[data-bob-companion]").waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const state = window.render_bob_to_text && JSON.parse(window.render_bob_to_text());
    return state && (state.ready || state.mode === "hidden");
  });
  await page.evaluate(() => document.fonts.ready);
}
async function runtime(page) {
  const frame = await (await page.locator("iframe[data-bob-frame]").elementHandle()).contentFrame();
  assert.ok(frame, "The actual Pet Bob runtime must have an iframe document.");
  await frame.locator("canvas").first().waitFor({ state: "attached" });
  await frame.waitForFunction(() => window.__idleTimesPetDebug?.media?.status === "ready");
  return frame;
}
async function waitForGreeting(page, text) {
  await page.waitForFunction((expected) => {
    const state = window.render_bob_to_text && JSON.parse(window.render_bob_to_text());
    return state?.greetingState === "visible" && state.greeting === expected;
  }, text);
  await page.locator("[data-bob-greeting]").waitFor({ state: "visible" });
}
async function waitForNoGreeting(page) {
  await page.waitForFunction(() => {
    const state = window.render_bob_to_text && JSON.parse(window.render_bob_to_text());
    return state?.ready && state.greetingState === "hidden";
  });
  await page.waitForTimeout(100);
  assert.equal((await bobState(page)).greetingState, "hidden");
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outputDir, `overlay-${name}.png`), fullPage: false, animations: "disabled" });
}
async function assertInViewport(locator, label) {
  const box = await locator.boundingBox(), viewport = locator.page().viewportSize();
  assert.ok(box && box.width > 0 && box.height > 0, `${label} must have visible dimensions.`);
  assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
    `${label} must fit the viewport: ${JSON.stringify({ box, viewport })}`);
}
async function assertNoPageOverflow(page) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  assert.ok(dimensions.page <= dimensions.viewport + 1, `Horizontal overflow: ${JSON.stringify(dimensions)}`);
}

// Inspect opaque pixels to select the real sprite, then use trusted pointer
// input. Canvas-relative fractions account for device scale and CSS sizing.
async function spritePixels(frame) {
  const canvas = frame.locator("canvas").first(), bounds = await canvas.boundingBox();
  assert.ok(bounds, "Bob's canvas must be laid out.");
  const pixels = await canvas.evaluate((element) => {
    const { width, height } = element;
    const data = element.getContext("2d").getImageData(0, 0, width, height).data;
    let left = width, right = -1, top = height, bottom = -1;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 220) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < 0) return null;
    const targetX = (left + right) / 2, targetY = top + (bottom - top) * .58;
    let distance = Infinity, picked;
    for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 220) continue;
      const next = (x - targetX) ** 2 + (y - targetY) ** 2;
      if (next < distance) { distance = next; picked = { x: x / width, y: y / height }; }
    }
    return { point: picked, left: left / width, right: (right + 1) / width, top: top / height, bottom: (bottom + 1) / height };
  });
  assert.ok(pixels, "The actual Bob canvas must contain opaque sprite pixels.");
  return {
    point: { x: bounds.x + pixels.point.x * bounds.width, y: bounds.y + pixels.point.y * bounds.height },
    left: bounds.x + pixels.left * bounds.width, right: bounds.x + pixels.right * bounds.width,
    top: bounds.y + pixels.top * bounds.height, bottom: bounds.y + pixels.bottom * bounds.height,
  };
}
async function assertSpriteInViewport(page, frame) {
  const sprite = await spritePixels(frame), viewport = page.viewportSize();
  assert.ok(sprite.left >= -1 && sprite.top >= -1 && sprite.right <= viewport.width + 1 && sprite.bottom <= viewport.height + 1,
    `Sprite must fit the viewport: ${JSON.stringify({ sprite, viewport })}`);
  return sprite;
}
async function assertMastheadHome(page, frame) {
  await waitForMode(page, "masthead");
  assert.equal(await page.locator("[data-bob-slot]").count(), 1, "Each page must reserve one Bob home.");
  const slot = await page.locator(".masthead [data-bob-slot]").boundingBox();
  const masthead = await page.locator(".masthead").boundingBox();
  assert.ok(slot && masthead, "Bob's starting spot must belong to the masthead.");
  const sprite = await assertSpriteInViewport(page, frame);
  assert.ok(sprite.left >= slot.x - 1 && sprite.right <= slot.x + slot.width + 1,
    "Real Bob must fit the reserved masthead slot.");
  assert.ok(sprite.top >= masthead.y - 1 && sprite.bottom <= masthead.y + masthead.height + 1,
    "Stowed Bob must remain within the masthead, above the reading content.");
}
async function assertReaderNoteFirst(page) {
  assert.equal(await page.locator(".home-idle-bob").count(), 0, "The homepage must omit the Meet Idle Bob promotion.");
  assert.equal(await page.locator(".home-v2").evaluate((home) => {
    const first = [...home.children].find((element) => !element.classList.contains("visually-hidden")
      && getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden");
    return first?.classList.contains("home-front-page__orientation");
  }), true, "The reader note must be the first visible homepage content.");
  const note = await page.locator(".home-front-page__orientation").boundingBox();
  const masthead = await page.locator(".masthead").boundingBox();
  assert.ok(note && masthead && note.y >= masthead.y + masthead.height - 1,
    "The reader note must sit below the masthead and navigation ribbon.");
}
async function dragBob(page, frame, target, touch = false) {
  const start = (await spritePixels(frame)).point;
  if (touch) {
    const session = await page.context().newCDPSession(page);
    const point = (x, y) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(start.x, start.y) });
    for (let step = 1; step <= 20; step += 1) {
      const part = step / 20;
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(start.x + (target.x - start.x) * part, start.y + (target.y - start.y) * part) });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 20 });
    await page.mouse.up();
  }
  await waitForMode(page, "free");
  await page.waitForTimeout(250);
  return bobState(page);
}
async function openSettings(page, frame) {
  if (await frame.locator("[data-pet-settings-panel]").isVisible()) return;
  const point = (await spritePixels(frame)).point;
  await page.mouse.move(point.x, point.y);
  await frame.locator("[data-pet-settings-button]").click();
  await frame.locator("[data-pet-settings-panel]").waitFor({ state: "visible" });
  assert.equal(await page.locator("dialog[open]").count(), 0, "Native Bob controls must not open a site modal.");
  assert.notEqual(await page.locator("body").evaluate((body) => getComputedStyle(body).overflow), "hidden", "Native controls must not lock site scrolling.");
}
async function collapseControls(frame) {
  // Reading now opens with JUKE-BOB. Stowed-position and transparent-space
  // checks must first close its actual opaque controls; open layout has its
  // own reading/browser coverage.
  if (await frame.locator("#pet-settings-dock").isVisible()) {
    await frame.getByRole("button", { name: "Collapse music and settings", exact: true }).click();
    await frame.locator("#pet-settings-dock").waitFor({ state: "hidden" });
    await frame.waitForTimeout(80);
  }
}
async function assertHiddenBob(page) {
  await waitForMode(page, "hidden");
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_bob_to_text());
    return !state.active && !state.audioActive && state.interactiveRegions === 0;
  });
  assert.equal(await page.locator("[data-bob-companion]").isVisible(), false, "Hide must remove Bob from view.");
  assert.equal(await page.locator("[data-bob-frame]").evaluate((frame) => frame.inert), true,
    "Hidden Bob must not capture keyboard or pointer input.");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("oip-bob-preferences:v1"))?.hidden), true,
    "Hide must remember the reader's existing preference.");
  const restore = page.getByRole("button", { name: "Show Bob", exact: true });
  await restore.waitFor({ state: "visible" });
  assert.equal(await restore.isEnabled(), true, "Show Bob must remain an accessible native button.");
  await assertInViewport(restore, "Show Bob");
  const box = await restore.boundingBox(), viewport = page.viewportSize();
  assert.ok(box.x > viewport.width / 2 && box.y > viewport.height / 2
    && viewport.width - box.x - box.width <= 32 && viewport.height - box.y - box.height <= 32,
  `Show Bob must remain discreetly in the bottom-right corner: ${JSON.stringify({ box, viewport })}`);
  assert.ok(box.height >= 44, "Show Bob must retain a usable touch target.");
  return restore;
}
async function exerciseHideRestore(page, frame, screenshotName) {
  if (!await frame.locator("[data-pet-settings-panel]").isVisible()) await openSettings(page, frame);
  await frame.getByRole("button", { name: "Play music", exact: true }).click();
  await frame.getByRole("button", { name: "Pause music", exact: true }).waitFor();
  const hide = frame.getByRole("button", { name: "Hide Bob", exact: true });
  await assertInViewport(hide, "Hide Bob");
  if (page.viewportSize().width <= 768) {
    const hideBox = await hide.boundingBox();
    assert.ok(hideBox.width >= 44 && hideBox.height >= 44, "Mobile Hide Bob must retain a 44px touch target.");
  }
  await hide.click();
  const restore = await assertHiddenBob(page);
  assert.equal(await restore.evaluate((button) => button === document.activeElement), true,
    "Hide must transfer keyboard focus to Show Bob.");
  // Pet debug is a last-paint snapshot; a hidden iframe may never repaint it.
  await frame.waitForFunction(() => window.__idleTimesMusicDebug?.isPlaying !== true);
  const pausedElapsed = await frame.evaluate(() => window.__idleTimesPetDebug.idle.elapsedMs);
  await page.waitForTimeout(250);
  assert.equal(await frame.evaluate(() => window.__idleTimesPetDebug.idle.elapsedMs), pausedElapsed,
    "Bob's animation progress must stop while hidden.");
  await screenshot(page, `${screenshotName}-hidden`);

  const nav = page.locator(page.viewportSize().width <= 768 ? ".nav__mobile" : ".nav__desktop");
  await nav.locator("[data-primary-nav-disclosure]").first().locator("summary").click();
  await nav.locator("a[href$='/archive/']").click();
  await page.waitForURL(new URL("/archive/", baseURL).href);
  await assertHiddenBob(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const restoredControl = await assertHiddenBob(page);
  await restoredControl.focus();
  await page.keyboard.press("Enter");
  frame = await runtime(page);
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_bob_to_text());
    return state.active && state.interactiveRegions > 0;
  });
  assert.equal(await restoredControl.isVisible(), false, "Show Bob must disappear once Bob returns.");
  assert.equal(await frame.locator("#pet-settings-dock").isVisible(), false,
    "Show Bob must restore the companion with his controls collapsed.");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("oip-bob-preferences:v1"))?.hidden), false);
  await frame.waitForFunction(() => document.activeElement === document.querySelector("canvas"));
  const restoredAnchor = (await bobState(page)).anchor;
  await page.keyboard.press("ArrowLeft"); await waitForMode(page, "free");
  // A restored free-position pet is already in free mode. Wait for the
  // cross-frame position message, not merely the unchanged mode flag.
  await page.waitForFunction((previous) => JSON.parse(window.render_bob_to_text()).anchor.x < previous.x, restoredAnchor);
  assert.ok((await bobState(page)).anchor.x < restoredAnchor.x, "Restored Bob must respond to keyboard movement.");
  await frame.locator("[data-pet-settings-button]").focus();
  await page.keyboard.press("Enter");
  await frame.locator("#pet-settings-dock").waitFor({ state: "visible" });
  await frame.getByRole("button", { name: "Hide Bob", exact: true }).waitFor({ state: "visible" });
  await screenshot(page, `${screenshotName}-restored`);
}
function assertNear(actual, expected, label, tolerance = 3) {
  assert.ok(Math.abs(actual.x - expected.x) <= tolerance && Math.abs(actual.y - expected.y) <= tolerance,
    `${label}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
}
async function assertReadingComposerFits(frame) {
  const composer = frame.locator("[data-pet-reading-composer]");
  await composer.waitFor({ state: "visible" });
  assert.equal(await frame.locator("[data-pet-talk-button]").count(), 0, "The site adapter must replace Talk with the reading composer.");
  assert.equal(await frame.locator("[data-pet-interview-paper]").count(), 0, "Reading discovery must not open the old scripted interview.");
  await assertInViewport(composer, "Bob reading composer");
  const input = composer.getByRole("textbox", { name: "What would you like to read about?", exact: true });
  if (await input.count()) {
    assert.equal(await input.getAttribute("placeholder"), "What would you like to read about?");
    await assertInViewport(input, "Bob reading input");
  } else {
    await composer.getByRole("button", { name: "Explore collections", exact: false }).waitFor({ state: "visible" });
  }
  return composer.boundingBox();
}
async function exerciseReadingDiscovery(page, frame) {
  await assertReadingComposerFits(frame);
  if (await frame.locator("[data-pet-settings-panel]").isVisible()) {
    await frame.locator("[data-pet-settings-button]").click();
    await frame.locator("[data-pet-settings-panel]").waitFor({ state: "hidden" });
  }
  const localLauncher = frame.getByRole("button", { name: "Explore collections", exact: false });
  if (await localLauncher.isVisible()) await localLauncher.click();
  else await page.locator(".bob-reading-launch").click();
  const chooser = page.locator(".bob-reading[data-state='collections']");
  await chooser.waitFor({ state: "visible" });
  const collections = chooser.locator(".bob-reading__collection");
  assert.equal(await collections.count(), 3, "Discovery must offer three real collection choices.");
  assert.equal(new Set(await collections.allTextContents()).size, 3, "Collection choices must be distinct.");
  await assertInViewport(chooser, "Bob collection choices");
  await collections.first().click();
  const picks = page.locator(".bob-reading[data-state='collection']");
  await picks.waitFor({ state: "visible" });
  assert.equal(await picks.locator("a.bob-reading__title").count(), 3, "A newly chosen eligible collection must offer three pieces.");
  await assertInViewport(picks, "Bob reading suggestions");
}

test("the real pet starts in the masthead above the reader note, greets once, and stays silent before interaction", async () => {
  const { context, page, requests, errors } = await createPage();
  try {
    await visit(page);
    const frame = await runtime(page);
    await waitForGreeting(page, "Hi!");
    await assertMastheadHome(page, frame);
    await assertReaderNoteFirst(page);
    assert.match(await page.locator("[data-bob-frame]").getAttribute("src"), /\/companion-bob\/runtime\//);
    assert.ok(requests.some((url) => url.startsWith("/companion-bob/runtime/")), "Full Pet Bob must load automatically.");
    assert.deepEqual(requests.filter((url) => /\.(?:mp3|ogg|m4a|aac)$/i.test(url)), [], "Arrival must not load music tracks.");
    // The original pet prepares its PCM foley bank eagerly. Downloading that
    // bank is distinct from opening an audio device or playing a sound.
    assert.deepEqual(await frame.evaluate(() => {
      const { contextState, voices, played } = window.__idleTimesPetDebug.sounds;
      return { contextState, voices, played };
    }), { contextState: "absent", voices: 0, played: 0 }, "The greeting must not create an audio device or play foley.");
    assert.notEqual(await frame.evaluate(() => window.__idleTimesMusicDebug?.isPlaying), true);
    await screenshot(page, "desktop-first-hi");
    await waitForNoGreeting(page);
    assert.deepEqual(await frame.evaluate(() => {
      const { contextState, voices, played } = window.__idleTimesPetDebug.sounds;
      return { contextState, voices, played };
    }), { contextState: "absent", voices: 0, played: 0 }, "Bob must stay silent throughout the unprompted greeting.");
    await visit(page);
    await waitForNoGreeting(page);
    await visit(page, "/archive/");
    await waitForNoGreeting(page);
    await runtime(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("returning readers get Welcome back without repeat greetings on internal pages", async () => {
  const old = Date.now() - 31 * 60 * 1000;
  const { context, page, errors } = await createPage({ storageState: savedVisitor({ version: 1, seen: true, lastActiveAt: old, lastGreetingAt: old }) });
  try {
    await visit(page); await waitForGreeting(page, "Welcome back!"); await screenshot(page, "desktop-welcome-back");
    await visit(page, "/essays/one-more-block/"); await waitForNoGreeting(page); await runtime(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("homepage Bob docks on scroll and transparent iframe space passes website clicks through", async () => {
  const { context, page, errors } = await createPage();
  try {
    await visit(page);
    const frame = await runtime(page), original = (await bobState(page)).anchor;
    await collapseControls(frame);
    const themeBefore = await page.locator("html").getAttribute("data-theme");
    await page.locator("[data-theme-toggle]").click();
    assert.notEqual(await page.locator("html").getAttribute("data-theme"), themeBefore, "Website controls beneath transparent overlay space must receive clicks.");
    await page.evaluate(() => scrollTo({ top: 1200, behavior: "instant" }));
    await waitForMode(page, "docked"); await assertSpriteInViewport(page, frame); await screenshot(page, "desktop-docked");
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await waitForMode(page, "masthead");
    assertNear((await bobState(page)).anchor, original, "Scrolling back must restore the masthead anchor");
    await assertMastheadHome(page, frame);
    await page.locator(".masthead .brand-link").click();
    await page.waitForURL(new URL("/", baseURL).href);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("trusted mouse drag persists through scrolling, reload, article navigation and resize", async () => {
  const { context, page, errors } = await createPage();
  try {
    await visit(page);
    let frame = await runtime(page);
    const original = (await bobState(page)).anchor, moved = await dragBob(page, frame, { x: 360, y: 540 });
    assert.ok(Math.hypot(moved.anchor.x - original.x, moved.anchor.y - original.y) > 200, "Dragging must move the actual pet across the website.");
    await assertSpriteInViewport(page, frame); await screenshot(page, "desktop-dragged");
    await page.evaluate(() => scrollTo({ top: 900, behavior: "instant" }));
    await waitForMode(page, "free"); assertNear((await bobState(page)).anchor, moved.anchor, "Scrolling must preserve a free position");
    await visit(page); await waitForMode(page, "free"); assertNear((await bobState(page)).anchor, moved.anchor, "Reload must preserve position");
    await visit(page, "/essays/one-more-block/"); await waitForMode(page, "free"); assertNear((await bobState(page)).anchor, moved.anchor, "Navigation must preserve position");
    frame = await runtime(page);
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(250);
    await waitForMode(page, "free"); await assertSpriteInViewport(page, frame); await assertNoPageOverflow(page);
    await screenshot(page, "resized-free-position"); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("native Help, reading discovery, Activity, Sound and music work without a modal", async (t) => {
  const { context, page, errors, recommendationRequests } = await createPage();
  try {
    await visit(page); const frame = await runtime(page);
    await frame.locator("[data-pet-settings-button]").focus();
    await page.keyboard.press("Enter");
    await frame.locator("[data-pet-settings-panel]").waitFor({ state: "visible" });
    assert.equal(await page.locator("dialog[open]").count(), 0, "Keyboard access to native controls must not open a site modal.");
    assert.notEqual(await page.locator("body").evaluate((body) => getComputedStyle(body).overflow), "hidden", "Native controls must not lock site scrolling.");
    await frame.locator("[data-pet-help-button]").click(); await frame.locator(".pet-help-panel").waitFor();
    await page.waitForTimeout(350);
    assert.equal(await frame.locator(".pet-help-panel").isVisible(), true,
      "Initial reading presentation must not close Help after the reader opens it.");
    await screenshot(page, "desktop-native-help");
    await frame.getByRole("button", { name: "Close how to play", exact: true }).click();
    await exerciseReadingDiscovery(page, frame); await screenshot(page, "desktop-reading-discovery");
    t.diagnostic(`Reading composer layout: ${JSON.stringify(await assertReadingComposerFits(frame))}`);
    await page.getByRole("button", { name: "Dismiss reading suggestions", exact: true }).click();
    await openSettings(page, frame);
    await frame.getByRole("button", { name: "Pet activity settings", exact: true }).click(); await frame.locator("[data-pet-activity-panel]").waitFor();
    await frame.getByRole("button", { name: "Close activity settings", exact: true }).click();
    await frame.getByRole("button", { name: "Pet sound settings", exact: true }).click(); await frame.getByRole("switch", { name: "Pet sounds", exact: true }).waitFor();
    await frame.getByRole("button", { name: "Close sound settings", exact: true }).click();
    await frame.getByRole("button", { name: "Play music", exact: true }).click(); await frame.getByRole("button", { name: "Pause music", exact: true }).waitFor();
    await frame.getByRole("button", { name: "Pause music", exact: true }).click(); await frame.getByRole("button", { name: "Play music", exact: true }).waitFor();
    await frame.getByRole("button", { name: "Collapse music and settings", exact: true }).click(); await frame.locator("#pet-settings-dock").waitFor({ state: "hidden" });
    assert.deepEqual(recommendationRequests, [], "Collection discovery must not call the recommendation endpoint.");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("native Home stows Bob, Hide persists, and Show Bob restores a usable companion", async () => {
  const { context, page, errors } = await createPage({ storageState: { cookies: [], origins: [{
    origin: baseURL.origin,
    localStorage: [{ name: "oip-bob-preferences:v1", value: JSON.stringify({ version: 1, hidden: true }) }],
  }] } });
  try {
    await visit(page); await waitForMode(page, "hidden");
    await page.locator("[data-bob-restore]").waitFor({ state: "visible" });
    await visit(page, "/archive/"); await waitForMode(page, "hidden"); await page.locator("[data-bob-restore]").click();
    let frame = await runtime(page); await page.waitForFunction(() => JSON.parse(window.render_bob_to_text()).mode !== "hidden");
    await frame.waitForFunction(() => document.activeElement === document.querySelector("canvas"));
    const restoredAnchor = (await bobState(page)).anchor;
    await page.keyboard.press("ArrowLeft"); await waitForMode(page, "free");
    const keyboardAnchor = (await bobState(page)).anchor;
    assert.ok(keyboardAnchor.x < restoredAnchor.x, "Restored focus must let the reader reposition Bob with ArrowLeft.");
    await visit(page, "/archive/"); await waitForMode(page, "free");
    assertNear((await bobState(page)).anchor, keyboardAnchor, "Keyboard position must persist after reload");
    await visit(page); await waitForMode(page, "free");
    frame = await runtime(page);
    await dragBob(page, frame, { x: 380, y: 520 }); await openSettings(page, frame);
    assert.equal(await frame.getByRole("button", { name: "Hide Bob", exact: true }).count(), 1, "Native controls must expose Hide Bob.");
    await frame.getByRole("button", { name: "Return Bob to his starting spot", exact: true }).click(); await waitForMode(page, "masthead");
    await frame.locator("#pet-settings-dock").waitFor({ state: "hidden" });
    await assertMastheadHome(page, frame); await assertReaderNoteFirst(page);
    await exerciseHideRestore(page, frame, "desktop"); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("malformed or denied storage cannot prevent the real pet from loading", async () => {
  for (const mode of ["malformed", "denied"]) {
    const options = mode === "malformed" ? { storageState: savedVisitor("{broken json") } : {
      initScript: () => { for (const method of ["getItem", "setItem", "removeItem"]) Object.defineProperty(Storage.prototype, method, {
        configurable: true, value() { throw new DOMException("Storage unavailable", "SecurityError"); },
      }); },
    };
    const { context, page, errors } = await createPage(options);
    try { await visit(page); await waitForGreeting(page, "Hi!"); await runtime(page); assert.deepEqual(errors, [], `${mode} storage must not cause an uncaught error.`); }
    finally { await context.close(); }
  }
});

test("reduced motion reaches native Bob while retaining the greeting", async () => {
  const { context, page, errors } = await createPage({ reducedMotion: "reduce" });
  try {
    await visit(page); const frame = await runtime(page); await waitForGreeting(page, "Hi!");
    await frame.waitForFunction(() => window.__idleTimesPetDebug?.reducedMotion === true);
    await screenshot(page, "desktop-reduced-motion"); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`trusted touch dragging and native controls fit a ${viewport.width}px mobile viewport`, async () => {
    const { context, page, errors, recommendationRequests } = await createPage({ viewport, touch: true });
    try {
      await visit(page); const frame = await runtime(page); await waitForGreeting(page, "Hi!");
      await collapseControls(frame);
      await assertMastheadHome(page, frame); await assertReaderNoteFirst(page); await assertNoPageOverflow(page);
      const settingsBox = await frame.locator("[data-pet-settings-button]").boundingBox();
      const themeBox = await page.locator(".masthead [data-theme-toggle]").boundingBox();
      assert.ok(settingsBox && themeBox, "Mobile Bob settings and theme controls must have visible bounds.");
      assert.ok(settingsBox.x + settingsBox.width <= themeBox.x || themeBox.x + themeBox.width <= settingsBox.x
        || settingsBox.y + settingsBox.height <= themeBox.y || themeBox.y + themeBox.height <= settingsBox.y,
      `Bob settings and theme controls must not overlap: ${JSON.stringify({ settingsBox, themeBox, viewport })}`);
      await assertInViewport(page.locator(".masthead .brand-link"), "Mobile wordmark"); await screenshot(page, `mobile-${viewport.width}-masthead`);
      const scrollBefore = await page.evaluate(() => scrollY);
      await dragBob(page, frame, { x: viewport.width * .42, y: viewport.height * .55 }, true);
      assert.equal(await page.evaluate(() => scrollY), scrollBefore, "Touch dragging Bob must not scroll the document.");
      await assertSpriteInViewport(page, frame); await screenshot(page, `mobile-${viewport.width}-dragged`);
      await openSettings(page, frame); await frame.locator("[data-pet-help-button]").click(); await frame.locator(".pet-help-panel").waitFor();
      await assertInViewport(frame.locator(".pet-help-panel"), "Mobile native Help");
      await assertInViewport(frame.locator("[data-pet-settings-panel]"), "Mobile native settings");
      await assertNoPageOverflow(page); await screenshot(page, `mobile-${viewport.width}-native-help`);
      await frame.getByRole("button", { name: "Close how to play", exact: true }).click();
      await exerciseReadingDiscovery(page, frame);
      await screenshot(page, `mobile-${viewport.width}-reading-discovery`);
      await page.getByRole("button", { name: "Dismiss reading suggestions", exact: true }).click();
      await exerciseHideRestore(page, frame, `mobile-${viewport.width}`);
      assert.deepEqual(recommendationRequests, [], "Mobile collection browsing must not call the recommendation endpoint.");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test("native activity and sound choices survive reload", async () => {
  const { context, page, errors } = await createPage();
  try {
    await visit(page); let frame = await runtime(page); await openSettings(page, frame);
    await frame.getByRole("button", { name: "Pet activity settings", exact: true }).click();
    const relaxed = frame.getByRole("radio", { name: "Relaxed", exact: true });
    await relaxed.click(); assert.equal(await relaxed.getAttribute("aria-checked"), "true");
    assert.equal(await frame.getByRole("radio", { name: "Excited", exact: true }).getAttribute("aria-checked"), "false");
    assert.equal(await frame.getByRole("radio", { name: "Calm", exact: true }).getAttribute("aria-checked"), "false");
    await frame.getByRole("button", { name: "Close activity settings", exact: true }).click();
    await frame.getByRole("button", { name: "Pet sound settings", exact: true }).click();
    const sounds = frame.getByRole("switch", { name: "Pet sounds", exact: true });
    const expectedSounds = await sounds.getAttribute("aria-checked") === "true" ? "false" : "true";
    await sounds.click(); assert.equal(await sounds.getAttribute("aria-checked"), expectedSounds);
    await visit(page); frame = await runtime(page); await openSettings(page, frame);
    await frame.getByRole("button", { name: "Pet activity settings", exact: true }).click();
    assert.equal(await frame.getByRole("radio", { name: "Relaxed", exact: true }).getAttribute("aria-checked"), "true");
    assert.equal(await frame.getByRole("radio", { name: "Excited", exact: true }).getAttribute("aria-checked"), "false");
    assert.equal(await frame.getByRole("radio", { name: "Calm", exact: true }).getAttribute("aria-checked"), "false");
    await frame.getByRole("button", { name: "Close activity settings", exact: true }).click();
    await frame.getByRole("button", { name: "Pet sound settings", exact: true }).click();
    assert.equal(await frame.getByRole("switch", { name: "Pet sounds", exact: true }).getAttribute("aria-checked"), expectedSounds);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("dark theme reaches native Bob, who follows article and custom 404 navigation", async () => {
  const { context, page, errors } = await createPage();
  try {
    await visit(page); let frame = await runtime(page);
    await collapseControls(frame);
    if (await page.locator("html").getAttribute("data-theme") !== "dark") await page.locator("[data-theme-toggle]").click();
    await frame.waitForFunction(() => document.documentElement.dataset.theme === "dark"); await screenshot(page, "desktop-dark");
    await visit(page, "/essays/one-more-block/"); await waitForNoGreeting(page); frame = await runtime(page);
    await assertSpriteInViewport(page, frame); await screenshot(page, "desktop-article");
    await visit(page, "/bob-browser-qa-missing-page/", 404); await waitForNoGreeting(page); await runtime(page);
    await screenshot(page, "desktop-custom-404"); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("navigation and Paper-Bob overlays suspend Bob and restore usable native hit regions", async () => {
  const { context, page, errors } = await createPage();
  async function assertSuspended() {
    await page.waitForFunction(() => {
      const state = JSON.parse(window.render_bob_to_text());
      return !state.active && state.interactiveRegions === 0;
    });
    assert.equal(await page.locator("[data-bob-frame]").evaluate((frame) => frame.inert), true,
      "A suspended invisible pet must not capture keyboard input.");
  }
  async function assertResumed() {
    await page.waitForFunction(() => {
      const state = JSON.parse(window.render_bob_to_text());
      return state.active && state.interactiveRegions > 0 && !document.querySelector("[data-bob-frame]").inert;
    });
    await waitForNoGreeting(page);
    return runtime(page);
  }
  try {
    await visit(page); await runtime(page); await waitForNoGreeting(page);
    const read = page.locator(".nav__desktop .nav-disclosure--read > summary");
    await read.click(); await assertSuspended(); await screenshot(page, "desktop-nav-suspended");
    await read.click(); let frame = await assertResumed();
    await dragBob(page, frame, { x: 400, y: 520 });
    await openSettings(page, frame);
    await frame.getByRole("button", { name: "Collapse music and settings", exact: true }).click();
    await frame.locator("#pet-settings-dock").waitFor({ state: "hidden" });
    await page.locator("[data-paper-route-launch]").click();
    await page.locator("[data-paper-route-overlay]").waitFor({ state: "visible" });
    await assertSuspended(); await screenshot(page, "desktop-paper-route-suspended");
    await page.locator(".paper-route-dialog__close[data-paper-route-close]").click();
    frame = await assertResumed();
    await dragBob(page, frame, { x: 640, y: 640 }); await openSettings(page, frame);
    await frame.locator("[data-pet-help-button]").click(); await frame.locator(".pet-help-panel").waitFor();
    await screenshot(page, "desktop-overlays-resumed"); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
