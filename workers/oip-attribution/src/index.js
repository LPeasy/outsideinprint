import register from '../../../data/newsletter_campaigns.json' with { type: 'json' };
import { ProviderError, createSubscription, getSubscriber, subscriberId, list } from './provider.js';
import { control, putControl, seedCampaigns, reserve, accept, subscriberStatements, eventStatement, reconcile, snapshot, stmt, utc, uuid } from './ledger.js';

const encoder = new TextEncoder();
const HANDLED = new Set(['subscriber.confirmed','subscriber.created','subscriber.unsubscribed','subscriber.type.changed','subscriber.deleted','subscriber.complained']);
const REQUIRED_EVENTS = ['subscriber.confirmed','subscriber.created','subscriber.unsubscribed','subscriber.type.changed','subscriber.deleted'];
const campaigns = new Map(register.campaigns.map(row=>[row.code,row]));
const reply = (status,body,origin=null) => Response.json(body,{status,headers:{'Cache-Control':'no-store',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});
const success = origin => reply(200,{ok:true,message:'Check your inbox for any next steps.'},origin);
async function bytes(request,limit) {
  if (Number(request.headers.get('Content-Length')||0)>limit) throw new ProviderError('request_too_large',413);
  const reader=request.body?.getReader();
  if (!reader) throw new ProviderError('invalid_request',400);
  let length=0; const chunks=[];
  try {
    while(true) { const {done,value}=await reader.read(); if(done) break; length+=value.byteLength;
      if(length>limit) { await reader.cancel(); throw new ProviderError('request_too_large',413); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const result=new Uint8Array(length); let offset=0;
  for(const chunk of chunks) { result.set(chunk,offset); offset+=chunk.byteLength; }
  return result;
}
const parse = raw => { try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)); } catch { throw new ProviderError('invalid_json',400); } };
export function validateSignup(value) {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new ProviderError('invalid_request',400);
  const allowed=new Set(['email','signup_ref','campaign_code','utm_campaign','utm_source','utm_medium','utm_content','landing_path','website']);
  if(Object.keys(value).some(key=>!allowed.has(key))) throw new ProviderError('invalid_request',400);
  if(typeof value.email!=='string' || value.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) || !uuid(value.signup_ref)) throw new ProviderError('invalid_request',400);
  if(value.website) throw new ProviderError('invalid_request',400);
  let path=value.landing_path || null;
  if(path && (typeof path!=='string' || path.length>300 || !/^\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]*$/i.test(path))) path=null;
  const campaign=value.campaign_code ? campaigns.get(value.campaign_code) : null;
  if(value.campaign_code && !campaign) throw new ProviderError('invalid_campaign',400);
  for(const key of ['utm_campaign','utm_source','utm_medium','utm_content']) {
    if(value[key] && (!campaign || value[key]!==campaign[key])) throw new ProviderError('invalid_campaign',400);
  }
  return {input:{...value,landing_path:path},campaign};
}
export async function verifySignature(raw,header,key) {
  if(typeof key!=='string' || key.length<32 || !/^sha256=[a-f0-9]{64}$/.test(header || '')) return false;
  const hmac=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signature=Uint8Array.from(header.slice(7).match(/../g),pair=>parseInt(pair,16));
  return crypto.subtle.verify('HMAC',hmac,signature,raw);
}
async function adminAuthorized(request,env) {
  const actual=request.headers.get('Authorization') || '';
  const expected=env.ADMIN_TOKEN;
  if(typeof expected!=='string' || expected.length<32 || !actual.startsWith('Bearer ')) return false;
  const digest=async text=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
  const a=await digest(actual.slice(7)),b=await digest(expected); let difference=0;
  for(let i=0;i<a.length;i++) difference|=a[i]^b[i];
  return difference===0;
}
export async function webhook(request,env,fetcher) {
  const raw=await bytes(request,16384);
  if(!await verifySignature(raw,request.headers.get('X-Buttondown-Signature'),env.WEBHOOK_SIGNING_KEY)) return reply(401,{ok:false,code:'invalid_signature'});
  const payload=parse(raw);
  if(payload?.data?.newsletter!==env.NEWSLETTER_ID || !subscriberId(payload?.data?.subscriber) || typeof payload.event_type!=='string') return reply(400,{ok:false,code:'invalid_event'});
  if(!HANDLED.has(payload.event_type)) return reply(400,{ok:false,code:'unsupported_event'});
  const observed=new Date().toISOString();
  const eventId=typeof payload.id==='string' && /^ext_evt_[a-z0-9]{20,40}$/.test(payload.id) ? payload.id : null;
  // Minimal documented payload has no timestamp. Even an unfamiliar extra field
  // is not treated as event time until the real signed payload contract is reviewed.
  const current=await getSubscriber(env,payload.data.subscriber,fetcher);
  const changes=current ? await subscriberStatements(env,current,observed,{confirmation:payload.event_type==='subscriber.confirmed',source:'signed_webhook',recordUnsubscribe:payload.event_type!=='subscriber.unsubscribed'}) : [stmt(env,
    "UPDATE subscribers SET status='deleted',state_observed_at=? WHERE subscriber_id=? AND state_observed_at<=?",observed,payload.data.subscriber,observed)];
  if(payload.event_type==='subscriber.confirmed') changes.push(eventStatement(env,payload.data.subscriber,'confirmed',null,observed,'signed_webhook',eventId));
  if(payload.event_type==='subscriber.unsubscribed') changes.push(eventStatement(env,payload.data.subscriber,'unsubscribed',utc(current?.unsubscription_date),observed,'signed_webhook',eventId));
  changes.push(putControl(env,'last_webhook_received_at',observed));
  // D1 batch commits outcome and receipt together; any failure returns 503.
  await env.DB.batch(changes);
  return reply(200,{ok:true});
}
export async function checkWebhookHealth(env,fetcher) {
  const checkedAt=new Date().toISOString();
  let status='unknown',recentFailures=null,lastSuccessfulDelivery=null;
  try {
    const hooks=await list(env,'webhooks',fetcher);
    const hook=hooks.find(row=>row.id===env.WEBHOOK_ID && row.url===env.WEBHOOK_URL);
    status=hook && hook.status==='enabled' && REQUIRED_EVENTS.every(type=>hook.event_types?.includes(type)) ? 'enabled' : 'missing_or_disabled';
    if(status==='enabled') {
      const attempts=await list(env,'webhooks/'+encodeURIComponent(env.WEBHOOK_ID)+'/attempts',fetcher);
      if(attempts.some(row=>!['unattempted','successful','failed'].includes(row.status) || !utc(row.creation_date))) throw new Error('invalid_attempt_record');
      const cutoff=Date.parse(checkedAt)-24*3600000;
      recentFailures=attempts.filter(row=>row.status==='failed' && Date.parse(row.completion_date || row.creation_date)>=cutoff).length;
      lastSuccessfulDelivery=attempts.filter(row=>row.status==='successful').map(row=>utc(row.completion_date)||utc(row.creation_date)).sort().at(-1)||null;
      if(recentFailures) status='delivery_failures';
    }
  } catch { status='check_failed'; }
  const health={checked_at:checkedAt,status,last_delivery_at:await control(env,'last_webhook_received_at'),recent_failed_attempts:recentFailures,last_successful_delivery_at:lastSuccessfulDelivery};
  await putControl(env,'webhook_health',health).run();
  return health;
}
export async function handle(request,env,fetcher=fetch) {
  const url=new URL(request.url);
  const origin=(env.ALLOWED_ORIGINS || '').split(',').includes(request.headers.get('Origin')) ? request.headers.get('Origin') : null;
  try {
    if(url.pathname==='/health' && request.method==='GET') {
      const last=await control(env,'last_reconciliation_success_at'),health=await control(env,'webhook_health');
      const ready=!!last && Date.now()-Date.parse(last)<36*3600000 && health?.status==='enabled' && Date.now()-Date.parse(health.checked_at)<2*3600000;
      return reply(ready?200:503,{ok:ready});
    }
    if(url.pathname.startsWith('/admin/')) {
      if(!await adminAuthorized(request,env)) return reply(401,{ok:false});
      if(request.method==='GET' && url.pathname==='/admin/snapshot') return reply(200,await snapshot(env));
      if(request.method==='POST' && ['/admin/baseline','/admin/reconcile'].includes(url.pathname)) {
        await seedCampaigns(env,register.campaigns);
        return reply(200,await reconcile(env,fetcher,{baseline:url.pathname==='/admin/baseline'}));
      }
      if(request.method==='POST' && url.pathname==='/admin/webhook-health') return reply(200,await checkWebhookHealth(env,fetcher));
      return reply(404,{ok:false});
    }
    if(url.pathname==='/webhooks/buttondown' && request.method==='POST') return await webhook(request,env,fetcher);
    if(url.pathname!=='/signup') return reply(404,{ok:false});
    if(!origin) return reply(403,{ok:false,code:'origin_rejected'});
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Vary':'Origin',
      'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type, Idempotency-Key','Access-Control-Max-Age':'600'}});
    if(request.method!=='POST') return reply(405,{ok:false},origin);
    if(env.SIGNUPS_ENABLED!=='true' || !env.BUTTONDOWN_API_KEY || !env.NEWSLETTER_ID || !await control(env,'baseline')) return reply(503,{ok:false,code:'signup_unavailable'},origin);
    if(!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return reply(415,{ok:false},origin);
    const {input,campaign}=validateSignup(parse(await bytes(request,4096)));
    if(request.headers.has('Idempotency-Key') && request.headers.get('Idempotency-Key')!==input.signup_ref) throw new ProviderError('invalid_request',400);
    const now=new Date().toISOString();
    const admitted=await stmt(env,`INSERT INTO controls(key,value) VALUES(?, '1')
      ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)
      WHERE CAST(value AS INTEGER)<15 RETURNING value`,'signup_ingress:'+now.slice(0,16)).first();
    if(!admitted) throw new ProviderError('signup_capacity',429);
    const attempt=await reserve(env,input,campaign,now);
    if(attempt.outcome==='accepted') {
      const current=await getSubscriber(env,attempt.subscriber_id,fetcher);
      if(current?.email_address?.toLowerCase()!==input.email.toLowerCase()) throw new ProviderError('reference_conflict',409);
      return success(origin);
    }
    const result=await createSubscription(env,input,campaign,fetcher);
    try { await accept(env,input,result,now); }
    catch {
      // Buttondown owns the successful signup. The reserved UUID + provider
      // metadata let reconciliation recover it; never submit via another path.
      return success(origin);
    }
    return success(origin);
  } catch(error) {
    const code=error instanceof ProviderError ? error.code : 'storage_unavailable';
    const status=['request_too_large','invalid_json','invalid_request','invalid_campaign','reference_conflict','signup_capacity'].includes(code) ? error.status : 503;
    return reply(status,{ok:false,code:status===503?'retry_same_submission':code},origin);
  }
}
export default {
  fetch(request,env) { return handle(request,env); },
  async scheduled(event,env) {
    if(env.RECONCILIATION_ENABLED!=='true') return;
    const health=await checkWebhookHealth(env);
    if(event.cron==='0 10 * * *') { await seedCampaigns(env,register.campaigns); await reconcile(env); }
    // An unhealthy/unknown webhook raises a scheduled invocation failure for
    // platform monitoring. It never triggers automatic retries or new webhooks.
    if(health.status!=='enabled') throw new Error('webhook_health_failed');
  }
};
