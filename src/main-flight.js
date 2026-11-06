import {Euler,Matrix4,Quaternion,Vector3,MathUtils} from 'three';
import {stepAttitudeDynamics} from './attitude-dynamics.js';
import {createFlightInputBuffer} from './main-flight-input.js';
import {pilotSas} from './pilot-controls.js';
import {MAIN_ATTITUDE_MODES,mainAttitudeDirection,mainAttitudeTargetQuaternion} from './main-flight-attitude.js';
import {createMainFlightTranslation,mainFlightFrame,mainFlightModelOffset,mainFlightSnapshot,stepMainFlightTranslation,MAIN_FLIGHT_STEP} from './main-flight-physics.js';
import {mission,spacecraft,VIEW_UNITS_PER_METRE} from './missions.js';
import {attitudeQuaternion} from './xuntian-formation-math.js';
import {t} from './i18n.js';

const $=id=>document.getElementById(id),zero=()=>[0,0,0],V=a=>new Vector3().fromArray(a);
const frameQuaternion=q=>new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(...q.basis.map(V)));
const neutral=()=>({rotation:zero(),translation:zero(),temporarySas:false});
const norm=a=>Math.hypot(...a);


/** Independent near-orbit states share a reference ephemeris, never mutate it.
 * Selecting a craft changes input ownership, not the other craft's momentum.
 * Precise telescope aiming can own its attitude while RCS translation continues. */
