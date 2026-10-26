import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { handleRequest } from '../src/index.js';

const ID = 'sub_00000000000000000000000001';
const OTHER_ID = 'sub_00000000000000000000000002';
const NOW = Date.parse('2026-10-26T18:00:00Z');
const EVENT = 'oip.almanack.confirmed.v1';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_welcome.sql', import.meta.url), 'utf8'));
  const faults = { before: null, afterClaim: false };
  const DB = { prepare(query) {
    const statement = { values: [], bind(...values) { this.values = values; return this; },
      async first() {
        if (faults.before?.(query)) throw new Error('private DB failure');
        const row = sql.prepare(query).get(...this.values) ?? null;
        if (faults.afterClaim && query.includes('RETURNING')) throw new Error('uncertain DB response');
        return row;
      },
      async run() {
        if (faults.before?.(query)) throw new Error('private DB failure');
        return { success: true, meta: sql.prepare(query).run(...this.values) };
      },
      async all() { return { results: sql.prepare(query).all(...this.values) }; },
    };
    return statement;
  } };
  const env = { DB, NEWSLETTER_ID: 'fixture-newsletter', BUTTONDOWN_API_KEY: 'fixture-buttondown-key', RESEND_API_KEY: 'fixture-resend-key',
    WEBHOOK_SIGNING_KEY: 'fixture-signing-key-that-is-long-enough', ADMIN_TOKEN: 'fixture-admin-token-that-is-long-enough',
    WELCOME_ENABLED: 'true', WELCOME_CUTOVER_AT: '2026-10-26T17:00:00Z', WELCOME_SEQUENCE_VERSION: 'welcome-v1', RESEND_EVENT_NAME: EVENT };
  let subscriber = { id: ID, type: 'regular', creation_date: '2026-10-26T17:30:00Z', email_address: 'owner@example.test', subscriber_import_id: null, source: 'organic' };
  let buttondownResponse = null;
  let resendResponse = () => Response.json({ object: 'event', event: EVENT });
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith('https://api.buttondown.com/')) return buttondownResponse ? buttondownResponse() : Response.json(subscriber);
    if (url === 'https://api.resend.com/events/send') return resendResponse();
    throw new Error('unexpected network request');
  };
  const request = (changes = {}, { signature = true, raw, method = 'POST' } = {}) => {
    const body = raw ?? JSON.stringify({ event_type: 'subscriber.confirmed', data: { newsletter: env.NEWSLETTER_ID, subscriber: ID }, ...changes });
    const headers = { 'Content-Type': 'application/json' };
    if (signature) headers['X-Buttondown-Signature'] = 'sha256=' + createHmac('sha256', env.WEBHOOK_SIGNING_KEY).update(body).digest('hex');
    return new Request('https://bridge.example.test/webhooks/buttondown', { method, headers, body });
  };
  return { env, sql, faults, calls, request,
    setSubscriber: value => { subscriber = { ...subscriber, ...value }; },
    setButtondown: callback => { buttondownResponse = callback; },
    setResend: callback => { resendResponse = callback; },
    send: req => handleRequest(req ?? request(), env, { fetcher, now: NOW }),
    row: () => sql.prepare('SELECT * FROM welcome_enrollments WHERE subscriber_id = ?').get(ID),
    events: () => calls.filter(call => call.url === 'https://api.resend.com/events/send'),
  };
}

test('valid signed confirmation uses canonical email and reserves one native event', async () => {
  const f = fixture();
  const response = await f.send(f.request({ email: 'untrusted@example.test' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'accepted' });
  assert.equal(f.row().state, 'accepted');
  assert.equal(f.calls[0].url, `https://api.buttondown.com/v1/subscribers/${ID}`);
  assert.equal(f.calls[0].options.headers['Buttondown-Context'], f.env.NEWSLETTER_ID);
  assert.equal(f.calls[0].options.headers['X-API-Version'], '2026-04-01');
  assert.equal(f.calls[0].options.redirect, 'manual');
  const outgoing = f.events()[0];
  assert.equal(outgoing.options.redirect, 'manual');
  assert.deepEqual(JSON.parse(outgoing.options.body), { event: EVENT, email: 'owner@example.test', payload: { enrollment_ref: f.row().enrollment_ref, sequence_version: 'welcome-v1' } });
  assert.match(f.row().enrollment_ref, /^[0-9a-f-]{36}$/);
  const stored = JSON.stringify(f.sql.prepare('SELECT * FROM welcome_enrollments').all());
  for (const forbidden of ['owner@example.test', 'fixture-resend-key', 'fixture-buttondown-key', 'untrusted@example.test']) assert.ok(!stored.includes(forbidden));
});

test('duplicate and concurrent deliveries cannot trigger duplicate events, even after a version change', async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 12 }, () => f.send()));
  assert.equal(f.events().length, 1);
  f.env.WELCOME_SEQUENCE_VERSION = 'welcome-v2';
  f.env.RESEND_EVENT_NAME = 'oip.almanack.confirmed.v2';
  f.setSubscriber({ type: 'unsubscribed' });
  await f.send();
  f.setSubscriber({ type: 'regular' });
  await f.send();
  assert.equal(f.events().length, 1);
  assert.equal(f.row().sequence_version, 'welcome-v1');
});

