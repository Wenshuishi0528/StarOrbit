import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
import * as THREE from 'three';
import {createSharedWorldEarth,groundRenderPose} from './src/shared-world-earth.js';
import {vertex,earthFragment,cloudFragment,atmosphereFragment,volumeCloudFragment} from './src/earth-shaders.js';
import {earthAxes} from './src/orbit.js';
export function run(){
 const calls=[],uniforms={sun:{value:new THREE.Vector3(1,0,0)},dayMap:{value:new THREE.Texture()},cloudMap:{value:new THREE.Texture()},cloudAmount:{value:1},cloudNightVisible:{value:0},cloudSeason:{value:0}};
 const geometry=new THREE.SphereGeometry(6371,12,8),material=f=>new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:f,uniforms}),mesh=f=>new THREE.Mesh(geometry,material(f));
 const env={uniforms,settings:{cityTerrain:true,cityAutoLoad:false,earthElevation:true,clouds:true,cloudOpacity:.75},quality:'standard',earth:mesh(earthFragment),clouds:mesh(cloudFragment),atmosphere:mesh(atmosphereFragment),volumeClouds:mesh(volumeCloudFragment),detail:{update:c=>calls.push(['detail',c.position.length()])},nightDetail:{update:c=>calls.push(['night',c.position.length()])},cityTerrain:{uniforms:()=>({cityCount:{value:0}}),setEnabled(){},setView:(id,v)=>calls.push(['city',id,v.eyeKm]),release:id=>calls.push(['releaseCity',id])},elevation:{enabled:false,setEnabled(v){this.enabled=v;},setView:(id,v)=>calls.push(['elevation',id,v.eyeKm]),records:()=>[],release:id=>calls.push(['releaseElevation',id])}};
 let disposedGeometry=0,disposedTexture=0;geometry.addEventListener('dispose',()=>disposedGeometry++);uniforms.dayMap.value.addEventListener('dispose',()=>disposedTexture++);
 env.earth.material.visible=false;
 env.clouds.geometry=new THREE.SphereGeometry(6379,12,8);
 const renderer={autoClear:false,getRenderTarget:()=>null,setRenderTarget(){},getClearAlpha:()=>1,getClearColor:c=>c.set(0),setClearColor(){},getDrawingBufferSize:v=>v.set(1200,800),clear(){},render:(s,c)=>calls.push(['render',c.position.length()])};
 const view=createSharedWorldEarth({environment:env,renderer,id:'test'});
 const time=Date.UTC(2026,10,8),local=new THREE.Quaternion(),pose=groundRenderPose({latitude:39.9074,longitude:116.4046,height:50},time,local);
 view.update({time,...pose,width:1200,height:800,aspect:1.5});view.render();
 const atmo=view.group.children.find(o=>o.material?.fragmentShader.includes('terrainEnd'));
 const cloud=view.group.children.find(o=>o.material?.fragmentShader.includes('terrainStop()') && o.material.fragmentShader.includes('float c=cloudAt(localN)'));
 const volume=view.group.children.find(o=>o.material?.fragmentShader.includes('densityAt(vec3 p)'));
 const surface=view.group.children.find(o=>o.isMesh);
 const checks={cloudAfterAir:cloud.renderOrder>atmo.renderOrder&&volume.renderOrder>atmo.renderOrder,finiteCloudPath:cloud.material.fragmentShader.includes('color=worldCloudAerial(worldP')&&volume.material.fragmentShader.includes('color=worldCloudAerial(cloudPoint'),hostCloudDepth:volume.material.fragmentShader.includes('cloudPoint*earthSceneScale+earthSceneCenter'),cloudInside:cloud.material.side===THREE.BackSide,sharedCloudMap:cloud.material.uniforms.cloudMap===env.uniforms.cloudMap,atmosphereTerrainCap:!!atmo,depthPassRestored:view.uniforms.surfaceDepthPass.value===0,radius:Math.hypot(...pose.cameraPositionKm),borrowGeometry:surface.geometry===env.earth.geometry,fallbackMaterialVisible:surface.material.visible,borrowTexture:surface.material.uniforms.dayMap===uniforms.dayMap,distinctMaterial:surface.material!==env.earth.material,sourceUnchanged:env.earth.material.vertexShader===vertex,shaderViewEye:surface.material.fragmentShader.includes('worldEyeKm'),shaderLocalClip:surface.material.vertexShader.includes('projectionMatrix*modelViewMatrix'),originalQuaternion:env.earth.quaternion.toArray(),calls};
 const patchData=(half)=>({positions:new Float32Array([-half,-half,50,half,-half,50,-half,half,50,half,half,50]),uv:new Float32Array([.82,.72,.83,.72,.82,.73,.83,.73]),indices:new Uint16Array([0,1,2,1,3,2]),halfSize:half});
 const nearPatch={data:patchData(4096),site:{latitude:39.9,longitude:116.4},revision:1,surround:{data:patchData(64000),site:{latitude:39.9,longitude:116.4},revision:1}};
 view.update({time,...pose,width:1200,height:800,nearPatch});
 checks.outerHole=view.uniforms.nearHalfSize.value;
 const outer=view.group.children.find(o=>o.userData.halfSize===64000);
 checks.contactHole=outer.material.uniforms.nearHalfSize.value;
 checks.patchHoleIndependent=outer.material.uniforms.nearHalfSize!==view.uniforms.nearHalfSize;
 view.update({time,...pose,width:1200,height:800,nearPatch:{...nearPatch,data:null}});
 checks.contactReleased=outer.material.uniforms.hasNearHole.value===0;
 const host=new THREE.PerspectiveCamera();host.position.set(1.01,0,0);view.update({time,camera:host,earthPosition:[1,0,0],unitsPerKm:1/149597870.7,width:1200,height:800});checks.cloudOutside=cloud.material.side===THREE.FrontSide;checks.scaledEye=view.uniforms.worldEyeKm.value.x;checks.rootPosition=view.group.position.x;
 env.settings.cloudOpacity=.23;view.update({time,...pose,width:1200,height:800});checks.sharedOpacity=cloud.material.uniforms.cloudAmount.value===.23;
 env.settings.clouds=false;view.update({time,...pose,width:1200,height:800});checks.sharedCloudToggle=!cloud.visible&&!volume.visible;
 env.settings.clouds=true;env.quality='high';env.weather={settings:{volume:true},update(){}};view.update({time,...pose,width:1200,height:800});checks.sharedCloudQuality=!cloud.visible&&volume.visible;
 env.uniforms.cloudMap.value=new THREE.Texture();checks.sharedCloudReplacement=cloud.material.uniforms.cloudMap.value===env.uniforms.cloudMap.value;
 view.dispose();view.dispose();checks.disposedGeometry=disposedGeometry;checks.disposedTexture=disposedTexture;checks.childrenAfter=view.scene.children.length;
 return checks;
}`,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const module = { exports: {} };
new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
const c = module.exports.run();
assert(
  Math.abs(c.radius - 6371.05) < 1e-8,
  'ground pose matches renderer sphere plus measured altitude'
);
for (const key of [
  'cloudAfterAir',
  'finiteCloudPath',
  'hostCloudDepth',
  'sharedOpacity',
  'sharedCloudToggle',
  'sharedCloudQuality',
  'sharedCloudReplacement',
  'cloudInside',
  'cloudOutside',
  'sharedCloudMap',
  'atmosphereTerrainCap',
  'depthPassRestored',
  'borrowGeometry',
  'fallbackMaterialVisible',
  'borrowTexture',
  'distinctMaterial',
  'sourceUnchanged',
  'shaderViewEye',
  'shaderLocalClip',
])
  assert(c[key], key);
assert.deepEqual(
  c.originalQuaternion,
  [0, 0, 0, 1],
  'shared detail planning restores main Earth orientation'
);
assert(Math.abs(c.scaledEye - 1495978.707) < 1e-6, 'AU host uses Earth-centred km lighting');
assert.equal(c.rootPosition, 1);
assert.equal(c.outerHole, 63.36);
assert.equal(c.contactHole, 4.05504);
assert(c.patchHoleIndependent);
assert(c.contactReleased);
assert.equal(c.disposedGeometry, 0);
assert.equal(c.disposedTexture, 0);
assert.equal(c.childrenAfter, 0);
assert.equal(c.calls.filter((c) => c[0] === 'releaseCity').length, 1);
assert(c.calls.some((c) => c[0] === 'city' && Math.hypot(...c[2]) > 6371));
console.log(
  'Shared Earth: same textures/geometry, coordinate adaptation, shader frame, city/elevation consumers and safe disposal passed'
);
