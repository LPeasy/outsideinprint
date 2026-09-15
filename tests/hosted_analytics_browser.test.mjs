import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.resolve(process.env.OIP_SITE_DIR || path.join(repoRoot, "public"));
const canonicalOrigin = "https://outsideinprint.org";
const countOrigin = "https://outsideinprint.goatcounter.com";
const testHosts = new Set([
  "outsideinprint.org",
  "outsideinprint.org.evil.example",
  "preview.outsideinprint.example",
  "127.0.0.1",
  "localhost"
]);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"]
]);

let browser;

function readBuilt(relativePath) {
  const filePath = path.join(siteDir, relativePath);
  assert.ok(fs.existsSync(filePath), `Missing Hugo output: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

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

function transformAnalyticsConfig(html, overrides) {
  const bootstrapPattern = /window\.oipAnalytics=\{(?:(?!<\/script>).)*<\/script>/s;
  const bootstrap = html.match(bootstrapPattern);
  assert.ok(bootstrap, "Rendered page is missing the analytics configuration bootstrap.");

  let replacement = bootstrap[0];
  for (const [key, value] of Object.entries(overrides)) {
    const valuePattern = new RegExp(`(\\b${key}:)(?:!0|!1|true|false)`);
    assert.match(replacement, valuePattern, `Rendered analytics config is missing ${key}.`);
    replacement = replacement.replace(valuePattern, `$1${value ? "!0" : "!1"}`);
  }
  return html.replace(bootstrapPattern, replacement);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitFor(predicate, message, timeoutMs = 4000) {
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

function countData(record) {
  const url = new URL(record.url);
  return {
    event: url.searchParams.get("e") === "true",
    path: url.searchParams.get("p") || "",
    query: url.searchParams.get("q"),
    referrer: url.searchParams.get("r") || ""
  };
}

function eventParts(record) {
  const data = countData(record);
  const fields = {};
  const parts = data.path.split("|");

  for (const part of parts.slice(1)) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    fields[part.slice(0, separator)] = decodeURIComponent(part.slice(separator + 1));
  }
  return { name: parts[0].replace(/^oip:/, ""), fields };
}

function assertPrivacyBoundary(record, sentinels, expectedPageOrigin = canonicalOrigin) {
  const serialized = [record.url, record.body, JSON.stringify(record.headers)].join("\n");
  for (const sentinel of sentinels) {
    assert.doesNotMatch(serialized, new RegExp(sentinel, "i"), `Analytics leaked ${sentinel}.`);
  }

  assert.equal(countData(record).query, null, "GoatCounter requests must omit the q parameter.");

  const httpReferrer = record.headers.referer || "";
  if (httpReferrer) {
    const parsed = new URL(httpReferrer);
    assert.equal(parsed.origin, expectedPageOrigin, "Analytics HTTP Referer must contain only the page origin.");
    assert.equal(parsed.pathname, "/", "Analytics HTTP Referer must not contain a page path.");
    assert.equal(parsed.search, "", "Analytics HTTP Referer must not contain a query string.");
    assert.equal(parsed.hash, "", "Analytics HTTP Referer must not contain a fragment.");
  }
}

async function installRoutes(page, options = {}) {
  const counts = options.counts || [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin === countOrigin && url.pathname === "/count") {
      counts.push({
        body: request.postData() || "",
        headers: request.headers(),
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url()
      });
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (!testHosts.has(url.hostname)) {
      await route.abort("blockedbyclient");
      return;
    }

    const filePath = resolveBuiltPath(url);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
      return;
    }

    if (["font", "image", "media", "stylesheet"].includes(request.resourceType())) {
      await route.abort("blockedbyclient");
      return;
    }

    if (options.abortAnalyticsAdapter && /^analytics(?:\.min)?\./i.test(path.basename(filePath))) {
      await route.abort("failed");
      return;
    }

    if (options.vendorGate && /goatcounter/i.test(path.basename(filePath))) {
      await options.vendorGate.promise;
    }

    const contentType = contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    if (request.resourceType() === "document" && options.transformHtml) {
      const html = options.transformHtml(fs.readFileSync(filePath, "utf8"));
      await route.fulfill({ status: 200, contentType, body: html });
      return;
    }

    await route.fulfill({ status: 200, contentType, path: filePath });
  });

  return counts;
}

async function newInstrumentedPage(options = {}) {
  const context = await browser.newContext();
  if (options.initScript) {
    await context.addInitScript(options.initScript);
  }
  const page = await context.newPage();
  const counts = [];
  await installRoutes(page, { ...options, counts });
  return { context, counts, page };
}

async function loadAndClassify({ url = `${canonicalOrigin}/`, referer } = {}) {
  const { context, counts, page } = await newInstrumentedPage();
  const gotoOptions = { waitUntil: "load" };
  if (referer) {
    gotoOptions.referer = referer;
  }

  try {
    await page.goto(url, gotoOptions);
    const pageview = await waitFor(
      () => counts.find((record) => !countData(record).event),
      `No automatic pageview arrived for ${url} from ${referer || "direct traffic"}.`
    );
    return {
      functionLabel: await page.evaluate(() => window.oipAnalyticsEventReferrer()),
      requestLabel: countData(pageview).referrer
    };
  } finally {
    await context.close();
  }
}

test.before(async () => {
  const home = readBuilt("index.html");
  assert.match(home, /data-goatcounter=https:\/\/outsideinprint\.goatcounter\.com\/count|data-goatcounter="https:\/\/outsideinprint\.goatcounter\.com\/count"/);
  assert.match(home, /src=(?:"[^"\s]*goatcounter[^"\s]*"|[^>\s]*goatcounter[^>\s]*)/i);
  assert.match(home, /window\.oipAnalytics=\{(?:(?!<\/script>).)*enabled:(?:!0|true)/s, "Browser contract requires an analytics-enabled production Hugo build.");
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
});

test("hosted pageview and form/link events send only sanitized GoatCounter data", async () => {
  const sentinels = [
    "SENSITIVE_QUERY_SENTINEL",
    "SENSITIVE_FRAGMENT_SENTINEL",
    "SENSITIVE_REFERRER_SENTINEL",
    "sensitive-form-sentinel"
  ];
  const url = `${canonicalOrigin}/shop/2045/?private=SENSITIVE_QUERY_SENTINEL&utm_source=buttondown&utm_campaign=2045-launch#SENSITIVE_FRAGMENT_SENTINEL`;
  const referer = "https://www.google.com/search?private=SENSITIVE_REFERRER_SENTINEL";
  const { context, counts, page } = await newInstrumentedPage({
    initScript: () => {
      const original = navigator.sendBeacon.bind(navigator);
      window.__oipBeaconAttempts = [];
      navigator.sendBeacon = function (beaconUrl, body) {
        window.__oipBeaconAttempts.push({ url: String(beaconUrl), body: body == null ? "" : String(body) });
        return original(beaconUrl, body);
      };
    }
  });

  try {
    await page.goto(url, { referer, waitUntil: "load" });
    const pageview = await waitFor(
      () => counts.find((record) => !countData(record).event),
      "The vendored client did not send an automatic pageview beacon."
    );
    assert.equal(countData(pageview).path, "/shop/2045/");
    assert.equal(countData(pageview).referrer, "newsletter-2045-launch");

    const sample = page.locator('[data-analytics-event="book_sample_open"][data-analytics-path="/shop/2045/sample/"]').first();
    assert.equal(await sample.count(), 1, "The 2045 sample CTA must name the sample route as its analytics target.");
    await sample.evaluate((anchor) => {
      anchor.addEventListener("click", (event) => event.preventDefault(), { once: true });
      anchor.click();
    });

    const sampleEvent = await waitFor(
      () => counts.find((record) => countData(record).path.startsWith("oip:book_sample_open")),
      "The 2045 sample click did not send an event beacon."
    );
    assert.deepEqual(eventParts(sampleEvent), {
      name: "book_sample_open",
      fields: {
        path: "/shop/2045/sample/",
        slug: "2045",
        section: "Bookstore",
        source_slot: "bookstore_detail_early_sample"
      }
    });

    const form = page.locator('form[data-epub-checkout][data-analytics-event="checkout_start"]').first();
    assert.equal(await form.count(), 1, "The 2045 checkout form is missing from the browser fixture.");
    await form.locator('input[type="email"]').fill("sensitive-form-sentinel@example.com");
    await form.evaluate((node) => {
      node.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(
      () => counts.find((record) => countData(record).path.startsWith("oip:checkout_start")),
      "The checkout form did not send its intent event."
    );

    assert.ok(counts.length >= 3, "Expected pageview, sample, and checkout beacons.");
    for (const record of counts) {
      assert.equal(record.method, "POST", "Successful navigator.sendBeacon transport must use POST.");
      assertPrivacyBoundary(record, sentinels);
    }
    assert.ok(
      (await page.evaluate(() => window.__oipBeaconAttempts.length)) >= 3,
      "The hosted client must attempt navigator.sendBeacon for pageviews and events."
    );
    assert.equal(
      await page.locator('meta[name="referrer"]').getAttribute("content"),
      "strict-origin-when-cross-origin"
    );
  } finally {
    await context.close();
  }
});

test("image fallback keeps internal paths and drops off-site paths without leaking URL data", async () => {
  const sentinels = [
    "FALLBACK_QUERY_SENTINEL",
    "FALLBACK_FRAGMENT_SENTINEL",
    "FALLBACK_REFERRER_SENTINEL",
    "DATASET_QUERY_SENTINEL",
    "DATASET_FRAGMENT_SENTINEL",
    "OFFSITE_PATH_SENTINEL"
  ];
  const { context, counts, page } = await newInstrumentedPage({
    initScript: () => {
      window.__oipBeaconAttempts = [];
      navigator.sendBeacon = function (beaconUrl, body) {
        window.__oipBeaconAttempts.push({ url: String(beaconUrl), body: body == null ? "" : String(body) });
        return false;
      };
    }
  });

  try {
    await page.goto(
      `${canonicalOrigin}/?private=FALLBACK_QUERY_SENTINEL#FALLBACK_FRAGMENT_SENTINEL`,
      { referer: "https://example.com/ref?private=FALLBACK_REFERRER_SENTINEL", waitUntil: "load" }
    );
    await waitFor(() => counts.length >= 1, "Image fallback did not intercept the automatic pageview.");

    await page.evaluate(() => {
      const addAndClick = (slot, analyticsPath) => {
        const anchor = document.createElement("a");
        anchor.href = "#test-only";
        anchor.dataset.analyticsEvent = "internal_promo_click";
        anchor.dataset.analyticsSourceSlot = slot;
        anchor.dataset.analyticsPath = analyticsPath;
        document.body.appendChild(anchor);
        anchor.addEventListener("click", (event) => event.preventDefault(), { once: true });
        anchor.click();
      };
      addAndClick("fallback_internal", "/library/?private=DATASET_QUERY_SENTINEL#DATASET_FRAGMENT_SENTINEL");
      addAndClick("fallback_offsite", "https://evil.example/OFFSITE_PATH_SENTINEL?private=1");
    });

    await waitFor(() => counts.length >= 3, "Image fallback did not intercept both delegated events.");
    assert.ok(counts.every((record) => record.method === "GET" && record.resourceType === "image"));

    const internal = counts.find((record) => eventParts(record).fields.source_slot === "fallback_internal");
    const offsite = counts.find((record) => eventParts(record).fields.source_slot === "fallback_offsite");
    assert.ok(internal);
    assert.ok(offsite);
    assert.equal(eventParts(internal).fields.path, "/library/");
    assert.equal(eventParts(offsite).fields.path, undefined);

    for (const record of counts) {
      assertPrivacyBoundary(record, sentinels);
    }
  } finally {
    await context.close();
  }
});

test("source labels use exact or subdomain boundaries and only registered campaigns", async () => {
  const cases = [
    { referer: "https://news.google.co.uk/search?q=private", expected: "google" },
    { referer: "https://www.bing.com/search?q=private", expected: "bing" },
    { referer: "https://news.buttondown.email/archive/private", expected: "newsletter" },
    { referer: "https://m.facebook.com/private", expected: "social" },
    { referer: "https://gemini.google.com/app/private", expected: "ai_referral" },
    { referer: "https://example.com/private", expected: "other" },
    { referer: "https://outsideinprint.org/library/?private=1", expected: "internal" },
    { referer: "http://outsideinprint.org/library/", expected: "other" },
    { referer: "https://outsideinprint.org:8443/library/", expected: "other" },
    { expected: "direct_unknown" },
    {
      url: `${canonicalOrigin}/?utm_source=buttondown&utm_campaign=2045-launch`,
      expected: "newsletter-2045-launch"
    },
    {
      url: `${canonicalOrigin}/?utm_source=instagram&utm_campaign=2045-launch`,
      expected: "social-2045-launch"
    },
    {
      url: `${canonicalOrigin}/?utm_source=buttondown&utm_campaign=unregistered`,
      expected: "direct_unknown"
    },
    {
      url: `${canonicalOrigin}/?utm_source=buttondown&utm_campaign=2045-launch`,
      referer: "https://outsideinprint.org/library/",
      expected: "internal"
    },
    {
      url: `${canonicalOrigin}/?utm_source=buttondown&utm_campaign=2045-launch`,
      referer: "https://outsideinprint.org:8443/library/",
      expected: "newsletter-2045-launch"
    },
    { referer: "https://google.com.evil.example/private", expected: "other" },
    { referer: "https://outsideinprint.org.evil.example/private", expected: "other" },
    { referer: "https://chatgpt.com.evil.example/private", expected: "other" }
  ];

  for (const entry of cases) {
    const actual = await loadAndClassify(entry);
    assert.deepEqual(actual, { functionLabel: entry.expected, requestLabel: entry.expected }, JSON.stringify(entry));
  }
});

test("owner opt-out, disabled analytics, and unapproved hosts fail closed; loopback requires explicit opt-in", async () => {
  const cases = [
    {
      name: "owner opt-out",
      url: `${canonicalOrigin}/`,
      initScript: () => {
        try {
          localStorage.setItem("skipgc", "t");
        } catch (error) {
          // about:blank has an opaque origin; the script runs again on the site document.
        }
      },
      expectedCount: false
    },
    {
      name: "disabled config",
      url: `${canonicalOrigin}/`,
      transformHtml: (html) => transformAnalyticsConfig(html, { enabled: false }),
      expectedCount: false
    },
    {
      name: "analytics adapter unavailable",
      url: `${canonicalOrigin}/`,
      abortAnalyticsAdapter: true,
      expectedCount: false
    },
    {
      name: "loopback default",
      url: "http://127.0.0.1:4173/",
      expectedCount: false
    },
    {
      name: "loopback opt-in",
      url: "http://127.0.0.1:4173/",
      transformHtml: (html) => transformAnalyticsConfig(html, { allowLocal: true }),
      expectedCount: true
    },
    {
      name: "canonical hostname spoof",
      url: "https://outsideinprint.org.evil.example/",
      transformHtml: (html) => transformAnalyticsConfig(html, { allowLocal: true }),
      expectedCount: false
    },
    {
      name: "arbitrary preview host",
      url: "https://preview.outsideinprint.example/",
      transformHtml: (html) => transformAnalyticsConfig(html, { allowLocal: true }),
      expectedCount: false
    }
  ];

  for (const entry of cases) {
    const { context, counts, page } = await newInstrumentedPage(entry);
    try {
      await page.goto(entry.url, { waitUntil: "load" });
      if (entry.expectedCount) {
        await waitFor(() => counts.length > 0, `${entry.name} did not send a pageview.`);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 150));
        assert.equal(counts.length, 0, `${entry.name} sent an analytics request.`);
      }
    } finally {
      await context.close();
    }
  }
});

