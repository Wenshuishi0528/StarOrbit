import assert from 'node:assert/strict';
import {mergeCloudVersions} from '../src/cloud-history-data.js';
import {manualCloudUsable} from '../src/cloud-manual.js';
import {selectCloud,retireNASA} from '../src/cloud-source.js';
const sha='a'.repeat(64),t=Date.UTC(2026,9,23,12),local={kind:'cloud',id:'old',provider:'satcorps',time:t,sha256:sha,manualValidation:{schema:1,sha256:sha,validPixels:1},quality:{schema:1,status:'rejected',reasons:['internal-seam']}};
assert(manualCloudUsable(local));assert.equal(selectCloud([local],'history',Date.now(),'old'),local,'explicit manual loading allows a warned frame');
assert.equal(selectCloud([local],'satcorps',Date.now()),null,'warned data never enters automatic recommendation');
assert(!manualCloudUsable({...local,sha256:undefined}));assert(!manualCloudUsable({...local,sha256:'bad'}));
const viirs={...local,kind:'cloud-preview',id:'v',provider:'viirs',date:'2026-10-23',period:'day'};assert.equal(selectCloud([viirs],'history',Date.now(),'v'),null,'VIIRS swath previews cannot be applied as complete global clouds');
const merged=mergeCloudVersions([{provider:'satcorps',time:t,remote:true}], [local,viirs],[{provider:'satcorps',time:t,sha256:sha,disk:'old.png'}]);
assert.equal(merged.length,2);assert.equal(merged.find(r=>r.provider==='satcorps').record.id,'old');assert.equal(merged.find(r=>r.provider==='satcorps').diskRecord.disk,'old.png');
const duplicate=mergeCloudVersions([], [local,{...local,id:'older',sha256:'b'.repeat(64)}],[]);assert.equal(duplicate.length,2,'distinct already-downloaded revisions remain visible');
const cross=mergeCloudVersions([],[local],[{...local,sha256:'b'.repeat(64),disk:'different.png'}]);assert.equal(cross.length,2,'browser and disk revisions with different content are separately selectable');
assert.equal(mergeCloudVersions([],[{...local,provider:undefined}],[])[0].provider,'github','legacy source remains visible when filtering GitHub');
console.log('Unified versions: legacy/library merge, manual warnings, integrity binding, VIIRS exclusion and archive preservation passed');

assert.deepEqual(await retireNASA({all:async()=>[{...local,time:1719748800000}]}),[],"manually verified historical selection survives legacy retirement migration");
