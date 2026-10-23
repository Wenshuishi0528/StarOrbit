// The minimap must reuse parsed assets after Environment releases inline JSON.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const source=await build({entryPoints:['src/minimap.js'],bundle:true,platform:'node',format:'esm',write:false});
const elements=new Map();
globalThis.document={getElementById(id){assert.notEqual(id,'environmentAssets');if(!elements.has(id))elements.set(id,{getContext:()=>({}),addEventListener(){},focus(){}});return elements.get(id);}};
globalThis.localStorage={getItem:()=>null};
globalThis.Image=class{};
globalThis.ResizeObserver=class{observe(){}};
const {OrbitMinimap}=await import('data:text/javascript;base64,'+Buffer.from(source.outputFiles[0].text).toString('base64'));
const sim={environment:{assets:{simple:{day:'test-map.jpg'}}}};
const minimap=new OrbitMinimap(sim);
assert.equal(minimap.image.src,'test-map.jpg');assert.ok(minimap.visible);
console.log({minimapSharedAssets:'pass',inlineJSONNotRead:true});
