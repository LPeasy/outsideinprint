import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const archive = read("layouts/collections/bobs-almanack.html");
const sample = read("layouts/shop/sample.html");
const sourceSample = read("content/shop/2045/sample.md");
const canonicalPrice = read("data/bookstore.yaml").match(/^  "2045":\n[\s\S]*?^    price_display: "([^"]+)"/m)?.[1];
const archiveID = "almanack-collection-newsletter";

test("Almanack archive reuses one newsletter module after its latest preview", () => {
  assert.equal((archive.match(/partial "newsletter_signup\.html"/g) || []).length, 1);
  assert.match(archive, /\{\{ if \$latest \}\}\s*<a class="almanack-collection__signup-link" href="#almanack-collection-newsletter">Get the weekly newsletter<\/a>/);
  const principal = archive.indexOf('class="almanack-collection__principal"');
  const latest = archive.indexOf('class="almanack-collection__latest"', principal);
  const readIssue = archive.indexOf('class="almanack-read-link"', latest);
  const signup = archive.indexOf('partial "newsletter_signup.html"', readIssue);
  const contents = archive.indexOf('class="almanack-collection__contents"', signup);
  assert.ok(principal >= 0 && principal < latest && latest < readIssue && readIssue < signup && signup < contents);
  assert.ok(archive.includes('"page" .'));
  assert.ok(archive.includes('"sourceSlot" "almanack_collection_newsletter"'));
  assert.ok(archive.includes(`"anchorID" "${archiveID}"`));
  assert.match(archive, /\{\{ else \}\}\s*<section class="almanack-collection__empty" aria-label="No published issues">\s*<p>No published issues yet\.<\/p>/);
  assert.doesNotMatch(archive, /<form\b|embed-subscribe|<input\b/);
});

test("complete-story sample adds a purchase anchor while retaining overview analytics and body", () => {
  assert.ok(canonicalPrice);
  assert.match(sample, /class="shop-cta bookstore-sample-buy" href="\{\{ \$book.RelPermalink \}\}#bookstore-purchase"/);
  assert.ok(sample.includes('Get the full e-book — {{ index $product "price_display" }}'));
  assert.match(sample, /data-analytics-source-slot="bookstore_sample_buy"/);
  assert.match(sample, /class="bookstore-detail-link" href="\{\{ \$book.RelPermalink \}\}"[^>]*data-analytics-source-slot="bookstore_sample_continue"[^>]*>About the book/);
  assert.ok(sample.indexOf('class="bookstore-reading-sample__body"') < sample.indexOf('class="bookstore-sample-actions"'));
  assert.ok(sample.indexOf('class="bookstore-sample-actions"') < sample.indexOf('partial "shop/ebook-help.html"'));
  assert.doesNotMatch(sample, /checkout_start|<form\b|<button\b[^>]*type="submit"|downloads\.outsideinprint|square\.link|checkout\.square/);
  const body = sourceSample.replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---\n/, "");
  assert.equal(crypto.createHash("sha256").update(body).digest("hex"), "48a6967cb52c0641f6f264b1f0c34258011b58267798c50a982761d9103854b1");
});

const siteDir = process.env.OIP_SITE_DIR;
const output = (file) => fs.readFileSync(path.join(siteDir, file), "utf8");
const attr = (tag, name) => {
  const found = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`));
  return found?.[1] ?? found?.[2] ?? found?.[3] ?? "";
};
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const links = (html) => [...html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)].map((m) => ({ tag: m[1], label: text(m[2]) }));

test("built newsletter archive has one correctly placed signup and a real native target", { skip: !siteDir }, () => {
  const html = output("collections/bobs-almanack/index.html");
  const signupLinks = links(html).filter((link) => link.label === "Get the weekly newsletter");
  assert.equal(signupLinks.length, 1);
  assert.equal(attr(signupLinks[0].tag, "href"), `#${archiveID}`);
  assert.doesNotMatch(signupLinks[0].tag, /onclick|role=|tabindex=/);
  const sections = [...html.matchAll(/<section\b[^>]*>/g)].map((m) => m[0]);
  const signupSections = sections.filter((tag) => attr(tag, "id") === archiveID);
  assert.equal(signupSections.length, 1);
  assert.ok(attr(signupSections[0], "class").split(" ").includes("newsletter-signup--almanack-collection"));
  const latest = html.indexOf("almanack-collection__latest");
  const signup = html.indexOf(signupSections[0]);
  const contents = html.indexOf("almanack-collection__contents");
  assert.ok(latest < signup && signup < contents);
  const forms = [...html.matchAll(/<form\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(forms.length, 1);
  assert.equal(attr(forms[0], "action"), "https://buttondown.com/api/emails/embed-subscribe/OutsideInPrint");
  assert.equal(attr(forms[0], "method"), "post");
  assert.equal(attr(forms[0], "data-analytics-source-slot"), "almanack_collection_newsletter");
  assert.equal(attr(forms[0], "data-analytics-event"), "newsletter_submit");
  for (const promise of ["Every Saturday", "The weekly newsletter", "Free. No spam ever. Unsubscribe anytime."]) assert.ok(text(html).includes(promise));
  assert.ok(links(html).some((link) => attr(link.tag, "href") === "/privacy/"));
  const ids = [...html.matchAll(/<[a-z][^>]*\bid=(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/g)].map((m) => attr(m[0], "id"));
  assert.equal(new Set(ids).size, ids.length, "signup IDs must remain unique");
});

test("built sample sends purchase intent to the existing form and keeps overview separate", { skip: !siteDir }, () => {
  const html = output("shop/2045/sample/index.html");
  const end = html.indexOf("bookstore-reading-sample__footer");
  const endLinks = links(html.slice(end));
  const primary = endLinks.filter((link) => attr(link.tag, "data-analytics-source-slot") === "bookstore_sample_buy");
  const secondary = endLinks.filter((link) => attr(link.tag, "data-analytics-source-slot") === "bookstore_sample_continue");
  assert.equal(primary.length, 1);
  assert.equal(secondary.length, 1);
  assert.equal(primary[0].label, `Get the full e-book — ${canonicalPrice}`);
  assert.equal(attr(primary[0].tag, "href"), "/shop/2045/#bookstore-purchase");
  assert.ok(secondary[0].label.startsWith("About the book"));
  assert.equal(attr(secondary[0].tag, "href"), "/shop/2045/");
  for (const link of [...primary, ...secondary]) {
    assert.equal(attr(link.tag, "data-analytics-event"), "internal_promo_click");
    assert.equal(attr(link.tag, "data-analytics-path"), "/shop/2045/");
  }
  assert.ok(html.indexOf(primary[0].tag) < html.indexOf(secondary[0].tag));
  assert.ok(output("shop/2045/index.html").match(/\bid=(?:"bookstore-purchase"|bookstore-purchase)(?:\s|>)/));
  assert.ok(text(html).includes("A downloadable e-book, emailed after purchase."));
});
