import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";

const hugo = process.env.OIP_HUGO_BIN || (fs.existsSync(".tools/hugo-0.164.0/hugo")
  ? path.resolve(".tools/hugo-0.164.0/hugo") : "hugo");
const progressScript = fs.readFileSync("layouts/partials/collections/reading-progress-script.html", "utf8")
  .replace(/^\s*<script>\s*/, "").replace(/\s*<\/script>\s*$/, "");

function renderPath(t, { entries = {}, startHere = "b", current = "a", collections, articleShell = false, featured = false } = {}) {
  assert.match(execFileSync(hugo, ["version"], { encoding: "utf8" }), /^hugo v0\.164\.0/);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "oip-reading-path-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    fs.writeFileSync(path.join(fixture, file), content);
  };
  write("hugo.toml", 'baseURL = "https://example.test/"\ndisableKinds = ["taxonomy", "term", "RSS", "sitemap"]\n');
  for (const partial of [
    "collections/reading-path.html", "collections/resolve-page-collections.html",
    "collections/resolve-items.html", "collections/sort-items.html", "collections/get-state.html",
    "collections/normalize-values.html", "collections/fallback-match.html",
    "discovery/page-summary.html", "metadata_description.html", "metadata/route.html",
    "collections/lookup-definition.html"
  ]) {
    write(`layouts/partials/${partial}`, fs.readFileSync(`layouts/partials/${partial}`, "utf8"));
  }
  write("layouts/index.html", '{{ with site.GetPage "essays/' + current + '" }}{{ partial "collections/reading-path.html" . }}{{ end }}');
  write("layouts/_default/single.html", "{{ .Title }}");
  write("layouts/_default/list.html", "{{ .Title }}");
  if (articleShell) {
    write("layouts/_default/baseof.html", '{{ block "main" . }}{{ end }}');
    write("layouts/_default/single.html", fs.readFileSync("layouts/_default/single.html", "utf8"));
    for (const [partial, content] of Object.entries({
      "metadata/page.html": '{{ return (dict "author" (dict) "author_name" "Fixture Author") }}',
      "article/variant-key.html": '{{ return "" }}',
      "authors/byline.html": "", "article/share.html": "", "edition-relationship.html": "", "article/plate-lightbox.html": "",
      "render_article_body.html": "{{ .Content }}",
      "newsletter_prompt.html": '<p class="{{ .class }}">Newsletter prompt</p>',
      "newsletter_signup.html": '<form class="{{ .class }}">Newsletter signup</form>',
      "journey_links.html": '<nav class="{{ .class }}">{{ .eyebrow }}</nav>',
      "article/studio-sample-exit.html": '<aside class="studio-sample-exit">Existing Studio sample</aside>',
      "article/featured-continuation.html": '<aside class="featured-continuation">Existing featured continuation</aside>',
      "collections/reading-progress-script.html": "",
    })) write(`layouts/partials/${partial}`, content);
    if (featured) write("data/featured_continuations.json", JSON.stringify({ [`/essays/${current}/`]: { reading_path: "/essays/b/" } }));
  }
  const definitions = collections || [
    { slug: "alpha", title: "Alpha collection", weight: 1, start_here: startHere, public: true, force_public: true, explicit_only: true },
    { slug: "beta", title: "Beta collection", weight: 2, public: true, force_public: true, explicit_only: true },
  ];
  write("data/collections.json", JSON.stringify({ collections: definitions }));
  for (const definition of definitions) {
    write(`content/collections/${definition.slug}.md`, `---\ntitle: ${JSON.stringify(definition.title)}\n---\n`);
  }
  const pages = {
    a: { title: "Article A", date: "2020-01-01", collections: ["alpha", "beta"], collection_weight: 1 },
    b: { title: "Article B", date: "2020-02-01", collections: ["alpha"], collection_weight: 2, description: "  <strong>An existing invitation.</strong>  " },
    c: { title: "Article C", date: "2020-03-01", collections: ["alpha", "beta"], collection_weight: 3, subtitle: "Existing summary fallback." },
    ...entries,
  };
  for (const [slug, metadata] of Object.entries(pages)) {
    if (metadata === null) continue;
    const frontMatter = Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
    write(`content/essays/${slug}.md`, `---\n${frontMatter}\n---\nExisting article body.\n`);
  }
  execFileSync(hugo, ["--source", fixture, "--clock", "2020-09-01T12:00:00Z", "--buildDrafts", "--buildFuture", "--buildExpired", "--panicOnWarning"], { encoding: "utf8" });
  return fs.readFileSync(path.join(fixture, articleShell ? `public/essays/${current}/index.html` : "public/index.html"), "utf8");
}

