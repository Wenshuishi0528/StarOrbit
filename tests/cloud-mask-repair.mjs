import assert from 'node:assert/strict';
import {repairCloudMask} from '../src/cloud-mask-repair.js';
import {githubCloudOpacity} from '../src/cloud-texture.js';
const lut=Float32Array.from({length:256},(_,i)=>githubCloudOpacity(i/255)),w=64,h=32,run=a=>repairCloudMask(a,w,h,lut),mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
for(const level of [0,50,128,240,255])assert.ok(run(new Uint8Array(w*h).fill(level)).every(v=>v===Math.round(255*lut[level])));
const ramp=Uint8Array.from({length:w*h},(_,i)=>100+(i%w));const r=run(ramp);for(let y=0;y<h;y++)for(let x=2;x<w-2;x++)assert.equal(r[y*w+x],Math.round(255*lut[ramp[y*w+x]]));
const step=Uint8Array.from({length:w*h},(_,i)=>(i%w)<32?0:255),smooth=run(step);for(let x=5;x<59;x++){assert.ok(smooth[x]>=smooth[x-1]);if(x<30)assert.equal(smooth[x],0);if(x>33)assert.equal(smooth[x],255);}assert.ok(Math.abs(mean(smooth)-mean(step))<.01);
const noisy=Uint8Array.from({length:w*h},(_,i)=>(i%2+Math.floor(i/w))%2?220:60),out=run(noisy),raw=Uint8Array.from(noisy,v=>Math.round(lut[v]*255));
const variation=a=>a.reduce((s,v,i)=>s+(i%w?Math.abs(v-a[i-1]):0),0)/a.length;
assert.ok(variation(out)<variation(raw)*.15);assert.ok(Math.abs(mean(out)-mean(raw))<1);
// Longitude wrap must be translation equivariant, including the antimeridian.
const shifted=Uint8Array.from(step,(_,i)=>step[Math.floor(i/w)*w+(i%w+29)%w]),rs=run(shifted);
for(let i=0;i<rs.length;i++)assert.equal(rs[i],smooth[Math.floor(i/w)*w+(i%w+29)%w]);
assert.throws(()=>repairCloudMask(new Uint8Array(5),3,2,lut));
console.log({cloudRepair:'pass',constantAndSmoothRegions:'preserved',sharpEdgeSpread:'two source pixels',speckleVariationRatio:variation(out)/variation(raw),longitudeWrap:'pass'});
// Independent direct convolution catches rolling-row mistakes at poles and seams.
const source=Uint8Array.from({length:16*12},(_,i)=>(i*73+i*i*11)%256),actual=repairCloudMask(source,16,12,lut),weights=[1,4,6,4,1];
for(let y=0;y<12;y++)for(let x=0;x<16;x++){let sum=0,lo=255,hi=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const v=source[Math.max(0,Math.min(11,y+dy))*16+(x+dx+16)%16];sum+=weights[dy+2]*weights[dx+2]*lut[v]/256;lo=Math.min(lo,v);hi=Math.max(hi,v);}let t=Math.max(0,Math.min(1,((hi-lo)/255-.1)/.18));t*=t*(3-2*t);const v=lut[source[y*16+x]];assert.ok(Math.abs(actual[y*16+x]-Math.round((v+(sum-v)*t)*255))<=1);}
