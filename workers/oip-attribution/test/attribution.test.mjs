import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { handle, checkWebhookHealth } from '../src/index.js';
import { control, putControl, seedCampaigns, subscriberStatements, reconcile, snapshot, retain, eventStatement, easternWeek } from '../src/ledger.js';
import register from '../../../data/newsletter_campaigns.json' with { type: 'json' };
import { request as providerRequest } from '../src/provider.js';

const ORIGIN = 'https://outsideinprint.org';
const API = 'https://api.buttondown.com/v1/';
const CODE = 'almanack-organic-facebook-weekend-01';
const ID = 'sub_' + 'a'.repeat(24);
const OTHER_ID = 'sub_' + 'b'.repeat(24);
const SIGNING_KEY = 'test-only-signing-key-32-characters-long';
const BASELINE_AT = '2026-01-01T00:00:00.000Z';

test('provider uses Worker-supported manual redirects and never follows credentials',async()=>{
  let calls=0;
  await assert.rejects(providerRequest({BUTTONDOWN_API_KEY:'test',NEWSLETTER_ID:'news_test'},'subscribers',{},async(url,options)=>{
    calls++; assert.equal(options.redirect,'manual');
    return new Response(null,{status:302,headers:{Location:'https://untrusted.example.invalid/'}});
  }),error=>error.code==='provider_redirect_rejected');
  assert.equal(calls,1);
});

test('test-only rollout rejects unassigned references before provider submission',async t=>{
  const env=await fixture(t,{TEST_ONLY_MODE:'true',TEST_SIGNUP_REFS:JSON.stringify([randomUUID()])});
  const response=await handle(signupRequest(input()),env,()=>assert.fail('test-only gate must precede provider request'));
  assert.equal(response.status,503); assert.equal(env.DB.rows('signups').length,0);
});

