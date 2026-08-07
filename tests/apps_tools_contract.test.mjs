import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const requiredPaths = [
  "content/apps/_index.md",
  "content/apps/bucks-machine/index.md",
  "content/apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.pdf",
  "content/apps/bucks-machine/bucks-machine-synthetic-professional-services-demo.xlsx",
  "data/apps.yaml",
  "layouts/apps/list.html",
  "layouts/apps/single.html",
  "layouts/partials/apps/product-data.html",
  "layouts/partials/apps/actions.html",
  "layouts/partials/apps/sample-downloads.html",
];

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

test("Apps & Tools draft keeps the Bucks Machine identity and release boundary", () => {
  for (const relativePath of requiredPaths) {
    assert.ok(fs.existsSync(path.resolve(relativePath)), `expected Apps contract file: ${relativePath}`);
  }

  const appsIndex = read("content/apps/_index.md");
  const bucksPage = read("content/apps/bucks-machine/index.md");
  const appsData = read("data/apps.yaml");
  const appsSurface = `${appsIndex}\n${bucksPage}\n${appsData}`;

  for (const source of [appsIndex, bucksPage]) {
    assert.match(source, /^draft:\s*true\s*$/m);
    assert.match(source, /^noindex:\s*true\s*$/m);
  }
  assert.match(bucksPage, /^build:\s*\r?\n\s+publishResources:\s*false\s*$/ms);

  for (const key of [
    "slug",
    "title",
    "status",
    "availability",
    "promise",
    "audience",
    "workflow",
    "deliverables",
    "limitations",
    "privacy_warning",
    "operator_legal_name",
    "seller_legal_name",
    "operator_line",
    "support_email",
    "support_line",
    "commercial_action_state",
    "sample_downloads_state",
    "sample_downloads",
  ]) {
    assert.match(appsData, new RegExp(`^\\s+${key}:`, "m"), `expected Apps data field: ${key}`);
  }

  assert.match(appsData, /^\s+operator_legal_name:\s*["']?Outside In Print LLC["']?\s*$/m);
  assert.match(appsData, /^\s+seller_legal_name:\s*["']?Outside In Print LLC["']?\s*$/m);
  assert.match(
    appsData,
    /^\s+operator_line:\s*["']?Bucks Machine, a product operated and sold by Outside In Print LLC\.["']?\s*$/m
  );
  assert.match(appsData, /^\s+support_email:\s*["']?support@outsideinprint\.org["']?\s*$/m);
  assert.match(
    appsData,
    /^\s+support_line:\s*["']?Support for Bucks Machine is provided by Outside In Print LLC: support@outsideinprint\.org\.["']?\s*$/m
  );
  assert.match(appsData, /^\s+commercial_action_state:\s*["']?disabled["']?\s*$/m);
  assert.match(appsData, /^\s+sample_downloads_state:\s*["']?local_draft["']?\s*$/m);
  assert.match(appsData, /Not currently available for use or purchase\./);
  assert.match(
    appsData,
    /Turn de-identified rough project notes into a human-reviewed scope, schedule, budget, risk, PDF, and workbook planning packet\./
  );
  assert.match(appsData, /bucks-machine-synthetic-professional-services-demo\.pdf/);
  assert.match(appsData, /bucks-machine-synthetic-professional-services-demo\.xlsx/);

  for (const forbidden of [
    /Kure Beach/i,
    /Freeport/i,
    /USACE/i,
    /SoftwareApplication/i,
    /"@type"\s*:\s*"(?:Product|Offer)"/i,
    /available now/i,
    /<form\b/i,
    /stripe/i,
    /checkout/i,
    /waitlist/i,
  ]) {
    assert.doesNotMatch(appsSurface, forbidden);
  }
});

test("Apps templates enforce local-only samples and inert commercial actions", () => {
  const listTemplate = read("layouts/apps/list.html");
  const singleTemplate = read("layouts/apps/single.html");
  const productData = read("layouts/partials/apps/product-data.html");
  const actions = read("layouts/partials/apps/actions.html");
  const sampleDownloads = read("layouts/partials/apps/sample-downloads.html");
  const templates = `${listTemplate}\n${singleTemplate}\n${productData}\n${actions}\n${sampleDownloads}`;

  assert.match(listTemplate, /partial\s+"apps\/product-data\.html"/);
  assert.match(singleTemplate, /partial\s+"apps\/product-data\.html"/);
  assert.match(singleTemplate, /partial\s+"apps\/actions\.html"/);
  assert.match(singleTemplate, /partial\s+"apps\/sample-downloads\.html"/);
  assert.equal((listTemplate.match(/<h1\b/g) || []).length, 1);
  assert.equal((singleTemplate.match(/<h1\b/g) || []).length, 1);

  assert.match(productData, /Outside In Print LLC/);
  assert.match(productData, /operator_legal_name/);
  assert.match(productData, /seller_legal_name/);
  assert.match(productData, /operator_line/);
  assert.match(productData, /support_email/);
  assert.match(productData, /support_line/);
  assert.match(productData, /errorf/);
  assert.match(singleTemplate, /href="mailto:\{\{ index \$product "support_email" \}\}"/);
  assert.match(singleTemplate, /Support for \{\{ index \$product "title" \}\} is provided by \{\{ index \$product "operator_legal_name" \}\}/);

  assert.match(sampleDownloads, /hugo\.IsServer/);
  assert.match(sampleDownloads, /\.Draft/);
  assert.match(sampleDownloads, /local_draft/);
  assert.match(sampleDownloads, /Resources\.GetMatch/);
  assert.match(sampleDownloads, /\.RelPermalink/);
  assert.doesNotMatch(actions, /<a\b|<form\b|mailto:|stripe|checkout|price|waitlist/i);
  assert.doesNotMatch(templates, /SoftwareApplication|"@type"\s*:\s*"(?:Product|Offer)"/i);
});

test("Apps navigation and styling remain local and route-owned", () => {
  const masthead = read("layouts/partials/masthead.html");
  const footer = read("layouts/partials/footer.html");
  const listTemplate = read("layouts/apps/list.html");
  const singleTemplate = read("layouts/apps/single.html");
  const sampleDownloads = read("layouts/partials/apps/sample-downloads.html");
  const css = read("assets/css/main.css");
  const layoutMatrix = read("docs/layout-ownership-matrix.md");
  const appsMarkup = `${listTemplate}\n${singleTemplate}\n${sampleDownloads}`;
  const appsCssMatch = css.match(/\/\* Apps & Tools local draft \*\/([\s\S]*?)(?=\r?\n@media print)/);

  for (const chrome of [masthead, footer]) {
    assert.match(chrome, /site\.GetPage\s+"\/apps"/);
    assert.match(chrome, /and\s+hugo\.IsServer\s+\$appsDraft/);
    assert.match(chrome, />Apps\s*&amp;\s*Tools</);
  }
  assert.match(masthead, /\$isApps\s*:=\s*eq\s+\.Section\s+"apps"/);
  assert.match(masthead, /\$isApps[^\r\n]*aria-current="page"|aria-current="page"[^\r\n]*\$isApps/);
  assert.ok(appsCssMatch, "expected a bounded Apps & Tools CSS section");
  assert.match(appsCssMatch[1], /@media\s*\(max-width:640px\)/);
  assert.match(appsCssMatch[1], /:focus-visible/);
  assert.doesNotMatch(appsCssMatch[1], /(?:linear|radial|conic)-gradient\s*\(|@keyframes\b|\banimation(?:-name)?\s*:/i);
  assert.doesNotMatch(appsCssMatch[1], /@font-face\b|url\([^)]*\.(?:woff2?|ttf|otf)/i);

  for (const classFamily of [
    "apps-index",
    "apps-card",
    "apps-product",
    "apps-status",
    "apps-packet-preview",
    "apps-workflow",
    "apps-deliverables",
    "apps-samples",
    "apps-limitations",
    "apps-identity",
  ]) {
    assert.match(appsMarkup, new RegExp(classFamily), `expected Apps markup family: ${classFamily}`);
    assert.match(css, new RegExp(`\\.${classFamily}`), `expected Apps CSS owner: ${classFamily}`);
    assert.match(layoutMatrix, new RegExp("`" + classFamily), `expected Apps layout owner: ${classFamily}`);
  }
  assert.match(layoutMatrix, /\| Apps & Tools index \| `\/apps\/`/);
  assert.match(layoutMatrix, /\| Bucks Machine product \| `\/apps\/bucks-machine\/`/);
});
