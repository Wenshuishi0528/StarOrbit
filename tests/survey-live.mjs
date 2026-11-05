import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {cameraAxes,lookDirection} from '../src/xuntian-pointing.js';
import {SURVEY_FIELDS} from '../src/survey-lab-math.js';
import {surveyTarget,tileSample,targetEdges,skyCompass,angularScale} from '../src/survey-live-geometry.js';
import {projectStar} from '../src/survey-sky-product-math.js';
import {dot} from '../src/orbit.js';
const close=(a,b,eps=1e-8)=>assert(Math.abs(a-b)<eps,`${a} differs from ${b}`);
for(const f of SURVEY_FIELDS)for(let i=0;i<4;i++){
 const target=surveyTarget(f.id,i),axes=cameraAxes(lookDirection(target.direction)),edges=targetEdges(target,axes,4.7,1.6);
 assert.equal(edges.length,4);assert(edges.flat(2).every(v=>v>=0&&v<=1));
 for(const [u,v] of [[.01,.01],[.5,.5],[.99,.99]]){
  const d=tileSample(target,u,v),p=projectStar(f,d);assert.equal((p.y<.5?0:2)+(p.x<.5?0:1),i);
 }
 const back=cameraAxes(lookDirection(target.direction.map(v=>-v)));assert.equal(targetEdges(target,back,4.7,1.6).length,0);
 assert(dot(target.direction,f.tiles[i])>.999999);assert.equal(surveyTarget(f.id,'ABCD'[i]).tile,i);
}
assert.equal(surveyTarget('missing',0),null);assert.equal(surveyTarget('orion',4),null);
const pose=lookDirection([1,0,0]),northUp=skyCompass(cameraAxes(pose));close(northUp[0][1],-1);close(northUp[1][0],-1);
pose.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2));const turned=skyCompass(cameraAxes(pose));close(Math.abs(turned[0][0]),1);
assert.equal(skyCompass({forward:[0,0,1]}),null);
assert.equal(angularScale(4.7,300).label,'1°');assert.equal(angularScale(.35,300).label,'2′');
console.log('Nine fields × four tiles reproduce the training footprint. Detector clipping, celestial pole, roll and zoom scale passed.');
