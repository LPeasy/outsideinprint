import test from "node:test";
import assert from "node:assert/strict";
import { Dispatcher, operations } from "../src/dispatcher.mjs";
import { fingerprint, verifyAdmission, verifyProduction } from "../src/receipts.mjs";

const at = "2026-11-01T09:00:00-05:00", now = Date.parse(at), sha = "a".repeat(40);
const release = { id: "future", releaseAt: at, endsAt: "2026-11-02T09:00:00-05:00", bindings: [{ sha256: "b".repeat(64), path: "content/essays/future.md" }] };
const registry = { schemaVersion: 1, releases: [release] };
function fixture() {
  const data = new Map([["control", { enabled: true }], ["canary", { status: "verified" }]]);
  const store = { get: async key => structuredClone(data.get(key)), put: async (key, value) => data.set(key, structuredClone(value)), delete: async key => data.delete(key) };
  let posts = 0, runs = [];
  const gh = { snapshot: async () => ({ sha, registry, config: { schemaVersion: 1, mode: "cloudflare" } }),
    runs: async () => runs, dispatch: async () => { posts++; } };
  const engine = new Dispatcher(store, gh, { now: () => now + 120_000, uuid: () => "12345678-1234-4321-abcd-123456789012" });
  return { engine, gh, store, data, get posts() { return posts; }, set runs(value) { runs = value; } };
}
test("early, DST and expired operations are not dispatched; an authorized rebuild is separate", () => {
  assert.equal(operations(registry, now - 1).length, 0);
  assert.equal(operations(registry, now).length, 1);
  assert.equal(operations(registry, Date.parse(release.endsAt)).length, 0);
  const extra = { schemaVersion: 1, releases: [{ ...release, rebuildAt: "2026-11-01T09:30:00-05:00" }] };
  assert.equal(operations(extra, now + 30 * 60_000).length, 2);
});
test("overdue work dispatches once and duplicate ticks reconcile the durable nonce", async () => {
  const f = fixture();
  assert.equal((await f.engine.tick()).status, "dispatched");
  assert.equal((await f.engine.tick()).status, "awaiting-run");
  assert.equal(f.posts, 1);
  assert.ok(f.data.get("active"));
});
test("an uncertain POST is never blindly resent", async () => {
  const f = fixture();
  f.gh.dispatch = async () => { throw Error("Response lost"); };
  await f.engine.tick();
  assert.equal(f.data.get("active").outcome, "uncertain");
  f.gh.dispatch = async () => assert.fail("Must reconcile before any dispatch");
  assert.equal((await f.engine.tick()).status, "awaiting-run");
});
test("a live GitHub run waits; verified or blocked release operations stay terminal", async () => {
  const f = fixture(); f.runs = [{ status: "in_progress" }];
  assert.equal((await f.engine.tick()).status, "waiting-for-github");
  assert.equal(f.posts, 0);
  f.runs = [];
  const op = operations(registry, now)[0];
  for (const status of ["verified", "blocked", "reconciled"]) {
    f.data.set(op.key, { ...op, status });
    assert.equal((await f.engine.tick()).status, "idle");
  }
});
test("a process restart follows the recorded run ID; a genuine failure blocks further deployment", async () => {
  const f = fixture(); await f.engine.tick();
  const batch = f.data.get("active");
  f.runs = [{ id: 123, display_title: "OIP release " + batch.requestId, event: "workflow_dispatch", status: "in_progress" }];
  assert.equal((await f.engine.tick()).status, "in-flight");
  f.gh.run = async id => ({ id, status: "completed", conclusion: "failure", head_sha: sha });
  f.gh.receipts = async () => ({ "admission.json": { schemaVersion: 1, requestId: batch.requestId, expectedSha: sha,
    commitSha: sha, probe: false, status: "admitted", releases: batch.releases } });
  f.gh.jobs = async () => [];
  assert.equal((await f.engine.tick()).status, "blocked");
  assert.equal((await f.engine.tick()).status, "idle");
  assert.equal(f.posts, 1);
});
test("a superseded request can follow a newer main without relabeling a failed build", async () => {
  const f = fixture(); await f.engine.tick();
  const batch = f.data.get("active"), next = "c".repeat(40);
  const run = { id: 123, display_title: "OIP release " + batch.requestId, event: "workflow_dispatch", status: "completed", conclusion: "success", head_sha: next };
  f.runs = [run];
  f.gh.receipts = async () => ({ "admission.json": { schemaVersion: 1, requestId: batch.requestId, expectedSha: sha, commitSha: next, probe: false, status: "superseded", releases: [] } });
  assert.equal((await f.engine.tick()).status, "superseded");
  f.gh.snapshot = async () => ({ sha: next, registry, config: { schemaVersion: 1, mode: "cloudflare" } });
  f.runs = [];
  assert.equal((await f.engine.tick()).status, "dispatched");
});
test("probe completion requires skipped site/deploy jobs and never completes a real release", async () => {
  const f = fixture(); f.data.set("control", { enabled: false }); f.data.set("probe", { ids: [release.id] });
  await f.engine.tick();
  const batch = f.data.get("active");
  const run = { id: 1, status: "completed", conclusion: "success", head_sha: sha, event: "workflow_dispatch", display_title: "OIP release " + batch.requestId };
  f.runs = [run];
  f.gh.receipts = async () => ({ "admission.json": { schemaVersion: 1, requestId: batch.requestId, expectedSha: sha, commitSha: sha, probe: true, status: "admitted", releases: batch.releases } });
  f.gh.jobs = async () => [{ name: "site", conclusion: "skipped" }, { name: "deploy", conclusion: "skipped" }, { name: "release-ready", conclusion: "success" }];
  assert.equal((await f.engine.tick()).status, "verified");
  assert.equal(f.data.get("canary").runId, 1);
  assert.equal(f.data.has(operations(registry, now)[0].key), false);
});

