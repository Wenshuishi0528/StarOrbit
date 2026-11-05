import assert from 'node:assert/strict';
import {browserPose,delta} from '../src/balcony-orientation.js';
const pose=(alpha,beta,gamma,screen=0,extra={})=>browserPose({alpha,beta,gamma,...extra},screen);
const close=(a,b)=>assert(Math.abs(delta(a,b))<1e-7,`${a} != ${b}`);
// Upright portrait points north, then east; laying the screen down points the rear lens towards the ground.
let q=pose(0,90,0);close(q.yaw,0);close(q.pitch,0);close(q.roll,0);assert.equal(q.absolute,false);
q=pose(270,90,0,0,{absolute:true});close(q.yaw,90);assert.equal(q.absolute,true);
q=pose(270,90,0,90);close(q.yaw,90);close(q.roll,90);
close(pose(0,0,0).pitch,-90);close(pose(0,120,0).pitch,30);
close(pose(null,90,0,0,{webkitCompassHeading:42}).yaw,42);
assert.equal(browserPose({alpha:0,beta:null,gamma:0}),null);
assert.equal(browserPose({alpha:null,beta:0,gamma:0,webkitCompassHeading:-1}),null);
assert.equal(delta(1,359),2);assert.equal(delta(359,1),-2);
console.log('Balcony optical axis, relative/absolute headings, screen roll and missing measurements passed');
