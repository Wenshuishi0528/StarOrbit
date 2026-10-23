import assert from 'node:assert/strict';
import {buildOpticalDepthTable} from '../src/atmosphere-optics.js';
import {solarAppearance,diskVisibility} from '../src/sun-optics.js';
const table=buildOpticalDepthTable(),p=[0,0,6771],D=149597870.7;
const at=degrees=>{const a=degrees*Math.PI/180;return solarAppearance(p,[Math.cos(a),0,Math.sin(a)],D,table);};
const day=at(45),night=at(-30),horizon=-Math.acos(6371/6771)*180/Math.PI,half=at(horizon);
assert.ok(day.rgb.every(v=>Math.abs(v-1)<1e-6));assert.deepEqual(night.rgb,[0,0,0]);assert.ok(Math.abs(half.visible-.5)<1e-8);
assert.ok(half.rgb[0]>half.rgb[1]&&half.rgb[1]>half.rgb[2]);
let prev=at(horizon-1),maxJump=0;
for(let a=horizon-.999;a<=horizon+3;a+=.001){const next=at(a);for(let c=0;c<3;c++){assert.ok(Number.isFinite(next.rgb[c])&&next.rgb[c]>=0&&next.rgb[c]<=1.000001);maxJump=Math.max(maxJump,Math.abs(next.rgb[c]-prev.rgb[c]));}prev=next;}
assert.ok(maxJump<.005);
const rotated=solarAppearance([6771,0,0],[Math.sin(horizon*Math.PI/180),Math.cos(horizon*Math.PI/180),0],D,table);rotated.rgb.forEach((v,c)=>assert.ok(Math.abs(v-half.rgb[c])<1e-10));
console.log({sun:'pass',day:day.rgb,halfDisk:half,maximumStep:maxJump});

assert.equal(diskVisibility(.0046,.005,0),0);
assert.equal(diskVisibility(.0046,.004,1),1);
assert.ok(Math.abs(diskVisibility(.0046,.0023,0)-.75)<1e-12);
assert.ok(diskVisibility(.0046,.0046,.0046)>0&&diskVisibility(.0046,.0046,.0046)<1);
console.log({solarOccultation:'pass'});

assert.equal(day.twilight,0);assert.equal(at(-15).twilight,0);assert.equal(night.twilight,0);
assert.equal(half.twilight,1);
const tangent=h=>at(-Math.acos((6371+h)/6771)*180/Math.PI);
let last=0,maxTwilightStep=0;
for(let h=100;h>=0;h-=.1){const v=tangent(h).twilight;assert.ok(v>=0&&v<=1&&v>=last-1e-12);maxTwilightStep=Math.max(maxTwilightStep,v-last);last=v;}
assert.ok(maxTwilightStep<.003);assert.equal(tangent(80).twilight,0);
assert.ok(Math.abs(rotated.twilight-half.twilight)<1e-12);
console.log({twilight:'pass',maximumStep:maxTwilightStep});
