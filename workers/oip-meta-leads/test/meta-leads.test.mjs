import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import worker, { handleRequest, processQueue, validateCanonicalLead } from '../src/index.js';

const NOW = Date.parse('2026-10-26T18:00:00Z');
const FORM = { formId: '22222222', adIds: ['33333333', '33333334'], campaignCode: 'almanack-meta-pilot',
  consentVersion: 'newsletter-welcome-v1', consentCheckboxKey: 'fixture_checkbox_key', consentCheckedValue: 'true',
  startsAt: '2026-10-26T00:00:00Z', endsAt: '2026-11-03T00:00:00Z' };
const fields = email => [{ name: 'email', values: [email] }];
const consent = checked => [{ checkbox_key: FORM.consentCheckboxKey, is_checked: checked }];

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_meta_leads.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0002_owned_test_recovery.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0003_paid_lead_recovery.sql', import.meta.url), 'utf8'));
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
    { ad_id: undefined }, { ad_id: null }, { ad_id: '' }, { ad_id: 0 }, { ad_id: '0' },
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

test('approved signed paid notice supplies an omitted canonical ad_id without changing consent or paid attribution', async () => {
  const f = fixture();
  f.env.APPROVED_FORMS_JSON = JSON.stringify([{ ...FORM, consentCheckedValue: '1' }]);
  f.overrides.set('44444444', { ad_id: undefined, custom_disclaimer_responses: consent('1') });
  assert.equal((await f.send()).status, 200);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await f.process(), { status: 'processed', attempted: 1 });
  assert.equal(f.row().state, 'pending_confirmation');
  assert.equal(f.row().ad_id, FORM.adIds[0]);
  assert.equal(f.row().consent_value, JSON.stringify('1'));
  assert.match(f.row().email_key, /^[a-f0-9]{64}$/);
  assert.equal(f.posts().length, 1);
  assert.deepEqual(JSON.parse(f.posts()[0].options.body), { email_address: 'lead-44444444@example.invalid',
    type: 'unactivated', tags: ['outside-in-print'], utm_campaign: FORM.campaignCode, utm_medium: 'paid_social', utm_source: 'meta' });
  assert.ok(new URL(f.calls[0].url).searchParams.get('fields').split(',').includes('ad_id'));
  await f.send(); await f.process();
  assert.equal(f.posts().length, 1);
});

test('paid notice context never permits a present invalid or mismatching canonical ad_id', async () => {
  for (const ad_id of [null, '', 0, '0', FORM.adIds[1], '99999999']) {
    const f = fixture(); f.overrides.set('44444444', { ad_id });
    await f.send(); await f.process();
    assert.equal(f.row().state, 'held');
    assert.equal(f.row().error_code, 'canonical_lead_mismatch');
    assert.equal(f.row().attempted_at, null);
    assert.equal(f.row().email_key, null);
    assert.equal(f.posts().length, 0);
  }
});

test('omitted paid ad_id cannot bypass canonical identity, time, email or exact consent checks', async () => {
  const cases = [
    [{ id: '99999999' }, 'canonical_lead_mismatch'],
    [{ form_id: '99999999' }, 'canonical_lead_mismatch'],
    [{ created_time: new Date(NOW).toISOString() }, 'canonical_lead_mismatch'],
    [{ created_time: 'not-a-time' }, 'canonical_lead_mismatch'],
    [{ created_time: new Date(NOW + 301_000).toISOString() }, 'canonical_lead_mismatch'],
    [{ created_time: new Date(NOW - 8 * 86400_000).toISOString() }, 'canonical_lead_mismatch'],
    [{ field_data: null }, 'canonical_lead_mismatch'],
    [{ field_data: [] }, 'required_field_missing'],
    [{ field_data: [...fields('one@example.invalid'), ...fields('two@example.invalid')] }, 'required_field_missing'],
    [{ field_data: fields('not-an-email') }, 'invalid_email'],
    [{ custom_disclaimer_responses: undefined }, 'consent_missing'],
    [{ custom_disclaimer_responses: consent('false') }, 'consent_missing'],
    [{ custom_disclaimer_responses: consent(true) }, 'consent_missing'],
    [{ custom_disclaimer_responses: [...consent('true'), ...consent('true')] }, 'consent_missing'],
    [{ custom_disclaimer_responses: [{ checkbox_key: 'different', is_checked: 'true' }] }, 'consent_missing'],
  ];
  for (const [override, code] of cases) {
    const f = fixture(); f.overrides.set('44444444', { ad_id: undefined, ...override });
    await f.send(); await f.process();
    assert.equal(f.row().state, 'held');
    assert.equal(f.row().error_code, code);
    assert.equal(f.row().attempted_at, null);
    assert.equal(f.row().email_key, null);
    assert.equal(f.posts().length, 0);
  }
});