// Exercises the actual migration and SQL with SQLite's transaction semantics.
class D1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync(new URL('../migrations/0001_attribution.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../migrations/0002_retention.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../migrations/0003_lifecycle_ordering.sql', import.meta.url), 'utf8'));
    this.failNextBatch = false;
  }
  prepare(sql) {
    const db = this;
    return { bind(...values) {
      return {
        sql,
        async first() { return db.sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { results: db.sqlite.prepare(sql).all(...values) }; },
        async run() { return { success: true, meta: db.sqlite.prepare(sql).run(...values) }; }
      };
    } };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN TRANSACTION');
    try {
      const results = [];
      for (const statement of statements) {
        results.push(/^\s*SELECT\b/i.test(statement.sql) ? await statement.all() : await statement.run());
        if (this.failNextBatch) {
          this.failNextBatch = false;
          throw new Error('injected D1 failure after one statement');
        }
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  rows(table) { return this.sqlite.prepare(`SELECT * FROM ${table}`).all(); }
}

async function fixture(t, overrides = {}) {
  const DB = new D1();
  t.after(() => DB.sqlite.close());
  const env = { DB, ALLOWED_ORIGINS: ORIGIN, SIGNUPS_ENABLED: 'true',
    BUTTONDOWN_API_KEY: 'test-only-provider-key', NEWSLETTER_ID: 'news_test',
    WEBHOOK_SIGNING_KEY: SIGNING_KEY, ADMIN_TOKEN: 'test-only-admin-token-over-32-characters',
    WEBHOOK_ID: 'webhook_test', WEBHOOK_URL: 'https://attribution.example.invalid/webhooks/buttondown',
    MAX_SIGNUPS_PER_DAY: '80', MAX_SIGNUPS_PER_MINUTE: '10', ...overrides };
  await seedCampaigns(env, register.campaigns);
  await putControl(env, 'baseline', { completed_at: BASELINE_AT, subscriber_count: 0, known_test_count: 0, gaps: [] }).run();
  return env;
}

function input(tagged = true, ref = randomUUID()) {
  const campaign = register.campaigns.find(row => row.code === CODE);
  return { email: 'owner-controlled@example.invalid', signup_ref: ref, website: '',
    landing_path: '/subscribe/weekend/', ...(tagged ? { campaign_code: CODE,
      ...Object.fromEntries(['utm_campaign', 'utm_source', 'utm_medium', 'utm_content'].map(key => [key, campaign[key]])) } : {}) };
}

function signupRequest(value, headers = {}) {
  return new Request('https://attribution.example.invalid/signup', { method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'Idempotency-Key': value.signup_ref, ...headers }, body: JSON.stringify(value) });
}

function providerSubscriber(value, updates = {}) {
  return { id: ID, email_address: value.email, type: 'unactivated', creation_date: new Date().toISOString(),
    metadata: { oip_signup_ref: value.signup_ref }, ...updates };
}

function providerCreate(value, calls = [], updates = {}) {
  return async (url, options) => {
    if (options.method !== 'POST') {
      assert.equal(url, API + 'subscribers/' + ID);
      return Response.json(providerSubscriber(value, updates));
    }
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    assert.equal(url, API + 'subscribers');
    assert.equal(options.method, 'POST');
    return Response.json(providerSubscriber(value, updates), { status: 201 });
  };
}

function webhookRequest(env, eventType, id = ID, { signature = true, extra = {} } = {}) {
  const body = JSON.stringify({ event_type: eventType, data: { newsletter: env.NEWSLETTER_ID, subscriber: id }, ...extra });
  const digest = createHmac('sha256', SIGNING_KEY).update(body).digest('hex');
  return new Request('https://attribution.example.invalid/webhooks/buttondown', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Buttondown-Signature': signature ? `sha256=${digest}` : `sha256=${'0'.repeat(64)}` }, body });
}

test('tagged signup uses pending opt-in, native UTMs, fixed metadata, and no visitor IP', async t => {
  const env = await fixture(t), value = input(), calls = [];
  const response = await handle(signupRequest(value, { 'CF-Connecting-IP': '203.0.113.5' }), env, providerCreate(value, calls));
  assert.equal(response.status, 200);
  assert.equal(calls[0].body.type, 'unactivated');
  assert.equal(calls[0].body.utm_campaign, 'almanack-organic');
  assert.equal(calls[0].body.metadata.oip_signup_ref, value.signup_ref);
  assert.equal(calls[0].headers['X-Idempotency-Key'], value.signup_ref);
  assert.equal(calls[0].headers['Buttondown-Context'], env.NEWSLETTER_ID);
  assert.ok(!Object.keys(calls[0].headers).some(key => /forwarded|ip-address/i.test(key)));
  assert.equal(env.DB.rows('signups')[0].is_new, 1);
  assert.equal(env.DB.rows('subscribers')[0].campaign_code, CODE);
  const ledger = JSON.stringify(await snapshot(env));
  assert.ok(!ledger.includes(value.email));
  assert.ok(!ledger.includes('203.0.113.5'));
  assert.ok(!ledger.includes('test-only-provider-key'));
});

test('untagged signup succeeds with unknown campaign and sanitized landing path', async t => {
  const env = await fixture(t), value = input(false);
  value.landing_path = '/subscribe/?private=do-not-store';
  assert.equal((await handle(signupRequest(value), env, providerCreate(value))).status, 200);
  assert.equal(env.DB.rows('signups')[0].campaign_code, null);
  assert.equal(env.DB.rows('signups')[0].landing_path, null);
});

test('fresh accepted provider response with a mismatched email cannot acknowledge the signup', async t => {
  const env = await fixture(t), value = input();
  const response = await handle(signupRequest(value), env,
    providerCreate(value, [], { email_address: 'unrelated@example.invalid' }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'retry_same_submission');
  assert.equal(env.DB.rows('signups')[0].outcome, 'reserved');
  assert.equal(env.DB.rows('subscribers').length, 0);
});

test('definitive provider rejection is preserved separately from uncertain outcome and aggregates as rejected', async t => {
  const env=await fixture(t,{RETENTION_ENABLED:'true'}),value=input();
  const response=await handle(signupRequest(value),env,async()=>Response.json({code:'subscriber_blocked'},{status:400}));
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'signup_unavailable');
  assert.equal(env.DB.rows('signups')[0].outcome,'rejected');
  assert.equal(env.DB.rows('signups')[0].accepted_at,null);
  assert.equal(env.DB.rows('subscribers').length,0);
  env.DB.sqlite.prepare('UPDATE signups SET created_at=?').run('2026-06-02T12:00:00.000Z');
  await putControl(env,'last_reconciliation_success_at','2026-10-15T10:00:00.000Z').run();
  await retain(env,'2026-10-15T10:00:00.000Z');
  assert.equal(env.DB.rows('historical_aggregates').find(row=>row.metric==='expired_attempts_rejected').value,1);
  assert.equal(env.DB.rows('historical_aggregates').filter(row=>row.metric==='accepted_new_signups').length,0);
});

test('accepted reference is idempotent without another provider submission', async t => {
  const env = await fixture(t), value = input(), calls = [];
  const provider = providerCreate(value, calls);
  assert.equal((await handle(signupRequest(value), env, provider)).status, 200);
  assert.equal((await handle(signupRequest(value), env, provider)).status, 200);
  assert.equal(calls.length, 1);
  assert.equal(env.DB.rows('signups').length, 1);
  assert.equal(env.DB.rows('subscribers').length, 1);
});

test('reusing a reference with another campaign is rejected', async t => {
  const env = await fixture(t), value = input();
  await handle(signupRequest(value), env, providerCreate(value));
  const changed = input(false, value.signup_ref);
  assert.equal((await handle(signupRequest(changed), env, () => assert.fail('must not submit'))).status, 409);
});

test('accepted reference cannot acknowledge an unrelated email without storing email locally', async t => {
  const env = await fixture(t), value = input();
  const provider = providerCreate(value);
  await handle(signupRequest(value), env, provider);
  assert.equal((await handle(signupRequest({ ...value, email: 'another@example.invalid' }), env, provider)).status, 409);
  assert.equal(env.DB.rows('signups').length, 1);
});

test('origin, size, campaign, and honeypot failures never reach Buttondown', async t => {
  const env = await fixture(t), provider = () => assert.fail('must not submit');
  assert.equal((await handle(signupRequest(input(), { Origin: 'https://untrusted.invalid' }), env, provider)).status, 403);
  assert.equal((await handle(signupRequest({ ...input(), campaign_code: 'unknown' }), env, provider)).status, 400);
  assert.equal((await handle(signupRequest({ ...input(), website: 'bot.example' }), env, provider)).status, 400);
  assert.equal((await handle(signupRequest({ ...input(), email: 'x'.repeat(5000) }), env, provider)).status, 413);
  assert.equal(env.DB.rows('signups').length, 0);
});

test('baseline gate and disabled switch prevent public signup', async t => {
  const env = await fixture(t), value = input(), provider = () => assert.fail('must not submit');
  env.SIGNUPS_ENABLED = 'false';
  assert.equal((await handle(signupRequest(value), env, provider)).status, 503);
  env.SIGNUPS_ENABLED = 'true';
  env.DB.sqlite.exec("DELETE FROM controls WHERE key='baseline'");
  assert.equal((await handle(signupRequest(value), env, provider)).status, 503);
});

test('existing subscriber collision stays generic and never becomes a new acquisition', async t => {
  const env = await fixture(t), value = input(), calls = [];
  const existing = providerSubscriber(value, { type: 'regular', creation_date: '2025-12-01T00:00:00Z', metadata: {} });
  const provider = async (url, options) => {
    calls.push({ url, options });
    return options.method === 'POST' ? Response.json({ code: 'email_already_exists' }, { status: 400 }) : Response.json(existing);
  };
  const response = await handle(signupRequest(value), env, provider);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, message: 'Check your inbox for any next steps.' });
  assert.equal(calls.length, 2);
  assert.equal(env.DB.rows('signups')[0].is_new, 0);
  assert.equal(env.DB.rows('subscribers')[0].is_baseline, 1);
  assert.equal(env.DB.rows('subscribers')[0].campaign_code, null);
});

