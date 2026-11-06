import {getLanguage,onLanguageChange,t} from './i18n.js';
import {mission,MISSIONS} from './missions.js';
import {dot,earthAxes,sunPosition} from './orbit.js';
import {clockText,inputText,parseLocalTime,shortClock} from './time-format.js';
import {compassDirection,passTimeAtFraction} from './pass-display.js';
import {createPassSampler,lookAngles,observerFrame,predictPasses,predictionSource,validateObserver} from './pass-prediction.js';
import {lastObserver,rememberObserver,sameObserver,observerOrbit,orbitSelection,sameSelection,locationDraft} from './observer-settings.js';
import {orbitDescription,updateReport} from './observer-orbit-display.js';
import {orbitSource} from './orbit-repository.js';
import {createBalconySkyView} from './balcony-sky-view.js';
import {PILOT_KEY_AXES} from './pilot-controls.js';
import {mountBalconyViewControls} from './balcony-view-controls.js';
import {BEIJING_BALCONY,balconyEvents,balconyTrack,normalizeHorizon,observationState,siteKey,wrapAzimuth} from './balcony-lab-geometry.js';
import {drawBalconySky,drawOrbitDisk,earthTexture,skyProjection} from './balcony-lab-drawing.js';
import style from './balcony-lab-style.js';

import {importObserverOrbit} from './observer-orbit-import.js';
import {balconyRecord,readBalconyRecord,passFromRecord} from './balcony-record.js';
import {BALCONY_SITES_KEY,storedSites,siteHorizon} from './observation-sites.js';
import {durationClock,observationOpportunity,preferredOpportunity,watchPhase} from './observation-opportunity.js';
import {createObservationCard,opportunityStyle,profileLabel,reasonLabel,sightDirection} from './observation-card.js';
const TARGET_KEY='starorbit-balcony-target-v1';
function initialTarget(fallback){
 try{const saved=localStorage.getItem(TARGET_KEY);if(Object.hasOwn(MISSIONS,saved))return saved;}catch{}
 return Object.hasOwn(MISSIONS,fallback)?fallback:'tiangong';
}
const template=`
 <div class="bal-top"><div><h3 data-t="阳台观测"></h3><p data-id="context"></p></div>
 <div class="bal-select"><label class="bal-target"><span data-t="观测目标"></span><select data-id="dataset"></select></label><select data-id="passes" data-label="选择一次过境" disabled></select><button type="button" data-id="demo" data-t="历史回放"></button></div></div>
 <details class="bal-config" data-id="config"><summary data-t="观测地点与预报参数"></summary><div class="bal-form">
 <label><span data-t="已保存的观测地点"></span><select data-id="sites"></select></label>
 <label><span data-t="地点名称"></span><input data-id="name" type="text" maxlength="60"></label>
 <label><span data-t="纬度（北纬为正）"></span><input data-id="latitude" type="number" min="-90" max="90" step=".00001"></label>
 <label><span data-t="经度（东经为正）"></span><input data-id="longitude" type="number" min="-180" max="180" step=".00001"></label>
 <label><span data-t="海拔（米）"></span><input data-id="height" type="number" min="-500" max="9000" step="1"></label>
 <label class="bal-date"><span data-t="开始时间 · UTC+8"></span><input data-id="start" type="datetime-local" step="1"></label>
 <div class="bal-actions"><button type="button" class="bal-primary" data-id="predict" data-t="计算过境"></button><button type="button" data-id="saveSite" data-t="保存地点"></button><button type="button" data-id="locate" data-t="使用设备位置"></button><button type="button" data-id="beijing" data-t="北京示例"></button><button type="button" data-id="now" data-t="使用现在"></button></div>
 <p data-id="locationNote" role="status" class="bal-note" style="grid-column:1/-1" hidden></p>
 </div></details>
 <details class="bal-config" data-id="sourcePanel"><summary data-id="sourceSummary"></summary><div class="bal-actions bal-source-actions"><button type="button" data-id="update" data-t="更新轨道数据"></button><button type="button" data-id="latest" data-t="使用本机最新星历"></button><button type="button" data-id="importTarget" data-t="为此目标导入轨道"></button><input data-id="orbitFile" type="file" accept=".json,.txt,.oem,.csv" hidden><button type="button" data-id="estimate" data-t="用已有星历估算"></button></div><p class="bal-note" style="padding:0 12px;white-space:pre-line" data-id="coverageText"></p></details>
 <p class="bal-status" data-id="updateStatus" role="status" hidden></p>
 <p class="bal-status" data-id="status" role="status"></p>
 <div data-id="scene" hidden>
 <section class="bal-watch"><div class="bal-watch-head"><b data-t="观测模式"></b><div role="group" data-label="观测模式"><button type="button" data-id="previewMode" data-t="预演"></button><button type="button" data-id="liveMode" data-t="现在守候"></button></div></div>
 <div data-id="watchReadout" class="bal-watch-readout" hidden><strong data-id="watchTitle"></strong><b data-id="watchDirection"></b><span data-id="watchReason"></span><svg data-id="watchCompass" viewBox="0 0 80 80" role="img" data-label="方向与仰角"><circle cx="40" cy="40" r="24" fill="none" stroke="#527a81"/><path d="M40 16v5m0 38v5M16 40h5m38 0h5" fill="none" stroke="#9db4b9"/><text data-t="北" x="40" y="11"></text><text data-t="东" x="73" y="43"></text><text data-t="南" x="40" y="78"></text><text data-t="西" x="7" y="43"></text><g data-id="watchArrow"><path d="M40 18l-5 12 5-2 5 2z" fill="#a5f4d8"/><path d="M40 28v12" stroke="#a5f4d8" stroke-width="2"/><circle cx="40" cy="40" r="2.5" fill="#a5f4d8"/></g></svg></div></section>
 <details class="bal-window-details" data-id="cardFold" open><summary data-t="这次过境的观测窗口"></summary><div data-id="cardHost"></div></details>
 <div class="bal-card bal-timeline"><div class="bal-summary-row"><strong data-id="clockLabel"></strong><time data-id="clock"></time></div>
 <div class="bal-playbar" data-id="playbar"><small data-id="liveScrubNote" hidden></small><button type="button" data-id="play"></button><input type="range" data-id="scrub" min="0" max="1000" step="1" data-label="拖动过境时间"><select data-id="speed" data-label="回放速度"><option>1×</option><option selected>10×</option><option>30×</option></select></div>
 <div class="bal-times" data-id="times"><span data-id="begin"></span><span data-id="end"></span></div></div>
 <div class="bal-grid"><div class="bal-card"><div class="bal-heading"><b data-t="地面视角"></b><button type="button" data-id="follow" data-t="跟随目标" aria-pressed="true"></button></div>
 <div data-id="viewControls"></div>
 <div class="bal-sky-wrap"><canvas class="bal-sky" data-id="sky" tabindex="0" role="img" data-label="地面星空、过境轨迹与楼顶轮廓"></canvas></div>
 <div class="bal-legend" data-id="legend"><span data-t="候选可见轨迹"></span><span data-t="其余轨迹"></span></div>
 <div class="bal-readout" data-id="readout"><div><small data-t="方向与仰角"></small><b data-id="direction"></b></div><div><small data-t="地面观测"></small><b data-id="visibility"></b></div><div><small data-t="航天器受照"></small><b data-id="light"></b></div></div>
 <p class="bal-guide" data-id="guide"></p></div>
 <div class="bal-card bal-reverse" data-id="reverse"><div class="bal-heading"><b data-t="航天器俯视地面"></b><small data-t="同刻 · 北向示意"></small></div>
 <canvas data-id="disk" class="bal-orbit-canvas" role="img" data-label="航天器视野中的观测地点和星下点"></canvas>
 <div class="bal-orbit-info"><div><small><i class="bal-mark"></i><span data-t="观测地点"></span></small><b data-id="siteLabel"></b></div>
 <div><small><i class="bal-mark nadir"></i><span data-t="星下点"></span></small><b data-id="subpoint"></b></div><div><small data-t="到航天器的距离"></small><b data-id="range"></b></div></div></div></div>
 <div class="bal-actions bal-track-action"><button type="button" data-id="capture" data-t="从天宫追拍此地"></button><span data-id="captureNote"></span></div><div class="bal-events" data-id="events"></div></div>
 <details class="bal-profile"><summary data-t="编辑楼顶与树梢轮廓"></summary><div class="bal-profile-inner"><p class="bal-note" data-id="profileNote"></p>
 <div class="bal-edit"><label class="bal-point"><span data-t="轮廓顶点"></span><select data-id="points"></select></label>
 <label><span data-t="方位角（度）"></span><input type="number" data-id="bearing" min="0" max="360" step=".1" value="0"></label>
 <label><span data-t="障碍仰角（度）"></span><input type="number" data-id="alt" min="0" max="90" step=".1" value="10"></label>
 <button type="button" data-id="savePoint" data-t="添加或更新"></button><button type="button" data-id="removePoint" data-t="删除顶点"></button><button type="button" data-id="pick" data-t="点选天空绘制" aria-pressed="false"></button>
 <button type="button" data-id="clear" data-t="平坦地平线"></button></div></div></details>`;

