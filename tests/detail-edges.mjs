import assert from 'node:assert/strict';
import {detailRect} from '../src/earth-detail.js';
import {earthFragment} from '../src/earth-shaders.js';

// Geometric reference for the shader's exposed-edge mask. Test both atlas grids,
// screen-space distances, partial residency and the periodic longitude boundary.
const near=v=>Math.abs(v)<.00001;
function neighbours(rect,slots,diagonal=false){
 const bottom=rect[1]<.00001?1:0,top=rect[1]+rect[3]>.99999?1:0;
 const edges=diagonal?[bottom,bottom,top,top]:[0,0,bottom,top];
 for(const {rect:r,fade} of slots){
  if(fade<=0||!near(rect[2]-r[2])||!near(rect[3]-r[3]))continue;
  let x=r[0]-rect[0];x-=Math.floor(x+.5);const y=r[1]-rect[1];
  const adjacent=diagonal?[near(x+rect[2])&&near(y+rect[3]),near(x-rect[2])&&near(y+rect[3]),near(x+rect[2])&&near(y-rect[3]),near(x-rect[2])&&near(y-rect[3])]:[near(x+rect[2])&&near(y),near(x-rect[2])&&near(y),near(y+rect[3])&&near(x),near(y-rect[3])&&near(x)];
  adjacent.forEach((a,i)=>{if(a)edges[i]=Math.max(edges[i],fade);});
 }
 return edges;
}
const smooth=t=>{t=Math.min(1,Math.max(0,t));return t*t*(3-2*t);};
function weight(rect,uv,dx,dy,slots,fade=1){
 const p=[(uv[0]-rect[0])/rect[2],(uv[1]-rect[1])/rect[3]];
 const width=[0,1].map(i=>Math.max(2*Math.hypot(dx[i],dy[i])/rect[i+2],.000001));
 const distances=[p[0],1-p[0],p[1],1-p[1]],edges=neighbours(rect,slots);
 const proximity=distances.map((d,i)=>1-smooth(d/width[i>>1])),diagonal=neighbours(rect,slots,true);
 const corners=[proximity[0]*proximity[2],proximity[1]*proximity[2],proximity[0]*proximity[3],proximity[1]*proximity[3]];
 return fade*proximity.reduce((v,w,i)=>v*(1-w*(1-edges[i])),1)*corners.reduce((v,w,i)=>v*(1-w*(1-diagonal[i])),1);
}
for(const [columns,rows] of [[12,6],[24,12]]){
 const rect=(x,y)=>detailRect({x,y},columns,rows),a=rect(3,2),b=rect(4,2),slot=r=>({rect:r,fade:1});
 const dx=[a[2]/200,0],dy=[0,a[3]/200],middle=a[1]+a[3]/2,boundary=a[0]+a[2];
 assert.ok(weight(a,[boundary,middle],dx,dy,[slot(a)])<1e-12,'exposed edge meets the base map');
 for(const pixels of [0,.25,1,1.5,2,5,50]){
  const uv=[boundary-pixels*dx[0],middle];
  assert.ok(Math.abs(weight(a,uv,dx,dy,[slot(a)])-smooth(pixels/2))<1e-10,'feather occupies only two screen pixels');
  assert.equal(weight(a,uv,dx,dy,[slot(a),slot(b)]),1,'resident shared edge retains native detail');
 }
 // Equal screen-normal footprint under rotation or skew gives the same feather.
 assert.ok(Math.abs(weight(a,[boundary-dx[0],middle],[dx[0]*.6,0],[dx[0]*.8,dy[1]],[slot(a)])-.5)<1e-10);
 const slots=[a,b,rect(3,3),rect(4,3)].map(slot),corner=[boundary,a[1]];
 for(const {rect:r} of slots)assert.equal(weight(r,corner,dx,dy,slots),1,'four resident tiles do not expose a soft cross');
 for(const fades of [[1,1,1,.2],[1,1,1,0],[.2,.4,.6,.8]]){
  const loading=slots.map((s,i)=>({...s,fade:fades[i]})),product=fades.reduce((p,f)=>p*f,1);
  for(const s of loading)assert.ok(Math.abs(weight(s.rect,corner,dx,dy,loading,s.fade)-product)<1e-10,'all four corner limits share every fade, including the diagonal');
  // Walk the complete two-pixel strip along both shared edges. Their one-sided
  // limits must agree, not just the exact four-way intersection.
  for(const offset of [0,.1,.25,.5,1,1.5,2,3]){
   for(const [left,right,uv] of [[0,1,[boundary,a[1]+offset*dy[1]]],[2,3,[boundary,a[1]-offset*dy[1]]],[0,2,[boundary-offset*dx[0],a[1]]],[1,3,[boundary+offset*dx[0],a[1]]]]){
    const x=loading[left],y=loading[right];
    assert.ok(Math.abs(weight(x.rect,uv,dx,dy,loading,x.fade)-weight(y.rect,uv,dx,dy,loading,y.fade))<1e-10,'partial-load edge strip is continuous');
   }
  }
 }
 const missingDiagonal=slots.slice(0,3);
 for(const s of missingDiagonal)assert.ok(weight(s.rect,corner,dx,dy,missingDiagonal)<1e-12,'absent fourth slot yields the same base-map corner limit');
 const west=rect(0,2),east=rect(columns-1,2),dateSlots=[slot(west),slot(east)];
 const wrappedU=1-Math.floor(1);assert.equal(Math.floor(wrappedU*columns),0,'exact positive 180 degrees belongs to the first tile');
 assert.equal(neighbours(west,dateSlots)[0],1);assert.equal(neighbours(east,dateSlots)[1],1);
 assert.equal(weight(west,[0,middle],dx,dy,dateSlots),1);assert.equal(weight(east,[1,middle],dx,dy,dateSlots),1);
 assert.equal(neighbours(a,[slot(a),{rect:b,fade:0}])[1],0,'empty slot is not a neighbour');
 const wrapSlots=[rect(columns-1,2),rect(0,2),rect(columns-1,3),rect(0,3)].map((r,i)=>({rect:r,fade:[1,.4,.7,.2][i]}));
 const wrapProduct=.4*.7*.2;
 for(const s of wrapSlots){const u=s.rect[0]===0?0:1;assert.ok(Math.abs(weight(s.rect,[u,a[1]],dx,dy,wrapSlots,s.fade)-wrapProduct)<1e-10,'diagonal adjacency wraps at the date line');}
 for(const fade of [.2,.5,.9]){
  const partial=[slot(a),{rect:b,fade}];
  assert.ok(Math.abs(weight(a,[boundary,middle],dx,dy,partial)-fade)<1e-10);
  assert.ok(Math.abs(weight(b,[boundary,middle],dx,dy,partial,fade)-fade)<1e-10,'loading edge has matching weights on both sides');
 }
 assert.equal(neighbours(rect(3,0),[])[3],1);assert.equal(neighbours(rect(3,rows-1),[])[2],1);
 assert.deepEqual(neighbours(rect(3,0),[],true).slice(2),[1,1]);assert.deepEqual(neighbours(rect(3,rows-1),[],true).slice(0,2),[1,1]);
}
// Production wiring: both day and night use the common footprint/adjacency path.
assert.equal((earthFragment.match(/sampleDetail\(detailMap\d.*c,false\)/g)||[]).length,4);
assert.equal((earthFragment.match(/sampleDetail\(nightDetailMap\d.*c,true\)/g)||[]).length,4);
assert.ok(earthFragment.includes('2.*sqrt(dx*dx+dy*dy)/rect.zw'));
assert.ok(earthFragment.includes('delta.x-=floor(delta.x+.5)'));
assert.ok(earthFragment.includes('vec2(fract(uv.x),uv.y)-rect.xy'));
assert.ok(earthFragment.includes('detailNeighbours(rect,night,true)'));
assert.ok(earthFragment.includes('edge.x*edge.y*edge.z*edge.w*corner.x*corner.y*corner.z*corner.w'));
assert.ok(earthFragment.includes('textureGrad(tex,tuv,dx/rect.zw*scale,dy/rect.zw*scale)'));
console.log({detailEdges:'pass',grids:['12x6','24x12'],featherScreenPixels:2,residentSharedEdges:'native detail',longitudeWrap:'pass',partialLoadContinuity:'pass',diagonalCornerContinuity:'pass'});
