import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Quaternion} from 'three';
import {EARTH_RADIUS,dot,unit} from '../src/orbit.js';
import {geographicVector} from '../src/geography-math.js';
import {cameraAxes,lookDirection} from '../src/xuntian-pointing.js';
import {groundHit} from '../src/xuntian-view-math.js';
import {cityAnchor,createCityFinder,groundAttitude,opticalPose,orbitCarriedPose,orbitRelativePose,pinCrosshair,steerDetector,trackGround,wrapRoll} from '../src/xuntian-ground-target.js';
const eq=(a,b,eps=1e-8)=>assert(Math.abs(a-b)<eps,`${a} and ${b}`);
const catalog=JSON.parse(readFileSync(new URL('../assets/geography/atlas.json',import.meta.url))).labels;
const finder=createCityFinder(catalog);
for(const q of ['北京','北京市','beijing','Pékin','Пекин'])assert.equal(finder.search(q,'zh')[0].name,'北京');
assert.equal(finder.search('sao paulo','en')[0].name,'São Paulo');
const city=finder.get('city:beijing','zh'),anchor=cityAnchor(city);
eq(city.latitude,39.9042);eq(city.longitude,116.4074);assert.equal(finder.search('HIP 91262','zh').length,0);
const unitAxes=[[1,0,0],[0,1,0],[0,0,1]],q={earthAxes:unitAxes},normal=geographicVector(city.longitude,city.latitude,1);
const eye=normal.map(v=>v*(EARTH_RADIUS+405)),track=trackGround(anchor,eye,q);
const raisedTrack=trackGround(anchor,eye,q,2400);
eq(raisedTrack.range,402.6);
const raisedPin=pinCrosshair(eye,cameraAxes(lookDirection(raisedTrack.direction)),new Quaternion(),q,
 {kind:'earth',longitude:city.longitude+.05,latitude:city.latitude+.02,elevationMeters:2400});
eq(raisedPin.longitude,city.longitude+.05);eq(raisedPin.latitude,city.latitude+.02);
assert.equal(pinCrosshair(eye,cameraAxes(lookDirection(raisedTrack.direction)),new Quaternion(),q,null).kind,'sky');
assert(track.visible);eq(track.range,405);const hit=groundHit(eye,track.direction,unitAxes);eq(hit.latitude,city.latitude);eq(hit.longitude,city.longitude);
const a=2*Math.PI/180,advanced=[[Math.cos(a),Math.sin(a),0],[-Math.sin(a),Math.cos(a),0],[0,0,1]];
const vt=trackGround(anchor,eye,{earthAxes:advanced}),h2=groundHit(eye,vt.direction,advanced);assert(vt.visible&&dot(vt.direction,track.direction)<.99);eq(h2.latitude,city.latitude);eq(h2.longitude,city.longitude);
const opposite=eye.map(x=>-x),far=trackGround(anchor,opposite,q);assert(!far.visible);const nearHit=groundHit(opposite,far.direction,unitAxes);assert(nearHit.distanceKm+10000<far.range);
const pose=lookDirection(track.direction),roll=58,axes=cameraAxes(opticalPose(pose,roll)),pinned=pinCrosshair(eye,axes,pose,q);
assert.equal(pinned.kind,'ground');eq(pinned.latitude,city.latitude);eq(pinned.longitude,city.longitude);
const oriented=groundAttitude(trackGround(pinned,eye,q),pose);eq(oriented.angleTo(pose),0,1e-6);
const emptyBase=lookDirection(unit(eye)),emptyAxes=cameraAxes(opticalPose(emptyBase,-47));
const sky=pinCrosshair(eye,emptyAxes,emptyBase,q);assert.equal(sky.kind,'sky');eq(dot(sky.direction,emptyAxes.forward),1);
const northUp=lookDirection([1,0,0]),before=cameraAxes(northUp),turned=cameraAxes(opticalPose(northUp,90));
eq(dot(before.forward,turned.forward),1);eq(dot(before.up,turned.right),1);eq(dot(before.right,turned.up),-1);
const steered=northUp.clone();steerDetector(steered,0,2,90);const motion=cameraAxes(opticalPose(steered,90)).forward;
assert(dot(motion,turned.up)>.03);eq(dot(motion,turned.right),0);eq(wrapRoll(190),-170);eq(wrapRoll(-190),170);eq(wrapRoll(180),180);
const polar=groundAttitude({direction:[0,0,1],up:[0,0,1]},new Quaternion());eq(dot(cameraAxes(polar).forward,[0,0,1]),1);
console.log('1,210 atlas cities indexed; Earth-fixed and occulted rays, crosshair sky/ground selection, geographic orientation, real roll and detector-relative steering passed.');

const q0={position:[EARTH_RADIUS+405,0,0],velocity:[0,7.7,0]},q90={position:[0,EARTH_RADIUS+405,0],velocity:[-7.7,0,0]};
const rolled=opticalPose(lookDirection([1,0,0]),58),stored=orbitRelativePose(q0,rolled);
eq(orbitCarriedPose(q0,stored).angleTo(rolled),0,1e-7);
const sweep=cameraAxes(orbitCarriedPose(q90,stored)),start=cameraAxes(rolled);
for(const key of ['right','up','forward']){
 const [x,y,z]=start[key];eq(dot(sweep[key],[-y,x,z]),1);
}
const sameA=orbitCarriedPose(q90,stored),sameB=orbitCarriedPose(q90,stored);eq(sameA.angleTo(sameB),0,1e-7);assert.equal(orbitRelativePose(null,rolled),null);
console.log('Orbit-relative release preserves the entire rolled frame, sweeps 90° in a quarter orbit, and holds the identical orientation at a paused epoch.');
