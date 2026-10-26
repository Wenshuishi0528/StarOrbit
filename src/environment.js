import {SPECTRAL_RAYLEIGH,SPECTRAL_OZONE} from './atmosphere-spectrum.js';
import {vertex,earthFragment,cloudFragment,atmosphereFragment,auroraFragment,volumeCloudFragment,atmosphereTransmissionFragment} from './earth-shaders.js';
import {AtmosphereRenderer} from './atmosphere-renderer.js';
import {buildMultipleScatteringTable} from './atmosphere-multiple.js';
import {buildOpticalDepthTable} from './atmosphere-optics.js';
import {galaxyVertex,galaxyFragment} from './sky-shaders.js';
import {climatePixels} from './cloud-geography.js';
import {Weather} from './weather.js';
import {Phenomena,flashUniforms} from './phenomena.js';
import {Moon} from './moon.js';
import {EarthDetail} from './earth-detail.js';
import {t,setText,onLanguageChange} from './i18n.js';
import * as THREE from 'three';
import catalogue from '../assets/stars.json';
import {Geography} from './geography.js';
import {normalizeGeographySettings,bindGeographyControls} from './geography-settings.js';
import {StarChart} from './star-chart.js';
import {normalizeStarChartSettings,bindStarChartControls} from './star-chart-settings.js';
import {QUALITY,equatorial,qualityFor} from './environment-math.js';
import {EARTH_RADIUS,stateAt,earthAxes} from './orbit.js';

