import * as THREE from 'three';
import {setText} from './i18n.js';
import {LunarEphemeris,MOON_RADIUS,lunarAppearance,moonBehindEarth} from './moon-math.js';
const V=a=>new THREE.Vector3(...a);
const vertex=`varying vec2 texUV;varying vec3 point,normalWorld;
void main(){texUV=uv;point=(modelMatrix*vec4(position,1.)).xyz;normalWorld=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*vec4(point,1.);}`;
const fragment=`uniform sampler2D surfaceMap;uniform bool textured;uniform vec3 sun;
varying vec2 texUV;varying vec3 point,normalWorld;
// Visible fraction of the finite solar disc, including Earth's umbra and penumbra.
float sunlight(vec3 s){vec3 e=-point;float a=asin(695700./length(s)),b=asin(6371./length(e));vec3 sn=normalize(s),en=normalize(e);float d=atan(length(cross(sn,en)),dot(sn,en));
if(d>=a+b)return 1.;if(d<=b-a)return 0.;if(d<=a-b)return 1.-b*b/(a*a);
float ca=clamp((d*d+a*a-b*b)/(2.*d*a),-1.,1.),cb=clamp((d*d+b*b-a*a)/(2.*d*b),-1.,1.);
float overlap=a*a*acos(ca)+b*b*acos(cb)-.5*sqrt(max(0.,(-d+a+b)*(d+a-b)*(d-a+b)*(d+a+b)));return clamp(1.-overlap/(3.14159265359*a*a),0.,1.);}
void main(){vec3 n=normalize(normalWorld),s=sun-point;float incidence=max(0.,dot(n,normalize(s))),emission=max(0.,dot(n,normalize(cameraPosition-point)));
vec3 albedo=textured?texture2D(surfaceMap,texUV).rgb:vec3(.28);
// Diffuse / Lommel-Seeliger blend: geometric phases without a painted phase mask.
float reflection=.6*incidence+.4*(2.*incidence/max(.0001,incidence+emission));
gl_FragColor=vec4(albedo*reflection*sunlight(s),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export class Moon{
 constructor(environment){
  this.env=environment;this.ephemeris=new LunarEphemeris();this.uniforms={surfaceMap:{value:environment.fallback},textured:{value:false},sun:{value:new THREE.Vector3()}};
  const geometry=new THREE.SphereGeometry(MOON_RADIUS,64,32);geometry.rotateX(Math.PI/2);
  this.mesh=new THREE.Mesh(geometry,new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment}));this.mesh.name='Moon';environment.sim.sky.add(this.mesh);
  this.ready=new THREE.TextureLoader().loadAsync(environment.assets.moon).then(tex=>{tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=THREE.RepeatWrapping;tex.anisotropy=Math.min(4,environment.api.renderer.capabilities.getMaxAnisotropy());this.texture=tex;this.uniforms.surfaceMap.value=tex;this.uniforms.textured.value=true;}).catch(()=>environment.api.toast('月面纹理未能加载'));
  document.getElementById('lookMoon').onclick=()=>this.savedView?this.returnToStation():this.look();
  document.getElementById('returnStation').onclick=()=>this.returnToStation();
 }
 update(q,camera){
  this.mesh.visible=!!q&&this.env.settings.moon;if(!this.mesh.visible)return;
  const state=this.ephemeris.at(q.t);this.mesh.position.fromArray(state.position);this.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...state.axes.map(V)));this.uniforms.sun.value.fromArray(q.sun);
  this.appearance=lunarAppearance(state.position,q.sun,camera.position.toArray());
 }
 look(){
  const sim=this.env.sim,q=sim.current;if(!q){this.env.api.toast('请先选择有效的轨道时间');return;}
  if(!this.savedView){const {camera,controls}=this.env.api;this.savedView={position:camera.position.clone(),target:controls.target.clone(),up:camera.up.clone(),fov:camera.fov,zoom:camera.zoom};}
  setText('lookMoon','返回航天器');
  this.env.settings.moon=true;document.getElementById('showMoon').checked=true;this.env.save();
  const position=this.ephemeris.at(q.t).position,observer=sim.spaceCamera.position.toArray(),direction=V(lunarAppearance(position,q.sun,observer).direction);
  const overview=sim.view==='orbit',camera=overview?sim.spaceCamera:this.env.api.camera,controls=overview?sim.orbitControls:this.env.api.controls;
  if(!overview){const d=direction.clone();direction.set(...q.basis.map(a=>d.dot(V(a))));}
  const distance=camera.position.distanceTo(controls.target);controls.target.copy(camera.position).addScaledVector(direction,distance);controls.update();
  if(moonBehindEarth(position,observer))this.env.api.toast('月球当前被地球遮挡');
 }
 returnToStation(){
  const {sim,api}=this.env,{camera,controls}=api;sim.setView('follow');
  if(this.savedView){const v=this.savedView;camera.position.copy(v.position);camera.up.copy(v.up);camera.fov=v.fov;camera.zoom=v.zoom;controls.target.copy(v.target);}
  else{const box=api.bounds(),center=box.getCenter(new THREE.Vector3()),radius=box.getSize(new THREE.Vector3()).length()/2;controls.target.copy(center);camera.up.set(0,0,1);camera.fov=38;camera.zoom=1;const fov=THREE.MathUtils.degToRad(camera.fov),half=Math.min(fov/2,Math.atan(Math.tan(fov/2)*camera.aspect));camera.position.copy(center).addScaledVector(new THREE.Vector3(1,-1,.6).normalize(),radius*1.15/Math.sin(half));}
  camera.updateProjectionMatrix();controls.stopMotion();const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;this.savedView=null;setText('lookMoon','望向月球');api.resize();
 }
}
