import {selectSnapshot} from './weather-math.js';
import {manualCloudUsable} from './cloud-manual.js';
export function cloudProvider(record){return record?.provider==='satcorps'?'satcorps':'github';}
export const CLOUD_QUALITY_SCHEMA=1;
export const GITHUB_CLOUD_UNAVAILABLE='GitHub 云图源包含不可逆的显示增强和极区镜像，不能可靠还原真实云量，已停用；历史文件仍可预览、导出和删除';
export function acceptedCloudQuality(record){return record?.quality?.schema===CLOUD_QUALITY_SCHEMA&&record.quality.status==='accepted'&&Array.isArray(record.quality.reasons)&&record.quality.reasons.length===0;}
export function cloudUnavailableReason(record){if(record?.provider==='viirs')return 'VIIRS 扫描预览不是完整全球合成云图，请选择 NASA 全球版本';return cloudProvider(record)==='github'?GITHUB_CLOUD_UNAVAILABLE:record?.quality?.status==='rejected'?'此云图未通过质量检查，不能应用；已保留历史文件':'此 NASA 云图尚未通过新版质量检查，请检查 NASA 更新；历史文件已保留';}
export function protectedCloudIds(items){return ['satcorps','github'].flatMap(provider=>items.filter(r=>r.kind==='cloud'&&!r.integrityFailed&&cloudProvider(r)===provider&&acceptedCloudQuality(r)).sort((a,b)=>(b.time||b.downloaded)-(a.time||a.downloaded)).slice(0,2).map(r=>r.id));}
export function retiredNASA(record){return record?.kind==='cloud'&&cloudProvider(record)==='satcorps'&&record.time===1719748800000;}
export async function retireNASA(cache){return (await cache.all()).filter(row=>retiredNASA(row)&&!manualCloudUsable(row)).map(row=>row.id);}
export function completeNASA(record,now=Date.now()){
 const footprint=record?.footprint;
 return cloudProvider(record)==='satcorps'&&acceptedCloudQuality(record)&&record.time!==1719748800000&&Number.isFinite(record.time)&&record.time>0&&record.time<=now+300e3
  &&Number.isFinite(record.observedStart)&&record.observedStart>0&&Number.isFinite(record.observedEnd)
  &&record.observedStart<=record.observedEnd&&record.observedEnd<=now+300e3
  &&record.coverage>=.995&&record.polarCoverage?.north>=.99&&record.polarCoverage?.south>=.99
  &&footprint?.global>=.995&&footprint?.north>=.995&&footprint?.south>=.995;
}
export function selectCloud(items,mode,time,id,now=Date.now()){
 if(mode==='history'&&id!=='auto'){
  const chosen=items.find(x=>x.id===id);if(manualCloudUsable(chosen))return chosen;
 }
 if(mode==='history')return selectSnapshot(items.filter(x=>!x.integrityFailed&&completeNASA(x,now)),'cloud',mode,time,id);
 const provider=mode==='satcorps'?'satcorps':'github';
 return provider==='github'?null:selectSnapshot(items.filter(x=>!x.integrityFailed&&completeNASA(x,now)),'cloud','latest');
}
export function validateNASA(meta,now=Date.now()){
 if(!acceptedCloudQuality(meta))throw Object.assign(Error('NASA 云图尚未通过新版质量检查，保留已有数据'),{retryable:false});
 if(!completeNASA(meta,now)||meta.resolution!=='8192×4096'||meta.nativeResolution!=='12960×6480'||!['red','validity'].includes(meta.channel))throw Error('NASA 云图时间、分辨率或覆盖率未通过核验');
 return meta;
}
