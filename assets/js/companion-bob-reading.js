// Catalog-backed reading and free collection discovery. No provider key belongs here.
export function initializeBobReading(host) {
if (!host || host.dataset.readingInitialized === 'true') return;
host.dataset.readingInitialized = 'true';
const CHANNEL = 'oip-site-bob-v1';
const CANONICAL_ORIGIN = 'https://outsideinprint.org';
const REQUEST_TIMEOUT_MS = 25000;
const NO_EXACT_MATCHES = 'No exact matches…';
const frame = host?.querySelector('[data-bob-frame]');
const openOnArrival = !host.hidden;
const mobileDisclosure = matchMedia('(max-width: 768px), (pointer: coarse)');
const catalogUrl = host.dataset.bobCatalog || '/companion-bob/catalog.json';
const apiBase = host.dataset.bobReadingEnabled === 'true' ? validApiBase(host.dataset.bobApiBase) : '';
function validApiBase(raw) {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname) && ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') return '';
    return url.origin;
  } catch { return ''; }
}
const send = data => frame?.contentWindow?.postMessage({ channel: CHANNEL, ...data }, location.origin);
const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
let layout, lastTopic = '', currentQuery = '', results = [], seen = new Set(), history = [], currentIds = [];
const emptyPreferences = () => ({version:1,topic:'',mood:'',formats:[],minMinutes:null,maxMinutes:null,excludedTopics:[],discovery:false,anchorId:null});
let preferences = emptyPreferences(), lastRequestText = '', failedPayload = null, retryable = false, recoveryActions = [], responseMessage = '', showingPrevious = false;
let focusIntent = null, reservedTop = 0;
let dismissed = false, answered = false, busy = false, booted = false, sequence = 0;
let requestController, configured = false, apiStatus = 'unknown', model = '', catalogCount = 0, catalogVersion = '', requestId = '', replyState = 'idle', statusSequence = 0;
let hoverTimer, closeTimer, currentTrigger, currentCard, restoringFocus = false, interactionVersion = 0;
let discoveryDataPromise, discoveryMode = 'ai', discoveryIntro = '', collectionChoices = [], selectedCollection = null;
let collectionSeen = new Set(), collectionBounds = {min:null,max:null}, lastCollectionChoices = [];
const bubble = node('section', 'bob-reading');
// Backdrop blur must live in the parent document to sample the page beneath
// the transparent pet iframe. The input itself stays inside the pet runtime.
const composerGlass = node('div','bob-reading-glass'); composerGlass.hidden=true;
host?.prepend(composerGlass);
bubble.hidden = true;
bubble.setAttribute('aria-label', "Bob's reading suggestions");
bubble.setAttribute('aria-busy', 'false');
const liveStatus = node('div', 'bob-reading__live');
liveStatus.setAttribute('role', 'status');
liveStatus.setAttribute('aria-live', 'polite');
liveStatus.setAttribute('aria-atomic', 'true');
host?.append(liveStatus);
const head = node('div', 'bob-reading__head');
const name = node('span', 'bob-reading__name');
name.append(node('span', 'bob-reading__dot'), document.createTextNode('Bob · Reading guide'));
const close = node('button', 'bob-reading__close', '×');
close.type = 'button'; close.setAttribute('aria-label', 'Dismiss reading suggestions');
close.addEventListener('click', event => { dismissed = true; bubble.hidden = true; host.dataset.readingActive = 'false'; hideCard(); reserveTop(0); if(event.detail===0)send({type:'reading-focus'}); });
head.append(name, close);
const body = node('div', 'bob-reading__body');
bubble.append(head, body); host?.append(bubble);
const card = node('aside', 'bob-card');
card.id = 'bob-reading-preview-card'; card.hidden = true;
card.setAttribute('aria-label', 'Article preview');
document.body.append(card);
card.addEventListener('pointerenter', () => clearTimeout(closeTimer));
card.addEventListener('pointerleave', () => scheduleClose());
card.addEventListener('focusin', () => clearTimeout(closeTimer));
card.addEventListener('focusout', event => { if (!card.contains(event.relatedTarget)) scheduleClose(); });

const discoveryButton = node('button','bob-reading-launch','New subject');
discoveryButton.type='button';discoveryButton.hidden=true;
discoveryButton.setAttribute('aria-label','Explore three random collections with Bob');
discoveryButton.addEventListener('click',event=>{startDiscovery(event);send({type:'open-reading'});});
host.append(discoveryButton);

