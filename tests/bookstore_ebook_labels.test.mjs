import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { execFileSync } from "node:child_process";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const catalog = read("data/bookstore.yaml");
const offers = read("layouts/partials/shop/direct-offers.html");
const help = read("layouts/partials/shop/ebook-help.html");
const copy = "A downloadable e-book, emailed after purchase.";
const formatHelp = "The download is an EPUB file. Open it in an EPUB-compatible reading app.";
const products = [
  ["2045", "OIP-TD-EPUB", "19.99", "48a6967cb52c0641f6f264b1f0c34258011b58267798c50a982761d9103854b1"],
  ["the-american-nightmare-keep-dreaming-kid", "OIP-AN-EPUB", "9.99", "fb616baf03d97aac4ea96bfc3637c045e83018a0e4b603cca14601be98d5b8bd"],
  ["the-parable-of-the-sheep", "OIP-PS-EPUB", "9.99", "b32a5110ccbc1a3efa4a033f3b97be3be9fcbe3206edffe306da1744f5f10d60"],
  ["the-water-cycle", "OIP-WC-EPUB", "9.99", "271f25c260ede86db0363d3cfb551cf533485bcd2b2fd1d1f8512c74bfff001a"],
  ["pending", "OIP-PENDING-EPUB", "9.99", "9325642f96f0ebc56f73d65cefe6f73ed2e7fdb3487b90f84246846856cbd8a6"],
  ["fifty-years-of-magic", "OIP-FM-EPUB", "9.99", "839ce1ff68bfe1906e2ae3f9828ba5ce8bd88fddf1a7dff7eb550285da0eefce"],
];
const standaloneSampleSlugs = new Set(["2045", "pending", "fifty-years-of-magic"]);
const magicSource = read("content/shop/fifty-years-of-magic/_index.md").replace(/\r\n/g, "\n");
const magicFrontMatter = magicSource.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
const magicPublicationValues = [...magicFrontMatter.matchAll(/^publishDate:\s*"?([^"\n]+)"?\s*$/gm)];
assert.equal(magicPublicationValues.length, 1, "Fifty Years of Magic has one publication timestamp");
const magicPublicationTime = Date.parse(magicPublicationValues[0][1].trim());
assert.ok(Number.isFinite(magicPublicationTime), "Fifty Years of Magic publication time is valid");
assert.match(magicFrontMatter, /^draft: false$/m);
assert.match(magicFrontMatter, /^book_key: "fifty_years_of_magic"$/m);
assert.match(magicFrontMatter, /^sample_page: "\/shop\/fifty-years-of-magic\/sample"$/m);

test("e-book sales labels remain separate from the EPUB fulfillment format", () => {
  for (const label of ['product_type: "Outside In Print e-book"', 'price_label: "E-book price"', 'checkout_label: "Buy e-book — $9.99"', 'checkout_label: "Buy e-book — $19.99"', 'checkout_unavailable_label: "E-book temporarily unavailable"']) {
    assert.ok(catalog.includes(label), label);
  }
  assert.doesNotMatch(catalog, /^\s*(?:product_type|price_label|availability_note|checkout_label|checkout_unavailable_label|checkout_note|direct_offers_heading|direct_offers_note|gate_note):.*\bEPUB\b/m);
  assert.equal((catalog.match(/^\s+format: "EPUB"$/gm) || []).length, products.length);
  assert.equal((catalog.match(/^\s+fulfillment_type: "secure_epub_download"$/gm) || []).length, products.length);
  assert.equal((catalog.match(/^\s+checkout_action: "epub_checkout_api"$/gm) || []).length, products.length);
  assert.equal((catalog.match(/^\s+checkout_endpoint: "https:\/\/downloads\.outsideinprint\.org\/api\/books\/epub"$/gm) || []).length, products.length);
  for (const [, sku, price] of products) {
    const block = catalog.match(new RegExp(`- sku: "${sku}"([\\s\\S]*?)(?=\\n\\s+- sku:|\\n    tags:)`))?.[1];
    assert.ok(block, sku);
    assert.ok(block.includes('format: "EPUB"'));
    assert.ok(block.includes(`price_display: "$${price}"`));
    assert.ok(block.includes(`price_cents: ${Math.round(Number(price) * 100)}`));
    if (sku === "OIP-FM-EPUB") {
      assert.ok(block.includes('isbn_status: "Pending Bowker processing"'));
      assert.match(magicSource, /^ISBN \(EPUB\): 979-8-952377-05-9$/m);
    }
  }
  assert.ok(offers.includes('where $allOffers "format" "EPUB"'));
  assert.ok(offers.includes('data-analytics-format="{{ $format }}"'));
  assert.ok(offers.includes('data-analytics-path="/api/books/epub"'));
  assert.ok(offers.includes('Continue to Square — %s'));
  assert.ok(offers.includes('{{ $format }} e-book'));
  assert.ok(offers.includes('Your secure e-book link will be sent here.'));
  assert.ok(read("layouts/partials/schema/book-product.html").includes('"bookFormat" "https://schema.org/EBook"'));
});

