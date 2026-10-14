import { recommend, MODEL } from './recommender.js';
import { BobBudget, reserveCost } from './budget.js';
import { loadCatalog, readBounded } from './catalog.js';
import { BobError, safeRequestId } from './transport.js';
export { BobBudget };

const errors = {
  service_disabled: "Bob's chat is resting. Pick a collection to keep browsing.",
  budget_exhausted: "Bob's chat has reached its reading allowance. Pick a collection to keep browsing.",
  rate_limited: 'A few too many requests. Please wait a little, or browse a collection.',
  busy: 'Bob is helping other readers. Try again shortly, or browse a collection.',
  catalog_changed: 'The reading catalog has just changed. Please try your request again.',
  catalog_unavailable: 'The reading catalog is temporarily unavailable. Please try again shortly.',
  service_unavailable: 'Bob could not finish that request. Please try again shortly.',
  invalid_request: 'Please edit your request and try again.',
  body_too_large: 'That request is a little long. Please shorten it and try again.',
  timeout: 'Bob took too long to reply. Please try again or edit your request.',
  connection: 'Bob could not reach the reading service. Please try again shortly.',
  model_refusal: 'Bob could not help with that request. Try another reading subject.',
  model_access: 'Bob’s reading service needs attention. Please browse a collection for now.',
  authentication: 'Bob’s reading service needs attention. Please browse a collection for now.',
  cancelled: 'The reading request was cancelled.',
};
function failure(code, status, extra = {}) {
  const retryable = ['rate_limited', 'busy', 'catalog_changed', 'catalog_unavailable', 'service_unavailable', 'timeout', 'connection'].includes(code);
  return Response.json({ error: errors[code] ?? errors.service_unavailable, code, retryable, ...extra }, { status });
}
function localRequest(request, env) {
  return env.ENVIRONMENT === 'local' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);
}
function allowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const origins = String(env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.includes(origin)) return null;
  try {
    const url = new URL(origin);
    if (url.origin !== origin) return null;
    if (url.protocol !== 'https:' && !(localRequest(request, env) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null;
  } catch { return null; }
  return origin;
}
async function clientHash(request, env) {
  const ip = localRequest(request, env) ? 'local-review' : request.headers.get('CF-Connecting-IP');
  if (!ip || !env.IP_HASH_SECRET || env.IP_HASH_SECRET.length < 32) throw new Error('MISSING_CLIENT_CONFIG');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.IP_HASH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(new Date().toISOString().slice(0, 10) + ':' + ip));
  return [...new Uint8Array(signature)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function ledger(env, path, value) {
  if (!env.BOB_BUDGET) throw new Error('MISSING_BUDGET');
  // One stable object coordinates all clients and isolates. Never include a
  // version/date/client in its name: doing so would silently reset the budget.
  const stub = env.BOB_BUDGET.get(env.BOB_BUDGET.idFromName('bob-production-budget-v1'));
  const response = await stub.fetch('https://budget.internal' + path, { method: 'POST', body: JSON.stringify(value) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error('BUDGET_REJECTED');
    error.publicCode = ['rate_limited', 'budget_exhausted', 'busy'].includes(result.error) ? result.error : 'service_unavailable';
    error.httpStatus = response.status; error.retryAfter = result.retryAfter;
    throw error;
  }
  return result;
}
export async function handle(request, env, ctx, dependencies = {}) {
  const origin = allowedOrigin(request, env);
  const path = new URL(request.url).pathname;
  if (!origin) return failure('invalid_request', 403);
  let result;
  try {
    if (request.method === 'OPTIONS') {
      result = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } });
    } else if (path === '/api/bob/status' && request.method === 'GET') {
      const enabled = env.CHAT_ENABLED === 'true';
      const configured = enabled && Boolean(env.OPENAI_API_KEY && env.IP_HASH_SECRET?.length >= 32 && env.BOB_BUDGET && env.CATALOG_URL);
      result = Response.json({ enabled, configured, model: MODEL, collectionsAvailable: true });
    } else if (path !== '/api/bob/recommend') result = failure('invalid_request', 404);
    else if (request.method !== 'POST') result = failure('invalid_request', 405);
    else if (env.CHAT_ENABLED !== 'true') result = failure('service_disabled', 503);
    else if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) result = failure('invalid_request', 415);
    else {
      let body;
      try { body = JSON.parse(await readBounded(request, 16384)); }
      catch (error) { return withHeaders(failure(error.message === 'BODY_TOO_LARGE' ? 'body_too_large' : 'invalid_request', error.message === 'BODY_TOO_LARGE' ? 413 : 400), origin); }
      if (!body || Array.isArray(body) || typeof body !== 'object') return withHeaders(failure('invalid_request', 400), origin);
      await ledger(env, '/admit', { client: await clientHash(request, env) });
      let catalog;
      try {
        catalog = await loadCatalog(env, dependencies.catalogFetch);
        if (body.catalogVersion && body.catalogVersion !== catalog.catalogVersion) catalog = await loadCatalog(env, dependencies.catalogFetch, true);
      } catch { return withHeaders(failure('catalog_unavailable', 503), origin); }
      if (body.catalogVersion && body.catalogVersion !== catalog.catalogVersion) return withHeaders(failure('catalog_changed', 409), origin);
      delete body.catalogVersion;
      if (!env.OPENAI_API_KEY) return withHeaders(failure('service_unavailable', 503), origin);
      const response = await recommend(body, catalog, {
        apiKey: env.OPENAI_API_KEY,
        signal: request.signal,
        fetchImpl: dependencies.openaiFetch,
        beforeUpstream: payload => ledger(env, '/reserve', reserveCost(payload)),
        afterUpstream: async ({ reservation, usage, dispatched }) => {
          if (!reservation?.id) return;
          // A failed settlement retains the original upper-bound charge.
          try { await ledger(env, '/settle', { id: reservation.id, usage: dispatched ? usage : { input_tokens: 0, output_tokens: 0 } }); }
          catch { console.warn(JSON.stringify({ event: 'bob_settlement_failed' })); }
        },
        diagnostic: value => {
          // Allowlist aggregate fields only; never record visitor text or links.
          console.info(JSON.stringify({ event: 'bob_request', code: value?.code ?? 'complete' }));
        },
      });
      result = Response.json({ ...response, catalogVersion: catalog.catalogVersion });
    }
  } catch (error) {
    const trusted = error instanceof BobError;
    const code = error.publicCode ?? (trusted && error.code === 'quota_exceeded' ? 'budget_exhausted' : (trusted && Object.hasOwn(errors, error.code) ? error.code : (error.status === 400 ? 'invalid_request' : 'service_unavailable')));
    const status = error.httpStatus ?? (trusted && [400, 422, 429, 499, 502, 503, 504].includes(error.status) ? error.status : 503);
    const extra = trusted ? { requestId: safeRequestId(error.requestId), ...(error.publicCode ? {} : { retryable: Boolean(error.retryable) }) } : {};
    if (['budget_exhausted', 'service_disabled'].includes(code)) extra.retryable = false;
    result = failure(code, status, extra);
    if (error.retryAfter) result.headers.set('Retry-After', String(error.retryAfter));
  }
  return withHeaders(result, origin);
}
function withHeaders(response, origin) {
  const headers = new Headers(response.headers);
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, headers });
}
export default { fetch: handle };
