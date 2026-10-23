import {GeoMoon,RotationAxis,Body} from 'astronomy-engine';
import {AU,dot,norm,unit,cross,sub} from './orbit.js';
export const MOON_RADIUS=1737.4;
const lerp=(a,b,f)=>a.map((v,i)=>v+(b[i]-v)*f);
export function lunarState(t){
 const date=new Date(t),p=GeoMoon(date),axis=RotationAxis(Body.Moon,date),a=axis.ra*Math.PI/12,w=axis.spin*Math.PI/180;
 const north=[axis.north.x,axis.north.y,axis.north.z],node=[-Math.sin(a),Math.cos(a),0],east=cross(north,node);
 return {position:[p.x*AU,p.y*AU,p.z*AU],north,prime:node.map((v,i)=>v*Math.cos(w)+east[i]*Math.sin(w))};
}
// One-minute ephemeris samples; smooth in either time direction and bounded across seeks.
export class LunarEphemeris{
 constructor(){this.samples=new Map();this.evaluations=0;}
 sample(t){if(!this.samples.has(t)){this.samples.set(t,lunarState(t));this.evaluations++;if(this.samples.size>4)this.samples.delete(this.samples.keys().next().value);}return this.samples.get(t);}
 at(t){const start=Math.floor(t/60000)*60000,f=(t-start)/60000,a=this.sample(start),b=this.sample(start+60000),north=unit(lerp(a.north,b.north,f)),raw=lerp(a.prime,b.prime,f),prime=unit(sub(raw,north.map(v=>v*dot(raw,north))));return {position:lerp(a.position,b.position,f),axes:[prime,cross(north,prime),north]};}
}
export function lunarAppearance(position,sun,observer){
 const sight=sub(position,observer),distance=norm(sight),lit=dot(unit(sub(sun,position)),unit(sub(observer,position)));
 return {distance,direction:unit(sight),angularDiameter:2*Math.asin(MOON_RADIUS/distance),illuminatedFraction:(1+Math.max(-1,Math.min(1,lit)))/2};
}
export function moonBehindEarth(position,observer,radius=6371){
 const ray=sub(position,observer),t=-dot(observer,ray)/dot(ray,ray);
 return t>0&&t<1&&norm(observer.map((v,i)=>v+t*ray[i]))<radius;
}
