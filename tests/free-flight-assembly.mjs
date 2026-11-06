import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Box3, Matrix4, Quaternion, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {describeAssembly, placementMatrices} from '../src/assembly.js';
import {createFreeFlightAssembly} from '../src/free-flight-assembly.js';
import {FREE_FLIGHT_LIMITS} from '../src/free-flight-physics.js';
import {VIEW_UNITS_PER_METRE} from '../src/missions.js';

const meta = JSON.parse(fs.readFileSync('assets/model.json'));
const bytes = fs.readFileSync('assets/station.glb');
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const templates = Object.fromEntries(Object.keys(meta.modules).map(t => [t,gltf.scene.getObjectByName('module_' + t)]));
const slots = {TH_WENTIAN:'WT',TH_MENGTIAN:'MT',TH_FORWARD:'SZ',TH_AFT:'TZ'};
const angles = {TH_WENTIAN:{roll:10,left:18,right:-20}};
const scene = createFreeFlightAssembly(templates,meta,{slots,angles});
const metre = 1 / VIEW_UNITS_PER_METRE;
const initial = placementMatrices(meta,describeAssembly(slots));
for (const definition of scene.definitions) {
  const mounted = scene.root.getObjectByName('flight:' + definition.portId);
  // At capture the master model's original placement is restored to a fraction
  // of a millimetre. A launched ship appears exactly once, not as a parked copy.
  const expected = new Matrix4().makeScale(metre,metre,metre).multiply(initial.get(definition.portId));
  assert(mounted.matrixWorld.elements.every((v,i) => Math.abs(v - expected.elements[i]) < 1e-6));
  let count = 0;scene.root.traverse(o => {if(o.name === mounted.name)count++;});assert.equal(count,1);
  const {id,type,portId,position,quaternion,port} = definition;
  const persisted = {id,type,portId,position,quaternion,port}; // model routing lives outside flight save
  const out = new Vector3(1,0,0).applyQuaternion(new Quaternion(...quaternion));
  const at = metresOut => ({...persisted,position:new Vector3(...position).addScaledVector(out,metresOut).toArray()});
  let old = at(0);
  for (const distance of [0,.02,.1,.4,.9,1.4,3,30,3,1.4,.9,.4,.1,.02,0]) {
    const next = at(distance);
    assert.equal(scene.collides(old,next,persisted,scene.definitions),false,`${type}: valid axial passage blocked at ${distance} m`);
    old = next;
  }
}
const sz = scene.definitions.find(s => s.type === 'SZ');
const tz = scene.definitions.find(s => s.type === 'TZ');
const state = position => ({...sz,position});
assert(scene.collides(state([22,-18,20]),state([22,-18,-20]),sz), 'swept passage crosses real Wentian solar wings');
const relaxed={...FREE_FLIGHT_LIMITS,captureLateral:1,captureAngle:15};
assert(scene.collides(state([22,-18,20]),state([22,-18,-20]),sz,scene.definitions,relaxed), 'relaxed capture settings never exempt solar-wing collisions');
assert(!scene.collides(state([63,-8,5]),state([63,-8,-5]),sz), 'empty space remains flyable');
const away = [77,43,18], otherFree = {...tz,position:away};
assert(scene.collides(state(away),state(away),sz,[sz,otherFree]), 'a detached ship remains a collision obstacle');
assert(scene.collides(state(away),state(away),sz,[sz,otherFree],relaxed), 'relaxed capture settings never exempt another vessel');
assert(!scene.collides(state(away),state(away),sz,[sz,tz]), 'new position is clear when the other ship is back home');
const panel = scene.root.getObjectByName('pitch_WT_L');
assert(Math.abs(panel.rotation.y - 18 * Math.PI / 180) < 1e-9,'preserved saved wing articulation');
assert(new Box3().setFromObject(scene.root).getSize(new Vector3()).x > 45);
const nested = createFreeFlightAssembly(templates,meta,{slots:{TH_FORWARD:'TZ',TH_LOWER:'TH','TH_LOWER/TH_FORWARD':'TZ'}});
assert.deepEqual(nested.definitions.map(s=>s.id),['ship:TH_FORWARD','ship:TH_LOWER/TH_FORWARD']);
console.log('Free flight real GLB: both vessel types clear their own collar and remate exactly; other wings/ships collide; nested identities and articulated panels match.');