test('explicit resubmission uses pending documented collision flow and preserves original acquisition', async t => {
  const env = await fixture(t), first = input();
  await handle(signupRequest(first), env, providerCreate(first));
  const existing = providerSubscriber(first, { type: 'unsubscribed', unsubscription_date: new Date().toISOString() });
  await env.DB.batch(await subscriberStatements(env, existing, new Date().toISOString()));
  const again = input(false), posts = [];
  const provider = async (url, options) => {
    if (options.method !== 'POST') return Response.json(existing);
    posts.push({ ...options, body: JSON.parse(options.body) });
    if (posts.length === 1) return Response.json({ code: 'subscriber_already_exists' }, { status: 400 });
    return Response.json({ ...existing, type: 'unactivated' }, { status: 201 });
  };
  assert.equal((await handle(signupRequest(again), env, provider)).status, 200);
  assert.equal(posts[1].headers['X-Buttondown-Collision-Behavior'], 'add');
  assert.deepEqual(posts[1].body, { email_address: again.email, type: 'unactivated' });
  assert.equal(env.DB.rows('subscribers')[0].campaign_code, CODE);
  assert.equal(env.DB.rows('subscribers')[0].acquisition_signup_ref, first.signup_ref);
  assert.equal(env.DB.rows('signups').find(row => row.signup_ref === again.signup_ref).is_new, 0);
});

test('invalid webhook signature and foreign newsletter are rejected before provider lookup', async t => {
  const env = await fixture(t), provider = () => assert.fail('must not fetch');
  assert.equal((await handle(webhookRequest(env, 'subscriber.confirmed', ID, { signature: false }), env, provider)).status, 401);
  const foreign = { ...env, NEWSLETTER_ID: 'news_foreign' };
  assert.equal((await handle(webhookRequest(foreign, 'subscriber.confirmed'), env, provider)).status, 400);
  assert.equal(env.DB.rows('lifecycle_events').length, 0);
});

test('confirmation is counted once; unknown event timestamps stay unknown', async t => {
  const env = await fixture(t), value = input();
  await handle(signupRequest(value), env, providerCreate(value));
  const current = providerSubscriber(value, { type: 'regular' });
  const provider = async () => Response.json(current);
  assert.equal((await handle(webhookRequest(env, 'subscriber.confirmed', ID, { extra: { timestamp: '1999-01-01T00:00:00Z', id: 'unverified-event-field' } }), env, provider)).status, 200);
  const firstObserved = env.DB.rows('subscribers')[0].first_confirmation_observed_at;
  assert.equal((await handle(webhookRequest(env, 'subscriber.confirmed'), env, provider)).status, 200);
  assert.equal(env.DB.rows('lifecycle_events').filter(row => row.type === 'confirmed').length, 1);
  assert.equal(env.DB.rows('subscribers')[0].first_confirmation_observed_at, firstObserved);
  assert.equal(env.DB.rows('subscribers')[0].first_confirmed_at, null);
  assert.equal(env.DB.rows('subscribers')[0].confirmation_time_known, 0);
});

