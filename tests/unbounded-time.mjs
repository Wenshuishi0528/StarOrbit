import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stateAt,interpolate,orbitComputationMode,norm,dot,cross,validTime,MIN_TIME,MAX_TIME} from '../src/orbit.js';
import {clockText,inputText,parseLocalTime,shortClock} from '../src/time-format.js';
import {OrbitEventCache} from '../src/orbit-events.js';
const mu=398600.4418;
for(const file of ['assets/orbit.json','assets/spacecraft/dfh1-orbit.json']){
 // Exercise the generic endpoint propagator independently of mission-specific eras.
 const {missionId:ignored,...data}=JSON.parse(fs.readFileSync(file)),energy=q=>dot(q.velocity,q.velocity)/2-mu/norm(q.position);
 for(const row of [data.rows[0],data.rows.at(-1)]){
  const direction=row===data.rows[0]?-1:1,base=stateAt(data,row[0]),epsilon=stateAt(data,row[0]+direction);
  assert(norm(epsilon.position.map((x,i)=>x-base.position[i]-base.velocity[i]*direction/1000))<1e-7,'boundary position and velocity continuity');
  for(const days of [1,30,365,36500]){
   const time=row[0]+direction*days*864e5,q=stateAt(data,time);
   assert.equal(orbitComputationMode(data,time),'propagation');assert.equal(interpolate(data.rows,time),null);
   assert(Math.abs(energy(q)-energy(base))<1e-9);
   assert(norm(cross(q.position,q.velocity).map((x,i)=>x-cross(base.position,base.velocity)[i]))<1e-7);
  }
 }
 const start=data.rows.at(-1)[0]+30*864e5,cache=new OrbitEventCache(),r=await cache.request(data,start,start+3*36e5);
 assert(r.events.length>0);assert(r.events.every(e=>e.time>=start&&e.time<=start+3*36e5));assert.equal(cache.pending,null);cache.reset();
}
// Circular orbit avoids eccentricity singularities; compare analytic motion after 100 years.
const radius=7000,v=Math.sqrt(mu/radius),epoch=Date.UTC(2026,0,1),period=2*Math.PI*Math.sqrt(radius**3/mu);
const data={rows:Array.from({length:8},(_,i)=>{const t=i*60,a=t/period*2*Math.PI;return [epoch+t*1000,radius*Math.cos(a),radius*Math.sin(a),0,-v*Math.sin(a),v*Math.cos(a),0];})};
const time=epoch-100*365.25*864e5,q=stateAt(data,time),angle=((time-epoch)/1000%period)/period*2*Math.PI;
assert(norm(q.position.map((x,i)=>x-[radius*Math.cos(angle),radius*Math.sin(angle),0][i]))<1e-4);
const invalid={rows:data.rows.map(r=>[r[0],7000,0,0,12,0,0])};assert.equal(stateAt(invalid,epoch-1),null);assert(stateAt(invalid,epoch));
assert.deepEqual((await new OrbitEventCache().request(invalid,epoch-360e4,epoch)).events,[]);
for(const iso of ['2026-10-26T00:00:00Z','+010000-01-01T00:00:00Z']){const t=Date.parse(iso);assert.equal(parseLocalTime(inputText(t)),t);assert.equal(shortClock(t),'08:00:00');assert(clockText(t).endsWith('08:00:00'));}
assert(validTime(MIN_TIME)&&validTime(MAX_TIME));assert(!validTime(MAX_TIME+1));
console.log('Unbounded time: endpoint continuity, 100-year energy/momentum, circular propagation, future events and calendar formats passed');
