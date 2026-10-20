import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/js/epub-checkout.js", import.meta.url), "utf8");
const endpoint = "https://downloads.outsideinprint.org/api/books/epub";
const checkoutUrl = "https://square.link/u/test-checkout";

async function submit(sku, returnedUrl = checkoutUrl, options = {}) {
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
  const timers = new Map();
  let timerSequence = 0;
  if (options.newsletter) {
    fields["input[name='weekly_email']"].checked = true;
    form.dataset.buttondownEndpoint = "https://buttondown.com/api/emails/embed-subscribe/OutsideInPrint";
    form.dataset.weeklyEmailTag = "outside-in-print";
  }
  vm.runInNewContext(source, {
    URL, URLSearchParams,
    document: { addEventListener(event, callback) { assert.equal(event, "submit"); handler = callback; } },
    window: {
      crypto: { randomUUID: () => "test-request-id" }, location: { assign(url) { navigations.push(url); } },
      oipPurchaseAnalytics: options.capture ? { captureCheckoutContext: options.capture } : undefined,
      setTimeout(callback, duration) { const key = ++timerSequence; timers.set(key, { callback, duration }); return key; },
      clearTimeout(key) { timers.delete(key); },
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ checkout_url: returnedUrl }) };
    },
  });
  handler({ target: form, preventDefault() { prevented = true; } });
  await new Promise(resolve => setImmediate(resolve));
  if (options.timeout) {
    assert.equal([...timers.values()][0]?.duration, 300);
    for (const item of [...timers.values()]) item.callback();
    await new Promise(resolve => setImmediate(resolve));
  }
  return { requests, navigations, button, status, prevented, timers };
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

test("valid optional context is attached without changing the checkout or email preference flow", async () => {
  const measurement = { version: 1, consent: "granted", client_id: "123.456", session_id: "1792310400", captured_at: 1792310400 };
  const result = await submit("OIP-PENDING-EPUB", checkoutUrl, { capture: async () => measurement, newsletter: true });
  assert.equal(result.requests.length, 2);
  assert.deepEqual(JSON.parse(result.requests[0].options.body), { sku: "OIP-PENDING-EPUB", country_code: "US", email: "reader@example.com", measurement });
  assert.equal(result.requests[1].url, "https://buttondown.com/api/emails/embed-subscribe/OutsideInPrint");
  assert.match(result.requests[1].options.body, /tag=outside-in-print/);
  assert.deepEqual(result.navigations, [checkoutUrl]);
  assert.equal(result.timers.size, 0);
});

test("absent, rejected, thrown, and malformed optional contexts never block checkout", async () => {
  const throwingValue = new Proxy({}, { ownKeys() { throw new Error("broken adapter"); } });
  for (const capture of [async () => null, async () => { throw new Error("blocked"); }, () => { throw new Error("blocked"); }, async () => ({ email: "private@example.com" }), async () => throwingValue]) {
    const result = await submit("OIP-TD-EPUB", checkoutUrl, { capture, newsletter: true });
    assert.deepEqual(JSON.parse(result.requests[0].options.body), { sku: "OIP-TD-EPUB", country_code: "US", email: "reader@example.com" });
    assert.equal(result.requests.length, 2);
    assert.deepEqual(result.navigations, [checkoutUrl]);
  }
});

test("a hung analytics adapter delays checkout at most 300ms and preserves signup preferences", async () => {
  const result = await submit("OIP-TD-EPUB", checkoutUrl, { capture: () => new Promise(() => {}), timeout: true, newsletter: true });
  assert.equal(JSON.parse(result.requests[0].options.body).measurement, undefined);
  assert.equal(result.requests.length, 2);
  assert.deepEqual(result.navigations, [checkoutUrl]);
});
