import {DFH1_HISTORY,orbitSegment} from './dfh1-history.js';
import {missionLibrary} from './mission-library.js';
import {installDisplayControls} from './display-controls.js';
import {t,setText,onLanguageChange} from './i18n.js';
import * as THREE from 'three';
import {createOrbitControls} from './camera-controls.js';
import {parseMissionOrbit} from './gp-orbit.js';
import {EARTH_RADIUS,validateOrbit,snapshot,interpolate,stateAt,validTime,clampTime,orbitComputationMode,sunlightFraction,earthAxes,sunPosition} from './orbit.js';
import {SolarTracker} from './solar.js';
import {SunView} from './sun-view.js';
import {SpacecraftLighting} from './spacecraft-lighting.js';
import {fitSpacecraftShadow,SpacecraftShadowCache} from './spacecraft-shadow.js';
import {Environment} from './environment.js';
import {OrbitMinimap} from './minimap.js';
import {EventTimeline} from './event-timeline.js';
import {DEFAULT_MISSION,mission,spacecraft,orbitState,bindOrbit,VIEW_UNITS_PER_METRE} from './missions.js';
import {spacecraftAttitude} from './spacecraft-attitude.js';
import {groundTrackAttitude} from './attitude.js';
const $=id=>document.getElementById(id),V=a=>new THREE.Vector3(...a),basis=axes=>new THREE.Matrix4().makeBasis(...axes.map(V));
import {clockText} from './time-format.js';
import {DateTimeInput} from './date-time-input.js';
export class Simulation{
 constructor(api){
  this.api=api;this.missionId=DEFAULT_MISSION;this.bundledOrbits=Object.fromEntries(Object.entries(JSON.parse($('missionOrbits').textContent)).map(([id,data])=>[id,data===null?null:bindOrbit(validateOrbit(data),id)]));Object.assign(this.bundledOrbits,missionLibrary.orbits);this.bundledOrbit=this.bundledOrbits[DEFAULT_MISSION];this.data=this.bundledOrbit;this.mode='real';this.time=Date.now();this.speed=1;this.timeStep=60000;this.paused=false;this.view='follow';this.auto=true;this.dirty=true;this.snap=true;this.lastSolve=0;this.lastRead=0;this.lastOrbit=0;this.lastWall=performance.now();this.current=null;
  this.sky=new THREE.Scene();this.sky.background=new THREE.Color('#020713');this.spaceCamera=new THREE.PerspectiveCamera(api.camera.fov,1,.1,1000000);this.spaceCamera.up.set(0,0,1);this.spaceCamera.position.set(13000,-16000,11000);
  this.orbitControls=createOrbitControls(this.spaceCamera,api.renderer.domElement);this.orbitControls.enableDamping=true;this.orbitControls.enabled=false;this.orbitControls.minDistance=7500;this.orbitControls.maxDistance=60000;
  this.sky.background=null;this.environment=new Environment(this);this.minimap=new OrbitMinimap(this);this.timeline=new EventTimeline(this);
  this.marker=new THREE.Mesh(new THREE.SphereGeometry(65,16,10),new THREE.MeshBasicMaterial({color:0x7deaff}));this.sky.add(this.marker);
  this.sunDisc=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),new THREE.MeshBasicMaterial({color:0xfff5ce}));this.sky.add(this.sunDisc);this.sunView=new SunView(this);
  this.sunArrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),11500,0xffd27e,700,300);this.sky.add(this.sunArrow);
  this.orbitLine=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.8}));this.sky.add(this.orbitLine);
  this.localSunArrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(),60,0xffd27e,6,3);api.scene.add(this.localSunArrow);
  this.tracker=new SolarTracker(api);this.lighting=new SpacecraftLighting(api);this.shadowCache=new SpacecraftShadowCache(api.sunLight);
  this.bind();this.rebuild();this.dataUI();
  this.timeUI();onLanguageChange(()=>{this.dataUI();this.timeUI();this.controlUI();if(this.current)this.readout(this.current);});
 }
 get start(){return this.data?.rows[0][0]??NaN;}get end(){return this.data?.rows.at(-1)[0]??NaN;}
 get orbitStatus(){return orbitState(this.data,this.time);}
 get capabilities(){return spacecraft(this.missionId).capabilities;}
 setOrbit(data){
  this.data=data===null?null:bindOrbit(validateOrbit(data),this.missionId);this.inertialReference=this.data?interpolate(this.data.rows,Math.max(this.data.rows[0][0],Math.min(this.data.rows.at(-1)[0],Date.parse(this.data.gpEpoch)||(this.data.rows[0][0]+this.data.rows.at(-1)[0])/2))):null;this.modernReference=this.inertialReference;this.lastOrbitSegment=null;this.current=null;this.lastOrbit=0;this.dirty=this.snap=true;
  this.minimap.lastTrack=this.minimap.lastDraw=-Infinity;this.minimap.points=[];this.minimap.dragging=false;this.minimap.pendingTime=null;cancelAnimationFrame(this.minimap.dragFrame);this.minimap.canvas.classList.remove('dragging');
  this.environment.trackData=null;this.environment.track.visible=this.environment.groundMarker.visible=false;
  this.marker.visible=this.orbitLine.visible=false;
  if(this.orbitStatus!=='ready'){this.mode='custom';this.paused=true;this.setView('follow');}
  this.timeline.reset();this.dataUI();this.timeUI();this.missions?.syncUI();
 }

 syncOrbitEra(){
  const era=orbitSegment(this.data,this.time);if(era===this.lastOrbitSegment)return;
  this.lastOrbitSegment=era;this.lastOrbit=-Infinity;this.minimap.lastTrack=-Infinity;this.minimap.lastDraw=-Infinity;this.environment.lastTrack=-Infinity;
  this.inertialReference=era==='historical'?stateAt(this.data,DFH1_HISTORY.epoch):this.modernReference;
  this.dataUI();this.missions?.syncUI();
 }
 dataUI(){if(this.data&&orbitSegment(this.data,this.time)==='historical'){
  $('dataRange').textContent=t('历史轨道 · 1970 年新华社公报')+'\n'+t('近地点 439 km · 远地点 2384 km\n倾角 68.5° · 周期 114 分钟')+'\n'+t('2000-01-01 00:00（UTC+8）起自动使用现有轨道');return;
 }if(!this.data){$('dataRange').textContent=t('此任务尚未配置轨道。可导入地心 EME2000 / UTC 的 OEM 或 JSON。');$('customTime').removeAttribute('min');$('customTime').removeAttribute('max');return;}const s=clockText(this.start),e=clockText(this.end);$('dataRange').textContent=t('{source} · {count} 条\n{start} — {end}（UTC+8）\n生成：{created} · EME2000 / UTC',{source:t(this.data.source||'导入数据'),count:this.data.rows.length,start:s,end:e,created:t(this.data.created||'未提供')});$('customTime').removeAttribute('min');$('customTime').removeAttribute('max');}
 gpUI(){const mode=orbitComputationMode(this.data,this.time);$('gpStatus').textContent=t(mode==='historical'?'历史轨道 · 1970 年新华社公报':mode==='interpolation'?'星历插值':mode==='propagation'?'轨道演算 · 开普勒椭圆':'轨道演算不可用');}
 timeUI(){this.syncOrbitEra();this.gpUI();this.stepUI();for(const id of ['stepBack','stepForward','pauseTime','speed'])$(id).disabled=false;$('viewMode').querySelector('[value=orbit]').disabled=this.orbitStatus!=='ready';$('lookMoon').disabled=this.orbitStatus!=='ready';$('timeMode').value=this.mode;$('speed').value=String(this.speed);$('pauseTime').textContent=this.paused?t('▶ 继续'):t('Ⅱ 暂停');this.timeInput.set(this.time);$('speed').disabled=this.mode==='real';}
 stepUI(){
  const options=[...document.querySelectorAll('[name=timeStep]')],selected=options.find(input=>Number(input.value)===this.timeStep);
  for(const input of options)input.checked=input===selected;
  for(const [id,sign,label] of [['stepBack','−','后退 {duration}'],['stepForward','+','前进 {duration}']]){
   const button=$(id);button.textContent=sign+selected.dataset.short;button.title=t(label,{duration:t(selected.dataset.duration)});button.setAttribute('aria-label',button.title);
  }
 }
 stepTime(direction){
  const target=this.time+direction*this.timeStep;
  this.timeline.jump(target);
  this.timeline.selected=null;this.timeline.renderSelection();this.timeline.update(performance.now(),true);this.missions?.syncUI();this.sessionMemory?.save();
 }
 bind(){
  installDisplayControls();
  this.timeInput=new DateTimeInput(this);
  $('toggleTelemetry').onclick=()=>{const on=$('telemetry').classList.toggle('expanded');$('toggleTelemetry').setAttribute('aria-expanded',String(on));};
  $('timeMode').onchange=()=>{if($('timeMode').value==='real')this.realTime();else{this.mode='custom';this.timeUI();}};
  $('goNow').onclick=()=>this.realTime();
  $('pauseTime').onclick=()=>{if(this.mode==='real'){this.time=Date.now();this.mode='custom';this.paused=true;}else this.paused=!this.paused;this.timeUI();};
  $('speed').onchange=()=>{this.speed=Number($('speed').value);this.mode='custom';this.paused=false;this.timeUI();};
  $('setTime').onclick=()=>{const t=this.timeInput.read();if(!validTime(t)){this.api.toast('请输入有效日期和时间');return;}this.seek(t);};
  for(const input of document.querySelectorAll('[name=timeStep]'))input.onchange=()=>{this.timeStep=Number(input.value);this.stepUI();this.sessionMemory?.save();};
  $('stepBack').onclick=()=>this.stepTime(-1);$('stepForward').onclick=()=>this.stepTime(1);
  $('viewMode').onchange=()=>this.setView($('viewMode').value);
  $('autoTrack').onchange=()=>{this.auto=$('autoTrack').checked;this.api.stopAnimation();this.dirty=true;this.snap=true;this.controlUI();};
  $('occlusion').onchange=()=>{this.dirty=true;this.snap=true;};
  $('importOrbit').onchange=async e=>{const id=this.missionId;try{if(this.sceneBusy||this.missions?.busy)throw Error('正在恢复场景…');const f=e.target.files[0];if(!f)return;if(f.size>30e6)throw Error('文件超过 30 MB');const data=parseMissionOrbit(await f.text(),id),weather=this.environment.weather;await weather.ready;const record=await weather.store('orbit',new Blob([JSON.stringify(data)],{type:'application/json'}),{missionId:id,time:Date.parse(data.created)||data.rows[0][0],source:'导入轨道',favorite:true});weather.acceptOrbit(data,record.id,id);setText('dataMessage','轨道数据已保存，下次打开会恢复。');this.api.toast('轨道数据已载入');}catch(err){this.api.toast('导入失败：{error}',{error:t(err.message)});}finally{e.target.value='';}};
 }
 realTime(){const now=Date.now();this.inputDirty=false;this.time=now;this.mode='real';this.paused=false;this.dirty=true;this.snap=true;this.timeUI();}
 seek(t){if(!validTime(t))return;this.inputDirty=false;this.time=t;this.mode='custom';this.paused=true;this.dirty=true;this.snap=true;this.timeUI();this.missions?.syncUI();}
 manual(){this.auto=false;this.lastSolveTime=null;$('autoTrack').checked=false;this.controlUI();}
 controlUI(){if(!this.capabilities.solarArrays)return;$('trackingStatus').textContent=this.auto?t('全舱自动追日 · 计算姿态'):t('手动控制 · 角度保持');$('linkLabs').disabled=this.auto||!(this.api.labs().length>1&&['WT','MT'].includes(this.api.types[this.api.state.target]));$('rotationControls').classList.toggle('auto-controls',this.auto);}
 rebuild({poseOnly=false}={}){if(this.capabilities.solarArrays){if(poseOnly)this.tracker.refreshPose();else this.tracker.rebuild();}if(poseOnly)this.poseDirty=true;else this.dirty=true;this.snap=true;const b=new THREE.Box3(),active=Object.entries(this.missions?.activeGroups()||this.api.groups).filter(([,g])=>g?.visible);active.forEach(([,g])=>b.union(new THREE.Box3().setFromObject(g)));this.center=b.getCenter(new THREE.Vector3());this.shadowDistance=fitSpacecraftShadow(this.api.sunLight,b);this.shadowCache.reset(active.flatMap(([id,g])=>{const r=this.api.rig[id];return [g,...(this.capabilities.solarArrays&&r?[r.roll,r.left,r.right]:[])];}));this.localSunArrow.position.copy(this.center);this.controlUI();}
 setView(view){if(view==='orbit'&&this.orbitStatus!=='ready')view='follow';if(view===this.view)return;this.view=view;const overview=view==='orbit';this.api.controls.enabled=!overview;this.orbitControls.enabled=overview;if(overview){this.overviewPosition();this.spaceCamera.up.set(0,0,1);this.orbitControls.target.set(0,0,0);this.spaceCamera.near=10;this.spaceCamera.far=1000000;this.orbitControls.update();}this.dirty=true;this.api.scene.visible=true;$('viewMode').value=view;this.api.resize();}
 overviewPosition(){const q=this.current;if(q){const r=V(q.position).normalize(),side=r.clone().cross(V(q.sunDir)).normalize();this.spaceCamera.position.copy(r.addScaledVector(side,.6).normalize().multiplyScalar(28000));}else this.spaceCamera.position.set(14000,-17000,10000);}
 fit(){if(this.view!=='orbit')return false;this.overviewPosition();this.orbitControls.target.set(0,0,0);this.orbitControls.update();return true;}
 updateOrbit(q){
  const points=[],colors=[];let previous;
  for(let t=q.t-2800000;t<=q.t+2800000;t+=20000){
   const pv=stateAt(this.data,t);if(!pv){previous=null;continue;}
   const segment=orbitSegment(this.data,t),lit=sunlightFraction(pv.position,q.sun),color=lit>.5?[.18,.72,.9]:[.36,.24,.48];
   if(previous&&previous.segment===segment){points.push(...previous.position,...pv.position);colors.push(...previous.color,...color);}
   previous={position:pv.position,color,segment};
  }
  this.orbitLine.geometry.dispose();this.orbitLine.geometry=new THREE.BufferGeometry();this.orbitLine.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));this.orbitLine.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 }
 update(wall){
  const elapsed=Math.max(0,(wall-this.lastWall)/1000);this.lastWall=wall;const old=this.time;
  // Scrubbing owns the selected time while held; playback state stays intact.
  if(!this.minimap.dragging&&!this.timeline.dragging){if(this.mode==='real'){this.time=this.timeline.limitAdvance(old,Date.now());if(this.paused)this.timeUI();}else if(!this.paused){this.time=this.timeline.limitAdvance(old,clampTime(this.time+elapsed*this.speed*1000));if(this.paused)this.timeUI();}}
  this.syncOrbitEra();const status=this.orbitStatus;if(status!==this.lastOrbitStatus){this.lastOrbitStatus=status;if(status!=='ready')this.setView('follow');this.timeUI();this.missions?.syncUI();}
  const raw=snapshot(this.data,this.time),q=raw&&(mission(this.missionId).attitude==='ground-track'?groundTrackAttitude(raw):spacecraftAttitude(raw,this.missions?.state.rotation.mode==='inertial'?(this.inertialReference||raw):raw));this.current=q;this.missions?.updateRotation();this.minimap.update(q,wall);this.timeline.update(wall);
  if(!q){
   this.api.modelRoot.visible=true;this.api.sunLight.position.copy(this.center).addScaledVector(new THREE.Vector3(120,-180,240).normalize(),this.shadowDistance);
   $('simClock').textContent=clockText(this.time);$('clockMode').textContent=t('模型查看 · 无轨道位置');
   for(const id of ['altitude','velocity','arrayYield','groundPoint','selectedYield'])$(id).textContent='—';
   this.marker.visible=this.orbitLine.visible=this.localSunArrow.visible=this.sunArrow.visible=false;$('illumination').textContent=t('展示照明');$('illumination').className='';
   $('simNotice').textContent=t(this.data?'轨道演算不可用':'轨道待配置 · 当前仅查看模型');return;
  }
  this.api.modelRoot.visible=true;this.earth.quaternion.setFromRotationMatrix(basis(q.earthAxes));this.earth.material.uniforms.sun.value.copy(V(q.sun).normalize());this.marker.position.copy(V(q.position));
  const localSun=V(q.sunLocal);this.api.sunLight.position.copy(this.center).addScaledVector(localSun,this.shadowDistance);this.localSunArrow.setDirection(localSun);
  const dirty=this.dirty,poseDirty=this.poseDirty,scrubbing=this.minimap.dragging||this.timeline.dragging,solve=this.capabilities.solarArrays&&!scrubbing&&(dirty||poseDirty||wall-this.lastSolve>700&&q.t!==this.lastSolveTime);
  // Continue pointing through eclipse; illumination only scales lighting and received flux.
  if(this.auto&&solve){this.tracker.solve(q.sunLocal,$('occlusion').checked);this.lastSolve=wall;}
  if(this.capabilities.solarArrays&&this.auto&&!scrubbing)this.tracker.advance((this.time-old)/1000,this.snap,q.sunLocal);
  if(solve){this.tracker.measure(q.sunLocal,q.illumination,$('occlusion').checked);this.api.syncControls();this.controlUI();this.lastSolve=wall;this.lastSolveTime=q.t;}
  if(!scrubbing&&(dirty||Math.abs(q.t-this.lastOrbit)>60000)){this.updateOrbit(q);this.lastOrbit=q.t;}
  if(dirty||poseDirty||wall-this.lastRead>250){this.readout(q);this.lastRead=wall;}
  this.dirty=false;this.poseDirty=false;this.snap=false;
 }
 readout(q){this.gpUI();
  $('simClock').textContent=clockText(q.t);$('clockMode').textContent=`UTC+8 · ${this.mode==='real'?t('现实时间 1×'):this.paused?t('自定义 · 已暂停'):t('自定义 {speed}×',{speed:this.speed})}`;
  $('altitude').textContent=q.altitude.toFixed(1)+' km';$('velocity').textContent=q.speed.toFixed(3)+' km/s';$('groundPoint').textContent=`${Math.abs(q.latitude).toFixed(2)}°${q.latitude>=0?'N':'S'} / ${Math.abs(q.longitude).toFixed(2)}°${q.longitude>=0?'E':'W'}`;
  $('illumination').textContent=q.illumination<.001?t('地影 · 无直射'):q.illumination>.999?t('日照'):t('半影 {percent}%',{percent:(q.illumination*100).toFixed(0)});$('illumination').className=q.illumination>.5?'sunlit':'eclipsed';
  $('arrayYield').textContent=this.capabilities.solarArrays?(this.tracker.total*100||0).toFixed(1)+'%':'—';const reading=this.tracker.readings[this.api.state.target];$('selectedYield').textContent=reading?t('所选实例有效受光：{percent}%',{percent:(reading.effective*100).toFixed(1)}):t('受光面积计算中');
  if(this.minimap.dragging||this.timeline.dragging)$('arrayYield').textContent='—';
  if(!this.inputDirty&&!this.timeInput.focused)this.timeInput.set(q.t);
  $('simNotice').textContent='';
 }
 render(){
  const {renderer,camera,scene,stage}=this.api,q=this.current,overview=this.view==='orbit';
  if(this.environment.devicePixelRatio!==devicePixelRatio)this.environment.updatePixelRatio();
  this.lighting.update(q,$('fillLight').checked);
  if(!q){this.environment.geography.update(null,this.spaceCamera);this.shadowCache.update();scene.background=new THREE.Color('#101b2b');renderer.autoClear=true;renderer.render(scene,camera);scene.background=null;return;}this.spaceCamera.aspect=camera.aspect;this.spaceCamera.fov=camera.fov;
  if(!overview&&q){const rot=basis(q.basis),pos=camera.position.clone().divideScalar(VIEW_UNITS_PER_METRE*1000).applyMatrix4(rot).add(V(q.position));this.spaceCamera.position.copy(pos);this.spaceCamera.up.copy(camera.up).transformDirection(rot);this.spaceCamera.lookAt(this.api.controls.target.clone().divideScalar(VIEW_UNITS_PER_METRE*1000).applyMatrix4(rot).add(V(q.position)));this.spaceCamera.near=10;this.spaceCamera.far=1000000;}else if(overview)this.orbitControls.update();
  this.spaceCamera.updateProjectionMatrix();this.marker.visible=overview&&!!q;this.orbitLine.visible=overview&&$('orbitPath').checked;this.sunArrow.visible=overview&&$('sunVector').checked;this.localSunArrow.visible=!overview&&$('sunVector').checked&&!!q;
  if(q){this.sunArrow.setDirection(V(q.sunDir));this.sunDisc.position.copy(this.spaceCamera.position).addScaledVector(V(q.sunDir),800000);this.sunDisc.scale.setScalar(800000*695700/Math.hypot(...q.sun));}
  this.environment.update(q,this.spaceCamera);const linear=this.environment.beginFrame();this.sunDisc.visible=!linear&&!!q;this.sunView.update(q,this.spaceCamera,linear);this.environment.renderBackground(renderer);renderer.render(this.sky,this.spaceCamera);if(linear)this.environment.finishFrame();
  if(!overview){this.shadowCache.update();renderer.autoClear=false;renderer.state.buffers.depth.setMask(true);renderer.clearDepth();renderer.render(scene,camera);renderer.autoClear=true;}
  renderer.autoClear=true;
  for(const {el}of Object.values(this.api.tags))if(overview)el.style.display='none';
 }
}
