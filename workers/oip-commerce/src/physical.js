import {
  configuredPaperbackCatalog,
  enabledPaperbackSkus,
  paperbackProductForSku,
} from "./catalog.js";
import {
  physicalAddressBindingHash,
  resolveFloridaJurisdiction,
  shippingCentsForQuantity,
  squarePercentageForBasisPoints,
  taxCentsForPhysicalLines,
} from "./florida-tax.js";
import { HttpError, validatePhysicalDestination } from "./http.js";
import { retrievePaperbackInventory, verifyPaperbackSaleAdjustments } from "./square.js";

export async function preparePhysicalCheckout(env, selection, now) {
  const enabled = enabledPaperbackSkus(env);
  const catalog = configuredPaperbackCatalog(env);
  const items = [];
  let merchandiseCents = 0;
  for (const selectionItem of selection.items) {
    const product = paperbackProductForSku(selectionItem.sku);
    if (!product) {
      throw new HttpError(404, "PAPERBACK_SKU_NOT_FOUND", "Choose an available paperback edition.");
    }
    if (!enabled.has(selectionItem.sku)) {
      throw new HttpError(409, "PAPERBACK_NOT_AVAILABLE", "This paperback is not available yet.");
    }
    const configured = catalog.get(selectionItem.sku);
    if (!configured) {
      throw new HttpError(503, "PAPERBACK_CATALOG_NOT_CONFIGURED", "Paperback checkout is not available yet.");
    }
    merchandiseCents += configured.priceCents * selectionItem.quantity;
    items.push({ ...configured, quantity: selectionItem.quantity });
  }
  const jurisdiction = await resolveFloridaJurisdiction(env, selection.destination, now);
  const shippingCents = shippingCentsForQuantity(selection.totalQuantity);
  const taxableCents = merchandiseCents + shippingCents;
  const taxCents = taxCentsForPhysicalLines(items, shippingCents, jurisdiction.combinedRateBps);
  return {
    items,
    destination: selection.destination,
    addressHmac: await physicalAddressBindingHash(env, selection.destination),
    merchandiseCents,
    shippingCents,
    taxCents,
    totalCents: taxableCents + taxCents,
    ...jurisdiction,
  };
}

function moneyAmount(money) {
  return money?.currency === "USD" && Number.isSafeInteger(money.amount) ? money.amount : null;
}

function zeroOrMissing(money) {
  return money === undefined || money === null || moneyAmount(money) === 0;
}

function noEntries(entries) {
  return entries === undefined || (Array.isArray(entries) && entries.length === 0);
}

function finalSquareShippingAddress(order) {
  const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments : [];
  const shipments = fulfillments
    .filter((fulfillment) => fulfillment?.type === "SHIPMENT");
  if (fulfillments.length !== 1 || shipments.length !== 1) return null;
  return shipments[0]?.shipment_details?.recipient?.address || null;
}

