import assert from 'node:assert/strict';
import {SolarObservations,SOLAR_CHANNELS,SOLAR_MAX_IMAGE_BYTES,decodeSolarImage} from '../src/solar-data.js';
import {SolarCache} from '../src/solar-cache.js';

const iso='2026-11-06T04:00:00.000Z';let now=Date.parse('2026-11-06T04:30:00Z');
const channelIds=SOLAR_CHANNELS.map(c=>c.id);assert.deepEqual(channelIds,['hmi','aia171','aia304','aia131']);
function png(size=1024) {const data=new Uint8Array(32);data.set([137,80,78,71,13,10,26,10]);const view=new DataView(data.buffer);view.setUint32(16,size);view.setUint32(20,size);return data;}
function meta(channel='aia171',size=1024,imageId='193672473') {
 return {id:`sdo:${channel}:${imageId}:${size}`,imageId,channel,provider:'SDO / Helioviewer',sourceUrl:'https://api.helioviewer.org/v2/takeScreenshot/?date=2026-11-06T04%3A00%3A00Z',
  observedAt:iso,width:size,height:size,radiusFraction:.787,solarCenterUV:[.5,.5],solarNorthUp:true,
  token:'a'.repeat(32),imageUrl:'/api/solar/image?token='+'a'.repeat(32)};
}
class Cache {
 constructor(records=[]){this.data=new Map(records.map(r=>[r.channel,r]));this.persistent=true;}
 async all(){return [...this.data.values()];}
 async put(record){if(this.fail)throw Error('quota');this.data.set(record.channel,structuredClone(record));}
}
let restoredOnStartup=0;
const seeded=channelIds.map(channel=>({...meta(channel),fetchedAt:iso,checkedAt:iso,origin:'download',bytes:png().buffer}));
const lazy=new SolarObservations({cache:new Cache(seeded),decode:async()=>{restoredOnStartup++;},storage:null,canUpdate:false});
lazy.subscribe(()=>{});lazy.snapshot();await new Promise(resolve=>setImmediate(resolve));
assert.equal(restoredOnStartup,0,'construction, subscriptions and card snapshots do not decode unused solar images at application startup');
await lazy.ready;assert.equal(restoredOnStartup,4,'first module use still validates every restored image before exposing records');lazy.dispose();
// The browser decoder is tested separately; this double keeps lifecycle tests
// independent of Node canvas support, while checking dimensions at this boundary.
let decodeCount=0;
async function decode(blob,record){decodeCount++;assert.equal(blob.type,'image/png');const b=new DataView(await blob.arrayBuffer());if(blob.size<24||b.getUint32(16)!==record.width||b.getUint32(20)!==record.height)throw Error('decode failed');}
let currentMeta=meta(),image=png(),fail=false,requests=[];
const fetcher=async url=>{
 requests.push(url);if(fail)throw Error('offline');
 return url.startsWith('/api/solar/metadata')?new Response(JSON.stringify(currentMeta),{headers:{'content-type':'application/json'}}):new Response(image,{headers:{'content-type':'image/png'}});
};
const cache=new Cache(),store=new SolarObservations({cache,fetcher,decode,now:()=>now,storage:null,canUpdate:true,flux:false});
await store.ready;assert.equal(requests.length,0,'construction only restores; it never downloads every band');
assert.equal(store.snapshot().resolution,2048);store.setChannel('aia171');store.setResolution(1024);
const a=store.update(),b=store.update();assert.equal(a,b,'shared same-band in-flight request');
assert.equal(store.snapshot().loading,true);const frame=await a;
assert.equal(requests.length,2);assert.equal(store.snapshot().record,frame);assert.equal(store.snapshot().loading,false);
assert.equal(frame.origin,'download');assert.equal(cache.data.get('aia171').bytes instanceof ArrayBuffer,true);assert.equal(cache.data.get('aia171').blob,undefined);
await store.ensure();await store.update();assert.equal(requests.length,2,'cache and check cooldown do not redownload');
now+=61000;await store.update();assert.equal(requests.length,3,'same image ID reuses bytes after a metadata check');
assert.equal(store.snapshot().record.revision,frame.revision,'unchanged image does not recreate renderer texture');