function primaryDestination(html) {
  const anchor = html.match(/<a\b[^>]*data-analytics-source-slot="article_continuation_primary"[^>]*>/)?.[0];
  return anchor?.match(/href="([^"]+)"/)?.[1];
}

test("one next card uses primary collection order, existing description, and reading time", (t) => {
  const html = renderPath(t);
  assert.equal(primaryDestination(html), "/essays/b/");
  assert.equal((html.match(/<a\b/g) || []).length, 2);
  assert.match(html, /data-collection-slug="alpha"/);
  assert.match(html, /<h2[^>]*>Read next<\/h2>/);
  assert.match(html, /class="reading-path__summary">An existing invitation\.<\/p>/);
  assert.match(html, /class="reading-path__meta">1 min read<\/p>/);
  assert.match(html, /href="\/collections\/alpha\/"[\s\S]*?>View collection<\/a>/);
  assert.doesNotMatch(html, /Curated position|Reading progress|After this position|Up Next|Previous piece|Recommended starting point|Start Again/);
});

test("next card uses existing summary when description is absent", (t) => {
  const html = renderPath(t, { current: "b" });
  assert.equal(primaryDestination(html), "/essays/c/");
  assert.match(html, /class="reading-path__summary">Existing summary fallback\.<\/p>/);
});

test("end of collection returns to its eligible designated starting piece", (t) => {
  assert.equal(primaryDestination(renderPath(t, { current: "c" })), "/essays/b/");
});

test("missing, unavailable, or self-referential start falls back to first other eligible piece", (t) => {
  for (const startHere of ["", "missing", "c", "draft"]) {
    assert.equal(primaryDestination(renderPath(t, {
      current: "c", startHere,
      entries: { draft: { title: "Draft", date: "2020-01-01", draft: true, collections: ["alpha"], collection_weight: 0 } },
    })), "/essays/a/", startHere);
  }
});

test("single eligible piece offers only the collection link, never itself", (t) => {
  const html = renderPath(t, { startHere: "a", entries: { b: null, c: null } });
  assert.equal(primaryDestination(html), undefined);
  assert.equal((html.match(/<a\b/g) || []).length, 1);
  assert.match(html, />View collection<\/a>/);
  assert.doesNotMatch(html, /Read next|href="\/essays\/a\/"|reading-path__summary|reading-path__meta/);
  assert.match(html, /data-reading-path-root/);
});

test("drafts, future dates/releases, and expired pieces never become recommendations, even in previews", (t) => {
  const entries = {};
  for (const [slug, metadata] of Object.entries({
    draft: { draft: true }, future: { date: "2030-01-01" },
    queued: { publishDate: "2030-01-01" }, expired: { expiryDate: "2020-08-01" },
  })) {
    entries[slug] = { title: slug, date: "2020-01-01", collections: ["alpha"], collection_weight: 1.5, ...metadata };
  }
  const html = renderPath(t, { entries });
  assert.equal(primaryDestination(html), "/essays/b/");
  for (const slug of Object.keys(entries)) assert.doesNotMatch(html, new RegExp(`/essays/${slug}/`));
});

test("explicit collection preference wins over definition weight", (t) => {
  const html = renderPath(t, {
    entries: { a: { title: "Article A", date: "2020-01-01", collections: ["beta", "alpha"], collection_weight: 1 } },
  });
  assert.equal(primaryDestination(html), "/essays/c/");
  assert.match(html, /data-collection-slug="beta"/);
});

test("unweighted collection retains newest-first order", (t) => {
  const entries = Object.fromEntries(["a", "b", "c"].map((slug, index) => [slug, {
    title: `Article ${slug}`, date: `2020-0${index + 1}-01`, collections: ["alpha"],
  }]));
  assert.equal(primaryDestination(renderPath(t, { entries, current: "c" })), "/essays/b/");
});

test("standard collection exit retains body and publication record, then only card and newsletter", (t) => {
  const html = renderPath(t, { articleShell: true });
  assert.match(html, /class="piece-body">\s*<p>Existing article body\.<\/p>/);
  assert.match(html, /article-publication-record[\s\S]*Cite this[\s\S]*reading-path[\s\S]*<\/aside>\s*<form class="newsletter-signup--article-exit">/);
  assert.doesNotMatch(html, /newsletter-prompt--article-exit|journey-links--article-exit|Article paths/);
});

