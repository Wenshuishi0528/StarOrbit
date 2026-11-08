import assert from 'node:assert/strict';
import { Observer, Equator, Horizon } from 'astronomy-engine';
import { build } from 'esbuild';
const bundle = await build({
  stdin: { contents: "export * from './src/ground-world-sky.js'", resolveDir: process.cwd() },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { groundCelestialFrame, groundEarthOccluder, groundRayBlocked, groundSkyLight } =
  await import(
    'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
  );
import { solarApparent } from '../src/solar-system.js';
import { dot, norm } from '../src/orbit.js';
const DEG = Math.PI / 180;
const sites = [
  { latitude: 39.9042, longitude: 116.4074, height: 52 },
  { latitude: -33.8688, longitude: 151.2093, height: 50 },
  { latitude: 69.65, longitude: 18.96, height: 200 },
  { latitude: 0, longitude: 179.99, height: 100000 },
];
for (const site of sites)
  for (const date of ['2026-06-21T04:00:00Z', '2026-12-21T16:00:00Z', '1900-03-20T00:00:00Z']) {
    const time = Date.parse(date),
      frame = groundCelestialFrame(site, time);
    assert.ok(frame.eye.every(Number.isFinite));
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        assert.ok(Math.abs(dot(frame.basis[i], frame.basis[j]) - (i === j ? 1 : 0)) < 1e-10);
    for (const id of ['Sun', 'Moon']) {
      const body = solarApparent(frame.q, frame.eye).find((b) => b.id === id);
      const local = frame.basis.map((a) => dot(a, body.direction));
      const altitude = Math.asin(local[2]) / DEG;
      const observer = new Observer(site.latitude, site.longitude, site.height);
      const eq = Equator(id, new Date(time), observer, true, false);
      const hz = Horizon(new Date(time), observer, eq.ra, eq.dec);
      assert.ok(
        Math.abs(altitude - hz.altitude) < 0.08,
        `${id} ${date}: ${altitude} vs ${hz.altitude}`
      );
    }
    assert.equal(groundRayBlocked(site, [0, 0, 1]), false);
    assert.equal(groundRayBlocked(site, [0, 0, -1]), true);
    assert.equal(groundRayBlocked(site, [1, 0, 0]), false);
  }
const low = groundCelestialFrame({ ...sites[0], height: 9000 }, 0),
  high = groundCelestialFrame({ ...sites[0], height: 100000 }, 0);
assert.ok(
  Math.abs(norm(high.eye.map((v, i) => v - low.eye[i])) - 91) < 1e-7,
  'real altitude cannot clamp to9km'
);
const basin = { latitude: 31, longitude: 35, height: -400 };
assert.equal(groundRayBlocked(basin, [0, 0, 1]), false);
assert.equal(groundRayBlocked(basin, [0, 0, -1]), true);
assert.ok(groundEarthOccluder(basin).radii[0] < 6378137);
assert.equal(groundSkyLight(30).night, 0);
for (const height of [4500, 8849, 12000, 20000]) {
  assert.equal(
    groundSkyLight(30, -90, 0, height).night,
    0,
    'mountain/aircraft daylight must not reveal a full star field'
  );
  assert.equal(
    groundSkyLight(-20, -90, 0, height).night,
    1,
    'night sky remains visible at altitude'
  );
}
const upperVisibility = [20000, 30000, 50000, 70000, 80000, 100000].map(
  (height) => groundSkyLight(30, -90, 0, height).night
);
assert.ok(upperVisibility.every((value, i) => !i || value >= upperVisibility[i - 1]));
assert.ok(upperVisibility[1] > 0 && upperVisibility[1] < 0.1);
assert.equal(upperVisibility[4], 1);
assert.ok(groundSkyLight(30, -90, 0, 100000).day < 0.00001);
assert.equal(groundSkyLight(30, -90, 0, 6213).airVisibility, 1);
assert.equal(groundSkyLight(30, -90, 0, 100000).airVisibility, 0);
assert.equal(groundSkyLight(-20).night, 1);
assert.ok(groundSkyLight(-20, 80, 1).night < groundSkyLight(-20, -80, 1).night);
assert.ok(groundSkyLight(30, -90, 0, 100000).night > 0.999);
console.log(
  'ground sky: WGS84 height, seasonal Sun/Moon horizon cross-check, orthonormal frames, Earth occlusion and daylight passed'
);
