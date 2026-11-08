import assert from 'node:assert/strict';
import {STAR_CHART_DEFAULTS,normalizeStarChartSettings,syncStarChartControls,bindStarChartControls} from '../src/star-chart-settings.js';
assert.deepEqual(normalizeStarChartSettings(),STAR_CHART_DEFAULTS);
assert.deepEqual(normalizeStarChartSettings(Object.create({starLabels:true})),STAR_CHART_DEFAULTS);
assert.deepEqual(normalizeStarChartSettings({starLabels:false}),STAR_CHART_DEFAULTS);
const legacy=normalizeStarChartSettings({starLabels:true});assert.equal(legacy.starChartEnabled,true);assert.equal(legacy.starLabels,true);assert.equal(legacy.catalogStarLabels,false);assert(!Object.hasOwn(legacy,'starLabelScope'));
const current={...STAR_CHART_DEFAULTS,starChartEnabled:true,starLabels:false,catalogStarLabels:true,solarSystemLabels:false,constellationNames:false,constellationBoundaries:true,starLabelDensity:1};
assert.deepEqual(normalizeStarChartSettings(current,{strict:true}),current);
assert.deepEqual(normalizeStarChartSettings({...current,unknown:'discard'}),current);
for(const invalid of [{starChartEnabled:'false'},{starLabelScope:'bogus'},{starLabelDensity:Infinity},{starLabelDensity:-.1},{catalogStarLabels:'yes'},{solarSystemLabels:0},{constellationArt:'yes'},{constellationBoundaries:'yes'},{deepSkyObjects:'yes'},{deepSkyScope:'images'},null,[]])assert.throws(()=>normalizeStarChartSettings(invalid,{strict:true}));
for(const scope of ['major','all','catalog']){
 const old=normalizeStarChartSettings({starChartEnabled:true,starLabelScope:scope});
 assert.equal(old.catalogStarLabels,false);assert(!Object.hasOwn(old,'starLabelScope'),'legacy presets must not silently re-enable catalogue labels');
}
const oldHidden=normalizeStarChartSettings({starChartEnabled:true,starLabels:false});assert(!oldHidden.starLabels&&!oldHidden.catalogStarLabels&&!oldHidden.solarSystemLabels);
const ids=['starChartEnabled','starNames','catalogStarNames','solarSystemNames','constellationNames','constellationArt','constellationLines','constellationBoundaries','starLabelDensity','starDensityAll','starDensityAuto','deepSkyObjects','deepSkyScope'];
const nodes=Object.fromEntries(ids.map(id=>[id,{checked:false,value:'',disabled:false,hidden:false}]));
globalThis.document={getElementById:id=>nodes[id]};
let changed=0;const settings={...STAR_CHART_DEFAULTS};bindStarChartControls(settings,()=>changed++);
assert(!nodes.starNames.disabled,'global categories remain editable when the main display is off');
assert.equal(nodes.constellationArt.checked,true,'constellation art is a shared, default-on category');
nodes.constellationArt.checked=false;nodes.constellationArt.onchange();assert.equal(settings.constellationArt,false);
nodes.starChartEnabled.checked=true;nodes.starChartEnabled.onchange();
nodes.starNames.checked=false;nodes.starNames.onchange();assert.equal(settings.starLabels,false);assert.equal(settings.catalogStarLabels,false);
nodes.starChartEnabled.checked=false;nodes.starChartEnabled.onchange();nodes.starChartEnabled.checked=true;nodes.starChartEnabled.onchange();assert.equal(settings.starLabels,false,'display masters never rewrite categories');
assert.equal(settings.constellationArt,false,'display masters preserve an explicit art opt-out');
nodes.starLabelDensity.value='1';nodes.starLabelDensity.oninput();assert.equal(settings.starLabelDensity,1);assert.equal(nodes.starDensityAll.hidden,false);assert.equal(nodes.starDensityAuto.hidden,true);
nodes.deepSkyScope.value='all';nodes.deepSkyScope.onchange();assert.equal(settings.deepSkyScope,'all');
nodes.deepSkyObjects.checked=false;nodes.deepSkyObjects.onchange();assert.equal(nodes.deepSkyScope.disabled,true);
syncStarChartControls(current);assert.equal(nodes.starNames.checked,false);assert.equal(nodes.catalogStarNames.checked,true);assert.equal(nodes.solarSystemNames.checked,false);assert.equal(nodes.constellationBoundaries.checked,true);
assert.equal(changed,8);delete globalThis.document;
console.log('Star-chart categories: shared preferences, independent display master, scope migration, true maximum density and strict validation passed.');

