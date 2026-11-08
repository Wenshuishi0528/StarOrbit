import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { CityTerrain, CITY_GPU_LAYERS } from '../src/city-terrain.js';
import { cityBounds, tileUVRect } from '../src/city-terrain-math.js';
import { cityCameraView, cityOpticalView } from '../src/city-terrain-view.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate, message = 'city work did not settle') {
  const deadline = performance.now() + 3000;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, message);
    await turn();
  }
}
const city = (id = 'test', longitude = 0, maxLevel = 0) => ({
  id,
  name: id,
  center: [longitude, 0],
  bounds: cityBounds([longitude, 0], 20),
  maxLevel,
});
const target = (id = 'test', longitude = 0) => ({
  id: 'city:' + id,
  name: id,
  longitude,
  latitude: 0,
});
function camera(longitude = 0) {
  const a = (longitude * Math.PI) / 180;
  return {
    eyeKm: [6771 * Math.cos(a), 6771 * Math.sin(a), 0],
    forward: [-Math.cos(a), -Math.sin(a), 0],
    right: [-Math.sin(a), Math.cos(a), 0],
    up: [0, 0, 1],
    fovY: 1,
    aspect: 1.6,
    width: 1600,
    height: 1000,
  };
}
function cache() {
  return {
    async list() {
      return [];
    },
    async getEpoch() {
      return 0;
    },
    async getTile() {
      return null;
    },
    async putTile() {},
    async remove() {},
    close() {},
  };
}
function harness(options = {}) {
  const calls = [];
  const manager = new CityTerrain(options.manifest || {}, {
    cache: options.cache || cache(),
    source: options.source || { close() {} },
  });
  manager.load = async (tile, signal) => {
    calls.push({ tile, signal });
    if (options.load) return options.load(tile, signal);
    const pixels = new Uint8Array(512 * 512 * 4);
    pixels[0] = calls.length;
    return pixels;
  };
  return { manager, calls };
}

test('main, scope and photo share one bounded atlas and photo waits for tile fades', async () => {
  const { manager, calls } = harness({ manifest: { cities: [city('test', 0, 1)] } });
  try {
    await manager.ready;
    manager.setView('main', camera(), 1, true);
    manager.setView('scope', camera(), 2, true);
    const status = await manager.prepareView('photo', camera(), 3, 1500);
    assert.equal(status.complete, true);
    assert.ok(status.requested > 1, 'the photo must exercise parent and child layers');
    assert.equal(calls.length, status.requested, 'shared consumers must not decode duplicates');
    assert.ok(calls.slice(1).every((call) => call.tile.z >= calls[0].tile.z));
    assert.equal(manager.texture.image.depth, CITY_GPU_LAYERS);
    assert.equal(status.gpuBytes, (CITY_GPU_LAYERS * 512 * 512 * 4 * 4) / 3);
    assert.equal(status.cpuBytes, CITY_GPU_LAYERS * 512 * 512 * 4);
    for (const id of ['main', 'scope', 'photo']) {
      const uniforms = manager.uniforms(id);
      assert.equal(uniforms.cityMap.value, manager.texture);
      assert.equal(uniforms.cityCount.value, status.requested);
      for (const value of uniforms.cityParams.value.slice(0, uniforms.cityCount.value)) {
        assert.equal(value.y, 1, 'a prepared photograph must not expose a partial fade');
      }
    }
    const texture = manager.texture;
    manager.release('photo');
    assert.equal(manager.status('scope').complete, true);
    assert.equal(manager.texture, texture, 'closing photo must not invalidate the preview atlas');
    manager.setEnabled(false);
    assert.equal(manager.status('scope').cpuBytes, 4);
    for (const id of ['main', 'scope']) {
      assert.equal(manager.uniforms(id).cityCount.value, 0);
      assert.equal(manager.uniforms(id).cityMap.value, manager.texture);
    }
  } finally {
    manager.dispose();
  }
});

