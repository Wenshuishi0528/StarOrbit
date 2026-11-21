// Exercise native IndexedDB transactions with compressed shared imagery, including
// page reload, a cache clear, overlapping packages and a stale writer.
import { hipsPixel } from '../../src/sky-detail-math.js';
import { equatorial } from '../../src/environment-math.js';
import { webbPlateTile } from '../../src/webb-plate.js';
import { createSkyTileCache } from '../../src/sky-detail-cache.js';
import { createSkyOfflineStore } from '../../src/sky-offline-store.js';
import { SkyOffline, planSkyOfflineField } from '../../src/sky-offline.js';

export async function checkSkyOffline() {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const database='sky-offline-test-'+crypto.randomUUID(), provider={id:'dss-color',revision:1,format:'jpg',minOrder:0,maxOrder:2,baseUrl:'/hips'};
  const view={forward:[1,0,0],right:[0,1,0],up:[0,0,1],fovY:5,aspect:1.2,pixelHeight:500};
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=512;
  const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
  const temporary=createSkyTileCache({database:database+'-temp'}), calls=new Map();
  let offlineMode=false,failKey='', download;
  const manager={providers:[provider],cache:{get:key=>temporary.get(key)},
    decode:async blob=>createImageBitmap(blob),
    fetcher:async url=>{
      if(offlineMode || url===failKey) throw Error('offline');
      calls.set(url,(calls.get(url)||0)+1);
      return new Response(image);
    }};
  const make=()=>new SkyOffline(manager,response=>response.blob(),createSkyOfflineStore({database}));
  let service=make();
  try {
    const plan=service.planField({id:'M31',title:'M31',source:'dss',view,thumbnailKey:'thumb:M31',thumbnailBlob:image});
    assert(plan.items.length>2,'missing multilevel coverage');
    assert(new Set(plan.items.map(i=>i.key)).size===plan.items.length,'duplicate planned tiles');
    const other=service.planField({id:'second',title:'Second field',source:'dss',view});
    await temporary.put(plan.items[0].key,image);
    failKey=plan.items[1].url;
    let failed=false;
    try { await service.save(plan); } catch {failed=true;}
    assert(failed && !(await service.list())[0].complete,'partial must remain resumable');
    failKey='';
    download=service.save(plan);
    assert(service.save(plan)===download,'same request must coalesce');
    const saved=await download;
    assert(saved.complete && saved.count===plan.items.length,'incomplete save');
    assert(!calls.has(plan.items[0].url),'temporary tile was downloaded again');
    assert((await service.get(plan.thumbnailKey)).size===image.size,'thumbnail missing');
    await temporary.clear();offlineMode=true;
    const resumed=service.planRecord(saved);
    assert(resumed?.id===plan.id,'record cannot be restored');
    const originalMax=manager.providers[0].maxOrder;manager.providers[0].maxOrder=8;
    service.sourceFailed(provider);
    assert(service.providersForView(view)[0].maxOrder===saved.order,'server failure lost saved optical level');
    manager.providers[0].maxOrder=originalMax;
    await service.save(other);
    await service.remove(plan.id);
    assert((await service.get(plan.items[1].key))?.size===image.size,'shared package tile was deleted');
    assert(!(await service.get(plan.thumbnailKey)),'unique thumbnail left behind');
    service.dispose();service=make();
    assert((await service.list())[0]?.complete,'package disappeared on reload');
    assert((await service.get(plan.items[0].key))?.size===image.size,'offline tile missing after reload');
    await service.remove(other.id);
    assert(!(await service.get(plan.items[0].key)),'tile leaked after last removal');
    offlineMode=false;
    const interrupted=service.planField({id:'pause',title:'Pause',source:'dss',view});
    const originalFetch=manager.fetcher;
    let started;
    const waiting=new Promise(resolve=>{started=resolve;});
    manager.fetcher=(_,options)=>new Promise((resolve,reject)=>{
      started();
      options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});
    });
    const pending=service.save(interrupted);
    await waiting;service.cancel(interrupted.id);
    let cancelled=false;
    try {await pending;} catch(error) {cancelled=error.name==='AbortError';}
    assert(cancelled && !(await service.list())[0].complete,'cancelled job completed');
    await service.remove(interrupted.id);manager.fetcher=originalFetch;
    // The save action follows the image at the reticle even in Automatic mode.
    const plateProvider={id:'webb-test',format:'jpg',revision:1,maxOrder:0,title:'test',baseUrl:'/work',
      plate:{topLeft:[1,-.01,.01],across:[0,.02,0],down:[0,0,-.02],levels:[{width:128,height:128,cols:1,rows:1,offset:0}]}};
    const plateTile=webbPlateTile(plateProvider,0,0);
    const optical=(direction)=>({provider,order:0,pixel:hipsPixel(0,direction).pixel});
    const field={view,tiles:[optical(view.forward),plateTile]};
    manager.views=new Map([['scope-1',field]]);manager.ready=()=>[...field.tiles];
    assert(service.planCurrent('scope','auto').providerId===plateProvider.id,'auto ignored actual Webb field');
    const edge=equatorial(1.5,0);
    field.view={...view,forward:edge};field.tiles=[optical(edge),plateTile];
    assert(service.planCurrent('scope','auto').source==='dss','off-centre Webb overrode optical field');
    const inside=equatorial(159.21303687393092,-58.62016558917656);
    field.view={...view,forward:inside};field.tiles=[optical(inside),{...optical(inside),provider:{id:'jwst-carina-2022',title:'Cosmic Cliffs',tiles:{}}}];
    assert(service.planCurrent('scope','auto').builtin,'embedded field offered a redundant download');
    const stale={id:'stale',title:'stale',total:1};
    await service.store.begin(stale,'a');await service.remove(stale.id);
    await service.store.begin(stale,'b');
    let staleRejected=false;
    try { await service.store.attach(stale.id,'a','bad',await image.arrayBuffer(),image.type); }
    catch(e){staleRejected=e.name==='AbortError';}
    assert(staleRejected && !(await service.get('bad')),'stale write survived deletion');
    const south=planSkyOfflineField([provider],{source:'panstarrs',view:{...view,forward:[0,0,-1]}});
    assert(south===null,'southern field offered PS1');
    return {tiles:saved.count,bytes:saved.bytes,networkRequests:[...calls.values()].reduce((a,b)=>a+b,0)};
  } finally { service.dispose();temporary.dispose();indexedDB.deleteDatabase(database);indexedDB.deleteDatabase(database+'-temp'); }
}
