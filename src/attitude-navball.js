import {Matrix4,Quaternion,Vector3} from 'three';
import {createFlightNavball,deriveFreeFlightInstruments} from './free-flight-instruments.js';
import {onLanguageChange,t} from './i18n.js';
import {PILOT_KEY_AXES,pilotAxes,pilotRotation,pilotTranslation} from './pilot-controls.js';

const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
const attribute=(node,name,value)=>{const next=String(value);if(node.getAttribute(name)!==next)node.setAttribute(name,next);};
const hidden=(node,value)=>{if(node.hidden!==value)node.hidden=value;};
const finiteVector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const vector=v=>new Vector3().fromArray(v);
const frame=axes=>new Matrix4().makeBasis(...axes.map(vector));
const keysToAxes=PILOT_KEY_AXES;
const toggles={KeyR:'rcs',KeyT:'sas',CapsLock:'fine'};
const rightModes=new Set(['radial-out','radial-in','normal','anti-normal']);

export const NAVBALL_MODE_SYMBOLS=Object.freeze({
 inertial:{icon:'✥',color:'#bce2ee'},prograde:{icon:'⊙',color:'#c9ed79',kind:'pro'},retrograde:{icon:'⊗',color:'#c9ed79',kind:'retro'},
 'radial-out':{icon:'⊕',color:'#86dceb',kind:'radial-out'},'radial-in':{icon:'⊗',color:'#86dceb',kind:'radial-in'},
 normal:{icon:'△',color:'#bba7f6',kind:'normal'},'anti-normal':{icon:'▽',color:'#bba7f6',kind:'anti-normal'},
 target:{icon:'◇',color:'#eeb4ef',kind:'target'},'anti-target':{icon:'⟐',color:'#eeb4ef',kind:'anti-target'},
});
const COMPACT_KEY='starorbit-navball-compact-v1';

// Incoming directions are inertial, matching the guidance controller. Convert
// to the same fresh orbital frame as the horizon, not the model/task frame.
export function observationNavballMarkers(directions,orbitalBasis){
 const toOrbit=frame(orbitalBasis).transpose();
 return Object.entries(directions||{}).flatMap(([id,direction])=>{
  const symbol=NAVBALL_MODE_SYMBOLS[id];
  if(!symbol?.kind||!finiteVector(direction)||vector(direction).lengthSq()<1e-16)return [];
  return [{id,kind:symbol.kind,color:symbol.color,direction:vector(direction).applyMatrix4(toOrbit).normalize().toArray()}];
 });
}

/** Convert the actual displayed body to a fresh local orbital frame. Snapshot
 * basis belongs to the task's attitude law (ground-track/inertial/etc), so it
 * must not be reused as the orbital horizon or inertial pointing looks level. */
export function deriveObservationNavball(snapshot,bodyQuaternion,{assembly=true}={}){
 if(!snapshot||!finiteVector(snapshot.position)||!finiteVector(snapshot.velocity)||
    !Array.isArray(snapshot.basis)||snapshot.basis.length!==3||!snapshot.basis.every(finiteVector)||
    !Array.isArray(bodyQuaternion)||bodyQuaternion.length!==4||!bodyQuaternion.every(Number.isFinite))return null;
 const radial=vector(snapshot.position),velocity=vector(snapshot.velocity);
 if(radial.lengthSq()<1e-12||velocity.lengthSq()<1e-12||Math.hypot(...bodyQuaternion)<1e-9)return null;
 radial.normalize();
 const along=velocity.clone().addScaledVector(radial,-velocity.dot(radial));
 if(along.lengthSq()<1e-16)return null;
 along.normalize();const normal=radial.clone().cross(along).normalize();
 const orbitalBasis=[along.toArray(),normal.toArray(),radial.toArray()];
 const toOrbit=frame(orbitalBasis).transpose(),taskFrame=frame(snapshot.basis),body=new Quaternion().fromArray(bodyQuaternion).normalize();
 const convert=axis=>vector(axis).applyQuaternion(body).applyMatrix4(taskFrame).applyMatrix4(toOrbit).normalize();
 // Station assets face +X, up +Z. normalizeSpacecraft establishes +Z forward,
 // +Y orbit-normal for standalone assets, with -X the orbital-up reference.
 const forward=convert(assembly?[1,0,0]:[0,0,1]);
 let up=convert(assembly?[0,0,1]:[-1,0,0]);
 const right=forward.clone().cross(up).normalize();up=right.clone().cross(forward).normalize();
 const orientation=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(forward.clone().negate(),right,up)).normalize();
 const ship={position:[0,0,0],velocity:velocity.applyMatrix4(toOrbit).multiplyScalar(1000).toArray(),quaternion:orientation.toArray(),angularVelocity:[0,0,0],deltaV:0};
 const definition={position:[0,0,0],port:[0,0,0],quaternion:ship.quaternion};
 return {ship,nav:deriveFreeFlightInstruments(ship,definition),orbitalBasis};
}

