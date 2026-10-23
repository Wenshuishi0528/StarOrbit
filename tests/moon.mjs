import assert from 'node:assert/strict';
import * as Astronomy from 'astronomy-engine';
import {LunarEphemeris,lunarState,lunarAppearance,moonBehindEarth,MOON_RADIUS} from '../src/moon-math.js';
import {sunPosition,dot,norm,unit,sub,sunlightFraction} from '../src/orbit.js';
const ephemeris=new LunarEphemeris();let error=0,phaseError=0;
for(let t=Date.UTC(2026,0,1)+30123;t<Date.UTC(2027,0,1);t+=86400000){
 const m=ephemeris.at(t),exact=lunarState(t),a=lunarAppearance(m.position,sunPosition(t),[0,0,0]);
 error=Math.max(error,norm(sub(m.position,exact.position)));phaseError=Math.max(phaseError,Math.abs(a.illuminatedFraction-Astronomy.Illumination(Astronomy.Body.Moon,new Date(t)).phase_fraction));
 assert.ok(a.angularDiameter*180/Math.PI>.48&&a.angularDiameter*180/Math.PI<.57);
 for(const axis of m.axes)assert.ok(Math.abs(norm(axis)-1)<1e-12);
 assert.ok(Math.abs(dot(m.axes[0],m.axes[2]))<1e-12);
 // IAU prime meridian remains on the Earth-facing hemisphere; allow libration.
 assert.ok(dot(m.axes[0],unit(m.position.map(v=>-v)))>.97);
}
assert.ok(error<.01);assert.ok(phaseError<1e-7);assert.ok(ephemeris.samples.size<=4);
const t=Date.UTC(2026,9,23),m=ephemeris.at(t),sun=sunPosition(t),v=unit(m.position),a=lunarAppearance(m.position,sun,[0,0,0]),b=lunarAppearance(m.position,sun,v.map(x=>x*6771));assert.ok(b.angularDiameter>a.angularDiameter);
assert.equal(moonBehindEarth(m.position,v.map(x=>-x*6771)),true);assert.equal(moonBehindEarth(m.position,v.map(x=>x*6771)),false);
const direct=unit(sub(sun,m.position));assert.ok(Math.abs(lunarAppearance(m.position,sun,m.position.map((v,i)=>v+direct[i]*10000)).illuminatedFraction-1)<1e-12);
assert.ok(lunarAppearance(m.position,sun,m.position.map((v,i)=>v-direct[i]*10000)).illuminatedFraction<1e-12);
// NASA: 2026-03-03 greatest total lunar eclipse ~11:34 UTC.
const eclipse=Date.UTC(2026,2,3,11,34),e=lunarState(eclipse);assert.equal(sunlightFraction(e.position,sunPosition(eclipse)),0);
const cache=new LunarEphemeris();for(let i=0;i<600;i++)cache.at(t+i*16);assert.equal(cache.evaluations,2);
for(const offset of [-3600000,86400000,12345]){const q=cache.at(t+offset);assert.ok(norm(sub(q.position,lunarState(t+offset).position))<.01);}
console.log({maxInterpolationMeters:error*1000,maxPhaseFractionError:phaseError,cacheCallsPer600Frames:2,parallax:'pass',lunarEclipse:'pass',IAUOrientation:'pass',radiusKm:MOON_RADIUS});
