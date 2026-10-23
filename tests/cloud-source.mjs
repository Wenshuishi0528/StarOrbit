import assert from 'node:assert/strict';
import {selectCloud,validateNASA,completeNASA,retireNASA} from '../src/cloud-source.js';
const now=Date.now(),time=now-8*86400e3,old={kind:'cloud',id:'old',downloaded:now,time:null},nasa={kind:'cloud',id:'nasa',provider:'satcorps',time,observedStart:time-5e6,observedEnd:time+2e6,downloaded:now,resolution:'8192×4096',nativeResolution:'12960×6480',channel:'red',coverage:.995,polarCoverage:{north:.999,south:.999},footprint:{global:1,north:1,south:1}};
assert.equal(selectCloud([old,nasa],'latest',now).id,'old');
assert.equal(selectCloud([old,nasa],'satcorps',now).id,'nasa','complete historical data remains available regardless of age');
assert.equal(selectCloud([old,{...nasa,footprint:{global:.99,north:.7,south:.6}}],'satcorps',now),null);
assert.equal(selectCloud([old,nasa],'history',now,'old').id,'old');
assert.equal(selectCloud([old,nasa],'history',now,'nasa').id,'nasa');
assert.equal(validateNASA(nasa),nasa);
for(const change of [{nativeResolution:'4096×2048'},{observedStart:now+1e6},{coverage:.8},{polarCoverage:{north:1,south:.3}},{footprint:{global:1,north:1,south:.7}}])assert.throws(()=>validateNASA({...nasa,...change},now));
assert.ok(!completeNASA({...nasa,time:now+3600e3},now));
console.log('Cloud provider isolation, old complete archives, history and polar coverage guards passed');

const retired={...nasa,id:'retired',time:1719748800000,favorite:true};
assert.ok(!completeNASA(retired,now));assert.throws(()=>validateNASA(retired,now));
assert.equal(selectCloud([retired],'history',now,'retired'),null);
const records=new Map([old,nasa,retired].map(x=>[x.id,x]));
assert.deepEqual(await retireNASA({all:async()=>[...records.values()],remove:async id=>records.delete(id)}),['retired']);
assert.deepEqual([...records.keys()],['old','nasa']);
