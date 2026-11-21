import assert from 'node:assert/strict';
import fs from 'node:fs';
import {equatorial,geographicUV,qualityFor,deviceTextureLimits} from '../src/environment-math.js';
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
const caps = {maxTextureSize: 16384, maxCubemapSize: 8192};
const appleTouch = {staged: true, earthWidth: 4096, cubeFace: 1024, pixelRatio: 1.5};
for (const device of [
  {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5},
  {userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5},
]) assert.deepEqual(deviceTextureLimits(device, caps), appleTouch);
for (const device of [
  {userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 0},
  {userAgent: 'Mozilla/5.0 (Linux; Android)', platform: 'Linux', maxTouchPoints: 5},
]) assert.deepEqual(deviceTextureLimits(device, caps), {staged:false, earthWidth:16384, cubeFace:8192, pixelRatio:Infinity});
assert.deepEqual(deviceTextureLimits({userAgent:'iPad'}, {maxTextureSize:2048,maxCubemapSize:512}), {...appleTouch,earthWidth:2048,cubeFace:512});
const data=validateOrbit(JSON.parse(fs.readFileSync(new URL('../assets/orbit.json',import.meta.url))));
const q=snapshot(data,data.rows[0][0]+600000),r=q.position.map(v=>v/Math.hypot(...q.position));
const local=q.earthAxes.map(a=>a.reduce((s,v,i)=>s+v*r[i],0));
close(Math.atan2(local[1],local[0])*180/Math.PI,q.longitude);close(Math.asin(local[2])*180/Math.PI,q.latitude);
const restored=[0,1,2].map(i=>local.reduce((s,v,j)=>s+v*q.earthAxes[j][i],0));restored.forEach((v,i)=>close(v,r[i]));
// Numerical orbit regressions are checked in physics.mjs; adapters may evolve.
console.log({starCounts:[5044,15544,41411],geographicRegistration:'pass',inertialAxes:'pass',fallback:'pass'});

assert.equal(qualityFor('standard',2048),'medium');assert.equal(qualityFor('high',1024),'simple');
