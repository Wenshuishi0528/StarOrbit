import {orbitEllipse} from './orbit.js';

// Uniform eccentric-anomaly sampling draws the whole active ellipse. There is
// no time span, endpoint stitching or mixing of historical/current orbits.
export function sampleOrbitPath(data,time){
 const q=orbitEllipse(data,time);if(!q)return [];
 const {a,b,e,x,y}=q,points=[],steps=360;
 for(let i=0;i<steps;i++){
  const E=2*Math.PI*i/steps,c=a*(Math.cos(E)-e),s=b*Math.sin(E);
  points.push(x.map((v,k)=>c*v+s*y[k]));
 }
 return points;
}