export function installMainFlight(sim){
 const api=sim.api,runs=new Map(),preferences=new Map();
 let selected='mission',reference=null,applyingOffset=false,subscribed=null;
 const input=createFlightInputBuffer();
 const prefs=(id=selected)=>{if(!preferences.has(id))preferences.set(id,{rcs:false,sas:true,fine:false,braking:false,attitudeMode:'inertial'});return preferences.get(id);};
 const hasTelescope=()=>sim.missionId==='tiangong'&&!!api.state.showXT&&!!api.groups.freeXT?.visible&&!!sim.xuntian?.optics;
 const base=()=>reference??sim.current;
 const orientation=id=>id==='xuntian'?attitudeQuaternion(sim.xuntian.optics.axes):frameQuaternion(base()).multiply(sim.missions.bodyRoot().getWorldQuaternion(new Quaternion()));
 const attitudeTarget=(id=selected)=>hasTelescope()?id==='xuntian'?{id:'mission',name:'中国空间站'}:{id:'xuntian',name:'巡天望远镜'}:null;
 function effectiveSnapshot(id,q=base()){
  const translation=runs.get(id)?.translation??(id==='xuntian'?{...createMainFlightTranslation(),position:sim.xuntian.formation.getOffset()}:null);
  return q&&translation?mainFlightSnapshot(q,translation):q;
 }
 function directionFor(mode,id=selected,q=base()){
  const target=mode.includes('target')?attitudeTarget(id):null;
  return mainAttitudeDirection(mode,effectiveSnapshot(id,q),target?effectiveSnapshot(target.id,q)?.position:null);
 }
 function attitudeModes(){
  const available=!!base()&&!!sim.capabilities.manualAttitude&&!sim.missions?.busy&&!sim.sceneBusy&&!sim.freeFlight?.active&&!sim.flightLab?.active;
  const snapshot=available?effectiveSnapshot(selected):null,target=available?attitudeTarget():null;
  const targetPosition=target?effectiveSnapshot(target.id)?.position:null;
  return MAIN_ATTITUDE_MODES.map(mode=>{
   const hasDirection=mode.id==='inertial'||!!mainAttitudeDirection(mode.id,snapshot,targetPosition);
   return {...mode,available:available&&hasDirection,reason:available&&hasDirection?'':!base()?'需要有效轨道才能自动指向':!available?'当前状态无法使用姿态操纵':mode.id.includes('target')?'当前任务没有可用目标':'需要有效轨道才能自动指向'};
  });
 }
 function clearInput(){input.clear();}
 function selectTarget(id){
  const next=id==='xuntian'&&hasTelescope()?'xuntian':'mission';
  if(next===selected)return;
  clearInput();sim.navball?.release();selected=next;sim.missions?.syncUI();
 }
 function acquireAttitude(run){
  if(run.attitudeControlled)return;
  const quaternion=orientation(run.id).toArray();
  run.attitude={quaternion,angularVelocity:zero(),sasTarget:quaternion};run.attitudeControlled=true;
 }
 function start({attitude=true}={}){
  let run=runs.get(selected);
  if(run){if(attitude)acquireAttitude(run);return run;}
  if(!base()||!sim.capabilities.manualAttitude||sim.missions?.busy||sim.sceneBusy||sim.freeFlight?.active||sim.flightLab?.active||selected==='xuntian'&&!hasTelescope())return null;
  const initial=selected==='xuntian'?sim.xuntian.formation.getOffset():zero();
  const quaternion=orientation(selected).toArray(),translation={...createMainFlightTranslation(),position:[...initial]};
  const spin=selected==='mission'&&sim.missions.state.rotation.enabled?(mission(sim.missionId).spinRpm||0)*Math.PI/30:0;
  run={id:selected,missionId:sim.missionId,body:sim.missions.bodyRoot(),initialOffset:[...initial],initialQuaternion:[...quaternion],
   translation,attitude:{quaternion,angularVelocity:[0,0,spin],sasTarget:spin?null:quaternion},attitudeControlled:selected==='mission'||attitude,
   meanMotion:mainFlightFrame(base()).meanMotion,lastTime:sim.time,remainder:0,origin:api.modelRoot.position.clone(),lastOffset:new Vector3(),lastRefresh:0,constrained:false};
  runs.set(selected,run);
  sim.mode='custom';sim.speed=1;sim.paused=false;sim.lastWall=performance.now();sim.timeUI();
  document.body.classList.add('main-flight-active');return run;
 }
 function resetTarget(id=selected){
  const old=runs.get(id);if(!old)return;
  runs.delete(id);prefs(id).braking=false;prefs(id).attitudeMode='inertial';if(id===selected)clearInput();
  if(id==='mission'){
   api.modelRoot.position.copy(old.origin);sim.missions.lastBodyPose=null;sim.missions.updateRotation();
   sim.current=reference??sim.current;sim.rebuild({poseOnly:true});sim.missions.syncUI();
  }else{
   applyingOffset=true;try{sim.xuntian?.formation?.setOffset(old.initialOffset);}finally{applyingOffset=false;}
   sim.xuntian?.setPilotAxes(bodyAxes(old.initialQuaternion));sim.xuntian?.clearPilot();
  }
  if(old.centered&&sim.view!=='orbit'&&(!sim.cameraFocus||sim.cameraFocus.selected===id))api.fit(id==='xuntian'?'freeXT':'mission');
  if(!runs.size)document.body.classList.remove('main-flight-active');sim.dirty=true;
 }
 function stop(){for(const id of [...runs.keys()])resetTarget(id);clearInput();}
 function endAttitudeControl(id){
  prefs(id).attitudeMode='inertial';
  const run=runs.get(id);if(!run)return;
  if(id===selected)clearInput();run.attitudeControlled=false;run.attitude.angularVelocity=zero();run.attitude.sasTarget=null;
 }
 function command(value){
  const settings=prefs(),rotation=value.rotation??zero(),translation=settings.rcs?(value.translation??zero()):zero();
  if(([...rotation,...translation].some(Boolean)||value.temporarySas)&&!start({attitude:rotation.some(Boolean)||!!value.temporarySas}))return;
  if(rotation.some(Boolean)){settings.attitudeMode='inertial';const run=runs.get(selected);if(run)run.attitude.sasTarget=null;}
  if(translation.some(Boolean))settings.braking=false;
  input.set({rotation,translation,temporarySas:!!value.temporarySas});
 }
 function action(name){
  const settings=prefs();
  if(name.startsWith('attitude:')){
   const mode=name.slice(9);if(!attitudeModes().some(item=>item.id===mode&&item.available))return false;
   const run=start();if(!run)return false;
   clearInput();settings.sas=true;settings.attitudeMode=mode;run.attitude.sasTarget=null;
   // An explicit pointing command starts/resumes the same 1× maneuver whether
   // this craft already has a paused run or is being piloted for the first time.
   sim.mode='custom';sim.speed=1;sim.paused=false;sim.lastWall=performance.now();sim.timeUI();
   if(selected==='xuntian')sim.xuntian.setPilotAxes(bodyAxes(run.attitude.quaternion));
   return true;
  }
  if(name==='rcs'){settings.rcs=!settings.rcs;if(!settings.rcs){clearInput();settings.braking=false;}}
  if(name==='sas'){
   settings.sas=!settings.sas;
   if(!settings.sas)settings.attitudeMode='inertial';
   const run=selected==='xuntian'||settings.sas?start():runs.get(selected);if(run)run.attitude.sasTarget=null;
  }
  if(name==='fine')settings.fine=!settings.fine;
  if(name==='brake'&&settings.rcs&&start({attitude:selected!=='xuntian'}))settings.braking=!settings.braking;
  if(name==='reset')resetTarget();
  if(name==='center'){if(sim.view==='orbit')sim.setView('follow');api.fit(selected==='xuntian'?'freeXT':'mission');const run=runs.get(selected);if(run)run.centered=true;}
  if(name==='pause'&&runs.size){sim.paused=!sim.paused;clearInput();sim.timeUI();}
 }
 function bodyAxes(quaternion){
  const q=new Quaternion().fromArray(quaternion);
  return {forward:new Vector3(1,0,0).applyQuaternion(q).toArray(),right:new Vector3(0,-1,0).applyQuaternion(q).toArray(),up:new Vector3(0,0,1).applyQuaternion(q).toArray()};
 }
 function applyStation(run,q,wall){
  const local=frameQuaternion(q).invert().multiply(new Quaternion().fromArray(run.attitude.quaternion));
  run.body.quaternion.copy(local);
  const offset=V(mainFlightModelOffset(q,run.translation,VIEW_UNITS_PER_METRE));
  api.modelRoot.position.copy(run.origin).add(offset);api.modelRoot.updateMatrixWorld(true);
  sim.center.add(offset.clone().sub(run.lastOffset));run.lastOffset.copy(offset);
  if(wall-run.lastRefresh>=160){
   sim.rebuild({poseOnly:true});run.lastRefresh=wall;
   const euler=new Euler().setFromQuaternion(local,'ZYX');
   if(selected==='mission')for(const [i,key] of ['roll','pitch','yaw'].entries()){
    const number=$('craft'+key),range=$('craft'+key+'Range');
    if(document.activeElement===number||document.activeElement===range)continue;
    const value=MathUtils.radToDeg([euler.x,euler.y,euler.z][i]).toFixed(1);number.value=range.value=value;
   }
  }
 }
 function syncTelescope(run){
  const formation=sim.xuntian?.formation;if(!formation)return;
  applyingOffset=true;
  try{
   const actual=formation.setOffset(run.translation.position).offset;
   run.constrained=norm(actual.map((v,i)=>v-run.translation.position[i]))>1e-5;
   if(run.constrained){run.translation.position=[...actual];run.translation.velocity=zero();}
  }finally{applyingOffset=false;}
  if(run.attitudeControlled)sim.xuntian.setPilotAxes(bodyAxes(run.attitude.quaternion));
 }
 function subscribeFormation(){
  const formation=sim.xuntian?.formation;if(!formation||formation===subscribed)return;subscribed=formation;
  formation.subscribe(state=>{
   const run=runs.get('xuntian');
   if(run&&!applyingOffset&&['offset','suggested','clearance','initial'].includes(state.reason)){
    run.translation.position=[...state.offset];run.translation.velocity=zero();run.constrained=false;
   }
  });
 }
 function update(q,wall){
  reference=q;subscribeFormation();if(selected==='xuntian'&&!hasTelescope())selectTarget('mission');
  for(const run of [...runs.values()]){
   const elapsed=(sim.time-run.lastTime)/1000;
   if(!q||run.missionId!==sim.missionId||sim.freeFlight?.active||sim.sceneBusy||sim.speed!==1||sim.mode!=='custom'||elapsed<0||elapsed>.6||run.id==='xuntian'&&!hasTelescope()){resetTarget(run.id);continue;}
   run.lastTime=sim.time;if(!sim.paused)run.remainder+=elapsed;
   const settings=prefs(run.id),controlled=run.id===selected;
   // Target availability can change while paused. Release the unavailable
   // pointing mode immediately; actual braking still waits for resumed time.
   if(settings.attitudeMode!=='inertial'&&!directionFor(settings.attitudeMode,run.id,q)){settings.attitudeMode='inertial';run.attitude.sasTarget=null;}
   if(!run.attitudeControlled&&run.id==='xuntian')run.attitude={quaternion:orientation('xuntian').toArray(),angularVelocity:zero(),sasTarget:null,phase:'external'};
   while(!sim.paused&&run.remainder+1e-9>=MAIN_FLIGHT_STEP){
    run.remainder-=MAIN_FLIGHT_STEP;const precision=settings.fine?.2:1,command=controlled?input.take():neutral();
    const {rotation,translation}=command;
    const sas=pilotSas(settings.sas,command.temporarySas);
    let target=null;
    if(settings.attitudeMode!=='inertial'){
     const direction=directionFor(settings.attitudeMode,run.id,q);
     if(!direction){settings.attitudeMode='inertial';run.attitude.sasTarget=null;}
     else if(sas)target=mainAttitudeTargetQuaternion(run.attitude.quaternion,direction,{assembly:run.id==='xuntian'||!!sim.capabilities.assembly});
    }
    if(run.attitudeControlled)run.attitude=stepAttitudeDynamics(run.attitude,rotation,{dt:MAIN_FLIGHT_STEP,sas,target,
     acceleration:MathUtils.degToRad(settings.rcs?4.5:3)*precision,maxRate:MathUtils.degToRad(12)*precision});
    const world=V(translation);if(world.length()>1)world.normalize();
    world.multiplyScalar(settings.rcs?.08*precision:0).applyQuaternion(new Quaternion().fromArray(run.attitude.quaternion));
    run.translation=stepMainFlightTranslation(run.translation,{worldAcceleration:world.toArray(),brake:settings.braking&&settings.rcs,
     acceleration:settings.rcs?.08*precision:0,meanMotion:run.meanMotion},q);
    if(run.translation.outOfRange){sim.paused=true;clearInput();sim.timeUI();api.toast('已到近轨操纵的 10 km 范围，请恢复观测。');break;}
   }
   if(run.id==='mission')applyStation(run,q,wall);else syncTelescope(run);
  }
  // A telescope may still expose its previous optical pose during the same
  // tick in which the shared orbit becomes unavailable. Do not extrapolate it.
  if(!q)return q;
  const station=runs.get('mission');
  const position=selected==='xuntian'&&hasTelescope()?(runs.get('xuntian')?.translation??{
   ...createMainFlightTranslation(),position:sim.xuntian.formation.getOffset()}):station?.translation;
  return position?{...mainFlightSnapshot(q,position),sceneOrigin:[...q.position]}:q;
 }
 function navigation(){
  const q=base();if(!q)return null;
  // All markers share the controller's actual geocentric/companion geometry,
  // in inertial unit vectors. The view converts them to its orbital frame.
  const attitudeDirections=Object.fromEntries(MAIN_ATTITUDE_MODES.filter(mode=>mode.id!=='inertial')
   .map(mode=>[mode.id,directionFor(mode.id,selected,q)]).filter(([,direction])=>direction));
  if(selected==='xuntian'&&hasTelescope()){
   const offset=runs.get('xuntian')?.translation??{...createMainFlightTranslation(),position:sim.xuntian.formation.getOffset()};
   const local=frameQuaternion(q).invert().multiply(orientation('xuntian'));
   return {id:'xuntian',name:'巡天望远镜',q:mainFlightSnapshot(q,offset),quaternion:local.toArray(),assembly:true,attitudeDirections};
  }
  const body=sim.missions?.bodyRoot();return body?{id:'mission',name:spacecraft(sim.missionId).name,q:sim.current??q,
   quaternion:body.getWorldQuaternion(new Quaternion()).toArray(),assembly:!!sim.capabilities.assembly,attitudeDirections}:null;
 }
 function pointingError(){
  const run=runs.get(selected),direction=run&&directionFor(prefs().attitudeMode,selected);
  if(!direction||!run.attitudeControlled)return null;
  const forward=new Vector3(...(selected==='xuntian'||sim.capabilities.assembly?[1,0,0]:[0,0,1])).applyQuaternion(new Quaternion().fromArray(run.attitude.quaternion));
  return MathUtils.radToDeg(forward.angleTo(V(direction)));
 }
 function suspend(){clearInput();if(runs.size){sim.paused=true;for(const run of runs.values())run.remainder=0;sim.timeUI();}}
 function syncPoseUI(){
  if(selected!=='xuntian'||!hasTelescope()||!base())return;
  $('attitudeCraftName').textContent=t('巡天望远镜');$('attitudeFrame').textContent=t('巡天光轴姿态 · 与巡天取景同步');
  $('attitudeAxes').textContent=t('前向为光轴，上方为取景画面上方；旋转参考当前轨道坐标。');
  const local=frameQuaternion(base()).invert().multiply(orientation('xuntian')),euler=new Euler().setFromQuaternion(local,'ZYX');
  for(const [i,key] of ['roll','pitch','yaw'].entries()){
   const number=$('craft'+key),range=$('craft'+key+'Range');
   if(document.activeElement===number||document.activeElement===range)continue;
   number.value=range.value=MathUtils.radToDeg([euler.x,euler.y,euler.z][i]).toFixed(1);
  }
 }
 function editPose(key,value){
  if(selected!=='xuntian'||!hasTelescope())return false;
  sim.xuntian.beginExternalSteering();
  const frame=frameQuaternion(base()),local=frame.clone().invert().multiply(orientation('xuntian'));
  const euler=new Euler().setFromQuaternion(local,'ZYX');
  if(key)euler[{roll:'x',pitch:'y',yaw:'z'}[key]]=MathUtils.degToRad(value);else euler.set(0,0,0,'ZYX');
  sim.xuntian.setPilotAxes(bodyAxes(frame.multiply(new Quaternion().setFromEuler(euler)).toArray()));sim.xuntian.clearPilot();
  sim.rebuild({poseOnly:true});syncPoseUI();return true;
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
 window.addEventListener('blur',()=>{clearInput();setTimeout(()=>{if(document.hidden||!document.hasFocus())suspend();},0);});
 return {start,command,action,selectTarget,resetTarget,endAttitudeControl,update,stop,suspend,clearInput,syncPoseUI,editPose,
  get active(){return runs.size>0;},get missionActive(){return runs.has('mission');},get reference(){return reference;},get targetId(){return selected;},get navigation(){return navigation();},
  get targets(){return [{id:'mission',name:spacecraft(sim.missionId).name},...(hasTelescope()?[{id:'xuntian',name:'巡天望远镜'}]:[])];},
  get attitudeModes(){return attitudeModes();},
  get state(){const run=runs.get(selected);return {...prefs(),attitudeTarget:attitudeTarget(),effectiveSas:pilotSas(prefs().sas,input.temporarySas),targetId:selected,active:!!run,paused:runs.size>0&&sim.paused,phase:run?.attitude.phase??(selected==='xuntian'?'external':'hold'),
   pointingError:pointingError(),constrained:!!run?.constrained,angularSpeed:run?MathUtils.radToDeg(norm(run.attitude.angularVelocity)):0,
   speed:run?norm(run.translation.velocity):0,distance:run?norm(run.translation.position):0,translation:run?.translation??null,quaternion:run?.attitude.quaternion??null};}};
}
