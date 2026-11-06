import assert from 'node:assert/strict';
import {
  CITY_EARTH_RADIUS_KM,
  CITY_TILE_GUTTER,
  CITY_TILE_INNER,
  CITY_TILE_SIZE,
  allCityTiles,
  cityBounds,
  maxLevelFromExtent,
  planCityTiles,
  tileBounds,
  tileUVRect,
} from '../src/city-terrain-math.js';

const DEG = Math.PI / 180;
const R = CITY_EARTH_RADIUS_KM;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (value) => value.map((component) => component / Math.hypot(...value));
const point = ([longitude, latitude], radius = R) => [
  radius * Math.cos(latitude * DEG) * Math.cos(longitude * DEG),
  radius * Math.cos(latitude * DEG) * Math.sin(longitude * DEG),
  radius * Math.sin(latitude * DEG),
];
const close = (actual, expected, epsilon = 2e-12) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
function camera(
  eyeLonLat,
  altitude,
  targetLonLat = eyeLonLat,
  fovY = 1,
  width = 1600,
  height = 1000
) {
  const eyeKm = point(eyeLonLat, R + altitude);
  const forward = unit(subtract(point(targetLonLat), eyeKm));
  const right = unit(cross(forward, [0, 0, 1]));
  return {
    eyeKm,
    forward,
    right,
    up: unit(cross(right, forward)),
    fovY,
    aspect: width / height,
    width,
    height,
  };
}
const city = (id, center, sizeKm = 40, maxLevel = maxLevelFromExtent(sizeKm)) => ({
  id,
  center,
  bounds: cityBounds(center, sizeKm),
  maxLevel,
});

assert.equal(CITY_TILE_SIZE, 512);
assert.equal(CITY_TILE_GUTTER, 4);
assert.equal(CITY_TILE_INNER, 504);
// Independent equatorial WGS84 radii: a=6378.137 km, M=6335.439327292819 km.
// These fixtures catch swapped longitude/latitude or a spherical size estimate.
const equator = cityBounds([0, 0], 40);
close(equator[0], -0.17966305682390432);
close(equator[1], -0.18087389541007644);
close(equator[2], 0.17966305682390432);
close(equator[3], 0.18087389541007644);
assert.ok(cityBounds([0, 60], 40)[2] > equator[2] * 1.99);
assert.equal(cityBounds([179.99, 40], 40), null);
assert.equal(cityBounds([-179.99, -40], 40), null);
assert.equal(cityBounds([0, 89.99], 40), null);
assert.equal(cityBounds([181, 0], 20), null);
assert.throws(() => cityBounds([0, 0], -1), /extent/);
assert.throws(() => cityBounds([0, NaN], 20), /center/);
assert.equal(maxLevelFromExtent(40), 3);
assert.equal(maxLevelFromExtent(20), 2);
assert.equal(maxLevelFromExtent([20, 40]), 3);
assert.equal(maxLevelFromExtent(5.04), 0);
assert.equal(maxLevelFromExtent(5.041), 1);
assert.throws(() => maxLevelFromExtent(40, 0), /pixel size/);

const tiles = allCityTiles(3);
assert.equal(tiles.length, 85);
assert.deepEqual(tiles[0], { key: '0/0/0', z: 0, x: 0, y: 0 });
assert.deepEqual(tiles[1], { key: '1/0/0', z: 1, x: 0, y: 0 });
assert.deepEqual(tiles.at(-1), { key: '3/7/7', z: 3, x: 7, y: 7 });
assert.equal(new Set(tiles.map((tile) => tile.key)).size, tiles.length);
assert.ok(tiles.every((tile, i) => !i || tile.z >= tiles[i - 1].z));
assert.throws(() => allCityTiles(10), /too many/);

const rectangle = { id: 'rectangle', bounds: [-2, -1, 2, 1], maxLevel: 3 };
assert.deepEqual(tileBounds(rectangle, 0, 0, 0), rectangle.bounds);
assert.deepEqual(tileBounds(rectangle, 1, 0, 0), [-2, 0, 0, 1]);
assert.deepEqual(tileBounds(rectangle, 1, 1, 1), [0, -1, 2, 0]);
const northWest = tileUVRect(rectangle, 1, 0, 0);
close(northWest[0], 178 / 360);
close(northWest[1], 0.5);
close(northWest[2], 2 / 360);
close(northWest[3], 1 / 180);
assert.throws(() => tileBounds(rectangle, 1, 2, 0), /coordinates/);
assert.throws(() => tileBounds({ bounds: [179, -1, -179, 1] }, 0, 0, 0), /date line/);

