import {
  configuredEpubCatalogVariationId,
  enabledEpubSkus,
  productForSku,
} from "./catalog.js";
import {
  blockPayment,
  claimPhysicalPayment,
  finishPhysicalPaymentReview,
  getPhysicalCheckoutByOrder,
  insertFulfillment,
  isPaymentBlocked,
  recordFulfillmentReview,
  refreshPendingFulfillmentExpiry,
  revokeFulfillments,
  markPhysicalPaymentEvent,
  markPhysicalPaymentEventByOrder,
  markPhysicalInventoryPaid,
  markPhysicalInventorySoldVerified,
  updateEmailDelivery,
  upsertSubscriptionEvent,
} from "./database.js";
import { deriveDownloadToken, sha256Hex } from "./crypto.js";
import { normalizeEmailAddress, parseBoolean, requireBinding } from "./http.js";
import { verifyEpubUsOrderReference } from "./epub-reference.js";
import { evaluatePhysicalOrder } from "./physical.js";
import {
  getCatalogSku,
  getDispute,
  getOrder,
  getPayment,
  getRefund,
  getSubscription,
  sendDownloadEmail,
} from "./square.js";

function moneyAmount(money) {
  return Number.isSafeInteger(money?.amount) ? money.amount : null;
}

export function hasAnyRefund(payment) {
  const refunded = moneyAmount(payment?.refunded_money || { amount: 0 });
  return refunded === null || refunded > 0;
}

function paymentCountry(payment) {
  return (
    payment.billing_address?.country ||
    payment.shipping_address?.country ||
    payment.card_details?.card?.billing_address?.country ||
    null
  );
}

export function extractPaymentEmail(payment, order = null) {
  const recipientEmails = new Set();
  for (const fulfillment of Array.isArray(order?.fulfillments) ? order.fulfillments : []) {
    for (const recipient of [
      fulfillment?.recipient,
      fulfillment?.digital_details?.recipient,
      fulfillment?.shipment_details?.recipient,
      fulfillment?.pickup_details?.recipient,
      fulfillment?.delivery_details?.recipient,
    ]) {
      const email = normalizeEmailAddress(recipient?.email_address);
      if (email) recipientEmails.add(email);
    }
  }
  if (recipientEmails.size > 1) return null;
  if (recipientEmails.size === 1) return recipientEmails.values().next().value;
  return normalizeEmailAddress(payment?.buyer_email_address);
}

