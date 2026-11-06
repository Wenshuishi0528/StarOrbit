import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Pure placement helpers can run without constructing a browser or the app.
const source=fs.readFileSync('src/floating-windows.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
const context=vm.createContext({});
vm.runInContext(source+';globalThis.helpers={clampFloatingPosition,normalizeFloatingPosition,restoreFloatingPosition,sanitizeFloatingLayout};',context);
const {clampFloatingPosition:bound,normalizeFloatingPosition:normalize,restoreFloatingPosition:restore,sanitizeFloatingLayout:sanitize}=context.helpers;
const plain=value=>JSON.parse(JSON.stringify(value));
const desktop={width:1440,height:900},panel={width:306,height:460,left:900,top:300};
const position=normalize(panel,desktop);
assert.deepEqual(plain(restore(position,panel,desktop)),{left:900,top:300},'save/resume keeps exact location at the same size');
const portrait={width:390,height:780},small={width:306,height:400};
const relocated=restore(position,small,portrait);
assert(relocated.left>=8&&relocated.left+small.width<=portrait.width-8);
assert(relocated.top>=8&&relocated.top+small.height<=portrait.height-8,'portrait relocation stays fully on screen');
assert.deepEqual(plain(bound({left:-600,top:2000,width:306,height:460},desktop)),{left:8,top:432},'drag beyond both edges clamps');
assert.deepEqual(plain(bound({left:100,top:-200,width:600,height:900},portrait)),{left:0,top:0},'oversize content keeps its header reachable');
assert.deepEqual(plain(restore({x:1,y:1},{width:44,height:44},desktop)),{left:1388,top:848});
assert.deepEqual(plain(restore({x:1,y:1},{width:340,height:340},desktop)),{left:1092,top:552},'expanding an edge-anchored music window remains visible');
assert.deepEqual(plain(normalize({left:50,top:50,width:400,height:800},portrait)),{x:0,y:0},'no room to move does not divide by zero');
const clean=sanitize({version:1,windows:{telemetry:{x:.2,y:.6},musicWidget:{x:1,y:1},xuntianScope:{x:NaN,y:.1},orbitMinimap:{x:3,y:0},unknown:{x:.5,y:.5}}});
assert.deepEqual(plain(clean),{version:1,windows:{telemetry:{x:.2,y:.6},musicWidget:{x:1,y:1}}},'corrupt and unrecognized placement records are ignored');
for(const input of [null,{},[],{version:2,windows:{telemetry:{x:.2,y:.6}}}])assert.deepEqual(plain(sanitize(input)),{version:1,windows:{}});
console.log('Floating windows: exact persistence, viewport clamping, portrait resize, expanding windows and malformed layout checks pass.');
