import assert from 'node:assert/strict';
import { createSkyTileCache } from '../src/sky-detail-cache.js';

const blob = (text) => new Blob([text], { type: 'image/avif' });
const content = async (cache, key) => (await cache.get(key))?.text() ?? null;

// Small asynchronous, transactional IDB double. Payloads and metadata are cloned
// at commit boundaries; a failed write rolls back preceding LRU deletions too.
function fakeIndexedDB() {
  const data = new Map();
  const controls = { data, trace: [], failPutStore: null, failTransaction: false, connections: [] };
  const waiting = [];
  let active = false;
  function pump() {
    if (active || !waiting.length) return;
    active = true;
    queueMicrotask(waiting.shift());
  }
  function connect() {
    const db = { closed: false };
    controls.connections.push(db);
    db.close = () => (db.closed = true);
    db.createObjectStore = (name) => {
      data.set(name, new Map());
      return { createIndex() {} };
    };
    db.transaction = (names, mode) => {
      if (db.closed) throw new DOMException('closed', 'InvalidStateError');
      if (controls.failTransaction) throw new DOMException('unavailable', 'UnknownError');
      const tx = { error: null };
      const tasks = [];
      let draft, started = false, pending = 0, aborted = false, commitScheduled = false;
      function finish(error) {
        if (aborted) return;
        if (error) {
          aborted = true;
          tx.error = error;
          tx.onabort?.();
        } else {
          if (mode === 'readwrite') for (const name of names) data.set(name, draft.get(name));
          tx.oncomplete?.();
        }
        active = false;
        pump();
      }
      function scheduleCommit() {
        if (pending || commitScheduled || aborted) return;
        commitScheduled = true;
        queueMicrotask(() => {
          commitScheduled = false;
          if (!pending && !aborted) finish();
        });
      }
      function request(work, reuse) {
        const req = reuse || {};
        pending++;
        const run = () => {
          if (aborted) return;
          try {
            req.result = work();
            req.onsuccess?.({ target: req });
          } catch (error) {
            finish(error);
          } finally {
            pending--;
            scheduleCommit();
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
          get: (key) => request(() => {
            trace('get', key);
            return structuredClone(draft.get(name).get(key));
          }),
          put: (record) => request(() => {
            trace('put', record.id);
            assert.equal(mode, 'readwrite');
            if (controls.failPutStore === name) throw new DOMException('quota', 'QuotaExceededError');
            draft.get(name).set(record.id, structuredClone(record));
            return record.id;
          }),
          delete: (key) => request(() => {
            trace('delete', key);
            assert.equal(mode, 'readwrite');
            draft.get(name).delete(key);
          }),
          clear: () => request(() => {
            trace('clear');
            assert.equal(mode, 'readwrite');
            draft.get(name).clear();
          }),
          index: (index) => {
            assert.equal(name, 'entries');
            assert.equal(index, 'used');
            return {
              openCursor() {
                let seen = new Set(), req;
                const next = () => {
                  trace('cursor');
                  const row = [...draft.get(name).values()]
                    .filter((row) => !seen.has(row.id))
                    .sort((a, b) => a.used - b.used || a.id.localeCompare(b.id))[0];
                  if (!row) return null;
                  seen.add(row.id);
                  return { value: structuredClone(row), continue: () => request(next, req) };
                };
                req = request(next);
                return req;
              },
            };
          },
          getAll() { throw Error('Bulk reads of image payloads are forbidden'); },
        };
      };
      waiting.push(() => {
        draft = new Map(names.map((name) => [name, structuredClone(data.get(name))]));
        started = true;
        for (const task of tasks) queueMicrotask(task);
        scheduleCommit();
      });
      pump();
      return tx;
    };
    return db;
  }
  const backend = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = connect();
        if (!data.size) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
  return { backend, controls };
}

const memory = createSkyTileCache({ indexedDB: null, maxBytes: 30, memoryMaxBytes: 8, maxTileBytes: 8 });
await memory.put('a', blob('aaaa'));
await memory.put('b', blob('bbbb'));
assert.equal(await content(memory, 'a'), 'aaaa');
await memory.put('c', blob('cccc'));
assert.equal(await content(memory, 'b'), null, 'memory fallback evicts least recently read');
assert.equal(await content(memory, 'a'), 'aaaa');
assert.equal(await content(memory, 'c'), 'cccc');
assert.deepEqual(await memory.stats(), {
  bytes: 8, count: 2, persistent: false, writable: false, maxBytes: 30,
  memoryBytes: 8, memoryCount: 2, memoryMaxBytes: 8,
});
await memory.put('a', blob('aa'));
assert.equal((await memory.stats()).bytes, 6, 'replacement subtracts the old byte size');
const one = await memory.get('a'), two = await memory.get('a');
assert.notEqual(one, two, 'each read gets an independent immutable Blob');
assert.equal(one.type, 'image/avif');
assert.equal(await memory.put('too-large', blob('123456789')), false);
assert.equal(await memory.put('', blob('1')), false);
assert.equal(await memory.put('empty', blob('')), false);

const { backend, controls } = fakeIndexedDB();
const disk = createSkyTileCache({ indexedDB: backend, maxBytes: 8, memoryMaxBytes: 4 });
await disk.put('a', blob('aaaa'));
await disk.put('b', blob('bbbb'));
await disk.get('a');
await disk.put('c', blob('cccc'));
assert.equal(await content(disk, 'b'), null);
assert.equal(await content(disk, 'a'), 'aaaa');
assert.equal(await content(disk, 'c'), 'cccc');
assert.equal((await disk.stats()).bytes, 8);
assert.equal((await disk.stats()).count, 2);
assert.equal(controls.data.get('payloads').size, 2);
assert.ok([...controls.data.get('payloads').values()].every((row) => row.buffer instanceof ArrayBuffer));
await disk.put('a', blob('a'));
assert.equal((await disk.stats()).bytes, 5);

// Quota abort after the eviction starts must retain every previous disk row.
controls.failPutStore = 'payloads';
const original = structuredClone(controls.data);
assert.equal(await disk.put('q', blob('qqqq')), true, 'failed disk write can use bounded memory');
assert.deepEqual(controls.data, original, 'quota failure rolls the disk transaction back');
assert.equal((await disk.stats()).bytes, 5, 'disk usage does not masquerade as memory usage');
assert.equal((await disk.stats()).memoryBytes, 4);
assert.equal((await disk.stats()).persistent, true);
assert.equal((await disk.stats()).writable, false);
assert.equal(await content(disk, 'q'), 'qqqq');
assert.equal(await content(disk, 'a'), 'a', 'existing disk records remain readable after quota failure');
controls.failPutStore = null;
await disk.put('r', blob('rrrr'));
assert.equal((await disk.stats()).memoryBytes, 4);
assert.equal(await content(disk, 'q'), null, 'fallback memory also stays bounded after quota errors');
assert.equal(await disk.clear(), true);
assert.equal((await disk.stats()).bytes, 0);
assert.equal((await disk.stats()).memoryBytes, 0);
assert.equal((await disk.stats()).writable, true);
await disk.put('restored', blob('1234'));
assert.equal((await disk.stats()).bytes, 4);

// A stale WebKit-style backing record is a miss, and its true bytes are removed.
const badId = JSON.stringify(['sky-v1', 'restored']);
controls.data.get('payloads').set(badId, { id: badId, buffer: new ArrayBuffer(1), type: 'image/avif' });
assert.equal(await disk.get('restored'), null);
assert.equal((await disk.stats()).bytes, 0);
assert.equal((await disk.stats()).count, 0);
assert.equal(controls.data.get('payloads').size, 0);

const namespaceA = createSkyTileCache({ indexedDB: backend, namespace: 'catalog-v1', maxBytes: 12 });
const namespaceB = createSkyTileCache({ indexedDB: backend, namespace: 'catalog-v2', maxBytes: 12 });
await Promise.all([namespaceA.put('same', blob('111')), namespaceB.put('same', blob('22222'))]);
assert.equal(await content(namespaceA, 'same'), '111');
assert.equal(await content(namespaceB, 'same'), '22222');
assert.equal((await namespaceA.stats()).bytes, 8, 'disk budget covers all namespaces');
assert.equal((await namespaceA.stats()).count, 2);
const smaller = createSkyTileCache({ indexedDB: backend, maxBytes: 5 });
assert.equal((await smaller.stats()).bytes, 5, 'opening a smaller budget trims existing records');
assert.equal(await content(namespaceA, 'same'), null);
assert.equal(await content(namespaceB, 'same'), '22222');

// clear() must complete while an earlier Blob conversion is still unresolved.
let release;
class SlowBlob extends Blob {
  arrayBuffer() { return new Promise((resolve) => { release = resolve; }); }
}
const late = smaller.put('late', new SlowBlob(['1234']));
assert.equal(await smaller.clear(), true);
release(new TextEncoder().encode('1234').buffer);
assert.equal(await late, false);
assert.equal((await smaller.stats()).count, 0);
assert.equal(await smaller.get('late'), null);
await smaller.put('before-clear', blob('123'));
const oldRead = smaller.get('before-clear');
const clearing = smaller.clear();
assert.equal(await oldRead, null, 'a queued read is invalidated immediately by clear');
assert.equal(await clearing, true);
assert.equal((await smaller.stats()).count, 0, 'read-touch does not resurrect a cleared record');

// Two connections share a transactional byte budget, even with concurrent puts.
await Promise.all(Array.from({ length: 20 }, (_, index) =>
  (index % 2 ? namespaceA : namespaceB).put(`parallel-${index}`, blob('xy'))));
assert.equal((await namespaceA.stats()).bytes, 12);
assert.equal((await namespaceA.stats()).count, 6);
assert.equal(controls.data.get('payloads').size, 6);

// An unavailable or blocked backend is never a fatal resource-load error.
const denied = createSkyTileCache({ indexedDB: { open() { throw new DOMException('private mode', 'SecurityError'); } } });
assert.equal(await denied.put('private', blob('ok')), true);
assert.equal(await content(denied, 'private'), 'ok');
assert.equal((await denied.stats()).persistent, false);
let lateRequest, lateClosed = false;
const blocked = createSkyTileCache({ indexedDB: { open() { return (lateRequest = {}); } }, openTimeoutMs: 1 });
assert.equal((await blocked.stats()).persistent, false);
lateRequest.result = { close() { lateClosed = true; } };
lateRequest.onsuccess();
assert.equal(lateClosed, true, 'a late open success is closed after timeout fallback');

controls.failTransaction = true;
assert.equal(await namespaceA.clear(), false, 'failed persistent erase is not reported as success');
assert.equal(await namespaceA.clear(), false, 'disabling a known disk store does not pretend it was erased');
controls.failTransaction = false;
const disposal = createSkyTileCache({ indexedDB: null });
const discarded = disposal.put('late', new SlowBlob(['1234']));
disposal.dispose();
release(new TextEncoder().encode('1234').buffer);
assert.equal(await discarded, false);
assert.equal(await disposal.get('late'), null);
assert.equal((await disposal.stats()).bytes, 0);

for (const cache of [memory, disk, namespaceA, namespaceB, smaller, denied, blocked]) cache.dispose();
console.log('Sky detail cache: byte limits, LRU, independent payloads, atomic quota rollback, namespace isolation, corruption recovery, concurrent clear/dispose, and unavailable IDB passed');