test('signature, body, newsletter, and subscriber validation happen before external calls', async () => {
  const f = fixture();
  for (const req of [
    f.request({}, { signature: false }),
    f.request({}, { raw: '{invalid' }),
    f.request({ data: { newsletter: 'different', subscriber: ID } }),
    f.request({ data: { newsletter: f.env.NEWSLETTER_ID, subscriber: 'owner@example.test' } }),
    f.request({}, { raw: 'x'.repeat(16 * 1024 + 1) }),
  ]) assert.ok((await f.send(req)).status >= 400);
  const tampered = f.request();
  tampered.headers.set('X-Buttondown-Signature', 'sha256=' + '0'.repeat(64));
  assert.equal((await f.send(tampered)).status, 401);
  assert.equal(f.calls.length, 0);
});

test('only confirmed events with an enabled, complete configuration act', async () => {
  const f = fixture();
  for (const event_type of ['subscriber.created', 'subscriber.unsubscribed', 'subscriber.type.changed']) {
    assert.deepEqual(await (await f.send(f.request({ event_type }))).json(), { status: 'ignored' });
  }
  f.env.WELCOME_ENABLED = 'false';
  assert.deepEqual(await (await f.send()).json(), { status: 'disabled' });
  f.env.WELCOME_ENABLED = 'true';
  f.env.WELCOME_CUTOVER_AT = '';
  assert.equal((await f.send()).status, 503);
  assert.equal(f.calls.length, 0);
});

test('owner-only mode excludes other subscriber IDs before provider access', async () => {
  const f = fixture();
  f.env.TEST_SUBSCRIBER_ID = OTHER_ID;
  assert.deepEqual(await (await f.send()).json(), { status: 'test_only' });
  assert.equal(f.calls.length, 0);
  f.env.TEST_SUBSCRIBER_ID = ID;
  assert.deepEqual(await (await f.send()).json(), { status: 'accepted' });
});

test('old, inactive, imported, future, and malformed canonical records never enroll', async () => {
  const cases = [
    { type: 'unactivated' }, { type: 'unsubscribed' }, { type: 'complained' }, { type: 'undeliverable' },
    { type: 'premium' }, { creation_date: '2026-10-26T16:59:59Z' }, { creation_date: '2026-10-27T00:00:00Z' },
    { creation_date: 'not-a-date' }, { creation_date: '2026-10-26' }, { email_address: 'invalid' },
    { subscriber_import_id: 'import_fixture' }, { source: 'import' },
  ];
  for (const changes of cases) {
    const f = fixture(); f.setSubscriber(changes);
    assert.deepEqual(await (await f.send()).json(), { status: 'ineligible' }, JSON.stringify(changes));
    assert.equal(f.events().length, 0); assert.equal(f.row(), undefined);
  }
  const f = fixture();
  f.setButtondown(() => new Response(null, { status: 404 }));
  assert.deepEqual(await (await f.send()).json(), { status: 'ineligible' });
});

test('cutover is durable and cannot move backward to backfill existing subscribers', async () => {
  const f = fixture();
  await f.send();
  f.env.WELCOME_CUTOVER_AT = '2026-01-01T00:00:00Z';
  assert.equal((await f.send()).status, 503);
  assert.equal(f.events().length, 1);
  assert.equal(f.sql.prepare('SELECT cutover_at FROM welcome_config').get().cutover_at, '2026-10-26T17:00:00.000Z');
});

