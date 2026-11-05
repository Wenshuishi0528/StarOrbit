import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const dir='assets/earth/day-2026-q2-1km',m=JSON.parse(fs.readFileSync(dir+'/manifest.json'));
assert.equal(m.year,2026);assert.equal(m.quarter,2);assert.deepEqual(m.period,['2026-04-01','2026-06-30']);
assert.equal(m.product,'MCD43A4.061');assert.deepEqual(m.bands,['1','4','3']);
assert.equal(m.sourceTiles,m.sourceInventory.tiles.length);assert(m.sourceTiles>280);assert.equal(new Set(m.sourceInventory.tiles).size,m.sourceTiles);
for(const tile of m.sourceInventory.tiles){
 const c=m.sourceComposites[tile];assert.match(c.sha256,/^[a-f0-9]{64}$/);assert(c.sourceWindows.length>0);
 for(const w of c.sourceWindows){assert(w.start>='2026-04-01T00:00:00Z'&&w.end<'2026-07-01T00:00:00Z');assert(m.sourceInventory.centers.includes(w.center.slice(0,10)));}
}
assert.equal(m.sourceInventory.centers.length,10);
assert(Math.abs(Object.values(m.landAreaFractions).reduce((a,b)=>a+b,0)-1)<1e-9);
assert(Object.values(m.landAreaFractions).every(x=>x>=0&&x<=1));
assert.equal(m.width,43200);assert.equal(m.height,21600);
assert.equal(m.columns,24);assert.equal(m.rows,12);assert.equal(m.tileSize,1800);assert.equal(m.gutter,8);
assert.equal(Object.keys(m.files).filter(f=>/^\d+-\d+\.jpg$/.test(f)).length,288);
let bytes=0;for(const [file,hash] of Object.entries(m.files)){
 const data=fs.readFileSync(dir+'/'+file);bytes+=data.length;
 assert.equal(crypto.createHash('sha256').update(data).digest('hex'),hash,file);
}
assert.equal(bytes,m.totalBytes);assert(bytes<70e6,'keep the new daytime display atlas below 70 MB');
assert.match(m.fallback,/2004/);assert.match(m.displayCurve,/standard sRGB OETF/);assert.match(m.displayCurve,/no gain/);
for(const tier of ['simple','medium','standard'])assert(fs.statSync('assets/earth/day-2004/'+tier+'.jpg').size>1000);
console.log({day2026Q2:'pass',tiles:288,sourceTiles:m.sourceTiles,displayMB:bytes/1e6,sourceFallback:'documented'});
