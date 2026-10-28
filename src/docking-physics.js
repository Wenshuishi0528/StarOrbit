// Circular-orbit Hill/Clohessy–Wiltshire teaching model, metres and seconds.
// Position axes: radial outward x, along-track y, orbit-normal z.
// Reference: MIT 16.346, lecture 26 (axis names are permuted there).
export const DOCKING_STEP=.02;
export const DOCKING_RATE=Math.sqrt(3.986004418e14/(6371000+400000)**3);
export const DOCKING_THRUST=.025;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const length=v=>Math.hypot(...v);
const plus=(a,b,k)=>a.map((v,i)=>v+b[i]*k);

export function dockingInitial(distance=200){
 if(![50,200,500].includes(distance))distance=200;
 return {position:[0,distance,0],velocity:[0,0,0],attitude:[0,0,0],time:0,deltaV:0,status:'flying'};
}

// Scene/body axes: X out from the target docking port, Y camera right, Z up.
// Euler components are roll about X, pitch about Y, yaw about Z (Rz Ry Rx).
export function dockingQuaternion([roll,pitch,yaw]){
 const [x,y,z]=[roll,pitch,yaw].map(v=>v*Math.PI/360),a=Math.cos(x),b=Math.sin(x),c=Math.cos(y),d=Math.sin(y),e=Math.cos(z),f=Math.sin(z);
 return [b*c*e-a*d*f,a*d*e+b*c*f,a*c*f-b*d*e,a*c*e+b*d*f];
}
export function rotateDockingVector(v,q){
 const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
 return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
export const hcwToScene=([x,y,z])=>[y,z,x];
export const sceneToHCW=([x,y,z])=>[z,x,y];
export function dockingMetrics(state){
 const distance=length(state.position),angle=2*Math.acos(clamp(Math.abs(dockingQuaternion(state.attitude)[3]),0,1))*180/Math.PI;
 return {distance,closing:distance?-state.position.reduce((sum,v,i)=>sum+v*state.velocity[i],0)/distance:0,speed:length(state.velocity),lateral:Math.hypot(state.position[0],state.position[2]),angle,axial:state.position[1]};
}
export function hcwDerivative(p,v,acc=[0,0,0],n=DOCKING_RATE){
 return [...v,3*n*n*p[0]+2*n*v[1]+acc[0],-2*n*v[0]+acc[1],-n*n*p[2]+acc[2]];
}
export function hcwStep(p,v,acc,dt,n=DOCKING_RATE){
 if(!Number.isFinite(dt)||dt<0||dt>.05)throw Error('Invalid docking integration step');
 const a=[...p,...v],f=s=>hcwDerivative(s.slice(0,3),s.slice(3),acc,n);
 const k1=f(a),k2=f(plus(a,k1,dt/2)),k3=f(plus(a,k2,dt/2)),k4=f(plus(a,k3,dt));
 const next=a.map((value,i)=>value+dt*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
 return {position:next.slice(0,3),velocity:next.slice(3)};
}

// A 0.35 m capture zone represents compliant docking hardware, not hard-body penetration.
// Check the swept segment, so a fast crossing cannot jump through the contact plane.
export function dockingContact(before,after){
 if(before.position[1]>.35&&after.position[1]<=.35||before.position[1]<=.35){
  const denominator=before.position[1]-after.position[1],f=denominator>0?clamp((before.position[1]-.35)/denominator,0,1):0;
  const candidate={...after,position:before.position.map((v,i)=>v+(after.position[i]-v)*f),velocity:before.velocity.map((v,i)=>v+(after.velocity[i]-v)*f)};
  const m=dockingMetrics(candidate);
  const status=m.distance<.5&&m.lateral<.3&&m.speed<.15&&m.angle<3?'docked':'collision';
  return {status,f,position:candidate.position};
 }
 if(length(after.position)>2000)return {status:'lost',f:1,position:after.position};
 // Abort outside a conservative approach corridor before encountering the station hull.
 // This is a training boundary, not a polygon-level collision model.
 if(after.position[1]<30&&Math.hypot(after.position[0],after.position[2])>Math.max(.5,after.position[1]*.12))return {status:'corridor',f:1,position:after.position};
 return null;
}

export function stepDocking(state,input={},dt=DOCKING_STEP){
 if(state.status!=='flying')return state;
 if(!Number.isFinite(dt)||dt<=0||dt>.05)throw Error('Invalid docking integration step');
 const rotation=(input.rotation||[0,0,0]).map(x=>clamp(Number(x)||0,-1,1));
 const attitude=state.attitude.map((x,i)=>((x+rotation[i]*3*dt+540)%360)-180);
 const strength=input.fine?.2:1,body=(input.translation||[0,0,0]).map(x=>clamp(Number(x)||0,-1,1));
 // Input: forward (-X), right (+Y), up (+Z), transformed by the actual craft attitude.
 let acceleration=sceneToHCW(rotateDockingVector([-body[0],body[1],body[2]],dockingQuaternion(attitude))).map(x=>x*DOCKING_THRUST*strength);
 // Optional bounded velocity braking, with no teleport/reset of velocity.
 if(input.brake){const speed=length(state.velocity),gain=Math.min(DOCKING_THRUST*strength,speed/.5);acceleration=state.velocity.map(v=>speed?-gain*v/speed:0);}
 const next={...state,...hcwStep(state.position,state.velocity,acceleration,dt),attitude,time:state.time+dt,deltaV:state.deltaV+length(acceleration)*dt};
 const contact=dockingContact(state,next);
 if(contact){next.status=contact.status;next.position=contact.position;next.time=state.time+dt*contact.f;if(contact.status==='docked')next.velocity=[0,0,0];}
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
