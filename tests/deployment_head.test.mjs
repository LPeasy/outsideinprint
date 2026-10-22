import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkDeploymentHead, runDeploymentHeadGuard } from "../scripts/ci/check_deployment_head.mjs";

const sha = "a".repeat(40), newerSha = "b".repeat(40), secret = "test-token-must-not-appear";
const identity = { sha, ref: "refs/heads/main", repository: "LPeasy/outsideinprint", token: secret };
const response = (headSha = sha, ref = "refs/heads/main", type = "commit") => ({ ok: true, json: async () => ({ ref, object: { type, sha: headSha } }) });

test("current main can deploy after one authenticated uncached read", async () => {
  let calls = 0;
  const result = await checkDeploymentHead({ ...identity, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, "https://api.github.com/repos/LPeasy/outsideinprint/git/ref/heads/main");
    assert.equal(options.method, "GET");
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return response();
  } });
  assert.equal(calls, 1);
  assert.equal(result.current, true);
  assert.equal(result.status, "current");
  assert.equal(result.headSha, sha);
});

test("an older workflow cleanly skips deployment when current main differs", async () => {
  const result = await checkDeploymentHead({ ...identity, fetchImpl: async () => response(newerSha) });
  assert.equal(result.current, false);
  assert.equal(result.status, "superseded");
  assert.equal(result.headSha, newerSha);
});

test("other branches and tags cannot deploy or make an authenticated request", async () => {
  for (const ref of ["refs/heads/feature", "refs/tags/main"]) {
    const result = await checkDeploymentHead({ ...identity, ref, fetchImpl: async () => assert.fail("must not fetch") });
    assert.equal(result.current, false);
    assert.equal(result.status, "not-main");
  }
});

test("malformed workflow identity and missing credentials fail before a request", async () => {
  for (const invalid of [{ sha: "short" }, { sha: "A".repeat(40) }, { repository: "wrong" }, { ref: "" }, { token: "" }]) {
    await assert.rejects(checkDeploymentHead({ ...identity, ...invalid, fetchImpl: async () => assert.fail("must not fetch") }));
  }
});

test("API errors, malformed JSON, a different ref, and invalid SHA all fail closed without retries", async () => {
  for (const fetchResult of [
    async () => { throw new Error(secret); },
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: false, status: 401 }),
    async () => ({ ok: true, json: async () => { throw new Error(secret); } }),
    async () => response("short"),
    async () => response("B".repeat(40)),
    async () => response(sha, "refs/heads/feature"),
    async () => response(sha, "refs/heads/main", "tag"),
    async () => ({ ok: true, json: async () => null }),
  ]) {
    let calls = 0;
    await assert.rejects(checkDeploymentHead({ ...identity, fetchImpl: async (...args) => { calls++; return fetchResult(...args); } }), error => !error.message.includes(secret));
    assert.equal(calls, 1);
  }
});

test("current, superseded, and failed checks record receipts and explicit Actions outputs without secrets", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oip-deployment-head-"));
  try {
    for (const status of ["current", "superseded", "error"]) {
      const output = path.join(root, status + ".outputs"), summary = path.join(root, status + ".summary");
      const reportPath = path.join(root, status, "deployment-head.json");
      const env = { GITHUB_SHA: sha, GITHUB_REF: identity.ref, GITHUB_REPOSITORY: identity.repository, GH_TOKEN: secret, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary };
      const result = await runDeploymentHeadGuard({ env, reportPath, now: () => new Date("2026-10-22T20:00:00Z"), fetchImpl: async () => {
        if (status === "error") throw new Error(secret);
        return response(status === "current" ? sha : newerSha);
      } });
      assert.equal(result.failed, status === "error");
      const receiptText = fs.readFileSync(reportPath, "utf8"), outputText = fs.readFileSync(output, "utf8"), summaryText = fs.readFileSync(summary, "utf8");
      const receipt = JSON.parse(receiptText);
      assert.equal(receipt.status, status);
      assert.equal(receipt.current, status === "current");
      assert.equal(receipt.checkedAtUtc, "2026-10-22T20:00:00.000Z");
      assert.equal(outputText, `current=${status === "current"}\nstatus=${status}\n`);
      assert.doesNotMatch(receiptText + outputText + summaryText, new RegExp(secret));
    }
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the final head check fails if main changed during deployment and writes its separate receipt", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oip-final-deployment-head-"));
  try {
    for (const current of [true, false]) {
      const reportPath = path.join(root, current ? "current-final.json" : "superseded-final.json");
      const env = { GITHUB_SHA: sha, GITHUB_REF: identity.ref, GITHUB_REPOSITORY: identity.repository, GH_TOKEN: secret, OIP_REQUIRE_CURRENT: "true", OIP_DEPLOYMENT_HEAD_REPORT: reportPath };
      const result = await runDeploymentHeadGuard({ env, fetchImpl: async () => response(current ? sha : newerSha) });
      assert.equal(result.failed, !current);
      assert.equal(result.receipt.current, current);
      assert.equal(result.receipt.status, current ? "current" : "superseded");
      assert.equal(JSON.parse(fs.readFileSync(reportPath, "utf8")).requireCurrent, true);
      if (!current) assert.match(result.receipt.reason, /verification failed/);
    }
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