test('out-of-order confirmation cannot restore an unsubscribed current provider state', async t => {
  const env = await fixture(t), value = input();
  await handle(signupRequest(value), env, providerCreate(value));
  const provider = async () => Response.json(providerSubscriber(value, { type: 'unsubscribed', unsubscription_date: '2026-10-15T10:00:00Z' }));
  assert.equal((await handle(webhookRequest(env, 'subscriber.unsubscribed'), env, provider)).status, 200);
  assert.equal((await handle(webhookRequest(env, 'subscriber.confirmed'), env, provider)).status, 200);
  assert.equal(env.DB.rows('subscribers')[0].status, 'unsubscribed');
  assert.ok(env.DB.rows('subscribers')[0].first_confirmation_observed_at);
  assert.equal(env.DB.rows('lifecycle_events').filter(row => row.type === 'unsubscribed').length, 1);
});

test('signed confirmation survives provider deletion without restoring active state or duplicating evidence', async t => {
  const env=await fixture(t),value=input();
  await handle(signupRequest(value),env,providerCreate(value));
  const missing=async()=>Response.json({code:'not_found'},{status:404});
  assert.equal((await handle(webhookRequest(env,'subscriber.confirmed'),env,missing)).status,200);
  const first=env.DB.rows('subscribers')[0];
  assert.equal(first.status,'deleted');
  assert.ok(first.first_confirmation_observed_at);
  assert.equal(first.first_confirmed_at,null);
  assert.equal((await handle(webhookRequest(env,'subscriber.confirmed'),env,missing)).status,200);
  assert.equal(env.DB.rows('subscribers')[0].first_confirmation_observed_at,first.first_confirmation_observed_at);
  assert.equal(env.DB.rows('lifecycle_events').filter(row=>row.type==='confirmed').length,1);
});

test('late webhook for a provider-deleted and ledger-absent identity persists only a value-free receipt', async t => {
  const env=await fixture(t);
  const missing=async()=>Response.json({code:'not_found'},{status:404});
  const eventId='ext_evt_'+'p'.repeat(24);
  assert.equal((await handle(webhookRequest(env,'subscriber.confirmed',ID,{extra:{id:eventId}}),env,missing)).status,200);
  assert.equal(env.DB.rows('subscribers').length,0);
  assert.equal(env.DB.rows('lifecycle_events').length,0);
  const receipt=await control(env,'last_ignored_missing_subscriber_event');
  assert.deepEqual(Object.keys(receipt).sort(),['event_type','observed_at']);
  assert.equal(receipt.event_type,'subscriber.confirmed');
  assert.equal(await control(env,'last_webhook_received_at'),receipt.observed_at);
  assert.ok(!JSON.stringify(env.DB.rows('controls')).includes(ID));
  assert.ok(!JSON.stringify(env.DB.rows('controls')).includes(eventId));
});

test('late missing-subscriber webhook is not acknowledged when its value-free receipt cannot commit', async t => {
  const env=await fixture(t);
  env.DB.failNextBatch=true;
  const response=await handle(webhookRequest(env,'subscriber.unsubscribed'),env,
    async()=>Response.json({code:'not_found'},{status:404}));
  assert.equal(response.status,503);
  assert.equal(await control(env,'last_webhook_received_at'),null);
  assert.equal(await control(env,'last_ignored_missing_subscriber_event'),null);
  assert.equal(env.DB.rows('subscribers').length,0);
  assert.equal(env.DB.rows('lifecycle_events').length,0);
});

test('validated webhook event IDs deduplicate retries and preserve distinct undated unsubscribe cycles', async t => {
  const env = await fixture(t), value = input();
  await handle(signupRequest(value), env, providerCreate(value));
  let current = providerSubscriber(value, { type: 'unsubscribed', unsubscription_date: null });
  const provider = async () => Response.json(current);
  const firstId = 'ext_evt_' + 'a'.repeat(24), secondId = 'ext_evt_' + 'b'.repeat(24);
  assert.equal((await handle(webhookRequest(env, 'subscriber.unsubscribed', ID, { extra: { id: firstId } }), env, provider)).status, 200);
  assert.equal((await handle(webhookRequest(env, 'subscriber.unsubscribed', ID, { extra: { id: firstId } }), env, provider)).status, 200);
  current = { ...current, type: 'regular' };
  assert.equal((await handle(webhookRequest(env, 'subscriber.type.changed'), env, provider)).status, 200);
  current = { ...current, type: 'unsubscribed' };
  assert.equal((await handle(webhookRequest(env, 'subscriber.unsubscribed', ID, { extra: { id: secondId } }), env, provider)).status, 200);
  const events = env.DB.rows('lifecycle_events').filter(row => row.type === 'unsubscribed');
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(row => row.event_id).sort(), [firstId, secondId]);
  assert.ok(events.every(row => row.occurred_at === null && row.event_time_known === 0));
});