test('default canonical validation stays strict and never reads an omission exception from lead data', async () => {
  const f = fixture(); await f.send();
  const lead = f.lead('44444444'); delete lead.ad_id;
  lead.allowMissingPaidAdId = true;
  assert.throws(() => validateCanonicalLead(lead, f.row(), NOW), /canonical_lead_mismatch/);
  assert.throws(() => validateCanonicalLead(lead, f.row(), NOW, { allowMissingPaidAdId: false }), /canonical_lead_mismatch/);
  assert.equal(validateCanonicalLead(lead, f.row(), NOW, { allowMissingPaidAdId: true }), 'lead-44444444@example.invalid');
  assert.throws(() => validateCanonicalLead({ ...lead, ad_id: null }, f.row(), NOW,
    { allowMissingPaidAdId: true }), /canonical_lead_mismatch/);
  assert.equal(f.posts().length, 0);
});

test('paid ad_id omission requires unchanged Page and exact current paid approval before retrieval', async () => {
  for (const change of [
    f => { f.env.META_PAGE_ID = '99999999'; },
    f => { f.env.APPROVED_FORMS_JSON = JSON.stringify([{ ...FORM, adIds: [FORM.adIds[1]] }]); },
    f => { f.env.APPROVED_FORMS_JSON = JSON.stringify([{ ...FORM, startsAt: new Date(NOW).toISOString() }]); },
  ]) {
    const f = fixture(); f.overrides.set('44444444', { ad_id: undefined });
    await f.send(); change(f); await f.process();
    assert.equal(f.row().state, 'held');
    assert.equal(f.row().error_code, 'approval_removed_or_changed');
    assert.equal(f.calls.length, 0);
    assert.equal(f.posts().length, 0);
  }
});

