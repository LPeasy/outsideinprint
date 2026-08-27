import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const requiredPaths = [
  "content/apps/_index.md",
  "content/apps/bucks-machine/index.md",
  "content/apps/baseball-upside-risk/index.md",
  "content/apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.pdf",
  "content/apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.xlsx",
  "data/apps.yaml",
  "layouts/apps/list.html",
  "layouts/apps/single.html",
  "layouts/partials/apps/product-data.html",
  "layouts/partials/apps/actions.html",
  "layouts/partials/apps/sample-downloads.html",
  "layouts/partials/apps/companion-publication.html",
  "layouts/partials/schema/webpage.html",
];

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

function productBlock(source, key, nextKey = null) {
  const start = source.indexOf(`  ${key}:`);
  assert.notEqual(start, -1, `expected Apps data block: ${key}`);
  const end = nextKey ? source.indexOf(`  ${nextKey}:`, start + 1) : source.length;
  assert.ok(end > start, `expected complete Apps data block: ${key}`);
  return source.slice(start, end);
}

function frontMatterBoolean(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(true|false)\\s*$`, "m"));
  assert.ok(match, `expected ${key} front matter`);
  return match[1] === "true";
}

test("Apps data contract preserves Bucks and defines the static Baseball preview", () => {
  for (const relativePath of requiredPaths) {
    assert.ok(fs.existsSync(path.resolve(relativePath)), `expected Apps contract file: ${relativePath}`);
  }

  const appsIndex = read("content/apps/_index.md");
  const bucksPage = read("content/apps/bucks-machine/index.md");
  const baseballPage = read("content/apps/baseball-upside-risk/index.md");
  const appsData = read("data/apps.yaml");
  const bucks = productBlock(appsData, "bucks_machine", "baseball_upside_risk");
  const baseball = productBlock(appsData, "baseball_upside_risk");
  const baseballSurface = `${baseballPage}\n${baseball}`;

  for (const source of [appsIndex, bucksPage]) {
    assert.equal(frontMatterBoolean(source, "draft"), false);
    assert.equal(frontMatterBoolean(source, "noindex"), false);
  }
  const baseballDraft = frontMatterBoolean(baseballPage, "draft");
  const baseballNoindex = frontMatterBoolean(baseballPage, "noindex");
  assert.equal(baseballDraft, false, "The frozen Baseball publication candidate must be non-draft");
  assert.equal(baseballNoindex, false, "The frozen Baseball publication candidate must be indexable");
  assert.match(bucksPage, /^weight:\s*10\s*$/m);
  assert.match(baseballPage, /^weight:\s*20\s*$/m);
  for (const source of [bucksPage, baseballPage]) {
    assert.match(source, /^build:\s*\r?\n\s+publishResources:\s*false\s*$/ms);
  }

  const requiredStrings = [
    "slug",
    "title",
    "category",
    "status",
    "availability",
    "promise",
    "audience",
    "intake_note",
    "preview_eyebrow",
    "preview_title",
    "preview_badge",
    "preview_footer",
    "preview_accessible_label",
    "preview_components_label",
    "workflow_heading",
    "workflow_intro",
    "output_kicker",
    "output_heading",
    "limitations_heading",
    "privacy_heading",
    "privacy_warning",
    "operator_legal_name",
    "seller_legal_name",
    "operator_line",
    "support_email",
    "support_line",
    "commercial_action_state",
    "back_link_state",
    "sample_downloads_state",
  ];
  const requiredCollections = ["workflow", "deliverables", "preview_rows", "limitations"];
  for (const [name, block] of [["Bucks Machine", bucks], ["Baseball Upside Risk", baseball]]) {
    for (const key of requiredStrings) {
      assert.match(block, new RegExp(`^\\s+${key}:`, "m"), `${name} must define ${key}`);
    }
    for (const key of requiredCollections) {
      assert.match(block, new RegExp(`^\\s+${key}:`, "m"), `${name} must define ${key}`);
    }
    assert.match(block, /^\s+operator_legal_name:\s*["']?Outside In Print LLC["']?\s*$/m);
    assert.match(block, /^\s+seller_legal_name:\s*["']?Outside In Print LLC["']?\s*$/m);
    assert.match(block, /^\s+support_email:\s*["']?support@outsideinprint\.org["']?\s*$/m);
    assert.match(block, /^\s+commercial_action_state:\s*["']?disabled["']?\s*$/m);
  }

  assert.match(bucks, /Bucks Machine, a product operated and sold by Outside In Print LLC\./);
  assert.match(bucks, /^\s+sample_downloads_state:\s*["']?public_preview["']?\s*$/m);
  assert.match(bucks, /bucks-machine-synthetic-professional-services-demo\.pdf/);
  assert.match(bucks, /bucks-machine-synthetic-professional-services-demo\.xlsx/);
  assert.match(bucks, /Turn de-identified rough project notes into a human-reviewed scope, schedule, budget, risk, PDF, and workbook planning packet\./);

  assert.match(baseball, /Baseball Upside Risk, a product operated and sold by Outside In Print LLC\./);
  assert.match(baseball, /^\s+sample_downloads_state:\s*["']?disabled["']?\s*$/m);
  assert.doesNotMatch(baseball, /^\s+sample_downloads:\s*$/m);
  assert.match(baseball, /The interactive calculator and personalized reports are not currently available for use or purchase\./);
  assert.match(baseball, /This static preview collects no player profile, name, school, email address, payment, or report request\./);
  assert.match(baseball, /This frozen B-GERM snapshot was generated May 14, 2026\. It uses 2024-25 participation inputs and 2025 draft inputs; it is not a live 2026 probability estimate\./);
  assert.match(baseball, /Long Shots in the Big League/);
  assert.match(baseball, /Baseball, Gross Earnings, and the Arithmetic of Risk/);
  assert.match(baseball, /Companion publication in preparation/);

  const frozenValues = ["$0", "99.509%", "0.491%", "0.535%", "0.495%", "0.141%", "$27,201"];
  let priorIndex = -1;
  for (const value of frozenValues) {
    const valueIndex = baseball.indexOf(value, priorIndex + 1);
    assert.ok(valueIndex > priorIndex, `expected frozen Baseball value in approved order: ${value}`);
    priorIndex = valueIndex;
  }
  for (const snapshotFact of ["May 14, 2026", "1,000,000 fixed-seed draws", "20260512", "Terminal paths", "14", "Gross professional baseball earnings only"]) {
    assert.match(baseball, new RegExp(snapshotFact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const forbidden of [
    /Robert V\. Ussley/i,
    /\bbyline\b/i,
    /\bASIN\b/i,
    /\bKDP\b/i,
    /\bpre-?order\b/i,
    /<form\b/i,
    /stripe/i,
    /checkout/i,
    /waitlist/i,
    /SoftwareApplication/i,
    /"@type"\s*:\s*"(?:Product|Offer)"/i,
    /\b[A-F0-9]{64}\b/i,
    /\bSHA-?256\b/i,
    /\bartifact hash\b/i,
  ]) {
    assert.doesNotMatch(baseballSurface, forbidden);
  }
});

test("Apps templates keep presentation data-driven and release controls inert", () => {
  const listTemplate = read("layouts/apps/list.html");
  const singleTemplate = read("layouts/apps/single.html");
  const productData = read("layouts/partials/apps/product-data.html");
  const actions = read("layouts/partials/apps/actions.html");
  const sampleDownloads = read("layouts/partials/apps/sample-downloads.html");
  const companion = read("layouts/partials/apps/companion-publication.html");
  const templates = `${listTemplate}\n${singleTemplate}\n${productData}\n${actions}\n${sampleDownloads}\n${companion}`;

  assert.match(listTemplate, /partial\s+"apps\/product-data\.html"/);
  assert.match(listTemplate, /\$densePreview\s*:=\s*gt\s+\(len\s+\$previewRows\)\s+4/);
  assert.match(listTemplate, /apps-card__preview--dense/);
  assert.match(singleTemplate, /partial\s+"apps\/product-data\.html"/);
  assert.match(singleTemplate, /partial\s+"apps\/actions\.html"/);
  assert.match(singleTemplate, /partial\s+"apps\/sample-downloads\.html"/);
  assert.match(singleTemplate, /partial\s+"apps\/companion-publication\.html"/);
  assert.equal((listTemplate.match(/<h1\b/g) || []).length, 1);
  assert.equal((singleTemplate.match(/<h1\b/g) || []).length, 1);

  for (const field of [
    "category", "preview_eyebrow", "preview_title", "preview_badge", "preview_rows", "preview_footer",
    "preview_accessible_label", "workflow_heading", "workflow_intro", "output_kicker", "output_heading",
    "limitations_heading", "privacy_heading", "source_vintage_note", "companion_publication", "sample_downloads_state",
  ]) {
    assert.match(templates, new RegExp(field), `expected data-driven Apps field: ${field}`);
  }
  assert.match(productData, /Outside In Print LLC/);
  assert.match(productData, /local_draft/);
  assert.match(productData, /public_preview/);
  assert.match(productData, /sample_downloads/);
  assert.match(productData, /errorf/);
  assert.match(sampleDownloads, /hugo\.IsServer/);
  assert.match(sampleDownloads, /Resources\.GetMatch/);
  assert.match(sampleDownloads, /\.RelPermalink/);
  assert.match(singleTemplate, /href="mailto:\{\{ index \$product "support_email" \}\}"/);
  assert.match(singleTemplate, /back_link_state/);

  assert.doesNotMatch(actions, /<a\b|<form\b|mailto:|stripe|checkout|price|waitlist/i);
  assert.doesNotMatch(companion, /<a\b|href=|Robert V\. Ussley|\bbyline\b|\bcover\b|\bprice\b|\bpre-?order\b/i);
  assert.doesNotMatch(templates, /SoftwareApplication|"@type"\s*:\s*"(?:Product|Offer)"/i);
});

test("Apps navigation, styling, and route ownership cover both products", () => {
  const masthead = read("layouts/partials/masthead.html");
  const footer = read("layouts/partials/footer.html");
  const listTemplate = read("layouts/apps/list.html");
  const singleTemplate = read("layouts/apps/single.html");
  const sampleDownloads = read("layouts/partials/apps/sample-downloads.html");
  const companion = read("layouts/partials/apps/companion-publication.html");
  const css = read("assets/css/main.css");
  const layoutMatrix = read("docs/layout-ownership-matrix.md");
  const appsMarkup = `${listTemplate}\n${singleTemplate}\n${sampleDownloads}\n${companion}`;
  const webpageSchema = read("layouts/partials/schema/webpage.html");
  const appsCssMatch = css.match(/\/\* Apps & Tools public development preview \*\/([\s\S]*?)(?=\r?\n\/\* Games storefront and product \*\/|\r?\n@media print)/);

  for (const chrome of [masthead, footer]) {
    assert.match(chrome, /site\.GetPage\s+"\/apps"/);
    assert.match(chrome, /\$showApps\s*:=\s*and\s+\$appsPage\s+\(not\s+\$appsPage\.Draft\)/);
    assert.doesNotMatch(chrome, /\$showApps\s*:=[^\r\n]*hugo\.IsServer/);
    assert.match(chrome, />Apps\s*&amp;\s*Tools</);
  }
  assert.match(masthead, /\$isApps\s*:=\s*eq\s+\.Section\s+"apps"/);
  assert.match(masthead, /\$isApps[^\r\n]*aria-current="page"|aria-current="page"[^\r\n]*\$isApps/);
  assert.ok(appsCssMatch, "expected a bounded Apps & Tools CSS section");
  assert.match(appsCssMatch[1], /@media\s*\(max-width:640px\)/);
  assert.match(appsCssMatch[1], /:focus-visible/);
  assert.match(
    appsCssMatch[1],
    /\.apps-card__preview dt,[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;/,
    "scorecard labels must wrap inside their grid column instead of colliding with values"
  );
  assert.match(
    appsCssMatch[1],
    /\.apps-card__preview--dense dl > div\s*\{[\s\S]*?grid-template-columns:\s*minmax\(6\.4rem,\s*\.62fr\)\s+minmax\(0,\s*\.38fr\);/,
    "dense scorecards must allocate enough width to complete label words"
  );
  assert.match(
    appsCssMatch[1],
    /\.apps-card__preview--dense dt\s*\{[\s\S]*?font-size:\s*\.62rem;[\s\S]*?overflow-wrap:\s*normal;[\s\S]*?word-break:\s*normal;/,
    "dense scorecard labels must retain normal whole-word wrapping"
  );
  assert.match(
    appsCssMatch[1],
    /@media\s*\(max-width:640px\)[\s\S]*?\.apps-card__preview--dense dl > div\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
    "dense scorecard rows must stack on narrow screens"
  );
  assert.doesNotMatch(appsCssMatch[1], /(?:linear|radial|conic)-gradient\s*\(|@keyframes\b|\banimation(?:-name)?\s*:/i);
  assert.doesNotMatch(appsCssMatch[1], /@font-face\b|url\([^)]*\.(?:woff2?|ttf|otf)/i);

  for (const classFamily of [
    "apps-index", "apps-card", "apps-product", "apps-status", "apps-packet-preview", "apps-interpretation",
    "apps-snapshot", "apps-workflow", "apps-deliverables", "apps-samples", "apps-limitations",
    "apps-companion", "apps-identity",
  ]) {
    assert.match(appsMarkup, new RegExp(classFamily), `expected Apps markup family: ${classFamily}`);
    assert.match(css, new RegExp(`\\.${classFamily}`), `expected Apps CSS owner: ${classFamily}`);
    assert.match(layoutMatrix, new RegExp("`" + classFamily), `expected Apps layout owner: ${classFamily}`);
  }
  assert.match(layoutMatrix, /\| Apps & Tools index \| `\/apps\/`/);
  assert.match(layoutMatrix, /\| Bucks Machine product \| `\/apps\/bucks-machine\/`/);
  assert.match(layoutMatrix, /\| Baseball Upside Risk product \| `\/apps\/baseball-upside-risk\/`/);
  assert.match(webpageSchema, /\(and\s+\(eq\s+\$meta\.route\.name\s+"section-list"\)\s+\(not\s+\(in\s+\(slice\s+"apps"\s+"games"\)\s+\$page\.Section\)\)\)/);
});
