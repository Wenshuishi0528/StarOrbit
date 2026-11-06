import assert from 'node:assert/strict';
import {mountScopeInput} from '../src/xuntian-input.js';

globalThis.window=new EventTarget();globalThis.document=new EventTarget();
const canvas=new EventTarget(),moves=[];
canvas.classList={add(){},remove(){}};canvas.clientHeight=160;canvas.focus=()=>{document.activeElement=canvas;};
canvas.blur=()=>{document.activeElement=null;canvas.dispatchEvent(new Event('blur'));};canvas.setPointerCapture=()=>{};
const input=mountScopeInput(canvas,{nudge:(x,y)=>moves.push([x,y]),zoom(){},field:()=>20});canvas.focus();
function key(type,code){const event=Object.assign(new Event(type,{cancelable:true}),{code});canvas.dispatchEvent(event);}
key('keydown','KeyD');key('keyup','KeyD');assert.equal(moves.length,1);assert(Math.abs(moves[0][0]-.9)<1e-9);
key('keydown','KeyW');input.step(.1);input.step(.1);key('keyup','KeyW');
assert.equal(moves.length,3);assert.deepEqual(moves.slice(1),[[0,-1.3],[0,-1.3]]);
key('keydown','KeyA');key('keydown','KeyD');input.step(.1);key('keyup','KeyD');key('keyup','KeyA');assert.equal(moves.length,3);
key('keydown','KeyW');canvas.blur();key('keyup','KeyW');input.step(.1);assert.equal(moves.length,3);
console.log('Xuntian controls: inter-frame tap, continuous hold, cancelling keys and lost focus passed.');
const area=new EventTarget(),rotations=[];
Object.assign(area,{classList:canvas.classList,clientHeight:100,focus(){document.activeElement=area;},blur(){document.activeElement=null;},setPointerCapture(){}});
const second=mountScopeInput(area,{nudge(){},zoom(){},field:()=>3,roll:r=>rotations.push(r)});area.focus();
const press=(type,code,repeat=false)=>area.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{code,repeat}));
press('keydown','KeyE');press('keyup','KeyE');press('keydown','KeyQ');second.step(.1);press('keyup','KeyQ');
assert.deepEqual(rotations,[5,-6]);assert.equal(press('keydown','KeyF'),true);assert.equal(press('keyup','KeyF'),true);
const lastPitch=value=>{assert.equal(moves.at(-1)[0],0);assert(Math.abs(moves.at(-1)[1]-value)<1e-9);};
canvas.focus();key('keydown','KeyS');key('keyup','KeyS');lastPitch(.9);
key('keydown','ArrowUp');key('keyup','ArrowUp');lastPitch(.9);
key('keydown','ArrowDown');key('keyup','ArrowDown');lastPitch(-.9);
console.log('KSP W/S pitch, Q/E roll, arrow browsing and unclaimed F key passed.');
