import {dot} from './orbit.js';
import {wrapAzimuth} from './balcony-lab-geometry.js';

const DEG=Math.PI/180;
const bound=(v,min,max)=>Math.max(min,Math.min(max,v));
export const skyDirection=(azimuth,elevation)=>{
 const a=azimuth*DEG,e=elevation*DEG,c=Math.cos(e);return [c*Math.sin(a),c*Math.cos(a),Math.sin(e)];
};
export function skyAngles(v){
 return {azimuth:wrapAzimuth(Math.atan2(v[0],v[1])/DEG)%360,elevation:Math.atan2(v[2],Math.hypot(v[0],v[1]))/DEG};
}
export function skyPose(mode,azimuth,elevation,roll=0){
 const valid=Number.isFinite(azimuth)&&Number.isFinite(elevation)&&Number.isFinite(roll);if(!valid)return null;
 return {azimuth:wrapAzimuth(azimuth)%360,elevation:bound(elevation,mode==='hemisphere'?0:-90,90),roll:wrapAzimuth(roll+180)-180};
}

// Local vectors are east, north, up. Positive roll rotates the device clockwise
// about the sightline. A fixed star consequently rotates counterclockwise on screen.
export function skyProjection3D(mode,width,height,pose,zoom=1){
 const a=pose.azimuth*DEG,e=pose.elevation*DEG,r=pose.roll*DEG;
 const forward=skyDirection(pose.azimuth,pose.elevation),right0=[Math.cos(a),-Math.sin(a),0];
 const up0=[-Math.sin(a)*Math.sin(e),-Math.cos(a)*Math.sin(e),Math.cos(e)];
 const right=right0.map((v,i)=>v*Math.cos(r)-up0[i]*Math.sin(r));
 const up=up0.map((v,i)=>v*Math.cos(r)+right0[i]*Math.sin(r));
 const radius=Math.max(1,Math.min(width,height)/2-Math.min(14,height*.06));
 const scale=bound(zoom,1,3.2),focal=height/2/Math.tan(82*DEG/2)*scale;
 return {mode,width,height,forward,right,up,radius,scale,focal};
}
export function projectSky(v,view){
 const {mode,width,height,forward,right,up,radius,scale,focal}=view;
 const x=dot(v,right),y=dot(v,up),z=dot(v,forward);
 let factor;
 if(mode==='hemisphere'){
  if(v[2]<-1e-8||z < -1e-8)return null;
  const angle=Math.acos(bound(z,-1,1)),sine=Math.hypot(x,y);
  if(angle*scale>Math.PI/2+1e-8)return null;
  factor=sine>1e-9?radius*scale*angle/(Math.PI/2*sine):radius*scale/(Math.PI/2);
 }else{
  // Clip to the forward frustum, including a small margin for strokes and labels.
  if(z<=0||Math.abs(x)*focal>z*(width/2+30)||Math.abs(y)*focal>z*(height/2+30))return null;
  factor=focal/z;
 }
 return {x:width/2+x*factor,y:height/2-y*factor};
}
export function skyRay(x,y,view){
 const {mode,width,height,right,up,forward,radius,scale,focal}=view;
 const dx=x-width/2,dy=height/2-y;let a,b,c;
 if(mode==='hemisphere'){
  const radiusPx=Math.hypot(dx,dy);if(radiusPx>radius+1e-7)return null;
  const theta=radiusPx*Math.PI/(2*radius*scale),t=radiusPx?Math.sin(theta)/radiusPx:0;
  a=dx*t;b=dy*t;c=Math.cos(theta);
 }else{
  const n=Math.hypot(dx,dy,focal);a=dx/n;b=dy/n;c=focal/n;
 }
 return [0,1,2].map(i=>right[i]*a+up[i]*b+forward[i]*c);
}

// Grab the sky: at zero roll a rightward drag turns the camera west, and a
// downward drag aims it higher. Transform the drag through any current roll.
export function dragSkyPose(mode,pose,dx,dy,view){
 const degreesPerPixel=mode==='hemisphere'?90/(view.radius*view.scale):1/(DEG*view.focal);
 const r=pose.roll*DEG,h=dx*Math.cos(r)-dy*Math.sin(r),v=dx*Math.sin(r)+dy*Math.cos(r);
 return skyPose(mode,pose.azimuth-h*degreesPerPixel,pose.elevation+v*degreesPerPixel,pose.roll);
}
