import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {stepAttitudeDynamics} from '../src/attitude-dynamics.js';
import {pilotRotation,pilotTranslation} from '../src/pilot-controls.js';

const near=(a,b,tolerance=1e-10)=>assert(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const vectorNear=(a,b,tolerance=1e-10)=>a.forEach((value,i)=>near(value,b[i],tolerance));
const length=v=>Math.hypot(...v);
const q=value=>new Quaternion().fromArray(value);
const sameAttitude=(a,b,tolerance=1e-7)=>near(q(a).angleTo(q(b)),0,tolerance);
const zero=[0,0,0],identity=[0,0,0,1];
const initial=(angularVelocity=zero,quaternion=identity)=>({quaternion:[...quaternion],angularVelocity:[...angularVelocity],sasTarget:null});
const dt=.04;

// With no actuator command or SAS there is no hidden angular drag. A rotated
// initial body continues around its own local axis, independently of a camera.
const initialQ=new Quaternion().setFromAxisAngle(new Vector3(1,1,0).normalize(),.65);
let coast=initial([.08,-.11,.06],initialQ.toArray());
for(let i=0;i<250;i++)coast=stepAttitudeDynamics(coast,zero,{dt,sas:false});
vectorNear(coast.angularVelocity,[.08,-.11,.06]);
const coastAxis=new Vector3(.08,-.11,.06),coastAngle=coastAxis.length()*10;
const expected=initialQ.clone().multiply(new Quaternion().setFromAxisAngle(coastAxis.normalize(),coastAngle));
sameAttitude(coast.quaternion,expected.toArray());
assert.equal(coast.sasTarget,null);assert.equal(coast.phase,'coast');

// A key supplies angular acceleration, not a fixed per-keypress rotation.
// Splitting a constant-axis input into two half steps preserves its impulse
// and integrated angle, and doubling dt doubles the initial angular impulse.
const full=stepAttitudeDynamics(initial(),[1,0,0],{dt:.04,sas:false,acceleration:.3,maxRate:1});
let halves=stepAttitudeDynamics(initial(),[1,0,0],{dt:.02,sas:false,acceleration:.3,maxRate:1});
const halfRate=halves.angularVelocity[0];
halves=stepAttitudeDynamics(halves,[1,0,0],{dt:.02,sas:false,acceleration:.3,maxRate:1});
near(full.angularVelocity[0],.012);near(full.angularVelocity[0],2*halfRate);
vectorNear(halves.angularVelocity,full.angularVelocity);sameAttitude(halves.quaternion,full.quaternion);
sameAttitude(full.quaternion,new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.5*.3*.04**2).toArray());
const diagonal=stepAttitudeDynamics(initial(),[1,1,1],{dt,sas:false,acceleration:.3,maxRate:1});
near(length(diagonal.angularVelocity),.3*dt);

// Unassisted torque keeps increasing even an inherited spin above the SAS
// rate setting. Reverse thrust subtracts angular momentum at the same rate.
const highSpin=stepAttitudeDynamics(initial([0,0,2]),[0,0,1],{dt,sas:false,acceleration:.1,maxRate:.35});
near(length(highSpin.angularVelocity),2+.1*dt);
const opposite=stepAttitudeDynamics(initial([0,0,2]),[0,0,-1],{dt,sas:false,acceleration:.1,maxRate:.35});
near(opposite.angularVelocity[2],2-.1*dt);

// Long holds pass the old rate cap, release coasts, and continued opposite
// torque first brakes and then spins the other way. Only actuator output is
// limited. SAS can still regulate its own commands and brake a faster spin.
{
 const acceleration=.3,maxRate=.35,options={dt,sas:false,acceleration,maxRate};
 let unassisted=initial();
 for(let i=0;i<500;i++)unassisted=stepAttitudeDynamics(unassisted,[0,0,1],options);
 near(unassisted.angularVelocity[2],6);assert(length(unassisted.angularVelocity)>10*maxRate);
 for(let i=0;i<100;i++)unassisted=stepAttitudeDynamics(unassisted,zero,options);
 near(unassisted.angularVelocity[2],6);
 const assistedBrake=stepAttitudeDynamics(unassisted,zero,{...options,sas:true});
 near(assistedBrake.angularVelocity[2],6-acceleration*dt);
 assert(assistedBrake.angularVelocity[2]>maxRate,'SAS does not instantly clip high spin to its command setting');
 for(let i=0;i<600;i++)unassisted=stepAttitudeDynamics(unassisted,[0,0,-1],options);
 near(unassisted.angularVelocity[2],-1.2);
 let assisted=initial();
 for(let i=0;i<500;i++)assisted=stepAttitudeDynamics(assisted,[0,0,1],{...options,sas:true});
 near(assisted.angularVelocity[2],maxRate);
 const inherited=stepAttitudeDynamics(initial([0,0,2]),[0,0,1],{...options,sas:true});
 near(inherited.angularVelocity[2],2);
}

// SAS first brakes with bounded torque, captures the attitude actually reached
// after braking, and then holds that inertial direction without snapping back.
let settled=initial([0,.2,0]);
const firstBrake=stepAttitudeDynamics(settled,zero,{dt,sas:true,acceleration:.1,maxRate:1});
near(firstBrake.angularVelocity[1],.2-.1*dt);
assert(length(firstBrake.angularVelocity)>0);assert.equal(firstBrake.sasTarget,null);assert.equal(firstBrake.phase,'braking');
for(let i=0;i<200;i++)settled=stepAttitudeDynamics(settled,zero,{dt,sas:true,acceleration:.1,maxRate:1});
vectorNear(settled.angularVelocity,zero);assert.equal(settled.phase,'hold');assert(settled.sasTarget);
sameAttitude(settled.quaternion,new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.2**2/(2*.1)).toArray());
const held=[...settled.quaternion];
for(let i=0;i<500;i++)settled=stepAttitudeDynamics(settled,zero,{dt,sas:true,acceleration:.1,maxRate:1});
sameAttitude(settled.quaternion,held);sameAttitude(settled.sasTarget,held);

