import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GeoVector} from 'astronomy-engine';
import {AU,dot,norm,sub,unit,sunPosition} from '../src/orbit.js';
import {solarApparent} from '../src/solar-system.js';
import {MainPlanets} from '../src/main-planets.js';
import {LunarEphemeris,lunarAppearance} from '../src/moon-math.js';

const t=Date.UTC(2026,10,5,16,18,34),q={t,sun:sunPosition(t),position:[6700,0,0]};
const bodies=solarApparent(q);assert.equal(bodies.length,9);
for(const b of bodies){
 const v=GeoVector(b.id,new Date(t),false);
 const oracle=unit(sub([v.x*AU,v.y*AU,v.z*AU],q.position));
 assert(norm(sub(b.direction,oracle))<1e-8,b.id+' geocentric interpolation/observer parallax');
 assert(Math.abs(dot(b.north,b.prime))<1e-8&&Math.abs(norm(b.prime)-1)<1e-8);
 assert(b.radiusRad>0&&Number.isFinite(b.mag)&&b.illuminatedFraction>=0&&b.illuminatedFraction<=1);
}
const moon=bodies.find(b=>b.id==='Moon'),lunar=new LunarEphemeris();
const oldAppearance=lunarAppearance(lunar.at(t).position,q.sun,q.position);
assert(norm(sub(moon.direction,oldAppearance.direction))<1e-12&&Math.abs(moon.radiusRad*2-oldAppearance.angularDiameter)<1e-10);
const otherEye=solarApparent(q,[0,6700,0]).find(b=>b.id==='Moon');
assert(norm(sub(moon.direction,otherEye.direction))>.01,'substantial lunar parallax across two observers');

const geometry=new THREE.BufferGeometry(),catalogue=new THREE.Points(geometry,new THREE.PointsMaterial());
const sky=new THREE.Scene(),layer=new MainPlanets({stars:catalogue,backdrop:sky}),camera=new THREE.Camera();
const center=solarApparent(q,[0,0,0]),mars=center.find(b=>b.id==='Mars');
for(const sign of [1,-1]){
 const eye=mars.direction.map(v=>v*6750*sign);
 camera.position.fromArray(eye);layer.update(q,camera,true);
 const visible=solarApparent(q,eye).filter(b=>!['Sun','Moon'].includes(b.id)&&!b.behindEarth);
 const marsIndex=visible.findIndex(b=>b.id==='Mars');
 assert.equal(marsIndex>=0,sign===1,'Earth occults Mars on the far side');
 assert.equal(layer.points.geometry.drawRange.count,visible.length);
 if(marsIndex>=0){
  const attrs=layer.points.geometry.attributes;
  const tint=new THREE.Color(mars.color);
  assert(Math.abs(attrs.color.getX(marsIndex)-tint.r)<.0001&&attrs.color.getX(marsIndex)>attrs.color.getY(marsIndex));
  assert(Math.abs(attrs.mag.getX(marsIndex)-visible[marsIndex].mag)<1e-5);
 }
}
layer.update(q,camera,false);assert.equal(layer.points.visible,false);
assert.deepEqual(solarApparent(null),[]);
console.log('Solar system: nine bodies, observer parallax, lunar agreement, Mars tint, magnitude and occultation in main sky passed.');
