import assert from "node:assert/strict";
import test from "node:test";

import { requireCloudflareAccessAdmin } from "../src/access.js";
import {
  deriveDownloadToken,
  hmacSha256Base64,
  hmacSha256Hex,
  sha256Hex,
  verifySquareSignature,
} from "../src/crypto.js";
import {
  claimWebhookEvent,
  claimResendAttempt,
  cleanupOperationalState,
  failWebhookEvent,
  finishResendAttempt,
  finishWebhookEvent,
  isPaymentBlocked,
  markPhysicalPaymentEvent,
  markPhysicalInventoryPaid,
  reconcileExpiredPhysicalReservations,
  releasePhysicalInventoryReservations,
  releaseResendAttempt,
  reservePhysicalInventory,
} from "../src/database.js";
import { evaluateEpubOrder, hasAnyRefund, processSquareEvent } from "../src/fulfillment.js";
import {
  canonicalFloridaRateTable,
  canonicalPointMatchIndex,
  normalizedAddressKey,
  physicalAddressBindingHash,
  resolveFloridaJurisdiction,
  shippingCentsForQuantity,
  taxCentsForPhysicalLines,
} from "../src/florida-tax.js";
import { validatePhysicalCheckoutRequest, validateSupportAmount } from "../src/http.js";
import { handleRequest } from "../src/index.js";
import { expireUnusedPhysicalLinks } from "../src/maintenance.js";
import { evaluatePhysicalOrder } from "../src/physical.js";
import { processQueueMessage } from "../src/queue.js";
import {
  createPhysicalPaymentLink,
  retrievePaperbackInventory,
  sendDownloadEmail,
  verifyPaperbackCatalogVariation,
} from "../src/square.js";
import { FakeD1 } from "./fake-d1.mjs";

function fakePrivateBucket() {
  const objects = new Map();
  return {
    objects,
    async get(key) {
      const raw = objects.get(key);
      if (raw === undefined) return null;
      return {
        size: new TextEncoder().encode(raw).byteLength,
        async text() { return raw; },
      };
    },
  };
}

function baseEnv(overrides = {}) {
  const env = {
    DB: new FakeD1(),
    EPUB_BUCKET: { get: async () => null },
    JURISDICTION_BUCKET: fakePrivateBucket(),
    ALLOWED_ORIGINS: "https://outsideinprint.org",
    ALLOW_LOCAL_ORIGINS: "false",
    SUPPORT_CHECKOUT_ENABLED: "true",
    RATE_LIMIT_SALT: "test-rate-salt",
    RATE_LIMIT_MAX: "10",
    RATE_LIMIT_WINDOW_SECONDS: "60",
    SQUARE_API_BASE_URL: "https://connect.squareup.test",
    SQUARE_API_VERSION: "test-version",
    SQUARE_ACCESS_TOKEN: "test-token",
    SQUARE_LOCATION_ID: "location-1",
    SQUARE_REDIRECT_URL: "https://outsideinprint.org/support/thanks/",
    SQUARE_EPUB_REDIRECT_URL: "https://outsideinprint.org/shop/",
    SQUARE_EPUB_CATALOG_VARIATION_IDS: JSON.stringify({
      "OIP-AN-EPUB": "variation-1",
      "OIP-PS-EPUB": "variation-ps",
      "OIP-WC-EPUB": "variation-wc",
    }),
    SQUARE_PHYSICAL_REDIRECT_URL: "https://outsideinprint.org/shop/",
    SQUARE_MERCHANT_SUPPORT_EMAIL: "support@outsideinprint.org",
    SQUARE_PAPERBACK_CATALOG: JSON.stringify({
      "OIP-AN-PB": { variation_id: "variation-an-pb", price_cents: 1599 },
      "OIP-PS-PB": { variation_id: "variation-ps-pb", price_cents: 999 },
      "OIP-WC-PB": { variation_id: "variation-wc-pb", price_cents: 1599 },
    }),
    PAPERBACK_ENABLED_SKUS: "",
    ADDRESS_LOOKUP_HMAC_SECRET: "test-address-lookup-secret",
    POINTMATCH_DATASET_VERSION: "pointmatch-test-2026h2",
    POINTMATCH_SCHEMA_VERSION: "oip-pointmatch-v1",
    POINTMATCH_SHARD_PREFIX: "pointmatch",
    FL_SALES_TAX_RATE_VERSION: "fl-rates-test-2026h2",
    SQUARE_MONTHLY_PLAN_VARIATION_ID: "plan-1",
    SQUARE_WEBHOOK_NOTIFICATION_URL: "https://downloads.outsideinprint.org/api/square/webhook",
    SQUARE_WEBHOOK_SIGNATURE_KEY: "test-signature-key",
    DOWNLOAD_BASE_URL: "https://downloads.outsideinprint.org",
    DOWNLOAD_TOKEN_SECRET: "test-download-token-secret-that-is-not-production",
    RESEND_API_KEY: "test-resend-key",
    DOWNLOAD_EMAIL_FROM: "Outside In Print <downloads@outsideinprint.org>",
    DOWNLOAD_EMAIL_REPLY_TO: "support@outsideinprint.org",
    WEBHOOK_QUEUE: {
      sent: [],
      async send(message) {
        this.sent.push(message);
      },
    },
  };
  return Object.assign(env, overrides);
}

function physicalDestination(overrides = {}) {
  return {
    country: "US",
    address_line_1: "123 Main Street",
    address_line_2: "",
    locality: "Jacksonville",
    administrative_district_level_1: "FL",
    postal_code: "32202-1234",
    ...overrides,
  };
}

function enableTestUspsProvider(env, { state = "GA", zip5 = "30303" } = {}) {
  const downstream = env.__testFetch;
  env.US_ZIP_STATE_PROVIDER = "USPS_ADDRESSES_API_V3";
  env.USPS_ADDRESSES_API_BASE_URL = "https://apis-tem.usps.com";
  env.USPS_OAUTH_TOKEN_URL = "https://apis-tem.usps.com/oauth2/v3/token";
  env.USPS_ADDRESSES_API_VERSION = "3.3.1";
  env.USPS_API_CLIENT_ID = "test-usps-client";
  env.USPS_API_CLIENT_SECRET = "test-usps-secret";
  env.__testFetch = async (url, options = {}) => {
    if (url === env.USPS_OAUTH_TOKEN_URL) {
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), {
        client_id: env.USPS_API_CLIENT_ID,
        client_secret: env.USPS_API_CLIENT_SECRET,
        grant_type: "client_credentials",
      });
      return Response.json({
        access_token: "test-usps-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        status: "approved",
        scope: "addresses",
      });
    }
    if (url === `${env.USPS_ADDRESSES_API_BASE_URL}/addresses/v3/city-state?ZIPCode=${zip5}`) {
      assert.equal(options.headers.authorization, "Bearer test-usps-access-token");
      return Response.json({ city: "ATLANTA", state, ZIPCode: zip5 });
    }
    if (typeof downstream === "function") return downstream(url, options);
    throw new Error(`unexpected request: ${url}`);
  };
  return env;
}

