import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const siteDir = path.resolve(process.env.OIP_SITE_DIR || "public");
const html = fs.readFileSync(path.join(siteDir, "index.html"), "utf8");
const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
};
const text = (markup) => markup.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const archiveFiles = [path.join(siteDir, "archive/index.html")];
const archivePages = path.join(siteDir, "archive/page");
if (fs.existsSync(archivePages)) {
  for (const page of fs.readdirSync(archivePages)) {
    const file = path.join(archivePages, page, "index.html");
    if (fs.existsSync(file)) archiveFiles.push(file);
  }
}
const archiveRoutes = new Set(archiveFiles.flatMap((file) =>
  [...fs.readFileSync(file, "utf8").matchAll(/<div\b[^>]*class=(?:"t"|t)[^>]*>\s*(<a\b[^>]*>)/g)]
    .map((match) => attribute(match[1], "href"))));
const hugo = process.env.OIP_HUGO_BIN || (fs.existsSync(".tools/hugo-0.164.0/hugo")
  ? path.resolve(".tools/hugo-0.164.0/hugo") : "hugo");
assert.match(execFileSync(hugo, ["version"], { encoding: "utf8" }), /^hugo v0\.164\.0/);
const config = process.env.OIP_HUGO_CONFIG || "hugo.toml,hugo.v2.toml";
// Hugo owns publication dates. CSV parsing handles quoted titles and embedded commas.
const csv = execFileSync(hugo, ["list", "published", "--config", config], { encoding: "utf8" });
const rows = csv.trim().split(/\r?\n/).map((line) =>
  [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)]
    .map((match) => match[1].replace(/^"|"$/g, "").replace(/""/g, '"')));
const columns = rows.shift();
const observationTime = Date.now();
const publishedRoutes = rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])))
  .map((row) => ({ ...row, route: new URL(row.permalink).pathname }))
  .filter((row) => row.kind === "page" && archiveRoutes.has(row.route)
    && Date.parse(row.date) <= observationTime && Date.parse(row.publishDate) <= observationTime)
  .sort((a, b) => Date.parse(b.publishDate) - Date.parse(a.publishDate) || a.title.localeCompare(b.title))
  .map((row) => row.route);
const pinnedRoutes = [
  "/essays/the-dolphin-company/",
  "/syd-and-oliver/what-i-had/",
  "/essays/default-owner/",
  "/essays/reverse-origami/",
];
const metricsSource = fs.readFileSync(path.resolve("data/homepage_metrics.yaml"), "utf8");
const threshold = Number(metricsSource.match(/^reader_threshold: (\d+)$/m)?.[1]);
const metricRecords = new Map([...metricsSource.matchAll(/^ {2}"([^"]+)":\n([\s\S]*?)(?=^ {2}"|$(?![\s\S]))/gm)]
  .map((match) => [match[1], {
    value: Number(match[2].match(/^ {4}value: (\d+)$/m)?.[1]),
    label: match[2].match(/^ {4}display_label: "([^"]+)"$/m)?.[1],
  }]));

test("rendered stats open the homepage and the newsletter cell reaches its focusable heading", () => {
  assert.doesNotMatch(html, /home-v2__support|Support Independent Media/);
  const newsletterLinks = [...html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)]
    .filter((match) => attribute(match[1], "class").split(/\s+/).includes("home-reader-banner__newsletter-link"));
  assert.equal(newsletterLinks.length, 1);
  assert.equal(attribute(newsletterLinks[0][1], "href"), "#home-reader-banner-title");
  assert.match(newsletterLinks[0][2], /^\s*<strong>Weekly<\/strong>\s*<span>Newsletter<\/span>\s*$/);
  assert.doesNotMatch(newsletterLinks[0][1], /\bonclick=|\brole=|\btabindex=/, "use a native link, not a scripted control");
  const heading = [...html.matchAll(/<h2\b[^>]*>/g)].map((match) => match[0])
    .find((tag) => attribute(tag, "id") === "home-reader-banner-title");
  assert.ok(heading);
  assert.equal(attribute(heading, "tabindex"), "-1");
  assert.ok(html.indexOf(newsletterLinks[0][1]) < html.indexOf(heading));
});

