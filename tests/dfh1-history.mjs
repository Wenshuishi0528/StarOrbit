import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DFH1_HISTORY as H,orbitSegment} from '../src/dfh1-history.js';
import {EARTH_RADIUS,stateAt,earthAxes,sunPosition,sunlightFraction,orbitComputationMode,orbitEllipse,norm,dot,cross,unit} from '../src/orbit.js';
import {observerFrame,lookAngles} from '../src/pass-prediction.js';
import {scanOrbitEvents,OrbitEventCache} from '../src/orbit-events.js';
import {nearestTrackTime} from '../src/minimap-picking.js';
const {missionId:ignored,...original}=JSON.parse(fs.readFileSync('assets/spacecraft/dfh1-orbit.json')),data={...original,missionId:'dfh1'},before=JSON.stringify(data),period=H.reconstructedPeriodSeconds*1000;
assert.equal(H.periodSeconds,114*60,'retain the communiqué period separately from the fitted phase rate');
assert.equal(Math.round(period/60000),114);
const perigee=H.epoch-H.meanAnomalyDeg/360*period,apogee=perigee+period/2;
assert(Math.abs(norm(stateAt(data,perigee).position)-EARTH_RADIUS-439)<1e-7);
assert(Math.abs(norm(stateAt(data,apogee).position)-EARTH_RADIUS-2384)<1e-7);
const shape=orbitEllipse(data,H.epoch),normal=cross(shape.x,shape.y),inclination=Math.acos(dot(normal,earthAxes(H.epoch)[2])/norm(normal))*180/Math.PI;
assert(Math.abs(inclination-68.5)<1e-10);
for(const time of [H.epoch,Date.parse('1999-06-01T00:00Z')]){
 const a=stateAt(data,time),b=stateAt(data,time+period);assert(Math.abs(norm(a.position)-norm(b.position))<1e-6,'radial period repeats while orbital plane precesses');
 assert(norm(a.position.map((v,i)=>v-b.position[i]))>1,'no frozen historical plane');
 const left=stateAt(data,time-100).position,right=stateAt(data,time+100).position;assert(norm(a.velocity.map((v,i)=>v-(right[i]-left[i])/.2))<1e-5,'velocity includes rotating basis derivatives');
}
const references=JSON.parse(fs.readFileSync('tests/fixtures/dfh1-historical-passes.json')),observations=[];
const fixedAt=time=>earthAxes(time).map(axis=>dot(axis,stateAt(data,time).position));
for(const row of references.observations){
 const frame=observerFrame({...row,height:0}),reported=Date.parse(row.time),look=time=>lookAngles(fixedAt(time),frame);
 let lo=reported-12*60000,hi=reported+12*60000;
 while(hi-lo>100){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(look(a).elevation<look(b).elevation)lo=a;else hi=b;}
 const peak=(lo+hi)/2,errorSeconds=(peak-reported)/1000,elevation=look(peak).elevation;
 // "Fly-over" is not defined as culmination by the newspaper; retain minute
 // tolerances. These compare independent source observations, not model angles.
 assert(Math.abs(errorSeconds)<90,`${row.time} ${row.city}: minute-scale phase mismatch ${errorSeconds}s`);
 assert(look(reported).elevation>0&&elevation>0,'the reported time must be above the observer horizon');
 const north=fixedAt(peak+30000)[2]-fixedAt(peak-30000)[2];
 assert(row.direction==='ascending'?north>0:north<0,`${row.time}: wrong north/south direction`);
 observations.push({...row,errorSeconds:Math.round(errorSeconds*10)/10,peakElevationDeg:Math.round(elevation*10)/10});
}
// Newspaper Apr 27 explicitly says Beijing NW -> SE. Check the observed sky
// bearing at 5-degree elevation on both sides, rather than just latitude sign.
const beijing=observerFrame({latitude:39.9042,longitude:116.4074,height:0});
for(const time of [H.epoch,Date.parse('1970-04-27T12:01:00Z')]){
 const look=t=>lookAngles(fixedAt(t),beijing);let rise=time,set=time;
 while(look(rise).elevation>5&&time-rise<20*60000)rise-=5000;
 while(look(set).elevation>5&&set-time<20*60000)set+=5000;
 assert(look(rise).azimuth>270&&look(rise).azimuth<360,'arrives from northwest');
 assert(look(set).azimuth>90&&look(set).azimuth<180,'leaves toward southeast');
 assert(sunlightFraction(stateAt(data,time).position,sunPosition(time))>.99,'reported evening pass is sunlit');
}
// The near-launch geometry constrains the plane only, never the rocket's
// position/altitude during powered ascent.
const launch=references.launchPlanePrior,launchTime=Date.parse(launch.time),launchShape=orbitEllipse(data,launchTime),launchNormal=unit(cross(launchShape.x,launchShape.y)),launchFrame=observerFrame({...launch,height:0}),launchAxes=earthAxes(launchTime);
const launchInertial=unit(launchAxes[0].map((_,k)=>launchFrame.position.reduce((sum,v,j)=>sum+v*launchAxes[j][k],0)));
assert(Math.abs(dot(launchNormal,launchInertial))<Math.sin(.5*Math.PI/180),'historical plane stays near the approximate Jiuquan launch region');
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
for(const split of ['train','holdout']){
 const rows=observations.filter(row=>row.split===split);console.log(split,rows.length,'RMS seconds',Math.sqrt(rows.reduce((sum,row)=>sum+row.errorSeconds**2,0)/rows.length).toFixed(1),'max seconds',Math.max(...rows.map(row=>Math.abs(row.errorSeconds))));
}
if(process.argv.includes('--report'))console.log(JSON.stringify(observations,null,2));
console.log('Historical geometry, launch-plane prior, 47 newspaper times/directions, sky bearings, velocity, cutoff, unchanged modern data and event/minimap checks passed');
