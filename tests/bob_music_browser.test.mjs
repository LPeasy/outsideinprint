import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// One existing local render; native audio, no paid service calls or installs.
const origin = new URL(process.env.OIP_BASE_URL || 'http://127.0.0.1:8783/');
assert.ok(['127.0.0.1', 'localhost'].includes(origin.hostname));
const output = path.resolve('output/playwright/bob-music');
let browser;
test.before(async () => {
  const { chromium } = await import(process.env.OIP_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.OIP_PLAYWRIGHT_MODULE).href : 'playwright');
  browser = await chromium.launch({ headless: true, executablePath: process.env.OIP_BROWSER_EXECUTABLE || undefined });
  fs.mkdirSync(output, { recursive: true });
});
test.after(async () => browser?.close());
async function setup(width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    window.__musicAudio = [];
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this instanceof HTMLAudioElement && !window.__musicAudio.includes(this)) window.__musicAudio.push(this);
      return original.apply(this, args);
    };
  });
  const requests = [], errors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin || url.pathname.includes('/api/bob/')) return route.abort();
    requests.push(url.pathname); return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/music/', origin).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.oipMusic?.getState().ready && document.documentElement.dataset.oipNavigation === 'ready');
  const frame = await (await page.locator('[data-bob-frame]').elementHandle()).contentFrame();
  await frame.waitForFunction(() => window.__idleTimesPetDebug?.media.status === 'ready');
  return { context, page, frame, requests, errors };
}
async function openCabinet(frame) {
  if (await frame.locator('.pet-jukebox').isVisible()) return;
  await frame.locator('canvas').first().focus(); await frame.locator('canvas').first().press('Enter');
  await frame.locator('[data-pet-settings-button]').click();
  await frame.locator('.pet-jukebox').waitFor({ state: 'visible' });
}
async function waitPlaying(page, id) {
  await page.waitForFunction(id => { const s = window.oipMusic.getState(); return s.isPlaying && (!id || s.currentTrack.id === id); }, id);
}
async function compact(page, visible) {
  await page.locator('.bob-music-compact').waitFor({ state: visible ? 'visible' : 'hidden' });
}
async function screenshot(page, name) {
  await page.waitForFunction(() => !JSON.parse(window.render_bob_to_text()).routing);
  await page.screenshot({ path: path.join(output, name + '.png') });
}
async function composerReady(page) {
  await page.waitForFunction(() => {
    const f=document.querySelector('[data-bob-frame]');
    const child=f.contentDocument.querySelector('[data-pet-reading-composer]').getBoundingClientRect();
    const reported=JSON.parse(window.render_bob_reading_to_text()).composer?.rect;
    const input=f.contentDocument.querySelector('#site-reading-query').getBoundingClientRect();
    return reported&&Math.abs(reported.y-child.y)<1&&Math.abs(reported.x-child.x)<1&&document.elementFromPoint(input.left+input.width/2,input.top+input.height/2)===f;
  });
}