export async function evaluateEpubOrder({
  payment,
  order,
  resolveSku,
  enabledSkus,
  expectedCatalogVariationId,
  requireUsCountryProof,
  expectedLocationId,
  verifySignedUsReference,
}) {
  const failure = (reasonCode, details = {}) => ({ eligible: false, reasonCode, details });
  if (payment.status !== "COMPLETED") return failure("PAYMENT_NOT_COMPLETED");
  if (!payment.id || !payment.order_id || payment.order_id !== order.id) return failure("ORDER_ID_MISMATCH");
  if (!expectedLocationId || payment.location_id !== expectedLocationId) {
    return failure("PAYMENT_LOCATION_MISMATCH");
  }
  if (order.location_id !== expectedLocationId) return failure("ORDER_LOCATION_MISMATCH");
  if (payment.amount_money?.currency !== "USD" || order.total_money?.currency !== "USD") {
    return failure("CURRENCY_NOT_USD");
  }
  const paidAmount = moneyAmount(payment.amount_money);
  if (paidAmount === null || paidAmount !== moneyAmount(order.total_money)) return failure("PAYMENT_TOTAL_MISMATCH");
  if (hasAnyRefund(payment)) return failure("PAYMENT_HAS_REFUND");
  const email = extractPaymentEmail(payment, order);
  if (!email) return failure("BUYER_EMAIL_MISSING");

  const lines = Array.isArray(order.line_items) ? order.line_items : [];
  if (lines.length === 0) return failure("ORDER_LINES_MISSING");
  const items = [];
  const seenSkus = new Set();
  let expectedTotal = 0;
  for (const line of lines) {
    if (!line.catalog_object_id) return failure("NON_CATALOG_LINE");
    const sku = await resolveSku(line.catalog_object_id);
    const product = productForSku(sku);
    if (!product) return failure("NON_EPUB_LINE");
    if (!enabledSkus.has(sku)) return failure("EPUB_GATE_CLOSED", { sku });
    if (expectedCatalogVariationId && expectedCatalogVariationId(sku) !== line.catalog_object_id) {
      return failure("EPUB_CATALOG_VARIATION_MISMATCH", { sku });
    }
    if (seenSkus.has(sku)) return failure("EPUB_DUPLICATE_SKU", { sku });
    seenSkus.add(sku);
    if (String(line.quantity) !== "1") return failure("EPUB_QUANTITY_INVALID", { sku });
    if (line.base_price_money?.currency !== "USD" || moneyAmount(line.base_price_money) !== product.priceCents) {
      return failure("EPUB_PRICE_MISMATCH", { sku });
    }
    if (moneyAmount(line.total_discount_money || { amount: 0 }) !== 0) {
      return failure("EPUB_DISCOUNT_UNEXPECTED", { sku });
    }
    if (moneyAmount(line.total_tax_money || { amount: 0 }) !== 0) {
      return failure("EPUB_TAX_UNEXPECTED", { sku });
    }
    if (moneyAmount(line.total_money) !== product.priceCents) return failure("EPUB_LINE_TOTAL_MISMATCH", { sku });
    expectedTotal += product.priceCents;
    items.push({ sku, product });
  }
  if (expectedTotal !== paidAmount) return failure("EPUB_ORDER_TOTAL_MISMATCH");
  if (requireUsCountryProof) {
    const country = paymentCountry(payment);
    if (country && country !== "US") return failure("US_COUNTRY_NOT_PROVEN");
    if (!country) {
      const signedUsProof =
        items.length === 1 && typeof verifySignedUsReference === "function" &&
        await verifySignedUsReference({
          referenceId: order.reference_id,
          paymentCreatedAt: payment.created_at,
          sku: items[0].sku,
        });
      if (!signedUsProof) return failure("US_COUNTRY_NOT_PROVEN");
    }
  }
  return { eligible: true, buyerEmail: email, items };
}

function safeEventObject(event, objectName) {
  return event?.data?.object?.[objectName] || null;
}

async function holdPhysicalPaymentEvent(env, event, payment, status, reasonCode, now) {
  if (!payment?.id || !payment.order_id) return false;
  const existing = await getPhysicalCheckoutByOrder(env.DB, payment.order_id);
  if (!existing) return false;
  const marked = await markPhysicalPaymentEventByOrder(env.DB, {
    orderId: payment.order_id,
    paymentId: payment.id,
    status,
    reasonCode,
    now,
  });
  const preservedDispute =
    status === "REFUNDED" && marked.row?.status === "DISPUTED" && marked.row?.hold_reason === "DISPUTE";
  if (
    !marked.changed || marked.row?.square_payment_id !== payment.id ||
    (marked.row?.status !== status && !preservedDispute)
  ) {
    await recordFulfillmentReview(env.DB, {
      eventId: event.event_id,
      paymentId: payment.id,
      orderId: payment.order_id,
      reasonCode: "PHYSICAL_PAYMENT_EVENT_BINDING_CONFLICT",
      now,
    });
    throw new Error("PHYSICAL_PAYMENT_EVENT_BINDING_CONFLICT");
  }
  let boundItems;
  try {
    boundItems = JSON.parse(marked.row.items_json);
  } catch {
    boundItems = null;
  }
  if (
    !Array.isArray(boundItems) || boundItems.length < 1 ||
    !(await markPhysicalInventoryPaid(env.DB, marked.row.request_key, boundItems, now))
  ) {
    await recordFulfillmentReview(env.DB, {
      eventId: event.event_id,
      paymentId: payment.id,
      orderId: payment.order_id,
      reasonCode: "PHYSICAL_INVENTORY_RESERVATION_STATE_INVALID",
      now,
    });
    throw new Error("PHYSICAL_INVENTORY_RESERVATION_STATE_INVALID");
  }
  return true;
}

