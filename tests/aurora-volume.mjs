import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AuroraVolume,auroraPhase,auroraProfile,auroraBufferSize} from '../src/aurora-volume.js';
import {auroraNoise} from '../src/aurora-noise.js';
for(const time of [-8.64e15,-86400001,-1,0,86400000,8.64e15]){
 const phase=auroraPhase(time);assert(Number.isFinite(phase)&&phase>=0&&phase<1);assert.equal(phase,auroraPhase(time+86400000));
}
assert(Math.abs(auroraPhase(-1)-(1-auroraPhase(1)))<1e-12);
for(const low of [false,true])for(const [w,h] of [[1,1],[1280,900],[3840,2160],[7680,4320],[640,2000]]){
 const [x,y]=auroraBufferSize(w,h,low);assert(x>=1&&x<=960&&y>=1&&y<=640);assert(x<=w&&y<=h);
}
assert.deepEqual(auroraBufferSize(1280,900),[640,450]);
assert.deepEqual(auroraNoise(),auroraNoise());assert.equal(auroraNoise().data.length,8192);
const profile=auroraProfile(),peaks=[0,0,0];
for(let i=1;i<256;i++)for(let ch=0;ch<3;ch++)if(profile[i*4+ch]>profile[peaks[ch]*4+ch])peaks[ch]=i;
assert(peaks[2]<peaks[0]&&peaks[0]<peaks[1],'pink below green below red');
for(let ch=0;ch<3;ch++){assert.equal(profile[ch],0);assert.equal(profile[255*4+ch],0);}
const u=value=>({value}),root=new THREE.Group();
for(let i=0;i<9;i++)root.add(new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial()));
const legacy=[...root.children],shared=new THREE.DataTexture(new Uint8Array(4),1,1);let sharedDisposed=0;
shared.addEventListener('dispose',()=>sharedDisposed++);
const env={aurora:root,quality:'standard',api:{renderer:{extensions:{has:()=>true}}},sim:{mode:'custom',paused:true,speed:1},uniforms:{solarDepth:u(shared),linearOutput:u(0)},auroraUniforms:{auroraMap:u(shared),useData:u(0),strength:u(1.4),seed:u(15)}};
const c=new AuroraVolume(env);c.update(0,false);assert(!c.volumeMaterial);assert(legacy.every(x=>x.visible));
env.quality='high';c.update(0,false);const first=c.fluxMaterial;assert(first);assert(legacy.every(x=>!x.visible));
for(let i=0;i<10;i++)c.update(0,false);assert.equal(c.fluxMaterial,first);
let disposed=0;c.noise.addEventListener('dispose',()=>disposed++);
root.visible=false;c.update(0,false);assert(!c.volumeMaterial);assert.equal(disposed,1);assert.equal(sharedDisposed,0);
root.visible=true;for(let i=0;i<5;i++){env.quality='high';c.update(0,false);env.quality='standard';c.update(0,false);assert.deepEqual(root.children,legacy);assert(legacy.every(x=>x.visible));}
const warn=console.warn;console.warn=()=>{};
try{env.api.renderer.extensions.has=()=>false;env.quality='high';c.update(0,false);assert(c.failed&&legacy.every(x=>x.visible));assert(!c.volumeMaterial);}finally{console.warn=warn;}
console.log('Aurora volume: cyclic time, buffer budget, deterministic noise, altitude colors, cache ownership, disposal and GPU fallback passed');
