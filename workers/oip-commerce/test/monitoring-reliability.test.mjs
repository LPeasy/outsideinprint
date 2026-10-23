import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import * as database from "../src/database.js";
import {
  flushPendingOperationalAlerts,
  OPERATIONAL_MONITOR_KEY,
  processOperationalCanaryMessage,
  runOperationalSchedule,
} from "../src/monitoring.js";
import { operationalAlertPayloadDigest } from "../src/square.js";
import { FakeD1 } from "./fake-d1.mjs";
import { SqliteD1 } from "./sqlite-d1.mjs";

// All network responses are synthetic and injected. An accidentally unmocked
// provider request fails before any network activity.
globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_TEST"); };

const NOW = 1_800_000_000;
const ALERT = "QUEUE_CANARY_SEND_FAILED";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function monitoringEnv(t, overrides = {}) {
  const db = new SqliteD1();
  t.after(() => db.close());
  const env = {
    DB: db,
    EPUB_BUCKET: { get: async () => null },
    JURISDICTION_BUCKET: { get: async () => null },
    OPERATIONAL_CANARY_QUEUE: {
      sent: [],
      async send(body) { this.sent.push(body); },
    },
    OPERATIONS_MONITORING_ENABLED: "true",
    OPERATIONAL_ENVIRONMENT: "SANDBOX",
    OPERATIONAL_HEALTHCHECK_URL: "https://oip-commerce-sandbox.pages.dev/health",
    OPERATIONAL_PRIMARY_QUEUE: "oip-commerce-events-sandbox",
    OPERATIONAL_DLQ_QUEUE: "oip-commerce-events-sandbox-dlq",
    OPERATIONAL_CANARY_STALE_SECONDS: "600",
    OPERATIONAL_FULFILLMENT_STALE_SECONDS: "900",
    OPERATIONAL_ALERT_REPEAT_SECONDS: "21600",
    OPERATIONAL_ALERT_EMAIL: "delivered@resend.dev",
    RESEND_API_KEY: "synthetic-resend-secret",
    DOWNLOAD_EMAIL_FROM: "Outside In Print <downloads@outsideinprint.org>",
    DOWNLOAD_EMAIL_REPLY_TO: "support@outsideinprint.org",
    SQUARE_API_BASE_URL: "https://connect.squareupsandbox.com",
    SQUARE_API_VERSION: "test-version",
    SQUARE_ACCESS_TOKEN: "synthetic-square-secret",
    SQUARE_LOCATION_ID: "synthetic-location",
    __testNow: () => NOW,
    __testFetch: async (url) => {
      assert.equal(url, "https://api.resend.com/emails");
      return Response.json({ id: "synthetic-alert" });
    },
    ...overrides,
  };
  return env;
}

async function seedAlert(db, now = NOW, occurrences = 1) {
  await database.recordOperationalAlert(db, {
    alertCode: ALERT,
    now,
    occurrences,
    repeatSeconds: 21_600,
  });
  return db.row("SELECT * FROM operational_alerts WHERE alert_code = ?", ALERT);
}

function outgoingAlert(row) {
  return {
    alertCode: row.alert_code,
    alertBucket: Number(row.alert_bucket),
    occurrences: Number(row.delivery_occurrence_count),
    firstSeenAt: Number(row.delivery_first_seen_at),
    lastSeenAt: Number(row.delivery_last_seen_at),
  };
}

function operationRows(db, table) {
  assert.match(table, /^operational_[a-z_]+$/u);
  return db.rows(`SELECT * FROM ${table}`);
}

test("D1 metadata counts trigger writes while claim and completion results identify their target row", async (t) => {
  const env = monitoringEnv(t);
  const admitted = await env.DB.prepare(`INSERT INTO operational_heartbeats
    (monitor_key, run_token, last_started_at, status, updated_at, lease_expires_at)
    VALUES (?, ?, ?, 'RUNNING', ?, ?)`)
    .bind("METADATA_PROBE", "metadata-probe-run", NOW, NOW, NOW + 120).run();
  assert.ok(admitted.meta.changes > 1, "D1 counts both the heartbeat and its trigger-created run history");
  const changed = await env.DB.prepare(`UPDATE operational_heartbeats SET lease_expires_at = ?
    WHERE monitor_key = ? RETURNING monitor_key`).bind(NOW + 121, "METADATA_PROBE").all();
  assert.ok(changed.meta.changes > 1, "D1 .all metadata also includes trigger writes");
  assert.equal(changed.results[0].monitor_key, "METADATA_PROBE");

  const record = { monitorKey: OPERATIONAL_MONITOR_KEY, runToken: "metadata-real-run", now: NOW };
  assert.equal(await database.startOperationalHeartbeat(env.DB, record), true);
  assert.equal(await database.renewOperationalHeartbeat(env.DB, { ...record, now: NOW + 1 }), true);
  assert.equal(await database.finishOperationalHeartbeat(env.DB, { ...record, status: "OK", now: NOW + 2 }), true);

  const alert = await seedAlert(env.DB);
  const claim = { alertId: alert.alert_id, claimToken: "metadata-real-attempt", now: NOW };
  const row = await database.claimOperationalAlert(env.DB, claim);
  assert.ok(row);
  const payloadHash = await operationalAlertPayloadDigest(env, outgoingAlert(row));
  assert.equal(await database.setOperationalAlertPayloadHash(env.DB, { ...claim, payloadHash }), true);
  assert.equal(await database.completeOperationalAlertAttempt(env.DB, { ...claim, status: "SENT", httpStatus: 200, now: NOW + 1 }), true);
  assert.equal(env.DB.row("SELECT * FROM operational_alerts").status, "SENT");
});

test("real SQL admits one overlapping monitor and records actual completion time", async (t) => {
  let clock = NOW;
  const entered = deferred();
  const release = deferred();
  const env = monitoringEnv(t, { __testNow: () => clock });
  env.OPERATIONAL_CANARY_QUEUE.send = async function send(body) {
    this.sent.push(body);
    entered.resolve();
    await release.promise;
    clock = NOW + 37;
  };
  const first = runOperationalSchedule(env, NOW);
  let second;
  try {
    await Promise.race([entered.promise, first.then(() => { throw new Error("monitor finished before barrier"); })]);
    second = await runOperationalSchedule(env, NOW + 1);
  } finally {
    release.resolve();
  }
  assert.deepEqual(second, { state: "SKIPPED", reason: "MONITOR_BUSY" });
  assert.equal((await first).state, "OK");
  assert.equal(env.OPERATIONAL_CANARY_QUEUE.sent.length, 1);
  assert.equal(env.DB.row("SELECT COUNT(*) AS count FROM operational_queue_canaries").count, 1);
  const heartbeat = env.DB.row("SELECT * FROM operational_heartbeats WHERE monitor_key = ?", OPERATIONAL_MONITOR_KEY);
  assert.equal(heartbeat.last_started_at, NOW);
  assert.equal(heartbeat.last_completed_at, NOW + 37);
  assert.equal(heartbeat.status, "OK");
});

