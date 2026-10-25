import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// Microsoft Container Registry's v1.64.0-noble OCI index, verified 2026-10-25.
export const PLAYWRIGHT_IMAGE = "mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f";
export const BROWSER_SUITES = [
  "tests/mobile_navigation_browser.test.mjs",
  "tests/bob_reading_browser.test.mjs",
  "tests/hosted_analytics_browser.test.mjs",
  "tests/piece_share_browser.test.mjs",
];

const forwardedEnvironment = [
  "PATH", "CI", "TZ", "OIP_BUILD_CLOCK_UTC", "OIP_SITE_DIR",
  "ANALYTICS_ENABLED", "ANALYTICS_ALLOW_LOCAL", "ANALYTICS_PURCHASE_ENABLED",
  "ANALYTICS_PURCHASE_MEASUREMENT_ID",
];

export function assertBrowserPins({ pkg, lock, toolchain, nodeVersion }) {
  const imageVersion = PLAYWRIGHT_IMAGE.match(/:v(\d+\.\d+\.\d+)-noble@sha256:[a-f0-9]{64}$/)?.[1];
  assert.ok(imageVersion, "Browser image must have an immutable versioned digest.");
  assert.equal(nodeVersion, toolchain.tools.find(tool => tool.name === "node")?.version, "Browser tests must retain the pinned Node runtime.");
  for (const version of [pkg.devDependencies.playwright, lock.packages[""].devDependencies.playwright,
    lock.packages["node_modules/playwright"].version, lock.packages["node_modules/playwright-core"].version]) {
    assert.equal(version, imageVersion, "Playwright package, lockfile, installed modules and browser image must match.");
  }
  return imageVersion;
}

export function assertBrowserVersions(input) {
  const imageVersion = assertBrowserPins(input);
  for (const version of [input.installedPlaywright.version, input.installedCore.version]) {
    assert.equal(version, imageVersion, "Installed Playwright modules must match the browser image.");
  }
}

export function browserContainerArguments({ repoRoot, nodeExecutable, uid, gid }, command) {
  const nodeDirectory = path.dirname(nodeExecutable);
  return [
    "run", "--pull=never", "--rm", "--init", "--shm-size=1g", "--user", `${uid}:${gid}`,
    "--mount", `type=bind,source=${repoRoot},target=${repoRoot}`,
    "--mount", `type=bind,source=${nodeDirectory},target=${nodeDirectory},readonly`,
    "--workdir", repoRoot,
    "--env", "HOME=/tmp", "--env", "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright",
    ...forwardedEnvironment.flatMap(name => ["--env", name]),
    "--entrypoint", nodeExecutable, PLAYWRIGHT_IMAGE, ...command,
  ];
}

export function runDocker(args, spawn = spawnSync) {
  const result = spawn("docker", args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`Browser container failed (${result.signal || result.status}).`);
    error.exitCode = result.status || 1;
    throw error;
  }
}

export function runBrowserTests(mode, { repoRoot, nodeExecutable, uid, gid, execute = runDocker }) {
  const context = { repoRoot, nodeExecutable, uid, gid };
  if (mode === "--prepare") {
    execute(["pull", PLAYWRIGHT_IMAGE]);
    execute(browserContainerArguments(context, ["scripts/ci/run_browser_tests.mjs", "--check-runtime"]));
    return;
  }
  assert.ok(BROWSER_SUITES.includes(mode), "Choose one of the existing browser suites or --prepare.");
  execute(browserContainerArguments(context, ["--test", "--test-concurrency=1", mode]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const readJson = relative => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8"));
    assertBrowserVersions({
      pkg: readJson("package.json"), lock: readJson("package-lock.json"),
      toolchain: readJson("tools/toolchain.manifest.json"),
      installedPlaywright: readJson("node_modules/playwright/package.json"),
      installedCore: readJson("node_modules/playwright-core/package.json"),
      nodeVersion: process.versions.node,
    });
    assert.equal(process.argv.length, 3, "Expected one browser suite or --prepare.");
    if (process.argv[2] === "--check-runtime") {
      console.log(`Browser image runtime: Node ${process.versions.node}; Playwright ${readJson("node_modules/playwright/package.json").version}.`);
    } else {
      assert.equal(process.platform, "linux", "This browser wrapper runs on the existing Linux CI host.");
      runBrowserTests(process.argv[2], {
        repoRoot, nodeExecutable: fs.realpathSync(process.execPath), uid: process.getuid(), gid: process.getgid(),
      });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode || 1;
  }
}