test('webhook D1 failure rolls back the event and returns failure for provider retry', async t => {
  const env = await fixture(t), value = input();
  await handle(signupRequest(value), env, providerCreate(value));
  env.DB.failNextBatch = true;
  const provider = async () => Response.json(providerSubscriber(value, { type: 'regular' }));
  assert.equal((await handle(webhookRequest(env, 'subscriber.confirmed'), env, provider)).status, 503);
  assert.equal(env.DB.rows('lifecycle_events').length, 0);
  assert.equal(env.DB.rows('subscribers')[0].status, 'unactivated');
  assert.equal((await handle(webhookRequest(env, 'subscriber.confirmed'), env, provider)).status, 200);
  assert.equal(env.DB.rows('lifecycle_events').length, 1);
});

test('provider accepted signup survives D1 failure and reconciliation repairs reserved reference', async t => {
  const env = await fixture(t), value = input();
  env.DB.failNextBatch = true;
  assert.equal((await handle(signupRequest(value), env, providerCreate(value))).status, 200);
  assert.equal(env.DB.rows('signups')[0].outcome, 'reserved');
  assert.equal(env.DB.rows('subscribers').length, 0);
  const provider = async () => Response.json({ results: [providerSubscriber(value, { type: 'regular' })], next: null });
  await reconcile(env, provider);
  const saved = env.DB.rows('signups')[0];
  assert.equal(saved.outcome, 'accepted');
  assert.equal(saved.is_new, 1);
  assert.equal(env.DB.rows('subscribers')[0].campaign_code, CODE);
  assert.ok(await control(env, 'last_reconciliation_success_at'));
});

test('timeout returns retry and retries use the same idempotency key and one reservation', async t => {
  const env = await fixture(t), value = input(), keys = [];
  const timeout = async (url, options) => { keys.push(options.headers['X-Idempotency-Key']); throw new DOMException('test-only timeout', 'AbortError'); };
  const response = await handle(signupRequest(value), env, timeout);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'retry_same_submission');
  assert.equal(keys.length, 3);
  assert.ok(keys.every(key => key === value.signup_ref));
  assert.equal((await handle(signupRequest(value), env, providerCreate(value))).status, 200);
  assert.equal(env.DB.rows('signups').length, 1);
});

test('minute admission and provider daily retry budgets are bounded', async t => {
  const env = await fixture(t, { MAX_SIGNUPS_PER_MINUTE: '1' }), first = input();
  await handle(signupRequest(first), env, providerCreate(first));
  assert.equal((await handle(signupRequest(input()), env, () => assert.fail('cap must block'))).status, 429);
  const limited = await fixture(t, { MAX_SIGNUPS_PER_DAY: '2' });
  let calls = 0;
  const response = await handle(signupRequest(input()), limited, async () => { calls++; throw new Error('network'); });
  assert.equal(response.status, 503);
  assert.equal(calls, 2);
});

test('failed later list page leaves existing active state and prior success receipt intact', async t => {
  const env = await fixture(t), value = input();
  await handle(signupRequest(value), env, providerCreate(value));
  const active = providerSubscriber(value, { type: 'regular' });
  await reconcile(env, async () => Response.json({ results: [active], next: null }), { now: new Date(Date.now() + 1000).toISOString() });
  const before = await control(env, 'last_reconciliation_success_at');
  let pages = 0;
  const failed = async () => {
    pages++;
    if (pages === 1) return Response.json({ results: [], next: API + 'subscribers?page=2' });
    return Response.json({ code: 'temporarily_unavailable' }, { status: 503, headers: { 'Retry-After': '10' } });
  };
  await assert.rejects(reconcile(env, failed, { now: new Date(Date.now() + 2000).toISOString() }));
  assert.equal(env.DB.rows('subscribers')[0].status, 'regular');
  assert.equal(await control(env, 'last_reconciliation_success_at'), before);
  assert.equal(env.DB.rows('runs').at(-1).status, 'failed');
});

test('baseline import paginates and leaves historical sources/test classification unknown', async t => {
  const env = await fixture(t);
  env.DB.sqlite.exec("DELETE FROM controls WHERE key='baseline'");
  let page = 0;
  const provider = async () => {
    page++;
    return Response.json({ results: [providerSubscriber(input(), { id: page === 1 ? ID : OTHER_ID, type: 'regular', creation_date: '2025-12-01T00:00:00Z', metadata: {} })], next: page === 1 ? API + 'subscribers?page=2' : null });
  };
  await reconcile(env, provider, { baseline: true });
  assert.equal(page, 2);
  assert.equal(env.DB.rows('subscribers').length, 2);
  assert.ok(env.DB.rows('subscribers').every(row => row.is_baseline === 1 && row.is_test === null && row.campaign_code === null));
  assert.equal(env.DB.rows('signups').length, 0);
  assert.equal((await control(env, 'baseline')).subscriber_count, 2);
  await assert.rejects(reconcile(env, provider, { baseline: true }));
});

