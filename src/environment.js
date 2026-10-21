import {t,setText,onLanguageChange} from './i18n.js';
import * as THREE from 'three';
import catalogue from '../assets/stars.json';
import {QUALITY,equatorial,qualityFor} from './environment-math.js';
import {EARTH_RADIUS,interpolate,earthAxes} from './orbit.js';

const $=id=>document.getElementById(id),V=a=>new THREE.Vector3(...a);
const vertex=`varying vec3 localN;varying vec3 worldN;varying vec3 worldP;
void main(){localN=normalize(position);worldN=normalize(mat3(modelMatrix)*localN);worldP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(worldP,1.);}`;
// atan wraps at the date line; wrap UV derivatives too, otherwise mip selection
// creates a bright dotted seam along 180 degrees longitude at grazing angles.
const mapping=`vec4 sampleMap(sampler2D tex,vec2 uv){vec2 dx=dFdx(uv),dy=dFdy(uv);dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);return textureGrad(tex,uv,dx,dy);}
vec2 mapUV(vec3 p){p=normalize(p);return vec2(atan(p.y,p.x)/6.28318530718+.5,asin(clamp(p.z,-1.,1.))/3.14159265359+.5);}`;
const output=`
#include <tonemapping_fragment>
#include <colorspace_fragment>`;
const earthFragment=`
uniform sampler2D dayMap,nightMap,cloudMap,oceanMap;
uniform vec3 sun;uniform float detailed,cloudAmount,gloss;
varying vec3 localN,worldN,worldP;
${mapping}
void main(){
 vec2 uv=mapUV(localN);vec3 n=normalize(worldN),s=normalize(sun),eye=normalize(cameraPosition-worldP);
 float mu=dot(n,s),day=max(mu,0.);vec3 albedo=sampleMap(dayMap,uv).rgb;
 vec3 color=albedo*(.002+1.15*day);
 if(detailed>.5){
  float clouds=sampleMap(cloudMap,uv).r*cloudAmount;
  color*=1.-clouds*.22;
  vec3 night=sampleMap(nightMap,uv).rgb;
  color+=night*2.3*(1.-smoothstep(-.15,.07,mu))*(1.-clouds*.85);
  float ocean=sampleMap(oceanMap,uv).r;
  float highlight=pow(max(0.,dot(reflect(-s,n),eye)),gloss);
  color+=vec3(1.,.91,.73)*ocean*highlight*day*.6;
 }
 gl_FragColor=vec4(color,1.);
 ${output}
}`;
const cloudFragment=`uniform sampler2D cloudMap;uniform vec3 sun;uniform float cloudAmount;
varying vec3 localN,worldN,worldP;${mapping}
void main(){float c=sampleMap(cloudMap,mapUV(localN)).r;
float mu=dot(normalize(worldN),normalize(sun));float light=max(mu,0.);
vec3 color=vec3(.9,.96,1.)*(.004+light*1.4);
gl_FragColor=vec4(color,clamp(c*cloudAmount,0.,.96));${output}}`;
// Thin single-scattering approximation. Clip integration at the solid Earth and
// suppress samples in Earth's geometric shadow; this is not a weather model.
const atmosphereFragment=`uniform vec3 sun;uniform int steps;
varying vec3 worldP;const float R=6371.;const float A=6461.;
vec2 sphereHit(vec3 o,vec3 d,float r){float b=dot(o,d),c=dot(o,o)-r*r,h=b*b-c;if(h<0.)return vec2(1e9,-1e9);h=sqrt(h);return vec2(-b-h,-b+h);}
void main(){
 vec3 o=cameraPosition,d=normalize(worldP-o),s=normalize(sun);vec2 a=sphereHit(o,d,A);
 float begin=max(0.,a.x),end=a.y;vec2 ground=sphereHit(o,d,R);
 if(ground.x>0.)end=min(end,ground.x);if(end<=begin)discard;
 float stepSize=(end-begin)/float(steps),density=0.;vec3 sum=vec3(0.);
 float phase=.75*(1.+pow(dot(d,s),2.));
 for(int i=0;i<16;i++){if(i>=steps)break;
  vec3 p=o+d*(begin+(float(i)+.5)*stepSize);float height=max(0.,length(p)-R);
  float rho=exp(-height/8.)*stepSize/80.;float mu=dot(normalize(p),s);
  float lit=step(0.,mu);if(mu<0.)lit=smoothstep(R-5.,R+15.,length(cross(p,s)));
  vec3 tint=mix(vec3(.95,.32,.12),vec3(.12,.40,1.),smoothstep(-.02,.15,mu));
  sum+=rho*lit*tint*phase;density+=rho;
 }
 float alpha=clamp(1.-exp(-density*.75),0.,.82);vec3 color=sum/max(density,.00001)*1.6;
 gl_FragColor=vec4(color,alpha);${output}
}`;

