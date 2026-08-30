import { HttpError, requireBinding } from "./http.js";
import { squarePercentageForBasisPoints } from "./florida-tax.js";

export class SquareApiError extends Error {
  constructor(status, code) {
    super("Square API request failed.");
    this.name = "SquareApiError";
    this.status = status;
    this.code = code;
  }
}

function outboundFetch(env) {
  return env.__testFetch || globalThis.fetch;
}

async function squareRequest(env, path, options = {}) {
  const baseUrl = String(env.SQUARE_API_BASE_URL || "https://connect.squareup.com").replace(/\/$/u, "");
  const accessToken = requireBinding(env, "SQUARE_ACCESS_TOKEN");
  const apiVersion = requireBinding(env, "SQUARE_API_VERSION");
  let response;
  try {
    response = await outboundFetch(env)(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "square-version": apiVersion,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new SquareApiError(503, "SQUARE_UNREACHABLE");
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) throw new SquareApiError(response.status, "SQUARE_INVALID_RESPONSE");
  }
  if (!response.ok) {
    const squareCode = payload?.errors?.[0]?.code;
    throw new SquareApiError(response.status, squareCode ? `SQUARE_${squareCode}` : "SQUARE_REQUEST_FAILED");
  }
  return payload || {};
}

export async function createOneTimeSupportLink(env, { amountCents, idempotencyKey }) {
  const locationId = requireBinding(env, "SQUARE_LOCATION_ID");
  const redirectUrl = requireBinding(env, "SQUARE_REDIRECT_URL");
  const payload = await squareRequest(env, "/v2/online-checkout/payment-links", {
    method: "POST",
    body: {
      idempotency_key: idempotencyKey,
      order: {
        location_id: locationId,
        reference_id: "OIP-SUPPORT-ONCE",
        line_items: [
          {
            name: "Support Outside In Print",
            quantity: "1",
            item_type: "ITEM",
            base_price_money: { amount: amountCents, currency: "USD" },
            note: "Voluntary reader support; no goods or services supplied.",
          },
        ],
      },
      checkout_options: {
        redirect_url: redirectUrl,
        ask_for_shipping_address: false,
        allow_tipping: false,
        accepted_payment_methods: {
          apple_pay: true,
          google_pay: true,
          cash_app_pay: false,
          afterpay_clearpay: false,
        },
        enable_coupon: false,
        enable_loyalty: false,
      },
      payment_note: "Voluntary reader support; no goods or services supplied.",
    },
  });
  if (!payload.payment_link?.url) throw new SquareApiError(502, "SQUARE_LINK_MISSING");
  return { id: payload.payment_link.id || null, url: payload.payment_link.url };
}

export async function createMonthlySupportLink(env, { amountCents, idempotencyKey, planVariationId = null }) {
  const locationId = requireBinding(env, "SQUARE_LOCATION_ID");
  const redirectUrl = requireBinding(env, "SQUARE_REDIRECT_URL");
  const selectedPlanVariationId = planVariationId || requireBinding(env, "SQUARE_MONTHLY_PLAN_VARIATION_ID");
  const payload = await squareRequest(env, "/v2/online-checkout/payment-links", {
    method: "POST",
    body: {
      idempotency_key: idempotencyKey,
      order: {
        location_id: locationId,
        reference_id: amountCents === 500 ? "OIP-SUPPORT-MONTHLY-5" : "OIP-SUPPORT-MONTHLY-CUSTOM",
        line_items: [
          {
            name: "Monthly Support for Outside In Print",
            quantity: "1",
            item_type: "ITEM",
            base_price_money: { amount: amountCents, currency: "USD" },
            note: "Renews monthly until canceled; no goods or services supplied.",
          },
        ],
      },
      checkout_options: {
        subscription_plan_id: selectedPlanVariationId,
        redirect_url: redirectUrl,
        ask_for_shipping_address: false,
        allow_tipping: false,
        accepted_payment_methods: {
          apple_pay: true,
          google_pay: true,
          cash_app_pay: false,
          afterpay_clearpay: false,
        },
        enable_coupon: false,
        enable_loyalty: false,
      },
    },
  });
  if (!payload.payment_link?.url) throw new SquareApiError(502, "SQUARE_LINK_MISSING");
  return { id: payload.payment_link.id || null, url: payload.payment_link.url };
}

function variationIsPresentAtLocation(object, locationId) {
  if (Array.isArray(object.absent_at_location_ids) && object.absent_at_location_ids.includes(locationId)) {
    return false;
  }
  if (object.present_at_all_locations === true) return true;
  return Array.isArray(object.present_at_location_ids) && object.present_at_location_ids.includes(locationId);
}

