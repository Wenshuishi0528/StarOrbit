import {createTelemetryState,renderTelemetry} from './dfh1-telemetry-core.js';

export function telemetryGate(sim,hidden=false){
 if(hidden)return '后台已暂停';
 if(sim?.missionId!=='dfh1'||sim.missions?.busy||sim.sceneBusy)return '等待东方红一号';
 if(!sim.current)return '等待轨道数据';
 if(sim.paused||sim.minimap?.dragging||sim.timeline?.dragging)return '模拟已暂停';
 if(sim.mode!=='real'&&sim.speed!==1)return '实时遥测需要 1×';
 return '';
}

export class TelemetryAudio{
 constructor(onReadings=()=>{}){
  this.onReadings=onReadings;this.channel='sequence';this.generation=0;this.want=false;this.active=false;this.volume=.25;this.muted=false;this.sources=new Set();
 }
 async prepare(){
  if(this.preparing)return this.preparing;
  this.preparing=(async()=>{
   const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!Context)throw Error('浏览器不支持实时音频');
   this.context=new Context({latencyHint:'interactive'});this.gain=this.context.createGain();this.gain.gain.value=this.muted?0:this.volume;this.gain.connect(this.context.destination);
   if(this.context.audioWorklet){
    const url=URL.createObjectURL(new Blob([__TELEMETRY_WORKLET_SOURCE__],{type:'text/javascript'}));
    try{
     await this.context.audioWorklet.addModule(url);
     this.node=new AudioWorkletNode(this.context,'dfh1-telemetry',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});
     this.node.port.onmessage=({data})=>{
      if(data.generation!==this.generation)return;
      if(data.error){this.fail(data.error);return;}
      this.audible=this.active&&data.active;this.onReadings(data.readings,data);
     };
     this.node.onprocessorerror=()=>{
      this.node.disconnect();this.node.port.onmessage=null;this.node=null;this.backend='buffer';this.fail('音频处理器已停止');
     };
     this.node.connect(this.gain);this.backend='worklet';
    }catch{this.backend='buffer';}
    finally{URL.revokeObjectURL(url);}
   }else this.backend='buffer';
  })().catch(error=>{this.context?.close();this.context=null;this.preparing=null;throw error;});
  return this.preparing;
 }
 async start(){
  this.want=true;this.error=null;const token=++this.generation;
  // resume is called in the originating user gesture, before module loading.
  const ready=this.prepare(),resume=this.context?.resume();
  await Promise.all([ready,resume]);
  if(token!==this.generation||!this.want)return false;
  if(this.context.state!=='running')throw Object.assign(Error('点击播放'),{name:'NotAllowedError'});
  this.forceReset=true;this.sync();return true;
 }
 stop(){
  this.want=false;this.generation++;this.active=false;this.audible=false;this.anchor=null;this.send(false);this.clearBuffers();
 }
 fail(message){this.error=message;this.stop();this.onReadings(null,{error:message,generation:this.generation});}
 setVolume(volume,muted){
  this.volume=volume;this.muted=muted;
  if(this.gain){const now=this.context.currentTime;this.gain.gain.cancelScheduledValues(now);this.gain.gain.setTargetAtTime(muted?0:volume,now,.008);}
 }
 setChannel(channel){if(!['sequence','sun','earth'].includes(channel))return;this.channel=channel;this.forceReset=true;this.sync();}
 update(environment,reason,key){this.environment=environment;this.reason=reason;this.key=key;this.sync();}
 sync(){
  if(!this.context||!this.backend)return;
  const now=this.context.currentTime,enabled=this.want&&!this.reason&&!!this.environment&&this.context.state==='running';
  if(!enabled){if(this.active){this.generation++;this.active=false;this.audible=false;this.anchor=null;this.send(false);this.clearBuffers();}return;}
  const simTime=this.environment.t;
  const reset=!this.active||this.forceReset||this.key!==this.lastKey||now-(this.lastSent??now)>.3||Math.abs(simTime-(this.anchor.sim+(now-this.anchor.audio)*1000))>120;
  if(!reset&&now-(this.lastSent??-1)<.04)return;
  if(reset){
   this.generation++;this.clearBuffers();this.anchor={sim:simTime,audio:now};this.epoch=simTime;this.state=createTelemetryState();this.nextBuffer=now+.025;this.fadeNext=true;
  }
  this.active=true;this.forceReset=false;this.lastKey=this.key;this.lastSent=now;
  this.send(true,reset);
  if(this.backend==='buffer'){if(!this.timer)this.timer=setInterval(()=>this.fillBuffers(),25);this.fillBuffers();}
 }
 send(active,reset=false){
  this.node?.port.postMessage({generation:this.generation,active,reset,environment:this.environment,channel:this.channel,audioTime:this.context.currentTime,anchor:this.anchor,epoch:this.epoch});
 }
 clearBuffers(){
  clearInterval(this.timer);this.timer=null;
  const now=this.context?.currentTime??0;
  for(const entry of this.sources){
   const param=entry.gain.gain;param.cancelScheduledValues(now);param.setTargetAtTime(0,now,.003);
   try{entry.source.stop(now+.02);}catch{}
  }
  this.sources.clear();
  this.readingQueue=[];
 }
 fillBuffers(){
  try{this.fill();}catch(error){this.fail(error.message);}
 }
 fill(){
  const ctx=this.context,now=ctx.currentTime;
  if(!this.active||now-this.lastSent>.3){this.clearBuffers();this.audible=false;this.onReadings(null,{stale:true,generation:this.generation});return;}
  if(this.nextBuffer<now){this.nextBuffer=now+.025;this.state=createTelemetryState();this.fadeNext=true;this.underruns=(this.underruns||0)+1;}
  while(this.nextBuffer<now+.12){
   const length=Math.round(ctx.sampleRate*.05),start=this.nextBuffer;
   const result=renderTelemetry(this.state,this.environment,{sampleRate:ctx.sampleRate,startTimeMs:this.anchor.sim+(start-this.anchor.audio)*1000,length,channel:this.channel,cycleEpochMs:this.epoch});
   const buffer=ctx.createBuffer(1,length,ctx.sampleRate);buffer.copyToChannel(result.pcm,0);
   const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.connect(gain);gain.connect(this.gain);
   // Only the first block fades; subsequent contiguous PCM buffers share phase.
   if(this.fadeNext){gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(1,start+.015);this.fadeNext=false;}
   const entry={source,gain};this.sources.add(entry);source.onended=()=>{this.sources.delete(entry);source.disconnect();gain.disconnect();};source.start(start);this.nextBuffer+=length/ctx.sampleRate;
   this.audible=true;this.readingQueue??=[];this.readingQueue.push({at:this.nextBuffer,readings:result.readings,generation:this.generation});
  }
  while(this.readingQueue?.[0]?.at<=now){const r=this.readingQueue.shift();if(r.generation===this.generation)this.onReadings(r.readings,{active:true,generation:r.generation});}
 }
}
