import assert from 'node:assert/strict';
import * as THREE from 'three';
import { elevationBaseMesh, sampleElevationBase } from '../src/earth-elevation-math.js';
import {
  sampleGroundGrid,
  sampleGroundRaster,
  sampleGroundPatch,
  groundTilePlan,
  groundDestination,
  buildGroundPatch,
  createGroundSurface,
} from '../src/ground-world-surface.js';

const grid = {
  bounds: [-1, -1, 1, 1],
  gridSize: 2,
  heights: new Float32Array([100, 200, 300, 400]),
};
assert.equal(sampleGroundGrid(grid, 1, -1), 100);
assert.equal(sampleGroundGrid(grid, 0, 0), 250);
assert.equal(sampleGroundGrid(grid, 0, 360), 250);
assert.equal(sampleGroundGrid(grid, 5, 0), null);
assert.equal(
  sampleGroundGrid({ ...grid, heights: new Float32Array([NaN, 200, 300, 400]) }, 1, 1),
  200
);
assert.equal(
  sampleGroundGrid({ ...grid, heights: new Float32Array([NaN, 200, 300, 400]) }, 0.9, -0.9),
  null
);
for (const site of [
  { latitude: 0, longitude: 179.999 },
  { latitude: 89.999, longitude: 0 },
  { latitude: -89.999, longitude: -180 },
  { latitude: 39.9, longitude: 116.4 },
]) {
  const plan = groundTilePlan(site);
  assert.ok(plan.length <= 332);
  assert.equal(plan.length === 0, Math.abs(site.latitude) > 80);
  assert.equal(new Set(plan.map((t) => t.key)).size, plan.length);
  assert.ok(
    plan.every(
      (t) => t.bounds[0] >= -180 && t.bounds[2] <= 180 && t.bounds[1] >= -90 && t.bounds[3] <= 90
    )
  );
  const dest = groundDestination(site, 5000, 3000);
  assert.ok(Number.isFinite(dest.latitude + dest.longitude));
  assert.ok(Math.abs(dest.longitude) <= 180);
  const p = buildGroundPatch(site, () => 120, { segments: 8, halfSize: 2000 });
  assert.equal(p.positions.length, 9 * 9 * 3);
  assert.ok(p.positions.every(Number.isFinite));
  assert.ok(Math.abs(p.positions[(4 * 9 + 4) * 3 + 2] - 120) < 0.001);
  // Curved WGS84 ground drops below its tangent plane away from the observer.
  assert.ok(p.positions[2] < 120 - 0.3);
  const i = p.indices;
  const a = new THREE.Vector3(...p.positions.slice(i[0] * 3, i[0] * 3 + 3));
  const b = new THREE.Vector3(...p.positions.slice(i[1] * 3, i[1] * 3 + 3));
  const c = new THREE.Vector3(...p.positions.slice(i[2] * 3, i[2] * 3 + 3));
  assert.ok(b.sub(a).cross(c.sub(a)).z > 0);
}
// Contact reads the original measured raster, independent of displayed mesh sag.
const { default: fs } = await import('node:fs'),
  { default: zlib } = await import('node:zlib');
const bytes = zlib.gunzipSync(fs.readFileSync('assets/earth/elevation/base-surface-i16.bin.gz'));
const raw = {
  rasterHeights: new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2),
  rasterWidth: 2048,
  rasterHeight: 1024,
};
const beijing = sampleGroundRaster(raw, 39.90742, 116.40463);
assert(
  beijing > 0 && beijing < 150,
  'Beijing original global raster is not an artificial 894m mountain'
);
let requested = [],
  released = false;
const environment = {
  elevation: {
    base: {
      ...elevationBaseMesh(raw.rasterHeights, {
        width: 2048,
        height: 1024,
        columns: 512,
        rows: 256,
      }),
      ...raw,
    },
    revision: 1,
    entries: new Map(),
    pending: new Map(),
    setSamplingTiles(id, tiles) {
      requested = tiles;
    },
    release() {
      released = true;
    },
  },
};
const scene = new THREE.Scene(),
  surface = createGroundSurface({ environment, scene });
