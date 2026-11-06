import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  EarthElevation,
  ELEVATION_GEOMETRY_BYTES,
  ELEVATION_CPU_BYTES,
  elevationGeometry,
} from '../src/earth-elevation.js';
import { elevationBaseMesh, planElevationTiles } from '../src/earth-elevation-math.js';
import { EarthElevationLayer } from '../src/earth-elevation-layer.js';

const base = () =>
  elevationBaseMesh(new Int16Array(64 * 32).fill(100), {
    width: 64,
    height: 32,
    columns: 64,
    rows: 32,
  });
const r = Math.PI / 180,
  lat = 40 * r,
  lon = 116 * r;
const radial = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
const view = {
  eyeKm: radial.map((x) => x * 6771),
  forward: radial.map((x) => -x),
  right: [-Math.sin(lon), Math.cos(lon), 0],
  up: [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)],
  fovY: 1,
  aspect: 1.6,
  width: 960,
  height: 600,
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > 10000) throw Error('Timed out');
    await delay(10);
  }
}
function harness(options = {}) {
  const blobs = new Map();
  let active = 0,
    peak = 0,
    calls = 0,
    baseLoads = 0;
  const cache = {
    async get(k) {
      return blobs.get(k);
    },
    async put(k, b) {
      blobs.set(k, b);
    },
    async clear() {
      blobs.clear();
    },
    dispose() {},
  };
  const source = {
    async tile(tile, signal) {
      calls++;
      active++;
      peak = Math.max(peak, active);
      try {
        await delay(5);
        signal.throwIfAborted();
        return { heights: new Float32Array(129 * 129).fill(700) };
      } finally {
        active--;
      }
    },
    close() {},
  };
  const m = new EarthElevation(
    { base: {} },
    {
      cache,
      source,
      loadBase: async () => {
        baseLoads++;
        return base();
      },
      ...options,
    }
  );
  return { m, blobs, stats: () => ({ calls, peak, baseLoads }) };
}
test('optional terrain remains allocation-free until enabled and shares one global base', async () => {
  const h = harness(),
    m = h.m;
  m.setView('main', view);
  assert.equal(h.stats().baseLoads, 0);
  assert.equal(m.status('main').gpuBytes, 0);
  m.setEnabled(true);
  await until(() => m.base);
  m.setView('main', { ...view, fovY: 80 }, 1, true);
  m.setView('scope', { ...view, fovY: 80 }, 2, true);
  await delay(20);
  assert.equal(h.stats().calls, 0);
  assert.equal(h.stats().baseLoads, 1);
  assert(m.baseGeometry);
  m.setEnabled(false);
  assert.equal(m.baseGeometry, null);
  assert.equal(m.status('main').gpuBytes, 0);
  m.dispose();
});

test('clearing data cannot undo a later explicit disable or disposal', async () => {
  for (const dispose of [false, true]) {
    const { m } = harness();
    m.setEnabled(true);
    await until(() => m.base);
    let finish;
    m.cache.clear = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const clearing = m.clearCache();
    assert.equal(m.enabled, false);
    if (dispose) m.dispose();
    else m.setEnabled(false);
    finish('cleared');
    assert.equal(await clearing, 'cleared');
    await delay(5);
    assert.equal(m.enabled, false);
    assert.equal(m.baseGeometry, null);
    if (!dispose) m.dispose();
  }
});

function seedView(manager, id, viewOptions = view, missing = false) {
  const plan = planElevationTiles(viewOptions, { minHeightMeters: -500, maxHeightMeters: 9000 });
  const state = {
    plan,
    view: viewOptions,
    priority: 1,
    display: [],
    buildKey: null,
    building: false,
  };
  manager.views.set(id, state);
  for (const tile of plan.tiles) {
    if (missing && tile === plan.tiles.at(-1)) {
      manager.failures.set(tile.key, manager.now() + 30000);
    } else {
      manager.entries.set(tile.key, {
        tile,
        heights: new Float32Array(129 * 129).fill(700),
        valid: 129 * 129,
        revision: ++manager.entrySerial,
        born: manager.now(),
        bytes: 129 * 129 * 4,
      });
    }
  }
  return state;
}

