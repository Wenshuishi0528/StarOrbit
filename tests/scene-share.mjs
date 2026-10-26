import {normalizeGeographySettings} from '../src/geography-settings.js';
import {normalizeStarChartSettings} from '../src/star-chart-settings.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PHENOMENA_DEFAULTS} from '../src/phenomena-math.js';
import {describeAssembly} from '../src/assembly.js';
import {SCENE_FORMAT,MAX_SCENE_BYTES,DISPLAY_KEYS,validateScene} from '../src/scene-format.js';
const orbit=JSON.parse(fs.readFileSync(new URL('../assets/orbit.json',import.meta.url)));
delete orbit.url;orbit.missionId='tiangong';orbit.center='EARTH';
const graph=describeAssembly({TH_FORWARD:'TH','TH_FORWARD/TH_FORWARD':'TZ','TH_FORWARD/TH_LOWER':'TZ',TH_AFT:'TZ'});
const pose={position:[400,300,200],target:[0,0,0],up:[0,0,1],fov:38,zoom:1};
const fixture={format:SCENE_FORMAT,mission:{id:'tiangong',pose:{roll:0,pitch:0,yaw:0},rotation:{mode:'prograde',enabled:false,phase:0,epoch:orbit.rows[12][0]}},name:'分享 / Test',appVersion:'v0.26',assembly:{slots:graph.slots,angles:Object.fromEntries([...graph.instances.map(i=>i.id),'freeXT'].map(id=>[id,{roll:12,left:-34,right:56}])),target:'TH_FORWARD/TH_LOWER',showXT:true,linked:true,pair:false},simulation:{time:orbit.rows[12][0],view:'orbit',speed:60,auto:false},environment:{quality:'medium',exposure:'view',cloudOpacity:.85,starBrightness:1,stars:true,milky:true,moon:true,starLabels:false,clouds:true,groundTrack:true},weather:{cloud:'history',aurora:'off',seed:'Test',auroraStrength:1.4,exposure:1.15,volume:false,motion:true,adaptive:true,cloudRecord:{id:'cloud-abc',source:'Test',provider:'github',time:orbit.rows[12][0]},auroraRecord:null},display:Object.fromEntries(DISPLAY_KEYS.map(k=>[k,true])),cameras:{follow:pose,overview:{...pose,position:[12000,20000,3000]},home:null},orbit};
const checked=validateScene(JSON.parse(JSON.stringify(fixture)));
assert.deepEqual(checked,{...fixture,environment:{...fixture.environment,...normalizeStarChartSettings(fixture.environment),...normalizeGeographySettings()},phenomena:{...PHENOMENA_DEFAULTS}});
assert.ok(Buffer.byteLength(JSON.stringify(checked))<MAX_SCENE_BYTES);
assert.equal(checked.assembly.slots['TH_FORWARD/TH_LOWER'],'TZ');
assert.equal(checked.assembly.slots.TH_AFT,'TZ');
for(const mutate of [x=>x.mission.rotation.phase=Infinity,x=>x.mission.rotation.enabled='true',x=>x.mission.rotation.mode='wrong',x=>x.format='tiangong-weather-1',x=>x.simulation.time=NaN,x=>x.assembly.slots.TH_AFT='unknown',x=>x.assembly.slots['TH_AFT/TH_FORWARD']='TZ',x=>x.assembly.angles.TH.left=Infinity,x=>x.cameras.follow.position=[0,0,0],x=>x.cameras.follow.up=[0,0,0],x=>x.environment.quality='16K',x=>x.weather.seed='x'.repeat(81),x=>x.orbit.rows[1][0]=x.orbit.rows[0][0],x=>x.display.labels='true',x=>x.cameras.follow.fov=0]){
 const value=structuredClone(fixture);mutate(value);assert.throws(()=>validateScene(value));
}
const extra=structuredClone(fixture);extra.weather.orbitRecord='foreign-local-id';extra.environment.unknown='https://example.test';extra.assembly.unused='ignored';
const clean=validateScene(extra);assert.equal(clean.weather.orbitRecord,undefined);assert.equal(clean.environment.unknown,undefined);assert.equal(clean.assembly.unused,undefined);
const poisoned=JSON.parse(JSON.stringify(fixture));Object.defineProperty(poisoned.environment,'__proto__',{value:{polluted:true},enumerable:true});validateScene(poisoned);assert.equal({}.polluted,undefined);
console.log('Scene sharing: round-trip, recursive/repeated assemblies, invalid input and field isolation passed');

const fx=structuredClone(fixture);fx.phenomena={...PHENOMENA_DEFAULTS,mode:'enhanced',meteors:false};assert.deepEqual(validateScene(fx).phenomena,fx.phenomena);fx.phenomena.lightning='yes';assert.throws(()=>validateScene(fx));

const chartScene=structuredClone(fixture);Object.assign(chartScene.environment,normalizeStarChartSettings({starChartEnabled:true,starLabels:false,starLabelScope:'all',constellationBoundaries:true,starLabelDensity:.8}));
assert.deepEqual(validateScene(chartScene).environment,{...chartScene.environment,...normalizeGeographySettings()});
assert.equal(validateScene(fixture).environment.starChartEnabled,false);
const legacyStars=structuredClone(fixture);legacyStars.environment.starLabels=true;
assert.equal(validateScene(legacyStars).environment.starLabelScope,'classic');
assert.equal(validateScene(legacyStars).environment.starChartEnabled,true);
for(const [key,value] of [['starChartEnabled','true'],['starLabelScope','unknown'],['starLabelDensity',1.1],['constellationLines',0],['constellationNames',null],['constellationBoundaries',[]]]){
 const invalid=structuredClone(chartScene);invalid.environment[key]=value;assert.throws(()=>validateScene(invalid));
}
console.log('Star chart scene settings, classic migration and strict validation passed');

const geoScene=structuredClone(chartScene);Object.assign(geoScene.environment,normalizeGeographySettings({geographyEnabled:true,geoBorders:false,geoDensity:.8}));
assert.deepEqual(validateScene(geoScene).environment,geoScene.environment);
for(const [key,value] of [['geographyEnabled','yes'],['geoDensity',NaN],['geoCountries',1]]){const invalid=structuredClone(geoScene);invalid.environment[key]=value;assert.throws(()=>validateScene(invalid));}
console.log('Geography scene round trip, old-scene defaults and strict validation passed');
