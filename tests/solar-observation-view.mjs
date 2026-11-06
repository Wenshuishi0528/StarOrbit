import assert from 'node:assert/strict';
import {unit,dot} from '../src/orbit.js';
import {solarImageAxes,solarImageUV,solarImageFootprint,solarImageOccluders} from '../src/solar-observation-math.js';

const body={direction:[1,0,0],north:unit([.2,0,1]),radiusRad:.00465},record={radiusFraction:.78,solarCenterUV:[.5,.5]};
const near=(a,b)=>a.forEach((x,i)=>assert(Math.abs(x-b[i])<1e-10));
const axes=solarImageAxes(body),edge=Math.tan(body.radiusRad);
near(axes.up,[0,0,1]);near(axes.right,[0,-1,0]);assert(Math.abs(dot(axes.up,axes.forward))<1e-12);
near(solarImageUV(body.direction,body,record),[.5,.5]);
near(solarImageUV(unit([1,-edge,0]),body,record),[.89,.5]);
near(solarImageUV(unit([1,edge,0]),body,record),[.11,.5]);
near(solarImageUV(unit([1,0,edge]),body,record),[.5,.89]);
assert.equal(solarImageUV([-1,0,0],body,record),null);
// A real prominence at 1.15 solar radii belongs to the original image, beyond
// the photospheric limb. It must not be clamped to the surface or an opaque box.
const prominence=solarImageUV(unit([1,0,edge*1.15]),body,record);
assert(prominence[1]>.89&&prominence[1]<1);
assert(solarImageFootprint(body,record)>body.radiusRad);
const large={...body,radiusRad:.0093};
near(solarImageUV(unit([1,0,Math.tan(large.radiusRad)]),large,record),[.5,.89]);
// The image follows solar north even at a very different viewing direction.
const tilted={direction:unit([.5,.6,.1]),north:unit([.1,.1,1]),radiusRad:.00465};
const aligned=solarImageAxes(tilted);
const ray=unit(tilted.direction.map((v,i)=>v+edge*aligned.up[i]));
near(solarImageUV(ray,tilted,record),[.5,.89]);
const foregroundBodies=[{id:'Moon',distanceKm:400000,radiusRad:.005},{id:'Mercury',distanceKm:80000000,radiusRad:.00002},
 {id:'Venus',distanceKm:180000000,radiusRad:.00003},{id:'Mars',distanceKm:60000000,radiusRad:.00001}];
assert.deepEqual(solarImageOccluders({distanceKm:149000000},foregroundBodies).map(b=>b.id),['Moon','Mercury']);
console.log('SDO disc projection: true angular size, solar north/west, no longitude wrapping, and off-limb structures passed.');

// Preparing a photo can yield while its live shutter camera moves. Its frozen
// observation must be ready even when the Sun started behind that camera.
const THREE=await import('three');
const {createSolarView}=await import('../src/xuntian-solar-view.js');
const {createSolarObservationView}=await import('../src/solar-observation-view.js');
const originalLoad=THREE.TextureLoader.prototype.loadAsync;
let loads=0;
try {
 THREE.TextureLoader.prototype.loadAsync=async()=>{loads++;return new THREE.Texture();};
 const geometry=new THREE.PlaneGeometry(2,2),view=createSolarView({assets:{}},geometry,{});
 const frame={q:{t:Date.parse('2026-11-06T00:00:00Z'),sun:[0,0,149000000]},eyeKm:[0,0,7000],fovY:1,
  axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,-1]},solarObservation:{id:'frozen-hmi',blob:new Blob(['already validated record'])}};
 await view.preparePhoto(frame,{w:320,h:200,aspect:1.6});
 assert.equal(loads,1,'the frozen image is prepared even with the Sun outside the initial viewport');view.dispose();geometry.dispose();

 // Observations are a display layer after the detector: no pupil-gain inverse
 // may clip their bright structures in the unsigned-byte render target.
 const displayGeometry=new THREE.PlaneGeometry(2,2),display=createSolarObservationView(displayGeometry,{});
 const displayRecord={id:'display-hmi',blob:new Blob(['validated']),channel:'hmi',width:2048,height:2048,radiusFraction:.78,solarCenterUV:[.5,.5]};
 await display.prepare(displayRecord);
 let displayMaterial;
 const displayFrame={solarObservation:displayRecord,axes:{right:[0,-1,0],up:[0,0,1],forward:[1,0,0]},exposure:1};
 const foregroundTexture=new THREE.Texture();
 assert.equal(display.draw({render(scene){displayMaterial=scene.children[0].material;}},new THREE.Camera(),displayFrame,{w:320,h:200},body,[0,0],80,foregroundTexture,[{direction:[1,0,0],radiusRad:.005}]),true);
 assert.equal(displayMaterial.uniforms.foreground.value,foregroundTexture);
 assert.equal(displayMaterial.uniforms.occluderCount.value,1);
 assert(Math.abs(displayMaterial.uniforms.occluders.value[0].w-Math.sin(.005))<1e-12);
 assert.equal(displayMaterial.uniforms.gain,undefined,'displayed image does not depend on the virtual pupil gain');
 assert.equal(displayMaterial.blendSrc,THREE.OneFactor);assert.equal(displayMaterial.blendDst,THREE.OneMinusSrcAlphaFactor);
 display.dispose();displayGeometry.dispose();foregroundTexture.dispose();

 const pending=[],textures=[];
 THREE.TextureLoader.prototype.loadAsync=()=>new Promise(resolve=>pending.push(()=>{const texture=new THREE.Texture();texture.addEventListener('dispose',()=>texture.wasDisposed=true);textures.push(texture);resolve(texture);}));
 const geo=new THREE.PlaneGeometry(2,2),pool=createSolarObservationView(geo,{});
 const jobs=['a','b','c'].map(id=>pool.prepare({id,blob:new Blob([id])}));
 pending[0]();await jobs[0];assert.equal(textures[0].wasDisposed,true,'retired pending image is disposed when decoding finishes');
 pool.dispose();pending[1]();pending[2]();await Promise.all(jobs);
 assert(textures.every(texture=>texture.wasDisposed),'disposing during pending loads releases every completed texture');geo.dispose();
} finally {THREE.TextureLoader.prototype.loadAsync=originalLoad;}
console.log('SDO photos prepare frozen observations outside the initial field; bounded texture eviction and pending disposal passed.');
