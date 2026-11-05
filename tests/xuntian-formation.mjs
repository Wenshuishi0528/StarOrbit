import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {describeAssembly,matingTransforms,placementMatrices} from '../src/assembly.js';
import {snapshot,dot,norm} from '../src/orbit.js';
import {groundTrackAttitude} from '../src/attitude.js';
import {FORMATION_DEFAULT,aimAxes,orbitalAxes,fromBasis,intoBasis,opticalModel,boxTravelFraction} from '../src/xuntian-formation-math.js';

const storage=new Map();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}});
const result=await build({stdin:{contents:"export {installXuntianFormation} from './src/xuntian-formation.js'; export {makeScopeGuide} from './src/xuntian-guide.js';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const {installXuntianFormation,makeScopeGuide}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const check=(a,b,tol=1e-6)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const same=(a,b,tol=1e-6)=>a.forEach((x,i)=>check(x,b[i],tol));
const orbit=JSON.parse(fs.readFileSync('assets/orbit.json')),meta=JSON.parse(fs.readFileSync('assets/model.json'));
const bytes=fs.readFileSync('assets/station.glb'),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
const template=Object.fromEntries(['TH','WT','MT','SZ','TZ','XT'].map(k=>[k,gltf.scene.getObjectByName('module_'+k)]));
for(let i=0;i<4;i++)assert(template.XT.getObjectByName('XT_V28_INSET_RCS_FLOOR_'+i),'loaded station uses the four recessed Xuntian V28 ports');
const m=opticalModel(template.XT);
same(m.entrance.toArray(),[70.485,0,4],2e-5);same(m.axis.toArray(),[1,0,0],1e-6);
assert(m.radius>5&&m.radius<40);assert(m.reference.x>10&&m.reference.x<60);
const model=new THREE.Group(),scene=new THREE.Scene();scene.add(model);const groups={};
const config=describeAssembly({TH_WENTIAN:'WT',TH_MENGTIAN:'MT',TH_FORWARD:'SZ',TH_AFT:'TZ'});
const matrices=placementMatrices(meta,config,matingTransforms(meta));
for(const obj of config.instances){const g=template[obj.type].clone(true);matrices.get(obj.id).decompose(g.position,g.quaternion,g.scale);model.add(g);groups[obj.id]=g;}
const xt=template.XT.clone(true);model.add(xt);groups.freeXT=xt;
const stage={left:250,top:65,width:1000,height:650,right:1250,bottom:715};
const camera=new THREE.PerspectiveCamera(38,stage.width/stage.height,.1,50000);camera.up.set(0,0,1);
const controls={target:new THREE.Vector3(),maxDistance:1600,enableDamping:true,stopMotion(){},update(){camera.lookAt(this.target);camera.updateMatrixWorld(true);}};
const api={model,groups,stage:{getBoundingClientRect:()=>stage},camera,controls};
const t0=orbit.rows[100][0],qAt=t=>groundTrackAttitude(snapshot(orbit,t));
const q0=qAt(t0),sim={api,missionId:'tiangong',current:q0,setView(){}};
const f=installXuntianFormation(sim),orientation=aimAxes({forward:[.2,.7,.5],up:[0,0,1]});
same(f.getOffset(),[30,0,0]);f.restoreSuggested();
let optics=f.update(q0,orientation);
same(f.getOffset(),FORMATION_DEFAULT);check(norm(f.getOffset()),140);assert(f.getState().extent<140);
const world=()=>xt.localToWorld(m.reference.clone()).toArray();
const actualOffset=q=>intoBasis(fromBasis(world().map(x=>x/5),q.basis),orbitalAxes(q));
same(actualOffset(q0),FORMATION_DEFAULT);
same(optics.eyeLocal,xt.localToWorld(m.entrance.clone()).toArray());
same(optics.eyeKm,q0.position.map((x,i)=>x+fromBasis(optics.eyeLocal.map(v=>v/5000),q0.basis)[i]));
const cameraForward=(q,local=false)=>new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion().fromArray(local?q.cameraQuaternion:q.cameraQuaternionKm)).toArray();
same(cameraForward(optics),orientation.forward);same(cameraForward(optics,true),optics.localAxes.forward);
same(fromBasis(new THREE.Vector3(1,0,0).transformDirection(xt.matrixWorld).toArray(),q0.basis),orientation.forward);
const beforeCenter=world(),station=groups.TH.clone(),wing=groups.TH.getObjectByName('pitch_TH_L');wing.rotation.y=.42;
model.rotation.set(.7,-.5,1.2);const rotation=model.quaternion.clone();f.update(q0,orientation);
same(world(),beforeCenter);same(model.quaternion.toArray(),rotation.toArray());check(wing.rotation.y,.42);same(station.position.toArray(),groups.TH.position.toArray());
for(const step of [1700,5500,9200]){
 sim.current=qAt(t0+step*1000);optics=f.update(sim.current,orientation);same(actualOffset(sim.current),FORMATION_DEFAULT);
 same(cameraForward(optics),orientation.forward);same(fromBasis(optics.localAxes.forward,sim.current.basis),orientation.forward);
}
const stationTarget=f.stationTarget(1.6);assert(stationTarget&&stationTarget.fullyVisible&&stationTarget.fov>1&&stationTarget.fov<100);
assert(stationTarget.range>100&&stationTarget.range<180);check(norm(stationTarget.direction),1);
const start=f.getOffset();const blocked=f.setOffset(start.map(x=>-x));assert(blocked.constrained);assert(blocked.offset[0]<0);
f.restoreSuggested();f.setOffset([-125,120,55]);assert(!f.getState().constrained);same(f.getOffset(),[-125,120,55]);
f.restoreInitial();same(f.getOffset(),[30,0,0]);f.restoreSuggested();f.setOffset([-125,120,55]);
const custom=f.getOffset();model.rotation.set(-.3,.15,.4);f.update(sim.current,orientation);same(f.getOffset(),custom);
const blocker=new THREE.Group();blocker.add(new THREE.Mesh(new THREE.BoxGeometry(80,80,80),new THREE.MeshBasicMaterial()));
model.add(blocker);blocker.position.copy(model.worldToLocal(new THREE.Vector3(...world())));groups.newModule=blocker;
let changes=0;const unlisten=f.subscribe(()=>{changes++;});
f.refresh();assert(f.getState().constrained&&f.getState().automatic);assert.equal(changes,1);
assert(Math.hypot(...f.getOffset())>140,'adding station geometry at the companion moves it to a clear suggested position');
unlisten();model.remove(blocker);delete groups.newModule;f.refresh();same(f.getOffset(),FORMATION_DEFAULT);f.setOffset(custom);
const far=template.TH.clone(true);far.position.set(1700,0,0);model.add(far);groups.far=far;f.refresh();
same(f.getOffset(),custom);assert(norm(f.getState().suggested)>340);
f.restoreSuggested();assert(norm(f.getOffset())>340);model.remove(far);delete groups.far;f.refresh();same(f.getOffset(),FORMATION_DEFAULT);
const overlay={getBoundingClientRect:()=>({left:915,right:1250,top:320,bottom:715,width:335,height:395})};
assert(f.frameBoth(overlay));camera.updateMatrixWorld(true);
for(const group of Object.values(groups))group.traverse(o=>{
 if(!o.isMesh)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
 const b=o.geometry.boundingBox;
 for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
  const ndc=new THREE.Vector3(x,y,z).applyMatrix4(o.matrixWorld).project(camera),sx=stage.left+stage.width*(ndc.x+1)/2;
  assert(sx>=stage.left+1&&sx<915-1&&ndc.y<1&&ndc.y>-1,'both craft fit left of the real instrument panel');
 }
});
const pairedDistance=camera.position.distanceTo(controls.target);
assert(f.frameTelescope(overlay));const closeDistance=camera.position.distanceTo(controls.target);
assert(closeDistance<pairedDistance*.55,'close-up enlarges the real independent telescope');
const fixedExterior=camera.position.toArray().concat(camera.quaternion.toArray());
const pupilScreen=()=>{const q=xt.localToWorld(m.entrance.clone()).project(camera);return [q.x*stage.width/2,q.y*stage.height/2];};
const initialPupil=pupilScreen(),steered=aimAxes({forward:[-.2,.35,.83],up:[0,0,1]});
f.update(sim.current,steered);same(camera.position.toArray().concat(camera.quaternion.toArray()),fixedExterior);
assert(Math.hypot(...pupilScreen().map((x,i)=>x-initialPupil[i]))>12,'actual aperture moves visibly while exterior camera stays still');
f.update(sim.current,orientation);assert(f.frameBoth(overlay));check(camera.position.distanceTo(controls.target),pairedDistance,.02);
Object.assign(stage,{left:0,right:390,top:64,bottom:584,width:390,height:520});camera.aspect=stage.width/stage.height;
const sheet={getBoundingClientRect:()=>({left:0,right:390,top:390,bottom:844,width:390,height:454})};
assert(f.frameBoth(sheet));camera.updateMatrixWorld(true);
for(const group of Object.values(groups)){
 const box=new THREE.Box3().setFromObject(group),p=box.getCenter(new THREE.Vector3()).project(camera);
 assert(stage.top+stage.height*(1-p.y)/2<sheet.getBoundingClientRect().top-6,'both vehicles stay above a bottom sheet');
}
const body=new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1)),pad=new THREE.Vector3(.2,.2,.2);
check(boxTravelFraction(new THREE.Vector3(-5,0,0),new THREE.Vector3(5,0,0),body,pad),.38);
assert.equal(boxTravelFraction(new THREE.Vector3(-5,1.5,0),new THREE.Vector3(5,1.5,0),body,pad),null);
delete groups.freeXT;xt.removeFromParent();f.refresh();assert.equal(f.getOptics(),null);
model.add(xt);groups.freeXT=xt;f.refresh();assert(f.update(sim.current,orientation));sim.missionId='dfh1';assert.equal(f.update(sim.current,orientation),null);
sim.missionId='tiangong';f.update(sim.current,orientation);const lastCenter=world();sim.current=null;
assert.equal(f.getOptics(),null,'missing ephemeris cannot expose stale optical coordinates');
model.rotation.set(.9,.1,.6);assert.equal(f.update(null,orientation),null);same(world(),lastCenter);
f.dispose();assert.equal(f.getOptics(),null);
{
 const guideScene=new THREE.Scene(),guide=makeScopeGuide(guideScene),line=guideScene.getObjectByName('Xuntian field of view');
 const eye=[17,-11,8],optics={eyeLocal:eye,localAxes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]}};
 for(const fov of [.35,3.5,75,110]){
  const tangent=Math.tan(fov*Math.PI/360),nominal=Math.min(155,110/Math.tan(Math.max(10,fov)*Math.PI/360));
  guide.setScale(1);guide.update(optics,fov,1.6);
  const buffer=line.geometry.attributes.position.array;
  for(const factor of [1,.25,.5,2,4,8]){
   guide.setScale(factor);same([...buffer.slice(0,3)],eye);
   const [x,y,z]=[...buffer.slice(3,6)].map((v,i)=>v-eye[i]);
   check(z,nominal*factor,1e-4);check(x/z,1.6*tangent,1e-6);check(y/z,tangent,1e-6);
  }
 }
 guide.hide();guide.setScale(4);assert.equal(line.visible,false);guide.dispose();assert.equal(guideScene.children.length,0);
}
console.log('Xuntian formation: real GLB optical entrance/axis, orbital offset under station attitude, inertial lock, swept clearance, large assemblies, viewport-safe framing, independently scaled external guide and lifecycle passed.');