test("production evidence must match original commit/time, current-main guards and every selected release", () => {
  const generatedAtUtc = "2026-11-01T14:05:00.1234567Z", run = { id: 1, head_sha: sha, html_url: "https://github.com/LPeasy/outsideinprint/actions/runs/1" };
  const batch = { sha, releases: [{ id: release.id, fingerprint: fingerprint(release) }] };
  const guard = { current: true, status: "current", workflowSha: sha, headSha: sha, repository: "LPeasy/outsideinprint", workflowRef: "refs/heads/main" };
  const receipts = { "live-manifest.json": { expectedSha: sha, expectedGeneratedAt: generatedAtUtc, observed: { commitSha: sha, generatedAtUtc } },
    "deployment-head.json": guard, "deployment-head-final.json": guard,
    "scheduled-releases.json": { status: "passed", commitSha: sha, generatedAtUtc, runUrl: run.html_url,
      releases: [{ id: release.id, status: "passed", commitSha: sha, generatedAtUtc }] } };
  const jobs = [{ steps: ["Deploy", "Verify canonical publication manifest", "Confirm published commit still matches current main", "Verify canonical routes and SEO", "Verify scheduled releases"].map(name => ({ name, conclusion: "success" })) }];
  assert.equal(verifyProduction({ receipts, batch, run, jobs }).generatedAtUtc, generatedAtUtc);
  for (const alter of [r => r["live-manifest.json"].observed.generatedAtUtc = "2026-11-01T14:05:00.123Z",
    r => r["deployment-head-final.json"] = { ...guard, current: false },
    r => r["scheduled-releases.json"].releases[0].status = "failed"]) {
    const changed = structuredClone(receipts); alter(changed);
    assert.throws(() => verifyProduction({ receipts: changed, batch, run, jobs }));
  }
  assert.throws(() => verifyAdmission({ schemaVersion: 1, requestId: "wrong" }, { ...batch, requestId: "expected" }, run), /identity/);
});