test('baseline import promotes a row observed before baseline without inventing non-test classification', async t => {
  const env = await fixture(t), value = input();
  env.DB.sqlite.exec("DELETE FROM controls WHERE key='baseline'");
  const existing = providerSubscriber(value, { type: 'regular', metadata: {} });
  assert.equal((await handle(webhookRequest(env, 'subscriber.confirmed'), env, async () => Response.json(existing))).status, 200);
  assert.equal(env.DB.rows('subscribers')[0].is_baseline, 0);
  await reconcile(env, async () => Response.json({ results: [existing], next: null }), { baseline: true });
  assert.equal(env.DB.rows('subscribers')[0].is_baseline, 1);
  assert.equal(env.DB.rows('subscribers')[0].is_test, null);
  assert.equal(env.DB.rows('subscribers')[0].campaign_code, null);
  assert.equal(env.DB.rows('subscribers')[0].acquisition_signup_ref, null);
});

test('known test references propagate exclusion into private snapshot', async t => {
  const value = input(), env = await fixture(t, { TEST_SIGNUP_REFS: JSON.stringify([value.signup_ref]) });
  await handle(signupRequest(value), env, providerCreate(value));
  const exported = await snapshot(env);
  assert.equal(exported.signups[0].is_test, true);
  assert.equal(exported.subscribers[0].is_test, true);
  await handle(webhookRequest(env,'subscriber.confirmed',ID,{extra:{id:'ext_evt_'+'q'.repeat(24),private_field:'do-not-retain'}}),env,
    async()=>Response.json(providerSubscriber(value,{type:'regular'})));
  const contract=await control(env,'webhook_contract');
  assert.equal(contract['subscriber.confirmed'].signature_verified,true);
  assert.deepEqual(contract['subscriber.confirmed'].envelope.fields,{id:'string',event_type:'string',data:'object'});
  assert.equal(contract['subscriber.confirmed'].envelope.unknown_field_count,1);
  assert.ok(!JSON.stringify(contract).includes(value.email));
  assert.ok(!JSON.stringify(contract).includes(ID));
  assert.ok(!JSON.stringify(contract).includes('do-not-retain'));
  assert.ok((await snapshot(env)).health.webhook_contract);
});

test('webhook health checks configuration rather than assuming quiet delivery is healthy', async t => {
  const env = await fixture(t);
  const event_types = ['subscriber.confirmed', 'subscriber.created', 'subscriber.unsubscribed', 'subscriber.type.changed', 'subscriber.deleted'];
  const hook = { id: env.WEBHOOK_ID, url: env.WEBHOOK_URL, status: 'enabled', event_types };
  const successful = { status: 'successful', creation_date: new Date().toISOString(), completion_date: new Date().toISOString() };
  const healthy = await checkWebhookHealth(env, async url => Response.json({ results: url.endsWith('/attempts') ? [successful] : [hook], next: null }));
  assert.equal(healthy.status, 'enabled');
  assert.equal(healthy.recent_failed_attempts, 0);
  assert.equal(healthy.last_successful_delivery_at, successful.completion_date);
  assert.equal((await checkWebhookHealth(env, async () => Response.json({ results: [{ ...hook, status: 'disabled' }], next: null }))).status, 'missing_or_disabled');
  assert.equal((await checkWebhookHealth(env, async () => Response.json({ results: [], next: null }))).status, 'missing_or_disabled');
});

test('enabled webhook with recent delivery failures is unhealthy', async t => {
  const env = await fixture(t);
  const hook = { id: env.WEBHOOK_ID, url: env.WEBHOOK_URL, status: 'enabled',
    event_types: ['subscriber.confirmed', 'subscriber.created', 'subscriber.unsubscribed', 'subscriber.type.changed', 'subscriber.deleted'] };
  const attempt = { status: 'failed', creation_date: new Date().toISOString() };
  const health = await checkWebhookHealth(env, async url => Response.json({ results: url.endsWith('/attempts') ? [attempt] : [hook], next: null }));
  assert.equal(health.status, 'delivery_failures');
  assert.equal(health.recent_failed_attempts, 1);
  assert.equal((await control(env, 'webhook_health')).status, 'delivery_failures');
});

test('admin snapshot requires the private bearer token', async t => {
  const env = await fixture(t), url = 'https://attribution.example.invalid/admin/snapshot';
  assert.equal((await handle(new Request(url), env)).status, 401);
  assert.equal((await handle(new Request(url, { headers: { Authorization: 'Bearer ' + env.ADMIN_TOKEN } }), env)).status, 200);
});

async function oldAcquisition(t, overrides = {}) {
  const env=await fixture(t,{RETENTION_ENABLED:'true',...overrides}), value=input();
  await handle(signupRequest(value),env,providerCreate(value));
  const old='2026-06-02T12:00:00.000Z';
  env.DB.sqlite.prepare("UPDATE signups SET created_at=?,accepted_at=?").run(old,old);
  env.DB.sqlite.prepare("UPDATE subscribers SET acquisition_accepted_at=?,signup_at=?,state_observed_at=?,last_seen_at=?").run(old,old,old,old);
  return {env,value,old};
}