test("reading help is native, local to sales surfaces, and leaves story excerpts intact", () => {
  assert.ok(help.includes(copy));
  assert.ok(help.includes(formatHelp));
  assert.match(help, /<details class="bookstore-ebook-help__disclosure">\s*<summary>How to read it<\/summary>/);
  assert.match(help, /Thorium/);
  assert.match(help, /calibre/);
  assert.match(help, /Google Play Books/);
  assert.doesNotMatch(help, /<details\b[^>]*\bopen(?:=|\s|>)|onclick|javascript:|<script/);
  for (const file of ["layouts/shop/sample.html", "layouts/partials/shop/direct-offers.html", "layouts/partials/home_2045_launch.html"]) {
    assert.ok(read(file).includes('partial "shop/ebook-help.html"'), file);
    assert.doesNotMatch(read(file), /Buy EPUB|DRM-free EPUB|>Outside In Print EPUB/);
  }
  assert.doesNotMatch(read("layouts/shop/list.html"), /shop\/direct-offers\.html|shop\/kindle-button\.html|data-epub-checkout|epub-checkout\.js/);
  assert.match(offers, /epub-license-refunds\//);
  assert.match(offers, /Delivery and refund terms/);
  for (const [slug, , , hash] of products) {
    const sample = read(`content/shop/${slug}/sample.md`).replace(/\r\n/g, "\n");
    const body = sample.replace(/^---\n[\s\S]*?\n---\n/, "");
    assert.equal(crypto.createHash("sha256").update(body).digest("hex"), hash, `${slug} story/excerpt is unchanged`);
  }
});

const siteDir = process.env.OIP_SITE_DIR;
const manifestPath = siteDir ? path.join(siteDir, ".oip-build-manifest.json") : null;
const buildManifest = manifestPath && fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const clockValue = process.env.OIP_BUILD_CLOCK_UTC || buildManifest.buildClockUtc;
const buildTime = clockValue ? Date.parse(clockValue) : Date.now();
assert.ok(Number.isFinite(buildTime), "Rendered contract build clock is valid");
const magicEligible = magicPublicationTime <= buildTime;
const eligibleProducts = products.filter(([slug]) => slug !== "fifty-years-of-magic" || magicEligible);
const attr = (tag, name) => {
  const found = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`));
  return found?.[1] ?? found?.[2] ?? found?.[3] ?? "";
};
const plain = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const output = (file) => fs.readFileSync(path.join(siteDir, file), "utf8");

test("rendered sales surfaces use e-book labels and retain technical/legal EPUB references", { skip: !siteDir }, () => {
  for (const file of ["shop/index.html", "shop/thanks/index.html", ...eligibleProducts.filter(([slug]) => standaloneSampleSlugs.has(slug)).map(([slug]) => `shop/${slug}/sample/index.html`), ...eligibleProducts.map(([slug]) => `shop/${slug}/index.html`)]) {
    const html = output(file);
    const visible = plain(html);
    assert.doesNotMatch(visible, /Buy (?:direct )?EPUB|DRM-free EPUB|Outside In Print EPUB|EPUB price|Your secure EPUB link|EPUB temporarily unavailable/, file);
    if (!file.includes("thanks") && file !== "shop/index.html") {
      assert.ok(visible.includes(copy), file);
      assert.ok(visible.includes(formatHelp), file);
      const disclosures = [...html.matchAll(/<details\b[^>]*>[\s\S]*?<\/details>/g)].map((match) => match[0]).filter((block) => attr(block.split(">")[0] + ">", "class") === "bookstore-ebook-help__disclosure");
      assert.ok(disclosures.length > 0, `${file} native reading help`);
      for (const block of disclosures) {
        assert.doesNotMatch(block.split(">")[0], /\bopen(?:\s|=|$)/);
        assert.match(block, /<summary>How to read it<\/summary>/);
      }
    }
  }
  for (const [slug, sku, price] of eligibleProducts) {
    const html = output(`shop/${slug}/index.html`);
    const forms = [...html.matchAll(/<form\b[^>]*>/g)].map((match) => match[0]).filter((tag) => /\bdata-epub-checkout(?:\s|=|>)/.test(tag));
    assert.equal(forms.length, 1, `${slug} has one purchase form`);
    for (const tag of forms) {
      assert.equal(attr(tag, "action"), "https://downloads.outsideinprint.org/api/books/epub");
      assert.equal(attr(tag, "data-epub-sku"), sku);
      assert.equal(attr(tag, "data-analytics-format"), "EPUB");
      assert.equal(attr(tag, "method"), "post");
    }
    assert.ok(plain(html).includes(`Continue to Square — $${price}`));
    assert.ok(html.includes("https://schema.org/EBook"));
    assert.ok(plain(html).includes("Delivery and refund terms"));
  }
});


test("shop cards expose book decisions without checkout or external retail exits", { skip: !siteDir }, () => {
  const html = output("shop/index.html");
  assert.doesNotMatch(html, /data-epub-checkout|bookstore-checkout-disclosure|bookstore_index_kindle|epub-checkout\.[a-f0-9]+\.js/);
  assert.doesNotMatch(html, /<form\b[^>]*action=["']?https:\/\/downloads\.outsideinprint\.org|href=["']?https:\/\/(?:www\.amazon\.com|square\.link|checkout\.square\.site)/);
  const cards = [...html.matchAll(/<article\b[^>]*class=(?:"bookstore-record"|bookstore-record)[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]);
  const featuredSlug = magicEligible ? "fifty-years-of-magic" : "2045";
  const features = [...html.matchAll(/<section\b[^>]*class=(?:"bookstore-feature"|bookstore-feature)[^>]*>[\s\S]*?<\/section>/g)].map(match => match[0]);
  assert.equal(features.length, 1);
  assert.match(features[0], new RegExp(`href=["']?\\/shop\\/${featuredSlug}\\/`));
  const shelfProducts = eligibleProducts.filter(([slug]) => slug !== featuredSlug);
  assert.equal(cards.length, shelfProducts.length);
  for (const [slug, , price] of shelfProducts) {
    const card = cards.find(card => card.includes(`/shop/${slug}/`));
    assert.ok(card, slug);
    assert.match(card, /<img\b[^>]*alt=/);
    assert.match(card, /bookstore-record__deck/);
    assert.match(plain(card), /EPUB e-book/);
    assert.ok(plain(card).includes(`$${price}`));
    const anchors = [...card.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
    const sampleHref = standaloneSampleSlugs.has(slug) ? `/shop/${slug}/sample/` : `/shop/${slug}/#reading-sample`;
    const sample = anchors.filter(anchor => attr(anchor, "href") === sampleHref);
    const detail = anchors.filter(anchor => attr(anchor, "href") === `/shop/${slug}/` && /^View book\b/.test(plain(anchor).trim()));
    assert.equal(sample.length, 1, `${slug} sample destination`);
    assert.match(plain(sample[0]), /Read a sample/);
    assert.equal(detail.length, 1, `${slug} detail destination`);
  }
});

function renderBookstoreFeature(t, { clock, magicDraft = false }) {
  const hugo = process.env.OIP_HUGO_BIN || "hugo";
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "oip-bookstore-feature-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(fixture)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(fixture).startsWith("oip-bookstore-feature-"));
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  const write = (file, value) => {
    const target = path.join(fixture, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  const content = (file, metadata, body = "Fixture reading text.") => {
    write(file, `---\n${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n${body}\n`);
  };
  write("hugo.toml", 'baseURL = "https://example.test/"\ntimeZone = "America/New_York"\ndisableKinds = ["taxonomy", "term", "RSS", "sitemap"]\n');
  write("layouts/_default/baseof.html", '{{ block "main" . }}{{ end }}');
  write("layouts/_default/list.html", '{{ define "main" }}{{ .Title }}{{ end }}');
  write("layouts/_default/single.html", '{{ define "main" }}{{ .Title }}{{ end }}');
  write("layouts/index.html", "Fixture home");
  for (const template of ["layouts/shop/list.html", "layouts/partials/shop/featured-book.html", "layouts/partials/shop/sample-link.html"]) {
    write(template, read(template));
  }
  write("layouts/partials/shop/product-data.html", '{{ return index hugo.Data.fixture_products .key }}');
  write("layouts/partials/shop/resolve-reading-sample.html", '{{ return false }}');
  write("layouts/partials/images/picture.html", '<img src="/fixture/{{ .ref }}.webp" alt="{{ .alt }}" loading="{{ .loading }}">');
  const fixtureProduct = (title, key, price, extra = {}) => ({ title, display_title: title, subtitle: `${title} subtitle`, deck: `${title} description.`, price_display: price, cover_image: `books/${key}/cover`, cover_alt: `${title} cover.`, ...extra });
  write("data/fixture_products.json", JSON.stringify({
    "2045": fixtureProduct("2045", "2045", "$19.99", { positioning_label: "OIP Exclusive" }),
    fifty_years_of_magic: fixtureProduct("Fifty Years of Magic", "fifty-years-of-magic", "$9.99"),
    pending: fixtureProduct("PENDING", "pending", "$9.99"),
  }));
  write("content/shop/_index.md", read("content/shop/_index.md"));
  content("content/shop/2045/_index.md", { title: "2045", book_key: "2045", weight: 5, date: "2020-01-01", sample_page: "/shop/2045/sample" });
  content("content/shop/2045/sample.md", { title: "The Cracked Pot", date: "2020-01-01", sample_work_type: "short-story" });
  content("content/shop/pending.md", { title: "PENDING", book_key: "pending", weight: 50, date: "2020-01-01" });
  const magicMetadata = { date: "2026-10-27", publishDate: "2026-10-27T09:00:00-04:00", draft: magicDraft };
  content("content/shop/fifty-years-of-magic/_index.md", { title: "Fifty Years of Magic", book_key: "fifty_years_of_magic", weight: 60, sample_page: "/shop/fifty-years-of-magic/sample", ...magicMetadata });
  content("content/shop/fifty-years-of-magic/sample.md", { title: "Building Walt Disney World", sample_work_type: "nonfiction-excerpt", ...magicMetadata });
  execFileSync(hugo, ["--source", fixture, "--clock", clock, "--panicOnWarning"], { encoding: "utf8" });
  return fs.readFileSync(path.join(fixture, "public/shop/index.html"), "utf8");
}

for (const scenario of [
  { name: "before release", clock: "2026-10-27T12:59:59Z", featuredSlug: "2045" },
  { name: "at release", clock: "2026-10-27T13:00:00Z", featuredSlug: "fifty-years-of-magic" },
  { name: "unpublished preferred title", clock: "2026-10-27T13:00:00Z", magicDraft: true, featuredSlug: "2045" },
]) {
  test(`bookstore feature follows publication eligibility — ${scenario.name}`, (t) => {
    const html = renderBookstoreFeature(t, scenario);
    const features = [...html.matchAll(/<section\b[^>]*class="bookstore-feature"[^>]*>[\s\S]*?<\/section>/g)].map(match => match[0]);
    assert.equal(features.length, 1);
    const feature = features[0];
    assert.ok(feature.includes(`href="/shop/${scenario.featuredSlug}/"`));
    assert.ok(feature.includes(`href="/shop/${scenario.featuredSlug}/sample/"`));
    assert.equal((feature.match(/<h2\b/g) || []).length, 1);
    const records = [...html.matchAll(/<article\b[^>]*class="bookstore-record"[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]);
    assert.ok(records.every(record => !record.includes(`/shop/${scenario.featuredSlug}/`)), "featured title is excluded from ordinary cards");
    assert.equal(records.filter(record => record.includes('/shop/pending/')).length, 1);
    if (scenario.featuredSlug === "fifty-years-of-magic") {
      assert.equal(records.length, 2);
      assert.equal(records.filter(record => record.includes('/shop/2045/')).length, 1);
      assert.match(feature, /\$9\.99/);
      assert.match(feature, /Building Walt Disney World/);
      assert.doesNotMatch(feature, /complete story|OIP Exclusive|aria-hidden="true">\//);
    } else {
      assert.equal(records.length, 1);
      assert.match(feature, /complete story/);
      assert.match(feature, /OIP Exclusive/);
      assert.doesNotMatch(html, /\/shop\/fifty-years-of-magic\//);
    }
  });
}

test("every product opens with format, price, sample and a buy anchor, preserving checkout consent", { skip: !siteDir }, () => {
  for (const [slug, sku, price] of eligibleProducts) {
    const html = output(`shop/${slug}/index.html`);
    const decision = html.match(/<aside\b[^>]*\bdata-bookstore-early-decision(?:[\s=>])[^]*?<\/aside>/)?.[0];
    assert.ok(decision, `${slug} early decisions`);
    assert.match(plain(decision), /EPUB e-book/);
    assert.ok(plain(decision).includes(`$${price}`));
    assert.doesNotMatch(decision, /<form\b|https:\/\/(?:downloads\.outsideinprint\.org|square\.link|checkout\.square\.site)/);
    const links = [...decision.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
    const sampleHref = standaloneSampleSlugs.has(slug) ? `/shop/${slug}/sample/` : "#reading-sample";
    assert.equal(links.filter(link => attr(link, "href") === sampleHref).length, 1);
    const buy = links.filter(link => attr(link, "href") === "#bookstore-purchase");
    assert.equal(buy.length, 1);
    assert.match(plain(buy[0]), /Buy e-book/);
    const forms = [...html.matchAll(/<form\b[^>]*\bdata-epub-checkout(?:\s|=|>)[\s\S]*?<\/form>/g)].map(match => match[0]);
    assert.equal(forms.length, 1);
    const form = forms[0];
    assert.ok(html.indexOf(decision) < html.indexOf(form), `${slug} purchase decisions precede delivery fields`);
    assert.equal(attr(form, "action"), "https://downloads.outsideinprint.org/api/books/epub");
    assert.equal(attr(form, "data-epub-sku"), sku);
    const inputs = [...form.matchAll(/<input\b[^>]*>/g)].map(match => match[0]);
    const emails = inputs.filter(input => attr(input, "type") === "email");
    assert.equal(emails.length, 1);
    assert.match(emails[0], /\brequired(?:\s|=|>|\/)/);
    assert.equal(attr(emails[0], "name"), "email");
    const consent = inputs.filter(input => attr(input, "type") === "checkbox");
    assert.deepEqual(consent.map(input => attr(input, "name")).sort(), ["publication_notifications", "weekly_email"]);
    for (const input of consent) assert.doesNotMatch(input, /\b(?:checked|required)(?:\s|=|>|\/)/);
    assert.match(plain(form), /Optional\. Not required to buy\./);
    const submit = [...form.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]).filter(button => attr(button, "type") === "submit");
    assert.equal(submit.length, 1);
    assert.equal(plain(submit[0]).trim(), `Continue to Square — $${price}`);
    assert.match(html, /href=["']?\/epub-license-refunds\//);
    assert.match(html, /href=["']?\/privacy\//);
    assert.match(plain(html), /U\.S\. customers only/);
    assert.match(plain(html), /Square/);
  }
});

test("Fifty Years of Magic enters the storefront only at its publication time", { skip: !siteDir }, () => {
  for (const route of ["shop/fifty-years-of-magic/index.html", "shop/fifty-years-of-magic/sample/index.html"]) {
    assert.equal(fs.existsSync(path.join(siteDir, route)), magicEligible, `${route} follows the build clock`);
  }
  if (!magicEligible) {
    assert.doesNotMatch(output("shop/index.html"), /OIP-FM-EPUB|\/shop\/fifty-years-of-magic\//);
  }
});