export async function verifyEpubCatalogVariation(env, { catalogObjectId, product }) {
  const locationId = requireBinding(env, "SQUARE_LOCATION_ID");
  const payload = await squareRequest(
    env,
    `/v2/catalog/object/${encodeURIComponent(catalogObjectId)}?include_related_objects=false`,
  );
  const object = payload.object;
  const variation = object?.item_variation_data;
  if (!object || object.id !== catalogObjectId || object.type !== "ITEM_VARIATION" || object.is_deleted === true) {
    throw new SquareApiError(502, "SQUARE_EPUB_CATALOG_ID_MISMATCH");
  }
  if (variation?.sku !== product.sku) {
    throw new SquareApiError(502, "SQUARE_EPUB_CATALOG_SKU_MISMATCH");
  }
  if (
    variation.pricing_type !== "FIXED_PRICING" ||
    variation.price_money?.currency !== "USD" ||
    variation.price_money?.amount !== product.priceCents
  ) {
    throw new SquareApiError(502, "SQUARE_EPUB_CATALOG_PRICE_MISMATCH");
  }
  if (variation.sellable === false || !variationIsPresentAtLocation(object, locationId)) {
    throw new SquareApiError(502, "SQUARE_EPUB_CATALOG_LOCATION_MISMATCH");
  }
  return object;
}

function moneyMatches(money, amount) {
  return money?.currency === "USD" && money?.amount === amount;
}

function zeroOrMissingMoney(money) {
  return money === undefined || money === null || moneyMatches(money, 0);
}

function verifyCreatedEpubOrder(payload, { catalogObjectId, product, locationId }) {
  const link = payload.payment_link;
  const orders = payload.related_resources?.orders;
  const order = Array.isArray(orders) ? orders.find((candidate) => candidate.id === link?.order_id) : null;
  const lines = order?.line_items;
  const line = Array.isArray(lines) && lines.length === 1 ? lines[0] : null;
  if (
    !link?.order_id ||
    !order ||
    order.location_id !== locationId ||
    order.reference_id !== product.sku ||
    !moneyMatches(order.total_money, product.priceCents) ||
    !zeroOrMissingMoney(order.total_tax_money) ||
    !zeroOrMissingMoney(order.total_discount_money) ||
    !zeroOrMissingMoney(order.total_service_charge_money) ||
    !line ||
    line.catalog_object_id !== catalogObjectId ||
    String(line.quantity) !== "1" ||
    !moneyMatches(line.base_price_money, product.priceCents) ||
    !moneyMatches(line.total_money, product.priceCents) ||
    !zeroOrMissingMoney(line.total_tax_money) ||
    !zeroOrMissingMoney(line.total_discount_money)
  ) {
    throw new SquareApiError(502, "SQUARE_EPUB_ORDER_MISMATCH");
  }
}

export async function createEpubPaymentLink(env, { product, catalogObjectId, idempotencyKey }) {
  const locationId = requireBinding(env, "SQUARE_LOCATION_ID");
  const redirectUrl = requireBinding(env, "SQUARE_EPUB_REDIRECT_URL");
  await verifyEpubCatalogVariation(env, { catalogObjectId, product });
  const payload = await squareRequest(env, "/v2/online-checkout/payment-links", {
    method: "POST",
    body: {
      idempotency_key: idempotencyKey,
      order: {
        location_id: locationId,
        reference_id: product.sku,
        line_items: [{ quantity: "1", catalog_object_id: catalogObjectId }],
      },
      checkout_options: {
        redirect_url: redirectUrl,
        ask_for_shipping_address: false,
        allow_tipping: false,
        accepted_payment_methods: {
          apple_pay: true,
          google_pay: true,
          cash_app_pay: false,
          afterpay_clearpay: false,
        },
        enable_coupon: false,
        enable_loyalty: false,
      },
      payment_note: `Outside In Print EPUB: ${product.sku}`,
    },
  });
  if (!payload.payment_link?.url) throw new SquareApiError(502, "SQUARE_LINK_MISSING");
  verifyCreatedEpubOrder(payload, { catalogObjectId, product, locationId });
  return { id: payload.payment_link.id || null, url: payload.payment_link.url };
}

