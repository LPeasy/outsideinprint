import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (relativePath) => fs.readFileSync(path.resolve(relativePath), "utf8");
const walk = (directory) => fs.readdirSync(path.resolve(directory), { withFileTypes: true }).flatMap((entry) => {
  const child = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(child) : [child];
});

function collectionSlugs(source) {
  const frontMatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/m)?.[1] || "";
  const inline = frontMatter.match(/^collections:\s*\[([^\]]*)\]/m);
  if (inline) return inline[1].split(",").map((value) => value.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const block = frontMatter.match(/^collections:\s*\r?\n((?:\s+-[^\r\n]*(?:\r?\n|$))+)/m);
  return block ? [...block[1].matchAll(/^\s+-\s*["']?([^"'\r\n]+)["']?\s*$/gm)].map((match) => match[1].trim()) : [];
}

test("author hub resolves six unique selected works, six distinct recent works, and every book", () => {
  const authorData = read("data/authors.yaml");
  const dossier = read("layouts/authors/dossier.html");
  const featured = [...authorData.matchAll(/^\s{6}- (\/essays\/[^\s]+\/)$/gm)].map((match) => match[1]);
  assert.equal(featured.length, 6);
  assert.equal(new Set(featured).size, 6);
  assert.match(authorData, /^\s{4}latest_limit: 6$/m);
  assert.match(dossier, /Author featured work is configured more than once/);
  assert.match(dossier, /not \(isset \$selectedPaths \$candidate\.RelPermalink\)/);
  assert.match(dossier, /where \.Pages "Params\.book_key" "!=" nil/);
  assert.match(dossier, />Books</);
  assert.match(dossier, />Selected Writing</);
  assert.match(dossier, />Recent Writing</);
  assert.equal(walk("content/shop").filter((file) => /(?:index|_index)\.md$/.test(file) && /^book_key:/m.test(read(file))).length, 4);

  const sectionPositions = [
    'id="author-selected-title"',
    'partial "newsletter_signup.html"',
    'id="author-recent-title"',
    'id="author-books-title"',
  ].map((marker) => dossier.indexOf(marker));
  assert.ok(sectionPositions.every((position, index) => position >= 0 && (!index || position > sectionPositions[index - 1])), "reading and newsletter discovery must precede the books");
  assert.match(dossier, /href="#author-selected-title"/);
  assert.match(dossier, /href="#author-newsletter"/);
  assert.match(dossier, /partial "newsletter_signup\.html"[\s\S]*?"sourceSlot" "author_newsletter"[\s\S]*?"anchorID" "author-newsletter"/);
  assert.match(dossier, /\.Params\.reader_note[\s\S]*?author-route__invitation/);
  assert.match(dossier, /if gt \(len \$selectedWorks\) 0[\s\S]*?href="#author-selected-title"[\s\S]*?else[\s\S]*?"archive\/" \| relURL/);
  assert.doesNotMatch(dossier, /author-route__books/);
});

test("collection cleanup adds the household route and keeps memberships intentional", () => {
  const collections = read("data/collections.yaml");
  assert.match(collections, /^\s{2}- slug: household-economy-work-and-cost$/m);
  assert.match(collections, /^\s{4}start_here: standard-of-living-vs-quality-of-life-what-the-numbers-miss$/m);
  assert.match(collections, /^\s{4}start_here: the-meter-at-the-curb$/m);

  const expectedHousehold = [
    "american-household-debt.md",
    "cpi-report-economic-analysis.md",
    "generation-inflation.md",
    "household-and-individual-wealth-in-america.md",
    "labor-force-participation-trends-in-modern-american-society.md",
    "public-vs-private-pay-who-really-earns-more.md",
    "standard-of-living-vs-quality-of-life-what-the-numbers-miss.md",
    "the-national-debt-is-screwing-you-heres-how.md",
  ];
  const householdMembers = walk("content/essays").filter((file) => collectionSlugs(read(file)).includes("household-economy-work-and-cost")).map((file) => path.basename(file)).sort();
  assert.deepEqual(householdMembers, expectedHousehold.sort());
  for (const file of ["the-coin-slot-on-the-corner.md", "the-meter-at-the-curb.md"]) {
    assert.ok(collectionSlugs(read(path.join("content/essays", file))).includes("civic-institutions-and-public-power"));
  }
  for (const file of walk("content").filter((candidate) => candidate.endsWith(".md"))) {
    assert.ok(collectionSlugs(read(file)).length <= 2, `${file} has more than two collection memberships`);
  }
});

test("Library progressively loads one complete JSON catalog without duplicate live result surfaces", () => {
  const list = read("layouts/library/list.html");
  const resolver = read("layouts/partials/library/resolve-entries.html");
  const json = read("layouts/library/list.libraryindex.json");
  assert.match(list, /\$initialLimit := 12/);
  assert.ok(list.indexOf("if (isDefault(state)) { showDefault(); return; }") < list.indexOf("loadCatalog().then"));
  assert.match(list, /fetch\(indexUrl/);
  assert.match(list, /detachGroupedResults\(\)/);
  assert.match(list, /groupedRoot\.parentNode\.removeChild\(groupedRoot\)/);
  assert.match(list, /attachGroupedResults\(\)/);
  assert.match(list, /groupedRoot\.parentNode.*insertBefore\(groupedRoot, flatSection\)/);
  assert.match(list, /error\.hidden = false/);
  assert.doesNotMatch(resolver, /"title" \.Title/);
  for (const field of ["tags", "topics", "searchText", "collectionSlugs", "summary"]) assert.ok(json.includes(`"${field}"`));
  assert.ok(Buffer.byteLength(list) < 20000);
  assert.ok(Buffer.byteLength(resolver) < 8000);
  assert.ok(Buffer.byteLength(json) < 2000);
});

test("Archive uses 50-item pages with page-specific canonical metadata and crawl links", () => {
  const archive = read("layouts/archive/list.html");
  const render = read("layouts/partials/archive/render-list.html");
  const metadata = read("layouts/partials/metadata/page.html");
  assert.match(archive, /\.Paginate \$pages 50/);
  assert.match(metadata, /\.Paginate \$archivePages 50/);
  assert.match(metadata, /Archive — Page %d/);
  assert.match(metadata, /\$canonical = \$archivePaginator\.URL \| absURL/);
  assert.match(render, /rel="prev"/);
  assert.match(render, /rel="next"/);
  assert.match(render, /archive-pagination page-shell page-shell--reading/);
});

test("new-content guardrail is additive and leaves dialogue philosophy exemptions intact", () => {
  const guardrail = read("scripts/check_essay_guardrails.ps1");
  const fixtures = read("tests/test_essay_guardrails.ps1");
  for (const snippet of [
    "Expand-DiscoveryLongformPaths",
    "Get-PublicCollectionSlugs",
    "Test-GitRefContainsPath",
    "discovery_exempt_reason",
    "missing_discovery_route",
  ]) assert.ok(guardrail.includes(snippet), `missing discovery guardrail contract: ${snippet}`);
  assert.match(guardrail, /\$targetPaths = @\(Expand-EssayPaths -EssayPaths \$resolvedTargetPaths\)/);
  for (const phrase of [
    "newly added draft",
    "public collection to pass",
    "private collection to fail",
    "nonempty discovery_exempt_reason",
    "discovery guard to include dialogue longform",
    "dialogue longform to remain excluded from the editorial philosophy audit",
  ]) assert.ok(fixtures.includes(phrase), `missing ratchet fixture: ${phrase}`);
});
