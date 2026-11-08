import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { cosmicUI, COSMIC_UI_KEYS } from '../src/cosmic-ui-copy.js';
const result = await build({entryPoints:['src/cosmic-lab.js'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const { normalizeCosmicState } = await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
for(const value of [null,undefined,[],{},'old',42,{topic:'__proto__',phase:NaN,params:{bhMass:Infinity}}]){
 const state=normalizeCosmicState(value);
 assert.equal(state.topic,'blackhole');assert.equal(state.phase,0);assert.equal(state.params.bhMass,10);
}
for(const topic of ['blackhole','neutron','pulsar','meteor','supernova']){
 const state=normalizeCosmicState({topic,phase:.72,params:{bhMass:999,nsRadius:-3,period:0,meteorSpeed:'72'},running:true,alien:'discard'});
 assert.equal(state.topic,topic);assert.equal(state.phase,.72);assert.equal(state.params.bhMass,100);
 assert.equal(state.params.nsRadius,10);assert.equal(state.params.period,.05);assert.equal(state.params.meteorSpeed,35);
 assert.deepEqual(normalizeCosmicState(JSON.parse(JSON.stringify(state))),state);
 assert(!Object.hasOwn(state,'running'));assert(!Object.hasOwn(state,'alien'));
}
assert.equal(normalizeCosmicState({phase:-10}).phase,0);assert.equal(normalizeCosmicState({phase:5}).phase,1);
for(const lang of ['zh','en','ru','fr'])for(const key of COSMIC_UI_KEYS){assert(cosmicUI(key,lang).length>0);assert.notEqual(cosmicUI(key,lang),key);}
console.log('Cosmic preference recovery: malformed storage, bounded parameters, all-topic round trips, independent playback state and four-language UI coverage passed.');
