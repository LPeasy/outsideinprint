import {
  configuredEpubCatalogVariationId,
  enabledEpubSkus,
  enabledPaperbackSkus,
  productForSku,
} from "./catalog.js";
import { requireCloudflareAccessAdmin } from "./access.js";
import {
  claimCheckoutRequest,
  claimResendAttempt,
  cleanupOperationalState,
  completeCheckoutRequest,
  consumeDownload,
  consumeRateLimit,
  failCheckoutRequest,
  findDownload,
  getActiveFulfillmentsByOrder,
  getOrCreateCheckoutRequest,
  isPaymentBlocked,
  markWebhookQueued,
  recordWebhookEvent,
  recordFulfillmentReview,
  renewCheckoutClaim,
  finishResendAttempt,
  releaseResendAttempt,
  insertPhysicalCheckoutBinding,
  getPhysicalCheckoutByRequest,
  reservePhysicalInventory,
  releasePhysicalInventoryReservations,
} from "./database.js";
import {
  deriveDownloadToken,
  isValidSquareEventId,
  sha256Hex,
  verifySquareSignature,
} from "./crypto.js";
import { extractPaymentEmail, hasAnyRefund } from "./fulfillment.js";
import {
  HttpError,
  clientIp,
  corsHeadersFor,
  jsonResponse,
  parseBoolean,
  readJson,
  requireAllowedOrigin,
  requireAllowedHost,
  requireBinding,
  validateEpubCheckoutRequest,
  validateIdempotencyKey,
  validatePhysicalCheckoutRequest,
  validateSupportAmount,
} from "./http.js";
import { preparePhysicalCheckout, serializedPhysicalItems } from "./physical.js";
import { operationalHealthFields } from "./monitoring.js";
import {
  SquareApiError,
  createEpubPaymentLink,
  createPhysicalPaymentLink,
  deletePaymentLink,
  createMonthlySupportLink,
  createOneTimeSupportLink,
  getPayment,
  publicCheckoutError,
  sendDownloadEmail,
} from "./square.js";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