test("pre-vendor queue retains the oldest 40 events in FIFO order", async () => {
  const vendorGate = deferred();
  const { context, counts, page } = await newInstrumentedPage({ vendorGate });

  try {
    await page.goto(`${canonicalOrigin}/`, { waitUntil: "commit" });
    await page.waitForFunction(() => typeof window.oipAnalyticsEventReferrer === "function");
    await page.evaluate(() => {
      for (let index = 0; index < 45; index += 1) {
        const anchor = document.createElement("a");
        anchor.href = "#queue-test";
        anchor.dataset.analyticsEvent = "internal_promo_click";
        anchor.dataset.analyticsSourceSlot = `queue-${String(index).padStart(2, "0")}`;
        anchor.dataset.analyticsPath = "/";
        document.body.appendChild(anchor);
        anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
    });

    vendorGate.resolve();
    await page.waitForLoadState("load");
    await waitFor(
      () => counts.filter((record) => countData(record).event).length === 40,
      "The pre-vendor queue did not flush exactly 40 events."
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    const slots = counts
      .filter((record) => countData(record).event)
      .map((record) => eventParts(record).fields.source_slot);
    assert.deepEqual(slots, Array.from({ length: 40 }, (_, index) => `queue-${String(index).padStart(2, "0")}`));
  } finally {
    vendorGate.resolve();
    await context.close();
  }
});

test("pre-vendor queue expires ten seconds from the first queued event", async () => {
  const vendorGate = deferred();
  const { context, counts, page } = await newInstrumentedPage({ vendorGate });

  try {
    await page.clock.install({ time: new Date("2026-09-15T12:00:00Z") });
    await page.goto(`${canonicalOrigin}/`, { waitUntil: "commit" });
    await page.waitForFunction(() => typeof window.oipAnalyticsEventReferrer === "function");

    const queueEvent = (slot) => page.evaluate((sourceSlot) => {
      const anchor = document.createElement("a");
      anchor.href = "#queue-expiry";
      anchor.dataset.analyticsEvent = "internal_promo_click";
      anchor.dataset.analyticsSourceSlot = sourceSlot;
      anchor.dataset.analyticsPath = "/";
      document.body.appendChild(anchor);
      anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, slot);

    await queueEvent("expiry-first");
    await page.clock.fastForward(9000);
    await queueEvent("expiry-second");
    await page.clock.fastForward(1001);

    vendorGate.resolve();
    await page.waitForLoadState("load");
    await waitFor(
      () => counts.some((record) => !countData(record).event),
      "Vendored GoatCounter did not send its post-expiry automatic pageview."
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(counts.filter((record) => countData(record).event).length, 0, "Expired queued events must be dropped.");
  } finally {
    vendorGate.resolve();
    await context.close();
  }
});
