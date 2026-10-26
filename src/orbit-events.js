import {EARTH_RADIUS,SUN_RADIUS,dot,norm,stateAt,sunPosition,earthAxes} from './orbit.js';

export const EVENT_TYPES={
 'penumbra-enter':{group:'shadow',name:'开始进入地影',symbol:'◐'},
 'umbra-enter':{group:'shadow',name:'进入全影',symbol:'●'},
 'umbra-exit':{group:'shadow',name:'开始离开全影',symbol:'◑'},
 'penumbra-exit':{group:'shadow',name:'恢复完全日照',symbol:'☀'},
 perigee:{group:'apsis',name:'近地点',symbol:'P'},apogee:{group:'apsis',name:'远地点',symbol:'A'},
 ascending:{group:'node',name:'向北穿越赤道',symbol:'↑'},descending:{group:'node',name:'向南穿越赤道',symbol:'↓'},
};
export const TIME_TOLERANCE=250;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function shadowAngles(position,sun){
 const radius=norm(position),toSun=sun.map((v,i)=>v-position[i]),distance=norm(toSun);
 const a=Math.asin(SUN_RADIUS/distance),b=Math.asin(EARTH_RADIUS/radius);
 const d=Math.acos(clamp(-dot(position,toSun)/(radius*distance),-1,1));
 return {outer:d-b-a,inner:d-b+a};
}
// The Sun and date-equator pole vary slowly. Five-minute knots are shared by all
// detectors; spacecraft positions still use the existing ephemeris interpolator.
function sampler(data){
 const frames=new Map(),frame=t=>{if(!frames.has(t))frames.set(t,{sun:sunPosition(t),pole:earthAxes(t)[2]});return frames.get(t);};
 return time=>{
  const {position,velocity}=stateAt(data,time),radius=norm(position),k=Math.floor(time/300000)*300000,f=(time-k)/300000,a=frame(k),b=frame(k+300000);
  const sun=a.sun.map((v,i)=>v+(b.sun[i]-v)*f),pole=a.pole.map((v,i)=>v+(b.pole[i]-v)*f);
  return {time,radius,radial:dot(position,velocity)/radius,node:dot(position,pole),...shadowAngles(position,sun)};
 };
}
function root(sample,key,a,b){
 const negative=a[key]<0;let lo=a.time,hi=b.time;
 while(hi-lo>TIME_TOLERANCE){const mid=(lo+hi)/2;if((sample(mid)[key]<0)===negative)lo=mid;else hi=mid;}
 return sample((lo+hi)/2);
}
function minimum(sample,lo,hi,key='outer',minimize=true){
 // Refine only candidate extrema, including short grazing eclipses.
 while(hi-lo>TIME_TOLERANCE){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if((sample(a)[key]<sample(b)[key])===minimize)hi=b;else lo=a;}
 return sample((lo+hi)/2);
}
export function* scanOrbitEvents(data,start,end){
 if(!stateAt(data,start-60000)||!stateAt(data,end+60000))return {start,end,initialPhase:'sun',events:[]};
 const sample=sampler(data),events=[],scanStart=start-60000,scanEnd=end+60000,initial=sample(start);
 let a=sample(scanStart),previous=null,minRadius=a.radius,maxRadius=a.radius;
 const initialPhase=initial.outer>=0?'sun':initial.inner<=0?'umbra':'penumbra';
 const add=(type,q)=>events.push({type,time:q.time,...(EVENT_TYPES[type].group==='apsis'?{altitude:q.radius-EARTH_RADIUS}:{})});
 const contact=(left,right,key)=>{
  if((left[key]<0)===(right[key]<0))return;
  const entering=right[key]<0;add((key==='outer'?'penumbra':'umbra')+(entering?'-enter':'-exit'),root(sample,key,left,right));
 };
 for(let time=scanStart;time<scanEnd;){
  time=Math.min(scanEnd,time+60000);const b=sample(time);minRadius=Math.min(minRadius,b.radius);maxRadius=Math.max(maxRadius,b.radius);
  contact(a,b,'outer');contact(a,b,'inner');
  // A whole grazing eclipse can fit between coarse samples. Refine its valley,
  // then bracket both contacts rather than reducing every scan step.
  if(previous&&a.outer<previous.outer&&a.outer<=b.outer){
   const m=minimum(sample,previous.time,b.time);
   for(const key of ['outer','inner']){contact(previous,m,key);contact(m,b,key);}
  }
  if(!previous||time===scanEnd){const m=minimum(sample,a.time,b.time);for(const key of ['outer','inner']){contact(a,m,key);contact(m,b,key);}}
  if((a.node<0)!==(b.node<0)&&Math.max(Math.abs(a.node),Math.abs(b.node))>.01)add(b.node>a.node?'ascending':'descending',root(sample,'node',a,b));
  if((a.radial<0)!==(b.radial<0)){
   const candidate=root(sample,'radial',a,b),perigee=b.radial>a.radial;
   // Imported velocity samples need not be the exact derivative of interpolated
   // positions. Refine the displayed altitude's extremum near the radial root.
   const q=minimum(sample,candidate.time-30000,candidate.time+30000,'radius',perigee),left=sample(q.time-30000),right=sample(q.time+30000);
   if((perigee?Math.min(left.radius,right.radius)-q.radius:q.radius-Math.max(left.radius,right.radius))>1e-5)add(perigee?'perigee':'apogee',q);
  }
  previous=a;a=b;yield;
 }
 const sorted=events.filter(e=>e.time>=start&&e.time<=end&&(EVENT_TYPES[e.type].group!=='apsis'||maxRadius-minRadius>.1)).sort((a,b)=>a.time-b.time),unique=[];
 for(const e of sorted)if(!unique.some(p=>p.type===e.type&&Math.abs(p.time-e.time)<1000))unique.push(e);
 return {start,end,initialPhase,events:unique};
}
export function selectedEvents(result,settings){return result?.events.filter(e=>settings[EVENT_TYPES[e.type].group])||[];}
export function eventBetween(events,from,to){return events.find(e=>e.time>from&&e.time<=to)||null;}

// One bounded, transient cache. Four-millisecond batches yield to the renderer;
// invalidating a mission/window cancels the unfinished generator immediately.
export class OrbitEventCache{
 constructor(){this.generation=0;this.result=null;this.pending=null;this.builds=0;}
 reset(){this.generation++;clearTimeout(this.timer);this.resolve?.(null);this.resolve=null;this.result=null;this.pending=null;this.data=null;}
 request(data,start,end){
  if(this.data===data&&this.result?.start<=start&&this.result.end>=end)return Promise.resolve(this.result);
  if(this.data===data&&this.pending?.start===start&&this.pending.end===end)return this.promise;
  this.reset();this.data=data;if(!data||!(end>start))return Promise.resolve(null);
  const token=this.generation,scan=scanOrbitEvents(data,start,end);this.pending={start,end};this.builds++;
  this.promise=new Promise(resolve=>{
   this.resolve=resolve;const run=()=>{
    if(token!==this.generation)return;const begin=performance.now();let step;
    try{do{step=scan.next();}while(!step.done&&performance.now()-begin<4);}catch{this.pending=null;this.resolve=null;resolve(null);return;}
    if(step.done){this.result=step.value;this.pending=null;this.resolve=null;resolve(this.result);}else this.timer=setTimeout(run,0);
   };this.timer=setTimeout(run,0);
  });return this.promise;
 }
}