function epochSeconds() {
  return Math.floor(Date.now() / 1000);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

async function applyCheckoutRateLimit(request, env, routeKind, now) {
  const salt = requireBinding(env, "RATE_LIMIT_SALT");
  const ipHash = await sha256Hex(`${salt}:${clientIp(request)}`);
  const physical = routeKind === "PHYSICAL";
  const windowSeconds = boundedInteger(
    physical ? env.PHYSICAL_RATE_LIMIT_WINDOW_SECONDS : env.RATE_LIMIT_WINDOW_SECONDS,
    physical ? 1800 : 60,
    10,
    3600,
  );
  const maximum = boundedInteger(
    physical ? env.PHYSICAL_RATE_LIMIT_MAX : env.RATE_LIMIT_MAX,
    physical ? 3 : 10,
    1,
    100,
  );
  const state = await consumeRateLimit(env.DB, {
    bucketKey: `${routeKind}:${ipHash}`,
    now,
    windowSeconds,
    maximum,
  });
  if (!state.allowed) {
    const error = new HttpError(429, "RATE_LIMITED", "Too many checkout requests. Try again shortly.");
    error.retryAfter = Math.max(1, state.resetAt - now);
    throw error;
  }
  return state;
}

async function handleSupportCheckout(request, env, kind) {
  const cors = requireAllowedOrigin(request, env);
  if (!parseBoolean(env.SUPPORT_CHECKOUT_ENABLED, false)) {
    throw new HttpError(
      503,
      "SUPPORT_CHECKOUT_DISABLED",
      "Reader support checkout is not available yet.",
    );
  }
  const now = epochSeconds();
  await applyCheckoutRateLimit(request, env, kind, now);
  // Bound every cleanup pass so maintenance cannot dominate a checkout request.
  try {
    await cleanupOperationalState(env.DB, now, 100);
  } catch {
    // Operational cleanup is noncritical. Provisioning monitors D1 growth separately.
  }
  const amountCents = validateSupportAmount(await readJson(request));
  let monthlyPlanVariationId;
  if (kind === "MONTHLY" && amountCents !== 500 && !parseBoolean(env.CUSTOM_MONTHLY_ENABLED, false)) {
    throw new HttpError(
      503,
      "CUSTOM_MONTHLY_DISABLED",
      "Custom monthly support is not available until renewal testing is complete.",
    );
  }
  if (kind === "MONTHLY" && amountCents !== 500) {
    const strategy = String(env.CUSTOM_MONTHLY_STRATEGY || "override").toLowerCase();
    if (strategy === "static") {
      let map;
      try {
        map = JSON.parse(String(env.CUSTOM_MONTHLY_STATIC_PLAN_VARIATIONS || "{}"));
      } catch {
        throw new HttpError(503, "CUSTOM_MONTHLY_CONFIG_INVALID");
      }
      monthlyPlanVariationId = map[String(amountCents)];
      if (typeof monthlyPlanVariationId !== "string" || !monthlyPlanVariationId) {
        throw new HttpError(
          503,
          "CUSTOM_MONTHLY_PLAN_NOT_PROVISIONED",
          "That monthly amount is not available yet.",
        );
      }
    } else if (strategy !== "override") {
      throw new HttpError(503, "CUSTOM_MONTHLY_CONFIG_INVALID");
    }
  }

  const suppliedKey = validateIdempotencyKey(request.headers.get("idempotency-key"));
  const requestKey = await sha256Hex(`${kind}:${suppliedKey}`);
  const requestHash = await sha256Hex(`${kind}:${amountCents}:USD`);
  const squareIdempotencyKey = `oip-${requestKey.slice(0, 64)}`;
  const state = await getOrCreateCheckoutRequest(env.DB, {
    requestKey,
    requestKind: kind,
    requestHash,
    squareIdempotencyKey,
    now,
  });
  if (!state.row) throw new HttpError(500, "CHECKOUT_STATE_ERROR");
  if (state.row.request_hash !== requestHash || state.row.request_kind !== kind) {
    throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used for another request.");
  }
  if (state.row.status === "COMPLETED" && state.row.checkout_url) {
    return jsonResponse(
      { checkout_url: state.row.checkout_url, url: state.row.checkout_url },
      200,
      cors,
    );
  }

  const claimToken = crypto.randomUUID();
  const claimed = await claimCheckoutRequest(env.DB, { requestKey, claimToken, now });
  if (!claimed) {
    const error = new HttpError(503, "CHECKOUT_ALREADY_PROCESSING", "Checkout is already being prepared.");
    error.retryAfter = 2;
    throw error;
  }

  try {
    const link =
      kind === "ONE_TIME"
        ? await createOneTimeSupportLink(env, { amountCents, idempotencyKey: state.row.square_idempotency_key })
        : await createMonthlySupportLink(env, {
          amountCents,
          idempotencyKey: state.row.square_idempotency_key,
          planVariationId: monthlyPlanVariationId,
        });
    const completed = await completeCheckoutRequest(env.DB, requestKey, claimToken, link, now);
    if (!completed) throw new HttpError(503, "CHECKOUT_CLAIM_LOST");
    return jsonResponse({ checkout_url: link.url, url: link.url }, 201, cors);
  } catch (error) {
    await failCheckoutRequest(
      env.DB,
      requestKey,
      claimToken,
      error instanceof SquareApiError ? error.code : "CHECKOUT_FAILED",
      now,
    );
    throw publicCheckoutError(error);
  }
}

function requireProductionUsCountryProof(request, env, errorCode, message) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const localRequest =
    parseBoolean(env.ALLOW_LOCAL_ORIGINS, false) && ["localhost", "127.0.0.1"].includes(hostname);
  if (!localRequest && request.cf?.country !== "US") {
    throw new HttpError(403, errorCode, message);
  }
}

