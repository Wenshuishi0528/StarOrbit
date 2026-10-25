import * as THREE from 'three';
import {PHENOMENA_DEFAULTS,phenomenaSettings,randomAt,direction,stormPrior,flashEnvelope,eventClock,earthOccluded} from './phenomena-math.js';
import {seedNumber} from './weather-math.js';
import {cloudCoverage,maskSample} from './phenomena-cloud.js';
import {solarOpticsGLSL} from './atmosphere-glsl.js';
import {scatteringGLSL} from './atmosphere-scattering.js';
const KEY='tiangong-phenomena-v1', $=id=>document.getElementById(id);
const controls={mode:'phenomenaMode',lightning:'showLightning',upper:'showUpperFlash',airglow:'showAirglow',meteors:'showMeteors'};
export const flashUniforms=()=>({stormCount:{value:0},stormCenters:{value:Array.from({length:4},()=>new THREE.Vector4())},stormPowers:{value:new THREE.Vector4()}});
export const lightningGLSL=`uniform int stormCount;uniform vec4 stormCenters[4];uniform vec4 stormPowers;
vec3 cloudLightning(vec3 n){vec3 emission=vec3(0.);if(stormCount==0)return emission;n=normalize(n);
 for(int i=0;i<4;i++){if(i>=stormCount)break;vec3 delta=n-stormCenters[i].xyz;float r2=dot(delta,delta)*stormCenters[i].w;if(r2<12.)emission+=vec3(.68,.8,1.)*exp(-r2*2.)*stormPowers[i];}return emission;}`;
