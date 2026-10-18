const API = 'https://api.buttondown.com/v1/';
export class ProviderError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}
// Never log URLs, response bodies, fetch errors or objects from this module.
export async function request(env, path, options = {}, fetcher = fetch) {
  if(!env.BUTTONDOWN_API_KEY || !env.NEWSLETTER_ID) throw new ProviderError('provider_not_configured');
  const url = new URL(path, API);
  if (url.origin !== new URL(API).origin || !url.pathname.startsWith('/v1/')) throw new ProviderError('invalid_pagination');
  const headers = { Authorization: `Token ${env.BUTTONDOWN_API_KEY}`, 'Buttondown-Context': env.NEWSLETTER_ID,
    'X-API-Version': '2026-04-01', ...options.headers };
  if (options.body) headers['Content-Type'] = 'application/json';
  for (let attempt = 0; attempt < 3; attempt++) {
    if(options.method==='POST') {
      const key='provider_create_requests:'+new Date().toISOString().slice(0,10);
      const limit=Math.min(80,Math.max(1,Number(env.MAX_SIGNUPS_PER_DAY)||80));
      const admission=await env.DB.prepare(`INSERT INTO controls(key,value) VALUES(?, '1')
        ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)
        WHERE CAST(value AS INTEGER)<? RETURNING value`).bind(key,limit).first();
      if(!admission) throw new ProviderError('provider_daily_budget');
    }
    let response;
    try { response = await fetcher(url.href, { ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(10000) }); }
    catch(error) {
      const message=typeof error?.message==='string'?error.message:'';
      const reason=/illegal invocation/i.test(message)?'provider_fetch_invocation':
        /invalid.*header|header.*invalid/i.test(message)?'provider_fetch_header':
        /AbortSignal.*not a function/i.test(message)?'provider_fetch_abort_support':'provider_outcome_unknown';
      if(reason!=='provider_outcome_unknown' || attempt===2) throw new ProviderError(reason);
      continue;
    }
    // The deployed Workers runtime accepts manual/follow only. Reject redirects
    // ourselves so authorization can never follow an untrusted Location header.
    if(response.status>=300 && response.status<400) throw new ProviderError('provider_redirect_rejected',response.status);
    if (response.status === 429 || response.status >= 500) {
      // Long retry delays are left to the same-key client retry or next scheduled run.
      const seconds = Number(response.headers.get('Retry-After') || 1);
      if (attempt === 2 || !Number.isFinite(seconds) || seconds > 2) throw new ProviderError('provider_rate_or_availability');
      await new Promise(resolve => setTimeout(resolve, Math.max(1, seconds) * 1000));
      continue;
    }
    let body;
    try { body = await response.json(); } catch { throw new ProviderError('provider_invalid_response',response.status); }
    return { status: response.status, ok: response.ok, body };
  }
}
export function subscriberId(id) {
  return typeof id === 'string' && /^(?:sub_[a-z0-9]{20,40}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.test(id);
}
export async function getSubscriber(env, idOrEmail, fetcher) {
  const result = await request(env, 'subscribers/' + encodeURIComponent(idOrEmail), {}, fetcher);
  if (result.status === 404) return null;
  if (!result.ok || !subscriberId(result.body.id)) throw new ProviderError('provider_subscriber_unavailable');
  if(subscriberId(idOrEmail) ? result.body.id!==idOrEmail : result.body.email_address?.toLowerCase()!==idOrEmail.toLowerCase()) throw new ProviderError('provider_identity_mismatch');
  return result.body;
}
export async function list(env, resource, fetcher) {
  let path = resource, rows = [], seen = new Set();
  for (let page = 0; path && page < 50; page++) {
    const canonical = new URL(path, API).href;
    if (seen.has(canonical)) throw new ProviderError('pagination_loop');
    seen.add(canonical);
    const result = await request(env, path, {}, fetcher);
    if (!result.ok || !Array.isArray(result.body.results)) throw new ProviderError('provider_list_unavailable',result.status);
    rows.push(...result.body.results);
    if (rows.length > 5000) throw new ProviderError('list_limit');
    path = result.body.next;
    if (path !== null && typeof path !== 'string') throw new ProviderError('invalid_pagination');
  }
  if (path) throw new ProviderError('page_limit');
  return rows;
}
export async function createSubscription(env, input, campaign, fetcher) {
  const body = {
    email_address: input.email, type: 'unactivated', tags: ['outside-in-print'],
    metadata: { oip_signup_ref: input.signup_ref, oip_campaign_code: campaign?.code || '', oip_utm_content: campaign?.utm_content || '' },
    utm_campaign: campaign?.utm_campaign || '', utm_source: campaign?.utm_source || '', utm_medium: campaign?.utm_medium || ''
  };
  const result = await request(env, 'subscribers', {
    method: 'POST', headers: { 'X-Idempotency-Key': input.signup_ref }, body: JSON.stringify(body)
  }, fetcher);
  if (result.ok && subscriberId(result.body.id)) {
    if(result.body.email_address?.toLowerCase()!==input.email.toLowerCase()) throw new ProviderError('provider_identity_mismatch');
    if(result.body.type!=='unactivated') throw new ProviderError('provider_opt_in_mismatch');
    return { subscriber: result.body, isNew: true };
  }
  if (result.status !== 400 || !['email_already_exists', 'subscriber_already_exists'].includes(result.body.code)) {
    throw new ProviderError('provider_rejected', result.status);
  }
  const existing = await getSubscriber(env, input.email, fetcher);
  if (!existing) throw new ProviderError('provider_outcome_unknown');
  // A response/ledger may have been lost after the original creation. A retry
  // of that ref recovers the same acquisition, including after key expiry.
  if(existing.metadata?.oip_signup_ref===input.signup_ref) return {subscriber:existing,isNew:true};
  if (existing.type === 'unsubscribed') {
    // The visitor explicitly submitted the signup form. Require a new opt-in, and
    // never send new acquisition fields with this documented resubscription flow.
    const resub = await request(env, 'subscribers', {
      method: 'POST', headers: { 'X-Idempotency-Key': input.signup_ref + '-resub', 'X-Buttondown-Collision-Behavior': 'add' },
      body: JSON.stringify({ email_address: input.email, type: 'unactivated' })
    }, fetcher);
    if (!resub.ok || resub.body.id !== existing.id || resub.body.type !== 'unactivated') throw new ProviderError('provider_rejected');
    return { subscriber: resub.body, isNew: false };
  }
  // A documented collision + verified existing record completes the existing-
  // subscriber flow without modifying it. Public copy reveals no subscription state.
  return { subscriber: existing, isNew: false };
}
