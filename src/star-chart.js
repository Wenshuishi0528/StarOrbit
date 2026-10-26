import * as THREE from 'three';
import {computeBoundsTree} from 'three-mesh-bvh';
import data from '../assets/star-chart.json';
import {equatorial,QUALITY} from './environment-math.js';
import {getLanguage} from './i18n.js';
import {placeSkyLabels,sphereHidesDirection} from './star-chart-math.js';

const RADIUS=1000,EARTH=6371,MOON=1737.4,CELL=32,FONT=24;
const vector=(ra,dec)=>new THREE.Vector3(...equatorial(ra,dec));
const vertex=`attribute vec2 offset;attribute vec2 lifetime;attribute vec3 tint;
uniform vec2 viewport;uniform float clock;uniform vec4 earthDisc,moonDisc;
varying vec2 texUV;varying vec3 color;varying float alpha;
void main(){vec3 dir=normalize(position);bool hidden=dot(dir,earthDisc.xyz)>earthDisc.w||dot(dir,moonDisc.xyz)>moonDisc.w;
alpha=hidden?0.:smoothstep(lifetime.x,lifetime.x+.18,clock)*(1.-smoothstep(lifetime.y,lifetime.y+.18,clock));
color=tint;texUV=uv;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);p.xy+=offset*2./viewport*p.w;gl_Position=p;}`;
const fragment=`uniform sampler2D atlas;uniform float brightness;varying vec2 texUV;varying vec3 color;varying float alpha;
void main(){float a=texture2D(atlas,texUV).a*alpha*brightness;if(a<.005)discard;gl_FragColor=vec4(color,a);
#include <colorspace_fragment>
}`;
function lineGeometry(paths,trim){
 const points=[];
 for(const path of paths)for(let i=1;i<path.length;i++){
  let a=vector(...path[i-1]),b=vector(...path[i]),angle=a.angleTo(b);if(angle<1e-8)continue;
  const interpolate=t=>a.clone().multiplyScalar(Math.sin((1-t)*angle)).addScaledVector(b,Math.sin(t*angle)).divideScalar(Math.sin(angle)).normalize();
  const end=Math.min(trim/angle,.15),steps=Math.max(1,Math.ceil(angle/THREE.MathUtils.degToRad(2)));
  for(let j=0;j<steps;j++)points.push(...interpolate(end+(1-2*end)*j/steps).multiplyScalar(RADIUS).toArray(),...interpolate(end+(1-2*end)*(j+1)/steps).multiplyScalar(RADIUS).toArray());
 }
 return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3));
}
export class StarChart{
 constructor(env){
  this.env=env;this.group=new THREE.Group();this.group.visible=false;env.backdrop.add(this.group);
  this.stars=data.stars.map(s=>({...s,key:'star-'+s.id,dir:vector(s.ra,s.dec)}));
  this.constellations=data.constellations.flatMap(c=>(c.labelPositions||[[c.ra,c.dec]]).map(([ra,dec],i)=>({...c,key:'const-'+c.id+'-'+i,dir:vector(ra,dec),kind:'constellation'})));
  this.classic=this.stars.filter(s=>[91262,97649,11767].includes(s.id));
  this.uniforms={atlas:{value:null},viewport:{value:new THREE.Vector2(1,1)},clock:{value:0},brightness:{value:1},earthDisc:{value:new THREE.Vector4(0,0,0,2)},moonDisc:{value:new THREE.Vector4(0,0,0,2)}};
  this.glyphs=new Map();this.shown=new Map();this.lastQuaternion=new THREE.Quaternion();this.lastPosition=new THREE.Vector3(Infinity,0,0);this.lastMoon=new THREE.Vector3(Infinity,0,0);this.lastLayout=-Infinity;this.lastKey='';
  this.modelRecords=[];this.occluderCache=new WeakMap();this.raycaster=new THREE.Raycaster();this.raycaster.firstHitOnly=true;this.hits=[];
  this.stats={layouts:0,uploads:0,atlasBuilds:0,candidates:0,visible:0};
 }
 ensureGeometry(){
  if(this.labels)return;
  this.lines=new THREE.LineSegments(lineGeometry(data.constellations.flatMap(c=>c.lines),THREE.MathUtils.degToRad(.08)),new THREE.LineBasicMaterial({color:'#7fabc3',transparent:true,opacity:.35,depthTest:false,depthWrite:false,toneMapped:false}));
  this.boundaries=new THREE.LineSegments(lineGeometry(data.boundaries,0),new THREE.LineDashedMaterial({color:'#b2a0ce',transparent:true,opacity:.24,dashSize:1.5,gapSize:1,depthTest:false,depthWrite:false,toneMapped:false}));this.boundaries.computeLineDistances();
  this.labels=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));this.labels.frustumCulled=false;this.labels.renderOrder=3;
  this.lines.renderOrder=this.boundaries.renderOrder=1.5;this.group.add(this.lines,this.boundaries,this.labels);
 }
 ensureAtlas(language){
  if(this.language===language)return;
  const labels=[...this.stars,...this.constellations,...this.classic],chars=[...new Set(labels.flatMap(s=>[...(s[language]||s.en||s.zh)]))];
  const side=2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(chars.length))*CELL)),canvas=document.createElement('canvas');canvas.width=canvas.height=side;
  const ctx=canvas.getContext('2d');ctx.font=`500 ${FONT}px sans-serif`;ctx.textBaseline='alphabetic';ctx.fillStyle='white';this.glyphs.clear();
  chars.forEach((char,i)=>{const x=(i%(side/CELL))*CELL,y=Math.floor(i/(side/CELL))*CELL;ctx.fillText(char,x+3,y+25);this.glyphs.set(char,{x,y,advance:ctx.measureText(char).width});});
  this.texture?.dispose();this.texture=new THREE.CanvasTexture(canvas);this.texture.generateMipmaps=false;this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;this.uniforms.atlas.value=this.texture;this.atlasSide=side;this.language=language;this.shown.clear();this.lastKey='';this.stats.atlasBuilds++;
 }
 setDisc(uniform,center,radius){const length=center.length();if(length<=radius){uniform.set(0,0,0,-1);return;}uniform.set(center.x/length,center.y/length,center.z/length,Math.sqrt(1-radius*radius/(length*length)));}
 prepareOccluders(){
  this.occluders=[];this.occluderBox=new THREE.Box3();
  for(const root of Object.values(this.env.sim.missions.activeGroups()))root?.traverseVisible(mesh=>{
   if(!mesh.isMesh)return;
   let record=this.occluderCache.get(mesh);
   if(!record){mesh.geometry.computeBoundingBox();record={mesh,box:new THREE.Box3(),matrix:new THREE.Matrix4().makeScale(0,0,0)};this.occluderCache.set(mesh,record);}
   if(!record.matrix.equals(mesh.matrixWorld)){record.matrix.copy(mesh.matrixWorld);record.box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);}
   this.occluders.push(record);this.occluderBox.union(record.box);
  });
 }
 hiddenBySpacecraft(direction){
  const {sim,api}=this.env;if(sim.view!=='follow'||!sim.current)return false;
  const local=new THREE.Vector3(...sim.current.basis.map(axis=>direction.x*axis[0]+direction.y*axis[1]+direction.z*axis[2]));
  const ray=this.raycaster;ray.set(api.camera.position,local);ray.near=api.camera.near;ray.far=api.camera.far;
  if(!ray.ray.intersectsBox(this.occluderBox))return false;
  for(const record of this.occluders){
   if(!ray.ray.intersectsBox(record.box))continue;
   const mesh=record.mesh,geometry=mesh.geometry;
   // Imported high-detail models share one lazy BVH per static geometry.
   // Root rotation/spin changes the ray transform, so the tree stays reusable.
   if(!geometry.boundsTree&&!mesh.isSkinnedMesh&&!Object.keys(geometry.morphAttributes).length&&(geometry.index?.count||geometry.attributes.position.count)>6144)computeBoundsTree.call(geometry);
   this.hits.length=0;ray.intersectObject(mesh,false,this.hits);if(this.hits.length)return true;
  }
  return false;
 }
 update(camera){
  const s=this.env.settings,active=s.stars&&s.starChartEnabled&&s.starBrightness>0;
  this.group.visible=active;
  if((!active||this.env.sim.view!=='follow')&&this.modelSource){this.modelSource=null;this.modelRecords=[];this.occluders=null;}
  if(!active)return;
  this.ensureGeometry();const classic=s.starLabelScope==='classic';
  this.lines.visible=!classic&&s.constellationLines;this.boundaries.visible=!classic&&s.constellationBoundaries;this.labels.visible=s.starLabels||(!classic&&s.constellationNames);
  const brightness=Math.min(1,s.starBrightness);this.lines.material.opacity=.35*brightness;this.boundaries.material.opacity=.24*brightness;
  if(!this.labels.visible)return;
  const language=getLanguage(),now=performance.now()/1000,width=this.env.api.stage.clientWidth,height=this.env.api.stage.clientHeight;
  this.ensureAtlas(language);this.uniforms.viewport.value.set(width,height);this.uniforms.clock.value=now;this.uniforms.brightness.value=brightness;
  const earth=camera.position.clone().negate(),moon=this.env.moon.mesh.position.clone().sub(camera.position),hasMoon=this.env.moon.mesh.visible;
  this.setDisc(this.uniforms.earthDisc.value,earth,EARTH);if(hasMoon)this.setDisc(this.uniforms.moonDisc.value,moon,MOON);else this.uniforms.moonDisc.value.set(0,0,0,2);
  const sim=this.env.sim,records=sim.shadowCache.records,follow=sim.view==='follow';
  const modelMoved=follow&&(this.modelSource!==records||this.modelRecords.some(r=>!r.matrix.equals(r.object.matrixWorld)));
  const key=[language,width,height,camera.fov,camera.zoom,s.starLabels,s.starLabelScope,s.constellationNames,s.starLabelDensity,this.env.quality,s.exposure,hasMoon,follow].join('|');
  const changed=key!==this.lastKey;
  const moved=1-Math.abs(camera.quaternion.dot(this.lastQuaternion))>1e-12||camera.position.distanceToSquared(this.lastPosition)>1e-6||(hasMoon&&this.env.moon.mesh.position.distanceToSquared(this.lastMoon)>1e-6);
  if(!changed&&(!(moved||modelMoved)||now-this.lastLayout<.2))return;
  if(follow&&(modelMoved||!this.occluders))this.prepareOccluders();
  if(follow){this.modelSource=records;this.modelRecords=records.map(r=>({object:r.object,matrix:r.object.matrixWorld.clone()}));}
  this.lastLayout=now;this.lastKey=key;this.lastQuaternion.copy(camera.quaternion);this.lastPosition.copy(camera.position);this.lastMoon.copy(this.env.moon.mesh.position);this.stats.layouts++;
  const inverse=camera.quaternion.clone().invert(),halfV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/camera.zoom,halfH=halfV*camera.aspect,limit=s.exposure==='cinematic'?8:QUALITY[this.env.quality||'medium'].limit;
  const candidates=[],source=s.starLabels?(classic?this.classic:this.stars.filter(star=>(s.starLabelScope==='all'||star.major)&&star.mag<=limit)):[];
  if(!classic&&s.constellationNames)source.push(...this.constellations);
  for(const item of source){
   const projected=item.dir.clone().applyQuaternion(inverse);if(projected.z>=0)continue;
   const x=projected.x/-projected.z/halfH,y=projected.y/-projected.z/halfV;if(Math.abs(x)>1||Math.abs(y)>1)continue;
   if(sphereHidesDirection(item.dir.toArray(),earth.toArray(),EARTH)||hasMoon&&sphereHidesDirection(item.dir.toArray(),moon.toArray(),MOON))continue;
   const text=item[language]||item.en||item.zh,font=item.kind==='constellation'?14:13,scale=font/FONT;
   const w=[...text].reduce((n,c)=>n+this.glyphs.get(c).advance*scale,0);
   candidates.push({...item,text,font,w:w+4,h:font+7,x:(x+1)*width/2,y:(1-y)*height/2,centered:item.kind==='constellation',priority:item.kind==='constellation'?1.7:item.mag??1});
  }
  candidates.sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key));this.stats.candidates=candidates.length;
  const placed=placeSkyLabels(candidates,width,height,s.starLabelDensity).filter(p=>!this.hiddenBySpacecraft(p.dir));this.stats.visible=placed.length;
  const next=new Map(placed.map(p=>[p.key,{...p,born:this.shown.get(p.key)?.out===undefined?this.shown.get(p.key)?.born??now:now}]));
  for(const [key,previous]of this.shown)if(!next.has(key)){const out=previous.out??now;if(now-out<.18)next.set(key,{...previous,out});}
  const signature=[...next.values()].map(p=>[p.key,p.dx,p.dy,p.out??'',p.born].join(',')).join(';');
  this.shown=next;if(signature===this.geometryKey)return;this.geometryKey=signature;this.upload();
 }
 upload(){
  const positions=[],offsets=[],uvs=[],colors=[],lifetimes=[],indices=[0,1,2,0,2,3];
  for(const label of this.shown.values()){
   let pen=label.dx;const scale=label.font/FONT,color=new THREE.Color(label.kind==='constellation'?'#d0c09a':'#c8dce8');
   for(const char of label.text){
    const g=this.glyphs.get(char),x0=pen-3*scale,x1=x0+CELL*scale,y0=-label.dy-25*scale,y1=y0+CELL*scale;
    const xy=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],uv=[[g.x/this.atlasSide,1-(g.y+CELL)/this.atlasSide],[(g.x+CELL)/this.atlasSide,1-(g.y+CELL)/this.atlasSide],[(g.x+CELL)/this.atlasSide,1-g.y/this.atlasSide],[g.x/this.atlasSide,1-g.y/this.atlasSide]];
    for(const i of indices){positions.push(...label.dir.clone().multiplyScalar(RADIUS).toArray());offsets.push(...xy[i]);uvs.push(...uv[i]);colors.push(color.r,color.g,color.b);lifetimes.push(label.born,label.out??1e12);}pen+=g.advance*scale;
   }
  }
  const geometry=new THREE.BufferGeometry();for(const [name,array,size]of [['position',positions,3],['offset',offsets,2],['uv',uvs,2],['tint',colors,3],['lifetime',lifetimes,2]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,size));
  this.labels.geometry.dispose();this.labels.geometry=geometry;this.stats.uploads++;
 }
}