const {migrateStarDensityDefault}=await import('../src/star-chart-settings.js');
const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
const old={starLabelDensity:1};migrateStarDensityDefault(old,storage);assert.equal(old.starLabelDensity,.95);
old.starLabelDensity=1;migrateStarDensityDefault(old,storage);assert.equal(old.starLabelDensity,1);
saved.clear();const quiet={starLabelDensity:.35};migrateStarDensityDefault(quiet,storage);assert.equal(quiet.starLabelDensity,.35);
assert.equal(STAR_CHART_DEFAULTS.starLabelDensity,.95);

const {migrateCatalogStarDefault}=await import('../src/star-chart-settings.js');
assert.equal(STAR_CHART_DEFAULTS.catalogStarLabels,false);
assert.equal(STAR_CHART_DEFAULTS.constellationArt,true);
assert.equal(normalizeStarChartSettings({constellationArt:false},{strict:true}).constellationArt,false,'scene and finder normalization retain an art opt-out');
for(const density of [1,.95,.35]){
 saved.clear();const previous={...current,starLabelDensity:density,quality:'high'};
 migrateCatalogStarDefault(previous,storage);
 assert.equal(previous.catalogStarLabels,false,'each older startup configuration adopts the requested quieter category once');
 assert.equal(previous.starLabelDensity,density,'catalogue migration does not alter a selected density');
 assert.equal(previous.constellationBoundaries,true,'unrelated categories are preserved');
 const persisted=JSON.parse(saved.get('tiangong-environment-v1'));
 assert.equal(persisted.catalogStarLabels,false);assert.equal(persisted.starChartCatalogDefaultVersion,1,'setting and migration marker share one atomic write');
 persisted.catalogStarLabels=true;
 migrateCatalogStarDefault(persisted,storage);
 assert.equal(persisted.catalogStarLabels,true,'a later explicit selection survives repeated startups');
 assert.equal(normalizeStarChartSettings(persisted,{strict:true}).catalogStarLabels,true,'main view, finder and scene imports share the explicit preference');
}
let saves=0;const fullStorage={setItem(){saves++;throw Error('quota');}};
const unavailable={...current};migrateCatalogStarDefault(unavailable,fullStorage);
assert.equal(unavailable.catalogStarLabels,false);assert.equal(unavailable.starChartCatalogDefaultVersion,1);
unavailable.catalogStarLabels=true;migrateCatalogStarDefault(unavailable,fullStorage);
assert.equal(unavailable.catalogStarLabels,true,'a failed persistence attempt must not reapply the default during this session');
assert.equal(saves,1);
assert.equal(JSON.parse(JSON.stringify(unavailable)).starChartCatalogDefaultVersion,1,'a later successful normal settings save retains the marker');
console.log('Catalogue-label default: quiet first startup, one-time persisted migration, explicit opt-in and storage failure passed.');

for (const value of [0,.15,.65,1]) assert.equal(normalizeStarChartSettings({chineseSymbolOpacity:value},{strict:true}).chineseSymbolOpacity,value);
for (const value of [-.01,1.01,Infinity,NaN,'0.5',null]) assert.throws(()=>normalizeStarChartSettings({chineseSymbolOpacity:value},{strict:true}));
assert.equal(normalizeStarChartSettings({skyCulture:'chinese'}).chineseSymbolOpacity,.2,'old settings acquire visible overview default');
console.log('Chinese overview opacity: defaults, endpoints, persistence normalization and invalid input rejection passed');

const opacityNodes={...nodes,chineseSymbolOpacity:{value:''},chineseSymbolOpacityValue:{textContent:''},chineseSymbolAppearance:{hidden:false}};
globalThis.document={getElementById:id=>opacityNodes[id]};
const opacitySettings={...STAR_CHART_DEFAULTS,skyCulture:'chinese',chineseSymbolArt:true};
let opacityUpdates=0;bindStarChartControls(opacitySettings,()=>opacityUpdates++);
assert.equal(opacityNodes.chineseSymbolOpacity.value,'0.2');assert.equal(opacityNodes.chineseSymbolOpacityValue.textContent,'20%');
assert.equal(opacityNodes.chineseSymbolAppearance.hidden,false);
opacityNodes.chineseSymbolOpacity.value='0.25';opacityNodes.chineseSymbolOpacity.oninput();
assert.equal(opacitySettings.chineseSymbolOpacity,.25);assert.equal(opacityNodes.chineseSymbolOpacityValue.textContent,'25%');assert.equal(opacityUpdates,1);
opacitySettings.skyCulture='western';syncStarChartControls(opacitySettings);assert.equal(opacityNodes.chineseSymbolAppearance.hidden,true);assert.equal(opacitySettings.chineseSymbolOpacity,.25);
assert.equal(normalizeStarChartSettings(JSON.parse(JSON.stringify(opacitySettings)),{strict:true}).chineseSymbolOpacity,.25);
delete globalThis.document;
console.log('Chinese overview opacity slider: input, displayed percentage, culture visibility and saved preference passed');
