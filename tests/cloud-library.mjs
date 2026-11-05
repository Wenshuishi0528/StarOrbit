import assert from 'node:assert/strict';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import {mergeCloudVersions} from '../src/cloud-history-data.js';
import {blobHash,fetchResource} from '../src/resource-fetch.js';
const result=await build({entryPoints:['src/cloud-library.js','src/weather.js'],bundle:true,platform:'node',format:'esm',outdir:'output/tests/cloud88',write:false,logLevel:'silent'});
await fs.mkdir('output/tests/cloud88',{recursive:true});for(const file of result.outputFiles)await fs.writeFile(file.path,file.contents);
const {CloudLibrary}=await import('../output/tests/cloud88/cloud-library.js');
const {Weather}=await import('../output/tests/cloud88/weather.js');
globalThis.location={protocol:'http:'};
const time=Date.UTC(2026,9,23,12),sha='a'.repeat(64);
const meta={kind:'cloud',id:'saved',provider:'satcorps',time,sha256:sha,resolution:'8192×4096',coverage:1,manualValidation:{schema:1,sha256:sha,validPixels:1}};
function fixture(){const w={items:[],active:{cloud:null},settings:{cloud:'builtin'},jobs:new Map(),pendingRecords:new Set(),sim:{missionId:'tiangong'},ready:Promise.resolve(),render(){},async reload(){},async store(kind,blob,data){const r={...data,id:'downloaded',kind,blob};this.items=[r];return r;},validateManualCloud:async r=>({sha256:r.sha256,manualValidation:{schema:1,sha256:r.sha256,validPixels:1}})};const lib=new CloudLibrary(w);w.cloudLibrary=lib;return [w,lib];}
const [,summary]=fixture();assert.equal(summary.currentText,'内置静态云图');summary.w.items=[meta];summary.w.active.cloud=meta.id;assert(summary.currentText.includes('2026-10-23 12:00 UTC'));
const b={...meta,id:'revision',sha256:'b'.repeat(64)},remote={provider:'satcorps',time,remote:true};
const first=mergeCloudVersions([remote],[meta,b],[{...meta,disk:'saved.png'}]);
const second=mergeCloudVersions([remote],[b,meta],[{...meta,disk:'saved.png'}]);
assert.equal(first.length,2);assert.deepEqual(first.map(r=>r.key).sort(),second.map(r=>r.key).sort(),'revision identity is stable across cache reorder');assert(first.find(r=>r.record.id==='saved').diskRecord);
let releaseCatalog;const started=[];
const all=Object.create(Weather.prototype);Object.assign(all,{settings:{},sim:{missionId:'tiangong'},resourcePanel:{refreshCloudVersions:()=>new Promise(resolve=>releaseCatalog=resolve)},updateResource:async kind=>started.push(kind),render(){}});
const updating=all.updateAll();await Promise.resolve();assert.deepEqual(started,['aurora','orbit'],'other updates start before the cloud catalog responds');releaseCatalog();await updating;
// Exercise the real selection/sync methods with DOM controls, without a renderer.
const elements=new Map();globalThis.document={getElementById:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);}};
const choosing=Object.create(Weather.prototype);Object.assign(choosing,{items:[meta],settings:{cloud:'builtin'},active:{},env:{api:{renderer:{}}},sim:{},sync:Weather.prototype.sync,apply:async function(){this.active.cloud=this.settings.cloudHistory;},save(){},render(){}});
await choosing.setSource('cloud','history',meta.id);assert.equal(choosing.choicesDirty,true);assert.equal(elements.get('cloudSource').value,'history');assert.equal(choosing.active.cloud,meta.id);
// Legacy auto migration preserves its six-hour window and uses a preset's target time.
const oldTime=Date.UTC(2026,8,1),qualified={...meta,time:oldTime,observedStart:oldTime,observedEnd:oldTime,quality:{schema:1,status:'accepted',reasons:[]},polarCoverage:{north:1,south:1},footprint:{global:1,north:1,south:1}};
const legacy=Object.create(Weather.prototype);Object.assign(legacy,{items:[qualified],sim:{time:Date.UTC(2026,10,1)},settings:{cloud:'history',cloudHistory:'auto'}});
legacy.normalizeCloudSelection();assert.equal(legacy.settings.cloud,'builtin','distant auto frames must not become fixed selections');
legacy.settings={cloud:'history',cloudHistory:'auto'};legacy.normalizeCloudSelection(oldTime+3600e3);assert.equal(legacy.settings.cloudHistory,qualified.id,'preset target time is independent of the previous simulation clock');
// An unrelated download must not block applying an existing map.
Object.assign(choosing,{busy:true,pendingRecords:new Set(),validateManualCloud:async()=>({}),cache:{put:async()=>{}},reload:async()=>{},trim:async()=>{}});
await choosing.useRecord(meta);assert.equal(choosing.active.cloud,meta.id);
await assert.rejects(()=>fetchResource('/api/cloud/versions',{fetcher:async()=>new Response(JSON.stringify({error:'NASA 目录连接超时'}),{status:502,headers:{'content-type':'application/json'}})}),/NASA 目录连接超时/);
const originalFetch=globalThis.fetch;
try{
 // A completed background task is transferred to the cache without another POST.
 const [w,lib]=fixture(),payload=new Blob([new Uint8Array(41*1024*1024)]),digest=await blobHash(payload);
 const done={state:'ready',id:'b'.repeat(32),date:'2026-10-23',hour:'12',result:{...meta,sha256:digest,channel:'red'}};
 let posts=0;globalThis.fetch=async(url,options)=>{if(options?.method==='POST')posts++;if(url.includes('/history/image'))return new Response(payload);if(url==='/api/cloud/library')return Response.json({items:[]});throw Error('Unexpected URL '+url);};
 await lib.download({provider:'satcorps',date:'2026-10-23',slot:'12'},{resumeJob:done});
 assert.equal(posts,0);assert.equal(lib.task.state,'ready');assert.equal(w.active.cloud,null,'download does not switch the image');assert.equal(w.jobs.size,0);assert.equal(w.busy,false);assert.equal(w.items[0].archiveOnly,false);
 // Cancel while POST is pending, before the job response arrives.
 const [cancelWeather,cancelLib]=fixture();let postStarted;const posted=new Promise(resolve=>postStarted=resolve);let cancelled;
 globalThis.fetch=async(url,options={})=>{
  if(url.startsWith('/api/cloud/history/download?'))return new Promise((resolve,reject)=>{postStarted();options.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});});
  if(url.startsWith('/api/cloud/history/cancel?')){cancelled=new URL(url,'http://local').searchParams.get('id');return Response.json({cancelled:true});}
  if(url==='/api/cloud/history/status')return Response.json({state:'cancelled'});
  if(url==='/api/cloud/library')return Response.json({items:[]});throw Error('Unexpected URL '+url);
 };
 const downloading=cancelLib.download({provider:'satcorps',date:'2026-10-23',slot:'12'});const rejected=assert.rejects(downloading,e=>e.name==='AbortError');await posted;
 const allocated=cancelLib.task.id;await cancelLib.cancel();await rejected;
 assert.equal(cancelled,allocated);assert.equal(cancelLib.task.state,'cancelled');assert.equal(cancelWeather.jobs.size,0);
 // A slow startup status response must not overwrite a new download.
 const [,racing]=fixture();let resolveOldStatus,statusRequested,beginNew;
 const statusSeen=new Promise(resolve=>statusRequested=resolve),newSeen=new Promise(resolve=>beginNew=resolve);let statusCalls=0,stops=0;
 globalThis.fetch=async(url,options={})=>{
  if(url==='/api/cloud/library')return Response.json({items:[]});
  if(url==='/api/cloud/history/status'){
   if(!statusCalls++){statusRequested();return new Promise(resolve=>resolveOldStatus=resolve);}
   return Response.json({state:'cancelled'});
  }
  if(url.startsWith('/api/cloud/history/download?'))return new Promise((resolve,reject)=>{beginNew();options.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});});
  if(url.startsWith('/api/cloud/history/cancel?')){stops++;return Response.json({cancelled:true});}
  throw Error('Unexpected URL '+url);
 };
 const restoring=racing.restore();await statusSeen;
 const newDownload=racing.download({provider:'satcorps',date:'2026-10-23',slot:'12'}),newRejected=assert.rejects(newDownload,e=>e.name==='AbortError');await newSeen;
 resolveOldStatus(Response.json({...done,date:'2026-10-22'}));await restoring;
 assert.equal(racing.task.state,'running');assert.equal(racing.task.date,'2026-10-23','old startup result cannot hide the active task or its cancel button');
 const cancelOnce=racing.cancel(),cancelAgain=racing.cancel();assert.equal(cancelOnce,cancelAgain,'repeated clicks share the same cancellation');
 await cancelOnce;await newRejected;assert.equal(stops,1,'one cancellation cannot later stop the next job');
 // Reopening a page discovers an already running server job, without restarting it.
 const [,reopened]=fixture();const running={state:'running',id:'c'.repeat(32),date:'2026-10-23',hour:'12',status:'downloading'};let attached;
 globalThis.fetch=async url=>url==='/api/cloud/library'?Response.json({items:[]}):Response.json(running);
 reopened.download=async(row,options)=>{attached={row,options};};await reopened.restore();assert.equal(attached.options.resumeJob.id,running.id);
}finally{globalThis.fetch=originalFetch;}
console.log('Cloud library: stable revisions, shared current state, independent updates, apply during download, diagnostic errors, reconnect and pre-response cancellation passed');