export async function verifyPaperbackCatalogVariation(env, configured) {
  const locationId = requireBinding(env, "SQUARE_LOCATION_ID");
  const payload = await squareRequest(
    env,
    `/v2/catalog/object/${encodeURIComponent(configured.catalogObjectId)}?include_related_objects=false`,
  );
  const object = payload.object;
  const variation = object?.item_variation_data;
  if (
    !object || object.id !== configured.catalogObjectId || object.type !== "ITEM_VARIATION" ||
    object.is_deleted === true
  ) {
    throw new SquareApiError(502, "SQUARE_PAPERBACK_CATALOG_ID_MISMATCH");
  }
  if (variation?.sku !== configured.product.sku) {
    throw new SquareApiError(502, "SQUARE_PAPERBACK_CATALOG_SKU_MISMATCH");
  }
  if (
    variation.pricing_type !== "FIXED_PRICING" ||
    variation.price_money?.currency !== "USD" ||
    variation.price_money?.amount !== configured.priceCents
  ) {
    throw new SquareApiError(502, "SQUARE_PAPERBACK_CATALOG_PRICE_MISMATCH");
  }
  if (
    variation.sellable === false || variation.track_inventory !== true ||
    !variationIsPresentAtLocation(object, locationId)
  ) {
    throw new SquareApiError(502, "SQUARE_PAPERBACK_CATALOG_LOCATION_MISMATCH");
  }
  const locationOverride = Array.isArray(variation.location_overrides)
    ? variation.location_overrides.find((candidate) => candidate.location_id === locationId)
    : null;
  if (locationOverride?.sold_out === true) {
    throw new SquareApiError(409, "SQUARE_PAPERBACK_OUT_OF_STOCK");
  }
  return object;
}

export async function retrievePaperbackInventory(env, items) {
  const locationId = requireBinding(env, "SQUARE_LOCATION_ID");
  const ids = [...new Set(items.map((item) => item.catalogObjectId || item.catalog_object_id))];
  if (ids.length < 1 || ids.some((id) => typeof id !== "string" || !id)) {
    throw new SquareApiError(502, "SQUARE_PAPERBACK_INVENTORY_INPUT_INVALID");
  }
  const payload = await squareRequest(env, "/v2/inventory/counts/batch-retrieve", {
    method: "POST",
    body: {
      catalog_object_ids: ids,
      location_ids: [locationId],
      states: ["IN_STOCK"],
    },
  });
  const counts = Array.isArray(payload.counts) ? payload.counts : [];
  const result = new Map();
  for (const id of ids) {
    const matches = counts.filter((count) =>
      count.catalog_object_id === id && count.location_id === locationId && count.state === "IN_STOCK");
    if (matches.length !== 1) {
      throw new SquareApiError(502, "SQUARE_PAPERBACK_INVENTORY_UNVERIFIED");
    }
    const quantity = parseInventoryInteger(matches[0].quantity);
    if (quantity === null) {
      throw new SquareApiError(502, "SQUARE_PAPERBACK_INVENTORY_UNVERIFIED");
    }
    result.set(id, quantity);
  }
  return result;
}

function parseInventoryInteger(value) {
  if (!/^-?\d+(?:\.0+)?$/u.test(String(value ?? ""))) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) ? quantity : null;
}

export async function verifyPaperbackSaleAdjustments(env, {
  items,
  orderId,
  paymentId,
  createdAt,
  now,
}) {
  const mode = String(env.SQUARE_INVENTORY_TRANSACTION_ID_KIND || "").toUpperCase();
  if (!new Set(["ORDER_ID", "PAYMENT_ID"]).has(mode)) {
    throw new SquareApiError(503, "SQUARE_INVENTORY_TRANSACTION_ID_KIND_UNBOUND");
  }
  const expectedTransactionId = mode === "ORDER_ID" ? orderId : paymentId;
  if (typeof expectedTransactionId !== "string" || !expectedTransactionId) {
    throw new SquareApiError(502, "SQUARE_PAPERBACK_SALE_ADJUSTMENT_UNVERIFIED");
  }
  const locationId = requireBinding(env, "SQUARE_LOCATION_ID");
  const expected = new Map(items.map((item) => [
    item.catalog_object_id || item.catalogObjectId,
    item.quantity,
  ]));
  if (
    expected.size !== items.length || expected.size < 1 ||
    !Number.isSafeInteger(createdAt) || !Number.isSafeInteger(now) || now < createdAt ||
    [...expected.entries()].some(([id, quantity]) =>
      typeof id !== "string" || !id || !Number.isSafeInteger(quantity) || quantity < 1)
  ) {
    throw new SquareApiError(502, "SQUARE_PAPERBACK_SALE_ADJUSTMENT_UNVERIFIED");
  }
  const updatedAfter = new Date((createdAt - 300) * 1000).toISOString();
  const updatedBefore = new Date((now + 300) * 1000).toISOString();
  let cursor;
  const matchedQuantities = new Map([...expected.keys()].map((id) => [id, 0]));
  const seenAdjustmentIds = new Set();
  for (let page = 0; page < 5; page += 1) {
    const payload = await squareRequest(env, "/v2/inventory/changes/batch-retrieve", {
      method: "POST",
      body: {
        catalog_object_ids: [...expected.keys()],
        location_ids: [locationId],
        types: ["ADJUSTMENT"],
        states: ["SOLD"],
        updated_after: updatedAfter,
        updated_before: updatedBefore,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      },
    });
    const changes = Array.isArray(payload.changes) ? payload.changes : [];
    for (const change of changes) {
      const adjustment = change?.type === "ADJUSTMENT" ? change.adjustment : null;
      if (!adjustment || adjustment.transaction_id !== expectedTransactionId) continue;
      const catalogObjectId = adjustment.catalog_object_id;
      const quantity = parseInventoryInteger(adjustment.quantity);
      const knownLocations = [
        adjustment.location_id,
        adjustment.from_location_id,
        adjustment.to_location_id,
      ].filter((value) => typeof value === "string" && value);
      if (
        typeof adjustment.id !== "string" || !adjustment.id || seenAdjustmentIds.has(adjustment.id) ||
        !expected.has(catalogObjectId) || quantity === null || quantity < 1 ||
        adjustment.catalog_object_type !== "ITEM_VARIATION" ||
        adjustment.from_state !== "IN_STOCK" || adjustment.to_state !== "SOLD" ||
        knownLocations.length < 1 || knownLocations.some((value) => value !== locationId)
      ) {
        throw new SquareApiError(502, "SQUARE_PAPERBACK_SALE_ADJUSTMENT_UNVERIFIED");
      }
      seenAdjustmentIds.add(adjustment.id);
      matchedQuantities.set(catalogObjectId, matchedQuantities.get(catalogObjectId) + quantity);
    }
    cursor = typeof payload.cursor === "string" && payload.cursor ? payload.cursor : null;
    if (!cursor) break;
    if (page === 4) {
      throw new SquareApiError(502, "SQUARE_PAPERBACK_SALE_ADJUSTMENT_UNVERIFIED");
    }
  }
  if ([...expected].some(([id, quantity]) => matchedQuantities.get(id) !== quantity)) {
    throw new SquareApiError(503, "SQUARE_PAPERBACK_SALE_ADJUSTMENT_PENDING");
  }
  return true;
}

