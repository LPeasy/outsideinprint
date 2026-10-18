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
  // Detail expiry must not make an old acquisition reference a new signup.
  const acquired=await stmt(env,'SELECT subscriber_id,campaign_code FROM subscribers WHERE acquisition_signup_ref=?',input.signup_ref).first();
  if(acquired) {
    if(acquired.campaign_code!==(campaign?.code||null)) throw new ProviderError('reference_conflict',409);
    return {...acquired,signup_ref:input.signup_ref,landing_path:input.landing_path,outcome:'accepted',is_new:0};
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
     first_confirmation_observed_at,confirmation_evidence,state_observed_at,last_seen_at,unsubscribe_cycle,acquisition_accepted_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(subscriber_id) DO UPDATE SET
    unsubscribe_cycle=subscribers.unsubscribe_cycle+CASE WHEN excluded.status='unsubscribed' AND subscribers.status!='unsubscribed' AND excluded.state_observed_at>=subscribers.state_observed_at THEN 1 ELSE 0 END,
    status=CASE WHEN excluded.state_observed_at>=subscribers.state_observed_at THEN excluded.status ELSE subscribers.status END,
    state_observed_at=MAX(subscribers.state_observed_at,excluded.state_observed_at),
    last_seen_at=MAX(subscribers.last_seen_at,excluded.last_seen_at),
    signup_at=COALESCE(subscribers.signup_at,excluded.signup_at),
    is_baseline=MAX(subscribers.is_baseline,excluded.is_baseline),
    acquisition_accepted_at=CASE WHEN excluded.is_baseline=1 THEN NULL ELSE COALESCE(subscribers.acquisition_accepted_at,excluded.acquisition_accepted_at) END,
    is_test=CASE WHEN subscribers.is_test=1 OR excluded.is_test=1 THEN 1
      WHEN excluded.is_baseline=1 AND subscribers.is_baseline=0 THEN excluded.is_test
      ELSE COALESCE(excluded.is_test,subscribers.is_test) END,
    first_confirmation_observed_at=COALESCE(subscribers.first_confirmation_observed_at,excluded.first_confirmation_observed_at),
    confirmation_evidence=COALESCE(subscribers.confirmation_evidence,excluded.confirmation_evidence),
    campaign_code=CASE WHEN excluded.is_baseline=1 THEN NULL WHEN subscribers.is_baseline=0 AND subscribers.acquisition_signup_ref IS NULL THEN COALESCE(subscribers.campaign_code,excluded.campaign_code) ELSE subscribers.campaign_code END,
    acquisition_signup_ref=CASE WHEN excluded.is_baseline=1 THEN NULL WHEN subscribers.is_baseline=0 THEN COALESCE(subscribers.acquisition_signup_ref,excluded.acquisition_signup_ref) ELSE subscribers.acquisition_signup_ref END`,
  raw.id,raw.type,isTest,isBaseline ? 1 : 0,acquisitionRef ? attempt.campaign_code : null,acquisitionRef,signupAt,
  confirmed ? observed : null,confirmed ? (confirmation ? 'signed_confirmation_webhook' : 'observed_active_status') : null,observed,observed,
  raw.type==='unsubscribed'?1:0,acquisitionRef ? (attempt.accepted_at || (source==='signup_response'?observed:signupAt) || observed) : null)];
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
    (event_id,subscriber_id,type,occurred_at,observed_at,event_time_known,evidence_source)
    SELECT COALESCE(?,CASE WHEN ?='unsubscribed' AND ? IS NULL THEN ?||':unsubscribed:cycle:'||(SELECT unsubscribe_cycle FROM subscribers WHERE subscriber_id=?) ELSE ? END),?,?,?,?,?,? WHERE ?!='unsubscribed' OR EXISTS (SELECT 1 FROM subscribers WHERE subscriber_id=? AND
      ((? IS NOT NULL AND (last_known_unsubscribe_at IS NULL OR last_known_unsubscribe_at<?)) OR
       (? IS NULL AND unsubscribe_cycle>last_undated_unsubscribe_cycle)))`,
  eventId,type,at,id,id,`${id}:${type}:${at || 'unknown'}`,id,type,at,observed,at ? 1 : 0,source,type,id,at,at,at);
}
export async function accept(env, input, result, observed) {
  const statements = await subscriberStatements(env,result.subscriber,observed,{source:'signup_response'});
  statements.push(stmt(env, `UPDATE signups SET subscriber_id=?,accepted_at=COALESCE(accepted_at,?),is_new=?,outcome='accepted'
    WHERE signup_ref=?`,result.subscriber.id,observed,result.isNew ? 1 : 0,input.signup_ref));
  statements.push(stmt(env,'UPDATE signups SET is_new=0 WHERE subscriber_id IN (SELECT subscriber_id FROM subscribers WHERE is_baseline=1)'));
  if(result.isNew) statements.push(stmt(env,`UPDATE subscribers SET acquisition_accepted_at=COALESCE(acquisition_accepted_at,?)
    WHERE subscriber_id=? AND is_baseline=0 AND acquisition_signup_ref=?`,observed,result.subscriber.id,input.signup_ref));
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
    const known = (await stmt(env,'SELECT subscriber_id FROM subscribers').all()).results;
    for (const row of known) if (!unique.has(row.subscriber_id)) changes.push(stmt(env,
      "UPDATE subscribers SET status='deleted',state_observed_at=? WHERE subscriber_id=? AND state_observed_at<=?",now,row.subscriber_id,now));
    changes.push(stmt(env,"UPDATE runs SET finished_at=?,status='success',record_count=? WHERE run_id=?",new Date().toISOString(),rows.length,runId));
    changes.push(putControl(env,'last_reconciliation_success_at',now));
    await env.DB.batch(changes);
    const retention=env.RETENTION_ENABLED==='true' ? await retain(env,now) : null;
    return {ok:true,record_count:rows.length,...(retention?{retention}:{})};
  } catch(error) {
    const code=error instanceof ProviderError?error.code:'storage_unavailable';
    await stmt(env,"UPDATE runs SET finished_at=?,status='failed',error_code=? WHERE run_id=?",new Date().toISOString(),code,runId).run();
    throw new ProviderError(code);
  }
}

