import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {createCameraFocus} from '../src/camera-focus-controller.js';
const camera=new PerspectiveCamera(),controls={target:new Vector3()},positions={mission:new Vector3(),xuntian:new Vector3(100,0,0)};
let enabled=true,shown=true,frames=[];
const target=id=>({id,objects:[{}],anchor:()=>positions[id]});
const focus=createCameraFocus({camera,controls,enabled:()=>enabled,targets:()=>[target('mission'),...(shown?[target('xuntian')]:[])],frame:item=>{frames.push(item.id);controls.target.copy(item.anchor());camera.position.copy(item.anchor()).add(new Vector3(0,-20,10));}});
focus.focus('mission');assert.deepEqual(controls.target.toArray(),[0,0,0]);
focus.focus('xuntian');assert.deepEqual(controls.target.toArray(),[100,0,0]);
// Pan/zoom are user's offsets, not overwritten by repeated auto-fit.
camera.position.add(new Vector3(1,2,3));controls.target.add(new Vector3(1,1,0));
const before=camera.position.clone(),offset=camera.position.clone().sub(controls.target);
positions.xuntian.add(new Vector3(4,5,6));focus.update();
assert(camera.position.equals(before.add(new Vector3(4,5,6))));assert(camera.position.clone().sub(controls.target).equals(offset));
assert.equal(frames.length,2);
positions.mission.x=50;focus.update();assert.equal(controls.target.x,105,'other craft motion does not move selected view');
enabled=false;const suspended=camera.position.clone();positions.xuntian.x+=10;focus.update();assert(camera.position.equals(suspended));
enabled=true;focus.update();assert(camera.position.equals(suspended.add(new Vector3(10,0,0))),'returning from overview follows the craft displacement while away');
shown=false;focus.update();assert.equal(focus.selected,'mission');assert.equal(controls.target.x,50);assert.equal(frames.length,3);
focus.focus('missing');assert.equal(focus.selected,'mission');
console.log('Camera focus: single targets, independent following, preserved pan/zoom, overview suspension and missing-target fallback passed.');

shown=true;focus.focus('xuntian');enabled=false;shown=false;focus.update();enabled=true;focus.update();assert.equal(controls.target.x,positions.mission.x,'target lost during overview must reframe on returning');