test("a slow successful lease renewal cannot authorize work after that lease has expired", async (t) => {
  let clock = NOW;
  let fetches = 0;
  const env = monitoringEnv(t, {
    __testNow: () => clock,
    __testFetch: async () => { fetches += 1; throw new Error("expired monitor must perform no provider work"); },
  });
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => {
    const statement = prepare(sql);
    if (!/UPDATE operational_heartbeats SET lease_expires_at/u.test(sql)) return statement;
    return {
      ...statement,
      bind(...args) {
        const bound = statement.bind(...args);
        return {
          ...bound,
          async first() {
            const result = await bound.first();
            clock = NOW + 120;
            return result;
          },
        };
      },
    };
  };
  assert.deepEqual(await runOperationalSchedule(env, NOW), { state: "SKIPPED", reason: "CLAIM_LOST" });
  assert.equal(fetches, 0);
  assert.equal(env.OPERATIONAL_CANARY_QUEUE.sent.length, 0);
  assert.equal(operationRows(env.DB, "operational_queue_canaries").length, 0);
});

test("real SQL permits only one provider call from overlapping alert flushers", async (t) => {
  const entered = deferred();
  const release = deferred();
  const requests = [];
  const env = monitoringEnv(t, {
    __testFetch: async (_url, options) => {
      requests.push(options);
      entered.resolve();
      await release.promise;
      return Response.json({ id: "synthetic-concurrent-alert" });
    },
  });
  await seedAlert(env.DB);
  const first = flushPendingOperationalAlerts(env, NOW);
  let second;
  try {
    await Promise.race([entered.promise, first.then(() => { throw new Error("flush finished before barrier"); })]);
    second = await flushPendingOperationalAlerts(env, NOW + 1);
  } finally {
    release.resolve();
  }
  assert.equal(second.sent, 0);
  assert.equal(second.failed, 0);
  assert.equal((await first).sent, 1);
  assert.equal(requests.length, 1);
  assert.equal(env.DB.row("SELECT * FROM operational_alerts").status, "SENT");
  assert.equal(operationRows(env.DB, "operational_alert_attempts").length, 1);
});

test("a later negative provider result does not report failure after another claim confirmed delivery", async (t) => {
  let clock = NOW;
  const entered = [deferred(), deferred()];
  const release = [deferred(), deferred()];
  const requests = [];
  const env = monitoringEnv(t, {
    __testNow: () => clock,
    __testFetch: async (_url, options) => {
      const index = requests.length;
      requests.push(options);
      entered[index].resolve();
      return release[index].promise;
    },
  });
  await seedAlert(env.DB);
  const first = flushPendingOperationalAlerts(env, NOW);
  let second;
  try {
    await Promise.race([entered[0].promise, first.then(() => { throw new Error("first flush finished before barrier"); })]);
    clock = NOW + 60;
    second = flushPendingOperationalAlerts(env, clock);
    await Promise.race([entered[1].promise, second.then(() => { throw new Error("second flush finished before barrier"); })]);
    release[0].resolve(Response.json({ id: "synthetic-late-confirmed-delivery" }));
    assert.equal((await first).sent, 1);
    release[1].resolve(new Response(null, { status: 503 }));
    const result = await second;
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0, "a stale negative attempt must not turn confirmed delivery into a monitor failure");
  } finally {
    release[0].resolve(Response.json({ id: "synthetic-cleanup" }));
    release[1].resolve(new Response(null, { status: 503 }));
    await Promise.allSettled([first, second].filter(Boolean));
  }
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(requests[0].headers["idempotency-key"], requests[1].headers["idempotency-key"]);
  const alert = env.DB.row("SELECT * FROM operational_alerts");
  assert.equal(alert.status, "SENT");
  assert.equal(alert.delivered_at, NOW + 60);
  const attempts = env.DB.rows("SELECT * FROM operational_alert_attempts ORDER BY started_at");
  assert.deepEqual(attempts.map((row) => [row.status, row.http_status]), [["SENT", 200], ["RETRY", 503]]);
  assert.equal(attempts[1].error_code, "RESEND_UPSTREAM_FAILED");
});

test("new observations cannot change retry payload or key and recovery preserves the failed attempt", async (t) => {
  let clock = NOW;
  const requests = [];
  const env = monitoringEnv(t, {
    __testNow: () => clock,
    __testFetch: async (_url, options) => {
      requests.push(options);
      return requests.length === 1
        ? new Response(null, { status: 503 })
        : Response.json({ id: "synthetic-recovered-alert" });
    },
  });
  await seedAlert(env.DB);
  assert.equal((await flushPendingOperationalAlerts(env, NOW)).failed, 1);
  clock = NOW + 300;
  await seedAlert(env.DB, clock, 3);
  assert.equal((await flushPendingOperationalAlerts(env, clock)).sent, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(requests[0].headers["idempotency-key"], requests[1].headers["idempotency-key"]);
  assert.match(JSON.parse(requests[1].body).text, /Observations in this alert window: 1/u);
  const alert = env.DB.row("SELECT * FROM operational_alerts");
  assert.equal(alert.occurrence_count, 4);
  assert.equal(alert.status, "SENT");
  assert.equal(alert.last_delivery_error_code, "RESEND_UPSTREAM_FAILED");
  const attempts = env.DB.rows("SELECT * FROM operational_alert_attempts ORDER BY started_at");
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].status, "RETRY");
  assert.equal(attempts[0].http_status, 503);
  assert.equal(attempts[0].error_code, "RESEND_UPSTREAM_FAILED");
  assert.equal(attempts[1].status, "SENT");
});

test("expired monitor ownership cannot finish or renew a replacement run", async (t) => {
  const env = monitoringEnv(t);
  const record = { monitorKey: OPERATIONAL_MONITOR_KEY, runToken: "old-run", now: NOW, leaseSeconds: 120 };
  assert.equal(await database.startOperationalHeartbeat(env.DB, record), true);
  assert.equal(await database.startOperationalHeartbeat(env.DB, { ...record, runToken: "busy-run", now: NOW + 119 }), false);
  assert.equal(await database.startOperationalHeartbeat(env.DB, { ...record, runToken: "new-run", now: NOW + 120 }), true);
  assert.equal(await database.renewOperationalHeartbeat(env.DB, { ...record, now: NOW + 121 }), false);
  assert.equal(await database.finishOperationalHeartbeat(env.DB, { ...record, status: "FAILED", errorCode: "OLD_FAILURE", now: NOW + 121 }), false);
  assert.equal(env.DB.row("SELECT * FROM operational_heartbeats").run_token, "new-run");
  const finish = { ...record, runToken: "new-run", status: "OK", errorCode: null, now: NOW + 122 };
  assert.equal(await database.finishOperationalHeartbeat(env.DB, finish), true);
  assert.equal(await database.finishOperationalHeartbeat(env.DB, finish), true, "same completion can be acknowledged twice");
  assert.equal(await database.finishOperationalHeartbeat(env.DB, { ...finish, status: "FAILED", errorCode: "LATE_FAILURE" }), false);
  assert.equal(env.DB.row("SELECT * FROM operational_heartbeats").status, "OK");
  assert.equal(operationRows(env.DB, "operational_monitor_runs").length, 2);
  assert.equal(await database.startOperationalHeartbeat(env.DB, { ...record, runToken: "newest-run", now: NOW + 123 }), true);
  assert.equal(await database.finishOperationalHeartbeat(env.DB, finish), true, "an old committed completion remains acknowledgeable after new admission");
  assert.equal(env.DB.row("SELECT * FROM operational_heartbeats").run_token, "newest-run");
  assert.equal(env.DB.row("SELECT * FROM operational_heartbeats").status, "RUNNING");
});