async function handleEpubCheckout(request, env) {
  const cors = requireAllowedOrigin(request, env);
  const now = epochSeconds();
  await applyCheckoutRateLimit(request, env, "EPUB", now);
  const selection = validateEpubCheckoutRequest(await readJson(request));
  requireProductionUsCountryProof(
    request,
    env,
    "EPUB_US_COUNTRY_NOT_PROVEN",
    "Direct EPUB checkout is available only to U.S. customers.",
  );
  const product = productForSku(selection.sku);
  if (!product) throw new HttpError(404, "EPUB_SKU_NOT_FOUND", "Choose an available EPUB edition.");
  if (!enabledEpubSkus(env).has(selection.sku)) {
    throw new HttpError(409, "EPUB_NOT_AVAILABLE", "This EPUB is not available yet.");
  }
  const catalogObjectId = configuredEpubCatalogVariationId(env, selection.sku);
  try {
    await cleanupOperationalState(env.DB, now, 100);
  } catch {
    // Operational cleanup is noncritical. Provisioning monitors D1 growth separately.
  }

  const suppliedKey = validateIdempotencyKey(request.headers.get("idempotency-key"));
  const requestKey = await sha256Hex(`EPUB:${suppliedKey}`);
  const requestHash = await sha256Hex(
    `EPUB:${selection.sku}:${selection.countryCode}:USD:${catalogObjectId}`,
  );
  const squareIdempotencyKey = `oip-${requestKey.slice(0, 64)}`;
  const state = await getOrCreateCheckoutRequest(env.DB, {
    requestKey,
    requestKind: "EPUB",
    requestHash,
    squareIdempotencyKey,
    now,
  });
  if (!state.row) throw new HttpError(500, "CHECKOUT_STATE_ERROR");
  if (state.row.request_hash !== requestHash || state.row.request_kind !== "EPUB") {
    throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used for another request.");
  }
  if (state.row.status === "COMPLETED" && state.row.checkout_url) {
    return jsonResponse(
      { checkout_url: state.row.checkout_url, url: state.row.checkout_url },
      200,
      cors,
    );
  }

  const claimToken = crypto.randomUUID();
  const claimed = await claimCheckoutRequest(env.DB, { requestKey, claimToken, now });
  if (!claimed) {
    const error = new HttpError(503, "CHECKOUT_ALREADY_PROCESSING", "Checkout is already being prepared.");
    error.retryAfter = 2;
    throw error;
  }
  try {
    const link = await createEpubPaymentLink(env, {
      product,
      catalogObjectId,
      idempotencyKey: state.row.square_idempotency_key,
    });
    const completed = await completeCheckoutRequest(env.DB, requestKey, claimToken, link, now);
    if (!completed) throw new HttpError(503, "CHECKOUT_CLAIM_LOST");
    return jsonResponse({ checkout_url: link.url, url: link.url }, 201, cors);
  } catch (error) {
    await failCheckoutRequest(
      env.DB,
      requestKey,
      claimToken,
      error instanceof SquareApiError ? error.code : "CHECKOUT_FAILED",
      now,
    );
    throw publicCheckoutError(error);
  }
}

