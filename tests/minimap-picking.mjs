import assert from 'node:assert/strict';
import {nearestTrackTime as pick} from '../src/minimap-picking.js';
assert.equal(pick([],10,10,360,180,0),null);
const line=[[0,-60,0],[60000,60,0]];
assert.equal(pick(line,180,90,360,180,0).time,30000);
assert.equal(pick(line,10,90,360,180,0).time,0);
assert.equal(pick(line,350,90,360,180,0).time,60000);
const seam=[[0,170,0],[20000,-170,0]];
assert.equal(pick(seam,359,90,360,180,0).time,9000);
assert.equal(pick(seam,1,90,360,180,0).time,11000);
assert.ok(pick(seam,180,90,360,180,0).distance>=170); // no false segment across the map
assert.equal(pick(line,90,45,180,90,0).time,30000); // responsive CSS dimensions
console.log({trackSeeking:'pass',dateLine:'pass',bounds:'pass',responsive:'pass'});
