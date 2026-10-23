import * as THREE from 'three';
import {solarAppearance,diskVisibility} from './sun-optics.js';
export const SUN_RADIANCE=16;
export class SunView{
 constructor(sim){
  this.sim=sim;this.projected=new THREE.Vector3();
  this.material=new THREE.ShaderMaterial({uniforms:{radiance:{value:SUN_RADIANCE}},transparent:true,depthWrite:false,vertexShader:'varying vec2 disk;void main(){disk=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 disk;uniform float radiance;void main(){float r=length(disk),edge=fwidth(r);float a=1.-smoothstep(1.-edge,1.+edge,r);if(a<=0.)discard;float limb=.55+.45*sqrt(max(0.,1.-r*r));gl_FragColor=vec4(vec3(radiance*limb),a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
  this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.mesh.renderOrder=1.8;sim.sky.add(this.mesh);
 }
 update(q,camera,enabled){
  const sim=this.sim,uniforms=sim.environment.hdr.material.uniforms;this.mesh.visible=enabled&&!!q;uniforms.sunGlow.value.set(0,0,0);
  if(!this.mesh.visible)return;
  const direction=new THREE.Vector3(...q.sunDir),distance=Math.hypot(...q.sun),table=sim.environment.opticalTable;
  if(!table){this.mesh.visible=false;return;}
  const appearance=solarAppearance(camera.position.toArray(),q.sunDir,distance,table);
  this.mesh.position.copy(camera.position).addScaledVector(direction,800000);this.mesh.quaternion.copy(camera.quaternion);this.mesh.scale.setScalar(800000*Math.tan(appearance.radius));
  const moon=sim.environment.moon?.mesh;
  let moonVisible=1;
  if(moon?.visible){const ray=moon.position.clone().sub(camera.position),distance=ray.length();moonVisible=diskVisibility(appearance.radius,Math.asin(Math.min(1,1737.4/distance)),Math.acos(THREE.MathUtils.clamp(ray.normalize().dot(direction),-1,1)));}
  // Sparse cloud probes cannot resolve a thin Earth/Moon occultation crescent.
  uniforms.sunOcclusionProbe.value=THREE.MathUtils.smoothstep(Math.min(appearance.visible,moonVisible),.98,1.);
  camera.updateMatrixWorld();this.projected.copy(this.mesh.position).project(camera);
  const front=direction.dot(camera.getWorldDirection(new THREE.Vector3()));
  if(front>0){uniforms.sunPosition.value.set(this.projected.x*.5+.5,this.projected.y*.5+.5);uniforms.sunRadius.value=Math.tan(appearance.radius)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*front);uniforms.sunGlow.value.fromArray(appearance.rgb).multiplyScalar(SUN_RADIANCE*moonVisible);}
  // The station can also receive reddened light at orbital sunrise. Power/orbit
  // calculations remain unchanged; this only updates the rendering light.
  const atStation=solarAppearance(q.position,q.sunDir,distance,table);
  sim.api.sunLight.color.setRGB(...atStation.rgb);sim.api.sunLight.intensity=3.4;
 }
}
