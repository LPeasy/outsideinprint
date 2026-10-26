const MAX_BODY_BYTES = 16 * 1024;
const SUBSCRIBER_ID = /^(?:sub_[a-z0-9]{20,40}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const encoder = new TextEncoder();

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return NaN;
  return Date.parse(value);
}

function configured(env) {
  return Boolean(env.DB && env.NEWSLETTER_ID && env.BUTTONDOWN_API_KEY && env.RESEND_API_KEY
    && typeof env.WEBHOOK_SIGNING_KEY === 'string' && env.WEBHOOK_SIGNING_KEY.length >= 32
    && Number.isFinite(date(env.WELCOME_CUTOVER_AT)) && NAME.test(env.RESEND_EVENT_NAME ?? '')
    && NAME.test(env.WELCOME_SEQUENCE_VERSION ?? '')
    && (!env.TEST_SUBSCRIBER_ID || SUBSCRIBER_ID.test(env.TEST_SUBSCRIBER_ID)));
}

async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw new Error('body_too_large');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('body_too_large'); }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function signed(bytes, header, secret) {
  if (!/^sha256=[a-f0-9]{64}$/.test(header ?? '') || typeof secret !== 'string' || secret.length < 32) return false;
  const signature = Uint8Array.from(header.slice(7).match(/../g), pair => parseInt(pair, 16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, signature, bytes);
}

async function administrator(request, env) {
  if (typeof env.ADMIN_TOKEN !== 'string' || env.ADMIN_TOKEN.length < 32) return false;
  const supplied = request.headers.get('Authorization') ?? '';
  if (supplied.length > 512) return false;
  const digest = value => crypto.subtle.digest('SHA-256', encoder.encode(value));
  const [actual, expected] = await Promise.all([digest(supplied), digest(`Bearer ${env.ADMIN_TOKEN}`)]);
  const a = new Uint8Array(actual), b = new Uint8Array(expected);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function currentSubscriber(id, env, fetcher) {
  // Never follow redirects with credentials or put an email in the request URL.
  const response = await fetcher(`https://api.buttondown.com/v1/subscribers/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Token ${env.BUTTONDOWN_API_KEY}`, 'Buttondown-Context': env.NEWSLETTER_ID, 'X-API-Version': '2026-04-01' },
    redirect: 'manual', signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Error('buttondown_unavailable');
  const value = await response.json();
  if (value?.id !== id) throw new Error('buttondown_invalid_response');
  return value;
}

function eligible(subscriber, env, now) {
  if (!subscriber || subscriber.type !== 'regular') return false;
  const created = date(subscriber.creation_date);
  // Existing pending records, imports, and malformed/future dates never backfill.
  if (!Number.isFinite(created) || created < date(env.WELCOME_CUTOVER_AT) || created > now) return false;
  if (subscriber.subscriber_import_id || subscriber.source === 'import') return false;
  return typeof subscriber.email_address === 'string' && subscriber.email_address.length <= 254
    && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(subscriber.email_address);
}

async function bindCutover(env) {
  const cutover = new Date(date(env.WELCOME_CUTOVER_AT)).toISOString();
  await env.DB.prepare('INSERT INTO welcome_config (id, cutover_at) VALUES (1, ?) ON CONFLICT(id) DO NOTHING').bind(cutover).run();
  const stored = await env.DB.prepare('SELECT cutover_at FROM welcome_config WHERE id = 1').first();
  if (stored?.cutover_at !== cutover) throw new Error('cutover_mismatch');
}

async function sendEvent(subscriber, enrollment, env, fetcher) {
  // The events endpoint does not document an idempotency key. Never retry this POST.
  try {
    const response = await fetcher('https://api.resend.com/events/send', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: enrollment.event_name, email: subscriber.email_address,
        payload: { enrollment_ref: enrollment.enrollment_ref, sequence_version: enrollment.sequence_version } }),
    });
    if (response.status >= 400 && response.status < 500 && response.status !== 408) {
      return { state: 'rejected', code: `resend_http_${response.status}` };
    }
    if (!response.ok) return { state: 'uncertain', code: 'resend_response_uncertain' };
    const body = await response.json();
    if (body?.object !== 'event' || body.event !== enrollment.event_name) return { state: 'uncertain', code: 'resend_response_invalid' };
    return { state: 'accepted', code: null };
  } catch {
    // Discard exceptions and provider bodies: they can contain credentials or email.
    return { state: 'uncertain', code: 'resend_request_uncertain' };
  }
}