// Independent oracle: project ground points, use the exact sphere horizon and
// perspective bounds; this does not use the planner's enclosing caps/spheres.
function visiblePoint(lonLat, view) {
  const p = point(lonLat);
  if (dot(p, subtract(view.eyeKm, p)) < -1e-7) return false;
  const ray = subtract(p, view.eyeKm);
  const depth = dot(ray, view.forward);
  const tanY = Math.tan((view.fovY * DEG) / 2);
  return (
    depth > 0 &&
    Math.abs(dot(ray, view.right)) <= depth * tanY * view.aspect + 1e-8 &&
    Math.abs(dot(ray, view.up)) <= depth * tanY + 1e-8
  );
}

function assertComplete(meta, view, plan, steps = 80) {
  const selected = plan.filter((tile) => tile.cityId === meta.id);
  const keys = new Set(selected.map((tile) => tile.key));
  let count = 0;
  for (const tile of selected) {
    if (tile.parentKey)
      assert.ok(keys.has(tile.parentKey), `${meta.id}: missing ${tile.parentKey}`);
    close(tile.uvScale[0], 504 / 512);
    close(tile.uvOffset[0], 4 / 512);
    if (!tile.parentKey) continue;
    for (const u of [0, 0.5, 1]) {
      for (const v of [0, 0.5, 1]) {
        const parentU = tile.parentUVRect[0] + u * tile.parentUVRect[2];
        const parentV = tile.parentUVRect[1] + v * tile.parentUVRect[3];
        close(tile.rect[0] + u * tile.rect[2], tile.parentRect[0] + parentU * tile.parentRect[2]);
        close(tile.rect[1] + v * tile.rect[3], tile.parentRect[1] + parentV * tile.parentRect[3]);
      }
    }
  }
  const [west, south, east, north] = meta.bounds;
  function assertPoint(longitude, latitude) {
    if (!visiblePoint([longitude, latitude], view)) return;
    count++;
    assert.ok(selected.length, `${meta.id}: visible city disappeared`);
    const z = selected[0].selectedLevel;
    const n = 2 ** z;
    const x = Math.min(n - 1, Math.max(0, Math.floor(((longitude - west) / (east - west)) * n)));
    const y = Math.min(n - 1, Math.max(0, Math.floor(((north - latitude) / (north - south)) * n)));
    assert.ok(
      keys.has(`${z}/${x}/${y}`),
      `${meta.id}: missing visible tile ${z}/${x}/${y} at ${longitude},${latitude}`
    );
  }
  for (let iy = 0; iy <= steps; iy++) {
    for (let ix = 0; ix <= steps; ix++) {
      assertPoint(west + ((east - west) * ix) / steps, south + ((north - south) * iy) / steps);
    }
  }
  // A second independent oracle casts all viewport borders including exactly
  // ±1, not just interior probes. It catches very small fields between ground
  // grid samples as well as the old omission of the screen's outer eight percent.
  const tanY = Math.tan((view.fovY * DEG) / 2);
  for (let iy = 0; iy <= 40; iy++) {
    for (let ix = 0; ix <= 40; ix++) {
      const sx = (ix / 20 - 1) * tanY * view.aspect;
      const sy = (iy / 20 - 1) * tanY;
      const ray = unit(
        view.forward.map((value, i) => value + sx * view.right[i] + sy * view.up[i])
      );
      const b = dot(view.eyeKm, ray);
      const discriminant = b * b - dot(view.eyeKm, view.eyeKm) + R * R;
      if (discriminant < 0) continue;
      const distance = -b - Math.sqrt(discriminant);
      if (distance <= 0) continue;
      const p = view.eyeKm.map((value, i) => value + distance * ray[i]);
      const longitude = Math.atan2(p[1], p[0]) / DEG;
      const latitude = Math.atan2(p[2], Math.hypot(p[0], p[1])) / DEG;
      if (longitude >= west && longitude <= east && latitude >= south && latitude <= north)
        assertPoint(longitude, latitude);
    }
  }
  return count;
}

