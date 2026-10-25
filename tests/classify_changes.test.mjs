import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classifyPaths, isGeneratedScheduleOnlyChange, selectChecks } from "../scripts/ci/classify_changes.mjs";
import { registry, syncScheduleBlock } from "../scripts/ci/scheduled_releases.mjs";

test("ordinary publications build without unrelated browser or fixture suites", () => {
  for (const path of ["content/essays/article.md", "content/essays/musings/new.md", "assets/images/originals/essays/new/hero.png", "data/image-assets.json"]) {
    const selected = classifyPaths([path]);
    assert.equal(selected.site, true, path);
    assert.equal(selected.browser, false, path);
    assert.equal(selected.images, false, path);
  }
  assert.equal(classifyPaths(["data/image-assets.json"], { renderingDefaultsChanged: true }).browser, true);
});
test("browser selection follows rendering, applications, storefronts and helpers", () => {
  for (const path of ["assets/js/piece-share.js", "layouts/partials/images/model.html", "content/apps/test.md", "content/shop/2045/index.md", "data/bookstore.yaml", "tests/mobile_navigation_browser.test.mjs", "tests/helpers/browser-fixture.mjs", "package-lock.json", "hugo.toml"]) {
    assert.equal(classifyPaths([path]).browser, true, path);
  }
  assert.equal(classifyPaths(["scripts/lib/image_asset_manifest.ps1"]).windows, true);
  assert.equal(classifyPaths(["scripts/check_essay_guardrails.ps1"]).publishing, true);
  assert.equal(classifyPaths(["tests/test_essay_guardrails.ps1"]).windows, true);
  assert.equal(classifyPaths(["tests/test_seo_rollout_contract.ps1"]).windows, false);
  for (const path of ["data/authors.yaml", "data/organization.yaml", "data/collections.yaml", "content/authors/lawton/index.md", "content/about/index.md", "layouts/partials/collections/resolve-page-collections.html", "tests/test_seo_rollout_contract.ps1"]) {
    assert.equal(selectChecks({ event: "push", paths: [path], protectedMain: true }).seo, true, path);
  }
});
test("workers and documentation do not need Hugo; mixed changes preserve all selected work", () => {
  assert.equal(classifyPaths(["workers/oip-commerce/src/index.mjs"]).site, false);
  assert.equal(classifyPaths(["workers/oip-commerce/test/commerce.test.mjs"]).worker, true);
  assert.equal(classifyPaths(["workers/oip-bob/src/index.js"]).site, false);
  assert.equal(classifyPaths(["workers/oip-bob/test/budget.test.mjs"]).worker, true);
  assert.equal(classifyPaths(["docs/publishing-workflow.md", "README.md"]).site, false);
  const mixed = classifyPaths(["workers/oip-commerce/src/index.mjs", "content/essays/new.md"]);
  assert.equal(mixed.site && mixed.worker, true);
  assert.equal(mixed.worker_commerce, true);
  assert.equal(mixed.worker_bob, false);
  const bob = classifyPaths(["workers/oip-bob/src/index.js"]);
  assert.equal(bob.worker_bob, true);
  assert.equal(bob.worker_commerce, false);
});

test("the six-path ISBN update keeps site, schedule, sharing, analytics and commerce checks only", () => {
  const selected = classifyPaths([
    "content/shop/fifty-years-of-magic/_index.md", "data/bookstore.yaml", "scripts/ci/scheduled-releases.json",
    "tests/bookstore_ebook_labels.test.mjs", "tests/test_direct_commerce_storefront_contract.ps1", "workers/oip-commerce/src/catalog.js",
  ]);
  for (const key of ["site", "browser", "browser_analytics", "browser_share", "worker", "worker_commerce"]) assert.equal(selected[key], true, key);
  for (const key of ["browser_navigation", "browser_bob", "worker_bob", "images", "windows", "publishing", "rendering", "full"]) assert.equal(selected[key], false, key);
  const registryOnly = classifyPaths(["scripts/ci/scheduled-releases.json"]);
  assert.deepEqual(Object.entries(registryOnly).filter(([, selected]) => selected).map(([key]) => key), ["site"]);
  for (const path of ["scripts/ci/scheduled_releases.mjs", "scripts/ci/disney-releases.json", "scripts/ci/new-registry.json"]) {
    assert.equal(classifyPaths([path]).browser_bob, true, path);
  }
});

