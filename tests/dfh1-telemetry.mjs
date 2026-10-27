import assert from 'node:assert/strict';
import {Matrix4,Vector3,Group,Euler} from 'three';
import {applyBodyPose} from '../src/spacecraft-model.js';
import {spinAngle} from '../src/spacecraft-attitude.js';
import {TELEMETRY_PROFILE as P,createTelemetryState,sampleSensors,renderTelemetry} from '../src/dfh1-telemetry-core.js';

const radians=x=>x*Math.PI/180;
const close=(a,b,tol=1e-10,label='')=>assert.ok(Math.abs(a-b)<=tol,`${label}: ${a} vs ${b}`);
const environment=(overrides={})=>({t:0,position:[7000,0,0],velocity:[0,0,0],sunDir:[1,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],illumination:1,
 pose:{roll:0,pitch:0,yaw:0},rotation:{enabled:false,phase:0,epoch:0},rpm:120,...overrides});
const SR=48000;
const render=(e,options={})=>renderTelemetry(createTelemetryState(),e,{sampleRate:SR,startTimeMs:0,length:SR/10,channel:'sun',...options});

// Independent optical cases. Earth thermal emission is independent of eclipse.
let s=sampleSensors(environment());close(s.sun,1);close(s.sunVoltage,3);close(s.earth,1);close(s.earthVoltage,3);
s=sampleSensors(environment({sunDir:[.5,Math.sqrt(.75),0]}));close(s.sun,.5);
close(sampleSensors(environment({sunDir:[-1,0,0]})).sun,0);
close(sampleSensors(environment({sunDir:[Math.cos(radians(85)),Math.sin(radians(85)),0]})).sun,0);
close(sampleSensors(environment({illumination:.25})).sun,.25);
s=sampleSensors(environment({illumination:0}));close(s.sun,0);close(s.earth,1);
close(sampleSensors(environment({position:[-7000,0,0]})).earth,0);
const alpha=Math.asin(P.earthRadiusKm/7000);
const limb=sampleSensors(environment({position:[7000*Math.cos(alpha),7000*Math.sin(alpha),0]}));
assert.ok(limb.earth>.35&&limb.earth<.65,'A partial Earth view is not normalized back to full signal');
assert.ok(sampleSensors(environment({position:[9000,0,0]})).earthAngularRadiusDeg<s.earthAngularRadiusDeg);

// Camera and UI state cannot affect the pure orbit/body-frame sensor calculation.
const cameraFree=environment({rotation:{enabled:true,phase:.3,epoch:0}});
assert.deepEqual(sampleSensors(cameraFree,40),sampleSensors({...cameraFree,camera:{position:[999,100,2]},controls:{azimuth:99},view:'overview'},40));

// Verify the full inverse against the SAME Three.js body pose used by the scene,
// with nontrivial independent reference basis, all pose axes, spin and epoch.
for(let j=0;j<30;j++){
 const reference=new Matrix4().makeRotationFromEuler(new Euler(.27+j*.01,-.8+j*.02,.4-j*.03,'ZYX'));
 const basis=[0,1,2].map(i=>new Vector3().setFromMatrixColumn(reference,i).toArray());
 const e=environment({basis,pose:{roll:37+j,pitch:-26+j*.3,yaw:121-j*2},rotation:{enabled:j%2===0,phase:.15+j*.06,epoch:100},rpm:120,t:200});
 const time=200+j*7.3,body=new Group();applyBodyPose(body,e.pose,spinAngle(e.rotation,time,e.rpm));
 const world=reference.clone().multiply(body.matrixWorld);
 e.sunDir=new Vector3(.5,Math.sqrt(.75),0).transformDirection(world).toArray();
 e.position=new Vector3(1,0,0).transformDirection(world).multiplyScalar(7000).toArray();
 const reading=sampleSensors(e,time);close(reading.sun,.5,1e-12,'Three.js composed attitude');close(reading.earth,1);
}

// Explicit short extrapolation, including a bounded old snapshot.
const moving=environment({velocity:[7,0,0]});
close(sampleSensors(moving,500).earthAngularRadiusDeg,Math.asin(P.earthRadiusKm/7003.5)*180/Math.PI);
close(sampleSensors(moving,500).earthAngularRadiusDeg,sampleSensors(moving,5000).earthAngularRadiusDeg);
assert.equal(sampleSensors(moving,5000).extrapolationLimited,true);

// Recover frequency from actual PCM zero crossings, without calling the VCO
// mapping or reading its reported frequency. Subsample crossing interpolation.
function measuredHz(pcm,start=0,end=pcm.length,sampleRate=SR){
 const crossings=[];
 for(let i=Math.max(1,start);i<end;i++)if(pcm[i-1]<=0&&pcm[i]>0)crossings.push(i-1-pcm[i-1]/(pcm[i]-pcm[i-1]));
 assert.ok(crossings.length>5,'enough audio cycles to measure frequency');
 return (crossings.length-1)*sampleRate/(crossings.at(-1)-crossings[0]);
}
for(const [voltage,hz] of [[0,880],[1.5,1100],[3,1320]]){
 const e=environment({illumination:voltage/3});
 const out=render(e,{length:SR/4});close(measuredHz(out.pcm),hz,.02,'PCM independent frequency');
 close((measuredHz(out.pcm)-880)*3/440,voltage,.0001,'PCM voltage readback');close(out.readings.frequencyHz,hz,1e-9);
}