test("a resumed expired monitor skips while its replacement reports abandonment without a database-outage email", async (t) => {
  let clock = NOW;
  let fetches = 0;
  const entered = deferred();
  const release = deferred();
  const env = monitoringEnv(t, {
    __testNow: () => clock,
    __testFetch: async (_url, options) => {
      fetches += 1;
      assert.match(JSON.parse(options.body).subject, /MONITOR_RUN_ABANDONED/u);
      return Response.json({ id: "synthetic-abandonment" });
    },
  });
  env.OPERATIONAL_CANARY_QUEUE.send = async function send(body) {
    this.sent.push(body);
    if (this.sent.length === 1) {
      entered.resolve();
      await release.promise;
    }
  };
  const first = runOperationalSchedule(env, NOW);
  try {
    await Promise.race([entered.promise, first.then(() => { throw new Error("monitor finished before barrier"); })]);
    clock = NOW + 121;
    assert.equal((await runOperationalSchedule(env, clock)).state, "DEGRADED");
  } finally {
    release.resolve();
  }
  assert.deepEqual(await first, { state: "SKIPPED", reason: "CLAIM_LOST" });
  assert.equal(fetches, 1);
  assert.equal(operationRows(env.DB, "operational_alerts").length, 1);
  assert.equal(env.DB.row("SELECT * FROM operational_heartbeats").status, "DEGRADED");
  assert.deepEqual(env.DB.rows("SELECT status FROM operational_monitor_runs ORDER BY started_at").map((row) => row.status), ["ABANDONED", "DEGRADED"]);
});

test("late provider success terminalizes an expired claim and late failure cannot reopen it", async (t) => {
  const env = monitoringEnv(t);
  const alert = await seedAlert(env.DB);
  const first = { alertId: alert.alert_id, claimToken: "attempt-old", now: NOW, leaseSeconds: 60 };
  const second = { ...first, claimToken: "attempt-new", now: NOW + 60 };
  const claimed = await database.claimOperationalAlert(env.DB, first);
  assert.ok(claimed);
  const payloadHash = await operationalAlertPayloadDigest(env, outgoingAlert(claimed));
  assert.equal(await database.setOperationalAlertPayloadHash(env.DB, { ...first, payloadHash }), true);
  assert.equal(await database.claimOperationalAlert(env.DB, { ...second, now: NOW + 59 }), null);
  assert.ok(await database.claimOperationalAlert(env.DB, second));
  assert.equal(await database.completeOperationalAlertAttempt(env.DB, { ...first, now: NOW + 61, status: "SENT", httpStatus: 200 }), true);
  assert.equal(await database.completeOperationalAlertAttempt(env.DB, {
    ...second, now: NOW + 62, status: "RETRY", errorCode: "RESEND_UPSTREAM_FAILED", httpStatus: 503,
  }), true);
  assert.equal(env.DB.row("SELECT * FROM operational_alerts").status, "SENT");
  assert.equal(env.DB.row("SELECT * FROM operational_alerts").delivered_at, NOW + 61);
  const attempts = operationRows(env.DB, "operational_alert_attempts");
  assert.equal(attempts.find((row) => row.claim_token === first.claimToken).status, "SENT");
  assert.equal(attempts.find((row) => row.claim_token === second.claimToken).status, "RETRY");
  assert.equal(await database.completeOperationalAlertAttempt(env.DB, { ...first, now: NOW + 61, status: "SENT", httpStatus: 200 }), true);
  assert.equal(operationRows(env.DB, "operational_alert_attempts").length, 2);
});

test("idempotency lifetime expiry blocks automatic resend without discarding prior failure", async (t) => {
  let clock = NOW;
  let fetches = 0;
  const env = monitoringEnv(t, {
    __testNow: () => clock,
    __testFetch: async () => { fetches += 1; return new Response(null, { status: 503 }); },
  });
  await seedAlert(env.DB);
  assert.equal((await flushPendingOperationalAlerts(env, NOW)).failed, 1);
  clock = NOW + 24 * 60 * 60;
  await flushPendingOperationalAlerts(env, clock);
  assert.equal(fetches, 1);
  const alert = env.DB.row("SELECT * FROM operational_alerts");
  assert.equal(alert.status, "PENDING");
  assert.equal(alert.retry_blocked, 1);
  assert.equal(await database.countBlockedOperationalAlerts(env.DB), 1);
  assert.equal(operationRows(env.DB, "operational_alert_attempts")[0].error_code, "RESEND_UPSTREAM_FAILED");
});

test("monitor error history survives a healthy run and excludes arbitrary exception details", async (t) => {
  let clock = NOW;
  const env = monitoringEnv(t, { __testNow: () => clock });
  const prepare = env.DB.prepare.bind(env.DB);
  let fail = true;
  env.DB.prepare = (sql) => {
    if (fail && /^\s*UPDATE physical_inventory_reservations/u.test(sql)) {
      fail = false;
      throw new Error("buyer@example.test Bearer synthetic-resend-secret private-order-123");
    }
    return prepare(sql);
  };
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => { errors.push(args.join(" ")); };
  try {
    assert.equal((await runOperationalSchedule(env, NOW)).state, "DEGRADED");
  } finally {
    console.error = originalError;
  }
  assert.ok(errors.length > 0);
  assert.doesNotMatch(errors.join("\n"), /buyer@example|Bearer|synthetic-resend-secret|private-order-123/u);
  const before = operationRows(env.DB, "operational_monitor_errors");
  assert.equal(before.length, 1);
  assert.equal(before[0].stage, "PHYSICAL_RESERVATION_RECONCILE");
  assert.doesNotMatch(JSON.stringify(before), /buyer@example|Bearer|synthetic-resend-secret|private-order-123/u);
  clock = NOW + 300;
  assert.equal((await runOperationalSchedule(env, clock)).state, "OK");
  assert.deepEqual(operationRows(env.DB, "operational_monitor_errors"), before);
  assert.equal(env.DB.row("SELECT * FROM operational_heartbeats").status, "OK");
  assert.equal(operationRows(env.DB, "operational_monitor_runs").length, 2);
});

