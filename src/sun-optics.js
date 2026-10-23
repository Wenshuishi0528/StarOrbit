import {spectralTransmission} from './atmosphere-spectrum.js';
// Finite solar disk transport to an observer above the atmosphere. Distances km.
import {horizonCosine} from './atmosphere-optics.js';
const R=6371,A=6471;
export function sampleDepth(table,h,mu){
 const lo=horizonCosine(h),x=Math.sqrt(Math.max(0,Math.min(1,(mu-lo)/(1-lo))))*(table.width-1),y=Math.sqrt(Math.max(0,Math.min(1,h/100)))*(table.height-1),ix=Math.min(table.width-2,Math.floor(x)),iy=Math.min(table.height-2,Math.floor(y)),a=x-ix,b=y-iy;
 return [0,1,2].map(c=>{const i=(iy*table.width+ix)*4+c;return (1-b)*((1-a)*table.data[i]+a*table.data[i+4])+b*((1-a)*table.data[i+table.width*4]+a*table.data[i+(table.width+1)*4]);});
}
export function solarAppearance(position,direction,distance,table){
 const r=Math.hypot(...position),len=Math.hypot(...direction),mu=position.reduce((v,p,i)=>v+p*direction[i],0)/(r*len),elevation=Math.asin(Math.max(-1,Math.min(1,mu))),radius=Math.asin(Math.min(1,695700/distance));
 const horizon=-Math.acos(Math.min(1,R/r)),cut=Math.max(-1,Math.min(1,(horizon-elevation)/radius)),visible=(Math.acos(cut)-cut*Math.sqrt(Math.max(0,1-cut*cut)))/Math.PI;
 if(visible===0)return {rgb:[0,0,0],visible,radius};
 const rgb=[0,0,0];let weights=0;
 // Integrate vertical strips of the disk; the circular segment visibility is
 // analytic, so eclipse entry does not jump between individual point samples.
 for(let i=0;i<32;i++){
  const y=cut+(1-cut)*(i+.5)/32,w=Math.sqrt(Math.max(0,1-y*y)),el=elevation+y*radius,b=r*Math.sin(el),impact=r*Math.cos(el);
  let t=[1,1,1];
  if(b<0&&impact<A){const entry=-b-Math.sqrt(Math.max(0,A*A-impact*impact)),entryMu=(b+entry)/A,depth=sampleDepth(table,100,entryMu);t=spectralTransmission(depth);}
  weights+=w;for(let c=0;c<3;c++)rgb[c]+=w*t[c];
 }
 return {rgb:rgb.map(v=>v*visible/weights),visible,radius};
}

// Fraction of the Sun left visible behind a circular foreground occultor.
export function diskVisibility(sunRadius,bodyRadius,separation){
 const a=sunRadius,b=bodyRadius,d=separation;
 if(d>=a+b)return 1;if(d<=b-a)return 0;if(d<=a-b)return 1-b*b/(a*a);
 const clamp=x=>Math.max(-1,Math.min(1,x));
 const overlap=a*a*Math.acos(clamp((d*d+a*a-b*b)/(2*d*a)))+b*b*Math.acos(clamp((d*d+b*b-a*a)/(2*d*b)))-.5*Math.sqrt(Math.max(0,(-d+a+b)*(d+a-b)*(d-a+b)*(d+a+b)));
 return Math.max(0,Math.min(1,1-overlap/(Math.PI*a*a)));
}
