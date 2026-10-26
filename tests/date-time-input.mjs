import assert from 'node:assert/strict';
import {clockInput,clockValue,stepClock} from '../src/date-time-input.js';
for(let h=0;h<24;h++)for(const cycle of ['12','24']){
 const text=String(h).padStart(2,'0')+':34:56';assert.equal(clockValue(clockInput(text,cycle),cycle),text);
}
assert.equal(clockInput('00:00:00','12'),'12:00:00 AM');assert.equal(clockInput('12:00:00','12'),'12:00:00 PM');
assert.equal(clockValue('11:59 pm','12'),'23:59:00');
for(const [text,cycle] of [['24:00:00','24'],['00:00 AM','12'],['13:00 PM','12'],['12:60 PM','12'],['12:00:60','24'],['12:00','12'],['','24']])assert.equal(clockValue(text,cycle),null);
console.log('24h/12h round trips, midnight/noon and invalid time input passed');

assert.equal(stepClock('23:59:59','24',0,1),'00:59:59');
assert.equal(stepClock('00:00:00','24',0,-1),'23:00:00');
assert.equal(stepClock('09:59:59','24',1,1),'09:00:59');
assert.equal(stepClock('09:00:00','24',2,-1),'09:00:59');
assert.equal(stepClock('11:30:00 AM','12',0,1),'12:30:00 PM');
assert.equal(stepClock('12:30:00 AM','12',0,-1),'11:30:00 PM');
assert.equal(stepClock('12:30:00 PM','12',3,1),'12:30:00 AM');
assert.equal(stepClock('12:30:00 AM','12',3,-1),'12:30:00 PM');
assert.equal(stepClock('invalid','24',0,1),null);
console.log('Segment stepping, wraparound and AM/PM transitions passed');
