import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sampleOrbitPath} from '../src/orbit-path.js';
import {orbitEllipse,stateAt,norm,sub,cross,dot,unit,MAX_TIME} from '../src/orbit.js';
import {DFH1_HISTORY as H} from '../src/dfh1-history.js';
import {MISSIONS,bindOrbit} from '../src/missions.js';

const data=id=>bindOrbit(JSON.parse(fs.readFileSync(MISSIONS[id].orbitAsset)),id);
const dfh=data('dfh1'),station=data('tiangong'),now=Date.parse('2026-10-28T02:40:40Z');
assert(norm(sub(stateAt(dfh,now-2800000).position,stateAt(dfh,now+2800000).position))>6000,'old time window reproduces the reported gap');
const checks=[];
function verify(orbit,time){
 const points=sampleOrbitPath(orbit,time),state=stateAt(orbit,time),q=orbitEllipse(orbit,time),normal=unit(cross(q.x,q.y));
 assert.equal(points.length,360,'fixed geometric sampling budget, independent of period');
 let angle=0,maxEdge=0;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];
  maxEdge=Math.max(maxEdge,norm(sub(a,b)));
  angle+=Math.atan2(dot(normal,cross(a,b)),dot(a,b));
  assert(Math.abs(((dot(a,q.x)/q.a+q.e)**2+(dot(a,q.y)/q.b)**2)-1)<1e-10,'each vertex lies on the ellipse');
  assert(Math.abs(dot(a,normal))<1e-7,'all points stay in the active orbital plane');
 }
 assert(Math.abs(angle-2*Math.PI)<1e-10,'closed path covers exactly one revolution');
 assert(maxEdge<2*Math.PI*q.a/points.length*1.01,'closing edge is a local segment, never a long chord');
 assert(Math.abs(((dot(state.position,q.x)/q.a+q.e)**2+(dot(state.position,q.y)/q.b)**2)-1)<1e-8,'current marker is on the ellipse');
 assert(Math.abs(norm(points[0])-q.a*(1-q.e))<1e-7);
 assert(Math.abs(norm(points[180])-q.a*(1+q.e))<1e-7);
 return {vertices:points.length,maxEdgeKm:maxEdge};
}
for(const [id,orbit] of [['dfh1',dfh],['tiangong',station]]){
 for(const time of [H.epoch,orbit.rows[200][0],orbit.rows[0][0],orbit.rows.at(-1)[0],now,Date.parse('2030-01-01T00:00Z')])checks.push({id,time:new Date(time).toISOString(),...verify(orbit,time)});
}
const historic=sampleOrbitPath(dfh,H.epoch);
assert.notDeepEqual(sampleOrbitPath(dfh,H.epoch+86400000),historic,'historical plane and perigee precess with time');
assert.notDeepEqual(sampleOrbitPath(dfh,H.cutoff),historic,'exact cutoff switches the whole ellipse');
assert.deepEqual(sampleOrbitPath(dfh,H.cutoff),sampleOrbitPath({...dfh,missionId:'other'},H.cutoff));
verify(dfh,H.cutoff-1);verify(dfh,H.cutoff);
assert.deepEqual(sampleOrbitPath(dfh,now),sampleOrbitPath(dfh,now+3600000),'moving along one propagated ellipse does not change its outline');
assert.equal(orbitEllipse(null,now),null);assert.deepEqual(sampleOrbitPath(null,now),[]);
assert.deepEqual(sampleOrbitPath(dfh,NaN),[]);assert.deepEqual(sampleOrbitPath(dfh,MAX_TIME+1),[]);
// Imported circular, long-period and eccentric orbits use the same geometric budget.
for(const [a,e] of [[7000,0],[42164,0],[25000,.7]]){
 const r=a*(1-e),speed=Math.sqrt(398600.4418*(2/r-1/a));
 const imported={frame:'EME2000',timeSystem:'UTC',units:'km, km/s',rows:Array.from({length:8},(_,i)=>[now+i*60000,r,0,0,0,speed,0])};
 verify(imported,now-86400000);
}
const unbound={...station,rows:station.rows.map(row=>[row[0],...row.slice(1,4),30,0,0])};
assert.deepEqual(sampleOrbitPath(unbound,unbound.rows[100][0]),[],'do not invent a closed ellipse for an unbound state');
console.log('Geometric orbit loops: complete ellipse, marker alignment, era selection, time independence and imported orbit budget passed',checks);
