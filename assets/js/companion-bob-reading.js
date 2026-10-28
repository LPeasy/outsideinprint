// Catalog-backed reading and free collection discovery. No provider key belongs here.
export function initializeBobReading(host, { onNavigate } = {}) {
if (!host || host.dataset.readingInitialized === 'true') return;
host.dataset.readingInitialized = 'true';
const CHANNEL = 'oip-site-bob-v1';
const CANONICAL_ORIGIN = 'https://outsideinprint.org';
const REQUEST_TIMEOUT_MS = 25000;
const NO_EXACT_MATCHES = 'No exact matches…';
const frame = host?.querySelector('[data-bob-frame]');
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
const emptyPreferences = () => ({version:1,topic:'',mood:'',formats:[],minMinutes:null,maxMinutes:null,excludedTopics:[],discovery:false,anchorId:null,collectionId:null});
let preferences = emptyPreferences(), lastRequestText = '', failedPayload = null, retryable = false, recoveryActions = [], responseMessage = '', showingPrevious = false;
let focusIntent = null, reservedTop = 0;
let dismissed = false, answered = false, busy = false, booted = false, sequence = 0;
let requestController, configured = false, apiStatus = 'unknown', model = '', catalogCount = 0, catalogVersion = '', requestId = '', replyState = 'idle', statusSequence = 0;
let hoverTimer, closeTimer, currentTrigger, currentCard, restoringFocus = false, interactionVersion = 0;
let discoveryDataPromise, discoveryCatalog, discoveryMode = 'ai', discoveryIntro = '', collectionChoices = [], selectedCollection = null;
let collectionSeen = new Set(), collectionBounds = {min:null,max:null}, lastCollectionChoices = [];
let currentArticle = null, articleSequence = 0, routeChanging = false, activeRequestContext = null, typing = false;
const bubble = node('section', 'bob-reading');
bubble.tabIndex = -1;
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
const articleButton = node('button','bob-reading-article','Like this article');
articleButton.type='button';articleButton.hidden=true;
articleButton.addEventListener('click',()=>{
  // Resolve again at activation; a persistent Bob can outlive several routes.
  currentArticle=articleAtLocation();updateLaunchers();
  if(currentArticle)recommend('Like this article');
});
host.append(articleButton);

function articleAtLocation() {
  if(routeChanging||!discoveryCatalog)return null;
  const item=discoveryCatalog.items.get(location.pathname);
  return item&&safePath(item)===location.pathname?item:null;
}
function updateLaunchers() {
  const visible=Boolean(layout?.visible&&!host.hidden&&!typing&&!routeChanging);
  discoveryButton.hidden=!visible||!apiBase;
  articleButton.hidden=!visible||!apiBase||apiStatus==='disabled'||!currentArticle;
  articleButton.disabled=busy;
  articleButton.title=currentArticle?`Find reading related to ${currentArticle.title}`:'';
  if(!layout?.rect)return;
  const {x,y,width,height}=layout.rect,view=readingViewport();
  const top=Math.max(view.top+8,Math.min(view.bottom-30,y+height+2));
  const discoveryWidth=discoveryButton.offsetWidth||64,articleWidth=articleButton.offsetWidth||90;
  const left=Math.max(view.left+12,Math.min(view.right-discoveryWidth-12,x+5));
  const right=Math.max(view.left+articleWidth+12,Math.min(view.right-12,x+width-5));
  Object.assign(discoveryButton.style,{left:`${left}px`,top:`${top}px`,maxWidth:`${Math.max(1,view.width-24)}px`});
  Object.assign(articleButton.style,{left:`${right}px`,top:`${top}px`,maxWidth:`${Math.max(1,view.width-24)}px`});
}
async function refreshArticleContext() {
  const ticket=++articleSequence,path=location.pathname;
  currentArticle=articleAtLocation();updateLaunchers();
  try {
    await loadDiscoveryData();
    if(ticket!==articleSequence||routeChanging||path!==location.pathname)return;
    currentArticle=articleAtLocation();updateLaunchers();
  } catch {
    // Article context is optional. A failed static read must not open a popup
    // or turn an ordinary search into a request about an unverified article.
    if(ticket===articleSequence){currentArticle=null;updateLaunchers();}
  }
}

function announce(text) {
  const ticket = sequence;
  liveStatus.textContent = '';
  requestAnimationFrame(() => { if (ticket === sequence) liveStatus.textContent = text; });
}
function setBusy(value) {
  busy = value;
  bubble.setAttribute('aria-busy', String(value));
  send({type:'reading-status',busy:value});
  updateLaunchers();
}
function resetConversation() {
  sequence++;
  requestController?.abort(); requestController = undefined;
  activeRequestContext=null;
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
    discoveryCatalog={collections,items,catalogVersion};
    currentArticle=articleAtLocation();updateLaunchers();
    return discoveryCatalog;
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
  return (selectedCollection?.items||[...(discoveryCatalog?.items.values()||[])]).filter(item=>(collectionBounds.min===null||(item.readingTime!==null&&item.readingTime>collectionBounds.min))&&(collectionBounds.max===null||(item.readingTime!==null&&item.readingTime<collectionBounds.max)));
}
function selectCollection(collection) {
  sequence++;discoveryMode='collection';selectedCollection=collection;collectionChoices=[];collectionSeen.clear();collectionBounds={min:null,max:null};
  preferences=emptyPreferences();history=[];seen.clear();lastTopic=collection.title;lastRequestText='';
  showCollectionPieces('select');
}
function showCollectionPieces(action, options={}) {
  hideCard();dismissed=false;responseMessage='';showingPrevious=false;
  if(action==='shorter'||action==='longer'){
    const times=results.map(item=>item.readingTime).filter(Number.isFinite).sort((a,b)=>a-b);
    const reference=times.length?times[Math.floor(times.length/2)]:null;
    if(reference!==null)collectionBounds=action==='shorter'?{min:null,max:reference}:{min:reference,max:null};
  }
  const eligible=eligibleCollectionItems(),fresh=eligible.filter(item=>!collectionSeen.has(item.id));
  const next=sample(fresh);
  preferences={...emptyPreferences(),discovery:true,collectionId:selectedCollection?.id||null,minMinutes:collectionBounds.min===null?null:collectionBounds.min+0.001,maxMinutes:collectionBounds.max===null?null:collectionBounds.max-0.001};
  if(next.length){
    results=next;currentIds=results.map(item=>item.id);results.forEach(item=>{collectionSeen.add(item.id);seen.delete(item.id);seen.add(item.id);});seen=new Set([...seen].slice(-200));
    const scope=selectedCollection?`the ${selectedCollection.title} collection`:'the reading catalog';
    remember(action==='select'?`Explore ${scope}.`:`${actionMessages[action]||'More'} from ${scope}.`,'',results);
  }else{startDiscovery(options.keyboard?{detail:0}:undefined,{intro:NO_EXACT_MATCHES});return false;}
  if(next.length<3&&next.length>0)responseMessage=`${next.length===1?'One last piece':'Two last pieces'} at this length.`;
  answered=true;replyState='collection';bubble.dataset.state=replyState;
  renderResults();positionBubble();announce(next.length?`${selectedCollection?.title||'Reading suggestions'}: ${next.map(item=>item.title).join('; ')}.${responseMessage?' '+responseMessage:''}`:responseMessage);
  return true;
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
  } finally { clearTimeout(timeout);updateLaunchers(); }
}

