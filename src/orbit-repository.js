import {DEFAULT_MISSION,mission,bindOrbit} from './missions.js';
import {validateOrbit} from './orbit.js';
import {selectSnapshot} from './weather-math.js';
import {orbitFromGP,gpURL} from './gp-orbit.js';
import {parseOfficialOrbit} from './data-sources.js';
const KEY='tiangong-orbit-library-v1';
export function orbitSource(id){const task=mission(id);return task.updateSource==='celestrak'?gpURL(task.noradId):task.updateSource==='cmse'?'https://en.cmse.gov.cn/news/202107/t20210722_48418.html':null;}
// Orbit selections belong to missions. Environmental assets have no mission ID.
export class OrbitRepository{
 constructor(sim,resources,legacy){
  this.sim=sim;this.resources=resources;
  try{this.records=JSON.parse(localStorage.getItem(KEY));}catch{}
  if(!this.records||typeof this.records!=='object'||Array.isArray(this.records))this.records={...(legacy.orbitRecords||{})};
  if(!Object.hasOwn(this.records,DEFAULT_MISSION)&&legacy.orbitRecord!==undefined)this.records[DEFAULT_MISSION]=legacy.orbitRecord;
 }
 get selected(){return this.records[this.sim.missionId]??null;}
 set selected(value){this.records[this.sim.missionId]=value??null;}
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
   this.records[id]=null;return {data:this.sim.bundledOrbits[id]??null,recordId:null};
  }
 }
 activate(data,recordId,notify=true){this.selected=recordId;this.resources.active.orbit=recordId==='none'?null:recordId;this.use(data,notify);this.save();}
 use(data,notify=true){this.sim.setOrbit(data);if(notify&&this.sim.orbitStatus==='out-of-range')this.sim.api.toast('当前时刻不在此任务轨道有效期内');}
 accept(data,recordId,id){data=bindOrbit(validateOrbit(data),id);this.records[id]=recordId;if(id===this.sim.missionId)this.activate(data,recordId);this.save();this.resources.render();this.sim.sessionMemory?.save();}
 async update(id){
  const r=this.resources,task=mission(id),source=orbitSource(id);if(!source){r.messages.orbit='此任务没有在线轨道源，请导入轨道文件';return;}
  let data;
  if(task.updateSource==='celestrak'){
   let blob;try{({blob}=await r.fetch('/api/orbit/gp?norad='+task.noradId,100000));}catch{({blob}=await r.fetch(source,100000));}
   data=orbitFromGP(JSON.parse(await blob.text()),id,{source:'CelesTrak GP · '+task.name+' · SGP4',url:source});
  }else{
   let blob;try{({blob}=await r.fetch('/api/orbit',6e6));}catch{({blob}=await r.fetch(source,6e6));}
   data=bindOrbit(parseOfficialOrbit(await blob.text()),id);data.source='中国载人航天工程办公室 / BACC';
  }
  const record=await r.store('orbit',new Blob([JSON.stringify(data)],{type:'application/json'}),{missionId:id,time:Date.parse(data.gpEpoch||data.created)||data.rows[0][0],source});this.accept(data,record.id,id);
 }
}
