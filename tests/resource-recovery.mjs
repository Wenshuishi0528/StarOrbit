import assert from 'node:assert/strict';
import {ResourceRecovery,recoverableDownload} from '../src/resource-recovery.js';
let clock=1000,online=true,seq=0;const timers=new Map(),states=new Map(),runs=[];
const recovery=new ResourceRecovery({now:()=>clock,online:()=>online,setTimer:(fn,delay)=>{const id=++seq;timers.set(id,{fn,at:clock+delay});return id;},clearTimer:id=>timers.delete(id),onState:(key,state)=>states.set(key,state),run:(key,attempt)=>runs.push({key,attempt})});
async function advance(ms){clock+=ms;for(const [id,job]of [...timers])if(job.at<=clock){timers.delete(id);job.fn();}await Promise.resolve();await Promise.resolve();}
recovery.queue('orbit:tiangong');recovery.queue('orbit:tiangong');assert.equal(timers.size,1);
await advance(29999);assert.equal(runs.length,0);await advance(1);assert.deepEqual(runs,[{key:'orbit:tiangong',attempt:1}]);assert.equal(recovery.pending.size,0);
recovery.queue('orbit:tiangong',2);await advance(119999);assert.equal(runs.length,1);await advance(1);assert.equal(runs.at(-1).attempt,2);
recovery.queue('cloud:satcorps',3);assert.equal(states.get('cloud:satcorps').retryAt,clock+600000);
online=false;await advance(600000);assert.equal(runs.length,2);assert.equal(timers.size,0);assert.equal(states.get('cloud:satcorps').recovery,'offline');
online=true;recovery.reconnect();await advance(1000);assert.equal(runs.at(-1).key,'cloud:satcorps');
recovery.queue('cloud:satcorps',4);assert.equal(timers.size,0);assert.equal(states.get('cloud:satcorps').recovery,'paused');
recovery.reconnect();await advance(1000);assert.equal(runs.at(-1).attempt,1,'a real network reconnection rearms an exhausted recovery');
recovery.queue('orbit:tiangong');const stale=[...timers.values()][0].fn;recovery.cancel('orbit:tiangong');stale();await Promise.resolve();assert.equal(runs.length,4,'cancelled timers cannot restart deleted or manually checked resources');
recovery.queue('a');recovery.queue('b');recovery.dispose();assert.equal(timers.size,0);
for(const error of [new TypeError('Failed to fetch'),Object.assign(Error('timeout'),{name:'AbortError'}),Error('HTTP 503'),{retryable:true}])assert(recoverableDownload(error));
for(const error of [Error('HTTP 404'),Error('invalid data'),{retryable:false,name:'TypeError'}])assert(!recoverableDownload(error));
console.log('Resource recovery: bounded backoff, deduplication, offline/reconnect, manual cancellation and retry classification passed');

// WebKit requires Window timer methods to keep their global receiver. Storing
// the bare method on ResourceRecovery used to throw before scheduling a retry.
const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
let boundTimerCalls=0;
try{
 globalThis.setTimeout=function(){assert(this==null||this===globalThis,'timer is not called with the recovery object as receiver');boundTimerCalls++;return 5;};
 globalThis.clearTimeout=function(){assert(this==null||this===globalThis,'clear timer keeps the Window receiver');};
 const webkit=new ResourceRecovery({run:()=>{},online:()=>true});webkit.queue('orbit:tiangong');webkit.dispose();assert.equal(boundTimerCalls,1);
}finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
console.log('Native Window timer bindings remain safe in WebKit');
