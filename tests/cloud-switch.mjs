import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {blobHash} from '../src/resource-fetch.js';
import {selectCloud} from '../src/cloud-source.js';

const bundled=await build({entryPoints:['src/cloud-library.js'],bundle:true,platform:'node',format:'esm',write:false});
const {CloudLibrary}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const data=new Blob(['cloud pixels']),digest=await blobHash(data),time=Date.UTC(2026,10,4,4);
const certified={schema:1,sha256:digest,validPixels:1};
const snapshot={kind:'cloud',id:'saved',provider:'satcorps',time,sha256:digest,blob:data,manualValidation:certified,favorite:true};
const expired={size:data.size,arrayBuffer:async()=>{throw new DOMException('The object can not be found here.','NotFoundError');}};
const disk={...snapshot,disk:'local.png',quality:{schema:1,sha256:digest}};
let persisted=snapshot,reads=0,writes=0,fetches=0,read=()=>persisted,lastApplied=null;
const w={items:[],pendingRecords:new Set(),active:{cloud:'previous'},checkedCloudHash:blobHash,render(){},
 cache:{async get(){reads++;return read();},async put(record){writes++;persisted={...record};}},
 async fetch(url){fetches++;assert(url.includes(digest));return {blob:data};},
 async store(kind,blob,metadata){const record={...persisted,...metadata,id:snapshot.id,kind,blob};await this.cache.put(record);return record;},
 async validateManualCloud(record){assert.equal(await blobHash(record.blob),digest);return {manualValidation:certified,sha256:digest};},
 async useRecord(record){assert.equal(await blobHash(record.blob),digest);this.active.cloud=record.id;lastApplied=record;},
};
const library=new CloudLibrary(w);
const row={key:'row',record:{...snapshot,blob:expired},diskRecord:disk};
await library.use(row);
assert.equal(writes,0);assert.equal(fetches,0);
assert.notEqual(lastApplied.blob,data,'renderer owns a detached Blob');
read=()=>reads===2?{...snapshot,blob:expired}:snapshot;
await library.use(row);
assert.equal(writes,0);assert.equal(fetches,0,'one expired handle can be resolved by reading the current key again');
read=()=>({...snapshot,blob:expired});
await library.use(row);assert.equal(fetches,1);assert.equal(writes,1);
assert.equal(lastApplied.sha256,digest);
w.active.cloud='previous';
await assert.rejects(()=>library.use({...row,diskRecord:{...disk,time:time-3600000}}),/无法读取/);
assert.equal(fetches,1);assert.equal(w.active.cloud,'previous','failed repair must not switch to a different version');

persisted={...snapshot,manualValidation:undefined};read=()=>persisted;
await library.use(row);
assert.equal(writes,2);
assert.equal(selectCloud([structuredClone(persisted)],'history',time,snapshot.id)?.id,snapshot.id,'legacy selection survives a reload');
await library.use(row);assert.equal(writes,2);

persisted={...snapshot,provider:undefined};read=()=>persisted;
w.items=[persisted];
const legacy=library.saved[0];assert.equal(legacy.provider,'github');
await library.use(legacy);assert.equal(lastApplied.provider,'github');assert.equal(writes,2);
console.log('Cloud switching: stale WebKit handles, matching disk recovery, legacy providers, one-time validation and selection persistence passed');
