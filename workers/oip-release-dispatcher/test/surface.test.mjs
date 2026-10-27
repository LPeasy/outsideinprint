import test from "node:test";
import assert from "node:assert/strict";
import worker, { ReleaseCoordinator } from "../src/worker.mjs";

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
