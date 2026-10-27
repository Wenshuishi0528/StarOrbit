import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {reconcileMusic,adjacentTrack,randomTrack} from '../src/music-library.js';
const BROADCAST='mission-dfh1-broadcast',builtin=[{id:'a',title:'A',url:'a.m4a'},{id:'b',title:'B',url:'b.m4a'},{id:BROADCAST,title:'DFH',mission:'dfh1',url:'dfh.m4a'}];
const elements=new Map(),timers=new Map();let nextTimer=0;
const sandbox={console,Blob,reconcileMusic,adjacentTrack,randomTrack:order=>randomTrack(order,()=>0),
 document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);}},
 URL:{revokeObjectURL(){}},t:key=>key,
 setTimeout:(callback,ms)=>{const id=++nextTimer;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id)};
const source=process.env.MUSIC_PLAYER_BASELINE?execFileSync('git',['show',process.env.MUSIC_PLAYER_BASELINE+':src/music-player.js'],{encoding:'utf8'}):fs.readFileSync(new URL('../src/music-player.js',import.meta.url),'utf8');
vm.runInNewContext(source.replace(/^import .*;\n/gm,'').replace('export class MusicPlayer','class MusicPlayer')+'\nglobalThis.TestMusicPlayer=MusicPlayer;',sandbox);
class FakeAudio{
 constructor(){this.listeners=new Map();this.currentTime=0;this.paused=true;this.ended=false;this.readyState=4;this.plays=[];this.src='';this.currentSrc='';}
 addEventListener(type,callback){const list=this.listeners.get(type)||[];list.push(callback);this.listeners.set(type,list);}
 emit(type){for(const fn of this.listeners.get(type)||[])fn();}
 pause(){this.paused=true;}
 removeAttribute(){this.src='';}
 load(){this.currentSrc=this.src;this.currentTime=0;this.ended=false;this.error=null;}
 play(){this.currentSrc=this.src;this.paused=false;this.ended=false;this.plays.push(this.src);return this.pending??Promise.resolve();}
}
function player(autoplay=true){
 elements.set('musicData',{textContent:JSON.stringify(builtin)});
 const p=Object.create(sandbox.TestMusicPlayer.prototype);
 Object.assign(p,{audio:new FakeAudio(),store:{read:async()=>[]},tracks:new Map(),current:null,state:{id:'library',order:[],removed:[]},loaded:false,failed:new Set(),wantPlayback:false,playToken:0,settings:{autoplay,volume:.25,muted:false},broadcastMode:'recording',
 telemetry:{engine:{stop(){},setVolume(){},async start(){return true;}},reset(){},render(){}},render(){},renderPlayback(){},renderList(){},progress(){},panel(){},message(){}});
 p.bindAudio?.(p.audio);return p;
}
const cases=[];
{
 const p=player();await p.restore();assert.equal(p.audio.plays.length,0,'Do not play a random song before the active mission is known');
 await p.play();assert.equal(p.audio.plays.length,0);p.setMission('dfh1');assert.deepEqual(p.audio.plays,['dfh.m4a']);assert.equal(p.current,BROADCAST);cases.push('late mission initialization starts only the exclusive recording');
}
{
 const p=player();let resolve;p.store.read=()=>new Promise(r=>{resolve=r;});const ready=p.restore();p.setMission('dfh1');resolve([]);await ready;
 assert.deepEqual(p.audio.plays,['dfh.m4a']);assert.equal(p.libraryPlayback.id,'a');cases.push('slow library restoration respects the pending mission');
}
{
 const p=player();await p.restore();p.setMission('tiangong');assert.deepEqual(p.audio.plays,['a.m4a']);p.audio.currentTime=37;p.setMission('dfh1');
 const sameElement=p.audio;p.select('b',true);assert.equal(p.current,BROADCAST);
 p.audio.ended=false;p.audio.emit('ended');assert(!p.loopTimer,'late ended event must not schedule a loop');
 p.audio.ended=true;p.audio.currentSrc='a.m4a';p.audio.emit('ended');assert(!p.loopTimer,'event for replaced resource is ignored');
 p.audio.currentSrc=p.audio.src;p.audio.emit('ended');const timer=p.loopTimer;assert.equal(timers.get(timer).ms,5000);const restart=timers.get(timer).callback;
 const before=p.audio.plays.length;restart();assert.equal(p.audio.plays.length,before+1);assert.equal(p.audio.plays.at(-1),'dfh.m4a');assert.equal(p.audio.currentTime,0);
 p.audio.ended=true;p.audio.emit('ended');const stale=timers.get(p.loopTimer).callback;p.setMission('tiangong');assert.equal(p.current,'a');assert.equal(p.audio.currentTime,37);assert.equal(p.audio.paused,false);assert.equal(p.audio,sameElement,'preserve Safari media authorization');
 const plays=p.audio.plays.length;stale();assert.equal(p.audio.plays.length,plays);assert.equal(p.current,'a');
 p.audio.ended=true;p.audio.currentSrc=p.audio.src;p.audio.emit('ended');assert.equal(p.current,'b');p.audio.ended=true;p.audio.emit('ended');assert.equal(p.current,'a');
 cases.push('exclusive gap, stale events, cancelled timers, library resume and ordered looping');
}
{
 const p=player(false);await p.restore();p.setMission('dfh1');assert.equal(p.audio.plays.length,0);await p.play();p.audio.ended=true;p.audio.emit('ended');const callback=timers.get(p.loopTimer).callback;
 p.pause();callback();assert.equal(p.audio.plays.length,1);assert.equal(p.wantPlayback,false);cases.push('autoplay off and pause cancel the exclusive repeat');
}
{
 const p=player();await p.restore();let reject;p.audio.pending=new Promise((_,r)=>{reject=r;});p.setMission('tiangong');p.audio.pending=null;p.setMission('dfh1');reject(Error('old decoder failed'));await Promise.resolve();await Promise.resolve();
 assert.equal(p.current,BROADCAST);assert.equal(p.wantPlayback,true);assert.equal(p.failed.size,0);cases.push('late play rejection cannot fall back to the background playlist');
}
console.log('Music playback isolation passed:',cases);
