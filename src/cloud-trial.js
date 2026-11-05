import {trialRegions,trialCoordinate,trialPixel,trialProject,trialConfidence} from './cloud-trial-math.js';

const assets=typeof __VIIRS_TRIAL__==='undefined'?null:__VIIRS_TRIAL__;
const style=`.cloud-trial{box-sizing:border-box;width:min(1320px,96vw);height:94dvh;max-width:none;max-height:none;padding:0;border:1px solid #385267;border-radius:14px;background:#0b1622;color:#e2edf5}.cloud-trial::backdrop{background:#010a12d9}.cloud-trial[open]{display:flex;flex-direction:column}.cloud-trial header{position:static;display:flex;justify-content:space-between;gap:15px;padding:18px 22px;border-bottom:1px solid #314557}.cloud-trial h2{margin:0 0 6px;font-size:21px}.cloud-trial p{line-height:1.65;margin:6px 0;color:#b5c8d5}.cloud-trial .trial-body{overflow:auto;padding:16px 22px;min-height:0}.cloud-trial .trial-controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.cloud-trial label{display:flex;align-items:center;gap:7px}.cloud-trial button,.cloud-trial select{font:inherit;flex:none;width:auto;max-width:none}.cloud-trial .trial-map{overflow:auto;max-height:62dvh;background:repeating-conic-gradient(#213344 0% 25%,#172836 0% 50%) 0 0/20px 20px;border:1px solid #365166;border-radius:8px;position:relative;text-align:center}.cloud-trial canvas{display:block;width:auto;max-width:100%;max-height:60dvh;height:auto;margin:auto;image-rendering:pixelated}.cloud-trial .trial-map.zoom canvas{max-width:none;max-height:none}.cloud-trial .trial-legend{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:12px 0;color:#c6d7e2;font-size:13px}.cloud-trial .trial-scale{display:inline-block;width:160px;height:16px;background:linear-gradient(90deg,#fff7ec,#fb8c58,#7f0000);vertical-align:middle}.cloud-trial .trial-note{font-size:12px}.cloud-trial a{color:#8ddbea}.cloud-trial [role=status]{white-space:pre-line}.cloud-trial .trial-point{min-height:24px;color:#e6f6ff}.cloud-trial:focus-visible,.cloud-trial button:focus-visible,.cloud-trial select:focus-visible{outline:2px solid #78d6ea;outline-offset:3px}@media(max-width:700px){.cloud-trial header,.cloud-trial .trial-body{padding:12px}.cloud-trial h2{font-size:17px}.cloud-trial .trial-map{max-height:58dvh}}`;

