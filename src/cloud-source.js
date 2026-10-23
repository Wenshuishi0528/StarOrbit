import {selectSnapshot} from './weather-math.js';
export function cloudProvider(record){return record?.provider==='satcorps'?'satcorps':'github';}
export function retiredNASA(record){return record?.kind==='cloud'&&cloudProvider(record)==='satcorps'&&record.time===1719748800000;}
export async function retireNASA(cache){const retired=(await cache.all()).filter(retiredNASA);for(const row of retired)await cache.remove(row.id);return retired.map(row=>row.id);}
export function completeNASA(record,now=Date.now()){
 const footprint=record?.footprint;
 return cloudProvider(record)==='satcorps'&&record.time!==1719748800000&&Number.isFinite(record.time)&&record.time>0&&record.time<=now+300e3
  &&Number.isFinite(record.observedStart)&&record.observedStart>0&&Number.isFinite(record.observedEnd)
  &&record.observedStart<=record.observedEnd&&record.observedEnd<=now+300e3
  &&record.coverage>=.995&&record.polarCoverage?.north>=.99&&record.polarCoverage?.south>=.99
  &&footprint?.global>=.995&&footprint?.north>=.995&&footprint?.south>=.995;
}
export function selectCloud(items,mode,time,id,now=Date.now()){
 if(mode==='history')return selectSnapshot(items.filter(x=>!retiredNASA(x)),'cloud',mode,time,id);
 const provider=mode==='satcorps'?'satcorps':'github';
 return selectSnapshot(items.filter(x=>cloudProvider(x)===provider&&(provider!=='satcorps'||completeNASA(x,now))),'cloud','latest');
}
export function validateNASA(meta,now=Date.now()){
 if(!completeNASA(meta,now)||meta.resolution!=='8192×4096'||meta.nativeResolution!=='12960×6480'||meta.channel!=='red')throw Error('NASA 云图时间、分辨率或覆盖率未通过核验');
 return meta;
}
