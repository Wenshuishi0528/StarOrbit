import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const {outputFiles}=await build({entryPoints:['src/gdps-cloud.js'],bundle:true,platform:'node',format:'esm',write:false});
const {downloadGdpsCloud}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const run1='2026-11-04T12:00:00Z',run2='2026-11-05T00:00:00Z',valid='2026-11-05T02:00:00Z';
const layer='GDPS_15km_TotalCloudCover',width=2400,height=1200;
let runSpec='2026-11-04T00:00:00Z/'+run1+'/PT12H',timeSpec='2026-11-04T12:00:00Z/2026-11-05T06:00:00Z/PT1H',catalogOK=true;
let now=Date.parse('2026-11-05T02:12Z'),imageState='proper',readHook,closed=0,decodes=0;
const realNow=Date.now;Date.now=()=>now;

// The DOM adapter exposes the same namespaced element interface as native
// DOMParser. The input includes an unrelated layer with deliberately wrong times.
globalThis.DOMParser=class{
 parseFromString(text,mime){
  assert.equal(mime,'application/xml');assert.equal(text,'fixture');
  const named=(name,r,t)=>{
   const dim=(name,s)=>({localName:'Dimension',getAttribute:()=>name,textContent:s});
   return {textContent:name,parentElement:{localName:'Layer',children:[dim('time',t),dim('reference_time',r)]}};
  };
  return {getElementsByTagNameNS(ns,key){
   if(key==='parsererror')return catalogOK?[]:[{}];
   return [named('different-layer','1970-01-01T00:00:00Z','1970-01-01T00:00:00Z'),named(layer,runSpec,timeSpec)];
  }};
 }
};
globalThis.createImageBitmap=async()=>{decodes++;return {width,height,close:()=>closed++};};
globalThis.OffscreenCanvas=class{
 constructor(w,h){assert(w===width&&h<=64);this.width=w;this.height=h;}
 getContext(){let sampleY;
  return {clearRect(){},drawImage(b,x,y){sampleY=y;},getImageData(x,y,w,h){
   readHook?.();const data=new Uint8ClampedArray(w*h*4);
   for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
    const i=(yy*w+xx)*4,value=imageState==='blank'?85:(xx%4)*85;
    data[i]=data[i+1]=data[i+2]=value;
    if(imageState==='colour'&&xx===8)data[i+1]=23;
    data[i+3]=imageState==='polar-gap'&&sampleY+yy===height-1?0:255;
   }return {data};
  }};
 }
};
const fakeHeader=new Uint8Array(33);fakeHeader.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
const dims=new DataView(fakeHeader.buffer);dims.setUint32(16,width);dims.setUint32(20,height);
let image=new Blob([fakeHeader],{type:'image/png'}),lastURL;
const weather={items:[],pendingRecords:new Set(),fetch:async(url,max)=>{
 const p=new URL(url).searchParams;
 if(p.get('REQUEST')==='GetCapabilities'){assert.equal(p.get('LAYER'),layer);return {blob:new Blob(['fixture'])};}
 assert.equal(max,30_000_000);lastURL=p;return {blob:image};
},checkedCloudHash:async blob=>{
 return createHash('sha256').update(new Uint8Array(await blob.arrayBuffer())).digest('hex');
},
 async store(kind,blob,meta){
  const row={kind,blob,...meta,id:meta.archiveKey+'-'+meta.contentHash,sha256:meta.contentHash};
  const i=this.items.findIndex(r=>r.id===row.id);if(i<0)this.items.push(row);else this.items[i]=row;
  this.pendingRecords.add(row.id);return row;
 }};
