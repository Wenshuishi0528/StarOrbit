import {t,onLanguageChange,getLanguage} from './i18n.js';
import {tileCoverage} from './survey-sky-product-math.js';
import {loadSurveyGalaxy} from './survey-sky-product-galaxy.js';
import {createSkyPainter,drawPlanner,makeSurveyPlate,modeNames} from './survey-sky-product-draw.js';

const css=`.survey-product{display:grid;gap:5px;margin-top:8px;color:#c4d6e2}.survey-product-tools{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px}.survey-product-tools label{display:flex;align-items:center;gap:6px}.survey-product-tools select{min-width:0;max-width:100%;padding:4px 6px!important}.survey-product-tools button{padding:5px 9px}.survey-product small{color:#a6bacb;line-height:1.45}.survey-product [data-sky-product=count]{color:#b3dadd}.survey-product-dialog{width:min(860px,96vw);height:min(91dvh,1050px);max-width:none;max-height:none;padding:10px 12px;border:1px solid #486477;border-radius:10px;background:#0b1826;color:#e3edf4}.survey-product-dialog[open]{display:flex;flex-direction:column;gap:6px}.survey-product-dialog::backdrop{background:#02070ece}.survey-product-dialog .survey-product-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:5px 12px}.survey-product-dialog .survey-product-head strong{flex:1}.survey-product-dialog .survey-plate-stage{flex:1;min-height:0;display:grid;grid-template: minmax(0,1fr) / minmax(0,1fr);place-items:center;background:#06101a;overflow:hidden}.survey-product-dialog canvas{display:block;max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain}.survey-product-dialog[data-zoom=actual] .survey-plate-stage{display:block;overflow:auto;place-items:start;place-content:start}.survey-product-dialog[data-zoom=actual] canvas{width:auto;height:auto;max-width:none;max-height:none}.survey-product [hidden]{display:none!important}@media(max-width:640px){.survey-product-tools{gap:5px}.survey-product-tools label{width:100%}.survey-product-tools select{flex:1}.survey-product-tools button{font-size:12px}.survey-product-dialog{width:100vw;height:96dvh;border-radius:0}.survey-product-dialog .survey-product-head strong{flex:1 0 100%}}`;