async function fulfillCompletedPayment(env, event, now, assertClaim) {
  const webhookPayment = safeEventObject(event, "payment");
  const paymentId = webhookPayment?.id;
  if (!paymentId) return;
  const blockedReason = await isPaymentBlocked(env.DB, paymentId);
  if (blockedReason) {
    await recordFulfillmentReview(env.DB, {
      eventId: event.event_id,
      paymentId,
      reasonCode: "PAYMENT_BLOCKED_BEFORE_FULFILLMENT",
      details: { blockedReason },
      now,
    });
    return;
  }
  const payment = await getPayment(env, paymentId);
  await assertClaim();
  if (payment.status !== "COMPLETED") return;
  if (!payment.order_id) {
    await recordFulfillmentReview(env.DB, {
      eventId: event.event_id,
      paymentId,
      reasonCode: "PAYMENT_ORDER_ID_MISSING",
      now,
    });
    return;
  }
  const order = await getOrder(env, payment.order_id);
  await assertClaim();
  const physicalBinding = await getPhysicalCheckoutByOrder(env.DB, payment.order_id);
  if (physicalBinding) {
    const claim = await claimPhysicalPayment(env.DB, {
      orderId: payment.order_id,
      paymentId,
      now,
    });
    if (claim.state === "REJECTED") {
      await recordFulfillmentReview(env.DB, {
        eventId: event.event_id,
        paymentId,
        orderId: payment.order_id,
        reasonCode: "PHYSICAL_PAYMENT_LINK_REUSED",
        now,
      });
      return;
    }
    if (claim.state === "DUPLICATE" && claim.row?.status !== "PAYMENT_PROCESSING") return;
    let boundItems;
    try {
      boundItems = JSON.parse(claim.row.items_json);
    } catch {
      throw new Error("PHYSICAL_INVENTORY_RESERVATION_STATE_INVALID");
    }
    if (!Array.isArray(boundItems) || boundItems.length < 1 ||
        !(await markPhysicalInventoryPaid(env.DB, claim.row.request_key, boundItems, now))) {
      throw new Error("PHYSICAL_INVENTORY_RESERVATION_STATE_INVALID");
    }
    const evaluation = await evaluatePhysicalOrder(env, {
      payment,
      order,
      binding: claim.row,
      expectedLocationId: requireBinding(env, "SQUARE_LOCATION_ID"),
      now,
    });
    if ([
      "PHYSICAL_SHIPMENT_ADDRESS_MISSING",
      "PHYSICAL_INVENTORY_ADJUSTMENT_EVIDENCE_PENDING",
    ].includes(
      evaluation.reasonCode,
    )) {
      // Square can expose the completed Payment before the shipment recipient has
      // propagated to the Order. Keep PAYMENT_PROCESSING and let Queue retry.
      throw new Error(evaluation.reasonCode);
    }
    if (evaluation.eligible) {
      if (!(await markPhysicalInventorySoldVerified(
        env.DB,
        claim.row.request_key,
        boundItems,
        now,
      ))) {
        throw new Error("PHYSICAL_INVENTORY_RESERVATION_STATE_INVALID");
      }
    }
    const finished = await finishPhysicalPaymentReview(env.DB, {
      orderId: payment.order_id,
      paymentId,
      status: evaluation.eligible ? "PAID_REVIEW_READY" : "HELD",
      holdReason: evaluation.eligible ? null : evaluation.reasonCode,
      now,
    });
    if (!finished) throw new Error("PHYSICAL_PAYMENT_CLAIM_LOST");
    if (!evaluation.eligible) {
      await recordFulfillmentReview(env.DB, {
        eventId: event.event_id,
        paymentId,
        orderId: payment.order_id,
        reasonCode: evaluation.reasonCode,
        now,
      });
    }
    return;
  }
  const skuCache = new Map();
  const evaluation = await evaluateEpubOrder({
    payment,
    order,
    expectedLocationId: requireBinding(env, "SQUARE_LOCATION_ID"),
    enabledSkus: enabledEpubSkus(env),
    expectedCatalogVariationId: (sku) => configuredEpubCatalogVariationId(env, sku),
    requireUsCountryProof: parseBoolean(env.REQUIRE_EPUB_US_COUNTRY_PROOF, true),
    verifySignedUsReference: (reference) => verifyEpubUsOrderReference(
      requireBinding(env, "DOWNLOAD_TOKEN_SECRET"),
      reference,
    ),
    resolveSku: async (catalogObjectId) => {
      if (!skuCache.has(catalogObjectId)) skuCache.set(catalogObjectId, await getCatalogSku(env, catalogObjectId));
      return skuCache.get(catalogObjectId);
    },
  });
  if (!evaluation.eligible) {
    // Support, paperback, and closed-gate orders are intentionally ignored except for an opaque review reason.
    if (!["NON_EPUB_LINE", "NON_CATALOG_LINE"].includes(evaluation.reasonCode)) {
      await recordFulfillmentReview(env.DB, {
        eventId: event.event_id,
        paymentId,
        orderId: payment.order_id,
        reasonCode: evaluation.reasonCode,
        details: evaluation.details,
        now,
      });
    }
    return;
  }
  await assertClaim();

  const pepper = requireBinding(env, "EMAIL_HASH_PEPPER");
  const downloadTokenSecret = requireBinding(env, "DOWNLOAD_TOKEN_SECRET");
  const downloadBaseUrl = String(requireBinding(env, "DOWNLOAD_BASE_URL")).replace(/\/$/u, "");
  const buyerEmailHash = await sha256Hex(`${pepper}:${evaluation.buyerEmail}`);
  let emailDeliveryFailed = false;
  for (const item of evaluation.items) {
    const requestedFulfillmentId = crypto.randomUUID();
    const requestedGeneration = 1;
    const requestedToken = await deriveDownloadToken(
      downloadTokenSecret,
      requestedFulfillmentId,
      requestedGeneration,
    );
    const inserted = await insertFulfillment(env.DB, {
      fulfillmentId: requestedFulfillmentId,
      paymentId,
      orderId: payment.order_id,
      sku: item.sku,
      buyerEmailHash,
      tokenHash: await sha256Hex(requestedToken),
      tokenGeneration: requestedGeneration,
      expiresAt: now + 14 * 24 * 60 * 60,
      maxDownloads: 5,
      now,
    });
    const fulfillment = inserted.row;
    if (!fulfillment || fulfillment.status !== "ACTIVE" || fulfillment.email_delivery_status === "SENT") continue;
    const generation = Number(fulfillment.token_generation);
    const rawToken = await deriveDownloadToken(downloadTokenSecret, fulfillment.fulfillment_id, generation);
    const tokenHash = await sha256Hex(rawToken);
    if (tokenHash !== fulfillment.token_sha256) throw new Error("FULFILLMENT_TOKEN_STATE_MISMATCH");
    const refreshed = await refreshPendingFulfillmentExpiry(env.DB, {
      fulfillmentId: fulfillment.fulfillment_id,
      tokenHash,
      expiresAt: now + 14 * 24 * 60 * 60,
    });
    if (!refreshed) throw new Error("FULFILLMENT_CLAIM_LOST");
    await assertClaim();
    const delivery = await sendDownloadEmail(env, {
      buyerEmail: evaluation.buyerEmail,
      product: item.product,
      downloadUrl: `${downloadBaseUrl}/download/${rawToken}`,
      idempotencyKey: `oip-email-${fulfillment.fulfillment_id}-g${generation}`,
    });
    const updated = await updateEmailDelivery(
      env.DB,
      fulfillment.fulfillment_id,
      generation,
      { ...delivery, status: delivery.status === "SENT" ? "SENT" : "FAILED" },
      now,
    );
    if (!updated) throw new Error("FULFILLMENT_EMAIL_STATE_LOST");
    if (delivery.status !== "SENT") {
      emailDeliveryFailed = true;
      await recordFulfillmentReview(env.DB, {
        eventId: event.event_id,
        paymentId,
        orderId: payment.order_id,
        reasonCode: "DOWNLOAD_EMAIL_FAILED",
        details: { sku: item.sku },
        now,
      });
    }
  }
  if (emailDeliveryFailed) throw new Error("EPUB_EMAIL_DELIVERY_FAILED");
}

