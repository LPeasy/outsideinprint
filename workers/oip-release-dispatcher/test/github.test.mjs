import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { GitHub } from "../src/github.mjs";
import { readReceiptZip } from "../src/receipts.mjs";

test("receipt ZIPs require the API digest and retain exact JSON values", () => {
  const zip = Buffer.from("UEsDBBQAAAAIACZpW11d/wpxKQAAACcAAAAOAAAAYWRtaXNzaW9uLmpzb26rVipOzkjNTQxLLSrOzM9TsjLUUSouSSwpLVayUkpMyc0sKUlNUaoFAFBLAQIUABQAAAAIACZpW11d/wpxKQAAACcAAAAOAAAAAAAAAAAAAACAAQAAAABhZG1pc3Npb24uanNvblBLBQYAAAAAAQABADwAAABVAAAAAAA=", "base64");
  const digest = "sha256:" + createHash("sha256").update(zip).digest("hex");
  assert.deepEqual(readReceiptZip(zip, digest), { "admission.json": { schemaVersion: 1, status: "admitted" } });
  assert.throws(() => readReceiptZip(zip, "sha256:" + "0".repeat(64)), /digest/);
  assert.throws(() => readReceiptZip(zip.subarray(0, 30), digest), /digest/);
});
test("installation tokens are repository-scoped and dispatch includes the immutable expected SHA and nonce", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const calls = [];
  const gh = new GitHub({ GITHUB_APP_ID: "1", GITHUB_INSTALLATION_ID: "2", GITHUB_APP_PRIVATE_KEY: privateKey.export({ format: "pem", type: "pkcs8" }) }, async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/access_tokens")) return Response.json({ token: "fixture-token", expires_at: "2099-01-01T00:00:00Z" });
    return new Response(null, { status: 204 });
  });
  await gh.dispatch({ releases: [{ id: "approved" }], sha: "a".repeat(40), requestId: "12345678-1234-4321-abcd-123456789012", probe: true });
  assert.deepEqual(JSON.parse(calls[0].init.body), { repositories: ["outsideinprint"], permissions: { actions: "write", contents: "read" } });
  assert.equal(calls[1].url, "https://api.github.com/repos/LPeasy/outsideinprint/actions/workflows/deploy.yml/dispatches");
  const payload = JSON.parse(calls[1].init.body);
  assert.equal(payload.ref, "main");
  assert.equal(payload.inputs.full_checks, false);
  assert.equal(payload.inputs.release_probe, true);
  assert.equal(payload.inputs.release_expected_sha, "a".repeat(40));
  assert.equal(payload.inputs.release_ids, '["approved"]');
});
test("read-only provider failures may be observed again without dispatching", async () => {
  const gh = new GitHub({}, async () => new Response(null, { status: 503 }));
  gh.cachedToken = { token: "fixture-token", expires_at: "2099-01-01T00:00:00Z" };
  await assert.rejects(gh.run(1), error => error.transient === true);
  await assert.rejects(gh.api("/repos/another/repo/actions/runs"), /scope/);
});
