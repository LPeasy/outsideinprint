import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({viewport:{width:320,height:900}});
 await page.route('**/*',route=>new URL(route.request().url()).origin==='https://outsideinprint.org'?route.continue():route.abort('blockedbyclient'));
 await page.goto('https://outsideinprint.org/essays/one-more-block/',{waitUntil:'load'});
 const resource = await page.locator('[data-oip-persistent="bob-css"]').getAttribute('href');
 if(!resource.includes('23e8d707685a9cb4cfc581f2e44f356e4f7e2854c3493ba5166b40ee9ce118a1db1d8744f5995a65dd62ebf3ea6bb1ec')) throw new Error('Live Bob stylesheet differs from failed build');
 console.log('BROWSER',browser.version(),'MATCHING_CSS',resource);
 for (const size of [125,100,200]) {
  await page.evaluate(async size=>{document.documentElement.style.fontSize=size+'%';await document.fonts.ready;},size);
  await page.waitForFunction(()=>{const b=window.render_bob_to_text&&JSON.parse(window.render_bob_to_text());return b?.ready&&b.active&&b.interactiveRegions>0;});
  try { await page.waitForFunction(()=>{
   const frame=document.querySelector('[data-bob-frame]'),c=frame?.contentDocument?.querySelector('canvas');if(!c?.width)return false;
   const {width:w,height:h}=c,p=c.getContext('2d').getImageData(0,0,w,h).data;let d=Infinity,n;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(p[(y*w+x)*4+3]<220)continue;const s=(x-w/2)**2+(y-h*.58)**2;if(s<d){d=s;n={x,y};}}
   if(!n)return false;const b=c.getBoundingClientRect(),f=frame.getBoundingClientRect();return document.elementFromPoint(f.x+b.x+n.x/w*b.width,f.y+b.y+n.y/h*b.height)===frame;
  },null,{timeout:5000}); } catch {}
  const state=await page.evaluate(()=>{
   const iframe=document.querySelector('[data-bob-frame]'),host=iframe.closest('[data-bob-companion]'),doc=iframe.contentDocument,c=doc.querySelector('canvas');
   const fb=iframe.getBoundingClientRect(),cb=c.getBoundingClientRect(),cs=getComputedStyle(iframe),hs=getComputedStyle(host);
   const {width:w,height:h}=c,p=c.getContext('2d').getImageData(0,0,w,h).data;let d=Infinity,n;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(p[(y*w+x)*4+3]<220)continue;const s=(x-w/2)**2+(y-h*.58)**2;if(s<d){d=s;n={x,y};}}
   const local={x:cb.x+n.x/w*cb.width,y:cb.y+n.y/h*cb.height},point={x:fb.x+local.x,y:fb.y+local.y};
   const desc=e=>e?.outerHTML.slice(0,240)||null;
   const mask=cs.clipPath.match(/^path\((?:(?:nonzero|evenodd),\s*)?["'](.*)["']\)$/)?.[1];
   const ctx=document.createElement('canvas').getContext('2d'),path=mask&&new Path2D(mask);
   let opaque=0,outerHits=0,innerHits=0,inMask=0;const samples=[];
   for(let y=0;y<h;y+=6)for(let x=0;x<w;x+=6){if(p[(y*w+x)*4+3]<220)continue;opaque++;
    const lx=cb.x+x/w*cb.width,ly=cb.y+y/h*cb.height,px=fb.x+lx,py=fb.y+ly;
    if(doc.elementFromPoint(lx,ly)===c)innerHits++;
    if(document.elementFromPoint(px,py)===iframe){outerHits++;if(samples.length<3)samples.push({x:px,y:py});}
    if(path&&ctx.isPointInPath(path,lx,ly))inMask++;
   }
   const style=e=>{const s=getComputedStyle(e);return Object.fromEntries(['display','position','zIndex','pointerEvents','visibility','zoom','transform','clipPath','fontFamily','fontSize'].map(k=>[k,s[k]]));};
   return {bob:window.render_bob_to_text(),rootFont:getComputedStyle(document.documentElement).fontSize,point,local,nearest:n,
    innerHit:desc(doc.elementFromPoint(local.x,local.y)),outerHitsAtPoint:document.elementsFromPoint(point.x,point.y).map(desc),
    frame:{bounds:fb.toJSON(),inert:iframe.inert,hidden:iframe.hidden,style:style(iframe)},
    host:{hidden:host.hidden,style:style(host)},canvas:{bounds:cb.toJSON(),width:w,height:h,style:style(c)},
    view:{width:innerWidth,height:innerHeight,scrollX,scrollY},innerView:{width:iframe.contentWindow.innerWidth,height:iframe.contentWindow.innerHeight,scrollX:iframe.contentWindow.scrollX,scrollY:iframe.contentWindow.scrollY},
    maskContainsPoint:path&&ctx.isPointInPath(path,local.x,local.y),sampleCounts:{opaque,outerHits,innerHits,inMask},hittableSamples:samples,
    ancestors:[...function*(e){while(e){yield e;e=e.parentElement;}}(iframe)].map(e=>({tag:e.tagName,style:style(e)}))};
  });
  console.log('DIAGNOSTIC',size,JSON.stringify(state));
 }
} finally {await browser.close();}
