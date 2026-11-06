import {flightVessel} from './free-flight-vessels.js';
import {onLanguageChange,t} from './i18n.js';
import {clockText} from './time-format.js';
import {savedFlights} from './free-flight-store.js';

export const portNames={TH_FORWARD:'节点前端',TH_AFT:'天和尾端',TH_LOWER:'节点下方',TH_WENTIAN:'节点左侧',TH_MENGTIAN:'节点右侧'};
export function shipLabel(type,portId){
 const path=portId.split('/').map(key=>t(portNames[key]||key)).join(' / ');
 return t(flightVessel(type)?.name||type)+' · '+path;
}

export function createFlightLauncher(sim,{start,resume}){
 const trigger=document.createElement('button');trigger.id='openFreeFlight';trigger.type='button';
 trigger.setAttribute('aria-haspopup','dialog');
 document.getElementById('toolbarActions').prepend(trigger);
 const dialog=document.createElement('dialog');dialog.id='freeFlightLauncher';dialog.setAttribute('aria-labelledby','freeFlightTitle');document.body.append(dialog);
 dialog.innerHTML=`<div class="ff-launch-head"><h2 id="freeFlightTitle" data-launch-text="自由飞行"></h2><button type="button" data-close data-launch-text="关闭"></button></div>
  <p data-info></p><label><span data-launch-text="从当前组合出发"></span><select data-launch-craft></select></label>
  <button type="button" class="primary" data-start data-launch-text="开始飞行"></button>
  <div data-saves><label><span data-launch-text="已保存的飞行"></span><select data-launch-save></select></label>
   <button type="button" data-resume data-launch-text="继续选中的飞行"></button></div>`;
 const find=s=>dialog.querySelector(s),crafts=find('[data-launch-craft]'),saves=find('[data-launch-save]');
 function refresh(){
  trigger.textContent=t('自由飞行');
  for(const el of dialog.querySelectorAll('[data-launch-text]'))el.textContent=t(el.dataset.launchText);
  const previous=crafts.value,previousSave=saves.value;
  const slots=Object.entries(sim.api.state.slots).filter(([,type])=>flightVessel(type));
  const canStart=sim.missionId==='tiangong'&&!!sim.current&&slots.length>0;
  crafts.replaceChildren(...slots.map(([id,type])=>new Option(shipLabel(type,id),id)));
  if(slots.some(([id])=>id===previous))crafts.value=previous;
  crafts.disabled=find('[data-start]').disabled=!canStart;
  find('[data-info]').textContent=t(sim.missionId!=='tiangong'?'新飞行请先在任务选择中切换到天宫。':!sim.current?'当前轨道不适用于近站飞行':!slots.length?'请在舱体组合中停靠一艘神舟或天舟。':'以当前时刻和装配开始独立飞行。返回观测会保存进度。');
  const rows=savedFlights();
  saves.replaceChildren(...rows.map(r=>{
   const ships=Array.isArray(r.session?.ships)?r.session.ships:[];
   const ship=ships.find(s=>s?.id===r.selectedId&&typeof s.portId==='string'&&flightVessel(s.type));
   return new Option(clockText(r.savedAt)+' · '+(ship?shipLabel(ship.type,ship.portId):t('自由飞行')),r.id);
  }));
  if(rows.some(r=>r.id===previousSave))saves.value=previousSave;
  find('[data-saves]').hidden=!rows.length;
 }
 function open(){refresh();if(!dialog.open)dialog.showModal();}
 function close(){if(dialog.open)dialog.close();}
 trigger.onclick=open;find('[data-close]').onclick=close;
 find('[data-start]').onclick=()=>start(crafts.value);find('[data-resume]').onclick=()=>resume(saves.value);
 onLanguageChange(()=>{trigger.textContent=t('自由飞行');if(dialog.open)refresh();});refresh();
 function showError(text){
  if(!dialog.open)return false;
  find('[data-info]').textContent=text;
  return true;
 }
 return {open,close,trigger,showError};
}