async function handlePhysicalCheckout(request, env) {
  const cors = requireAllowedOrigin(request, env);
  const now = epochSeconds();
  await applyCheckoutRateLimit(request, env, "PHYSICAL", now);
  const selection = validatePhysicalCheckoutRequest(await readJson(request));
  requireProductionUsCountryProof(
    request,
    env,
    "PHYSICAL_US_COUNTRY_NOT_PROVEN",
    "Paperback checkout is available only to U.S. customers.",
  );
  const prepared = await preparePhysicalCheckout(env, selection, now);
  try {
    await cleanupOperationalState(env.DB, now, 100);
  } catch {
    // Operational cleanup is noncritical. Provisioning monitors D1 growth separately.
  }

  const suppliedKey = validateIdempotencyKey(request.headers.get("idempotency-key"));
  const requestKey = await sha256Hex(`PHYSICAL:${suppliedKey}`);
  const stableItems = serializedPhysicalItems(prepared.items);
  const requestHash = await sha256Hex([
    "PHYSICAL",
    stableItems,
    prepared.addressHmac,
    prepared.stateCode,
    prepared.countyFips || "",
    prepared.combinedRateBps,
    prepared.datasetVersion || "",
    prepared.rateTableVersion || "",
    prepared.merchandiseCents,
    prepared.shippingCents,
    prepared.taxCents,
    prepared.totalCents,
    "USD",
  ].join(":"));
  const squareIdempotencyKey = `oip-${requestKey.slice(0, 64)}`;
  const state = await getOrCreateCheckoutRequest(env.DB, {
    requestKey,
    requestKind: "PHYSICAL",
    requestHash,
    squareIdempotencyKey,
    now,
  });
  if (!state.row) throw new HttpError(500, "CHECKOUT_STATE_ERROR");
  if (state.row.request_hash !== requestHash || state.row.request_kind !== "PHYSICAL") {
    throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used for another request.");
  }
  if (state.row.status === "COMPLETED" && state.row.checkout_url) {
    const binding = await getPhysicalCheckoutByRequest(env.DB, requestKey);
    if (binding?.status === "EXPIRED" || binding?.expires_at <= now) {
      throw new HttpError(
        409,
        "PHYSICAL_CHECKOUT_EXPIRED",
        "This checkout link expired. Start a new checkout attempt.",
      );
    }
    if (
      !binding || binding.status !== "LINK_CREATED" || binding.square_payment_id !== null ||
      binding.square_payment_link_id !== state.row.square_payment_link_id
    ) {
      throw new HttpError(
        409,
        "PHYSICAL_CHECKOUT_NOT_REUSABLE",
        "This checkout attempt is no longer available. Start a new checkout attempt.",
      );
    }
    return jsonResponse({ checkout_url: state.row.checkout_url, url: state.row.checkout_url }, 200, cors);
  }

  const claimToken = crypto.randomUUID();
  const claimed = await claimCheckoutRequest(env.DB, { requestKey, claimToken, now }, 180);
  if (!claimed) {
    const error = new HttpError(503, "CHECKOUT_ALREADY_PROCESSING", "Checkout is already being prepared.");
    error.retryAfter = 2;
    throw error;
  }
  let createdLink = null;
  let bindingPersisted = false;
  const assertPhysicalClaim = async () => {
    const owned = await renewCheckoutClaim(env.DB, {
      requestKey,
      claimToken,
      now: epochSeconds(),
    });
    if (!owned) throw new HttpError(503, "CHECKOUT_CLAIM_LOST", "Checkout preparation was superseded.");
  };
  try {
    const referenceId = `OIP-PHYSICAL-${requestKey.slice(0, 16)}`;
    const link = await createPhysicalPaymentLink(env, {
      ...prepared,
      idempotencyKey: state.row.square_idempotency_key,
      referenceId,
      assertClaim: assertPhysicalClaim,
      reserveInventory: (items) => reservePhysicalInventory(env.DB, {
        requestKey,
        claimToken,
        items,
        now,
        expiresAt: now + 30 * 60,
      }),
    });
    createdLink = link;
    await assertPhysicalClaim();
    const binding = await insertPhysicalCheckoutBinding(env.DB, {
      requestKey,
      paymentLinkId: link.id,
      orderId: link.orderId,
      itemsJson: serializedPhysicalItems(link.items),
      addressHmac: prepared.addressHmac,
      stateCode: prepared.stateCode,
      countyFips: prepared.countyFips,
      combinedRateBps: prepared.combinedRateBps,
      datasetVersion: prepared.datasetVersion,
      rateTableVersion: prepared.rateTableVersion,
      resolutionMethod: prepared.resolutionMethod,
      merchandiseCents: prepared.merchandiseCents,
      shippingCents: prepared.shippingCents,
      shippingTaxCents: link.shippingTaxCents,
      taxCents: link.taxCents,
      totalCents: link.totalCents,
      expiresAt: now + 30 * 60,
      now,
    });
    bindingPersisted = Boolean(binding.row);
    if (
      !binding.row || binding.row.square_payment_link_id !== link.id ||
      binding.row.square_order_id !== link.orderId || binding.row.address_hmac !== prepared.addressHmac
    ) {
      throw new HttpError(503, "PHYSICAL_BINDING_CONFLICT", "Checkout could not be bound safely.");
    }
    const completed = await completeCheckoutRequest(env.DB, requestKey, claimToken, link, now);
    if (!completed) throw new HttpError(503, "CHECKOUT_CLAIM_LOST");
    return jsonResponse({ checkout_url: link.url, url: link.url }, 201, cors);
  } catch (error) {
    let ownsClaim = false;
    try {
      await assertPhysicalClaim();
      ownsClaim = true;
    } catch {
      // A reclaimer owns the shared Square idempotency key and reservation now.
    }
    if (!bindingPersisted && ownsClaim) {
      await releasePhysicalInventoryReservations(env.DB, requestKey, now, claimToken);
    }
    if (createdLink && !bindingPersisted && ownsClaim) {
      try {
        await deletePaymentLink(env, createdLink.id);
      } catch {
        // The failed checkout remains nonpublic. Scheduled expiry is the second cleanup path.
      }
    }
    await failCheckoutRequest(
      env.DB,
      requestKey,
      claimToken,
      error instanceof SquareApiError ? error.code : "CHECKOUT_FAILED",
      now,
    );
    throw publicCheckoutError(error);
  }
}