try{
 const record=await downloadGdpsCloud(weather);
 assert.equal(record.forecastRun,Date.parse(run1));assert.equal(record.time,Date.parse(valid));
 assert.equal(record.channel,'validity');assert.equal(record.productType,'forecast');assert.equal(record.coverage,1);
 assert.deepEqual(record.polarCoverage,{north:1,south:1});
 assert.equal(record.manualValidation.validPixels,width*height,'clear-sky zeroes are valid pixels');
 assert.equal(record.archiveKey,'gdps:'+Date.parse(run1)+':'+Date.parse(valid));
 assert.equal(lastURL.get('TIME'),valid);assert.equal(lastURL.get('DIM_REFERENCE_TIME'),run1);
 assert.equal(lastURL.get('BBOX'),'-90,-180,90,180');assert.equal(lastURL.get('CRS'),'EPSG:4326');
 const sld=lastURL.get('SLD_BODY');for(let p=0;p<=100;p++){
  const gray=Math.round(p*255/100).toString(16).padStart(2,'0').repeat(3);
  assert(sld.includes('color="#'+gray+'" quantity="'+p+'"'));
 }
 assert.equal(await downloadGdpsCloud(weather),record,'same issue, validity and verified PNG are reused');
 assert.equal(decodes,1);
 record.blob.arrayBuffer=async()=>{throw new DOMException('The requested file could not be read','NotReadableError');};image=new Blob([fakeHeader],{type:'image/png'});
 const repaired=await downloadGdpsCloud(weather);
 assert.equal(repaired.id,record.id);assert.equal(repaired.blob,image);assert.equal(repaired.integrityFailed,false);
 assert.equal(weather.items.length,1);assert.equal(decodes,2,'refetch repairs unusable IndexedDB Blob');
 runSpec=run1+','+run2;
 const revised=await downloadGdpsCloud(weather);assert.equal(revised.time,record.time);assert.equal(revised.sha256,record.sha256);
 assert.notEqual(revised.id,record.id,'identical pixels from two runs are distinct forecasts');
 now=Date.parse('2026-11-05T02:30:00Z');assert.equal(await downloadGdpsCloud(weather),revised,'tie uses earlier listed hour');
 now+=60000;assert.equal((await downloadGdpsCloud(weather)).time,Date.parse('2026-11-05T03:00:00Z'),'near-future valid time is already published');
 timeSpec='2026-11-05T01:00:00Z,2026-11-05T04:00:00Z';
 assert.equal((await downloadGdpsCloud(weather)).time,Date.parse('2026-11-05T04:00:00Z'),'catalog gaps are never filled');
 const baseline=weather.items.length;
 image=new Blob([fakeHeader,'revised'],{type:'image/png'});
 imageState='blank';await assert.rejects(downloadGdpsCloud(weather),/空白/);
 imageState='polar-gap';await assert.rejects(downloadGdpsCloud(weather),/两极/);
 imageState='colour';await assert.rejects(downloadGdpsCloud(weather),/灰度/);
 const cancel=new AbortController();imageState='proper';readHook=()=>cancel.abort();
 await assert.rejects(downloadGdpsCloud(weather,{signal:cancel.signal}),{name:'AbortError'});readHook=null;
 image=new Blob(['<ServiceException>bad map</ServiceException>'],{type:'text/xml'});
 await assert.rejects(downloadGdpsCloud(weather),/格式/);
 timeSpec='2027-01-02T00:00:00Z';await assert.rejects(downloadGdpsCloud(weather),/当前时间/);
 runSpec='2026-11-06T12:00:00Z';await assert.rejects(downloadGdpsCloud(weather),/预报目录/);
 runSpec=run1+'/2026-11-20T00:00:00Z/PT0S';await assert.rejects(downloadGdpsCloud(weather),/预报目录/);
 catalogOK=false;await assert.rejects(downloadGdpsCloud(weather),/预报目录/);
 assert.equal(weather.items.length,baseline);assert.equal(closed,decodes);assert.equal(weather.pendingRecords.size,0);
}finally{Date.now=realNow;}
console.log('GDPS advertised forecast cycles/hours, linear cloud cover, valid clear sky and poles, corrections, stale data and cancellation passed');
