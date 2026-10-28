import * as THREE from 'three';
import {createOrbitControls} from './camera-controls.js';
import {t,onLanguageChange} from './i18n.js';
import {DOCKING_THRUST,DockingSimulation,dockingMetrics,dockingQuaternion,hcwToScene} from './docking-physics.js';
import {createDockingModels,createDockingCamera} from './docking-models.js';

const labels={f:'前进 W',b:'后退 S',l:'左移 A',r:'右移 D',u:'上移 R',d:'下移 F',rollL:'左滚转 Q',rollR:'右滚转 E',pitchU:'抬头 ↑',pitchD:'低头 ↓',yawL:'左偏航 ←',yawR:'右偏航 →',brake:'按住相对制动 Space'};
const keys={KeyW:'f',KeyS:'b',KeyA:'l',KeyD:'r',KeyR:'u',KeyF:'d',KeyQ:'rollL',KeyE:'rollR',ArrowUp:'pitchU',ArrowDown:'pitchD',ArrowLeft:'yawL',ArrowRight:'yawR',Space:'brake'};
const statusNames={flying:'正在接近',docked:'对接捕获成功',collision:'接触条件不满足 · 训练停止',corridor:'偏离安全接近走廊 · 训练停止',lost:'超出 2 km 训练范围'};
const css=`.dock-panel{color:#dce8f6;display:grid;gap:12px}.dock-panel button,.dock-panel select{font-size:12px}.dock-controls-top{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.dock-controls-top label{display:flex;gap:6px;align-items:center}.dock-viewport{height:clamp(290px,45vh,560px);position:relative;background:radial-gradient(ellipse at 50% 105%,#0c2038,#02060c 65%);border:1px solid #2b4259;border-radius:12px;overflow:hidden}.dock-viewport canvas{width:100%;height:100%;display:block;outline:none;touch-action:none}.dock-viewport canvas:focus-visible{outline:2px solid #69d9ec;outline-offset:-3px}.dock-hud{position:absolute;inset:0;pointer-events:none;font:12px ui-monospace,monospace;color:#8fe6ee}.dock-crosshair{position:absolute;left:50%;top:50%;width:70px;height:70px;transform:translate(-50%,-50%);border:1px solid #8fe6ee60;border-radius:50%}.dock-crosshair:before,.dock-crosshair:after{content:'';position:absolute;background:#8fe6ee80}.dock-crosshair:before{height:1px;width:100px;left:-15px;top:34px}.dock-crosshair:after{width:1px;height:100px;left:34px;top:-15px}.dock-target{position:absolute;width:18px;height:18px;border:2px solid #ffd17b;border-radius:3px;transform:translate(-50%,-50%)}.dock-view-caption{position:absolute;top:12px;left:14px;max-width:75%;background:#020a13a0;padding:5px 8px;border-radius:4px}.dock-pause-caption{position:absolute;bottom:12px;left:14px;color:#b6cadb}.dock-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}.dock-metrics>div{padding:9px 10px;background:#102032;border:1px solid #263e53;border-radius:7px}.dock-metrics small{font-size:11px;display:block;color:#91a8be;margin-bottom:5px}.dock-metrics b{font:15px ui-monospace,monospace;font-weight:500;white-space:nowrap}.dock-bottom{display:grid;grid-template-columns:1fr 1fr;gap:12px}.dock-control-box{padding:12px;border:1px solid #263e53;border-radius:8px;background:#0b1724}.dock-control-box h3{font-size:13px;margin:0 0 10px;color:#b8cfdf}.dock-thrusters{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.dock-thrusters button{touch-action:none;user-select:none;min-height:36px}.dock-thrusters button.held{background:#286774;border-color:#a1ecf5}.dock-brake{grid-column:1/-1}.dock-info{font-size:12px;line-height:1.65;color:#96aec3;margin:0}.dock-terminal{padding:10px 12px;border-radius:8px;border:1px solid #3a5b73;background:#112a3b;font-size:13px}.dock-terminal[data-status=docked]{border-color:#66caa2;color:#a8f4ce}.dock-terminal[data-status=collision],.dock-terminal[data-status=corridor]{border-color:#c88d67;color:#ffd5b4}.dock-attitude{font:12px ui-monospace,monospace;color:#91a8be;margin-top:8px}.dock-panel input[type=range]{width:90px;margin:0}.dock-panel [hidden]{display:none!important}@media(max-width:700px){.dock-metrics{grid-template-columns:repeat(3,1fr)}.dock-bottom{grid-template-columns:1fr}.dock-viewport{height:330px}.dock-controls-top{gap:6px}.dock-controls-top label{font-size:12px}}`;

