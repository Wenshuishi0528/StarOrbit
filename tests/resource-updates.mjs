import assert from 'node:assert/strict';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
const target=new URL('../output/tests/weather-bundle.mjs',import.meta.url);await fs.mkdir(new URL('.',target),{recursive:true});
await build({entryPoints:['src/weather.js'],bundle:true,platform:'node',format:'esm',outfile:target.pathname,logLevel:'silent'});
const {Weather}=await import(target.href+'?'+Date.now());
const {WeatherCache}=await import('../src/weather-cache.js');
const {blobHash}=await import('../src/resource-fetch.js');
function fixture(){const w=Object.create(Weather.prototype);Object.assign(w,{items:[],active:{cloud:'current'},pendingRecords:new Set(),jobs:new Map(),resourceStates:{},messages:{},settings:{limit:200,autoClean:true,resourceChecks:{},cloud:'builtin',cloudDownloadProvider:'github',cloudHistory:'auto',aurora:'off',auroraHistory:'auto',orbitRecords:{tiangong:'current-orbit'}},sim:{missionId:'tiangong',time:Date.now(),orbits:{save(){}}},ready:Promise.resolve(),render(){},sync(){},save(){},apply:async()=>{},cache:new WeatherCache('test')});return w;}
const w=fixture();let release,calls=0;w.updateCloud=async()=>{calls++;await new Promise(resolve=>release=resolve);return {id:'downloaded'};};
const a=w.updateResource('cloud',{provider:'github'}),b=w.updateResource('cloud',{provider:'github'});assert.equal(a,b,'duplicate clicks share same operation');await Promise.resolve();await Promise.resolve();release();await a;assert.equal(calls,1);assert.equal(w.jobs.size,0);assert.equal(w.busy,false);assert.equal(w.settings.cloud,'builtin','download does not silently enable source');assert.equal(w.resourceState('cloud','github').phase,'updated');
w.updateCloud=async()=>{throw Error('network unavailable');};await assert.rejects(()=>w.updateResource('cloud',{provider:'github'}),/network unavailable/);assert.equal(w.active.cloud,'current');assert.equal(w.resourceState('cloud','github').phase,'error');assert.equal(w.busy,false);
const oldMode=w.settings.cloud;w.apply=async()=>{if(w.settings.cloud==='satcorps')throw Error('decode failed');};await assert.rejects(()=>w.setSource('cloud','satcorps'),/decode failed/);assert.equal(w.settings.cloud,oldMode,'failed use restores selection and active texture');assert.equal(w.active.cloud,'current');
const cloud=new Blob(['already validated image']),hash=await blobHash(cloud),cached={id:'cloud-'+hash,kind:'cloud',provider:'github',blob:cloud,sha256:hash,downloaded:1,size:cloud.size};
const reuse=fixture();reuse.items=[cached];let validated=0;reuse.fetch=async()=>({blob:cloud,http:{etag:'"same"'},unchanged:false});reuse.validateCloud=async()=>{validated++;};assert.equal(await reuse.updateCloud('github'),cached);assert.equal(validated,0,'equal cloud payload skips image decode/validation');
const now=Date.now(),meta={provider:'satcorps',time:now-86400e3,observedStart:now-86400e3,observedEnd:now-86e6,resolution:'8192×4096',nativeResolution:'12960×6480',channel:'red',coverage:1,polarCoverage:{north:1,south:1},footprint:{global:1,north:1,south:1},sha256:hash,updateStatus:'partial',updateMessage:'部分候选暂不可访问，保留已下载云图',checkedAt:now};
const nasa={...cached,...meta,id:'nasa'};reuse.items=[nasa];reuse.fetch=async()=>{throw Error('should not fetch cached image');};assert.equal(await reuse.acceptNASA({result:meta}),nasa);assert.equal(reuse.lastCloudOutcome.satcorps.status,'partial');assert.equal(reuse.messages.cloud,meta.updateMessage,'existing cached NASA image still receives final check outcome');
const cache=fixture();await cache.store('cloud',new Blob(['new payload']),{provider:'github'});assert(cache.protectedIds().includes(cache.items[0].id),'unapplied in-flight payload protected against other writes');assert(cache.protectedIds().includes('current-orbit'));
console.log('Resource single-flight updates, failure retention, apply rollback, identical-image reuse, NASA partial status and in-flight cache protection passed');

