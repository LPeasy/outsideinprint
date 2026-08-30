import {
  cleanupOperationalCanaries,
  countFulfillmentDeliveryIssues,
  createOperationalCanary,
  finishOperationalHeartbeat,
  getOperationalHealthSnapshot,
  listPendingOperationalAlerts,
  markOperationalAlertFailed,
  markOperationalAlertSent,
  markOperationalCanaryQueued,
  markOperationalCanarySendFailed,
  markStaleOperationalCanaries,
  receiveOperationalCanary,
  recordOperationalAlert,
  recordOperationalDlqReceipt,
  startOperationalHeartbeat,
} from "./database.js";
import { sha256Hex } from "./crypto.js";
import { parseBoolean, requireBinding } from "./http.js";
import { expireUnusedPhysicalLinks } from "./maintenance.js";
import { sendOperationalAlert } from "./square.js";

export const OPERATIONAL_CANARY_KIND = "OIP_OPERATIONAL_CANARY_V1";
export const OPERATIONAL_MONITOR_KEY = "TASK2_COMMERCE_OPERATIONS";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function boundedInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name}_INVALID`);
  }
  return parsed;
}

function validateQueueName(value, bindingName) {
  const name = String(requireBinding({ value }, "value"));
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(name)) {
    throw new Error(`${bindingName}_INVALID`);
  }
  return name;
}

export function operationalQueueNames(env) {
  const primary = validateQueueName(env.OPERATIONAL_PRIMARY_QUEUE, "OPERATIONAL_PRIMARY_QUEUE");
  const dlq = validateQueueName(env.OPERATIONAL_DLQ_QUEUE, "OPERATIONAL_DLQ_QUEUE");
  if (primary === dlq) throw new Error("OPERATIONAL_QUEUE_NAMES_CONFLICT");
  return { primary, dlq };
}

function operationalConfig(env) {
  const enabled = parseBoolean(env.OPERATIONS_MONITORING_ENABLED, false);
  if (!enabled) return { enabled: false };
  requireBinding(env, "DB");
  requireBinding(env, "OPERATIONAL_CANARY_QUEUE");
  requireBinding(env, "RESEND_API_KEY");
  requireBinding(env, "DOWNLOAD_EMAIL_FROM");
  requireBinding(env, "DOWNLOAD_EMAIL_REPLY_TO");
  const alertEmail = String(requireBinding(env, "OPERATIONAL_ALERT_EMAIL")).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(alertEmail) || alertEmail.length > 320) {
    throw new Error("OPERATIONAL_ALERT_EMAIL_INVALID");
  }
  const environment = String(requireBinding(env, "OPERATIONAL_ENVIRONMENT"));
  if (!["SANDBOX", "PRODUCTION"].includes(environment)) {
    throw new Error("OPERATIONAL_ENVIRONMENT_INVALID");
  }
  const healthUrl = new URL(String(requireBinding(env, "OPERATIONAL_HEALTHCHECK_URL")));
  if (
    healthUrl.protocol !== "https:" || healthUrl.pathname !== "/health" ||
    healthUrl.username || healthUrl.password || healthUrl.search || healthUrl.hash
  ) {
    throw new Error("OPERATIONAL_HEALTHCHECK_URL_INVALID");
  }
  const queues = operationalQueueNames(env);
  return {
    enabled: true,
    environment,
    healthUrl: healthUrl.toString(),
    ...queues,
    canaryStaleSeconds: boundedInteger(
      env.OPERATIONAL_CANARY_STALE_SECONDS,
      "OPERATIONAL_CANARY_STALE_SECONDS",
      300,
      3600,
    ),
    fulfillmentStaleSeconds: boundedInteger(
      env.OPERATIONAL_FULFILLMENT_STALE_SECONDS,
      "OPERATIONAL_FULFILLMENT_STALE_SECONDS",
      300,
      86400,
    ),
    alertRepeatSeconds: boundedInteger(
      env.OPERATIONAL_ALERT_REPEAT_SECONDS,
      "OPERATIONAL_ALERT_REPEAT_SECONDS",
      3600,
      86400,
    ),
  };
}

async function noteIssue(env, config, alertCode, now, occurrences = 1) {
  await recordOperationalAlert(env.DB, {
    alertCode,
    now,
    occurrences,
    repeatSeconds: config.alertRepeatSeconds,
  });
}

export async function flushPendingOperationalAlerts(env, now = nowSeconds(), limit = 10) {
  const rows = await listPendingOperationalAlerts(env.DB, limit);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    let delivery;
    try {
      delivery = await sendOperationalAlert(env, {
        alertCode: row.alert_code,
        alertBucket: Number(row.alert_bucket),
        occurrences: Number(row.occurrence_count),
        firstSeenAt: Number(row.first_seen_at),
        lastSeenAt: Number(row.last_seen_at),
      });
    } catch {
      delivery = { status: "RETRY", errorCode: "OPERATIONAL_ALERT_CHANNEL_UNAVAILABLE" };
    }
    if (delivery.status === "SENT") {
      if (!(await markOperationalAlertSent(env.DB, row.alert_id, now))) {
        throw new Error("OPERATIONAL_ALERT_STATE_LOST");
      }
      sent += 1;
    } else {
      const code = /^[A-Z0-9_]{3,64}$/u.test(String(delivery.errorCode || ""))
        ? delivery.errorCode
        : "OPERATIONAL_ALERT_DELIVERY_FAILED";
      if (!(await markOperationalAlertFailed(env.DB, row.alert_id, code, now))) {
        throw new Error("OPERATIONAL_ALERT_STATE_LOST");
      }
      failed += 1;
    }
  }
  return { examined: rows.length, sent, failed };
}

async function sendDirectMonitorFailure(env, config, alertCode, now) {
  const bucket = Math.floor(now / config.alertRepeatSeconds);
  try {
    return await sendOperationalAlert(env, {
      alertCode,
      alertBucket: bucket,
      occurrences: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  } catch {
    return { status: "RETRY", errorCode: "OPERATIONAL_ALERT_CHANNEL_UNAVAILABLE" };
  }
}

async function issueQueueCanary(env, config, now) {
  const canaryId = crypto.randomUUID();
  if (!(await createOperationalCanary(env.DB, { canaryId, now }))) {
    throw new Error("QUEUE_CANARY_STATE_CONFLICT");
  }
  try {
    await env.OPERATIONAL_CANARY_QUEUE.send({
      kind: OPERATIONAL_CANARY_KIND,
      canaryId,
      queuedAt: now,
    });
  } catch {
    await markOperationalCanarySendFailed(env.DB, canaryId, now);
    await noteIssue(env, config, "QUEUE_CANARY_SEND_FAILED", now);
    return { sent: false };
  }
  await markOperationalCanaryQueued(env.DB, canaryId, now);
  return { sent: true };
}

export async function runOperationalSchedule(env, now = nowSeconds()) {
  const config = operationalConfig(env);
  if (!config.enabled) return { state: "DISABLED" };

  const runToken = crypto.randomUUID();
  try {
    await startOperationalHeartbeat(env.DB, {
      monitorKey: OPERATIONAL_MONITOR_KEY,
      runToken,
      now,
    });
  } catch {
    await sendDirectMonitorFailure(env, config, "D1_HEARTBEAT_FAILED", now);
    throw new Error("OPERATIONAL_MONITOR_D1_HEARTBEAT_FAILED");
  }

  const issueCodes = [];
  let delivery = { examined: 0, sent: 0, failed: 0 };
  let staleCanaries = 0;
  let fulfillmentIssues = null;
  let maintenance = null;
  try {
    await cleanupOperationalCanaries(env.DB, now - (7 * 24 * 60 * 60), 500);

    staleCanaries = await markStaleOperationalCanaries(
      env.DB,
      now - config.canaryStaleSeconds,
      now,
    );
    if (staleCanaries > 0) {
      issueCodes.push("QUEUE_CANARY_STALE");
      await noteIssue(env, config, "QUEUE_CANARY_STALE", now, staleCanaries);
    }

    fulfillmentIssues = await countFulfillmentDeliveryIssues(
      env.DB,
      now - config.fulfillmentStaleSeconds,
    );
    const fulfillmentAlerts = [
      ["FULFILLMENT_EMAIL_FAILED", fulfillmentIssues.emailFailed],
      ["FULFILLMENT_EMAIL_STALE", fulfillmentIssues.emailStale],
      ["FULFILLMENT_RESEND_FAILED", fulfillmentIssues.resendFailed],
      ["FULFILLMENT_RESEND_STALE", fulfillmentIssues.resendStale],
    ];
    for (const [code, count] of fulfillmentAlerts) {
      if (count < 1) continue;
      issueCodes.push(code);
      await noteIssue(env, config, code, now, count);
    }

    try {
      maintenance = await expireUnusedPhysicalLinks(env, now);
      if (maintenance.errors > 0) {
        issueCodes.push("PHYSICAL_LINK_EXPIRY_ERROR");
        await noteIssue(env, config, "PHYSICAL_LINK_EXPIRY_ERROR", now, maintenance.errors);
      }
      if (maintenance.orphaned > 0) {
        issueCodes.push("PHYSICAL_ORPHANED_REVIEW");
        await noteIssue(env, config, "PHYSICAL_ORPHANED_REVIEW", now, maintenance.orphaned);
      }
    } catch {
      issueCodes.push("PHYSICAL_MAINTENANCE_FAILED");
      await noteIssue(env, config, "PHYSICAL_MAINTENANCE_FAILED", now);
    }

    const canary = await issueQueueCanary(env, config, now);
    if (!canary.sent) issueCodes.push("QUEUE_CANARY_SEND_FAILED");

    delivery = await flushPendingOperationalAlerts(env, now);
    const status = issueCodes.length > 0 || delivery.failed > 0 ? "DEGRADED" : "OK";
    const errorCode = delivery.failed > 0
      ? "OPERATIONAL_ALERT_DELIVERY_PENDING"
      : issueCodes[0] || null;
    const finished = await finishOperationalHeartbeat(env.DB, {
      monitorKey: OPERATIONAL_MONITOR_KEY,
      runToken,
      status,
      errorCode,
      now,
    });
    if (!finished) throw new Error("OPERATIONAL_HEARTBEAT_CLAIM_LOST");
  } catch {
    let d1RecoverySucceeded = false;
    try {
      await noteIssue(env, config, "OPERATIONAL_MONITOR_RUN_FAILED", now);
      await flushPendingOperationalAlerts(env, now);
      d1RecoverySucceeded = await finishOperationalHeartbeat(env.DB, {
        monitorKey: OPERATIONAL_MONITOR_KEY,
        runToken,
        status: "FAILED",
        errorCode: "OPERATIONAL_MONITOR_RUN_FAILED",
        now,
      });
    } catch {
      // The direct alert below is the only in-stack path left when D1 cannot persist state.
    }
    if (!d1RecoverySucceeded) {
      await sendDirectMonitorFailure(env, config, "D1_OPERATION_FAILED", now);
    }
    throw new Error("OPERATIONAL_MONITOR_RUN_FAILED");
  }

  if (delivery.failed > 0) {
    // Preserve the pending D1 alert, and also expose the self-failure through
    // Cloudflare's failed scheduled-invocation signal without leaking details.
    throw new Error("OPERATIONAL_ALERT_DELIVERY_FAILED");
  }
  return {
    state: issueCodes.length > 0 ? "DEGRADED" : "OK",
    issueCodes,
    staleCanaries,
    fulfillmentIssues,
    maintenance,
    alertsSent: delivery.sent,
  };
}

export async function processOperationalCanaryMessage(message, env, now = nowSeconds()) {
  const config = {
    alertRepeatSeconds: boundedInteger(
      env.OPERATIONAL_ALERT_REPEAT_SECONDS,
      "OPERATIONAL_ALERT_REPEAT_SECONDS",
      3600,
      86400,
    ),
  };
  const body = message?.body;
  const keys = body && typeof body === "object" && !Array.isArray(body)
    ? Object.keys(body).sort()
    : [];
  const valid =
    keys.join(",") === "canaryId,kind,queuedAt" &&
    body.kind === OPERATIONAL_CANARY_KIND &&
    typeof body.canaryId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(body.canaryId) &&
    Number.isSafeInteger(body.queuedAt) && body.queuedAt >= 0;
  try {
    if (!valid) {
      await noteIssue(env, config, "QUEUE_CANARY_MESSAGE_INVALID", now);
      message.ack();
      return { state: "INVALID_CANARY" };
    }
    const received = await receiveOperationalCanary(env.DB, {
      canaryId: body.canaryId,
      queuedAt: body.queuedAt,
      now,
    });
    if (!received) {
      await noteIssue(env, config, "QUEUE_CANARY_RECEIPT_UNMATCHED", now);
      message.ack();
      return { state: "UNMATCHED_CANARY" };
    }
    message.ack();
    return { state: "CANARY_RECEIVED" };
  } catch {
    message.retry({ delaySeconds: 30 });
    return { state: "CANARY_RETRY" };
  }
}

export async function handleDlqBatch(batch, env, now = nowSeconds()) {
  if (!parseBoolean(env.OPERATIONS_MONITORING_ENABLED, false)) {
    batch.retryAll({ delaySeconds: 300 });
    return { state: "MONITORING_DISABLED" };
  }
  const config = operationalConfig(env);
  let recorded = 0;
  for (const message of batch.messages) {
    try {
      const messageId = typeof message.id === "string" && message.id
        ? message.id
        : crypto.randomUUID();
      const receiptHash = await sha256Hex(`oip-dlq:v1:${messageId}`);
      const inserted = await recordOperationalDlqReceipt(env.DB, { receiptHash, now });
      if (inserted) {
        recorded += 1;
        await noteIssue(env, config, "DLQ_MESSAGE_RECEIVED", now);
      }
      message.ack();
    } catch {
      message.retry({ delaySeconds: 300 });
    }
  }
  const delivery = await flushPendingOperationalAlerts(env, now);
  if (delivery.failed > 0) throw new Error("OPERATIONAL_ALERT_DELIVERY_FAILED");
  return { state: "DLQ_RECORDED", recorded, alertsSent: delivery.sent };
}

export async function operationalHealthFields(db) {
  const snapshot = await getOperationalHealthSnapshot(db, OPERATIONAL_MONITOR_KEY);
  return {
    operational_monitor_status: snapshot.heartbeat?.status || "PENDING",
    operational_monitor_last_completed_at: snapshot.heartbeat?.last_completed_at || null,
    pending_operational_alerts: snapshot.pendingAlerts,
  };
}
