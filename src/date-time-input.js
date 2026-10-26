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
export class DateTimeInput{
 constructor(sim){
  this.sim=sim;this.date=document.getElementById('customDate');this.clock=document.getElementById('customTime');this.control=document.getElementById('hourCycle');this.cycle='24';
  try{if(localStorage.getItem(KEY)==='12')this.cycle='12';}catch{}
  this.control.value=this.cycle;
  for(const input of [this.date,this.clock])input.oninput=()=>{sim.inputDirty=true;};
  this.control.onchange=()=>{
   const time=this.read();if(!validTime(time)){this.control.value=this.cycle;sim.api.toast('请输入有效日期和时间');return;}
   this.cycle=this.control.value;this.set(time);try{localStorage.setItem(KEY,this.cycle);}catch{}
  };
 }
 read(){const clock=clockValue(this.clock.value,this.cycle);if(!this.date.value||!clock||!this.date.validity.valid)return NaN;return parseLocalTime(this.date.value+'T'+clock);}
 set(time){const [date,clock]=inputText(time).split('T');this.date.value=date;this.clock.value=clockInput(clock,this.cycle);this.clock.placeholder=this.cycle==='12'?'hh:mm:ss AM':'HH:mm:ss';}
 get focused(){return document.activeElement===this.date||document.activeElement===this.clock;}
}
