import assert from 'node:assert/strict';
import {findPlanetaryEvents,planetaryComparisonDates,planetaryAngularDiameter,jovianEventGeometry} from '../src/planetary-events.js';
const DAY=86400000,site={latitude:39.9042,longitude:116.4074,height:50},time=Date.parse('2026-11-08T00:00:00Z');
const mars=await findPlanetaryEvents({time,site,body:'Mars'});
assert.equal(mars.length,2);assert.ok(mars[0].time<time&&mars[1].time>time);
// IMCCE opposition calendar: https://promenade.imcce.fr/en/pages6/888.html
assert.equal(new Date(mars[0].time).toISOString().slice(0,10),'2025-01-16');
assert.equal(new Date(mars[1].time).toISOString().slice(0,10),'2027-02-19');
assert.ok(mars[0].angularDiameterArcsec>14&&mars[0].angularDiameterArcsec<15);
assert.ok(mars[1].angularDiameterArcsec>13&&mars[1].angularDiameterArcsec<14.5);
const compare=await planetaryComparisonDates({time,site,body:'Mars'});
assert.deepEqual(compare.map(r=>r.time),mars.map(r=>r.time));assert.ok(compare.every(r=>r.arcseconds>0));
assert.ok(planetaryAngularDiameter('Mars',Date.parse('2025-01-16')).arcseconds>planetaryAngularDiameter('Mars',Date.parse('2025-09-01')).arcseconds*2);
const dallas={latitude:32.7767,longitude:-96.7970,height:130};
const solar=await findPlanetaryEvents({time:Date.parse('2024-04-01'),site:dallas,body:'Sun',limit:1});
// NASA eclipse date and NSF Dallas totality interval 18:40:43–18:44:35 UTC.
// https://eclipse.gsfc.nasa.gov/OH/OH2024.html
assert.equal(solar[0].kind,'total');assert.ok(solar[0].time>Date.parse('2024-04-08T18:40:00Z')&&solar[0].time<Date.parse('2024-04-08T18:45:00Z'));
assert.ok(solar[0].visibility.visible&&solar[0].visibility.altitude>0);assert.ok(solar[0].contacts.totalStart<solar[0].time&&solar[0].contacts.totalEnd>solar[0].time);
const beijingSolar=await findPlanetaryEvents({time:Date.parse('2024-04-01'),site,body:'Sun',limit:1});
assert.notEqual(new Date(beijingSolar[0].time).toISOString().slice(0,10),'2024-04-08','Dallas totality cannot leak into Beijing results');
const lunar=await findPlanetaryEvents({time:Date.parse('2025-03-01'),site:dallas,body:'Moon',limit:1});
// USNO: https://aa.usno.navy.mil/downloads/eclipses/eclipse_moon_2025_03.pdf
assert.equal(lunar[0].kind,'total');assert.ok(Math.abs(lunar[0].time-Date.parse('2025-03-14T06:59:00Z'))<3*60000);
const beijingMoon=await findPlanetaryEvents({time:Date.parse('2025-03-01'),site,body:'Moon',limit:1});
assert.notEqual(new Date(beijingMoon[0].time).toISOString().slice(0,10),'2025-03-14');
for(const events of [solar,lunar,beijingSolar,beijingMoon]) for(const row of events)assert.ok(row.observableTime>=row.start&&row.observableTime<=row.end&&row.visibility.altitude>0);
const jovian=await findPlanetaryEvents({time,body:'Jupiter',limit:20});
assert.equal(jovian.length,20);
assert.deepEqual(new Set(jovian.map(r=>r.type)),new Set(['jovian-transit','jovian-occultation','jovian-eclipse','jovian-shadowTransit']));
for(const [i,row] of jovian.entries()) {
 assert.ok(row.start<=row.time&&row.time<=row.end&&row.end<=time+7*DAY);
 if(i)assert.ok(row.time>=jovian[i-1].time);
 assert.equal(row.accuracy,'geometric-estimate');assert.equal(row.timeResolutionSeconds,60);
}
for(let i=0;i<200;i++)for(const moon of jovianEventGeometry(time+i*3600000)){
 assert.ok(!(moon.transit&&moon.occultation));assert.ok(!(moon.eclipse&&moon.shadowTransit));
 assert.ok(moon.emissionTime<time+i*3600000-20*60000,'Jovian light time must be included');
}
const onlyIo=await findPlanetaryEvents({time,body:'Io',limit:3});assert.ok(onlyIo.length&&onlyIo.every(r=>r.satellite==='Io'));
const cached=await findPlanetaryEvents({time,site,body:'Mars'});cached[0].time=0;
assert.notEqual((await findPlanetaryEvents({time,site,body:'Mars'}))[0].time,0,'caller mutation cannot poison cache');
const controller=new AbortController();const pending=findPlanetaryEvents({time:time+1,body:'Jupiter',signal:controller.signal});controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');
await assert.rejects(findPlanetaryEvents({time:NaN}),RangeError);
await assert.rejects(findPlanetaryEvents({time,site:{latitude:91,longitude:0,height:0}}),RangeError);
await assert.rejects(findPlanetaryEvents({time,body:'Sun'}),RangeError);
console.log('Planetary events: independent opposition/eclipse dates, local horizon filtering, angular-size comparison, four Jovian categories, light time, cancellation and cache isolation passed.');