// Isolated sample viewer: never writes Weather settings, textures or IndexedDB.
export function mountCloudTrial(weather){
 let dialog,frame,canvas,status,point,legend,sourceSelect,regionSelect,opener,css;
 let serial=0,current=null,external=null;const loaded=new Map();
 const node=(tag,parent,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;parent.append(el);return el;};
 const close=()=>{++serial;dialog.close();opener?.focus();};
 function create(){
  css=node('style',document.head);css.textContent=style;
  dialog=node('dialog',document.body);dialog.className='cloud-trial';dialog.setAttribute('aria-labelledby','cloudTrialTitle');
  const head=node('header',dialog),titles=node('div',head);node('h2',titles,'VIIRS 云图试验').id='cloudTrialTitle';node('p',titles,'独立样本对比 · 不改变模拟器当前云图');
  const back=node('button',head,'返回数据与资源');back.type='button';back.onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  const body=node('div',dialog);body.className='trial-body';
  const controls=node('div',body);controls.className='trial-controls';
  const source=node('label',controls,'对比来源');sourceSelect=node('select',source);sourceSelect.id='cloudTrialSource';
  for(const [value,label] of [['day','VIIRS · 白天观测'],['night','VIIRS · 夜间观测'],['builtin','现有内置静态云图'],['history','下载的 VIIRS 历史图']]){const option=node('option',sourceSelect,label);option.value=value;option.hidden=value==='history';}
  const region=node('label',controls,'查看区域');regionSelect=node('select',region);regionSelect.id='cloudTrialRegion';
  for(const [value,r] of Object.entries(trialRegions)){const option=node('option',regionSelect,r.label);option.value=value;}
  const zoom=node('button',controls,'放大画布');zoom.type='button';zoom.setAttribute('aria-pressed','false');zoom.onclick=()=>{const active=frame.classList.toggle('zoom');zoom.setAttribute('aria-pressed',String(active));zoom.textContent=active?'适应窗口':'放大画布';};
  status=node('p',body,'加载样本…');status.id='cloudTrialStatus';status.setAttribute('role','status');
  frame=node('div',body);frame.className='trial-map';canvas=node('canvas',frame);canvas.id='cloudTrialMap';canvas.setAttribute('role','img');
  legend=node('div',body);legend.className='trial-legend';
  point=node('p',body,'在图上移动或点击，查看经纬度与晴空置信度。');point.className='trial-point';point.id='cloudTrialPoint';point.setAttribute('aria-live','polite');
  node('p',body,'格纹表示无数据，不能当作晴空。白天与夜间是不同过境时刻的日合成，不能拼成同一瞬间的全球天气。').className='trial-note';
  node('p',body,'这是晴空置信度预览，不是云光学厚度或真实透明度。样本仍有扫描条带及极区缺测，暂不作为正式云图源。区域放大不会增加原始细节。').className='trial-note';
  const links=node('p',body);links.className='trial-note';
  for(const [text,url] of [['NASA 数据说明',assets.metadataSource],['官方颜色表',assets.paletteSource]]){const a=node('a',links,text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(document.createTextNode('　'));}
  sourceSelect.onchange=regionSelect.onchange=()=>draw();
  const inspect=event=>{
   if(!current)return;const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height,p=trialCoordinate(current.region,x,y);if(!p){point.textContent='北极视图范围外';return;}
   const [sx,sy]=trialPixel(...p,current.width,current.height),i=(sy*current.width+sx)*4,rgba=current.data.subarray(i,i+4);
   point.textContent=`${Math.abs(p[1]).toFixed(2)}°${p[1]>=0?'N':'S'} / ${Math.abs(p[0]).toFixed(2)}°${p[0]>=0?'E':'W'} · `+(current.kind==='builtin'?'内置静态示意，无对应观测日期':trialConfidence(rgba,assets.palette));
  };
  canvas.onpointermove=canvas.onclick=inspect;
 }
 async function sample(kind){
  const selectedExternal=external;
  if(loaded.has(kind))return loaded.get(kind);
  let bitmap,owned=false;
  if(kind==='builtin'){bitmap=weather.env.builtinCloud?.image;if(!bitmap)throw Error('内置云图尚未加载，请稍后重试');}
  else if(kind==='history'){if(!external)throw Error('未选择历史图');bitmap=await createImageBitmap(external.blob,{colorSpaceConversion:'none'});owned=true;}
  else {const response=await fetch(assets.samples[kind]);if(!response.ok)throw Error('样本文件读取失败');bitmap=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none'});owned=true;}
  try{
   const c=new OffscreenCanvas(assets.width,assets.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(bitmap,0,0,c.width,c.height);
   const value={data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height,kind};c.width=c.height=1;if(kind!=='history'||external===selectedExternal)loaded.set(kind,value);return value;
  }finally{if(owned)bitmap.close();}
 }
 async function draw(){
  const token=++serial,kind=sourceSelect.value,region=trialRegions[regionSelect.value];status.textContent='加载样本…';
  try{
   const value=await sample(kind);if(token!==serial||!dialog.open)return;
   const sampleDate=kind==='history'?external.date:assets.date,period=kind==='history'?external.period:kind,bytes=kind==='history'?external.size:assets.files[kind+'.png']?.bytes;
   const projected=trialProject(value.data,value.width,value.height,region);canvas.width=region.width;canvas.height=region.height;canvas.getContext('2d').putImageData(new ImageData(projected.pixels,region.width,region.height),0,0);current={...value,region};
   canvas.setAttribute('aria-label',`${region.label}，${kind==='builtin'?'内置静态云图':sampleDate+' VIIRS '+(period==='day'?'白天':'夜间')+'晴空置信度'}；格纹为无数据`);
   status.textContent=kind==='builtin'?'内置静态云图 · 无同日观测时间，仅作外观参考':`${sampleDate}（UTC 日合成） · NOAA-20 VIIRS · ${period==='day'?'白天':'夜间'}观测\n全球预览 2048 × 1024（赤道约 20 公里/像素） · 显示区域有数据像素 ${(projected.validFraction*100).toFixed(1)}% · 样本 ${(bytes/1048576).toFixed(2)} MiB`;
   legend.replaceChildren();
   if(kind==='builtin')legend.textContent='亮色为内置云层示意；不是当前天气。';
   else {node('span',legend,'浅色：更可能有云');node('span',legend).className='trial-scale';node('span',legend,'深红：更可能晴空');node('span',legend,'格纹：无数据');}
   point.textContent='在图上移动或点击，查看经纬度与晴空置信度。';
  }catch(error){if(token!==serial)return;status.textContent='样本未载入：'+error.message+'。'+(current?'继续显示上一张样本。':'');if(current){sourceSelect.value=current.kind;regionSelect.value=Object.keys(trialRegions).find(k=>trialRegions[k]===current.region);}}
 }
 return {open(record){if(!assets)return;if(!dialog)create();external=record||null;loaded.delete('history');sourceSelect.querySelector('[value=history]').hidden=!external;if(external)sourceSelect.value='history';else if(sourceSelect.value==='history')sourceSelect.value='day';opener=document.activeElement;if(!dialog.open)dialog.showModal();draw();},dispose(){++serial;dialog?.remove();css?.remove();loaded.clear();current=null;}};
}
