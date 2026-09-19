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

test("homepage article links emit one surface-specific click each while newsletter submit remains an attempt", async () => {
  const sentinels = ["HOMEPAGE_QUERY_SENTINEL", "HOMEPAGE_FRAGMENT_SENTINEL", "HOMEPAGE_EMAIL_SENTINEL"];
  const buttondownRequests = [];
  const { context, counts, page } = await newInstrumentedPage();
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "buttondown.com") {
      buttondownRequests.push(request.url());
    }
  });

  try {
    await page.goto(
      `${canonicalOrigin}/?private=HOMEPAGE_QUERY_SENTINEL#HOMEPAGE_FRAGMENT_SENTINEL`,
      { waitUntil: "load" }
    );
    await waitFor(
      () => counts.find((record) => !countData(record).event),
      "The homepage did not send its intercepted pageview."
    );

    const links = [
      { selector: ".home-v2-featured__lead h3 a", slot: "homepage_v2_featured_lead", count: 1 },
      { selector: ".home-v2-featured__lead-media", slot: "homepage_v2_featured_lead_image" },
      { selector: ".home-v2-featured__action a", slot: "homepage_v2_featured_lead_cta", count: 1 },
      { selector: ".home-v2-featured__item h3 a", slot: "homepage_v2_featured_supporting", count: 4 },
      { selector: ".home-v2-featured__item-media", slot: "homepage_v2_featured_supporting_image" }
    ];
    const illustrationCount = await page.locator(".home-v2-featured__lead-media, .home-v2-featured__item-media").count();
    let expectedClicks = 0;

    for (const entry of links) {
      const anchors = page.locator(entry.selector);
      const anchorCount = await anchors.count();
      if (entry.count !== undefined) {
        assert.equal(anchorCount, entry.count, `Unexpected homepage article-link count: ${entry.selector}`);
      }
      for (let index = 0; index < anchorCount; index += 1) {
        const target = await anchors.nth(index).evaluate((node) => {
          node.addEventListener("click", (event) => event.preventDefault(), { once: true });
          node.click();
          return {
            path: new URL(node.href).pathname,
            slug: node.dataset.analyticsSlug,
            section: node.dataset.analyticsSection
          };
        });
        expectedClicks += 1;
        const clickEvents = await waitFor(
          () => {
            const events = counts.filter((record) => countData(record).path.startsWith("oip:internal_promo_click"));
            return events.length === expectedClicks ? events : null;
          },
          `${entry.selector}[${index}] did not send exactly one article click.`
        );
        assert.deepEqual(eventParts(clickEvents[expectedClicks - 1]), {
          name: "internal_promo_click",
          fields: { path: target.path, slug: target.slug, section: target.section, source_slot: entry.slot }
        });
      }
    }
    assert.equal(expectedClicks, 6 + illustrationCount, "Featured article links include five titles, one lead CTA, and every rendered illustration.");

    const zooms = page.locator("[data-home-featured-image-trigger]");
    assert.equal(await zooms.count(), illustrationCount, "Each rendered featured illustration needs its own zoom control.");
    assert.equal(await page.locator("[data-home-featured-image-fallback]").count(), illustrationCount);
    for (let index = 0; index < illustrationCount; index += 1) {
      const opened = await zooms.nth(index).evaluate((zoom) => {
        const fallback = zoom.closest("article")?.querySelector("[data-home-featured-image-fallback]");
        const dialog = document.querySelector("[data-home-featured-dialog]");
        if (!fallback || !dialog) throw new Error("Missing homepage illustration fallback or dialog.");
        fallback.addEventListener("click", (event) => event.preventDefault(), { once: true });
        fallback.click();
        zoom.click();
        return dialog.open;
      });
      assert.equal(opened, true, `Illustration dialog did not open for featured card ${index + 1}.`);
      const closed = await page.locator("[data-home-featured-image-close]").evaluate((button) => {
        button.click();
        return !button.closest("dialog").open;
      });
      assert.equal(closed, true, `Illustration dialog did not close for featured card ${index + 1}.`);
    }

    const form = page.locator('form[data-analytics-event="newsletter_submit"][data-analytics-source-slot="homepage_reader_banner"]');
    assert.equal(await form.count(), 1, "Missing the homepage newsletter form.");
    await form.locator('input[type="email"]').fill("HOMEPAGE_EMAIL_SENTINEL@example.com");
    await form.evaluate((node) => {
      node.addEventListener("submit", (event) => event.preventDefault(), { once: true });
      node.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(
      () => counts.find((record) => countData(record).path.startsWith("oip:newsletter_submit")),
      "The homepage newsletter form did not send its submission-attempt event."
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    const clickEvents = counts.filter((record) => countData(record).path.startsWith("oip:internal_promo_click"));
    assert.equal(clickEvents.length, expectedClicks, "Illustration controls must not add article click events.");
    const submitEvents = counts.filter((record) => countData(record).path.startsWith("oip:newsletter_submit"));
    assert.equal(submitEvents.length, 1, "One prevented form submit must record one attempt, not a confirmation.");
    assert.equal(eventParts(submitEvents[0]).fields.source_slot, "homepage_reader_banner");
    assert.equal(buttondownRequests.length, 0, "The test must never request the live Buttondown subscribe endpoint.");
    for (const record of counts) {
      assert.equal(new URL(record.url).origin, countOrigin, "Analytics must be intercepted locally, not sent to another host.");
      assertPrivacyBoundary(record, sentinels);
    }
  } finally {
    await context.close();
  }
});

test("collection title and artwork clicks share one event each while magnifiers remain untracked", async () => {
  const sentinels = ["COLLECTION_QUERY_SENTINEL", "COLLECTION_FRAGMENT_SENTINEL", "COLLECTION_EMAIL_SENTINEL"];
  const cases = [
    { collection: "musings", articlePath: "/essays/life-is-a-controlled-fall/", gallery: true, imagePath: /\/images\/rendered\/editorial\/life-is-a-controlled-fall\// },
    { collection: "reported-case-studies", articlePath: "/essays/the-dolphin-company/", gallery: false, imagePath: /\/images\/medium\/the-dolphin-company\// },
    { collection: "modern-bios", articlePath: "/essays/jack-stratton-and-the-vulfpeck-model/", gallery: false, imagePath: /\/images\/medium\/jack-stratton-and-the-vulfpeck-model\// },
    { collection: "syd-and-oliver-dialogues", articlePath: "/syd-and-oliver/smoke-and-brass/", textOnly: true }
  ];
  const { context, counts, page } = await newInstrumentedPage();
  let expectedClicks = 0;

  try {
    for (const entry of cases) {
      const collectionPath = `/collections/${entry.collection}/`;
      await page.goto(
        `${canonicalOrigin}${collectionPath}?private=COLLECTION_QUERY_SENTINEL&email=COLLECTION_EMAIL_SENTINEL%40example.com#COLLECTION_FRAGMENT_SENTINEL`,
        { waitUntil: "load" }
      );
      await waitFor(
        () => counts.find((record) => !countData(record).event && countData(record).path === collectionPath),
        `${entry.collection} did not send its intercepted pageview.`
      );
      const record = page.locator(".collection-section__record").filter({
        has: page.locator(`.t a[href="${entry.articlePath}"]`)
      });
      assert.equal(await record.count(), 1, `Expected one collection record for ${entry.articlePath}.`);
      const title = record.locator(".t a");
      const metadata = await title.evaluate((anchor) => ({
        event: anchor.dataset.analyticsEvent,
        sourceSlot: anchor.dataset.analyticsSourceSlot,
        slug: anchor.dataset.analyticsSlug,
        title: anchor.dataset.analyticsTitle,
        section: anchor.dataset.analyticsSection,
        path: anchor.dataset.analyticsPath,
        collection: anchor.dataset.analyticsCollection
      }));
      assert.equal(metadata.event, "collection_click");
      assert.equal(metadata.sourceSlot, "collection_page");
      assert.equal(metadata.path, entry.articlePath);
      assert.equal(metadata.collection, entry.collection);

      const illustration = record.locator("a.essay-cartoon-thumb");
      const zoom = record.locator("[data-essay-cartoon-lightbox-trigger]");
      if (entry.textOnly) {
        assert.equal(await illustration.count(), 0, "An image-exempt piece must remain text-only.");
        assert.equal(await zoom.count(), 0, "An image-exempt piece must not have an empty magnifier.");
      } else {
        assert.equal(await illustration.count(), 1, `Missing artwork for ${entry.articlePath}.`);
        assert.equal(await illustration.getAttribute("href"), entry.articlePath);
        assert.match(await illustration.locator("img").getAttribute("src"), entry.imagePath);
        assert.ok((await illustration.locator("img").getAttribute("alt"))?.trim(), "Expanded artwork needs meaningful alternative text.");
        assert.deepEqual(await illustration.evaluate((anchor) => ({
          event: anchor.dataset.analyticsEvent,
          sourceSlot: anchor.dataset.analyticsSourceSlot,
          slug: anchor.dataset.analyticsSlug,
          title: anchor.dataset.analyticsTitle,
          section: anchor.dataset.analyticsSection,
          path: anchor.dataset.analyticsPath,
          collection: anchor.dataset.analyticsCollection
        })), metadata, "Image clicks must carry the exact same destination and collection metadata as title clicks.");
      }

      for (const anchor of entry.textOnly ? [title] : [title, illustration]) {
        await anchor.evaluate((node) => {
          node.addEventListener("click", (event) => event.preventDefault(), { once: true });
          node.click();
        });
        expectedClicks += 1;
        const clickEvents = await waitFor(
          () => {
            const events = counts.filter((count) => countData(count).path.startsWith("oip:collection_click"));
            return events.length >= expectedClicks ? events : null;
          },
          `${entry.articlePath} did not send its collection click.`
        );
        assert.equal(clickEvents.length, expectedClicks, "One article-link activation must emit exactly one collection event.");
        assert.deepEqual(eventParts(clickEvents[expectedClicks - 1]), {
          name: "collection_click",
          fields: {
            path: entry.articlePath,
            slug: metadata.slug,
            section: metadata.section,
            source_slot: "collection_page",
            collection: entry.collection
          }
        });
      }

      if (!entry.textOnly) {
        assert.equal(await zoom.count(), 1);
        assert.equal(await zoom.evaluate((button) => Boolean(button.closest("[data-analytics-event]"))), false);
        const viewer = await zoom.evaluate((button) => {
          button.click();
          const lightbox = document.querySelector("[data-essay-cartoon-lightbox]");
          const gallery = lightbox.querySelector("[data-essay-cartoon-lightbox-gallery]");
          return {
            opened: !lightbox.hidden,
            galleryVisible: !gallery.hidden,
            galleryUrl: button.getAttribute("data-gallery"),
            gallerySlug: button.getAttribute("data-cartoon-slug"),
            image: lightbox.querySelector("[data-essay-cartoon-lightbox-image]").getAttribute("src")
          };
        });
        assert.equal(viewer.opened, true, "The magnifier must open the existing image viewer.");
        assert.equal(viewer.galleryVisible, entry.gallery, "Article-only artwork must not invent a gallery destination.");
        assert.match(viewer.image, entry.imagePath);
        if (entry.gallery) {
          assert.ok(viewer.gallerySlug);
          assert.equal(new URL(viewer.galleryUrl).searchParams.get("cartoon"), viewer.gallerySlug);
        } else {
          assert.equal(viewer.galleryUrl, null);
          assert.equal(viewer.gallerySlug, null);
        }
        await page.keyboard.press("Escape");
        assert.equal(await zoom.evaluate((button) => {
          const lightbox = document.querySelector("[data-essay-cartoon-lightbox]");
          return lightbox.hidden && document.activeElement === button;
        }), true, "Escape must close the viewer and return keyboard focus to its magnifier.");
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(counts.filter((count) => countData(count).event).length, expectedClicks, "Magnifiers must not add article-click or other analytics events.");
    }
    for (const count of counts) {
      assertPrivacyBoundary(count, sentinels);
    }
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
