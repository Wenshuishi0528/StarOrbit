import {json2satrec,propagate,gstime} from 'satellite.js';
import {earthAxes,validateOrbit,parseOrbit} from './orbit.js';
import {mission,bindOrbit} from './missions.js';

export const GP_WINDOW_MS=3*86400000;
export function gpURL(noradId){if(!Number.isSafeInteger(noradId)||noradId<1||noradId>999999999)throw Error('无效 NORAD 编号');return 'https://celestrak.org/NORAD/elements/gp.php?CATNR='+noradId+'&FORMAT=JSON';}
export const DFH1_GP_URL=gpURL(4382);
export function validateGP(input,id){
 const x=Array.isArray(input)&&input.length===1?input[0]:input,task=mission(id);
 if(!x||Array.isArray(x)||typeof x!=='object'||!task.noradId||Number(x.NORAD_CAT_ID)!==task.noradId||x.OBJECT_ID!==task.objectId)throw Error('轨道文件的卫星编号与当前任务不符');
 for(const [key,value]of Object.entries({CENTER_NAME:'EARTH',REF_FRAME:'TEME',TIME_SYSTEM:'UTC',MEAN_ELEMENT_THEORY:'SGP4'}))if(x[key]!==undefined&&x[key]!==value)throw Error('不支持此轨道根数参考系或算法');
 if(typeof x.EPOCH!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(x.EPOCH)||!Number.isFinite(Date.parse(x.EPOCH.endsWith('Z')?x.EPOCH:x.EPOCH+'Z')))throw Error('无效轨道根数历元');
 const fields={MEAN_MOTION:[.1,18],ECCENTRICITY:[0,.99],INCLINATION:[0,180],RA_OF_ASC_NODE:[0,360],ARG_OF_PERICENTER:[0,360],MEAN_ANOMALY:[0,360],BSTAR:[-1,1],MEAN_MOTION_DOT:[-1,1],MEAN_MOTION_DDOT:[-1,1]};
 const clean={OBJECT_NAME:String(x.OBJECT_NAME||'').slice(0,80),OBJECT_ID:task.objectId,NORAD_CAT_ID:task.noradId,EPOCH:x.EPOCH};
 for(const [k,[lo,hi]]of Object.entries(fields)){const n=Number(x[k]);if(x[k]===null||x[k]===''||!Number.isFinite(n)||n<lo||n>hi)throw Error('无效轨道根数');clean[k]=n;}
 return clean;
}
// Vallado TEME -> PEF uses GMST82. The existing Earth axes map PEF to
// EQJ using GAST and Astronomy Engine's EQD -> EQJ precession/nutation.
// UTC approximates UT1; polar motion is omitted. This is a visualization
// conversion, independently checked against Skyfield (see docs/v0.29-details).
export function temeToJ2000(vector,time){
 const a=gstime(new Date(time)),c=Math.cos(a),s=Math.sin(a),fixed=[c*vector[0]+s*vector[1],-s*vector[0]+c*vector[1],vector[2]],axes=earthAxes(time);
 return [0,1,2].map(i=>fixed.reduce((sum,v,k)=>sum+v*axes[k][i],0));
}
export function gpState(satrec,time){
 const result=propagate(satrec,new Date(time));if(!result?.position||!result.velocity||satrec.error)throw Error('轨道传播失败');
 const r=['x','y','z'].map(k=>result.position[k]),v=['x','y','z'].map(k=>result.velocity[k]);
 const position=temeToJ2000(r,time),velocity=temeToJ2000(v,time),before=temeToJ2000(r,time-500),after=temeToJ2000(r,time+500);
 return {position,velocity:velocity.map((n,i)=>n+after[i]-before[i])};
}
export function orbitFromGP(input,id,{source='导入 GP / OMM · SGP4',url=''}={}){
 const gp=validateGP(input,id),epoch=Date.parse(gp.EPOCH.endsWith('Z')?gp.EPOCH:gp.EPOCH+'Z'),satrec=json2satrec(gp),rows=[];
 for(let time=epoch-GP_WINDOW_MS;time<=epoch+GP_WINDOW_MS;time+=60000){const {position,velocity}=gpState(satrec,time);rows.push([time,...position,...velocity]);}
 return bindOrbit(validateOrbit({source,created:new Date(epoch).toISOString(),url,objectId:gp.OBJECT_ID,noradId:gp.NORAD_CAT_ID,gpEpoch:new Date(epoch).toISOString(),propagator:'SGP4',gp,frame:'EME2000',timeSystem:'UTC',units:'km, km/s',center:'EARTH',rows}),id);
}
export function parseMissionOrbit(text,id){
 const start=text.trim()[0];
 if(start==='{'||start==='['){const x=JSON.parse(text);if(!x.rows)return orbitFromGP(x,id);}
 return bindOrbit(parseOrbit(text),id);
}
