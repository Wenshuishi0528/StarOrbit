import {cloudJSON,historyAPI,historySelection,downloadHistory,mergeCloudVersions,versionCatalog,versionKey} from './cloud-history-data.js';
import {WEB_BUILD} from './runtime-assets.js';
import {CLOUD_MAX_BYTES} from './cloud-texture.js';
import {t} from './i18n.js';

export const cloudDate=r=>Number.isFinite(r?.time)&&r.time>0&&r.time<8.64e15?new Date(r.time).toISOString().slice(0,16).replace('T',' ')+' UTC':t('观测时间未提供');
export const cloudTitle=r=>(r?.provider==='satcorps'?'NASA · ':t('GitHub 旧云图')+' · ')+cloudDate(r);
export const cloudError=e=>e.name==='TimeoutError'?t('请求超时，请重试；已有数据已保留'):/Failed to fetch|Load failed|NetworkError/i.test(e.message||'')?t('连接失败，请检查网络后重试；已保存云图仍可使用'):e.message||String(e);

// One owner for the library and long-running download, independent of its dialog.
// Weather.active is the sole authority for the image that actually reached the renderer.
export class CloudLibrary{
 constructor(weather){
  this.w=weather;this.disk=[];this.listeners=new Set();this.libraryError='';
  this.catalog={state:'idle',items:[],dates:[],month:'',date:'',message:''};this.catalogs=new Map();
  this.task={state:'idle',message:''};this.taskGeneration=0;this.using=null;
 }
 get local(){return !WEB_BUILD&&typeof location!=='undefined'&&/^https?:$/.test(location.protocol);}
 get current(){return this.w.items.find(r=>r.kind==='cloud'&&r.id===this.w.active.cloud);}
 get currentText(){const r=this.current;return r?cloudTitle(r):t(this.w.settings.cloud==='local'?'本地生成':this.w.settings.cloud==='off'?'云图已关闭':'内置静态云图');}
 get saved(){return mergeCloudVersions([],this.w.items,this.disk).filter(r=>r.provider!=='viirs');}
 get downloading(){return ['running','cancelling'].includes(this.task.state);}
 subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 notify(){for(const fn of this.listeners)fn();this.w.resourcePanel?.render();}
 async loadSaved(){
  await this.w.reload();
  if(this.local){
   try{const data=await cloudJSON('library');this.disk=data.items||[];this.libraryError='';this.w.serverCache={count:this.disk.length,bytes:this.disk.reduce((n,r)=>n+(r.size||0),0)};}
   catch(e){this.libraryError=cloudError(e);}
  }
  this.notify();return this.saved;
 }
 refreshCatalog(month,date='',force=false){
  if(this.catalogPromise&&this.catalog.month===month&&this.catalog.date===date&&!force)return this.catalogPromise;
  this.catalogController?.abort();const controller=new AbortController();this.catalogController=controller;
  const query=month+'|'+date,previous=this.catalogs.get(query);
  this.catalog={...(previous||{items:[],dates:[]}),month,date,state:'checking',message:t('正在查询可下载云图…')};this.notify();
  const run=async()=>{
   try{
    if(!this.local)throw Error(t('NASA 下载需要桌面本机服务；可在此导入已有云图快照。'));
    const data=await versionCatalog('satcorps',month,date,force,controller.signal);
    if(controller.signal.aborted)return;
    this.catalog={...data,month,date,state:'ready',message:data.message};this.catalogs.set(query,this.catalog);
   }catch(e){
    if(this.catalogController!==controller)return;
    this.catalog={...this.catalog,state:controller.signal.aborted?'idle':'error',message:controller.signal.aborted?t('已停止目录查询'):cloudError(e)};
   }finally{if(this.catalogController===controller){this.catalogPromise=null;this.catalogController=null;this.notify();}}
  };
  const promise=Promise.resolve().then(run);this.catalogPromise=promise;return promise;
 }
 cancelCatalog(){this.catalogController?.abort();}
 async restore(){
  const generation=this.taskGeneration;
  await this.loadSaved();if(!this.local)return;
  try{
   const job=await historyAPI('status');
   if(this.taskGeneration!==generation||this.downloadPromise||this.cancelPromise)return;
   if(['running','cancelling'].includes(job.state)){
    const selected=historySelection('satcorps',job.date,job.hour);
    this.download(selected,{resumeJob:job}).catch(()=>{});
   }else if(job.state==='ready'){
    this.task={...job,state:'ready',message:t('上次下载已完成，云图保存在本机图库。')};this.notify();
   }else if(['error','cancelled'].includes(job.state)){
    this.task={...job,message:job.error||t('已取消下载')};this.notify();
   }
  }catch(e){if(this.taskGeneration===generation){this.libraryError=cloudError(e);this.notify();}}
 }
 download(row,{resumeJob}={}){
  if(this.downloadPromise)return this.downloadPromise;
  if(this.task.state==='cancelling')return Promise.reject(Error(t('正在确认下载已停止，请稍候或重试取消')));
  const date=row.date||new Date(row.time).toISOString().slice(0,10),slot=String(row.slot??row.hour??new Date(row.time).getUTCHours());
  const selection={...historySelection('satcorps',date,slot),requestId:crypto.randomUUID().replaceAll('-','')};
  const generation=++this.taskGeneration;
  this.controller=new AbortController();const signal=this.controller.signal;
  this.task={state:'running',date,hour:slot,time:selection.time,id:resumeJob?.id||selection.requestId,message:t(resumeJob?'已接回本机下载进度…':'正在连接所选云图…')};
  const run=async()=>{
   try{
    const record=await downloadHistory(selection,this.w,message=>{if(this.taskGeneration===generation&&this.task.state!=='cancelling'){this.task.message=message;this.notify();}},
     {signal,resumeJob,onJob:id=>{if(this.taskGeneration===generation)this.task.id=id;},onState:job=>{if(this.taskGeneration===generation)this.task.startedAt=job.startedAt;}});
    if(this.taskGeneration===generation)this.task={...this.task,state:'ready',recordId:record.id,message:t('下载完成，已加入云图库；点击“使用此云图”才会切换画面。')};
    await this.loadSaved();return record;
   }catch(e){
    if(this.taskGeneration===generation&&this.task.state!=='cancelling')this.task={...this.task,state:e.name==='AbortError'?'cancelled':'error',message:e.name==='AbortError'?t('已取消下载；当前使用的云图不变。'):cloudError(e)};
    // The service may have finished saving even if the browser transfer failed.
    await this.loadSaved();throw e;
   }finally{
    if(this.downloadPromise===promise){this.controller=null;this.downloadPromise=null;this.w.jobs.delete('cloud:versions');}
    this.w.busy=this.w.jobs.size>0||!!this.w.nasaWatch||!!this.w.nasaRestoreTask;
    this.w.render();this.notify();
   }
  };
  const promise=Promise.resolve().then(run);this.downloadPromise=promise;this.w.jobs.set('cloud:versions',promise);this.w.busy=true;this.w.render();this.notify();return promise;
 }
 cancel(){
  if(this.cancelPromise)return this.cancelPromise;
  if(!this.downloading)return Promise.resolve();
  const target={id:this.task.id,date:this.task.date,hour:this.task.hour},generation=this.taskGeneration;
  this.task.state='cancelling';this.task.message=t('正在停止下载…');this.controller?.abort();this.notify();
  const run=async()=>{
   try{
    const stop=async id=>{const value=await cloudJSON('history/cancel?'+new URLSearchParams({id}),{method:'POST'});if(!value.cancelled)throw Error(t('停止状态尚未确认'));};
    await stop(target.id);
    const job=await historyAPI('status');
    if(this.taskGeneration!==generation)return;
    if(['running','cancelling'].includes(job.state)&&job.date===target.date&&job.hour===target.hour)await stop(job.id);
    if(this.taskGeneration===generation)this.task={...this.task,state:'cancelled',message:t('已取消下载；当前云图和已保存版本保留。')};
   }catch(e){if(this.taskGeneration===generation)this.task.message=t('尚未确认停止下载，请重试取消。')+' '+cloudError(e);}
   finally{this.cancelPromise=null;this.notify();}
  };
  const promise=Promise.resolve().then(run);this.cancelPromise=promise;return promise;
 }
 async ensureRecord(row){
  if(row.record&&!row.record.integrityFailed)return row.record;
  if(!row.diskRecord)throw Error(t('请先下载此云图'));
  const meta=row.diskRecord;
  const {blob}=await this.w.fetch('/api/cloud/library/image?'+new URLSearchParams({name:meta.disk,sha256:meta.sha256}),CLOUD_MAX_BYTES,{timeout:60000});
  const checked=await this.w.validateManualCloud({...meta,blob,kind:'cloud'});
  const record=await this.w.store('cloud',blob,{...meta,...checked,integrityFailed:false,archiveKey:versionKey(meta),archiveOnly:false});
  this.w.pendingRecords.delete(record.id);return record;
 }
 async use(row){
  if(this.using)throw Error(t('正在加载云图，请稍候'));
  this.using=row.key;this.notify();
  try{const record=await this.ensureRecord(row);await this.w.useRecord(record);return record;}
  finally{this.using=null;this.notify();}
 }
 dispose(){this.catalogController?.abort();this.listeners.clear();}
}
