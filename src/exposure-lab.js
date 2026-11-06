import {onLanguageChange,t} from './i18n.js';
import {clockText,localISO,parseLocalTime} from './time-format.js';
import {orbitComputationMode,validTime,validateOrbit} from './orbit.js';
import {predictPasses,validateObserver} from './pass-prediction.js';
import {BEIJING_EXPOSURE,exposureModes,usesGround,exposureSite,groundSource,groundWindow} from './exposure-ground.js';
import {compositeExposure,exposureBlob,exportExposure,modeKey,mountExposureWipe,packExposure,unpackExposure} from './exposure-comparison.js';
import {CAMERA_PRESETS,CAMERA_OFFSET_LIMIT,EXPOSURE_SECONDS,moveExposureCamera,presetCamera,recommendedNight} from './exposure-lab-math.js';
import {mountExposureViewfinderControls} from './exposure-viewfinder-controls.js';
import {createExposureCamera} from './exposure-lab-render.js';
import {wingViewBearing} from './exposure-lab-hull.js';
import {mountStationOrbitControl} from './station-orbit-control.js';

const qualityLabel={simple:'简易 · 1K',medium:'中等 · 2K',standard:'标准 · 4K',high:'精细 · 8K'};
const cameraFields=[['x','前后位置 X',-CAMERA_OFFSET_LIMIT,CAMERA_OFFSET_LIMIT,' m'],['y','左右位置 Y',-CAMERA_OFFSET_LIMIT,CAMERA_OFFSET_LIMIT,' m'],['z','上下位置 Z',-CAMERA_OFFSET_LIMIT,CAMERA_OFFSET_LIMIT,' m'],
  ['azimuth','镜头方位角',-180,180,'°'],['pitch','镜头仰角',-90,90,'°'],['roll','镜头滚转角',-180,180,'°'],['fov','垂直视场',20,100,'°']];
