import {
 DOCKING_STEP,DOCKING_RATE,DOCKING_THRUST,DOCKING_LIMITS,
 dockingInitial,setDockingAttitude,dockingMetrics,dockingCorridorRadius,
 hcwToScene,rotateDockingVector,stepDocking,
} from './docking-physics.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const norm=vector=>Math.hypot(...vector);
const freezeScenario=scenario=>Object.freeze({...scenario,position:Object.freeze(scenario.position),velocity:Object.freeze(scenario.velocity),attitude:Object.freeze(scenario.attitude)});

// Reproducible exercises and all limits below are teaching rules, not mission procedures.
export const DOCKING_SCENARIOS=Object.freeze([
 freezeScenario({id:'random',nameKey:'随机位置',descriptionKey:'在接口前方 50–500 m 随机生成位置与姿态；重新开始会重新抽取。',initialDistance:200,position:[0,200,0],velocity:[0,0,0],attitude:[0,0,0]}),
 freezeScenario({id:'alignment',nameKey:'末段对准',descriptionKey:'从 12 m 开始，对准接口并完成末段捕获。',initialDistance:12,position:[.15,12,-.2],velocity:[0,-.03,0],attitude:[0,1.5,-1.5]}),
 freezeScenario({id:'approach',nameKey:'标准接近',descriptionKey:'从 200 m 接近，在 30 m 与 5 m 停靠点逐段放行。',initialDistance:200,position:[0,200,0],velocity:[0,0,0],attitude:[0,0,0]}),
 freezeScenario({id:'recovery',nameKey:'偏差恢复',descriptionKey:'从 50 m 开始，修正横向偏差与姿态后接近。',initialDistance:50,position:[1.5,50,-1.2],velocity:[.01,-.08,-.015],attitude:[1.5,3,-2]}),
]);

export const DOCKING_GATE_RULES=Object.freeze([
 Object.freeze({distance:30,positionTolerance:.5,speed:.03,lateral:.5,angle:3,angularSpeed:.2*Math.PI/180,stableSeconds:2}),
 Object.freeze({distance:5,positionTolerance:.2,speed:.015,lateral:.15,angle:2,angularSpeed:.2*Math.PI/180,stableSeconds:2}),
]);

const modeMessages={manual:'手动接管',hold:'已启用位置保持',approach:'已启用辅助接近',retreat:'已启动撤离'};
const phaseMessages={approach:'远端接近',gate:'停靠点检查',final:'末段接近',hold:'位置保持',retreat:'撤离',finished:'训练结束'};
const finishMessages={docked:'对接捕获成功',collision:'接触条件不满足，训练结束',corridor:'越出教学接近走廊，训练结束',lost:'超出教学训练范围，训练结束'};
const neutralCommand=()=>({translation:[0,0,0],rotation:[0,0,0],fine:false,brake:false,angularDamping:true});
const inputComponent=value=>Number.isFinite(Number(value))?clamp(Number(value),-1,1):0;
function manualCommand(input={}){
 return {translation:[0,1,2].map(i=>inputComponent(input.translation?.[i])),rotation:[0,1,2].map(i=>inputComponent(input.rotation?.[i])),fine:!!input.fine,brake:!!input.brake,angularDamping:input.angularDamping!==false};
}
const hasManualCommand=command=>command.brake||command.translation.some(value=>value!==0)||command.rotation.some(value=>value!==0);

function resolveScenario(value,random){
 if(typeof value==='number'){
  const distance=[50,200,500].includes(value)?value:200;
  if(distance===200)return DOCKING_SCENARIOS.find(scenario=>scenario.id==='approach');
  return freezeScenario({id:`distance-${distance}`,nameKey:'标准接近',descriptionKey:'在 30 m 与 5 m 停靠点逐段放行。',initialDistance:distance,position:[0,distance,0],velocity:[0,0,0],attitude:[0,0,0]});
 }
 const scenario=DOCKING_SCENARIOS.find(candidate=>candidate.id===value);
 if(!scenario)throw new RangeError(`Unknown docking scenario: ${String(value)}`);
 if(value==='random'){
  const axial=50+450*random(),radius=axial*.25*Math.sqrt(random()),azimuth=2*Math.PI*random();
  return freezeScenario({...scenario,initialDistance:axial,position:[radius*Math.cos(azimuth),axial,radius*Math.sin(azimuth)],attitude:[0,1,2].map(()=>20*random()-10)});
 }
 return scenario;
}

// A rate command closes attitude error through the same finite angular response as manual input.
function alignmentCommand(state){
 let q=state.quaternion;
 if(q[3]<0)q=q.map(value=>-value);
 const sine=norm(q.slice(0,3)),angle=2*Math.atan2(sine,clamp(q[3],-1,1));
 const rotation=sine>1e-10?q.slice(0,3).map(value=>clamp(-value/sine*angle/2/DOCKING_LIMITS.maxAngularRate,-1,1)):[0,0,0];
 return rotation;
}

export class DockingTraining{
 constructor(scenarioId='approach',{onStep,onEvent,random=Math.random}={}){
  this.onStep=onStep;this.onEvent=onEvent;this.random=random;
  this.reset(scenarioId);
 }

