import assert from 'node:assert/strict';
import {dot,earthAxes} from '../src/orbit.js';
import {SURVEY_PERIOD,SURVEY_END,surveyVisibility} from '../src/survey-lab-math.js';
import {SURVEY_RADIUS_RATIO,surveyWindowArcs,surveyWindowAt,surveyEquatorialView,surveyMapView,surveyProjectedPoint,surveyOrbitPosition,surveyTimeAtMapPoint,surveyEarthIntercept} from '../src/survey-orbit-overview-math.js';

const near=(a,b,delta=1e-8)=>assert(Math.abs(a-b)<delta,`${a} != ${b}`);
const orbit={epoch:0,radial:[1,0,0],along:[0,1,0],park:[0,0,-1],sun:[0,0,1]};
for(const dir of [[1,0,0],[0,0,1],[0,0,-1]]){
 const visibility=surveyVisibility(orbit,dir),arcs=surveyWindowArcs(visibility);
 assert.equal(arcs[0].start,0);assert.equal(arcs.at(-1).end,SURVEY_PERIOD);
 for(const [i,a] of arcs.entries()){
  assert(a.end>a.start);if(i)assert.equal(a.start,arcs[i-1].end);
  assert.equal(surveyWindowAt(visibility,(a.start+a.end)/2),a.kind);
 }
 for(const [s,e] of visibility.windows){assert.equal(surveyWindowAt(visibility,s),'clear');assert.equal(surveyWindowAt(visibility,e),'clear');}
}
const blocked=surveyVisibility(orbit,orbit.sun);assert.deepEqual(surveyWindowArcs(blocked),[{start:0,end:SURVEY_PERIOD,kind:'sun'}]);
const partial=surveyVisibility(orbit,[1,0,0]);assert.deepEqual(surveyWindowArcs(partial).map(a=>a.kind),['clear','earth','clear']);
for(const [yaw,tilt] of [[0,0],[0,52],[159,47],[280,-60],[-118,67]]){
 const v=surveyMapView(orbit,yaw,tilt);near(dot(v.front,v.up),0);near(dot(v.right,v.up),0);
 for(const sec of [0,13,500,1200,2255,4400,5520,SURVEY_END]){
  const position=surveyOrbitPosition(orbit,sec);near(Math.hypot(...position),SURVEY_RADIUS_RATIO);
  const p=surveyProjectedPoint(position,v);const pick=surveyTimeAtMapPoint(p.x,p.y,v,1e-7,sec);assert.equal(pick,sec,`angle ${yaw}°/${tilt}° time ${sec}`);
 }
 assert.equal(surveyTimeAtMapPoint(0,0,v,.15),null);assert.equal(surveyTimeAtMapPoint(2,2,v,.15),null);
}
const face=surveyMapView(orbit),oblique=surveyMapView(orbit,0,52);
const front=surveyOrbitPosition(orbit,SURVEY_PERIOD/4),rear=surveyOrbitPosition(orbit,3*SURVEY_PERIOD/4);
assert.equal(surveyProjectedPoint(rear,face).behindEarth,false);
assert.equal(surveyProjectedPoint(rear,oblique).behindEarth,true);assert.equal(surveyProjectedPoint(front,oblique).behindEarth,false);
assert.equal(surveyTimeAtMapPoint(SURVEY_RADIUS_RATIO,0,face,.01,5000),SURVEY_END);
const equatorEpoch=Date.UTC(2026,10,6),[node,east,pole]=earthAxes(equatorEpoch);
for(const degrees of [0,41.5,89.99,90,130,180]){
 const inc=degrees*Math.PI/180,phase=.63,transverse=east.map((v,i)=>v*Math.cos(inc)+pole[i]*Math.sin(inc));
 const inclined={epoch:equatorEpoch,radial:node.map((v,i)=>v*Math.cos(phase)+transverse[i]*Math.sin(phase)),
  along:node.map((v,i)=>-v*Math.sin(phase)+transverse[i]*Math.cos(phase))};
 for(const turn of [0,-35,54,-126]){
  const view=surveyEquatorialView(inclined,turn);near(dot(view.front,pole),0);
  near(dot(view.up,pole),1);near(dot(view.right,pole),0);
  if(degrees===0||degrees===180)assert.equal(view.ascending,null);
  else{near(dot(view.ascending,pole),0);near(dot(view.ascending,node),1);near(dot(view.ascending,inclined.radial),Math.cos(phase));}
  for(const sec of [0,13,572,1490,2687,3893,SURVEY_END]){
   const xy=surveyProjectedPoint(surveyOrbitPosition(inclined,sec),view);
   assert.equal(surveyTimeAtMapPoint(xy.x,xy.y,view,1e-7,sec),sec,`equatorial ${degrees}°/${turn}°, ${sec}s`);
  }
 }
}
near(surveyEarthIntercept([SURVEY_RADIUS_RATIO,0,0],[-1,0,0]),SURVEY_RADIUS_RATIO-1);
assert.equal(surveyEarthIntercept([SURVEY_RADIUS_RATIO,0,0],[0,1,0]),null);
assert.equal(surveyEarthIntercept([SURVEY_RADIUS_RATIO,0,0],[1,0,0]),null);
console.log('Survey overview: exact visibility arcs, map/time inverse, true scale, back-side occlusion and sightline intercept passed.');