const css=`
.exposure-lab .exposure-film{position:relative}.exposure-lab .exposure-wipe{position:absolute;top:0;bottom:0;width:26px;min-height:0;transform:translateX(-50%);border:0;border-radius:0;padding:0;cursor:ew-resize;touch-action:none;background:linear-gradient(90deg,transparent calc(50% - 1px),#def6ee calc(50% - 1px),#def6ee calc(50% + 1px),transparent calc(50% + 1px))}
.exposure-wipe:after{content:'↔';position:absolute;left:0;right:0;top:46%;padding:5px 0;border:1px solid #aae5d7;border-radius:5px;background:#143b45;color:#e4fff4}
.exposure-wipe:focus-visible{outline:2px solid #98f0d8!important}.exposure-half{position:absolute;bottom:7px;max-width:45%;background:#06131ec7;padding:3px 7px;color:#dcf4e9;border-radius:4px;font-size:12px;pointer-events:none}.exposure-half-a{left:7px}.exposure-half-b{right:7px}
.exposure-site{display:flex;flex-wrap:wrap;align-items:flex-end;gap:7px 10px;padding:8px 10px;margin:6px 0;border:1px solid #325165;border-radius:7px;background:#102332}.exposure-site label{display:grid;min-width:60px;max-width:150px;gap:3px;font-size:11px;color:#a6c3ce}.exposure-site input{width:100%;min-width:0}.exposure-ground-note,.exposure-sources{margin:3px 0;font-size:12px;color:#abc2cd}.exposure-site [data-exposure=ground-window]{flex-basis:100%}

.exposure-lab{max-width:1200px;margin:auto;color:#dce8f4;font-size:13px}
.exposure-lab .exposure-head{display:flex;align-items:baseline;justify-content:space-between;gap:1em;margin-bottom:9px}.exposure-lab h3{font-size:18px;margin:0}.exposure-lab .exposure-desc{color:#9eb4c9;line-height:1.55;margin:0 0 12px}
.exposure-lab .exposure-controls{display:flex;flex-wrap:wrap;align-items:flex-end;gap:9px 14px;margin:10px 0}
.exposure-lab .exposure-field{display:grid;gap:4px;color:#a7bfce;font-size:12px}.exposure-lab input,.exposure-lab select{min-height:34px;color:#eaf4fa;max-width:100%}
.exposure-lab button{min-height:34px;padding:6px 10px;font-size:12px}.exposure-lab button:disabled{opacity:.48;cursor:default}.exposure-lab .exposure-save{background:#1b5262;border-color:#65bfce;color:#efffff}
.exposure-lab .exposure-figure{background:#030812;border:1px solid #32485c;border-radius:10px;overflow:hidden;margin:12px 0 8px;padding:0;position:relative}
.exposure-lab .exposure-photo{width:100%;display:block;aspect-ratio:16/9;background:radial-gradient(ellipse at 20% 135%,#143546 0%,#060f1d 40%,#030712 75%)}
.exposure-lab .exposure-photo[data-free-state=ready],.exposure-lab .exposure-photo[data-free-state=active]{cursor:grab;touch-action:none;user-select:none}
.exposure-lab .exposure-photo[data-free-dragging=true]{cursor:grabbing}.exposure-lab .exposure-photo[data-free-state=active]{outline:2px solid #88ead6;outline-offset:-3px}
.exposure-lab .exposure-free-help{color:#b6cbd6;font-size:12px;margin:5px 0;line-height:1.55}.exposure-lab .exposure-free-indicator{color:#98becb;font-size:12px}.exposure-lab .exposure-free-indicator[data-state=active]{color:#9aefdc;font-weight:600}
.exposure-lab .exposure-record{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;background:#0d1927;color:#aec4d4;font-size:12px;font-variant-numeric:tabular-nums}.exposure-lab .exposure-mode{color:#c8e7f0;font-weight:600}
.exposure-lab .exposure-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.exposure-lab [data-exposure=status]{color:#adc6d6;line-height:1.5;min-height:20px}.exposure-lab progress{width:min(240px,70vw);accent-color:#74d2df}.exposure-lab [hidden]{display:none!important}
.exposure-lab .exposure-mount{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:7px 0}.exposure-mount label{display:flex;align-items:center;gap:7px}.exposure-mount input[type=checkbox]{min-height:0}.exposure-lab details{border-block:1px solid #26394b;padding:7px 0;color:#b9cad8}.exposure-lab summary{cursor:pointer}.exposure-sliders{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 18px;margin:10px 0}.exposure-sliders label{display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 8px}.exposure-sliders output{color:#e0f6ff;font-variant-numeric:tabular-nums}.exposure-sliders input[type=range]{grid-column:1/-1;width:100%;height:22px;min-height:0;margin:0;padding:0;accent-color:#75d1dc}.exposure-lab .exposure-tip{margin:6px 0 0;color:#94aec2;font-size:12px}.exposure-lab .exposure-fill{margin-left:auto}.exposure-lab .exposure-location{color:#e0f3f7}
@media(max-width:700px){.exposure-sliders{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.exposure-lab .exposure-fill{margin-left:0}}
@media(min-width:900px) and (min-height:670px){.exposure-lab .exposure-figure{max-width:min(100%,calc((84dvh - 235px)*1.778));margin-inline:auto}}
@media(max-width:550px){.exposure-lab .exposure-controls{gap:7px 10px}.exposure-lab .exposure-field{flex:1 1 42%}.exposure-lab .exposure-field:first-child{flex:1 1 100%}.exposure-lab h3{font-size:16px}.exposure-lab .exposure-figure{margin-inline:-4px}.exposure-lab .exposure-record{font-size:11px;padding:7px}}
`;