export function mountSurveySkyProduct(host,skyCanvas,sim){
  const root=document.createElement('section');root.className='survey-product';host.append(root);
  root.innerHTML=`<style>${css}</style><div class="survey-product-tools"><label><span data-sky-label="天空图层"></span><select data-sky-product="mode"></select></label>
    <button type="button" data-sky-product="open" data-sky-label="查看成片"></button><button type="button" data-sky-product="download" data-sky-label="下载拼图 PNG"></button>
    <button type="button" data-sky-product="retry" data-sky-label="重试银河图层" hidden></button></div>
    <small data-sky-product="count"></small><small data-sky-product="description"></small><small data-sky-product="status" role="status" aria-live="polite"></small>
    <dialog class="survey-product-dialog" data-sky-product="dialog"><div class="survey-product-head"><strong data-sky-label="巡天模拟成片"></strong><button type="button" data-sky-product="zoom" aria-pressed="false"></button><button type="button" data-sky-product="dialog-download" data-sky-label="下载拼图 PNG"></button><button type="button" data-sky-product="close" data-sky-label="关闭大图"></button></div><div class="survey-plate-stage" data-sky-product="stage" tabindex="0"></div></dialog>`;
  const el=key=>root.querySelector(`[data-sky-product="${key}"]`),painter=createSkyPainter(sim.environment.stars.geometry),galaxies=new Map();
  let model=null,mode='galaxy',alive=true,visible=true,galaxyRequest=null,galaxyError=null,plate=null,plateKey='',plannerKey='',downloadToken=0,encoding=false;
  let statusKey='',statusParams={};
  function status(key='',params={}){statusKey=key;statusParams=params;el('status').textContent=key?t(key,params):'';}
  function idleStatus(){status(model?.count?'':'完成第一格曝光后即可查看成片；未拍的格会明确留空。');}
  function cancelSky(){galaxyRequest?.controller.abort();galaxyRequest=null;}
  function invalidatePhoto(cancelExport=false){plate=null;plateKey='';if(cancelExport){downloadToken++;encoding=false;}}
  function galaxy(){return model&&galaxies.get(model.field.id);}
  function canExport(){return model?.count>0&&(mode!=='galaxy'||!!galaxy());}
  function syncControls(){
    const enabled=canExport();el('open').disabled=!enabled;el('download').disabled=el('dialog-download').disabled=!enabled||encoding;
    el('retry').hidden=!(mode==='galaxy'&&galaxyError===model?.field.id);
  }
  function refreshInfo(){
    if(!model)return;
    const count=painter.records(model.field),level=galaxy()?.level;
    const stars=mode==='catalog'?count.base.length:count.deep.length;
    el('count').textContent=t('本天区有 {n} 颗目录星 · 北上，东左',{n:stars});
    const note=mode==='catalog'?'XHIP 亮星，全天目录包含 41,411 颗恒星。':mode==='dense'?'内置亮星叠加 Tycho-2 实测星点，保留至 VT 11.5 等。':
      level?'NASA 银河全天源图宽 16K，本次采样 {level}K 档，每个立方体面 {face} 像素；目录星独立绘制。':'NASA 银河 16K 为全天背景图，目录星独立绘制。';
    el('description').textContent=t(note,{level,face:level*256});
  }
  function ensureGalaxy(){
    if(!visible||mode!=='galaxy'||!model||galaxy()||galaxyError===model.field.id||galaxyRequest?.id===model.field.id)return;
    cancelSky();const field=model.field,controller=new AbortController(),request={id:field.id,controller};galaxyRequest=request;
    status('正在按当前天区载入银河背景…');syncControls();
    loadSurveyGalaxy(field,sim.environment,controller.signal).then(image=>{
      if(!alive||controller.signal.aborted||galaxyRequest!==request)return;
      if(galaxies.size>=3)galaxies.delete(galaxies.keys().next().value);galaxies.set(field.id,image);
      galaxyRequest=null;invalidatePhoto();plannerKey='';idleStatus();refreshInfo();paint();
    }).catch(error=>{
      if(!alive||controller.signal.aborted||galaxyRequest!==request)return;
      galaxyRequest=null;galaxyError=field.id;status('银河图源暂不可用。当前显示高密星点，可重试或改用高密星点导出。');syncControls();
    });
  }
  function result(){
    if(!model||!canExport())return null;
    const key=[model.key,mode,galaxy()?.level,getLanguage()].join('|');
    if(key!==plateKey){
      const layer=painter.layer(model.field,mode,1320,galaxy());
      plate=makeSurveyPlate({...model,mode,layer,galaxy:galaxy()});plateKey=key;
      plate.dataset.skyProduct='plate';plate.setAttribute('role','img');plate.setAttribute('aria-label',t('巡天天区模拟成片 · 已覆盖 {n}/4 格',{n:model.count}));
    }
    return plate;
  }
  function paint(){
    if(!model||!alive||!visible)return;
    const {field,coverage,current,fraction}=model,side=Math.min(skyCanvas.clientWidth,skyCanvas.clientHeight);
    const size=Math.max(96,Math.round(side*Math.min(2,window.devicePixelRatio||1))),layer=painter.layer(field,mode,size,galaxy());
    const key=[model.key,mode,galaxy()?.level,current,Math.round(fraction*100),skyCanvas.clientWidth,skyCanvas.clientHeight,size].join('|');
    if(key!==plannerKey){drawPlanner(skyCanvas,layer,coverage,current,fraction);plannerKey=key;}
    syncControls();
    if(el('dialog').open){
      try{const out=result();if(out&&el('stage').firstChild!==out)el('stage').replaceChildren(out);else if(!out)el('dialog').close();}
      catch{el('dialog').close();status('拼图 PNG 生成失败，请重试。');}
    }
  }
  function update({field,completed=[],current=null,fraction=0,epoch}){
    const coverage=tileCoverage(field,completed),count=coverage.filter(x=>x.count).length;
    const key=[field.id,epoch,...coverage.map(x=>[x.count,x.seconds,x.first,x.last].join('/'))].join('|');
    const fieldChanged=model?.field.id!==field.id,changed=model?.key!==key;
    if(fieldChanged){cancelSky();galaxyError=null;}
    if(changed)invalidatePhoto(fieldChanged||model?.epoch!==epoch);
    model={field,coverage,count,key,current:current?.field===field.id?current.tile:-1,fraction,epoch};
    if(changed){refreshInfo();if(!galaxyRequest&&!galaxyError)idleStatus();}
    if(visible){ensureGalaxy();paint();}
  }
  async function download(){
    if(!canExport()||encoding)return;const token=++downloadToken,fieldId=model.field.id,count=model.count,epoch=model.epoch,exportMode=mode;
    encoding=true;syncControls();status('正在生成拼图 PNG…');
    try{
      const out=result(),blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));
      if(!alive||!visible||token!==downloadToken)return;
      if(!blob)throw Error('PNG');
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
      a.download=`StarOrbit-Xuntian-${fieldId}-${exportMode}-${count}of4-${new Date(epoch).toISOString().replaceAll(':','-')}.png`;
      a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status('拼图 PNG 已导出 · 已覆盖 {n}/4 格',{n:count});
    }catch{if(alive&&token===downloadToken)status('拼图 PNG 生成失败，请重试。');}
    finally{if(alive&&token===downloadToken){encoding=false;syncControls();}}
  }
  function zoom(actual){
    const dialog=el('dialog'),stage=el('stage');dialog.dataset.zoom=actual?'actual':'fit';
    el('zoom').setAttribute('aria-pressed',String(actual));el('zoom').textContent=t(actual?'适应窗口':'原始尺寸');
    stage.scrollLeft=actual?(stage.scrollWidth-stage.clientWidth)/2:0;stage.scrollTop=actual?(stage.scrollHeight-stage.clientHeight)/2:0;
  }
  function translate(){
    for(const e of root.querySelectorAll('[data-sky-label]'))e.textContent=t(e.dataset.skyLabel);
    el('mode').replaceChildren(...Object.entries(modeNames).map(([key,label])=>new Option(t(label),key)));el('mode').value=mode;
    el('dialog').setAttribute('aria-label',t('巡天模拟成片'));el('zoom').textContent=t(el('dialog').dataset.zoom==='actual'?'适应窗口':'原始尺寸');refreshInfo();status(statusKey,statusParams);paint();
  }
  function setMode(next){
    if(!Object.hasOwn(modeNames,next)||next===mode)return;
    mode=next;el('mode').value=next;cancelSky();galaxyError=null;invalidatePhoto(true);plannerKey='';idleStatus();refreshInfo();ensureGalaxy();paint();
  }
  el('mode').onchange=()=>setMode(el('mode').value);
  el('open').onclick=()=>{if(!canExport())return;
    try{const out=result();el('stage').replaceChildren(out);el('dialog').showModal();zoom(false);}
    catch{status('拼图 PNG 生成失败，请重试。');}
  };
  el('zoom').onclick=()=>zoom(el('dialog').dataset.zoom!=='actual');el('download').onclick=el('dialog-download').onclick=download;el('retry').onclick=()=>{galaxyError=null;ensureGalaxy();};el('close').onclick=()=>el('dialog').close();
  el('dialog').addEventListener('close',()=>{el('stage').replaceChildren();if(visible)el('open').focus({preventScroll:true});});
  const resize=new ResizeObserver(()=>{if(visible)paint();});resize.observe(skyCanvas);
  const off=onLanguageChange(translate);translate();syncControls();
  return {update,setMode,get mode(){return mode;},pause(){visible=false;downloadToken++;encoding=false;cancelSky();if(el('dialog').open)el('dialog').close();},
    resume(){visible=true;ensureGalaxy();paint();},dispose(){alive=visible=false;downloadToken++;cancelSky();resize.disconnect();off();painter.clear();galaxies.clear();root.remove();}};
}
