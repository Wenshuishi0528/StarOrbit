import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export {CloudLibrary} from './src/cloud-library.js'; export {nasaCoverage,nasaMostlyGlobal,nasaCoverageEstimate} from './src/cloud-source.js';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {CloudLibrary,nasaCoverage,nasaMostlyGlobal,nasaCoverageEstimate}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const value={provider:'satcorps',coverageCheck:{state:'ready',estimated:true,coverage:.98,polarCoverage:{north:.99,south:.9}}};
assert.equal(nasaCoverage(value),'unknown','an estimate cannot satisfy full scientific acceptance');
assert.equal(nasaMostlyGlobal(value),true);
assert.equal(nasaMostlyGlobal({...value,coverage:.4,polarCoverage:{north:.9,south:.9}}),false,'full measured coverage takes precedence');
for(const coverage of [NaN,Infinity,-1,2])assert.equal(nasaCoverageEstimate({...value,coverageCheck:{...value.coverageCheck,coverage}}),null);
assert.equal(nasaMostlyGlobal({...value,coverageCheck:{...value.coverageCheck,polarCoverage:{north:.3,south:1}}}),false);
globalThis.location={protocol:'http:'};
const lib=new CloudLibrary({items:[],active:{},settings:{}}),nativeFetch=globalThis.fetch;
const row={provider:'satcorps',key:'satcorps:2026-11-08:12',time:Date.UTC(2026,10,8,12),coverageCheck:{state:'queued',estimated:true}};
try{
 let pollCount=0;
 globalThis.fetch=async url=>{
  if(url.startsWith('/api/cloud/versions?'))return Response.json({items:[row],dates:['2026-11-08']});
  if(url.startsWith('/api/cloud/coverage?')){pollCount++;return Response.json({items:[{key:row.key,coverageCheck:value.coverageCheck}],coverageStatus:{ready:1,pending:0,running:0,error:0}});}
  throw Error(url);
 };
 await lib.refreshCatalog('2026-11','2026-11-08');
 await new Promise(r=>setTimeout(r,1700));
 assert.equal(pollCount,1);assert.equal(lib.catalog.items[0].coverageCheck.coverage,.98);
 assert.equal(lib.catalogs.get('2026-11|2026-11-08').items[0].coverageCheck.state,'ready');
 // A delayed probe from the old date must not overwrite the new selection.
 let resolveOld,started;
 const requested=new Promise(r=>started=r);
 globalThis.fetch=async url=>{
  if(url.startsWith('/api/cloud/versions?'))return Response.json({items:url.includes('2026-11-07')?[]:[row],dates:[]});
  if(url.startsWith('/api/cloud/coverage?'))return new Promise(resolve=>{resolveOld=resolve;started();});
  throw Error(url);
 };
 await lib.refreshCatalog('2026-11','2026-11-08',true);
 let guard;try{await Promise.race([requested,new Promise((_,reject)=>guard=setTimeout(()=>reject(Error('poll did not start')),3000))]);}finally{clearTimeout(guard);}
 await lib.refreshCatalog('2026-11','2026-11-07');
 resolveOld(Response.json({items:[{key:row.key,coverageCheck:value.coverageCheck}]}));
 await new Promise(r=>setTimeout(r,20));
 assert.equal(lib.catalog.date,'2026-11-07');assert.deepEqual(lib.catalog.items,[]);
 lib.cancelCatalog();assert.equal(lib.coverageController,null);
}finally{lib.dispose();globalThis.fetch=nativeFetch;}
console.log('Coverage preview: estimate/full distinction, finite thresholds, polar exclusions, automatic polling and stale-date cancellation passed');
