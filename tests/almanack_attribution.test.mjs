import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const script = fs.readFileSync(new URL("../assets/js/analytics.js", import.meta.url), "utf8");
const origin = "https://outsideinprint.org";
const storageKey = "oip.almanack-acquisition.v1";
const entryTime = Date.parse("2026-10-01T12:00:00Z");
const retentionMs = 30 * 60 * 1000;
const bioSegments = ["weekend", "everyday-history", "dialogue"];
const newEntries = [["pinterest", "weekend", "weekend-01"], ...bioSegments.map(segment => ["instagram", segment, `${segment}-bio`])];

function campaign(platform, segment, post) {
  return `${origin}/subscribe/${segment}/?utm_source=${platform}&utm_medium=organic_social&utm_campaign=almanack-organic&utm_content=${post}`;
}

function label(platform, segment, post) {
  return `almanack-organic|platform=${platform}|segment=${segment}|post=${post}`;
}

// Execute the production adapter without network access, a provider form, or timers.
function load({ url, storage = new Map(), clock = { now: entryTime }, enabled = true, referrer = "", denyStorage = false } = {}) {
  const location = new URL(url || `${origin}/subscribe/weekend/`);
  const counts = [];
  const listeners = new Map();
  let storageAccesses = 0;
  const window = {
    location,
    oipAnalytics: { enabled, page: { path: location.pathname, title: "Bob's Almanack", eligibleRead: false } },
    goatcounter: { count: payload => counts.push(JSON.parse(JSON.stringify(payload))) },
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {}
  };
  Object.defineProperty(window, "sessionStorage", { get() {
    storageAccesses++;
    if (denyStorage) throw new Error("Storage denied");
    return {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    };
  } });
  const document = {
    referrer,
    querySelector: () => null,
    addEventListener: (name, handler) => listeners.set(name, handler)
  };
  vm.runInNewContext(script, { window, document, URL, URLSearchParams, Date: { now: () => clock.now } });
  return {
    window, counts, storage,
    get storageAccesses() { return storageAccesses; },
    submit() {
      // Form values exist, but must never be read into analytics or storage.
      listeners.get("submit")?.({ target: {
        matches: selector => selector === "[data-analytics-event]",
        dataset: { analyticsEvent: "newsletter_submit", analyticsSourceSlot: `funnel_${location.pathname.split("/")[2]}` },
        elements: { email: { value: "SUBSCRIBER_PII_SENTINEL@example.com" } }
      } });
    }
  };
}

test("Almanack accepts Pinterest and preserves every existing platform and numbered post code", () => {
  for (const platform of ["facebook", "instagram", "linkedin", "pinterest", "x"]) {
    for (const segment of ["weekend", "everyday-history", "dialogue"]) {
      for (const number of ["01", "02", "03", "04"]) {
        const post = `${segment}-${number}`;
        const view = load({ url: campaign(platform, segment, post) });
        const expected = label(platform, segment, post);
        assert.equal(view.window.goatcounter.referrer(), expected);
        assert.equal(view.window.goatcounter.path(), `/subscribe/${segment}/`);
        assert.equal(view.counts.length, 1);
        assert.match(view.counts[0].path, /^oip:funnel_view\|/);
        assert.equal(view.counts[0].referrer, expected);
        assert.deepEqual(JSON.parse(view.storage.get(storageKey)), {
          platform, segment, post, expires: entryTime + retentionMs
        });
      }
    }
  }
});

