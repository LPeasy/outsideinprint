import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import {
  flushPendingOperationalAlerts,
  OPERATIONAL_MONITOR_KEY,
  runOperationalSchedule,
} from "../src/monitoring.js";
import { handleConsumerQueueBatch } from "../src/queue.js";
import { FakeD1 } from "./fake-d1.mjs";

function monitoringEnv(overrides = {}) {
  const queue = {
    sent: [],
    async send(body) { this.sent.push(body); },
  };
  return Object.assign({
    DB: new FakeD1(),
    EPUB_BUCKET: { get: async () => null },
    JURISDICTION_BUCKET: { get: async () => null },
    OPERATIONAL_CANARY_QUEUE: queue,
    OPERATIONS_MONITORING_ENABLED: "true",
    OPERATIONAL_ENVIRONMENT: "SANDBOX",
    OPERATIONAL_HEALTHCHECK_URL: "https://oip-commerce-sandbox.pages.dev/health",
    OPERATIONAL_PRIMARY_QUEUE: "oip-commerce-events-sandbox",
    OPERATIONAL_DLQ_QUEUE: "oip-commerce-events-sandbox-dlq",
    OPERATIONAL_CANARY_STALE_SECONDS: "600",
    OPERATIONAL_FULFILLMENT_STALE_SECONDS: "900",
    OPERATIONAL_ALERT_REPEAT_SECONDS: "21600",
    OPERATIONAL_ALERT_EMAIL: "delivered@resend.dev",
    RESEND_API_KEY: "test-resend-key",
    DOWNLOAD_EMAIL_FROM: "Outside In Print <downloads@outsideinprint.org>",
    DOWNLOAD_EMAIL_REPLY_TO: "support@outsideinprint.org",
    SQUARE_API_BASE_URL: "https://connect.squareupsandbox.com",
    SQUARE_API_VERSION: "test-version",
    SQUARE_ACCESS_TOKEN: "test-square-token",
    SQUARE_LOCATION_ID: "test-location",
    __testFetch: async (url) => {
      if (url === "https://api.resend.com/emails") return Response.json({ id: "alert-1" });
      throw new Error(`unexpected request: ${url}`);
    },
  }, overrides);
}

function queueMessage(body, id = crypto.randomUUID()) {
  return {
    id,
    body,
    acked: false,
    retried: false,
    ack() { this.acked = true; },
    retry() { this.retried = true; },
  };
}

test("Task 2 health proves closed gates and absent webhook-signature binding", async () => {
  const env = monitoringEnv({
    PUBLIC_HOST: "downloads.outsideinprint.org",
    SUPPORT_CHECKOUT_ENABLED: "false",
    CUSTOM_MONTHLY_ENABLED: "false",
    EPUB_ENABLED_SKUS: "",
    PAPERBACK_ENABLED_SKUS: "",
  });
  const response = await handleRequest(new Request("https://downloads.outsideinprint.org/health"), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.task2_safe, true);
  assert.equal(payload.operational_monitor_status, "PENDING");

  const unsafe = await handleRequest(
    new Request("https://downloads.outsideinprint.org/health"),
    { ...env, SQUARE_WEBHOOK_SIGNATURE_KEY: "must-stay-absent-in-task-2" },
  );
  assert.equal((await unsafe.json()).task2_safe, false);
});

