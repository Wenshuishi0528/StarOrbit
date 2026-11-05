// Bundle and call checkXuntianEarth(viewer.sim) in the actual WebGL application.
import {cross,dot,earthAxes,EARTH_RADIUS,sunPosition,unit} from '../../src/orbit.js';
import {createXuntianViewRenderer} from '../../src/xuntian-view-render.js';

const rad=Math.PI/180,width=560,aspect=1.6;
const mult=(v,m)=>v.map(a=>a*m);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const axes=(forward,up)=>{const right=unit(cross(forward,up));return {right,up:unit(cross(right,forward)),forward};};
const infer=(basis,fixed)=>basis[0].map((v,i)=>fixed.reduce((sum,val,j)=>sum+val*basis[j][i],0));
function terrestrialFrame(date,lat,lon,limb=false){
 const basis=earthAxes(date),sun=sunPosition(date),fixed=[Math.cos(lat*rad)*Math.cos(lon*rad),Math.cos(lat*rad)*Math.sin(lon*rad),Math.sin(lat*rad)];
 const outward=infer(basis,fixed),north=infer(basis,[-Math.sin(lat*rad)*Math.cos(lon*rad),-Math.sin(lat*rad)*Math.sin(lon*rad),Math.cos(lat*rad)]),east=unit(cross(north,outward));
 const eyeKm=mult(outward,EARTH_RADIUS+405),delta=Math.acos(EARTH_RADIUS/(EARTH_RADIUS+405));
 const forward=limb?add(mult(outward,-Math.sin(delta)),mult(east,Math.cos(delta))):mult(outward,-1);
 return {q:{t:date,basis,earthAxes:basis,sun},axes:axes(forward,limb?outward:north),eyeKm,eyeLocal:[0,0,0],aspect,apertureMm:600,exposure:1,
  fovY:limb?30:35,showGalaxy:false,showStars:false,showStation:false};
}
async function image(blob){
 const im=await createImageBitmap(blob),c=document.createElement('canvas');c.width=im.width;c.height=im.height;
 const ctx=c.getContext('2d');ctx.drawImage(im,0,0);im.close();return ctx.getImageData(0,0,c.width,c.height).data;
}
function stats(img){
 const levels=new Uint32Array(256),rgb=[0,0,0];let lights=0,signal=0,texture=0;
 for(let i=0;i<img.length;i+=4){const lum=Math.round(.2126*img[i]+.7152*img[i+1]+.0722*img[i+2]);levels[lum]++;signal+=lum;
  for(let c=0;c<3;c++)rgb[c]+=img[i+c];if(img[i]>45&&img[i]>img[i+2]*1.3)lights++;
  if(i>=4&&i%(width*4))texture+=Math.abs(img[i]-img[i-4]);}
 const n=img.length/4;let total=0,p05=0,p95=255;
 for(let i=0;i<256;i++){total+=levels[i];if(total<.05*n)p05=i;if(total>=.95*n){p95=i;break;}}
 return {mean:signal/n,rgb:rgb.map(x=>x/n),p05,p95,lights,texture:texture/n};
}
const difference=(a,b)=>{let changed=0;for(let i=0;i<a.length;i+=4){if([0,1,2].some(j=>Math.abs(a[i+j]-b[i+j])>4))changed++;}return changed;};
function assert(value,message){if(!value)throw Error(message);}

export async function checkXuntianEarth(sim){
 const env=sim.environment,weather=env.weather,old={quality:env.quality,day:env.settings.daySource,night:env.settings.nightSource,
  clouds:env.settings.clouds,mode:weather.settings.cloud,volume:weather.settings.volume};
 const canvas=document.createElement('canvas'),renderer=createXuntianViewRenderer(sim,canvas),out={},samples={};
 async function shot(frame,name){const blob=await renderer.capture(frame,{width});if(name)samples[name]=URL.createObjectURL(blob);return image(blob);}
 async function clouds(mode){env.settings.clouds=mode!=='off';weather.settings.cloud=mode;await weather.apply('cloud');
  env.update(sim.current,sim.spaceCamera);}
 const date=Date.UTC(2026,10,8,4),day=terrestrialFrame(date,39.9,116.4),night=terrestrialFrame(date+12*3600e3,39.9,116.4);
 try{
  await env.setQuality('high','2024-1km','2026-q2-1km');await clouds('off');weather.settings.volume=false;
  const dayPic=await shot(day,'day'),daySource=renderer.earthSource(),nightPic=await shot(night,'night'),nightSource=renderer.earthSource();
  const small=await shot({...day,apertureMm:25}),minus=await shot({...day,exposure:.25}),plus=await shot({...day,exposure:2});
  Object.assign(out,{daySource,nightSource,day:stats(dayPic),night:stats(nightPic),apertureChanged:difference(dayPic,small),minus:stats(minus),plus:stats(plus)});
  assert(daySource.day?.width===8192&&daySource.night?.width===8192&&daySource.dayTiles.length&&nightSource.nightTiles.length,'8K global maps or optical footprint tiles missing: '+JSON.stringify(out));
  assert(out.day.mean>35&&out.day.p95-out.day.p05>8&&out.night.mean<out.day.mean&&out.night.lights>200,'Daylight or city emission missing: '+JSON.stringify(out));
  // Adjacent farmland near the optical axis has continuous aerial scattering.
  // A far-clipped atmosphere mesh used to leave a brown triangle over this area.
  const blueRed=(x,y)=>{const i=4*(y*width+x);return dayPic[i+2]-dayPic[i];};
  out.airContinuity=Math.abs(blueRed(265,179)-blueRed(275,187));
  assert(out.airContinuity<14,'Aerial scattering broke across neighbouring nadir rays: '+out.airContinuity);
  assert(out.apertureChanged===0&&out.minus.mean<out.day.mean&&out.day.mean<out.plus.mean,'Terrestrial EV or stellar aperture affected the wrong source: '+JSON.stringify(out));
  await clouds('builtin');const cloudDay=await shot(day),builtinSource=renderer.earthSource();await clouds('local');const localDay=await shot(day,'clouds'),localSource=renderer.earthSource();
  Object.assign(out,{builtinSource,localSource,builtinCloudPixels:difference(dayPic,cloudDay),localCloudPixels:difference(dayPic,localDay),cloudSourceDifference:difference(cloudDay,localDay)});
  assert(out.builtinCloudPixels>200&&out.localCloudPixels>200&&out.cloudSourceDifference>200&&localSource.cloud.source==='local','Cloud selection missing: '+JSON.stringify(out));
  const limb=terrestrialFrame(date,39.9,116.4,true),rim=await shot(limb,'limb'),h=rim.length/(width*4),quarter=width*Math.floor(h/4)*4;
  out.limb={upper:stats(rim.subarray(0,quarter)),lower:stats(rim.subarray(rim.length-quarter))};assert(out.limb.lower.mean>out.limb.upper.mean+10,'Daylit limb missing: '+JSON.stringify(out.limb));
  return {out,samples};
 }finally{renderer.dispose();env.settings.clouds=old.clouds;weather.settings.volume=old.volume;weather.settings.cloud=old.mode;
  await env.setQuality(old.quality,old.night,old.day);await weather.apply('cloud');}
}
