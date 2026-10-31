import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { buildShareFixture } from "./helpers/almanack_share_fixture.mjs";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const eligibility = read("layouts/partials/article/share-eligible.html");
const share = read("layouts/partials/article/share.html");
const shareScript = read("layouts/partials/article/share-script.html");
const client = read("assets/js/piece-share.js");
const readingTemplates = [
  "layouts/_default/single.html",
  "layouts/shop/sample.html",
];

test("piece sharing uses one published, indexable reading-page eligibility rule", () => {
  assert.match(eligibility, /\.IsPage/);
  assert.match(eligibility, /not \.Draft/);
  assert.match(eligibility, /le \.Date\.Unix \$now\.Unix/);
  assert.match(eligibility, /le \.PublishDate\.Unix \$now\.Unix/);
  assert.match(eligibility, /partial "metadata\/page\.html" \./);
  assert.match(eligibility, /\$meta\.policy\.indexable/);
  assert.match(eligibility, /eq \$meta\.route\.name "shop-sample"/);

  const sections = eligibility.match(/\(slice ([^)]+)\) \.Section/);
  assert.ok(sections, "reading sections must be an explicit allowlist");
  assert.deepEqual(
    [...sections[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort(),
    ["almanack", "essays", "reports", "syd-and-oliver", "working-papers"]
  );
  assert.match(share, /if partial "article\/share-eligible\.html" \$page/);
  assert.match(shareScript, /^\{\{-? if partial "article\/share-eligible\.html" \. -?\}\}/);
});

test("ordinary reading templates retain shared canonical controls and one eligible script", () => {
  for (const file of readingTemplates) {
    assert.equal(
      (read(file).match(/partial "article\/share\.html" \./g) || []).length,
      1,
      `${file} must contain one shared control`
    );
  }
  assert.match(share, /partial "metadata\/page\.html" \$page/);
  assert.match(share, /data-share-title="\{\{ \$meta\.title \}\}"/);
  assert.match(share, /data-share-url="\{\{ \$meta\.canonical \}\}"/);
  assert.doesNotMatch(share, /\.RelPermalink|\.Permalink|\.Params\.title/);
  assert.equal((read("layouts/_default/baseof.html").match(/partial "article\/share-script\.html" \./g) || []).length, 1);
  assert.match(shareScript, /resources\.Get "js\/piece-share\.js" \| resources\.Minify \| resources\.Fingerprint/);
  assert.match(shareScript, /<script data-oip-route-script="piece-share" defer src="\{\{ \$script\.RelPermalink \}\}" integrity="\{\{ \$script\.Data\.Integrity \}\}"><\/script>/);
});

test("piece sharing adds no analytics events or remote sharing dependencies", () => {
  const sources = [share, shareScript, client].join("\n");
  assert.doesNotMatch(sources, /data-analytics|oipTrack|goatcounter|sendBeacon|XMLHttpRequest|\bfetch\s*\(/i);
  assert.doesNotMatch(sources, /<iframe\b|<script\b[^>]*src=["']https?:|connect\.facebook\.net|platform\.twitter\.com|addthis|sharethis/i);
  assert.doesNotMatch(client, /\b(?:import\s*\(|require\s*\(|createElement\s*\(\s*["']script)/);
});

function elementBlock(html, start, tag) {
  const tokens = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  tokens.lastIndex = start;
  let depth = 0;
  for (let match; (match = tokens.exec(html));) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, tokens.lastIndex);
  }
  assert.fail(`Unclosed ${tag} fixture element`);
}

test("real Hugo shells add two independent controls to legacy, current and future published issues", t => {
  const fixture = buildShareFixture();
  t.diagnostic(`Retained Almanack sharing fixture: ${fixture.site}`);
  const ordinary = fixture.read("public", "essays/fixture").split("<main>")[1].split("</main>")[0];
  assert.equal(ordinary, read("tests/fixtures/piece-share-default-rendered.html"), "Ordinary article control HTML must remain byte-identical.");
  for (const date of ["2026-10-24", "2026-10-31", "2026-11-07"]) {
    const html = fixture.read("public", `almanack/${date}`);
    assert.equal((html.match(/data-piece-share\b/g) || []).length, 2, date);
    const canonical = `https://outsideinprint.org/almanack/${date}/`;
    const urls = [...html.matchAll(/data-share-url="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(urls, [canonical, canonical]);
    const ids = [...html.matchAll(/\bid="((?:piece-share-|almanack-share-url-)[^"]+)"/g)].map(m => m[1]);
    assert.equal(ids.length, 8);assert.equal(new Set(ids).size, 8);
    for (const instance of ["top", "bottom"]) {
      assert.ok(html.includes(`aria-controls="piece-share-options-almanack-${instance}"`));
      assert.ok(html.includes(`for="piece-share-link-almanack-${instance}"`));
      assert.ok(html.includes(`aria-describedby="piece-share-status-almanack-${instance}"`));
      assert.ok(html.includes(`for="almanack-share-url-${instance}"`));
    }
    const articleStart = html.indexOf(date === "2026-10-24" ? '<article class="almanack-issue' : '<article class="review-issue" id="issue"');
    const article = elementBlock(html, articleStart, "article");
    assert.doesNotMatch(article, /data-piece-share|almanack-share-toolbar/);
    assert.ok(html.indexOf("almanack-share-toolbar--top") < articleStart);
    assert.ok(html.indexOf("almanack-share-toolbar--bottom") > articleStart + article.length);
    assert.ok(html.indexOf("almanack-share-toolbar--bottom") < html.indexOf('id="bobs-almanack-signup"'));
    assert.equal((html.match(/id="bobs-almanack-signup"/g) || []).length, 1);
    if (date === "2026-10-31") {
      const visible = value => value.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      assert.equal(visible(article), visible(fixture.currentBody));
      const hrefs = value => [...value.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(m => m[1]);
      assert.deepEqual(hrefs(article), hrefs(fixture.currentBody));
    }
  }
  for (const [mode, route] of [["before", "almanack/2026-11-07"], ["public", "almanack/2026-11-14"], ["public", "almanack/2026-10-17"], ["local", "almanack/2026-10-31"]]) {
    const html = fixture.read(mode, route);
    assert.doesNotMatch(html, /data-piece-share|almanack-share-url-|almanack-share-toolbar--/);
  }
});

function shareHarness({ manual = true, native = "none", clipboard = "success" } = {}) {
  const state = { active: true, activeElement: null, shares: [], copies: [], selection: null };
  class Element extends EventTarget {
    constructor(id = "") { super(); this.id = id; this.hidden = true; this.isConnected = true; this.textContent = ""; this.attrs = {}; }
    getAttribute(name) { return this.attrs[name] ?? null; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    focus() { state.activeElement = this; }
    select() { state.selection = this.value; }
  }
  const wrappers = ["top", "bottom"].map(instance => {
    const nodes = Object.fromEntries(["trigger", "panel", "copy", "close", "manual", "input", "status"].map(key => [key, new Element(`piece-share-${key}-${instance}`)]));
    nodes.trigger.attrs["aria-controls"] = nodes.panel.id;
    const wrapper = new Element();wrapper.nodes = nodes;
    wrapper.dataset = { shareTitle: "A real issue title", shareUrl: "https://outsideinprint.org/almanack/2026-10-31/?utm_source=test#section", shareManualFallback: manual ? "issue" : "" };
    wrapper.querySelector = selector => nodes[selector.match(/data-share-(.*)\]/)[1]];
    return wrapper;
  });
  const navigator = {};
  if (native !== "none") navigator.share = payload => {
    state.shares.push(JSON.parse(JSON.stringify(payload)));
    if (native === "deferred") return new Promise((_, reject) => { state.rejectShare = reject; });
    return native === "success" ? Promise.resolve() : Promise.reject({ name: native === "cancel" ? "AbortError" : "NotAllowedError" });
  };
  if (clipboard !== "none") navigator.clipboard = { writeText: url => { state.copies.push(url);return clipboard === "success" ? Promise.resolve() : Promise.reject(new Error("denied")); } };
  const removers = [];
  const scope = { active: () => state.active, on: (target, name, callback, options) => { target.addEventListener(name, callback, options);removers.push(() => target.removeEventListener(name, callback, options)); } };
  vm.runInNewContext(client, { navigator, URL, document: { readyState: "complete", querySelectorAll: () => wrappers }, window: { oipRegisterRouteWidget: (_, mount) => mount(scope) } });
  const click = async node => { node.dispatchEvent(new Event("click"));await new Promise(resolve => setImmediate(resolve)); };
  const escape = wrapper => { const event = new Event("keydown", { cancelable: true });event.key = "Escape";wrapper.dispatchEvent(event); };
  return { state, wrappers, click, escape, dispose: () => { state.active = false;removers.forEach(remove => remove()); } };
}

test("two Almanack controls isolate canonical copy feedback and provide a selected desktop share fallback", async () => {
  const env = shareHarness();const [top, bottom] = env.wrappers;
  await env.click(top.nodes.trigger);
  assert.equal(top.nodes.status.textContent, "Copy this link to share this issue.");
  assert.equal(top.nodes.manual.hidden, false);assert.equal(bottom.nodes.manual.hidden, true);
  assert.equal(env.state.selection, "https://outsideinprint.org/almanack/2026-10-31/");
  await env.click(bottom.nodes.copy);
  assert.deepEqual(env.state.copies, ["https://outsideinprint.org/almanack/2026-10-31/"]);
  assert.equal(bottom.nodes.status.textContent, "Link copied.");
  assert.equal(top.nodes.status.textContent, "Copy this link to share this issue.");
  env.escape(top);assert.equal(top.nodes.panel.hidden, true);assert.equal(env.state.activeElement, top.nodes.trigger);
  assert.deepEqual(env.state.shares, []);
});

test("native success, quiet cancellation, manual failure and disposed-route rejection never call real APIs", async () => {
  for (const native of ["success", "cancel", "reject"]) {
    const env = shareHarness({ native });const top = env.wrappers[0];await env.click(top.nodes.trigger);
    assert.deepEqual(env.state.shares, [{ title: "A real issue title", url: "https://outsideinprint.org/almanack/2026-10-31/" }]);
    assert.deepEqual(env.state.copies, []);
    assert.equal(top.nodes.manual.hidden, native !== "reject");
    if (native === "cancel") assert.equal(top.nodes.status.textContent, "");
  }
  for (const disconnected of [false, true]) {
    const env = shareHarness({ native: "deferred" });const top = env.wrappers[0];await env.click(top.nodes.trigger);
    if (disconnected) top.isConnected = false;else env.dispose();
    env.state.rejectShare({ name: "NotAllowedError" });await new Promise(resolve => setImmediate(resolve));
    assert.equal(top.nodes.manual.hidden, true);assert.equal(env.state.selection, null);
  }
});

test("ordinary article desktop fallback and clipboard-denial wording stay unchanged", async () => {
  for (const clipboard of ["none", "deny"]) {
    const env = shareHarness({ manual: false, clipboard });const top = env.wrappers[0];
    await env.click(top.nodes.trigger);assert.equal(top.nodes.manual.hidden, true);assert.equal(env.state.activeElement, top.nodes.copy);
    await env.click(top.nodes.copy);assert.equal(top.nodes.manual.hidden, false);
    assert.equal(top.nodes.status.textContent, "Copying is unavailable. The link is selected; copy it manually.");
    env.escape(top);assert.equal(top.nodes.panel.hidden, true);assert.equal(env.state.activeElement, top.nodes.trigger);
  }
});
