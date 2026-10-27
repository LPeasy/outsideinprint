// Prepared integration. The example config cannot receive or dispatch real leads.
const encoder = new TextEncoder();
const META_ID = /^[1-9][0-9]{3,29}$/;
const CODE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SUBSCRIBER_ID = /^(?:sub_[0-7][0-9a-hjkmnp-tv-z]{25}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/;
const NEWSLETTER_ID = /^(?:news_[0-7][0-9a-hjkmnp-tv-z]{25}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/;
const MAX_BYTES = 32 * 1024;
const HOUR = 3_600_000;
const MAX_LEAD_AGE = 7 * 24 * HOUR;
const OWNED_TEST_AD = 'owned-test';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const iso = value => new Date(value).toISOString();
const validDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const validMetaDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:?\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const secret = value => typeof value === 'string' && value.length >= 32;

function forms(env) {
  const rows = JSON.parse(env.APPROVED_FORMS_JSON || '[]');
  if (!Array.isArray(rows) || rows.length > 4) throw new Error('invalid_registry');
  const seen = new Set();
  for (const row of rows) {
    if (!META_ID.test(row.formId) || seen.has(row.formId) || !CODE.test(row.campaignCode)
      || !CODE.test(row.consentVersion) || typeof row.consentCheckboxKey !== 'string'
      || row.consentCheckboxKey.length < 1 || row.consentCheckboxKey.length > 160
      || !['true', '1', 'yes', true].includes(row.consentCheckedValue)
      || !Array.isArray(row.adIds) || !row.adIds.length || row.adIds.length > 4
      || row.adIds.some(id => !META_ID.test(id)) || !validDate(row.startsAt) || !validDate(row.endsAt)
      || Date.parse(row.startsAt) >= Date.parse(row.endsAt)) throw new Error('invalid_registry');
    seen.add(row.formId);
  }
  return rows;
}

// Private, expiring exception for one owner-approved Meta test. A test lead has
// no canonical ad_id. Production forms still require exact numeric paid-ad IDs.
function ownedTest(env, now) {
  if (!env.OWNED_TEST_JSON) return null;
  const row = JSON.parse(env.OWNED_TEST_JSON);
  const probe = row?.allowNewLead === true && row.dispatchAllowed === false;
  if (!row || row.pageId !== env.META_PAGE_ID || (!META_ID.test(row.leadId) && !probe) || !META_ID.test(row.formId)
    || ![undefined, false, true].includes(row.allowNewLead) || ![undefined, false, true].includes(row.dispatchAllowed)
    || (row.allowNewLead === true && !probe)
    || !validDate(row.createdAt) || !validDate(row.expiresAt)
    || Date.parse(row.expiresAt) <= Date.parse(row.createdAt)
    || Date.parse(row.expiresAt) > Date.parse(row.createdAt) + 24 * HOUR
    || !/^[a-f0-9]{64}$/.test(row.emailKey || '')
    || typeof row.consentCheckboxKey !== 'string' || row.consentCheckboxKey.length < 1 || row.consentCheckboxKey.length > 160
    || !['true', '1', 'yes', true].includes(row.consentCheckedValue)) throw new Error('invalid_owned_test');
  return now < Date.parse(row.expiresAt) ? row : null;
}

function testMatches(row, test) {
  const identity = test && (test.allowNewLead === true
    ? Date.parse(row.created_at) >= Date.parse(test.createdAt) && Date.parse(row.created_at) < Date.parse(test.expiresAt)
    : row.lead_id === test.leadId && row.created_at === test.createdAt);
  return Boolean(identity && row.ad_id === OWNED_TEST_AD && row.page_id === test.pageId
    && row.form_id === test.formId && row.campaign_code === 'oip-owned-test'
    && row.consent_version === 'owned-test-v1' && row.consent_key === test.consentCheckboxKey
    && row.consent_value === JSON.stringify(test.consentCheckedValue));
}

function configured(env, dispatch = false, now = Date.now()) {
  try {
    return Boolean(env.DB && META_ID.test(env.META_PAGE_ID) && secret(env.META_APP_SECRET)
      && (forms(env).length || ownedTest(env, now)) && (!dispatch || (NEWSLETTER_ID.test(env.NEWSLETTER_ID)
      && secret(env.EMAIL_HMAC_KEY) && env.BUTTONDOWN_API_KEY && env.META_PAGE_ACCESS_TOKEN
      && /^v[0-9]{1,2}\.0$/.test(env.META_GRAPH_VERSION))));
  } catch { return false; }
}

async function bytes(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) throw new Error('oversize');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.length;
    if (length > MAX_BYTES) { await reader.cancel(); throw new Error('oversize'); }
    chunks.push(result.value);
  }
  const body = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { body.set(chunk, at); at += chunk.length; }
  return body;
}