function sanitizedSquareReference(event) {
  const type = String(event.type || "");
  const object = event?.data?.object || {};
  if (type.startsWith("payment.")) {
    return { objectId: object.payment?.id || null, paymentId: object.payment?.id || null };
  }
  if (type.startsWith("refund.")) {
    return { objectId: object.refund?.id || null, paymentId: object.refund?.payment_id || null };
  }
  if (type.startsWith("dispute.")) {
    return {
      objectId: object.dispute?.id || null,
      paymentId: object.dispute?.disputed_payment?.payment_id || null,
    };
  }
  if (type.startsWith("subscription.")) {
    return { objectId: object.subscription?.id || null, paymentId: null };
  }
  if (type.startsWith("order.")) {
    return { objectId: object.order?.id || null, paymentId: null };
  }
  return { objectId: null, paymentId: null };
}

async function readWebhookBody(request) {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    const length = Number(lengthHeader);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new HttpError(400, "INVALID_WEBHOOK_CONTENT_LENGTH");
    }
    if (length > MAX_WEBHOOK_BYTES) {
      throw new HttpError(413, "WEBHOOK_TOO_LARGE");
    }
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const bytes = new Uint8Array(MAX_WEBHOOK_BYTES);
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new HttpError(400, "INVALID_WEBHOOK_BODY");
      }
      if (value.byteLength > MAX_WEBHOOK_BYTES - byteLength) {
        try {
          await reader.cancel();
        } catch {
          // The size rejection remains authoritative even if stream cancellation fails.
        }
        throw new HttpError(413, "WEBHOOK_TOO_LARGE");
      }
      bytes.set(value, byteLength);
      byteLength += value.byteLength;
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "INVALID_WEBHOOK_BODY");
  } finally {
    reader.releaseLock();
  }

  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(bytes.subarray(0, byteLength));
  } catch {
    throw new HttpError(400, "INVALID_WEBHOOK_BODY");
  }
}

async function handleSquareWebhook(request, env) {
  const notificationUrl = requireBinding(env, "SQUARE_WEBHOOK_NOTIFICATION_URL");
  const signatureKey = requireBinding(env, "SQUARE_WEBHOOK_SIGNATURE_KEY");
  const rawBody = await readWebhookBody(request);
  const signature = request.headers.get("x-square-hmacsha256-signature") || "";
  const authentic = await verifySquareSignature({ rawBody, signature, notificationUrl, signatureKey });
  if (!authentic) throw new HttpError(401, "INVALID_WEBHOOK_SIGNATURE");

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "INVALID_WEBHOOK_JSON");
  }
  if (
    !event ||
    typeof event !== "object" ||
    !isValidSquareEventId(event.event_id) ||
    typeof event.type !== "string" ||
    !event.type
  ) {
    throw new HttpError(400, "INVALID_WEBHOOK_EVENT");
  }
  const eventId = event.event_id;
  const now = epochSeconds();
  const payloadHash = await sha256Hex(rawBody);
  const reference = sanitizedSquareReference(event);
  const recorded = await recordWebhookEvent(env.DB, {
    id: eventId,
    type: String(event.type),
    objectId: reference.objectId,
    paymentId: reference.paymentId,
    payloadHash,
    createdAt: event.created_at || null,
    now,
  });
  if (recorded.state === "HASH_MISMATCH") throw new HttpError(409, "WEBHOOK_EVENT_CONFLICT");
  if (["QUEUED", "PROCESSING", "PROCESSED"].includes(recorded.state)) {
    return jsonResponse({ received: true, duplicate: true, queued: true });
  }
  requireBinding(env, "WEBHOOK_QUEUE");
  try {
    await env.WEBHOOK_QUEUE.send({ eventId, payloadHash });
  } catch {
    throw new HttpError(503, "WEBHOOK_QUEUE_UNAVAILABLE");
  }
  await markWebhookQueued(env.DB, eventId, payloadHash);
  return jsonResponse({ received: true, queued: true });
}

