import * as THREE from 'three';
import data from '../assets/geography/atlas.json';
import {geographicVector,GeographyIndex} from './geography-math.js';
import {cityLabelEnabled} from './geography-settings.js';
import {placeSkyLabels} from './star-chart-math.js';
import {getLanguage,t} from './i18n.js';

const R=6374,CELL=40,FONT=26;
const kinds={country:'geoCountries',capital:'geoCapitals',city:'geoCities',marine:'geoMarine',landform:'geoLandforms',river:'geoRivers',lake:'geoLakes'};
const colors={country:'#f5e9c9',capital:'#ffffff',city:'#e5edf5',marine:'#b2e8ff',landform:'#efdcba',river:'#92d9ff',lake:'#92d9ff'};
const priority={country:.4,capital:.95,city:1.1,marine:.65,landform:.7,river:.9,lake:1.05};
const vertex=`attribute vec2 offset;attribute vec2 lifetime;attribute vec3 tint;
uniform vec2 viewport;uniform vec3 localCamera;uniform float clock;
varying vec2 texUV;varying vec3 color;varying float alpha;
void main(){float horizon=dot(normalize(position),localCamera)-6371.;
alpha=smoothstep(0.,35.,horizon)*smoothstep(lifetime.x,lifetime.x+.18,clock)*(1.-smoothstep(lifetime.y,lifetime.y+.18,clock));
color=tint;texUV=uv;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);p.xy+=offset*2./viewport*p.w;gl_Position=p;}`;
const fragment=`uniform sampler2D atlas;varying vec2 texUV;varying vec3 color;varying float alpha;
void main(){vec4 sampleColor=texture2D(atlas,texUV);float a=sampleColor.a*alpha;if(a<.005)discard;gl_FragColor=vec4(sampleColor.rgb*color,a);
#include <colorspace_fragment>
}`;
const lineVertex=`uniform vec3 localCamera;varying float horizon;
void main(){horizon=dot(normalize(position),localCamera)-6371.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const lineFragment=`uniform vec3 tint;uniform float opacity;varying float horizon;
void main(){float a=opacity*smoothstep(0.,40.,horizon);if(a<.005)discard;gl_FragColor=vec4(tint,a);
#include <colorspace_fragment>
}`;
function lineGeometry(paths){
 const points=[];
 for(const path of paths)for(let i=1;i<path.length;i++){
  const a=new THREE.Vector3(...geographicVector(...path[i-1],1)),b=new THREE.Vector3(...geographicVector(...path[i],1));
  const steps=Math.max(1,Math.ceil(a.angleTo(b)/THREE.MathUtils.degToRad(.5)));
  // Spherical subdivision keeps long simplified segments above Earth's surface.
  for(let j=0;j<steps;j++)for(const n of [j,j+1])points.push(...a.clone().lerp(b,n/steps).normalize().multiplyScalar(R).toArray());
 }
 return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3));
}
export class Geography{
 constructor(env){
  this.env=env;this.group=new THREE.Group();this.group.visible=false;env.earth.add(this.group);
  this.items=data.labels.map(p=>({...p,key:p.id,position:new THREE.Vector3(...geographicVector(p.lon,p.lat))}));
  this.shown=new Map();this.glyphs=new Map();this.lines={};this.lastKey='';this.lastLayout=-Infinity;
  this.lastPosition=new THREE.Vector3(Infinity,0,0);this.lastQuaternion=new THREE.Quaternion();this.lastEarth=new THREE.Quaternion();this.lastLocation=-Infinity;
  this.modelRecords=[];
  this.uniforms={atlas:{value:null},viewport:{value:new THREE.Vector2()},localCamera:{value:new THREE.Vector3()},clock:{value:0}};
  this.stats={layouts:0,uploads:0,atlasBuilds:0,lookups:0,visible:0,candidates:0};
 }
 ensureGeometry(){
  if(this.labels)return;
  this.labels=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));this.labels.renderOrder=6;this.labels.frustumCulled=false;this.group.add(this.labels);
 }
 ensureLines(tier){
  if(this.lineTier===tier)return;this.lineTier=tier;
  for(const key of Object.keys(data.lines)){
   const color=['rivers','lakes'].includes(key)?'#8cd9f7':key==='china'||key==='offshore'?'#f5d7a0':'#e3d9bf';
   if(!this.lines[key]){
    const uniforms={localCamera:this.uniforms.localCamera,tint:{value:new THREE.Color(color)},opacity:{value:key==='china'||key==='offshore'?.75:.45}};
    const line=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.ShaderMaterial({uniforms,vertexShader:lineVertex,fragmentShader:lineFragment,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));line.renderOrder=5;line.frustumCulled=false;this.group.add(line);this.lines[key]=line;
   }
   this.lines[key].geometry.dispose();this.lines[key].geometry=lineGeometry(data.lines[key][tier]);
  }
 }
 ensureAtlas(language){
  if(this.language===language)return;
  const chars=[...new Set(this.items.flatMap(x=>[...(x[language]||x.en)])),'★','●'];
  const unique=[...new Set(chars)],side=2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(unique.length))*CELL)),canvas=document.createElement('canvas');canvas.width=canvas.height=side;
  const ctx=canvas.getContext('2d');ctx.font=`500 ${FONT}px sans-serif`;ctx.textBaseline='alphabetic';ctx.lineJoin='round';ctx.lineWidth=3;this.glyphs.clear();
  const columns=Math.floor(side/CELL);
  unique.forEach((char,i)=>{
   const x=i%columns*CELL,y=Math.floor(i/columns)*CELL;
   ctx.strokeStyle='#101c28';ctx.fillStyle='white';
   if(char==='★'||char==='●'){
    ctx.beginPath();
    if(char==='●')ctx.arc(x+20,y+20,10,0,Math.PI*2);
    else for(let j=0;j<10;j++){const angle=-Math.PI/2+j*Math.PI/5,r=j%2?7:17,px=x+20+Math.cos(angle)*r,py=y+20+Math.sin(angle)*r;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();ctx.fill();
   }else{ctx.strokeText(char,x+5,y+30);ctx.fillText(char,x+5,y+30);}
   this.glyphs.set(char,{x,y,advance:ctx.measureText(char).width});
  });
  this.texture?.dispose();this.texture=new THREE.CanvasTexture(canvas);this.texture.generateMipmaps=false;this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;this.uniforms.atlas.value=this.texture;this.atlasSide=side;this.language=language;this.shown.clear();this.lastKey='';this.stats.atlasBuilds++;
 }
 updateLocation(q,now,language){
  const el=document.getElementById('minimapLocation'),active=this.env.settings.geographyEnabled&&this.env.settings.geoLocation&&q;
  el.hidden=!active;if(!active)return;
  const positionKey=q.latitude.toFixed(4)+'|'+q.longitude.toFixed(4);
  if(language===this.locationLanguage&&positionKey===this.locationKey)return;
  if(language===this.locationLanguage&&now-this.lastLocation<.35)return;
  this.index??=new GeographyIndex(data);this.location=this.index.locate(q.longitude,q.latitude);this.stats.lookups++;this.lastLocation=now;this.locationKey=positionKey;this.locationLanguage=language;
  const found=this.location,name=x=>x?.[language]||x?.en;
  const main=name(found?.country)||name(found?.physical)||t('海洋');
  const detail=found?.nearby?t('{name}附近',{name:name(found.nearby)}):found?.country?name(found.physical):null;
  el.textContent=t('当前上空：{place}',{place:main+(detail?' · '+detail:'')});
 }
 update(q,camera){
  const s=this.env.settings,now=performance.now()/1000,language=getLanguage();this.updateLocation(q,now,language);
  this.group.visible=!!s.geographyEnabled&&!!q;
  const follow=this.env.sim.view==='follow',records=this.env.sim.shadowCache.records;
  if((!this.group.visible||!follow)&&this.modelSource){this.modelSource=null;this.modelRecords=[];}
  // The sky chart and globe layer share the acceleration cache, but an inactive
  // pair must not keep the previous spacecraft alive through its mesh list.
  if((!this.group.visible||!follow)&&!this.env.starChart.group.visible)this.env.starChart.occluders=null;
  if(!this.group.visible)return;
  this.ensureGeometry();this.ensureAtlas(language);
  const width=this.env.api.stage.clientWidth,height=this.env.api.stage.clientHeight,earthQ=this.env.earth.quaternion;
  const localCamera=camera.position.clone().applyQuaternion(earthQ.clone().invert());this.uniforms.localCamera.value.copy(localCamera);this.uniforms.viewport.value.set(width,height);this.uniforms.clock.value=now;
  const focal=height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*camera.zoom,projectedRadius=focal*6371/localCamera.length();
  const tier=this.lineTier==='fine'?(projectedRadius<260?'coarse':'fine'):(projectedRadius>340?'fine':'coarse');
  this.ensureLines(tier);
  for(const [key,line]of Object.entries(this.lines))line.visible=['borders','china','offshore'].includes(key)?s.geoBorders:key==='rivers'?s.geoRivers:s.geoLakes;
  const hudKey=['telemetry','orbitMinimap','eventTimeline','orbitEventDetail'].map(id=>{const el=document.getElementById(id);return [el.hidden,el.className,el.style.display].join(',');}).join('|');
  const key=[language,width,height,camera.fov,camera.zoom,...Object.keys(kinds).map(k=>s[kinds[k]]),s.geoCityTier,s.geoDensity,this.env.sim.view,hudKey,document.body.className].join('|');
  const moved=camera.position.distanceToSquared(this.lastPosition)>1e-6||1-Math.abs(camera.quaternion.dot(this.lastQuaternion))>1e-12||1-Math.abs(earthQ.dot(this.lastEarth))>1e-12;
  const modelMoved=follow&&(this.modelSource!==records||this.modelRecords.some(r=>!r.matrix.equals(r.object.matrixWorld)));
  const fading=[...this.shown.values()].some(p=>p.out!==undefined);
  if(key===this.lastKey&&(!moved&&!modelMoved&&!fading||now-this.lastLayout<.2))return;
  this.lastKey=key;this.lastPosition.copy(camera.position);this.lastQuaternion.copy(camera.quaternion);this.lastEarth.copy(earthQ);this.lastLayout=now;this.stats.layouts++;
  const candidates=[],maxRank=Math.max(1,Math.min(6,Math.log2(Math.max(1,projectedRadius/90))+s.geoDensity*3));
  const chart=this.env.starChart;if(follow){chart.prepareOccluders();this.modelSource=records;this.modelRecords=records.map(r=>({object:r.object,matrix:r.object.matrixWorld.clone()}));}
  for(const p of this.items){
   const city=p.kind==='capital'||p.kind==='city';
   if(!(city?cityLabelEnabled(p,s):s[kinds[p.kind]])||p.rank>maxRank||p.position.dot(localCamera)/R<=6371)continue;
   const world=p.position.clone().applyQuaternion(earthQ),screen=world.clone().project(camera);
   if(screen.z<-1||screen.z>1||Math.abs(screen.x)>1||Math.abs(screen.y)>1)continue;
   const text=p[language]||p.en,font=p.kind==='country'?15:p.kind==='marine'?14:13,scale=font/FONT;
   const w=[...text].reduce((n,c)=>n+this.glyphs.get(c).advance*scale,0);
   candidates.push({...p,text,font,w:w+4,h:font+8,x:(screen.x+1)*width/2,y:(1-screen.y)*height/2,centered:!city,priority:p.id==='beijing'?-2:priority[p.kind]+p.rank*.2,dir:world.sub(camera.position).normalize()});
  }
  candidates.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));this.stats.candidates=candidates.length;
  const stageBox=this.env.api.stage.getBoundingClientRect(),reserved=[];
  for(const id of ['telemetry','orbitMinimap','eventTimeline','orbitEventDetail']){const el=document.getElementById(id),box=el.getBoundingClientRect();if(!el.hidden&&box.width&&box.height&&getComputedStyle(el).visibility!=='hidden')reserved.push({x:box.x-stageBox.x,y:box.y-stageBox.y,w:box.width,h:box.height});}
  const placed=placeSkyLabels(candidates,width,height,s.geoDensity,reserved).filter(p=>!follow||!chart.hiddenBySpacecraft(p.dir));this.stats.visible=placed.length;
  const next=new Map(placed.map(p=>[p.id,{...p,born:this.shown.get(p.id)?.out===undefined?this.shown.get(p.id)?.born??now:now}]));
  for(const [id,prev]of this.shown)if(!next.has(id)){const out=prev.out??now;if(now-out<.18)next.set(id,{...prev,out});}
  const signature=[...next.values()].map(p=>[p.id,p.dx,p.dy,p.out??'',p.born].join(',')).join(';');this.shown=next;
  if(signature===this.geometryKey)return;this.geometryKey=signature;this.upload();
 }
 upload(){
  const arrays={position:[],offset:[],uv:[],tint:[],lifetime:[]},indices=[0,1,2,0,2,3];
  const quad=(label,g,x0,y0,size,color)=>{
   const xy=[[x0,y0],[x0+size,y0],[x0+size,y0+size],[x0,y0+size]],uv=[[g.x/this.atlasSide,1-(g.y+CELL)/this.atlasSide],[(g.x+CELL)/this.atlasSide,1-(g.y+CELL)/this.atlasSide],[(g.x+CELL)/this.atlasSide,1-g.y/this.atlasSide],[g.x/this.atlasSide,1-g.y/this.atlasSide]];
   for(const i of indices){arrays.position.push(...label.position.toArray());arrays.offset.push(...xy[i]);arrays.uv.push(...uv[i]);arrays.tint.push(color.r,color.g,color.b);arrays.lifetime.push(label.born,label.out??1e12);}
  };
  for(const label of this.shown.values()){
   let pen=label.dx;const scale=label.font/FONT,color=new THREE.Color(colors[label.kind]);
   for(const char of label.text){const g=this.glyphs.get(char);quad(label,g,pen-5*scale,-label.dy-30*scale,CELL*scale,color);pen+=g.advance*scale;}
   if(label.kind==='capital'||label.kind==='city'){const star=label.id==='beijing',size=star?18:label.kind==='capital'?10:7;quad(label,this.glyphs.get(star?'★':'●'),-size/2,-size/2,size,new THREE.Color(star?'#ff3434':'#ffffff'));}
  }
  const geometry=new THREE.BufferGeometry();for(const [key,size]of Object.entries({position:3,offset:2,uv:2,tint:3,lifetime:2}))geometry.setAttribute(key,new THREE.Float32BufferAttribute(arrays[key],size));
  this.labels.geometry.dispose();this.labels.geometry=geometry;this.stats.uploads++;
 }
}