test("Dolphin correction retains the original publication date and renders a consistent new edition record", () => {
  const dolphinHtml = fs.readFileSync(path.join(siteDir, "essays/the-dolphin-company/index.html"), "utf8");
  const source = fs.readFileSync(path.resolve("content/essays/the-dolphin-company.md"), "utf8");
  assert.match(source, /^date: 2026-01-16\r?$/m);
  assert.match(source, /^version: "2\.0"\r?$/m);
  assert.match(source, /^edition: "Fifth web edition"\r?$/m);
  assert.match(dolphinHtml, /Fifth web edition/);
  const citation = [...dolphinHtml.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/g)]
    .map((match) => text(match[1])).find((value) => value.includes("Version 2.0."));
  assert.ok(citation);
  assert.match(citation, /Outside In Print, 2026-01-16\. Version 2\.0\. https:\/\/outsideinprint\.org\/essays\/the-dolphin-company\//);
  const currentRevision = source.match(/revision_history:\s*\n\s+- version: "2\.0"\s*\n\s+date: "([^"]+)"\s*\n\s+note: "([^"]+)"/);
  assert.ok(currentRevision);
  assert.match(text(dolphinHtml), new RegExp(`Version 2\\.0 \\| ${currentRevision[1]}`));
  assert.ok(text(dolphinHtml).includes(currentRevision[2].replaceAll("'", "&#39;"))
    || text(dolphinHtml).includes(currentRevision[2]), "the complete correction note must render");
});

