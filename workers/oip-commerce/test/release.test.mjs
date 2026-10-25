import assert from "node:assert/strict";
import test from "node:test";
import { productForSku } from "../src/catalog.js";
import { handleRequest } from "../src/index.js";
import { requireEpubRelease } from "../src/release.js";
import { FakeD1 } from "./fake-d1.mjs";

const product = productForSku("OIP-FM-EPUB");
const releaseMs = Date.parse(product.releaseNotBefore);
const nowSeconds = Math.floor(releaseMs / 1000);
const notReady = { status: 503, code: "EPUB_RELEASE_NOT_READY" };

function page(publication, { canonical = publication.url, title = publication.title, ...options } = {}) {
  return new Response(`<html><head><link rel=canonical href=${canonical}></head><body><h1>${title}</h1></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" }, ...options,
  });
}

function publicationFor(url) {
  const publication = product.requiredPublications.find((entry) => entry.url === url);
  assert.ok(publication, `Only fixed catalog publications may be requested: ${url}`);
  return publication;
}

test("scheduled EPUB does not fetch before its exact release instant", async () => {
  let calls = 0;
  await assert.rejects(requireEpubRelease(product, {
    nowSeconds: nowSeconds - 1,
    fetcher: async () => { calls += 1; throw new Error("unexpected fetch"); },
  }), notReady);
  assert.equal(calls, 0);
});

test("all existing products bypass publication checks", async () => {
  for (const sku of ["OIP-TD-EPUB", "OIP-AN-EPUB", "OIP-PS-EPUB", "OIP-WC-EPUB", "OIP-PENDING-EPUB"]) {
    await requireEpubRelease(productForSku(sku), {
      nowSeconds: 0,
      fetcher: async () => { throw new Error("ordinary books must not fetch publication pages"); },
    });
  }
});

test("exact release instant requires all three canonical pages and identifying headings", async () => {
  const calls = [];
  await requireEpubRelease(product, { nowSeconds, fetcher: async (url, options) => {
    calls.push(url);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers["cache-control"], "no-cache");
    assert.ok(options.signal instanceof AbortSignal);
    const publication = publicationFor(url);
    return page(publication, { title: publication.title.replaceAll("’", "&#x2019;") });
  } });
  assert.deepEqual(calls, product.requiredPublications.map(({ url }) => url));
});

for (const [name, makeResponse] of [
  ["missing page", (publication) => page(publication, { status: 404 })],
  ["redirect", () => new Response(null, { status: 302, headers: { location: "https://example.com/" } })],
  ["wrong canonical", (publication) => page(publication, { canonical: "https://outsideinprint.org/" })],
  ["wrong heading", (publication) => page(publication, { title: "Not found" })],
  ["non-HTML body", () => new Response("ok", { headers: { "content-type": "text/plain" } })],
  ["oversized body", (publication) => new Response(`<h1>${publication.title}</h1>${"x".repeat(512 * 1024)}`, { headers: { "content-type": "text/html" } })],
]) {
  test(`release fails closed on ${name}`, async () => {
    await assert.rejects(requireEpubRelease(product, { nowSeconds, fetcher: async (url) => {
      const publication = publicationFor(url);
      return url === product.requiredPublications[2].url ? makeResponse(publication) : page(publication);
    } }), notReady);
  });
}

test("timeout includes a stalled body and remains bounded when a fetch ignores abort", async () => {
  let signal;
  await assert.rejects(requireEpubRelease(product, { nowSeconds, timeoutMs: 10, fetcher: async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  } }), notReady);
  assert.equal(signal.aborted, true);
  await assert.rejects(requireEpubRelease(product, { nowSeconds, timeoutMs: 10, fetcher: async () =>
    new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/html" } }),
  }), notReady);
});

function checkoutRequest(sku = product.sku) {
  const request = new Request("https://downloads.outsideinprint.org/api/books/epub", {
    method: "POST",
    headers: { origin: "https://outsideinprint.org", "content-type": "application/json", "idempotency-key": "scheduled-book-test-intent" },
    body: JSON.stringify({ sku, country_code: "US", email: "reader@example.com" }),
  });
  Object.defineProperty(request, "cf", { value: { country: "US" } });
  return request;
}

function checkoutEnv(fetcher, sku = product.sku) {
  return {
    DB: new FakeD1(), EPUB_BUCKET: { get: async () => null },
    RATE_LIMIT_SALT: "test-salt", EMAIL_HASH_PEPPER: "test-pepper", EPUB_ENABLED_SKUS: sku,
    SQUARE_EPUB_CATALOG_VARIATION_IDS: JSON.stringify({ [sku]: "variation-test" }),
    SQUARE_LOCATION_ID: "location-test", SQUARE_API_BASE_URL: "https://square.example.test",
    SQUARE_API_VERSION: "test-version", SQUARE_ACCESS_TOKEN: "test-token",
    SQUARE_EPUB_REDIRECT_URL: "https://outsideinprint.org/shop/thanks/",
    DOWNLOAD_TOKEN_SECRET: "test-download-token-secret", __testFetch: fetcher,
  };
}

test("HTTP checkout creates no state or provider call until publication dependencies pass", async (t) => {
  t.mock.method(Date, "now", () => releaseMs - 1000);
  let calls = 0;
  const env = checkoutEnv(async () => { calls += 1; throw new Error("unexpected call"); });
  let response = await handleRequest(checkoutRequest(), env);
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
  assert.equal(env.DB.checkouts.size, 0);
  Date.now.mock.mockImplementation(() => releaseMs);
  env.__testFetch = async (url) => { calls += 1; return page(publicationFor(url), { status: 404 }); };
  response = await handleRequest(checkoutRequest(), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, notReady.code);
  assert.equal(calls, 3);
  assert.equal(env.DB.checkouts.size, 0);
});

test("HTTP checkout checks publication before Square and fails closed again on cached-link retrieval", async (t) => {
  t.mock.method(Date, "now", () => releaseMs);
  const calls = [];
  const env = checkoutEnv(async (url, options) => {
    calls.push(url);
    if (url.startsWith("https://outsideinprint.org/")) return page(publicationFor(url));
    if (url.includes("/v2/catalog/object/")) return Response.json({ object: {
      id: "variation-test", type: "ITEM_VARIATION", present_at_all_locations: true,
      item_variation_data: { sku: product.sku, pricing_type: "FIXED_PRICING", price_money: { amount: 999, currency: "USD" } },
    } });
    assert.ok(url.endsWith("/v2/online-checkout/payment-links"));
    assert.equal(calls.filter((entry) => entry.startsWith("https://outsideinprint.org/")).length, 3);
    const body = JSON.parse(options.body);
    return Response.json({
      payment_link: { id: "link-test", order_id: "order-test", url: "https://square.link/u/test", pre_populated_data: body.pre_populated_data },
      related_resources: { orders: [{ id: "order-test", location_id: "location-test", reference_id: body.order.reference_id,
        total_money: { amount: 999, currency: "USD" }, fulfillments: [{ type: "DIGITAL" }],
        line_items: [{ catalog_object_id: "variation-test", quantity: "1", base_price_money: { amount: 999, currency: "USD" }, total_money: { amount: 999, currency: "USD" } }],
      }] },
    });
  });
  const response = await handleRequest(checkoutRequest(), env);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  assert.equal(calls.length, 5);
  assert.equal(env.DB.checkouts.size, 1);
  env.__testFetch = async (url) => page(publicationFor(url), { status: 404 });
  const retry = await handleRequest(checkoutRequest(), env);
  assert.equal(retry.status, 503);
  assert.equal((await retry.json()).error.code, notReady.code);
});
