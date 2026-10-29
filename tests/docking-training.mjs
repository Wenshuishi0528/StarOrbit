import assert from 'node:assert/strict';
import {DockingTraining,DOCKING_SCENARIOS,DOCKING_GATE_RULES} from '../src/docking-training.js';
import {DOCKING_STEP,DOCKING_THRUST,DOCKING_LIMITS,dockingMetrics,setDockingAttitude,stepDocking} from '../src/docking-physics.js';

const copy=value=>structuredClone(value);
const norm=vector=>Math.hypot(...vector);
function runUntil(session,predicate,maxSeconds){
 const deadline=session.state.time+maxSeconds;
 while(!predicate()&&!session.finished&&session.state.time<deadline)session.advance(.2);
 assert.ok(predicate(),`Condition not reached at ${session.state.time.toFixed(2)} s: ${session.state.status}, ${session.mode}`);
}

// Each actual scenario reaches both its required teaching holds and physical capture.
const scenarioResults=[];
for(const scenario of DOCKING_SCENARIOS){
 const events=[],session=new DockingTraining(scenario.id,{onEvent:event=>events.push(copy(event)),random:()=>.5});
 assert.equal(session.mode,'manual');assert.equal(session.finished,false);
 assert.equal(session.releaseGate(),false,'GO is unavailable before a stable hold');
 session.setMode('approach');
 for(const rule of DOCKING_GATE_RULES.filter(gate=>gate.distance<scenario.initialDistance)){
  runUntil(session,()=>session.guidance().canRelease,1000);
  assert.equal(session.state.status,'flying');assert.equal(session.guidance().gate.distance,rule.distance);
  assert.equal(session.guidance().gate.status,'ready');assert.equal(session.guidance().gate.stableSeconds,rule.stableSeconds);
  for(let i=0;i<50;i++)session.advance(.2);
  assert.equal(session.state.status,'flying','A gate hold does not finish the physics run');
  assert.ok(Math.abs(session.state.position[1]-rule.distance)<=rule.positionTolerance,'The active gate is held until GO');
  assert.ok(session.state.position[1]>rule.distance-rule.positionTolerance);
  assert.equal(session.releaseGate(),true);assert.equal(session.mode,'approach');
 }
 runUntil(session,()=>session.finished,240);
 assert.equal(session.state.status,'docked');assert.equal(session.finishReason,'docked');
 assert.equal(session.violations.length,0);assert.ok(session.state.deltaV>0);
 assert.ok(Object.values(session.state.contactMetrics.captureChecks).every(Boolean));
 assert.ok(session.state.impactState.velocity[1]<0,'Capture preserves the actual nonzero impact velocity');
 assert.equal(events.filter(event=>event.type==='finished').length,1);
 assert.equal(events.filter(event=>event.type==='gate-release').length,scenario.id==='alignment'?1:2);
 scenarioResults.push({scenario:scenario.id,time:session.state.time,deltaV:session.state.deltaV});
}

// Gate qualification counts continuous simulated time, and losing a condition resets it.
{
 const session=new DockingTraining('approach');
 session.state={...session.state,position:[0,30,0]};session.setMode('hold');
 session.advance(1.98);assert.equal(session.guidance().canRelease,false);
 session.advance(.02);assert.equal(session.guidance().canRelease,true);
 session.state={...session.state,velocity:[0,.05,0]};session.advance(.02);
 assert.equal(session.guidance().canRelease,false);assert.equal(session.guidance().gate.stableSeconds,0);
 assert.equal(session.releaseGate(),false);
}

// GO changes the destination without the old 0.1 / 0.05 m/s cruise caps.
{
 for(const [scenario,distance,oldLimit] of [['approach',30.1,.1],['alignment',5.1,.05]]){
  const session=new DockingTraining(scenario);
  session.state=setDockingAttitude({...session.state,position:[0,distance,0],velocity:[0,0,0]},[0,0,0]);
  session.setMode('hold');session.advance(2);
  assert.equal(session.guidance().canRelease,true);
  assert.equal(session.releaseGate(),true);session.setMode('approach');
  assert.equal(session.guidance().speedLimit,null);
  assert.ok(session.guidance().recommendedClosing>oldLimit);
  let peak=0;
  for(let i=0;i<300&&!session.finished&&!session.guidance().canRelease;i++){
   session.advance(.2);peak=Math.max(peak,-session.state.velocity[1]);
  }
  assert.ok(peak>oldLimit,'Actual motion exceeds the former flight speed cap');
  assert.ok(['flying','docked'].includes(session.state.status));
 }
}