export class Environment{
 constructor(sim){
  this.sim=sim;this.api=sim.api;this.ticket=0;this.queue=Promise.resolve();this.textures=[];this.lastTrack=0;
  this.assets=JSON.parse($('environmentAssets').textContent);
  this.settings={quality:'medium',stars:true,milky:false,starLabels:false,clouds:true,cloudOpacity:.85,starBrightness:1,exposure:'view',groundTrack:false};
  try{const old=JSON.parse(localStorage.getItem('tiangong-environment-v1'));for(const k of ['stars','milky','starLabels','clouds','groundTrack'])if(typeof old?.[k]==='boolean')this.settings[k]=old[k];
   if(QUALITY[old?.quality])this.settings.quality=old.quality;if(['view','photo'].includes(old?.exposure))this.settings.exposure=old.exposure;
   for(const k of ['cloudOpacity','starBrightness'])if(Number.isFinite(old?.[k]))this.settings[k]=THREE.MathUtils.clamp(old[k],0,k==='cloudOpacity'?1:2);
  }catch{}
  this.fallback=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);this.fallback.needsUpdate=true;
  this.uniforms={dayMap:{value:this.fallback},nightMap:{value:this.fallback},cloudMap:{value:this.fallback},oceanMap:{value:this.fallback},sun:{value:V([1,0,0])},detailed:{value:0},cloudAmount:{value:0},gloss:{value:40}};
  this.earth=new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS,160,96),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:earthFragment}));
  sim.sky.add(this.earth);sim.earth=this.earth;
  this.clouds=new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS+7,160,96),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:cloudFragment,transparent:true,depthWrite:false}));this.clouds.renderOrder=2;sim.sky.add(this.clouds);
  this.atmosphere=new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS+90,128,64),new THREE.ShaderMaterial({uniforms:{sun:this.uniforms.sun,steps:{value:8}},vertexShader:vertex,fragmentShader:atmosphereFragment,transparent:true,depthWrite:false,depthTest:false,side:THREE.BackSide}));this.atmosphere.renderOrder=3;sim.sky.add(this.atmosphere);
  this.backdrop=new THREE.Scene();this.backdrop.background=new THREE.Color('#000104');
  this.starCamera=new THREE.PerspectiveCamera(38,1,.1,2000);
  this.buildStars();this.buildMilkyWay();
  this.track=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#ffc978',transparent:true,opacity:.85}));this.track.renderOrder=1;this.earth.add(this.track);
  this.groundMarker=new THREE.Mesh(new THREE.SphereGeometry(25,12,8),new THREE.MeshBasicMaterial({color:'#ffce80'}));this.earth.add(this.groundMarker);
  this.bind();this.ready=this.setQuality(this.settings.quality);this.bindImmersive();onLanguageChange(()=>this.translateStars());
 }
 buildStars(){
  const positions=[],colors=[],mags=[];this.labelGroup=new THREE.Group();this.backdrop.add(this.labelGroup);
  const names={91262:'织女星',97649:'牛郎星',102098:'天津四',11767:'北极星',32349:'天狼星'};
  for(const [id,ra,dec,mag,bv] of catalogue){const dir=V(equatorial(ra,dec));positions.push(...dir.clone().multiplyScalar(1000).toArray());mags.push(mag);
   const color=new THREE.Color(Number(bv)>.9?'#ffce9e':Number(bv)>.4?'#fff0dc':Number(bv)<.1?'#c0d7ff':'#e5ecff');colors.push(color.r,color.g,color.b);
   if(names[id]){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#bdd6e6';ctx.font='28px sans-serif';ctx.fillText(t(names[id]),6,44);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));sprite.position.copy(dir.multiplyScalar(990));sprite.scale.set(42,10.5,1);sprite.center.set(-.12,.5);sprite.userData.nameKey=names[id];this.labelGroup.add(sprite);
   }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('mag',new THREE.Float32BufferAttribute(mags,1));
  this.starUniforms={brightness:{value:1},pixelRatio:{value:1},high:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms:this.starUniforms,vertexColors:true,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:`attribute float mag;uniform float brightness,pixelRatio,high;varying vec3 tint;varying float flux;void main(){tint=color;flux=pow(10.,-.14*max(-1.,mag-1.))*brightness;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=(2.1+max(0.,5.-mag)*.55+high)*pixelRatio;}`,
   fragmentShader:`varying vec3 tint;varying float flux;uniform float high;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float a=exp(-r*r*5.)+high*.08*exp(-r*r);gl_FragColor=vec4(tint*flux*a,1.);#include <colorspace_fragment>}`.replace(';#include',';\n#include')
  });this.stars=new THREE.Points(geometry,material);this.stars.frustumCulled=false;this.stars.renderOrder=1;this.backdrop.add(this.stars);
 }
 translateStars(){
  for(const sprite of this.labelGroup.children){const map=sprite.material.map,canvas=map.image,ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#bdd6e6';ctx.font='28px sans-serif';ctx.fillText(t(sprite.userData.nameKey),6,44);map.needsUpdate=true;}
 }
 buildMilkyWay(){
  // StarSky Studio's artistic Galactic band, evaluated in fixed J2000 axes.
  this.milky=new THREE.Mesh(new THREE.SphereGeometry(1200,48,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{brightness:{value:1}},vertexShader:`varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`varying vec3 dir;uniform float brightness;void main(){vec3 p=normalize(dir);float b=asin(clamp(dot(p,vec3(-.867666149,-.198076373,.455983776)),-1.,1.));float l=atan(dot(p,vec3(.49410943,-.44482963,.74698224)),dot(p,vec3(-.05487556,-.87343709,-.48383502)));float wave=.55+.17*sin(l*13.+b*32.)+.12*sin(l*29.-b*71.)+.07*sin(l*63.+b*123.);float dust=1.-.65*exp(-pow((b-.022*sin(l*8.))/.032,2.))*(.6+.4*pow(sin(l*7.),2.));float band=exp(-pow(b/.13,2.))*(.55+.45*exp(-pow(l/.8,2.)))*wave*dust;gl_FragColor=vec4(vec3(.035,.041,.057)*band*brightness,1.);\n#include <colorspace_fragment>\n}` }));this.backdrop.add(this.milky);
 }
 save(){try{localStorage.setItem('tiangong-environment-v1',JSON.stringify(this.settings));}catch{}}
 bind(){
  const ids={stars:'showStars',milky:'showMilky',starLabels:'starNames',clouds:'showClouds',groundTrack:'groundTrack'};
  for(const [key,id] of Object.entries(ids)){$(id).checked=this.settings[key];$(id).onchange=()=>{this.settings[key]=$(id).checked;this.save();};}
  for(const [key,id] of [['cloudOpacity','cloudOpacity'],['starBrightness','starBrightness']]){$(id).value=this.settings[key];$(id).oninput=()=>{this.settings[key]=Number($(id).value);this.save();};}
  $('skyExposure').value=this.settings.exposure;$('skyExposure').onchange=()=>{this.settings.exposure=$('skyExposure').value;this.save();};
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
     t.colorSpace=['day','night'].includes(key)?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=Math.min(tier==='high'?8:2,this.api.renderer.capabilities.getMaxAnisotropy());loaded.push(t);return [key,t];
    }));
    const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
    if(ticket!==this.ticket){loaded.forEach(t=>t.dispose());return;}
    const textures=Object.fromEntries(results.map(r=>r.value));
    for(const [key,uniform] of Object.entries({day:'dayMap',night:'nightMap',cloud:'cloudMap',ocean:'oceanMap'}))this.uniforms[uniform].value=textures[key]||this.fallback;
    this.textures.forEach(t=>{t.dispose();t.image=null;});this.textures=loaded;this.quality=tier;this.settings.quality=tier;
    this.uniforms.detailed.value=tier==='simple'?0:1;this.uniforms.gloss.value=tier==='high'?90:40;
    this.atmosphere.material.uniforms.steps.value=QUALITY[tier].steps;
    const count=catalogue.filter(r=>r[3]<=QUALITY[tier].limit).length;this.stars.geometry.setDrawRange(0,count);this.starCount=count;
    this.api.renderer.setPixelRatio(Math.min(devicePixelRatio,QUALITY[tier].pixelRatio));this.api.resize();
    this.starUniforms.pixelRatio.value=this.api.renderer.getPixelRatio();this.starUniforms.high.value=tier==='high'?1:0;
    $('earthQuality').value=tier;setText('qualityStatus','{quality} · 地表 {size}K · {count} 颗恒星上限',{quality:QUALITY[tier].name,size:QUALITY[tier].width/1024,count:count.toLocaleString()});
    for(const id of ['showClouds','cloudOpacity','showMilky'])$(id).disabled=tier==='simple';this.save();
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
  const detailed=this.quality&&this.quality!=='simple',s=this.settings;
  this.clouds.quaternion.copy(this.earth.quaternion);this.clouds.visible=!!detailed&&s.clouds;
  this.uniforms.cloudAmount.value=detailed&&s.clouds?s.cloudOpacity:0;this.atmosphere.visible=!!detailed;
  this.stars.visible=s.stars;this.labelGroup.visible=s.stars&&s.starLabels;this.milky.visible=!!detailed&&s.stars&&s.milky;
  // The photographic option is an explicit display/exposure approximation.
  const boost=s.exposure==='photo'?.025:1;this.starUniforms.brightness.value=s.starBrightness*boost;this.milky.material.uniforms.brightness.value=s.starBrightness*boost;
  this.labelGroup.children.forEach(label=>label.material.opacity=Math.min(1,s.starBrightness));
  this.starCamera.quaternion.copy(camera.quaternion);this.starCamera.fov=camera.fov;this.starCamera.aspect=camera.aspect;this.starCamera.updateProjectionMatrix();
  this.track.visible=this.groundMarker.visible=s.groundTrack&&this.sim.view==='orbit'&&!!q;
  if(!q)return;
  const p=V(q.position).normalize().multiplyScalar(EARTH_RADIUS+28).applyQuaternion(this.earth.quaternion.clone().invert());this.groundMarker.position.copy(p);
  if(this.track.visible&&(this.trackData!==this.sim.data||Math.abs(q.t-this.lastTrack)>60000)){
   const points=[];
   for(let t=Math.max(this.sim.start,q.t-2800000);t<=Math.min(this.sim.end,q.t+2800000);t+=30000){
    const pos=V(interpolate(this.sim.data.rows,t).position),axes=earthAxes(t);const local=axes.map(a=>pos.dot(V(a)));points.push(...V(local).normalize().multiplyScalar(EARTH_RADIUS+12).toArray());
   }
   this.track.geometry.dispose();this.track.geometry=new THREE.BufferGeometry();this.track.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));this.lastTrack=q.t;this.trackData=this.sim.data;
  }
 }
 renderBackground(renderer){renderer.autoClear=true;renderer.render(this.backdrop,this.starCamera);renderer.autoClear=false;renderer.clearDepth();}
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
