// Exercise export/import, identity, and recovery through the normal Weather methods.
// Node has no ImageBitmap/Canvas: Pillow decodes real PNG fixtures at the same
// sampling size as the browser. Hashing, validation, storage and selection are real.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const {outputFiles}=await build({entryPoints:['src/weather.js'],bundle:true,platform:'node',format:'esm',write:false});
const {Weather}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const fixtures=JSON.parse(execFileSync('python3',['-c',`
import base64, io, json
from PIL import Image
result = {}
for name, width, limit in [('belt', 4096, 60), ('polar', 4096, 90), ('south', 4096, 60), ('small', 2048, 60), ('east',4096,60), ('forecast',2400,90)]:
    h = width//2
    image = Image.new('LA', (width,h))
    margin = round(h*(90-limit)/180)
    image.paste((153,255), (0,margin,width,h if name=='south' else h-margin))
    if name=='east':
        image = Image.new('LA', (width,h))
        image.paste((195,255),(int(width*.78), h//3, int(width*.95), 2*h//3))
    data = io.BytesIO()
    image.save(data, 'PNG')
    with Image.open(io.BytesIO(data.getvalue())) as decoded:
        alpha = decoded.resize((256,128),Image.Resampling.BILINEAR).getchannel('A').tobytes()
    result[name] = [base64.b64encode(data.getvalue()).decode(), base64.b64encode(alpha).decode()]
print(json.dumps(result))
`],{encoding:'utf8'}));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const byDigest=new Map(Object.values(fixtures).map(([png,alpha])=>[sha(Buffer.from(png,'base64')),Buffer.from(alpha,'base64')]));
globalThis.createImageBitmap=async blob=>{
 const data=Buffer.from(await blob.arrayBuffer()),alpha=byDigest.get(sha(data));
 assert(alpha,'only hashed, intact fixture PNGs should reach the decoder');
 return {width:data.readUInt32BE(16),height:data.readUInt32BE(20),alpha,close(){}};
};
globalThis.OffscreenCanvas=class{
 getContext(){
  let alpha;
  return {drawImage(bitmap){alpha=bitmap.alpha;},getImageData(x,y,w,h){
   assert.equal(w*h,alpha.length);
   const data=new Uint8ClampedArray(w*h*4);
   for(let i=0;i<alpha.length;i++)data[i*4+3]=alpha[i];
   return {data};
  }};
 }
};
let download;
globalThis.document={createElement:()=>({click(){download=this.href;}})};
const sourceDate=Date.UTC(2025,10,4,1);
const meta={kind:'cloud',provider:'gmgsi',time:sourceDate,channel:'validity',processing:'gmgsi-ir-v1',
 resolution:'4096×2048',nativeResolution:'4999×3000',coverage:.66,release:'NOAA GMGSI LW v3r0',
 observedStart:sourceDate,observedEnd:sourceDate+599000,createdAt:sourceDate+2100000,
 source:'https://noaa-gmgsi-pds.s3.amazonaws.com/GMGSI_LW/fixture.nc'};
function file(name,metadata){
 const [base64]=fixtures[name];
 return new Blob([JSON.stringify({format:'tiangong-weather-1',meta:{sha256:sha(Buffer.from(base64,'base64')),...metadata},base64})]);
}
const w=Object.create(Weather.prototype);
const records=new Map();
Object.assign(w,{sim:{missionId:'tiangong'},items:[],active:{cloud:null},settings:{cloud:'builtin'},messages:{},
 pendingRecords:new Set(),cache:{async put(r){records.set(r.id,r);}},async reload(){this.items=[...records.values()];},
 async trim(){},render(){},sync(){},save(){},async apply(){this.active.cloud=this.settings.cloudHistory;}});
await w.importFile(file('belt',meta),{cloudOnly:true});
const id=w.active.cloud,row=records.get(id);
assert.equal(row.provider,'gmgsi');
assert.equal(row.createdAt,meta.createdAt);
assert.equal(row.observedEnd,meta.observedEnd);
assert.equal(row.manualValidation.sha256,row.sha256);
assert(row.manualValidation.validPixels>0 && row.favorite);

