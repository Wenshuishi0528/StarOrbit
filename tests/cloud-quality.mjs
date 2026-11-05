import assert from 'node:assert/strict';
import {inspectCloudPixels,requireCloudQuality,inspectCloudBitmap} from '../src/cloud-quality.js';
const width=1024,height=512;
const field=()=>Uint8Array.from({length:width*height},(_,i)=>{const x=i%width,y=Math.floor(i/width);return Math.round(80+20*Math.sin(x*Math.PI*2/width)+20*Math.sin(y*Math.PI*2/height)+8*Math.sin(x*Math.PI*16/width));});
const good=field(),unchanged=good.slice();
assert.equal(inspectCloudPixels(good).status,'accepted');assert.deepEqual(good,unchanged,'quality screening never paints over source observations');
const plateau=field();for(let y=0;y<65;y++)for(let x=400;x<510;x++)plateau[y*width+x]=206;
const report=inspectCloudPixels(plateau);assert(report.reasons.includes('high-opacity-plateau'));assert.equal(report.metrics.plateauValue,206);assert.throws(()=>requireCloudQuality(report),e=>e.retryable===false&&e.quality===report);
const seam=field();for(let y=0;y<height;y++)for(let x=0;x<width/2;x++)seam[y*width+x]+=100;
const seams=inspectCloudPixels(seam);assert(seams.reasons.includes('dateline-seam'));assert(seams.reasons.includes('internal-seam'));assert.equal(seams.metrics.datelineRun,height);
const horizontal=field();for(let y=0;y<height/2;y++)for(let x=0;x<width;x++)horizontal[y*width+x]+=100;
assert(inspectCloudPixels(horizontal).metrics.horizontalRun>=128);
const shortFront=field();for(let y=100;y<120;y++)for(let x=400;x<420;x++)shortFront[y*width+x]+=70;
assert.equal(inspectCloudPixels(shortFront).status,'accepted','short cloud boundaries do not count as long source seams');
// Exact centre nearest sampling must agree with Pillow's 8192→1024 reduction.
let sourceY=0,calls=0;
globalThis.OffscreenCanvas=class{constructor(w,h){assert.equal(w,8192);assert.equal(h,1);}getContext(){return {clearRect(){},drawImage:(_bitmap,_x,y)=>{sourceY=y;calls++;},getImageData:()=>({data:Uint8ClampedArray.from({length:8192*4},(_,i)=>i%4===0?good[Math.floor(sourceY/8)*width+Math.floor(Math.floor(i/4)/8)]:255)})};}};
assert.deepEqual(await inspectCloudBitmap({width:8192,height:4096}),inspectCloudPixels(good));assert.equal(calls,512);delete globalThis.OffscreenCanvas;
console.log('Cloud plateau/seam screening, conservative short fronts, immutable input and bounded centre sampling passed');
