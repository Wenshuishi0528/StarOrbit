import * as THREE from 'three';
import {createOrbitControls} from './camera-controls.js';
import {t,onLanguageChange} from './i18n.js';
import {DOCKING_THRUST,DOCKING_LIMITS,dockingQuaternion,dockingCorridorRadius,hcwToScene} from './docking-physics.js';
import {DockingTraining,DOCKING_SCENARIOS,DOCKING_GATE_RULES} from './docking-training.js';
import {DockingRecorder,deriveDockingInstruments,predictDockingCoast} from './docking-instruments.js';
import {createDockingModels,createDockingCamera} from './docking-models.js';
import {dockingCSS,dockingMarkup,alignmentSVG,trendSVG,reportHTML,escapeHTML,signed} from './docking-workbench.js';
import {installDockingDisplay} from './docking-display.js';

const labels={f:'前进 W',b:'后退 S',l:'左移 A',r:'右移 D',u:'上移 R',d:'下移 F',rollL:'左滚转 Q',rollR:'右滚转 E',pitchU:'抬头 ↑',pitchD:'低头 ↓',yawL:'左偏航 ←',yawR:'右偏航 →',brake:'按住相对制动 Space'};
const keys={KeyW:'f',KeyS:'b',KeyA:'l',KeyD:'r',KeyR:'u',KeyF:'d',KeyQ:'rollL',KeyE:'rollR',ArrowUp:'pitchU',ArrowDown:'pitchD',ArrowLeft:'yawL',ArrowRight:'yawR',Space:'brake'};
const statusNames={docked:'对接捕获成功',collision:'接触条件不满足 · 训练停止',corridor:'偏离安全接近走廊 · 训练停止',lost:'超出 2 km 训练范围'};
const endStatus=state=>state.status==='collision'&&state.contactMetrics?.captureChecks?.speed===false?'接口撞击超速 · 对接失败':statusNames[state.status]||'训练已结束';
const modeHelp={manual:'人工控制：推力与姿态由你操作；停靠点只给出提醒。',hold:'位置保持：用有限推力制动并保持当前参考位置，仍在计时与消耗 Δv。',approach:'辅助接近：自动修正姿态与横向偏差，在停靠点等待你的 GO。',retreat:'主动撤离：先抑制横向漂移，再沿接口外侧退到保持点。'};
const modeNames={manual:'人工控制',hold:'保持位置',approach:'辅助接近',retreat:'主动撤离'};

