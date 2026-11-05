import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isSolarCellMaterial} from '../src/exposure-lab-hull.js';
import {dot, norm, sub, unit, EARTH_RADIUS} from '../src/orbit.js';
import {CAMERA_PRESETS,CAMERA_OFFSET_LIMIT,cameraAtOpen,moveExposureCamera,earthIntercept,exposureState,exposureTimes,localVector,mountPosition,preferredWingBearing,presetCamera,recommendedNight,trackingAxes,transformAxes} from '../src/exposure-lab-math.js';

const orbit=JSON.parse(fs.readFileSync(new URL('../assets/orbit.json',import.meta.url)));
const first=orbit.rows[0][0],last=orbit.rows.at(-1)[0];
const seconds=300,start=recommendedNight(orbit,last+86400000,seconds);
assert(start>=first&&start+seconds*1000<=last);
assert.equal(start,recommendedNight(orbit,last+86400000,seconds));
assert.equal(recommendedNight(null,first,seconds),null);
assert.equal(recommendedNight({rows:[[0],[6000]]},0,30),null);
const times=exposureTimes(start,seconds);
assert.equal(times.length,501);assert.equal(times[0],start);assert.equal(times.at(-1),start+seconds*1000);
assert(times.slice(1).every((t,i)=>t-times[i]===600));assert.deepEqual(times,exposureTimes(start,seconds));
assert.throws(()=>exposureTimes(start,0));
assert.deepEqual(exposureTimes(start,1),[start,start+500,start+1000]);
const q0=exposureState(orbit,start),q1=exposureState(orbit,times.at(-1));
const initial=cameraAtOpen(q0);
for(const axis of initial)assert(Math.abs(norm(axis)-1)<1e-10);
assert(Math.abs(dot(initial[0],initial[1]))<1e-10);
assert(norm(sub(localVector(initial,initial[2]),[0,0,1]))<1e-10);
const fixed=trackingAxes(q1,q0.basis,initial,'body'),inertial=trackingAxes(q1,q0.basis,initial,'inertial');
const star=initial[2];
assert(norm(sub(localVector(inertial,star),localVector(initial,star)))<1e-12,'star locked in sensor pixels');
assert(norm(sub(localVector(fixed,star),localVector(initial,star)))>.08,'body tracking must move star pixels');
const mountedRay=localVector(q0.basis,star);
assert(norm(sub(localVector(fixed,transformAxes(q1.basis,mountedRay)),[0,0,1]))<1e-8,'hull ray stays fixed only in body mode');
assert(norm(sub(localVector(inertial,transformAxes(q1.basis,mountedRay)),[0,0,1]))>.08);
const p=[EARTH_RADIUS+405,0,0];
assert.deepEqual(earthIntercept(p,[1,0,0]),null);assert.deepEqual(earthIntercept(p,[0,1,0]),null);
assert(norm(sub(earthIntercept(p,[-1,0,0]),[EARTH_RADIUS,0,0]))<1e-7);
assert.equal(earthIntercept(q0.position,star),null,'shutter-open central ray above the Earth limb');
const underLimb=unit(initial[2].map((v,i)=>v-.45*initial[1][i]));
const hit=earthIntercept(q0.position,underLimb);
assert(hit&&Math.abs(norm(hit)-EARTH_RADIUS)<1e-7);
const centerTime=exposureState(orbit,start+seconds*500);
assert(dot(unit(centerTime.position),unit(centerTime.sun))<0,'recommended night is over the dark hemisphere');

