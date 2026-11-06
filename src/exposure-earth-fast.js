import { radiometryGLSL } from './earth-radiometry.js';
import { cloudToneGLSL } from './cloud-texture.js';

// CPU WebGL drivers can spend minutes compiling the full volumetric atmosphere.
// Use the environment's selected global textures at their native resolution and
// keep the same shutter, mount occlusion, inertial sky and ray/sphere geometry.
export function softwareExposureRenderer(renderer) {
  const gl = renderer.getContext(),
    debug = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL || gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software rasterizer|basic render driver/i.test(name);
}
export const exposureEarthFastGLSL = `
uniform sampler2D dayMap,nightMap,cloudMap,cloudTemplateMap,oceanMap;
uniform float detailed,enhanced,cloudAmount,cloudNightVisible,cloudMode,cloudChannel,cloudMotion,motionTime,gloss,airOn;
uniform vec3 fixedSun;
${radiometryGLSL}
${cloudToneGLSL}
float shutterCloud(vec3 n){
 float angle=cloudMotion*motionTime*.004*(.5+.5*sin(n.z*4.));
 float c=cos(angle),s=sin(angle);vec2 uv=spherical(vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z));
 if(cloudMode>.5)return texture2D(cloudTemplateMap,uv).r;
 vec4 cloud=texture2D(cloudMap,uv);
 if(cloudChannel>1.5)return clamp(texture2D(cloudTemplateMap,uv).r*(1.-cloud.a)+cloud.r,0.,1.);
 return cloudOpacity(mix(cloud.r,cloud.a,cloudChannel));
}
vec4 shutterEarth(vec3 ray,float distance){
 if(distance>=0.){
  vec3 n=normalize(eye+distance*ray);vec2 uv=spherical(n);
  float mu=dot(n,fixedSun),day=max(mu,0.);
  vec3 base=texture2D(dayMap,uv).rgb;
  float ocean=smoothstep(.2,.8,texture2D(oceanMap,uv).r);
  if(enhanced>.5){float water=ocean*(1.-smoothstep(.015,.06,max(base.r,max(base.g,base.b))));base=mix(base,max(base,vec3(.008,.038,.12)),water);}
  vec3 light=base*(.002+lambertDirect*day);
  if(detailed>.5){
   float cloud=cloudAmount>0.?shutterCloud(n)*cloudAmount:0.;
   light*=1.-cloud*mix(.22,.48,enhanced)*smoothstep(-.01,.08,mu);
   float cities=texture2D(nightMap,uv).r*(1.-smoothstep(-.15,.07,mu));
   light+=cities*vec3(1.,.72,.38)*mix(2.3,1.2,enhanced);
   float shine=pow(max(0.,dot(reflect(-fixedSun,n),-ray)),gloss);
   light+=vec3(1.,.91,.73)*ocean*shine*day*.6;
   float visibleCloud=cloud*mix(smoothstep(-.16,0.,mu),1.,cloudNightVisible);
   light=mix(light,vec3(.9,.96,1.)*(.004*smoothstep(-.16,0.,mu)+day*1.4),visibleCloud);
  }
  return vec4(light,1.);
 }
 if(airOn<.5)return vec4(0.);
 float along=-dot(eye,ray);if(along<=0.)return vec4(0.);
 vec3 closest=eye+along*ray;float altitude=length(closest)-6371.;
 if(altitude<0.||altitude>180.)return vec4(0.);
 float depth=.64*exp(-altitude/14.),day=smoothstep(-.18,.12,dot(normalize(closest),fixedSun));
 return vec4(vec3(.26,.47,.82)*depth*day,depth);
}`;
