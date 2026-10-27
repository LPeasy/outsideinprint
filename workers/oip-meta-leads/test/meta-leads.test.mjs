import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { handleRequest, processQueue } from '../src/index.js';

const NOW = Date.parse('2026-10-26T18:00:00Z');
const FORM = { formId: '22222222', adIds: ['33333333', '33333334'], campaignCode: 'almanack-meta-pilot',
  consentVersion: 'newsletter-welcome-v1', consentCheckboxKey: 'fixture_checkbox_key', consentCheckedValue: 'true',
  startsAt: '2026-10-26T00:00:00Z', endsAt: '2026-11-03T00:00:00Z' };
const fields = email => [{ name: 'email', values: [email] }];
const consent = checked => [{ checkbox_key: FORM.consentCheckboxKey, is_checked: checked }];

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_meta_leads.sql', import.meta.url), 'utf8'));
  const faults = { afterClaim: false, finish: false };
  const DB = { prepare(query) { return { values: [], bind(...args) { this.values = args; return this; },
    async first() {
      const row = sql.prepare(query).get(...this.values) ?? null;
      if (faults.afterClaim && query.includes('RETURNING')) throw new Error('lost durable claim response');
      return row;
    },
    async run() {
      if (faults.finish && query.includes('finished_at =')) throw new Error('private provider response must never leak');
      return { success: true, meta: sql.prepare(query).run(...this.values) };
    },
    async all() { return { results: sql.prepare(query).all(...this.values) }; },
  }; } };
  const env = { DB, META_APP_SECRET: 'fixture-meta-app-secret-at-least-32-chars',
    META_VERIFY_TOKEN: 'fixture-verify-token-at-least-32-characters', META_VERIFY_ENABLED: 'false',
    ADMIN_TOKEN: 'fixture-admin-token-at-least-32-characters', EMAIL_HMAC_KEY: 'fixture-email-hmac-key-at-least-32-chars',
    META_PAGE_ACCESS_TOKEN: 'fixture-meta-token', BUTTONDOWN_API_KEY: 'fixture-buttondown-key',
    NEWSLETTER_ID: 'news_0000000000000000000000000g', META_PAGE_ID: '11111111', META_GRAPH_VERSION: 'v99.0',
    APPROVED_FORMS_JSON: JSON.stringify([FORM]), INTAKE_ENABLED: 'true', DISPATCH_ENABLED: 'true', SYNTHETIC_ONLY: 'false', TRUSTED_SOURCE_BYPASS: 'false' };
  const calls = [];
  const overrides = new Map();
  let postResponse = null, getResponse = null;
  const lead = id => ({ id, form_id: FORM.formId, ad_id: FORM.adIds[0], created_time: new Date(NOW - 1000).toISOString(),
    field_data: fields(`lead-${id}@example.invalid`), custom_disclaimer_responses: consent('true'), ...(overrides.get(id) || {}) });
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith('https://graph.facebook.com/')) return getResponse ? getResponse(url, options) : Response.json(lead(new URL(url).pathname.split('/').at(-1)));
    if (url === 'https://api.buttondown.com/v1/subscribers') {
      if (postResponse) return postResponse(url, options);
      return Response.json({ id: 'sub_00000000000000000000000001', type: 'unactivated', email_address: JSON.parse(options.body).email_address,
        source: 'api', subscriber_import_id: null }, { status: 201 });
    }
    throw new Error('Unexpected external destination');
  };
  const request = (id = '44444444', changes = {}, signature = true) => {
    const payload = { object: 'page', entry: [{ id: env.META_PAGE_ID, changes: [{ field: 'leadgen', value: {
      leadgen_id: id, page_id: env.META_PAGE_ID, form_id: FORM.formId, ad_id: FORM.adIds[0], created_time: Math.floor((NOW - 1000) / 1000), ...changes,
    } }] }] };
    const body = JSON.stringify(payload);
    return new Request('https://worker.example.invalid/webhooks/meta', { method: 'POST', body, headers: {
      'Content-Type': 'application/json', ...(signature ? { 'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', env.META_APP_SECRET).update(body).digest('hex') } : {}),
    } });
  };
  return { env, sql, faults, calls, overrides, lead, request,
    send: (req, clock = () => NOW) => handleRequest(req ?? request(), env, { fetcher, clock }),
    process: now => processQueue(env, { fetcher, clock: () => now ?? NOW }),
    row: (id = '44444444') => sql.prepare('SELECT * FROM meta_leads WHERE lead_id = ?').get(id),
    posts: () => calls.filter(call => call.url === 'https://api.buttondown.com/v1/subscribers'),
    setPost: callback => { postResponse = callback; }, setGet: callback => { getResponse = callback; },
  };
}

