import {Quaternion} from 'three';
import {t,getLanguage,onLanguageChange} from './i18n.js';
import {shortClock} from './time-format.js';
import {mountSurveyMission} from './survey-live-mission.js';
import {SURVEY_FIELDS} from './survey-lab-math.js';
import {dot,unit} from './orbit.js';
import {cityAnchor,createCityFinder,groundAttitude,opticalPose,orbitCarriedPose,orbitRelativePose,pinCrosshair,steerDetector,trackGround,wrapRoll} from './xuntian-ground-target.js';
import {sampleStationPin,stationPinDirection} from './xuntian-station-pin.js';
import {cameraAxes,clamp,earthInFront,focalLength,fovAtZoom,groundDirection,groundSunAltitude,sunlitGroundDirection,lookDirection,MAX_FOV,MIN_FOV,skyCoordinates,zoomAtFov} from './xuntian-pointing.js';
import {installXuntianFormation,mountXuntianFormationPanel} from './xuntian-formation.js';
import {attitudeQuaternion} from './xuntian-formation-math.js';
import {solarApparent} from './solar-system.js';
import {solarLabel} from './solar-targets.js';
import {getXuntianTarget} from './xuntian-catalog.js';
import {createXuntianViewRenderer} from './xuntian-view-render.js';
import {earthMapSizes,PHOTO_WIDTHS,resolutionTag} from './xuntian-image-quality.js';
import {xuntianSkySource} from './xuntian-view-sky.js';
import {mountScopeInput} from './xuntian-input.js';
import {mountScopeSearch} from './xuntian-search.js';
import {makeScopeGuide} from './xuntian-guide.js';

const $=id=>document.getElementById(id),KEY='starorbit-xuntian-instrument-v1',ASPECT=1.6,DISCOVERY_FOV=3.5,D=Math.PI/180;
const modes={free:'自由指向',station:'空间站',horizon:'地平线',nadir:'星下点',sunlit:'日照地表',city:'城市','ground-pin':'固定地面点','sky-pin':'固定星空方向','station-pin':'固定站体点'};
const recommended=['pleiades','cygnus','orion','sagittarius','carina','andromeda','pegasus','leo','virgo'];
const setText=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
const visible=(sim)=>sim.missionId==='tiangong'&&sim.api.state.showXT&&!!sim.api.groups.freeXT;

