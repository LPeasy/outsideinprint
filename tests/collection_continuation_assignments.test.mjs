import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const audit = read("docs/collection-continuation-audit.md");
const ledger = JSON.parse(audit.match(/```json\s*([\s\S]*?)```/)?.[1] || "null");
const definitions = read("data/collections.yaml");
const everydayHistoryMembers = new Set([
  "why-daylight-saving-time",
  "what-armistice-day-meant",
  "why-we-celebrate-memorial-day-origins-traditions-and-importance",
  "fine-china-the-long-road-from-jingdezhen-to-grandmas-cabinet",
  "the-bars-on-the-gum",
  "the-curb-cut-at-the-corner",
]);

function currentMembership(slug, original) {
  return everydayHistoryMembers.has(slug) ? [...original, "everyday-history"] : original;
}

function frontMatter(source) {
  return source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || "";
}

function collections(source) {
  const metadata = frontMatter(source);
  const inline = metadata.match(/^collections:\s*\[([^\]]*)\]/m);
  if (inline) return inline[1].split(",").map((value) => value.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const block = metadata.match(/^collections:[ \t]*\r?\n((?:[ \t]+-[^\r\n]*(?:\r?\n|$))+)/m);
  return block ? [...block[1].matchAll(/^\s+-\s*["']?([^"'\r\n]+)["']?\s*$/gm)].map((match) => match[1].trim()) : [];
}

test("the approved archive ledger locks 51 new assignments and two expanded memberships", () => {
  assert.equal(Object.keys(ledger.assignments).length, 53);
  assert.equal(Object.values(ledger.assignments).filter((items) => items.length === 1).length, 51);
  assert.equal(Object.values(ledger.assignments).filter((items) => items.length === 2).length, 2);
  for (const [slug, expected] of Object.entries(ledger.assignments)) {
    assert.deepEqual(collections(read(`content/essays/${slug}.md`)), currentMembership(slug, expected), slug);
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
    assert.deepEqual(collections(read(`content/essays/${slug}.md`)), currentMembership(slug, []), slug);
  }
  for (const slug of ledger.privateLedger) assert.deepEqual(collections(read(`content/essays/${slug}.md`)), ["the-ledger"], slug);
});

test("new collection definitions are explicit public topics with a real starting member", () => {
  for (const [slug, title, weight, start] of [
    ["everyday-history", "Everyday History", 28, "why-daylight-saving-time"],
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

test("Everyday History resolves to the six approved essays", () => {
  const members = fs.readdirSync("content/essays", { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .filter((entry) => collections(read(`${entry.parentPath}/${entry.name}`)).includes("everyday-history"))
    .map((entry) => entry.name.slice(0, -3));
  assert.deepEqual(members.sort(), [...everydayHistoryMembers].sort());
});

test("The Outside Byline is a public series and secondary to every guest contributor's subject collection", () => {
  const series = "the-outside-byline";
  const publicDefinitions = new Map(
    [...definitions.matchAll(/^  - slug: ([a-z0-9-]+)\r?\n([\s\S]*?)(?=^  - slug:|(?![\s\S]))/gm)]
      .filter(([, , body]) => /^    public: true[ \t]*\r?$/m.test(body))
      .map(([, slug, body]) => [slug, body]),
  );
  assert.match(publicDefinitions.get(series) || "", /^    kind: series[ \t]*\r?$/m);

  for (const entry of fs.readdirSync("content", { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = `${entry.parentPath}/${entry.name}`;
    const source = read(path);
    const metadata = frontMatter(source);
    const guest = /^contributor_role:[ \t]*["']?guest["']?[ \t]*\r?$/m.test(metadata);
    const draft = /^draft:[ \t]*true[ \t]*\r?$/m.test(metadata);
    const memberships = collections(source);
    if (!guest) {
      assert.ok(!memberships.includes(series), path);
    } else if (!draft || memberships.includes(series)) {
      assert.equal(memberships.length, 2, path);
      assert.ok(memberships[0] !== series && publicDefinitions.has(memberships[0]), path);
      assert.equal(memberships[1], series, path);
    }
  }
});

test("Pope articles keep their explicit reciprocal reading links", () => {
  const biography = "pope-leo-xiv-from-chicago-altar-boy-to-the-chair-of-saint-peter";
  const questions = "8-big-questions-everyone-has-about-pope-leo-xiv";
  assert.ok(read(`content/essays/${biography}.md`).includes(`/essays/${questions}/`));
  assert.ok(read(`content/essays/${questions}.md`).includes(`/essays/${biography}/`));
});
