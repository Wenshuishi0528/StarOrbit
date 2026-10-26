import * as THREE from 'three';
import {VIEW_UNITS_PER_METRE,validatePose} from './missions.js';
export function normalizeSpacecraft(asset,definition){
 if(definition.forwardAxis){
  const axis=name=>{const v=new THREE.Vector3();v[name.at(-1).toLowerCase()]=name[0]==='-'?-1:1;return v;};
  const z=axis(definition.forwardAxis),y=axis(definition.normalAxis),x=new THREE.Vector3().crossVectors(y,z);
  const orientation=new THREE.Matrix4().makeBasis(x,y,z).transpose();
  const wrapper=new THREE.Group();wrapper.add(asset);wrapper.quaternion.setFromRotationMatrix(orientation);asset=wrapper;
 }else if(definition.up==='Y')asset.rotation.x=Math.PI/2;
 asset.scale.setScalar(definition.metresPerUnit*VIEW_UNITS_PER_METRE);
 const root=new THREE.Group();root.add(asset);root.updateMatrixWorld(true);return root;
}
export function applyBodyPose(root,pose,spin=0){
 const p=validatePose(pose);
 // Active body rotation: Rz(yaw) Ry(pitch) Rx(roll), relative to the task frame.
 root.rotation.set(...[p.roll,p.pitch,p.yaw].map(THREE.MathUtils.degToRad),'ZYX');root.rotateZ(spin);root.updateMatrixWorld(true);
}
