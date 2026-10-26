import {dot,cross,unit} from './orbit.js';
const TAU=2*Math.PI;
export function velocityAxisBasis(state){
 const z=unit(state.velocity),y=unit(cross(state.position,state.velocity)),x=unit(cross(y,z));
 return [x,y,z];
}
export function spacecraftAttitude(q,reference=q){
 const basis=velocityAxisBasis(reference);
 return {...q,basis,sunLocal:basis.map(axis=>dot(axis,q.sunDir))};
}
export function validateRotation(value={},time=0,defaults={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('无效自旋设置');
 const x={mode:'prograde',enabled:defaults.enabled??false,phase:0,epoch:time,...value};
 if(!['prograde','inertial'].includes(x.mode)||typeof x.enabled!=='boolean'||!Number.isFinite(x.phase)||x.phase<0||x.phase>=TAU||!Number.isFinite(x.epoch)||Math.abs(x.epoch)>8.64e15)throw Error('无效自旋设置');
 return {mode:x.mode,enabled:x.enabled,phase:x.phase,epoch:x.epoch};
}
export function spinAngle(rotation,time,rpm){
 const turns=rotation.enabled?(time-rotation.epoch)/60000*rpm:0;
 return ((rotation.phase+(turns%1)*TAU)%TAU+TAU)%TAU;
}
export function toggleSpin(rotation,enabled,time,rpm){
 return {...rotation,phase:spinAngle(rotation,time,rpm),epoch:time,enabled};
}