test('signed notice is persisted before any request; canonical lead creates pending subscription with no bypass or overwrite', async () => {
  const f = fixture();
  assert.equal((await f.send()).status, 200);
  assert.equal(f.calls.length, 0);
  assert.equal(f.row().state, 'queued');
  assert.deepEqual(await f.process(), { status: 'processed', attempted: 1 });
  assert.equal(f.row().state, 'pending_confirmation');
  const call = f.posts()[0];
  assert.deepEqual(JSON.parse(call.options.body), { email_address: 'lead-44444444@example.invalid', type: 'unactivated', tags: ['outside-in-print'],
    utm_campaign: FORM.campaignCode, utm_medium: 'paid_social', utm_source: 'meta' });
  assert.equal(call.options.headers['X-Buttondown-Collision-Behavior'], undefined);
  assert.equal(call.options.headers['X-Buttondown-Bypass-Firewall'], undefined);
  assert.equal(call.options.redirect, 'manual');
  assert.equal(f.calls[0].options.redirect, 'manual');
  const stored = JSON.stringify(f.sql.prepare('SELECT * FROM meta_leads').all());
  for (const forbidden of ['@example.invalid', 'fixture-meta-token', 'fixture-buttondown-key']) assert.ok(!stored.includes(forbidden));
  assert.match(f.row().email_key, /^[a-f0-9]{64}$/);
});

test('defaults and synthetic-only prevent all external calls and intake writes', async () => {
  const f = fixture();
  f.env.SYNTHETIC_ONLY = 'true';
  assert.equal((await f.send()).status, 503);
  assert.equal((await f.process()).status, 'dispatch_disabled');
  assert.equal(f.calls.length, 0);
  assert.equal(f.row(), undefined);
  const config = JSON.parse(readFileSync(new URL('../wrangler.example.jsonc', import.meta.url), 'utf8'));
  for (const field of ['META_VERIFY_ENABLED', 'INTAKE_ENABLED', 'DISPATCH_ENABLED', 'TRUSTED_SOURCE_BYPASS']) assert.equal(config.vars[field], 'false');
  assert.equal(config.vars.SYNTHETIC_ONLY, 'true');
  assert.equal(config.vars.APPROVED_FORMS_JSON, '[]');
  assert.deepEqual(config.triggers.crons, []);
});

test('unsigned, wrong page/form/ad, stale and future notices are rejected without storage', async () => {
  const f = fixture();
  assert.equal((await f.send(f.request('44444444', {}, false))).status, 401);
  for (const changes of [{ page_id: '99999999' }, { form_id: '99999999' }, { ad_id: '99999999' },
    { created_time: Math.floor(NOW / 1000) + 301 }, { created_time: Math.floor(NOW / 1000) - 8 * 86400 }]) {
    assert.equal((await f.send(f.request('44444444', changes))).status, 400);
  }
  assert.equal(f.row(), undefined);
});

test('duplicate/concurrent deliveries and processing yield one POST', async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 8 }, () => f.send()));
  await Promise.all(Array.from({ length: 8 }, () => f.process()));
  await f.send(); await f.process();
  assert.equal(f.posts().length, 1);
});

test('same lead cannot be rebound to another approved ad or attribution', async () => {
  const f = fixture(); await f.send();
  assert.equal((await f.send(f.request('44444444', { ad_id: FORM.adIds[1] }))).status, 409);
  assert.equal(f.row().ad_id, FORM.adIds[0]);
  assert.throws(() => f.sql.prepare('UPDATE meta_leads SET campaign_code = ?').run('changed'), /immutable_attribution/);
});

