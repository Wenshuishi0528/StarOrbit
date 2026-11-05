import assert from 'node:assert/strict';
import {cameraAxes,earthInFront,focalLength,fovAtZoom,groundDirection,lookDirection,nudge,skyCoordinates,zoomAtFov} from '../src/xuntian-pointing.js';
import {dot,norm,unit,EARTH_RADIUS} from '../src/orbit.js';
const near=(a,b,eps=1e-8)=>assert(Math.abs(a-b)<eps,a+' ≠ '+b);
for(const target of [[1,0,0],[0,1,0],[0,0,1],[0,0,-1],[-.25,-.75,.5]]){
 const p=lookDirection(target),{right,up,forward}=cameraAxes(p);near(dot(forward,unit(target)),1);near(dot(right,up),0);near(dot(forward,right),0);near(norm(up),1);
 nudge(p,1,0);const shift=cameraAxes(p);assert(dot(shift.forward,right)>0);nudge(p,-1,0);near(dot(cameraAxes(p).forward,forward),1);
 nudge(p,0,1);assert(dot(cameraAxes(p).forward,up)>0);
}
for(const field of [.35,.5,2,5,47,103.8,110]){near(fovAtZoom(zoomAtFov(field)),field);near(2*Math.atan(12/focalLength(field))*180/Math.PI,field);}
const eye=[6570,1200,500],q={velocity:[-.4,6.6,3.2]},horizon=groundDirection('horizon',eye,q),nadir=groundDirection('nadir',eye,q);
near(norm(horizon),1);near(norm(nadir),1);near(dot(nadir,unit(eye)),-1);
const distance=-dot(eye,horizon);near(norm(eye.map((x,i)=>x+distance*horizon[i])),EARTH_RADIUS);
assert(earthInFront(eye,nadir));assert(!earthInFront(eye,unit(eye)));
assert.match(skyCoordinates([0,1,0]),/06ʰ 00ᵐ/);assert.match(skyCoordinates([0,0,-1]),/−90.00°/);
console.log('Xuntian pointing: inertial camera at both poles, screen-relative controls, focal length, horizon and nadir passed.');

// The shortcut can only look at terrain seen from this orbit, at this epoch.
const {sunlitGroundDirection,groundSunAltitude}=await import('../src/xuntian-pointing.js');
const {groundHit}=await import('../src/xuntian-view-math.js');
const qSun={earthAxes:[[1,0,0],[0,1,0],[0,0,1]]},above=[EARTH_RADIUS+400,0,0];
for(const deg of [0,40,89,97,109]){
 const sun=[Math.cos(deg*Math.PI/180),Math.sin(deg*Math.PI/180),0],dir=sunlitGroundDirection(above,sun);
 assert(dir,'there should be sunlit ground at '+deg);
 const hit=groundHit(above,dir,qSun.earthAxes);assert(hit?.kind==='earth'&&hit.distanceKm>=399);
 assert(groundSunAltitude(hit,{...qSun,sun})>0,'the point must be in actual sunlight at '+deg);
}
assert.equal(sunlitGroundDirection(above,[-1,0,0]),null);
assert.equal(sunlitGroundDirection(above,[Math.cos(112*Math.PI/180),Math.sin(112*Math.PI/180),0]),null);
near(groundSunAltitude({kind:'earth',latitude:0,longitude:0},{...qSun,sun:[-1,0,0]}),-90);
console.log('Sunlit shortcut and solar elevation distinguish day, twilight and completely invisible day side.');
