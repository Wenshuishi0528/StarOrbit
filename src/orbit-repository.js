import {DEFAULT_MISSION,mission,bindOrbit} from './missions.js';
import {validateOrbit} from './orbit.js';
import {selectSnapshot} from './weather-math.js';
import {orbitFromGP,gpURL,validateGP} from './gp-orbit.js';
import {parseOfficialOrbit} from './data-sources.js';
import {WEB_BUILD} from './runtime-assets.js';
const KEY='tiangong-orbit-library-v1';
export function orbitSource(id){const task=mission(id);return task.updateSource==='celestrak'?gpURL(task.noradId):task.updateSource==='cmse'?'https://en.cmse.gov.cn/news/202107/t20210722_48418.html':null;}
// Descriptive source/creation metadata can change without changing any state.
export function sameOrbitState(a,b){
 if(!a||!b||a.frame!==b.frame||a.timeSystem!==b.timeSystem||a.units!==b.units||a.rows?.length!==b.rows?.length||!a.rows?.length)return false;
 if((a.center||'EARTH')!==(b.center||'EARTH')||a.missionId!==b.missionId)return false;
 return a.rows.every((row,i)=>row.length===b.rows[i].length&&row.every((value,j)=>value===b.rows[i][j]));
}
function gpKey(input,id){
 const {OBJECT_NAME,EPOCH,...elements}=validateGP(input,id);
 return JSON.stringify({...elements,epoch:Date.parse(EPOCH.endsWith('Z')?EPOCH:EPOCH+'Z')});
}
function versionTime(data){const value=data?.gpEpoch||data?.gp?.EPOCH||data?.created;return typeof value==='string'?Date.parse(/(?:Z|[+-]\d\d:?\d\d)$/i.test(value)?value:value+'Z'):NaN;}
// Orbit selections belong to missions. Environmental assets have no mission ID.
export class OrbitRepository{
 constructor(sim,resources,legacy){
  this.sim=sim;this.resources=resources;this.updates=new Map();this.payloads=new Map();this.selectionRevisions={};
  try{this.records=JSON.parse(localStorage.getItem(KEY));}catch{}
  if(!this.records||typeof this.records!=='object'||Array.isArray(this.records))this.records={...(legacy.orbitRecords||{})};
  if(!Object.hasOwn(this.records,DEFAULT_MISSION)&&legacy.orbitRecord!==undefined)this.records[DEFAULT_MISSION]=legacy.orbitRecord;
 }
 get selected(){return this.records[this.sim.missionId]??null;}
 set selected(value){this.setSelection(this.sim.missionId,value);}
 setSelection(id,value){this.records[id]=value??null;this.selectionRevisions[id]=(this.selectionRevisions[id]||0)+1;}
 save(){try{localStorage.setItem(KEY,JSON.stringify(this.records));}catch{}}
 async restore(){
  if(!Object.hasOwn(this.records,this.sim.missionId)){const latest=selectSnapshot(this.resources.items.filter(r=>(r.missionId||DEFAULT_MISSION)===this.sim.missionId),'orbit','latest');this.selected=latest?.id??null;}
  const {data,recordId}=await this.resolve(this.sim.missionId);this.activate(data,recordId,false);
 }
 async resolve(id){
  for(;;){const key=this.records[id]??null;if(key==='none')return {data:null,recordId:'none'};
   const record=this.resources.items.find(r=>r.id===key&&r.kind==='orbit'&&(r.missionId||DEFAULT_MISSION)===id);
   if(record){try{const data=bindOrbit(validateOrbit(JSON.parse(await record.blob.text())),id);if(key!==this.records[id])continue;return {data,recordId:key};}
    catch{if(key!==this.records[id])continue;this.sim.api.toast('轨道缓存不可用，已恢复该任务的内置数据');}}
   if(!Object.hasOwn(this.records,id)||this.records[id]!==null)this.setSelection(id,null);return {data:this.sim.bundledOrbits[id]??null,recordId:null};
  }
 }
 activate(data,recordId,notify=true){this.selected=recordId;this.resources.active.orbit=recordId==='none'?null:recordId;this.use(data,notify);this.save();}
 use(data,notify=true){this.sim.setOrbit(data);if(notify&&this.sim.orbitStatus==='out-of-range')this.sim.api.toast('轨道演算不可用');}
 accept(data,recordId,id){data=bindOrbit(validateOrbit(data),id);this.setSelection(id,recordId);if(id===this.sim.missionId)this.activate(data,recordId);this.save();this.resources.render();this.sim.sessionMemory?.save();}
 async selectionData(id){
  const record=this.resources.items.find(r=>r.id===this.records[id]&&r.kind==='orbit'&&(r.missionId||DEFAULT_MISSION)===id)||null;
  if(id===this.sim.missionId)return {data:this.sim.data,record};
  if(this.records[id]==='none')return {data:null,record:null};
  if(record){try{return {data:bindOrbit(validateOrbit(JSON.parse(await record.blob.text())),id),record};}catch{}}
  return {data:this.sim.bundledOrbits[id]??null,record:null};
 }
 async hasNewerVersion(id,time,current){
  if(!Number.isFinite(time))return false;
  if([current.data,this.sim.bundledOrbits[id]].some(data=>versionTime(data)>time))return true;
  // Only read candidates whose stored publication/element epoch is newer.
  // Validate their payload too: corrupt cache metadata must not block updates.
  const candidates=this.resources.items.filter(r=>r.kind==='orbit'&&(r.missionId||DEFAULT_MISSION)===id&&r.time>time).sort((a,b)=>b.time-a.time);
  for(const record of candidates){try{if(versionTime(bindOrbit(validateOrbit(JSON.parse(await record.blob.text())),id))>time)return true;}catch{}}
  return false;
 }
 update(id){
  if(this.updates.has(id))return this.updates.get(id);
  const promise=this.updateMission(id);this.updates.set(id,promise);
  const finished=()=>{if(this.updates.get(id)===promise)this.updates.delete(id);};promise.then(finished,finished);return promise;
 }
 async updateMission(id){
  const r=this.resources,task=mission(id),source=orbitSource(id);if(!source)throw Error('此任务没有在线轨道源，请导入轨道文件');
  const selection=this.records[id]??null,revision=this.selectionRevisions[id]||0,initial=await this.selectionData(id);
  const fetchSource=async(local,max)=>{if(!WEB_BUILD){try{return await r.fetch(local,max);}catch{}}return r.fetch(source,max);};
  let data,gp,key;
  if(task.updateSource==='celestrak'){
   const {blob}=await fetchSource('/api/orbit/gp?norad='+task.noradId,100000);gp=validateGP(JSON.parse(await blob.text()),id);key=gpKey(gp,id);
  }else{
   const {blob}=await fetchSource('/api/orbit',6e6);
   data=bindOrbit(parseOfficialOrbit(await blob.text()),id);data.source='中国载人航天工程办公室 / BACC';
  }
  const current=await this.selectionData(id);
  if(await this.hasNewerVersion(id,versionTime(gp?{gp}:data),current)){const message='远端数据早于已有版本，已保留已有数据';r.messages.orbit=message;return {status:'unchanged',record:current.record,applied:false,message};}
  if(gp){
   const previous=this.payloads.get(id);let initialKey;try{if(initial.data?.gp)initialKey=gpKey(initial.data.gp,id);}catch{}
   // Matching GP elements need neither a new 8,641-sample propagation nor a
   // replacement of the active data object and its derived render/event caches.
   data=previous?.key===key?previous.data:initialKey===key?initial.data:orbitFromGP(gp,id,{source:'CelesTrak GP · '+task.name+' · SGP4',url:source});
   this.payloads.set(id,{key,data});
  }
  if(sameOrbitState(data,current.data)){r.messages.orbit='已是最新可用数据';return {status:'unchanged',record:current.record,applied:false};}
  const previousIds=new Set(r.items.map(record=>record.id));let record;
  try{
   record=await r.store('orbit',new Blob([JSON.stringify(data)],{type:'application/json'}),{missionId:id,time:Date.parse(data.gpEpoch||data.created)||data.rows[0][0],source});
   const unchangedSelection=(this.records[id]??null)===selection&&(this.selectionRevisions[id]||0)===revision;
   let applied=false;
   // Keep a late download in its own mission's library. Never overwrite a
   // manual history choice, or activate it on a different current mission.
   if(unchangedSelection){this.accept(data,record.id,id);applied=id===this.sim.missionId;}
   await r.trim([record.id]);
   return {status:previousIds.has(record.id)?'unchanged':'updated',record,applied};
  }finally{if(record)r.pendingRecords?.delete(record.id);}
 }
}
