import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.resolve(process.env.OIP_SITE_DIR || path.join(repoRoot, "public"));
const siteOrigin = "https://outsideinprint.org";
const analyticsOrigin = "https://outsideinprint.goatcounter.com";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".xml", "application/xml; charset=utf-8"]
]);

let browser;

function resolveBuiltPath(url) {
  let relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (!relativePath || relativePath.endsWith("/")) {
    relativePath += "index.html";
  }

  const filePath = path.resolve(siteDir, relativePath);
  assert.ok(
    filePath === siteDir || filePath.startsWith(siteDir + path.sep),
    `Refusing to serve a path outside the Hugo output: ${url.pathname}`
  );
  return filePath;
}

function escapeAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function replaceShareUrl(html, replacement) {
  const pattern = /(data-piece-share\b[^>]*\bdata-share-url=)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
  const match = html.match(pattern);
  assert.ok(match, "Rendered eligible page is missing data-share-url.");
  const current = match[2] || match[3] || match[4] || "";
  const next = typeof replacement === "function" ? replacement(current) : replacement;
  return html.replace(pattern, `$1"${escapeAttribute(next)}"`);
}

async function waitFor(predicate, message, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(message);
}

async function createPage(options = {}) {
  const context = await browser.newContext({
    javaScriptEnabled: options.javaScriptEnabled !== false,
    viewport: options.viewport || { width: 1280, height: 900 }
  });
  if (options.initScript) {
    await context.addInitScript(options.initScript);
  }

  const page = await context.newPage();
  const analyticsRequests = [];
  const outboundRequests = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin === analyticsOrigin && url.pathname === "/count") {
      analyticsRequests.push(request.url());
      outboundRequests.push(request.url());
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (url.origin !== siteOrigin) {
      outboundRequests.push(request.url());
      await route.abort("blockedbyclient");
      return;
    }

    const filePath = resolveBuiltPath(url);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
      return;
    }

    if (["font", "image", "media"].includes(request.resourceType())) {
      await route.abort("blockedbyclient");
      return;
    }

    const contentType = contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    if (request.resourceType() === "document" && options.transformHtml) {
      await route.fulfill({
        status: 200,
        contentType,
        body: options.transformHtml(fs.readFileSync(filePath, "utf8"))
      });
      return;
    }

    await route.fulfill({ status: 200, contentType, path: filePath });
  });

  return { analyticsRequests, context, outboundRequests, page };
}

async function assertNoShareNetwork(page, outboundRequests, baseline, context) {
  await page.waitForTimeout(50);
  assert.equal(
    outboundRequests.length,
    baseline,
    `${context} must not add analytics or third-party network requests.`
  );
}

async function loadEligible(page, route = "/essays/jack-stratton-and-the-vulfpeck-model/") {
  await page.goto(`${siteOrigin}${route}`, { waitUntil: "load" });
  const wrapper = page.locator("[data-piece-share]");
  await wrapper.waitFor({ state: "visible" });
  return wrapper;
}

