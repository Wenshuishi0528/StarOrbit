import assert from 'node:assert/strict';
import {
  hipsDirection,
  hipsMaxPixelRadius,
  hipsOrderForView,
  hipsParent,
  hipsPixel,
  hipsTileMesh,
  hipsTileUrl,
  selectHipsTiles,
} from '../src/sky-detail-math.js';

const radians = Math.PI / 180;
const direction = (ra, dec) => [
  Math.cos(dec * radians) * Math.cos(ra * radians),
  Math.cos(dec * radians) * Math.sin(ra * radians),
  Math.sin(dec * radians),
];
const close = (actual, expected, tolerance = 2e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const sameDirection = (actual, expected, tolerance = 2e-12) =>
  actual.forEach((value, index) => close(value, expected[index], tolerance));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

// Independent fixtures generated with astropy-healpix 1.0.3, HEALPix(order='nested').
// Its dx/dy are HEALPix native x/y, NOT JPEG columns/rows. No Python dependency
// is needed to run these tests. Oracle source: https://github.com/astropy/astropy-healpix
const pixelFixtures = [
  [0, 0, 0, 4, 0.5, 0.5],
  [0, 45, 41.810314895778596, 0, 0.5, 0.5000000000000002],
  [1, 0.000001, 80, 3, 0.5730258089740814, 0.9999999952558423],
  [1, 359.999999, -80, 44, 0.4269741910259186, 4.7441576288246155e-9],
  [3, 359.9999, 0.0001, 304, 1.5830866253452314e-6, 1.936086440057494e-5],
  [3, 0.0001, -0.0001, 271, 0.9999984169133769, 0.9999806391355985],
  [5, 83.633, 22.0145, 6046, 0.7323672108354131, 0.26001165527986103],
  [7, 10.6847083, 41.26875, 10836, 0.5168441862520581, 0.12478502180761097],
  [10, 266.41683, -29.00781, 7380516, 0.8061424573991189, 0.3431664573990929],
  [14, 161.264, -59.6844, 2491454865, 0.19551270717238367, 0.5684655096752067],
  [20, 179.9, 89.999999, 2199023255551, 0.9999750953866169, 0.9776107219513506],
  [24, 359.999, -89.9999, 3096224743818245, 0.8622940795695513, 0.00039847436170423916],
];
for (const [order, ra, dec, pixel, dx, dy] of pixelFixtures) {
  const actual = hipsPixel(order, direction(ra, dec));
  assert.equal(actual.pixel, pixel);
  close(actual.u, dy, 2e-8);
  close(actual.v, dx, 2e-8);
  sameDirection(hipsDirection(order, pixel, actual.u, actual.v), direction(ra, dec));
}

const directionFixtures = [
  [0, 4, 0, 0, 0, -41.810314895778596],
  [0, 4, 1, 0, 45, 0],
  [0, 4, 0, 1, 315, 0],
  [0, 4, 1, 1, 0, 41.810314895778596],
  [0, 0, 0.25, 0.75, 22.5, 41.810314895778596],
  [3, 63, 1, 1, 0, 90],
  [3, 600, 0.123, 0.456, 146.40218878248973, -50.76574224048398],
  [14, 1020033000, 0.1, 0.9, 315.63126087354635, 58.418607458521315],
  [20, 1099511627775, 0.25, 0.75, 22.5, 89.99995538539117],
];
for (const [order, pixel, dx, dy, ra, dec] of directionFixtures) {
  sameDirection(hipsDirection(order, pixel, dy, dx), direction(ra, dec));
}

// Confirm the raster convention independently of the inverse pair: Aladin Lite
// TileUVW maps native x to v and native y to u, and hipspy HipsTile.children gives
// JPEG quadrants [0, 2; 1, 3]. A normal JPG/AVIF upload therefore uses flipY=false.
for (let child = 0; child < 4; child++) {
  const u = (Math.floor(child / 2) + 0.5) / 2;
  const v = ((child % 2) + 0.5) / 2;
  sameDirection(hipsDirection(0, 4, u, v), hipsDirection(1, 16 + child));
}

// Nested subcells meet exactly: check all faces at both sides of the cap boundary.
for (const order of [0, 1, 3, 14]) {
  for (const face of [0, 1, 3, 4, 7, 8, 11]) {
    const parent = face * 4 ** order + Math.floor(4 ** order / 3);
    for (let child = 0; child < 4; child++) {
      const pixel = parent * 4 + child;
      assert.deepEqual(hipsParent(order + 1, pixel), { order, pixel: parent });
      for (const u of [0, 0.123, 0.5, 1]) {
        for (const v of [0, 0.456, 1]) {
          sameDirection(
            hipsDirection(order + 1, pixel, u, v),
            hipsDirection(order, parent, (Math.floor(child / 2) + u) / 2, ((child % 2) + v) / 2)
          );
        }
      }
    }
  }
}

// All twelve face edges share identical curved boundary samples with a neighbor;
// count spatial positions instead of relying on one face's inverse projection.
const boundaries = new Map();
for (let face = 0; face < 12; face++) {
  for (let step = 0; step <= 8; step++) {
    const t = step / 8;
    for (const [u, v] of [
      [0, t],
      [1, t],
      [t, 0],
      [t, 1],
    ]) {
      const point = hipsDirection(0, face, u, v);
      const key = point.map((value) => Math.round(value * 1e11)).join(',');
      if (!boundaries.has(key)) boundaries.set(key, new Set());
      boundaries.get(key).add(face);
    }
  }
}
for (const faces of boundaries.values()) assert.ok(faces.size >= 2);

// Astropy's independent 101×101 gnomonic viewport samples, including RA wrap,
// both poles, the equatorial/polar transition, and a narrow field with >2^31 IDs.
const coverageFixtures = [
  {
    ra: 0,
    dec: 0,
    fov: 12,
    aspect: 1.6,
    order: 3,
    pixels: [269, 270, 271, 280, 282, 283, 292, 293, 295, 304, 305, 306],
  },
  {
    ra: 359.99,
    dec: 89,
    fov: 10,
    aspect: 1.6,
    order: 4,
    pixels: [
      246, 247, 251, 252, 253, 254, 255, 507, 509, 510, 511, 759, 765, 766, 767, 1015, 1017, 1019,
      1020, 1021, 1022, 1023,
    ],
  },
  {
    ra: 180,
    dec: -89,
    fov: 10,
    aspect: 1.6,
    order: 4,
    pixels: [
      2048, 2049, 2050, 2052, 2304, 2305, 2306, 2307, 2308, 2312, 2313, 2560, 2561, 2562, 2563,
      2564, 2566, 2568, 2816, 2817, 2818, 2824,
    ],
  },
  {
    ra: 45,
    dec: 41.810314895778596,
    fov: 15,
    aspect: 1.4,
    order: 3,
    pixels: [13, 14, 15, 24, 25, 26, 27, 36, 37, 38, 39, 48, 49, 50],
  },
  {
    ra: 161.264,
    dec: -59.6844,
    fov: 0.006,
    aspect: 1.6,
    order: 14,
    pixels: [
      2491454778, 2491454779, 2491454782, 2491454783, 2491454853, 2491454855, 2491454864,
      2491454865, 2491454866, 2491454867, 2491454868,
    ],
  },
];
for (const fixture of coverageFixtures) {
  const forward = direction(fixture.ra, fixture.dec);
  const right = direction(fixture.ra + 90, 0);
  const up = cross(forward, right);
  const result = selectHipsTiles({
    forward,
    right,
    up,
    fovY: fixture.fov,
    aspect: fixture.aspect,
    order: fixture.order,
    maxTiles: 100,
  });
  assert.equal(result.order, fixture.order);
  assert.equal(result.budgetExceeded, false);
  const pixels = new Set(result.tiles.map((tile) => tile.pixel));
  fixture.pixels.forEach((pixel) => assert.ok(pixels.has(pixel), `missing oracle pixel ${pixel}`));
  assert.equal(result.tiles[0].pixel, hipsPixel(result.order, forward).pixel);
}

const view = { forward: [1, 0, 0], right: [0, 1, 0], up: [0, 0, 1], fovY: 50, aspect: 1.8 };
const reduced = selectHipsTiles({ ...view, order: 9, maxTiles: 16 });
assert.ok(reduced.order < reduced.requestedOrder);
assert.ok(reduced.tiles.length > 0 && reduced.tiles.length <= 16);
for (let x = -10; x <= 10; x++) {
  for (let y = -10; y <= 10; y++) {
    const tangent = Math.tan((view.fovY * radians) / 2);
    const pixel = hipsPixel(reduced.order, [
      1,
      (x / 10) * tangent * view.aspect,
      (y / 10) * tangent,
    ]).pixel;
    assert.ok(
      reduced.tiles.some((tile) => tile.pixel === pixel),
      'budget must reduce LOD, not leave holes'
    );
  }
}
const unavailable = selectHipsTiles({ ...view, minOrder: 6, maxTiles: 12 });
assert.equal(unavailable.budgetExceeded, true);
assert.deepEqual(unavailable.tiles, []);
assert.ok(hipsOrderForView(0.006, 2400) > hipsOrderForView(2, 800));
assert.ok(hipsOrderForView(2, 2400) > hipsOrderForView(2, 800));
assert.equal(hipsOrderForView(0.006, 2400, { maxOrder: 8 }), 8);

// The conservative spherical bound must include curved edges, not just corners.
for (const order of [0, 1, 3]) {
  const bound = hipsMaxPixelRadius(order);
  for (let pixel = 0; pixel < 12 * 4 ** order; pixel++) {
    const center = hipsDirection(order, pixel);
    for (let step = 0; step <= 8; step++) {
      const t = step / 8;
      for (const [u, v] of [
        [0, t],
        [1, t],
        [t, 0],
        [t, 1],
      ]) {
        const p = hipsDirection(order, pixel, u, v);
        const angle = Math.atan2(Math.hypot(...cross(center, p)), dot(center, p));
        assert.ok(angle <= bound + 1e-12);
      }
    }
  }
}

for (const [order, pixel] of [
  [0, 0],
  [0, 4],
  [3, 63],
  [3, 600],
  [14, 2491454865],
]) {
  const mesh = hipsTileMesh(order, pixel);
  assert.ok(mesh.positions instanceof Float32Array);
  assert.ok(mesh.uvs instanceof Float32Array);
  assert.ok(mesh.indices instanceof Uint16Array);
  assert.equal(mesh.positions.length, 9 * 9 * 3);
  assert.equal(mesh.indices.length, 8 * 8 * 6);
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    sameDirection(
      [...mesh.positions.subarray(i * 3, i * 3 + 3)],
      hipsDirection(order, pixel, mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]),
      4e-8
    );
  }
  // The lowest resolutions exercise curved cap boundaries and pole degeneracy.
  if (order < 10) {
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = [...mesh.indices.subarray(i, i + 3)].map((index) => [
        ...mesh.positions.subarray(index * 3, index * 3 + 3),
      ]);
      const normal = cross(
        b.map((v, j) => v - a[j]),
        c.map((v, j) => v - a[j])
      );
      assert.ok(dot(normal, a) >= -1e-15, 'mesh winding must face outward');
    }
  }
}

assert.equal(
  hipsTileUrl('https://example.test/survey/', 6, 10302),
  'https://example.test/survey/Norder6/Dir10000/Npix10302.jpg'
);
assert.equal(hipsTileUrl('./assets/sky', 0, 4, 'avif'), './assets/sky/Norder0/Dir0/Npix4.avif');
assert.throws(() => hipsPixel(25, [1, 0, 0]), RangeError);
assert.throws(() => hipsPixel(3, [0, 0, 0]), TypeError);
assert.throws(() => hipsDirection(0, 12), RangeError);
assert.throws(() => hipsDirection(0, 4, -0.1), RangeError);
assert.throws(() => hipsOrderForView(180, 700), RangeError);
assert.throws(() => hipsTileMesh(0, 4, 0), RangeError);
console.log(
  'sky-detail-math: astropy reference, image UV, seam/pole coverage, LOD budgets and meshes passed'
);
