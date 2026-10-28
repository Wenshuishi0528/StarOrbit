import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {OrbitRepository,sameOrbitState} from '../src/orbit-repository.js';
import {bindOrbit} from '../src/missions.js';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const station=bindOrbit(read('../assets/orbit.json'),'tiangong'),dfh=bindOrbit(read('../assets/spacecraft/dfh1-orbit.json'),'dfh1'),gp=read('../assets/spacecraft/dfh1-gp.json')[0];
const later=(data,offset=1)=>({...data,created:new Date(Date.parse(data.created)+86400000).toISOString(),rows:data.rows.map(row=>row.map((v,i)=>i===1?v+offset:v))});
const changed=later(station),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(id='tiangong',data=id==='tiangong'?station:dfh){
 const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const calls={set:0,store:0,trim:[],fetch:[],render:0};
 const sim={missionId:id,data,bundledOrbits:{tiangong:station,dfh1:dfh},setOrbit(value){this.data=value;calls.set++;},api:{toast(){}},sessionMemory:{save(){}}};
 const resources={items:[],active:{orbit:null},pendingRecords:new Set(),messages:{},render(){calls.render++;},
  async fetch(url){calls.fetch.push(url);return {blob:new Blob([JSON.stringify(changed)])};},
  async store(kind,blob,extra){calls.store++;const id=kind+'-'+createHash('sha256').update(await blob.text()).digest('hex'),old=this.items.find(r=>r.id===id);if(old)return old;const record={id,kind,blob,size:blob.size,...extra,downloaded:Date.now()};this.items.push(record);this.pendingRecords.add(id);return record;},
  async trim(ids){calls.trim.push(ids);return {removedIds:[],removedBytes:0,totalBytes:0,overBudget:false};}
 };
 const repo=new OrbitRepository(sim,resources,{});return {repo,sim,resources,calls};
}
function cached(f,id,data){const record={id,kind:'orbit',missionId:data.missionId,time:Date.parse(data.gpEpoch||data.created),blob:new Blob([JSON.stringify(data)])};f.resources.items.push(record);return record;}

assert.equal(sameOrbitState(station,{...station,source:'renamed source',created:'2099-01-01T00:00:00Z'}),true);
assert.equal(sameOrbitState(station,changed),false);assert.equal(sameOrbitState(station,{...station,missionId:'dfh1'}),false);
const same=fixture();same.resources.fetch=async()=>({blob:new Blob([JSON.stringify({...station,source:'updated description',created:changed.created})])});
const unchanged=await same.repo.update('tiangong');assert.deepEqual(unchanged,{status:'unchanged',record:null,applied:false});assert.equal(same.calls.store,0);assert.equal(same.calls.set,0);assert.equal(same.sim.data,station,'matching bundled data keeps the active object and derived caches');

const fresh=fixture(),hold=deferred();fresh.resources.fetch=async url=>{fresh.calls.fetch.push(url);await hold.promise;return {blob:new Blob([JSON.stringify(changed)])};};
const one=fresh.repo.update('tiangong'),two=fresh.repo.update('tiangong');assert.equal(one,two,'repeated checks share the exact same in-flight promise');
hold.resolve();const result=await one;assert.equal(fresh.calls.fetch.length,1);assert.equal(result.status,'updated');assert.equal(result.applied,true);assert.equal(fresh.calls.set,1);assert.equal(fresh.repo.selected,result.record.id);assert.equal(fresh.resources.active.orbit,result.record.id);assert.equal(fresh.resources.pendingRecords.size,0);assert.deepEqual(fresh.calls.trim,[[result.record.id]]);
const activeData=fresh.sim.data;assert.equal((await fresh.repo.update('tiangong')).status,'unchanged');assert.equal(fresh.calls.store,1);assert.equal(fresh.calls.set,1);assert.equal(fresh.sim.data,activeData);

const manual=fixture(),manualHold=deferred();manual.resources.fetch=async()=>{await manualHold.promise;return {blob:new Blob([JSON.stringify(changed)])};};
const manualUpdate=manual.repo.update('tiangong');manual.repo.selected=null;manualHold.resolve();const saved=await manualUpdate;
assert.equal(saved.status,'updated');assert.equal(saved.applied,false);assert.equal(manual.calls.set,0);assert.equal(manual.repo.selected,null,'an explicit same-value history/builtin choice still cancels late activation');assert.equal(manual.resources.items.length,1);assert.equal(manual.resources.pendingRecords.size,0);

