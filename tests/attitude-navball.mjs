import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Quaternion,Vector3} from 'three';
import {groundTrackAttitude} from '../src/attitude.js';
import {spacecraftAttitude} from '../src/spacecraft-attitude.js';
import {snapshotFromState} from '../src/orbit.js';

const bundle=await build({entryPoints:['src/attitude-navball.js'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {deriveObservationNavball,observationNavballMarkers,NAVBALL_MODE_SYMBOLS}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const near=(a,b,epsilon=1e-8)=>assert(Math.abs(a-b)<epsilon,`${a} ≠ ${b}`);
const vectorNear=(a,b)=>a.forEach((v,i)=>near(v,b[i]));
const identity=[0,0,0,1],time=Date.UTC(2026,10,6);
const raw=snapshotFromState({position:[6778,0,0],velocity:[0,7.1,2.7]},time);

// Station front +X and top +Z should read level and along-track in a pure
// orbital frame; the observation camera is deliberately not an input.
const station=deriveObservationNavball(raw,identity,{assembly:true});
near(station.nav.heading,0);near(station.nav.pitch,0);near(station.nav.roll,0);
vectorNear(station.nav.forward,[1,0,0]);near(station.nav.speed,raw.speed*1000);
const cameraChanged={...raw,camera:{quaternion:[.5,.5,.5,.5],position:[999,43,-50]}};
assert.deepEqual(deriveObservationNavball(cameraChanged,identity),station);

// Task ground-track differs from inertial orbital along-track because Earth
// rotates. A fake ball using q.basis as its horizon would incorrectly say zero.
const ground=groundTrackAttitude(raw),track=deriveObservationNavball(ground,identity,{assembly:true});
assert(Math.abs(track.nav.heading)>1e-3);near(track.nav.pitch,0);near(track.nav.roll,0);
const yaw=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/6).toArray();
near(deriveObservationNavball(raw,yaw).nav.heading,30);
const bank=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/4).toArray();
near(deriveObservationNavball(raw,bank).nav.roll,-45);

// Standalone spacecraft normalization uses +Z forward and -X up. Its usual
// velocity-axis task frame and spin around body +Z must remain observable.
const satelliteFrame=spacecraftAttitude(raw),satellite=deriveObservationNavball(satelliteFrame,identity,{assembly:false});
near(satellite.nav.heading,0);near(satellite.nav.pitch,0);near(satellite.nav.roll,0);
const spin=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2).toArray();
const spinning=deriveObservationNavball(satelliteFrame,spin,{assembly:false});
near(spinning.nav.heading,0);near(spinning.nav.pitch,0);near(spinning.nav.roll,-90);

// Inertial-axis mode uses an old task frame, but the horizon is recalculated
// from the *current* orbit. It therefore changes as the craft moves around Earth.
const laterRaw=snapshotFromState({position:[0,6778,0],velocity:[-7.1,0,2.7]},time+1000000);
const inertial=deriveObservationNavball(spacecraftAttitude(laterRaw,raw),identity,{assembly:false});
assert(Math.abs(inertial.nav.pitch)>45,'inertial pointing must not stay artificially level');
const radialVelocity=snapshotFromState({position:[6778,0,0],velocity:[1,7.1,2.7]},time);
const climbing=deriveObservationNavball(spacecraftAttitude(radialVelocity),identity,{assembly:false});
near(climbing.nav.pitch,Math.atan2(1,Math.hypot(7.1,2.7))*180/Math.PI);
assert.equal(deriveObservationNavball(null,identity),null);
assert.equal(deriveObservationNavball({...raw,velocity:[0,0,0]},identity),null);
assert.equal(deriveObservationNavball(raw,[0,0,0,0]),null);
console.log('Observation navball: real body axes, station ground-track, satellite spin, inertial pointing and camera independence passed.');

// Guidance vectors are inertial; their marker frame must match the actual
// orbital horizon even when task axes intentionally hold an old orientation.
const dirs={prograde:raw.velocity,retrograde:raw.velocity.map(v=>-v),
 'radial-out':raw.position,'radial-in':raw.position.map(v=>-v),
 normal:new Vector3(...raw.position).cross(new Vector3(...raw.velocity)).toArray(),
 'anti-normal':new Vector3(...raw.position).cross(new Vector3(...raw.velocity)).negate().toArray(),
 target:[0,1,1],'anti-target':[0,-1,-1]};
const markers=observationNavballMarkers(dirs,station.orbitalBasis);
assert.equal(markers.length,8);assert.equal(new Set(markers.map(m=>m.id)).size,8);
const at=id=>markers.find(m=>m.id===id).direction;
vectorNear(at('prograde'),[1,0,0]);vectorNear(at('retrograde'),[-1,0,0]);
vectorNear(at('radial-out'),[0,0,1]);vectorNear(at('normal'),[0,1,0]);
for(const [positive,negative] of [['prograde','retrograde'],['radial-out','radial-in'],['normal','anti-normal'],['target','anti-target']])vectorNear(at(positive).map(v=>-v),at(negative));
assert.equal(observationNavballMarkers({target:[0,0,0],normal:[NaN,0,0]},station.orbitalBasis).length,0);
assert.equal(Object.keys(NAVBALL_MODE_SYMBOLS).length,9);
console.log('Observation markers: all eight inertial guidance directions share the ball frame; inverse pairs and invalid target suppression pass.');
