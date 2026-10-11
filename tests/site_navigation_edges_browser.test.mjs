import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Run against an existing local Hugo preview. Provider requests are blocked.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseURL = new URL(process.env.OIP_BASE_URL || 'http://127.0.0.1:1326/');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(baseURL.hostname));
const outputDir = path.join(repoRoot, 'output', 'playwright', 'navigation-edges');
let browser;

test.before(async () => {
  const modulePath = process.env.OIP_PLAYWRIGHT_MODULE;
  const { chromium } = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : 'playwright');
  fs.mkdirSync(outputDir, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.OIP_BROWSER_EXECUTABLE || undefined });
});
test.after(async () => { await browser?.close(); });

async function setup(t) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, reducedMotion: 'reduce' });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL.origin
    ? route.continue() : route.abort('blockedbyclient'));
  await page.goto(baseURL.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.oipNavigation === 'ready' &&
    window.render_bob_to_text && JSON.parse(window.render_bob_to_text()).ready);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const frame = document.querySelector('[data-bob-frame]');
    window.__navigationEdge = { document, frame, frameDocument: frame.contentDocument, routes: 0 };
    document.addEventListener('oip:route', () => { window.__navigationEdge.routes += 1; });
  });
  return { context, page, errors };
}

async function navigate(page, target) {
  const previous = await page.evaluate(() => window.__navigationEdge.routes);
  await page.evaluate(url => window.oipNavigate(url), target);
  await page.waitForFunction(count => window.__navigationEdge?.routes > count &&
    !document.documentElement.hasAttribute('data-route-loading'), previous);
}

async function assertPersistentBob(page) {
  const state = await page.evaluate(() => {
    const saved = window.__navigationEdge;
    const frame = document.querySelector('[data-bob-frame]');
    return {
      document: saved?.document === document,
      iframe: saved?.frame === frame,
      runtimeDocument: saved?.frameDocument === frame?.contentDocument,
      frames: document.querySelectorAll('[data-bob-frame]').length,
    };
  });
  assert.deepEqual(state, { document: true, iframe: true, runtimeDocument: true, frames: 1 });
}

test('keyboard Skip to content moves focus into main without reloading Bob', { timeout: 45000 }, async t => {
  const { page, errors } = await setup(t);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.skip-link').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.id === 'main-content');
  assert.equal(new URL(page.url()).hash, '#main-content');
  await assertPersistentBob(page);
  assert.deepEqual(errors, []);
});

test('cross-page hash receives focus and Back restores the prior scroll position', { timeout: 45000 }, async t => {
  const { page, errors } = await setup(t);
  await page.evaluate(() => window.scrollTo({ top: 650, behavior: 'instant' }));
  await page.waitForFunction(() => Math.abs(scrollY - 650) < 2);
  const priorScroll = await page.evaluate(() => scrollY);
  await navigate(page, '/about/#about-reading-map-title');
  await page.waitForFunction(() => document.activeElement?.id === 'about-reading-map-title');
  assert.equal(new URL(page.url()).hash, '#about-reading-map-title');
  await assertPersistentBob(page);
  const routes = await page.evaluate(() => window.__navigationEdge.routes);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(count => location.pathname === '/' && window.__navigationEdge?.routes > count, routes);
  await page.waitForFunction(expected => Math.abs(scrollY - expected) < 3, priorScroll);
  await assertPersistentBob(page);
  await page.screenshot({ path: path.join(outputDir, 'back-scroll.png'), animations: 'disabled' });
  assert.deepEqual(errors, []);
});

test('Gallery deep links preserve modal focus after route completion', { timeout: 45000 }, async t => {
  const { page, errors } = await setup(t);
  await navigate(page, '/gallery/?cartoon=precious-and-honored');
  const viewer = page.locator('[data-cartoon-lightbox]');
  await viewer.waitFor({ state: 'visible' });
  assert.equal(await viewer.locator('.cartoon-lightbox__close').evaluate(node => node === document.activeElement), true);
  assert.match(await viewer.locator('[data-cartoon-lightbox-title]').textContent(), /Precious and Honored/);
  await assertPersistentBob(page);
  await page.screenshot({ path: path.join(outputDir, 'gallery-deep-link.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await viewer.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
});

test('section aliases and Random retain the document and Bob runtime', { timeout: 60000 }, async t => {
  const { page, errors } = await setup(t);
  await navigate(page, '/essays/');
  assert.equal(new URL(page.url()).pathname, '/archive/');
  await assertPersistentBob(page);
  await navigate(page, '/random/');
  assert.match(new URL(page.url()).pathname, /^\/(essays|syd-and-oliver|working-papers)\/.+/);
  assert.equal(await page.locator('#main-content h1').count() > 0, true);
  await assertPersistentBob(page);
  assert.deepEqual(errors, []);
});

test('a delayed failed fetch falls back to the correct URL without an extra history entry', { timeout: 45000 }, async t => {
  const { context, page, errors } = await setup(t);
  const historyLength = await page.evaluate(() => history.length);
  let failedFetches = 0;
  let documentLoads = 0;
  await context.route(new URL('/about/', baseURL).href, async route => {
    if (route.request().isNavigationRequest()) {
      documentLoads += 1;
      return route.continue();
    }
    failedFetches += 1;
    await new Promise(resolve => setTimeout(resolve, 700));
    return route.abort('failed');
  });
  await page.evaluate(() => window.oipNavigate('/about/'));
  await page.waitForFunction(() => location.pathname === '/about/' && !window.__navigationEdge &&
    document.documentElement.dataset.oipNavigation === 'ready');
  assert.equal(failedFetches, 1);
  assert.equal(documentLoads, 1);
  assert.equal(new URL(page.url()).pathname, '/about/');
  assert.equal(await page.evaluate(() => history.length), historyLength + 1);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => location.pathname === '/');
  assert.deepEqual(errors, []);
});

test('rapid link clicks commit the final destination and ignore a late earlier response', { timeout: 45000 }, async t => {
  const { context, page, errors } = await setup(t);
  let started;
  const requestStarted = new Promise(resolve => { started = resolve; });
  let settled;
  const responseSettled = new Promise(resolve => { settled = resolve; });
  await context.route(new URL('/library/', baseURL).href, async route => {
    started();
    await new Promise(resolve => setTimeout(resolve, 900));
    try { await route.continue(); } finally { settled(); }
  });
  const nav = page.locator('[data-primary-nav] .nav__desktop');
  await nav.locator('.nav-disclosure--read > summary').click();
  await nav.locator('a[href$="/library/"]').click();
  await requestStarted;
  await nav.locator('a[href$="/about/"]').click();
  await page.waitForFunction(() => location.pathname === '/about/' &&
    window.__navigationEdge?.routes === 1 && !document.documentElement.hasAttribute('data-route-loading'));
  await responseSettled;
  await page.waitForTimeout(200);
  assert.equal(new URL(page.url()).pathname, '/about/');
  assert.equal(await page.evaluate(() => window.__navigationEdge.routes), 1);
  await assertPersistentBob(page);
  assert.deepEqual(errors, []);
});
