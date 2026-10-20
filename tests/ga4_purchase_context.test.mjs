import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/js/ga4-purchase-context.js", import.meta.url), "utf8");
const id = "G-TEST123456";
const choiceKey = "oip.purchase-measurement.v1";
const now = 1_792_310_400_000;
const storedChoice = choice => JSON.stringify({ version: 1, choice, updated_at: now / 1000 });

function browser(options = {}) {
  const scripts = [];
  const cookieWrites = [];
  const documentListeners = new Map();
  const windowListeners = new Map();
  const timers = new Map();
  const storage = new Map(options.choice ? [[choiceKey, storedChoice(options.choice)]] : []);
  let sequence = 0;
  let config = { enabled: true, measurementId: id, page: { path: "/shop/example/", title: "Example EPUB" }, ...options.config };
  const node = { get textContent() { return JSON.stringify(config); } };
  function control(value) {
    return { closest: () => controlNodes[value], hasAttribute: name => name === "data-purchase-preferences" && value === "preferences", getAttribute: () => value, focus() {} };
  }
  const controlNodes = { granted: control("granted"), denied: control("denied"), preferences: control("preferences") };
  const status = { textContent: "" };
  const panel = { hidden: true, querySelector: selector => selector.includes("status") ? status : controlNodes.granted };
  const preferences = { hidden: true, setAttribute() {}, focus() {} };
  const document = {
    referrer: options.referrer || "https://www.google.com/search?q=private&email=reader@example.com",
    querySelector: selector => selector.includes("route-config") ? node : selector === "[data-purchase-consent]" ? panel : selector === "[data-purchase-preferences]" ? preferences : null,
    createElement: () => ({ setAttribute() {} }),
    head: { appendChild(script) { scripts.push(script); } },
    addEventListener(type, callback) { documentListeners.set(type, callback); },
    set cookie(value) { cookieWrites.push(value); },
  };
  const window = {
    location: new URL(options.url || "https://outsideinprint.org/shop/example/?email=reader@example.com#private"),
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    addEventListener(type, callback) { windowListeners.set(type, callback); },
    setTimeout(callback, duration) { const key = ++sequence; timers.set(key, { callback, duration }); return key; },
    clearTimeout(key) { timers.delete(key); },
  };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ window, document, URL, URLSearchParams, Date: Clock });
  vm.runInContext(source, context);
  return {
    window, scripts, cookieWrites, storage, panel, preferences, timers,
    commands: () => Array.from(window.oipPurchaseDataLayer || [], args => Array.from(args)),
    click(value) { documentListeners.get("click")?.({ target: controlNodes[value] }); },
    timeout() { for (const item of Array.from(timers.values())) item.callback(); },
    route(path, title = "Next page") { config = { ...config, page: { path, title } }; window.location = new URL(path, "https://outsideinprint.org"); documentListeners.get("oip:route")?.(); },
    reloadScript() { vm.runInContext(source, context); },
    storageChoice(choice) { if (choice) storage.set(choiceKey, storedChoice(choice)); else storage.delete(choiceKey); windowListeners.get("storage")?.({ key: choiceKey }); },
    callback(field, value) { const command = this.commands().findLast(args => args[0] === "get" && args[2] === field); assert.ok(command, field); command[3](value); },
  };
}

const events = env => env.commands().filter(args => args[0] === "event");
const plain = value => value && JSON.parse(JSON.stringify(value));

test("disabled, local, HTTP, and alternate hosts never load Google or create analytics state", async () => {
  for (const options of [{ config: { enabled: false } }, { config: { measurementId: "" } }, { url: "http://outsideinprint.org/" }, { url: "https://www.outsideinprint.org/" }, { url: "http://localhost:1313/" }]) {
    const env = browser({ ...options, choice: "granted" });
    env.click("granted");
    assert.equal(env.scripts.length, 0);
    assert.equal(env.cookieWrites.length, 0);
    assert.equal(env.window.oipPurchaseDataLayer, undefined);
    assert.equal(await env.window.oipPurchaseAnalytics.captureCheckoutContext(), null);
  }
});

