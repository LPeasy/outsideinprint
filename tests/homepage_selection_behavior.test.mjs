import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const hugo = process.env.OIP_HUGO_BIN || (fs.existsSync(".tools/hugo-0.167.0/hugo")
  ? path.resolve(".tools/hugo-0.167.0/hugo") : "hugo");
const flagship = "/essays/why-daylight-saving-time/";
const formerFlagship = "/essays/benjamin-franklin-how-americas-funniest-founder-made-greatness-feel-possible/";
const disneyOpening = "/essays/walt-disney-world-opening-1971/";
const noise = "/essays/the-noise-of-the-crowd/";
const coinSlot = "/essays/the-coin-slot-on-the-corner/";
const guestRoute = "/essays/a-public-record-must-outlast-the-feed/";
const guestMetadata = {
  title: "A Public Record Must Outlast the Feed", url: guestRoute,
  date: "2020-07-01", publishDate: "2020-07-01T09:00:00Z",
  section_label: "Essay", contributor_role: "guest", author: "Douglas B. Vandergraph",
  description: "Keep a lasting public record.",
};
const elijahRoute = "/essays/breach-of-confidence-therapy-records/";
const elijahMetadata = {
  title: "Breach of Confidence: How Private Are Your Therapy Records?", url: elijahRoute,
  date: "2026-10-27", publishDate: "2026-10-27T11:00:00-04:00",
  section_label: "Essay", contributor_role: "guest", author: "Elijah Fernandez, MSW, PMP, CISSP",
};