 reset(scenarioIdOrDistance=this._scenarioInput??'approach'){
  const scenario=resolveScenario(scenarioIdOrDistance,this.random);
  this._scenarioInput=scenarioIdOrDistance;this.scenario=scenario;
  this.state=setDockingAttitude({...dockingInitial(scenario.initialDistance),position:[...scenario.position],velocity:[...scenario.velocity]},scenario.attitude);
  this.mode='manual';this.finished=false;this.finishReason=null;this.remainder=0;
  this.violations=[];this._holdPosition=null;this._retreatPosition=null;this._retreatReached=false;
  this._gates=DOCKING_GATE_RULES.filter(gate=>gate.distance<scenario.initialDistance).map(gate=>({...gate}));
  this._gateIndex=0;this._stableSeconds=0;this._gateWasReady=false;
  this._emit('reset','训练场景已就绪',{scenario:scenario.id,distance:scenario.initialDistance,definition:scenario});
  this._sample(neutralCommand(),true);
  return this.state;
 }

 setMode(mode,{reason='pilot'}={}){
  if(!Object.hasOwn(modeMessages,mode))throw new RangeError(`Unknown docking control mode: ${String(mode)}`);
  if(this.finished||this.state.status!=='flying'||this.mode===mode)return false;
  const previousMode=this.mode;this.mode=mode;
  if(mode==='hold')this._holdPosition=[...this.state.position];
  if(mode==='retreat'){
   // An outward hold point keeps retreat bounded and inspectable. No velocity is reset.
   this._retreatPosition=[0,Math.max(this.state.position[1],Math.min(DOCKING_LIMITS.maxRange-100,Math.max(50,this.state.position[1]+50))),0];
   this._retreatReached=false;
  }
  this._emit('mode-change',modeMessages[mode],{mode,previousMode,reason,targetDistance:this._targetPosition()[1]});
  return true;
 }

 releaseGate(){
  if(!this.guidance().canRelease)return false;
  const gate=this._gates[this._gateIndex++];
  this._stableSeconds=0;this._gateWasReady=false;
  // Clearance changes the next destination, not the pilot's chosen control mode.
  this._emit('gate-release','已放行 {distance} m 停靠点',{distance:gate.distance});
  return true;
 }

 finish(reason='ended'){
  if(this.finished)return false;
  this.finished=true;this.finishReason=String(reason);this.remainder=0;
  this._emit('finished',finishMessages[reason]||'训练已结束',{reason:this.finishReason,status:this.state.status});
  return true;
 }

 advance(seconds,manualInput={}){
  if(!Number.isFinite(seconds)||seconds<0||seconds>2)throw new RangeError('Invalid docking elapsed time');
  if(this.finished)return this.state;
  if(this.state.status!=='flying'){this.finish(this.state.status);return this.state;}
  const manual=manualCommand(manualInput);
  if(hasManualCommand(manual))this.setMode('manual',{reason:'manual-input'});
  this.remainder+=seconds;
  while(this.remainder>=DOCKING_STEP-1e-12&&!this.finished){
   // Recompute every physics step, never once per animation frame.
   const command=this.mode==='manual'?manual:this._assistedCommand();
   this.state=stepDocking(this.state,command,DOCKING_STEP);
   this.remainder=Math.max(0,this.remainder-DOCKING_STEP);
   this._updateGate();this._updateRetreat();
   if(this.state.status!=='flying')this.finish(this.state.status);
   this._sample(command);
  }
  return this.state;
 }

 guidance(){
  const metrics=dockingMetrics(this.state),rule=this._gates[this._gateIndex],speedLimit=null;
  const gate=rule?{distance:rule.distance,status:this._gateReady(rule)?'ready':Math.abs(metrics.axial-rule.distance)<=rule.positionTolerance?'stabilizing':'approaching',stableSeconds:this._stableSeconds,requiredSeconds:rule.stableSeconds}:null;
  const canRelease=!this.finished&&this.state.status==='flying'&&!!rule&&this._gateReady(rule);
  let phase='approach';
  if(this.finished)phase='finished';
  else if(this.mode==='hold'||this.mode==='retreat')phase=this.mode;
  else if(rule&&Math.abs(metrics.axial-rule.distance)<=Math.max(2,rule.positionTolerance))phase='gate';
  else if(!rule&&metrics.axial<=5.5)phase='final';
  const warnings=[];
  if(!this.finished){
   if(gate?.status==='ready')warnings.push({key:'正在等待停靠点放行',params:{distance:gate.distance},severity:'info'});
   if(metrics.lateral>this._alignmentLateralLimit())warnings.push({key:'横向偏差较大，先修正对准',params:{lateral:metrics.lateral},severity:'warning'});
   if(metrics.angle>3||norm(this.state.angularVelocity)>DOCKING_LIMITS.captureAngularSpeed)warnings.push({key:'姿态尚未稳定，先完成姿态对准',params:{angle:metrics.angle,angularSpeed:norm(this.state.angularVelocity)},severity:'info'});
  }
  const target=this._targetPosition(),desired=this._desiredVelocity(target);
  return {mode:this.mode,phase,phaseKey:phaseMessages[phase],targetDistance:target[1],recommendedClosing:this.finished||this.mode==='hold'||this.mode==='retreat'?0:Math.max(0,-desired[1]),speedLimit,gate,canRelease,warnings,finished:this.finished,finishReason:this.finishReason,violations:this.violations.length};
 }

