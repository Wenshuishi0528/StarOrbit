import * as THREE from 'three';
import {auroraNoise} from './aurora-noise.js';
import {solarOpticsGLSL} from './atmosphere-glsl.js';
const quadVertex='varying vec2 uvFrame;void main(){uvFrame=uv;gl_Position=vec4(position.xy,0.,1.);}';
export function auroraPhase(time){return ((time%86400000)+86400000)%86400000/86400000;}
export function auroraBufferSize(width,height,low=false){
 const scale=Math.min(low?.35:.5,960/width,640/height);
 return [Math.max(1,Math.min(960,Math.ceil(width*scale))),Math.max(1,Math.min(640,Math.ceil(height*scale)))];
}
export function auroraProfile(){
 const data=new Uint8Array(256*4);
 for(let i=0;i<256;i++){
  const h=90+i*270/255,fade=Math.min(1,Math.max(0,(h-92)/12))*Math.min(1,Math.max(0,(360-h)/45));
  data[i*4]=Math.round(255*Math.exp(-Math.pow((h-140)/55,2))*fade);
  data[i*4+1]=Math.round(255*.08*Math.exp(-Math.pow((h-275)/70,2))*fade);
  data[i*4+2]=Math.round(255*.12*Math.exp(-Math.pow((h-105)/10,2))*fade);
  data[i*4+3]=255;
 }
 return data;
}
const fluxFragment=`varying vec2 uvFrame;uniform sampler2D noiseMap,auroraMap;uniform float phase,seed,useData;uniform mat3 magneticToEarth;
const float PI=3.14159265359;
vec2 turn(vec2 p,float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c)*p;}
vec2 swirl(vec2 p,vec2 centre,float radius,float angle){vec2 q=p-centre;return centre+turn(q,angle*exp(-dot(q,q)/(radius*radius)));}
void main(){
 float side=uvFrame.x<.5?1.:-1.;vec2 p=vec2(fract(uvFrame.x*2.),uvFrame.y)*2.-1.;float r2=dot(p,p);
 if(r2>=1.){gl_FragColor=vec4(0.);return;}
 float t=phase*2.*PI,k=seed*.001+side;
 vec2 q=turn(p,.07*sin(t*13.+k));
 q=swirl(q,vec2(.32,.23),.13,4.+.5*sin(t*173.+k));
 q=swirl(q,vec2(-.3,.24),.12,-3.7+.4*sin(t*137.-k));
 q=swirl(q,vec2(-.1,-.39),.13,3.5+.4*cos(t*151.+k));
 vec2 drift=vec2(phase*23.,phase*31.);
 vec2 warp=vec2(texture2D(noiseMap,q*3.+drift).r,texture2D(noiseMap,q*3.+drift+vec2(.37,.61)).r)-.5;
 q+=warp*.029;
 float a=atan(q.y,q.x),radius=length(q),n=texture2D(noiseMap,q*1.4+vec2(phase*5.,seed*.001)).r;
 float plume=smoothstep(.22,.78,texture2D(noiseMap,q*5.5+vec2(phase*3.,phase*4.)).r);
 float activity=smoothstep(-.6,.65,sin(a*2.+k+t*3.)*.6+sin(a*5.-k)*.4);
 float centre=.405+.022*sin(a*3.+k+t*7.)+.009*sin(a*9.-t*11.);
 float d=(radius-centre)/(.008+.006*n);
 float secondary=(radius-centre-.047-.012*sin(a*4.+k))/.015;
 float bright=exp(-d*d)*(.15+.85*activity)+exp(-secondary*secondary)*activity*.16*smoothstep(.35,.7,n);
 bright*=.55+.7*plume;
 float diffuse=exp(-pow((radius-centre)/.085,2.))*(.018+.035*n)*(.45+.85*plume);
 if(useData>.5){
  vec3 geographic=magneticToEarth*vec3(p,sqrt(max(0.,1.-r2))*side);
  vec2 uv=vec2(atan(geographic.y,geographic.x)/(2.*PI)+.5,asin(clamp(geographic.z,-1.,1.))/PI+.5);
  float coverage=texture2D(auroraMap,uv).r;
  // The complete NOAA footprint remains present, including weak and low-latitude regions.
  bright=coverage*(.25+.75*mix(smoothstep(.25,.75,n),plume,.7));diffuse=coverage*.08;
 }
 gl_FragColor=vec4(bright,diffuse,bright*smoothstep(.56,.78,n),mix(smoothstep(.25,.75,n),plume,.7));
}`;
const volumeFragment=`varying vec2 uvFrame;uniform sampler2D footprint,profile;
uniform mat3 viewRays;uniform vec3 origin,sunLocal;uniform float sampleCount,strength,useData;
${solarOpticsGLSL}
vec2 roots(vec3 o,vec3 d,float radius){float b=dot(o,d),disc=b*b-dot(o,o)+radius*radius;if(disc<0.)return vec2(1.e9,-1.e9);float v=sqrt(disc);return vec2(-b-v,-b+v);}
vec3 transmission(vec3 p,vec3 d){
 float distance=length(p-origin);vec3 toward=-d;float b=dot(p,toward),disc=b*b-dot(p,p)+6471.*6471.;
 if(disc<=0.)return vec3(1.);float enter=max(0.,-b-sqrt(disc));if(enter>=distance)return vec3(1.);
 vec3 entry=p+toward*enter;vec3 depth=lightDepth(clamp(length(entry)-6371.,0.,100.),dot(normalize(entry),toward));
 if(length(origin)<6471.)depth-=lightDepth(clamp(length(origin)-6371.,0.,100.),dot(normalize(origin),toward));
 return spectralTransmission(max(vec3(0.),depth));
}
void main(){
 vec3 ray=normalize(viewRays*vec3(uvFrame*2.-1.,1.));vec2 outer=roots(origin,ray,6731.),inner=roots(origin,ray,6461.),earth=roots(origin,ray,6371.);
 float start=max(0.,outer.x),end=outer.y;if(earth.x>0.)end=min(end,earth.x);if(end<=start||length(origin)<6371.){gl_FragColor=vec4(0.);return;}
 // Skip the empty lower shell while retaining both visible limb segments.
 float firstEnd=min(end,max(start,inner.x)),secondStart=max(start,min(end,inner.y));
 bool crosses=inner.y>start&&inner.x<end;
 float lengthA=crosses?firstEnd-start:end-start,lengthB=crosses?end-secondStart:0.;
 float total=lengthA+lengthB;if(total<=.001){gl_FragColor=vec4(0.);return;}
 vec3 sum=vec3(0.);
 for(int segment=0;segment<2;segment++){
  float span=segment==0?lengthA:lengthB,base=segment==0?start:secondStart;
  if(span<=.001)continue;
  float stepLength=span/sampleCount;vec3 light=vec3(0.),representative=vec3(0.);float weight=0.;
  for(int i=0;i<32;i++){
   if(float(i)>=sampleCount)break;
   vec3 p=origin+ray*(base+(float(i)+.5)*stepLength);float radius=length(p),h=radius-6371.;vec3 normal=p/radius;
   if(useData<.5&&abs(normal.z)<.7)continue;
   vec2 foot=normal.xy*sqrt(6501./radius);
   float spread=smoothstep(125.,330.,h);
   foot+=spread*.018*vec2(sin(foot.y*14.+foot.x*9.),cos(foot.x*12.-foot.y*7.));
   vec2 uv=vec2((foot.x*.5+.5+(normal.z<0.?1.:0.))*.5,foot.y*.5+.5);
   // Match the footprint filter to sample spacing; keep both mip levels inside one hemisphere.
   float lod=clamp(log2(max(1.,stepLength/24.))+spread*.65,0.,3.),margin=.5*exp2(ceil(lod))/1024.;
   uv.x=clamp(uv.x,(normal.z<0.?.5:0.)+margin,(normal.z<0.?1.:.5)-margin);
   vec4 flux=textureLod(footprint,uv,lod);
   if(flux.r+flux.g<.002)continue;
   vec3 vertical=texture2D(profile,vec2(clamp((h-90.-(flux.a-.5)*15.)/(190.+140.*flux.a),0.,1.),.5)).rgb;
   float visibility=mix(.008,1.,1.-smoothstep(-.22,.16,dot(normal,sunLocal)));
   vec3 emission=vec3(.12,.9,.3)*vertical.r*(flux.r+flux.g)+vec3(.8,.035,.12)*vertical.g*flux.r+vec3(.7,.07,.46)*vertical.b*flux.b;
   light+=emission*visibility*(1.-smoothstep(320.,360.,h))*stepLength/500.;if(weight==0.)representative=p;weight+=flux.r+flux.g;
  }
  if(weight>0.)sum+=light*transmission(representative,ray);
 }
 gl_FragColor=vec4(sum*strength,1.);
}`;
const compositeFragment=`varying vec2 uvFrame;uniform sampler2D frame;
void main(){gl_FragColor=vec4(texture2D(frame,uvFrame).rgb,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export class AuroraVolume{
 constructor(env){
  this.env=env;this.legacy=[...env.aurora.children];this.failed=false;this.source=null;this.stats={fluxUpdates:0,volumeRenders:0,steps:24,width:0,height:0};
  this.size=new THREE.Vector2();this.camera=new THREE.Camera();this.rotation=new THREE.Matrix3();this.inverse=new THREE.Matrix3();this.rays=new THREE.Matrix3();this.cameraRotation=new THREE.Matrix3();this.earthRotation=new THREE.Matrix4();
  const pole=new THREE.Vector3(.048,-.154,.987).normalize(),x=new THREE.Vector3(pole.z,0,-pole.x).normalize(),y=new THREE.Vector3().crossVectors(pole,x);
  this.magneticToEarth=new THREE.Matrix3().set(x.x,y.x,pole.x,x.y,y.y,pole.y,x.z,y.z,pole.z);this.toMagnetic=this.magneticToEarth.clone().transpose();
 }
 release(){
  for(const key of ['fluxTarget','target','noise','profile','geometry','fluxMaterial','volumeMaterial','compositeMaterial']){this[key]?.dispose();this[key]=null;}
  this.fluxScene=this.volumeScene=this.compositeScene=null;this.source=null;this.frameInputs=null;this.stats.width=this.stats.height=0;
 }
 create(){
  const e=this.env,r=e.api.renderer;
  if(!r.extensions.has('EXT_color_buffer_float'))throw Error('Floating-point aurora buffer unavailable');
  const noise=auroraNoise();this.noise=new THREE.DataTexture(noise.data,noise.width,noise.height,THREE.RedFormat);this.noise.wrapS=this.noise.wrapT=THREE.RepeatWrapping;this.noise.magFilter=this.noise.minFilter=THREE.LinearFilter;this.noise.needsUpdate=true;
  this.profile=new THREE.DataTexture(auroraProfile(),256,1);this.profile.magFilter=this.profile.minFilter=THREE.LinearFilter;this.profile.needsUpdate=true;
  this.fluxTarget=new THREE.WebGLRenderTarget(1024,512,{depthBuffer:false,minFilter:THREE.LinearMipmapLinearFilter,generateMipmaps:true});
  this.geometry=new THREE.PlaneGeometry(2,2);
  const make=(name,uniforms,fragment,composite=false)=>new THREE.ShaderMaterial({name,uniforms,vertexShader:quadVertex,fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:composite,transparent:composite,blending:composite?THREE.AdditiveBlending:THREE.NoBlending});
  this.fluxMaterial=make('StarOrbitAuroraFlux',{noiseMap:{value:this.noise},auroraMap:e.auroraUniforms.auroraMap,useData:e.auroraUniforms.useData,seed:e.auroraUniforms.seed,phase:{value:0},magneticToEarth:{value:this.magneticToEarth}},fluxFragment);
  this.volumeMaterial=make('StarOrbitAuroraVolume',{footprint:{value:this.fluxTarget.texture},profile:{value:this.profile},viewRays:{value:this.rays},origin:{value:new THREE.Vector3()},sunLocal:{value:new THREE.Vector3()},sampleCount:{value:32},strength:e.auroraUniforms.strength,useData:e.auroraUniforms.useData,solarDepth:e.uniforms.solarDepth,linearOutput:e.uniforms.linearOutput},volumeFragment);
  this.compositeMaterial=make('StarOrbitAuroraComposite',{frame:{value:null}},compositeFragment,true);
  for(const [scene,material] of [['fluxScene','fluxMaterial'],['volumeScene','volumeMaterial'],['compositeScene','compositeMaterial']]){this[scene]=new THREE.Scene();this[scene].add(new THREE.Mesh(this.geometry,this[material]));}
 }
 update(time,lowEffects){
  const e=this.env,enabled=e.quality==='high'&&e.aurora.visible;
  if(e.quality!=='high')this.failed=false;
  if(!enabled||this.failed){this.release();for(const m of this.legacy)m.visible=e.quality!=='high'||this.failed;return;}
  for(const m of this.legacy)m.visible=false;
  try{if(!this.fluxMaterial)this.create();}catch(error){this.failed=true;this.release();for(const m of this.legacy)m.visible=true;console.warn(error.message);return;}
  this.time=time;this.lowEffects=!!lowEffects;
 }
 render(camera){
  const e=this.env,r=e.api.renderer;if(!this.volumeMaterial||!e.aurora.visible||this.failed)return;
  const previous=r.getRenderTarget(),autoClear=r.autoClear;
  try{
   r.getDrawingBufferSize(this.size);const [w,h]=auroraBufferSize(this.size.x,this.size.y,this.lowEffects);
   const resized=!this.target||this.target.width!==w||this.target.height!==h;
   if(!this.target){this.target=new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,depthBuffer:false});this.compositeMaterial.uniforms.frame.value=this.target.texture;}
   else if(this.target.width!==w||this.target.height!==h)this.target.setSize(w,h);
   const source=e.auroraUniforms.useData.value>.5?e.auroraUniforms.auroraMap.value:'local',phase=auroraPhase(this.time),seed=e.auroraUniforms.seed.value;
   const now=performance.now(),changed=this.time!==this.lastFluxTime;
   const expected=Math.abs(e.sim.mode==='real'?1:e.sim.speed||1)*(now-(this.lastWall??now));
   const seek=this.lastTime!==undefined&&Math.abs(this.time-this.lastTime)>Math.max(2000,expected*3);this.lastWall=now;this.lastTime=this.time;r.autoClear=true;
   if(source!==this.source||seed!==this.lastSeed||(changed&&(e.sim.paused||seek||now-(this.lastFluxWall??-Infinity)>=250))){
    this.fluxMaterial.uniforms.phase.value=phase;r.setRenderTarget(this.fluxTarget);r.render(this.fluxScene,this.camera);this.source=source;this.lastSeed=seed;this.lastFluxTime=this.time;this.lastFluxWall=now;this.stats.fluxUpdates++;
   }
   this.rotation.setFromMatrix4(this.earthRotation.makeRotationFromQuaternion(e.earth.quaternion));this.inverse.copy(this.rotation).transpose().premultiply(this.toMagnetic);
   const u=this.volumeMaterial.uniforms;u.origin.value.copy(camera.position).applyMatrix3(this.inverse);u.sunLocal.value.copy(e.uniforms.sun.value).applyMatrix3(this.inverse).normalize();
   const halfY=Math.tan(camera.fov*Math.PI/360)/camera.zoom,halfX=halfY*camera.aspect,rotation=this.cameraRotation.setFromMatrix4(camera.matrixWorld);
   this.rays.set(halfX,0,0,0,halfY,0,0,0,-1).premultiply(rotation).premultiply(this.inverse);
   u.sampleCount.value=this.lowEffects?16:24;this.stats.steps=u.sampleCount.value;this.stats.width=w;this.stats.height=h;
   const inputs=[...this.rays.elements,...u.origin.value,...u.sunLocal.value,u.sampleCount.value,u.strength.value,this.stats.fluxUpdates,e.uniforms.solarDepth.value,e.uniforms.solarDepth.value?.version];
   const changedFrame=resized||!this.frameInputs||inputs.some((v,i)=>v!==this.frameInputs[i]);
   if(changedFrame){
   r.setRenderTarget(this.target);
   if(resized){const gl=r.getContext();if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Aurora framebuffer unavailable');}
   r.render(this.volumeScene,this.camera);this.stats.volumeRenders++;this.frameInputs=inputs;
   }
   if(r.info.programs.some(p=>p.name?.startsWith('StarOrbitAurora')&&p.diagnostics?.runnable===false))throw Error('Aurora volume shader unavailable');
   r.setRenderTarget(previous);r.autoClear=false;r.render(this.compositeScene,this.camera);
  }catch(error){this.failed=true;this.release();for(const m of this.legacy)m.visible=true;console.warn(error.message);}
  finally{r.setRenderTarget(previous);r.autoClear=autoClear;}
 }
}