test("rendered homepage leads with Dolphin, then the newest remaining publication", () => {
  const cards = [...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)]
    .filter((match) => /\bhome-v2-featured__(?:lead|item)\b/.test(attribute(`<article ${match[1]}>`, "class")));
  assert.ok(publishedRoutes.length >= 5, "the production archive must supply published reading pages");
  const flagship = publishedRoutes.includes(pinnedRoutes[0]) ? pinnedRoutes[0] : publishedRoutes[0];
  const latest = publishedRoutes.find((route) => route !== flagship);
  const expected = [...new Set([flagship, latest, ...pinnedRoutes.slice(1).filter((route) =>
    publishedRoutes.includes(route)), ...publishedRoutes])].slice(0, 5);
  assert.equal(cards.length, 5);
  for (const [index, card] of cards.entries()) {
    const route = expected[index];
    const destination = fs.readFileSync(path.join(siteDir, route, "index.html"), "utf8");
    const sectionMeta = [...destination.matchAll(/<meta\b[^>]*>/g)]
      .find((match) => attribute(match[0], "property") === "article:section")?.[0];
    const canonicalKind = route.startsWith("/syd-and-oliver/") ? "Dialogue" : attribute(sectionMeta || "", "content");
    assert.ok(canonicalKind, `${route} must have a canonical form label`);
    const kind = route === "/essays/the-dolphin-company/" ? "Case study" : canonicalKind;
    if (route === "/essays/the-dolphin-company/") assert.equal(canonicalKind, "Essay", "Dolphin's homepage label must not reclassify its destination");
    if (route === "/essays/reverse-origami/") assert.equal(canonicalKind, "Musing");
    const metric = metricRecords.get(route);
    const badge = metric?.value >= threshold ? metric.label : "";
    const promoLink = card[2].match(/<a\b[^>]*data-analytics-source-slot=[^>]*>/)?.[0];
    assert.ok(promoLink, `${route} must retain promotion tracking`);
    assert.equal(attribute(promoLink, "href"), route);
    assert.equal(attribute(promoLink, "data-analytics-section"), kind);
    assert.ok(fs.existsSync(path.join(siteDir, route, "index.html")), `${route} must have a rendered destination`);
    const meta = card[2].match(/<p\b[^>]*class=(?:"home-v2-featured__meta"|home-v2-featured__meta)[^>]*>([\s\S]*?)<\/p>/)?.[1];
    assert.ok(meta);
    const newTags = [...meta.matchAll(/(<span\b[^>]*>)([^<]*)<\/span>/g)]
      .filter((match) => attribute(match[1], "class").split(/\s+/).includes("home-v2-featured__new-tag"));
    assert.deepEqual(newTags.map((match) => text(match[2])), index === 1 ? ["New!"] : []);
    const labels = [...meta.matchAll(/<span>(.*?)<\/span>/g)].map((match) => text(match[1]));
    assert.equal(labels[0], kind);
    assert.match(labels[1], /^\d+ min read$/);
    assert.deepEqual(labels.slice(2), badge ? [badge] : []);
    if (index === 0) {
      assert.doesNotMatch(card[2], /home-v2-featured__item-media|data-home-featured-image-trigger/);
      const leadImage = card[2].match(/<img\b[^>]*>/)?.[0];
      if (leadImage) {
        assert.equal(attribute(leadImage, "loading"), "eager");
        assert.equal(attribute(leadImage, "fetchpriority"), "high");
      }
    } else {
      const media = [...card[2].matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)]
        .filter((match) => attribute(match[1], "class").split(/\s+/).includes("home-v2-featured__item-media"));
      if (pinnedRoutes.includes(route)) assert.equal(media.length, 1, `${route} must reuse its existing illustration`);
      if (media.length) {
        assert.equal(media.length, 1);
        assert.equal(attribute(media[0][1], "href"), route);
        const illustration = media[0][2].match(/<img\b[^>]*>/)?.[0];
        assert.ok(illustration);
        assert.equal(attribute(illustration, "loading"), "lazy");
        assert.ok(attribute(illustration, "src"), "managed derivatives and legacy static images both need a real source");
        const triggerMarkup = card[2].match(/(<button\b[^>]*data-home-featured-image-trigger[^>]*>)([\s\S]*?)<\/button>/);
        const fallbackMarkup = card[2].match(/(<a\b[^>]*data-home-featured-image-fallback[^>]*>)([\s\S]*?)<\/a>/);
        const trigger = triggerMarkup?.[1];
        const fallback = fallbackMarkup?.[1];
        assert.ok(trigger, "the separate zoom control opens the image dialog");
        assert.ok(fallback, "a zoom link must work without JavaScript");
        assert.doesNotMatch(meta, /data-home-featured-image-trigger|data-home-featured-image-fallback/);
        assert.ok(card[2].indexOf(trigger) < card[2].indexOf("home-v2-featured__item-copy"));
        for (const artwork of [triggerMarkup[2], fallbackMarkup[2]]) {
          assert.doesNotMatch(artwork, /<img\b/, "zoom controls must not duplicate the article image");
        }
        assert.equal(attribute(trigger, "type"), "button");
        assert.equal(attribute(trigger, "aria-controls"), "home-featured-image-dialog");
        assert.equal(attribute(trigger, "aria-haspopup"), "dialog");
        assert.match(trigger, /\bhidden(?:\s|>)/);
        assert.ok(attribute(trigger, "data-image"));
        assert.equal(attribute(trigger, "data-image"), attribute(fallback, "href"));
        assert.equal(attribute(trigger, "data-alt"), attribute(illustration, "alt"));
        assert.ok(fs.existsSync(path.join(siteDir, new URL(attribute(trigger, "data-image"), "https://outsideinprint.org").pathname)));
      }
    }
  }
  assert.match(html, /A flagship case study, the latest publication, and selected work\./);
  assert.match(html, /Read the piece/);
  assert.doesNotMatch(html, /25 reads|Medium reads|(?:3\.4K|1\.95K|1\.8K) readers/);
});

