// Reference probes and an experimental commutator, not a recovered DFH-1 calibration.
// Pure numerical code: inertial orbit/attitude inputs, no camera, DOM or audio device.
const TAU=2*Math.PI,DEG=Math.PI/180,EARTH_RADIUS_KM=6371;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const TELEMETRY_PROFILE=freeze({
 id:'dfh1-reference-probes-v1',source:'model',provisional:true,
 label:'参考探头 · 实验路序',
 provenance:{
  sensors:'Generic reference probes; DFH-1 sensor mounting, calibration and channel identities are not recovered.',
  sequence:'Implementation choice, not the historical DFH-1 channel assignment.',
  sun:'https://hanspeterschaub.info/bskOlderDocs/bsk_2_7_35/_downloads/5a5aa3cb20faf38a4d8da52afc25a9b6/Basilisk-CoarseSunSensor-20170803.pdf',
  earth:'https://ntrs.nasa.gov/citations/19850010706'
 },
 sensorRate:1000,warmupSeconds:.2,earthRadiusKm:EARTH_RADIUS_KM,maxExtrapolationSeconds:.5,
 sun:{source:'model',axis:[1,0,0],halfFovDeg:80,timeConstantSeconds:.01,voltageRange:[0,3],solarDistanceAU:1},
 earth:{source:'model',axis:[-1,0,0],halfFovDeg:4,rayCount:127,timeConstantSeconds:.012,voltageRange:[0,3],radiance:'uniform normalized thermal Earth; independent of sunlight'},
 frequency:{source:'model',provisional:true,zeroVoltageHz:880,hertzPerVolt:440/3,minHz:880,maxHz:1320,centerHz:1100},
 sequence:{source:'model',provisional:true,label:'实验路序',cycleSeconds:10,slots:32,slotSeconds:10/32,referenceVoltages:[3,3,0,1.5,0],sunSlots:[6,18],earthSlots:[19,32]},
 audio:{amplitude:.22,maxRenderSeconds:30}
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=v=>Math.hypot(v[0],v[1],v[2]);
const finite=(x,label)=>{if(!Number.isFinite(x))throw new RangeError(`Invalid telemetry ${label}`);return x;};
function vector(value,label){
 if(!value||value.length!==3||!Array.from(value).every(Number.isFinite))throw new RangeError(`Invalid telemetry ${label}`);
 return Array.from(value);
}
function unit(value,label){const v=vector(value,label),m=norm(v);if(m<1e-12)throw new RangeError(`Invalid telemetry ${label}`);return v.map(x=>x/m);}
const modulo=(x,m)=>((x%m)+m)%m;

// Equal-solid-angle, deterministic cone samples. The denominator is the FULL
// fixed FOV, never just the rays which currently hit Earth. No random jitter.
const earthRays=Array.from({length:TELEMETRY_PROFILE.earth.rayCount},(_,j)=>{
 const c=1-(j+.5)/TELEMETRY_PROFILE.earth.rayCount*(1-Math.cos(TELEMETRY_PROFILE.earth.halfFovDeg*DEG));
 const s=Math.sqrt(1-c*c),az=j*Math.PI*(3-Math.sqrt(5));
 return [-c,s*Math.cos(az),s*Math.sin(az)];
});

function prepare(environment){
 if(!environment||typeof environment!=='object')throw new TypeError('Telemetry environment is required');
 const t=finite(environment.t,'epoch'),position=vector(environment.position,'position'),velocity=vector(environment.velocity??[0,0,0],'velocity');
 if(norm(position)<=EARTH_RADIUS_KM)throw new RangeError('Telemetry position must be outside Earth');
 const sunDir=unit(environment.sunDir,'Sun direction');
 if(!environment.basis||environment.basis.length!==3)throw new RangeError('Invalid telemetry reference basis');
 const basis=environment.basis.map((v,i)=>unit(v,`basis ${i}`));
 if(Math.abs(dot(basis[0],basis[1]))>1e-5||Math.abs(dot(basis[0],basis[2]))>1e-5||Math.abs(dot(basis[1],basis[2]))>1e-5)throw new RangeError('Telemetry reference basis must be orthogonal');
 const handed=basis[0][0]*(basis[1][1]*basis[2][2]-basis[1][2]*basis[2][1])+basis[0][1]*(basis[1][2]*basis[2][0]-basis[1][0]*basis[2][2])+basis[0][2]*(basis[1][0]*basis[2][1]-basis[1][1]*basis[2][0]);
 if(handed<.99999)throw new RangeError('Telemetry reference basis must be right handed');
 const pose=environment.pose??{},angles=['roll','pitch','yaw'].map(k=>finite(pose[k]??0,k)*DEG);
 const rotation=environment.rotation??{};
 if(rotation.enabled!==undefined&&typeof rotation.enabled!=='boolean')throw new TypeError('Invalid telemetry spin switch');
 return {t,position,velocity,sunDir,basis,angles,illumination:clamp(finite(environment.illumination??1,'illumination'),0,1),
  rotation:{enabled:rotation.enabled??false,phase:finite(rotation.phase??0,'spin phase'),epoch:finite(rotation.epoch??t,'spin epoch')},rpm:finite(environment.rpm??120,'spin rate')};
}

function rotateX(v,a){const c=Math.cos(a),s=Math.sin(a);return [v[0],c*v[1]-s*v[2],s*v[1]+c*v[2]];}
function rotateY(v,a){const c=Math.cos(a),s=Math.sin(a);return [c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]];}
function rotateZ(v,a){const c=Math.cos(a),s=Math.sin(a);return [c*v[0]-s*v[1],s*v[0]+c*v[1],v[2]];}
function spinAt(e,time){return modulo(e.rotation.phase+(e.rotation.enabled?modulo((time-e.rotation.epoch)/60000*e.rpm,1)*TAU:0),TAU);}
function inBody(v,e,spin){
 // inverse of basis * Rz(yaw) Ry(pitch) Rx(roll) Rz(spin), matching applyBodyPose.
 let q=e.basis.map(axis=>dot(axis,v));
 q=rotateZ(q,-e.angles[2]);q=rotateY(q,-e.angles[1]);q=rotateX(q,-e.angles[0]);
 return rotateZ(q,-spin);
}
function sensors(e,timeMs){
 const ageSeconds=(timeMs-e.t)/1000,dt=clamp(ageSeconds,-TELEMETRY_PROFILE.maxExtrapolationSeconds,TELEMETRY_PROFILE.maxExtrapolationSeconds);
 const position=e.position.map((x,i)=>x+e.velocity[i]*dt),distance=norm(position);
 if(distance<=EARTH_RADIUS_KM)throw new RangeError('Extrapolated telemetry position must be outside Earth');
 const spin=spinAt(e,timeMs),sunBody=inBody(e.sunDir,e,spin),earthBody=inBody(position.map(x=>-x/distance),e,spin);
 const sunCos=dot(TELEMETRY_PROFILE.sun.axis,sunBody);
 const sun=sunCos>=Math.cos(TELEMETRY_PROFILE.sun.halfFovDeg*DEG)?Math.max(0,sunCos)*e.illumination:0;
 const earthAngularRadius=Math.asin(EARTH_RADIUS_KM/distance),edge=Math.cos(earthAngularRadius);
 let hits=0;for(const ray of earthRays)if(dot(ray,earthBody)>=edge)hits++;
 const earth=hits/earthRays.length;
 return {sun,earth,sunVoltage:sun*3,earthVoltage:earth*3,sunIncidenceDeg:Math.acos(clamp(sunCos,-1,1))/DEG,
  earthAngleDeg:Math.acos(clamp(dot(TELEMETRY_PROFILE.earth.axis,earthBody),-1,1))/DEG,earthAngularRadiusDeg:earthAngularRadius/DEG,
  spinAngle:spin,extrapolationSeconds:dt,extrapolationLimited:Math.abs(ageSeconds)>TELEMETRY_PROFILE.maxExtrapolationSeconds};
}

/** Instantaneous optical/reference-electrical values, before temporal response. */
export function sampleSensors(environment,timeMs=environment?.t){return sensors(prepare(environment),finite(timeMs,'sample time'));}

/** A state belongs to one continuous audio stream. Never share it between players. */
export function createTelemetryState(){return {phase:0,nextTimeMs:null,low:null,high:null,renderedSamples:0};}

const sensorStepMs=1000/TELEMETRY_PROFILE.sensorRate;
const sunDecay=Math.exp(-1/(TELEMETRY_PROFILE.sensorRate*TELEMETRY_PROFILE.sun.timeConstantSeconds));
const earthDecay=Math.exp(-1/(TELEMETRY_PROFILE.sensorRate*TELEMETRY_PROFILE.earth.timeConstantSeconds));
function advanceSensor(previous,e,time){
 const raw=sensors(e,time);
 const sun=previous.sun*sunDecay+raw.sun*(1-sunDecay),earth=previous.earth*earthDecay+raw.earth*(1-earthDecay);
 return {...raw,time,sun,earth,sunVoltage:sun*3,earthVoltage:earth*3};
}
function initializeSensors(state,e,time){
 const grid=Math.floor(time/sensorStepMs)*sensorStepMs,warmup=Math.round(TELEMETRY_PROFILE.warmupSeconds*TELEMETRY_PROFILE.sensorRate);
 let frame={...sensors(e,grid-warmup*sensorStepMs),time:grid-warmup*sensorStepMs};
 for(let j=1;j<=warmup;j++)frame=advanceSensor(frame,e,grid-(warmup-j)*sensorStepMs);
 state.low=frame;state.high=advanceSensor(frame,e,grid+sensorStepMs);
}
function advanceSensorWindow(state,e,time){
 while(time>=state.high.time){state.low=state.high;state.high=advanceSensor(state.low,e,state.high.time+sensorStepMs);}
}

/** Generate a phase-continuous, unreceived reference telemetry waveform.
 * Audio samples are uniformly spaced in simulation seconds. The caller handles
 * timeline seeks and receiver gain/visibility; time jumps re-warm probes only.
 */
export function renderTelemetry(state,environment,{sampleRate,startTimeMs,length,channel='sequence',cycleEpochMs=0}={}){
 if(!state||!Number.isFinite(state.phase))throw new TypeError('Use createTelemetryState() for telemetry state');
 finite(sampleRate,'sample rate');finite(startTimeMs,'start time');finite(cycleEpochMs,'cycle epoch');
 if(sampleRate<8000||sampleRate>192000)throw new RangeError('Telemetry sample rate must be 8000–192000 Hz');
 if(!Number.isInteger(length)||length<0||length>sampleRate*TELEMETRY_PROFILE.audio.maxRenderSeconds)throw new RangeError('Invalid telemetry buffer length');
 if(!['sequence','sun','earth'].includes(channel))throw new RangeError('Unknown telemetry channel');
 const e=prepare(environment),pcm=new Float32Array(length),step=1000/sampleRate;
 if(!length)return {pcm,readings:null,endTimeMs:startTimeMs,profileId:TELEMETRY_PROFILE.id};
 if(!state.low||!state.high||state.nextTimeMs===null||Math.abs(startTimeMs-state.nextTimeMs)>.002)initializeSensors(state,e,startTimeMs);
 let readings;
 const sequence=TELEMETRY_PROFILE.sequence,cycleMs=sequence.cycleSeconds*1000,slotMs=sequence.slotSeconds*1000;
 const isSequence=channel==='sequence',frequencyStep=TAU/sampleRate;
 let phase=modulo(state.phase,TAU);
 for(let i=0;i<length;i++){
  const time=startTimeMs+i*step;
  advanceSensorWindow(state,e,time);
  const blend=clamp((time-state.low.time)/sensorStepMs,0,1);
  const sun=state.low.sun+(state.high.sun-state.low.sun)*blend,earth=state.low.earth+(state.high.earth-state.low.earth)*blend;
  const index=isSequence?Math.floor(modulo(time-cycleEpochMs,cycleMs)/slotMs):-1;
  const selectedChannel=isSequence?(index<5?'reference':index<18?'sun':'earth'):channel;
  const voltage=selectedChannel==='reference'?sequence.referenceVoltages[index]:3*(selectedChannel==='sun'?sun:earth);
  const frequency=TELEMETRY_PROFILE.frequency.zeroVoltageHz+TELEMETRY_PROFILE.frequency.hertzPerVolt*voltage;
  pcm[i]=TELEMETRY_PROFILE.audio.amplitude*Math.sin(phase);
  phase+=frequencyStep*frequency;if(phase>=TAU)phase-=TAU;
  // Allocate output metadata once per buffer; the audio-rate loop is numerical.
  if(i===length-1)readings={...state.low,time,sun,earth,sunVoltage:3*sun,earthVoltage:3*earth,
   channel:selectedChannel,currentSlot:isSequence?index+1:null,voltage,selectedVoltage:voltage,frequency,frequencyHz:frequency,
   source:'model',provisional:true,sequenceLabel:sequence.label};
 }
 state.phase=phase;
 state.nextTimeMs=startTimeMs+length*step;state.renderedSamples+=length;
 return {pcm,readings,endTimeMs:state.nextTimeMs,profileId:TELEMETRY_PROFILE.id};
}
