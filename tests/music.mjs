import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {musicSettings,reconcileMusic,adjacentTrack,randomTrack,moveTrack,musicTime} from '../src/music-library.js';
const builtins=JSON.parse(fs.readFileSync('assets/music/catalog.json')).map(x=>({...x,builtin:true}));
assert.equal(builtins.length,6);for(const track of builtins){assert.ok(track.duration>0);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(track.file)).digest('hex'),track.sha256);}
const a=builtins[0].id,b=builtins[1].id,c=builtins[2].id,user={id:'user-test',title:'Imported'};
assert.deepEqual(musicSettings(null),{volume:.25,muted:false,autoplay:true});assert.equal(musicSettings({volume:2}).volume,1);assert.equal(musicSettings({volume:NaN}).volume,.25);
let state=reconcileMusic({order:[b,'missing',a,b],removed:[c,c,'user-test']},[...builtins,user]);assert.deepEqual(state.order.slice(0,2),[b,a]);assert.ok(!state.order.includes(c)&&state.order.includes(user.id));assert.deepEqual(state.removed,[c]);
assert.deepEqual(reconcileMusic({order:[],removed:builtins.map(x=>x.id)},builtins).order,[]);
assert.equal(randomTrack([a,b,c],()=>0),a);assert.equal(randomTrack([a,b,c],()=>.99999),c);assert.equal(randomTrack([]),null);
assert.equal(adjacentTrack([a,b,c],c),a);assert.equal(adjacentTrack([a,b,c],a,-1),c);assert.equal(adjacentTrack([],a),null);
assert.deepEqual(moveTrack([a,b,c],c,a),[c,a,b]);assert.deepEqual(moveTrack([a,b,c],a,null),[b,c,a]);assert.deepEqual(moveTrack([a,b,c],b,b),[a,b,c]);assert.deepEqual(moveTrack([a,b,c],'missing',a),[a,b,c]);
assert.equal(musicTime(165.2),'2:45');assert.equal(musicTime(NaN),'0:00');
console.log('Six original music assets, saved preferences, removed builtins, imports, random opening, ordered loop, movement and time formatting passed');
