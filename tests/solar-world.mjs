import assert from 'node:assert/strict';
import { HelioVector, GeoMoon, Rotation_EQJ_ECT, RotateVector, Vector } from 'astronomy-engine';
import { AU, dot, earthAxes } from '../src/orbit.js';
import { solarWorldState, solarWorldOrbit, solarWorldSiteDirection, solarWorldBodyAxes, solarWorldDisplayRadius } from '../src/solar-world-math.js';
const norm=a=>Math.hypot(...a),sub=(a,b)=>a.map((x,i)=>x-b[i]);
for(const time of [Date.UTC(1900,0,1),Date.UTC(2000,0,1,12),Date.UTC(2026,10,9),Date.UTC(2100,0,1)]){
 const states=solarWorldState(time),map=new Map(states.map(s=>[s.id,s]));
 assert.equal(states.length,10);assert.deepEqual(map.get('Sun').position,[0,0,0]);
 for(const s of states){
  const v=HelioVector(s.id,new Date(time));assert(norm(sub(s.position,[v.x,v.y,v.z]))<2e-7,s.id+' geometric position');
  const axes=solarWorldBodyAxes(s.id,time);
  for(const a of axes)assert(Math.abs(norm(a)-1)<1e-10);
  assert(Math.abs(dot(axes[0],axes[1]))<1e-10);
  assert.equal(solarWorldDisplayRadius(s,2,false),s.radiusKm/AU);
  assert(solarWorldDisplayRadius(s,2,true)>=s.radiusKm/AU);
 }
 const moon=GeoMoon(new Date(time));assert(norm(sub(sub(map.get('Moon').position,map.get('Earth').position),[moon.x,moon.y,moon.z]))<1e-10,'Moon follows Earth geometrically');
 const north=solarWorldSiteDirection({latitude:90,longitude:123},time);assert(norm(sub(north,earthAxes(time)[2]))<1e-12);
 const east=solarWorldSiteDirection({latitude:0,longitude:90},time);assert(norm(sub(east,earthAxes(time)[1]))<1e-12);
}
const t=Date.UTC(2026,2,20),a=solarWorldState(t).find(s=>s.id==='Earth'),b=solarWorldState(t+182.6*86400000).find(s=>s.id==='Earth');
assert(dot(a.position,b.position)/(norm(a.position)*norm(b.position))<-.99,'Earth reaches opposite seasonal viewing position');
const orbit=solarWorldOrbit('Earth',t,64);assert.equal(orbit.length,65);assert(orbit.every(p=>norm(p)>.98&&norm(p)<1.02));
const moonOrbit=solarWorldOrbit('Moon',t,64);assert(moonOrbit.every(p=>norm(p)*AU>340000&&norm(p)*AU<410000));
assert.equal(solarWorldSiteDirection({latitude:91,longitude:0},t),null);
assert.throws(()=>solarWorldState(NaN));assert.throws(()=>solarWorldOrbit('Sun',t));
console.log('solar-world: geometric ephemerides, seasonal motion, lunar center, rotating sites and physical scale passed');
