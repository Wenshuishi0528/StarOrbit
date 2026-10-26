import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Matrix4,Vector3} from 'three';
import {snapshot,unit,dot,sub,cross,norm,validateOrbit} from '../src/orbit.js';
import {groundTrackAttitude} from '../src/attitude.js';

const data=validateOrbit(JSON.parse(fs.readFileSync(new URL('../assets/orbit.json',import.meta.url))));
const meta=JSON.parse(fs.readFileSync(new URL('../assets/model.json',import.meta.url)));
const mat=m=>new Matrix4().set(...m.flat());
const front=new Vector3(0,0,1).transformDirection(mat(meta.modules.TH.matrix).multiply(mat(meta.modules.TH.ports.TH_FORWARD)));
const fixedPosition=q=>q.earthAxes.map(axis=>dot(axis,unit(q.position)));
let maxOldYaw=0,maxNewYaw=0,samples=0,northbound=0,southbound=0;
for(let time=data.rows[0][0]+1000;time<data.rows.at(-1)[0]-1000;time+=37*60000){
 const original=snapshot(data,time),q=groundTrackAttitude(original);
 // Independently measure the direction of the geographic track from adjacent
 // positions in Earth's rotating frame, rather than another velocity formula.
 const before=snapshot(data,time-500),after=snapshot(data,time+500);
 const step=unit(sub(fixedPosition(after),fixedPosition(before)));
 const travel=unit([0,1,2].map(j=>step.reduce((sum,value,i)=>sum+value*q.earthAxes[i][j],0)));
 const rotation=new Matrix4().makeBasis(...q.basis.map(axis=>new Vector3(...axis)));
 const nose=front.clone().transformDirection(rotation).toArray();
 const oldCos=dot(original.basis[0],travel),newCos=dot(nose,travel);
 maxOldYaw=Math.max(maxOldYaw,Math.acos(Math.min(1,oldCos))*180/Math.PI);
 maxNewYaw=Math.max(maxNewYaw,Math.acos(Math.min(1,newCos))*180/Math.PI);
 assert.ok(newCos>1-1e-10,'Actual Tianhe front must follow geographic motion');
 assert.ok(dot(q.basis[2],unit(q.position))>1-1e-12,'Ventral side must face Earth');
 assert.ok(Math.abs(dot(q.basis[0],q.basis[2]))<1e-12);
 assert.ok(dot(cross(q.basis[0],q.basis[1]),q.basis[2])>1-1e-12);
 const restored=[0,1,2].map(j=>q.sunLocal.reduce((sum,value,i)=>sum+value*q.basis[i][j],0));
 assert.ok(norm(sub(restored,q.sunDir))<1e-12,'Lighting and arrays share the corrected frame');
 for(const key of ['position','velocity','speed','illumination','latitude','longitude','sun','earthAxes'])assert.deepEqual(q[key],original[key]);
 if(after.latitude>before.latitude)northbound++;else southbound++;
 samples++;
}
assert.ok(maxOldYaw>2,'Reproduce the previous sideways drift');
// Allow the published velocity vs interpolated-position derivative precision,
// including the data endpoints and the model port's tiny export-axis rounding.
assert.ok(maxNewYaw<.001);
assert.ok(northbound>0&&southbound>0);
assert.equal(groundTrackAttitude(null),null);
console.log({samples,northbound,southbound,maxOldYawDegrees:maxOldYaw,maxNewYawDegrees:maxNewYaw,orbitAndSun:'unchanged'});

// Rigid attitude changes must refresh cached solar occluders without resampling geometry.
const THREE=await import('three');
const {SolarTracker}=await import('../src/solar.js');
const {applyBodyPose}=await import('../src/spacecraft-model.js');
const body=new THREE.Group(),fixed=new THREE.Mesh(new THREE.BoxGeometry(2,4,6)),wing=new THREE.Mesh(new THREE.BoxGeometry(3,1,.2));
fixed.position.set(4,2,0);wing.position.set(-3,1,2);body.add(fixed,wing);
const tracker=new SolarTracker({model:body}),records=[fixed,wing].map(mesh=>{mesh.geometry.computeBoundingBox();return {mesh,box:new THREE.Box3()};});
tracker.occluders.test={fixed:new THREE.Box3(),box:new THREE.Box3(),records,moving:[records[1]]};
const originalGeometry=fixed.geometry;
for(const pose of [{roll:90,pitch:0,yaw:0},{roll:0,pitch:90,yaw:0},{roll:0,pitch:0,yaw:90},{roll:27.5,pitch:-41,yaw:130}]){
 applyBodyPose(body,pose);tracker.refreshPose();
 for(const record of records)assert.ok(record.box.equals(new THREE.Box3().setFromObject(record.mesh)),'cached bounds follow the rigid attitude');
 assert.ok(tracker.occluders.test.fixed.equals(new THREE.Box3().setFromObject(fixed)));
 assert.ok(tracker.occluders.test.box.equals(new THREE.Box3().setFromObject(body)));
 assert.equal(fixed.geometry,originalGeometry,'rotation reuses geometry');
 wing.rotation.y+=.2;body.updateMatrixWorld(true);tracker.updateBounds('test');
 assert.ok(tracker.occluders.test.box.equals(new THREE.Box3().setFromObject(body)),'solar articulation remains correct after body rotation');
}
console.log('Manual three-axis attitude: cached solar bounds follow body rotation and wing articulation');
