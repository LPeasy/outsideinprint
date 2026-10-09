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
  ["the-american-nightmare-keep-dreaming-kid", "OIP-AN-EPUB", "9.99", "fb616baf03d97aac4ea96bfc3637c045e83018a0e4b603cca14601be98d5b8bd"],
  ["the-parable-of-the-sheep", "OIP-PS-EPUB", "9.99", "b32a5110ccbc1a3efa4a033f3b97be3be9fcbe3206edffe306da1744f5f10d60"],
  ["the-water-cycle", "OIP-WC-EPUB", "9.99", "271f25c260ede86db0363d3cfb551cf533485bcd2b2fd1d1f8512c74bfff001a"],
  ["pending", "OIP-PENDING-EPUB", "9.99", "9325642f96f0ebc56f73d65cefe6f73ed2e7fdb3487b90f84246846856cbd8a6"],
];

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
const attr = (tag, name) => {
  const found = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`));
  return found?.[1] ?? found?.[2] ?? found?.[3] ?? "";
};
const plain = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const output = (file) => fs.readFileSync(path.join(siteDir, file), "utf8");

test("rendered sales surfaces use e-book labels and retain technical/legal EPUB references", { skip: !siteDir }, () => {
  for (const file of ["shop/index.html", "shop/thanks/index.html", "shop/2045/sample/index.html", "shop/pending/sample/index.html", ...products.map(([slug]) => `shop/${slug}/index.html`)]) {
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
  for (const [slug, sku, price] of products) {
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
  assert.equal(cards.length, 4);
  for (const [slug, , price] of products.slice(1)) {
    const card = cards.find(card => card.includes(`/shop/${slug}/`));
    assert.ok(card, slug);
    assert.match(card, /<img\b[^>]*alt=/);
    assert.match(card, /bookstore-record__deck/);
    assert.match(plain(card), /EPUB e-book/);
    assert.ok(plain(card).includes(`$${price}`));
    const anchors = [...card.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
    const sampleHref = slug === "pending" ? "/shop/pending/sample/" : `/shop/${slug}/#reading-sample`;
    const sample = anchors.filter(anchor => attr(anchor, "href") === sampleHref);
    const detail = anchors.filter(anchor => attr(anchor, "href") === `/shop/${slug}/` && /^View book\b/.test(plain(anchor).trim()));
    assert.equal(sample.length, 1, `${slug} sample destination`);
    assert.match(plain(sample[0]), /Read a sample/);
    assert.equal(detail.length, 1, `${slug} detail destination`);
  }
});

test("every product opens with format, price, sample and a buy anchor, preserving checkout consent", { skip: !siteDir }, () => {
  for (const [slug, sku, price] of products) {
    const html = output(`shop/${slug}/index.html`);
    const decision = html.match(/<aside\b[^>]*\bdata-bookstore-early-decision(?:[\s=>])[^]*?<\/aside>/)?.[0];
    assert.ok(decision, `${slug} early decisions`);
    assert.match(plain(decision), /EPUB e-book/);
    assert.ok(plain(decision).includes(`$${price}`));
    assert.doesNotMatch(decision, /<form\b|https:\/\/(?:downloads\.outsideinprint\.org|square\.link|checkout\.square\.site)/);
    const links = [...decision.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
    const sampleHref = ["2045", "pending"].includes(slug) ? `/shop/${slug}/sample/` : "#reading-sample";
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
