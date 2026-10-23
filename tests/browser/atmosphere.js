import {SPECTRAL_RAYLEIGH,SPECTRAL_OZONE} from '../../src/atmosphere-spectrum.js';
// Small on-demand GPU fixture: production shaders, no embedded app/assets/animation.
import * as THREE from 'three';
import {vertex,atmosphereFragment,earthFragment,cloudFragment,volumeCloudFragment,atmosphereTransmissionFragment} from '../../src/earth-shaders.js';
import {SunView} from '../../src/sun-view.js';
import {AtmosphereRenderer} from '../../src/atmosphere-renderer.js';
import {buildMultipleScatteringTable} from '../../src/atmosphere-multiple.js';
import {scatteringGLSL} from '../../src/atmosphere-scattering.js';
import {solarOpticsGLSL} from '../../src/atmosphere-glsl.js';
import {buildOpticalDepthTable} from '../../src/atmosphere-optics.js';
const $=id=>document.getElementById(id),errors=[],table=buildOpticalDepthTable();
const pixels=Uint16Array.from(table.data,v=>THREE.DataUtils.toHalfFloat(v));
const lut=new THREE.DataTexture(pixels,table.width,table.height,THREE.RGBAFormat,THREE.HalfFloatType);lut.minFilter=lut.magFilter=THREE.LinearFilter;lut.needsUpdate=true;
const multi=buildMultipleScatteringTable(table,{rayleigh:SPECTRAL_RAYLEIGH.slice(0,3),ozone:SPECTRAL_OZONE.slice(0,3)}),multiTex=new THREE.DataTexture(Uint16Array.from(multi.data,v=>THREE.DataUtils.toHalfFloat(v)),multi.width,multi.height,THREE.RGBAFormat,THREE.HalfFloatType);multiTex.minFilter=multiTex.magFilter=THREE.LinearFilter;multiTex.needsUpdate=true;
const multiB=buildMultipleScatteringTable(table,{rayleigh:SPECTRAL_RAYLEIGH.slice(3),ozone:SPECTRAL_OZONE.slice(3)}),multiTexB=new THREE.DataTexture(Uint16Array.from(multiB.data,v=>THREE.DataUtils.toHalfFloat(v)),multiB.width,multiB.height,THREE.RGBAFormat,THREE.HalfFloatType);multiTexB.minFilter=multiTexB.magFilter=THREE.LinearFilter;multiTexB.needsUpdate=true;
const flat=(rgba)=>{const t=new THREE.DataTexture(new Uint8Array(rgba),1,1);t.needsUpdate=true;return t;};
const water=flat([2,10,30,255]),white=flat([255,255,255,255]),black=flat([0,0,0,255]);
const coverage=new Uint8Array(128*64*4);
for(let y=0;y<64;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4,c=Math.max(0,Math.sin(x*.3+Math.sin(y*.3)*3)*Math.cos(y*.3));coverage.set([c*255,c*255,c*255,255],i);}
const mask=new THREE.DataTexture(coverage,128,64);mask.wrapS=THREE.RepeatWrapping;mask.minFilter=mask.magFilter=THREE.LinearFilter;mask.needsUpdate=true;
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(800,560);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.debug.onShaderError=(gl,p,v,f)=>errors.push(gl.getShaderInfoLog(f));$('canvas').append(renderer.domElement);
const hdr=new AtmosphereRenderer(renderer);const scene=new THREE.Scene();scene.background=new THREE.Color(0);
const camera=new THREE.PerspectiveCamera(38,800/560,10,1000000);camera.position.set(0,0,6771);camera.up.set(0,0,1);
const sun=new THREE.Vector3(),uniforms={linearOutput:{value:0},linearComposite:{value:0},airglowStrength:{value:1},multipleStrength:{value:1},multipleDepth:{value:multiTex},multipleDepthB:{value:multiTexB},sun:{value:sun},localSun:{value:sun},solarDepth:{value:lut},enhanced:{value:1},steps:{value:32},detailed:{value:1},dayMap:{value:water},nightMap:{value:black},oceanMap:{value:white},cloudMap:{value:mask},cloudTemplateMap:{value:mask},climateMap:{value:black},cloudAmount:{value:.85},cloudMode:{value:0},cloudChannel:{value:0},gloss:{value:90},cloudMotion:{value:0},motionTime:{value:0},weatherTime:{value:0},seed:{value:0},cloudSeason:{value:0},cloudSteps:{value:28},earthInverse:{value:new THREE.Matrix3()}};
for(let i=0;i<4;i++)for(const prefix of ['detail','nightDetail']){uniforms[prefix+'Map'+i]={value:black};uniforms[prefix+'Fade'+i]={value:0};uniforms[prefix+'Rect'+i]={value:new THREE.Vector4(0,0,1,1)};}
const make=(r,w,h,fragment,order,back=false)=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,w,h),new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:order>0,depthWrite:!order,depthTest:!back,side:back?THREE.BackSide:THREE.FrontSide}));mesh.renderOrder=order;scene.add(mesh);return mesh;};
make(6371,384,192,earthFragment,0);const cloud=make(6379,384,192,cloudFragment,2),volume=make(6387,128,80,volumeCloudFragment,2.4,true);const airMesh=make(6671,128,64,atmosphereFragment,3,true),transMesh=make(6471,128,64,atmosphereTransmissionFragment,2.9,true);
transMesh.material.blending=THREE.CustomBlending;transMesh.material.blendSrc=THREE.ZeroFactor;transMesh.material.blendDst=THREE.SrcColorFactor;transMesh.material.blendSrcAlpha=THREE.ZeroFactor;transMesh.material.blendDstAlpha=THREE.OneFactor;transMesh.material.toneMapped=false;
const sunView=new SunView({sky:scene,environment:{hdr,opticalTable:table},api:{sunLight:new THREE.DirectionalLight()}});
function render(){const angle=Number($('sun').value)*Math.PI/180,az=Number($('azimuth').value)*Math.PI/180;sun.set(Math.cos(angle),0,Math.sin(angle));camera.lookAt(2700*Math.cos(az),2700*Math.sin(az),5900);cloud.visible=$('cloud').value==='shell';volume.visible=$('cloud').value==='volume';uniforms.cloudAmount.value=$('cloud').value==='off'?0:.85;const linear=hdr.begin();uniforms.linearOutput.value=linear?1:0;uniforms.linearComposite.value=linear?1:0;transMesh.visible=linear;cloud.renderOrder=linear?3.05:2;volume.renderOrder=linear?3.06:2.4;airMesh.material.blending=linear?THREE.AdditiveBlending:THREE.NormalBlending;sunView.update({sunDir:sun.toArray(),sun:sun.clone().multiplyScalar(149597870.7).toArray(),position:camera.position.toArray()},camera,linear);renderer.render(scene,camera);if(linear)hdr.finish();$('report').textContent=JSON.stringify({shaderErrors:errors,drawCalls:renderer.info.render.calls,textureKiB:256,mode:'按需单帧；合成云遮罩仅供着色检查'},null,2);}
for(const id of ['sun','azimuth','cloud'])$(id).onchange=render;
function check(){
 const results=[],assert=(ok,name)=>{results.push({name,pass:!!ok});if(!ok)throw Error(name);};
 const rt=new THREE.WebGLRenderTarget(1,1,{type:THREE.FloatType,depthBuffer:false}),buf=new Float32Array(4),probe=new THREE.Scene(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));quad.frustumCulled=false;probe.add(quad);
 const u={solarDepth:{value:lut},h:{value:0},mu:{value:0},phase:{value:0}};
 const material=new THREE.ShaderMaterial({uniforms:u,vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`${solarOpticsGLSL}uniform float h,mu,phase;void main(){gl_FragColor=phase>.5?vec4(rayleighPhase(mu),miePhase(mu),0.,1.):vec4(sunlightAt(h,mu),1.);}`,toneMapped:false});
 const sample=(h,mu,phase=0)=>{quad.material=material;u.h.value=h;u.mu.value=mu;u.phase.value=phase;renderer.setRenderTarget(rt);renderer.render(probe,camera);renderer.readRenderTargetPixels(rt,0,0,1,1,buf);return [...buf];};
 uniforms.linearOutput.value=1;uniforms.linearComposite.value=0;uniforms.airglowStrength.value=0;let directional=[];
 try{
  const forward=sample(0,1,1),side=sample(0,0,1),back=sample(0,-1,1);results.push({phaseSamples:{forward,side,back}});
  assert(forward[0]>.1&&Math.abs(forward[0]-back[0])<1e-6&&Math.abs(forward[0]-2*side[0])<1e-6,'Rayleigh 前后对称');assert(forward[1]>side[1]*50&&forward[1]>back[1]*100,'Mie 朝日增强');
  const noon=sample(8,1),sunset=sample(8,-.04),night=sample(8,-.2),ground=sample(0,-.02),high=sample(8,-.02);
  results.push({solarSamples:{noon,sunset,night,ground,high}});
  assert(noon[2]/noon[0]>.85,'高太阳云顶近白');assert(sunset[0]>sunset[2]*3,'长光程自然偏暖');assert(night.slice(0,3).every(v=>v===0),'地影内无直射暖光');assert(ground[0]===0&&high[0]>.1,'云顶仍受光时地面已入影');
  const rayPoint=new THREE.Vector3(),aUniforms={...uniforms,rayPoint:{value:rayPoint}},air=new THREE.ShaderMaterial({uniforms:aUniforms,vertexShader:'uniform vec3 rayPoint;varying vec3 worldP;void main(){worldP=rayPoint;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:atmosphereFragment,toneMapped:false});
  quad.material=air;const original=camera.position.clone(),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,2,3).normalize(),.7);
  let ratio=6381/6771;
  const radiance=(angle,az,rotated=false)=>{const el=angle*Math.PI/180,phi=az*Math.PI/180,d=new THREE.Vector3(ratio*Math.cos(phi),ratio*Math.sin(phi),-Math.sqrt(1-ratio*ratio));sun.set(Math.cos(el),0,Math.sin(el));camera.position.copy(original);if(rotated){sun.applyQuaternion(rotation);d.applyQuaternion(rotation);camera.position.applyQuaternion(rotation);}rayPoint.copy(camera.position).addScaledVector(d,100);renderer.setRenderTarget(rt);renderer.render(probe,camera);renderer.readRenderTargetPixels(rt,0,0,1,1,buf);return [...buf].slice(0,3).map(v=>Math.max(0,v*buf[3]/4));};
  for(const el of [45,-19,-45])for(const az of [0,90,180])directional.push({sunElevation:el,azimuth:az,rgb:radiance(el,az)});
  const daySide=directional[1].rgb,twilight=directional[3].rgb,opposite=directional[5].rgb;
  assert(daySide[2]>daySide[0],'白天侧向薄边偏蓝');assert(twilight[0]>opposite[0]*20,'晨昏朝日与背日亮度不同');
  const before=radiance(-19,0),after=radiance(-19,0,true);assert(before.every((v,i)=>Math.abs(v-after[i])<.003),'共同旋转相机和太阳保持物理关系');
  assert(directional.slice(6).every(r=>Math.max(...r.rgb)<.002),'深夜侧不制造整圈发光');assert(errors.length===0,'生产着色器编译无错误');
  const profiles=[];
  for(const height of [.1,.5,1,2,5,10,20,40,70,95])for(const az of [0,90,180]){ratio=(6371+height)/6771;const rgb=radiance(45,az);profiles.push({height,az,rgb});}
  results.push({dayProfiles:profiles,multipleFeedback:multi.maxFeedback});
  assert(profiles.every(p=>p.rgb[2]>=p.rgb[1]*.97&&p.rgb[1]>=p.rgb[0]*.97),'日照全高度剖面无暖色条带');
  ratio=6463/6771;uniforms.airglowStrength.value=1;const glow=radiance(-45,0);uniforms.airglowStrength.value=0;const dark=radiance(-45,0);
  assert(glow[1]>dark[1]+.0001&&glow[1]>glow[0],'地影有独立弱绿色气辉');assert(glow[1]<.02,'气辉低于白昼散射亮度');results.push({glow,dark});uniforms.airglowStrength.value=1;
  camera.position.copy(original);
  const cloudProbe=new THREE.ShaderMaterial({uniforms:aUniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`${solarOpticsGLSL}${scatteringGLSL}uniform vec3 rayPoint;void main(){gl_FragColor=vec4(viewTransmission(rayPoint,normalize(cameraPosition-rayPoint)),1.);}`,toneMapped:false});
  quad.material=cloudProbe;const impact=6370/6771,d=new THREE.Vector3(impact,0,-Math.sqrt(1-impact*impact)),b=original.dot(d);
  const pathT=radius=>{rayPoint.copy(original).addScaledVector(d,-b-Math.sqrt(b*b-original.lengthSq()+radius*radius));renderer.setRenderTarget(rt);renderer.render(probe,camera);renderer.readRenderTargetPixels(rt,0,0,1,1,buf);return [...buf].slice(0,3);};
  const cloudT=pathT(6379),groundT=pathT(6371);assert(cloudT.every((v,i)=>v>groundT[i])&&cloudT[2]>groundT[2]*2,'高云前方透射不包含云后低层空气');results.push({cloudT,groundT});cloudProbe.dispose();air.dispose();
 }catch(error){results.push({error:error.message});}finally{uniforms.airglowStrength.value=1;rt.dispose();material.dispose();quad.geometry.dispose();renderer.setRenderTarget(null);render();}
 window.atmosphereCheck={results,directional,shaderErrors:errors};$('report').textContent=JSON.stringify(window.atmosphereCheck,null,2);return window.atmosphereCheck;
}
$('check').onclick=check;window.runAtmosphereCheck=check;window.atmosphereFixture={renderer,hdr,scene,camera,uniforms,render,multi,sunView};
addEventListener('pagehide',()=>{hdr.dispose();renderer.dispose();renderer.forceContextLoss();});render();

