export class FakeD1 {
  constructor() {
    this.rateLimits = new Map();
    this.checkouts = new Map();
    this.webhooks = new Map();
    this.fulfillments = new Map();
    this.reviews = [];
    this.paymentBlocks = new Map();
    this.subscriptions = new Map();
    this.jurisdictionDatasets = new Map();
    this.rateManifests = new Map();
    this.countyRates = new Map();
    this.physicalCheckouts = new Map();
    this.inventoryReservations = new Map();
    this.operationalHeartbeats = new Map();
    this.operationalCanaries = new Map();
    this.operationalDlqReceipts = new Map();
    this.operationalAlerts = new Map();
    this.operationalMonitorRuns = new Map();
    this.operationalMonitorErrors = [];
    this.operationalAlertAttempts = new Map();
  }

  prepare(sql) {
    return new FakeStatement(this, sql.replace(/\s+/gu, " ").trim());
  }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async run() {
    const { db, sql, args } = this;
    if (sql.startsWith("INSERT INTO operational_heartbeats")) {
      const [monitorKey, runToken, startedAt, updatedAt, leaseExpiresAt] = args;
      const existing = db.operationalHeartbeats.get(monitorKey) || {};
      if ((existing.status === "RUNNING" && (existing.lease_expires_at || 0) > startedAt) ||
          db.operationalMonitorRuns.has(runToken)) return changed(0);
      const previous = db.operationalMonitorRuns.get(existing.run_token);
      if (previous?.status === "RUNNING") Object.assign(previous, {
        status: "ABANDONED", completed_at: startedAt, last_error_code: "MONITOR_LEASE_EXPIRED",
      });
      db.operationalHeartbeats.set(monitorKey, {
        ...existing,
        monitor_key: monitorKey,
        run_token: runToken,
        last_started_at: startedAt,
        status: "RUNNING",
        last_error_code: null,
        updated_at: updatedAt,
        lease_expires_at: leaseExpiresAt,
      });
      db.operationalMonitorRuns.set(runToken, {
        run_token: runToken, monitor_key: monitorKey, started_at: startedAt,
        lease_expires_at: leaseExpiresAt, status: "RUNNING", completed_at: null, last_error_code: null,
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE operational_heartbeats SET lease_expires_at")) {
      const [leaseExpiresAt, now, monitorKey, runToken] = args;
      const row = db.operationalHeartbeats.get(monitorKey);
      if (!row || row.run_token !== runToken || row.status !== "RUNNING" || row.lease_expires_at <= now) return changed(0);
      Object.assign(row, { lease_expires_at: leaseExpiresAt, updated_at: now });
      Object.assign(db.operationalMonitorRuns.get(runToken), { lease_expires_at: leaseExpiresAt });
      return changed(1);
    }
    if (sql.startsWith("UPDATE operational_heartbeats")) {
      const [completedAt, status, errorCode, updatedAt, leaseExpiresAt, monitorKey, runToken] = args;
      const row = db.operationalHeartbeats.get(monitorKey);
      if (!row || row.run_token !== runToken || row.status !== "RUNNING" || row.lease_expires_at <= completedAt) return changed(0);
      Object.assign(row, {
        last_completed_at: completedAt,
        status,
        last_error_code: errorCode,
        updated_at: updatedAt,
        lease_expires_at: leaseExpiresAt,
      });
      Object.assign(db.operationalMonitorRuns.get(runToken), {
        status, last_error_code: errorCode, completed_at: completedAt, lease_expires_at: leaseExpiresAt,
      });
      return changed(1);
    }
    if (sql.startsWith("INSERT INTO operational_monitor_errors")) {
      const [runToken, stage, errorCode, occurredAt, httpStatus] = args;
      db.operationalMonitorErrors.push({ id: db.operationalMonitorErrors.length + 1,
        run_token: runToken, stage, error_code: errorCode, occurred_at: occurredAt, http_status: httpStatus });
      return changed(1);
    }
    if (sql.startsWith("INSERT OR IGNORE INTO operational_queue_canaries")) {
      const [canaryId, queuedAt, updatedAt] = args;
      if (db.operationalCanaries.has(canaryId)) return changed(0);
      db.operationalCanaries.set(canaryId, {
        canary_id: canaryId,
        status: "PENDING",
        queued_at: queuedAt,
        received_at: null,
        updated_at: updatedAt,
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE operational_queue_canaries SET status = 'QUEUED'")) {
      const [updatedAt, canaryId] = args;
      const row = db.operationalCanaries.get(canaryId);
      if (!row || row.status !== "PENDING") return changed(0);
      row.status = "QUEUED";
      row.updated_at = updatedAt;
      return changed(1);
    }
    if (sql.startsWith("UPDATE operational_queue_canaries SET status = 'SEND_FAILED'")) {
      const [updatedAt, canaryId] = args;
      const row = db.operationalCanaries.get(canaryId);
      if (!row || row.status !== "PENDING") return changed(0);
      row.status = "SEND_FAILED";
      row.updated_at = updatedAt;
      return changed(1);
    }
    if (sql.startsWith("UPDATE operational_queue_canaries SET status = 'RECEIVED'")) {
      const [receivedAt, updatedAt, canaryId, queuedAt] = args;
      const row = db.operationalCanaries.get(canaryId);
      if (!row || row.queued_at !== queuedAt || row.status === "RECEIVED") return changed(0);
      row.status = "RECEIVED";
      row.received_at = receivedAt;
      row.updated_at = updatedAt;
      return changed(1);
    }
    if (sql.startsWith("UPDATE operational_queue_canaries SET status = 'STALE'")) {
      const [updatedAt, staleBefore] = args;
      let changes = 0;
      for (const row of db.operationalCanaries.values()) {
        if (!["PENDING", "QUEUED"].includes(row.status) || row.queued_at > staleBefore) continue;
        row.status = "STALE";
        row.updated_at = updatedAt;
        changes += 1;
      }
      return changed(changes);
    }
    if (sql.startsWith("DELETE FROM operational_queue_canaries WHERE rowid IN")) {
      const [receivedBefore, limit] = args;
      const rows = [...db.operationalCanaries.entries()]
        .filter(([, row]) => row.status === "RECEIVED" && row.received_at < receivedBefore)
        .sort((left, right) => left[1].received_at - right[1].received_at)
        .slice(0, limit);
      for (const [key] of rows) db.operationalCanaries.delete(key);
      return changed(rows.length);
    }
    if (sql.startsWith("INSERT OR IGNORE INTO operational_dlq_receipts")) {
      const [receiptHash, receivedAt] = args;
      if (db.operationalDlqReceipts.has(receiptHash)) return changed(0);
      db.operationalDlqReceipts.set(receiptHash, { receipt_sha256: receiptHash, received_at: receivedAt });
      return changed(1);
    }
    if (sql.startsWith("INSERT INTO operational_alerts")) {
      const [alertId, alertCode, alertBucket, occurrences, firstSeenAt, lastSeenAt] = args;
      const existing = [...db.operationalAlerts.values()].find(
        (row) => row.alert_code === alertCode && row.alert_bucket === alertBucket,
      );
      if (existing) {
        existing.occurrence_count += occurrences;
        existing.first_seen_at = Math.min(existing.first_seen_at, firstSeenAt);
        existing.last_seen_at = Math.max(existing.last_seen_at, lastSeenAt);
      } else {
        db.operationalAlerts.set(alertId, {
          alert_id: alertId,
          alert_code: alertCode,
          alert_bucket: alertBucket,
          status: "PENDING",
          occurrence_count: occurrences,
          first_seen_at: firstSeenAt,
          last_seen_at: lastSeenAt,
          delivery_attempts: 0,
          last_delivery_attempt_at: null,
          delivered_at: null,
          last_delivery_error_code: null,
          last_delivery_http_status: null,
          claim_token: null,
          claim_expires_at: null,
          first_delivery_attempt_at: null,
          delivery_occurrence_count: null,
          delivery_first_seen_at: null,
          delivery_last_seen_at: null,
          payload_sha256: null,
          retry_blocked: 0,
        });
      }
      return changed(1);
    }
    if (sql.startsWith("UPDATE operational_alerts SET retry_blocked = 1")) {
      let count = 0;
      for (const row of db.operationalAlerts.values()) {
        if (row.status !== "PENDING" || row.retry_blocked || row.first_delivery_attempt_at == null ||
            row.first_delivery_attempt_at > args[0]) continue;
        row.retry_blocked = 1;
        row.last_delivery_error_code = "RETRY_WINDOW_EXPIRED";
        count += 1;
      }
      return changed(count);
    }
    if (sql.startsWith("UPDATE operational_alerts SET payload_sha256")) {
      const [payloadHash, alertId, claimToken, now] = args;
      const row = db.operationalAlerts.get(alertId);
      if (!row || row.claim_token !== claimToken || row.status !== "PENDING" || row.retry_blocked ||
          row.claim_expires_at <= now || (row.payload_sha256 != null && row.payload_sha256 !== payloadHash)) return changed(0);
      row.payload_sha256 = payloadHash;
      const attempt = db.operationalAlertAttempts.get(claimToken);
      if (attempt?.status === "IN_FLIGHT" && (attempt.payload_sha256 == null || attempt.payload_sha256 === payloadHash)) {
        attempt.payload_sha256 = payloadHash;
      }
      return changed(1);
    }
    if (sql.startsWith("UPDATE operational_alert_attempts")) {
      const [status, errorCode, httpStatus, now, blocked, alertId, claimToken] = args;
      const attempt = db.operationalAlertAttempts.get(claimToken);
      const row = db.operationalAlerts.get(alertId);
      if (!attempt || attempt.alert_id !== alertId || attempt.status !== "IN_FLIGHT") return changed(0);
      if (status === "SENT" && (!attempt.payload_sha256 || row?.payload_sha256 !== attempt.payload_sha256)) return changed(0);
      Object.assign(attempt, { status, error_code: errorCode, http_status: httpStatus,
        completed_at: now, retry_blocked: blocked });
      if (status === "SENT") {
        Object.assign(row, { status: "SENT", delivered_at: row.delivered_at ?? now,
          last_delivery_http_status: httpStatus, claim_token: null, claim_expires_at: null, retry_blocked: 0 });
      } else if (row?.status === "PENDING" && row.claim_token === claimToken && row.claim_expires_at > now) {
        if (!row.retry_blocked) row.last_delivery_error_code = errorCode;
        Object.assign(row, { last_delivery_http_status: httpStatus,
          retry_blocked: Math.max(row.retry_blocked || 0, blocked), claim_token: null, claim_expires_at: null });
      }
      return changed(1);
    }
    if (sql.startsWith("INSERT INTO rate_limits")) {
      const key = `${args[0]}:${args[1]}`;
      const existing = db.rateLimits.get(key);
      db.rateLimits.set(key, { request_count: (existing?.request_count || 0) + 1, updated_at: args[2] });
      return changed(1);
    }
    if (sql.startsWith("DELETE FROM rate_limits WHERE rowid IN")) {
      const [cutoff, batchSize] = args;
      const candidates = [...db.rateLimits.entries()]
        .filter(([, row]) => row.updated_at < cutoff)
        .sort((left, right) => left[1].updated_at - right[1].updated_at)
        .slice(0, batchSize);
      for (const [key] of candidates) db.rateLimits.delete(key);
      return changed(candidates.length);
    }
    if (sql.startsWith("DELETE FROM checkout_requests WHERE rowid IN")) {
      const [incompleteCutoff, completedCutoff, batchSize] = args;
      const candidates = [...db.checkouts.entries()]
        .filter(([, row]) =>
          row.request_kind !== "PHYSICAL" && (
            (["PENDING", "PROCESSING", "FAILED"].includes(row.status) && row.updated_at < incompleteCutoff) ||
            (row.status === "COMPLETED" && row.updated_at < completedCutoff)))
        .sort((left, right) => left[1].updated_at - right[1].updated_at)
        .slice(0, batchSize);
      for (const [key] of candidates) db.checkouts.delete(key);
      return changed(candidates.length);
    }
    if (sql.startsWith("INSERT OR IGNORE INTO checkout_requests")) {
      if (db.checkouts.has(args[0])) return changed(0);
      db.checkouts.set(args[0], {
        request_key: args[0],
        request_kind: args[1],
        request_hash: args[2],
        square_idempotency_key: args[3],
        status: "PENDING",
        checkout_url: null,
        square_payment_link_id: null,
        created_at: args[4],
        updated_at: args[5],
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE checkout_requests SET status = 'COMPLETED'")) {
      const row = db.checkouts.get(args[3]);
      if (row?.status !== "PROCESSING" || row.processing_token !== args[4]) return changed(0);
      Object.assign(row, {
        status: "COMPLETED",
        checkout_url: args[0],
        square_payment_link_id: args[1],
        updated_at: args[2],
        last_error_code: null,
        processing_started_at: null,
        processing_token: null,
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE checkout_requests SET status = 'FAILED'")) {
      const row = db.checkouts.get(args[2]);
      if (row?.status !== "PROCESSING" || row.processing_token !== args[3]) return changed(0);
      Object.assign(row, { status: "FAILED", updated_at: args[0], last_error_code: args[1] });
      row.processing_started_at = null;
      row.processing_token = null;
      return changed(1);
    }
    if (sql.startsWith("UPDATE checkout_requests SET status = 'PROCESSING'")) {
      const [startedAt, claimToken, updatedAt, requestKey, staleBefore] = args;
      const row = db.checkouts.get(requestKey);
      const reclaimable = row?.status === "PROCESSING" && row.processing_started_at <= staleBefore;
      if (!row || (!["PENDING", "FAILED"].includes(row.status) && !reclaimable)) return changed(0);
      Object.assign(row, {
        status: "PROCESSING",
        processing_started_at: startedAt,
        processing_token: claimToken,
        updated_at: updatedAt,
        last_error_code: null,
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE checkout_requests SET processing_started_at = ?")) {
      const [startedAt, updatedAt, requestKey, claimToken] = args;
      const row = db.checkouts.get(requestKey);
      if (!row || row.status !== "PROCESSING" || row.processing_token !== claimToken) return changed(0);
      row.processing_started_at = startedAt;
      row.updated_at = updatedAt;
      return changed(1);
    }
    if (sql.startsWith("INSERT OR IGNORE INTO webhook_events")) {
      if (db.webhooks.has(args[0])) return changed(0);
      db.webhooks.set(args[0], {
        event_id: args[0], event_type: args[1], object_id: args[2], payment_id: args[3],
        payload_sha256: args[4], event_created_at: args[5], status: "RECEIVED", attempts: 0,
        received_at: args[6], processing_started_at: null,
        processing_token: null,
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE webhook_events SET status = 'QUEUED'")) {
      const row = db.webhooks.get(args[0]);
      if (!row || row.payload_sha256 !== args[1] || !["RECEIVED", "FAILED"].includes(row.status)) return changed(0);
      row.status = "QUEUED";
      return changed(1);
    }
    if (sql.startsWith("UPDATE webhook_events SET status = 'PROCESSING'")) {
      const row = db.webhooks.get(args[2]);
      const [startedAt, claimToken, _eventId, staleBefore] = args;
      const reclaimable = row.status === "PROCESSING" && row.processing_started_at <= staleBefore;
      if (!["RECEIVED", "QUEUED", "FAILED"].includes(row.status) && !reclaimable) return changed(0);
      row.status = "PROCESSING";
      row.attempts += 1;
      row.last_error_code = null;
      row.processing_started_at = startedAt;
      row.processing_token = claimToken;
      return changed(1);
    }
    if (sql.startsWith("UPDATE webhook_events SET status = 'PROCESSED'")) {
      const row = db.webhooks.get(args[1]);
      if (row.status !== "PROCESSING" || row.processing_token !== args[2]) return changed(0);
      Object.assign(row, {
        status: "PROCESSED",
        processed_at: args[0],
        processing_started_at: null,
        processing_token: null,
        last_error_code: null,
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE webhook_events SET status = 'FAILED'")) {
      const row = db.webhooks.get(args[1]);
      if (row.status !== "PROCESSING" || row.processing_token !== args[2]) return changed(0);
      Object.assign(row, {
        status: "FAILED",
        processing_started_at: null,
        processing_token: null,
        last_error_code: args[0],
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE fulfillments SET status = 'REVOKED'")) {
      const hasSku = sql.includes("AND sku = ?");
      const [now, paymentId, sku] = args;
      let changes = 0;
      for (const row of db.fulfillments.values()) {
        if (row.payment_id !== paymentId || row.status !== "ACTIVE" || (hasSku && row.sku !== sku)) continue;
        row.status = "REVOKED";
        row.revoked_at = now;
        changes += 1;
      }
      return changed(changes);
    }
    if (sql.startsWith("INSERT OR IGNORE INTO fulfillments")) {
      const existing = [...db.fulfillments.values()].find(
        (row) => row.payment_id === args[1] && row.sku === args[3],
      );
      if (existing) return changed(0);
      db.fulfillments.set(args[0], {
        fulfillment_id: args[0],
        payment_id: args[1],
        order_id: args[2],
        sku: args[3],
        buyer_email_sha256: args[4],
        status: "ACTIVE",
        token_sha256: args[5],
        token_generation: args[6],
        expires_at: args[7],
        download_count: 0,
        max_downloads: args[8],
        created_at: args[9],
        email_delivery_status: "PENDING",
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE fulfillments SET expires_at = ?")) {
      const [expiresAt, fulfillmentId, tokenHash] = args;
      const row = db.fulfillments.get(fulfillmentId);
      if (
        !row || row.status !== "ACTIVE" || row.token_sha256 !== tokenHash ||
        !["PENDING", "FAILED"].includes(row.email_delivery_status)
      ) return changed(0);
      row.expires_at = expiresAt;
      return changed(1);
    }
    if (sql.startsWith("UPDATE fulfillments SET email_delivery_status = ?")) {
      const [status, messageId, lastEmailAt, fulfillmentId, generation] = args;
      const row = db.fulfillments.get(fulfillmentId);
      if (!row || row.token_generation !== generation) return changed(0);
      Object.assign(row, {
        email_delivery_status: status,
        email_message_id: messageId,
        last_email_at: lastEmailAt,
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE fulfillments SET resend_status = ?")) {
      const [status, _statusExpiry, expiresAt, _statusCount, _statusTime, now, _statusMessage,
        messageId, fulfillmentId, sequence, claimToken] = args;
      const row = db.fulfillments.get(fulfillmentId);
      if (
        !row || row.status !== "ACTIVE" || row.resend_sequence !== sequence ||
        row.resend_status !== "PENDING" || row.resend_processing_token !== claimToken
      ) return changed(0);
      row.resend_status = status;
      row.resend_processing_started_at = null;
      row.resend_processing_token = null;
      if (status === "SENT") {
        row.expires_at = expiresAt;
        row.download_count = 0;
        row.last_email_at = now;
        row.email_message_id = messageId;
      }
      return changed(1);
    }
    if (sql.startsWith("UPDATE fulfillments SET resend_processing_started_at = 0")) {
      const [fulfillmentId, sequence, claimToken] = args;
      const row = db.fulfillments.get(fulfillmentId);
      if (
        !row || row.resend_sequence !== sequence || row.resend_status !== "PENDING" ||
        row.resend_processing_token !== claimToken
      ) return changed(0);
      row.resend_processing_started_at = 0;
      row.resend_processing_token = null;
      return changed(1);
    }
    if (sql.startsWith("UPDATE fulfillments SET download_count = download_count + 1")) {
      const row = [...db.fulfillments.values()].find((item) => item.token_sha256 === args[0]);
      if (!row || row.status !== "ACTIVE" || row.expires_at <= args[1] || row.download_count >= row.max_downloads) {
        return changed(0);
      }
      row.download_count += 1;
      return changed(1);
    }
    if (sql.startsWith("INSERT INTO subscription_events")) {
      const [subscriptionId, eventId, status, planVariationId, squareVersion, updatedAt] = args;
      const existing = db.subscriptions.get(subscriptionId);
      if (!existing || squareVersion > existing.square_version) {
        db.subscriptions.set(subscriptionId, {
          subscription_id: subscriptionId,
          last_event_id: eventId,
          status,
          plan_variation_id: planVariationId,
          square_version: squareVersion,
          updated_at: updatedAt,
        });
        return changed(1);
      }
      return changed(0);
    }
    if (sql.startsWith("INSERT INTO payment_blocks")) {
      const [paymentId, reasonCode, eventId, createdAt] = args;
      const existing = db.paymentBlocks.get(paymentId);
      db.paymentBlocks.set(paymentId, {
        reason_code: existing?.reason_code === "DISPUTE" ? "DISPUTE" : reasonCode,
        event_id: existing?.reason_code === "DISPUTE" ? existing.event_id : eventId,
        created_at: Math.min(existing?.created_at ?? createdAt, createdAt),
      });
      return changed(1);
    }
    if (sql.startsWith("INSERT OR IGNORE INTO physical_checkout_bindings")) {
      if (db.physicalCheckouts.has(args[0])) return changed(0);
      db.physicalCheckouts.set(args[0], {
        request_key: args[0], square_payment_link_id: args[1], square_order_id: args[2],
        items_json: args[3], address_hmac: args[4], state_code: args[5], county_fips: args[6],
        combined_rate_bps: args[7], dataset_version: args[8], rate_table_version: args[9],
        resolution_method: args[10], merchandise_cents: args[11], shipping_cents: args[12],
        shipping_tax_cents: args[13], tax_cents: args[14], total_cents: args[15], status: "LINK_CREATED",
        square_payment_id: null, hold_reason: null, created_at: args[16], expires_at: args[17],
        updated_at: args[18],
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE physical_checkout_bindings SET square_payment_id = ?")) {
      const [paymentId, now, orderId] = args;
      const row = [...db.physicalCheckouts.values()].find((item) => item.square_order_id === orderId);
      if (!row || !["LINK_CREATED", "EXPIRED"].includes(row.status) || row.square_payment_id !== null) {
        return changed(0);
      }
      row.square_payment_id = paymentId;
      row.status = "PAYMENT_PROCESSING";
      row.updated_at = now;
      return changed(1);
    }
    if (sql.startsWith("UPDATE physical_checkout_bindings SET square_payment_id = COALESCE")) {
      const [paymentId, status, holdReason, now, orderId, expectedPaymentId] = args;
      const row = [...db.physicalCheckouts.values()].find((item) => item.square_order_id === orderId);
      if (
        !row || row.status === "EXPIRED" ||
        (row.square_payment_id !== null && row.square_payment_id !== expectedPaymentId)
      ) return changed(0);
      row.square_payment_id = row.square_payment_id || paymentId;
      if (row.status !== "DISPUTED") {
        row.status = status;
        row.hold_reason = holdReason;
        row.updated_at = now;
      }
      return changed(1);
    }
    if (sql.startsWith("UPDATE physical_checkout_bindings SET status = ?, hold_reason = ?") &&
        sql.includes("square_order_id = ?")) {
      const [status, holdReason, now, orderId, paymentId] = args;
      const row = [...db.physicalCheckouts.values()].find((item) => item.square_order_id === orderId);
      if (!row || row.square_payment_id !== paymentId || row.status !== "PAYMENT_PROCESSING") return changed(0);
      row.status = status;
      row.hold_reason = holdReason;
      row.updated_at = now;
      return changed(1);
    }
    if (sql.startsWith("UPDATE physical_checkout_bindings SET status = CASE WHEN status = 'DISPUTED'") &&
        sql.includes("square_payment_id = ?")) {
      const [status, holdReason, now, paymentId] = args;
      let changes = 0;
      for (const row of db.physicalCheckouts.values()) {
        if (row.square_payment_id !== paymentId || row.status === "EXPIRED") continue;
        if (row.status !== "DISPUTED") {
          row.status = status;
          row.hold_reason = holdReason;
          row.updated_at = now;
        }
        changes += 1;
      }
      return changed(changes);
    }
    if (sql.startsWith("UPDATE physical_checkout_bindings SET status = 'EXPIRED'")) {
      const [now, requestKey] = args;
      const row = db.physicalCheckouts.get(requestKey);
      if (!row || row.status !== "LINK_CREATED" || row.square_payment_id !== null) return changed(0);
      row.status = "EXPIRED";
      row.updated_at = now;
      return changed(1);
    }
    if (sql.startsWith("DELETE FROM physical_inventory_reservations")) {
      let changes = 0;
      for (const [key, row] of db.inventoryReservations.entries()) {
        if (row.request_key === args[0] && row.status === "RELEASED") {
          db.inventoryReservations.delete(key);
          changes += 1;
        }
      }
      return changed(changes);
    }
    if (sql.startsWith("INSERT OR IGNORE INTO physical_inventory_reservations")) {
      const [requestKey, sku, catalogObjectId, quantity, sourceCount, claimToken,
        createdAt, expiresAt, updatedAt, checkoutRequestKey, checkoutClaimToken,
        _requestedQuantity, _sourceCount, _catalogObjectId] = args;
      const key = `${requestKey}:${sku}`;
      if (db.inventoryReservations.has(key)) return changed(0);
      const checkout = db.checkouts.get(checkoutRequestKey);
      if (
        checkoutRequestKey !== requestKey || checkout?.status !== "PROCESSING" ||
        checkout.processing_token !== checkoutClaimToken || checkoutClaimToken !== claimToken
      ) return changed(0);
      const active = [...db.inventoryReservations.values()]
        .filter((row) => row.catalog_object_id === catalogObjectId &&
          ["ACTIVE", "ORPHANED_REVIEW", "PAID_PENDING"].includes(row.status))
        .reduce((sum, row) => sum + row.quantity, 0);
      if (quantity > sourceCount - active) return changed(0);
      db.inventoryReservations.set(key, {
        request_key: requestKey, sku, catalog_object_id: catalogObjectId, quantity,
        source_in_stock_count: sourceCount, claim_token: claimToken, status: "ACTIVE", created_at: createdAt,
        expires_at: expiresAt, updated_at: updatedAt,
      });
      return changed(1);
    }
    if (sql.startsWith("UPDATE physical_inventory_reservations SET claim_token = ?")) {
      const [claimToken, now, requestKey, checkoutRequestKey, checkoutClaimToken] = args;
      const checkout = db.checkouts.get(checkoutRequestKey);
      if (
        checkoutRequestKey !== requestKey || checkout?.status !== "PROCESSING" ||
        checkout.processing_token !== checkoutClaimToken || checkoutClaimToken !== claimToken
      ) return changed(0);
      let changes = 0;
      for (const row of db.inventoryReservations.values()) {
        if (row.request_key !== requestKey || row.status !== "ACTIVE") continue;
        row.claim_token = claimToken;
        row.updated_at = now;
        changes += 1;
      }
      return changed(changes);
    }
    if (sql.startsWith("UPDATE physical_inventory_reservations SET status = 'PAID_PENDING'")) {
      const [now, requestKey] = args;
      let changes = 0;
      for (const row of db.inventoryReservations.values()) {
        if (row.request_key !== requestKey || row.status !== "ACTIVE") continue;
        row.status = "PAID_PENDING";
        row.expires_at = 2147483647;
        row.updated_at = now;
        changes += 1;
      }
      return changed(changes);
    }
    if (sql.startsWith("UPDATE physical_inventory_reservations SET status = 'SOLD_VERIFIED'")) {
      const [now, requestKey] = args;
      let changes = 0;
      for (const row of db.inventoryReservations.values()) {
        if (row.request_key !== requestKey || row.status !== "PAID_PENDING") continue;
        row.status = "SOLD_VERIFIED";
        row.updated_at = now;
        changes += 1;
      }
      return changed(changes);
    }
    if (sql.startsWith("UPDATE physical_inventory_reservations SET status = 'RELEASED'") &&
        !sql.includes("physical_checkout_bindings")) {
      const [now, requestKey, claimToken, checkoutRequestKey, checkoutClaimToken] = args;
      const fenced = sql.includes("claim_token = ?");
      const checkout = fenced ? db.checkouts.get(checkoutRequestKey) : null;
      if (fenced && (
        checkoutRequestKey !== requestKey || checkout?.status !== "PROCESSING" ||
        checkout.processing_token !== checkoutClaimToken || checkoutClaimToken !== claimToken
      )) return changed(0);
      let changes = 0;
      for (const row of db.inventoryReservations.values()) {
        if (
          row.request_key !== requestKey || row.status !== "ACTIVE" ||
          (fenced && row.claim_token !== claimToken)
        ) continue;
        row.status = "RELEASED";
        row.updated_at = now;
        changes += 1;
      }
      return changed(changes);
    }
    if (sql.startsWith("UPDATE physical_inventory_reservations SET status = 'RELEASED'") &&
        sql.includes("physical_checkout_bindings")) {
      const [now] = args;
      let changes = 0;
      for (const row of db.inventoryReservations.values()) {
        const binding = db.physicalCheckouts.get(row.request_key);
        if (row.status !== "ACTIVE" || binding?.status !== "EXPIRED") continue;
        row.status = "RELEASED";
        row.updated_at = now;
        changes += 1;
      }
      return changed(changes);
    }
    if (sql.startsWith("UPDATE physical_inventory_reservations SET status = 'ORPHANED_REVIEW'")) {
      const [updatedAt, expiresBefore] = args;
      let changes = 0;
      for (const row of db.inventoryReservations.values()) {
        if (
          row.status !== "ACTIVE" || row.expires_at > expiresBefore ||
          db.physicalCheckouts.has(row.request_key)
        ) continue;
        row.status = "ORPHANED_REVIEW";
        row.updated_at = updatedAt;
        changes += 1;
      }
      return changed(changes);
    }
    if (sql.startsWith("INSERT OR IGNORE INTO fulfillment_reviews")) {
      if (!db.reviews.some((row) => row.event_id === args[1] && row.reason_code === args[4])) {
        db.reviews.push({
          review_id: args[0], event_id: args[1], payment_id: args[2], order_id: args[3],
          reason_code: args[4], details_json: args[5],
        });
      }
      return changed(1);
    }
    throw new Error(`FakeD1 run() does not support: ${sql}`);
  }

  async first() {
    const { db, sql, args } = this;
    if (sql.startsWith("INSERT INTO operational_heartbeats") || sql.startsWith("UPDATE operational_heartbeats")) {
      const result = await this.run();
      if (result.meta.changes !== 1) return null;
      const token = sql.startsWith("INSERT") ? args[1]
        : sql.startsWith("UPDATE operational_heartbeats SET lease_expires_at") ? args[3] : args[6];
      return { run_token: token };
    }
    if (sql.startsWith("UPDATE operational_alerts SET payload_sha256")) {
      const result = await this.run();
      return result.meta.changes === 1 ? { alert_id: args[1] } : null;
    }
    if (sql.startsWith("UPDATE operational_alert_attempts")) {
      const result = await this.run();
      return result.meta.changes === 1 ? { claim_token: args[6] } : null;
    }
    if (sql.startsWith("UPDATE operational_alerts SET claim_token")) {
      const [claimToken, leaseExpiresAt, now, attemptedAt, alertId, reclaimBefore, windowAfter] = args;
      const row = db.operationalAlerts.get(alertId);
      if (!row || row.status !== "PENDING" || row.retry_blocked ||
          (row.claim_token != null && row.claim_expires_at > reclaimBefore) ||
          (row.first_delivery_attempt_at != null && row.first_delivery_attempt_at <= windowAfter) ||
          db.operationalAlertAttempts.has(claimToken)) return null;
      Object.assign(row, {
        claim_token: claimToken, claim_expires_at: leaseExpiresAt,
        first_delivery_attempt_at: row.first_delivery_attempt_at ?? now,
        delivery_occurrence_count: row.delivery_occurrence_count ?? row.occurrence_count,
        delivery_first_seen_at: row.delivery_first_seen_at ?? row.first_seen_at,
        delivery_last_seen_at: row.delivery_last_seen_at ?? row.last_seen_at,
        delivery_attempts: row.delivery_attempts + 1, last_delivery_attempt_at: attemptedAt,
      });
      db.operationalAlertAttempts.set(claimToken, {
        claim_token: claimToken, alert_id: alertId, started_at: attemptedAt,
        lease_expires_at: leaseExpiresAt, payload_sha256: row.payload_sha256 ?? null,
        status: "IN_FLIGHT", completed_at: null, error_code: null, http_status: null, retry_blocked: 0,
      });
      return { ...row };
    }
    if (sql.startsWith("SELECT status, last_error_code, completed_at FROM operational_monitor_runs")) {
      const row = db.operationalMonitorRuns.get(args[1]);
      return row?.monitor_key === args[0] ? { status: row.status,
        last_error_code: row.last_error_code, completed_at: row.completed_at ?? null } : null;
    }
    if (sql.startsWith("SELECT status, error_code, http_status, retry_blocked FROM operational_alert_attempts")) {
      const row = db.operationalAlertAttempts.get(args[1]);
      return row?.alert_id === args[0] ? { ...row } : null;
    }
    if (sql.startsWith("SELECT status FROM operational_alerts WHERE alert_id = ?")) {
      const row = db.operationalAlerts.get(args[0]);
      return row ? { status: row.status } : null;
    }
    if (sql.startsWith("SELECT COUNT(*) AS blocked_count FROM operational_alerts")) {
      return { blocked_count: [...db.operationalAlerts.values()]
        .filter((row) => row.status === "PENDING" && row.retry_blocked === 1).length };
    }
    if (sql.startsWith("SELECT status, last_started_at, last_completed_at FROM operational_heartbeats")) {
      const row = db.operationalHeartbeats.get(args[0]);
      if (!row) return null;
      return {
        status: row.status,
        last_started_at: row.last_started_at,
        last_completed_at: row.last_completed_at ?? null,
      };
    }
    if (sql.startsWith("SELECT COUNT(*) AS unresolved_stale_count, MIN(queued_at) AS oldest_unresolved_queued_at FROM operational_queue_canaries WHERE status = 'STALE' AND received_at IS NULL")) {
      const unresolved = [...db.operationalCanaries.values()]
        .filter((row) => row.status === "STALE" && row.received_at == null);
      return {
        unresolved_stale_count: unresolved.length,
        oldest_unresolved_queued_at: unresolved.length > 0
          ? Math.min(...unresolved.map((row) => row.queued_at))
          : null,
      };
    }
    if (sql.startsWith("SELECT COUNT(*) AS pending_count FROM operational_alerts")) {
      return {
        pending_count: [...db.operationalAlerts.values()]
          .filter((row) => row.status === "PENDING").length,
      };
    }
    if (sql.startsWith("SELECT SUM(CASE WHEN email_delivery_status = 'FAILED'")) {
      const [emailStaleBefore, resendStaleBefore] = args;
      const active = [...db.fulfillments.values()].filter((row) => row.status === "ACTIVE");
      return {
        email_failed: active.filter((row) => row.email_delivery_status === "FAILED").length,
        email_stale: active.filter((row) =>
          row.email_delivery_status === "PENDING" && row.created_at <= emailStaleBefore).length,
        resend_failed: active.filter((row) => row.resend_status === "FAILED").length,
        resend_stale: active.filter((row) =>
          row.resend_status === "PENDING" &&
          (row.resend_processing_started_at == null || row.resend_processing_started_at <= resendStaleBefore)).length,
      };
    }
    if (sql.startsWith("SELECT request_count FROM rate_limits")) {
      return db.rateLimits.get(`${args[0]}:${args[1]}`) || null;
    }
    if (sql.startsWith("UPDATE fulfillments SET resend_sequence = CASE")) {
      const [now, claimToken, fulfillmentId, staleBefore] = args;
      const row = db.fulfillments.get(fulfillmentId);
      const reclaimable = row?.resend_status === "PENDING" && row.resend_processing_started_at <= staleBefore;
      if (
        !row || row.status !== "ACTIVE" ||
        (![null, undefined, "SENT", "FAILED"].includes(row.resend_status) && !reclaimable)
      ) return null;
      if (row.resend_status !== "PENDING") row.resend_sequence = Number(row.resend_sequence || 0) + 1;
      row.resend_status = "PENDING";
      row.resend_processing_started_at = now;
      row.resend_processing_token = claimToken;
      return {
        resend_sequence: row.resend_sequence,
        token_generation: row.token_generation,
        token_sha256: row.token_sha256,
      };
    }
    if (sql.startsWith("SELECT * FROM checkout_requests")) return db.checkouts.get(args[0]) || null;
    if (sql.startsWith("SELECT status, payload_sha256, attempts FROM webhook_events")) {
      return db.webhooks.get(args[0]) || null;
    }
    if (sql.startsWith("SELECT status, payload_sha256 FROM webhook_events")) {
      return db.webhooks.get(args[0]) || null;
    }
    if (sql.startsWith("SELECT event_id, event_type, object_id, payment_id, payload_sha256")) {
      return db.webhooks.get(args[0]) || null;
    }
    if (sql.startsWith("SELECT 1 AS owned FROM webhook_events")) {
      const row = db.webhooks.get(args[0]);
      return row?.status === "PROCESSING" && row.processing_token === args[1] ? { owned: 1 } : null;
    }
    if (sql.startsWith("SELECT reason_code FROM payment_blocks")) {
      return db.paymentBlocks.get(args[0]) || null;
    }
    if (sql.startsWith("SELECT * FROM florida_jurisdiction_datasets")) {
      return db.jurisdictionDatasets.get(args[0]) || null;
    }
    if (sql.startsWith("SELECT * FROM florida_sales_tax_rate_manifests")) {
      return db.rateManifests.get(args[0]) || null;
    }
    if (sql.startsWith("SELECT county_fips, state_rate_bps")) {
      return db.countyRates.get(`${args[0]}:${args[1]}`) || null;
    }
    if (sql.startsWith("SELECT * FROM physical_checkout_bindings WHERE request_key = ?")) {
      return db.physicalCheckouts.get(args[0]) || null;
    }
    if (sql.startsWith("SELECT * FROM physical_checkout_bindings WHERE square_order_id = ?")) {
      return [...db.physicalCheckouts.values()].find((row) => row.square_order_id === args[0]) || null;
    }
    if (sql.includes("FROM fulfillments WHERE token_sha256 = ?")) {
      return [...db.fulfillments.values()].find((item) => item.token_sha256 === args[0]) || null;
    }
    if (sql.startsWith("SELECT * FROM fulfillments WHERE payment_id = ? AND sku = ?")) {
      return [...db.fulfillments.values()].find(
        (row) => row.payment_id === args[0] && row.sku === args[1],
      ) || null;
    }
    throw new Error(`FakeD1 first() does not support: ${sql}`);
  }

  async all() {
    const { db, sql, args } = this;
    if (sql.startsWith("SELECT alert_id, alert_code, alert_bucket, occurrence_count")) {
      const [now, windowAfter, limit] = args;
      return {
        results: [...db.operationalAlerts.values()]
          .filter((row) => row.status === "PENDING" && !row.retry_blocked &&
            (row.claim_token == null || row.claim_expires_at <= now) &&
            (row.first_delivery_attempt_at == null || row.first_delivery_attempt_at > windowAfter))
          .sort((left, right) => left.first_seen_at - right.first_seen_at)
          .slice(0, limit)
          .map((row) => ({ ...row })),
      };
    }
    if (sql.startsWith("SELECT county_fips, state_rate_bps, surtax_rate_bps, combined_rate_bps") &&
        sql.includes("FROM florida_county_sales_tax_rates")) {
      const prefix = `${args[0]}:`;
      return {
        results: [...db.countyRates.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, row]) => ({ ...row }))
          .sort((left, right) => left.county_fips.localeCompare(right.county_fips)),
      };
    }
    if (sql.includes("FROM fulfillments WHERE order_id = ?")) {
      return {
        results: [...db.fulfillments.values()].filter(
          (item) => item.order_id === args[0] && item.status === "ACTIVE",
        ),
      };
    }
    if (sql.startsWith("SELECT * FROM physical_inventory_reservations WHERE request_key = ?")) {
      return {
        results: [...db.inventoryReservations.values()]
          .filter((row) => row.request_key === args[0])
          .sort((left, right) => left.sku.localeCompare(right.sku)),
      };
    }
    if (sql.startsWith("SELECT request_key, square_payment_link_id, square_order_id") &&
        sql.includes("FROM physical_checkout_bindings")) {
      const [now, limit] = args;
      return {
        results: [...db.physicalCheckouts.values()]
          .filter((row) => row.status === "LINK_CREATED" && row.square_payment_id === null && row.expires_at <= now)
          .sort((left, right) => left.expires_at - right.expires_at)
          .slice(0, limit)
          .map((row) => ({
            request_key: row.request_key,
            square_payment_link_id: row.square_payment_link_id,
            square_order_id: row.square_order_id,
          })),
      };
    }
    throw new Error(`FakeD1 all() does not support: ${sql}`);
  }
}

function changed(changes) {
  return { success: true, meta: { changes } };
}
