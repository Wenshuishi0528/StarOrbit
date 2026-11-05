import {normalizeHorizon} from './balcony-lab-geometry.js';
import {validateObserver} from './pass-prediction.js';

export function balconyRecord({site,profile,profileKind,missionId,targetName,time,minimumElevation,pass,data,source}){
 if(!site||!Number.isFinite(time))return null;
 return {record:{kind:'balcony',missionId,targetName:targetName||missionId,time,observer:{...site},profile:normalizeHorizon(profile),profileKind,minimumElevation,
  passStart:pass?.start??null,passEnd:pass?.end??null,passMaximum:pass?.maximum.time??null,
  passVisible:pass?.visible.map(({start,end})=>({start,end}))??[],clippedStart:!!pass?.clippedStart,clippedEnd:!!pass?.clippedEnd,
  orbitEpoch:source?.epoch??null,estimated:!!pass?.estimated},orbit:data};
}

export function readBalconyRecord(record){
 if(record?.kind!=='balcony'||typeof record.missionId!=='string'||!record.missionId.trim()||
  !Number.isFinite(record.time)||!Number.isFinite(new Date(record.time).getTime()))throw Error('观测记录内容无效');
 const minimumElevation=record.minimumElevation;
 if(!Number.isFinite(minimumElevation)||minimumElevation<0||minimumElevation>80)throw Error('观测记录内容无效');
 const observer=validateObserver(record.observer),profile=normalizeHorizon(record.profile);
 const profileKind=record.profileKind==='example'?'example':profile.length?'saved':'flat';
 return {observer,profile,profileKind,minimumElevation};
}

export function passFromRecord(record,source,sample){
 if(record.passStart==null&&record.passEnd==null)return null;
 const {passStart:start,passEnd:end,passMaximum:peak}=record;
 if(!source||![start,end,peak].every(Number.isFinite)||start<source.start||end>source.end||start>=end||
  end-start>72*3600000||peak<start||peak>end||!Array.isArray(record.passVisible))throw Error('观测记录内容无效');
 let before=start;
 for(const span of record.passVisible){
  if(!span||!Number.isFinite(span.start)||!Number.isFinite(span.end)||span.start<before||span.end<=span.start||span.end>end)throw Error('观测记录内容无效');
  before=span.end;
 }
 return {start,end,maximum:sample(peak),rise:sample(start),set:sample(end),visible:record.passVisible.map(({start,end})=>({start,end})),
  estimated:!!record.estimated,clippedStart:!!record.clippedStart,clippedEnd:!!record.clippedEnd,
  path:Array.from({length:49},(_,i)=>sample(start+(end-start)*i/48))};
}
