import test from "node:test";
import assert from "node:assert/strict";
import { assertPublishedManifest, pollPublishedManifest } from "../scripts/ci/verify_deployment.mjs";
const sha = "a".repeat(40), generated = "2026-10-09T17:00:00.0000000Z";
test("live identity rejects both old commits and older daily builds of the same commit", () => {
  assert.throws(() => assertPublishedManifest({ commitSha: "b".repeat(40), generatedAtUtc: generated }, sha, generated));
  assert.throws(() => assertPublishedManifest({ commitSha: sha, generatedAtUtc: "2026-10-08T17:00:00.0000000Z" }, sha, generated));
  assertPublishedManifest({ commitSha: sha, generatedAtUtc: generated }, sha, generated);
});
test("poll manifest before route checks, with six bounded attempts and five delays", async () => {
  let calls = 0, delays = [];
  await assert.rejects(pollPublishedManifest({ expectedSha: sha, expectedGeneratedAt: generated, fetchManifest: async () => { calls++; return { commitSha: sha, generatedAtUtc: "old" }; }, delay: async ms => { delays.push(ms); } }), /different build/);
  assert.equal(calls, 6);
  assert.deepEqual(delays, [20_000, 20_000, 20_000, 20_000, 20_000]);
});
test("propagation accepts the expected build and stops without rebuilding", async () => {
  let calls = 0;
  const result = await pollPublishedManifest({ expectedSha: sha, expectedGeneratedAt: generated, fetchManifest: async () => {
    calls++;
    if (calls === 1) throw new Error("HTTP 503");
    return { commitSha: sha, generatedAtUtc: generated };
  }, delay: async () => {} });
  assert.equal(calls, 2);
  assert.equal(result.generatedAtUtc, generated);
});
