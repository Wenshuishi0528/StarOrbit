import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { Vector3 } from 'three';
import {
  decodeLunarTerrain,
  lunarSurfaceDirection,
  sampleLunarHeightKm,
  lunarTerrainGeometry,
  LUNAR_REFERENCE_RADIUS_KM as R,
} from '../src/lunar-terrain.js';
import { lunarSunVisibility, lunarCoreSunVisibility } from '../src/lunar-renderer.js';

const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const manifest = JSON.parse(
  readFileSync(new URL('../assets/moon/terrain-manifest.json', import.meta.url))
);
const packed = readFileSync(new URL('../assets/moon/lola-720x360.i16.gz', import.meta.url));
assert.equal(packed.length, manifest.bytes);
assert.equal(createHash('sha256').update(packed).digest('hex'), manifest.sha256);
const unpacked = gunzipSync(packed);
assert.equal(unpacked.byteLength, manifest.unpackedBytes);
const buffer = unpacked.buffer.slice(
  unpacked.byteOffset,
  unpacked.byteOffset + unpacked.byteLength
);
const data = decodeLunarTerrain(buffer, manifest);
assert.equal(data.values.length, 720 * 360);
let minimum = Infinity,
  maximum = -Infinity;
for (const n of data.values) {
  minimum = Math.min(minimum, n);
  maximum = Math.max(maximum, n);
}
assert.equal(minimum * 0.5, manifest.minMeters);
assert.equal(maximum * 0.5, manifest.maxMeters);
assert.throws(() => decodeLunarTerrain(buffer.slice(0, -2), manifest), /Invalid lunar DEM/);
assert.throws(
  () => decodeLunarTerrain(buffer, { ...manifest, scaleMeters: 1 }),
  /Invalid lunar DEM/
);

// Exact pixel centres prove north-to-south registration and east-positive orientation.
for (const [x, y] of [
  [0, 0],
  [173, 91],
  [359, 179],
  [719, 359],
]) {
  const lon = ((x + 0.5) * 360) / data.width - 180,
    lat = 90 - ((y + 0.5) * 180) / data.height;
  near(sampleLunarHeightKm(data, lon, lat), data.values[y * data.width + x] * 0.0005);
}
for (const lat of [-89, -45, 0, 45, 89])
  near(sampleLunarHeightKm(data, -180, lat), sampleLunarHeightKm(data, 180, lat));
for (const lat of [-90, 90])
  near(sampleLunarHeightKm(data, -143, lat), sampleLunarHeightKm(data, 61, lat));
for (const [lon, lat, want] of [
  [0, 0, [1, 0, 0]],
  [90, 0, [0, 1, 0]],
  [0, 90, [0, 0, 1]],
  [180, 0, [-1, 0, 0]],
]) {
  lunarSurfaceDirection(lon, lat).forEach((v, i) => near(v, want[i]));
}

// The shipped mesh uses measured relief, outward triangles and a closed smooth UV seam.
const geometry = lunarTerrainGeometry(data),
  amplified = lunarTerrainGeometry(data, 8, 72, 36);
assert.equal(geometry.attributes.position.count, 721 * 361);
assert.equal(geometry.index.count / 3, 516960);
const position = geometry.attributes.position,
  uv = geometry.attributes.uv,
  normal = geometry.attributes.normal;
const va = new Vector3(),
  vb = new Vector3(),
  vc = new Vector3();
for (let row = 0; row <= 360; row += 15) {
  const first = row * 721,
    last = first + 720;
  va.fromBufferAttribute(position, first);
  vb.fromBufferAttribute(position, last);
  near(va.distanceTo(vb), 0, 1e-6);
  va.fromBufferAttribute(normal, first);
  vb.fromBufferAttribute(normal, last);
  near(va.distanceTo(vb), 0, 1e-6);
  near(uv.getX(first), 0);
  near(uv.getX(last), 1);
  near(uv.getY(first), 1 - row / 360);
}
for (let i = 0; i < geometry.index.count; i += 1113) {
  const idx = i - (i % 3);
  va.fromBufferAttribute(position, geometry.index.getX(idx));
  vb.fromBufferAttribute(position, geometry.index.getX(idx + 1));
  vc.fromBufferAttribute(position, geometry.index.getX(idx + 2));
  assert.ok(vb.sub(va).cross(vc.sub(va)).dot(va) > 0, 'triangle must face outward');
}
for (let i = 0; i < amplified.attributes.position.count; i += 37) {
  const height = amplified.attributes.elevationKm.getX(i);
  near(
    va.fromBufferAttribute(amplified.attributes.position, i).length(),
    1 + (8 * height) / R,
    1e-7
  );
}
geometry.dispose();
amplified.dispose();

// Finite solar disc: absent, total, partial, and annular occultations.
const origin = [0, 0, 0],
  sun = [149600000, 0, 0],
  earthDistance = 384400;
near(lunarSunVisibility(origin, sun, [-earthDistance, 0, 0]), 1);
near(lunarSunVisibility(origin, sun, [earthDistance, 0, 0]), 0);
const a = Math.asin(695700 / sun[0]),
  b = Math.asin(6371 / earthDistance);
const visibilityAt = (angle) =>
  lunarSunVisibility(origin, sun, [
    earthDistance * Math.cos(angle),
    earthDistance * Math.sin(angle),
    0,
  ]);
near(visibilityAt(b - a - 1e-5), 0);
near(visibilityAt(a + b + 1e-5), 1);
const partial = visibilityAt(b);
assert.ok(partial > 0.4 && partial < 0.6);
assert.ok(visibilityAt(b - 0.001) < partial && visibilityAt(b + 0.001) > partial);
const annular = lunarSunVisibility(origin, sun, [2000000, 0, 0]);
near(annular, 1 - (Math.asin(6371 / 2000000) / a) ** 2);
// A surface point changes eclipse geometry: centre-only masking is insufficient.
assert.ok(
  Math.abs(
    lunarSunVisibility([0, R, 0], sun, [
      earthDistance * Math.cos(b),
      earthDistance * Math.sin(b),
      0,
    ]) - partial
  ) > 0.1
);
console.log(
  'lunar-terrain: pinned real DEM, units, orientation, seams, relief, outward geometry and finite-disc eclipses passed'
);

// Solid Moon blocks sunlight even if a steep surface normal faces the Sun.
const coreRadius = R + manifest.minMeters / 1000 - 0.2;
near(lunarCoreSunVisibility([R, 0, 0], sun, coreRadius), 1);
near(lunarCoreSunVisibility([-R, 0, 0], sun, coreRadius), 0);
const point = [R, 0, 0];
const dip = Math.acos(coreRadius / R);
const localSunAt = (altitude) => [
  R + 149600000 * Math.sin(altitude),
  149600000 * Math.cos(altitude),
  0,
];
near(lunarCoreSunVisibility(point, localSunAt(-dip), coreRadius), 0.5, 1e-10);
near(lunarCoreSunVisibility(point, localSunAt(-dip - 0.01), coreRadius), 0);
near(lunarCoreSunVisibility(point, localSunAt(-dip + 0.01), coreRadius), 1);
assert.ok(lunarCoreSunVisibility(point, localSunAt(-dip - 0.001), coreRadius) < 0.5);
assert.ok(lunarCoreSunVisibility(point, localSunAt(-dip + 0.001), coreRadius) > 0.5);
// A peak outside the geometric day hemisphere can legitimately see over the core.
assert.ok(lunarCoreSunVisibility(point, localSunAt(-dip / 2), coreRadius) > 0.99);
console.log('lunar-terrain: conservative lunar core and finite solar horizon passed');
