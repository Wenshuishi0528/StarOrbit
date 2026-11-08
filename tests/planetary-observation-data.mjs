import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync, inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { MARS_FEATURES, MARS_GEOGRAPHY, MARS_LANDING_SITES } from '../src/mars-catalog.js';
const root = new URL('../', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, root));
const manifest = JSON.parse(read('assets/mars/manifest.json'));
assert.deepEqual(Object.keys(manifest.layers), [
  'visible',
  'dayIR',
  'nightIR',
  'elevation',
  'geology',
]);
assert.deepEqual(manifest.longitudeRange, [-180, 180]);
assert.deepEqual(manifest.latitudeRange, [90, -90]);
for (const asset of [...Object.values(manifest.layers), manifest.terrain]) {
  const bytes = read(asset.url);
  assert.equal(bytes.length, asset.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
}
const size = fs
  .readdirSync(new URL('assets/mars/', root))
  .reduce((n, name) => n + read('assets/mars/' + name).length, 0);
assert.ok(size < 3_000_000, `Mars package exceeds 3 MB: ${size}`);
const dem = manifest.terrain,
  data = gunzipSync(read(dem.url));
assert.equal(data.length, dem.width * dem.height * 2);
assert.equal(dem.encoding, 'int16-le-gzip');
assert.equal(dem.pixelRegistration, 'cell-centre');
const elevation = (lat, lon) =>
  data.readInt16LE(
    2 *
      (Math.floor(((90 - lat) / 180) * dem.height) * dem.width +
        Math.floor(((lon + 180) / 360) * dem.width))
  );
// Distinct independently known high/low landmarks catch 180° offset, east/west
// reversal, row inversion, byte order and accidental km/metre conversion.
assert.ok(elevation(18.65, -133.8) > 18000, 'Olympus summit area must be high');
assert.ok(elevation(-42.43, 70.5) < -6000, 'Hellas floor must be low');
assert.ok(elevation(25.066, 109.925) < -3500, 'Zhurong is in northern lowlands');
assert.ok(elevation(-4.59, 137.44) < -3500, 'Gale landing area is below areoid');
let min = Infinity,
  max = -Infinity;
for (let i = 0; i < data.length; i += 2) {
  const n = data.readInt16LE(i);
  min = Math.min(min, n);
  max = Math.max(max, n);
}
assert.equal(min, dem.minMeters);
assert.equal(max, dem.maxMeters);

// Decode the shipped indexed PNG to verify GIS output, not just metadata.
function indexedPng(buffer) {
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
  let offset = 8,
    width,
    height,
    packed = [];
  while (offset < buffer.length) {
    const n = buffer.readUInt32BE(offset),
      type = buffer.toString('ascii', offset + 4, offset + 8),
      chunk = buffer.subarray(offset + 8, offset + 8 + n);
    offset += n + 12;
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      assert.equal(chunk[8], 8);
      assert.equal(chunk[9], 3);
    }
    if (type === 'IDAT') packed.push(chunk);
  }
  const bytes = inflateSync(Buffer.concat(packed)),
    pixels = new Uint8Array(width * height);
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = bytes[y * (width + 1)];
    for (let x = 0; x < width; x++) {
      const i = y * width + x,
        a = x ? pixels[i - 1] : 0,
        b = y ? pixels[i - width] : 0,
        c = x && y ? pixels[i - width - 1] : 0;
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      assert.ok(Number.isFinite(prediction));
      pixels[i] = (bytes[y * (width + 1) + x + 1] + prediction) & 255;
    }
  }
  return { width, height, pixels };
}
const geology = indexedPng(read(manifest.layers.geology.url));
const legend = JSON.parse(read(manifest.layers.geology.legendUrl)).units;
assert.equal(legend.length, 44);
assert.equal(manifest.geologyPolygonCount, 1311);
const unitAt = (lat, lon) =>
  legend[
    geology.pixels[
      Math.floor(((90 - lat) / 180) * geology.height) * geology.width +
        Math.floor(((lon + 180) / 360) * geology.width)
    ] - 1
  ]?.id;
assert.ok(['Ave', 'AHv', 'Av'].includes(unitAt(18.65, -133.8)), 'Olympus mapped as volcanic');
assert.equal(unitAt(89.9, 0), 'lApc', 'north pole survives GIS reprojection');
assert.equal(unitAt(-89.9, 0), 'lApc', 'south pole survives GIS reprojection');
assert.ok(
  geology.pixels.filter((n) => n === 0).length / geology.pixels.length < 0.001,
  'Unexpected geologic map holes'
);
for (const n of geology.pixels) assert.ok(n >= 0 && n <= 44);
assert.deepEqual(manifest.layers.nightIR.coverageLatitude, [-65, 65]);
assert.equal(manifest.layers.nightIR.noData, 'transparent');
for (const id of ['dayIR', 'nightIR']) {
  const bytes = read(manifest.layers[id].url);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
}
assert.equal(MARS_GEOGRAPHY.length, 34);
assert.equal(MARS_LANDING_SITES.length, 10);
assert.equal(new Set(MARS_FEATURES.map((x) => x.id)).size, MARS_FEATURES.length);
for (const feature of MARS_FEATURES) {
  assert.ok(Math.abs(feature.latitude) <= 90);
  assert.ok(Math.abs(feature.longitude) <= 180);
  assert.ok(feature.source.startsWith('https://'));
  assert.ok(feature.nameEn && feature.nameZh);
}
const zhurong = MARS_LANDING_SITES.find((x) => x.id === 'zhurong');
assert.equal(zhurong.country, 'CN');
assert.equal(zhurong.countryCN, true);
assert.equal(zhurong.longitude, 109.925);
assert.equal(zhurong.latitude, 25.066);
assert.equal(zhurong.landingDateUTC, '2021-05-14');
console.log(
  `Mars data: ${MARS_FEATURES.length} sourced places, 5 maps, valid MOLA orientation, ${size} bytes`
);
