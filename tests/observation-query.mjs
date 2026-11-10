import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queryObservation } from '../src/observation-query.js';
import { predictPasses, predictionWindow } from '../src/pass-prediction.js';
const data = JSON.parse(readFileSync(new URL('../assets/orbit.json', import.meta.url)));
const site = {name:'北京',latitude:39.9042,longitude:116.4074,height:50};
const start = Date.parse('2026-11-10T04:00:00Z');
const week = await queryObservation(data,site,start,{hours:168,minimumElevation:10});
assert.equal(week.end-week.start,7*86400000);
const chunks = await Promise.all([0,72,144].map((offset,i)=>predictPasses(data,site,start+offset*3600000,i===2?24:72)));
// Compare all interior maxima against independently partitioned scans.
for(const p of week.passes.filter(p=>!p.clippedStart&&!p.clippedEnd)) {
 const match=chunks.flatMap(r=>r.passes).find(q=>Math.abs(q.maximum.time-p.maximum.time)<1000);
 assert.ok(match,'Week query lost or moved a pass');
}
const future = data.rows.at(-1)[0]+30*86400000;
const history = await queryObservation(data,site,future,{hours:168,history:true});
assert.equal(history.start,data.rows[0][0]);
assert.ok(history.end<=data.rows.at(-1)[0]);
assert.equal(history.mode,'catalog');
assert.ok(history.passes.every(p=>!p.estimated));
const tail=predictionWindow(data,data.rows.at(-1)[0]-3600000,168,{history:true});
assert.equal(tail.end,data.rows.at(-1)[0]);assert.ok(tail.clipped);
const high=await queryObservation(data,site,start,{direction:-1,minimumPeakElevation:60,daylight:'night'});
assert.ok(high.passes[0].maximum.time<start);assert.ok(high.passes[0].maximum.elevation>=60);
const abort=new AbortController();abort.abort();
await assert.rejects(queryObservation(data,site,start,{hours:168,signal:abort.signal}),{name:'AbortError'});
console.log('Shared observation query: week coverage, history bounds, previous high pass and cancellation passed',week.passes.length);
