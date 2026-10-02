import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.OIP_PLAYWRIGHT_MODULE || "playwright");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.resolve(process.env.OIP_SITE_DIR || path.join(repo, "public"));
const origin = "https://outsideinprint.org";
const endpoint = "https://buttondown.com/api/emails/embed-subscribe/OutsideInPrint";
const names = ["utm_campaign", "utm_medium", "utm_source", "metadata__oip_segment", "metadata__oip_post"];
const entryTime = Date.parse("2026-09-01T12:00:00Z");
const previewDir = process.env.OIP_ALMANACK_PREVIEW_DIR;
let browser;
let localServer;
let localOrigin;
let unexpectedNetwork = 0;
const types = {".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".jpg": "image/jpeg"};

function builtFile(url) {
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const filename = path.resolve(site, (!relative || relative.endsWith("/")) ? `${relative}index.html` : relative);
  assert.ok(filename.startsWith(site + path.sep));
  return filename;
}

function withoutAnalyticsVendor(body) {
  // CI may build with analytics enabled. Use the in-memory count stub rather
  // than loading the network client; the production adapter remains intact.
  return body.replace(/<script\b[^>]*src=[^>]*\/js\/vendor\/goatcounter[^>]*>\s*<\/script>/g, "");
}

test.before(async () => {
  // Playwright routes only the first request of a redirect chain. A rejecting
  // proxy blocks every external fallback; the native 302 lands on loopback.
  localServer = http.createServer((request, response) => {
    if (request.method !== "GET" || !request.url.startsWith("/")) {
      unexpectedNetwork++;
      response.writeHead(502).end();
      return;
    }
    const filename = builtFile(new URL(request.url, localOrigin));
    if (!fs.existsSync(filename)) return response.writeHead(404).end();
    response.writeHead(200, {"Content-Type": types[path.extname(filename)] || "application/octet-stream"});
    const body = fs.readFileSync(filename);
    response.end(path.extname(filename) === ".html" ? withoutAnalyticsVendor(body.toString("utf8")) : body);
  });
  localServer.on("connect", (_request, socket) => {
    unexpectedNetwork++;
    socket.end("HTTP/1.1 502 Blocked by offline test\r\n\r\n");
  });
  await new Promise(resolve => localServer.listen(0, "127.0.0.1", resolve));
  localOrigin = `http://127.0.0.1:${localServer.address().port}`;
  browser = await chromium.launch({headless: true, proxy: {server: localOrigin, bypass: "127.0.0.1"}});
});
test.after(async () => {
  await browser?.close();
  localServer?.closeAllConnections();
  await new Promise(resolve => localServer?.close(resolve));
  assert.equal(unexpectedNetwork, 0, "The rejecting proxy must see no unmocked external requests.");
});

function tagged(segment, suffix = "bio") {
  return `${origin}/subscribe/${segment}/?utm_source=pinterest&utm_medium=organic_social&utm_campaign=almanack-organic&utm_content=${segment}-${suffix}`;
}

async function view(t, options = {}) {
  const context = await browser.newContext({javaScriptEnabled: options.js !== false, serviceWorkers: "block",
    viewport: options.viewport || {width: 1280, height: 900}});
  t.after(() => context.close());
  await context.addInitScript(now => { window.__testTime = now; Date.now = () => window.__testTime; }, entryTime);
  const page = await context.newPage();
  const posts = [];
  const foreign = [];
  // Fulfill requests locally; native accepted redirects use the loopback
  // fixture. The browser proxy prevents any fallback from reaching real sites.
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.url() === endpoint) {
      assert.equal(request.method(), "POST");
      posts.push(new URLSearchParams(request.postData()));
      if (options.response === "rejected") {
        return route.fulfill({status: 400, contentType: "text/html", body: "<h1>Mock provider validation error</h1>"});
      }
      if (options.response === "challenge") {
        return route.fulfill({status: 200, contentType: "text/html", body: "<h1>Mock provider verification challenge</h1>"});
      }
      return route.fulfill({status: 302, headers: {location: `${localOrigin}/subscribe/confirmation/`}, body: ""});
    }
    if (url.origin !== origin && url.origin !== localOrigin) {
      foreign.push(url.origin);
      return route.abort("blockedbyclient");
    }
    const filename = builtFile(url);
    if (!fs.existsSync(filename)) return route.fulfill({status: 404, body: "Mock missing file"});
    const extension = path.extname(filename);
    let body = fs.readFileSync(filename);
    if (extension === ".html") {
      body = withoutAnalyticsVendor(body.toString("utf8")).replace(/<script\b[^>]*src=[^>]*\/js\/analytics[^>]*>/,
        `<script>window.oipAnalytics.enabled=${options.analytics !== false};window.goatcounter.count=function(){};</script>$&`);
    }
    return route.fulfill({status: 200, contentType: types[extension] || "application/octet-stream", body});
  });
  return {page, posts, foreign};
}

async function submit(page, posts) {
  await page.locator('form[data-analytics-event="newsletter_submit"] input[type="email"]').fill("synthetic@example.invalid");
  await page.locator('form[data-analytics-event="newsletter_submit"] button[type="submit"]').click();
  await page.waitForLoadState("load");
  assert.equal(posts.length, 1);
}

function optional(post) {
  return Object.fromEntries(names.filter(name => post.has(name)).map(name => [name, post.get(name)]));
}

