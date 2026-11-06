// Actual WebGL fixture: shared imagery, zoom, photo readiness and offline built-ins.
import {cross,dot,earthAxes,EARTH_RADIUS,sunPosition,unit} from '../../src/orbit.js';
import {createXuntianViewRenderer} from '../../src/xuntian-view-render.js';
const D=Math.PI/180;
const inertial=(basis,v)=>[0,1,2].map(i=>basis.reduce((sum,axis,j)=>sum+axis[i]*v[j],0));
function frameAt(date,lat,lon,fovY){
 const basis=earthAxes(date),normal=[Math.cos(lat*D)*Math.cos(lon*D),Math.cos(lat*D)*Math.sin(lon*D),Math.sin(lat*D)],north=[-Math.sin(lat*D)*Math.cos(lon*D),-Math.sin(lat*D)*Math.sin(lon*D),Math.cos(lat*D)];
 const outward=inertial(basis,normal),forward=outward.map(x=>-x),up=inertial(basis,north),right=unit(cross(forward,up));
 return {q:{t:date,earthAxes:basis,basis,sun:sunPosition(date)},eyeKm:outward.map(x=>x*(EARTH_RADIUS+405)),eyeLocal:[0,0,0],axes:{forward,right,up:unit(cross(right,forward))},fovY,apertureMm:315,exposure:1,aspect:1.6,showGalaxy:false,showStars:false,showStation:false,labels:false};
}
async function pixels(blob){const im=await createImageBitmap(blob),c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);im.close();return {data:ctx.getImageData(0,0,c.width,c.height).data,png:c.toDataURL('image/png'),w:c.width,h:c.height};}
function stats(pic){let sum=0,black=0,edge=0;const {data,w,h}=pic,n=w*(h-45);for(let y=0;y<h-45;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];sum+=l;if(l<2)black++;if(x)edge+=Math.abs(data[i]-data[i-4]);}return {mean:sum/n,black,texture:edge/n};}
const difference=(a,b)=>{let sum=0,n=0;for(let i=0;i<a.w*(a.h-45)*4;i+=4){for(let c=0;c<3;c++)sum+=Math.abs(a.data[i+c]-b.data[i+c]);n+=3;}return sum/n;};
const check=(v,msg)=>{if(!v)throw Error(msg)};
export async function checkCityTerrain(sim){
 const env=sim.environment,manager=env.cityTerrain,old={enabled:env.settings.cityTerrain,clouds:env.settings.clouds,volume:env.weather.settings.volume},canvas=document.createElement('canvas'),view=createXuntianViewRenderer(sim,canvas),result={images:{},cities:{}};
 try{
  env.settings.clouds=false;env.weather.settings.volume=false;env.settings.cityTerrain=true;manager.setEnabled(true);env.update(sim.current,sim.spaceCamera);
  for(const [id,lat,lon,date] of [['beijing',39.9093,116.3974,Date.UTC(2026,6,8,4)],['seattle',47.6062,-122.3321,Date.UTC(2026,6,8,20)]]){
   const shots={},report={};
   for(const [name,fov]of [['overview',8],['city',3],['detail',.16]]){
    const frame=frameAt(date,lat,lon,fov),pic=await pixels(await view.capture(frame,{width:1440}));
    shots[name]=pic;report[name]={...stats(pic),status:view.photoCityStatus()};
    report[name].status={requested:report[name].status.requested,ready:report[name].status.ready,complete:report[name].status.complete,sources:report[name].status.sources.map(s=>s.id)};
    check(report[name].status.complete&&report[name].status.sources.includes(id),id+' missing built-in tiles '+JSON.stringify(report[name]));
    check(report[name].black===0&&report[name].mean>10,id+' unexpected black or dim daytime '+JSON.stringify(report[name]));
    result.images[id+'-'+name]=pic.png;
   }
   env.settings.cityTerrain=false;manager.setEnabled(false);
   const fallback=await pixels(await view.capture(frameAt(date,lat,lon,.16),{width:1440}));
   report.fallback=stats(fallback);report.detailDifference=difference(shots.detail,fallback);
   check(report.detailDifference>3,id+' optical photo did not use city tiles '+JSON.stringify(report));
   check(manager.status('main').cpuBytes===4,id+' disabled manager retained full GPU pixels');
   env.settings.cityTerrain=true;manager.setEnabled(true);
   result.cities[id]=report;
  }
  result.budget=manager.status('main');result.budget={gpuBytes:result.budget.gpuBytes,cpuBytes:result.budget.cpuBytes};
  return result;
 }finally{view.dispose();env.settings.clouds=old.clouds;env.weather.settings.volume=old.volume;env.settings.cityTerrain=old.enabled;manager.setEnabled(old.enabled);}
}