const farCity = city('tiny-from-orbit', [2.3, 1.7], 20);
const globalView = camera([0, 0], 20000, [0, 0], 45, 1000, 700);
const globalPlan = planCityTiles([farCity], globalView);
assert.equal(globalPlan.length, 1);
assert.equal(globalPlan[0].key, '0/0/0');
assert.ok(assertComplete(farCity, globalView, globalPlan) > 0);

const beijing = city('beijing', [116.4074, 39.9042]);
const seattle = city('seattle', [-122.3321, 47.6062], 20);
for (const [meta, view] of [
  [beijing, camera(beijing.center, 400, beijing.center, 0.006, 562, 351)],
  [beijing, camera([116.2, 39.7], 400, beijing.center, 0.25, 3840, 2400)],
  [seattle, camera(seattle.center, 400, seattle.center, 2, 1000, 700)],
  [city('right-edge', [0.3, 0], 20), camera([0, 0], 400, [0, 0], 4.5)],
  [city('left-edge', [-0.3, 0], 20), camera([0, 0], 400, [0, 0], 4.5)],
  [city('top-edge', [0, 0.22], 20), camera([0, 0], 400, [0, 0], 4.5)],
  [city('bottom-edge', [0, -0.22], 20), camera([0, 0], 400, [0, 0], 4.5)],
  [city('limb', [19.75, 0]), camera([0, 0], 400, [19.8, 0], 0.08)],
  [city('high-latitude', [170, 85]), camera([170, 82], 200, [170, 85], 0.06)],
  [city('east-date-line', [179.7, 20], 20), camera([-179.8, 20], 400, [179.7, 20], 0.1)],
  [city('west-date-line', [-179.7, -20], 20), camera([179.8, -20], 400, [-179.7, -20], 0.1)],
]) {
  const plan = planCityTiles([meta], view);
  assert.ok(plan.length > 0 && plan.length <= 40, meta.id);
  assert.ok(assertComplete(meta, view, plan) > 0, `${meta.id}: oracle needs visible ground`);
}

// Entire city in a high-resolution frame: keeping a partial level would leave
// holes. 85 tiles become a complete 21-tile tree under the 40-slot budget.
const wholeCity = city('whole-city', [0, 0]);
const wholeView = camera([0, 0], 400, [0, 0], 8, 5000, 5000);
const full = planCityTiles([wholeCity], wholeView, { maxTiles: 100 });
assert.equal(full.length, 85);
assert.equal(full[0].selectedLevel, 3);
const budgeted = planCityTiles([wholeCity], wholeView, { maxTiles: 40 });
assert.equal(budgeted.length, 21);
assert.equal(budgeted[0].selectedLevel, 2);
assert.equal(budgeted[0].desiredLevel, 3);
assert.ok(assertComplete(wholeCity, wholeView, budgeted) > 6000);
assert.equal(planCityTiles([wholeCity], wholeView, { maxTiles: 1 }).length, 1);
assert.deepEqual(planCityTiles([wholeCity], wholeView, { maxTiles: 0 }), []);

const second = { ...wholeCity, id: 'second' };
const sharedPlan = planCityTiles([wholeCity, second], wholeView, { maxTiles: 40 });
assert.equal(sharedPlan.length, 10);
assert.equal(sharedPlan.filter((tile) => !tile.parentKey).length, 2);
assert.ok(assertComplete(wholeCity, wholeView, sharedPlan) > 0);
assert.ok(assertComplete(second, wholeView, sharedPlan) > 0);
assert.deepEqual(planCityTiles([wholeCity, second], wholeView, { maxTiles: 1 }), []);

const low = planCityTiles(
  [wholeCity],
  { ...wholeView, width: 500, height: 500 },
  { maxTiles: 100 }
);
assert.ok(
  low[0].selectedLevel < full[0].selectedLevel,
  'physical photo resolution must affect LOD'
);
const backSide = city('behind-earth', [179, 0]);
assert.deepEqual(planCityTiles([backSide], wholeView), []);
assert.deepEqual(
  planCityTiles([wholeCity], { ...wholeView, forward: wholeView.forward.map((v) => -v) }),
  []
);
assert.deepEqual(planCityTiles([wholeCity], { ...wholeView, eyeKm: point([0, 0]) }), []);
assert.throws(() => planCityTiles([wholeCity], { ...wholeView, fovY: 0 }), /view/);
assert.throws(() => planCityTiles([wholeCity], wholeView, { maxTiles: -1 }), /budget/);

console.log('City terrain bounds, UV orientation, complete view coverage, LOD and budgets passed');
