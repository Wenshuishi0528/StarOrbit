import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createDockingModels,createDockingCamera} from '../src/docking-models.js';
import {DOCKING_RATE,DOCKING_THRUST,DockingSimulation,dockingInitial,dockingContact,dockingMetrics,hcwStep,stepDocking,rotateDockingVector,dockingQuaternion,setDockingAttitude,hcwToScene,sceneToHCW} from '../src/docking-physics.js';
const close=(a,b,tolerance=1e-7)=>assert(Math.hypot(...a.map((v,i)=>v-b[i]))<tolerance,JSON.stringify({a,b}));
// Independent closed-form CW propagation with radial x, along-track y, normal z.
function analytic(p,v,t){const n=DOCKING_RATE,c=Math.cos(n*t),s=Math.sin(n*t),[x,y,z]=p,[u,w,q]=v;return {
 position:[(4-3*c)*x+s/n*u+2*(1-c)/n*w,6*(s-n*t)*x+y-2*(1-c)/n*u+(4*s-3*n*t)/n*w,c*z+s/n*q],
 velocity:[3*n*s*x+c*u+2*s*w,-6*n*(1-c)*x-2*s*u+(4*c-3)*w,-n*s*z+c*q]};}
let current={position:[17,100,9],velocity:[.2,-.1,.03]};const exact=analytic(current.position,current.velocity,600);
for(let i=0;i<12000;i++)current=hcwStep(current.position,current.velocity,[0,0,0],.05);
close(current.position,exact.position,1e-7);close(current.velocity,exact.velocity,1e-10);
const zero=new DockingSimulation(200);zero.advance(1);close(zero.state.position,[0,200,0]);close(zero.state.velocity,[0,0,0]);
const a=new DockingSimulation(200),b=new DockingSimulation(200);
for(let i=0;i<100;i++)a.advance(.01,{translation:[1,0,0]});for(let i=0;i<10;i++)b.advance(.1,{translation:[1,0,0]});
close(a.state.position,b.state.position,1e-12);close(a.state.velocity,b.state.velocity,1e-12);assert(Math.abs(a.state.deltaV-DOCKING_THRUST)<1e-12);
close(sceneToHCW(hcwToScene([1,2,3])),[1,2,3]);close(rotateDockingVector([-1,0,0],dockingQuaternion([0,0,90])),[0,-1,0]);
const sideways=stepDocking(setDockingAttitude(dockingInitial(),[0,0,90]),{translation:[1,0,0]});assert(sideways.velocity[2]<0&&Math.abs(sideways.velocity[1])<1e-10);
const start=(position,velocity=[0,-.1,0],attitude=[0,0,0])=>setDockingAttitude({...dockingInitial(),position,velocity},attitude);
assert.equal(dockingContact(start([0,.4,0]),start([0,.3,0])).status,'docked');
assert.equal(dockingContact(start([0,10,0],[0,-500,0]),start([0,-10,0],[0,-500,0])).status,'collision');
assert.equal(dockingContact(start([0,.4,0],[0,-.1,0],[0,0,5]),start([0,.3,0],[0,-.1,0],[0,0,5])).status,'collision');
assert.equal(dockingContact(start([.4,.4,0]),start([.4,.3,0])).status,'collision');
assert.equal(dockingContact(start([5,31,0]),start([5,29,0])).status,'corridor');
assert.equal(dockingContact(start([0,1999,0]),start([0,2001,0])).status,'lost');
const stopped=stepDocking({...dockingInitial(),status:'docked'}, {translation:[1,1,1]});assert.equal(stopped.status,'docked');
const fast=start([0,200,0],[0,-1,0]);const braking=stepDocking(fast,{brake:true});assert(braking.velocity[1]>-1&&braking.velocity[1]<-.99,'braking is acceleration limited');
const contact=new DockingSimulation(50);contact.state=start([0,.351,0]);contact.advance(.02);assert.equal(contact.state.status,'docked');assert(contact.state.position[1]>=.35);assert(dockingMetrics(contact.state).distance<.5);
assert.throws(()=>hcwStep([0,0,0],[0,0,0],[0,0,0],1));assert.throws(()=>zero.advance(Infinity));
const bytes=fs.readFileSync('assets/station.glb'),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
const templates=Object.fromEntries(['TH','WT','MT','SZ'].map(key=>[key,gltf.scene.getObjectByName('module_'+key)]));
const original=Object.fromEntries(Object.entries(templates).map(([key,value])=>[key,value.matrix.clone()]));
const models=createDockingModels(templates,JSON.parse(fs.readFileSync('assets/model.json')));
models.chaser.position.x=.35;models.chaser.updateMatrixWorld(true);
const targetBox=new THREE.Box3().setFromObject(models.core),shipBox=new THREE.Box3().setFromObject(models.ship);
assert(Math.abs(targetBox.max.x)<1e-6);assert(Math.abs(shipBox.min.x-.35)<1e-6,'capture zone must retain a gap between extended docking caps');
for(const [key,value]of Object.entries(templates))assert(value.matrix.equals(original[key]),'source template transform changed');
const camera=createDockingCamera();models.chaser.add(camera);
for(const range of [.35,1,50,500]){
 models.chaser.position.set(range,0,0);models.chaser.quaternion.identity();models.chaser.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const target=new THREE.Vector3().project(camera);assert(Math.abs(target.x)<1e-9&&Math.abs(target.y)<1e-9&&target.z>-1&&target.z<1,'aligned target stays centred through capture');
}
models.chaser.rotation.z=Math.PI/18;models.chaser.updateMatrixWorld(true);camera.updateMatrixWorld(true);assert(Math.abs(new THREE.Vector3().project(camera).x)>.3,'body yaw must move target away from reticle');
console.log('Docking physics: independent CW solution, frame invariance, body thrust, limited braking, capture, collision and swept-contact checks passed');
