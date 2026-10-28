import {localISO} from './time-format.js';

export const COMPASS_DIRECTIONS=['北','北北东','东北','东北东','东','东南东','东南','南南东','南','南南西','西南','西南西','西','西北西','西北','北北西'];
export function compassDirection(azimuth){
 if(!Number.isFinite(azimuth))throw Error('Invalid azimuth');
 const angle=((azimuth%360)+360)%360;
 return COMPASS_DIRECTIONS[Math.floor((angle+11.25)/22.5)%16];
}
export function passClockParts(time){
 const [date,clock]=localISO(time).split('T');return {date,clock,shortDate:date.slice(-5)};
}
export function isCandidateTime(pass,time){return pass.visible.some(span=>time>=span.start&&time<=span.end);}
export function passStages(pass){
 return [
  {key:pass.clippedStart?'预报窗口开始':'进入最低仰角',point:pass.rise},
  {key:'最高点',point:pass.maximum},
  {key:pass.clippedEnd?'预报窗口结束':'离开最低仰角',point:pass.set},
 ];
}
export function passTimeAtFraction(pass,fraction){return pass.start+(pass.end-pass.start)*Math.max(0,Math.min(1,fraction));}
export function passTimeTicks(pass,count=5){
 const n=Math.max(2,Math.floor(count)),datesDiffer=passClockParts(pass.start).date!==passClockParts(pass.end).date;
 return Array.from({length:n},(_,i)=>{const time=passTimeAtFraction(pass,i/(n-1));return {time,...passClockParts(time),showDate:datesDiffer};});
}

// Refined optical boundaries split the existing sampled curve exactly in time.
// Only the plotted line is interpolated; the interactive readout uses the orbit sampler.
export function passProfile(pass){
 const byTime=new Map([...pass.path,pass.rise,pass.set,pass.maximum].map(point=>[point.time,point]));
 const knots=[...byTime.values()].filter(point=>point.time>=pass.start&&point.time<=pass.end).sort((a,b)=>a.time-b.time);
 const times=[...new Set([...knots.map(point=>point.time),...pass.visible.flatMap(span=>[span.start,span.end]).filter(time=>time>=pass.start&&time<=pass.end)])].sort((a,b)=>a-b);
 let index=0;
 const points=times.map(time=>{
  while(index+1<knots.length&&knots[index+1].time<time)index++;
  const a=knots[index],b=knots[Math.min(index+1,knots.length-1)],f=b.time===a.time?0:(time-a.time)/(b.time-a.time);
  return {time,elevation:a.elevation+(b.elevation-a.elevation)*f};
 });
 return {points,segments:points.slice(1).map((point,i)=>({from:points[i],to:point,candidate:isCandidateTime(pass,(points[i].time+point.time)/2)}))};
}