// Weeks are calendar boundaries in Eastern time, including DST. Only aggregate
// membership survives detail expiry; no event ID or event timestamp is retained.
export function easternWeek(value) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const part=name=>parts.find(item=>item.type===name).value;
  const day=new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+1)%7);
  return day.toISOString().slice(0,10);
}
const aggregateStatement=(env,week,code,metric,value=1,guard=null)=>stmt(env,`INSERT INTO historical_aggregates(week_start,campaign_code,metric,value)
  SELECT ?,?,?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM subscribers WHERE subscriber_id=? AND status='deleted' AND state_observed_at=?)
  ON CONFLICT(week_start,campaign_code,metric) DO UPDATE SET value=value+excluded.value`,week,code||'',metric,value,guard?.subscriber_id||null,guard?.subscriber_id||null,guard?.state_observed_at||null);

function membershipFacts(events,prior=[]) {
  const facts=new Map(prior.map(row=>[row.week_start,{...row}]));
  for(const row of events) {
    if(row.type!=='unsubscribed') continue;
    const week=easternWeek(row.event_time_known ? row.occurred_at : row.observed_at);
    const fact=facts.get(week)||{week_start:week,unsubscribed:0,unsubscribe_unknown:0};
    fact[row.event_time_known?'unsubscribed':'unsubscribe_unknown']=1;
    facts.set(week,fact);
  }
  // A later dated unsubscribe may be a separate cycle. Without a proven link,
  // preserve both observation groups; they are not disjoint totals to sum.
  return [...facts.values()];
}