test("Almanack shared bios have three route-matched fixed codes distinct from post 01", () => {
  for (const segment of bioSegments) {
    const code = `${segment}-bio`;
    const bio = load({ url: campaign("instagram", segment, code) });
    const post = load({ url: campaign("instagram", segment, `${segment}-01`) });
    assert.equal(bio.window.goatcounter.referrer(), label("instagram", segment, code));
    assert.notEqual(bio.window.goatcounter.referrer(), post.window.goatcounter.referrer());
    assert.equal(JSON.parse(bio.storage.get(storageKey)).post, code);
    for (const other of bioSegments.filter(other => other !== segment)) {
      const view = load({ url: campaign("instagram", other, code) });
      assert.equal(view.window.goatcounter.referrer(), "direct_unknown");
      assert.equal(view.storage.size, 0);
    }
    const arbitrary = load({ url: campaign("instagram", segment, `${code}-arbitrary`) });
    assert.equal(arbitrary.window.goatcounter.referrer(), "direct_unknown");
    assert.equal(arbitrary.storage.size, 0);
  }
  const unknown = load({ url: campaign("instagram", "unknown", "unknown-bio") });
  assert.equal(unknown.window.goatcounter.referrer(), "direct_unknown");
  assert.equal(unknown.storage.size, 0);
});

test("Pinterest and bio entries survive sample navigation without extending thirty-minute retention", () => {
  for (const [platform, segment, post] of newEntries) {
    const storage = new Map();
    const clock = { now: entryTime };
    const tagged = campaign(platform, segment, post);
    const expected = label(platform, segment, post);
    load({ url: tagged, storage, clock });
    const original = storage.get(storageKey);
    clock.now += 10 * 60 * 1000;
    const sample = load({ url: `${origin}/essays/after-the-cup-falls/`, referrer: tagged, storage, clock });
    assert.equal(sample.window.goatcounter.referrer(), expected);
    assert.equal(storage.get(storageKey), original);
    clock.now = entryTime + retentionMs - 1;
    const returned = load({ url: `${origin}/subscribe/${segment}/`, referrer: `${origin}/essays/after-the-cup-falls/`, storage, clock });
    assert.equal(returned.window.goatcounter.referrer(), expected);
    assert.equal(storage.get(storageKey), original);
    clock.now++;
    returned.submit();
    assert.equal(returned.counts.at(-1).referrer, "internal", "Long page visits must also expire at the boundary.");
    assert.equal(storage.size, 0);
    const expired = load({ referrer: `${origin}/subscribe/weekend/`, storage, clock });
    assert.equal(expired.window.goatcounter.referrer(), "internal");
  }
});

test("A valid new entry replaces the prior source and sets its own bounded expiry", () => {
  const storage = new Map();
  const clock = { now: entryTime };
  load({ url: campaign("pinterest", "weekend", "weekend-01"), storage, clock });
  clock.now += 5 * 60 * 1000;
  const next = load({ url: campaign("instagram", "weekend", "weekend-bio"), storage, clock });
  assert.equal(next.window.goatcounter.referrer(), label("instagram", "weekend", "weekend-bio"));
  assert.equal(JSON.parse(storage.get(storageKey)).expires, clock.now + retentionMs);
});

test("Invalid, incomplete, and duplicate campaign parameters clear prior attribution without leaking values", () => {
  const valid = campaign("pinterest", "weekend", "weekend-01");
  const invalid = [
    valid.replace("pinterest", "Pinterest"),
    valid.replace("pinterest", "UNREGISTERED_PLATFORM_SENTINEL"),
    valid.replace("weekend-01", "QUERY_PII_SENTINEL"),
    valid.replace("weekend-01", "weekend-05"),
    valid.replace("weekend-01", "dialogue-01"),
    valid.replace("organic_social", "social"),
    valid.replace("almanack-organic", "OTHER_CAMPAIGN_SENTINEL"),
    `${origin}/subscribe/weekend/?utm_source=ig&utm_medium=social&utm_content=link_in_bio`,
    valid.replace("/subscribe/weekend/", "/essays/after-the-cup-falls/"),
    ...["utm_source=pinterest", "utm_medium=organic_social", "utm_campaign=almanack-organic", "utm_content=weekend-01"].map(parameter => `${valid}&${parameter}`)
  ];
  for (const url of invalid) {
    const storage = new Map();
    load({ url: valid, storage });
    const view = load({ url, storage });
    assert.equal(view.window.goatcounter.referrer(), "direct_unknown", url);
    assert.equal(storage.size, 0, url);
    assert.doesNotMatch(JSON.stringify(view.counts), /SENTINEL|utm_/);
  }
});

