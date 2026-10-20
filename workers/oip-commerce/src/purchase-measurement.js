// Optional purchase reporting. Payment/fulfillment never depends on Google.
// All settings are OFF unless an approved production configuration enables them.
const CONTEXT_KEYS = 'captured_at,client_id,consent,session_id,version';
const ORDER_ID = /^[A-Za-z0-9_-]{1,192}$/u;
const MEASUREMENT_ID = /^G-[A-Z0-9]{6,20}$/u;
const EPUB_SKU = /^OIP-[A-Z]+-EPUB$/u;
const MERCHANT_ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MAX_CONTEXT_AGE = 30 * 60;
const MAX_SESSION_AGE = 24 * 60 * 60;

export function normalizePurchaseMeasurement(value, now) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== CONTEXT_KEYS || value.version !== 1 ||
      value.consent !== 'granted' || typeof value.client_id !== 'string' ||
      !/^[0-9]{1,20}\.[0-9]{1,20}$/u.test(value.client_id) ||
      typeof value.session_id !== 'string' || !/^[1-9][0-9]{0,15}$/u.test(value.session_id) ||
      !Number.isSafeInteger(value.captured_at) || !Number.isSafeInteger(now)) return null;
  const sessionStart = Number(value.session_id);
  if (!Number.isSafeInteger(sessionStart) || value.captured_at > now + 5 ||
      now - value.captured_at > MAX_CONTEXT_AGE || sessionStart > value.captured_at + 5 ||
      value.captured_at - sessionStart > MAX_SESSION_AGE) return null;
  return { version: 1, consent: 'granted', client_id: value.client_id,
    session_id: value.session_id, captured_at: value.captured_at };
}

function configuredMode(env) {
  return ['live', 'test'].includes(env.GA4_PURCHASE_MODE) ? env.GA4_PURCHASE_MODE : 'off';
}

function productionSquare(env) {
  return env.SQUARE_API_BASE_URL === 'https://connect.squareup.com' &&
    env.DOWNLOAD_BASE_URL === 'https://downloads.outsideinprint.org';
}

