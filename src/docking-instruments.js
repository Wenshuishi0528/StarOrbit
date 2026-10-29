import {
 DOCKING_RATE,DOCKING_THRUST,DOCKING_LIMITS,DOCKING_MODEL_VERSION,dockingMetrics,dockingQuaternion,dockingEuler,
 dockingCorridorRadius,dockingSpeedLimit,
} from './docking-physics.js';

const DEG=180/Math.PI;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const copy=value=>JSON.parse(JSON.stringify(value));
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function vector(value,size,name){
 if(!Array.isArray(value)||value.length!==size||!value.every(Number.isFinite))throw new TypeError(`Invalid docking ${name}`);
 return value;
}
function validateState(state){
 vector(state?.position,3,'position');vector(state?.velocity,3,'velocity');
 if(!Number.isFinite(state.time)||state.time<0||!Number.isFinite(state.deltaV)||state.deltaV<0)throw new TypeError('Invalid docking time or deltaV');
}
function orientation(state){
 const q=state.quaternion?vector(state.quaternion,4,'quaternion'):dockingQuaternion(vector(state.attitude||[0,0,0],3,'attitude'));
 const norm=Math.hypot(...q);if(norm<1e-12)throw new TypeError('Invalid docking quaternion');
 return q.map(value=>value/norm);
}
export const DOCKING_RECORD_SCHEMA=freeze({
 name:'StarOrbit docking training record',version:1,modelVersion:DOCKING_MODEL_VERSION,
 model:'Circular 400 km reference orbit; ideal rate-controlled attitude; simulated navigation truth',
 frames:{position:'RTN: R radial outward, T along track, N orbit normal',velocity:'Time derivative of RTN position in the rotating reference frame',port:'X=T outward from target port, Y=N right, Z=R up',quaternion:'[x,y,z,w], body to target-port frame',attitude:'Rz(yaw) Ry(pitch) Rx(roll)',angularVelocity:'Body axes, relative to target-port frame'},
 units:{time:'s from scenario start',position:'m',velocity:'m/s',deltaV:'m/s',attitude:'deg',angularVelocity:'rad/s',angularRateDegPerSec:'deg/s',contactAngle:'deg',contactAngularSpeed:'rad/s',command:'Normalized translation and rotation commands in [-1,1]'},
 conventions:{axialClosing:'Positive towards the target port; -vT',losClosing:'Positive when full port-to-port range decreases',right:'Positive chaser displacement along target-port +Y; not the camera target-marker direction',up:'Positive chaser displacement along target-port +Z',idealStoppingDistance:'Axial v²/(2a), ignores HCW coupling and control settling; not a safe stopping guarantee',advisorySpeedStatistics:`A null speedLimit disables flight overspeed statistics. Above-limit duration counts axial closing greater than the suggested limit plus ${DOCKING_LIMITS.speedTolerance} m/s; capture limits remain strict`},
});

/** All signed offsets are in the target-port frame, not the rotated body frame. */
export function deriveDockingInstruments(state,{fine=false}={}){
 validateState(state);
 const m=dockingMetrics(state),q=orientation(state),rates=vector(state.angularVelocity||[0,0,0],3,'angular velocity');
 const axialClosing=-state.velocity[1],brakingAcceleration=DOCKING_THRUST*(fine?.2:1);
 return {
  range:m.distance,axialDistance:state.position[1],axialClosing,losClosing:m.closing,speed:m.speed,
  right:state.position[2],up:state.position[0],rightVelocity:state.velocity[2],upVelocity:state.velocity[0],
  lateralOffset:m.lateral,lateralSpeed:Math.hypot(state.velocity[0],state.velocity[2]),
  attitudeDeg:dockingEuler(q),angularRateDegPerSec:rates.map(value=>value*DEG),
  attitudeErrorDeg:2*Math.acos(clamp(Math.abs(q[3]),0,1))*DEG,angularSpeedDegPerSec:Math.hypot(...rates)*DEG,
  recommendedClosing:dockingSpeedLimit(state.position[1]),
  idealStoppingDistance:Math.max(0,axialClosing)**2/(2*brakingAcceleration),brakingAcceleration,
  corridorRadius:dockingCorridorRadius(state.position[1]),corridorActive:state.position[1]<DOCKING_LIMITS.corridorStart,
  time:state.time,deltaV:state.deltaV,status:state.status,
 };
}

/** Unforced, unconstrained HCW projection: it does not predict capture or future commands. */
export function predictDockingCoast(state,{seconds=60,step=2}={}){
 validateState(state);
 if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(step)||step<=0)throw new RangeError('Invalid docking prediction horizon or interval');
 const count=Math.min(120,Math.ceil(seconds/step)),interval=count===120?seconds/120:step;
 const [x,y,z]=state.position,[u,v,w]=state.velocity,n=DOCKING_RATE;
 return Array.from({length:count+1},(_,index)=>{
  const elapsed=index===count?seconds:index*interval,a=n*elapsed,c=Math.cos(a),s=Math.sin(a);
  return {elapsed,time:state.time+elapsed,position:[
   (4-3*c)*x+s/n*u+2*(1-c)/n*v,
   6*(s-a)*x+y-2*(1-c)/n*u+(4*s-3*a)/n*v,
   c*z+s/n*w,
  ]};
 });
}