test("claim expiry during payload persistence prevents a provider request", async (t) => {
  let clock = NOW;
  let fetches = 0;
  const env = monitoringEnv(t, {
    __testNow: () => clock,
    __testFetch: async () => { fetches += 1; return Response.json({ id: "must-not-send" }); },
  });
  await seedAlert(env.DB);
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => {
    if (/UPDATE operational_alerts SET payload_sha256/u.test(sql)) clock = NOW + 61;
    return prepare(sql);
  };
  assert.equal((await flushPendingOperationalAlerts(env, NOW)).sent, 0);
  assert.equal(fetches, 0);
  assert.equal(env.DB.row("SELECT * FROM operational_alerts").status, "PENDING");
  assert.equal(operationRows(env.DB, "operational_alert_attempts")[0].status, "IN_FLIGHT");
  env.DB.prepare = prepare;
  assert.equal((await flushPendingOperationalAlerts(env, clock)).sent, 1);
  assert.equal(fetches, 1);
});

test("direct outage retries use a stable bucket payload and a separate idempotency namespace", async (t) => {
  let clock = NOW;
  const requests = [];
  const errors = [];
  const env = monitoringEnv(t, {
    __testNow: () => clock,
    DB: { prepare() { throw new Error("Bearer synthetic-resend-secret private-buyer@example.test"); } },
    __testFetch: async (_url, options) => {
      requests.push(options);
      return Response.json({ id: "synthetic-direct-alert" });
    },
  });
  const originalError = console.error;
  console.error = (...args) => { errors.push(args.join(" ")); };
  try {
    await assert.rejects(runOperationalSchedule(env, clock), /OPERATIONAL_MONITOR_D1_HEARTBEAT_FAILED/u);
    clock += 300;
    await assert.rejects(runOperationalSchedule(env, clock), /OPERATIONAL_MONITOR_D1_HEARTBEAT_FAILED/u);
  } finally {
    console.error = originalError;
  }
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(requests[0].headers["idempotency-key"], requests[1].headers["idempotency-key"]);
  assert.match(requests[0].headers["idempotency-key"], /^oip-ops-direct-/u);
  const body = JSON.parse(requests[0].body);
  assert.match(body.text, new RegExp(new Date(Math.floor(NOW / 21_600) * 21_600 * 1000).toISOString(), "u"));
  assert.doesNotMatch(errors.join("\n"), /Bearer|synthetic-resend-secret|private-buyer@example/u);

  // A persisted alert for the same code and bucket must not collide with the
  // independent D1-outage fallback's idempotency key.
  const normal = monitoringEnv(t, {
    __testNow: () => clock,
    __testFetch: env.__testFetch,
  });
  await database.recordOperationalAlert(normal.DB, {
    alertCode: "D1_HEARTBEAT_FAILED", now: clock, occurrences: 1, repeatSeconds: 21_600,
  });
  assert.equal((await flushPendingOperationalAlerts(normal, clock)).sent, 1);
  assert.notEqual(requests[0].headers["idempotency-key"], requests[2].headers["idempotency-key"]);
  assert.match(requests[2].headers["idempotency-key"], /^oip-ops-sandbox-/u);
});

test("changed sender configuration blocks a retry instead of reusing a key with a different payload", async (t) => {
  let clock = NOW;
  let fetches = 0;
  const env = monitoringEnv(t, {
    __testNow: () => clock,
    __testFetch: async () => { fetches += 1; return new Response(null, { status: 503 }); },
  });
  await seedAlert(env.DB);
  await flushPendingOperationalAlerts(env, NOW);
  env.DOWNLOAD_EMAIL_REPLY_TO = "changed@example.test";
  clock += 300;
  await flushPendingOperationalAlerts(env, clock);
  assert.equal(fetches, 1);
  assert.equal(env.DB.row("SELECT * FROM operational_alerts").retry_blocked, 1);
  const text = JSON.stringify(operationRows(env.DB, "operational_alert_attempts"));
  assert.doesNotMatch(text, /changed@example|synthetic-resend-secret/u);
});

test("out-of-order observations retain chronological bounds and produce a valid frozen email", async (t) => {
  const requests = [];
  const env = monitoringEnv(t, {
    __testNow: () => NOW + 400,
    __testFetch: async (_url, options) => {
      requests.push(options);
      return Response.json({ id: "synthetic-chronological-alert" });
    },
  });
  await seedAlert(env.DB, NOW + 300, 2);
  await seedAlert(env.DB, NOW - 300, 1);
  await seedAlert(env.DB, NOW + 100, 1);
  const alert = env.DB.row("SELECT * FROM operational_alerts");
  assert.equal(alert.first_seen_at, NOW - 300);
  assert.equal(alert.last_seen_at, NOW + 300);
  assert.equal(alert.occurrence_count, 4);
  assert.equal((await flushPendingOperationalAlerts(env, NOW + 400)).sent, 1);
  assert.match(JSON.parse(requests[0].body).text, new RegExp(`First observed: ${new Date((NOW - 300) * 1000).toISOString()}`, "u"));
  assert.match(JSON.parse(requests[0].body).text, new RegExp(`Last observed: ${new Date((NOW + 300) * 1000).toISOString()}`, "u"));
});

test("heartbeat completion retries the same acknowledgement after transient or ambiguous D1 failure", async (t) => {
  for (const committed of [false, true]) {
    let fetches = 0;
    const env = monitoringEnv(t, {
      __testFetch: async () => { fetches += 1; return Response.json({ id: "synthetic-once-only-alert" }); },
    });
    await seedAlert(env.DB);
    const prepare = env.DB.prepare.bind(env.DB);
    const completions = [];
    let failed = false;
    env.DB.prepare = (sql) => {
      const statement = prepare(sql);
      if (!/UPDATE operational_heartbeats[\s\S]*SET last_completed_at/u.test(sql)) return statement;
      return {
        ...statement,
        bind(...args) {
          completions.push(args);
          const bound = statement.bind(...args);
          return {
            ...bound,
            async first() {
              if (!failed) {
                failed = true;
                if (committed) await bound.first();
                throw new Error("private heartbeat acknowledgement failure synthetic-resend-secret");
              }
              return bound.first();
            },
          };
        },
      };
    };
    assert.equal((await runOperationalSchedule(env, NOW)).state, "OK");
    assert.equal(completions.length, 2);
    assert.deepEqual(completions[0], completions[1]);
    assert.equal(fetches, 1);
    assert.equal(env.OPERATIONAL_CANARY_QUEUE.sent.length, 1);
    assert.equal(env.DB.row("SELECT * FROM operational_heartbeats").status, "OK");
    assert.equal(operationRows(env.DB, "operational_monitor_runs").length, 1);
    assert.equal(operationRows(env.DB, "operational_monitor_errors").length, 0);
  }
});

