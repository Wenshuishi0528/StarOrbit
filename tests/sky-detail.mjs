import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SkyDetail } from '../src/sky-detail.js';
import {
  planSkyDetail,
  SKY_GPU_BUDGET,
  SKY_TILE_BYTES,
  SKY_TILE_LIMIT,
  skyTileKey,
} from '../src/sky-detail-plan.js';
import { hipsTileUrl } from '../src/sky-detail-math.js';

const manifest = {
  version: 7,
  providers: [
    { id: 'dss-color', baseUrl: 'https://test.invalid/dss', format: 'jpg', maxOrder: 9 },
    { id: 'panstarrs', baseUrl: 'https://test.invalid/ps1', format: 'jpg', maxOrder: 11 },
  ],
};
const fullManifest = JSON.parse(
  fs.readFileSync(new URL('../assets/sky-detail/manifest.json', import.meta.url))
);
const view = (ra = 0, dec = 0, fovY = 0.1, pixelHeight = 2000) => {
  ra *= Math.PI / 180;
  dec *= Math.PI / 180;
  return {
    forward: [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)],
    right: [-Math.sin(ra), Math.cos(ra), 0],
    up: [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)],
    fovY,
    aspect: 1.5,
    pixelHeight,
  };
};
const reply = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'image/jpeg' } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate, message = 'asynchronous cache did not settle') {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message);
    await turn();
  }
}
function memoryCache() {
  const records = new Map();
  return {
    records,
    writes: [],
    async get(key) {
      return records.get(key) || null;
    },
    async put(key, blob) {
      this.writes.push(key);
      records.set(key, blob);
      return true;
    },
    async clear() {
      records.clear();
      return true;
    },
    dispose() {},
  };
}
function harness(options = {}) {
  const calls = [],
    bitmaps = [];
  const cache = options.cache || memoryCache();
  let decoding = 0,
    peakDecoding = 0;
  const bitmap = (tag, width = 512, height = 512) => {
    const result = {
      tag,
      width,
      height,
      closed: 0,
      close() {
        this.closed++;
      },
    };
    bitmaps.push(result);
    return result;
  };
  const manager = new SkyDetail(options.manifest || manifest, {
    cache,
    source: options.source,
    fetcher: async (url, init) => {
      calls.push({ url, ...init });
      return options.fetcher ? options.fetcher(url, init, calls.length) : reply(url);
    },
    decode: async (blob) => {
      decoding++;
      peakDecoding = Math.max(peakDecoding, decoding);
      try {
        return options.decode ? await options.decode(blob, bitmap) : bitmap(await blob.text());
      } finally {
        decoding--;
      }
    },
  });
  return {
    manager,
    calls,
    bitmaps,
    cache,
    get peakDecoding() {
      return peakDecoding;
    },
  };
}
const settle = (manager) =>
  until(() => manager.activeLoads.size === 0 && manager.loading.size === 0);
const tileUrl = (tile) =>
  hipsTileUrl(tile.provider.baseUrl, tile.order, tile.pixel, tile.provider.format);

assert.equal(SKY_TILE_BYTES, ((4 * 512 ** 2 - 1) / 3) * 4);
assert.equal(SKY_TILE_LIMIT, 48);
assert.ok(SKY_TILE_LIMIT * SKY_TILE_BYTES <= SKY_GPU_BUDGET);
assert.notEqual(
  skyTileKey({ id: 'same', revision: 1 }, 2, 7),
  skyTileKey({ id: 'same', revision: 2 }, 2, 7)
);

// Browser-native fetch is a free function, never a method on SkyDetail.
{
  let calls = 0;
  const m = new SkyDetail(manifest, {
    cache: memoryCache(),
    fetcher: function (url) {
      assert.equal(this, undefined);
      calls++;
      return Promise.resolve(reply(url));
    },
    decode: async () => ({ width: 512, height: 512, close() {} }),
  });
  m.update('scope', view());
  await settle(m);
  assert.ok(calls > 0 && m.status('scope').complete);
  m.dispose();
}

// Shutter geometry is exact, even for a sub-pixel pointing change within 100ms.
{
  const h = harness(),
    m = h.manager;
  const initial = view(20, 30, 0.006),
    actual = view(20.00001, 30, 0.006);
  m.update('scope-photo', initial);
  const old = m.views.get('scope-photo');
  m.update('scope-photo', actual);
  const updated = m.views.get('scope-photo');
  assert.notStrictEqual(updated, old);
  assert.notEqual(updated.signature, old.signature);
  assert.deepEqual(updated.tiles, planSkyDetail(m.providers, actual));
  await settle(m);
  m.dispose();
}

