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
