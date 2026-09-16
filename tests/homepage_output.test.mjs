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
  "/essays/why-a-return-to-the-gold-standard-would-break-the-economy/",
  "/syd-and-oliver/what-i-had/",
  "/essays/the-little-prince-10-powerful-quotes-that-will-change-how-you-see-life/",
  "/essays/russias-slow-surrender-how-china-is-turning-putin-s-war-into-a-power-play/",
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
    const kind = route.startsWith("/syd-and-oliver/") ? "Dialogue" : attribute(sectionMeta || "", "content");
    assert.ok(kind, `${route} must have a canonical form label`);
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
  }
  assert.match(html, /The latest publication, alongside reader favorites and defining work\./);
  assert.match(html, /Read the piece/);
  assert.doesNotMatch(html, /25 reads|Medium reads|(?:3\.4K|1\.95K|1\.8K) readers/);
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
