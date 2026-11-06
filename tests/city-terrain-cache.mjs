import assert from 'node:assert/strict';
import { CityTerrainCache, CITY_TERRAIN_CACHE_BYTES } from '../src/city-terrain-cache.js';

const tile = (text) => ({ buffer: new TextEncoder().encode(text).buffer, mimeType: 'image/avif' });
const text = (record) => (record ? new TextDecoder().decode(record.buffer) : null);
const meta = (id) => ({
  id,
  name: id,
  names: [id],
  center: [116.4, 39.9],
  bounds: [116.3, 39.8, 116.5, 40],
  year: 2024,
  source: { id: 'test', license: 'test-only' },
  tileSize: 512,
  gutter: 4,
  maxLevel: 2,
});
const rowId = (id, key) => JSON.stringify([id, key]);
const rejectsCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);

// Transactions share a lock across connections and clone at commit boundaries.
// The double can abort after LRU deletion, proving that eviction is rolled back.
function fakeIndexedDB() {
  const data = new Map();
  const controls = {
    data,
    trace: [],
    connections: [],
    paused: false,
    failPutStore: null,
    failTransaction: false,
  };
  const queue = [];
  let running = null;
  function pump() {
    if (running || controls.paused) return;
    while (queue.length) {
      const item = queue.shift();
      if (item.tx.done) continue;
      running = item.tx;
      queueMicrotask(item.start);
      break;
    }
  }
  controls.resume = () => {
    controls.paused = false;
    pump();
  };
  function connect() {
    const db = { closed: false };
    controls.connections.push(db);
    db.close = () => {
      db.closed = true;
    };
    db.createObjectStore = (name) => {
      data.set(name, new Map());
      return { createIndex() {} };
    };
    db.transaction = (names, mode) => {
      if (db.closed) throw new DOMException('closed', 'InvalidStateError');
      if (controls.failTransaction) throw new DOMException('storage error', 'UnknownError');
      const tx = { error: null, done: false };
      let started = false,
        pending = 0,
        commitScheduled = false,
        draft;
      const tasks = [];
      function finish(error) {
        if (tx.done) return;
        tx.done = true;
        if (error) {
          tx.error = error;
          tx.onabort?.();
        } else {
          if (mode === 'readwrite') for (const name of names) data.set(name, draft.get(name));
          tx.oncomplete?.();
        }
        if (running === tx) running = null;
        pump();
      }
      tx.abort = () => finish(new DOMException('aborted', 'AbortError'));
      function commitSoon() {
        if (!started || pending || commitScheduled || tx.done) return;
        commitScheduled = true;
        queueMicrotask(() => {
          commitScheduled = false;
          if (!pending && !tx.done) finish();
        });
      }
      function request(work, reuse) {
        const req = reuse || {};
        pending++;
        const run = () => {
          if (tx.done) return;
          try {
            req.result = work();
            req.onsuccess?.({ target: req });
          } catch (error) {
            finish(error);
          } finally {
            pending--;
            commitSoon();
          }
        };
        if (started) queueMicrotask(run);
        else tasks.push(run);
        return req;
      }
      tx.objectStore = (name) => {
        assert.ok(names.includes(name));
        const trace = (operation, key) => controls.trace.push({ name, mode, operation, key });
        return {
          get: (key) =>
            request(() => {
              trace('get', key);
              return structuredClone(draft.get(name).get(key));
            }),
          getAll: () =>
            request(() => {
              assert.equal(name, 'cities', 'bulk payload reads are forbidden');
              trace('getAll');
              return structuredClone([...draft.get(name).values()]);
            }),
          put: (record) =>
            request(() => {
              assert.equal(mode, 'readwrite');
              trace('put', record.id);
              if (controls.failPutStore === name)
                throw new DOMException('quota', 'QuotaExceededError');
              draft.get(name).set(record.id, structuredClone(record));
              return record.id;
            }),
          delete: (key) =>
            request(() => {
              assert.equal(mode, 'readwrite');
              trace('delete', key);
              draft.get(name).delete(key);
            }),
          index: (index) => {
            assert.equal(name, 'tiles');
            assert.equal(index, 'cityId');
            return {
              openKeyCursor(cityId) {
                const seen = new Set();
                let req;
                const next = () => {
                  trace('keyCursor', cityId);
                  const row = [...draft.get(name).values()].find(
                    (record) => record.cityId === cityId && !seen.has(record.id)
                  );
                  if (!row) return null;
                  seen.add(row.id);
                  return { key: cityId, primaryKey: row.id, continue: () => request(next, req) };
                };
                req = request(next);
                return req;
              },
            };
          },
        };
      };
      queue.push({
        tx,
        start() {
          if (tx.done) {
            if (running === tx) running = null;
            pump();
            return;
          }
          draft = new Map(names.map((name) => [name, structuredClone(data.get(name))]));
          started = true;
          for (const task of tasks) queueMicrotask(task);
          commitSoon();
        },
      });
      pump();
      return tx;
    };
    return db;
  }
  return {
    controls,
    backend: {
      open() {
        const request = {};
        queueMicrotask(() => {
          request.result = connect();
          if (!data.size) request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    },
  };
}

assert.equal(CITY_TERRAIN_CACHE_BYTES, 512 * 1024 * 1024);

// Whole-city LRU, actual compressed bytes, immutable payloads and replacements.
{
  const { backend, controls } = fakeIndexedDB();
  const cache = new CityTerrainCache({ indexedDB: backend, maxBytes: 8 });
  const oldB = await cache.getEpoch('b');
  const input = tile('aa');
  const first = cache.putTile(meta('a'), '0/0/0', input);
  new Uint8Array(input.buffer).fill(90);
  input.mimeType = 'wrong/type';
  await first;
  await cache.putTile(meta('a'), '1/0/0', tile('bb'));
  await cache.putTile(meta('b'), '0/0/0', tile('cccc'));
  const read = await cache.getTile('a', '0/0/0');
  assert.equal(text(read), 'aa');
  assert.equal(read.mimeType, 'image/avif');
  new Uint8Array(read.buffer).fill(88);
  assert.equal(text(await cache.getTile('a', '0/0/0')), 'aa');
  await cache.putTile(meta('c'), '0/0/0', tile('dddd'));
  assert.equal(await cache.getTile('b', '0/0/0'), null);
  assert.deepEqual((await cache.list()).map((city) => city.id).sort(), ['a', 'c']);
  assert.equal((await cache.stats()).bytes, 8);
  await rejectsCode(cache.putTile(meta('b'), '0/0/0', tile('b'), { epoch: oldB }), 'stale');
  await cache.putTile(meta('a'), '0/0/0', tile('a'));
  assert.equal((await cache.stats()).bytes, 7);
  assert.equal((await cache.list()).find((city) => city.id === 'a').tileCount, 2);
  assert.ok(
    [...controls.data.get('payloads').values()].every(
      (payload) => payload.buffer instanceof ArrayBuffer
    )
  );
  assert.ok(controls.trace.some((entry) => entry.operation === 'keyCursor'));
  cache.close();
  const reopened = new CityTerrainCache({ indexedDB: backend, maxBytes: 8 });
  assert.equal(text(await reopened.getTile('a', '0/0/0')), 'a');
  reopened.close();
}

// Explicit partial downloads remain pinned; completion means every persisted tile exists.
{
  const { backend, controls } = fakeIndexedDB();
  const cache = new CityTerrainCache({ indexedDB: backend, maxBytes: 20 });
  const epoch = await cache.getEpoch('download');
  await cache.putTile(meta('download'), '0/0/0', tile('one'), { pinned: true, epoch });
  assert.equal(await cache.markComplete('download', ['0/0/0', '1/0/0'], { epoch }), false);
  assert.equal((await cache.list())[0].pinned, true);
  await cache.putTile(meta('temporary'), '0/0/0', tile('tmp'));
  assert.equal(await cache.clearTemporary(), 1);
  assert.equal((await cache.list())[0].id, 'download');
  await cache.putTile(meta('download'), '1/0/0', tile('two'), { pinned: true, epoch });
  assert.equal(await cache.markComplete('download', new Set(['0/0/0', '1/0/0']), { epoch }), true);
  const saved = (await cache.list())[0];
  assert.equal(saved.complete, true);
  assert.equal(saved.expectedTileCount, 2);
  assert.equal(saved.bytes, 6);
  assert.deepEqual(saved.bounds, meta('download').bounds);
  await cache.putTile(meta('download'), '1/0/0', tile('2'), { pinned: false, epoch });
  assert.equal(
    (await cache.list())[0].pinned,
    true,
    'a routine write cannot unpin an explicit download'
  );
  assert.equal(
    (await cache.list())[0].complete,
    false,
    'new writes require a fresh completion check'
  );
  assert.equal(await cache.markComplete('download', ['0/0/0', '1/0/0'], { epoch }), true);
  controls.data.get('payloads').get(rowId('download', '1/0/0')).buffer = new ArrayBuffer(0);
  assert.equal(await cache.markComplete('download', ['0/0/0', '1/0/0'], { epoch }), false);
  assert.equal(await cache.getTile('download', '1/0/0'), null);
  assert.equal((await cache.list())[0].tileCount, 1);
  assert.equal((await cache.stats()).bytes, 3);
  controls.data.get('payloads').delete(rowId('download', '0/0/0'));
  assert.equal(await cache.markComplete('download', ['0/0/0'], { epoch }), false);
  assert.equal(await cache.getTile('download', '0/0/0'), null);
  assert.equal((await cache.list())[0].bytes, 0);
  assert.equal((await cache.list())[0].pinned, true);
  await rejectsCode(cache.markComplete('download', []), 'invalid');
  cache.close();
}

// Capacity and browser quota abort atomically, including attempted temporary evictions.
{
  const { backend, controls } = fakeIndexedDB();
  const cache = new CityTerrainCache({ indexedDB: backend, maxBytes: 16 });
  await cache.putTile(meta('fixed'), '0/0/0', tile('12345678'), { pinned: true });
  await cache.putTile(meta('temp'), '0/0/0', tile('abcdefgh'));
  const original = structuredClone(controls.data);
  await rejectsCode(
    cache.putTile(meta('too-big'), '0/0/0', tile('abcdefghijkl'), { pinned: true }),
    'quota'
  );
  assert.deepEqual(
    controls.data,
    original,
    'failed eviction must restore temporary data and epochs'
  );
  controls.failPutStore = 'payloads';
  await rejectsCode(
    cache.putTile(meta('new'), '0/0/0', tile('abcdefgh'), { pinned: true }),
    'quota'
  );
  assert.deepEqual(controls.data, original, 'native quota after eviction must also roll back');
  controls.failPutStore = 'cities';
  assert.equal(
    text(await cache.getTile('fixed', '0/0/0')),
    '12345678',
    'full storage does not disable existing package reads'
  );
  controls.failPutStore = null;
  await cache.putTile(meta('new'), '0/0/0', tile('abcdefgh'), { pinned: true });
  assert.equal((await cache.stats()).bytes, 16);
  assert.equal((await cache.stats()).pinnedBytes, 16);
  await rejectsCode(cache.putTile(meta('more'), '0/0/0', tile('x')), 'quota');
  assert.equal(await cache.clearTemporary(), 0);
  assert.equal((await cache.list()).length, 2);
  const smaller = new CityTerrainCache({ indexedDB: backend, maxBytes: 4 });
  assert.equal((await smaller.stats()).overBudget, true);
  assert.equal(
    (await smaller.list()).length,
    2,
    'lowering a limit never silently deletes fixed packages'
  );
  smaller.close();
  cache.close();
}

// City deletion invalidates queued writes immediately, and download tokens across connections.
{
  const { backend, controls } = fakeIndexedDB();
  const cache = new CityTerrainCache({ indexedDB: backend, maxBytes: 30 });
  const second = new CityTerrainCache({ indexedDB: backend, maxBytes: 30 });
  const epoch = await second.getEpoch('city');
  await cache.putTile(meta('city'), '0/0/0', tile('old'), { pinned: true, epoch });
  controls.paused = true;
  const late = cache.putTile(meta('city'), '1/0/0', tile('late'), { pinned: true, epoch });
  const removing = cache.remove('city');
  controls.resume();
  await rejectsCode(late, 'stale');
  assert.equal(await removing, true);
  assert.equal((await cache.stats()).bytes, 0);
  await rejectsCode(
    second.putTile(meta('city'), '1/0/0', tile('old-job'), { pinned: true, epoch }),
    'stale'
  );
  await rejectsCode(second.markComplete('city', ['0/0/0'], { epoch }), 'stale');
  const freshEpoch = await second.getEpoch('city');
  assert.ok(freshEpoch > epoch);
  await second.putTile(meta('city'), '0/0/0', tile('new'), { pinned: true, epoch: freshEpoch });
  await rejectsCode(cache.putTile(meta('city'), '1/0/0', tile('old-job'), { epoch }), 'stale');
  assert.equal(text(await cache.getTile('city', '0/0/0')), 'new');
  const reading = cache.getTile('city', '0/0/0');
  const deleting = cache.remove('city');
  assert.equal(await reading, null);
  await deleting;
  assert.equal((await cache.list()).length, 0, 'an old read-touch cannot recreate a removed city');
  cache.close();
  second.close();
}

// Clearing temporary data cancels earlier uncommitted temporary writes, not pinned work.
{
  const { backend } = fakeIndexedDB();
  const cache = new CityTerrainCache({ indexedDB: backend });
  const temporary = cache.putTile(meta('late-temp'), '0/0/0', tile('tmp'));
  const fixed = cache.putTile(meta('fixed'), '0/0/0', tile('pin'), { pinned: true });
  const clearing = cache.clearTemporary();
  await rejectsCode(temporary, 'stale');
  await fixed;
  await clearing;
  assert.deepEqual(
    (await cache.list()).map((city) => city.id),
    ['fixed']
  );
  cache.close();
}

// Concurrent connections use one global byte budget, with no duplicated tile accounting.
{
  const { backend } = fakeIndexedDB();
  const a = new CityTerrainCache({ indexedDB: backend, maxBytes: 16 });
  const b = new CityTerrainCache({ indexedDB: backend, maxBytes: 16 });
  const writes = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) =>
      (i % 2 ? a : b).putTile(meta(`fixed-${i}`), '0/0/0', tile('xx'), { pinned: true })
    )
  );
  assert.equal(writes.filter((entry) => entry.status === 'fulfilled').length, 8);
  assert.ok(
    writes
      .filter((entry) => entry.status === 'rejected')
      .every((entry) => entry.reason.code === 'quota')
  );
  assert.equal((await a.stats()).bytes, 16);
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? a : b).putTile(meta('fixed-0'), '0/0/0', tile('zz'), { pinned: true })
    )
  );
  assert.equal((await a.stats()).tileCount, 8);
  assert.equal((await a.stats()).bytes, 16);
  a.close();
  b.close();
}

