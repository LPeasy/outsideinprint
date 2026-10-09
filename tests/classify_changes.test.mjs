import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classifyPaths, selectChecks } from "../scripts/ci/classify_changes.mjs";

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
});
test("workers and documentation do not need Hugo; mixed changes preserve all selected work", () => {
  assert.equal(classifyPaths(["workers/oip-commerce/src/index.mjs"]).site, false);
  assert.equal(classifyPaths(["workers/oip-commerce/test/commerce.test.mjs"]).worker, true);
  assert.equal(classifyPaths(["docs/publishing-workflow.md", "README.md"]).site, false);
  const mixed = classifyPaths(["workers/oip-commerce/src/index.mjs", "content/essays/new.md"]);
  assert.equal(mixed.site && mixed.worker, true);
});
test("deletions are classified by path and unknown dependencies fail conservatively", () => {
  assert.equal(classifyPaths(["assets/images/originals/removed.png"]).site, true);
  assert.ok(Object.values(classifyPaths(["unexpected-dependency.config"])).every(Boolean));
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
    for (const key of ["site", "browser", "images", "publishing", "rendering", "windows", "worker", "seo"]) assert.equal(missing[key], "true", key);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
