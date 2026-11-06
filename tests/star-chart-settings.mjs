import assert from 'node:assert/strict';
import {STAR_CHART_DEFAULTS,normalizeStarChartSettings,syncStarChartControls,bindStarChartControls} from '../src/star-chart-settings.js';
assert.deepEqual(normalizeStarChartSettings(),STAR_CHART_DEFAULTS);
assert.deepEqual(normalizeStarChartSettings(Object.create({starLabels:true})),STAR_CHART_DEFAULTS);
assert.deepEqual(normalizeStarChartSettings({starLabels:false}),STAR_CHART_DEFAULTS);
const legacy=normalizeStarChartSettings({starLabels:true});assert.equal(legacy.starChartEnabled,true);assert.equal(legacy.starLabels,true);assert.equal(legacy.catalogStarLabels,false);assert(!Object.hasOwn(legacy,'starLabelScope'));
const current={...STAR_CHART_DEFAULTS,starChartEnabled:true,starLabels:false,catalogStarLabels:true,solarSystemLabels:false,constellationNames:false,constellationBoundaries:true,starLabelDensity:1};
assert.deepEqual(normalizeStarChartSettings(current,{strict:true}),current);
assert.deepEqual(normalizeStarChartSettings({...current,unknown:'discard'}),current);
for(const invalid of [{starChartEnabled:'false'},{starLabelScope:'bogus'},{starLabelDensity:Infinity},{starLabelDensity:-.1},{catalogStarLabels:'yes'},{solarSystemLabels:0},{constellationBoundaries:'yes'},{deepSkyObjects:'yes'},{deepSkyScope:'images'},null,[]])assert.throws(()=>normalizeStarChartSettings(invalid,{strict:true}));
for(const scope of ['major','all','catalog']){
 const old=normalizeStarChartSettings({starChartEnabled:true,starLabelScope:scope});
 assert.equal(old.catalogStarLabels,true);assert(!Object.hasOwn(old,'starLabelScope'),'no legacy scope may silently exclude identifiers');
}
const oldHidden=normalizeStarChartSettings({starChartEnabled:true,starLabels:false});assert(!oldHidden.starLabels&&!oldHidden.catalogStarLabels&&!oldHidden.solarSystemLabels);
const ids=['starChartEnabled','starNames','catalogStarNames','solarSystemNames','constellationNames','constellationLines','constellationBoundaries','starLabelDensity','starDensityAll','starDensityAuto','deepSkyObjects','deepSkyScope'];
const nodes=Object.fromEntries(ids.map(id=>[id,{checked:false,value:'',disabled:false,hidden:false}]));
globalThis.document={getElementById:id=>nodes[id]};
let changed=0;const settings={...STAR_CHART_DEFAULTS};bindStarChartControls(settings,()=>changed++);
assert(!nodes.starNames.disabled,'global categories remain editable when the main display is off');
nodes.starChartEnabled.checked=true;nodes.starChartEnabled.onchange();
nodes.starNames.checked=false;nodes.starNames.onchange();assert.equal(settings.starLabels,false);assert.equal(settings.catalogStarLabels,true);
nodes.starChartEnabled.checked=false;nodes.starChartEnabled.onchange();nodes.starChartEnabled.checked=true;nodes.starChartEnabled.onchange();assert.equal(settings.starLabels,false,'display masters never rewrite categories');
nodes.starLabelDensity.value='1';nodes.starLabelDensity.oninput();assert.equal(settings.starLabelDensity,1);assert.equal(nodes.starDensityAll.hidden,false);assert.equal(nodes.starDensityAuto.hidden,true);
nodes.deepSkyScope.value='all';nodes.deepSkyScope.onchange();assert.equal(settings.deepSkyScope,'all');
nodes.deepSkyObjects.checked=false;nodes.deepSkyObjects.onchange();assert.equal(nodes.deepSkyScope.disabled,true);
syncStarChartControls(current);assert.equal(nodes.starNames.checked,false);assert.equal(nodes.catalogStarNames.checked,true);assert.equal(nodes.solarSystemNames.checked,false);assert.equal(nodes.constellationBoundaries.checked,true);
assert.equal(changed,7);delete globalThis.document;
console.log('Star-chart categories: shared preferences, independent display master, scope migration, true maximum density and strict validation passed.');

const {migrateStarDensityDefault}=await import('../src/star-chart-settings.js');
const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
const old={starLabelDensity:1};migrateStarDensityDefault(old,storage);assert.equal(old.starLabelDensity,.95);
old.starLabelDensity=1;migrateStarDensityDefault(old,storage);assert.equal(old.starLabelDensity,1);
saved.clear();const quiet={starLabelDensity:.35};migrateStarDensityDefault(quiet,storage);assert.equal(quiet.starLabelDensity,.35);
assert.equal(STAR_CHART_DEFAULTS.starLabelDensity,.95);