test("Three unchanged segment promises and both form layouts carry native metadata; home and sample do not extend expiry", async t => {
  const promises = {weekend: "A few quiet minutes on Saturday.", "everyday-history": "There is history in the things we use.",
    dialogue: "Two friends. A small question. A long talk."};
  for (const segment of Object.keys(promises)) {
    const {page, posts, foreign} = await view(t);
    await page.goto(tagged(segment));
    assert.equal(await page.locator("#funnel-title").textContent(), promises[segment]);
    const original = await page.evaluate(() => sessionStorage.getItem("oip.almanack-acquisition.v1"));
    const controls = await page.locator('form input[type="hidden"]').evaluateAll(inputs => inputs.map(input => ({name: input.name, value: input.value, disabled: input.disabled})));
    assert.deepEqual(controls.filter(input => names.includes(input.name)).map(input => [input.name, input.value, input.disabled]), names.map(name => [name, "", true]));
    await page.goto(`${origin}/almanack/2026-07-25/`);
    await page.goto(`${origin}/`);
    assert.equal(await page.locator("#home-reader-banner-title").textContent(), "Bob’s Almanack");
    await page.evaluate(now => { window.__testTime = now; }, entryTime + 10 * 60 * 1000);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("oip.almanack-acquisition.v1")), original);
    await submit(page, posts);
    assert.deepEqual(optional(posts[0]), {utm_campaign: "almanack-organic", utm_medium: "organic_social", utm_source: "pinterest",
      metadata__oip_segment: segment, metadata__oip_post: `${segment}-bio`});
    assert.equal(posts[0].get("embed"), "1");
    assert.equal(posts[0].get("tag"), "outside-in-print");
    assert.equal(new URL(page.url()).pathname, "/subscribe/confirmation/");
    assert.equal(new URL(page.url()).origin, localOrigin);
    assert.match(await page.locator("main").innerText(), /Bob’s Almanack/);
    assert.match(await page.locator("main").innerText(), /check your inbox and click the confirmation link to finish subscribing/);
    assert.deepEqual(foreign, []);
  }
  const shared = await view(t);
  await shared.page.goto(tagged("dialogue", "04"));
  await submit(shared.page, shared.posts);
  assert.equal(shared.posts[0].get("metadata__oip_post"), "dialogue-04");
});

test("Native browser email validation prevents invalid submit with and without JavaScript", async t => {
  for (const js of [true, false]) {
    const {page, posts} = await view(t, {js});
    await page.goto(`${origin}/subscribe/weekend/`);
    const email = page.locator('form input[type="email"]');
    await page.locator('form button[type="submit"]').click();
    assert.equal(await email.evaluate(input => input.validity.valueMissing), true);
    await email.fill("invalid-address");
    await page.locator('form button[type="submit"]').click();
    assert.equal(await email.evaluate(input => input.validity.typeMismatch), true);
    assert.equal(posts.length, 0);
  }
});

test("No-JavaScript, analytics-off, absent, duplicate and expired state keep native POST without optional fields", async t => {
  for (const options of [{js: false}, {analytics: false}, {absent: true}, {duplicate: true}, {expired: true}]) {
    for (const route of ["shared", "home"]) {
      const {page, posts, foreign} = await view(t, options);
      await page.goto(options.absent ? `${origin}/subscribe/weekend/` : tagged("weekend") + (options.duplicate ? "&utm_source=x" : ""));
      if (route === "home") await page.goto(`${origin}/`);
      if (options.expired) await page.evaluate(now => { window.__testTime = now; }, entryTime + 30 * 60 * 1000);
      await submit(page, posts);
      assert.deepEqual(optional(posts[0]), {});
      assert.equal(posts[0].get("embed"), "1");
      assert.equal(posts[0].get("tag"), "outside-in-print");
      assert.equal(new URL(page.url()).pathname, "/subscribe/confirmation/");
      assert.equal(new URL(page.url()).origin, localOrigin);
      assert.deepEqual(foreign, []);
    }
  }
});

test("Native provider rejection and CAPTCHA challenge retain provider navigation", async t => {
  for (const response of ["rejected", "challenge"]) {
    const {page, posts, foreign} = await view(t, {response});
    await page.goto(tagged("weekend", "02"));
    await submit(page, posts);
    assert.equal(page.url(), endpoint);
    assert.match(await page.locator("h1").textContent(), response === "rejected" ? /validation error/ : /verification challenge/);
    assert.equal(posts[0].get("metadata__oip_post"), "weekend-02");
    assert.deepEqual(foreign, []);
  }
});

test("Optional preparation previews show identity at desktop and phone widths", {skip: !previewDir}, async t => {
  fs.mkdirSync(previewDir, {recursive: true});
  const {page, foreign} = await view(t);
  for (const [label, route, selector] of [
    ["home", "/", ".home-reader-newsletter"],
    ["weekend", "/subscribe/weekend/", ".subscriber-funnel"],
    ["history", "/subscribe/everyday-history/", ".subscriber-funnel"],
    ["dialogue", "/subscribe/dialogue/", ".subscriber-funnel"],
    ["confirmation", "/subscribe/confirmation/", "main"],
  ]) {
    for (const width of [1280, 390]) {
      await page.setViewportSize({width, height: 900});
      await page.goto(origin + route);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} overflow at ${width}`);
      await page.locator(selector).screenshot({path: path.join(previewDir, `${label}-${width}.png`)});
    }
  }
  assert.deepEqual(foreign, []);
});