const switched=fixture(),switchHold=deferred();switched.resources.fetch=async()=>{await switchHold.promise;return {blob:new Blob([JSON.stringify(changed)])};};
const switchUpdate=switched.repo.update('tiangong');switched.sim.missionId='dfh1';switched.sim.data=dfh;switchHold.resolve();const switchedResult=await switchUpdate;
assert.equal(switchedResult.applied,false);assert.equal(switched.calls.set,0);assert.equal(switched.sim.data,dfh);assert.equal(switched.repo.records.tiangong,switchedResult.record.id);assert.equal(switched.repo.selected,null,'the inactive mission receives its own record only');

const failed=fixture();failed.resources.fetch=async()=>{throw Error('network failed');};await assert.rejects(()=>failed.repo.update('tiangong'),/network failed/);assert.equal(failed.repo.updates.size,0);assert.equal(failed.repo.selected,null);assert.equal(failed.sim.data,station);
failed.resources.fetch=async()=>({blob:new Blob([JSON.stringify(changed)])});failed.resources.store=async()=>{throw new DOMException('quota','QuotaExceededError');};await assert.rejects(()=>failed.repo.update('tiangong'),{name:'QuotaExceededError'});assert.equal(failed.calls.set,0);assert.equal(failed.repo.selected,null);assert.equal(failed.sim.data,station);
const invalid=fixture();invalid.resources.fetch=async()=>({blob:new Blob(['not orbit data'])});await assert.rejects(()=>invalid.repo.update('tiangong'));assert.equal(invalid.calls.store,0);assert.equal(invalid.calls.set,0);

// Older remote data can never downgrade the selected, bundled or cached version.
const old=fixture('tiangong',changed);old.resources.fetch=async()=>({blob:new Blob([JSON.stringify(station)])});const oldResult=await old.repo.update('tiangong');assert.equal(oldResult.status,'unchanged');assert.match(oldResult.message,/早于/);assert.equal(old.calls.store,0);assert.equal(old.calls.set,0);
const cachedNewer=fixture();cached(cachedNewer,'newer',later(changed));cachedNewer.resources.fetch=async()=>({blob:new Blob([JSON.stringify(changed)])});assert.match((await cachedNewer.repo.update('tiangong')).message,/早于/);assert.equal(cachedNewer.calls.store,0);assert.equal(cachedNewer.sim.data,station,'checking an old remote never silently changes a historical choice');
const corrupt=fixture();corrupt.resources.items.push({id:'invalid',kind:'orbit',missionId:'tiangong',time:Date.now()+1e12,blob:new Blob(['corrupt'])});assert.equal((await corrupt.repo.update('tiangong')).status,'updated','invalid cache metadata cannot block a valid update');

// The bundled rows already correspond to this GP; attaching its validated raw
// elements lets the update path demonstrate reuse without 8,641 propagations.
const withGP={...dfh,gp,gpEpoch:new Date(Date.parse(gp.EPOCH+'Z')).toISOString()};
const gpSame=fixture('dfh1',withGP);gpSame.resources.fetch=async()=>({blob:new Blob([JSON.stringify([{...gp,OBJECT_NAME:'renamed',EPOCH:gp.EPOCH+'Z',MEAN_MOTION:String(gp.MEAN_MOTION)}])])});
assert.equal((await gpSame.repo.update('dfh1')).status,'unchanged');assert.equal(gpSame.repo.payloads.get('dfh1').data,withGP,'canonical GP equality reuses the complete active sample object');assert.equal(gpSame.calls.store,0);assert.equal(gpSame.calls.set,0);
const gpOld=fixture('dfh1',{...withGP,gpEpoch:'2026-11-01T00:00:00Z'});gpOld.resources.fetch=gpSame.resources.fetch;assert.match((await gpOld.repo.update('dfh1')).message,/早于/);assert.equal(gpOld.repo.payloads.size,0,'reject stale GP before generating a new sample window');

// Node evaluates the same compile-time web flag as the browser bundle. Verify
// static hosting goes straight to the public endpoint without a doomed /api call.
execFileSync(process.execPath,['--input-type=module','-e',`
 globalThis.__WEB_BUILD__=true;
 const {OrbitRepository}=await import('./src/orbit-repository.js');
 const {readFileSync}=await import('node:fs');
 const {bindOrbit}=await import('./src/missions.js');
 const data=bindOrbit(JSON.parse(readFileSync('assets/orbit.json')),'tiangong'),urls=[];
 const repo=new OrbitRepository({missionId:'tiangong',data,bundledOrbits:{tiangong:data}},{items:[],messages:{},fetch:async url=>{urls.push(url);return {blob:new Blob([JSON.stringify(data)])};}},{});
 await repo.update('tiangong');
 if(urls.length!==1||!urls[0].startsWith('https://en.cmse.gov.cn/'))throw Error('web build requested local API');
`],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
console.log('Orbit updates: single-flight, canonical OEM/GP reuse, stale-source rejection, web direct fetch, mission/manual-choice races and failure retention passed');