test('late decode cannot revive a disabled or superseded view', async () => {
  const jobs = [];
  const { manager } = harness({
    manifest: { cities: [city('first'), city('second', 90)] },
    load(tile, signal) {
      const job = { ...deferred(), tile, signal };
      jobs.push(job);
      return job.promise;
    },
  });
  try {
    await manager.ready;
    manager.setView('scope', camera(), 2, true);
    manager.setEnabled(false);
    assert.equal(jobs[0].signal.aborted, true);
    jobs[0].resolve(new Uint8Array(512 * 512 * 4));
    await until(() => !manager.loads.size);
    assert.equal(manager.entries.size, 0);
    assert.equal(manager.status('scope').cpuBytes, 4);
    manager.setEnabled(true);
    await until(() => jobs.length === 2);
    manager.setView('scope', camera(90), 2, true);
    await until(() => jobs.length === 3);
    assert.equal(jobs[1].signal.aborted, true);
    jobs[2].resolve(new Uint8Array(512 * 512 * 4));
    await until(() => manager.entries.has('second/0/0/0'));
    jobs[1].resolve(new Uint8Array(512 * 512 * 4));
    await until(() => !manager.loads.size);
    assert.equal(manager.entries.has('first/0/0/0'), false);
    assert.deepEqual(
      manager.status('scope').sources.map((item) => item.id),
      ['second']
    );
  } finally {
    manager.dispose();
  }
});

test('deleting a displayed city clears its uniforms before asynchronous disk deletion', async () => {
  const storage = cache(),
    disk = deferred(),
    { manager } = harness({ cache: storage });
  try {
    await manager.ready;
    manager.cities.set('test', city());
    manager.setView('scope', camera(), 2, true);
    await until(() => manager.status('scope').ready === 1);
    storage.remove = () => disk.promise;
    const removing = manager.removeCity('test');
    try {
      assert.equal(manager.uniforms('scope').cityCount.value, 0);
      assert.deepEqual(manager.status('scope').sources, []);
      assert.equal(manager.entries.size, 0);
    } finally {
      disk.resolve();
      await removing;
    }
  } finally {
    manager.dispose();
  }
});

test('storage deletion failure cannot retain ghost terrain or undefined source captions', async () => {
  const storage = cache(),
    { manager } = harness({ cache: storage });
  try {
    await manager.ready;
    manager.cities.set('test', city());
    manager.setView('scope', camera(), 2, true);
    await until(() => manager.status('scope').ready === 1);
    storage.remove = async () => {
      throw Error('disk unavailable');
    };
    await assert.rejects(manager.removeCity('test'), /disk unavailable/);
    assert.equal(manager.entries.size, 0);
    assert.equal(manager.uniforms('scope').cityCount.value, 0);
    assert.deepEqual(manager.status('scope').sources, []);
    assert.match(manager.lastError, /disk unavailable/);
  } finally {
    manager.dispose();
  }
});

test('an older parallel city preparation cannot recreate a deleted city', async () => {
  const jobs = [];
  const { manager } = harness({
    source: {
      prepare() {
        const job = deferred();
        jobs.push(job);
        return job.promise;
      },
      close() {},
    },
  });
  try {
    await manager.ready;
    const first = manager.addCity(target());
    const second = manager.addCity(target()).catch((error) => error);
    await until(() => jobs.length === 2);
    jobs[0].resolve(city());
    await first;
    await manager.removeCity('test');
    jobs[1].resolve(city());
    const outcome = await second;
    assert.equal(outcome.name, 'AbortError');
    assert.equal(manager.cities.has('test'), false);
    assert.equal(manager.autoDismissed.has('test'), true);
    assert.equal(manager.allowedOnline.has('test'), false);
  } finally {
    manager.dispose();
  }
});

test('dispose rejects late catalog/preparation work and cannot be re-enabled', async () => {
  const listing = deferred(),
    storage = cache();
  storage.list = () => listing.promise;
  const pendingCatalog = harness({ cache: storage }).manager;
  pendingCatalog.dispose();
  listing.resolve([city('stored')]);
  await pendingCatalog.ready;
  assert.equal(pendingCatalog.cities.has('stored'), false);
  pendingCatalog.setEnabled(true);
  assert.equal(pendingCatalog.enabled, false);

  const preparation = deferred();
  let requested = false;
  const { manager } = harness({
    source: {
      prepare() {
        requested = true;
        return preparation.promise;
      },
      close() {},
    },
  });
  await manager.ready;
  const adding = manager.addCity(target()).catch((error) => error);
  await until(() => requested);
  manager.dispose();
  preparation.resolve(city());
  assert.equal((await adding).name, 'AbortError');
  assert.equal(manager.cities.has('test'), false);
});

