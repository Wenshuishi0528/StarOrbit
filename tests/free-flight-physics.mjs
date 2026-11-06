import assert from 'node:assert/strict';
import {flightVessel} from '../src/free-flight-vessels.js';
import {Quaternion,Vector3} from 'three';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createFreeFlightAssembly} from '../src/free-flight-assembly.js';
import {FREE_FLIGHT_LIMITS,FREE_FLIGHT_RCS_DEFAULTS,FREE_FLIGHT_STEP,createFreeFlight,flightMetrics,releaseFreeFlight,
 restoreFreeFlight,setFlightApproach,setFlightAttitude,setFlightDockingLimits,setFlightHold,setFlightRcs,setFlightRcsEnabled,setFlightSas,stepFreeFlight} from '../src/free-flight-physics.js';

const near=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
const V=a=>new Vector3(...a);
function definition(id,type,axis,port){
 const q=new Quaternion().setFromUnitVectors(new Vector3(1,0,0),V(axis).normalize());
 return {id,type,portId:id.slice(5),quaternion:q.toArray(),port,position:V(port).addScaledVector(V(axis),4).toArray()};
}
const ids=['ship:TH_FORWARD','ship:TH_AFT','ship:TH/TH_LOWER'];
const defs=[definition(ids[0],'SZ',[1,0,0],[15,0,0]),definition(ids[1],'TZ',[-1,0,0],[-14,0,0]),
 definition(ids[2],'SZ',[0,0,-1],[2,0,-9])];