test("per-row physical maintenance failure preserves its safe stage and provider HTTP status", async (t) => {
  const requests = [];
  const ordersRead = [];
  const logs = [];
  const env = monitoringEnv(t, {
    __testFetch: async (url, options) => {
      if (url === "https://connect.squareupsandbox.com/v2/orders/private-order-123") {
        ordersRead.push("failed");
        return Response.json({ errors: [{ code: "SERVICE_UNAVAILABLE", detail: "private-buyer@example.test synthetic-resend-secret" }] }, { status: 503 });
      }
      if (url === "https://connect.squareupsandbox.com/v2/orders/private-order-456") {
        ordersRead.push("later");
        return Response.json({ order: { id: "private-order-456", state: "OPEN" } });
      }
      assert.equal(url, "https://api.resend.com/emails");
      requests.push(options);
      return Response.json({ id: "synthetic-maintenance-alert" });
    },
  });
  for (const suffix of ["123", "456"]) {
    env.DB.sqlite.prepare(`INSERT INTO checkout_requests
      (request_key, request_kind, request_hash, square_idempotency_key, status, created_at, updated_at)
      VALUES (?, 'PHYSICAL', 'synthetic-hash', 'synthetic-key', 'COMPLETED', ?, ?)`)
      .run(`private-request-${suffix}`, NOW - 1000, NOW - 1000);
    env.DB.sqlite.prepare(`INSERT INTO physical_checkout_bindings
      (request_key, square_payment_link_id, square_order_id, items_json, address_hmac, state_code,
       combined_rate_bps, resolution_method, merchandise_cents, shipping_cents, shipping_tax_cents,
       tax_cents, total_cents, status, created_at, expires_at, updated_at)
      VALUES (?, ?, ?, '[]', 'synthetic-hmac',
        'FL', 600, 'SYNTHETIC', 100, 0, 0, 6, 106, 'LINK_CREATED', ?, ?, ?)`)
      .run(`private-request-${suffix}`, `private-link-${suffix}`, `private-order-${suffix}`,
        NOW - 1000, suffix === "123" ? NOW - 2 : NOW - 1, NOW - 1000);
  }
  const originalError = console.error;
  console.error = (...args) => { logs.push(args.join(" ")); };
  let result;
  try {
    result = await runOperationalSchedule(env, NOW);
  } finally {
    console.error = originalError;
  }
  assert.equal(result.state, "DEGRADED");
  assert.equal(result.maintenance.examined, 2);
  assert.equal(result.maintenance.errors, 1);
  assert.equal(result.maintenance.deferred, 1);
  assert.deepEqual(ordersRead, ["failed", "later"]);
  assert.deepEqual(result.issueCodes, ["PHYSICAL_LINK_EXPIRY_ERROR"]);
  const history = operationRows(env.DB, "operational_monitor_errors");
  assert.equal(history.length, 1);
  assert.equal(history[0].stage, "PHYSICAL_ORDER_READ");
  assert.equal(history[0].error_code, "SQUARE_SERVICE_UNAVAILABLE");
  assert.equal(history[0].http_status, 503);
  assert.equal(operationRows(env.DB, "operational_alerts")[0].status, "SENT");
  assert.doesNotMatch(JSON.stringify(history) + logs.join("\n") + requests[0].body,
    /private-request-|private-order-|private-link-|private-buyer@example|synthetic-resend-secret/u);
});

function failCompletions(db, count) {
  const prepare = db.prepare.bind(db);
  let remaining = count;
  db.prepare = (sql) => {
    if (remaining > 0 && /UPDATE operational_alert_attempts[\s\S]*completed_at/u.test(sql)) {
      remaining -= 1;
      throw new Error("private D1 completion failure with synthetic-resend-secret");
    }
    return prepare(sql);
  };
}

test("a transient completion write failure retries only D1 and never resends the accepted email", async (t) => {
  let fetches = 0;
  const env = monitoringEnv(t, {
    __testFetch: async () => { fetches += 1; return Response.json({ id: "synthetic-accepted" }); },
  });
  await seedAlert(env.DB);
  failCompletions(env.DB, 1);
  assert.equal((await flushPendingOperationalAlerts(env, NOW)).sent, 1);
  assert.equal(fetches, 1);
  assert.equal(env.DB.row("SELECT * FROM operational_alerts").status, "SENT");
  assert.equal(operationRows(env.DB, "operational_alert_attempts").length, 1);
});

test("lost completion writes retain an in-flight attempt and later reuse the exact provider request", async (t) => {
  let clock = NOW;
  const requests = [];
  const env = monitoringEnv(t, {
    __testNow: () => clock,
    __testFetch: async (_url, options) => {
      requests.push(options);
      return Response.json({ id: "synthetic-provider-replay" });
    },
  });
  await seedAlert(env.DB);
  failCompletions(env.DB, 2);
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => { logs.push(args.join(" ")); };
  try {
    await assert.rejects(flushPendingOperationalAlerts(env, NOW), /OPERATIONAL_ALERT_COMPLETION_FAILED/u);
  } finally {
    console.error = originalError;
  }
  const evidence = logs.map((entry) => JSON.parse(entry)).find((entry) => entry.stage === "ALERT_COMPLETION");
  assert.equal(evidence.providerStatus, "SENT");
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.claimToken, operationRows(env.DB, "operational_alert_attempts")[0].claim_token);
  assert.doesNotMatch(logs.join("\n"), /synthetic-resend-secret|private D1 completion/u);
  assert.equal(requests.length, 1);
  assert.equal(env.DB.row("SELECT * FROM operational_alerts").status, "PENDING");
  assert.equal(operationRows(env.DB, "operational_alert_attempts")[0].status, "IN_FLIGHT");
  clock = NOW + 61;
  assert.equal((await flushPendingOperationalAlerts(env, clock)).sent, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(requests[0].headers["idempotency-key"], requests[1].headers["idempotency-key"]);
  assert.equal(env.DB.row("SELECT * FROM operational_alerts").status, "SENT");
  const journal = JSON.stringify(operationRows(env.DB, "operational_alert_attempts"));
  assert.doesNotMatch(journal, /synthetic-resend-secret|private D1 completion/u);
});

test("migration preserves old errors and quarantines retries with no reconstructible payload", async (t) => {
  const db = new SqliteD1({ migrate: false });
  t.after(() => db.close());
  db.migrate({ through: "0004_purchase_measurement.sql" });
  db.sqlite.prepare(`INSERT INTO operational_alerts
    (alert_id, alert_code, alert_bucket, status, occurrence_count, first_seen_at, last_seen_at,
     delivery_attempts, last_delivery_attempt_at, last_delivery_error_code)
    VALUES (?, ?, ?, 'PENDING', 4, ?, ?, 2, ?, 'RESEND_UPSTREAM_FAILED')`)
    .run("legacy-alert", ALERT, Math.floor(NOW / 21_600), NOW, NOW + 300, NOW + 300);
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(directory).filter((name) => name > "0004_purchase_measurement.sql" && name.endsWith(".sql")).sort()) {
    db.sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
  }
  const alert = db.row("SELECT * FROM operational_alerts");
  assert.equal(alert.delivery_attempts, 2);
  assert.equal(alert.last_delivery_error_code, "LEGACY_RETRY_REVIEW_REQUIRED");
  assert.equal(alert.retry_blocked, 1);
  assert.equal(operationRows(db, "operational_alert_attempts")[0].error_code, "RESEND_UPSTREAM_FAILED");
  assert.equal(await database.claimOperationalAlert(db, { alertId: "legacy-alert", claimToken: "unsafe-retry", now: NOW + 600 }), null);
});