async function equal(a, b) {
  const digest = value => crypto.subtle.digest('SHA-256', encoder.encode(value));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  const left = new Uint8Array(x), right = new Uint8Array(y); let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

async function administrator(request, env) {
  const header = request.headers.get('Authorization') || '';
  return secret(env.ADMIN_TOKEN) && header.length <= 512 && equal(header, `Bearer ${env.ADMIN_TOKEN}`);
}

async function signature(body, header, appSecret) {
  if (!secret(appSecret) || !/^sha256=[a-f0-9]{64}$/.test(header || '')) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, Uint8Array.from(header.slice(7).match(/../g), part => parseInt(part, 16)), body);
}

async function emailKey(email, env) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.EMAIL_HMAC_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(email));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

async function bindConfig(env) {
  const fingerprint = await emailKey('oip-meta-leads-key-binding-v1', env);
  await env.DB.prepare('INSERT INTO meta_config (id, newsletter_id, email_key_fingerprint) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING')
    .bind(env.NEWSLETTER_ID, fingerprint).run();
  const stored = await env.DB.prepare('SELECT * FROM meta_config WHERE id = 1').first();
  if (stored.newsletter_id !== env.NEWSLETTER_ID || stored.email_key_fingerprint !== fingerprint) throw new Error('configuration_changed');
}

function normalizeNotice(value, pageId, registry, test, now) {
  if (!value || !META_ID.test(value.leadgen_id) || value.page_id !== pageId || !META_ID.test(value.form_id)
    || !Number.isSafeInteger(value.created_time)) throw new Error('invalid_notice');
  const created = value.created_time * 1000;
  const adless = [undefined, null, 0, '0'].includes(value.ad_id);
  if (test && (value.leadgen_id === test.leadId || (test.allowNewLead === true && adless))) {
    const timeMatches = test.allowNewLead === true
      ? created >= Date.parse(test.createdAt) && created < Date.parse(test.expiresAt) : created === Date.parse(test.createdAt);
    if (value.form_id !== test.formId || !timeMatches
      || ![undefined, null, 0, '0'].includes(value.ad_id) || created > now + 300_000 || created < now - MAX_LEAD_AGE) throw new Error('unapproved_owned_test');
    return { lead_id: value.leadgen_id, page_id: pageId, form_id: test.formId, ad_id: OWNED_TEST_AD,
      campaign_code: 'oip-owned-test', consent_version: 'owned-test-v1', consent_key: test.consentCheckboxKey,
      consent_value: JSON.stringify(test.consentCheckedValue), created_at: iso(created) };
  }
  if (!META_ID.test(value.ad_id)) throw new Error('invalid_notice');
  const approved = registry.find(row => row.formId === value.form_id && row.adIds.includes(value.ad_id));
  if (!approved || created < Date.parse(approved.startsAt) || created >= Date.parse(approved.endsAt)
    || created > now + 300_000 || created < now - MAX_LEAD_AGE) throw new Error('unapproved_notice');
  return { lead_id: value.leadgen_id, page_id: pageId, form_id: value.form_id, ad_id: value.ad_id,
    campaign_code: approved.campaignCode, consent_version: approved.consentVersion,
    consent_key: approved.consentCheckboxKey, consent_value: JSON.stringify(approved.consentCheckedValue), created_at: iso(created) };
}