const site = { latitude: 39.90742, longitude: 116.40463, height: 50 };
surface.update(site);
await surface.whenReady();
surface.update(site);
assert.equal(surface.heightAt(site.latitude, site.longitude), beijing);
assert(requested.length > 34 && requested.length <= 332);
assert(surface.getPatch());
const patch = surface.getPatch().data;
assert.equal(patch.sphereRadius, 6371000);
assert(
  Math.abs(Math.hypot(...patch.frame.origin) - 6371000) < 1e-5,
  'local terrain uses the same sphere as shared globe rendering'
);
assert.equal(patch.segments, 256);
assert.equal(surface.getPatch().surround.data.halfSize, 160000);
assert.equal(surface.getPatch().surround.data.segments, 768);
assert(surface.getPatch().surround.data.positions.every(Number.isFinite));
const regional = surface.getPatch().surround.data;
for (const index of [0, 384, 768, 768 * 769, 769 * 769 - 1]) {
  const local = regional.positions.slice(index * 3, index * 3 + 3),
    frame = regional.frame;
  const absolute = frame.origin.map(
    (v, k) => v + local[0] * frame.east[k] + local[1] * frame.north[k] + local[2] * frame.up[k]
  );
  const geo = groundDestination(
    site,
    regional.gridDistances[index % 769],
    regional.gridDistances[Math.floor(index / 769)]
  );
  const displayed = sampleElevationBase(
    environment.elevation.base,
    geo.longitude,
    geo.latitude
  ).heightMeters;
  assert(
    Math.abs(Math.hypot(...absolute) - 6371000 - displayed) < 0.02,
    'surrounding terrain edge meets actual globe mesh without a cliff'
  );
}
for (const index of [0, 128, 256, 256 * 257, 257 * 257 - 1]) {
  const fine = surface.getPatch().data;
  const geo = groundDestination(
    site,
    (((index % 257) / 256) * 2 - 1) * 4096,
    ((Math.floor(index / 257) / 256) * 2 - 1) * 4096
  );
  const expected = sampleGroundPatch(regional, site, geo.latitude, geo.longitude);
  const local = fine.positions.slice(index * 3, index * 3 + 3),
    f = fine.frame;
  const absolute = f.origin.map(
    (v, k) => v + local[0] * f.east[k] + local[1] * f.north[k] + local[2] * f.up[k]
  );
  assert(
    Math.abs(Math.hypot(...absolute) - 6371000 - expected) < 0.02,
    'contact boundary meets surrounding triangle heights rather than independently sampled DEM'
  );
}
// 5 km altitude widens detailed coverage; settings change the regional mesh
// without dropping the currently displayed mesh while its replacement builds.
const lowPlan = groundTilePlan({...site,height:50},{rangeKm:160});
const highPlan = groundTilePlan({...site,height:5000},{rangeKm:160});
assert(highPlan.filter(t=>t.z===12).length > lowPlan.filter(t=>t.z===12).length);
surface.update({...site,height:5000});
assert.equal(surface.getPatch().data.halfSize,2*(5000-beijing));
environment.settings = {surfaceElevationRangeKm:40};
const previousRegion=surface.getPatch().surround.data;
surface.update({...site,height:5000});
assert.equal(surface.getPatch().surround.data,previousRegion);
await surface.whenReady();
assert.equal(surface.getPatch().surround.data.halfSize,40000);
assert(surface.getPatch().surround.data.gridDistances[385]-surface.getPatch().surround.data.gridDistances[384] < surface.getPatch().surround.data.gridDistances[768]-surface.getPatch().surround.data.gridDistances[767]);
environment.settings.surfaceElevationRangeKm=160;
surface.update({ ...site, height: 100000 });
assert.equal(
  surface.getPatch().data,
  null,
  'contact patch is replaced by continuous surrounding terrain at altitude'
);
assert(
  surface.getPatch().surround,
  'regional terrain persists through the high-altitude transition'
);
assert(requested.every(tile => tile.z < 12), 'only broad terrain is requested above contact range');
surface.update(site);

assert.equal(scene.children[0].children.length, 0, 'no separate diffuse terrain/horizon renderer');
const central = requested.find(
  (tile) =>
    tile.z === 12 &&
    tile.bounds[0] <= site.longitude &&
    tile.bounds[2] >= site.longitude &&
    tile.bounds[1] <= site.latitude &&
    tile.bounds[3] >= site.latitude
);
environment.elevation.entries.set(central.key, {
  tile: central,
  heights: new Float32Array(129 * 129).fill(43),
  valid: 129 * 129,
});
environment.elevation.revision++;
assert.equal(
  surface.heightAt(site.latitude, site.longitude),
  43,
  'measured fine DEM contact wins over coarse display heights'
);
assert(surface.status().detailed);
// Standing 1.7 m above a 5 km plateau must retain ground-level mesh spacing,
// even though sea-level altitude resembles the aircraft test above.
environment.elevation.entries.get(central.key).heights.fill(5000);
environment.elevation.revision++;
surface.update({...site,height:5001.7});
assert.equal(surface.getPatch().data.halfSize,4096);
assert.equal(surface.getPatch().data.halfSize*2/surface.getPatch().data.segments,32);
const plateauPlan=groundTilePlan({...site,height:5001.7},{groundHeightMeters:5000,rangeKm:160});
const seaPlan=groundTilePlan({...site,height:1.7},{groundHeightMeters:0,rangeKm:160});
assert.deepEqual(plateauPlan.map(t=>t.key),seaPlan.map(t=>t.key));
environment.elevation.entries.get(central.key).heights.fill(43);
environment.elevation.revision++;

const moved = { ...site, longitude: site.longitude + 0.1 };
surface.update(moved);
const stale = surface.whenReady();
surface.update({ ...moved, longitude: moved.longitude + 0.1 });
await Promise.all([stale, surface.whenReady()]);
assert.equal(
  surface.getPatch().surround.site.longitude,
  moved.longitude + 0.1,
  'an obsolete moving-site build cannot replace the current terrain'
);
surface.update({ ...site, height: 400000 });
assert.equal(surface.getPatch(), null);
assert.equal(requested.length, 0, 'orbital view releases close-up sampling demand');
surface.update(site);
const pending = surface.whenReady();
surface.dispose();
await pending;
assert.equal(surface.getPatch(), null, 'disposed async terrain build cannot resurrect a patch');
assert(released);
assert.equal(scene.children.length, 0);
console.log(
  'Ground surface: original raster, shared DEM scheduling, same-radius local patch, precise contact and altitude LOD passed',
  { beijing }
);