test('a delayed persisted catalog cannot restore an explicitly removed city', async () => {
  const listing = deferred(),
    storage = cache();
  storage.list = () => listing.promise;
  const { manager } = harness({ cache: storage });
  try {
    await manager.removeCity('stored');
    listing.resolve([city('stored')]);
    await manager.ready;
    assert.equal(manager.cities.has('stored'), false);
  } finally {
    manager.dispose();
  }
});

test('gazetteer aliases near a built-in city reuse its existing offline package', async () => {
  const { manager } = harness({ manifest: { cities: [city('builtin')] } });
  try {
    await manager.ready;
    const requested = target('gazetteer-123', 0.01);
    assert.equal(manager.idFor(requested), 'builtin');
    assert.equal((await manager.addCity(requested)).id, 'builtin');
    assert.equal(manager.cities.size, 1);
  } finally {
    manager.dispose();
  }
});

test('shared source work survives one consumer cancellation and stops when none remain', async () => {
  const work = deferred();
  let calls = 0,
    sourceSignal;
  const { manager } = harness({
    source: {
      tile(meta, tile, signal) {
        calls++;
        sourceSignal = signal;
        return work.promise;
      },
      close() {},
    },
  });
  try {
    await manager.ready;
    const first = new AbortController(),
      second = new AbortController(),
      tile = { key: '0/0/0' };
    const a = manager.sharedPayload(city(), tile, first.signal).catch((error) => error);
    const b = manager.sharedPayload(city(), tile, second.signal);
    assert.equal(calls, 1);
    first.abort();
    assert.equal(sourceSignal.aborted, false, 'an explicit download may still need this tile');
    const pixels = { buffer: new ArrayBuffer(4), mimeType: 'image/png' };
    work.resolve(pixels);
    assert.equal(await b, pixels);
    assert.equal((await a).name, 'AbortError');
    await turn();
    assert.equal(manager.payloads.size, 0);

    const cancelled = deferred();
    manager.source.tile = (meta, tile, signal) => {
      sourceSignal = signal;
      return cancelled.promise;
    };
    const last = new AbortController();
    const pending = manager.sharedPayload(city(), tile, last.signal).catch((error) => error);
    last.abort();
    assert.equal(sourceSignal.aborted, true);
    cancelled.reject(new DOMException('Cancelled', 'AbortError'));
    assert.equal((await pending).name, 'AbortError');
    await turn();
    assert.equal(manager.payloads.size, 0);
  } finally {
    manager.dispose();
  }
});

test('main and optical transforms agree in rotated Earth axes and north-up tile UVs', () => {
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0.4, 0.3, 0.7).normalize(), 1.2);
  const local = camera(37),
    world = (value) => new Vector3(...value).applyQuaternion(rotation),
    threeCamera = new PerspectiveCamera(local.fovY, local.aspect, 0.1, 1e6);
  threeCamera.position.copy(world(local.eyeKm));
  threeCamera.up.copy(world(local.up));
  threeCamera.lookAt(world(local.eyeKm).add(world(local.forward)));
  const basis = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ].map((axis) => world(axis).toArray());
  const optical = cityOpticalView(
    {
      eyeKm: world(local.eyeKm).toArray(),
      q: { earthAxes: basis },
      axes: Object.fromEntries(
        ['right', 'up', 'forward'].map((key) => [key, world(local[key]).toArray()])
      ),
      fovY: local.fovY,
    },
    { w: local.width, h: local.height, aspect: local.aspect }
  );
  const main = cityCameraView(threeCamera, rotation, local.width, local.height);
  for (const view of [main, optical]) {
    for (const key of ['eyeKm', 'right', 'up', 'forward']) {
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(view[key][i] - local[key][i]) < 1e-9, key);
    }
  }
  const meta = { bounds: [-2, -1, 2, 1] };
  const north = tileUVRect(meta, 1, 0, 0),
    south = tileUVRect(meta, 1, 0, 1);
  assert.equal(north[0], south[0]);
  assert.ok(north[1] > south[1], 'north-up raster y must map to increasing Earth v');
  assert.deepEqual(north.slice(2), south.slice(2));
});
