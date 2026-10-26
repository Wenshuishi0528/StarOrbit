import * as THREE from 'three';
import {computeBoundsTree,acceleratedRaycast} from 'three-mesh-bvh';
import {bestAngles,wrap} from './orbit.js';
THREE.Mesh.prototype.raycast=acceleratedRaycast;
const rad=THREE.MathUtils.degToRad;
export class SolarTracker{
 constructor(api){this.api=api;this.wings={};this.meshes=[];this.targets={};this.references={};this.occluders={};this.hits=[];this.ray=new THREE.Raycaster();this.ray.firstHitOnly=true;this.ray.near=.01;this.ray.far=3000;this.readings={};}
 rebuild(){
  const {groups,rig}=this.api;this.wings={};this.meshes=[];this.targets={};this.references={};this.occluders={};this.api.model.updateMatrixWorld(true);
  for(const [id,g] of Object.entries(groups)){
   const moving=new Set();for(const root of [rig[id].roll,rig[id].left,rig[id].right])root?.traverse(o=>{if(o.isMesh)moving.add(o);});
   const bucket={box:new THREE.Box3(),fixed:new THREE.Box3(),records:[],moving:[]};this.occluders[id]=bucket;
   g.traverse(o=>{if(o.isMesh){
    this.meshes.push(o);o.castShadow=true;o.receiveShadow=true;if(!o.geometry.boundsTree)computeBoundsTree.call(o.geometry);
    if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
    const record={mesh:o,box:o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)};bucket.records.push(record);
    if(moving.has(o))bucket.moving.push(record);else bucket.fixed.union(record.box);
   }});this.updateBounds(id);
   this.wings[id]=['left','right'].map(side=>{
    const root=rig[id][side],triangles=[];let area=0;
    root.traverse(mesh=>{if(!mesh.isMesh)return;const geo=mesh.geometry,pos=geo.attributes.position,idx=geo.index,materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
     for(const part of geo.groups.length?geo.groups:[{start:0,count:idx?idx.count:pos.count,materialIndex:0}]){
      if(!/solar.*blue/i.test(materials[part.materialIndex]?.name||''))continue;
      for(let i=part.start;i<part.start+part.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(i):i),b=new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(i+1):i+1),c=new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(i+2):i+2),n=b.clone().sub(a).cross(c.clone().sub(a)),size=n.length()/2;
       if(size<1e-8||n.normalize().z<.95)continue;area+=size;triangles.push({mesh,p:a.add(b).add(c).multiplyScalar(1/3),area:size,end:area});
      }
     }
    });
    const samples=[];for(let j=0;j<8&&triangles.length;j++)samples.push(triangles.find(t=>t.end>=area*(j+.5)/8));
    return {root,samples,area};
   });
  }
 }
 // Rigid body attitude changes reuse sampled triangles and BVHs.
 refreshPose(){
  this.api.model.updateMatrixWorld(true);
  for(const bucket of Object.values(this.occluders)){
   bucket.fixed.makeEmpty();bucket.box.makeEmpty();
   const moving=new Set(bucket.moving);
   for(const record of bucket.records){record.box.copy(record.mesh.geometry.boundingBox).applyMatrix4(record.mesh.matrixWorld);bucket.box.union(record.box);if(!moving.has(record))bucket.fixed.union(record.box);}
  }
 }
 updateBounds(id){
  const b=this.occluders[id];b.box.copy(b.fixed);
  for(const record of b.moving){record.box.copy(record.mesh.geometry.boundingBox).applyMatrix4(record.mesh.matrixWorld);b.box.union(record.box);}
 }
 pose(id,a){const r=this.api.rig[id];if(r.roll)r.roll.rotation.x=rad(a.roll);r.left.rotation.y=rad(a.left);r.right.rotation.y=rad(a.right);this.api.groups[id].updateMatrixWorld(true);this.updateBounds(id);}
 blocked(){
  // World-space boxes cheaply reject whole ships, then individual parts. Any hit
  // is sufficient for occlusion, so avoid intersecting and sorting all 700+ meshes.
  for(const bucket of Object.values(this.occluders)){
   if(!this.ray.ray.intersectsBox(bucket.box))continue;
   for(const {mesh,box} of bucket.records){
    if(!this.ray.ray.intersectsBox(box))continue;
    this.hits.length=0;this.ray.intersectObject(mesh,false,this.hits);if(this.hits.length)return true;
   }
  }
  return false;
 }
 score(id,sun,occlusion){
  let sum=0,area=0;const wings=[];
  for(const wing of this.wings[id]){
   const normal=new THREE.Vector3(0,0,1).transformDirection(wing.root.matrixWorld),cos=Math.max(0,normal.dot(sun));let visible=1;
   if(cos>0&&occlusion&&wing.samples.length){let hits=0;for(const sample of wing.samples){const start=sample.p.clone().applyMatrix4(sample.mesh.matrixWorld).addScaledVector(normal,.03).addScaledVector(sun,.03);this.ray.set(start,sun);if(this.blocked())hits++;}visible=1-hits/wing.samples.length;}
   wings.push({cos,visible,area:wing.area});sum+=wing.area*cos*visible;area+=wing.area;
  }return {fraction:area?sum/area:0,area,wings};
 }
 solve(sunArray,occlusion){
  const sun=new THREE.Vector3(...sunArray),{groups,state,rig}=this.api;this.api.model.updateMatrixWorld(true);for(const id of Object.keys(groups))this.updateBounds(id);
  for(const id of Object.keys(groups)){
   const prior=state.angles[id],local=sun.clone().applyQuaternion(groups[id].getWorldQuaternion(new THREE.Quaternion()).invert()),dual=!!rig[id].roll,opt=bestAngles(local.toArray(),dual,prior);
   let best={roll:opt.roll,left:opt.pitch,right:opt.pitch},bestScore=-1;
   // Jointly test both wings, including mutual and body occlusion; this is a sampled local search.
   const candidates=[best,{...prior}];if(occlusion)for(const r of dual?[-20,0,20]:[0])for(const p of [-20,0,20])candidates.push({roll:wrap(opt.roll+r),left:wrap(opt.pitch+p),right:wrap(opt.pitch+p)});
   for(const a of candidates){this.pose(id,a);const q=this.score(id,sun,occlusion).fraction,travel=Math.abs(wrap(a.roll-prior.roll))+Math.abs(wrap(a.left-prior.left));if(q>bestScore+1e-6||(Math.abs(q-bestScore)<1e-6&&travel<best.travel)){bestScore=q;best={...a,travel};}}
   this.targets[id]=best;this.references[id]={roll:opt.roll,left:opt.pitch,right:opt.pitch};this.pose(id,prior);
  }
 }
 followSun(sunArray){
  // Cheap analytical pointing follows time every frame; the sampled occlusion
  // correction is retained between the less frequent full searches.
  const sun=new THREE.Vector3(...sunArray),{groups,rig}=this.api;
  for(const [id,t] of Object.entries(this.targets)){
   const prior=this.references[id],local=sun.clone().applyQuaternion(groups[id].getWorldQuaternion(new THREE.Quaternion()).invert());
   const opt=bestAngles(local.toArray(),!!rig[id].roll,prior),next={roll:opt.roll,left:opt.pitch,right:opt.pitch};
   for(const key of ['roll','left','right'])t[key]=wrap(t[key]+wrap(next[key]-prior[key]));
   this.references[id]=next;
  }
 }
 advance(seconds,snap=false,sunArray){if(sunArray)this.followSun(sunArray);for(const [id,t]of Object.entries(this.targets)){const a=this.api.state.angles[id];if(!a)continue;for(const key of ['roll','left','right']){const d=wrap(t[key]-a[key]);a[key]=snap?t[key]:wrap(a[key]+Math.sign(d)*Math.min(Math.abs(d),Math.abs(seconds)*3));}this.pose(id,a);}}
 measure(sunArray,fraction,occlusion){const sun=new THREE.Vector3(...sunArray);let area=0,lit=0;for(const id of Object.keys(this.wings))this.updateBounds(id);for(const id of Object.keys(this.wings)){const q=this.score(id,sun,occlusion);this.readings[id]={...q,effective:q.fraction*fraction};area+=q.area;lit+=q.area*q.fraction*fraction;}this.total=area?lit/area:0;return this.total;}
}
