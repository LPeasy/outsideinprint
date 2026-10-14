// USD accounting uses integer millionths of a dollar. Reserve before dispatch;
// release unused allowance only when the provider supplies valid usage.
export const MAX_PAYLOAD_BYTES = 65536;
export const OUTPUT_LIMIT = 500;
export function reserveCost(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bytes > MAX_PAYLOAD_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
  // One token per UTF-8 byte plus framing/schema allowance is deliberately high.
  // Cache-write pricing ($0.125/M) is higher than uncached input ($0.10/M).
  const inputBound = bytes + 4096;
  return { cost: Math.ceil(inputBound * 0.125 + OUTPUT_LIMIT * 0.5), inputBound };
}
export function usageCost(usage, reservation) {
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens)
      || usage.input_tokens < 0 || usage.output_tokens < 0
      || usage.input_tokens > reservation.inputBound || usage.output_tokens > OUTPUT_LIMIT) return null;
  return Math.ceil(usage.input_tokens * 0.125 + usage.output_tokens * 0.5);
}
const json = (body, status = 200) => Response.json(body, { status });
function cap(value, fallback) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1000000000) throw new Error('INVALID_BUDGET');
  return n;
}

export class BobBudget {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS buckets (id TEXT PRIMARY KEY, used INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY, cost INTEGER NOT NULL, input_bound INTEGER NOT NULL, day TEXT NOT NULL, month TEXT NOT NULL, expires INTEGER NOT NULL, settled INTEGER NOT NULL DEFAULT 0)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS limits_expiry ON limits(expires)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS reservation_expiry ON reservations(expires)');
  }
  first(query, ...args) { return this.sql.exec(query, ...args).toArray()[0]; }
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'invalid_request' }, 400); }
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const path = new URL(request.url).pathname;
    try {
      return this.ctx.storage.transactionSync(() => {
        this.sql.exec('DELETE FROM limits WHERE expires < ?', now);
        // Old reservations are never refunded automatically: unknown outcomes
        // remain charged to their original periods even after process restarts.
        this.sql.exec('DELETE FROM reservations WHERE expires < ?', now - 172800000);
        const oldest = new Date(now - 7776000000).toISOString();
        this.sql.exec("DELETE FROM buckets WHERE (id LIKE 'd:%' AND id < ?) OR (id LIKE 'm:%' AND id < ?)", 'd:' + oldest.slice(0, 10), 'm:' + oldest.slice(0, 7));
        if (path === '/admit') {
          if (!/^[a-f0-9]{64}$/.test(body.client ?? '')) return json({ error: 'invalid_client' }, 400);
          const minute = Math.floor(now / 60000);
          const checks = [
            ['g:' + minute, 60, (minute + 1) * 60000],
            ['v:' + body.client + ':' + minute, 6, (minute + 1) * 60000],
            ['d:' + body.client + ':' + day, 40, Date.parse(day + 'T00:00:00Z') + 86400000],
          ];
          for (const [id, max, expires] of checks) {
            if ((this.first('SELECT count FROM limits WHERE id = ?', id)?.count ?? 0) >= max)
              return json({ error: 'rate_limited', retryAfter: Math.max(1, Math.ceil((expires - now) / 1000)) }, 429);
          }
          for (const [id, , expires] of checks) this.sql.exec('INSERT INTO limits VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count = count + 1', id, expires);
          return json({ allowed: true });
        }
        if (path === '/reserve') {
          if (!Number.isSafeInteger(body.cost) || body.cost <= 0 || body.cost > 10000
              || !Number.isSafeInteger(body.inputBound) || body.inputBound <= 0 || body.inputBound > MAX_PAYLOAD_BYTES + 4096)
            return json({ error: 'invalid_reservation' }, 400);
          const daily = cap(this.env.DAILY_BUDGET_MICROUSD, 500000);
          const monthly = cap(this.env.MONTHLY_BUDGET_MICROUSD, 5000000);
          for (const [id, max] of [['d:' + day, daily], ['m:' + month, monthly]]) {
            if ((this.first('SELECT used FROM buckets WHERE id = ?', id)?.used ?? 0) + body.cost > max)
              return json({ error: 'budget_exhausted' }, 429);
          }
          if (this.first('SELECT COUNT(*) AS count FROM reservations WHERE settled != 1 AND expires > ?', now).count >= 4)
            return json({ error: 'busy', retryAfter: 15 }, 429);
          const id = crypto.randomUUID();
          for (const period of ['d:' + day, 'm:' + month]) this.sql.exec('INSERT INTO buckets VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET used = used + excluded.used', period, body.cost);
          this.sql.exec('INSERT INTO reservations VALUES (?, ?, ?, ?, ?, ?, 0)', id, body.cost, body.inputBound, day, month, now + 60000);
          return json({ id, cost: body.cost, inputBound: body.inputBound });
        }
        if (path === '/settle') {
          if (typeof body.id !== 'string') return json({ error: 'invalid_reservation' }, 400);
          const row = this.first('SELECT * FROM reservations WHERE id = ?', body.id);
          if (!row || row.settled) return json({ settled: true });
          const measured = usageCost(body.usage, { inputBound: row.input_bound });
          const refund = measured === null ? 0 : Math.max(0, row.cost - measured);
          if (refund) for (const period of ['d:' + row.day, 'm:' + row.month]) this.sql.exec('UPDATE buckets SET used = MAX(0, used - ?) WHERE id = ?', refund, period);
          // Unknown outcomes keep their active lease until it expires.
          if (measured !== null) this.sql.exec('UPDATE reservations SET settled = 1 WHERE id = ?', body.id);
          else this.sql.exec('UPDATE reservations SET settled = 2 WHERE id = ?', body.id);
          return json({ settled: true, reservedMicroUsd: row.cost, chargedMicroUsd: measured ?? row.cost });
        }
        return json({ error: 'not_found' }, 404);
      });
    } catch { return json({ error: 'budget_unavailable' }, 503); }
  }
}