test("supporting image enhancement has one native dialog and is loaded only on the homepage", () => {
  const dialogs = [...html.matchAll(/<dialog\b[^>]*>/g)].filter((match) => attribute(match[0], "id") === "home-featured-image-dialog");
  assert.equal(dialogs.length, 1);
  assert.equal(attribute(dialogs[0][0], "aria-labelledby"), "home-featured-image-title");
  assert.match(html, /<button\b[^>]*data-home-featured-image-close[^>]*>/);
  const script = html.match(/<script\b[^>]*home-featured-image[^>]*>/)?.[0];
  assert.ok(script);
  assert.match(script, /\bdefer(?:\s|>)/);
  assert.match(attribute(script, "integrity"), /^sha384-/);
  assert.ok(fs.existsSync(path.join(siteDir, attribute(script, "src"))));
  assert.doesNotMatch(fs.readFileSync(path.join(siteDir, "gallery/index.html"), "utf8"), /home-featured-image(?:\.min)?\./);
});

test("rendered homepage has one always-visible three-sentence welcome", () => {
  const expectedNote = "Outside In Print publishes independent reporting, essays, dialogues, and reflections. Find the evidence behind public issues and fresh perspectives on everyday life. Step away from doomscrolling, ads, and algorithmic feeds, and follow your own curiosity.";
  const note = html.match(/<p\b[^>]*class=(?:"home-front-page__welcome-copy"|home-front-page__welcome-copy)[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert.equal(note?.trim(), expectedNote);
  assert.doesNotMatch(note, /<[^>]+>/);
  assert.doesNotMatch(html, /home-reader-note-rest|data-reader-note-toggle|home-front-page__note-toggle|home-reader-note(?:\.min)?\./);
  const gallery = fs.readFileSync(path.join(siteDir, "gallery/index.html"), "utf8");
  assert.doesNotMatch(gallery, /home-reader-note(?:\.min)?\./);
  assert.doesNotMatch(html, /home-v2__subjects|Independent writing on history, economics, culture, and public life\./);
  assert.match(html, /250(?:\+|&#43;)<\/strong>\s*<span>Articles<\/span>/);
  const audience = html.match(/<div\b[^>]*class="[^"]*home-reader-banner__proof-item--audience[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(audience);
  const figures = [...audience.matchAll(/(<strong\b[^>]*>)([^<]*)<\/strong>/g)];
  assert.equal(figures.length, 2);
  assert.match(figures[0][2], /^10,000(?:\+|&#43;)$/);
  assert.ok(attribute(figures[1][1], "class").split(/\s+/).includes("home-reader-banner__audience-short"));
  assert.equal(attribute(figures[1][1], "aria-hidden"), "true");
  assert.match(figures[1][2], /^10k(?:\+|&#43;)$/);
  assert.match(audience, /<span>Readers<\/span>/);
});

test("rendered homepage puts two reading links before one newsletter signup and a contributor button", () => {
  const sections = [...html.matchAll(/<section\b[^>]*>/g)].map((match) => match[0]);
  const proofTag = sections.find((tag) => attribute(tag, "aria-label") === "Outside In Print at a glance");
  const newsletterTag = sections.find((tag) => attribute(tag, "class").split(/\s+/).includes("home-reader-newsletter"));
  const contributionTag = sections.find((tag) => attribute(tag, "aria-label") === "Become a contributor");
  assert.ok(proofTag);
  assert.ok(newsletterTag);
  assert.ok(contributionTag);
  assert.ok(html.indexOf('data-paper-route-launch') < html.indexOf(proofTag));
  assert.ok(html.indexOf(proofTag) < html.indexOf('data-theme-toggle'));
  const contributionStart = html.indexOf(contributionTag) + contributionTag.length;
  const contributionBody = html.slice(contributionStart, html.indexOf("</section>", contributionStart));
  assert.match(contributionBody, /^\s*<a\b[^>]*>Become a contributor<\/a>\s*$/);
  assert.doesNotMatch(contributionBody, /<article\b|<h[1-6]\b|<p\b|home-v2-next__contribute/);
  const contributionLink = contributionBody.match(/<a\b[^>]*>/)?.[0];
  assert.equal(attribute(contributionLink, "class"), "home-v2-next__cta");
  assert.equal(new URL(attribute(contributionLink, "href"), "https://outsideinprint.org").pathname, "/contribute/");
  assert.equal(attribute(newsletterTag, "aria-labelledby"), "home-reader-banner-title");

  const library = [...html.matchAll(/(<nav\b[^>]*>)([\s\S]*?)<\/nav>/g)]
    .find((match) => attribute(match[1], "class").split(/\s+/).includes("home-v2-library"));
  assert.ok(library);
  assert.equal(attribute(library[1], "aria-label"), "Keep reading");
  const links = [...library[2].matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)]
    .map((match) => [new URL(attribute(match[1], "href"), "https://outsideinprint.org").pathname, text(match[2])]);
  assert.deepEqual(links, [["/library/", "Browse the library"], ["/random/", "Surprise me"]]);
  const order = [proofTag, "home-front-page__orientation", "home-v2-featured", library[1], newsletterTag, contributionTag]
    .map((marker) => html.indexOf(marker));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  const proof = html.slice(html.indexOf(proofTag), html.indexOf("</section>", html.indexOf(proofTag)));
  assert.doesNotMatch(proof, /<form\b|home-reader-banner__signup/);

  const forms = [...html.matchAll(/(<form\b[^>]*>)([\s\S]*?)<\/form>/g)]
    .filter((match) => attribute(match[1], "data-analytics-event") === "newsletter_submit"
      || attribute(match[1], "action").startsWith("https://buttondown.com/api/emails/embed-subscribe/"));
  assert.equal(forms.length, 1, "render exactly one newsletter form");
  assert.equal(attribute(forms[0][1], "data-analytics-source-slot"), "homepage_reader_banner");
  assert.equal(attribute(forms[0][1], "method"), "post");
  assert.match(attribute(forms[0][1], "action"), /^https:\/\/buttondown\.com\/api\/emails\/embed-subscribe\/[^/]+$/);
  assert.ok(html.indexOf(forms[0][0]) > html.indexOf(newsletterTag));
  assert.ok(html.indexOf(forms[0][0]) < html.indexOf(contributionTag));
  const tags = [...html.matchAll(/<[a-z][^>]*>/gi)].map((match) => match[0]);
  for (const id of ["home-reader-email", "home-reader-banner-title"]) {
    assert.equal(tags.filter((tag) => attribute(tag, "id") === id).length, 1, `${id} must remain unique`);
  }
  const homeBody = html.slice(html.indexOf('<main id="main-content">'), html.indexOf(contributionTag));
  assert.doesNotMatch(homeBody, /href=(?:["'])?(?:https:\/\/outsideinprint\.org)?\/archive\//);
  assert.doesNotMatch(html, /The full imprint|Find your next question|home-v2-next__browse|Browse the archive|Search the library/);
});

test("homepage signup offers a brief from the current published Almanack edition", () => {
  const collection = fs.readFileSync(path.join(siteDir, "collections/bobs-almanack/index.html"), "utf8");
  const latestHeading = collection.match(/<h2\b[^>]*id=(?:"almanack-collection-latest-title"|almanack-collection-latest-title)[^>]*>\s*(<a\b[^>]*>)/)?.[1];
  assert.ok(latestHeading, "the Almanack collection must identify its current issue");
  const currentRoute = attribute(latestHeading, "href");
  const briefStart = html.indexOf("home-reader-newsletter__issue");
  const contributorStart = html.indexOf('aria-label="Become a contributor"', briefStart);
  assert.ok(briefStart > html.indexOf('data-analytics-source-slot=homepage_reader_banner'));
  assert.ok(contributorStart > briefStart);
  const brief = html.slice(briefStart, contributorStart);
  const fullIssueLink = [...brief.matchAll(/<a\b[^>]*>/g)]
    .map((match) => match[0]).find((tag) => attribute(tag, "class") === "home-reader-newsletter__issue-link");
  assert.ok(fullIssueLink);
  assert.equal(attribute(fullIssueLink, "href"), currentRoute);
  assert.match(brief, /New writing:/);
  assert.match(brief, /One number:/);
  assert.match(brief, /This week(?:'|&#39;|&#x27;)s virtue:/);
  assert.equal((brief.match(/<form\b/g) || []).length, 0, "the brief must not add another signup form");
});
