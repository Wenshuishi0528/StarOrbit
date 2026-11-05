import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {build} from 'esbuild';
import {githubCloudOpacity} from '../src/cloud-texture.js';

const {outputFiles}=await build({entryPoints:['src/live-cloud.js'],bundle:true,platform:'node',format:'esm',write:false});
const {downloadLiveCloud}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

// Reproduce the input geometry with distinctive rows and longitudes. The mock
// bitmap substitutes for the browser's JPEG decoder; zlib decodes the real PNG.
const width=8192,height=4096,header=Uint8Array.of(255,216,255,192,0,17,8,16,0,32,0);
let input=new Blob([header]),saved=[],closed=0,readbacks=0,samples=0,flat=false,duringRead;
const rawValue=(x,y)=>40+(x+3*y)%170;
globalThis.createImageBitmap=async()=>({width,height,close(){closed++;}});
globalThis.OffscreenCanvas=class{
 constructor(w,h){assert(h<=64,'only short strips or a small validation thumbnail');this.width=w;this.height=h;}
 getContext(){let sy=0,scale=1;
  return {
   drawImage:(bitmap,x,y,sw,sh)=>{sy=y;scale=sw/this.width;assert.equal(x,0);},
   getImageData:(x,y,w,h)=>{
    const rgba=new Uint8ClampedArray(w*h*4);
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
     const value=flat?170:rawValue(xx*scale,sy+yy*scale),i=(yy*w+xx)*4;
     rgba[i]=rgba[i+1]=rgba[i+2]=value;rgba[i+3]=255;
    }
    if(this.width>256){readbacks++;duringRead?.();}else samples++;
    return {data:rgba};
   }
  };
 }
};
const weather={items:saved,pendingRecords:new Set(),
 fetch:async(url,max,options)=>{assert(url.endsWith('8192x4096/clouds.jpg'));assert.equal(max,50_000_000);return {blob:input};},
 checkedCloudHash:async blob=>createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex'),
 async store(kind,blob,meta){
  assert.equal(meta.contentHash,await this.checkedCloudHash(blob));
  const rec={...meta,kind,id:'saved',blob,sha256:meta.contentHash};
  saved.push(rec);this.pendingRecords.add(rec.id);return rec;
 }
};
const record=await downloadLiveCloud(weather);
assert.equal(record.time,null);assert.equal(record.processing,'live-cloud-cropped-v1');
assert.equal(record.channel,'validity');assert.equal(record.attribution,'Contains modified EUMETSAT data');
assert.equal(record.blob.type,'image/png');assert(record.blob.size<=30_000_000);
assert.equal(closed,1);assert.equal(readbacks,48,'never sample either mirrored cap');assert.equal(samples,1);
assert.equal(weather.pendingRecords.size,0);

const png=Buffer.from(await record.blob.arrayBuffer());
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
const chunks=new Map();
for(let offset=8;offset<png.length;){
 const n=png.readUInt32BE(offset),name=png.toString('ascii',offset+4,offset+8);
 chunks.set(name,png.subarray(offset+8,offset+8+n));offset+=12+n;
}
assert.equal(chunks.get('IHDR').readUInt32BE(0),width);
assert.equal(chunks.get('IHDR').readUInt32BE(4),height);
assert.equal(chunks.get('IHDR')[9],4,'grayscale plus separate validity alpha');
const rows=inflateSync(chunks.get('IDAT')),stride=width*2+1;
assert.equal(rows.length,stride*height);
function pixel(x,y){
 const r=rows.subarray(y*stride,(y+1)*stride);let gray=0,alpha=0;
 for(let i=0;i<=x;i++){
  if(r[0]===0){gray=r[1+i*2];alpha=r[2+i*2];}
  else{assert.equal(r[0],1);gray=(gray+r[1+i*2])%256;alpha=(alpha+r[2+i*2])%256;}
 }
 return [gray,alpha];
}
for(const y of [0,511,3584,4095])assert.deepEqual(pixel(639,y),[0,0],'no synthetic polar data');
for(const y of [648,2048,3450]){
 const x=1154;assert.deepEqual(pixel(x,y),[Math.round(255*githubCloudOpacity(rawValue(x,y)/255)),255],
  'interior coordinates and display transfer are preserved');
}
let previous=0;
for(let y=512;y<=560;y++){
 const alpha=pixel(0,y)[1];assert.equal(alpha,pixel(0,height-1-y)[1]);assert(alpha>=previous);previous=alpha;
}
assert.equal(previous,255);assert(pixel(0,530)[1]>0&&pixel(0,530)[1]<255);

assert.equal(await downloadLiveCloud(weather),record,'same input hash reuses the validated saved file');
assert.equal(closed,1);assert.equal(saved.length,1);
input=new Blob([header,Uint8Array.of(2)]);
const cancel=new AbortController(),before=readbacks;
duringRead=()=>cancel.abort();
await assert.rejects(downloadLiveCloud(weather,{signal:cancel.signal}),{name:'AbortError'});
assert.equal(readbacks,before+1);assert.equal(saved.length,1);assert.equal(closed,2);
duringRead=null;flat=true;
await assert.rejects(downloadLiveCloud(weather),/空白/);assert.equal(closed,3);assert.equal(saved.length,1);
input=new Blob(['not a JPEG']);
await assert.rejects(downloadLiveCloud(weather),/格式/);assert.equal(closed,3,'reject invalid header before decoding');
const wrongHeader=header.slice();wrongHeader[9]=48;input=new Blob([wrongHeader]);
await assert.rejects(downloadLiveCloud(weather),/尺寸/);assert.equal(closed,3);
console.log('Cropped Live Cloud PNG, polar validity, geographic alignment, content deduplication, cancellation and bad input passed');