test("migration accepts unchanged legacy heartbeat and alert writes before the new consumer starts", async (t) => {
  const db = new SqliteD1({ migrate: false });
  t.after(() => db.close());
  db.migrate({ through: "0004_purchase_measurement.sql" });
  await db.prepare(`INSERT INTO operational_heartbeats
    (monitor_key, run_token, last_started_at, last_completed_at, status, last_error_code, updated_at)
    VALUES (?, 'legacy-seed-run', ?, ?, 'OK', NULL, ?)`)
    .bind(OPERATIONAL_MONITOR_KEY, NOW - 600, NOW - 590, NOW - 590).run();
  await db.prepare(`INSERT INTO operational_alerts
    (alert_id, alert_code, alert_bucket, status, occurrence_count, first_seen_at, last_seen_at,
     delivery_attempts, last_delivery_attempt_at, last_delivery_error_code)
    VALUES ('legacy-alert', ?, ?, 'PENDING', 1, ?, ?, 2, ?, 'RESEND_UPSTREAM_FAILED')`)
    .bind(ALERT, Math.floor(NOW / 21_600), NOW - 600, NOW - 300, NOW - 300).run();
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(directory).filter((name) => name > "0004_purchase_measurement.sql" && name.endsWith(".sql")).sort()) {
    db.sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
  }
  const seededHistory = operationRows(db, "operational_monitor_runs");
  assert.equal(seededHistory.length, 1);

  // These are the deployed consumer's original statements, including its
  // changes===1 checks. Cover both an upsert and an entirely new monitor row.
  for (const monitorKey of [OPERATIONAL_MONITOR_KEY, "LEGACY_FRESH_MONITOR"]) {
    const runToken = `legacy-after-migration:${monitorKey}`;
    const started = await db.prepare(`INSERT INTO operational_heartbeats
      (monitor_key, run_token, last_started_at, last_completed_at, status,
       last_error_code, updated_at)
      VALUES (?, ?, ?, NULL, 'RUNNING', NULL, ?)
      ON CONFLICT(monitor_key) DO UPDATE SET
        run_token = excluded.run_token,
        last_started_at = excluded.last_started_at,
        status = 'RUNNING',
        last_error_code = NULL,
        updated_at = excluded.updated_at`)
      .bind(monitorKey, runToken, NOW, NOW).run();
    assert.equal(started.meta.changes, 1);
    const finished = await db.prepare(`UPDATE operational_heartbeats
      SET last_completed_at = ?, status = ?, last_error_code = ?, updated_at = ?
      WHERE monitor_key = ? AND run_token = ?`)
      .bind(NOW + 1, "OK", null, NOW + 1, monitorKey, runToken).run();
    assert.equal(finished.meta.changes, 1);
    assert.equal(db.row("SELECT * FROM operational_heartbeats WHERE monitor_key = ?", monitorKey).status, "OK");
  }
  assert.deepEqual(operationRows(db, "operational_monitor_runs"), seededHistory,
    "legacy writers have no lease and must not activate modern run-history triggers");

  const failed = await db.prepare(`UPDATE operational_alerts
    SET delivery_attempts = delivery_attempts + 1,
        last_delivery_attempt_at = ?, last_delivery_error_code = ?
    WHERE alert_id = ? AND status = 'PENDING'`)
    .bind(NOW, "RESEND_RATE_LIMITED", "legacy-alert").run();
  assert.equal(failed.meta.changes, 1);
  const sent = await db.prepare(`UPDATE operational_alerts
    SET status = 'SENT', delivery_attempts = delivery_attempts + 1,
        last_delivery_attempt_at = ?, delivered_at = ?, last_delivery_error_code = NULL
    WHERE alert_id = ? AND status = 'PENDING'`)
    .bind(NOW + 1, NOW + 1, "legacy-alert").run();
  assert.equal(sent.meta.changes, 1);
  assert.equal(db.row("SELECT * FROM operational_alerts").status, "SENT");
  assert.equal(db.row("SELECT * FROM operational_alerts").last_delivery_error_code, null);
  assert.equal(operationRows(db, "operational_alert_attempts")[0].error_code, "RESEND_UPSTREAM_FAILED",
    "migration retains the original failure even when the legacy success write clears its summary");

  const modern = { monitorKey: OPERATIONAL_MONITOR_KEY, runToken: "modern-after-migration", now: NOW + 300 };
  assert.equal(await database.startOperationalHeartbeat(db, modern), true);
  assert.equal(await database.renewOperationalHeartbeat(db, { ...modern, now: NOW + 301 }), true);
  assert.equal(await database.finishOperationalHeartbeat(db, { ...modern, now: NOW + 302, status: "OK" }), true);
  const history = operationRows(db, "operational_monitor_runs");
  assert.equal(history.length, 2);
  assert.equal(history.find((row) => row.run_token === modern.runToken).status, "OK");
  assert.equal(history.find((row) => row.run_token === modern.runToken).completed_at, NOW + 302);
});

async function seedAbandonedRun(db, token, at = NOW - 300, monitorKey = OPERATIONAL_MONITOR_KEY) {
  await database.startOperationalHeartbeat(db, { monitorKey, runToken: token, now: at });
  const replacement = { monitorKey, runToken: `replacement:${token}`, now: at + 121 };
  assert.equal(await database.startOperationalHeartbeat(db, replacement), true);
  assert.equal(await database.finishOperationalHeartbeat(db, { ...replacement, now: at + 122, status: "OK" }), true);
}

test("abandoned monitor recovery reports each run once across concurrent and later-window replays", async (t) => {
  const env = monitoringEnv(t);
  await seedAbandonedRun(env.DB, "lost-first", NOW - 900);
  await seedAbandonedRun(env.DB, "lost-second", NOW - 600);
  await seedAbandonedRun(env.DB, "unrelated-lost", NOW - 300, "OTHER_MONITOR");
  const record = { monitorKey: OPERATIONAL_MONITOR_KEY, now: NOW, repeatSeconds: 21_600 };
  const results = await Promise.all([
    database.reportOperationalAbandonedRuns(env.DB, record),
    database.reportOperationalAbandonedRuns(env.DB, record),
  ]);
  assert.deepEqual(results.sort(), [0, 2]);
  const alert = env.DB.row("SELECT * FROM operational_alerts WHERE alert_code = 'MONITOR_RUN_ABANDONED'");
  assert.equal(alert.status, "PENDING");
  assert.equal(alert.occurrence_count, 2);
  const markers = env.DB.rows("SELECT * FROM operational_monitor_errors WHERE stage = 'MONITOR_RECOVERY'");
  assert.equal(markers.length, 2);
  assert.deepEqual(markers.map((row) => row.run_token).sort(), ["lost-first", "lost-second"]);
  assert.ok(markers.every((row) => row.error_code === "MONITOR_LEASE_EXPIRED"));
  assert.equal(await database.reportOperationalAbandonedRuns(env.DB, { ...record, now: NOW + 21_600 }), 0);
  assert.equal(env.DB.row("SELECT COUNT(*) AS count FROM operational_alerts").count, 1);
});

