export async function consumeRateLimit(db, { bucketKey, now, windowSeconds, maximum }) {
  const bucketStart = Math.floor(now / windowSeconds) * windowSeconds;
  await db
    .prepare(
      `INSERT INTO rate_limits (bucket_key, bucket_start, request_count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(bucket_key, bucket_start)
       DO UPDATE SET request_count = request_count + 1, updated_at = excluded.updated_at`,
    )
    .bind(bucketKey, bucketStart, now)
    .run();
  const row = await db
    .prepare("SELECT request_count FROM rate_limits WHERE bucket_key = ? AND bucket_start = ?")
    .bind(bucketKey, bucketStart)
    .first();
  return {
    allowed: Number(row?.request_count || 0) <= maximum,
    remaining: Math.max(0, maximum - Number(row?.request_count || 0)),
    resetAt: bucketStart + windowSeconds,
  };
}

export async function cleanupOperationalState(db, now, batchSize = 100) {
  const safeBatchSize = Number.isSafeInteger(batchSize) ? Math.min(500, Math.max(1, batchSize)) : 100;
  const rateLimitCutoff = now - 24 * 60 * 60;
  const incompleteCheckoutCutoff = now - 7 * 24 * 60 * 60;
  const completedCheckoutCutoff = now - 30 * 24 * 60 * 60;
  const rateLimits = await db
    .prepare(
      `DELETE FROM rate_limits WHERE rowid IN (
         SELECT rowid FROM rate_limits WHERE updated_at < ? ORDER BY updated_at LIMIT ?
       )`,
    )
    .bind(rateLimitCutoff, safeBatchSize)
    .run();
  const checkouts = await db
    .prepare(
      `DELETE FROM checkout_requests WHERE rowid IN (
         SELECT rowid FROM checkout_requests
         WHERE request_kind <> 'PHYSICAL'
           AND ((status IN ('PENDING', 'PROCESSING', 'FAILED') AND updated_at < ?)
             OR (status = 'COMPLETED' AND updated_at < ?))
         ORDER BY updated_at LIMIT ?
       )`,
    )
    .bind(incompleteCheckoutCutoff, completedCheckoutCutoff, safeBatchSize)
    .run();
  return {
    rateLimits: Number(rateLimits?.meta?.changes || 0),
    checkoutRequests: Number(checkouts?.meta?.changes || 0),
  };
}

export async function getOrCreateCheckoutRequest(db, record) {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO checkout_requests
       (request_key, request_kind, request_hash, square_idempotency_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
    )
    .bind(
      record.requestKey,
      record.requestKind,
      record.requestHash,
      record.squareIdempotencyKey,
      record.now,
      record.now,
    )
    .run();
  const row = await db
    .prepare("SELECT * FROM checkout_requests WHERE request_key = ?")
    .bind(record.requestKey)
    .first();
  return { created: Number(result?.meta?.changes || 0) === 1, row };
}