// No silent in-memory success when persistent offline storage is unavailable.
for (const backend of [
  null,
  {
    open() {
      throw new DOMException('denied', 'SecurityError');
    },
  },
]) {
  const cache = new CityTerrainCache({ indexedDB: backend });
  assert.equal((await cache.stats()).persistent, false);
  assert.equal((await cache.stats()).error, 'unavailable');
  assert.deepEqual(await cache.list(), []);
  assert.equal(await cache.getTile('city', '0/0/0'), null);
  await rejectsCode(cache.putTile(meta('city'), '0/0/0', tile('no')), 'unavailable');
  await rejectsCode(cache.markComplete('city', ['0/0/0']), 'unavailable');
  await rejectsCode(cache.remove('city'), 'unavailable');
  cache.close();
}

// Open timeout closes a late connection; close aborts queued writes.
{
  let request,
    closed = false;
  const blocked = new CityTerrainCache({
    indexedDB: {
      open() {
        return (request = {});
      },
    },
    openTimeoutMs: 1,
  });
  assert.equal((await blocked.stats()).persistent, false);
  request.result = {
    close() {
      closed = true;
    },
  };
  request.onsuccess();
  assert.equal(closed, true);
  blocked.close();
  const { backend, controls } = fakeIndexedDB();
  const cache = new CityTerrainCache({ indexedDB: backend });
  const epoch = await cache.getEpoch('closed');
  controls.paused = true;
  const writing = cache.putTile(meta('closed'), '0/0/0', tile('no'), { epoch });
  await Promise.resolve();
  await Promise.resolve();
  cache.close();
  controls.resume();
  await assert.rejects(writing);
  assert.equal(controls.data.get('payloads').size, 0);
  await rejectsCode(cache.putTile(meta('closed'), '0/0/0', tile('no')), 'closed');
  assert.equal((await cache.stats()).persistent, false);
}

console.log(
  'City terrain cache: atomic byte budgets/LRU, pinned partial/offline packages, full-payload completeness, epoch invalidation, cross-connection races and unavailable storage passed'
);
