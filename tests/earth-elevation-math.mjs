import assert from 'node:assert/strict';
import {
  ELEVATION_EARTH_RADIUS_KM,
  elevationTile,
  elevationBaseMesh,
  elevationTileMesh,
  sampleElevationBase,
  sampleElevationMesh,
  planElevationTiles,
} from '../src/earth-elevation-math.js';

const R = ELEVATION_EARTH_RADIUS_KM;
const DEG = Math.PI / 180;
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => a.map((value) => value / Math.hypot(...a));
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const point = (longitude, latitude, radius = R) => [
  radius * Math.cos(longitude * DEG) * Math.cos(latitude * DEG),
  radius * Math.sin(longitude * DEG) * Math.cos(latitude * DEG),
  radius * Math.sin(latitude * DEG),
];
const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
};
const closeVector = (actual, expected, tolerance = 1e-9) =>
  expected.forEach((value, i) => close(actual[i], value, tolerance));
const vertex = (mesh, index, attribute = 'positions') =>
  [...mesh[attribute].subarray(index * 3, index * 3 + 3)].map(
    (value, axis) => value + mesh.origin[axis]
  );
const memory = (mesh) =>
  [...new Set(Object.values(mesh).filter(ArrayBuffer.isView))].reduce(
    (bytes, value) => bytes + value.byteLength,
    0
  );

function camera(longitude, latitude, fovY = 1, target = [longitude, latitude], altitude = 400) {
  const eyeKm = point(longitude, latitude, R + altitude);
  const forward = unit(subtract(point(...target), eyeKm));
  const right = unit(cross(forward, [0, 0, 1]));
  return {
    eyeKm,
    forward,
    right,
    up: unit(cross(right, forward)),
    fovY,
    width: 1600,
    height: 1000,
    aspect: 1.6,
  };
}

// Fixed geographic fixtures independently specify north-up rows, the 2:1 root
// arrangement, UV handedness, and the date-line wrap.
assert.deepEqual(elevationTile(0, 0, 0).bounds, [-180, -90, 0, 90]);
assert.deepEqual(elevationTile(0, 1, 0).bounds, [0, -90, 180, 90]);
assert.deepEqual(elevationTile(1, 2, 0).bounds, [0, 0, 90, 90]);
assert.deepEqual(elevationTile(1, 2, 0).rect, [0.5, 0.5, 0.25, 0.5]);
assert.equal(elevationTile(7, -1, 40).key, '7/255/40');
assert.equal(elevationTile(7, 256, 40).key, '7/0/40');
assert.throws(() => elevationTile(13, 0, 0), /level/);
assert.throws(() => elevationTile(7, 0, 128), /coordinates/);

const northUp = elevationBaseMesh(new Float32Array([100, 100, 100, 100, 200, 200, 200, 200]), {
  width: 4,
  height: 2,
  columns: 8,
  rows: 4,
});
close(sampleElevationBase(northUp, -135, 45).sourceHeightMeters, 100);
close(sampleElevationBase(northUp, -135, -45).sourceHeightMeters, 200);
close(sampleElevationBase(northUp, 0, 0).sourceHeightMeters, 150);
closeVector(vertex(northUp, 0), [0, 0, R + 0.1], 0.0003);
closeVector(vertex(northUp, 4 * 9), [0, 0, -R - 0.2], 0.0003);
for (let y = 0; y <= northUp.rows; y++) {
  assert.deepEqual(vertex(northUp, y * 9), vertex(northUp, y * 9 + 8));
}
for (const x of [0, 1, 4, 8]) {
  assert.deepEqual(vertex(northUp, x), vertex(northUp, 0));
  assert.deepEqual(vertex(northUp, 4 * 9 + x), vertex(northUp, 4 * 9));
}
const depression = elevationBaseMesh(new Float32Array(8).fill(-430), {
  width: 4,
  height: 2,
  columns: 8,
  rows: 4,
});
close(sampleElevationBase(depression, 0, 0).sourceHeightMeters, -430);
close(Math.hypot(...sampleElevationBase(depression, 0, 0).position), R - 0.43, 0.0003);

