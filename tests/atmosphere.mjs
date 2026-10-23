import assert from 'node:assert/strict';
import {ATMOSPHERE,buildOpticalDepthTable,opticalDepth,opticalDepthUV,horizonCosine,RAYLEIGH,MIE_EXTINCTION,OZONE} from '../src/atmosphere-optics.js';
const table=buildOpticalDepthTable(),{width,height,data}=table;
const vertical=opticalDepth(0,1,256);
assert.ok(Math.abs(vertical[0]-8)<.003);
assert.ok(Math.abs(vertical[1]-1.2)<.003);
assert.ok(Math.abs(vertical[2]-15)<.015);
assert.equal(data.byteLength/2,256*1024); // Uploaded half-float RGBA texture.
assert.ok(data.every(v=>Number.isFinite(v)&&v>=0));
function sample(h,mu){
 const uv=opticalDepthUV(h,mu),x=uv[0]*(width-1),y=uv[1]*(height-1),x0=Math.min(width-2,Math.floor(x)),y0=Math.min(height-2,Math.floor(y)),a=x-x0,b=y-y0;
 return [0,1,2].map(c=>(1-b)*((1-a)*data[(y0*width+x0)*4+c]+a*data[(y0*width+x0+1)*4+c])+b*((1-a)*data[((y0+1)*width+x0)*4+c]+a*data[((y0+1)*width+x0+1)*4+c]));
}
const transmit=d=>RAYLEIGH.map((r,i)=>Math.exp(-r*d[0]-MIE_EXTINCTION*d[1]-OZONE[i]*d[2]));
let worst=0;
for(const h of [0,.1,.7,1.2,4,8,15,25,40,65,95])for(const offset of [0,.0003,.00465,.02,.1,.4,1]){
 const lo=horizonCosine(h),mu=lo+(1-lo)*offset;
 const expected=transmit(opticalDepth(h,mu,8192)),actual=transmit(sample(h,mu));
 actual.forEach((v,i)=>{worst=Math.max(worst,Math.abs(v-expected[i]));assert.ok(Math.abs(v-expected[i])<.012,`solar transmittance error: h=${h}, mu=${mu}`);});
}
// A tangent ray must lose blue much more strongly than a vertical solar ray.
const tangent=transmit(sample(0,0)),zenith=transmit(sample(0,1));
assert.ok(tangent[2]/tangent[0]<.01);assert.ok(zenith[2]>.7);
// Sub-degree changes through sunset remain continuous in the lookup.
let maxStep=0;
for(const h of [0,8,25,60]){
 let prev=transmit(sample(h,horizonCosine(h)));
 for(let i=1;i<=2000;i++){const next=transmit(sample(h,horizonCosine(h)+i*.0001));next.forEach((v,c)=>maxStep=Math.max(maxStep,Math.abs(v-prev[c])));prev=next;}
}
assert.ok(maxStep<.004);
console.log({atmosphere:'pass',maximumTransmittanceError:worst,maximumSunsetStep:maxStep,textureKiB:256});

// Compare the compact closure with a denser independent quadrature budget.
const {buildMultipleScatteringTable}=await import('../src/atmosphere-multiple.js');
const ms=buildMultipleScatteringTable(table),reference=buildMultipleScatteringTable(table,{directions:64,steps:40});
assert.ok(ms.data.every(v=>Number.isFinite(v)&&v>=0));assert.ok(ms.maxFeedback<.5);
let error=0,energy=0;
for(let i=0;i<ms.data.length;i++)if(i%4!==3){error+=Math.abs(ms.data[i]-reference.data[i]);energy+=reference.data[i];}
assert.ok(error/energy<.06,'compact multiple-scattering table diverges from dense quadrature');
for(let y=0;y<ms.height;y++)for(let c=0;c<3;c++){
 assert.ok(ms.data[(y*ms.width+ms.width-1)*4+c]>=ms.data[y*ms.width*4+c]);
}
console.log({multipleScattering:'pass',weightedQuadratureDifference:error/energy,maxFeedback:ms.maxFeedback,textureKiB:ms.data.byteLength/2048});
