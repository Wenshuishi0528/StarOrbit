import assert from 'node:assert/strict';
import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import { skyReferenceFrames, skyReferenceGeometry, skyReferenceLayers, rotateSkyReference } from '../src/sky-reference.js';
import { SkyReferenceLayer } from '../src/sky-reference-layer.js';
import { normalizeStarChartSettings } from '../src/star-chart-settings.js';
import { earthAxes } from '../src/orbit.js';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const bundled = await build({ stdin: { contents: "export { buildSkyAnnotationLayout } from './src/sky-annotation-layout.js';export { StarChart } from './src/star-chart.js';", resolveDir:fileURLToPath(new URL('..', import.meta.url)) }, bundle:true, write:false, platform:'node', format:'esm', logLevel:'silent' });
const { buildSkyAnnotationLayout, StarChart } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
const D = Math.PI / 180;
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const sph = (a,d) => [Math.cos(a*D)*Math.cos(d*D), Math.sin(a*D)*Math.cos(d*D), Math.sin(d*D)];
const close = (a,b,eps=1e-11) => assert(Math.hypot(...a.map((v,i)=>v-b[i])) < eps, `${a} != ${b}`);
const settings = normalizeStarChartSettings({ equatorialGrid:true, eclipticLine:true });
assert.equal(normalizeStarChartSettings().equatorialGrid, false);
assert.equal(normalizeStarChartSettings().eclipticLine, false);
for (const key of ['equatorialGrid','eclipticLine']) assert.throws(()=>normalizeStarChartSettings({[key]:'yes'}, {strict:true}));
for (const year of [1600, 2000, 2026, 2100, 3000]) {
 const time = Date.UTC(year, 6, 1, 12, 34, 56), date = new Date(time), frames = skyReferenceFrames(time);
 assert.equal(skyReferenceFrames(time), frames, 'same epoch shares exact transforms');
 close(rotateSkyReference(frames.equatorialGrid,[0,0,1]), earthAxes(time)[2]);
 for (const kind of ['equatorialGrid','eclipticLine']) {
  const columns=frames[kind], inverse = kind==='equatorialGrid' ? Astronomy.Rotation_EQJ_EQD(date) : Astronomy.Rotation_EQJ_ECT(date);
  for (const [a,d] of [[0,0],[90,0],[180,30],[359.9,-75],[20,90]]) {
   const local=sph(a,d), world=rotateSkyReference(columns,local), restored=Astronomy.RotateVector(inverse,new Astronomy.Vector(...world,date));
   close(local,[restored.x,restored.y,restored.z]);
   assert(Math.abs(Math.hypot(...world)-1)<1e-12);
  }
 }
 const eqPole=frames.equatorialGrid[2], ecPole=frames.eclipticLine[2], obliquity=Math.acos(dot(eqPole,ecPole))/D;
 assert(obliquity>23 && obliquity<24, 'true obliquity in expected range');
 const layers=skyReferenceLayers({settings,epoch:time});
 assert.equal(layers.length,2);
 assert.equal(skyReferenceLayers({settings:{skyCulture:'western',...settings},epoch:time})[0].key,skyReferenceLayers({settings:{...settings,skyCulture:'chinese'},epoch:time})[0].key);
}
assert(Math.hypot(...skyReferenceFrames(Date.UTC(2000,0,1)).equatorialGrid[2].map((v,i)=>v-skyReferenceFrames(Date.UTC(2100,0,1)).equatorialGrid[2][i]))>.009, 'date precession is visible, not fixed J2000');
assert.equal(skyReferenceFrames(NaN),null);
assert.equal(skyReferenceFrames(9e18),null);
assert.deepEqual(skyReferenceLayers({settings:{},epoch:Date.now()}),[]);
const epoch=Date.UTC(2026,10,8), columns=skyReferenceFrames(epoch).equatorialGrid;
let largest=0;
for(const fovY of [110,60,20,3,1,.1,.01]) for(const dec of [-89.99,-75,0,75,89.99]) for(const ra of [0,359.99]) {
 const forward=rotateSkyReference(columns,sph(ra,dec)), options={fovY,aspect:1.6,forward,columns}, geometry=skyReferenceGeometry(options);
 assert.equal(skyReferenceGeometry(options),geometry);
 assert(geometry.paths.length>2);
 const points=geometry.paths.flat();largest=Math.max(largest,points.length);
 assert(points.every(v=>v.every(Number.isFinite)&&Math.abs(Math.hypot(...v)-1)<1e-12));
 const names=geometry.labels.filter(l=>l.key.startsWith('ra-')).map(l=>l.text);
 assert.equal(new Set(names).size,names.length,'RA labels remain unique across wrap and narrow field');
 assert(points.length<50000,`bounded polar geometry: ${points.length}`);
 for(const label of geometry.labels) assert(!label.text.includes('NaN'));
}
const narrow=skyReferenceGeometry({fovY:.01,aspect:1,forward:rotateSkyReference(columns,sph(.002,0)),columns});
assert(narrow.labels.some(l=>l.text.includes('s')),'narrow view labels preserve RA seconds');
const parent=new THREE.Group(), layer=new SkyReferenceLayer(parent);
const opts={settings,epoch,fovY:60,aspect:1,forward:[1,0,0]};
layer.update(opts);
assert.equal(layer.layers.size,2);
const grid=layer.layers.get('equatorialGrid'), oldGeometry=grid.mesh.geometry;
layer.update({...opts,epoch:epoch+1000});
assert.equal(grid.mesh.geometry,oldGeometry,'time-only change rotates existing geometry');
close(new THREE.Vector3(0,0,1).applyMatrix4(grid.mesh.matrix).toArray(),skyReferenceFrames(epoch+1000).equatorialGrid[2]);
layer.update({...opts,settings:{}});assert([...layer.layers.values()].every(l=>!l.mesh.visible));
layer.dispose();assert.equal(parent.children.length,0);
// Labels retain physical foreground masking even when every object-name class is off.
const q={t:epoch, r:[7000,0,0],earthAxes:earthAxes(epoch)}, axes={forward:[0,1,0],right:[-1,0,0],up:[0,0,1]};
const labelSettings={...settings,starLabels:false,catalogStarLabels:false,solarSystemLabels:false,constellationNames:false,deepSkyObjects:false};
const layout=buildSkyAnnotationLayout({settings:labelSettings,q,axes,eyeKm:[7000,0,0],fovY:60,width:1000,height:700});
assert(layout.labels.some(l=>l.kind==='reference'));
const blocked=buildSkyAnnotationLayout({settings:labelSettings,q,axes,eyeKm:[7000,0,0],fovY:60,width:1000,height:700,blocked:()=>true});
assert.equal(blocked.labels.length,0);
console.log(`Sky references: date rotations, obliquity, culture parity, polar/wrap/narrow fields, bounded cache geometry (max ${largest} vertices), shared labels/occlusion and renderer disposal passed.`);

