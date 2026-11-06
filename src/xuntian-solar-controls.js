import {t,onLanguageChange} from './i18n.js';
import {SOLAR_CHANNELS} from './solar-data.js';

const $=id=>document.getElementById(id);
const text=(element,value)=>{if(element.textContent!==value)element.textContent=value;};
const utc=value=>{
 const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC'):null;
};

// The instrument owns only its display mode. Data, downloads and cached image
// records belong to the same store used by the resource page and telescope finder.
export function mountXuntianSolarControls(sim,{onFrame,invalidate}){
 const details=$('xtSolarControls'),buttons=$('xtSolarChannels');
 let enabled=false,boundStore=null,unsubscribe=null,context={},wasSun=false;
 for(const channel of SOLAR_CHANNELS){
  const button=document.createElement('button');button.type='button';button.dataset.xtSolarChannel=channel.id;
  button.onclick=()=>activate(channel.id);buttons.append(button);
 }
 function store(){
  const current=sim.environment.solarObservations;
  if(current!==boundStore){
   unsubscribe?.();boundStore=current;unsubscribe=current?.subscribe(()=>{render();invalidate();});
  }
  return current;
 }
 function snapshot(){return store()?.snapshot()||{channel:'hmi',resolution:2048,record:null,loading:false,error:null};}
 function observation(){
  const state=snapshot(),record=state.record;
  return enabled&&record?.channel===state.channel?record:null;
 }
 function changed(){render();invalidate();}
 function load(update=false){
  const source=store();if(!source){changed();return;}
  const method=update?'update':'ensure';
  Promise.resolve(source[method](snapshot().channel)).catch(()=>{}).finally(changed);
 }
 function activate(channel=snapshot().channel){
  if(!SOLAR_CHANNELS.some(item=>item.id===channel))return false;
  enabled=true;details.open=true;store()?.setChannel(channel);changed();load();return true;
 }
 function ordinary(){if(!enabled)return;enabled=false;changed();}
 function render(nextContext=context){
  context=nextContext;
  const state=snapshot(),record=observation(),sun=!!(context.targetingSun||context.crosshairSun);
  details.hidden=!(enabled||sun);
  if(sun&&!wasSun)details.open=true;wasSun=sun;
  details.dataset.channel=enabled?state.channel:'none';
  for(const button of buttons.children){
   const channel=SOLAR_CHANNELS.find(item=>item.id===button.dataset.xtSolarChannel);
   text(button,t(channel.labelKey));button.setAttribute('aria-pressed',String(enabled&&channel.id===state.channel));
  }
  text($('xtSolarMode'),t(enabled?'SDO 观测影像':'普通成像'));
  $('xtSolarOrdinary').setAttribute('aria-pressed',String(!enabled));
  $('xtSolarResolution').value=String(state.resolution);
  $('xtSolarUpdate').disabled=!!state.loading||!store()||state.canUpdate===false;
  $('xtSolarUpdate').title=state.canUpdate===false?t('网页版请从数据与资源导入太阳观测快照。'):'';
  text($('xtSolarUpdate'),t(state.loading?'正在载入…':'更新影像'));
  $('xtSolarFrame').disabled=!!context.unavailable;
  $('xtObserveSun').disabled=!!context.unavailable;
  $('xtSolarRecord').hidden=!enabled;
  const observed=record&&utc(record.observedAt);
  text($('xtSolarRecord'),record?['NASA/SDO',record.width+' × '+record.height,observed?t('观测 {time}',{time:observed}):t('来源未提供观测时间')].join(' · '):t('尚未载入该波段影像'));
  $('xtSolarStatus').hidden=!enabled;
  const status=state.loading?(record?t('正在检查新影像，当前仍显示已有观测。'):t('正在载入太阳观测影像…')):!record&&state.canUpdate===false?t('网页版请从数据与资源导入太阳观测快照。'):state.error?(record?t('更新未完成，继续使用已有影像。'):t('未能载入影像，可重试或从数据与资源导入快照。')):record?t(state.stale?'当前使用较早的观测影像，可更新或导入新快照。':'影像观测时间与模拟时间分别显示；拖动时间轴不会生成历史太阳活动。'):t('可更新影像，或从数据与资源导入已保存的太阳快照。');
  text($('xtSolarStatus'),status);$('xtSolarStatus').dataset.error=String(!!state.error);
  $('xtSolarStatus').title=state.error||'';
  const flux=state.fluxSummary,fluxTime=flux&&utc(flux.observedAt);
  $('xtSolarFlux').hidden=!fluxTime;
  text($('xtSolarFlux'),fluxTime?t('GOES-{satellite} · X 射线 {level} · {time}',{satellite:flux.satellite,level:flux.currentClass,time:fluxTime}):'');
  $('xtSolarHint').hidden=!enabled;
 }
 $('xtSolarFrame').onclick=onFrame;
 $('xtSolarOrdinary').onclick=ordinary;
 $('xtSolarUpdate').onclick=()=>load(true);
 $('xtSolarResources').onclick=()=>sim.environment.weather?.resourcePanel?.open('solar');
 $('xtSolarResolution').onchange=()=>{store()?.setResolution(Number($('xtSolarResolution').value));changed();if(enabled)load();};
 onLanguageChange(()=>render());render();
 return {activate,ordinary,render,get channel(){return snapshot().channel;},get enabled(){return enabled;},get canCapture(){return !enabled||!!observation();},
  frame(){return {solarChannel:enabled?snapshot().channel:'none',solarObservation:observation(),solarRevision:store()?.revision||0};}};
}
