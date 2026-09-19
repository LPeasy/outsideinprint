import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(file) {
  return fs.readFileSync(path.resolve(file), "utf8");
}

function frontMatter(file) {
  const source = read(file);
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, `expected YAML front matter in ${file}`);
  return match[1];
}

function scalar(front, key) {
  const match = front.match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, "m"));
  if (!match) return "";
  const value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function displayDate(isoDate) {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  assert.ok(match, `expected YYYY-MM-DD, received ${isoDate}`);
  return `${monthNames[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

const revisedAlmanackDescriptions = {
  "2026-05-23": "Bob's Almanack for May 23, 2026, with essays on public records, river oxygen, voter ID, and the limits of consent.",
  "2026-05-30": "Bob's Almanack for May 30, 2026, with essays on climate scenarios, Treasury auctions, machine politics, and chemical storage risk.",
  "2026-06-06": "Bob's Almanack for June 6, 2026, with essays on railroad crossings, rural mail, bank supervision, and racial categories.",
  "2026-06-20": "Bob's Almanack for June 20, 2026, with essays on meat inspection, fire escapes, parking meters, and the public marks people trust.",
  "2026-06-27": "Bob's Almanack for June 27, 2026, with essays on barcodes, traffic cones, tamper-evident seals, and curb cuts.",
  "2026-07-04": "Bob's Almanack for July 4, 2026, with essays on time clocks, patent models, emergency sirens, and health-care fraud records.",
  "2026-07-11": "Bob's Almanack for July 11, 2026, with essays on first steps, default ownership, the meaning of yes, and minimum payments.",
  "2026-07-18": "Bob's Almanack for July 18, 2026, with essays on Titanic warnings, wrong fits, broken promises, and owning your part.",
  "2026-07-25": "Bob's Almanack for July 25, 2026, with essays on Ford fuel-tank tests, timely updates, borrowed tools, and incomplete news.",
  "2026-08-01": "Bob's Almanack for August 1, 2026, with reflections on starting again, keeping promises, resilience, and daily healing.",
  "2026-08-08": "Bob's Almanack for August 8, 2026, with reflections on attention, spiritual wealth, open hands, and personal choice.",
  "2026-08-15": "Bob's Almanack for August 15, 2026, with reflections on identity, spiritual practice, adapting as you go, and letting go.",
  "2026-08-22": "Bob's Almanack for August 22, 2026, with reflections on self-worth, resilience under pressure, mistakes, and responsibility.",
  "2026-08-29": "Bob's Almanack for August 29, 2026, with reflections on giving help, waiting through delays, patient growth, and shared effort.",
  "2026-09-05": "Bob's Almanack for September 5, 2026, with reflections on presence, becoming, love, faith, and the path to 100 subscribers."
};

const dialogueDescriptions = {
  "all-ti": "At a dim bar, Syd and Oliver argue over record stock prices, the real economy, and whether a rising market proves that the system works.",
  "history-pushes-back": "Syd and Oliver test local truth against history, causality, and the objective structures people rely on even when they deny them.",
  "peaches-or-greece": "Over beers, Syd and Oliver compare travel, escape, and return as a joke about Athens turns into a question about why people leave home.",
  "smoke-and-brass": "In a smoke-filled bar, Syd and Oliver argue about objective truth, moral judgment, and whether trust can survive without shared reality.",
  "the-free-lunch": "Syd and Oliver debate demographic change, diversity, truth, and whether a society can treat cultural transformation as a free lunch.",
  "the-new-orthodoxy": "Syd and Oliver use the Stanford Prison Experiment to ask how moral certainty, institutional power, and social orthodoxy can make cruelty feel righteous.",
  "the-shape-of-sacrifice": "Inside a former church turned karaoke bar, Syd and Oliver confront sacrifice, comfort, faith, and what truth demands when it costs something.",
  "the-sound-of-authorit": "As a blues singer holds the room, Syd and Oliver debate peer review, institutional authority, and the standards that let knowledge accumulate.",
  "the-weight-of-promises": "Syd and Oliver examine promises, obligation, and why sincerity cannot sustain trust when truth changes with interest and mood.",
  "willful-ignorance": "In a crowded bar, Syd and Oliver ask whether modern ignorance comes from missing facts or refusing the implications that might change us.",
  "without-a-word": "Listening to half-spoken conversations around a bar, Syd and Oliver observe how silence, implication, and evasive language erode trust."
};

const essayMetadata = {
  "jack-stratton-and-the-vulfpeck-model": {
    metadataTitle: "Jack Stratton and Vulfpeck’s Independent Music Model",
    description: "A profile of Jack Stratton and Vulfpeck’s independent model, from Sleepify and Madison Square Garden to fan-first releases and creative control."
  },
  "natural-asset-companies": {
    metadataTitle: "What Is a Natural Asset Company? A Critical Guide",
    description: "A critical guide to Natural Asset Companies: how the model values ecosystems, who controls the assets, and the risks for conservation and public accountability."
  },
  "standard-of-living-vs-quality-of-life-what-the-numbers-miss": {
    metadataTitle: "Standard of Living vs. Quality of Life: What GDP Misses",
    description: "Standard of living measures income and material conditions; quality of life also includes health, time, security, community, and meaning. Here is what GDP misses."
  },
  "explaining-mutually-exclusive-and-collectively-exhaustive-where-did-my-paycheck-go": {
    metadataTitle: "MECE Explained: Where Did My Paycheck Go?",
    description: "A practical guide to mutually exclusive and collectively exhaustive thinking, using a household budget to show how categories prevent overlap and omission."
  },
  "public-vs-private-pay-who-really-earns-more": {
    metadataTitle: "",
    contentTitle: "Public vs Private Pay: Who Really Earns More?",
    description: "Public-sector compensation combines wages, benefits, pensions, and job security differently across occupations. This guide explains why simple averages mislead."
  }
};

test("revision dates feed one shared metadata resolver", () => {
  const dates = read("layouts/partials/metadata/dates.html");
  const page = read("layouts/partials/metadata/page.html");
  const openGraph = read("layouts/partials/opengraph.html");
  const creativeWork = read("layouts/partials/schema/creative-work.html");
  const sitemap = read("layouts/sitemap.xml");
  const sitemapLastmod = read("layouts/partials/metadata/sitemap-lastmod.html");

  assert.match(dates, /Params\.revision_history/);
  assert.match(dates, /reflect\.IsSlice/);
  assert.match(dates, /\$modified := false/);
  assert.match(dates, /partial "shop\/product-data\.html"/);
  assert.match(dates, /index \$product "release_date"/);
  assert.match(dates, /"sitemap_lastmod_iso" \$sitemapLastmodISO/);
  assert.doesNotMatch(dates, /\$page\.Lastmod/);
  for (const requiredField of ["version", "date", "note"]) {
    assert.match(dates, new RegExp(`missing ${requiredField}`));
  }
  assert.match(page, /partial "metadata\/dates\.html"/);
  assert.match(page, /"dates" \$dates/);
  assert.match(openGraph, /\$meta\.dates\.published_iso/);
  assert.match(openGraph, /\$meta\.dates\.modified_iso/);
  assert.doesNotMatch(openGraph, /\$page\.(?:Date|Lastmod)/);
  assert.match(creativeWork, /\$meta\.dates\.published_iso/);
  assert.match(creativeWork, /\$meta\.dates\.modified_iso/);
  assert.doesNotMatch(creativeWork, /\$page\.(?:Date|Lastmod)/);
  assert.match(sitemap, /partial "metadata\/sitemap-lastmod\.html"/);
  assert.doesNotMatch(sitemap, /\.Lastmod/);
  assert.match(sitemapLastmod, /partial "metadata\/dates\.html"/);
  assert.match(sitemapLastmod, /\$candidateDates\.sitemap_lastmod_iso/);
  assert.match(sitemapLastmod, /collections\/resolve-items\.html/);
  assert.match(sitemapLastmod, /archive\/resolve-pages\.html/);
  assert.match(sitemapLastmod, /eq \$page\.Section "library"/);
  assert.match(sitemapLastmod, /slice "essays" "working-papers"/);
});

test("Almanack issues carry exact unique metadata titles and substantive descriptions", () => {
  const files = fs.readdirSync(path.resolve("content/almanack"))
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort();
  assert.ok(files.length > 0, "expected dated Almanack issues to validate");

  const titles = new Set();
  const descriptions = new Set();
  for (const fileName of files) {
    const issueDate = fileName.replace(/\.md$/, "");
    const front = frontMatter(`content/almanack/${fileName}`);
    const expectedTitle = `Bob's Almanack — ${displayDate(issueDate)}`;
    const title = scalar(front, "metadata_title");
    const description = scalar(front, "description");
    assert.equal(title, expectedTitle, `${fileName} metadata title`);
    assert.ok(description.length >= 70 && description.length <= 160, `${fileName} description length ${description.length}`);
    assert.doesNotMatch(description, /(?:\.\.\.|…)\s*$/);
    titles.add(title.toLowerCase());
    descriptions.add(description.toLowerCase());
    if (revisedAlmanackDescriptions[issueDate]) {
      assert.equal(description, revisedAlmanackDescriptions[issueDate]);
    }
  }
  assert.equal(titles.size, files.length);
  assert.equal(descriptions.size, files.length);
});