function announce(text) {
  const ticket = sequence;
  liveStatus.textContent = '';
  requestAnimationFrame(() => { if (ticket === sequence) liveStatus.textContent = text; });
}
function setBusy(value) {
  busy = value;
  bubble.setAttribute('aria-busy', String(value));
  send({type:'reading-status',busy:value});
}
function resetConversation() {
  sequence++;
  requestController?.abort(); requestController = undefined;
  setBusy(false);
  lastTopic = ''; currentQuery = ''; results = []; currentIds = []; history = []; seen.clear();
  preferences = emptyPreferences(); lastRequestText = ''; failedPayload = null; retryable = false; recoveryActions = []; responseMessage = ''; showingPrevious = false; focusIntent = null;
  answered = false; dismissed = false; replyState = 'idle'; requestId = '';
  discoveryMode = 'ai'; discoveryIntro = ''; collectionChoices = []; selectedCollection = null; collectionSeen.clear(); collectionBounds = {min:null,max:null};
  bubble.dataset.state = replyState;
  liveStatus.textContent = '';
  welcome();
}
function sample(items, count=3) {
  const pool=items.slice();
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  return pool.slice(0,count);
}
function loadDiscoveryData() {
  if(discoveryDataPromise)return discoveryDataPromise;
  discoveryDataPromise=(async()=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
    const response=await fetch(catalogUrl,{cache:'no-cache',signal:controller.signal});
    if(!response.ok)throw new Error('Collections could not be loaded. Please try again.');
    const catalog=await response.json(),directory=catalog;
    if(!Array.isArray(catalog.items)||directory.version!==1||!Array.isArray(directory.collections)||!(/^[a-f0-9]{64}$/).test(catalog.catalogVersion))throw new Error('Collections could not be read. Please try again.');
    const items=new Map(catalog.items.flatMap(item=>responseItems([item])).map(item=>[item.id,item]));
    const ids=new Set();
    const collections=directory.collections.map(collection=>{
      if(!collection||typeof collection.id!=='string'||typeof collection.title!=='string'||!collection.title.trim()||!safePath(collection)||!Array.isArray(collection.itemIds))throw new Error('Collections could not be read. Please try again.');
      const pieces=[...new Set(collection.itemIds)].map(id=>items.get(id)).filter(Boolean);
      return {id:collection.id,title:collection.title.slice(0,300),url:collection.url,items:pieces};
    }).filter(collection=>{if(ids.has(collection.id)||collection.items.length<3)return false;ids.add(collection.id);return true;});
    if(collections.length<3)throw new Error('Collections are not available yet. Please try again.');
    catalogVersion=catalog.catalogVersion;catalogCount=items.size;
    return {collections,items,catalogVersion};
    }finally{clearTimeout(timeout);}
  })().catch(error=>{discoveryDataPromise=undefined;throw error;});
  return discoveryDataPromise;
}
async function startDiscovery(event, options={}) {
  const keyboard=event?.detail===0;
  resetConversation();
  discoveryIntro=typeof options.intro==='string'?options.intro:'';
  discoveryMode='collections';answered=true;replyState='discovery-loading';bubble.dataset.state=replyState;
  responseMessage='Loading collections…';renderCollections();positionBubble();
  const ticket=sequence,interaction=interactionVersion;
  try {
    const {collections}=await loadDiscoveryData();
    if(ticket!==sequence||discoveryMode!=='collections')return;
    const fresh=collections.filter(collection=>!lastCollectionChoices.includes(collection.id));
    collectionChoices=sample(fresh.length>=3?fresh:collections);lastCollectionChoices=collectionChoices.map(collection=>collection.id);
    replyState='collections';responseMessage='';bubble.dataset.state=replyState;
    renderCollections();positionBubble();announce(`${discoveryIntro?discoveryIntro+' ':''}Choose a collection: ${collectionChoices.map(collection=>collection.title).join('; ')}.`);
    if(keyboard&&interaction===interactionVersion&&!dismissed)body.querySelector('.bob-reading__collection')?.focus({preventScroll:true});
  } catch(error) {
    if(ticket!==sequence||discoveryMode!=='collections')return;
    replyState='discovery-error';responseMessage=error.message||'Collections could not be loaded. Please try again.';bubble.dataset.state=replyState;
    renderCollections();positionBubble();announce(`${discoveryIntro?discoveryIntro+' ':''}${responseMessage}`);
  }
}
function renderCollections() {
  hideCard();body.replaceChildren();bubble.dataset.retained='false';bubble.dataset.mode='collections';
  bubble.dataset.discoveryIntro=String(Boolean(discoveryIntro));
  bubble.setAttribute('aria-label',"Bob's collection suggestions");
  if(discoveryIntro)body.append(node('p','bob-reading__message bob-reading__discovery-intro',discoveryIntro));
  if(responseMessage)body.append(node('p',`bob-reading__message${replyState==='discovery-error'?' bob-reading__error':''}`,responseMessage));
  const list=node('ul','bob-reading__list bob-reading__collections');list.setAttribute('aria-label','Collections to explore');
  collectionChoices.forEach(collection=>{
    const row=node('li'),button=node('button','bob-reading__collection');button.type='button';button.title=collection.title;
    button.setAttribute('aria-label',`Explore ${collection.title}, ${collection.items.length} pieces`);
    button.append(node('span','bob-reading__title',collection.title),node('span','bob-reading__meta',`${collection.items.length} pieces`));
    button.addEventListener('click',event=>{selectCollection(collection);if(event.detail===0)body.querySelector('.bob-reading__title')?.focus({preventScroll:true});});row.append(button);list.append(row);
  });
  body.append(list);
  const choices=node('div','bob-reading__refine');
  if(replyState==='discovery-error')choices.append(chip('Retry',event=>startDiscovery(event,{intro:discoveryIntro})));
  choices.append(chip('New subject',startDiscovery));body.append(choices);
}
function eligibleCollectionItems() {
  return (selectedCollection?.items||[]).filter(item=>(collectionBounds.min===null||(item.readingTime!==null&&item.readingTime>collectionBounds.min))&&(collectionBounds.max===null||(item.readingTime!==null&&item.readingTime<collectionBounds.max)));
}
function selectCollection(collection) {
  sequence++;discoveryMode='collection';selectedCollection=collection;collectionChoices=[];collectionSeen.clear();collectionBounds={min:null,max:null};
  preferences=emptyPreferences();history=[];seen.clear();lastTopic=collection.title;lastRequestText='';
  showCollectionPieces('select');
}
function showCollectionPieces(action) {
  hideCard();dismissed=false;responseMessage='';showingPrevious=false;
  if(action==='shorter'||action==='longer'){
    const times=results.map(item=>item.readingTime).filter(Number.isFinite).sort((a,b)=>a-b);
    const reference=times.length?times[Math.floor(times.length/2)]:null;
    if(reference!==null)collectionBounds=action==='shorter'?{min:null,max:reference}:{min:reference,max:null};
  }
  const eligible=eligibleCollectionItems(),fresh=eligible.filter(item=>!collectionSeen.has(item.id));
  const next=sample(fresh);
  preferences={...emptyPreferences(),discovery:true,minMinutes:collectionBounds.min===null?null:collectionBounds.min+0.001,maxMinutes:collectionBounds.max===null?null:collectionBounds.max-0.001};
  if(next.length){
    results=next;currentIds=results.map(item=>item.id);results.forEach(item=>{collectionSeen.add(item.id);seen.delete(item.id);seen.add(item.id);});seen=new Set([...seen].slice(-200));
    remember(action==='select'?`Explore the ${selectedCollection.title} collection.`:`${actionMessages[action]||'More'} from the ${selectedCollection.title} collection.`,'',results);
  }else{startDiscovery(undefined,{intro:NO_EXACT_MATCHES});return;}
  if(next.length<3&&next.length>0)responseMessage=`${next.length===1?'One last piece':'Two last pieces'} at this length.`;
  answered=true;replyState='collection';bubble.dataset.state=replyState;
  renderResults();positionBubble();announce(next.length?`${selectedCollection.title}: ${next.map(item=>item.title).join('; ')}.${responseMessage?' '+responseMessage:''}`:responseMessage);
}
async function refreshStatus() {
  if(!apiBase){apiStatus='disabled';configured=false;return;}
  const ticket = ++statusSequence;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${apiBase}/api/bob/status`, {cache:'no-store', signal:controller.signal,credentials:'omit'});
    if (!response.ok) throw new Error('Status unavailable');
    const status = await response.json();
    if (ticket !== statusSequence) return;
    configured = status.configured === true;
    apiStatus=configured?'enabled':'disabled';
    model = typeof status.model === 'string' ? status.model : '';
    catalogCount = Number.isInteger(status.catalogCount) ? status.catalogCount : 0;
  } catch {
    if (ticket !== statusSequence) return;
    configured = false;
    apiStatus='unknown';
  } finally { clearTimeout(timeout); }
}

function popupWidthAndLeft(preferred) {
  const p=layout?.petRect || layout?.rect;
  const j=layout?.jukeboxRect;
  const right=j && j.x>p.x ? Math.min(innerWidth-12,j.x-8) : innerWidth-12;
  const combined=Boolean(j && right-12<156);
  const width=Math.min(preferred,innerWidth-24,combined?preferred:right-12);
  const center=combined?(Math.min(p.x,j.x)+Math.max(p.x+p.width,j.x+j.width))/2:p.x+p.width/2;
  const left=Math.max(12,Math.min(innerWidth-width-12,combined?Infinity:right-width,center-width/2));
  return {width,left,combined,top:combined?Math.min(p.y,j.y):p.y};
}
function reserveTop(height) {
  const next=Math.max(0,Math.min(240,Math.ceil(height)));
  if(next!==reservedTop){reservedTop=next;send({type:'reading-reserve',height:next});}
}
function popupReserve(placement,height) {
  if(placement.combined)return height+24;
  const p=layout?.petRect||layout?.rect;
  return Math.max(0,height+16-(p.y-(layout.reservedTop||0)));
}
function positionBubble() {
  if (!layout?.visible || dismissed || host.hidden || (!answered && !busy)) { bubble.hidden = true; reserveTop(0); return; }
  bubble.hidden = false; host.dataset.readingActive = 'true';
  const r = layout.rect, p = layout.petRect || r;
  const vh = window.visualViewport?.height || innerHeight;
  const offsetY = window.visualViewport?.offsetTop || 0;
  const placement=popupWidthAndLeft(242), w=placement.width;
  bubble.style.width=`${w}px`;
  const h = bubble.offsetHeight;
  reserveTop(popupReserve(placement,Math.max(h,card.hidden?0:card.offsetHeight)));
  let left = placement.left;
  let top = Math.max(offsetY + 8, placement.top - h - 8), side = 'above';
  top = Math.min(top, offsetY + vh - h - 12);
  bubble.style.left = `${Math.round(left)}px`; bubble.style.top = `${Math.round(top)}px`;
  bubble.dataset.side = side;
  bubble.style.setProperty('--tail-top', `${Math.max(25, Math.min(h-28, p.y + p.height*.38-top))}px`);
  if (!card.hidden && currentTrigger?.isConnected) placeCard(currentTrigger);
}
function chip(label, action) {
  const button = node('button', 'bob-reading__chip', label); button.type = 'button';
  button.addEventListener('click', action); return button;
}
function welcome() {
  hideCard();
  body.replaceChildren();
  bubble.hidden = true;
  host.dataset.readingActive = 'false';
  positionBubble();
}
function preferenceDescription() {
  const parts=[preferences.topic,preferences.mood,...preferences.formats];
  const minimum=preferences.minMinutes===null?null:Math.ceil(preferences.minMinutes);
  const maximum=preferences.maxMinutes===null?null:Math.floor(preferences.maxMinutes);
  if(minimum!==null&&maximum!==null)parts.push(minimum===maximum?`${minimum} min`:`${minimum}–${maximum} min`);
  else if(minimum!==null)parts.push(`${minimum}+ min`);
  else if(maximum!==null)parts.push(`up to ${maximum} min`);
  if(preferences.excludedTopics.length)parts.push(`excluding ${preferences.excludedTopics.join(', ')}`);
  return parts.filter(Boolean).join(' · ');
}
function responsePreferences(value) {
  if(!value || value.version!==1 || typeof value.topic!=='string' || typeof value.mood!=='string' || !Array.isArray(value.formats) || !Array.isArray(value.excludedTopics) || !value.formats.every(v=>typeof v==='string') || !value.excludedTopics.every(v=>typeof v==='string') || ![value.minMinutes,value.maxMinutes].every(v=>v===null||(Number.isFinite(v)&&v>=0)) || typeof value.discovery!=='boolean' || !(value.anchorId===null||typeof value.anchorId==='string'))throw new Error('Bob returned an unreadable response. Please try again.');
  return structuredClone(value);
}
function safePath(item) {
  try {
    const u = new URL(item.url);
    if (u.origin !== CANONICAL_ORIGIN || u.username || u.password || u.pathname.startsWith('//')) return null;
    return u.pathname + u.search + u.hash;
  } catch { return null; }
}
function safeImage(src) {
  if (!src || typeof src !== 'string') return '';
  const path = safePath({url:src});
  return path || '';
}
function responseItems(items) {
  if (!Array.isArray(items)) throw new Error('Bob returned an unreadable response. Please try again.');
  const unique = new Set();
  return items.slice(0,3).map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || !item.title.trim() || !safePath(item)) {
      throw new Error('Bob returned an invalid reading link. Please try again.');
    }
    return {
      id:item.id, url:item.url, title:item.title.slice(0,300),
      summary:typeof item.summary === 'string' ? item.summary.slice(0,3000) : '',
      type:typeof item.type === 'string' ? item.type.slice(0,80) : 'Essay',
      readingTime:Number.isFinite(item.readingTime) && item.readingTime > 0 ? item.readingTime : null,
      image:{src:safeImage(item.image?.src),alt:typeof item.image?.alt === 'string' ? item.image.alt.slice(0,600) : ''},
    };
  }).filter(item => { if (unique.has(item.id)) return false; unique.add(item.id); return true; });
}
function typeName(item) { return item.type === 'dialogue' ? 'Syd & Oliver' : item.type === 'affirmation' ? 'The Things We Say' : (item.type || 'Essay').replace(/[-_]/g,' '); }
function meta(item) { return item.readingTime ? `${typeName(item)} · ${item.readingTime} min read` : typeName(item); }
function remember(query, message, items) {
  const response = items.length ? items.map(item => `${item.title} [${item.id}]`).join('; ') : message;
  history.push({role:'user',content:query},{role:'assistant',content:response.slice(0,1000)});
  history=history.slice(-8);
}
function editRequest() {
  hideCard();
  send({type:'reading-edit',text:lastRequestText || currentQuery});
}
const actionMessages={shorter:'Something shorter',longer:'Something longer',more:'More like these',relax_time:'Allow a longer read',clear_filters:'Clear filters'};
function refine(action) {
  if(discoveryMode==='collection'){showCollectionPieces(action);return;}
  recommend(actionMessages[action],{action});
}
function requestPayload(message,action) {
  const payload={message,action,preferences,history:history.slice(),seenIds:[...seen],currentIds};
  if(catalogVersion)payload.catalogVersion=catalogVersion;
  const bytes=value=>new TextEncoder().encode(value).length;
  let serialized=JSON.stringify(payload);
  while(bytes(serialized)>16384&&payload.history.length){payload.history.splice(0,Math.min(2,payload.history.length));serialized=JSON.stringify(payload);}
  while(bytes(serialized)>16384&&payload.seenIds.length){payload.seenIds.shift();serialized=JSON.stringify(payload);}
  return bytes(serialized)<=16384?serialized:null;
}
async function recommend(raw, options={}) {
  const query = String(raw).trim().slice(0,500);
  if (!query || busy) return;
  if(!apiBase||apiStatus==='disabled'){startDiscovery(undefined,{intro:'AI suggestions are unavailable. Explore a collection.'});return;}
  // The visible IDs and short catalog history keep ordinal references useful.
  // A typed request leaves local browsing; the API has no collection filter.
  discoveryMode='ai';discoveryIntro='';collectionChoices=[];selectedCollection=null;
  const action=options.action || 'search';
  const payload=options.payload || requestPayload(query,action);
  if(action==='search'&&!options.payload)lastRequestText=query;
  if(!payload){currentQuery=query;answered=true;dismissed=false;replyState='error';bubble.dataset.state=replyState;showingPrevious=results.length>0;retryable=false;failedPayload=null;responseMessage='This request is too long. Please shorten it or start a new subject.';renderResults();positionBubble();announce(responseMessage);return;}
  currentQuery = query; requestId = ''; dismissed = false; hideCard();
  const ticket = ++sequence;
  focusIntent=Number.isInteger(options.focusToken)?{ticket,token:options.focusToken}:null;
  const controller = new AbortController(); requestController = controller;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); },REQUEST_TIMEOUT_MS);
  setBusy(true); replyState = 'pending'; bubble.dataset.state = replyState;
  showingPrevious=results.length>0;responseMessage='Finding new suggestions…';recoveryActions=[];
  renderResults();positionBubble();
  announce('Bob is finding reading suggestions.');
  try {
    const response = await fetch(`${apiBase}/api/bob/recommend`, {
      method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal,
      body:payload,credentials:'omit',
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error('Bob’s reading service returned an unreadable response. Please try again.'); }
    if (ticket !== sequence) return;
    const message = typeof data?.message === 'string' ? data.message.trim().slice(0,500) : '';
    requestId = typeof data?.requestId === 'string' ? data.requestId : '';
    if (!response.ok) {
      if(['service_disabled','budget_exhausted'].includes(data?.code)){
        startDiscovery(undefined,{intro:data.code==='budget_exhausted'?'AI suggestions have reached their limit. Explore a collection.':'AI suggestions are unavailable. Explore a collection.'});return;
      }
      if(data?.code==='catalog_changed'){discoveryDataPromise=undefined;catalogVersion='';}
      const error=new Error(message || 'Bob’s reading service is unavailable. Please try again.');
      error.retryable=data?.retryable===true;error.catalogChanged=data?.code==='catalog_changed';throw error;
    }
    const nextItems=responseItems(data?.items), nextPreferences=responsePreferences(data?.preferences);
    if(!['results','empty','clarify','redirect','explanation'].includes(data?.outcome))throw new Error('Bob returned an unreadable response. Please try again.');
    const outcome=data.outcome;
    if(outcome==='empty'&&!nextItems.length){startDiscovery(undefined,{intro:NO_EXACT_MATCHES});return;}
    const newMatches=outcome==='results'&&nextItems.length>0;
    preferences=nextPreferences;lastTopic=preferences.topic;
    if(newMatches||(!results.length&&nextItems.length)){results=nextItems;results.forEach(item=>{seen.delete(item.id);seen.add(item.id);});seen=new Set([...seen].slice(-200));currentIds=results.map(item=>item.id);}
    showingPrevious=!newMatches&&results.length>0;
    failedPayload=null;retryable=false;
    recoveryActions=Array.isArray(data.recoveryActions)?[...new Set(data.recoveryActions.filter(action=>['relax_time','clear_filters'].includes(action)))]:[];
    model = typeof data.model === 'string' ? data.model : model;
    catalogCount = Number.isInteger(data.catalogCount) ? data.catalogCount : catalogCount;
    responseMessage = nextItems.length&&outcome==='results'?'':message || (nextItems.length ? '' : 'No new matches. Try another subject or reading length.');
    remember(query,responseMessage,nextItems);
    answered = true; replyState = outcome; bubble.dataset.state = replyState;
    setBusy(false);
    renderResults();
    announce(newMatches ? `Bob found ${nextItems.length} reading suggestions: ${nextItems.map(item => item.title).join('; ')}.` : `${responseMessage}${showingPrevious?' Your earlier picks are still available.':''}`);
  } catch (error) {
    if (ticket !== sequence) return;
    answered = true; replyState = 'error'; bubble.dataset.state = replyState;
    showingPrevious=results.length>0;failedPayload=payload;retryable=error.retryable!==false;
    // An explicit Retry may use the Worker's current release after a version
    // conflict. Never automatically resubmit a model request.
    if(error.catalogChanged){const retryPayload=JSON.parse(payload);delete retryPayload.catalogVersion;failedPayload=JSON.stringify(retryPayload);}
    responseMessage = timedOut ? 'Bob took too long to reply. Please try again.' : error instanceof TypeError ? 'Bob’s reading service could not be reached. Please try again.' : error.message || 'Bob could not reply. Please try again.';
    setBusy(false);renderResults(); announce(`${responseMessage}${showingPrevious?' Your earlier picks are still available.':''}`);
  } finally {
    clearTimeout(timeout);
    if (ticket === sequence) {
      requestController = undefined; setBusy(false); positionBubble();
      requestAnimationFrame(() => { if (ticket === sequence && focusIntent?.ticket===ticket && document.activeElement===frame && !dismissed)send({type:'reading-focus',ifUnchanged:focusIntent.token}); });
    }
  }
}
function renderResults() {
  body.replaceChildren();
  bubble.dataset.mode=discoveryMode;
  bubble.setAttribute('aria-label',"Bob's reading suggestions");
  bubble.dataset.retained=String(showingPrevious);
  if(discoveryMode==='collection'&&selectedCollection){const label=node('p','bob-reading__collection-label',selectedCollection.title);label.title=selectedCollection.title;body.append(label);}
  if (responseMessage) body.append(node('p',`bob-reading__message${replyState==='error'?' bob-reading__error':''}`,responseMessage));
  if(showingPrevious)body.append(node('p','bob-reading__previous',replyState==='explanation'?'Current picks':'Earlier picks'));
  const list = node('ol','bob-reading__list');
  list.setAttribute('aria-label',showingPrevious?'Earlier reading suggestions':'Reading suggestions');
  results.forEach(item => {
    const li = node('li','bob-reading__item');
    const main = node('div');
    const link = node('a','bob-reading__title',item.title); link.href=safePath(item);
    link.title=item.title;
    link.addEventListener('pointermove',event=> {if(event.pointerType!=='touch'&&matchMedia('(hover:hover)').matches&&!busy) scheduleCard(item,link);});
    link.addEventListener('pointerleave',scheduleClose);
    link.addEventListener('focus',()=>{if(link.matches(':focus-visible')&&!restoringFocus&&!busy)showCard(item,link);});
    link.addEventListener('blur',event=> {if(!card.contains(event.relatedTarget)) scheduleClose();});
    main.append(link,node('div','bob-reading__meta',meta(item)));
    const peek = node('button','bob-reading__peek','◧'); peek.type='button';
    peek.disabled=busy;
    peek.setAttribute('aria-label',`Preview ${item.title}`); peek.setAttribute('aria-controls',card.id); peek.setAttribute('aria-expanded','false');
    peek.addEventListener('click',()=> {
      if(!card.hidden && currentCard?.id===item.id){hideCard();return;}
      showCard(item,peek); card.querySelector('button')?.focus({preventScroll:true});
    });
    li.append(main,peek); list.append(li);
  });
  body.append(list);
  const choices=node('div','bob-reading__refine');
  const description=preferenceDescription();choices.title=description;choices.setAttribute('aria-label',description?`Refine reading suggestions. ${description}`:'Refine reading suggestions');choices.setAttribute('role','group');
  if(discoveryMode==='collection'){
    const fresh=eligibleCollectionItems().filter(item=>!collectionSeen.has(item.id));
    for(const [label,action] of [['Shorter','shorter'],['Longer','longer'],['More','more']]){
      const button=chip(label,()=>refine(action));button.disabled=action==='more'&&!fresh.length;
      if(button.disabled)button.title='Every piece at this length has been shown';choices.append(button);
    }
  }else if(replyState==='error'){
    if(retryable&&failedPayload)choices.append(chip('Retry',()=>recommend(JSON.parse(failedPayload).message,{payload:failedPayload})));
    choices.append(chip('Edit request',editRequest));
  }else if(!busy&&replyState!=='results'&&replyState!=='explanation'){
    recoveryActions.forEach(action=>choices.append(chip(action==='relax_time'?(preferences.maxMinutes===null?'Any length':'Allow longer'):'Clear filters',()=>refine(action))));
    choices.append(chip('Edit request',editRequest));
  }else if(results.length){
    for(const [label,action] of [['Shorter','shorter'],['Longer','longer'],['More','more']]){const button=chip(label,()=>refine(action));button.disabled=busy;choices.append(button);}
  }
  choices.append(chip('New subject',startDiscovery));
  body.append(choices);
}
function scheduleCard(item,trigger){clearTimeout(hoverTimer);clearTimeout(closeTimer);hoverTimer=setTimeout(()=>showCard(item,trigger),160);}
function scheduleClose(){clearTimeout(hoverTimer);clearTimeout(closeTimer);closeTimer=setTimeout(()=>{if(!card.matches(':hover')&&!card.contains(document.activeElement))hideCard();},220);}
function hideCard(){clearTimeout(hoverTimer);clearTimeout(closeTimer);currentTrigger?.setAttribute('aria-expanded','false');currentTrigger?.removeAttribute('aria-describedby');card.hidden=true;currentCard=null;}
function restoreTriggerFocus(trigger){restoringFocus=true;trigger?.focus({preventScroll:true});requestAnimationFrame(()=>{restoringFocus=false;});}
function showCard(item,trigger){
  clearTimeout(hoverTimer);clearTimeout(closeTimer);
  currentTrigger?.setAttribute('aria-expanded','false');currentTrigger?.removeAttribute('aria-describedby');
  currentTrigger=trigger;currentCard=item;trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-describedby',card.id);
  card.replaceChildren();
  card.classList.toggle('bob-card--text-only',!item.image.src);
  const image=item.image.src ? node('img','bob-card__image') : null;
  if(image){image.src=item.image.src;image.alt=item.image.alt || '';image.loading='eager';}
  const dismiss=node('button','bob-card__close','×');dismiss.type='button';dismiss.setAttribute('aria-label','Close article preview');
  dismiss.addEventListener('click',()=>{const previous=currentTrigger;hideCard();restoreTriggerFocus(previous);});
  const content=node('div','bob-card__body');const read=node('a','bob-card__read','Read this piece →');read.href=safePath(item);
  content.append(node('p','bob-card__meta',meta(item)),node('h2','bob-card__title',item.title),node('p','bob-card__summary',item.summary),read);
  if(image)card.append(image);
  card.append(dismiss,content);card.hidden=false;placeCard(trigger);
  image?.addEventListener('load',()=>{if(image.isConnected && !card.hidden)placeCard(trigger);},{once:true});
  image?.addEventListener('error',()=>{if(!image.isConnected)return;image.remove();card.classList.add('bob-card--text-only');if(!card.hidden)placeCard(trigger);},{once:true});
}
function placeCard(trigger){
  const br=bubble.getBoundingClientRect(), p=layout?.petRect || br, placement=popupWidthAndLeft(260);
  card.style.width=`${placement.width}px`;
  card.classList.toggle('bob-card--narrow',placement.width<220);
  const h=card.offsetHeight, y=placement.top-h-10;
  reserveTop(popupReserve(placement,Math.max(h,bubble.offsetHeight)));
  const view=window.visualViewport, offset=view?.offsetTop||0, height=view?.height||innerHeight;
  card.style.left=`${Math.round(placement.left)}px`;
  card.style.top=`${Math.round(Math.max(offset+12,Math.min(offset+height-h-12,y)))}px`;
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin || event.source!==frame?.contentWindow || event.data?.channel!==CHANNEL)return;
  const data=event.data;
  if(data.type==='reading-query' && typeof data.text==='string')recommend(data.text,{focusToken:data.focusToken});
  if(data.type==='reading-layout' && data.rect && [data.rect.x,data.rect.y,data.rect.width,data.rect.height].every(Number.isFinite)){
    layout=data;composerGlass.hidden=!data.visible;
    Object.assign(composerGlass.style,{left:`${data.rect.x}px`,top:`${data.rect.y}px`,width:`${data.rect.width}px`,height:`${data.rect.height}px`});
    discoveryButton.hidden=!data.visible||!apiBase;
    Object.assign(discoveryButton.style,{left:`${data.rect.x+5}px`,top:`${Math.min(innerHeight-30,data.rect.y+data.rect.height+2)}px`});
    positionBubble();if(!data.visible)hideCard();
  }
  // Desktop opens during initial readiness. Mobile waits for Bob, then gear.
  // A delayed open would close that first interaction. Restoring hidden Bob
  // retains his existing collapsed-controls behavior.
  if(data.type==='painted'&&!booted){booted=true;send({type:'reading-config',enabled:Boolean(apiBase)});if(openOnArrival&&!mobileDisclosure.matches)send({type:'open-reading'});}
  if(data.type==='reading-discover')startDiscovery();
  if(data.type==='hide'){bubble.hidden=true;hideCard();reserveTop(0);focusIntent=null;}
  if(data.type==='reading-dismiss'){
    if(!card.hidden)hideCard();else {dismissed=true;bubble.hidden=true;host.dataset.readingActive='false';reserveTop(0);}
  }
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(!card.hidden){const focusInside=card.contains(document.activeElement),previous=currentTrigger;hideCard();if(focusInside)restoreTriggerFocus(previous);event.preventDefault();}
  else if(!bubble.hidden){dismissed=true;bubble.hidden=true;host.dataset.readingActive='false';reserveTop(0);send({type:'reading-focus'});event.preventDefault();}
});
document.addEventListener('pointerdown',()=>{interactionVersion++;if(busy)focusIntent=null;},true);
document.addEventListener('keydown',()=>{interactionVersion++;if(busy)focusIntent=null;},true);
document.addEventListener('focusin',()=>{interactionVersion++;if(busy)focusIntent=null;},true);
window.addEventListener('resize',positionBubble);window.visualViewport?.addEventListener('resize',positionBubble);window.visualViewport?.addEventListener('scroll',positionBubble);
document.addEventListener('oip:before-route',hideCard);
document.addEventListener('oip:route',()=>requestAnimationFrame(positionBubble));
new ResizeObserver(positionBubble).observe(body);
new MutationObserver(()=>{if(host.hidden){bubble.hidden=true;hideCard();reserveTop(0);focusIntent=null;}}).observe(host,{attributes:true,attributeFilter:['hidden']});
welcome();
refreshStatus();
window.render_bob_reading_to_text=()=>JSON.stringify({apiEnabled:Boolean(apiBase),apiConfigured:configured,model,catalogCount,catalogVersion,requestId,state:replyState,mode:discoveryMode,collection:selectedCollection?{id:selectedCollection.id,title:selectedCollection.title,bounds:collectionBounds,seenCount:collectionSeen.size,remaining:eligibleCollectionItems().filter(item=>!collectionSeen.has(item.id)).length}:null,collections:collectionChoices.map(({id,title,items})=>({id,title,itemCount:items.length})),query:currentQuery,topic:lastTopic,preferences,busy,historyCount:history.length,seenCount:seen.size,showingPrevious,retryable,recoveryActions,reservedTop,visible:!bubble.hidden,composer:layout,results:results.map(({id,title,url})=>({id,title,url})),card:currentCard?.title||null});
const originalState=window.render_game_to_text;
window.render_game_to_text=()=>JSON.stringify({pet:originalState?JSON.parse(originalState()):null,reading:JSON.parse(window.render_bob_reading_to_text())});
}
