import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {TelemetryAudio,telemetryGate} from '../src/dfh1-telemetry-audio.js';
import {createTelemetryState,renderTelemetry} from '../src/dfh1-telemetry-core.js';

const environment=(t=0)=>({t,position:[7000,0,0],velocity:[0,7,0],sunDir:[1,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],illumination:1,
 pose:{roll:0,pitch:0,yaw:0},rotation:{enabled:true,phase:0,epoch:0},rpm:120});
const simulation=(overrides={})=>({missionId:'dfh1',mode:'custom',speed:1,paused:false,current:environment(),missions:{busy:false},minimap:{dragging:false},timeline:{dragging:false},...overrides});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const cases=[];
function testGate(name,sim,hidden,open){assert.equal(telemetryGate(sim,hidden)==='',open,name);cases.push(name);}

testGate('custom 1x is enabled',simulation(),false,true);
testGate('real time ignores an obsolete speed selector',simulation({mode:'real',speed:3600}),false,true);
testGate('real time still honors pause',simulation({mode:'real',speed:3600,paused:true}),false,false);
for(const speed of [0,-1,2,100])testGate(`custom speed ${speed} is blocked`,simulation({speed}),false,false);
for(const [name,override] of [
 ['pause',{paused:true}],['map drag',{minimap:{dragging:true}}],['timeline drag',{timeline:{dragging:true}}],
 ['missing orbit',{current:null}],['mission transition',{missions:{busy:true}}],['scene restore',{sceneBusy:true}],['another mission',{missionId:'tiangong'}]
])testGate(name,simulation(override),false,false);
testGate('hidden document',simulation(),true,false);testGate('missing simulation',null,false,false);

