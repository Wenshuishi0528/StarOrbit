import {TelemetryPanel} from './dfh1-telemetry-panel.js';
import {MusicDock} from './music-dock.js';
import {t,onLanguageChange} from './i18n.js';
import {MusicStore,MUSIC_SETTINGS_KEY,musicSettings,reconcileMusic,adjacentTrack,randomTrack,moveTrack,musicTime,probeMusic} from './music-library.js';
const $=id=>document.getElementById(id);
const BROADCAST_ID='mission-dfh1-broadcast';
const mime={m4a:'audio/mp4',mp4:'audio/mp4',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',aac:'audio/aac',flac:'audio/flac',webm:'audio/webm'};
export class MusicPlayer{
 constructor(){
  this.audio=new Audio();this.audio.preload='metadata';this.store=new MusicStore();this.tracks=new Map();this.current=null;this.state={id:'library',order:[],removed:[]};this.busy=false;this.loaded=false;this.failed=new Set();this.wantPlayback=false;this.playToken=0;
  try{this.settings=musicSettings(JSON.parse(localStorage.getItem(MUSIC_SETTINGS_KEY)));}catch{this.settings=musicSettings();}
  this.audio.volume=this.settings.volume;this.audio.muted=this.settings.muted;
  this.broadcastMode='recording';this.telemetry=new TelemetryPanel(this);
  this.dock=new MusicDock($('musicWidget'),()=>this.busy||this.picking);this.bind();this.render();this.ready=this.restore().catch(error=>this.message(error.message));onLanguageChange(()=>this.render());
 }
 async restore(){
  const builtin=JSON.parse($('musicData').textContent);$('musicData').textContent='';
  for(const track of builtin)this.tracks.set(track.id,{...track,builtin:!track.mission});
  let records=[];try{records=await this.store.read();}catch(error){this.message(error.message);}
  for(const record of records)if(record.id.startsWith('user-')&&record.blob instanceof Blob&&typeof record.title==='string')this.tracks.set(record.id,record);
  this.state=reconcileMusic(records.find(x=>x.id==='library'),[...this.tracks.values()].filter(track=>!track.mission));this.loaded=true;
  this.select(randomTrack(this.state.order),false);if(this.pendingMission)this.setMission(this.pendingMission);this.render();
 }
 bind(){
  $('musicOrb').addEventListener('click',()=>{if(this.needsGesture)this.play();});
  $('musicPlay').onclick=()=>this.toggle();$('musicPrevious').onclick=()=>this.step(-1);$('musicNext').onclick=()=>this.step(1);
  $('musicListToggle').onclick=()=>this.panel('list',$('musicPanel').hidden);$('musicTitleButton').onclick=()=>this.panel(this.broadcast?'telemetry':'list',$(this.broadcast?'dfh1Panel':'musicPanel').hidden);$('dfh1Toggle').onclick=()=>this.panel('telemetry',$('dfh1Panel').hidden);$('musicClose').onclick=()=>{this.panel('list',false);$('musicListToggle').focus();};
  $('musicVolumeToggle').onclick=()=>this.panel('volume',$('musicVolumePanel').hidden);
  $('musicVolume').oninput=()=>{this.settings.volume=Number($('musicVolume').value)/100;this.settings.muted=false;this.applySettings();};
  $('musicMute').onclick=()=>{this.settings.muted=!this.settings.muted;this.applySettings();};
  $('musicAutoplay').onchange=()=>{this.settings.autoplay=$('musicAutoplay').checked;this.applySettings();};
  $('musicSeek').oninput=()=>{if(this.live)return;if(Number.isFinite(this.audio.duration)&&this.audio.duration>0){const resume=!!this.loopTimer&&this.wantPlayback;this.clearLoop();this.audio.currentTime=Number($('musicSeek').value)*this.audio.duration/1000;if(resume)this.play();this.progress();}};
  $('musicAdd').onclick=()=>{this.picking=true;$('musicFiles').click();};$('musicFiles').oncancel=()=>{this.picking=false;this.dock.schedule();};$('musicFiles').onchange=async e=>{try{await this.importFiles([...e.target.files]);}catch(error){this.message(error.message);}finally{e.target.value='';this.picking=false;this.dock.schedule();}};
  $('musicRestore').onclick=()=>this.restoreBuiltins();
  document.addEventListener('pointerdown',e=>{if(!$('musicWidget').contains(e.target)){this.panel('list',false);this.panel('volume',false);this.panel('telemetry',false);}});
  this.bindAudio(this.audio);
  // Transfer playback when another app tab starts music; one audible tab at a time.
  try{this.channel=new BroadcastChannel('tiangong-music-playback-v1');this.channel.onmessage=()=>this.pause();}catch{}
  window.addEventListener('pagehide',()=>this.pause());
 }
 bindAudio(audio){
  for(const event of ['playing','waiting'])audio.addEventListener(event,()=>{if(this.live)return;this.buffering=event!=='playing';this.renderPlayback();});
  for(const event of ['play','pause','loadedmetadata','durationchange','ended'])audio.addEventListener(event,()=>this.renderPlayback());
  audio.addEventListener('timeupdate',()=>this.progress());
  // A queued event from the previous source cannot advance the new source.
  audio.addEventListener('ended',()=>{if(this.live||!audio.ended||audio.currentSrc!==audio.src)return;if(this.wantPlayback){if(this.broadcast)this.queueLoop();else this.step(1,{automatic:true});}});
  audio.addEventListener('error',()=>{if(!this.live&&audio.error&&this.current)this.trackError(this.current);});
 }
 get live(){return !!this.broadcast&&this.broadcastMode==='telemetry';}
 updateSimulation(sim,wall){this.telemetry.update(sim,wall);}
 setBroadcastMode(mode){
  if(!['recording','telemetry'].includes(mode)||mode===this.broadcastMode)return;
  const play=this.wantPlayback;this.pause();this.broadcastMode=mode;this.telemetry.reset();this.telemetry.render();
  if(play)this.play();this.render();
 }
 clearLoop(){clearTimeout(this.loopTimer);this.loopTimer=null;}
 pause(){this.clearLoop();this.wantPlayback=false;this.needsGesture=false;this.playToken++;this.audio.pause();this.telemetry.engine.stop();this.renderPlayback();}
 queueLoop(){
  this.clearLoop();const token=this.playToken;this.loopTimer=setTimeout(()=>{if(token!==this.playToken)return;this.loopTimer=null;if(this.broadcast&&!this.live&&this.wantPlayback&&this.current===BROADCAST_ID){this.audio.currentTime=0;this.play();}},5000);this.renderPlayback();
 }
 setMission(id){
  this.pendingMission=id;if(!this.loaded)return;
  const first=!this.missionReady;this.missionReady=true;
  const broadcast=id==='dfh1';if(broadcast===!!this.broadcast){if(first&&this.settings.autoplay)this.play();return;}
  this.panel('list',false);this.panel('telemetry',false);this.telemetry.engine.stop();
  if(broadcast){
   this.libraryPlayback={id:this.current,time:this.audio.currentTime,play:first?this.settings.autoplay:this.wantPlayback};this.broadcast=true;
   this.select(BROADCAST_ID,this.broadcastPlayback??this.settings.autoplay);
  }else{
   this.broadcastPlayback=this.wantPlayback;this.broadcast=false;
   const saved=this.libraryPlayback;this.select(saved?.id??randomTrack(this.state.order),false);
   if(saved&&this.current){this.audio.currentTime=saved.time;if(saved.play)this.play();}
  }
  this.render();
 }
 panel(kind,open){
  if(kind==='list'&&open&&this.broadcast||kind==='telemetry'&&open&&!this.broadcast)return;
  const panels={list:['musicPanel','musicListToggle'],volume:['musicVolumePanel','musicVolumeToggle'],telemetry:['dfh1Panel','dfh1Toggle']};
  const [id,button]=panels[kind];$(id).hidden=!open;$(button).setAttribute('aria-expanded',String(open));
  if(open){this.dock.expand();for(const other of Object.keys(panels))if(other!==kind)this.panel(other,false);if(kind==='telemetry')this.telemetry.render();}
  $('musicWidget').classList.toggle('music-popup-open',Object.values(panels).some(([id])=>!$(id).hidden));
 }
 applySettings(){this.telemetry.engine.setVolume(this.settings.volume,this.settings.muted);this.audio.volume=this.settings.volume;this.audio.muted=this.settings.muted;try{localStorage.setItem(MUSIC_SETTINGS_KEY,JSON.stringify(this.settings));}catch{this.message('音乐设置未能保存');}this.renderPlayback();}
 message(key,params={}){this.notice={key,params};$('musicStatus').textContent=t(key,params);}
 source(track){
  if(track.blob)return URL.createObjectURL(track.blob);
  if(track.url)return track.url;
  const bytes=Uint8Array.from(atob(track.base64),c=>c.charCodeAt(0));return URL.createObjectURL(new Blob([bytes],{type:track.type}));
 }
 select(id,play=true){
  if(this.broadcast&&id!==BROADCAST_ID)return;
  this.clearLoop();this.playToken++;this.telemetry.engine.stop();
  // Keep the user-authorized media element for Safari's per-element autoplay policy.
  this.audio.pause();this.audio.removeAttribute('src');this.audio.load();
  if(this.url){URL.revokeObjectURL(this.url);this.url=null;}
  this.wantPlayback=play;this.needsGesture=false;this.buffering=false;this.current=id;
  if(id&&this.tracks.has(id)){try{this.url=this.source(this.tracks.get(id));this.audio.src=this.url;if(play)this.play();}catch{this.trackError(id);}}
  else{this.current=null;this.wantPlayback=false;}
  this.render();
 }
 async play(){
  if(!this.current||!this.missionReady)return;this.clearLoop();this.wantPlayback=true;this.needsGesture=false;const token=++this.playToken,id=this.current;this.renderPlayback();
  try{if(this.live){this.telemetry.engine.setVolume(this.settings.volume,this.settings.muted);this.telemetry.reset();const started=await this.telemetry.engine.start();if(!started)return;}else await this.audio.play();if(token!==this.playToken)return;this.failed.clear();this.channel?.postMessage('playing');this.renderPlayback();}
  catch(error){if(token!==this.playToken||error.name==='AbortError')return;if(error.name==='NotAllowedError'){this.needsGesture=true;this.renderPlayback();}else this.trackError(id);}
 }
 toggle(){if(!this.loaded)return;if(this.live){if(this.wantPlayback&&!this.needsGesture)this.pause();else this.play();return;}if(!this.current){this.select(randomTrack(this.state.order),true);return;}if(this.loopTimer||!this.audio.paused||this.wantPlayback&&!this.needsGesture&&this.audio.readyState<2){this.pause();}else{this.failed.clear();this.play();}}
 step(direction,{automatic=false}={}){if(this.broadcast){if(this.live){this.telemetry.reset();this.play();}else this.select(BROADCAST_ID,true);return;}const order=automatic?this.state.order.filter(id=>!this.failed.has(id)):this.state.order;if(!automatic)this.failed.clear();this.select(adjacentTrack(order,this.current,direction),true);}
 trackError(id){
  if(id!==this.current||this.failed.has(id))return;if(this.broadcast){this.pause();this.message('无法播放：{name}',{name:t(this.tracks.get(id)?.title||id)});$('musicMeta').textContent=t('无法播放：{name}',{name:t(this.tracks.get(id)?.title||id)});return;}this.failed.add(id);this.message('无法播放：{name}',{name:this.tracks.get(id)?.title||id});const next=adjacentTrack(this.state.order,id,1),remaining=this.state.order.filter(x=>!this.failed.has(x));
  if(this.wantPlayback&&remaining.length){const start=this.state.order.indexOf(next);const ordered=[...this.state.order.slice(start),...this.state.order.slice(0,start)];this.select(ordered.find(x=>!this.failed.has(x)),true);}
  else{this.wantPlayback=false;this.audio.pause();this.renderPlayback();}
 }
 async edit(operation){
  if(this.broadcast||this.busy||!this.loaded)return;this.busy=true;this.renderList();
  try{await operation();}catch(error){this.message(error.message||'音乐库保存失败');}finally{this.busy=false;this.render();this.dock.schedule();}
 }
 async reorder(id,before){return this.edit(async()=>{const next={...this.state,order:moveTrack(this.state.order,id,before)};await this.store.commit(next);this.state=next;});}
 async remove(id){return this.edit(async()=>{
  const track=this.tracks.get(id),index=this.state.order.indexOf(id);if(!track||index<0)return;
  const next={...this.state,order:this.state.order.filter(x=>x!==id),removed:track.builtin?[...this.state.removed,id]:this.state.removed};
  await this.store.commit(next,[],track.builtin?[]:[id]);this.state=next;if(!track.builtin)this.tracks.delete(id);
  if(this.current===id)this.select(next.order[index%next.order.length]||null,this.wantPlayback);this.message('已移除：{name}',{name:track.title});
 });}
 async restoreBuiltins(){return this.edit(async()=>{const next=reconcileMusic({...this.state,removed:[]},[...this.tracks.values()].filter(track=>!track.mission));await this.store.commit(next);this.state=next;if(!this.current)this.select(randomTrack(next.order),false);this.message('内置音乐已恢复');});}
 async importFiles(files){return this.edit(async()=>{
  const added=[],order=[...this.state.order],removed=[...this.state.removed];let imported=0,duplicates=0;const errors=[];
  for(const file of files){try{
   if(!file.size||file.size>100e6)throw Error('音乐文件大小应在 0–100 MB 之间');
   const extension=file.name.split('.').pop().toLowerCase();if(!mime[extension])throw Error('请选择 M4A、MP3、WAV、OGG、AAC、FLAC 或 WebM 音乐');
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
   const existing=[...this.tracks.values(),...added].find(x=>x.sha256===hash);
   if(existing){if(!order.includes(existing.id)){order.push(existing.id);const i=removed.indexOf(existing.id);if(i>=0)removed.splice(i,1);imported++;}else duplicates++;continue;}
   const blob=new Blob([file],{type:mime[extension]}),duration=await probeMusic(blob),record={id:'user-'+hash,title:file.name.replace(/\.[^.]+$/,'').slice(0,200),duration,type:blob.type,sha256:hash,blob};
   added.push(record);order.push(record.id);imported++;
  }catch(error){errors.push(file.name+' · '+t(error.message));}}
  if(imported){const next={...this.state,order,removed};await this.store.commit(next,added);this.state=next;for(const record of added)this.tracks.set(record.id,record);if(!this.current)this.select(order[0],false);}
  this.message('已添加 {count} 首 · 已有 {duplicates} 首{details}',{count:imported,duplicates,details:errors.length?'\n'+errors.join('\n'):''});
 });}
 render(){this.renderPlayback();this.renderList();}
 renderPlayback(){
  // A one-track library can repeat natively without reloading its audio source.
  this.audio.loop=!this.broadcast&&this.state.order.length===1;
  const track=this.tracks.get(this.current),title=this.live?t('东方红一号 · 实时遥测'):track?.mission?t(track.title):track?.title;$('musicTrackTitle').textContent=title||t('音乐列表为空');
  const playing=this.live?this.wantPlayback:!this.audio.paused||!!this.loopTimer;const active=this.live?this.telemetry.engine.audible:!this.audio.paused&&!this.audio.ended&&!this.buffering;$('musicOrb').classList.toggle('is-playing',active);$('musicOrb').title=t(this.needsGesture?'点击播放':this.broadcast?'东方红一号信号':'背景音乐')+(title?' · '+title:'');$('musicOrb').setAttribute('aria-label',t('展开音乐播放器')+(title?' · '+title:''));$('musicPlay').classList.toggle('is-playing',playing);$('musicPlay').setAttribute('aria-label',t(playing?'暂停音乐':'播放音乐'));$('musicPlay').title=t(playing?'暂停音乐':'播放音乐');
  for(const id of ['musicPlay','musicPrevious','musicNext'])$(id).disabled=!this.loaded||(!this.broadcast&&!this.state.order.length);
  for(const id of ['musicNext','musicListToggle'])$(id).hidden=!!this.broadcast;
  $('dfh1Toggle').hidden=!this.broadcast;
  $('musicPrevious').title=t(this.broadcast?'从头播放':'上一首');$('musicPrevious').setAttribute('aria-label',$('musicPrevious').title);
  $('musicTitleButton').title=t(this.broadcast?'东方红一号信号':'打开播放列表');
  $('musicVolume').value=String(Math.round(this.settings.volume*100));$('musicVolumeValue').textContent=Math.round(this.settings.volume*100)+'%';$('musicMute').setAttribute('aria-pressed',String(this.settings.muted));$('musicMute').textContent=t(this.settings.muted?'取消静音':'静音');$('musicVolumeToggle').classList.toggle('muted',this.settings.muted||this.settings.volume===0);$('musicVolumeToggle').title=t(this.settings.muted?'已静音':'音量');$('musicAutoplay').checked=this.settings.autoplay;
  for(const row of $('musicList').children){const selected=row.dataset.id===this.current;row.classList.toggle('current',selected);row.querySelector('.music-track')?.setAttribute('aria-current',String(selected));}
  this.progress();
 }
 progress(){if(this.live){this.telemetry.progress();return;}const duration=this.audio.duration,valid=Number.isFinite(duration)&&duration>0;$('musicSeek').disabled=!valid;$('musicSeek').value=valid?String(1000*this.audio.currentTime/duration):'0';$('musicSeek').setAttribute('aria-valuetext',musicTime(this.audio.currentTime)+' / '+musicTime(valid?duration:this.tracks.get(this.current)?.duration));$('musicMeta').textContent=this.loopTimer?t('5 秒后重复播放'):this.needsGesture?t('点击播放'):!this.loaded?t('正在准备音乐…'):(this.broadcast?'':t('列表循环')+' · ')+musicTime(this.audio.currentTime)+' / '+musicTime(valid?duration:this.tracks.get(this.current)?.duration);}
 renderList(){
  const list=$('musicList'),focused=document.activeElement?.closest('[data-music-action]'),focus=focused&&{id:focused.closest('[data-id]')?.dataset.id,action:focused.dataset.musicAction};list.replaceChildren();
  $('musicCount').textContent=t('{count} 首',{count:this.state.order.length});$('musicAdd').disabled=$('musicRestore').disabled=this.busy||!this.loaded;
  for(const [index,id] of this.state.order.entries()){
   const track=this.tracks.get(id),row=document.createElement('li');row.dataset.id=id;row.className='music-row';row.classList.toggle('current',id===this.current);
   const handle=document.createElement('span');handle.textContent='⠿';handle.className='music-drag';handle.draggable=!this.busy;handle.title=t('拖动调整顺序');handle.setAttribute('aria-hidden','true');
   handle.ondragstart=e=>{this.dragId=id;e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';};handle.ondragend=()=>{this.dock.dragging=false;this.dock.held=false;this.dock.schedule();this.dragId=null;for(const r of list.children)r.classList.remove('drop-target');};
   row.ondragover=e=>{if(this.dragId&&!this.busy){e.preventDefault();e.dataTransfer.dropEffect='move';row.classList.add('drop-target');}};row.ondragleave=()=>row.classList.remove('drop-target');row.ondrop=e=>{e.preventDefault();row.classList.remove('drop-target');if(!this.dragId||this.busy)return;const before=e.clientY<row.getBoundingClientRect().top+row.clientHeight/2?id:this.state.order[index+1]||null;this.dock.dragging=false;this.dock.held=false;this.reorder(this.dragId,before);this.dragId=null;this.dock.schedule();};
   const play=document.createElement('button');play.className='music-track';play.dataset.musicAction='play';play.textContent=track.title;play.title=track.title;play.setAttribute('aria-current',String(id===this.current));play.onclick=()=>{this.failed.clear();this.select(id,true);};
   const duration=document.createElement('span');duration.className='music-duration';duration.textContent=musicTime(track.duration);row.append(handle,play,duration);
   for(const [action,text,label,disabled,handler] of [['up','↑','上移',index===0,()=>this.reorder(id,this.state.order[index-1])],['down','↓','下移',index===this.state.order.length-1,()=>this.reorder(id,this.state.order[index+2]||null)],['delete','×','移除音乐',false,()=>this.remove(id)]]){const b=document.createElement('button');b.className='music-row-action';b.dataset.musicAction=action;b.textContent=text;b.title=t(label);b.setAttribute('aria-label',t(label)+' · '+track.title);b.disabled=this.busy||disabled;b.onclick=handler;row.append(b);}
   list.append(row);
  }
  if(!this.state.order.length){const empty=document.createElement('li');empty.className='music-empty';empty.textContent=t('添加音乐或恢复内置音乐');list.append(empty);}
  if(focus)list.querySelector(`[data-id="${focus.id}"] [data-music-action="${focus.action}"]`)?.focus();
  if(this.notice)$('musicStatus').textContent=t(this.notice.key,this.notice.params);
 }
}
