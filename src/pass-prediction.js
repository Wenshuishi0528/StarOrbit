import {json2satrec,propagate,gstime} from 'satellite.js';
import {dot,earthAxes,interpolate,sunPosition,sunlightFraction} from './orbit.js';
import {validateGP} from './gp-orbit.js';
import {DFH1_HISTORY} from './dfh1-history.js';
import bundledGP from '../assets/spacecraft/dfh1-gp.json' with {type:'json'};

const DEG=Math.PI/180,DAY=86400000;
export const PASS_GP_MAX_AGE=7*DAY;
export const PASS_TIME_TOLERANCE=250;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function validateObserver(input){
 const out={};
 for(const [key,min,max] of [['latitude',-90,90],['longitude',-180,180],['height',-500,9000]]){
  const value=input?.[key];if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('观测点坐标无效');out[key]=value;
 }
 out.name=String(input.name||'自定义地点').slice(0,60);return out;
}
export function observerFrame(input){
 const site=validateObserver(input),lat=site.latitude*DEG,lon=site.longitude*DEG;
 const sin=Math.sin(lat),cos=Math.cos(lat),a=6378.137,e2=6.69437999014e-3,h=site.height/1000,N=a/Math.sqrt(1-e2*sin*sin);
 return {site,position:[(N+h)*cos*Math.cos(lon),(N+h)*cos*Math.sin(lon),(N*(1-e2)+h)*sin],
  east:[-Math.sin(lon),Math.cos(lon),0],north:[-sin*Math.cos(lon),-sin*Math.sin(lon),cos],up:[cos*Math.cos(lon),cos*Math.sin(lon),sin]};
}
export function lookAngles(fixedPosition,frame){
 const relative=fixedPosition.map((v,i)=>v-frame.position[i]),range=Math.hypot(...relative);
 if(!(range>0)||!Number.isFinite(range))throw Error('轨道传播失败');
 return {azimuth:(Math.atan2(dot(relative,frame.east),dot(relative,frame.north))/DEG+360)%360,
  elevation:Math.asin(clamp(dot(relative,frame.up)/range,-1,1))/DEG,range};
}
function epochOf(gp){return Date.parse(gp.EPOCH.endsWith('Z')?gp.EPOCH:gp.EPOCH+'Z');}
function matchingGP(data){
 let raw=data?.gp;
 if(!raw&&data?.propagator==='SGP4'&&data.missionId==='dfh1'&&data.noradId===4382&&data.objectId==='1970-034A'&&Math.abs(Date.parse(data.gpEpoch)-epochOf(bundledGP[0]))<1)raw=bundledGP[0];
 if(!raw)return null;
 // Imported scene JSON can contain arbitrary extra fields: revalidate identity and frame.
 const gp=validateGP(raw,data.missionId),epoch=epochOf(gp);
 if(Number(data.noradId)!==gp.NORAD_CAT_ID||data.objectId!==gp.OBJECT_ID||!Number.isFinite(Date.parse(data.gpEpoch))||Math.abs(Date.parse(data.gpEpoch)-epoch)>1)throw Error('轨道根数与数据历元不一致');
 return {gp,epoch};
}
export function predictionSource(data){
 if(!data?.rows?.length)throw Error('此任务尚未配置轨道');
 const gp=matchingGP(data);
 if(gp){
  const satrec=json2satrec(gp.gp);
  return {kind:'sgp4',epoch:gp.epoch,start:Math.max(gp.epoch-PASS_GP_MAX_AGE,data.missionId==='dfh1'?DFH1_HISTORY.cutoff:-Infinity),end:gp.epoch+PASS_GP_MAX_AGE,
   position(time,axes){
    const q=propagate(satrec,new Date(time));if(!q?.position||satrec.error)throw Error('轨道传播失败');
    const p=q.position,a=gstime(new Date(time)),c=Math.cos(a),s=Math.sin(a),fixed=[c*p.x+s*p.y,-s*p.x+c*p.y,p.z];
    return {fixed,inertial:axes[0].map((_,i)=>fixed.reduce((sum,v,j)=>sum+v*axes[j][i],0))};
   }};
 }
 const start=Math.max(data.rows[0][0],data.missionId==='dfh1'?DFH1_HISTORY.cutoff:-Infinity),end=data.rows.at(-1)[0];
 return {kind:'oem',epoch:Date.parse(data.created)||start,start,end,position(time,axes){
  const q=interpolate(data.rows,time);if(!q)throw Error('预报时间超出有效轨道区间');
  return {inertial:q.position,fixed:axes.map(axis=>dot(axis,q.position))};
 }};
}
export function predictionWindow(data,start,hours){
 if(!Number.isFinite(start)||![24,48,72].includes(hours))throw Error('预报时间无效');
 if(data?.missionId==='dfh1'&&start<DFH1_HISTORY.cutoff)throw Error('历史示意轨道不能用于过境预报');
 const source=predictionSource(data);
 if(start<source.start||start>=source.end)throw Error(source.kind==='sgp4'?'轨道根数已超出预报时效':'预报时间超出有效轨道区间');
 const end=Math.min(start+hours*3600000,source.end);
 return {source,start,end,clipped:end<start+hours*3600000};
}
export function createPassSampler(source,observer){
 const frame=observerFrame(observer),suns=new Map();
 const solar=time=>{if(!suns.has(time))suns.set(time,sunPosition(time));return suns.get(time);};
 return time=>{
  if(time<source.start||time>source.end)throw Error('预报时间超出有效轨道区间');
  const axes=earthAxes(time),position=source.position(time,axes),k=Math.floor(time/300000)*300000,f=(time-k)/300000,a=solar(k),b=solar(k+300000),sun=a.map((v,i)=>v+(b[i]-v)*f);
  const solarDirection=axes.map(axis=>dot(axis,sun)),sunElevation=lookAngles(solarDirection,frame).elevation;
  return {time,...lookAngles(position.fixed,frame),sunElevation,illumination:sunlightFraction(position.inertial,sun)};
 };
}
function root(sample,a,b,key,level=0){
 const positive=a[key]>=level;let lo=a.time,hi=b.time;
 while(hi-lo>PASS_TIME_TOLERANCE){const q=sample((lo+hi)/2);if((q[key]>=level)===positive)lo=q.time;else hi=q.time;}
 return sample((lo+hi)/2);
}
function peak(sample,start,end){
 let lo=start,hi=end;while(hi-lo>PASS_TIME_TOLERANCE){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(sample(a).elevation<sample(b).elevation)lo=a;else hi=b;}
 return [sample(start),sample((lo+hi)/2),sample(end)].sort((a,b)=>b.elevation-a.elevation)[0];
}
const visibleMargin=q=>Math.min(q.illumination-.01,(-6-q.sunElevation)/10);
function* visibleSegments(sample,start,end){
 const read=t=>{const q=sample(t);return {...q,visibility:visibleMargin(q)};},segments=[];
 let a=read(start),begin=a.visibility>=0?start:null;
 for(let time=Math.min(end,start+10000);;time=Math.min(end,time+10000)){
  const b=read(time);
  if((a.visibility>=0)!==(b.visibility>=0)){
   const crossing=root(read,a,b,'visibility').time;
   if(b.visibility>=0)begin=crossing;else if(begin!==null){segments.push({start:begin,end:crossing});begin=null;}
  }
  yield;if(time===end){if(begin!==null)segments.push({start:begin,end});break;}a=b;
 }
 return segments;
}
// Generator deliberately yields during scanning/refinement; callers can cancel stale jobs.
// Local maxima are refined even below the elevation threshold, catching short grazing passes.
export function* scanPasses(sample,start,end,{minimumElevation=10,stepMs=30000}={}){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>72*3600000||!Number.isFinite(minimumElevation)||minimumElevation<0||minimumElevation>80||stepMs<1000||stepMs>60000)throw Error('预报参数无效');
 const coarse=[];
 for(let time=start;;time=Math.min(end,time+stepMs)){coarse.push(sample(time));yield;if(time===end)break;}
 const points=[...coarse];
 if(coarse.length>1){points.push(peak(sample,coarse[0].time,coarse[1].time));yield;points.push(peak(sample,coarse.at(-2).time,coarse.at(-1).time));yield;}
 for(let i=1;i<coarse.length-1;i++)if(coarse[i].elevation>coarse[i-1].elevation&&coarse[i].elevation>=coarse[i+1].elevation){points.push(peak(sample,coarse[i-1].time,coarse[i+1].time));yield;}
 points.sort((a,b)=>a.time-b.time);
 const spans=[];let enter=points[0].elevation>=minimumElevation?start:null;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];if((a.elevation>=minimumElevation)===(b.elevation>=minimumElevation))continue;
  const time=root(sample,a,b,'elevation',minimumElevation).time;
  if(b.elevation>=minimumElevation)enter=time;else if(enter!==null){spans.push({start:enter,end:time,clippedStart:enter===start,clippedEnd:false});enter=null;}yield;
 }
 if(enter!==null)spans.push({start:enter,end,clippedStart:enter===start,clippedEnd:true});
 const passes=[];
 for(const span of spans){
  if(span.end<=span.start)continue;
  // A continuously visible GEO pass can span multiple elevation maxima. Refine
  // the best scanned bracket rather than assuming the whole interval is unimodal.
  const candidates=points.filter(q=>q.time>=span.start&&q.time<=span.end);let best=0;for(let i=1;i<candidates.length;i++)if(candidates[i].elevation>candidates[best].elevation)best=i;
  const maximum=peak(sample,candidates[best-1]?.time??span.start,candidates[best+1]?.time??span.end),rise=sample(span.start),set=sample(span.end),path=Array.from({length:49},(_,i)=>sample(span.start+(span.end-span.start)*i/48));
  const visible=yield* visibleSegments(sample,span.start,span.end);
  passes.push({...span,maximum,rise,set,path,visible});yield;
 }
 return passes;
}
export function predictPasses(data,observer,start,hours,{minimumElevation=10,signal}={}){
 let window,scan;
 try{window=predictionWindow(data,start,hours);scan=scanPasses(createPassSampler(window.source,observer),window.start,window.end,{minimumElevation});}catch(error){return Promise.reject(error);}
 return new Promise((resolve,reject)=>{
  let timer;const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
  if(signal?.aborted)return abort();signal?.addEventListener('abort',abort,{once:true});
  const fail=error=>{signal?.removeEventListener('abort',abort);reject(error);};
  const run=()=>{try{
   if(signal?.aborted)return;
   const begin=performance.now();let step;do{step=scan.next();}while(!step.done&&performance.now()-begin<4);
   if(step.done){signal?.removeEventListener('abort',abort);resolve({start:window.start,end:window.end,clipped:window.clipped,kind:window.source.kind,epoch:window.source.epoch,observer:validateObserver(observer),minimumElevation,passes:step.value});}
   else timer=setTimeout(run,0);
  }catch(error){fail(error);}};timer=setTimeout(run,0);
 });
}
const escapeICS=value=>String(value).replace(/\\/g,'\\\\').replace(/[\r\n]+/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const stamp=time=>new Date(time).toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
export function passesToICS(result,missionName,created=Date.now()){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//StarOrbit//Pass Planner//EN','CALSCALE:GREGORIAN'];
 for(const [i,pass] of result.passes.entries())lines.push('BEGIN:VEVENT',`UID:starorbit-${Math.round(pass.start)}-${i}@local`,'DTSTAMP:'+stamp(created),'DTSTART:'+stamp(pass.start),'DTEND:'+stamp(pass.end),'SUMMARY:'+escapeICS(missionName+' · '+result.observer.name),'DESCRIPTION:'+escapeICS(`Geometric pass. Max elevation ${pass.maximum.elevation.toFixed(1)} deg. Optical visibility is not guaranteed. Data epoch ${new Date(result.epoch).toISOString()}.`),'END:VEVENT');
 lines.push('END:VCALENDAR');
 // Fold UTF-8 lines at 73 octets; continuation spaces remain within the 75-octet limit.
 return lines.flatMap(line=>{const rows=[];let row='',bytes=0;for(const ch of line){const length=new TextEncoder().encode(ch).length;if(bytes+length>73){rows.push(row);row=' ';bytes=1;}row+=ch;bytes+=length;}rows.push(row);return rows;}).join('\r\n')+'\r\n';
}