async function receive(request, env, now) {
  if (env.INTAKE_ENABLED !== 'true' || env.SYNTHETIC_ONLY !== 'false') return json({ error: 'intake_disabled' }, 503);
  if (!configured(env, false, now)) return json({ error: 'not_configured' }, 503);
  let body;
  try { body = await bytes(request); } catch { return json({ error: 'invalid_body' }, 413); }
  if (!(await signature(body, request.headers.get('X-Hub-Signature-256'), env.META_APP_SECRET))) return json({ error: 'invalid_signature' }, 401);
  let notices;
  try {
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    if (payload.object !== 'page' || !Array.isArray(payload.entry) || !payload.entry.length) throw new Error('invalid');
    notices = [];
    for (const entry of payload.entry) {
      if (entry.id !== env.META_PAGE_ID || !Array.isArray(entry.changes)) throw new Error('invalid');
      for (const change of entry.changes) {
        if (change.field !== 'leadgen') continue;
        notices.push(normalizeNotice(change.value, env.META_PAGE_ID, forms(env), ownedTest(env, now), now));
      }
    }
    if (!notices.length || notices.length > 20) throw new Error('invalid');
  } catch { return json({ error: 'invalid_or_unapproved_event' }, 400); }
  for (const notice of notices) {
    const keys = Object.keys(notice);
    await env.DB.prepare(`INSERT INTO meta_leads (${keys.join(',')}, received_at, state) VALUES (${keys.map(() => '?').join(',')}, ?, 'queued') ON CONFLICT(lead_id) DO NOTHING`)
      .bind(...Object.values(notice), iso(now)).run();
    const row = await env.DB.prepare('SELECT * FROM meta_leads WHERE lead_id = ?').bind(notice.lead_id).first();
    if (keys.some(key => row[key] !== notice[key])) return json({ error: 'immutable_lead_conflict' }, 409);
  }
  return json({ status: 'queued', notices: notices.length });
}

export function validateCanonicalLead(value, row, now) {
  const adMatches = value && (row.ad_id === OWNED_TEST_AD ? !Object.hasOwn(value, 'ad_id') : value.ad_id === row.ad_id);
  if (!value || value.id !== row.lead_id || value.form_id !== row.form_id || !adMatches
    || !validMetaDate(value.created_time) || Date.parse(value.created_time) !== Date.parse(row.created_at)
    || Date.parse(value.created_time) > now + 300_000 || Date.parse(value.created_time) < now - MAX_LEAD_AGE
    || !Array.isArray(value.field_data)) throw new Error('canonical_lead_mismatch');
  const unique = name => {
    const fields = value.field_data.filter(field => field.name === name);
    if (fields.length !== 1 || !Array.isArray(fields[0].values) || fields[0].values.length !== 1 || typeof fields[0].values[0] !== 'string') throw new Error('required_field_missing');
    return fields[0].values[0];
  };
  const consents = Array.isArray(value.custom_disclaimer_responses)
    ? value.custom_disclaimer_responses.filter(item => item.checkbox_key === row.consent_key) : [];
  if (consents.length !== 1 || JSON.stringify(consents[0].is_checked) !== row.consent_value
    || !['true', '1', 'yes', true].includes(consents[0].is_checked)) throw new Error('consent_missing');
  const email = unique('email').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('invalid_email');
  return email;
}

async function finish(env, id, state, code, now, subscriberId = null) {
  await env.DB.prepare('UPDATE meta_leads SET state = ?, error_code = ?, finished_at = ?, subscriber_id = ? WHERE lead_id = ?')
    .bind(state, code, iso(now), subscriberId, id).run();
}

