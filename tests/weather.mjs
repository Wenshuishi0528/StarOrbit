import assert from 'node:assert/strict';
import {validateAurora,auroraPixels,selectSnapshot,evictionIds,seedNumber} from '../src/weather-math.js';
const aurora={'Forecast Time':'2026-10-22T16:42:00Z','Observation Time':'2026-10-22T15:37:00Z',coordinates:Array.from({length:1000},(_,i)=>[i%360,i%181-90,i%101])};
assert.ok(validateAurora(aurora).time>validateAurora(aurora).observed);
assert.throws(()=>validateAurora({...aurora,'Forecast Time':'invalid'}));
assert.throws(()=>validateAurora({...aurora,coordinates:[[0,0,999]]}));
assert.throws(()=>validateAurora({...aurora,coordinates:[...aurora.coordinates,[Infinity,0,0]]}));
const grid=auroraPixels({...aurora,coordinates:[...aurora.coordinates,[0,0,100],[180,90,100],[-180,-90,100]]});
assert.equal(grid[90*360+180],255);assert.equal(grid[180*360],255);assert.equal(grid[0],255);
const items=[{id:'a',kind:'cloud',time:null,downloaded:5,size:5},{id:'b',kind:'aurora',time:100,downloaded:10,size:10,favorite:true},{id:'c',kind:'aurora',time:200,downloaded:20,size:10},{id:'d',kind:'cloud',time:100,downloaded:30,size:10}];
assert.equal(selectSnapshot(items,'cloud','latest').id,'d');assert.equal(selectSnapshot(items,'cloud','history',0,'auto').id,'d');assert.equal(selectSnapshot(items,'cloud','history',0,'a').id,'a');
assert.equal(selectSnapshot(items,'aurora','history',120,'auto').id,'b');assert.equal(selectSnapshot(items,'aurora','history',120,'missing'),null);
assert.deepEqual(evictionIds(items,20,['c']),['a','d']);assert.deepEqual(evictionIds(items,35),[]);
assert.equal(seedNumber('abc'),seedNumber('abc'));assert.notEqual(seedNumber('abc'),seedNumber('abcd'));
console.log({auroraGridRegistration:'pass',validation:'pass',historySelection:'pass',protectedCache:'pass',seed:'pass'});
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parseOfficialOrbit} from '../src/data-sources.js';
// This archived 19 October HTML is a fixed parser fixture; assets/orbit.json
// is refreshed independently and is validated against held-out samples in physics.mjs.
// Preserve the entire known-good row sequence from the original archived OEM.
const official=parseOfficialOrbit(fs.readFileSync('assets/official-orbit-source.html','utf8'));
assert.equal(official.created,'2026-10-19T00:24:27Z');assert.equal(official.rows.length,2521);
assert.equal(createHash('sha256').update(JSON.stringify(official.rows)).digest('hex'),'b71e322769d3ba5fe715f50e696d66a3de931d679b454edfeddbb6f4b3c84140');
assert.throws(()=>parseOfficialOrbit('<html>Service unavailable</html>'));
console.log({officialHTMLParser:official.rows.length});
