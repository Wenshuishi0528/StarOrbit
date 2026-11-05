import {getLanguage,onLanguageChange,t} from './i18n.js';
import {dot} from './orbit.js';
import {surveyVisibility,SURVEY_END,SURVEY_TILES} from './survey-lab-math.js';
import {createSurveyMapPainter} from './survey-orbit-overview-drawing.js';
import {surveyTimeAtMapPoint,surveyWindowAt} from './survey-orbit-overview-math.js';

const kinds={clear:'此处可曝光',earth:'地球遮挡或边缘余量不足',sun:'接近太阳'};
const legend=[['clear','可曝光弧段'],['earth','地球或边缘限制'],['sun','太阳避让'],['actual','望远镜指向'],['target','所选视场方向'],['planned','已排曝光']];
const clock=sec=>{const value=Math.max(0,Math.floor(sec));return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');};
const style=`
.survey-overview{container-type:inline-size;min-width:0;padding:11px;border:1px solid #2d475c;border-radius:10px;background:#0c1c2b;color:#dcecf3;font-size:13px}
.survey-ov-head,.survey-ov-controls,.survey-ov-legend,.survey-ov-window-list,.survey-ov-meta{display:flex;align-items:center;gap:5px 9px;flex-wrap:wrap}
.survey-ov-head{justify-content:space-between;margin-bottom:8px}.survey-ov-head h4,.survey-ov-side h5,.survey-ov-side p{margin:0}
.survey-ov-head h4{font-size:14px}.survey-ov-controls button,.survey-ov-window-list button{font:inherit;font-size:12px;border:1px solid #345267;background:#102434;color:#c7dfe8;border-radius:5px;padding:4px 9px;cursor:pointer}
.survey-ov-controls button[aria-pressed=true]{border-color:#7cbebe;background:#1c414d;color:#ccf5e8}.survey-overview :focus-visible{outline:2px solid #8eeed2;outline-offset:2px}
.survey-ov-work{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(165px,.7fr);gap:12px}
.survey-ov-canvas{display:block;width:100%;height:clamp(225px,27vh,330px);border:1px solid #2c485c;border-radius:6px;touch-action:none;cursor:crosshair}
.survey-ov-side{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:6px;justify-content:center}
.survey-ov-side h5{font-size:14px}.survey-ov-status{border-left:3px solid;padding:3px 7px;background:#102638;font-size:12px}
.survey-ov-status[data-kind=clear]{border-color:#76dfbb;color:#a3edcc}.survey-ov-status[data-kind=earth]{border-color:#eb9486;color:#f2b0a5}.survey-ov-status[data-kind=sun]{border-color:#e9bd68;color:#f2d299}
.survey-ov-side small,.survey-ov-help{font-size:11px;color:#9db4c3}.survey-ov-window-list button{font:11px ui-monospace,monospace;white-space:nowrap}.survey-ov-window-list button[aria-current=true]{border-color:#87c5b8}
.survey-ov-legend{font-size:11px;color:#b8cbd6;gap:5px 13px;margin-top:8px}.survey-ov-legend span{display:inline-flex;align-items:center;gap:5px}
.survey-ov-legend i{display:block;width:17px;height:0;border-top:3px solid #76dfbb}.survey-ov-legend [data-kind=earth] i{border-color:#eb9486}.survey-ov-legend [data-kind=sun] i{border-color:#e9bd68}
.survey-ov-legend [data-kind=actual] i{border-width:2px;border-color:#e5f5ff}.survey-ov-legend [data-kind=target] i{border-top:2px dashed #d3a7f1}.survey-ov-legend [data-kind=planned] i{border-top:3px double #e3f3ff}
.survey-ov-help{margin:6px 0 0!important;line-height:1.5}
@container(max-width:620px){.survey-ov-work{grid-template-columns:1fr;gap:7px}.survey-ov-canvas{height:245px}.survey-ov-side{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:4px 7px}.survey-ov-window-list{grid-column:1/-1}}
`;

export function mountSurveyOrbitOverview(host,{sim,onSeek,earthImage}={}){
 const root=document.createElement('section');root.className='survey-overview';root.dataset.testid='survey-orbit-overview';host.append(root);
 const node=(tag,parent,cls)=>{const el=document.createElement(tag);if(cls)el.className=cls;parent.append(el);return el;};
 const sheet=node('style',root);sheet.textContent=style;
 const head=node('div',root,'survey-ov-head'),title=node('h4',head),tools=node('div',head,'survey-ov-controls');
 const angleButtons=[['normal','俯视轨道面'],['oblique','斜视轨道'],['equatorial','赤道正视']].map(([mode,key])=>{
  const button=node('button',tools);button.type='button';button.dataset.orbitView=mode;
  button.onclick=()=>{equatorial=mode==='equatorial';yaw=0;tilt=mode==='oblique'?52:0;refresh();};return {button,key};
 });
 const work=node('div',root,'survey-ov-work'),canvas=node('canvas',work,'survey-ov-canvas');canvas.tabIndex=0;
 canvas.dataset.survey='orbit-map';canvas.setAttribute('role','slider');canvas.setAttribute('aria-valuemin','0');canvas.setAttribute('aria-valuemax',String(SURVEY_END));
 const side=node('div',work,'survey-ov-side'),targetName=node('h5',side),status=node('p',side,'survey-ov-status'),meta=node('small',side,'survey-ov-meta');
 const aimReadout=node('small',side),windowsTitle=node('small',side),windowList=node('div',side,'survey-ov-window-list');
 const key=node('div',root,'survey-ov-legend');const labels=legend.map(([id,keyName])=>{const span=node('span',key);span.dataset.kind=id;node('i',span);return {label:node('span',span),key:keyName};});
 const help=node('p',root,'survey-ov-help');
 const painter=createSurveyMapPainter(canvas,{sim,earthImage,onAsset:()=>refresh()});
 let model=null,yaw=0,tilt=0,equatorial=false,projection=null,winKey='',drag=null,disposed=false;
 function update(data){
  if(disposed||!data?.orbit)return;
  const tile=data.tile??0,field=data.field,target=data.target,direction=target?.direction||field?.tiles?.[tile];
  if(!direction)return;
  const visibility=target?.visibility||field?.visibility?.[tile]||surveyVisibility(data.orbit,direction);
  const fieldId=target?.field??field?.id,chosenTile=target?.tile??tile;
  const jobs=target?.jobs??data.plan?.order?.filter(j=>j.field===fieldId&&j.tile===chosenTile)??[];
  model={orbit:data.orbit,elapsed:Math.max(0,Math.min(SURVEY_END,data.elapsed||0)),pointing:data.pointing?.direction||data.pointing||data.orbit.park,
   direction,visibility,fieldName:field?.name,tile:chosenTile,targetLabel:target?.label,jobs};
  refresh();
 }
 function refresh(){
  if(disposed||!model)return;
  const {visibility,elapsed,orbit,direction}=model;
  projection=painter.paint(model,yaw,tilt,equatorial);
  const state=surveyWindowAt(visibility,elapsed);status.dataset.kind=state;
  status.textContent=t(kinds[state]);targetName.textContent=model.targetLabel||((model.fieldName?t(model.fieldName):'')+' '+(SURVEY_TILES[model.tile]||'')).trim();
  const angle=Math.acos(Math.max(-1,Math.min(1,dot(direction,orbit.sun))))*180/Math.PI;
  meta.textContent=t('本圈已过 {time}',{time:clock(elapsed)})+' · '+t('距太阳 {angle}°',{angle:angle.toFixed(1)});
  const separation=Math.acos(Math.max(-1,Math.min(1,dot(direction,model.pointing))))*180/Math.PI;
  aimReadout.textContent=t('指向与视场相差 {angle}°',{angle:separation.toFixed(1)});
  canvas.setAttribute('aria-valuenow',String(Math.floor(elapsed)));canvas.setAttribute('aria-valuetext',clock(elapsed)+' · '+status.textContent);
  root.dataset.windowState=state;root.dataset.orbitTime=String(Math.floor(elapsed));
  const activeView=equatorial?'equatorial':Math.abs(tilt)<.1?'normal':'oblique';
  for(const {button} of angleButtons)button.setAttribute('aria-pressed',String(button.dataset.orbitView===activeView));
  help.textContent=t(equatorial?'沿赤道面正视地球，北方朝上，水平虚线是赤道。点轨道定位时刻，水平拖动可绕地球转动。':'点轨道定位时刻，拖动空白处旋转。整次曝光须落在同一可用弧段内。轨道半径按比例绘制，图标和箭头作示意，背面轨迹用虚线。');
  const windowsKey=getLanguage()+'|'+visibility.windows.map(pair=>pair.join(':')).join(',');const buttons=windowList.children;
  if(winKey!==windowsKey){
   winKey=windowsKey;windowList.replaceChildren();
   for(const [start,end] of visibility.windows){
    const b=node('button',windowList);b.type='button';b.textContent=clock(Math.ceil(start))+'–'+clock(Math.floor(end));b.dataset.start=String(start);b.dataset.end=String(end);
    b.setAttribute('aria-label',t('定位到曝光窗口 {time}',{time:b.textContent}));b.onclick=()=>onSeek?.(Math.min(SURVEY_END,Math.ceil(start)));
   }
   if(!buttons.length)node('small',windowList).textContent=t('本圈没有可用窗口');
  }
  for(const b of windowList.querySelectorAll('button'))b.setAttribute('aria-current',String(elapsed>=Number(b.dataset.start)&&elapsed<=Number(b.dataset.end)));
 }
 function translate(){
  title.textContent=t('地球轨道总览');windowsTitle.textContent=t('可用曝光窗口');
  canvas.setAttribute('aria-label',t('巡天在教学轨道上的位置与曝光窗口'));
  for(const item of [...angleButtons,...labels])(item.button||item.label).textContent=t(item.key);
  winKey='';refresh();
 }
 function local(e){const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};}
 function timeAt(e,tolerance){
  if(!projection||!model)return null;
  const {layout,view}=projection,p=local(e),x=(p.x-layout.x)/layout.radius,y=(layout.y-p.y)/layout.radius;
  return surveyTimeAtMapPoint(x,y,view,tolerance/layout.radius,model.elapsed);
 }
 canvas.onpointerdown=e=>{
  if(!model||drag||e.button!==0)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
  const sec=timeAt(e,Math.min(17,projection?.layout.radius*.17||17)),p=local(e);
  drag={id:e.pointerId,kind:sec===null?'rotate':'seek',x:p.x,y:p.y,yaw,tilt};
  if(sec!==null)onSeek?.(sec);
 };
 canvas.onpointermove=e=>{
  if(!drag||drag.id!==e.pointerId)return;
  if(drag.kind==='seek'){const sec=timeAt(e,Infinity);if(sec!==null)onSeek?.(sec);return;}
  const p=local(e);yaw=(drag.yaw+(p.x-drag.x)*.45)%360;
  if(!equatorial)tilt=Math.max(-67,Math.min(67,drag.tilt+(p.y-drag.y)*.39));refresh();
 };
 canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{drag=null;};
 canvas.onkeydown=e=>{
  if(!model)return;
  const step=e.shiftKey?300:60;
  const sec={ArrowLeft:model.elapsed-step,ArrowRight:model.elapsed+step,Home:0,End:SURVEY_END}[e.key];
  if(sec==null)return;e.preventDefault();onSeek?.(Math.max(0,Math.min(SURVEY_END,Math.round(sec))));
 };
 const observer=new ResizeObserver(refresh);observer.observe(canvas);const unsubscribe=onLanguageChange(translate);translate();
 return {update,dispose(){disposed=true;drag=null;observer.disconnect();unsubscribe();painter.dispose();root.remove();}};
}