export function mountExposureLab(root,sim,assets){
  root.innerHTML=`<style>${css}</style><section class="exposure-lab">
   <div class="exposure-head"><h3 data-i="轨道长曝光相机"></h3></div>
   <p class="exposure-desc" data-i="用天宫舱外机位拍摄恒星和地球夜光。相机按模拟时刻叠加亮部，保留当前舱体组合和翼板角度。"></p>
   <div data-exposure="orbit-source"></div><p class="exposure-ground-note" data-exposure="pinned" hidden></p>
   <button type="button" data-exposure="unpin" data-i="改用当前天宫星历" hidden></button>
   <div class="exposure-controls">
    <label class="exposure-field"><span data-i="曝光开始（UTC+8）"></span><input type="datetime-local" step="1" data-exposure="time"></label>
    <label class="exposure-field"><span data-i="相机跟踪方式"></span><select data-exposure="mode"><option value="compare-stars" data-i="对照：舱体固定 / 恒星锁定"></option><option value="compare-ground" data-i="对照：舱体固定 / 地面点锁定"></option><option value="body" data-i="舱体固定"></option><option value="inertial" data-i="恒星锁定"></option><option value="ground" data-i="地面点锁定"></option></select></label>
    <label class="exposure-field"><span data-i="曝光时长"></span><select data-exposure="seconds"></select></label>
    <button type="button" data-exposure="night" data-i="推荐夜航"></button><button type="button" data-exposure="now" data-i="采用主场景时刻"></button>
   </div>
   <div class="exposure-site" data-exposure="site" hidden>
    <label><span data-i="地点名称"></span><input type="text" maxlength="60" data-exposure="site-name"></label>
    <label><span data-i="纬度（北纬为正）"></span><input type="number" min="-90" max="90" step="any" data-exposure="latitude"></label>
    <label><span data-i="经度（东经为正）"></span><input type="number" min="-180" max="180" step="any" data-exposure="longitude"></label>
    <label><span data-i="海拔（米）"></span><input type="number" min="-500" max="9000" step="any" data-exposure="height"></label>
    <button type="button" data-exposure="beijing" data-i="北京示例"></button><button type="button" data-exposure="pass" data-i="寻找可拍过境"></button>
    <small data-exposure="ground-window" role="status"></small>
   </div>
   <div class="exposure-mount"><label><span data-i="机位预设"></span><select data-exposure="preset"></select></label>
    <button type="button" data-exposure="reset-camera" data-i="恢复此机位"></button>
    <label><input type="checkbox" data-exposure="free" aria-describedby="exposure-free-help"><span data-i="自由取景"></span></label>
    <label class="exposure-fill"><input type="checkbox" data-exposure="fill" checked><span data-i="摄影补光"></span></label>
    <button type="button" data-exposure="viewfinder" data-i="即时取景"></button>
   </div>
   <p class="exposure-free-help" id="exposure-free-help" data-exposure="free-help" data-i="按住鼠标拖动转向。W/S 低头或抬头，A/D 左右转向，Q/E 左右滚转。H/N 前后，J/L 左右，I/K 向下或向上平移。按 Esc 或点击画面外释放。" hidden></p>
   <details><summary data-i="调整拍摄位置与镜头"></summary><div class="exposure-sliders">${cameraFields.map(([key,label,min,max])=>`<label><span data-i="${label}"></span><output data-reading="${key}" aria-hidden="true"></output><input type="range" min="${min}" max="${max}" step="${key==='fov'?1:.1}" data-camera="${key}"></label>`).join('')}</div>
    <p class="exposure-tip" data-i="位置以米计。方位从机身前方向左增加，仰角向上为正，正滚转使相机向右倾斜。"></p></details>
   <figure class="exposure-figure"><div class="exposure-film" data-exposure="film"><canvas class="exposure-photo" data-exposure="photo" width="768" height="432" role="img" aria-describedby="exposure-free-help"></canvas>
    <button type="button" class="exposure-wipe" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" data-exposure="wipe" hidden></button>
    <span class="exposure-half exposure-half-a" data-exposure="half-a" hidden></span><span class="exposure-half exposure-half-b" data-exposure="half-b" hidden></span></div><figcaption class="exposure-record"><span class="exposure-mode" data-exposure="caption"></span><span class="exposure-free-indicator" data-exposure="free-state" role="status" aria-live="polite" hidden></span><span data-exposure="range"></span></figcaption></figure>
   <div class="exposure-actions"><button type="button" data-exposure="preview" data-i="生成预览"></button><select data-exposure="variant" aria-label="PNG" hidden><option value="view" data-i="当前分割对照"></option><option value="a" data-i="单独导出 A 片"></option><option value="b" data-i="单独导出 B 片"></option></select><button class="exposure-save" type="button" data-exposure="save" data-i="下载 1080p PNG"></button><button type="button" data-exposure="cancel" data-i="取消合成" hidden></button><progress max="1" value="0" data-exposure="progress" hidden></progress></div>
   <p class="exposure-sources" data-exposure="sources"></p><p data-exposure="status" role="status" aria-live="polite"></p>
  </section>`;
  const q=key=>root.querySelector(`[data-exposure="${key}"]`),cam=createExposureCamera(sim);
  let orbitControl,pinned=null,exactTime=null,shown=null,passSearch=null,restoring=0,windowCache=null;
  const modelData=()=>pinned?.data||orbitControl?.data;
  let active=false,ticket=0,timer,lastPhoto=null,statusKey='正在准备夜航时段…',statusParams={};
  let selectedTab=false,activation=0,orbitRevision=0,lastData,sequenceDefault=true,cameraSettings=presetCamera('limb',wingViewBearing(sim));
  let freeControls=null,freeTimer=0,freeBusy=false,pendingFree=null,lastFreeStart=-Infinity;
  const sliders=cameraFields.map(([key,,,,unit])=>({key,unit,slider:root.querySelector(`[data-camera="${key}"]`),out:root.querySelector(`[data-reading="${key}"]`)}));
  const report=(key,params={})=>{statusKey=key;statusParams=params;q('status').textContent=t(key,params);};
  const setBusy=busy=>{q('progress').hidden=!busy;q('cancel').hidden=!busy;q('save').disabled=busy;q('preview').disabled=busy;};
  const abort=()=>{clearTimeout(timer);ticket++;setBusy(false);};
  const pickedTime=()=>{
   const displayed=parseLocalTime(q('time').value);
   // datetime-local may elide a trailing :00; keep the handoff's exact instant
   // until its displayed second changes or the observer edits the input.
   return exactTime!=null&&displayed===Math.floor(exactTime/1000)*1000?exactTime:displayed;
  };
  const setTime=time=>{exactTime=time;q('time').value=localISO(time);};
  const readSite=()=>validateObserver({name:q('site-name').value,latitude:q('latitude').valueAsNumber,longitude:q('longitude').valueAsNumber,height:q('height').valueAsNumber});
  const setSite=site=>{q('site-name').value=site.name;for(const k of ['latitude','longitude','height'])q(k).value=String(site[k]);};
  const selected=()=>({data:modelData(),mode:q('mode').value,start:pickedTime(),seconds:Number(q('seconds').value),cameraSettings:{...cameraSettings},fill:q('fill').checked,
   observer:usesGround(q('mode').value)?readSite():null});
  const wipe=mountExposureWipe(q('wipe'),q('film'),fraction=>{if(shown?.images.length===2)compositeExposure(q('photo'),shown.images,fraction);});
  const redraw=()=>{if(shown)compositeExposure(q('photo'),shown.images,wipe.value);refreshCaption();};
  setSite(BEIJING_EXPOSURE);
  function syncCamera(){
    q('preset').value=cameraSettings.preset;
    for(const {key,unit,slider,out} of sliders){
      const value=Number(cameraSettings[key].toFixed(1)),reading=value+unit;
      if(slider.valueAsNumber!==value)slider.value=value;
      if(out.textContent!==reading){slider.setAttribute('aria-valuetext',reading);out.textContent=reading;}
    }
  }
  function refreshCaption(){
    const p=lastPhoto,pair=shown?.images.length===2,models=shown?.modes||[];
    q('caption').textContent=p?(p.single?t('即时取景'):models.map(m=>t(modeKey[m])).join(' / '))+' · '+t(CAMERA_PRESETS[p.cameraSettings.preset].label):t('天宫舱外机位');
    q('range').textContent=p?`${clockText(p.start)}${p.single?'':' – '+clockText(p.start+p.seconds*1000)} UTC+8`:'';
    q('photo').setAttribute('aria-label',q('caption').textContent);q('photo').dataset.result=p?.single?'single':p?'stack':'';
    q('wipe').hidden=q('half-a').hidden=q('half-b').hidden=!pair;q('variant').hidden=!pair;
    q('save').textContent=shown?.restored?t('下载照片')+' · '+shown.images[0].width+' × '+shown.images[0].height:t('下载 1080p PNG');
    q('wipe').setAttribute('aria-label',t('拖动分割线对照两张照片'));
    if(pair){q('half-a').textContent='A · '+t(modeKey[models[0]]);q('half-b').textContent='B · '+t(modeKey[models[1]]);}
    q('site').hidden=!usesGround(q('mode').value);q('pass').disabled=!!passSearch;q('preview').textContent=t('拍摄 {seconds} 秒',{seconds:q('seconds').value||30});
    q('unpin').hidden=q('pinned').hidden=!pinned;
    if(pinned)q('pinned').textContent=t(pinned.kind==='balcony'?'使用阳台交接的天宫星历与所选时刻。':'使用观测记录中的天宫星历。');
    if(shown?.source){
     const {sky,earth}=shown.source,galaxy=sky.status==='panorama'?t('银河 {size}K',{size:sky.level||'—'}):t(['catalog','off'].includes(sky.status)?'仅星表或已关闭':'普通银河');
     q('sources').textContent=[galaxy,qualityLabel[earth.quality]&&t(qualityLabel[earth.quality]),earth.day?.source,earth.night?.source,shown.source.globalEarth&&t('软件图形模式采用全球底图与简化云层、大气。')].filter(Boolean).join(' · ');
    }else q('sources').textContent='';
  }
  function verifyWindow(params,single=false){
   if(!usesGround(params.mode)){q('ground-window').textContent='';return true;}
   const raw=params.observer,site=exposureSite(raw),source=groundSource(params.data),key=[params.start,params.seconds,raw.latitude,raw.longitude,raw.height].join('|');
   if(windowCache?.key!==key||windowCache.data!==params.data){windowCache={key,data:params.data,value:groundWindow(source,site,params.start,params.seconds)};}
   const result=windowCache.value;
   let message;
   if(result.ok)message=t(result.estimated?'该地在快门期间可见，轨道使用短期估算。':'该地在快门期间可见。');
   else if(result.reason==='coverage')message=t('快门超出可用星历 {start} 至 {end}（UTC+8），请调整起点或缩短曝光。',{start:clockText(source.start),end:clockText(source.end)});
   else if(result.reason==='setting')message=t('约在 {time} 落到地平线后，此起点最多可拍 {seconds} 秒。',{time:clockText(result.until),seconds:result.seconds});
   else message=t('快门开启时该地位于地平线下，请寻找可拍过境。');
   q('ground-window').textContent=message;
   if(result.ok)return true;
   if(single&&groundWindow(source,site,params.start,0).ok)return true;
   shown=lastPhoto=null;q('photo').getContext('2d').clearRect(0,0,q('photo').width,q('photo').height);refreshCaption();
   report('本次地面追拍不可用');return false;
  }
  async function findGroundPass(){
   let site,data,source;try{site=readSite();data=modelData();source=groundSource(data);}catch(e){report(e.message);return;}
   passSearch?.abort();const controller=new AbortController();passSearch=controller;q('pass').disabled=true;
   const preferred=pickedTime(),start=Number.isFinite(preferred)&&preferred>=source.start&&preferred<source.end?preferred:source.start;
   try{
    const hours=Math.min(48,Math.ceil((source.end-start)/3600000)),seconds=Number(q('seconds').value);
    const result=await predictPasses(data,site,start,hours>24?48:24,{minimumElevation:0,allowEstimate:true,signal:controller.signal});
    if(controller.signal.aborted||data!==modelData())return;
    const chosen=result.passes.find(p=>p.end-p.start>=seconds*1000+2000);
    if(!chosen){q('ground-window').textContent=t('本次搜索没有足够长的可见过境，请缩短曝光或更换时段。');return;}
    const at=Math.max(chosen.start+1000,Math.min(chosen.maximum.time-seconds*500,chosen.end-seconds*1000-1000));
    setTime(Math.ceil(at/1000)*1000);sequenceDefault=false;queue(true);
   }catch(e){if(e.name!=='AbortError')report(e.message);}
   finally{if(passSearch===controller){passSearch=null;q('pass').disabled=false;}}
  }
  function refresh(){
    for(const el of root.querySelectorAll('[data-i]'))el.textContent=t(el.dataset.i);
    q('preset').replaceChildren(...Object.entries(CAMERA_PRESETS).map(([key,preset])=>new Option(t(preset.label),key)));syncCamera();
    const duration=q('seconds').value||'30';
    q('seconds').replaceChildren(...EXPOSURE_SECONDS.map(seconds=>new Option(seconds<60?t('{seconds} 秒曝光',{seconds}):t('{minutes} 分钟曝光',{minutes:seconds/60}),String(seconds))));
    q('seconds').value=duration;q('progress').setAttribute('aria-label',t('曝光合成进度'));
    refreshCaption();freeControls?.refresh();report(statusKey,statusParams);
  }
  function useNight(data=modelData()){
    if(!data){report('没有可用于曝光的天宫轨道');return false;}
    const time=recommendedNight(data,sim.time,Number(q('seconds').value),cameraSettings.azimuth);
    if(time===null){report('天宫轨道区间短于曝光时长');return false;}
    setTime(time);sequenceDefault=true;return true;
  }
  function clearFreeQueue(){clearTimeout(freeTimer);freeTimer=0;pendingFree=null;}
  function queue(single=true){
    clearFreeQueue();abort();if(!active)return;
    timer=setTimeout(()=>run(false,single),single?60:100);
  }
  // Coalesce movement into the newest pose. A slow GPU finishes one small
  // sample before the next one starts, even under continuous pointer input.
  function pumpFree(){
    if(!active||!pendingFree||freeBusy||freeTimer)return;
    freeTimer=setTimeout(async()=>{
      freeTimer=0;if(!active||!q('free').checked||!pendingFree)return;
      const quality=pendingFree;pendingFree=null;freeBusy=true;lastFreeStart=performance.now();
      try{await run(false,true,quality);}
      finally{freeBusy=false;pumpFree();}
    },Math.max(0,100-(performance.now()-lastFreeStart)));
  }
  function requestFree(quality){
    if(!active||!q('free').checked)return;
    restoring++;if(!freeBusy&&!freeTimer&&!pendingFree)abort();
    pendingFree=quality;pumpFree();
  }
  function shoot(download,single=false){restoring++;clearFreeQueue();return run(download,single);}
  function matchesProduct(params){
   return !!(lastPhoto&&!lastPhoto.single&&shown&&lastPhoto.data===params.data&&lastPhoto.start===params.start&&
    lastPhoto.mode===params.mode&&lastPhoto.seconds===params.seconds&&lastPhoto.fill===params.fill&&
    JSON.stringify(lastPhoto.cameraSettings)===JSON.stringify(params.cameraSettings)&&JSON.stringify(lastPhoto.observer)===JSON.stringify(params.observer));
  }
  function saveImage(photo,params,variant){
   return exposureBlob(photo).then(blob=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    a.download='StarOrbit-Tiangong-'+params.mode+'-'+variant+'-'+new Date(params.start).toISOString().replaceAll(':','-')+'-'+params.seconds+'s.png';
    a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
   });
  }
  async function run(download,single=false,freeQuality=null){
    abort();if(!active)return;const id=ticket;
    try{
     const params=selected();if(!params.data){report('没有可用于曝光的天宫轨道');return;}
     if(!validTime(params.start)||!validTime(params.start+params.seconds*1000)){report('请输入有效的曝光开始时刻');return;}
     if(!verifyWindow(params,single))return;
     const check=()=>{if(!active||id!==ticket)throw new DOMException('Aborted','AbortError');};
     if(download&&shown?.restored&&matchesProduct(params)){
      await saveImage(exportExposure(shown.images,shown.modes,wipe.value,q('variant').value),lastPhoto,q('variant').value);
      report('已导出保存的曝光成片');return;
     }
     if(!freeQuality){setBusy(true);q('progress').value=0;report(download?'正在合成 1920 × 1080 相片…':single?'正在准备取景…':'正在合成曝光预览…');}
     await sim.environment.ready;check();
     const width=freeQuality==='draft'?384:download?1920:Math.min(cam.software?512:(single?768:896),Math.max(576,Math.round((root.clientWidth||800)/16)*16));
     const result=await cam.renderSet({...params,width,single,check,progress:value=>{q('progress').value=value;}});
     check();shown=result;lastPhoto={...params,single};redraw();
     q('photo').dataset.quality=freeQuality==='draft'?'draft':'full';
     const startMode=orbitComputationMode(params.data,params.start),endMode=single?startMode:orbitComputationMode(params.data,params.start+params.seconds*1000);
     const source=usesGround(params.mode)&&groundSource(params.data).recordEnd<params.start+params.seconds*1000?t('短期轨道估算'):
      startMode==='interpolation'&&endMode==='interpolation'?t('有效星历内的天宫轨道'):t('天宫端点轨道外推');
     if(download){const variant=q('variant').value;await saveImage(exportExposure(result.images,result.modes,wipe.value,variant),params,variant);check();}
     if(freeQuality!=='draft')report(download?'1920 × 1080 PNG 已导出 · {source}':single?'取景完成 · {source}':'预览完成 · {source}',{source});
    }catch(error){if(id===ticket&&error.name!=='AbortError')report('曝光合成失败：{reason}',{reason:t(error.message)});}
    finally{if(id===ticket)setBusy(false);}
  }
  freeControls=mountExposureViewfinderControls({canvas:q('photo'),toggle:q('free'),available:()=>active&&!root.hidden&&!!modelData()&&validTime(parseLocalTime(q('time').value)),readFov:()=>cameraSettings.fov,
    onMove(delta){
      const next=moveExposureCamera(cameraSettings,delta);
      if(!cameraFields.some(([key])=>next[key]!==cameraSettings[key]))return;
      cameraSettings=next;syncCamera();requestFree('draft');
    },
    onIdle:()=>requestFree('settled'),onCapture:()=>{if(!lastPhoto?.single)requestFree('settled');},
    onState(state){
      q('free-help').hidden=q('free-state').hidden=state==='off';q('free-state').dataset.state=state;
      const message=state==='active'?t('自由取景已激活 · Esc 释放'):state==='ready'?t('自由取景就绪 · 点击取景画面激活'):'';
      if(q('free-state').textContent!==message)q('free-state').textContent=message;
      if(state==='off')clearFreeQueue();
    }
  });
  for(const {key,slider} of sliders)slider.oninput=event=>{
    cameraSettings[key]=Number(event.currentTarget.value);syncCamera();queue(true);
  };
  function resetCamera(){cameraSettings=presetCamera(q('preset').value,wingViewBearing(sim));syncCamera();queue(true);}
  q('preset').onchange=resetCamera;q('reset-camera').onclick=resetCamera;q('fill').onchange=()=>queue(true);q('viewfinder').onclick=()=>shoot(false,true);
  q('mode').onchange=()=>{passSearch?.abort();refreshCaption();queue();};
  q('seconds').onchange=()=>{refreshCaption();if(!usesGround(q('mode').value)&&sequenceDefault&&!useNight())return;queue();};
  q('time').onchange=()=>{exactTime=null;sequenceDefault=false;queue();};
  q('now').onclick=()=>{setTime(sim.time);sequenceDefault=false;queue();};
  q('night').onclick=()=>{if(usesGround(q('mode').value)){findGroundPass();return;}if(useNight())queue();};
  q('beijing').onclick=()=>{setSite(BEIJING_EXPOSURE);passSearch?.abort();queue();};
  q('pass').onclick=findGroundPass;
  q('unpin').onclick=()=>{pinned=null;shown=lastPhoto=null;windowCache=null;refreshCaption();queue();};
  for(const k of ['site-name','latitude','longitude','height'])q(k).onchange=()=>{passSearch?.abort();queue();};
  q('preview').onclick=()=>shoot(false);q('save').onclick=()=>shoot(true);
  q('cancel').onclick=()=>{clearFreeQueue();abort();report('本次曝光已取消');};
  // A pending image decode may complete after the observer changes the shot.
  // Background ephemeris refreshes during panel activation do not discard it.
  const invalidateRestore=()=>{restoring++;};
  root.addEventListener('input',invalidateRestore,true);
  root.addEventListener('change',invalidateRestore,true);
  root.addEventListener('click',invalidateRestore,true);
  const unsubscribe=onLanguageChange(refresh);refresh();
  function activateData(data){
    if(!active||pinned)return;
    const same=data===lastData;
    if(same&&shown&&lastPhoto?.data===data){redraw();return;}
    abort();
    const changed=data!==lastData;lastData=data;
    if(!data){report('没有可用于曝光的天宫轨道');return;}
    if((changed&&sequenceDefault||!q('time').value)&&!useNight(data))return;
    queue();
  }
  orbitControl=mountStationOrbitControl(q('orbit-source'),sim,data=>{orbitRevision++;activateData(data);});
  function suspend(){restoring++;activation++;active=false;passSearch?.abort();freeControls.release(false);clearFreeQueue();abort();cam.release();}
  function pause(){selectedTab=false;suspend();}
  async function resume(){
    selectedTab=true;
    if(document.hidden||root.hidden||!root.isConnected||!sim.flightLab?.active||sim.flightLab.tab!=='exposure')return;
    const turn=++activation,revision=orbitRevision;active=true;
    try{
      await orbitControl.refresh();
      if(active&&turn===activation&&revision===orbitRevision){
        if(pinned){if(shown)redraw();else queue(true);}else activateData(orbitControl.data);
      }
    }catch(error){if(active&&turn===activation)report('曝光合成失败：{reason}',{reason:error.message});}
  }
  function openGroundCapture({observer,time,data,missionId='tiangong',estimated=false}={}){
   if(missionId!=='tiangong'||!validTime(time)||!data?.rows?.length)throw Error('地面追拍需要天宫星历和有效时刻');
   const site=validateObserver(observer);restoring++;clearFreeQueue();abort();passSearch?.abort();
   pinned={kind:'balcony',data,estimated:!!estimated};sequenceDefault=false;windowCache=null;shown=lastPhoto=null;
   setSite(site);setTime(time);q('mode').value='compare-ground';q('seconds').value='30';q('free').checked=false;freeControls.release(false);
   cameraSettings=presetCamera('wide');syncCamera();refreshCaption();
   if(active)queue(true);return true;
  }
  async function getObservationRecord(){
   let params;try{params=selected();}catch{return null;}
   if(!params.data||!validTime(params.start))return null;
   const done=matchesProduct(params);
   const record={kind:'exposure',time:params.start,seconds:params.seconds,mode:params.mode,camera:{...params.cameraSettings},fill:params.fill,
    observer:params.observer?{...params.observer}:null,split:wipe.value,product:done?{count:shown.images.length,width:shown.images[0].width,height:shown.images[0].height}:null,
    source:done?shown.source:null};
   return {record,orbit:params.data,image:done?await exposureBlob(packExposure(shown.images)):null};
  }
  async function restoreObservationRecord(record,{orbit,image}={}){
   if(record?.kind!=='exposure'||!validTime(record.time)||!EXPOSURE_SECONDS.includes(record.seconds)||!Object.hasOwn(exposureModes,record.mode)||
    !Object.hasOwn(CAMERA_PRESETS,record.camera?.preset)||!orbit||orbit.missionId&&orbit.missionId!=='tiangong')throw Error('保存的曝光参数无效');
   const settings={...record.camera};for(const [k,,lo,hi] of cameraFields)if(!Number.isFinite(settings[k])||settings[k]<lo||settings[k]>hi)throw Error('保存的曝光参数无效');
   if(!Number.isFinite(settings.mountAzimuth)||Math.abs(settings.mountAzimuth)>180)throw Error('保存的曝光参数无效');
   validateOrbit(orbit);const site=usesGround(record.mode)?validateObserver(record.observer):record.observer&&validateObserver(record.observer);
   const count=exposureModes[record.mode].length,turn=++restoring;
   if(image&&record.product?.count!==count)throw Error('保存的曝光图像无效');
   const images=image?await unpackExposure(image,count):null;if(turn!==restoring)return false;
   clearFreeQueue();abort();passSearch?.abort();pinned={kind:'record',data:orbit};sequenceDefault=false;windowCache=null;
   cameraSettings=settings;syncCamera();q('seconds').value=String(record.seconds);q('mode').value=record.mode;q('fill').checked=record.fill!==false;setTime(record.time);
   if(site)setSite(site);q('free').checked=false;freeControls.release(false);wipe.set(record.split??.5);
   shown=images?{images,modes:exposureModes[record.mode],source:record.source,restored:true}:null;
   lastPhoto=shown?{...selected(),single:false}:null;refreshCaption();
   if(images){redraw();report('已恢复保存的曝光成片');}else if(active)queue(true);
   return true;
  }
  const visible=()=>{if(document.hidden)suspend();else if(selectedTab)resume();};
  document.addEventListener('visibilitychange',visible);
  return {pause,resume,openGroundCapture,getObservationRecord,restoreObservationRecord,dispose(){restoring++;pause();freeControls.dispose();orbitControl.dispose();unsubscribe();document.removeEventListener('visibilitychange',visible);for(const event of ['input','change','click'])root.removeEventListener(event,invalidateRestore,true);root.replaceChildren();}};
}
