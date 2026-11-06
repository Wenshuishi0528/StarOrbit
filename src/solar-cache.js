// Keep bytes, not IndexedDB Blob handles: older WebKit can lose the latter's backing file.
export class SolarCache {
 constructor(name='starorbit-solar-observations-v1') {
  this.name=name;this.persistent=true;this.memory=new Map();
 }
 open() {
  return this.ready??=new Promise(resolve=>{
   let settled=false;
   const finish=db=>{if(settled){db?.close();return;}settled=true;this.db=db;this.persistent=!!db;resolve(db);};
   try {
    const request=indexedDB.open(this.name,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('frames',{keyPath:'channel'});
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.db=null;this.persistent=false;this.ready=Promise.resolve(null);};finish(db);};
    request.onerror=request.onblocked=()=>finish(null);
   } catch {finish(null);}
  });
 }
 async run(mode,action) {
  const db=await this.open();
  if(!db)return action(null);
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('frames',mode),request=action(tx.objectStore('frames'));
   tx.oncomplete=()=>resolve(request?.result);
   tx.onerror=tx.onabort=()=>reject(tx.error||Error('太阳观测缓存写入失败'));
  });
 }
 all(){return this.run('readonly',store=>store?store.getAll():[...this.memory.values()]);}
 put(record){return this.run('readwrite',store=>store?store.put(record):this.memory.set(record.channel,record));}
 dispose(){this.ready?.then(db=>db?.close());}
}
