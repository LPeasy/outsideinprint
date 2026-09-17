import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const catalog = read("data/bookstore.yaml");
const offers = read("layouts/partials/shop/direct-offers.html");
const help = read("layouts/partials/shop/ebook-help.html");
const copy = "A downloadable e-book, emailed after purchase.";
const formatHelp = "The download is an EPUB file. Open it in an EPUB-compatible reading app.";
const products = [
  ["2045", "OIP-TD-EPUB", "19.99", "48a6967cb52c0641f6f264b1f0c34258011b58267798c50a982761d9103854b1"],
  ["the-american-nightmare-keep-dreaming-kid", "OIP-AN-EPUB", "9.99", "f9755acebf54158d323d84c1ab748db69f7d32ecdf1f60705846afde0eff3017"],
  ["the-parable-of-the-sheep", "OIP-PS-EPUB", "9.99", "b32a5110ccbc1a3efa4a033f3b97be3be9fcbe3206edffe306da1744f5f10d60"],
  ["the-water-cycle", "OIP-WC-EPUB", "9.99", "b417ae19664f2fa6cb66edd1675e4bfede0740b08ac17e42d0b78a7d300f368b"],
];

test("e-book sales labels remain separate from the EPUB fulfillment format", () => {
  for (const label of ['product_type: "Outside In Print e-book"', 'price_label: "E-book price"', 'checkout_label: "Buy e-book — $9.99"', 'checkout_label: "Buy e-book — $19.99"', 'checkout_unavailable_label: "E-book temporarily unavailable"']) {
    assert.ok(catalog.includes(label), label);
  }
  assert.doesNotMatch(catalog, /^\s*(?:product_type|price_label|availability_note|checkout_label|checkout_unavailable_label|checkout_note|direct_offers_heading|direct_offers_note|gate_note):.*\bEPUB\b/m);
  assert.equal((catalog.match(/^\s+format: "EPUB"$/gm) || []).length, 4);
  assert.equal((catalog.match(/^\s+fulfillment_type: "secure_epub_download"$/gm) || []).length, 4);
  assert.equal((catalog.match(/^\s+checkout_action: "epub_checkout_api"$/gm) || []).length, 4);
  assert.equal((catalog.match(/^\s+checkout_endpoint: "https:\/\/downloads\.outsideinprint\.org\/api\/books\/epub"$/gm) || []).length, 4);
  for (const [, sku, price] of products) {
    const block = catalog.match(new RegExp(`- sku: "${sku}"([\\s\\S]*?)(?=\\n\\s+- sku:|\\n    tags:)`))?.[1];
    assert.ok(block, sku);
    assert.ok(block.includes('format: "EPUB"'));
    assert.ok(block.includes(`price_display: "$${price}"`));
    assert.ok(block.includes(`price_cents: ${Math.round(Number(price) * 100)}`));
  }
  assert.ok(offers.includes('where $allOffers "format" "EPUB"'));
  assert.ok(offers.includes('data-analytics-format="{{ $format }}"'));
  assert.ok(offers.includes('data-analytics-path="/api/books/epub"'));
  assert.ok(offers.includes('Buy direct e-book — %s'));
  assert.ok(offers.includes('Your secure e-book link will be sent here.'));
  assert.ok(read("layouts/partials/schema/book-product.html").includes('"bookFormat" "https://schema.org/EBook"'));
});

test("reading help is native, local to sales surfaces, and leaves story excerpts intact", () => {
  assert.ok(help.includes(copy));
  assert.ok(help.includes(formatHelp));
  assert.match(help, /<details class="bookstore-ebook-help__disclosure">\s*<summary>How to read it<\/summary>/);
  assert.match(help, /Examples include Thorium and calibre\./);
  assert.doesNotMatch(help, /\bopen(?:=|\s|>)|onclick|javascript:|<script/);
  for (const file of ["layouts/shop/single.html", "layouts/shop/sample.html", "layouts/partials/shop/featured-book.html", "layouts/partials/shop/direct-offers.html", "layouts/partials/home_2045_launch.html"]) {
    assert.ok(read(file).includes('partial "shop/ebook-help.html"'), file);
    assert.doesNotMatch(read(file), /Buy EPUB|DRM-free EPUB|>Outside In Print EPUB/);
  }
  assert.ok(read("layouts/shop/list.html").includes('"collapseCheckout" true'));
  assert.ok(read("layouts/shop/single.html").includes('>Read the direct EPUB delivery and refund terms</a>'));
  for (const [slug, , , hash] of products) {
    const sample = read(`content/shop/${slug}/sample.md`).replace(/\r\n/g, "\n");
    const body = sample.replace(/^---\n[\s\S]*?\n---\n/, "");
    assert.equal(crypto.createHash("sha256").update(body).digest("hex"), hash, `${slug} story/excerpt is unchanged`);
  }
});

const siteDir = process.env.OIP_SITE_DIR;
const attr = (tag, name) => {
  const found = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`));
  return found?.[1] ?? found?.[2] ?? found?.[3] ?? "";
};
const plain = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const output = (file) => fs.readFileSync(path.join(siteDir, file), "utf8");

test("rendered sales surfaces use e-book labels and retain technical/legal EPUB references", { skip: !siteDir }, () => {
  for (const file of ["shop/index.html", "shop/thanks/index.html", "shop/2045/sample/index.html", ...products.map(([slug]) => `shop/${slug}/index.html`)]) {
    const html = output(file);
    const visible = plain(html);
    assert.doesNotMatch(visible, /Buy (?:direct )?EPUB|DRM-free EPUB|Outside In Print EPUB|EPUB price|Your secure EPUB link|EPUB temporarily unavailable/, file);
    if (!file.includes("thanks")) {
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
  for (const [slug, sku, price] of products) {
    const html = output(`shop/${slug}/index.html`);
    const forms = [...html.matchAll(/<form\b[^>]*>/g)].map((match) => match[0]).filter((tag) => /\bdata-epub-checkout(?:\s|=|>)/.test(tag));
    assert.equal(forms.length, slug === "2045" ? 1 : 2);
    for (const tag of forms) {
      assert.equal(attr(tag, "action"), "https://downloads.outsideinprint.org/api/books/epub");
      assert.equal(attr(tag, "data-epub-sku"), sku);
      assert.equal(attr(tag, "data-analytics-format"), "EPUB");
      assert.equal(attr(tag, "method"), "post");
    }
    assert.ok(plain(html).includes(`Buy e-book — $${price}`));
    assert.ok(html.includes("https://schema.org/EBook"));
    assert.ok(plain(html).includes("Read the direct EPUB delivery and refund terms"));
  }
});