// The actual production module runs against deterministic host mocks; no device,
// real timers, renderer, external network or browser permission is required.
const saved=new Map(['AudioContext','webkitAudioContext','AudioWorkletNode','__TELEMETRY_WORKLET_SOURCE__','setInterval','clearInterval'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
const configurations=[],contexts=[],nodes=[],timers=new Map();let timerId=0;
class FakeParam{
 constructor(){this.value=1;this.events=[];}
 cancelScheduledValues(...a){this.events.push(['cancel',...a]);}
 setTargetAtTime(...a){this.events.push(['target',...a]);}
 setValueAtTime(...a){this.events.push(['set',...a]);}
 linearRampToValueAtTime(...a){this.events.push(['ramp',...a]);}
}
class FakeGain{
 constructor(){this.gain=new FakeParam();}
 connect(){return this;}disconnect(){this.disconnected=true;}
}
class FakeSource{
 constructor(){this.starts=[];this.stops=[];}
 connect(){return this;}disconnect(){this.disconnected=true;}
 start(t){this.starts.push(t);}
 stop(t){this.stops.push(t);}
}
class FakeContext{
 constructor(){
  this.config=configurations.shift()??{};this.currentTime=0;this.sampleRate=48000;this.state='suspended';this.destination={};this.sources=[];
  this.resumeCalls=0;this.closed=false;
  if(this.config.worklet!==false)this.audioWorklet={addModule:url=>{this.moduleURL=url;return this.config.module?.promise??Promise.resolve();}};
  contexts.push(this);
 }
 createGain(){return new FakeGain();}
 async resume(){this.resumeCalls++;if(this.config.resume)await this.config.resume.promise;this.state='running';}
 async close(){this.closed=true;this.state='closed';}
 createBuffer(channels,length,sampleRate){return {channels,length,sampleRate,copyToChannel(pcm,channel){this.pcm=new Float32Array(pcm);this.channel=channel;}};}
 createBufferSource(){const source=new FakeSource();this.sources.push(source);return source;}
}
class FakeWorkletNode{
 constructor(context,name,options){this.context=context;this.name=name;this.options=options;this.messages=[];
  this.port={postMessage:m=>this.messages.push(structuredClone(m)),onmessage:null};nodes.push(this);
 }
 connect(){return this;}
 disconnect(){this.disconnected=true;}
}
Object.assign(globalThis,{AudioContext:FakeContext,AudioWorkletNode:FakeWorkletNode,__TELEMETRY_WORKLET_SOURCE__:'/* Module bytes are not executed by the host mock. */',
 setInterval:callback=>{const id=++timerId;timers.set(id,callback);return id;},clearInterval:id=>timers.delete(id)});

try{
 // Resume must be initiated in the original gesture, and late prepare completion
 // must not undo a user's stop.
 {
  const module=deferred(),resume=deferred();configurations.push({module,resume});
  const engine=new TelemetryAudio();engine.update(environment(),'','pose0');const pending=engine.start();
  assert.equal(engine.context.resumeCalls,1);assert.equal(engine.backend,undefined);
  engine.stop();module.resolve();resume.resolve();assert.equal(await pending,false);
  assert.equal(engine.active,false);assert.equal(engine.want,false);assert.ok(!engine.node.messages.some(m=>m.active));
  cases.push('stop cancels asynchronous prepare/resume');
 }
 // Execute the actual MusicPlayer mode-change and pause methods without its DOM
 // constructor. Rendering and the historical recording's playback are the stubs.
 {
  const playerSource=fs.readFileSync(new URL('../src/music-player.js',import.meta.url),'utf8');
  const sandbox={clearTimeout,console};
  vm.runInNewContext(playerSource.replace(/^import .*;\n/gm,'').replace('export class MusicPlayer','class MusicPlayer')+'\nglobalThis.TestMusicPlayer=MusicPlayer;',sandbox);
  const module=deferred();configurations.push({module});const engine=new TelemetryAudio();engine.update(environment(),'','pose0');const pending=engine.start();
  const player=Object.create(sandbox.TestMusicPlayer.prototype);let recordingRequests=0;
  Object.assign(player,{broadcast:true,broadcastMode:'telemetry',wantPlayback:true,playToken:0,audio:{pause(){}},
   telemetry:{engine,reset(){},render(){}},render(){},renderPlayback(){},play(){recordingRequests++;}});
  player.setBroadcastMode('recording');assert.equal(player.broadcastMode,'recording');assert.equal(recordingRequests,1);
  module.resolve();assert.equal(await pending,false);assert.equal(engine.want,false);assert.ok(!engine.node.messages.some(m=>m.active));
  cases.push('actual mode change cancels pending live audio');
 }
 // Two starts around a stop may share a module-load promise; only the latest
 // generation may activate it.
 {
  const module=deferred();configurations.push({module});const engine=new TelemetryAudio();engine.update(environment(),'','pose0');
  const first=engine.start();engine.stop();const second=engine.start();module.resolve();
  assert.equal(await first,false);assert.equal(await second,true);assert.equal(engine.active,true);
  assert.equal(engine.node.messages.filter(m=>m.active).length,1);engine.stop();
  cases.push('overlapping starts preserve the latest generation');
 }
 // A closed time gate while module loading is pending suppresses activation but
 // preserves user intent; restoring a valid 1x snapshot starts a fresh generation.
 {
  const module=deferred();configurations.push({module});const engine=new TelemetryAudio();engine.update(environment(),'','pose0');
  const pending=engine.start();engine.update(null,'等待轨道数据','none');module.resolve();assert.equal(await pending,true);
  assert.equal(engine.active,false);assert.ok(!engine.node.messages.some(m=>m.active));
  engine.update(environment(),'','pose0');assert.equal(engine.active,true);engine.stop();
  cases.push('missing snapshot during prepare stays silent until data recovers');
 }
 {
  configurations.push({});const received=[],engine=new TelemetryAudio((r,status)=>received.push({r,status}));
  engine.update(environment(),'','pose0');assert.equal(await engine.start(),true);
  const context=engine.context,node=engine.node,initialGeneration=engine.generation;
  assert.equal(node.messages.at(-1).active,true);assert.equal(node.messages.at(-1).reset,true);
  // Frequent rendering updates are throttled, without losing the audio anchor.
  context.currentTime=.01;engine.update(environment(10),'','pose0');assert.equal(engine.generation,initialGeneration);
  assert.equal(node.messages.filter(m=>m.active).length,1);
  context.currentTime=.05;engine.update(environment(50),'','pose0');assert.equal(node.messages.at(-1).reset,false);
  assert.equal(engine.generation,initialGeneration);
  const acceptedGeneration=engine.generation;
  node.port.onmessage({data:{generation:acceptedGeneration-1,active:true,readings:{staleMarker:1}}});assert.equal(received.length,0);
  node.port.onmessage({data:{generation:acceptedGeneration,active:true,readings:{sun:1}}});assert.equal(received.length,1);assert.equal(engine.audible,true);
  // Every requested gating case actually dispatches silence, not just a label.
  for(const [name,sim,hidden] of [
   ['pause',simulation({paused:true}),false],['map drag',simulation({minimap:{dragging:true}}),false],
   ['timeline drag',simulation({timeline:{dragging:true}}),false],['null',simulation({current:null}),false],
   ['hidden',simulation(),true],['busy',simulation({missions:{busy:true}}),false],['2x',simulation({speed:2}),false]
  ]){
   context.currentTime+=.05;const prior=engine.generation;
   engine.update(name==='null'?null:environment(context.currentTime*1000),telemetryGate(sim,hidden),'pose0');
   assert.equal(engine.active,false,name);assert.equal(engine.audible,false,name);assert.ok(engine.generation>prior,name);
   assert.equal(node.messages.at(-1).active,false,name);assert.equal(engine.want,true,name);
   context.currentTime+=.05;engine.update(environment(context.currentTime*1000),'','pose0');
   assert.equal(engine.active,true,`${name} recovery`);assert.equal(node.messages.at(-1).reset,true,`${name} recovery`);
  }
  cases.push('pause/drag/null/hidden/busy/non-1x stop and recover the live transport');
  const beforePose=engine.generation;context.currentTime+=.05;
  engine.update({...environment(context.currentTime*1000),pose:{roll:20,pitch:10,yaw:60}},'','pose1');
  assert.ok(engine.generation>beforePose);assert.equal(node.messages.at(-1).reset,true);
  const beforeChannel=engine.generation;engine.setChannel('earth');assert.ok(engine.generation>beforeChannel);assert.equal(node.messages.at(-1).channel,'earth');
  const beforeStale=engine.generation;context.currentTime+=.4;engine.update(environment(context.currentTime*1000),'','pose1');
  assert.ok(engine.generation>beforeStale);assert.equal(node.messages.at(-1).reset,true);
  const beforeSeek=engine.generation;context.currentTime+=.05;engine.update(environment(100000),'','pose1');assert.ok(engine.generation>beforeSeek);
  cases.push('pose/channel/long-gap/seek reset the transport generation');
  engine.stop();const stopped=engine.generation;
  node.port.onmessage({data:{generation:stopped-1,active:true,readings:{}}});assert.equal(engine.audible,false);
  engine.setVolume(.7,false);assert.deepEqual(engine.gain.gain.events.at(-1),['target',.7,context.currentTime,.008]);
  engine.setVolume(.7,true);assert.deepEqual(engine.gain.gain.events.at(-1),['target',0,context.currentTime,.008]);
 }
 // Exercise the actual buffer fallback with manual clock/timer advancement.
 {
  configurations.push({worklet:false});const received=[],engine=new TelemetryAudio((r,status)=>received.push({r,status}));
  engine.update(environment(),'','pose0');await engine.start();assert.equal(engine.backend,'buffer');
  const context=engine.context;assert.ok(context.sources.length>0);assert.equal(engine.audible,true);
  assert.ok(context.sources.every(s=>s.buffer.pcm.some(v=>v!==0)));assert.equal(timers.size,1);
  context.currentTime=.1;engine.fillBuffers();
  assert.ok(received.some(({r,status})=>r&&status.active&&status.generation===engine.generation),'fallback active reports carry their generation');
  const scheduled=[...engine.sources];context.currentTime=.4;engine.fillBuffers();
  assert.equal(engine.audible,false);assert.equal(engine.sources.size,0);assert.equal(timers.size,0);assert.equal(received.at(-1).status.stale,true);
  assert.equal(received.at(-1).status.generation,engine.generation,'fallback stale reports carry their generation');
  assert.equal(engine.readingQueue.length,0,'stale fallback clears queued readings');
  assert.ok(scheduled.every(entry=>Math.abs(entry.source.stops.at(-1)-.42)<1e-12),'stale sources receive bounded fade/stop');
  const staleGeneration=engine.generation;engine.update(environment(400),'','pose0');
  assert.ok(engine.generation>staleGeneration);assert.equal(engine.audible,true);assert.equal(timers.size,1);
  engine.update(null,'等待轨道数据','none');assert.equal(timers.size,0);assert.equal(engine.audible,false);engine.stop();
  cases.push('fallback schedules PCM, fades stale sources and resumes from fresh data');
 }
 // Worklet module failure must use the implemented fallback, not lose the play.
 {
  const module=deferred();configurations.push({module});const engine=new TelemetryAudio();engine.update(environment(),'','pose0');const pending=engine.start();
  module.reject(Error('mock worklet module unsupported'));await pending;assert.equal(engine.backend,'buffer');assert.equal(engine.audible,true);engine.stop();
  cases.push('worklet preparation failure falls back to PCM buffers');
 }
 // A runtime processor failure is different from addModule rejection: the bad
 // node must be disconnected and its message handler detached before retry.
 {
  configurations.push({});const received=[],engine=new TelemetryAudio((r,status)=>received.push({r,status}));
  engine.update(environment(),'','pose0');await engine.start();const failedNode=engine.node,failedGeneration=engine.generation;
  failedNode.onprocessorerror();
  assert.equal(failedNode.disconnected,true);assert.equal(failedNode.port.onmessage,null);assert.equal(engine.node,null);
  assert.equal(engine.backend,'buffer');assert.equal(engine.want,false);assert.equal(engine.active,false);assert.equal(engine.audible,false);
  assert.ok(engine.error);assert.ok(engine.generation>failedGeneration);
  assert.equal(received.at(-1).r,null);assert.equal(received.at(-1).status.generation,engine.generation);assert.ok(received.at(-1).status.error);
  const context=engine.context;context.currentTime=.1;engine.update(environment(100),'','pose0');
  assert.equal(await engine.start(),true);assert.equal(engine.error,null,'explicit retry clears previous processor error');
  assert.equal(engine.backend,'buffer');assert.equal(engine.context,context,'retry reuses the running context');
  assert.equal(engine.active,true);assert.equal(engine.audible,true);assert.ok(context.sources.some(source=>source.buffer.pcm.some(x=>x!==0)));
  engine.stop();assert.equal(timers.size,0);
  cases.push('processorerror disconnects dead node and explicit retry produces fallback PCM');
 }
 // Exercise a real core-render failure in the fallback. The exception must not
 // escape a timer callback, leave old buffers playing, or retain stale readouts.
 {
  configurations.push({worklet:false});const received=[],engine=new TelemetryAudio((r,status)=>received.push({r,status}));
  engine.update(environment(),'','pose0');await engine.start();assert.ok(engine.readingQueue.length>0);
  const scheduled=[...engine.sources],priorGeneration=engine.generation;engine.context.currentTime=.1;
  assert.doesNotThrow(()=>engine.update({...environment(100),position:[0,0,0]},'','pose0'));
  assert.equal(engine.want,false);assert.equal(engine.active,false);assert.equal(engine.audible,false);assert.ok(engine.error);
  assert.ok(engine.generation>priorGeneration);assert.equal(engine.sources.size,0);assert.equal(engine.readingQueue.length,0);assert.equal(timers.size,0);
  assert.ok(scheduled.every(entry=>entry.source.stops.length>0),'fallback failure releases all scheduled sources');
  assert.equal(received.at(-1).status.generation,engine.generation);assert.ok(received.at(-1).status.error);
  engine.update(environment(100),'','pose0');await engine.start();assert.equal(engine.error,null);assert.equal(engine.audible,true);
  engine.stop();assert.equal(engine.readingQueue.length,0);
  cases.push('fallback render exception stops safely, clears queue and can recover');
 }
 assert.equal(timers.size,0);
}finally{
 for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}

// Run the real processor body in a VM audio-worklet global scope. Only the module
// import is replaced by actual imported core functions; process() is unmodified.
const processorSource=fs.readFileSync(new URL('../src/dfh1-telemetry-worklet.js',import.meta.url),'utf8');
let Processor;const processorMessages=[];
class MockProcessorBase{constructor(){this.port={onmessage:null,postMessage:m=>processorMessages.push(structuredClone(m))};}}
const workletScope={AudioWorkletProcessor:MockProcessorBase,createTelemetryState,renderTelemetry,currentTime:0,sampleRate:48000,
 registerProcessor(name,klass){assert.equal(name,'dfh1-telemetry');Processor=klass;}};
vm.runInNewContext(processorSource.replace(/^import .*;\n/gm,''),workletScope,{filename:'actual-dfh1-telemetry-worklet.js'});
const processor=new Processor();
function message(generation,active,reset=false,extra={}){
 processor.port.onmessage({data:{generation,active,reset,environment:environment(workletScope.currentTime*1000),channel:'sequence',audioTime:workletScope.currentTime,
  anchor:{sim:workletScope.currentTime*1000,audio:workletScope.currentTime},epoch:0,...extra}});
}
function processAt(time,frames=128){
 workletScope.currentTime=time;const pcm=new Float32Array(frames);assert.equal(processor.process([],[[pcm]]),true);return pcm;
}
assert.ok(processAt(0).every(x=>x===0),'idle processor is silent');
message(5,true,true);let pcm;
for(let j=0;j<25;j++)pcm=processAt(j*128/48000);
assert.ok(pcm.some(x=>Math.abs(x)>.01),'fresh snapshots produce real PCM');
assert.ok(processorMessages.some(m=>m.active&&m.readings));
const activeAnchor=processor.anchor;
message(4,false,true);assert.equal(processor.generation,5);assert.equal(processor.active,true);assert.equal(processor.anchor,activeAnchor);
// No refresh for >350 ms: finish a 15 ms fade, then assert exact silence and stale
// readouts. A long stale interval must not continue synthetic telemetry forever.
for(let j=0;j<25;j++)pcm=processAt(.36+j*128/48000);
assert.ok(pcm.every(x=>x===0),'expired environment becomes exactly silent');
assert.ok(processorMessages.some(m=>m.stale&&!m.active&&m.readings===null));
message(6,true,true);for(let j=0;j<10;j++)pcm=processAt(.43+j*128/48000);
assert.ok(pcm.some(x=>x!==0),'fresh generation resumes after stale fade');
const lastValidEnvironment=processor.environment,lastValidAnchor=processor.anchor,errorCount=processorMessages.filter(m=>m.error).length;
// Mirrors hidden-tab / null-current handling: the transport sends no orbit and
// clears its own anchor, but the processor still needs its OLD orbit for release.
message(7,false,false,{environment:null,anchor:null});
assert.equal(processor.environment,lastValidEnvironment,'null stop preserves the prior orbit exclusively for its release');
assert.equal(processor.anchor,lastValidAnchor);
pcm=processAt(.47);assert.ok(pcm.some(x=>x!==0),'null-environment stop fades rather than cutting to zero on a validation error');
assert.ok(processor.envelope>0&&processor.envelope<1);
for(let j=1;j<15;j++)pcm=processAt(.47+j*128/48000);
assert.ok(pcm.every(x=>x===0),'explicit stop fades to silence');
assert.equal(processorMessages.filter(m=>m.error).length,errorCount,'hidden null environment is not a probe error');
message(6,true,true);assert.equal(processor.generation,7);assert.equal(processor.active,false);
assert.ok(processAt(.6).every(x=>x===0),'late active message cannot undo stop');
cases.push('actual worklet renders, expires stale snapshots, fades and rejects older generations');
cases.push('actual worklet hidden/null-environment stop releases using its last valid orbit');

console.log('DFH-1 telemetry audio lifecycle passed', {cases:cases.length,mockContexts:contexts.length,mockWorkletNodes:nodes.length,processorReports:processorMessages.length});