// Decode the five experimental references directly from audio, then verify that
// the long solar/IR stretches remain continuous inputs rather than held samples.
const sequence=render(environment({illumination:.4}),{channel:'sequence',length:10*SR});
for(const [slot,hz] of [[1,1320],[2,1320],[3,880],[4,1100],[5,880],[6,1056],[18,1056],[19,1320],[32,1320]]){
 const start=(slot-1)*.3125;
 close(measuredHz(sequence.pcm,Math.round((start+.035)*SR),Math.round((start+.27)*SR)),hz,.025,`slot ${slot} PCM`);
}
for(const [time,slot] of [[0,1],[312.5,2],[625,3],[1562.5,6],[5625,19],[9999,32],[10000,1],[-.1,32]]){
 const out=render(environment(),{startTimeMs:time,length:1,channel:'sequence'});assert.equal(out.readings.currentSlot,slot);
}
assert.equal(render(environment(),{startTimeMs:5625,cycleEpochMs:5625,length:1,channel:'sequence'}).readings.currentSlot,1);
const spinning=environment({rotation:{enabled:true,phase:0,epoch:0}});
const spinAudio=render(spinning,{length:SR/2});
assert.ok(measuredHz(spinAudio.pcm,SR*.18,SR*.26)<910,'sensor falls to dark through rotation');
assert.ok(measuredHz(spinAudio.pcm,SR*.44,SR*.48)>1200,'sensor returns toward the Sun');

// Streaming must give the same PCM as a monolithic render across 1 kHz sensor
// grid boundaries and a 312.5 ms commutator boundary (no per-buffer phase reset).
const whole=renderTelemetry(createTelemetryState(),spinning,{sampleRate:SR,startTimeMs:0,length:SR,channel:'sequence'}).pcm;
const state=createTelemetryState(),chunks=new Float32Array(SR);let offset=0,chunkIndex=0;
while(offset<SR){
 const count=Math.min([127,256,511,1024,137][chunkIndex++%5],SR-offset);
 const out=renderTelemetry(state,spinning,{sampleRate:SR,startTimeMs:offset*1000/SR,length:count,channel:'sequence'});
 chunks.set(out.pcm,offset);offset+=count;
}
let maxDiff=0;for(let i=0;i<SR;i++)maxDiff=Math.max(maxDiff,Math.abs(chunks[i]-whole[i]));
assert.ok(maxDiff<1e-7,`chunk invariance: ${maxDiff}`);
assert.equal(state.renderedSamples,SR);

// A held setting change should have an actual thermal/electronic transient.
const transient=createTelemetryState();
renderTelemetry(transient,environment({illumination:0}),{sampleRate:SR,startTimeMs:0,length:SR/10,channel:'sun'});
const rise=renderTelemetry(transient,environment({t:100}),{sampleRate:SR,startTimeMs:100,length:Math.round(SR*.011),channel:'sun'});
assert.ok(rise.readings.sun>.57&&rise.readings.sun<.70,'solar first-order rise is near 63% after one time constant');
// A seek reinitializes sensors at the new epoch but keeps oscillator phase.
const before=transient.phase;
const seek=renderTelemetry(transient,environment({t:1000,illumination:0}),{sampleRate:SR,startTimeMs:1000,length:1,channel:'sun'});
close(seek.pcm[0],P.audio.amplitude*Math.sin(before),1e-8);close(seek.readings.sun,0);

// Long-epoch input precision, clipping, invalid geometry and resource bounds.
const epoch=Date.UTC(2026,9,27),longEnvironment=environment({t:epoch,rotation:{enabled:true,phase:.2,epoch}});
const longAudio=render(longEnvironment,{startTimeMs:epoch,length:SR});
assert.ok(longAudio.pcm.every(Number.isFinite));assert.ok(longAudio.pcm.every(x=>Math.abs(x)<=P.audio.amplitude+1e-7));
assert.equal(sampleSensors(environment({illumination:2})).sun,1);
assert.equal(render(environment(),{length:0}).readings,null);
assert.throws(()=>sampleSensors(environment({position:[0,0,0]})),/outside Earth/);
assert.throws(()=>sampleSensors(environment({sunDir:[NaN,0,0]})),/Sun direction/);
assert.throws(()=>sampleSensors(environment({basis:[[1,0,0],[1,0,0],[0,0,1]]})),/orthogonal/);
assert.throws(()=>render(environment(),{sampleRate:1000}),/sample rate/);
assert.throws(()=>render(environment(),{length:SR*31}),/buffer length/);
assert.throws(()=>render(environment(),{channel:'unknown'}),/Unknown/);
assert.equal(P.source,'model');assert.equal(P.sequence.source,'model');assert.equal(P.sequence.provisional,true);
assert.ok(Object.isFrozen(P.sun.axis));
// Report a worklet-sized workload without a hardware-dependent pass threshold.
const benchmarkState=createTelemetryState(),benchmarkEnvironment=environment({rotation:{enabled:true,phase:.3,epoch:0}});
const benchmarkStart=performance.now();
for(let j=0;j<1000;j++){
 benchmarkEnvironment.t=j*128*1000/SR;
 renderTelemetry(benchmarkState,benchmarkEnvironment,{sampleRate:SR,startTimeMs:benchmarkEnvironment.t,length:128,channel:'sequence'});
}
const benchmarkMs=performance.now()-benchmarkStart,audioDurationMs=1000*128*1000/SR;
console.log('DFH-1 reference telemetry: physical geometry, Three.js attitude, day/night, measured PCM frequencies, slot boundaries, streaming and filter response passed',
 {maxChunkDifference:maxDiff,benchmarkBlocks:1000,benchmarkFrames:128,benchmarkMs,audioDurationMs,realtimeBudgetFraction:benchmarkMs/audioDurationMs});