test("all published dialogues have explicit clean descriptions", () => {
  const files = fs.readdirSync(path.resolve("content/essays/dialogues"))
    .filter((name) => name.endsWith(".md"));
  const descriptions = new Set();
  for (const fileName of files) {
    const front = frontMatter(`content/essays/dialogues/${fileName}`);
    if (scalar(front, "draft") === "true" || scalar(front, "library_type") !== "dialogue") continue;
    const description = scalar(front, "description");
    assert.ok(description.length >= 70 && description.length <= 160, `${fileName} needs a 70–160 character description`);
    assert.doesNotMatch(description, /^\d{1,2} [A-Z][a-z]+ \d{4}\b/);
    assert.doesNotMatch(description, /^(?:Created by Author|Photo by|Source:)/i);
    assert.doesNotMatch(description, /(?:\.\.\.|…|&amp;(?:rsquo|lsquo|rdquo|ldquo);)\s*$/i);
    descriptions.add(description.toLowerCase());
  }
  assert.equal(descriptions.size, files.length);

  for (const [slug, expected] of Object.entries(dialogueDescriptions)) {
    assert.equal(scalar(frontMatter(`content/essays/dialogues/${slug}.md`), "description"), expected);
  }
});

test("the five targeted essays carry approved metadata copy", () => {
  for (const [slug, expected] of Object.entries(essayMetadata)) {
    const front = frontMatter(`content/essays/${slug}.md`);
    assert.equal(scalar(front, "description"), expected.description);
    assert.equal(scalar(front, "metadata_title"), expected.metadataTitle);
    if (expected.contentTitle) assert.equal(scalar(front, "title"), expected.contentTitle);
  }
});

