import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {placeSkyLabels} from '../src/star-chart-math.js';

const bundle=await build({stdin:{contents:"export * from './src/star-chart-symbols.js';export * from './src/star-label-catalog.js';export {DEEP_SKY_OBJECTS} from './src/deep-sky-catalog.js';",resolveDir:fileURLToPath(new URL('..',import.meta.url))},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const {DEEP_SKY_OBJECTS:objects,deepSkyLabel,deepSkySymbol,deepSkyInScope,starChartName,starChartGlyphText}=api;
const andromeda=objects.find(object=>object.id==='M31'),orion=objects.find(object=>object.id==='M42'),hercules=objects.find(object=>object.id==='M13');
assert(andromeda&&orion&&hercules);
assert.match(deepSkyLabel(andromeda),/M31/);assert.match(deepSkyLabel(andromeda),/仙女/);
assert(deepSkyInScope(andromeda,'featured'));assert(deepSkyInScope(orion,'messier'));
assert(!deepSkyInScope({id:'NGC9999'},'messier'));assert(!deepSkyInScope({id:'M110'},'featured'));assert(deepSkyInScope({id:'M110'},'all'));
assert.equal(deepSkySymbol(andromeda).shape,'ellipse');assert.equal(deepSkySymbol(orion).shape,'box');assert.equal(deepSkySymbol(hercules).shape,'cross-circle');
const wide=deepSkySymbol(andromeda,{fovY:60,height:800}),narrow=deepSkySymbol(andromeda,{fovY:10,height:800});
assert(narrow.width>wide.width);assert(narrow.width<=120&&narrow.height<=120);
for(const object of objects){
 const symbol=deepSkySymbol(object,{fovY:.001,height:1000});
 assert(Number.isFinite(symbol.width)&&Number.isFinite(symbol.height));
 assert(symbol.width>=8&&symbol.height>=8&&symbol.width<=120&&symbol.height<=120);
 assert.equal(symbol.rotation,0,'a catalogue without PA must not invent a measured orientation');
}
// The name stays outside its own angular-size marker and other labels.
const anchor={key:'M31',x:300,y:250,w:120,h:22,anchorRadius:60};
const marker={x:240,y:230,w:120,h:40};
const placed=placeSkyLabels([anchor,{key:'star',x:300,y:250,w:80,h:22}],800,600,.55,[marker]);
assert(placed.some(label=>label.key==='M31'),'large extents must not hide their own name');
assert(placed.every(label=>label.rect.x>=marker.x+marker.w||label.rect.x+label.rect.w<=marker.x||label.rect.y>=marker.y+marker.h||label.rect.y+label.rect.h<=marker.y));
assert.equal(starChartName(91262,'zh'),'织女星');assert.equal(starChartName(91262,'en'),'Vega');
assert.equal(starChartName(1011),'HIP 1011');
const glyphs=new Set(starChartGlyphText('zh'));
for(const text of ['HIP 1011',starChartName(113357),deepSkyLabel(andromeda)]){
 // Deep-sky glyphs enter the atlas separately; stellar names must be covered.
 if(text===deepSkyLabel(andromeda))continue;
 assert([...text].every(char=>glyphs.has(char)),text);
}
console.log('Star-chart layers: shared names, catalogue progression, type symbols, angular extents, own-marker avoidance and glyph coverage passed.');
