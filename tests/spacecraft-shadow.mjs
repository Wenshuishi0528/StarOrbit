import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fitSpacecraftShadow,SpacecraftShadowCache} from '../src/spacecraft-shadow.js';
const light=new THREE.DirectionalLight();light.shadow.mapSize.set(4096,4096);
for(const scale of [1e-5,1,100,1e6]){
 const box=new THREE.Box3(new THREE.Vector3(-2,-1,-3).multiplyScalar(scale),new THREE.Vector3(3,2,4).multiplyScalar(scale));
 const distance=fitSpacecraftShadow(light,box),center=box.getCenter(new THREE.Vector3()),radius=box.getSize(new THREE.Vector3()).length()/2;
 assert.ok(light.target.position.distanceTo(center)<scale*1e-10);
 assert.ok(light.shadow.camera.near>0&&distance-radius>light.shadow.camera.near&&distance+radius<light.shadow.camera.far);
 const texel=(light.shadow.camera.right-light.shadow.camera.left)/4096;
 assert.ok(Math.abs(light.shadow.normalBias/texel-2.5)<1e-10);
 assert.ok(Math.abs(-light.shadow.bias*(light.shadow.camera.far-light.shadow.camera.near)/texel-1)<1e-10);
 // Every corner remains inside the shadow volume from different solar directions.
 for(const sun of [[1,0,0],[-.1,.9,.3],[0,0,1],[1e-7,1,1e-7]]){
  light.position.copy(center).addScaledVector(new THREE.Vector3(...sun).normalize(),distance);light.updateMatrixWorld(true);light.target.updateMatrixWorld(true);light.shadow.updateMatrices(light);
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
   const p=new THREE.Vector3(x,y,z).project(light.shadow.camera);assert.ok(Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))<1);
  }
 }
}
console.log('Spacecraft shadow scale, texel bias and solar-direction coverage: passed');

const lamp=new THREE.DirectionalLight(0xffffff,3.4),part=new THREE.Object3D(),cache=new SpacecraftShadowCache(lamp);
lamp.shadow.mapSize.set(4096,4096);lamp.position.set(0,0,10);part.updateMatrixWorld(true);cache.reset([part]);
assert.equal(cache.update(),true);lamp.shadow.map={};lamp.shadow.needsUpdate=false;
assert.equal(cache.update(),false);assert.equal(lamp.shadow.needsUpdate,false);
lamp.position.x=.0001;assert.equal(cache.update(),false);
lamp.position.x=.01;assert.equal(cache.update(),true);lamp.shadow.needsUpdate=false;
part.rotation.z=.01;part.updateMatrixWorld(true);assert.equal(cache.update(),true);lamp.shadow.needsUpdate=false;
lamp.color.setRGB(0,0,0);part.rotation.z=.02;part.updateMatrixWorld(true);assert.equal(cache.update(),false);assert.equal(lamp.shadow.needsUpdate,false);
lamp.color.setRGB(1,1,1);assert.equal(cache.update(),true);
console.log('Shadow reuse, solar motion, geometry motion and eclipse invalidation: passed');
