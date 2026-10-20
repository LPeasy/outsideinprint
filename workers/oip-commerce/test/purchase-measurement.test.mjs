import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { productForSku } from '../src/catalog.js';
import { processSquareEvent } from '../src/fulfillment.js';
import { handleRequest } from '../src/index.js';
import { normalizePurchaseMeasurement, preparePurchaseMeasurement,
  bindPurchaseMeasurement, maybeEmitVerifiedPurchase, scrubExpiredPurchaseMeasurement } from '../src/purchase-measurement.js';

// No provider can be contacted by these tests. All outbound paths use this
// process-wide tripwire or an explicit, enumerated synthetic responder.
globalThis.fetch = async () => { throw new Error('NETWORK_FORBIDDEN_IN_TEST'); };

class SqliteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
      this.sqlite.exec(readFileSync(new URL(file, directory), 'utf8'));
    }
  }
  prepare(sql) {
    const statement = this.sqlite.prepare(sql);
    return { bind(...args) {
      return {
        async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; },
        async first() { return statement.get(...args) || null; },
        async all() { return { results: statement.all(...args) }; },
      };
    } };
  }
  row(table) { return this.sqlite.prepare(`SELECT * FROM ${table}`).get(); }
  count(table) { return this.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count; }
}

const NOW = 1802851200;
function measurement(now = NOW) {
  return { version: 1, consent: 'granted', client_id: '123456789.1234567890',
    session_id: String(now - 60), captured_at: now };
}
function env(overrides = {}) {
  return {
    DB: new SqliteD1(), GA4_PURCHASE_MODE: 'live', GA4_MEASUREMENT_ID: 'G-TEST000001',
    GA4_API_SECRET: 'synthetic_ga_secret', GA4_PURCHASE_LIVE_AFTER: String(NOW - 120),
    GA4_MERCHANT_ITEM_IDS: '{"OIP-AN-EPUB":"merchant-An-Example"}',
    SQUARE_API_BASE_URL: 'https://connect.squareup.com', PUBLIC_HOST: 'downloads.outsideinprint.org',
    DOWNLOAD_BASE_URL: 'https://downloads.outsideinprint.org', OPERATIONAL_ENVIRONMENT: 'PRODUCTION',
    __testFetch: async () => { throw new Error('Unexpected synthetic request'); }, ...overrides,
  };
}
async function seed(environment, context = measurement(), now = NOW) {
  await preparePurchaseMeasurement(environment, { requestKey: 'request-1', created: true,
    sku: 'OIP-AN-EPUB', measurement: context, now });
  await bindPurchaseMeasurement(environment, 'request-1', 'order-1');
}
function purchase(now = NOW) {
  const money = { amount: 999, currency: 'USD' };
  return {
    payment: { id: 'payment-1', order_id: 'order-1', status: 'COMPLETED',
      location_id: 'location-1', amount_money: money, buyer_email_address: 'reader@example.test',
      billing_address: { country: 'US' },
      card_details: { status: 'CAPTURED', card_payment_timeline: {
        captured_at: new Date((now + 10) * 1000).toISOString(),
      } },
      created_at: new Date(now * 1000).toISOString(),
      updated_at: new Date((now + 9000) * 1000).toISOString() },
    order: { id: 'order-1', location_id: 'location-1', total_money: money,
      line_items: [{ catalog_object_id: 'variation-1', quantity: '1',
        base_price_money: money, total_money: money }] },
    evaluation: { eligible: true, items: [{ sku: 'OIP-AN-EPUB', product: productForSku('OIP-AN-EPUB') }] },
    now: now + 20,
  };
}

test('context requires explicit consent, exact fields, real numeric IDs and fresh session', () => {
  assert.deepEqual(normalizePurchaseMeasurement(measurement(), NOW), measurement());
  for (const invalid of [null, {}, { ...measurement(), consent: 'denied' },
    { ...measurement(), is_test: false }, { ...measurement(), client_id: 'reader@example.test' },
    { ...measurement(), merchant_item_id: 'browser-spoof' },
    { ...measurement(), session_id: '123e6' }, { ...measurement(), captured_at: NOW + 6 },
    { ...measurement(), captured_at: NOW - 1801 }, { ...measurement(), session_id: String(NOW - 86401) }]) {
    assert.equal(normalizePurchaseMeasurement(invalid, NOW), null);
  }
});

