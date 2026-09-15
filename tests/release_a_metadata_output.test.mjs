import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const siteDir = path.resolve(process.env.OIP_SITE_DIR || "public");

function readOutput(relativePath) {
  const file = path.join(siteDir, relativePath);
  assert.ok(fs.existsSync(file), `missing rendered output ${file}`);
  return fs.readFileSync(file, "utf8");
}

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

function frontMatterScalar(relativePath, key) {
  const source = readSource(relativePath);
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(front, `missing front matter in ${relativePath}`);
  const match = front[1].match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, "m"));
  if (!match) return "";
  const value = match[1].trim();
  return ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ? value.slice(1, -1)
    : value;
}

function decodeHtml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&rsquo;", "’")
    .replaceAll("&#8217;", "’");
}

function attribute(html, tagName, attributeName, attributeValue, resultName = "content") {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) || [];
  for (const tag of tags) {
    const selector = tag.match(new RegExp(`\\b${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    if (!selector || (selector[1] || selector[2] || selector[3]) !== attributeValue) continue;
    const result = tag.match(new RegExp(`\\b${resultName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    return result ? decodeHtml(result[1] || result[2] || result[3]) : "";
  }
  return "";
}

function title(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1].trim()) : "";
}

function jsonLdNodes(html) {
  const nodes = [];
  for (const match of html.matchAll(/<script\b[^>]*type=(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const value = JSON.parse(match[1].trim());
    if (Array.isArray(value?.["@graph"])) nodes.push(...value["@graph"]);
    else nodes.push(value);
  }
  return nodes;
}

test("rendered Almanack metadata is unique and agrees across consumers", () => {
  const issueFiles = fs.readdirSync(path.resolve("content/almanack"))
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name));
  const renderedTitles = new Set();
  const renderedDescriptions = new Set();

  for (const fileName of issueFiles) {
    const issueDate = fileName.replace(/\.md$/, "");
    const expectedTitle = frontMatterScalar(`content/almanack/${fileName}`, "metadata_title");
    const expectedDescription = frontMatterScalar(`content/almanack/${fileName}`, "description");
    const html = readOutput(`almanack/${issueDate}/index.html`);
    const actualTitle = title(html);
    const metaDescription = attribute(html, "meta", "name", "description");
    assert.equal(actualTitle, expectedTitle, `${issueDate} browser title`);
    assert.equal(attribute(html, "meta", "property", "og:title"), expectedTitle);
    assert.equal(attribute(html, "meta", "name", "twitter:title"), expectedTitle);
    assert.equal(metaDescription, expectedDescription);
    assert.equal(attribute(html, "meta", "property", "og:description"), expectedDescription);
    assert.equal(attribute(html, "meta", "name", "twitter:description"), expectedDescription);
    const webPage = jsonLdNodes(html).find((node) => node?.["@type"] === "WebPage");
    assert.equal(webPage?.name, expectedTitle);
    renderedTitles.add(actualTitle.toLowerCase());
    renderedDescriptions.add(metaDescription.toLowerCase());
  }

  assert.equal(renderedTitles.size, issueFiles.length);
  assert.equal(renderedDescriptions.size, issueFiles.length);
});

test("rendered targeted descriptions and titles match their source records", () => {
  const dialogueSlugs = [
    "all-ti", "history-pushes-back", "peaches-or-greece", "smoke-and-brass", "the-free-lunch",
    "the-new-orthodoxy", "the-shape-of-sacrifice", "the-sound-of-authorit", "the-weight-of-promises",
    "willful-ignorance", "without-a-word"
  ];
  for (const slug of dialogueSlugs) {
    const expected = frontMatterScalar(`content/essays/dialogues/${slug}.md`, "description");
    const html = readOutput(`syd-and-oliver/${slug}/index.html`);
    assert.equal(attribute(html, "meta", "name", "description"), expected);
    assert.doesNotMatch(html, /&amp;(?:rsquo|lsquo|rdquo|ldquo);/i);
  }

  const essaySlugs = [
    "jack-stratton-and-the-vulfpeck-model",
    "natural-asset-companies",
    "standard-of-living-vs-quality-of-life-what-the-numbers-miss",
    "explaining-mutually-exclusive-and-collectively-exhaustive-where-did-my-paycheck-go",
    "public-vs-private-pay-who-really-earns-more"
  ];
  for (const slug of essaySlugs) {
    const expectedDescription = frontMatterScalar(`content/essays/${slug}.md`, "description");
    const expectedTitle = frontMatterScalar(`content/essays/${slug}.md`, "metadata_title") || frontMatterScalar(`content/essays/${slug}.md`, "title");
    const html = readOutput(`essays/${slug}/index.html`);
    assert.equal(title(html), expectedTitle);
    assert.equal(attribute(html, "meta", "property", "og:title"), expectedTitle);
    assert.equal(attribute(html, "meta", "name", "description"), expectedDescription);
  }
});

