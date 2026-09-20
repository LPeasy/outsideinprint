import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const template = fs.readFileSync("layouts/library/list.html", "utf8");
const script = template.match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace("{{ $indexURL | jsonify | safeJS }}", JSON.stringify("/library/index.json"))
  .replace("{{ $initialCount }}", "36")
  .replace("{{ len $catalog.entries }}", "50");

const items = Array.from({ length: 50 }, (_, index) => {
  const number = index + 1;
  const title = `Piece ${String(number).padStart(3, "0")}`;
  return {
    id: `/essays/piece-${number}/`, url: `/essays/piece-${number}/`, title,
    date: new Date(Date.UTC(2026, 0, number)).toISOString().slice(0, 10),
    year: "2026", type: ["essay", "dialogue", "affirmation"][index % 3],
    sectionLabel: ["Essay", "Dialogue", "Affirmation"][index % 3],
    collectionSlugs: index % 2 ? ["first-lane"] : ["second-lane"],
    collections: [{ title: "Lane", url: "/collections/lane/" }],
    version: "1.0", readingTime: 3, summary: "A summary.",
    searchText: `${title} ${index % 2 ? "common" : "rare"}`,
  };
});

class Element {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.textContent = "";
  }
  addEventListener(event, listener) { this.listeners.set(event, listener); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
  insertBefore(child, sibling) { this.children.splice(this.children.indexOf(sibling), 0, child); child.parentNode = this; }
  get firstChild() { return this.children[0]; }
  focus() { this.focused = true; }
  fire(event) { if (!this.disabled) this.listeners.get(event)?.(); }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const response = (catalog = items) => ({ ok: true, json: async () => ({ version: 1, items: catalog }) });

function setup({ query = "", fetchImpl = async () => response(), noFetch = false, noUrl = false } = {}) {
  const nodes = new Map([...template.matchAll(/id="(library-[^"]+)"/g)].map((match) => [match[1], new Element()]));
  for (const [name, values] of Object.entries({
    type: ["", "essay", "dialogue", "affirmation"], year: ["", "2026", "2025"],
    collection: ["", "first-lane", "second-lane"], sort: ["newest", "oldest", "title"],
  })) {
    const select = nodes.get(`library-${name}`);
    select.options = values.map((value) => ({ value, textContent: value }));
    select.value = values[0];
  }
  for (const name of ["flat-results", "pagination", "search-empty", "search-error"]) nodes.get(`library-${name}`).hidden = true;
  const controls = new Element();
  controls.hidden = true;
  const parent = new Element();
  parent.appendChild(nodes.get("library-grouped-results"));
  parent.appendChild(nodes.get("library-flat-results"));
  const timers = new Map();
  let timerId = 0;
  let fetchCalls = 0;
  const listeners = new Map();
  const history = [`https://outsideinprint.org/library/${query}`];
  let historyIndex = 0;
  const window = {
    location: { href: history[0] },
    history: {
      replaceState(state, title, url) { history[historyIndex] = url; window.location.href = url; },
      pushState(state, title, url) { history.splice(historyIndex + 1); history.push(url); historyIndex += 1; window.location.href = url; },
    },
    addEventListener: (event, listener) => listeners.set(event, listener),
    setTimeout: (handler) => { timers.set(++timerId, handler); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  };
  const document = {
    querySelector: () => controls,
    getElementById: (id) => nodes.get(id),
    createElement: (tag) => new Element(tag),
    createElementNS: (namespace, tag) => new Element(tag),
    createTextNode: (value) => Object.assign(new Element("text"), { textContent: value }),
  };
  vm.runInNewContext(script, {
    document, window, URL: noUrl ? undefined : URL,
    fetch: noFetch ? undefined : (...args) => { fetchCalls += 1; assert.equal(args[0], "/library/index.json"); return fetchImpl(...args); },
  });
  return {
    nodes, controls, window, history,
    get fetchCalls() { return fetchCalls; },
    get params() { return new URL(window.location.href).searchParams; },
    get ids() { return nodes.get("library-results-list").children.map((node) => node.getAttribute("data-entry-id")); },
    async click(name) { nodes.get(`library-${name}`).fire("click"); await settle(); },
    async change(name, value) { const node = nodes.get(`library-${name}`); node.value = value; node.fire("change"); await settle(); },
    input(value) { const node = nodes.get("library-search"); node.value = value; node.fire("input"); },
    async flushInput() { const jobs = [...timers.values()]; timers.clear(); jobs.forEach((handler) => handler()); await settle(); },
    async back() { historyIndex = Math.max(0, historyIndex - 1); window.location.href = history[historyIndex]; listeners.get("popstate")(); await settle(); },
    async navigate(queryString) { window.location.href = `https://outsideinprint.org/library/${queryString}`; listeners.get("popstate")(); await settle(); },
  };
}

test("Library keeps grouped selections and no-JavaScript fallback while browse controls are progressive", () => {
  assert.match(template, /data-library-controls hidden/);
  assert.match(template, /id="library-browse-all"[^>]*type="button">Browse all \{\{ len \$catalog.entries \}\} pieces/);
  assert.match(template, /published pieces, newest within each type\./);
  assert.match(template, /<noscript>.*?Archive.*?<\/noscript>/);
  assert.match(template, /id="library-results-summary"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(template, /id="library-results-title"[^>]*tabindex="-1"/);
  assert.match(template, /id="library-pagination"[^>]*aria-label="Library result pages" hidden/);
  const page = setup();
  assert.equal(page.controls.hidden, false);
  assert.equal(page.fetchCalls, 0, "grouped landing must not fetch the complete index unnecessarily");
  assert.equal(page.nodes.get("library-grouped-results").hidden, false);
  assert.equal(page.nodes.get("library-flat-results").hidden, true);
  assert.equal(page.nodes.get("library-sort").options[0].textContent, "Newest by type");
  assert.equal(setup({ noFetch: true }).controls.hidden, true);
});

test("Library gives grouped and filtered illustrated pieces matching read and zoom surfaces", async () => {
  assert.match(template, /"collectionArtwork" true "class" "collection-section__record" "analyticsSourceSlot" "library_grouped"/);
  assert.match(template, /library-group page-shell page-shell--grid/);
  assert.match(template, /library-results page-shell page-shell--grid/);
  const index = fs.readFileSync("layouts/library/list.libraryindex.json", "utf8");
  assert.match(index, /"image" \(partial "library\/artwork-for-entry\.html" \.page\)/);
  const viewer = fs.readFileSync("layouts/partials/editorial/cartoon-thumbnail-lightbox.html", "utf8");
  assert.match(viewer, /document\.addEventListener\("click"[\s\S]*?closest\("\[data-essay-cartoon-lightbox-trigger\]"\)/);

  const illustrated = {
    ...items[0], date: "2026-02-01", slug: "piece-1", image: {
      src: "/images/rendered/piece-1/640w.webp", avifSrcset: "/images/rendered/piece-1/640w.avif 640w",
      webpSrcset: "/images/rendered/piece-1/640w.webp 640w", width: 640, height: 480,
      imageId: "piece-1", alt: "A drawing", title: "Piece 001", date: "2026-01-01",
      dateLabel: "Jan 1, 2026", lightboxSrc: "/images/rendered/piece-1/1600w.webp",
      lightboxWidth: 1600, lightboxHeight: 1200, cartoonSlug: "piece-1",
      gallery: "https://outsideinprint.org/gallery/?cartoon=piece-1",
      credit: { author: "Artist", sourceUrl: "https://example.org/source", license: "CC BY", licenseUrl: "https://example.org/license", changes: "Resized." }
    }
  };
  const page = setup({ query: "?view=all", fetchImpl: async () => response([illustrated, { ...items[1], image: false }]) });
  await settle();
  const rows = page.nodes.get("library-results-list").children;
  const article = rows[0].children[0];
  assert.equal(article.className, "item item--collection-artwork collection-section__record");
  assert.equal(article.children[0].className, "item__copy");
  const media = article.children[1].children[0];
  const imageLink = media.children[0];
  const zoom = media.children[1];
  assert.equal(imageLink.href, illustrated.url);
  assert.equal(imageLink.getAttribute("data-analytics-path"), illustrated.url);
  assert.equal(imageLink.getAttribute("data-analytics-source-slot"), "library_search");
  assert.equal(imageLink.children[0].tagName, "picture");
  assert.equal(zoom.getAttribute("data-essay-cartoon-lightbox-trigger"), "");
  assert.equal(zoom.getAttribute("data-image"), illustrated.image.lightboxSrc);
  assert.equal(zoom.getAttribute("data-analytics-event"), undefined);
  assert.equal(article.children[1].children[1].className, "image-credit");
  assert.equal(rows[1].children[0].className, "item", "image-exempt pieces stay text-only");
});

test("Browse all presents a single 24-item cross-type newest-first list, with bounded page controls", async () => {
  const page = setup();
  await page.click("browse-all");
  assert.equal(page.fetchCalls, 1);
  assert.equal(page.params.get("view"), "all");
  assert.equal(page.params.get("page"), "1");
  assert.equal(page.nodes.get("library-grouped-results").parentNode, null);
  assert.deepEqual(page.ids, items.slice(-24).reverse().map((item) => item.id));
  assert.equal(page.nodes.get("library-results-summary").textContent, "Showing 1–24 of 50 pieces.");
  assert.equal(page.nodes.get("library-previous").disabled, true);
  assert.equal(page.nodes.get("library-next").disabled, false);
  assert.equal(page.nodes.get("library-results-title").focused, true);
  assert.equal(page.nodes.get("library-sort").options[0].textContent, "Newest first");
  await page.click("next");
  assert.equal(page.params.get("page"), "2");
  assert.equal(page.ids.length, 24);
  assert.equal(page.nodes.get("library-results-summary").textContent, "Showing 25–48 of 50 pieces.");
  await page.click("next");
  assert.deepEqual(page.ids, [items[1].id, items[0].id]);
  assert.equal(page.nodes.get("library-page-status").textContent, "Page 3 of 3");
  assert.equal(page.nodes.get("library-next").disabled, true);
  await page.click("previous");
  assert.equal(page.params.get("page"), "2");
  assert.equal(page.fetchCalls, 1, "pagination reuses the loaded catalog");
});

test("filter, search, and sort changes reset pagination; Browse all clears every filter", async () => {
  const page = setup({ query: "?view=all&page=3&unrelated=kept" });
  await settle();
  await page.change("type", "dialogue");
  assert.equal(page.params.get("page"), "1");
  assert.equal(page.ids.length, 17);
  assert.equal(page.nodes.get("library-pagination").hidden, true);
  await page.change("collection", "first-lane");
  assert.ok(page.ids.every((id) => items.find((item) => item.id === id).collectionSlugs.includes("first-lane")));
  page.input("Piece 02");
  await page.flushInput();
  assert.ok(page.ids.every((id) => items.find((item) => item.id === id).title.includes("Piece 02")));
  await page.change("sort", "oldest");
  assert.deepEqual(page.ids, [...page.ids].sort((a, b) => items.find((item) => item.id === a).date.localeCompare(items.find((item) => item.id === b).date)));
  await page.click("browse-all");
  for (const name of ["q", "type", "year", "collection", "sort"]) assert.equal(page.params.has(name), false);
  assert.equal(page.params.get("unrelated"), "kept");
  assert.equal(page.params.get("page"), "1");
  assert.equal(page.ids[0], items[49].id);
  await page.click("reset");
  assert.equal(page.nodes.get("library-grouped-results").parentNode !== null, true);
  assert.equal(page.nodes.get("library-flat-results").hidden, true);
  assert.equal(page.params.has("view"), false);
  assert.equal(page.params.has("page"), false);
  assert.equal(page.ids.length, 0);
});

test("URL state restores on reload and browser back, migrates section, and clamps invalid pages", async () => {
  const page = setup({ query: "?q=common&section=dialogue&year=2026&collection=first-lane&sort=oldest&view=all&page=99" });
  await settle();
  for (const [name, value] of Object.entries({ type: "dialogue", year: "2026", collection: "first-lane", sort: "oldest" })) assert.equal(page.nodes.get(`library-${name}`).value, value);
  assert.equal(page.nodes.get("library-search").value, "common");
  assert.equal(page.params.has("section"), false);
  assert.equal(page.params.get("type"), "dialogue");
  assert.equal(page.params.get("page"), "1");
  await page.click("browse-all");
  await page.click("next");
  await page.back();
  assert.equal(page.params.get("page"), "1");
  assert.equal(page.ids[0], items[49].id);
  await page.back();
  assert.equal(page.params.get("type"), "dialogue");
  assert.equal(page.nodes.get("library-search").value, "common");
  for (const invalid of ["0", "-1", "1.5", "NaN", "Infinity", "9007199254740992", "12garbage", ""]) {
    await page.navigate(`?view=all&page=${invalid}`);
    assert.equal(page.params.get("page"), "1", invalid);
  }
  await page.navigate("?view=all&page=999");
  assert.equal(page.params.get("page"), "3");
  assert.equal(page.ids.length, 2);
  await page.navigate("?view=all&page=2");
  assert.equal(page.ids[0], items[25].id);
  await page.navigate("?type=invalid&year=invalid&collection=invalid&sort=invalid&view=invalid&page=3");
  assert.equal(page.nodes.get("library-flat-results").hidden, true);
  assert.equal(page.params.toString(), "");
});

test("sorting retains title/date tie-breaking, year filtering, and useful empty results", async () => {
  const catalog = [
    { ...items[0], title: "Zulu", date: "2025-01-01", year: "2025" },
    { ...items[1], title: "Alpha", date: "2026-01-01" },
    { ...items[2], title: "Beta", date: "2026-01-01" },
    { ...items[3], title: "Alpha", date: "2025-01-01", year: "2025" },
  ];
  const page = setup({ query: "?view=all", fetchImpl: async () => response(catalog) });
  await settle();
  assert.deepEqual(page.ids, [catalog[1], catalog[2], catalog[3], catalog[0]].map((item) => item.id));
  await page.change("sort", "oldest");
  assert.deepEqual(page.ids, [catalog[3], catalog[0], catalog[1], catalog[2]].map((item) => item.id));
  await page.change("sort", "title");
  assert.deepEqual(page.ids, [catalog[1], catalog[3], catalog[2], catalog[0]].map((item) => item.id));
  await page.change("year", "2025");
  assert.deepEqual(page.ids, [catalog[3], catalog[0]].map((item) => item.id));
  page.input("no such piece");
  await page.flushInput();
  assert.equal(page.ids.length, 0);
  assert.equal(page.nodes.get("library-search-empty").hidden, false);
  assert.equal(page.nodes.get("library-search-error").hidden, true);
  assert.equal(page.nodes.get("library-pagination").hidden, true);
  assert.equal(page.params.get("page"), "1");
});

test("index failures retain grouped and Archive fallback; the next action can retry", async () => {
  for (const failure of [() => Promise.reject(new Error("offline")), async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ version: 2, items: [] }) })]) {
    let attempt = 0;
    const page = setup({ fetchImpl: (...args) => ++attempt === 1 ? failure(...args) : Promise.resolve(response()) });
    await page.click("browse-all");
    assert.equal(page.nodes.get("library-search-error").hidden, false);
    assert.equal(page.nodes.get("library-grouped-results").parentNode !== null, true);
    assert.equal(page.nodes.get("library-flat-results").hidden, true);
    assert.equal(page.nodes.get("library-pagination").hidden, true);
    await page.click("browse-all");
    assert.equal(page.nodes.get("library-search-error").hidden, true);
    assert.equal(page.ids.length, 24);
    assert.equal(page.fetchCalls, 2);
  }
});

test("pending input and stale fetch completions cannot undo reset or newer filters", async () => {
  let resolveCatalog;
  const page = setup({ fetchImpl: () => new Promise((resolve) => { resolveCatalog = resolve; }) });
  await page.click("browse-all");
  page.input("common");
  await page.click("reset");
  resolveCatalog(response());
  await settle();
  await page.flushInput();
  assert.equal(page.nodes.get("library-flat-results").hidden, true);
  assert.equal(page.params.has("view"), false);
  assert.equal(page.ids.length, 0);
  let resolveSecond;
  const newer = setup({ query: "?type=essay", fetchImpl: () => new Promise((resolve) => { resolveSecond = resolve; }) });
  await newer.change("type", "dialogue");
  resolveSecond(response());
  await settle();
  assert.equal(newer.ids.length, 17);
  assert.ok(newer.ids.every((id) => items.find((item) => item.id === id).type === "dialogue"));
  const legacy = setup({ noUrl: true });
  await legacy.click("browse-all");
  assert.equal(legacy.ids.length, 24, "browsing also works without the History/URL enhancement");
});