test("Stored attribution rejects extra fields, unknown codes, corrupt data, and invalid expiry", () => {
  const valid = { platform: "pinterest", segment: "weekend", post: "weekend-01", expires: entryTime + retentionMs };
  const invalid = [
    JSON.stringify({ ...valid, email: "STORED_PII_SENTINEL@example.com" }),
    JSON.stringify({ ...valid, post: "weekend-bio-arbitrary" }),
    JSON.stringify({ ...valid, segment: "dialogue", post: "weekend-bio" }),
    JSON.stringify({ ...valid, platform: "ig" }),
    ...[entryTime, entryTime + retentionMs + 1, "later", null].map(expires => JSON.stringify({ ...valid, expires }))
  ];
  for (const value of invalid) {
    const storage = new Map([[storageKey, value]]);
    const view = load({ storage });
    assert.equal(view.window.goatcounter.referrer(), "direct_unknown");
    assert.equal(storage.size, 0);
    assert.doesNotMatch(JSON.stringify(view.counts), /STORED_PII_SENTINEL/);
  }
  const corrupt = load({ storage: new Map([[storageKey, "{corrupt"]]) });
  assert.equal(corrupt.window.goatcounter.referrer(), "direct_unknown");
  assert.doesNotMatch(JSON.stringify(corrupt.counts), /corrupt/);
});

test("Storage denial preserves current-page Pinterest and bio attribution", () => {
  for (const [platform, segment, post] of newEntries) {
    const view = load({ url: campaign(platform, segment, post), denyStorage: true });
    view.submit();
    assert.equal(view.window.goatcounter.referrer(), label(platform, segment, post));
    assert.equal(view.counts.at(-1).referrer, label(platform, segment, post));
  }
});

test("Disabled analytics and unapproved hosts do not access acquisition storage or emit events", () => {
  for (const [platform, segment, post] of newEntries) {
    const url = campaign(platform, segment, post);
    for (const options of [{ url, enabled: false }, { url: url.replace(origin, "https://preview.example") }]) {
      const view = load({ ...options, denyStorage: true });
      view.submit();
      assert.equal(view.storageAccesses, 0);
      assert.equal(view.counts.length, 0);
      assert.equal(view.window.goatcounter.path(), null);
    }
  }
});

test("Pinterest and bio newsletter events remain attempts and contain no subscriber or arbitrary URL data", () => {
  for (const [platform, segment, post] of newEntries) {
    const view = load({ url: `${campaign(platform, segment, post)}&private=URL_PII_SENTINEL#FRAGMENT_PII_SENTINEL` });
    view.submit();
    const attempt = view.counts.at(-1);
    assert.match(attempt.path, /^oip:newsletter_submit\|/);
    assert.equal(attempt.referrer, label(platform, segment, post));
    assert.deepEqual(Object.keys(attempt).sort(), ["event", "path", "referrer", "title"]);
    assert.doesNotMatch(JSON.stringify([...view.counts, [...view.storage]]), /PII_SENTINEL|confirmed|subscription_success|utm_/);
    assert.equal(view.counts.filter(payload => /oip:essay_read/.test(payload.path)).length, 0);
  }
});

test("The Pinterest addition does not broaden the existing 2045-launch allowlist", () => {
  for (const source of ["facebook", "instagram", "linkedin", "x", "buttondown", "pinterest"]) {
    const view = load({ url: `${origin}/shop/2045/?utm_source=${source}&utm_campaign=2045-launch` });
    const expected = source === "buttondown" ? "newsletter-2045-launch" : source === "pinterest" ? "direct_unknown" : "social-2045-launch";
    assert.equal(view.window.goatcounter.referrer(), expected);
    assert.equal(view.storage.size, 0);
  }
});