async function handleRefund(env, event, now) {
  const refund = safeEventObject(event, "refund");
  if (!refund?.payment_id || refund.status !== "COMPLETED") return;
  await blockPayment(env.DB, {
    paymentId: refund.payment_id,
    reasonCode: "REFUND",
    eventId: event.event_id,
    now,
  });
  const payment = await getPayment(env, refund.payment_id);
  const totalPaid = moneyAmount(payment.amount_money);
  const totalRefunded = moneyAmount(payment.refunded_money);
  // Square PaymentRefund does not identify refunded order lines. Revoke all EPUB
  // access for the payment when any completed refund cannot be allocated safely.
  const revokedCount = await revokeFulfillments(env.DB, { paymentId: refund.payment_id, now });
  if (!(await holdPhysicalPaymentEvent(env, event, payment, "REFUNDED", "REFUND", now))) {
    await markPhysicalPaymentEvent(env.DB, {
      paymentId: refund.payment_id,
      status: "REFUNDED",
      reasonCode: "REFUND",
      now,
    });
  }
  const isFullRefund = totalPaid !== null && totalRefunded !== null && totalRefunded >= totalPaid;
  if (!isFullRefund && revokedCount > 0) {
    await recordFulfillmentReview(env.DB, {
      eventId: event.event_id,
      paymentId: refund.payment_id,
      orderId: payment.order_id || null,
      reasonCode: "PARTIAL_REFUND_ALL_DOWNLOADS_REVOKED",
      details: { revokedCount },
      now,
    });
  }
}