// Hand-authored, non-coplanar four vertices distinguish the NE-SW triangles
// from bilinear height interpolation and from the opposite diagonal.
const manual = {
  bounds: [0, 0, 1, 1],
  columns: 1,
  rows: 1,
  radiusKm: R,
  origin: [100, 200, 300],
  positions: new Float32Array([10, 0, 0, 10, 2, 0, 10, 0, -2, 11, 2, -2]),
  normals: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0]),
};
closeVector(sampleElevationMesh(manual, 0.25, 0.8).position, [110, 200.5, 299.6]);
closeVector(sampleElevationMesh(manual, 0.75, 0.2).position, [110.55, 201.5, 298.4]);
assert.equal(sampleElevationMesh(manual, 2, 0.5), null);
assert.equal(sampleElevationMesh(manual, 0.5, -0.1), null);

const base = elevationBaseMesh(new Float32Array(32), {
  width: 8,
  height: 4,
  columns: 512,
  rows: 256,
});
const sample = sampleElevationBase(base, 116.4, 40);
assert.ok(sample.heightMeters < -100 && sample.heightMeters > -150, 'Keep the coarse chord sag');
close(sample.sourceHeightMeters, 0);
assert.equal(
  base.basePositions,
  base.positions,
  'The base transition must not double its allocation'
);

const tile = elevationTile(7, 210, 35);
const mesh = elevationTileMesh(tile, new Float32Array(129 * 129).fill(1000), { base });
assert.equal(mesh.bodyVertexCount, 129 * 129);
assert.equal(mesh.skirtVertexCount, 128 * 4);
assert.equal(mesh.positions.length, (129 * 129 + 128 * 4) * 3);
assert.equal(mesh.indices.length, 128 * 128 * 6 + 128 * 4 * 6);
assert.ok(mesh.indices instanceof Uint16Array);
assert.ok(memory(mesh) < 1.25 * 1024 * 1024);
assert.ok(memory(base) + memory(mesh) * 24 < 48 * 1024 * 1024);
assert.ok(mesh.indices.every((index) => index < mesh.positions.length / 3));
assert.ok(mesh.positions.every(Number.isFinite));
assert.ok(mesh.normals.every(Number.isFinite));
close(Math.hypot(...vertex(mesh, 64 * 129 + 64)), R + 1, 0.00001);
for (const [x, y] of [
  [0, 0],
  [64, 0],
  [128, 0],
  [0, 64],
  [128, 64],
  [64, 128],
]) {
  const longitude = tile.bounds[0] + ((tile.bounds[2] - tile.bounds[0]) * x) / 128;
  const latitude = tile.bounds[3] - ((tile.bounds[3] - tile.bounds[1]) * y) / 128;
  const foundation = sampleElevationBase(base, longitude, latitude).position;
  closeVector(vertex(mesh, y * 129 + x), foundation, 0.000008);
  closeVector(vertex(mesh, y * 129 + x, 'basePositions'), foundation, 0.000008);
}
closeVector([...mesh.uv.subarray(0, 2)], [tile.rect[0], tile.rect[1] + tile.rect[3]]);
closeVector(
  [...mesh.uv.subarray((129 * 129 - 1) * 2, 129 * 129 * 2)],
  [tile.rect[0] + tile.rect[2], tile.rect[1]]
);
const skirtTop = vertex(mesh, 0);
const skirtBottom = vertex(mesh, mesh.bodyVertexCount);
close(Math.hypot(...subtract(skirtTop, skirtBottom)), 0.1, 0.00001);

// Winding is checked geometrically, rather than by mirroring the index helper.
for (const triangle of [0, 1000, 10000]) {
  const ids = mesh.indices.subarray(triangle * 3, triangle * 3 + 3);
  const a = vertex(mesh, ids[0]);
  const b = vertex(mesh, ids[1]);
  const c = vertex(mesh, ids[2]);
  assert.ok(dot(cross(subtract(b, a), subtract(c, a)), a) > 0, 'Terrain must face outwards');
}

