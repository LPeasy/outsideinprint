import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const audit = read("docs/collection-continuation-audit.md");
const ledger = JSON.parse(audit.match(/```json\s*([\s\S]*?)```/)?.[1] || "null");
const definitions = read("data/collections.yaml");

function collections(source) {
  const frontMatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || "";
  const inline = frontMatter.match(/^collections:\s*\[([^\]]*)\]/m);
  if (inline) return inline[1].split(",").map((value) => value.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const block = frontMatter.match(/^collections:[ \t]*\r?\n((?:[ \t]+-[^\r\n]*(?:\r?\n|$))+)/m);
  return block ? [...block[1].matchAll(/^\s+-\s*["']?([^"'\r\n]+)["']?\s*$/gm)].map((match) => match[1].trim()) : [];
}

test("the approved archive ledger locks 51 new assignments and two expanded memberships", () => {
  assert.equal(Object.keys(ledger.assignments).length, 53);
  assert.equal(Object.values(ledger.assignments).filter((items) => items.length === 1).length, 51);
  assert.equal(Object.values(ledger.assignments).filter((items) => items.length === 2).length, 2);
  for (const [slug, expected] of Object.entries(ledger.assignments)) {
    assert.deepEqual(collections(read(`content/essays/${slug}.md`)), expected, slug);
    assert.equal(new Set(expected).size, expected.length, slug);
    for (const member of expected) assert.ok(definitions.includes(`- slug: ${member}\n`), `${slug}: ${member} must exist`);
  }
  assert.deepEqual(ledger.baseline, { publishedReadingPieces: 259, publicCollectionMembers: 194 });
  assert.deepEqual(ledger.expected, { publishedReadingPieces: 259, publicCollectionMembers: 245 });
});

test("deliberate exclusions, editorial holds, and private Ledger memberships stay untouched", () => {
  assert.equal(ledger.excluded.length, 7);
  assert.equal(ledger.editorialHolds.length, 4);
  assert.equal(ledger.privateLedger.length, 3);
  const excluded = [...ledger.excluded, ...ledger.editorialHolds, ...ledger.privateLedger];
  assert.equal(new Set(excluded).size, 14);
  for (const slug of [...ledger.excluded, ...ledger.editorialHolds]) {
    assert.equal(ledger.assignments[slug], undefined);
    assert.deepEqual(collections(read(`content/essays/${slug}.md`)), [], slug);
  }
  for (const slug of ledger.privateLedger) assert.deepEqual(collections(read(`content/essays/${slug}.md`)), ["the-ledger"], slug);
});

test("new collection definitions are explicit public topics with a real starting member", () => {
  for (const [slug, title, weight, start] of [
    ["money-banking-inflation", "Money, Banking, and Inflation", 100, "why-a-return-to-the-gold-standard-would-break-the-economy"],
    ["brands-business-consumer-choice", "Brands, Business, and Consumer Choice", 105, "whos-drinking-all-the-modelo"],
  ]) {
    const definition = definitions.split(`  - slug: ${slug}\n`)[1]?.split(/\n  - slug:/)[0];
    assert.ok(definition, slug);
    for (const field of ["kind: topic", "public: true", "explicit_only: true", "force_public: false", "min_items: 3", `weight: ${weight}`, `start_here: ${start}`]) assert.ok(definition.includes(field), `${slug}: ${field}`);
    assert.ok(definition.includes(title));
    assert.ok(collections(read(`content/essays/${start}.md`)).includes(slug));
    const landing = read(`content/collections/${slug}.md`);
    assert.match(landing, /^draft: false$/m);
    assert.ok(landing.includes('/images/social/outside-in-print-default.png'));
  }
});

test("Pope articles keep their explicit reciprocal reading links", () => {
  const biography = "pope-leo-xiv-from-chicago-altar-boy-to-the-chair-of-saint-peter";
  const questions = "8-big-questions-everyone-has-about-pope-leo-xiv";
  assert.ok(read(`content/essays/${biography}.md`).includes(`/essays/${questions}/`));
  assert.ok(read(`content/essays/${questions}.md`).includes(`/essays/${biography}/`));
});
