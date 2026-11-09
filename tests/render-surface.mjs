import assert from 'node:assert/strict';
import { resizeRenderSurface } from '../src/render-surface.js';
let width=800,height=600,ratio=1,allocations=0;
const renderer={
 getSize(v){return v.set(width,height);},getPixelRatio(){return ratio;},
 setPixelRatio(v){ratio=v;allocations++;},
 setSize(w,h,css){assert.equal(css,false);width=w;height=h;allocations++;},
 setViewport(...v){this.viewport=v;},setScissorTest(v){this.scissor=v;}
};
resizeRenderSurface(renderer,800,600,1);
assert.equal(allocations,0,'idle frames do not reallocate buffers');
resizeRenderSurface(renderer,2560,1440,2);
assert.deepEqual(renderer.viewport,[0,0,2560,1440]);
assert.equal(ratio,1.6);
renderer.viewport=[0,0,1280,720];renderer.scissor=true;
resizeRenderSurface(renderer,2560,1440,1.25);
assert.deepEqual(renderer.viewport,[0,0,2560,1440]);
assert.equal(renderer.scissor,false);
assert.equal(ratio,1.25,'browser zoom/monitor DPR changes update without a logical resize');
const count=allocations;
resizeRenderSurface(renderer,2560,1440,1.25);assert.equal(allocations,count);
assert.equal(resizeRenderSurface(renderer,0,0,1),false);assert.equal(allocations,count);
console.log('Shared render surface: resize, current DPR, full viewport, scissor reset and idle allocation passed');
