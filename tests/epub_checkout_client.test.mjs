import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/js/epub-checkout.js", import.meta.url), "utf8");
const endpoint = "https://downloads.outsideinprint.org/api/books/epub";
const checkoutUrl = "https://square.link/u/test-checkout";

async function submit(sku, returnedUrl = checkoutUrl) {
  const requests = [];
  const navigations = [];
  const button = { disabled: false, textContent: "Continue to Square", setAttribute() {}, removeAttribute() {} };
  const status = { textContent: "" };
  const fields = {
    "button[type='submit']": button,
    "[data-epub-checkout-status]": status,
    "input[name='email']": { value: " Reader@Example.com ", checkValidity: () => true },
    "input[name='weekly_email']": { checked: false },
    "input[name='publication_notifications']": { checked: false },
  };
  const form = {
    action: endpoint,
    dataset: { epubSku: sku },
    matches: selector => selector === "[data-epub-checkout]",
    querySelector: selector => fields[selector] || null,
  };
  let handler;
  let prevented = false;
  vm.runInNewContext(source, {
    URL, URLSearchParams,
    document: { addEventListener(event, callback) { assert.equal(event, "submit"); handler = callback; } },
    window: { crypto: { randomUUID: () => "test-request-id" }, location: { assign(url) { navigations.push(url); } } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ checkout_url: returnedUrl }) };
    },
  });
  handler({ target: form, preventDefault() { prevented = true; } });
  await new Promise(resolve => setImmediate(resolve));
  return { requests, navigations, button, status, prevented };
}

test("PENDING and every existing e-book submit the exact SKU and open Square", async () => {
  for (const sku of ["OIP-PENDING-EPUB", "OIP-TD-EPUB", "OIP-AN-EPUB", "OIP-PS-EPUB", "OIP-WC-EPUB"]) {
    const result = await submit(sku);
    assert.equal(result.prevented, true, sku);
    assert.equal(result.requests.length, 1, `${sku} has one checkout request and no optional signup`);
    const { url, options } = result.requests[0];
    assert.equal(url, endpoint);
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers["Idempotency-Key"], "test-request-id");
    assert.deepEqual(JSON.parse(options.body), { sku, country_code: "US", email: "reader@example.com" });
    assert.deepEqual(result.navigations, [checkoutUrl]);
    assert.equal(result.button.disabled, true, "duplicate submissions stay disabled during navigation");
  }
});

test("the PENDING exception does not admit arbitrary long or malformed SKU names", async () => {
  for (const sku of ["OIP-UNKNOWN-EPUB", "OIP-PENDING-PB", "OIP-pending-EPUB"]) {
    const result = await submit(sku);
    assert.equal(result.requests.length, 0, sku);
    assert.deepEqual(result.navigations, []);
  }
});

test("PENDING retains the existing Square-only redirect boundary", async () => {
  const result = await submit("OIP-PENDING-EPUB", "https://example.com/checkout");
  assert.equal(result.requests.length, 1);
  assert.deepEqual(result.navigations, []);
  assert.equal(result.button.disabled, false);
  assert.match(result.status.textContent, /Secure checkout could not be opened/);
});
