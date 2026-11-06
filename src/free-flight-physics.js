import {flightVessel,FREE_FLIGHT_RCS_DEFAULTS,FREE_FLIGHT_RCS_RANGES} from './free-flight-vessels.js';
export {FREE_FLIGHT_RCS_DEFAULTS,FREE_FLIGHT_RCS_RANGES} from './free-flight-vessels.js';
// Nearby flight, in metres and seconds. The station is the origin of a rotating
// circular-orbit frame: +X along track, +Y orbit normal, +Z radially outward.
// The interface's +X points out of its host. A pilot's "forward" command is
// towards the nose/port (-X in the logical ship frame).
import {Quaternion,Vector3} from 'three';
import {stepAttitudeDynamics} from './attitude-dynamics.js';
import {pilotSas} from './pilot-controls.js';
import {DOCKING_RATE,dockingEuler,hcwDerivative,hcwStep,hcwToScene,sceneToHCW,rotateDockingVector} from './docking-physics.js';
import {cross,dot,norm,sub} from './orbit.js';

export const FREE_FLIGHT_STEP=.04;
const DEG=Math.PI/180;
// The free-flight game's capture envelope, independent of the docking lesson.
// Public CNSA/CMSA descriptions confirm non-zero misalignment and low relative
// contact speed. These conservative teaching values are not SZ/TZ certification.
export const FREE_FLIGHT_LIMITS=Object.freeze({
 capturePlane:.35,captureLateral:.3,captureSpeed:.2,captureLateralSpeed:.05,
 captureAngle:3,captureAngularSpeed:.2*DEG
});
export const freeFlightLimits=FREE_FLIGHT_LIMITS;
export const FREE_FLIGHT_DOCKING_RANGES=Object.freeze({
 captureLateral:Object.freeze({min:.05,max:1,step:.01}),
 captureAngle:Object.freeze({min:.5,max:15,step:.5}),
 captureSpeed:Object.freeze({min:.02,max:.5,step:.01}),
 captureLateralSpeed:Object.freeze({min:.005,max:.3,step:.005}),
 captureAngularSpeed:Object.freeze({min:.05*DEG,max:3*DEG,step:.05*DEG})
});
const DEPART_SPEED=.28,CLEAR_DISTANCE=3;
const ATTITUDE_MODES=['off','prograde','retrograde','target','port'];
const CAPTURE_REASONS=['lateral','speed','sideSpeed','closing','angle','angularSpeed'];
const COLLISION_REASONS=[...CAPTURE_REASONS,'structure','departure'];
const ZERO=()=>[0,0,0];
const scaled=(v,k)=>v.map(x=>x*k);
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const unitLimit=(v,max)=>{
 const n=norm(v);
 return n>max?scaled(v,max/n):v;
};
const quat=a=>new Quaternion().fromArray(a);
const outward=definition=>rotateDockingVector([1,0,0],definition.quaternion);
const active=ship=>ship.status==='departing'||ship.status==='free';
const vectorOK=(v,size)=>Array.isArray(v)&&v.length===size&&Array.from(v).every(Number.isFinite);
const physicalVector=(v,limit)=>vectorOK(v,3)&&v.every(x=>Math.abs(x)<=limit);
// Reject numerical overflow, not a gameplay speed. Motion reached with SAS
// off must remain loadable beyond the assisted rate or former save thresholds.
const motionVector=v=>vectorOK(v,3)&&Number.isFinite(v.reduce((sum,x)=>sum+x*x,0));
const quatOK=q=>vectorOK(q,4)&&Math.abs(Math.hypot(...q)-1)<1e-5;
const textOK=s=>typeof s==='string'&&s.length>0&&s.length<=1024;
const validDate=n=>Number.isFinite(n)&&Number.isFinite(new Date(n).getTime());
function invalid(){throw Error('飞行存档或飞船参数无效');}
function rcsValues(source=FREE_FLIGHT_RCS_DEFAULTS,clamp=false){
 if(!source||typeof source!=='object')invalid();
 const values={};
 for(const [key,{min,max}] of Object.entries(FREE_FLIGHT_RCS_RANGES)){
  const value=source[key];
  if(!Number.isFinite(value)||!clamp&&(value<min||value>max))invalid();
  values[key]=Math.max(min,Math.min(max,value));
 }
 return values;
}
const rcsFor=ship=>ship.rcs??FREE_FLIGHT_RCS_DEFAULTS;
function dockingValues(source=FREE_FLIGHT_LIMITS,clamp=false){
 if(!source||typeof source!=='object')invalid();
 const values={capturePlane:FREE_FLIGHT_LIMITS.capturePlane};
 if(source.capturePlane!=null&&source.capturePlane!==values.capturePlane)invalid();
 for(const [key,{min,max}] of Object.entries(FREE_FLIGHT_DOCKING_RANGES)){
  const value=Object.hasOwn(source,key)?source[key]:FREE_FLIGHT_LIMITS[key];
  if(!Number.isFinite(value)||!clamp&&(value<min||value>max))invalid();
  values[key]=Math.max(min,Math.min(max,value));
 }
 return values;
}

