import * as THREE from 'three';
import {createXuntianEarthView} from './xuntian-earth-view.js';
import {xuntianSkySource} from './xuntian-view-sky.js';
import {earthHit} from './xuntian-view-shaders.js';
import {exposureEarthFastGLSL,softwareExposureRenderer} from './exposure-earth-fast.js';
import {galaxyCoordinatesGLSL} from './sky-shaders.js';
import {cloudMoonIrradiance} from './cloud-lighting.js';
import {exposureModes,usesGround,exposureSite,groundCamera,groundSource,groundExposureState} from './exposure-ground.js';
import {VIEW_UNITS_PER_METRE} from './missions.js';
import {cameraAtOpen, exposureState, exposureTimes, localVector, PHOTO_ASPECT, presetCamera, trackingAxes, transformAxes} from './exposure-lab-math.js';
import {captureHull} from './exposure-lab-hull.js';

const BATCH = 6;
const vec = a => new THREE.Vector3(...a);
const toMatrix = axes => new THREE.Matrix3().fromArray(axes.flat());
const paintFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

// Bake only point sources, independently from the display's boosted Milky Way.
// The map uses equatorial lon/lat. Wrap right ascension at the seam and expand
// the kernel toward the poles so star widths stay angular rather than Cartesian.
function makeStarMap(geometry) {
  const width = 4096, height = width/2, pixels = new Uint8Array(width*height*4);
  const position=geometry.getAttribute('position'), mags=geometry.getAttribute('mag'), colors=geometry.getAttribute('color');
  const tintColor=new THREE.Color();
  for (let star=0;star<position.count;star++) {
    const px=position.getX(star),py=position.getY(star),pz=position.getZ(star),mag=mags.getX(star);
    const ra=Math.atan2(py,px),dec=Math.atan2(pz,Math.hypot(px,py));
    const x=(ra/(2*Math.PI)+.5)*width-.5,y=(dec/Math.PI+.5)*height-.5;
    const cosDec=Math.max(.015,Math.cos(dec));
    const sigma = .60+.13*Math.max(0,4-mag), radius = 2.4*sigma;
    const strength = Math.min(1, Math.pow(10,-.143*(mag-1)))*235;
    const tint=tintColor.fromBufferAttribute(colors,star).convertLinearToSRGB().toArray();
    for(let j=Math.max(0,Math.floor(y-radius)); j<=Math.min(height-1,Math.ceil(y+radius)); j++) {
      for(let i=Math.floor(x-radius/cosDec); i<=Math.ceil(x+radius/cosDec); i++) {
        const distance = ((i-x)*cosDec)**2+(j-y)**2;
        if(distance>radius*radius) continue;
        const flux = strength*Math.exp(-distance/(2*sigma*sigma));
        const base = (j*width+((i%width+width)%width))*4;
        for(let c=0; c<3; c++) pixels[base+c]=Math.min(255,pixels[base+c]+Math.round(flux*tint[c]));
      }
    }
  }
  const texture = new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);
  texture.wrapS=THREE.RepeatWrapping;texture.minFilter=texture.magFilter=THREE.LinearFilter;
  texture.needsUpdate=true;
  return texture;
}

