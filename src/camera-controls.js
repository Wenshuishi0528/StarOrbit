import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const Y_UP=new THREE.Vector3(0,1,0);
// Three r180 caches camera.up in OrbitControls' constructor. Mission, Moon,
// horizon and restored cameras can change it later: refresh that frame centrally.
export function createOrbitControls(camera,element){
 const controls=new OrbitControls(camera,element),update=controls.update.bind(controls),lastUp=camera.up.clone();
 controls.stopMotion=()=>{controls._sphericalDelta.set(0,0,0);controls._panOffset.set(0,0,0);controls._scale=1;};
 controls.update=(...args)=>{
  if(!lastUp.equals(camera.up)){
   camera.up.normalize();controls._quat.setFromUnitVectors(camera.up,Y_UP);controls._quatInverse.copy(controls._quat).invert();lastUp.copy(camera.up);
   controls.stopMotion();
  }
  return update(...args);
 };
 return controls;
}