test.before(async () => {
  assert.ok(fs.existsSync(path.join(siteDir, "index.html")), `Missing Hugo output: ${siteDir}`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
});

test("share control progressively enhances only representative eligible routes", async () => {
  const eligible = [
    "/essays/jack-stratton-and-the-vulfpeck-model/",
    "/syd-and-oliver/the-sound-of-authorit/",
    "/almanack/2026-09-12/",
    "/shop/2045/sample/"
  ];
  const excluded = [
    "/",
    "/archive/",
    "/privacy/",
    "/essays/the-cracked-pot/",
    "/shop/2045/",
    "/working-papers/rcp85-bibliometrics-methods-and-tables/"
  ];
  const { context, page } = await createPage();

  try {
    for (const route of eligible) {
      const response = await page.goto(`${siteOrigin}${route}`, { waitUntil: "load" });
      assert.equal(response.status(), 200, route);
      const wrapper = page.locator("[data-piece-share]");
      await wrapper.waitFor({ state: "visible" });
      assert.equal(await wrapper.locator("[data-share-trigger]").textContent(), "Share");
      assert.equal(await wrapper.locator("[data-share-trigger]").getAttribute("aria-expanded"), "false");
      assert.equal(await wrapper.locator("[data-share-trigger]").getAttribute("aria-controls"), "piece-share-options");
      assert.equal(await wrapper.locator("[data-share-panel]").getAttribute("id"), "piece-share-options");
      assert.equal(await wrapper.locator("[data-share-input]").getAttribute("readonly"), "");
      assert.equal(await page.locator('script[src*="piece-share"]').count(), 1);

      const shareUrl = await wrapper.getAttribute("data-share-url");
      assert.equal(shareUrl, `${siteOrigin}${route}`);
      assert.equal(new URL(shareUrl).search, "");
      assert.equal(new URL(shareUrl).hash, "");
      assert.equal(await wrapper.getAttribute("data-share-title"), await page.locator('meta[property="og:title"]').getAttribute("content"));
    }

    for (const route of excluded) {
      const response = await page.goto(`${siteOrigin}${route}`, { waitUntil: "load" });
      assert.equal(response.status(), 200, route);
      assert.equal(await page.locator("[data-piece-share]").count(), 0, route);
      assert.equal(await page.locator('script[src*="piece-share"]').count(), 0, route);
    }
  } finally {
    await context.close();
  }
});

test("without JavaScript the clean server-rendered control remains hidden", async () => {
  const route = "/essays/jack-stratton-and-the-vulfpeck-model/";
  const { context, outboundRequests, page } = await createPage({ javaScriptEnabled: false });

  try {
    await page.goto(`${siteOrigin}${route}?visitor=QUERY_SENTINEL#FRAGMENT_SENTINEL`, { waitUntil: "load" });
    const wrapper = page.locator("[data-piece-share]");
    assert.equal(await wrapper.count(), 1);
    assert.notEqual(await wrapper.getAttribute("hidden"), null);
    assert.equal(await wrapper.isHidden(), true);
    assert.equal(await wrapper.getAttribute("data-share-url"), `${siteOrigin}${route}`);
    assert.equal(outboundRequests.length, 0);
  } finally {
    await context.close();
  }
});

test("native sharing receives only title and a canonical URL and restores focus", async () => {
  const route = "/essays/jack-stratton-and-the-vulfpeck-model/";
  const sentinels = ["VISITOR_QUERY_SENTINEL", "VISITOR_FRAGMENT_SENTINEL", "SERVER_QUERY_SENTINEL", "SERVER_FRAGMENT_SENTINEL"];
  const { context, outboundRequests, page } = await createPage({
    transformHtml: (html) => replaceShareUrl(html, (url) => `${url}?metadata=SERVER_QUERY_SENTINEL#SERVER_FRAGMENT_SENTINEL`),
    initScript: () => {
      window.__nativeShareCalls = [];
      window.__clipboardCalls = [];
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: (payload) => {
          window.__nativeShareCalls.push(payload);
          return new Promise((resolve) => {
            window.__resolveNativeShare = resolve;
          });
        }
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (value) => { window.__clipboardCalls.push(value); return Promise.resolve(); } }
      });
    }
  });

  try {
    const wrapper = await loadEligible(page, `${route}?visitor=VISITOR_QUERY_SENTINEL#VISITOR_FRAGMENT_SENTINEL`);
    const trigger = wrapper.locator("[data-share-trigger]");
    const title = await wrapper.getAttribute("data-share-title");
    const baseline = outboundRequests.length;

    await trigger.click();
    await page.waitForFunction(() => window.__nativeShareCalls.length === 1);
    assert.equal(await trigger.isDisabled(), true, "Native Share must prevent a second activation while pending.");
    assert.equal(await wrapper.locator("[data-share-panel]").isHidden(), true);
    assert.equal(await wrapper.locator("[data-share-status]").textContent(), "");
    assert.equal(await page.evaluate(() => window.__clipboardCalls.length), 0);

    const payload = await page.evaluate(() => window.__nativeShareCalls[0]);
    assert.deepEqual(payload, { title, url: `${siteOrigin}${route}` });
    const serialized = JSON.stringify(payload);
    for (const sentinel of sentinels) {
      assert.doesNotMatch(serialized, new RegExp(sentinel));
    }

    await page.evaluate(() => window.__resolveNativeShare());
    await page.waitForFunction(() => !document.querySelector("[data-share-trigger]").disabled);
    assert.equal(await trigger.evaluate((node) => document.activeElement === node), true);
    assert.equal(await wrapper.locator("[data-share-status]").textContent(), "", "Native resolution must not claim that sharing succeeded.");
    await assertNoShareNetwork(page, outboundRequests, baseline, "Native Share");
  } finally {
    await context.close();
  }
});