test('retention expires details while preserving acquisition cohort and late confirmation', async t => {
  const {env,value,old}=await oldAcquisition(t);
  const now='2026-10-15T10:00:00.000Z';
  const current=providerSubscriber(value,{type:'regular',creation_date:old});
  await reconcile(env,async()=>Response.json({results:[current],next:null}),{now});
  assert.equal(env.DB.rows('signups').length,0);
  assert.equal(env.DB.rows('subscribers')[0].acquisition_accepted_at,old);
  assert.equal(env.DB.rows('subscribers')[0].first_confirmation_observed_at,now);
  assert.equal(env.DB.rows('historical_aggregates').find(row=>row.metric==='expired_attempts_new').value,1);
  await retain(env,now);
  assert.equal(env.DB.rows('historical_aggregates').find(row=>row.metric==='expired_attempts_new').value,1);
  assert.ok((await snapshot(env)).aggregates);
  const replay=await handle(signupRequest(value),env,async(url,options)=>{
    assert.notEqual(options.method,'POST');
    return Response.json(current);
  });
  assert.equal(replay.status,200);
  assert.equal(env.DB.rows('signups').length,0);
  assert.equal(env.DB.rows('subscribers')[0].acquisition_accepted_at,old);
});

test('retention preserves unsubscribe membership and suppresses replay after event ID expiry', async t => {
  const {env,value,old}=await oldAcquisition(t);
  const current=providerSubscriber(value,{type:'unsubscribed',creation_date:old,unsubscription_date:null});
  await env.DB.batch(await subscriberStatements(env,current,'2026-06-05T12:00:00.000Z'));
  assert.equal(env.DB.rows('lifecycle_events').length,1);
  const now='2026-10-15T10:00:00.000Z';
  await reconcile(env,async()=>Response.json({results:[current],next:null}),{now});
  assert.equal(env.DB.rows('lifecycle_events').length,0);
  const facts=env.DB.rows('subscriber_week_facts');
  assert.equal(facts.length,1);
  assert.equal(facts[0].week_start,easternWeek('2026-06-05T12:00:00.000Z'));
  assert.equal(facts[0].unsubscribe_unknown,1);
  await handle(webhookRequest(env,'subscriber.unsubscribed',ID,{extra:{id:'ext_evt_'+'z'.repeat(24)}}),env,async()=>Response.json(current));
  assert.equal(env.DB.rows('lifecycle_events').length,0);
  assert.equal(env.DB.rows('subscriber_week_facts').length,1);
});

test('provider deletion anonymously preserves historical acquisition then removes every private lifecycle key', async t => {
  const {env,value}=await oldAcquisition(t);
  env.DB.sqlite.prepare("UPDATE subscribers SET status='regular',first_confirmation_observed_at=?").run('2026-06-03T12:00:00.000Z');
  await eventStatement(env,ID,'unsubscribed','2026-06-04T12:00:00.000Z','2026-06-04T12:00:01.000Z','test').run();
  await reconcile(env,async()=>Response.json({results:[],next:null}),{now:'2026-10-15T10:00:00.000Z'});
  for(const table of ['subscribers','signups','lifecycle_events','subscriber_week_facts']) assert.equal(env.DB.rows(table).length,0);
  const history=env.DB.rows('historical_aggregates');
  assert.equal(history.find(row=>row.metric==='accepted_new_signups').value,1);
  assert.equal(history.find(row=>row.metric==='eventual_confirmations_from_week_signups').value,1);
  assert.equal(history.find(row=>row.metric==='unsubscribers_this_week').value,1);
  assert.ok(!JSON.stringify(history).includes(ID));
  assert.ok(!JSON.stringify(history).includes(value.signup_ref));
  await reconcile(env,async()=>Response.json({results:[],next:null}),{now:'2026-10-16T10:00:00.000Z'});
  assert.equal(env.DB.rows('historical_aggregates').find(row=>row.metric==='accepted_new_signups').value,1);
});

test('retention deletion excludes known tests and unreviewed identities from conversion aggregates', async t => {
  for(const classification of [1,null]) {
    const {env}=await oldAcquisition(t);
    env.DB.sqlite.prepare('UPDATE subscribers SET is_test=?').run(classification);
    await reconcile(env,async()=>Response.json({results:[],next:null}),{now:'2026-10-15T10:00:00.000Z'});
    assert.equal(env.DB.rows('historical_aggregates').filter(row=>row.metric==='accepted_new_signups').length,0);
    assert.equal(env.DB.rows('historical_aggregates').find(row=>row.metric===(classification===1?'expired_attempts_test':'expired_attempts_unreviewed')).value,1);
  }
});

