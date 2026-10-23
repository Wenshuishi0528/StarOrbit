import {spectralGLSL} from './atmosphere-spectrum.js';
// Shared direct-sun transport for air, terrain and clouds. Distances are km.
// Bruneton (2008/2017): spectral transport, finite solar disk and phase functions.
// A direction toward the Sun is distinct from the local solar zenith angle.
export const solarOpticsGLSL=`${spectralGLSL}
uniform sampler2D solarDepth;uniform float linearOutput;
const vec3 airRayleigh=vec3(.005802,.013558,.0331);
const vec3 airMieExtinction=vec3(.00444);
const vec3 airOzone=vec3(.000650,.001881,.000085);
vec3 lightDepth(float h,float mu){
 float rho=6371.+h,lo=-sqrt(max(0.,1.-6371.*6371./(rho*rho)));
 vec2 uv=vec2(sqrt(clamp((mu-lo)/(1.-lo),0.,1.)),sqrt(clamp(h/100.,0.,1.)));
 return texture2D(solarDepth,(uv*vec2(255.,127.)+.5)/vec2(256.,128.)).rgb;
}
float solarVisibility(float h,float mu){
 float ratio=6371./(6371.+max(h,0.)),limb=sqrt(max(0.,1.-ratio*ratio));
 float disk=clamp((mu+limb)/(.00465*ratio),-1.,1.);
 return (acos(-disk)+disk*sqrt(max(0.,1.-disk*disk)))/3.14159265;
}
vec3 sunlightAt(float h,float mu){
 vec3 depth=lightDepth(max(h,0.),mu);
 return spectralTransmission(depth)*solarVisibility(h,mu);
}
float rayleighPhase(float cosine){return .0596831037*(1.+cosine*cosine);}
float miePhase(float cosine){
 const float g=.76;
 return .1193662073*(1.-g*g)*(1.+cosine*cosine)/((2.+g*g)*pow(1.+g*g-2.*g*cosine,1.5));
}`;
