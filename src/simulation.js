import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import bundledOrbit from '../assets/orbit.json';
import {EARTH_RADIUS,validateOrbit,snapshot,interpolate,sunlightFraction,parseOrbit,nextShadowEvent,earthAxes,sunPosition} from './orbit.js';
import {SolarTracker} from './solar.js';
import {Environment} from './environment.js';
import {OrbitMinimap} from './minimap.js';
const $=id=>document.getElementById(id),V=a=>new THREE.Vector3(...a),basis=axes=>new THREE.Matrix4().makeBasis(...axes.map(V));
const clockText=t=>new Date(t+8*3600000).toISOString().slice(0,19).replace('T',' ');
const inputText=t=>new Date(t+8*3600000).toISOString().slice(0,19);
export class Simulation{
 constructor(api){
  this.api=api;this.data=validateOrbit(bundledOrbit);this.mode='real';this.time=Date.now();this.speed=1;this.paused=false;this.view='follow';this.auto=true;this.dirty=true;this.snap=true;this.lastSolve=0;this.lastRead=0;this.lastEvent=0;this.lastOrbit=0;this.lastWall=performance.now();this.current=null;this.event=null;
  this.sky=new THREE.Scene();this.sky.background=new THREE.Color('#020713');this.spaceCamera=new THREE.PerspectiveCamera(api.camera.fov,1,.1,150000);this.spaceCamera.up.set(0,0,1);this.spaceCamera.position.set(13000,-16000,11000);
  this.orbitControls=new OrbitControls(this.spaceCamera,api.renderer.domElement);this.orbitControls.enableDamping=true;this.orbitControls.enabled=false;this.orbitControls.minDistance=7500;this.orbitControls.maxDistance=60000;
  this.sky.background=null;this.environment=new Environment(this);this.minimap=new OrbitMinimap(this);
  this.marker=new THREE.Mesh(new THREE.SphereGeometry(65,16,10),new THREE.MeshBasicMaterial({color:0x7deaff}));this.sky.add(this.marker);
  this.sunDisc=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),new THREE.MeshBasicMaterial({color:0xfff5ce}));this.sky.add(this.sunDisc);
  this.sunArrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),11500,0xffd27e,700,300);this.sky.add(this.sunArrow);
  this.orbitLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.8}));this.sky.add(this.orbitLine);
  this.localSunArrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(),60,0xffd27e,6,3);api.scene.add(this.localSunArrow);
  this.tracker=new SolarTracker(api);
  this.bind();this.rebuild();this.dataUI();
  if(this.time<this.start||this.time>this.end){this.mode='custom';this.time=(this.start+this.end)/2;this.paused=true;$('dataMessage').textContent='当前时间超出内置数据范围，已显示数据中点。可导入新数据后返回实时。';}
  this.timeUI();
 }
 get start(){return this.data.rows[0][0];}get end(){return this.data.rows.at(-1)[0];}
 dataUI(){const s=clockText(this.start),e=clockText(this.end);$('dataRange').textContent=`${this.data.source||'导入数据'} · ${this.data.rows.length} 条\n${s} — ${e}（UTC+8）\n生成：${this.data.created||'未提供'} · EME2000 / UTC`;$('customTime').min=inputText(this.start);$('customTime').max=inputText(this.end);}
 timeUI(){$('timeMode').value=this.mode;$('speed').value=String(this.speed);$('pauseTime').textContent=this.paused?'▶ 继续时间':'Ⅱ 暂停时间';$('customTime').value=inputText(this.time);$('timeline').value=(this.time-this.start)/(this.end-this.start)*10000;$('speed').disabled=this.mode==='real';}
 bind(){
  $('customTime').oninput=()=>{this.inputDirty=true;};
  $('toggleTelemetry').onclick=()=>{const on=$('telemetry').classList.toggle('expanded');$('toggleTelemetry').setAttribute('aria-expanded',String(on));};
  $('timeMode').onchange=()=>{if($('timeMode').value==='real')this.realTime();else{this.mode='custom';this.timeUI();}};
  $('goNow').onclick=()=>this.realTime();
  $('pauseTime').onclick=()=>{if(this.mode==='real'){this.time=Date.now();this.mode='custom';this.paused=true;}else this.paused=!this.paused;this.timeUI();};
  $('speed').onchange=()=>{this.speed=Number($('speed').value);this.mode='custom';this.paused=false;this.timeUI();};
  $('setTime').onclick=()=>{const t=Date.parse($('customTime').value+'+08:00');if(!Number.isFinite(t)||t<this.start||t>this.end){this.api.toast('请选择轨道数据有效期内的时间');return;}this.seek(t);};
  $('timeline').oninput=()=>this.seek(this.start+Number($('timeline').value)/10000*(this.end-this.start));
  $('stepBack').onclick=()=>this.seek(Math.max(this.start,this.time-60000));$('stepForward').onclick=()=>this.seek(Math.min(this.end,this.time+60000));
  $('nextEvent').onclick=()=>{const e=nextShadowEvent(this.data,this.time);if(e)this.seek(e.time);else this.api.toast('接下来两小时或数据范围内没有昼夜转换');};
  $('viewMode').onchange=()=>this.setView($('viewMode').value);
  $('autoTrack').onchange=()=>{this.auto=$('autoTrack').checked;this.api.stopAnimation();this.dirty=true;this.snap=true;this.controlUI();};
  $('occlusion').onchange=()=>{this.dirty=true;this.snap=true;};
  $('importOrbit').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>30e6)throw Error('文件超过 30 MB');const data=parseOrbit(await f.text());this.data=data;this.dataUI();if(this.time<this.start||this.time>this.end)this.seek((this.start+this.end)/2);this.dirty=true;this.lastOrbit=0;this.lastEvent=0;$('dataMessage').textContent='本次使用导入数据；刷新后恢复内置官方数据。';this.api.toast('轨道数据已载入');}catch(err){this.api.toast('导入失败：'+err.message);}finally{e.target.value='';}};
 }
 realTime(){const now=Date.now();if(now<this.start||now>this.end){$('dataMessage').textContent='当前时刻不在轨道数据有效期内，请更新或导入轨道数据。';this.api.toast('轨道数据已过期或尚未生效；没有外推为实时位置');return;}this.inputDirty=false;this.time=now;this.mode='real';this.paused=false;this.dirty=true;this.snap=true;this.timeUI();}
 seek(t){this.inputDirty=false;this.time=t;this.mode='custom';this.paused=true;this.dirty=true;this.snap=true;this.timeUI();}
 manual(){this.auto=false;$('autoTrack').checked=false;this.controlUI();}
 controlUI(){$('trackingStatus').textContent=this.auto?'全舱自动追日 · 计算姿态':'手动控制 · 角度保持';$('linkLabs').disabled=this.auto||!(this.api.labs().length>1&&['WT','MT'].includes(this.api.types[this.api.state.target]));$('rotationControls').classList.toggle('auto-controls',this.auto);}
 rebuild(){this.tracker.rebuild();this.dirty=true;this.snap=true;const b=new THREE.Box3();Object.values(this.api.groups).forEach(g=>b.union(new THREE.Box3().setFromObject(g)));this.center=b.getCenter(new THREE.Vector3());const size=b.getSize(new THREE.Vector3()).length();const l=this.api.sunLight;l.shadow.camera.left=l.shadow.camera.bottom=-size*.65;l.shadow.camera.right=l.shadow.camera.top=size*.65;l.shadow.camera.near=Math.max(10,1000-size);l.shadow.camera.far=1000+size;l.shadow.camera.updateProjectionMatrix();l.target.position.copy(this.center);this.localSunArrow.position.copy(this.center);this.controlUI();}
 setView(view){if(view===this.view)return;this.view=view;const overview=view==='orbit';this.api.controls.enabled=!overview;this.orbitControls.enabled=overview;if(overview){this.overviewPosition();this.spaceCamera.up.set(0,0,1);this.orbitControls.target.set(0,0,0);this.spaceCamera.near=10;this.spaceCamera.far=150000;this.orbitControls.update();}this.dirty=true;this.api.scene.visible=true;$('viewMode').value=view;this.api.resize();}
 overviewPosition(){const q=this.current;if(q){const r=V(q.position).normalize(),side=r.clone().cross(V(q.sunDir)).normalize();this.spaceCamera.position.copy(r.addScaledVector(side,.6).normalize().multiplyScalar(28000));}else this.spaceCamera.position.set(14000,-17000,10000);}
 fit(){if(this.view!=='orbit')return false;this.overviewPosition();this.orbitControls.target.set(0,0,0);this.orbitControls.update();return true;}
 updateOrbit(q){const points=[],colors=[];for(let t=Math.max(this.start,q.t-2800000);t<=Math.min(this.end,q.t+2800000);t+=20000){const p=interpolate(this.data.rows,t).position;points.push(...p);const lit=sunlightFraction(p,q.sun);colors.push(...(lit>.5?[.18,.72,.9]:[.36,.24,.48]));}this.orbitLine.geometry.dispose();this.orbitLine.geometry=new THREE.BufferGeometry();this.orbitLine.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));this.orbitLine.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));}
 update(wall){
  const elapsed=Math.max(0,(wall-this.lastWall)/1000);this.lastWall=wall;const old=this.time;
  if(this.mode==='real')this.time=Date.now();else if(!this.paused){this.time+=elapsed*this.speed*1000;if(this.time>=this.end){this.time=this.end;this.paused=true;$('dataMessage').textContent='已到达数据终点，时间已暂停。';this.timeUI();}}
  const q=snapshot(this.data,this.time);this.current=q;this.minimap.update(q,wall);
  if(!q){this.api.sunLight.intensity=0;$('simClock').textContent=clockText(this.time);for(const id of ['altitude','velocity','arrayYield','groundPoint'])$(id).textContent='—';this.marker.visible=false;this.api.modelRoot.visible=false;$('simNotice').textContent='轨道数据已失效：请更新数据或选择有效时刻';$('illumination').textContent='数据无效';return;}
  this.api.modelRoot.visible=true;this.earth.quaternion.setFromRotationMatrix(basis(q.earthAxes));this.earth.material.uniforms.sun.value.copy(V(q.sun).normalize());this.marker.position.copy(V(q.position));
  const localSun=V(q.sunLocal);this.api.sunLight.position.copy(this.center).addScaledVector(localSun,1000);this.api.sunLight.intensity=3.4*q.illumination;this.api.fillLight.intensity=$('fillLight').checked?.65:.025;this.localSunArrow.setDirection(localSun);
  const dirty=this.dirty,solve=dirty||wall-this.lastSolve>700;
  // Continue pointing through eclipse; illumination only scales lighting and received flux.
  if(this.auto&&solve){this.tracker.solve(q.sunLocal,$('occlusion').checked);this.lastSolve=wall;}
  if(this.auto)this.tracker.advance((this.time-old)/1000,this.snap,q.sunLocal);
  if(solve){this.tracker.measure(q.sunLocal,q.illumination,$('occlusion').checked);this.api.syncControls();this.controlUI();this.lastSolve=wall;}
  if(dirty||Math.abs(q.t-this.lastOrbit)>60000){this.updateOrbit(q);this.lastOrbit=q.t;}
  if(dirty||(this.event&&q.t>this.event.time)||q.t<this.lastEvent||(!this.event&&q.t-this.lastEvent>300000)){this.event=nextShadowEvent(this.data,q.t);this.lastEvent=q.t;}
  if(dirty||wall-this.lastRead>250){this.readout(q);this.lastRead=wall;}
  this.dirty=false;this.snap=false;
 }
 readout(q){
  $('simClock').textContent=clockText(q.t);$('clockMode').textContent=`UTC+8 · ${this.mode==='real'?'现实时间 1×':this.paused?'自定义 · 已暂停':`自定义 ${this.speed}×`}`;
  $('altitude').textContent=q.altitude.toFixed(1)+' km';$('velocity').textContent=q.speed.toFixed(3)+' km/s';$('groundPoint').textContent=`${Math.abs(q.latitude).toFixed(2)}°${q.latitude>=0?'N':'S'} / ${Math.abs(q.longitude).toFixed(2)}°${q.longitude>=0?'E':'W'}`;
  $('illumination').textContent=q.illumination<.001?'地影 · 无直射':q.illumination>.999?'日照':'半影 '+(q.illumination*100).toFixed(0)+'%';$('illumination').className=q.illumination>.5?'sunlit':'eclipsed';
  $('arrayYield').textContent=(this.tracker.total*100||0).toFixed(1)+'%';const reading=this.tracker.readings[this.api.state.target];$('selectedYield').textContent=reading?`所选实例有效受光：${(reading.effective*100).toFixed(1)}%`:'受光面积计算中';
  $('eventText').textContent=this.event?`${this.event.entering?'进入地影':'离开地影'}约 ${Math.max(0,(this.event.time-q.t)/60000).toFixed(1)} 分钟`:'未来两小时／剩余数据内无昼夜转换';
  $('timeline').value=(q.t-this.start)/(this.end-this.start)*10000;if(!this.inputDirty&&document.activeElement!==$('customTime'))$('customTime').value=inputText(q.t);
  $('simNotice').textContent=(this.view==='orbit'?'轨道总览 · 青点为放大的空间站标记':'空间站跟随 · 地球距离与角尺度按真实比例')+' · 对地定向假设'+($('fillLight').checked?' · 辅助照明开启':'');
 }
 render(){
  const {renderer,camera,scene,stage}=this.api,q=this.current,overview=this.view==='orbit';this.spaceCamera.aspect=camera.aspect;this.spaceCamera.fov=camera.fov;
  if(!overview&&q){const rot=basis(q.basis),pos=camera.position.clone().divideScalar(5000).applyMatrix4(rot).add(V(q.position));this.spaceCamera.position.copy(pos);this.spaceCamera.up.copy(camera.up).transformDirection(rot);this.spaceCamera.lookAt(this.api.controls.target.clone().divideScalar(5000).applyMatrix4(rot).add(V(q.position)));this.spaceCamera.near=10;this.spaceCamera.far=150000;}else if(overview)this.orbitControls.update();
  this.spaceCamera.updateProjectionMatrix();this.marker.visible=overview&&!!q;this.orbitLine.visible=overview&&$('orbitPath').checked;this.sunArrow.visible=overview&&$('sunVector').checked;this.localSunArrow.visible=!overview&&$('sunVector').checked&&!!q;
  if(q){this.sunArrow.setDirection(V(q.sunDir));this.sunDisc.position.copy(this.spaceCamera.position).addScaledVector(V(q.sunDir),60000);this.sunDisc.scale.setScalar(60000*695700/Math.hypot(...q.sun));}
  this.environment.update(q,this.spaceCamera);this.environment.renderBackground(renderer);renderer.render(this.sky,this.spaceCamera);
  if(!overview){renderer.autoClear=false;renderer.clearDepth();renderer.render(scene,camera);renderer.autoClear=true;}
  renderer.autoClear=true;
  for(const {el}of Object.values(this.api.tags))if(overview)el.style.display='none';
 }
}