async function handleDownload(request, env, rawToken) {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(rawToken)) throw new HttpError(404, "NOT_FOUND");
  const now = epochSeconds();
  const tokenHash = await sha256Hex(rawToken);
  const fulfillment = await findDownload(env.DB, tokenHash);
  if (
    !fulfillment ||
    fulfillment.status !== "ACTIVE" ||
    Number(fulfillment.expires_at) <= now ||
    Number(fulfillment.download_count) >= Number(fulfillment.max_downloads)
  ) {
    throw new HttpError(404, "DOWNLOAD_UNAVAILABLE", "This download link is unavailable.");
  }
  const product = productForSku(fulfillment.sku);
  if (!product) throw new HttpError(404, "DOWNLOAD_UNAVAILABLE", "This download link is unavailable.");
  const object = await env.EPUB_BUCKET.get(product.r2Key);
  if (!object) {
    await recordFulfillmentReview(env.DB, {
      paymentId: fulfillment.payment_id,
      orderId: fulfillment.order_id,
      reasonCode: "R2_EPUB_MISSING",
      details: { sku: fulfillment.sku },
      now,
    });
    throw new HttpError(503, "DOWNLOAD_TEMPORARILY_UNAVAILABLE", "Download is temporarily unavailable.");
  }
  const consumed = await consumeDownload(env.DB, tokenHash, now);
  if (!consumed) throw new HttpError(404, "DOWNLOAD_UNAVAILABLE", "This download link is unavailable.");
  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": "application/epub+zip",
      "content-disposition": `attachment; filename="${product.downloadFilename}"`,
      "cache-control": "private, no-store, max-age=0",
      "content-security-policy": "default-src 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}

async function handleAdminResend(request, env) {
  const now = epochSeconds();
  await requireCloudflareAccessAdmin(request, env, now);
  const payload = await readJson(request);
  if (Object.keys(payload).some((key) => key !== "order_id")) throw new HttpError(400, "UNEXPECTED_FIELD");
  if (typeof payload.order_id !== "string" || !/^[A-Za-z0-9_-]{1,192}$/u.test(payload.order_id)) {
    throw new HttpError(400, "INVALID_ORDER_ID");
  }
  const rows = await getActiveFulfillmentsByOrder(env.DB, payload.order_id);
  if (rows.length === 0) throw new HttpError(404, "FULFILLMENT_NOT_FOUND");
  const baseUrl = String(requireBinding(env, "DOWNLOAD_BASE_URL")).replace(/\/$/u, "");
  const downloadTokenSecret = requireBinding(env, "DOWNLOAD_TOKEN_SECRET");
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const product = productForSku(row.sku);
    if (!product) continue;
    if (await isPaymentBlocked(env.DB, row.payment_id)) {
      failed += 1;
      continue;
    }
    const payment = await getPayment(env, row.payment_id);
    const email = extractPaymentEmail(payment);
    if (payment.status !== "COMPLETED" || hasAnyRefund(payment) || !email) {
      failed += 1;
      continue;
    }
    const claimToken = crypto.randomUUID();
    const attempt = await claimResendAttempt(env.DB, {
      fulfillmentId: row.fulfillment_id,
      claimToken,
      now,
    });
    if (!attempt) {
      failed += 1;
      continue;
    }
    const generation = Number(attempt.token_generation);
    const sequence = Number(attempt.resend_sequence);
    const rawToken = await deriveDownloadToken(downloadTokenSecret, row.fulfillment_id, generation);
    const tokenHash = await sha256Hex(rawToken);
    if (tokenHash !== attempt.token_sha256) {
      const finalized = await finishResendAttempt(env.DB, {
        fulfillmentId: row.fulfillment_id,
        sequence,
        claimToken,
        status: "FAILED",
        expiresAt: now,
        now,
      });
      if (!finalized) throw new Error("RESEND_CLAIM_LOST");
      failed += 1;
      continue;
    }
    const delivery = await sendDownloadEmail(env, {
      buyerEmail: email,
      product,
      downloadUrl: `${baseUrl}/download/${rawToken}`,
      idempotencyKey: `oip-resend-${row.fulfillment_id}-a${sequence}`,
    });
    if (delivery.status === "RETRY") {
      await releaseResendAttempt(env.DB, { fulfillmentId: row.fulfillment_id, sequence, claimToken });
      failed += 1;
      continue;
    }
    const finalized = await finishResendAttempt(env.DB, {
      fulfillmentId: row.fulfillment_id,
      sequence,
      claimToken,
      status: delivery.status,
      expiresAt: now + 14 * 24 * 60 * 60,
      now,
      messageId: delivery.messageId,
    });
    if (!finalized) {
      failed += 1;
      continue;
    }
    if (delivery.status === "SENT") sent += 1;
    else failed += 1;
  }
  return jsonResponse({ order_id: payload.order_id, sent, failed }, failed === 0 ? 200 : 207);
}