test('canonical mismatch or missing/declined/duplicate consent blocks subscriber creation', async () => {
  for (const override of [{ form_id: '99999999' }, { ad_id: '99999999' }, { id: '99999999' },
    { custom_disclaimer_responses: undefined },
    { custom_disclaimer_responses: consent('false') },
    { custom_disclaimer_responses: consent(false) },
    { custom_disclaimer_responses: consent(true) },
    { custom_disclaimer_responses: [...consent('true'), ...consent('true')] },
    { custom_disclaimer_responses: [{ checkbox_key: 'wrong', is_checked: 'true' }] },
    { field_data: fields('not-an-email') }]) {
    const f = fixture(); f.overrides.set('44444444', override); await f.send(); await f.process();
    assert.equal(f.row().state, 'held'); assert.equal(f.posts().length, 0);
  }
});

test('same normalized address across distinct leads preserves first attribution and sends once', async () => {
  const f = fixture();
  f.overrides.set('44444444', { field_data: fields(' Person@Example.invalid ') });
  f.overrides.set('44444445', { field_data: fields('person@example.invalid') });
  await f.send(); await f.send(f.request('44444445')); await f.process();
  assert.equal(f.posts().length, 1);
  assert.equal(f.row('44444445').state, 'duplicate');
});

test('rolling-hour reservation caps bypass at five attempts even with concurrent processors', async () => {
  const f = fixture(); f.env.TRUSTED_SOURCE_BYPASS = 'true';
  for (let i = 0; i < 8; i++) await f.send(f.request(String(44444444 + i)));
  await Promise.all(Array.from({ length: 4 }, () => f.process()));
  await f.process();
  assert.equal(f.posts().length, 5);
  assert.ok(f.posts().every(call => call.options.headers['X-Buttondown-Bypass-Firewall'] === 'true'));
  await f.process(NOW + 3_599_000); assert.equal(f.posts().length, 5);
  await f.process(NOW + 3_600_001); assert.equal(f.posts().length, 8);
});

test('existing/suppressed provider rejection never resubscribes or retries', async () => {
  const f = fixture(); f.setPost(() => Response.json({ error: 'subscriber_already_exists', email: 'private@example.invalid' }, { status: 400 }));
  await f.send(); await f.process(); await f.send(); await f.process();
  assert.equal(f.posts().length, 1); assert.equal(f.row().state, 'rejected');
  assert.equal(f.row().error_code, 'buttondown_http_400');
  assert.ok(!JSON.stringify(f.row()).includes('private@example.invalid'));
});

test('timeout, redirect, 5xx and unexpected success are permanently uncertain', async () => {
  for (const callback of [() => { throw new Error('email=private@example.invalid'); },
    () => new Response('', { status: 302 }), () => new Response('', { status: 503 }),
    () => Response.json({ id: 'sub_00000000000000000000000001', type: 'regular', email_address: 'lead-44444444@example.invalid' }, { status: 201 })]) {
    const f = fixture(); f.setPost(callback); await f.send(); await f.process(); await f.send(); await f.process();
    assert.equal(f.posts().length, 1); assert.equal(f.row().state, 'uncertain');
  }
});

test('lost claim and lost outcome storage preserve reservation without blind retry', async () => {
  const claim = fixture(); await claim.send(); claim.faults.afterClaim = true;
  await assert.rejects(claim.process()); claim.faults.afterClaim = false; await claim.process();
  assert.equal(claim.row().state, 'dispatching'); assert.equal(claim.posts().length, 0);
  const finish = fixture(); await finish.send(); finish.faults.finish = true; await finish.process();
  finish.faults.finish = false; await finish.process();
  assert.equal(finish.row().state, 'dispatching'); assert.equal(finish.posts().length, 1);
});

test('transient Meta GET uses bounded backoff; token and response bodies never reach ledger', async () => {
  const f = fixture(); await f.send(); f.setGet(() => new Response('private provider payload', { status: 503 }));
  await f.process(); assert.equal(f.row().state, 'queued'); assert.equal(f.posts().length, 0);
  f.setGet(null); await f.process(); assert.equal(f.posts().length, 0);
  await f.process(NOW + 300_000); assert.equal(f.posts().length, 1);
});

