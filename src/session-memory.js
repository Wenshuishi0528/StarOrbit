import {setText} from './i18n.js';
const KEY='tiangong-session-v1';
const $=id=>document.getElementById(id);
const switches=['occlusion','orbitPath','sunVector','fillLight','labels'];
const settingsKeys=[KEY,'tiangong-phenomena-v1','tiangong-sidebar-v1','tiangong-viewer-v1','tiangong-viewer-v2','tiangong-viewer-v3','tiangong-environment-v1','tiangong-weather-settings-v1','tiangong-minimap-v1','tiangong-overlays-v1','tiangong-language-v1'];
const vector=a=>Array.isArray(a)&&a.length===3&&a.every(v=>Number.isFinite(v)&&Math.abs(v)<1e7);
function restoreCamera(camera,controls,s){
 if(!s||!vector(s.position)||!vector(s.target))return;
 if(Math.hypot(...s.position.map((v,i)=>v-s.target[i]))<.01)return;
 camera.position.fromArray(s.position);controls.target.fromArray(s.target);
 if(vector(s.up)&&Math.hypot(...s.up)>.1)camera.up.fromArray(s.up).normalize();
 if(Number.isFinite(s.fov))camera.fov=Math.max(10,Math.min(100,s.fov));
 camera.updateProjectionMatrix();controls.update();
}
const cameraState=(camera,controls)=>({position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray(),fov:camera.fov});
export async function installSessionMemory(sim,assembly){
 let saved=null,resetting=false,timer;const api=sim.api;
 try{saved=JSON.parse(localStorage.getItem(KEY));}catch{}
 // Restore tracking before the first animation frame can overwrite manual angles.
 if(typeof saved?.auto==='boolean'){sim.auto=saved.auto;$('autoTrack').checked=sim.auto;}
 for(const id of switches)if(typeof saved?.switches?.[id]==='boolean')$(id).checked=saved.switches[id];
 await Promise.allSettled([sim.environment.ready,sim.environment.weather.ready]);
 if(saved){
  if([1,10,60,300,1000].includes(saved.speed))sim.speed=saved.speed;
  const now=Date.now(),valid=x=>Number.isFinite(x)&&x>=sim.start&&x<=sim.end;
  sim.mode=saved.mode==='real'?'real':'custom';sim.paused=!!saved.paused;
  const desired=sim.mode==='real'?now:saved.time;
  if(valid(desired))sim.time=desired;
  else{sim.time=valid(saved.time)?saved.time:(sim.start+sim.end)/2;sim.mode='custom';sim.paused=true;api.toast('已恢复设置；保存的时刻超出当前轨道范围，已改为有效时刻。');}
  sim.setView(saved.view==='orbit'?'orbit':'follow');
  restoreCamera(api.camera,api.controls,saved.camera);
  if(sim.view==='orbit')restoreCamera(sim.spaceCamera,sim.orbitControls,saved.spaceCamera);
  assembly.setPlaying(!!saved.playing&&!sim.auto);
  document.querySelectorAll('aside details').forEach((el,i)=>{if(typeof saved.details?.[i]==='boolean')el.open=saved.details[i];});
  $('telemetry').classList.toggle('expanded',!!saved.telemetry);
  $('toggleTelemetry').setAttribute('aria-expanded',String(!!saved.telemetry));
  for(const cls of ['immersive','photo-mode'])document.body.classList.toggle(cls,!!saved[cls]);
  $('immersiveExit').hidden=!saved.immersive;$('photoExit').hidden=!saved['photo-mode'];
  if(Number.isFinite(saved.scroll))document.querySelector('aside').scrollTop=saved.scroll;
  for(const id of ['environmentPresetName','environmentPresets','sceneName'])if(typeof saved.fields?.[id]==='string')$(id).value=saved.fields[id];
 }
 sim.dirty=true;sim.snap=true;sim.lastWall=performance.now();sim.timeUI();sim.controlUI();api.resize();
 const persist=()=>{
  if(resetting)return;
  try{
   const s={mode:sim.mode,time:sim.time,speed:sim.speed,paused:sim.paused,auto:sim.auto,view:sim.view,playing:assembly.getPlaying(),camera:cameraState(api.camera,api.controls),spaceCamera:sim.view==='orbit'?cameraState(sim.spaceCamera,sim.orbitControls):saved?.spaceCamera,switches:Object.fromEntries(switches.map(id=>[id,$(id).checked])),details:[...document.querySelectorAll('aside details')].map(el=>el.open),telemetry:$('telemetry').classList.contains('expanded'),scroll:document.querySelector('aside').scrollTop,fields:Object.fromEntries(['environmentPresetName','environmentPresets','sceneName'].map(id=>[id,$(id).value])),immersive:document.body.classList.contains('immersive'),'photo-mode':document.body.classList.contains('photo-mode')};
   localStorage.setItem(KEY,JSON.stringify(s));saved=s;assembly.saveAssembly();
  }catch{setText('memoryStatus','浏览器未允许保存设置，本次修改可能无法在下次打开时恢复。');}
 };
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(persist,250);};
 for(const event of ['input','change','click','toggle'])document.addEventListener(event,schedule,true);
 api.controls.addEventListener('end',schedule);sim.orbitControls.addEventListener('end',schedule);
 document.querySelector('aside').addEventListener('scroll',schedule,{passive:true});
 window.addEventListener('pagehide',persist);window.addEventListener('beforeunload',persist);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
 // Save progressing simulation time as well as explicit user changes.
 const interval=setInterval(persist,5000);
 $('factoryReset').onclick=()=>$('factoryDialog').showModal();
 $('cancelFactoryReset').onclick=()=>$('factoryDialog').close();
 $('confirmFactoryReset').onclick=()=>{
  resetting=true;clearTimeout(timer);clearInterval(interval);
  try{assembly.saveAssembly();for(const key of settingsKeys)localStorage.removeItem(key);location.reload();}
  catch{resetting=false;setText('memoryStatus','浏览器未允许保存设置，本次修改可能无法在下次打开时恢复。');$('factoryDialog').close();}
 };
 sim.sessionMemory={save:persist};
}
