import {EARTH_RADIUS,cross,dot,norm,unit,sunPosition} from './orbit.js';
import {equatorial} from './environment-math.js';

const DEG=Math.PI/180, TAU=2*Math.PI;
export const SURVEY_ALTITUDE=400;
export const SURVEY_PERIOD=TAU*Math.sqrt((EARTH_RADIUS+SURVEY_ALTITUDE)**3/398600.4418);
export const SURVEY_END=Math.floor(SURVEY_PERIOD);
export const SURVEY_SUN_ANGLE=50, SURVEY_LIMB_MARGIN=5, SURVEY_SLEW_RATE=.5, SURVEY_SETTLE=8;
export const SURVEY_TILE_WIDTH=3;
export const SURVEY_TILES=['A','B','C','D'];
// The star chart has north up and increasing right ascension to the left.
const tileSigns=[[1,1],[-1,1],[1,-1],[-1,-1]];
const clamp=x=>Math.max(-1,Math.min(1,x));
const corner=Math.atan(Math.SQRT2*Math.tan(SURVEY_TILE_WIDTH/2*DEG));
const earthLimit=-Math.cos(Math.asin(EARTH_RADIUS/(EARTH_RADIUS+SURVEY_ALTITUDE))+SURVEY_LIMB_MARGIN*DEG+corner);
const sunLimit=Math.cos(SURVEY_SUN_ANGLE*DEG+corner);
const anchors=[
 ['orion','猎户座天区',83.8,-5.4],['cygnus','天鹅座天区',305.5,40.3],['andromeda','仙女座天区',10.7,41.3],
 ['leo','狮子座天区',168,17],['carina','船底座天区',161,-59.7],['sagittarius','人马座天区',280,-23],
 ['pleiades','昴星团天区',56.8,24.1],['pegasus','飞马座天区',344,15],['virgo','室女座天区',186,12]
];
export const SURVEY_FIELDS=anchors.map(([id,name,ra,dec])=>{
 const center=equatorial(ra,dec),east=equatorial(ra+90,0),north=unit(cross(center,east));
 const offset=Math.tan(SURVEY_TILE_WIDTH*.5*DEG);
 const tiles=tileSigns.map(([e,n])=>unit(center.map((v,i)=>v+offset*(e*east[i]+n*north[i]))));
 return {id,name,ra,dec,center,east,north,tiles};
});

export function makeSurveyOrbit(epoch,state){
 // An independent circular teaching orbit starts in the station's radial/tangential frame.
 // At extreme simulator dates use the reference teaching epoch supported by the ephemeris.
 if(!Number.isFinite(epoch)||epoch<Date.UTC(1900,0,1)||epoch>Date.UTC(2100,0,1))epoch=Date.UTC(2026,9,28);
 let radial=[1,0,0],along=[0,Math.cos(41.5*DEG),Math.sin(41.5*DEG)];
 const finite=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)&&norm(v)>0;
 if(finite(state?.position)&&finite(state?.velocity)){
  const r=unit(state.position),v=state.velocity.map((x,i)=>x-r[i]*dot(r,state.velocity));
  if(norm(v)>1e-9){radial=r;along=unit(v);}
 }
 const sun=unit(sunPosition(epoch));
 return {epoch,radial,along,sun,park:sun.map(x=>-x)};
}

export function surveyRadius(orbit,seconds){
 const phase=TAU*seconds/SURVEY_PERIOD;
 return orbit.radial.map((v,i)=>v*Math.cos(phase)+orbit.along[i]*Math.sin(phase));
}

export function surveyVisibility(orbit,target){
 const a=dot(orbit.radial,target),b=dot(orbit.along,target),amplitude=Math.hypot(a,b);
 if(dot(orbit.sun,target)>sunLimit)return {blockedBySun:true,windows:[]};
 if(amplitude<=-earthLimit)return {blockedBySun:false,windows:[[0,SURVEY_PERIOD]]};
 // For a circular orbit r-hat · target = A cos(nt − phi). Exact limb crossings
 // keep a brief occultation from slipping between exposure endpoint samples.
 const phase=Math.atan2(b,a),delta=Math.acos(clamp(earthLimit/amplitude));
 const time=x=>((x%TAU+TAU)%TAU)*SURVEY_PERIOD/TAU;
 const bounds=[0,time(phase-delta),time(phase+delta),SURVEY_PERIOD].sort((x,y)=>x-y);
 const windows=[];
 for(let i=1;i<bounds.length;i++){
  const lo=bounds[i-1],hi=bounds[i];
  if(hi-lo>1e-7&&dot(surveyRadius(orbit,(lo+hi)/2),target)>=earthLimit)windows.push([lo,hi]);
 }
 return {blockedBySun:false,windows};
}
export function surveySlew(from,to){
 const angle=Math.acos(clamp(dot(from,to)));
 return angle<1e-7?0:angle/(SURVEY_SLEW_RATE*DEG)+SURVEY_SETTLE;
}
export function surveyFieldsForOrbit(orbit){
 return SURVEY_FIELDS.map(field=>({...field,visibility:field.tiles.map(v=>surveyVisibility(orbit,v))}));
}

