import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {MAIN_ATTITUDE_MODES,mainAttitudeDirection,mainAttitudeTargetQuaternion} from '../src/main-flight-attitude.js';
import {stepAttitudeDynamics} from '../src/attitude-dynamics.js';

const V=a=>new Vector3().fromArray(a),Q=a=>new Quaternion().fromArray(a);
const near=(a,b,tolerance=1e-10)=>assert(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const vectorNear=(a,b,tolerance=1e-10)=>a.forEach((v,i)=>near(v,b[i],tolerance));
const snapshot={position:[7000,0,0],velocity:[1,7,2],basis:[[0,0,1],[1,0,0],[0,1,0]]};
const destination=[7000.04,-.03,.02];
const expected={prograde:V(snapshot.velocity),retrograde:V(snapshot.velocity).negate(),
 'radial-out':new Vector3(1,0,0),'radial-in':new Vector3(-1,0,0),normal:new Vector3(0,-2,7),'anti-normal':new Vector3(0,2,-7),target:new Vector3(.04,-.03,.02),'anti-target':new Vector3(-.04,.03,-.02)};
assert.equal(new Set(MAIN_ATTITUDE_MODES.map(mode=>mode.id)).size,9);
for(const [mode,direction] of Object.entries(expected))vectorNear(mainAttitudeDirection(mode,snapshot,destination),direction.normalize().toArray(),1e-10);
assert(mainAttitudeDirection('prograde',snapshot)[0]>0,'prograde is actual velocity, including its radial component');
assert.equal(mainAttitudeDirection('target',snapshot),null);
assert.equal(mainAttitudeDirection('target',snapshot,snapshot.position),null);
assert.equal(mainAttitudeDirection('normal',{position:[1,0,0],velocity:[2,0,0]}),null);
assert.equal(mainAttitudeDirection('inertial',snapshot),null);
assert.equal(mainAttitudeDirection('unknown',snapshot),null);

// A rotation of the entire inertial frame rotates every derived direction;
// a task's display basis cannot alter an orbital or companion target.
const rotation=new Quaternion().setFromAxisAngle(new Vector3(1,-2,3).normalize(),1.1);
const transformed={position:V(snapshot.position).applyQuaternion(rotation).toArray(),velocity:V(snapshot.velocity).applyQuaternion(rotation).toArray(),basis:snapshot.basis};
for(const mode of Object.keys(expected))vectorNear(mainAttitudeDirection(mode,transformed,V(destination).applyQuaternion(rotation).toArray()),V(mainAttitudeDirection(mode,snapshot,destination)).applyQuaternion(rotation).toArray(),1e-10);

for(const assembly of [true,false]){
 const forward=new Vector3(...(assembly?[1,0,0]:[0,0,1])),up=new Vector3(...(assembly?[0,0,1]:[-1,0,0]));
 const initial=new Quaternion().setFromAxisAngle(new Vector3(1,2,-1).normalize(),.8),source=initial.toArray();
 for(const direction of [...Object.values(expected).map(v=>v.toArray()),forward.clone().applyQuaternion(initial).negate().toArray()]){
  const target=mainAttitudeTargetQuaternion(source,direction,{assembly});
  near(Math.hypot(...target),1);vectorNear(forward.clone().applyQuaternion(Q(target)).toArray(),V(direction).normalize().toArray(),1e-10);
  // The target is a controller demand, never a direct pose assignment.
  let state={quaternion:source,angularVelocity:[0,0,0],sasTarget:null};
  const first=stepAttitudeDynamics(state,[0,0,0],{dt:.04,acceleration:.1,maxRate:.3,target});
  assert(Q(first.quaternion).angleTo(initial)<.0001,'initial motion must be bounded by finite torque');
  for(let i=0;i<1200;i++)state=stepAttitudeDynamics(state,[0,0,0],{dt:.04,acceleration:.1,maxRate:.3,target:mainAttitudeTargetQuaternion(state.quaternion,direction,{assembly})});
  assert(forward.clone().applyQuaternion(Q(state.quaternion)).dot(V(direction).normalize())>1-1e-10);
 }
 const unchanged=mainAttitudeTargetQuaternion(source,forward.clone().applyQuaternion(initial).toArray(),{assembly});
 assert(Q(unchanged).angleTo(initial)<1e-7,'already aligned orientation retains its roll');
 const reverse=Q(mainAttitudeTargetQuaternion(source,forward.clone().applyQuaternion(initial).negate().toArray(),{assembly}));
 vectorNear(up.clone().applyQuaternion(reverse).toArray(),up.clone().applyQuaternion(initial).toArray(),1e-10);
 assert.deepEqual(source,initial.toArray());
}
assert.equal(mainAttitudeTargetQuaternion([0,0,0,0],[1,0,0]),null);
assert.equal(mainAttitudeTargetQuaternion([0,0,0,1],[0,0,0]),null);
console.log('Main attitude modes: physical orbit/target directions, frame covariance, assembly/standalone forward axes, antipodal roll, and finite convergent pointing passed.');
