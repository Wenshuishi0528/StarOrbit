import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Object3D,Quaternion,Vector3} from 'three';
import {snapshotFromState} from '../src/orbit.js';

const bundle=await build({entryPoints:['src/main-flight.js'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {installMainFlight}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const fields=new Map(),classes=new Set();
globalThis.document={activeElement:null,body:{classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}},
 getElementById:id=>{if(!fields.has(id))fields.set(id,{value:'',textContent:''});return fields.get(id);},addEventListener(){}};
globalThis.window={addEventListener(){}};
const epoch=Date.UTC(2026,10,6),reference=snapshotFromState({position:[6778,0,0],velocity:[0,7.668,0]},epoch);
const modelRoot=new Object3D(),body=new Object3D();modelRoot.add(body);
let offset=[30,0,0],external=false;
const sim={missionId:'tiangong',time:epoch,current:reference,speed:1,mode:'custom',paused:false,view:'follow',center:new Vector3(),
 capabilities:{manualAttitude:true,assembly:true},api:{modelRoot,groups:{freeXT:{visible:true}},state:{showXT:true},toast(){},fit(){}},
 missions:{state:{rotation:{enabled:false},pose:{roll:0,pitch:0,yaw:0}},bodyRoot:()=>body,syncUI(){},updateRotation(){body.quaternion.identity();}},
 xuntian:{optics:{axes:{forward:[0,1,0],right:[0,0,-1],up:[1,0,0]}},
  formation:{getOffset:()=>[...offset],setOffset:value=>({offset:offset=[...value]}),subscribe(){}},
  setPilotAxes(axes){this.optics.axes=axes;external=false;},clearPilot(){external=true;},beginExternalSteering(){sim.mainFlight.endAttitudeControl('xuntian');}},
 timeUI(){},rebuild(){}};
const flight=sim.mainFlight=installMainFlight(sim);
const tick=()=>{sim.time+=40;sim.current=flight.update({...reference,t:sim.time},sim.time-epoch);};
const coast=count=>{for(let i=0;i<count;i++)tick();};
const close=(a,b,tol=1e-10)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);

flight.update(reference,0);flight.action('sas');
flight.command({rotation:[0,1,0]});flight.command({});tick();
assert(flight.state.angularSpeed>.1,'a brief input must reach the actual main controller');
const tapRate=flight.state.angularSpeed;coast(5);close(flight.state.angularSpeed,tapRate);
flight.command({rotation:[0,1,0]});coast(5);flight.command({});
const beforeTemporary=flight.state.angularSpeed;
flight.command({temporarySas:true});tick();
assert.equal(flight.state.sas,false);assert.equal(flight.state.effectiveSas,true);
assert(flight.state.angularSpeed>0&&flight.state.angularSpeed<beforeTemporary,'F must brake finitely when stored SAS is off');
const temporaryRate=flight.state.angularSpeed;flight.command({});coast(4);
close(flight.state.angularSpeed,temporaryRate);
flight.action('sas');assert.equal(flight.state.sas,true);
flight.command({temporarySas:true});coast(5);
assert.equal(flight.state.effectiveSas,false);close(flight.state.angularSpeed,temporaryRate);
flight.command({});tick();
assert.equal(flight.state.sas,true);assert.equal(flight.state.effectiveSas,true);
assert(flight.state.angularSpeed>0&&flight.state.angularSpeed<temporaryRate,'releasing F restores finite SAS braking');
flight.action('sas');const stationRate=flight.state.angularSpeed;
flight.selectTarget('xuntian');flight.action('sas');
flight.command({rotation:[0,0,1]});flight.command({});tick();
assert(flight.state.angularSpeed>.1);const telescopeRate=flight.state.angularSpeed;
flight.selectTarget('mission');coast(5);close(flight.state.angularSpeed,stationRate);
flight.selectTarget('xuntian');close(flight.state.angularSpeed,telescopeRate);
const oldStation=body.quaternion.clone(),oldOrigin=modelRoot.position.clone();
flight.action('rcs');flight.command({translation:[1,0,0]});coast(4);flight.command({});
assert(flight.state.speed>.01);assert.deepEqual(modelRoot.position.toArray(),oldOrigin.toArray(),'telescope thrust moved the station root');
assert(body.quaternion.angleTo(oldStation)>0,'switching control froze the unselected station inertia');
const drifting=flight.state.speed;
flight.endAttitudeControl('xuntian');coast(3);
assert(flight.state.speed>drifting*.9,'finder attitude handoff erased independent translation');
assert.equal(flight.state.phase,'external');
flight.command({rotation:[1,0,0]});flight.action('pause');const elapsed=flight.state.translation.elapsed;
coast(4);assert.equal(flight.state.translation.elapsed,elapsed,'paused flight integrated physics');
flight.action('pause');tick();
assert.equal(flight.state.angularSpeed,0,'a queued press survived pause/resume');
flight.command({rotation:[0,0,1]});flight.command({});flight.selectTarget('mission');tick();
flight.selectTarget('xuntian');assert.equal(flight.state.angularSpeed,0,'switching craft retained a pending command');

// Orbit invalidation can precede the telescope's own update by one frame.
// Its cached optics and model remain visible, but must not dereference null q.
assert.equal(flight.update(null,1000),null);
assert.equal(flight.active,false);assert.equal(classes.has('main-flight-active'),false);
assert.equal(modelRoot.position.length(),0);assert.equal(external,true);
assert.deepEqual(sim.missions.state.pose,{roll:0,pitch:0,yaw:0});

// Direction modes are actual finite-torque flight controls, independent for
// the two bodies. Companion targets use both bodies' effective positions.
{
 sim.time=epoch;sim.current=reference;offset=[100,40,25];flight.update(reference,0);flight.selectTarget('mission');
 assert.equal(flight.attitudeModes.length,9);assert(flight.attitudeModes.every(mode=>mode.available));
 assert.equal(flight.state.attitudeTarget.id,'xuntian');
 const before=body.quaternion.clone();
 assert.equal(flight.action('attitude:radial-in'),true);assert.equal(flight.state.sas,true);
 assert(body.quaternion.equals(before),'choosing a direction must not teleport attitude');
 tick();assert(flight.state.angularSpeed>0&&flight.state.angularSpeed<=.12+1e-10);
 flight.selectTarget('xuntian');assert.equal(flight.state.attitudeTarget.id,'mission');
 assert.equal(flight.action('attitude:target'),true);assert.equal(external,false,'SAS selection must take direction ownership back from the finder');
 coast(1000);
 const forward=()=>new Vector3(1,0,0).applyQuaternion(new Quaternion(...flight.state.quaternion));
 const toward=()=>new Vector3(...reference.position).sub(new Vector3(...flight.navigation.q.position)).normalize();
 assert(forward().dot(toward())>.99999,'telescope nose must face the physical station position');
 const firstTarget=toward();
 flight.selectTarget('mission');assert.equal(flight.state.attitudeMode,'radial-in');
 assert(forward().dot(new Vector3(-1,0,0))>.99999,'unselected station must continue its own radial mode');
 flight.action('rcs');flight.command({translation:[1,0,0]});coast(250);flight.command({});coast(300);
 const stationPosition=new Vector3(...flight.navigation.q.position);
 flight.selectTarget('xuntian');
 const movingTarget=stationPosition.sub(new Vector3(...flight.navigation.q.position)).normalize();
 assert(firstTarget.distanceTo(movingTarget)>.02,'station thrust must materially change the line of sight');
 assert(forward().dot(movingTarget)>.9999,'unselected telescope must track the moved station, not its reference orbit origin');
 assert.equal(flight.state.attitudeMode,'target');
 flight.command({temporarySas:true});tick();assert.equal(flight.state.attitudeMode,'target');assert.equal(flight.state.effectiveSas,false);
 flight.command({});tick();assert.equal(flight.state.effectiveSas,true);
 flight.command({rotation:[0,0,1]});assert.equal(flight.state.attitudeMode,'inertial');tick();flight.command({});
 flight.action('attitude:anti-target');flight.action('sas');assert.equal(flight.state.attitudeMode,'inertial');assert.equal(flight.state.sas,false);
 flight.action('attitude:target');sim.xuntian.beginExternalSteering();tick();
 assert.equal(flight.state.attitudeMode,'inertial');assert.equal(flight.state.phase,'external');
 flight.action('attitude:target');assert.equal(flight.state.attitudeMode,'target');tick();assert.notEqual(flight.state.phase,'external');
 flight.selectTarget('mission');flight.action('attitude:target');tick();flight.action('pause');
 const beforeTargetLoss=[...flight.state.quaternion];
 sim.api.state.showXT=false;tick();
 assert.equal(flight.state.attitudeMode,'inertial','unavailable companion falls back to inertial stabilization');
 assert.deepEqual(flight.state.quaternion,beforeTargetLoss,'paused target loss cannot advance or teleport attitude');
 assert.equal(flight.state.attitudeTarget,null);assert(flight.attitudeModes.filter(mode=>mode.id.includes('target')).every(mode=>!mode.available&&mode.reason));
 assert.equal(flight.action('attitude:target'),false);flight.stop();
}

// A second pointing action on an already paused run must actually resume the
// maneuver, just as the first action does. Retrograde is a 180-degree turn,
// so verify both finite initial acceleration and eventual reversed heading.
{
 sim.missionId='tiangong';sim.capabilities.assembly=true;sim.api.state.showXT=true;
 sim.time=epoch;sim.current=reference;flight.update(reference,0);flight.selectTarget('mission');
 flight.action('attitude:prograde');coast(900);
 assert(flight.state.pointingError<.01);
 flight.action('pause');assert(sim.paused);
 const initial=[...flight.state.quaternion];
 assert.equal(flight.action('attitude:retrograde'),true);
 assert.equal(sim.paused,false,'choosing retrograde resumes an existing paused maneuver');
 assert.deepEqual(flight.state.quaternion,initial,'resuming a turn must not teleport attitude');
 assert(flight.state.pointingError>179.9);
 const impulse=(flight.state.rcs?4.5:3)*.04;
 tick();assert(flight.state.angularSpeed>0&&flight.state.angularSpeed<=impulse+.00001);
 coast(650);assert(flight.state.pointingError<.01,'retrograde must converge after the full reversal');
 const forward=new Vector3(1,0,0).applyQuaternion(new Quaternion(...flight.state.quaternion));
 const dirs=flight.navigation.attitudeDirections;
 assert(forward.dot(new Vector3(...dirs.retrograde))>.99999);
 assert(new Vector3(...dirs.prograde).dot(new Vector3(...dirs.retrograde))<-.999999);
 assert(new Vector3(...dirs['radial-out']).dot(new Vector3(...dirs['radial-in']))<-.999999);
 assert(new Vector3(...dirs.normal).dot(new Vector3(...dirs['anti-normal']))<-.999999);
 assert(dirs.target&&dirs['anti-target']);
 flight.stop();
 // A faster unassisted spin is braked with the existing actuator budget, not
 // instantly clipped to SAS's 12 deg/s rate, then turned to the new demand.
 flight.action('sas');flight.command({rotation:[0,0,1]});coast(300);flight.command({});
 const fast=flight.state.angularSpeed;assert(fast>30);
 flight.action('attitude:retrograde');tick();
 assert(flight.state.angularSpeed>fast-impulse-.001,'engaging retrograde cannot erase angular momentum');
 coast(1800);assert(flight.state.pointingError<.01);
 flight.stop();
}

// Standalone spacecraft use their +Z nose and have no invented companion.
// A moving orbit continuously changes prograde; inertial hold must instead
// retain its captured world direction as the same orbit keeps advancing.
{
 sim.missionId='dfh1';sim.capabilities.assembly=false;sim.time=epoch;sim.current=reference;flight.update(reference,0);
 assert(flight.attitudeModes.filter(mode=>mode.id.includes('target')).every(mode=>!mode.available));
 assert.equal(flight.action('attitude:prograde'),true);
 const n=7.668/6778;
 const orbitalTick=()=>{
  sim.time+=40;const angle=(sim.time-epoch)/1000*n,c=Math.cos(angle),s=Math.sin(angle);
  const q=snapshotFromState({position:[6778*c,6778*s,0],velocity:[-7.668*s,7.668*c,0]},sim.time);
  sim.current=flight.update(q,sim.time-epoch);
 };
 for(let i=0;i<1200;i++)orbitalTick();
 const nose=()=>new Vector3(0,0,1).applyQuaternion(new Quaternion(...flight.state.quaternion));
 assert(nose().dot(new Vector3(...sim.current.velocity).normalize())>.99999,'standalone nose continuously tracks actual changing velocity');
 flight.action('attitude:inertial');for(let i=0;i<200;i++)orbitalTick();
 const held=new Quaternion(...flight.state.quaternion);
 for(let i=0;i<500;i++)orbitalTick();
 assert(held.angleTo(new Quaternion(...flight.state.quaternion))<1e-7,'inertial mode holds world attitude rather than following orbital axes');
 flight.stop();
}
console.log('Main controller: short taps, independent craft inertia/translation/directional SAS, moving physical targets and matching markers, paused retrograde restart, finite high-spin reversal, standalone prograde/inertial hold, finder handoff, pause/focus cancellation and orbit/target recovery passed.');
