import {dot,norm,unit,sub,sunlightFraction} from './orbit.js';
import {MOON_RADIUS} from './moon-math.js';

// Lambert-sphere phase and inverse-square dilution, relative to direct sunlight.
// Keep lunar irradiance at its physical ratio; no visibility amplification.
export function cloudMoonIrradiance(position,sun){
 const distance=norm(position);
 if(!Number.isFinite(distance)||distance<=MOON_RADIUS)return 0;
 const cosine=Math.max(-1,Math.min(1,dot(unit(sub(sun,position)),unit(position.map(v=>-v)))));
 const phase=Math.acos(cosine),fraction=(Math.sin(phase)+(Math.PI-phase)*cosine)/Math.PI;
 return .12*(MOON_RADIUS/distance)**2*Math.max(0,fraction)*sunlightFraction(position,sun);
}

export const cloudMoonGLSL=`
uniform vec3 cloudMoonPosition;
uniform float cloudMoonLight;
vec3 nightCloudLight(vec3 p,float solarMu){
 if(cloudNightVisible<.5||cloudMoonLight<=0.||solarMu>=-.08)return vec3(0.);
 float night=1.-smoothstep(-.15,-.08,solarMu),h=max(0.,length(p)-6371.);
 vec3 toMoon=cloudMoonPosition-p;float distance=length(toMoon),mu=dot(normalize(p),toMoon/distance);
 float ratio=6371./(6371.+h),limb=sqrt(max(0.,1.-ratio*ratio));
 float disk=clamp((mu+limb)/(1737.4/distance*ratio),-1.,1.);
 float visible=(acos(-disk)+disk*sqrt(max(0.,1.-disk*disk)))/3.14159265;
 if(visible<=0.)return vec3(0.);
 float dilution=dot(cloudMoonPosition,cloudMoonPosition)/(distance*distance);
 return vec3(.95,.97,1.)*cloudMoonLight*night*dilution*visible*(max(mu,0.)+.035)*spectralTransmission(lightDepth(h,mu));
}`;