// Three consumers share one download, decoded bitmap and texture per tile.
{
  const h = harness(),
    m = h.manager;
  for (const id of ['main', 'scope', 'scope-photo']) m.update(id, view());
  await settle(m);
  const count = m.status('scope').requested;
  assert.equal(h.calls.length, count);
  assert.equal(new Set(h.calls.map((call) => call.url)).size, count);
  assert.equal(h.bitmaps.length, count);
  assert.ok(h.calls.every((call) => call.cache === 'no-store' && call.credentials === 'omit'));
  assert.ok(m.status('scope-photo').complete);
  assert.strictEqual(m.ready('main')[0].texture, m.ready('scope')[0].texture);
  assert.ok([...m.allowed.keys()].every((key) => key.includes('@7/')));
  m.release('main');
  m.release('scope-photo');
  assert.equal(m.entries.size, count);
  let disposed = 0;
  for (const entry of m.entries.values())
    entry.texture.addEventListener('dispose', () => disposed++);
  m.release('scope');
  assert.equal(m.entries.size, 0);
  assert.equal(disposed, count);
  assert.ok(h.bitmaps.every((image) => image.closed === 1));
  m.dispose();
}

// Budget is global, not 48 tiles for each viewport. Export is admitted first.
{
  const h = harness(),
    m = h.manager;
  m.update('main', view(90, 20));
  m.update('scope', view(0, 0));
  m.update('scope-photo', view(180, 40));
  await settle(m);
  assert.equal(m.allowed.size, 48);
  assert.equal(m.entries.size, 48);
  assert.equal(m.status('scope-photo').complete, true);
  assert.equal(m.status('main').limited, true);
  assert.ok(m.status('main').gpuBytes <= SKY_GPU_BUDGET);
  assert.ok(h.peakDecoding <= 2);
  const photoKeys = planSkyDetail(m.providers, view(180, 40)).map((tile) => tile.key);
  assert.ok(photoKeys.every((key) => m.allowed.has(key)));
  m.dispose();
  assert.ok(h.bitmaps.every((image) => image.closed === 1));
}

// A source change immediately replaces every already-loaded view and export plan.
{
  const h = harness({ source: 'dss' }),
    m = h.manager,
    pointing = view();
  m.update('main', pointing);
  m.update('scope', pointing);
  await settle(m);
  assert.ok(m.ready('scope').every((entry) => entry.provider.id === 'dss-color'));
  const originalGeometry = structuredClone(m.views.get('scope').view);
  m.setSource('panstarrs');
  assert.equal(m.ready('scope').length, 0, 'old source cannot remain in a newly selected frame');
  const photo = await m.prepare('scope-photo', pointing, true, 2000);
  await settle(m);
  assert.equal(photo.source, 'panstarrs');
  for (const id of ['main', 'scope', 'scope-photo']) {
    assert.ok(m.status(id).complete);
    assert.ok(m.ready(id).every((entry) => entry.provider.id === 'panstarrs'));
  }
  assert.strictEqual(m.ready('scope')[0].texture, m.ready('scope-photo')[0].texture);
  assert.deepEqual(
    m.views.get('scope').view,
    originalGeometry,
    'source does not change pointing/FOV'
  );
  m.setSource('galaxy');
  assert.equal(m.entries.size, 0);
  assert.equal(m.status('scope-photo').source, 'galaxy');
  assert.equal(m.status('scope-photo').fallback, 'background');
  assert.equal(m.allowed.size, 0);
  m.dispose();
  assert.ok(h.bitmaps.every((image) => image.closed === 1));
}

// Late decoded images from a previous survey cannot flash over its replacement.
{
  const gates = [];
  const h = harness({
    source: 'dss',
    decode: async (blob, bitmap) => {
      const url = await blob.text();
      if (url.includes('/dss/')) {
        const gate = deferred();
        gates.push(gate);
        await gate.promise;
      }
      return bitmap(url);
    },
  });
  const m = h.manager;
  m.update('scope', view());
  await until(() => gates.length === 2);
  m.setSource('panstarrs');
  gates.forEach((gate) => gate.resolve());
  await settle(m);
  assert.ok(m.ready('scope').every((entry) => entry.provider.id === 'panstarrs'));
  assert.ok(
    h.bitmaps.filter((image) => image.tag.includes('/dss/')).every((image) => image.closed === 1)
  );
  assert.equal(
    h.cache.writes.some((key) => key.startsWith('dss-color')),
    false
  );
  m.dispose();
}