test('default/off mode uses no new schema or network', async () => {
  const environment = env({ GA4_PURCHASE_MODE: undefined,
    DB: { prepare() { throw new Error('No schema access allowed'); } } });
  assert.equal((await preparePurchaseMeasurement(environment,
    { requestKey: 'request-1', created: true, measurement: measurement(), now: NOW })).state, 'OFF');
  assert.equal((await maybeEmitVerifiedPurchase(environment, purchase())).state, 'OFF');
});

test('test/off/missing consent/malformed context/legacy orders stay excluded across later live changes', async () => {
  for (const variant of ['test', 'off', 'missing', 'invalid', 'legacy']) {
    let calls = 0;
    const environment = env({ __testFetch: async () => { calls++; return new Response(null, { status: 204 }); } });
    if (['test', 'off'].includes(variant)) environment.GA4_PURCHASE_MODE = variant;
    if (variant !== 'legacy') await seed(environment, variant === 'missing' ? null :
      variant === 'invalid' ? { ...measurement(), is_test: false } : measurement());
    environment.GA4_PURCHASE_MODE = 'live';
    await preparePurchaseMeasurement(environment, { requestKey: 'request-1', created: false,
      measurement: measurement(), now: NOW });
    await maybeEmitVerifiedPurchase(environment, purchase());
    assert.equal(calls, 0, variant);
  }
});

test('configuration guards exclude Sandbox, property drift, future cutoff and preactivation context', async () => {
  for (const change of [
    { SQUARE_API_BASE_URL: 'https://connect.squareupsandbox.com' },
    { OPERATIONAL_ENVIRONMENT: 'SANDBOX' },
    { DOWNLOAD_BASE_URL: 'https://preview.example.test' },
    { GA4_MEASUREMENT_ID: 'G-OTHER00001' },
    { GA4_PURCHASE_LIVE_AFTER: String(NOW + 100) },
    { GA4_API_SECRET: '' },
  ]) {
    let calls = 0;
    const environment = env({ __testFetch: async () => { calls++; return new Response(null, { status: 204 }); } });
    await seed(environment);
    Object.assign(environment, change);
    await maybeEmitVerifiedPurchase(environment, purchase());
    assert.equal(calls, 0, JSON.stringify(change));
  }
  const before = env({ GA4_PURCHASE_LIVE_AFTER: String(NOW + 1) });
  await seed(before);
  assert.equal(before.DB.row('purchase_measurement_checkouts').mode, 'excluded');
});

test('verified purchase emits one private opaque transaction with actual provider capture time', async () => {
  const requests = [];
  const environment = env({ __testFetch: async (url, options) => {
    requests.push({ url, options }); return new Response(null, { status: 204 });
  } });
  await seed(environment);
  const original = environment.DB.row('purchase_measurement_checkouts');
  const result = await maybeEmitVerifiedPurchase(environment, purchase());
  assert.equal(result.state, 'SENT_UNVERIFIED');
  assert.equal(requests.length, 1);
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(new URL(requests[0].url).origin, 'https://www.google-analytics.com');
  assert.equal(new URL(requests[0].url).pathname, '/mp/collect');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(payload.timestamp_micros, (NOW + 10) * 1000000);
  assert.deepEqual(payload.consent, { ad_user_data: 'DENIED', ad_personalization: 'DENIED' });
  assert.equal(payload.events[0].name, 'purchase');
  assert.equal(payload.events[0].params.value, 9.99);
  assert.equal(payload.events[0].params.transaction_id, original.transaction_id);
  assert.equal(payload.events[0].params.session_id, NOW - 60);
  assert.equal(payload.events[0].params.items[0].item_id, 'merchant-An-Example');
  assert.equal(/reader@|order-1|payment-1|email|download|srsltid|user_id/u.test(requests[0].options.body), false);
  assert.equal(environment.DB.row('purchase_measurement_checkouts').client_id, null);
  await maybeEmitVerifiedPurchase(environment, purchase());
  assert.equal(requests.length, 1);
});