test("native cancellation has no fallback or copy side effect; other native failure opens fallback", async () => {
  const { context, outboundRequests, page } = await createPage({
    initScript: () => {
      window.__nativeMode = "abort";
      window.__nativeShareCalls = [];
      window.__clipboardCalls = [];
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: (payload) => {
          window.__nativeShareCalls.push(payload);
          const name = window.__nativeMode === "abort" ? "AbortError" : "NotAllowedError";
          return Promise.reject(new DOMException("Test-only native result", name));
        }
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (value) => { window.__clipboardCalls.push(value); return Promise.resolve(); } }
      });
    }
  });

  try {
    const wrapper = await loadEligible(page);
    const trigger = wrapper.locator("[data-share-trigger]");
    const panel = wrapper.locator("[data-share-panel]");
    const baseline = outboundRequests.length;

    await trigger.click();
    await page.waitForFunction(() => window.__nativeShareCalls.length === 1 && !document.querySelector("[data-share-trigger]").disabled);
    assert.equal(await panel.isHidden(), true);
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    assert.equal(await wrapper.locator("[data-share-status]").textContent(), "");
    assert.equal(await page.evaluate(() => window.__clipboardCalls.length), 0);
    assert.equal(await trigger.evaluate((node) => document.activeElement === node), true, "Cancellation must restore trigger focus.");

    await page.evaluate(() => { window.__nativeMode = "failure"; });
    await trigger.click();
    await panel.waitFor({ state: "visible" });
    assert.equal(await trigger.getAttribute("aria-expanded"), "true");
    assert.equal(await wrapper.locator("[data-share-copy]").evaluate((node) => document.activeElement === node), true);
    assert.equal(await page.evaluate(() => window.__clipboardCalls.length), 0, "Opening fallback must not copy automatically.");
    await assertNoShareNetwork(page, outboundRequests, baseline, "Native cancellation/failure");
  } finally {
    await context.close();
  }
});

test("unsupported native sharing copies only on request and Close restores focus", async () => {
  const { context, outboundRequests, page } = await createPage({
    initScript: () => {
      window.__clipboardCalls = [];
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (value) => { window.__clipboardCalls.push(value); return Promise.resolve(); } }
      });
    }
  });

  try {
    const wrapper = await loadEligible(page);
    const trigger = wrapper.locator("[data-share-trigger]");
    const panel = wrapper.locator("[data-share-panel]");
    const copy = wrapper.locator("[data-share-copy]");
    const baseline = outboundRequests.length;

    await trigger.click();
    await panel.waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => window.__clipboardCalls.length), 0);
    assert.equal(await copy.evaluate((node) => document.activeElement === node), true);

    await copy.click();
    await page.waitForFunction(() => document.querySelector("[data-share-status]").textContent === "Link copied.");
    assert.deepEqual(await page.evaluate(() => window.__clipboardCalls), [`${siteOrigin}/essays/jack-stratton-and-the-vulfpeck-model/`]);
    assert.equal(await wrapper.locator("[data-share-manual]").isHidden(), true);

    await wrapper.locator("[data-share-close]").click();
    assert.equal(await panel.isHidden(), true);
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    assert.equal(await trigger.evaluate((node) => document.activeElement === node), true);
    await assertNoShareNetwork(page, outboundRequests, baseline, "Clipboard success");
  } finally {
    await context.close();
  }
});

test("clipboard denial or absence exposes a selected manual URL and Escape restores focus", async () => {
  const { context, outboundRequests, page } = await createPage({
    initScript: () => {
      window.__clipboardCalls = [];
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (value) => {
            window.__clipboardCalls.push(value);
            return Promise.reject(new DOMException("Test-only denial", "NotAllowedError"));
          }
        }
      });
    }
  });

  try {
    const wrapper = await loadEligible(page);
    const trigger = wrapper.locator("[data-share-trigger]");
    const panel = wrapper.locator("[data-share-panel]");
    const manual = wrapper.locator("[data-share-manual]");
    const input = wrapper.locator("[data-share-input]");
    const baseline = outboundRequests.length;

    await trigger.click();
    await wrapper.locator("[data-share-copy]").click();
    await manual.waitFor({ state: "visible" });
    assert.equal(await input.getAttribute("readonly"), "");
    assert.equal(await input.inputValue(), `${siteOrigin}/essays/jack-stratton-and-the-vulfpeck-model/`);
    assert.equal(await input.evaluate((node) => document.activeElement === node), true);
    assert.deepEqual(
      await input.evaluate((node) => [node.selectionStart, node.selectionEnd, node.value.length]),
      [0, `${siteOrigin}/essays/jack-stratton-and-the-vulfpeck-model/`.length, `${siteOrigin}/essays/jack-stratton-and-the-vulfpeck-model/`.length]
    );
    assert.match(await wrapper.locator("[data-share-status]").textContent(), /link is selected; copy it manually/i);

    await page.keyboard.press("Escape");
    assert.equal(await panel.isHidden(), true);
    assert.equal(await manual.isHidden(), true);
    assert.equal(await trigger.evaluate((node) => document.activeElement === node), true);

    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    });
    await trigger.click();
    await wrapper.locator("[data-share-copy]").click();
    await manual.waitFor({ state: "visible" });
    assert.equal(await input.evaluate((node) => document.activeElement === node), true);
    await wrapper.locator("[data-share-close]").click();
    assert.equal(await trigger.evaluate((node) => document.activeElement === node), true);
    await assertNoShareNetwork(page, outboundRequests, baseline, "Clipboard denial/absence");
  } finally {
    await context.close();
  }
});