// A photo preempts slower main-view fetches, rather than waiting for 12s timeout.
{
  const h = harness({
    fetcher(url, { signal }, index) {
      if (index > 2) return reply(url);
      return new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })
      );
    },
  });
  const m = h.manager;
  m.update('main', view(0, 0));
  await until(() => h.calls.length === 2);
  const photoView = view(180, 40);
  const photoUrls = new Set(planSkyDetail(m.providers, photoView).map(tileUrl));
  const prepared = await m.prepare('scope-photo', photoView, true, 2000);
  assert.equal(prepared.complete, true);
  assert.ok(h.calls.slice(0, 2).every((call) => call.signal.aborted));
  assert.ok(h.calls.slice(2, 4).every((call) => photoUrls.has(call.url)));
  await settle(m);
  m.dispose();
}

// Bad compressed cache entries get a fresh download and valid replacement.
{
  const cache = memoryCache();
  const h = harness({
    cache,
    decode: async (blob, bitmap) => {
      const text = await blob.text();
      if (text === 'corrupt') throw Error('broken cached image');
      return bitmap(text);
    },
  });
  const m = h.manager,
    tiles = planSkyDetail(m.providers, view());
  cache.records.set(tiles[0].key, new Blob(['corrupt']));
  m.update('scope', view());
  await settle(m);
  assert.equal(m.status('scope').complete, true);
  assert.equal(m.status('scope').failed, 0);
  assert.notEqual(await cache.records.get(tiles[0].key).text(), 'corrupt');
  assert.equal(h.calls.filter((call) => call.url === tileUrl(tiles[0])).length, 1);
  const fetchCount = h.calls.length;
  m.release('scope');
  m.update('scope', view());
  await settle(m);
  assert.equal(h.calls.length, fetchCount, 'repaired persistent content is reusable');
  m.dispose();
}

// Storage is optional: rejected get/put cannot turn a good image into a failure.
{
  const cache = memoryCache();
  cache.get = async () => {
    throw Error('denied');
  };
  cache.put = async () => {
    throw Error('quota');
  };
  const h = harness({ cache }),
    m = h.manager;
  m.update('scope', view());
  await settle(m);
  assert.equal(m.status('scope').complete, true);
  assert.equal(m.status('scope').failed, 0);
  m.dispose();
}

// Failed PS1 children leave the coarse DSS parent visible and do not busy-retry.
{
  const h = harness({ fetcher: (url) => reply(url, url.includes('/ps1/') ? 404 : 200) });
  const m = h.manager;
  const result = await m.prepare('scope-photo', view(), true, 2000);
  assert.ok(result.failed > 0 && result.ready > 0);
  assert.equal(result.loading, false);
  assert.ok(m.ready('scope-photo').every((entry) => entry.provider.id === 'dss-color'));
  const calls = h.calls.length;
  m.update('scope-photo', view());
  await settle(m);
  assert.equal(h.calls.length, calls);
  m.dispose();
}

// A small diagnostic is observable without copying image URLs or payloads.
{
  const h = harness({
    fetcher: () => {
      throw TypeError('Cannot fetch https://private.invalid/image.avif?token=secret');
    },
  });
  const m = h.manager;
  m.update('scope', view());
  await settle(m);
  const diagnostic = m.status('scope').lastError;
  assert.ok(diagnostic.includes('TypeError') && diagnostic.includes('[image]'));
  assert.ok(!diagnostic.includes('private.invalid') && !diagnostic.includes('secret'));
  assert.ok(diagnostic.length <= 180);
  m.dispose();
}

// Oversized responses are rejected before decode; malformed dimensions close.
{
  let discarded = 0;
  const h = harness({
    fetcher: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1));
          },
          cancel() {
            discarded++;
          },
        }),
        { headers: { 'content-length': '2000001' } }
      ),
  });
  const m = h.manager;
  m.update('scope', view());
  await settle(m);
  assert.equal(h.bitmaps.length, 0);
  assert.equal(discarded, h.calls.length, 'rejected large responses stop downloading');
  assert.equal(m.status('scope').failed, m.status('scope').requested);
  m.dispose();
  const bad = harness({ decode: async (_, bitmap) => bitmap('wrong-size', 1024, 512) });
  bad.manager.update('scope', view());
  await settle(bad.manager);
  assert.equal(bad.manager.entries.size, 0);
  assert.ok(bad.bitmaps.every((image) => image.closed === 1));
  bad.manager.dispose();
}