test('a retry arriving during a build supersedes it atomically and keeps complete neighbours', async () => {
  const { m } = harness();
  m.setEnabled(true);
  await until(() => m.base);
  const state = seedView(m, 'main', { ...view, fovY: 3 }, true);
  assert.ok(state.plan.tiles.length >= 3);
  m.buildViews();
  assert.equal(m.activeBuild.state, state);
  const abandoned = [...m.activeBuild.fresh];
  let disposed = 0;
  for (const record of abandoned) record.geometry.addEventListener('dispose', () => disposed++);
  const recovered = state.plan.tiles.at(-1);
  m.entries.set(recovered.key, {
    tile: recovered,
    heights: new Float32Array(129 * 129).fill(1700),
    valid: 129 * 129,
    revision: ++m.entrySerial,
    born: m.now(),
    bytes: 129 * 129 * 4,
  });
  m.failures.delete(recovered.key);
  m.buildViews();
  assert.equal(m.activeBuild.state, state, 'Only one staging collection exists');
  assert.equal(m.records('main').length, 0, 'Partial collections cannot punch partial holes');
  await until(() => m.status('main').complete);
  assert.equal(disposed, abandoned.length);
  assert.equal(m.records('main').length, state.plan.tiles.length);
  assert.equal(
    m.records('main').find((record) => record.tile.key === recovered.key).data.maxHeight,
    1700
  );
  assert.equal(state.displayKey, m.viewDataKey(state));
  for (const record of m.records('main')) {
    const neighbours = record.data.edgeNeighbours;
    assert.equal(neighbours.length, 4);
    assert.ok(neighbours.some(Boolean), 'Available same-level neighbours retain measured edges');
  }
  assert.ok(m.status('main').cpuBytes <= ELEVATION_CPU_BYTES);
  m.dispose();
});

test('release during tessellation disposes staging work without resurrecting its view', async () => {
  const { m } = harness();
  m.setEnabled(true);
  await until(() => m.base);
  seedView(m, 'main', { ...view, fovY: 3 });
  m.buildViews();
  const staged = [...m.activeBuild.fresh];
  let disposed = 0;
  for (const record of staged) record.geometry.addEventListener('dispose', () => disposed++);
  m.release('main');
  await until(() => !m.activeBuild);
  assert.equal(disposed, staged.length);
  assert.equal(m.views.has('main'), false);
  assert.equal(m.records('main').length, 0);
  m.dispose();
});

test('ready source data is not reported complete when geometry could not fit', async () => {
  const { m } = harness();
  m.setEnabled(true);
  await until(() => m.base);
  const state = seedView(m, 'main');
  const realBytes = m.cpuBytes.bind(m);
  m.cpuBytes = () => ELEVATION_CPU_BYTES;
  m.buildViews();
  await until(() => state.buildFailed);
  assert.equal(m.status('main').complete, false);
  assert.equal(m.status('main').renderedTiles, 0);
  assert.equal(m.activeBuild, null);
  m.cpuBytes = realBytes;
  m.retry();
  await until(() => m.status('main').complete);
  m.dispose();
});

test('CPU picking follows the visible fade, and layers only dispose their own wrappers', async () => {
  let clock = 10000;
  const { m } = harness({ now: () => clock });
  m.setEnabled(true);
  await until(() => m.base);
  seedView(m, 'main');
  m.buildViews();
  await until(() => m.status('main').complete);
  const record = m.records('main')[0];
  const [w, s, e, n] = record.tile.bounds;
  const longitude = ((w + e) / 2) * r;
  const latitude = ((s + n) / 2) * r;
  const normal = [
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
  ];
  const eye = normal.map((value) => value * 6771),
    direction = normal.map((value) => -value);
  const globalHit = m.pick(eye, direction, 'no-detail');
  const beginning = m.pick(eye, direction, 'main');
  assert.ok(Math.abs(beginning.distanceKm - globalHit.distanceKm) < 0.001);
  clock += 250;
  const middle = m.pick(eye, direction, 'main');
  clock += 250;
  const end = m.pick(eye, direction, 'main');
  assert.ok(middle.elevationMeters > beginning.elevationMeters);
  assert.ok(end.elevationMeters > middle.elevationMeters);
  assert.ok(Math.abs(end.elevationMeters - 700) < 0.1);
  assert.equal(record.geometry.userData.pickGeometry.index.count, 128 * 128 * 6);
  assert.ok(m.status('main').cpuBytes < ELEVATION_CPU_BYTES);
  let disposed = 0;
  record.geometry.addEventListener('dispose', () => disposed++);
  const layer = new EarthElevationLayer(m, {}, 'main');
  assert.equal(layer.update(new THREE.Quaternion()), true);
  assert.equal(layer.base.material.uniforms.terrainHoleCount.value, m.records('main').length);
  assert.equal(layer.tiles.get(record.tile.key).geometry, record.geometry);
  layer.dispose();
  assert.equal(disposed, 0, 'The layer borrows the manager geometry');
  m.dispose();
  assert.equal(disposed, 1);
  assert.equal(record.geometry.userData.pickGeometry, undefined);
});