test('changing newsletter or HMAC key fails closed after binding', async () => {
  for (const [name, value] of [['EMAIL_HMAC_KEY', 'different-secret-with-more-than-32-characters'], ['NEWSLETTER_ID', 'news_0000000000000000000000000h']]) {
    const f = fixture(); await f.send(); await f.process(); f.env[name] = value;
    await assert.rejects(f.process(), /configuration_changed/); assert.equal(f.posts().length, 1);
  }
});

test('verification challenge is gated and exact, with no provider requests', async () => {
  const f = fixture(); const make = token => new Request(`https://worker.example.invalid/webhooks/meta?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=${token}`);
  assert.equal((await f.send(make(f.env.META_VERIFY_TOKEN))).status, 403);
  f.env.META_VERIFY_ENABLED = 'true';
  assert.equal((await f.send(make('wrong'))).status, 403);
  assert.equal(await (await f.send(make(f.env.META_VERIFY_TOKEN))).text(), '12345');
  assert.equal(f.calls.length, 0);
});

test('synthetic preview permits reserved test domain only, makes zero writes or network calls', async () => {
  const f = fixture(); f.env.SYNTHETIC_ONLY = 'true';
  const expected = { lead_id: '44444444', form_id: FORM.formId, ad_id: FORM.adIds[0], created_at: new Date(NOW - 1000).toISOString(), consent_key: FORM.consentCheckboxKey, consent_value: JSON.stringify(FORM.consentCheckedValue) };
  const preview = email => new Request('https://worker.example.invalid/admin/synthetic-preview', { method: 'POST', headers: { Authorization: `Bearer ${f.env.ADMIN_TOKEN}` },
    body: JSON.stringify({ expected, lead: { ...f.lead('44444444'), field_data: fields(email) } }) });
  assert.deepEqual(await (await f.send(preview('synthetic@example.invalid'))).json(), { status: 'synthetic_valid', would_request_type: 'unactivated', network_calls: 0, stored_records: 0 });
  assert.equal((await f.send(preview('real@example.com'))).status, 400);
  assert.equal(f.calls.length, 0); assert.equal(f.row(), undefined);
});

test('operator endpoints require authorization and report pending separately from confirmations', async () => {
  const f = fixture();
  assert.equal((await f.send(new Request('https://worker.example.invalid/admin/status'))).status, 401);
  await f.send(); await f.process();
  const response = await f.send(new Request('https://worker.example.invalid/admin/status', { headers: { Authorization: `Bearer ${f.env.ADMIN_TOKEN}` } }));
  const summary = await response.json();
  assert.equal(summary.counts.pending_confirmation, 1);
  assert.equal(summary.confirmed_subscribers, 'not_measured_here');
  assert.equal(summary.review_required, false);
});

test('Meta compact timezone offset is normalized without weakening timestamp matching', async () => {
  const f = fixture(); f.overrides.set('44444444', { created_time: '2026-10-26T17:59:59+0000' });
  await f.send(); await f.process(); assert.equal(f.posts().length, 1);
});

test('revoked or changed form approval holds queued records without retrieving personal data', async () => {
  const f = fixture(); await f.send();
  f.env.APPROVED_FORMS_JSON = JSON.stringify([{ ...FORM, consentCheckboxKey: 'replacement' }]);
  await f.process(); assert.equal(f.row().state, 'held'); assert.equal(f.calls.length, 0);
});

test('declined values cannot be configured as affirmative consent', async () => {
  const f = fixture(); f.env.APPROVED_FORMS_JSON = JSON.stringify([{ ...FORM, consentCheckedValue: 'false' }]);
  assert.equal((await f.send()).status, 503); assert.equal(f.row(), undefined);
});

