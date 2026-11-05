import {t,onLanguageChange} from './i18n.js';
import {clockText} from './time-format.js';
import {stateAt} from './orbit.js';
import {makeSurveyOrbit,SURVEY_FIELDS,surveyFieldsForOrbit,surveyStartingPlan,evaluateSurveyPlan,retargetSurveyJobs,surveyPlayback,SURVEY_TILES,SURVEY_END,SURVEY_PERIOD} from './survey-lab-math.js';
import {createSurveyPointing} from './survey-lab-view.js';
import {mountSurveyLiveWall} from './survey-live-wall.js';
import {mountSurveySkyProduct} from './survey-sky-product.js';
import {mountSurveyOrbitOverview} from './survey-orbit-overview.js';
import {mountSurveyScheduleEditor} from './survey-schedule-editor.js';
import {surveyStyle} from './survey-lab-style.js';
import {mountStationOrbitControl} from './station-orbit-control.js';

const phaseNames={invalid:'排程有冲突',waiting:'等待转向',slew:'正在转向',settling:'指向稳定中',exposure:'正在曝光',coasting:'曝光完成，继续飞行',finished:'本圈结束'};
const elapsedText=value=>{
 const s=Math.floor(value);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
};

export function mountSurveyLab(container,sim,assets={}){
 const root=document.createElement('section');root.className='survey-lab';root.dataset.testid='survey-lab';container.append(root);
 const style=document.createElement('style');style.textContent=surveyStyle;root.append(style);
 const element=(tag,parent,className='')=>{const e=document.createElement(tag);if(className)e.className=className;parent.append(e);return e;};
 const labels=[];const label=(e,key)=>{labels.push(()=>{e.textContent=t(key);});return e;};
 const action=(parent,key,fn,role,cls='')=>{const b=element('button',parent,cls);b.type='button';b.dataset.survey=role;b.onclick=fn;label(b,key);return b;};
 const fieldName=(id)=>t(fields.find(f=>f.id===id).name);
 let orbit,fields,jobs,plan,exampleFound,referenceData,restoredSource=null;
 let selected=0,displayField,suggestedField=null,elapsed=0,running=false,visible=false,frame=0,lastWall=0,paintWall=0;
 let acceptInitialCache=sim.missionId!=='tiangong',courseRevision=0,disposed=false;
 function useCourse(){acceptInitialCache=false;courseRevision++;}
 function loadExample(preferred,preserveIfMissing=false){
  const start=surveyStartingPlan(orbit,fields,preferred);if(!start.found&&preserveIfMissing)return false;
  jobs=start.jobs;exampleFound=start.found;selected=0;displayField=jobs[0].field;return start.found;
 }
 function newOrbit(epoch=sim.time,data=orbitBar.data){
  restoredSource=null;
  const known=Number.isFinite(epoch)&&epoch>=Date.UTC(1900,0,1)&&epoch<=Date.UTC(2100,0,1);
  const reference=known&&data?stateAt(data,epoch):null;referenceData=reference?data:null;
  orbit=makeSurveyOrbit(epoch,reference);fields=surveyFieldsForOrbit(orbit);
  loadExample();
  plan=evaluateSurveyPlan(orbit,fields,jobs);
 }
 const head=element('div',root,'survey-head'),intro=element('div',head);
 label(element('h3',intro),'巡天拍摄计划');label(element('p',intro),'选一片天区，为 A–D 四格安排曝光，再执行这一圈并查看成片。');
 const sourceArea=element('div',root),orbitBar=mountStationOrbitControl(sourceArea,sim,()=>{
  // Reading the station's cached orbit can complete after this panel is shown.
  // Adopt it only for the untouched initial example, at the original lab epoch.
  if(!acceptInitialCache||disposed||!orbit)return;
  newOrbit(orbit.epoch);translate();
 });
 const referenceNote=element('p',sourceArea,'survey-note');referenceNote.dataset.survey='orbit-reference';
 newOrbit();
 const toolbar=element('div',head,'survey-toolbar');
 const play=action(toolbar,'执行一圈',toggleRun,'play','survey-primary');
 action(toolbar,'回到起点',()=>{useCourse();stop();elapsed=0;refreshEditor();paint();},'restart');
 action(toolbar,'看轨道与排程',()=>{work.scrollIntoView({block:'start'});overviewHostFocus();},'show-schedule');
 const speedLabel=element('label',toolbar);label(element('span',speedLabel),'播放速度');
 const speed=element('select',speedLabel);for(const rate of [1,30,120,300])speed.add(new Option(rate+'×',String(rate)));speed.value='120';
 const views=element('div',root,'survey-views'),craftCard=element('section',views,'survey-card');
 const craftHead=element('div',craftCard,'survey-viewhead');label(element('h4',craftHead),'巡天望远镜指向');const clock=element('small',craftHead);
 const stage=element('div',craftCard,'survey-viewstage');stage.dataset.survey='pointing';
 let pointing=createSurveyPointing(stage,assets.templates?.XT,orbit);
 const phaseLabel=element('span',stage,'survey-stage-phase');
 const craftFoot=element('div',craftCard,'survey-readout');const directionText=element('span',craftFoot);const targetText=element('span',craftFoot);
 const mosaicCard=element('section',views,'survey-card'),mosaicHead=element('div',mosaicCard,'survey-viewhead');
 label(element('h4',mosaicHead),'天区覆盖拼图');
 const displaySelect=element('select',mosaicHead);displaySelect.dataset.survey='coverage-field';
 const mosaic=element('div',mosaicCard,'survey-mosaic');const sky=element('canvas',mosaic);sky.setAttribute('aria-hidden','true');
 const tileGrid=element('div',mosaic,'survey-tilegrid'),tileButtons=[];
 for(const [index,letter] of SURVEY_TILES.entries()){
  const button=element('button',tileGrid,'survey-tile');button.type='button';button.dataset.tile=letter;
  element('span',button).textContent=letter;const mark=element('span',button);tileButtons.push({button,mark});
  button.onclick=()=>{if(running)return;const assigned=jobs.findIndex(j=>j.field===displayField&&j.tile===index);
   if(assigned!==-1){selectJob(assigned);editor.refresh();paint();return;}const job=jobs[selected];
   job.field=displayField;job.tile=index;job.enabled=true;changed();};
 }
 const mosaicFoot=element('div',mosaicCard,'survey-readout');const mosaicScore=element('span',mosaicFoot),centerText=element('small',mosaicFoot);
 const productHost=element('div',mosaicCard),product=mountSurveySkyProduct(productHost,sky,sim);
 label(element('p',mosaicCard,'survey-note survey-field-tip'),'右上角换天区会同步四行曝光；点击拼图格可查看对应排程。');
 const sendArea=element('div',mosaicCard,'survey-live-launch'),send=element('button',sendArea);send.type='button';send.dataset.survey='send-tile';
 function observeTile(fieldId,tile){useCourse();stop();sim.flightLab.observeSurveyTile({fieldId,tile});}
 send.onclick=()=>observeTile(displayField,jobs[selected].tile);
 action(sendArea,'我的在轨四格',()=>wall.show(displayField),'show-live-wall');
 const timer=element('div',root,'survey-clock');const elapsedOutput=element('output',timer);
 const scrub=element('input',timer);scrub.type='range';scrub.min='0';scrub.max=String(SURVEY_END);scrub.step='1';scrub.dataset.survey='clock';
 const next=action(timer,'下一次曝光',()=>{const job=plan.order.find(j=>j.start>elapsed+.05);if(job){useCourse();elapsed=job.start;lastWall=performance.now();paint();}},'next');
 const finish=action(timer,'跳至末次曝光结束',()=>{if(plan.valid)seek(Math.ceil(Math.max(...plan.order.map(j=>j.end))));},'finish-exposures');
 const work=element('div',root,'survey-work'),mapHost=element('div',work,'survey-map-host');
 function overviewHostFocus(){mapHost.querySelector('canvas')?.focus({preventScroll:true});}
 const overview=mountSurveyOrbitOverview(mapHost,{sim,onSeek:seconds=>seek(seconds)});
 const edit=element('section',work,'survey-edit'),editHead=element('div',edit,'survey-edithead');label(element('h4',editHead),'曝光排程');
 const tools=element('div',editHead,'survey-tools');
 const example=action(tools,'载入可行示例',()=>{
  if(loadExample(displayField,true)){changed();return;}
  const alternative=surveyStartingPlan(orbit,fields);
  suggestedField=alternative.found?alternative.jobs[0].field:null;
  exampleNote.hidden=false;showSuggestion();
 },'example');
 const challenge=action(tools,'练习修复冲突',()=>{
  loadExample();if(!exampleFound){changed();return;}selected=1;displayField=jobs[1].field;
  jobs[1].start=jobs[0].start+30;
  const third=jobs[2],windows=fields.find(f=>f.id===third.field).visibility[third.tile].windows;
  let edge=0;
  for(const [begin,end] of [...windows,[SURVEY_PERIOD,SURVEY_PERIOD]]){
   if(begin-edge>third.duration+4){third.start=Math.ceil((edge+begin-third.duration)/2);break;}edge=end;
  }
  changed();
 },'challenge');
 const sync=action(tools,'用主场景时刻新建',async()=>{
  useCourse();const requested=courseRevision,epoch=sim.time;await orbitBar.refresh();
  if(disposed||courseRevision!==requested)return;
  stop();elapsed=0;exampleNote.hidden=true;suggestedField=null;newOrbit(epoch);pointing.dispose();pointing=createSurveyPointing(stage,assets.templates?.XT,orbit);translate();
 },'new-orbit');
 label(element('p',edit,'survey-note'),'时间从本圈起点计。青绿色段可以曝光；选择一行，轨道图就会显示该格在什么位置能拍。');
 const exampleNote=element('div',edit,'survey-note survey-example-note');exampleNote.hidden=true;
 const unavailable=element('span',exampleNote);unavailable.setAttribute('role','status');
 const alternativeButton=element('button',exampleNote);alternativeButton.type='button';alternativeButton.dataset.survey='alternative';
 alternativeButton.onclick=()=>{if(!running&&suggestedField&&loadExample(suggestedField,true))changed();};
 function showSuggestion(){
  unavailable.textContent=t('所选天区在本圈没有完整四格示例，已保留当前排程。');
  alternativeButton.hidden=!suggestedField;
  if(suggestedField)alternativeButton.textContent=t('改用可拍天区：{field}',{field:fieldName(suggestedField)});
 }
 const scheduleHost=element('div',edit,'survey-schedule-host');
 const editor=mountSurveyScheduleEditor(scheduleHost,{read:()=>({orbit,fields,jobs,plan,fieldId:displayField,selected,running}),apply:nextJobs=>{jobs=nextJobs;exampleFound=true;changed();}});
 const axis=element('div',edit,'survey-axis'),columns=element('div',axis,'survey-fields survey-columns');
 element('span',columns);for(const key of ['选择天区','选择拼图格','开始时间（秒）','曝光时长'])label(element('span',columns),key);
 const ticks=element('div',axis,'survey-ticks');
 for(const p of [0,1,2,3,4])element('span',ticks).textContent=elapsedText(Math.round(SURVEY_END*p/4));
 const rows=element('div',edit,'survey-rows'),rowViews=[];
 function selectJob(index){
  selected=index;
  rowViews.forEach(({row},i)=>row.dataset.selected=String(i===index));
 }
 function editStart(index,value){
  if(!Number.isFinite(value))return;
  jobs[index].start=Math.max(0,Math.min(SURVEY_END,Math.round(value)));selectJob(index);changed();
 }
 for(const [index] of jobs.entries()){
  const row=element('div',rows,'survey-job');row.dataset.job=String(index);
  const inputs=element('div',row,'survey-fields'),enabled=element('input',inputs);enabled.type='checkbox';enabled.dataset.survey='enabled';
  const field=element('select',inputs);field.dataset.survey='field';
  const tile=element('select',inputs);tile.dataset.survey='tile';SURVEY_TILES.forEach((v,i)=>tile.add(new Option(v,String(i))));
  const start=element('input',inputs);start.dataset.survey='start';start.type='number';start.min='0';start.max=String(SURVEY_END);start.step='1';
  const duration=element('select',inputs);duration.dataset.survey='duration';for(const v of [60,150,250])duration.add(new Option(v+' s',String(v)));
  const timeline=element('div',row,'survey-time'),track=element('div',timeline,'survey-track');
  const band=element('div',track),handle=element('button',track,'survey-block');handle.type='button';handle.dataset.survey='block';
  const cursor=element('div',track,'survey-cursor'),status=element('div',timeline,'survey-rowstatus');
  rowViews.push({row,enabled,field,tile,start,duration,track,band,handle,cursor,status});
  row.addEventListener('focusin',()=>{selectJob(index);editor.refresh();paint();});
  enabled.onchange=()=>{jobs[index].enabled=enabled.checked;selectJob(index);changed();};
  field.onchange=()=>{jobs[index].field=field.value;selectJob(index);changed();};
  tile.onchange=()=>{jobs[index].tile=Number(tile.value);selectJob(index);changed();};
  duration.onchange=()=>{jobs[index].duration=Number(duration.value);selectJob(index);changed();};
  start.onchange=()=>{if(start.value===''){start.value=String(jobs[index].start);return;}editStart(index,start.valueAsNumber);};
  handle.onkeydown=e=>{
   let value=jobs[index].start;const step=e.shiftKey?60:10;
   if(e.key==='ArrowLeft')value-=step;else if(e.key==='ArrowRight')value+=step;
   else if(e.key==='Home')value=0;else if(e.key==='End')value=SURVEY_END-jobs[index].duration;else return;
   e.preventDefault();editStart(index,value);
  };
  let drag=null;
  const trackTime=e=>{const box=track.getBoundingClientRect();return (e.clientX-box.left)/box.width*SURVEY_PERIOD;};
  track.onpointerdown=e=>{
   if(running||!jobs[index].enabled||e.button!==0||drag)return;e.preventDefault();
   const instant=trackTime(e);drag={id:e.pointerId,offset:e.target===handle?instant-jobs[index].start:jobs[index].duration/2};
   track.setPointerCapture(e.pointerId);handle.focus({preventScroll:true});editStart(index,instant-drag.offset);
  };
  track.onpointermove=e=>{if(drag?.id===e.pointerId)editStart(index,trackTime(e)-drag.offset);};
  track.onpointerup=track.onpointercancel=track.onlostpointercapture=()=>{drag=null;};
 }
 const planMessage=element('p',edit,'survey-planmsg');planMessage.dataset.survey='plan-status';planMessage.setAttribute('role','status');
 const rules=element('details',root,'survey-rules');label(element('summary',rules),'教学轨道与观测规则');
 label(element('p',rules),'自当前主场景时刻另开一圈，按天宫轨道面近似 400 km 圆轨道。太阳方向在本圈固定，按球形地球检查整段曝光。');
 label(element('p',rules),'教学阈值：全视场避开太阳 50°，距地球边缘至少 5°。转向按 0.5°/s，另留 8 秒稳定。每格宽 3°；成片只拼接本次已完成的模拟曝光。');
 const epochText=element('p',rules);
 function changed(){
  useCourse();stop();exampleNote.hidden=true;suggestedField=null;elapsed=0;plan=evaluateSurveyPlan(orbit,fields,jobs);refreshEditor();paint();
 }
 function refreshEditor(){
  for(const [index,v] of rowViews.entries()){
   const job=jobs[index],field=fields.find(f=>f.id===job.field),entry=plan.order.find(j=>j.index===index);
   const issues=entry?.issues||[],enabled=job.enabled,highlight=String(index===selected);
   v.row.dataset.selected=highlight;v.row.dataset.error=String(issues.length>0);v.row.dataset.disabled=String(!enabled);
   v.enabled.checked=enabled;v.enabled.disabled=running;
   v.field.value=job.field;v.tile.value=String(job.tile);v.start.value=String(job.start);v.duration.value=String(job.duration);
   for(const input of [v.field,v.tile,v.start,v.duration,v.handle])input.disabled=running||!enabled;
   v.band.replaceChildren();
   for(const [lo,hi] of field.visibility[job.tile].windows){
    const window=element('i',v.band,'survey-window');window.style.left=lo/SURVEY_PERIOD*100+'%';window.style.width=(hi-lo)/SURVEY_PERIOD*100+'%';
   }
   v.handle.style.left='min('+job.start/SURVEY_PERIOD*100+'%, calc(100% - 12px))';v.handle.style.width=job.duration/SURVEY_PERIOD*100+'%';
   v.handle.dataset.error=String(issues.length>0);v.handle.textContent=SURVEY_TILES[job.tile];
   v.handle.setAttribute('role','slider');v.handle.setAttribute('aria-valuemin','0');v.handle.setAttribute('aria-valuemax',String(SURVEY_END));
   v.handle.setAttribute('aria-valuenow',String(job.start));v.handle.setAttribute('aria-valuetext',elapsedText(job.start));
   v.handle.setAttribute('aria-label',t('移动曝光 {index}，开始 {time}',{index:index+1,time:elapsedText(job.start)}));
   editor.describeRow(v.status,{job,entry,field});
  }
  displaySelect.value=displayField;
  const conflicts=plan.order.filter(j=>j.issues.length).length;
  planMessage.dataset.error=String(!plan.valid);
  planMessage.textContent=plan.valid?t('可执行：已安排 {n} 次曝光。',{n:plan.order.length}):plan.order.length?t('有 {n} 项曝光需要调整。',{n:conflicts}):t(exampleFound?'至少启用一次曝光。':'此圈没有完整的四格示例，请手动选择天区和曝光。');
  example.disabled=challenge.disabled=sync.disabled=displaySelect.disabled=running;play.disabled=!plan.valid;editor.refresh();
 }
 function paint(){
  const state=surveyPlayback(orbit,plan,elapsed),field=fields.find(f=>f.id===displayField);
  const covered=new Set(state.completed.filter(j=>j.field===field.id).map(j=>j.tile));
  const current=state.current?.field===field.id?state.current:null;
  const side=Math.min(mosaic.clientWidth,mosaic.clientHeight)+'px';
  if(tileGrid.style.width!==side)tileGrid.style.width=tileGrid.style.height=side;
  pointing.draw(state);product.update({field,completed:state.completed,current,fraction:state.fraction||0,epoch:orbit.epoch});
  const chosen=jobs[selected],mapField=fields.find(f=>f.id===chosen.field);
  send.textContent=t('到主场景补拍 {tile} 格',{tile:SURVEY_TILES[chosen.tile]});
  overview.update({orbit,field:mapField,tile:chosen.tile,elapsed,plan,pointing:state.direction});
  phaseLabel.textContent=t(phaseNames[state.phase]);phaseLabel.dataset.phase=state.phase;
  const ra=(Math.atan2(state.direction[1],state.direction[0])/Math.PI*180+360)%360,dec=Math.asin(Math.max(-1,Math.min(1,state.direction[2])))/Math.PI*180;
  directionText.textContent='RA '+ra.toFixed(1)+'°  Dec '+dec.toFixed(1)+'°';
  const active=state.current||state.next;
  targetText.textContent=active?fieldName(active.field)+' '+SURVEY_TILES[active.tile]+(state.current?' · '+Math.round(state.fraction*100)+'%':''):'';
  clock.textContent=clockText(orbit.epoch+elapsed*1000).slice(-8)+' UTC+8';
  elapsedOutput.value=elapsedText(elapsed)+' / '+elapsedText(SURVEY_END);
  scrub.value=String(Math.floor(elapsed));scrub.disabled=false;
  for(const v of rowViews)v.cursor.style.left=elapsed/SURVEY_PERIOD*100+'%';
  mosaicScore.textContent=t('已覆盖 {n}/4 格',{n:covered.size});
  centerText.textContent='RA '+field.ra.toFixed(1)+'°  Dec '+field.dec.toFixed(1)+'°';
  for(const [i,{button,mark}] of tileButtons.entries()){
   const observed=covered.has(i),exposing=current?.tile===i,selectedTile=jobs[selected].field===field.id&&jobs[selected].tile===i;
   button.dataset.state=observed?'covered':exposing?'exposure':'unseen';button.dataset.selected=String(selectedTile);
   button.setAttribute('aria-pressed',String(selectedTile));button.disabled=running;
   const status=t(observed?'已覆盖':exposing?'正在曝光':'尚未曝光');
   const assigned=jobs.findIndex(j=>j.field===field.id&&j.tile===i);
   button.setAttribute('aria-label',t(assigned>=0?'查看 {tile} 格的第 {index} 次曝光，{status}':'将第 {index} 次曝光指向 {tile}，{status}',{index:(assigned>=0?assigned:selected)+1,tile:SURVEY_TILES[i],status}));
   mark.textContent=observed?'✓':exposing?Math.round(state.fraction*100)+'%':'';
  }
  next.disabled=!plan.valid||!plan.order.some(j=>j.start>elapsed+.05);
  finish.disabled=!plan.valid||!plan.order.some(j=>elapsed<j.end);
  play.textContent=t(running?'暂停执行':elapsed>=SURVEY_END?'再执行一圈':elapsed>0?'继续执行':'执行一圈');
 }
 function tick(now){
  if(!running||!visible||document.hidden){stop();return;}
  elapsed=Math.min(SURVEY_END,elapsed+Math.max(0,now-lastWall)/1000*Number(speed.value));lastWall=now;
  if(elapsed>=SURVEY_END){stop();refreshEditor();paint();return;}
  if(now-paintWall>40){paint();paintWall=now;}frame=requestAnimationFrame(tick);
 }
 function stop(){running=false;if(frame)cancelAnimationFrame(frame);frame=0;}
 function toggleRun(){
  if(!visible||!plan.valid)return;
  useCourse();if(running){stop();refreshEditor();paint();return;}
  if(elapsed>=SURVEY_END)elapsed=0;
  running=true;lastWall=performance.now();refreshEditor();paint();frame=requestAnimationFrame(tick);
 }
 function seek(value){
  if(!Number.isFinite(value))return;useCourse();stop();elapsed=Math.max(0,Math.min(SURVEY_END,Math.round(value)));refreshEditor();paint();
 }
 scrub.oninput=()=>seek(Number(scrub.value));
 displaySelect.onchange=()=>{if(running)return;displayField=displaySelect.value;jobs=retargetSurveyJobs(jobs,displayField);changed();};
 function translate(){
  for(const fn of labels)fn();
  if(!exampleNote.hidden)showSuggestion();
  for(const select of [displaySelect,...rowViews.map(v=>v.field)]){
   select.replaceChildren(...fields.map(f=>new Option(t(f.name),f.id)));
  }
  displaySelect.setAttribute('aria-label',t('四格曝光共同天区'));scrub.setAttribute('aria-label',t('本圈执行时刻'));
  const names=['启用曝光','选择天区','选择拼图格','开始时间（秒）','曝光时长'];
  for(const [i,v] of rowViews.entries())for(const [j,el] of [v.enabled,v.field,v.tile,v.start,v.duration].entries()){
   el.setAttribute('aria-label',t('曝光 {index}：{label}',{index:i+1,label:t(names[j])}));el.title=t(names[j]);
  }
  epochText.textContent=t('本圈起点：{time} UTC+8',{time:clockText(orbit.epoch)});
  referenceNote.textContent=referenceData?t('本圈取自 {start} 至 {end}（UTC+8）的星历。点「用主场景时刻新建」可采用更新后的星历。',{
   start:clockText(referenceData.rows[0][0]).slice(0,16),end:clockText(referenceData.rows.at(-1)[0]).slice(0,16)
  }):t('本圈采用教学默认轨道面。选好天宫星历后点「用主场景时刻新建」。');
  if(restoredSource)referenceNote.textContent=t('已恢复记录使用的轨道：{source}',{source:restoredSource});
  refreshEditor();paint();
 }
 function getObservationRecord(){
  const clock=orbit.epoch+Math.round(elapsed*1000);
  const source=referenceData?.source||t('教学默认圆轨道');
  return {record:{kind:'survey',time:clock,fieldId:displayField,skyLayer:product.mode,epoch:orbit.epoch,elapsed,selected,jobs:jobs.map(job=>({...job})),source,
   course:{radial:[...orbit.radial],along:[...orbit.along],sun:[...orbit.sun],park:[...orbit.park]}},orbit:referenceData};
 }
 function restoreObservationRecord(record,{orbit:data}={}){
  if(!record||record.kind!=='survey'||!Number.isFinite(record.epoch)||!Array.isArray(record.jobs)||record.jobs.length!==4)return false;
  if(record.jobs.some(job=>!job||!Number.isInteger(job.tile)||!SURVEY_TILES[job.tile]||!SURVEY_FIELDS.some(f=>f.id===job.field)||!Number.isFinite(job.start)||!Number.isFinite(job.duration)))return false;
  useCourse();stop();newOrbit(record.epoch,data||null);
  if(!referenceData&&record.course&&['radial','along','sun','park'].every(k=>Array.isArray(record.course[k])&&record.course[k].length===3&&record.course[k].every(Number.isFinite))){
   orbit={...orbit,...record.course};fields=surveyFieldsForOrbit(orbit);
  }
  jobs=record.jobs.map(job=>({...job}));selected=Math.max(0,Math.min(3,Math.floor(record.selected)||0));
  displayField=fields.find(f=>f.id===record.fieldId)?.id||jobs[selected].field;elapsed=Math.max(0,Math.min(SURVEY_END,Number(record.elapsed)||0));
  plan=evaluateSurveyPlan(orbit,fields,jobs);restoredSource=record.source||referenceData?.source||t('教学默认圆轨道');
  pointing.dispose();pointing=createSurveyPointing(stage,assets.templates?.XT,orbit);exampleNote.hidden=true;translate();product.setMode(record.skyLayer??'dense');return true;
 }
 const wall=mountSurveyLiveWall(root,sim,observeTile);
 const onHidden=()=>{if(document.hidden){stop();refreshEditor();paint();}};
 const observer=new ResizeObserver(()=>{if(visible)paint();});observer.observe(stage);observer.observe(mosaic);
 const offLanguage=onLanguageChange(translate);document.addEventListener('visibilitychange',onHidden);
 translate();orbitBar.refresh().finally(()=>{acceptInitialCache=false;});
 return {getObservationRecord,restoreObservationRecord,showLivePhotos(fieldId,recordId){wall.show(fieldId,recordId);},pause(){wall.pause();if(running){stop();refreshEditor();paint();}visible=false;product.pause();},resume(){visible=true;wall.resume(displayField);product.resume();orbitBar.refresh();refreshEditor();paint();},
  dispose(){disposed=true;visible=false;stop();wall.dispose();orbitBar.dispose();editor.dispose();overview.dispose();product.dispose();observer.disconnect();offLanguage();document.removeEventListener('visibilitychange',onHidden);pointing.dispose();root.remove();}};
}
