import assert from 'node:assert/strict';
import {cloudMoonIrradiance} from '../src/cloud-lighting.js';
import {lunarState} from '../src/moon-math.js';
import {sunPosition} from '../src/orbit.js';
const sun=[149597870.7,0,0],near=[-384400,0,16000],far=near.map(v=>v*1.2);
const full=cloudMoonIrradiance(near,sun),quarter=cloudMoonIrradiance([0,384400,0],sun),newMoon=cloudMoonIrradiance([384400,0,0],sun);
assert(full>2e-6&&full<3e-6,'full Moon is millions of times fainter than sunlight');
assert(quarter>0&&quarter<full*.4);assert(newMoon<1e-20);
assert(Math.abs(cloudMoonIrradiance(far,sun)/full-1/1.2**2)<.001,'inverse-square dilution');
assert.equal(cloudMoonIrradiance([-384400,0,0],sun),0,'Earth eclipses the Moon');
assert.equal(cloudMoonIrradiance([0,0,0],sun),0);
assert.equal(cloudMoonIrradiance([NaN,0,0],sun),0);

const samples=[];
for(let day=1;day<=30;day++){
 const time=Date.parse(`2026-10-${String(day).padStart(2,'0')}T00:00Z`),moon=lunarState(time),value=cloudMoonIrradiance(moon.position,sunPosition(time));
 assert(Number.isFinite(value)&&value>=0&&value<4e-6);
 samples.push(value);
}
assert(Math.max(...samples)>Math.min(...samples)*100,'actual ephemerides vary across the lunar cycle');
console.log('Cloud moonlight: phase, dilution, lunar eclipse, invalid state and natural irradiance passed',{full,quarter,newMoon});
