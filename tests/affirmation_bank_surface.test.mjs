import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readCanonicalAffirmations(source) {
  const lines = source.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === "## Affirmations");
  assert.notEqual(headingIndex, -1, "canonical bank must keep its Affirmations heading");

  const entries = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (/^##\s+/.test(line)) break;
    if (line === "") continue;

    assert.match(line, /^- \S(?:.*\S)?$/, `malformed one-line affirmation bullet: ${line}`);
    entries.push(line.slice(2));
  }

  return entries;
}

const bankSource = read("editorial/affirmations-bank.md");
const collectionSingle = read("layouts/collections/single.html");
const affirmationBankPartial = read("layouts/partials/collections/affirmation-bank.html");
const css = read("assets/css/main.css");
const affirmations = readCanonicalAffirmations(bankSource);

test("canonical affirmation bank is a nonempty exact ordered list", () => {
  assert.ok(affirmations.length > 0, "canonical bank must contain affirmations");
  assert.equal(new Set(affirmations).size, affirmations.length, "canonical affirmations must be exactly unique");
});

test("The Things We Say alone mounts the canonical affirmation bank", () => {
  assert.match(collectionSingle, /\$isTheThingsWeSay := eq[\s\S]*?"the-things-we-say"/);
  assert.match(collectionSingle, /if \$isTheThingsWeSay/);
  assert.match(collectionSingle, /partial "collections\/affirmation-bank\.html"/);

  const startHere = collectionSingle.indexOf("collection-section__lead");
  const bankInclude = collectionSingle.indexOf('partial "collections/affirmation-bank.html"');
  const contents = collectionSingle.indexOf('collection-section__contents');
  const publishedReflections = collectionSingle.indexOf("Published Reflections", contents);
  const related = collectionSingle.indexOf('collection-section__related', contents);
  assert.ok(startHere >= 0 && bankInclude > startHere, "bank must follow Start Here");
  assert.ok(contents > bankInclude, "Published Reflections must follow the bank");
  assert.ok(publishedReflections > contents, "remaining entries need a visible Published Reflections heading");
  assert.ok(related > publishedReflections, "Related Collections must follow Published Reflections");

  assert.equal(
    (collectionSingle.match(/partial "collections\/affirmation-bank\.html"/g) || []).length,
    1,
    "generic collection layout must mount the bank only once"
  );
});

test("affirmation bank partial renders one accessible static list from the canonical source", () => {
  for (const snippet of [
    '$bankPath := "editorial/affirmations-bank.md"',
    'os.ReadFile $bankPath',
    'id="the-words-we-say"',
    'class="page-shell page-shell--grid affirmation-bank"',
    'aria-labelledby="the-words-we-say-title"',
    '<h2 id="the-words-we-say-title">The Words We Say</h2>',
    'class="affirmation-bank__meta"',
    'class="affirmation-bank__intro"',
    'class="affirmation-bank__list"',
    'class="affirmation-bank__item"'
  ]) {
    assert.match(affirmationBankPartial, new RegExp(escapeRegex(snippet)));
  }

  assert.match(affirmationBankPartial, /range \$affirmations/);
  assert.match(affirmationBankPartial, /len \$affirmations/);
  assert.match(affirmationBankPartial, /errorf[\s\S]*missing the required ## Affirmations heading/);
  assert.match(affirmationBankPartial, /errorf[\s\S]*contains no one-line affirmation bullets/);
  assert.doesNotMatch(affirmationBankPartial, /<script\b/i);
  assert.doesNotMatch(affirmationBankPartial, /<details\b|random|shuffle|search|filter|checkbox/i);
});

test("affirmation bank hooks have owned responsive styling", () => {
  for (const selector of [
    ".affirmation-bank{",
    ".affirmation-bank__meta{",
    ".affirmation-bank__intro{",
    ".affirmation-bank__list{",
    ".affirmation-bank__item{"
  ]) {
    assert.match(css, new RegExp(escapeRegex(selector)));
  }

  assert.match(css, /\.affirmation-bank__list\s*\{[\s\S]*?column-count:\s*2/);
  assert.match(css, /\.affirmation-bank__list\s*\{[\s\S]*?column-width:\s*22rem/);
  assert.match(css, /\.affirmation-bank__item\s*\{[\s\S]*?break-inside:\s*avoid/);
});