test("non-collection, explicitly featured, and Studio exits preserve their existing branches", (t) => {
  const noCollection = renderPath(t, {
    articleShell: true,
    entries: { a: { title: "Standalone", date: "2020-01-01", collections: ["unlisted"] } },
  });
  assert.match(noCollection, /newsletter-signup--article-exit[\s\S]*journey-links--article-exit/);
  assert.doesNotMatch(noCollection, /class="reading-path"|newsletter-prompt--article-exit/);
  const featured = renderPath(t, { articleShell: true, featured: true });
  assert.match(featured, /newsletter-prompt--article-exit[\s\S]*featured-continuation[\s\S]*newsletter-signup--article-exit[\s\S]*journey-links--article-exit/);
  assert.doesNotMatch(featured, /class="reading-path"/);
  for (const withFeatured of [false, true]) {
    const studio = renderPath(t, {
      articleShell: true, featured: withFeatured,
      entries: { a: { title: "Studio sample", date: "2020-01-01", collections: ["alpha"], collection_weight: 1, studio_sample: { purpose: "Existing sample" } } },
    });
    assert.match(studio, /article-publication-record[\s\S]*studio-sample-exit/);
    assert.equal(studio.includes('class="featured-continuation"'), withFeatured);
    assert.doesNotMatch(studio, /class="reading-path"|newsletter-prompt--article-exit|newsletter-signup--article-exit|journey-links--article-exit/);
  }
});

function node(attributes, children = {}) {
  return { getAttribute: (key) => attributes[key] ?? null, querySelector: (selector) => children[selector] ?? null };
}

function runProgress({ saved, article = true, collection = false, unavailable = false, writeFailure = false } = {}) {
  const paths = ["/a/", "/b/", "/c/"];
  const attributes = {
    "data-collection-slug": "alpha", "data-current-path": "/a/",
    "data-item-paths": JSON.stringify(paths), "data-item-titles": JSON.stringify(["A", "B", "C"]),
    "data-start-here-path": "/b/", "data-start-here-title": "B",
  };
  const summary = { textContent: "Initial progress" };
  const resume = { textContent: "Initial resume", href: "/b/" };
  const states = paths.map((path) => {
    const classes = new Set();
    const state = { textContent: "", classList: { add: (...names) => names.forEach((name) => classes.add(name)), remove: (...names) => names.forEach((name) => classes.delete(name)) }, classes };
    return { path, state, node: node({ "data-collection-item-path": path }, { "[data-collection-item-state]": state }) };
  });
  const storage = new Map(saved === undefined ? [] : [["oip-reading-progress:v1:alpha", saved]]);
  let writes = 0;
  const context = {
    window: { localStorage: {
      getItem: (key) => { if (unavailable) throw new Error("Unavailable"); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (writeFailure) throw new Error("Quota"); writes += 1; storage.set(key, value); },
    } },
    document: { querySelectorAll: (selector) => ({
      "[data-reading-path-root]": article ? [node(attributes)] : [],
      "[data-collection-progress-root]": collection ? [node(attributes, {
        "[data-collection-progress-summary]": summary, "[data-collection-progress-resume]": resume,
      })] : [],
      "[data-collection-item-path]": states.map((entry) => entry.node),
    }[selector] || []) },
  };
  vm.runInNewContext(progressScript, context);
  return { storage, writes, summary, resume, states };
}

test("article visit persists without any visible progress node", () => {
  const result = runProgress();
  const saved = JSON.parse(result.storage.get("oip-reading-progress:v1:alpha"));
  assert.deepEqual(saved.visited, ["/a/"]);
  assert.match(saved.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(result.writes, 1);
});

test("return visits stay deduplicated and corrupt or unavailable storage degrades safely", () => {
  const repeated = runProgress({ saved: JSON.stringify({ visited: ["/a/", "/a/", null] }) });
  assert.equal(repeated.writes, 0);
  assert.equal(runProgress({ saved: "malformed" }).writes, 1);
  assert.equal(runProgress({ unavailable: true }).writes, 0);
  assert.equal(runProgress({ writeFailure: true }).writes, 0);
});

test("collection status and resume behavior survives invisible article recording", () => {
  const first = runProgress({ article: false, collection: true });
  assert.equal(first.summary.textContent, "Reading progress on this device: 0 of 3 pieces.");
  assert.equal(first.resume.textContent, "Start with B");
  const visited = runProgress({ collection: true });
  assert.equal(visited.summary.textContent, "Reading progress on this device: 1 of 3 pieces.");
  assert.equal(visited.resume.href, "/b/");
  assert.equal(visited.resume.textContent, "Resume with B");
  assert.equal(visited.states[0].state.textContent, "Visited");
  assert.ok(visited.states[0].state.classes.has("collection-pill--visited"));
  const later = runProgress({ article: false, collection: true, saved: JSON.stringify({ visited: ["/a/", "/b/"] }) });
  assert.equal(later.resume.textContent, "Resume with C");
  const complete = runProgress({ article: false, collection: true, saved: JSON.stringify({ visited: ["/a/", "/b/", "/c/"] }) });
  assert.equal(complete.summary.textContent, "Reading progress on this device: 3 of 3 pieces.");
  assert.equal(complete.resume.textContent, "Start Again with A");
});
