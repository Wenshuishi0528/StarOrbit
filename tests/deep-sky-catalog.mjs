import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEEP_SKY_OBJECTS,DEEP_SKY_TYPES,DEEP_SKY_COORDINATES,deepSkyName,deepSkyTypeName} from '../src/deep-sky-catalog.js';

const byId=new Map(DEEP_SKY_OBJECTS.map(object=>[object.id,object]));
assert.equal(DEEP_SKY_OBJECTS.length,127);
assert.equal(byId.size,DEEP_SKY_OBJECTS.length);
assert.deepEqual(DEEP_SKY_OBJECTS.filter(object=>/^M\d+$/.test(object.id)).map(object=>object.id),Array.from({length:110},(_,i)=>'M'+(i+1)));
assert.equal(DEEP_SKY_OBJECTS.filter(object=>object.source==='heasarc-messier').length,109);
assert.equal(DEEP_SKY_OBJECTS.filter(object=>object.source==='openngc').length,18);
assert.equal(DEEP_SKY_COORDINATES.frame,'J2000');
assert.equal(DEEP_SKY_COORDINATES.raUnit,'degree');
for(const object of DEEP_SKY_OBJECTS){
 assert(Object.hasOwn(DEEP_SKY_TYPES,object.type),object.id+' type');
 assert(object.name&&object.englishName&&object.aliases.length);
 assert(object.ra>=0&&object.ra<360&&object.dec>=-90&&object.dec<=90);
 assert(object.direction.every(Number.isFinite));
 assert(Math.abs(Math.hypot(...object.direction)-1)<1e-12,object.id+' unit direction');
 const [x,y,z]=object.direction;
 const ra=(Math.atan2(y,x)*180/Math.PI+360)%360,dec=Math.asin(z)*180/Math.PI;
 assert(Math.abs(ra-object.ra)<1e-10&&Math.abs(dec-object.dec)<1e-10,object.id+' degree/hour or axis mismatch');
 assert(object.mag===null||Number.isFinite(object.mag)&&object.mag>0&&object.mag<20);
 assert.equal(typeof object.magnitudeUncertain,'boolean');
 assert(object.angularSizeArcmin===null||object.angularSizeArcmin.length===2&&object.angularSizeArcmin.every(n=>Number.isFinite(n)&&n>0&&n<=360));
 if(object.angularSizeArcmin)assert(object.angularSizeArcmin[0]>=object.angularSizeArcmin[1]);
 assert(Object.isFrozen(object)&&Object.isFrozen(object.direction)&&Object.isFrozen(object.aliases));
}
// Independent prominent-object anchors catch hours/degrees, signs and wrong
// Messier-to-NGC joins. HEASARC's older table positions are rounded; these are
// observing-chart tolerances, not claims of sub-arcsecond source astrometry.
for(const [id,ra,dec] of [['M31',10.685,41.269],['M42',83.82,-5.39],['M45',56.87,24.11],['M104',189.998,-11.623],['M102',226.623,55.763]]){
 const object=byId.get(id);assert(Math.abs(object.ra-ra)<.2&&Math.abs(object.dec-dec)<.15,id+' target location');
}
assert.equal(byId.get('M1').type,'supernova-remnant');
assert.equal(byId.get('M24').type,'star-cloud');
assert.equal(byId.get('M40').type,'double-star');
assert.equal(byId.get('M73').type,'asterism');
assert.equal(byId.get('M73').mag,null,'unknown magnitude must not become zero');
assert.equal(byId.get('M73').angularSizeArcmin,null,'unknown size must not be invented');
assert.equal(byId.get('M17').magnitudeUncertain,true);
assert(byId.get('M102').aliases.includes('NGC 5866'));
assert(byId.get('M51').aliases.includes('NGC 5194')&&byId.get('M51').aliases.includes('NGC 5195'));
assert(byId.get('M76').aliases.includes('NGC 650')&&byId.get('M76').aliases.includes('NGC 651'));
assert(byId.get('NGC104').dec<-70,'southern-sky supplement must be present');
assert.equal(byId.get('NGC253').mag,null,'unverified supplement photometry is deliberately omitted');
assert.equal(deepSkyName(byId.get('M31'),'zh'),'仙女座星系');
assert.equal(deepSkyName(byId.get('M31'),'en'),'Andromeda Galaxy');
assert.equal(deepSkyName(byId.get('M31'),'fr'),'Andromeda Galaxy');
assert.equal(deepSkyTypeName('planetary-nebula','zh'),'行星状星云');
assert.equal(deepSkyTypeName('double-star','ru'),'Optical double star');
const bytes=(await readFile(new URL('../src/deep-sky-catalog.js',import.meta.url))).length+(await readFile(new URL('../src/deep-sky-supplement.js',import.meta.url))).length;
assert(bytes<100000,'catalogue must remain compact and contain no embedded images');
console.log(`Deep-sky catalogue: all 110 Messier objects + 17 selected NGC targets, J2000 directions, genuine special classes, unknown data and ${bytes} byte budget passed.`);
