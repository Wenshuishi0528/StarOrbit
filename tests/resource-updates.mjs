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
const reuse=fixture();reuse.items=[cached];let validated=0;reuse.fetch=async()=>({blob:cloud,http:{etag:'"same"'},unchanged:false});reuse.validateCloud=async()=>{validated++;};await assert.rejects(()=>reuse.updateCloud('github'),error=>error.retryable===false&&/GitHub/.test(error.message));assert.equal(validated,0,'retired source is blocked before decode');
const now=Date.now(),meta={provider:'satcorps',quality:{schema:1,status:'accepted',reasons:[],metrics:{}},time:now-86400e3,observedStart:now-86400e3,observedEnd:now-86e6,resolution:'8192×4096',nativeResolution:'12960×6480',channel:'red',coverage:1,polarCoverage:{north:1,south:1},footprint:{global:1,north:1,south:1},sha256:hash,updateStatus:'partial',updateMessage:'部分候选暂不可访问，保留已下载云图',checkedAt:now};
const nasa={...cached,...meta,id:'nasa'};reuse.items=[nasa];reuse.fetch=async()=>{throw Error('should not fetch cached image');};assert.equal(await reuse.acceptNASA({result:meta}),nasa);assert.equal(reuse.lastCloudOutcome.satcorps.status,'partial');assert.equal(reuse.messages.cloud,meta.updateMessage,'existing cached NASA image still receives final check outcome');
const cache=fixture();await cache.store('cloud',new Blob(['new payload']),{provider:'github'});assert(cache.protectedIds().includes(cache.items[0].id),'unapplied in-flight payload protected against other writes');assert(cache.protectedIds().includes('current-orbit'));
console.log('Resource single-flight updates, failure retention, apply rollback, identical-image reuse, NASA partial status and in-flight cache protection passed');

// A requested update can fail and recover without changing source choices or
// duplicating jobs. Exercise the scheduler through the actual Weather methods.
const {ResourceRecovery}=await import('../src/resource-recovery.js');
const recovering=fixture();let recoveryTimer,tries=0;
recovering.recovery=new ResourceRecovery({now:()=>now,online:()=>true,setTimer:fn=>{recoveryTimer=fn;return 1;},clearTimer:()=>{recoveryTimer=null;},run:(key,attempt)=>recovering.retryResource(key,attempt),onState:(key,state)=>{recovering.resourceStates[key]={...recovering.resourceState('cloud','github'),...state};}});
recovering.updateCloud=async()=>{if(++tries===1)throw Object.assign(Error('data source temporarily unavailable'),{retryable:true});return cached;};
await assert.rejects(()=>recovering.updateResource('cloud',{provider:'github'}));
assert.equal(recovering.resourceState('cloud','github').recovery,'waiting');assert.equal(recovering.active.cloud,'current');assert.equal(recovering.busy,false);
const wake=recoveryTimer;wake();await Promise.resolve();await Promise.resolve();await recovering.jobs.get('cloud:github');
assert.equal(tries,2);assert.equal(recovering.resourceState('cloud','github').phase,'updated');assert.equal(recovering.resourceState('cloud','github').recovery,undefined);assert.equal(recovering.recovery.pending.size,0);assert.equal(recovering.jobs.size,0);assert.equal(recovering.settings.cloud,'builtin');
console.log('Requested download automatically recovers after a transient failure without replacing source choices or creating duplicate jobs');

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
await assert.rejects(()=>ttl.updateResource('cloud',{provider:'satcorps'}),error=>error.retryable===false&&/版本列表/.test(error.message));
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
 decoding.settings.cloud='satcorps';decoding.settings.limit=0;decoding.items=[nasa];await decoding.cache.put(nasa);
 let finishDecode;decoding.texture=()=>new Promise((resolve,reject)=>{finishDecode=()=>decodeFails?reject(Error('decode failed')):resolve({dispose(){}});});
 const applying=decoding.apply('cloud');await decoding.trim();
 assert(decoding.items.some(row=>row.id===nasa.id),'in-progress texture retains its cache record during parallel cleanup');
 finishDecode();
 if(decodeFails){await assert.rejects(applying,/decode failed/);assert.equal(decoding.active.cloud,'current');}
 else{await applying;assert.equal(decoding.active.cloud,nasa.id);}
 assert.deepEqual(decoding.pendingApply,{},'decode completion releases the temporary reservation');
 await decoding.trim();assert.equal(decoding.items.some(row=>row.id===nasa.id),true,'last accepted rollback image remains protected even if texture decode fails');
}
console.log('Pending texture applications survive parallel cache cleanup; failed decodes release reservations');

