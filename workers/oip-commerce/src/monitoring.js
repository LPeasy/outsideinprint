import {
  cleanupOperationalCanaries,
  blockExpiredOperationalAlerts,
  claimOperationalAlert,
  completeOperationalAlertAttempt,
  countBlockedOperationalAlerts,
  countFulfillmentDeliveryIssues,
  createOperationalCanary,
  finishOperationalHeartbeat,
  getOperationalHealthSnapshot,
  getOperationalAlertStatus,
  getUnresolvedOperationalCanaries,
  listPendingOperationalAlerts,
  markOperationalCanaryQueued,
  markOperationalCanarySendFailed,
  markStaleOperationalCanaries,
  receiveOperationalCanary,
  recordOperationalAlert,
  recordOperationalDlqReceipt,
  recordOperationalRunError,
  renewOperationalHeartbeat,
  setOperationalAlertPayloadHash,
  startOperationalHeartbeat,
} from "./database.js";
import { sha256Hex } from "./crypto.js";
import { parseBoolean, requireBinding } from "./http.js";
import { expireUnusedPhysicalLinks } from "./maintenance.js";
import { operationalAlertPayloadDigest, sendOperationalAlert, SquareApiError } from "./square.js";

export const OPERATIONAL_CANARY_KIND = "OIP_OPERATIONAL_CANARY_V1";
export const OPERATIONAL_MONITOR_KEY = "TASK2_COMMERCE_OPERATIONS";
const MONITOR_LEASE_SECONDS = 120;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// Anchor explicit test/start times while still recording elapsed wall time.
// A run must never renew its lease using its original start timestamp.
function operationClock(env, start) {
  const wallStart = Date.now();
  let latest = start;
  return () => {
    const value = env.__testNow
      ? env.__testNow()
      : start + Math.floor((Date.now() - wallStart) / 1000);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("OPERATIONAL_CLOCK_INVALID");
    latest = Math.max(latest, value);
    return latest;
  };
}

const SAFE_ERROR_CODES = new Set([
  "PHYSICAL_EXPIRY_REVIEW_RECORD_FAILED", "QUEUE_CANARY_STATE_CONFLICT",
  "OPERATIONAL_HEARTBEAT_CLAIM_LOST", "OPERATIONAL_ALERT_COMPLETION_FAILED",
  "OPERATIONAL_ALERT_INPUT_INVALID", "OPERATIONAL_CLOCK_INVALID",
  "OPERATIONAL_HEARTBEAT_COMPLETION_FAILED",
  "SQUARE_UNREACHABLE", "SQUARE_INVALID_RESPONSE", "SQUARE_REQUEST_FAILED",
  "SQUARE_RATE_LIMITED", "SQUARE_INTERNAL_SERVER_ERROR", "SQUARE_SERVICE_UNAVAILABLE",
  "SQUARE_UNAUTHORIZED", "SQUARE_ACCESS_TOKEN_EXPIRED", "SQUARE_FORBIDDEN", "SQUARE_NOT_FOUND",
]);

function diagnosticCode(error, fallback = "OPERATIONAL_UNEXPECTED_ERROR") {
  if (SAFE_ERROR_CODES.has(error?.message)) return error.message;
  if (error instanceof SquareApiError) {
    return SAFE_ERROR_CODES.has(error.code) ? error.code : "SQUARE_REQUEST_FAILED";
  }
  if (["TimeoutError", "AbortError"].includes(error?.name)) return "OPERATIONAL_TIMEOUT";
  if (typeof error?.message === "string" && error.message.startsWith("D1_ERROR")) {
    return "D1_OPERATION_FAILED";
  }
  return fallback;
}

async function recordRunError(env, runToken, stage, errorCode, now, httpStatus = null) {
  // Console survives a D1 outage. Never log arbitrary exception text or payloads.
  console.error(JSON.stringify({ event: "OIP_OPERATIONAL_ERROR", runToken, stage, errorCode, httpStatus, at: now }));
  try {
    await recordOperationalRunError(env.DB, { runToken, stage, errorCode, now, httpStatus });
  } catch {
    console.error(JSON.stringify({ event: "OIP_OPERATIONAL_ERROR", runToken,
      stage: "ERROR_HISTORY", errorCode: "D1_HISTORY_WRITE_FAILED", at: now }));
  }
}

function diagnosticHttpStatus(error) {
  return error instanceof SquareApiError && Number.isInteger(error.status) &&
    error.status >= 100 && error.status <= 599 ? error.status : null;
}

async function completeHeartbeat(db, record) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await finishOperationalHeartbeat(db, record); } catch {
      // An acknowledgement may be lost after commit. Replay the same completion.
    }
  }
  throw new Error("OPERATIONAL_HEARTBEAT_COMPLETION_FAILED");
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