function verifyPhysicalOrderPricing(order, expected) {
  const lines = Array.isArray(order?.line_items) ? order.line_items : [];
  const serviceCharges = Array.isArray(order?.service_charges) ? order.service_charges : [];
  const shippingCharge = serviceCharges.length === 1 ? serviceCharges[0] : null;
  const bookLines = lines;
  const moneyIs = (money, amount) => money?.currency === "USD" && money?.amount === amount;
  const zeroMoney = (money) => money === undefined || money === null || moneyIs(money, 0);
  const noEntries = (entries) => entries === undefined || (Array.isArray(entries) && entries.length === 0);
  if (
    !order ||
    !moneyIs(order.total_money, expected.totalCents) ||
    !moneyIs(order.total_tax_money, expected.taxCents) ||
    !zeroMoney(order.total_tip_money) ||
    !zeroMoney(order.total_discount_money) ||
    !moneyIs(order.total_service_charge_money, expected.shippingCents) ||
    !shippingCharge || bookLines.length !== expected.items.length ||
    shippingCharge.uid !== "shipping" || shippingCharge.name !== "USPS Media Mail" ||
    shippingCharge.calculation_phase !== "SUBTOTAL_PHASE" ||
    shippingCharge.treatment_type !== "LINE_ITEM_TREATMENT" || shippingCharge.scope !== "ORDER" ||
    !moneyIs(shippingCharge.amount_money, expected.shippingCents) ||
    !moneyIs(shippingCharge.applied_money, expected.shippingCents) ||
    !noEntries(order.discounts) || !noEntries(shippingCharge.applied_discounts) ||
    order.pricing_options?.auto_apply_taxes !== false ||
    order.pricing_options?.auto_apply_discounts !== false
  ) {
    throw new SquareApiError(502, "SQUARE_PHYSICAL_ORDER_MISMATCH");
  }
  const expectedByVariation = new Map(expected.items.map((item) => [item.catalogObjectId, item]));
  const shippingTax = expected.shippingTaxCents;
  if (!moneyIs(shippingCharge.total_tax_money, shippingTax)) {
    throw new SquareApiError(502, "SQUARE_PHYSICAL_ORDER_MISMATCH");
  }
  let observedTax = shippingTax;
  for (const line of bookLines) {
    const configured = expectedByVariation.get(line.catalog_object_id);
    if (
      !configured || String(line.quantity) !== String(configured.quantity) ||
      line.catalog_version !== verifiedCatalogVersion(expected, configured.catalogObjectId) ||
      !moneyIs(line.base_price_money, configured.priceCents) ||
      !zeroMoney(line.total_discount_money) || !noEntries(line.applied_discounts) ||
      !moneyIs(
        line.total_tax_money,
        expected.lineTaxCents.get(configured.catalogObjectId),
      )
    ) {
      throw new SquareApiError(502, "SQUARE_PHYSICAL_ORDER_MISMATCH");
    }
    observedTax += expected.lineTaxCents.get(configured.catalogObjectId);
    expectedByVariation.delete(line.catalog_object_id);
  }
  if (expectedByVariation.size !== 0 || observedTax !== expected.taxCents) {
    throw new SquareApiError(502, "SQUARE_PHYSICAL_ORDER_MISMATCH");
  }
  const orderTaxes = Array.isArray(order.taxes) ? order.taxes : [];
  const allLines = bookLines;
  if (expected.taxCents > 0) {
    const tax = orderTaxes.length === 1 ? orderTaxes[0] : null;
    if (
      !tax || tax.uid !== "fl-sales-tax" || tax.scope !== "LINE_ITEM" || tax.type !== "ADDITIVE" ||
      tax.auto_applied === true ||
      !moneyIs(tax.applied_money, expected.taxCents) ||
      tax.percentage !== squarePercentageForBasisPoints(expected.combinedRateBps) ||
      allLines.some((line) =>
        !Array.isArray(line.applied_taxes) || line.applied_taxes.length !== 1 ||
        line.applied_taxes[0].tax_uid !== "fl-sales-tax" ||
        !moneyIs(
          line.applied_taxes[0].applied_money,
          expected.lineTaxCents.get(line.catalog_object_id),
        )) ||
      shippingCharge.taxable !== true || !Array.isArray(shippingCharge.applied_taxes) ||
      shippingCharge.applied_taxes.length !== 1 ||
      shippingCharge.applied_taxes[0].tax_uid !== "fl-sales-tax" ||
      !moneyIs(shippingCharge.applied_taxes[0].applied_money, shippingTax)
    ) {
      throw new SquareApiError(502, "SQUARE_PHYSICAL_TAX_MISMATCH");
    }
  } else if (
    orderTaxes.length !== 0 ||
    allLines.some((line) => Array.isArray(line.applied_taxes) && line.applied_taxes.length > 0) ||
    shippingCharge.taxable !== false ||
    (Array.isArray(shippingCharge.applied_taxes) && shippingCharge.applied_taxes.length > 0) ||
    !zeroMoney(order.total_tax_money)
  ) {
    throw new SquareApiError(502, "SQUARE_PHYSICAL_TAX_MISMATCH");
  }
  return order;
}