const removing=fixture(),previous={...nasa,id:'old',time:nasa.time-86400e3,downloaded:0};
Object.assign(removing,{active:{cloud:'old'},cloudTier:'standard',tokens:{cloud:0},env:{quality:'standard'},bindCloud(){},status(){},apply(kind){return kind==='cloud'?Weather.prototype.apply.call(this,kind):Promise.resolve();}});
removing.sim.orbits.records={};removing.settings.cloud='satcorps';removing.items=[previous,nasa];
await removing.cache.put(previous);await removing.cache.put(nasa);
let finishRemovedDecode,disposedRemoved=false;removing.texture=()=>new Promise(resolve=>{finishRemovedDecode=()=>resolve({dispose(){disposedRemoved=true;}});});
const removedApply=removing.apply('cloud');await removing.removeRecords([nasa.id]);finishRemovedDecode();await removedApply;
assert.equal(removing.active.cloud,'old','manual removal invalidates the pending application and retains the existing image');
assert.equal(disposedRemoved,true,'a decoded but deleted image is disposed rather than bound');
assert(removing.items.some(row=>row.id===removing.active.cloud));
console.log('Manual cache deletion cancels pending texture application without resurrecting the removed record');

const retryOrbit=fixture();let choice={recordId:'current-orbit',revision:1},attemptSelection;
retryOrbit.sim.orbits.selection=()=>({...choice});
retryOrbit.sim.orbits.update=async(id,selected)=>{attemptSelection=selected;throw Object.assign(Error('offline'),{retryable:true});};
await assert.rejects(()=>retryOrbit.updateResource('orbit',{provider:'tiangong'}));
choice={recordId:'manual-history',revision:2};
retryOrbit.sim.orbits.update=async(id,selected)=>{attemptSelection=selected;return {status:'updated',applied:false};};
await retryOrbit.updateResource('orbit',{provider:'tiangong',recoveryAttempt:1});
assert.deepEqual(attemptSelection,{recordId:'current-orbit',revision:1},'recovery carries the original orbit selection instead of overwriting a newer manual choice');
console.log('Automatic orbit retries retain the original selection guard');

const upgraded=fixture(),legacy={...nasa,quality:undefined,favorite:true};upgraded.items=[legacy];await upgraded.cache.put(legacy);upgraded.fetch=async()=>{throw Error('must reuse local bytes');};await upgraded.acceptNASA({result:meta});assert.equal(legacy.quality.schema,1);assert.equal(legacy.favorite,true);
const retained=fixture();retained.settings.limit=0;const frames=[1,2,3].map(n=>({...nasa,id:'retained-'+n,time:nasa.time+n,downloaded:n}));for(const row of frames)await retained.cache.put(row);retained.items=frames;await retained.trim();assert.deepEqual(retained.items.map(r=>r.id),['retained-2','retained-3']);assert.equal(retained.cacheReport.overBudget,true);
retained.validateManualCloud=async()=>{throw Error('invalid image');};await assert.rejects(()=>retained.useRecord(cached),/invalid image/);retained.items.push(cached);await assert.rejects(()=>retained.setSource('cloud','history',cached.id),/GitHub/);
console.log('Quality metadata upgrades preserve favorites and automatic trimming preserves two accepted snapshots');

const rejectedImport=fixture();let importedStored=false;
rejectedImport.validateManualCloud=async()=>{throw Object.assign(Error('invalid image'),{retryable:false});};rejectedImport.store=async()=>{importedStored=true;};
const imported={format:'tiangong-weather-1',meta:{...meta,kind:'cloud'},base64:Buffer.from(await cloud.arrayBuffer()).toString('base64')};
await assert.rejects(()=>rejectedImport.importFile(new Blob([JSON.stringify(imported)])),/invalid image/);assert.equal(importedStored,false,'claimed quality metadata cannot bypass fresh import pixel screening');
const merge=fixture();const first=await merge.store('cloud',cloud,{...meta,favorite:true});await merge.store('cloud',cloud,{...meta,quality:{...meta.quality,metrics:{checked:1}},favorite:false});assert.equal(first.favorite,true);assert.equal(first.quality.metrics.checked,1,'same hash refreshes quality metadata without discarding favorites');
const allUpdates=fixture(),allKinds=[];allUpdates.updateResource=async kind=>{allKinds.push(kind);};await allUpdates.updateAll();assert.deepEqual(allKinds,['aurora','orbit'],'check all omits the paused GitHub source');
console.log('Import cannot bypass pixel screening; equal-hash metadata refresh and paused-source update-all passed');

const badCandidate=fixture();badCandidate.fetch=async()=>({blob:cloud});badCandidate.validateCloud=async()=>{throw Object.assign(Error('cloud quality rejected'),{retryable:false});};
await assert.rejects(()=>badCandidate.acceptNASA({result:meta}),/cloud quality rejected/);assert.equal(badCandidate.items.length,0);assert.equal(badCandidate.active.cloud,'current');assert.equal(badCandidate.pendingRecords.size,0);
const quotaBackup=fixture();quotaBackup.settings.limit=0;const backupFrames=[1,2,3].map(n=>({...nasa,id:'quota-'+n,time:nasa.time+n,downloaded:n}));for(const row of backupFrames)await quotaBackup.cache.put(row);quotaBackup.items=backupFrames;
const originalPut=quotaBackup.cache.put.bind(quotaBackup.cache);let quotaFailed=false;quotaBackup.cache.put=async row=>{if(!quotaFailed){quotaFailed=true;throw Object.assign(Error('quota'),{name:'QuotaExceededError'});}return originalPut(row);};
const newFrame=await quotaBackup.store('cloud',cloud,{...meta,time:nasa.time+10});assert(quotaBackup.items.some(r=>r.id==='quota-3'),'quota recovery retains the previous accepted generation');assert(quotaBackup.items.some(r=>r.id===newFrame.id));
console.log('Bad candidates never enter the cache and real quota recovery preserves rollback generation');

