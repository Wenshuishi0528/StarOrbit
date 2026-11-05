import {cross,dot,unit,norm,earthAxes,EARTH_RADIUS} from './orbit.js';
import {surveyRadius,SURVEY_ALTITUDE,SURVEY_END,SURVEY_PERIOD} from './survey-lab-math.js';

const DEG=Math.PI/180,TAU=2*Math.PI;
export const SURVEY_RADIUS_RATIO=(EARTH_RADIUS+SURVEY_ALTITUDE)/EARTH_RADIUS;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));

// Use the survey solver's exact window edges; a point on the orbit has the
// same classification on the overview and on the exposure tracks.
export function surveyWindowArcs(visibility){
 if(visibility.blockedBySun)return [{start:0,end:SURVEY_PERIOD,kind:'sun'}];
 const result=[];let end=0;
 for(const [lo,hi] of visibility.windows){
  if(lo>end)result.push({start:end,end:lo,kind:'earth'});
  if(hi>lo)result.push({start:lo,end:hi,kind:'clear'});
  end=hi;
 }
 if(end<SURVEY_PERIOD)result.push({start:end,end:SURVEY_PERIOD,kind:'earth'});return result;
}
export function surveyWindowAt(visibility,elapsed){
 if(visibility.blockedBySun)return 'sun';
 return visibility.windows.some(([lo,hi])=>elapsed>=lo-1e-7&&elapsed<=hi+1e-7)?'clear':'earth';
}
// Orthographic projection in Earth radii. A normal view can show the entire
// thousand-kilometre ground scale and the 400 km orbit without distorting either.
export function surveyMapView(orbit,yaw=0,tilt=0){
 const a=yaw*DEG,b=clamp(tilt,-67,67)*DEG,normal=unit(cross(orbit.radial,orbit.along));
 const right=orbit.radial.map((r,i)=>r*Math.cos(a)+orbit.along[i]*Math.sin(a));
 const tangent=orbit.radial.map((r,i)=>-r*Math.sin(a)+orbit.along[i]*Math.cos(a));
 const up=tangent.map((v,i)=>v*Math.cos(b)-normal[i]*Math.sin(b));
 const front=tangent.map((v,i)=>v*Math.sin(b)+normal[i]*Math.cos(b));
 return {right,up,front,yaw,tilt:clamp(tilt,-67,67)};
}
export function surveyEquatorialView(orbit,azimuth=0){
 const pole=earthAxes(orbit.epoch)[2],normal=unit(cross(orbit.radial,orbit.along));
 const line=cross(pole,normal),hasNodes=norm(line)>1e-7;
 const axis=hasNodes?unit(line):unit(orbit.radial.map((v,i)=>v-pole[i]*dot(orbit.radial,pole)));
 const tangent=cross(pole,axis),r=(35+azimuth)*DEG;
 const right=axis.map((v,i)=>v*Math.cos(r)+tangent[i]*Math.sin(r));
 const up=pole,front=unit(cross(right,up));
 // Rotate map clicks into the projected orbit's major/minor axes.
 const common=cross(normal,front),major=norm(common)>1e-10?unit(common):orbit.radial;
 const yaw=Math.atan2(dot(major,orbit.along),dot(major,orbit.radial))/DEG;
 const roll=-Math.atan2(dot(major,up),dot(major,right))/DEG;
 return {right,up,front,yaw,tilt:Math.acos(clamp(dot(normal,front),-1,1))/DEG,roll,azimuth,
  equatorial:true,ascending:hasNodes?axis:null};
}
export function surveyProjectedPoint(v,view){
 const x=dot(v,view.right),y=dot(v,view.up),z=dot(v,view.front);
 return {x,y,z,behindEarth:z<0&&x*x+y*y<1-1e-9};
}
export function surveyOrbitPosition(orbit,elapsed){
 return surveyRadius(orbit,elapsed).map(x=>x*SURVEY_RADIUS_RATIO);
}
export function surveyTimeAtMapPoint(x,y,view,tolerance,elapsed=0){
 // Express the click along/across the line of nodes, accounting for the projected orbit orientation.
 if(!Number.isFinite(x)||!Number.isFinite(y))return null;
 const roll=(view.roll||0)*DEG,nx=x*Math.cos(roll)-y*Math.sin(roll),ny=x*Math.sin(roll)+y*Math.cos(roll);
 const cos=Math.cos(view.tilt*DEG),radius=SURVEY_RADIUS_RATIO;
 const seconds=a=>((a+view.yaw*DEG)%TAU+TAU)%TAU/TAU*SURVEY_PERIOD;
 let angle;
 if(Math.abs(cos)<.001){
  // An edge-on orbit projects two phases onto the same line. Prefer the
  // closer branch on screen, then the one nearest the current clock.
  const a=Math.acos(clamp(nx/radius,-1,1));
  const candidates=[a,-a].map(value=>{
   const dt=Math.abs(seconds(value)-elapsed);
   return {value,dy:Math.abs(ny-radius*cos*Math.sin(value)),dt:Math.min(dt,SURVEY_PERIOD-dt)};
  });
  const [first,second]=candidates;
  angle=(Math.abs(first.dy-second.dy)<1e-8?(first.dt<=second.dt?first:second):(first.dy<second.dy?first:second)).value;
 }else angle=Math.atan2(ny/cos,nx);
 const distance=Math.hypot(nx-radius*Math.cos(angle),ny-radius*cos*Math.sin(angle));
 if(distance>tolerance||Math.hypot(nx,ny)<1e-8&&Math.abs(cos)>=.001)return null;
 const raw=seconds(angle);
 // The start and end share one pixel. Keep the endpoint nearest the current clock.
 if(Math.min(raw,SURVEY_PERIOD-raw)<.5)return elapsed>SURVEY_PERIOD/2?SURVEY_END:0;
 return clamp(Math.round(raw),0,SURVEY_END);
}
// A short displayed sightline may intersect the Earth. The schedule itself
// still uses the full tile footprint and the adopted limb margin.
export function surveyEarthIntercept(position,direction){
 const towards=-dot(position,direction);
 if(towards<=0)return null;
 const discriminant=towards*towards-(dot(position,position)-1);
 if(discriminant<0)return null;
 return towards-Math.sqrt(discriminant);
}
