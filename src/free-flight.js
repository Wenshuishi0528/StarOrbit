import {t,onLanguageChange} from './i18n.js';
import {createFreeFlightScene} from './free-flight-scene.js';
import {mountFreeFlightPanel} from './free-flight-panel.js';
import {mountFreeFlightInstruments} from './free-flight-instruments.js';
import {createFlightLauncher,shipLabel} from './free-flight-launcher.js';
import {createFlightBackdrop,flightReference} from './free-flight-backdrop.js';
import {readFlight,saveFlight} from './free-flight-store.js';
import {createFlightInputBuffer} from './main-flight-input.js';
import {pilotSas} from './pilot-controls.js';
import {FREE_FLIGHT_STEP,createFreeFlight,flightMetrics,releaseFreeFlight,restoreFreeFlight,setFlightApproach,setFlightHold,setFlightRcs,setFlightRcsEnabled,setFlightSas,setFlightAttitude,setFlightDockingLimits,stepFreeFlight} from './free-flight-physics.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const displayKey='starorbit-free-flight-display-v1';
function displayOptions(saved){
 let options=saved;
 if(!options)try{options=JSON.parse(localStorage.getItem(displayKey));}catch{}
 return {navball:options?.navball!==false,trail:options?.trail!==false,fine:options?.fine===true,angularDamping:options?.angularDamping!==false};
}
const collisionMessages={
 speed:'接触速度过高。先减速，再缓慢接近接口。',
 sideSpeed:'横向速度过高。先消除侧向漂移。',
 angle:'姿态误差过大。对准接口姿态后再接近。',
 angularSpeed:'转动速度过高。先停止转动，再接近接口。',
 lateral:'横向偏移过大。先平移到接口轴线上。',
 closing:'接近方向不正确。请从接口前方缓慢靠近。',
 structure:'船体或太阳翼碰到了空间站或另一艘飞船。',
 departure:'退离尚未完成，请先离开接口再返回。',
};