test("abandonment alert and marker commit atomically and survive an acknowledgement lost after commit", async (t) => {
  const env = monitoringEnv(t);
  await seedAbandonedRun(env.DB, "lost-acknowledgement");
  const batch = env.DB.batch.bind(env.DB);
  let loseResponse = true;
  env.DB.batch = async (statements) => {
    const result = await batch(statements);
    if (loseResponse) {
      loseResponse = false;
      throw new Error("synthetic response lost after commit");
    }
    return result;
  };
  const record = { monitorKey: OPERATIONAL_MONITOR_KEY, now: NOW, repeatSeconds: 21_600 };
  await assert.rejects(database.reportOperationalAbandonedRuns(env.DB, record), /synthetic response lost/u);
  assert.equal(await database.reportOperationalAbandonedRuns(env.DB, record), 0);
  assert.equal(env.DB.row("SELECT * FROM operational_alerts").occurrence_count, 1);
  assert.equal(operationRows(env.DB, "operational_monitor_errors").length, 1);
});

test("later abandonment in a sent bucket updates its aggregate without reopening or changing the frozen email", async (t) => {
  let clock = NOW;
  let fetches = 0;
  const env = monitoringEnv(t, { __testNow: () => clock,
    __testFetch: async () => { fetches += 1; return Response.json({ id: "synthetic-frozen-recovery" }); } });
  await seedAbandonedRun(env.DB, "first-bucket-loss");
  const record = { monitorKey: OPERATIONAL_MONITOR_KEY, now: NOW, repeatSeconds: 21_600 };
  assert.equal(await database.reportOperationalAbandonedRuns(env.DB, record), 1);
  assert.equal((await flushPendingOperationalAlerts(env, NOW)).sent, 1);
  const first = env.DB.row("SELECT * FROM operational_alerts");
  await seedAbandonedRun(env.DB, "second-bucket-loss", NOW + 1);
  clock = NOW + 300;
  assert.equal(await database.reportOperationalAbandonedRuns(env.DB, { ...record, now: clock }), 1);
  assert.equal((await flushPendingOperationalAlerts(env, clock)).examined, 0);
  assert.equal(fetches, 1);
  const after = env.DB.row("SELECT * FROM operational_alerts");
  assert.equal(after.occurrence_count, 2);
  for (const field of ["status", "delivery_attempts", "delivered_at", "delivery_occurrence_count",
    "delivery_first_seen_at", "delivery_last_seen_at", "payload_sha256"]) {
    assert.equal(after[field], first[field], `${field} must remain unchanged`);
  }
});

test("abandonment marker failure rolls back the alert and retains existing operational history", async (t) => {
  const env = monitoringEnv(t);
  await seedAbandonedRun(env.DB, "lost-with-history");
  await database.recordOperationalRunError(env.DB, {
    runToken: "lost-with-history", stage: "PHYSICAL_ORDER_READ", errorCode: "SQUARE_UNREACHABLE", now: NOW - 250,
  });
  const existing = await seedAlert(env.DB, NOW - 200);
  const claim = { alertId: existing.alert_id, claimToken: "previous-failure", now: NOW - 200 };
  const row = await database.claimOperationalAlert(env.DB, claim);
  await database.setOperationalAlertPayloadHash(env.DB, {
    ...claim, payloadHash: await operationalAlertPayloadDigest(env, outgoingAlert(row)),
  });
  await database.completeOperationalAlertAttempt(env.DB, {
    ...claim, status: "RETRY", errorCode: "RESEND_UPSTREAM_FAILED", httpStatus: 503, now: NOW - 199,
  });
  await database.createOperationalCanary(env.DB, { canaryId: "historical-stale", now: NOW - 1000 });
  await database.markStaleOperationalCanaries(env.DB, NOW - 600, NOW - 400);
  await database.createOperationalCanary(env.DB, { canaryId: "historical-send-failed", now: NOW - 200 });
  await database.markOperationalCanarySendFailed(env.DB, "historical-send-failed", NOW - 200);
  await database.recordOperationalDlqReceipt(env.DB, { receiptHash: "a".repeat(64), now: NOW - 200 });
  env.DB.sqlite.prepare(`INSERT INTO fulfillment_reviews
    (review_id, event_id, reason_code, details_json, status, created_at)
    VALUES ('preserved-review', 'synthetic-event', 'PHYSICAL_LINK_EXPIRY_ERROR', '{}', 'OPEN', ?)`)
    .run(NOW - 200);
  const tables = ["operational_monitor_runs", "operational_monitor_errors", "operational_alert_attempts",
    "operational_alerts", "operational_queue_canaries", "operational_dlq_receipts", "fulfillment_reviews"];
  const before = Object.fromEntries(tables.map((table) => [table, env.DB.rows(`SELECT * FROM ${table}`)]));
  env.DB.sqlite.exec(`CREATE TRIGGER synthetic_recovery_marker_failure
    BEFORE INSERT ON operational_monitor_errors WHEN NEW.stage = 'MONITOR_RECOVERY'
    BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_RECOVERY_MARKER_FAILURE'); END;`);
  const record = { monitorKey: OPERATIONAL_MONITOR_KEY, now: NOW, repeatSeconds: 21_600 };
  await assert.rejects(database.reportOperationalAbandonedRuns(env.DB, record), /SYNTHETIC_RECOVERY_MARKER_FAILURE/u);
  for (const table of tables) assert.deepEqual(env.DB.rows(`SELECT * FROM ${table}`), before[table]);
  env.DB.sqlite.exec("DROP TRIGGER synthetic_recovery_marker_failure");
  assert.equal(await database.reportOperationalAbandonedRuns(env.DB, record), 1);
  for (const table of tables.filter((name) => !["operational_monitor_errors", "operational_alerts"].includes(name))) {
    assert.deepEqual(env.DB.rows(`SELECT * FROM ${table}`), before[table]);
  }
  assert.deepEqual(env.DB.row("SELECT * FROM operational_alerts WHERE alert_id = ?", existing.alert_id), before.operational_alerts[0]);
  assert.deepEqual(env.DB.rows("SELECT * FROM operational_monitor_errors WHERE stage <> 'MONITOR_RECOVERY'"), before.operational_monitor_errors);
});