// Place a complete four-tile mosaic in clear windows with adequate slew time.
// Prefer a field with both a clear and an occulted part of this particular orbit.
export function surveyExample(orbit,fields,preferred){
 const choices=(preferred?fields.filter(field=>field.id===preferred):[...fields]).sort((a,b)=>
  Number(b.visibility[0].windows.some(([s,e])=>e-s<SURVEY_PERIOD-1))-Number(a.visibility[0].windows.some(([s,e])=>e-s<SURVEY_PERIOD-1)));
 for(const field of choices){
  const example=arrangeSurveyField(orbit,fields,[],field.id);
  if(example.ok)return example.jobs;
 }
 return [];
}

// The editor always has four usable slots, even for a sky with no feasible
// four-exposure example. An empty selection can then be filled manually.
export function surveyStartingPlan(orbit,fields,preferred){
 const example=surveyExample(orbit,fields,preferred);
 if(example.length)return {jobs:example,found:true};
 const field=fields.find(f=>f.id===preferred)||fields[0]||SURVEY_FIELDS[0];
 const jobs=SURVEY_TILES.map((_,tile)=>({field:field.id,tile,start:300+tile*240,duration:150,enabled:false}));
 return {jobs,found:false};
}

export function retargetSurveyJobs(jobs,fieldId){
 return SURVEY_TILES.map((_,tile)=>({...jobs[tile]??{start:300+tile*240,duration:150,enabled:false},field:fieldId,tile}));
}
const orders=[];
function collectOrders(order){
 if(order.length===4){orders.push(order);return;}
 for(let i=0;i<4;i++)if(!order.includes(i))collectOrders([...order,i]);
}
collectOrders([]);

function placeOrder(orbit,field,jobs,slots,order){
 // Work backwards to leave room for every later exposure and slew. The
 // latest feasible start remains reachable even if an earlier start is moved.
 const latest=[];
 let nextStart=SURVEY_END,nextTile=null;
 for(let i=order.length-1;i>=0;i--){
  const tile=order[i],duration=jobs[tile].duration;
  const turn=nextTile===null?0:surveySlew(field.tiles[tile],field.tiles[nextTile]);
  const before=Math.floor(nextStart-duration-turn+1e-8);
  const last=slots[tile].filter(([lo])=>lo<=before).at(-1);
  if(!last)return null;
  latest[i]=Math.min(last[1],before);nextStart=latest[i];nextTile=tile;
 }
 const starts=[];let previousEnd=0,previousDirection=orbit.park;
 for(let i=0;i<order.length;i++){
  const tile=order[i],earliest=Math.ceil(previousEnd+surveySlew(previousDirection,field.tiles[tile])-1e-8);
  const desired=Number.isFinite(jobs[tile].start)?jobs[tile].start:earliest;
  let best=null,cost=Infinity;
  for(const [lo,hi] of slots[tile]){
   const from=Math.max(lo,earliest),to=Math.min(hi,latest[i]);if(from>to)continue;
   const time=Math.max(from,Math.min(to,Math.round(desired))),shift=Math.abs(time-desired);
   if(shift<cost){best=time;cost=shift;}
  }
  if(best===null)return null;
  starts[tile]=best;previousEnd=best+jobs[tile].duration;previousDirection=field.tiles[tile];
 }
 return starts;
}