// Exercise the real main-view update: a date-only change must upload the new
// glyph anchors even when text, candidate IDs and screen offsets are unchanged.
const env = { settings:{...labelSettings,stars:true,starChartEnabled:true,starBrightness:1}, backdrop:new THREE.Group(), api:{stage:{clientWidth:1000,clientHeight:700}}, sim:{view:'orbit',current:q,shadowCache:{records:[]}}, moon:{mesh:{position:new THREE.Vector3(),visible:false}} };
const chart = new StarChart(env), camera = new THREE.PerspectiveCamera(60,1000/700,.1,100000);
camera.position.set(7000,0,0);camera.up.set(0,0,1);camera.lookAt(7000,1,0);camera.updateMatrixWorld();
chart.ensureAtlas=()=>{};chart.retireAt=Infinity;
let uploads=0;chart.upload=()=>uploads++;
chart.update(camera);
assert(chart.labels.visible && chart.references.layers.size===2,'reference-only chart is visible');
const beforeUploads=uploads, beforeDirections=[...chart.shown.values()].map(p=>p.dir.toArray());
env.sim.current={...q,t:epoch+1000};chart.lastLayout=-Infinity;chart.update(camera);
assert(uploads>beforeUploads,'date-only reference anchor motion triggers glyph upload');
assert.notDeepEqual([...chart.shown.values()].map(p=>p.dir.toArray()),beforeDirections);
console.log('Main-chart reference-only rendering and date-only glyph-anchor invalidation passed.');

const { skyCulturePhotoCredit } = await import('../src/sky-culture-caption.js');
const { paintConstellationArtCaption } = await import('../src/constellation-art-layer.js');
const frozenEpoch=Date.UTC(2026,10,8,3,4,5), frozenSettings={...settings};
const captureCredit=skyCulturePhotoCredit(null,frozenSettings,true,frozenEpoch);
settings.equatorialGrid=false;settings.eclipticLine=false;
assert.match(captureCredit.caption,/Equatorial grid \+ Ecliptic/);
assert.match(captureCredit.caption,/2026-11-08 03:04:05 UTC \(simulation epoch\)/);
assert.equal(skyCulturePhotoCredit(null,frozenSettings,false,frozenEpoch),null);
assert.equal(skyCulturePhotoCredit(null,settings,true,frozenEpoch),null);
assert.equal(skyCulturePhotoCredit(null,frozenSettings,true,NaN),null);
const combined=skyCulturePhotoCredit({ready:1,caption:'Artwork credit'}, {...frozenSettings,skyCulture:'chinese'},true,frozenEpoch);
assert.match(combined.caption,/Chinese asterisms.*Artwork credit/);
assert.equal(combined.referenceCaption,captureCredit.caption);
const drawn=[];
const captionCanvas={width:1440,height:900,getContext:()=>({save(){},restore(){},fillRect(){},fillText(text){drawn.push(text);}})};
assert.equal(paintConstellationArtCaption(captionCanvas,combined,20),48);
assert.deepEqual(drawn,[combined.caption,combined.referenceCaption]);
console.log('Reference photo captions: frozen epoch/settings, annotation opt-out, disabled layers, data/art credit preservation and separate readable line passed.');