function normalizeDefinitions(definitions){
 if(!Array.isArray(definitions)||definitions.length>512)invalid();
 const ids=new Set(),ports=new Set();
 return definitions.map(def=>{
  if(!def||!textOK(def.id)||!textOK(def.portId)||!flightVessel(def.type)||
     ids.has(def.id)||ports.has(def.portId)||!physicalVector(def.position,1e7)||!physicalVector(def.port,1e7)||!quatOK(def.quaternion))invalid();
  ids.add(def.id);ports.add(def.portId);
  return {id:def.id,type:def.type,portId:def.portId,position:[...def.position],quaternion:quat(def.quaternion).normalize().toArray(),port:[...def.port]};
 });
}
function dockedShip(def,deltaV=0,rcs=FREE_FLIGHT_RCS_DEFAULTS){
 return {id:def.id,type:def.type,portId:def.portId,status:'docked',
  position:[...def.position],velocity:ZERO(),quaternion:[...def.quaternion],angularVelocity:ZERO(),deltaV,hold:null,approach:false,
  rcs:{...rcs},rcsEnabled:true,sasEnabled:true,sasTarget:null,attitudeMode:'off',collisionReason:null,impact:null};
}
export function createFreeFlight(definitions,{epoch=0,meanMotion=DOCKING_RATE,dockingLimits=FREE_FLIGHT_LIMITS}={}){
 if(!validDate(epoch)||!Number.isFinite(meanMotion)||meanMotion<=0||meanMotion>.01)invalid();
 const sanitized=normalizeDefinitions(definitions);
 return {version:1,epoch,elapsed:0,meanMotion,dockingLimits:dockingValues(dockingLimits),definitions:sanitized,ships:sanitized.map(def=>dockedShip(def))};
}
function updateShip(session,id,change){
 const index=session.ships.findIndex(s=>s.id===id);
 if(index<0)return session;
 const ship=change(session.ships[index],session.definitions[index]);
 if(ship===session.ships[index])return session;
 const ships=session.ships.slice();ships[index]=ship;return {...session,ships};
}
export function releaseFreeFlight(session,id){
 return updateShip(session,id,(ship,def)=>{
  if(ship.status!=='docked')return ship;
  // Zero relative velocity was co-motion at the *local port*. Do not inject
  // the station's km/s geocentric velocity a second time when changing frames.
  return {...ship,status:'departing',velocity:scaled(outward(def),DEPART_SPEED),hold:null,approach:false,sasTarget:null};
 });
}
export function setFlightHold(session,id,on){
 return updateShip(session,id,ship=>{
  if(ship.status!=='free')return ship;
  if(!on)return ship.hold?{...ship,hold:null}:ship;
  if(ship.hold||ship.rcsEnabled===false)return ship;
  return {...ship,approach:false,attitudeMode:'off',sasEnabled:true,sasTarget:null,hold:{position:[...ship.position],quaternion:[...ship.quaternion]}};
 });
}
export function setFlightRcsEnabled(session,id,enabled){
 return updateShip(session,id,ship=>{
  if(ship.rcsEnabled===!!enabled)return ship;
  return {...ship,rcsEnabled:!!enabled,...(!enabled?{hold:null,approach:false}:{})};
 });
}
export function setFlightSas(session,id,enabled){
 return updateShip(session,id,ship=>ship.sasEnabled===!!enabled?ship:{...ship,sasEnabled:!!enabled,sasTarget:null,...(!enabled?{hold:null,approach:false,attitudeMode:'off'}:{})});
}
export function setFlightRcs(session,id,patch){
 return updateShip(session,id,ship=>({...ship,rcs:rcsValues(patch===null?FREE_FLIGHT_RCS_DEFAULTS:{...rcsFor(ship),...patch},true)}));
}
export function setFlightDockingLimits(session,patch){
 return {...session,dockingLimits:dockingValues(patch===null?FREE_FLIGHT_LIMITS:{...session.dockingLimits,...patch},true)};
}
export function setFlightAttitude(session,id,mode){
 if(!ATTITUDE_MODES.includes(mode))return session;
 return updateShip(session,id,ship=>{
  if(ship.status!=='free'||ship.attitudeMode===mode)return ship;
  return {...ship,attitudeMode:mode,hold:null,approach:false,sasTarget:null,...(mode!=='off'?{sasEnabled:true}:{})};
 });
}
function interfaceMetrics(ship,def,limits=FREE_FLIGHT_LIMITS){
 // Hooks belong to rigid bodies. When the ship rotates, the port's velocity
 // includes omega x r even with the centre stationary in station coordinates.
 const delta=quat(ship.quaternion).multiply(quat(def.quaternion).invert());
 const arm=new Vector3(...sub(def.port,def.position)).applyQuaternion(delta).toArray();
 const offset=sub(add(ship.position,arm),def.port),axis=outward(def);
 const omega=rotateDockingVector(ship.angularVelocity,ship.quaternion);
 const portVelocity=add(ship.velocity,cross(omega,arm));
 const axial=dot(offset,axis),lateralVector=sub(offset,scaled(axis,axial));
 const closing=-dot(portVelocity,axis),sideSpeed=norm(add(portVelocity,scaled(axis,closing)));
 const speed=norm(portVelocity),angle=quat(ship.quaternion).angleTo(quat(def.quaternion))*180/Math.PI;
 const lateral=norm(lateralVector);
 const angularSpeed=norm(ship.angularVelocity),inversePort=quat(def.quaternion).invert().toArray(),inverseBody=quat(ship.quaternion).invert().toArray();
 const offsetPort=rotateDockingVector(offset,inversePort),velocityPort=rotateDockingVector(portVelocity,inversePort);
 const pilot=vector=>{const [x,y,z]=rotateDockingVector(vector,inverseBody);return [-x,y,z];};
 const attitudeError=dockingEuler(quat(def.quaternion).invert().multiply(quat(ship.quaternion)).toArray());
 // Stopping after impact must not make its failed contact gates turn green.
 const contact=ship.status==='collision'&&ship.impact?ship.impact:{lateral,speed,sideSpeed,closing,angle,angularSpeed};
 const captureChecks={lateral:contact.lateral<=limits.captureLateral,speed:contact.speed<=limits.captureSpeed,
  sideSpeed:contact.sideSpeed<=limits.captureLateralSpeed,closing:contact.closing>=0,angle:contact.angle<=limits.captureAngle,
  angularSpeed:contact.angularSpeed<=limits.captureAngularSpeed};
 const captureReason=(ship.status==='collision'?ship.collisionReason:null)??CAPTURE_REASONS.find(key=>!captureChecks[key])??null;
 // Assistance flies a clear final approach; it is not a path planner around
 // the station. Only enable it in front of the actual selected home interface.
 const approachReady=ship.rcsEnabled!==false&&ship.status==='free'&&axial>=0&&axial<=250&&lateral<=limits.captureLateral+.05+.18*axial&&speed<=1&&
   Math.max(0,closing)**2/(2*rcsFor(ship).acceleration)<=axial+.1;
 return {distance:norm(offset),axial,lateral,speed,closing,sideSpeed,angle,angularSpeed,
  deltaV:ship.deltaV,approachReady,offsetPort,velocityPort,targetBody:pilot(scaled(offset,-1)),velocityBody:pilot(portVelocity),
  attitudeError,captureChecks,captureReady:ship.status!=='collision'&&captureReason===null,captureReason,collisionReason:ship.collisionReason??null,impact:ship.impact??null,limits};
}
export function flightMetrics(session,id){
 const index=session.ships.findIndex(s=>s.id===id);
 return index<0?null:interfaceMetrics(session.ships[index],session.definitions[index],session.dockingLimits);
}
export function setFlightApproach(session,id,on){
 return updateShip(session,id,(ship,def)=>{
  if(!on)return ship.approach?{...ship,approach:false}:ship;
  if(ship.approach||!interfaceMetrics(ship,def,session.dockingLimits).approachReady)return ship;
  return {...ship,approach:true,hold:null,attitudeMode:'off',sasEnabled:true,sasTarget:null};
 });
}
function command(values){
 if(!vectorOK(values,3))return ZERO();
 return unitLimit(values.map(x=>Math.max(-1,Math.min(1,x))),1);
}
function attitudeStep(ship,input,target,n,elapsed){
 const rcs=rcsFor(ship),precision=input.fine?.2:1;
 // RCS augments the attitude actuators. Wheels remain available with RCS off;
 // these are teaching accelerations, not published SZ/TZ actuator ratings.
 const acceleration=rcs.angularAcceleration*DEG*precision*(ship.rcsEnabled===false?.5:1);
 const sas=pilotSas(ship.sasEnabled,input.temporarySas);
 const options={dt:FREE_FLIGHT_STEP,sas,acceleration,maxRate:rcs.maxAngularRate*DEG*precision,target:sas?target:null};
 if(target&&sas){
  // The docking/hold pilot tracks an explicitly rotating local target. Solve
  // that command in its own frame so it has no orbital-rate steady-state lag.
  const result=stepAttitudeDynamics({...ship,sasTarget:null},input.rotation,options);
  return {quaternion:result.quaternion,angularVelocity:result.angularVelocity,sasTarget:null};
 }
 // Saved orientation and angular rate are relative to LVLH. Ordinary SAS
 // holds inertial heading: include frame angular velocity before integrating,
 // then remove the advanced frame. +Y is orbital normal in scene coordinates.
 const frame=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),n*elapsed);
 const orientation=quat(ship.quaternion),inertial=frame.clone().multiply(orientation);
 const frameBody=new Vector3(0,n,0).applyQuaternion(orientation.clone().invert());
 const angularVelocity=new Vector3(...ship.angularVelocity).add(frameBody).toArray();
 const result=stepAttitudeDynamics({quaternion:inertial.toArray(),angularVelocity,sasTarget:ship.sasTarget},input.rotation,options);
 const nextFrame=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),n*(elapsed+FREE_FLIGHT_STEP));
 const next=nextFrame.invert().multiply(quat(result.quaternion)).normalize();
 const nextFrameBody=new Vector3(0,n,0).applyQuaternion(next.clone().invert());
 return {quaternion:next.toArray(),angularVelocity:new Vector3(...result.angularVelocity).sub(nextFrameBody).toArray(),sasTarget:result.sasTarget};
}
function attitudeTarget(ship,def){
 if(ship.attitudeMode==='port')return def.quaternion;
 let direction;
 if(ship.attitudeMode==='target')direction=sub(def.port,ship.position);
 else if(ship.attitudeMode==='prograde'||ship.attitudeMode==='retrograde')direction=scaled(ship.velocity,ship.attitudeMode==='retrograde'?-1:1);
 if(!direction||norm(direction)<.005)return ship.attitudeMode!=='off'?ship.quaternion:null;
 const forward=new Vector3(-1,0,0).applyQuaternion(quat(ship.quaternion));
 const correction=new Quaternion().setFromUnitVectors(forward,new Vector3(...direction).normalize());
 return correction.multiply(quat(ship.quaternion)).normalize().toArray();
}
function accelerateTo(ship,desiredVelocity,n,limit){
 const rotatingDrift=hcwToScene(hcwDerivative(sceneToHCW(ship.position),sceneToHCW(ship.velocity),ZERO(),n).slice(3));
 return unitLimit(sub(scaled(sub(desiredVelocity,ship.velocity),1.2),rotatingDrift),limit);
}
function approachVelocity(ship,def,limits){
 const axis=outward(def);
 const delta=sub(ship.position,def.position),axial=dot(delta,axis);
 const side=sub(delta,scaled(axis,axial));
 const metrics=interfaceMetrics(ship,def,limits),remaining=Math.max(0,metrics.axial-limits.capturePlane);
 const acceleration=rcsFor(ship).acceleration,terminal=Math.min(.045,.55*limits.captureSpeed);
 // A chosen stricter envelope also constrains the pilot aid: the final speed
 // profile ends at the actual capture plane, and keeps margin for residual
 // lateral motion. Available RCS bounds the earlier braking trajectory.
 const aligned=metrics.angle<Math.min(3,limits.captureAngle*.5)&&
  metrics.lateral<limits.captureLateral*.5+.12*remaining&&
  (remaining>.5||metrics.sideSpeed<limits.captureLateralSpeed*.8&&metrics.angularSpeed<limits.captureAngularSpeed*.8);
 const closing=aligned?Math.min(.55,terminal+.06*remaining,Math.sqrt(terminal**2+acceleration*remaining)):0;
 const lateralLimit=Math.min(.25,limits.captureLateralSpeed*.55+.08*remaining,Math.sqrt(acceleration*norm(side)));
 return add(scaled(axis,-closing),unitLimit(scaled(side,-.45),lateralLimit));
}
function canCapture(metrics){
 return metrics.captureReady;
}
function crossingPose(before,after,axialBefore,axialAfter,plane){
 const fraction=(axialBefore-plane)/(axialBefore-axialAfter);
 const mix=(a,b)=>a.map((v,i)=>v+(b[i]-v)*fraction);
 return {...after,position:mix(before.position,after.position),velocity:mix(before.velocity,after.velocity),
  angularVelocity:mix(before.angularVelocity,after.angularVelocity),
  quaternion:quat(before.quaternion).slerp(quat(after.quaternion),fraction).toArray()};
}
function collision(ship,reason,metrics){
 const impact=Object.fromEntries(['lateral','speed','sideSpeed','closing','angle','angularSpeed'].map(key=>[key,metrics[key]]));
 return {...ship,status:'collision',velocity:ZERO(),angularVelocity:ZERO(),approach:false,hold:null,attitudeMode:'off',collisionReason:reason,impact};
}
function advanceShip(ship,def,input,n,collides,allShips,limits,elapsed){
 if(!active(ship))return ship;
 if(typeof input.angularDamping==='boolean'&&input.angularDamping!==ship.sasEnabled)ship={...ship,sasEnabled:input.angularDamping,sasTarget:null,...(!input.angularDamping?{hold:null,approach:false,attitudeMode:'off'}:{})};
 // An unavailable thruster command cannot override an unrelated attitude aid.
 if(ship.rcsEnabled===false){
  input={...input,translation:ZERO(),brake:false};
  if(ship.hold||ship.approach)ship={...ship,hold:null,approach:false};
 }
 const manual=norm(input.translation)>0||norm(input.rotation)>0||input.brake;
 if(manual&&(ship.approach||ship.hold))ship={...ship,approach:false,hold:null};
 if(norm(input.rotation)>0&&ship.attitudeMode!=='off')ship={...ship,attitudeMode:'off'};
 const rotationTarget=ship.approach?def.quaternion:ship.hold?.quaternion??attitudeTarget(ship,def);
 const attitude=attitudeStep(ship,input,rotationTarget,n,elapsed);
 let acceleration;
 const thrust=ship.rcsEnabled===false?0:rcsFor(ship).acceleration;
 const limit=input.fine?thrust*.2:thrust;
 if(input.brake)acceleration=accelerateTo(ship,ZERO(),n,limit);
 else if(ship.approach)acceleration=accelerateTo(ship,approachVelocity(ship,def,limits),n,thrust);
 else if(ship.hold){
  const velocityGoal=unitLimit(scaled(sub(ship.hold.position,ship.position),.4),.75);
  acceleration=accelerateTo(ship,velocityGoal,n,thrust);
 }else{
  const [forward,right,up]=input.translation;
  acceleration=scaled(rotateDockingVector([-forward,right,up],attitude.quaternion),limit);
 }
 const translation=hcwStep(sceneToHCW(ship.position),sceneToHCW(ship.velocity),sceneToHCW(acceleration),FREE_FLIGHT_STEP,n);
 const next={...ship,...attitude,position:hcwToScene(translation.position),velocity:hcwToScene(translation.velocity),
  deltaV:ship.deltaV+norm(acceleration)*FREE_FLIGHT_STEP};
 const metrics=interfaceMetrics(next,def,limits);
 if(ship.status==='free'&&metrics.axial<=limits.capturePlane){
  const beforeAxial=interfaceMetrics(ship,def,limits).axial;
  for(const plane of [limits.capturePlane,0]){
   if(beforeAxial<=plane||metrics.axial>plane)continue;
   const contact=crossingPose(ship,next,beforeAxial,metrics.axial,plane);
   const impact=interfaceMetrics(contact,def,limits);
   if(impact.lateral<=limits.captureLateral){
    if(!canCapture(impact))return collision(ship,impact.captureReason,impact);
    if(collides?.(ship,contact,def,allShips,limits))return collision(ship,'structure',impact);
    return {...dockedShip(def,next.deltaV,next.rcs),rcsEnabled:next.rcsEnabled,sasEnabled:next.sasEnabled};
   }
  }
 }
 if(collides?.(ship,next,def,allShips,limits))return collision(ship,'structure',metrics);
 if(ship.status==='departing'){
  if(metrics.axial>=CLEAR_DISTANCE)next.status='free';
  // During initial clearance a reversed command must not pass through the
  // exempt mating collar or latch twice at the release instant.
  if(metrics.axial<-.02&&metrics.lateral<limits.captureLateral)return collision(ship,'departure',metrics);
 }
 return next;
}
export function stepFreeFlight(session,input={},collides){
 const selected={translation:command(input.translation),rotation:command(input.rotation),fine:!!input.fine,brake:!!input.brake,temporarySas:!!input.temporarySas,
  angularDamping:typeof input.angularDamping==='boolean'?input.angularDamping:undefined};
 const coast={translation:ZERO(),rotation:ZERO(),brake:false,fine:false};
 const ships=session.ships.map((ship,index)=>advanceShip(ship,session.definitions[index],ship.id===input.id?selected:coast,
  session.meanMotion,collides,session.ships,session.dockingLimits??FREE_FLIGHT_LIMITS,session.elapsed));
 return {...session,elapsed:(Math.round(session.elapsed*1000)+FREE_FLIGHT_STEP*1000)/1000,ships};
}
function compatible(a,b){
 return a.id===b.id&&a.type===b.type&&a.portId===b.portId&&norm(sub(a.position,b.position))<.001&&
  norm(sub(a.port,b.port))<.001&&quat(a.quaternion).angleTo(quat(b.quaternion))<.0001;
}
export function restoreFreeFlight(input,definitions){
 const saved=typeof input==='string'?JSON.parse(input):input;
 if(saved?.version!==1||!Number.isFinite(saved.meanMotion)||!Number.isFinite(saved.elapsed)||saved.elapsed<0||!validDate(saved.epoch+saved.elapsed*1000))invalid();
 const session=createFreeFlight(definitions??saved.definitions,{epoch:saved.epoch,meanMotion:saved.meanMotion,dockingLimits:saved.dockingLimits});
 const oldDefs=normalizeDefinitions(saved.definitions);
 if(oldDefs.length!==session.definitions.length||!Array.isArray(saved.ships)||saved.ships.length!==oldDefs.length)invalid();
 const ships=session.definitions.map(def=>{
  const source=oldDefs.find(d=>d.id===def.id),s=saved.ships.find(s=>s?.id===def.id);
  if(!source||!compatible(def,source)||!s||s.type!==def.type||s.portId!==def.portId||!['docked','departing','free','collision'].includes(s.status))invalid();
  if(!physicalVector(s.position,1e9)||!motionVector(s.velocity)||!quatOK(s.quaternion)||!motionVector(s.angularVelocity)||
     !Number.isFinite(s.deltaV)||s.deltaV<0||typeof s.approach!=='boolean')invalid();
  const rcs=rcsValues(s.rcs),attitudeMode=s.attitudeMode??'off',collisionReason=s.collisionReason??null;
  const rcsEnabled=s.rcsEnabled??true,sasEnabled=s.sasEnabled??true,sasTarget=s.sasTarget??null;
  if(typeof rcsEnabled!=='boolean'||typeof sasEnabled!=='boolean'||sasTarget!==null&&!quatOK(sasTarget))invalid();
  if(!rcsEnabled&&(s.hold||s.approach))invalid();
  if(!ATTITUDE_MODES.includes(attitudeMode)||collisionReason!==null&&!COLLISION_REASONS.includes(collisionReason))invalid();
  if(attitudeMode!=='off'&&(s.status!=='free'||s.hold||s.approach))invalid();
  if(collisionReason!==null&&s.status!=='collision')invalid();
  let impact=null;
  if(s.impact!=null){
   if(s.status!=='collision'||typeof s.impact!=='object')invalid();
   impact=Object.fromEntries(CAPTURE_REASONS.map(key=>[key,s.impact[key]]));
   if(Object.values(impact).some(value=>!Number.isFinite(value)))invalid();
  }
  if((s.approach||s.hold)&&s.status!=='free'||s.approach&&s.hold)invalid();
  if(s.hold!==null&&(!s.hold||!physicalVector(s.hold.position,1e9)||!quatOK(s.hold.quaternion)))invalid();
  if(s.status==='docked'){
   if(norm(sub(s.position,def.position))>.001||quat(s.quaternion).angleTo(quat(def.quaternion))>.0001||
      norm(s.velocity)>1e-6||norm(s.angularVelocity)>1e-6)invalid();
   return {...dockedShip(def,s.deltaV,rcs),rcsEnabled,sasEnabled};
  }
  return {...dockedShip(def,s.deltaV,rcs),status:s.status,position:[...s.position],velocity:[...s.velocity],quaternion:[...s.quaternion],
   angularVelocity:[...s.angularVelocity],approach:s.approach,hold:s.hold?{position:[...s.hold.position],quaternion:[...s.hold.quaternion]}:null,
   rcsEnabled,sasEnabled,sasTarget:sasTarget?[...sasTarget]:null,attitudeMode,collisionReason,impact};
 });
 return {...session,elapsed:saved.elapsed,ships};
}