test('canonical GET failures and identity mismatches never send; safe webhook retry can recover', async () => {
  for (const failure of [
    () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example.test/' } }),
    () => new Response(null, { status: 429 }), () => new Response(null, { status: 503 }),
    () => Response.json({ id: OTHER_ID }), () => { throw new Error('private fetch failure'); },
  ]) {
    const f = fixture(); f.setButtondown(failure);
    assert.equal((await f.send()).status, 503);
    assert.equal(f.events().length, 0); assert.equal(f.row(), undefined);
    f.setButtondown(null);
    assert.deepEqual(await (await f.send()).json(), { status: 'accepted' });
    assert.equal(f.events().length, 1);
  }
});

test('uncertain POST responses are permanently reserved and never automatically retried', async () => {
  for (const reply of [
    () => { throw new Error('owner@example.test secret from network'); },
    () => new Response(null, { status: 503 }), () => new Response(null, { status: 408 }),
    () => new Response(null, { status: 302 }), () => new Response('not-json'),
    () => Response.json({ object: 'event', event: 'wrong' }),
  ]) {
    const f = fixture(); f.setResend(reply);
    assert.deepEqual(await (await f.send()).json(), { status: 'review_required' });
    assert.equal(f.row().state, 'uncertain');
    await f.send(); await f.send();
    assert.equal(f.events().length, 1);
    assert.ok(!JSON.stringify(f.row()).includes('owner@example.test'));
  }
});

test('definitive rejections also require review instead of repeated event attempts', async () => {
  for (const status of [400, 401, 403, 404, 422, 429]) {
    const f = fixture(); f.setResend(() => new Response('private provider body', { status }));
    await f.send(); await f.send();
    assert.equal(f.row().state, 'rejected');
    assert.equal(f.row().error_code, `resend_http_${status}`);
    assert.equal(f.events().length, 1);
  }
});

test('pre-dispatch storage failures allow retries; uncertain claim or result writes do not resend', async () => {
  const before = fixture();
  before.faults.before = query => query.includes('INSERT INTO welcome_enrollments');
  assert.equal((await before.send()).status, 503);
  assert.equal(before.events().length, 0);
  before.faults.before = null;
  await before.send(); assert.equal(before.events().length, 1);

  const claim = fixture(); claim.faults.afterClaim = true;
  assert.equal((await claim.send()).status, 503);
  claim.faults.afterClaim = false;
  await claim.send();
  assert.equal(claim.events().length, 0);
  assert.equal(claim.row().state, 'dispatching');

  const finish = fixture();
  finish.faults.before = query => query.includes('finished_at =');
  assert.deepEqual(await (await finish.send()).json(), { status: 'review_required' });
  assert.equal(finish.row().state, 'dispatching');
  finish.faults.before = null;
  await finish.send(); assert.equal(finish.events().length, 1);
});

test('pending retry rechecks current status before any POST', async () => {
  const f = fixture();
  f.faults.before = query => query.includes('RETURNING');
  assert.equal((await f.send()).status, 503);
  assert.equal(f.row().state, 'pending');
  f.faults.before = null; f.setSubscriber({ type: 'unsubscribed' });
  assert.deepEqual(await (await f.send()).json(), { status: 'ineligible' });
  assert.equal(f.events().length, 0);
  const status = await f.send(new Request('https://bridge.example.test/admin/status', { headers: { Authorization: `Bearer ${f.env.ADMIN_TOKEN}` } }));
  assert.equal((await status.json()).review_required, true);
});

test('admin status provides authenticated aggregate counts without subscriber identifiers', async () => {
  const f = fixture();
  f.setResend(() => { throw new Error('timeout'); }); await f.send();
  const endpoint = 'https://bridge.example.test/admin/status';
  for (const token of ['', 'wrong-token']) {
    assert.equal((await f.send(new Request(endpoint, { headers: { Authorization: `Bearer ${token}` } }))).status, 401);
  }
  const response = await f.send(new Request(endpoint, { headers: { Authorization: `Bearer ${f.env.ADMIN_TOKEN}` } }));
  const value = await response.json();
  assert.deepEqual(value.counts, { uncertain: 1 });
  assert.equal(value.review_required, true);
  assert.ok(!JSON.stringify(value).includes(ID));
  assert.ok(!JSON.stringify(value).includes('owner@example.test'));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await f.send(new Request('https://bridge.example.test/health'))).status, 200);
  assert.equal((await f.send(new Request('https://bridge.example.test/unknown'))).status, 404);
});
