import {climateMasks} from './cloud-geography.js';
export const PHENOMENA_DEFAULTS=Object.freeze({mode:'natural',lightning:true,upper:true,airglow:true,meteors:true});
export function phenomenaSettings(value={}){
 const result={...PHENOMENA_DEFAULTS};
 if(['natural','enhanced'].includes(value?.mode))result.mode=value.mode;
 for(const k of ['lightning','upper','airglow','meteors'])if(typeof value?.[k]==='boolean')result[k]=value[k];
 return result;
}
export function randomAt(seed,index){let n=Math.imul((seed|0)^(index|0),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;}
export function direction(lon,lat){const a=lon*Math.PI/180,b=lat*Math.PI/180;return [Math.cos(b)*Math.cos(a),Math.cos(b)*Math.sin(a),Math.sin(b)];}
// Broad geographic/seasonal prior, not a lightning retrieval from cloud brightness.
export function stormPrior(lon,lat,season=0){
 const [dry,humid,marine]=climateMasks(lon,lat),belt=Math.exp(-(((lat-7*season)/28)**2));
 return Math.max(0,Math.min(1,(.12+.65*belt+.32*humid)*(1-.8*dry)*(1-.85*marine)*(1-Math.min(1,Math.max(0,(Math.abs(lat)-48)/14)))));
}
export function flashEnvelope(age,enhanced=false){
 const scale=enhanced?1.6:1,a=age/scale;
 if(a<0||a>.65)return 0;
 // Several cloud-internal return pulses; bounded local light, no full-screen strobe.
 return Math.exp(-(((a-.06)/.045)**2))+.65*Math.exp(-(((a-.23)/.06)**2))+.38*Math.exp(-(((a-.43)/.1)**2));
}
export function eventClock(previous,time,wall,rate=1){
 if(!previous)return {time,wall,phase:time/1000,reset:true};
 const dt=(time-previous.time)/1000,real=Math.max(0,(wall-previous.wall)/1000);
 const jump=dt<0||dt>Math.max(2,real*Math.max(1,rate)*1.5+.2)||real>1;
 return {time,wall,phase:jump?time/1000:previous.phase+Math.min(Math.max(0,dt),Math.min(real,.1)*2),reset:jump};
}
// Segment to camera occluded by Earth; also used to reject back-side emitters early.
export function earthOccluded(point,eye,radius=6371){
 const d=point.map((x,i)=>x-eye[i]),len=d.reduce((s,x)=>s+x*x,0);
 const t=Math.max(0,Math.min(1,-eye.reduce((s,x,i)=>s+x*d[i],0)/Math.max(len,1e-9)));
 return eye.reduce((s,x,i)=>s+(x+t*d[i])**2,0)<radius*radius;
}
