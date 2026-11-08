import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGroundEarthCompositor } from '../src/ground-earth-compositor.js';
const root = new THREE.Group(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
scene.add(root);
const terrain = new THREE.Group(), air = new THREE.Group();
root.add(terrain, air);
const original = new THREE.WebGLRenderTarget(800, 600);
let current = original, fail = false;
const passes = [], targets = new Set(), disposed = new Set();
const renderer = {
  autoClear: true,
  getRenderTarget: () => current,
  setRenderTarget(t) { current=t;if(t && t!==original && !targets.has(t)){targets.add(t);t.addEventListener('dispose',()=>disposed.add(t));} },
  getClearAlpha: () => .6, getClearColor: c=>c.set(0x123456), setClearColor() {}, clear(){},
  getDrawingBufferSize: v=>v.set(100,100),
  readRenderTargetPixels(t,x,y,w,h,p){assert(x>=0 && x<t.width && y>=0 && y<t.height);p.fill(x<400?255:0);},
  render(s){passes.push({target:current,depth:uniforms.surfaceDepthPass.value,air:air.visible,scene:s});if(fail)throw Error('GPU failure');},
};
const uniforms = { terrainViewport:{value:new THREE.Vector2()}, terrainFar:{value:0},surfaceDepthPass:{value:0},terrainOcclusion:{value:0},terrainDistance:{value:null} };
const view=createGroundEarthCompositor({renderer,scene,camera,root,uniforms,surfaces:()=>[terrain]});
view.render(false,()=>{});
assert.equal(targets.size,1,'opaque mode only needs a terrain distance target');
assert.equal(passes[0].depth,1);assert.equal(passes[0].air,false);
assert.equal(passes[1].target,original);assert.equal(passes[1].air,true);
assert.equal(uniforms.terrainViewport.value.x,800,'export target dimensions take precedence');
assert.equal(current,original);assert.equal(renderer.autoClear,true);
assert.equal(view.blocksScreen(-.5,0),false);assert.equal(view.blocksScreen(.5,0),true);
view.render(true,()=>{});assert.equal(targets.size,2);
assert.equal(passes.at(-1).target,original);assert.notEqual(passes.at(-1).scene,scene);
view.render(false,()=>{});assert.equal(disposed.size,1,'optional target released on disabling');
fail=true;assert.throws(()=>view.render(false,()=>{}),/GPU failure/);
assert.equal(air.visible,true);assert.equal(uniforms.surfaceDepthPass.value,0);assert.equal(uniforms.terrainOcclusion.value,0);assert.equal(current,original);assert.equal(renderer.autoClear,true);
view.dispose();assert.equal(disposed.size,2);
console.log('Ground compositor: opaque default, opt-in composite, terrain masks, export sizing, allocation reuse/release and exception restoration passed');