test('synthetic preview cannot accept absent paid ad_id through caller-supplied context', async () => {
  const f = fixture(); f.env.SYNTHETIC_ONLY = 'true';
  const expected = { lead_id: '44444444', form_id: FORM.formId, ad_id: FORM.adIds[0],
    created_at: new Date(NOW - 1000).toISOString(), consent_key: FORM.consentCheckboxKey,
    consent_value: JSON.stringify(FORM.consentCheckedValue) };
  const lead = f.lead('44444444'); delete lead.ad_id;
  const response = await f.send(new Request('https://worker.example.invalid/admin/synthetic-preview', {
    method: 'POST', headers: { Authorization: `Bearer ${f.env.ADMIN_TOKEN}` },
    body: JSON.stringify({ expected, lead, context: { allowMissingPaidAdId: true }, allowMissingPaidAdId: true }),
  }));
  assert.equal(response.status, 400);
  assert.equal(f.row(), undefined);
  assert.equal(f.calls.length, 0);
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

function ownedFixture() {
  const f = fixture();
  const email = 'owner-test@example.invalid';
  const approval = { pageId: f.env.META_PAGE_ID, leadId: '44444444', formId: FORM.formId,
    createdAt: new Date(NOW - 1000).toISOString(), expiresAt: new Date(NOW + 3_600_000).toISOString(),
    emailKey: createHmac('sha256', f.env.EMAIL_HMAC_KEY).update(email).digest('hex'),
    consentCheckboxKey: FORM.consentCheckboxKey, consentCheckedValue: '1' };
  f.env.APPROVED_FORMS_JSON = '[]';
  f.env.OWNED_TEST_JSON = JSON.stringify(approval);
  f.overrides.set(approval.leadId, { ad_id: undefined, field_data: fields(email), custom_disclaimer_responses: consent('1') });
  f.ownedRequest = (id = approval.leadId, changes = {}, signed = true) => f.request(id, { ad_id: '0', ...changes }, signed);
  return { ...f, approval, email };
}

test('one approved adless owned test shares durable dispatch and remains excluded from paid attribution', async () => {
  const f = ownedFixture();
  assert.equal((await f.send(f.ownedRequest())).status, 200);
  assert.equal(f.calls.length, 0);
  assert.equal(f.row().ad_id, 'owned-test');
  await Promise.all([f.send(f.ownedRequest()), f.process(), f.process()]);
  await f.send(f.ownedRequest()); await f.process();
  assert.equal(f.posts().length, 1);
  assert.equal(f.row().state, 'pending_confirmation');
  const body = JSON.parse(f.posts()[0].options.body);
  assert.equal(body.email_address, f.email);
  assert.equal(body.type, 'unactivated');
  assert.equal(body.utm_campaign, 'oip-owned-test');
  assert.equal(body.utm_medium, 'owned_test');
  assert.ok(!JSON.stringify(f.row()).includes(f.email));
});

test('owned-test exception requires exact signed lead, Page, form, creation time and adless notice', async () => {
  const f = ownedFixture();
  assert.equal((await f.send(f.ownedRequest(undefined, {}, false))).status, 401);
  for (const [id, changes] of [['44444445', {}], ['44444444', { page_id: '99999999' }],
    ['44444444', { form_id: '99999999' }], ['44444444', { created_time: Math.floor(NOW / 1000) }],
    ['44444444', { ad_id: FORM.adIds[0] }]]) {
    assert.equal((await f.send(f.ownedRequest(id, changes))).status, 400);
  }
  assert.equal(f.row(), undefined); assert.equal(f.calls.length, 0);
});

test('canonical wrong inbox, missing consent, changed consent type or unexpected ad cannot dispatch the owned test', async () => {
  for (const changes of [{ field_data: fields('another@example.invalid') }, { custom_disclaimer_responses: [] },
    { custom_disclaimer_responses: consent(true) }, { ad_id: '0' }, { ad_id: FORM.adIds[0] }]) {
    const f = ownedFixture();
    f.overrides.set(f.approval.leadId, { ...f.overrides.get(f.approval.leadId), ...changes });
    await f.send(f.ownedRequest()); await f.process();
    assert.equal(f.row().state, 'held'); assert.equal(f.posts().length, 0);
  }
});

test('expired or overlong test approval cannot receive or dispatch; expiry during retrieval sends nothing', async () => {
  for (const expiresAt of [new Date(NOW).toISOString(), new Date(NOW + 25 * 3_600_000).toISOString()]) {
    const f = ownedFixture(); f.env.OWNED_TEST_JSON = JSON.stringify({ ...f.approval, expiresAt });
    assert.equal((await f.send(f.ownedRequest())).status, 503);
    await f.process(); assert.equal(f.posts().length, 0);
  }
  const f = ownedFixture(); await f.send(f.ownedRequest());
  let time = NOW;
  await processQueue(f.env, { fetcher: async (url, options) => {
    f.calls.push({ url, options }); time = NOW + 3_600_001; return Response.json(f.lead(f.approval.leadId));
  }, clock: () => time });
  assert.equal(f.row().state, 'held'); assert.equal(f.posts().length, 0);
});

test('a removed private test approval cannot use the paid registry to dispatch its reserved test', async () => {
  const f = ownedFixture(); await f.send(f.ownedRequest());
  delete f.env.OWNED_TEST_JSON; f.env.APPROVED_FORMS_JSON = JSON.stringify([FORM]);
  await f.process(); assert.equal(f.row().state, 'held'); assert.equal(f.posts().length, 0);
  const paid = fixture(); paid.env.OWNED_TEST_JSON = JSON.stringify({ ...f.approval, leadId: '44444449' });
  assert.equal((await paid.send(paid.request('44444445', { ad_id: '0' }))).status, 400);
  await paid.send(); await paid.process(); assert.equal(paid.posts().length, 1);
});

test('admin status flags a stale queue without exposing its lead reference', async () => {
  const f = fixture(); await f.send();
  const response = await f.send(new Request('https://worker.example.invalid/admin/status', {
    headers: { Authorization: `Bearer ${f.env.ADMIN_TOKEN}` },
  }), () => NOW + 901_000);
  const body = await response.json();
  assert.equal(body.oldest_queued_age_seconds, 901); assert.equal(body.review_required, true);
  assert.ok(!JSON.stringify(body).includes('44444444'));
});

test('scheduled entry point waits for the shared processor and honors disabled dispatch', async () => {
  const f = fixture(); f.env.DISPATCH_ENABLED = 'false';
  let scheduledWork;
  await worker.scheduled({}, f.env, { waitUntil: promise => { scheduledWork = promise; } });
  assert.deepEqual(await scheduledWork, { status: 'dispatch_disabled' });
  assert.equal(f.calls.length, 0);
});

test('firewall rejection retains a fixed diagnostic and one audited recovery preserves the original reservation', async () => {
  const f = ownedFixture();
  f.setPost(() => Response.json({ code: 'subscriber_blocked', detail: 'private response' }, { status: 400 }));
  await f.send(f.ownedRequest()); await f.process();
  const first = { ...f.row() };
  assert.equal(first.error_code, 'buttondown_firewall_blocked');
  f.sql.prepare("UPDATE meta_leads SET state = 'queued', error_code = 'approved_owned_test_firewall_retry', attempted_at = NULL, finished_at = NULL WHERE lead_id = ?").run(first.lead_id);
  const audit = f.sql.prepare('SELECT * FROM meta_owned_test_recoveries').get();
  assert.equal(audit.original_attempted_at, first.attempted_at);
  assert.equal(audit.original_finished_at, first.finished_at);
  assert.equal(f.row().email_key, first.email_key);
  f.env.TRUSTED_SOURCE_BYPASS = 'true'; f.setPost(null); await f.process();
  assert.equal(f.row().state, 'pending_confirmation'); assert.equal(f.posts().length, 2);
  assert.equal(f.posts()[1].options.headers['X-Buttondown-Bypass-Firewall'], 'true');
  await f.send(f.ownedRequest()); await f.process(); assert.equal(f.posts().length, 2);
  assert.throws(() => f.sql.prepare('DELETE FROM meta_owned_test_recoveries').run(), /immutable_recovery_audit/);
});

test('recovery cannot release paid, uncertain, suppressed or twice-rejected test reservations', async () => {
  for (const [owned, response] of [[false, { code: 'subscriber_blocked' }], [true, { code: 'subscriber_suppressed' }]]) {
    const f = owned ? ownedFixture() : fixture();
    f.setPost(() => Response.json(response, { status: 400 }));
    await f.send(owned ? f.ownedRequest() : undefined); await f.process();
    // Generic 400 needs a documented operator diagnosis; the guarded transition
    // still rejects a normal requeue without the explicit reviewed reason.
    assert.throws(() => f.sql.prepare("UPDATE meta_leads SET state = 'queued', error_code = 'approved_owned_test_firewall_retry', attempted_at = NULL, finished_at = NULL WHERE lead_id = '44444444'").run(), /owned_test_recovery_not_allowed/);
  }
  const f = ownedFixture(); f.setPost(() => Response.json({ code:'subscriber_blocked' }, { status:400 }));
  await f.send(f.ownedRequest()); await f.process();
  const recover = () => f.sql.prepare("UPDATE meta_leads SET state = 'queued', error_code = 'approved_owned_test_firewall_retry', attempted_at = NULL, finished_at = NULL WHERE lead_id = '44444444'").run();
  recover(); await f.process(); assert.throws(recover, /UNIQUE/);
  assert.equal(f.posts().length, 2);
  const uncertain = ownedFixture(); uncertain.setPost(() => new Response('', {status:503}));
  await uncertain.send(uncertain.ownedRequest()); await uncertain.process();
  assert.throws(() => uncertain.sql.prepare("UPDATE meta_leads SET state = 'queued', error_code = 'approved_owned_test_firewall_retry', attempted_at = NULL, finished_at = NULL WHERE lead_id = '44444444'").run(), /owned_test_recovery_not_allowed/);
});

test('the original rejected attempt remains in the hourly cap after audited recovery is queued', async () => {
  const f = ownedFixture(); f.setPost(() => Response.json({code:'subscriber_blocked'}, {status:400}));
  f.env.OWNED_TEST_JSON = JSON.stringify({ ...f.approval, expiresAt: new Date(NOW+2*3_600_000).toISOString() });
  await f.send(f.ownedRequest()); await f.process(); f.setPost(null);
  f.env.APPROVED_FORMS_JSON = JSON.stringify([FORM]);
  for (let n=0; n<4; n++) await f.send(f.request(String(44444445+n)));
  await f.process(); assert.equal(f.posts().length, 5);
  f.sql.prepare("UPDATE meta_leads SET state = 'queued', error_code = 'approved_owned_test_firewall_retry', attempted_at = NULL, finished_at = NULL WHERE lead_id = '44444444'").run();
  await f.process(); assert.equal(f.posts().length, 5); assert.equal(f.row().state, 'queued');
  await f.process(NOW+3_600_001); assert.equal(f.posts().length, 6); assert.equal(f.row().state, 'pending_confirmation');
});

test('native owned-inbox probe admits a new adless reference but cannot create a subscriber', async () => {
  const f = ownedFixture();
  f.env.OWNED_TEST_JSON = JSON.stringify({ ...f.approval, leadId: undefined, allowNewLead: true, dispatchAllowed: false });
  f.overrides.set('44444445', { ad_id: undefined, field_data: fields(f.email), custom_disclaimer_responses: consent('1') });
  assert.equal((await f.send(f.ownedRequest('44444445'))).status, 200);
  await f.process(); assert.equal(f.row('44444445').state, 'held'); assert.equal(f.posts().length, 0);
  const bad = ownedFixture(); bad.env.OWNED_TEST_JSON = JSON.stringify({ ...bad.approval, allowNewLead: true, dispatchAllowed: true });
  assert.equal((await bad.send(bad.ownedRequest())).status, 503);
});

test('native same-inbox probe proves canonical deduplication after the first pending signup without another POST', async () => {
  const f = ownedFixture(); await f.send(f.ownedRequest()); await f.process();
  f.env.OWNED_TEST_JSON = JSON.stringify({ ...f.approval, leadId: undefined, allowNewLead: true, dispatchAllowed: false });
  f.overrides.set('44444445', { ad_id: undefined, field_data: fields(f.email), custom_disclaimer_responses: consent('1') });
  await f.send(f.ownedRequest('44444445')); await f.process();
  assert.equal(f.row('44444445').state, 'duplicate'); assert.equal(f.posts().length, 1);
});

const PAID_RECOVERY = { approvedAt: '2026-10-26T18:10:00.000Z', source: 'a'.repeat(64),
  reason: 'approved_paid_missing_ad_id_retry' };
function recoverPaid(f, override = {}) {
  const review = { ...PAID_RECOVERY, code: PAID_RECOVERY.reason, ...override };
  return f.sql.prepare(`UPDATE meta_leads SET state = 'queued', error_code = ?,
    recovery_approved_at = ?, recovery_review_source = ?, recovery_approval_reason = ?
    WHERE lead_id = '44444444'`).run(review.code, review.approvedAt, review.source, review.reason);
}

test('reviewed paid held recovery records an immutable audit and permits one normal pending-only attempt', async () => {
  for (const originalCode of ['lead_or_consent_invalid', 'canonical_lead_mismatch']) {
    const f = fixture(); await f.send();
    f.sql.prepare("UPDATE meta_leads SET state = 'held', error_code = ?, retrieval_attempts = 2, next_retrieval_at = ? WHERE lead_id = '44444444'")
      .run(originalCode, new Date(NOW - 1000).toISOString());
    const original = { ...f.row() };
    recoverPaid(f);
    const queued = f.row();
    for (const key of Object.keys(original).filter(key => !['state', 'error_code', 'recovery_approved_at', 'recovery_review_source', 'recovery_approval_reason'].includes(key))) {
      assert.equal(queued[key], original[key], key);
    }
    const audit = f.sql.prepare('SELECT * FROM meta_paid_lead_recoveries').get();
    assert.deepEqual({ ...audit }, { lead_id: original.lead_id, original_state: 'held', original_error_code: originalCode,
      reviewed_at: PAID_RECOVERY.approvedAt, review_source: PAID_RECOVERY.source, reason: PAID_RECOVERY.reason });
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM meta_owned_test_recoveries').get().count, 0);
    f.overrides.set('44444444', { ad_id: undefined });
    await f.process(); await f.send(); await f.process();
    assert.equal(f.row().state, 'pending_confirmation');
    assert.equal(f.posts().length, 1);
    assert.equal(JSON.parse(f.posts()[0].options.body).type, 'unactivated');
    assert.throws(() => recoverPaid(f), /recovery_not_allowed/);
    assert.throws(() => f.sql.prepare('UPDATE meta_paid_lead_recoveries SET reason = reason').run(), /immutable_recovery_audit/);
    assert.throws(() => f.sql.prepare('DELETE FROM meta_paid_lead_recoveries').run(), /immutable_recovery_audit/);
  }
});

test('paid recovery rejects other states and any prior reservation, attempt, subscriber or completion', async () => {
  const invalid = [
    ...['queued', 'dispatching', 'pending_confirmation', 'duplicate', 'rejected', 'uncertain'].map(state => ({ state })),
    { email_key: 'b'.repeat(64) }, { attempted_at: PAID_RECOVERY.approvedAt },
    { subscriber_id: 'sub_00000000000000000000000001' }, { finished_at: PAID_RECOVERY.approvedAt },
    { error_code: 'consent_missing' }, { error_code: null },
  ];
  for (const fields of invalid) {
    const f = fixture(); await f.send();
    const setup = { state: 'held', error_code: 'lead_or_consent_invalid', ...fields };
    const keys = Object.keys(setup);
    f.sql.prepare(`UPDATE meta_leads SET ${keys.map(key => `${key} = ?`).join(', ')} WHERE lead_id = '44444444'`).run(...Object.values(setup));
    assert.throws(() => recoverPaid(f), /recovery_(?:approval_)?not_allowed/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM meta_paid_lead_recoveries').get().count, 0);
    assert.equal(f.posts().length, 0);
  }
});

test('paid recovery requires exact review reason, UTC timestamp and lowercase source SHA256', async () => {
  for (const review of [
    { code: 'unreviewed_retry' }, { reason: 'unreviewed_retry' },
    { source: null }, { source: '' }, { source: 'a'.repeat(63) }, { source: 'g'.repeat(64) }, { source: 'A'.repeat(64) },
    { approvedAt: null }, { approvedAt: 'not-a-date' }, { approvedAt: '2026-02-30T18:10:00.000Z' },
    { approvedAt: '2026-10-26T18:10:00Z' }, { approvedAt: '2026-10-26T18:10:00.000+00:00' },
  ]) {
    const f = fixture(); await f.send();
    f.sql.prepare("UPDATE meta_leads SET state = 'held', error_code = 'lead_or_consent_invalid' WHERE lead_id = '44444444'").run();
    assert.throws(() => recoverPaid(f, review), /recovery_(?:approval_)?not_allowed/);
    assert.equal(f.row().state, 'held');
    assert.equal(f.row().recovery_approved_at, null);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM meta_paid_lead_recoveries').get().count, 0);
  }
});

test('paid approval metadata cannot be preset, edited independently, cleared or reused after another hold', async () => {
  const f = fixture(); await f.send();
  f.sql.prepare("UPDATE meta_leads SET state = 'held', error_code = 'lead_or_consent_invalid' WHERE lead_id = '44444444'").run();
  assert.throws(() => f.sql.prepare("UPDATE meta_leads SET recovery_approved_at = ? WHERE lead_id = '44444444'")
    .run(PAID_RECOVERY.approvedAt), /paid_recovery_approval_not_allowed/);
  assert.throws(() => f.sql.prepare(`INSERT INTO meta_leads
    (lead_id, page_id, form_id, ad_id, campaign_code, consent_version, consent_key, consent_value, created_at, received_at, state, recovery_approved_at)
    SELECT '44444449', page_id, form_id, ad_id, campaign_code, consent_version, consent_key, consent_value, created_at, received_at, 'held', ?
    FROM meta_leads WHERE lead_id = '44444444'`).run(PAID_RECOVERY.approvedAt), /paid_recovery_approval_not_allowed/);
  recoverPaid(f);
  for (const [column, value] of [['recovery_approved_at', null], ['recovery_review_source', 'b'.repeat(64)], ['recovery_approval_reason', null]]) {
    assert.throws(() => f.sql.prepare(`UPDATE meta_leads SET ${column} = ? WHERE lead_id = '44444444'`).run(value), /immutable_paid_recovery_approval/);
  }
  f.sql.prepare("UPDATE meta_leads SET state = 'held', error_code = 'lead_or_consent_invalid' WHERE lead_id = '44444444'").run();
  assert.throws(() => recoverPaid(f), /paid_lead_recovery_not_allowed/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM meta_paid_lead_recoveries').get().count, 1);
  assert.equal(f.posts().length, 0);
});

test('paid recovery cannot reset retrieval history or change immutable attribution', async () => {
  const f = fixture(); await f.send();
  f.sql.prepare("UPDATE meta_leads SET state = 'held', error_code = 'lead_or_consent_invalid', retrieval_attempts = 2 WHERE lead_id = '44444444'").run();
  const recoverWith = clause => f.sql.prepare(`UPDATE meta_leads SET state = 'queued', error_code = ?,
    recovery_approved_at = ?, recovery_review_source = ?, recovery_approval_reason = ?, ${clause}
    WHERE lead_id = '44444444'`).run(PAID_RECOVERY.reason, PAID_RECOVERY.approvedAt, PAID_RECOVERY.source, PAID_RECOVERY.reason);
  assert.throws(() => recoverWith('retrieval_attempts = 0'), /paid_lead_recovery_not_allowed/);
  assert.throws(() => recoverWith("next_retrieval_at = '2026-10-26T18:00:00.000Z'"), /paid_lead_recovery_not_allowed/);
  assert.throws(() => recoverWith("ad_id = '33333334'"), /immutable_attribution/);
  assert.equal(f.row().state, 'held');
  assert.equal(f.row().retrieval_attempts, 2);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM meta_paid_lead_recoveries').get().count, 0);
});
