import {prepareGithubCloud} from './cloud-mask-repair.js';
import {cloudProvider,selectCloud,validateNASA,completeNASA,retireNASA} from './cloud-source.js';
import {CLOUD_PNG,CLOUD_JPEG,cloudChannel,cloudDecodeSize,cloudTone} from './cloud-texture.js';
import {parseOfficialOrbit} from './data-sources.js';
import * as THREE from 'three';
import {t,onLanguageChange} from './i18n.js';
import {WeatherCache} from './weather-cache.js';
import {validateAurora,auroraPixels,selectSnapshot,seedNumber,clamp} from './weather-math.js';
import {validateOrbit} from './orbit.js';
const $=id=>document.getElementById(id),fmt=x=>Number.isFinite(x)?new Date(x).toISOString().replace('T',' ').slice(0,19)+' UTC':t('观测时间未提供');
const SOURCE={cloud:CLOUD_PNG,aurora:'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',orbit:'https://en.cmse.gov.cn/news/202107/t20210722_48418.html'};
const names={cloud:'云图',aurora:'极光',orbit:'轨道',assets:'内置素材'};
const saveFile=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
export class Weather{
 constructor(env){
  this.env=env;this.sim=env.sim;this.cache=new WeatherCache();this.items=[];this.active={};this.tokens={cloud:0,aurora:0};this.messages={};this.busy=false;this.lastUI=0;this.lastHistory=0;this.lastFrame=performance.now();this.frames=0;this.fpsStart=this.lastFrame;this.fps=60;
  this.settings={cloud:'builtin',aurora:'off',cloudHistory:'auto',auroraHistory:'auto',seed:'Tiangong',auroraStrength:1.4,limit:200,adaptive:true,exposure:1.15,volume:false,motion:true};
  try{Object.assign(this.settings,JSON.parse(localStorage.getItem('tiangong-weather-settings-v1'))||{});}catch{}
  for(const kind of ['cloud','aurora'])if(!['builtin','off','latest','history','local',...(kind==='cloud'?['satcorps']:[])].includes(this.settings[kind]))this.settings[kind]=kind==='cloud'?'builtin':'off';
  this.settings.limit=clamp(Number(this.settings.limit)||200,20,2000);this.settings.auroraStrength=clamp(Number.isFinite(Number(this.settings.auroraStrength))?Number(this.settings.auroraStrength):1.4,0,4);this.settings.seed=String(this.settings.seed).slice(0,80);this.settings.exposure=clamp(Number(this.settings.exposure)||1.15,.3,2.5);
  // Background suspension is not a low-performance sample. Keep the simulation clock intact.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){this.fpsStart=performance.now();this.frames=0;this.fastWindows=0;}});
  this.bind();this.sync();this.ready=this.restore();onLanguageChange(()=>{this.render();this.renderPresets();});
 }
 async restore(){try{const retired=await retireNASA(this.cache);if(retired.includes(this.settings.cloudHistory)){this.settings.cloudHistory='auto';if(this.settings.cloud==='history')this.settings.cloud='satcorps';this.sync();}await this.reload();if(retired.length&&this.settings.cloud==='satcorps'&&/^https?:$/.test(location.protocol)){try{const response=await fetch('/api/cloud/satcorps/status',{cache:'no-store',signal:AbortSignal.timeout(15000)});const job=await response.json();if(job.state==='ready')await this.acceptNASA(job);}catch(e){this.messages.cloud=e.message;}}const orbit=this.settings.orbitRecord===undefined?selectSnapshot(this.items,'orbit','latest'):this.items.find(x=>x.id===this.settings.orbitRecord&&x.kind==='orbit');if(orbit){this.useOrbit(validateOrbit(JSON.parse(await orbit.blob.text())),false);this.active.orbit=orbit.id;this.settings.orbitRecord=orbit.id;}else this.settings.orbitRecord=null;this.save();await Promise.allSettled(['cloud','aurora'].map(k=>this.apply(k)));}catch(e){this.messages.cache=e.message;}this.render();}
 save(){try{localStorage.setItem('tiangong-weather-settings-v1',JSON.stringify(this.settings));}catch{}}
 sync(){for(const k of ['cloud','aurora'])$(k+'Source').value=this.settings[k];$('volumeClouds').checked=this.settings.volume;$('cloudMotion').checked=this.settings.motion;$('weatherSeed').value=this.settings.seed;$('auroraStrength').value=this.settings.auroraStrength;$('cacheLimit').value=this.settings.limit;$('adaptiveEffects').checked=this.settings.adaptive;$('earthExposure').value=this.settings.exposure;this.env.api.renderer.toneMappingExposure=this.settings.exposure;}
 bind(){
  for(const k of ['cloud','aurora']){$(k+'Source').onchange=()=>{this.settings[k]=$(k+'Source').value;this.save();this.apply(k).catch(e=>this.fail(k,e));};$(k+'History').onchange=()=>{this.settings[k+'History']=$(k+'History').value;this.settings[k]='history';$(k+'Source').value='history';this.save();this.apply(k).catch(e=>this.fail(k,e));};}
  for(const [id,key] of [['volumeClouds','volume'],['cloudMotion','motion']])$(id).onchange=()=>{this.settings[key]=$(id).checked;this.save();};
  $('weatherSeed').oninput=()=>{this.settings.seed=$('weatherSeed').value.slice(0,80);this.save();};$('newWeatherSeed').onclick=()=>{this.settings.seed=String(crypto.getRandomValues(new Uint32Array(1))[0]);$('weatherSeed').value=this.settings.seed;this.save();};
  $('auroraStrength').oninput=()=>{this.settings.auroraStrength=Number($('auroraStrength').value);this.save();};$('adaptiveEffects').onchange=()=>{this.settings.adaptive=$('adaptiveEffects').checked;this.save();};
  $('earthExposure').oninput=()=>{this.settings.exposure=Number($('earthExposure').value);this.env.api.renderer.toneMappingExposure=this.settings.exposure;this.save();};
  $('updateCloudSource').onclick=async()=>{if(this.busy)return;this.busy=true;$('updateCloudSource').disabled=$('updateEnvironment').disabled=$('clearEnvironment').disabled=true;try{await this.updateCloud();await this.apply('cloud');await this.trim();}catch(e){this.fail('cloud',e);}finally{this.busy=false;$('updateCloudSource').disabled=$('updateEnvironment').disabled=$('clearEnvironment').disabled=false;this.render();}};
  $('updateEnvironment').onclick=()=>this.updateAll();$('clearEnvironment').onclick=()=>{$('cacheDialog').showModal();};$('closeCacheDialog').onclick=()=>$('cacheDialog').close();$('confirmClearCache').onclick=()=>this.clear().catch(e=>this.fail('cache',e));
  $('cacheLimit').onchange=async()=>{this.settings.limit=clamp(Number($('cacheLimit').value)||200,20,2000);$('cacheLimit').value=this.settings.limit;this.save();await this.trim();};
  $('importSnapshot').onchange=async e=>{try{const f=e.target.files[0];if(f)await this.importFile(f);}catch(err){this.fail('cache',err);}finally{e.target.value='';}};
  $('photoMode').onclick=()=>{document.body.classList.toggle('photo-mode');$('photoExit').hidden=!document.body.classList.contains('photo-mode');};$('photoExit').onclick=()=>{document.body.classList.remove('photo-mode');$('photoExit').hidden=true;};document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('photoExit').click();}});
  $('save4K').onclick=()=>this.capture();$('saveEnvironmentPreset').onclick=()=>this.savePreset();$('loadEnvironmentPreset').onclick=()=>this.loadPreset().catch(e=>this.fail('cache',e));$('deleteEnvironmentPreset').onclick=()=>{const presets=this.presets();presets.splice(Number($('environmentPresets').value),1);localStorage.setItem('tiangong-environment-presets-v1',JSON.stringify(presets));this.renderPresets();};this.renderPresets();
 }
 fail(k,e){this.messages[k]={key:'未更新，保留已有数据：{error}',params:{error:e.message||String(e)}};this.render();}
 async reload(){this.items=await this.cache.all();this.render();}
 async trim(){await this.cache.trim(this.settings.limit*1024*1024,Object.values(this.active).filter(Boolean));await this.reload();}
 async fetch(url,max=16e6){const r=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);if(Number(r.headers.get('content-length'))>max)throw Error('数据超过大小限制');const blob=await r.blob();if(blob.size>max)throw Error('数据超过大小限制');return {blob,r};}
 async store(kind,blob,extra={}){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');const id=kind+'-'+(extra.provider==='satcorps'?'satcorps-'+extra.time+'-':'')+hash;const existing=this.items.find(x=>x.id===id);if(existing){this.messages[kind]='已是最新可用数据';return existing;}
  const record={id,kind,blob,size:blob.size,downloaded:Date.now(),time:null,favorite:false,source:SOURCE[kind],...extra};await this.cache.put(record);await this.reload();this.messages[kind]='更新成功';return record;}
 async updateAll(){if(this.busy)return;this.settings.checked=Date.now();this.save();this.busy=true;$('updateCloudSource').disabled=$('updateEnvironment').disabled=$('clearEnvironment').disabled=$('importSnapshot').disabled=true;this.messages={cloud:'检查中…',aurora:'检查中…',orbit:'检查中…',assets:'内置素材已就绪，无需重复下载'};this.render();
  try{await Promise.allSettled(['cloud','aurora','orbit'].map(async k=>{try{
   if(k==='cloud')await this.updateCloud();
   if(k==='aurora'){const {blob}=await this.fetch(SOURCE.aurora,3e6),v=validateAurora(JSON.parse(await blob.text()));await this.store(k,blob,{time:v.time,observed:v.observed,resolution:'360×181'});}
   if(k==='orbit'){let text;try{const r=await this.fetch('/api/orbit',6e6);text=await r.blob.text();}catch{const r=await this.fetch(SOURCE.orbit,6e6);text=await r.blob.text();}const data=parseOfficialOrbit(text);data.source='中国载人航天工程办公室 / BACC';const row=await this.store(k,new Blob([JSON.stringify(data)],{type:'application/json'}),{time:Date.parse(data.created)||data.rows[0][0]});this.useOrbit(data);this.active.orbit=row.id;this.settings.orbitRecord=row.id;this.save();}
   if(k!=='orbit')await this.apply(k);this.render();
  }catch(e){this.fail(k,e);}}));await this.trim();}finally{this.busy=false;$('updateCloudSource').disabled=$('updateEnvironment').disabled=$('clearEnvironment').disabled=$('importSnapshot').disabled=false;this.render();}
 }
 useOrbit(data,notify=true){this.sim.data=data;this.sim.dataUI();this.sim.lastOrbit=0;this.sim.lastEvent=0;this.sim.event=null;this.sim.dirty=true;this.sim.snap=true;if(this.sim.time<this.sim.start||this.sim.time>this.sim.end){this.sim.seek((this.sim.start+this.sim.end)/2);if(notify)this.env.api.toast('模拟时间超出新数据范围，已暂停在数据中点');}}
 async updateNASA(){
  if(!/^https?:$/.test(location.protocol))throw Error('请用桌面启动器打开软件后下载 NASA 云图');
  const call=async(path,method='GET')=>{const response=await fetch('/api/cloud/satcorps/'+path,{method,cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('请重新启动桌面软件以启用 NASA 图源');return response.json();};
  let job=await call('update','POST');const deadline=Date.now()+20*60e3;
  while(job.state==='running'){
   this.messages.cloud=job.status||'NASA 云图下载中…';const progress=String(job.status||'').match(/^下载 NASA 云层字段 (\d+)\/(\d+)$/);if(progress)this.messages.cloud={key:'下载 NASA 云层字段 {done}/{total}',params:{done:progress[1],total:progress[2]}};const dated=String(job.status||'').match(/^(.*?) · (\d{4}-\d{2}-\d{2})(.*)$/);if(dated)this.messages.cloud={key:dated[1]+' · {date}'+dated[3],params:{date:dated[2]}};this.render();
   if(Date.now()>deadline)throw Error('NASA 下载超时，已有云图已保留');
   await new Promise(resolve=>setTimeout(resolve,1500));job=await call('status');
  }
  return this.acceptNASA(job);
 }
 async acceptNASA(job){
  if(job.state!=='ready')throw Error(job.error||'NASA 云图暂不可用');
  const meta=validateNASA(job.result),{blob}=await this.fetch('/api/cloud/satcorps/image',40e6);
  await this.validateCloud(blob);validateNASA(meta);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==meta.sha256)throw Error('NASA 云图校验失败，请重新下载');
  const row=await this.store('cloud',blob,meta);if(meta.updateMessage)this.messages.cloud=meta.updateMessage;return row;
 }
 async updateCloud(){
  const current=this.items.find(r=>r.id===this.settings.cloudHistory);
  if(this.settings.cloud==='satcorps'||(this.settings.cloud==='history'&&cloudProvider(current)==='satcorps'))return this.updateNASA();
  // Prefer lossless alpha. Validate before caching; fall back to the legacy JPEG
  // if the PNG is unavailable, while retaining all existing snapshots.
  let blob,source=SOURCE.cloud,channel='alpha';
  try{({blob}=await this.fetch(source,40e6));await this.validateCloud(blob,true);}
  catch{source=CLOUD_JPEG;channel='red';({blob}=await this.fetch(source));await this.validateCloud(blob);}
  return this.store('cloud',blob,{provider:'github',source,channel,resolution:'8192×4096'});
 }
 async validateCloud(blob,alpha=false){if(alpha){const header=new Uint8Array(await blob.slice(0,8).arrayBuffer());if(![137,80,78,71,13,10,26,10].every((v,i)=>header[i]===v))throw Error('云图格式无效');}const image=await createImageBitmap(blob);try{if(image.width!==8192||image.height!==4096)throw Error('云图尺寸无效');}finally{image.close();}}
 bindCloud(){this.env.uniforms.cloudTone.value=this.cloudTexture?(this.cloudTexture.userData.cloudTone??cloudTone(this.cloudRecord)):0;this.env.uniforms.cloudMap.value=this.cloudTexture||this.env.builtinCloud||this.env.fallback;this.env.uniforms.cloudChannel.value=this.cloudTexture?(this.cloudTexture.userData.cloudChannel??(cloudChannel(this.cloudRecord)==='alpha'?1:0)):0;}
 async texture(record,isStale=()=>false){if(record.kind==='aurora'){const d=auroraPixels(JSON.parse(await record.blob.text()));const tex=new THREE.DataTexture(d,360,181,THREE.RedFormat);tex.minFilter=tex.magFilter=THREE.LinearFilter;tex.wrapS=THREE.RepeatWrapping;tex.needsUpdate=true;return tex;}
  const decode=async()=>{
   if(isStale())return null;
   let bitmap=await createImageBitmap(record.blob,{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'});
   try{const size=cloudDecodeSize(bitmap.width,bitmap.height,this.env.quality,this.env.api.renderer.capabilities.maxTextureSize);let tex;
    if(cloudTone(record)===1){
     const {output,width,height}=await prepareGithubCloud(bitmap,cloudChannel(record),size);
     tex=new THREE.DataTexture(output,width,height,THREE.RedFormat);tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;
     tex.userData.cloudChannel=0;tex.userData.cloudTone=0;
    }else{
     if(size.width!==bitmap.width){bitmap.close();bitmap=await createImageBitmap(record.blob,{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none',resizeWidth:size.width,resizeHeight:size.height,resizeQuality:'high'});}
     tex=new THREE.Texture(bitmap);
    }
    tex.flipY=false;tex.colorSpace=THREE.NoColorSpace;tex.wrapS=THREE.RepeatWrapping;tex.anisotropy=Math.min(this.env.quality==='high'?16:4,this.env.api.renderer.capabilities.getMaxAnisotropy());tex.needsUpdate=true;return tex;
   }catch(error){bitmap.close();throw error;}
  };
  const pending=(this.cloudDecodeTask||Promise.resolve()).catch(()=>{}).then(decode);this.cloudDecodeTask=pending;try{return await pending;}finally{if(this.cloudDecodeTask===pending)this.cloudDecodeTask=null;}
 }

 release(k){const tex=this[k+'Texture'];if(tex){tex.dispose();tex.image?.close?.();this[k+'Texture']=null;}this.active[k]=null;}
 async apply(k){const mode=this.settings[k];let record=null;
  if(['latest','history','satcorps'].includes(mode)){record=k==='cloud'?selectCloud(this.items,mode,this.sim.time,this.settings[k+'History']):selectSnapshot(this.items,k,mode,this.sim.time,this.settings[k+'History']);if(record&&mode==='history'&&this.settings[k+'History']==='auto'&&Math.abs(record.time-this.sim.time)>6*3600e3)record=null;}
  this.pendingApply??={};const key=record?record.id+'|'+(k==='cloud'?this.env.quality:''):mode+'|none';
  if(this.pendingApply[k]?.key===key&&this.pendingApply[k].token===this.tokens[k])return this.pendingApply[k].promise;
  const token=++this.tokens[k],run=async()=>{
  if(record&&this.active[k]===record.id&&!(k==='cloud'&&this.cloudTier!==this.env.quality)){if(k==='cloud')this.bindCloud();this.status(k);return;}
  if(record){const tex=await this.texture(record,()=>token!==this.tokens[k]);if(!tex)return;if(token!==this.tokens[k]){tex.dispose();tex.image?.close?.();return;}this.release(k);this[k+'Texture']=tex;this.active[k]=record.id;this.cloudTier=this.env.quality;if(k==='cloud')this.cloudRecord=record;}
  else {const had=!!this.active[k];this.release(k);if(!had&&this.appliedMode?.[k]===mode){this.status(k);return;}}
  this.appliedMode??={};this.appliedMode[k]=mode;
  if(k==='cloud')this.bindCloud();
  else this.env.auroraUniforms.auroraMap.value=this.auroraTexture||this.env.fallback;
  this.render();
  };
  const promise=run(),request={key,promise,token};this.pendingApply[k]=request;
  try{return await promise;}finally{if(this.pendingApply[k]===request)delete this.pendingApply[k];}
 }
 async clear(){const selected=[...document.querySelectorAll('[data-clear-kind]:checked')].map(x=>x.dataset.clearKind),include=$('clearFavorites').checked;
  if(selected.includes('cloud')&&/^https?:$/.test(location.protocol)){try{const r=await fetch('/api/cloud/satcorps/clear',{method:'POST'});if(r.ok&&!(await r.json()).cleared)throw Error('云图正在下载，请完成后清理');}catch(e){if(e.message.includes('正在下载'))throw e;}}
  for(const k of ['cloud','aurora'])if(selected.includes(k)){++this.tokens[k];this.release(k);if(k==='cloud')this.bindCloud();else this.env.auroraUniforms.auroraMap.value=this.env.fallback;}
  if(selected.includes('orbit')){this.useOrbit(this.sim.bundledOrbit);this.active.orbit=null;this.settings.orbitRecord=null;this.save();}
  for(const r of this.items)if(selected.includes(r.kind)&&(!r.favorite||include))await this.cache.remove(r.id);
  await this.reload();await Promise.allSettled(['cloud','aurora'].map(k=>this.apply(k)));$('cacheDialog').close();this.messages.cache='缓存已清理，组合和设置已保留';this.render();
 }
 async remove(id){const item=this.items.find(x=>x.id===id);if(!item||item.favorite)return;for(const k of ['cloud','aurora'])if(this.active[k]===id){++this.tokens[k];this.release(k);if(k==='cloud')this.bindCloud();else this.env.auroraUniforms.auroraMap.value=this.env.fallback;}if(item.kind==='orbit'&&this.active.orbit===id){this.useOrbit(this.sim.bundledOrbit);this.active.orbit=null;this.settings.orbitRecord=null;this.save();}await this.cache.remove(id);await this.reload();await Promise.allSettled(['cloud','aurora'].map(k=>this.apply(k)));}
 async exportRecord(record){const bytes=new Uint8Array(await record.blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));const {blob,...meta}=record;saveFile(new Blob([JSON.stringify({format:'tiangong-weather-1',meta,base64:btoa(s)})],{type:'application/json'}),'Tiangong-'+record.kind+'-'+record.id.slice(-8)+'.json');}
 async importFile(file){if(file.size>64e6)throw Error('文件超过 64 MB');const x=JSON.parse(await file.text());if(x.format!=='tiangong-weather-1'||!['cloud','aurora','orbit'].includes(x.meta?.kind)||typeof x.base64!=='string')throw Error('无效快照文件');const k=x.meta.kind,bytes=Uint8Array.from(atob(x.base64),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:k==='cloud'?(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'image/png':'image/jpeg'):'application/json'});let time=null,observed=null;
  if(k==='aurora'){const v=validateAurora(JSON.parse(await blob.text()));time=v.time;observed=v.observed;}else if(k==='orbit'){const v=validateOrbit(JSON.parse(await blob.text()));time=Date.parse(v.created)||v.rows[0][0];}else{const im=await createImageBitmap(blob);const valid=im.width>=1024&&im.width<=8192&&im.width===im.height*2;im.close();if(!valid)throw Error('云图尺寸无效');}
  const nasa=k==='cloud'&&x.meta.provider==='satcorps'?{...validateNASA(x.meta),source:x.meta.source}:{};if(nasa.provider){await this.validateCloud(blob);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==nasa.sha256)throw Error('NASA 云图校验失败，请重新下载');}const record=await this.store(k,blob,{time,observed,source:'导入快照',favorite:true,...(k==='cloud'?{channel:cloudChannel(x.meta),provider:cloudProvider(x.meta)}:{}),...Object.fromEntries(Object.entries(nasa).filter(([key])=>['provider','time','observedStart','observedEnd','resolution','nativeResolution','channel','coverage','polarCoverage','footprint','release','source','sources','sha256'].includes(key)))});record.favorite=true;await this.cache.put(record);if(k!=='orbit'){this.settings[k]='history';this.settings[k+'History']=record.id;this.sync();this.save();await this.apply(k);}if(k==='orbit'){this.useOrbit(validateOrbit(JSON.parse(await blob.text())));this.active.orbit=record.id;this.settings.orbitRecord=record.id;this.save();}this.render();}
 async preview(image,record){
  this.previewQueue=(this.previewQueue||Promise.resolve()).catch(()=>{}).then(async()=>{
   if(!image.isConnected)return;
   this.thumbnails??=new Map();let blob=this.thumbnails.get(record.id);
   if(!blob){const bitmap=await createImageBitmap(record.blob,{resizeWidth:512,resizeHeight:256,resizeQuality:'high'});try{const canvas=new OffscreenCanvas(512,256),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);if(cloudChannel(record)==='alpha'){const im=ctx.getImageData(0,0,512,256);for(let i=0;i<im.data.length;i+=4){im.data[i]=im.data[i+1]=im.data[i+2]=im.data[i+3];im.data[i+3]=255;}ctx.putImageData(im,0,0);}blob=await canvas.convertToBlob({type:'image/jpeg',quality:.85});}finally{bitmap.close();}this.thumbnails.set(record.id,blob);if(this.thumbnails.size>12)this.thumbnails.delete(this.thumbnails.keys().next().value);}
   if(!image.isConnected)return;
   const url=URL.createObjectURL(blob);this.previewURLs.add(url);image.onload=image.onerror=()=>{URL.revokeObjectURL(url);this.previewURLs.delete(url);};image.src=url;
  }).catch(()=>{});
  return this.previewQueue;
 }
 render(){if(!$('weatherHistory'))return;
  this.previewURLs??=new Set();for(const url of this.previewURLs)URL.revokeObjectURL(url);this.previewURLs.clear();
  const total=this.items.reduce((n,x)=>n+x.size,0);$('cacheUsage').textContent=t('缓存 {size} MB / {limit} MB · {count} 份',{size:(total/1048576).toFixed(1),limit:this.settings.limit,count:this.items.length})+(total>this.settings.limit*1048576?t(' · 收藏／当前使用数据超出预算，未自动删除'):'')+(this.cache.persistent?'':t(' · 当前浏览器仅支持临时缓存'));
  $('lastDataCheck').textContent=t('上次检查')+': '+(this.settings.checked?fmt(this.settings.checked):t('尚未检查'));$('dataUpdates').replaceChildren();for(const k of ['cloud','aurora','orbit','assets','cache'])if(this.messages[k]){const p=document.createElement('p');p.className='small';p.textContent=(names[k]?t(names[k])+': ':'')+(typeof this.messages[k]==='object'?t(this.messages[k].key,this.messages[k].params):t(this.messages[k]));$('dataUpdates').append(p);}
  for(const k of ['cloud','aurora']){const sel=$(k+'History');sel.replaceChildren(new Option(t('跟随模拟时间（±6小时）'),'auto'));for(const r of this.items.filter(x=>x.kind===k).sort((a,b)=>b.downloaded-a.downloaded))sel.add(new Option((k==='cloud'?(cloudProvider(r)==='satcorps'?'NASA · ':'github · '):'')+fmt(r.time)+(r.time?'':' · '+t('下载')+' '+fmt(r.downloaded)),r.id));sel.value=this.settings[k+'History'];if(sel.selectedIndex<0){const missing=new Option(t('快照已删除'),this.settings[k+'History']);missing.disabled=true;sel.add(missing);sel.value=this.settings[k+'History'];}sel.disabled=this.settings[k]!=='history';this.status(k);}
  const list=$('weatherHistory');list.replaceChildren();for(const r of [...this.items].sort((a,b)=>b.downloaded-a.downloaded)){const card=document.createElement('div');card.className='snapshot-card';const text=document.createElement('p');text.className='small';text.textContent=`${t(names[r.kind])} · ${fmt(r.time)}\n${t('下载')} ${fmt(r.downloaded)} · ${(r.size/1048576).toFixed(1)} MB\n${r.source}`;card.append(text);
   if(r.kind==='cloud'){const image=document.createElement('img');image.alt=t('云图预览');image.loading='lazy';image.width=512;image.height=256;card.append(image);this.preview(image,r);}
   const buttons=document.createElement('div');buttons.className='angle-actions';for(const [label,fn] of [[r.favorite?'取消收藏':'收藏',async()=>{r.favorite=!r.favorite;await this.cache.put(r);await this.reload();}],['导出',()=>this.exportRecord(r)],['删除',()=>this.remove(r.id)]]){const b=document.createElement('button');b.textContent=t(label);b.disabled=label==='删除'&&r.favorite;b.onclick=()=>Promise.resolve(fn()).catch(e=>this.fail('cache',e));buttons.append(b);}card.append(buttons);list.append(card);}
 }
 status(k){const mode=this.settings[k],r=this.items.find(x=>x.id===this.active[k]);let s=t(mode==='local'?'本地生成':mode==='off'?'已关闭':mode==='builtin'?'内置静态云图':r?(k==='aurora'?'NOAA 极光预测':'卫星合成云图'):'没有匹配快照，使用内置云图／关闭极光');if(r)s+='\n'+t(k==='aurora'?'预测有效时间':'观测时间')+': '+fmt(r.time)+'\n'+t('下载')+': '+fmt(r.downloaded)+(r.time?'\n'+t('与模拟时间相差 {hours} 小时',{hours:(Math.abs(this.sim.time-r.time)/3600e3).toFixed(1)}):'');if(k==='cloud'&&mode==='satcorps'&&!r)s=t('尚未下载 NASA 完整云图，当前显示内置云图');if(k==='cloud'&&r&&cloudProvider(r)==='satcorps')s+='\nNASA · '+r.resolution+'\n'+t('观测范围')+': '+fmt(r.observedStart)+' — '+fmt(r.observedEnd)+'\n'+t('有效反演像素')+': '+(100*r.coverage).toFixed(2)+'%';$(k+'DataStatus').textContent=s;}
 update(q){const e=this.env,s=this.settings,u=e.uniforms,a=e.auroraUniforms,timestamp=q?.t??this.sim.time;u.weatherTime.value=a.weatherTime.value=(timestamp-Date.UTC(2026,0,1))/3600e3;u.seed.value=a.seed.value=seedNumber(s.seed);u.cloudMode.value=s.cloud==='local'?1:0;u.cloudMotion.value=e.quality==='high'&&s.motion?1:0;const cloudRecord=this.items.find(x=>x.id===this.active.cloud);u.motionTime.value=cloudRecord?clamp((timestamp-(cloudRecord.time??cloudRecord.downloaded))/3600e3,-6,6):6.*Math.sin(u.weatherTime.value*.04);if(s.cloud==='off')u.cloudAmount.value=0;this.env.volumeClouds.visible=this.env.volumeClouds.visible&&s.cloud!=='off';
  e.aurora.visible=s.aurora==='local'||(['latest','history'].includes(s.aurora)&&!!this.auroraTexture);a.useData.value=s.aurora==='local'?0:1;a.strength.value=s.auroraStrength;e.aurora.quaternion.copy(e.earth.quaternion);
  const now=performance.now();this.frames++;if(now-this.fpsStart>2500){this.fps=this.frames*1000/(now-this.fpsStart);this.frames=0;this.fpsStart=now;
   if(!s.adaptive){this.lowEffects=false;this.fastWindows=0;}else if(this.fps<24){this.lowEffects=true;this.fastWindows=0;}else if(this.fps>38){this.fastWindows=(this.fastWindows||0)+1;if(this.fastWindows>=2)this.lowEffects=false;}else this.fastWindows=0;
   const desired=e.quality==='high'?32:e.quality==='standard'?16:8,steps=this.lowEffects?Math.min(e.quality==='high'?24:12,desired):desired;e.atmosphere.material.uniforms.steps.value=steps;e.uniforms.cloudSteps.value=this.lowEffects?16:28;$('performanceStatus').textContent=t('{fps} FPS',{fps:this.fps.toFixed(0)});}
  if(now-this.lastUI>1000){if(s.cloud==='satcorps'&&cloudRecord&&!completeNASA(cloudRecord))this.apply('cloud').catch(err=>this.fail('cloud',err));this.status('cloud');this.status('aurora');$('weatherSimTime').textContent=t('模拟时间')+': '+fmt(timestamp);this.lastUI=now;}
  if(now-this.lastHistory>1500){this.lastHistory=now;for(const k of ['cloud','aurora'])if(s[k]==='history'&&s[k+'History']==='auto')this.apply(k).catch(err=>this.fail(k,err));}
 }
 presets(){try{return JSON.parse(localStorage.getItem('tiangong-environment-presets-v1'))||[];}catch{return [];}}
 renderPresets(){const sel=$('environmentPresets');sel.replaceChildren();for(const [i,p] of this.presets().entries())sel.add(new Option(p.name,String(i)));$('loadEnvironmentPreset').disabled=$('deleteEnvironmentPreset').disabled=!sel.options.length;}
 savePreset(){const p=this.presets(),api=this.env.api,sim=this.sim;p.push({name:($('environmentPresetName').value.trim()||'Earth '+(p.length+1)).slice(0,60),time:sim.time,view:sim.view,settings:{...this.settings},environment:{...this.env.settings},camera:api.camera.position.toArray(),target:api.controls.target.toArray(),spaceCamera:sim.spaceCamera.position.toArray(),spaceTarget:sim.orbitControls.target.toArray()});localStorage.setItem('tiangong-environment-presets-v1',JSON.stringify(p));this.renderPresets();}
 async loadPreset(){const p=this.presets()[Number($('environmentPresets').value)];if(!p)return;const record=this.items.find(r=>r.id===p.settings.orbitRecord&&r.kind==='orbit'),previous=this.active.orbit||null;
  if(record){this.useOrbit(validateOrbit(JSON.parse(await record.blob.text())),false);this.active.orbit=record.id;}
  else if(!p.settings.orbitRecord){this.useOrbit(this.sim.bundledOrbit,false);this.active.orbit=null;}
  else this.env.api.toast('收藏的轨道缓存已删除，已保留当前轨道。');
  Object.assign(this.settings,p.settings);this.settings.orbitRecord=record?record.id:p.settings.orbitRecord?previous:null;this.sync();this.save();Object.assign(this.env.settings,p.environment);this.env.save();await this.env.setQuality(p.environment.quality);await this.env.setSkyStyle();for(const [id,k] of [['showMoon','moon'],['showStars','stars'],['showClouds','clouds'],['showMilky','milky'],['starNames','starLabels'],['groundTrack','groundTrack']])$(id).checked=this.env.settings[k];$('skyExposure').value=this.env.settings.exposure;$('cloudOpacity').value=this.env.settings.cloudOpacity;$('starBrightness').value=this.env.settings.starBrightness;
 if(p.time>=this.sim.start&&p.time<=this.sim.end)this.sim.seek(p.time);else this.env.api.toast('收藏时间超出轨道有效期，已保留当前时间');this.sim.setView(p.view);this.env.api.camera.position.fromArray(p.camera);this.env.api.controls.target.fromArray(p.target);this.env.api.controls.update();this.sim.spaceCamera.position.fromArray(p.spaceCamera);this.sim.orbitControls.target.fromArray(p.spaceTarget);this.sim.orbitControls.update();await Promise.allSettled(['cloud','aurora'].map(k=>this.apply(k)));}
 capture(){const {renderer,camera}=this.env.api,size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio(),aspect=camera.aspect;try{const max=renderer.capabilities.maxTextureSize,w=Math.min(3840,max,Math.floor(max*aspect)),h=Math.round(w/aspect);renderer.setPixelRatio(1);renderer.setSize(w,h,false);this.sim.render();const url=renderer.domElement.toDataURL('image/png'),a=document.createElement('a');a.href=url;a.download='Tiangong-Earth-'+new Date(this.sim.time).toISOString().replaceAll(':','-')+'.png';a.click();}finally{renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);}}
}