export function mountBalconyLab(container,sim,assets){
 const root=document.createElement('section');root.className='balcony-lab';root.dataset.testid='balcony-lab';
 const sheet=document.createElement('style');sheet.textContent=style+opportunityStyle;
 root.innerHTML=template;container.append(sheet,root);
 const el=Object.fromEntries([...root.querySelectorAll('[data-id]')].map(node=>[node.dataset.id,node]));
 const sites=storedSites(),diskCache={};let site=null,profile=[],profileKind='flat',example=false;
 const card=createObservationCard(el.cardHost,{choose:w=>toPreview(w.start)});
 let mode='preview',liveTimer=null,watchFrom=-Infinity,models=[],minimumElevation=5,archived=false,archivedName='';
 let replay=false,data=null,id='tiangong',source=null,selection=null,passes=[],selected=-1,current=null,frame=null,sampler=null,events=[],segments=[];
 let time=Date.now(),centre=0,following=true,picking=false,active=false,initialized=false,disposed=false,job=null,revision=0;
 let playing=false,animation=0,lastWall=0,lastDraw=0,drag=null,report='',reportError=false;
 let observationStart=time,viewMode='flat',poll=null,dirtyForm=false,locationRequest=0,heightManual=false,nameManual=false,locationNote=null;
 const updating=new Set();let importTicket=null,lastSite=lastObserver();
 let controls=null;
 const view=createBalconySkyView(el.sky,{onManual:()=>{controls?.stopMotion();setFollow(false);},onChange:()=>controls?.syncTarget(),onPick:(az,alt)=>pickPoint(az,alt)});
 controls=mountBalconyViewControls({host:el.viewControls,view,onMode:mode=>{viewMode=mode;if(mode!=='flat')setFollow(false);},onManual:()=>setFollow(false),redraw:draw});
 const image=sim.minimap?.image||new Image();let texture=null;
 const refreshTexture=()=>{texture=earthTexture(image);diskCache.raster=null;draw();};
 image.addEventListener('load',refreshTexture);
 if(!image.src&&sim.environment?.assets?.minimap)image.src=sim.environment.assets.minimap;
 if(image.complete&&image.naturalWidth)texture=earthTexture(image);
 const siteName=s=>s.name==='北京'?t('北京'):s.name;
 const craftName=()=>t(MISSIONS[id]?.name||(archived&&archivedName)||id||'航天器');
 const option=(value,title)=>new Option(title,value);
 function status(message='',error=false){
  report=message;reportError=error;el.status.textContent=message?t(message):'';el.status.dataset.error=String(error);el.status.hidden=!message;
 }
 function updateCoverage(){
  el.coverageText.textContent=orbitDescription(data,{archived});
  el.sourceSummary.textContent=t('共享轨道数据');
  if(data){try{
   const s=predictionSource(data,{archived}),start=clockText(s.start).slice(0,10),end=clockText(s.end).slice(0,10);
   el.sourceSummary.textContent+=' · '+t('数据历元')+' '+clockText(s.epoch).slice(0,10)+' · '+t(s.kind==='sgp4'?'SGP4 有效区间':'原始星历区间')+' '+start+' — '+end+' UTC+8';
  }catch{}}
  el.update.disabled=updating.has(id)||!Object.hasOwn(MISSIONS,id)||!orbitSource(id);
  el.estimate.hidden=id!=='tiangong';el.estimate.disabled=id!=='tiangong'||!data;
  el.latest.disabled=el.importTarget.disabled=!Object.hasOwn(MISSIONS,id);
 }
 function setSiteForm(s){
  el.name.value=s.name;for(const field of ['latitude','longitude','height'])el[field].value=s[field]??'';
 }
 function renderLocationNote(){
  el.locationNote.hidden=!locationNote;if(!locationNote)return;
  const d=locationNote,keys={device:'设备报告高度 {m} 米。',manual:'设备未提供海拔，沿用手动输入的 {m} 米，请核对。',saved:'设备未提供海拔，沿用此处已保存的 {m} 米，请核对。',missing:'设备未提供海拔。请输入观测点的实际海拔后保存。'};
  const parts=[d.horizontalAccuracy===null?t('设备未报告水平精度。'):t('水平定位精度约 ±{m} 米。',{m:d.horizontalAccuracy}),t(keys[d.heightSource],{m:d.height})];
  if(d.heightSource==='device')parts.push(d.verticalAccuracy===null?t('设备未报告高度精度。'):t('高度精度约 ±{m} 米。',{m:d.verticalAccuracy}));
  el.locationNote.textContent=parts.join(' ');
 }
 function getSiteForm(){
  const numeric=key=>el[key].value.trim()===''?NaN:Number(el[key].value);
  return validateObserver({name:el.name.value,latitude:numeric('latitude'),longitude:numeric('longitude'),height:numeric('height')});
 }
 function saveSite(){
  if(!site)return;
  for(const [key,item] of storedSites())if(key!==siteKey(site))sites.set(key,item);
  sites.set(siteKey(site),{site:{...site},points:normalizeHorizon(profile)});
  try{localStorage.setItem(BALCONY_SITES_KEY,JSON.stringify([...sites.values()]));if(!rememberObserver(site))throw Error();lastSite=site;}catch{status('此浏览器无法保存地点，轮廓在本次打开期间仍可使用。');}
  siteOptions();
 }
 function siteOptions(){
  el.sites.replaceChildren(option('',t('选择已存地点')),...[...sites.entries()].map(([key,item])=>option(key,siteName(item.site))));
  if(site&&!example&&sites.has(siteKey(site)))el.sites.value=siteKey(site);
 }
 function loadSite(s,useExample,override=null){
  site=validateObserver(s);
  const skyline=override??siteHorizon(site,useExample,sites);profile=normalizeHorizon(skyline.points);profileKind=skyline.kind;example=profileKind==='example';
  if(locationNote&&(locationNote.latitude!==site.latitude||locationNote.longitude!==site.longitude)){locationNote=null;renderLocationNote();}
  frame=observerFrame(site);
  setSiteForm(site);siteOptions();editOptions();
 }
 function editOptions(){
  const previous=el.points.value;
  el.points.replaceChildren(option('',t('新顶点')),...profile.map(([a,h])=>option(String(a),a+'° · '+h+'°')));
  if([...el.points.options].some(entry=>entry.value===previous))el.points.value=previous;
  el.removePoint.disabled=el.points.value==='';el.profileNote.textContent=t(example?'北京演示使用示例楼顶。可输入方位与仰角，或点选图中位置。':'按实际方位与仰角记录障碍；相邻顶点之间插值，按观测地点保存。');
 }
 function setFollow(value){following=value;el.follow.setAttribute('aria-pressed',String(value));}
 function setPicking(value){picking=value;view.setPicking(value);el.pick.setAttribute('aria-pressed',String(value));el.sky.dataset.edit=String(value);}
 function stop(){
  playing=false;cancelAnimationFrame(animation);animation=0;el.play.textContent=t('播放过境');
 }
 function suspendLive(){clearInterval(liveTimer);liveTimer=null;}
 function clearLive(){suspendLive();mode='preview';watchFrom=-Infinity;}
 function resumeLive(){
  suspendLive();if(mode!=='live'||!active||document.hidden)return;
  const tickLive=()=>{time=Date.now();draw();};tickLive();liveTimer=setInterval(tickLive,500);
 }
 function enterLive(start){
  const now=Date.now(),model=models[selected];
  if(!model||archived||replay||!model.windows.some(w=>w.end>now&&w.end>(start??-Infinity))){status('现在守候只用于尚未结束的候选窗口。');return;}
  stop();mode='live';watchFrom=start??-Infinity;el.config.open=el.sourcePanel.open=el.cardFold.open=false;container.scrollTop=0;resumeLive();
 }
 function toPreview(at){
  clearLive();stop();el.cardFold.open=true;
  if(current)time=Number.isFinite(at)?at:Math.max(current.start,Math.min(current.end,time));
  draw();
 }
 function syncObservationMode(point){
  const live=mode==='live',model=models[selected];el.cardFold.hidden=!current;
  el.previewMode.setAttribute('aria-pressed',String(!live));el.liveMode.setAttribute('aria-pressed',String(live));
  el.liveMode.disabled=!live&&(archived||replay||!model?.windows.some(w=>w.end>Date.now()));
  el.liveMode.title=el.liveMode.disabled?t('现在守候只用于尚未结束的候选窗口。'):'';
  el.watchReadout.hidden=!live;el.play.hidden=el.speed.hidden=live;el.liveScrubNote.hidden=!live;
  if(live)el.liveScrubNote.textContent=t('拖动过境时间')+' → '+t('预演');
  if(live){
   const state=watchPhase(model,time,watchFrom),w=state.window;
   const headings={waiting:'距候选窗口开启 {duration}',observing:'正在候选窗口 · 剩余 {duration}',ended:'本次候选窗口已结束',empty:'此次没有候选观测窗口'};
   el.watchTitle.textContent=t(headings[state.phase],{duration:durationClock(state.remaining)});
   const aim=w?(state.phase==='waiting'?w.first:state.phase==='ended'?w.last:point??w.first):null;
   el.watchDirection.textContent=aim?sightDirection(aim):'';el.watchCompass.toggleAttribute('hidden',!aim);
   if(aim)el.watchArrow.setAttribute('transform','rotate('+aim.azimuth+' 40 40)');
   el.watchReason.textContent=w?reasonLabel(state.phase==='waiting'?w.startReason:w.endReason,state.phase==='waiting')+' · '+shortClock(state.phase==='waiting'?w.start:w.end)+' UTC+8':'';
  }
  el.capture.hidden=el.captureNote.hidden=id!=='tiangong';el.capture.disabled=!point||point.elevation<=0||!source||!sim.flightLab?.openGroundCapture;
  el.captureNote.textContent=el.capture.disabled&&id==='tiangong'?t('选择天宫经过此地的时刻后可追拍。'):'';
 }
 el.previewMode.onclick=()=>toPreview();el.liveMode.onclick=()=>{if(mode!=='live')enterLive();};
 el.capture.onclick=()=>{
  if(!site||!source||!current||id!=='tiangong'||el.capture.disabled)return;
  sim.flightLab.openGroundCapture({observer:{...site},time,missionId:id,data,origin:'balcony',estimated:source.recordEnd!==undefined&&time>source.recordEnd});
 };
 function cancelSearch(){revision++;job?.abort();job=null;el.predict.disabled=false;}
 function clearPass(){
  stop();clearLive();card.set(null);models=[];current=null;sampler=null;events=[];segments=[];passes=[];selected=-1;el.passes.replaceChildren();el.passes.disabled=true;el.events.replaceChildren();
 }
 function passOptions(){
  el.passes.replaceChildren(...passes.map((p,i)=>option(String(i),clockText(p.maximum.time)+' · '+Math.round(p.maximum.elevation)+'°'+(p.estimated?' · '+t('估算'):'')+(models[i]?.windows.length?' · '+t('候选可见'):''))));
  el.passes.disabled=!passes.length;if(selected>=0)el.passes.value=String(selected);
 }
 function renderEvents(){
  el.events.replaceChildren(...events.map(event=>{
   const button=document.createElement('button');button.type='button';button.textContent=t(event.label)+' · '+shortClock(event.time);
   button.onclick=()=>{toPreview(event.time);};return button;
  }));
 }
 function refreshTrack(){
  events=balconyEvents(current,profile,sampler);
  const model=models[selected];
  const edges=model.windows.flatMap(w=>[{time:w.start},{time:w.end}]);
  segments=balconyTrack(current,profile,sampler,[...events,...edges]);renderEvents();
  card.set({model,pass:current,observer:site,profileKind,minimumElevation,replay:replay||current.end<Date.now(),reference:observationStart});
 }
 function choosePass(index,at){
  stop();clearLive();selected=index;current=passes[index];if(!current)return;
  sampler=createPassSampler(source,site);
  time=Number.isFinite(at)?Math.max(current.start,Math.min(current.end,at)):models[index].windows[0]?.peak.time??current.maximum.time;
  refreshTrack();el.passes.value=String(index);el.scene.hidden=false;
  el.begin.textContent=shortClock(current.start);el.end.textContent=shortClock(current.end);
  draw();
 }
 function context(){
  const label=site?siteName(site):t('请选择观测地点');
  const state=archived?'记录回放':current?(current.estimated?'本地短期估算':replay||current.end<Date.now()?'原始星历回放':'有效星历'):'地面星空';
  el.context.textContent=[label,craftName(),site?profileLabel(profileKind):null,t(state)].filter(Boolean).join(' · ');
 }
 function draw(){
  if(!active||disposed)return;
  context();el.scene.hidden=!site;el.pick.disabled=el.clear.disabled=el.savePoint.disabled=!site;
  if(!site)return;
  const hasPass=!!(current&&sampler),hasTarget=hasPass&&time>=current.start&&time<=current.end,q=hasTarget?sampler(time):null,axes=earthAxes(time);
  syncObservationMode(q);
  const state=hasTarget?observationState(q,profile):null;
  if(following&&q)centre=q.azimuth;
  const height=q?q.sunElevation:lookAngles(axes.map(axis=>dot(axis,sunPositionCached(time))),frame).elevation;
  const skyData={point:q,time,sunElevation:height,segments,profile,frame,centre,craftName:craftName()};
  const guide=view.setFrame(skyData,{follow:!!q&&following&&viewMode!=='flat'});
  const near=viewMode==='flat'?drawBalconySky(el.sky,skyData):guide;
  controls?.syncTarget();
  el.clock.textContent=clockText(time)+' UTC+8';el.clock.dateTime=new Date(time).toISOString();
  el.clockLabel.textContent=t(mode==='live'?'现在守候':archived?'记录回放':q?'过境预演':'所选时刻的星空');
  for(const key of ['readout','reverse','follow'])el[key].hidden=!hasTarget;
  for(const key of ['playbar','times','legend'])el[key].hidden=!hasPass;
  if(hasPass)el.scrub.value=Math.round(1000*Math.max(0,Math.min(1,(time-current.start)/(current.end-current.start))));
  el.sky.closest('.bal-grid').style.gridTemplateColumns=hasTarget?'':'1fr';
  if(!q){el.guide.textContent=t('当前显示所选地点与时刻的星空。');return;}
  const fixed=source.position(time,axes).fixed;
  drawOrbitDisk(el.disk,fixed,frame,texture,diskCache,time);
  el.scrub.setAttribute('aria-valuetext',shortClock(time)+' · '+t(compassDirection(q.azimuth))+' '+q.elevation.toFixed(1)+'°');
  el.direction.textContent=t(compassDirection(q.azimuth))+' '+q.azimuth.toFixed(0)+'° / '+q.elevation.toFixed(1)+'°';
  el.visibility.textContent=t(state.status);el.visibility.dataset.good=String(state.candidate);
  el.light.textContent=t(state.shadow)+' · '+Math.round(q.illumination*100)+'%';
  el.siteLabel.textContent=siteName(site);
  const lat=Math.atan2(fixed[2],Math.hypot(fixed[0],fixed[1]))*180/Math.PI,lon=Math.atan2(fixed[1],fixed[0])*180/Math.PI;
  el.subpoint.textContent=lat.toFixed(2)+'°, '+lon.toFixed(2)+'°';el.range.textContent=Math.round(q.range).toLocaleString(getLanguage())+' km';
  const nearText=near&&near.angle<=40?t('附近亮星 {star}，相距 {angle}°',{star:near.name,angle:near.angle.toFixed(1)}):'';
  el.guide.textContent=[t('此方向的障碍仰角 {angle}°',{angle:state.horizon.toFixed(1)}),nearText,t('候选可见性仅按几何与光照判断。')].filter(Boolean).join(' · ');
 }
 let sunTime=null,sunVector=null;
 function sunPositionCached(at){
  if(at!==sunTime){sunTime=at;sunVector=sunPosition(at);}return sunVector;
 }
 function syncMissionOptions(){
  const value=el.dataset.value;
  const ids=Object.keys(MISSIONS);if(archived&&id&&!ids.includes(id))ids.push(id);
  el.dataset.replaceChildren(...ids.map(key=>{try{return option(key,t(mission(key).name));}catch{return option(key,key===id&&archived?craftName():key);}}));
  el.dataset.value=ids.includes(value)?value:id;
 }
 function readFormDate(){
  const start=parseLocalTime(el.start.value);
  if(!Number.isFinite(start))throw Error('请设置开始时间');return start;
 }
 async function search({target=el.dataset.value,s,start,save=false,useExample=false,history=false,skyline=null}){
  cancelSearch();clearPass();archived=false;minimumElevation=5;
  const token=revision,controller=new AbortController();job=controller;el.predict.disabled=true;
  if(id!==target)el.updateStatus.hidden=true;
  dirtyForm=false;id=target;replay=history;el.sourcePanel.open=false;el.cardFold.open=true;source=null;data=null;selection=orbitSelection(sim,id);
  observationStart=start;time=start;
  if(s)loadSite(s,useExample,skyline);
  if(save&&s)saveSite();
  el.dataset.value=id;el.start.value=inputText(start);updateCoverage();draw();status(s?'正在计算过境…':'请选择观测地点');
  try{
   const chosen=await observerOrbit(sim,id);
   if(disposed||revision!==token||!sameSelection(selection,orbitSelection(sim,id)))return;
   if(chosen?.missionId&&chosen.missionId!==id)throw Error('轨道属于其他任务');
   data=chosen;updateCoverage();
   if(!data){el.sourcePanel.open=true;status('此目标尚无可用轨道。可在任务的轨道库中选择或导入星历。');return;}
   if(!s)return;
   source=predictionSource(data,{allowEstimate:!history});
   if(history&&(start<source.start||start>=source.end))start=source.kind==='sgp4'?source.epoch:source.start;
   time=observationStart=start;el.start.value=inputText(start);draw();
   const result=await predictPasses(data,site,start,48,{minimumElevation:5,signal:controller.signal,allowEstimate:!history});
   if(disposed||revision!==token||!sameSelection(selection,orbitSelection(sim,id)))return;
   passes=result.passes;const sample=createPassSampler(source,site);
   models=passes.map(p=>observationOpportunity(p,sample,profile));passOptions();
   const hasCandidate=models.some(model=>model.windows.length);
   status(!passes.length?'所选时段没有达到 5° 仰角的过境。':!hasCandidate?'有几何过境，此地点和天际线下没有候选可见时段。':result.clipped?'所选时段已按计算上限截短。':'');
   if(passes.length)choosePass(preferredOpportunity(models,Date.now()<result.end?Math.max(start,Date.now()):start));
  }catch(error){
   if(error.name!=='AbortError'&&revision===token){
    const key=error.message;el.sourcePanel.open=true;
    status(key==='预报时间超出有效轨道区间'||key==='轨道根数已超出预报时效'?'所选时刻超出此目标的轨道覆盖。可更新轨道或回放有效时段。':key,true);draw();
   }
  }finally{if(revision===token){job=null;el.predict.disabled=false;}}
 }
 function formSearch(history=false,saveExample=false){
  try{
   const s=getSiteForm(),useExample=example&&siteKey(s)===siteKey(BEIJING_BALCONY)&&!saveExample;
   return search({s,start:readFormDate(),save:!useExample,history,useExample});
  }catch(error){cancelSearch();clearPass();status(error.message,true);el.config.open=true;draw();}
 }
 function demo(){
  return search({target:id,s:BEIJING_BALCONY,start:Date.now(),useExample:true});
 }
 function openPass(payload){
  if(!payload?.pass||!payload.observer)return;
  initialized=true;cancelSearch();clearPass();archived=false;el.config.open=el.sourcePanel.open=false;el.cardFold.open=true;container.scrollTop=0;
  try{
   const supplied=payload.data??sim.data,missionId=payload.missionId??sim.missionId;
   data=supplied;id=missionId;source=predictionSource(data,{allowEstimate:true});selection=orbitSelection(sim,id);dirtyForm=false;
   const p=payload.pass;if(p.start<source.start||p.end>source.end||!(p.start<p.end))throw Error('预报时间超出有效轨道区间');
   replay=!!payload.replay;minimumElevation=payload.minimumElevation??5;
   syncMissionOptions();el.dataset.value=id;loadSite(payload.observer,false,payload.profile?{kind:payload.profileKind,points:payload.profile}:null);
   if(!example){rememberObserver(site);lastSite=site;}heightManual=nameManual=false;
   observationStart=p.start;el.start.value=inputText(p.start);updateCoverage();status('');context();
   passes=[p];models=[observationOpportunity(p,createPassSampler(source,site),profile)];passOptions();choosePass(0,payload.time);if(payload.watch)enterLive(payload.time);
  }catch(error){status(error.message,true);}
 }
 function getObservationRecord(){
  if(job)return null;
  return balconyRecord({site,profile,profileKind,missionId:id,targetName:MISSIONS[id]?.name||(archived&&archivedName)||id,time,minimumElevation,pass:current,data,source});
 }
 async function restoreObservationRecord(record,{orbit}={}){
  const restored=readBalconyRecord(record),target=record.missionId;
  if(orbit?.missionId&&orbit.missionId!==target)throw Error('轨道属于其他任务');
  const original=orbit?predictionSource(orbit,{allowEstimate:true,archived:true}):null;
  if(record.orbitEpoch!=null&&original?.epoch!==record.orbitEpoch)throw Error('观测记录内容无效');
  const reader=original?createPassSampler(original,restored.observer):null,p=passFromRecord(record,original,reader);
  initialized=true;cancelSearch();clearPass();archived=true;archivedName=typeof record.targetName==='string'?record.targetName:'';replay=true;dirtyForm=false;id=target;data=orbit??null;source=original;selection=null;
  minimumElevation=restored.minimumElevation;syncMissionOptions();el.dataset.value=id;
  loadSite(restored.observer,false,{points:restored.profile,kind:restored.profileKind});
  el.config.open=el.sourcePanel.open=false;el.cardFold.open=true;observationStart=p?.start??record.time;el.start.value=inputText(observationStart);
  if(p){passes=[p];models=[observationOpportunity(p,reader,profile)];passOptions();choosePass(0,record.time);}
  time=record.time;status('');el.updateStatus.hidden=true;updateCoverage();draw();return true;
 }
 function changeProfile(points,select){
  if(!site)return;
  example=false;profile=normalizeHorizon(points);profileKind=profile.length?'saved':'flat';if(!archived)saveSite();editOptions();
  if(sampler)models=passes.map(pass=>observationOpportunity(pass,sampler,profile));passOptions();
  if(select!==undefined){el.points.value=String(select);el.removePoint.disabled=el.points.value==='';}
  if(current)refreshTrack();draw();
 }
 function savePoint(){
  if(!site)return;
  const a=Number(el.bearing.value),h=Number(el.alt.value);
  if(el.bearing.value===''||el.alt.value===''||!Number.isFinite(a)||a<0||a>360||!Number.isFinite(h)||h<0||h>90){status('方位须为 0–360°，障碍仰角须为 0–90°。',true);return;}
  status('');changeProfile([...profile,[a,h]],wrapAzimuth(Math.round(a*10)/10));
 }
 function pickPoint(az,alt){
  if(!picking||!site)return;
  el.bearing.value=wrapAzimuth(az).toFixed(1);el.alt.value=Math.max(0,Math.min(90,alt)).toFixed(1);savePoint();
 }
 el.savePoint.onclick=savePoint;el.removePoint.onclick=()=>{if(el.points.value!=='')changeProfile(profile.filter(([a])=>a!==Number(el.points.value)));};
 el.clear.onclick=()=>changeProfile([]);el.pick.onclick=()=>{setPicking(!picking);if(picking)el.sky.scrollIntoView({block:'nearest'});};
 el.points.onchange=()=>{el.removePoint.disabled=el.points.value==='';if(!el.removePoint.disabled){const point=profile.find(([a])=>a===Number(el.points.value));el.bearing.value=point[0];el.alt.value=point[1];}};
 el.passes.onchange=()=>choosePass(Number(el.passes.value));
 el.demo.onclick=()=>formSearch(true);el.beijing.onclick=()=>{heightManual=nameManual=false;return demo();};el.predict.onclick=()=>formSearch();el.estimate.onclick=()=>formSearch();el.saveSite.onclick=()=>formSearch(false,true);
 el.now.onclick=()=>{el.start.value=inputText(Date.now());formSearch();};
 el.sites.onchange=()=>{const item=sites.get(el.sites.value);if(item){heightManual=nameManual=false;setSiteForm(item.site);formSearch();}};
 async function selectTarget(target){
  if(!Object.hasOwn(MISSIONS,target)){status('未知任务',true);return false;}
  try{localStorage.setItem(TARGET_KEY,target);}catch{}
  if(/^#lab\/balcony(?:\/[^/]*)?$/.test(location.hash))history.replaceState(null,'',location.pathname+location.search+'#lab/balcony/'+target);
  if(target===id&&selection&&!archived)return true;
  let start;try{start=readFormDate();}catch{start=Date.now();}
  el.dataset.value=target;
  await search({target,s:site,start,useExample:example,skyline:site?{kind:profileKind,points:profile}:null});return true;
 }
 el.dataset.onchange=()=>selectTarget(el.dataset.value);
 const dirty=()=>{
  cancelSearch();clearPass();dirtyForm=true;site=null;frame=null;setPicking(false);draw();status('应用地点与时刻后重新计算。');
 };
 for(const key of ['name','latitude','longitude','height','start'])el[key].addEventListener('input',()=>{
  if(key!=='start')example=false;
  if(key==='height')heightManual=true;if(key==='name')nameManual=true;
  if(key==='latitude'||key==='longitude'){locationNote=null;renderLocationNote();}
  dirty();
 });
 el.locate.onclick=()=>{
  if(!navigator.geolocation){status('无法读取设备位置，可手动输入经纬度。',true);return;}
  cancelSearch();const token=revision,attempt=++locationRequest;
  navigator.geolocation.getCurrentPosition(position=>{
   if(disposed||!active||revision!==token||attempt!==locationRequest)return;
   const draft=locationDraft(position.coords,{typedName:nameManual?el.name.value.trim():'',typedHeight:heightManual&&el.height.value!==''?Number(el.height.value):null,
    savedSites:[...sites.values()].map(item=>item.site).concat(lastSite?[lastSite]:[])});
   draft.name||=t('当前位置');locationNote=draft;renderLocationNote();el.config.open=true;setSiteForm(draft);
   if(draft.height===null){dirty();el.height.focus();return;}
   try{search({s:validateObserver(draft),start:readFormDate()});}catch(error){status(error.message,true);}
  },()=>{if(!disposed&&active&&revision===token&&attempt===locationRequest)status('无法读取设备位置，可手动输入经纬度。',true);},{timeout:12000});
 };
 el.importTarget.onclick=()=>{
  importTicket={id,revision};el.orbitFile.value='';el.orbitFile.click();
 };
 el.orbitFile.onchange=async()=>{
  const file=el.orbitFile.files?.[0],ticket=importTicket;
  if(!file||!ticket)return;
  const current=()=>!disposed&&active&&id===ticket.id&&revision===ticket.revision;
  try{
   const {applied}=await importObserverOrbit(sim,ticket.id,file,current);
   if(current()){
    el.updateStatus.hidden=false;el.updateStatus.textContent=t(applied?'轨道数据已载入':'已将文件保存到原目标的轨道库。');
    if(applied)await search({target:id,s:site,start:observationStart,useExample:example,history:replay});
   }
  }catch(error){if(current())status(error.message,true);}
 };
 el.latest.onclick=async()=>{
  const target=id,before=revision;el.latest.disabled=true;
  try{
   const message=await sim.orbits.useLatestLocal(target);
   if(disposed||target!==id)return;
   el.updateStatus.hidden=false;el.updateStatus.textContent=t(message);
   if(revision===before&&!dirtyForm&&active)await search({target,s:site,start:observationStart,history:replay,useExample:example});
  }catch(error){if(!disposed&&target===id){el.updateStatus.hidden=false;el.updateStatus.textContent=t(error.message);}}
  finally{if(!disposed)el.latest.disabled=false;}
 };
 el.update.onclick=async()=>{
  if(updating.has(id))return;const target=id,request=revision,weather=sim.environment.weather;
  updating.add(id);el.update.disabled=true;el.updateStatus.hidden=false;el.updateStatus.textContent=t('正在更新轨道…');
  try{
   const result=await weather.updateResource('orbit',{provider:target});
   if(disposed||target!==id)return;
   el.updateStatus.textContent=updateReport(weather,target,result);
   if(request===revision&&!dirtyForm&&active)await search({target,s:site,start:observationStart,history:replay,useExample:example});
  }catch(error){if(!disposed&&target===id)el.updateStatus.textContent=t('轨道更新失败，已保留原数据。')+' '+t(error.message||'网络请求失败');}
  finally{updating.delete(target);if(!disposed)updateCoverage();}
 };
 el.follow.onclick=()=>{setFollow(!following);draw();};
 el.scrub.oninput=()=>{if(current)toPreview(passTimeAtFraction(current,Number(el.scrub.value)/1000));};
 function tick(now){
  if(!playing||!active||!current)return;
  time=Math.min(current.end,time+Math.min(250,now-lastWall)*parseInt(el.speed.value,10));lastWall=now;
  if(now-lastDraw>55||time===current.end){draw();lastDraw=now;}
  if(time===current.end)stop();else animation=requestAnimationFrame(tick);
 }
 el.play.onclick=()=>{
  if(!current||!active)return;if(mode==='live')toPreview();if(playing){stop();return;}
  if(time>=current.end-1||time<current.start)time=current.start;playing=true;lastWall=performance.now();el.play.textContent=t('暂停回放');animation=requestAnimationFrame(tick);
 };
 el.sky.onpointerdown=e=>{
  if(viewMode!=='flat'||!site||!e.isPrimary||e.button!==0)return;
  if(picking){
   const r=el.sky.getBoundingClientRect(),view=skyProjection(r.width,r.height,centre);
   pickPoint(view.bearing(e.clientX-r.left),view.elevation(e.clientY-r.top));
   return;
  }
  drag={x:e.clientX,centre,pointer:e.pointerId};el.sky.setPointerCapture(e.pointerId);
 };
 el.sky.onpointermove=e=>{
  if(viewMode!=='flat'||!drag||drag.pointer!==e.pointerId)return;const dx=e.clientX-drag.x;
  if(Math.abs(dx)<3&&following)return;
  const r=el.sky.getBoundingClientRect();setFollow(false);centre=wrapAzimuth(drag.centre-dx/r.width*skyProjection(r.width,r.height,0).span);draw();
 };
 const endDrag=()=>{drag=null;};el.sky.onpointerup=endDrag;el.sky.onpointercancel=endDrag;el.sky.onlostpointercapture=endDrag;
 el.sky.onkeydown=e=>{
  if(viewMode!=='flat'||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
  const axis=PILOT_KEY_AXES[e.code],turn=axis?.[0]==='yaw'?-axis[1]:e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0;
  if(!turn)return;e.preventDefault();e.stopPropagation();setFollow(false);centre=wrapAzimuth(centre+turn*15);draw();
 };
 const resize=new ResizeObserver(()=>draw());resize.observe(el.sky);resize.observe(el.disk);
 const visibility=()=>{if(document.hidden){stop();controls?.stopMotion();suspendLive();}else resumeLive();};document.addEventListener('visibilitychange',visibility);
 function translate(){
  for(const n of root.querySelectorAll('[data-t]'))n.textContent=t(n.dataset.t);
  for(const n of root.querySelectorAll('[data-label]'))n.setAttribute('aria-label',t(n.dataset.label));
  syncMissionOptions();card.refresh();controls?.refresh();renderLocationNote();el.play.textContent=t(playing?'暂停回放':'播放过境');status(report,reportError);context();siteOptions();editOptions();passOptions();renderEvents();updateCoverage();draw();
 }
 function watchSelection(){
  if(active&&!archived&&(el.dataset.options.length!==Object.keys(MISSIONS).length))syncMissionOptions();
  if(!active||dirtyForm||archived||!selection||sameSelection(selection,orbitSelection(sim,id)))return;
  search({target:id,s:site,start:observationStart,history:replay,useExample:example});
 }
 let restart=false;
 el.height.value='';el.start.value=inputText(time);const unsubscribe=onLanguageChange(translate);translate();
 return {openPass,selectTarget,getObservationRecord,restoreObservationRecord,
  resume(){
   active=true;syncMissionOptions();clearInterval(poll);poll=setInterval(watchSelection,450);
   const stored=lastObserver();
   if(!initialized){
    initialized=true;lastSite=stored;const saved=stored??[...sites.values()].at(-1)?.site??null;el.config.open=!saved;
    search({target:initialTarget(sim.missionId),s:saved,start:Date.now()});
   }else if(!archived&&stored&&!sameObserver(stored,lastSite)&&!dirtyForm){lastSite=stored;restart=false;search({target:id,s:stored,start:observationStart,history:replay});}
   else if(restart&&!dirtyForm){restart=false;search({target:id,s:site,start:observationStart,history:replay,useExample:example});}
   else{watchSelection();resumeLive();draw();}
  },
  pause(){active=false;locationRequest++;drag=null;stop();suspendLive();controls?.stopMotion();clearInterval(poll);poll=null;if(job){restart=true;cancelSearch();}},
  dispose(){disposed=true;active=false;stop();suspendLive();clearInterval(poll);cancelSearch();controls?.dispose();view.dispose();resize.disconnect();unsubscribe();document.removeEventListener('visibilitychange',visibility);image.removeEventListener('load',refreshTexture);root.remove();sheet.remove();}
 };
}
