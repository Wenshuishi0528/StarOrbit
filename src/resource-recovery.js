// Recover only previously requested updates. There is no periodic downloader.
const DELAYS=[30000,120000,600000];
export function recoverableDownload(error){
 if(typeof error?.retryable==='boolean')return error.retryable;
 return ['AbortError','TimeoutError','TypeError'].includes(error?.name)||/^HTTP (408|429|500|502|503|504)$/.test(error?.message||'')||/^(Failed to fetch|Load failed|NetworkError)/i.test(error?.message||'');
}
export class ResourceRecovery{
 constructor({run,onState=()=>{},now=Date.now,online=()=>globalThis.navigator?.onLine!==false,setTimer=(fn,delay)=>setTimeout(fn,delay),clearTimer=id=>clearTimeout(id)}){
  Object.assign(this,{run,onState,now,online,setTimer,clearTimer});this.pending=new Map();
 }
 queue(key,attempt=1,due){
  attempt=Math.max(1,Math.min(DELAYS.length+1,Math.floor(Number(attempt)||1)));if(!Number.isFinite(due))due=undefined;
  this.cancel(key,false);const job={attempt,timer:null,due:null};this.pending.set(key,job);
  const recovery=!this.online()?'offline':attempt>DELAYS.length?'paused':'waiting';
  if(recovery==='waiting'){
   job.due=Math.max(this.now(),due??this.now()+DELAYS[attempt-1]);
   job.timer=this.setTimer(()=>{
    if(this.pending.get(key)!==job)return;
    if(!this.online()){this.queue(key,attempt);return;}
    this.pending.delete(key);this.onState(key,{recovery:'running',retryAt:null,retryAttempt:attempt});
    Promise.resolve().then(()=>this.run(key,attempt)).catch(()=>{});
   },job.due-this.now());
  }
  this.onState(key,{recovery,retryAt:job.due,retryAttempt:attempt});
 }
 cancel(key,notify=true){const job=this.pending.get(key);if(job?.timer!=null)this.clearTimer(job.timer);this.pending.delete(key);if(notify)this.onState(key,{recovery:null,retryAt:null,retryAttempt:0});}
 reconnect(){if(this.online())for(const [key,job]of [...this.pending])this.queue(key,job.attempt>DELAYS.length?1:job.attempt,this.now()+1000);}
 dispose(){for(const key of [...this.pending.keys()])this.cancel(key,false);}
}