window.checkAtmosphereFrames=()=>{
 const results=[],record=(name,pass,detail)=>{results.push({name,pass,...detail});if(!pass)throw Error(name);};
 const gl=renderer.getContext(),read=()=>{const size=renderer.getDrawingBufferSize(new THREE.Vector2()),p=new Uint8Array(size.x*size.y*4);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,p);return {p,w:size.x,h:size.y};};
 try{
  $('sun').value='45';$('cloud').value='off';
  for(const az of [0,90,180]){
   $('azimuth').value=String(az);render();camera.updateMatrixWorld();const {p,w,h}=read();let count=0,warm=0;
   for(let y=0;y<h;y++){
    const d=new THREE.Vector3(0,(y+.5)/h*2-1,.5).unproject(camera).sub(camera.position).normalize(),b=camera.position.dot(d),alt=Math.sqrt(camera.position.lengthSq()-b*b)-6371;
    if(b>=0||alt<0||alt>100)continue;const i=(y*w+Math.floor(w/2))*4;
    if(p[i+2]>8){count++;if(p[i]>p[i+2]+2)warm++;}
   }
   record('final daytime limb blue '+az,count>5&&warm===0,{samples:count,warm});
  }
  for(const sunAngle of ['45','-19','-45'])for(const mode of ['shell','volume']){$('sun').value=sunAngle;$('cloud').value=mode;render();record('cloud final '+sunAngle+' '+mode,gl.getError()===gl.NO_ERROR&&errors.length===0);}
  const target=hdr.target;renderer.setSize(640,448);render();record('viewport target follows resize',hdr.target===target&&hdr.target.width===640&&hdr.target.height===448);
  renderer.setSize(800,560);render();record('reuse target',hdr.target===target);
  const before=renderer.info.memory.textures;hdr.release();record('quality switch frees HDR',!hdr.target&&renderer.info.memory.textures===before-1);render();record('quality switch recreates HDR',!!hdr.target);
  const original=gl.checkFramebufferStatus.bind(gl);hdr.release();gl.checkFramebufferStatus=()=>gl.FRAMEBUFFER_UNSUPPORTED;
  try{render();record('unsupported HDR falls back',hdr.failed&&!hdr.target&&renderer.getRenderTarget()===null);}finally{gl.checkFramebufferStatus=original;hdr.failed=false;render();}
 }catch(e){results.push({error:e.message,pass:false});}
 return results;
};

