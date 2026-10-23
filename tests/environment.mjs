import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {equatorial,geographicUV,qualityFor} from '../src/environment-math.js';
import {snapshot,validateOrbit} from '../src/orbit.js';
const close=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const stars=JSON.parse(fs.readFileSync(new URL('../assets/stars.json',import.meta.url)));
assert.equal(stars.length,41411);
assert.deepEqual([6,7,8].map(m=>stars.filter(r=>r[3]<=m).length),[5044,15544,41411]);
for(let i=1;i<stars.length;i++)assert.ok(stars[i][3]>=stars[i-1][3]);
for(const [ra,dec,expected] of [[0,0,[1,0,0]],[90,0,[0,1,0]],[0,90,[0,0,1]],[180,0,[-1,0,0]]])equatorial(ra,dec).forEach((v,i)=>close(v,expected[i]));
assert.deepEqual(geographicUV(0,0),[.5,.5]);assert.deepEqual(geographicUV(-180,90),[0,1]);assert.deepEqual(geographicUV(180,-90),[1,0]);
close(geographicUV(116.4,39.9)[0],.8233333333333334);close(geographicUV(116.4,39.9)[1],.7216666666666667);
assert.equal(qualityFor('high',4096),'standard');assert.equal(qualityFor('high',8192),'high');
const data=validateOrbit(JSON.parse(fs.readFileSync(new URL('../assets/orbit.json',import.meta.url))));
const q=snapshot(data,data.rows[0][0]+600000),r=q.position.map(v=>v/Math.hypot(...q.position));
const local=q.earthAxes.map(a=>a.reduce((s,v,i)=>s+v*r[i],0));
close(Math.atan2(local[1],local[0])*180/Math.PI,q.longitude);close(Math.asin(local[2])*180/Math.PI,q.latitude);
const restored=[0,1,2].map(i=>local.reduce((s,v,j)=>s+v*q.earthAxes[j][i],0));restored.forEach((v,i)=>close(v,r[i]));
// Preserve the existing orbit/solar calculations exactly across this visual update.
const sha=crypto.createHash('sha256').update(fs.readFileSync(new URL('../src/orbit.js',import.meta.url))).digest('hex');
assert.equal(sha,'2929ccbfaa96c5bd1fa30ccbb435d3fcbe07a84d9d885b698660f33f9a6b4bd7');
console.log({starCounts:[5044,15544,41411],geographicRegistration:'pass',inertialAxes:'pass',fallback:'pass',orbitUnchanged:true});

assert.equal(qualityFor('standard',2048),'medium');assert.equal(qualityFor('high',1024),'simple');
