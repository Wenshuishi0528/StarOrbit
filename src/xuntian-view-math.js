import {EARTH_RADIUS,dot,norm} from './orbit.js';

const degree=Math.PI/180;
export const VIEW_MAX_RATE=20;
// Flux of a magnitude-8 point source at the reference collecting area and exposure.
export const CATALOG_SIGNAL=.20,DETECTOR_SIGMA=.26;
export function sensorOptics(fovY,apertureMm,exposure=1){
  const tangent=Math.tan(fovY*degree/2),areaGain=(apertureMm/600)**2*Math.max(exposure,0);
  // Fixed 24 mm sensor height. Gaussian diffraction width approximates the core
  // of a circular aperture at 550 nm, added in quadrature to the display PSF.
  const diffraction=.437*.00055/apertureMm;
  const sigmaAt300=Math.hypot(DETECTOR_SIGMA,diffraction*300/(2*tangent));
  // The best detector pixel can receive at most the whole point-source flux.
  const peakShare=Math.min(1,1/(2*Math.PI*sigmaAt300**2));
  const limitMagnitude=8+2.5*Math.log10(Math.max(1e-14,CATALOG_SIGNAL*areaGain*peakShare/.0035));
  return {tangent,areaGain,diffraction,sigmaAt300,limitMagnitude};
}
export function coneHalfAngle(tangent,aspect){return Math.atan(tangent*Math.hypot(1,aspect))/degree;}
export function groundHit(eye,direction,earthAxes){
  const near=-dot(eye,direction);if(near<=0)return null;
  const perpendicular=eye.map((v,i)=>v+near*direction[i]);
  const discriminant=EARTH_RADIUS**2-dot(perpendicular,perpendicular);if(discriminant<0)return null;
  const distanceKm=near-Math.sqrt(discriminant);if(distanceKm<0)return null;
  const point=eye.map((v,i)=>v+distanceKm*direction[i]),fixed=earthAxes.map(axis=>dot(axis,point));
  return {kind:'earth',distanceKm,latitude:Math.asin(Math.max(-1,Math.min(1,fixed[2]/norm(fixed))))/degree,
    longitude:Math.atan2(fixed[1],fixed[0])/degree};
}
export const toLocal=(basis,direction)=>basis.map(axis=>dot(axis,direction));
export function starInSky(direction,axes,tangent,aspect,eye){
  const ahead=dot(direction,axes.forward);if(ahead<=0||Math.abs(dot(direction,axes.right))>ahead*tangent*aspect||Math.abs(dot(direction,axes.up))>ahead*tangent)return false;
  const towardEarth=-dot(eye,direction);return towardEarth<=0||towardEarth*towardEarth<dot(eye,eye)-EARTH_RADIUS**2;
}
export function starColour(bv){
  // Interpolate the main catalogue's blue, neutral and warm stellar colours.
  // The detector adds radiance, so its input tints are linear, like THREE.Color.
  const linear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
  const stops=[[-.3,[.67,.79,1]],[.1,[.753,.843,1]],[.4,[.898,.925,1]],[.9,[1,.941,.863]],[1.55,[1,.808,.620]],[2.1,[1,.72,.54]]];
  if(!Number.isFinite(bv))return [.898,.925,1].map(linear);
  if(bv<=stops[0][0])return stops[0][1].map(linear);
  for(let i=1;i<stops.length;i++)if(bv<=stops[i][0]){const [left,a]=stops[i-1],[right,b]=stops[i],k=(bv-left)/(right-left);return a.map((v,j)=>linear(v+(b[j]-v)*k));}
  return stops.at(-1)[1].map(linear);
}