test('single player: album browsing, native playback, compact dismissal, Hide and soft navigation', async () => {
  const { context, page, frame, requests, errors } = await setup();
  try {
    assert.equal(await page.locator('[data-music-panel]:not([hidden])').getAttribute('data-music-panel'), 'sans-serif');
    assert.equal(await page.evaluate(() => window.oipMusic.getState().currentTrack.id), 'sans-serif-chairman');
    await compact(page, false);
    assert.equal(requests.filter(url => url.endsWith('.mp3')).length, 0, 'catalog browsing must not fetch audio');
    await page.locator('[data-music-album="the-fine-print-vol-1"]').click();
    assert.equal(await page.evaluate(() => window.oipMusic.getState().currentTrack.id), 'sans-serif-chairman');
    assert.equal(requests.filter(url => url.endsWith('.mp3')).length, 0);
    await page.locator('[data-music-album="sans-serif"]').click();
    await page.locator('[data-music-play-album="sans-serif"]').click();
    await waitPlaying(page, 'sans-serif-chairman'); await compact(page, true);
    const musicAudioCount = () => frame.evaluate(() => window.__musicAudio.filter(audio => audio.src.includes('/music/tracks/')).length);
    assert.equal(await musicAudioCount(), 1);
    await page.locator('.bob-music-compact').getByRole('button', { name: 'Pause music', exact: true }).click();
    await page.waitForFunction(() => !window.oipMusic.getState().isPlaying); await compact(page, true);
    await openCabinet(frame); await compact(page, false);
    await frame.getByRole('button', { name: 'Collapse music and settings', exact: true }).click(); await compact(page, false);
    await page.waitForFunction(() => { const s=JSON.parse(window.render_bob_music_to_text());return !s.cabinetOpen&&s.dismissed; });
    await page.locator('[data-music-toggle]').click(); await waitPlaying(page); await compact(page, true);
    await openCabinet(frame);
    await frame.getByRole('button', { name: 'Collapse music and settings', exact: true }).click(); await compact(page, true);
    await page.locator('.bob-music-compact').getByRole('button', { name: 'Next track', exact: true }).click();
    await waitPlaying(page, 'sans-serif-inkwell');
    await page.locator('[data-music-album="the-fine-print-vol-1"]').click();
    assert.equal(await page.evaluate(() => window.oipMusic.getState().currentTrack.id), 'sans-serif-inkwell');
    await page.locator('[data-music-play-album="the-fine-print-vol-1"]').click(); await waitPlaying(page, 'first-edition');
    await openCabinet(frame);
    if (!await frame.locator('[data-pet-settings-panel]').isVisible()) await frame.locator('[data-pet-settings-button]').click();
    await frame.getByRole('button', { name: 'Hide Bob', exact: true }).click();
    await page.locator('[data-bob-restore]').waitFor({ state: 'visible' }); await compact(page, true); await waitPlaying(page);
    await screenshot(page, 'desktop-hidden-bob');
    await page.locator('[data-bob-restore]').click(); await compact(page, true);
    assert.equal(await frame.locator('.pet-jukebox').isVisible(), false);
    await page.evaluate(() => { const f = document.querySelector('[data-bob-frame]'); window.__musicIdentity = { frame: f, doc: f.contentDocument, audio: f.contentWindow.__musicAudio.find(a => a.src.includes('/music/tracks/')) }; });
    await page.evaluate(() => window.oipNavigate('/library/'));
    await page.locator('#library-search').waitFor();
    const article = page.locator('main a[href^="/essays/"]').first();
    const articlePath = await article.getAttribute('href'); await article.click();
    await page.waitForFunction(expected => location.pathname === expected, articlePath);
    await page.goBack(); await page.locator('#library-search').waitFor();
    await page.goBack(); await page.locator('[data-music-page]').waitFor();
    await page.goForward(); await page.locator('#library-search').waitFor();
    await page.evaluate(() => window.oipNavigate('/music/')); await page.locator('[data-music-page]').waitFor();
    assert.deepEqual(await page.evaluate(() => { const saved = window.__musicIdentity, f = document.querySelector('[data-bob-frame]'); return [f === saved.frame, f.contentDocument === saved.doc, f.contentWindow.__musicAudio.includes(saved.audio), !saved.audio.paused]; }), [true, true, true, true]);
    assert.equal(await musicAudioCount(), 1);
    assert.equal(await page.locator('[data-music-panel]:not([hidden])').getAttribute('data-music-panel'), 'sans-serif');
    await screenshot(page, 'desktop-music-light');
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark'); await screenshot(page, 'desktop-music-dark');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const width of [390, 320]) test(`mobile ${width}: controls, composer font, temporary typing and viewport fitting`, async () => {
  const { context, page, frame, errors } = await setup(width);
  try {
    const viewportMeta = await frame.locator('meta[name="viewport"]').getAttribute('content');
    assert.doesNotMatch(viewportMeta, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/);
    await page.locator('[data-music-play-album="sans-serif"]').click(); await waitPlaying(page); await compact(page, true);
    const targets = await page.locator('.bob-music-compact button, .bob-music-compact a').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return [r.width,r.height]; }));
    assert.ok(targets.every(([w,h]) => w >= 44 && h >= 44));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await screenshot(page, `mobile-${width}-compact`);
    await openCabinet(frame);
    const input = frame.locator('#site-reading-query');
    await input.waitFor({ state: 'visible' });
    assert.ok(await input.evaluate(n => parseFloat(getComputedStyle(n).fontSize)) >= 16);
    const saved = await page.evaluate(() => localStorage.getItem('oip-bob-position:v1'));
    await input.fill('history');
    await frame.waitForFunction(() => document.querySelector('.site-bob').dataset.typing === 'true');
    assert.equal(await frame.locator('.pet-jukebox').isVisible(), false);
    await compact(page, false); await waitPlaying(page);
    // Protocol fixture models keyboard/visual viewport dimensions and offsets.
    // Native iOS keyboard and pinch behavior require the separate device review.
    await page.evaluate(({ width }) => document.querySelector('[data-bob-frame]').contentWindow.postMessage({channel:'oip-site-bob-v1',type:'viewport',width:width-20,height:330,left:10,top:90,scale:1.2}, location.origin), {width});
    await frame.waitForFunction(() => { const r = document.querySelector('#site-reading-query').getBoundingClientRect(); return r.top >= 90 && r.bottom <= 420; });
    await composerReady(page);
    await screenshot(page, `mobile-${width}-typing`);
    await input.evaluate(n => n.blur());
    await frame.waitForFunction(() => document.querySelector('.site-bob').dataset.typing === 'false');
    await page.evaluate(() => { const v=visualViewport;document.querySelector('[data-bob-frame]').contentWindow.postMessage({channel:'oip-site-bob-v1',type:'viewport',width:v.width,height:v.height,left:v.offsetLeft,top:v.offsetTop,scale:v.scale},location.origin); });
    await frame.locator('.pet-jukebox').waitFor({ state:'visible' });
    await page.waitForFunction(() => {
      const f=document.querySelector('[data-bob-frame]'),v=visualViewport;
      const r=f.contentDocument.querySelector('.pet-jukebox').getBoundingClientRect();
      return r.top>=v.offsetTop&&r.bottom<=v.offsetTop+v.height&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===f;
    });
    await composerReady(page);
    assert.equal(await page.evaluate(() => localStorage.getItem('oip-bob-position:v1')), saved);
    await screenshot(page, `mobile-${width}-cabinet`);
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    await screenshot(page, `mobile-${width}-dark`);
    await frame.getByRole('button', { name:'Collapse music and settings',exact:true }).click(); await compact(page,true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