const noData = elevationTileMesh(tile, new Float32Array(129 * 129).fill(NaN), { base });
assert.deepEqual(
  noData.positions,
  noData.basePositions,
  'Missing data stays on the exact global mesh'
);
const transition = elevationTileMesh(tile, new Float32Array(9 * 9).fill(1000), {
  base,
  gridSize: 9,
  baseSample(longitude, latitude) {
    const sampled = sampleElevationBase(base, longitude, latitude);
    return { ...sampled, position: sampled.position.map((value) => value * (1 + 0.5 / R)) };
  },
});
assert.ok(
  Math.hypot(...subtract(vertex(transition, 0, 'basePositions'), vertex(transition, 0))) > 0.49
);
closeVector(
  vertex(transition, 0),
  sampleElevationBase(base, tile.bounds[0], tile.bounds[3]).position,
  0.000008
);

function attachNeighbours(tiles) {
  const keys = new Set(tiles.map((record) => record.key));
  for (const record of tiles) {
    const has = (dx, dy) => keys.has(elevationTile(record.z, record.x + dx, record.y + dy).key);
    record.edgeNeighbours = [has(-1, 0), has(1, 0), has(0, 1), has(0, -1)];
    record.cornerNeighbours = [has(-1, -1), has(1, -1), has(-1, 1), has(1, 1)];
  }
  return tiles;
}
const joined = attachNeighbours([elevationTile(7, 210, 35), elevationTile(7, 211, 35)]).map(
  (record) => elevationTileMesh(record, new Float32Array(129 * 129).fill(1000), { base })
);
for (let y = 0; y < 129; y++) {
  closeVector(vertex(joined[0], y * 129 + 128), vertex(joined[1], y * 129), 0.000008);
}
close(Math.hypot(...vertex(joined[0], 64 * 129 + 128)), R + 1, 0.000008);
close(Math.hypot(...vertex(joined[1], 64 * 129)), R + 1, 0.000008);

// A three-tile L leaves an exposed concave corner. Cardinal neighbours alone
// cannot determine it: all three coincident vertices must meet the coarse base.
const lShape = attachNeighbours([
  elevationTile(7, 210, 35),
  elevationTile(7, 211, 35),
  elevationTile(7, 211, 34),
]).map((record) => elevationTileMesh(record, new Float32Array(129 * 129).fill(1000), { base }));
closeVector(vertex(lShape[0], 128), vertex(lShape[1], 0), 0.000008);
closeVector(vertex(lShape[1], 0), vertex(lShape[2], 128 * 129), 0.000008);

// A flat hand-coded eastward slope must tilt the surface normal westwards;
// a radial-only lighting normal would pass height tests but fail this one.
const slopeHeights = Float32Array.from({ length: 129 * 129 }, (_, index) => (index % 129) * 20);
const slope = elevationTileMesh(elevationTile(7, 128, 64), slopeHeights, {
  base,
  edgeNeighbours: [true, true, true, true],
  cornerNeighbours: [true, true, true, true],
});
const midIndex = (64 * 129 + 64) * 3;
const slopeNormal = [...slope.normals.subarray(midIndex, midIndex + 3)];
const radial = [...slope.radials.subarray(midIndex, midIndex + 3)];
assert.ok(dot(slopeNormal, radial) < 0.99995 && dot(slopeNormal, radial) > 0.99);
const east = [-Math.sin(0.703125 * DEG), Math.cos(0.703125 * DEG), 0];
assert.ok(dot(slopeNormal, east) < -0.01);

