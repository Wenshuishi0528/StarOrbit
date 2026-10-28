import assert from 'node:assert/strict';
import fs from 'node:fs';
import {predictPasses} from '../src/pass-prediction.js';
import {orbitFromGP} from '../src/gp-orbit.js';
const reference=JSON.parse(fs.readFileSync('tests/reference/pass-skyfield.json'));
const data=orbitFromGP(reference.gp,'dfh1');
const result=await predictPasses(data,reference.observer,reference.start,reference.hours,{minimumElevation:reference.minimumElevation});
const events=result.passes.flatMap(pass=>[[pass.start,0],[pass.maximum.time,1],[pass.end,2]]);
assert.equal(events.length,reference.events.length);
let maxSeconds=0;
events.forEach(([time,type],i)=>{
 assert.equal(type,reference.events[i].event);
 const delta=Math.abs(time-reference.events[i].time)/1000;
 assert(delta<.5,'independent Skyfield event time agreement');maxSeconds=Math.max(maxSeconds,delta);
});
console.log('Independent Skyfield/WGS84 pass comparison passed',{events:events.length,maxSeconds});
