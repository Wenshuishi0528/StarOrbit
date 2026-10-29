// Circular-orbit Hill/Clohessy–Wiltshire teaching model, metres and seconds.
// Position axes: radial outward x, along-track y, orbit-normal z.
// Reference: MIT 16.346, lecture 26 (axis names are permuted there).
export const DOCKING_STEP=.02;
export const DOCKING_RATE=Math.sqrt(3.986004418e14/(6371000+400000)**3);
export const DOCKING_THRUST=.025;
export const DOCKING_MODEL_VERSION='HCW-400km-quaternion-rate-training-v2';
const DEG=Math.PI/180;

// These are training limits, not certified limits or Shenzhou flight parameters.
// Angular actuator limits are per body axis. There is no mass/inertia/jet model.
// speedTolerance is only for advisory speed warnings/statistics, never capture.
export const DOCKING_LIMITS=Object.freeze({
 capturePlane:.35,captureDistance:.5,captureLateral:.3,captureSpeed:.15,
 captureAxialClosing:.15,captureLateralSpeed:.05,captureAngle:3,
 captureAngularSpeed:.2*DEG,corridorStart:30,corridorFloor:.5,corridorSlope:.12,
 maxRange:2000,speedTolerance:.002,maxAngularRate:3*DEG,maxAngularAcceleration:DEG,angularResponseTime:.25
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const length=v=>Math.hypot(...v);
const plus=(a,b,k)=>a.map((v,i)=>v+b[i]*k);
const finiteNumber=(value,fallback=0)=>{
 const number=typeof value==='number'||typeof value==='string'?Number(value):NaN;
 return Number.isFinite(number)?number:fallback;
};
const commandVector=value=>Array.from({length:3},(_,i)=>clamp(finiteNumber(value?.[i]),-1,1));
function vector(value,size,label){
 if(!value||value.length!==size||!Array.from(value).every(Number.isFinite))throw Error(`Invalid docking ${label}`);
 return Array.from(value);
}
function unitQuaternion(value){
 const q=vector(value,4,'quaternion'),scale=Math.max(...q.map(Math.abs));
 if(scale===0)throw Error('Invalid docking quaternion');
 const scaled=q.map(v=>v/scale),norm=length(scaled);
 return scaled.map(v=>v/norm);
}
function stateQuaternion(state){return state.quaternion==null?dockingQuaternion(state.attitude):unitQuaternion(state.quaternion);}
const stateAngularVelocity=state=>state.angularVelocity==null?[0,0,0]:vector(state.angularVelocity,3,'angular velocity');

// The corridor is enforced only inside corridorStart. This function returns its
// geometric radius, so guidance and the rendered corridor can share one shape.
export const dockingCorridorRadius=axial=>Math.max(DOCKING_LIMITS.corridorFloor,DOCKING_LIMITS.corridorSlope*Math.max(0,finiteNumber(axial)));
export const dockingSpeedLimit=axial=>axial>30?.3:axial>5?.1:.05;

export function dockingInitial(distance=200){
 if(![50,200,500].includes(distance))distance=200;
 return {position:[0,distance,0],velocity:[0,0,0],quaternion:[0,0,0,1],angularVelocity:[0,0,0],attitude:[0,0,0],time:0,deltaV:0,status:'flying'};
}

// Scene/body axes: X out from the target docking port, Y camera right, Z up.
// Quaternion [x,y,z,w] rotates body vectors into the target port frame.
// Euler components are display-only degrees, roll X / pitch Y / yaw Z (Rz Ry Rx).
export function dockingQuaternion(euler=[0,0,0]){
 const [x,y,z]=Array.from({length:3},(_,i)=>(finiteNumber(euler?.[i])%360)*DEG/2);
 const a=Math.cos(x),b=Math.sin(x),c=Math.cos(y),d=Math.sin(y),e=Math.cos(z),f=Math.sin(z);
 return [b*c*e-a*d*f,a*d*e+b*c*f,a*c*f-b*d*e,a*c*e+b*d*f];
}
export function dockingEuler(quaternion){
 const [x,y,z,w]=unitQuaternion(quaternion);
 return [Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y)),Math.asin(clamp(2*(w*y-z*x),-1,1)),Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))].map(v=>v/DEG);
}
export function setDockingAttitude(state,euler){
 const quaternion=dockingQuaternion(euler);
 return {...state,quaternion,attitude:dockingEuler(quaternion),angularVelocity:stateAngularVelocity(state)};
}
function multiplyQuaternion(a,b){
 const [x,y,z,w]=a,[u,v,t,s]=b;
 return [w*u+x*s+y*t-z*v,w*v-x*t+y*s+z*u,w*t+x*v-y*u+z*s,w*s-x*u-y*v-z*t];
}
function advanceQuaternion(q,omega,dt){
 const rate=length(omega);
 if(rate<1e-15||dt===0)return q.slice();
 const half=rate*dt/2,k=Math.sin(half)/rate;
 return unitQuaternion(multiplyQuaternion(q,[...omega.map(v=>v*k),Math.cos(half)]));
}
function interpolateQuaternion(a,b,f){
 let dot=a.reduce((sum,v,i)=>sum+v*b[i],0);
 if(dot<0){b=b.map(v=>-v);dot=-dot;}
 if(dot>1-1e-12)return unitQuaternion(a.map((v,i)=>v+(b[i]-v)*f));
 const angle=Math.acos(clamp(dot,-1,1)),sin=Math.sin(angle),left=Math.sin((1-f)*angle)/sin,right=Math.sin(f*angle)/sin;
 return unitQuaternion(a.map((v,i)=>v*left+b[i]*right));
}
export function rotateDockingVector(v,q){
 const [x,y,z,w]=unitQuaternion(q),[a,b,c]=vector(v,3,'vector'),tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
 return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
export const hcwToScene=([x,y,z])=>[y,z,x];
export const sceneToHCW=([x,y,z])=>[z,x,y];
export function dockingMetrics(state){
 const position=vector(state.position,3,'position'),velocity=vector(state.velocity,3,'velocity');
 const distance=length(position),q=stateQuaternion(state);
 const metrics={
  distance,closing:distance?-position.reduce((sum,v,i)=>sum+v*velocity[i],0)/distance:0,
  speed:length(velocity),lateral:Math.hypot(position[0],position[2]),
  angle:2*Math.acos(clamp(Math.abs(q[3]),0,1))/DEG,axial:position[1],
  axialClosing:-velocity[1],lateralSpeed:Math.hypot(velocity[0],velocity[2]),
  angularSpeed:length(stateAngularVelocity(state)),
  right:position[2],up:position[0],rightVelocity:velocity[2],upVelocity:velocity[0]
 };
 const configured=state.rules?.contactSpeed,free=state.rules?.assistanceEnabled===false;
 const speedLimit=Number.isFinite(configured)&&configured>0?configured:DOCKING_LIMITS.captureSpeed;
 metrics.assistanceEnabled=!free;
 metrics.captureLimits={...DOCKING_LIMITS,captureSpeed:speedLimit,captureAxialClosing:speedLimit};
 metrics.speedInclusive=configured!==undefined;
 metrics.captureChecks={
  distance:metrics.distance<DOCKING_LIMITS.captureDistance,lateral:metrics.lateral<DOCKING_LIMITS.captureLateral,
  speed:configured!==undefined?metrics.speed<=speedLimit:metrics.speed<speedLimit,
  axialClosing:metrics.axialClosing>=0&&(configured!==undefined?metrics.axialClosing<=speedLimit:metrics.axialClosing<speedLimit),
  lateralSpeed:metrics.lateralSpeed<DOCKING_LIMITS.captureLateralSpeed,
  angle:metrics.angle<DOCKING_LIMITS.captureAngle,angularSpeed:metrics.angularSpeed<DOCKING_LIMITS.captureAngularSpeed
 };
 if(free)metrics.captureChecks={distance:metrics.captureChecks.distance,lateral:metrics.captureChecks.lateral,speed:metrics.captureChecks.speed};
 return metrics;
}
export function hcwDerivative(p,v,acc=[0,0,0],n=DOCKING_RATE){
 return [...v,3*n*n*p[0]+2*n*v[1]+acc[0],-2*n*v[0]+acc[1],-n*n*p[2]+acc[2]];
}
export function hcwStep(p,v,acc,dt,n=DOCKING_RATE){
 if(!Number.isFinite(dt)||dt<0||dt>.05)throw Error('Invalid docking integration step');
 p=vector(p,3,'position');v=vector(v,3,'velocity');acc=vector(acc,3,'acceleration');
 if(!Number.isFinite(n)||n<0)throw Error('Invalid docking orbital rate');
 const a=[...p,...v],f=s=>hcwDerivative(s.slice(0,3),s.slice(3),acc,n);
 const k1=f(a),k2=f(plus(a,k1,dt/2)),k3=f(plus(a,k2,dt/2)),k4=f(plus(a,k3,dt));
 const next=a.map((value,i)=>value+dt*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
 return {position:next.slice(0,3),velocity:next.slice(3)};
}

function normalizedState(state){
 const quaternion=stateQuaternion(state);
 return {...state,position:vector(state.position,3,'position'),velocity:vector(state.velocity,3,'velocity'),
  quaternion,attitude:dockingEuler(quaternion),angularVelocity:stateAngularVelocity(state),
  time:finiteNumber(state.time),deltaV:Math.max(0,finiteNumber(state.deltaV))};
}
function impactSnapshot(state){
 return {position:state.position.slice(),velocity:state.velocity.slice(),quaternion:state.quaternion.slice(),
  attitude:state.attitude.slice(),angularVelocity:state.angularVelocity.slice(),time:state.time,deltaV:state.deltaV,status:'flying',...(state.rules?{rules:{...state.rules}}:{})};
}
function contactResult(candidate,f){
 const impactState=impactSnapshot(candidate),metrics={...dockingMetrics(candidate),time:candidate.time,deltaV:candidate.deltaV};
 return {status:Object.values(metrics.captureChecks).every(Boolean)?'docked':'collision',f,position:candidate.position.slice(),metrics,impactState};
}
function interpolateState(before,after,f){
 const quaternion=interpolateQuaternion(before.quaternion,after.quaternion,f);
 const mix=key=>before[key].map((v,i)=>v+(after[key][i]-v)*f);
 return {...after,position:mix('position'),velocity:mix('velocity'),angularVelocity:mix('angularVelocity'),
  quaternion,attitude:dockingEuler(quaternion),time:before.time+(after.time-before.time)*f,deltaV:before.deltaV+(after.deltaV-before.deltaV)*f};
}

// A 0.35 m capture zone represents compliant docking hardware, not hard-body penetration.
// This public segment check interpolates every state component at the same fraction.
// stepDocking additionally refines the contact time by re-integrating the partial step.
// A finite port volume for free flight: crossing the plane far from the
// interface is not a collision. Sweep both ends to catch fast fly-throughs.
function freePortInterval(before,after){
 const p=before.position,d=after.position.map((v,i)=>v-p[i]);
 const radius=DOCKING_LIMITS.captureLateral,depth=DOCKING_LIMITS.capturePlane;
 let enter=0,exit=1;
 if(Math.abs(d[1])<1e-15){if(Math.abs(p[1])>depth)return null;}
 else{const a=(-depth-p[1])/d[1],b=(depth-p[1])/d[1];enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
 const a=d[0]**2+d[2]**2,b=2*(p[0]*d[0]+p[2]*d[2]),c=p[0]**2+p[2]**2-radius**2;
 if(a<1e-24){if(c>=0)return null;}
 else{const disc=b*b-4*a*c;if(disc<=0)return null;const root=Math.sqrt(disc);enter=Math.max(enter,(-b-root)/(2*a));exit=Math.min(exit,(-b+root)/(2*a));}
 return enter<=exit&&exit>=0&&enter<=1?{enter,exit}:null;
}
const insideFreePort=state=>Math.abs(state.position[1])<=DOCKING_LIMITS.capturePlane&&Math.hypot(state.position[0],state.position[2])<DOCKING_LIMITS.captureLateral;

export function dockingContact(before,after){
 before=normalizedState(before);after=normalizedState(after);
 if(after.rules?.assistanceEnabled===false){
  const interval=freePortInterval(before,after);
  return interval?{...contactResult(interpolateState(before,after,interval.enter),interval.enter),exitFraction:interval.exit}:null;
 }
 const plane=DOCKING_LIMITS.capturePlane;
 if(before.position[1]>plane&&after.position[1]<=plane||before.position[1]<=plane){
  const denominator=before.position[1]-after.position[1],f=denominator>0?clamp((before.position[1]-plane)/denominator,0,1):0;
  return contactResult(interpolateState(before,after,f),f);
 }
 if(length(after.position)>DOCKING_LIMITS.maxRange)return {status:'lost',f:1,position:after.position};
 // Training boundary, not a polygon-level station collision model.
 if(after.position[1]<DOCKING_LIMITS.corridorStart&&Math.hypot(after.position[0],after.position[2])>dockingCorridorRadius(after.position[1]))return {status:'corridor',f:1,position:after.position};
 return null;
}

function controls(input){
 return {rotation:commandVector(input?.rotation),translation:commandVector(input?.translation),fine:!!input?.fine,brake:!!input?.brake,angularDamping:input?.angularDamping!==false};
}
function integrate(state,input,dt){
 // A bounded rate actuator: omega is relative to the target port frame and
 // expressed in body axes, rad/s. Damping arrests rate; it does not level attitude.
 const free=state.rules?.assistanceEnabled===false;
 const angularVelocity=state.angularVelocity.map((rate,i)=>{
  if(free)return rate+input.rotation[i]*DOCKING_LIMITS.maxAngularAcceleration*dt;
  const demand=input.rotation[i]!==0||input.angularDamping?input.rotation[i]*DOCKING_LIMITS.maxAngularRate:rate;
  const acceleration=clamp((demand-rate)/DOCKING_LIMITS.angularResponseTime,-DOCKING_LIMITS.maxAngularAcceleration,DOCKING_LIMITS.maxAngularAcceleration);
  return rate+acceleration*dt;
 });
 const meanRate=state.angularVelocity.map((v,i)=>(v+angularVelocity[i])/2);
 const quaternion=advanceQuaternion(state.quaternion,meanRate,dt),midpoint=advanceQuaternion(state.quaternion,meanRate,dt/2);
 const strength=input.fine?.2:1,body=input.translation;
 // Per-axis body translation: forward (-X), right (+Y), up (+Z).
 let acceleration=sceneToHCW(rotateDockingVector([-body[0],body[1],body[2]],midpoint)).map(x=>x*DOCKING_THRUST*strength);
 // Optional bounded velocity braking, with no teleport/reset of velocity.
 if(input.brake&&!free){const speed=length(state.velocity),gain=Math.min(DOCKING_THRUST*strength,speed/.5);acceleration=state.velocity.map(v=>speed?-gain*v/speed:0);}
 return {...state,...hcwStep(state.position,state.velocity,acceleration,dt),quaternion,attitude:dockingEuler(quaternion),angularVelocity,
  time:state.time+dt,deltaV:state.deltaV+length(acceleration)*dt};
}
export function stepDocking(state,input={},dt=DOCKING_STEP){
 if(state.status!=='flying')return state;
 if(!Number.isFinite(dt)||dt<=0||dt>.05)throw Error('Invalid docking integration step');
 const before=normalizedState(state),command=controls(input);
 let next=integrate(before,command,dt),contact=dockingContact(before,next),contactHorizon=dt;
 if(before.rules?.assistanceEnabled===false){
  if(!contact)return next;
  let low=0,high=insideFreePort(before)?0:(contact.f+contact.exitFraction)*dt/2;
  if(high&&!insideFreePort(integrate(before,command,high)))return next;
  for(let i=0;i<40&&high>0;i++){const mid=(low+high)/2;if(insideFreePort(integrate(before,command,mid)))high=mid;else low=mid;}
  next=integrate(before,command,high);contact=contactResult(next,high/dt);
  next.contactMetrics=contact.metrics;next.impactState=contact.impactState;next.status=contact.status;
  if(next.status==='docked'){next.velocity=[0,0,0];next.angularVelocity=[0,0,0];}
  return next;
 }
 // A braking reversal can touch the plane and return during one step. Bracket
 // its interior minimum too; checking only the two endpoints would miss it.
 if(before.position[1]>DOCKING_LIMITS.capturePlane&&next.position[1]>DOCKING_LIMITS.capturePlane&&before.velocity[1]<0&&next.velocity[1]>0){
  let low=0,high=dt;
  for(let i=0;i<28;i++){
   const middle=(low+high)/2;
   if(integrate(before,command,middle).velocity[1]<0)low=middle;else high=middle;
  }
  const minimum=integrate(before,command,(low+high)/2);
  if(minimum.position[1]<=DOCKING_LIMITS.capturePlane){contact=dockingContact(before,minimum);contactHorizon=(low+high)/2;}
 }
 if(!contact)return next;
 if(contact.status==='docked'||contact.status==='collision'){
  // Find the first contact within this fixed step. Re-integrate attitude, velocity,
  // elapsed time and delta-v at that time instead of mixing full/partial steps.
  let low=0,high=before.position[1]<=DOCKING_LIMITS.capturePlane?0:contactHorizon;
  for(let i=0;i<32&&high>0;i++){
   const middle=(low+high)/2,candidate=integrate(before,command,middle);
   if(candidate.position[1]>DOCKING_LIMITS.capturePlane)low=middle;else high=middle;
  }
  next=integrate(before,command,high);
  if(before.position[1]>DOCKING_LIMITS.capturePlane)next.position[1]=DOCKING_LIMITS.capturePlane;
  contact=contactResult(next,high/dt);
  next.contactMetrics=contact.metrics;next.impactState=contact.impactState;
  if(contact.status==='docked'){next.velocity=[0,0,0];next.angularVelocity=[0,0,0];}
 }
 next.status=contact.status;
 return next;
}

// Fixed-step accumulator: grouping the same duration into frames preserves the trajectory.
export class DockingSimulation{
 constructor(distance=200){this.reset(distance);}
 reset(distance=200){this.state=dockingInitial(distance);this.remainder=0;return this.state;}
 advance(seconds,input={}){
  if(!Number.isFinite(seconds)||seconds<0||seconds>2)throw Error('Invalid docking elapsed time');
  if(this.state.status!=='flying'){this.remainder=0;return this.state;}
  this.remainder+=seconds;
  while(this.remainder>=DOCKING_STEP-1e-12&&this.state.status==='flying'){
   this.state=stepDocking(this.state,input);this.remainder=Math.max(0,this.remainder-DOCKING_STEP);
  }
  if(this.state.status!=='flying')this.remainder=0;
  return this.state;
 }
}
