import {galaxyCoordinatesGLSL} from './sky-shaders.js';

// Both the ground image and the star mask intersect the same sphere per sensor
// pixel. A star sprite straddling the limb is clipped to its visible fraction.
export const earthHit=`float groundDistance(vec3 p,vec3 ray){float along=-dot(p,ray);if(along<=0.)return -1.;
 vec3 perpendicular=p+along*ray;float d=6371.*6371.-dot(perpendicular,perpendicular);return d>=0.?along-sqrt(d):-1.;}`;
export const quadVertex=`varying vec2 film;void main(){film=position.xy;gl_Position=vec4(position.xy,0.,1.);}`;
export const backgroundFragment=`precision highp float;varying vec2 film;
 uniform mat3 cameraToInertial,cameraToFixed;uniform vec3 fixedEye;uniform vec2 lens;
 uniform samplerCube galaxy;
 uniform float galaxyMode,skyGain,mainSkyHDR,opticalGain;
 #include <tonemapping_pars_fragment>
 ${earthHit}
 ${galaxyCoordinatesGLSL}
 vec3 scopeSky(vec3 g,vec3 dx,vec3 dy){
  if(galaxyMode<.5||skyGain<=0.)return vec3(0.);
  vec3 displayLinear;
  if(galaxyMode>1.5){
   // Use the same mipmapped cube and sky footprint as the main panorama.
   // A native bright knot remains part of the diffuse image at every zoom.
   displayLinear=textureGrad(galaxy,g,dx,dy).rgb;
  }else displayLinear=ordinaryGalaxy(g);
  // High-quality main skies add two reference units of celestial radiance
  // before Three's ACES output. Apply the actual pupil/exposure before that
  // shoulder, then express the result in this sensor's radiance space. The
  // station, Earth and optical point spread keep their own exposure response.
  if(mainSkyHDR>.5){
   vec3 mapped=ACESFilmicToneMapping(displayLinear*(2.*skyGain*opticalGain));
   return -log(max(vec3(.0001),1.-mapped))/max(opticalGain,.00001);
  }
  return -log(max(vec3(.0001),1.-min(displayLinear,vec3(.9999))))*skyGain;
 }
 void main(){vec3 cameraRay=normalize(vec3(film*lens,1.));vec3 ray=cameraToFixed*cameraRay;
  vec3 galactic=galacticDirection(cameraToInertial*cameraRay),gx=dFdx(galactic),gy=dFdy(galactic);
  float t=groundDistance(fixedEye,ray);vec3 colour=vec3(0.);
  if(t<0.){
    colour=scopeSky(galactic,gx,gy);
  }
  // Alpha records only the station foreground. The terrestrial radiance plate
  // is combined after the stellar aperture gain, at its own exposure.
  gl_FragColor=vec4(colour,0.);
 }`;
export const starVertex=`precision highp float;attribute float magnitude,edgeWeight;attribute vec3 tint;varying vec3 starTint;varying float flux,core,wing;varying vec2 centrePixel;
 uniform mat3 inertialToCamera;uniform vec2 screen,lens,pointSigma;uniform float starSignal,limitMagnitude,maxPointSize;
 void main(){vec3 d=inertialToCamera*position;float z=d.z;
  float visibleMagnitude=magnitude-2.5*log(max(edgeWeight,1.e-8))/log(10.);
  if(z<=0.||visibleMagnitude>limitMagnitude+.4){gl_Position=vec4(3.,3.,1.,1.);gl_PointSize=1.;flux=0.;starTint=tint;core=wing=1.;centrePixel=vec2(0.);return;}
  gl_Position=vec4(d.xy/lens,0.,z);core=pointSigma.x;wing=pointSigma.y;
  flux=pow(10.,-.4*(magnitude-8.))*starSignal*edgeWeight*(1.-smoothstep(limitMagnitude-.2,limitMagnitude+.4,visibleMagnitude));starTint=tint;
  centrePixel=(gl_Position.xy/gl_Position.w*.5+.5)*screen;
  gl_PointSize=clamp(ceil(2.*wing*clamp(3.8+.28*(8.-magnitude),3.8,7.)+3.),3.,maxPointSize);
 }`;
export const starFragment=`precision highp float;varying vec3 starTint;varying float flux,core,wing;varying vec2 centrePixel;
 uniform vec2 screen,lens;uniform mat3 cameraToFixed;uniform vec3 fixedEye;
 ${earthHit}
 // Integral of a Gaussian across pixel edges. Using the projected subpixel
 // centre keeps an unresolved star compact and conserves its energy while panning.
 float erfApprox(float x){
  float a=abs(x),t=1./(1.+.3275911*a);
  float p=(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t;
  return sign(x)*(1.-p*exp(-a*a));
 }
 float pixelMass(float d,float s){float t=.7071067812/s;return .5*(erfApprox((d+.5)*t)-erfApprox((d-.5)*t));}
 vec2 spotMass(vec2 d,float s){return vec2(pixelMass(d.x,s),pixelMass(d.y,s));}
 void main(){vec2 pixel=2.*gl_FragCoord.xy/screen-1.;vec3 ray=cameraToFixed*normalize(vec3(pixel*lens,1.));
  if(groundDistance(fixedEye,ray)>=0.)discard;
  vec2 d=gl_FragCoord.xy-centrePixel,c=spotMass(d,core),w=spotMass(d,wing);
  float psf=.94*c.x*c.y+.06*w.x*w.y;
  gl_FragColor=vec4(starTint*(flux*psf),1.);
 }`;
export const sensorFragment=`precision highp float;varying vec2 film;uniform sampler2D image,earthImage;uniform float gain,earthOn,earthExposure;
 void main(){vec2 uv=film*.5+.5;vec4 foreground=texture2D(image,uv);
  vec3 light=max(foreground.rgb*gain,vec3(0.));
  if(earthOn>.5){vec4 surface=texture2D(earthImage,uv);float gap=1.-clamp(foreground.a,0.,1.);
   light=light*(1.-surface.a*gap)+surface.rgb*earthExposure*gap;}
  vec3 mapped=1.-exp(-light);vec3 rgb=mix(12.92*mapped,1.055*pow(mapped,vec3(1./2.4))-.055,step(vec3(.0031308),mapped));
  gl_FragColor=vec4(rgb,1.);
 }`;

export const guideVertex=`uniform mat3 inertialToCamera;uniform vec2 lens;
 void main(){vec3 d=inertialToCamera*position;gl_Position=vec4(d.xy/lens,0.,d.z);}`;
export const guideFragment=`precision highp float;uniform vec2 screen,lens;uniform mat3 cameraToFixed;uniform vec3 fixedEye;uniform float inverseGain;
 ${earthHit}
 void main(){vec2 pixel=2.*gl_FragCoord.xy/screen-1.;vec3 ray=cameraToFixed*normalize(vec3(pixel*lens,1.));
  if(groundDistance(fixedEye,ray)>=0.)discard;gl_FragColor=vec4(vec3(.024,.068,.094)*inverseGain,1.);}`;