const $=id=>document.getElementById(id),V=a=>new THREE.Vector3(...a);
export class Environment{
 constructor(sim){
  this.sim=sim;this.api=sim.api;this.ticket=0;this.queue=Promise.resolve();this.textures=[];this.lastTrack=0;
  const assetNode=$('environmentAssets');this.assets=JSON.parse(assetNode.textContent);
  // Parsed assets own the data now; release the large inline JSON DOM copy.
  assetNode.remove();
  this.settings={quality:'standard',stars:true,milky:true,moon:true,...normalizeStarChartSettings(),...normalizeGeographySettings(),clouds:true,cloudOpacity:.85,starBrightness:1,exposure:'cinematic',groundTrack:false};
  try{const old=JSON.parse(localStorage.getItem('tiangong-environment-v1'));Object.assign(this.settings,normalizeStarChartSettings(old),normalizeGeographySettings(old));for(const k of ['stars','milky','moon','clouds','groundTrack'])if(typeof old?.[k]==='boolean')this.settings[k]=old[k];
   if(QUALITY[old?.quality])this.settings.quality=old.quality;if(['view','photo','cinematic'].includes(old?.exposure))this.settings.exposure=old.exposure;
   for(const k of ['cloudOpacity','starBrightness'])if(Number.isFinite(old?.[k]))this.settings[k]=THREE.MathUtils.clamp(old[k],0,k==='cloudOpacity'?1:2);
  }catch{}
  this.fallback=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);this.fallback.needsUpdate=true;
  this.climateMap=new THREE.DataTexture(climatePixels(),512,256,THREE.RGBAFormat);this.climateMap.wrapS=THREE.RepeatWrapping;this.climateMap.minFilter=this.climateMap.magFilter=THREE.LinearFilter;this.climateMap.needsUpdate=true;
  this.uniforms={...flashUniforms(),linearOutput:{value:0},solarDepth:{value:this.fallback},climateMap:{value:this.climateMap},cloudTemplateMap:{value:this.fallback},cloudSeason:{value:0},dayMap:{value:this.fallback},nightMap:{value:this.fallback},cloudMap:{value:this.fallback},oceanMap:{value:this.fallback},sun:{value:V([1,0,0])},detailed:{value:0},cloudAmount:{value:0},gloss:{value:40},localSun:{value:new THREE.Vector3(1,0,0)},enhanced:{value:0},cloudChannel:{value:0},cloudTone:{value:0},cloudMode:{value:0},weatherTime:{value:0},seed:{value:0},cloudMotion:{value:0},motionTime:{value:0},earthInverse:{value:new THREE.Matrix3()},cloudSteps:{value:28}};
  this.detail=new EarthDetail(this);this.nightDetail=new EarthDetail(this,true);
  this.earth=new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS,160,96),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:earthFragment}));
  sim.sky.add(this.earth);sim.earth=this.earth;
  this.clouds=new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS+8,160,96),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:cloudFragment,transparent:true,depthWrite:false}));this.clouds.renderOrder=2;sim.sky.add(this.clouds);
  this.atmosphere=new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS+300,128,64),new THREE.ShaderMaterial({uniforms:{linearOutput:this.uniforms.linearOutput,airglowOnly:{value:0},linearComposite:{value:0},airglowStrength:{value:1},multipleStrength:{value:1},multipleDepth:{value:this.fallback},multipleDepthB:{value:this.fallback},sun:this.uniforms.sun,steps:{value:8},enhanced:this.uniforms.enhanced,solarDepth:this.uniforms.solarDepth},vertexShader:vertex,fragmentShader:atmosphereFragment,transparent:true,depthWrite:false,depthTest:false,side:THREE.BackSide}));this.atmosphere.renderOrder=3;sim.sky.add(this.atmosphere);
  for(const key of ['linearComposite','airglowStrength','multipleStrength','multipleDepth','multipleDepthB','steps'])this.uniforms[key]=this.atmosphere.material.uniforms[key];
  this.atmosphereTransmission=new THREE.Mesh(this.atmosphere.geometry,new THREE.ShaderMaterial({uniforms:{solarDepth:this.uniforms.solarDepth},vertexShader:vertex,fragmentShader:atmosphereTransmissionFragment,transparent:true,depthWrite:false,depthTest:false,side:THREE.BackSide,blending:THREE.CustomBlending,blendSrc:THREE.ZeroFactor,blendDst:THREE.SrcColorFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,toneMapped:false}));this.atmosphereTransmission.renderOrder=2.9;this.atmosphereTransmission.visible=false;sim.sky.add(this.atmosphereTransmission);
  this.hdr=new AtmosphereRenderer(this.api.renderer);

  this.volumeClouds=new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS+16,128,80),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:volumeCloudFragment,transparent:true,depthWrite:false,depthTest:false,side:THREE.BackSide}));this.volumeClouds.renderOrder=2.4;sim.sky.add(this.volumeClouds);
  this.auroraUniforms={auroraMap:{value:this.fallback},sun:this.uniforms.sun,useData:{value:0},strength:{value:1.4},weatherTime:this.uniforms.weatherTime,seed:this.uniforms.seed};
  this.aurora=new THREE.Group();for(let i=0;i<9;i++){const mesh=new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS+105+i*24,160,96),new THREE.ShaderMaterial({uniforms:this.auroraUniforms,vertexShader:vertex,fragmentShader:auroraFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));mesh.renderOrder=3.1+i*.01;this.aurora.add(mesh);}sim.sky.add(this.aurora);

  this.backdrop=new THREE.Scene();this.backdrop.background=new THREE.Color('#000104');
  this.starCamera=new THREE.PerspectiveCamera(38,1,.1,2000);
  this.buildStars();this.buildMilkyWay();this.moon=new Moon(this);this.starChart=new StarChart(this);this.geography=new Geography(this);
  this.track=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#ffc978',transparent:true,opacity:.85}));this.track.renderOrder=1;this.earth.add(this.track);
  this.groundMarker=new THREE.Mesh(new THREE.SphereGeometry(25,12,8),new THREE.MeshBasicMaterial({color:'#ffce80'}));this.earth.add(this.groundMarker);
  this.bind();this.setSkyStyle();this.ready=this.setQuality(this.settings.quality);this.bindImmersive();this.weather=new Weather(this);this.phenomena=new Phenomena(this);onLanguageChange(()=>{this.skyStatus();});
 }
 buildStars(){
  const positions=[],colors=[],mags=[];
  for(const [id,ra,dec,mag,bv] of catalogue){const dir=V(equatorial(ra,dec));positions.push(...dir.clone().multiplyScalar(1000).toArray());mags.push(mag);
   const color=new THREE.Color(Number(bv)>.9?'#ffce9e':Number(bv)>.4?'#fff0dc':Number(bv)<.1?'#c0d7ff':'#e5ecff');colors.push(color.r,color.g,color.b);

  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('mag',new THREE.Float32BufferAttribute(mags,1));
  this.starUniforms={brightness:{value:1},pixelRatio:{value:1},high:{value:0}};
  // A different Milky Way map must not shrink or dim the foreground catalogue.
  // Keep the same screen-space point profile in ordinary and enhanced modes.
  const material=new THREE.ShaderMaterial({uniforms:this.starUniforms,vertexColors:true,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:`attribute float mag;uniform float brightness,pixelRatio,high;varying vec3 tint;varying float flux;void main(){tint=color;flux=pow(10.,-.14*max(-1.,mag-1.))*brightness;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=(2.1+max(0.,5.-mag)*.55+high)*pixelRatio;}`,
   fragmentShader:`varying vec3 tint;varying float flux;uniform float high;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float a=exp(-r*r*5.)+high*.08*exp(-r*r);gl_FragColor=vec4(tint*flux*a,1.);#include <colorspace_fragment>}`.replace(';#include',';\n#include')
  });this.stars=new THREE.Points(geometry,material);this.stars.frustumCulled=false;this.stars.renderOrder=1;this.backdrop.add(this.stars);
 }
 buildMilkyWay(){
  this.milky=new THREE.Mesh(new THREE.SphereGeometry(1200,64,32),new THREE.ShaderMaterial({side:THREE.BackSide,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{brightness:{value:1},textured:{value:0},skyMap:{value:null}},vertexShader:galaxyVertex,fragmentShader:galaxyFragment}));this.backdrop.add(this.milky);
 }
 async setSkyStyle(){
  this.lastSkyStyle=null;this.updatePixelRatio();
  const ticket=this.skyTicket=(this.skyTicket||0)+1;
  if(this.settings.exposure!=='cinematic'||!this.settings.stars||!this.settings.milky){
   this.milky.material.uniforms.skyMap.value=null;
   if(this.galaxyTexture){this.galaxyTexture.dispose();this.galaxyTexture.image=null;this.galaxyTexture=null;}
   this.skyLoading=false;this.skyStatus();return;
  }
  if(this.galaxyTexture){this.skyStatus();return;}
  this.skyLoading=true;this.skyFailed=false;this.skyUnsupported=false;this.skyStatus();
  // Decode only the selected native texture; queue rapid switches to bound peak memory.
  this.skyLoad=(this.skyLoad||Promise.resolve()).catch(()=>{}).then(async()=>{
   if(ticket!==this.skyTicket)return;
   const max=this.api.renderer.capabilities.maxCubemapSize;
   if(max<1024){this.skyUnsupported=true;this.skyLoading=false;this.skyStatus();return;}
   const size=max>=4096?16:max>=2048?8:4;
   let tex;
   try{
    tex=await new THREE.CubeTextureLoader().loadAsync(this.assets.sky[size]);
    if(ticket!==this.skyTicket){tex.dispose();tex.image=null;return;}
    tex.colorSpace=THREE.SRGBColorSpace;tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;
    tex.anisotropy=Math.min(8,this.api.renderer.capabilities.getMaxAnisotropy());
    this.galaxyTexture=tex;this.skySize=size;this.milky.material.uniforms.skyMap.value=tex;
   }catch(e){if(tex){tex.dispose();tex.image=null;}if(ticket===this.skyTicket){this.skyFailed=true;this.api.toast('高清星空载入失败，已保留普通星空，请重新选择重试。');}}
   finally{if(ticket===this.skyTicket){this.skyLoading=false;this.skyStatus();}}
  });
  await this.skyLoad;
 }
 skyStatus(){
  if(this.settings.exposure!=='cinematic'){setText('skyStatus','');return;}
  if(!this.settings.stars||!this.settings.milky){setText('skyStatus','');return;}
  if(this.skyLoading){setText('skyStatus','正在加载银河…');return;}
  if(this.skyUnsupported){setText('skyStatus','设备不支持高清天空纹理，已保留普通星空。');return;}
  if(this.skyFailed){setText('skyStatus','高清星空载入失败，已保留普通星空，请重新选择重试。');return;}
  setText('skyStatus',this.skySize===16?'':'当前设备：六面 {size}K 天空',{size:this.skySize/4});
 }
 updatePixelRatio(){
  this.devicePixelRatio=devicePixelRatio;
  const tier=this.quality||this.settings.quality;
  const ratio=Math.min(devicePixelRatio,QUALITY[tier].pixelRatio);
  if(this.api.renderer.getPixelRatio()!==ratio){this.api.renderer.setPixelRatio(ratio);this.api.resize();}
  this.starUniforms.pixelRatio.value=ratio;
 }
 save(){try{localStorage.setItem('tiangong-environment-v1',JSON.stringify(this.settings));}catch{}}
 bind(){
  bindStarChartControls(this.settings,()=>this.save());bindGeographyControls(this.settings,()=>this.save());
  const ids={moon:'showMoon',stars:'showStars',milky:'showMilky',clouds:'showClouds',groundTrack:'groundTrack'};
  for(const [key,id] of Object.entries(ids)){$(id).checked=this.settings[key];$(id).onchange=()=>{this.settings[key]=$(id).checked;this.save();if(key==='stars'||key==='milky')this.setSkyStyle();};}
  for(const [key,id] of [['cloudOpacity','cloudOpacity'],['starBrightness','starBrightness']]){$(id).value=this.settings[key];$(id).oninput=()=>{this.settings[key]=Number($(id).value);this.save();};}
  $('skyExposure').value=this.settings.exposure;$('skyExposure').onchange=()=>{this.settings.exposure=$('skyExposure').value;this.save();this.setSkyStyle();};
  $('earthQuality').value=this.settings.quality;$('earthQuality').onchange=()=>this.setQuality($('earthQuality').value);
 }
 setQuality(requested){
  const ticket=++this.ticket;this.loading=true;setText('qualityStatus','正在准备画质素材…');
  const tier=qualityFor(requested,this.api.renderer.capabilities.maxTextureSize);
  if(tier!==requested)this.api.toast('设备纹理上限不足，已改用中等画质');
  this.ready=this.queue=this.queue.catch(()=>{}).then(async()=>{
   if(ticket!==this.ticket)return;
   let loaded=[];
   try{
    const maps=this.assets[tier];const entries=Object.entries(maps);
    const results=await Promise.allSettled(entries.map(async([key,url])=>{
     const t=await new THREE.TextureLoader().loadAsync(url);t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;
     t.colorSpace=['day','night'].includes(key)?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=Math.min(tier==='high'?16:2,this.api.renderer.capabilities.getMaxAnisotropy());loaded.push(t);return [key,t];
    }));
    const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
    if(ticket!==this.ticket){loaded.forEach(t=>t.dispose());return;}
    const textures=Object.fromEntries(results.map(r=>r.value));
    for(const [key,uniform] of Object.entries({day:'dayMap',night:'nightMap',cloud:'cloudMap',ocean:'oceanMap'}))this.uniforms[uniform].value=textures[key]||this.fallback;
    this.builtinCloud=textures.cloud||this.fallback;this.uniforms.cloudTemplateMap.value=this.builtinCloud;
    this.textures.forEach(t=>{t.dispose();t.image=null;});this.textures=loaded;this.quality=tier;this.settings.quality=tier;
    this.uniforms.detailed.value=tier==='simple'?0:1;this.uniforms.enhanced.value=tier==='high'?1:0;this.uniforms.gloss.value=tier==='high'?90:40;
    if(tier==='high'&&!this.solarDepth){
     const table=buildOpticalDepthTable();this.opticalTable=table;const pixels=new Uint16Array(table.data.length);
     for(let i=0;i<pixels.length;i++)pixels[i]=THREE.DataUtils.toHalfFloat(table.data[i]);
     this.solarDepth=new THREE.DataTexture(pixels,table.width,table.height,THREE.RGBAFormat,THREE.HalfFloatType);
     this.solarDepth.minFilter=this.solarDepth.magFilter=THREE.LinearFilter;this.solarDepth.needsUpdate=true;
     this.uniforms.solarDepth.value=this.solarDepth;
     for(let band=0;band<2;band++){
      const multi=buildMultipleScatteringTable(table,{rayleigh:SPECTRAL_RAYLEIGH.slice(band*3,band*3+3),ozone:SPECTRAL_OZONE.slice(band*3,band*3+3)});
      const texture=new THREE.DataTexture(Uint16Array.from(multi.data,v=>THREE.DataUtils.toHalfFloat(v)),multi.width,multi.height,THREE.RGBAFormat,THREE.HalfFloatType);
      texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
      const key=band?'multipleDepthB':'multipleDepth';this[key]=texture;this.atmosphere.material.uniforms[key].value=texture;
     }
    }
    // Avoid faceted land/cloud silhouettes against the analytic atmosphere limb.
    const dense=tier==='high';
    if(this.denseEarth!==dense){
     for(const [mesh,radius] of [[this.earth,EARTH_RADIUS],[this.clouds,EARTH_RADIUS+8]]){
      mesh.geometry.dispose();mesh.geometry=new THREE.SphereGeometry(radius,dense?384:160,dense?192:96);
     }
     this.denseEarth=dense;
    }
    this.atmosphere.material.uniforms.steps.value=QUALITY[tier].steps;
    if(tier!=='high')this.hdr.release();
    const count=catalogue.filter(r=>r[3]<=QUALITY[tier].limit).length;this.stars.geometry.setDrawRange(0,this.settings.exposure==='cinematic'?catalogue.length:count);this.starCount=count;
    this.updatePixelRatio();this.starUniforms.high.value=tier==='high'?1:0;
    $('earthQuality').value=tier;for(const id of ['volumeClouds','cloudMotion'])$(id).disabled=tier!=='high';setText('qualityStatus','');
    for(const id of ['showClouds','cloudOpacity'])$(id).disabled=tier==='simple';this.save();if(this.weather)await this.weather.apply('cloud');
   }catch(e){
    loaded.forEach(t=>{t.dispose();t.image=null;});
    if(ticket!==this.ticket)return;
    $('earthQuality').value=this.quality||tier;
    if(!this.quality&&tier!=='simple'){
     setText('qualityStatus','素材载入失败，正在回退简易地图…');
     setTimeout(()=>{if(ticket===this.ticket)this.setQuality('simple');},0);
    }else{
     setText('qualityStatus',this.quality?'素材载入失败，已保留原画质；可重新选择重试。':'地球地图未能载入，请重新选择画质重试。');
     this.api.toast('地球素材载入失败，请重试画质切换');
    }
    console.warn('Earth texture load failed:',e.message||String(e));
   }
   finally{if(ticket===this.ticket)this.loading=false;}
  });return this.ready;
 }
 update(q,camera){
  this.moon.update(q,camera);
  const detailed=this.quality&&this.quality!=='simple',s=this.settings;
  const volume=this.quality==='high'&&this.weather?.settings.volume;this.volumeClouds.visible=!!detailed&&s.clouds&&!!volume;this.volumeClouds.quaternion.copy(this.earth.quaternion);this.uniforms.earthInverse.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(this.earth.quaternion)).transpose();
  this.clouds.quaternion.copy(this.earth.quaternion);this.clouds.visible=!!detailed&&s.clouds&&!volume;
  this.detail.update(camera);this.nightDetail.update(camera);
  this.uniforms.cloudAmount.value=detailed&&s.clouds?s.cloudOpacity:0;this.atmosphere.visible=!!detailed||!!this.phenomena?.settings.airglow;this.atmosphere.material.uniforms.airglowOnly.value=detailed?0:1;if(q)this.uniforms.localSun.value.copy(this.uniforms.sun.value).applyQuaternion(this.earth.quaternion.clone().invert());this.uniforms.cloudSeason.value=THREE.MathUtils.clamp(this.uniforms.localSun.value.z/.398,-1,1);this.weather?.update(q);this.phenomena?.update(q,camera);
  this.stars.visible=s.stars;this.milky.visible=s.stars&&s.milky;
  // The photographic option is an explicit display/exposure approximation.
  const cinematic=s.exposure==='cinematic';this.milky.material.uniforms.textured.value=cinematic&&this.galaxyTexture?1:0;
  if(this.lastSkyStyle!==s.exposure||this.lastStarTier!==this.quality){this.stars.geometry.setDrawRange(0,cinematic?catalogue.length:this.starCount||0);this.lastSkyStyle=s.exposure;this.lastStarTier=this.quality;if(this.quality&&!this.loading)setText('qualityStatus','');}
  const boost=s.exposure==='photo'?.025:1;this.starUniforms.brightness.value=s.starBrightness*boost;this.milky.material.uniforms.brightness.value=s.starBrightness*boost;
  this.starCamera.quaternion.copy(camera.quaternion);this.starCamera.fov=camera.fov;this.starCamera.aspect=camera.aspect;this.starCamera.zoom=camera.zoom;this.starCamera.updateProjectionMatrix();this.starChart.update(camera);this.geography.update(q,camera);
  this.track.visible=this.groundMarker.visible=s.groundTrack&&this.sim.view==='orbit'&&!!q;
  if(!q)return;
  const p=V(q.position).normalize().multiplyScalar(EARTH_RADIUS+28).applyQuaternion(this.earth.quaternion.clone().invert());this.groundMarker.position.copy(p);
  if(this.track.visible&&(this.trackData!==this.sim.data||Math.abs(q.t-this.lastTrack)>60000)){
   const points=[];
   for(let t=q.t-2800000;t<=q.t+2800000;t+=30000){
    const pv=stateAt(this.sim.data,t);if(!pv)continue;const pos=V(pv.position),axes=earthAxes(t);const local=axes.map(a=>pos.dot(V(a)));points.push(...V(local).normalize().multiplyScalar(EARTH_RADIUS+12).toArray());
   }
   this.track.geometry.dispose();this.track.geometry=new THREE.BufferGeometry();this.track.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));this.lastTrack=q.t;this.trackData=this.sim.data;
  }
 }
 beginFrame(){
  const linear=this.quality==='high'&&this.hdr.begin();
  this.clouds.renderOrder=linear?3.05:2;this.volumeClouds.renderOrder=linear?3.06:2.4;
  this.uniforms.linearOutput.value=linear?1:0;this.atmosphere.material.uniforms.linearComposite.value=linear?1:0;
  this.atmosphere.material.blending=linear?THREE.AdditiveBlending:THREE.NormalBlending;
  // Additive RGB uses source alpha=1; transmittance is applied by the multiply pass.
  this.atmosphere.material.premultipliedAlpha=false;
  this.atmosphereTransmission.visible=!!linear;
  // Catalogue/panorama values were authored for direct display. Apply the same
  // modest radiance normalization to both before the new shared ACES pass.
  const skyGain=this.settings.starBrightness*(this.settings.exposure==='photo'?.025:1)*(linear?2:1);
  this.starUniforms.brightness.value=skyGain;this.milky.material.uniforms.brightness.value=skyGain;
  return linear;
 }
 finishFrame(){this.hdr.finish();}
 renderBackground(renderer){renderer.autoClear=true;renderer.render(this.backdrop,this.starCamera);renderer.autoClear=false;renderer.state.buffers.depth.setMask(true);renderer.clearDepth();}
 bindImmersive(){
  const body=document.body;let timer,keyboard=false;
  const reveal=()=>{body.classList.add('hud-visible');clearTimeout(timer);timer=setTimeout(()=>{if(!keyboard)body.classList.remove('hud-visible');},1800);};
  const toggle=()=>{body.classList.toggle('immersive');reveal();$('immersiveExit').hidden=!body.classList.contains('immersive');this.api.resize();};
  $('immersiveMode').onclick=toggle;$('immersiveExit').onclick=toggle;
  document.addEventListener('pointermove',e=>{if(!body.classList.contains('immersive'))return;if(e.clientY>innerHeight-100||e.target.closest('aside,.toolbar,#immersiveExit'))reveal();});
  document.addEventListener('pointerdown',()=>{keyboard=false;reveal();});
  document.addEventListener('keydown',e=>{if(e.key==='Tab'){keyboard=true;reveal();}if(e.key==='Escape'&&body.classList.contains('immersive'))toggle();});
 }
}