function physicalRequest(body, extraHeaders = {}) {
  const request = new Request("https://downloads.outsideinprint.org/api/books/physical", {
    method: "POST",
    headers: {
      origin: "https://outsideinprint.org",
      "content-type": "application/json",
      "cf-connecting-ip": "192.0.2.30",
      "idempotency-key": "physical-intent-123",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  Object.defineProperty(request, "cf", { value: { country: extraHeaders["cf-ipcountry"] || "US" } });
  return request;
}

async function seedFloridaProvider(env, destination, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const includeUnit = overrides.includeUnit ?? Boolean(destination.address_line_2);
  const addressHmac = await hmacSha256Hex(
    env.ADDRESS_LOOKUP_HMAC_SECRET,
    `oip-pointmatch:v1:${normalizedAddressKey(destination, { includeUnit })}`,
  );
  const record = {
    address_hmac: addressHmac,
    county_fips: "12031",
    match_status: "EXACT",
    pending_effective_date: null,
    special_case_code: null,
    resolution_method: "POINTMATCH_EXACT_HMAC_V1",
    unit_policy: includeUnit ? "UNIT_SPECIFIC" : "NOT_JURISDICTION_DEPENDENT",
    ...overrides.match,
  };
  const zip5 = destination.postal_code.slice(0, 5);
  const objectKey = `${env.POINTMATCH_SHARD_PREFIX}/${env.POINTMATCH_DATASET_VERSION}/zip5/${zip5}.json`;
  const payload = {
    dataset_version: env.POINTMATCH_DATASET_VERSION,
    schema_version: env.POINTMATCH_SCHEMA_VERSION,
    zip5,
    records: [record, ...(overrides.extraRecords || [])],
    ...overrides.shardPayload,
  };
  const raw = overrides.shardRaw ?? JSON.stringify(payload);
  env.JURISDICTION_BUCKET.objects.set(objectKey, raw);
  const shardEntry = {
    zip5,
    object_key: objectKey,
    row_count: payload.records.length,
    content_sha256: await sha256Hex(raw),
    ...overrides.shardIndex,
  };
  const indexPayload = {
    dataset_version: env.POINTMATCH_DATASET_VERSION,
    schema_version: env.POINTMATCH_SCHEMA_VERSION,
    row_count: payload.records.length,
    shard_count: 1,
    shards: [shardEntry],
  };
  const indexRaw = canonicalPointMatchIndex(indexPayload);
  const indexObjectKey = `${env.POINTMATCH_SHARD_PREFIX}/${env.POINTMATCH_DATASET_VERSION}/index.json`;
  env.JURISDICTION_BUCKET.objects.set(indexObjectKey, indexRaw);
  env.POINTMATCH_INDEX_ROOT_SHA256 = await sha256Hex(indexRaw);
  env.DB.jurisdictionDatasets.set(env.POINTMATCH_DATASET_VERSION, {
    dataset_version: env.POINTMATCH_DATASET_VERSION,
    schema_version: env.POINTMATCH_SCHEMA_VERSION,
    status: "ACTIVE",
    effective_from: now - 86400,
    effective_through: now + 86400 * 180,
    stale_after: now + 86400 * 30,
    row_count: payload.records.length,
    content_sha256: env.POINTMATCH_INDEX_ROOT_SHA256,
    ...overrides.manifest,
  });
  const matchedCountyFips = record.county_fips;
  const rateRows = Array.from({ length: 67 }, (_, index) => {
    const countyFips = `12${String((index * 2) + 1).padStart(3, "0")}`;
    const chosen = countyFips === matchedCountyFips
      ? { surtax_rate_bps: 150, ...overrides.rate }
      : { surtax_rate_bps: 0 };
    return {
      county_fips: countyFips,
      state_rate_bps: 600,
      surtax_rate_bps: chosen.surtax_rate_bps,
      combined_rate_bps: 600 + chosen.surtax_rate_bps,
    };
  });
  for (const rate of rateRows) {
    env.DB.countyRates.set(`${env.FL_SALES_TAX_RATE_VERSION}:${rate.county_fips}`, rate);
  }
  env.FL_SALES_TAX_RATE_ROOT_SHA256 = await sha256Hex(
    canonicalFloridaRateTable(env.FL_SALES_TAX_RATE_VERSION, rateRows),
  );
  env.DB.rateManifests.set(env.FL_SALES_TAX_RATE_VERSION, {
    rate_version: env.FL_SALES_TAX_RATE_VERSION,
    status: "ACTIVE",
    effective_from: now - 86400,
    effective_through: now + 86400 * 180,
    stale_after: now + 86400 * 30,
    row_count: 67,
    content_sha256: env.FL_SALES_TAX_RATE_ROOT_SHA256,
    ...overrides.rateManifest,
  });
}

function paperbackVariation(id = "variation-an-pb", sku = "OIP-AN-PB", priceCents = 1599, version = 17) {
  return {
    object: {
      id,
      type: "ITEM_VARIATION",
      version,
      present_at_all_locations: true,
      item_variation_data: {
        sku,
        pricing_type: "FIXED_PRICING",
        price_money: { amount: priceCents, currency: "USD" },
        sellable: true,
        track_inventory: true,
      },
    },
  };
}

function paperbackInventory(counts = { "variation-an-pb": 25 }) {
  return {
    counts: Object.entries(counts).map(([catalogObjectId, quantity]) => ({
      catalog_object_id: catalogObjectId,
      location_id: "location-1",
      state: "IN_STOCK",
      quantity: String(quantity),
    })),
  };
}

function paperbackSaleAdjustment({
  transactionId = "physical-order-1",
  catalogObjectId = "variation-an-pb",
  quantity = "1.00000",
  adjustmentId = "adjustment-1",
} = {}) {
  return {
    changes: [{
      type: "ADJUSTMENT",
      adjustment: {
        id: adjustmentId,
        transaction_id: transactionId,
        catalog_object_id: catalogObjectId,
        catalog_object_type: "ITEM_VARIATION",
        from_state: "IN_STOCK",
        to_state: "SOLD",
        location_id: "location-1",
        quantity,
      },
    }],
  };
}

function physicalPaymentLinkResponse({
  florida = true,
  orderState = "DRAFT",
  address = null,
  rateBps = 750,
} = {}) {
  const bookTaxCents = florida ? Math.round((1599 * rateBps) / 10000) : 0;
  const shippingTaxCents = florida ? Math.round((499 * rateBps) / 10000) : 0;
  const taxCents = bookTaxCents + shippingTaxCents;
  const bookTaxRef = florida ? [{
    tax_uid: "fl-sales-tax",
    applied_money: { amount: bookTaxCents, currency: "USD" },
  }] : undefined;
  const shippingTaxRef = florida ? [{
    tax_uid: "fl-sales-tax",
    applied_money: { amount: shippingTaxCents, currency: "USD" },
  }] : undefined;
  const order = {
    id: "physical-order-1",
    state: orderState,
    location_id: "location-1",
    reference_id: null,
    total_money: { amount: 2098 + taxCents, currency: "USD" },
    total_tax_money: { amount: taxCents, currency: "USD" },
    total_discount_money: { amount: 0, currency: "USD" },
    total_service_charge_money: { amount: 499, currency: "USD" },
    pricing_options: { auto_apply_taxes: false, auto_apply_discounts: false },
    line_items: [{
      uid: "book-1",
      catalog_object_id: "variation-an-pb",
      catalog_version: 17,
      quantity: "1",
      base_price_money: { amount: 1599, currency: "USD" },
      total_discount_money: { amount: 0, currency: "USD" },
      total_tax_money: { amount: bookTaxCents, currency: "USD" },
      ...(bookTaxRef ? { applied_taxes: bookTaxRef } : {}),
    }],
    service_charges: [{
      uid: "shipping",
      name: "USPS Media Mail",
      amount_money: { amount: 499, currency: "USD" },
      applied_money: { amount: 499, currency: "USD" },
      total_tax_money: { amount: shippingTaxCents, currency: "USD" },
      calculation_phase: "SUBTOTAL_PHASE",
      treatment_type: "LINE_ITEM_TREATMENT",
      scope: "ORDER",
      taxable: florida,
      ...(shippingTaxRef ? { applied_taxes: shippingTaxRef } : {}),
    }],
    taxes: florida ? [{
      uid: "fl-sales-tax",
      name: "Florida sales tax",
      type: "ADDITIVE",
      scope: "LINE_ITEM",
      percentage: String(rateBps / 100),
      auto_applied: false,
      applied_money: { amount: taxCents, currency: "USD" },
    }] : [],
  };
  if (address || orderState === "DRAFT") {
    order.fulfillments = [{
      uid: "shipment-1",
      type: "SHIPMENT",
      shipment_details: address ? { recipient: { address } } : {},
    }];
  }
  return {
    payment_link: {
      id: "physical-link-1",
      order_id: order.id,
      url: "https://square.link/u/physical",
      checkout_options: {
        redirect_url: "https://outsideinprint.org/shop/",
        ask_for_shipping_address: true,
        allow_tipping: false,
        accepted_payment_methods: {
          apple_pay: true,
          google_pay: true,
          cash_app_pay: false,
          afterpay_clearpay: false,
        },
        merchant_support_email: "support@outsideinprint.org",
        enable_coupon: false,
        enable_loyalty: false,
      },
    },
    related_resources: { orders: [order] },
  };
}

function roundingEdgePhysicalOrder({ envelope = true, referenceId = null } = {}) {
  const line = (uid, catalogObjectId, catalogVersion) => ({
    uid,
    catalog_object_id: catalogObjectId,
    catalog_version: catalogVersion,
    quantity: "1",
    base_price_money: { amount: 101, currency: "USD" },
    total_discount_money: { amount: 0, currency: "USD" },
    total_tax_money: { amount: 8, currency: "USD" },
    applied_taxes: [{ tax_uid: "fl-sales-tax", applied_money: { amount: 8, currency: "USD" } }],
  });
  const order = {
    ...(envelope ? { id: "physical-rounding-order", state: "DRAFT", reference_id: referenceId } : {}),
    location_id: "location-1",
    total_money: { amount: 862, currency: "USD" },
    total_tax_money: { amount: 61, currency: "USD" },
    total_discount_money: { amount: 0, currency: "USD" },
    total_service_charge_money: { amount: 599, currency: "USD" },
    pricing_options: { auto_apply_taxes: false, auto_apply_discounts: false },
    line_items: [
      line("book-1", "variation-an-pb", 17),
      line("book-2", "variation-wc-pb", 19),
    ],
    service_charges: [{
      uid: "shipping",
      name: "USPS Media Mail",
      amount_money: { amount: 599, currency: "USD" },
      applied_money: { amount: 599, currency: "USD" },
      total_tax_money: { amount: 45, currency: "USD" },
      calculation_phase: "SUBTOTAL_PHASE",
      treatment_type: "LINE_ITEM_TREATMENT",
      scope: "ORDER",
      taxable: true,
      applied_taxes: [{ tax_uid: "fl-sales-tax", applied_money: { amount: 45, currency: "USD" } }],
    }],
    taxes: [{
      uid: "fl-sales-tax",
      name: "Florida sales tax",
      type: "ADDITIVE",
      scope: "LINE_ITEM",
      percentage: "7.5",
      auto_applied: false,
      applied_money: { amount: 61, currency: "USD" },
    }],
    ...(envelope ? { fulfillments: [{ type: "SHIPMENT", shipment_details: {} }] } : {}),
  };
  if (!envelope) return { order };
  return {
    payment_link: {
      id: "physical-rounding-link",
      order_id: order.id,
      url: "https://square.link/u/rounding",
      checkout_options: {
        redirect_url: "https://outsideinprint.org/shop/",
        ask_for_shipping_address: true,
        allow_tipping: false,
        accepted_payment_methods: {
          apple_pay: true, google_pay: true, cash_app_pay: false, afterpay_clearpay: false,
        },
        merchant_support_email: "support@outsideinprint.org",
        enable_coupon: false,
        enable_loyalty: false,
      },
    },
    related_resources: { orders: [order] },
  };
}

function seedPhysicalReservation(env, requestKey, overrides = {}) {
  const sku = overrides.sku || "OIP-AN-PB";
  env.DB.inventoryReservations.set(`${requestKey}:${sku}`, {
    request_key: requestKey,
    sku,
    catalog_object_id: overrides.catalog_object_id || "variation-an-pb",
    quantity: overrides.quantity || 1,
    source_in_stock_count: overrides.source_in_stock_count || 25,
    claim_token: overrides.claim_token || "seeded-claim-token",
    status: overrides.status || "ACTIVE",
    created_at: 1,
    expires_at: overrides.expires_at || 9999999999,
    updated_at: 1,
  });
}

function supportRequest(path, body, extraHeaders = {}) {
  return new Request(`https://downloads.outsideinprint.org${path}`, {
    method: "POST",
    headers: {
      origin: "https://outsideinprint.org",
      "content-type": "application/json",
      "cf-connecting-ip": "192.0.2.10",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function epubRequest(body, extraHeaders = {}, url = "https://downloads.outsideinprint.org/api/books/epub") {
  const request = new Request(url, {
    method: "POST",
    headers: {
      origin: "https://outsideinprint.org",
      "content-type": "application/json",
      "cf-connecting-ip": "192.0.2.20",
      "cf-ipcountry": "US",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  Object.defineProperty(request, "cf", {
    value: { country: extraHeaders["cf-ipcountry"] || "US" },
  });
  return request;
}

function epubVariation(id = "variation-1", sku = "OIP-AN-EPUB", priceCents = 999) {
  return {
    object: {
      id,
      type: "ITEM_VARIATION",
      present_at_all_locations: true,
      item_variation_data: {
        sku,
        pricing_type: "FIXED_PRICING",
        price_money: { amount: priceCents, currency: "USD" },
        sellable: true,
      },
    },
  };
}

function epubPaymentLinkResponse({
  linkId = "epub-link-1",
  url = "https://square.link/u/epub",
  orderId = "epub-order-1",
  variationId = "variation-1",
  sku = "OIP-AN-EPUB",
  priceCents = 999,
} = {}) {
  return {
    payment_link: { id: linkId, order_id: orderId, url },
    related_resources: {
      orders: [{
        id: orderId,
        location_id: "location-1",
        reference_id: sku,
        total_money: { amount: priceCents, currency: "USD" },
        total_tax_money: { amount: 0, currency: "USD" },
        total_discount_money: { amount: 0, currency: "USD" },
        total_service_charge_money: { amount: 0, currency: "USD" },
        line_items: [{
          catalog_object_id: variationId,
          quantity: "1",
          base_price_money: { amount: priceCents, currency: "USD" },
          total_money: { amount: priceCents, currency: "USD" },
          total_tax_money: { amount: 0, currency: "USD" },
          total_discount_money: { amount: 0, currency: "USD" },
        }],
      }],
    },
  };
}

function base64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  return Buffer.from(bytes).toString("base64url");
}

async function signedAccessJwt({ privateKey, kid, issuer, audience, email, expiresAt }) {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const payload = base64Url(
    JSON.stringify({ iss: issuer, aud: [audience], email, exp: expiresAt, iat: expiresAt - 300 }),
  );
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64Url(signature)}`;
}

test("support amount accepts whole dollars from $5 through $500", () => {
  assert.equal(validateSupportAmount({ amount_cents: 500 }), 500);
  assert.equal(validateSupportAmount({ amount_cents: 50000 }), 50000);
  for (const amount of [499, 501, 50001, 500.5, "500", null]) {
    assert.throws(() => validateSupportAmount({ amount_cents: amount }), /whole-dollar/u);
  }
  assert.throws(() => validateSupportAmount({ amount_cents: 500, currency: "USD" }), /Only amount_cents/u);
});

test("operational cleanup is bounded and preserves current checkout state", async () => {
  const db = new FakeD1();
  const now = 2_000_000_000;
  db.rateLimits.set("old-rate", { request_count: 1, updated_at: now - 90_000 });
  db.rateLimits.set("current-rate", { request_count: 1, updated_at: now });
  db.checkouts.set("old-failed", { status: "FAILED", updated_at: now - 8 * 86_400 });
  db.checkouts.set("old-completed", { status: "COMPLETED", updated_at: now - 31 * 86_400 });
  db.checkouts.set("old-physical", {
    request_kind: "PHYSICAL", status: "COMPLETED", updated_at: now - 31 * 86_400,
  });
  db.checkouts.set("current-completed", { status: "COMPLETED", updated_at: now });
  const cleaned = await cleanupOperationalState(db, now, 2);
  assert.deepEqual(cleaned, { rateLimits: 1, checkoutRequests: 2 });
  assert.equal(db.rateLimits.has("current-rate"), true);
  assert.equal(db.checkouts.has("current-completed"), true);
  assert.equal(db.checkouts.has("old-physical"), true);
});

test("Square signature binds the exact notification URL and raw body", async () => {
  const rawBody = '{"event_id":"evt-1","type":"order.updated"}';
  const signatureKey = "secret";
  const notificationUrl = "https://downloads.outsideinprint.org/api/square/webhook";
  const signature = await hmacSha256Base64(signatureKey, `${notificationUrl}${rawBody}`);
  assert.equal(await verifySquareSignature({ rawBody, signature, notificationUrl, signatureKey }), true);
  assert.equal(
    await verifySquareSignature({ rawBody: `${rawBody}\n`, signature, notificationUrl, signatureKey }),
    false,
  );
  assert.equal(
    await verifySquareSignature({ rawBody, signature, notificationUrl: `${notificationUrl}/`, signatureKey }),
    false,
  );
});

test("download tokens and Resend idempotency are stable for the same generation", async () => {
  const firstToken = await deriveDownloadToken("secret", "fulfillment-1", 1);
  const retryToken = await deriveDownloadToken("secret", "fulfillment-1", 1);
  const nextToken = await deriveDownloadToken("secret", "fulfillment-1", 2);
  assert.equal(firstToken, retryToken);
  assert.notEqual(firstToken, nextToken);
  assert.match(firstToken, /^[A-Za-z0-9_-]{43}$/u);

  const seenKeys = [];
  const env = baseEnv({
    __testFetch: async (_url, options) => {
      seenKeys.push(options.headers["idempotency-key"]);
      return Response.json({ id: "email-1" });
    },
  });
  const message = {
    buyerEmail: "reader@example.com",
    product: { title: "Book" },
    downloadUrl: `https://downloads.outsideinprint.org/download/${firstToken}`,
    idempotencyKey: "oip-email-fulfillment-1-g1",
  };
  assert.equal((await sendDownloadEmail(env, message)).status, "SENT");
  assert.equal((await sendDownloadEmail(env, message)).status, "SENT");
  assert.deepEqual(seenKeys, [message.idempotencyKey, message.idempotencyKey]);
});

test("one-time checkout returns checkout_url and reuses a completed idempotent request", async () => {
  let calls = 0;
  const env = baseEnv({
    __testFetch: async (_url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      assert.equal(body.order.reference_id, "OIP-SUPPORT-ONCE");
      assert.equal(body.order.line_items[0].base_price_money.amount, 2500);
      assert.equal(body.checkout_options.allow_tipping, false);
      assert.equal(body.checkout_options.accepted_payment_methods.cash_app_pay, false);
      assert.equal(body.checkout_options.accepted_payment_methods.afterpay_clearpay, false);
      assert.equal(body.checkout_options.enable_coupon, false);
      assert.equal(body.checkout_options.enable_loyalty, false);
      assert.match(body.idempotency_key, /^oip-/u);
      return Response.json({ payment_link: { id: "link-1", url: "https://square.link/u/test" } });
    },
  });
  const first = await handleRequest(
    supportRequest("/api/support/one-time", { amount_cents: 2500 }, { "idempotency-key": "reader-123456" }),
    env,
  );
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), {
    checkout_url: "https://square.link/u/test",
    url: "https://square.link/u/test",
  });
  const second = await handleRequest(
    supportRequest("/api/support/one-time", { amount_cents: 2500 }, { "idempotency-key": "reader-123456" }),
    env,
  );
  assert.equal(second.status, 200);
  assert.equal(calls, 1);
  assert.equal(second.headers.get("access-control-allow-origin"), "https://outsideinprint.org");
});

test("reader support checkout is default-closed before origin data or Square side effects", async () => {
  let squareCalls = 0;
  for (const [path, configuredValue] of [
    ["/api/support/one-time", undefined],
    ["/api/support/monthly", "false"],
  ]) {
    const env = baseEnv({
      SUPPORT_CHECKOUT_ENABLED: configuredValue,
      __testFetch: async () => {
        squareCalls += 1;
        throw new Error("Square must not be called while reader support is disabled");
      },
    });
    const response = await handleRequest(
      supportRequest(
        path,
        { amount_cents: 500 },
        { "idempotency-key": `disabled-${path.split("/").at(-1)}-123` },
      ),
      env,
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "SUPPORT_CHECKOUT_DISABLED");
  }
  assert.equal(squareCalls, 0);
});

test("EPUB checkout rejects unknown, disabled, and non-US selections before Square", async () => {
  let squareCalls = 0;
  const noSquare = async () => {
    squareCalls += 1;
    throw new Error("Square must not be called");
  };
  const unknown = await handleRequest(
    epubRequest(
      { sku: "OIP-ZZ-EPUB", country_code: "US" },
      { "idempotency-key": "unknown-epub-123" },
    ),
    baseEnv({ EPUB_ENABLED_SKUS: "OIP-ZZ-EPUB", __testFetch: noSquare }),
  );
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, "EPUB_SKU_NOT_FOUND");

  const disabled = await handleRequest(
    epubRequest(
      { sku: "OIP-AN-EPUB", country_code: "US" },
      { "idempotency-key": "disabled-epub-123" },
    ),
    baseEnv({ EPUB_ENABLED_SKUS: "", __testFetch: noSquare }),
  );
  assert.equal(disabled.status, 409);
  assert.equal((await disabled.json()).error.code, "EPUB_NOT_AVAILABLE");

  const declaredNonUs = await handleRequest(
    epubRequest(
      { sku: "OIP-AN-EPUB", country_code: "CA" },
      { "idempotency-key": "non-us-epub-123" },
    ),
    baseEnv({ EPUB_ENABLED_SKUS: "OIP-AN-EPUB", __testFetch: noSquare }),
  );
  assert.equal(declaredNonUs.status, 403);
  assert.equal((await declaredNonUs.json()).error.code, "EPUB_US_ONLY");

  const unprovenCountry = await handleRequest(
    epubRequest(
      { sku: "OIP-AN-EPUB", country_code: "US" },
      { "idempotency-key": "country-proof-123", "cf-ipcountry": "CA" },
    ),
    baseEnv({ EPUB_ENABLED_SKUS: "OIP-AN-EPUB", __testFetch: noSquare }),
  );
  assert.equal(unprovenCountry.status, 403);
  assert.equal((await unprovenCountry.json()).error.code, "EPUB_US_COUNTRY_NOT_PROVEN");

  const spoofedHeaderOnly = await handleRequest(
    new Request("https://downloads.outsideinprint.org/api/books/epub", {
      method: "POST",
      headers: {
        origin: "https://outsideinprint.org",
        "content-type": "application/json",
        "idempotency-key": "spoofed-country-123",
        "cf-ipcountry": "US",
      },
      body: JSON.stringify({ sku: "OIP-AN-EPUB", country_code: "US" }),
    }),
    baseEnv({ EPUB_ENABLED_SKUS: "OIP-AN-EPUB", __testFetch: noSquare }),
  );
  assert.equal(spoofedHeaderOnly.status, 403);
  assert.equal((await spoofedHeaderOnly.json()).error.code, "EPUB_US_COUNTRY_NOT_PROVEN");
  assert.equal(squareCalls, 0);
});

test("EPUB checkout fails closed for variation-map gaps and Square ID mismatch", async () => {
  const missing = await handleRequest(
    epubRequest(
      { sku: "OIP-AN-EPUB", country_code: "US" },
      { "idempotency-key": "missing-map-123" },
    ),
    baseEnv({ EPUB_ENABLED_SKUS: "OIP-AN-EPUB", SQUARE_EPUB_CATALOG_VARIATION_IDS: "{}" }),
  );
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error.code, "EPUB_CATALOG_NOT_CONFIGURED");

  let squareCalls = 0;
  const mismatched = await handleRequest(
    epubRequest(
      { sku: "OIP-AN-EPUB", country_code: "US" },
      { "idempotency-key": "mismatched-map-123" },
    ),
    baseEnv({
      EPUB_ENABLED_SKUS: "OIP-AN-EPUB",
      SQUARE_EPUB_CATALOG_VARIATION_IDS: JSON.stringify({ "OIP-AN-EPUB": "variation-configured" }),
      __testFetch: async () => {
        squareCalls += 1;
        return Response.json(epubVariation("variation-returned"));
      },
    }),
  );
  assert.equal(mismatched.status, 502);
  assert.equal((await mismatched.json()).error.code, "CHECKOUT_PROVIDER_ERROR");
  assert.equal(squareCalls, 1);
});

test("EPUB checkout uses the exact catalog-only payload and reuses an idempotent link", async () => {
  const calls = [];
  const env = baseEnv({
    EPUB_ENABLED_SKUS: "OIP-AN-EPUB",
    SQUARE_EPUB_CATALOG_VARIATION_IDS: JSON.stringify({ "OIP-AN-EPUB": "variation-an" }),
    __testFetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes("/v2/catalog/object/variation-an")) {
        assert.equal(options.method, "GET");
        return Response.json(epubVariation("variation-an"));
      }
      if (url.endsWith("/v2/online-checkout/payment-links")) {
        const body = JSON.parse(options.body);
        assert.deepEqual(body, {
          idempotency_key: body.idempotency_key,
          order: {
            location_id: "location-1",
            reference_id: "OIP-AN-EPUB",
            line_items: [{ quantity: "1", catalog_object_id: "variation-an" }],
          },
          checkout_options: {
            redirect_url: "https://outsideinprint.org/shop/",
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
          payment_note: "Outside In Print EPUB: OIP-AN-EPUB",
        });
        assert.match(body.idempotency_key, /^oip-[a-f0-9]{64}$/u);
        assert.equal(Object.hasOwn(body.order.line_items[0], "base_price_money"), false);
        assert.equal(Object.hasOwn(body.order, "taxes"), false);
        assert.equal(Object.hasOwn(body.order, "discounts"), false);
        assert.equal(Object.hasOwn(body.checkout_options, "shipping_fee"), false);
        return Response.json(epubPaymentLinkResponse({ variationId: "variation-an" }));
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });
  const makeRequest = () => epubRequest(
    { sku: "OIP-AN-EPUB", country_code: "US" },
    { "idempotency-key": "epub-reader-intent-123" },
  );
  const first = await handleRequest(makeRequest(), env);
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), {
    checkout_url: "https://square.link/u/epub",
    url: "https://square.link/u/epub",
  });
  const second = await handleRequest(makeRequest(), env);
  assert.equal(second.status, 200);
  assert.equal(calls.length, 2);
  assert.equal([...env.DB.checkouts.values()][0].request_kind, "EPUB");
});

test("Parable EPUB rejects the legacy $4.99 variation and creates only a $9.99 checkout", async () => {
  const legacyEnv = baseEnv({
    EPUB_ENABLED_SKUS: "OIP-PS-EPUB",
    SQUARE_EPUB_CATALOG_VARIATION_IDS: JSON.stringify({ "OIP-PS-EPUB": "variation-ps" }),
    __testFetch: async (url) => {
      assert.match(url, /\/v2\/catalog\/object\/variation-ps$/u);
      return Response.json(epubVariation("variation-ps", "OIP-PS-EPUB", 499));
    },
  });
  const legacyResponse = await handleRequest(
    epubRequest(
      { sku: "OIP-PS-EPUB", country_code: "US" },
      { "idempotency-key": "parable-legacy-price-123" },
    ),
    legacyEnv,
  );
  assert.equal(legacyResponse.status, 502);
  assert.equal((await legacyResponse.json()).error.code, "CHECKOUT_PROVIDER_ERROR");

  const currentEnv = baseEnv({
    EPUB_ENABLED_SKUS: "OIP-PS-EPUB",
    SQUARE_EPUB_CATALOG_VARIATION_IDS: JSON.stringify({ "OIP-PS-EPUB": "variation-ps" }),
    __testFetch: async (url, options = {}) => {
      if (url.includes("/v2/catalog/object/variation-ps")) {
        return Response.json(epubVariation("variation-ps", "OIP-PS-EPUB", 999));
      }
      if (url.endsWith("/v2/online-checkout/payment-links")) {
        const body = JSON.parse(options.body);
        assert.equal(body.order.reference_id, "OIP-PS-EPUB");
        assert.deepEqual(body.order.line_items, [{ quantity: "1", catalog_object_id: "variation-ps" }]);
        assert.equal(Object.hasOwn(body.order.line_items[0], "base_price_money"), false);
        return Response.json(epubPaymentLinkResponse({
          variationId: "variation-ps",
          sku: "OIP-PS-EPUB",
          priceCents: 999,
        }));
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });
  const currentResponse = await handleRequest(
    epubRequest(
      { sku: "OIP-PS-EPUB", country_code: "US" },
      { "idempotency-key": "parable-current-price-123" },
    ),
    currentEnv,
  );
  assert.equal(currentResponse.status, 201);
  assert.equal((await currentResponse.json()).checkout_url, "https://square.link/u/epub");
});

test("EPUB checkout withholds a Square link whose created order includes tax", async () => {
  const env = baseEnv({
    EPUB_ENABLED_SKUS: "OIP-AN-EPUB",
    __testFetch: async (url) => {
      if (url.includes("/v2/catalog/object/variation-1")) return Response.json(epubVariation());
      if (url.endsWith("/v2/online-checkout/payment-links")) {
        const response = epubPaymentLinkResponse();
        const order = response.related_resources.orders[0];
        order.total_tax_money.amount = 75;
        order.total_money.amount = 1074;
        order.line_items[0].total_tax_money.amount = 75;
        order.line_items[0].total_money.amount = 1074;
        return Response.json(response);
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });
  const response = await handleRequest(
    epubRequest(
      { sku: "OIP-AN-EPUB", country_code: "US" },
      { "idempotency-key": "taxed-epub-order-123" },
    ),
    env,
  );
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, "CHECKOUT_PROVIDER_ERROR");
});

test("EPUB route enforces CORS and handles preflight without exposing checkout", async () => {
  const env = baseEnv({ EPUB_ENABLED_SKUS: "OIP-AN-EPUB" });
  const preflight = await handleRequest(
    new Request("https://downloads.outsideinprint.org/api/books/epub", {
      method: "OPTIONS",
      headers: {
        origin: "https://outsideinprint.org",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,idempotency-key",
      },
    }),
    env,
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://outsideinprint.org");
  assert.equal(preflight.headers.get("access-control-allow-methods"), "POST, OPTIONS");

  const rejected = epubRequest(
    { sku: "OIP-AN-EPUB", country_code: "US" },
    { origin: "https://attacker.example", "idempotency-key": "blocked-origin-123" },
  );
  const response = await handleRequest(rejected, env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "ORIGIN_NOT_ALLOWED");
  assert.equal(response.headers.get("access-control-allow-origin"), null);

  const wrongMethod = await handleRequest(
    new Request("https://downloads.outsideinprint.org/api/books/epub", { method: "GET" }),
    env,
  );
  assert.equal(wrongMethod.status, 404);
});

test("EPUB checkout claim fencing blocks concurrent provider work", async () => {
  let releaseCatalog;
  let markCatalogStarted;
  const catalogResponse = new Promise((resolve) => { releaseCatalog = resolve; });
  const catalogStarted = new Promise((resolve) => { markCatalogStarted = resolve; });
  const env = baseEnv({
    EPUB_ENABLED_SKUS: "OIP-AN-EPUB",
    __testFetch: async (url) => {
      if (url.includes("/v2/catalog/object/variation-1")) {
        markCatalogStarted();
        return catalogResponse;
      }
      if (url.endsWith("/v2/online-checkout/payment-links")) {
        return Response.json(epubPaymentLinkResponse({ linkId: "epub-link" }));
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });
  const request = () => epubRequest(
    { sku: "OIP-AN-EPUB", country_code: "US" },
    { "idempotency-key": "concurrent-epub-123" },
  );
  const firstPromise = handleRequest(request(), env);
  await catalogStarted;
  const concurrent = await handleRequest(request(), env);
  assert.equal(concurrent.status, 503);
  assert.equal((await concurrent.json()).error.code, "CHECKOUT_ALREADY_PROCESSING");
  releaseCatalog(Response.json(epubVariation()));
  assert.equal((await firstPromise).status, 201);
});

test("physical checkout validates paperback-only quantities, U.S. geography, and rejects client totals", async () => {
  assert.deepEqual([1, 2, 3, 4, 6].map(shippingCentsForQuantity), [499, 599, 599, 749, 749]);
  assert.equal(taxCentsForPhysicalLines([
    { priceCents: 101, quantity: 1 },
    { priceCents: 101, quantity: 1 },
  ], 101, 750), 24);
  assert.throws(() => shippingCentsForQuantity(7), /one through six/u);
  const base = {
    items: [{ sku: "OIP-AN-PB", quantity: 1 }],
    destination: physicalDestination({ administrative_district_level_1: "GA", postal_code: "30303" }),
  };
  assert.equal(validatePhysicalCheckoutRequest(base).totalQuantity, 1);
  assert.throws(
    () => validatePhysicalCheckoutRequest({ ...base, tax_rate: 0 }),
    /Only items and destination/u,
  );
  assert.throws(
    () => validatePhysicalCheckoutRequest({
      ...base,
      items: [{ sku: "OIP-AN-PB", quantity: 6 }, { sku: "OIP-WC-PB", quantity: 1 }],
    }),
    /at most six/u,
  );
  assert.throws(
    () => validatePhysicalCheckoutRequest({
      ...base,
      items: [{ sku: "OIP-AN-PB", quantity: 1, price_cents: 1 }],
    }),
    /only sku and quantity/u,
  );
  assert.throws(
    () => validatePhysicalCheckoutRequest({
      ...base,
      items: [{ sku: "OIP-AN-PB", quantity: 1 }],
      destination: { ...base.destination, country: "CA" },
    }),
    /only in the United States/u,
  );
  for (const addressLine1 of ["PO Box 12", "APO AE 09012", "Rural Route 2 Box 4"]) {
    assert.throws(
      () => validatePhysicalCheckoutRequest({
        ...base,
        destination: { ...base.destination, address_line_1: addressLine1 },
      }),
      /manual review/u,
    );
  }
  assert.throws(
    () => validatePhysicalCheckoutRequest({
      ...base,
      destination: { ...base.destination, address_line_1: "123 Main Street #5" },
    }),
    /address line 2/u,
  );
  assert.throws(
    () => validatePhysicalCheckoutRequest({
      ...base,
      destination: { ...base.destination, address_line_2: "PO Box 12" },
    }),
    /manual review/u,
  );
  assert.equal(validatePhysicalCheckoutRequest({
    ...base,
    destination: { ...base.destination, address_line_2: "Apartment 5" },
  }).destination.address_line_2, "Apartment 5");

  let squareCalls = 0;
  const disabled = await handleRequest(
    physicalRequest(base),
    baseEnv({ __testFetch: async () => { squareCalls += 1; throw new Error("no Square"); } }),
  );
  assert.equal(disabled.status, 409);
  assert.equal((await disabled.json()).error.code, "PAPERBACK_NOT_AVAILABLE");
  const mixed = await handleRequest(
    physicalRequest({ ...base, items: [{ sku: "OIP-AN-EPUB", quantity: 1 }] }),
    baseEnv({ PAPERBACK_ENABLED_SKUS: "OIP-AN-PB", __testFetch: async () => { squareCalls += 1; } }),
  );
  assert.equal(mixed.status, 404);
  assert.equal((await mixed.json()).error.code, "PAPERBACK_SKU_NOT_FOUND");
  assert.equal(squareCalls, 0);
});

test("address binding normalizes common Square formatting but keeps units distinct", async () => {
  const env = baseEnv();
  const long = physicalDestination({ address_line_2: "Apartment 2B" });
  const abbreviated = physicalDestination({
    address_line_1: "123 MAIN ST.",
    address_line_2: "APT 2B",
    postal_code: "32202",
  });
  assert.equal(normalizedAddressKey(long), normalizedAddressKey(abbreviated));
  assert.equal(
    await physicalAddressBindingHash(env, long),
    await physicalAddressBindingHash(env, abbreviated),
  );
  assert.notEqual(
    await physicalAddressBindingHash(env, long),
    await physicalAddressBindingHash(env, { ...long, address_line_2: "Apartment 3B" }),
  );
});

test("Florida PointMatch resolution accepts safe primary-unit fallback and fails closed on bad evidence", async () => {
  const apartment = physicalDestination({ address_line_2: "APT 2B" });
  const env = baseEnv();
  await seedFloridaProvider(env, apartment, { includeUnit: false });
  const resolved = await resolveFloridaJurisdiction(env, apartment, Math.floor(Date.now() / 1000));
  assert.equal(resolved.countyFips, "12031");
  assert.equal(resolved.combinedRateBps, 750);
  assert.equal(resolved.resolutionMethod, "POINTMATCH_PRIMARY_HMAC_V1");

  for (const [surtaxRateBps, combinedRateBps] of [[200, 800], [0, 600]]) {
    const rateEnv = baseEnv();
    await seedFloridaProvider(rateEnv, apartment, {
      includeUnit: false,
      rate: { surtax_rate_bps: surtaxRateBps, combined_rate_bps: combinedRateBps },
    });
    assert.equal(
      (await resolveFloridaJurisdiction(rateEnv, apartment, Math.floor(Date.now() / 1000))).combinedRateBps,
      combinedRateBps,
    );
  }

  const missingProvider = baseEnv();
  await assert.rejects(
    () => resolveFloridaJurisdiction(missingProvider, apartment, Math.floor(Date.now() / 1000)),
    (error) => error.code === "FL_JURISDICTION_PROVIDER_UNAVAILABLE",
  );

  const missingShardBinding = baseEnv();
  await seedFloridaProvider(missingShardBinding, apartment, { includeUnit: false });
  delete missingShardBinding.JURISDICTION_BUCKET;
  await assert.rejects(
    () => resolveFloridaJurisdiction(missingShardBinding, apartment, Math.floor(Date.now() / 1000)),
    (error) => error.code === "POINTMATCH_SHARD_PROVIDER_NOT_CONFIGURED",
  );

  const corruptShard = baseEnv();
  await seedFloridaProvider(corruptShard, apartment, { includeUnit: false });
  const corruptIndexKey = `${corruptShard.POINTMATCH_SHARD_PREFIX}/${corruptShard.POINTMATCH_DATASET_VERSION}/index.json`;
  const corruptIndex = JSON.parse(corruptShard.JURISDICTION_BUCKET.objects.get(corruptIndexKey));
  corruptShard.JURISDICTION_BUCKET.objects.set(corruptIndex.shards[0].object_key, "{\"tampered\":true}");
  await assert.rejects(
    () => resolveFloridaJurisdiction(corruptShard, apartment, Math.floor(Date.now() / 1000)),
    (error) => error.code === "FL_JURISDICTION_SHARD_INVALID",
  );

  const schemaMismatch = baseEnv();
  await seedFloridaProvider(schemaMismatch, apartment, {
    includeUnit: false,
    manifest: { schema_version: "unexpected-schema" },
  });
  await assert.rejects(
    () => resolveFloridaJurisdiction(schemaMismatch, apartment, Math.floor(Date.now() / 1000)),
    (error) => error.code === "FL_JURISDICTION_SCHEMA_MISMATCH",
  );

  const future = baseEnv();
  await seedFloridaProvider(future, apartment, {
    includeUnit: false,
    manifest: { effective_from: Math.floor(Date.now() / 1000) + 3600 },
  });
  await assert.rejects(
    () => resolveFloridaJurisdiction(future, apartment, Math.floor(Date.now() / 1000)),
    (error) => error.code === "FL_JURISDICTION_DATA_STALE",
  );

  const pending = baseEnv();
  await seedFloridaProvider(pending, apartment, {
    includeUnit: false,
    match: { pending_effective_date: "2027-01-01" },
  });
  await assert.rejects(
    () => resolveFloridaJurisdiction(pending, apartment, Math.floor(Date.now() / 1000)),
    (error) => error.code === "FL_ADDRESS_PENDING",
  );

  const badCountyCount = baseEnv();
  await seedFloridaProvider(badCountyCount, apartment, {
    includeUnit: false,
    rateManifest: { row_count: 66 },
  });
  await assert.rejects(
    () => resolveFloridaJurisdiction(badCountyCount, apartment, Math.floor(Date.now() / 1000)),
    (error) => error.code === "FL_TAX_RATE_DATA_STALE",
  );

  const stale = baseEnv();
  await seedFloridaProvider(stale, apartment, {
    includeUnit: false,
    manifest: { stale_after: Math.floor(Date.now() / 1000) - 1 },
  });
  await assert.rejects(
    () => resolveFloridaJurisdiction(stale, apartment, Math.floor(Date.now() / 1000)),
    (error) => error.code === "FL_JURISDICTION_DATA_STALE",
  );

  const ambiguous = baseEnv();
  await seedFloridaProvider(ambiguous, apartment, { includeUnit: false });
  const ambiguousIndexKey = `${ambiguous.POINTMATCH_SHARD_PREFIX}/${ambiguous.POINTMATCH_DATASET_VERSION}/index.json`;
  const ambiguousIndex = JSON.parse(ambiguous.JURISDICTION_BUCKET.objects.get(ambiguousIndexKey));
  const ambiguousEntry = ambiguousIndex.shards[0];
  const ambiguousPayload = JSON.parse(
    ambiguous.JURISDICTION_BUCKET.objects.get(ambiguousEntry.object_key),
  );
  ambiguousPayload.records.push({ ...ambiguousPayload.records[0] });
  const ambiguousRaw = JSON.stringify(ambiguousPayload);
  ambiguous.JURISDICTION_BUCKET.objects.set(ambiguousEntry.object_key, ambiguousRaw);
  ambiguousEntry.row_count = 2;
  ambiguousEntry.content_sha256 = await sha256Hex(ambiguousRaw);
  ambiguousIndex.row_count = 2;
  const ambiguousIndexRaw = canonicalPointMatchIndex(ambiguousIndex);
  ambiguous.JURISDICTION_BUCKET.objects.set(ambiguousIndexKey, ambiguousIndexRaw);
  ambiguous.POINTMATCH_INDEX_ROOT_SHA256 = await sha256Hex(ambiguousIndexRaw);
  const ambiguousManifest = ambiguous.DB.jurisdictionDatasets.get(ambiguous.POINTMATCH_DATASET_VERSION);
  ambiguousManifest.row_count = 2;
  ambiguousManifest.content_sha256 = ambiguous.POINTMATCH_INDEX_ROOT_SHA256;
  await assert.rejects(
    () => resolveFloridaJurisdiction(ambiguous, apartment, Math.floor(Date.now() / 1000)),
    (error) => error.code === "FL_ADDRESS_AMBIGUOUS",
  );

  const unitRequired = baseEnv();
  const noUnit = physicalDestination();
  await seedFloridaProvider(unitRequired, noUnit, { includeUnit: true });
  await assert.rejects(
    () => resolveFloridaJurisdiction(unitRequired, noUnit, Math.floor(Date.now() / 1000)),
    (error) => error.code === "FL_ADDRESS_UNIT_REQUIRED",
  );
});

test("non-Florida ZIP and state are verified live by the default-closed USPS provider", async () => {
  const destination = physicalDestination({
    locality: "Atlanta", administrative_district_level_1: "GA", postal_code: "30303",
  });
  await assert.rejects(
    () => resolveFloridaJurisdiction(baseEnv(), destination, Math.floor(Date.now() / 1000)),
    (error) => error.code === "US_ZIP_STATE_PROVIDER_NOT_CONFIGURED",
  );
  const nonDefaultPort = baseEnv();
  enableTestUspsProvider(nonDefaultPort);
  nonDefaultPort.USPS_ADDRESSES_API_BASE_URL = "https://apis-tem.usps.com:8443";
  await assert.rejects(
    () => resolveFloridaJurisdiction(nonDefaultPort, destination, Math.floor(Date.now() / 1000)),
    (error) => error.code === "US_ZIP_STATE_PROVIDER_NOT_CONFIGURED",
  );
  const mismatch = baseEnv();
  enableTestUspsProvider(mismatch, { state: "NY", zip5: "30303" });
  await assert.rejects(
    () => resolveFloridaJurisdiction(mismatch, destination, Math.floor(Date.now() / 1000)),
    (error) => error.code === "PHYSICAL_ZIP_STATE_MISMATCH",
  );
  const invalid = baseEnv();
  enableTestUspsProvider(invalid, { state: "GA", zip5: "99999" });
  await assert.rejects(
    () => resolveFloridaJurisdiction(invalid, destination, Math.floor(Date.now() / 1000)),
    (error) => ["US_ZIP_STATE_PROVIDER_UNAVAILABLE", "PHYSICAL_ZIP_STATE_UNVERIFIED"].includes(error.code),
  );
});

test("Florida physical checkout uses exact catalog versions, explicit line tax, and taxable shipping service charge", async () => {
  const destination = physicalDestination();
  const env = baseEnv({ PAPERBACK_ENABLED_SKUS: "OIP-AN-PB" });
  await seedFloridaProvider(env, destination, { includeUnit: false });
  const calls = [];
  env.__testFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/v2/catalog/object/variation-an-pb")) return Response.json(paperbackVariation());
    if (url.endsWith("/v2/inventory/counts/batch-retrieve")) return Response.json(paperbackInventory());
    if (url.endsWith("/v2/orders/calculate")) {
      const response = physicalPaymentLinkResponse();
      const calculated = response.related_resources.orders[0];
      // CalculateOrder is not a payment-link envelope and does not need to
      // return the link-created Order id/state/reference fields.
      delete calculated.id;
      delete calculated.state;
      delete calculated.reference_id;
      return Response.json({ order: calculated });
    }
    if (url.endsWith("/v2/online-checkout/payment-links")) {
      const body = JSON.parse(options.body);
      assert.equal(Object.hasOwn(body.order.line_items[0], "base_price_money"), false);
      assert.equal(body.order.line_items[0].catalog_version, 17);
      assert.deepEqual(body.order.line_items[0].applied_taxes, [{ tax_uid: "fl-sales-tax" }]);
      assert.deepEqual(body.order.pricing_options, {
        auto_apply_taxes: false,
        auto_apply_discounts: false,
      });
      assert.deepEqual(body.order.service_charges, [{
        uid: "shipping",
        name: "USPS Media Mail",
        amount_money: { amount: 499, currency: "USD" },
        calculation_phase: "SUBTOTAL_PHASE",
        treatment_type: "LINE_ITEM_TREATMENT",
        scope: "ORDER",
        taxable: true,
        applied_taxes: [{ tax_uid: "fl-sales-tax" }],
      }]);
      assert.equal(body.order.taxes[0].percentage, "7.5");
      assert.equal(Object.hasOwn(body.checkout_options, "shipping_fee"), false);
      assert.equal(body.checkout_options.ask_for_shipping_address, true);
      assert.equal(body.checkout_options.merchant_support_email, "support@outsideinprint.org");
      assert.deepEqual(body.pre_populated_data.buyer_address, destination);
      const response = physicalPaymentLinkResponse();
      response.related_resources.orders[0].reference_id = body.order.reference_id;
      return Response.json(response);
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const makeRequest = () => physicalRequest({
    items: [{ sku: "OIP-AN-PB", quantity: 1 }],
    destination,
  });
  const first = await handleRequest(makeRequest(), env);
  assert.equal(first.status, 201);
  assert.equal((await first.json()).checkout_url, "https://square.link/u/physical");
  const second = await handleRequest(makeRequest(), env);
  assert.equal(second.status, 200);
  assert.equal(calls.length, 4);
  const binding = [...env.DB.physicalCheckouts.values()][0];
  assert.equal(binding.address_hmac.length, 64);
  assert.equal(binding.county_fips, "12031");
  assert.equal(binding.tax_cents, 157);
  assert.equal(binding.shipping_cents, 499);
  assert.equal(binding.total_cents, 2255);
  assert.equal(binding.items_json.includes("123 Main"), false);
});

test("a second Florida county uses its resolved destination rate for book and shipping", async () => {
  const destination = physicalDestination({
    address_line_1: "456 Fictional Avenue",
    locality: "Orlando",
    postal_code: "32801",
  });
  const env = baseEnv({ PAPERBACK_ENABLED_SKUS: "OIP-AN-PB" });
  await seedFloridaProvider(env, destination, {
    includeUnit: false,
    match: { county_fips: "12095" },
    rate: { surtax_rate_bps: 200 },
  });
  env.__testFetch = async (url, options = {}) => {
    if (url.includes("/v2/catalog/object/variation-an-pb")) return Response.json(paperbackVariation());
    if (url.endsWith("/v2/inventory/counts/batch-retrieve")) return Response.json(paperbackInventory());
    if (url.endsWith("/v2/orders/calculate")) {
      const response = physicalPaymentLinkResponse({ rateBps: 800 });
      const calculated = response.related_resources.orders[0];
      delete calculated.id;
      delete calculated.state;
      delete calculated.reference_id;
      return Response.json({ order: calculated });
    }
    if (url.endsWith("/v2/online-checkout/payment-links")) {
      const body = JSON.parse(options.body);
      assert.equal(body.order.taxes[0].percentage, "8");
      assert.equal(body.order.service_charges[0].taxable, true);
      const response = physicalPaymentLinkResponse({ rateBps: 800 });
      response.related_resources.orders[0].reference_id = body.order.reference_id;
      return Response.json(response);
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const response = await handleRequest(physicalRequest({
    items: [{ sku: "OIP-AN-PB", quantity: 1 }],
    destination,
  }, { "idempotency-key": "physical-second-county" }), env);
  assert.equal(response.status, 201);
  const binding = [...env.DB.physicalCheckouts.values()][0];
  assert.equal(binding.county_fips, "12095");
  assert.equal(binding.combined_rate_bps, 800);
  assert.equal(binding.tax_cents, 168);
  assert.equal(binding.shipping_tax_cents, 40);
  assert.equal(binding.total_cents, 2266);
});

test("Square CalculateOrder penny allocation is authoritative across multiple taxable lines", async () => {
  const destination = physicalDestination();
  const env = baseEnv({
    PAPERBACK_ENABLED_SKUS: "OIP-AN-PB,OIP-WC-PB",
    SQUARE_PAPERBACK_CATALOG: JSON.stringify({
      "OIP-AN-PB": { variation_id: "variation-an-pb", price_cents: 101 },
      "OIP-WC-PB": { variation_id: "variation-wc-pb", price_cents: 101 },
    }),
  });
  await seedFloridaProvider(env, destination, { includeUnit: false });
  env.__testFetch = async (url, options = {}) => {
    if (url.includes("/v2/catalog/object/variation-an-pb")) {
      return Response.json(paperbackVariation("variation-an-pb", "OIP-AN-PB", 101, 17));
    }
    if (url.includes("/v2/catalog/object/variation-wc-pb")) {
      return Response.json(paperbackVariation("variation-wc-pb", "OIP-WC-PB", 101, 19));
    }
    if (url.endsWith("/v2/inventory/counts/batch-retrieve")) {
      return Response.json(paperbackInventory({ "variation-an-pb": "25.00000", "variation-wc-pb": 25 }));
    }
    if (url.endsWith("/v2/orders/calculate")) {
      const body = JSON.parse(options.body);
      assert.equal(body.order.line_items.length, 2);
      assert.equal(body.order.service_charges[0].amount_money.amount, 599);
      return Response.json(roundingEdgePhysicalOrder({ envelope: false }));
    }
    if (url.endsWith("/v2/online-checkout/payment-links")) {
      const body = JSON.parse(options.body);
      return Response.json(roundingEdgePhysicalOrder({
        envelope: true,
        referenceId: body.order.reference_id,
      }));
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const response = await handleRequest(physicalRequest({
    items: [
      { sku: "OIP-AN-PB", quantity: 1 },
      { sku: "OIP-WC-PB", quantity: 1 },
    ],
    destination,
  }, { "idempotency-key": "physical-rounding-intent" }), env);
  assert.equal(response.status, 201);
  const binding = [...env.DB.physicalCheckouts.values()][0];
  // Aggregate rounding would be 60 cents; Square's participant allocation is 61.
  assert.equal(Math.round(((101 + 101 + 599) * 750) / 10000), 60);
  assert.equal(binding.tax_cents, 61);
  assert.equal(binding.shipping_tax_cents, 45);
  assert.equal(binding.total_cents, 862);
});

test("non-Florida physical checkout applies no Florida tax and still classifies shipping as a service charge", async () => {
  const destination = physicalDestination({
    locality: "Atlanta",
    administrative_district_level_1: "GA",
    postal_code: "30303",
  });
  const env = baseEnv({
    PAPERBACK_ENABLED_SKUS: "OIP-AN-PB",
    __testFetch: async (url, options = {}) => {
      if (url.includes("/v2/catalog/object/variation-an-pb")) return Response.json(paperbackVariation());
      if (url.endsWith("/v2/inventory/counts/batch-retrieve")) return Response.json(paperbackInventory());
      if (url.endsWith("/v2/orders/calculate")) {
        const response = physicalPaymentLinkResponse({ florida: false });
        const calculated = response.related_resources.orders[0];
        delete calculated.id;
        delete calculated.state;
        delete calculated.reference_id;
        return Response.json({ order: calculated });
      }
      const body = JSON.parse(options.body);
      assert.equal(Object.hasOwn(body.order, "taxes"), false);
      assert.equal(Object.hasOwn(body.order.line_items[0], "applied_taxes"), false);
      assert.equal(body.order.service_charges[0].taxable, false);
      const response = physicalPaymentLinkResponse({ florida: false });
      response.related_resources.orders[0].reference_id = body.order.reference_id;
      return Response.json(response);
    },
  });
  enableTestUspsProvider(env);
  const response = await handleRequest(physicalRequest({
    items: [{ sku: "OIP-AN-PB", quantity: 1 }],
    destination,
  }), env);
  assert.equal(response.status, 201);
  const binding = [...env.DB.physicalCheckouts.values()][0];
  assert.equal(binding.tax_cents, 0);
  assert.equal(binding.county_fips, null);
  assert.equal(binding.resolution_method, "USPS_ADDRESSES_API_V3_CITY_STATE_EXACT");
});

test("paperback inventory and catalog verification fail closed on unusable Square evidence", async () => {
  const configured = {
    product: { sku: "OIP-AN-PB" },
    catalogObjectId: "variation-an-pb",
    priceCents: 1599,
  };
  const decimalEnv = baseEnv({
    __testFetch: async () => Response.json(paperbackInventory({ "variation-an-pb": "25.00000" })),
  });
  assert.equal(
    (await retrievePaperbackInventory(decimalEnv, [configured])).get("variation-an-pb"),
    25,
  );
  for (const quantity of ["1.5", "NaN"]) {
    const env = baseEnv({
      __testFetch: async () => Response.json(paperbackInventory({ "variation-an-pb": quantity })),
    });
    await assert.rejects(
      () => retrievePaperbackInventory(env, [configured]),
      (error) => error.code === "SQUARE_PAPERBACK_INVENTORY_UNVERIFIED",
    );
  }
  const duplicateEnv = baseEnv({
    __testFetch: async () => {
      const payload = paperbackInventory();
      payload.counts.push({ ...payload.counts[0] });
      return Response.json(payload);
    },
  });
  await assert.rejects(
    () => retrievePaperbackInventory(duplicateEnv, [configured]),
    (error) => error.code === "SQUARE_PAPERBACK_INVENTORY_UNVERIFIED",
  );

  const untracked = paperbackVariation();
  untracked.object.item_variation_data.track_inventory = false;
  await assert.rejects(
    () => verifyPaperbackCatalogVariation(
      baseEnv({ __testFetch: async () => Response.json(untracked) }),
      configured,
    ),
    (error) => error.code === "SQUARE_PAPERBACK_CATALOG_LOCATION_MISMATCH",
  );
  const soldOut = paperbackVariation();
  soldOut.object.item_variation_data.location_overrides = [{ location_id: "location-1", sold_out: true }];
  await assert.rejects(
    () => verifyPaperbackCatalogVariation(
      baseEnv({ __testFetch: async () => Response.json(soldOut) }),
      configured,
    ),
    (error) => error.code === "SQUARE_PAPERBACK_OUT_OF_STOCK",
  );
});

test("physical inventory reservations are idempotent and remain counted until link cancellation", async () => {
  const env = baseEnv();
  const item = {
    product: { sku: "OIP-AN-PB" }, catalogObjectId: "variation-an-pb",
    quantity: 1, inventoryCount: 1,
  };
  env.DB.checkouts.set("reservation-1", {
    request_key: "reservation-1", status: "PROCESSING", processing_token: "claim-1",
  });
  const first = {
    requestKey: "reservation-1", claimToken: "claim-1", items: [item], now: 100, expiresAt: 110,
  };
  assert.equal(await reservePhysicalInventory(env.DB, first), true);
  assert.equal(await reservePhysicalInventory(env.DB, first), true);
  assert.equal(env.DB.inventoryReservations.size, 1);
  env.DB.checkouts.get("reservation-1").processing_token = "claim-2";
  assert.equal(await reservePhysicalInventory(env.DB, { ...first, claimToken: "claim-2", now: 101 }), true);
  assert.equal(
    await releasePhysicalInventoryReservations(env.DB, "reservation-1", 102, "claim-1"),
    0,
  );
  assert.equal(env.DB.inventoryReservations.get("reservation-1:OIP-AN-PB").status, "ACTIVE");

  // Expiry is only a cleanup trigger. The still-usable Square link keeps its
  // reservation until cancellation is confirmed and status becomes RELEASED.
  env.DB.checkouts.set("reservation-2", {
    request_key: "reservation-2", status: "PROCESSING", processing_token: "claim-r2",
  });
  assert.equal(await reservePhysicalInventory(env.DB, {
    requestKey: "reservation-2", claimToken: "claim-r2", items: [item], now: 200, expiresAt: 210,
  }), false);
  env.DB.physicalCheckouts.set("reservation-1", {
    request_key: "reservation-1", status: "EXPIRED",
  });
  assert.equal(await reconcileExpiredPhysicalReservations(env.DB, 201), 1);
  assert.equal(await reservePhysicalInventory(env.DB, {
    requestKey: "reservation-2", claimToken: "claim-r2", items: [item], now: 202, expiresAt: 212,
  }), true);
  const expected = [{ sku: "OIP-AN-PB", catalog_object_id: "variation-an-pb", quantity: 1 }];
  assert.equal(await markPhysicalInventoryPaid(env.DB, "reservation-2", [
    { ...expected[0], catalog_object_id: "variation-wrong" },
  ], 202), false);
  assert.equal(env.DB.inventoryReservations.get("reservation-2:OIP-AN-PB").status, "ACTIVE");
  assert.equal(await markPhysicalInventoryPaid(env.DB, "missing-reservation", expected, 203), false);
  assert.equal(await markPhysicalInventoryPaid(env.DB, "reservation-2", expected, 203), true);
  env.DB.inventoryReservations.get("reservation-2:OIP-AN-PB").status = "SOLD_VERIFIED";
  assert.equal(await markPhysicalInventoryPaid(env.DB, "reservation-2", expected, 204), true);
});

test("an unverified Square payment link is deleted and its inventory reservation is released", async () => {
  const destination = physicalDestination({
    locality: "Atlanta", administrative_district_level_1: "GA", postal_code: "30303",
  });
  let deleted = 0;
  const env = baseEnv({
    PAPERBACK_ENABLED_SKUS: "OIP-AN-PB",
    __testFetch: async (url, options = {}) => {
      if (url.includes("/v2/catalog/object/variation-an-pb")) return Response.json(paperbackVariation());
      if (url.endsWith("/v2/inventory/counts/batch-retrieve")) return Response.json(paperbackInventory());
      if (url.endsWith("/v2/orders/calculate")) {
        const calculated = physicalPaymentLinkResponse({ florida: false }).related_resources.orders[0];
        delete calculated.id;
        delete calculated.state;
        delete calculated.reference_id;
        return Response.json({ order: calculated });
      }
      if (options.method === "DELETE") {
        deleted += 1;
        return Response.json({});
      }
      if (url.endsWith("/v2/online-checkout/payment-links")) {
        const body = JSON.parse(options.body);
        const response = physicalPaymentLinkResponse({ florida: false });
        response.related_resources.orders[0].reference_id = body.order.reference_id;
        response.payment_link.checkout_options.ask_for_shipping_address = false;
        return Response.json(response);
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });
  enableTestUspsProvider(env);
  const response = await handleRequest(physicalRequest({
    items: [{ sku: "OIP-AN-PB", quantity: 1 }], destination,
  }, { "idempotency-key": "physical-orphan-cleanup" }), env);
  assert.equal(response.status, 502);
  assert.equal(deleted, 1);
  assert.equal([...env.DB.inventoryReservations.values()][0].status, "RELEASED");
  assert.equal(env.DB.physicalCheckouts.size, 0);
});

test("a displaced physical checkout worker cannot delete the reclaimer's idempotent Square link", async () => {
  let oldClaimOwned = true;
  let paymentLinkCalls = 0;
  let deleted = 0;
  const env = baseEnv({
    __testFetch: async (url, options = {}) => {
      if (url.includes("/v2/catalog/object/variation-an-pb")) return Response.json(paperbackVariation());
      if (url.endsWith("/v2/inventory/counts/batch-retrieve")) return Response.json(paperbackInventory());
      if (url.endsWith("/v2/orders/calculate")) {
        const calculated = physicalPaymentLinkResponse({ florida: false }).related_resources.orders[0];
        delete calculated.id;
        delete calculated.state;
        delete calculated.reference_id;
        return Response.json({ order: calculated });
      }
      if (options.method === "DELETE") {
        deleted += 1;
        return Response.json({});
      }
      if (url.endsWith("/v2/online-checkout/payment-links")) {
        paymentLinkCalls += 1;
        const body = JSON.parse(options.body);
        const response = physicalPaymentLinkResponse({ florida: false });
        response.related_resources.orders[0].reference_id = body.order.reference_id;
        if (paymentLinkCalls === 1) oldClaimOwned = false;
        return Response.json(response);
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });
  const checkout = {
    items: [{
      product: { sku: "OIP-AN-PB" },
      catalogObjectId: "variation-an-pb",
      priceCents: 1599,
      quantity: 1,
    }],
    destination: physicalDestination({
      locality: "Atlanta", administrative_district_level_1: "GA", postal_code: "30303",
    }),
    merchandiseCents: 1599,
    shippingCents: 499,
    taxCents: 0,
    combinedRateBps: 0,
    referenceId: "OIP-PHYSICAL-CLAIM-FENCE",
    idempotencyKey: "square-claim-fence-key",
    reserveInventory: async () => true,
  };
  await assert.rejects(
    () => createPhysicalPaymentLink(env, {
      ...checkout,
      assertClaim: async () => {
        if (!oldClaimOwned) {
          const error = new Error("checkout claim lost");
          error.code = "CHECKOUT_CLAIM_LOST";
          throw error;
        }
      },
    }),
    (error) => error.code === "CHECKOUT_CLAIM_LOST",
  );
  const reclaimed = await createPhysicalPaymentLink(env, {
    ...checkout,
    assertClaim: async () => {},
  });
  assert.equal(reclaimed.id, "physical-link-1");
  assert.equal(paymentLinkCalls, 2);
  assert.equal(deleted, 0);
});

test("physical checkout applies a stricter per-IP reservation abuse limit", async () => {
  let squareCalls = 0;
  const env = baseEnv({
    PAPERBACK_ENABLED_SKUS: "",
    __testFetch: async () => { squareCalls += 1; throw new Error("Square must not be called"); },
  });
  const destination = physicalDestination({
    locality: "Atlanta", administrative_district_level_1: "GA", postal_code: "30303",
  });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await handleRequest(physicalRequest({
      items: [{ sku: "OIP-AN-PB", quantity: 1 }], destination,
    }, { "idempotency-key": `physical-rate-${attempt}` }), env);
    assert.equal(response.status, 409);
  }
  const limited = await handleRequest(physicalRequest({
    items: [{ sku: "OIP-AN-PB", quantity: 1 }], destination,
  }, { "idempotency-key": "physical-rate-4" }), env);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, "RATE_LIMITED");
  assert.equal(squareCalls, 0);
  assert.equal(env.DB.inventoryReservations.size, 0);
});

test("physical completed payment is held when the final shipment address changed", async () => {
  const destination = physicalDestination();
  const changed = physicalDestination({ address_line_1: "125 Main Street" });
  const env = baseEnv();
  await seedFloridaProvider(env, destination, { includeUnit: false });
  const addressHmac = await physicalAddressBindingHash(env, destination);
  env.DB.physicalCheckouts.set("physical-request-1", {
    request_key: "physical-request-1",
    square_payment_link_id: "physical-link-1",
    square_order_id: "physical-order-1",
    square_payment_id: null,
    items_json: JSON.stringify([{
      sku: "OIP-AN-PB", quantity: 1, catalog_object_id: "variation-an-pb",
      catalog_version: 17, price_cents: 1599, tax_cents: 120, inventory_count_at_checkout: 25,
    }]),
    address_hmac: addressHmac,
    state_code: "FL",
    county_fips: "12031",
    combined_rate_bps: 750,
    dataset_version: env.POINTMATCH_DATASET_VERSION,
    rate_table_version: env.FL_SALES_TAX_RATE_VERSION,
    resolution_method: "POINTMATCH_UNIT_EXACT_HMAC_V1",
    merchandise_cents: 1599,
    shipping_cents: 499,
    shipping_tax_cents: 37,
    tax_cents: 157,
    total_cents: 2255,
    status: "LINK_CREATED",
    expires_at: 9999999999,
  });
  seedPhysicalReservation(env, "physical-request-1");
  const created = physicalPaymentLinkResponse({ orderState: "OPEN", address: changed });
  const order = created.related_resources.orders[0];
  const payment = {
    id: "physical-payment-1",
    order_id: order.id,
    location_id: "location-1",
    status: "COMPLETED",
    source_type: "CARD",
    amount_money: { amount: 2255, currency: "USD" },
    refunded_money: { amount: 0, currency: "USD" },
    tip_money: { amount: 0, currency: "USD" },
  };
  const extraFulfillmentOrder = structuredClone(order);
  extraFulfillmentOrder.fulfillments.push({ uid: "unexpected-pickup", type: "PICKUP" });
  assert.equal((await evaluatePhysicalOrder(env, {
    payment,
    order: extraFulfillmentOrder,
    binding: env.DB.physicalCheckouts.get("physical-request-1"),
    expectedLocationId: "location-1",
    now: Math.floor(Date.now() / 1000),
  })).reasonCode, "PHYSICAL_SHIPMENT_ADDRESS_MISSING");
  const tippedOrder = structuredClone(order);
  tippedOrder.total_tip_money = { amount: 1, currency: "USD" };
  assert.equal((await evaluatePhysicalOrder(env, {
    payment,
    order: tippedOrder,
    binding: env.DB.physicalCheckouts.get("physical-request-1"),
    expectedLocationId: "location-1",
    now: Math.floor(Date.now() / 1000),
  })).reasonCode, "PHYSICAL_ADJUSTMENT_UNEXPECTED");
  env.__testFetch = async (url) => {
    if (url.endsWith("/v2/payments/physical-payment-1")) return Response.json({ payment });
    if (url.endsWith("/v2/orders/physical-order-1")) return Response.json({ order });
    throw new Error(`unexpected request: ${url}`);
  };
  await processSquareEvent(env, {
    event_id: "physical-payment-event-1",
    type: "payment.updated",
    data: { object: { payment: { id: payment.id } } },
  }, Math.floor(Date.now() / 1000));
  const binding = env.DB.physicalCheckouts.get("physical-request-1");
  assert.equal(binding.status, "HELD");
  assert.equal(binding.hold_reason, "PHYSICAL_FINAL_ADDRESS_MISMATCH");
  assert.equal(env.DB.reviews.at(-1).reason_code, "PHYSICAL_FINAL_ADDRESS_MISMATCH");
});

test("eligible physical payment remains manual-review-only after exact address, tax, and inventory checks", async () => {
  const destination = physicalDestination();
  const env = baseEnv({ SQUARE_INVENTORY_TRANSACTION_ID_KIND: "ORDER_ID" });
  await seedFloridaProvider(env, destination, { includeUnit: false });
  const requestKey = "physical-request-ready";
  env.DB.physicalCheckouts.set(requestKey, {
    request_key: requestKey,
    square_payment_link_id: "physical-link-ready",
    square_order_id: "physical-order-1",
    square_payment_id: null,
    items_json: JSON.stringify([{
      sku: "OIP-AN-PB", quantity: 1, catalog_object_id: "variation-an-pb",
      catalog_version: 17, price_cents: 1599, tax_cents: 120,
      inventory_count_at_checkout: 25,
    }]),
    address_hmac: await physicalAddressBindingHash(env, destination),
    state_code: "FL", county_fips: "12031", combined_rate_bps: 750,
    dataset_version: env.POINTMATCH_DATASET_VERSION,
    rate_table_version: env.FL_SALES_TAX_RATE_VERSION,
    resolution_method: "POINTMATCH_UNIT_EXACT_HMAC_V1",
    merchandise_cents: 1599, shipping_cents: 499, shipping_tax_cents: 37,
    tax_cents: 157, total_cents: 2255,
    status: "LINK_CREATED", created_at: 1, expires_at: 9999999999,
  });
  seedPhysicalReservation(env, requestKey);
  const order = physicalPaymentLinkResponse({
    orderState: "OPEN", address: destination,
  }).related_resources.orders[0];
  const payment = {
    id: "physical-payment-ready", order_id: order.id, location_id: "location-1",
    status: "COMPLETED", source_type: "CARD",
    amount_money: { amount: 2255, currency: "USD" },
    refunded_money: { amount: 0, currency: "USD" },
    tip_money: { amount: 0, currency: "USD" },
  };
  env.__testFetch = async (url) => {
    if (url.endsWith("/v2/payments/physical-payment-ready")) return Response.json({ payment });
    if (url.endsWith("/v2/orders/physical-order-1")) return Response.json({ order });
    if (url.endsWith("/v2/inventory/changes/batch-retrieve")) {
      return Response.json(paperbackSaleAdjustment());
    }
    if (url.endsWith("/v2/inventory/counts/batch-retrieve")) {
      return Response.json(paperbackInventory({ "variation-an-pb": "24.00000" }));
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const unboundInventoryMode = { ...env, SQUARE_INVENTORY_TRANSACTION_ID_KIND: "" };
  assert.equal((await evaluatePhysicalOrder(unboundInventoryMode, {
    payment,
    order,
    binding: env.DB.physicalCheckouts.get(requestKey),
    expectedLocationId: "location-1",
    now: Math.floor(Date.now() / 1000),
  })).reasonCode, "PHYSICAL_INVENTORY_ADJUSTMENT_EVIDENCE_PENDING");
  await processSquareEvent(env, {
    event_id: "physical-ready-event",
    type: "payment.updated",
    data: { object: { payment: { id: payment.id } } },
  }, Math.floor(Date.now() / 1000));
  assert.equal(env.DB.physicalCheckouts.get(requestKey).status, "PAID_REVIEW_READY");
  assert.equal(env.DB.inventoryReservations.get(`${requestKey}:OIP-AN-PB`).status, "SOLD_VERIFIED");
  assert.equal(env.DB.reviews.length, 0);
});

test("missing Square shipment recipient stays retryable and never becomes shippable", async () => {
  const destination = physicalDestination();
  const env = baseEnv();
  await seedFloridaProvider(env, destination, { includeUnit: false });
  env.DB.physicalCheckouts.set("physical-request-pending", {
    request_key: "physical-request-pending",
    square_payment_link_id: "physical-link-pending",
    square_order_id: "physical-order-1",
    square_payment_id: null,
    items_json: JSON.stringify([{
      sku: "OIP-AN-PB", quantity: 1, catalog_object_id: "variation-an-pb",
      catalog_version: 17, price_cents: 1599, tax_cents: 120, inventory_count_at_checkout: 25,
    }]),
    address_hmac: await physicalAddressBindingHash(env, destination),
    state_code: "FL", county_fips: "12031", combined_rate_bps: 750,
    dataset_version: env.POINTMATCH_DATASET_VERSION,
    rate_table_version: env.FL_SALES_TAX_RATE_VERSION,
    resolution_method: "POINTMATCH_UNIT_EXACT_HMAC_V1",
    merchandise_cents: 1599, shipping_cents: 499, shipping_tax_cents: 37,
    tax_cents: 157, total_cents: 2255,
    status: "LINK_CREATED", expires_at: 9999999999,
  });
  seedPhysicalReservation(env, "physical-request-pending");
  const response = physicalPaymentLinkResponse({ orderState: "OPEN" });
  const order = response.related_resources.orders[0];
  const payment = {
    id: "physical-payment-pending", order_id: order.id, location_id: "location-1",
    status: "COMPLETED", source_type: "CARD",
    amount_money: { amount: 2255, currency: "USD" },
    refunded_money: { amount: 0, currency: "USD" }, tip_money: { amount: 0, currency: "USD" },
  };
  env.__testFetch = async (url) => {
    if (url.endsWith("/v2/payments/physical-payment-pending")) return Response.json({ payment });
    if (url.endsWith("/v2/orders/physical-order-1")) return Response.json({ order });
    throw new Error(`unexpected request: ${url}`);
  };
  await assert.rejects(
    () => processSquareEvent(env, {
      event_id: "physical-pending-event",
      type: "payment.updated",
      data: { object: { payment: { id: payment.id } } },
    }, Math.floor(Date.now() / 1000)),
    /PHYSICAL_SHIPMENT_ADDRESS_MISSING/u,
  );
  assert.equal(env.DB.physicalCheckouts.get("physical-request-pending").status, "PAYMENT_PROCESSING");
});

test("stale DRAFT payment links expire, OPEN race defers, and same-key retry cannot reuse an expired URL", async () => {
  const env = baseEnv();
  env.DB.physicalCheckouts.set("expired-request", {
    request_key: "expired-request", square_payment_link_id: "expired-link",
    square_order_id: "expired-order", square_payment_id: null, status: "LINK_CREATED", expires_at: 10,
  });
  env.DB.physicalCheckouts.set("race-request", {
    request_key: "race-request", square_payment_link_id: "race-link",
    square_order_id: "race-order", square_payment_id: null, status: "LINK_CREATED", expires_at: 10,
  });
  env.DB.physicalCheckouts.set("lag-request", {
    request_key: "lag-request", square_payment_link_id: "lag-link",
    square_order_id: "lag-order", square_payment_id: null, status: "LINK_CREATED", expires_at: 10,
  });
  const states = new Map([
    ["expired-order", ["DRAFT", "CANCELED"]],
    ["race-order", ["DRAFT", "OPEN"]],
    ["lag-order", ["DRAFT", "DRAFT"]],
  ]);
  env.__testFetch = async (url, options = {}) => {
    const orderId = [...states.keys()].find((id) => url.includes(id));
    if (orderId) return Response.json({ order: { id: orderId, state: states.get(orderId).shift() } });
    if (options.method === "DELETE") return Response.json({});
    throw new Error(`unexpected maintenance request: ${url}`);
  };
  const result = await expireUnusedPhysicalLinks(env, 100, 10);
  assert.deepEqual(result, { examined: 3, expired: 1, deferred: 2, errors: 0, orphaned: 0 });
  assert.equal(env.DB.physicalCheckouts.get("expired-request").status, "EXPIRED");
  assert.equal(env.DB.physicalCheckouts.get("race-request").status, "LINK_CREATED");
  assert.equal(env.DB.physicalCheckouts.get("lag-request").status, "LINK_CREATED");

  const destination = physicalDestination({ locality: "Atlanta", administrative_district_level_1: "GA", postal_code: "30303" });
  const routeEnv = baseEnv({ PAPERBACK_ENABLED_SKUS: "OIP-AN-PB" });
  let calls = 0;
  routeEnv.__testFetch = async (url, options = {}) => {
    calls += 1;
    if (url.includes("/v2/catalog/object/variation-an-pb")) return Response.json(paperbackVariation());
    if (url.endsWith("/v2/inventory/counts/batch-retrieve")) return Response.json(paperbackInventory());
    if (url.endsWith("/v2/orders/calculate")) {
      const body = JSON.parse(options.body);
      const response = physicalPaymentLinkResponse({ florida: false });
      response.related_resources.orders[0].reference_id = body.order.reference_id;
      return Response.json({ order: response.related_resources.orders[0] });
    }
    const body = JSON.parse(options.body);
    const response = physicalPaymentLinkResponse({ florida: false });
    response.related_resources.orders[0].reference_id = body.order.reference_id;
    return Response.json(response);
  };
  enableTestUspsProvider(routeEnv);
  const request = () => physicalRequest({ items: [{ sku: "OIP-AN-PB", quantity: 1 }], destination });
  assert.equal((await handleRequest(request(), routeEnv)).status, 201);
  const createdBinding = [...routeEnv.DB.physicalCheckouts.values()][0];
  routeEnv.DB.physicalCheckouts.delete(createdBinding.request_key);
  const unboundRetry = await handleRequest(request(), routeEnv);
  assert.equal(unboundRetry.status, 409);
  assert.equal((await unboundRetry.json()).error.code, "PHYSICAL_CHECKOUT_NOT_REUSABLE");
  routeEnv.DB.physicalCheckouts.set(createdBinding.request_key, createdBinding);
  createdBinding.status = "EXPIRED";
  const retry = await handleRequest(request(), routeEnv);
  assert.equal(retry.status, 409);
  assert.equal((await retry.json()).error.code, "PHYSICAL_CHECKOUT_EXPIRED");
  assert.equal(calls, 4);
});

test("physical expiry isolates row failures and fences stale unbound reservations for review", async () => {
  const env = baseEnv();
  env.DB.checkouts.set("orphan-request", {
    request_key: "orphan-request", status: "FAILED", processing_token: null,
  });
  seedPhysicalReservation(env, "orphan-request", { expires_at: 5 });
  for (const [requestKey, orderId, linkId, expiresAt] of [
    ["bad-cleanup", "bad-order", "bad-link", 5],
    ["good-cleanup", "good-order", "good-link", 6],
  ]) {
    env.DB.physicalCheckouts.set(requestKey, {
      request_key: requestKey,
      square_payment_link_id: linkId,
      square_order_id: orderId,
      square_payment_id: null,
      status: "LINK_CREATED",
      expires_at: expiresAt,
    });
    seedPhysicalReservation(env, requestKey, { expires_at: expiresAt });
  }
  const goodStates = ["DRAFT", "CANCELED"];
  env.__testFetch = async (url, options = {}) => {
    if (url.includes("bad-order")) throw new Error("temporary Square failure");
    if (url.includes("good-order")) {
      return Response.json({ order: { id: "good-order", state: goodStates.shift() } });
    }
    if (options.method === "DELETE" && url.includes("good-link")) return Response.json({});
    throw new Error(`unexpected cleanup request: ${url}`);
  };
  assert.deepEqual(await expireUnusedPhysicalLinks(env, 100, 10), {
    examined: 2,
    expired: 1,
    deferred: 0,
    errors: 1,
    orphaned: 1,
  });
  assert.equal(env.DB.inventoryReservations.get("orphan-request:OIP-AN-PB").status, "ORPHANED_REVIEW");
  assert.equal(env.DB.inventoryReservations.get("good-cleanup:OIP-AN-PB").status, "RELEASED");
  assert.equal(env.DB.physicalCheckouts.get("good-cleanup").status, "EXPIRED");
  assert.equal(env.DB.physicalCheckouts.get("bad-cleanup").status, "LINK_CREATED");
  assert.equal(
    env.DB.reviews.some((row) =>
      row.event_id === "physical-expiry:bad-cleanup" &&
      row.reason_code === "PHYSICAL_LINK_EXPIRY_ERROR"),
    true,
  );
});

test("a concurrent checkout request cannot share the active claim", async () => {
  let releaseSquare;
  const squareResponse = new Promise((resolve) => { releaseSquare = resolve; });
  const env = baseEnv({ __testFetch: async () => squareResponse });
  const firstPromise = handleRequest(
    supportRequest("/api/support/one-time", { amount_cents: 500 }, { "idempotency-key": "same-intent-123" }),
    env,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const concurrent = await handleRequest(
    supportRequest("/api/support/one-time", { amount_cents: 500 }, { "idempotency-key": "same-intent-123" }),
    env,
  );
  assert.equal(concurrent.status, 503);
  assert.equal((await concurrent.json()).error.code, "CHECKOUT_ALREADY_PROCESSING");
  releaseSquare(Response.json({ payment_link: { id: "link-1", url: "https://square.link/u/test" } }));
  assert.equal((await firstPromise).status, 201);
});

test("checkout requires the website to supply an Idempotency-Key", async () => {
  const response = await handleRequest(
    supportRequest("/api/support/one-time", { amount_cents: 500 }),
    baseEnv(),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "IDEMPOTENCY_KEY_REQUIRED");
});

test("checkout rejects an unapproved browser origin", async () => {
  const env = baseEnv();
  const request = supportRequest("/api/support/one-time", { amount_cents: 500 });
  request.headers.set("origin", "https://attacker.example");
  const response = await handleRequest(request, env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "ORIGIN_NOT_ALLOWED");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("production host boundary rejects Pages preview and direct hostnames", async () => {
  const response = await handleRequest(
    new Request("https://preview-branch.oip-commerce.pages.dev/health"),
    baseEnv({ PUBLIC_HOST: "downloads.outsideinprint.org" }),
  );
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "NOT_FOUND");
});

test("custom monthly checkout remains closed until renewal proof flag is enabled", async () => {
  const response = await handleRequest(
    supportRequest("/api/support/monthly", { amount_cents: 1000 }),
    baseEnv({ CUSTOM_MONTHLY_ENABLED: "false" }),
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "CUSTOM_MONTHLY_DISABLED");
});

test("fixed monthly checkout sends the plan variation and exact $5 price", async () => {
  let squareBody;
  const env = baseEnv({
    CUSTOM_MONTHLY_ENABLED: "false",
    __testFetch: async (_url, options) => {
      squareBody = JSON.parse(options.body);
      return Response.json({ payment_link: { id: "monthly-5", url: "https://square.link/u/monthly-5" } });
    },
  });
  const response = await handleRequest(
    supportRequest(
      "/api/support/monthly",
      { amount_cents: 500 },
      { "idempotency-key": "monthly-five-123" },
    ),
    env,
  );
  assert.equal(response.status, 201);
  assert.equal(squareBody.checkout_options.subscription_plan_id, "plan-1");
  assert.equal(squareBody.checkout_options.allow_tipping, false);
  assert.equal(squareBody.checkout_options.accepted_payment_methods.cash_app_pay, false);
  assert.equal(squareBody.checkout_options.accepted_payment_methods.afterpay_clearpay, false);
  assert.equal(squareBody.checkout_options.enable_coupon, false);
  assert.equal(squareBody.checkout_options.enable_loyalty, false);
  assert.equal(squareBody.order.reference_id, "OIP-SUPPORT-MONTHLY-5");
  assert.equal(squareBody.order.line_items[0].base_price_money.amount, 500);
});

test("enabled custom monthly checkout sends the selected override price", async () => {
  let squareBody;
  const env = baseEnv({
    CUSTOM_MONTHLY_ENABLED: "true",
    __testFetch: async (_url, options) => {
      squareBody = JSON.parse(options.body);
      return Response.json({ payment_link: { id: "monthly-custom", url: "https://square.link/u/monthly-custom" } });
    },
  });
  const response = await handleRequest(
    supportRequest(
      "/api/support/monthly",
      { amount_cents: 3700 },
      { "idempotency-key": "monthly-custom-123" },
    ),
    env,
  );
  assert.equal(response.status, 201);
  assert.equal(squareBody.checkout_options.subscription_plan_id, "plan-1");
  assert.equal(squareBody.order.reference_id, "OIP-SUPPORT-MONTHLY-CUSTOM");
  assert.equal(squareBody.order.line_items[0].base_price_money.amount, 3700);
});

test("static custom-monthly fallback reuses the exact provisioned plan variation", async () => {
  let squareBody;
  const env = baseEnv({
    CUSTOM_MONTHLY_ENABLED: "true",
    CUSTOM_MONTHLY_STRATEGY: "static",
    CUSTOM_MONTHLY_STATIC_PLAN_VARIATIONS: JSON.stringify({ 3700: "plan-static-3700" }),
    __testFetch: async (_url, options) => {
      squareBody = JSON.parse(options.body);
      return Response.json({ payment_link: { id: "monthly-static", url: "https://square.link/u/monthly-static" } });
    },
  });
  const response = await handleRequest(
    supportRequest(
      "/api/support/monthly",
      { amount_cents: 3700 },
      { "idempotency-key": "monthly-static-123" },
    ),
    env,
  );
  assert.equal(response.status, 201);
  assert.equal(squareBody.checkout_options.subscription_plan_id, "plan-static-3700");
  assert.equal(squareBody.order.line_items[0].base_price_money.amount, 3700);

  const unavailable = await handleRequest(
    supportRequest(
      "/api/support/monthly",
      { amount_cents: 3800 },
      { "idempotency-key": "monthly-static-456" },
    ),
    env,
  );
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error.code, "CUSTOM_MONTHLY_PLAN_NOT_PROVISIONED");
});

test("valid Square webhook is persisted, queued immediately, and replay is acknowledged", async () => {
  const env = baseEnv();
  const rawBody = JSON.stringify({ event_id: "event-1", type: "order.updated", created_at: "2026-08-13T00:00:00Z" });
  const signature = await hmacSha256Base64(
    env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    `${env.SQUARE_WEBHOOK_NOTIFICATION_URL}${rawBody}`,
  );
  const makeRequest = () =>
    new Request(env.SQUARE_WEBHOOK_NOTIFICATION_URL, {
      method: "POST",
      headers: { "x-square-hmacsha256-signature": signature, "content-type": "application/json" },
      body: rawBody,
    });
  const first = await handleRequest(makeRequest(), env);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { received: true, queued: true });
  assert.equal(env.WEBHOOK_QUEUE.sent.length, 1);
  assert.deepEqual(Object.keys(env.WEBHOOK_QUEUE.sent[0]).sort(), ["eventId", "payloadHash"]);
  assert.equal(env.DB.webhooks.get("event-1").status, "QUEUED");
  const replay = await handleRequest(makeRequest(), env);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { received: true, duplicate: true, queued: true });
  assert.equal(env.WEBHOOK_QUEUE.sent.length, 1);
  assert.equal(env.DB.webhooks.get("event-1").attempts, 0);
});

test("Square webhook rejects a signature made for altered bytes", async () => {
  const env = baseEnv();
  const response = await handleRequest(
    new Request(env.SQUARE_WEBHOOK_NOTIFICATION_URL, {
      method: "POST",
      headers: { "x-square-hmacsha256-signature": "not-valid" },
      body: '{"event_id":"event-1","type":"order.updated"}',
    }),
    env,
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "INVALID_WEBHOOK_SIGNATURE");
  assert.equal(env.DB.webhooks.size, 0);
});

test("a queue-send failure returns retryable response and Square retry enqueues the stored event", async () => {
  const env = baseEnv();
  env.WEBHOOK_QUEUE.send = async () => { throw new Error("queue unavailable"); };
  const rawBody = JSON.stringify({
    event_id: "event-retry",
    type: "payment.updated",
    data: { object: { payment: { id: "payment-1" } } },
  });
  const signature = await hmacSha256Base64(
    env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    `${env.SQUARE_WEBHOOK_NOTIFICATION_URL}${rawBody}`,
  );
  const makeRequest = () =>
    new Request(env.SQUARE_WEBHOOK_NOTIFICATION_URL, {
      method: "POST",
      headers: { "x-square-hmacsha256-signature": signature },
      body: rawBody,
    });
  assert.equal((await handleRequest(makeRequest(), env)).status, 503);
  assert.equal(env.DB.webhooks.get("event-retry").status, "RECEIVED");
  env.WEBHOOK_QUEUE.send = async function send(message) { this.sent.push(message); };
  assert.equal((await handleRequest(makeRequest(), env)).status, 200);
  assert.equal(env.DB.webhooks.get("event-retry").status, "QUEUED");
  assert.equal(env.WEBHOOK_QUEUE.sent.length, 1);
});

test("a concurrent webhook delivery does not enqueue a leased event again", async () => {
  const env = baseEnv();
  const rawBody = JSON.stringify({ event_id: "event-processing", type: "order.updated" });
  const payloadHash = await sha256Hex(rawBody);
  env.DB.webhooks.set("event-processing", {
    event_id: "event-processing",
    event_type: "order.updated",
    payload_sha256: payloadHash,
    status: "PROCESSING",
    attempts: 1,
    processing_started_at: Math.floor(Date.now() / 1000),
  });
  const signature = await hmacSha256Base64(
    env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    `${env.SQUARE_WEBHOOK_NOTIFICATION_URL}${rawBody}`,
  );
  const response = await handleRequest(
    new Request(env.SQUARE_WEBHOOK_NOTIFICATION_URL, {
      method: "POST",
      headers: { "x-square-hmacsha256-signature": signature },
      body: rawBody,
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, duplicate: true, queued: true });
  assert.equal(env.WEBHOOK_QUEUE.sent.length, 0);
  assert.equal(env.DB.webhooks.get("event-processing").attempts, 1);
});

test("webhook ingress leaves stale processing lease recovery to the queue consumer", async () => {
  const env = baseEnv();
  const rawBody = JSON.stringify({ event_id: "event-stale", type: "order.updated" });
  const payloadHash = await sha256Hex(rawBody);
  env.DB.webhooks.set("event-stale", {
    event_id: "event-stale",
    event_type: "order.updated",
    payload_sha256: payloadHash,
    status: "PROCESSING",
    attempts: 1,
    processing_started_at: Math.floor(Date.now() / 1000) - 121,
  });
  const signature = await hmacSha256Base64(
    env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    `${env.SQUARE_WEBHOOK_NOTIFICATION_URL}${rawBody}`,
  );
  const response = await handleRequest(
    new Request(env.SQUARE_WEBHOOK_NOTIFICATION_URL, {
      method: "POST",
      headers: { "x-square-hmacsha256-signature": signature },
      body: rawBody,
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, duplicate: true, queued: true });
  assert.equal(env.DB.webhooks.get("event-stale").status, "PROCESSING");
  assert.equal(env.WEBHOOK_QUEUE.sent.length, 0);
});

test("queue consumer claims, processes, and acknowledges a stored event", async () => {
  const env = baseEnv();
  const payloadHash = "a".repeat(64);
  env.DB.webhooks.set("queued-order", {
    event_id: "queued-order",
    event_type: "order.updated",
    object_id: "order-1",
    payment_id: null,
    payload_sha256: payloadHash,
    status: "QUEUED",
    attempts: 0,
    received_at: 1000,
    processing_started_at: null,
    processing_token: null,
  });
  const actions = [];
  const message = {
    body: { eventId: "queued-order", payloadHash },
    attempts: 1,
    ack() { actions.push("ack"); },
    retry(options) { actions.push(["retry", options]); },
  };
  assert.deepEqual(await processQueueMessage(message, env), { state: "PROCESSED" });
  assert.deepEqual(actions, ["ack"]);
  assert.equal(env.DB.webhooks.get("queued-order").status, "PROCESSED");
});

test("webhook fencing rejects stale finish and fail after lease reclaim", async () => {
  const db = new FakeD1();
  const event = {
    id: "fenced-event",
    type: "order.updated",
    payloadHash: "hash-1",
    createdAt: null,
    now: 1000,
    claimToken: "claim-old",
  };
  assert.equal((await claimWebhookEvent(db, event)).state, "NEW");
  assert.equal(
    (
      await claimWebhookEvent(db, {
        ...event,
        now: 1121,
        claimToken: "claim-new",
      })
    ).state,
    "RETRY",
  );
  assert.equal(await finishWebhookEvent(db, event.id, "claim-old", 1122), false);
  assert.equal(await failWebhookEvent(db, event.id, "claim-old", "STALE"), false);
  assert.equal(await finishWebhookEvent(db, event.id, "claim-new", 1122), true);
  assert.equal(db.webhooks.get(event.id).status, "PROCESSED");
});

test("a lost webhook claim stops fulfillment before downstream side effects", async () => {
  let squareFetches = 0;
  const env = baseEnv({
    __testFetch: async () => {
      squareFetches += 1;
      return Response.json({
        payment: {
          id: "payment-1",
          status: "COMPLETED",
          order_id: "order-1",
        },
      });
    },
  });
  await assert.rejects(
    () => processSquareEvent(
      env,
      {
        event_id: "payment-event-1",
        type: "payment.updated",
        data: { object: { payment: { id: "payment-1" } } },
      },
      1000,
      async () => {
        throw new Error("WEBHOOK_CLAIM_LOST");
      },
    ),
    /WEBHOOK_CLAIM_LOST/u,
  );
  assert.equal(squareFetches, 1);
  assert.equal(env.DB.fulfillments.size, 0);
});

test("completed eligible EPUB payment creates one active token and one idempotent email", async () => {
  let resendKey = null;
  let emailedUrl = null;
  const env = baseEnv({
    EPUB_ENABLED_SKUS: "OIP-AN-EPUB",
    EMAIL_HASH_PEPPER: "test-email-pepper",
    __testFetch: async (url, options = {}) => {
      if (url.endsWith("/v2/payments/payment-1")) {
        return Response.json({
          payment: {
            id: "payment-1",
            status: "COMPLETED",
            order_id: "order-1",
            location_id: "location-1",
            amount_money: { amount: 999, currency: "USD" },
            refunded_money: { amount: 0, currency: "USD" },
            billing_address: { country: "US" },
            buyer_email_address: "Reader@Example.com",
          },
        });
      }
      if (url.endsWith("/v2/orders/order-1")) {
        return Response.json({
          order: {
            id: "order-1",
            location_id: "location-1",
            total_money: { amount: 999, currency: "USD" },
            line_items: [{
              catalog_object_id: "variation-1",
              quantity: "1",
              base_price_money: { amount: 999, currency: "USD" },
              total_discount_money: { amount: 0, currency: "USD" },
              total_tax_money: { amount: 0, currency: "USD" },
              total_money: { amount: 999, currency: "USD" },
            }],
          },
        });
      }
      if (url.includes("/v2/catalog/object/variation-1")) {
        return Response.json({
          object: { type: "ITEM_VARIATION", item_variation_data: { sku: "OIP-AN-EPUB" } },
        });
      }
      if (url === "https://api.resend.com/emails") {
        resendKey = options.headers["idempotency-key"];
        const body = JSON.parse(options.body);
        emailedUrl = body.text.split("\n").find((line) => line.startsWith("https://downloads."));
        return Response.json({ id: "email-1" });
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });
  await processSquareEvent(
    env,
    {
      event_id: "payment-event-1",
      type: "payment.updated",
      data: { object: { payment: { id: "payment-1" } } },
    },
    1000,
  );
  assert.equal(env.DB.fulfillments.size, 1);
  const row = [...env.DB.fulfillments.values()][0];
  assert.equal(row.status, "ACTIVE");
  assert.equal(row.expires_at, 1000 + 14 * 24 * 60 * 60);
  assert.equal(row.max_downloads, 5);
  assert.equal(row.email_delivery_status, "SENT");
  assert.equal(row.email_message_id, "email-1");
  assert.equal(row.buyer_email_sha256, await sha256Hex("test-email-pepper:reader@example.com"));
  assert.equal(resendKey, `oip-email-${row.fulfillment_id}-g1`);
  assert.match(emailedUrl, /^https:\/\/downloads\.outsideinprint\.org\/download\/[A-Za-z0-9_-]{43}$/u);
  assert.equal(row.token_sha256, await sha256Hex(emailedUrl.split("/").at(-1)));
});

test("completed $9.99 Parable EPUB payment creates its fulfillment", async () => {
  const env = baseEnv({
    EPUB_ENABLED_SKUS: "OIP-PS-EPUB",
    EMAIL_HASH_PEPPER: "test-email-pepper",
    __testFetch: async (url) => {
      if (url.endsWith("/v2/payments/payment-ps")) {
        return Response.json({
          payment: {
            id: "payment-ps",
            status: "COMPLETED",
            order_id: "order-ps",
            location_id: "location-1",
            amount_money: { amount: 999, currency: "USD" },
            refunded_money: { amount: 0, currency: "USD" },
            billing_address: { country: "US" },
            buyer_email_address: "reader@example.com",
          },
        });
      }
      if (url.endsWith("/v2/orders/order-ps")) {
        return Response.json({
          order: {
            id: "order-ps",
            location_id: "location-1",
            total_money: { amount: 999, currency: "USD" },
            line_items: [{
              catalog_object_id: "variation-ps",
              quantity: "1",
              base_price_money: { amount: 999, currency: "USD" },
              total_discount_money: { amount: 0, currency: "USD" },
              total_tax_money: { amount: 0, currency: "USD" },
              total_money: { amount: 999, currency: "USD" },
            }],
          },
        });
      }
      if (url.includes("/v2/catalog/object/variation-ps")) {
        return Response.json({
          object: { type: "ITEM_VARIATION", item_variation_data: { sku: "OIP-PS-EPUB" } },
        });
      }
      if (url === "https://api.resend.com/emails") {
        return Response.json({ id: "email-ps" });
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });
  await processSquareEvent(
    env,
    {
      event_id: "payment-event-ps",
      type: "payment.updated",
      data: { object: { payment: { id: "payment-ps" } } },
    },
    1000,
  );
  assert.equal(env.DB.fulfillments.size, 1);
  const row = [...env.DB.fulfillments.values()][0];
  assert.equal(row.sku, "OIP-PS-EPUB");
  assert.equal(row.status, "ACTIVE");
  assert.equal(row.email_delivery_status, "SENT");
});

test("EPUB eligibility requires enabled SKU, exact price, no tax, US proof, and matching total", async () => {
  const payment = {
    id: "payment-1",
    order_id: "order-1",
    location_id: "location-1",
    status: "COMPLETED",
    amount_money: { amount: 999, currency: "USD" },
    refunded_money: { amount: 0, currency: "USD" },
    billing_address: { country: "US" },
    buyer_email_address: "reader@example.com",
  };
  const order = {
    id: "order-1",
    location_id: "location-1",
    total_money: { amount: 999, currency: "USD" },
    line_items: [
      {
        catalog_object_id: "variation-1",
        quantity: "1",
        base_price_money: { amount: 999, currency: "USD" },
        total_money: { amount: 999, currency: "USD" },
        total_tax_money: { amount: 0, currency: "USD" },
        total_discount_money: { amount: 0, currency: "USD" },
      },
    ],
  };
  const eligible = await evaluateEpubOrder({
    payment,
    order,
    resolveSku: async () => "OIP-AN-EPUB",
    enabledSkus: new Set(["OIP-AN-EPUB"]),
    requireUsCountryProof: true,
    expectedLocationId: "location-1",
  });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.items[0].sku, "OIP-AN-EPUB");

  const wrongConfiguredVariation = await evaluateEpubOrder({
    payment,
    order,
    resolveSku: async () => "OIP-AN-EPUB",
    enabledSkus: new Set(["OIP-AN-EPUB"]),
    expectedCatalogVariationId: () => "variation-other",
    requireUsCountryProof: true,
    expectedLocationId: "location-1",
  });
  assert.equal(wrongConfiguredVariation.reasonCode, "EPUB_CATALOG_VARIATION_MISMATCH");

  const wrongPaymentLocation = structuredClone(payment);
  wrongPaymentLocation.location_id = "other-location";
  assert.equal(
    (
      await evaluateEpubOrder({
        payment: wrongPaymentLocation,
        order,
        resolveSku: async () => "OIP-AN-EPUB",
        enabledSkus: new Set(["OIP-AN-EPUB"]),
        requireUsCountryProof: true,
        expectedLocationId: "location-1",
      })
    ).reasonCode,
    "PAYMENT_LOCATION_MISMATCH",
  );
  const wrongOrderLocation = structuredClone(order);
  wrongOrderLocation.location_id = "other-location";
  assert.equal(
    (
      await evaluateEpubOrder({
        payment,
        order: wrongOrderLocation,
        resolveSku: async () => "OIP-AN-EPUB",
        enabledSkus: new Set(["OIP-AN-EPUB"]),
        requireUsCountryProof: true,
        expectedLocationId: "location-1",
      })
    ).reasonCode,
    "ORDER_LOCATION_MISMATCH",
  );

  const taxed = structuredClone(order);
  taxed.line_items[0].total_tax_money.amount = 75;
  assert.equal(
    (
      await evaluateEpubOrder({
        payment,
        order: taxed,
        resolveSku: async () => "OIP-AN-EPUB",
        enabledSkus: new Set(["OIP-AN-EPUB"]),
        requireUsCountryProof: true,
        expectedLocationId: "location-1",
      })
    ).reasonCode,
    "EPUB_TAX_UNEXPECTED",
  );

  assert.equal(
    (
      await evaluateEpubOrder({
        payment,
        order,
        resolveSku: async () => "OIP-AN-EPUB",
        enabledSkus: new Set(),
        requireUsCountryProof: true,
        expectedLocationId: "location-1",
      })
    ).reasonCode,
    "EPUB_GATE_CLOSED",
  );

  const duplicate = structuredClone(order);
  duplicate.line_items.push(structuredClone(duplicate.line_items[0]));
  duplicate.total_money.amount = 1998;
  const duplicatePayment = structuredClone(payment);
  duplicatePayment.amount_money.amount = 1998;
  assert.equal(
    (
      await evaluateEpubOrder({
        payment: duplicatePayment,
        order: duplicate,
        resolveSku: async () => "OIP-AN-EPUB",
        enabledSkus: new Set(["OIP-AN-EPUB"]),
        requireUsCountryProof: true,
        expectedLocationId: "location-1",
      })
    ).reasonCode,
    "EPUB_DUPLICATE_SKU",
  );

  const partiallyRefunded = structuredClone(payment);
  partiallyRefunded.refunded_money.amount = 100;
  assert.equal(hasAnyRefund(partiallyRefunded), true);
  assert.equal(
    (
      await evaluateEpubOrder({
        payment: partiallyRefunded,
        order,
        resolveSku: async () => "OIP-AN-EPUB",
        enabledSkus: new Set(["OIP-AN-EPUB"]),
        requireUsCountryProof: true,
        expectedLocationId: "location-1",
      })
    ).reasonCode,
    "PAYMENT_HAS_REFUND",
  );
});

test("any completed partial refund conservatively revokes all payment downloads", async () => {
  const env = baseEnv({
    __testFetch: async (url) => {
      assert.match(url, /\/v2\/payments\/payment-1$/u);
      return Response.json({
        payment: {
          id: "payment-1",
          order_id: "order-1",
          amount_money: { amount: 999, currency: "USD" },
          refunded_money: { amount: 100, currency: "USD" },
        },
      });
    },
  });
  env.DB.fulfillments.set("fulfillment-1", {
    fulfillment_id: "fulfillment-1",
    payment_id: "payment-1",
    order_id: "order-1",
    sku: "OIP-AN-EPUB",
    status: "ACTIVE",
  });
  await processSquareEvent(
    env,
    {
      event_id: "refund-event-1",
      type: "refund.updated",
      data: { object: { refund: { id: "refund-1", payment_id: "payment-1", status: "COMPLETED" } } },
    },
    1000,
  );
  assert.equal(env.DB.fulfillments.get("fulfillment-1").status, "REVOKED");
  assert.equal(env.DB.reviews[0].reason_code, "PARTIAL_REFUND_ALL_DOWNLOADS_REVOKED");
});

test("refund before payment webhook binds and holds a physical order without stranding inventory", async () => {
  const requestKey = "physical-refund-first";
  const env = baseEnv({
    __testFetch: async (url) => {
      assert.match(url, /\/v2\/payments\/physical-refund-payment$/u);
      return Response.json({
        payment: {
          id: "physical-refund-payment",
          order_id: "physical-refund-order",
          amount_money: { amount: 2255, currency: "USD" },
          refunded_money: { amount: 2255, currency: "USD" },
        },
      });
    },
  });
  env.DB.physicalCheckouts.set(requestKey, {
    request_key: requestKey,
    square_payment_link_id: "physical-refund-link",
    square_order_id: "physical-refund-order",
    square_payment_id: null,
    items_json: JSON.stringify([{
      sku: "OIP-AN-PB", catalog_object_id: "variation-an-pb", quantity: 1,
    }]),
    status: "LINK_CREATED",
  });
  seedPhysicalReservation(env, requestKey);
  await processSquareEvent(env, {
    event_id: "physical-refund-first-event",
    type: "refund.updated",
    data: { object: { refund: {
      id: "physical-refund-1", payment_id: "physical-refund-payment", status: "COMPLETED",
    } } },
  }, 1000);
  const binding = env.DB.physicalCheckouts.get(requestKey);
  assert.equal(binding.square_payment_id, "physical-refund-payment");
  assert.equal(binding.status, "REFUNDED");
  assert.equal(env.DB.inventoryReservations.get(`${requestKey}:OIP-AN-PB`).status, "PAID_PENDING");
  let laterFetches = 0;
  env.__testFetch = async () => { laterFetches += 1; throw new Error("blocked payment must not be retrieved"); };
  await processSquareEvent(env, {
    event_id: "physical-payment-after-refund",
    type: "payment.updated",
    data: { object: { payment: { id: "physical-refund-payment" } } },
  }, 1001);
  assert.equal(laterFetches, 0);
  assert.equal(binding.status, "REFUNDED");
});

test("a later refund cannot regress a disputed physical order or replace dispute evidence", async () => {
  const requestKey = "physical-dispute-first";
  const paymentId = "physical-dispute-payment";
  const orderId = "physical-dispute-order";
  const env = baseEnv({
    __testFetch: async (url) => {
      assert.match(url, /\/v2\/payments\/physical-dispute-payment$/u);
      return Response.json({
        payment: {
          id: paymentId,
          order_id: orderId,
          amount_money: { amount: 2255, currency: "USD" },
          refunded_money: { amount: 2255, currency: "USD" },
        },
      });
    },
  });
  env.DB.physicalCheckouts.set(requestKey, {
    request_key: requestKey,
    square_payment_link_id: "physical-dispute-link",
    square_order_id: orderId,
    square_payment_id: null,
    items_json: JSON.stringify([{
      sku: "OIP-AN-PB", catalog_object_id: "variation-an-pb", quantity: 1,
    }]),
    status: "LINK_CREATED",
    hold_reason: null,
    updated_at: 900,
  });
  seedPhysicalReservation(env, requestKey);
  await processSquareEvent(env, {
    event_id: "physical-dispute-first-event",
    type: "dispute.created",
    data: { object: { dispute: {
      id: "physical-dispute-1",
      state: "EVIDENCE_REQUIRED",
      disputed_payment: { payment_id: paymentId },
    } } },
  }, 1000);
  const binding = env.DB.physicalCheckouts.get(requestKey);
  assert.equal(binding.square_payment_id, paymentId);
  assert.equal(binding.status, "DISPUTED");
  assert.equal(binding.hold_reason, "DISPUTE");
  assert.equal(binding.updated_at, 1000);
  assert.equal(env.DB.paymentBlocks.get(paymentId).event_id, "physical-dispute-first-event");

  await processSquareEvent(env, {
    event_id: "physical-refund-after-dispute-event",
    type: "refund.updated",
    data: { object: { refund: {
      id: "physical-refund-after-dispute", payment_id: paymentId, status: "COMPLETED",
    } } },
  }, 1100);
  assert.equal(binding.status, "DISPUTED");
  assert.equal(binding.hold_reason, "DISPUTE");
  assert.equal(binding.updated_at, 1000);
  assert.equal(await isPaymentBlocked(env.DB, paymentId), "DISPUTE");
  assert.equal(env.DB.paymentBlocks.get(paymentId).event_id, "physical-dispute-first-event");
  assert.equal(env.DB.inventoryReservations.get(`${requestKey}:OIP-AN-PB`).status, "PAID_PENDING");
  assert.equal(await markPhysicalPaymentEvent(env.DB, {
    paymentId,
    status: "REFUNDED",
    reasonCode: "REFUND",
    now: 1200,
  }), 1);
  assert.equal(binding.status, "DISPUTED");
  assert.equal(binding.hold_reason, "DISPUTE");
  assert.equal(binding.updated_at, 1000);
});

test("a payment dispute immediately revokes active downloads", async () => {
  const env = baseEnv({
    __testFetch: async (url) => {
      assert.match(url, /\/v2\/payments\/payment-1$/u);
      return Response.json({ payment: { id: "payment-1", order_id: "order-1" } });
    },
  });
  env.DB.fulfillments.set("fulfillment-1", {
    fulfillment_id: "fulfillment-1",
    payment_id: "payment-1",
    order_id: "order-1",
    sku: "OIP-AN-EPUB",
    status: "ACTIVE",
  });
  await processSquareEvent(
    env,
    {
      event_id: "dispute-event-1",
      type: "dispute.created",
      data: {
        object: {
          dispute: {
            id: "dispute-1",
            state: "EVIDENCE_REQUIRED",
            disputed_payment: { payment_id: "payment-1" },
          },
        },
      },
    },
    1000,
  );
  assert.equal(env.DB.fulfillments.get("fulfillment-1").status, "REVOKED");
  assert.equal(env.DB.reviews[0].reason_code, "PAYMENT_DISPUTE_DOWNLOADS_REVOKED");
  assert.equal(await isPaymentBlocked(env.DB, "payment-1"), "DISPUTE");
  let squareFetches = 0;
  env.__testFetch = async () => {
    squareFetches += 1;
    throw new Error("blocked payment must not be retrieved");
  };
  await processSquareEvent(
    env,
    {
      event_id: "payment-event-after-dispute",
      type: "payment.updated",
      data: { object: { payment: { id: "payment-1" } } },
    },
    1001,
  );
  assert.equal(squareFetches, 0);
  assert.equal(env.DB.reviews[1].reason_code, "PAYMENT_BLOCKED_BEFORE_FULFILLMENT");
});

test("admin resend attempt keeps the current token and retries with one stable sequence", async () => {
  const db = new FakeD1();
  const rawToken = await deriveDownloadToken("secret", "fulfillment-1", 1);
  const tokenHash = await sha256Hex(rawToken);
  db.fulfillments.set("fulfillment-1", {
    fulfillment_id: "fulfillment-1",
    status: "ACTIVE",
    token_generation: 1,
    token_sha256: tokenHash,
    resend_sequence: 0,
    resend_status: null,
    expires_at: 100,
    download_count: 5,
  });
  const first = await claimResendAttempt(db, {
    fulfillmentId: "fulfillment-1",
    claimToken: "claim-1",
    now: 1000,
  });
  assert.equal(first.resend_sequence, 1);
  assert.equal(first.token_sha256, tokenHash);
  assert.equal(await releaseResendAttempt(db, {
    fulfillmentId: "fulfillment-1",
    sequence: 1,
    claimToken: "claim-1",
  }), true);
  const retry = await claimResendAttempt(db, {
    fulfillmentId: "fulfillment-1",
    claimToken: "claim-2",
    now: 1001,
  });
  assert.equal(retry.resend_sequence, 1);
  assert.equal(retry.token_sha256, tokenHash);
  assert.equal(await finishResendAttempt(db, {
    fulfillmentId: "fulfillment-1",
    sequence: 1,
    claimToken: "claim-2",
    status: "SENT",
    expiresAt: 2000,
    now: 1001,
    messageId: "email-1",
  }), true);
  const row = db.fulfillments.get("fulfillment-1");
  assert.equal(row.token_sha256, tokenHash);
  assert.equal(row.download_count, 0);
  assert.equal(row.expires_at, 2000);
});

test("admin resend cannot reissue a payment blocked by refund or dispute", async () => {
  const issuer = "https://oip-resend-test.cloudflareaccess.com";
  const audience = "access-audience-resend";
  const kid = "access-key-resend";
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signedAccessJwt({
    privateKey: keys.privateKey,
    kid,
    issuer,
    audience,
    email: "owner@example.com",
    expiresAt: now + 300,
  });
  let outboundCalls = 0;
  const env = baseEnv({
    ADMIN_EMAILS: "owner@example.com",
    CF_ACCESS_ISSUER: issuer,
    CF_ACCESS_AUD: audience,
    __testFetch: async (url) => {
      outboundCalls += 1;
      assert.equal(url, `${issuer}/cdn-cgi/access/certs`);
      return Response.json({ keys: [publicJwk] });
    },
  });
  env.DB.fulfillments.set("fulfillment-1", {
    fulfillment_id: "fulfillment-1",
    payment_id: "payment-1",
    order_id: "order-1",
    sku: "OIP-AN-EPUB",
    status: "ACTIVE",
    token_generation: 1,
    token_sha256: "token-hash",
    resend_sequence: 0,
    resend_status: null,
  });
  env.DB.paymentBlocks.set("payment-1", {
    payment_id: "payment-1",
    reason_code: "REFUND",
    event_id: "refund-event-1",
    created_at: 1000,
  });
  const request = new Request("https://downloads.outsideinprint.org/admin/resend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-access-authenticated-user-email": "owner@example.com",
      "cf-access-jwt-assertion": jwt,
    },
    body: JSON.stringify({ order_id: "order-1" }),
  });
  const response = await handleRequest(request, env);
  assert.equal(response.status, 207);
  assert.deepEqual(await response.json(), { order_id: "order-1", sent: 0, failed: 1 });
  assert.equal(outboundCalls, 1);
});

test("older subscription webhooks cannot regress a newer state", async () => {
  const env = baseEnv();
  await processSquareEvent(
    env,
    {
      event_id: "subscription-event-2",
      type: "subscription.updated",
      data: {
        object: {
          subscription: {
            id: "subscription-1",
            status: "CANCELED",
            plan_variation_id: "plan-1",
            version: 2,
          },
        },
      },
    },
    2000,
  );
  await processSquareEvent(
    env,
    {
      event_id: "subscription-event-1",
      type: "subscription.updated",
      data: {
        object: {
          subscription: {
            id: "subscription-1",
            status: "ACTIVE",
            plan_variation_id: "plan-1",
            version: 1,
          },
        },
      },
    },
    2001,
  );
  const row = env.DB.subscriptions.get("subscription-1");
  assert.equal(row.status, "CANCELED");
  assert.equal(row.square_version, 2);
});

test("a failed renewal payment creates no fulfillment or subscription state", async () => {
  const env = baseEnv({
    __testFetch: async (url) => {
      assert.match(url, /\/v2\/payments\/failed-renewal-payment$/u);
      return Response.json({
        payment: {
          id: "failed-renewal-payment",
          status: "FAILED",
          order_id: "failed-renewal-order",
          amount_money: { amount: 500, currency: "USD" },
        },
      });
    },
  });
  await processSquareEvent(env, {
    event_id: "failed-renewal-event",
    type: "payment.updated",
    data: { object: { payment: { id: "failed-renewal-payment" } } },
  }, 3000);
  assert.equal(env.DB.fulfillments.size, 0);
  assert.equal(env.DB.subscriptions.size, 0);
  assert.equal(env.DB.reviews.length, 0);
});

test("download token is private, counted atomically, and stops at its limit", async () => {
  const token = "A".repeat(43);
  const tokenHash = await sha256Hex(token);
  const env = baseEnv({
    EPUB_BUCKET: { get: async (key) => (key === "epubs/oip-an.epub" ? { body: "EPUB-DATA" } : null) },
  });
  env.DB.fulfillments.set("fulfillment-1", {
    fulfillment_id: "fulfillment-1",
    payment_id: "payment-1",
    order_id: "order-1",
    sku: "OIP-AN-EPUB",
    status: "ACTIVE",
    token_sha256: tokenHash,
    expires_at: Math.floor(Date.now() / 1000) + 100,
    download_count: 0,
    max_downloads: 1,
  });
  const first = await handleRequest(new Request(`https://downloads.outsideinprint.org/download/${token}`), env);
  assert.equal(first.status, 200);
  assert.equal(await first.text(), "EPUB-DATA");
  assert.equal(first.headers.get("cache-control"), "private, no-store, max-age=0");
  const second = await handleRequest(new Request(`https://downloads.outsideinprint.org/download/${token}`), env);
  assert.equal(second.status, 404);
  assert.equal(env.DB.fulfillments.get("fulfillment-1").download_count, 1);

  const expiredToken = "B".repeat(43);
  env.DB.fulfillments.set("fulfillment-expired", {
    fulfillment_id: "fulfillment-expired",
    payment_id: "payment-expired",
    order_id: "order-expired",
    sku: "OIP-AN-EPUB",
    status: "ACTIVE",
    token_sha256: await sha256Hex(expiredToken),
    expires_at: Math.floor(Date.now() / 1000) - 1,
    download_count: 0,
    max_downloads: 5,
  });
  const expired = await handleRequest(
    new Request(`https://downloads.outsideinprint.org/download/${expiredToken}`),
    env,
  );
  assert.equal(expired.status, 404);
  assert.equal(env.DB.fulfillments.get("fulfillment-expired").download_count, 0);
});

test("admin resend does not trust a bare asserted email header", async () => {
  const env = baseEnv({ ADMIN_EMAILS: "owner@example.com" });
  const response = await handleRequest(
    new Request("https://downloads.outsideinprint.org/admin/resend", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-access-authenticated-user-email": "owner@example.com",
      },
      body: JSON.stringify({ order_id: "order-1" }),
    }),
    env,
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "ADMIN_ACCESS_REQUIRED");
});

test("Cloudflare Access admin validation verifies signed issuer, audience, expiry, and email", async () => {
  const issuer = "https://oip-test.cloudflareaccess.com";
  const audience = "access-audience-1";
  const kid = "access-key-1";
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signedAccessJwt({
    privateKey: keys.privateKey,
    kid,
    issuer,
    audience,
    email: "owner@example.com",
    expiresAt: now + 300,
  });
  const env = {
    ADMIN_EMAILS: "owner@example.com",
    CF_ACCESS_ISSUER: issuer,
    CF_ACCESS_AUD: audience,
    __testFetch: async (url) => {
      assert.equal(url, `${issuer}/cdn-cgi/access/certs`);
      return Response.json({ keys: [publicJwk] });
    },
  };
  const request = new Request("https://downloads.outsideinprint.org/admin/resend", {
    headers: {
      "cf-access-authenticated-user-email": "owner@example.com",
      "cf-access-jwt-assertion": jwt,
    },
  });
  assert.deepEqual(await requireCloudflareAccessAdmin(request, env, now), { email: "owner@example.com" });
  await assert.rejects(
    () => requireCloudflareAccessAdmin(request, { ...env, CF_ACCESS_AUD: "wrong-audience" }, now),
    (error) => error.code === "ADMIN_ACCESS_REQUIRED",
  );
});