export async function claimCheckoutRequest(db, record, leaseSeconds = 30) {
  const staleBefore = record.now - leaseSeconds;
  const result = await db
    .prepare(
      `UPDATE checkout_requests
       SET status = 'PROCESSING', processing_started_at = ?, processing_token = ?,
           updated_at = ?, last_error_code = NULL
       WHERE request_key = ?
         AND (status IN ('PENDING', 'FAILED')
              OR (status = 'PROCESSING' AND processing_started_at <= ?))`,
    )
    .bind(record.now, record.claimToken, record.now, record.requestKey, staleBefore)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function renewCheckoutClaim(db, record) {
  const result = await db
    .prepare(
      `UPDATE checkout_requests
       SET processing_started_at = ?, updated_at = ?
       WHERE request_key = ? AND status = 'PROCESSING' AND processing_token = ?`,
    )
    .bind(record.now, record.now, record.requestKey, record.claimToken)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function completeCheckoutRequest(db, requestKey, claimToken, link, now) {
  const result = await db
    .prepare(
      `UPDATE checkout_requests
       SET status = 'COMPLETED', checkout_url = ?, square_payment_link_id = ?,
           updated_at = ?, last_error_code = NULL, processing_started_at = NULL,
           processing_token = NULL
       WHERE request_key = ? AND status = 'PROCESSING' AND processing_token = ?`,
    )
    .bind(link.url, link.id || null, now, requestKey, claimToken)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function failCheckoutRequest(db, requestKey, claimToken, errorCode, now) {
  const result = await db
    .prepare(
      `UPDATE checkout_requests
       SET status = 'FAILED', updated_at = ?, last_error_code = ?,
           processing_started_at = NULL, processing_token = NULL
       WHERE request_key = ? AND status = 'PROCESSING' AND processing_token = ?`,
    )
    .bind(now, errorCode, requestKey, claimToken)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function recordWebhookEvent(db, event) {
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO webhook_events
       (event_id, event_type, object_id, payment_id, payload_sha256,
        event_created_at, status, attempts, received_at)
       VALUES (?, ?, ?, ?, ?, ?, 'RECEIVED', 0, ?)`,
    )
    .bind(
      event.id,
      event.type,
      event.objectId || null,
      event.paymentId || null,
      event.payloadHash,
      event.createdAt || null,
      event.now,
    )
    .run();
  const row = await db
    .prepare("SELECT status, payload_sha256 FROM webhook_events WHERE event_id = ?")
    .bind(event.id)
    .first();
  if (row?.payload_sha256 !== event.payloadHash) return { state: "HASH_MISMATCH" };
  return { state: Number(inserted?.meta?.changes || 0) === 1 ? "NEW" : row?.status || "UNKNOWN" };
}

export async function getWebhookEvent(db, eventId) {
  return db
    .prepare(
      `SELECT event_id, event_type, object_id, payment_id, payload_sha256,
              status, attempts, received_at
       FROM webhook_events WHERE event_id = ?`,
    )
    .bind(eventId)
    .first();
}

export async function markWebhookQueued(db, eventId, payloadHash) {
  const result = await db
    .prepare(
      `UPDATE webhook_events SET status = 'QUEUED'
       WHERE event_id = ? AND payload_sha256 = ? AND status IN ('RECEIVED', 'FAILED')`,
    )
    .bind(eventId, payloadHash)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function claimWebhookEvent(db, event, leaseSeconds = 120) {
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO webhook_events
       (event_id, event_type, object_id, payment_id, payload_sha256,
        event_created_at, status, attempts, received_at)
       VALUES (?, ?, ?, ?, ?, ?, 'RECEIVED', 0, ?)`,
    )
    .bind(
      event.id,
      event.type,
      event.objectId || null,
      event.paymentId || null,
      event.payloadHash,
      event.createdAt || null,
      event.now,
    )
    .run();
  const existing = await db
    .prepare("SELECT status, payload_sha256, attempts FROM webhook_events WHERE event_id = ?")
    .bind(event.id)
    .first();
  if (existing?.payload_sha256 !== event.payloadHash) {
    return { state: "HASH_MISMATCH", attempts: Number(existing?.attempts || 0) };
  }
  if (existing?.status === "PROCESSED") {
    return { state: "PROCESSED", attempts: Number(existing.attempts || 0) };
  }
  const staleBefore = event.now - leaseSeconds;
  const claimed = await db
    .prepare(
      `UPDATE webhook_events
       SET status = 'PROCESSING', attempts = attempts + 1,
           processing_started_at = ?, processing_token = ?, last_error_code = NULL
       WHERE event_id = ?
         AND (status IN ('RECEIVED', 'QUEUED', 'FAILED')
              OR (status = 'PROCESSING' AND processing_started_at <= ?))`,
    )
    .bind(event.now, event.claimToken, event.id, staleBefore)
    .run();
  if (Number(claimed?.meta?.changes || 0) !== 1) {
    return { state: "PROCESSING", attempts: Number(existing?.attempts || 0) };
  }
  return {
    state: Number(inserted?.meta?.changes || 0) === 1 ? "NEW" : "RETRY",
    attempts: Number(existing?.attempts || 0) + 1,
    claimToken: event.claimToken,
  };
}

export async function finishWebhookEvent(db, eventId, claimToken, now) {
  const result = await db
    .prepare(
      `UPDATE webhook_events
       SET status = 'PROCESSED', processed_at = ?, processing_started_at = NULL,
           processing_token = NULL, last_error_code = NULL
       WHERE event_id = ? AND status = 'PROCESSING' AND processing_token = ?`,
    )
    .bind(now, eventId, claimToken)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function hasWebhookClaim(db, eventId, claimToken) {
  const row = await db
    .prepare(
      `SELECT 1 AS owned FROM webhook_events
       WHERE event_id = ? AND status = 'PROCESSING' AND processing_token = ?`,
    )
    .bind(eventId, claimToken)
    .first();
  return row?.owned === 1;
}

export async function failWebhookEvent(db, eventId, claimToken, errorCode) {
  const result = await db
    .prepare(
      `UPDATE webhook_events
       SET status = 'FAILED', processing_started_at = NULL, processing_token = NULL,
           last_error_code = ?
       WHERE event_id = ? AND status = 'PROCESSING' AND processing_token = ?`,
    )
    .bind(errorCode, eventId, claimToken)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function insertFulfillment(db, record) {
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO fulfillments
       (fulfillment_id, payment_id, order_id, sku, buyer_email_sha256, status,
        token_sha256, token_generation, expires_at, download_count, max_downloads, created_at,
        email_delivery_status)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, 0, ?, ?, 'PENDING')`,
    )
    .bind(
      record.fulfillmentId,
      record.paymentId,
      record.orderId,
      record.sku,
      record.buyerEmailHash,
      record.tokenHash,
      record.tokenGeneration,
      record.expiresAt,
      record.maxDownloads,
      record.now,
    )
    .run();
  const row = await db
    .prepare("SELECT * FROM fulfillments WHERE payment_id = ? AND sku = ?")
    .bind(record.paymentId, record.sku)
    .first();
  return { created: Number(inserted?.meta?.changes || 0) === 1, row };
}

export async function updateEmailDelivery(db, fulfillmentId, tokenGeneration, delivery, now) {
  const result = await db
    .prepare(
      `UPDATE fulfillments
       SET email_delivery_status = ?, email_message_id = ?, last_email_at = ?
       WHERE fulfillment_id = ? AND token_generation = ?`,
    )
    .bind(delivery.status, delivery.messageId || null, now, fulfillmentId, tokenGeneration)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function refreshPendingFulfillmentExpiry(db, record) {
  const result = await db
    .prepare(
      `UPDATE fulfillments SET expires_at = ?
       WHERE fulfillment_id = ? AND status = 'ACTIVE' AND token_sha256 = ?
         AND email_delivery_status IN ('PENDING', 'FAILED')`,
    )
    .bind(record.expiresAt, record.fulfillmentId, record.tokenHash)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function recordFulfillmentReview(db, review) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO fulfillment_reviews
       (review_id, event_id, payment_id, order_id, reason_code, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      review.eventId || null,
      review.paymentId || null,
      review.orderId || null,
      review.reasonCode,
      JSON.stringify(review.details || {}),
      review.now,
    )
    .run();
}

export async function revokeFulfillments(db, { paymentId, sku = null, now }) {
  const query = sku
    ? `UPDATE fulfillments SET status = 'REVOKED', revoked_at = ?
       WHERE payment_id = ? AND sku = ? AND status = 'ACTIVE'`
    : `UPDATE fulfillments SET status = 'REVOKED', revoked_at = ?
       WHERE payment_id = ? AND status = 'ACTIVE'`;
  const binding = sku ? [now, paymentId, sku] : [now, paymentId];
  const result = await db.prepare(query).bind(...binding).run();
  return Number(result?.meta?.changes || 0);
}

export async function blockPayment(db, record) {
  await db
    .prepare(
      `INSERT INTO payment_blocks (payment_id, reason_code, event_id, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(payment_id) DO UPDATE SET
         reason_code = CASE
           WHEN payment_blocks.reason_code = 'DISPUTE' THEN payment_blocks.reason_code
           ELSE excluded.reason_code
         END,
         event_id = CASE
           WHEN payment_blocks.reason_code = 'DISPUTE' THEN payment_blocks.event_id
           ELSE excluded.event_id
         END,
         created_at = MIN(payment_blocks.created_at, excluded.created_at)`,
    )
    .bind(record.paymentId, record.reasonCode, record.eventId, record.now)
    .run();
}

export async function isPaymentBlocked(db, paymentId) {
  const row = await db
    .prepare("SELECT reason_code FROM payment_blocks WHERE payment_id = ?")
    .bind(paymentId)
    .first();
  return row?.reason_code || null;
}

export async function getActiveFulfillmentsByOrder(db, orderId) {
  const result = await db
    .prepare(
      `SELECT fulfillment_id, payment_id, order_id, sku, status, token_sha256,
              token_generation, email_delivery_status, resend_sequence, resend_status
       FROM fulfillments WHERE order_id = ? AND status = 'ACTIVE' ORDER BY sku`,
    )
    .bind(orderId)
    .all();
  return result?.results || [];
}

export async function claimResendAttempt(db, record, leaseSeconds = 30) {
  const staleBefore = record.now - leaseSeconds;
  return db
    .prepare(
      `UPDATE fulfillments
       SET resend_sequence = CASE
             WHEN resend_status = 'PENDING' THEN resend_sequence
             ELSE resend_sequence + 1
           END,
           resend_status = 'PENDING', resend_processing_started_at = ?,
           resend_processing_token = ?
       WHERE fulfillment_id = ? AND status = 'ACTIVE'
         AND (resend_status IS NULL OR resend_status IN ('SENT', 'FAILED')
              OR (resend_status = 'PENDING' AND resend_processing_started_at <= ?))
       RETURNING resend_sequence, token_generation, token_sha256`,
    )
    .bind(record.now, record.claimToken, record.fulfillmentId, staleBefore)
    .first();
}

export async function finishResendAttempt(db, record) {
  const result = await db
    .prepare(
      `UPDATE fulfillments
       SET resend_status = ?, resend_processing_started_at = NULL,
           resend_processing_token = NULL,
           expires_at = CASE WHEN ? = 'SENT' THEN ? ELSE expires_at END,
           download_count = CASE WHEN ? = 'SENT' THEN 0 ELSE download_count END,
           last_email_at = CASE WHEN ? = 'SENT' THEN ? ELSE last_email_at END,
           email_message_id = CASE WHEN ? = 'SENT' THEN ? ELSE email_message_id END
       WHERE fulfillment_id = ? AND status = 'ACTIVE' AND resend_sequence = ?
         AND resend_status = 'PENDING' AND resend_processing_token = ?`,
    )
    .bind(
      record.status,
      record.status,
      record.expiresAt,
      record.status,
      record.status,
      record.now,
      record.status,
      record.messageId || null,
      record.fulfillmentId,
      record.sequence,
      record.claimToken,
    )
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function releaseResendAttempt(db, record) {
  const result = await db
    .prepare(
      `UPDATE fulfillments
       SET resend_processing_started_at = 0, resend_processing_token = NULL
       WHERE fulfillment_id = ? AND resend_sequence = ? AND resend_status = 'PENDING'
         AND resend_processing_token = ?`,
    )
    .bind(record.fulfillmentId, record.sequence, record.claimToken)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function findDownload(db, tokenHash) {
  return db
    .prepare(
      `SELECT fulfillment_id, payment_id, order_id, sku, status, expires_at,
              download_count, max_downloads
       FROM fulfillments WHERE token_sha256 = ?`,
    )
    .bind(tokenHash)
    .first();
}

export async function consumeDownload(db, tokenHash, now) {
  const result = await db
    .prepare(
      `UPDATE fulfillments SET download_count = download_count + 1
       WHERE token_sha256 = ? AND status = 'ACTIVE' AND expires_at > ?
         AND download_count < max_downloads`,
    )
    .bind(tokenHash, now)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function upsertSubscriptionEvent(db, record) {
  await db
    .prepare(
      `INSERT INTO subscription_events
       (subscription_id, last_event_id, status, plan_variation_id, square_version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(subscription_id) DO UPDATE SET
         last_event_id = excluded.last_event_id,
         status = excluded.status,
         plan_variation_id = excluded.plan_variation_id,
         square_version = excluded.square_version,
         updated_at = excluded.updated_at
       WHERE excluded.square_version > subscription_events.square_version`,
    )
    .bind(
      record.subscriptionId,
      record.eventId,
      record.status || null,
      record.planVariationId || null,
      record.squareVersion,
      record.now,
    )
    .run();
}

export async function insertPhysicalCheckoutBinding(db, record) {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO physical_checkout_bindings
       (request_key, square_payment_link_id, square_order_id, items_json, address_hmac,
        state_code, county_fips, combined_rate_bps, dataset_version, rate_table_version,
        resolution_method, merchandise_cents, shipping_cents, shipping_tax_cents, tax_cents, total_cents,
        status, created_at, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LINK_CREATED', ?, ?, ?)`,
    )
    .bind(
      record.requestKey,
      record.paymentLinkId,
      record.orderId,
      record.itemsJson,
      record.addressHmac,
      record.stateCode,
      record.countyFips || null,
      record.combinedRateBps,
      record.datasetVersion || null,
      record.rateTableVersion || null,
      record.resolutionMethod,
      record.merchandiseCents,
      record.shippingCents,
      record.shippingTaxCents,
      record.taxCents,
      record.totalCents,
      record.now,
      record.expiresAt,
      record.now,
    )
    .run();
  const row = await db
    .prepare("SELECT * FROM physical_checkout_bindings WHERE request_key = ?")
    .bind(record.requestKey)
    .first();
  return { created: Number(result?.meta?.changes || 0) === 1, row };
}

export async function getPhysicalCheckoutByOrder(db, orderId) {
  return db
    .prepare("SELECT * FROM physical_checkout_bindings WHERE square_order_id = ?")
    .bind(orderId)
    .first();
}

export async function getPhysicalCheckoutByRequest(db, requestKey) {
  return db
    .prepare("SELECT * FROM physical_checkout_bindings WHERE request_key = ?")
    .bind(requestKey)
    .first();
}

export async function claimPhysicalPayment(db, record) {
  const result = await db
    .prepare(
      `UPDATE physical_checkout_bindings
       SET square_payment_id = ?, status = 'PAYMENT_PROCESSING', updated_at = ?
       WHERE square_order_id = ? AND status IN ('LINK_CREATED', 'EXPIRED') AND square_payment_id IS NULL`,
    )
    .bind(record.paymentId, record.now, record.orderId)
    .run();
  const row = await getPhysicalCheckoutByOrder(db, record.orderId);
  if (Number(result?.meta?.changes || 0) === 1) return { state: "CLAIMED", row };
  if (row?.square_payment_id === record.paymentId) return { state: "DUPLICATE", row };
  return { state: "REJECTED", row };
}

export async function finishPhysicalPaymentReview(db, record) {
  const result = await db
    .prepare(
      `UPDATE physical_checkout_bindings
       SET status = ?, hold_reason = ?, updated_at = ?
       WHERE square_order_id = ? AND square_payment_id = ? AND status = 'PAYMENT_PROCESSING'`,
    )
    .bind(record.status, record.holdReason || null, record.now, record.orderId, record.paymentId)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function markPhysicalPaymentEvent(db, record) {
  const result = await db
    .prepare(
      `UPDATE physical_checkout_bindings
       SET status = CASE WHEN status = 'DISPUTED' THEN status ELSE ? END,
           hold_reason = CASE WHEN status = 'DISPUTED' THEN hold_reason ELSE ? END,
           updated_at = CASE WHEN status = 'DISPUTED' THEN updated_at ELSE ? END
       WHERE square_payment_id = ? AND status <> 'EXPIRED'`,
    )
    .bind(record.status, record.reasonCode || null, record.now, record.paymentId)
    .run();
  return Number(result?.meta?.changes || 0);
}

export async function markPhysicalPaymentEventByOrder(db, record) {
  const result = await db
    .prepare(
      `UPDATE physical_checkout_bindings
       SET square_payment_id = COALESCE(square_payment_id, ?),
           status = CASE WHEN status = 'DISPUTED' THEN status ELSE ? END,
           hold_reason = CASE WHEN status = 'DISPUTED' THEN hold_reason ELSE ? END,
           updated_at = CASE WHEN status = 'DISPUTED' THEN updated_at ELSE ? END
       WHERE square_order_id = ?
         AND (square_payment_id IS NULL OR square_payment_id = ?)
         AND status <> 'EXPIRED'`,
    )
    .bind(
      record.paymentId,
      record.status,
      record.reasonCode || null,
      record.now,
      record.orderId,
      record.paymentId,
    )
    .run();
  const row = await getPhysicalCheckoutByOrder(db, record.orderId);
  return { changed: Number(result?.meta?.changes || 0) === 1, row };
}

export async function listExpiredPhysicalLinks(db, now, limit = 25) {
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 25;
  const result = await db
    .prepare(
      `SELECT request_key, square_payment_link_id, square_order_id
       FROM physical_checkout_bindings
       WHERE status = 'LINK_CREATED' AND square_payment_id IS NULL AND expires_at <= ?
       ORDER BY expires_at LIMIT ?`,
    )
    .bind(now, safeLimit)
    .all();
  return result?.results || [];
}

export async function markPhysicalLinkExpired(db, requestKey, now) {
  const result = await db
    .prepare(
      `UPDATE physical_checkout_bindings
       SET status = 'EXPIRED', updated_at = ?
       WHERE request_key = ? AND status = 'LINK_CREATED' AND square_payment_id IS NULL`,
    )
    .bind(now, requestKey)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function reservePhysicalInventory(db, record) {
  if (typeof record.claimToken !== "string" || !record.claimToken) return false;
  await db
    .prepare("DELETE FROM physical_inventory_reservations WHERE request_key = ? AND status = 'RELEASED'")
    .bind(record.requestKey)
    .run();
  const existingResult = await db
    .prepare("SELECT * FROM physical_inventory_reservations WHERE request_key = ? ORDER BY sku")
    .bind(record.requestKey)
    .all();
  const existingBySku = new Map((existingResult?.results || []).map((row) => [row.sku, row]));
  const reserved = [];
  if (existingBySku.size > 0) {
    if (existingBySku.size > record.items.length) return false;
    const requestedBySku = new Map(record.items.map((item) => [item.product.sku, item]));
    const exact = [...existingBySku.values()].every((existing) => {
      const item = requestedBySku.get(existing.sku);
      return item && existing.status === "ACTIVE" &&
        existing.catalog_object_id === item.catalogObjectId && existing.quantity === item.quantity;
    });
    if (!exact) return false;
    await db
      .prepare(
        `UPDATE physical_inventory_reservations
         SET claim_token = ?, updated_at = ?
         WHERE request_key = ? AND status = 'ACTIVE'
           AND EXISTS (
             SELECT 1 FROM checkout_requests
             WHERE request_key = ? AND status = 'PROCESSING' AND processing_token = ?
           )`,
      )
      .bind(record.claimToken, record.now, record.requestKey, record.requestKey, record.claimToken)
      .run();
    const transferred = await db
      .prepare("SELECT * FROM physical_inventory_reservations WHERE request_key = ? ORDER BY sku")
      .bind(record.requestKey)
      .all();
    if (
      transferred?.results?.length !== existingBySku.size ||
      !transferred.results.every((row) => row.status === "ACTIVE" && row.claim_token === record.claimToken)
    ) return false;
    reserved.push(...transferred.results.map((row) => row.sku));
    if (existingBySku.size === record.items.length) return true;
  }
  for (const item of record.items) {
    if (existingBySku.has(item.product.sku)) continue;
    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO physical_inventory_reservations
         (request_key, sku, catalog_object_id, quantity, source_in_stock_count,
          claim_token, status, created_at, expires_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM checkout_requests
           WHERE request_key = ? AND status = 'PROCESSING' AND processing_token = ?
         ) AND ? <= ? - COALESCE((
           SELECT SUM(quantity) FROM physical_inventory_reservations
           WHERE catalog_object_id = ? AND status IN ('ACTIVE', 'ORPHANED_REVIEW', 'PAID_PENDING')
         ), 0)`,
      )
      .bind(
        record.requestKey,
        item.product.sku,
        item.catalogObjectId,
        item.quantity,
        item.inventoryCount,
        record.claimToken,
        record.now,
        record.expiresAt,
        record.now,
        record.requestKey,
        record.claimToken,
        item.quantity,
        item.inventoryCount,
        item.catalogObjectId,
      )
      .run();
    if (Number(result?.meta?.changes || 0) !== 1) {
      await releasePhysicalInventoryReservations(db, record.requestKey, record.now, record.claimToken);
      return false;
    }
    reserved.push(item.product.sku);
  }
  return reserved.length === record.items.length;
}

function reservationsMatchItems(rows, expectedItems, allowedStatuses) {
  if (!Array.isArray(expectedItems) || rows.length !== expectedItems.length) return false;
  if (expectedItems.some((item) => {
    const sku = item.sku || item.product?.sku;
    const catalogObjectId = item.catalog_object_id || item.catalogObjectId;
    return typeof sku !== "string" || !sku || typeof catalogObjectId !== "string" || !catalogObjectId ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1;
  })) return false;
  const expected = new Map(expectedItems.map((item) => [item.sku || item.product?.sku, item]));
  if (expected.size !== expectedItems.length) return false;
  return rows.every((row) => {
    const item = expected.get(row.sku);
    return item && item.quantity === row.quantity &&
      (item.catalog_object_id || item.catalogObjectId) === row.catalog_object_id &&
      allowedStatuses.has(row.status);
  });
}

export async function markPhysicalInventoryPaid(db, requestKey, expectedItems, now) {
  const before = await db
    .prepare("SELECT * FROM physical_inventory_reservations WHERE request_key = ? ORDER BY sku")
    .bind(requestKey)
    .all();
  if (!reservationsMatchItems(before?.results || [], expectedItems, new Set(["ACTIVE", "PAID_PENDING", "SOLD_VERIFIED"]))) {
    return false;
  }
  await db
    .prepare(
      `UPDATE physical_inventory_reservations
       SET status = 'PAID_PENDING', expires_at = 2147483647, updated_at = ?
       WHERE request_key = ? AND status = 'ACTIVE'`,
    )
    .bind(now, requestKey)
    .run();
  const rows = await db
    .prepare("SELECT * FROM physical_inventory_reservations WHERE request_key = ? ORDER BY sku")
    .bind(requestKey)
    .all();
  return reservationsMatchItems(
    rows?.results || [],
    expectedItems,
    new Set(["PAID_PENDING", "SOLD_VERIFIED"]),
  );
}

export async function markPhysicalInventorySoldVerified(db, requestKey, expectedItems, now) {
  const before = await db
    .prepare("SELECT * FROM physical_inventory_reservations WHERE request_key = ? ORDER BY sku")
    .bind(requestKey)
    .all();
  if (!reservationsMatchItems(before?.results || [], expectedItems, new Set(["PAID_PENDING", "SOLD_VERIFIED"]))) {
    return false;
  }
  await db
    .prepare(
      `UPDATE physical_inventory_reservations
       SET status = 'SOLD_VERIFIED', updated_at = ?
       WHERE request_key = ? AND status = 'PAID_PENDING'`,
    )
    .bind(now, requestKey)
    .run();
  const rows = await db
    .prepare("SELECT * FROM physical_inventory_reservations WHERE request_key = ? ORDER BY sku")
    .bind(requestKey)
    .all();
  return reservationsMatchItems(rows?.results || [], expectedItems, new Set(["SOLD_VERIFIED"]));
}

export async function releasePhysicalInventoryReservations(db, requestKey, now, claimToken = null) {
  const statement = claimToken
    ? `UPDATE physical_inventory_reservations
       SET status = 'RELEASED', updated_at = ?
       WHERE request_key = ? AND status = 'ACTIVE' AND claim_token = ?
         AND EXISTS (
           SELECT 1 FROM checkout_requests
           WHERE request_key = ? AND status = 'PROCESSING' AND processing_token = ?
         )`
    : `UPDATE physical_inventory_reservations
       SET status = 'RELEASED', updated_at = ?
       WHERE request_key = ? AND status = 'ACTIVE'`;
  const result = await db
    .prepare(statement)
    .bind(...(claimToken
      ? [now, requestKey, claimToken, requestKey, claimToken]
      : [now, requestKey]))
    .run();
  return Number(result?.meta?.changes || 0);
}

export async function reconcileExpiredPhysicalReservations(db, now) {
  const result = await db
    .prepare(
      `UPDATE physical_inventory_reservations
       SET status = 'RELEASED', updated_at = ?
       WHERE status = 'ACTIVE' AND request_key IN (
         SELECT request_key FROM physical_checkout_bindings WHERE status = 'EXPIRED'
       )`,
    )
    .bind(now)
    .run();
  return Number(result?.meta?.changes || 0);
}

export async function markStaleUnboundPhysicalReservationsForReview(db, now) {
  const result = await db
    .prepare(
      `UPDATE physical_inventory_reservations
       SET status = 'ORPHANED_REVIEW', updated_at = ?
       WHERE status = 'ACTIVE' AND expires_at <= ?
         AND NOT EXISTS (
           SELECT 1 FROM physical_checkout_bindings
           WHERE physical_checkout_bindings.request_key = physical_inventory_reservations.request_key
         )`,
    )
    .bind(now, now)
    .run();
  return Number(result?.meta?.changes || 0);
}

export async function startOperationalHeartbeat(db, record) {
  await db
    .prepare(
      `INSERT INTO operational_heartbeats
       (monitor_key, run_token, last_started_at, last_completed_at, status,
        last_error_code, updated_at)
       VALUES (?, ?, ?, NULL, 'RUNNING', NULL, ?)
       ON CONFLICT(monitor_key) DO UPDATE SET
         run_token = excluded.run_token,
         last_started_at = excluded.last_started_at,
         status = 'RUNNING',
         last_error_code = NULL,
         updated_at = excluded.updated_at`,
    )
    .bind(record.monitorKey, record.runToken, record.now, record.now)
    .run();
}

export async function finishOperationalHeartbeat(db, record) {
  const result = await db
    .prepare(
      `UPDATE operational_heartbeats
       SET last_completed_at = ?, status = ?, last_error_code = ?, updated_at = ?
       WHERE monitor_key = ? AND run_token = ?`,
    )
    .bind(
      record.now,
      record.status,
      record.errorCode || null,
      record.now,
      record.monitorKey,
      record.runToken,
    )
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function getOperationalHealthSnapshot(db, monitorKey) {
  const heartbeat = await db
    .prepare(
      `SELECT status, last_started_at, last_completed_at
       FROM operational_heartbeats WHERE monitor_key = ?`,
    )
    .bind(monitorKey)
    .first();
  const pending = await db
    .prepare(
      `SELECT COUNT(*) AS pending_count
       FROM operational_alerts WHERE status = 'PENDING'`,
    )
    .first();
  return {
    heartbeat,
    pendingAlerts: Number(pending?.pending_count || 0),
  };
}

export async function createOperationalCanary(db, record) {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO operational_queue_canaries
       (canary_id, status, queued_at, received_at, updated_at)
       VALUES (?, 'PENDING', ?, NULL, ?)`,
    )
    .bind(record.canaryId, record.now, record.now)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function markOperationalCanaryQueued(db, canaryId, now) {
  const result = await db
    .prepare(
      `UPDATE operational_queue_canaries SET status = 'QUEUED', updated_at = ?
       WHERE canary_id = ? AND status = 'PENDING'`,
    )
    .bind(now, canaryId)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function markOperationalCanarySendFailed(db, canaryId, now) {
  const result = await db
    .prepare(
      `UPDATE operational_queue_canaries SET status = 'SEND_FAILED', updated_at = ?
       WHERE canary_id = ? AND status = 'PENDING'`,
    )
    .bind(now, canaryId)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function receiveOperationalCanary(db, record) {
  const result = await db
    .prepare(
      `UPDATE operational_queue_canaries
       SET status = 'RECEIVED', received_at = ?, updated_at = ?
       WHERE canary_id = ? AND queued_at = ? AND status <> 'RECEIVED'`,
    )
    .bind(record.now, record.now, record.canaryId, record.queuedAt)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function markStaleOperationalCanaries(db, staleBefore, now) {
  const result = await db
    .prepare(
      `UPDATE operational_queue_canaries SET status = 'STALE', updated_at = ?
       WHERE status IN ('PENDING', 'QUEUED') AND queued_at <= ?`,
    )
    .bind(now, staleBefore)
    .run();
  return Number(result?.meta?.changes || 0);
}

export async function cleanupOperationalCanaries(db, receivedBefore, limit = 500) {
  const result = await db
    .prepare(
      `DELETE FROM operational_queue_canaries WHERE rowid IN (
         SELECT rowid FROM operational_queue_canaries
         WHERE status = 'RECEIVED' AND received_at < ?
         ORDER BY received_at ASC LIMIT ?
       )`,
    )
    .bind(receivedBefore, limit)
    .run();
  return Number(result?.meta?.changes || 0);
}

export async function recordOperationalDlqReceipt(db, record) {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO operational_dlq_receipts (receipt_sha256, received_at)
       VALUES (?, ?)`,
    )
    .bind(record.receiptHash, record.now)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function recordOperationalAlert(db, record) {
  const alertBucket = Math.floor(record.now / record.repeatSeconds);
  const alertId = `${record.alertCode}:${alertBucket}`;
  await db
    .prepare(
      `INSERT INTO operational_alerts
       (alert_id, alert_code, alert_bucket, status, occurrence_count,
        first_seen_at, last_seen_at, delivery_attempts)
       VALUES (?, ?, ?, 'PENDING', ?, ?, ?, 0)
       ON CONFLICT(alert_code, alert_bucket) DO UPDATE SET
         occurrence_count = operational_alerts.occurrence_count + excluded.occurrence_count,
         last_seen_at = excluded.last_seen_at`,
    )
    .bind(
      alertId,
      record.alertCode,
      alertBucket,
      record.occurrences || 1,
      record.now,
      record.now,
    )
    .run();
  return alertId;
}

export async function listPendingOperationalAlerts(db, limit = 10) {
  const result = await db
    .prepare(
      `SELECT alert_id, alert_code, alert_bucket, occurrence_count,
              first_seen_at, last_seen_at, delivery_attempts
       FROM operational_alerts WHERE status = 'PENDING'
       ORDER BY first_seen_at ASC LIMIT ?`,
    )
    .bind(limit)
    .all();
  return result?.results || [];
}

export async function markOperationalAlertSent(db, alertId, now) {
  const result = await db
    .prepare(
      `UPDATE operational_alerts
       SET status = 'SENT', delivery_attempts = delivery_attempts + 1,
           last_delivery_attempt_at = ?, delivered_at = ?, last_delivery_error_code = NULL
       WHERE alert_id = ? AND status = 'PENDING'`,
    )
    .bind(now, now, alertId)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function markOperationalAlertFailed(db, alertId, errorCode, now) {
  const result = await db
    .prepare(
      `UPDATE operational_alerts
       SET delivery_attempts = delivery_attempts + 1,
           last_delivery_attempt_at = ?, last_delivery_error_code = ?
       WHERE alert_id = ? AND status = 'PENDING'`,
    )
    .bind(now, errorCode, alertId)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function countFulfillmentDeliveryIssues(db, staleBefore) {
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN email_delivery_status = 'FAILED' THEN 1 ELSE 0 END) AS email_failed,
         SUM(CASE WHEN email_delivery_status = 'PENDING' AND created_at <= ? THEN 1 ELSE 0 END) AS email_stale,
         SUM(CASE WHEN resend_status = 'FAILED' THEN 1 ELSE 0 END) AS resend_failed,
         SUM(CASE WHEN resend_status = 'PENDING'
                   AND (resend_processing_started_at IS NULL OR resend_processing_started_at <= ?)
             THEN 1 ELSE 0 END) AS resend_stale
       FROM fulfillments WHERE status = 'ACTIVE'`,
    )
    .bind(staleBefore, staleBefore)
    .first();
  return {
    emailFailed: Number(row?.email_failed || 0),
    emailStale: Number(row?.email_stale || 0),
    resendFailed: Number(row?.resend_failed || 0),
    resendStale: Number(row?.resend_stale || 0),
  };
}
