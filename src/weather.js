import {fetchResource,blobHash} from './resource-fetch.js';
import {presetWeatherSettings} from './environment-presets.js';
import {mountResourcePanel} from './resource-panel.js';
import {WEB_BUILD} from './runtime-assets.js';
import {normalizeGeographySettings,syncGeographyControls} from './geography-settings.js';
import {normalizeStarChartSettings,syncStarChartControls} from './star-chart-settings.js';
import {validateRotation} from './spacecraft-attitude.js';
import {prepareGithubCloud} from './cloud-mask-repair.js';
import {cloudProvider,selectCloud,validateNASA,completeNASA,retireNASA} from './cloud-source.js';
import {CLOUD_PNG,CLOUD_JPEG,cloudChannel,cloudDecodeSize,cloudTone} from './cloud-texture.js';
import {OrbitRepository,orbitSource} from './orbit-repository.js';
import * as THREE from 'three';
import {t,onLanguageChange} from './i18n.js';
import {WeatherCache} from './weather-cache.js';
import {validateAurora,auroraPixels,selectSnapshot,seedNumber,clamp} from './weather-math.js';
import {DEFAULT_MISSION,mission,bindOrbit,validatePose} from './missions.js';
import {validateOrbit} from './orbit.js';
const $=id=>document.getElementById(id),fmt=x=>Number.isFinite(x)?new Date(x).toISOString().replace('T',' ').slice(0,19)+' UTC':t('观测时间未提供');
const SOURCE={cloud:CLOUD_PNG,aurora:'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',orbit:'https://en.cmse.gov.cn/news/202107/t20210722_48418.html'};
const names={cloud:'云图',aurora:'极光',orbit:'轨道',assets:'内置素材'};
const saveFile=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
export class Weather{
 constructor(env){
  this.env=env;this.sim=env.sim;this.cache=new WeatherCache();this.items=[];this.active={};this.tokens={cloud:0,aurora:0};this.messages={};this.busy=false;this.lastUI=0;this.lastHistory=0;this.lastFrame=performance.now();this.frames=0;this.fpsStart=this.lastFrame;this.fps=60;
  this.pendingRecords=new Set();this.jobs=new Map();this.resourceStates={};this.historyDirty=this.choicesDirty=true;
  this.settings={autoClean:true,resourceChecks:{},cloud:'builtin',aurora:'off',cloudHistory:'auto',auroraHistory:'auto',seed:'StarOrbit',auroraStrength:1.4,limit:200,adaptive:true,exposure:1.15,volume:false,motion:true};
  try{Object.assign(this.settings,JSON.parse(localStorage.getItem('tiangong-weather-settings-v1'))||{});}catch{}
  this.sim.orbits=new OrbitRepository(this.sim,this,this.settings);
  delete this.settings.orbitRecord;delete this.settings.orbitRecords;
  // Legacy scene/preset readers use these accessors; persistence lives in OrbitRepository.
  Object.defineProperties(this.settings,{orbitRecord:{get:()=>this.sim.orbits.selected,set:v=>{this.sim.orbits.selected=v;}},orbitRecords:{get:()=>this.sim.orbits.records}});
  for(const kind of ['cloud','aurora'])if(!['builtin','off','latest','history','local',...(kind==='cloud'?['satcorps']:[])].includes(this.settings[kind]))this.settings[kind]=kind==='cloud'?'builtin':'off';
  this.settings.limit=clamp(Number(this.settings.limit)||200,20,2000);this.settings.auroraStrength=clamp(Number.isFinite(Number(this.settings.auroraStrength))?Number(this.settings.auroraStrength):1.4,0,4);this.settings.seed=String(this.settings.seed).slice(0,80);this.settings.exposure=clamp(Number(this.settings.exposure)||1.15,.3,2.5);
  // Background suspension is not a low-performance sample. Keep the simulation clock intact.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){this.fpsStart=performance.now();this.frames=0;this.fastWindows=0;}});
  this.settings.autoClean=this.settings.autoClean!==false;
  if(!this.settings.resourceChecks||typeof this.settings.resourceChecks!=='object')this.settings.resourceChecks={};
  if(!['satcorps','github'].includes(this.settings.cloudDownloadProvider))this.settings.cloudDownloadProvider=this.settings.cloud==='satcorps'?'satcorps':WEB_BUILD?'github':'satcorps';
  this.resourcePanel=mountResourcePanel(this);
  this.bind();this.sync();this.ready=this.restore();onLanguageChange(()=>{this.historyDirty=this.choicesDirty=true;this.render();this.renderPresets();});
 }
 async restore(){try{
  const retired=await retireNASA(this.cache);if(retired.includes(this.settings.cloudHistory)){this.settings.cloudHistory='auto';if(this.settings.cloud==='history')this.settings.cloud='satcorps';this.sync();}
  await this.reload();await this.sim.orbits.restore();this.save();await Promise.allSettled(['cloud','aurora'].map(k=>this.apply(k)));
 }catch(e){this.messages.cache=e.message;}this.render();
 // Shared server resources restore independently of model/orbit readiness.
 this.nasaRestore=this.restoreNASA().catch(e=>{this.messages.cloud=e.message;this.setResourceState('cloud','satcorps',{phase:'error',message:e.message});});
 }
 save(){this.sim.orbits.save();try{localStorage.setItem('tiangong-weather-settings-v1',JSON.stringify(this.settings));}catch{}}
 sync(){for(const k of ['cloud','aurora'])$(k+'Source').value=this.settings[k];$('volumeClouds').checked=this.settings.volume;$('cloudMotion').checked=this.settings.motion;$('weatherSeed').value=this.settings.seed;$('auroraStrength').value=this.settings.auroraStrength;$('cacheLimit').value=this.settings.limit;$('autoCleanCache').checked=this.settings.autoClean;$('adaptiveEffects').checked=this.settings.adaptive;$('earthExposure').value=this.settings.exposure;this.env.api.renderer.toneMappingExposure=this.settings.exposure;}
 bind(){
  for(const k of ['cloud','aurora']){$(k+'Source').onchange=()=>this.setSource(k,$(k+'Source').value).catch(e=>this.fail(k,e));$(k+'History').onchange=()=>this.setSource(k,'history',$(k+'History').value).catch(e=>this.fail(k,e));}
  for(const [id,key] of [['volumeClouds','volume'],['cloudMotion','motion']])$(id).onchange=()=>{this.settings[key]=$(id).checked;this.save();};
  $('weatherSeed').oninput=()=>{this.settings.seed=$('weatherSeed').value.slice(0,80);this.save();};$('newWeatherSeed').onclick=()=>{this.settings.seed=String(crypto.getRandomValues(new Uint32Array(1))[0]);$('weatherSeed').value=this.settings.seed;this.save();};
  $('auroraStrength').oninput=()=>{this.settings.auroraStrength=Number($('auroraStrength').value);this.save();};$('adaptiveEffects').onchange=()=>{this.settings.adaptive=$('adaptiveEffects').checked;this.save();};
  $('earthExposure').oninput=()=>{this.settings.exposure=Number($('earthExposure').value);this.env.api.renderer.toneMappingExposure=this.settings.exposure;this.save();};
  $('updateCloudSource').onclick=()=>{if(this.settings.cloud==='satcorps')this.settings.cloudDownloadProvider='satcorps';else if(this.settings.cloud==='latest')this.settings.cloudDownloadProvider='github';this.resourcePanel.open('cloud');};
  $('updateEnvironment').onclick=()=>this.updateAll();$('clearEnvironment').onclick=()=>{if(this.busy)return;$('cacheDialog').showModal();};$('closeCacheDialog').onclick=()=>$('cacheDialog').close();$('confirmClearCache').onclick=()=>this.clear().catch(e=>this.fail('cache',e));
  $('cacheLimit').onchange=async()=>{this.settings.limit=clamp(Number($('cacheLimit').value)||200,20,2000);$('cacheLimit').value=this.settings.limit;this.save();try{await this.trim();}catch(e){this.fail('cache',e);}};
  $('autoCleanCache').onchange=async()=>{this.settings.autoClean=$('autoCleanCache').checked;this.save();try{await this.trim();}catch(e){this.fail('cache',e);}};
  document.querySelector('[data-memory-key=downloads]').addEventListener('toggle',()=>{if(this.resourcePanel.active&&document.querySelector('[data-memory-key=downloads]').open)this.renderHistory();});
  $('importSnapshot').onchange=async e=>{try{const f=e.target.files[0];if(f)await this.importFile(f);}catch(err){this.fail('cache',err);}finally{e.target.value='';}};
  $('photoMode').onclick=()=>{document.body.classList.toggle('photo-mode');$('photoExit').hidden=!document.body.classList.contains('photo-mode');};$('photoExit').onclick=()=>{document.body.classList.remove('photo-mode');$('photoExit').hidden=true;};document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('photoExit').click();}});
  $('save4K').onclick=()=>this.capture();$('saveEnvironmentPreset').onclick=()=>this.savePreset();$('loadEnvironmentPreset').onclick=()=>this.loadPreset().catch(e=>this.fail('cache',e));$('deleteEnvironmentPreset').onclick=()=>{const presets=this.presets();presets.splice(Number($('environmentPresets').value),1);localStorage.setItem('tiangong-environment-presets-v1',JSON.stringify(presets));this.renderPresets();};this.renderPresets();
 }
 fail(k,e){this.messages[k]={key:'未更新，保留已有数据：{error}',params:{error:e.message||String(e)}};this.render();}
 async reload(){this.items=await this.cache.all();const total=this.items.reduce((n,r)=>n+r.size,0);this.cacheReport={...this.cacheReport,totalBytes:total,overBudget:total>this.settings.limit*1048576};this.historyDirty=this.choicesDirty=true;this.render();}
 protectedIds(extra=[]){return [...new Set([...this.presets().flatMap(p=>[p.settings?.orbitRecord,p.settings?.cloudHistory,p.settings?.auroraHistory]),...this.pendingRecords,...Object.values(this.pendingApply||{}).map(request=>request.recordId),...Object.values(this.active),...Object.values(this.settings.orbitRecords||{}),...['cloud','aurora'].filter(k=>this.settings[k]==='history').map(k=>this.settings[k+'History']),...extra].filter(x=>x&&x!=='none'&&x!=='auto'))];}
 async trim(extra=[]){this.cacheReport=await this.cache.trim(this.settings.limit*1048576,this.protectedIds(extra),this.settings.autoClean);if(this.cacheReport?.removedIds?.length){for(const id of this.cacheReport.removedIds)this.thumbnails?.delete(id);await this.reload();}else this.render();return this.cacheReport;}
 async fetch(url,max=16e6,options={}){return fetchResource(url,{max,...options});}
 async store(kind,blob,extra={}){
  const hash=extra.contentHash||await blobHash(blob);delete extra.contentHash;
  const id=kind+'-'+(kind==='orbit'?(extra.missionId||this.sim.missionId)+'-':'')+(extra.provider==='satcorps'?'satcorps-'+extra.time+'-':'')+hash;
  const existing=this.items.find(x=>x.id===id);
  if(existing){if(!existing.sha256||extra.http){existing.sha256=hash;if(extra.http)existing.http=extra.http;await this.cache.put(existing);}this.messages[kind]='已是最新可用数据';return existing;}
  const record={id,kind,...(kind==='orbit'?{missionId:extra.missionId||this.sim.missionId}:{}),blob,size:blob.size,sha256:hash,downloaded:Date.now(),time:null,favorite:false,source:SOURCE[kind],...extra};
  this.pendingRecords.add(id);
  try{await this.cache.put(record);}catch(error){
   // Recover only disposable history on real quota pressure; active/favourite data remain intact.
   if(error.name!=='QuotaExceededError'||!this.settings.autoClean){this.pendingRecords.delete(id);throw error;}
   try{await this.cache.trim(Math.max(0,this.items.reduce((n,r)=>n+r.size,0)-blob.size),this.protectedIds());await this.reload();await this.cache.put(record);}catch(retryError){this.pendingRecords.delete(id);throw retryError;}
  }
  try{await this.reload();await this.trim([id]);this.messages[kind]='更新成功';return record;}catch(error){this.pendingRecords.delete(id);throw error;}
 }
 resourceKey(kind,provider){return kind==='cloud'?'cloud:'+(provider||this.settings.cloudDownloadProvider):kind==='orbit'?'orbit:'+(provider||this.sim.missionId):kind;}
 resourceState(kind,provider){const key=this.resourceKey(kind,provider);return this.resourceStates[key]||this.settings.resourceChecks[key]||{phase:'idle'};}
 isUpdating(kind,provider){const key=this.resourceKey(kind,provider);return this.jobs.has(key)||(key==='cloud:satcorps'&&!!(this.nasaWatch||this.nasaRestoreTask));}
 latestRecord(kind,provider){if(kind==='cloud')provider??=this.settings.cloudDownloadProvider;const id=provider||this.sim.missionId;return kind==='cloud'?selectCloud(this.items,provider==='satcorps'?'satcorps':'latest',this.sim.time):selectSnapshot(this.items.filter(r=>kind!=='orbit'||(r.missionId||DEFAULT_MISSION)===id),kind,'latest');}
 setResourceState(kind,provider,state){const key=this.resourceKey(kind,provider);this.resourceStates[key]={...this.resourceState(kind,provider),...state};this.render();}
 async setSource(kind,mode,history=this.settings[kind+'History']){
  const previous={mode:this.settings[kind],history:this.settings[kind+'History']};this.settings[kind]=mode;this.settings[kind+'History']=history;this.sync();
  try{await this.apply(kind);this.save();this.historyDirty=true;this.render();}
  catch(error){if(this.settings[kind]===mode&&this.settings[kind+'History']===history){this.settings[kind]=previous.mode;this.settings[kind+'History']=previous.history;this.sync();this.save();await this.apply(kind);}throw error;}
 }
 async useLatest(kind,provider){
  const record=this.latestRecord(kind,provider);if(!record)throw Error('尚无已下载数据，请先检查更新或导入快照');
  if(kind==='orbit'){this.acceptOrbit(validateOrbit(JSON.parse(await record.blob.text())),record.id,provider||this.sim.missionId);}
  else await this.setSource(kind,kind==='cloud'&&provider==='satcorps'?'satcorps':'latest');
  this.historyDirty=true;await this.trim();this.render();
 }
 updateResource(kind,{provider}={}){
  provider=kind==='cloud'?(provider||this.settings.cloudDownloadProvider):kind==='orbit'?(provider||this.sim.missionId):undefined;
  const key=this.resourceKey(kind,provider);if(this.jobs.has(key))return this.jobs.get(key);
  if(this.sim.sceneBusy||this.sim.missions?.busy)return Promise.reject(Error('正在恢复场景…'));
  const run=async()=>{
   await this.ready;const before=new Set(this.items.map(r=>r.id));this.setResourceState(kind,provider,{phase:'checking',message:'检查中…'});
   try{
    let record,outcome;
    if(kind==='cloud'){record=await this.updateCloud(provider);outcome=record?this.lastCloudOutcome?.[provider]:null;}
    if(kind==='aurora')record=await this.updateAurora();
    if(kind==='orbit'){if(!orbitSource(provider))throw Error('此任务没有在线轨道源，请导入轨道文件');const r=await this.sim.orbits.update(provider);record=r?.record;outcome=r;}
    if(kind!=='orbit')await this.apply(kind);
    await this.trim(record?[record.id]:[]);
    const phase=outcome?.status==='partial'?'partial':outcome?.status==='unchanged'||(!outcome?.status&&record&&before.has(record.id))?'unchanged':'updated';
    const state={phase,checkedAt:outcome?.checkedAt||Date.now(),message:outcome?.message||(phase==='unchanged'?'已是最新可用数据':phase==='partial'?'检查未完成，保留已有数据':'已下载新版本'),recordId:record?.id};
    this.resourceStates[key]=state;this.settings.resourceChecks[key]=state;this.settings.checked=Date.now();this.save();return {status:phase,record};
   }catch(error){
    const timeout=['AbortError','TimeoutError'].includes(error.name),network=/Failed to fetch|Load failed|NetworkError|network request failed|^HTTP \d{3}$/i.test(error.message||'');
    const hint=timeout?'请求超时，已有数据已保留；请稍后重试。':network?(WEB_BUILD?'数据源暂不可访问或不允许网页直接读取；可使用桌面版更新或导入文件。已有数据已保留。':'数据源暂不可访问，请检查网络或稍后重试。已有数据已保留。'):null;
    const state={phase:'error',checkedAt:Date.now(),message:hint||{key:'未更新，保留已有数据：{error}',params:{error:error.message||String(error)}}};this.resourceStates[key]=state;this.settings.resourceChecks[key]=state;this.save();throw hint?new Error(hint,{cause:error}):error;
   }
   finally{for(const r of this.items)if(!before.has(r.id)&&r.kind===kind&&(kind!=='orbit'||(r.missionId||DEFAULT_MISSION)===provider)&&(kind!=='cloud'||cloudProvider(r)===provider))this.pendingRecords.delete(r.id);this.jobs.delete(key);this.busy=this.jobs.size>0||!!this.nasaWatch||!!this.nasaRestoreTask;this.render();}
  };
  this.busy=true;const promise=Promise.resolve().then(run);this.jobs.set(key,promise);this.render();return promise;
 }
 async updateAll(){
  if(this.sim.sceneBusy||this.sim.missions?.busy)return;
  const provider=this.settings.cloudDownloadProvider;
  const jobs=[['aurora'],['orbit',{provider:this.sim.missionId}]];
  if(!(WEB_BUILD&&provider==='satcorps'))jobs.push(['cloud',{provider}]);
  await Promise.allSettled(jobs.map(([kind,options])=>this.updateResource(kind,options)));this.render();
 }
 async updateAurora(){
  const cached=this.latestRecord('aurora'),response=await this.fetch(SOURCE.aurora,3e6,{cached,onProgress:p=>this.downloadProgress('aurora',undefined,p)});
  if(response.unchanged)return cached;
  const hash=await blobHash(response.blob),existing=this.items.find(r=>r.kind==='aurora'&&(r.sha256===hash||r.id.endsWith(hash)));if(existing){existing.sha256=hash;existing.http=response.http;await this.cache.put(existing);return existing;}
  this.setResourceState('aurora',undefined,{phase:'processing',message:'正在校验数据…'});
  const value=validateAurora(JSON.parse(await response.blob.text()));
  if(cached&&value.time<cached.time)throw Error('来源返回了较旧的数据，保留当前版本');
  return this.store('aurora',response.blob,{time:value.time,observed:value.observed,resolution:'360×181',http:response.http,contentHash:hash});
 }
 downloadProgress(kind,provider,{received,total}){
  this.progressTimes??={};const key=this.resourceKey(kind,provider),now=performance.now();if(now-(this.progressTimes[key]||0)<300&&received!==total)return;this.progressTimes[key]=now;
  this.setResourceState(kind,provider,{phase:'downloading',message:{key:total?'已下载 {received} / {total} MB':'已下载 {received} MB',params:{received:(received/1048576).toFixed(1),total:(total/1048576).toFixed(1)}}});
 }
 orbitRecordFor(id){return this.sim.orbits.records[id]??null;}
 orbitForMission(id){return this.sim.orbits.resolve(id);}
 acceptOrbit(data,recordId,id){this.historyDirty=true;return this.sim.orbits.accept(data,recordId,id);}
 useOrbit(data,notify=true){return this.sim.orbits.use(data,notify);}
 async nasaCall(path,method='GET'){
  const response=await fetch('/api/cloud/satcorps/'+path,{method,cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('NASA 本地资源服务暂不可用');const job=await response.json();if(job.cache||job.diskCache)this.serverCache=job.cache||job.diskCache;return job;
 }
 restoreNASA(){
  if(WEB_BUILD||!/^https?:$/.test(location.protocol))return Promise.resolve();
  if(this.nasaRestoreTask)return this.nasaRestoreTask;
  this.busy=true;this.setResourceState('cloud','satcorps',{phase:'processing',message:'正在恢复本机云图…'});
  const task=Promise.resolve().then(()=>this.restoreNASARun());this.nasaRestoreTask=task;
  const finish=()=>{if(this.nasaRestoreTask===task)this.nasaRestoreTask=null;this.busy=this.jobs.size>0||!!this.nasaWatch;this.render();};task.then(finish,finish);return task;
 }
 async restoreNASARun(){
  if(WEB_BUILD||!/^https?:$/.test(location.protocol))return;
  const job=await this.nasaCall('status');
  if(job.state==='running')return this.watchNASA(job);
  let record;
  try{
   if(job.result){record=await this.acceptNASA(job);await this.apply('cloud');await this.trim([record.id]);}
   if(job.state==='error')this.setResourceState('cloud','satcorps',{phase:'error',checkedAt:job.checkedAt,message:job.error||'NASA 云图更新失败'});
   else if(job.result?.checkedAt)this.setResourceState('cloud','satcorps',{phase:job.result.updateStatus||'unchanged',checkedAt:job.result.checkedAt,message:job.result.updateMessage});
   else this.setResourceState('cloud','satcorps',{phase:'idle',checkedAt:null,message:record?'已恢复本机下载的云图':'尚未检查'});
  }finally{if(record)this.pendingRecords.delete(record.id);}
 }
 watchNASA(job){
  if(this.nasaWatch)return this.nasaWatch;
  const run=async()=>{const deadline=Date.now()+20*60e3;let record;
   try{
    while(job.state==='running'){
     this.messages.cloud=job.status||'NASA 云图下载中…';this.setResourceState('cloud','satcorps',{phase:'downloading',message:this.nasaProgress(job.status)});
     if(Date.now()>deadline)throw Error('NASA 下载超时，已有云图已保留');
     await new Promise(resolve=>setTimeout(resolve,document.hidden?8000:2500));job=await this.nasaCall('status');
    }
    if(job.state==='error')throw Error(job.error||'NASA 云图更新失败');
    if(!job.result)throw Error('NASA 云图暂不可用');
    try{record=await this.acceptNASA(job);}catch{job=await this.nasaCall('status');if(job.state==='error'||!job.result)throw Error(job.error||'NASA 云图暂不可用');record=await this.acceptNASA(job);}
    await this.apply('cloud');await this.trim([record.id]);
    if(!this.jobs.has('cloud:satcorps'))this.setResourceState('cloud','satcorps',{phase:job.result.updateStatus||'unchanged',checkedAt:job.result.checkedAt,message:job.result.updateMessage});return record;
   }catch(error){if(!this.jobs.has('cloud:satcorps'))this.setResourceState('cloud','satcorps',{phase:'error',checkedAt:job.checkedAt||Date.now(),message:error.message});throw error;}
   finally{if(record)this.pendingRecords.delete(record.id);}
  };
  this.busy=true;this.nasaWatch=run().finally(()=>{this.nasaWatch=null;this.busy=this.jobs.size>0||!!this.nasaRestoreTask;this.render();});return this.nasaWatch;
 }
 nasaProgress(message){
  for(const prefix of ['检查 NASA 全球与极区覆盖 · ','该候选未通过检查，继续查找 · ','下载 NASA 云层字段 '])if(message?.startsWith(prefix))return {key:prefix+'{detail}',params:{detail:message.slice(prefix.length)}};
  return message||'NASA 云图下载中…';
 }
 async updateNASA(){
  if(WEB_BUILD||!/^https?:$/.test(location.protocol))throw Error('请用桌面启动器打开软件后下载 NASA 云图');
  if(this.nasaRestoreTask)await this.nasaRestoreTask.catch(()=>{});
  if(this.nasaWatch)return this.nasaWatch;
  const job=await this.nasaCall('update','POST');
  if(job.state==='running')return this.watchNASA(job);
  if(job.state==='error')throw Error(job.error||'NASA 云图更新失败');
  if(!job.result)throw Error('NASA 云图暂不可用');return this.acceptNASA(job);
 }
 async acceptNASA(job){
  if(!job.result)throw Error(job.error||'NASA 云图暂不可用');
  const meta=validateNASA(job.result),existing=this.items.find(r=>r.kind==='cloud'&&cloudProvider(r)==='satcorps'&&r.sha256===meta.sha256&&r.time===meta.time);
  this.lastCloudOutcome??={};this.lastCloudOutcome.satcorps={status:meta.updateStatus||(existing?'unchanged':'updated'),checkedAt:meta.checkedAt,message:meta.updateMessage};
  if(meta.updateMessage)this.messages.cloud=meta.updateMessage;
  if(existing)return existing;
  const {blob}=await this.fetch('/api/cloud/satcorps/image?sha256='+meta.sha256,40e6,{onProgress:p=>this.downloadProgress('cloud','satcorps',p)});
  this.setResourceState('cloud','satcorps',{phase:'processing',message:'正在校验数据…'});
  const digest=await blobHash(blob);if(digest!==meta.sha256)throw Error('NASA 云图校验失败，请重新下载');
  await this.validateCloud(blob);const row=await this.store('cloud',blob,{...meta,contentHash:digest});if(meta.updateMessage)this.messages.cloud=meta.updateMessage;return row;
 }
 async updateCloud(provider=this.settings.cloudDownloadProvider){
  if(provider==='satcorps')return this.updateNASA();
  const cached=this.latestRecord('cloud','github');let response,source=SOURCE.cloud,channel='alpha';
  try{response=await this.fetch(source,40e6,{cached,onProgress:p=>this.downloadProgress('cloud','github',p)});}
  catch{source=CLOUD_JPEG;channel='red';response=await this.fetch(source,16e6,{cached,onProgress:p=>this.downloadProgress('cloud','github',p)});}
  if(response.unchanged)return cached;
  const hash=await blobHash(response.blob),existing=this.items.find(r=>r.kind==='cloud'&&cloudProvider(r)==='github'&&(r.sha256===hash||r.id.endsWith(hash)));if(existing){existing.sha256=hash;existing.http=response.http;await this.cache.put(existing);return existing;}
  this.setResourceState('cloud','github',{phase:'processing',message:'正在校验数据…'});await this.validateCloud(response.blob,channel==='alpha');
  return this.store('cloud',response.blob,{provider:'github',source,channel,resolution:'8192×4096',http:response.http,contentHash:hash});
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
  this.appliedMode??={};this.appliedMode[k]=mode;this.historyDirty=true;
  if(k==='cloud')this.bindCloud();
  else this.env.auroraUniforms.auroraMap.value=this.auroraTexture||this.env.fallback;
  this.render();
  };
  const promise=run(),request={key,promise,token,recordId:record?.id};this.pendingApply[k]=request;
  try{return await promise;}finally{if(this.pendingApply[k]===request)delete this.pendingApply[k];}
 }
 async useRecord(record){
  if(this.busy||this.sim.sceneBusy||this.sim.missions?.busy)throw Error('数据正在更新，请稍后重试');
  if(record.kind==='orbit'){const id=record.missionId||DEFAULT_MISSION;if(id!==this.sim.missionId)throw Error('请先切换到此轨道所属任务');this.acceptOrbit(validateOrbit(JSON.parse(await record.blob.text())),record.id,id);}
  else await this.setSource(record.kind,'history',record.id);
  this.historyDirty=true;await this.trim();this.render();
 }
 async removeRecords(ids){
  const selected=new Set(ids),current=this.active.orbit;
  for(const kind of ['cloud','aurora']){
   if(selected.has(this.active[kind])||selected.has(this.pendingApply?.[kind]?.recordId))++this.tokens[kind];
   if(selected.has(this.active[kind])){this.release(kind);if(kind==='cloud')this.bindCloud();else this.env.auroraUniforms.auroraMap.value=this.env.fallback;}
  }
  for(const [id,key] of Object.entries(this.sim.orbits.records))if(selected.has(key))this.sim.orbits.records[id]=null;
  for(const id of ids){await this.cache.remove(id);this.thumbnails?.delete(id);}
  if(selected.has(current)){this.useOrbit(this.sim.bundledOrbit);this.active.orbit=null;}
  this.save();await this.reload();await Promise.allSettled(['cloud','aurora'].map(k=>this.apply(k)));
 }
 async clear(){
  if(this.busy)throw Error('数据正在更新，请稍后重试');
  const selected=[...document.querySelectorAll('[data-clear-kind]:checked')].map(x=>x.dataset.clearKind),include=$('clearFavorites').checked;
  if(!WEB_BUILD&&selected.includes('cloud')&&/^https?:$/.test(location.protocol)){
   try{const response=await this.nasaCall('clear','POST');if(response.cleared===false)throw Error('云图正在下载，请完成后清理');this.serverCache={bytes:0,count:0};}
   catch(error){if(error.message.includes('正在下载'))throw error;this.messages.cache='本机云图服务未连接，仅清理浏览器缓存';}
  }
  await this.removeRecords(this.items.filter(r=>selected.includes(r.kind)&&(!r.favorite||include)).map(r=>r.id));
  $('cacheDialog').close();this.messages.cache='缓存已清理，组合和设置已保留';this.render();
 }
 async remove(id){if(this.busy)throw Error('数据正在更新，请稍后重试');const item=this.items.find(r=>r.id===id);if(!item||item.favorite)return;await this.removeRecords([id]);this.render();}
 async exportRecord(record){const bytes=new Uint8Array(await record.blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));const {blob,...meta}=record;saveFile(new Blob([JSON.stringify({format:'tiangong-weather-1',meta,base64:btoa(s)})],{type:'application/json'}),'StarOrbit-'+record.kind+'-'+record.id.slice(-8)+'.json');}
 async importFile(file){if(this.sim.sceneBusy||this.sim.missions?.busy)throw Error('正在恢复场景…');const missionId=this.sim.missionId;if(file.size>64e6)throw Error('文件超过 64 MB');const x=JSON.parse(await file.text());if(x.format!=='tiangong-weather-1'||!['cloud','aurora','orbit'].includes(x.meta?.kind)||typeof x.base64!=='string')throw Error('无效快照文件');const k=x.meta.kind,bytes=Uint8Array.from(atob(x.base64),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:k==='cloud'?(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'image/png':'image/jpeg'):'application/json'});let time=null,observed=null;
  if(k==='aurora'){const v=validateAurora(JSON.parse(await blob.text()));time=v.time;observed=v.observed;}else if(k==='orbit'){const v=bindOrbit(validateOrbit(JSON.parse(await blob.text())),missionId);if(x.meta.missionId!==undefined&&x.meta.missionId!==missionId)throw Error('轨道属于其他任务');time=Date.parse(v.created)||v.rows[0][0];}else{const im=await createImageBitmap(blob);const valid=im.width>=1024&&im.width<=8192&&im.width===im.height*2;im.close();if(!valid)throw Error('云图尺寸无效');}
  const nasa=k==='cloud'&&x.meta.provider==='satcorps'?{...validateNASA(x.meta),source:x.meta.source}:{};if(nasa.provider){await this.validateCloud(blob);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==nasa.sha256)throw Error('NASA 云图校验失败，请重新下载');}const record=await this.store(k,blob,{...(k==='orbit'?{missionId}:{}),time,observed,source:'导入快照',favorite:true,...(k==='cloud'?{channel:cloudChannel(x.meta),provider:cloudProvider(x.meta)}:{}),...Object.fromEntries(Object.entries(nasa).filter(([key])=>['provider','time','observedStart','observedEnd','resolution','nativeResolution','channel','coverage','polarCoverage','footprint','release','source','sources','sha256'].includes(key)))});record.favorite=true;await this.cache.put(record);if(k!=='orbit'){this.settings[k]='history';this.settings[k+'History']=record.id;this.sync();this.save();await this.apply(k);}if(k==='orbit')this.acceptOrbit(validateOrbit(JSON.parse(await blob.text())),record.id,missionId);this.pendingRecords.delete(record.id);await this.trim();this.render();}
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
  const historyContext=this.sim.missionId+'|'+this.active.orbit;if(historyContext!==this.historyContext){this.historyContext=historyContext;this.historyDirty=true;}
  const total=this.items.reduce((n,x)=>n+x.size,0);$('cacheUsage').textContent=t('缓存 {size} MB / {limit} MB · {count} 份',{size:(total/1048576).toFixed(1),limit:this.settings.limit,count:this.items.length})+(total>this.settings.limit*1048576?t(this.settings.autoClean?' · 收藏／当前使用数据超出预算，未自动删除':' · 已超出上限，自动清理已关闭'):'')+(this.cache.persistent?'':t(' · 当前浏览器仅支持临时缓存'));
  $('lastDataCheck').textContent=t('上次检查')+': '+(this.settings.checked?fmt(this.settings.checked):t('尚未检查'));$('dataUpdates').replaceChildren();for(const k of ['cloud','aurora','orbit','assets','cache'])if(this.messages[k]){const p=document.createElement('p');p.className='small';p.textContent=(names[k]?t(names[k])+': ':'')+(typeof this.messages[k]==='object'?t(this.messages[k].key,this.messages[k].params):t(this.messages[k]));$('dataUpdates').append(p);}
  for(const id of ['clearEnvironment','confirmClearCache','importSnapshot'])$(id).disabled=this.busy;
  $('updateEnvironment').disabled=this.busy;
  for(const kind of ['cloud','aurora'])this.status(kind);
  if(this.choicesDirty)this.renderChoices();if(this.historyDirty&&this.resourcePanel?.active&&document.querySelector('[data-memory-key=downloads]').open)this.renderHistory();
  this.resourcePanel?.render();
 }
 renderChoices(){
  this.choicesDirty=false;
  for(const k of ['cloud','aurora']){const sel=$(k+'History');sel.replaceChildren(new Option(t('跟随模拟时间（±6小时）'),'auto'));for(const r of this.items.filter(x=>x.kind===k).sort((a,b)=>b.downloaded-a.downloaded))sel.add(new Option((k==='cloud'?(cloudProvider(r)==='satcorps'?'NASA · ':'github · '):'')+fmt(r.time)+(r.time?'':' · '+t('下载')+' '+fmt(r.downloaded)),r.id));sel.value=this.settings[k+'History'];if(sel.selectedIndex<0){const missing=new Option(t('快照已删除'),this.settings[k+'History']);missing.disabled=true;sel.add(missing);sel.value=this.settings[k+'History'];}sel.disabled=this.settings[k]!=='history';this.status(k);}
 }
 renderHistory(){
  if(!this.historyDirty)return;this.historyDirty=false;this.previewURLs??=new Set();for(const url of this.previewURLs)URL.revokeObjectURL(url);this.previewURLs.clear();
  const list=$('weatherHistory');list.replaceChildren();for(const r of this.items.filter(r=>!this.historyFilter||this.historyFilter==='all'||r.kind===this.historyFilter).sort((a,b)=>b.downloaded-a.downloaded)){const card=document.createElement('div');card.className='snapshot-card';const text=document.createElement('p');text.className='small';text.textContent=`${t(names[r.kind])}${r.kind==='orbit'?' · '+t(mission(r.missionId||DEFAULT_MISSION)?.name||r.missionId):''} · ${fmt(r.time)}\n${t('下载')} ${fmt(r.downloaded)} · ${(r.size/1048576).toFixed(1)} MB\n${r.source}`;card.append(text);
   if(r.kind==='cloud'){const image=document.createElement('img');image.alt=t('云图预览');image.loading='lazy';image.width=512;image.height=256;card.append(image);this.preview(image,r);}
   const buttons=document.createElement('div');buttons.className='angle-actions';for(const [label,fn] of [['使用此版本',()=>this.useRecord(r)],[r.favorite?'取消收藏':'收藏',async()=>{r.favorite=!r.favorite;await this.cache.put(r);await this.reload();}],['导出',()=>this.exportRecord(r)],['删除',()=>this.remove(r.id)]]){const b=document.createElement('button');b.textContent=t(label);b.disabled=(label==='删除'&&r.favorite)||(label==='使用此版本'&&r.kind==='orbit'&&(r.missionId||DEFAULT_MISSION)!==this.sim.missionId);if(label==='使用此版本'&&Object.values(this.active).includes(r.id)){b.textContent=t('正在使用');b.disabled=true;}b.onclick=()=>Promise.resolve(fn()).catch(e=>this.fail('cache',e));buttons.append(b);}card.append(buttons);list.append(card);}
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
 savePreset(){const p=this.presets(),api=this.env.api,sim=this.sim;p.push({missionId:sim.missionId,pose:sim.missions.state.pose,rotation:sim.missions.state.rotation,name:($('environmentPresetName').value.trim()||'Earth '+(p.length+1)).slice(0,60),time:sim.time,view:sim.view,settings:{...presetWeatherSettings(this.settings),orbitRecord:this.sim.orbits.selected},environment:{...this.env.settings},phenomena:{...this.env.phenomena.settings},cameraUp:api.camera.up.toArray(),cameraFov:api.camera.fov,cameraZoom:api.camera.zoom,spaceUp:sim.spaceCamera.up.toArray(),spaceFov:sim.spaceCamera.fov,spaceZoom:sim.spaceCamera.zoom,camera:api.camera.position.toArray(),target:api.controls.target.toArray(),spaceCamera:sim.spaceCamera.position.toArray(),spaceTarget:sim.orbitControls.target.toArray()});localStorage.setItem('tiangong-environment-presets-v1',JSON.stringify(p));this.renderPresets();}
 async loadPreset(){
  if(this.sim.sceneBusy||this.sim.missions.busy||this.busy)throw Error('正在恢复场景…');
  this.sim.sceneBusy=true;this.sim.missions.syncUI();
  try{return await this.restorePreset();}finally{this.sim.sceneBusy=false;this.sim.missions.syncUI();this.sim.sessionMemory?.save();}
 }
 async restorePreset(){const p=this.presets()[Number($('environmentPresets').value)];if(!p)return;await this.sim.missions.switchTo(p.missionId||DEFAULT_MISSION,{fromScene:true});this.sim.missions.state.rotation=validateRotation(p.rotation,p.time,{enabled:!!mission(this.sim.missionId).spinRpm});if(p.pose){this.sim.missions.state.pose=validatePose(p.pose);this.sim.missions.applyPose();}this.env.phenomena.restore(p.phenomena);const record=this.items.find(r=>r.id===p.settings.orbitRecord&&r.kind==='orbit'&&(r.missionId||DEFAULT_MISSION)===this.sim.missionId),previous=this.active.orbit||null;
  if(record){this.useOrbit(validateOrbit(JSON.parse(await record.blob.text())),false);this.active.orbit=record.id;}
  else if(!p.settings.orbitRecord||p.settings.orbitRecord==='none'){this.useOrbit(p.settings.orbitRecord==='none'?null:this.sim.bundledOrbit,false);this.active.orbit=null;}
  else this.env.api.toast('收藏的轨道缓存已删除，已保留当前轨道。');
  Object.assign(this.settings,presetWeatherSettings(p.settings));this.settings.orbitRecord=record?record.id:p.settings.orbitRecord==='none'?'none':p.settings.orbitRecord?previous:null;this.sync();this.save();for(const key of ['quality','exposure','cloudOpacity','starBrightness','stars','milky','moon','clouds','groundTrack'])if(Object.hasOwn(p.environment,key))this.env.settings[key]=p.environment[key];this.env.settings.cloudNightVisible=p.environment.cloudNightVisible===true;Object.assign(this.env.settings,normalizeStarChartSettings(p.environment),normalizeGeographySettings(p.environment));this.env.save();await this.env.setQuality(p.environment.quality);await this.env.setSkyStyle();for(const [id,k] of [['showMoon','moon'],['showStars','stars'],['showClouds','clouds'],['cloudNightVisible','cloudNightVisible'],['showMilky','milky'],['groundTrack','groundTrack']])$(id).checked=this.env.settings[k];syncStarChartControls(this.env.settings);syncGeographyControls(this.env.settings);$('skyExposure').value=this.env.settings.exposure;$('cloudOpacity').value=this.env.settings.cloudOpacity;$('starBrightness').value=this.env.settings.starBrightness;
 this.sim.seek(p.time);this.sim.setView(p.view);this.env.api.controls.stopMotion();this.env.api.camera.up.fromArray(p.cameraUp||[0,0,1]).normalize();this.env.api.camera.fov=p.cameraFov||38;this.env.api.camera.zoom=p.cameraZoom||1;this.env.api.camera.updateProjectionMatrix();this.env.api.camera.position.fromArray(p.camera);this.env.api.controls.target.fromArray(p.target);this.env.api.controls.update();this.sim.orbitControls.stopMotion();this.sim.spaceCamera.up.fromArray(p.spaceUp||[0,0,1]).normalize();this.sim.spaceCamera.fov=p.spaceFov||38;this.sim.spaceCamera.zoom=p.spaceZoom||1;this.sim.spaceCamera.updateProjectionMatrix();this.sim.spaceCamera.position.fromArray(p.spaceCamera);this.sim.orbitControls.target.fromArray(p.spaceTarget);this.sim.orbitControls.update();await Promise.allSettled(['cloud','aurora'].map(k=>this.apply(k)));}
 capture(){const {renderer,camera}=this.env.api,size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio(),aspect=camera.aspect;try{const max=renderer.capabilities.maxTextureSize,w=Math.min(3840,max,Math.floor(max*aspect)),h=Math.round(w/aspect);renderer.setPixelRatio(1);renderer.setSize(w,h,false);this.sim.render();const url=renderer.domElement.toDataURL('image/png'),a=document.createElement('a');a.href=url;a.download='StarOrbit-Earth-'+new Date(this.sim.time).toISOString().replaceAll(':','-')+'.png';a.click();}finally{renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);}}
}