// Ring storage keeps a long run bounded without moving the entire array on each sample.
class Ring {
 constructor(capacity){this.capacity=capacity;this.values=new Array(capacity);this.start=0;this.length=0;this.dropped=0;}
 push(value){if(this.length<this.capacity){this.values[(this.start+this.length)%this.capacity]=value;this.length++;}else{this.values[this.start]=value;this.start=(this.start+1)%this.capacity;this.dropped++;}}
 last(){return this.length?this.values[(this.start+this.length-1)%this.capacity]:null;}
 replaceLast(value){this.values[(this.start+this.length-1)%this.capacity]=value;}
 array(){return Array.from({length:this.length},(_,index)=>this.values[(this.start+index)%this.capacity]);}
}

function csvCell(value){
 let text=value===undefined||value===null?'':typeof value==='object'?JSON.stringify(value):String(value);
 // Text from scenario/event metadata must not become a spreadsheet formula. Numeric cells remain numeric.
 if(typeof value!=='number'&&/^[\s\u0000-\u001f]*[=+\-@]/u.test(text))text="'"+text;
 return /[",\r\n]/u.test(text)?'"'+text.replaceAll('"','""')+'"':text;
}
const csvRow=values=>values.map(csvCell).join(',');
const finiteLimit=(value,fallback)=>value===null?null:Number.isFinite(value)&&value>=0?value:fallback;

export class DockingRecorder {
 constructor(scenarioMetadata={}, {maxSamples=7200,sampleInterval=.2,maxEvents=2000}={}){
  if(!Number.isSafeInteger(maxSamples)||maxSamples<1||maxSamples>100000||!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>100000||!Number.isFinite(sampleInterval)||sampleInterval<=0)throw new RangeError('Invalid docking recorder capacity or interval');
  this.maxSamples=maxSamples;this.maxEvents=maxEvents;this.sampleInterval=sampleInterval;this.reset(scenarioMetadata);
 }
 reset(scenarioMetadata={}){
  this.scenario=freeze(copy(scenarioMetadata));this._samples=new Ring(this.maxSamples);this._events=new Ring(this.maxEvents);
  this._finished=false;this._lastObservation=null;this._nextSampleTime=null;this._contactMetrics=null;this._eventCounts=Object.create(null);this._finishReason=null;
  this._stats={status:'ready',startTime:null,endTime:null,deltaV:0,maxClosing:0,maxSpeed:0,maxLateralOffset:0,maxLateralSpeed:0,maxAttitudeErrorDeg:0,maxAngularSpeedDegPerSec:0,minAxialDistance:null,timeAboveSpeedLimit:0};
  return this;
 }
 get samples(){return this._samples.array();}
 get events(){return this._events.array();}
 _observe(state,context,instruments){
  const previous=this._lastObservation,time=state.time,s=this._stats;
  if(previous&&time<previous.time-1e-9)throw new RangeError('Docking recorder time cannot move backwards; reset before a new run');
  if(previous&&previous.exceeding)s.timeAboveSpeedLimit+=Math.max(0,time-previous.time);
  if(s.startTime===null)s.startTime=time;
  s.endTime=time;s.status=state.status;s.deltaV=state.deltaV;
  const limit=finiteLimit(context.speedLimit,instruments.recommendedClosing);
  if(limit===null)s.flightSpeedLimited=false;
  this._lastObservation={time,exceeding:limit!==null&&instruments.axialClosing>limit+DOCKING_LIMITS.speedTolerance};
  // Capture clamps the live velocity to zero. Statistics must include the pre-contact state.
  const observed=state.impactState?deriveDockingInstruments(state.impactState):instruments;
  for(const [key,value]of Object.entries({maxClosing:observed.axialClosing,maxSpeed:observed.speed,maxLateralOffset:observed.lateralOffset,maxLateralSpeed:observed.lateralSpeed,maxAttitudeErrorDeg:observed.attitudeErrorDeg,maxAngularSpeedDegPerSec:observed.angularSpeedDegPerSec}))s[key]=Math.max(s[key],value);
  s.minAxialDistance=s.minAxialDistance===null?observed.axialDistance:Math.min(s.minAxialDistance,observed.axialDistance);
  if(state.contactMetrics)this._contactMetrics=freeze(copy(state.contactMetrics));
 }
 _sample(state,context={},force=false){
  if(this._finished)return false;
  const instruments=deriveDockingInstruments(state,{fine:!!context.command?.fine});
  if(Number.isFinite(context.recommendedClosing))instruments.recommendedClosing=context.recommendedClosing;
  this._observe(state,context,instruments);
  if(!force&&this._nextSampleTime!==null&&state.time+1e-9<this._nextSampleTime)return false;
  const record=freeze({time:state.time,position:[...state.position],velocity:[...state.velocity],quaternion:orientation(state),attitude:[...instruments.attitudeDeg],angularVelocity:[...(state.angularVelocity||[0,0,0])],deltaV:state.deltaV,status:state.status,instruments,context:copy(context)});
  if(this._samples.last()?.time===state.time)this._samples.replaceLast(record);else this._samples.push(record);
  if(this._nextSampleTime===null)this._nextSampleTime=state.time+this.sampleInterval;
  else if(state.time+1e-9>=this._nextSampleTime)this._nextSampleTime+=Math.max(1,Math.floor((state.time+1e-9-this._nextSampleTime)/this.sampleInterval)+1)*this.sampleInterval;
  return true;
 }
 sample(state,context={}){return this._sample(state,context);}
 event(event){
  if(!event||typeof event.type!=='string'||!Number.isFinite(event.time)||event.time<0)throw new TypeError('Invalid docking event');
  const record=freeze(copy({type:event.type,time:event.time,messageKey:event.messageKey??'',detail:event.detail??null}));
  this._eventCounts[event.type]=(this._eventCounts[event.type]||0)+1;
  if(event.type==='finished')this._finishReason=String(event.detail?.reason??event.detail?.status??'ended');
  this._events.push(record);return record;
 }
 finish(state,context={}){if(!this._finished){this._sample(state,context,true);this._finished=true;this._finishReason??=String(context.finishReason??(state.status==='flying'?'ended':state.status));}return this.summary();}
 summary(){
  const s=this._stats;
  return {...s,finished:this._finished,finishReason:this._finishReason,duration:s.startTime===null?0:s.endTime-s.startTime,sampleCount:this._samples.length,eventCount:this._events.length,eventCounts:{...this._eventCounts},droppedSamples:this._samples.dropped,droppedEvents:this._events.dropped,contactMetrics:this._contactMetrics?copy(this._contactMetrics):null,scenario:copy(this.scenario)};
 }
 exportJSON(){
  return JSON.stringify({schema:DOCKING_RECORD_SCHEMA,scenario:this.scenario,sampling:{intervalSeconds:this.sampleInterval,maxSamples:this.maxSamples,maxEvents:this.maxEvents,suggestedSpeedTolerance:DOCKING_LIMITS.speedTolerance,statistics:'Observed every submitted simulation step; above-limit duration uses the previous step value and the suggested-speed tolerance; capture limits remain strict'},summary:this.summary(),samples:this.samples,events:this.events},null,2);
 }
 exportCSV(){
  const rows=[
   ['# format',DOCKING_RECORD_SCHEMA.name,'schema',DOCKING_RECORD_SCHEMA.version,'model',DOCKING_RECORD_SCHEMA.modelVersion],
   ['# model',DOCKING_RECORD_SCHEMA.model],['# scenario',JSON.stringify(this.scenario)],
   ['# frames',JSON.stringify(DOCKING_RECORD_SCHEMA.frames)],['# units',JSON.stringify(DOCKING_RECORD_SCHEMA.units)],
   ['# conventions',JSON.stringify(DOCKING_RECORD_SCHEMA.conventions)],['# summary',JSON.stringify(this.summary())],
   ['time_s','mode','phase','status','R_m','T_m','N_m','vR_m_s','vT_m_s','vN_m_s','axial_closing_m_s','los_closing_m_s','speed_m_s','right_m','up_m','right_velocity_m_s','up_velocity_m_s','roll_deg','pitch_deg','yaw_deg','wx_rad_s','wy_rad_s','wz_rad_s','deltaV_m_s','recommended_closing_m_s','speed_limit_m_s','command_forward','command_right','command_up','command_roll','command_pitch','command_yaw','command_fine','command_brake'],
  ];
  for(const sample of this.samples){const m=sample.instruments,command=sample.context.command||{};rows.push([sample.time,sample.context.mode,sample.context.phase,sample.status,...sample.position,...sample.velocity,m.axialClosing,m.losClosing,m.speed,m.right,m.up,m.rightVelocity,m.upVelocity,...sample.attitude,...sample.angularVelocity,sample.deltaV,m.recommendedClosing,finiteLimit(sample.context.speedLimit,m.recommendedClosing),...(command.translation||[0,0,0]),...(command.rotation||[0,0,0]),!!command.fine,!!command.brake]);}
  rows.push(['# events'],['event_time_s','type','message_key','detail_json']);
  for(const event of this.events)rows.push([event.time,event.type,event.messageKey,event.detail]);
  return '\uFEFF'+rows.map(csvRow).join('\r\n')+'\r\n';
 }
}
