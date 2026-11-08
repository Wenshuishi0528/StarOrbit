import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
const output=process.argv[2]||'dist';
const html=fs.readFileSync(output+'/index.html','utf8'),data=id=>JSON.parse(html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1]);
assert(Buffer.byteLength(html)<750000);assert(!html.includes('__JS__'));assert(!html.includes('__HELP_'));assert(!html.includes('data:image/jpeg;base64,'));
function resource(url){assert(url.startsWith('assets/'));assert(!url.includes('..'));const p=path.join(output,url);assert(fs.existsSync(p),url);return fs.readFileSync(p);}
const station=data('modelData'),unpacked=zlib.gunzipSync(resource(station.url));assert.equal(unpacked.readUInt32LE(),0x46546c67);assert(unpacked.equals(fs.readFileSync('assets/station.glb')));
const catalog=JSON.parse(fs.readFileSync('assets/missions/catalog.json','utf8'));
for(const [id,source] of Object.entries(data('spacecraftModels'))){
 const model=zlib.gunzipSync(resource(source.url));assert.equal(model.readUInt32LE(),0x46546c67);
 assert(model.equals(fs.readFileSync(catalog.spacecraft[id].asset)),`${id}: bundled model must match the active catalog asset`);
}
const orbits=JSON.parse(resource(data('missionOrbits').url));assert(orbits.tiangong.rows.length>=8&&orbits.dfh1.rows.length>=8);
const scan=value=>{if(typeof value==='string')resource(value);else if(value)Object.values(value).forEach(scan);};
const {skyDetail,cityTerrain,constellationArt,chineseConstellationArt,elevation,lunarTerrain,...environment}=data('environmentAssets');scan(environment);
const elevationManifest=JSON.parse(fs.readFileSync('assets/earth/elevation/manifest.json','utf8'));
assert(resource(elevation.base.url).equals(fs.readFileSync(elevationManifest.base.file)));
assert.equal(zlib.gunzipSync(resource(elevation.base.url)).byteLength,elevation.base.width*elevation.base.height*2);
assert.equal(elevation.base.verticalDatum,'EGM2008 geoid');
const artManifest=JSON.parse(fs.readFileSync('assets/constellation-art/manifest.json','utf8'));
assert.equal(constellationArt.images.length,85);assert.equal(Object.keys(constellationArt.constellationImages).length,88);
for(const art of constellationArt.images){const source=artManifest.images.find(c=>c.imageId===art.imageId);assert(resource(art.url).equals(fs.readFileSync(source.file)));assert.deepEqual(art.anchors,source.anchors);}
// The free artwork stays separately accessible, with usable links and licenses.
const distributedArt=JSON.parse(fs.readFileSync(output+'/assets/constellation-art/manifest.json','utf8'));
assert.equal(distributedArt.images.length,85);
for(const art of distributedArt.images){
 const source=artManifest.images.find(c=>c.imageId===art.imageId);
 assert(fs.readFileSync(path.join(output,'assets/constellation-art',art.file)).equals(fs.readFileSync(source.file)));
}
for(const file of ['README.md','LICENSE-FAL-1.3.html','LICENSE-CC-BY-SA-4.0.txt','upstream-description.md'])assert(fs.readFileSync(output+'/assets/constellation-art/'+file).equals(fs.readFileSync('assets/constellation-art/'+file)));
const chineseArt=JSON.parse(fs.readFileSync('assets/chinese-sky/art/manifest.json'));
assert.equal(chineseConstellationArt.artworks,chineseArt.artworks);
assert.equal(chineseConstellationArt.images.length,chineseArt.images.length);
assert.equal(chineseConstellationArt.version,chineseArt.version);
const chineseDistributed=JSON.parse(fs.readFileSync(output+'/assets/chinese-sky/art/manifest.json'));
for(const art of chineseConstellationArt.images){
 const source=chineseArt.images.find(c=>c.imageId===art.imageId);assert(source);
 assert(resource(art.url).equals(fs.readFileSync(source.file)),art.imageId);
 assert(!Object.hasOwn(art,'mesh'),'geometry belongs in the hashed application payload');
 const distributed=chineseDistributed.images.find(c=>c.imageId===art.imageId);
 const actual=path.resolve(output,'assets/chinese-sky/art',distributed.file);
 assert(actual.startsWith(path.resolve(output)+path.sep));
 assert(fs.readFileSync(actual).equals(fs.readFileSync(source.file)));
}
for(const file of ['README.md','catalog.json','source/CC-BY-SA-4.0.txt','source/index.json','source/I-239-hip_main.tsv','source/I-311-hip2.tsv','source/Gaia-DR3.csv','source/Gaia-DR3-AIP.xml','source/Gaia-HIP-crossmatch.csv','art/README.md','art/provenance.json','art/rigid-placements.json','art/expansion-brief.json','art/subjects.txt','art/placement-audit.json'])assert(fs.readFileSync(output+'/assets/chinese-sky/'+file).equals(fs.readFileSync('assets/chinese-sky/'+file)));
assert.equal((html.match(/<\/head>/g)||[]).length,1,'Embedded licenses must not terminate the document head');
for(const file of ['README.md','catalog.json','source/I-311-hip2.tsv'])assert(fs.readFileSync(output+'/assets/stellar-distances/'+file).equals(fs.readFileSync('assets/stellar-distances/'+file)),`stellar distance provenance ${file}`);
assert(fs.readFileSync(output+'/assets/cosmic/README.md').equals(fs.readFileSync('assets/cosmic/README.md')),'Cosmic model methods and attribution remain available offline');
const cityManifest=JSON.parse(fs.readFileSync('assets/earth/cities/manifest.json','utf8'));
assert.equal(cityTerrain.version,cityManifest.version);
let cityBytes=0,cityTiles=0;
for(const city of cityTerrain.cities){
 const original=cityManifest.cities.find(c=>c.id===city.id);assert(original);
 assert.deepEqual(city.bounds,original.bounds);assert.equal(city.pixelSizeMeters,10);
 assert.deepEqual(Object.keys(city.tiles),Object.keys(original.tiles));
 for(const [key,url]of Object.entries(city.tiles)){
  const bytes=resource(url);cityBytes+=bytes.length;cityTiles++;
  assert(bytes.equals(fs.readFileSync(original.tiles[key])),`${city.id}/${key}: city image changed during packaging`);
  assert.equal(bytes.toString('ascii',4,8),'ftyp');assert(bytes.subarray(8,32).includes(Buffer.from('avif')));
 }
 assert.equal(city.provenance,undefined);assert(city.source.credit.includes('Copernicus'));
}
assert.equal(cityTiles,106);assert(cityBytes<6*1024*1024);
const skyManifest=JSON.parse(fs.readFileSync('assets/sky-detail/manifest.json','utf8'));
assert.equal(skyDetail.version,skyManifest.version);
assert.equal(skyDetail.local.providerId,skyManifest.local.providerId);
assert.deepEqual(skyDetail.providers,skyManifest.providers.map(({coverage,...provider})=>provider));
assert.deepEqual(Object.keys(skyDetail.local.tiles),Object.keys(skyManifest.local.tiles));
let skyBytes=0;
for(const [key,url] of Object.entries(skyDetail.local.tiles)){
 const bytes=resource(url);skyBytes+=bytes.length;
 assert(bytes.equals(fs.readFileSync(skyManifest.local.tiles[key])),`Sky AVIF changed during packaging: ${key}`);
 assert.equal(bytes.toString('ascii',4,8),'ftyp');assert(bytes.subarray(8,32).includes(Buffer.from('avif')));
}
assert(skyBytes<15*1024*1024);assert.equal(skyDetail.provenance,undefined);
for(const track of data('musicData')){assert(!track.base64);assert.equal(crypto.createHash('sha256').update(resource(track.url)).digest('hex'),track.sha256);}
const appURL=html.match(/<script defer src="([^"]+)"/)[1];resource(appURL);
assert.equal(JSON.parse(fs.readFileSync(output+'/version.json')).version,JSON.parse(fs.readFileSync('package.json')).displayVersion);
const validation='docs/v'+JSON.parse(fs.readFileSync('package.json')).displayVersion+'-validation.json';
if(fs.existsSync(validation))assert(fs.readFileSync(output+'/'+validation).equals(fs.readFileSync(validation)),'linked validation record must ship with the split build');
console.log(output+' build: relative hashed URLs, compact entry, original models/music, orbit data and version passed');

const lunarDEM=JSON.parse(fs.readFileSync('assets/moon/terrain-manifest.json'));assert(resource(lunarTerrain.url).equals(fs.readFileSync(lunarDEM.file)));assert.equal(zlib.gunzipSync(resource(lunarTerrain.url)).byteLength,lunarDEM.width*lunarDEM.height*2);for(const file of ['README.md','SCIENCE.md','terrain-manifest.json','lola-720x360.i16.gz','lroc-color-2k.jpg'])assert(fs.readFileSync(output+'/assets/moon/'+file).equals(fs.readFileSync('assets/moon/'+file)));

const geology=JSON.parse(fs.readFileSync("assets/moon/geology/manifest.json"));for(const record of geology.outputs)assert(resource(data("environmentAssets").lunarGeology[record.id]).equals(fs.readFileSync(record.file)));