export async function evaluatePhysicalOrder(env, { payment, order, binding, expectedLocationId, now }) {
  const failure = (reasonCode) => ({ eligible: false, reasonCode });
  if (payment.status !== "COMPLETED") return failure("PHYSICAL_PAYMENT_NOT_COMPLETED");
  if (!new Set(["CARD", "WALLET"]).has(payment.source_type)) return failure("PHYSICAL_TENDER_UNSUPPORTED");
  if (!zeroOrMissing(payment.tip_money)) return failure("PHYSICAL_TIP_UNEXPECTED");
  if (!payment.id || !payment.order_id || payment.order_id !== order.id || binding.square_order_id !== order.id) {
    return failure("PHYSICAL_ORDER_ID_MISMATCH");
  }
  if (order.state !== "OPEN") return failure("PHYSICAL_ORDER_STATE_MISMATCH");
  if (payment.location_id !== expectedLocationId || order.location_id !== expectedLocationId) {
    return failure("PHYSICAL_LOCATION_MISMATCH");
  }
  if (moneyAmount(payment.amount_money) !== binding.total_cents || moneyAmount(order.total_money) !== binding.total_cents) {
    return failure("PHYSICAL_TOTAL_MISMATCH");
  }
  if (!zeroOrMissing(payment.refunded_money)) return failure("PHYSICAL_PAYMENT_HAS_REFUND");
  if (
    !zeroOrMissing(order.total_tip_money) ||
    !zeroOrMissing(order.total_discount_money) ||
    !noEntries(order.discounts) ||
    moneyAmount(order.total_service_charge_money) !== binding.shipping_cents
  ) {
    return failure("PHYSICAL_ADJUSTMENT_UNEXPECTED");
  }
  if (moneyAmount(order.total_tax_money || { amount: 0, currency: "USD" }) !== binding.tax_cents) {
    return failure("PHYSICAL_TAX_TOTAL_MISMATCH");
  }

  let expectedItems;
  try {
    expectedItems = JSON.parse(binding.items_json);
  } catch {
    return failure("PHYSICAL_BINDING_INVALID");
  }
  if (!Array.isArray(expectedItems) || expectedItems.length < 1) return failure("PHYSICAL_BINDING_INVALID");
  const lines = Array.isArray(order.line_items) ? order.line_items : [];
  const bookLines = lines;
  const serviceCharges = Array.isArray(order.service_charges) ? order.service_charges : [];
  const shippingCharge = serviceCharges.length === 1 ? serviceCharges[0] : null;
  if (
    !shippingCharge || shippingCharge.uid !== "shipping" || shippingCharge.name !== "USPS Media Mail" ||
    shippingCharge.calculation_phase !== "SUBTOTAL_PHASE" ||
    shippingCharge.treatment_type !== "LINE_ITEM_TREATMENT" || shippingCharge.scope !== "ORDER" ||
    moneyAmount(shippingCharge.amount_money) !== binding.shipping_cents ||
    moneyAmount(shippingCharge.applied_money) !== binding.shipping_cents ||
    !noEntries(shippingCharge.applied_discounts) ||
    bookLines.length !== expectedItems.length
  ) {
    return failure("PHYSICAL_LINES_MISMATCH");
  }
  const expectedByVariation = new Map(expectedItems.map((item) => [item.catalog_object_id, item]));
  let observedMerchandise = 0;
  const shippingTax = moneyAmount(shippingCharge.total_tax_money);
  if (shippingTax !== binding.shipping_tax_cents) {
    return failure("PHYSICAL_TAX_ROUNDING_MISMATCH");
  }
  let observedTax = shippingTax;
  for (const line of bookLines) {
    const expected = expectedByVariation.get(line.catalog_object_id);
    if (
      !expected ||
      String(line.quantity) !== String(expected?.quantity) ||
      line.catalog_version !== expected?.catalog_version ||
      moneyAmount(line.base_price_money) !== expected?.price_cents ||
      moneyAmount(line.total_tax_money) !== expected?.tax_cents ||
      !zeroOrMissing(line.total_discount_money) ||
      !noEntries(line.applied_discounts)
    ) {
      return failure("PHYSICAL_LINES_MISMATCH");
    }
    observedMerchandise += expected.price_cents * expected.quantity;
    observedTax += expected.tax_cents;
    expectedByVariation.delete(line.catalog_object_id);
  }
  if (
    expectedByVariation.size !== 0 || observedMerchandise !== binding.merchandise_cents ||
    observedTax !== binding.tax_cents
  ) {
    return failure("PHYSICAL_LINES_MISMATCH");
  }

  const orderTaxes = Array.isArray(order.taxes) ? order.taxes : [];
  const allLines = bookLines;
  if (binding.tax_cents > 0) {
    const tax = orderTaxes.length === 1 ? orderTaxes[0] : null;
    if (
      !tax || tax.uid !== "fl-sales-tax" || tax.scope !== "LINE_ITEM" || tax.type !== "ADDITIVE" ||
      tax.percentage !== squarePercentageForBasisPoints(binding.combined_rate_bps) || tax.auto_applied === true ||
      moneyAmount(tax.applied_money) !== binding.tax_cents ||
      allLines.some((line) =>
        !Array.isArray(line.applied_taxes) || line.applied_taxes.length !== 1 ||
        line.applied_taxes[0].tax_uid !== "fl-sales-tax" ||
        moneyAmount(line.applied_taxes[0].applied_money) !== moneyAmount(line.total_tax_money)) ||
      shippingCharge.taxable !== true || !Array.isArray(shippingCharge.applied_taxes) ||
      shippingCharge.applied_taxes.length !== 1 ||
      shippingCharge.applied_taxes[0].tax_uid !== "fl-sales-tax" ||
      moneyAmount(shippingCharge.applied_taxes[0].applied_money) !== shippingTax
    ) {
      return failure("PHYSICAL_TAX_APPLICATION_MISMATCH");
    }
  } else if (
    orderTaxes.length !== 0 ||
    allLines.some((line) => Array.isArray(line.applied_taxes) && line.applied_taxes.length > 0) ||
    shippingCharge.taxable !== false ||
    (Array.isArray(shippingCharge.applied_taxes) && shippingCharge.applied_taxes.length > 0)
  ) {
    return failure("PHYSICAL_TAX_APPLICATION_MISMATCH");
  }

  const authoritativeAddress = finalSquareShippingAddress(order);
  if (!authoritativeAddress) return failure("PHYSICAL_SHIPMENT_ADDRESS_MISSING");
  let validated;
  try {
    validated = validatePhysicalDestination(authoritativeAddress);
  } catch {
    return failure("PHYSICAL_FINAL_ADDRESS_INVALID");
  }
  const finalHash = await physicalAddressBindingHash(env, validated);
  if (finalHash !== binding.address_hmac) return failure("PHYSICAL_FINAL_ADDRESS_MISMATCH");
  if (payment.shipping_address) {
    let paymentAddress;
    try {
      paymentAddress = validatePhysicalDestination(payment.shipping_address);
    } catch {
      return failure("PHYSICAL_PAYMENT_ADDRESS_INVALID");
    }
    if (await physicalAddressBindingHash(env, paymentAddress) !== finalHash) {
      return failure("PHYSICAL_PAYMENT_ADDRESS_MISMATCH");
    }
  }
  let finalJurisdiction;
  try {
    finalJurisdiction = await resolveFloridaJurisdiction(env, validated, now);
  } catch {
    return failure("PHYSICAL_FINAL_JURISDICTION_UNRESOLVED");
  }
  if (
    finalJurisdiction.stateCode !== binding.state_code ||
    (finalJurisdiction.countyFips || null) !== (binding.county_fips || null) ||
    finalJurisdiction.combinedRateBps !== binding.combined_rate_bps ||
    (finalJurisdiction.datasetVersion || null) !== (binding.dataset_version || null) ||
    (finalJurisdiction.rateTableVersion || null) !== (binding.rate_table_version || null) ||
    finalJurisdiction.resolutionMethod !== binding.resolution_method
  ) {
    return failure("PHYSICAL_FINAL_JURISDICTION_MISMATCH");
  }
  try {
    await verifyPaperbackSaleAdjustments(env, {
      items: expectedItems,
      orderId: order.id,
      paymentId: payment.id,
      createdAt: binding.created_at,
      now,
    });
  } catch {
    return failure("PHYSICAL_INVENTORY_ADJUSTMENT_EVIDENCE_PENDING");
  }
  let currentInventory;
  try {
    currentInventory = await retrievePaperbackInventory(env, expectedItems);
  } catch {
    return failure("PHYSICAL_INVENTORY_RECHECK_FAILED");
  }
  for (const item of expectedItems) {
    if (!Number.isSafeInteger(item.inventory_count_at_checkout) ||
        item.inventory_count_at_checkout < item.quantity ||
        currentInventory.get(item.catalog_object_id) < 0) {
      return failure("PHYSICAL_INVENTORY_OVERSELL_RISK");
    }
  }
  return { eligible: true };
}

export function serializedPhysicalItems(items) {
  return JSON.stringify(items.map((item) => ({
    sku: item.product.sku,
    quantity: item.quantity,
    catalog_object_id: item.catalogObjectId,
    catalog_version: item.catalogVersion || null,
    price_cents: item.priceCents,
    tax_cents: item.taxCents ?? null,
    inventory_count_at_checkout: item.inventoryCountAtCheckout ?? null,
  })));
}
