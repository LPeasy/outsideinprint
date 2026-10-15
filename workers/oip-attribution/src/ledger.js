import { subscriberId, ProviderError, list } from './provider.js';

export const utc = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
// Operational audience definition (free + still-subscribed paid lifecycle types).
export const ACTIVE = new Set(['regular', 'premium', 'gifted', 'trialed','churning','churned','paused','past_due']);
const TYPES = new Set(['blocked','churned','churning','complained','gifted','past_due','paused','premium','regular','removed','trialed','unactivated','undeliverable','unpaid','unsubscribed','upcoming']);
const ids = value => { try { const values = JSON.parse(value || '[]'); return Array.isArray(values) ? values : []; } catch { return []; } };
export const stmt = (env, sql, ...values) => env.DB.prepare(sql).bind(...values);
export async function control(env, key) {
  const row = await stmt(env, 'SELECT value FROM controls WHERE key=?', key).first();
  return row ? JSON.parse(row.value) : null;
}
export const putControl = (env, key, value) => stmt(env, 'INSERT INTO controls(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
export async function seedCampaigns(env, campaigns) {
  for (let index = 0; index < campaigns.length; index += 50) {
    await env.DB.batch(campaigns.slice(index,index+50).map(row => stmt(env,
      'INSERT INTO campaigns(code,definition) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET definition=excluded.definition', row.code, JSON.stringify(row))));
  }
}
export async function reserve(env, input, campaign, now) {
  const previous = await stmt(env, 'SELECT * FROM signups WHERE signup_ref=?', input.signup_ref).first();
  if (previous) {
    if (previous.campaign_code !== (campaign?.code || null) || previous.landing_path !== input.landing_path) throw new ProviderError('reference_conflict',409);
    return previous;
  }
  // Atomic conditional INSERT bounds global admission without storing visitor IPs.
  const daily = Math.min(80, Math.max(1, Number(env.MAX_SIGNUPS_PER_DAY) || 80));
  const minute = Math.min(10, Math.max(1, Number(env.MAX_SIGNUPS_PER_MINUTE) || 6));
  await stmt(env, `INSERT OR IGNORE INTO signups(signup_ref,campaign_code,landing_path,created_at,is_test)
    SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM signups WHERE created_at>=?) < ?
    AND (SELECT COUNT(*) FROM signups WHERE created_at>=?) < ?`,
  input.signup_ref,campaign?.code || null,input.landing_path,now,
  ids(env.TEST_SIGNUP_REFS).includes(input.signup_ref) ? 1 : 0,
  now.slice(0,10)+'T00:00:00.000Z',daily,new Date(Date.parse(now)-60000).toISOString(),minute).run();
  const row = await stmt(env, 'SELECT * FROM signups WHERE signup_ref=?',input.signup_ref).first();
  if (!row) throw new ProviderError('signup_capacity',429);
  if (row.campaign_code !== (campaign?.code || null) || row.landing_path !== input.landing_path) throw new ProviderError('reference_conflict',409);
  return row;
}
export async function subscriberStatements(env, raw, observed, { baseline = false, confirmation = false, source = 'reconciliation', recordUnsubscribe = true } = {}) {
  if (!subscriberId(raw.id) || !TYPES.has(raw.type)) throw new ProviderError('invalid_subscriber_record');
  const ref = uuid(raw.metadata?.oip_signup_ref) ? raw.metadata.oip_signup_ref : null;
  const attempt = ref ? await stmt(env, 'SELECT * FROM signups WHERE signup_ref=?',ref).first() : null;
  const existing = await stmt(env,'SELECT * FROM subscribers WHERE subscriber_id=?',raw.id).first();
  const cutoff = await control(env,'baseline');
  const signupAt = utc(raw.creation_date);
  const isBaseline = baseline || existing?.is_baseline === 1 || (!!cutoff && !!signupAt && signupAt <= cutoff.completed_at);
  // Campaign mappings are recovered only from a previously reserved local ref.
  // Unknown or foreign metadata cannot introduce a new campaign or acquisition.
  const acquisitionRef = !isBaseline && attempt && (!attempt.subscriber_id || attempt.subscriber_id === raw.id) ? ref : null;
  let isTest = isBaseline && !existing?.is_baseline && existing?.is_test!==1 ? null : existing?.is_test ?? (isBaseline ? null : 0);
  if (ids(env.TEST_SUBSCRIBER_IDS).includes(raw.id) || attempt?.is_test === 1) isTest = 1;
  else if (ids(env.NON_TEST_SUBSCRIBER_IDS).includes(raw.id)) isTest = 0;
  const confirmed = confirmation || ACTIVE.has(raw.type);
  const statements = [stmt(env, `INSERT INTO subscribers
    (subscriber_id,status,is_test,is_baseline,campaign_code,acquisition_signup_ref,signup_at,
     first_confirmation_observed_at,confirmation_evidence,state_observed_at,last_seen_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(subscriber_id) DO UPDATE SET
    status=CASE WHEN excluded.state_observed_at>=subscribers.state_observed_at THEN excluded.status ELSE subscribers.status END,
    state_observed_at=MAX(subscribers.state_observed_at,excluded.state_observed_at),
    last_seen_at=MAX(subscribers.last_seen_at,excluded.last_seen_at),
    signup_at=COALESCE(subscribers.signup_at,excluded.signup_at),
    is_baseline=MAX(subscribers.is_baseline,excluded.is_baseline),
    is_test=CASE WHEN subscribers.is_test=1 OR excluded.is_test=1 THEN 1
      WHEN excluded.is_baseline=1 AND subscribers.is_baseline=0 THEN excluded.is_test
      ELSE COALESCE(excluded.is_test,subscribers.is_test) END,
    first_confirmation_observed_at=COALESCE(subscribers.first_confirmation_observed_at,excluded.first_confirmation_observed_at),
    confirmation_evidence=COALESCE(subscribers.confirmation_evidence,excluded.confirmation_evidence),
    campaign_code=CASE WHEN excluded.is_baseline=1 THEN NULL WHEN subscribers.is_baseline=0 AND subscribers.acquisition_signup_ref IS NULL THEN COALESCE(subscribers.campaign_code,excluded.campaign_code) ELSE subscribers.campaign_code END,
    acquisition_signup_ref=CASE WHEN excluded.is_baseline=1 THEN NULL WHEN subscribers.is_baseline=0 THEN COALESCE(subscribers.acquisition_signup_ref,excluded.acquisition_signup_ref) ELSE subscribers.acquisition_signup_ref END`,
  raw.id,raw.type,isTest,isBaseline ? 1 : 0,acquisitionRef ? attempt.campaign_code : null,acquisitionRef,signupAt,
  confirmed ? observed : null,confirmed ? (confirmation ? 'signed_confirmation_webhook' : 'observed_active_status') : null,observed,observed)];
  if (acquisitionRef && (ACTIVE.has(raw.type) || raw.type==='unactivated')) statements.push(stmt(env, `UPDATE signups SET subscriber_id=?,accepted_at=COALESCE(accepted_at,?),is_new=1,outcome='accepted'
    WHERE signup_ref=? AND (subscriber_id IS NULL OR subscriber_id=?)`,raw.id,signupAt || observed,acquisitionRef,raw.id));
  if (recordUnsubscribe && raw.type === 'unsubscribed') {
    const at = utc(raw.unsubscription_date);
    statements.push(eventStatement(env,raw.id,'unsubscribed',at,observed,source));
  }
  return statements;
}
export function eventStatement(env,id,type,at,observed,source,eventId=null) {
  // No upstream timestamp is invented. Repeated undated events collapse to one
  // evidence record; repeated dated unsubscribe cycles remain distinct.
  return stmt(env,`INSERT OR IGNORE INTO lifecycle_events
    (event_id,subscriber_id,type,occurred_at,observed_at,event_time_known,evidence_source) VALUES(?,?,?,?,?,?,?)`,
  eventId || `${id}:${type}:${at || 'unknown'}`,id,type,at,observed,at ? 1 : 0,source);
}
export async function accept(env, input, result, observed) {
  const statements = await subscriberStatements(env,result.subscriber,observed,{source:'signup_response'});
  statements.push(stmt(env, `UPDATE signups SET subscriber_id=?,accepted_at=COALESCE(accepted_at,?),is_new=?,outcome='accepted'
    WHERE signup_ref=?`,result.subscriber.id,observed,result.isNew ? 1 : 0,input.signup_ref));
  statements.push(stmt(env,'UPDATE signups SET is_new=0 WHERE subscriber_id IN (SELECT subscriber_id FROM subscribers WHERE is_baseline=1)'));
  await env.DB.batch(statements);
}
export async function reconcile(env, fetcher, { baseline = false, now = new Date().toISOString() } = {}) {
  const runId = crypto.randomUUID();
  if (baseline && await control(env,'baseline')) throw new ProviderError('baseline_already_exists',409);
  if (!baseline && !await control(env,'baseline')) throw new ProviderError('baseline_required',409);
  await stmt(env,'INSERT INTO runs(run_id,kind,started_at,status) VALUES(?,?,?,?)',runId,baseline ? 'baseline' : 'reconciliation',now,'running').run();
  try {
    const rows = await list(env,'subscribers',fetcher);
    const unique = new Set(rows.map(row=>row.id));
    if (unique.size !== rows.length || rows.some(row=>!subscriberId(row.id) || !TYPES.has(row.type))) throw new ProviderError('invalid_subscriber_list');
    // No status mutation before all pages validate. Partial write failure cannot
    // advance the success receipt; rerun repairs idempotently.
    for (const row of rows) await env.DB.batch(await subscriberStatements(env,row,now,{baseline}));
    const changes = [];
    if (baseline) changes.push(putControl(env,'baseline',{completed_at:now,subscriber_count:rows.length,
      known_test_count:rows.filter(row=>ids(env.TEST_SUBSCRIBER_IDS).includes(row.id)).length,
      gaps:['Historical campaign attribution unknown.','Unclassified baseline records excluded from verified non-test totals.','Historical confirmation times unknown.']}));
    // Absence is flagged only after a COMPLETE list, never after a failed fetch.
    // Automatic deletion/retention cleanup remains disabled pending approval.
    const known = (await stmt(env,'SELECT subscriber_id FROM subscribers').all()).results;
    for (const row of known) if (!unique.has(row.subscriber_id)) changes.push(stmt(env,
      "UPDATE subscribers SET status='deleted',state_observed_at=? WHERE subscriber_id=? AND state_observed_at<=?",now,row.subscriber_id,now));
    changes.push(stmt(env,"UPDATE runs SET finished_at=?,status='success',record_count=? WHERE run_id=?",new Date().toISOString(),rows.length,runId));
    changes.push(putControl(env,'last_reconciliation_success_at',now));
    await env.DB.batch(changes);
    return {ok:true,record_count:rows.length};
  } catch {
    await stmt(env,"UPDATE runs SET finished_at=?,status='failed',error_code='reconciliation_failed' WHERE run_id=?",new Date().toISOString(),runId).run();
    throw new ProviderError('reconciliation_failed');
  }
}
export async function snapshot(env) {
  const all = async table => (await stmt(env,`SELECT * FROM ${table}`).all()).results;
  const subscribers = (await all('subscribers')).map(row=>({...row,is_test:row.is_test===null?null:row.is_test===1,is_baseline:row.is_baseline===1,confirmation_time_known:row.confirmation_time_known===1}));
  const byId = new Map(subscribers.map(row=>[row.subscriber_id,row]));
  const signups = (await all('signups')).map(row=>({...row,is_new:row.is_new===1,is_test:byId.has(row.subscriber_id)?byId.get(row.subscriber_id).is_test:(row.is_test===1)}));
  const runs = await all('runs');
  const latest = runs.filter(row=>['reconciliation','baseline'].includes(row.kind)).sort((a,b)=>b.started_at.localeCompare(a.started_at))[0];
  return {schema_version:1,exported_at:new Date().toISOString(),newsletter_id:env.NEWSLETTER_ID,
    baseline:await control(env,'baseline'),health:{last_reconciliation_success_at:await control(env,'last_reconciliation_success_at'),
      last_reconciliation_attempt_at:latest?.started_at || null,last_reconciliation_error:latest?.status==='failed'?latest.error_code:null,
      webhook:await control(env,'webhook_health')},signups,subscribers,
    events:(await all('lifecycle_events')).map(row=>({...row,event_time_known:row.event_time_known===1}))};
}
