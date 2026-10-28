import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {scanOrbitEvents,TIME_TOLERANCE} from '../src/orbit-events.js';

// Run the real event handlers with a small DOM, including the saved playback state.
let nodes;
function element(){
 return {style:{},children:[],classList:{toggle(){}},setAttribute(){},addEventListener(){},
  replaceChildren(...children){this.children=children;},append(child){this.children.push(child);}};
}
globalThis.document={body:element(),getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element};
Object.defineProperty(globalThis,'localStorage',{value:{getItem(){return null;},setItem(){}},configurable:true});
const source=await build({entryPoints:['src/event-timeline.js'],bundle:true,platform:'node',format:'esm',write:false});
const {EventTimeline}=await import('data:text/javascript;base64,'+Buffer.from(source.outputFiles[0].text).toString('base64'));
const epoch=Date.parse('2026-10-28T00:00:00Z');
const events=[['penumbra-enter',1000],['umbra-enter',3000],['perigee',60000],['descending',120000],['apogee',200000]].map(([type,time])=>({type,time:epoch+time}));
function timeline({mode='custom',paused=false,speed=60,time=epoch+230000,items=events}={}){
 nodes=new Map();
 const sim={mode,paused,speed,time,timeUI(){this.uiPaused=this.paused;}};
 sim.sessionMemory={save(){sim.saved={mode:sim.mode,paused:sim.paused,time:sim.time,speed:sim.speed};}};
 const l=new EventTimeline(sim);l.cache.result={start:epoch,end:epoch+3600000,events:items};
 // Cache loading is tested separately; these handlers must use the same candidates
 // for selection and button state, without running a browser animation loop.
 l.ensure=()=>{};l.updateCursor=()=>{};
 return l;
}
for(const mode of ['real','custom'])for(const initiallyPaused of [false,true]){
 const l=timeline({mode,paused:initiallyPaused});
 for(const expected of events.slice().reverse()){
  document.getElementById('previousOrbitEvent').onclick();
  assert.equal(l.sim.time,expected.time,'Previous walks backward instead of reselecting the just-passed event');
  assert.equal(l.selected,expected);
  assert.equal(l.sim.mode,'custom');assert.equal(l.sim.paused,true);
  assert.equal(l.sim.uiPaused,true);assert.equal(l.sim.saved.paused,true,'persist the final paused state');
  assert.equal(l.sim.speed,mode==='real'?1:60);
  // Reproduce the old failure: one frame of continued playback made the next
  // Previous click return the very same event. A correct exact jump stays put.
  if(!l.sim.paused)l.sim.time+=500;
 }
 l.update(performance.now(),true);
 assert.equal(document.getElementById('previousOrbitEvent').disabled,true);
 document.getElementById('previousOrbitEvent').onclick();assert.equal(l.sim.time,events[0].time);
 for(const expected of events.slice(1)){
  document.getElementById('nextOrbitEvent').onclick();assert.equal(l.sim.time,expected.time);assert.equal(l.sim.paused,true);
 }
 l.update(performance.now(),true);assert.equal(document.getElementById('nextOrbitEvent').disabled,true);
}

// Re-centering the timeline may give the same physical event a new root estimate.
// Ignore that event, but still allow a different nearby contact to be selected.
for(const shift of [-TIME_TOLERANCE/2,TIME_TOLERANCE/2]){
 const l=timeline();l.choose(events[2]);
 l.cache.result.events=events.map(e=>e===events[2]?{...e,time:e.time+shift}:e);
 assert.equal(l.adjacent(-1),events[1]);assert.equal(l.adjacent(1),events[3]);assert.equal(l.next(),events[3],'summary agrees with navigation after a root refresh');
 l.choose(events[0]);l.cache.result.events=[{...events[0],time:events[0].time+shift},...events.slice(1)];
 l.update(performance.now(),true);assert.equal(document.getElementById('previousOrbitEvent').disabled,true,'no enabled previous button for the same root');
 const nearby={type:'umbra-enter',time:events[0].time+100};l.cache.result.events=[{...events[0],time:events[0].time+shift},nearby];
 assert.equal(l.adjacent(1),nearby,'do not skip a distinct event within root tolerance');
}
{
 const l=timeline();l.choose(events[2]);l.sim.time+=10000;
 assert.equal(l.adjacent(-1),events[2],'a later manual time is navigated from the current time, not stale selection');
 l.settings.apsis=false;l.settings.node=false;l.navigate(-1);assert.equal(l.selected,events[1],'navigation respects category filters');
 document.getElementById('watchOrbitEvent').onclick();
 assert.equal(l.sim.time,events[1].time-30000);assert.equal(l.sim.paused,false);assert.equal(l.sim.speed,1);
 assert.equal(l.sim.saved.paused,false,'Watch explicitly resumes and persists playback');
}
// General timeline scrubbing still preserves playback; only exact event selection stops.
for(const paused of [false,true]){
 const l=timeline({paused});l.jump(epoch);assert.equal(l.sim.paused,paused);assert.equal(l.sim.speed,60);
}
{
 const l=timeline({mode:'real',speed:300});l.jump(epoch);assert.equal(l.sim.mode,'custom');assert.equal(l.sim.paused,false);assert.equal(l.sim.speed,1);
}

// Real OEM event stream: preserve actual closely spaced shadow contacts and nodes.
const data=JSON.parse(fs.readFileSync('assets/orbit.json'));
const start=data.rows[Math.floor(data.rows.length/2)][0],scan=scanOrbitEvents(data,start,start+3*3600000);
let step;do{step=scan.next();}while(!step.done);
assert(step.value.events.length>4);
const real=timeline({mode:'real',time:step.value.end,items:step.value.events});
for(const expected of step.value.events.slice(-4).reverse()){
 real.navigate(-1);assert.equal(real.selected,expected);assert.equal(real.sim.time,expected.time);
 if(!real.sim.paused)real.sim.time+=500;
}
console.log('Event timeline: previous/next playback navigation, root jitter, filters, button state, Watch, scrub preservation and real OEM regression passed');
