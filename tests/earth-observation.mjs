import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import {
  groupMinerals,
  hasCommodity,
  createMineralLayer,
  mineralFeature,
} from '../src/earth-minerals.js';
import { decodePlanetaryTerrain, samplePlanetaryTerrain } from '../src/planetary-renderer.js';
const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root));
const manifest = JSON.parse(read('assets/earth/observation/manifest.json'));
assert.deepEqual(manifest.longitudeRange, [-180, 180]);
assert.deepEqual(manifest.latitudeRange, [90, -90]);
for (const r of [...Object.values(manifest.layers), manifest.minerals]) {
  const bytes = read(r.file);
  assert.equal(bytes.length, r.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), r.sha256);
  if (r.width) assert.ok(bytes.subarray(0, 40).includes(Buffer.from('avif')));
}
const data = JSON.parse(gunzipSync(read(manifest.minerals.file)));
assert.equal(data.length, 304632);
assert.equal(new Set(data.map((r) => r[0])).size, data.length);
for (const row of data) {
  assert.ok(Math.abs(row[2]) <= 180 && Math.abs(row[3]) <= 90);
  assert.equal(row.length, 7);
}
const gold = data.filter((r) => hasCommodity(r, 'AU'));
assert.equal(gold.length, 84402);
assert.ok(
  gold.some((r) => r[2] > 100 && r[2] < 125 && r[3] > 20 && r[3] < 45),
  'China is represented'
);
assert.ok(
  data.some((r) => r[1].toLowerCase().includes('bayan')),
  'Bayan Obo is searchable'
);
assert.equal(
  hasCommodity(['', '', '', '', 'PGE_AU'], 'AU'),
  false,
  'commodity matching uses complete codes'
);
for (const step of [4, 1, 0.1]) {
  const groups = groupMinerals(gold, 'AU', step);
  assert.equal(
    groups.reduce((n, g) => n + g.count, 0),
    gold.length
  );
  assert.equal(
    groups.reduce((n, g) => n + g.records.length, 0),
    gold.length
  );
  for (const g of groups)
    assert.ok(
      g.records.some((r) => r[2] === g.longitude && r[3] === g.latitude),
      'groups anchor to real records'
    );
}
const synthetic = [
  ['1', 'East', 179.99, 0, 'AU', '', ''],
  ['2', 'West', -179.99, 0, 'CU', '', ''],
  ['3', 'Pole', 0, 90, 'AU', '', ''],
];
assert.equal(groupMinerals(synthetic, '', 4).length, 3);
assert.ok(mineralFeature(synthetic[0]).sourceUrl.endsWith('dep_id=1'));
const scene = new THREE.Scene(),
  minerals = createMineralLayer(scene);
minerals.update(synthetic, 'AU', true, 3.8, 0.8, 2);
assert.equal(minerals.groups.length, 2);
minerals.update(synthetic, 'CU', true, 1.2, 0.8, 2);
assert.equal(minerals.groups.length, 1);
minerals.update(synthetic, 'CU', false, 1.2, 0.8, 2);
assert.equal(minerals.groups.length, 0);
minerals.dispose();
assert.equal(scene.children.length, 0);
const er = manifest.layers.earthElevation;
const raw = gunzipSync(read(er.heightFile));
assert.equal(createHash('sha256').update(read(er.heightFile)).digest('hex'), er.heightSHA256);
const dem = decodePlanetaryTerrain(
  raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  { width: 2048, height: 1024 }
);
assert.ok(samplePlanetaryTerrain(dem, 32, 85) > 4000, 'Tibetan plateau is high');
assert.ok(samplePlanetaryTerrain(dem, 0, -150) < -3000, 'bathymetry is not flattened to sea level');
assert.ok(samplePlanetaryTerrain(dem, 39.9, 116.4) < 200, 'Beijing overview is lowland');
assert.equal(manifest.layers.nearIR.bands, 'RGB = MODIS 1 / 2 / 1');
assert.equal(manifest.layers.shortIR.bands, 'RGB = MODIS 7 / 2 / 1');
assert.equal(manifest.layers.temperatureDay.periodStart, '2026-10-24');
assert.equal(manifest.layers.temperatureNight.periodEnd, '2026-10-31');
assert.deepEqual(manifest.layers.temperatureDay.legend, manifest.layers.temperatureNight.legend);
assert.equal(manifest.layers.temperatureDay.legend[0].celsius, -73.15);
assert.equal(manifest.layers.temperatureDay.legend.at(-1).celsius, 76.85);
console.log(
  'Earth observation: source checksums, 304632 records, exact commodity filters, spatial aggregation, scene disposal, actual ETOPO coordinates/bathymetry and temperature units passed.'
);