function captureAssembly(api){
 const angles=clone(api.state.angles);
 for(const [id,rig] of Object.entries(api.rig)){
  angles[id]={roll:(rig.roll?.rotation.x||0)*180/Math.PI,left:(rig.left?.rotation.y||0)*180/Math.PI,right:(rig.right?.rotation.y||0)*180/Math.PI};
 }
 return {slots:{...api.state.slots},angles};
}
export function installFreeFlight(sim,assets){
 const api=sim.api;
 const sky=createFlightBackdrop(sim);
 let run=null,scene=null,reference=null,checkpoint=null,view='external';
 const input=createFlightInputBuffer();
 let paused=false,prevWall=null,remainder=0,nextRead=0,note='',noteUntil=0;
 let mainControls,orbitControls,focusBack=null,hasSave=false,lastQ=null;
 let trails=new Map(),trailStamp=-Infinity;
 const panel=mountFreeFlightPanel({inputSurface:api.renderer.domElement,onInput:(value,{clear=false}={})=>{if(clear)input.clear();else input.set(value);},onAction:action});
 const instruments=mountFreeFlightInstruments({onAction:action});
 const launcher=createFlightLauncher(sim,{start:id=>start({portId:id}),resume:id=>start({savedId:id})});

 function current(){return run.session.ships.find(s=>s.id===run.selectedId);}
 function message(key){note=key;noteUntil=performance.now()+4200;}
 function panelState(){
  const ship=current(),state=run.session,metrics=flightMetrics(state,ship.id);
  const readings=metrics.impact??metrics;
  return {selectedId:ship.id,crafts:scene.definitions.map(d=>({id:d.id,label:shipLabel(d.type,d.portId)})),
   phase:ship.status,view,cameraTarget:scene.cameraTarget,range:metrics.distance,closing:readings.closing,angle:readings.angle,elapsed:state.elapsed,
   hold:!!ship.hold,approach:ship.approach,canDock:metrics.approachReady,paused,hasSave,hasCheckpoint:!!checkpoint,
   ...run.display,angularDamping:ship.sasEnabled!==false,effectiveSas:pilotSas(ship.sasEnabled,input.temporarySas),rcsEnabled:ship.rcsEnabled!==false,rcs:ship.rcs,attitudeMode:ship.attitudeMode,dockingLimits:state.dockingLimits,
   message:ship.status==='collision'?(collisionMessages[ship.collisionReason]||'可从安全点重试，或载入已保存的任务。'):performance.now()<noteUntil?note:''};
 }
 function readouts(){
  if(!run)return;
  panel.update(panelState());
  const ship=current();
  instruments.update({ship,definition:run.session.definitions.find(d=>d.id===ship.id),metrics:flightMetrics(run.session,ship.id),
   reference:lastQ?{altitude:lastQ.altitude,speed:lastQ.speed,time:lastQ.t}:null,...run.display,angularDamping:pilotSas(ship.sasEnabled,input.temporarySas),rcsEnabled:ship.rcsEnabled!==false,view,paused,
   rcs:ship.rcs,attitudeMode:ship.attitudeMode,limits:run.session.dockingLimits,
   camera:{fov:scene.camera.fov,aspect:scene.camera.aspect},projection:scene.getDockingProjection()});
 }
 function clearInputs(){panel.clearInput();input.clear();remainder=0;prevWall=null;}
 function point(){return {session:run.session,selectedId:run.selectedId};}
 function resetTrails(){trails=new Map();trailStamp=-Infinity;}
 function resetOnceLoaded(point){
  if(!point?.session||!run.session.ships.some(s=>s.id===point.selectedId))throw Error('飞行存档或飞船参数无效');
  const session=restoreFreeFlight(point.session,scene.definitions);
  if(session.epoch!==run.seed.t||Math.abs(session.meanMotion-reference.meanMotion)>1e-10)throw Error('飞行存档或飞船参数无效');
  run.session=session;run.selectedId=point.selectedId;
  paused=true;clearInputs();resetTrails();
 }
 function persist(){
  const disk=saveFlight({...run,view,cameraTarget:scene.cameraTarget,checkpoint});
  hasSave=true;
  return disk;
 }
 function start({portId=null,savedId=null}={}){
  if(run)return;
  sim.mainFlight?.stop();
  let nextScene=null;
  try{
   let next,initialView='external';
   if(savedId){
    const saved=readFlight(savedId);
    if(!saved||saved.format!==1||saved.id!==savedId)throw Error('飞行存档或飞船参数无效');
    next=saved;initialView=saved.view==='port'?'port':'external';
   }else{
    if(sim.missionId!=='tiangong'||!sim.current)throw Error('当前轨道不适用于近站飞行');
    const {t,position,velocity}=sim.current;
    next={format:1,id:globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),
     seed:{t,position:[...position],velocity:[...velocity]},assembly:captureAssembly(api)};
   }
   const nextRef=flightReference(next.seed);
   nextScene=createFreeFlightScene(sim,assets,next.assembly);
   const defs=nextScene.definitions;
   let state=savedId?restoreFreeFlight(next.session,defs):createFreeFlight(defs,{epoch:next.seed.t,meanMotion:nextRef.meanMotion});
   const display=displayOptions(savedId?next.display:null);
   // Pre-SAS saves stored one damping preference in display options. Migrate
   // it once; current saves keep independent settings for every vessel.
   state={...state,ships:state.ships.map(ship=>{
    const old=next.session?.ships?.find(body=>body.id===ship.id);
    return savedId&&typeof old?.sasEnabled==='boolean'?ship:{...ship,sasEnabled:display.angularDamping};
   })};
   const selected=defs.find(d=>savedId?d.id===next.selectedId:d.portId===portId);
   if(!selected||state.epoch!==next.seed.t||Math.abs(state.meanMotion-nextRef.meanMotion)>1e-10)throw Error('飞行存档或飞船参数无效');
   const safe=next.checkpoint;
   if(safe){
    if(!defs.some(d=>d.id===safe.selectedId))throw Error('飞行存档或飞船参数无效');
    const pointState=restoreFreeFlight(safe.session,defs);
    if(pointState.epoch!==state.epoch||pointState.meanMotion!==state.meanMotion)throw Error('飞行存档或飞船参数无效');
   }
   focusBack=launcher.trigger;
   sim.sessionMemory?.save();
   mainControls=api.controls.enabled;orbitControls=sim.orbitControls.enabled;
   api.controls.enabled=false;sim.orbitControls.enabled=false;
   run={format:1,id:next.id,seed:next.seed,assembly:next.assembly,session:state,selectedId:selected.id,display};
   scene=nextScene;reference=nextRef;checkpoint=safe??point();
   hasSave=!!savedId;view=initialView;paused=!!savedId;note='';noteUntil=0;
   lastQ=null;clearInputs();resetTrails();nextRead=0;
   launcher.close();document.body.classList.add('free-flight-active');api.resize();
   setView(view);
   panel.show(panelState());
   render();scene.setCameraTarget(next.cameraTarget);render();readouts();
  }catch(error){
   if(run)exit(false);
   else nextScene?.dispose();
   const reason={error:t(error.message)};
   if(!launcher.showError(t('无法开始飞行：{error}',reason)))api.toast('无法开始飞行：{error}',reason);
  }
 }
 function setView(value){
  view=value==='port'&&current().status!=='docked'?'port':'external';
  scene.setView(view==='port'?'onboard':'external');
  document.body.classList.toggle('free-flight-onboard',view==='port');
 }
 function render(clean=false){
  if(!lastQ||lastQ.t!==run.seed.t+run.session.elapsed*1000)lastQ=reference.at(run.session.elapsed);
  if(run.session.elapsed-trailStamp>=.35){
   trailStamp=run.session.elapsed;
   for(const ship of run.session.ships){
    if(ship.status==='docked'){trails.delete(ship.id);continue;}
    const trail=trails.get(ship.id)??[];trail.push([...ship.position]);if(trail.length>512)trail.shift();trails.set(ship.id,trail);
   }
  }
  scene.update(run.session.ships,run.selectedId,{trail:clean||!run.display.trail?null:trails.get(run.selectedId),guide:!clean&&current().status!=='docked',sunLocal:lastQ.sunLocal,illumination:lastQ.illumination});
  sky(lastQ,scene.camera);scene.draw();
 }
 function tick(wall){
  if(!run)return;
  if(!paused&&prevWall!==null)remainder+=Math.min(.4,Math.max(0,(wall-prevWall)/1000));
  prevWall=wall;
  while(!paused&&remainder+1e-10>=FREE_FLIGHT_STEP){
   remainder-=FREE_FLIGHT_STEP;
   const before=run.session;
   run.session=stepFreeFlight(before,{...input.take(),id:run.selectedId,fine:run.display.fine,angularDamping:current().sasEnabled!==false},scene.collides);
   for(let i=0;i<before.ships.length;i++){
    const ship=run.session.ships[i];if(ship.status===before.ships[i].status)continue;
    if(ship.status==='collision'){
     run.selectedId=ship.id;paused=true;clearInputs();break;
    }
    if(ship.status==='free'&&before.ships[i].status==='departing'&&!run.session.ships.some(s=>s.status==='collision'))checkpoint=point();
    if(ship.status==='docked'&&ship.id===run.selectedId){
     if(view==='port')setView('external');
     message('已捕获并锁紧原接口。');
    }
   }
  }
  render();
  if(wall>=nextRead){readouts();nextRead=wall+100;}
 }
 function photo(){
  render(true);
  api.renderer.domElement.toBlob(blob=>{
   if(!blob)return api.toast('照片未能保存');
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='StarOrbit-FreeFlight-'+Date.now()+'.png';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
  },'image/png');
 }
 function exit(save=true){
  if(!run)return;
  const disk=save&&persist();clearInputs();panel.hide();instruments.update(null);scene.dispose();
  scene=null;run=null;reference=null;checkpoint=null;lastQ=null;resetTrails();
  api.controls.enabled=mainControls;sim.orbitControls.enabled=orbitControls;
  document.body.classList.remove('free-flight-active','free-flight-onboard');api.resize();
  sim.lastWall=performance.now();sim.dirty=sim.snap=true;
  sim.update(sim.lastWall);sim.render();focusBack?.focus({preventScroll:true});
  if(save)api.toast(disk?'已保存飞行，已返回轨道观测。':'浏览器未允许写入；飞行仅保留在本页。');
 }
 function action(name,value){
  if(!run)return;
  try{
   const id=run.selectedId,ship=current();
   note='';
   switch(name){
    case 'select':
     if(run.session.ships.some(s=>s.id===value)){clearInputs();run.selectedId=value;setView(view);render();}
     break;
    case 'undock':
     if(!paused&&ship.status==='docked'){checkpoint=point();run.session=releaseFreeFlight(run.session,id);}
     break;
    case 'hold':
     if(!paused)run.session=setFlightHold(run.session,id,!ship.hold);
     break;
    case 'dock':
     if(!paused){
      if(!ship.approach&&flightMetrics(run.session,id).approachReady)checkpoint=point();
      run.session=setFlightApproach(run.session,id,!ship.approach);
     }
     break;
    case 'view':
     setView(value);
     if(value==='external')scene.fit(true);
     break;
    case 'camera-target':
     scene.setCameraTarget(value);
     break;
    case 'rcs-toggle':
     clearInputs();run.session=setFlightRcsEnabled(run.session,id,ship.rcsEnabled===false);
     break;
    case 'damping':
     run.session=setFlightSas(run.session,id,ship.sasEnabled===false);
     run.display.angularDamping=current().sasEnabled!==false;
     try{localStorage.setItem(displayKey,JSON.stringify(run.display));}catch{}
     break;
    case 'navball':case 'trail':case 'fine':{
     const key=name;
     run.display[key]=!run.display[key];
     try{localStorage.setItem(displayKey,JSON.stringify(run.display));}catch{}
     break;
    }
    case 'rcs':case 'rcs-reset':
     clearInputs();run.session=setFlightRcs(run.session,id,name==='rcs-reset'?null:value);
     message(name==='rcs-reset'?'已恢复当前飞船的默认推力。':'已应用当前飞船的 RCS 参数。');
     break;
    case 'docking-limits':case 'docking-reset':
     clearInputs();run.session=setFlightDockingLimits(run.session,name==='docking-reset'?null:value);
     message(name==='docking-reset'?'已恢复默认对接容差。':'已应用本次任务的对接容差。');
     break;
    case 'attitude':
     if(!paused){clearInputs();run.session=setFlightAttitude(run.session,id,value);}
     break;
    case 'pause':
     if(run.session.ships.some(s=>s.status==='collision'))message('可从安全点重试，或载入已保存的任务。');
     else{paused=!paused;clearInputs();}
     break;
    case 'save':message(persist()?'本次飞行已保存。':'浏览器未允许写入；飞行仅保留在本页。');break;
    case 'resume':{
     const saved=readFlight(run.id);
     if(saved){resetOnceLoaded(saved);run.display=displayOptions(saved.display);checkpoint=saved.checkpoint??point();setView(saved.view);render();scene.setCameraTarget(saved.cameraTarget);}
     break;
    }
    case 'restore':if(checkpoint){resetOnceLoaded(checkpoint);setView(view);}break;
    case 'photo':photo();break;
    case 'exit':exit();return;
    default:return;
   }
  }catch(error){message(error.message);}
  render();readouts();
 }
 function open(portId){
  if(run)return;
  if(portId&&sim.current&&sim.missionId==='tiangong')start({portId});
  else launcher.open();
 }
 function suspend(){
  if(run){paused=true;clearInputs();readouts();}
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
 window.addEventListener('blur',()=>{
  if(!run)return;
  clearInputs();
  // Native pickers can briefly move window focus and immediately return it.
  // Pause only when the app has actually lost focus, not on that transient.
  setTimeout(()=>{if(run&&(document.hidden||!document.hasFocus()))suspend();},0);
 });
 window.addEventListener('pagehide',()=>{if(run)persist();});
 onLanguageChange(()=>{if(run)readouts();});
 if(location.hash==='#free-flight')launcher.open();
 window.addEventListener('hashchange',()=>{if(location.hash==='#free-flight'&&!run)launcher.open();});
 return {open,tick,get active(){return !!run;},get state(){return run?panelState():null;}};
}