// Independently intersect a dense screen grid with several physical altitude
// shells. Every hit must be covered by a requested tile, including seam/limb
// cases and both corners between the planner's sparse density-sampling rays.
function assertCompleteCover(view, plan, samples = 33) {
  assert.ok(plan.tiles.length > 0, `Expected local terrain, received ${plan.reason}`);
  const keys = new Set(plan.tiles.map((record) => record.key));
  assert.equal(keys.size, plan.tiles.length);
  assert.ok(plan.tiles.length <= 12);
  assert.ok(plan.tiles.every((record) => record.z === plan.level));
  const tanY = Math.tan((view.fovY * DEG) / 2);
  const tanX = tanY * view.aspect;
  let checked = 0;
  for (const altitude of [-0.5, 0, 8.8]) {
    for (let sy = 0; sy < samples; sy++) {
      for (let sx = 0; sx < samples; sx++) {
        const u = (2 * sx) / (samples - 1) - 1;
        const v = (2 * sy) / (samples - 1) - 1;
        const ray = unit(
          view.forward.map((value, i) => value + u * tanX * view.right[i] + v * tanY * view.up[i])
        );
        const along = dot(view.eyeKm, ray);
        const discriminant = along * along - dot(view.eyeKm, view.eyeKm) + (R + altitude) ** 2;
        if (discriminant < 0) continue;
        const distance = -along - Math.sqrt(discriminant);
        if (distance <= 0) continue;
        const hit = view.eyeKm.map((value, i) => value + ray[i] * distance);
        const longitude = Math.atan2(hit[1], hit[0]) / DEG;
        const latitude = Math.asin(hit[2] / Math.hypot(...hit)) / DEG;
        const rows = 2 ** plan.level;
        const x = Math.floor(((longitude + 180) / 360) * rows * 2) % (rows * 2);
        const y = Math.min(rows - 1, Math.floor(((90 - latitude) / 180) * rows));
        assert.ok(
          keys.has(`${plan.level}/${x}/${y}`),
          `Missing ${longitude},${latitude} at ${altitude} km`
        );
        checked++;
      }
    }
  }
  assert.ok(checked > 0);
  return checked;
}
let rayHits = 0;
for (const view of [
  camera(116.4, 40, 0.006),
  camera(116.4, 40, 1),
  camera(-122.33, 47.6, 0.3),
  camera(179.999, 0, 0.1),
  camera(-179.999, -35, 0.5),
  camera(0, 0, 0.1, [12, 0]),
  camera(0, 0, 0.1, [14, 0]),
]) {
  const plan = planElevationTiles(view);
  rayHits += assertCompleteCover(view, plan);
}
// A source with bathymetry replaced by sea level can use the tighter physical
// land envelope without losing even an Everest-height ridge above the limb.
for (const longitude of [17, 19.6]) {
  const view = camera(0, 0, 0.1, [longitude, 0]);
  const plan = planElevationTiles(view, { minHeightMeters: -500, maxHeightMeters: 9000 });
  rayHits += assertCompleteCover(view, plan);
}
assert.equal(planElevationTiles(camera(0, 0, 0.1, [19.6, 0])).reason, 'global-base');
const seam = planElevationTiles(camera(179.999, 0, 0.1));
assert.ok(seam.tiles.some((record) => record.x === 0));
assert.ok(seam.tiles.some((record) => record.x === 2 ** (seam.level + 1) - 1));
const downgraded = planElevationTiles(camera(116.4, 40, 3));
assert.ok(downgraded.level < downgraded.requestedLevel);
rayHits += assertCompleteCover(camera(116.4, 40, 3), downgraded);
assert.equal(planElevationTiles(camera(116.4, 40, 60)).reason, 'global-base');
assert.equal(planElevationTiles(camera(0, 89, 0.01)).reason, 'polar-base');
const away = camera(116.4, 40, 10);
away.forward = away.forward.map((value) => -value);
assert.equal(planElevationTiles(away).reason, 'outside-earth');
assert.equal(planElevationTiles({ ...away, fovY: 0 }).reason, 'invalid-view');
assert.throws(() => planElevationTiles(away, { maxTiles: 0 }), /limits/);
assert.throws(
  () => elevationTileMesh(tile, new Float32Array(128 * 128), { base, gridSize: 128 }),
  /grid/
);

console.log(
  `Elevation math: geographic fixtures, triangle/height/normal/skirt seams, ${rayHits} independent ray hits and bounded LOD passed.`
);
