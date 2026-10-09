import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const empty = () => ({ site: false, browser: false, images: false, publishing: false, rendering: false, windows: false, worker: false, seo: false, full: false });
const full = () => Object.fromEntries(Object.keys(empty()).map(key => [key, true]));
export function classifyPaths(paths, { renderingDefaultsChanged = false } = {}) {
  const selected = empty();
  for (const path of paths) {
    if (path.startsWith("workers/oip-commerce/")) { selected.worker = true; continue; }
    if (/^(docs\/(?!editorial-audits\/)|README\.md$|AGENTS\.md$|CODEX_WORKFLOW\.md$|LICENSE)/.test(path)) continue;
    selected.site = true;
    if (path === "data/image-assets.json" || path.startsWith("assets/images/originals/")) continue;
    if (path.startsWith("content/")) {
      if (/^content\/(apps|games|shop|studio)\//.test(path)) selected.browser = true;
      if (/^content\/(about|authors)\//.test(path)) selected.seo = true;
      continue;
    }
    if (path.startsWith("docs/editorial-audits/")) continue;
    if (path.startsWith("editorial/")) { selected.publishing = true; continue; }
    if (path.startsWith("data/")) {
      selected.browser = true;
      if (/^data\/(authors|organization|collections)\.yaml$/.test(path)) selected.seo = true;
      continue;
    }
    if (/^(layouts\/|assets\/(?!images\/)|static\/)/.test(path)) {
      selected.browser = true;
      selected.rendering = true;
      if (/images|render-image|metadata_image/.test(path)) selected.images = true;
      if (/schema|opengraph|twitter|robots|sitemap|head|feed|rss|metadata|partials\/(authors|collections)\//.test(path)) selected.seo = true;
      continue;
    }
    if (/^scripts\/(lib\/image_asset|.*(?:image|png|jpeg|webp|avif))/.test(path)) {
      selected.images = selected.windows = selected.browser = true; continue;
    }
    if (path.startsWith("scripts/") && !path.startsWith("scripts/ci/")) {
      selected.publishing = true;
      if (path.endsWith(".ps1")) selected.windows = true;
      if (/seo|search_console|indexnow|metadata/.test(path)) selected.seo = true;
      continue;
    }
    if (path.startsWith("tests/")) {
      if (/^tests\/(ci_|release_gate|image_cache|verify_deployment|classify_changes)/.test(path)) { Object.assign(selected, full(), { full: false }); continue; }
      if (/responsive_image|managed_image|focused.*image|helpers\/.*image/.test(path)) {
        selected.images = selected.windows = true; continue;
      }
      if (/browser|helpers\//.test(path)) selected.browser = true;
      if (/^tests\/test_(essay_guardrails|essay_image_audit|affirmation_contract|almanack_buttondown_numbering)\.ps1$/.test(path)) selected.windows = true;
      if (/seo|search_console|indexnow|metadata/.test(path)) selected.seo = true;
      selected.publishing = selected.rendering = true;
      continue;
    }
    // Known system dependencies get full PR validation without repeating it
    // after the protected merge. Unknown paths remain full on every event.
    if (/^(\.github\/|scripts\/ci\/|tools\/|package(?:-lock)?\.json$|hugo.*\.toml$|\.gitattributes$|\.gitignore$|\.nvmrc$)/.test(path)) { Object.assign(selected, full(), { full: false }); continue; }
    return full();
  }
  if (renderingDefaultsChanged) {
    selected.site = selected.browser = selected.images = selected.windows = true;
  }
  return selected;
}

export function selectChecks({ event, paths = [], fullChecks = true, protectedMain = false, weekly = false, uncertain = false, renderingDefaultsChanged = false }) {
  if (uncertain || !["pull_request", "push", "schedule", "workflow_dispatch"].includes(event)) return full();
  if ((event === "workflow_dispatch" && fullChecks) || weekly || (event === "push" && !protectedMain)) return full();
  const selected = classifyPaths(paths, { renderingDefaultsChanged });
  if (selected.full) return selected;
  if (event !== "pull_request") {
    // Main has already passed required PR fixtures; every publication still
    // checks actual source data and freshly generated production output.
    return { ...empty(), site: true, seo: selected.seo };
  }
  return selected;
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
  return { paths, renderingDefaultsChanged, base: comparisonBase };
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
  const selected = selectChecks({
    event, ...comparison, uncertain,
    fullChecks: process.env.OIP_FULL_CHECKS !== "false",
    protectedMain: process.env.OIP_PROTECTED_MAIN === "true",
    weekly: process.env.OIP_SCHEDULE === "17 0 * * 1",
  });
  const clock = new Date().toISOString();
  const needs = { classify: true, site: selected.site, windows: selected.windows, worker: selected.worker };
  const outputs = { ...selected, clock, base: comparison.base, selection: JSON.stringify(needs) };
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => key + "=" + value).join("\n") + "\n");
  console.log(JSON.stringify({ changedPaths: comparison.paths, selected, buildClockUtc: clock }, null, 2));
}
