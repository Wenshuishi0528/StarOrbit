import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DFH1_HISTORY as H,orbitSegment} from '../src/dfh1-history.js';
import {EARTH_RADIUS,stateAt,earthAxes,sunPosition,sunlightFraction,orbitComputationMode,norm,dot,cross} from '../src/orbit.js';
import {scanOrbitEvents,OrbitEventCache} from '../src/orbit-events.js';
import {nearestTrackTime} from '../src/minimap-picking.js';
const {missionId:ignored,...original}=JSON.parse(fs.readFileSync('assets/spacecraft/dfh1-orbit.json')),data={...original,missionId:'dfh1'},before=JSON.stringify(data),period=H.periodSeconds*1000;
const perigee=H.epoch-H.meanAnomalyDeg/360*period,apogee=perigee+period/2;
assert(Math.abs(norm(stateAt(data,perigee).position)-EARTH_RADIUS-439)<1e-7);
assert(Math.abs(norm(stateAt(data,apogee).position)-EARTH_RADIUS-2384)<1e-7);
const normal=cross(stateAt(data,H.epoch).position,stateAt(data,H.epoch).velocity),inclination=Math.acos(dot(normal,earthAxes(H.epoch)[2])/norm(normal))*180/Math.PI;
assert(Math.abs(inclination-68.5)<1e-10);
for(const time of [H.epoch,Date.parse('1999-06-01T00:00Z')]){
 const a=stateAt(data,time),b=stateAt(data,time+period);assert(norm(a.position.map((v,i)=>v-b.position[i]))<1e-7);
 const left=stateAt(data,time-100).position,right=stateAt(data,time+100).position;assert(norm(a.velocity.map((v,i)=>v-(right[i]-left[i])/.2))<1e-6);
}
const observations=[];
for(const time of [H.epoch,Date.parse('1970-05-01T11:05:00Z')]){
 const lat=39.9042*Math.PI/180,lon=116.4074*Math.PI/180,axes=earthAxes(time),up=axes[0].map((v,i)=>v*Math.cos(lat)*Math.cos(lon)+axes[1][i]*Math.cos(lat)*Math.sin(lon)+axes[2][i]*Math.sin(lat)),q=stateAt(data,time),line=q.position.map((v,i)=>v-up[i]*EARTH_RADIUS),elevation=Math.asin(dot(line,up)/norm(line))*180/Math.PI;
 assert(elevation>10&&elevation<80);assert(sunlightFraction(q.position,sunPosition(time))>.99);observations.push({time:new Date(time).toISOString(),elevation});
}
assert.equal(H.cutoff,Date.parse('1999-12-31T16:00:00Z'));
assert.equal(orbitComputationMode(data,H.cutoff-1),'historical');assert.notEqual(orbitComputationMode(data,H.cutoff),'historical');
for(const time of [H.cutoff,H.cutoff+1,original.rows[0][0],original.rows.at(-1)[0],Date.parse('2030-01-01T00:00Z')])assert.deepEqual(stateAt(data,time),stateAt(original,time),'modern orbit remains byte-for-byte numerically identical');
assert.deepEqual(stateAt(data,H.cutoff-60000,H.cutoff),stateAt(original,H.cutoff-60000),'event padding can force current branch');
assert.notDeepEqual(stateAt(data,H.cutoff+60000,H.cutoff-1),stateAt(original,H.cutoff+60000),'event padding can force historical branch');
assert.notEqual(orbitSegment({...data,missionId:'other'},H.epoch),'historical');assert.equal(JSON.stringify(data),before);
const run=(start,end)=>{const scan=scanOrbitEvents(data,start,end);let step;do{step=scan.next();}while(!step.done);return step.value;};
const historicalEvents=run(H.epoch,H.epoch+3*3600000).events;
for(const type of ['perigee','apogee'])assert(historicalEvents.some(event=>event.type===type),'historical timeline includes '+type);
const start=H.cutoff-3*3600000,end=H.cutoff+3*3600000,result=run(start,end),left=run(start,H.cutoff-1),right=run(H.cutoff,end);
assert.equal(result.transitions.length,1);assert.equal(result.transitions[0].time,H.cutoff);assert.equal(result.transitions[0].phase,right.initialPhase);
assert.deepEqual(result.events.filter(e=>e.time>=H.cutoff),right.events);assert.equal(result.events.filter(e=>e.time<H.cutoff).length,left.events.length);
for(const event of result.events){assert(Math.abs(event.time-H.cutoff)>1000,'boundary creates no physical event');if(event.time<H.cutoff&&['perigee','apogee'].includes(event.type))assert(Math.abs(event.altitude-(event.type==='perigee'?439:2384))<.02);}
const cache=new OrbitEventCache();await cache.request(data,start,end);const builds=cache.builds;await cache.request(data,start+60000,end-60000);assert.equal(cache.builds,builds);cache.reset();
assert.equal(nearestTrackTime([[H.cutoff-1,0,0,'historical'],[H.cutoff,30,0,'current']],180,90,360,180,H.cutoff),null);
console.log('Historical shape, inclination, period, velocity, Beijing visibility, exact cutoff, unchanged modern data, event split/cache and minimap picking passed',observations);
