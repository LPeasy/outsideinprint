// Three explicit live acceptance requests against the local preview. Stops on
// the first failure, never retries, and never reads a provider credential.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {defaults} from '../src/preferences.js';
import {shortlist} from '../src/search.js';

if (!process.argv.includes('--allow-live')) throw new Error('Pass --allow-live for three bounded live preview requests.');
const site = 'http://127.0.0.1:8772', api = 'http://127.0.0.1:8788';
const catalog = await (await fetch(site + '/companion-bob/catalog.json')).json();
const collection = catalog.collections.find(item => item.id === 'floods-water-built-environment');
assert.ok(collection, 'The reviewed water collection must be in this catalog.');
const makeRequest = body => ({message:'',action:'search',preferences:defaults(),history:[],currentIds:[],seenIds:[],...body});
const anchors = catalog.items.filter(item => collection.itemIds.includes(item.id)).sort((a,b) => b.readingTime-a.readingTime);
const anchor = anchors.find(item => shortlist(catalog.items, makeRequest({message:'Like this article, but shorter.', context:{articleId:item.id}}),40,catalog.collections)[0].length>=3);
assert.ok(anchor, 'Preflight needs at least three eligible shorter related candidates.');
const records = [], output = path.resolve('output/context-live-acceptance.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
const save = () => fs.writeFileSync(output,JSON.stringify({
  generatedAt:new Date().toISOString(), mode:'local-preview-only', catalogVersion:catalog.catalogVersion,
  model:'gpt-6-luna', productionChanged:false, dailyLimitUSD:0.50, monthlyLimitUSD:5,
  ledger:'existing local preview ledger; independent of unchanged production ledger',
  estimatedUsageUSD:records.reduce((sum,item)=>sum+((item.usage?.input_tokens||0)*0.125+(item.usage?.output_tokens||0)*0.50)/1_000_000,0),
  records,
},null,2));
async function call(name,body,check) {
  const start=performance.now();
  const response=await fetch(api+'/api/bob/recommend',{
    method:'POST',headers:{origin:site,'content-type':'application/json'},
    body:JSON.stringify({...body,catalogVersion:catalog.catalogVersion}),signal:AbortSignal.timeout(25000),
  });
  const data=await response.json();
  const record={name,status:response.status,elapsedMs:Math.round(performance.now()-start),request:body,
    outcome:data.outcome,code:data.code,model:data.model,usage:data.usage,preferences:data.preferences,
    items:data.items?.map(({id,title,url,readingTime,collectionSlugs})=>({id,title,url,readingTime,collectionSlugs}))};
  records.push(record);save();
  assert.equal(response.status,200,`Live acceptance failed (${data.code||response.status}); no automatic retry.`);
  assert.equal(data.model,'gpt-6-luna');assert.equal(data.catalogVersion,catalog.catalogVersion);
  assert.ok(data.items.length>0&&data.items.length<=3);
  assert.equal(new Set(data.items.map(item=>item.id)).size,data.items.length);
  assert.ok(data.items.every(item=>catalog.items.some(entry=>entry.id===item.id&&entry.url===item.url)));
  check(data);record.passed=true;save();
  console.log(JSON.stringify({name,count:data.items.length,elapsedMs:record.elapsedMs,usage:data.usage,passed:true}));
  return data;
}
try {
  await call('article-aware-shorter',makeRequest({message:'Like this article, but shorter.',context:{articleId:anchor.id}}),data=>{
    assert.equal(data.preferences.anchorId,anchor.id);
    assert.ok(data.items.every(item=>item.id!==anchor.id&&item.readingTime<anchor.readingTime));
  });
  const scoped=await call('collection-followup',makeRequest({message:'Something thoughtful from this collection under six minutes',
    preferences:{...defaults(),collectionId:collection.id,discovery:true}}),data=>{
    assert.equal(data.preferences.collectionId,collection.id);
    assert.ok(data.items.every(item=>collection.itemIds.includes(item.id)&&item.readingTime<6));
  });
  await call('remove-time-preserve-collection',makeRequest({action:'apply_filters',
    preferences:{...scoped.preferences,minMinutes:null,maxMinutes:null},currentIds:scoped.items.map(item=>item.id),
    history:[{role:'user',content:'Something thoughtful from this collection under six minutes'}]}),data=>{
    assert.equal(data.preferences.collectionId,collection.id);assert.equal(data.preferences.maxMinutes,null);
    assert.equal(data.preferences.mood,scoped.preferences.mood);
    assert.ok(data.items.every(item=>collection.itemIds.includes(item.id)));
  });
  console.log('Three live preview cases passed. Receipt: '+output);
} catch(error) {save();console.error(error.message);process.exitCode=1;}