function verifyCreatedPhysicalOrder(payload, expected) {
  const link = payload.payment_link;
  const options = link?.checkout_options;
  const methods = options?.accepted_payment_methods;
  const orders = payload.related_resources?.orders;
  const order = Array.isArray(orders) ? orders.find((candidate) => candidate.id === link?.order_id) : null;
  const fulfillments = Array.isArray(order?.fulfillments) ? order.fulfillments : [];
  const optionKeys = options && !Array.isArray(options) && typeof options === "object"
    ? Object.keys(options).sort()
    : [];
  const methodKeys = methods && !Array.isArray(methods) && typeof methods === "object"
    ? Object.keys(methods).sort()
    : [];
  if (
    !link?.id || !link.order_id || !link.url || !order?.id ||
    order.state !== "DRAFT" ||
    order.location_id !== expected.locationId ||
    order.reference_id !== expected.referenceId ||
    optionKeys.join(",") !== [
      "accepted_payment_methods", "allow_tipping", "ask_for_shipping_address",
      "enable_coupon", "enable_loyalty", "merchant_support_email", "redirect_url",
    ].sort().join(",") ||
    options.redirect_url !== expected.redirectUrl || options.ask_for_shipping_address !== true ||
    options.merchant_support_email !== expected.merchantSupportEmail ||
    options.allow_tipping !== false || options.enable_coupon !== false || options.enable_loyalty !== false ||
    methodKeys.join(",") !== ["afterpay_clearpay", "apple_pay", "cash_app_pay", "google_pay"].sort().join(",") ||
    methods.apple_pay !== true || methods.google_pay !== true || methods.cash_app_pay !== false ||
    methods.afterpay_clearpay !== false || fulfillments.length !== 1 ||
    fulfillments[0]?.type !== "SHIPMENT"
  ) {
    throw new SquareApiError(502, "SQUARE_PHYSICAL_ORDER_MISMATCH");
  }
  return verifyPhysicalOrderPricing(order, expected);
}

function verifiedCatalogVersion(expected, catalogObjectId) {
  return expected.catalogVersions?.get(catalogObjectId) || null;
}

async function assertPhysicalCheckoutClaim(checkout) {
  if (typeof checkout.assertClaim !== "function") {
    throw new SquareApiError(503, "PHYSICAL_CHECKOUT_CLAIM_NOT_CONFIGURED");
  }
  await checkout.assertClaim();
}