const photoVertex = `varying vec2 film;void main(){film=position.xy;gl_Position=vec4(position.xy,0.,1.);}`;
// All masks are evaluated before the maximum-channel (lighten) stack. For an
// inertial camera both the Earth limb and the hull move between samples.
const photoFragment = `precision highp float;
varying vec2 film;
uniform sampler2D starMap,earthPlate;uniform samplerCube galaxy;
#ifdef HULL_PLANAR
uniform sampler2D hullNormal,hullColour;
#else
uniform samplerCube hullNormal,hullColour;
#endif
uniform float lens,photoFill,earthOn,starGain,galaxyMode,galaxyGain;
uniform mat3 inertial,earthFrame,body;
uniform vec3 eye,bodySun;uniform float illumination;
${earthHit}
${galaxyCoordinatesGLSL}
vec3 displayFlux(vec3 light){vec3 mapped=1.-exp(-max(light,vec3(0.)));return mix(12.92*mapped,1.055*pow(mapped,vec3(1./2.4))-.055,step(vec3(.0031308),mapped));}
vec2 spherical(vec3 d){return vec2(atan(d.y,d.x)/6.28318530718+.5,asin(clamp(d.z,-1.,1.))/3.14159265359+.5);}
#ifdef EARTH_GLOBAL
${exposureEarthFastGLSL}
#endif
vec3 expose(vec3 cameraRay){
  vec3 hullRay=body*cameraRay;
  #ifdef HULL_PLANAR
  vec4 surface=texture2D(hullNormal,.5*film+.5);
  #else
  vec4 surface=textureCube(hullNormal,hullRay);
  #endif
  if(surface.a>.28){
    #ifdef HULL_PLANAR
    vec4 material=texture2D(hullColour,.5*film+.5);
    #else
    vec4 material=textureCube(hullColour,hullRay);
    #endif
    vec3 n=normalize(surface.rgb*2.-1.),view=normalize(-hullRay),light=bodySun;
    float rough=clamp((surface.a-.55)/.45,.18,1.),metal=material.a;
    float lambert=max(0.,dot(n,light)),sunlight=illumination;
    vec3 halfVector=normalize(light+view+.00001);
    float gloss=pow(max(0.,dot(n,halfVector)),mix(115.,6.,rough*rough));
    vec3 base=material.rgb,specular=mix(vec3(.045),base,metal),sunColour=vec3(1.,.94,.84);
    vec3 flux=base*(.006+sunColour*lambert*sunlight*1.18)+sunColour*specular*gloss*lambert*sunlight;
    // A switchable camera fill keeps real blanket, cell and metal colours legible in eclipse.
    vec3 bounce=normalize(.75*view+vec3(.24,-.38,.64));
    float nl=max(0.,dot(n,bounce)),fill=.11+.59*nl;
    float fillGloss=pow(max(0.,dot(n,normalize(bounce+view))),mix(96.,9.,rough*rough));
    float edge=pow(1.-clamp(abs(dot(n,view)),0.,1.),3.);
    flux+=photoFill*(base*vec3(.81,.90,1.)*fill+specular*(.04+.11*edge+.48*nl*fillGloss));
    vec3 mapped=1.-exp(-max(flux,vec3(0.))*1.22);
    return mix(12.92*mapped,1.055*pow(mapped,vec3(1./2.4))-.055,step(vec3(.0031308),mapped));
  }

  vec3 r=earthFrame*cameraRay;
  // Clip the stars and the galactic panorama at each shutter sample, before
  // combining the foreground, Earth's surface and its partial atmosphere coverage.
  float distance=groundDistance(eye,r);vec3 sky=vec3(0.);
  if(distance<0.){
   vec3 direction=normalize(inertial*cameraRay),g=galacticDirection(direction);
   vec3 gal=galaxyMode>1.5?textureCube(galaxy,g).rgb:galaxyMode>.5?ordinaryGalaxy(g):vec3(0.);
   sky=-log(max(vec3(.0001),1.-clamp(gal,0.,.9999)))*galaxyGain;
   sky+=pow(texture2D(starMap,spherical(direction)).rgb,vec3(.77))*starGain;
  }
  #ifdef EARTH_GLOBAL
  vec4 earth=shutterEarth(r,distance);
  #else
  vec4 earth=earthOn>.5?texture2D(earthPlate,film*.5+.5):vec4(0.);
  #endif
  return displayFlux(sky*(1.-clamp(earth.a,0.,1.))+earth.rgb);
}
void main(){vec3 ray=normalize(vec3(film.x*lens*${PHOTO_ASPECT.toFixed(10)},film.y*lens,1.));
gl_FragColor=vec4(min(expose(ray),vec3(1.)),1.);}`;

function bodyAxes(state,pose){
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...['roll','pitch','yaw'].map(axis=>(pose?.[axis]||0)*Math.PI/180),'ZYX'));
  return [[1,0,0],[0,1,0],[0,0,1]].map(axis=>transformAxes(state.basis,vec(axis).applyQuaternion(rotation).toArray()));
}

function makeFilm(hull,starTexture,env,sky,settings,fill,global){
 const uniforms={hullNormal:{value:hull.normals},hullColour:{value:hull.surface},lens:{value:Math.tan(settings.fov*Math.PI/360)},photoFill:{value:fill?1:0},
  starMap:{value:starTexture},starGain:{value:sky.showStars?sky.gain:0},galaxy:{value:sky.status==='panorama'?env.galaxyTexture:null},
  galaxyMode:{value:sky.status==='panorama'?2:['catalog','off'].includes(sky.status)?0:1},galaxyGain:{value:sky.gain},
  earthPlate:{value:null},earthOn:{value:0},inertial:{value:new THREE.Matrix3()},earthFrame:{value:new THREE.Matrix3()},
  body:{value:new THREE.Matrix3()},eye:{value:new THREE.Vector3()},bodySun:{value:new THREE.Vector3()},illumination:{value:0}};
 const defines={};
 if(hull.planar)defines.HULL_PLANAR=1;
 if(global){
  defines.EARTH_GLOBAL=1;
  for(const key of ['dayMap','nightMap','oceanMap','cloudMap','cloudTemplateMap','cloudMode','cloudChannel','cloudTone','cloudAmount','cloudMotion','motionTime','cloudNightVisible','detailed','enhanced','gloss'])uniforms[key]=env.uniforms[key];
  uniforms.fixedSun={value:new THREE.Vector3()};uniforms.airOn={value:env.atmosphere.visible?1:0};
 }
 const material=new THREE.ShaderMaterial({uniforms,defines,vertexShader:photoVertex,fragmentShader:photoFragment,depthTest:false,depthWrite:false,toneMapped:false,transparent:true,
  blending:THREE.CustomBlending,blendEquation:THREE.MaxEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor});
 const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;const scene=new THREE.Scene();scene.add(quad);
 return {scene,uniforms,material,dispose(){quad.geometry.dispose();material.dispose();}};
}

