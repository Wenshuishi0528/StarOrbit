import {MusicDock} from './music-dock.js';
import {t,onLanguageChange} from './i18n.js';
import {MusicStore,MUSIC_SETTINGS_KEY,musicSettings,reconcileMusic,adjacentTrack,randomTrack,moveTrack,musicTime,probeMusic} from './music-library.js';
const $=id=>document.getElementById(id);
const mime={m4a:'audio/mp4',mp4:'audio/mp4',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',aac:'audio/aac',flac:'audio/flac',webm:'audio/webm'};
export class MusicPlayer{
 constructor(){
  this.audio=new Audio();this.audio.preload='metadata';this.store=new MusicStore();this.tracks=new Map();this.current=null;this.state={id:'library',order:[],removed:[]};this.busy=false;this.loaded=false;this.failed=new Set();this.wantPlayback=false;this.playToken=0;
  try{this.settings=musicSettings(JSON.parse(localStorage.getItem(MUSIC_SETTINGS_KEY)));}catch{this.settings=musicSettings();}
  this.audio.volume=this.settings.volume;this.audio.muted=this.settings.muted;
  this.dock=new MusicDock($('musicWidget'),()=>this.busy||this.picking);this.bind();this.render();this.ready=this.restore().catch(error=>this.message(error.message));onLanguageChange(()=>this.render());
 }
 async restore(){
  const builtin=JSON.parse($('musicData').textContent);$('musicData').textContent='';
  for(const track of builtin)this.tracks.set(track.id,{...track,builtin:true});
  let records=[];try{records=await this.store.read();}catch(error){this.message(error.message);}
  for(const record of records)if(record.id.startsWith('user-')&&record.blob instanceof Blob&&typeof record.title==='string')this.tracks.set(record.id,record);
  this.state=reconcileMusic(records.find(x=>x.id==='library'),[...this.tracks.values()]);this.loaded=true;
  this.select(randomTrack(this.state.order),this.settings.autoplay);this.render();
 }
 bind(){
  $('musicOrb').addEventListener('click',()=>{if(this.needsGesture)this.play();});
  $('musicPlay').onclick=()=>this.toggle();$('musicPrevious').onclick=()=>this.step(-1);$('musicNext').onclick=()=>this.step(1);
  $('musicListToggle').onclick=()=>this.panel('list',$('musicPanel').hidden);$('musicTitleButton').onclick=()=>this.panel('list',$('musicPanel').hidden);$('musicClose').onclick=()=>{this.panel('list',false);$('musicListToggle').focus();};
  $('musicVolumeToggle').onclick=()=>this.panel('volume',$('musicVolumePanel').hidden);
  $('musicVolume').oninput=()=>{this.settings.volume=Number($('musicVolume').value)/100;this.settings.muted=false;this.applySettings();};
  $('musicMute').onclick=()=>{this.settings.muted=!this.settings.muted;this.applySettings();};
  $('musicAutoplay').onchange=()=>{this.settings.autoplay=$('musicAutoplay').checked;this.applySettings();};
  $('musicSeek').oninput=()=>{if(Number.isFinite(this.audio.duration)&&this.audio.duration>0){this.audio.currentTime=Number($('musicSeek').value)*this.audio.duration/1000;this.progress();}};
  $('musicAdd').onclick=()=>{this.picking=true;$('musicFiles').click();};$('musicFiles').oncancel=()=>{this.picking=false;this.dock.schedule();};$('musicFiles').onchange=async e=>{try{await this.importFiles([...e.target.files]);}catch(error){this.message(error.message);}finally{e.target.value='';this.picking=false;this.dock.schedule();}};
  $('musicRestore').onclick=()=>this.restoreBuiltins();
  document.addEventListener('pointerdown',e=>{if(!$('musicWidget').contains(e.target)){this.panel('list',false);this.panel('volume',false);}});
  for(const event of ['playing','waiting'])this.audio.addEventListener(event,()=>{this.buffering=event!=='playing';this.renderPlayback();});
  for(const event of ['play','pause','loadedmetadata','durationchange','ended'])this.audio.addEventListener(event,()=>this.renderPlayback());
  this.audio.addEventListener('timeupdate',()=>this.progress());
  this.audio.addEventListener('ended',()=>{if(this.wantPlayback)this.step(1,{automatic:true});});
  this.audio.addEventListener('error',()=>{if(this.audio.error&&this.current)this.trackError(this.current);});
  // Transfer playback when another app tab starts music; one audible tab at a time.
  try{this.channel=new BroadcastChannel('tiangong-music-playback-v1');this.channel.onmessage=()=>{this.wantPlayback=false;this.needsGesture=false;this.playToken++;this.audio.pause();this.renderPlayback();};}catch{}
  window.addEventListener('pagehide',()=>{this.audio.pause();});
 }
 panel(kind,open){
  const id=kind==='list'?'musicPanel':'musicVolumePanel',button=kind==='list'?'musicListToggle':'musicVolumeToggle';$(id).hidden=!open;$(button).setAttribute('aria-expanded',String(open));
  if(open){this.dock.expand();const other=kind==='list'?'volume':'list';this.panel(other,false);}
  $('musicWidget').classList.toggle('music-popup-open',!$('musicPanel').hidden||!$('musicVolumePanel').hidden);
 }
 applySettings(){this.audio.volume=this.settings.volume;this.audio.muted=this.settings.muted;try{localStorage.setItem(MUSIC_SETTINGS_KEY,JSON.stringify(this.settings));}catch{this.message('音乐设置未能保存');}this.renderPlayback();}
 message(key,params={}){this.notice={key,params};$('musicStatus').textContent=t(key,params);}
 source(track){
  if(track.blob)return URL.createObjectURL(track.blob);
  if(track.url)return track.url;
  const bytes=Uint8Array.from(atob(track.base64),c=>c.charCodeAt(0));return URL.createObjectURL(new Blob([bytes],{type:track.type}));
 }
 select(id,play=true){
  this.playToken++;this.audio.pause();this.wantPlayback=play;this.needsGesture=false;this.buffering=false;this.current=id;this.audio.removeAttribute('src');this.audio.load();if(this.url){URL.revokeObjectURL(this.url);this.url=null;}
  if(id&&this.tracks.has(id)){try{this.url=this.source(this.tracks.get(id));this.audio.src=this.url;if(play)this.play();}catch{this.trackError(id);}}
  else{this.current=null;this.wantPlayback=false;}
  this.render();
 }
 async play(){
  if(!this.current)return;this.wantPlayback=true;this.needsGesture=false;const token=++this.playToken,id=this.current;this.renderPlayback();
  try{await this.audio.play();if(token!==this.playToken)return;this.failed.clear();this.channel?.postMessage('playing');this.renderPlayback();}
  catch(error){if(token!==this.playToken||error.name==='AbortError')return;if(error.name==='NotAllowedError'){this.needsGesture=true;this.renderPlayback();}else this.trackError(id);}
 }
 toggle(){if(!this.loaded)return;if(!this.current){this.select(randomTrack(this.state.order),true);return;}if(!this.audio.paused||this.wantPlayback&&!this.needsGesture&&this.audio.readyState<2){this.wantPlayback=false;this.playToken++;this.audio.pause();this.renderPlayback();}else{this.failed.clear();this.play();}}
 step(direction,{automatic=false}={}){const order=automatic?this.state.order.filter(id=>!this.failed.has(id)):this.state.order;if(!automatic)this.failed.clear();this.select(adjacentTrack(order,this.current,direction),true);}
 trackError(id){
  if(id!==this.current||this.failed.has(id))return;this.failed.add(id);this.message('无法播放：{name}',{name:this.tracks.get(id)?.title||id});const next=adjacentTrack(this.state.order,id,1),remaining=this.state.order.filter(x=>!this.failed.has(x));
  if(this.wantPlayback&&remaining.length){const start=this.state.order.indexOf(next);const ordered=[...this.state.order.slice(start),...this.state.order.slice(0,start)];this.select(ordered.find(x=>!this.failed.has(x)),true);}
  else{this.wantPlayback=false;this.audio.pause();this.renderPlayback();}
 }
 async edit(operation){
  if(this.busy||!this.loaded)return;this.busy=true;this.renderList();
  try{await operation();}catch(error){this.message(error.message||'音乐库保存失败');}finally{this.busy=false;this.render();this.dock.schedule();}
 }
 async reorder(id,before){return this.edit(async()=>{const next={...this.state,order:moveTrack(this.state.order,id,before)};await this.store.commit(next);this.state=next;});}
 async remove(id){return this.edit(async()=>{
  const track=this.tracks.get(id),index=this.state.order.indexOf(id);if(!track||index<0)return;
  const next={...this.state,order:this.state.order.filter(x=>x!==id),removed:track.builtin?[...this.state.removed,id]:this.state.removed};
  await this.store.commit(next,[],track.builtin?[]:[id]);this.state=next;if(!track.builtin)this.tracks.delete(id);
  if(this.current===id)this.select(next.order[index%next.order.length]||null,this.wantPlayback);this.message('已移除：{name}',{name:track.title});
 });}
 async restoreBuiltins(){return this.edit(async()=>{const next=reconcileMusic({...this.state,removed:[]},[...this.tracks.values()]);await this.store.commit(next);this.state=next;if(!this.current)this.select(randomTrack(next.order),false);this.message('内置音乐已恢复');});}
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
  const track=this.tracks.get(this.current);$('musicTrackTitle').textContent=track?.title||t('音乐列表为空');$('musicTitleButton').title=track?.title||t('打开播放列表');
  const playing=!this.audio.paused;const active=playing&&!this.audio.ended&&!this.buffering;$('musicOrb').classList.toggle('is-playing',active);$('musicOrb').title=t(this.needsGesture?'点击播放':'背景音乐')+(track?' · '+track.title:'');$('musicOrb').setAttribute('aria-label',t('展开音乐播放器')+(track?' · '+track.title:''));$('musicPlay').classList.toggle('is-playing',playing);$('musicPlay').setAttribute('aria-label',t(playing?'暂停音乐':'播放音乐'));$('musicPlay').title=t(playing?'暂停音乐':'播放音乐');
  for(const id of ['musicPlay','musicPrevious','musicNext'])$(id).disabled=!this.loaded||!this.state.order.length;
  $('musicVolume').value=String(Math.round(this.settings.volume*100));$('musicVolumeValue').textContent=Math.round(this.settings.volume*100)+'%';$('musicMute').setAttribute('aria-pressed',String(this.settings.muted));$('musicMute').textContent=t(this.settings.muted?'取消静音':'静音');$('musicVolumeToggle').classList.toggle('muted',this.settings.muted||this.settings.volume===0);$('musicVolumeToggle').title=t(this.settings.muted?'已静音':'音量');$('musicAutoplay').checked=this.settings.autoplay;
  for(const row of $('musicList').children){const selected=row.dataset.id===this.current;row.classList.toggle('current',selected);row.querySelector('.music-track')?.setAttribute('aria-current',String(selected));}
  this.progress();
 }
 progress(){const duration=this.audio.duration,valid=Number.isFinite(duration)&&duration>0;$('musicSeek').disabled=!valid;$('musicSeek').value=valid?String(1000*this.audio.currentTime/duration):'0';$('musicSeek').setAttribute('aria-valuetext',musicTime(this.audio.currentTime)+' / '+musicTime(valid?duration:this.tracks.get(this.current)?.duration));$('musicMeta').textContent=this.needsGesture?t('点击播放'):!this.loaded?t('正在准备音乐…'):musicTime(this.audio.currentTime)+' / '+musicTime(valid?duration:this.tracks.get(this.current)?.duration);}
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