// Capture the Blob made by the real exporter; release its delayed URL cleanup timer.
const timer=globalThis.setTimeout;
try{
 globalThis.setTimeout=(...args)=>timer(...args).unref();
 await w.exportRecord(row);
}finally{globalThis.setTimeout=timer;}
const snapshot=await (await fetch(download)).blob();
URL.revokeObjectURL(download);
const damaged=JSON.parse(await snapshot.text());
damaged.base64=fixtures.polar[0];
await assert.rejects(()=>w.importFile(new Blob([JSON.stringify(damaged)]),{cloudOnly:true}),/校验失败/);
assert.notEqual(row.integrityFailed,true,'a damaged external file cannot poison the healthy copy it came from');
assert.equal(w.active.cloud,id);
row.integrityFailed=true; row.blob=new Blob(['corrupted local copy']);
await w.importFile(snapshot,{cloudOnly:true});
assert.equal(records.size,1);
assert.equal(records.get(id).integrityFailed,false,'a verified import repairs the original local copy');
assert.equal(sha(Buffer.from(await records.get(id).blob.arrayBuffer())),row.sha256);

for(const [name,changes,reason] of [
 ['belt',{coverage:1.2},/观测/],['small',{},/尺寸/],['belt',{channel:'alpha'},/通道/],
 ['polar',{},/极区/],['south',{},/极区/],['belt',{time:Date.now()+86400000},/日期/],
]){
 await assert.rejects(()=>w.importFile(file(name,{...meta,...changes}),{cloudOnly:true}),reason);
 assert.equal(w.active.cloud,id);
 assert.equal(records.size,1,'an invalid import cannot add a record');
}

const github={kind:'cloud',provider:'github',time:null,channel:'validity',processing:'live-cloud-cropped-v1',
 latitudeLimit:67.5,featherDegrees:1.5,attribution:'Contains modified EUMETSAT data',sourceSha256:'a'.repeat(64)};
await w.importFile(file('belt',github),{cloudOnly:true});
assert.equal(records.size,2,'two providers can retain identical processed bytes');
const live=records.get(w.active.cloud);
assert.equal(live.sha256,row.sha256);
assert.equal(live.time,null);
assert.equal(live.attribution,github.attribution);
assert.notEqual(live.id,row.id);
assert.equal(live.sourceSha256,undefined,'an imported raw-source hash is not a trusted download cache key');
await assert.rejects(()=>w.importFile(file('polar',github),{cloudOnly:true}),/极区/);
console.log('Cloud snapshots: validated NOAA/Live Cloud Maps imports, exported PNG round trip, damaged copy recovery and provider isolation passed');

const himawari={...meta,provider:'himawari',slot:'01:00',processing:'himawari-cloud-mask',attribution:'NOAA / JMA'};
await w.importFile(file('east',himawari),{cloudOnly:true});
assert.equal(records.get(w.active.cloud).provider,'himawari');
assert.equal(records.get(w.active.cloud).slot,'01:00');
await assert.rejects(()=>w.importFile(file('belt',himawari),{cloudOnly:true}),/覆盖范围/);
const forecast={...meta,provider:'gdps',forecastRun:sourceDate-12*3600000,productType:'forecast',resolution:'2400×1200'};
await w.importFile(file('forecast',forecast),{cloudOnly:true});
const run1=records.get(w.active.cloud);
assert.equal(run1.forecastRun,forecast.forecastRun);assert.equal(run1.productType,'forecast');
await w.importFile(file('forecast',{...forecast,forecastRun:sourceDate-24*3600000}),{cloudOnly:true});
assert.notEqual(run1.id,w.active.cloud,'equal pixels valid at the same time can come from different forecast runs');
await assert.rejects(()=>w.importFile(file('forecast',{...forecast,forecastRun:sourceDate+86400000}),{cloudOnly:true}),/预报/);
