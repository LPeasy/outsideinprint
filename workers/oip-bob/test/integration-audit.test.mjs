import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { BobBudget } from '../src/budget.js';

const gatewayScript = fileURLToPath(new URL('./fixtures/budget-gateway.js', import.meta.url));
const gatewaySource = `export default {fetch(request, env) {return env.BOB_BUDGET.get(env.BOB_BUDGET.idFromName('bob-production-budget-v1')).fetch(request);}};`;
function runtime(bindings, persist) {
  return new Miniflare({
    ...(persist ? { durableObjectsPersist: persist } : {}),
    workers: [
      { name: 'ledger', modules: true, scriptPath: gatewayScript, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }], compatibilityDate: '2026-07-30', bindings,
        durableObjects: { BOB_BUDGET: { className: 'BobBudget', useSQLite: true } } },
      ...['gateway-a', 'gateway-b'].map(name => ({ name, modules: true, script: gatewaySource, compatibilityDate: '2026-07-30',
        durableObjects: { BOB_BUDGET: { className: 'BobBudget', scriptName: 'ledger', useSQLite: true } } })),
    ],
  });
}
async function invoke(fetcher, route, body) {
  const url = 'https://ledger.test' + route;
  const init = { method: 'POST', body: JSON.stringify(body) };
  // Miniflare's undici Request realm differs from Node's built-in Request.
  const response = fetcher instanceof BobBudget ? await fetcher.fetch(new Request(url, init)) : await fetcher.fetch(url, init);
  return { status: response.status, body: await response.json() };
}
function sqliteState() {
  const db = new DatabaseSync(':memory:');
  return { db, storage: {
    sql: { exec(query, ...args) { const statement = db.prepare(query); const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []); return { toArray: () => rows }; } },
    transactionSync(fn) { db.exec('BEGIN'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } },
  } };
}

test('two actual Worker isolates cannot exceed one shared durable allowance', async () => {
  const mf = runtime({ DAILY_BUDGET_MICROUSD: '1000', MONTHLY_BUDGET_MICROUSD: '1000' });
  try {
    const a = await mf.getWorker('gateway-a'), b = await mf.getWorker('gateway-b');
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => invoke(i % 2 ? a : b, '/reserve', { cost: 600, inputBound: 4000 })));
    assert.equal(results.filter(value => value.status === 200).length, 1);
    assert.equal(results.filter(value => value.body.error === 'budget_exhausted').length, 11);
  } finally { await mf.dispose(); }
});

test('budget charges survive actual workerd shutdown and restart with persisted SQLite', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'oip-bob-audit-'));
  const env = { DAILY_BUDGET_MICROUSD: '600', MONTHLY_BUDGET_MICROUSD: '600' };
  let mf = runtime(env, directory);
  try {
    const first = await invoke(await mf.getWorker('gateway-a'), '/reserve', { cost: 600, inputBound: 4000 });
    assert.equal(first.status, 200);
    await invoke(await mf.getWorker('gateway-a'), '/settle', { id: first.body.id, usage: null });
    await mf.dispose(); mf = runtime(env, directory);
    const second = await invoke(await mf.getWorker('gateway-b'), '/reserve', { cost: 1, inputBound: 4 });
    assert.equal(second.body.error, 'budget_exhausted');
  } finally {
    await mf.dispose();
    // Remove only this test's fresh, resolved temporary directory.
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('oip-bob-audit-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('UTC daily reset keeps monthly charges and does not depend on local timezone', async t => {
  const ctx = sqliteState(); let now = Date.parse('2026-10-14T23:59:59.999Z');
  t.mock.method(Date, 'now', () => now);
  const budget = new BobBudget(ctx, { DAILY_BUDGET_MICROUSD: '600', MONTHLY_BUDGET_MICROUSD: '1000' });
  try {
    assert.equal((await invoke(budget, '/reserve', { cost: 600, inputBound: 4000 })).status, 200);
    now = Date.parse('2026-10-15T00:00:00.000Z');
    assert.equal((await invoke(budget, '/reserve', { cost: 400, inputBound: 2000 })).status, 200);
    assert.equal((await invoke(budget, '/reserve', { cost: 1, inputBound: 4 })).body.error, 'budget_exhausted');
    assert.deepEqual(Object.fromEntries(ctx.db.prepare('SELECT id, used FROM buckets').all().map(row => [row.id, row.used])), { 'd:2026-10-14': 600, 'm:2026-10': 1000, 'd:2026-10-15': 400 });
  } finally { ctx.db.close(); }
});

test('UTC month rollover starts new allowance; late settlement refunds the original periods only', async t => {
  const ctx = sqliteState(); let now = Date.parse('2026-10-31T23:59:59.999Z');
  t.mock.method(Date, 'now', () => now);
  const budget = new BobBudget(ctx, { DAILY_BUDGET_MICROUSD: '600', MONTHLY_BUDGET_MICROUSD: '600' });
  try {
    const previous = await invoke(budget, '/reserve', { cost: 600, inputBound: 4000 });
    assert.equal(previous.status, 200);
    now = Date.parse('2026-11-01T00:00:00.000Z');
    assert.equal((await invoke(budget, '/reserve', { cost: 600, inputBound: 4000 })).status, 200);
    await invoke(budget, '/settle', { id: previous.body.id, usage: { input_tokens: 1000, output_tokens: 100 } });
    const values = Object.fromEntries(ctx.db.prepare('SELECT id, used FROM buckets').all().map(row => [row.id, row.used]));
    assert.deepEqual(values, { 'd:2026-10-31': 175, 'm:2026-10': 175, 'd:2026-11-01': 600, 'm:2026-11': 600 });
    assert.equal((await invoke(budget, '/reserve', { cost: 1, inputBound: 4 })).body.error, 'budget_exhausted');
  } finally { ctx.db.close(); }
});
