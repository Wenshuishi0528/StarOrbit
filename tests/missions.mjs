import {velocityAxisBasis,spacecraftAttitude,validateRotation,spinAngle,toggleSpin} from '../src/spacecraft-attitude.js';
import {createOrbitControls} from '../src/camera-controls.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {json2satrec} from 'satellite.js';
import {mission,missionLabel,spacecraft,bindOrbit,orbitState} from '../src/missions.js';
import {validateOrbit,snapshot,interpolate} from '../src/orbit.js';
import {validateGP,gpState,parseMissionOrbit} from '../src/gp-orbit.js';
import {normalizeSpacecraft,applyBodyPose} from '../src/spacecraft-model.js';
const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const station=read('../assets/orbit.json'),dfh=read('../assets/spacecraft/dfh1-orbit.json'),gp=read('../assets/spacecraft/dfh1-gp.json');
assert.equal(missionLabel('dfh1'),'地球：卫星：东方红一号');
assert.equal(missionLabel('tiangong'),'地球：空间站：中国空间站');
assert.equal(spacecraft('dfh1').capabilities.solarArrays,false);
assert.equal(mission('dfh1').center,'EARTH');assert.throws(()=>mission('__proto__'));
assert.equal(orbitState(null,Date.now()),'missing');assert.equal(orbitState(dfh,dfh.rows[0][0]-1),'ready');assert.equal(snapshot(null,Date.now()),null);
assert.throws(()=>bindOrbit({...station,missionId:'tiangong'},'dfh1'));
assert.throws(()=>bindOrbit({...dfh,center:'MOON'},'dfh1'));
assert.throws(()=>bindOrbit({...dfh,objectId:'2021-035A'},'dfh1'));
assert.throws(()=>validateOrbit({...station,center:'MOON'}));
for(const change of [{NORAD_CAT_ID:48274},{OBJECT_ID:'2021-035A'},{REF_FRAME:'EME2000'},{ECCENTRICITY:1},{EPOCH:'invalid'}])assert.throws(()=>validateGP([{...gp[0],...change}],'dfh1'));
const epochUTC=Date.parse(gp[0].EPOCH+'Z');
assert.deepEqual(gpState(json2satrec(validateGP([{...gp[0],EPOCH:gp[0].EPOCH+'Z'}],'dfh1')),epochUTC),gpState(json2satrec(validateGP(gp,'dfh1')),epochUTC),'OMM epoch with Z and without Z must be identical');
assert.equal(parseMissionOrbit(JSON.stringify(dfh),'dfh1').missionId,'dfh1');
assert.throws(()=>parseMissionOrbit(JSON.stringify(dfh),'tiangong'));
const shared=station.rows[Math.floor(station.rows.length/2)][0],a=snapshot(station,shared),b=snapshot(dfh,shared);
assert.ok(b&&Math.abs(a.altitude-b.altitude)>100,'Different mission ephemerides must not share the station orbit');
// Independent Skyfield J2000 reference, spanning the full ±3-day display window.
const reference=read('./reference/dfh1-skyfield.json');let maxPositionM=0,maxVelocityMps=0,maxInterpolationM=0;
for(const row of reference.samples){
 const state=gpState(json2satrec(reference.gp),row.time);
 maxPositionM=Math.max(maxPositionM,1000*Math.hypot(...state.position.map((x,i)=>x-row.position[i])));
 maxVelocityMps=Math.max(maxVelocityMps,1000*Math.hypot(...state.velocity.map((x,i)=>x-row.velocity[i])));
}
assert.ok(maxPositionM<10);assert.ok(maxVelocityMps<.02);
for(let i=5;i<dfh.rows.length-5;i+=317){const t=dfh.rows[i][0]+27000,p=interpolate(dfh.rows,t),q=gpState(json2satrec(gp[0]),t);maxInterpolationM=Math.max(maxInterpolationM,1000*Math.hypot(...p.position.map((x,k)=>x-q.position[k])));}
assert.ok(maxInterpolationM<1);
// Actual supplied GLB: inspect polar antenna and equatorial antennas after import.
const bytes=fs.readFileSync(new URL('../assets/spacecraft/dongfanghong1_v03_meters.glb',import.meta.url));
const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
const root=normalizeSpacecraft(scene,spacecraft('dfh1'));
const center=name=>new THREE.Box3().setFromObject(root.getObjectByName(name)).getCenter(new THREE.Vector3());
const top=center('顶部天线_400mm'),bottom=center('底部极区及短接口_不含展台');assert.ok(top.z>3&&bottom.z<0);assert.ok(Math.hypot(top.x,top.y)<1e-6);
for(let i=1;i<=4;i++)assert.ok(Math.abs(center(`长天线${i}_3000mm`).z)<.1);
for(const [pose,direction]of [[{roll:90,pitch:0,yaw:0},[0,-1,0]],[{roll:0,pitch:90,yaw:0},[1,0,0]],[{roll:0,pitch:0,yaw:90},[0,0,1]]]){
 applyBodyPose(root,pose);assert.ok(center('顶部天线_400mm').normalize().distanceTo(new THREE.Vector3(...direction))<1e-6);
}
applyBodyPose(root,{roll:30,pitch:45,yaw:60});
const expected=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/3).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/6));
assert.ok(root.quaternion.angleTo(expected)<1e-7);
console.log({missionIsolation:'pass',assetAxesAndAttitude:'pass',maxPositionM,maxVelocityMps,maxInterpolationM});