const identity=[[1,0,0],[0,1,0],[0,0,1]],center=[5,1,3],span=150,units=5;
for(const [id,preset] of Object.entries(CAMERA_PRESETS)) {
  const settings=presetCamera(id),frame=cameraAtOpen({basis:identity},settings);
  const eye=mountPosition(settings,center,span,units),toCenter=sub(center,eye);
  const screen=localVector(frame,toCenter),half=Math.tan(settings.fov*Math.PI/360);
  assert(Math.abs(screen[0]/(screen[2]*half*16/9)-preset.screen[0])<1e-10);
  assert(Math.abs(screen[1]/(screen[2]*half)-preset.screen[1])<1e-10);
  assert(Math.abs(norm(toCenter)-span*preset.range)<1e-8);
  assert.deepEqual(mountPosition({...settings,azimuth:settings.azimuth+30,pitch:20,fov:66},center,span,units),eye,
    'turning the lens must not move its optical centre');
  const shifted=mountPosition({...settings,x:2,y:-3,z:4},center,span,units);
  assert(norm(sub(sub(shifted,eye),[10,-15,20]))<1e-10,'offsets are metres in labelled station axes');
  const changed=cameraAtOpen({basis:identity},{...settings,azimuth:settings.azimuth+24});
  assert(dot(frame[2],changed[2])<.97);
  assert.deepEqual(cameraAtOpen({basis:identity},{...settings,fov:20}),frame,'zoom keeps pointing');
}
assert.deepEqual(presetCamera('missing'),presetCamera('limb'));
const wingNormal=unit([.62,-.69,.40]),wingAz=preferredWingBearing([{area:20,normal:wingNormal}]);
const eyeDirection=unit(mountPosition(presetCamera('limb',wingAz),[0,0,0],1,1));
assert(dot(eyeDirection,wingNormal)>.9,'default view presents the real illuminated panel faces');
assert.equal(preferredWingBearing([]),CAMERA_PRESETS.limb.azimuth);
assert.equal(preferredWingBearing([{normal:wingNormal,area:0}]),CAMERA_PRESETS.limb.azimuth);
for(const name of ['Solar_blue_display_only','WT01_solar_blue','SZ02_solar_blue'])assert(isSolarCellMaterial(name));
for(const name of ['Panel_frames','Solar_blue_display_only_back','TH_V16_Optical_Glass','UD01_blue_recessed_window'])assert(!isSolarCellMaterial(name));
for(const pitch of [-90,90]){
  const frame=cameraAtOpen({basis:identity},{...presetCamera(),azimuth:90,pitch});
  assert(frame.every(axis=>Math.abs(norm(axis)-1)<1e-10)&&Math.abs(dot(frame[0],frame[1]))<1e-10);
}
const at=s=>cameraAtOpen({basis:identity},s),near=(a,b)=>assert(norm(sub(a,b))<1e-8,`${a} differs from ${b}`);
for(const id of Object.keys(CAMERA_PRESETS)){
  const s=presetCamera(id),axes=at(s);
  assert.equal(s.roll,0);const legacy={...s};delete legacy.roll;assert.deepEqual(at(legacy),axes);
  const clockwise=moveExposureCamera(s,{roll:90}),rolled=at(clockwise);
  near(rolled[2],axes[2]);near(rolled[1],axes[0]);near(rolled[0],axes[1].map(x=>-x));
  near(mountPosition(clockwise,center,span,units),mountPosition(s,center,span,units));
  const unroll=moveExposureCamera(clockwise,{roll:-90});for(const [i,v] of at(unroll).entries())near(v,axes[i]);
  const up=at(moveExposureCamera(clockwise,{pitch:8}))[2],left=at(moveExposureCamera(clockwise,{yaw:8}))[2];
  assert(dot(up,rolled[1])>.13&&dot(left,rolled[0])<-.13,'turns follow the tilted viewfinder axes');
  const translated=moveExposureCamera(clockwise,{forward:5,lift:3}),offset=['x','y','z'].map(k=>translated[k]-s[k]);
  near(offset,rolled[2].map((x,i)=>5*x+3*rolled[1][i]));
  const back=moveExposureCamera(translated,{forward:-5,lift:-3});near(['x','y','z'].map(k=>back[k]),[0,0,0]);
  const extreme=moveExposureCamera(s,{forward:10000}),end=['x','y','z'].map(k=>extreme[k]);
  assert(Math.abs(Math.max(...end.map(Math.abs))-CAMERA_OFFSET_LIMIT)<1e-8);near(unit(end),axes[2]);
  const tracked=trackingAxes(q1,q0.basis,cameraAtOpen({basis:q0.basis},clockwise),'body');
  const expected=cameraAtOpen({basis:q1.basis},clockwise);for(const [i,v] of tracked.entries())near(v,expected[i]);
}
for(const pitch of [89.9,90,-89.9,-90]){
  const s={...presetCamera('wide'),pitch,roll:27},originalAxes=at(s);
  const changed=moveExposureCamera(s,{pitch:3}),returned=moveExposureCamera(changed,{pitch:-3});
  for(const [i,v] of at(returned).entries())near(v,originalAxes[i]);
}
console.log('Exposure: shutter, occultation, tracking, true lens roll, view-relative turns/translation, pole continuity, mount limits and solar materials passed.');
