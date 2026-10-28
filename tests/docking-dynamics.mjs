import assert from 'node:assert/strict';
import {
 DOCKING_STEP,DOCKING_THRUST,DOCKING_LIMITS,DockingSimulation,dockingInitial,
 dockingQuaternion,dockingEuler,setDockingAttitude,rotateDockingVector,
 dockingMetrics,dockingContact,dockingCorridorRadius,dockingSpeedLimit,hcwStep,stepDocking
} from '../src/docking-physics.js';

const DEG=Math.PI/180;
const near=(a,b,tol=1e-10)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
const vectorNear=(a,b,tol=1e-10)=>a.forEach((v,i)=>near(v,b[i],tol));
const orientationNear=(a,b,tol=1e-10)=>{
 const dot=a.reduce((sum,v,i)=>sum+v*b[i],0),sign=dot<0?-1:1;
 vectorNear(a,b.map(v=>v*sign),tol);
};
const start=(options={})=>({...dockingInitial(),...options});

// Quaternion is authoritative; Euler is only a derived readout. Old states that
// have no quaternion can still be loaded, but two conflicting authorities cannot.
const stale=stepDocking(start({attitude:[0,0,90]}),{translation:[1,0,0]});
assert(stale.velocity[1]<0&&Math.abs(stale.velocity[2])<1e-10);
const legacy=start({attitude:[0,0,90]});delete legacy.quaternion;delete legacy.angularVelocity;
const legacyNext=stepDocking(legacy,{translation:[1,0,0]});
assert(legacyNext.velocity[2]<0&&Math.abs(legacyNext.velocity[1])<1e-10);
const set=setDockingAttitude(start(),[12,-24,35]);
vectorNear(set.attitude,[12,-24,35]);orientationNear(set.quaternion,dockingQuaternion([12,-24,35]));
const scaled=stepDocking({...set,quaternion:set.quaternion.map(v=>v*1e300)});
near(Math.hypot(...scaled.quaternion),1,1e-15);

// Independent constant-axis rotation: carry a body pitch rate through the Euler
// pitch singularity. The physical orientation remains smooth and unit length.
let coast=setDockingAttitude(start(),[0,89,0]);coast.angularVelocity=[0,DEG,0];
for(let i=0;i<1000;i++)coast=stepDocking(coast,{angularDamping:false});
orientationNear(coast.quaternion,dockingQuaternion([0,109,0]),1e-12);
vectorNear(rotateDockingVector([1,0,0],coast.quaternion),[Math.cos(109*DEG),0,-Math.sin(109*DEG)],1e-12);
near(Math.hypot(...coast.quaternion),1,1e-15);
assert(coast.attitude.every(Number.isFinite));

// A commanded rate takes finite time to develop; release with rate damping
// arrests rotation without snapping either rate or attitude to zero.
let ramp=start();
for(let i=0;i<50;i++){
 const before=ramp;ramp=stepDocking(ramp,{rotation:[1,0,0]});
 near(ramp.angularVelocity[0]-before.angularVelocity[0],DOCKING_LIMITS.maxAngularAcceleration*DOCKING_STEP,1e-15);
}
near(ramp.angularVelocity[0],DEG,1e-14);near(ramp.attitude[0],.5,1e-12);
const released=stepDocking(ramp);
assert(released.angularVelocity[0]>0&&released.angularVelocity[0]<ramp.angularVelocity[0]);
assert(released.attitude[0]>ramp.attitude[0]);
let damped=ramp;for(let i=0;i<500;i++)damped=stepDocking(damped);
assert(Math.abs(damped.angularVelocity[0])<1e-15);assert(damped.attitude[0]>.9);
const free=stepDocking(ramp,{angularDamping:false});
near(free.angularVelocity[0],ramp.angularVelocity[0]);near(free.attitude[0]-ramp.attitude[0],.02,1e-12);
let saturated=start();for(let i=0;i<500;i++)saturated=stepDocking(saturated,{rotation:[10,-10,10]});
saturated.angularVelocity.forEach((v,i)=>near(v,(i===1?-1:1)*DOCKING_LIMITS.maxAngularRate,1e-12));

