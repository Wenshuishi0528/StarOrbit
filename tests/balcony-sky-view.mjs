import assert from 'node:assert/strict';
import {observerFrame} from '../src/pass-prediction.js';
import {BEIJING_BALCONY,groundBasis,stellarAngles} from '../src/balcony-lab-geometry.js';
import {equatorial} from '../src/environment-math.js';
import {dot} from '../src/orbit.js';
import {dragSkyPose,projectSky,skyAngles,skyDirection,skyPose,skyProjection3D,skyRay} from '../src/balcony-sky-view-math.js';

const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const same=(a,b)=>a.forEach((v,i)=>near(v,b[i]));
const dome=skyProjection3D('hemisphere',740,320,skyPose('hemisphere',180,90));
const zenith=projectSky(skyDirection(0,90),dome),north=projectSky(skyDirection(0,0),dome),east=projectSky(skyDirection(90,0),dome);
near(zenith.x,370);near(zenith.y,160);near(north.x,370);near(north.y,160-dome.radius);
near(east.x,370-dome.radius);near(east.y,160);assert.equal(projectSky([0,0,-1],dome),null);
assert.equal(skyRay(1,1,dome),null);
for(const [a,e] of [[359,4],[1,4],[68,30],[182,15],[90,82],[48,0],[359.75,89.99]]){
 const v=skyDirection(a,e),p=projectSky(v,dome),ray=skyRay(p.x,p.y,dome);same(ray,v);
}

for(const mode of ['hemisphere','sphere'])for(const angle of [[359,36,0],[14,78,62],[311,90,-34],[92,-57,89],[197,-90,0]]){
 const [a,e,r]=angle,pose=skyPose(mode,a,e,r),view=skyProjection3D(mode,730,350,pose,1.4);
 same(skyRay(365,175,view),view.forward);near(dot(view.right,view.up),0);near(dot(view.forward,view.right),0);
 for(const [x,y] of [[365,175],[350,130],[399,166],[310,204],[370,212]]){
  const v=skyRay(x,y,view);if(v[2]<0&&mode==='hemisphere')continue;
  const p=projectSky(v,view);assert(p);near(p.x,x);near(p.y,y);
 }
}
const flat=skyProjection3D('sphere',600,310,skyPose('sphere',0,0,0));
const rolled=skyProjection3D('sphere',600,310,skyPose('sphere',0,0,90));
const high=skyDirection(0,18),up=projectSky(high,flat),left=projectSky(high,rolled);
near(up.x,300);assert(up.y<155);assert(left.x<300);near(left.y,155);
assert.equal(projectSky(skyDirection(180,0),flat),null);
const under=skyProjection3D('sphere',600,310,skyPose('sphere',30,-90));
near(projectSky([0,0,-1],under).y,155);assert(skyAngles(skyRay(310,150,under)).elevation<0);
assert.equal(skyPose('hemisphere',30,-45).elevation,0);assert.equal(skyPose('sphere',361,-100,360).roll,0);
assert.equal(skyPose('sphere',NaN,10),null);
const moved=dragSkyPose('sphere',skyPose('sphere',1,12),80,20,flat);
assert(moved.azimuth>300);assert(moved.elevation>12);
assert.equal(dragSkyPose('sphere',skyPose('sphere',1,85),0,300,flat).elevation,90);
assert.equal(dragSkyPose('sphere',skyPose('sphere',1,-85),0,-300,flat).elevation,-90);
const larger=dragSkyPose('sphere',skyPose('sphere',0,0,90),40,0,rolled);
near(larger.azimuth,0);assert(larger.elevation>0);

// A real J2000 pole direction sits at the local observing latitude to precession
// precision at J2000. Reverse-projected stellar coordinates match the 2-D frame.
const basis=groundBasis(observerFrame(BEIJING_BALCONY),Date.UTC(2000,0,1,12)),pole=equatorial(0,90);
const q=stellarAngles(pole,basis);
near(q.elevation,BEIJING_BALCONY.latitude,0.02);
const local=skyDirection(q.azimuth,q.elevation);same(local,basis.map(axis=>dot(pole,axis)));
const p=projectSky(local,dome);same(skyRay(p.x,p.y,dome),local);
console.log('Balcony sky: horizon-to-zenith dome, full-sphere nadir, roll, pointer inversion and Beijing J2000 frame passed.');
