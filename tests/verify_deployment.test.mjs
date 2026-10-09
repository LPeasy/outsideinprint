import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertPublishedManifest, pollPublishedManifest } from "../scripts/ci/verify_deployment.mjs";
const sha = "a".repeat(40), generated = "2026-10-09T17:00:00.0000000Z";
test("Actions identity export preserves all seven fractional digits verbatim", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oip-publication-identity-"));
  try {
    const manifest = path.join(root, "manifest.json"), output = path.join(root, "outputs");
    const timestamp = "2026-10-09T19:36:50.1234567Z";
    fs.writeFileSync(manifest, JSON.stringify({ commitSha: sha, generatedAtUtc: timestamp }));
    execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/ci/write_publication_identity.mjs", import.meta.url)), manifest], { env: { ...process.env, GITHUB_OUTPUT: output } });
    assert.equal(fs.readFileSync(output, "utf8"), "generated_at=" + timestamp + "\n");
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("reformatted expected timestamps fail before network polling", async () => {
  let calls = 0;
  await assert.rejects(pollPublishedManifest({ expectedSha: sha, expectedGeneratedAt: "10/09/2026 19:36:50", fetchManifest: async () => { calls++; }, delay: async () => {} }), /original UTC generation timestamp/);
  assert.equal(calls, 0);
});
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
