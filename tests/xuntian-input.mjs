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

const ground = new EventTarget(), zooms = [], groundMoves = [];
Object.assign(ground, {
  classList: canvas.classList, clientHeight: 500,
  focus() { document.activeElement = ground; }, setPointerCapture() {},
});
const controls = mountScopeInput(ground, {
  nudge: (...args) => groundMoves.push(args), field: () => 30, cameraField: () => 60,
  zoom: (delta) => zooms.push(delta), logZoom: true,
});
const event = (kind, props) => ground.dispatchEvent(Object.assign(new Event(kind, {cancelable:true}), props));
event('wheel', {deltaY: 4, deltaMode: 0});
event('wheel', {deltaY: 40, deltaMode: 0});
assert.equal(zooms[1], 10 * zooms[0]);
event('wheel', {deltaY: -48, deltaMode: 0});
event('wheel', {deltaY: -3, deltaMode: 1});
assert.equal(zooms.at(-1), zooms.at(-2));
event('wheel', {deltaY: -500, deltaMode: 0});
event('wheel', {deltaY: -1, deltaMode: 2});
assert.equal(zooms.at(-1), zooms.at(-2));
const pointer = (kind, id, x) => event(kind, {button: 0, pointerId: id, clientX: x, clientY: 0});
pointer('pointerdown', 1, 0);
pointer('pointerdown', 2, 120);
pointer('pointermove', 2, 150);
assert.ok(Math.abs(zooms.at(-1) - Math.log(1.25)) < 1e-10);
assert.deepEqual(groundMoves, []);
event('gesturestart', {scale: 1});
const count = zooms.length;
event('gesturechange', {scale: 1.25});
event('wheel', {deltaY: -2, ctrlKey: true});
assert.equal(zooms.length, count);
event('gestureend', {});
pointer('pointerup', 1, 0);
pointer('pointerup', 2, 150);
pointer('pointerdown', 3, 100);
event('pointermove', {pointerId:3, clientX:50, clientY:25});
pointer('pointerup', 3, 50);
const tangent = 2 * Math.tan(Math.PI / 6) / 500;
const rightAngle = Math.atan(50 * tangent);
assert.ok(Math.abs(groundMoves[0][0] - rightAngle * 180 / Math.PI) < 1e-10);
assert.ok(Math.abs(groundMoves[0][1] - Math.atan(25 * tangent * Math.cos(rightAngle)) * 180 / Math.PI) < 1e-10);
event('gesturestart', {scale: 1});
event('gesturechange', {scale: 1.2});
event('gesturechange', {scale: 1.5});
assert.ok(Math.abs(zooms.slice(-2).reduce((a,b)=>a+b) - Math.log(1.5)) < 1e-10);
event('gestureend', {});
controls.dispose();
const disposedCount = zooms.length;
event('wheel', {deltaY: 5, deltaMode: 0});
assert.equal(zooms.length, disposedCount);
console.log('Ground optical input: proportional wheel units, two-finger separation, WebKit pinch and teardown passed.');