test("revision history controls Open Graph, Article schema, and sitemap lastmod", () => {
  const html = readOutput("essays/the-warning-label-in-the-weeds/index.html");
  const expectedPublished = "2026-04-27T00:00:00-04:00";
  const expectedModified = "2026-05-11T00:00:00-04:00";
  assert.equal(attribute(html, "meta", "property", "article:published_time"), expectedPublished);
  assert.equal(attribute(html, "meta", "property", "article:modified_time"), expectedModified);
  const article = jsonLdNodes(html).find((node) => node?.["@type"] === "Article");
  assert.equal(article?.datePublished, expectedPublished);
  assert.equal(article?.dateModified, expectedModified);

  const sitemap = readOutput("sitemap.xml");
  const entry = sitemap.match(/<url>\s*<loc>https:\/\/outsideinprint\.org\/essays\/the-warning-label-in-the-weeds\/<\/loc>([\s\S]*?)<\/url>/);
  assert.ok(entry, "expected revision sentinel in sitemap");
  assert.match(entry[1], new RegExp(`<lastmod>${expectedModified.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</lastmod>`));
});

test("publication alone does not masquerade as a modification", () => {
  const html = readOutput("essays/borrowed-hour/index.html");
  const expectedPublished = "2026-07-04T00:00:00-04:00";
  assert.equal(attribute(html, "meta", "property", "article:published_time"), expectedPublished);
  assert.equal(attribute(html, "meta", "property", "article:modified_time"), "");
  const article = jsonLdNodes(html).find((node) => node?.["@type"] === "Article");
  assert.equal(article?.datePublished, expectedPublished);
  assert.equal(Object.hasOwn(article, "dateModified"), false);

  const sitemap = readOutput("sitemap.xml");
  const entry = sitemap.match(/<url>\s*<loc>https:\/\/outsideinprint\.org\/essays\/borrowed-hour\/<\/loc>([\s\S]*?)<\/url>/);
  assert.ok(entry, "expected unrevisioned publication in sitemap");
  assert.match(entry[1], new RegExp(`<lastmod>${expectedPublished.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</lastmod>`));
});

test("bookstore release dates supply truthful product sitemap lastmod", () => {
  const sitemap = readOutput("sitemap.xml");
  const entry = sitemap.match(/<url>\s*<loc>https:\/\/outsideinprint\.org\/shop\/2045\/<\/loc>([\s\S]*?)<\/url>/);
  assert.ok(entry, "expected 2045 product in sitemap");
  assert.match(entry[1], /<lastmod>2026-09-12T00:00:00-04:00<\/lastmod>/);
});

test("Open Graph locale and image facts are truthful when rendered", () => {
  for (const relativePath of ["shop/2045/index.html", "archive/index.html"]) {
    const html = readOutput(relativePath);
    assert.equal(attribute(html, "meta", "property", "og:locale"), "en_US");
    const width = Number(attribute(html, "meta", "property", "og:image:width"));
    const height = Number(attribute(html, "meta", "property", "og:image:height"));
    const type = attribute(html, "meta", "property", "og:image:type");
    assert.ok(Number.isInteger(width) && width > 0, `${relativePath} image width`);
    assert.ok(Number.isInteger(height) && height > 0, `${relativePath} image height`);
    assert.match(type, /^image\//);
  }
});

test("archive paginator pages have distinct canonical metadata", () => {
  const first = readOutput("archive/index.html");
  const second = readOutput("archive/page/2/index.html");
  assert.equal(title(first), "Archive");
  assert.equal(attribute(first, "link", "rel", "canonical", "href"), "https://outsideinprint.org/archive/");
  assert.equal(title(second), "Archive — Page 2");
  assert.equal(attribute(second, "link", "rel", "canonical", "href"), "https://outsideinprint.org/archive/page/2/");
  assert.equal(attribute(second, "meta", "property", "og:url"), "https://outsideinprint.org/archive/page/2/");
});
