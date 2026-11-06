import {cross,dot,norm,ellipseFromState,snapshotFromState,validTime} from './orbit.js';
import {hcwDerivative,hcwStep,hcwToScene,sceneToHCW} from './docking-physics.js';

// Near-orbit teaching dynamics, not a replacement for the observation orbit.
// State axes are always LVLH: along-track X, orbit-normal Y, radial-out Z.
// The model's task basis may instead follow the rotating ground or a fixed
// inertial direction, and must never be used as the HCW integration frame.
export const MAIN_FLIGHT_STEP=.04;
export const MAIN_FLIGHT_MAX_RANGE=10000;
const MU=398600.4418; // km³/s², matching the shared Earth orbit model.
const zero=()=>[0,0,0];
const plus=(a,b)=>a.map((x,i)=>x+b[i]);
const scale=(v,k)=>v.map(x=>x*k);
const finiteVector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
function vector(value){
 if(!finiteVector(value))throw Error('Invalid main-flight vector');
 return value;
}
function validBasis(axes){
 return Array.isArray(axes)&&axes.length===3&&axes.every(finiteVector);
}
const limited=(v,max)=>norm(v)>max?scale(v,max/norm(v)):v;

/** Position is metres; velocity is its derivative in the rotating LVLH frame,
 * in m/s. deltaV is accumulated applied thrust, not gravitational acceleration. */
export function createMainFlightTranslation(){
 return {position:zero(),velocity:zero(),deltaV:0,elapsed:0,outOfRange:false};
}

/** Geometry uses the instantaneous angular rate h/r². HCW uses the osculating
 * mean motion, which a controller can capture once for a consistent session. */
export function mainFlightFrame(reference){
 if(!reference||!validTime(reference.t))throw Error('Invalid main-flight reference');
 const position=vector(reference.position),velocity=vector(reference.velocity),radius=norm(position);
 if(radius<1e-6)throw Error('Invalid main-flight reference');
 const radial=scale(position,1/radius),tangent=plus(velocity,scale(radial,-dot(velocity,radial)));
 if(norm(tangent)<1e-9)throw Error('Invalid main-flight reference');
 const along=scale(tangent,1/norm(tangent)),normal=cross(radial,along);
 const angularRate=norm(cross(position,velocity))/(radius*radius);
 const meanMotion=ellipseFromState(reference)?.n??Math.sqrt(MU/radius**3);
 return {basis:[along,normal,radial],angularRate,meanMotion};
}

export function mainFlightWorldToLocal(value,frame){
 vector(value);if(!validBasis(frame?.basis))throw Error('Invalid main-flight frame');
 return frame.basis.map(axis=>dot(axis,value));
}
export function mainFlightLocalToWorld(value,frame){
 vector(value);if(!validBasis(frame?.basis))throw Error('Invalid main-flight frame');
 return [0,1,2].map(j=>frame.basis.reduce((sum,axis,i)=>sum+axis[j]*value[i],0));
}

/** Displacement of modelRoot in viewer units. Keep the camera's Earth origin
 * at the reference snapshot when applying this offset; using the effective
 * position as that origin too would count the displacement twice. */
export function mainFlightModelOffset(reference,state,unitsPerMetre=5){
 if(!validBasis(reference?.basis)||!Number.isFinite(unitsPerMetre)||unitsPerMetre<=0)throw Error('Invalid main-flight model frame');
 const world=mainFlightLocalToWorld(vector(state.position),mainFlightFrame(reference));
 return reference.basis.map(axis=>dot(axis,world)*unitsPerMetre);
}

/** Effective live telemetry without changing the shared reference ephemeris.
 * The basis stays that of the reference task so model offsets and attitude
 * use one frame. Other snapshot fields are recalculated at the moved craft. */
export function mainFlightSnapshot(reference,state){
 const frame=mainFlightFrame(reference);
 if(!validBasis(reference.basis))throw Error('Invalid main-flight model frame');
 const displacement=mainFlightLocalToWorld(vector(state.position),frame);
 const relativeVelocity=mainFlightLocalToWorld(vector(state.velocity),frame);
 const omega=scale(frame.basis[1],frame.angularRate);
 const velocityOffset=plus(relativeVelocity,cross(omega,displacement));
 const effective=snapshotFromState({position:plus(reference.position,scale(displacement,.001)),
  velocity:plus(reference.velocity,scale(velocityOffset,.001))},reference.t);
 const basis=reference.basis.map(axis=>[...axis]);
 return {...effective,basis,sunLocal:basis.map(axis=>dot(axis,effective.sunDir))};
}

/** One fixed 40 ms step. worldAcceleration is inertial m/s² and is bounded by
 * acceleration (the available RCS acceleration). RCS enable/disable is owned
 * by the caller; sending zero acceleration coasts without numerical damping.
 * brake is an explicit relative-velocity aid, separate from SAS or RCS enable. */
export function stepMainFlightTranslation(state,{
 worldAcceleration=[0,0,0],brake=false,acceleration=.08,meanMotion
}={},reference){
 const frame=mainFlightFrame(reference),n=meanMotion??frame.meanMotion;
 const position=vector(state.position),velocity=vector(state.velocity);
 if(!Number.isFinite(n)||n<=0||n>.01||!Number.isFinite(acceleration)||acceleration<0||acceleration>10||
    !Number.isFinite(state.deltaV)||state.deltaV<0||!Number.isFinite(state.elapsed)||state.elapsed<0)throw Error('Invalid main-flight state');
 let thrust=mainFlightWorldToLocal(vector(worldAcceleration),frame);
 if(brake){
  const drift=hcwToScene(hcwDerivative(sceneToHCW(position),sceneToHCW(velocity),zero(),n).slice(3));
  thrust=plus(scale(velocity,-1.2),scale(drift,-1));
 }
 thrust=limited(thrust,acceleration);
 const next=hcwStep(sceneToHCW(position),sceneToHCW(velocity),sceneToHCW(thrust),MAIN_FLIGHT_STEP,n);
 const nextPosition=hcwToScene(next.position),nextVelocity=hcwToScene(next.velocity);
 return {position:nextPosition,velocity:nextVelocity,deltaV:state.deltaV+norm(thrust)*MAIN_FLIGHT_STEP,
  elapsed:(Math.round(state.elapsed*1000)+MAIN_FLIGHT_STEP*1000)/1000,
  outOfRange:norm(nextPosition)>MAIN_FLIGHT_MAX_RANGE};
}