async function route(request, env) {
  const url = new URL(request.url);
  if (
    request.method === "OPTIONS" &&
    (url.pathname.startsWith("/api/support/") || ["/api/books/epub", "/api/books/physical"].includes(url.pathname))
  ) {
    const cors = requireAllowedOrigin(request, env);
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method === "POST" && url.pathname === "/api/support/one-time") {
    return handleSupportCheckout(request, env, "ONE_TIME");
  }
  if (request.method === "POST" && url.pathname === "/api/support/monthly") {
    return handleSupportCheckout(request, env, "MONTHLY");
  }
  if (request.method === "POST" && url.pathname === "/api/books/epub") {
    return handleEpubCheckout(request, env);
  }
  if (request.method === "POST" && url.pathname === "/api/books/physical") {
    return handlePhysicalCheckout(request, env);
  }
  if (request.method === "POST" && url.pathname === "/api/square/webhook") {
    return handleSquareWebhook(request, env);
  }
  if (request.method === "GET" && url.pathname.startsWith("/download/")) {
    return handleDownload(request, env, url.pathname.slice("/download/".length));
  }
  if (request.method === "POST" && url.pathname === "/admin/resend") {
    return handleAdminResend(request, env);
  }
  if (request.method === "GET" && url.pathname === "/health") {
    const supportGateOpen = parseBoolean(env.SUPPORT_CHECKOUT_ENABLED, false);
    const customMonthlyGateOpen = parseBoolean(env.CUSTOM_MONTHLY_ENABLED, false);
    const epubGatesOpen = enabledEpubSkus(env).size > 0;
    const paperbackGatesOpen = enabledPaperbackSkus(env).size > 0;
    const webhookSignatureBound = env.SQUARE_WEBHOOK_SIGNATURE_KEY !== undefined;
    return jsonResponse({
      ok: true,
      task2_safe: !(
        supportGateOpen || customMonthlyGateOpen || epubGatesOpen ||
        paperbackGatesOpen || webhookSignatureBound
      ),
      support_gate_open: supportGateOpen,
      custom_monthly_gate_open: customMonthlyGateOpen,
      epub_gates_open: epubGatesOpen,
      paperback_gates_open: paperbackGatesOpen,
      ...(await operationalHealthFields(env.DB)),
    });
  }
  throw new HttpError(404, "NOT_FOUND", "Route not found.");
}

export async function handleRequest(request, env, _ctx = {}) {
  let response;
  try {
    requireBinding(env, "DB");
    requireBinding(env, "EPUB_BUCKET");
    requireAllowedHost(request, env);
    response = await route(request, env);
  } catch (error) {
    const safe = error instanceof HttpError ? error : new HttpError(500, "INTERNAL_ERROR");
    const headers = corsHeadersFor(request, env) || {};
    if (safe.retryAfter) headers["retry-after"] = String(safe.retryAfter);
    response = jsonResponse({ error: { code: safe.code, message: safe.message } }, safe.status, headers);
  }
  return response;
}

export default { fetch: handleRequest };