async function webhook(request, env, fetcher, now) {
  let bytes;
  try { bytes = await readBody(request); } catch { return json({ error: 'invalid_body' }, 413); }
  if (!(await signed(bytes, request.headers.get('X-Buttondown-Signature'), env.WEBHOOK_SIGNING_KEY))) return json({ error: 'invalid_signature' }, 401);
  let payload;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return json({ error: 'invalid_json' }, 400); }
  if (payload?.event_type !== 'subscriber.confirmed') return json({ status: 'ignored' });
  // Buttondown's current webhook preview omits newsletter. The dedicated signing
  // key and canonical GET's Buttondown-Context bind this handler to its newsletter.
  if ((payload.data?.newsletter !== undefined && payload.data.newsletter !== env.NEWSLETTER_ID)
    || !SUBSCRIBER_ID.test(payload.data?.subscriber ?? '')) return json({ error: 'invalid_event' }, 400);
  if (env.WELCOME_ENABLED !== 'true') return json({ status: 'disabled' });
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  const id = payload.data.subscriber;
  if (env.TEST_SUBSCRIBER_ID && id !== env.TEST_SUBSCRIBER_ID) return json({ status: 'test_only' });

  let enrollment;
  let subscriber;
  try {
    await bindCutover(env);
    enrollment = await env.DB.prepare('SELECT * FROM welcome_enrollments WHERE subscriber_id = ?').bind(id).first();
    if (enrollment && enrollment.state !== 'pending') return json({ status: 'already_reserved' });
    subscriber = await currentSubscriber(id, env, fetcher);
    if (!eligible(subscriber, env, now)) return json({ status: 'ineligible' });
    const at = new Date(now).toISOString();
    await env.DB.prepare(`INSERT INTO welcome_enrollments
      (subscriber_id, enrollment_ref, sequence_version, event_name, subscriber_created_at, observed_at, state)
      VALUES (?, ?, ?, ?, ?, ?, 'pending') ON CONFLICT(subscriber_id) DO NOTHING`)
      .bind(id, crypto.randomUUID(), env.WELCOME_SEQUENCE_VERSION, env.RESEND_EVENT_NAME, subscriber.creation_date, at).run();
    // Atomic durable reservation precedes the side effect, including under concurrent webhooks.
    enrollment = await env.DB.prepare(`UPDATE welcome_enrollments SET state = 'dispatching', attempted_at = ?
      WHERE subscriber_id = ? AND state = 'pending' RETURNING *`).bind(at, id).first();
    if (!enrollment) return json({ status: 'already_reserved' });
  } catch {
    // Before any POST is attempted, a Buttondown webhook retry is safe.
    return json({ error: 'preparation_failed' }, 503);
  }

  const result = await sendEvent(subscriber, enrollment, env, fetcher);
  try {
    await env.DB.prepare(`UPDATE welcome_enrollments SET state = ?, finished_at = ?, error_code = ?
      WHERE subscriber_id = ? AND state = 'dispatching'`)
      .bind(result.state, new Date(now).toISOString(), result.code, id).run();
  } catch {
    // Keep dispatching permanently reserved if result storage fails. Never replay the POST.
    return json({ status: 'review_required' });
  }
  return json({ status: result.state === 'accepted' ? 'accepted' : 'review_required' });
}

export async function handleRequest(request, env, { fetcher = fetch, now = Date.now() } = {}) {
  const { pathname } = new URL(request.url);
  try {
    if (pathname === '/health' && request.method === 'GET') return json({ service: 'oip-welcome', enabled: env.WELCOME_ENABLED === 'true', configured: configured(env) });
    if (pathname === '/admin/status' && request.method === 'GET') {
      if (!(await administrator(request, env))) return json({ error: 'unauthorized' }, 401);
      const { results } = await env.DB.prepare('SELECT state, COUNT(*) AS count FROM welcome_enrollments GROUP BY state').all();
      const counts = Object.fromEntries(results.map(row => [row.state, row.count]));
      return json({ enabled: env.WELCOME_ENABLED === 'true', configured: configured(env), test_only: Boolean(env.TEST_SUBSCRIBER_ID),
        counts, review_required: ['pending', 'dispatching', 'uncertain', 'rejected'].some(state => counts[state] > 0) });
    }
    if (pathname === '/webhooks/buttondown' && request.method === 'POST') return await webhook(request, env, fetcher, now);
    return json({ error: 'not_found' }, 404);
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
}

export default { fetch: handleRequest };
