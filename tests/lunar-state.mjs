import assert from 'node:assert/strict';
import { normalizeLunarPreferences,parseLunarUTC,lunarUTCInput,lunarResolution,validLunarTime,LUNAR_MIN_TIME,LUNAR_MAX_TIME } from '../src/lunar-state.js';
import {LUNAR_UI_KEYS,lunarUI} from '../src/lunar-ui-copy.js';
for(const malformed of [null,undefined,42,[],{},'old',{mode:'__proto__',layer:'fake',labels:'yes',relief:99,aperture:Infinity}]){const p=normalizeLunarPreferences(malformed);assert.equal(p.mode,'observe');assert.equal(p.layer,'natural');assert.equal(p.relief,1);assert.equal(p.aperture,100);}
for(const p of [{mode:'atlas',layer:'elevation',relief:8,labels:false,landings:false,placeDensity:0.7,feature:'tycho',aperture:250}])assert.deepEqual(normalizeLunarPreferences(JSON.parse(JSON.stringify(p))),p);
for(const invalid of ['2026-02-30T12:00','1899-01-01T00:00','2101-01-01T00:00','2026-11-08','2026-11-08T25:00',''])assert.throws(()=>parseLunarUTC(invalid));
assert.equal(lunarUTCInput(parseLunarUTC('2026-11-08T12:34')),'2026-11-08T12:34:00');assert(validLunarTime(LUNAR_MIN_TIME)&&validLunarTime(LUNAR_MAX_TIME));assert(!validLunarTime(NaN));
const r=lunarResolution(100,384400);assert(Math.abs(r.arcsec-1.384)<.002);assert(Math.abs(r.km-2.5793)<.001);assert.equal(lunarResolution(200,384400).arcsec,r.arcsec/2);
for(const lang of ['zh','en','ru','fr'])for(const key of LUNAR_UI_KEYS){assert(lunarUI(key,lang));assert.notEqual(lunarUI(key,lang),key);}
console.log('Lunar preferences/date validation, optical units and four-language UI passed.');

assert.equal(normalizeLunarPreferences({placeDensity:Infinity}).placeDensity,.45);assert.equal(normalizeLunarPreferences({placeDensity:-1}).placeDensity,0);assert.equal(normalizeLunarPreferences({placeDensity:2}).placeDensity,1);assert.equal(normalizeLunarPreferences({landings:'false'}).landings,true);

assert.equal(normalizeLunarPreferences({mode:'observe',layer:'geology'}).mode,'atlas');assert.equal(normalizeLunarPreferences({layer:'geology'}).layer,'geology');