function activationCutoff(env) {
  const value = String(env.GA4_PURCHASE_LIVE_AFTER || '');
  if (!/^[1-9][0-9]{8,11}$/u.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function merchantItemId(env, sku) {
  const raw = env.GA4_MERCHANT_ITEM_IDS;
  if (typeof sku !== 'string' || !EPUB_SKU.test(sku) ||
      typeof raw !== 'string' || raw.length > 4096) return null;
  try {
    const mapping = JSON.parse(raw);
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return null;
    const entries = Object.entries(mapping);
    const ids = new Set();
    if (entries.length < 1 || entries.length > 50) return null;
    for (const [key, value] of entries) {
      if (!EPUB_SKU.test(key) || typeof value !== 'string' ||
          !MERCHANT_ITEM_ID.test(value) || ids.has(value)) return null;
      ids.add(value);
    }
    return Object.hasOwn(mapping, sku) ? mapping[sku] : null;
  } catch { return null; }
}

// Call only on a newly created checkout. Retries cannot add consent, change the
// original trusted mode, or retroactively make an older checkout eligible.
export async function preparePurchaseMeasurement(env, { requestKey, created, sku, measurement, now }) {
  if (!created || configuredMode(env) === 'off') return { state: 'OFF' };
  try {
    const context = normalizePurchaseMeasurement(measurement, now);
    const cutoff = activationCutoff(env);
    const mappedItemId = merchantItemId(env, sku);
    let mode = configuredMode(env) === 'test' ? 'test' : 'excluded';
    if (configuredMode(env) === 'live' && context && productionSquare(env) &&
        env.PUBLIC_HOST === 'downloads.outsideinprint.org' &&
        MEASUREMENT_ID.test(String(env.GA4_MEASUREMENT_ID || '')) &&
        mappedItemId !== null &&
        cutoff !== null && now >= cutoff && context.captured_at >= cutoff) mode = 'live';
    await env.DB.prepare(
      `INSERT OR IGNORE INTO purchase_measurement_checkouts
       (request_key, transaction_id, measurement_id, mode, product_sku, merchant_item_id, client_id, session_id, captured_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(requestKey, crypto.randomUUID(), mode === 'live' ? env.GA4_MEASUREMENT_ID : null,
      mode, mode === 'live' ? sku : null, mode === 'live' ? mappedItemId : null,
      mode === 'live' ? context.client_id : null,
      mode === 'live' ? context.session_id : null, mode === 'live' ? context.captured_at : null, now).run();
    return { state: mode.toUpperCase() };
  } catch {
    // No values or transport errors are logged. Missing bindings fail closed.
    return { state: 'UNAVAILABLE' };
  }
}

export async function bindPurchaseMeasurement(env, requestKey, orderId) {
  if (configuredMode(env) === 'off' || !ORDER_ID.test(String(orderId || ''))) return;
  try {
    await env.DB.prepare(
      `UPDATE purchase_measurement_checkouts SET square_order_id = ?
       WHERE request_key = ? AND square_order_id IS NULL`,
    ).bind(orderId, requestKey).run();
  } catch { /* Optional analytics must not prevent a paid checkout. */ }
}

export async function scrubExpiredPurchaseMeasurement(env, now) {
  // A live -> off kill switch must not stop deletion of earlier identifiers.
  // Legacy deployments with no optional configuration or schema remain inert.
  if (env.GA4_PURCHASE_MODE === undefined) return { state: 'OFF' };
  try {
    const result = await env.DB.prepare(
      `UPDATE purchase_measurement_checkouts SET client_id = NULL, session_id = NULL, captured_at = NULL
       WHERE request_key IN (SELECT request_key FROM purchase_measurement_checkouts
         WHERE captured_at IS NOT NULL AND CAST(session_id AS INTEGER) <= ? LIMIT 500)`,
    ).bind(now - MAX_SESSION_AGE).run();
    return { state: 'OK', scrubbed: Number(result?.meta?.changes || 0) };
  } catch { return { state: 'UNAVAILABLE' }; }
}

function paymentOccurrence(payment, now) {
  // updated_at changes for unrelated edits; only the provider's actual capture
  // timeline supports an honest purchase timestamp. Unsupported tenders omit
  // reporting while normal fulfillment continues.
  if (payment.card_details?.status !== 'CAPTURED') return null;
  const captured = Date.parse(payment.card_details?.card_payment_timeline?.captured_at);
  if (!Number.isFinite(captured) || captured > (now + 5) * 1000) return null;
  return Math.floor(captured / 1000);
}

function purchasePayload(binding, payment, order, evaluation, occurredAt) {
  if (payment.status !== 'COMPLETED' || payment.order_id !== order.id ||
      !evaluation?.eligible || !Array.isArray(evaluation.items) || evaluation.items.length !== 1 ||
      payment.amount_money?.currency !== 'USD' || order.total_money?.currency !== 'USD' ||
      !Number.isSafeInteger(payment.amount_money.amount) || payment.amount_money.amount <= 0 ||
      payment.amount_money.amount !== order.total_money.amount) return null;
  const items = [];
  let total = 0;
  for (const item of evaluation.items) {
    if (typeof item.sku !== 'string' || !EPUB_SKU.test(item.sku) ||
        item.sku !== binding.product_sku || !MERCHANT_ITEM_ID.test(binding.merchant_item_id || '') ||
        !item.product || item.product.sku !== item.sku || typeof item.product.title !== 'string' ||
        !Number.isSafeInteger(item.product.priceCents) || item.product.priceCents <= 0) return null;
    total += item.product.priceCents;
    items.push({ item_id: binding.merchant_item_id, item_name: item.product.title,
      price: item.product.priceCents / 100, quantity: 1 });
  }
  if (total !== payment.amount_money.amount) return null;
  return {
    client_id: binding.client_id,
    timestamp_micros: occurredAt * 1000000,
    consent: { ad_user_data: 'DENIED', ad_personalization: 'DENIED' },
    events: [{ name: 'purchase', params: {
      transaction_id: binding.transaction_id, session_id: Number(binding.session_id),
      currency: 'USD', value: total / 100, items,
    } }],
  };
}

async function emitVerifiedPurchase(env, { payment, order, evaluation, now }) {
  if (configuredMode(env) !== 'live' || !productionSquare(env) ||
      env.OPERATIONAL_ENVIRONMENT !== 'PRODUCTION') return { state: 'OFF' };
  const measurementId = String(env.GA4_MEASUREMENT_ID || '');
  const apiSecret = env.GA4_API_SECRET;
  const cutoff = activationCutoff(env);
  if (!MEASUREMENT_ID.test(measurementId) || typeof apiSecret !== 'string' ||
      !/^[A-Za-z0-9_-]{10,256}$/u.test(apiSecret) || cutoff === null || now < cutoff ||
      !ORDER_ID.test(String(order?.id || ''))) return { state: 'UNCONFIGURED' };
  const binding = await env.DB.prepare(
    'SELECT * FROM purchase_measurement_checkouts WHERE square_order_id = ?',
  ).bind(order.id).first();
  // Legacy orders, old links, missing consent, and trusted test mode never emit.
  if (!binding || binding.mode !== 'live' || binding.measurement_id !== measurementId ||
      merchantItemId(env, binding.product_sku) !== binding.merchant_item_id ||
      !Number.isSafeInteger(binding.captured_at) || binding.created_at < cutoff ||
      binding.captured_at < cutoff) return { state: 'INELIGIBLE' };
  const occurredAt = paymentOccurrence(payment, now);
  const sessionStart = Number(binding.session_id);
  if (occurredAt === null || occurredAt < binding.captured_at - 5 ||
      occurredAt > binding.captured_at + MAX_CONTEXT_AGE || occurredAt < cutoff ||
      occurredAt < sessionStart ||
      occurredAt > sessionStart + MAX_SESSION_AGE || now > sessionStart + MAX_SESSION_AGE ||
      !normalizePurchaseMeasurement({ version: 1, consent: 'granted', client_id: binding.client_id,
        session_id: binding.session_id, captured_at: binding.captured_at }, binding.captured_at)) {
    return { state: 'EXPIRED_OR_INVALID' };
  }
  const payload = purchasePayload(binding, payment, order, evaluation, occurredAt);
  if (!payload) return { state: 'INELIGIBLE' };
  // INSERT..SELECT makes exclusion lookup + unique claim one atomic operation.
  const claim = await env.DB.prepare(
    `INSERT OR IGNORE INTO purchase_measurement_deliveries
     (square_order_id, transaction_id, measurement_id, status, attempted_at)
     SELECT ?, ?, ?, 'ATTEMPTING', ?
     WHERE NOT EXISTS (SELECT 1 FROM purchase_measurement_exclusions WHERE square_order_id = ?)`,
  ).bind(order.id, binding.transaction_id, measurementId, now, order.id).run();
  if (Number(claim?.meta?.changes || 0) !== 1) return { state: 'SUPPRESSED_OR_ALREADY_ATTEMPTED' };
  // A second exclusion check catches suppression installed just after the claim.
  const excluded = await env.DB.prepare(
    'SELECT square_order_id FROM purchase_measurement_exclusions WHERE square_order_id = ?',
  ).bind(order.id).first();
  if (excluded) {
    await finishAttempt(env.DB, order.id, 'EXCLUDED', now, null, 'CONTROLLED_TEST');
    await scrubAttemptContext(env.DB, order.id);
    return { state: 'EXCLUDED' };
  }
  let status = 'UNKNOWN';
  let httpStatus = null;
  let reason = 'TRANSPORT_OUTCOME_UNKNOWN';
  try {
    const endpoint = new URL('https://www.google-analytics.com/mp/collect');
    endpoint.searchParams.set('measurement_id', measurementId);
    endpoint.searchParams.set('api_secret', apiSecret);
    const response = await (env.__testFetch || globalThis.fetch)(endpoint.href, {
      method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(3000),
    });
    httpStatus = response.status;
    status = response.ok ? 'SENT_UNVERIFIED' : 'REJECTED';
    reason = response.ok ? 'HTTP_ONLY_NOT_REPORTING_PROOF' : 'HTTP_REJECTED';
  } catch { /* Unknown acceptance is never retried automatically. */ }
  await finishAttempt(env.DB, order.id, status, now, httpStatus, reason);
  await scrubAttemptContext(env.DB, order.id);
  return { state: status };
}

async function scrubAttemptContext(db, orderId) {
  await db.prepare(
    `UPDATE purchase_measurement_checkouts SET client_id = NULL, session_id = NULL, captured_at = NULL
     WHERE square_order_id = ?`,
  ).bind(orderId).run();
}

async function finishAttempt(db, orderId, status, now, httpStatus, reason) {
  await db.prepare(
    `UPDATE purchase_measurement_deliveries SET status = ?, finished_at = ?, http_status = ?, reason_code = ?
     WHERE square_order_id = ? AND status = 'ATTEMPTING'`,
  ).bind(status, now, httpStatus, reason, orderId).run();
}

// Never throw into webhook/email retries. Even if finishing the ledger fails,
// the durable ATTEMPTING row blocks all later sends and means UNKNOWN to operators.
export async function maybeEmitVerifiedPurchase(env, inputs) {
  try { return await emitVerifiedPurchase(env, inputs); }
  catch { return { state: 'UNAVAILABLE_OR_UNKNOWN' }; }
}