const migrated=fixture(),goodLegacy={...nasa,id:'legacy-good',quality:undefined},badLegacy={...nasa,id:'legacy-bad',blob:new Blob(['damaged']),quality:undefined};
migrated.items=[goodLegacy,badLegacy];for(const row of migrated.items)await migrated.cache.put(row);let migrationChecks=0;
migrated.validateCloud=async()=>{migrationChecks++;return meta.quality;};await migrated.migrateCloudCache();assert.equal(goodLegacy.quality.status,'accepted');assert.equal(badLegacy.quality.status,'rejected');assert.equal(badLegacy.quality.reasons[0],'cache-integrity');assert.equal(migrationChecks,1);await migrated.migrateCloudCache();assert.equal(migrationChecks,1,'schema-current records are not reanalyzed at every startup');assert.equal((await migrated.cache.all()).length,2,'migration preserves damaged and healthy archived bytes');
const recoverBlob=fixture(),saved=await recoverBlob.store('cloud',cloud,{...meta,favorite:true});saved.blob=new Blob(['damaged in storage']);saved.size=saved.blob.size;await recoverBlob.cache.put(saved);let reDownloads=0,reChecks=0;recoverBlob.fetch=async()=>{reDownloads++;return {blob:cloud};};recoverBlob.validateCloud=async()=>{reChecks++;return meta.quality;};await recoverBlob.acceptNASA({result:meta});assert.equal(await saved.blob.text(),await cloud.text());assert.equal(saved.size,cloud.size);assert.equal(saved.favorite,true);assert.equal(reDownloads,1);assert.equal(reChecks,1);await recoverBlob.acceptNASA({result:meta});assert.equal(reDownloads,1);assert.equal(reChecks,1,'verified immutable bytes reuse session hash and pixel checks');
console.log('Legacy browser migration, isolated corrupt archives and same-id blob recovery passed');

const concurrentMigration=fixture(),pendingLegacy={...nasa,id:'pending-legacy',quality:undefined};concurrentMigration.settings.limit=0;concurrentMigration.items=[pendingLegacy];await concurrentMigration.cache.put(pendingLegacy);
let releaseMigration,enteredMigration;const migrationEntered=new Promise(resolve=>enteredMigration=resolve);
concurrentMigration.validateCloud=()=>{enteredMigration();return new Promise(resolve=>releaseMigration=()=>resolve(meta.quality));};
const migrationTask=concurrentMigration.migrateCloudCache();await migrationEntered;await concurrentMigration.trim();assert(concurrentMigration.items.some(r=>r.id===pendingLegacy.id));assert.equal(concurrentMigration.busy,true);releaseMigration();await migrationTask;assert.equal(concurrentMigration.busy,false);assert.equal(concurrentMigration.pendingRecords.size,0);
console.log('In-progress legacy inspection survives concurrent cache trimming and releases its busy/reservation state');

for(const failQualityWrite of [false,true]){
 const cloningMigration=fixture(),clonedLegacy={...nasa,id:'cloned-legacy',quality:undefined},disposable={id:'disposable',kind:'aurora',size:1,downloaded:0};
 cloningMigration.settings.limit=0;cloningMigration.items=[clonedLegacy,disposable];const rows=new Map(cloningMigration.items.map(row=>[row.id,structuredClone(row)]));
 cloningMigration.cache={all:async()=>[...rows.values()].map(row=>structuredClone(row)),put:async row=>{if(failQualityWrite&&row.quality)throw Error('metadata write unavailable');rows.set(row.id,structuredClone(row));},trim:async()=>{const removed=rows.delete('disposable');return {removedIds:removed?['disposable']:[],removedBytes:removed?1:0,totalBytes:clonedLegacy.size,overBudget:true};}};
 let releaseCloned,enterCloned;const enteredCloned=new Promise(resolve=>enterCloned=resolve);
 cloningMigration.validateCloud=()=>{enterCloned();return new Promise(resolve=>releaseCloned=()=>resolve(meta.quality));};
 const migratingClones=cloningMigration.migrateCloudCache();await enteredCloned;await cloningMigration.trim();assert.notEqual(cloningMigration.items[0],clonedLegacy,'trim reloads an IndexedDB clone');releaseCloned();await migratingClones;
 assert.equal(cloningMigration.items[0].quality?.status,failQualityWrite?undefined:'accepted','post-migration selection reflects persisted quality, never a stale or failed in-memory write');
 assert.equal(cloningMigration.pendingRecords.size,0);assert.equal(cloningMigration.busy,false);
}
console.log('Migration reload observes persisted reports after concurrent IndexedDB clone reloads, including failed metadata writes');