// NASA service recovery is independent of a manual update job. Exercise terminal
// service states directly so these regressions never wait for the polling timer.
globalThis.location={protocol:'http:'};globalThis.document={hidden:false};
const failedCheck=now-5000;
const restoreError=fixture();restoreError.settings.resourceChecks['cloud:satcorps']={phase:'unchanged',checkedAt:now-60000};
restoreError.nasaCall=async()=>({state:'error',error:'NASA source offline',updateStatus:'unavailable',checkedAt:failedCheck,checkComplete:false});
restoreError.apply=async()=>{throw Error('failed restore must not change the current image');};
await restoreError.restoreNASA();
assert.equal(restoreError.resourceState('cloud','satcorps').phase,'error','restored service failure replaces a stale success badge');
assert.equal(restoreError.resourceState('cloud','satcorps').message,'NASA source offline');
assert.equal(restoreError.resourceState('cloud','satcorps').checkedAt,failedCheck);
assert.equal(restoreError.active.cloud,'current');assert.equal(restoreError.pendingRecords.size,0);
restoreError.nasaCall=async()=>({state:'idle'});await restoreError.restoreNASA();
assert.equal(restoreError.resourceState('cloud','satcorps').phase,'idle','an empty helper is not a successful update check');

const watchError=fixture();let acceptedErrorResult=0;
watchError.pendingRecords.add('another-resource');watchError.acceptNASA=async()=>{acceptedErrorResult++;return nasa;};
await assert.rejects(()=>watchError.watchNASA({state:'error',error:'NASA source offline',checkedAt:failedCheck,result:meta}),/NASA source offline/);
assert.equal(acceptedErrorResult,0,'failed terminal jobs cannot accept or apply the retained helper image as an update');
assert.deepEqual([...watchError.pendingRecords],['another-resource']);
assert.equal(watchError.active.cloud,'current');assert.equal(watchError.busy,false);assert.equal(watchError.nasaWatch,null);
assert.equal(watchError.resourceState('cloud','satcorps').phase,'error');

for(const failure of ['apply','trim']){
 const interrupted=fixture();interrupted.acceptNASA=async()=>{interrupted.pendingRecords.add(nasa.id);return nasa;};
 interrupted[failure]=async()=>{throw Error(failure+' failed');};
 await assert.rejects(()=>interrupted.watchNASA({state:'ready',result:meta}),new RegExp(failure+' failed'));
 assert.equal(interrupted.pendingRecords.size,0,'terminal '+failure+' failure releases the downloaded row reservation');
 assert.equal(interrupted.active.cloud,'current');assert.equal(interrupted.busy,false);assert.equal(interrupted.nasaWatch,null);
 assert.equal(interrupted.resourceState('cloud','satcorps').phase,'error');
}
for(const state of ['ready','idle']){
 const empty=fixture();
 await assert.rejects(()=>empty.watchNASA({state}),/NASA 云图暂不可用/);
 assert.equal(empty.resourceState('cloud','satcorps').phase,'error','missing result must not become unchanged or updated');
 assert.equal(empty.active.cloud,'current');assert.equal(empty.busy,false);assert.equal(empty.isUpdating('cloud','satcorps'),false);
}

// Restored background work has no entry in jobs, but must still disable another
// NASA check and be joined by a manual check rather than issue a second request.
const background=fixture();let finishAccept,requestCount=0;
background.acceptNASA=async()=>{await new Promise(resolve=>finishAccept=resolve);background.pendingRecords.add(nasa.id);return nasa;};
background.nasaCall=async()=>{requestCount++;throw Error('background work must be reused');};
const ongoing=background.watchNASA({state:'ready',result:meta});
assert.equal(background.jobs.size,0);assert.equal(background.isUpdating('cloud','satcorps'),true);assert.equal(background.isUpdating('cloud','github'),false);
const joined=background.updateNASA();finishAccept();assert.equal(await ongoing,nasa);assert.equal(await joined,nasa);
assert.equal(requestCount,0);assert.equal(background.pendingRecords.size,0);assert.equal(background.isUpdating('cloud','satcorps'),false);