export async function createPhysicalPaymentLink(env, checkout) {
  const locationId = requireBinding(env, "SQUARE_LOCATION_ID");
  const redirectUrl = requireBinding(env, "SQUARE_PHYSICAL_REDIRECT_URL");
  const merchantSupportEmail = String(requireBinding(env, "SQUARE_MERCHANT_SUPPORT_EMAIL"));
  if (merchantSupportEmail !== "support@outsideinprint.org") {
    throw new SquareApiError(503, "SQUARE_MERCHANT_SUPPORT_EMAIL_INVALID");
  }
  const verifiedVersions = new Map();
  for (const item of checkout.items) {
    await assertPhysicalCheckoutClaim(checkout);
    const object = await verifyPaperbackCatalogVariation(env, item);
    await assertPhysicalCheckoutClaim(checkout);
    if (!Number.isSafeInteger(object.version) || object.version < 1) {
      throw new SquareApiError(502, "SQUARE_PAPERBACK_CATALOG_VERSION_MISSING");
    }
    verifiedVersions.set(item.catalogObjectId, object.version);
  }
  await assertPhysicalCheckoutClaim(checkout);
  const inventory = await retrievePaperbackInventory(env, checkout.items);
  await assertPhysicalCheckoutClaim(checkout);
  for (const item of checkout.items) {
    if (inventory.get(item.catalogObjectId) < item.quantity) {
      throw new SquareApiError(409, "SQUARE_PAPERBACK_OUT_OF_STOCK");
    }
  }
  if (typeof checkout.reserveInventory !== "function") {
    throw new SquareApiError(503, "INVENTORY_RESERVATION_NOT_CONFIGURED");
  }
  const reserved = await checkout.reserveInventory(checkout.items.map((item) => ({
    ...item,
    inventoryCount: inventory.get(item.catalogObjectId),
  })));
  if (!reserved) throw new SquareApiError(409, "SQUARE_PAPERBACK_OUT_OF_STOCK");
  await assertPhysicalCheckoutClaim(checkout);

  const taxable = checkout.taxCents > 0;
  const appliedTaxes = taxable ? [{ tax_uid: "fl-sales-tax" }] : undefined;
  const lineItems = checkout.items.map((item, index) => ({
    uid: `book-${index + 1}`,
    quantity: String(item.quantity),
    catalog_object_id: item.catalogObjectId,
    catalog_version: verifiedVersions.get(item.catalogObjectId),
    ...(appliedTaxes ? { applied_taxes: appliedTaxes } : {}),
  }));
  const shippingCharge = {
    uid: "shipping",
    name: "USPS Media Mail",
    amount_money: { amount: checkout.shippingCents, currency: "USD" },
    calculation_phase: "SUBTOTAL_PHASE",
    treatment_type: "LINE_ITEM_TREATMENT",
    scope: "ORDER",
    taxable,
    ...(appliedTaxes ? { applied_taxes: appliedTaxes } : {}),
  };
  const taxes = taxable
    ? [{
      uid: "fl-sales-tax",
      name: "Florida sales tax",
      type: "ADDITIVE",
      scope: "LINE_ITEM",
      percentage: squarePercentageForBasisPoints(checkout.combinedRateBps),
    }]
    : undefined;
  const orderSpec = {
    location_id: locationId,
    reference_id: checkout.referenceId,
    line_items: lineItems,
    service_charges: [shippingCharge],
    ...(taxes ? { taxes } : {}),
    pricing_options: {
      auto_apply_taxes: false,
      auto_apply_discounts: false,
    },
  };
  await assertPhysicalCheckoutClaim(checkout);
  const calculatedPayload = await squareRequest(env, "/v2/orders/calculate", {
    method: "POST",
    body: { order: orderSpec },
  });
  await assertPhysicalCheckoutClaim(checkout);
  const calculatedOrder = calculatedPayload.order;
  const calculatedLines = Array.isArray(calculatedOrder?.line_items) ? calculatedOrder.line_items : [];
  const calculatedShipping = Array.isArray(calculatedOrder?.service_charges) &&
    calculatedOrder.service_charges.length === 1 ? calculatedOrder.service_charges[0] : null;
  const taxCents = calculatedOrder?.total_tax_money?.currency === "USD"
    ? calculatedOrder.total_tax_money.amount : null;
  const totalCents = calculatedOrder?.total_money?.currency === "USD"
    ? calculatedOrder.total_money.amount : null;
  const shippingTaxCents = calculatedShipping?.total_tax_money?.currency === "USD"
    ? calculatedShipping.total_tax_money.amount : null;
  const lineTaxCents = new Map();
  for (const line of calculatedLines) {
    if (
      typeof line.catalog_object_id !== "string" ||
      line.total_tax_money?.currency !== "USD" ||
      !Number.isSafeInteger(line.total_tax_money.amount) ||
      lineTaxCents.has(line.catalog_object_id)
    ) {
      throw new SquareApiError(502, "SQUARE_PHYSICAL_CALCULATION_INVALID");
    }
    lineTaxCents.set(line.catalog_object_id, line.total_tax_money.amount);
  }
  if (
    !Number.isSafeInteger(taxCents) || taxCents < 0 ||
    !Number.isSafeInteger(totalCents) ||
    !Number.isSafeInteger(shippingTaxCents) || shippingTaxCents < 0 ||
    totalCents !== checkout.merchandiseCents + checkout.shippingCents + taxCents ||
    [...lineTaxCents.values()].reduce((sum, value) => sum + value, shippingTaxCents) !== taxCents
  ) {
    throw new SquareApiError(502, "SQUARE_PHYSICAL_CALCULATION_INVALID");
  }
  const authoritative = {
    ...checkout,
    locationId,
    redirectUrl,
    merchantSupportEmail,
    catalogVersions: verifiedVersions,
    taxCents,
    totalCents,
    shippingTaxCents,
    lineTaxCents,
  };
  // CalculateOrder is authoritative for Square's penny allocation. Its response
  // is not a payment-link envelope and need not contain an id, state, or link.
  verifyPhysicalOrderPricing(calculatedOrder, authoritative);

  await assertPhysicalCheckoutClaim(checkout);
  const payload = await squareRequest(env, "/v2/online-checkout/payment-links", {
    method: "POST",
    body: {
      idempotency_key: checkout.idempotencyKey,
      order: orderSpec,
      checkout_options: {
        redirect_url: redirectUrl,
        ask_for_shipping_address: true,
        allow_tipping: false,
        accepted_payment_methods: {
          apple_pay: true,
          google_pay: true,
          cash_app_pay: false,
          afterpay_clearpay: false,
        },
        merchant_support_email: merchantSupportEmail,
        enable_coupon: false,
        enable_loyalty: false,
      },
      pre_populated_data: { buyer_address: checkout.destination },
      payment_note: "Outside In Print paperback order; shipping is a separately classified line.",
    },
  });
  await assertPhysicalCheckoutClaim(checkout);
  if (!payload.payment_link?.url) throw new SquareApiError(502, "SQUARE_LINK_MISSING");
  let order;
  try {
    order = verifyCreatedPhysicalOrder(payload, authoritative);
  } catch (error) {
    // The caller cannot bind a link that failed response verification. Revoke
    // this newly created, still-unpublished link before surfacing the failure.
    if (payload.payment_link?.id) {
      let ownsClaim = false;
      try {
        await assertPhysicalCheckoutClaim(checkout);
        ownsClaim = true;
      } catch {
        // A reclaimer owns the shared Square idempotency key now.
      }
      if (ownsClaim) {
        try {
          await deletePaymentLink(env, payload.payment_link.id);
        } catch {
          // Scheduled orphan monitoring remains required; never return the URL.
        }
      }
    }
    throw error;
  }
  return {
    id: payload.payment_link.id,
    url: payload.payment_link.url,
    orderId: order.id,
    taxCents,
    totalCents,
    shippingTaxCents,
    lineTaxCents,
    items: checkout.items.map((item) => ({
      ...item,
      catalogVersion: verifiedVersions.get(item.catalogObjectId),
      inventoryCountAtCheckout: inventory.get(item.catalogObjectId),
      taxCents: lineTaxCents.get(item.catalogObjectId),
    })),
  };
}

