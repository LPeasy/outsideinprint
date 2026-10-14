import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Run against an already-rendered local Hugo review. Every API request is
// intercepted; these tests never contact OpenAI or require a provider key.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let base=process.env.OIP_BASE_URL?new URL(process.env.OIP_BASE_URL):null;
if(base)assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname));
const output=process.env.OIP_BOB_OUTPUT||path.join(root,'output/playwright/bob-reading');
const mockApiOrigin='http://127.0.0.1:8787';
let browser,catalog,server;
const defaults={version:1,topic:'',mood:'',formats:[],minMinutes:null,maxMinutes:null,excludedTopics:[],discovery:false,anchorId:null};
test.before(async()=>{
  if(!base){
    const site=path.resolve(process.env.OIP_SITE_DIR||path.join(root,'public'));
    assert.ok(fs.existsSync(path.join(site,'index.html')),'Build the public site before browser QA.');
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg','.woff2':'font/woff2'};
    server=http.createServer((request,response)=>{
      try{
        let pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);if(pathname.endsWith('/'))pathname+='index.html';
        const file=path.resolve(site,'.'+pathname);
        if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end('Not found');return;}
        response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(response);
      }catch{response.writeHead(400);response.end('Bad request');}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=new URL(`http://127.0.0.1:${server.address().port}/`);
  }
  const {chromium}=await import(process.env.OIP_PLAYWRIGHT_MODULE?pathToFileURL(path.resolve(process.env.OIP_PLAYWRIGHT_MODULE)).href:'playwright');
  browser=await chromium.launch({headless:true,executablePath:process.env.OIP_BROWSER_EXECUTABLE||undefined});fs.mkdirSync(output,{recursive:true});
  const response=await fetch(new URL('/companion-bob/catalog.json',base));assert.equal(response.status,200);catalog=await response.json();
});
test.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
function setFixtureAttribute(html,name,value){
  // Hugo --minify removes optional attribute quotes in production. Configure
  // both forms explicitly, and fail here if the host contract ever changes.
  const pattern=new RegExp('(\\s'+name+'\\s*=\\s*)(?:"[^"]*"|\'[^\']*\'|[^\\s"\'=<>`]+)','g');
  let count=0;
  const updated=html.replace(pattern,(_match,prefix)=>{count++;return `${prefix}"${value}"`;});
  assert.equal(count,1,`Expected exactly one ${name} fixture attribute.`);
  return updated;
}
async function setup(width=1440,disabled=false){
  const context=await browser.newContext({viewport:{width,height:width===1440?900:844},isMobile:width<600,hasTouch:width<600});
  const page=await context.newPage(),requests=[],errors=[],plans=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/bob/')){
      assert.equal(url.origin,mockApiOrigin,'Bob API requests must use the explicit local fixture origin.');
      requests.push({path:url.pathname,body:route.request().postDataJSON()});
      if(url.pathname.endsWith('/status'))return route.fulfill({json:{configured:true,model:'gpt-6-luna',catalogCount:catalog.count,catalogVersion:catalog.catalogVersion}});
      const plan=plans.shift();assert.ok(plan,'Every recommendation call must have an explicit mocked response');
      await plan.wait;return route.fulfill({status:plan.status||200,json:plan.data});
    }
    if(url.origin!==base.origin)return route.abort('blockedbyclient');
    if(route.request().isNavigationRequest()&&route.request().frame()===page.mainFrame()){
      const response=await route.fetch();
      let html=setFixtureAttribute(await response.text(),'data-bob-reading-enabled',String(!disabled));
      html=setFixtureAttribute(html,'data-bob-api-base',disabled?'':mockApiOrigin);
      return route.fulfill({response,body:html});
    }
    return route.continue();
  });
  await page.goto(base.href,{waitUntil:'domcontentloaded'});
  const frame=page.frameLocator('[data-bob-frame]');
  await frame.locator('[data-pet-reading-composer]').waitFor({state:'visible'});
  await page.waitForFunction(()=>window.render_bob_reading_to_text);
  const state=()=>page.evaluate(()=>JSON.parse(window.render_bob_reading_to_text()));
  assert.equal(await page.locator('[data-bob-companion]').getAttribute('data-bob-reading-enabled'),String(!disabled));
  assert.equal(await page.locator('[data-bob-companion]').getAttribute('data-bob-api-base'),disabled?'':mockApiOrigin);
  assert.equal((await state()).apiEnabled,!disabled,'The fixture must control effective API enablement.');
  const postCount=()=>requests.filter(request=>request.path.endsWith('/recommend')).length;
  const plan=(data,status=200)=>{let release;plans.push({data,status,wait:new Promise(resolve=>{release=resolve;})});return release;};
  const data=(extra={})=>({items:catalog.items.slice(0,3),preferences:defaults,message:'',outcome:'results',recoveryActions:[],model:'gpt-6-luna',catalogCount:catalog.count,catalogVersion:catalog.catalogVersion,...extra});
  return {context,page,frame,state,postCount,requests,errors,plan,data};
}
test('disabled configuration offers free collections without API requests',async()=>{
  const t=await setup(1440,true);
  try{
    assert.equal(await t.frame.getByRole('textbox').count(),0);
    assert.equal((await t.state()).visible,false);
    assert.equal(await t.page.locator('.bob-preview-note').count(),0);
    await t.frame.getByRole('button',{name:'Explore collections',exact:true}).click();
    await t.page.waitForFunction(()=>JSON.parse(window.render_bob_reading_to_text()).state==='collections');
    assert.equal((await t.state()).collections.length,3);assert.equal(t.requests.length,0);
    await t.page.locator('.bob-reading__collection').first().click();
    assert.equal((await t.state()).results.length,3);assert.equal(t.requests.length,0);
    await t.page.screenshot({path:path.join(output,'disabled-free-collections.png')});assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});
for(const width of [1440,390,320])test(`free discovery, canonical previews, AI fallback and navigation at ${width}px`,async()=>{
  const t=await setup(width);
  try{
    const input=t.frame.getByRole('textbox',{name:'What would you like to read about?',exact:true});await input.waitFor({state:'visible'});
    assert.equal((await t.state()).visible,false);
    await t.page.locator('.bob-reading-launch').click();await t.page.waitForFunction(()=>JSON.parse(window.render_bob_reading_to_text()).state==='collections');
    assert.equal(t.postCount(),0);
    const collection=(await t.state()).collections[0];await t.page.locator('.bob-reading__collection').first().click();
    let s=await t.state();const actual=catalog.collections.find(item=>item.id===collection.id);
    assert.equal(s.results.length,3);assert.equal(new Set(s.results.map(item=>item.id)).size,3);assert.ok(s.results.every(item=>actual.itemIds.includes(item.id)));assert.equal(t.postCount(),0);
    await t.page.waitForTimeout(350);
    const b=await t.page.locator('.bob-reading').boundingBox();s=await t.state();
    assert.ok(b.x>=0&&b.x+b.width<=width+1&&b.y+b.height<=s.composer.petRect.y+1);
    const gear=await t.frame.getByRole('button',{name:'Bob settings',exact:true}).boundingBox(),composer=await t.frame.locator('[data-pet-reading-composer]').boundingBox();assert.ok(gear.x+gear.width<=composer.x-3);
    const hero=s.results.findIndex(item=>catalog.items.find(entry=>entry.id===item.id).image.src);const index=Math.max(0,hero);
    if(width<600)await t.page.locator('.bob-reading__peek').nth(index).tap();else await t.page.locator('.bob-reading__title').nth(index).hover();
    await t.page.locator('.bob-card').waitFor({state:'visible'});await t.page.waitForFunction(()=>{const image=document.querySelector('.bob-card__image');return !image||image.complete;});
    assert.equal(await t.page.locator('.bob-card__summary').textContent(),catalog.items.find(item=>item.id===s.results[index].id).summary);
    await t.page.waitForTimeout(250);await t.page.screenshot({path:path.join(output,`reading-${width}-card.png`)});
    await t.page.getByRole('button',{name:'Close article preview',exact:true}).click();
    let release=t.plan(t.data());await input.fill('Something comforting about ordinary life');await input.press('Enter');await t.page.waitForFunction(()=>JSON.parse(window.render_bob_reading_to_text()).busy);release();
    await t.page.waitForFunction(()=>JSON.parse(window.render_bob_reading_to_text()).state==='results');
    assert.equal(t.requests.at(-1).body.catalogVersion,catalog.catalogVersion);
    assert.equal(await t.page.locator('.bob-reading__message').count(),0);
    release=t.plan(t.data({items:[],outcome:'empty'}));await input.fill('An interest without an exact match');await input.press('Enter');await t.page.waitForFunction(()=>JSON.parse(window.render_bob_reading_to_text()).busy);release();
    await t.page.waitForFunction(()=>JSON.parse(window.render_bob_reading_to_text()).state==='collections');assert.equal(await t.page.locator('.bob-reading__discovery-intro').textContent(),'No exact matches…');assert.equal(t.postCount(),2);
    await t.page.waitForTimeout(250);await t.page.screenshot({path:path.join(output,`reading-${width}-no-matches.png`)});
    await t.page.locator('.bob-reading__collection').first().click();
    const route=(await t.state()).results[0].id,frameBefore=await t.page.locator('[data-bob-frame]').getAttribute('src');
    await t.page.locator('.bob-reading__title').first().click();await t.page.waitForURL(new URL(route,base).href);
    assert.equal(await t.page.locator('[data-bob-frame]').getAttribute('src'),frameBefore);assert.equal(await t.page.locator('.bob-reading').count(),1);assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});
test('spending/disabled errors offer free discovery; stale catalog and transport errors keep explicit Retry',async()=>{
  const t=await setup();
  try{
    const input=t.frame.getByRole('textbox',{name:'What would you like to read about?',exact:true});await input.waitFor({state:'visible'});
    const submit=async(plan,expected)=>{const release=t.plan(plan.data,plan.status);await input.fill('A reading request');await input.press('Enter');await t.page.waitForFunction(()=>JSON.parse(window.render_bob_reading_to_text()).busy);release();await t.page.waitForFunction(expected=>JSON.parse(window.render_bob_reading_to_text()).state===expected,expected);};
    for(const code of ['service_disabled','budget_exhausted']){
      const before=t.postCount();await submit({status:503,data:{code,message:'Unavailable',retryable:false}},'collections');assert.equal(t.postCount(),before+1);assert.equal((await t.state()).collections.length,3);assert.match(await t.page.locator('.bob-reading__discovery-intro').textContent(),code==='budget_exhausted'?/limit/:/unavailable/);
    }
    await submit({status:409,data:{code:'catalog_changed',message:'The reading catalog changed. Please retry.',retryable:true}},'error');assert.equal((await t.state()).catalogVersion,'');
    let release=t.plan(t.data());await t.page.getByRole('button',{name:'Retry',exact:true}).click();await t.page.waitForFunction(()=>JSON.parse(window.render_bob_reading_to_text()).busy);assert.equal(t.requests.at(-1).body.catalogVersion,undefined);release();await t.page.waitForFunction(()=>JSON.parse(window.render_bob_reading_to_text()).state==='results');
    await submit({status:503,data:{code:'upstream_error',message:'Bob could not reply.',retryable:true}},'error');assert.ok(await t.page.getByRole('button',{name:'Retry',exact:true}).isVisible());assert.equal((await t.state()).mode,'ai');assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});
