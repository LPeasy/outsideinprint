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

test("rendered homepage leads with the newest publishDate and preserves unique editorial supports", () => {
  const cards = [...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)]
    .filter((match) => /\bhome-v2-featured__(?:lead|item)\b/.test(attribute(`<article ${match[1]}>`, "class")));
  assert.ok(publishedRoutes.length >= 5, "the production archive must supply published reading pages");
  const expected = [...new Set([publishedRoutes[0], ...pinnedRoutes.filter((route) =>
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
        assert.ok(trigger, "the mobile square artwork opens the image dialog");
        assert.ok(fallback, "an image link must work without JavaScript");
        assert.doesNotMatch(meta, /data-home-featured-image-trigger|data-home-featured-image-fallback/);
        assert.ok(card[2].indexOf(trigger) < card[2].indexOf("home-v2-featured__item-copy"));
        for (const artwork of [triggerMarkup[2], fallbackMarkup[2]]) {
          const mobileImage = artwork.match(/<img\b[^>]*>/)?.[0];
          assert.ok(mobileImage, "mobile trigger and fallback must display the actual illustration");
          assert.equal(attribute(mobileImage, "src"), attribute(illustration, "src"));
          assert.equal(attribute(mobileImage, "alt"), attribute(illustration, "alt"));
          assert.equal(attribute(mobileImage, "loading"), "lazy");
          assert.equal(text(artwork), "");
          assert.doesNotMatch(artwork, /<svg\b/);
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
  assert.match(html, /The latest publication, reader favorites, and defining work\./);
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

test("rendered homepage has complete no-JavaScript note, hidden native control, and homepage-only enhancement", () => {
  const expectedNote = "However you found this site—through a search, a shared link, or a single essay—you are welcome here. Outside In Print is for readers tired of being hurried from clip to clip and headline to headline. Step outside the feed, stay with an idea, ask for the evidence, and make up your own mind. Read whatever catches your eye. Follow a question farther than the algorithm would. Come back when you want something worth your attention.";
  const note = html.match(/<p\b[^>]*class=(?:"home-front-page__welcome-copy"|home-front-page__welcome-copy)[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert.equal(text(note), expectedNote);
  const suffixTag = note.match(/<span\b[^>]*>/)?.[0];
  assert.equal(attribute(suffixTag, "id"), "home-reader-note-rest");
  assert.doesNotMatch(suffixTag, /\bhidden\b|aria-hidden/);
  const toggle = html.match(/<button\b[^>]*data-reader-note-toggle[^>]*>/)?.[0];
  assert.equal(attribute(toggle, "type"), "button");
  assert.equal(attribute(toggle, "aria-controls"), "home-reader-note-rest");
  assert.equal(attribute(toggle, "aria-expanded"), "true");
  assert.match(toggle, /\bhidden(?:\s|>)/);
  const script = html.match(/<script\b[^>]*home-reader-note[^>]*>/)?.[0];
  assert.ok(script);
  assert.match(script, /\bdefer(?:\s|>)/);
  assert.match(attribute(script, "integrity"), /^sha384-/);
  assert.ok(fs.existsSync(path.join(siteDir, attribute(script, "src"))));
  const gallery = fs.readFileSync(path.join(siteDir, "gallery/index.html"), "utf8");
  assert.doesNotMatch(gallery, /home-reader-note(?:\.min)?\./);
  assert.match(html, /Independent writing on history, economics, culture, and public life\./);
  assert.match(html, /250(?:\+|&#43;)<\/strong>\s*<span>Articles<\/span>/);
  assert.match(html, /10,000(?:\+|&#43;)<\/strong>\s*<span>Readers<\/span>/);
});

test("rendered homepage puts two reading links before one newsletter signup and a contributor button", () => {
  const sections = [...html.matchAll(/<section\b[^>]*>/g)].map((match) => match[0]);
  const proofTag = sections.find((tag) => attribute(tag, "aria-label") === "Outside In Print at a glance");
  const newsletterTag = sections.find((tag) => attribute(tag, "class").split(/\s+/).includes("home-reader-newsletter"));
  const contributionTag = sections.find((tag) => attribute(tag, "aria-label") === "Become a contributor");
  assert.ok(proofTag);
  assert.ok(newsletterTag);
  assert.ok(contributionTag);
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
  const homeBody = html.slice(html.indexOf(proofTag), html.indexOf(contributionTag));
  assert.doesNotMatch(homeBody, /href=(?:["'])?(?:https:\/\/outsideinprint\.org)?\/archive\//);
  assert.doesNotMatch(html, /The full imprint|Find your next question|home-v2-next__browse|Browse the archive|Search the library/);
});