// Compound-axis body rotation is checked against an independent vector/matrix
// Rodrigues solution, rather than reconstructing orientation from Euler angles.
const omega=[.017,-.013,.021],rate=Math.hypot(...omega),axis=omega.map(v=>v/rate),duration=20;
let compound=start({angularVelocity:omega});for(let i=0;i<duration/DOCKING_STEP;i++)compound=stepDocking(compound,{angularDamping:false});
const v=[.3,.4,.5],cross=[axis[1]*v[2]-axis[2]*v[1],axis[2]*v[0]-axis[0]*v[2],axis[0]*v[1]-axis[1]*v[0]],dot=axis.reduce((sum,x,i)=>sum+x*v[i],0);
const rodrigues=v.map((x,i)=>x*Math.cos(rate*duration)+cross[i]*Math.sin(rate*duration)+axis[i]*dot*(1-Math.cos(rate*duration)));
vectorNear(rotateDockingVector(v,compound.quaternion),rodrigues,1e-12);
// Starting from a different attitude makes left- versus right-multiplication
// distinguishable: the rate components are in the body, not the target frame.
const initialEuler=[18,-24,37],angles=initialEuler.map(value=>value*DEG);
let bodyRate=setDockingAttitude(start({angularVelocity:omega}),initialEuler);
for(let i=0;i<duration/DOCKING_STEP;i++)bodyRate=stepDocking(bodyRate,{angularDamping:false});
const [roll,pitch,yaw]=angles,[vx,vy,vz]=rodrigues;
const rx=[vx,Math.cos(roll)*vy-Math.sin(roll)*vz,Math.sin(roll)*vy+Math.cos(roll)*vz];
const ry=[Math.cos(pitch)*rx[0]+Math.sin(pitch)*rx[2],rx[1],-Math.sin(pitch)*rx[0]+Math.cos(pitch)*rx[2]];
const reference=[Math.cos(yaw)*ry[0]-Math.sin(yaw)*ry[1],Math.sin(yaw)*ry[0]+Math.cos(yaw)*ry[1],ry[2]];
vectorNear(rotateDockingVector(v,bodyRate.quaternion),reference,1e-12);

// Frame grouping remains deterministic with both rotation and body thrust.
const a=new DockingSimulation(),b=new DockingSimulation(),input={rotation:[.6,-.4,.2],translation:[.3,.4,-.2]};
for(let i=0;i<100;i++)a.advance(.01,input);for(let i=0;i<10;i++)b.advance(.1,input);
vectorNear(a.state.position,b.state.position,1e-12);vectorNear(a.state.velocity,b.state.velocity,1e-12);
orientationNear(a.state.quaternion,b.state.quaternion,1e-12);vectorNear(a.state.angularVelocity,b.state.angularVelocity,1e-12);

// Inputs are always three finite, clamped components. Corrupt physical state is
// rejected explicitly, so a numerical failure cannot silently spread as NaN.
const dirty=stepDocking(start(),{rotation:[NaN,Infinity,'oops'],translation:[undefined,NaN,-Infinity]});
vectorNear(dirty.position,[0,200,0]);vectorNear(dirty.angularVelocity,[0,0,0]);
const short=stepDocking(start(),{translation:[1],rotation:[1]});assert(short.position.every(Number.isFinite));
assert.throws(()=>stepDocking(start({position:[NaN,200,0]})),/Invalid docking position/);
assert.throws(()=>stepDocking(start({quaternion:[0,0,0,0]})),/Invalid docking quaternion/);
assert.throws(()=>stepDocking(start({angularVelocity:[0,NaN,0]})),/Invalid docking angular velocity/);
assert.throws(()=>hcwStep([0,0,0],[0,0,0],[Infinity,0,0],.02),/Invalid docking acceleration/);

// The port reference axes and LOS closure differ off-axis.
const m=dockingMetrics(start({position:[3,4,2],velocity:[.03,-.1,-.02],angularVelocity:[DEG,0,0]}));
near(m.axialClosing,.1);near(m.closing,.35/Math.sqrt(29));near(m.lateralSpeed,Math.hypot(.03,.02));
near(m.angularSpeed,DEG);near(m.right,2);near(m.up,3);near(m.rightVelocity,-.02);near(m.upVelocity,.03);
near(dockingCorridorRadius(2),.5);near(dockingCorridorRadius(20),2.4);
near(dockingSpeedLimit(31),.3);near(dockingSpeedLimit(30),.1);near(dockingSpeedLimit(5),.05);
near(DOCKING_LIMITS.speedTolerance,.002);

