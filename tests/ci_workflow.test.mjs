import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { assertScheduleWorkflow } from "../scripts/ci/scheduled_releases.mjs";
const document = YAML.parseDocument(fs.readFileSync(".github/workflows/deploy.yml", "utf8"), { version: "1.2", uniqueKeys: true });
assert.deepEqual(document.errors, []);
const workflow = document.toJS(), jobs = workflow.jobs;
const steps = job => jobs[job].steps;
const commands = job => steps(job).map(step => step.run ?? "").join("\n");
const actions = job => steps(job).filter(step => step.uses);
const action = (job, name) => actions(job).find(step => step.uses.split("@")[0] === name);
const dependencies = job => [jobs[job].needs ?? []].flat();

test("release API inputs enter the same source and live verifier path; probes cannot build", () => {
  for (const key of ["release_ids", "release_request_id", "release_expected_sha", "release_probe"])
    assert.ok(workflow.on.workflow_dispatch.inputs[key]);
  assert.equal(workflow.on.workflow_dispatch.inputs.release_probe.default, false);
  assert.match(workflow["run-name"], /inputs.release_request_id/);
  const selection = steps("classify").find(step => step.id === "selection");
  assert.equal(selection.env.OIP_RELEASE_IDS, "${{ inputs.release_ids }}");
  assert.equal(selection.env.OIP_RELEASE_EXPECTED_SHA, "${{ inputs.release_expected_sha }}");
  const receipt = steps("classify").find(step => step.with?.name === "release-dispatch");
  assert.match(receipt.if, /always\(\)/);
  assert.equal(receipt.with["include-hidden-files"], true);
  assert.match(commands("classify"), /release_request.test.mjs/);
  assert.match(commands("worker"), /oip-release-dispatcher\/test/);
});

test("welcome bridge fixtures are included in the selectable worker gate", () => {
  assert.match(jobs.classify.outputs.worker_welcome, /steps.selection.outputs.worker_welcome/);
  assert.ok(action("worker", "actions/checkout").with["sparse-checkout"].includes("workers/oip-welcome"));
  const step = steps("worker").find(step => step.run?.includes("workers/oip-welcome/test/"));
  assert.ok(step);
  assert.equal(step.if, "${{ needs.classify.outputs.worker_welcome == 'true' }}");
  assert.equal(step.run, "node --test workers/oip-welcome/test/*.test.mjs");
});

