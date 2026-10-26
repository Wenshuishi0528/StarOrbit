import {validTime,clampTime} from './orbit.js';
import {EVENT_TYPES,OrbitEventCache,selectedEvents,eventBetween} from './orbit-events.js';
import {t,onLanguageChange} from './i18n.js';

const $=id=>document.getElementById(id),KEY='tiangong-timeline-v1';
const defaults={visible:true,expanded:true,hours:3,shadow:true,apsis:true,node:true,autoPause:false};
import {shortClock as clock,shortDate as date} from './time-format.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class EventTimeline{
 constructor(sim){
  this.sim=sim;this.cache=new OrbitEventCache();this.settings={...defaults};this.dragging=false;this.lastUpdate=-Infinity;this.panel=$('eventTimeline');
  try{const saved=JSON.parse(localStorage.getItem(KEY));for(const key of Object.keys(defaults))if(typeof saved?.[key]==='boolean'&&key!=='hours')this.settings[key]=saved[key];if([3,12,24].includes(saved?.hours))this.settings.hours=saved.hours;}catch{}
  for(const [id,key] of [['showEventTimeline','visible'],['eventShadow','shadow'],['eventApsis','apsis'],['eventNode','node'],['eventAutoPause','autoPause']]){
   $(id).checked=this.settings[key];$(id).onchange=()=>{this.settings[key]=$(id).checked;this.save();this.render();};
  }
  $('eventRange').value=this.settings.hours;$('eventRange').onchange=()=>{this.settings.hours=Number($('eventRange').value);this.range=null;this.selected=null;this.save();this.update(performance.now(),true);};
  $('toggleEventTimeline').onclick=()=>{this.settings.expanded=!this.settings.expanded;this.save();this.render();};
  $('previousOrbitEvent').onclick=()=>this.navigate(-1);$('nextOrbitEvent').onclick=()=>this.navigate(1);
  $('watchOrbitEvent').onclick=()=>{if(!this.selected)return;this.jump(this.selected.time-30000);sim.speed=1;sim.paused=false;sim.timeUI();sim.sessionMemory?.save();};
  $('closeOrbitEvent').onclick=()=>{this.selected=null;this.renderSelection();};
  $('orbitEventChoice').onchange=()=>this.choose(this.choices[Number($('orbitEventChoice').value)]);
  this.bindScrub();onLanguageChange(()=>{this.render();this.lastUpdate=-Infinity;});this.render();
 }
 save(){try{localStorage.setItem(KEY,JSON.stringify(this.settings));}catch{}}
 reset(){this.finish();this.cache.reset();this.range=null;this.selected=null;this.render();this.lastUpdate=-Infinity;}
 get events(){return selectedEvents(this.cache.result,this.settings);}
 next(time=this.sim.time){return this.events.find(e=>e.time>time)||null;}
 jump(time){
  const s=this.sim;if(!validTime(time))return;
  if(s.mode==='real'){s.speed=1;s.paused=false;}s.mode='custom';s.time=time;s.inputDirty=false;s.dirty=s.snap=true;s.lastWall=performance.now();s.timeUI();
 }
 choose(event){if(!event)return;this.selected=event;this.jump(event.time);this.renderSelection();this.sim.sessionMemory?.save();this.lastUpdate=-Infinity;}
 navigate(direction){const events=this.events,event=direction>0?this.next():events.findLast(e=>e.time<this.sim.time-1);if(event){this.choices=[event];this.choose(event);}}
 finish(){
  if(!this.dragging)return;this.dragging=false;this.sim.lastWall=performance.now();this.sim.dirty=this.sim.snap=true;
  const rail=$('eventRail');if(rail.hasPointerCapture(this.pointerId))rail.releasePointerCapture(this.pointerId);
  this.sim.sessionMemory?.save();this.lastUpdate=-Infinity;
 }
 bindScrub(){
  const rail=$('eventRail'),pick=e=>{const rect=rail.getBoundingClientRect();this.jump(this.range.start+clamp((e.clientX-rect.left)/rect.width,0,1)*(this.range.end-this.range.start));this.updateCursor();};
  rail.addEventListener('pointerdown',e=>{if(!this.range||e.button!==0||!e.isPrimary||e.target.closest('button'))return;e.preventDefault();rail.focus();this.dragging=true;this.pointerId=e.pointerId;rail.setPointerCapture(e.pointerId);this.selected=null;this.renderSelection();pick(e);});
  rail.addEventListener('pointermove',e=>{if(this.dragging&&e.pointerId===this.pointerId)pick(e);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])rail.addEventListener(type,e=>{if(this.dragging&&e.pointerId===this.pointerId){if(type==='pointerup')pick(e);this.finish();}});
  rail.addEventListener('keydown',e=>{if(e.target!==rail||!this.range)return;const delta=e.key==='ArrowLeft'?-60000:e.key==='ArrowRight'?60000:0;if(delta){e.preventDefault();this.jump(this.sim.time+delta);this.update(performance.now(),true);}});
  this.panel.addEventListener('keydown',e=>{if(e.key==='Escape'){this.selected=null;this.renderSelection();}});
 }
 ensure(){
  const s=this.sim;if(!s.data||s.orbitStatus!=='ready'){if(this.cache.data||this.range)this.reset();return;}
  if(this.dragging||s.minimap.dragging)return;
  const span=this.settings.hours*3600000,step=span/8,anchor=Math.floor(s.time/step)*step;
  const start=clampTime(anchor-step),end=clampTime(start+span);
  if(this.range?.start!==start||this.range?.end!==end){this.range={start,end};this.render();}
  const result=this.cache.result;if(this.cache.data===s.data&&result?.start<=start&&result.end>=end)return;
  const a=clampTime(start-span/4),b=clampTime(end+span/4);
  if(this.cache.data===s.data&&this.cache.pending?.start===a&&this.cache.pending.end===b)return;
  this.cache.request(s.data,a,b).then(result=>{if(result&&this.cache.result===result){this.render();this.lastUpdate=-Infinity;}});this.render();
 }
 limitAdvance(from,to){
  if(!this.settings.autoPause||!this.sim.data||to<=from)return to;
  this.ensure();const r=this.cache.result;
  if(!r||from<r.start||from>=r.end)return from;
  const event=eventBetween(this.events,from,Math.min(to,r.end));
  if(event){if(this.sim.mode==='real')this.sim.speed=1;this.sim.mode='custom';this.sim.paused=true;this.selected=event;this.choices=[event];this.renderSelection();return event.time;}
  return Math.min(to,r.end);
 }
 update(wall,force=false){
  if(!force&&wall-this.lastUpdate<250)return;this.lastUpdate=wall;this.ensure();this.updateCursor();
  const next=this.next(),remaining=next?Math.max(0,Math.ceil((next.time-this.sim.time)/1000)):0;
  const countdown=[Math.floor(remaining/3600),Math.floor(remaining%3600/60),remaining%60].map(n=>String(n).padStart(2,'0')).join(':');
  const message=!this.range?t('请先配置有效轨道'):this.cache.pending?t('正在计算轨道事件…'):next?t('{event} · 还有 {time}',{event:t(EVENT_TYPES[next.type].name),time:countdown}):t('该时段没有后续所选事件');
  $('nextEventSummary').textContent=message;$('eventText').textContent=message;
  $('previousOrbitEvent').disabled=!this.events.some(e=>e.time<this.sim.time-1);$('nextOrbitEvent').disabled=!next;
 }
 updateCursor(){
  if(!this.range)return;const {start,end}=this.range,f=clamp((this.sim.time-start)/(end-start),0,1);
  $('eventCursor').style.left=`${f*100}%`;$('eventRail').setAttribute('aria-valuenow',String(Math.round(this.sim.time)));$('eventRail').setAttribute('aria-valuetext',date(this.sim.time)+' UTC+8');
 }
 renderSelection(){
  const e=this.selected;$('orbitEventDetail').hidden=!e;if(!e)return;
  const choices=this.choices?.includes(e)?this.choices:[e],select=$('orbitEventChoice');select.replaceChildren();
  choices.forEach((event,i)=>{const option=document.createElement('option');option.value=i;option.textContent=t(EVENT_TYPES[event.type].name)+' · '+clock(event.time);option.selected=event===e;select.append(option);});
  $('orbitEventTime').textContent=date(e.time)+' UTC+8'+(Number.isFinite(e.altitude)?' · '+e.altitude.toFixed(1)+' km':'');
 }
 render(){
  const {visible,expanded}=this.settings;this.panel.hidden=!visible;this.panel.classList.toggle('collapsed',!expanded);document.body.classList.toggle('has-event-timeline',visible&&expanded);
  $('toggleEventTimeline').setAttribute('aria-expanded',String(expanded));$('toggleEventTimeline').textContent=t(expanded?'收起时间轴':'展开时间轴');
  $('eventScale').hidden=!expanded;$('eventRail').hidden=!expanded;$('eventRail').setAttribute('aria-disabled',String(!this.range));
  const bands=$('eventBands'),markers=$('eventMarkers');bands.replaceChildren();markers.replaceChildren();
  if(this.range){
   const {start,end}=this.range,duration=end-start,percent=time=>clamp((time-start)/duration*100,0,100),result=this.cache.result;
   $('eventRail').setAttribute('aria-valuemin',String(start));$('eventRail').setAttribute('aria-valuemax',String(end));
   $('eventScale').replaceChildren(...[start,start+duration/2,end].map(time=>{const span=document.createElement('span');span.textContent=date(time).slice(0,11);return span;}));
   if(result&&result.start<=start&&result.end>=end){
    let phase=result.initialPhase,at=start;
    const after=type=>type==='umbra-enter'?'umbra':type==='penumbra-exit'?'sun':type==='penumbra-enter'?'enter':'exit';
    const band=(left,right,kind)=>{if(right<=left)return;const el=document.createElement('i');el.className='event-band '+kind;el.style.left=percent(left)+'%';el.style.width=(percent(right)-percent(left))+'%';bands.append(el);};
    for(const event of result.events.filter(e=>EVENT_TYPES[e.type].group==='shadow')){
     if(event.time<=start){phase=after(event.type);continue;}if(event.time>end)break;band(at,event.time,phase);at=event.time;phase=after(event.type);
    }band(at,end,phase);
    const clusters=[];for(const event of this.events.filter(e=>e.time>=start&&e.time<=end)){const last=clusters.at(-1);if(last&&percent(event.time)-percent(last[0].time)<1.6)last.push(event);else clusters.push([event]);}
    for(const cluster of clusters){const event=cluster[0],type=EVENT_TYPES[event.type],button=document.createElement('button');button.type='button';button.className='event-marker '+type.group;button.style.left=percent(event.time)+'%';button.textContent=type.symbol;button.title=cluster.map(e=>t(EVENT_TYPES[e.type].name)+' · '+clock(e.time)).join('\n');button.setAttribute('aria-label',button.title);button.onclick=()=>{this.choices=cluster;this.choose(event);};markers.append(button);}
   }
  }
  this.renderSelection();this.updateCursor();
 }
}
