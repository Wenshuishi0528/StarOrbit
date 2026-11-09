import assert from 'node:assert/strict';
import * as THREE from 'three';
import {configurePlanetaryObservationCamera,decodePlanetaryTerrain,samplePlanetaryTerrain,createPlanetaryRenderer} from '../src/planetary-renderer.js';
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
// Exact limb projection: projected radius is tan(angular radius)/tan(FOV/2).
for(const distance of [10000,30000,100000]) {
 const camera=new THREE.PerspectiveCamera();camera.aspect=1;
 configurePlanetaryObservationCamera(camera,{distanceKm:distance*3396.19,radiusKm:3396.19,observerDirectionFixed:[1,0,0],northUpFixed:[0,0,1]},45);
 const tangent=new THREE.Vector3(1/distance,0,Math.sqrt(1-1/distance**2)).project(camera);
 const expected=Math.tan(Math.asin(1/distance))/Math.tan(45/3600*Math.PI/360);
 near(tangent.y,expected,1e-8);near(camera.fov,45/3600);assert.ok(tangent.z>=-1&&tangent.z<=1);
 // A point 85 degrees from the central meridian is visible at the real distance;
 // the previous six-radius camera wrongly hid it.
 const point=new THREE.Vector3(Math.cos(85*Math.PI/180),0,Math.sin(85*Math.PI/180));
 assert.ok(point.dot(camera.position.clone().sub(point))>0);
}
const data=new Int16Array([0,100,200,300,1000,1100,1200,1300]);
const dem=decodePlanetaryTerrain(data.buffer,{width:4,height:2,encoding:'int16-le-gzip',scaleMeters:1,offsetMeters:0,pixelRegistration:'cell-centre'});
near(samplePlanetaryTerrain(dem,45,-135),0);near(samplePlanetaryTerrain(dem,45,-45),100);near(samplePlanetaryTerrain(dem,0,-90),550);
near(samplePlanetaryTerrain(dem,90,-135),0);near(samplePlanetaryTerrain(dem,-90,-135),1000);
near(samplePlanetaryTerrain(dem,45,-180),150);near(samplePlanetaryTerrain(dem,45,180),150);
assert.throws(()=>decodePlanetaryTerrain(new ArrayBuffer(2),{width:4,height:2}),RangeError);
class Canvas extends EventTarget{constructor(){super();this.style={};this.ownerDocument=new EventTarget();}getRootNode(){return this.ownerDocument;}getBoundingClientRect(){return{left:0,top:0,width:1000,height:500};}}
const canvas=new Canvas(),viewport=new THREE.Vector4(7,8,9,10),box=new THREE.Vector4(11,12,13,14),renders=[];
let scissor=false;
const renderer={getPixelRatio:()=>1,domElement:canvas,autoClear:false,toneMappingExposure:1.2,capabilities:{getMaxAnisotropy:()=>4},getScissorTest:()=>scissor,setScissorTest:v=>scissor=v,getViewport:v=>v.copy(viewport),getScissor:v=>v.copy(box),setViewport:(...args)=>args[0]?.isVector4?viewport.copy(args[0]):viewport.set(...args),setScissor:(...args)=>args[0]?.isVector4?box.copy(args[0]):box.set(...args),render:(scene,camera)=>{scene.updateMatrixWorld(true);renders.push({camera:camera.clone(),scene});}};
const day=new THREE.Texture(),night=new THREE.Texture(),cloud=new THREE.Texture();let sharedDisposals=0;for(const t of [day,night,cloud])t.addEventListener('dispose',()=>sharedDisposals++);
const environment={assets:{mars:{layers:{}}},uniforms:{dayMap:{value:day},nightMap:{value:night},cloudMap:{value:cloud},cloudTemplateMap:{value:cloud},cloudChannel:{value:1},cloudTone:{value:0}},elevation:{base:null}};
const view=createPlanetaryRenderer({renderer,environment});
const settings={target:'Mars',layer:'visible',time:Date.parse('2025-01-16'),site:{latitude:39.9,longitude:116.4,height:50},atlas:false,relief:false,clouds:false,view:'explore',fov:45};
const exploration=view.frame(settings,{time:Date.parse('2025-09-01')},1000,500);
assert.deepEqual(exploration.a.camera.position.toArray(),exploration.b.camera.position.toArray(),'both atlas columns use one identical controller pose');
const observation=view.frame({...settings,view:'observe'},{time:Date.parse('2025-09-01')},1000,500);
near(observation.a.camera.fov,observation.b.camera.fov);assert.ok(observation.a.camera.position.length()<observation.b.camera.position.length()/2,'same field retains actual disc-size difference');
const returnAtlas=view.frame(settings,null,1000,500);
assert.ok(returnAtlas.a.camera.position.distanceTo(exploration.a.camera.position)<1e-12,'return from observing restores exploration pose');
assert.equal(renderer.autoClear,false);near(renderer.toneMappingExposure,1.2);assert.equal(scissor,false);assert.deepEqual(viewport.toArray(),[7,8,9,10]);assert.deepEqual(box.toArray(),[11,12,13,14]);
view.frame({...settings,target:'Earth',layer:'day',relief:true,clouds:true},null,1000,500);
assert.equal(renders.at(-1).scene.children[0].material.uniforms.map.value,day);
assert.equal(renders.at(-1).scene.children.find(x=>x.material?.uniforms?.channel).material.uniforms.channel.value,1,'Earth RGBA cloud encoding is preserved');
view.dispose();assert.equal(sharedDisposals,0,'Earth texture resources remain owned by Environment');
console.log('Planetary renderer: exact angular fields/limbs, comparison pose, camera restoration, cell-centred terrain/seam/poles, Earth borrowing and renderer state passed.');
const {readFileSync}=await import('node:fs');
const {gunzipSync}=await import('node:zlib');
const manifest=JSON.parse(readFileSync(new URL('../assets/mars/manifest.json',import.meta.url)));
const packed=gunzipSync(readFileSync(new URL('../'+manifest.terrain.url,import.meta.url)));
const actual=decodePlanetaryTerrain(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength),manifest.terrain);
assert.ok(samplePlanetaryTerrain(actual,18.65,-133.8)>15000,'Olympus Mons is high on the eastern-positive registered map');
assert.ok(samplePlanetaryTerrain(actual,-42.4,70.5)<-5000,'Hellas basin remains below the reference surface');
console.log('MOLA actual asset: correct longitude roll and north-up placement at Olympus Mons and Hellas.');
