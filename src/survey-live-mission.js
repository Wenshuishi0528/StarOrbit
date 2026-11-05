import {t} from './i18n.js';
import {SURVEY_TILES} from './survey-lab-math.js';
import {surveyTarget} from './survey-live-geometry.js';
import {mountSurveyOverlay} from './survey-live-overlay.js';

export function mountSurveyMission(sim,{aimTile,clearTarget,getFrame,instrument,refresh}){
 const $=id=>document.getElementById(id),region=$('xtSurveyMission'),overlay=mountSurveyOverlay($('xtSurveyOverlay'));
 let target=null,busy=false,epoch=0,note='',params={};
 for(const [i,name] of SURVEY_TILES.entries()){
  const button=document.createElement('button');button.type='button';button.textContent=name;
  button.onclick=()=>{if(target&&!busy)select(target.fieldId,i);};$('xtSurveyTiles').append(button);
 }
 function message(key='',values={}){note=key;params=values;sync();}
 function select(fieldId,tile){const next=surveyTarget(fieldId,tile);if(!next)return false;
  target=next;epoch++;note='金色框是计划天区。拍照使用主场景当前时刻和实际镜口。';params={};aimTile(next);
  overlay.reset();sync();return true;
 }
 function clear(){target=null;epoch++;note='';params={};overlay.reset();sync();}
 function sync(available=true){
  region.hidden=!target;if(!target)return;
  $('xtSurveyName').textContent=t('在轨补拍 · {field} {tile}',{field:t(target.field.name),tile:target.letter});
  for(const [i,b] of [...$('xtSurveyTiles').children].entries()){b.setAttribute('aria-pressed',String(i===target.tile));b.disabled=busy;}
  $('xtSurveyCapture').disabled=busy||!available;$('xtSurveyAim').disabled=busy||!available;$('xtSurveyNote').textContent=note?t(note,params):'';
 }
 async function shoot(){
  if(!target||busy)return;const requested=target,token=epoch;let meta=null,data=null;
  const atShutter=()=>token===epoch&&target===requested?getFrame():null;
  const initial=atShutter();if(!initial)return;
  busy=true;message('正在拍摄并保存原图…');
  try{
   const {renderer,width}=instrument();
   const image=await renderer.capture(initial,{width,surveyTarget:requested,atShutter,onExposure:(f,{center,coverage,width,height})=>{
    data=sim.data;
    meta={kind:'survey-photo',missionId:'tiangong',fieldId:requested.fieldId,tile:requested.tile,time:f.q.t,
     axes:Object.fromEntries(Object.entries(f.axes).map(([k,v])=>[k,[...v]])),eyeKm:[...f.eyeKm],fovY:f.fovY,apertureMm:f.apertureMm,
     ev:Math.log2(f.exposure),width,height,center,coverage};
   }});
   if(!meta||meta.coverage.outside>=.99999){if(token===epoch)message('目标格在画面外，请先对准或拉宽视场。');return;}
   await sim.observations.save(meta,{image,orbit:data});
   if(token===epoch){
    message(sim.observations.persistent?'已保存 {tile} 格 · 可见天区约 {percent}%':'记录仅保留在本次会话',{tile:requested.letter,percent:Math.round(100*meta.coverage.sky)});
   }
  }catch(e){if(token===epoch)message('在轨照片未能保存：{error}',{error:e.message});}
  finally{busy=false;refresh();}
 }
 $('xtSurveyCapture').onclick=shoot;$('xtSurveyAim').onclick=()=>{if(target)aimTile(target);};
 $('xtSurveyWall').onclick=()=>{if(target)sim.flightLab.openSurveyPhotos({fieldId:target.fieldId});};
 $('xtSurveyExit').onclick=()=>{clear();clearTarget();};
 return {select,clear,sync,get target(){return target;},get busy(){return busy;},
  paint(axes,fovY,sky,available){overlay.paint(axes,fovY,sky?target:null,sky&&available&&$('xtSkyCompass').checked);sync(available);}};
}
