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
const fieldNames = ["utm_campaign", "utm_medium", "utm_source", "metadata__oip_segment", "metadata__oip_post"];
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
  const fields = Object.fromEntries(fieldNames.map(name => [name, {type: "hidden", value: "", disabled: true}]));
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
    window, counts, storage, fields,
    get storageAccesses() { return storageAccesses; },
    submit(sourceSlot = `funnel_${location.pathname.split("/")[2]}`) {
      // Form values exist, but must never be read into analytics or storage.
      listeners.get("submit")?.({ target: {
        matches: selector => selector === "[data-analytics-event]",
        dataset: { analyticsEvent: "newsletter_submit", analyticsSourceSlot: sourceSlot },
        elements: { ...fields, email: { get value() { throw new Error("Email must never be read by analytics"); } } }
      }, preventDefault() { throw new Error("Native submit must remain intact"); } });
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

test("Every allowed platform and route-matched numbered or bio code reaches the five optional native fields", () => {
  for (const platform of ["facebook", "instagram", "linkedin", "pinterest", "x"]) {
    for (const segment of bioSegments) {
      for (const suffix of ["01", "02", "03", "04", "bio"]) {
        const post = `${segment}-${suffix}`;
        const view = load({url: campaign(platform, segment, post)});
        assert.ok(Object.values(view.fields).every(field => field.disabled && field.value === ""));
        const original = view.storage.get(storageKey);
        view.submit();
        assert.deepEqual(Object.fromEntries(Object.entries(view.fields).map(([key, field]) => [key, field.value])), {
          utm_campaign: "almanack-organic", utm_medium: "organic_social", utm_source: platform,
          metadata__oip_segment: segment, metadata__oip_post: post
        });
        assert.ok(Object.values(view.fields).every(field => !field.disabled));
        assert.equal(view.storage.get(storageKey), original);
      }
    }
  }
});

test("A long visit to the original tagged URL cannot reset expiry on submit, including repeat attempts", () => {
  const clock = {now: entryTime};
  const view = load({url: campaign("linkedin", "dialogue", "dialogue-bio"), clock});
  const original = view.storage.get(storageKey);
  clock.now += 20 * 60 * 1000;
  view.submit();
  assert.equal(view.storage.get(storageKey), original);
  assert.equal(view.fields.metadata__oip_post.value, "dialogue-bio");
  clock.now = entryTime + retentionMs;
  view.submit();
  assert.ok(Object.values(view.fields).every(field => field.disabled && field.value === ""));
  assert.equal(view.storage.size, 0);
  assert.equal(view.counts.at(-1).referrer, "direct_unknown");
});

test("Absent, invalid, duplicate, mismatched, and expired state omits every optional field", () => {
  const url = campaign("facebook", "weekend", "weekend-01");
  const cases = [
    {}, {url: url.replace("facebook", "unknown")}, {url: url.replace("weekend-01", "dialogue-01")},
    ...["utm_source", "utm_medium", "utm_campaign", "utm_content"].map(name => ({url: `${url}&${name}=duplicate`})),
    {storage: new Map([[storageKey, JSON.stringify({platform: "facebook", segment: "dialogue", post: "weekend-01", expires: entryTime + retentionMs})]])},
    {storage: new Map([[storageKey, JSON.stringify({platform: "facebook", segment: "weekend", post: "weekend-01", expires: entryTime})]])}
  ];
  for (const options of cases) {
    const view = load(options);
    view.submit();
    assert.ok(Object.values(view.fields).every(field => field.disabled && field.value === ""));
  }
});

test("Sample and homepage navigation reuse state without extending expiry or guessing a source", () => {
  const storage = new Map();
  const clock = {now: entryTime};
  load({url: campaign("pinterest", "everyday-history", "everyday-history-bio"), storage, clock});
  const original = storage.get(storageKey);
  clock.now += 10 * 60 * 1000;
  for (const path of ["/almanack/2026-07-25/", "/"]) {
    const view = load({url: origin + path, storage, clock});
    view.submit(path === "/" ? "homepage_reader_banner" : "almanack_issue_exit_newsletter");
    assert.equal(view.fields.utm_source.value, "pinterest");
    assert.equal(storage.get(storageKey), original);
  }
  const unknown = load({referrer: "https://facebook.com/a-referral"});
  unknown.submit();
  assert.ok(Object.values(unknown.fields).every(field => field.disabled));
});

test("Analytics off and storage denial preserve native signup with the appropriate optional fields", () => {
  const url = campaign("x", "weekend", "weekend-04");
  const off = load({url, enabled: false});
  off.submit();
  assert.ok(Object.values(off.fields).every(field => field.disabled && field.value === ""));
  assert.equal(off.storageAccesses, 0);
  const denied = load({url, denyStorage: true});
  denied.submit();
  assert.equal(denied.fields.utm_source.value, "x");
  assert.equal(denied.fields.metadata__oip_post.value, "weekend-04");
});

test("Both real form templates start with exactly five empty disabled acquisition fields for no-JS signup", () => {
  for (const path of ["newsletter_signup.html", "home_reader_newsletter.html"]) {
    const template = fs.readFileSync(new URL(`../layouts/partials/${path}`, import.meta.url), "utf8");
    const controls = [...template.matchAll(/<input\b[^>]*name="(utm_[^"]+|metadata__[^"]+)"[^>]*>/g)];
    assert.deepEqual(controls.map(match => match[1]), fieldNames);
    for (const [markup] of controls) {
      assert.match(markup, /type="hidden"/);
      assert.match(markup, /value=""/);
      assert.match(markup, /\bdisabled\b/);
      assert.doesNotMatch(markup, /\brequired\b/);
    }
    assert.match(template, /method="post"/);
    assert.match(template, /name="embed" value="1"/);
    assert.match(template, /name="tag"/);
    assert.match(template, /type="email"[\s\S]*?\brequired\b/);
  }
});
