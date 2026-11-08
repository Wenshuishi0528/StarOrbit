import assert from 'node:assert/strict';
import test from 'node:test';
import { CityTerrain } from '../src/city-terrain.js';
import {
  planStreamingRegions,
  streamingAnchor,
  streamRegion,
} from '../src/surface-streaming-plan.js';
import { planStreamedCityTiles, maxLevelFromExtent } from '../src/city-terrain-math.js';
const DEG = Math.PI / 180;
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function view(lon = 116.4, lat = 39.9, height = 5, pitch = -8, fovY = 65) {
  const l = lon * DEG,
    p = lat * DEG,
    a = pitch * DEG,
    up = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)],
    east = [-Math.sin(l), Math.cos(l), 0],
    north = cross(up, east);
  const forward = north.map((v, i) => v * Math.cos(a) + up[i] * Math.sin(a));
  return {
    eyeKm: up.map((v) => v * (6371 + height)),
    forward,
    right: east,
    up: cross(east, forward),
    fovY,
    width: 1600,
    height: 1000,
    aspect: 1.6,
  };
}
const turn = () => new Promise((r) => setImmediate(r));
async function until(f) {
  const end = performance.now() + 4000;
  while (!f()) {
    assert(performance.now() < end, 'stream work timeout');
    await turn();
  }
}
const deferred = () => {
  let resolve;
  return { promise: new Promise((r) => (resolve = r)), resolve };
};
function harness(source = {}) {
  const calls = [],
    tiles = new Map(),
    removed = [];
  const cache = {
    async list() {
      return [];
    },
    async getEpoch() {
      return 0;
    },
    async getTile(id, key) {
      return tiles.get(id + '/' + key) || null;
    },
    async putTile(meta, key, payload) {
      tiles.set(meta.id + '/' + key, payload);
    },
    async remove(id) {
      removed.push(id);
      for (const key of tiles.keys()) if (key.startsWith(id + '/')) tiles.delete(key);
    },
    close() {},
  };
  const manager = new CityTerrain(
    {},
    {
      cache,
      source: {
        async prepare(region, signal) {
          calls.push({ region, signal });
          return { ...region, maxLevel: 0 };
        },
        async tile() {
          return { buffer: new ArrayBuffer(4), mimeType: 'image/png' };
        },
        close() {},
        ...source,
      },
    }
  );
  manager.load = async () => new Uint8Array(512 * 512 * 4);
  return { manager, calls, cache, removed, tiles };
}

test('wide ground views discover stable regions by radius, dateline and zoom', () => {
  const near = planStreamingRegions(view(), { rangeKm: 20 }),
    far = planStreamingRegions(view(), { rangeKm: 120 });
  assert(near.length > 0);
  assert(far.length > near.length, '5km wider radius supplies more distant ground');
  assert(far.length <= 48);
  assert(far.every((r) => r.streaming && r.bounds[0] < r.bounds[2]));
  const shift = planStreamingRegions(view(116.401), { rangeKm: 120 });
  assert(
    far.some((a) => shift.some((b) => a.id === b.id)),
    'small moves reuse cells'
  );
  const date = planStreamingRegions(view(179.99, 0, 5, -20));
  assert(date.some((r) => r.bounds[0] < -170) && date.some((r) => r.bounds[2] > 170));
  assert(planStreamingRegions(view(10, 84, 5, -20)).length > 0);
  assert.equal(
    planStreamingRegions(view(10, 87, 5, -20)).length,
    0,
    'Mercator coverage ends at85deg'
  );
  assert.equal(
    planStreamingRegions(view(10, 40, 20000, -90)).length,
    0,
    'overview must not download regional data'
  );
  assert(
    planStreamingRegions(view(10, 40, 400, -90, 1)).length > 0,
    'orbit close zoom targets surface imagery'
  );
  assert.deepEqual(
    streamRegion(129, 820),
    streamRegion(129, 820),
    'region identity independent of travel history'
  );
});

test('mixedLOD keeps ancestors and nearby detail under a bounded atlas', () => {
  const input = view(),
    regions = planStreamingRegions(input).map((r) => ({
      ...r,
      maxLevel: maxLevelFromExtent(r.extentKm, 10),
    }));
  const plan = planStreamedCityTiles(regions, input, {
    maxTiles: 64,
    center: streamingAnchor(input).center,
    rangeKm: 120,
  });
  assert(plan.length > regions.length && plan.length <= 64);
  assert(
    Math.max(...plan.map((t) => t.z)) >= 4,
    'near ground receives substantially finer than region roots'
  );
  const keys = new Set(plan.map((t) => t.cityId + '/' + t.key));
  for (const tile of plan)
    if (tile.parentKey)
      assert(keys.has(tile.cityId + '/' + tile.parentKey), 'parent must remain available');
  assert(new Set(plan.map((t) => t.z)).size > 2, 'mixed detail spans multiple scales');
});