async function retrieve(row, env, fetcher) {
  const fields = 'id,created_time,form_id,ad_id,field_data,custom_disclaimer_responses';
  const response = await fetcher(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${row.lead_id}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${env.META_PAGE_ACCESS_TOKEN}` }, redirect: 'manual', signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) {
    const error = new Error('meta_retrieval_failed');
    error.permanent = response.status < 500 && response.status !== 408 && response.status !== 429;
    throw error;
  }
  return response.json();
}

async function dispatch(row, email, env, fetcher) {
  const headers = { Authorization: `Token ${env.BUTTONDOWN_API_KEY}`, 'Buttondown-Context': env.NEWSLETTER_ID,
    'X-API-Version': '2026-04-01', 'Content-Type': 'application/json' };
  if (env.TRUSTED_SOURCE_BYPASS === 'true') headers['X-Buttondown-Bypass-Firewall'] = 'true';
  // No collision overwrite/add header, PATCH, regular status, import, or retry.
  try {
    const response = await fetcher('https://api.buttondown.com/v1/subscribers', {
      method: 'POST', headers, redirect: 'manual', signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ email_address: email, type: 'unactivated', tags: ['outside-in-print'],
        utm_campaign: row.campaign_code, utm_medium: row.ad_id === OWNED_TEST_AD ? 'owned_test' : 'paid_social', utm_source: 'meta' }),
    });
    if (response.status >= 400 && response.status < 500 && response.status !== 408) {
      let code = `buttondown_http_${response.status}`;
      if (response.status === 400) {
        try {
          const known = { subscriber_blocked: 'buttondown_firewall_blocked',
            subscriber_suppressed: 'buttondown_subscriber_suppressed', subscriber_already_exists: 'buttondown_subscriber_already_exists' };
          const value = (await response.json()).code;
          if (Object.hasOwn(known, value)) code = known[value];
        } catch {}
      }
      return { state: 'rejected', code };
    }
    if (response.status !== 201) return { state: 'uncertain', code: 'buttondown_response_uncertain' };
    const created = await response.json();
    if (!SUBSCRIBER_ID.test(created.id || '') || created.type !== 'unactivated'
      || typeof created.email_address !== 'string' || created.email_address.trim().toLowerCase() !== email
      || created.subscriber_import_id || created.source === 'import') return { state: 'uncertain', code: 'buttondown_response_invalid' };
    return { state: 'pending_confirmation', code: null, subscriberId: created.id };
  } catch { return { state: 'uncertain', code: 'buttondown_request_uncertain' }; }
}

export async function processQueue(env, { fetcher = fetch, clock = Date.now } = {}) {
  let lastTime = -Infinity;
  const currentTime = () => { lastTime = Math.max(lastTime, clock()); return lastTime; };
  if (env.DISPATCH_ENABLED !== 'true' || env.SYNTHETIC_ONLY !== 'false') return { status: 'dispatch_disabled' };
  if (!configured(env, true, currentTime())) return { status: 'not_configured' };
  await bindConfig(env);
  const { results } = await env.DB.prepare("SELECT * FROM meta_leads WHERE state = 'queued' AND (next_retrieval_at IS NULL OR next_retrieval_at <= ?) ORDER BY received_at, lead_id LIMIT 5")
    .bind(iso(currentTime())).all();
  let attempted = 0;
  for (const row of results) {
    const approved = row.ad_id === OWNED_TEST_AD ? testMatches(row, ownedTest(env, currentTime()))
      : forms(env).find(form => form.formId === row.form_id && form.adIds.includes(row.ad_id)
      && form.campaignCode === row.campaign_code && form.consentVersion === row.consent_version
      && form.consentCheckboxKey === row.consent_key && JSON.stringify(form.consentCheckedValue) === row.consent_value
      && Date.parse(row.created_at) >= Date.parse(form.startsAt) && Date.parse(row.created_at) < Date.parse(form.endsAt));
    if (!approved) {
      await env.DB.prepare("UPDATE meta_leads SET state = 'held', error_code = 'approval_removed_or_changed' WHERE lead_id = ? AND state = 'queued'").bind(row.lead_id).run();
      continue;
    }
    const rateCutoff = iso(currentTime() - HOUR);
    const rate = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM meta_leads WHERE attempted_at > ?)
      + (SELECT COUNT(*) FROM meta_owned_test_recoveries WHERE original_attempted_at > ?) AS count`)
      .bind(rateCutoff, rateCutoff).first();
    if (rate.count >= 5) break;
    let value;
    try { value = await retrieve(row, env, fetcher); } catch (error) {
      const permanent = error?.permanent === true ? 1 : 0;
      // A failed GET must not monopolize the oldest queue slots. Retry transient
      // reads after 5 then 10 minutes, and hold after the third failed read.
      const retryAt = iso(currentTime() + 300_000 * 2 ** Math.min(row.retrieval_attempts, 1));
      await env.DB.prepare(`UPDATE meta_leads SET retrieval_attempts = retrieval_attempts + 1,
        state = CASE WHEN ? = 1 OR retrieval_attempts >= 2 THEN 'held' ELSE 'queued' END,
        error_code = CASE WHEN ? = 1 THEN 'meta_retrieval_rejected' WHEN retrieval_attempts >= 2 THEN 'meta_retrieval_exhausted' ELSE 'meta_retrieval_retry' END,
        next_retrieval_at = CASE WHEN ? = 1 OR retrieval_attempts >= 2 THEN NULL ELSE ? END
        WHERE lead_id = ? AND state = 'queued'`).bind(permanent, permanent, permanent, retryAt, row.lead_id).run();
      continue; // No subscriber POST has begun. Holds require operator review.
    }
    let email;
    try { email = validateCanonicalLead(value, row, currentTime()); } catch {
      await env.DB.prepare("UPDATE meta_leads SET state = 'held', error_code = 'lead_or_consent_invalid' WHERE lead_id = ? AND state = 'queued'").bind(row.lead_id).run();
      continue;
    }
    const digest = await emailKey(email, env);
    if (row.ad_id === OWNED_TEST_AD) {
      const test = ownedTest(env, currentTime());
      if (!testMatches(row, test) || digest !== test.emailKey) {
        await env.DB.prepare("UPDATE meta_leads SET state = 'held', error_code = 'owned_test_approval_or_email_invalid' WHERE lead_id = ? AND state = 'queued'").bind(row.lead_id).run();
        continue;
      }
    }
    if (row.email_key && row.email_key !== digest) {
      await env.DB.prepare("UPDATE meta_leads SET state = 'held', error_code = 'canonical_email_changed' WHERE lead_id = ? AND state = 'queued'").bind(row.lead_id).run();
      continue;
    }
    try {
      await env.DB.prepare("UPDATE meta_leads SET email_key = ? WHERE lead_id = ? AND state = 'queued' AND email_key IS NULL").bind(digest, row.lead_id).run();
    } catch {
      const prior = await env.DB.prepare('SELECT lead_id FROM meta_leads WHERE email_key = ?').bind(digest).first();
      if (!prior || prior.lead_id === row.lead_id) throw new Error('reservation_failed');
      await env.DB.prepare("UPDATE meta_leads SET state = 'duplicate', error_code = 'existing_email_reservation' WHERE lead_id = ? AND state = 'queued'").bind(row.lead_id).run();
      continue;
    }
    if (row.ad_id === OWNED_TEST_AD && ownedTest(env, currentTime())?.dispatchAllowed === false) {
      await env.DB.prepare("UPDATE meta_leads SET state = 'held', error_code = 'owned_probe_has_no_prior_reservation' WHERE lead_id = ? AND state = 'queued'").bind(row.lead_id).run();
      continue;
    }
    // One atomic SQL statement both reserves the side effect and enforces the
    // rolling-hour limit, including concurrent scheduled invocations.
    const claimTime = currentTime();
    if (row.ad_id === OWNED_TEST_AD && !testMatches(row, ownedTest(env, claimTime))) {
      await env.DB.prepare("UPDATE meta_leads SET state = 'held', error_code = 'owned_test_approval_expired' WHERE lead_id = ? AND state = 'queued'").bind(row.lead_id).run();
      continue;
    }
    const claimed = await env.DB.prepare(`UPDATE meta_leads SET state = 'dispatching', attempted_at = ?, error_code = NULL
      WHERE lead_id = ? AND state = 'queued' AND email_key = ?
      AND ((SELECT COUNT(*) FROM meta_leads WHERE attempted_at > ?)
        + (SELECT COUNT(*) FROM meta_owned_test_recoveries WHERE original_attempted_at > ?)) < 5 RETURNING *`)
      .bind(iso(claimTime), row.lead_id, digest, iso(claimTime - HOUR), iso(claimTime - HOUR)).first();
    if (!claimed) continue;
    attempted++;
    const result = await dispatch(claimed, email, env, fetcher);
    try { await finish(env, row.lead_id, result.state, result.code, currentTime(), result.subscriberId); } catch {
      // A lost result leaves dispatching reserved permanently. No automatic POST retry.
    }
  }
  return { status: 'processed', attempted };
}

