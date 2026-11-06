import {Quaternion,Vector3} from 'three';

export const MAIN_ATTITUDE_MODES=Object.freeze([
 {id:'inertial',name:'惯性保持'},
 {id:'prograde',name:'顺行'},{id:'retrograde',name:'逆行'},
 {id:'radial-out',name:'径向朝天'},{id:'radial-in',name:'径向朝地'},
 {id:'normal',name:'轨道法向 +'},{id:'anti-normal',name:'轨道法向 −'},
 {id:'target',name:'朝向目标'},{id:'anti-target',name:'背向目标'},
].map(Object.freeze));

const finite=(v,size)=>Array.isArray(v)&&v.length===size&&v.every(Number.isFinite);
const V=a=>new Vector3().fromArray(a);
const unit=v=>v.lengthSq()>1e-20?v.normalize().toArray():null;

/** J2000/inertial direction from the craft's effective geocentric state.
 * Position and targetPosition share km; velocity is km/s. A task's rendered
 * basis is deliberately irrelevant to these physical orbital directions. */
export function mainAttitudeDirection(mode,snapshot,targetPosition=null){
 if(!finite(snapshot?.position,3)||!finite(snapshot?.velocity,3))return null;
 const position=V(snapshot.position),velocity=V(snapshot.velocity);
 if(mode==='prograde'||mode==='retrograde')return unit(velocity.multiplyScalar(mode==='prograde'?1:-1));
 if(mode==='radial-out'||mode==='radial-in')return unit(position.multiplyScalar(mode==='radial-out'?1:-1));
 if(mode==='normal'||mode==='anti-normal')return unit(position.cross(velocity).multiplyScalar(mode==='normal'?1:-1));
 if((mode==='target'||mode==='anti-target')&&finite(targetPosition,3))return unit(V(targetPosition).sub(position).multiplyScalar(mode==='target'?1:-1));
 return null;
}

/** Point the actual model nose through the shortest rotation. Do not impose
 * an unrelated roll attitude: station/XT use +X forward, standalone spacecraft
 * use +Z. At exactly 180 degrees the craft's current up axis resolves the
 * otherwise ambiguous turn without a world-axis-dependent roll flip. */
export function mainAttitudeTargetQuaternion(orientation,direction,{assembly=true}={}){
 if(!finite(orientation,4)||!finite(direction,3)||Math.hypot(...orientation)<1e-12||Math.hypot(...direction)<1e-12)return null;
 const current=new Quaternion().fromArray(orientation).normalize();
 const forward=new Vector3(...(assembly?[1,0,0]:[0,0,1])).applyQuaternion(current),wanted=V(direction).normalize();
 const turn=forward.dot(wanted)<-1+1e-12
  ?new Quaternion().setFromAxisAngle(new Vector3(...(assembly?[0,0,1]:[-1,0,0])).applyQuaternion(current),Math.PI)
  :new Quaternion().setFromUnitVectors(forward,wanted);
 return turn.multiply(current).normalize().toArray();
}
