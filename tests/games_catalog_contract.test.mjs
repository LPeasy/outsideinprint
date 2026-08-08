import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath) => fs.readFileSync(path.resolve(relativePath), "utf8");

function frontMatterBoolean(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(true|false)\\s*$`, "m"));
  assert.ok(match, `expected ${key} front matter`);
  return match[1] === "true";
}

function productBlock(source, key, nextKey = null) {
  const start = source.indexOf(`  ${key}:`);
  assert.notEqual(start, -1, `expected Games data block: ${key}`);
  const end = nextKey ? source.indexOf(`  ${nextKey}:`, start + 1) : source.length;
  assert.ok(end > start, `expected complete Games data block: ${key}`);
  return source.slice(start, end);
}

function sha256(relativePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.resolve(relativePath))).digest("hex");
}

const requiredCommonPaths = [
  "content/games/_index.md",
  "content/games/idle-times/index.md",
  "content/games/idle-times/idle-times-main-capsule.png",
  "content/games/idle-times/idle-times-packaged-desk-1920x1080.png",
  "content/games/idle-times/idle-times-packaged-library-1920x1080.png",
  "data/games.yaml",
  "layouts/games/list.html",
  "layouts/games/single.html",
  "layouts/partials/games/product-data.html",
  "layouts/partials/games/resolve-media.html",
  "layouts/partials/games/action.html",
  "layouts/partials/schema/webpage.html",
  "layouts/partials/masthead.html",
  "layouts/partials/footer.html",
  "assets/css/main.css",
  "docs/games-catalog-contract.md",
  "docs/layout-ownership-matrix.md",
];

test("Games catalog uses the controlled LLC identity, route states, and asset set", () => {
  for (const relativePath of requiredCommonPaths) {
    assert.ok(fs.existsSync(path.resolve(relativePath)), `expected Games contract file: ${relativePath}`);
  }

  const gamesIndex = read("content/games/_index.md");
  const idlePage = read("content/games/idle-times/index.md");
  const data = read("data/games.yaml");
  const idle = productBlock(data, "idle_times");
  const isDraft = frontMatterBoolean(gamesIndex, "draft");

  assert.equal(isDraft, false, "bounded Idle Times release source must be public");
  assert.equal(frontMatterBoolean(idlePage, "draft"), isDraft, "Games index and Idle Times must move through lifecycle states together");
  assert.equal(frontMatterBoolean(gamesIndex, "noindex"), isDraft, "draft Games index must be noindex; public candidate must be indexable");
  assert.equal(frontMatterBoolean(idlePage, "noindex"), isDraft, "draft Idle page must be noindex; public candidate must be indexable");
  assert.match(idlePage, /^build:\s*\r?\n\s+publishResources:\s*false\s*$/ms);

  assert.match(data, /^\s+operator_legal_name:\s*"Outside In Print LLC"\s*$/m);
  assert.match(data, /^\s+support_email:\s*"support@outsideinprint\.org"\s*$/m);
  assert.match(data, /^\s+storefront_hosts:\s*\r?\n\s+-\s+"store\.steampowered\.com"\s*$/m);
  assert.match(data, /^\s+order:\s*\r?\n\s+-\s+"idle_times"\s*\r?\n\s*\r?\ngames:/m);
  const gamesSection = data.split(/^games:\s*$/m)[1];
  assert.ok(gamesSection, "expected Games records section");
  const gameKeys = [...gamesSection.matchAll(/^  ([a-z0-9_]+):\s*$/gm)].map((match) => match[1]);
  assert.deepEqual(gameKeys, ["idle_times"], "bounded release must contain only the Idle Times record");

  for (const [title, block] of [["Idle Times", idle]]) {
    for (const field of [
      "slug", "title", "category", "platform", "status", "availability", "release_date_state",
      "release_date_display", "catalog_summary", "catalog_note",
      "operator_legal_name", "operator_line", "support_email", "support_line", "support_route_state",
      "privacy_route_state", "action_state", "media_state",
    ]) {
      assert.match(block, new RegExp(`^\\s+${field}:`, "m"), `${title} must define ${field}`);
    }
    assert.match(block, /^\s+operator_legal_name:\s*"Outside In Print LLC"\s*$/m);
    assert.match(block, /^\s+support_email:\s*"support@outsideinprint\.org"\s*$/m);
    assert.match(block, new RegExp(`${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, a game operated and supported by Outside In Print LLC\\.`));
    assert.match(block, new RegExp(`Support for ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is provided by Outside In Print LLC: support@outsideinprint\\.org\\.`));
  }

  for (const field of ["summary", "audience", "features_heading", "features_intro", "notices_heading", "facts", "features", "notices"]) {
    assert.match(idle, new RegExp(`^\\s+${field}:`, "m"), `Idle Times must define page field ${field}`);
  }
  assert.match(idle, /^\s+action_state:\s*"external_wishlist"\s*$/m);
  assert.match(idle, /^\s+action_url:\s*"https:\/\/store\.steampowered\.com\/app\/4978200\/Idle_Times\/"\s*$/m);
  assert.doesNotMatch(idle, /[?#](?:utm_|[^"\s]*)/i);
  assert.match(idle, /Coming to Steam August 25, 2026\./);
  assert.match(idle, /Full Desk, Mini Companion, and Pet Desk/);
  assert.match(idle, /78 illustrated rewards/);
  assert.match(idle, /Seven bundled tracks/);
  assert.match(idle, /fixed, pre-generated AI-assisted visual art/);
  assert.match(idle, /No live AI/);
  assert.doesNotMatch(idle, /seller|payee|tax party|bank identity/i);
  assert.doesNotMatch(idle, /seven original tracks|available now|[$€£]\s*\d|\$\d/i);

  const expectedHashes = new Map([
    ["content/games/idle-times/idle-times-main-capsule.png", "5797e830c285688a3e5f6840fd189d8281ad31320af2388074fb3016ee853109"],
    ["content/games/idle-times/idle-times-packaged-desk-1920x1080.png", "0d5c4e1d01f10f4e8d070db2ce555c55d66655f1ecfd66df4adbfd38eef7b339"],
    ["content/games/idle-times/idle-times-packaged-library-1920x1080.png", "0eac2dd310f4a6365666f1662b814ad28d6b8ee3e3558ddf3947fd1658a7b954"],
  ]);
  for (const [relativePath, expectedHash] of expectedHashes) {
    assert.equal(sha256(relativePath), expectedHash, `unexpected approved asset bytes: ${relativePath}`);
  }

  const gamesContent = fs.readdirSync(path.resolve("content/games"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.relative(path.resolve("content/games"), path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(gamesContent, ["_index.md", "idle-times/index.md"], "bounded release must contain only Games index and Idle Times content");
});

test("Games templates fail closed and keep the catalog non-commercial", () => {
  const listTemplate = read("layouts/games/list.html");
  const singleTemplate = read("layouts/games/single.html");
  const productData = read("layouts/partials/games/product-data.html");
  const resolveMedia = read("layouts/partials/games/resolve-media.html");
  const action = read("layouts/partials/games/action.html");
  const masthead = read("layouts/partials/masthead.html");
  const footer = read("layouts/partials/footer.html");
  const schema = read("layouts/partials/schema/webpage.html");
  const css = read("assets/css/main.css");
  const matrix = read("docs/layout-ownership-matrix.md");
  const markup = `${listTemplate}\n${singleTemplate}`;

  assert.match(listTemplate, /hugo\.Data\.games/);
  assert.match(listTemplate, /partial "games\/product-data\.html"/);
  assert.equal((listTemplate.match(/<h1\b/g) || []).length, 1);
  assert.match(singleTemplate, /partial "games\/product-data\.html"/);
  assert.match(singleTemplate, /partial "games\/resolve-media\.html"/);
  assert.match(singleTemplate, /partial "games\/action\.html"/);
  assert.equal((singleTemplate.match(/<h1\b/g) || []).length, 1);

  for (const state of ["disabled", "browser_play", "external_wishlist", "external_purchase"]) {
    assert.match(productData, new RegExp(`"${state}"`), `expected controlled action state ${state}`);
  }
  assert.match(productData, /storefront_hosts/);
  assert.match(productData, /urls\.Parse/);
  assert.match(productData, /RawQuery/);
  assert.match(productData, /Fragment/);
  assert.match(productData, /Outside In Print LLC/);
  assert.match(productData, /support@outsideinprint\.org/);
  assert.match(productData, /errorf/);
  assert.match(resolveMedia, /approval_scope/);
  assert.match(resolveMedia, /local_draft/);
  assert.match(resolveMedia, /Resources\.GetMatch/);
  assert.match(resolveMedia, /resources\.Get/);
  assert.match(action, /rel="external noopener"/);
  assert.doesNotMatch(action, /<form\b|<input\b|checkout|waitlist|price/i);

  for (const chrome of [masthead, footer]) {
    assert.match(chrome, /site\.GetPage "\/games"/);
    assert.match(chrome, /\$showGames := and \$gamesPage \(or \(not \$gamesPage\.Draft\) hugo\.IsServer\)/);
    assert.match(chrome, />Games</);
  }
  assert.match(masthead, /\$isGames := eq \.Section "games"/);
  assert.match(masthead, />Library<[\s\S]*?>Apps &amp; Tools<[\s\S]*?>Games<[\s\S]*?>Bookstore</);
  assert.match(schema, /\(slice "apps" "games"\)/, "Games index must remain generic WebPage metadata");

  for (const family of ["games-index", "games-card", "games-product", "games-facts", "games-features", "games-gallery", "games-notices", "games-requirements"]) {
    assert.match(markup, new RegExp(family), `expected Games markup family ${family}`);
    assert.match(css, new RegExp(`\\.${family}`), `expected Games CSS owner ${family}`);
    assert.match(matrix, new RegExp("`" + family), `expected Games matrix owner ${family}`);
  }
  const gamesCss = css.match(/\/\* Games catalog and product briefs \*\/([\s\S]*?)(?=\r?\n@media print)/);
  assert.ok(gamesCss, "expected bounded Games CSS section");
  assert.match(gamesCss[1], /@media\s*\(max-width:640px\)/);
  assert.match(gamesCss[1], /:focus-visible/);
  assert.doesNotMatch(gamesCss[1], /(?:linear|radial|conic)-gradient\s*\(|@keyframes\b|\banimation(?:-name)?\s*:/i);
  assert.doesNotMatch(gamesCss[1], /@font-face\b|url\([^)]*\.(?:woff2?|ttf|otf)/i);

  assert.doesNotMatch(`${read("data/games.yaml")}\n${markup}`, /Outside In Games/);
  assert.doesNotMatch(markup, /VideoGame|SoftwareApplication|"@type"\s*:\s*"(?:Product|Offer)"/i);
  assert.doesNotMatch(markup, /<form\b|<input\b|<select\b|<textarea\b|stripe|checkout|waitlist/i);
  assert.doesNotMatch(markup, /<video\b|\.(?:webm|mp4)(?:["'?#\s]|$)/i);
});