function expireAttemptStatements(env,row,guard=null) {
  const condition=guard?"AND EXISTS(SELECT 1 FROM subscribers WHERE subscriber_id=? AND status='deleted' AND state_observed_at=?)":"";
  const guards=guard?[guard.subscriber_id,guard.state_observed_at]:[];
  return [stmt(env,`INSERT INTO historical_aggregates(week_start,campaign_code,metric,value)
    SELECT ?,COALESCE(signups.campaign_code,''),CASE
      WHEN signups.is_test=1 OR subscribers.is_test=1 THEN 'expired_attempts_test'
      WHEN subscribers.subscriber_id IS NOT NULL AND subscribers.is_test IS NULL THEN 'expired_attempts_unreviewed'
      WHEN signups.outcome='rejected' THEN 'expired_attempts_rejected'
      WHEN signups.accepted_at IS NULL THEN 'expired_attempts_unresolved'
      WHEN signups.is_new=1 THEN 'expired_attempts_new' ELSE 'expired_attempts_existing' END,1
    FROM signups LEFT JOIN subscribers ON subscribers.subscriber_id=signups.subscriber_id
    WHERE signup_ref=? ${condition}
    ON CONFLICT(week_start,campaign_code,metric) DO UPDATE SET value=value+excluded.value`,easternWeek(row.created_at),row.signup_ref,...guards),
    stmt(env,`DELETE FROM signups WHERE signup_ref=? ${condition}`,row.signup_ref,...guards)];
}

