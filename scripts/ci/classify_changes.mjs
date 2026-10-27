import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { verifyQueuedRelease } from "./disney_release_schedule.mjs";
import { assertScheduleWorkflow, selectScheduledReleases, syncScheduleBlock, validateRegistry, verifyScheduledRelease } from "./scheduled_releases.mjs";

const browserFamilies = ["browser_navigation", "browser_bob", "browser_analytics", "browser_share"];
const empty = () => ({ site: false, browser: false, ...Object.fromEntries(browserFamilies.map(key => [key, false])), images: false, publishing: false, rendering: false, windows: false, worker: false, worker_commerce: false, worker_bob: false, worker_welcome: false, worker_meta_leads: false, seo: false, full: false });
const full = () => Object.fromEntries(Object.keys(empty()).map(key => [key, true]));
const browsers = (selected, families = browserFamilies) => { for (const family of families) selected[family] = true; selected.browser = true; };

// Exact entries only: adding an unfamiliar test must not silently exempt it.
// These contracts run unconditionally in the site job (source or fresh output).
const siteTests = new Set([
  "all.test.mjs", "article_form_grammar_contract.test.mjs", "almanack_attribution.test.mjs", "article_mobile_layout.test.mjs",
  "affirmation_bank_surface.test.mjs", "apps_tools_contract.test.mjs", "affirmation_type_surfaces.test.mjs",
  "collection_room_themes_contract.test.mjs", "entry_threads_contract.test.mjs", "featured_continuation_contract.test.mjs",
  "games_catalog_contract.test.mjs", "homepage_selected.test.mjs", "companion_bob_visit.test.mjs", "route_widget_lifecycle.test.mjs",
  "home_featured_image.test.mjs", "layout_ownership_contract.test.mjs", "oip_commerce_provisioning_order.test.mjs",
  "paper_route_contract.test.mjs", "paper_route_rules.test.mjs", "piece_share.test.mjs", "responsive_image_contract.test.mjs",
  "rcp85_audit_appendix_contract.test.mjs", "release_a_metadata_contract.test.mjs", "release_b_discovery_contract.test.mjs",
  "reader_refinements_contract.test.mjs", "article_contents.test.mjs", "reader_actions_output.test.mjs", "contributor_pitch.test.mjs",
  "library_browse.test.mjs", "bookstore_ebook_labels.test.mjs", "epub_checkout_client.test.mjs", "ga4_purchase_context.test.mjs",
  "collection_reading_path_contract.test.mjs", "collection_continuation_assignments.test.mjs", "seo_route_schema_contract.test.mjs",
  "site_chrome_contract.test.mjs", "web_publishing_direction.test.mjs", "homepage_output.test.mjs", "point7_ux_output.test.mjs",
  "reader_refinements_output.test.mjs", "release_a_metadata_output.test.mjs",
  "test_responsive_image_source_contract.ps1", "test_responsive_image_output_contract.ps1", "test_bookstore_reading_sample_contract.ps1",
  "test_2045_storefront.ps1", "test_direct_commerce_storefront_contract.ps1", "test_schema_template_contract.ps1",
  "test_author_directory_contract.ps1", "test_contributor_header_contract.ps1", "test_apps_tools_contract.ps1",
  "test_indexation_policy_contract.ps1", "test_discovery_surface_contract.ps1", "test_feed_policy_contract.ps1",
  "test_almanack_module_data.ps1", "test_legacy_render_contract.ps1", "test_imported_content_media.ps1",
  "test_collection_organization_contract.ps1", "test_public_route_smoke.ps1", "test_public_html_output.ps1", "test_games_catalog_contract.ps1",
]);
const testFamilies = new Map([
  ["mobile_navigation_browser.test.mjs", ["browser_navigation"]], ["bob_reading_browser.test.mjs", ["browser_bob"]],
  ["hosted_analytics_browser.test.mjs", ["browser_analytics"]], ["piece_share_browser.test.mjs", ["browser_share"]],
  ["homepage_selection_behavior.test.mjs", ["rendering"]], ["gallery_reading_behavior.test.mjs", ["rendering"]],
  ["collection_reading_path_behavior.test.mjs", ["rendering"]], ["test_bob_catalog_contract.ps1", ["rendering"]],
  ["test_hugo_upgrade_contract.ps1", ["rendering"]], ["test_seo_rollout_contract.ps1", ["seo"]],
  ["test_essay_guardrails.ps1", ["publishing", "windows"]], ["test_essay_image_audit.ps1", ["publishing", "windows"]],
  ["test_affirmation_contract.ps1", ["publishing", "windows"]], ["test_almanack_buttondown_numbering.ps1", ["publishing", "windows"]],
  ["test_editorial_cartoon_schedule_contract.ps1", ["publishing"]],
  ["test_managed_image_registration.ps1", ["images", "windows"]], ["test_focused_image_review_promotion.ps1", ["images", "windows"]],
  ["test_focused_legacy_image_migration.ps1", ["images"]], ["responsive_image_cache_behavior.test.mjs", ["images"]],
  ["test_image_signatures.ps1", ["images"]],
  // The classify job always runs schedule structure, source-binding and receipt fixtures.
  ["disney_release_schedule.test.mjs", []], ["scheduled_releases.test.mjs", []],
  ["test_disney_release_verification.py", []], ["test_scheduled_release_verification.py", []],
]);