test("five-minute monitor avoids Pages and global fetch while preserving heartbeat and canary", async () => {
  const now = 1_800_000_000;
  const injectedFetches = [];
  const globalFetches = [];
  const env = monitoringEnv({
    __testFetch: async (...args) => {
      injectedFetches.push(args);
      throw new Error("scheduled monitor must not make an injected fetch");
    },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    globalFetches.push(args);
    throw new Error("scheduled monitor must not make a global fetch");
  };
  let result;
  try {
    result = await runOperationalSchedule(env, now);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(result.state, "OK");
  assert.deepEqual(injectedFetches, []);
  assert.deepEqual(globalFetches, []);
  assert.equal(env.OPERATIONAL_CANARY_QUEUE.sent.length, 1);
  assert.deepEqual(Object.keys(env.OPERATIONAL_CANARY_QUEUE.sent[0]).sort(), [
    "canaryId",
    "kind",
    "queuedAt",
  ]);
  const heartbeat = env.DB.operationalHeartbeats.get(OPERATIONAL_MONITOR_KEY);
  assert.equal(heartbeat.status, "OK");
  assert.equal(heartbeat.last_completed_at, now);
  assert.deepEqual(result.maintenance, {
    examined: 0,
    expired: 0,
    deferred: 0,
    errors: 0,
    orphaned: 0,
  });

  const message = queueMessage(env.OPERATIONAL_CANARY_QUEUE.sent[0]);
  await handleConsumerQueueBatch({
    queue: env.OPERATIONAL_PRIMARY_QUEUE,
    messages: [message],
  }, env);
  assert.equal(message.acked, true);
  assert.equal(message.retried, false);
  assert.equal(env.DB.operationalCanaries.get(message.body.canaryId).status, "RECEIVED");
});

test("DLQ consumer never reads commerce payload and sends only a sanitized aggregate alert", async () => {
  const requests = [];
  const env = monitoringEnv({
    __testFetch: async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      requests.push(options);
      return Response.json({ id: "alert-dlq" });
    },
  });
  const message = queueMessage(undefined, "queue-message-1");
  Object.defineProperty(message, "body", {
    get() { throw new Error("DLQ body must not be read"); },
  });
  const result = await handleConsumerQueueBatch({
    queue: env.OPERATIONAL_DLQ_QUEUE,
    messages: [message],
  }, env);
  assert.equal(result.recorded, 1);
  assert.equal(message.acked, true);
  assert.equal(env.DB.operationalDlqReceipts.size, 1);
  const alert = [...env.DB.operationalAlerts.values()][0];
  assert.equal(alert.alert_code, "DLQ_MESSAGE_RECEIVED");
  assert.equal(alert.status, "SENT");
  const outbound = JSON.parse(requests[0].body);
  assert.match(outbound.subject, /DLQ_MESSAGE_RECEIVED/u);
  assert.doesNotMatch(JSON.stringify(outbound), /queue-message-1|must-not-be-read/u);
});

test("Resend alert self-failure leaves a pending D1 alert and acknowledges recorded DLQ payload", async () => {
  const keys = [];
  const env = monitoringEnv({
    __testFetch: async (_url, options) => {
      keys.push(options.headers["idempotency-key"]);
      return new Response(null, { status: 503 });
    },
  });
  const message = queueMessage({ private: "must-not-be-read" }, "queue-message-2");
  await assert.rejects(
    handleConsumerQueueBatch({ queue: env.OPERATIONAL_DLQ_QUEUE, messages: [message] }, env),
    /OPERATIONAL_ALERT_DELIVERY_FAILED/u,
  );
  assert.equal(message.acked, true);
  const alert = [...env.DB.operationalAlerts.values()][0];
  assert.equal(alert.status, "PENDING");
  assert.equal(alert.last_delivery_error_code, "RESEND_UPSTREAM_FAILED");

  env.__testFetch = async (_url, options) => {
    keys.push(options.headers["idempotency-key"]);
    return Response.json({ id: "alert-retry" });
  };
  const delivery = await flushPendingOperationalAlerts(env, 1_800_000_300);
  assert.equal(delivery.sent, 1);
  assert.equal(alert.status, "SENT");
  assert.equal(keys[0], keys[1]);
});

test("monitor detects stale and failed initial and admin-resend fulfillment states without identifiers", async () => {
  const now = 1_800_000_000;
  const outbound = [];
  const env = monitoringEnv({
    __testFetch: async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      outbound.push(JSON.parse(options.body));
      return Response.json({ id: `alert-${outbound.length}` });
    },
  });
  const base = {
    status: "ACTIVE",
    created_at: now - 2_000,
    payment_id: "private-payment-id",
    order_id: "private-order-id",
    buyer_email_sha256: "private-email-hash",
  };
  env.DB.fulfillments.set("initial-failed", {
    ...base,
    email_delivery_status: "FAILED",
    resend_status: null,
  });
  env.DB.fulfillments.set("initial-stale", {
    ...base,
    email_delivery_status: "PENDING",
    resend_status: null,
  });
  env.DB.fulfillments.set("resend-failed", {
    ...base,
    email_delivery_status: "SENT",
    resend_status: "FAILED",
  });
  env.DB.fulfillments.set("resend-stale", {
    ...base,
    email_delivery_status: "SENT",
    resend_status: "PENDING",
    resend_processing_started_at: now - 2_000,
  });

  const result = await runOperationalSchedule(env, now);
  assert.equal(result.state, "DEGRADED");
  assert.deepEqual(new Set(result.issueCodes), new Set([
    "FULFILLMENT_EMAIL_FAILED",
    "FULFILLMENT_EMAIL_STALE",
    "FULFILLMENT_RESEND_FAILED",
    "FULFILLMENT_RESEND_STALE",
  ]));
  assert.equal(outbound.length, 4);
  const serialized = JSON.stringify(outbound);
  assert.doesNotMatch(serialized, /private-payment-id|private-order-id|private-email-hash/u);
});

