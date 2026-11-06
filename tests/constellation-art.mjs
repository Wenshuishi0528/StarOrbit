import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Texture, Vector3 } from 'three';
import { ConstellationArt, ART_GPU_BUDGET } from '../src/constellation-art.js';
import { ConstellationArtLayer } from '../src/constellation-art-layer.js';

const manifest = JSON.parse(
  readFileSync(new URL('../assets/constellation-art/manifest.json', import.meta.url))
);
const cygnus = manifest.images.find((record) => record.imageId === 'cygnus');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'artwork asynchronous work did not settle');
    await turn();
  }
}
function view(frame) {
  const forward = new Vector3(...frame.center),
    right = forward
      .clone()
      .cross(new Vector3(0, 0, 1))
      .normalize(),
    up = right.clone().cross(forward).normalize();
  return {
    forward: forward.toArray(),
    right: right.toArray(),
    up: up.toArray(),
    fovY: 25,
    aspect: 1.6,
  };
}
function resource() {
  const result = { disposed: 0, closed: 0 };
  result.texture = new Texture();
  result.texture.addEventListener('dispose', () => result.disposed++);
  result.image = {
    close() {
      result.closed++;
    },
  };
  return result;
}
function harness(images = [cygnus]) {
  const manager = new ConstellationArt({ images }),
    calls = [];
  manager.load = (frame, signal) => {
    const job = { ...deferred(), frame, signal };
    calls.push(job);
    return job.promise;
  };
  return { manager, calls, input: view(manager.frames[0]) };
}

test('late artwork decode is closed after disable and replaced on re-enable', async () => {
  const { manager, calls, input } = harness();
  try {
    manager.update('main', input, true);
    manager.update('main', input, false);
    manager.update('main', input, true);
    assert.equal(calls[0].signal.aborted, true);
    const stale = resource();
    calls[0].resolve(stale);
    await until(() => calls.length === 2);
    assert.equal(stale.closed, 1);
    assert.equal(stale.disposed, 1);
    assert.equal(manager.entries.size, 0);
    const current = resource();
    calls[1].resolve(current);
    await until(() => manager.status('main').complete);
    assert.equal(manager.ready('main')[0].texture, current.texture);
    manager.release('main');
    assert.equal(current.closed, 1);
    assert.equal(current.disposed, 1);
    assert.equal(manager.status('main').gpuBytes, 0);
  } finally {
    manager.dispose();
  }
});

test('dispose prevents an in-flight decode from reviving GPU resources', async () => {
  const { manager, calls, input } = harness();
  manager.update('scope', input, true, 2);
  manager.dispose();
  assert.equal(calls[0].signal.aborted, true);
  const late = resource();
  calls[0].resolve(late);
  await until(() => manager.loads.size === 0);
  assert.equal(late.closed, 1);
  assert.equal(late.disposed, 1);
  assert.equal(manager.entries.size, 0);
  assert.equal(manager.views.size, 0);
});

test('main, preview and photograph share a single bounded texture pool', async () => {
  const images = Array.from({ length: 24 }, (_, i) => ({ ...cygnus, imageId: 'image-' + i }));
  const manager = new ConstellationArt({ images }),
    input = view(manager.frames[0]),
    resources = [];
  let active = 0,
    peak = 0;
  manager.load = async () => {
    active++;
    peak = Math.max(peak, active);
    await turn();
    active--;
    const item = resource();
    resources.push(item);
    return item;
  };
  try {
    manager.update('main', input, true, 1);
    manager.update('scope', input, true, 2);
    const status = await manager.prepare('photo', input, true);
    assert.equal(status.complete, true);
    assert.ok(status.requested > 1 && status.requested < images.length);
    assert.ok(status.gpuBytes <= ART_GPU_BUDGET);
    assert.ok(peak <= 2);
    assert.equal(resources.length, status.ready, 'three consumers must not decode three copies');
    for (const id of ['main', 'scope', 'photo']) {
      assert.deepEqual(
        manager.ready(id).map((e) => e.texture),
        resources.map((e) => e.texture)
      );
      assert.ok(manager.ready(id).every((e) => performance.now() - e.born >= 300));
    }
    manager.release('photo');
    manager.release('scope');
    assert.equal(resources.filter((r) => r.closed).length, 0);
    manager.release('main');
    assert.ok(resources.every((r) => r.closed === 1 && r.disposed === 1));
    assert.equal(manager.status('main').gpuBytes, 0);
  } finally {
    manager.dispose();
  }
});

test('layer geometry is private while a borrowed texture survives another layer closing', async () => {
  const { manager, calls, input } = harness(),
    main = new ConstellationArtLayer(manager, 'main'),
    scope = new ConstellationArtLayer(manager, 'scope', true, 2);
  try {
    main.update(input, true);
    scope.update(input, true);
    const shared = resource();
    calls[0].resolve(shared);
    await until(() => manager.status('scope').complete);
    main.update(input, true);
    scope.update(input, true);
    const a = [...main.meshes.values()][0],
      b = [...scope.meshes.values()][0];
    assert.notEqual(a.geometry, b.geometry);
    assert.notEqual(a.material, b.material);
    assert.equal(a.material.uniforms.artMap.value, b.material.uniforms.artMap.value);
    for (const [key, expected] of [
      ['right', [1, 0, 0]],
      ['up', [0, 1, 0]],
      ['forward', [0, 0, 1]],
    ]) {
      const actual = new Vector3(...input[key])
        .applyMatrix3(scope.uniforms.inertialToCamera.value)
        .toArray();
      assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < 1e-12));
    }
    let geometryDisposed = 0,
      materialDisposed = 0;
    b.geometry.addEventListener('dispose', () => geometryDisposed++);
    b.material.addEventListener('dispose', () => materialDisposed++);
    scope.dispose();
    assert.equal(geometryDisposed, 1);
    assert.equal(materialDisposed, 1);
    assert.equal(shared.disposed, 0);
    main.dispose();
    assert.equal(shared.disposed, 1);
    assert.equal(shared.closed, 1);
  } finally {
    main.dispose();
    scope.dispose();
    manager.dispose();
  }
});

test('a transient fetch failure retries even when the visible camera stays fixed', async () => {
  const manager = new ConstellationArt({ images: [cygnus] }),
    input = view(manager.frames[0]),
    timeout = globalThis.setTimeout,
    clock = performance.now.bind(performance),
    clockDescriptor = Object.getOwnPropertyDescriptor(performance, 'now');
  let offset = 0,
    calls = 0;
  const loaded = resource();
  try {
    // Exercise the real retry scheduling without a ten-second test delay.
    globalThis.setTimeout = (callback, ms, ...args) => timeout(callback, Math.min(ms, 10), ...args);
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => clock() + offset,
    });
    manager.load = async () => {
      calls++;
      if (calls === 1) throw Error('temporary fetch failure');
      return loaded;
    };
    manager.update('main', input, true);
    await until(() => manager.failures.size > 0);
    offset = 11000;
    await until(() => manager.status('main').complete);
    assert.equal(calls, 2);
    assert.equal(manager.ready('main')[0].texture, loaded.texture);
  } finally {
    manager.dispose();
    globalThis.setTimeout = timeout;
    if (clockDescriptor) Object.defineProperty(performance, 'now', clockDescriptor);
    else delete performance.now;
  }
});