export function mountDockingPanel(container,sim,{templates,meta}){
 const style=document.createElement('style');style.textContent=css;container.append(style);
 const panel=document.createElement('div');panel.className='dock-panel';panel.innerHTML=`
 <p class="dock-info" data-dock-text="近距离交会对接训练 · 400 km 圆轨道的简化相对运动模型，非真实任务飞控。主任务轨道与空间站组合不受影响。"></p>
 <div class="dock-controls-top">
  <label><span data-dock-text="起始距离"></span><select data-role="distance"><option value="50">50 m</option><option value="200" selected>200 m</option><option value="500">500 m</option></select></label>
  <button type="button" data-role="start"></button><button type="button" data-role="reset" data-dock-text="重新开始"></button>
  <label><span data-dock-text="训练速度"></span><select data-role="speed"><option value="1">1×</option><option value="5">5×</option></select></label>
  <label><input type="checkbox" data-role="fine"><span data-dock-text="精细推力"></span></label>
 </div>
 <div class="dock-controls-top">
  <button type="button" data-view="external" data-dock-text="外部视角"></button><button type="button" data-view="onboard" data-dock-text="对接相机"></button>
  <label><span data-dock-text="相机视场"></span><input data-role="fov" type="range" min="12" max="75" value="40"><output data-role="fovValue">40°</output></label>
  <button type="button" data-role="fit" data-dock-text="查看全貌"></button>
 </div>
 <div class="dock-viewport"><div class="dock-hud"><div class="dock-view-caption"></div><div class="dock-crosshair" hidden></div><div class="dock-target" hidden></div><div class="dock-pause-caption"></div></div></div>
 <div class="dock-metrics">
  <div><small data-dock-text="接口距离"></small><b data-read="distance"></b></div><div><small data-dock-text="闭合速度"></small><b data-read="closing"></b></div><div><small data-dock-text="横向偏差"></small><b data-read="lateral"></b></div>
  <div><small data-dock-text="姿态误差"></small><b data-read="angle"></b></div><div><small data-dock-text="累计速度增量"></small><b data-read="deltaV"></b></div><div><small data-dock-text="训练时间"></small><b data-read="time"></b></div>
 </div>
 <div class="dock-terminal" role="status" aria-live="polite"></div>
 <div class="dock-bottom"><div class="dock-control-box"><h3 data-dock-text="平移推力 · 按住控制"></h3><div class="dock-thrusters" data-controls="translation"></div><div class="dock-attitude" data-role="thrust"></div></div>
 <div class="dock-control-box"><h3 data-dock-text="姿态控制 · 松开保持"></h3><div class="dock-thrusters" data-controls="rotation"></div><div class="dock-attitude" data-role="attitude"></div></div></div>
 <p class="dock-info" data-dock-text="先点击画面再用键盘。松开平移推力后仍会漂移；接近时先制动，再用精细推力。相机固定在飞船上，金色框是目标接口，青色十字是镜头中心。"></p>
 <p class="dock-info" data-dock-text="捕获条件：接口距离小于 0.5 m、横向偏差小于 0.3 m、相对速度小于 0.15 m/s、姿态误差小于 3°。越出近端接近走廊或高速接触会结束训练。"></p>`;
 container.append(panel);
 const $=selector=>panel.querySelector(selector),get=role=>$(`[data-role="${role}"]`),viewport=$('.dock-viewport');
 for(const [group,names] of [['translation',['f','b','l','r','u','d','brake']],['rotation',['pitchU','pitchD','yawL','yawR','rollL','rollR']]])for(const name of names){
  const button=document.createElement('button');button.type='button';button.dataset.control=name;button.dataset.dockText=labels[name];if(name==='brake')button.className='dock-brake';$(`[data-controls="${group}"]`).append(button);
 }
 let renderer;
 try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});}
 catch(error){const failure=document.createElement('p');failure.textContent=t('对接训练需要可用的 WebGL，请关闭其他三维页面后重试。');viewport.append(failure);return {pause(){},dispose(){panel.remove();style.remove();},error};}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label',t('交会对接训练画面'));viewport.prepend(renderer.domElement);
 const scene=new THREE.Scene(),external=new THREE.PerspectiveCamera(40,1,.02,6000),onboard=createDockingCamera();
 external.up.set(0,0,1);onboard.up.set(0,0,1);
 const controls=createOrbitControls(external,renderer.domElement);controls.enableDamping=true;controls.minDistance=2;controls.maxDistance=2200;
 const ambient=new THREE.HemisphereLight(0xd7ecff,0x344859,2.2),sun=new THREE.DirectionalLight(0xfff2d9,3);sun.position.set(100,-60,80);scene.add(ambient,sun);
 const ownedGeometry=[],ownedMaterials=[],lineMaterial=new THREE.LineBasicMaterial({color:0x49788c,transparent:true,opacity:.3});ownedMaterials.push(lineMaterial);
 const {station,chaser}=createDockingModels(templates,meta);scene.add(station,chaser);
 chaser.add(onboard);
 const ringGeometry=new THREE.TorusGeometry(.55,.025,8,48),ringMaterial=new THREE.MeshBasicMaterial({color:0xffd17b});ownedGeometry.push(ringGeometry);ownedMaterials.push(ringMaterial);
 const targetRing=new THREE.Mesh(ringGeometry,ringMaterial);targetRing.rotation.y=Math.PI/2;targetRing.position.x=.08;scene.add(targetRing);
 // World-space approach gates provide depth cues without a fake target-tracking camera.
 const gates=new THREE.Group();scene.add(gates);
 for(const x of [5,10,20,50,100,200,500]){const radius=Math.max(.5,x*.12),points=[];for(let i=0;i<=48;i++){const a=i/48*Math.PI*2;points.push(new THREE.Vector3(x,Math.cos(a)*radius,Math.sin(a)*radius));}const g=new THREE.BufferGeometry().setFromPoints(points);ownedGeometry.push(g);gates.add(new THREE.Line(g,lineMaterial));}
 const modelSimulation=new DockingSimulation(200),held=new Set(),keyboard=new Set(),pointerControls=new Map();
 let paused=true,view='external',disposed=false,frameId=0,previousWall=null,lastRead=0,lastStatus='',lastWidth=0,lastHeight=0;
 const clearInput=()=>{held.clear();keyboard.clear();pointerControls.clear();panel.querySelectorAll('.held').forEach(x=>x.classList.remove('held'));};
 const isVisible=()=>!document.hidden&&container.isConnected&&!!container.getClientRects().length&&getComputedStyle(container).visibility!=='hidden';
 const pause=()=>{paused=true;previousWall=null;clearInput();updateReadouts();};
 function fit(){const p=new THREE.Vector3(...hcwToScene(modelSimulation.state.position)),distance=Math.max(35,p.length());controls.stopMotion();controls.target.copy(p).multiplyScalar(.42);external.position.copy(controls.target).add(new THREE.Vector3(distance*.55,-distance*.85,distance*.45));controls.update();}
 function syncPose(){chaser.position.fromArray(hcwToScene(modelSimulation.state.position));chaser.quaternion.fromArray(dockingQuaternion(modelSimulation.state.attitude));chaser.updateMatrixWorld(true);}
 function setCamera(mode){view=mode==='onboard'?'onboard':'external';controls.stopMotion();controls.enabled=view==='external';$('[data-view="external"]').classList.toggle('active',view==='external');$('[data-view="onboard"]').classList.toggle('active',view==='onboard');$('.dock-crosshair').hidden=view!=='onboard';updateReadouts();}
 function updateReadouts(){
  const state=modelSimulation.state,m=dockingMetrics(state);
  for(const [key,value] of Object.entries({distance:m.distance.toFixed(2)+' m',closing:m.closing.toFixed(3)+' m/s',lateral:m.lateral.toFixed(2)+' m',angle:m.angle.toFixed(2)+'°',deltaV:state.deltaV.toFixed(3)+' m/s',time:state.time.toFixed(1)+' s'}))$(`[data-read="${key}"]`).textContent=value;
  get('start').textContent=t(paused?'开始 / 继续':'暂停训练');get('start').disabled=state.status!=='flying';
  const status=state.status==='flying'?(paused?'训练已暂停':statusNames.flying):statusNames[state.status];
  if(status!==lastStatus){$('.dock-terminal').textContent=t(status);lastStatus=status;}
  $('.dock-terminal').dataset.status=state.status;
  $('.dock-view-caption').textContent=t(view==='onboard'?'舰载相机 · 固连机体':'外部视角 · 拖动旋转，滚轮缩放');
  $('.dock-pause-caption').textContent=state.status!=='flying'?t(statusNames[state.status])+' · '+t('重新开始'):paused?t('已暂停 · 按开始继续'):t('推力松开后仍有惯性');
  get('attitude').textContent=t('滚转 {roll}° · 俯仰 {pitch}° · 偏航 {yaw}°',{roll:state.attitude[0].toFixed(1),pitch:state.attitude[1].toFixed(1),yaw:state.attitude[2].toFixed(1)});
  get('thrust').textContent=t('平移加速度 {value} m/s²',{value:(DOCKING_THRUST*(get('fine').checked?.2:1)).toFixed(3)});
 }
 function reset(distance=Number(get('distance').value)){pause();modelSimulation.reset(distance);get('distance').value=String(distance);syncPose();fit();lastStatus='';updateReadouts();}
 const input=()=>{const active=new Set([...held,...keyboard]);return {translation:[Number(active.has('f'))-Number(active.has('b')),Number(active.has('r'))-Number(active.has('l')),Number(active.has('u'))-Number(active.has('d'))],rotation:[Number(active.has('rollL'))-Number(active.has('rollR')),Number(active.has('pitchU'))-Number(active.has('pitchD')),Number(active.has('yawL'))-Number(active.has('yawR'))],fine:get('fine').checked,brake:active.has('brake')};};
 function pointerDown(event){const button=event.target.closest('[data-control]');if(!button||paused||modelSimulation.state.status!=='flying')return;event.preventDefault();renderer.domElement.focus({preventScroll:true});pointerControls.set(event.pointerId,button.dataset.control);held.add(button.dataset.control);button.classList.add('held');try{button.setPointerCapture(event.pointerId);}catch{}}
 function pointerUp(event){const name=pointerControls.get(event.pointerId);pointerControls.delete(event.pointerId);if(name&&![...pointerControls.values()].includes(name)){held.delete(name);$(`[data-control="${name}"]`).classList.remove('held');}}
 function keyDown(event){if(!isVisible()||paused||event.target.matches('input,select,textarea')||document.activeElement!==renderer.domElement)return;const control=keys[event.code];if(!control)return;event.preventDefault();keyboard.add(control);$(`[data-control="${control}"]`).classList.add('held');}
 function keyUp(event){const control=keys[event.code];if(!control)return;keyboard.delete(control);if(!held.has(control))$(`[data-control="${control}"]`).classList.remove('held');}
 panel.addEventListener('pointerdown',pointerDown);window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerUp);panel.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);
 const blur=()=>pause(),visibility=()=>{if(document.hidden)pause();};window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
 renderer.domElement.addEventListener('blur',clearInput);
 get('start').onclick=()=>{if(modelSimulation.state.status!=='flying')return;paused=!paused;previousWall=null;clearInput();renderer.domElement.focus({preventScroll:true});updateReadouts();};get('reset').onclick=()=>reset();get('distance').onchange=()=>reset();get('fine').onchange=updateReadouts;
 get('fit').onclick=()=>{setCamera('external');fit();};for(const button of panel.querySelectorAll('[data-view]'))button.onclick=()=>setCamera(button.dataset.view);
 get('fov').oninput=()=>{onboard.fov=Number(get('fov').value);onboard.updateProjectionMatrix();get('fovValue').textContent=onboard.fov+'°';};
 function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;if(w===lastWidth&&h===lastHeight)return;lastWidth=w;lastHeight=h;renderer.setSize(w,h,false);for(const camera of [external,onboard]){camera.aspect=w/h;camera.updateProjectionMatrix();}}
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(viewport);
 function render(){resize();syncPose();if(view==='external')controls.update();const camera=view==='onboard'?onboard:external;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);renderer.render(scene,camera);const p=new THREE.Vector3(0,0,0).project(camera),cue=$('.dock-target');cue.hidden=view!=='onboard'||p.z< -1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;if(!cue.hidden){cue.style.left=(p.x+1)*50+'%';cue.style.top=(1-p.y)*50+'%';}}
 function frame(wall){if(disposed)return;frameId=requestAnimationFrame(frame);if(!isVisible()){if(!paused)pause();previousWall=null;return;}const dt=previousWall===null?0:Math.min(.1,Math.max(0,(wall-previousWall)/1000));previousWall=wall;if(!paused){modelSimulation.advance(dt*Number(get('speed').value),input());if(modelSimulation.state.status!=='flying')pause();}if(wall-lastRead>80){updateReadouts();lastRead=wall;}render();}
 const translate=()=>{for(const el of panel.querySelectorAll('[data-dock-text]'))el.textContent=t(el.dataset.dockText);renderer.domElement.setAttribute('aria-label',t('交会对接训练画面'));lastStatus='';updateReadouts();};
 const unsubscribe=onLanguageChange(translate);translate();reset();setCamera('external');frameId=requestAnimationFrame(frame);
 return {pause,reset,setCamera,render,get state(){return modelSimulation.state;},get cameraMode(){return view;},get camera(){return view==='onboard'?onboard:external;},get renderer(){return renderer;},get simulation(){return modelSimulation;},get paused(){return paused;},get modelRoots(){return {station,chaser};},step(seconds,command={}){modelSimulation.advance(seconds,command);syncPose();updateReadouts();return modelSimulation.state;},dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frameId);pause();resizeObserver.disconnect();unsubscribe();controls.dispose();panel.removeEventListener('pointerdown',pointerDown);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',pointerUp);panel.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('blur',clearInput);for(const g of ownedGeometry)g.dispose();for(const m of ownedMaterials)m.dispose();renderer.dispose();renderer.forceContextLoss();panel.remove();style.remove();}};
}
