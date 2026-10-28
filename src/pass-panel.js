import {t,onLanguageChange} from './i18n.js';
import {clockText,inputText,parseLocalTime} from './time-format.js';
import {mission} from './missions.js';
import {orbitSource} from './orbit-repository.js';
import {validateObserver,predictionSource,predictPasses,passesToICS,createPassSampler} from './pass-prediction.js';
import {compassDirection,passClockParts,isCandidateTime,passStages,passTimeAtFraction,passTimeTicks,passProfile} from './pass-display.js';

const STORE='starorbit-pass-observer-v1',BEIJING={name:'北京',latitude:39.9042,longitude:116.4074,height:50};
const css=`
.pass-panel [hidden]{display:none!important}.pass-panel{color:#dce8f4;font-size:13px}.pass-panel .pass-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.pass-panel label{display:flex;flex-direction:column;gap:5px;color:#a7bbce}.pass-panel input,.pass-panel select{box-sizing:border-box;width:100%;min-width:0;max-width:none;background:#101e2d;border:1px solid #345068;color:#edf5fa;padding:8px;border-radius:6px}.pass-panel .pass-wide{grid-column:1/-1}.pass-panel .pass-actions{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.pass-panel button{cursor:pointer;font:inherit;padding:8px 12px;border:1px solid #36556e;border-radius:7px;background:#183247;color:#e5f5ff}.pass-panel button:disabled{opacity:.45;cursor:default}.pass-panel .pass-status{white-space:pre-line;line-height:1.6;color:#c0d3e2}.pass-panel .pass-note{font-size:12px;color:#a1b2c3;line-height:1.6}.pass-panel .pass-results{display:grid;grid-template-columns:minmax(210px,.85fr) minmax(0,2.15fr);gap:18px;align-items:start}.pass-panel .pass-list{display:grid;gap:7px;max-height:660px;overflow:auto}.pass-panel .pass-item{text-align:left;white-space:pre-line;line-height:1.6}.pass-panel .pass-item[aria-pressed=true]{border-color:#77daf0;background:#18475b}.pass-panel .pass-preview{min-width:0}.pass-panel .pass-heading{font-size:15px;margin:0 0 10px}.pass-panel .pass-stages{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.pass-panel .pass-stage{min-width:0;padding:11px;background:#102235;border:1px solid #304c63;border-radius:9px;line-height:1.6}.pass-panel .pass-stage[data-stage="1"]{border-color:#5ca5b6;background:#123342}.pass-panel .pass-stage-title{display:block;color:#adc2d3;min-height:2.8em;font-size:12px}.pass-panel .pass-stage-time{display:block;color:#f0f7fe;font-size:18px;font-variant-numeric:tabular-nums}.pass-panel .pass-stage-date{display:block;color:#91a9bc;font-size:11px}.pass-panel .pass-stage-direction{display:block;margin-top:7px;color:#a8edf1}.pass-panel .pass-stage-elevation{display:block;color:#d7e5f1}.pass-panel .pass-threshold-note{margin:10px 0 14px}.pass-panel .pass-chart{display:block;width:100%;height:300px;background:#07121f;border:1px solid #294156;border-radius:12px}.pass-panel .pass-legend{display:flex;flex-wrap:wrap;gap:7px 15px;margin:8px 0;color:#adc2d3;font-size:12px;line-height:1.6}.pass-panel .pass-legend span{display:inline-flex;align-items:center;gap:6px}.pass-panel .pass-swatch{display:inline-block;width:19px;border-top:3px solid #72869a}.pass-panel .pass-swatch.candidate{border-color:#80e9ef}.pass-panel .pass-swatch.threshold{border-top:2px dashed #e7bb79}.pass-panel .pass-scrubber{margin-top:14px;padding:12px;background:#102235;border:1px solid #304c63;border-radius:9px}.pass-panel .pass-scrubber label{font-weight:600;color:#dbeaf5}.pass-panel .pass-scrubber input[type=range]{accent-color:#80e9ef;padding:0;margin:9px 0;height:28px;border:0}.pass-panel .pass-readout-time{display:block;color:#b6cbdd;font-variant-numeric:tabular-nums}.pass-panel .pass-readout-direction{display:block;color:#e3f8fb;font-size:16px;line-height:1.7;margin:5px 0}.pass-panel .pass-readout-status{display:block;color:#a1b2c3;line-height:1.6}.pass-panel .pass-readout-status[data-candidate=true]{color:#80e9ef}.pass-panel .pass-details{line-height:1.7;white-space:pre-line}.pass-panel .pass-error{color:#ffb7a7}
@media(max-width:900px){.pass-panel .pass-results{grid-template-columns:1fr}.pass-panel .pass-list{max-height:210px;grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.pass-panel .pass-form{grid-template-columns:repeat(2,minmax(0,1fr))}.pass-panel .pass-list{grid-template-columns:1fr}.pass-panel .pass-stage{padding:8px 6px}.pass-panel .pass-stage-time{font-size:16px}.pass-panel .pass-stage-direction{font-size:12px}.pass-panel .pass-stage-date{font-size:10px}.pass-panel .pass-stage-title{font-size:11px}.pass-panel .pass-readout-direction{font-size:15px}}
`;
const node=(tag,className,parent)=>{const el=document.createElement(tag);if(className)el.className=className;parent?.append(el);return el;};
const svg=(tag,attrs,parent)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));parent?.append(el);return el;};
export function mountPassPanel(container,sim){
 const root=node('div','pass-panel',container);root.dataset.testid='pass-panel';const style=node('style','',root);style.textContent=css;
 const labels=[],label=(element,key)=>{labels.push(()=>element.textContent=t(key));element.textContent=t(key);return element;};
 const intro=label(node('p','pass-note',root),'按观测地点计算几何过境；候选可观测时段还要求航天器受照、当地太阳低于 −6°。');
 const form=node('div','pass-form',root),fields={};
 const input=(key,title,type,value,attrs={})=>{const wrap=node('label','',form);label(node('span','',wrap),title);const el=node('input','',wrap);el.type=type;el.value=value;el.dataset.passField=key;for(const [name,x]of Object.entries(attrs))el.setAttribute(name,x);fields[key]=el;return el;};
 let saved=BEIJING;try{saved=validateObserver(JSON.parse(localStorage.getItem(STORE)));}catch{}
 input('name','地点名称','text',saved.name,{maxlength:60});input('latitude','纬度（北纬为正）','number',saved.latitude,{min:-90,max:90,step:.0001});input('longitude','经度（东经为正）','number',saved.longitude,{min:-180,max:180,step:.0001});
 input('height','海拔（米）','number',saved.height,{min:-500,max:9000,step:1});
 const begin=input('start','开始时间 · UTC+8','datetime-local',inputText(sim.time),{step:1});begin.parentElement.classList.add('pass-wide');
 const select=(key,title,values)=>{const wrap=node('label','',form);label(node('span','',wrap),title);const el=node('select','',wrap);el.dataset.passField=key;for(const [value,key]of values){const option=node('option','',el);option.value=value;label(option,key);}fields[key]=el;return el;};
 select('hours','预报时长',[[24,'24 小时'],[48,'48 小时'],[72,'72 小时']]);input('minimum','最低仰角（度）','number',10,{min:0,max:80,step:1});
 const actions=node('div','pass-actions',root),button=(key,parent=actions)=>label(node('button','',parent),key);
 const beijing=button('使用北京'),current=button('使用模拟时刻'),interval=button('使用有效数据时段'),update=button('更新当前轨道'),importButton=button('导入轨道'),calculate=button('计算过境');calculate.dataset.action='predict';
 const status=node('p','pass-status',root);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const note=label(node('p','pass-note',root),'受照与暮光条件不代表肉眼一定可见；未计入天气、地形遮挡和航天器亮度。');
 const results=node('div','pass-results',root),list=node('div','pass-list',results),preview=node('div','pass-preview',results);
 label(node('h3','pass-heading',preview),'这次过境怎么看');
 const stages=node('div','pass-stages',preview),thresholdNote=node('p','pass-note pass-threshold-note',preview);
 const chart=svg('svg',{viewBox:'0 0 640 300',class:'pass-chart',role:'img'},preview),legend=node('div','pass-legend',preview);
 for(const [key,className] of [['候选可观测时段','candidate'],['仅几何通视',''],['设定的最低仰角','threshold']]){const item=node('span','',legend);node('i','pass-swatch '+className,item);label(node('span','',item),key);}
 label(node('p','pass-note',preview),'从左到右读时间，曲线越高就要抬头越高。北为 0°，东为 90°，南为 180°，西为 270°。');
 const scrubber=node('div','pass-scrubber',preview),scrubLabel=node('label','',scrubber);label(node('span','',scrubLabel),'拖动时间，查看朝向和仰角');
 const scrub=node('input','',scrubLabel);scrub.type='range';scrub.min=0;scrub.max=1000;scrub.step=1;scrub.dataset.testid='pass-time-slider';
 const readoutTime=node('time','pass-readout-time',scrubber),readoutDirection=node('strong','pass-readout-direction',scrubber),readoutStatus=node('span','pass-readout-status',scrubber);
 const details=node('p','pass-details',preview),tools=node('div','pass-actions',preview),jump=button('在轨道总览查看最高点',tools),download=button('导出日历 ICS',tools);
 results.hidden=true;let result=null,selected=0,job=null,generation=0,disposed=false,identity=null,errorKey=null,updating=false,poll=null,seenData=sim.data,seenMission=sim.missionId;
 let sampler=null,previewTime=null,chartLayout=null,cursorLine=null,cursorDot=null;
 const frameInfo=()=>{try{const source=predictionSource(sim.data);return `${t(source.kind==='sgp4'?'按需 SGP4 · 7 天时效上限':'有效星历区间内插值')}\n${t('数据历元')}：${clockText(source.epoch)} UTC+8\n${t('有效区间')}：${clockText(source.start)} — ${clockText(source.end)} UTC+8`;}catch(error){return t(error.message);}};
 function invalidate(){generation++;job?.abort();job=null;calculate.disabled=updating;result=null;identity=null;sampler=null;previewTime=null;results.hidden=true;list.replaceChildren();stages.replaceChildren();chart.replaceChildren();details.textContent=readoutTime.textContent=readoutDirection.textContent=readoutStatus.textContent='';scrub.value=0;scrub.removeAttribute('aria-valuetext');chartLayout=cursorLine=cursorDot=null;errorKey=null;status.classList.remove('pass-error');status.textContent=frameInfo();}
 function isCurrent(){return identity?.data===sim.data&&identity?.missionId===sim.missionId;}
 const directionText=point=>`${t(compassDirection(point.azimuth))} · ${point.azimuth.toFixed(1)}°`;
 function renderStages(pass){
  stages.replaceChildren();
  passStages(pass).forEach(({key,point},index)=>{
   const card=node('div','pass-stage',stages);card.dataset.stage=index;
   node('span','pass-stage-title',card).textContent=`${index+1} · ${t(key)}`;
   const parts=passClockParts(point.time),time=node('time','pass-stage-time',card);time.textContent=parts.clock;time.dateTime=new Date(point.time).toISOString();
   node('small','pass-stage-date',card).textContent=parts.date+' · UTC+8';
   node('strong','pass-stage-direction',card).textContent=directionText(point);
   node('span','pass-stage-elevation',card).textContent=t('抬头 {elevation}°',{elevation:point.elevation.toFixed(1)});
  });
  thresholdNote.textContent=t('进入和离开指跨过设定的最低仰角 {elevation}°，不一定是从地平线升起或落下。',{elevation:result.minimumElevation});
  if(pass.clippedStart||pass.clippedEnd)thresholdNote.textContent+=' '+t('此过境在预报窗口边缘被截断');
 }
 function renderCursor(){
  const pass=result?.passes[selected];if(!pass||!sampler||!chartLayout)return;
  const point=sampler(previewTime),{x,y,top,bottom}=chartLayout,candidate=isCandidateTime(pass,previewTime);
  cursorLine.setAttribute('x1',x(previewTime));cursorLine.setAttribute('x2',x(previewTime));cursorLine.setAttribute('y1',top);cursorLine.setAttribute('y2',bottom);
  cursorDot.setAttribute('cx',x(previewTime));cursorDot.setAttribute('cy',y(point.elevation));cursorDot.setAttribute('fill',candidate?'#80e9ef':'#e3ebf4');
  readoutTime.textContent=clockText(previewTime)+' UTC+8';readoutTime.dateTime=new Date(previewTime).toISOString();
  readoutDirection.textContent=t('朝向 {direction}（方位角 {azimuth}°），抬头 {elevation}°',{direction:t(compassDirection(point.azimuth)),azimuth:point.azimuth.toFixed(1),elevation:point.elevation.toFixed(1)});
  readoutStatus.textContent=t(candidate?'候选可观测：航天器受照，且当地太阳低于 −6°。':'此时仅几何通视，未同时满足受照和暮光条件。');readoutStatus.dataset.candidate=candidate;
  if(point.elevation>88)readoutStatus.textContent+=' '+t('接近头顶时方位变化很快，以仰角为主要参考。');
  scrub.setAttribute('aria-valuetext',readoutTime.textContent+'，'+readoutDirection.textContent);
 }
 function draw(){
  const pass=result?.passes[selected];if(!pass)return;
  chart.replaceChildren();chart.setAttribute('aria-label',t('时间与仰角曲线 · 青色为候选可观测时段'));
  const width=Math.max(280,chart.clientWidth||640),left=76,right=width-17,top=34,bottom=236;
  chart.setAttribute('viewBox',`0 0 ${width} 300`);
  const x=time=>left+(time-pass.start)/(pass.end-pass.start)*(right-left),y=elevation=>bottom-Math.max(0,Math.min(90,elevation))/90*(bottom-top);
  chartLayout={width,x,y,top,bottom};
  const text=(value,px,py,attrs={})=>{const el=svg('text',{x:px,y:py,fill:'#a8bbce','font-size':12,...attrs},chart);el.textContent=value;return el;};
  for(const elevation of [0,45,90]){
   svg('line',{x1:left,y1:y(elevation),x2:right,y2:y(elevation),stroke:elevation===0?'#5b7185':'#294056'},chart);
   text(elevation+'°',left-11,y(elevation)+4,{'text-anchor':'end'});
   if(elevation!==45)text(t(elevation===0?'地平线':'头顶'),left-11,y(elevation)+18,{'text-anchor':'end','font-size':11});
  }
  const thresholdY=y(result.minimumElevation);svg('line',{x1:left,y1:thresholdY,x2:right,y2:thresholdY,stroke:'#e7bb79','stroke-dasharray':'5 5','stroke-width':1.5},chart);
  const ticks=passTimeTicks(pass,width<520?3:5);
  ticks.forEach((tick,index)=>{
   const px=x(tick.time),anchor=index===0?'start':index===ticks.length-1?'end':'middle';
   svg('line',{x1:px,y1:bottom,x2:px,y2:bottom+5,stroke:'#5b7185'},chart);
   text(tick.clock,px,bottom+22,{'text-anchor':anchor,'font-size':11});
   if(tick.showDate)text(tick.shortDate,px,bottom+36,{'text-anchor':anchor,'font-size':10});
  });
  text(t('时间 · UTC+8'),(left+right)/2,290,{'text-anchor':'middle','font-size':11});
  const profile=passProfile(pass);
  for(const segment of profile.segments)svg('line',{x1:x(segment.from.time),y1:y(segment.from.elevation),x2:x(segment.to.time),y2:y(segment.to.elevation),stroke:segment.candidate?'#80e9ef':'#72869a','stroke-width':3,'stroke-linecap':'round','data-candidate':segment.candidate},chart);
  const peakX=x(pass.maximum.time),peakY=y(pass.maximum.elevation);
  svg('circle',{cx:peakX,cy:peakY,r:4,fill:'#ffcc74'},chart);
  text(t('最高 {elevation}°',{elevation:pass.maximum.elevation.toFixed(1)}),Math.max(left+50,Math.min(right-50,peakX)),Math.max(19,peakY-12),{'text-anchor':'middle',fill:'#ffcc74','font-weight':600});
  cursorLine=svg('line',{stroke:'#c5deef','stroke-dasharray':'3 4','stroke-width':1},chart);
  cursorDot=svg('circle',{r:4,stroke:'#07121f','stroke-width':1.5},chart);renderCursor();
 }
 scrub.oninput=()=>{if(!isCurrent()){invalidate();return;}const pass=result?.passes[selected];if(pass){previewTime=passTimeAtFraction(pass,Number(scrub.value)/1000);renderCursor();}};
 function renderResults(){
  if(!result)return;results.hidden=!result.passes.length;list.replaceChildren();
  result.passes.forEach((pass,index)=>{
   const item=node('button','pass-item',list);item.dataset.passIndex=index;item.setAttribute('aria-pressed',String(index===selected));
   item.textContent=`${clockText(pass.maximum.time)} UTC+8\n${t('最高仰角')} ${pass.maximum.elevation.toFixed(1)}° · ${t('持续')} ${Math.round((pass.end-pass.start)/1000)} s\n${t(pass.visible.length?'含候选可观测时段':'几何过境')}`;
   item.onclick=()=>{if(!isCurrent()){invalidate();return;}selected=index;previewTime=pass.maximum.time;renderResults();};
  });
  const selectedTime=result.passes[selected]?.maximum.time,covered=Number.isFinite(selectedTime)&&selectedTime>=sim.data.rows[0][0]&&selectedTime<=sim.data.rows.at(-1)[0];
  jump.disabled=!covered;download.disabled=!result.passes.length;jump.title=covered?'':t('当前三维星历未覆盖此时刻，可查看天空轨迹图。');if(!result.passes.length){chart.replaceChildren();stages.replaceChildren();details.textContent='';}
  if(result.passes.length){
   const pass=result.passes[selected];previewTime=Math.max(pass.start,Math.min(pass.end,previewTime??pass.maximum.time));scrub.value=(previewTime-pass.start)/(pass.end-pass.start)*1000;
   renderStages(pass);draw();details.textContent=`${t('最高点距离')}：${pass.maximum.range.toFixed(0)} km\n${t('候选可观测时段')} · UTC+8：${pass.visible.length?pass.visible.map(x=>clockText(x.start)+' — '+clockText(x.end)).join('\n'):t('无')}${covered?'':'\n'+t('当前三维星历未覆盖此时刻，可查看天空轨迹图。')}`;
  }
  status.textContent=`${t('找到 {count} 次过境',{count:result.passes.length})}\n${t('预报区间')}：${clockText(result.start)} — ${clockText(result.end)} UTC+8${result.clipped?'\n'+t('已按轨道有效区间截短，未使用长期外推。'):''}\n${frameInfo()}`;
 }
 async function run(){
  if(updating)return;const token=generation,controller=new AbortController();job=controller;
  try{
   const numeric=key=>{if(fields[key].value.trim()==='')throw Error('观测点坐标无效');return Number(fields[key].value);};
   const observer=validateObserver({name:fields.name.value,latitude:numeric('latitude'),longitude:numeric('longitude'),height:numeric('height')});
   const time=parseLocalTime(fields.start.value),hours=Number(fields.hours.value),minimumElevation=numeric('minimum');
   const data=sim.data,missionId=sim.missionId;calculate.disabled=true;status.textContent=t('正在计算过境…');
   const next=await predictPasses(data,observer,time,hours,{minimumElevation,signal:controller.signal});
   if(disposed||token!==generation||data!==sim.data||missionId!==sim.missionId){if(token===generation)invalidate();return;}
   sampler=createPassSampler(predictionSource(data),observer);result=next;identity={data,missionId};selected=0;previewTime=next.passes[0]?.maximum.time??null;try{localStorage.setItem(STORE,JSON.stringify(observer));}catch{}renderResults();
  }catch(error){if(error.name!=='AbortError'&&token===generation&&!disposed){errorKey=error.message;status.textContent=t(errorKey)+'\n'+t('可更新轨道数据，或使用有效数据时段查看历史过境。')+'\n'+frameInfo();status.classList.add('pass-error');}}
  finally{if(token===generation){calculate.disabled=updating;job=null;}}
 }
 for(const input of Object.values(fields))input.addEventListener('input',invalidate);
 beijing.onclick=()=>{for(const [key,value]of Object.entries(BEIJING))fields[key].value=value;invalidate();};
 current.onclick=()=>{fields.start.value=inputText(sim.time);invalidate();};
 interval.onclick=()=>{try{const source=predictionSource(sim.data);fields.start.value=inputText(source.kind==='sgp4'?source.epoch:source.start);invalidate();}catch(error){status.textContent=t(error.message);}};
 update.onclick=async()=>{
  if(updating)return;invalidate();
  if(!orbitSource(sim.missionId)){status.textContent=t('此任务没有在线轨道源，请导入轨道文件');return;}
  const id=sim.missionId,beforeData=sim.data;updating=true;update.disabled=calculate.disabled=importButton.disabled=true;status.textContent=t('正在更新轨道…');
  try{const outcome=await sim.environment.weather.updateResource('orbit',{provider:id});if(!disposed){if(outcome.status!=='unchanged'||sim.data!==beforeData||sim.missionId!==id){seenData=sim.data;seenMission=sim.missionId;invalidate();}status.textContent=t(outcome.status==='unchanged'?'已是最新可用数据':'轨道已更新，请重新计算。')+'\n'+frameInfo();}}
  catch(error){if(!disposed){status.classList.add('pass-error');status.textContent=t('轨道更新失败，已保留原数据。')+'\n'+t(error.message||'网络请求失败');}}
  finally{updating=false;if(!disposed)update.disabled=calculate.disabled=importButton.disabled=false;}
 };
 importButton.onclick=()=>{invalidate();document.getElementById('importOrbit').click();};
 calculate.onclick=run;
 jump.onclick=()=>{if(!isCurrent()){invalidate();return;}const time=result?.passes[selected]?.maximum.time;if(Number.isFinite(time)&&time>=sim.data.rows[0][0]&&time<=sim.data.rows.at(-1)[0]){if(sim.flightLab?.previewPass)sim.flightLab.previewPass(time);else sim.seek(time);}};
 download.onclick=()=>{if(!isCurrent()){invalidate();return;}if(!result?.passes.length)return;const blob=new Blob([passesToICS(result,t(mission(sim.missionId).name))],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='StarOrbit-passes.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
 const unsubscribe=onLanguageChange(()=>{for(const render of labels)render();if(result)renderResults();else status.textContent=errorKey?t(errorKey):frameInfo();});
 const resizeObserver=new ResizeObserver(()=>{if(!disposed&&result?.passes.length&&chart.clientWidth&&Math.abs(chart.clientWidth-(chartLayout?.width??0))>.5)draw();});resizeObserver.observe(chart);
 invalidate();
 const resume=()=>{if(seenData!==sim.data||seenMission!==sim.missionId){seenData=sim.data;seenMission=sim.missionId;invalidate();}else if(!result&&!updating)status.textContent=frameInfo();clearInterval(poll);poll=setInterval(()=>{if(seenData!==sim.data||seenMission!==sim.missionId){seenData=sim.data;seenMission=sim.missionId;invalidate();}},250);};
 resume();
 return {calculate:run,resume,pause(){clearInterval(poll);poll=null;if(job)invalidate();},get result(){return result;},dispose(){disposed=true;generation++;clearInterval(poll);job?.abort();resizeObserver.disconnect();unsubscribe();root.remove();}};
}