export async function flushPendingOperationalAlerts(env, now = nowSeconds(), limit = 10, options = {}) {
  const clock = operationClock(env, now);
  await blockExpiredOperationalAlerts(env.DB, clock());
  const rows = await listPendingOperationalAlerts(env.DB, limit, clock());
  let sent = 0;
  let failed = await countBlockedOperationalAlerts(env.DB);
  let examined = 0;
  for (const candidate of rows) {
    await options.beforeAttempt?.();
    const claimToken = crypto.randomUUID();
    const row = await claimOperationalAlert(env.DB, {
      alertId: candidate.alert_id, claimToken, now: clock(),
    });
    if (!row) continue;
    examined += 1;
    const alert = {
      alertCode: row.alert_code,
      alertBucket: Number(row.alert_bucket),
      occurrences: Number(row.delivery_occurrence_count),
      firstSeenAt: Number(row.delivery_first_seen_at),
      lastSeenAt: Number(row.delivery_last_seen_at),
    };
    let delivery;
    let payloadHash;
    try {
      payloadHash = await operationalAlertPayloadDigest(env, alert);
    } catch {
      delivery = { status: "FAILED", errorCode: "OPERATIONAL_ALERT_INPUT_INVALID", blocked: true };
    }
    if (!delivery) {
      if (row.payload_sha256 && row.payload_sha256 !== payloadHash) {
        delivery = { status: "FAILED", errorCode: "RESEND_PAYLOAD_CHANGED", blocked: true };
      } else if (!(await setOperationalAlertPayloadHash(env.DB, {
        alertId: row.alert_id, claimToken, payloadHash, now: clock(),
      }))) {
        // Another owner or a late successful completion has already won.
        continue;
      } else {
        if (clock() >= Number(row.claim_expires_at)) continue;
        try {
          delivery = await sendOperationalAlert(env, alert);
        } catch {
          delivery = { status: "RETRY", errorCode: "OPERATIONAL_ALERT_CHANNEL_UNAVAILABLE" };
        }
      }
    }
    const record = {
      alertId: row.alert_id, claimToken, status: delivery.status,
      errorCode: delivery.errorCode || null,
      httpStatus: delivery.httpStatus || null,
      // A rejected immutable payload needs review, not unbounded retry traffic.
      blocked: Boolean(delivery.blocked || delivery.status === "FAILED"),
      now: clock(),
    };
    let persisted = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        persisted = await completeOperationalAlertAttempt(env.DB, record);
        break;
      } catch {
        // Retry the acknowledgement write, never the email, in this invocation.
      }
    }
    if (!persisted) {
      console.error(JSON.stringify({ event: "OIP_OPERATIONAL_ERROR", stage: "ALERT_COMPLETION",
        errorCode: "OPERATIONAL_ALERT_COMPLETION_FAILED", claimToken,
        providerStatus: delivery.status, providerErrorCode: delivery.errorCode || null,
        httpStatus: delivery.httpStatus || null, at: clock() }));
      throw new Error("OPERATIONAL_ALERT_COMPLETION_FAILED");
    }
    if (delivery.status === "SENT") sent += 1;
    else if ((await getOperationalAlertStatus(env.DB, row.alert_id)) === "PENDING") failed += 1;
  }
  return { examined, sent, failed };
}

async function sendDirectMonitorFailure(env, config, alertCode, now) {
  const bucket = Math.floor(now / config.alertRepeatSeconds);
  let result;
  try {
    result = await sendOperationalAlert(env, {
      alertCode,
      alertBucket: bucket,
      occurrences: 1,
      firstSeenAt: bucket * config.alertRepeatSeconds,
      lastSeenAt: bucket * config.alertRepeatSeconds,
      keyNamespace: "direct",
    });
  } catch {
    result = { status: "RETRY", errorCode: "OPERATIONAL_ALERT_CHANNEL_UNAVAILABLE" };
  }
  console.error(JSON.stringify({ event: "OIP_OPERATIONAL_ALERT_RESULT", source: "D1_FALLBACK",
    alertCode, providerStatus: result.status, errorCode: result.errorCode || null,
    httpStatus: result.httpStatus || null, at: now }));
  return result;
}