test('retention requires successful complete reconciliation and failed fetch preserves private state', async t => {
  const {env}=await oldAcquisition(t);
  await assert.rejects(retain(env,'2026-10-15T10:00:00.000Z'),/retention_requires_complete_reconciliation/);
  await assert.rejects(reconcile(env,async()=>Response.json({error:'test'},{status:503,headers:{'Retry-After':'10'}}),{now:'2026-10-15T10:00:00.000Z'}));
  assert.equal(env.DB.rows('signups').length,1);
  assert.equal(env.DB.rows('subscribers').length,1);
  assert.equal(env.DB.rows('historical_aggregates').length,0);
});

test('retention aggregate and deletion failure rolls back and retry cannot double count', async t => {
  const {env}=await oldAcquisition(t);
  env.DB.sqlite.prepare("UPDATE subscribers SET status='deleted',state_observed_at=?").run('2026-10-15T10:00:00.000Z');
  await putControl(env,'last_reconciliation_success_at','2026-10-15T10:00:00.000Z').run();
  env.DB.failNextBatch=true;
  await assert.rejects(retain(env,'2026-10-15T10:00:00.000Z'));
  assert.equal(env.DB.rows('historical_aggregates').length,0);
  assert.equal(env.DB.rows('subscribers').length,1);
  await retain(env,'2026-10-15T10:00:00.000Z');
  assert.equal(env.DB.rows('subscribers').length,0);
  assert.equal(env.DB.rows('historical_aggregates').find(row=>row.metric==='accepted_new_signups').value,1);
});

test('retention keeps an earlier unknown unsubscribe when a distinct later cycle has a date', async t => {
  const {env}=await oldAcquisition(t);
  env.DB.sqlite.prepare("INSERT INTO lifecycle_events VALUES(?,?,?,?,?,?,?)").run('cycle1',ID,'unsubscribed',null,'2026-06-05T12:00:00.000Z',0,'signed_webhook');
  env.DB.sqlite.prepare("INSERT INTO lifecycle_events VALUES(?,?,?,?,?,?,?)").run('cycle2',ID,'unsubscribed','2026-06-20T12:00:00.000Z','2026-06-20T12:00:01.000Z',1,'signed_webhook');
  await putControl(env,'last_reconciliation_success_at','2026-10-15T10:00:00.000Z').run();
  await retain(env,'2026-10-15T10:00:00.000Z');
  assert.equal(env.DB.rows('subscriber_week_facts').find(row=>row.week_start==='2026-05-30').unsubscribe_unknown,1);
  assert.equal(env.DB.rows('subscriber_week_facts').find(row=>row.week_start==='2026-06-20').unsubscribed,1);
});

test('stale retention summary cannot overwrite previously recorded weekly membership', async t => {
  const {env}=await oldAcquisition(t);
  env.DB.sqlite.prepare("INSERT INTO subscriber_week_facts(subscriber_id,week_start,unsubscribed,unsubscribe_unknown) VALUES(?,?,1,0)").run(ID,'2026-05-30');
  env.DB.sqlite.prepare("INSERT INTO lifecycle_events VALUES(?,?,?,?,?,?,?)").run('cycle-unknown',ID,'unsubscribed',null,'2026-06-05T12:00:00.000Z',0,'signed_webhook');
  await putControl(env,'last_reconciliation_success_at','2026-10-15T10:00:00.000Z').run();
  const prepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=sql=>{
    const command=prepare(sql);
    if(sql==='SELECT * FROM subscriber_week_facts WHERE subscriber_id=?') {
      return {bind(...values){return {...command.bind(...values),all:async()=>({results:[]})};}};
    }
    return command;
  };
  await retain(env,'2026-10-15T10:00:00.000Z');
  const fact=env.DB.rows('subscriber_week_facts')[0];
  assert.equal(fact.unsubscribed,1);
  assert.equal(fact.unsubscribe_unknown,1);
});

test('snapshot uses one transaction so retention cannot mix private rows with their anonymous replacements', async t => {
  const {env}=await oldAcquisition(t);
  const now='2026-10-15T10:00:00.000Z';
  env.DB.sqlite.prepare("UPDATE subscribers SET status='deleted',state_observed_at=?").run(now);
  await putControl(env,'last_reconciliation_success_at',now).run();
  const batch=env.DB.batch.bind(env.DB);
  let readBatches=0;
  env.DB.batch=async statements=>{
    const result=await batch(statements);
    if(statements.every(statement=>/^SELECT\b/.test(statement.sql))) {
      readBatches++;
      assert.equal(statements.length,7);
      await retain(env,now);
    }
    return result;
  };
  const exported=await snapshot(env);
  assert.equal(readBatches,1);
  assert.equal(exported.subscribers.length,1);
  assert.equal(exported.aggregates.historical.filter(row=>row.metric==='accepted_new_signups').length,0);
  assert.equal(env.DB.rows('subscribers').length,0);
  assert.equal(env.DB.rows('historical_aggregates').find(row=>row.metric==='accepted_new_signups').value,1);
});