// Every capture component is exposed, including residual side drift and angular
// rate. A small total speed alone does not certify an acceptable contact.
const impact=(options={})=>start({position:[0,.35,0],velocity:[0,-.1,0],...options});
const checks=dockingMetrics(impact()).captureChecks;assert(Object.values(checks).every(Boolean));
const failures=[
 ['distance',{position:[0,.51,0]}],['lateral',{position:[.31,.35,0]}],
 ['speed',{velocity:[0,-.16,0]}],['axialClosing',{velocity:[0,.01,0]}],
 ['lateralSpeed',{velocity:[.051,-.1,0]}],
 ['angle',{quaternion:dockingQuaternion([0,0,3.01])}],
 ['angularSpeed',{angularVelocity:[0,0,.201*DEG]}]
];
for(const [key,options]of failures)assert.equal(dockingMetrics(impact(options)).captureChecks[key],false,key);
assert.equal(dockingMetrics(impact({velocity:[0,-DOCKING_LIMITS.captureSpeed-.001,0]})).captureChecks.speed,false,'Advisory tolerance must not relax capture');
assert.equal(dockingContact(impact({velocity:[.051,-.1,0]}),impact()).status,'collision');
assert.equal(dockingContact(impact({angularVelocity:[0,0,.201*DEG]}),impact()).status,'collision');
assert.equal(dockingContact(impact({velocity:[0,.01,0]}),impact()).status,'collision');

// A direct segment check snapshots all continuous fields at the same fraction.
const left=setDockingAttitude(start({position:[0,.36,0],velocity:[0,-.1,0],time:10,deltaV:2}),[0,0,1]);
const right=setDockingAttitude(start({position:[0,.32,0],velocity:[0,-.12,0],angularVelocity:[0,0,.4*DEG],time:10.04,deltaV:2.001}),[0,0,2]);
const segment=dockingContact(left,right);near(segment.f,.25,1e-12);
near(segment.impactState.time,10.01);near(segment.metrics.deltaV,2.00025);
near(segment.impactState.velocity[1],-.105);near(segment.impactState.angularVelocity[2],.1*DEG);
near(segment.impactState.attitude[2],1.25,1e-6);

// Contact partway through a powered step must preserve the pre-capture velocity
// and truncate elapsed time, delta-v, orientation and rate to that same instant.
const approach=start({position:[0,.351,0],velocity:[0,-.1,0],time:12,deltaV:.5});
const captured=stepDocking(approach,{translation:[1,0,0],rotation:[0,0,1]});
assert.equal(captured.status,'docked');assert(captured.time>12&&captured.time<12.02);
const elapsed=captured.time-12;near(captured.deltaV-.5,DOCKING_THRUST*elapsed,1e-14);
near(captured.contactMetrics.time,captured.time);near(captured.contactMetrics.deltaV,captured.deltaV);
near(captured.impactState.angularVelocity[2],DOCKING_LIMITS.maxAngularAcceleration*elapsed,1e-14);
near(captured.impactState.attitude[2],.5*elapsed*elapsed,1e-12);
near(captured.impactState.position[1],DOCKING_LIMITS.capturePlane);
assert(captured.contactMetrics.axialClosing>.1);assert(captured.contactMetrics.speed>.1);
vectorNear(captured.velocity,[0,0,0]);vectorNear(captured.angularVelocity,[0,0,0]);
orientationNear(captured.quaternion,captured.impactState.quaternion);
assert(captured.impactState.velocity[1]<-.1);
const reconstructed=dockingMetrics(captured.impactState);
for(const key of ['speed','angle','axialClosing','lateralSpeed','angularSpeed'])near(captured.contactMetrics[key],reconstructed[key]);
const crash=stepDocking({...approach,velocity:[0,-.2,0]},{translation:[1,0,0],rotation:[0,1,0]});
assert.equal(crash.status,'collision');assert(crash.time<12.02);
vectorNear(crash.velocity,crash.impactState.velocity);vectorNear(crash.angularVelocity,crash.impactState.angularVelocity);
near(crash.deltaV-.5,DOCKING_THRUST*(crash.time-12),1e-14);
const immediate=stepDocking(impact({time:4,deltaV:1}),{translation:[1,1,1],rotation:[1,1,1]});
near(immediate.time,4);near(immediate.deltaV,1);vectorNear(immediate.impactState.angularVelocity,[0,0,0]);

// A very slow approach can touch and reverse inside 20 ms; both endpoint
// positions may be outside the plane. The interior minimum must still trigger.
const turning=stepDocking(start({position:[0,.3500001,0],velocity:[0,-.0001,0]}),{translation:[-1,0,0]});
assert.equal(turning.status,'docked');assert(turning.time>0&&turning.time<.004);
near(turning.position[1],DOCKING_LIMITS.capturePlane);

console.log('Docking dynamics: quaternion/reference axes, rate actuator, damping/coast, finite inputs, capture gates and coherent partial-step contact passed');
