import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';

const origin = 'https://outsideinprint.org';
const catalog = {
  version: 1, catalogVersion: 'a'.repeat(64), generatedAt: '2026-10-14T20:00:00Z',
  items: [1, 2, 3].map(n => ({ id: '/essays/water-' + n + '/', title: 'Water and flooding ' + n,
    url: origin + '/essays/water-' + n + '/', type: 'essay', summary: 'Water scarcity and flooding in cities. How flood protection works.',
    readingTime: n + 2, topics: ['water'], tags: ['floods'], collectionSlugs: ['our-changing-world'], image: { src: '', alt: '' } })),
  collections: [{ id: 'our-changing-world', title: 'Our Changing World', url: origin + '/collections/our-changing-world/', itemIds: [1, 2, 3].map(n => '/essays/water-' + n + '/') }],
};
const payload = { message: 'water and flooding', action: 'search', history: [], seenIds: [], currentIds: [] };
async function fixture(overrides = {}, provider) {
  let calls = 0, catalogCalls = 0;
  const mf = new Miniflare({
    modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }], scriptPath: fileURLToPath(new URL('../src/index.js', import.meta.url)),
    compatibilityDate: '2026-07-30',
    durableObjects: { BOB_BUDGET: { className: 'BobBudget', useSQLite: true } },
    bindings: { ENVIRONMENT: 'production', CHAT_ENABLED: 'true', ALLOWED_ORIGINS: origin,
      CATALOG_URL: origin + '/companion-bob/catalog.json', OPENAI_API_KEY: 'test-only-not-a-real-key',
      IP_HASH_SECRET: 'test-only-salt-at-least-thirty-two-characters', ...overrides },
    outboundService: async request => {
      if (request.url === origin + '/companion-bob/catalog.json') { catalogCalls++; return Response.json(catalog); }
      assert.equal(request.url, 'https://api.openai.com/v1/responses', 'unexpected outbound URL');
      calls++;
      const body = await request.json();
      assert.equal(body.model, 'gpt-6-luna'); assert.equal(body.store, false);
      assert.equal(body.service_tier, 'default'); assert.equal(body.max_output_tokens, 500);
      if (provider) return provider(body);
      return Response.json({ status: 'completed', usage: { input_tokens: 1000, output_tokens: 70, total_tokens: 1070 },
        output: [{ type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: JSON.stringify({ clarification: '', recommendation_ids: catalog.items.map(x => x.id) }) }] }] });
    },
  });
  const request = (body = payload, ip = '192.0.2.1', options = {}) => mf.dispatchFetch('https://bob.test/api/bob/recommend', {
    method: 'POST', headers: { origin, 'content-type': 'application/json', 'CF-Connecting-IP': ip, ...options.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body), ...options,
  });
  return { mf, request, calls: () => calls, catalogCalls: () => catalogCalls };
}
test('real Workers runtime returns catalog links and version through durable admission/budget', async () => {
  const f = await fixture();
  try {
    const response = await f.request();
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.catalogVersion, catalog.catalogVersion);
    assert.equal(body.items.length, 3);
    assert.ok(body.items.every(item => catalog.items.some(x => x.id === item.id && x.url === item.url)));
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(f.calls(), 1);
    const status = await f.mf.dispatchFetch('https://bob.test/api/bob/status', { headers: { origin } });
    assert.equal((await status.json()).configured, true);
  } finally { await f.mf.dispose(); }
});
test('disabled and zero-budget services never dispatch an OpenAI request', async () => {
  for (const config of [{ CHAT_ENABLED: 'false' }, { MONTHLY_BUDGET_MICROUSD: '0' }]) {
    const f = await fixture(config);
    try {
      const response = await f.request(); const body = await response.json();
      assert.equal(body.code, config.CHAT_ENABLED ? 'service_disabled' : 'budget_exhausted');
      assert.equal(f.calls(), 0);
    } finally { await f.mf.dispose(); }
  }
});
test('untrusted origin, malformed/oversized bodies and public ledger paths fail before OpenAI', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request(payload, '192.0.2.1', { headers: { origin: 'https://evil.test', 'content-type': 'application/json' } })).status, 403);
    assert.equal((await f.request('{')).status, 400);
    assert.equal((await f.request({ message: 'x'.repeat(16384) })).status, 413);
    const internal = await f.mf.dispatchFetch('https://bob.test/reserve', { method: 'POST', headers: { origin }, body: '{}' });
    assert.equal(internal.status, 404);
    assert.equal(f.calls(), 0);
  } finally { await f.mf.dispose(); }
});
test('catalog mismatch refreshes once, then fails without a model call', async () => {
  const f = await fixture();
  try {
    const response = await f.request({ ...payload, catalogVersion: 'b'.repeat(64) });
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'catalog_changed');
    assert.equal(f.catalogCalls(), 2); assert.equal(f.calls(), 0);
  } finally { await f.mf.dispose(); }
});
test('temporary provider failures expose safe retry while quota exhaustion offers collections', async () => {
  for (const [status, error, retryable, code] of [[500, 'internal_error', true, 'service_unavailable'], [429, 'insufficient_quota', false, 'budget_exhausted']]) {
    const f = await fixture({}, () => Response.json({ error: { code: error, message: 'sensitive upstream detail' } }, { status, headers: { 'x-request-id': 'req_test' } }));
    try {
      const response = await f.request(); const body = await response.json();
      assert.equal(body.retryable, retryable); assert.equal(body.code, code);
      assert.equal(body.requestId, 'req_test'); assert.ok(!JSON.stringify(body).includes('sensitive'));
      assert.equal(f.calls(), 1);
    } finally { await f.mf.dispose(); }
  }
});
test('OpenAI project hard cap becomes non-retryable collection fallback in the Workers runtime', async () => {
  const f = await fixture({}, () => Response.json({ error: { code: 'project_spend_limit_exceeded', message: 'private billing detail' } }, { status: 429, headers: { 'x-request-id': 'req_project_cap' } }));
  try {
    const response = await f.request();
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.code, 'budget_exhausted');
    assert.equal(body.retryable, false);
    assert.match(body.error, /Pick a collection/);
    assert.equal(body.requestId, 'req_project_cap');
    assert.ok(!JSON.stringify(body).includes('private billing detail'));
    assert.equal(f.calls(), 1);
  } finally { await f.mf.dispose(); }
});
test('model-generated unknown links cannot escape canonical catalog validation', async () => {
  const f = await fixture({}, () => Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ clarification: '', recommendation_ids: ['https://evil.test/'] }) }] }] }));
  try {
    const response = await f.request(); assert.ok(response.status >= 500);
    assert.ok(!(await response.text()).includes('evil.test')); assert.equal(f.calls(), 1);
  } finally { await f.mf.dispose(); }
});
