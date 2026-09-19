import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { execFileSync, spawnSync } from "node:child_process";

const hugo = process.env.OIP_HUGO_BIN || (fs.existsSync(".tools/hugo-0.164.0/hugo")
  ? path.resolve(".tools/hugo-0.164.0/hugo") : "hugo");
const progressScript = fs.readFileSync("layouts/partials/collections/reading-progress-script.html", "utf8")
  .replace(/^\s*<script>\s*/, "").replace(/\s*<\/script>\s*$/, "");

function renderPath(t, { entries = {}, startHere = "b", current = "a", collections, articleShell = false, featured = false, landings = {}, collectionShell = false, collectionDirectory = false, outputRoute, indexTemplate, section = "essays" } = {}) {
  assert.match(execFileSync(hugo, ["version"], { encoding: "utf8" }), /^hugo v0\.164\.0/);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "oip-reading-path-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    fs.writeFileSync(path.join(fixture, file), content);
  };
  write("hugo.toml", 'baseURL = "https://example.test/"\ndisableKinds = ["taxonomy", "term", "RSS", "sitemap"]\n');
  fs.cpSync("layouts/partials/collections", path.join(fixture, "layouts/partials/collections"), { recursive: true });
  for (const partial of [
    "discovery/page-summary.html", "metadata_description.html", "metadata/route.html",
  ]) {
    write(`layouts/partials/${partial}`, fs.readFileSync(`layouts/partials/${partial}`, "utf8"));
  }
  write("layouts/index.html", indexTemplate || '{{ with site.GetPage "' + section + '/' + current + '" }}{{ partial "collections/reading-path.html" . }}{{ end }}');
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
      "article/contents.html": "",
      "newsletter_prompt.html": '<p class="{{ .class }}">Newsletter prompt</p>',
      "newsletter_signup.html": '<form class="{{ .class }}">Newsletter signup</form>',
      "journey_links.html": '<nav class="{{ .class }}">{{ .eyebrow }}</nav>',
      "article/studio-sample-exit.html": '<aside class="studio-sample-exit">Existing Studio sample</aside>',
      "article/featured-continuation.html": '<aside class="featured-continuation">Existing featured continuation</aside>',
      "collections/reading-progress-script.html": "",
    })) write(`layouts/partials/${partial}`, content);
    if (featured) write("data/featured_continuations.json", JSON.stringify({ [`/essays/${current}/`]: { reading_path: "/essays/b/" } }));
  }
  if (collectionShell) {
    write("layouts/_default/baseof.html", '{{ block "main" . }}{{ end }}');
    write("layouts/collections/single.html", fs.readFileSync("layouts/collections/single.html", "utf8"));
    write("layouts/partials/discovery/page-list-item.html", '<a class="fixture-collection-item" href="{{ .page.RelPermalink }}">{{ .page.Title }}</a>');
    write("layouts/partials/discovery/collection-card.html", '<a class="fixture-related-collection" href="{{ .entry.page.RelPermalink }}">{{ .entry.collection.title }}</a>');
    write("layouts/partials/journey_links.html", '');
  }
  if (collectionDirectory) {
    write("layouts/_default/baseof.html", '{{ block "main" . }}{{ end }}');
    write("layouts/collections/list.html", fs.readFileSync("layouts/collections/list.html", "utf8"));
    write("layouts/partials/discovery/collection-card.html", fs.readFileSync("layouts/partials/discovery/collection-card.html", "utf8"));
    write("content/collections/_index.md", '---\ntitle: Collections\n---\n');
  }
  const definitions = collections || [
    { slug: "alpha", title: "Alpha collection", description: "A focused collection description.", kind: "topic", weight: 1, start_here: startHere, public: true, force_public: true, explicit_only: true },
    { slug: "beta", title: "Beta collection", description: "A series description.", kind: "series", weight: 2, public: true, force_public: true, explicit_only: true },
  ];
  write("data/collections.json", JSON.stringify({ collections: definitions }));
  for (const definition of definitions) {
    if (landings[definition.slug] === null) continue;
    const metadata = { title: definition.title, date: "2020-01-01", ...landings[definition.slug] };
    write(`content/collections/${definition.slug}.md`, `---\n${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n`);
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
    write(`content/${slug === current ? section : "essays"}/${slug}.md`, `---\n${frontMatter}\n---\nExisting article body.\n`);
  }
  execFileSync(hugo, ["--source", fixture, "--clock", "2020-09-01T12:00:00Z", "--buildDrafts", "--buildFuture", "--buildExpired", "--panicOnWarning"], { encoding: "utf8" });
  return fs.readFileSync(path.join(fixture, "public", outputRoute || (articleShell ? `${section}/${current}` : ""), "index.html"), "utf8");
}