test("metadata normalization, image facts, pagination, and audit resolution stay centralized", () => {
  const description = read("layouts/partials/metadata_description.html");
  const image = read("layouts/partials/metadata_image.html");
  const page = read("layouts/partials/metadata/page.html");
  const openGraph = read("layouts/partials/opengraph.html");
  const audit = read("scripts/audit_seo_metadata.ps1");
  const guardrails = read("scripts/check_essay_guardrails.ps1");

  assert.match(description, /htmlUnescape \(\$description \| plainify\)/);
  assert.match(image, /oip_metadata_image_details/);
  assert.match(image, /social_width/);
  assert.match(image, /social_height/);
  assert.match(page, /Scratch\.Get "oip_metadata_image_details"/);
  assert.match(page, /"image_width" \$imageWidth/);
  assert.match(page, /"image_height" \$imageHeight/);
  assert.match(page, /"image_type" \$imageType/);
  for (const property of ["width", "height", "type"]) {
    assert.match(openGraph, new RegExp(`og:image:${property}`));
  }
  assert.match(openGraph, /upper \(index \$localeParts 1\)/);
  assert.match(page, /partial "archive\/resolve-pages\.html" \(dict "site" site "mode" "archive"\)/);
  assert.match(page, /\.Paginate \$archivePages 50/);
  assert.match(page, /Archive — Page %d/);
  assert.match(page, /\$archivePaginator\.URL \| absURL/);
  assert.match(audit, /Get-FrontMatterValue -Map \$frontMatter -Key 'metadata_title'/);
  assert.match(audit, /content_title = \$contentTitle/);
  assert.match(audit, /metadata_title = \$metadataTitle/);
  assert.match(guardrails, /'description',/);
});