// Reuse the actual catalogue builder and Milky Way shader, with the bundled
// lower-resolution copy of the same panorama to keep this QA context small.
import {Environment} from '../../src/environment.js';
window.checkAtmosphereSky=async()=>{
 const sky=Object.create(Environment.prototype);sky.backdrop=new THREE.Scene();sky.buildStars();sky.buildMilkyWay();sky.labelGroup.visible=false;sky.starUniforms.high.value=1;
 const view=new THREE.PerspectiveCamera(55,800/560,.1,2000);view.up.set(0,0,1);view.lookAt(-.05487556,-.87343709,-.48383502);
 let cube;
 try{
  cube=await new THREE.CubeTextureLoader().loadAsync(['px','nx','py','ny','pz','nz'].map(f=>'../../assets/sky/milkyway-4k-'+f+'.jpg'));cube.colorSpace=THREE.SRGBColorSpace;sky.milky.material.uniforms.skyMap.value=cube;sky.milky.material.uniforms.textured.value=1;
  const gl=renderer.getContext(),capture=(stars,milky,linear)=>{
   hdr.material.uniforms.sunGlow.value.set(0,0,0);
   sky.stars.visible=stars;sky.milky.visible=milky;sky.starUniforms.brightness.value=linear?2:1;sky.milky.material.uniforms.brightness.value=linear?2:1;renderer.autoClear=true;if(linear)hdr.begin();else renderer.setRenderTarget(null);renderer.render(sky.backdrop,view);if(linear)hdr.finish();
   const pixels=new Uint8Array(800*560*4);gl.readPixels(0,0,800,560,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
  };
  const results=[];
  for(const linear of [false,true]){
   const background=capture(false,true,linear),combined=capture(true,true,linear);let count=0,contrast=0;
   for(let i=0;i<background.length;i+=4){const delta=Math.max(combined[i]-background[i],combined[i+1]-background[i+1],combined[i+2]-background[i+2]);if(delta>12){count++;contrast+=delta;}}
   results.push({linear,visibleStarPixels:count,meanContrast:contrast/count});
  }
  return {results,pass:results[1].visibleStarPixels>=results[0].visibleStarPixels*.85&&results[1].meanContrast>30&&errors.length===0,shaderErrors:errors};
 }finally{cube?.dispose();sky.backdrop.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});render();}
};

