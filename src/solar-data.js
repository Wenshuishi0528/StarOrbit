import {fetchResource} from './resource-fetch.js';
import {SolarCache} from './solar-cache.js';

export const SOLAR_CHANNELS=Object.freeze([
 {id:'hmi',labelKey:'HMI 白光 · 黑子',sourceId:18},
 {id:'aia171',labelKey:'AIA 171 Å · 日冕',sourceId:10},
 {id:'aia304',labelKey:'AIA 304 Å · 日珥',sourceId:13},
 {id:'aia131',labelKey:'AIA 131 Å · 高温活动',sourceId:9}
].map(Object.freeze));
export const SOLAR_MAX_IMAGE_BYTES=8*1024*1024;
export const SOLAR_MAX_CACHE_BYTES=4*SOLAR_MAX_IMAGE_BYTES;
export const SOLAR_STALE_AFTER_MS=6*3600*1000;
const MAX_SNAPSHOT_BYTES=12*1024*1024,MIN_CHECK_MS=60000;
const IDS=new Set(SOLAR_CHANNELS.map(x=>x.id));
const SNAPSHOT_SCHEMA='starorbit-solar-observation';
const NOAA_URL='https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json';
const WEB_UNAVAILABLE='网页版暂不支持直接更新 SDO 影像，请导入桌面版导出的太阳观测快照';
const validChannel=value=>{if(!IDS.has(value))throw Error('太阳观测波段无效');return value;};
const validResolution=value=>{if(value!==1024&&value!==2048)throw Error('太阳观测只支持 1K / 2K');return value;};
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
function utc(value) {
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('太阳观测时间无效');
 const date=new Date(value);if(date.getUTCFullYear()<2010||date.getUTCFullYear()>2100)throw Error('太阳观测时间超出范围');
 if(date.toISOString().slice(0,19)!==value.slice(0,19))throw Error('太阳观测时间无效');
 return date.toISOString();
}
function metadata(value) {
 if(!value||typeof value!=='object')throw Error('太阳观测元数据无效');
 const channel=validChannel(value.channel),width=validResolution(value.width);
 if(value.height!==width||!finite(value.radiusFraction,.5,.98)||value.solarNorthUp!==true||
  !Array.isArray(value.solarCenterUV)||value.solarCenterUV.length!==2||value.solarCenterUV.some(v=>!finite(v,.499,.501)))throw Error('太阳观测图像几何无效');
 if(typeof value.imageId!=='string'||!/^\d{1,12}$/.test(value.imageId))throw Error('太阳观测图像编号无效');
 const id=`sdo:${channel}:${value.imageId}:${width}`;
 if(value.id!==id||value.provider!=='SDO / Helioviewer')throw Error('太阳观测来源无效');
 let source;
 try{source=new URL(value.sourceUrl);}catch{throw Error('太阳观测来源地址无效');}
 if(source.origin!=='https://api.helioviewer.org'||source.pathname!=='/v2/takeScreenshot/'||source.username||source.password||source.href.length>2000)throw Error('太阳观测来源地址无效');
 return {id,channel,imageId:value.imageId,width,height:width,provider:value.provider,sourceUrl:source.href,
  metadataUrl:`https://api.helioviewer.org/v2/getJP2Header/?id=${value.imageId}`,
  observedAt:utc(value.observedAt),radiusFraction:value.radiusFraction,solarCenterUV:[.5,.5],solarNorthUp:true,
  ...(finite(value.imageScaleArcsec,.1,5)?{imageScaleArcsec:value.imageScaleArcsec}:{}),
  ...(finite(value.angularRadiusArcsec,850,1050)?{angularRadiusArcsec:value.angularRadiusArcsec}:{})};
}

export async function decodeSolarImage(blob,{width,height}) {
 if(!(blob instanceof Blob)||blob.type!=='image/png'||!blob.size||blob.size>SOLAR_MAX_IMAGE_BYTES)throw Error('太阳观测影像格式或大小无效');
 const bytes=new Uint8Array(await blob.slice(0,24).arrayBuffer()),signature=[137,80,78,71,13,10,26,10];
 if(bytes.length<24||signature.some((v,i)=>bytes[i]!==v))throw Error('太阳观测影像不是有效的 PNG');
 const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(header.getUint32(16)!==width||header.getUint32(20)!==height)throw Error('太阳观测影像尺寸与元数据不一致');
 if(typeof createImageBitmap==='function') {
  const image=await createImageBitmap(blob);
  try{if(image.width!==width||image.height!==height)throw Error('太阳观测影像尺寸与元数据不一致');}
  finally{image.close();}
 } else if(typeof Image==='function') {
  const url=URL.createObjectURL(blob);
  try{await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth===width&&image.naturalHeight===height?resolve():reject(Error('太阳观测影像尺寸与元数据不一致'));image.onerror=()=>reject(Error('太阳观测影像无法解码'));image.src=url;});}
  finally{URL.revokeObjectURL(url);}
 } else throw Error('当前环境无法解码太阳观测影像');
 return blob;
}