function primaryDestination(html) {
  const anchor = html.match(/<a\b[^>]*data-analytics-source-slot="article_continuation_primary"[^>]*>/)?.[0];
  return anchor?.match(/href="([^"]+)"/)?.[1];
}

function decodedAttribute(html, attribute) {
  const value = html.match(new RegExp(`${attribute}="([^"]*)"`))?.[1];
  assert.notEqual(value, undefined, `${attribute} must be rendered`);
  // Exactly one HTML-parser decoding pass: double-escaped JSON must fail below.
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    return named[entity] ?? String.fromCodePoint(entity.startsWith("&#x") ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1)));
  });
}

test("collection-first card is a native collection link with its description and published count", (t) => {
  const html = renderPath(t);
  assert.equal(primaryDestination(html), "/collections/alpha/");
  assert.equal((html.match(/<a\b/g) || []).length, 1);
  assert.match(html, /data-collection-slug="alpha"/);
  assert.match(html, /<h2[^>]*>More on Alpha collection<\/h2>/);
  assert.match(html, /class="reading-path__summary">A focused collection description\.<\/p>/);
  assert.match(html, />Explore all 3 pieces (?:→|&#8594;)<\/a>/);
  assert.doesNotMatch(html, /Read next|View collection|min read|Curated position|Reading progress|Up Next|<script|onclick/);
});

test("rendered progress attributes decode to JSON once, including escaped article titles", (t) => {
  const title = 'Article "A" & <the first>';
  const html = renderPath(t, { entries: { a: { title, date: "2020-01-01", collections: ["alpha"], collection_weight: 1 } } });
  assert.deepEqual(JSON.parse(decodedAttribute(html, "data-item-paths")), ["/essays/a/", "/essays/b/", "/essays/c/"]);
  assert.deepEqual(JSON.parse(decodedAttribute(html, "data-item-titles")), [title, "Article B", "Article C"]);
});

test("forced-public singletons fall back to Library instead of recommending themselves", (t) => {
  const html = renderPath(t, { startHere: "a", entries: { b: null, c: null } });
  assert.equal(primaryDestination(html), undefined);
  assert.equal((html.match(/<a\b/g) || []).length, 1);
  assert.match(html, /href="\/library\/"/);
  assert.match(html, />Browse the library (?:→|&#8594;)<\/a>/);
  assert.match(html, /data-analytics-event="internal_promo_click"/);
  assert.match(html, /data-analytics-source-slot="article_exit_paths"/);
  assert.doesNotMatch(html, /href="\/essays\/a\/"|data-reading-path-root/);
});

test("preview-only members never inflate collection links, counts, or stored item paths", (t) => {
  const entries = {};
  for (const [slug, metadata] of Object.entries({
    draft: { draft: true }, future: { date: "2030-01-01" },
    queued: { publishDate: "2030-01-01" }, expired: { expiryDate: "2020-08-01" },
  })) {
    entries[slug] = { title: slug, date: "2020-01-01", collections: ["alpha"], collection_weight: 1.5, ...metadata };
  }
  const html = renderPath(t, { entries });
  assert.equal(primaryDestination(html), "/collections/alpha/");
  assert.match(html, /Explore all 3 pieces/);
  for (const slug of Object.keys(entries)) assert.doesNotMatch(html, new RegExp(`/essays/${slug}/`));
});

test("topics win over earlier series without changing the article header order", (t) => {
  const html = renderPath(t, {
    articleShell: true,
    entries: { a: { title: "Article A", date: "2020-01-01", collections: ["beta", "alpha"], collection_weight: 1 } },
  });
  assert.equal(primaryDestination(html), "/collections/alpha/");
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.indexOf('/collections/beta/') < header.indexOf('/collections/alpha/'));
  assert.match(html, /data-piece-collection-slug="beta"/);
});

test("same-kind preference follows front matter rather than definition weight", (t) => {
  const html = renderPath(t, {
    collections: [
      { slug: "alpha", title: "Alpha", kind: "topic", weight: 1, public: true, force_public: true, explicit_only: true },
      { slug: "beta", title: "Beta", kind: "topic", weight: 99, public: true, force_public: true, explicit_only: true },
    ],
    entries: { a: { title: "Article A", date: "2020-01-01", collections: ["beta", "alpha"] } },
  });
  assert.equal(primaryDestination(html), "/collections/beta/");
});

test("series provides the next step when no eligible topic remains", (t) => {
  const html = renderPath(t, { landings: { alpha: null } });
  assert.equal(primaryDestination(html), "/collections/beta/");
  assert.match(html, /More from Beta collection/);
  assert.match(html, /Explore all 2 pieces/);
});

test("missing, private, and unpublished landing pages cannot be continuation destinations", (t) => {
  for (const landing of [null, { draft: true }, { date: "2030-01-01" }, { publishDate: "2030-01-01" }, { expiryDate: "2020-08-01" }]) {
    const html = renderPath(t, { landings: { alpha: landing } });
    assert.equal(primaryDestination(html), "/collections/beta/", JSON.stringify(landing));
    assert.doesNotMatch(html, /\/collections\/alpha\//);
  }
  const html = renderPath(t, { collections: [
    { slug: "alpha", title: "Private", kind: "topic", public: false, force_public: true, explicit_only: true },
  ] });
  assert.match(html, /Browse the library/);
  assert.doesNotMatch(html, /\/collections\/alpha\//);
});

test("minimum size counts only published members and force-public still requires another piece", (t) => {
  for (const force of [false, true]) {
    const html = renderPath(t, {
      collections: [{ slug: "alpha", title: "Alpha", kind: "topic", public: true, min_items: 4, force_public: force, explicit_only: true }],
      entries: { draft: { title: "Draft", date: "2020-01-01", collections: ["alpha"], draft: true } },
    });
    assert.equal(primaryDestination(html), force ? "/collections/alpha/" : undefined);
    assert.match(html, force ? /Explore all 3 pieces/ : /Browse the library/);
  }
});

test("unpublished current pages and nonmembers cannot claim a continuation collection", (t) => {
  for (const metadata of [{ draft: true }, { date: "2030-01-01" }, { publishDate: "2030-01-01" }, { expiryDate: "2020-08-01" }, { collections: ["unknown"] }]) {
    const html = renderPath(t, { entries: { a: { title: "Article A", date: "2020-01-01", collections: ["alpha"], ...metadata } } });
    assert.equal(primaryDestination(html), undefined);
    assert.match(html, /Browse the library/);
  }
});

test("public listing and detail share eligible membership while raw resolver retains preview inventory", (t) => {
  const entries = Object.fromEntries(Object.entries({
    draft: { draft: true }, future: { date: "2030-01-01" }, queued: { publishDate: "2030-01-01" }, expired: { expiryDate: "2020-08-01" },
  }).map(([slug, metadata]) => [slug, { title: slug, date: "2020-01-01", collections: ["alpha"], ...metadata }]));
  const probe = renderPath(t, { entries, indexTemplate: '{{ $def := partial "collections/lookup-definition.html" "alpha" }}raw={{ len (partial "collections/resolve-items.html" (dict "collection" $def)) }};published={{ len (partial "collections/resolve-items.html" (dict "collection" $def "publishedOnly" true)) }};{{ range partial "collections/get-public-entries.html" . }}{{ .collection.slug }}={{ .state.count }};{{ end }}' });
  assert.match(probe, /raw=7;published=3;alpha=3;beta=2;/);
  const html = renderPath(t, { entries, collectionShell: true, outputRoute: "collections/alpha" });
  assert.match(html, /A focused collection description\./);
  assert.match(html, /3 published pieces/);
  assert.match(html, /Start Here[\s\S]*Article B/);
  for (const slug of ["a", "b", "c"]) assert.equal((html.match(new RegExp(`href="/essays/${slug}/"`, "g")) || []).length, 1);
  for (const slug of Object.keys(entries)) assert.doesNotMatch(html, new RegExp(`/essays/${slug}/`));
  const privateList = renderPath(t, { landings: { beta: { draft: true } }, indexTemplate: '{{ range partial "collections/get-public-entries.html" . }}{{ .collection.slug }};{{ end }}' });
  assert.equal(privateList.trim(), "alpha;");
});

function directoryCounts(html) {
  const summary = html.match(/class="collections-broadsheet__summary">(\d+) public collections &middot; (\d+) published pieces/);
  assert.ok(summary, "the actual directory summary must render");
  const groups = Object.fromEntries([...html.matchAll(/<section[^>]*aria-labelledby="collections-group-([^"]+)">([\s\S]*?)<\/section>/g)].map(([, kind, section]) => {
    const meta = section.match(/class="collections-broadsheet__section-meta">(\d+) collections &middot; (\d+) pieces/);
    assert.ok(meta, `${kind} directory totals must render`);
    return [kind, { collections: Number(meta[1]), pieces: Number(meta[2]) }];
  }));
  const cards = Object.fromEntries([...html.matchAll(/<article class="collection-record">([\s\S]*?)<\/article>/g)].map(([, card]) => {
    const slug = card.match(/data-analytics-collection="([^"]+)"/)?.[1];
    const count = card.match(/<span>(\d+) pieces<\/span>/)?.[1];
    assert.ok(slug && count, "the actual collection card must retain its member count");
    return [slug, Number(count)];
  }));
  return { collections: Number(summary[1]), pieces: Number(summary[2]), groups, cards };
}

test("collection directory deduplicates overall and per-kind pieces without changing individual card counts", (t) => {
  const collections = ["alpha", "beta", "gamma", "delta"].map((slug, index) => ({
    slug, title: slug, kind: index < 2 ? "topic" : "series", weight: index,
    public: true, force_public: true, explicit_only: true,
  }));
  const memberships = { a: ["alpha", "beta"], b: ["alpha", "gamma"], c: ["gamma", "delta"], d: ["beta"], e: ["delta"] };
  const entries = Object.fromEntries(Object.entries(memberships).map(([slug, memberOf]) => [slug, {
    title: "Shared display title", date: "2020-01-01", collections: memberOf,
    ...(slug === "a" ? { url: "/canonical/article-a/" } : {}),
  }]));
  const html = renderPath(t, { collections, entries, collectionDirectory: true, outputRoute: "collections" });
  assert.deepEqual(directoryCounts(html), {
    collections: 4, pieces: 5,
    groups: { series: { collections: 2, pieces: 3 }, topic: { collections: 2, pieces: 3 } },
    cards: { alpha: 2, beta: 2, gamma: 2, delta: 2 },
  });
});

test("collection directory totals exclude unpublished members and ineligible collection entries", (t) => {
  const unavailableLandings = {
    missing: null, draft: { draft: true }, future: { date: "2030-01-01" },
    queued: { publishDate: "2030-01-01" }, expired: { expiryDate: "2020-08-01" },
  };
  const collections = ["alpha", "beta", "private", "small", ...Object.keys(unavailableLandings)].map((slug) => ({
    slug, title: slug, kind: slug === "beta" ? "series" : "topic", public: slug !== "private",
    force_public: slug !== "small", min_items: 2, explicit_only: true,
  }));
  const entries = Object.fromEntries(["private", "small", ...Object.keys(unavailableLandings), "unassigned"].map((slug) => [slug, {
    title: slug, date: "2020-01-01", collections: [slug],
  }]));
  for (const [slug, metadata] of Object.entries(unavailableLandings)) {
    if (metadata) entries[`member-${slug}`] = { title: slug, date: "2020-01-01", collections: ["alpha", "beta"], ...metadata };
  }
  const html = renderPath(t, { collections, entries, landings: unavailableLandings, collectionDirectory: true, outputRoute: "collections" });
  assert.deepEqual(directoryCounts(html), {
    collections: 2, pieces: 3,
    groups: { series: { collections: 1, pieces: 2 }, topic: { collections: 1, pieces: 3 } },
    cards: { alpha: 3, beta: 2 },
  });
});

test("collection pages preserve curated ordering and newest-first unweighted ordering", (t) => {
  const curated = renderPath(t, { collectionShell: true, outputRoute: "collections/alpha", startHere: "missing" });
  assert.ok(curated.indexOf('/essays/a/') < curated.indexOf('/essays/b/'));
  assert.ok(curated.indexOf('/essays/b/') < curated.indexOf('/essays/c/'));
  const entries = Object.fromEntries(["a", "b", "c"].map((slug, index) => [slug, { title: slug, date: `2020-0${index + 1}-01`, collections: ["alpha"] }]));
  const newest = renderPath(t, { entries, collectionShell: true, outputRoute: "collections/alpha", startHere: "missing" });
  assert.ok(newest.indexOf('/essays/c/') < newest.indexOf('/essays/b/'));
  assert.ok(newest.indexOf('/essays/b/') < newest.indexOf('/essays/a/'));
});

test("Syd and Oliver opts into a duplicate-free oldest-first list without a promoted starter", (t) => {
  const source = fs.readFileSync("data/collections.yaml", "utf8");
  const syd = source.match(/^  - slug: syd-and-oliver-dialogues\r?\n([\s\S]*?)(?=^  - slug:|$(?![\s\S]))/m)?.[1];
  assert.ok(syd, "the dialogue collection must exist");
  assert.match(syd, /^    order: oldest-first$/m);
  assert.doesNotMatch(syd, /^    start_here:/m);
  assert.equal((source.match(/^    order: oldest-first$/gm) || []).length, 1, "other collections retain their current ordering");

  const html = renderPath(t, {
    collections: [{ slug: "alpha", title: "Chronological series", kind: "series", public: true, force_public: true, explicit_only: true, order: "oldest-first" }],
    entries: {
      a: { title: "Newest", date: "2020-03-01", collections: ["alpha"], collection_weight: 1 },
      b: { title: "Oldest", date: "2020-01-01", collections: ["alpha"], collection_weight: 9 },
      c: { title: "Zebra", date: "2020-02-01", collections: ["alpha"], collection_weight: 2 },
      d: { title: "Alpha", date: "2020-02-01", collections: ["alpha"] },
    },
    collectionShell: true,
    outputRoute: "collections/alpha",
  });
  const paths = [...html.matchAll(/class="fixture-collection-item" href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(paths, ["/essays/b/", "/essays/d/", "/essays/c/", "/essays/a/"]);
  assert.doesNotMatch(html, /collection-start-here-title/);
  assert.match(html, /4 published pieces/);
});

const organizationCollection = (values = {}) => ({
  slug: "alpha", title: "Alpha collection", kind: "topic", public: true,
  force_public: true, explicit_only: true, start_here: "b", ...values,
});
const sectionProbe = '{{ $definition := partial "collections/lookup-definition.html" "alpha" }}{{ $items := partial "collections/resolve-items.html" (dict "collection" $definition "publishedOnly" true) }}{{ range partial "collections/resolve-sections.html" (dict "collection" $definition "items" $items "startHereSlug" $definition.start_here) }}{{ .id }}|{{ .title }}={{ range .items }}{{ .File.BaseFileName }},{{ end }};{{ end }}';
const relatedProbe = 'related={{ $definition := partial "collections/lookup-definition.html" "alpha" }}{{ range partial "collections/resolve-related.html" (dict "collection" $definition) }}{{ .collection.slug }};{{ end }}';

test("section organization preserves resolved item order and omits the promoted starter and empty sections", (t) => {
  const html = renderPath(t, {
    collections: [organizationCollection({ sections: [
      { id: "starter-only", title: "Starter only", items: ["b"] },
      { id: "second-topic", title: "Second topic", items: ["c", "a"] },
      { id: "unavailable", title: "Unavailable", items: ["missing"] },
    ] })],
    indexTemplate: sectionProbe,
  });
  assert.equal(html.trim(), "second-topic|Second topic=a,c,;");
});

test("grouped collection pages render published members once while previews omit unavailable groups", (t) => {
  const entries = Object.fromEntries(Object.entries({
    draft: { draft: true }, future: { date: "2030-01-01" },
    queued: { publishDate: "2030-01-01" }, expired: { expiryDate: "2020-08-01" },
  }).map(([slug, metadata]) => [slug, { title: slug, date: "2020-01-01", collections: ["alpha"], ...metadata }]));
  const collections = [organizationCollection({ sections: [
    { id: "later-topic", title: "Later topic", items: ["c", "b"] },
    { id: "earlier-topic", title: "Earlier topic", items: ["a"] },
    { id: "preview-only", title: "Preview only", items: Object.keys(entries) },
  ] })];
  const probe = renderPath(t, { entries, collections, indexTemplate: sectionProbe });
  assert.equal(probe.trim(), "later-topic|Later topic=c,;earlier-topic|Earlier topic=a,;");
  const html = renderPath(t, { entries, collections, collectionShell: true, outputRoute: "collections/alpha" });
  const paths = [...html.matchAll(/class="fixture-collection-item" href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(paths, ["/essays/b/", "/essays/c/", "/essays/a/"]);
  assert.match(html, /3 published pieces/);
  assert.match(html, /Later topic/);
  assert.match(html, /Earlier topic/);
  assert.doesNotMatch(html, /Preview only|preview-only/);
  for (const slug of Object.keys(entries)) assert.doesNotMatch(html, new RegExp(`/essays/${slug}/`));
});

test("related collections follow explicit editorial order instead of kind or definition weight", (t) => {
  const collections = [
    organizationCollection({ related_collections: ["gamma", "beta"] }),
    organizationCollection({ slug: "beta", title: "Beta", weight: 1 }),
    organizationCollection({ slug: "gamma", title: "Gamma", kind: "series", weight: 99 }),
  ];
  assert.equal(renderPath(t, { collections, indexTemplate: relatedProbe }).trim(), "related=gamma;beta;");
  const html = renderPath(t, { collections, collectionShell: true, outputRoute: "collections/alpha" });
  const paths = [...html.matchAll(/class="fixture-related-collection" href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(paths, ["/collections/gamma/", "/collections/beta/"]);
});

test("related collections omit unavailable targets without substituting other public collections", (t) => {
  for (const scenario of [
    { definition: { public: false } },
    { definition: { min_items: 99, force_public: false } },
    { landing: null }, { landing: { draft: true } }, { landing: { date: "2030-01-01" } },
    { landing: { publishDate: "2030-01-01" } }, { landing: { expiryDate: "2020-08-01" } },
  ]) {
    const collections = [
      organizationCollection({ related_collections: ["beta", "missing"] }),
      organizationCollection({ slug: "beta", title: "Beta", ...scenario.definition }),
      organizationCollection({ slug: "other", title: "Other available collection" }),
    ];
    const landings = Object.hasOwn(scenario, "landing") ? { beta: scenario.landing } : {};
    assert.equal(renderPath(t, { collections, landings, indexTemplate: relatedProbe }).trim(), "related=");
    const html = renderPath(t, { collections, landings, collectionShell: true, outputRoute: "collections/alpha" });
    assert.doesNotMatch(html, /Related Collections|fixture-related-collection/);
  }
});

test("collections without related metadata do not manufacture recommendations", (t) => {
  assert.equal(renderPath(t, { indexTemplate: relatedProbe }).trim(), "related=");
});

test("source organization validation rejects incomplete or invalid assignments and related maps", (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "oip-organization-contract-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, "data"));
  fs.mkdirSync(path.join(fixture, "content", "essays"), { recursive: true });
  const definitions = [
    organizationCollection({ related_collections: ["beta", "gamma"], sections: [
      { id: "first", title: "First", items: ["a", "b"] },
      { id: "scheduled", title: "Scheduled", items: ["queued", "expired"] },
    ] }),
    organizationCollection({ slug: "beta", related_collections: ["alpha", "gamma"] }),
    organizationCollection({ slug: "gamma", related_collections: ["alpha", "beta"] }),
  ];
  for (const [slug, overrides] of Object.entries({
    a: {}, b: {}, queued: { publishDate: "2099-01-01" }, expired: { expiryDate: "2020-01-02" }, outsider: { collections: ["beta"] }, draft: { draft: true },
  })) {
    const metadata = { title: slug, date: "2020-01-01", collections: ["alpha"], ...overrides };
    fs.writeFileSync(path.join(fixture, "content", "essays", `${slug}.md`), `${JSON.stringify(metadata)}\n\nFixture body.\n`);
  }
  const run = (collections) => {
    // JSON is valid YAML; use Hugo's parser through the source validator.
    fs.writeFileSync(path.join(fixture, "data", "collections.yaml"), JSON.stringify({ collections }));
    const result = spawnSync(process.env.OIP_PWSH_BIN || "pwsh", [
      "-NoLogo", "-NoProfile", "-File", path.resolve("tests/test_collection_organization_contract.ps1"),
      "-Root", fixture, "-HugoPath", hugo,
    ], { encoding: "utf8" });
    assert.ifError(result.error);
    return { status: result.status, output: `${result.stdout}\n${result.stderr}`.replace(/\u001b\[[0-9;]*m/g, "").replace(/\r?\n\s*\|/g, " ").replace(/\s+/g, " ") };
  };
  const valid = run(definitions);
  assert.equal(valid.status, 0, valid.output);
  for (const [label, mutate, expected] of [
    ["duplicate ID", (defs) => { defs[0].sections[1].id = "first"; }, /duplicate section ID/],
    ["invalid ID", (defs) => { defs[0].sections[0].id = "Bad ID"; }, /invalid section ID/],
    ["missing title", (defs) => { defs[0].sections[0].title = ""; }, /section title is required/],
    ["duplicate assignment", (defs) => { defs[0].sections[1].items.push("a"); }, /duplicate section assignment/],
    ["unknown article", (defs) => { defs[0].sections[0].items.push("missing"); }, /unknown canonical article slug/],
    ["nonmember", (defs) => { defs[0].sections[0].items.push("outsider"); }, /sections cannot grant membership/],
    ["omitted queued member", (defs) => { defs[0].sections[1].items = ["expired"]; }, /non-draft member 'queued' has no section assignment/],
    ["omitted expired member", (defs) => { defs[0].sections[1].items = ["queued"]; }, /non-draft member 'expired' has no section assignment/],
    ["self relation", (defs) => { defs[0].related_collections = ["alpha", "beta"]; }, /related destination must not be itself/],
    ["duplicate relation", (defs) => { defs[0].related_collections = ["beta", "beta"]; }, /duplicate related destination/],
    ["unknown relation", (defs) => { defs[0].related_collections = ["beta", "missing"]; }, /unknown related destination/],
    ["private relation", (defs) => { defs[2].public = false; delete defs[2].related_collections; }, /private related destination/],
  ]) {
    const changed = structuredClone(definitions);
    mutate(changed);
    const invalid = run(changed);
    assert.notEqual(invalid.status, 0, `${label} must fail`);
    assert.match(invalid.output, expected, label);
  }
});

test("standard reading exit retains body, then one continuation, record, and newsletter", (t) => {
  const html = renderPath(t, { articleShell: true });
  assert.match(html, /class="piece-body">\s*<p>Existing article body\.<\/p>/);
  assert.match(html, /piece-body[\s\S]*Existing article body\.[\s\S]*reading-path[\s\S]*<\/aside>[\s\S]*article-publication-record[\s\S]*Cite this[\s\S]*<form class="newsletter-signup--article-exit">/);
  assert.equal((html.match(/<aside class="reading-path"/g) || []).length, 1);
  assert.equal((html.match(/<form class="newsletter-signup--article-exit"/g) || []).length, 1);
  assert.doesNotMatch(html, /newsletter-prompt--article-exit|journey-links--article-exit|Article paths/);
});

test("no-collection reading pages get a Library fallback while custom and Studio exits are unchanged", (t) => {
  const noCollection = renderPath(t, {
    articleShell: true,
    entries: { a: { title: "Standalone", date: "2020-01-01", collections: ["unlisted"] } },
  });
  assert.match(noCollection, /Browse the library[\s\S]*article-publication-record[\s\S]*newsletter-signup--article-exit/);
  assert.doesNotMatch(noCollection, /data-reading-path-root|newsletter-prompt--article-exit|journey-links--article-exit/);
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

test("informational pages never mount the standard reading continuation", (t) => {
  const html = renderPath(t, { articleShell: true, section: "about" });
  assert.doesNotMatch(html, /class="reading-path|Browse the library|Explore all/);
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