test('exact Merchant ID including case or numeric text is bound from trusted checkout configuration', async () => {
  for (const itemId of ['merchant-An-Example', '12345678901234567890']) {
    const requests = [];
    const environment = env({
      GA4_MERCHANT_ITEM_IDS: JSON.stringify({ 'OIP-AN-EPUB': itemId }),
      __testFetch: async (_url, options) => {
        requests.push(JSON.parse(options.body)); return new Response(null, { status: 204 });
      },
    });
    await seed(environment);
    const binding = environment.DB.row('purchase_measurement_checkouts');
    assert.equal(binding.product_sku, 'OIP-AN-EPUB');
    assert.equal(binding.merchant_item_id, itemId);
    assert.equal((await maybeEmitVerifiedPurchase(environment, purchase())).state, 'SENT_UNVERIFIED');
    assert.equal(requests[0].events[0].params.items[0].item_id, itemId);
  }
});

test('missing or malformed Merchant mapping excludes measurement permanently without storing attribution', async () => {
  for (const mapping of [undefined, '', '{}', 'null', '[]', 'bad-json',
    '{"OIP-AN-EPUB":123}', '{"oip-an-epub":"merchant-An-Example"}',
    '{"OIP-AN-EPUB":"https://example.test/private"}',
    '{"OIP-AN-EPUB":"same-id","OIP-PS-EPUB":"same-id"}']) {
    let calls = 0;
    const environment = env({ GA4_MERCHANT_ITEM_IDS: mapping,
      __testFetch: async () => { calls++; return new Response(null, { status: 204 }); } });
    await seed(environment);
    const binding = environment.DB.row('purchase_measurement_checkouts');
    assert.equal(binding.mode, 'excluded');
    assert.equal(binding.client_id, null);
    assert.equal(binding.merchant_item_id, null);
    environment.GA4_MERCHANT_ITEM_IDS = '{"OIP-AN-EPUB":"late-id"}';
    await preparePurchaseMeasurement(environment, { requestKey: 'request-1', created: false,
      sku: 'OIP-AN-EPUB', measurement: measurement(), now: NOW });
    await maybeEmitVerifiedPurchase(environment, purchase());
    assert.equal(calls, 0);
    assert.equal(environment.DB.count('purchase_measurement_deliveries'), 0);
  }
});

test('changed or missing consumer mapping never replaces the checkout snapshot or reports against another item', async () => {
  for (const mapping of ['{"OIP-AN-EPUB":"merchant-an-example"}', '{}']) {
    let calls = 0;
    const environment = env({ __testFetch: async () => { calls++; return new Response(null, { status: 204 }); } });
    await seed(environment);
    environment.GA4_MERCHANT_ITEM_IDS = mapping;
    await preparePurchaseMeasurement(environment, { requestKey: 'request-1', created: false,
      sku: 'OIP-AN-EPUB', measurement: measurement(), now: NOW });
    await maybeEmitVerifiedPurchase(environment, purchase());
    assert.equal(environment.DB.row('purchase_measurement_checkouts').merchant_item_id, 'merchant-An-Example');
    assert.equal(calls, 0);
    assert.equal(environment.DB.count('purchase_measurement_deliveries'), 0);
  }
});

test('verified product must match the single SKU whose Merchant ID was snapshotted at checkout', async () => {
  for (const items of [
    [{ sku: 'OIP-PS-EPUB', product: productForSku('OIP-PS-EPUB') }],
    [{ sku: 'OIP-AN-EPUB', product: productForSku('OIP-AN-EPUB') },
      { sku: 'OIP-AN-EPUB', product: productForSku('OIP-AN-EPUB') }],
  ]) {
    let calls = 0;
    const environment = env({ __testFetch: async () => { calls++; return new Response(null, { status: 204 }); } });
    await seed(environment);
    const input = purchase();
    input.evaluation.items = items;
    input.payment.amount_money = input.order.total_money = { amount: 999 * items.length, currency: 'USD' };
    await maybeEmitVerifiedPurchase(environment, input);
    assert.equal(calls, 0);
  }
});

