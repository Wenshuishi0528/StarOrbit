import assert from 'node:assert/strict';
import { geodeticToECEF, ecefToGeodetic, enuFrame, localFromECEF, ecefFromLocal, moveOnEarth, createGroundState, stepGroundMotion, GROUND_SPEEDS } from '../src/ground-world-math.js';
import { pilotAxes } from '../src/pilot-controls.js';
const close = (a,b,t=1e-6) => assert.ok(Math.abs(a-b)<t,`${a} versus ${b}`);
for(const latitude of [-90,-78,-35,0,39.9042,80,90]) for(const longitude of [-180,-122,0,116.4074,179.999]) {
 const s={latitude,longitude,height:1543.7}, p=geodeticToECEF(s,35.4), back=ecefToGeodetic(p,35.4);
 close(back.latitude,latitude,1e-9);close(back.height,s.height,1e-7);
 if(Math.abs(latitude)<90) close(back.longitude,longitude,1e-9);
 const frame=enuFrame(s,35.4),local=[123.4,-567.8,5.2],out=localFromECEF(ecefFromLocal(local,frame),frame);
 out.forEach((v,i)=>close(v,local[i],1e-8));
}
const equator=moveOnEarth({latitude:0,longitude:179.999,height:100},1000,0);
assert.ok(equator.longitude< -179.99);close(equator.height,100);
const pole=moveOnEarth({latitude:89.9999,longitude:0,height:100},0,100);
assert.ok(Number.isFinite(pole.latitude)&&pole.latitude<90);assert.ok(Math.abs(pole.longitude)>170);
const north=moveOnEarth({latitude:0,longitude:0,height:0},0,1000);
close(north.latitude,0.00904369,1e-7);
const floor=()=>100;
const a=createGroundState({site:{latitude:30,longitude:120,height:0},azimuth:0});
stepGroundMotion(a,{},0,floor);close(a.site.height,101.7);
const forward=pilotAxes(new Set(['KeyH']));
for(let i=0;i<30;i++)stepGroundMotion(a,forward,1/60,floor);
const shortSpeed=a.speedMps;assert.ok(shortSpeed>0&&shortSpeed<GROUND_SPEEDS.normal);
for(let i=0;i<180;i++)stepGroundMotion(a,forward,1/60,floor);
assert.ok(a.speedMps>shortSpeed&&a.speedMps<=GROUND_SPEEDS.normal+1e-6);
for(let i=0;i<60;i++)stepGroundMotion(a,{},1/60,floor);
assert.ok(a.speedMps<0.01);close(a.site.height,101.7);
const pitched=createGroundState({site:{latitude:0,longitude:0,height:100},azimuth:0,elevation:85});
for(let i=0;i<60;i++)stepGroundMotion(pitched,forward,1/60,floor);
close(pitched.site.height,101.7);assert.ok(pitched.site.latitude>0);
const flight=createGroundState({site:{latitude:0,longitude:0,height:100},mode:'free'});
for(let i=0;i<60;i++)stepGroundMotion(flight,pilotAxes(new Set(['KeyK'])),1/60,floor);
assert.ok(flight.site.height>101);
const blocked=createGroundState({site:{latitude:0,longitude:0,height:100}});
stepGroundMotion(blocked,forward,0.1,()=>null);assert.equal(blocked.site.latitude,0);assert.equal(blocked.speedMps,0);assert.equal(blocked.terrainReady,false);
const crossPole=createGroundState({site:{latitude:89.9999,longitude:0,height:100},azimuth:0,speed:'fast'});
for(let i=0;i<180;i++)stepGroundMotion(crossPole,forward,1/60,floor);
assert.ok(crossPole.site.latitude<89.999);assert.ok(Math.abs(crossPole.site.longitude)>170);assert.ok(Math.abs(crossPole.azimuth-180)<0.01,'northward passage parallel-transports heading to south');
// No simulation epoch/speed enters the motion integrator; identical wall input
// remains identical while the astronomical clock runs at any playback rate.
const first=createGroundState(),second=createGroundState();
for(let i=0;i<120;i++) { stepGroundMotion(first,forward,1/60,floor); second.simulationSpeed=86400;stepGroundMotion(second,forward,1/60,floor); }
assert.deepEqual(first.site,second.site);close(first.speedMps,second.speedMps);
// Render frequency independence: integrate equal time in 30/120 Hz frames.
const low=createGroundState(),high=createGroundState();
for(let i=0;i<60;i++)stepGroundMotion(low,forward,1/30,floor);
for(let i=0;i<240;i++)stepGroundMotion(high,forward,1/120,floor);
close(low.speedMps,high.speedMps,1e-5);
assert.ok(Math.hypot(...geodeticToECEF(low.site).map((v,i)=>v-geodeticToECEF(high.site)[i]))<0.1);
console.log('Ground world: WGS84/geoid round trips, ENU metres, dateline/poles, terrain contact, acceleration/braking, free altitude and wall-clock movement passed.');

const {createGroundWorldInput}=await import('../src/ground-world-input.js');
class Target extends EventTarget {}
const win=new Target(),doc=new Target();doc.defaultView=win;doc.hidden=false;
const canvas=new Target();canvas.ownerDocument=doc;canvas.attrs=new Map();canvas.getAttribute=k=>canvas.attrs.has(k)?canvas.attrs.get(k):null;canvas.setAttribute=(k,v)=>canvas.attrs.set(k,v);canvas.removeAttribute=k=>canvas.attrs.delete(k);canvas.focus=()=>{doc.activeElement=canvas;};canvas.blur=()=>{doc.activeElement=null;canvas.dispatchEvent(new Event('blur'));};
canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
const fire=(target,type,values={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,values);target.dispatchEvent(e);return e;};
let available=true;
const input=createGroundWorldInput({canvas,sampleHeight:floor,enabled:()=>available});
canvas.focus();fire(canvas,'keydown',{code:'KeyH'});
for(let i=0;i<30;i++)input.update(1/60);
assert.ok(input.state.speedMps>0);
const movingLat=input.state.site.latitude;
canvas.blur();input.update(1/60);assert.equal(input.state.speedMps,0);assert.equal(input.state.site.latitude,movingLat);
canvas.focus();fire(canvas,'keydown',{code:'KeyH',ctrlKey:true});input.update(1/60);assert.equal(input.state.speedMps,0,'browser shortcuts never move the camera');
fire(canvas,'keydown',{code:'KeyH'});fire(win,'keyup',{code:'KeyH'});input.update(1/60);assert.ok(input.state.speedMps>0,'between-frame short tap survives once');
input.stop();fire(canvas,'keydown',{code:'KeyH'});available=false;input.update(1/60);assert.equal(input.state.speedMps,0);available=true;input.update(1/60);assert.equal(input.state.speedMps,0,'inactive view cannot retain a held key');
canvas.focus();fire(canvas,'pointerdown',{button:0,isPrimary:true,pointerId:1,clientX:10,clientY:10});const az=input.state.azimuth;fire(canvas,'pointermove',{pointerId:1,clientX:110,clientY:60});close(input.state.azimuth,az+16);close(input.state.elevation,7);
input.dispose();const pose=input.state.azimuth;fire(canvas,'pointermove',{pointerId:1,clientX:210,clientY:60});assert.equal(input.state.azimuth,pose);assert.equal(canvas.getAttribute('tabindex'),null);
console.log('Ground input: focus ownership, shortcuts, short taps, deactivation, drag look and listener disposal passed.');
