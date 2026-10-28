import {normalizeGeographySettings} from './geography-settings.js';
import {normalizeStarChartSettings} from './star-chart-settings.js';
import {validateRotation} from './spacecraft-attitude.js';
import {describeAssembly,MODULE_TYPES} from './assembly.js';
import {PHENOMENA_DEFAULTS} from './phenomena-math.js';
import {DEFAULT_MISSION,mission,spacecraft,bindOrbit,validatePose} from './missions.js';
import {validateOrbit} from './orbit.js';

export const SCENE_FORMAT='tiangong-scene-2',MAX_SCENE_BYTES=16e6;
export const DISPLAY_KEYS=['occlusion','orbitPath','sunVector','fillLight','labels','showTelemetry','showMinimap'];
const bad=()=>{throw Error('场景文件无效或版本不兼容');};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const number=(x,lo,hi)=>Number.isFinite(x)&&x>=lo&&x<=hi?x:bad();
const bool=x=>typeof x==='boolean'?x:bad();
const text=(x,max=120)=>typeof x==='string'&&x.length<=max?x:bad();
const choice=(x,values)=>values.includes(x)?x:bad();
const vector=x=>Array.isArray(x)&&x.length===3?x.map(v=>number(v,-1e7,1e7)):bad();
function camera(x){
 if(!object(x))bad();
 const position=vector(x.position),target=vector(x.target),up=vector(x.up);
 if(Math.hypot(...position.map((v,i)=>v-target[i]))<1e-9||Math.hypot(...up)<.1)bad();
 return {position,target,up,fov:number(x.fov,10,100),zoom:number(x.zoom,.1,20)};
}
function reference(x){
 if(x===null)return null;
 if(!object(x))bad();
 return {id:text(x.id,256),source:text(x.source,1024),provider:text(x.provider,40),time:x.time===null?null:number(x.time,0,8.64e15)};
}
// Rebuild from explicit fields: imported JSON never assigns arbitrary object keys.
export function validateScene(x){
 if(!object(x)||![SCENE_FORMAT,'tiangong-scene-1'].includes(x.format)||!object(x.simulation)||!object(x.environment)||!object(x.weather)||!object(x.display)||!object(x.cameras))bad();
 const legacy=x.format==='tiangong-scene-1',missionId=legacy?DEFAULT_MISSION:x.mission?.id;mission(missionId);
 const task={id:missionId,pose:legacy?validatePose():validatePose(x.mission?.pose),rotation:validateRotation(legacy?{}:x.mission?.rotation,x.simulation.time,{enabled:!!mission(missionId).spinRpm})};
 let assembly=null;
 if(spacecraft(missionId).capabilities.assembly){
 const a=x.assembly;if(!object(a))bad();
 if(!object(a.slots)||!object(a.angles)||Object.keys(a.slots).length>4096)bad();
 for(const [key,value] of Object.entries(a.slots))if(key.length>4096||!['',...MODULE_TYPES].includes(value))bad();
 const graph=describeAssembly(a.slots);
 if(graph.instances.length>256)bad();
 if(Object.keys(a.slots).length!==Object.keys(graph.slots).length||Object.keys(a.slots).some(k=>!Object.hasOwn(graph.slots,k)))bad();
 const showXT=bool(a.showXT),ids=graph.instances.map(i=>i.id);if(showXT)ids.push('freeXT');
 const angles={};for(const id of ids){const v=a.angles[id];if(!object(v))bad();angles[id]=Object.fromEntries(['roll','left','right'].map(k=>[k,number(v[k],-180,180)]));}
 assembly={slots:graph.slots,showXT,target:choice(a.target,ids),linked:bool(a.linked),pair:bool(a.pair),angles};
 }else if(x.assembly!==null)bad();
 let orbit=null;
 if(x.orbit!==null){if(!object(x.orbit))bad();orbit=bindOrbit(validateOrbit({source:text(x.orbit.source,1024),created:text(x.orbit.created,120),frame:x.orbit.frame,timeSystem:x.orbit.timeSystem,units:x.orbit.units,rows:x.orbit.rows,...(x.orbit.center!==undefined?{center:x.orbit.center}:{}),...(x.orbit.missionId!==undefined?{missionId:x.orbit.missionId}:{})}),missionId);}
 if(orbit){
  for(const key of ['objectId','gpEpoch','propagator'])if(x.orbit[key]!==undefined)orbit[key]=text(x.orbit[key],120);
  if(x.orbit.noradId!==undefined)orbit.noradId=number(x.orbit.noradId,1,999999999);
  if(orbit.propagator!==undefined&&(orbit.propagator!=='SGP4'||!Number.isFinite(Date.parse(orbit.gpEpoch))))bad();
  bindOrbit(orbit,missionId);
 }
 if(legacy&&!orbit)bad();
 const time=number(x.simulation.time,-8.64e15+86400000,8.64e15-86400000);
 if(!spacecraft(missionId).capabilities.solarArrays&&x.simulation.auto!==false)bad();
 const e=x.environment,w=x.weather;
 const environment={quality:choice(e.quality,['simple','medium','standard','high']),exposure:choice(e.exposure,['view','photo','cinematic']),cloudOpacity:number(e.cloudOpacity,0,1),starBrightness:number(e.starBrightness,0,2)};
 for(const key of ['stars','milky','moon','clouds','groundTrack'])environment[key]=bool(e[key]);
 environment.cloudNightVisible=e.cloudNightVisible===undefined?false:bool(e.cloudNightVisible);
 Object.assign(environment,normalizeStarChartSettings(e,{strict:true}),normalizeGeographySettings(e,{strict:true}));
 const weather={cloud:choice(w.cloud,['builtin','off','local','latest','history','satcorps']),aurora:choice(w.aurora,['off','local','latest','history']),seed:text(w.seed,80),auroraStrength:number(w.auroraStrength,0,4),exposure:number(w.exposure,.3,2.5),volume:bool(w.volume),motion:bool(w.motion),adaptive:bool(w.adaptive),cloudRecord:reference(w.cloudRecord),auroraRecord:reference(w.auroraRecord)};
 const phenomena=x.phenomena===undefined?{...PHENOMENA_DEFAULTS}:{mode:choice(x.phenomena?.mode,['natural','enhanced']),...Object.fromEntries(['lightning','upper','airglow','meteors'].map(k=>[k,bool(x.phenomena?.[k])]))};
 const display=Object.fromEntries(DISPLAY_KEYS.map(k=>[k,bool(x.display[k])]));
 return {format:SCENE_FORMAT,name:text(x.name,60),appVersion:text(x.appVersion,30),mission:task,assembly,simulation:{time,speed:choice(x.simulation.speed,[1,10,60,300,1000]),auto:bool(x.simulation.auto),view:choice(x.simulation.view,['follow','orbit'])},environment,weather,phenomena,display,cameras:{follow:camera(x.cameras.follow),overview:camera(x.cameras.overview),home:x.cameras.home?camera(x.cameras.home):null},orbit};
}