// A pilot overrides an old SAS heading. Releasing the key brakes and captures
// a new heading; it must not turn the craft back toward the pre-input target.
let redirected={...initial(),sasTarget:[...identity]};
for(let i=0;i<25;i++)redirected=stepAttitudeDynamics(redirected,[0,0,1],{dt,sas:true,acceleration:.2,maxRate:1});
assert.equal(redirected.phase,'manual');assert.equal(redirected.sasTarget,null);near(redirected.angularVelocity[2],.2);
const releasedAt=[...redirected.quaternion];
for(let i=0;i<100;i++)redirected=stepAttitudeDynamics(redirected,zero,{dt,sas:true,acceleration:.2,maxRate:1});
assert.equal(redirected.phase,'hold');vectorNear(redirected.angularVelocity,zero);
sameAttitude(redirected.quaternion,new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.2).toArray());
assert(q(redirected.quaternion).angleTo(q(identity))>q(releasedAt).angleTo(q(identity)));
const releasedHold=[...redirected.quaternion];
for(let i=0;i<100;i++)redirected=stepAttitudeDynamics(redirected,zero,{dt,sas:true,acceleration:.2,maxRate:1});
sameAttitude(redirected.quaternion,releasedHold);
assert.equal(stepAttitudeDynamics(redirected,zero,{dt,sas:false}).sasTarget,null,'disabling SAS must release its heading');

// Precision mode is supplied as lower actuator acceleration/rate limits. Its
// early angular impulse is one fifth of normal, rather than a cosmetic label.
const ordinary=stepAttitudeDynamics(initial(),[0,1,0],{dt,sas:false,acceleration:.2,maxRate:.5});
const precise=stepAttitudeDynamics(initial(),[0,1,0],{dt,sas:false,acceleration:.04,maxRate:.1});
near(length(precise.angularVelocity),length(ordinary.angularVelocity)*.2);
assert(q(precise.quaternion).angleTo(q(identity))<q(ordinary.quaternion).angleTo(q(identity)));

// q and -q describe the same attitude. Around the ±180° branch, the shortest
// correction is +2°; changing either quaternion sign must not reverse thrust
// or command an almost-full revolution.
const almostPi=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),179*Math.PI/180).toArray();
const acrossPi=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-179*Math.PI/180).toArray();
const targetStep=stepAttitudeDynamics(initial(zero,almostPi),zero,{dt,sas:true,acceleration:.1,maxRate:1,target:acrossPi});
assert(targetStep.angularVelocity[2]>0);
for(const sign of [-1,1]){
 const other=stepAttitudeDynamics(initial(zero,almostPi.map(x=>-x)),zero,{dt,sas:true,acceleration:.1,maxRate:1,target:acrossPi.map(x=>x*sign)});
 vectorNear(other.angularVelocity,targetStep.angularVelocity);sameAttitude(other.quaternion,targetStep.quaternion);
}
let converging=initial(zero,almostPi);
for(let i=0;i<500;i++)converging=stepAttitudeDynamics(converging,zero,{dt,sas:true,acceleration:.1,maxRate:1,target:acrossPi});
sameAttitude(converging.quaternion,acrossPi,1e-6);assert(length(converging.angularVelocity)<1e-6);

// Normalization must survive prolonged multi-axis input and inherited rounding
// error in a saved quaternion. Check every intermediate output, not just last.
let normalized=initial([.12,.03,-.02],initialQ.toArray().map(x=>x*1.001));
for(let i=0;i<2000;i++){
 normalized=stepAttitudeDynamics(normalized,[Math.sin(i*.011),Math.cos(i*.017),Math.sin(i*.021)],{dt,sas:false,acceleration:.1,maxRate:.35});
 near(length(normalized.quaternion),1,5e-15);
 assert(normalized.quaternion.every(Number.isFinite));
}

// Pilot nose/right/up differ between the station and normalized satellites.
// Verify vectors and the physical effect of a small positive body rotation.
for(const assembly of [true,false]){
 const forward=new Vector3(...(assembly?[1,0,0]:[0,0,1]));
 const right=new Vector3(0,-1,0),up=new Vector3(...(assembly?[0,0,1]:[-1,0,0]));
 vectorNear(pilotTranslation([1,0,0],assembly),forward.toArray());
 vectorNear(pilotTranslation([0,1,0],assembly),right.toArray());
 vectorNear(pilotTranslation([0,0,1],assembly),up.toArray());
 const rotation=command=>new Quaternion().setFromAxisAngle(new Vector3(...pilotRotation(command,assembly)).normalize(),.01);
 assert(forward.clone().applyQuaternion(rotation({pitch:1})).dot(up)>0,'positive pitch raises the nose');
 assert(forward.clone().applyQuaternion(rotation({yaw:1})).dot(right)<0,'positive yaw points the nose left');
 assert(up.clone().applyQuaternion(rotation({roll:1})).dot(right)>0,'positive roll banks the top to pilot right');
}

console.log('Attitude dynamics: angular inertia, dt-scaled torque, bounded SAS braking/heading capture, manual override, precision, quaternion signs/normalization and pilot axes passed.');
