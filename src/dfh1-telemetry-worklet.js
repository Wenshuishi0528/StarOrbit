import {createTelemetryState,renderTelemetry} from './dfh1-telemetry-core.js';

// Audio-clock transport. Slow environment nodes are refreshed by the simulation;
// spin, probe response and FM run here independently of rendering frame rate.
class DFH1TelemetryProcessor extends AudioWorkletProcessor{
 constructor(){
  super();this.state=createTelemetryState();this.envelope=0;this.active=false;this.counter=0;this.generation=0;
  this.port.onmessage=({data:m})=>{
   if(m.generation<this.generation)return;
   this.generation=m.generation;
   // Finish a short fade before replacing a moving probe or timeline state.
   if(m.reset&&this.envelope>0){this.pending=m;this.active=false;return;}
   if(!m.active)this.pending=null;
   this.apply(m);
  };
 }
 apply(m){
  if(m.reset){this.state=createTelemetryState();this.anchor=m.anchor;this.epoch=m.epoch;this.envelope=0;}
  // A normal stop can have no current orbit. Keep the last valid node solely
  // for the 15 ms release envelope; it must not become a probe validation error.
  if(m.environment)this.environment=m.environment;
  this.channel=m.channel;this.active=m.active;this.updatedAt=m.audioTime;
 }
 process(inputs,outputs){
  const out=outputs[0][0];if(!out)return true;
  if(this.pending&&this.envelope===0){this.apply(this.pending);this.pending=null;}
  const fresh=this.active&&this.environment&&currentTime-this.updatedAt<.35;
  let result;
  if(fresh||this.envelope>0){
   try{result=renderTelemetry(this.state,this.environment,{sampleRate,startTimeMs:this.anchor.sim+(currentTime-this.anchor.audio)*1000,length:out.length,channel:this.channel,cycleEpochMs:this.epoch});}
   catch(error){this.active=false;this.envelope=0;this.port.postMessage({error:error.message,generation:this.generation});}
  }
  for(let i=0;i<out.length;i++){
   this.envelope=Math.max(0,Math.min(1,this.envelope+(fresh?1:-1)/(sampleRate*.015)));
   out[i]=(result?.pcm[i]||0)*this.envelope;
  }
  if((this.counter+=out.length)>=sampleRate/20){
   this.counter=0;
   this.port.postMessage({generation:this.generation,readings:fresh?result?.readings:null,active:!!fresh,stale:this.active&&!fresh});
  }
  return true;
 }
}
registerProcessor('dfh1-telemetry',DFH1TelemetryProcessor);
