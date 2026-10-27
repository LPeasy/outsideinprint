import test from "node:test";
import assert from "node:assert/strict";
import worker, { ReleaseCoordinator } from "../src/worker.mjs";
import { GitHub } from "../src/github.mjs";
import { Dispatcher } from "../src/dispatcher.mjs";

test("a new coordinator is inactive and cannot activate without a verified canary", async () => {
  const data = new Map(), secret = "a".repeat(64);
  const storage = { get: async key => data.get(key), put: async (key, value) => data.set(key, value), list: async () => data };
  const coordinator = new ReleaseCoordinator({ storage }, { ADMIN_SECRET: secret });
  let response = await coordinator.fetch(new Request("https://internal/tick", { method: "POST" }));
  assert.deepEqual(await response.json(), { status: "inactive" });
  response = await coordinator.fetch(new Request("https://internal/admin/control", { method: "POST", headers: { Authorization: "Bearer " + secret }, body: '{"enabled":true}' }));
  assert.equal(response.status, 409);
  assert.equal(data.has("control"), false);
});
test("the public endpoint cannot tick, dispatch, or read private state", async () => {
  const env = { COORDINATOR: { get: () => assert.fail("Unauthorized request reached the coordinator") } };
  assert.equal((await worker.fetch(new Request("https://service/tick", { method: "POST" }), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://service/admin/state"), env)).status, 401);
});

test("explicit probe observation only revisits its recorded run and preserves unrelated alerts", async () => {
  const data = new Map(), secret = "a".repeat(64);
  const storage = { get: async key => data.get(key), put: async (key, value) => data.set(key, value), delete: async key => data.delete(key) };
  const coordinator = new ReleaseCoordinator({ storage }, { ADMIN_SECRET: secret });
  const originalSnapshot = GitHub.prototype.snapshot, originalReconcile = Dispatcher.prototype.reconcile;
  const originalDispatch = GitHub.prototype.dispatch;
  const request = requestId => new Request("https://internal/admin/observe-probe", { method: "POST",
    headers: { Authorization: "Bearer " + secret }, body: JSON.stringify({ requestId }) });
  let observed = 0;
  GitHub.prototype.snapshot = async () => ({ sha: "a".repeat(40) });
  GitHub.prototype.dispatch = async () => assert.fail("Observation must not dispatch");
  Dispatcher.prototype.reconcile = async function (batch) {
    observed++;
    assert.equal(batch.runId, 123);
    return this.finish(batch, "verified", { runId: batch.runId });
  };
  try {
    assert.equal((await coordinator.fetch(request("unknown"))).status, 409);
    const batch = { requestId: "known", probe: true, status: "blocked", runId: 123, operations: [] };
    data.set("request:known", batch);
    data.set("attention", { requestId: "different", status: "blocked" });
    assert.equal((await coordinator.fetch(request("known"))).status, 200);
    assert.equal(observed, 1);
    assert.equal(data.get("canary").runId, 123);
    assert.equal(data.get("attention").requestId, "different");
    assert.equal((await coordinator.fetch(request("known"))).status, 409);
    data.set("request:real", { ...batch, requestId: "real", probe: false });
    assert.equal((await coordinator.fetch(request("real"))).status, 409);
    assert.equal(observed, 1);
  } finally {
    GitHub.prototype.snapshot = originalSnapshot;
    GitHub.prototype.dispatch = originalDispatch;
    Dispatcher.prototype.reconcile = originalReconcile;
  }
});
