import {stateAt,earthAxes,sunPosition,EARTH_RADIUS,dot} from '../../src/orbit.js';
import {zoomAtFov} from '../../src/xuntian-pointing.js';
export function prepareCityUI(sim,id){
 const city=sim.environment.cityTerrain.cities.get(id),[lon,lat]=city.center,D=Math.PI/180,local=[Math.cos(lat*D)*Math.cos(lon*D),Math.cos(lat*D)*Math.sin(lon*D),Math.sin(lat*D)];
 let best=null;
 for(let time=Date.UTC(2026,10,4);time<Date.UTC(2026,10,9);time+=60000){
  const q=stateAt(sim.data,time);if(!q)continue;const basis=earthAxes(time),normal=[0,1,2].map(i=>basis.reduce((sum,a,j)=>sum+a[i]*local[j],0)),solar=dot(normal,sunPosition(time))/Math.hypot(...sunPosition(time));
  if(solar<.3)continue;const alignment=dot(normal,q.position)/Math.hypot(...q.position);
  if(!best||alignment>best.alignment)best={time,alignment,solar,range:Math.hypot(...q.position.map((p,i)=>p-normal[i]*EARTH_RADIUS))};
 }
 if(!best||best.alignment<EARTH_RADIUS/(EARTH_RADIUS+410))throw Error('No daylit visible pass for '+id);
 sim.seek(best.time);sim.paused=true;sim.environment.settings.clouds=false;sim.environment.weather.settings.volume=false;sim.update(performance.now());
 return {...best,city,cityZoom:Math.round(1000*zoomAtFov(2*Math.atan(11/best.range)/D)),detailZoom:Math.round(1000*zoomAtFov(2*Math.atan(2.5/best.range)/D))};
}
