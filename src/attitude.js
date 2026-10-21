import {earthAxes,dot,unit,sub,cross} from './orbit.js';

// Align the model's +X (Tianhe node/front) with motion over the rotating Earth,
// while -Z points at Earth. The OEM position/velocity remain inertial quantities.
export function groundTrackAttitude(q){
 if(!q)return null;
 // Differentiate the same Earth rotation used by the map, including its date
 // frame conversion, rather than mixing inertial speed with an Earth-fixed path.
 const before=earthAxes(q.t-500),after=earthAxes(q.t+500);
 const fixedVelocity=q.earthAxes.map((axis,i)=>
  dot(axis,q.velocity)+dot(sub(after[i],before[i]),q.position)); // central 1 s interval
 const relativeVelocity=[0,1,2].map(j=>fixedVelocity.reduce((sum,v,i)=>sum+v*q.earthAxes[i][j],0));
 const z=unit(q.position),x=unit(sub(relativeVelocity,z.map(v=>v*dot(relativeVelocity,z)))),y=unit(cross(z,x));
 const basis=[x,y,z];
 return {...q,basis,sunLocal:basis.map(axis=>dot(axis,q.sunDir))};
}
