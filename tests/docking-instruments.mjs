import assert from 'node:assert/strict';
import {dockingInitial,dockingQuaternion,hcwStep,stepDocking,DOCKING_THRUST,DOCKING_MODEL_VERSION} from '../src/docking-physics.js';
import {deriveDockingInstruments,predictDockingCoast,DockingRecorder,DOCKING_RECORD_SCHEMA} from '../src/docking-instruments.js';
import {DockingTraining} from '../src/docking-training.js';

const near=(actual,expected,tolerance=1e-9)=>assert(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
const vectorNear=(actual,expected,tolerance=1e-9)=>actual.forEach((value,index)=>near(value,expected[index],tolerance));
const state=(overrides={})=>({...dockingInitial(),...overrides});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

// Signed port-frame navigation is not the screen direction of the target marker.
const nav=deriveDockingInstruments(state({position:[2,10,-3],velocity:[.4,-.2,-.3]}));
assert.equal(nav.right,-3);assert.equal(nav.up,2);assert.equal(nav.rightVelocity,-.3);assert.equal(nav.upVelocity,.4);
assert.equal(nav.axialDistance,10);assert.equal(nav.axialClosing,.2);near(nav.lateralSpeed,.5);near(nav.lateralOffset,Math.sqrt(13));
near(nav.idealStoppingDistance,.2**2/(2*DOCKING_THRUST));
near(deriveDockingInstruments(state({velocity:[0,-.2,0]}),{fine:true}).idealStoppingDistance,nav.idealStoppingDistance*5);
const differentSigns=deriveDockingInstruments(state({position:[10,1,0],velocity:[-1,.2,0]}));
assert(differentSigns.losClosing>0&&differentSigns.axialClosing<0,'LOS closure must not be substituted for axial closure');
assert.equal(differentSigns.idealStoppingDistance,0,'an opening trajectory has no forward stopping distance');
assert.equal(deriveDockingInstruments(state({position:[0,30,0]})).corridorActive,false);
assert.equal(deriveDockingInstruments(state({position:[0,29,0]})).corridorActive,true);
near(deriveDockingInstruments(state({position:[0,0,0]})).losClosing,0);

// Canonical quaternion wins over a stale compatibility Euler field. Body rates are radians/s.
const rotated=state({position:[2,10,-3],velocity:[.4,-.2,-.3],quaternion:dockingQuaternion([0,0,90]),attitude:[0,0,-40],angularVelocity:[Math.PI/180,-2*Math.PI/180,3*Math.PI/180]});
const rotation=deriveDockingInstruments(rotated);
vectorNear(rotation.attitudeDeg,[0,0,90]);vectorNear(rotation.angularRateDegPerSec,[1,-2,3]);near(rotation.angularSpeedDegPerSec,Math.sqrt(14));
near(rotation.attitudeErrorDeg,90);assert.equal(rotation.right,nav.right);assert.equal(rotation.up,nav.up);
const inverseQuaternion=deriveDockingInstruments({...rotated,quaternion:rotated.quaternion.map(value=>-value)});
near(inverseQuaternion.attitudeErrorDeg,rotation.attitudeErrorDeg);

// Closed-form coast prediction is independently checked against small-step RK4 dynamics.
const initial=freeze(state({position:[17,100,9],velocity:[.2,-.1,.03],time:9})),before=JSON.stringify(initial);
const prediction=predictDockingCoast(initial,{seconds:37,step:2});
assert.equal(prediction[0].elapsed,0);assert.equal(prediction.at(-1).elapsed,37);assert.equal(prediction.at(-1).time,46);
vectorNear(prediction[0].position,initial.position);
let numerical={position:[...initial.position],velocity:[...initial.velocity]};
for(let index=0;index<1850;index++)numerical=hcwStep(numerical.position,numerical.velocity,[0,0,0],.02);
vectorNear(prediction.at(-1).position,numerical.position,1e-8);
assert.equal(JSON.stringify(initial),before,'prediction must not mutate the live state');
prediction[0].position[0]=999;assert.equal(initial.position[0],17);
const capped=predictDockingCoast(initial,{seconds:600,step:.01});assert.equal(capped.length,121);assert.equal(capped.at(-1).elapsed,600);
assert.equal(predictDockingCoast(initial,{seconds:0}).length,1);
assert.throws(()=>predictDockingCoast(initial,{seconds:-1}));assert.throws(()=>predictDockingCoast(initial,{step:0}));
assert.throws(()=>deriveDockingInstruments(state({quaternion:[0,0,0,0]})));

// Storage is bounded; statistics cover every fixed step, including discarded samples.
const metadata={id:'drift',label:'A "test", with\nnew line'},recorder=new DockingRecorder(metadata,{maxSamples:3,sampleInterval:.2,maxEvents:2});
const context={mode:'manual',phase:'approach',command:{translation:[1,0,0]},speedLimit:.1};
for(let index=0;index<=50;index++)recorder.sample(state({time:index*.02,position:[index===1?9:0,200-index*.02,0],velocity:[0,-.2,0],deltaV:index*.001}),context);
metadata.id='changed';context.command.translation[0]=-1;
assert.equal(recorder.samples.length,3);vectorNear(recorder.samples.map(sample=>sample.time),[.6,.8,1]);
assert.equal(recorder.summary().droppedSamples,3);near(recorder.summary().timeAboveSpeedLimit,1);assert.equal(recorder.summary().maxLateralOffset,9,'unsampled peaks must still be retained');
assert.equal(recorder.samples[0].context.command.translation[0],1);assert.equal(recorder.summary().scenario.id,'drift');
const replay=JSON.parse(JSON.stringify(recorder.samples));replay[0].position[1]=999;assert.notEqual(recorder.samples[0].position[1],999);
assert.throws(()=>{recorder.samples[0].position[0]=99;},TypeError,'snapshots are immutable');
assert.throws(()=>recorder.sample(state({time:.5})),RangeError);

// Advisory speed tolerances absorb harmless settling/round-off, without changing
// the physics module's strict capture checks or the recorded raw velocity.
for(const [closing,expectedDuration]of [[.1+Number.EPSILON,0],[.101,0],[.103,1]]){
 const advisoryRecorder=new DockingRecorder();
 for(let index=0;index<=50;index++)advisoryRecorder.sample(state({time:index*.02,position:[0,10,0],velocity:[0,-closing,0]}),{speedLimit:.1});
 near(advisoryRecorder.summary().timeAboveSpeedLimit,expectedDuration);near(advisoryRecorder.summary().maxClosing,closing);
}

// Exports preserve arbitrary CSV text while keeping formula-like text inert in spreadsheets.
for(const [index,text]of ['normal','=HYPERLINK("bad")',' \t+SUM(1,2)'].entries())recorder.event({type:text,time:index,messageKey:'@unsafe',detail:{text:'quoted,"line"\nnext'}});
assert.equal(recorder.events.length,2);assert.equal(recorder.summary().droppedEvents,1);
assert.equal(recorder.summary().eventCounts.normal,1,'event counters cover events evicted from bounded storage');
const json=recorder.exportJSON(),csv=recorder.exportCSV(),report=JSON.parse(json);
assert.equal(report.schema.modelVersion,DOCKING_MODEL_VERSION);assert.equal(DOCKING_RECORD_SCHEMA.units.angularVelocity,'rad/s');
assert(csv.includes("'=HYPERLINK"));assert(csv.includes("' \t+SUM"));assert(csv.includes("'@unsafe"));
assert(csv.includes('roll_deg')&&csv.includes('wx_rad_s')&&csv.includes('# frames'));
assert.equal(recorder.exportJSON(),json,'export does not change samples or statistics');

// Terminal telemetry uses the pre-capture metrics rather than the now-zero live velocity.
const contactState=state({time:1.013,position:[.01,.35,.02],velocity:[0,0,0],status:'docked',deltaV:.08,
 impactState:state({time:1.013,position:[.01,.35,.02],velocity:[.01,-.08,.02],angularVelocity:[0,0,.001],deltaV:.08}),
 contactMetrics:{time:1.013,speed:Math.hypot(.01,.08,.02),axialClosing:.08,angularSpeed:.001,deltaV:.08}});
const summary=recorder.finish(contactState,{mode:'hold',phase:'captured'});
assert.equal(summary.finished,true);assert.equal(summary.status,'docked');near(summary.duration,1.013);
assert.equal(summary.finishReason,'docked');
near(summary.contactMetrics.axialClosing,.08);assert.equal(recorder.samples.at(-1).status,'docked');
assert.equal(recorder.samples.at(-1).velocity[1],0);assert(recorder.samples.at(-1).time<1.02,'terminal sample keeps partial integration time');
const afterFinish=recorder.exportJSON();recorder.finish(contactState);recorder.sample(state({time:2}));assert.equal(recorder.exportJSON(),afterFinish);
summary.contactMetrics.axialClosing=999;near(recorder.summary().contactMetrics.axialClosing,.08);
recorder.reset({id:'new'});assert.equal(recorder.samples.length,0);assert.equal(recorder.events.length,0);assert.equal(recorder.summary().maxSpeed,0);assert.equal(recorder.summary().contactMetrics,null);
const captureOnly=new DockingRecorder();captureOnly.finish(contactState);near(captureOnly.summary().maxClosing,.08);
for(const [closing,expectedStatus]of [[.08,'docked'],[.3,'collision']]){
 const incoming=state({position:[0,.3508,0],velocity:[0,-closing,0]}),actualRecorder=new DockingRecorder();actualRecorder.sample(incoming);
 const terminal=stepDocking(incoming);assert.equal(terminal.status,expectedStatus);assert(terminal.time>0&&terminal.time<.02);
 actualRecorder.sample(terminal);const report=actualRecorder.finish(terminal);
 assert.equal(report.status,expectedStatus);assert(report.contactMetrics.speed>.07);near(report.contactMetrics.time,terminal.time);
 assert.equal(report.contactMetrics.captureChecks.speed,expectedStatus==='docked');assert.equal(actualRecorder.samples.at(-1).time,terminal.time);
 if(expectedStatus==='docked')assert.equal(terminal.velocity[1],0);
}
// Workflow sends the final event before the final step callback. Recording that event
// must not freeze telemetry before the final command/context and impact state arrive.
const integratedRecorder=new DockingRecorder({id:'alignment'},{maxSamples:30,maxEvents:8}),terminalOrder=[];
const training=new DockingTraining('alignment',{
 onEvent:event=>{integratedRecorder.event(event);if(event.type==='finished')terminalOrder.push('event');},
 onStep:(current,context)=>{integratedRecorder.sample(current,context);if(current.status!=='flying'){terminalOrder.push('step');integratedRecorder.finish(current,context);}},
});
training.setMode('approach');
for(let frame=0;frame<180&&!training.finished;frame++){if(training.guidance().canRelease)training.releaseGate();training.advance(2);}
assert.equal(training.state.status,'docked');assert.deepEqual(terminalOrder,['event','step']);
const integratedSummary=integratedRecorder.summary();assert.equal(integratedSummary.finishReason,'docked');assert.equal(integratedSummary.eventCounts.finished,1);
assert.equal(integratedRecorder.samples.at(-1).context.phase,'finished');assert.equal(integratedSummary.contactMetrics.time,training.state.time);
assert(integratedSummary.droppedSamples>0);assert(integratedSummary.maxClosing>integratedSummary.contactMetrics.axialClosing);
integratedRecorder.reset({id:'approach'});training.reset('approach');assert.equal(integratedRecorder.samples.length,1);assert.equal(integratedRecorder.samples[0].time,0);
training.finish('operator-ended');integratedRecorder.finish(training.state,{finishReason:training.finishReason,phase:'finished'});
assert.equal(integratedRecorder.summary().finishReason,'operator-ended');assert.equal(integratedRecorder.summary().status,'flying','operator end must not invent physical capture');
assert.throws(()=>new DockingRecorder({}, {maxSamples:0}));assert.throws(()=>new DockingRecorder({}, {sampleInterval:0}));
console.log('Docking instruments: reference-frame signs, canonical attitude, analytic coast, bounded full-run telemetry, impact snapshots and safe exports passed');
