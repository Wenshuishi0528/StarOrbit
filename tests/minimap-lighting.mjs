import assert from 'node:assert/strict';
import {MinimapNightRaster,nightOpacity,NIGHT_WIDTH as w,NIGHT_HEIGHT as h} from '../src/minimap-lighting.js';
import {sunPosition,earthAxes,dot,unit} from '../src/orbit.js';
const RAD=Math.PI/180,raster=new MinimapNightRaster(),pixels=raster.pixels;
assert.equal(pixels.byteLength,259200);
assert.equal(nightOpacity(1),0);assert.equal(nightOpacity(0),0);assert.equal(nightOpacity(-1),.72);
for(let degrees=0;degrees<6;degrees+=.1)assert(nightOpacity(-Math.sin((degrees+.1)*RAD))>=nightOpacity(-Math.sin(degrees*RAD)));
const solar=date=>{const time=Date.parse(date);return earthAxes(time).map(axis=>dot(unit(sunPosition(time)),axis));};
const summer=solar('2026-06-21T12:00:00Z'),winter=solar('2026-12-21T12:00:00Z');
for(const sun of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],summer,winter,solar('2026-03-20T14:46:00Z'),solar('2026-09-23T00:05:00Z')]){
 assert.equal(raster.update(sun),true);assert.equal(raster.pixels,pixels);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const lon=((x+.5)/w*360-180)*RAD,lat=(90-(y+.5)/h*180)*RAD;
  const cosine=dot([Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)],sun);
  const alpha=pixels[(y*w+x)*4+3];
  if(cosine>=0)assert.equal(alpha,0);
  if(cosine<=-Math.sin(6*RAD))assert.equal(alpha,184);
  assert(alpha>=0&&alpha<=184);
 }
 assert.equal(raster.update([...sun]),false,'unchanged Sun reuses cached pixels');
 assert.equal(raster.update(sun.map(n=>n+1e-6)),false,'subpixel movement reuses cached pixels');
}
for(const [sun,north,south] of [[summer,0,184],[winter,184,0]]){
 raster.update(sun);assert.equal(pixels[3],north);assert.equal(pixels[((h-1)*w)*4+3],south);
}
const timings=[];
for(let i=0;i<200;i++){
 const a=i*.01,start=performance.now();raster.update([Math.cos(a),Math.sin(a),0]);timings.push(performance.now()-start);
}
timings.sort((a,b)=>a-b);
console.log({daylightAndTwilight:'pass',seasonsAndPoles:'pass',cachedBuffers:'pass',bytes:pixels.byteLength,computeMedianMs:timings[100],computeP95Ms:timings[190]});
