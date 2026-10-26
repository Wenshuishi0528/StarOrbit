import {syncGeographyControls} from './geography-settings.js';
import {syncStarChartControls} from './star-chart-settings.js';
import {t,setText} from './i18n.js';
import {SCENE_FORMAT,MAX_SCENE_BYTES,DISPLAY_KEYS,validateScene} from './scene-format.js';

const $=id=>document.getElementById(id);
const cameraState=(camera,controls)=>({position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray(),fov:camera.fov,zoom:camera.zoom});
function restoreCamera(camera,controls,x){
 controls.stopMotion();camera.position.fromArray(x.position);camera.up.fromArray(x.up).normalize();camera.fov=x.fov;camera.zoom=x.zoom;camera.updateProjectionMatrix();controls.target.fromArray(x.target);
 const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;
}
export function installSceneShare(sim,replaceAssembly){
 const api=sim.api,env=sim.environment,weather=env.weather;
 let busy=false;
 const recordRef=kind=>{const r=weather.items.find(x=>x.id===weather.active[kind]);return r?{id:r.id,source:r.source||'',provider:r.provider||'',time:r.time??null}:null;};
 const capture=()=>{
  if(sim.missions.busy||sim.sceneBusy)throw Error('正在恢复场景…');
  const home=env.moon.savedView;
  return validateScene({format:SCENE_FORMAT,name:$('sceneName').value.trim().slice(0,60)||'Tiangong',appVersion:document.querySelector('.app-version').textContent,mission:{id:sim.missionId,pose:{...sim.missions.state.pose},rotation:{...sim.missions.state.rotation}},assembly:sim.capabilities.assembly?structuredClone(api.state):null,simulation:{time:sim.time,speed:sim.speed,auto:sim.auto,view:sim.view},environment:{...env.settings},phenomena:{...env.phenomena.settings},weather:{...weather.settings,cloudRecord:recordRef('cloud'),auroraRecord:recordRef('aurora')},display:Object.fromEntries(DISPLAY_KEYS.map(k=>[k,$(k).checked])),cameras:{follow:cameraState(api.camera,api.controls),overview:cameraState(sim.spaceCamera,sim.orbitControls),home:home?{...home,position:home.position.toArray(),target:home.target.toArray(),up:home.up.toArray()}:null},orbit:sim.data?{...structuredClone(sim.data),source:String(sim.data.source||''),created:String(sim.data.created||'')}:null});
 };
 async function importScene(input){
  if(busy||sim.missions.busy)throw Error('正在恢复场景…');
  const scene=validateScene(input); // Validate everything before changing the live scene.
  busy=true;sim.sceneBusy=true;$('missionSelect').disabled=true;$('exportScene').disabled=$('importScene').disabled=true;
  setText('sceneStatus','正在恢复场景…');
  try{
   await Promise.all([env.ready,weather.ready]);
   if(weather.busy)throw Error('数据正在更新，请稍后导入场景');
   // Persist the small orbit snapshot so a reload keeps the shared time valid.
   await sim.missions.switchTo(scene.mission.id,{fromScene:true});
   const record=scene.orbit?await weather.store('orbit',new Blob([JSON.stringify(scene.orbit)],{type:'application/json'}),{missionId:scene.mission.id,time:scene.orbit.rows[0][0],source:scene.orbit.source,favorite:true}):null;
   sim.auto=false;api.stopAnimation();sim.paused=true;sim.mode='custom';
   weather.useOrbit(scene.orbit,false);weather.active.orbit=record?.id??null;weather.settings.orbitRecord=record?.id??'none';
   if(scene.assembly)replaceAssembly(scene.assembly);sim.missions.state.pose=scene.mission.pose;sim.missions.state.rotation=scene.mission.rotation;sim.missions.applyPose();
   const {cloudRecord,auroraRecord,...settings}=scene.weather,missing=[];
   Object.assign(weather.settings,settings);
   for(const kind of ['cloud','aurora']){
    if(!['latest','history','satcorps'].includes(settings[kind]))continue;
    const ref=kind==='cloud'?cloudRecord:auroraRecord,r=ref&&weather.items.find(x=>x.kind===kind&&x.id===ref.id);
    if(r){weather.settings[kind]='history';weather.settings[kind+'History']=r.id;}
    else{weather.settings[kind]=kind==='cloud'?'builtin':'off';missing.push(kind);}
   }
   env.phenomena.restore(scene.phenomena);weather.sync();weather.save();Object.assign(env.settings,scene.environment);env.save();
   for(const [key,id] of Object.entries({moon:'showMoon',stars:'showStars',milky:'showMilky',clouds:'showClouds',groundTrack:'groundTrack'}))$(id).checked=env.settings[key];
   syncStarChartControls(env.settings);syncGeographyControls(env.settings);$('skyExposure').value=env.settings.exposure;$('cloudOpacity').value=env.settings.cloudOpacity;$('starBrightness').value=env.settings.starBrightness;
   if(env.quality!==scene.environment.quality)await env.setQuality(scene.environment.quality);
   if(env.quality!==scene.environment.quality){missing.push('quality');env.settings.quality=env.quality;env.save();}
   await env.setSkyStyle();
   for(const key of DISPLAY_KEYS)$(key).checked=scene.display[key];
   $('showTelemetry').onchange();sim.minimap.setVisible(scene.display.showMinimap);
   sim.seek(scene.simulation.time);sim.speed=scene.simulation.speed;sim.setView(scene.simulation.view);
   restoreCamera(api.camera,api.controls,scene.cameras.follow);restoreCamera(sim.spaceCamera,sim.orbitControls,scene.cameras.overview);
   const home=scene.cameras.home;env.moon.savedView=home?{position:api.camera.position.clone().fromArray(home.position),target:api.controls.target.clone().fromArray(home.target),up:api.camera.up.clone().fromArray(home.up),fov:home.fov,zoom:home.zoom}:null;
   setText('lookMoon',home?'返回航天器':'望向月球');
   sim.auto=sim.capabilities.solarArrays&&scene.simulation.auto;$('autoTrack').checked=sim.auto;sim.dirty=true;sim.snap=false;sim.inputDirty=false;sim.lastWall=performance.now();sim.timeUI();sim.controlUI();api.resize();
   const applied=await Promise.allSettled(['cloud','aurora'].map(k=>weather.apply(k)));
   if(applied.some(x=>x.status==='rejected'))missing.push('environment');
   weather.render();$('sceneName').value=scene.name;sim.sessionMemory.save();
   const notices={cloud:'未找到云图快照，使用内置云图。',aurora:'未找到极光快照，极光已关闭。',quality:'画质素材未能全部载入，已保留可用画质。',environment:'部分环境数据未能载入，请在数据栏重试。'};
   setText('sceneStatus',missing.length?'场景已恢复并暂停。{details}':'场景已恢复并暂停。',{details:missing.map(k=>t(notices[k])).join(' ')});
   return {missing};
  }finally{busy=false;sim.sceneBusy=false;$('exportScene').disabled=$('importScene').disabled=false;sim.missions.syncUI();sim.sessionMemory.save();}
 }
 $('exportScene').onclick=async()=>{
  if(busy||sim.missions.busy)return;busy=true;$('exportScene').disabled=$('importScene').disabled=true;
  try{
   await Promise.allSettled([env.ready,weather.ready,env.skyLoad,...Object.values(weather.pendingApply||{}).map(x=>x.promise)]);
   const text=JSON.stringify(capture()),blob=new Blob([text],{type:'application/json'});
   if(blob.size>MAX_SCENE_BYTES)throw Error('场景文件超过 16 MB');
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=($('sceneName').value.trim().slice(0,60)||'Tiangong').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_')+'.tiangong.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
   setText('sceneStatus','场景已导出 · {size} KB',{size:(blob.size/1024).toFixed(0)});
  }catch(error){setText('sceneStatus','无法导出场景：{error}',{error:t(error.message)});}
  finally{busy=false;$('exportScene').disabled=$('importScene').disabled=false;}
 };
 $('importScene').onclick=()=>$('sceneFile').click();
 $('sceneFile').onchange=async()=>{
  const file=$('sceneFile').files[0];if(!file)return;
  try{if(file.size>MAX_SCENE_BYTES)throw Error('场景文件超过 16 MB');let value;try{value=JSON.parse(await file.text());}catch{throw Error('场景文件不是有效的 JSON');}await importScene(value);}
  catch(error){setText('sceneStatus','无法导入场景：{error}',{error:t(error.message)});}
  finally{$('sceneFile').value='';}
 };
 sim.sceneShare={capture,importScene};
}
