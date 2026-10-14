import test from 'node:test';
import assert from 'node:assert/strict';
import { callOpenAI, safeUsage, safeRequestId, MAX_RESPONSE_BYTES, API_URL } from '../src/transport.js';

const payload = { model: 'gpt-6-luna', store: false, input: 'private visitor text' };
test('single-attempt transport uses fixed HTTPS endpoint, bearer secret, no redirects', async () => {
  let calls = 0;
  const result = await callOpenAI(payload, { apiKey: 'offline-placeholder', fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, API_URL); assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.Authorization, 'Bearer offline-placeholder');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12, extra: 'secret' } }, { headers: { 'x-request-id': 'req-good' } });
  } });
  assert.equal(calls, 1); assert.equal(result.requestId, 'req-good');
  assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 2, total_tokens: 12 });
});

const quotaCodes = ['insufficient_quota', 'billing_hard_limit_reached', 'usage_limit_reached', 'project_spend_limit_exceeded', 'organization_spend_limit_exceeded', 'organization_usage_limit_exceeded', 'credit_balance_exhausted'];
for (const [status, providerCode, code, retryable] of [...quotaCodes.map(code => [429, code, 'quota_exceeded', false]), [429, 'rate_limit_exceeded', 'upstream_rate_limit', true], [401, '', 'authentication', false], [403, '', 'model_access', false], [404, '', 'model_access', false], [500, '', 'upstream_unavailable', true], [400, '', 'upstream_request', false], [302, '', 'upstream_request', false]]) {
  test(`HTTP ${status} ${providerCode} is classified without leaking provider detail or retrying`, async () => {
    let calls = 0;
    await assert.rejects(callOpenAI(payload, { apiKey: 'offline-placeholder', fetchImpl: async () => { calls++; return Response.json({ error: { code: providerCode, message: 'private provider detail offline-placeholder' } }, { status, headers: { 'x-request-id': 'req-error' } }); } }), error => error.code === code && error.retryable === retryable && error.requestId === 'req-error' && !error.message.includes('private provider detail'));
    assert.equal(calls, 1);
  });
}

test('deadline returns promptly even if a fetch implementation ignores abort', async () => {
  let signal, calls = 0;
  const started = Date.now();
  await assert.rejects(callOpenAI(payload, { apiKey: 'offline-placeholder', timeoutMs: 20, fetchImpl: (_, init) => { calls++; signal = init.signal; return new Promise(() => {}); } }), { code: 'timeout', status: 504 });
  assert.equal(calls, 1); assert.equal(signal.aborted, true); assert.ok(Date.now() - started < 1000);
});

test('caller cancellation aborts one request and pre-aborted signals never dispatch', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(callOpenAI(payload, { apiKey: 'offline-placeholder', signal: controller.signal, fetchImpl: () => calls++ }), { code: 'cancelled' });
  assert.equal(calls, 0);
  const active = new AbortController();
  const pending = callOpenAI(payload, { apiKey: 'offline-placeholder', signal: active.signal, fetchImpl: () => { calls++; return new Promise(() => {}); } });
  active.abort();
  await assert.rejects(pending, { code: 'cancelled' });
  assert.equal(calls, 1);
});

test('stream size and invalid JSON are bounded and safe', async () => {
  for (const [body, code] of [['x'.repeat(MAX_RESPONSE_BYTES + 1), 'invalid_response_size'], ['private bad JSON', 'invalid_response_json']]) {
    await assert.rejects(callOpenAI(payload, { apiKey: 'offline-placeholder', fetchImpl: async () => new Response(body, { headers: { 'x-request-id': 'req-bad' } }) }), error => error.code === code && error.requestId === 'req-bad' && !error.message.includes('private'));
  }
});

test('unknown network errors and metadata are sanitized', async () => {
  const records = [];
  await assert.rejects(callOpenAI(payload, { apiKey: 'offline-placeholder', diagnostic: value => records.push(value), fetchImpl: async () => { throw new Error('private URL or key'); } }), { code: 'connection' });
  assert.equal(records.length, 1);
  assert.ok(!JSON.stringify(records).includes('private'));
  assert.equal(safeRequestId('req\nmalicious'), null);
  assert.equal(safeUsage({ input_tokens: true, output_tokens: -1, total_tokens: Infinity }), null);
  assert.deepEqual(safeUsage({ input_tokens: 3.5, output_tokens: 0 }), { output_tokens: 0 });
});

test('missing API configuration does not dispatch', async () => {
  let calls = 0;
  await assert.rejects(callOpenAI(payload, { fetchImpl: () => calls++ }), { code: 'not_configured' });
  assert.equal(calls, 0);
});
