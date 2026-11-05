import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import {detailCell,detailRect,detailNeeded,EarthDetail} from '../src/earth-detail.js';
const projection=1/Math.tan(38*Math.PI/360);
for(const height of [400,1999,2001,2384])assert(detailNeeded(6371+height,projection,900,8192),'retain detail at altitude '+height);
assert(!detailNeeded(28000,projection,900,8192),'release detail in distant overview');
assert(detailNeeded(28000,projection*8,900,8192),'zoomed overview needs detail');
assert(!detailNeeded(8755,projection,180,8192),'small viewport needs only base map');
assert(detailNeeded(8755,projection,360,8192),'higher pixel density needs detail');
assert.equal(detailCell(-180,90).key,'0-0');assert.equal(detailCell(180,-90).key,'0-5');assert.equal(detailCell(540,0).key,detailCell(-180,0).key);
for(let lon=-179.9;lon<180;lon+=5.7)for(let lat=-89.9;lat<90;lat+=7.3){
 const cell=detailCell(lon,lat),r=detailRect(cell),u=(lon+180)/360,v=(lat+90)/180;
 assert.ok(u>=r[0]-1e-12&&u<=r[0]+r[2]+1e-12);assert.ok(v>=r[1]-1e-12&&v<=r[1]+r[3]+1e-12);
}
const metadata=JSON.parse(fs.readFileSync('assets/earth/detail/manifest.json'));
assert.equal(Object.keys(metadata.files).length,72);
for(const [name,hash] of Object.entries(metadata.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync('assets/earth/detail/'+name)).digest('hex'),hash);
// All four slot resources and uniforms must release in simple or distant views.
let disposed=0,closed=0;const env={uniforms:{},fallback:{},quality:'simple'};const detail=new EarthDetail(env);
for(let i=0;i<4;i++)detail.slots[i]={key:String(i),texture:{dispose(){disposed++},image:{close(){closed++}}}};
detail.update({position:new THREE.Vector3(7000,0,0)});assert.equal(disposed,4);assert.equal(closed,4);assert.equal(detail.slots.filter(x=>x.texture).length,0);
for(let i=0;i<4;i++){assert.equal(env.uniforms['detailMap'+i].value,env.fallback);assert.equal(env.uniforms['detailFade'+i].value,0);}
console.log({earthDetail:'pass',tiles:72,longitudeWrap:'pass',polarRegistration:'pass',resourceRelease:'pass'});
// Night detail doubles the native grid while preserving date-line and latitude registration.
assert.equal(detailCell(180,-90,24,12).key,'0-11');
for(const lon of [-179.9,-90,0,116.4,179.9])for(const lat of [-89.9,-30,0,39.9,89.9]){
 const r=detailRect(detailCell(lon,lat,24,12),24,12),u=(lon+180)/360,v=(lat+90)/180;
 assert.ok(u>=r[0]-1e-12&&u<=r[0]+r[2]+1e-12&&v>=r[1]-1e-12&&v<=r[1]+r[3]+1e-12);
}
const night=JSON.parse(fs.readFileSync('assets/earth/night-detail/manifest.json'));
assert.equal(Object.keys(night.files).length,288);assert.equal(night.width,43200);
for(const [name,hash] of Object.entries(night.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync('assets/earth/night-detail/'+name)).digest('hex'),hash);
console.log({nightDetail:'pass',nativeSourceWidth:86400,displayWidth:43200,tiles:288});

const modern=JSON.parse(fs.readFileSync('assets/earth/night-2024-1km/manifest.json'));
assert.equal(modern.year,2024);assert.equal(modern.width,43200);assert.equal(modern.height,21600);
assert.equal(Object.keys(modern.files).filter(f=>/^\d+-\d+\.jpg$/.test(f)).length,288);
for(const [name,hash] of Object.entries(modern.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync('assets/earth/night-2024-1km/'+name)).digest('hex'),hash);
assert(modern.totalBytes<50e6,'keep the 1 km atlas below 50 MB');

// Changing year during an image decode must discard the old bitmap. A stale
// request failure must not blacklist the same tile in the newly selected year.
const oldFetch=globalThis.fetch,oldBitmap=globalThis.createImageBitmap;
try{
 let resolve,uploads=0,bitmapClosed=0;
 const env={assets:{},uniforms:{},fallback:{},quality:'standard',api:{renderer:{capabilities:{getMaxAnisotropy:()=>4},initTexture:()=>uploads++}}};
 const d=new EarthDetail(env,true),cell={key:'19-3',x:19,y:3};
 d.setSource({'19-3':'old'},24,12);d.wanted=[cell];
 globalThis.fetch=()=>new Promise(r=>resolve=r);
 globalThis.createImageBitmap=async()=>({close(){bitmapClosed++}});
 const pending=d.loadNext();
 d.setSource({'19-3':'new'},24,12);d.wanted=[cell];
 resolve({ok:true,blob:async()=>({})});await pending;
 assert.equal(uploads,0);assert.equal(bitmapClosed,1);assert(d.slots.every(s=>!s.texture));
 let reject;globalThis.fetch=()=>new Promise((_,r)=>reject=r);
 const failing=d.loadNext();d.setSource({'19-3':'newer'},24,12);reject(Error('old request failed'));await failing;
 assert.equal(d.failed.size,0);assert.equal(d.pending,false);assert.equal(env.detailDecodeBusy,false);
 d.wanted=[cell];globalThis.fetch=async url=>{assert.equal(url,'newer');return {ok:true,blob:async()=>({})}};
 await d.loadNext();assert.equal(uploads,1);assert(d.slots.some(s=>s.key==='19-3'));
 d.clear();assert.equal(bitmapClosed,2);
}finally{globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldBitmap;}
console.log({night2024:'pass',switchDuringDecode:'pass',staleFailureIsolation:'pass',standardQualityDetail:'pass'});