export const transientVertex=`varying vec2 vUv;varying vec3 pWorld;void main(){vUv=uv;pWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(pWorld,1.);}`;
export const transientFragment=`${solarOpticsGLSL}${scatteringGLSL}uniform float power,kind;varying vec2 vUv;varying vec3 pWorld;
void main(){vec3 d=pWorld-cameraPosition;float len=length(d);d/=len;float b=dot(cameraPosition,d),h=b*b-dot(cameraPosition,cameraPosition)+6371.*6371.;if(h>0.&&-b-sqrt(h)>0.&&-b-sqrt(h)<len)discard;
 vec2 p=vUv;float mask;vec3 color;
 if(kind<.5){float fringe=sin(p.x*132.+sin(p.y*28.)*1.3);float waist=mix(.36,.1,smoothstep(.1,.8,p.y));mask=exp(-pow((p.x-.5)/waist,2.)*3.)*pow(.5+.5*fringe,7.)*sin(p.y*3.14159);color=mix(vec3(.22,.14,.8),vec3(1.,.04,.025),smoothstep(.15,.5,p.y));}
 else if(kind<1.5){float width=.018+.22*p.y;mask=exp(-pow((p.x-.5)/width,2.)*2.)*pow(sin(p.y*3.14159),.7);color=vec3(.12,.3,1.);}
 else{mask=exp(-pow((p.y-.5)*12.,2.))*pow(p.x,2.)*smoothstep(0.,.08,1.-p.x);color=mix(vec3(.36,.65,1.),vec3(1.,.91,.7),pow(p.x,8.));}
 if(mask<.002)discard;gl_FragColor=vec4(color*power*mask*viewTransmission(pWorld,-d),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export class Phenomena{
 constructor(env){
  this.env=env;this.sim=env.sim;this.settings={...PHENOMENA_DEFAULTS};
  try{this.settings=phenomenaSettings(JSON.parse(localStorage.getItem(KEY)));}catch{}
  this.group=new THREE.Group();this.sim.sky.add(this.group);this.events=[];this.storms=[];this.lastSlot=null;
  this.pool=Array.from({length:4},()=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({uniforms:{...env.uniforms,power:{value:0},kind:{value:0}},vertexShader:transientVertex,fragmentShader:transientFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));m.visible=false;m.renderOrder=3.2;this.group.add(m);return m;});
  this.up=new THREE.Vector3();this.right=new THREE.Vector3();this.normal=new THREE.Vector3();this.eye=new THREE.Vector3();this.matrix=new THREE.Matrix4();this.inv=new THREE.Quaternion();
  this.sync();for(const [key,id]of Object.entries(controls))$(id).addEventListener('change',()=>{this.settings[key]=key==='mode'?$(id).value:$(id).checked;this.reset();this.save();});
 }
 sync(){for(const [key,id]of Object.entries(controls))if(key==='mode')$(id).value=this.settings[key];else $(id).checked=this.settings[key];}
 save(){try{localStorage.setItem(KEY,JSON.stringify(this.settings));}catch{}}
 restore(value){this.settings=phenomenaSettings(value);this.sync();this.reset();this.save();}
 reset(){this.clock=null;this.lastSlot=null;this.events.length=0;this.env.uniforms.stormCount.value=0;for(const m of this.pool)m.visible=false;}
 // Only re-read a tiny mask when its texture changes, never read GPU pixels per frame.
 readMask(){
  this.masks??={};this.maskTextures??={};const u=this.env.uniforms;
  for(const [name,key]of Object.entries({cloud:'cloudMap',template:'cloudTemplateMap',ocean:'oceanMap'})){
   const tex=u[key].value;if(tex===this.maskTextures[name])continue;this.maskTextures[name]=tex;this.masks[name]=null;
   try{const image=tex.image;if(!image)continue;if(image.data&&image.width<=512&&image.height<=256){const data=new Uint8Array(image.width*image.height*4);for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){const src=((tex.flipY?y:image.height-1-y)*image.width+x)*4;data.set(image.data.subarray(src,src+4),(y*image.width+x)*4);}this.masks[name]={data,width:image.width,height:image.height};continue;}if(image.width<1)continue;const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0,512,256);this.masks[name]=c.getImageData(0,0,512,256);}catch{}
  }
  this.cloudState??={};for(const k of ['cloudMode','cloudMotion','motionTime','cloudChannel','cloudTone','cloudSeason','weatherTime','seed'])this.cloudState[k]=u[k].value;
  this.sample??=((name,n,ch)=>maskSample(this.masks[name],n,ch));
 }
 coverage(n){return cloudCoverage(n,this.cloudState,this.sample);}
 buildStorms(seed,epoch){this.storms.length=0;
  for(let i=0;i<256;i++){const k=i*7+epoch*179,lon=randomAt(seed,k)*360-180,lat=Math.asin(randomAt(seed,k+1)*1.72-.86)*180/Math.PI;
   if(randomAt(seed,k+2)>stormPrior(lon,lat,this.env.uniforms.cloudSeason.value))continue;
   this.storms.push({n:direction(lon,lat),id:k});}
 }
 schedule(phase,seed,camera,enhanced){const slot=Math.floor(phase/2);if(slot===this.lastSlot)return;this.lastSlot=slot;
  const epoch=Math.floor(this.sim.time/600000),key=seed+':'+epoch;
  if(this.stormKey!==key){this.stormKey=key;this.buildStorms(seed,epoch);}
  const inv=this.inv.copy(this.env.earth.quaternion).invert();this.eye.copy(camera.position).applyQuaternion(inv);const eyeLocal=this.eye.toArray();
  const clouds=this.env.uniforms.cloudAmount.value>.01&&this.env.quality!=='simple';
  if(clouds&&(this.settings.lightning||this.settings.upper)){
   for(const storm of this.storms){if(this.events.length>=(this.settings.meteors?3:4))break;const h=storm.id+slot*997;
    if(randomAt(seed,h)>(enhanced?.36:.09)||this.coverage(storm.n)<.30)continue;
    const p=storm.n.map(v=>v*6381);if(earthOccluded(p,eyeLocal))continue;
    const upper=randomAt(seed,h+7)<(enhanced?.22:.015)?(randomAt(seed,h+8)<.6?0:1):-1;
    if(!this.settings.lightning&&upper<0)continue;
    this.events.push({n:storm.n,start:phase+randomAt(seed,h+9)*1.3,kind:'storm',upper,radius:18+randomAt(seed,h+5)*22});
   }
  }
  if(this.settings.meteors&&this.events.length<4&&randomAt(seed,slot*431)>(enhanced?.80:.985)){
   const n=direction(randomAt(seed,slot*431+1)*360-180,Math.asin(randomAt(seed,slot*431+2)*2-1)*180/Math.PI);
   if(!earthOccluded(n.map(v=>v*6471),eyeLocal))this.events.push({n,start:phase+.2,kind:'meteor',angle:randomAt(seed,slot*431+3)*Math.PI*2});
  }
 }
 update(q,camera,wall=performance.now()){
  const s=this.settings,u=this.env.uniforms,enhanced=s.mode==='enhanced';
  u.airglowStrength.value=s.airglow?(enhanced?2.2:1):0;u.stormCount.value=0;for(const mesh of this.pool)mesh.visible=false;
  if(!q||(!s.lightning&&!s.upper&&!s.meteors)){this.clock=null;this.events.length=0;return;}
  this.group.quaternion.copy(this.env.earth.quaternion);
  const clock=eventClock(this.clock,q.t,wall,this.sim.mode==='real'?1:this.sim.speed);this.clock=clock;
  if(clock.reset){this.events.length=0;this.lastSlot=null;}
  this.readMask();const seed=seedNumber(this.env.weather?.settings.seed||'Tiangong');
  if(seed!==this.seed){this.seed=seed;this.events.length=0;this.lastSlot=null;}
  this.schedule(clock.phase,seed,camera,enhanced);
  this.inv.copy(this.env.earth.quaternion).invert();this.eye.copy(camera.position).applyQuaternion(this.inv);
  let flashes=0,meshIndex=0;const sunlight=u.localSun.value;
  this.events=this.events.filter(e=>clock.phase-e.start<(e.kind==='meteor'?1.2:enhanced?1.4:.85));
  for(const e of this.events){const age=clock.phase-e.start;if(age<0)continue;const mu=e.n[0]*sunlight.x+e.n[1]*sunlight.y+e.n[2]*sunlight.z,visibility=1-THREE.MathUtils.smoothstep(mu,-.12,.16)*.96;
   if(e.kind==='storm'){
    if(u.cloudAmount.value<=.01||this.coverage(e.n)<.20)continue;
    if(s.lightning&&flashes<4){u.stormCenters.value[flashes].set(...e.n,(6379/e.radius)**2);u.stormPowers.value.setComponent(flashes,flashEnvelope(age,enhanced)*visibility*(enhanced?5:3));flashes++;}
    const duration=enhanced?.65:.16,elapsed=age-.08;
    if(!s.upper||e.upper<0||elapsed<0||elapsed>duration)continue;
    const mesh=this.pool[meshIndex++];this.up.fromArray(e.n);mesh.position.copy(this.up).multiplyScalar(6371+(e.upper===0?70:32));
    this.normal.copy(this.eye).sub(mesh.position);this.right.crossVectors(this.up,this.normal).normalize();this.normal.crossVectors(this.right,this.up).normalize();this.matrix.makeBasis(this.right,this.up,this.normal);mesh.quaternion.setFromRotationMatrix(this.matrix);
    mesh.scale.set(e.upper===0?28:14,e.upper===0?40:34,1);mesh.material.uniforms.kind.value=e.upper;mesh.material.uniforms.power.value=Math.sin(elapsed/duration*Math.PI)*visibility*(enhanced?2:1);mesh.visible=true;
   }else if(s.meteors){
    const mesh=this.pool[meshIndex++];this.up.fromArray(e.n);this.right.crossVectors(this.up,new THREE.Vector3(0,0,1));if(this.right.lengthSq()<1e-6)this.right.set(1,0,0);this.right.normalize().applyAxisAngle(this.up,e.angle);
    mesh.position.copy(this.up).multiplyScalar(6484-age*25).addScaledVector(this.right,(age-.5)*45);
    this.normal.copy(this.eye).sub(mesh.position).normalize();this.up.crossVectors(this.normal,this.right).normalize();this.normal.crossVectors(this.right,this.up).normalize();this.matrix.makeBasis(this.right,this.up,this.normal);mesh.quaternion.setFromRotationMatrix(this.matrix);mesh.scale.set(20,1.5,1);
    mesh.material.uniforms.kind.value=2;mesh.material.uniforms.power.value=Math.sin(Math.min(1,age/1.2)*Math.PI)*visibility*(enhanced?4:2);mesh.visible=true;
   }
  }u.stormCount.value=flashes;
 }
}