// Hold consumes finite thrust and settles at its engagement position without teleporting.
{
 const session=new DockingTraining('recovery'),position=[...session.state.position],velocity=[...session.state.velocity];
 session.setMode('hold');assert.deepEqual(session.state.velocity,velocity);
 session.advance(DOCKING_STEP);
 assert.ok(norm(session.state.velocity)>0);
 assert.ok(session.state.deltaV>0&&session.state.deltaV<=DOCKING_THRUST*DOCKING_STEP+1e-12);
 for(let i=0;i<100;i++)session.advance(1);
 assert.equal(session.state.status,'flying');assert.equal(session.mode,'hold');
 assert.ok(norm(session.state.position.map((value,i)=>value-position[i]))<.02);
 assert.ok(norm(session.state.velocity)<.002);
}

// Retreat first brakes an inward velocity, then moves outward to a bounded hold point.
{
 const events=[],session=new DockingTraining('alignment',{onEvent:event=>events.push(event)});
 const initialVelocity=[...session.state.velocity];session.setMode('retreat');
 assert.deepEqual(session.state.velocity,initialVelocity);assert.equal(session.guidance().targetDistance,62);
 session.advance(DOCKING_STEP);assert.ok(session.state.velocity[1]<0,'Retreat cannot instantaneously cancel closing speed');
 runUntil(session,()=>events.some(event=>event.type==='retreat-hold'),400);
 assert.equal(session.finished,false);assert.equal(session.state.status,'flying');assert.equal(session.mode,'retreat');
 assert.ok(session.state.position[1]>61.5);assert.ok(norm(session.state.velocity)<.02);assert.ok(session.state.deltaV>0);
 for(let i=0;i<10;i++)session.advance(1);
 assert.equal(events.filter(event=>event.type==='retreat-hold').length,1);assert.equal(session.violations.length,0);
 const far=new DockingTraining(500);far.state={...far.state,position:[0,1950,0]};far.setMode('retreat');
 assert.ok(far.guidance().targetDistance>=1950,'A retreat command never targets an inward point near the range boundary');
}

// Manual input takes over before the first applied step, without automatic thrust mixed in.
{
 const events=[],session=new DockingTraining('alignment',{onEvent:event=>events.push(event)});
 session.setMode('approach');session.advance(.5);
 const before=copy(session.state),command={translation:[0,1,0],rotation:[0,0,.25],fine:true,angularDamping:false};
 const expected=stepDocking(before,command,DOCKING_STEP);
 session.advance(DOCKING_STEP,command);assert.equal(session.mode,'manual');assert.deepEqual(session.state,expected);
 assert.equal(events.at(-1).type,'mode-change');assert.equal(events.at(-1).detail.reason,'manual-input');
 session.setMode('approach');session.advance(0,{brake:true});assert.equal(session.mode,'manual','Even a sub-step input changes the selected mode immediately');
 session.setMode('approach');session.advance(0,{fine:true});assert.equal(session.mode,'approach','A settings flag alone is not manual actuation');
}

// A pause is no advance call: reads cannot move the vehicle or qualify a gate.
{
 const session=new DockingTraining('alignment');session.setMode('approach');session.advance(.25);
 const state=copy(session.state),guidance=copy(session.guidance()),remainder=session.remainder;
 for(let i=0;i<100;i++)session.guidance();
 assert.deepEqual(session.state,state);assert.deepEqual(session.guidance(),guidance);assert.equal(session.remainder,remainder);
}

// Unapproved pilot crossings are procedural violations, not invented physical collisions.
{
 const events=[],session=new DockingTraining('approach',{onEvent:event=>events.push(event)});
 session.state={...session.state,position:[0,30.01,0],velocity:[0,-1,0]};session.advance(1);
 assert.equal(session.state.status,'flying');assert.equal(session.finished,false);
 assert.equal(session.violations.length,1);assert.equal(session.guidance().gate.distance,5);
 session.advance(1);assert.equal(session.violations.length,1);
 session.state={...session.state,position:[0,5.01,0],velocity:[0,-.5,0]};session.advance(1);
 assert.equal(session.state.status,'flying');assert.equal(session.violations.length,2);assert.equal(session.guidance().gate,null);
 assert.equal(events.filter(event=>event.type==='gate-violation').length,2);
}