function readingViewport() {
  const viewport=window.visualViewport;
  const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
  const width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
  return {left,top,width,height,right:left+width,bottom:top+height};
}
function popupWidthAndLeft(preferred) {
  const p=layout?.petRect || layout?.rect;
  const j=layout?.jukeboxRect;
  const view=readingViewport(),start=view.left+12;
  const right=j && j.x>p.x ? Math.min(view.right-12,j.x-8) : view.right-12;
  const combined=Boolean(j && right-start<156);
  const width=Math.max(1,Math.min(preferred,view.width-24,combined?preferred:right-start));
  const center=combined?(Math.min(p.x,j.x)+Math.max(p.x+p.width,j.x+j.width))/2:p.x+p.width/2;
  const left=Math.max(start,Math.min(view.right-width-12,combined?Infinity:right-width,center-width/2));
  return {width,left,combined,top:combined?Math.min(p.y,j.y):p.y};
}
function reserveTop(height) {
  const next=Math.max(0,Math.min(240,Math.ceil(height)));
  if(next!==reservedTop){reservedTop=next;send({type:'reading-reserve',height:next});}
}
function popupReserve(placement,height) {
  if(placement.combined)return height+24;
  const p=layout?.petRect||layout?.rect;
  return Math.max(0,height+16-(p.y-readingViewport().top-(layout.reservedTop||0)));
}
function positionBubble() {
  updateLaunchers();
  if (!layout?.visible || dismissed || host.hidden || typing || (!answered && !busy)) { bubble.hidden = true; host.dataset.readingActive='false'; if(typing)hideCard(); reserveTop(0); return; }
  bubble.hidden = false; host.dataset.readingActive = 'true';
  const r = layout.rect, p = layout.petRect || r;
  const view=readingViewport();
  const placement=popupWidthAndLeft(242), w=placement.width;
  bubble.style.width=`${w}px`;
  bubble.style.maxHeight=`${Math.max(1,view.height-24)}px`;
  const bodyLimit=bubble.dataset.mode==='collections'?200:showingPrevious?190:180;
  body.style.maxHeight=`${Math.max(0,Math.min(bodyLimit,view.height-42))}px`;
  const h = bubble.offsetHeight;
  reserveTop(popupReserve(placement,Math.max(h,card.hidden?0:card.offsetHeight)));
  let left = placement.left;
  let top = Math.max(view.top+12,Math.min(placement.top-h-8,view.bottom-h-12)), side = 'above';
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
function timeLabel(value) {
  const minimum=value.minMinutes===null?null:Math.ceil(value.minMinutes);
  const maximum=value.maxMinutes===null?null:Math.floor(value.maxMinutes);
  if(minimum!==null&&maximum!==null)return minimum===maximum?`${minimum} min`:`${minimum}–${maximum} min`;
  if(minimum!==null)return `${minimum}+ min`;
  return maximum===null?'':`up to ${maximum} min`;
}
function activeFilters() {
  const filters=[];
  if(preferences.collectionId){
    const collection=discoveryCatalog?.collections.find(item=>item.id===preferences.collectionId);
    const label=collection?.title||preferences.collectionId.replace(/-/g,' ');
    filters.push({key:'collection',label,removeLabel:`Remove collection filter: ${label}`});
  }
  const duration=timeLabel(preferences);
  if(duration)filters.push({key:'time',label:duration,removeLabel:`Remove reading time filter: ${duration}`});
  if(preferences.mood)filters.push({key:'mood',label:preferences.mood,removeLabel:`Remove mood filter: ${preferences.mood}`});
  preferences.formats.forEach(format=>{const label=typeName({type:format});filters.push({key:`format:${format}`,label,removeLabel:`Remove format filter: ${label}`});});
  preferences.excludedTopics.forEach(topic=>filters.push({key:`exclude:${topic}`,label:`Not ${topic}`,removeLabel:`Remove excluded topic: ${topic}`}));
  if(preferences.anchorId){
    const anchor=discoveryCatalog?.items.get(preferences.anchorId)||results.find(item=>item.id===preferences.anchorId);
    const title=anchor?.title||'selected piece';
    filters.push({key:'anchor',label:`Like: ${title}`,removeLabel:`Remove related article filter: ${title}`});
  }
  return filters;
}
function preferenceDescription() {
  return [preferences.topic,...activeFilters().map(filter=>filter.label)].filter(Boolean).join(' · ');
}
function renderFilters() {
  const filters=activeFilters();
  if(!filters.length)return;
  const strip=node('div','bob-reading__filters');strip.setAttribute('role','group');
  strip.setAttribute('aria-label',`Active reading filters, ${filters.length}. Remove a filter to update suggestions.`);
  strip.addEventListener('focusin',event=>{
    const target=event.target.getBoundingClientRect(),bounds=strip.getBoundingClientRect();
    if(target.left<bounds.left)strip.scrollLeft-=bounds.left-target.left;
    else if(target.right>bounds.right)strip.scrollLeft+=target.right-bounds.right;
  });
  filters.forEach((filter,index)=>{
    const button=node('button','bob-reading__filter');button.type='button';button.disabled=busy;
    button.dataset.filterKey=filter.key;button.title=filter.removeLabel;button.setAttribute('aria-label',filter.removeLabel);
    const remove=node('span','bob-reading__filter-remove','×');remove.setAttribute('aria-hidden','true');
    button.append(node('span','bob-reading__filter-label',filter.label),remove);
    button.addEventListener('click',event=>removeFilter(filter.key,index,event.detail===0));
    strip.append(button);
  });
  body.append(strip);
}
function focusAfterFilterRemoval(index) {
  const filters=[...body.querySelectorAll('.bob-reading__filter:not(:disabled)')];
  const target=filters[Math.min(index,filters.length-1)]||body.querySelector('.bob-reading__refine button:not(:disabled)');
  target?.focus({preventScroll:true});
}
function removeFilter(key,index,keyboard) {
  if(busy)return;
  const next=structuredClone(preferences);
  if(key==='collection')next.collectionId=null;
  else if(key==='time'){next.minMinutes=null;next.maxMinutes=null;}
  else if(key==='mood')next.mood='';
  else if(key==='anchor')next.anchorId=null;
  else if(key.startsWith('format:'))next.formats=next.formats.filter(value=>value!==key.slice(7));
  else if(key.startsWith('exclude:'))next.excludedTopics=next.excludedTopics.filter(value=>value!==key.slice(8));
  else return;
  if(!next.topic&&!next.anchorId)next.discovery=true;
  if(discoveryMode==='collection'){
    if(key==='collection')selectedCollection=null;
    if(key==='time')collectionBounds={min:null,max:null};
    const updated=showCollectionPieces('apply_filters',{keyboard});
    if(keyboard&&updated)focusAfterFilterRemoval(index);
    return;
  }
  recommend('',{action:'apply_filters',preferences:next,filterFocus:keyboard?index:null});
}
function validArticleId(id) {
  if(typeof id!=='string'||!id.startsWith('/')||id.startsWith('//'))return false;
  try {const url=new URL(id,CANONICAL_ORIGIN);return url.origin===CANONICAL_ORIGIN&&url.pathname===id&&!url.search&&!url.hash;}catch{return false;}
}
function responsePreferences(value) {
  if(!value || value.version!==1 || typeof value.topic!=='string' || typeof value.mood!=='string' || !Array.isArray(value.formats) || !Array.isArray(value.excludedTopics) || !value.formats.every(v=>typeof v==='string') || !value.excludedTopics.every(v=>typeof v==='string') || ![value.minMinutes,value.maxMinutes].every(v=>v===null||(Number.isFinite(v)&&v>=0)) || typeof value.discovery!=='boolean' || !(value.anchorId===null||validArticleId(value.anchorId)) || !(value.collectionId==null||(typeof value.collectionId==='string'&&value.collectionId.length<=200&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.collectionId))))throw new Error('Bob returned an unreadable response. Please try again.');
  return {...structuredClone(value),collectionId:value.collectionId??null};
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
    if (!item || !validArticleId(item.id) || typeof item.title !== 'string' || !item.title.trim() || safePath(item)!==item.id) {
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
const actionMessages={shorter:'Something shorter',longer:'Something longer',more:'More like these',relax_time:'Allow a longer read',clear_filters:'Clear filters',apply_filters:'Update reading filters'};
function refine(action) {
  if(discoveryMode==='collection'){showCollectionPieces(action);return;}
  recommend(actionMessages[action],{action});
}
function requestPayload(message,action,nextPreferences=preferences) {
  const payload={message,action,preferences:nextPreferences,history:history.slice(),seenIds:[...seen],currentIds};
  const article=articleAtLocation();
  if(article)payload.context={articleId:article.id};
  if(catalogVersion)payload.catalogVersion=catalogVersion;
  const bytes=value=>new TextEncoder().encode(value).length;
  let serialized=JSON.stringify(payload);
  while(bytes(serialized)>16384&&payload.history.length){payload.history.splice(0,Math.min(2,payload.history.length));serialized=JSON.stringify(payload);}
  while(bytes(serialized)>16384&&payload.seenIds.length){payload.seenIds.shift();serialized=JSON.stringify(payload);}
  return bytes(serialized)<=16384?serialized:null;
}
async function recommend(raw, options={}) {
  const query = String(raw).trim().slice(0,500);
  const action=options.action || (options.payload?JSON.parse(options.payload).action:'search') || 'search';
  if ((!query&&action!=='apply_filters') || busy) return;
  if(!apiBase||apiStatus==='disabled'){startDiscovery(undefined,{intro:'AI suggestions are unavailable. Explore a collection.'});return;}
  // A typed request retains the explicit collection preference and visible
  // IDs, so both collection scope and ordinal references survive the handoff.
  discoveryMode='ai';discoveryIntro='';collectionChoices=[];selectedCollection=null;
  const payload=options.payload || requestPayload(query,action,options.preferences);
  if(action==='search'&&!options.payload)lastRequestText=query;
  if(!payload){currentQuery=query;answered=true;dismissed=false;replyState='error';bubble.dataset.state=replyState;showingPrevious=results.length>0;retryable=false;failedPayload=null;responseMessage='This request is too long. Please shorten it or start a new subject.';renderResults();positionBubble();announce(responseMessage);return;}
  currentQuery = query; requestId = ''; dismissed = false; hideCard();
  const ticket = ++sequence;
  activeRequestContext=JSON.parse(payload).context?.articleId||null;
  focusIntent=Number.isInteger(options.focusToken)?{ticket,token:options.focusToken}:null;
  const controller = new AbortController(); requestController = controller;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); },REQUEST_TIMEOUT_MS);
  setBusy(true); replyState = 'pending'; bubble.dataset.state = replyState;
  showingPrevious=results.length>0;responseMessage='Finding new suggestions…';recoveryActions=[];
  renderResults();positionBubble();
  let filterFocus=null;
  if(Number.isInteger(options.filterFocus)){
    bubble.focus({preventScroll:true});
    filterFocus={index:options.filterFocus,interaction:interactionVersion};
  }
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
      if(data?.code==='catalog_changed'){discoveryDataPromise=undefined;discoveryCatalog=undefined;catalogVersion='';currentArticle=null;updateLaunchers();}
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
    remember(query||actionMessages[action],responseMessage,nextItems);
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
      requestController = undefined; activeRequestContext=null;setBusy(false); positionBubble();
      if(filterFocus&&filterFocus.interaction===interactionVersion&&document.activeElement===bubble&&!dismissed)focusAfterFilterRemoval(filterFocus.index);
      requestAnimationFrame(() => { if (ticket === sequence && focusIntent?.ticket===ticket && document.activeElement===frame && !dismissed)send({type:'reading-focus',ifUnchanged:focusIntent.token}); });
    }
  }
}
function followReadingLink(event) {
  if (event.defaultPrevented || event.altKey || ![0,1].includes(event.button)) return;
  dismissed = true; focusIntent = null; bubble.hidden = true;
  host.dataset.readingActive = 'false'; hideCard(); reserveTop(0);
  // Clear placement before native navigation too, including a new tab or reload fallback.
  onNavigate?.();
}
function renderResults() {
  body.replaceChildren();
  bubble.dataset.mode=discoveryMode;
  bubble.setAttribute('aria-label',"Bob's reading suggestions");
  bubble.dataset.retained=String(showingPrevious);
  renderFilters();
  if (responseMessage) body.append(node('p',`bob-reading__message${replyState==='error'?' bob-reading__error':''}`,responseMessage));
  if(showingPrevious)body.append(node('p','bob-reading__previous',replyState==='explanation'?'Current picks':'Earlier picks'));
  const list = node('ol','bob-reading__list');
  list.setAttribute('aria-label',showingPrevious?'Earlier reading suggestions':'Reading suggestions');
  results.forEach(item => {
    const li = node('li','bob-reading__item');
    const main = node('div');
    const link = node('a','bob-reading__title',item.title); link.href=safePath(item);
    link.addEventListener('click',followReadingLink);
    link.addEventListener('auxclick',followReadingLink);
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
  if(typing||!layout?.visible||host.hidden||!trigger.isConnected)return;
  currentTrigger?.setAttribute('aria-expanded','false');currentTrigger?.removeAttribute('aria-describedby');
  currentTrigger=trigger;currentCard=item;trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-describedby',card.id);
  card.replaceChildren();
  card.classList.toggle('bob-card--text-only',!item.image.src);
  const image=item.image.src ? node('img','bob-card__image') : null;
  if(image){image.src=item.image.src;image.alt=item.image.alt || '';image.loading='eager';}
  const dismiss=node('button','bob-card__close','×');dismiss.type='button';dismiss.setAttribute('aria-label','Close article preview');
  dismiss.addEventListener('click',()=>{const previous=currentTrigger;hideCard();restoreTriggerFocus(previous);});
  const content=node('div','bob-card__body');const read=node('a','bob-card__read','Read this piece →');read.href=safePath(item);
  read.addEventListener('click',followReadingLink);
  read.addEventListener('auxclick',followReadingLink);
  content.append(node('p','bob-card__meta',meta(item)),node('h2','bob-card__title',item.title),node('p','bob-card__summary',item.summary),read);
  if(image)card.append(image);
  card.append(dismiss,content);card.hidden=false;placeCard(trigger);
  image?.addEventListener('load',()=>{if(image.isConnected && !card.hidden)placeCard(trigger);},{once:true});
  image?.addEventListener('error',()=>{if(!image.isConnected)return;image.remove();card.classList.add('bob-card--text-only');if(!card.hidden)placeCard(trigger);},{once:true});
}
function placeCard(trigger){
  const placement=popupWidthAndLeft(260),view=readingViewport();
  card.style.width=`${placement.width}px`;
  card.classList.toggle('bob-card--narrow',placement.width<220);
  card.style.maxHeight=`${Math.max(1,Math.min(placement.width<220?140:144,view.height-24))}px`;
  const h=card.offsetHeight, y=placement.top-h-10;
  reserveTop(popupReserve(placement,Math.max(h,bubble.offsetHeight)));
  card.style.left=`${Math.round(placement.left)}px`;
  card.style.top=`${Math.round(Math.max(view.top+12,Math.min(view.bottom-h-12,y)))}px`;
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin || event.source!==frame?.contentWindow || event.data?.channel!==CHANNEL)return;
  const data=event.data;
  if(data.type==='reading-typing'&&typeof data.active==='boolean'){
    typing=data.active;positionBubble();
  }
  if(data.type==='reading-query' && typeof data.text==='string')recommend(data.text,{focusToken:data.focusToken});
  if(data.type==='reading-layout' && data.rect && [data.rect.x,data.rect.y,data.rect.width,data.rect.height].every(Number.isFinite)){
    layout=data;if(typeof data.typing==='boolean')typing=data.typing;composerGlass.hidden=!data.visible;
    Object.assign(composerGlass.style,{left:`${data.rect.x}px`,top:`${data.rect.y}px`,width:`${data.rect.width}px`,height:`${data.rect.height}px`});
    updateLaunchers();
    positionBubble();if(!data.visible)hideCard();
  }
  // Configure reading without opening controls. Every viewport waits for Bob,
  // then the wheel; readiness must never override the reader's first action.
  if(data.type==='painted'&&!booted){booted=true;send({type:'reading-config',enabled:Boolean(apiBase)});}
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
document.addEventListener('oip:before-route',()=>{
  hideCard();routeChanging=true;articleSequence++;currentArticle=null;updateLaunchers();
  // A pending request with page context must not land on a different article.
  // Already-completed choices and their explicit filters remain available.
  if(busy&&activeRequestContext){
    sequence++;requestController?.abort();requestController=undefined;activeRequestContext=null;focusIntent=null;setBusy(false);
    failedPayload=null;retryable=false;responseMessage='';showingPrevious=false;
    answered=results.length>0;replyState=answered?'results':'idle';bubble.dataset.state=replyState;
    if(answered)renderResults();else welcome();
    announce('Page changed. Bob stopped the previous request.');
  }
});
document.addEventListener('oip:route',()=>{routeChanging=false;refreshArticleContext();requestAnimationFrame(positionBubble);});
new ResizeObserver(positionBubble).observe(body);
new MutationObserver(()=>{updateLaunchers();if(host.hidden){bubble.hidden=true;hideCard();reserveTop(0);focusIntent=null;}}).observe(host,{attributes:true,attributeFilter:['hidden']});
welcome();
refreshStatus();
refreshArticleContext();
window.render_bob_reading_to_text=()=>JSON.stringify({apiEnabled:Boolean(apiBase),apiConfigured:configured,model,catalogCount,catalogVersion,requestId,state:replyState,mode:discoveryMode,article:currentArticle?{id:currentArticle.id,title:currentArticle.title}:null,filters:activeFilters().map(({key,label})=>({key,label})),collection:selectedCollection?{id:selectedCollection.id,title:selectedCollection.title,bounds:collectionBounds,seenCount:collectionSeen.size,remaining:eligibleCollectionItems().filter(item=>!collectionSeen.has(item.id)).length}:null,collections:collectionChoices.map(({id,title,items})=>({id,title,itemCount:items.length})),query:currentQuery,topic:lastTopic,preferences,busy,historyCount:history.length,seenCount:seen.size,showingPrevious,retryable,recoveryActions,reservedTop,visible:!bubble.hidden,composer:layout,results:results.map(({id,title,url})=>({id,title,url})),card:currentCard?.title||null});
const originalState=window.render_game_to_text;
window.render_game_to_text=()=>JSON.stringify({pet:originalState?JSON.parse(originalState()):null,reading:JSON.parse(window.render_bob_reading_to_text())});
}