window.checkSunFrames=()=>{
 const results=[],select=$('sun'),saved=select.value,cloudMode=$('cloud').value,az=$('azimuth').value,gl=renderer.getContext();
 const pixel=()=>{const u=hdr.material.uniforms.sunPosition.value,w=renderer.domElement.width,h=renderer.domElement.height,p=new Uint8Array(4);gl.readPixels(Math.round(u.x*w),Math.round(u.y*h),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];};
 try{
  $('cloud').value='off';$('azimuth').value='0';
  for(const [name,angle] of [['clear',-15],['rising',-19.79259653],['hidden',-21]]){
   const option=new Option(name,String(angle));select.add(option);select.value=String(angle);render();const rgb=pixel(),glow=hdr.material.uniforms.sunGlow.value.toArray();option.remove();
   const pass=name==='clear'?Math.min(...rgb.slice(0,3))>240:name==='rising'?rgb[0]>2*rgb[1]&&rgb[0]>2*rgb[2]&&glow[0]>glow[1]&&glow[1]>glow[2]:glow.every(v=>v===0);
   results.push({name,pass,rgb,glow});
  }
  const occultor=new THREE.Mesh(new THREE.SphereGeometry(1737.4,32,16),new THREE.MeshBasicMaterial({color:0}));scene.add(occultor);sunView.sim.environment.moon={mesh:occultor};
  const option=new Option('occultation','-15');select.add(option);select.value='-15';render();occultor.position.copy(camera.position).addScaledVector(sun,350000);render();
  results.push({name:'Moon covers Sun and glare',pass:hdr.material.uniforms.sunGlow.value.length()===0,rgb:pixel()});
  const solarRadius=Math.asin(695700/149597870.7);occultor.position.copy(camera.position).addScaledVector(sun,1737.4/Math.sin(.9*solarRadius));render();
  results.push({name:'thin annular Sun retains glare',pass:hdr.material.uniforms.sunGlow.value.x>2.9&&hdr.material.uniforms.sunOcclusionProbe.value===0,glow:hdr.material.uniforms.sunGlow.value.toArray()});
  scene.remove(occultor);occultor.geometry.dispose();occultor.material.dispose();delete sunView.sim.environment.moon;option.remove();
  select.value='-19';render();gl.finish();const start=performance.now();for(let i=0;i<12;i++){render();gl.finish();}results.push({fixtureMillisecondsPerFrame:(performance.now()-start)/12,width:800,height:560});
 }finally{select.value=saved;$('cloud').value=cloudMode;$('azimuth').value=az;render();}
 return results;
};
