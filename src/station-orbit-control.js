import {onLanguageChange,t} from './i18n.js';
import {clockText} from './time-format.js';
import {observerOrbit,orbitSelection,sameSelection} from './observer-settings.js';
import {updateReport} from './observer-orbit-display.js';

// A view onto the mission repository. There is no per-panel orbit store or download path.
export function mountStationOrbitControl(host,sim,onChange){
 const id='tiangong',row=document.createElement('div');row.className='station-orbit-control';
 const label=document.createElement('small'),button=document.createElement('button'),note=document.createElement('small');
 button.type='button';button.dataset.stationOrbit='update';note.setAttribute('role','status');
 row.style.cssText='display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;margin:6px 0;color:#b1c4d3;font-size:12px';
 button.style.cssText='padding:4px 9px;min-height:0;font-size:12px';row.append(label,button,note);host.append(row);
 let data=sim.missionId===id?sim.data:sim.orbits?.selection?.(id)?.recordId?null:sim.bundledOrbits?.[id];
 let selected=null,pending=0,loading=null,disposed=false,busy=false,report=null;
 function paint(){
  button.textContent=t(busy?'正在检查轨道…':'更新空间站轨道');button.disabled=busy;
  const epoch=Date.parse(data?.gpEpoch||data?.created),start=data?.rows?.[0]?.[0],end=data?.rows?.at(-1)?.[0];
  label.textContent=Number.isFinite(start)&&Number.isFinite(end)?t('天宫星历 · 发布 {epoch} · 有效 {start} 至 {end}（UTC+8）',{epoch:Number.isFinite(epoch)?clockText(epoch):'—',start:clockText(start).slice(0,16),end:clockText(end).slice(0,16)}):t('当前没有选中的空间站星历');
  note.textContent=report?(report.error?t(report.error):updateReport(sim.environment.weather,id,report)):'';note.hidden=!report;
 }
 function refresh(){
  if(disposed)return Promise.resolve();const choice=orbitSelection(sim,id);
  if(sameSelection(selected,choice))return loading??Promise.resolve();
  const token=++pending;selected=choice;
  const promise=(async()=>{
  try{
   const value=await observerOrbit(sim,id);
   if(disposed||token!==pending)return;
   if(!sameSelection(choice,orbitSelection(sim,id))){selected=null;return refresh();}
   const changed=value!==data;data=value;paint();if(changed)onChange?.(value);
  }catch(error){if(!disposed&&token===pending){selected=null;report={error:error.message};paint();}}
  finally{if(token===pending)loading=null;}
  })();loading=promise;return promise;
 }
 async function update(){
  if(busy||disposed)return;busy=true;report=null;paint();
  try{const outcome=await sim.environment.weather.updateResource('orbit',{provider:id});if(!disposed){report=outcome;await refresh();}}
  catch(e){if(!disposed)report={error:e.message};}
  finally{busy=false;if(!disposed)paint();}
 }
 const listen=()=>{if(!host.closest('[hidden]'))refresh();};
 button.onclick=update;sim.orbits?.changes?.addEventListener('change',listen);
 const off=onLanguageChange(paint);paint();queueMicrotask(refresh);
 return {get data(){return data;},refresh,dispose(){disposed=true;pending++;sim.orbits?.changes?.removeEventListener('change',listen);off();row.remove();}};
}
