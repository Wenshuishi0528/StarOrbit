import assert from 'node:assert/strict';
import {snapshotFromState,norm} from '../src/orbit.js';
import {groundTrackAttitude} from '../src/attitude.js';
import {spacecraftAttitude} from '../src/spacecraft-attitude.js';
import {MAIN_FLIGHT_STEP,MAIN_FLIGHT_MAX_RANGE,createMainFlightTranslation,mainFlightFrame,
 mainFlightWorldToLocal,mainFlightLocalToWorld,mainFlightModelOffset,mainFlightSnapshot,
 stepMainFlightTranslation} from '../src/main-flight-physics.js';

const near=(a,b,tolerance=1e-9)=>assert(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const vectorNear=(a,b,tolerance=1e-9)=>a.forEach((value,i)=>near(value,b[i],tolerance));
const epoch=Date.UTC(2026,10,6),radius=6771,meanMotion=Math.sqrt(398600.4418/radius**3);
function referenceAt(seconds=0){
 const angle=seconds*meanMotion,c=Math.cos(angle),s=Math.sin(angle);
 return snapshotFromState({position:[radius*c,radius*s,0],velocity:[-radius*meanMotion*s,radius*meanMotion*c,0]},epoch+seconds*1000);
}
const reference=referenceAt(),frame=mainFlightFrame(reference);
vectorNear(frame.basis[0],[0,1,0]);vectorNear(frame.basis[1],[0,0,1]);vectorNear(frame.basis[2],[1,0,0]);
near(frame.angularRate,meanMotion);near(frame.meanMotion,meanMotion);
vectorNear(mainFlightWorldToLocal([2,3,4],frame),[3,4,2]);
vectorNear(mainFlightLocalToWorld([3,4,2],frame),[2,3,4]);

// A radial offset has tangential inertial velocity even when its LVLH
// derivative is zero. Omission of omega × offset gives the wrong orbit speed.
const radial={...createMainFlightTranslation(),position:[0,0,100]};
const shifted=mainFlightSnapshot(reference,radial);
vectorNear(shifted.position,[radius+.1,0,0]);
vectorNear(shifted.velocity,[0,radius*meanMotion+.1*meanMotion,0]);
near(shifted.altitude-reference.altitude,.1,1e-9);
const before=mainFlightSnapshot(referenceAt(-.01),radial),after=mainFlightSnapshot(referenceAt(.01),radial);
vectorNear(after.position.map((x,i)=>(x-before.position[i])/.02),shifted.velocity,1e-8);

// Both rotating-ground and normalized-satellite task frames differ from HCW.
// Model displacement and effective telemetry must nevertheless describe the
// exact same world-space metre vector, with no factor-of-1000/5 mismatch.
const inclined=snapshotFromState({position:[6771,0,0],velocity:[0,7.1,2.7]},epoch);
const offset={...createMainFlightTranslation(),position:[34,-12,87],velocity:[.13,-.06,.24]};
for(const task of [groundTrackAttitude(inclined),spacecraftAttitude(inclined)]){
 const expected=mainFlightLocalToWorld(offset.position,mainFlightFrame(task));
 const model=mainFlightModelOffset(task,offset);
 const reconstructed=mainFlightLocalToWorld(model.map(x=>x/5),{basis:task.basis});
 vectorNear(reconstructed,expected);
 const actual=mainFlightSnapshot(task,offset);
 vectorNear(actual.position.map((x,i)=>(x-task.position[i])*1000),expected,1e-8);
 assert.deepEqual(actual.basis,task.basis);
 assert.notEqual(actual.basis,task.basis,'effective snapshots must not alias mutable basis arrays');
}

// No thrust leaves the exact reference orbit unchanged. A manual impulse
// builds velocity; releasing RCS keeps it instead of damping it every frame.
let still=createMainFlightTranslation();
for(let i=0;i<100;i++)still=stepMainFlightTranslation(still,{},reference);
vectorNear(still.position,[0,0,0]);vectorNear(still.velocity,[0,0,0]);near(still.deltaV,0);near(still.elapsed,4);
let impulse=stepMainFlightTranslation(createMainFlightTranslation(),{worldAcceleration:[0,.08,0]},reference);
near(impulse.velocity[0],.08*MAIN_FLIGHT_STEP,1e-10);near(impulse.deltaV,.08*MAIN_FLIGHT_STEP);
const coast=stepMainFlightTranslation(impulse,{},reference);
assert(coast.position[0]>impulse.position[0]);assert(coast.velocity[0]>.999*impulse.velocity[0]);near(coast.deltaV,impulse.deltaV);
const disabled=stepMainFlightTranslation(createMainFlightTranslation(),{worldAcceleration:[0,100,0],acceleration:0},reference);
vectorNear(disabled.position,[0,0,0]);near(disabled.deltaV,0);

// Analytic HCW orbit-normal motion is harmonic. Compare a long unforced run
// with the closed form, rather than mirroring the numerical implementation.
let crossPlane={...createMainFlightTranslation(),position:[0,120,0],velocity:[0,.3,0]};
const duration=100;
for(let i=0;i<duration/MAIN_FLIGHT_STEP;i++)crossPlane=stepMainFlightTranslation(crossPlane,{},reference);
near(crossPlane.position[1],120*Math.cos(meanMotion*duration)+.3/meanMotion*Math.sin(meanMotion*duration),1e-7);
near(crossPlane.velocity[1],-120*meanMotion*Math.sin(meanMotion*duration)+.3*Math.cos(meanMotion*duration),1e-9);
near(crossPlane.deltaV,0);

// Explicit relative braking consumes bounded thrust and needs time. It does
// not teleport velocity to zero, and external switch state is not inferred.
let braking={...createMainFlightTranslation(),velocity:[1,.1,-.1]};
const first=stepMainFlightTranslation(braking,{brake:true,acceleration:.08},reference);
assert(norm(first.velocity)>.99);assert(norm(first.velocity)<norm(braking.velocity));
near(first.deltaV,.08*MAIN_FLIGHT_STEP);
for(let i=0;i<500;i++)braking=stepMainFlightTranslation(braking,{brake:true,acceleration:.08},reference);
assert(norm(braking.velocity)<.001);assert(braking.deltaV>.9&&braking.deltaV<1.2);
const out=stepMainFlightTranslation({...createMainFlightTranslation(),position:[MAIN_FLIGHT_MAX_RANGE+1,0,0]}, {},reference);
assert(out.outOfRange);assert(out.position[0]>MAIN_FLIGHT_MAX_RANGE,'controller owns range-limit response; physics must not teleport');

// Geometry still uses the instantaneous rate on an eccentric orbit, while
// the fixed-session HCW mean motion can deliberately be supplied separately.
const eccentric=snapshotFromState({position:[7000,0,0],velocity:[.8,7.8,0]},epoch);
const eccentricFrame=mainFlightFrame(eccentric);near(eccentricFrame.angularRate,7.8/7000);
assert(Math.abs(eccentricFrame.meanMotion-eccentricFrame.angularRate)>1e-5);
const eccentricMoved=mainFlightSnapshot(eccentric,radial);
near(eccentricMoved.velocity[1]-eccentric.velocity[1],.1*eccentricFrame.angularRate);
assert.throws(()=>mainFlightFrame({...reference,velocity:[1,0,0]}));
assert.throws(()=>stepMainFlightTranslation({...createMainFlightTranslation(),velocity:[NaN,0,0]}, {},reference));
assert.throws(()=>stepMainFlightTranslation(createMainFlightTranslation(),{meanMotion:-1},reference));
assert.throws(()=>mainFlightModelOffset(reference,radial,0));
console.log('Main-flight physics: metre/km/model units, independent LVLH/task bases, rotating-frame velocity, inertial coasting, bounded braking and analytic HCW motion passed.');
