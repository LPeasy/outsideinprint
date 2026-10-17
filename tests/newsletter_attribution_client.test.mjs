import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/js/newsletter-attribution.js", import.meta.url), "utf8");
const storageKey = "oip.newsletter-attribution.v1";
const campaign = { code: "fb-post-01", utm_campaign: "fb-post-01", utm_source: "facebook", utm_medium: "organic_social", utm_content: "" };
const tagged = "?utm_campaign=fb-post-01&utm_source=facebook&utm_medium=organic_social&email=private%40example.com#private";

function setup(options = {}) {
  let now = 1800000000000;
  let sequence = 0;
  const values = options.values || new Map();
  const writes = [];
  const listeners = new Map();
  const timers = new Map();
  const requests = [];
  const status = { hidden: true, textContent: "" };
  const button = { disabled: false, setAttribute() {}, removeAttribute() {} };
  const email = { value: "reader@example.com", checkValidity: () => true, reportValidity() {} };
  const inputs = new Map([["email", email], ["website", { value: "" }]]);
  const form = {
    isConnected: true,
    action: "https://buttondown.com/api/emails/embed-subscribe/OutsideInPrint",
    matches: selector => selector === "form[data-newsletter-attribution]",
    querySelector(selector) {
      if (selector === 'button[type="submit"]') return button;
      if (selector === "[data-newsletter-attribution-status]") return status;
      return inputs.get(selector.match(/^input\[name="(.+)"\]$/)?.[1]) || null;
    },
    appendChild(node) { inputs.set(node.name, node); }
  };
  const config = {
    enabled: true, endpoint: "https://newsletter.example.test/signup", storageEnabled: true,
    pagePath: "/subscribe/weekend/", campaigns: [campaign], ...options.config
  };
  const document = {
    querySelector: () => ({ textContent: JSON.stringify(config) }),
    querySelectorAll: () => [form],
    createElement: () => ({}),
    addEventListener(type, callback) { listeners.set(type, [...listeners.get(type) || [], callback]); }
  };
  const window = {
    location: { search: options.search || "", pathname: "/subscribe/weekend/" },
    navigator: options.navigator || {},
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` },
    sessionStorage: {
      getItem(key) { if (options.denyStorage) throw new Error("Denied"); return values.get(key) || null; },
      setItem(key, value) { if (options.denyStorage) throw new Error("Denied"); writes.push(value); values.set(key, value); },
      removeItem(key) { if (options.denyStorage) throw new Error("Denied"); values.delete(key); }
    },
    setTimeout(callback) { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, init) {
      requests.push({ url, ...init });
      if (options.fetch) return options.fetch(url, init);
      return { ok: true, json: async () => ({ ok: true }) };
    }
  };
  if (options.consent) window.oipNewsletterAttributionStorageAllowed = options.consent;
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { document, window, URL, URLSearchParams, Date: Clock, AbortController, Uint8Array });
  function dispatch(type, event = {}) { return Promise.all((listeners.get(type) || []).map(callback => callback(event))); }
  async function submit() {
    let prevented = false;
    await dispatch("submit", { target: form, preventDefault() { prevented = true; } });
    return prevented;
  }
  return { config, window, values, writes, requests, form, inputs, status, button, email, timers, dispatch, submit,
    advance(ms) { now += ms; }, payload() { return JSON.parse(requests.at(-1).body); }
  };
}

test("disabled switch preserves the existing embedded form and creates no tracking state", async () => {
  const page = setup({ config: { enabled: false }, search: tagged });
  assert.equal(await page.submit(), false);
  assert.equal(page.requests.length, 0);
  assert.equal(page.values.size, 0);
  assert.match(page.form.action, /buttondown.com/);
});

test("tagged signup sends only approved campaign fields, canonical path, and a random reference", async () => {
  const page = setup({ search: tagged });
  assert.equal(await page.submit(), true);
  assert.equal(page.requests.length, 1);
  assert.deepEqual(page.payload(), {
    campaign_code: "fb-post-01", utm_campaign: "fb-post-01", utm_source: "facebook", utm_medium: "organic_social",
    utm_content: "", landing_path: "/subscribe/weekend/", email: "reader@example.com", website: "",
    signup_ref: "00000000-0000-4000-8000-000000000001"
  });
  const request = page.requests[0];
  assert.equal(request.headers["Idempotency-Key"], page.payload().signup_ref);
  assert.equal(request.credentials, "omit");
  assert.equal(request.referrerPolicy, "no-referrer");
  assert.equal(page.status.textContent, "Check your inbox for any next steps.");
  assert.equal(page.button.disabled, true);
  assert.doesNotMatch(page.writes.join(""), /email|private|example\.com|https?:/);
});

test("untagged signup records unknown and never guesses from referrers", async () => {
  const page = setup();
  await page.submit();
  assert.equal(page.payload().campaign_code, "");
  assert.equal(page.payload().landing_path, "");
});

test("ordinary navigation retains a tagged arrival and a newer explicit campaign replaces it", async () => {
  const first = setup({ search: tagged });
  const next = setup({ values: first.values, config: { pagePath: "/essays/reading/" } });
  await next.submit();
  assert.equal(next.payload().campaign_code, campaign.code);
  assert.equal(next.payload().landing_path, "/subscribe/weekend/");
  const other = { ...campaign, code: "ig-bio", utm_campaign: "ig-bio", utm_source: "instagram" };
  const latest = setup({ values: first.values, search: "?utm_campaign=ig-bio&utm_source=instagram&utm_medium=organic_social",
    config: { campaigns: [campaign, other], pagePath: "/essays/latest/" } });
  await latest.submit();
  assert.equal(latest.payload().campaign_code, "ig-bio");
  assert.equal(latest.payload().landing_path, "/essays/latest/");
});

test("attribution expires after inactivity, while actual activity refreshes its lifetime", async () => {
  const expired = setup({ search: tagged });
  expired.advance(30 * 60 * 1000);
  await expired.submit();
  assert.equal(expired.payload().campaign_code, "");
  assert.equal(expired.values.has(storageKey), false);
  const active = setup({ search: tagged });
  active.advance(29 * 60 * 1000);
  await active.dispatch("keydown");
  active.advance(29 * 60 * 1000);
  await active.submit();
  assert.equal(active.payload().campaign_code, campaign.code);
});

test("blocked storage and privacy choices use current-page tags only", async () => {
  for (const options of [{ denyStorage: true }, { config: { storageEnabled: false } }, { navigator: { globalPrivacyControl: true } }, { consent: () => false }]) {
    const first = setup({ search: tagged, ...options });
    await first.submit();
    assert.equal(first.payload().campaign_code, campaign.code);
    assert.equal(first.values.size, 0);
    const next = setup({ ...options, values: new Map([[storageKey, JSON.stringify({ ...first.payload(), last_activity: 1800000000000 })]]) });
    await next.submit();
    assert.equal(next.payload().campaign_code, "");
  }
});

test("privacy withdrawal drops carried attribution and clears the session record", async () => {
  const first = setup({ search: tagged });
  let allowed = true;
  const next = setup({ values: first.values, consent: () => allowed });
  allowed = false;
  await next.dispatch("oip:privacy-change");
  await next.submit();
  assert.equal(next.payload().campaign_code, "");
  assert.equal(next.values.has(storageKey), false);
});

test("unknown, duplicate, ambiguous, and unsafe tags never get a campaign assignment", async () => {
  for (const search of [tagged + "&utm_campaign=fb-post-01", tagged.replace("facebook", "unknown"), "?utm_campaign=secret@example.com"]) {
    const first = setup({ search: tagged });
    const page = setup({ search, values: first.values });
    await page.submit();
    assert.equal(page.payload().campaign_code, "");
    assert.equal(page.values.has(storageKey), false);
  }
  const ambiguous = setup({ search: tagged, config: { campaigns: [campaign, { ...campaign, code: "another-code" }] } });
  await ambiguous.submit();
  assert.equal(ambiguous.payload().campaign_code, "");
  const unsafe = setup({ search: tagged, config: { pagePath: "/reader@example.com/?email=private" } });
  await unsafe.submit();
  assert.equal(unsafe.payload().landing_path, "");
});

test("tampered session state cannot smuggle additional fields or expired state", async () => {
  const first = setup({ search: tagged });
  const saved = JSON.parse(first.values.get(storageKey));
  for (const corrupt of [{ ...saved, email: "private@example.com" }, { ...saved, last_activity: 1 }, { ...saved, utm_source: "secret" }]) {
    const page = setup({ values: new Map([[storageKey, JSON.stringify(corrupt)]]) });
    await page.submit();
    assert.equal(page.payload().campaign_code, "");
  }
});

test("success appears only after an accepted Worker response", async () => {
  let resolve;
  const page = setup({ fetch: () => new Promise(done => { resolve = done; }) });
  const submitting = page.submit();
  assert.equal(page.status.textContent, "Sending your request…");
  assert.equal(page.button.disabled, true);
  resolve({ ok: true, json: async () => ({ ok: true }) });
  await submitting;
  assert.equal(page.status.textContent, "Check your inbox for any next steps.");
});

test("provider uncertainty retries the same exact body and key with no second signup path", async () => {
  let count = 0;
  const page = setup({ search: tagged, fetch: async () => {
    count += 1;
    if (count === 1) throw new TypeError("Network unavailable");
    if (count === 2) return { ok: false, json: async () => ({ ok: false, code: "retry_same_submission" }) };
    return { ok: true, json: async () => ({ ok: true }) };
  } });
  await page.submit();
  assert.match(page.status.textContent, /could not confirm/);
  assert.equal(page.button.disabled, false);
  page.advance(31 * 60 * 1000);
  await page.submit();
  await page.submit();
  assert.equal(page.requests.length, 3);
  assert.equal(new Set(page.requests.map(request => request.body)).size, 1);
  assert.equal(new Set(page.requests.map(request => request.headers["Idempotency-Key"])).size, 1);
  assert.ok(page.requests.every(request => request.url === "https://newsletter.example.test/signup"));
});

test("timeout keeps the pending reference available for retry", async () => {
  const page = setup({ fetch: (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("Timeout")));
  }) });
  const submitting = page.submit();
  for (const callback of page.timers.values()) callback();
  await submitting;
  assert.equal(page.button.disabled, false);
  assert.match(page.status.textContent, /could not confirm/);
  assert.equal(page.inputs.get("signup_ref").value, page.payload().signup_ref);
});

test("an HTTP success without explicit acceptance is not signup success", async () => {
  const page = setup({ fetch: async () => ({ ok: true, json: async () => ({ queued: true }) }) });
  await page.submit();
  assert.match(page.status.textContent, /could not confirm/);
  assert.equal(page.button.disabled, false);
});