// Velocity-follow frame: the actual GLB polar axis must point prograde at all phases.
for(const row of reference.samples){
 const q={...row,sunDir:[1,0,0]},axes=velocityAxisBasis(q),basis=new THREE.Matrix4().makeBasis(...axes.map(a=>new THREE.Vector3(...a)));
 assert.ok(Math.abs(basis.determinant()-1)<1e-10);
 for(const spin of [0,.3,Math.PI/2,5.9]){
  applyBodyPose(root,{roll:0,pitch:0,yaw:0},spin);
  const pole=center('顶部天线_400mm').normalize().transformDirection(basis);
  assert.ok(pole.distanceTo(new THREE.Vector3(...row.velocity).normalize())<1e-8);
 }
 assert.deepEqual(spacecraftAttitude(q,reference.samples[0]).basis,velocityAxisBasis(reference.samples[0]));
}
const rotation=validateRotation({enabled:true},1000),rpm=120;
assert.ok(Math.abs(spinAngle(rotation,1125,rpm)-Math.PI/2)<1e-10);
assert.ok(Math.abs(spinAngle(rotation,1500,rpm))<1e-10);
const frozen=toggleSpin(rotation,false,1125,rpm);
assert.equal(spinAngle(frozen,999999,rpm),Math.PI/2);
const resumed=toggleSpin(frozen,true,9000,rpm);
assert.ok(Math.abs(spinAngle(resumed,9125,rpm)-Math.PI)<1e-10);
assert.equal(spinAngle(rotation,1125,rpm),spinAngle(rotation,1125,rpm));
for(const bad of [{mode:'unknown'},{phase:-1},{epoch:NaN},{enabled:'yes'},null,[]])assert.throws(()=>validateRotation(bad));
// One shared controls factory serves every model and restored camera orientation.
const camera=new THREE.PerspectiveCamera(),controls=createOrbitControls(camera,null);controls.enableDamping=false;
for(const up of [new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(.2,.7,.4).normalize(),new THREE.Vector3(0,0,1)]){
 camera.up.copy(up);camera.position.set(4,5,6);controls.update();const before=camera.position.clone().normalize().dot(up),distance=camera.position.length();
 controls._rotateLeft(.2);controls.update();assert.ok(Math.abs(camera.position.clone().normalize().dot(up)-before)<1e-10);assert.ok(Math.abs(camera.position.length()-distance)<1e-10);
}
console.log('Prograde polar axis, inertial reference, 120 rpm spin/freeze/resume and shared camera rotation frames: passed');