test('picking ignores skirt faces/back faces and uses bounds covering both morph endpoints', () => {
  const { m } = harness();
  const positions = new Float32Array([
    10, -1, 1, 10, -1, -1, 10, 1, 1, 10, 1, -1, 12, -1, 1, 12, -1, -1, 12, 1, 1, 12, 1, -1,
  ]);
  const from = positions.slice();
  for (let i = 0; i < 4; i++) from[i * 3] = 8;
  const geometry = elevationGeometry({
    positions,
    basePositions: from,
    normals: new Float32Array(24),
    uv: new Float32Array(16),
    indices: new Uint16Array([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]),
    columns: 1,
    rows: 1,
    bodyVertexCount: 4,
  });
  const front = new THREE.Ray(new THREE.Vector3(13, 0, 0), new THREE.Vector3(-1, 0, 0));
  assert.equal(m.surfaceHit(geometry, front, 1).distance, 3, 'Artificial x=12 skirt is excluded');
  assert.equal(m.surfaceHit(geometry, front, 0.5).distance, 4);
  assert.equal(m.surfaceHit(geometry, front, 0).distance, 5);
  const back = new THREE.Ray(new THREE.Vector3(7, 0, 0), new THREE.Vector3(1, 0, 0));
  assert.equal(m.surfaceHit(geometry, back, 1), null);
  assert.ok(geometry.boundingSphere.containsPoint(new THREE.Vector3(8, -1, 1)));
  const realBytes = m.cpuBytes.bind(m);
  const second = geometry.clone();
  second.userData = { ...geometry.userData, pickGeometry: undefined };
  m.cpuBytes = () => ELEVATION_CPU_BYTES;
  assert.equal(
    m.surfaceHit(second, front, 0.5).distance,
    4,
    'Bounded-memory fallback keeps the same surface'
  );
  m.cpuBytes = realBytes;
  geometry.dispose();
  second.dispose();
  m.dispose();
});