// A previous same-key request's late rejection/finally cannot suppress its replacement.
{
  const old = deferred(),
    replacement = deferred();
  let targetUrl,
    occurrences = 0;
  const h = harness({
    fetcher: (url) => {
      targetUrl ||= url;
      if (url === targetUrl) return (++occurrences === 1 ? old : replacement).promise;
      return reply(url);
    },
  });
  const m = h.manager;
  m.update('scope', view());
  await until(() => m.activeLoads.size === 1 && m.entries.size > 0);
  m.release('scope');
  m.update('scope', view());
  await until(() => occurrences === 2);
  const key = planSkyDetail(m.providers, view()).find((tile) => tileUrl(tile) === targetUrl).key;
  const freshRequest = m.loading.get(key);
  old.reject(Error('late old failure'));
  await turn();
  assert.strictEqual(m.loading.get(key), freshRequest);
  assert.equal(m.failures.has(key), false);
  replacement.resolve(reply(targetUrl));
  await settle(m);
  assert.equal(m.status('scope').complete, true);
  m.dispose();
}

// Clear blocks updates while disk deletion is pending and closes late decodes.
{
  const cache = memoryCache(),
    diskClear = deferred(),
    decodeGates = [];
  cache.clear = () => diskClear.promise;
  const h = harness({
    cache,
    decode: async (blob, bitmap) => {
      const gate = deferred();
      decodeGates.push(gate);
      await gate.promise;
      return bitmap(await blob.text());
    },
  });
  const m = h.manager;
  m.update('scope', view());
  await until(() => decodeGates.length === 2);
  const clearing = m.clear();
  assert.equal(m.update('scope', view()).requested, 0);
  decodeGates.forEach((gate) => gate.resolve());
  await settle(m);
  assert.equal(m.entries.size, 0);
  assert.equal(h.calls.length, 2, 'old finally must not restart the cleared view');
  assert.equal(cache.writes.length, 0);
  assert.ok(h.bitmaps.every((image) => image.closed === 1));
  diskClear.resolve(true);
  assert.equal(await clearing, true);
  assert.equal(m.views.size, 0);
  m.dispose();
}

// Disabling or closing during non-cancellable decode never retains late images.
for (const action of ['disable', 'dispose']) {
  const gates = [];
  const h = harness({
    decode: async (blob, bitmap) => {
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      return bitmap(await blob.text());
    },
  });
  const m = h.manager;
  m.update('scope', view());
  await until(() => gates.length === 2);
  if (action === 'disable') m.setEnabled(false);
  else m.dispose();
  gates.forEach((gate) => gate.resolve());
  await settle(m);
  assert.equal(m.entries.size, 0);
  assert.ok(h.bitmaps.every((image) => image.closed === 1));
  assert.equal(h.cache.writes.length, 0);
  m.dispose();
}

// Two remote promises which ignore abort cannot starve the dedicated local channel.
{
  const remote = [];
  const h = harness({
    manifest: fullManifest,
    fetcher: (url) => {
      if (!url.startsWith('https:')) return reply(url);
      const gate = deferred();
      remote.push(gate);
      return gate.promise;
    },
  });
  const m = h.manager;
  m.update('main', view(0, 0));
  await until(() => remote.length === 2);
  const recent = view(159.21303687393092, -58.62016558917656, 0.01);
  m.update('scope', recent);
  const localCount = m.views.get('scope').tiles.filter((tile) => tile.provider.tiles).length;
  assert.ok(localCount > 2);
  await until(
    () => m.ready('scope').filter((entry) => entry.provider.tiles).length === localCount,
    'offline remote requests starved bundled imagery'
  );
  assert.equal(remote.length, 2);
  assert.ok(m.activeLoads.size <= 3 && h.peakDecoding <= 3);
  m.dispose();
  remote.forEach((gate) => gate.resolve(reply('late remote')));
  await settle(m);
  assert.ok(h.bitmaps.every((image) => image.closed === 1));
}

// Export waits for remaining local fine tiles even after remote fallback failed.
{
  const firstLocal = deferred();
  let localStarted = false;
  const h = harness({
    manifest: fullManifest,
    fetcher: (url) => reply(url, url.startsWith('https:') ? 404 : 200),
    decode: async (blob, bitmap) => {
      if (!localStarted) {
        localStarted = true;
        await firstLocal.promise;
      }
      return bitmap(await blob.text());
    },
  });
  const m = h.manager,
    recent = view(159.21303687393092, -58.62016558917656, 0.01);
  const prepared = m.prepare('scope-photo', recent, true, 2000);
  const localCount = m.views.get('scope-photo').tiles.filter((tile) => tile.provider.tiles).length;
  await until(() => localStarted && m.status('scope-photo').failed > 0);
  assert.equal(m.status('scope-photo').loading, true);
  firstLocal.resolve();
  const result = await prepared;
  assert.equal(result.ready, localCount);
  assert.ok(result.failed > 0);
  assert.equal(result.loading, false);
  await settle(m);
  m.dispose();
}

console.log(
  'Sky detail: shared loads, 48-tile budget, export priority, corruption/failure fallback, stale/clear/dispose safety and offline local channel passed'
);