 _targetPosition(){
  if(this.mode==='hold'&&this._holdPosition)return this._holdPosition;
  if(this.mode==='retreat'&&this._retreatPosition)return this._retreatPosition;
  return [0,this._gates[this._gateIndex]?.distance??0,0];
 }

 _alignmentLateralLimit(){
  return this.state.position[1]<=5.5?.15:Math.max(.2,Math.min(2,dockingCorridorRadius(this.state.position[1])*.65));
 }

 _desiredVelocity(target){
  const error=target.map((value,i)=>value-this.state.position[i]);
  // No fixed cruise-speed cap. Reserve thrust for HCW compensation and
  // simultaneous axes; the stopping envelope naturally slows near each target.
  const braking=DOCKING_THRUST*.2;
  const desired=error.map((value,i)=>Math.sign(value)*Math.min(Math.abs(value)*(i===1?.12:.25),Math.sqrt(2*braking*Math.abs(value))));
  if(this.mode==='approach'&&desired[1]<0){
   const metrics=dockingMetrics(this.state);
   if(metrics.lateral>this._alignmentLateralLimit()||metrics.angle>3||norm(this.state.angularVelocity)>DOCKING_LIMITS.captureAngularSpeed)desired[1]=0;
  }
  return desired;
 }

 _assistedCommand(){
  const desired=this._desiredVelocity(this._targetPosition()),p=this.state.position,v=this.state.velocity,n=DOCKING_RATE;
  const natural=[3*n*n*p[0]+2*n*v[1],-2*n*v[0],-n*n*p[2]];
  let acceleration=desired.map((value,i)=>(value-v[i])*.7-natural[i]);
  const magnitude=norm(acceleration),budget=DOCKING_THRUST*.9;
  if(magnitude>budget)acceleration=acceleration.map(value=>value*budget/magnitude);
  const q=this.state.quaternion,body=rotateDockingVector(hcwToScene(acceleration),[-q[0],-q[1],-q[2],q[3]]);
  return {translation:[-body[0],body[1],body[2]].map(value=>clamp(value/DOCKING_THRUST,-1,1)),rotation:alignmentCommand(this.state),fine:false,brake:false,angularDamping:true};
 }

 _gateConditions(rule){
  const metrics=dockingMetrics(this.state);
  return Math.abs(metrics.axial-rule.distance)<=rule.positionTolerance&&metrics.speed<=rule.speed&&metrics.lateral<=rule.lateral&&metrics.angle<=rule.angle&&norm(this.state.angularVelocity)<=rule.angularSpeed;
 }

 _gateReady(rule){return this._stableSeconds>=rule.stableSeconds-1e-9&&this._gateConditions(rule);}

 _updateGate(){
  let rule=this._gates[this._gateIndex];
  while(rule&&this.state.position[1]<rule.distance-rule.positionTolerance){
   const violation={distance:rule.distance,axial:this.state.position[1],mode:this.mode,time:this.state.time};
   this.violations.push(violation);
   this._emit('gate-violation','未放行越过 {distance} m 停靠点',violation);
   this._gateIndex++;this._stableSeconds=0;this._gateWasReady=false;
   if(this.mode==='approach')this.setMode('hold',{reason:'gate-violation'});
   rule=this._gates[this._gateIndex];
  }
  if(!rule||this.state.status!=='flying')return;
  this._stableSeconds=this._gateConditions(rule)?Math.min(rule.stableSeconds,this._stableSeconds+DOCKING_STEP):0;
  const ready=this._gateReady(rule);
  if(ready&&!this._gateWasReady)this._emit('gate-ready','{distance} m 停靠点已稳定，可以放行',{distance:rule.distance,requiredSeconds:rule.stableSeconds});
  this._gateWasReady=ready;
 }

 _updateRetreat(){
  if(this.mode!=='retreat'||this._retreatReached||this.state.status!=='flying')return;
  const error=this.state.position.map((value,i)=>value-this._retreatPosition[i]);
  if(norm(error)<.5&&norm(this.state.velocity)<.02){
   this._retreatReached=true;
   this._emit('retreat-hold','已到达撤离保持点',{distance:this._retreatPosition[1]});
  }
 }

 _emit(type,messageKey,detail={}){this.onEvent?.({type,time:this.state.time,messageKey,detail});}

 _sample(command,initial=false){
  if(!this.onStep)return;
  const {phase,gate,speedLimit,recommendedClosing,warnings}=this.guidance();
  this.onStep(this.state,{mode:this.mode,phase,command,scenario:this.scenario.id,gate,speedLimit,recommendedClosing,warnings,initial});
 }
}
