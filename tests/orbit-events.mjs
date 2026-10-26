import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scanOrbitEvents,OrbitEventCache,shadowAngles,eventBetween,selectedEvents} from '../src/orbit-events.js';
import {interpolate,sunPosition,earthAxes,EARTH_RADIUS,SUN_RADIUS,unit,cross,dot,norm} from '../src/orbit.js';
const run=(data,start,end)=>{const generator=scanOrbitEvents(data,start,end);let step;do{step=generator.next();}while(!step.done);return step.value;};
const data=JSON.parse(fs.readFileSync('assets/orbit.json')),start=data.rows[0][0],reports={};
for(const hours of [3,12,24]){
 const began=performance.now(),result=run(data,start,start+hours*3600000);reports[hours+'h']={milliseconds:performance.now()-began,events:result.events.length,bytes:JSON.stringify(result).length};
 for(const e of result.events){
  assert(e.time>=result.start&&e.time<=result.end);
  const before=interpolate(data.rows,e.time-1000),after=interpolate(data.rows,e.time+1000);
  if(e.type.includes('-')){
   const key=e.type.startsWith('penumbra')?'outer':'inner',a=shadowAngles(before.position,sunPosition(e.time-1000))[key],b=shadowAngles(after.position,sunPosition(e.time+1000))[key];
   assert(e.type.endsWith('enter')?a>0&&b<0:a<0&&b>0,'contact agrees with exact solar ephemeris: '+e.type);
  }else if(e.type==='ascending'||e.type==='descending'){
   const a=dot(before.position,earthAxes(e.time-1000)[2]),b=dot(after.position,earthAxes(e.time+1000)[2]);assert(e.type==='ascending'?a<0&&b>0:a>0&&b<0);
  }else{
   const center=norm(interpolate(data.rows,e.time).position);assert(Math.abs(e.altitude-(center-EARTH_RADIUS))<1e-9);
   assert(e.type==='perigee'?center<norm(before.position)&&center<norm(after.position):center>norm(before.position)&&center>norm(after.position));
  }
 }
 assert(result.events.some(e=>e.type==='perigee')&&result.events.some(e=>e.type==='apogee'));
}
// Analytic Kepler ellipse: verify apsis epochs independently of the detector.
const epoch=Date.parse('2026-10-20T00:00:00Z'),a=8000,mu=398600.4418,n=Math.sqrt(mu/a**3),duration=5*3600000;
function ellipse(e,inclination){
 const axes=earthAxes(epoch),u=axes[0],v=axes[1].map((x,i)=>x*Math.cos(inclination)+axes[2][i]*Math.sin(inclination)),rows=[];
 for(let ms=-600000;ms<=duration+600000;ms+=30000){const M=.3+n*ms/1000;let E=M;for(let j=0;j<10;j++)E-=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));const rate=n/(1-e*Math.cos(E)),x=a*(Math.cos(E)-e),y=a*Math.sqrt(1-e*e)*Math.sin(E),vx=-a*Math.sin(E)*rate,vy=a*Math.sqrt(1-e*e)*Math.cos(E)*rate;rows.push([epoch+ms,...u.map((q,i)=>q*x+v[i]*y),...u.map((q,i)=>q*vx+v[i]*vy)]);}
 return {rows};
}
const eccentric=ellipse(.1,.7),apsides=run(eccentric,epoch,epoch+duration).events.filter(e=>['perigee','apogee'].includes(e.type));
assert(apsides.length>=4);for(const e of apsides){const mean=.3+n*(e.time-epoch)/1000,k=Math.round(mean/Math.PI);assert(Math.abs(mean-k*Math.PI)/n<.25);assert.equal(e.type,k%2?'apogee':'perigee');}
const circular=run(ellipse(0,0),epoch,epoch+duration);assert(!circular.events.some(e=>['perigee','apogee','ascending','descending'].includes(e.type)),'no numerical apsides or nodes for a circular equatorial orbit');
// A grazing eclipse shorter than one coarse step, including window/data edges.
function grazing(offset=0){
 const solar=unit(sunPosition(epoch)),orthogonal=unit(cross(solar,[0,0,1])),beta=Math.asin(EARTH_RADIUS/7000)+Math.asin(SUN_RADIUS/norm(sunPosition(epoch)))-.00001+offset;
 const pole=solar.map((x,i)=>x*Math.sin(beta)+orthogonal[i]*Math.cos(beta)),u=unit(solar.map((x,i)=>-x+pole[i]*Math.sin(beta))),v=cross(pole,u),w=Math.sqrt(mu/7000**3),rows=[];
 for(let ms=-1200000;ms<=1200000;ms+=10000){const angle=w*ms/1000;rows.push([epoch+ms,...u.map((x,i)=>7000*(x*Math.cos(angle)+v[i]*Math.sin(angle))),...u.map((x,i)=>7000*w*(-x*Math.sin(angle)+v[i]*Math.cos(angle)))]);}return {rows};
}
for(const [left,right] of [[-600000,600000],[-20000,580000],[-580000,20000]]){
 const result=run(grazing(),epoch+left,epoch+right);assert.equal(result.events.filter(e=>e.type.startsWith('penumbra')).length,2,'short grazing contacts at window edge');
}
const edge=grazing();edge.rows=edge.rows.filter(row=>row[0]>=epoch-20000);assert.equal(run(edge,edge.rows[0][0],epoch+580000).events.filter(e=>e.type.startsWith('penumbra')).length,2);
assert(!run(grazing(.001),epoch-600000,epoch+600000).events.some(e=>e.type.includes('-')),'continuous sunlight has no eclipse event');
const event={time:1000,type:'ascending'};assert.equal(eventBetween([event],999,1001),event);assert.equal(eventBetween([event],1000,1016),null);assert.equal(eventBetween([event],0,1000000),event);
assert.equal(selectedEvents({events:[event]},{shadow:true,node:false}).length,0);
const cache=new OrbitEventCache(),first=await cache.request(data,start,start+10800000),builds=cache.builds;
assert.equal(await cache.request(data,start+60000,start+7200000),first);assert.equal(cache.builds,builds);
const cancelled=cache.request(data,start,start+86400000);cache.reset();assert.equal(await cancelled,null);assert.equal(cache.result,null);
const old=cache.request(data,start,start+86400000),latest=cache.request(eccentric,epoch,epoch+duration);assert.equal(await old,null);assert.equal((await latest).start,epoch);assert.equal(cache.data,eccentric);
reports.synthetic='Kepler epochs, circular/equatorial, grazing and sunlight passed';reports.cache='reuse and cancellation passed';
fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/orbit-events-results.json',JSON.stringify(reports,null,2));console.log(reports);