/** UI owns pause/cameras/replay; training owns every physical command and fixed step. */
export function mountDockingPanel(container,sim,{templates,meta}){
 const style=document.createElement('style');style.textContent=dockingCSS;container.append(style);
 const panel=document.createElement('div');panel.className='dock-panel';panel.innerHTML=dockingMarkup;container.append(panel);
 const $=selector=>panel.querySelector(selector),get=role=>$(`[data-role="${role}"]`),viewport=$('.dock-viewport');
 for(const scenario of DOCKING_SCENARIOS){const option=document.createElement('option');option.value=scenario.id;option.dataset.dockText=scenario.nameKey;get('scenario').append(option);}
 get('scenario').value='alignment';
 for(const [group,names] of [['translation',['f','b','l','r','u','d','brake']],['rotation',['pitchU','pitchD','yawL','yawR','rollL','rollR']]])for(const name of names){
  const button=document.createElement('button');button.type='button';button.dataset.control=name;button.dataset.dockText=labels[name];if(name==='brake')button.className='dock-brake';$(`[data-controls="${group}"]`).append(button);
 }
 for(const name of ['trend','events','review']){
  const tab=$(`[data-analysis="${name}"]`),body=$(`[data-analysis-panel="${name}"]`);
  tab.id='docking-analysis-'+name;body.id=tab.id+'-panel';tab.setAttribute('aria-controls',body.id);body.setAttribute('aria-labelledby',tab.id);
 }
 let renderer;
 try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});}
 catch(error){const failure=document.createElement('p');failure.textContent=t('对接训练需要可用的 WebGL，请关闭其他三维页面后重试。');viewport.append(failure);return {pause(){},dispose(){panel.remove();style.remove();},error};}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 renderer.domElement.tabIndex=0;viewport.prepend(renderer.domElement);
 const scene=new THREE.Scene(),external=new THREE.PerspectiveCamera(40,1,.02,6000),onboard=createDockingCamera();external.up.set(0,0,1);
 const controls=createOrbitControls(external,renderer.domElement);controls.enableDamping=true;controls.minDistance=2;controls.maxDistance=2200;
 const sun=new THREE.DirectionalLight(0xfff2d9,3);sun.position.set(100,-60,80);scene.add(new THREE.HemisphereLight(0xd7ecff,0x344859,2.2),sun);
 const {station,chaser}=createDockingModels(templates,meta);scene.add(station,chaser);chaser.add(onboard);
 const ownedGeometry=[],ownedMaterials=[];
 const keepGeometry=g=>(ownedGeometry.push(g),g),keepMaterial=m=>(ownedMaterials.push(m),m);
 const targetRing=new THREE.Mesh(keepGeometry(new THREE.TorusGeometry(.55,.025,8,48)),keepMaterial(new THREE.MeshBasicMaterial({color:0xffd17b})));
 targetRing.rotation.y=Math.PI/2;targetRing.position.x=.08;scene.add(targetRing);
 const corridorGuides=new THREE.Group();scene.add(corridorGuides);
 const corridorMaterial=keepMaterial(new THREE.LineBasicMaterial({color:0x5597aa,transparent:true,opacity:.25}));
 const gateMaterial=keepMaterial(new THREE.LineDashedMaterial({color:0xb5d5bc,transparent:true,opacity:.45,dashSize:.3,gapSize:.2}));
 // The drawn envelope and the contact model share the same radius and 30 m extent.
 for(const axial of [0,5,10,20,DOCKING_LIMITS.corridorStart]){
  const radius=dockingCorridorRadius(axial),points=[];
  for(let i=0;i<=64;i++){const angle=i/64*Math.PI*2;points.push(new THREE.Vector3(axial,Math.cos(angle)*radius,Math.sin(angle)*radius));}
  const line=new THREE.Line(keepGeometry(new THREE.BufferGeometry().setFromPoints(points)),axial===5||axial===30?gateMaterial:corridorMaterial);line.computeLineDistances();corridorGuides.add(line);
 }
 for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const points=[0,5,10,20,30].map(axial=>new THREE.Vector3(axial,Math.cos(angle)*dockingCorridorRadius(axial),Math.sin(angle)*dockingCorridorRadius(axial)));
  corridorGuides.add(new THREE.Line(keepGeometry(new THREE.BufferGeometry().setFromPoints(points)),corridorMaterial));
 }
 function trajectoryLine(maxPoints,material){
  const geometry=keepGeometry(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(maxPoints*3),3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
  const line=new THREE.Line(geometry,keepMaterial(material));line.frustumCulled=false;scene.add(line);return line;
 }
 const flown=trajectoryLine(7200,new THREE.LineBasicMaterial({color:0x5fbed1,transparent:true,opacity:.55}));
 const predicted=trajectoryLine(121,new THREE.LineDashedMaterial({color:0xffc472,transparent:true,opacity:.8,dashSize:.35,gapSize:.25}));
 function writeLine(line,positions){const buffer=line.geometry.attributes.position;positions.forEach((position,i)=>buffer.setXYZ(i,...hcwToScene(position)));buffer.needsUpdate=true;line.geometry.setDrawRange(0,positions.length);if(line===predicted)line.computeLineDistances();}

 const recorder=new DockingRecorder({id:'alignment',...DOCKING_SCENARIOS.find(s=>s.id==='alignment'),limits:DOCKING_LIMITS});
 const training=new DockingTraining('alignment',{
  onStep(state,context){recorder.sample(state,context);if(state.status!=='flying')recorder.finish(state,context);},
  onEvent(event){if(event.type==='reset')recorder.reset({...event.detail.definition,limits:DOCKING_LIMITS,flightSpeedLimited:false});recorder.event(event);},
 });
 const held=new Set(),keyboard=new Set(),pointerControls=new Map();
 let paused=true,view='external',analysis='trend',disposed=false,frameId=0,previousWall=null,lastRead=0,lastChart=0,lastTrajectory=0,lastTrajectoryTime=-1,lastStatus='',lastWidth=0,lastHeight=0;
 let replay=false,replayPlaying=false,replayTime=0,replayIndex=0,replaySamples=[],cachedSamples=recorder.samples,manualPreferences=null,lastReadKey='',lastAnalysisKey='';
 const displayState=()=>replay?replaySamples[replayIndex]||training.state:training.state;
 const assistanceActive=()=>replay?(displayState().context?.assistanceEnabled??displayState().rules?.assistanceEnabled??true):training.assistanceEnabled;
 const clearInput=()=>{held.clear();keyboard.clear();pointerControls.clear();panel.querySelectorAll('.held').forEach(x=>x.classList.remove('held'));};
 const isVisible=()=>!document.hidden&&container.isConnected&&!!container.getClientRects().length&&getComputedStyle(container).visibility!=='hidden';
 function pause(){
  if(!paused&&!training.finished)recorder.event({type:'pause',time:training.state.time,messageKey:'训练已暂停'});
  paused=true;replayPlaying=false;previousWall=null;clearInput();updateReadouts();
 }
 function finishRecord(){if(training.finished)recorder.finish(training.state,{mode:training.mode,phase:'finished',assistanceEnabled:training.assistanceEnabled,contactSpeed:training.contactSpeed,speedLimit:null,recommendedClosing:0,finishReason:training.finishReason});}
 function syncPose(){const state=displayState();chaser.position.fromArray(hcwToScene(state.position));chaser.quaternion.fromArray(state.quaternion||dockingQuaternion(state.attitude));chaser.updateMatrixWorld(true);}
 function fit(){
  syncPose();const sphere=new THREE.Box3().setFromObject(station).expandByObject(chaser).getBoundingSphere(new THREE.Sphere());
  const aspect=viewport.clientWidth/Math.max(1,viewport.clientHeight),vertical=THREE.MathUtils.degToRad(external.fov/2),halfFov=Math.min(vertical,Math.atan(Math.tan(vertical)*Math.max(.1,aspect)));
  const distance=Math.max(35,sphere.radius/Math.sin(halfFov)*1.08);controls.stopMotion();controls.target.copy(sphere.center);external.position.copy(sphere.center).add(new THREE.Vector3(.55,-.85,.45).normalize().multiplyScalar(distance));controls.update();
 }
 function setCamera(mode){view=mode==='onboard'?'onboard':'external';controls.stopMotion();controls.enabled=view==='external';for(const button of panel.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view));$('.dock-crosshair').hidden=view!=='onboard';updateReadouts();}
 function selectAnalysis(name){
  analysis=name;for(const button of panel.querySelectorAll('[data-analysis]')){const selected=button.dataset.analysis===name;button.setAttribute('aria-selected',String(selected));button.setAttribute('aria-pressed',String(selected));button.tabIndex=selected?0:-1;}
  for(const body of panel.querySelectorAll('[data-analysis-panel]'))body.hidden=body.dataset.analysisPanel!==name;
  $('.dock-analysis-body').scrollTop=0;updateAnalysis();
  if(name==='review'&&$('.dock-analysis').parentElement===$('.dock-console'))$('.dock-analysis').scrollIntoView({block:'nearest'});
 }
 function updateAnalysis(force=true){
  const signature=[training.state.time,recorder.summary().eventCount,analysis,replay,replayIndex,replayPlaying,training.finished].join('|');
  if(!force&&signature===lastAnalysisKey)return;lastAnalysisKey=signature;
  cachedSamples=recorder.samples;
  if(analysis==='trend')get('trend').innerHTML=trendSVG(cachedSamples,displayState().time);
  if(analysis==='events'){
   const events=recorder.events.slice(-120).reverse();
   get('events').innerHTML=events.map(event=>`<li><time>${event.time.toFixed(1)} s</time><span>${escapeHTML(t(event.messageKey,event.detail||{}))}</span></li>`).join('')||`<li>${escapeHTML(t('开始训练后将在这里记录操作与阶段变化。'))}</li>`;
  }
  if(analysis==='review')get('report').innerHTML=reportHTML(recorder.summary(),training.guidance().violations);
  get('replay').textContent=t(replay?'退出回放':'进入回放');get('replay').disabled=!cachedSamples.length;
  get('replay-play').hidden=!replay;get('replay-play').textContent=t(replayPlaying?'暂停回放':'播放回放');get('scrubber').hidden=!replay;
  if(replay){get('replay-time').max=Math.max(0,replaySamples.length-1);get('replay-time').value=replayIndex;get('replay-value').textContent=displayState().time.toFixed(1)+' s';}
 }
 function updateReadouts(force=true){
  const state=displayState(),signature=[state.time,state.status,training.mode,training.finished,paused,replay,replayPlaying,training.assistanceEnabled,training.contactSpeed].join('|');
  if(!force&&signature===lastReadKey)return;lastReadKey=signature;
  if(replay){get('fine').checked=!!state.context?.command?.fine;get('damping').checked=state.context?.command?.angularDamping!==false;}
  const assisted=assistanceActive();
  get('rotation-label').textContent=t(assisted?'姿态角速率 · 按住控制':'转动力矩 · 按住施加');
  get('assistance').checked=assisted;get('assistance').disabled=replay||training.finished;
  get('contact-speed').disabled=replay||training.finished;
  if(document.activeElement!==get('contact-speed'))get('contact-speed').value=replay?(state.context?.contactSpeed??state.rules?.contactSpeed??DOCKING_LIMITS.captureSpeed):training.contactSpeed;
  get('prediction').disabled=!assisted;get('marker').disabled=!assisted;
  const effectiveFine=replay?!!state.context?.command?.fine:training.mode==='manual'&&get('fine').checked;
  const m=deriveDockingInstruments(state,{fine:effectiveFine}),g=training.guidance(),shownMode=replay?state.context?.mode||'manual':training.mode;
  for(const [key,value] of Object.entries({distance:m.axialDistance.toFixed(2),closing:signed(m.axialClosing,3),right:signed(m.right)+' m',up:signed(m.up)+' m','right-velocity':signed(m.rightVelocity,3)+' m/s','up-velocity':signed(m.upVelocity,3)+' m/s',angle:m.attitudeErrorDeg.toFixed(2)+'° / '+m.angularSpeedDegPerSec.toFixed(2)+'°/s',lateral:m.lateralOffset.toFixed(2)+' m / '+m.lateralSpeed.toFixed(3)+' m/s',deltaV:m.deltaV.toFixed(3)+' m/s',time:m.time.toFixed(1)+' s'}))$(`[data-read="${key}"]`).textContent=value;
  const advisoryLimit=replay?(state.context?.speedLimit===null?null:state.context?.speedLimit??m.recommendedClosing):g.speedLimit;
  get('closing-box').dataset.alert=String(advisoryLimit!==null&&m.axialClosing>advisoryLimit+DOCKING_LIMITS.speedTolerance);get('alignment').innerHTML=alignmentSVG(m);
  get('start').textContent=t(paused?'开始 / 继续':'暂停训练');get('start').disabled=training.finished||replay;get('finish').disabled=training.finished||replay;
  for(const button of panel.querySelectorAll('[data-mode]')){button.setAttribute('aria-pressed',String(button.dataset.mode===shownMode));button.disabled=training.finished||replay||!assisted&&button.dataset.mode!=='manual';button.hidden=!assisted&&button.dataset.mode!=='manual';}
  for(const button of panel.querySelectorAll('[data-control]'))button.disabled=paused||training.finished||replay;
  get('fine').disabled=replay||training.mode!=='manual'||training.finished;get('damping').disabled=get('fine').disabled||!assisted;
  $('[data-control=brake]').hidden=!assisted;
  const status=replay?'正在回放 · 实时训练已暂停':training.finished?endStatus(training.state):paused?'训练已暂停':'训练进行中';
  if(status!==lastStatus){$('.dock-terminal').textContent=t(status);lastStatus=status;}
  $('.dock-terminal').dataset.status=state.status;
  get('mode-help').textContent=replay?t('回放只读取记录；退出后回到暂停的实时训练。'):!assisted?t('纯手动：按住施加推力或转动力矩，松开后保留惯性。'):t(modeHelp[training.mode]);
  get('phase').textContent=replay?t('记录回放')+' · '+t(modeNames[state.context?.mode]||'人工控制'):!assisted?t('纯手动飞行'):t(g.phaseKey)+' · '+t(modeNames[training.mode]);
  get('guidance').textContent=replay?t('当前显示记录时刻 {time} s',{time:state.time.toFixed(1)}):g.finished?t('打开回放与报告，查看接触条件、操作事件和速度变化。'):!assisted?t('接口接触速度 ≤ {speed} m/s；飞行不限速',{speed:training.contactSpeed.toFixed(3)}):g.gate&&!['hold','retreat'].includes(g.mode)?
   t('下一停靠点 {distance} m · 稳定 {stable}/{required} s · 飞行不限速',{distance:g.gate.distance,stable:g.gate.stableSeconds.toFixed(1),required:g.gate.requiredSeconds}):
   t('目标距离 {distance} m · 飞行不限速',{distance:g.targetDistance.toFixed(1)});
  get('go').hidden=!assisted;
  get('go').disabled=!g.canRelease||replay;get('go').textContent=t(g.canRelease?'检查就绪 · GO 放行':'确认放行 GO');
  const rule=DOCKING_GATE_RULES.find(rule=>rule.distance===g.gate?.distance);
  get('gatechecks').hidden=replay||!rule||training.finished||['hold','retreat'].includes(g.mode)&&g.gate?.status==='approaching';
  if(rule)get('gatechecks').innerHTML=[
   ['停靠位置偏差',Math.abs(m.axialDistance-rule.distance),rule.positionTolerance,'m'],
   ['相对速度',m.speed,rule.speed,'m/s'],['横向偏差',m.lateralOffset,rule.lateral,'m'],
   ['姿态误差',m.attitudeErrorDeg,rule.angle,'°'],['合成角速率',m.angularSpeedDegPerSec,rule.angularSpeed*180/Math.PI,'°/s'],
  ].map(([key,value,limit,unit])=>`<span data-pass="${value<=limit}">${value<=limit?'✓':'○'} ${escapeHTML(t(key))} ≤ ${limit.toFixed(unit==='m/s'?3:unit==='m'?2:1)} ${unit}</span>`).join('');
  get('warnings').hidden=replay||!g.warnings.length;get('warnings').textContent=g.warnings.map(w=>t(w.key,w.params)).join(' · ');
  $('.dock-view-caption').textContent=t(view==='onboard'?'舰载相机 · 固连机体':'外部视角 · 拖动旋转，滚轮缩放');
  $('.dock-hud-numbers').textContent=`${m.axialDistance.toFixed(2)} m\n${signed(m.axialClosing,3)} m/s`;
  $('.dock-pause-caption').textContent=(replay?t('记录回放'):training.finished?t(endStatus(state)):paused?t('已暂停 · 按开始继续'):t('点击画面使用键盘 · 手动输入立即接管'))+'\n'+(assisted&&get('prediction').checked&&state.status==='flying'?t('金色虚线：无推力预测 · HCW · 60 秒'):t('蓝色细线：已飞轨迹'));
  get('attitude').textContent=t('滚转 {roll}° · 俯仰 {pitch}° · 偏航 {yaw}°',{roll:m.attitudeDeg[0].toFixed(1),pitch:m.attitudeDeg[1].toFixed(1),yaw:m.attitudeDeg[2].toFixed(1)});
  get('thrust').textContent=t('单轴加速度上限 {value} m/s²',{value:(DOCKING_THRUST*(effectiveFine?.2:1)).toFixed(3)})+' · '+t('推力松开后仍有惯性');
 }
 function reset(scenario=get('scenario').value){
  pause();restoreManualPreferences();replay=false;replayPlaying=false;replaySamples=[];
  const selected=DOCKING_SCENARIOS.find(s=>s.id===scenario);training.reset(scenario);
  if(selected)get('scenario').value=selected.id;
  get('brief').textContent=t(selected?.descriptionKey||'从指定距离开始进行近距离对接训练。');
  lastTrajectoryTime=-1;cachedSamples=recorder.samples;syncPose();fit();lastStatus='';selectAnalysis('trend');updateReadouts();
 }
 const input=()=>{const active=new Set([...held,...keyboard]);return {translation:[Number(active.has('f'))-Number(active.has('b')),Number(active.has('r'))-Number(active.has('l')),Number(active.has('u'))-Number(active.has('d'))],rotation:[Number(active.has('rollL'))-Number(active.has('rollR')),Number(active.has('pitchU'))-Number(active.has('pitchD')),Number(active.has('yawL'))-Number(active.has('yawR'))],fine:get('fine').checked,angularDamping:get('damping').checked,brake:active.has('brake')};};
 function pointerDown(event){
  const button=event.target.closest('[data-control]');if(!button||paused||training.finished||replay)return;
  event.preventDefault();renderer.domElement.focus({preventScroll:true});pointerControls.set(event.pointerId,button.dataset.control);held.add(button.dataset.control);button.classList.add('held');button.setPointerCapture(event.pointerId);
 }
 function pointerUp(event){const name=pointerControls.get(event.pointerId);pointerControls.delete(event.pointerId);if(name&&![...pointerControls.values()].includes(name)){held.delete(name);if(!keyboard.has(name))$(`[data-control="${name}"]`).classList.remove('held');}}
 function keyDown(event){if(!isVisible()||paused||training.finished||replay||document.activeElement!==renderer.domElement)return;const control=keys[event.code];if(!control||control==='brake'&&!training.assistanceEnabled)return;event.preventDefault();keyboard.add(control);$(`[data-control="${control}"]`).classList.add('held');}
 function keyUp(event){const control=keys[event.code];if(!control)return;keyboard.delete(control);if(!held.has(control))$(`[data-control="${control}"]`).classList.remove('held');}
 panel.addEventListener('pointerdown',pointerDown);window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerUp);panel.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);renderer.domElement.addEventListener('blur',clearInput);
 const blur=()=>pause(),visibility=()=>{if(document.hidden)pause();};window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
 get('start').onclick=()=>{
  if(training.finished||replay)return;if(!paused){pause();return;}
  paused=false;previousWall=null;clearInput();recorder.event({type:'resume',time:training.state.time,messageKey:'训练开始或继续'});renderer.domElement.focus({preventScroll:true});updateReadouts();
 };
 get('reset').onclick=()=>reset();get('scenario').onchange=()=>{reset();if(get('scenario').value==='random')setCamera('external');};
 get('finish').onclick=()=>{pause();training.finish('ended');finishRecord();selectAnalysis('review');updateReadouts();};
 for(const button of panel.querySelectorAll('[data-mode]'))button.onclick=()=>{clearInput();training.setMode(button.dataset.mode);updateReadouts();updateAnalysis();};
 get('go').onclick=()=>{if(training.releaseGate()){updateReadouts();updateAnalysis();}};
 get('assistance').onchange=()=>{
  clearInput();training.setAssistance(get('assistance').checked);
  for(const role of ['damping','prediction','marker'])get(role).checked=training.assistanceEnabled;
  lastTrajectoryTime=-1;updateReadouts();updateAnalysis();
 };
 get('contact-speed').onchange=()=>{
  const value=Number(get('contact-speed').value);
  if(!Number.isFinite(value)||value<=0){get('contact-speed').value=training.contactSpeed;return;}
  training.setContactSpeed(value);updateReadouts();updateAnalysis();
 };
 get('fine').onchange=updateReadouts;get('damping').onchange=()=>{recorder.event({type:'damping',time:training.state.time,messageKey:get('damping').checked?'已开启角速率阻尼':'已关闭角速率阻尼'});updateReadouts();};
 get('fit').onclick=()=>{setCamera('external');fit();};for(const button of panel.querySelectorAll('[data-view]'))button.onclick=()=>setCamera(button.dataset.view);
 get('fov').oninput=()=>{onboard.fov=Number(get('fov').value);onboard.updateProjectionMatrix();get('fovValue').textContent=onboard.fov+'°';};
 get('prediction').onchange=()=>{lastTrajectoryTime=-1;updateReadouts();};get('marker').onchange=updateReadouts;
 for(const button of panel.querySelectorAll('[data-analysis]')){
  button.onclick=()=>selectAnalysis(button.dataset.analysis);
  button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const names=['trend','events','review'],i=names.indexOf(analysis),next=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;selectAnalysis(names[next]);$(`[data-analysis="${names[next]}"]`).focus();};
 }
 function restoreManualPreferences(){if(manualPreferences){get('fine').checked=manualPreferences.fine;get('damping').checked=manualPreferences.damping;manualPreferences=null;}}
 function enterReplay(){pause();manualPreferences={fine:get('fine').checked,damping:get('damping').checked};replaySamples=recorder.samples;replay=!!replaySamples.length;replayIndex=Math.max(0,replaySamples.length-1);replayTime=displayState().time;lastTrajectoryTime=-1;updateReadouts();updateAnalysis();}
 get('replay').onclick=()=>{if(replay){restoreManualPreferences();replay=false;replayPlaying=false;lastTrajectoryTime=-1;updateReadouts();updateAnalysis();}else enterReplay();};
 get('replay-time').oninput=()=>{replayPlaying=false;replayIndex=Number(get('replay-time').value);replayTime=displayState().time;lastTrajectoryTime=-1;updateReadouts();updateAnalysis();};
 get('replay-play').onclick=()=>{if(!replay)return;if(replayIndex>=replaySamples.length-1){replayIndex=0;replayTime=displayState().time;}replayPlaying=!replayPlaying;previousWall=null;updateAnalysis();};
 function downloadRecord(format){
  const blob=new Blob([format==='json'?recorder.exportJSON():recorder.exportCSV()],{type:format==='json'?'application/json':'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`StarOrbit-docking-${get('scenario').value}-${new Date().toISOString().replace(/[:.]/g,'-')}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 get('export-json').onclick=()=>downloadRecord('json');get('export-csv').onclick=()=>downloadRecord('csv');
 function resize(){
  // On narrow screens the viewport stays above the scrollable instruments;
  // plots/reports join that scroll area instead of overflowing onto controls.
  const narrow=matchMedia('(max-width:900px)').matches,expanded=panel.classList.contains('dock-expanded'),analysisNode=$('.dock-analysis'),destination=narrow||expanded?$('.dock-console'):$('.dock-stage');
  if(analysisNode.parentElement!==destination)destination.append(analysisNode);
  const checks=get('gatechecks'),checksDestination=narrow||expanded?$('.dock-console'):$('.dock-guidance');
  if(checks.parentElement!==checksDestination){if(narrow||expanded)checksDestination.append(checks);else checksDestination.insertBefore(checks,get('warnings'));}
  const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h||w===lastWidth&&h===lastHeight)return;lastWidth=w;lastHeight=h;renderer.setSize(w,h,false);for(const camera of [external,onboard]){camera.aspect=w/h;camera.updateProjectionMatrix();}
 }
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(viewport);
 const display=installDockingDisplay(container.closest('dialog'),panel,{t,clearInput});
 function updateTrajectories(wall){
  const state=displayState();predicted.visible=assistanceActive()&&get('prediction').checked&&state.status==='flying';
  if(state.time===lastTrajectoryTime||wall-lastTrajectory<500&&lastTrajectoryTime>=0)return;
  lastTrajectory=wall;lastTrajectoryTime=state.time;
  const rows=replay?replaySamples.slice(0,replayIndex+1):recorder.samples;writeLine(flown,rows.map(sample=>sample.position));
  if(predicted.visible)writeLine(predicted,predictDockingCoast(state).map(point=>point.position));
 }
 const projected=new THREE.Vector3();
 function render(){resize();syncPose();if(view==='external')controls.update();const camera=view==='onboard'?onboard:external;
  const assisted=assistanceActive();corridorGuides.visible=assisted;targetRing.visible=assisted;controls.maxDistance=assisted?2200:Infinity;
  const far=Math.max(6000,chaser.position.length()*4+external.position.length()*2);if(camera.far!==far){camera.far=far;camera.updateProjectionMatrix();}
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);renderer.render(scene,camera);
  projected.set(0,0,0).project(camera);const cue=$('.dock-target');cue.hidden=!assistanceActive()||!get('marker').checked||view!=='onboard'||projected.z< -1||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1;
  if(!cue.hidden){cue.style.left=(projected.x+1)*50+'%';cue.style.top=(1-projected.y)*50+'%';}
 }
 function frame(wall){
  if(disposed)return;frameId=requestAnimationFrame(frame);if(!isVisible()){if(!paused||replayPlaying)pause();previousWall=null;return;}
  const dt=previousWall===null?0:Math.min(.1,Math.max(0,(wall-previousWall)/1000));previousWall=wall;
  if(replay&&replayPlaying){replayTime+=dt*Number(get('speed').value);while(replayIndex<replaySamples.length-1&&replaySamples[replayIndex+1].time<=replayTime)replayIndex++;if(replayIndex===replaySamples.length-1)replayPlaying=false;}
  else if(!paused&&!training.finished){training.advance(dt*Number(get('speed').value),input());if(training.finished){finishRecord();pause();selectAnalysis('review');}}
  if(wall-lastRead>100){updateReadouts(false);lastRead=wall;}if(wall-lastChart>200){updateAnalysis(false);lastChart=wall;}
  updateTrajectories(wall);render();
 }
 function translate(){
  display.refresh();
  for(const el of panel.querySelectorAll('[data-dock-text]'))el.textContent=t(el.dataset.dockText);
  renderer.domElement.setAttribute('aria-label',t('交会对接训练画面'));
  get('replay-time').setAttribute('aria-label',t('记录时间'));get('export-json').setAttribute('aria-label',t('导出 JSON 飞行记录'));get('export-csv').setAttribute('aria-label',t('导出 CSV 飞行记录'));
  const selected=DOCKING_SCENARIOS.find(s=>s.id===get('scenario').value);get('brief').textContent=t(selected?.descriptionKey||'从指定距离开始进行近距离对接训练。');lastStatus='';updateReadouts();updateAnalysis();
 }
 const unsubscribe=onLanguageChange(translate);translate();reset('alignment');setCamera('onboard');frameId=requestAnimationFrame(frame);
 return {pause,reset,setCamera,render,deactivate(){pause();display.reset();},get state(){return training.state;},get cameraMode(){return view;},get camera(){return view==='onboard'?onboard:external;},get renderer(){return renderer;},get simulation(){return training;},get recorder(){return recorder;},get paused(){return paused;},get modelRoots(){return {station,chaser};},
  step(seconds,command={}){training.advance(seconds,command);finishRecord();syncPose();updateReadouts();return training.state;},
  dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frameId);pause();display.dispose();resizeObserver.disconnect();unsubscribe();controls.dispose();panel.removeEventListener('pointerdown',pointerDown);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',pointerUp);panel.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('blur',clearInput);for(const g of ownedGeometry)g.dispose();for(const m of ownedMaterials)m.dispose();renderer.dispose();renderer.forceContextLoss();panel.remove();style.remove();},
 };
}