export function installXuntianScope(sim){
 const panel=$('xuntianScope'),canvas=$('xtCanvas'),ocular=canvas.parentElement;
 let formation=null,guide=null,renderer=null,active=false,opened=false,mode='sky',named=null,fieldId=null,field=DISCOVERY_FOV,aperture=600,ev=0,photoWidth=1440,bookmark=null;
 let pose=new Quaternion(),desired=null,axes=cameraAxes(pose),optics=null,lastWall=null,lastDraw=-Infinity,interval=80,lastResult=null,completedFrame='',pausedFrame='',assemblyRevision=0,shadowTimer=0;
 let capturing=false,unavailable=false,needsFrame=false,stationRefresh=false,nightCap=false,selectedAt=0,locked=false,exterior='both';
 const stats={frames:0,lastRenderMs:0};let surveyMission,anchor=null,tracked=null,freePose=null,releaseNote='',roll=0,rollTimer=0;
 const cities=createCityFinder(sim.environment.geography.items);
 try{const prefs=JSON.parse(localStorage.getItem(KEY))||{};if(Number.isFinite(prefs.aperture))aperture=clamp(prefs.aperture,25,2000);if(Number.isFinite(prefs.ev))ev=clamp(prefs.ev,-3,3);if(PHOTO_WIDTHS.includes(prefs.photoWidth))photoWidth=prefs.photoWidth;$('xtShowGuide').checked=prefs.guide!==false;$('xtSkyCompass').checked=prefs.compass!==false;}catch{}
 const prefs=()=>{try{localStorage.setItem(KEY,JSON.stringify({aperture,ev,photoWidth,guide:$('xtShowGuide').checked,compass:$('xtSkyCompass').checked}));}catch{}};
 const setLens=f=>{field=clamp(f,MIN_FOV,MAX_FOV);$('xtFocal').value=String(Math.round(zoomAtFov(field)*1000));setText($('xtFocalLabel'),Math.round(focalLength(field))+' mm');lastDraw=-Infinity;};
 const setAperture=a=>{aperture=clamp(a,25,2000);$('xtAperture').value=String(Math.round(Math.log(aperture/25)/Math.log(80)*1000));setText($('xtApertureLabel'),Math.round(aperture)+' mm');lastDraw=-Infinity;};
 const setEV=value=>{ev=clamp(value,-3,3);$('xtEV').value=ev;setText($('xtEVLabel'),(ev>0?'+':'')+Number(ev.toFixed(2))+' EV');lastDraw=-Infinity;};
 function actualAxes(){return cameraAxes(opticalPose(pose,roll));}
 function discardAnchor(){anchor=null;tracked=null;freePose=null;releaseNote='';}
 function rememberFree(q=sim.current){freePose=q?orbitRelativePose(q,opticalPose(pose,roll)):null;}
 function updateFree(q){
  if(!freePose){rememberFree(q);return;}
  const carried=orbitCarriedPose(q,freePose);if(carried)pose.copy(opticalPose(carried,-roll));
 }
 function setRoll(value,remember=true){
  if(mode==='free'&&sim.current)updateFree(sim.current);
  roll=wrapRoll(value);if(mode==='free'&&sim.current)rememberFree();$('xtRoll').value=String(Math.round(roll));setText($('xtRollLabel'),(roll>0?'+':'')+Math.round(roll)+'°');
  axes=actualAxes();if(formation&&sim.current)optics=formation.update(sim.current,axes);
  lastDraw=-Infinity;pausedFrame='';if(remember){clearTimeout(rollTimer);rollTimer=setTimeout(prefs,180);}if(active)hud();
 }
 function aim(direction,snap=false){
  const next=lookDirection(direction,cameraAxes(pose).up);if(snap){pose.copy(next);axes=actualAxes();desired=null;locked=true;}else{desired=next;locked=false;}
  lastDraw=-Infinity;
 }
 function saveSky(){
  if(mode==='sky')bookmark={pose:(desired||pose).clone(),named,fieldId,field};
 }
 function bodyNow(body){
  const eye=optics?.eyeKm||sim.current?.position;
  if(!eye||!sim.current)return null;
  return solarApparent(sim.current,eye).find(entry=>entry.id===body);
 }
 function selectStar(target){
  if(target.type==='solar'){
   if(target.body==='Earth'){observe('nadir');return;}
   const body=bodyNow(target.body);if(!body)return;
   saveSky();surveyMission?.clear();discardAnchor();mode='solar';named=target;fieldId=null;
   const diameter=2*body.radiusRad/D;
   setLens(Math.max(MIN_FOV,diameter*(target.body==='Saturn'?4.8:2.5)));
   aim(body.direction);selectedAt=performance.now();hud();canvas.focus({preventScroll:true});return;
  }
  if(target.type==='city'){selectCity(target);return;}
  surveyMission?.clear();discardAnchor();mode='sky';named=target;fieldId=null;setLens(target.fov);aim(target.direction);selectedAt=performance.now();hud();canvas.focus({preventScroll:true});
 }
 function recommend(snap=false){
  surveyMission?.clear();discardAnchor();const eye=formation?.getOptics()?.eyeKm||sim.current?.position,station=formation?.stationTarget(ASPECT);
  const options=recommended.map(id=>SURVEY_FIELDS.find(f=>f.id===id));
  const qualifies=f=>!eye||(!earthInFront(eye,f.center)&&dot(f.center,unit(eye))>-.16&&(!sim.current?.sunDir||dot(sim.current.sunDir,f.center)<.80)&&(!station||dot(station.direction,f.center)<Math.cos(Math.min(89,station.fov/2+4)*D)));
  const valid=options.filter(qualifies),list=valid.length?valid:options.filter(f=>!eye||!earthInFront(eye,f.center));
  const candidates=list.length?list:options;
  const chosen=candidates[(candidates.findIndex(f=>f.id===fieldId)+1)%candidates.length];
  mode='sky';named=null;fieldId=chosen.id;setLens(DISCOVERY_FOV);aim(chosen.center,snap);$('xtSearch').value='';hud();
 }
 function selectCity(city){
  saveSky();surveyMission?.clear();anchor=cityAnchor(city);tracked=null;releaseNote='';mode='city';named=null;fieldId=null;
  setLens(city.fov);desired=null;locked=false;lastDraw=-Infinity;selectedAt=performance.now();
  if(optics&&sim.current){tracked=trackGround(anchor,optics.eyeKm,sim.current);if(tracked)desired=groundAttitude(tracked,pose);}
  hud();canvas.focus({preventScroll:true});
 }
 function releasePin(note=''){
  discardAnchor();releaseNote=note;mode='free';named=null;fieldId=null;desired=null;locked=false;rememberFree();$('xtSearch').value='';
  lastDraw=-Infinity;hud();
 }
 function pinHere(){
  if(!sim.current||!optics)return;
  const now=formation.update(sim.current,actualAxes());if(!now)return;
  saveSky();discardAnchor();const station=sampleStationPin(sim,now);
  anchor=station?{kind:'station',point:station,up:cameraAxes(pose).up}:pinCrosshair(now.eyeKm,now.axes,pose,sim.current);
  mode={ground:'ground-pin',sky:'sky-pin',station:'station-pin'}[anchor.kind];tracked=null;releaseNote='';named=null;fieldId=null;
  desired=null;locked=true;lastDraw=-Infinity;$('xtSearch').value='';hud();
 }
 function togglePin(){if(mode==='free')pinHere();else releasePin();}
 function manual(x,y){
  if(mode==='free'&&sim.current)updateFree(sim.current);
  discardAnchor();mode='free';named=null;fieldId=null;desired=null;locked=false;steerDetector(pose,x,y,roll);rememberFree();axes=actualAxes();
  if(formation&&sim.current)optics=formation.update(sim.current,axes);$('xtSearch').value='';lastDraw=-Infinity;hud();
 }
 const input=mountScopeInput(canvas,{nudge:manual,zoom:d=>setLens(fovAtZoom(zoomAtFov(field)+d)),roll:delta=>setRoll(roll+delta),togglePin,field:()=>field});
 const search=mountScopeSearch($('xtSearch'),$('xtResults'),{choose:selectStar,cityFinder:cities,isBlocked:d=>earthInFront(optics?.eyeKm||sim.current?.position,d),
  solarVisible:id=>{const b=bodyNow(id);return b?!earthInFront(optics?.eyeKm||sim.current.position,b.direction):null;},
  cityVisible:city=>sim.current&&(optics?.eyeKm||sim.current.position)?trackGround(cityAnchor(city),optics?.eyeKm||sim.current.position,sim.current)?.visible:null});
 function targetForMode(){
  if(!optics||!sim.current)return null;
  if(mode==='solar'){tracked=bodyNow(named.body);return tracked;}
  if(anchor?.kind==='ground'){tracked=trackGround(anchor,optics.eyeKm,sim.current);return tracked;}
  if(anchor?.kind==='station'){
   const direction=stationPinDirection(sim,optics,anchor.point);
   if(!direction){releasePin('原站体部件已移除，固定已解除。');return null;}
   return {direction,up:anchor.up};
  }
  if(mode==='station')return formation.stationTarget(ASPECT);
  if(mode==='sunlit'){
   const dir=sunlitGroundDirection(optics.eyeKm,sim.current.sun);nightCap=!dir;
   return {direction:dir||groundDirection('nadir',optics.eyeKm,sim.current),fov:28};
  }
  if(mode==='horizon'||mode==='nadir')return {direction:groundDirection(mode,optics.eyeKm,sim.current),fov:mode==='horizon'?30:20};
  return null;
 }
 function observe(key){
  if(!optics)return;saveSky();surveyMission?.clear();discardAnchor();mode=key;stationRefresh=false;const target=targetForMode();if(!target){restoreSky();return;}
  setLens(target.fov);aim(target.direction);hud();
 }
 function restoreSky(){
  discardAnchor();if(!bookmark){recommend();return;}
  mode='sky';named=bookmark.named;fieldId=bookmark.fieldId;setLens(bookmark.field);desired=bookmark.pose.clone();locked=false;$('xtSearch').value=named?.name||'';hud();
 }
 function hud(){
  const sky=mode==='solar'||mode==='sky'||mode==='sky-pin'||mode==='free',center=lastResult?.center,city=anchor?.cityId?cities.get(anchor.cityId,getLanguage()):null;
  if(active&&surveyMission)surveyMission.paint(axes,field,sky,!unavailable&&!capturing);
  const targetName=(mode==='solar'?solarLabel(named.body,getLanguage()):null)||city?.name||(mode==='sky'?(named?.name||(fieldId?t(SURVEY_FIELDS.find(f=>f.id===fieldId).name):t('手动星野'))):t(modes[mode]));
  setText($('xtTarget'),targetName);$('xtReturn').hidden=mode==='sky'||mode==='free';$('xtRecommend').hidden=!sky;
  const below=anchor?.kind==='ground'&&tracked?.visible===false;
  const blocked=!!(below||(locked&&(sky&&['earth','station'].includes(center?.kind)||anchor?.kind==='ground'&&center?.kind==='station')));
  const status=unavailable?t('无轨道位置'):mode==='sunlit'&&nightCap?t('当前可见地表均在夜侧'):below?t('目标在地平线下'):!locked&&desired?t('正在转向…'):
   blocked?t(center?.kind==='earth'||below?'地球遮挡':'站体遮挡'):anchor?t('固定跟踪中'):mode==='free'?t('随轨道转动'):locked?t('已对准'):t('自由指向');
  setText($('xtStatus'),status);$('xtStatus').dataset.blocked=String(blocked);
  const tracking=$('xtTrackingInfo'),detail=anchor?.kind==='ground'?t('目标 {lat}°, {lon}° · 斜距 {range} km',{
   lat:anchor.latitude.toFixed(3),lon:anchor.longitude.toFixed(3),range:tracked?Math.round(tracked.range):'—'}):mode==='solar'&&tracked?t('视直径 {diam}″ · 亮面 {lit}%',{diam:(tracked.radiusRad*2/D*3600).toFixed(1),lit:Math.round(tracked.illuminatedFraction*100)}):releaseNote?t(releaseNote):'';
  tracking.hidden=!detail;setText(tracking,detail);
  const free=mode==='free',pinButton=$('xtPin');pinButton.disabled=unavailable&&free;
  pinButton.dataset.action=free?'pin':'free';setText(pinButton,t(free?'固定十字线':'随轨道转动'));
  $('xtLookBody').hidden=mode!=='solar';$('xtLookBody').disabled=unavailable;
  $('xtPinHere').hidden=free||!!anchor;$('xtPinHere').disabled=unavailable;$('xtGroundQuick').disabled=unavailable;
  const coords=center?.kind==='earth'&&Number.isFinite(center.latitude)?center.latitude.toFixed(2)+'°, '+center.longitude.toFixed(2)+'°':skyCoordinates(axes.forward);
  const sunAltitude=groundSunAltitude(center,sim.current),ground=$('xtIllumination');ground.hidden=unavailable||sunAltitude===null;
  if(!ground.hidden){setText(ground,t(sunAltitude>=0?'昼面':sunAltitude>-6?'晨昏':'夜面'));ground.title=t('地表太阳高度 {alt}°',{alt:sunAltitude.toFixed(1)});}
  const env=sim.environment,source=earthMapSizes(env),skySource=xuntianSkySource(env);
  const earth=source.loading?t('地表加载中'):source.day===source.night||!source.night?t('地表 {size}',{size:resolutionTag(source.day)}):t('昼 {day} / 夜 {night}',{day:resolutionTag(source.day),night:resolutionTag(source.night)});
  let skyTag=skySource.status==='panorama'?t('银河 {size}',{size:skySource.level?skySource.level+'K':resolutionTag(skySource.sourceWidth)}):t(({loading:'银河加载中',failed:'银河底图不可用',unsupported:'程序银河',ordinary:skySource.presentation==='photo'?'摄影弱星空':'程序银河',catalog:'星表',off:'星空背景关闭'})[skySource.status]||'星表');
  if(skySource.showStars&&skySource.gain===0)skyTag+=' · '+t('星空亮度为零');
  setText($('xtSources'),[earth,skyTag,canvas.dataset.xuntianFrame&&canvas.dataset.xuntianFrame!=='error'?canvas.width+' × '+canvas.height:null].filter(Boolean).join(' · '));
  setText($('xtClock'),unavailable?'':shortClock(sim.time)+' UTC+8');setText($('xtDepth'),!unavailable&&Number.isFinite(lastResult?.limitMagnitude)?t('极限 {mag} 等',{mag:lastResult.limitMagnitude.toFixed(1)}):'');setText($('xtCoordinates'),coords);setText($('xtField'),t('视场 {fov}°',{fov:field.toFixed(field<.1?3:field<1?2:1)}));
  $('xtUnavailable').hidden=!unavailable;$('xtCapture').disabled=capturing||unavailable||!!surveyMission?.busy;
  ocular.dataset.center=unavailable?'':center?.kind||'';panel.dataset.mode=mode;panel.dataset.target=anchor?.cityId||(anchor?mode:null)||named?.id||fieldId||'';
 }
 function ensureFormation(){
  if(formation)return;
  formation=installXuntianFormation(sim);
  formation.subscribe(({reason})=>{
   stationRefresh=true;lastDraw=-Infinity;assemblyRevision++;
   if(reason==='offset'||reason==='suggested'||reason==='clearance'){
    clearTimeout(shadowTimer);shadowTimer=setTimeout(()=>{if(visible(sim))sim.rebuild({poseOnly:true});},120);
   }
   if(active&&sim.current)formation.update(sim.current,axes);
  });
 }
 function restoreInitial(){
  surveyMission?.clear();discardAnchor();input.clear();search.close();bookmark=null;
  mode='free';named=null;fieldId=null;desired=null;locked=false;$('xtSearch').value='';
  // In along-track, orbit-normal, radial coordinates, look along +X with +Z up.
  freePose=attitudeQuaternion({right:[0,-1,0],up:[0,0,1],forward:[1,0,0]},true);
  roll=0;setRoll(0,false);formation.restoreInitial();lastDraw=-Infinity;
 }
 function open(){
  if(sim.missionId!=='tiangong')return;
  if(!sim.api.state.showXT){$('showXT').click();return;}
  if(active)return;
  ensureFormation();if(!guide){guide=makeScopeGuide(sim.api.scene,$('xtShowGuide'));mountXuntianFormationPanel($('xtFormationPanel'),formation);}
  active=true;panel.hidden=false;document.body.classList.add('xt-scope-open');
  $('openXuntian').setAttribute('aria-expanded','true');$('openXuntianMap').setAttribute('aria-expanded','true');
  lastWall=null;lastDraw=-Infinity;lastResult=null;unavailable=!sim.current;
  restoreInitial();opened=true; completedFrame='';pausedFrame='';delete canvas.dataset.xuntianFrame;
  formation.refresh();update(sim.current,performance.now());sim.rebuild({poseOnly:true});needsFrame=true;hud();canvas.focus({preventScroll:true});
 }
 function close(){
  if(!active)return;active=false;surveyMission?.clear();search.close();input.clear();guide?.hide();
  panel.hidden=true;document.body.classList.remove('xt-scope-open');
  for(const id of ['openXuntian','openXuntianMap'])$(id).setAttribute('aria-expanded','false');
  renderer?.dispose();renderer=null;lastResult=null;needsFrame=false;lastWall=null;
  if(location.hash==='#xuntian')history.replaceState(null,'',location.pathname+location.search);
 }
 let wasVisible=false;
 function assemblyChanged(){
  const stationMission=sim.missionId==='tiangong';$('openXuntianMap').hidden=!stationMission;$('openXuntian').disabled=!stationMission;
  if(!visible(sim))close();if(formation)formation.refresh();else if(visible(sim))ensureFormation();
  const nowVisible=visible(sim);if(nowVisible&&!wasVisible){restoreInitial();opened=true;}wasVisible=nowVisible;
  if(formation&&visible(sim)&&sim.current)optics=formation.update(sim.current,opened?axes:undefined);
 }
 function update(q,wall){
  if(!formation)return;
  if(!visible(sim)){close();optics=null;return;}
  if(!q){formation.update(null);optics=null;unavailable=true;guide?.hide();if(active)hud();return;}
  if(!active&&!anchor&&mode!=='free'){optics=formation.update(q,opened?axes:undefined);return;}
  const dt=lastWall===null?0:clamp((wall-lastWall)/1000,0,.20);lastWall=wall;if(mode==='free')updateFree(q);if(active)input.step(dt);
  if(mode!=='sky'&&mode!=='sky-pin'&&mode!=='free'){
   // The line of sight to the station depends on where the entrance sits on the turning instrument.
   optics=formation.update(q,axes);
   const target=targetForMode();if(target){
    desired=target.up?groundAttitude(target,pose):lookDirection(target.direction,cameraAxes(pose).up);
    if(mode==='station'&&stationRefresh)setLens(target.fov);
   }
  }
  stationRefresh=false;
  if(desired){pose.rotateTowards(desired,112*D*dt);locked=pose.angleTo(desired)<.002;if(locked){pose.copy(desired);desired=null;}}
  axes=actualAxes();optics=formation.update(q,axes);unavailable=!optics;if(!active)return;
  if(needsFrame&&optics){needsFrame=false;frameExternal('both');}
  if($('xtShowGuide').checked&&sim.view!=='orbit')guide.update(optics,field,ASPECT);else guide.hide();
 }
 function frameExternal(which){
  exterior=which;const close=which==='near';$('xtNear').setAttribute('aria-pressed',String(close));$('xtFrameBoth').setAttribute('aria-pressed',String(!close));
  if(close)formation?.frameTelescope(panel);else formation?.frameBoth(panel);
 }
 const frame=()=>({q:sim.current,eyeKm:optics.eyeKm,eyeLocal:optics.eyeLocal,axes:optics.axes,localAxes:optics.localAxes,fovY:field,apertureMm:aperture,exposure:2**ev,showGalaxy:sim.environment.settings.milky&&sim.environment.settings.stars,showStars:sim.environment.settings.stars,skyExposure:sim.environment.settings.exposure,skyBrightness:sim.environment.settings.starBrightness,showStation:true,constellationId:mode==='sky'&&named?.type==='constellation'?named.id.split(':')[1]:null,fillLight:$('fillLight').checked,aspect:ASPECT});
 function aimTile(target){
  discardAnchor();mode='sky';named=null;fieldId=target.fieldId;setLens(4.7);aim(target.direction);
  selectedAt=performance.now();$('xtSearch').value='';hud();canvas.focus({preventScroll:true});
 }
 function openSurveyTile({fieldId,tile}={}){
  if(sim.missionId!=='tiangong')return false;
  open();return active&&surveyMission.select(fieldId,tile);
 }
 surveyMission=mountSurveyMission(sim,{aimTile,clearTarget(){hud();},getFrame:()=>active&&optics&&sim.current?{...frame(),constellationId:null}:null,
  instrument(){renderer??=createXuntianViewRenderer(sim,canvas);return {renderer,width:photoWidth};},refresh:hud});
 panel.addEventListener('keydown',e=>{
  if(e.target===canvas||e.code!=='KeyF'||e.ctrlKey||e.altKey||e.metaKey||e.isComposing||
    e.target.closest('input:not([type=range]):not([type=checkbox]),textarea,select,[contenteditable=true]'))return;
  e.preventDefault();e.stopPropagation();if(!e.repeat)togglePin();
 });
 $('xtPin').onclick=togglePin;$('xtPinHere').onclick=pinHere;$('xtGroundQuick').onclick=()=>observe('nadir');
 $('xtRoll').oninput=e=>setRoll(Number(e.target.value));
 $('xtRollReset').onclick=()=>setRoll(0);
 $('xtSkyCompass').onchange=()=>{prefs();hud();};
 function draw(wall){
  if(!active||document.hidden||!panel.getClientRects().length||!optics||!sim.current||wall-lastDraw<interval)return;
  lastDraw=wall;
  const completed=canvas.dataset.xuntianFrame;if(completed&&completed!=='error'&&completed!==completedFrame){stats.frames++;completedFrame=completed;}
  const f=frame(),env=sim.environment,u=env.uniforms;
  // At a paused epoch the same photons need no second exposure. Invalidate for
  // pointing, focus, a moving panel, cloud/texture replacement and local illumination.
  const signature=sim.paused&&sim.mode!=='real'?[sim.current.t,assemblyRevision,mode,f.constellationId,field,aperture,ev,canvas.clientWidth,devicePixelRatio,f.showStars,f.skyExposure,f.skyBrightness,env.skyLoading,env.galaxyTexture?.version,renderer?.earthAppearanceKey?.(),renderer?.solarAppearanceKey?.(),
   ...pose.toArray(),...optics.eyeLocal,...sim.api.model.quaternion.toArray(),f.fillLight,f.showGalaxy,env.galaxyTexture?.id,
   ...['dayMap','nightMap','cloudMap','oceanMap'].map(k=>u[k].value?.id),u.cloudAmount.value,env.settings.cloudNightVisible,
   ...Object.values(sim.api.rig).flatMap(r=>[r.roll?.rotation.x,r.left?.rotation.y,r.right?.rotation.y])].join('|'):'';
  if(signature&&signature===pausedFrame&&completed&&completed!=='error'){hud();return;}
  renderer??=createXuntianViewRenderer(sim,canvas);
  const start=performance.now(),result=renderer.render(f);
  if(result?.available)lastResult=result;if(result?.submitted)pausedFrame=signature;
  stats.lastRenderMs=performance.now()-start;interval=clamp(74+stats.lastRenderMs*2,80,205);hud();
 }
 async function capture(){
  if(capturing||!optics||!sim.current)return;
  capturing=true;hud();let stamp,subject;
  const atShutter=()=>{
   if(!active||!sim.current||!optics)return null;
   stamp=new Date(sim.current.t).toISOString().replace(/[:.]/g,'-');
   subject=(anchor?.cityId||(mode==='solar'?named.body:mode==='sky'?(named?.id||fieldId||mode):mode)).replace(/[^a-zA-Z0-9_-]/g,'_');
   return {...frame(),constellationId:null};
  };
  try{
   renderer??=createXuntianViewRenderer(sim,canvas);
   const blob=await renderer.capture(atShutter(),{width:photoWidth,atShutter});const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.download='StarOrbit_Xuntian_'+subject+'_'+stamp+'.png';a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){sim.api.toast(t('巡天照片未能保存：{error}',{error:e.message}));}finally{capturing=false;hud();}
 }
 const route=async()=>{
  if(location.hash!=='#xuntian')return;
  if(sim.flightLab?.active)sim.flightLab.close();
  if(sim.missionId!=='tiangong'){try{await sim.missions.switchTo('tiangong');}catch(e){sim.api.toast('切换失败：{error}',{error:e.message});return;}}
  if(location.hash==='#xuntian')open();
 };window.addEventListener('hashchange',route);
 $('openXuntian').onclick=open;$('openXuntianMap').onclick=open;
 $('xtLookBody').onclick=()=>{
  if(mode!=='solar'||!sim.current)return;
  const overview=sim.view==='orbit',camera=overview?sim.spaceCamera:sim.api.camera;
  const controls=overview?sim.orbitControls:sim.api.controls;
  const body=solarApparent(sim.current,sim.spaceCamera.position.toArray()).find(b=>b.id===named.body);
  if(!body)return;
  const direction=overview?body.direction:sim.current.basis.map(axis=>dot(axis,body.direction));
  const distance=camera.position.distanceTo(controls.target);
  controls.stopMotion();controls.target.copy(camera.position).addScaledVector(camera.position.clone().fromArray(direction),distance);controls.update();
 };
 $('xtInitial').onclick=()=>{restoreInitial();canvas.focus({preventScroll:true});};
 $('xtClose').onclick=()=>{close();const button=$('openXuntianMap');if(button.offsetWidth)button.focus({preventScroll:true});};
 $('xtExpand').onclick=()=>{const large=panel.classList.toggle('expanded');$('xtExpand').setAttribute('aria-pressed',String(large));if(optics)frameExternal(exterior);lastDraw=-Infinity;};
 $('xtMapTab').onclick=()=>{close();sim.minimap.setVisible(true);if(matchMedia('(max-width:760px)').matches&&!$('orbitMinimap').classList.contains('compact-expanded'))$('toggleMinimap').click();};
 $('xtAperture').oninput=e=>{setAperture(25*80**(Number(e.target.value)/1000));prefs();};
 $('xtEV').oninput=e=>{setEV(Number(e.target.value));prefs();};
 const maxPhoto=sim.api.renderer.capabilities.maxTextureSize;
 for(const option of $('xtPhotoWidth').options)option.disabled=+option.value>maxPhoto;
 photoWidth=PHOTO_WIDTHS.includes(photoWidth)&&photoWidth<=maxPhoto?photoWidth:(PHOTO_WIDTHS.filter(w=>w<=maxPhoto).at(-1)||Math.min(maxPhoto,1440));
 $('xtPhotoWidth').value=String(photoWidth);$('xtPhotoWidth').onchange=e=>{const n=Number(e.target.value);if(PHOTO_WIDTHS.includes(n)&&n<=maxPhoto){photoWidth=n;prefs();}};
 $('xtNear').onclick=()=>frameExternal('near');
 $('xtFocal').oninput=e=>setLens(fovAtZoom(Number(e.target.value)/1000));
 $('xtShowGuide').onchange=prefs;$('xtCapture').onclick=capture;$('xtRecommend').onclick=()=>recommend(false);$('xtReturn').onclick=restoreSky;
 panel.querySelectorAll('[data-xt-mode]').forEach(b=>b.onclick=()=>observe(b.dataset.xtMode));$('xtFrameBoth').onclick=()=>frameExternal('both');
 $('xtMore').addEventListener('toggle',()=>{if($('xtMore').open)$('xtMore').scrollIntoView({block:'nearest'});});
 onLanguageChange(()=>{if(named?.type==='solar'){named.name=solarLabel(named.body,getLanguage());$('xtSearch').value=named.name;}else if(named)named=getXuntianTarget(named.id,getLanguage())||named;if(bookmark?.named)bookmark.named=getXuntianTarget(bookmark.named.id,getLanguage())||bookmark.named;search.refresh();if(active){if(anchor?.cityId)$('xtSearch').value=cities.get(anchor.cityId,getLanguage())?.name||'';else if(named&&mode==='sky')$('xtSearch').value=named.name;hud();}});
 $('xtSearch').placeholder=t('火星、织女星、Orion、北京');onLanguageChange(()=>{$('xtSearch').placeholder=t('火星、织女星、Orion、北京');});
 setLens(field);setAperture(aperture);setEV(ev);setRoll(roll,false);assemblyChanged();if(formation)sim.rebuild({poseOnly:true});
 return {open,close,openSurveyTile,update,draw,assemblyChanged,restoreRoute:route,get active(){return active;},get formation(){return formation;},get optics(){return optics;},get pointing(){return {mode,target:anchor?.cityId||(anchor?mode:null)||named?.id||fieldId,axes,locked,field,aperture,ev,roll,pinned:anchor?.kind||null,ground:anchor?.kind==='ground'?{latitude:anchor.latitude,longitude:anchor.longitude,visible:tracked?.visible??null}:null,selectedAt};},get result(){return lastResult;},stats};
}
