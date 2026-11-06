// The minimap must reuse parsed assets after Environment releases inline JSON.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const source=await build({entryPoints:['src/minimap.js'],bundle:true,platform:'node',format:'esm',write:false});
const elements=new Map();
globalThis.document={getElementById(id){assert.notEqual(id,'environmentAssets');if(!elements.has(id))elements.set(id,{getContext:()=>({}),addEventListener(){},focus(){},setAttribute(key,value){this[key]=value;}});return elements.get(id);}};
globalThis.localStorage={getItem:()=>null};
globalThis.Image=class{};
globalThis.ResizeObserver=class{observe(){}};
const {OrbitMinimap}=await import('data:text/javascript;base64,'+Buffer.from(source.outputFiles[0].text).toString('base64'));
const sim={environment:{assets:{minimap:'display-map.jpg',simple:{day:'reflectance-map.jpg'}}}};
const minimap=new OrbitMinimap(sim);
assert.equal(minimap.image.src,'display-map.jpg');assert.ok(minimap.visible);
minimap.setVisible(false);assert.equal(elements.get('openOrbitMap')['aria-expanded'],'false');assert.equal(elements.get('showMinimap').checked,false);minimap.setVisible(true);assert.equal(elements.get('openOrbitMap')['aria-expanded'],'true');
delete sim.environment.assets.minimap;
assert.equal(new OrbitMinimap(sim).image.src,'reflectance-map.jpg');
console.log({minimapIndependentAsset:'pass',legacyFallback:'pass',inlineJSONNotRead:true});

// Shade resources are lazy, fixed-size and reused through resize/time changes.
let creates=0,uploads=0,draws=0;
document.createElement=tag=>{assert.equal(tag,'canvas');creates++;return {getContext:()=>({putImageData(){uploads++;}})};};
globalThis.ImageData=class{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}};
minimap.ctx.drawImage=()=>draws++;
assert.equal(creates,0,'constructor does not prepare shade during startup');
minimap.drawNight([1,0,0],336,168);
const shade=minimap.night;
minimap.drawNight([1,0,0],230,115);
minimap.drawNight([0,1,0],8192,4096);
assert.equal(minimap.night,shade);assert.equal(creates,1);assert.equal(uploads,2);assert.equal(draws,3);
assert.equal(shade.canvas.width,360);assert.equal(shade.canvas.height,180);
assert.equal(shade.image.data,shade.raster.pixels);
console.log({lazyMinimapShade:'pass',resizeAndTimeReuse:'pass',qualityIndependent:'pass'});