test('actual SQLite atomic claim prevents parallel duplicate deliveries', async () => {
  let calls = 0;
  const environment = env({ __testFetch: async () => { calls++; return new Response(null, { status: 204 }); } });
  await seed(environment);
  await Promise.all(Array.from({ length: 10 }, () => maybeEmitVerifiedPurchase(environment, purchase())));
  assert.equal(calls, 1);
  assert.equal(environment.DB.count('purchase_measurement_deliveries'), 1);
});

test('timeout, rejected HTTP, and interrupted attempt are terminal with no automatic retry', async () => {
  for (const outcome of ['throw', 400, 429, 503, 'interrupted']) {
    let calls = 0;
    const environment = env({ __testFetch: async () => {
      calls++;
      if (outcome === 'throw') throw new Error('synthetic timeout');
      return new Response(null, { status: Number(outcome) });
    } });
    await seed(environment);
    if (outcome === 'interrupted') {
      const row = environment.DB.row('purchase_measurement_checkouts');
      environment.DB.sqlite.prepare(`INSERT INTO purchase_measurement_deliveries
        (square_order_id, transaction_id, measurement_id, status, attempted_at) VALUES (?, ?, ?, ?, ?)`)
        .run('order-1', row.transaction_id, environment.GA4_MEASUREMENT_ID, 'ATTEMPTING', NOW);
    }
    await maybeEmitVerifiedPurchase(environment, purchase());
    await maybeEmitVerifiedPurchase(environment, purchase());
    assert.equal(calls, outcome === 'interrupted' ? 0 : 1);
    assert.equal(environment.DB.row('purchase_measurement_deliveries').status,
      outcome === 'interrupted' ? 'ATTEMPTING' : outcome === 'throw' ? 'UNKNOWN' : 'REJECTED');
  }
});

test('trusted registry suppresses a controlled production order before dispatch', async () => {
  let calls = 0;
  const environment = env({ __testFetch: async () => { calls++; return new Response(null, { status: 204 }); } });
  await seed(environment);
  environment.DB.sqlite.prepare('INSERT INTO purchase_measurement_exclusions VALUES (?, ?, ?)')
    .run('order-1', 'CONTROLLED_TEST', NOW);
  await maybeEmitVerifiedPurchase(environment, purchase());
  assert.equal(calls, 0);
  assert.equal(environment.DB.count('purchase_measurement_deliveries'), 0);
});

test('failure to finish an attempted delivery leaves an uncertain durable claim and never resends', async () => {
  let calls = 0;
  const environment = env({ __testFetch: async () => { calls++; return new Response(null, { status: 204 }); } });
  await seed(environment);
  const db = environment.DB;
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (sql.startsWith('UPDATE purchase_measurement_deliveries SET status')) throw new Error('synthetic finish failure');
    return prepare(sql);
  };
  assert.equal((await maybeEmitVerifiedPurchase(environment, purchase())).state, 'UNAVAILABLE_OR_UNKNOWN');
  assert.equal(db.row('purchase_measurement_deliveries').status, 'ATTEMPTING');
  await maybeEmitVerifiedPurchase(environment, purchase());
  assert.equal(calls, 1);
});