test('raised terrain occludes sky labels above the old horizon, while clear sky skips mesh picking', async () => {
  const { m } = harness();
  let pickCalls = 0;
  const realPick = m.pick.bind(m);
  m.pick = (...args) => {
    pickCalls++;
    return realPick(...args);
  };
  assert.equal(m.skyOccluded([6771, 0, 0], [-1, 0, 0], 'main'), false);
  assert.equal(pickCalls, 0);
  m.setEnabled(true);
  assert.equal(m.skyOccluded([6771, 0, 0], [-1, 0, 0], 'main'), false);
  assert.equal(pickCalls, 0);
  await until(() => m.base);
  const eye = [6771, 0, 0];
  const target = [
    (6371 + 7.9) * Math.cos(20 * r) * Math.cos(0.1 * r),
    (6371 + 7.9) * Math.sin(20 * r) * Math.cos(0.1 * r),
    (6371 + 7.9) * Math.sin(0.1 * r),
  ];
  const relative = target.map((value, i) => value - eye[i]);
  const length = Math.hypot(...relative);
  const forward = relative.map((value) => value / length);
  const horizontal = Math.hypot(forward[0], forward[1]);
  const right = [forward[1] / horizontal, -forward[0] / horizontal, 0];
  const localView = {
    ...view,
    eyeKm: eye,
    forward,
    right,
    up: [
      right[1] * forward[2],
      -right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ],
    fovY: 0.006,
  };
  const state = seedView(m, 'main', localView);
  assert.ok(state.plan.tiles.length > 0);
  for (const entry of m.entries.values()) entry.heights.fill(8000);
  m.buildViews();
  await until(() => m.status('main').complete);
  for (const record of m.records('main')) record.born = m.now() - 1000;
  assert.equal(
    realPick(eye, forward, 'no-detail'),
    null,
    'This ray clears the coarse global horizon'
  );
  assert.equal(m.skyOccluded(eye, forward, 'main'), true, 'The real raised mesh blocks the label');
  assert.equal(pickCalls, 1);
  for (const ray of [
    [1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ]) {
    assert.equal(m.skyOccluded(eye, ray, 'main'), false);
  }
  assert.equal(pickCalls, 1, 'Clearly unobstructed rays do not traverse any BVH');
  m.setEnabled(false);
  assert.equal(m.skyOccluded(eye, forward, 'main'), false);
  assert.equal(pickCalls, 1);
  m.dispose();
});

test('preview and photograph layers refresh borrowed uniform objects without sharing terrain state', () => {
  const baseGeometry = new THREE.BufferGeometry();
  const geometry = new THREE.BufferGeometry();
  geometry.userData.origin = [0, 0, 0];
  const record = { tile: { key: '12/100/100', rect: [0.5, 0.5, 0.01, 0.01] }, geometry };
  const manager = { enabled: true, baseGeometry, records: () => [record], fade: () => 0.25 };
  const main = { cityMap: { value: 'main-atlas' }, cityCount: { value: 1 } };
  const scope = { cityMap: { value: 'scope-atlas' }, cityCount: { value: 2 } };
  const photo = { cityMap: { value: 'photo-atlas' }, cityCount: { value: 3 } };
  const uniforms = { ...main, terrainFade: { value: 99 }, terrainHoleCount: { value: 99 } };
  const previewLayer = new EarthElevationLayer(manager, uniforms, 'scope', { optical: true });
  const photoLayer = new EarthElevationLayer(manager, uniforms, 'photo', { optical: true });
  const quaternion = new THREE.Quaternion();
  previewLayer.update(quaternion);
  photoLayer.update(quaternion);
  const previewTile = previewLayer.tiles.get(record.tile.key);
  const photoTile = photoLayer.tiles.get(record.tile.key);
  const materials = [
    previewLayer.base.material,
    previewTile.material,
    photoLayer.base.material,
    photoTile.material,
  ];
  const privateUniforms = materials.map((material) => ({
    fade: material.uniforms.terrainFade,
    count: material.uniforms.terrainHoleCount,
    holes: material.uniforms.terrainHoles,
  }));

  Object.assign(uniforms, scope);
  previewLayer.update(quaternion);
  for (const material of materials.slice(0, 2)) {
    assert.equal(material.uniforms.cityMap, scope.cityMap);
    assert.equal(material.uniforms.cityCount, scope.cityCount);
  }
  assert.equal(photoLayer.base.material.uniforms.cityMap, main.cityMap);

  Object.assign(uniforms, photo);
  photoLayer.update(quaternion);
  for (const material of materials.slice(2)) {
    assert.equal(material.uniforms.cityMap, photo.cityMap);
    assert.equal(material.uniforms.cityCount, photo.cityCount);
  }
  assert.equal(previewLayer.base.material.uniforms.cityMap, scope.cityMap);

  Object.assign(uniforms, scope);
  previewLayer.update(quaternion);
  assert.equal(previewLayer.tiles.get(record.tile.key), previewTile, 'Reuse the existing mesh');
  for (let i = 0; i < materials.length; i++) {
    const current = materials[i].uniforms;
    assert.equal(current.terrainFade, privateUniforms[i].fade);
    assert.equal(current.terrainHoleCount, privateUniforms[i].count);
    assert.equal(current.terrainHoles, privateUniforms[i].holes);
    assert.equal(current.terrainFade.value, i % 2 ? 0.25 : 1);
    assert.equal(current.terrainHoleCount.value, i % 2 ? 0 : 1);
  }
  assert.notEqual(
    previewLayer.base.material.uniforms.terrainHoles,
    photoLayer.base.material.uniforms.terrainHoles
  );
  previewLayer.dispose();
  photoLayer.dispose();
  baseGeometry.dispose();
  geometry.dispose();
});

test('all consumers share height requests, bounded concurrency and cache; photos release only their geometry', async () => {
  const h = harness(),
    m = h.m;
  m.setEnabled(true);
  await until(() => m.base);
  m.setView('main', view, 1, true);
  m.setView('scope', view, 2, true);
  await until(() => m.status('main').complete && m.status('scope').complete);
  assert(h.stats().calls > 0);
  assert(h.stats().peak <= 2);
  assert.equal(h.stats().calls, m.views.get('main').plan.tiles.length);
  assert(m.records('main').length > 0);
  assert(m.status('main').gpuBytes < ELEVATION_GEOMETRY_BYTES + 8 * 1024 * 1024);
  await m.prepareView('photo', view, 3, 1000);
  assert.equal(h.stats().calls, m.views.get('main').plan.tiles.length);
  m.release('photo');
  assert(m.records('main').length);
  assert.equal(m.records('photo').length, 0);
  const before = h.stats().calls;
  m.setEnabled(false);
  m.setEnabled(true);
  await until(() => m.base);
  m.setView('main', view, 1, true);
  await until(() => m.status('main').complete);
  assert.equal(h.stats().calls, before);
  m.dispose();
});
test('close and clear reject late source work and never resurrect released views', async () => {
  const h = harness(),
    m = h.m;
  let finish;
  m.source.tile = () => new Promise((r) => (finish = r));
  m.setEnabled(true);
  await until(() => m.base);
  m.setView('main', { ...view, fovY: 0.001 }, 1, true);
  await until(() => finish);
  m.setEnabled(false);
  finish({ heights: new Float32Array(129 * 129).fill(2000) });
  await delay(50);
  assert.equal(m.entries.size, 0);
  assert.equal(m.views.size, 0);
  assert.equal(h.blobs.size, 0);
  assert.equal(m.baseGeometry, null);
  m.dispose();
});