const ttl=fixture(),actualCheckTime=now-10*60000;ttl.items=[nasa];
ttl.nasaCall=async()=>({state:'ready',result:{...meta,updateStatus:'unchanged',checkedAt:actualCheckTime,checkComplete:true,cachedCheck:true}});
const ttlResult=await ttl.updateResource('cloud',{provider:'satcorps'});
assert.equal(ttlResult.status,'unchanged');assert.equal(ttl.resourceState('cloud','satcorps').checkedAt,actualCheckTime,'TTL reuse retains the real check time');
assert.equal(ttl.active.cloud,'current');assert.equal(ttl.pendingRecords.size,0);
console.log('NASA terminal restore/watch errors, missing results, reservation cleanup, background single-flight and truthful TTL timestamps passed');

const restoring=fixture();let finishRestore;
restoring.nasaCall=async()=>({state:'ready',result:meta});
restoring.acceptNASA=async()=>{await new Promise(resolve=>finishRestore=resolve);restoring.pendingRecords.add(nasa.id);return nasa;};
const recovery=restoring.restoreNASA();await Promise.resolve();await Promise.resolve();
assert.equal(restoring.busy,true);assert.equal(restoring.isUpdating('cloud','satcorps'),true);
await assert.rejects(()=>restoring.clear(),/数据正在更新/,'clear cannot race with an already-ready helper image restore');
finishRestore();await recovery;assert.equal(restoring.pendingRecords.size,0);assert.equal(restoring.busy,false);assert.equal(restoring.isUpdating('cloud','satcorps'),false);
console.log('NASA ready-image recovery is included in the update/clear busy gate');

// A previously cached latest image can take time to decode. Another resource's
// cleanup must not remove it between selection and successful texture binding.
for(const decodeFails of [false,true]){
 const decoding=fixture();delete decoding.apply;
 Object.assign(decoding,{tokens:{cloud:0},env:{quality:'standard'},bindCloud(){},status(){}});
 decoding.settings.cloud='latest';decoding.settings.limit=0;decoding.items=[cached];await decoding.cache.put(cached);
 let finishDecode;decoding.texture=()=>new Promise((resolve,reject)=>{finishDecode=()=>decodeFails?reject(Error('decode failed')):resolve({dispose(){}});});
 const applying=decoding.apply('cloud');await decoding.trim();
 assert(decoding.items.some(row=>row.id===cached.id),'in-progress texture retains its cache record during parallel cleanup');
 finishDecode();
 if(decodeFails){await assert.rejects(applying,/decode failed/);assert.equal(decoding.active.cloud,'current');}
 else{await applying;assert.equal(decoding.active.cloud,cached.id);}
 assert.deepEqual(decoding.pendingApply,{},'decode completion releases the temporary reservation');
 await decoding.trim();assert.equal(decoding.items.some(row=>row.id===cached.id),!decodeFails,'only the successfully bound image remains protected');
}
console.log('Pending texture applications survive parallel cache cleanup; failed decodes release reservations');

const removing=fixture(),previous={...cached,id:'old',downloaded:0};
Object.assign(removing,{active:{cloud:'old'},cloudTier:'standard',tokens:{cloud:0},env:{quality:'standard'},bindCloud(){},status(){},apply(kind){return kind==='cloud'?Weather.prototype.apply.call(this,kind):Promise.resolve();}});
removing.sim.orbits.records={};removing.settings.cloud='latest';removing.items=[previous,cached];
await removing.cache.put(previous);await removing.cache.put(cached);
let finishRemovedDecode,disposedRemoved=false;removing.texture=()=>new Promise(resolve=>{finishRemovedDecode=()=>resolve({dispose(){disposedRemoved=true;}});});
const removedApply=removing.apply('cloud');await removing.removeRecords([cached.id]);finishRemovedDecode();await removedApply;
assert.equal(removing.active.cloud,'old','manual removal invalidates the pending application and retains the existing image');
assert.equal(disposedRemoved,true,'a decoded but deleted image is disposed rather than bound');
assert(removing.items.some(row=>row.id===removing.active.cloud));
console.log('Manual cache deletion cancels pending texture application without resurrecting the removed record');
