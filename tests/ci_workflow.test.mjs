import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
const document = YAML.parseDocument(fs.readFileSync(".github/workflows/deploy.yml", "utf8"), { version: "1.2", uniqueKeys: true });
assert.deepEqual(document.errors, []);
const workflow = document.toJS(), jobs = workflow.jobs;
const steps = job => jobs[job].steps;
const commands = job => steps(job).map(step => step.run ?? "").join("\n");
const actions = job => steps(job).filter(step => step.uses);
const action = (job, name) => actions(job).find(step => step.uses.split("@")[0] === name);
const dependencies = job => [jobs[job].needs ?? []].flat();

test("release-ready always inspects all selectable prerequisite jobs", () => {
  assert.equal(jobs["release-ready"].name, "release-ready");
  assert.match(jobs["release-ready"].if, /always\(\)/);
  assert.deepEqual(new Set(dependencies("release-ready")), new Set(["classify", "site", "windows", "worker"]));
  const assertion = steps("release-ready").find(step => step.run?.includes("release_gate.mjs"));
  assert.match(assertion.env.OIP_NEEDS_JSON, /toJSON\(needs\)/);
  assert.match(assertion.env.OIP_SELECTED_JSON, /needs.classify.outputs.selection/);
  assert.ok(dependencies("deploy").includes("release-ready"));
});
test("Pages and OIDC permissions belong only to production deployment", () => {
  assert.deepEqual(workflow.permissions, { contents: "read" });
  for (const [name, job] of Object.entries(jobs)) if (name !== "deploy") assert.ok(!Object.values(job.permissions ?? {}).includes("write"), name);
  assert.deepEqual(jobs.deploy.permissions, { contents: "read", pages: "write", "id-token": "write" });
  assert.equal(jobs.deploy.environment.name, "github-pages");
  assert.match(jobs.deploy.if, /github.ref == 'refs\/heads\/main'/);
  assert.match(jobs.deploy.if, /github.event_name != 'pull_request'/);
  assert.match(action("site", "actions/upload-pages-artifact").if, /refs\/heads\/main/);
  assert.equal(action("site", "actions/upload-pages-artifact").with.path, "./public");
  assert.match(commands("site"), /rm -rf \.\/public\/pdfs/);
  assert.doesNotMatch(commands("site"), /--buildFuture|--buildDrafts|--buildExpired/);
  for (const [name, job] of Object.entries(jobs)) for (const step of job.steps) if (step.uses) {
    assert.match(step.uses, /^actions\/[a-z-]+(?:\/(?:restore|save))?@[a-f0-9]{40}$/, name);
    if (step.uses.startsWith("actions/checkout@")) assert.equal(step.with["persist-credentials"], false);
  }
});
test("classification uses complete Git history and sparse files", () => {
  const checkout = action("classify", "actions/checkout");
  assert.equal(checkout.with["fetch-depth"], 0);
  assert.ok(checkout.with["sparse-checkout"].includes("scripts/ci"));
  const selection = steps("classify").find(step => step.id === "selection");
  assert.match(selection.env.OIP_BASE_SHA, /pull_request.base.sha/);
  assert.match(selection.env.OIP_HEAD_SHA, /pull_request.head.sha/);
  for (const name of ["windows", "worker"]) assert.match(jobs[name].if, new RegExp("outputs." + name));
  assert.match(jobs.site.if, /always\(\)/);
  assert.match(jobs.site.if, /needs.windows.result/);
  assert.match(jobs.site.if, /needs.worker.result/);
});
test("one Eastern daily schedule includes Monday full checks and PR supersession", () => {
  assert.deepEqual(workflow.on.schedule, [
    { cron: "17 0 * * 1", timezone: "America/New_York" },
    { cron: "17 0 * * 0,2-6", timezone: "America/New_York" },
  ]);
  assert.equal(workflow.on.workflow_dispatch.inputs.full_checks.type, "boolean");
  assert.equal(workflow.on.workflow_dispatch.inputs.full_checks.default, true);
  assert.match(workflow.concurrency["cancel-in-progress"], /github.event_name == 'pull_request'/);
  assert.match(workflow.concurrency.group, /github.event.pull_request.number \|\| github.ref/);
});
test("Hugo resources restore compatibly and only validated production saves them", () => {
  const restore = action("site", "actions/cache/restore"), save = action("site", "actions/cache/save");
  assert.equal(restore.with.path, "resources/_gen");
  assert.equal(save.with.path, "resources/_gen");
  assert.equal(restore.with.key, save.with.key);
  assert.match(restore.with["restore-keys"], /image-key.outputs.prefix/);
  assert.match(save.if, /success\(\)/);
  assert.match(save.if, /refs\/heads\/main/);
  assert.match(save.if, /github.event_name != 'pull_request'/);
  assert.match(commands("site"), /limit_seconds=300/);
  assert.match(commands("site"), /limit_seconds=900/);
  assert.match(commands("site"), /hugo --gc --minify --panicOnWarning --clock/);
  const install = steps("site").find(step => step.run?.includes("sha256sum --check --strict"));
  assert.ok(install);
  assert.match(install.run, /archive_sha256="[a-f0-9]{64}"/);
  assert.match(install.run, /\+extended\*/);
  assert.ok(steps("site").findIndex(step => step.run?.includes("test_responsive_image_source_contract")) < steps("site").findIndex(step => step.run?.includes("start_epoch=")));
});
test("browser binaries are conditional and actual publication gates remain active", () => {
  for (const step of steps("site").filter(step => /playwright install|_browser.test/.test(step.run ?? ""))) assert.match(step.if, /outputs.browser/);
  assert.ok(!actions("site").some(step => step.with?.path?.includes("ms-playwright")));
  for (const gate of ["test_responsive_image_source_contract", "audit_essay_images", "check_essay_guardrails", "test_public_route_smoke", "test_public_html_output", "test_responsive_image_output_contract", "test_games_catalog_contract", "test_feed_policy_contract"]) assert.ok(commands("site").includes(gate), gate);
  assert.match(commands("worker"), /npm --prefix workers\/oip-commerce test/);
  assert.match(commands("worker"), /python3 -m unittest discover/);
  assert.doesNotMatch(commands("worker"), /wrangler.*deploy|cloudflare.*deploy/i);
});
test("deployment verifies exact generation before canonical route checks", () => {
  const manifest = steps("deploy").findIndex(step => step.run?.includes("verify_deployment.mjs"));
  const smoke = steps("deploy").findIndex(step => step.run?.includes("test_live_seo_smoke.ps1"));
  assert.ok(manifest >= 0 && smoke > manifest);
  assert.match(steps("deploy")[manifest].env.OIP_EXPECTED_GENERATED_AT, /needs.site.outputs.generated_at/);
  assert.equal(steps("deploy").filter(step => step.run?.includes("test_live_seo_smoke")).length, 1);
  assert.match(steps("deploy").find(step => step.run?.includes("probe_seo_rollout")).if, /outputs.seo/);
});
test("disabled analytics workflow remains manual-only", () => {
  const analytics = YAML.parse(fs.readFileSync(".github/workflows/refresh-analytics.yml", "utf8"), { version: "1.2" });
  assert.deepEqual(Object.keys(analytics.on), ["workflow_dispatch"]);
});