test("a clipboard promise settling after close cannot reopen or announce stale state", async () => {
  const { context, outboundRequests, page } = await createPage({
    initScript: () => {
      window.__clipboardCalls = [];
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (value) => {
            window.__clipboardCalls.push(value);
            return new Promise((resolve, reject) => {
              window.__settleClipboard = { resolve, reject };
            });
          }
        }
      });
    }
  });

  try {
    const wrapper = await loadEligible(page);
    const trigger = wrapper.locator("[data-share-trigger]");
    const panel = wrapper.locator("[data-share-panel]");
    const baseline = outboundRequests.length;

    await trigger.click();
    await wrapper.locator("[data-share-copy]").click();
    await page.waitForFunction(() => Boolean(window.__settleClipboard));
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.__settleClipboard.reject(new DOMException("Late denial", "NotAllowedError")));
    await page.waitForTimeout(0);

    assert.equal(await panel.isHidden(), true);
    assert.equal(await wrapper.locator("[data-share-manual]").isHidden(), true);
    assert.equal(await wrapper.locator("[data-share-status]").textContent(), "");
    assert.equal(await trigger.evaluate((node) => document.activeElement === node), true);
    await assertNoShareNetwork(page, outboundRequests, baseline, "Stale clipboard result");
  } finally {
    await context.close();
  }
});

test("invalid share origins remain hidden", async () => {
  for (const invalidUrl of [
    "http://outsideinprint.org/essays/jack-stratton-and-the-vulfpeck-model/",
    "https://outsideinprint.org.evil.example/essays/jack-stratton-and-the-vulfpeck-model/"
  ]) {
    const { context, page } = await createPage({ transformHtml: (html) => replaceShareUrl(html, invalidUrl) });
    try {
      await page.goto(`${siteOrigin}/essays/jack-stratton-and-the-vulfpeck-model/`, { waitUntil: "load" });
      const wrapper = page.locator("[data-piece-share]");
      assert.equal(await wrapper.count(), 1);
      assert.equal(await wrapper.isHidden(), true, invalidUrl);
    } finally {
      await context.close();
    }
  }
});

test("share fallback fits a 390 by 844 viewport with 44-pixel targets", async () => {
  const { context, page } = await createPage({
    viewport: { width: 390, height: 844 },
    initScript: () => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.resolve() }
      });
    }
  });

  try {
    const wrapper = await loadEligible(page);
    await wrapper.locator("[data-share-trigger]").click();
    await wrapper.locator("[data-share-panel]").waitFor({ state: "visible" });

    const geometry = await wrapper.evaluate((node) => {
      const panel = node.querySelector("[data-share-panel]").getBoundingClientRect();
      const buttons = Array.from(node.querySelectorAll("button:not([hidden])"), (button) => {
        const rect = button.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      });
      return {
        buttons,
        clientWidth: document.documentElement.clientWidth,
        panelLeft: panel.left,
        panelRight: panel.right,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
      };
    });

    assert.equal(geometry.viewportWidth, 390);
    assert.ok(geometry.scrollWidth <= geometry.clientWidth, JSON.stringify(geometry));
    assert.ok(geometry.panelLeft >= 0 && geometry.panelRight <= geometry.viewportWidth, JSON.stringify(geometry));
    assert.ok(geometry.buttons.length >= 3);
    for (const button of geometry.buttons) {
      assert.ok(button.width >= 44 && button.height >= 44, JSON.stringify(button));
    }
  } finally {
    await context.close();
  }
});