function geometryAt(state,pose,localEye){
 const body=bodyAxes(state,pose),eyeKm=transformAxes(body,localEye).map((v,i)=>state.position[i]+v/(VIEW_UNITS_PER_METRE*1000));
 return {body,eyeKm};
}
function writeSample(u,state,geometry,camera){
 u.inertial.value.copy(toMatrix(camera));u.earthFrame.value.copy(toMatrix(camera.map(a=>localVector(state.earthAxes,a))));
 u.body.value.copy(toMatrix(camera.map(a=>localVector(geometry.body,a))));u.eye.value.fromArray(localVector(state.earthAxes,geometry.eyeKm));
 u.bodySun.value.fromArray(localVector(geometry.body,state.sunDir));u.illumination.value=state.illumination;
 if(u.fixedSun)u.fixedSun.value.fromArray(localVector(state.earthAxes,state.sunDir));
}

// Each synchronous batch restores renderer state before yielding. Closing the lab
// can immediately resume the main scene or open another panel on the same GPU.
function offscreen(renderer,work){
  const previous={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),
    auto:renderer.autoClear,shadows:renderer.shadowMap.enabled};
  try{return work();}finally{
    renderer.setRenderTarget(previous.target,previous.face,previous.mip);renderer.setClearColor(previous.clear,previous.alpha);
    renderer.autoClear=previous.auto;renderer.shadowMap.enabled=previous.shadows;
  }
}

async function readCanvas(renderer,target,width,height,check,software){
 const pixels=new Uint8Array(width*height*4);
 if(!software&&renderer.readRenderTargetPixelsAsync)await renderer.readRenderTargetPixelsAsync(target,0,0,width,height,pixels);
 else renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
 check();if(!pixels[3])throw Error('无法生成曝光画面');
 const photo=document.createElement('canvas');photo.width=width;photo.height=height;
 const ctx=photo.getContext('2d'),image=ctx.createImageData(width,height),stride=width*4;
 for(let row=0;row<height;row++)image.data.set(pixels.subarray((height-1-row)*stride,(height-row)*stride),row*stride);
 ctx.putImageData(image,0,0);return photo;
}
async function yieldGPU(renderer,check,software,drain){
 const gl=renderer.getContext();
 // Some CPU drivers never signal GLSync from an offscreen render without a
 // presentation. Keep their command groups small and use a direct final read.
 if(software){gl.flush();await paintFrame();check();drain?.();return;}
 const fence=gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
 try{
  gl.flush();await paintFrame();check();
  while(fence&&gl.clientWaitSync(fence,0,0)===gl.TIMEOUT_EXPIRED){await paintFrame();check();}
 }finally{if(fence)gl.deleteSync(fence);}
}

