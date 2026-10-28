import {cacheTrimPlan} from './weather-math.js';
export class WeatherCache{
 constructor(database='tiangong-environment-data-v1'){this.memory=new Map();this.persistent=true;this.ready=new Promise(resolve=>{
  try{const req=indexedDB.open(database,1);req.onupgradeneeded=()=>req.result.createObjectStore('snapshots',{keyPath:'id'});req.onsuccess=()=>{this.db=req.result;resolve();};req.onerror=req.onblocked=()=>{this.persistent=false;resolve();};}catch{this.persistent=false;resolve();}
 });}
 async run(mode,fn){await this.ready;if(!this.db)return fn(null);return new Promise((resolve,reject)=>{const tx=this.db.transaction('snapshots',mode),req=fn(tx.objectStore('snapshots'));tx.oncomplete=()=>resolve(req?.result);tx.onerror=()=>reject(tx.error||Error('缓存写入失败'));tx.onabort=()=>reject(tx.error||Error('缓存写入失败'));});}
 async all(){return this.run('readonly',s=>s?s.getAll():[...this.memory.values()]);}
 async put(x){return this.run('readwrite',s=>s?s.put(x):this.memory.set(x.id,x));}
 async remove(id){return this.run('readwrite',s=>s?s.delete(id):this.memory.delete(id));}
 async trim(limit,protectedIds=[],automatic=true){
  // Plan and delete inside one transaction. A failed transaction keeps every
  // original record; quota errors from put() also remain visible to the caller.
  cacheTrimPlan([],limit,protectedIds,automatic);let result;
  await this.run(automatic?'readwrite':'readonly',store=>{
   const trim=items=>{result=cacheTrimPlan(items,limit,protectedIds,automatic);for(const id of result.removedIds)store?store.delete(id):this.memory.delete(id);};
   if(!store){trim([...this.memory.values()]);return;}
   const request=store.getAll();request.onsuccess=()=>trim(request.result);return request;
  });return result;
 }
}
