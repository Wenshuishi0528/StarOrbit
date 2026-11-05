import * as THREE from 'three';
import {earthHit,quadVertex} from './xuntian-view-shaders.js';

const SIDE=64;
const fragment=`precision highp float;varying vec2 film;
uniform sampler2D foreground;uniform vec3 center,east,north,rightAxis,upAxis,forwardAxis,eye;
uniform vec2 tangent,low;uniform float span; ${earthHit}
void main(){vec2 uv=low+span*(film*.5+.5);vec3 ray=normalize(center+east*uv.x+north*uv.y);
 float z=dot(ray,forwardAxis);if(z<=0.){gl_FragColor=vec4(0.,0.,0.,1.);return;}
 vec2 detector=vec2(dot(ray,rightAxis),dot(ray,upAxis))/(z*tangent);
 if(any(greaterThan(abs(detector),vec2(1.)))){gl_FragColor=vec4(0.,0.,0.,1.);return;}
 float station=clamp(texture2D(foreground,detector*.5+.5).a,0.,1.),behind=1.-station;
 bool earth=groundDistance(eye,ray)>=0.;
 gl_FragColor=vec4(earth?0.:behind,earth?behind:0.,station,0.);}`;
const v3=()=>({value:new THREE.Vector3()});
export function createSurveyProbe(quad){
 const u={foreground:{value:null},center:v3(),east:v3(),north:v3(),rightAxis:v3(),upAxis:v3(),forwardAxis:v3(),eye:v3(),
  tangent:{value:new THREE.Vector2()},low:{value:new THREE.Vector2()},span:{value:0}};
 const material=new THREE.ShaderMaterial({uniforms:u,vertexShader:quadVertex,fragmentShader:fragment,toneMapped:false,depthTest:false,depthWrite:false});
 const scene=new THREE.Scene(),mesh=new THREE.Mesh(quad,material),camera=new THREE.Camera();mesh.frustumCulled=false;scene.add(mesh);
 const target=new THREE.WebGLRenderTarget(SIDE,SIDE,{depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
 const bytes=new Uint8Array(SIDE*SIDE*4);
 return {measure(renderer,texture,frame,field){
  const tangent=Math.tan(frame.fovY*Math.PI/360);u.tangent.value.set(tangent*frame.aspect,tangent);
  u.foreground.value=texture;u.low.value.set(field.eastMin,field.northMin);u.span.value=field.span;
  for(const [key,dir] of Object.entries({center:field.field.center,east:field.field.east,north:field.field.north,rightAxis:frame.axes.right,upAxis:frame.axes.up,forwardAxis:frame.axes.forward,eye:frame.eyeKm}))u[key].value.fromArray(dir);
  renderer.setRenderTarget(target);renderer.render(scene,camera);
  renderer.readRenderTargetPixels(target,0,0,SIDE,SIDE,bytes);
  const sums=[0,0,0,0];for(let i=0;i<bytes.length;i+=4)for(let k=0;k<4;k++)sums[k]+=bytes[i+k];
  const total=SIDE*SIDE*255;
  if(Math.abs(sums.reduce((a,b)=>a+b,0)-total)>SIDE*SIDE)throw Error('巡天取景图像生成失败');
  return {sky:sums[0]/total,earth:sums[1]/total,station:sums[2]/total,outside:sums[3]/total,samples:SIDE*SIDE};
 },dispose(){material.dispose();target.dispose();}};
}
