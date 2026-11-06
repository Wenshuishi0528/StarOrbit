import assert from 'node:assert/strict';
import {createFlightInputBuffer} from '../src/main-flight-input.js';

const input=createFlightInputBuffer(),neutral={rotation:[0,0,0],translation:[0,0,0],brake:false,temporarySas:false};
input.set({rotation:[0,1,0]});input.set({});
assert.deepEqual(input.take().rotation,[0,1,0],'a press and release inside one 40 ms step is not lost');
assert.deepEqual(input.take(),neutral,'a released short press fires only once');
input.set({translation:[1,0,0],rotation:[0,0,-1]});
for(let i=0;i<3;i++){
 const command=input.take();assert.deepEqual(command.translation,[1,0,0]);assert.deepEqual(command.rotation,[0,0,-1]);
}
input.set({});assert.deepEqual(input.take(),neutral,'releasing a consumed held command stops thrust immediately');
input.set({temporarySas:true,brake:true});input.set({});
assert.deepEqual(input.take(),{...neutral,temporarySas:true,brake:true});
assert.deepEqual(input.take(),neutral,'temporary aids do not become latched toggles');
input.set({translation:[0,1,0],rotation:[1,0,0],temporarySas:true});input.set({});input.clear();
assert.deepEqual(input.take(),neutral,'blur, pause and craft changes discard queued impulses');
const source={translation:[0,0,1]};input.set(source);source.translation[2]=99;
const command=input.take();assert.deepEqual(command.translation,[0,0,1]);command.translation[2]=45;
assert.deepEqual(input.take().translation,[0,0,1],'commands cannot mutate a later held input');
console.log('Flight input: short taps, held thrust, one-shot release, temporary SAS, cancellation and isolation passed.');