function base64(bytes) {
 let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(text);
}
function fromBase64(value) {
 if(typeof value!=='string'||!value.length||value.length>Math.ceil(SOLAR_MAX_IMAGE_BYTES/3)*4||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('太阳观测快照的影像编码无效');
 const decoded=atob(value);if(decoded.length>SOLAR_MAX_IMAGE_BYTES)throw Error('太阳观测影像超过大小限制');
 return Uint8Array.from(decoded,c=>c.charCodeAt(0));
}
function readPreferences(storage) {
 try{const saved=JSON.parse(storage?.getItem('starorbit-solar-preferences-v1')||'null');return {channel:IDS.has(saved?.channel)?saved.channel:'hmi',resolution:[1024,2048].includes(saved?.resolution)?saved.resolution:2048};}
 catch{return {channel:'hmi',resolution:2048};}
}
function localRelayAvailable() {
 return typeof location!=='undefined'&&location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname);
}
function storageOrNull(){try{return globalThis.localStorage;}catch{return null;}}

/** Shared by the resource card and telescope finder. No constructor network fetch.
 * radiusFraction means solar radius / image HALF-width (about .78), not / width.
 * snapshot.record always belongs to the selected band. During upgrades it may
 * retain that band's old resolution; check record.width for actual image detail.
 */