test("known tests select their owning suite and unfamiliar tests remain conservative", () => {
  for (const [path, family] of [
    ["tests/mobile_navigation_browser.test.mjs", "browser_navigation"], ["tests/bob_reading_browser.test.mjs", "browser_bob"],
    ["tests/hosted_analytics_browser.test.mjs", "browser_analytics"], ["tests/piece_share_browser.test.mjs", "browser_share"],
  ]) {
    const selected = classifyPaths([path]);
    assert.equal(selected.browser, true);
    assert.deepEqual(Object.entries(selected).filter(([key, value]) => key.startsWith("browser_") && value).map(([key]) => key), [family]);
    assert.equal(selected.publishing || selected.rendering || selected.worker, false);
  }
  assert.equal(classifyPaths(["tests/homepage_selection_behavior.test.mjs"]).rendering, true);
  assert.equal(classifyPaths(["tests/homepage_selection_behavior.test.mjs"]).publishing, false);
  assert.equal(classifyPaths(["tests/bookstore_ebook_labels.test.mjs"]).rendering, false);
  for (const path of ["tests/new-contract.test.mjs", "tests/helpers/new-helper.mjs", "data/new-metadata.yaml"]) {
    assert.equal(classifyPaths([path]).browser_bob, true, path);
  }
});

test("only matching generated schedule changes can skip system suites", () => {
  const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
  const changedRegistry = structuredClone(registry);
  changedRegistry.releases = [];
  const generated = syncScheduleBlock(workflow, { registry: changedRegistry });
  assert.equal(isGeneratedScheduleOnlyChange(workflow, generated, { registry }, { registry: changedRegistry }), true);
  const selected = classifyPaths([".github/workflows/deploy.yml", "scripts/ci/scheduled-releases.json"], { scheduleWorkflowOnlyChanged: true });
  assert.equal(selected.site, true);
  assert.equal(selected.browser || selected.worker || selected.publishing || selected.rendering, false);
  for (const edit of [
    generated.replace("contents: read", "contents: write"),
    generated.replace("timeout-minutes: 35", "timeout-minutes: 36"),
    generated.replace("node scripts/ci/release_gate.mjs", "echo skipped"),
  ]) assert.equal(isGeneratedScheduleOnlyChange(workflow, edit, { registry }, { registry: changedRegistry }), false);
  assert.throws(() => isGeneratedScheduleOnlyChange(workflow, generated, { registry }, { registry }));
  assert.throws(() => isGeneratedScheduleOnlyChange(workflow, generated.replace("# END GENERATED SCHEDULED RELEASES", "# missing"), { registry }, { registry: changedRegistry }));
  assert.throws(() => isGeneratedScheduleOnlyChange(workflow, generated + "\non: [invalid\n", { registry }, { registry: changedRegistry }));
});
test("deletions are classified by path and unknown dependencies fail conservatively", () => {
  assert.equal(classifyPaths(["assets/images/originals/removed.png"]).site, true);
  assert.ok(Object.values(classifyPaths(["unexpected-dependency.config"])).every(Boolean));
  assert.ok(Object.values(classifyPaths(["tests/browser_environment_future.test.mjs"])).every(Boolean));
  assert.ok(Object.values(selectChecks({ event: "pull_request", uncertain: true })).every(Boolean));
  assert.ok(Object.values(selectChecks({ event: "push", protectedMain: false })).every(Boolean));
});
test("production always rebuilds; full/manual and Monday cover every active suite", () => {
  const production = selectChecks({ event: "push", paths: ["layouts/index.html"], protectedMain: true });
  assert.equal(production.site, true);
  assert.equal(production.browser, false);
  assert.equal(production.publishing, false);
  for (const input of [{ event: "schedule", weekly: true }, { event: "workflow_dispatch", fullChecks: true }]) {
    assert.ok(Object.values(selectChecks(input)).every(Boolean));
  }
  assert.equal(selectChecks({ event: "workflow_dispatch", fullChecks: false }).site, true);
  assert.equal(selectChecks({ event: "schedule" }).browser, false);
});

