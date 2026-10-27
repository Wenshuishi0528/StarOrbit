import {TelemetryAudio,telemetryGate} from './dfh1-telemetry-audio.js';
import {sampleSensors} from './dfh1-telemetry-core.js';
import {t} from './i18n.js';
const $=id=>document.getElementById(id);
const channelName=channel=>t({sun:'太阳角计',earth:'红外地平仪',reference:'参考电平'}[channel]||'实验路序');

export class TelemetryPanel{
 constructor(player){
  this.player=player;this.history=[];this.engine=new TelemetryAudio((r,status)=>{
   if(status.error)player.wantPlayback=false;
   if(status.generation!==undefined&&status.generation!==this.readingGeneration){this.history=[];this.readingGeneration=status.generation;}
   this.readings=r;this.stale=status.stale;
   if(r){this.history.push(r);while(this.history.length>200)this.history.shift();}
   this.render();player.renderPlayback();
  });
  $('dfh1AudioMode').onchange=()=>player.setBroadcastMode($('dfh1AudioMode').value);
  $('dfh1Channel').onchange=()=>{this.history=[];this.engine.setChannel($('dfh1Channel').value);this.render();};
  $('dfh1Run').onclick=()=>{
   if(!this.sim||this.sim.missionId!=='dfh1'||!this.sim.current)return;
   this.sim.mode='custom';this.sim.speed=1;this.sim.paused=false;this.sim.timeUI();player.play();
  };
  document.addEventListener('visibilitychange',()=>{
   if(document.hidden){this.engine.update(null,'后台已暂停','hidden');this.render();player.renderPlayback();}
  });
 }
 update(sim,wall){
  this.sim=sim;if(!this.player.live)return;
  const reason=telemetryGate(sim,document.hidden),q=sim.current;
  const config=sim.missions?.state;
  const environment=q&&config?{t:q.t,position:q.position,velocity:q.velocity,sunDir:q.sunDir,basis:q.basis,illumination:q.illumination,pose:{...config.pose},rotation:{...config.rotation},rpm:120}:null;
  if(this.data!==sim.data){this.data=sim.data;this.dataRevision=(this.dataRevision||0)+1;}
  const key=JSON.stringify([config?.pose,config?.rotation,this.dataRevision]);
  const changed=reason!==this.engine.reason;
  this.engine.update(environment,reason,key);
  if(wall-(this.lastRender??-Infinity)>50||changed){
   this.lastRender=wall;
   if(!this.engine.active&&environment){try{this.preview=sampleSensors(environment);}catch{this.preview=null;}}
   this.render();this.player.renderPlayback();
  }
 }
 status(){
  if(this.engine.error)return t('实时音频错误：{message}',{message:this.engine.error});
  if(this.player.needsGesture)return t('点击播放');
  if(this.engine.reason)return t(this.engine.reason);
  if(!this.player.wantPlayback)return t('遥测已停止');
  if(this.stale)return t('等待同步');
  if(!this.engine.active)return t('正在准备音频…');
  return channelName(this.readings?.channel)+(this.readings?.currentSlot?' · '+t('位置 {slot}/32',{slot:this.readings.currentSlot}):'');
 }
 progress(){
  const r=this.readings,elapsed=r&&this.engine.epoch!==undefined?((r.time-this.engine.epoch)%10000+10000)%10000:0;
  $('musicSeek').disabled=true;$('musicSeek').value=String(elapsed/10);$('musicSeek').setAttribute('aria-valuetext',this.status());$('musicMeta').textContent=this.status();
 }
 render(){
  const live=this.player.live;
  $('dfh1Panel').dataset.audioBackend=this.engine.backend||'idle';
  $('dfh1AudioMode').value=this.player.broadcastMode||'recording';$('dfh1TelemetryDetails').hidden=!live;
  if(!live)return;
  const r=this.engine.active?this.readings:this.preview;
  $('dfh1TelemetryStatus').textContent=this.status();
  const reason=this.engine.reason;
  $('dfh1Run').hidden=!['模拟已暂停','实时遥测需要 1×'].includes(reason);
  $('dfh1SunValue').textContent=r?`${r.sunVoltage.toFixed(2)} V`:'—';
  $('dfh1EarthValue').textContent=r?`${r.earthVoltage.toFixed(2)} V`:'—';
  $('dfh1Frequency').textContent=this.engine.active&&r?.frequency?`${r.frequency.toFixed(0)} Hz`:'—';
  $('dfh1Selected').textContent=this.engine.active&&r?.voltage!==undefined?`${r.voltage.toFixed(2)} V`:'—';
  if(!$('dfh1Panel').hidden)this.draw();
 }
 draw(){
  const canvas=$('dfh1Wave'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#081522';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#254052';ctx.lineWidth=1;
  for(const v of [0,1.5,3]){const y=h-14-v*(h-22)/3;ctx.beginPath();ctx.moveTo(25,y);ctx.lineTo(w,y);ctx.stroke();ctx.fillStyle='#8ea8bd';ctx.font='10px sans-serif';ctx.fillText(String(v),2,y+3);}
  const last=this.history.at(-1)?.time;
  for(const [field,color] of [['sunVoltage','#ffd776'],['earthVoltage','#64dfdd']]){
   ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.beginPath();let first=true;
   for(const p of this.history){const x=25+(p.time-last+10000)/10000*(w-25);if(x<25)continue;const y=h-14-p[field]*(h-22)/3;if(first){ctx.moveTo(x,y);first=false;}else ctx.lineTo(x,y);}
   ctx.stroke();
  }
 }
 reset(){this.history=[];this.readings=null;this.stale=false;this.engine.forceReset=true;}
}