async function issueQueueCanary(env, config, now, onError) {
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
  } catch (error) {
    await onError?.(error);
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
  const clock = operationClock(env, now);
  let admitted;
  try {
    admitted = await startOperationalHeartbeat(env.DB, {
      monitorKey: OPERATIONAL_MONITOR_KEY,
      runToken,
      now,
      leaseSeconds: MONITOR_LEASE_SECONDS,
    });
  } catch (error) {
    await recordRunError(env, runToken, "HEARTBEAT_ADMISSION",
      diagnosticCode(error, "D1_HEARTBEAT_FAILED"), clock());
    await sendDirectMonitorFailure(env, config, "D1_HEARTBEAT_FAILED", now);
    throw new Error("OPERATIONAL_MONITOR_D1_HEARTBEAT_FAILED");
  }
  if (!admitted) return { state: "SKIPPED", reason: "MONITOR_BUSY" };

  const guard = async () => {
    const renewedAt = clock();
    if (!(await renewOperationalHeartbeat(env.DB, {
      monitorKey: OPERATIONAL_MONITOR_KEY, runToken, now: renewedAt, leaseSeconds: MONITOR_LEASE_SECONDS,
    })) || clock() >= renewedAt + MONITOR_LEASE_SECONDS) throw new Error("OPERATIONAL_HEARTBEAT_CLAIM_LOST");
  };

  const issueCodes = [];
  let delivery = { examined: 0, sent: 0, failed: 0 };
  let staleCanaries = 0;
  let unresolvedStaleCanaries = 0;
  let fulfillmentIssues = null;
  let maintenance = null;
  let stage = "CANARY_CLEANUP";
  try {
    await guard();
    await cleanupOperationalCanaries(env.DB, now - (7 * 24 * 60 * 60), 500);

    stage = "CANARY_STALENESS";
    await guard();
    staleCanaries = await markStaleOperationalCanaries(
      env.DB,
      now - config.canaryStaleSeconds,
      now,
    );
    if (staleCanaries > 0) {
      issueCodes.push("QUEUE_CANARY_STALE");
      await noteIssue(env, config, "QUEUE_CANARY_STALE", now, staleCanaries);
    }
    // Keep historical losses visible without re-alerting or calling them a new outage.
    unresolvedStaleCanaries = (await getUnresolvedOperationalCanaries(env.DB)).count;

    stage = "FULFILLMENT_CHECK";
    await guard();
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

    stage = "PHYSICAL_MAINTENANCE";
    await guard();
    try {
      maintenance = await expireUnusedPhysicalLinks(env, clock(), 25, {
        beforeStep: guard,
        onError: async (operation, error) => {
          await recordRunError(env, runToken, operation, diagnosticCode(error), clock(), diagnosticHttpStatus(error));
        },
      });
      if (maintenance.errors > 0) {
        issueCodes.push("PHYSICAL_LINK_EXPIRY_ERROR");
        await noteIssue(env, config, "PHYSICAL_LINK_EXPIRY_ERROR", now, maintenance.errors);
      }
      if (maintenance.orphaned > 0) {
        issueCodes.push("PHYSICAL_ORPHANED_REVIEW");
        await noteIssue(env, config, "PHYSICAL_ORPHANED_REVIEW", now, maintenance.orphaned);
      }
    } catch (error) {
      if (error?.message === "OPERATIONAL_HEARTBEAT_CLAIM_LOST") throw error;
      await recordRunError(env, runToken, stage, diagnosticCode(error), clock(), diagnosticHttpStatus(error));
      issueCodes.push("PHYSICAL_MAINTENANCE_FAILED");
      await noteIssue(env, config, "PHYSICAL_MAINTENANCE_FAILED", now);
    }

    stage = "QUEUE_CANARY_SEND";
    await guard();
    const canary = await issueQueueCanary(env, config, clock(), async (error) => {
      await recordRunError(env, runToken, stage, diagnosticCode(error, "QUEUE_SEND_FAILED"), clock());
    });
    if (!canary.sent) issueCodes.push("QUEUE_CANARY_SEND_FAILED");

    stage = "ALERT_DELIVERY";
    await guard();
    delivery = await flushPendingOperationalAlerts(env, clock(), 10, { beforeAttempt: guard });
    const status = issueCodes.length > 0 || delivery.failed > 0 ? "DEGRADED" : "OK";
    const errorCode = delivery.failed > 0
      ? "OPERATIONAL_ALERT_DELIVERY_PENDING"
      : issueCodes[0] || null;
    stage = "HEARTBEAT_COMPLETION";
    await guard();
    const finished = await completeHeartbeat(env.DB, {
      monitorKey: OPERATIONAL_MONITOR_KEY,
      runToken,
      status,
      errorCode,
      now: clock(),
    });
    if (!finished) throw new Error("OPERATIONAL_HEARTBEAT_CLAIM_LOST");
  } catch (error) {
    if (error?.message === "OPERATIONAL_HEARTBEAT_CLAIM_LOST") {
      return { state: "SKIPPED", reason: "CLAIM_LOST" };
    }
    const errorCode = diagnosticCode(error);
    await recordRunError(env, runToken, stage, errorCode, clock());
    try {
      await noteIssue(env, config, "OPERATIONAL_MONITOR_RUN_FAILED", clock());
      const finished = await completeHeartbeat(env.DB, {
        monitorKey: OPERATIONAL_MONITOR_KEY,
        runToken,
        status: "FAILED",
        errorCode,
        now: clock(),
      });
      if (!finished) return { state: "SKIPPED", reason: "CLAIM_LOST" };
    } catch {
      // Only a thrown persistence error takes the D1 fallback path. An expected
      // lease/ownership no-op is never mislabeled as a database outage.
      await sendDirectMonitorFailure(env, config, "D1_OPERATION_FAILED", clock());
    }
    throw new Error(`OPERATIONAL_MONITOR_RUN_FAILED:${stage}:${errorCode}`);
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
    unresolvedStaleCanaries,
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
    unresolved_stale_queue_canaries: snapshot.unresolvedCanaries.count,
    oldest_unresolved_queue_canary_queued_at: snapshot.unresolvedCanaries.oldestQueuedAt,
  };
}
