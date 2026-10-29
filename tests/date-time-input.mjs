import assert from 'node:assert/strict';
import {clockInput,clockValue,stepClock,dateTimeText,dateTimeValue,stepDateTime,DateTimeInput} from '../src/date-time-input.js';
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

const sample=Date.parse('1970-04-25T20:29:00+08:00');
for(const cycle of ['12','24'])assert.equal(dateTimeValue(dateTimeText(sample,cycle),cycle),sample);
for(const bad of ['2026-02-29 20:29:00','2026-04-31 20:29:00','2026-13-01 20:29:00'])assert(Number.isNaN(dateTimeValue(bad,'24')));
assert.equal(stepDateTime('2024-02-29 20:29:00','24',0,1),'2025-02-28 20:29:00');
assert.equal(stepDateTime('2026-01-31 20:29:00','24',1,1),'2026-02-28 20:29:00');
assert.equal(stepDateTime('2026-12-31 20:29:00','24',2,1),'2027-01-01 20:29:00');
// Exercise the actual keyboard handler across the old date/time boundary.
const field={value:'',selectionStart:0,selectionEnd:0,setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}},cycle={value:'24'},sim={inputDirty:false,api:{toast(){throw Error('unexpected invalid input');}}};
globalThis.document={activeElement:field,getElementById:id=>id==='customTime'?field:cycle};
globalThis.localStorage={getItem:()=>null,setItem(){}};
const input=new DateTimeInput(sim),selected=()=>field.value.slice(field.selectionStart,field.selectionEnd),key=value=>field.onkeydown({key:value,preventDefault(){}});
input.set(sample);input.selectPart(0);
for(const expected of ['1970','04','25','20','29','00']){assert.equal(selected(),expected);key('ArrowRight');}
for(const expected of ['00','29','20','25','04','1970']){assert.equal(selected(),expected);key('ArrowLeft');}
input.selectPart(2);key('ArrowRight');assert.equal(selected(),'20');key('ArrowLeft');assert.equal(selected(),'25');
key('ArrowUp');assert.equal(field.value,'1970-04-26 20:29:00');assert.equal(selected(),'26');assert(sim.inputDirty);
assert(input.focused);cycle.value='12';cycle.onchange();assert.equal(field.value,'1970-04-26 08:29:00 PM');
assert.equal(input.read(),Date.parse('1970-04-26T20:29:00+08:00'));
input.selectPart(6);key('ArrowDown');assert.equal(field.value,'1970-04-26 08:29:00 AM');
delete globalThis.document;delete globalThis.localStorage;
console.log('Unified year/month/day/hour/minute/second navigation, date boundaries, strict dates and 12h preservation passed');
