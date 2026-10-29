import assert from 'node:assert/strict';
import {DockingTraining} from '../src/docking-training.js';
import {DOCKING_LIMITS,DOCKING_STEP,stepDocking,dockingMetrics,setDockingAttitude} from '../src/docking-physics.js';
import {DockingRecorder} from '../src/docking-instruments.js';
const near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const free=(speed=.15)=>new DockingTraining('alignment',{assistanceEnabled:false,contactSpeed:speed});
const state=(position,velocity,speed=.15)=>({...free(speed).state,position,velocity});

// Off is a real controller switch, preserving the physical state and time.
{
 const events=[],s=new DockingTraining('approach',{onEvent:e=>events.push(e)});
 assert(s.assistanceEnabled);near(s.contactSpeed,.15);
 s.setMode('approach');s.advance(1);const before=structuredClone(s.state);
 s.setAssistance(false);
 for(const k of ['position','velocity','quaternion','angularVelocity','time','deltaV'])assert.deepEqual(s.state[k],before[k]);
 assert.equal(s.mode,'manual');assert.equal(s.guidance().gate,null);assert.equal(s.releaseGate(),false);
 for(const mode of ['approach','hold','retreat'])assert.equal(s.setMode(mode),false);
 const expected=stepDocking(s.state,{angularDamping:false},DOCKING_STEP);
 s.advance(DOCKING_STEP);assert.deepEqual(s.state,expected);
 s.state.position=[2,10,1];s.setAssistance(true);
 assert.equal(s.mode,'manual');assert.equal(s.guidance().gate.distance,5);assert.equal(s.violations.length,0);
 assert.equal(events.filter(e=>e.type==='assistance').length,2);
 s.setContactSpeed(.4);s.setAssistance(false);s.reset();assert.equal(s.assistanceEnabled,false);near(s.contactSpeed,.4);
 assert.equal(s.guidance().gate,null);
 for(const value of [0,-1,NaN,Infinity,'1'])assert.throws(()=>s.setContactSpeed(value));
}

// No teaching boundaries or hidden velocity damping in free flight.
{
 for(const [p,v] of [[[0,2500,0],[0,1,0]],[[20,20,0],[0,-1,0]],[[1,.4,0],[0,-5,0]],[[20,-100,0],[0,-2,0]]]){
  const s=free();s.state={...s.state,position:p,velocity:v};s.advance(.2);assert.equal(s.state.status,'flying');assert.equal(s.violations.length,0);
 }
 const s=free();s.state.position=[0,100,0];
 for(let i=0;i<200;i++)s.advance(.02,{rotation:[1,0,0]});
 assert(s.state.angularVelocity[0]>DOCKING_LIMITS.maxAngularRate);
 const omega=[...s.state.angularVelocity];s.advance(1,{angularDamping:true,brake:true});assert.deepEqual(s.state.angularVelocity,omega);
 const normal=stepDocking(s.state,{angularDamping:false}),ignored=stepDocking(s.state,{angularDamping:true,brake:true});assert.deepEqual(normal,ignored);
}

// A finite interface volume: misses pass by; high-speed fly-throughs cannot tunnel.
{
 let s=state([0,2,0],[0,-1000,0]);s=stepDocking(s,{},.02);assert.equal(s.status,'collision');assert(s.time<.02);assert(s.contactMetrics.speed>999);near(s.position[1],.35);
 for(const [speed,limit,result] of [[.5,.2,'collision'],[.5,1,'docked']]){
  let s=state([0,.36,0],[0,-speed,0],limit);s=setDockingAttitude(s,[30,20,10]);s.angularVelocity=[1,0,0];
  for(let i=0;i<10&&s.status==='flying';i++)s=stepDocking(s);
  assert.equal(s.status,result);assert.deepEqual(Object.keys(s.contactMetrics.captureChecks),['distance','lateral','speed']);
  near(s.contactMetrics.captureLimits.captureSpeed,limit);assert(s.impactState.rules.assistanceEnabled===false);
 }
 let side=state([.31,0,0],[-1,0,0],2);side=stepDocking(side);assert.equal(side.status,'docked');
 let miss=state([1,2,0],[0,-1000,0],2);miss=stepDocking(miss);assert.equal(miss.status,'flying');
 const m=dockingMetrics(state([0,.35,0],[0,-.5,0],.5));assert.equal(m.captureChecks.speed,true,'At the configured maximum is allowed');
 assert.equal(dockingMetrics(state([0,.35,0],[.4,-.4,0],.5)).captureChecks.speed,false,'Check total relative speed, including lateral drift');
}

// Assistance respects a reduced contact-speed setting, and still completes capture.
{
 const s=new DockingTraining('alignment',{contactSpeed:.02});s.setMode('approach');
 for(let i=0;i<3000&&!s.finished;i++){s.advance(.2);if(s.guidance().canRelease)s.releaseGate();}
 assert.equal(s.state.status,'docked');assert(s.state.contactMetrics.speed<=.02);
 assert.equal(s.setContactSpeed(1),false,'Finished contact conditions are immutable');
}

// Exports and replay samples retain the settings active at each moment.
{
 const recorder=new DockingRecorder();const s=new DockingTraining('alignment',{onEvent:e=>recorder.event(e),onStep:(s,c)=>recorder.sample(s,c)});
 s.advance(.2);s.setAssistance(false);s.setContactSpeed(.7);s.advance(.2);
 const exported=JSON.parse(recorder.exportJSON()),first=exported.samples[0],last=exported.samples.at(-1);
 assert.equal(first.rules.assistanceEnabled,true);near(first.rules.contactSpeed,.15);
 assert.equal(last.rules.assistanceEnabled,false);near(last.rules.contactSpeed,.7);assert.equal(last.context.command.angularDamping,false);
 assert(exported.events.some(e=>e.type==='contact-speed'));
}
console.log('Assistance toggle, unconstrained manual motion, finite-port sweep, adjustable impact limit, safe assisted creep and replay settings passed');
