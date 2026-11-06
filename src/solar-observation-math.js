import {cross,dot,unit} from './orbit.js';

// Browse images are already solar-north-up, not longitude/latitude maps.
// The solar-west axis is image-right; the detector roll is applied only once,
// by projecting this inertial frame through the actual observing camera.
export function solarImageAxes(body){
 const forward=unit(body.direction),right=unit(cross(forward,body.north)),up=unit(cross(right,forward));
 return {forward,right,up};
}
export function solarImageUV(ray,body,record){
 const axes=solarImageAxes(body),along=dot(ray,axes.forward);
 if(along<=0)return null;
 const scale=record.radiusFraction/(2*along*Math.tan(body.radiusRad));
 const center=record.solarCenterUV||[.5,.5];
 return [center[0]+dot(ray,axes.right)*scale,center[1]+dot(ray,axes.up)*scale];
}
export function solarImageFootprint(body,record){
 const fraction=record?.radiusFraction;
 if(!(fraction>0&&fraction<=1)||!body?.radiusRad)return null;
 return Math.atan(Math.tan(body.radiusRad)/fraction);
}
// These bodies can pass in front of the Sun. The Moon may cover the entire
// disk; inner planets retain their true apparent sizes during a transit.
export function solarImageOccluders(sun,bodies){
 return bodies.filter(body=>['Moon','Mercury','Venus'].includes(body.id)&&body.distanceKm<sun.distanceKm&&body.radiusRad>0);
}