test("unknown dependencies remain full when mixed with known system changes in either order", () => {
  for (const known of [".github/workflows/deploy.yml", "tests/ci_workflow.test.mjs", "tests/browser_environment.test.mjs", "scripts/ci/classify_changes.mjs", ".nvmrc"]) {
    const pullRequest = selectChecks({ event: "pull_request", paths: [known] });
    assert.equal(pullRequest.full, false, known);
    assert.ok(Object.entries(pullRequest).every(([key, enabled]) => key === "full" || enabled), known);
    assert.equal(selectChecks({ event: "push", paths: [known], protectedMain: true }).browser, false, known);
    for (const paths of [[known, "unexpected-dependency.config"], ["unexpected-dependency.config", known]]) {
      for (const event of ["push", "pull_request"]) {
        assert.ok(Object.values(selectChecks({ event, paths, protectedMain: true })).every(Boolean), paths.join(","));
      }
    }
  }
});

test("Git schedule comparison exempts only generated triggers and fails closed for deleted or malformed inputs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oip-schedule-classifier-"));
  const script = fileURLToPath(new URL("../scripts/ci/classify_changes.mjs", import.meta.url));
  const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
  const disneyPlan = JSON.parse(fs.readFileSync("scripts/ci/disney-releases.json", "utf8"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (relative, text) => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
    write(".github/workflows/deploy.yml", workflow);
    write("scripts/ci/scheduled-releases.json", JSON.stringify(registry));
    write("scripts/ci/disney-releases.json", JSON.stringify(disneyPlan));
    git("add", "."); git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    const updatedRegistry = { schemaVersion: 1, releases: [] };
    const updated = syncScheduleBlock(workflow, { registry: updatedRegistry, disneyPlan });
    const select = () => {
      git("add", "-A"); git("commit", "-qm", "change");
      const output = path.join(root, "outputs"); fs.writeFileSync(output, "");
      execFileSync(process.execPath, [script], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_OUTPUT: output, OIP_BASE_SHA: base, OIP_HEAD_SHA: git("rev-parse", "HEAD") } });
      const result = Object.fromEntries(fs.readFileSync(output, "utf8").trim().split("\n").map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
      fs.unlinkSync(output);
      return result;
    };
    write("scripts/ci/scheduled-releases.json", JSON.stringify(updatedRegistry));
    write(".github/workflows/deploy.yml", updated);
    assert.equal(select().browser, "false");
    write(".github/workflows/deploy.yml", updated.replace("contents: read", "contents: write"));
    assert.equal(select().browser, "true");
    write(".github/workflows/deploy.yml", updated);
    write("scripts/ci/scheduled-releases.json", "malformed");
    assert.equal(select().full, "true");
    write("scripts/ci/scheduled-releases.json", JSON.stringify(updatedRegistry));
    fs.unlinkSync(path.join(root, ".github/workflows/deploy.yml"));
    assert.equal(select().full, "true");
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Git classification includes deletions and missing bases select every check", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oip-classifier-"));
  const script = fileURLToPath(new URL("../scripts/ci/classify_changes.mjs", import.meta.url));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
    fs.mkdirSync(path.join(root, "content/essays"), { recursive: true });
    fs.writeFileSync(path.join(root, "content/essays/removed.md"), "original");
    git("add", "."); git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    fs.unlinkSync(path.join(root, "content/essays/removed.md"));
    fs.mkdirSync(path.join(root, "workers/oip-commerce"), { recursive: true });
    fs.writeFileSync(path.join(root, "workers/oip-commerce/added.mjs"), "fixture");
    git("add", "-A"); git("commit", "-qm", "changed");
    const head = git("rev-parse", "HEAD"), output = path.join(root, "outputs");
    const select = comparisonBase => {
      fs.writeFileSync(output, "");
      execFileSync(process.execPath, [script], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_OUTPUT: output, OIP_BASE_SHA: comparisonBase, OIP_HEAD_SHA: head } });
      return Object.fromEntries(fs.readFileSync(output, "utf8").trim().split("\n").map(line => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; }));
    };
    const selected = select(base);
    assert.equal(selected.site, "true");
    assert.equal(selected.worker, "true");
    assert.equal(selected.browser, "false");
    const missing = select("0".repeat(40));
    for (const key of ["site", "browser", "browser_navigation", "browser_bob", "browser_analytics", "browser_share", "images", "publishing", "rendering", "windows", "worker", "worker_commerce", "worker_bob", "seo"]) assert.equal(missing[key], "true", key);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
