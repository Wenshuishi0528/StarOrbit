import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/weather.js'],bundle:true,platform:'node',format:'esm',write:false});
const {Weather}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
globalThis.document={getElementById:()=>null};
const w=Object.create(Weather.prototype);let applied=0;const releases=[];
Object.assign(w,{items:[],settings:{cloud:'builtin'},cache:{all:async()=>[]},reload:async()=>{},migrateCloudCache:async()=>{},normalizeCloudSelection(){},sync(){},save(){},render(){},restoreCloudLibrary:async()=>{},sim:{orbits:{restore:async()=>{}}},messages:{},apply:()=>{applied++;return new Promise(r=>releases.push(r));}});
await w.restore();assert.equal(applied,0,'startup metadata must finish without starting or waiting for texture decode');
const restore=w.restoreTextures();assert.equal(applied,2);assert.equal(w.restoreTextures(),restore,'background restore starts once');
for(const release of releases)release();await restore;
// Exercise the actual NASA validity texture path with rows distinguishable at
// strip boundaries. Check every output pixel, not a source-text pattern.
const width=1024,height=512;let reads=0,sourceY=0,closed=0,canvas;
const sample=(x,y)=>[(x+y)%256,(x*3)%256,y%256,(x*7+y*11)%256];
globalThis.createImageBitmap=async()=>({width,height,close(){closed++;}});
globalThis.OffscreenCanvas=class{
 constructor(w,h){this.width=w;this.height=h;canvas=this;assert(h<=64);}
 getContext(){return {
  clearRect(){},drawImage(bitmap,sx,sy,sw,sh,dx,dy,dw,dh){assert.equal(sh,dh);sourceY=sy;},
  getImageData(x,y,w,h){reads++;const data=new Uint8ClampedArray(w*h*4);for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)data.set(sample(xx,sourceY+yy),(yy*w+xx)*4);return {data};}
 };}
};
const decode=Object.create(Weather.prototype);decode.env={quality:'high',api:{renderer:{capabilities:{maxTextureSize:8192,getMaxAnisotropy:()=>4}}}};
const record={kind:'cloud',provider:'satcorps',channel:'validity',blob:new Blob()};
const texture=await decode.texture(record);
assert.equal(reads,8,'512 rows require 8 readbacks rather than 512');assert.equal(closed,1);assert.equal(canvas.width,1);
const out=texture.image.data;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const [r,,,a]=sample(x,y),i=(y*width+x)*4,v=Math.round(r*a/255);
 assert.deepEqual([...out.subarray(i,i+4)],[v,v,v,a]);
}
assert.equal(texture.userData.cloudChannel,2);assert.equal(texture.flipY,false);
let staleChecks=0;const previousReads=reads;
assert.equal(await decode.texture(record,()=>++staleChecks>2),null);
assert.equal(reads,previousReads+1,'superseded selection stops at the next strip');
console.log('Startup independent of pending cloud decode; NASA strip pixels, readback count, alpha and cancellation passed');