// Finishing a run preserves the last physical state; reset starts a separate deterministic run.
{
 const events=[],samples=[],session=new DockingTraining('alignment',{onEvent:event=>events.push(event),onStep:(state,context)=>samples.push({state:copy(state),context:copy(context)})});
 assert.equal(samples.length,1);assert.equal(samples[0].context.initial,true);
 session.advance(.01);assert.equal(samples.length,1);
 session.advance(.01);assert.equal(samples.length,2);assert.equal(samples[1].context.initial,false);
 assert.equal(samples[1].context.scenario,'alignment');assert.ok(samples[1].context.command);
 const before=copy(session.state);assert.equal(session.finish(),true);assert.equal(session.finish(),false);
 session.advance(1,{translation:[1,0,0]});assert.deepEqual(session.state,before);assert.equal(session.state.status,'flying');
 assert.equal(session.guidance().phase,'finished');assert.equal(session.finishReason,'ended');
 assert.equal(events.filter(event=>event.type==='finished').length,1);
 session.reset('alignment');assert.equal(session.finished,false);assert.equal(session.finishReason,null);
 assert.deepEqual(session.state,new DockingTraining('alignment').state);assert.equal(session.guidance().violations,0);
 for(const distance of [50,200,500]){session.reset(distance);assert.equal(session.state.position[1],distance);assert.deepEqual(session.state.velocity,[0,0,0]);session.reset();assert.equal(session.state.position[1],distance);}
 assert.throws(()=>session.advance(-1));assert.throws(()=>session.advance(NaN));assert.throws(()=>session.advance(2.01));
 assert.throws(()=>session.setMode('teleport'));assert.throws(()=>session.reset('unknown'));
}

// Automation, gate events, impact and accumulated delta-v are identical across frame groupings.
function groupedRun(frame){
 const events=[];let session;
 session=new DockingTraining('alignment',{
  onStep:(state,context)=>{if(!context.initial&&session.guidance().canRelease)session.releaseGate();},
  onEvent:event=>events.push(copy(event)),
 });
 session.setMode('approach');
 for(let i=0;i<Math.ceil(220/frame)&&!session.finished;i++)session.advance(frame);
 assert.equal(session.state.status,'docked');
 return {state:session.state,events,guidance:session.guidance()};
}
assert.deepEqual(groupedRun(.01),groupedRun(.1));
assert.deepEqual(groupedRun(.03),groupedRun(.2));

// All callback payloads are exportable; the guidance limits share physics definitions.
{
 const session=new DockingTraining('alignment');
 assert.equal(session.guidance().speedLimit,null);
 assert.equal(DOCKING_GATE_RULES.at(-1).angularSpeed,DOCKING_LIMITS.captureAngularSpeed);
 assert.ok(Number.isFinite(dockingMetrics(session.state).angularSpeed));
}
console.log('Docking training tests passed:',scenarioResults.map(result=>`${result.scenario} ${result.time.toFixed(1)} s / ${result.deltaV.toFixed(3)} m/s`).join('; '));

// Seeded random starts stay in front of the contact plane and can be recovered.
{
 let seed=76;
 const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
 const session=new DockingTraining('random',{random});
 let previous=session.state.position;
 for(let i=0;i<100;i++){
  session.reset();const {position,velocity,attitude}=session.state;
  assert(position[1]>=50&&position[1]<=500);
  assert(norm(position)<DOCKING_LIMITS.maxRange);
  assert(norm([position[0],position[2]])<=position[1]*.25+1e-9);
  assert.notDeepEqual(position,previous);previous=[...position];
  assert.deepEqual(velocity,[0,0,0]);assert(attitude.every(v=>Math.abs(v)<=10+1e-9));
  session.advance(.02);assert.equal(session.state.status,'flying');
 }
 for(let i=0;i<8;i++){
  session.reset();session.setMode('approach');let peak=0;
  for(let j=0;j<6000&&!session.finished;j++){
   session.advance(.2);peak=Math.max(peak,-session.state.velocity[1]);
   if(session.guidance().canRelease)session.releaseGate();
  }
  assert.equal(session.state.status,'docked');assert.equal(session.violations.length,0);
  assert(peak>.3,'Long-range assistance exceeds the former 0.3 m/s cap');
 }
 // High-speed flight is not clamped; unsafe contact still ends as a collision.
 session.reset('alignment');session.state=setDockingAttitude({...session.state,position:[0,2,0],velocity:[0,-5,0]},[0,0,0]);
 session.advance(.02);assert(-session.state.velocity[1]>4.9);assert.equal(session.state.status,'flying');
 session.advance(.5);assert.equal(session.state.status,'collision');assert.equal(session.state.contactMetrics.captureChecks.speed,false);
}
console.log('Random spawn bounds, reroll, assisted recovery and unrestricted flight with collision checks passed');
