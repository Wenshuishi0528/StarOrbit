// Space-scene distances are kilometres. The current atmosphere ends at 300 km
// and the aurora volume at 360 km; keep both inside a slightly larger envelope.
export const EARTH_EFFECTS_RADIUS=6371+400;
export const SPACE_FAR=1000000;
export const FOLLOW_SPACE_NEAR=10;
const MIN_OVERVIEW_NEAR=.1;

// Closest forward depth of the part of a segment inside the side planes and
// in front of the eye. Considering whole segments also protects a LineLoop
// that crosses the view while both sampled endpoints are outside the frame.
function segmentDepth(ax,ay,az,bx,by,bz,tanX,tanY){
 let enter=0,leave=1;
 for(let plane=0;plane<5;plane++){
  const a=plane===0?az:plane===1?az*tanX+ax:plane===2?az*tanX-ax:plane===3?az*tanY+ay:az*tanY-ay;
  const b=plane===0?bz:plane===1?bz*tanX+bx:plane===2?bz*tanX-bx:plane===3?bz*tanY+by:bz*tanY-by;
  if(a<0&&b<0)return Infinity;
  if(a<0)enter=Math.max(enter,a/(a-b));
  else if(b<0)leave=Math.min(leave,a/(a-b));
  if(enter>leave)return Infinity;
 }
 return Math.min(az+(bz-az)*enter,az+(bz-az)*leave);
}

// viewMatrix is a column-major world-to-camera matrix (camera looks along -Z).
// Spheres and the flat xyz LineLoop positions are in world coordinates.
export function spaceCameraClipping({overview,viewMatrix,fov=38,aspect=1,zoom=1,spheres=[],orbitPositions=null}){
 if(!overview)return {near:FOLLOW_SPACE_NEAR,far:SPACE_FAR};
 const m=viewMatrix,tanY=Math.tan(fov*Math.PI/360)/zoom,tanX=tanY*aspect;
 if(!m||m.length!==16||!Number.isFinite(tanX)||!Number.isFinite(tanY)||tanX<=0||tanY<=0)return {near:FOLLOW_SPACE_NEAR,far:SPACE_FAR};
 const sideX=Math.hypot(1,tanX),sideY=Math.hypot(1,tanY);
 let closest=Infinity,furthest=0;
 for(const {center,radius} of spheres){
  const [px,py,pz]=center,x=m[0]*px+m[4]*py+m[8]*pz+m[12],y=m[1]*px+m[5]*py+m[9]*pz+m[13],z=-(m[2]*px+m[6]*py+m[10]*pz+m[14]);
  if(!Number.isFinite(z)||!Number.isFinite(radius)||radius<0||z+radius<=0)continue;
  if(z*tanX+x < -radius*sideX||z*tanX-x < -radius*sideX||z*tanY+y < -radius*sideY||z*tanY-y < -radius*sideY)continue;
  closest=Math.min(closest,Math.max(0,z-radius));furthest=Math.max(furthest,z+radius);
 }
 const positions=orbitPositions,count=Math.floor((positions?.length||0)/3);
 if(count>1){
  let last=(count-1)*3,px=positions[last],py=positions[last+1],pz=positions[last+2];
  let ax=m[0]*px+m[4]*py+m[8]*pz+m[12],ay=m[1]*px+m[5]*py+m[9]*pz+m[13],az=-(m[2]*px+m[6]*py+m[10]*pz+m[14]);
  for(let i=0;i<count;i++){
   const j=i*3;px=positions[j];py=positions[j+1];pz=positions[j+2];
   const bx=m[0]*px+m[4]*py+m[8]*pz+m[12],by=m[1]*px+m[5]*py+m[9]*pz+m[13],bz=-(m[2]*px+m[6]*py+m[10]*pz+m[14]);
   const depth=segmentDepth(ax,ay,az,bx,by,bz,tanX,tanY);
   if(Number.isFinite(depth)){closest=Math.min(closest,depth);furthest=Math.max(furthest,az,bz);}
   ax=bx;ay=by;az=bz;
  }
 }
 const near=Number.isFinite(closest)?Math.max(MIN_OVERVIEW_NEAR,closest*.5):FOLLOW_SPACE_NEAR;
 // The solar disc is placed 800,000 km from the camera. The fixed floor also
 // covers the Moon during normal overview zoom; extend it for large pans.
 const far=Math.max(SPACE_FAR,furthest*1.01,near*2);
 return {near,far};
}

// Local one-LSB world-depth estimate for a conventional perspective buffer.
// This deliberately models 24-bit fixed depth, not logarithmic/reversed depth.
export function depthStepAtDistance(distance,near,far,bits=24){
 if(!(distance>0&&near>0&&far>near&&bits>0&&bits<=52))return Infinity;
 return distance*distance*(far-near)/(far*near*(2**bits-1));
}
