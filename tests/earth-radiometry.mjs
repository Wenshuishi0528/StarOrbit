import assert from 'node:assert/strict';
import {SOLAR_IRRADIANCE,LAMBERT_DIRECT,radiometryGLSL} from '../src/earth-radiometry.js';
import {SPECTRAL_RAYLEIGH as ray,SPECTRAL_OZONE as ozone,spectrumToRGB} from '../src/atmosphere-spectrum.js';
import {opticalDepth} from '../src/atmosphere-optics.js';
import {earthFragment,atmosphereFragment,cloudFragment,volumeCloudFragment} from '../src/earth-shaders.js';

// A Lambert BRDF integrates to its reflectance: integral(cos(theta) dOmega)=pi.
// The chosen radiance unit makes a white, sun-facing vacuum surface equal to 1.
assert.equal(SOLAR_IRRADIANCE,Math.PI);
assert.equal(LAMBERT_DIRECT,SOLAR_IRRADIANCE/Math.PI);
for(const rho of [.05,.18,.5,1]){
 let integrated=0;const count=10000;
 for(let j=0;j<count;j++){const mu=(j+.5)/count;integrated+=rho/Math.PI*mu*2*Math.PI/count;}
 assert.ok(Math.abs(integrated-rho)<1e-12);
 assert.equal(rho*LAMBERT_DIRECT,rho);
}
// Ensure all actual production programs receive one shared definition, and both
// atmospheric paths use it; a future shader-only change must not evade the test.
for(const shader of [earthFragment,atmosphereFragment,cloudFragment,volumeCloudFragment])assert.equal(shader.split(radiometryGLSL).length-1,1);
assert.ok(earthFragment.includes('directSun*lambertDirect*day'));
assert.equal((atmosphereFragment.match(/sum\*solarIrradiance/g)||[]).length,3);

// Independent zenith/nadir reference: analytically integrate the vertical density
// columns, then use a dense uniform quadrature (not the GPU's LUT or ray steps).
// Sun and camera are above the same ground point. No clouds, emission or MS.
function depth(h){
 const z=h<10?15:h<25?15-(h-10)**2/30:h<40?(40-h)**2/30:0;
 return [8*(Math.exp(-h/8)-Math.exp(-100/8)),1.2*(Math.exp(-h/1.2)-Math.exp(-100/1.2)),z];
}
const transmit=h=>{const d=depth(h);return ray.map((r,i)=>Math.exp(-r*d[0]-.00444*d[1]-ozone[i]*d[2]));};
for(const h of [0,4,10,25,40,75]){
 const actual=opticalDepth(h,1,4096);
 depth(h).forEach((v,i)=>assert.ok(Math.abs(actual[i]-v)<.0001));
}
const pr=3/(8*Math.PI),g=.76,pm=3/(8*Math.PI)*(1-g*g)*2/((2+g*g)*(1+g)**3);
const sum=Array(6).fill(0),count=20000,dh=100/count;
for(let j=0;j<count;j++){
 const h=(j+.5)*dh,T=transmit(h),r=Math.exp(-h/8),m=Math.exp(-h/1.2);
 for(let i=0;i<6;i++)sum[i]+=T[i]*T[i]*(ray[i]*r*pr+.004*m*pm)*dh;
}
const single=spectrumToRGB(sum).map(v=>v*SOLAR_IRRADIANCE);
const expected=[.01877082,.03615152,.07595045];
single.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<.00001));
const T=spectrumToRGB(transmit(0));
// RGB atmosphere transport uses an RGB transmission approximation, not a full
// spectral material BRDF. Keep this distinction explicit in reference values.
const gray=[.05,.18,.5].map(rho=>({rho,vacuum:rho,sunOnly:T.map(t=>rho*t),viewed:T.map(t=>rho*t*t),singleScattered:T.map((t,i)=>rho*t*t+single[i])}));
console.log({radiometry:'pass',solarIrradiance:SOLAR_IRRADIANCE,verticalTransmission:T,nadirSingleScattering:single,gray});