test("Meta lead fixtures are included in the selectable worker gate without deployment", () => {
  assert.equal(jobs.classify.outputs.worker_meta_leads, "${{ steps.selection.outputs.worker_meta_leads }}");
  assert.ok(action("worker", "actions/checkout").with["sparse-checkout"].includes("workers/oip-meta-leads"));
  const step = steps("worker").find(step => step.run?.includes("workers/oip-meta-leads/test/"));
  assert.ok(step);
  assert.equal(step.if, "${{ needs.classify.outputs.worker_meta_leads == 'true' }}");
  assert.equal(step.run, "node --test workers/oip-meta-leads/test/*.test.mjs");
  assert.doesNotMatch(commands("worker"), /wrangler.*deploy|cloudflare.*deploy/i);
});

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
  assert.match(jobs.deploy.if, /always\(\)/);
  for (const dependency of ["classify", "site", "release-ready"]) {
    assert.ok(dependencies("deploy").includes(dependency));
    assert.ok(jobs.deploy.if.includes("needs." + dependency + ".result == 'success'"));
  }
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
  assert.equal(action("windows", "actions/checkout").with["sparse-checkout"], "${{ needs.classify.outputs.windows_checkout }}");
  assert.equal(action("windows", "actions/checkout").with["sparse-checkout-cone-mode"], false);
  const selection = steps("classify").find(step => step.id === "selection");
  assert.match(selection.env.OIP_BASE_SHA, /pull_request.base.sha/);
  assert.match(selection.env.OIP_HEAD_SHA, /pull_request.head.sha/);
  for (const name of ["windows", "worker"]) assert.match(jobs[name].if, new RegExp("outputs." + name));
  assert.match(jobs.site.if, /!cancelled\(\)/);
  assert.match(jobs.site.if, /needs.windows.result/);
  assert.match(jobs.site.if, /needs.worker.result/);
});
test("Eastern maintenance and generated release triggers retain PR supersession", () => {
  assert.deepEqual(workflow.on.schedule.slice(0, 2), [
    { cron: "17 0 * * 1", timezone: "America/New_York" },
    { cron: "17 0 * * 0,2-6", timezone: "America/New_York" },
  ]);
  assertScheduleWorkflow(fs.readFileSync(".github/workflows/deploy.yml", "utf8"));
  assert.equal(workflow.on.workflow_dispatch.inputs.full_checks.type, "boolean");
  assert.equal(workflow.on.workflow_dispatch.inputs.full_checks.default, true);
  assert.match(workflow.concurrency["cancel-in-progress"], /github.event_name == 'pull_request'/);
  assert.match(workflow.concurrency.group, /github.event.pull_request.number \|\| github.ref/);
});
test("timed releases use source validation and the verified production receipt", () => {
  assert.match(commands("classify"), /disney_release_schedule.test.mjs/);
  assert.match(commands("classify"), /test_disney_release_verification.py/);
  assert.equal(jobs.classify.outputs.release_slug, "${{ steps.selection.outputs.release_slug }}");
  const index = steps("deploy").findIndex(step => step.run?.includes("verify_disney_release.py"));
  assert.ok(index > steps("deploy").findIndex(step => step.id === "deployment-head-final"));
  assert.match(steps("deploy")[index].if, /release_slug != ''/);
  assert.match(steps("deploy")[index].if, /steps.deployment-head-final.outputs.current == 'true'/);
  assert.match(steps("deploy")[index].env.OIP_EXPECTED_GENERATED_AT, /needs.site.outputs.generated_at/);
  assert.ok(action("deploy", "actions/checkout").with["sparse-checkout"].includes("content/essays"));
  assert.match(commands("classify"), /scheduled_releases.mjs --check/);
  assert.match(commands("classify"), /scheduled_releases.mjs --check-pending/);
  assert.match(commands("classify"), /tests\/scheduled_releases.test.mjs/);
  assert.match(commands("classify"), /test_scheduled_release_verification.py/);
  assert.equal(jobs.classify.outputs.release_ids, "${{ steps.selection.outputs.release_ids }}");
  const generic = steps("deploy").findIndex(step => step.run?.includes("verify_scheduled_releases.py"));
  assert.ok(generic > steps("deploy").findIndex(step => step.id === "deployment-head-final"));
  assert.match(steps("deploy")[generic].if, /release_ids != '\[\]'/);
  assert.match(steps("deploy")[generic].if, /steps.deployment-head-final.outputs.current == 'true'/);
  assert.match(steps("deploy")[generic].env.OIP_EXPECTED_GENERATED_AT, /needs.site.outputs.generated_at/);
  for (const at of [index, generic]) {
    assert.match(steps("deploy")[at].if, /always\(\)/, "Independent release receipts must survive a preceding check failure");
    assert.match(steps("deploy")[at].if, /steps.deployment-head-final.outcome == 'success'/);
  }
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
  const build = steps("site").find(step => step.name === "Build Hugo");
  assert.match(build.run, /limit_seconds=1200\s+build_lane="cold"/);
  assert.match(build.run, /cache-hit.*== "true" \]\]; then\s+limit_seconds=300\s+build_lane="exact-cache"/);
  assert.equal(jobs.site["timeout-minutes"], 35);
  assert.match(commands("site"), /hugo --gc --minify --panicOnWarning --clock/);
  const install = steps("site").find(step => step.run?.includes("sha256sum --check --strict"));
  assert.ok(install);
  assert.match(install.run, /archive_sha256="[a-f0-9]{64}"/);
  assert.match(install.run, /\+extended\*/);
  assert.ok(steps("site").findIndex(step => step.run?.includes("test_responsive_image_source_contract")) < steps("site").findIndex(step => step.run?.includes("start_epoch=")));
});
test("browser containers are conditional and actual publication gates remain active", () => {
  const browserSteps = steps("site").filter(step => /run_browser_tests.mjs/.test(step.run ?? ""));
  assert.equal(browserSteps.length, 5);
  for (const step of browserSteps) assert.match(step.if, /outputs.browser/);
  const preparation = browserSteps.find(step => step.run.includes("--prepare"));
  assert.match(preparation.run, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.ok(steps("site").indexOf(preparation) > steps("site").findIndex(step => step.run?.includes("hugo --gc")));
  assert.ok(browserSteps.every(step => step === preparation || steps("site").indexOf(step) > steps("site").indexOf(preparation)));
  assert.equal(jobs.site.container, undefined, "Hugo and output gates retain their existing host environment.");
  assert.doesNotMatch(commands("site"), /playwright install|apt-get|apt install/);
  assert.match(commands("classify"), /tests\/browser_environment.test.mjs/);
  assert.ok(!actions("site").some(step => step.with?.path?.includes("ms-playwright")));
  for (const gate of ["test_responsive_image_source_contract", "audit_essay_images", "check_essay_guardrails", "test_public_route_smoke", "test_public_html_output", "test_responsive_image_output_contract", "test_games_catalog_contract", "test_feed_policy_contract"]) assert.ok(commands("site").includes(gate), gate);
  assert.match(commands("worker"), /npm --prefix workers\/oip-commerce test/);
  assert.match(commands("worker"), /python3 -m unittest discover/);
  assert.match(commands("worker"), /npm --prefix workers\/oip-bob test/);
  assert.ok(action("worker", "actions/checkout").with["sparse-checkout"].includes("workers/oip-bob"));
  assert.doesNotMatch(commands("worker"), /wrangler.*deploy|cloudflare.*deploy/i);
});

test("output checks have one root dependency install with or without browser fixtures", () => {
  const siteSteps = steps("site");
  const feedGate = siteSteps.findIndex(step => step.run?.includes("test_feed_policy_contract.ps1"));
  const installs = siteSteps.filter(step => /npm ci --ignore-scripts --no-audit --no-fund/.test(step.run ?? ""));
  for (const browser of [false, true]) {
    const selected = installs.filter(step => {
      const condition = step.if?.match(/needs\.classify\.outputs\.browser\s+(==|!=)\s+'true'/);
      assert.ok(condition, "Root installs must declare their browser selection.");
      return condition[1] === "==" ? browser : !browser;
    });
    assert.equal(selected.length, 1, `One dependency install is needed with browser=${browser}.`);
    assert.ok(siteSteps.indexOf(selected[0]) < feedGate, "Install the YAML parser before the feed inventory check.");
  }
});

test("browser and worker families select their own steps while preserving aggregate gates", () => {
  for (const [file, family] of [
    ["mobile_navigation_browser", "browser_navigation"], ["bob_reading_browser", "browser_bob"],
    ["hosted_analytics_browser", "browser_analytics"], ["piece_share_browser", "browser_share"],
  ]) {
    const step = steps("site").find(step => step.run?.includes(file + ".test.mjs"));
    assert.equal(step.run, "node scripts/ci/run_browser_tests.mjs tests/" + file + ".test.mjs");
    assert.ok(step.if.includes("needs.classify.outputs." + family + " == 'true'"));
    assert.equal(jobs.classify.outputs[family], "${{ steps.selection.outputs." + family + " }}");
  }
  for (const kind of ["commerce", "bob", "welcome", "meta-leads", "release-dispatcher"]) {
    const family = "worker_" + kind.replaceAll("-", "_");
    assert.equal(jobs.classify.outputs[family], "${{ steps.selection.outputs." + family + " }}");
    for (const step of steps("worker").filter(step => step.run?.includes("workers/oip-" + kind))) {
      assert.equal(step.if, "${{ needs.classify.outputs." + family + " == 'true' }}");
    }
  }
  assert.equal(steps("site").find(step => step.run?.includes("run_browser_tests.mjs --prepare")).if, "${{ needs.classify.outputs.browser == 'true' }}");
  assert.equal(steps("site").find(step => step.run?.includes("hosted_analytics_browser.test.mjs")).if, "${{ needs.classify.outputs.browser_analytics == 'true' && env.ANALYTICS_ENABLED == 'true' }}");
  assert.match(jobs.worker.if, /outputs.worker == 'true'/);
  for (const mode of ["-SourceOnly", "-SiteDir public"]) assert.ok(commands("site").includes("test_direct_commerce_storefront_contract.ps1 " + mode));
});
test("deployment verifies exact generation before canonical route checks", () => {
  const manifest = steps("deploy").findIndex(step => step.run?.includes("verify_deployment.mjs"));
  const smoke = steps("deploy").findIndex(step => step.run?.includes("test_live_seo_smoke.ps1"));
  assert.ok(manifest >= 0 && smoke > manifest);
  assert.match(steps("deploy")[manifest].env.OIP_EXPECTED_GENERATED_AT, /needs.site.outputs.generated_at/);
  assert.match(steps("site").find(step => step.id === "manifest").run, /node scripts\/ci\/write_publication_identity.mjs/);
  const diagnostics = steps("deploy").find(step => step.with?.name === "deployment-diagnostics");
  assert.equal(diagnostics.with["include-hidden-files"], true);
  assert.match(diagnostics.if, /always\(\)/);
  assert.equal(steps("deploy").filter(step => step.run?.includes("test_live_seo_smoke")).length, 1);
  assert.match(steps("deploy").find(step => step.run?.includes("probe_seo_rollout")).if, /outputs.seo/);
});

test("only a fresh authenticated main-head match can deploy and run live checks", () => {
  const deploySteps = steps("deploy");
  const freshnessIndex = deploySteps.findIndex(step => step.id === "deployment-head");
  const deploymentIndex = deploySteps.findIndex(step => step.id === "deployment");
  assert.ok(freshnessIndex >= 0);
  assert.equal(freshnessIndex + 1, deploymentIndex, "freshness must be rechecked immediately before actual deployment");
  assert.equal(deploySteps[freshnessIndex].run, "node scripts/ci/check_deployment_head.mjs");
  assert.equal(deploySteps[freshnessIndex].env.GH_TOKEN, "${{ github.token }}");
  for (const step of deploySteps.filter(step => step.id === "deployment" || step.id === "deployment-head-final" || /verify_deployment/.test(step.run ?? ""))) {
    assert.match(step.if, /steps.deployment-head.outputs.current == 'true'/, step.name);
  }
  const finalIndex = deploySteps.findIndex(step => step.id === "deployment-head-final");
  const manifestIndex = deploySteps.findIndex(step => step.run?.includes("verify_deployment.mjs"));
  const routesIndex = deploySteps.findIndex(step => step.run?.includes("test_live_seo_smoke"));
  assert.ok(finalIndex > manifestIndex && routesIndex > finalIndex);
  assert.equal(deploySteps[finalIndex].env.GH_TOKEN, "${{ github.token }}");
  assert.equal(deploySteps[finalIndex].env.OIP_REQUIRE_CURRENT, "true");
  assert.equal(deploySteps[finalIndex].env.OIP_DEPLOYMENT_HEAD_REPORT, ".deploy-reports/deployment-head-final.json");
  for (const step of deploySteps.filter(step => /test_live_seo_smoke|probe_seo_rollout/.test(step.run ?? ""))) {
    assert.match(step.if, /steps.deployment-head-final.outputs.current == 'true'/, step.name);
    assert.match(step.if, /steps.deployment-head-final.outcome == 'success'/, step.name);
  }
  assert.match(deploySteps.find(step => step.run?.includes("probe_seo_rollout")).if, /steps.deployment.outcome == 'success'/);
  assert.match(commands("classify"), /tests\/deployment_head.test.mjs/);
  assert.equal(deploySteps.find(step => step.with?.name === "deployment-diagnostics").with.path, ".deploy-reports/**");
});
test("disabled analytics workflow remains manual-only", () => {
  const analytics = YAML.parse(fs.readFileSync(".github/workflows/refresh-analytics.yml", "utf8"), { version: "1.2" });
  assert.deepEqual(Object.keys(analytics.on), ["workflow_dispatch"]);
});

test("supported runtimes, lockfiles and CI pins agree", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  const toolchain = JSON.parse(fs.readFileSync("tools/toolchain.manifest.json", "utf8"));
  const node = toolchain.tools.find(tool => tool.name === "node");
  const npm = toolchain.tools.find(tool => tool.name === "npm");
  assert.equal(fs.readFileSync(".nvmrc", "utf8").trim(), node.version);
  assert.equal(pkg.engines.node, node.version.split(".")[0] + ".x");
  assert.equal(pkg.engines.npm, npm.version.split(".")[0] + ".x");
  assert.equal(pkg.packageManager, "npm@" + npm.version);
  assert.deepEqual(lock.packages[""].engines, pkg.engines);
  for (const dependency of ["playwright", "yaml"]) {
    assert.match(pkg.devDependencies[dependency], /^\d+\.\d+\.\d+$/);
    assert.equal(lock.packages["node_modules/" + dependency].version, pkg.devDependencies[dependency]);
  }
  assert.equal(pkg.devDependencies.yaml, "2.9.1");
  assert.match(node.sha256, /^[a-f0-9]{64}$/);
  for (const name of Object.keys(jobs)) {
    const setup = action(name, "actions/setup-node");
    if (setup) assert.equal(setup.with["node-version"], node.version);
  }
});

test("Dependabot maintains grouped weekly npm dependencies without auto-merge policy", () => {
  const config = YAML.parse(fs.readFileSync(".github/dependabot.yml", "utf8"));
  const npm = config.updates.find(update => update["package-ecosystem"] === "npm");
  assert.equal(npm.directory, "/");
  assert.equal(npm.schedule.interval, "weekly");
  assert.equal(npm.schedule.timezone, "America/New_York");
  assert.deepEqual(npm.groups["npm-minor-patch"]["update-types"], ["minor", "patch"]);
  const bob = config.updates.find(update => update["package-ecosystem"] === "npm" && update.directory === "/workers/oip-bob");
  assert.ok(bob, "Bob's separate lockfile must receive dependency updates");
  assert.equal(bob.schedule.interval, "weekly");
  assert.equal(bob.schedule.timezone, "America/New_York");
  assert.deepEqual(bob.groups["bob-worker-minor-patch"]["update-types"], ["minor", "patch"]);
});