test('missing capture timeline, stale session, noncompleted or mismatched purchase never emit', async () => {
  const mutations = [
    (p) => { delete p.payment.card_details; },
    (p) => { p.payment.card_details.status = 'AUTHORIZED'; },
    (p) => { delete p.payment.card_details.card_payment_timeline.captured_at; },
    (p) => { p.payment.card_details.card_payment_timeline.captured_at = new Date((NOW + 1801) * 1000).toISOString(); p.now = NOW + 1810; },
    (p) => { p.now = NOW + 86401; },
    (p) => { p.payment.status = 'APPROVED'; },
    (p) => { p.payment.order_id = 'other-order'; },
    (p) => { p.payment.amount_money = { amount: 1, currency: 'USD' }; },
    (p) => { p.evaluation.eligible = false; },
    (p) => { p.payment.card_details.card_payment_timeline.captured_at = new Date((NOW - 100) * 1000).toISOString(); },
  ];
  for (const mutate of mutations) {
    let calls = 0;
    const environment = env({ __testFetch: async () => { calls++; return new Response(null, { status: 204 }); } });
    await seed(environment);
    const input = purchase(); mutate(input);
    await maybeEmitVerifiedPurchase(environment, input);
    assert.equal(calls, 0);
  }
});

test('same-session actual capture may dispatch later, within the 24 hour session attribution bound', async () => {
  const environment = env({ __testFetch: async () => new Response(null, { status: 204 }) });
  await seed(environment);
  const input = purchase(); input.now = NOW + 7200;
  assert.equal((await maybeEmitVerifiedPurchase(environment, input)).state, 'SENT_UNVERIFIED');
});

test('storage failures stay optional and cannot trigger transport', async () => {
  let calls = 0;
  const environment = env({ DB: { prepare() { throw new Error('synthetic database failure'); } },
    __testFetch: async () => { calls++; throw new Error('unexpected'); } });
  assert.equal((await preparePurchaseMeasurement(environment,
    { requestKey: 'request-1', created: true, measurement: measurement(), now: NOW })).state, 'UNAVAILABLE');
  assert.equal((await maybeEmitVerifiedPurchase(environment, purchase())).state, 'UNAVAILABLE_OR_UNKNOWN');
  assert.equal(calls, 0);
});

test('scheduled privacy cleanup removes expired identifiers and preserves transaction evidence', async () => {
  const environment = env();
  await seed(environment);
  const original = environment.DB.row('purchase_measurement_checkouts');
  assert.equal((await scrubExpiredPurchaseMeasurement(environment, NOW + 100)).scrubbed, 0);
  environment.GA4_PURCHASE_MODE = 'off';
  assert.equal((await scrubExpiredPurchaseMeasurement(environment, NOW + 86400)).scrubbed, 1);
  const scrubbed = environment.DB.row('purchase_measurement_checkouts');
  assert.equal(scrubbed.client_id, null);
  assert.equal(scrubbed.session_id, null);
  assert.equal(scrubbed.captured_at, null);
  assert.equal(scrubbed.transaction_id, original.transaction_id);
  assert.equal(scrubbed.square_order_id, original.square_order_id);
});