export function classifyPaths(paths, { renderingDefaultsChanged = false, scheduleWorkflowOnlyChanged = false } = {}) {
  const selected = empty();
  for (const path of paths) {
    const worker = /^workers\/oip-(commerce|bob|welcome|meta-leads)\//.exec(path);
    if (worker) { selected.worker = selected["worker_" + worker[1].replaceAll("-", "_")] = true; continue; }
    if (/^(docs\/(?!editorial-audits\/)|README\.md$|AGENTS\.md$|CODEX_WORKFLOW\.md$|LICENSE)/.test(path)) continue;
    selected.site = true;
    if (path === "scripts/ci/scheduled-releases.json" || (path === ".github/workflows/deploy.yml" && scheduleWorkflowOnlyChanged)) continue;
    if (path === "data/image-assets.json" || path.startsWith("assets/images/originals/")) continue;
    if (["data/image-signatures.json", "data/image-signature-compatibility.json"].includes(path) || path.startsWith("assets/images/signatures/")) {
      selected.images = selected.rendering = true; browsers(selected); continue;
    }
    if (path.startsWith("content/")) {
      if (path.startsWith("content/shop/")) browsers(selected, ["browser_analytics", "browser_share"]);
      else if (/^content\/(apps|games|studio)\//.test(path)) browsers(selected);
      if (/^content\/(about|authors)\//.test(path)) selected.seo = true;
      continue;
    }
    if (path.startsWith("docs/editorial-audits/")) continue;
    if (path.startsWith("editorial/")) { selected.publishing = true; continue; }
    if (path.startsWith("data/")) {
      // Bookstore offers feed analytics and sample sharing, not Bob or navigation fixtures.
      browsers(selected, path === "data/bookstore.yaml" ? ["browser_analytics", "browser_share"] : browserFamilies);
      if (/^data\/(authors|organization|collections)\.yaml$/.test(path)) selected.seo = true;
      continue;
    }
    if (/^(layouts\/|assets\/(?!images\/)|static\/)/.test(path)) {
      browsers(selected);
      selected.rendering = true;
      if (/images|render-image|metadata_image/.test(path)) selected.images = true;
      if (/schema|opengraph|twitter|robots|sitemap|head|feed|rss|metadata|partials\/(authors|collections)\//.test(path)) selected.seo = true;
      continue;
    }
    if (/^scripts\/(lib\/image_asset|.*(?:image|png|jpeg|webp|avif))/.test(path)) {
      selected.images = selected.windows = true; browsers(selected); continue;
    }
    if (path.startsWith("scripts/") && !path.startsWith("scripts/ci/")) {
      selected.publishing = true;
      if (path.endsWith(".ps1")) selected.windows = true;
      if (/seo|search_console|indexnow|metadata/.test(path)) selected.seo = true;
      continue;
    }
    if (path.startsWith("tests/")) {
      if (/^tests\/(ci_|release_gate|image_cache|verify_deployment|classify_changes|browser_environment\.test\.mjs$)/.test(path)) { Object.assign(selected, full(), { full: false }); continue; }
      const name = path.slice("tests/".length);
      if (siteTests.has(name)) continue;
      if (testFamilies.has(name)) {
        for (const family of testFamilies.get(name)) selected[family] = true;
        selected.browser ||= browserFamilies.some(family => selected[family]);
        continue;
      }
      if (/^test_almanack[^/]*\.py$/.test(name)) { selected.publishing = true; continue; }
      if (/^helpers\/(?:responsive_image_(?:common|recipe)|image_signatures)\.ps1$/.test(name)) { selected.images = selected.windows = true; continue; }
      return full();
    }
    // Known system dependencies get full PR validation without repeating it
    // after the protected merge. Unknown paths remain full on every event.
    if (/^(\.github\/|scripts\/ci\/|tools\/|package(?:-lock)?\.json$|hugo.*\.toml$|\.gitattributes$|\.gitignore$|\.nvmrc$)/.test(path)) { Object.assign(selected, full(), { full: false }); continue; }
    return full();
  }
  if (renderingDefaultsChanged) {
    selected.site = selected.images = selected.windows = true; browsers(selected);
  }
  return selected;
}

export function selectChecks({ event, paths = [], fullChecks = true, protectedMain = false, weekly = false, uncertain = false, ...pathOptions }) {
  if (uncertain || !["pull_request", "push", "schedule", "workflow_dispatch"].includes(event)) return full();
  if ((event === "workflow_dispatch" && fullChecks) || weekly || (event === "push" && !protectedMain)) return full();
  const selected = classifyPaths(paths, pathOptions);
  if (selected.full) return selected;
  if (event !== "pull_request") {
    // Main has already passed required PR fixtures; every publication still
    // checks actual source data and freshly generated production output.
    return { ...empty(), site: true, seo: selected.seo };
  }
  return selected;
}

export function isGeneratedScheduleOnlyChange(before, after, beforeOptions, afterOptions) {
  // Validate both generated blocks before ignoring them. Exact outside-block
  // equality forbids an unrelated job, permission, trigger or condition edit.
  assertScheduleWorkflow(before, beforeOptions);
  assertScheduleWorkflow(after, afterOptions);
  const noReleases = { registry: { schemaVersion: 1, releases: [] }, disneyPlan: { releases: [] } };
  return syncScheduleBlock(before, noReleases) === syncScheduleBlock(after, noReleases);
}

function changedPaths(event) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const base = process.env.OIP_BASE_SHA;
  const head = process.env.OIP_HEAD_SHA;
  if (!/^[a-f0-9]{40}$/.test(base ?? "") || !/^[a-f0-9]{40}$/.test(head ?? "")) throw new Error("Missing Git comparison base/head.");
  git("cat-file", "-e", base + "^{commit}");
  git("cat-file", "-e", head + "^{commit}");
  const comparisonBase = event === "pull_request" ? git("merge-base", base, head).trim() : base;
  const paths = git("diff", "--no-renames", "--name-only", "-z", comparisonBase, head).split("\0").filter(Boolean);
  let renderingDefaultsChanged = false;
  if (paths.includes("data/image-assets.json")) {
    const before = JSON.parse(git("show", comparisonBase + ":data/image-assets.json"));
    const after = JSON.parse(git("show", head + ":data/image-assets.json"));
    renderingDefaultsChanged = JSON.stringify(before.defaults) !== JSON.stringify(after.defaults);
  }
  let scheduleWorkflowOnlyChanged = false;
  if (paths.includes(".github/workflows/deploy.yml")) {
    const scheduleOptions = ref => ({
      registry: validateRegistry(JSON.parse(git("show", ref + ":scripts/ci/scheduled-releases.json"))),
      disneyPlan: JSON.parse(git("show", ref + ":scripts/ci/disney-releases.json")),
    });
    scheduleWorkflowOnlyChanged = isGeneratedScheduleOnlyChange(
      git("show", comparisonBase + ":.github/workflows/deploy.yml"), git("show", head + ":.github/workflows/deploy.yml"),
      scheduleOptions(comparisonBase), scheduleOptions(head),
    );
  }
  return { paths, renderingDefaultsChanged, scheduleWorkflowOnlyChanged, base: comparisonBase };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = process.env.GITHUB_EVENT_NAME;
  let comparison = { paths: [], base: "" };
  let uncertain = false;
  if (["pull_request", "push"].includes(event)) {
    try { comparison = changedPaths(event); }
    catch (error) { uncertain = true; console.warn("Selecting full checks: " + error.message); }
  } else {
    try { comparison.base = execFileSync("git", ["rev-parse", "HEAD^"], { encoding: "utf8" }).trim(); }
    catch { uncertain = true; }
  }
  const clock = new Date().toISOString();
  const timed = selectScheduledReleases(event === "schedule" ? process.env.OIP_SCHEDULE : "", clock);
  if (timed.disney.length > 1) throw new Error("Legacy Disney release windows overlap.");
  for (const release of timed.disney) verifyQueuedRelease(release);
  for (const release of timed.generic) await verifyScheduledRelease(release);
  const selected = timed.timed && !timed.disney.length && !timed.generic.length ? empty() : selectChecks({
    event, ...comparison, uncertain,
    fullChecks: process.env.OIP_FULL_CHECKS !== "false",
    protectedMain: process.env.OIP_PROTECTED_MAIN === "true",
    weekly: process.env.OIP_SCHEDULE === "17 0 * * 1",
  });
  const needs = { classify: true, site: selected.site, windows: selected.windows, worker: selected.worker };
  const outputs = { ...selected, clock, release_slug: timed.disney[0]?.slug ?? "", release_ids: JSON.stringify(timed.generic.map(release => release.id)), base: comparison.base, selection: JSON.stringify(needs) };
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => key + "=" + value).join("\n") + "\n");
  console.log(JSON.stringify({ changedPaths: comparison.paths, selected, buildClockUtc: clock }, null, 2));
}