export async function deletePaymentLink(env, paymentLinkId) {
  await squareRequest(env, `/v2/online-checkout/payment-links/${encodeURIComponent(paymentLinkId)}`, {
    method: "DELETE",
  });
  return true;
}

export async function getPayment(env, paymentId) {
  const payload = await squareRequest(env, `/v2/payments/${encodeURIComponent(paymentId)}`);
  if (!payload.payment) throw new SquareApiError(502, "SQUARE_PAYMENT_MISSING");
  return payload.payment;
}

export async function getOrder(env, orderId) {
  const payload = await squareRequest(env, `/v2/orders/${encodeURIComponent(orderId)}`);
  if (!payload.order) throw new SquareApiError(502, "SQUARE_ORDER_MISSING");
  return payload.order;
}

export async function getRefund(env, refundId) {
  const payload = await squareRequest(env, `/v2/refunds/${encodeURIComponent(refundId)}`);
  if (!payload.refund) throw new SquareApiError(502, "SQUARE_REFUND_MISSING");
  return payload.refund;
}

export async function getDispute(env, disputeId) {
  const payload = await squareRequest(env, `/v2/disputes/${encodeURIComponent(disputeId)}`);
  if (!payload.dispute) throw new SquareApiError(502, "SQUARE_DISPUTE_MISSING");
  return payload.dispute;
}

export async function getSubscription(env, subscriptionId) {
  const payload = await squareRequest(env, `/v2/subscriptions/${encodeURIComponent(subscriptionId)}`);
  if (!payload.subscription) throw new SquareApiError(502, "SQUARE_SUBSCRIPTION_MISSING");
  return payload.subscription;
}