test('checkout binds trusted Square order and reporting cannot alter fulfillment retries', async (t) => {
  for (const [emailFailsInitially, missingMapping] of [[false, false], [true, false], [false, true]]) await t.test(
    missingMapping ? 'unmapped checkout and fulfillment succeed without Google' :
      emailFailsInitially ? 'email retry remains independent of an uncertain Google attempt' : 'email precedes Google and duplicate events do not resend', async () => {
  const now = Math.floor(Date.now() / 1000);
  const input = purchase(now);
  input.payment.card_details.card_payment_timeline.captured_at = new Date(now * 1000).toISOString();
  const calls = [];
  let emailAttempts = 0;
  const environment = env({
    ...(missingMapping ? { GA4_MERCHANT_ITEM_IDS: '{}' } : {}),
    GA4_PURCHASE_LIVE_AFTER: String(now - 120), EPUB_BUCKET: { get: async () => null },
    ALLOWED_ORIGINS: 'https://outsideinprint.org', ALLOW_LOCAL_ORIGINS: 'false',
    RATE_LIMIT_SALT: 'synthetic-rate-salt', SQUARE_API_VERSION: 'synthetic-version',
    SQUARE_ACCESS_TOKEN: 'synthetic-square-token', SQUARE_LOCATION_ID: 'location-1',
    SQUARE_EPUB_REDIRECT_URL: 'https://outsideinprint.org/shop/thanks/',
    SQUARE_EPUB_CATALOG_VARIATION_IDS: '{"OIP-AN-EPUB":"variation-1"}', EPUB_ENABLED_SKUS: 'OIP-AN-EPUB',
    REQUIRE_EPUB_US_COUNTRY_PROOF: 'true', DOWNLOAD_TOKEN_SECRET: 'synthetic-download-secret',
    EMAIL_HASH_PEPPER: 'synthetic-pepper', RESEND_API_KEY: 'synthetic-resend-key',
    DOWNLOAD_EMAIL_FROM: 'Outside In Print <downloads@outsideinprint.org>',
    DOWNLOAD_EMAIL_REPLY_TO: 'support@outsideinprint.org',
    __testFetch: async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'www.google-analytics.com') { calls.push('google'); throw new Error('synthetic timeout'); }
      if (parsed.hostname === 'api.resend.com') {
        calls.push('email'); emailAttempts++;
        if (emailFailsInitially && emailAttempts === 1) return new Response(null, { status: 503 });
        return Response.json({ id: 'synthetic-message' });
      }
      assert.equal(parsed.hostname, 'connect.squareup.com');
      if (parsed.pathname.startsWith('/v2/catalog/object/')) return Response.json({ object: {
        id: 'variation-1', type: 'ITEM_VARIATION', present_at_all_locations: true, item_variation_data: {
          sku: 'OIP-AN-EPUB', pricing_type: 'FIXED_PRICING', price_money: { amount: 999, currency: 'USD' }, sellable: true,
        } } });
      if (parsed.pathname === '/v2/online-checkout/payment-links') {
        const body = JSON.parse(options.body);
        return Response.json({ payment_link: { id: 'link-1', order_id: 'order-1',
          url: 'https://square.link/u/synthetic', pre_populated_data: body.pre_populated_data },
          related_resources: { orders: [{ ...input.order, reference_id: body.order.reference_id,
            fulfillments: [{ type: 'DIGITAL', state: 'PROPOSED' }] }] } });
      }
      if (parsed.pathname === '/v2/payments/payment-1') return Response.json({ payment: input.payment });
      if (parsed.pathname === '/v2/orders/order-1') return Response.json({ order: input.order });
      throw new Error('Unexpected synthetic provider route');
    },
  });
  const request = new Request('https://downloads.outsideinprint.org/api/books/epub', {
    method: 'POST', headers: { origin: 'https://outsideinprint.org', 'content-type': 'application/json',
      'idempotency-key': 'synthetic-checkout-0001' },
    body: JSON.stringify({ sku: 'OIP-AN-EPUB', country_code: 'US', email: 'reader@example.test', measurement: measurement(now) }),
  });
  Object.defineProperty(request, 'cf', { value: { country: 'US' } });
  const response = await handleRequest(request, environment);
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal(environment.DB.row('purchase_measurement_checkouts').square_order_id, 'order-1');
  assert.equal(environment.DB.row('purchase_measurement_checkouts').mode, missingMapping ? 'excluded' : 'live');
  assert.equal(environment.DB.count('purchase_measurement_deliveries'), 0);
  const event = { event_id: 'event-1', type: 'payment.updated', data: { object: { payment: { id: 'payment-1' } } } };
  if (emailFailsInitially) {
    await assert.rejects(() => processSquareEvent(environment, event, now + 2), /EPUB_EMAIL_DELIVERY_FAILED/u);
  } else await processSquareEvent(environment, event, now + 2);
  await processSquareEvent(environment, { ...event, event_id: 'event-2' }, now + 3);
  assert.deepEqual(calls, missingMapping ? ['email'] : emailFailsInitially ? ['email', 'google', 'email'] : ['email', 'google']);
  assert.equal(environment.DB.row('fulfillments').email_delivery_status, 'SENT');
  if (missingMapping) assert.equal(environment.DB.count('purchase_measurement_deliveries'), 0);
  else assert.equal(environment.DB.row('purchase_measurement_deliveries').status, 'UNKNOWN');
  });
});