test('five permanently failing oldest leads are held and cannot starve a later valid lead', async () => {
  const f = fixture();
  for (let i = 0; i < 6; i++) await f.send(f.request(String(44444444 + i)));
  f.setGet(url => {
    const id = new URL(url).pathname.split('/').at(-1);
    return id === '44444449' ? Response.json(f.lead(id)) : new Response('private rejection', { status: 403 });
  });
  await f.process();
  assert.equal(f.posts().length, 0);
  for (let i = 0; i < 5; i++) assert.equal(f.row(String(44444444 + i)).state, 'held');
  await f.process(); assert.equal(f.posts().length, 1); assert.equal(f.row('44444449').state, 'pending_confirmation');
  const status = await (await f.send(new Request('https://worker.example.invalid/admin/status', { headers: { Authorization: `Bearer ${f.env.ADMIN_TOKEN}` } }))).json();
  assert.equal(status.review_required, true); assert.equal(status.counts.held, 5);
});

test('transient retrieval failures yield their queue slots, show review status, and stop after three attempts', async () => {
  const f = fixture();
  for (let i = 0; i < 6; i++) await f.send(f.request(String(44444444 + i)));
  f.setGet(url => {
    const id = new URL(url).pathname.split('/').at(-1);
    return id === '44444449' ? Response.json(f.lead(id)) : new Response('', { status: 503 });
  });
  await f.process();
  const status = await (await f.send(new Request('https://worker.example.invalid/admin/status', { headers: { Authorization: `Bearer ${f.env.ADMIN_TOKEN}` } }))).json();
  assert.equal(status.queued_failures, 5); assert.equal(status.review_required, true);
  await f.process(); assert.equal(f.posts().length, 1); // Later lead proceeds while older rows back off.
  assert.equal(f.row().retrieval_attempts, 1);
  await f.process(NOW + 299_999); assert.equal(f.row().retrieval_attempts, 1);
  await f.process(NOW + 300_000); assert.equal(f.row().retrieval_attempts, 2);
  await f.process(NOW + 899_999); assert.equal(f.row().retrieval_attempts, 2);
  await f.process(NOW + 900_000); assert.equal(f.row().state, 'held'); assert.equal(f.row().retrieval_attempts, 3);
  assert.equal(f.row().error_code, 'meta_retrieval_exhausted');
  const callCount = f.calls.length; await f.process(NOW + 1_800_000); assert.equal(f.calls.length, callCount);
});

test('manual processing samples its live clock after slow GETs and respects the actual rolling hour', async () => {
  const f = fixture(); let clockNow = NOW, getDelay = 10_000;
  const actualPosts = [];
  for (let i = 0; i < 10; i++) await f.send(f.request(String(44444444 + i)));
  f.setGet(url => { clockNow += getDelay; return Response.json(f.lead(new URL(url).pathname.split('/').at(-1))); });
  f.setPost((_url, options) => {
    actualPosts.push(clockNow);
    return Response.json({ id: 'sub_00000000000000000000000001', type: 'unactivated', source: 'api',
      email_address: JSON.parse(options.body).email_address }, { status: 201 });
  });
  const process = () => f.send(new Request('https://worker.example.invalid/admin/process', { method: 'POST', headers: { Authorization: `Bearer ${f.env.ADMIN_TOKEN}` } }), () => clockNow);
  await process();
  assert.deepEqual(actualPosts, [10, 20, 30, 40, 50].map(seconds => NOW + seconds * 1000));
  assert.equal(f.row().attempted_at, new Date(NOW + 10_000).toISOString());
  clockNow = NOW + 3_600_000; getDelay = 0;
  await process(); assert.equal(actualPosts.length, 5); // Request-start time would incorrectly permit five more.
  clockNow = NOW + 3_610_000;
  await process(); assert.equal(actualPosts.length, 6);
  for (const at of actualPosts) assert.ok(actualPosts.filter(value => value > at - 3_600_000 && value <= at).length <= 5);
});

test('a backward clock step during retrieval cannot backdate the durable reservation', async () => {
  const f = fixture(); await f.send(); let clockNow = NOW + 60_000;
  f.setGet(url => { clockNow -= 10_000; return Response.json(f.lead(new URL(url).pathname.split('/').at(-1))); });
  await f.send(new Request('https://worker.example.invalid/admin/process', { method: 'POST', headers: { Authorization: `Bearer ${f.env.ADMIN_TOKEN}` } }), () => clockNow);
  assert.equal(f.row().attempted_at, new Date(NOW + 60_000).toISOString());
});