// Explicit four-frame scheduling is atomic. A failed fit leaves every manual
// setting untouched. Only the requested field is considered, in all 24 orders.
export function arrangeSurveyField(orbit,fields,jobs,fieldId){
 const field=fields.find(f=>f.id===fieldId);
 if(!field)return {ok:false,reason:'field'};
 const target=retargetSurveyJobs(jobs,fieldId).map(job=>({...job,enabled:true})),slots=[];
 for(const [tile,job] of target.entries()){
  const visibility=field.visibility[tile];
  if(visibility.blockedBySun)return {ok:false,reason:'sun',tile};
  if(!visibility.windows.length)return {ok:false,reason:'earth',tile};
  if(!Number.isFinite(job.duration)||job.duration<=0)return {ok:false,reason:'duration',tile};
  slots[tile]=visibility.windows.map(([start,end])=>[Math.ceil(start-1e-8),Math.floor(Math.min(end,SURVEY_END)-job.duration+1e-8)])
   .filter(([start,end])=>end>=start);
  if(!slots[tile].length)return {ok:false,reason:'duration',tile};
 }
 if(evaluateSurveyPlan(orbit,fields,target).valid)return {ok:true,jobs:target};
 let selected=null,bestKept=-1,bestCost=Infinity;
 for(const order of orders){
  const starts=placeOrder(orbit,field,target,slots,order);if(!starts)continue;
  let kept=0,cost=0;
  for(const [tile,at] of starts.entries()){
   const original=target[tile].start;
   if(at===original)kept++;if(Number.isFinite(original))cost+=Math.abs(at-original);
  }
  if(kept>bestKept||kept===bestKept&&cost<bestCost){selected=starts;bestKept=kept;bestCost=cost;}
 }
 if(!selected)return {ok:false,reason:'sequence'};
 const arranged=target.map((job,i)=>({...job,start:selected[i]}));
 return evaluateSurveyPlan(orbit,fields,arranged).valid?{ok:true,jobs:arranged}:{ok:false,reason:'sequence'};
}

export function surveyPointingInfo(orbit,field,tile){
 const dir=field.tiles[tile];
 return {ra:(Math.atan2(dir[1],dir[0])/DEG+360)%360,dec:Math.asin(clamp(dir[2]))/DEG,
  sunAngle:Math.acos(clamp(dot(orbit.sun,dir)))/DEG,sunMinimum:SURVEY_SUN_ANGLE+corner/DEG};
}

export function evaluateSurveyPlan(orbit,fields,jobs){
 const order=[];
 for(const [index,job] of jobs.entries()){
  if(!job.enabled)continue;
  const field=fields.find(f=>f.id===job.field);
  if(!field||!Number.isInteger(job.tile)||!field.tiles[job.tile])throw Error('Invalid survey field');
  order.push({...job,index,direction:field.tiles[job.tile],visibility:field.visibility[job.tile],end:job.start+job.duration,issues:[]});
 }
 order.sort((a,b)=>a.start-b.start||a.index-b.index);
 let previousDirection=orbit.park,previousEnd=0;
 for(const job of order){
  job.slew=surveySlew(previousDirection,job.direction);
  job.readyAt=previousEnd+job.slew;
  if(!Number.isFinite(job.start)||!Number.isFinite(job.duration)||job.duration<=0||job.start<0||job.end>SURVEY_PERIOD)job.issues.push('range');
  if(job.visibility.blockedBySun)job.issues.push('sun');
  else if(!job.visibility.windows.some(([lo,hi])=>lo<=job.start+1e-8&&hi>=job.end-1e-8))job.issues.push('earth');
  if(job.start<previousEnd)job.issues.push('overlap');
  else if(job.start+1e-7<job.readyAt)job.issues.push('slew');
  previousEnd=Math.max(previousEnd,job.end);previousDirection=job.direction;
 }
 return {order,valid:order.length>0&&order.every(job=>!job.issues.length)};
}

function turnDirection(from,to,fraction){
 if(fraction<=0)return from;if(fraction>=1)return to;
 const cosine=clamp(dot(from,to)),angle=Math.acos(cosine);
 if(angle<1e-7)return to;
 let tangent=to.map((v,i)=>v-from[i]*cosine);
 if(norm(tangent)<1e-8)tangent=cross(from,Math.abs(from[2])<.8?[0,0,1]:[0,1,0]);
 tangent=unit(tangent);
 return from.map((v,i)=>v*Math.cos(angle*fraction)+tangent[i]*Math.sin(angle*fraction));
}

// Evaluating from the clock makes a pause, jump, or missed animation frame
// produce the same pointing and completed tiles as continuous execution.
export function surveyPlayback(orbit,plan,seconds){
 const completed=[];let direction=orbit.park;
 if(!plan.valid)return {phase:'invalid',direction,completed};
 for(const job of plan.order){
  if(seconds>=job.end){completed.push(job);direction=job.direction;continue;}
  if(seconds<job.start-job.slew)return {phase:'waiting',direction,completed,next:job};
  if(seconds<job.start){
   const turning=Math.max(job.slew-SURVEY_SETTLE,0);
   const f=turning?Math.min(1,(seconds-job.start+job.slew)/turning):1;
   return {phase:f<1?'slew':'settling',direction:turnDirection(direction,job.direction,f),completed,next:job};
  }
  return {phase:'exposure',direction:job.direction,completed,current:job,fraction:(seconds-job.start)/job.duration};
 }
 return {phase:seconds>=SURVEY_END?'finished':'coasting',direction,completed};
}