test("the next admitted monitor sends abandonment once and a following healthy schedule does not repeat it", async (t) => {
  let clock = NOW;
  const messages = [];
  const env = monitoringEnv(t, {
    __testNow: () => clock,
    __testFetch: async (_url, options) => { messages.push(options); return Response.json({ id: "synthetic-recovery" }); },
  });
  await database.startOperationalHeartbeat(env.DB, {
    monitorKey: OPERATIONAL_MONITOR_KEY, runToken: "cancelled-without-completion", now: NOW - 300,
  });
  const recovered = await runOperationalSchedule(env, clock);
  assert.equal(recovered.state, "DEGRADED");
  assert.ok(recovered.issueCodes.includes("MONITOR_RUN_ABANDONED"));
  assert.equal(messages.length, 1);
  assert.match(JSON.parse(messages[0].body).subject, /MONITOR_RUN_ABANDONED/u);
  const abandoned = env.DB.row("SELECT * FROM operational_monitor_runs WHERE run_token = 'cancelled-without-completion'");
  assert.equal(abandoned.status, "ABANDONED");
  assert.equal(abandoned.last_error_code, "MONITOR_LEASE_EXPIRED");
  const alert = env.DB.row("SELECT * FROM operational_alerts WHERE alert_code = 'MONITOR_RUN_ABANDONED'");
  assert.equal(alert.status, "SENT");
  assert.equal(alert.delivery_attempts, 1);
  clock += 300;
  assert.equal((await runOperationalSchedule(env, clock)).state, "OK");
  assert.equal(messages.length, 1);
  assert.equal(env.DB.row("SELECT * FROM operational_alerts").occurrence_count, 1);
  assert.equal(env.DB.rows("SELECT * FROM operational_monitor_errors WHERE stage = 'MONITOR_RECOVERY'").length, 1);
});

test("exact canary redelivery is idempotent, preserves first timestamps, and cannot match a different queued time", async (t) => {
  const env = monitoringEnv(t);
  const canaryId = "99999999-9999-4999-8999-999999999999";
  await database.createOperationalCanary(env.DB, { canaryId, now: NOW });
  env.DB.sqlite.exec(`CREATE TABLE synthetic_canary_receipts (canary_id TEXT);
    CREATE TRIGGER synthetic_receipt_audit AFTER UPDATE ON operational_queue_canaries
    WHEN NEW.status = 'RECEIVED' BEGIN INSERT INTO synthetic_canary_receipts VALUES (NEW.canary_id); END;`);
  const received = await Promise.all([
    database.receiveOperationalCanary(env.DB, { canaryId, queuedAt: NOW, now: NOW + 1 }),
    database.receiveOperationalCanary(env.DB, { canaryId, queuedAt: NOW, now: NOW + 2 }),
  ]);
  assert.deepEqual(received, [true, true]);
  const first = env.DB.row("SELECT * FROM operational_queue_canaries");
  assert.equal(first.received_at, NOW + 1);
  assert.equal(await database.receiveOperationalCanary(env.DB, { canaryId, queuedAt: NOW, now: NOW + 90 }), true);
  assert.deepEqual(env.DB.row("SELECT * FROM operational_queue_canaries"), first);
  assert.equal(env.DB.row("SELECT COUNT(*) AS count FROM synthetic_canary_receipts").count, 1);
  assert.equal(await database.receiveOperationalCanary(env.DB, { canaryId, queuedAt: NOW + 1, now: NOW + 100 }), false);
  assert.equal(await database.receiveOperationalCanary(env.DB, { canaryId: "unknown", queuedAt: NOW, now: NOW + 100 }), false);
  assert.deepEqual(env.DB.row("SELECT * FROM operational_queue_canaries"), first);
});

test("a committed canary receipt with a lost acknowledgement retries without creating an unmatched alert", async (t) => {
  const env = monitoringEnv(t);
  const canaryId = "88888888-8888-4888-8888-888888888888";
  await database.createOperationalCanary(env.DB, { canaryId, now: NOW });
  const prepare = env.DB.prepare.bind(env.DB);
  let loseResponse = true;
  env.DB.prepare = (sql) => {
    const statement = prepare(sql);
    if (!/^\s*UPDATE operational_queue_canaries\s+SET status = 'RECEIVED'/u.test(sql)) return statement;
    const bind = statement.bind.bind(statement);
    statement.bind = (...args) => {
      const bound = bind(...args);
      const first = bound.first.bind(bound);
      bound.first = async () => {
        const result = await first();
        if (loseResponse) { loseResponse = false; throw new Error("synthetic receipt acknowledgement lost"); }
        return result;
      };
      return bound;
    };
    return statement;
  };
  let acknowledged = 0;
  let retried = 0;
  const message = { body: { kind: "OIP_OPERATIONAL_CANARY_V1", canaryId, queuedAt: NOW },
    ack() { acknowledged += 1; }, retry() { retried += 1; } };
  assert.equal((await processOperationalCanaryMessage(message, env, NOW + 1)).state, "CANARY_RETRY");
  const first = env.DB.row("SELECT * FROM operational_queue_canaries");
  assert.equal((await processOperationalCanaryMessage(message, env, NOW + 31)).state, "CANARY_RECEIVED");
  assert.equal(acknowledged, 1);
  assert.equal(retried, 1);
  assert.deepEqual(env.DB.row("SELECT * FROM operational_queue_canaries"), first);
  assert.equal(env.DB.row("SELECT COUNT(*) AS count FROM operational_alerts").count, 0);
});

test("FakeD1 recovery batches and duplicate canary receipts follow the database contracts", async () => {
  const db = new FakeD1();
  await seedAbandonedRun(db, "fake-lost");
  const record = { monitorKey: OPERATIONAL_MONITOR_KEY, now: NOW, repeatSeconds: 21_600 };
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const statement = prepare(sql);
    if (sql.includes("INSERT INTO operational_monitor_errors")) {
      statement.all = async () => { throw new Error("SYNTHETIC_FAKE_MARKER_FAILURE"); };
    }
    return statement;
  };
  await assert.rejects(database.reportOperationalAbandonedRuns(db, record), /SYNTHETIC_FAKE_MARKER_FAILURE/u);
  assert.equal(db.operationalAlerts.size, 0);
  assert.equal(db.operationalMonitorErrors.length, 0);
  db.prepare = prepare;
  assert.deepEqual((await Promise.all([
    database.reportOperationalAbandonedRuns(db, record), database.reportOperationalAbandonedRuns(db, record),
  ])).sort(), [0, 1]);
  assert.equal([...db.operationalAlerts.values()][0].occurrence_count, 1);
  assert.equal(db.operationalMonitorErrors.length, 1);
  await database.createOperationalCanary(db, { canaryId: "fake-canary", now: NOW });
  assert.equal(await database.receiveOperationalCanary(db, { canaryId: "fake-canary", queuedAt: NOW, now: NOW + 1 }), true);
  const first = { ...db.operationalCanaries.get("fake-canary") };
  assert.equal(await database.receiveOperationalCanary(db, { canaryId: "fake-canary", queuedAt: NOW, now: NOW + 90 }), true);
  assert.equal(await database.receiveOperationalCanary(db, { canaryId: "fake-canary", queuedAt: NOW + 1, now: NOW + 90 }), false);
  assert.deepEqual(db.operationalCanaries.get("fake-canary"), first);
});
