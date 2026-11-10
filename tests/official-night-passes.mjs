import assert from 'node:assert/strict';
import fs from 'node:fs';
import { queryObservation, DEFAULT_PREDICTION } from '../src/observation-query.js';
import { stateAt,cross,unit,dot,sunPosition } from '../src/orbit.js';
const data=JSON.parse(fs.readFileSync(new URL('./reference/css-20261109.json',import.meta.url)));
const site={name:'北京',latitude:39.9042,longitude:116.4074,height:50};
assert.equal(DEFAULT_PREDICTION.minimumElevation,5);
for(const [minimumElevation,count,night] of [[0,44,4],[5,39,2],[10,33,0]]){
 const r=await queryObservation(data,site,data.rows[0][0],{hours:168,minimumElevation});
 assert.equal(r.passes.length,count);assert.equal(r.passes.filter(p=>p.maximum.sunElevation<0).length,night);
 for(const p of r.passes){const ref=data.independentReference.horizonPeaks.find(q=>Math.abs(Date.parse(q.utc)-p.maximum.time)<1000);assert.ok(ref,'official OEM peak agrees with independent pipeline');assert.ok(Math.abs(ref.sunElevation-p.maximum.sunElevation)<.02);}
}
const plane=t=>{const q=stateAt(data,Date.parse(t));return unit(cross(q.position,q.velocity));};
const a=plane('2026-11-16T00:00Z'),b=plane('2026-11-23T00:00Z');
assert.ok(Math.acos(dot(a,b))*180/Math.PI>20,'outside data: orbital plane must continue moving');
console.log('Official Nov 9 OEM / independent Skyfield: 0/5/10-degree filters 44/39/33 passes, 4/2/0 night peaks; continuation moves.');
