import {inputText,parseLocalTime} from './time-format.js';
import {validTime} from './orbit.js';
const KEY='starorbit-hour-cycle-v1';
export function clockInput(value,cycle){
 const [hour,...rest]=value.split(':');
 return cycle==='12'?[String(Number(hour)%12||12).padStart(2,'0'),...rest].join(':')+(Number(hour)<12?' AM':' PM'):value;
}
export function clockValue(value,cycle){
 const match=value.trim().match(cycle==='12'?/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i:/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
 if(!match)return null;let h=Number(match[1]);const m=Number(match[2]),s=Number(match[3]||0);
 if(m>59||s>59||h>(cycle==='12'?12:23)||(cycle==='12'&&h<1))return null;
 if(cycle==='12')h=h%12+(match[4].toUpperCase()==='PM'?12:0);
 return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':');
}
export function stepClock(value,cycle,part,delta){
 const canonical=clockValue(value,cycle);if(!canonical)return null;
 const values=canonical.split(':').map(Number),index=part===3?0:part,limit=index===0?24:60;
 values[index]=(values[index]+(part===3?12:delta)+limit)%limit;
 return clockInput(values.map(n=>String(n).padStart(2,'0')).join(':'),cycle);
}
export function dateTimeText(time,cycle){const [date,clock]=inputText(time).split('T');return date+' '+clockInput(clock,cycle);}
export function dateTimeValue(value,cycle){
 const match=value.trim().match(/^([+-]?\d{4,6})-(\d{2})-(\d{2})[ T](.+)$/);if(!match)return NaN;
 const clock=clockValue(match[4],cycle);if(!clock)return NaN;
 const time=parseLocalTime(`${match[1]}-${match[2]}-${match[3]}T${clock}`);if(!validTime(time))return NaN;
 // Date.parse normalizes dates such as February 30; reject those edits.
 const local=new Date(time+8*3600000);
 return local.getUTCFullYear()===Number(match[1])&&local.getUTCMonth()+1===Number(match[2])&&local.getUTCDate()===Number(match[3])?time:NaN;
}
export function stepDateTime(value,cycle,part,delta){
 const time=dateTimeValue(value,cycle);if(!validTime(time))return null;
 const [date,clock]=inputText(time).split('T');
 if(part>=3)return date+' '+stepClock(clockInput(clock,cycle),cycle,part-3,delta);
 const local=new Date(time+8*3600000),day=local.getUTCDate();
 if(part===2)local.setUTCDate(day+delta);
 else{
  local.setUTCDate(1);
  if(part===0)local.setUTCFullYear(local.getUTCFullYear()+delta);else local.setUTCMonth(local.getUTCMonth()+delta);
  const last=new Date(local);last.setUTCMonth(last.getUTCMonth()+1,0);local.setUTCDate(Math.min(day,last.getUTCDate()));
 }
 const next=local.getTime()-8*3600000;return validTime(next)?dateTimeText(next,cycle):null;
}
export class DateTimeInput{
 constructor(sim){
  this.sim=sim;this.clock=document.getElementById('customTime');this.control=document.getElementById('hourCycle');this.cycle='24';
  try{if(localStorage.getItem(KEY)==='12')this.cycle='12';}catch{}
  this.control.value=this.cycle;
  this.clock.onclick=()=>this.selectPart(this.activePart());
  this.clock.onkeydown=event=>{
   if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||!this.parts().length)return;
   const part=this.activePart();
   if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();this.selectPart(Math.max(0,Math.min(this.parts().length-1,part+(event.key==='ArrowRight'?1:-1))));}
   else{const next=stepDateTime(this.clock.value,this.cycle,part,event.key==='ArrowUp'?1:-1);if(next!==null){event.preventDefault();this.clock.value=next;this.sim.inputDirty=true;this.selectPart(part);}}
  };
  this.clock.oninput=()=>{sim.inputDirty=true;};
  this.control.onchange=()=>{
   const time=this.read();if(!validTime(time)){this.control.value=this.cycle;sim.api.toast('请输入有效日期和时间');return;}
   this.cycle=this.control.value;this.set(time);try{localStorage.setItem(KEY,this.cycle);}catch{}
  };
 }
 parts(){return [...this.clock.value.matchAll(/^[+-]?\d+|\d+|AM|PM/gi)];}
 activePart(){const position=this.clock.selectionStart??0,parts=this.parts(),index=parts.findIndex(part=>position<=part.index+part[0].length);return index<0?Math.max(0,parts.length-1):index;}
 selectPart(index){const part=this.parts()[index];if(part)this.clock.setSelectionRange(part.index,part.index+part[0].length);}
 read(){return dateTimeValue(this.clock.value,this.cycle);}
 set(time){this.clock.value=dateTimeText(time,this.cycle);this.clock.placeholder=this.cycle==='12'?'YYYY-MM-DD hh:mm:ss AM':'YYYY-MM-DD HH:mm:ss';}
 get focused(){return document.activeElement===this.clock;}
}
