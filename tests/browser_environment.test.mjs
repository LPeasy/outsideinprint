import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PLAYWRIGHT_IMAGE, BROWSER_SUITES, assertBrowserPins, assertBrowserVersions, browserContainerArguments, runDocker, runBrowserTests } from "../scripts/ci/run_browser_tests.mjs";

const context = { repoRoot: "/home/runner/work/outsideinprint/outsideinprint", nodeExecutable: "/opt/hostedtoolcache/node/24.21.0/x64/bin/node", uid: 1001, gid: 1001 };
const versions = () => ({
  pkg: { devDependencies: { playwright: "1.64.0" } },
  lock: { packages: { "": { devDependencies: { playwright: "1.64.0" } }, "node_modules/playwright": { version: "1.64.0" }, "node_modules/playwright-core": { version: "1.64.0" } } },
  toolchain: { tools: [{ name: "node", version: "24.21.0" }] },
  installedPlaywright: { version: "1.64.0" }, installedCore: { version: "1.64.0" }, nodeVersion: "24.21.0",
});

test("repository package, lockfile and runtime pins match the immutable browser image", () => {
  const readJson = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));
  assertBrowserPins({
    pkg: readJson("../package.json"), lock: readJson("../package-lock.json"),
    toolchain: readJson("../tools/toolchain.manifest.json"), nodeVersion: process.versions.node,
  });
});

test("browser image, package, lockfile, installed browsers and Node cannot silently diverge", () => {
  assertBrowserVersions(versions());
  for (const mutate of [
    input => input.pkg.devDependencies.playwright = "1.65.0",
    input => input.lock.packages[""].devDependencies.playwright = "1.65.0",
    input => input.lock.packages["node_modules/playwright"].version = "1.65.0",
    input => input.lock.packages["node_modules/playwright-core"].version = "1.65.0",
    input => input.installedPlaywright.version = "1.65.0",
    input => input.installedCore.version = "1.65.0",
    input => input.nodeVersion = "24.20.0",
  ]) {
    const input = versions(); mutate(input);
    assert.throws(() => assertBrowserVersions(input));
  }
});

test("container reuses the checkout and exact Node, with host-owned screenshots and bounded shared memory", () => {
  const args = browserContainerArguments(context, ["--version"]);
  const options = name => args.flatMap((value, index) => value === name ? [args[index + 1]] : []);
  assert.deepEqual(options("--mount"), [
    `type=bind,source=${context.repoRoot},target=${context.repoRoot}`,
    "type=bind,source=/opt/hostedtoolcache/node/24.21.0/x64/bin,target=/opt/hostedtoolcache/node/24.21.0/x64/bin,readonly",
  ]);
  assert.deepEqual(options("--workdir"), [context.repoRoot]);
  assert.deepEqual(options("--entrypoint"), [context.nodeExecutable]);
  assert.deepEqual(options("--user"), ["1001:1001"]);
  assert.ok(args.includes("--shm-size=1g") && args.includes("--init") && args.includes("--rm"));
  assert.ok(args.includes("--pull=never"), "Only the preparation step may pull the pinned browser image.");
  assert.deepEqual(options("--env"), ["HOME=/tmp", "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright", "PATH", "CI", "TZ", "OIP_BUILD_CLOCK_UTC", "OIP_SITE_DIR", "ANALYTICS_ENABLED", "ANALYTICS_ALLOW_LOCAL", "ANALYTICS_PURCHASE_ENABLED", "ANALYTICS_PURCHASE_MEASUREMENT_ID"]);
  assert.doesNotMatch(args.join(" "), /privileged|docker\.sock|--ipc|--network|GH_TOKEN|GITHUB_TOKEN|--env-file/);
});

test("preparation pulls once and verifies the mounted runtime before suites", () => {
  const commands = [];
  runBrowserTests("--prepare", { ...context, execute: args => commands.push(args) });
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0], ["pull", PLAYWRIGHT_IMAGE]);
  assert.deepEqual(commands[1].slice(-2), ["scripts/ci/run_browser_tests.mjs", "--check-runtime"]);
});

test("every existing suite runs serially and failure propagates to its workflow step", () => {
  for (const suite of BROWSER_SUITES) {
    const commands = [];
    runBrowserTests(suite, { ...context, execute: args => commands.push(args) });
    assert.equal(commands.length, 1);
    assert.deepEqual(commands[0].slice(-4), [PLAYWRIGHT_IMAGE, "--test", "--test-concurrency=1", suite]);
    assert.throws(() => runBrowserTests(suite, { ...context, execute: () => { throw new Error("fixture failed"); } }), /fixture failed/);
  }
  assert.throws(() => runBrowserTests("tests/all.test.mjs", { ...context, execute: () => assert.fail("Unselected command executed") }), /existing browser suites/);
});

test("Docker errors and nonzero or interrupted exits cannot pass the release gate", () => {
  const invoke = result => runDocker(["run", "--version"], (binary, args, options) => {
    assert.equal(binary, "docker"); assert.equal(options.shell, false); return result;
  });
  invoke({ status: 0 });
  assert.throws(() => invoke({ status: 7 }), error => error.exitCode === 7);
  assert.throws(() => invoke({ status: null, signal: "SIGTERM" }), /SIGTERM/);
  assert.throws(() => invoke({ error: new Error("Docker unavailable") }), /Docker unavailable/);
});