now+=61000;currentMeta=meta('aia171',1024,'193672474');image=png(2048);
await assert.rejects(store.update(),/decode failed/);assert.equal(store.snapshot().record,frame,'bad replacement leaves previous image available');
assert.match(store.snapshot().error,/decode failed/);
store.setChannel('aia304');assert.equal(store.snapshot().record,null,'different wavelengths never borrow each other’s image');
store.setChannel('aia171');image=png();fail=true;await assert.rejects(store.update(),/offline/);assert.equal(store.snapshot().record,frame);fail=false;
now+=7*3600000;assert.equal(store.snapshot().stale,true);assert.equal(await store.ensure(),frame,'stale images remain explicitly usable without automatic refresh');

const exported=await store.exportSnapshot();assert.equal(exported.type,'application/json');
const offline=new SolarObservations({cache:new Cache(),decode,fetcher:()=>{throw Error('must not network');},now:()=>now,storage:null,canUpdate:false,flux:false});
const imported=await offline.importSnapshot(exported);assert.equal(imported.origin,'import');assert.equal(imported.channel,'aia171');assert.equal(imported.observedAt,iso);
assert.equal(await offline.ensure('aia171',{resolution:2048}),imported,'offline mode keeps available resolution');
await assert.rejects(offline.update(),/网页版/);assert.equal(offline.snapshot().record,imported);
const corrupt=JSON.parse(await exported.text());corrupt.metadata.observedAt='2026-02-31T04:00:00Z';
await assert.rejects(offline.importSnapshot(new Blob([JSON.stringify(corrupt)])),/时间无效/);
corrupt.metadata.observedAt=iso;corrupt.metadata.radiusFraction=2;
await assert.rejects(offline.importSnapshot(new Blob([JSON.stringify(corrupt)])),/几何无效/);
corrupt.metadata.radiusFraction=.787;corrupt.image.mime='image/svg+xml';
await assert.rejects(offline.importSnapshot(new Blob([JSON.stringify(corrupt)])),/快照/);
assert.equal(offline.snapshot().record,imported);

const restored=new SolarObservations({cache,decode,fetcher,now:()=>now,storage:null,canUpdate:false,flux:false});await restored.ready;
assert.equal(restored.snapshot().records.aia171.id,frame.id);assert.equal(restored.snapshot().cacheCount,1);assert.equal(restored.snapshot().cacheBytes,32);
cache.fail=true;currentMeta=meta('aia171',1024,'193672475');await store.update();
assert.equal(store.snapshot().record.imageId,'193672475','quota failure retains new validated bytes for this session');assert.equal(store.snapshot().persistent,false);
const fallback=new SolarCache('solar-test-no-idb');await fallback.put({channel:'hmi',bytes:png().buffer});assert.equal(fallback.persistent,false);assert.equal((await fallback.all()).length,1);

const savedBitmap=globalThis.createImageBitmap;let closed=false;
globalThis.createImageBitmap=async()=>({width:1024,height:1024,close(){closed=true;}});
await decodeSolarImage(new Blob([png()],{type:'image/png'}),{width:1024,height:1024});assert.equal(closed,true);
await assert.rejects(decodeSolarImage(new Blob([png(2048)],{type:'image/png'}),{width:1024,height:1024}),/尺寸/);
await assert.rejects(decodeSolarImage(new Blob([png()],{type:'text/html'}),{width:1024,height:1024}),/格式/);
await assert.rejects(decodeSolarImage(new Blob([new Uint8Array(SOLAR_MAX_IMAGE_BYTES+1)],{type:'image/png'}),{width:1024,height:1024}),/大小/);
globalThis.createImageBitmap=savedBitmap;
for(const s of [store,offline,restored])s.dispose();
console.log('Solar observations: on-demand dedup, bounded images/cache, stale/offline fallback, atomic validation, snapshot roundtrip and failure retention passed');
