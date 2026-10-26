import {readPackedModel} from './runtime-assets.js';
import {missionLibrary} from './mission-library.js';
import {MISSION_TEMPLATE,unregisterMissionPackage} from './mission-package.js';
import {orbitSource} from './orbit-repository.js';
import {validateRotation,spinAngle,toggleSpin} from './spacecraft-attitude.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {normalizeSpacecraft,applyBodyPose} from './spacecraft-model.js';
import {t,onLanguageChange,setText} from './i18n.js';
import {MISSIONS,DEFAULT_MISSION,mission,missionLabel,spacecraft,validatePose} from './missions.js';

export const MISSION_MEMORY_KEY='tiangong-missions-v1';
const $=id=>document.getElementById(id);
const captureCamera=(camera,controls)=>({position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray(),fov:camera.fov,zoom:camera.zoom});
function restoreCamera(camera,controls,value){
 if(!value||!['position','target','up'].every(k=>Array.isArray(value[k])&&value[k].length===3&&value[k].every(n=>Number.isFinite(n)&&Math.abs(n)<1e7)))return false;
 if(Math.hypot(...value.up)<.1||Math.hypot(...value.position.map((n,i)=>n-value.target[i]))<1e-9)return false;
 controls.stopMotion();camera.position.fromArray(value.position);camera.up.fromArray(value.up).normalize();camera.fov=Math.max(10,Math.min(100,value.fov||38));camera.zoom=Math.max(.1,Math.min(20,value.zoom||1));camera.updateProjectionMatrix();controls.target.fromArray(value.target);
 const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;return true;
}
export class MissionController{
 constructor(sim){
  this.sim=sim;this.api=sim.api;this.models=new Map();this.states={};this.busy=false;
  try{const saved=JSON.parse(localStorage.getItem(MISSION_MEMORY_KEY));if(saved){this.savedId=Object.hasOwn(MISSIONS,saved.active)?saved.active:DEFAULT_MISSION;for(const id of Object.keys(MISSIONS))if(saved.states?.[id]){const v=saved.states[id];this.states[id]={...v,pose:validatePose(v.pose),rotation:validateRotation(v.rotation,sim.time,{enabled:!!mission(id).spinRpm})};}}}catch{this.states={};}
  $('missionSelect').onchange=()=>this.switchTo($('missionSelect').value).catch(e=>{this.syncUI();this.api.toast('切换失败：{error}',{error:t(e.message)});});
  for(const key of ['roll','pitch','yaw'])$('craft'+key).oninput=()=>{const state=this.state;state.pose[key]=Math.max(-180,Math.min(180,Number($('craft'+key).value)||0));this.applyPose();this.save();};
  $('craftAttitudeMode').onchange=()=>{this.state.rotation.mode=$('craftAttitudeMode').value;sim.dirty=true;sim.update(performance.now());this.syncUI();this.save();};
  $('craftSpin').onchange=()=>{this.state.rotation=toggleSpin(this.state.rotation,$('craftSpin').checked,sim.time,mission(sim.missionId).spinRpm||0);this.applyPose();this.save();};
  $('resetCraftPose').onclick=()=>{this.state.pose=validatePose();this.applyPose();this.syncUI();this.save();};
  $('validOrbitTime').onclick=()=>{if(sim.data){sim.seek((sim.start+sim.end)/2);sim.update(performance.now());this.syncUI();}};
  $('importMission').onclick=()=>$('missionFiles').click();
  $('missionFiles').onchange=async e=>{try{await this.importPackage([...e.target.files]);}catch(error){$('missionImportStatus').textContent=t('导入失败：{error}',{error:error.message});}finally{e.target.value='';}};
  $('missionTemplate').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(MISSION_TEMPLATE,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='mission.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
  if(missionLibrary.errors.length)$('missionImportStatus').textContent=missionLibrary.errors.join('；');
  onLanguageChange(()=>this.syncUI());this.syncUI();
 }
 get state(){return this.states[this.sim.missionId]??=( {pose:validatePose(),rotation:validateRotation({},this.sim.time,{enabled:!!mission(this.sim.missionId).spinRpm}),auto:true,view:'follow'} );}
 activeGroups(){return spacecraft(this.sim.missionId).capabilities.assembly?this.api.groups:{spacecraft:this.models.get(this.sim.missionId)};}
 capture(){
  const s=this.state,sim=this.sim,api=this.api;Object.assign(s,{auto:sim.auto,view:sim.view,camera:captureCamera(api.camera,api.controls),overview:captureCamera(sim.spaceCamera,sim.orbitControls)});
  // Return from Moon before storing the task's normal follow camera.
  const home=sim.environment.moon.savedView;if(home)s.camera={...home,position:home.position.toArray(),target:home.target.toArray(),up:home.up.toArray()};
 }
 save(){if(this.busy)return;this.capture();try{localStorage.setItem(MISSION_MEMORY_KEY,JSON.stringify({active:this.sim.missionId,states:this.states}));}catch{setText('memoryStatus','浏览器未允许保存设置，本次修改可能无法在下次打开时恢复。');}}
 async restore(){await this.sim.environment.weather.ready;await this.switchTo(this.savedId||DEFAULT_MISSION,{restoring:true});}
 async load(id){
  if(spacecraft(id).capabilities.assembly||this.models.has(id))return;
  const definition=spacecraft(id),record=missionLibrary.packages.get(id);let buffer;
  if(record)buffer=await record.blob.arrayBuffer();
  else{const encoded=JSON.parse($('spacecraftModels').textContent)[mission(id).spacecraft];if(!encoded)throw Error('缺少航天器模型');
   buffer=await readPackedModel(encoded);}
  const gltf=await new GLTFLoader().parseAsync(buffer,''),root=normalizeSpacecraft(gltf.scene,definition);root.name='mission_'+id;root.visible=false;
  const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()).length();if(box.isEmpty()||!Number.isFinite(size)||size<.0001||size>5e6)throw Error('模型尺寸无效，请检查比例与网格');
  // Preserve the GLB's PBR materials; the shared scene owns display lighting.
  root.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  this.api.modelRoot.add(root);this.models.set(id,root);
 }
 applyPose(){const root=this.models.get(this.sim.missionId);if(root){this.updateRotation();this.sim.rebuild();}}
 updateRotation(){const root=this.models.get(this.sim.missionId);if(root)applyBodyPose(root,this.state.pose,spinAngle(this.state.rotation,this.sim.time,mission(this.sim.missionId).spinRpm||0));}
 syncUI(){
  const sim=this.sim,id=sim.missionId,craft=spacecraft(id),cap=craft.capabilities;
  $('missionSelect').replaceChildren(...Object.keys(MISSIONS).map(key=>new Option(missionLabel(key,t),key)));$('missionSelect').value=id;$('missionSelect').disabled=this.busy||sim.sceneBusy||this.importing||false;$('importMission').disabled=this.busy||sim.sceneBusy||this.importing||false;for(const key of ['exportScene','importScene'])$(key).disabled=this.busy||sim.sceneBusy||false;
  $('officialOrbitLink').hidden=!orbitSource(id);$('officialOrbitLink').href=orbitSource(id)||'#';$('dataMessage').textContent='';
  $('activeMission').textContent=missionLabel(id,t);$('activeMission').title=missionLabel(id,t);$('missionSummary').textContent=t(cap.assembly?'模块化空间站 · 地面轨迹定向':'独立卫星 · 航向与自旋');
  for(const name of ['assembly','solar'])document.querySelector(`[data-settings-module="${name}"]`).hidden=!cap[name==='solar'?'solarArrays':'assembly'];
  $('attitudeCraftName').textContent=t(craft.name);$('attitudeAxes').textContent=t(craft.axes||'星体采用右手坐标系；具体轴向由模型配置定义。');$('attitudeFrame').textContent=t(mission(id).attitudeNote||'姿态按当前任务的参考系与控制参数计算。');
  $('craftSpinLabel').textContent=t('自动自旋 · {rpm} 转/分',{rpm:mission(id).spinRpm||0});$('craftSpinNote').textContent=mission(id).spinRpm?t('自旋速度：{rpm} 转/分。随模拟时间和倍速运行，暂停时间即停止；按星体 +Z 右手方向旋转。',{rpm:mission(id).spinRpm}):'';
  $('attitudeSourceLink').hidden=!mission(id).spinSource;if(mission(id).spinSource)$('attitudeSourceLink').href=mission(id).spinSource;
  $('craftAttitudeMode').value=this.state.rotation.mode;$('craftSpin').checked=this.state.rotation.enabled;$('craftSpinControl').hidden=!mission(id).spinRpm;
  $('craftAttitude').hidden=!cap.manualAttitude;$('reset').hidden=!cap.assembly;
  $('arrayYield').parentElement.hidden=!cap.solarArrays;
  for(const key of ['roll','pitch','yaw'])$('craft'+key).value=this.state.pose[key];
  if(!cap.assembly){$('status').textContent=t(craft.name);$('selection').textContent=t(craft.name)+' · '+t('航向与自旋');}
  else{this.api.syncControls();setText('status','{count} 个舱体',{count:Object.keys(this.api.groups).length});}
  const status=sim.orbitStatus;$('missionOrbitStatus').textContent=t(status==='missing'?'轨道待配置 · 当前仅查看模型':status==='out-of-range'?'轨道演算不可用':'已载入此任务的独立轨道');
  $('validOrbitTime').hidden=status!=='out-of-range';
 }
 async importPackage(files){
  if(this.busy||this.sim.sceneBusy||this.importing)throw Error('正在恢复场景…');
  this.importing=true;this.sim.sceneBusy=true;this.syncUI();let record,committed=false;
  try{
   record=await missionLibrary.prepare(files);missionLibrary.packages.set(record.id,record);
   await this.load(record.id);await missionLibrary.commit(record);committed=true;this.sim.bundledOrbits[record.id]=record.orbit;
   await this.switchTo(record.id,{fromScene:true});$('missionImportStatus').textContent=t('任务已导入并保存：{name}',{name:missionLabel(record.id,t)});
  }catch(e){if(record&&!committed){this.models.get(record.id)?.removeFromParent();this.models.delete(record.id);missionLibrary.packages.delete(record.id);unregisterMissionPackage(record.id);}throw e;}
  finally{this.importing=false;this.sim.sceneBusy=false;this.syncUI();this.sim.sessionMemory?.save();}
 }
 async switchTo(id,{restoring=false,fromScene=false}={}){
  mission(id);if(this.busy||this.sim.sceneBusy&&!fromScene)throw Error('正在恢复场景…');
  const sim=this.sim,weather=sim.environment.weather;this.busy=true;this.syncUI();
  try{
   // Load and validate before committing: a failed asset leaves the old task intact.
   await this.load(id);await weather.ready;const {data,recordId}=await weather.orbitForMission(id);
   if(!restoring)this.capture();this.api.stopAnimation();sim.environment.moon.savedView=null;setText('lookMoon','望向月球');
   sim.missionId=id;sim.bundledOrbit=sim.bundledOrbits[id]??null;weather.settings.orbitRecord=recordId;weather.active.orbit=recordId==='none'?null:recordId;
   this.api.model.visible=spacecraft(id).capabilities.assembly;for(const [key,root]of this.models)root.visible=key===id;
   sim.auto=spacecraft(id).capabilities.solarArrays&&this.state.auto;$('autoTrack').checked=sim.auto;
   sim.setOrbit(data);this.applyPose();sim.rebuild();sim.current=null;sim.lastWall=performance.now();
   const size=this.api.bounds().getSize(new THREE.Vector3()).length();this.api.controls.minDistance=spacecraft(id).capabilities.assembly?15:Math.max(.00001,size*.01);this.api.controls.maxDistance=Math.max(spacecraft(id).capabilities.assembly?1600:1,size*20);
   sim.setView('follow');this.api.camera.up.set(0,0,1);this.api.camera.fov=38;this.api.camera.zoom=1;this.api.camera.updateProjectionMatrix();
   if(!restoreCamera(this.api.camera,this.api.controls,this.state.camera))this.api.fit(null,[1,-1,.6]);
   restoreCamera(sim.spaceCamera,sim.orbitControls,this.state.overview);
   if(this.state.view==='orbit'&&sim.orbitStatus==='ready'){sim.setView('orbit');restoreCamera(sim.spaceCamera,sim.orbitControls,this.state.overview);}
   if(!restoring)sim.update(performance.now());weather.save();weather.render();this.syncUI();
  }finally{this.busy=false;this.syncUI();}
  this.save();sim.sessionMemory?.save();
 }
}
