import {scanOrbitEvents} from '../src/orbit-events.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateOrbit,interpolate,snapshot,sunPosition,sunlightFraction,EARTH_RADIUS,AU,norm,sub,dot,cross,bestAngles,panelNormal,earthAxes,parseOrbit} from '../src/orbit.js';
const data=validateOrbit(JSON.parse(fs.readFileSync('assets/orbit.json'))),results={};
// Check held-out official samples, not only reproducing interpolation knots.
let max=0,maxV=0;for(let i=10;i<data.rows.length-10;i+=37){const rows=data.rows.filter((_,j)=>j!==i),p=interpolate(rows,data.rows[i][0]);max=Math.max(max,norm(sub(p.position,data.rows[i].slice(1,4))));maxV=Math.max(maxV,norm(sub(p.velocity,data.rows[i].slice(4))));}
assert(max<.02,`held-out position error ${max} km`);results.heldOutMaxMeters=max*1000;results.heldOutMaxVelocityMetersPerSecond=maxV*1000;
assert.equal(interpolate(data.rows,data.rows[0][0]-1),null);assert.equal(interpolate(data.rows,data.rows.at(-1)[0]+1),null);
assert.throws(()=>validateOrbit({...data,frame:'TEME'}));assert.throws(()=>parseOrbit('not an ephemeris'));
const sun=[AU,0,0];assert.equal(sunlightFraction([6800,0,0],sun),1);assert.equal(sunlightFraction([-6800,0,0],sun),0);assert.equal(sunlightFraction([0,6800,0],sun),1);
let partial=0;for(let a=0;a<Math.PI;a+=.0005){const f=sunlightFraction([6800*Math.cos(a),6800*Math.sin(a),0],sun);if(f>0&&f<1)partial++;}assert(partial>0);results.partialEclipseSamples=partial;
// Independent low-order solar ephemeris (Meeus/NOAA-style mean anomaly) cross-check.
let maxSun=0;for(let day=0;day<7;day++){const t=data.rows[0][0]+day*86400000,n=(t/86400000+2440587.5)-2451545,rad=Math.PI/180,L=(280.460+.9856474*n)*rad,g=(357.528+.9856003*n)*rad,lon=L+(1.915*Math.sin(g)+.020*Math.sin(2*g))*rad,e=(23.439-.0000004*n)*rad;const rough=[Math.cos(lon),Math.cos(e)*Math.sin(lon),Math.sin(e)*Math.sin(lon)];const axes=earthAxes(t);const actual=sunPosition(t); // Compare declination in true date frame using pole; RA not J2000-vs-date mixed.
const dec=Math.asin(dot(actual,axes[2])/norm(actual)),approx=Math.asin(rough[2]);maxSun=Math.max(maxSun,Math.abs(dec-approx)/rad);}
assert(maxSun<.03,`solar declination ${maxSun}`);results.solarDeclinationCrossCheckDegrees=maxSun;
let lit=0,dark=0;for(let j=0;j<180;j++){const t=data.rows[0][0]+j*60000,q=snapshot(data,t);assert(q.altitude>300&&q.altitude<500);assert(q.speed>7&&q.speed<8);assert(Math.abs(dot(q.basis[0],q.basis[2]))<1e-10);assert(dot(cross(q.basis[0],q.basis[1]),q.basis[2])>.999999999);if(q.illumination>.999)lit++;if(q.illumination<.001)dark++;}assert(lit>0&&dark>0);results.threeHourSamples={lit,dark};
for(let i=0;i<200;i++){const x=Math.sin(i*1.77),y=Math.cos(i*2.13),z=Math.sin(i*.31),l=Math.hypot(x,y,z),s=[x/l,y/l,z/l];const a=bestAngles(s,true);assert(dot(panelNormal(a.roll,a.pitch),s)>.999999);const b=bestAngles(s,false);assert(Math.abs(dot(panelNormal(0,b.pitch),s)-Math.hypot(s[0],s[2]))<1e-9);}
const scan=scanOrbitEvents(data,data.rows[0][0],data.rows[0][0]+7200000);let step;do{step=scan.next();}while(!step.done);const event=step.value.events.find(e=>e.type.startsWith('penumbra-'));assert(event);const before=snapshot(data,event.time-30000).illumination,after=snapshot(data,event.time+30000).illumination;assert(Math.abs(after-before)>.9);results.shadowEvent={time:new Date(event.time).toISOString(),entering:event.type==='penumbra-enter',before,after};
fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/physics-results.json',JSON.stringify(results,null,2));console.log(results);
