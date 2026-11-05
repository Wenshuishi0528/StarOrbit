import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {trialCoordinate,trialPixel,trialProject,trialConfidence,trialRegions} from '../src/cloud-trial-math.js';
assert.deepEqual(trialCoordinate(trialRegions.dateline,.5,.5),[-180,23.240000000000002]);
assert(Math.abs(trialCoordinate(trialRegions.dateline,.48975,.5)[0]-179.59)<1e-8);
assert.equal(trialCoordinate(trialRegions.north,.5,.5)[1],90);
assert(Math.abs(trialCoordinate(trialRegions.north,1,.5)[1]-60)<1e-8);
assert.equal(trialCoordinate(trialRegions.north,0,0),null);
assert.deepEqual(trialPixel(180,90,2048,1024),[0,0]);assert.deepEqual(trialPixel(-180,-90,2048,1024),[0,1023]);
const source=new Uint8ClampedArray([255,247,236,255,0,0,0,0,127,0,0,255,255,247,236,255]);
const before=source.slice(),region={bbox:[-180,-90,180,90],width:4,height:1};
const p=trialProject(source,4,1,region);assert.deepEqual(p.pixels,source);assert.equal(p.validFraction,.75);assert.deepEqual(source,before);
const dateLine=trialProject(source,4,1,{bbox:[90,-90,270,90],width:2,height:1});assert.deepEqual([...dateLine.pixels],[255,247,236,255,255,247,236,255]);
assert.equal(trialConfidence([0,0,0,0],[]),'无数据');assert.match(trialConfidence([1,2,3,255],[]),/无精确数值/);
const meta=JSON.parse(fs.readFileSync('assets/cloud-trial/manifest.json'));
for(const [name,file] of Object.entries(meta.files)){
 const bytes=fs.readFileSync('assets/cloud-trial/'+name);assert.equal(bytes.length,file.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);assert.equal(bytes.readUInt32BE(16),2048);assert.equal(bytes.readUInt32BE(20),1024);
}
assert.match(trialConfidence([255,247,236,255],meta.palette),/0.0,0.01/);assert.match(trialConfidence([127,0,0,255],meta.palette),/1.0/);
const code=fs.readFileSync('src/cloud-trial.js','utf8');assert(!code.includes('localStorage')&&!code.includes('cache.put')&&!code.includes('setSource('));
assert(code.includes('token!==serial')&&code.includes('bitmap.close()'));
console.log('VIIRS trial: dateline wrapping, polar projection, no-data preservation, palette, immutable inputs, sample SHA and isolation passed');