test("D1 heartbeat failure sends a direct sanitized Resend alert and throws a Worker signal", async () => {
  const outbound = [];
  const env = monitoringEnv({
    DB: { prepare() { throw new Error("private D1 failure detail"); } },
    __testFetch: async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      outbound.push(JSON.parse(options.body));
      return Response.json({ id: "direct-alert" });
    },
  });
  await assert.rejects(
    runOperationalSchedule(env, 1_800_000_000),
    /OPERATIONAL_MONITOR_D1_HEARTBEAT_FAILED/u,
  );
  assert.equal(outbound.length, 1);
  assert.match(outbound[0].subject, /D1_HEARTBEAT_FAILED/u);
  assert.doesNotMatch(JSON.stringify(outbound), /private D1 failure detail/u);
});

test("an overdue primary Queue canary becomes stale and raises an aggregate alert", async () => {
  const now = 1_800_000_000;
  const outbound = [];
  const env = monitoringEnv({
    __testFetch: async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      outbound.push(JSON.parse(options.body));
      return Response.json({ id: "stale-alert" });
    },
  });
  env.DB.operationalCanaries.set("stale-canary", {
    canary_id: "stale-canary",
    status: "QUEUED",
    queued_at: now - 601,
    received_at: null,
    updated_at: now - 601,
  });
  const result = await runOperationalSchedule(env, now);
  assert.equal(result.staleCanaries, 1);
  assert.equal(env.DB.operationalCanaries.get("stale-canary").status, "STALE");
  assert.match(outbound[0].subject, /QUEUE_CANARY_STALE/u);
});

test("invalid and unmatched canaries are acknowledged without persisting their payload identifiers", async () => {
  const env = monitoringEnv();
  const privateIdentifier = "private-order-shaped-identifier";
  const invalid = queueMessage({
    kind: "OIP_OPERATIONAL_CANARY_V1",
    canaryId: privateIdentifier,
    queuedAt: 1_800_000_000,
    extra: "must-not-be-stored",
  });
  await handleConsumerQueueBatch({
    queue: env.OPERATIONAL_PRIMARY_QUEUE,
    messages: [invalid],
  }, env);
  assert.equal(invalid.acked, true);

  const unmatched = queueMessage({
    kind: "OIP_OPERATIONAL_CANARY_V1",
    canaryId: crypto.randomUUID(),
    queuedAt: 1_800_000_000,
  });
  await handleConsumerQueueBatch({
    queue: env.OPERATIONAL_PRIMARY_QUEUE,
    messages: [unmatched],
  }, env);
  assert.equal(unmatched.acked, true);
  const serialized = JSON.stringify([...env.DB.operationalAlerts.values()]);
  assert.match(serialized, /QUEUE_CANARY_MESSAGE_INVALID/u);
  assert.match(serialized, /QUEUE_CANARY_RECEIPT_UNMATCHED/u);
  assert.doesNotMatch(serialized, /private-order-shaped-identifier|must-not-be-stored/u);
});

test("enabled monitoring with a missing runtime binding fails before side effects", async () => {
  for (const binding of [
    "OPERATIONAL_HEALTHCHECK_URL",
    "OPERATIONAL_ALERT_EMAIL",
    "RESEND_API_KEY",
  ]) {
    const env = monitoringEnv();
    delete env[binding];
    await assert.rejects(runOperationalSchedule(env, 1_800_000_000));
    assert.equal(env.DB.operationalHeartbeats.size, 0, binding);
    assert.equal(env.OPERATIONAL_CANARY_QUEUE.sent.length, 0, binding);
  }
});

test("enabled monitoring still validates the external health-probe URL without fetching it", async () => {
  const env = monitoringEnv({
    OPERATIONAL_HEALTHCHECK_URL: "https://oip-commerce-sandbox.pages.dev/not-health",
    __testFetch: async () => { throw new Error("invalid config must fail before fetch"); },
  });
  await assert.rejects(
    runOperationalSchedule(env, 1_800_000_000),
    /OPERATIONAL_HEALTHCHECK_URL_INVALID/u,
  );
  assert.equal(env.DB.operationalHeartbeats.size, 0);
  assert.equal(env.OPERATIONAL_CANARY_QUEUE.sent.length, 0);
});

test("an unexpected Queue source is retried and rejected", async () => {
  const env = monitoringEnv();
  let retried = false;
  await assert.rejects(
    handleConsumerQueueBatch({
      queue: "cross-environment-or-unknown-queue",
      messages: [],
      retryAll() { retried = true; },
    }, env),
    /QUEUE_SOURCE_UNEXPECTED/u,
  );
  assert.equal(retried, true);
});

test("disabled bootstrap monitoring performs no D1, Queue, health, Square, or Resend work", async () => {
  const env = monitoringEnv({
    OPERATIONS_MONITORING_ENABLED: "false",
    DB: { prepare() { throw new Error("D1 must not run"); } },
    OPERATIONAL_CANARY_QUEUE: { send() { throw new Error("Queue must not run"); } },
    __testFetch: async () => { throw new Error("fetch must not run"); },
  });
  assert.deepEqual(await runOperationalSchedule(env, 1_800_000_000), { state: "DISABLED" });
});
