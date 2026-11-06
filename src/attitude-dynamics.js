import {Quaternion,Vector3} from 'three';

const vector=a=>new Vector3().fromArray(a);
const quaternion=a=>new Quaternion().fromArray(a).normalize();
const limit=(v,max)=>v.length()>max?v.setLength(max):v;

/** Spherical-inertia teaching model. Commands apply bounded torque; no hidden
 * drag. SAS brakes at the available acceleration, then captures an inertial
 * heading. An explicit target is used by the existing docking pilot aids. */
export function stepAttitudeDynamics(state,rotation,{dt=.04,sas=true,acceleration=.08,maxRate=.35,target=null}={}){
 const orientation=quaternion(state.quaternion),before=vector(state.angularVelocity);
 const input=limit(vector(rotation),1),manual=input.lengthSq()>1e-14;
 let rate=before.clone(),sasTarget=state.sasTarget??null,phase='coast';
 if(manual){
  rate.addScaledVector(input,acceleration*dt);
  // The rate setting belongs to assisted control. With SAS off, bounded
  // torque keeps accumulating angular momentum for as long as it is applied.
  // Engaging SAS never clips a pre-existing faster spin instantaneously.
  if(sas)limit(rate,Math.max(maxRate,before.length()));sasTarget=null;phase='manual';
 }else if(sas||target){
  let wanted=new Vector3();
  const aim=target??sasTarget;
  if(aim){
   const error=orientation.clone().invert().multiply(quaternion(aim));
   const sign=error.w<0?-1:1,axis=new Vector3(error.x,error.y,error.z).multiplyScalar(sign);
   const angle=2*Math.atan2(axis.length(),Math.abs(error.w));
   if(axis.lengthSq()>1e-20)wanted=axis.setLength(Math.min(maxRate,angle*1.8,Math.sqrt(1.4*acceleration*angle)));
   phase='hold';
  }else phase='braking';
  rate.add(limit(wanted.sub(rate),acceleration*dt));
 }else sasTarget=null;
 const middle=before.clone().add(rate).multiplyScalar(.5),angle=middle.length()*dt;
 if(angle>1e-14)orientation.multiply(new Quaternion().setFromAxisAngle(middle.normalize(),angle)).normalize();
 if(sas&&!manual&&!target&&!sasTarget&&rate.length()<1e-8){sasTarget=orientation.toArray();phase='hold';}
 return {quaternion:orientation.toArray(),angularVelocity:rate.toArray(),sasTarget,phase};
}
