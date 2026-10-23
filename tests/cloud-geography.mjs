import assert from 'node:assert/strict';
import {climateMasks,climatePixels} from '../src/cloud-geography.js';
// Geographic dry-land and humid-land priors, with marine cloud regions kept separate.
for(const [lon,lat] of [[15,24],[46,24],[134,-25],[-70,-24],[18,-24]])assert.ok(climateMasks(lon,lat)[0]>.8);
for(const [lon,lat] of [[-62,-5],[23,0],[118,2]]){const [dry,humid]=climateMasks(lon,lat);assert.ok(humid>.8&&humid>dry);}
assert.ok(climateMasks(-87,-18)[2]>.9); // low marine clouds off the dry Atacama coast
for(const lat of [-90,-45,0,45,90])assert.deepEqual(climateMasks(-180,lat),climateMasks(180,lat));
const data=climatePixels();assert.equal(data.length,512*256*4);assert.ok(data.every(Number.isFinite));
console.log({dryInteriors:'pass',humidTropics:'pass',marineClouds:'pass',datelineContinuity:'pass'});