export async function getCatalogSku(env, catalogObjectId) {
  const payload = await squareRequest(
    env,
    `/v2/catalog/object/${encodeURIComponent(catalogObjectId)}?include_related_objects=false`,
  );
  const object = payload.object;
  if (!object || object.type !== "ITEM_VARIATION") return null;
  return object.item_variation_data?.sku || null;
}

export async function sendDownloadEmail(env, { buyerEmail, product, downloadUrl, idempotencyKey }) {
  const apiKey = requireBinding(env, "RESEND_API_KEY");
  const from = requireBinding(env, "DOWNLOAD_EMAIL_FROM");
  const replyTo = requireBinding(env, "DOWNLOAD_EMAIL_REPLY_TO");
  if (!/^[A-Za-z0-9._:-]{8,256}$/u.test(String(idempotencyKey || ""))) {
    throw new TypeError("A stable email idempotency key is required.");
  }
  let response;
  try {
    response = await outboundFetch(env)("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [buyerEmail],
        reply_to: replyTo,
        subject: `Your Outside In Print EPUB: ${product.title}`,
        text: [
          `Your EPUB of ${product.title} is ready.`,
          "",
          downloadUrl,
          "",
          "This private link expires after 14 days or five downloads. The EPUB is licensed for your personal use and may not be redistributed.",
          `Need help? Reply to this email or contact ${replyTo}.`,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { status: "RETRY", messageId: null };
  }
  if (!response.ok) {
    return { status: response.status === 429 || response.status >= 500 ? "RETRY" : "FAILED", messageId: null };
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // A successful Resend status is sufficient; message id is optional evidence.
  }
  return { status: "SENT", messageId: payload.id || null };
}

export async function sendOperationalAlert(env, alert) {
  const apiKey = requireBinding(env, "RESEND_API_KEY");
  const from = requireBinding(env, "DOWNLOAD_EMAIL_FROM");
  const replyTo = requireBinding(env, "DOWNLOAD_EMAIL_REPLY_TO");
  const recipient = String(requireBinding(env, "OPERATIONAL_ALERT_EMAIL")).trim();
  const environment = String(requireBinding(env, "OPERATIONAL_ENVIRONMENT"));
  const alertCode = String(alert.alertCode || "");
  const alertBucket = Number(alert.alertBucket);
  const firstSeenAt = Number(alert.firstSeenAt);
  const lastSeenAt = Number(alert.lastSeenAt);
  const occurrences = Number(alert.occurrences);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipient) || recipient.length > 320 ||
    !["SANDBOX", "PRODUCTION"].includes(environment) ||
    !/^[A-Z0-9_]{3,64}$/u.test(alertCode) ||
    !Number.isSafeInteger(alertBucket) || alertBucket < 0 ||
    !Number.isSafeInteger(firstSeenAt) || firstSeenAt < 0 ||
    !Number.isSafeInteger(lastSeenAt) || lastSeenAt < firstSeenAt ||
    !Number.isSafeInteger(occurrences) || occurrences < 1
  ) {
    return { status: "FAILED", errorCode: "OPERATIONAL_ALERT_INPUT_INVALID" };
  }
  const idempotencyKey = `oip-ops-${environment.toLowerCase()}-${alertCode.toLowerCase()}-${alertBucket}`;
  let response;
  try {
    response = await outboundFetch(env)("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        reply_to: replyTo,
        subject: `[OIP ${environment}] operational alert: ${alertCode}`,
        text: [
          "Outside In Print operational monitoring detected a service condition.",
          `Environment: ${environment}`,
          `Code: ${alertCode}`,
          `First observed: ${new Date(firstSeenAt * 1000).toISOString()}`,
          `Last observed: ${new Date(lastSeenAt * 1000).toISOString()}`,
          `Observations in this alert window: ${occurrences}`,
          "",
          "No buyer, order, payment, download-token, Queue-payload, or secret data is included.",
          "Review the Cloudflare Worker, Queue, D1, and Resend operational state.",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { status: "RETRY", errorCode: "RESEND_UNREACHABLE" };
  }
  if (response.ok) return { status: "SENT", errorCode: null };
  if (response.status === 429) return { status: "RETRY", errorCode: "RESEND_RATE_LIMITED" };
  if (response.status >= 500) return { status: "RETRY", errorCode: "RESEND_UPSTREAM_FAILED" };
  return { status: "FAILED", errorCode: "RESEND_REJECTED" };
}

export function publicCheckoutError(error) {
  if (error instanceof HttpError) return error;
  if (error instanceof SquareApiError) {
    if (error.code === "SQUARE_PAPERBACK_OUT_OF_STOCK") {
      return new HttpError(409, "PAPERBACK_OUT_OF_STOCK", "The requested paperback quantity is not in stock.");
    }
    return new HttpError(502, "CHECKOUT_PROVIDER_ERROR", "Checkout is temporarily unavailable.");
  }
  return new HttpError(500, "INTERNAL_ERROR", "Checkout is temporarily unavailable.");
}
