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
export class DateTimeInput{
 constructor(sim){
  this.sim=sim;this.date=document.getElementById('customDate');this.clock=document.getElementById('customTime');this.control=document.getElementById('hourCycle');this.cycle='24';
  try{if(localStorage.getItem(KEY)==='12')this.cycle='12';}catch{}
  this.control.value=this.cycle;
  this.clock.onclick=()=>this.selectPart(this.activePart());
  this.clock.onkeydown=event=>{
   if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||!clockValue(this.clock.value,this.cycle))return;
   event.preventDefault();const part=this.activePart();
   if(event.key==='ArrowLeft'||event.key==='ArrowRight')this.selectPart(Math.max(0,Math.min(this.parts().length-1,part+(event.key==='ArrowRight'?1:-1))));
   else{this.clock.value=stepClock(this.clock.value,this.cycle,part,event.key==='ArrowUp'?1:-1);this.sim.inputDirty=true;this.selectPart(part);}
  };
  for(const input of [this.date,this.clock])input.oninput=()=>{sim.inputDirty=true;};
  this.control.onchange=()=>{
   const time=this.read();if(!validTime(time)){this.control.value=this.cycle;sim.api.toast('请输入有效日期和时间');return;}
   this.cycle=this.control.value;this.set(time);try{localStorage.setItem(KEY,this.cycle);}catch{}
  };
 }
 parts(){return [...this.clock.value.matchAll(/\d+|AM|PM/gi)];}
 activePart(){const position=this.clock.selectionStart??0,parts=this.parts(),index=parts.findIndex(part=>position<=part.index+part[0].length);return index<0?Math.max(0,parts.length-1):index;}
 selectPart(index){const part=this.parts()[index];if(part)this.clock.setSelectionRange(part.index,part.index+part[0].length);}
 read(){const clock=clockValue(this.clock.value,this.cycle);if(!this.date.value||!clock||!this.date.validity.valid)return NaN;return parseLocalTime(this.date.value+'T'+clock);}
 set(time){const [date,clock]=inputText(time).split('T');this.date.value=date;this.clock.value=clockInput(clock,this.cycle);this.clock.placeholder=this.cycle==='12'?'hh:mm:ss AM':'HH:mm:ss';}
 get focused(){return document.activeElement===this.date||document.activeElement===this.clock;}
}
