import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Quaternion,Vector3} from 'three';

// Bundle the browser's JSON dictionaries for Node; pure geometry does not mount
// a DOM, make a canvas, or require a renderer.
const bundle=await build({entryPoints:['src/free-flight-instruments.js'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {deriveFreeFlightInstruments,projectFlightDirection,projectDockingTarget}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const near=(a,b,epsilon=1e-8)=>assert(Math.abs(a-b)<epsilon,`${a} ≠ ${b}`);
const arrayNear=(a,b)=>a.forEach((v,i)=>near(v,b[i]));
const home={id:'ship:home',position:[4,0,0],port:[0,0,0],quaternion:[0,0,0,1]};
const ship={position:[14,2,-3],velocity:[-.2,.03,.04],quaternion:[0,0,0,1],angularVelocity:[.01,.02,.03],deltaV:0};
const original=JSON.stringify({home,ship});
const nav=deriveFreeFlightInstruments(ship,home);
arrayNear(nav.forward,[-1,0,0]);arrayNear(nav.up,[0,0,1]);arrayNear(nav.target,[-10,-2,3]);
arrayNear(nav.targetBody,[10,-2,3]);arrayNear(nav.velocityBody,[.2,.03,.04]);
near(nav.heading,180);near(nav.pitch,0);near(nav.roll,0);near(nav.speed,Math.hypot(.2,.03,.04));
assert.equal(JSON.stringify({home,ship}),original,'instrument derivation must not mutate the flight state');

const bank=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/6).toArray();
const banked=deriveFreeFlightInstruments({...ship,quaternion:bank},home);
near(banked.roll,30);near(banked.pitch,0);near(banked.heading,180);
const vertical=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2).toArray();
const overhead=deriveFreeFlightInstruments({...ship,quaternion:vertical},home);
near(overhead.pitch,90);assert.equal(overhead.heading,null);assert.equal(overhead.roll,null);

// Both port orientations and arbitrary global-frame rotations preserve what
// the pilot sees; the camera arm must rotate about the ship centre as well.
const sceneRotation=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI);
const turn=a=>new Vector3(...a).applyQuaternion(sceneRotation).toArray();
const turned=deriveFreeFlightInstruments({...ship,position:turn(ship.position),velocity:turn(ship.velocity),quaternion:sceneRotation.toArray()},
 {...home,position:turn(home.position),port:turn(home.port),quaternion:sceneRotation.toArray()});
arrayNear(turned.targetBody,nav.targetBody);arrayNear(turned.velocityBody,nav.velocityBody);
const inverseSign=deriveFreeFlightInstruments({...ship,quaternion:ship.quaternion.map(v=>-v)},home);
arrayNear(inverseSign.targetBody,nav.targetBody);

assert.equal(projectFlightDirection([0,0,0],ship.quaternion),null);
const front=projectFlightDirection([-1,0,0],ship.quaternion);
assert.equal(front.front,true);near(front.x,0);near(front.y,0);
const behind=projectFlightDirection([1,0,0],ship.quaternion);
assert.equal(behind.front,false);assert(Math.hypot(behind.x,behind.y)>.8,'a rear target must not look centred ahead');
const right=projectFlightDirection([-1,1,0],ship.quaternion);assert(right.front&&right.x>0);
const high=projectFlightDirection([-1,0,1],ship.quaternion);assert(high.front&&high.y<0,'canvas up is negative Y');
const turnedFront=projectFlightDirection(turn([-1,0,0]),sceneRotation.toArray());assert(turnedFront.front);near(turnedFront.x,0);

const sight=projectDockingTarget([10,1,2],{fov:90,aspect:2});
near(sight.x,.05);near(sight.y,.2);assert(sight.visible&&!sight.behind);
assert(projectDockingTarget([-10,0,0]).behind);assert(!projectDockingTarget([-10,0,0]).visible);
assert(!projectDockingTarget([1,10,0]).visible);
console.log('Free-flight navigation: orbital axes, pilot signs, rotated ports, rear markers and camera projection passed.');