test("unknown and declined choices send no tag request or cookie, with equal reusable choices", async () => {
  const env = browser();
  assert.equal(env.panel.hidden, false);
  assert.equal(env.scripts.length, 0);
  assert.equal(env.storage.size, 0);
  env.click("denied");
  assert.equal(env.scripts.length, 0);
  assert.equal(env.cookieWrites.length, 0);
  assert.equal(env.window.oipPurchaseDataLayer, undefined);
  assert.equal(env.preferences.hidden, false);
  assert.deepEqual(JSON.parse(env.storage.get(choiceKey)), { version: 1, choice: "denied", updated_at: now / 1000 });
  assert.equal(await env.window.oipPurchaseAnalytics.captureCheckoutContext(), null);
  env.click("preferences");
  assert.equal(env.panel.hidden, false);
});

test("opt-in loads one tag with ads denied, auto page view off and sanitized global and event fields", () => {
  const env = browser();
  env.click("granted");
  env.click("granted");
  env.reloadScript();
  assert.equal(env.scripts.length, 1);
  assert.equal(env.scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${id}&l=oipPurchaseDataLayer`);
  assert.equal(env.scripts[0].referrerPolicy, "no-referrer");
  const commands = env.commands();
  const configuration = commands.find(args => args[0] === "config")[2];
  assert.equal(configuration.send_page_view, false);
  assert.equal(configuration.allow_google_signals, false);
  assert.equal(configuration.allow_ad_personalization_signals, false);
  assert.equal(configuration.page_location, "https://outsideinprint.org/shop/example/");
  assert.equal(configuration.page_referrer, "https://www.google.com/");
  for (const args of commands.filter(args => args[0] === "consent")) {
    assert.equal(args[2].ad_storage, "denied");
    assert.equal(args[2].ad_user_data, "denied");
    assert.equal(args[2].ad_personalization, "denied");
  }
  assert.equal(events(env).length, 1);
  assert.equal(events(env)[0][1], "page_view");
  assert.equal(JSON.stringify(commands).includes("reader@example"), false);
});

test("valid remembered consent loads once and route events do not duplicate views on remount", () => {
  const env = browser({ choice: "granted", url: "https://outsideinprint.org/shop/example/?srsltid=Real_merchant-123" });
  assert.equal(env.scripts.length, 1);
  env.route("/shop/example/");
  env.reloadScript();
  assert.equal(events(env).length, 1);
  env.route("/essays/example/", "An essay");
  assert.equal(events(env).length, 2);
  assert.equal(events(env).at(-1)[2].page_referrer, "https://outsideinprint.org/");
  env.route("/essays/example/", "An essay");
  assert.equal(events(env).length, 2);
  env.route("/shop/example/");
  assert.equal(events(env).length, 3);
  assert.equal(env.scripts.length, 1);
});

test("only a single bounded supplied landing srsltid survives, and never arbitrary query/hash or title data", () => {
  for (const query of ["srsltid=Real_merchant-123&email=reader@example.com", "srsltid=one&srsltid=two", "srsltid=unsafe%40example.com", "srsltid=" + "A".repeat(257)]) {
    const env = browser({ choice: "granted", url: "https://outsideinprint.org/shop/example/?" + query + "#private" });
    const page = events(env)[0][2];
    assert.equal(page.page_location, "https://outsideinprint.org/shop/example/" + (query.startsWith("srsltid=Real_") ? "?srsltid=Real_merchant-123" : ""));
    env.route("/essays/example/", "<private>reader@example.com");
    assert.equal(events(env).at(-1)[2].page_title, "Outside In Print");
    assert.equal(events(env).at(-1)[2].page_location, "https://outsideinprint.org/essays/example/");
  }
});

test("checkout context needs both genuine callbacks and emits begin_checkout but never purchase", async () => {
  const env = browser({ choice: "granted" });
  const result = env.window.oipPurchaseAnalytics.captureCheckoutContext();
  env.callback("client_id", "123.456");
  env.callback("session_id", 1792310400);
  assert.deepEqual(plain(await result), { version: 1, consent: "granted", client_id: "123.456", session_id: "1792310400", captured_at: now / 1000 });
  assert.deepEqual(events(env).map(args => args[1]), ["page_view", "begin_checkout"]);
  assert.equal(env.timers.size, 0);
  assert.equal(events(env).some(args => args[1] === "purchase"), false);
});

test("blocked tags, absent callbacks and malformed IDs fail closed within 250ms", async () => {
  const env = browser({ choice: "granted" });
  const pending = env.window.oipPurchaseAnalytics.captureCheckoutContext();
  assert.equal([...env.timers.values()][0].duration, 250);
  env.timeout();
  assert.equal(await pending, null);
  for (const [field, value] of [["client_id", "reader@example.com"], ["client_id", "123.456.789"], ["client_id", 123], ["session_id", "abc"], ["session_id", Infinity], ["session_id", "1".repeat(21)]]) {
    const result = env.window.oipPurchaseAnalytics.captureCheckoutContext();
    env.callback(field, value);
    assert.equal(await result, null);
  }
});

test("withdrawal resolves waiting checkouts with null, disables GA and invalidates stale callbacks", async () => {
  const env = browser({ choice: "granted" });
  const result = env.window.oipPurchaseAnalytics.captureCheckoutContext();
  env.callback("client_id", "123.456");
  const sessionCallback = env.commands().findLast(args => args[0] === "get" && args[2] === "session_id")[3];
  env.click("denied");
  sessionCallback("1792310400");
  assert.equal(await result, null);
  assert.equal(await env.window.oipPurchaseAnalytics.captureCheckoutContext(), null);
  assert.equal(env.window["ga-disable-" + id], true);
  assert.equal(env.cookieWrites.length, 6);
  assert.equal(env.commands().at(-1)[2].analytics_storage, "denied");
  const count = events(env).length;
  env.route("/essays/new/");
  assert.equal(events(env).length, count);
  env.click("granted");
  assert.equal(env.scripts.length, 1);
  assert.equal(env.window["ga-disable-" + id], false);
});

test("withdrawal drops an unloaded tag's old events; regrant queues fresh safe config using one script", async () => {
  const env = browser({ choice: "granted" });
  const queue = env.window.oipPurchaseDataLayer;
  const result = env.window.oipPurchaseAnalytics.captureCheckoutContext();
  assert.deepEqual(events(env).map(args => args[1]), ["page_view", "begin_checkout"]);
  env.click("denied");
  assert.equal(await result, null);
  assert.equal(env.window.oipPurchaseDataLayer, queue);
  assert.equal(env.commands().length, 1);
  assert.equal(env.commands()[0][0], "consent");
  env.route("/essays/fresh/");
  env.click("granted");
  assert.equal(env.scripts.length, 1);
  assert.equal(env.commands().filter(args => args[0] === "get").length, 0);
  assert.equal(env.commands().filter(args => args[0] === "config").length, 1);
  assert.deepEqual(events(env).map(args => args[1]), ["page_view"]);
  assert.equal(events(env)[0][2].page_location, "https://outsideinprint.org/essays/fresh/");
});

test("withdrawal does not overwrite the loaded tag's observed queue", async () => {
  const env = browser({ choice: "granted" });
  env.scripts[0].onload();
  const count = env.commands().length;
  env.click("denied");
  assert.equal(env.commands().length, count + 1);
  assert.equal(env.window["ga-disable-" + id], true);
  assert.equal(await env.window.oipPurchaseAnalytics.captureCheckoutContext(), null);
});

test("cross-tab withdrawal and clearing consent cancel pending context", async () => {
  for (const choice of ["denied", null]) {
    const env = browser({ choice: "granted" });
    const result = env.window.oipPurchaseAnalytics.captureCheckoutContext();
    env.storageChoice(choice);
    assert.equal(await result, null);
    assert.equal(env.window["ga-disable-" + id], true);
  }
});
