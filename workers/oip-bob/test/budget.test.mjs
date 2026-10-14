import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { BobBudget, reserveCost, usageCost } from '../src/budget.js';

export function state() {
  const db = new DatabaseSync(':memory:');
  return { db, storage: {
    sql: { exec(query, ...args) {
      const statement = db.prepare(query);
      const values = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
      return { toArray: () => values };
    } },
    transactionSync(callback) {
      db.exec('BEGIN');
      try { const value = callback(); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  } };
}
async function call(budget, path, body) {
  const result = await budget.fetch(new Request('https://internal' + path, { method: 'POST', body: JSON.stringify(body) }));
  return { status: result.status, body: await result.json() };
}
test('UTF-8 full-payload reservation covers framing, rejects oversize and unknown usage', () => {
  const payload = { input: '你好'.repeat(40), text: { format: { schema: 'schema' } } };
  const reservation = reserveCost(payload);
  assert.ok(reservation.inputBound > JSON.stringify(payload).length + 4096);
  assert.ok(reservation.cost >= usageCost({ input_tokens: reservation.inputBound, output_tokens: 500 }, reservation));
  assert.equal(usageCost(null, reservation), null);
  assert.equal(usageCost({ input_tokens: 10, output_tokens: 501 }, reservation), null);
  assert.equal(usageCost({ input_tokens: 1.5, output_tokens: 2 }, reservation), null);
  assert.throws(() => reserveCost({ input: 'a'.repeat(65536) }), /PAYLOAD_TOO_LARGE/);
});
test('concurrent reservations cannot overspend the shared daily allowance', async () => {
  const ctx = state(); const budget = new BobBudget(ctx, { DAILY_BUDGET_MICROUSD: '1000', MONTHLY_BUDGET_MICROUSD: '9000' });
  const results = await Promise.all(Array.from({ length: 10 }, () => call(budget, '/reserve', { cost: 600, inputBound: 4000 })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.body.error === 'budget_exhausted').length, 9);
  assert.ok(ctx.db.prepare('SELECT used FROM buckets').all().every(r => r.used === 600)); ctx.db.close();
});
test('monthly limit survives object recreation and zero budget disables paid requests', async () => {
  const ctx = state(), env = { DAILY_BUDGET_MICROUSD: '9000', MONTHLY_BUDGET_MICROUSD: '600' };
  assert.equal((await call(new BobBudget(ctx, env), '/reserve', { cost: 600, inputBound: 4000 })).status, 200);
  assert.equal((await call(new BobBudget(ctx, env), '/reserve', { cost: 1, inputBound: 4 })).body.error, 'budget_exhausted');
  assert.equal((await call(new BobBudget(ctx, { ...env, DAILY_BUDGET_MICROUSD: '0' }), '/reserve', { cost: 1, inputBound: 4 })).body.error, 'budget_exhausted'); ctx.db.close();
});
test('known usage refunds once; unknown or oversized usage retains full reservation', async () => {
  const ctx = state(), budget = new BobBudget(ctx, {});
  const a = (await call(budget, '/reserve', { cost: 1000, inputBound: 6000 })).body;
  const measured = await call(budget, '/settle', { id: a.id, usage: { input_tokens: 1000, output_tokens: 100 } });
  assert.equal(measured.body.chargedMicroUsd, 175);
  await call(budget, '/settle', { id: a.id, usage: { input_tokens: 0, output_tokens: 0 } });
  assert.ok(ctx.db.prepare('SELECT used FROM buckets').all().every(r => r.used === 175));
  const b = (await call(budget, '/reserve', { cost: 1000, inputBound: 6000 })).body;
  await call(budget, '/settle', { id: b.id, usage: null });
  await call(budget, '/settle', { id: b.id, usage: { input_tokens: 0, output_tokens: 0 } });
  assert.ok(ctx.db.prepare('SELECT used FROM buckets').all().every(r => r.used === 1175)); ctx.db.close();
});
test('unknown calls hold all four active leases and cannot be refunded by expiry', async () => {
  const ctx = state(), budget = new BobBudget(ctx, {});
  for (let i = 0; i < 4; i++) {
    const r = (await call(budget, '/reserve', { cost: 1000, inputBound: 6000 })).body;
    await call(budget, '/settle', { id: r.id, usage: null });
  }
  assert.equal((await call(budget, '/reserve', { cost: 1000, inputBound: 6000 })).body.error, 'busy');
  ctx.db.prepare('UPDATE reservations SET expires = ?').run(Date.now() - 1);
  assert.equal((await call(budget, '/reserve', { cost: 1000, inputBound: 6000 })).status, 200);
  assert.ok(ctx.db.prepare('SELECT used FROM buckets').all().every(r => r.used === 5000)); ctx.db.close();
});
test('visitor and global admission limits apply without storing raw IP or prompts', async () => {
  const ctx = state(), budget = new BobBudget(ctx, {}), client = 'a'.repeat(64);
  for (let i = 0; i < 6; i++) assert.equal((await call(budget, '/admit', { client })).status, 200);
  assert.equal((await call(budget, '/admit', { client })).body.error, 'rate_limited');
  assert.equal((await call(budget, '/admit', { client: 'raw-ip' })).status, 400);
  assert.equal((await call(budget, '/admit', { client: 'b'.repeat(64) })).status, 200);
  assert.ok(ctx.db.prepare('SELECT id FROM limits').all().every(r => !r.id.includes('raw-ip'))); ctx.db.close();
});