async function handleDispute(env, event, now) {
  const dispute = safeEventObject(event, "dispute");
  if (!dispute?.id) return;
  const paymentId = dispute.disputed_payment?.payment_id || null;
  if (paymentId) {
    await blockPayment(env.DB, {
      paymentId,
      reasonCode: "DISPUTE",
      eventId: event.event_id,
      now,
    });
  }
  const revokedCount = paymentId
    ? await revokeFulfillments(env.DB, { paymentId, now })
    : 0;
  if (paymentId) {
    const payment = await getPayment(env, paymentId);
    if (!(await holdPhysicalPaymentEvent(env, event, payment, "DISPUTED", "DISPUTE", now))) {
      await markPhysicalPaymentEvent(env.DB, {
        paymentId,
        status: "DISPUTED",
        reasonCode: "DISPUTE",
        now,
      });
    }
  }
  await recordFulfillmentReview(env.DB, {
    eventId: event.event_id,
    paymentId,
    reasonCode: "PAYMENT_DISPUTE_DOWNLOADS_REVOKED",
    details: { state: dispute.state || "UNKNOWN", revokedCount },
    now,
  });
}

async function handleSubscription(env, event, now) {
  const subscription = safeEventObject(event, "subscription");
  if (!subscription?.id || !Number.isSafeInteger(subscription.version) || subscription.version < 0) {
    if (subscription?.id) {
      await recordFulfillmentReview(env.DB, {
        eventId: event.event_id,
        reasonCode: "SUBSCRIPTION_VERSION_MISSING",
        details: { subscriptionId: subscription.id },
        now,
      });
    }
    return;
  }
  await upsertSubscriptionEvent(env.DB, {
    subscriptionId: subscription.id,
    eventId: event.event_id,
    status: subscription.status || null,
    planVariationId: subscription.plan_variation_id || null,
    squareVersion: subscription.version,
    now,
  });
}

export async function processSquareEvent(env, event, now, assertClaim = async () => {}) {
  const type = event.type || "";
  if (type.startsWith("payment.") || type === "payment.completed") {
    await fulfillCompletedPayment(env, event, now, assertClaim);
  } else if (type.startsWith("refund.")) {
    await handleRefund(env, event, now);
  } else if (type.startsWith("dispute.")) {
    await handleDispute(env, event, now);
  } else if (type.startsWith("subscription.")) {
    await handleSubscription(env, event, now);
  }
  // Order-only events are retained as processed evidence. Payment completion remains the fulfillment trigger.
}

export async function processSquareReference(env, reference, now, assertClaim = async () => {}) {
  const event = { event_id: reference.eventId, type: reference.eventType, data: { object: {} } };
  if (reference.eventType.startsWith("payment.")) {
    await assertClaim();
    const payment = await getPayment(env, reference.objectId || reference.paymentId);
    event.data.object.payment = { id: payment.id };
  } else if (reference.eventType.startsWith("refund.")) {
    await assertClaim();
    event.data.object.refund = await getRefund(env, reference.objectId);
  } else if (reference.eventType.startsWith("dispute.")) {
    await assertClaim();
    event.data.object.dispute = await getDispute(env, reference.objectId);
  } else if (reference.eventType.startsWith("subscription.")) {
    await assertClaim();
    event.data.object.subscription = await getSubscription(env, reference.objectId);
  } else {
    return;
  }
  await assertClaim();
  await processSquareEvent(env, event, now, assertClaim);
}
