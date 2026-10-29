import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
const output=process.argv[2]||'dist';
const html=fs.readFileSync(output+'/index.html','utf8'),data=id=>JSON.parse(html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1]);
assert(Buffer.byteLength(html)<500000);assert(!html.includes('__JS__'));assert(!html.includes('__HELP_'));assert(!html.includes('data:image/jpeg;base64,'));
function resource(url){assert(url.startsWith('assets/'));assert(!url.includes('..'));const p=path.join(output,url);assert(fs.existsSync(p),url);return fs.readFileSync(p);}
const station=data('modelData'),unpacked=zlib.gunzipSync(resource(station.url));assert.equal(unpacked.readUInt32LE(),0x46546c67);assert(unpacked.equals(fs.readFileSync('assets/station.glb')));
const catalog=JSON.parse(fs.readFileSync('assets/missions/catalog.json','utf8'));
for(const [id,source] of Object.entries(data('spacecraftModels'))){
 const model=zlib.gunzipSync(resource(source.url));assert.equal(model.readUInt32LE(),0x46546c67);
 assert(model.equals(fs.readFileSync(catalog.spacecraft[id].asset)),`${id}: bundled model must match the active catalog asset`);
}
const orbits=JSON.parse(resource(data('missionOrbits').url));assert(orbits.tiangong.rows.length>=8&&orbits.dfh1.rows.length>=8);
const scan=value=>{if(typeof value==='string')resource(value);else if(value)Object.values(value).forEach(scan);};scan(data('environmentAssets'));
for(const track of data('musicData')){assert(!track.base64);assert.equal(crypto.createHash('sha256').update(resource(track.url)).digest('hex'),track.sha256);}
const appURL=html.match(/<script defer src="([^"]+)"/)[1];resource(appURL);
assert.equal(JSON.parse(fs.readFileSync(output+'/version.json')).version,JSON.parse(fs.readFileSync('package.json')).displayVersion);
console.log(output+' build: relative hashed URLs, compact entry, original models/music, orbit data and version passed');
