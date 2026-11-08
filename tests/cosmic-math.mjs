import assert from 'node:assert/strict';
import {
  COSMIC_DEFAULTS, normalizeCosmicParams, cosmicPhase, cosmicMetrics,
  magneticAxis, observerDirection, pulseIntensity, pulseProfile, meteorState, supernovaStage,
} from '../src/cosmic-math.js';
const almost=(a,b,tolerance=1e-12)=>assert(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
assert.deepEqual(normalizeCosmicParams(),COSMIC_DEFAULTS);
assert.deepEqual(normalizeCosmicParams(null),COSMIC_DEFAULTS);
assert.deepEqual(normalizeCosmicParams({period:'0.2',nsMass:Infinity,bhMass:NaN}),COSMIC_DEFAULTS);
const limited=normalizeCosmicParams({bhMass:200,nsMass:-1,nsRadius:20,period:0,tilt:90,inclination:-4,meteorSpeed:100,meteorAngle:1});
assert.deepEqual(limited,{bhMass:100,bhInclination:55,nsMass:1,nsRadius:14,period:.05,tilt:85,inclination:10,meteorSpeed:72,meteorAngle:10});
for (const phase of [-1,NaN,Infinity])assert.equal(cosmicPhase(phase),0);
assert.equal(cosmicPhase(2),1);
const standard=cosmicMetrics('blackhole',{},.5);
assert(standard.schwarzschildKm>29.53&&standard.schwarzschildKm<29.54,'10 solar masses has about29.53km Schwarzschild radius');
assert(standard.compactness>.344&&standard.compactness<.345);
assert(standard.neutronDensity>3.84e17&&standard.neutronDensity<3.85e17);
assert(standard.surfaceGravity>1.29e12&&standard.surfaceGravity<1.30e12);
almost(cosmicMetrics('blackhole',{bhMass:20}).schwarzschildKm,standard.schwarzschildKm*2,1e-10);
for(const mass of [1,2.2])for(const radius of [10,14]){
 const metric=cosmicMetrics('neutron',{nsMass:mass,nsRadius:radius});
 assert(metric.compactness>0&&metric.compactness<1,'surface stays outside illustrative Schwarzschild radius');
 assert(Number.isFinite(metric.neutronDensity)&&Number.isFinite(metric.surfaceGravity));
}
for(const tilt of [5,35,85])for(const inclination of [10,55,85])for(const phase of [0,.1,.25,.5,.9,1]){
 const a=magneticAxis(phase,tilt),b=observerDirection(inclination);
 almost(Math.hypot(...a),1);almost(Math.hypot(...b),1);
 const analytic=Math.cos(tilt*Math.PI/180)*Math.cos(inclination*Math.PI/180)+Math.sin(tilt*Math.PI/180)*Math.sin(inclination*Math.PI/180)*Math.cos(phase*Math.PI*2);
 almost(a.reduce((sum,v,i)=>sum+v*b[i],0),analytic);
 const signal=pulseIntensity(phase,tilt,inclination);assert(signal>=0&&signal<=1);
}
almost(pulseIntensity(0,35,35),1);almost(pulseIntensity(1,35,35),1);
assert(pulseIntensity(.5,35,35)<.001);
assert(pulseIntensity(.5,85,85)>.6,'opposite magnetic pole can produce a second pulse');
assert(Math.max(...pulseProfile({tilt:5,inclination:85}))<1e-8,'off-beam observer does not see invented pulses');
assert.equal(pulseProfile({},0).length,2);assert.equal(pulseProfile({},10000).length,1024);
const profile=pulseProfile({period:.05});assert.deepEqual(profile,pulseProfile({period:2}),'period changes seconds, not phase geometry');
for(const angle of [10,45,80])for(const speed of [11,35,72]){
 const begin=meteorState(0,{meteorAngle:angle,meteorSpeed:speed}),end=meteorState(1,{meteorAngle:angle,meteorSpeed:speed});
 almost(begin.altitudeKm,120);almost(end.altitudeKm,40);
 almost(end.pathKm*Math.sin(angle*Math.PI/180),80,1e-10);
 almost(end.durationSeconds*speed,end.pathKm,1e-10);
 almost(begin.brightness,0);assert(end.brightness<1e-20);
 assert(begin.pathKm>80&&begin.durationSeconds>0);
}
almost(meteorState(.5).altitudeKm,80);almost(meteorState(.5).brightness,1);
assert(meteorState(.5,{meteorAngle:10}).durationSeconds>meteorState(.5,{meteorAngle:80}).durationSeconds);
assert.equal(supernovaStage(0),'progenitor');assert.equal(supernovaStage(.25),'collapse');assert.equal(supernovaStage(.5),'explosion');assert.equal(supernovaStage(1),'remnant');
console.log('Cosmic models: parameter bounds, Schwarzschild radius, NS density/compactness, coherent magnetic geometry and two-pole profiles, meteor horizontal-entry geometry, speed/time scaling and SN stage order passed.');

assert.equal(normalizeCosmicParams({inclination:10}).bhInclination,55,'Pulsar observer changes do not change black-hole viewing angle');