export async function handleRequest(request, env, { fetcher = fetch, clock = Date.now } = {}) {
  const url = new URL(request.url);
  try {
    if (url.pathname === '/health' && request.method === 'GET') return json({ service: 'oip-meta-leads', intake_enabled: env.INTAKE_ENABLED === 'true', dispatch_enabled: env.DISPATCH_ENABLED === 'true', synthetic_only: env.SYNTHETIC_ONLY !== 'false', configured: configured(env, true, clock()), owned_test_enabled: Boolean(ownedTest(env, clock())) });
    if (url.pathname === '/webhooks/meta' && request.method === 'GET') {
      const token = url.searchParams.get('hub.verify_token') || '';
      const challenge = url.searchParams.get('hub.challenge') || '';
      if (env.META_VERIFY_ENABLED !== 'true' || !secret(env.META_VERIFY_TOKEN) || token.length > 512
        || url.searchParams.get('hub.mode') !== 'subscribe' || !/^[0-9]{1,100}$/.test(challenge)
        || !(await equal(token, env.META_VERIFY_TOKEN))) return json({ error: 'verification_disabled_or_invalid' }, 403);
      return new Response(challenge, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/webhooks/meta' && request.method === 'POST') return await receive(request, env, clock());
    if (url.pathname.startsWith('/admin/')) {
      if (!(await administrator(request, env))) return json({ error: 'unauthorized' }, 401);
      if (url.pathname === '/admin/status' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT state, COUNT(*) AS count FROM meta_leads GROUP BY state').all();
        const counts = Object.fromEntries(results.map(row => [row.state, row.count]));
        const failures = await env.DB.prepare("SELECT COUNT(*) AS count FROM meta_leads WHERE state = 'queued' AND error_code IS NOT NULL").first();
        const oldest = await env.DB.prepare("SELECT MIN(received_at) AS received_at FROM meta_leads WHERE state = 'queued'").first();
        const recoveries = await env.DB.prepare('SELECT COUNT(*) AS count FROM meta_owned_test_recoveries').first();
        const age = oldest.received_at ? Math.max(0, Math.floor((clock() - Date.parse(oldest.received_at)) / 1000)) : null;
        return json({ counts, queued_failures: failures.count, oldest_queued_age_seconds: age, owned_test_recovery_count: recoveries.count,
          review_required: failures.count > 0 || age > 900 || ['dispatching', 'uncertain', 'held', 'rejected'].some(state => counts[state] > 0), confirmed_subscribers: 'not_measured_here' });
      }
      if (url.pathname === '/admin/process' && request.method === 'POST') return json(await processQueue(env, { fetcher, clock }));
      if (url.pathname === '/admin/synthetic-preview' && request.method === 'POST') {
        let input;
        try { input = JSON.parse(new TextDecoder().decode(await bytes(request))); } catch { return json({ error: 'invalid_body' }, 400); }
        let email;
        try { email = validateCanonicalLead(input.lead, input.expected, clock()); } catch { return json({ error: 'invalid_synthetic_fixture' }, 400); }
        if (!email.endsWith('@example.invalid')) return json({ error: 'synthetic_address_required' }, 400);
        return json({ status: 'synthetic_valid', would_request_type: 'unactivated', network_calls: 0, stored_records: 0 });
      }
    }
    return json({ error: 'not_found' }, 404);
  } catch { return json({ error: 'unavailable' }, 503); }
}

export default {
  fetch: handleRequest,
  async scheduled(_event, env, context) { context.waitUntil(processQueue(env)); },
};
