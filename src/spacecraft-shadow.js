import * as THREE from 'three';

// Bias is measured in shadow texels, so a station and a small imported satellite
// get the same self-shadow tolerance without moving their visible geometry.
export function fitSpacecraftShadow(light,bounds){
 const size=Math.max(bounds.getSize(new THREE.Vector3()).length(),1e-6),shadow=light.shadow,camera=shadow.camera;
 const extent=size*.65,distance=size*2;
 camera.left=camera.bottom=-extent;camera.right=camera.top=extent;
 camera.near=distance-size;camera.far=distance+size;camera.updateProjectionMatrix();
 const texel=2*extent/Math.min(shadow.mapSize.x,shadow.mapSize.y);
 shadow.normalBias=2.5*texel;
 shadow.bias=-texel/(camera.far-camera.near);
 light.target.position.copy(bounds.getCenter(new THREE.Vector3()));
 return distance;
}

// Reuse one shadow map while only the observer's camera moves. A quarter-texel
// angular threshold also avoids redrawing for subpixel changes in solar direction.
export class SpacecraftShadowCache{
 constructor(light){this.light=light;light.shadow.autoUpdate=false;this.direction=new THREE.Vector3();this.lastDirection=new THREE.Vector3();this.records=[];this.dirty=true;}
 reset(objects){this.records=[...new Set(objects.filter(Boolean))].map(object=>({object,matrix:object.matrixWorld.clone()}));this.dirty=true;}
 update(){
  const light=this.light,shadow=light.shadow;
  if(light.intensity*Math.max(light.color.r,light.color.g,light.color.b)<1e-6){shadow.needsUpdate=false;return false;}
  this.direction.subVectors(light.position,light.target.position).normalize();
  const tolerance=.65/Math.min(shadow.mapSize.x,shadow.mapSize.y);
  const changed=this.dirty||!shadow.map||this.direction.distanceToSquared(this.lastDirection)>tolerance*tolerance||this.records.some(r=>!r.matrix.equals(r.object.matrixWorld));
  if(!changed)return false;
  shadow.needsUpdate=true;this.dirty=false;this.lastDirection.copy(this.direction);
  for(const r of this.records)r.matrix.copy(r.object.matrixWorld);
  return true;
 }
}