export function createExposureCamera(sim){
 let starTexture;
 const software=softwareExposureRenderer(sim.api.renderer);
 async function renderSet({data,start,seconds,mode,width,cameraSettings=presetCamera(),fill=true,single=false,observer,check=()=>{},progress=()=>{}}){
  const modes=exposureModes[mode];if(!modes)throw Error('无效的曝光跟踪方式');
  const ground=usesGround(mode),site=ground?exposureSite(observer):null,source=ground?groundSource(data):null;
  const stateAt=t=>ground?groundExposureState(data,source,t):exposureState(data,t);
  const first=stateAt(start);if(!first)throw Error('该时刻没有可用的天宫轨道');
  const times=single?[start]:exposureTimes(start,seconds),renderer=sim.api.renderer,env=sim.environment,height=Math.round(width/PHOTO_ASPECT);
  const pose={...(sim.missionId==='tiangong'?sim.missions.state:sim.missions.states.tiangong)?.pose};
  const initialBody=bodyAxes(first,pose),base=cameraAtOpen({basis:initialBody},cameraSettings),drawModes=single?[modes[0]]:modes;
  const size={w:width,h:height,aspect:PHOTO_ASPECT},screenCamera=new THREE.Camera(),quad=new THREE.PlaneGeometry(2,2);
  // Still framing stays immediate. A photograph allows the main scene's chosen
  // panorama to finish, but a stalled asset must not hold the shutter open.
  if(!single&&env.skyLoading){
   const deadline=performance.now()+10000;
   while(env.skyLoading&&performance.now()<deadline){
    check();await new Promise(resolve=>setTimeout(resolve,100));
   }
  }
  const sky=xuntianSkySource(env),targets=[];
  const localEnv=Object.create(env);localEnv.uniforms={...env.uniforms,cloudMoonPosition:{value:new THREE.Vector3()},cloudMoonLight:{value:0},
    weatherTime:{value:env.uniforms.weatherTime.value},motionTime:{value:env.uniforms.motionTime.value}};
  const earthView=createXuntianEarthView(localEnv,quad),plates={scene:{texture:{type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType}}};
  let hull,film;
  try{
   await paintFrame();check();starTexture??=makeStarMap(env.stars.geometry);
   offscreen(renderer,()=>{
    renderer.setClearColor(0,0);renderer.autoClear=true;renderer.shadowMap.enabled=false;
    hull=captureHull(sim,{initialBody,initialCamera:base,settings:cameraSettings,width,height,smallCube:software,planar:single||mode==='body',
     openAtPosition:ground?pos=>groundCamera(first,geometryAt(first,pose,pos).eyeKm,site,cameraSettings):null});
    for(const m of drawModes){
     const target=new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false});
     targets.push(target);renderer.setRenderTarget(target);renderer.clear(true,false,false);
    }
   });
   const opening=hull.initialCamera;
   film=makeFilm(hull,starTexture,localEnv,sky,cameraSettings,fill,software);
   const frameFor=(q,g,camera)=>({q,eyeKm:g.eyeKm,axes:{right:camera[0],up:camera[1],forward:camera[2]},fovY:cameraSettings.fov});
   const firstFrame=frameFor(first,geometryAt(first,pose,hull.position),opening);
   if(!software&&width>=1920){await earthView.preparePhoto(firstFrame,size);check();}
   let work=0,batches=0;
   const pacingPixel=new Uint8Array(4);
   for(const [i,time] of times.entries()){
    check();const state=i?stateAt(time):first;if(!state)throw Error('该时刻没有可用的天宫轨道');
    const geometry=geometryAt(state,pose,hull.position);
    if(env.settings.cloudNightVisible&&env.moon?.ephemeris){
     const moon=env.moon.ephemeris.at(time).position;localEnv.uniforms.cloudMoonPosition.value.fromArray(moon);
     localEnv.uniforms.cloudMoonLight.value=cloudMoonIrradiance(moon,state.sun);
    }
    const hours=(time-Date.UTC(2026,0,1))/3600000,record=env.weather?.cloudRecord;
    localEnv.uniforms.weatherTime.value=hours;
    localEnv.uniforms.motionTime.value=record?Math.max(-6,Math.min(6,(time-(record.time??record.downloaded))/3600000)):6*Math.sin(hours*.04);
    offscreen(renderer,()=>{
     renderer.autoClear=false;renderer.shadowMap.enabled=false;renderer.setClearColor(0,0);
     for(const [j,m] of drawModes.entries()){
      const camera=i===0?opening:m==='ground'?groundCamera(state,geometry.eyeKm,site,cameraSettings):trackingAxes({basis:geometry.body},initialBody,opening,m);
      const earth=software?null:earthView.render(renderer,frameFor(state,geometry,camera),size,plates);
      writeSample(film.uniforms,state,geometry,camera);film.uniforms.earthPlate.value=earth;film.uniforms.earthOn.value=earth?1:0;
      renderer.setRenderTarget(targets[j]);renderer.render(film.scene,screenCamera);
      if(!i&&renderer.properties.get(film.material).currentProgram?.diagnostics?.runnable===false)throw Error('无法生成曝光画面');
      work+=earth?3:1;
     }
    });
    if(work>=BATCH||i===times.length-1){
     progress((i+1)/times.length);
     // A long CPU-rendered export must not enqueue the whole shutter then
     // stall at readback. Occasionally finish a small group before proceeding.
     const drain=software&&(times.length>51||width>=1920)&&++batches%3===0
      ?()=>renderer.readRenderTargetPixels(targets.at(-1),0,0,1,1,pacingPixel):null;
     await yieldGPU(renderer,check,software,drain);work=0;
    }
   }
   const images=[];
   for(const target of targets)images.push(await readCanvas(renderer,target,width,height,check,software));
   return {images,modes:drawModes,source:{earth:earthView.source(),sky,globalEarth:software},samples:times.length};
  }finally{for(const target of targets)target.dispose();plates.earth?.dispose();earthView.dispose();quad.dispose();hull?.dispose();film?.dispose();}
 }
 return {renderSet,software,async render(params){return (await renderSet(params)).images[0];},release(){starTexture?.dispose();starTexture=null;}};
}
