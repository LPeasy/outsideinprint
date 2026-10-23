import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { operationalAlertPayloadDigest, sendOperationalAlert } from "../src/square.js";

const alert = Object.freeze({
  alertCode: "PHYSICAL_MAINTENANCE_FAILED",
  alertBucket: 82998,
  firstSeenAt: 1_792_769_400,
  lastSeenAt: 1_792_769_400,
  occurrences: 1,
});

function environment(fetch) {
  return {
    RESEND_API_KEY: "secret-api-key-must-never-be-retained",
    DOWNLOAD_EMAIL_FROM: "Outside In Print <downloads@outsideinprint.org>",
    DOWNLOAD_EMAIL_REPLY_TO: "support@outsideinprint.org",
    OPERATIONAL_ALERT_EMAIL: "delivered@resend.dev",
    OPERATIONAL_ENVIRONMENT: "PRODUCTION",
    __testFetch: fetch ?? (() => { throw new Error("NETWORK_FORBIDDEN_IN_TEST"); }),
  };
}

test("operational retries preserve the exact request and the existing idempotency key", async () => {
  const requests = [];
  const env = environment(async (url, request) => {
    requests.push({ url, request });
    return requests.length === 1
      ? Response.json({ name: "service_unavailable" }, { status: 503 })
      : Response.json({ id: "accepted-message" });
  });
  assert.equal((await sendOperationalAlert(env, alert)).status, "RETRY");
  assert.equal((await sendOperationalAlert(env, alert)).status, "SENT");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://api.resend.com/emails");
  assert.equal(requests[0].request.headers["idempotency-key"], "oip-ops-production-physical_maintenance_failed-82998");
  assert.equal(requests[1].request.headers["idempotency-key"], requests[0].request.headers["idempotency-key"]);
  assert.equal(requests[1].request.body, requests[0].request.body);
  const digest = await operationalAlertPayloadDigest(env, alert);
  assert.equal(digest, createHash("sha256").update(requests[0].request.body).digest("hex"));
  assert.match(digest, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(requests[0].request.body, /secret-api-key/u);
});

test("payload digest detects binding or observation changes and excludes API key rotation", async () => {
  const env = environment();
  const original = await operationalAlertPayloadDigest(env, alert);
  assert.equal(await operationalAlertPayloadDigest({ ...env, RESEND_API_KEY: "rotated-secret" }, alert), original);
  for (const update of [
    { DOWNLOAD_EMAIL_FROM: "Other sender <downloads@example.org>" },
    { DOWNLOAD_EMAIL_REPLY_TO: "other-support@example.org" },
    { OPERATIONAL_ALERT_EMAIL: "other-recipient@example.org" },
    { OPERATIONAL_ENVIRONMENT: "SANDBOX" },
  ]) {
    assert.notEqual(await operationalAlertPayloadDigest({ ...env, ...update }, alert), original);
  }
  assert.notEqual(await operationalAlertPayloadDigest(env, { ...alert, occurrences: 2 }), original);
  assert.notEqual(await operationalAlertPayloadDigest(env, { ...alert, lastSeenAt: alert.lastSeenAt + 1 }), original);
});

test("direct fallback has a separate key namespace and identifies its observation window", async () => {
  const requests = [];
  const env = environment(async (_url, request) => {
    requests.push(request);
    return new Response(null, { status: 202 });
  });
  await sendOperationalAlert(env, alert);
  await sendOperationalAlert(env, { ...alert, keyNamespace: "direct" });
  assert.equal(requests[1].headers["idempotency-key"], "oip-ops-direct-production-physical_maintenance_failed-82998");
  const fallback = JSON.parse(requests[1].body);
  assert.match(fallback.text, /Alert window starts:/u);
  assert.match(fallback.text, /timestamps and count are unavailable/u);
  assert.doesNotMatch(fallback.text, /First observed:|Last observed:|Observations in this alert window: 1/u);
  assert.notEqual(await operationalAlertPayloadDigest(env, { ...alert, keyNamespace: "direct" }), await operationalAlertPayloadDigest(env, alert));
});

test("operational transport distinguishes retryable provider failures and permanent conflicts", async () => {
  for (const [httpStatus, name, status, errorCode] of [
    [429, "rate_limit_exceeded", "RETRY", "RESEND_RATE_LIMITED"],
    [503, "service_unavailable", "RETRY", "RESEND_UPSTREAM_FAILED"],
    [409, "concurrent_idempotent_requests", "RETRY", "RESEND_IDEMPOTENCY_IN_PROGRESS"],
    [409, "invalid_idempotent_request", "FAILED", "RESEND_IDEMPOTENCY_CONFLICT"],
    [401, "validation_error", "FAILED", "RESEND_REJECTED"],
    [422, "validation_error", "FAILED", "RESEND_REJECTED"],
  ]) {
    const result = await sendOperationalAlert(environment(async () => Response.json({ name, message: "sensitive raw provider detail" }, { status: httpStatus })), alert);
    assert.deepEqual(result, { status, errorCode, httpStatus, providerErrorCode: name });
    assert.doesNotMatch(JSON.stringify(result), /sensitive/u);
  }
});

test("timeouts and network errors retain only safe classification", async () => {
  for (const [name, expected] of [["TimeoutError", "RESEND_TIMEOUT"], ["AbortError", "RESEND_TIMEOUT"], ["TypeError", "RESEND_UNREACHABLE"]]) {
    const error = new Error("secret-api-key and private-recipient@example.org");
    error.name = name;
    const result = await sendOperationalAlert(environment(async () => { throw error; }), alert);
    assert.deepEqual(result, { status: "RETRY", errorCode: expected, httpStatus: null, providerErrorCode: null });
    assert.doesNotMatch(JSON.stringify(result), /secret-api-key|private-recipient/u);
  }
});

test("untrusted or malformed error bodies cannot leak into diagnostics", async () => {
  for (const body of [
    JSON.stringify({ name: "secret-api-key private-recipient@example.org", message: "secret-api-key" }),
    "malformed secret-api-key",
    JSON.stringify({ name: "invalid_idempotent_request", message: "private".repeat(1000) }),
  ]) {
    const result = await sendOperationalAlert(environment(async () => new Response(body, { status: 409 })), alert);
    assert.deepEqual(result, { status: "FAILED", errorCode: "RESEND_REJECTED", httpStatus: 409, providerErrorCode: null });
    assert.doesNotMatch(JSON.stringify(result), /secret-api-key|private-recipient/u);
  }
});

test("a stalled error body cannot erase the received HTTP status", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start() {},
    cancel() { cancelled = true; },
  });
  const result = await sendOperationalAlert(environment(async () => new Response(body, { status: 503 })), alert);
  assert.deepEqual(result, { status: "RETRY", errorCode: "RESEND_UPSTREAM_FAILED", httpStatus: 503, providerErrorCode: null });
  assert.equal(cancelled, true);
});

test("successful acceptance does not wait for or parse the response body", async () => {
  const body = new ReadableStream({ start() {} });
  const result = await sendOperationalAlert(environment(async () => new Response(body, { status: 200 })), alert);
  assert.deepEqual(result, { status: "SENT", errorCode: null, httpStatus: 200, providerErrorCode: null });
});

test("invalid alert fields are rejected before any network request", async () => {
  for (const update of [
    { alertCode: "private-recipient@example.org" },
    { occurrences: 0 },
    { lastSeenAt: alert.firstSeenAt - 1 },
    { lastSeenAt: Number.MAX_SAFE_INTEGER },
    { keyNamespace: "untrusted" },
  ]) {
    const result = await sendOperationalAlert(environment(), { ...alert, ...update });
    assert.deepEqual(result, { status: "FAILED", errorCode: "OPERATIONAL_ALERT_INPUT_INVALID", httpStatus: null, providerErrorCode: null });
    await assert.rejects(operationalAlertPayloadDigest(environment(), { ...alert, ...update }), /^Error: OPERATIONAL_ALERT_INPUT_INVALID$/u);
  }
});
