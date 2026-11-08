import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { detailCell, detailRect, EarthDetail } from '../src/earth-detail.js';

const directory = 'assets/earth/night-2025-500m';
const metadata = JSON.parse(fs.readFileSync(directory + '/manifest.json'));
assert.equal(metadata.year, 2025);
assert.equal(metadata.product, 'VJ146A4.002');
assert.equal(metadata.band, 'AllAngle_Composite_Snow_Free');
assert.equal(metadata.observed, '2025-01-01 / 2025-12-31');
assert.equal(metadata.crs, 'EPSG:4326');
assert.deepEqual(metadata.sourceSize, [86400, 33600]);
assert.deepEqual(metadata.sourceBounds, [-180, -65, 180, 75]);
assert.deepEqual(metadata.pixelDegrees, [1 / 240, -1 / 240]);
assert.equal(metadata.sampleArcSeconds, 15);
assert.deepEqual([metadata.width, metadata.height, metadata.columns, metadata.rows], [86400, 43200, 48, 24]);
assert.equal(metadata.tileSize, 1800);
assert.equal(metadata.gutter, 8);
assert.match(metadata.source, /viirs_2025_raw\.zip$/);
assert.match(metadata.sourceSHA256, /^[a-f0-9]{64}$/);
assert.match(metadata.polarFallback, /2016.*1km.*not 2025/);
assert.deepEqual(metadata.polarFallbackBounds, [[-180,75,180,90],[-180,-90,180,-65]]);
const bases = { simple: [1024,512], medium: [2048,1024], standard: [4096,2048], high: [8192,4096] };
const names = Object.keys(bases).map(tier => tier + '.avif');
for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) names.push(`${x}-${y}.avif`);
assert.deepEqual(Object.keys(metadata.files).sort(), names.sort(), 'complete native grid, no missing or extra tiles');
let bytes = 0;
for (const [name, hash] of Object.entries(metadata.files)) {
  const data = fs.readFileSync(directory + '/' + name);
  bytes += data.length;
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), hash, name);
  assert.equal(data.toString('ascii', 4, 8), 'ftyp', name + ' ISOBMFF header');
  assert.equal(data.toString('ascii', 8, 12), 'avif', name + ' AVIF brand');
  const property = data.indexOf(Buffer.from('ispe'));
  assert(property > 4 && data.readUInt32BE(property - 4) === 20, name + ' image spatial extent');
  const dimensions = [data.readUInt32BE(property + 8), data.readUInt32BE(property + 12)];
  assert.deepEqual(dimensions, bases[name.replace('.avif', '')] || [1816,1816], name);
}
assert.equal(bytes, metadata.totalBytes);

// Execute the actual build source registry with file paths in place of encoded
// image payloads, so wrong extensions or dropped historical choices fail here.
const build = fs.readFileSync('build.mjs', 'utf8');
const registry = build.slice(build.indexOf('environmentAssets.nightDetail='), build.indexOf('// The old July 2004'));
assert(registry.length > 0, 'night-source registry located');
const assets = Object.fromEntries(Object.keys(bases).map(tier => [tier, { night: `${tier}/night.jpg` }]));
new Function('fs', 'image', 'environmentAssets', registry)(fs, path => { assert(fs.existsSync(path), path); return path; }, assets);
assert.deepEqual(Object.keys(assets.nightSources).sort(), ['2016','2024-1km','2025-500m']);
assert.equal(Object.keys(assets.nightDetail).length, 288);
for (const [id, columns, rows, extension] of [['2024-1km',24,12,'.jpg'],['2025-500m',48,24,'.avif']]) {
  const source = assets.nightSources[id];
  assert.deepEqual([source.columns, source.rows], [columns,rows]);
  assert.equal(Object.keys(source.tiles).length, columns * rows);
  assert(Object.values(source.tiles).every(path => path.endsWith(extension)));
  assert(Object.values(source.base).every(path => path.endsWith(extension)));
}
const selector = fs.readFileSync('src/layout.html', 'utf8').match(/<select id="nightSource">([\s\S]*?)<\/select>/)[1];
assert.deepEqual([...selector.matchAll(/value="([^"]+)"/g)].map(match => match[1]), ['2025-500m','2024-1km','2016']);

// Run the constructor's real settings/read-back section: old saves migrate once;
// after migration every explicit historical choice survives another startup.
const environment = fs.readFileSync('src/environment.js', 'utf8');
const settings = environment.slice(environment.indexOf('    this.settings = {'), environment.indexOf('    try {\n      migrateStarDensityDefault'));
assert(settings.includes('nightSourceDefaultVersion'), 'migration block located');
const initialize = new Function('localStorage', 'normalizeStarChartSettings', 'normalizeGeographySettings', 'normalizeSurfaceStreamingSettings', 'QUALITY', 'THREE', 'resolveSkyDetailSource', settings + '\nreturn this.settings;');
function restored(old) {
  return initialize.call({ assets }, { getItem: () => JSON.stringify(old) }, () => ({}), () => ({}), () => ({}), { high: {}, standard: {}, simple: {} }, { MathUtils: { clamp: (n,a,b) => Math.max(a, Math.min(b,n)) } }, () => 'auto');
}
for (const old of [null, {}, {nightSource:'2024-1km'}, {nightSource:'2016'}, {nightSourceDefaultVersion:1,nightSource:'missing'}]) {
  const result = restored(old);
  assert.equal(result.nightSource, '2025-500m');
  assert.equal(result.nightSourceDefaultVersion, 1);
}
for (const id of ['2016','2024-1km','2025-500m']) {
  const first = restored({ nightSourceDefaultVersion: 1, nightSource: id });
  assert.equal(first.nightSource, id);
  assert.equal(restored(first).nightSource, id, 'choice persists after save/reload');
}

// A source-grid switch must release old 24x12 tiles and register 48x24 cells
// geographically, including the date line; switching back must restore 24x12.
const env = { uniforms: {}, fallback: {} }, detail = new EarthDetail(env, true);
let disposed = 0, closed = 0;
detail.slots[0] = { key:'19-3', texture:{ dispose(){disposed++;}, image:{close(){closed++;}} } };
detail.failed.add('19-3');
detail.setSource(assets.nightSources['2025-500m'].tiles, 48, 24);
assert.equal(disposed, 1); assert.equal(closed, 1); assert.equal(detail.failed.size, 0);
assert.equal(detail.slots.length, 4);
assert.equal(detailCell(180,-90,48,24).key, '0-23');
for (const lon of [-179.99,-74,2.35,116.4,179.99]) for (const lat of [-89.99,-33.87,0,39.9,89.99]) {
  const cell = detailCell(lon,lat,48,24), rect = detailRect(cell,48,24), u=(lon+180)/360, v=(lat+90)/180;
  assert(assets.nightSources['2025-500m'].tiles[cell.key]);
  assert(u>=rect[0] && u<=rect[0]+rect[2] && v>=rect[1] && v<=rect[1]+rect[3], 'geographic cell registration');
}
detail.setSource(assets.nightSources['2024-1km'].tiles,24,12);
assert.deepEqual([detail.columns, detail.rows], [24,12]);
assert.equal(detailCell(116.4,39.9,detail.columns,detail.rows).key,'19-3');
console.log({nightSources:'pass', avifFiles:names.length, bytes, nativeGrid:'48x24', migration:'one-time; historical choices persist', geographicRegistration:'pass'});