test('manager discovers from65degree views without UI update, deduplicates and clears safely', async () => {
  const { manager, calls, removed } = harness();
  try {
    await manager.ready;
    manager.configureStreaming({ enabled: true, rangeKm: 120 });
    manager.setView('ground', view(), 4, true);
    await until(() => manager.cities.size >= 2);
    const ids = [...manager.cities.keys()];
    manager.setView('main', view(), 1, true);
    await turn();
    assert.equal(
      new Set(calls.map((c) => c.region.id)).size,
      calls.length,
      'one prepare per region acrossviews'
    );
    await manager.clearStreaming();
    await turn();
    assert.equal(manager.status('ground').streaming.paused, true);
    assert.equal(manager.cities.size, 0);
    const count = calls.length;
    manager.setView('ground', view(), 4, true);
    await turn();
    assert.equal(calls.length, count, 'deletion cannot immediately recreate current region');
    assert(ids.every((id) => removed.includes(id)));
    manager.resumeStreaming();
    await until(() => manager.cities.size > 0);
  } finally {
    manager.dispose();
  }
});

test('delayed region preparation cannot resurrect after clear and movement resumes discovery', async () => {
  const job = deferred();
  let signal;
  const { manager } = harness({
    prepare(region, s) {
      signal = s;
      return job.promise;
    },
  });
  try {
    await manager.ready;
    manager.configureStreaming({ enabled: true });
    manager.setView('ground', view(), 4, true);
    await until(() => !!signal);
    const id = [...manager.streamWanted.keys()][0];
    await manager.clearStreaming();
    assert(signal.aborted);
    job.resolve({ ...streamRegion(129, 260), id, maxLevel: 0 });
    await until(() => !manager.streamJobs.size);
    assert.equal(manager.cities.size, 0);
    manager.source.prepare = async (r) => ({ ...r, maxLevel: 0 });
    manager.setView('ground', view(120), 4, true);
    await until(() => manager.cities.size > 0);
    assert.equal(manager.status('ground').streaming.paused, false);
  } finally {
    manager.dispose();
  }
});

test('streamingoff still reads shared cachedtiles and never starts network', async () => {
  let network = 0;
  const { manager, tiles } = harness({
    tile: async () => {
      network++;
      return { buffer: new ArrayBuffer(4), mimeType: 'image/png' };
    },
  });
  const meta = { ...streamRegion(129, 260), maxLevel: 0 },
    tile = { key: '0/0/0' },
    payload = { buffer: new ArrayBuffer(4), mimeType: 'image/png' };
  try {
    await manager.ready;
    manager.cities.set(meta.id, meta);
    tiles.set(meta.id + '/' + tile.key, payload);
    assert.equal(await manager.payload(meta, tile, new AbortController().signal), payload);
    await assert.rejects(
      manager.payload(meta, { key: '1/0/0' }, new AbortController().signal),
      (e) => e.code === 'offline'
    );
    assert.equal(network, 0);
    manager.configureStreaming({ enabled: true });
    manager.streamWanted.set(meta.id, meta);
    await manager.payload(meta, { key: '1/0/0' }, new AbortController().signal);
    assert.equal(network, 1);
  } finally {
    manager.dispose();
  }
});

test('viewchange inside discovery throttle still replans after camera stops', async () => {
  const calls = [];
  const { manager } = harness({
    prepare(region, signal) {
      calls.push({ region, signal });
      return new Promise((resolve, reject) =>
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Cancelled', 'AbortError')),
          { once: true }
        )
      );
    },
  });
  try {
    await manager.ready;
    manager.configureStreaming({ enabled: true });
    manager.setView('ground', view(-36, 48), 4, true);
    await until(() => calls.length === 1);
    manager.setView('ground', view(116, 40), 4, true);
    await until(() => calls.length >= 2);
    assert(calls[0].signal.aborted);
    assert(calls[1].region.longitude > 100, 'stationary Beijing view replaces Atlantic');
  } finally {
    manager.dispose();
  }
});
