import assert from 'node:assert/strict';
import {WeatherCache} from '../src/weather-cache.js';
import {cacheTrimPlan} from '../src/weather-math.js';

const records=[
 {id:'old-cloud',downloaded:1,size:10},
 {id:'favorite',downloaded:2,size:10,favorite:true},
 {id:'station-active',downloaded:3,size:10},
 {id:'dfh-active',downloaded:4,size:10},
 {id:'new-cloud',downloaded:5,size:10}
];
const protectedIds=['station-active','dfh-active'];
assert.deepEqual(cacheTrimPlan(records,30,protectedIds),{removedIds:['old-cloud','new-cloud'],removedBytes:20,totalBytes:30,overBudget:false});
assert.deepEqual(cacheTrimPlan(records,20,protectedIds),{removedIds:['old-cloud','new-cloud'],removedBytes:20,totalBytes:30,overBudget:true});
assert.deepEqual(cacheTrimPlan(records,20,protectedIds,false),{removedIds:[],removedBytes:0,totalBytes:50,overBudget:true});
assert.deepEqual(records.map(r=>r.id),['old-cloud','favorite','station-active','dfh-active','new-cloud'],'planning does not reorder the library');
assert.deepEqual(cacheTrimPlan([{id:'blob',downloaded:1,blob:new Blob(['1234'])}],0),{removedIds:['blob'],removedBytes:4,totalBytes:0,overBudget:false});
assert.throws(()=>cacheTrimPlan(records,NaN));assert.throws(()=>cacheTrimPlan(records,-1));

// Exercise the unavailable-IDB path without hiding failures after a database opens.
const memory=new WeatherCache('resource-cache-memory');await memory.ready;assert.equal(memory.persistent,false);
for(const record of records)await memory.put(record);
assert.equal((await memory.trim(20,protectedIds,false)).removedIds.length,0);
assert.equal((await memory.all()).length,5);
assert.deepEqual(await memory.trim(30,protectedIds),{removedIds:['old-cloud','new-cloud'],removedBytes:20,totalBytes:30,overBudget:false});
assert.deepEqual((await memory.all()).map(r=>r.id),['favorite','station-active','dfh-active']);

// A small transactional IDB double verifies transaction boundaries and rollback.
// Requests run asynchronously; writes become visible only on transaction commit.
function database(items){
 const db={data:new Map(items.map(r=>[r.id,r])),transactions:[],failPut:false,failDelete:null};
 db.transaction=(name,mode)=>{
  assert.equal(name,'snapshots');const draft=new Map(db.data),tx={error:null};db.transactions.push({mode});let pending=0,aborted=false;
  const request=work=>{const req={};pending++;queueMicrotask(()=>{
   if(aborted)return;
   try{req.result=work();req.onsuccess?.({target:req});}
   catch(error){aborted=true;tx.error=error;tx.onabort?.();}
   finally{pending--;if(!pending&&!aborted){if(mode==='readwrite')db.data=draft;tx.oncomplete?.();}}
  });return req;};
  tx.objectStore=()=>({
   getAll:()=>request(()=>[...draft.values()]),
   delete:id=>request(()=>{if(id===db.failDelete)throw Error('delete failed');draft.delete(id);}),
   put:record=>request(()=>{if(db.failPut)throw new DOMException('test quota reached','QuotaExceededError');draft.set(record.id,record);return record.id;})
  });return tx;
 };return db;
}
const persistent=new WeatherCache('resource-cache-transaction');await persistent.ready;persistent.db=database(records);persistent.persistent=true;
assert.deepEqual(await persistent.trim(30,protectedIds),{removedIds:['old-cloud','new-cloud'],removedBytes:20,totalBytes:30,overBudget:false});
assert.deepEqual(persistent.db.transactions,[{mode:'readwrite'}],'multiple evictions commit in one transaction');
assert.deepEqual([...persistent.db.data.keys()],['favorite','station-active','dfh-active']);
await persistent.trim(0,protectedIds,false);assert.equal(persistent.db.transactions.at(-1).mode,'readonly');
assert.equal(persistent.db.data.size,3,'disabled cleanup does not delete any record');
persistent.db=database(records);persistent.db.failDelete='new-cloud';
await assert.rejects(()=>persistent.trim(30,protectedIds),/delete failed/);
assert.deepEqual([...persistent.db.data.values()],records,'a failed batch rolls back earlier deletions');
persistent.db.failDelete=null;persistent.db.failPut=true;
await assert.rejects(()=>persistent.put({id:'incoming',size:100}),{name:'QuotaExceededError'});
assert.deepEqual([...persistent.db.data.values()],records,'quota failure preserves the existing persistent library');
assert.equal(persistent.memory.size,0,'a failed persistent write must not pretend to succeed in memory');
assert.equal(persistent.persistent,true);
console.log('Resource cache FIFO, favorites/all-mission protection, disabled cleanup, byte reports, single transaction, rollback and quota retention passed');