export class SolarObservations {
 constructor({cache=new SolarCache(),fetcher=globalThis.fetch,decode=decodeSolarImage,now=()=>Date.now(),storage=storageOrNull(),canUpdate=localRelayAvailable(),flux=true}={}) {
  this.cache=cache;this.fetcher=fetcher;this.decode=decode;this.now=now;this.storage=storage;this.canUpdate=!!canUpdate;this.fluxEnabled=flux;
  Object.assign(this,readPreferences(storage));this.records=Object.fromEntries(SOLAR_CHANNELS.map(c=>[c.id,null]));
  this.listeners=new Set();this.pending=new Map();this.errors=new Map();this.checked=new Map();this.revision=0;this.fluxSummary=null;this.disposed=false;
  this.restoration=null;
 }
 // Opening the application should not decode four 2K solar frames. The first
 // resource-panel open or use of ensure/update/import/export restores them.
 get ready(){return this.restoration??=this.restore();}
 async restore() {
  try {
   const frames=await this.cache.all();
   for(const stored of frames) {
    try {
     const meta=metadata(stored),bytes=stored.bytes;
     if(!(bytes instanceof ArrayBuffer)||bytes.byteLength>SOLAR_MAX_IMAGE_BYTES)continue;
     const blob=new Blob([bytes],{type:'image/png'});await this.decode(blob,meta);
     if(this.disposed)return;
     this.records[meta.channel]={...meta,blob,fetchedAt:utc(stored.fetchedAt),checkedAt:utc(stored.checkedAt||stored.fetchedAt),origin:stored.origin==='import'?'import':'download',revision:++this.revision};
     this.checked.set(meta.channel,Date.parse(this.records[meta.channel].checkedAt));
    }catch{ /* An invalid cache entry never replaces a usable observation. */ }
   }
  }catch{this.cache.persistent=false;}
  this.notify();
 }
 subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 notify(){if(this.disposed)return;for(const fn of this.listeners){try{fn(this.snapshot());}catch(error){console.error('Solar observation listener:',error);}}}
 snapshot() {
  const records={...this.records},record=records[this.channel];
  return {channel:this.channel,resolution:this.resolution,record,records,loading:this.pending.has(this.channel),loadingChannels:[...this.pending.keys()],error:this.errors.get(this.channel)||null,
   cacheBytes:Object.values(records).reduce((sum,r)=>sum+(r?.blob.size||0),0),cacheCount:Object.values(records).filter(Boolean).length,
   persistent:!!this.cache.persistent,canUpdate:this.canUpdate,fluxSummary:this.fluxSummary,
   stale:!!record&&this.now()-Date.parse(record.observedAt)>SOLAR_STALE_AFTER_MS};
 }
 savePreferences(){try{this.storage?.setItem('starorbit-solar-preferences-v1',JSON.stringify({channel:this.channel,resolution:this.resolution}));}catch{}}
 setChannel(channel){this.channel=validChannel(channel);this.savePreferences();this.notify();}
 setResolution(resolution){this.resolution=validResolution(resolution);this.savePreferences();this.notify();}
 async ensure(channel=this.channel,{resolution=this.resolution}={}) {
  validChannel(channel);validResolution(resolution);await this.ready;
  const record=this.records[channel];
  if(record&&(record.width>=resolution||!this.canUpdate))return record;
  return this.update(channel,{resolution});
 }
 update(channel=this.channel,{resolution=this.resolution}={}) {
  validChannel(channel);validResolution(resolution);
  if(this.pending.has(channel))return this.pending.get(channel);
  const job=this.performUpdate(channel,resolution).finally(()=>{this.pending.delete(channel);this.notify();});
  this.pending.set(channel,job);this.notify();return job;
 }
 async performUpdate(channel,resolution) {
  await this.ready;this.errors.delete(channel);
  try {
   if(this.disposed)throw Error('太阳观测已关闭');
   if(!this.canUpdate)throw Error(WEB_UNAVAILABLE);
   const prior=this.records[channel],last=this.checked.get(channel);
   if(prior?.origin==='download'&&prior.width===resolution&&last!==undefined&&this.now()-last>=0&&this.now()-last<MIN_CHECK_MS)return prior;
   const response=await fetchResource(`/api/solar/metadata?channel=${channel}&resolution=${resolution}`,{fetcher:this.fetcher,max:65536,timeout:30000});
   let raw;try{raw=JSON.parse(await response.blob.text());}catch{throw Error('太阳观测元数据无效');}
   const meta=metadata(raw);
   if(meta.channel!==channel||meta.width!==resolution||typeof raw.token!=='string'||! /^[a-f0-9]{32}$/.test(raw.token)||raw.imageUrl!==`/api/solar/image?token=${raw.token}`)throw Error('太阳观测响应与请求不一致');
   const checkedAt=new Date(this.now()).toISOString();
   if(prior?.id===meta.id&&prior.origin==='download') {
    prior.checkedAt=checkedAt;this.checked.set(channel,this.now());
    await this.persist(prior);this.notify();this.updateFlux();return prior;
   }
   const image=await fetchResource(raw.imageUrl,{fetcher:this.fetcher,max:SOLAR_MAX_IMAGE_BYTES,timeout:40000});
   const blob=image.blob.type.split(';')[0]==='image/png'?image.blob.slice(0,image.blob.size,'image/png'):image.blob;
   await this.decode(blob,meta);
   if(this.disposed)throw Error('太阳观测已关闭');
   const record={...meta,blob,fetchedAt:new Date(this.now()).toISOString(),checkedAt,origin:'download',revision:++this.revision};
   this.records[channel]=record;this.checked.set(channel,this.now());
   await this.persist(record);this.notify();this.updateFlux();return record;
  }catch(error){this.errors.set(channel,error.message||'太阳观测更新失败；已有影像已保留');throw error;}
 }
 async persist(record) {
  try {
   const {blob,revision,...rest}=record;
   await this.cache.put({...rest,bytes:await blob.arrayBuffer()});
  }catch{this.cache.persistent=false; /* Current-session data stays usable if storage is full. */}
 }
 async updateFlux() {
  if(!this.fluxEnabled||this.fluxPending||this.disposed||this.fluxChecked&&this.now()-this.fluxChecked<MIN_CHECK_MS)return;
  this.fluxPending=true;
  try {
   const r=await fetchResource(NOAA_URL,{fetcher:this.fetcher,max:32768,timeout:7000}),data=JSON.parse(await r.blob.text());
   const item=Array.isArray(data)?data[0]:null;
   if(!item||!/^([ABCMX])\d+(?:\.\d+)?$/.test(item.current_class)||!Number.isInteger(item.satellite)||item.satellite<1||item.satellite>99)throw Error('Invalid NOAA summary');
   const observedAt=utc(item.time_tag);
   if(!this.disposed){this.fluxSummary={observedAt,currentClass:item.current_class,satellite:item.satellite};this.fluxChecked=this.now();this.notify();}
  }catch{ /* Independent context hint; never block or invalidate solar imaging. */ }
  finally{this.fluxPending=false;}
 }
 async exportSnapshot(record) {
  await this.ready;record??=this.records[this.channel];if(!record)throw Error('当前波段还没有可导出的太阳观测');
  const meta=metadata(record),bytes=new Uint8Array(await record.blob.arrayBuffer());
  await this.decode(record.blob,meta);
  return new Blob([JSON.stringify({schema:SNAPSHOT_SCHEMA,version:1,metadata:{...meta,fetchedAt:utc(record.fetchedAt)},image:{mime:'image/png',base64:base64(bytes)}})],{type:'application/json'});
 }
 async importSnapshot(file) {
  await this.ready;
  if(!(file instanceof Blob)||!file.size||file.size>MAX_SNAPSHOT_BYTES)throw Error('太阳观测快照超过大小限制或为空');
  let data;try{data=JSON.parse(await file.text());}catch{throw Error('不是受支持的星轨太阳观测快照');}
  if(data?.schema!==SNAPSHOT_SCHEMA||data.version!==1||data.image?.mime!=='image/png')throw Error('不是受支持的星轨太阳观测快照');
  const meta=metadata(data.metadata),bytes=fromBase64(data.image.base64),blob=new Blob([bytes],{type:'image/png'});
  await this.decode(blob,meta);const fetchedAt=utc(data.metadata.fetchedAt);
  if(this.disposed)throw Error('太阳观测已关闭');
  if(this.pending.has(meta.channel))throw Error('该波段正在更新，请稍后导入');
  const record={...meta,blob,fetchedAt,checkedAt:new Date(this.now()).toISOString(),origin:'import',revision:++this.revision};
  this.records[meta.channel]=record;this.channel=meta.channel;this.resolution=meta.width;
  this.checked.delete(meta.channel);this.errors.delete(meta.channel);this.savePreferences();await this.persist(record);this.notify();return record;
 }
 dispose(){this.disposed=true;this.listeners.clear();this.cache.dispose?.();}
}