export async function retain(env,now=new Date().toISOString()) {
  // A failed/partial list cannot authorize destructive retention or deletion.
  if(env.RETENTION_ENABLED!=='true') return {enabled:false};
  if(await control(env,'last_reconciliation_success_at')!==now) throw new ProviderError('retention_requires_complete_reconciliation');
  const cutoff=new Date(Date.parse(now)-90*86400000).toISOString();
  const people=(await stmt(env,'SELECT * FROM subscribers').all()).results;
  let removed=0,expiredEvents=0;
  for(const person of people) {
    const events=(await stmt(env,'SELECT * FROM lifecycle_events WHERE subscriber_id=?',person.subscriber_id).all()).results;
    const prior=(await stmt(env,'SELECT * FROM subscriber_week_facts WHERE subscriber_id=?',person.subscriber_id).all()).results;
    const gone=person.status==='deleted';
    const expiring=gone?events:events.filter(row=>row.observed_at<cutoff);
    const facts=membershipFacts(expiring,prior);
    const changes=[];
    if(gone) {
      // Snapshot eligible historical facts before dropping every private key.
      if(person.is_test===0) {
        for(const fact of facts) {
          if(fact.unsubscribed) changes.push(aggregateStatement(env,fact.week_start,'','unsubscribers_this_week',1,person));
          if(fact.unsubscribe_unknown) changes.push(aggregateStatement(env,fact.week_start,'','unsubscribers_observed_time_unknown',1,person));
        }
        if(!person.is_baseline) {
          const confirmed=person.first_confirmed_at||person.first_confirmation_observed_at;
          if(person.acquisition_accepted_at) {
            const week=easternWeek(person.acquisition_accepted_at);
            changes.push(aggregateStatement(env,week,person.campaign_code,'accepted_new_signups',1,person));
            changes.push(aggregateStatement(env,week,person.campaign_code,confirmed?'eventual_confirmations_from_week_signups':'deleted_unconfirmed_from_week_signups',1,person));
          }
          if(confirmed) changes.push(aggregateStatement(env,easternWeek(confirmed),person.campaign_code,
            person.confirmation_time_known?'confirmed_this_week':'confirmations_observed_this_week_time_unknown',1,person));
        }
      }
      const guard="EXISTS(SELECT 1 FROM subscribers WHERE subscriber_id=? AND status='deleted' AND state_observed_at=?)";
      const attempts=(await stmt(env,'SELECT * FROM signups WHERE subscriber_id=? OR signup_ref=?',person.subscriber_id,person.acquisition_signup_ref).all()).results;
      for(const attempt of attempts) changes.push(...expireAttemptStatements(env,attempt,person));
      changes.push(stmt(env,`DELETE FROM lifecycle_events WHERE subscriber_id=? AND ${guard}`,person.subscriber_id,person.subscriber_id,person.state_observed_at));
      changes.push(stmt(env,"DELETE FROM subscribers WHERE subscriber_id=? AND status='deleted' AND state_observed_at=?",person.subscriber_id,person.state_observed_at));
      removed++;
    } else {
      for(const fact of facts) changes.push(stmt(env,`INSERT INTO subscriber_week_facts(subscriber_id,week_start,unsubscribed,unsubscribe_unknown,last_unknown_observed_at,last_dated_observed_at)
        VALUES(?,?,?,?,NULL,NULL) ON CONFLICT(subscriber_id,week_start) DO UPDATE SET unsubscribed=MAX(subscriber_week_facts.unsubscribed,excluded.unsubscribed),unsubscribe_unknown=MAX(subscriber_week_facts.unsubscribe_unknown,excluded.unsubscribe_unknown),last_unknown_observed_at=NULL,last_dated_observed_at=NULL`,
        person.subscriber_id,fact.week_start,fact.unsubscribed,fact.unsubscribe_unknown));
      changes.push(stmt(env,'DELETE FROM lifecycle_events WHERE subscriber_id=? AND observed_at<?',person.subscriber_id,cutoff));
    }
    // Per-subscriber aggregation and removal are one transaction. A retry cannot
    // add a removed subscriber twice or lose its historical aggregate.
    await env.DB.batch(changes);
    expiredEvents+=expiring.length;
  }
  const oldAttempts=(await stmt(env,'SELECT * FROM signups WHERE created_at<?',cutoff).all()).results;
  for(let index=0;index<oldAttempts.length;index+=25) await env.DB.batch(oldAttempts.slice(index,index+25).flatMap(row=>expireAttemptStatements(env,row)));
  const final=[
    stmt(env,"DELETE FROM lifecycle_events WHERE observed_at<? AND subscriber_id NOT IN (SELECT subscriber_id FROM subscribers)",cutoff),
    stmt(env,"DELETE FROM controls WHERE (key LIKE 'signup_ingress:%' AND key<?) OR (key LIKE 'provider_create_requests:%' AND key<?)",
      'signup_ingress:'+cutoff.slice(0,16),'provider_create_requests:'+cutoff.slice(0,10)),
    putControl(env,'last_retention_success',{completed_at:now,detail_cutoff:cutoff,removed_subscribers:removed,expired_events:expiredEvents})];
  await env.DB.batch(final);
  return {enabled:true,removed_subscribers:removed,expired_events:expiredEvents};
}
export async function snapshot(env) {
  // D1 batches execute transactionally: never combine pre-deletion private rows
  // with post-deletion anonymous aggregates from separate reads.
  const tables=['subscribers','signups','runs','controls','subscriber_week_facts','historical_aggregates','lifecycle_events'];
  const results=await env.DB.batch(tables.map(table=>stmt(env,`SELECT * FROM ${table}`)));
  const rows=Object.fromEntries(tables.map((table,index)=>[table,results[index].results]));
  const controls=new Map(rows.controls.map(row=>[row.key,JSON.parse(row.value)]));
  const subscribers = rows.subscribers.map(row=>({...row,is_test:row.is_test===null?null:row.is_test===1,is_baseline:row.is_baseline===1,confirmation_time_known:row.confirmation_time_known===1}));
  const byId = new Map(subscribers.map(row=>[row.subscriber_id,row]));
  const signups = rows.signups.map(row=>({...row,is_new:row.is_new===1,is_test:byId.has(row.subscriber_id)?byId.get(row.subscriber_id).is_test:(row.is_test===1)}));
  const runs = rows.runs;
  const latest = runs.filter(row=>['reconciliation','baseline'].includes(row.kind)).sort((a,b)=>b.started_at.localeCompare(a.started_at))[0];
  return {schema_version:1,exported_at:new Date().toISOString(),newsletter_id:env.NEWSLETTER_ID,
    baseline:controls.get('baseline')||null,health:{last_reconciliation_success_at:controls.get('last_reconciliation_success_at')||null,
      last_reconciliation_attempt_at:latest?.started_at || null,last_reconciliation_error:latest?.status==='failed'?latest.error_code:null,
      webhook:controls.get('webhook_health')||null,webhook_contract:controls.get('webhook_contract')||null,retention:controls.get('last_retention_success')||null},signups,subscribers,
    aggregates:{schema_version:1,subscriber_weeks:rows.subscriber_week_facts,historical:rows.historical_aggregates},
    events:rows.lifecycle_events.map(row=>({...row,event_time_known:row.event_time_known===1}))};
}