export function installAttitudeNavball(sim){
 const control=document.getElementById('attitudeNavball'),flight=sim.mainFlight;
 const root=document.createElement('section');root.id='attitudeNavballPanel';root.hidden=true;root.tabIndex=0;
 root.setAttribute('aria-labelledby','attitudeNavballTitle');root.setAttribute('aria-describedby','attitudeKeyboardHelp');
 root.setAttribute('aria-keyshortcuts','W S A D Q E H N I J K L R T F CapsLock Escape');
 root.innerHTML=`<div class="an-heading"><h3 id="attitudeNavballTitle"></h3><button type="button" class="an-layout"></button><button type="button" class="an-close">×</button></div>
 <select class="an-craft"></select><div class="an-instrument"><div class="an-modes an-modes-left" role="group"></div><canvas class="an-ball" role="img"></canvas><div class="an-modes an-modes-right" role="group"></div></div>
 <div class="an-sas-state"><strong class="an-mode-name"></strong><span class="an-target-name"></span></div>
 <div class="an-attitude"></div><div class="an-orbit"><span class="an-altitude"></span><strong class="an-speed"></strong></div>
 <p class="an-legend"></p><div class="an-controls">
 <button type="button" data-pilot="rcs">RCS · R</button><button type="button" data-pilot="sas">SAS · T</button><button type="button" data-pilot="fine"></button><button type="button" data-an-center class="an-compact-center">◎</button>
 </div><div class="an-motion"></div><div class="an-actions">
 <button type="button" data-pilot="brake"></button><button type="button" data-pilot="pause"></button>
 <button type="button" data-pilot="center"></button><button type="button" data-pilot="reset"></button></div>
 <p class="an-flight-state"></p><p class="an-note"></p>`;
 sim.api.stage.append(root);
 const find=s=>root.querySelector(s),canvas=find('canvas'),ball=createFlightNavball(canvas);
 const layout=find('.an-layout');
 let compact=false;try{compact=localStorage.getItem(COMPACT_KEY)==='true';}catch{}
 root.dataset.compact=String(compact);
 const title=find('h3'),close=find('.an-close'),craft=find('.an-craft'),attitude=find('.an-attitude'),altitude=find('.an-altitude'),speed=find('.an-speed'),legend=find('.an-legend'),note=find('.an-note');
 const buttons=Object.fromEntries([...root.querySelectorAll('[data-pilot]')].map(el=>[el.dataset.pilot,el]));
 const leftModes=find('.an-modes-left'),rightModeList=find('.an-modes-right'),modeButtons=new Map();
 const keys=new Set(),abort=new AbortController(),events={signal:abort.signal};
 let last=-Infinity,disposed=false,armed=false,inputMission=null,inputTarget=null,targetSignature='',modeSignature='';
 function layoutText(){text(layout,t(compact?'完整版':'紧凑版'));attribute(layout,'title',t(compact?'切换到完整导航球':'切换到紧凑导航球'));attribute(layout,'aria-label',layout.title);attribute(layout,'aria-pressed',compact);}
 function keyboardStatus(){
  attribute(root,'data-keyboard',armed);
  text(note,t(!sim.capabilities.manualAttitude?'随航天器姿态，不随观察视角。':armed?'键盘已接管 · Caps Lock 精调 · Esc 退出':'点击球面接管键盘 · 操作见左侧'));
 }
 function release(){keys.clear();armed=false;flight.clearInput();keyboardStatus();}
 function hide(){release();hidden(root,true);}
 const visible=()=>!root.hidden&&!!root.getClientRects().length&&getComputedStyle(root).visibility!=='hidden';
 const canSteer=()=>!disposed&&!!control?.checked&&!!sim.current&&sim.capabilities.manualAttitude&&!sim.missions?.busy&&!sim.sceneBusy&&
  !sim.freeFlight?.active&&!sim.flightLab?.active&&!document.hidden&&!document.querySelector('dialog[open]')&&visible();
 function command(){
  const axes=pilotAxes(keys);
  const assembly=flight.navigation?.assembly!==false;
  flight.command({rotation:pilotRotation(axes,assembly),translation:pilotTranslation([axes.forward,axes.right,axes.up],assembly),temporarySas:keys.has('KeyF')});
 }
 const fmt=(value,digits=1)=>Number.isFinite(value)?value.toFixed(digits):'—';
 const signed=value=>Number.isFinite(value)?(value>=0?'+':'')+value.toFixed(1):'—';
 function renderModes(state){
  const modes=flight.attitudeModes||[],signature=modes.map(mode=>mode.id).join('|'),enabled=sim.capabilities.manualAttitude&&modes.length>0;
  if(signature!==modeSignature){
   leftModes.replaceChildren();rightModeList.replaceChildren();modeButtons.clear();modeSignature=signature;
   for(const mode of modes){
    const button=document.createElement('button');button.type='button';button.dataset.pilot='attitude:'+mode.id;button.dataset.attitudeMode=mode.id;
    const icon=document.createElement('span'),label=document.createElement('span');icon.className='an-mode-icon';icon.setAttribute('aria-hidden','true');label.className='an-mode-label';button.append(icon,label);
    (rightModes.has(mode.id)?rightModeList:leftModes).append(button);modeButtons.set(mode.id,button);
   }
  }
  const external=state.phase==='external',mode=modes.find(item=>item.id===state.attitudeMode),target=state.attitudeTarget;
  attribute(root,'data-sas-modes',!!enabled);for(const node of [leftModes,rightModeList,find('.an-sas-state')])hidden(node,!enabled);
  leftModes.setAttribute('aria-label',t('SAS 自动指向'));rightModeList.setAttribute('aria-label',t('SAS 自动指向'));
  for(const item of modes){
   const button=modeButtons.get(item.id),towardTarget=item.id==='target'||item.id==='anti-target';
   const symbol=NAVBALL_MODE_SYMBOLS[item.id];
   text(button.querySelector('.an-mode-icon'),symbol?.icon||'·');button.style.setProperty('--an-mode-color',symbol?.color||'#bce2ee');
   text(button.querySelector('.an-mode-label'),t(item.name));button.disabled=!item.available;
   button.setAttribute('aria-pressed',String(state.effectiveSas&&!external&&state.attitudeMode===item.id));
   const reason=item.available?'':t(item.reason||'当前状态无法使用姿态操纵');
   button.title=[t(item.name),towardTarget&&target?t(target.name):'',reason].filter(Boolean).join(' · ');
   button.setAttribute('aria-label',button.title);button.dataset.unavailableReason=reason;
  }
  const turning=state.effectiveSas&&state.attitudeMode!=='inertial'&&Number.isFinite(state.pointingError)&&state.pointingError>.5;
  text(find('.an-mode-name'),t(external?'巡天取景正在控制指向':!state.effectiveSas?'SAS 已关闭':turning?'SAS 转向 · {angle}°':'SAS · {mode}',{mode:t(mode?.name||'惯性保持'),angle:fmt(state.pointingError,1)}));
  text(find('.an-target-name'),target?t('目标：{target}',{target:t(target.name)}):t(modes.find(item=>item.id==='target')?.reason||'当前任务没有可用目标'));
 }
 function update(wall=performance.now(),force=false){
  if(disposed)return;
  const selected=flight.navigation,q=selected?.q,available=!!selected;
  if(control)control.title=t(available?'显示当前航天器相对轨道的真实模型姿态。':'需要有效轨道才能显示姿态导航球。');
  if(!control?.checked||!available||sim.freeFlight?.active||sim.sceneBusy||document.querySelector('dialog[open]')){hide();return;}
  if(armed&&(document.activeElement!==root||inputMission!==sim.missionId||inputTarget!==flight.targetId||!canSteer()))release();
  if(!force&&wall-last<67)return;last=wall;
  const derived=deriveObservationNavball(q,selected.quaternion,{assembly:selected.assembly});
  if(!derived){hide();return;}
  const {ship,nav}=derived,state=flight.state;
  hidden(root,false);
  nav.markers=observationNavballMarkers(selected.attitudeDirections,derived.orbitalBasis);
  // Older/non-pilot integrations still show the two actual orbital directions.
  if(!selected.attitudeDirections)nav.markers=observationNavballMarkers({prograde:q.velocity,retrograde:q.velocity.map(v=>-v),'radial-out':q.position,'radial-in':q.position.map(v=>-v),normal:vector(q.position).cross(vector(q.velocity)).toArray(),'anti-normal':vector(q.position).cross(vector(q.velocity)).negate().toArray()},derived.orbitalBasis);
  ball.draw(ship,nav);
  renderModes(state);
  layoutText();
  text(title,t('姿态导航'));close.setAttribute('aria-label',t('关闭姿态导航'));const options=flight.targets,signature=options.map(o=>o.id+':'+t(o.name)).join('|');
  if(signature!==targetSignature){craft.replaceChildren(...options.map(o=>new Option(t(o.name),o.id)));targetSignature=signature;}craft.value=flight.targetId;craft.setAttribute('aria-label',t('操纵航天器'));flight.syncPoseUI();
  const read=t('航向 {heading} · 俯仰 {pitch} · 滚转 {roll}',{heading:fmt(nav.heading,0)+'°',pitch:signed(nav.pitch)+'°',roll:signed(nav.roll)+'°'});
  text(attitude,read);canvas.setAttribute('aria-label',t('轨道坐标导航球，{attitude}',{attitude:read}));
  text(altitude,t('轨道高度 {altitude} km',{altitude:fmt(q.altitude)}));text(speed,fmt(q.speed,3)+' km/s');
  text(legend,t('黄绿：顺逆行 · 蓝：径向 · 紫：法向 · 粉：目标；虚线为后方'));
  for(const name of ['rcs','sas','fine'])buttons[name].setAttribute('aria-pressed',String(name==='sas'?state.effectiveSas:state[name]));
  buttons.rcs.title=t('RCS：推进器平移及姿态辅助；开启不会自动刹车。');
  buttons.sas.title=t('SAS：有限力矩稳定惯性航向，不消除平移速度。')+' '+t('F 按住临时切换 SAS，松开恢复。');
  text(buttons.fine,t('精调'));buttons.fine.title='Caps Lock';
  text(buttons.brake,t('相对制动'));buttons.brake.disabled=!state.rcs;buttons.brake.setAttribute('aria-pressed',String(state.braking));
  buttons.brake.title=t('需 RCS：缓慢消除相对参考轨道的速度。');
  text(buttons.pause,t(state.paused?'继续操纵':'暂停操纵'));buttons.pause.disabled=!flight.active;
  const quickCenter=find('.an-compact-center');quickCenter.title=t('居中航天器');quickCenter.setAttribute('aria-label',quickCenter.title);
  text(buttons.center,t('居中航天器'));text(buttons.reset,t('恢复观测'));buttons.reset.disabled=!state.active;
  text(find('.an-motion'),t('角速度 {rate}°/s · 相对速度 {speed} m/s · 偏移 {distance} m',{
   rate:fmt(state.angularSpeed,2),speed:fmt(state.speed,2),distance:fmt(state.distance,1)}));
  text(find('.an-flight-state'),t(!state.active?'首次操纵进入近轨演练 · 1×':state.paused?'近轨操纵已暂停':
   state.constrained?'位置避让已限制推进':state.phase==='external'?'巡天取景正在控制指向':!state.effectiveSas?'惯性旋转 · SAS 已关闭':state.phase==='manual'?'手动转向 · SAS 待接管':state.phase==='braking'?'SAS 正在消除转动':state.attitudeMode&&state.attitudeMode!=='inertial'?'SAS 正在跟踪 {mode}':'SAS 保持惯性航向',
   {mode:t(flight.attitudeModes?.find(mode=>mode.id===state.attitudeMode)?.name||'惯性保持')}));
  if(state.effectiveSas&&state.attitudeMode!=='inertial'&&state.phase!=='external'&&!state.paused&&Number.isFinite(state.pointingError)&&state.pointingError>.5)text(find('.an-flight-state'),t('SAS 正在转向 {mode} · 剩余 {angle}°',{mode:t(flight.attitudeModes?.find(mode=>mode.id===state.attitudeMode)?.name||'惯性保持'),angle:fmt(state.pointingError,1)}));
  for(const node of [find('.an-controls'),find('.an-actions'),find('.an-motion'),find('.an-flight-state')])hidden(node,!sim.capabilities.manualAttitude);
  root.tabIndex=sim.capabilities.manualAttitude?0:-1;keyboardStatus();
 }
 function changed(){last=-Infinity;update(performance.now(),true);}
 function arm(){if(canSteer()){armed=true;inputMission=sim.missionId;inputTarget=flight.targetId;keyboardStatus();}}
 function takeControl(){root.focus({preventScroll:true});arm();}
 craft.addEventListener('change',()=>{flight.selectTarget(craft.value);flight.action('center');changed();takeControl();},events);
 root.addEventListener('focus',arm,events);
 root.addEventListener('blur',release,events);
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-pilot],[data-an-center]');
  if(button&&!button.disabled){flight.action(button.hasAttribute('data-an-center')?'center':button.dataset.pilot);changed();takeControl();return;}
  if(!event.target.closest('button,a,input,select,textarea')&&canSteer())takeControl();
 },events);
 root.addEventListener('keydown',event=>{
  if(!armed||document.activeElement!==root||!canSteer()||event.isComposing)return;
  if(event.code==='Escape'){event.preventDefault();event.stopPropagation();release();root.blur();return;}
  if(event.altKey||event.ctrlKey||event.metaKey){release();root.blur();return;}
  const toggle=toggles[event.code];
  if(toggle){event.preventDefault();event.stopPropagation();if(!event.repeat){flight.action(toggle);command();changed();}return;}
  if(!keysToAxes[event.code]&&event.code!=='KeyF')return;
  event.preventDefault();event.stopPropagation();
  if(flight.state.paused)return;
  if(!keys.has(event.code)){keys.add(event.code);command();changed();}
 },events);
 window.addEventListener('keyup',event=>{
  if(keys.delete(event.code)){event.preventDefault();event.stopPropagation();command();}
 },{...events,capture:true});
 document.addEventListener('pointerdown',event=>{
  if(!root.contains(event.target)||event.target.closest('button,a,input,select,textarea')){release();if(document.activeElement===root)root.blur();}
 },{...events,capture:true});
 window.addEventListener('blur',()=>{release();root.blur();},events);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){release();root.blur();}},events);
 window.addEventListener('pagehide',release,events);
 close.addEventListener('click',()=>{if(control){control.checked=false;control.dispatchEvent(new Event('change',{bubbles:true}));}hide();},events);
 layout.addEventListener('click',()=>{
  release();
  const change=()=>{compact=!compact;attribute(root,'data-compact',compact);layoutText();};
  if(sim.floatingWindows?.resizeWindow)sim.floatingWindows.resizeWindow('attitudeNavballPanel',change,{anchor:'right'});else change();
  try{localStorage.setItem(COMPACT_KEY,String(compact));}catch{}
 },events);
 control?.addEventListener('change',changed,events);const removeLanguage=onLanguageChange(changed);
 return {root,update,hide,release,dispose(){release();disposed=true;abort.abort();removeLanguage();root.remove();}};
}