const fresh=()=>createFreeFlight(defs,{epoch:Date.UTC(2026,10,6)});
const steps=(s,count,input={},collides)=>{for(let i=0;i<count;i++)s=stepFreeFlight(s,input,collides);return s;};
function flyOut(){
 let s=fresh();
 for(const id of ids)s=releaseFreeFlight(s,id);
 return steps(s,310);
}
{
 const docked=fresh(),initial=JSON.stringify(docked);
 const released=releaseFreeFlight(docked,ids[1]);
 assert.equal(releaseFreeFlight(released,ids[1]),released,'a detached vessel cannot duplicate or receive a second impulse');
 assert.deepEqual(released.ships[1].position,docked.ships[1].position);near(released.ships[1].velocity[0],-.28);
 near(flightMetrics(released,ids[1]).distance,0);
 assert.equal(setFlightApproach(released,ids[1],true),released,'newly undocked port inhibits recapture');
 const coast=steps(released,50);
 near(coast.elapsed,2);assert.equal(coast.ships[1].status,'departing');assert(flightMetrics(coast,ids[1]).distance>.55);
 assert.equal(JSON.stringify(docked),initial,'simulation cannot mutate the starting snapshot');
}
{
 let session=flyOut();
 for(const ship of session.ships){
  assert.equal(ship.status,'free');assert(flightMetrics(session,ship.id).approachReady);
  session=setFlightApproach(session,ship.id,true);assert(session.ships.find(s=>s.id===ship.id).approach);
 }
 // Opposing ports and a radial port have different body attitudes in exactly
 // the same Hill frame. Every ship must keep flying while another is selected.
 session=steps(session,1500);
 assert(session.ships.every(s=>s.status==='docked'&&!s.approach&&s.deltaV>0));
 assert.equal(new Set(session.ships.map(s=>s.id)).size,3);
 for(const [i,id] of ids.entries()){
  near(flightMetrics(session,id).distance,0);assert.deepEqual(session.ships[i].quaternion,session.definitions[i].quaternion);
 }
 const reflight=releaseFreeFlight(session,ids[0]);
 assert.equal(reflight.ships.filter(s=>s.status==='docked').length,2);
}
{
 let s=flyOut();const coast=steps(s,50);
 s=steps(s,50,{id:ids[2],translation:[1,0,0]});
 assert(s.ships[2].position[2]>coast.ships[2].position[2]+.15,'forward thrust on the lower port points back toward the station');
 assert.deepEqual(s.ships[0],coast.ships[0],'control commands act only on their own vehicle');
 const free=s.ships[0],t=15,n=s.meanMotion;
 // Analytic free circular-Hill out-of-plane motion, independent of the integrator.
 const analytic=free.position[1]*Math.cos(n*t)+free.velocity[1]/n*Math.sin(n*t);
 const after=steps(s,t/FREE_FLIGHT_STEP);near(after.ships[0].position[1],analytic);
 assert(after.ships[0].velocity[0]>.27,'releasing the controls preserves relative drift');
 const braking=stepFreeFlight(s,{id:ids[0],brake:true});assert(braking.ships[0].velocity[0]>0);
 assert(braking.ships[0].velocity[0]<s.ships[0].velocity[0]);near(braking.ships[0].deltaV,.08*FREE_FLIGHT_STEP);
 const hold=setFlightHold(s,ids[0],true),held=steps(hold,1400).ships[0];
 assert(V(held.position).distanceTo(V(hold.ships[0].hold.position))<.015);assert(held.deltaV>.2);
 const overridden=stepFreeFlight(hold,{id:ids[0],rotation:[0,1,0]});
 assert.equal(overridden.ships[0].hold,null);
 let approaching=setFlightApproach(s,ids[0],true);
 assert(approaching.ships[0].approach);
 approaching=stepFreeFlight(approaching,{id:ids[0],translation:[0,1,0]});
 assert(!approaching.ships[0].approach,'manual input takes control from return guidance');
}
{
 const start=flyOut();
 const offset=structuredClone(start);
 offset.ships[0].position[1]+=15;
 assert(!flightMetrics(offset,ids[0]).approachReady);assert.equal(setFlightApproach(offset,ids[0],true),offset,'cannot auto-approach through the station from its side');
 const turning=structuredClone(start);
 turning.ships[0].angularVelocity=[0,0,.1];
 assert(flightMetrics(turning,ids[0]).speed>flightMetrics(start,ids[0]).speed+.15,'contact speed uses the turning port, not just the centre');
 const wrong=structuredClone(start);
 wrong.ships[0].position=[defs[0].position[0]+.36,0,0];wrong.ships[0].velocity=[-2,0,0];
 assert.equal(stepFreeFlight(wrong).ships[0].status,'collision','high-speed swept contact must not latch');
 const obstructed=stepFreeFlight(start,{},(before,after,def,ships)=>{
  assert.equal(ships.length,3);
  return def.id===ids[1]&&after.position[0]<before.position[0];
 });
 assert.equal(obstructed.ships[1].status,'collision');assert.deepEqual(obstructed.ships[1].position,start.ships[1].position);
}
{
 let s=setFlightHold(flyOut(),ids[1],true);
 s=steps(s,20,{id:ids[0],rotation:[0,0,1],translation:[0,1,0]});
 const restored=restoreFreeFlight(JSON.stringify(s),defs);
 assert.equal(JSON.stringify(restored),JSON.stringify(s));
 assert.equal(JSON.stringify(steps(restored,25)),JSON.stringify(steps(s,25)),'resume preserves controls, inertia and mission clock');
 assert.deepEqual(restoreFreeFlight(s,defs.toReversed()).ships.map(s=>s.id),ids.toReversed());
 const incompatible=structuredClone(defs);incompatible[0].position[1]+=.1;
 assert.throws(()=>restoreFreeFlight(s,incompatible));
 for(const mutate of [s=>s.ships.pop(),s=>s.ships[0].velocity=[null,2,3],s=>s.ships[0].quaternion=[0,0,0,2],
   s=>s.ships[0].position[0]=1e308,s=>s.ships[0].status='docked',s=>s.version=2,s=>delete s.meanMotion]){
  const damaged=structuredClone(s);mutate(damaged);assert.throws(()=>restoreFreeFlight(damaged,defs));
 }
}
{
 let s=flyOut(),id=ids[0];
 const original=structuredClone(s);
 s=setFlightRcs(s,id,{acceleration:.16,angularAcceleration:1,maxAngularRate:4});
 const pushed=stepFreeFlight(s,{id,translation:[0,1,0]});
 near(pushed.ships[0].deltaV-s.ships[0].deltaV,.16*FREE_FLIGHT_STEP);
 assert.deepEqual(s.ships[1].rcs,FREE_FLIGHT_RCS_DEFAULTS,'RCS edits are per vessel');
 assert.deepEqual(original.ships[0].rcs,FREE_FLIGHT_RCS_DEFAULTS,'RCS editing cannot mutate old snapshots');
 const fine=stepFreeFlight(s,{id,translation:[0,1,0],fine:true});
 near(fine.ships[0].deltaV-s.ships[0].deltaV,.16*.2*FREE_FLIGHT_STEP);
 const fullTurn=stepFreeFlight(s,{id,rotation:[0,1,0]});
 const fineTurn=stepFreeFlight(s,{id,rotation:[0,1,0],fine:true});
 near(fineTurn.ships[0].angularVelocity[1]-s.ships[0].angularVelocity[1],(fullTurn.ships[0].angularVelocity[1]-s.ships[0].angularVelocity[1])*.2,1e-12,'fine angular acceleration is 20%');
 s=setFlightRcs(s,id,{acceleration:100});near(s.ships[0].rcs.acceleration,1);
 s=setFlightRcs(s,id,null);assert.deepEqual(s.ships[0].rcs,FREE_FLIGHT_RCS_DEFAULTS);
 assert.throws(()=>setFlightRcs(s,id,{angularAcceleration:NaN}));
 const loaded=restoreFreeFlight(s);assert.deepEqual(loaded.ships[0].rcs,s.ships[0].rcs);
 const oldSave=structuredClone(s);
 for(const ship of oldSave.ships)for(const key of ['rcs','attitudeMode','collisionReason','impact'])delete ship[key];
 delete oldSave.dockingLimits;
 assert.deepEqual(restoreFreeFlight(oldSave).ships[0].rcs,FREE_FLIGHT_RCS_DEFAULTS,'v1.07 saves receive the original controls');
 assert.deepEqual(restoreFreeFlight(oldSave).dockingLimits,FREE_FLIGHT_LIMITS,'old saves receive default capture settings');
 for(const patch of [{acceleration:null},{maxAngularRate:100},{angularAcceleration:-1}]){
  const damaged=structuredClone(s);Object.assign(damaged.ships[0].rcs,patch);assert.throws(()=>restoreFreeFlight(damaged));
 }
 // Target attitude changes take finite time and use configured torque. The
 // manual translation path must leave an attitude-only assist in operation.
 s.ships[0].position=[100,100,0];
 s=setFlightAttitude(s,id,'target');
 const turned=stepFreeFlight(s,{id,translation:[0,1,0]});
 assert.equal(turned.ships[0].attitudeMode,'target');
 assert(V(turned.ships[0].angularVelocity).distanceTo(V(s.ships[0].angularVelocity))<=3*Math.PI/180*FREE_FLIGHT_STEP+1e-12);
 assert(new Quaternion(...turned.ships[0].quaternion).angleTo(new Quaternion(...s.ships[0].quaternion))<.001);
 const taken=stepFreeFlight(turned,{id,rotation:[0,0,1]});assert.equal(taken.ships[0].attitudeMode,'off');
 s=setFlightAttitude(turned,id,'port');
 const settled=steps(s,500,{}).ships[0];
 assert(new Quaternion(...settled.quaternion).angleTo(new Quaternion(...defs[0].quaternion))<1e-5);
 s=setFlightRcs(s,id,{angularAcceleration:.1,maxAngularRate:30});
 s.ships[0].quaternion=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2).toArray();
 const gentle=steps(s,2500,{}).ships[0];
 assert(new Quaternion(...gentle.quaternion).angleTo(new Quaternion(...defs[0].quaternion))<.01,'weak torque guidance must decelerate before overshooting');
 const tuned=setFlightDockingLimits(s,{captureLateral:.5,captureAngle:6,captureSpeed:.25,captureLateralSpeed:.1,captureAngularSpeed:Math.PI/180});
 assert.deepEqual(restoreFreeFlight(tuned).dockingLimits,tuned.dockingLimits);
 assert.deepEqual(s.dockingLimits,FREE_FLIGHT_LIMITS,'a new session cannot inherit another mission’s capture preferences');
 assert.deepEqual(setFlightDockingLimits(tuned,null).dockingLimits,FREE_FLIGHT_LIMITS);
 assert.throws(()=>restoreFreeFlight({...tuned,dockingLimits:{...tuned.dockingLimits,captureLateral:Infinity}}));
 assert.throws(()=>restoreFreeFlight({...tuned,dockingLimits:{...tuned.dockingLimits,captureSpeed:null}}));
 assert.throws(()=>restoreFreeFlight({...tuned,dockingLimits:{...tuned.dockingLimits,capturePlane:40}}));
}
{
 // RCS enables actuators; it never erases existing translation or angular
 // momentum. SAS is an independent inertial attitude controller.
 const id=ids[0],frame=(s)=>new Quaternion().setFromAxisAngle(new Vector3(0,1,0),s.meanMotion*s.elapsed);
 const inertialAttitude=s=>frame(s).multiply(new Quaternion(...s.ships[0].quaternion));
 const inertialRate=s=>V(s.ships[0].angularVelocity).add(new Vector3(0,s.meanMotion,0).applyQuaternion(new Quaternion(...s.ships[0].quaternion).invert()));
 let s=flyOut();
 s=setFlightHold(s,id,true);assert(s.ships[0].hold);
 s=setFlightRcsEnabled(s,id,false);
 assert(!s.ships[0].hold&&!s.ships[0].approach);
 assert(!flightMetrics(s,id).approachReady);
 assert.equal(setFlightHold(s,id,true),s);
 assert.equal(setFlightApproach(s,id,true),s);
 const aimed=setFlightAttitude(s,id,'target'),aimedThrust=stepFreeFlight(aimed,{id,translation:[1,0,0]});
 assert.equal(aimedThrust.ships[0].attitudeMode,'target','disabled translation cannot cancel attitude guidance');
 const offCoast=steps(s,25),offThrust=steps(s,25,{id,translation:[1,0,0],brake:true});
 assert.deepEqual(offThrust.ships[0],offCoast.ships[0],'disabled RCS cannot apply translation or braking thrust');
 assert(offThrust.ships[0].velocity[0]>.2,'RCS off retains linear momentum');
 s=setFlightSas(s,id,false);
 s=steps(s,20,{id,rotation:[0,0,1]});
 assert(inertialRate(s).length()>.01,'reaction wheels still rotate with RCS off');
 const spinning=s,coast=steps(spinning,80);
 near(inertialRate(coast).length(),inertialRate(spinning).length(),1e-12);
 assert(inertialAttitude(coast).angleTo(inertialAttitude(spinning))>.04,'SAS off preserves rotation after release');
 const switched=setFlightRcsEnabled(spinning,id,true),rcsOnly=steps(switched,80);
 near(inertialRate(rcsOnly).length(),inertialRate(spinning).length(),1e-12,'RCS enable is not angular braking');
 const temporary=stepFreeFlight(spinning,{id,temporarySas:true});
 assert.equal(temporary.ships[0].sasEnabled,false,'F must not toggle the saved SAS option');
 assert(inertialRate(temporary).length()>0&&inertialRate(temporary).length()<inertialRate(spinning).length(),'F applies finite braking torque');
 const releasedTemporary=steps(temporary,80,{id});
 near(inertialRate(releasedTemporary).length(),inertialRate(temporary).length(),1e-12);
 const otherTemporary=steps(spinning,80,{id:ids[1],temporarySas:true});
 near(inertialRate(otherTemporary).length(),inertialRate(spinning).length(),1e-12,'temporary SAS belongs only to the controlled vessel');
 const sasOn=setFlightSas(spinning,id,true),temporaryOff=steps(sasOn,80,{id,temporarySas:true});
 assert.equal(temporaryOff.ships[0].sasEnabled,true,'F must leave the enabled stored switch intact');
 near(inertialRate(temporaryOff).length(),inertialRate(sasOn).length(),1e-12);
 const resumedSas=stepFreeFlight(temporaryOff,{id});
 assert(inertialRate(resumedSas).length()>0&&inertialRate(resumedSas).length()<inertialRate(temporaryOff).length(),'releasing F restores finite braking when SAS was enabled');
 const guided=setFlightAttitude(sasOn,id,'port'),guidedTemporaryOff=steps(guided,10,{id,temporarySas:true});
 assert.equal(guidedTemporaryOff.ships[0].attitudeMode,'port','temporary release must not discard the chosen attitude target');
 near(inertialRate(guidedTemporaryOff).length(),inertialRate(guided).length(),1e-12,'an explicit attitude target must also yield to temporary SAS-off');
 let stable=setFlightSas(spinning,id,true);
 const startRate=inertialRate(stable).length();
 const first=stepFreeFlight(stable);assert(inertialRate(first).length()>0&&inertialRate(first).length()<startRate,'SAS braking has finite torque');
 stable=steps(stable,500);
 assert(inertialRate(stable).length()<1e-7);
 const later=steps(stable,250);
 assert(inertialAttitude(later).angleTo(inertialAttitude(stable))<1e-7,'SAS holds an inertial direction as LVLH rotates');
 assert(V(later.ships[0].velocity).length()>.2,'SAS cannot brake translation');
 const held=steps(stable,50,{id:ids[1]});
 assert(inertialRate(held).length()<1e-7,'unselected vessels retain their own SAS setting');
 const loaded=restoreFreeFlight(JSON.stringify(later));
 assert.deepEqual(loaded.ships[0],later.ships[0]);
 assert.equal(JSON.stringify(stepFreeFlight(loaded)),JSON.stringify(stepFreeFlight(later)),'SAS targets and RCS states resume continuously');
 const old=structuredClone(later);
 for(const ship of old.ships)for(const key of ['rcsEnabled','sasEnabled','sasTarget'])delete ship[key];
 assert.equal(restoreFreeFlight(old).ships[0].rcsEnabled,true);
 assert.equal(restoreFreeFlight(old).ships[0].sasEnabled,true);
 for(const patch of [{rcsEnabled:'off'},{sasEnabled:0},{sasTarget:[0,0,0,2]}]){
  const bad=structuredClone(later);Object.assign(bad.ships[0],patch);assert.throws(()=>restoreFreeFlight(bad));
 }
}
{
 // A real long manual burn passes both the assisted turn-rate setting and
 // the former 10 rad/s save rejection. LVLH storage must still recover the
 // same inertial spin, and neither enabling RCS nor loading may brake it.
 const id=ids[0],rate=s=>V(s.ships[0].angularVelocity).add(new Vector3(0,s.meanMotion,0).applyQuaternion(new Quaternion(...s.ships[0].quaternion).invert()));
 let s=releaseFreeFlight(fresh(),id);
 Object.assign(s.ships[0],{status:'free',position:[100,100,100],velocity:[0,0,0],quaternion:[0,0,0,1],angularVelocity:[0,0,0]});
 s=setFlightRcs(s,id,{angularAcceleration:15,maxAngularRate:6});s=setFlightSas(s,id,false);
 const acceleration=15*Math.PI/180,initialRate=rate(s).y;
 s=steps(s,1000,{id,rotation:[0,1,0]});
 near(rate(s).y,initialRate+acceleration*1000*FREE_FLIGHT_STEP,1e-10);
 assert(s.ships[0].angularVelocity[1]>10,'unassisted input can exceed the former storage cap');
 const released=steps(s,100,{id});near(rate(released).y,rate(s).y,1e-10);
 const opposing=steps(released,1500,{id,rotation:[0,-1,0]});
 near(rate(opposing).y,initialRate-acceleration*500*FREE_FLIGHT_STEP,1e-10);
 assert(rate(opposing).y<0,'reverse torque brakes and then reverses the spin');
 const assisted=stepFreeFlight(setFlightSas(s,id,true),{id});
 near(rate(assisted).y,rate(s).y-acceleration*FREE_FLIGHT_STEP,1e-10);
 assert(rate(assisted).y>10,'enabling SAS cannot clip high spin to the assisted rate');
 const loaded=restoreFreeFlight(JSON.stringify(s));assert.equal(JSON.stringify(loaded),JSON.stringify(s));
 assert.equal(JSON.stringify(steps(loaded,10,{id})),JSON.stringify(steps(s,10,{id})),'high-spin save restores continuous actual dynamics');
 // Velocity was never capped by integration, so the file loader must not
 // introduce a separate 1e6 m/s gameplay ceiling either.
 const fast=structuredClone(s);fast.ships[0].velocity=[2e6,-3e6,1.5e6];
 const restoredFast=restoreFreeFlight(JSON.stringify(fast));assert.deepEqual(restoredFast.ships[0].velocity,fast.ships[0].velocity);
 assert.equal(JSON.stringify(stepFreeFlight(restoredFast)),JSON.stringify(stepFreeFlight(fast)));
 for(const key of ['velocity','angularVelocity'])for(const value of [NaN,Infinity,1e308]){
  const bad=structuredClone(s);bad.ships[0][key][0]=value;assert.throws(()=>restoreFreeFlight(bad),'non-finite or overflowing motion is not a valid save');
 }
}
{
 // Use the real collars and wing boxes. If an adapter loses its host identity
 // the two ships collide on the very first release tick at their own collars.
 const data=readFileSync(new URL('../assets/station.glb',import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
 const templates=Object.fromEntries(['TH','WT','MT','SZ','TZ','XT'].map(t=>[t,gltf.scene.getObjectByName('module_'+t)]));
 const meta=JSON.parse(readFileSync(new URL('../assets/model.json',import.meta.url),'utf8'));
 const assembly=createFreeFlightAssembly(templates,meta,{slots:{TH_WENTIAN:'WT',TH_MENGTIAN:'MT',TH_FORWARD:'SZ',TH_AFT:'TZ'}});
 const arrival=(def,{lateral=.12,angle=2,speed=.18,spin=0,axial=.36,axis=2}={})=>{
  const session=createFreeFlight(assembly.definitions),ship=session.ships.find(body=>body.id===def.id);
  const target=new Quaternion(...def.quaternion),orientation=target.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3().setComponent(axis,1),angle*Math.PI/180));
  const arm=V(def.port).sub(V(def.position)).applyQuaternion(target.clone().invert()).applyQuaternion(orientation);
  ship.status='free';ship.sasEnabled=false;ship.quaternion=orientation.toArray();
  ship.position=V(def.port).add(new Vector3(axial,lateral,0).applyQuaternion(target)).sub(arm).toArray();
  ship.velocity=new Vector3(-speed,0,0).applyQuaternion(target).toArray();ship.angularVelocity=[spin,0,0];
  return session;
 };
 for(const def of assembly.definitions){
  const start=arrival(def),m=flightMetrics(start,def.id);
  assert(m.captureReady);near(m.offsetPort[0],.36);near(m.offsetPort[1],.12);near(m.attitudeError[2],2);
  const result=steps(start,5,{},assembly.collides),captured=result.ships.find(ship=>ship.id===def.id);
  assert.equal(captured.status,'docked',def.type+' captures a real offset and non-zero angle at safe speed');
  for(const [patch,reason] of [[{speed:.23},'speed'],[{angle:4},'angle'],[{spin:1*Math.PI/180},'angularSpeed']]){
   const invalid=steps(arrival(def,patch),5,{},assembly.collides),hit=invalid.ships.find(ship=>ship.id===def.id);
   assert.equal(hit.status,'collision');assert.equal(hit.collisionReason,reason);
   assert(hit.impact&&hit.impact.speed>0,'capture refusal retains actual contact values after motion stops');
   assert.equal(flightMetrics(invalid,def.id).captureChecks[reason],false,'stopped impact must not turn the failed gate green');
   assert(!flightMetrics(invalid,def.id).captureReady);
   assert.deepEqual(restoreFreeFlight(invalid).ships.find(ship=>ship.id===def.id),hit);
  }
  const outside=arrival(def,{lateral:FREE_FLIGHT_LIMITS.captureLateral+.01});
  assert(!flightMetrics(outside,def.id).captureChecks.lateral,'outside the capture ring is not green');
  for(const axis of [0,1,2]){
   const offAxis=arrival(def,{lateral:.49,angle:5.9,axis,axial:2,speed:.08});
   const relaxed=setFlightDockingLimits(offAxis,{captureLateral:.5,captureAngle:6});
   assert(flightMetrics(relaxed,def.id).captureReady);
   const caught=steps(relaxed,1000,{},assembly.collides).ships.find(ship=>ship.id===def.id);
   assert.equal(caught.status,'docked',def.type+' real collars must honor the selected .5 m / 6 degree envelope');
   const strict=steps(setFlightDockingLimits(offAxis,{captureLateral:.1,captureAngle:1}),1000,{},assembly.collides).ships.find(ship=>ship.id===def.id);
   assert.equal(strict.status,'collision','the same approach must fail a stricter selected envelope');
  }
  // The assistance must obey the chosen capture envelope, including the
  // strictest settings and a deliberately weak RCS. It may take longer, but
  // never snaps attitude, changes poses directly or drives through the gates.
  for(const limits of [FREE_FLIGHT_LIMITS,{captureLateral:.05,captureAngle:.5,captureSpeed:.02,captureLateralSpeed:.005,captureAngularSpeed:.05*Math.PI/180}]){
   for(const acceleration of [.08,.005]){
    let guided=setFlightDockingLimits(arrival(def,{axial:6,lateral:.15,angle:2,speed:.08}),limits);
    guided=setFlightRcs(guided,def.id,{acceleration,angularAcceleration:.1,maxAngularRate:.25});
    guided=setFlightApproach(guided,def.id,true);
    assert(guided.ships.find(ship=>ship.id===def.id).approach,'test arrival is in the clear approach corridor');
    let docked=false;
    for(let i=0;i<15000;i++){
     const old=guided.ships.find(ship=>ship.id===def.id);
     guided=stepFreeFlight(guided,{id:def.id,fine:true},assembly.collides);
     const ship=guided.ships.find(ship=>ship.id===def.id);
     assert.notEqual(ship.status,'collision',def.type+' assisted '+acceleration+' RCS rejected '+ship.collisionReason);
     assert(V(ship.velocity).distanceTo(V(old.velocity))<acceleration*FREE_FLIGHT_STEP+.0001||ship.status==='docked','guidance is finite acceleration');
     if(ship.status==='docked'){docked=true;break;}
    }
    assert(docked,def.type+' assistance must eventually capture using the selected tight envelope');
   }
  }
 }
 let s=createFreeFlight(assembly.definitions);
 for(const ship of s.ships)s=releaseFreeFlight(s,ship.id);
 for(let i=0;i<1600&&!s.ships.every(ship=>ship.status==='docked');i++){
  s=stepFreeFlight(s,{},assembly.collides);
  for(const ship of s.ships){
   assert.notEqual(ship.status,'collision',ship.id+' must clear its own collar and return');
   if(ship.status==='free'&&!ship.approach)s=setFlightApproach(s,ship.id,true);
  }
 }
 assert.deepEqual(s.ships.map(ship=>[ship.type,ship.status]),[['SZ','docked'],['TZ','docked']]);
 // Exercise the manual thrust path around both sides of the real station,
 // including a return from outside the guidance corridor. The test pilot only
 // supplies body-frame translation inputs; it never changes the ship pose.
 const tz='ship:TH_AFT',home=assembly.definitions.find(d=>d.id===tz);
 s=releaseFreeFlight(s,tz);
 // SAS inertial hold is distinct from keeping the rotating home interface
 // aligned. This translation-only pilot selects the port attitude aid.
 s=steps(s,310);s=setFlightAttitude(s,tz,'port');
 const out=new Vector3(1,0,0).applyQuaternion(new Quaternion().fromArray(home.quaternion));
 const ringPoint=(x,y)=>[x,y,home.position[2]];
 const nearPort=V(home.position).addScaledVector(out,8).toArray();
 for(const goal of [ringPoint(-65,0),ringPoint(-65,65),ringPoint(65,65),ringPoint(65,-65),
  ringPoint(-65,-65),ringPoint(-65,0),nearPort,home.position]){
  const landing=goal===home.position;
  let reached=false;
  for(let i=0;i<5000;i++){
   const ship=s.ships.find(body=>body.id===tz);
   assert.notEqual(ship.status,'collision','flyaround hit at '+ship.position+' on route to '+goal);
   if(landing&&ship.status==='docked'){reached=true;break;}
   const error=V(goal).sub(V(ship.position));
   if(!landing&&error.length()<.22&&V(ship.velocity).length()<.10){reached=true;break;}
   const speed=Math.min(landing?.075:2,Math.sqrt(.055*error.length()));
   const demand=error.multiplyScalar(.26).clampLength(0,speed).sub(V(ship.velocity))
    .multiplyScalar(.85).applyQuaternion(new Quaternion().fromArray(ship.quaternion).invert());
   const acceleration=flightVessel('TZ').acceleration;
   s=stepFreeFlight(s,{id:tz,translation:[-demand.x/acceleration,demand.y/acceleration,demand.z/acceleration]},assembly.collides);
  }
  assert.ok(reached,'manual thrusters must reach '+goal.join(','));
 }

}
console.log('Free flight: SZ/TZ separation and manual flyaround, finite guidance, non-zero capture tolerance and rejection reasons, per-vessel RCS/attitude control, saved-state migration and continuity passed.');
