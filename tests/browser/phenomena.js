import './atmosphere.js';
import * as THREE from 'three';
import {Phenomena} from '../../src/phenomena.js';
const f=window.atmosphereFixture,{$:unused}=window;
const ids=['showLightning','showUpperFlash','showAirglow','showMeteors'];
for(const id of ids){const input=document.createElement('input');input.id=id;input.type='checkbox';input.checked=true;document.body.append(input);}
const mode=document.createElement('select');mode.id='phenomenaMode';mode.innerHTML='<option value="natural">Natural</option><option value="enhanced">Enhanced</option>';document.body.append(mode);
const sim={sky:f.scene,time:1e9,mode:'custom',speed:1};
const env={sim,uniforms:f.uniforms,earth:f.scene.children.find(x=>x.geometry?.parameters.radius===6371),quality:'high',weather:{settings:{seed:'Tiangong'}}};
const effects=new Phenomena(env);effects.restore({mode:'enhanced'});
const white=document.createElement('canvas');white.width=512;white.height=256;const ctx=white.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,512,256);const mask=new THREE.CanvasTexture(white);env.uniforms.cloudMap.value=mask;
const q={t:sim.time};
window.phenomenaFixture={effects,env,sim,q,...f};
window.checkPhenomena=()=>{
 const results=[],assert=(condition,name)=>{results.push({name,pass:!!condition});if(!condition)throw Error(name);};
 const gl=f.renderer.getContext(),read=()=>{const a=new Uint8Array(800*560*4);gl.readPixels(0,0,800,560,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;},delta=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]+a[i+1]+a[i+2]>b[i]+b[i+1]+b[i+2]+5)n++;return n;};
 try{
  document.getElementById('sun').value='-45';document.getElementById('cloud').value='shell';
  effects.settings.airglow=false;effects.update(q,f.camera,1000);effects.events=[];effects.lastSlot=Math.floor(effects.clock.phase/2);
  for(const cloudMode of ['shell','volume']){
   document.getElementById('cloud').value=cloudMode;f.uniforms.stormCount.value=0;f.render();const dark=read();
   f.uniforms.stormCount.value=1;f.uniforms.stormCenters.value[0].set(.10,0,Math.sqrt(.99),(6379/35)**2);f.uniforms.stormPowers.value.set(5,0,0,0);f.render();const lit=read();
   assert(delta(lit,dark)>20,'cloud illumination '+cloudMode);
   f.uniforms.stormCenters.value[0].z*=-1;f.render();assert(delta(read(),dark)===0,'back-side flash hidden '+cloudMode);
  }
  f.uniforms.stormCount.value=0;
  const n=[.10,0,Math.sqrt(.99)];
  for(const kind of ['sprite','jet','meteor']){
   effects.events=[kind==='meteor'?{n,start:effects.clock.phase-.5,kind:'meteor',angle:.3}:{n,start:effects.clock.phase-.2,kind:'storm',upper:kind==='sprite'?0:1,radius:35}];
   effects.update(q,f.camera,1000);f.render();assert(effects.pool.some(x=>x.visible),'visible '+kind);assert(gl.getError()===gl.NO_ERROR,'GPU '+kind);
  }
  const phase=effects.clock.phase;effects.update(q,f.camera,1100);assert(effects.clock.phase===phase,'pause freezes effects');
  sim.speed=1000;q.t+=16000;effects.update(q,f.camera,1116);assert(effects.clock.phase-phase<=.033,'1000x capped');
  q.t-=100000;effects.update(q,f.camera,1132);assert(effects.clock.reset,'seek resets events');
  effects.restore({lightning:false,upper:false,meteors:false,airglow:false});effects.update(q,f.camera,1148);assert(f.uniforms.stormCount.value===0&&effects.pool.every(x=>!x.visible)&&f.uniforms.airglowStrength.value===0,'all off');
  assert(!f.renderer.info.programs.some(p=>p.diagnostics&&!p.diagnostics.runnable),'shader compile');
 }catch(e){results.push({error:e.message,pass:false});}
 return results;
};
import {climatePixels} from '../../src/cloud-geography.js';
import {cloudFragment,atmosphereFragment} from '../../src/earth-shaders.js';
window.checkPhenomenaClouds=()=>{
 const results=[],assert=(value,name)=>{results.push({name,pass:!!value});if(!value)throw Error(name);};
 const image=document.createElement('canvas');image.width=512;image.height=256;const c=image.getContext('2d'),pixels=c.createImageData(512,256);
 for(let y=0;y<256;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4,v=90+90*Math.sin(x*.06)*Math.cos(y*.09);pixels.data.set([v,v,v,255],i);}c.putImageData(pixels,0,0);
 const texture=new THREE.CanvasTexture(image);texture.wrapS=THREE.RepeatWrapping;texture.minFilter=texture.magFilter=THREE.LinearFilter;
 const u=f.uniforms,old=[u.cloudTemplateMap.value,u.cloudMode.value,u.cloudMotion.value,u.enhanced.value];u.climateMap.value=new THREE.DataTexture(climatePixels(),512,256);u.climateMap.value.needsUpdate=true;u.climateMap.value.minFilter=u.climateMap.value.magFilter=THREE.LinearFilter;u.cloudTemplateMap.value=texture;u.cloudMode.value=1;u.cloudMotion.value=1;u.weatherTime.value=123;u.seed.value=113;u.cloudSeason.value=.5;effects.readMask();
 const sampleN={value:new THREE.Vector3()},geometry=new THREE.PlaneGeometry(2,2),material=new THREE.ShaderMaterial({uniforms:{...u,sampleN},vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:cloudFragment.split('void main()')[0]+'uniform vec3 sampleN;void main(){gl_FragColor=vec4(vec3(cloudAt(sampleN)),1.);}',toneMapped:false});
 const scene=new THREE.Scene(),quad=new THREE.Mesh(geometry,material);quad.frustumCulled=false;scene.add(quad);const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.FloatType,depthBuffer:false}),buf=new Float32Array(4);
 try{
  for(const n of [[1,0,0],[.3,.9,.31622777],[-.5,.5,.70710678]]){sampleN.value.fromArray(n).normalize();f.renderer.setRenderTarget(target);f.renderer.render(scene,f.camera);f.renderer.readRenderTargetPixels(target,0,0,1,1,buf);const cpu=effects.coverage(sampleN.value.toArray());results.push({cpu,gpu:buf[0]});assert(Math.abs(buf[0]-cpu)<.025,'local cloud CPU/GPU '+n);results.at(-1).error=Math.abs(buf[0]-cpu);}
  const rayPoint={value:new THREE.Vector3()},air=new THREE.ShaderMaterial({uniforms:{...u,rayPoint},vertexShader:'uniform vec3 rayPoint;varying vec3 worldP;void main(){worldP=rayPoint;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:atmosphereFragment,toneMapped:false});quad.material=air;
  u.enhanced.value=0;u.linearComposite.value=0;u.airglowStrength.value=1;u.sun.value.set(0,0,-1);const impact=(6371+240)/6771;rayPoint.value.copy(f.camera.position).add(new THREE.Vector3(impact,0,-Math.sqrt(1-impact*impact)).multiplyScalar(100));f.renderer.render(scene,f.camera);f.renderer.readRenderTargetPixels(target,0,0,1,1,buf);assert(buf[0]>0&&buf[3]>0,'standard quality high red airglow survives');
  u.airglowStrength.value=0;f.renderer.render(scene,f.camera);f.renderer.readRenderTargetPixels(target,0,0,1,1,buf);assert(buf[0]===0,'airglow off');air.dispose();
 }catch(e){results.push({pass:false,error:e.message});}
 finally{u.cloudTemplateMap.value=old[0];u.cloudMode.value=old[1];u.cloudMotion.value=old[2];u.enhanced.value=old[3];f.renderer.setRenderTarget(null);geometry.dispose();material.dispose();target.dispose();texture.dispose();effects.restore({mode:'enhanced'});f.render();}
 return results;
};