function renderSelection(t, overrides = {}, summaries = false, clock = "2020-09-01T12:00:00Z", cartoons = []) {
  assert.match(execFileSync(hugo, ["version"], { encoding: "utf8" }), /^hugo v0\.167\.0/);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "oip-home-selection-"));
  t.after(() => {
    assert.ok(path.resolve(fixture).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    fs.writeFileSync(path.join(fixture, file), content);
  };
  write("hugo.toml", 'baseURL = "https://example.test/"\ndisableKinds = ["taxonomy", "term", "RSS", "sitemap"]\n');
  for (const partial of ["home_v2_selected.html", "home_guest_selected.html", "home_guest_feature.html", "authors/resolve.html", "archive/longform-kind.html", "collections/normalize-values.html", "home_lead_summary.html", "discovery/page-summary.html", "metadata_description.html", "metadata/route.html", "collections/lookup-definition.html"]) {
    write(`layouts/partials/${partial}`, fs.readFileSync(`layouts/partials/${partial}`, "utf8"));
  }
  write("data/organization.json", JSON.stringify({ default_author_id: "robert-v-ussley" }));
  write("data/authors.json", JSON.stringify({ authors: { "robert-v-ussley": { type: "Person", name: "Robert V. Ussley" } } }));
  if (summaries === "frontpage") {
    for (const partial of ["home_v2_front_page.html", "home_feature_freshness.html", "home_featured_image_button.html", "home_featured_image_dialog.html", "editorial/cartoon-for-page.html", "editorial/published-cartoons.html", "editorial/registered-cartoons.html", "editorial/cartoon-is-published.html"]) {
      write(`layouts/partials/${partial}`, fs.readFileSync(`layouts/partials/${partial}`, "utf8"));
    }
    // Isolate selection and the real homepage/zoom markup from derivative generation and signup content.
    write("layouts/partials/images/model.html", '{{ return dict "id" .ref "lightbox_url" (printf "/fixture/%s/large.webp" .ref) "lightbox_width" 1600 "lightbox_height" 900 }}');
    write("layouts/partials/images/picture.html", '<img src="/fixture/{{ .model.id }}.webp" data-oip-image-id="{{ .model.id }}" alt="{{ .alt }}" loading="{{ .loading }}">');
    write("layouts/partials/home_reader_newsletter.html", "");
    write("assets/js/home-featured-image.js", "/* Homepage composition fixture. */");
    write("data/homepage_metrics.json", JSON.stringify({ reader_threshold: 1000, articles: {} }));
    write("data/editorial_cartoons.json", JSON.stringify({ cartoons }));
  }
  write("layouts/index.html", summaries === "frontpage"
    ? '{{ partial "home_v2_front_page.html" . }}'
    : summaries === "guest"
    ? '{{ $paths := slice }}{{ range partial "home_v2_selected.html" . }}{{ $paths = $paths | append .RelPermalink }}{{ end }}{{ $guestPath := false }}{{ $guestHtml := "" }}{{ with partial "home_guest_selected.html" . }}{{ $guestPath = .RelPermalink }}{{ $guestHtml = partial "home_guest_feature.html" . }}{{ end }}{{ dict "featured" $paths "guest" $guestPath "html" $guestHtml | jsonify | safeHTML }}'
    : summaries
    ? '{{ $results := dict }}{{ range site.RegularPages }}{{ $results = merge $results (dict .File.BaseFileName (dict "lead" (partial "home_lead_summary.html" .) "discovery" (partial "discovery/page-summary.html" .))) }}{{ end }}{{ $results | jsonify | safeHTML }}'
    : '{{ $paths := slice }}{{ range partial "home_v2_selected.html" . }}{{ $paths = $paths | append .RelPermalink }}{{ end }}{{ $paths | jsonify | safeHTML }}');
  write("layouts/_default/single.html", '{{ .Title }}<img src="{{ .Params.featured_image }}" alt="{{ .Params.featured_image_alt }}">');
  write("layouts/_default/list.html", "{{ .Title }}");
  const entries = {
    flagship: { title: "Why Daylight Saving Time?", url: flagship, date: "2020-01-01", section_label: "Essay" },
    formerFlagship: { title: "Benjamin Franklin", url: formerFlagship, date: "2019-01-01", section_label: "Modern Bio" },
    disneyOpening: { title: "How Walt Disney World Opened in 1971: Walt’s Plans, Roy’s Role", url: disneyOpening, date: "2020-01-01", section_label: "Essay" },
    noise: { title: "The Noise of the Crowd", url: noise, date: "2020-01-01", section_label: "Musing", library_type: "musing", collections: ["musings"], source_mode: "SOURCE_FREE", external_factual_claims: "none" },
    coinSlot: { title: "The Coin Slot on the Corner", url: coinSlot, date: "2020-01-01", section_label: "Essay" },
    earlier: { title: "A earlier release", date: "2020-06-01", publishDate: "2020-06-01T09:00:00Z" },
    latest: { title: "Z later release", date: "2020-06-01", publishDate: "2020-06-01T12:00:00Z" },
    draft: { title: "Draft", date: "2020-07-01", draft: true },
    future: { title: "Future date", date: "2030-01-01", publishDate: "2020-07-01" },
    queued: { title: "Future release", date: "2020-07-01", publishDate: "2030-01-01" },
    expired: { title: "Expired", date: "2020-07-01", expiryDate: "2020-08-01" },
    malformed: { title: "Invalid affirmation", date: "2020-07-01", library_type: "affirmation" },
    ...overrides,
  };
  for (const [slug, metadata] of Object.entries(entries)) {
    if (metadata === null) continue;
    const frontMatter = Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
    write(`content/essays/${slug}.md`, `---\n${frontMatter}\n---\nFixture.\n`);
  }
  write("content/essays/_index.md", '---\ntitle: "Landing"\ndate: 2020-08-01\n---\n');
  write("content/shop/book.md", '---\ntitle: "Book"\ndate: 2020-08-01\n---\n');
  execFileSync(hugo, ["--source", fixture, "--clock", clock, "--buildDrafts", "--buildFuture", "--buildExpired", "--panicOnWarning"], { encoding: "utf8" });
  const output = fs.readFileSync(path.join(fixture, "public/index.html"), "utf8");
  if (summaries === "frontpage") {
    return { html: output, article: fs.readFileSync(path.join(fixture, "public", flagship, "index.html"), "utf8") };
  }
  return JSON.parse(output);
}

test("Why Daylight Saving Time? leads, followed by the latest release, while preview-only work stays excluded", (t) => {
  assert.deepEqual(renderSelection(t), [flagship, "/essays/latest/", disneyOpening, noise, coinSlot]);
});

test("the former flagship follows recency instead of retaining the lead", (t) => {
  assert.deepEqual(renderSelection(t, {
    formerFlagship: { title: "Benjamin Franklin", url: formerFlagship, date: "2020-08-01", section_label: "Modern Bio" },
  }), [flagship, formerFlagship, disneyOpening, noise, coinSlot]);
});

test("a newer flagship stays first and missing curated work receives newest eligible fallback", (t) => {
  const selection = renderSelection(t, {
    flagship: { title: "Why Daylight Saving Time?", url: flagship, date: "2020-06-01", publishDate: "2020-07-01" },
    noise: null,
  });
  assert.deepEqual(selection, [flagship, "/essays/latest/", disneyOpening, coinSlot, "/essays/earlier/"]);
  assert.equal(new Set(selection).size, 5);
});

test("when the flagship is unavailable, the two newest releases lead", (t) => {
  assert.deepEqual(renderSelection(t, { flagship: null }), [
    "/essays/latest/", "/essays/earlier/", disneyOpening, noise, coinSlot,
  ]);
});

test("a newly released curated piece occupies the latest slot only once", (t) => {
  assert.deepEqual(renderSelection(t, {
    noise: { title: "The Noise of the Crowd", url: noise, date: "2020-07-01", section_label: "Musing", library_type: "musing", collections: ["musings"], source_mode: "SOURCE_FREE", external_factual_claims: "none" },
  }), [flagship, noise, disneyOpening, coinSlot, "/essays/latest/"]);
});

test("the lead uses eligible associated Gallery art and matching zoom alt, with hero fallback and unchanged supporting art", (t) => {
  const leadMetadata = {
    title: "Why Daylight Saving Time?", url: flagship, date: "2020-01-01", section_label: "Essay",
    featured_image: "legacy/clock-illustration", featured_image_alt: "The existing clock illustration.",
  };
  const galleryArt = {
    slug: "daylight-after-work", essay: flagship, date: "2020-07-01",
    image: "editorial/daylight-after-work", alt: "Commuters leave a station beneath a large clock.",
  };
  const supportingArt = {
    slug: "supporting-gallery", essay: "/essays/latest/", date: "2020-07-01",
    image: "editorial/supporting-alternative", alt: "A separate Gallery illustration.",
  };
  const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || "";
  for (const [label, leadArt, expectedImage, expectedAlt] of [
    ["published", galleryArt, galleryArt.image, galleryArt.alt],
    ["missing", null, leadMetadata.featured_image, leadMetadata.featured_image_alt],
    ["unrelated", { ...galleryArt, essay: "/essays/someone-else/" }, leadMetadata.featured_image, leadMetadata.featured_image_alt],
    ["future", { ...galleryArt, publishDate: "2030-01-01T00:00:00Z" }, leadMetadata.featured_image, leadMetadata.featured_image_alt],
  ]) {
    const result = renderSelection(t, {
      flagship: leadMetadata,
      latest: { title: "Latest piece", date: "2020-06-01", publishDate: "2020-06-01T12:00:00Z", featured_image: "essays/latest/hero", featured_image_alt: "The supporting article hero." },
      guest: guestMetadata,
    }, "frontpage", "2020-09-01T12:00:00Z", [...(leadArt ? [leadArt] : []), supportingArt]);
    const lead = result.html.match(/<article\b[^>]*class="home-v2-featured__lead reading-card"[^>]*>([\s\S]*?)<\/article>/)?.[1];
    assert.ok(lead, label);
    const image = lead.match(/<img\b[^>]*>/)?.[0];
    const zoom = lead.match(/<button\b[^>]*data-home-featured-image-trigger[^>]*>/)?.[0];
    const fallback = lead.match(/<a\b[^>]*data-home-featured-image-fallback[^>]*>/)?.[0];
    assert.equal(attr(image, "data-oip-image-id"), expectedImage, label);
    assert.equal(attr(image, "alt"), expectedAlt, label);
    assert.equal(attr(zoom, "data-image"), `/fixture/${expectedImage}/large.webp`, label);
    assert.equal(attr(zoom, "data-alt"), expectedAlt, label);
    assert.equal(attr(fallback, "href"), attr(zoom, "data-image"), label);
    assert.match(result.article, /src="legacy\/clock-illustration" alt="The existing clock illustration\."/, label);
    const support = result.html.match(/<article\b[^>]*home-v2-featured__item--latest[^>]*>([\s\S]*?)<\/article>/)?.[1];
    const supportImage = support?.match(/<img\b[^>]*>/)?.[0];
    const supportZoom = support?.match(/<button\b[^>]*data-home-featured-image-trigger[^>]*>/)?.[0];
    assert.equal(attr(supportImage, "data-oip-image-id"), "essays/latest/hero", label);
    assert.equal(attr(supportZoom, "data-alt"), "The supporting article hero.", label);
    assert.doesNotMatch(result.html, /editorial\/supporting-alternative/, label);
    assert.equal((result.html.match(/<article\b/g) || []).length, 6, label);
    assert.match(result.html, /Guest Feature[\s\S]*By Douglas B\. Vandergraph/, label);
  }
});

test("the eligible guest renders once below the flagship without consuming the latest supporting slot", (t) => {
  const result = renderSelection(t, { guest: guestMetadata }, "guest");
  assert.deepEqual(result.featured, [flagship, "/essays/latest/", disneyOpening, noise, coinSlot]);
  assert.equal(result.guest, guestRoute);
  assert.equal(new Set([...result.featured, result.guest]).size, 6);
  assert.equal((result.html.match(/<article\b/g) || []).length, 1);
  assert.match(result.html, /Guest Feature/);
  assert.match(result.html, /<h3\b[^>]*>[\s\S]*?href="\/essays\/a-public-record-must-outlast-the-feed\/"/);
  assert.match(result.html, /By Douglas B\. Vandergraph/);
  assert.doesNotMatch(result.html, /Keep a lasting public record\.|Read the guest essay/);
  assert.equal((result.html.match(/<a\b/g) || []).length, 1, "the image-free fixture has only its title link");
});

test("the reserved guest cannot become the lead or fill a missing curated slot", (t) => {
  const result = renderSelection(t, {
    guest: guestMetadata, flagship: null, noise: null,
    replacement: { title: "Older replacement", date: "2020-05-01" },
  }, "guest");
  assert.equal(result.guest, guestRoute);
  assert.equal(result.featured[0], "/essays/latest/");
  assert.ok(!result.featured.includes(guestRoute));
  assert.equal(new Set(result.featured).size, 5);
});

test("absent, draft, future, expired, or uncredited guest work leaves no Guest Feature card in previews", (t) => {
  const cases = {
    absent: null,
    draft: { ...guestMetadata, draft: true },
    futureDate: { ...guestMetadata, date: "2030-01-01" },
    futureRelease: { ...guestMetadata, publishDate: "2030-01-01" },
    expired: { ...guestMetadata, expiryDate: "2020-08-01" },
    anonymous: { ...guestMetadata, author: " \t " },
    ordinary: { ...guestMetadata, contributor_role: "contributing" },
    nonEssay: { ...guestMetadata, library_type: "dialogue", section_label: "Dialogue" },
  };
  for (const [name, metadata] of Object.entries(cases)) {
    const result = renderSelection(t, { guest: metadata }, "guest");
    assert.equal(result.guest, false, name);
    assert.equal(result.html, "", name);
    assert.equal(new Set(result.featured).size, 5, name);
    assert.ok(!result.featured.includes(guestRoute), `${name}: unavailable or non-Bob work stays out of regular slots`);
  }
});

test("all regular positions reject outside authors and contributor roles, including unselected guests", (t) => {
  const cases = {
    unselectedGuest: { author: "Another Guest", contributor_role: "guest" },
    unlabelledOutsideAuthor: { author: "Another Writer" },
    regularContributor: { author: "Another Writer", contributor_role: "contributing" },
    guestEditedByBob: { author: "Another Guest", editor_name: "Robert V. Ussley" },
    contributorWithDefaultByline: { contributor_role: "guest" },
    roleOverridesBob: { author_id: "robert-v-ussley", contributor_role: "guest" },
  };
  for (const [label, byline] of Object.entries(cases)) {
    const result = renderSelection(t, {
      guest: guestMetadata,
      flagship: { title: "Outside flagship", url: flagship, date: "2020-08-01", ...byline },
      disneyOpening: { title: "Outside curated piece", url: disneyOpening, date: "2020-08-01", ...byline },
      outside: { title: "Outside latest and fallback", date: "2020-08-01", ...byline },
      replacement: { title: "Bob replacement", date: "2020-05-01" },
    }, "guest");
    assert.equal(result.guest, guestRoute, label);
    assert.deepEqual(result.featured, ["/essays/latest/", "/essays/earlier/", noise, coinSlot, "/essays/replacement/"], label);
  }
});

test("regular slots honor Bob's author ID, legacy name and default while excluding other and mixed bylines", (t) => {
  const cases = {
    authorId: [{ author_id: "robert-v-ussley", author: "Ignored legacy display" }, true],
    legacyName: [{ author: "Robert V. Ussley" }, true],
    authorList: [{ authors: ["robert-v-ussley"] }, true],
    defaultByline: [{}, true],
    otherId: [{ author_id: "another-writer", author: "Robert V. Ussley" }, false],
    mixedByline: [{ authors: ["robert-v-ussley", "another-writer"] }, false],
    otherName: [{ author: "Another Writer" }, false],
  };
  for (const [label, [byline, eligible]] of Object.entries(cases)) {
    const selection = renderSelection(t, {
      candidate: { title: "Newest candidate", date: "2020-08-01", ...byline },
    });
    assert.equal(selection.includes("/essays/candidate/"), eligible, label);
    assert.equal(selection[1], eligible ? "/essays/candidate/" : "/essays/latest/", label);
  }
});

test("the guest is reserved only from its exact release clock onward", (t) => {
  const metadata = { ...guestMetadata, publishDate: "2026-10-12T09:00:00-04:00" };
  const before = renderSelection(t, { guest: metadata }, "guest", "2026-10-12T12:59:59Z");
  const after = renderSelection(t, { guest: metadata }, "guest", "2026-10-12T13:00:00Z");
  assert.equal(before.guest, false);
  assert.equal(before.html, "");
  assert.equal(after.guest, guestRoute);
  assert.ok(!after.featured.includes(guestRoute));
});

test("Elijah takes the guest slot at his release instant while Douglas remains its pre-release fallback", (t) => {
  const overrides = { guest: guestMetadata, elijah: elijahMetadata };
  const before = renderSelection(t, overrides, "guest", "2026-10-27T14:59:59Z");
  const atRelease = renderSelection(t, overrides, "guest", "2026-10-27T15:00:00Z");
  assert.equal(before.guest, guestRoute);
  assert.match(before.html, /By Douglas B\. Vandergraph/);
  assert.ok(!before.featured.includes(elijahRoute));
  assert.ok(!before.featured.includes(guestRoute));
  assert.equal(atRelease.guest, elijahRoute);
  assert.match(atRelease.html, /By Elijah Fernandez, MSW, PMP, CISSP/);
  assert.equal((atRelease.html.match(/<article\b/g) || []).length, 1);
  assert.ok(!atRelease.featured.includes(elijahRoute));
  assert.ok(!atRelease.featured.includes(guestRoute));
  assert.equal(new Set([...atRelease.featured, atRelease.guest]).size, 6);
});

test("an ineligible preferred guest falls back to Douglas without bypassing publication or credit guards", (t) => {
  const cases = {
    absent: null,
    draft: { ...elijahMetadata, draft: true },
    futureDate: { ...elijahMetadata, date: "2030-01-01" },
    futureRelease: { ...elijahMetadata, publishDate: "2030-01-01" },
    expired: { ...elijahMetadata, expiryDate: "2026-10-27T11:00:00-04:00" },
    anonymous: { ...elijahMetadata, author: " \t " },
    ordinary: { ...elijahMetadata, contributor_role: "contributing" },
    nonEssay: { ...elijahMetadata, library_type: "dialogue", section_label: "Dialogue" },
  };
  for (const [name, metadata] of Object.entries(cases)) {
    const result = renderSelection(t, { guest: guestMetadata, elijah: metadata }, "guest", "2026-10-27T15:00:00Z");
    assert.equal(result.guest, guestRoute, name);
    assert.match(result.html, /By Douglas B\. Vandergraph/, name);
    assert.equal(new Set([...result.featured, result.guest]).size, 6, name);
    assert.ok(!result.featured.includes(guestRoute), name);
  }
});

test("lead descriptions are trimmed and plain text while blank descriptions retain shared fallbacks", (t) => {
  const common = { title: "Summary fixture", date: "2020-01-01", subtitle: "Existing subtitle." };
  const summaries = renderSelection(t, {
    described: { ...common, description: "  <strong>Concrete invitation.</strong>  ", dek: "Existing dek." },
    missing: { ...common },
    empty: { ...common, description: "" },
    whitespace: { ...common, description: " \t\n " },
    emptyMarkup: { ...common, description: "  <span> </span> " },
    bodyFallback: { title: "Body fixture", date: "2020-01-01" },
  }, true);
  assert.deepEqual(summaries.described, { lead: "Concrete invitation.", discovery: "Existing dek." });
  for (const slug of ["missing", "empty", "whitespace", "emptyMarkup"]) {
    assert.deepEqual(summaries[slug], { lead: "Existing subtitle.", discovery: "Existing subtitle." }, slug);
  }
  assert.deepEqual(summaries.bodyFallback, { lead: "Fixture.", discovery: "Fixture." });
});

test("publication selection respects Eastern midnight and both DST offsets", (t) => {
  for (const [release, before, after] of [
    ["2026-03-08T00:00:00-05:00", "2026-03-08T04:59:59Z", "2026-03-08T05:00:01Z"],
    ["2026-03-08T03:00:00-04:00", "2026-03-08T06:59:59Z", "2026-03-08T07:00:01Z"],
    ["2026-11-01T01:30:00-05:00", "2026-11-01T06:29:59Z", "2026-11-01T06:30:01Z"],
  ]) {
    const page = { title: "Timed release", date: "2020-01-01", publishDate: release };
    assert.ok(!renderSelection(t, { timed: page }, false, before).includes("/essays/timed/"), release);
    assert.ok(renderSelection(t, { timed: page }, false, after).includes("/essays/timed/"), release);
  }
});
