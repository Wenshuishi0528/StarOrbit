export const SKY_TILE_CACHE_BYTES = 1_000_000_000;
export const SKY_TILE_MEMORY_BYTES = 16 * 1024 * 1024;
export const SKY_TILE_MAX_BYTES = 2_000_000;

const TOTALS = 'totals';
const STORES = ['entries', 'payloads', 'state'];
const emptyTotals = () => ({ id: TOTALS, bytes: 0, count: 0, tick: 0 });
const quotaError = (error) => error?.name === 'QuotaExceededError';

function limit(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

// Metadata and payloads are separate: an LRU eviction never reads unrelated
// image bytes. Every eviction, insertion and byte counter commits atomically.
function transaction(db, mode, action) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('Sky cache transaction failed'));
      action(Object.fromEntries(STORES.map((name) => [name, tx.objectStore(name)])), (value) => {
        result = value;
      });
    } catch (error) {
      reject(error);
    }
  });
}

function readTotals(store, callback) {
  const request = store.get(TOTALS);
  request.onsuccess = () => callback(request.result || emptyTotals());
}

function evict(stores, totals, maximum, done) {
  if (totals.bytes <= maximum) return done();
  const request = stores.entries.index('used').openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      // A legacy/incomplete counter cannot keep a supposedly full cache stuck.
      totals.bytes = 0;
      totals.count = 0;
      done();
      return;
    }
    const entry = cursor.value;
    stores.entries.delete(entry.id);
    stores.payloads.delete(entry.id);
    totals.bytes = Math.max(0, totals.bytes - entry.size);
    totals.count = Math.max(0, totals.count - 1);
    if (totals.bytes > maximum) cursor.continue();
    else done();
  };
}

/**
 * A compressed-tile cache shared by all views. The caller's key should include
 * the source revision and tile address; namespace additionally isolates schemas.
 * `bytes/count` describe disk when persistent, otherwise the bounded memory cache.
 * Memory fallback is reported separately while an existing disk cache is readable.
 */
export function createSkyTileCache(options = {}) {
  const maxBytes = limit(options.maxBytes, SKY_TILE_CACHE_BYTES);
  const maxTileBytes = limit(options.maxTileBytes, SKY_TILE_MAX_BYTES);
  const memoryMaxBytes = Math.min(maxBytes, limit(options.memoryMaxBytes, SKY_TILE_MEMORY_BYTES));
  const database = options.database || 'starorbit-sky-tiles-v1';
  const namespace = String(options.namespace ?? 'sky-v1');
  const openTimeoutMs = limit(options.openTimeoutMs, 3000);
  const memory = new Map();
  let memoryBytes = 0;
  let db = null;
  let ready = null;
  let initialized = false;
  let diskSeen = false;
  let writable = true;
  let disposed = false;
  let generation = 0;
  let queue = Promise.resolve();
  let finishOpen = null;

  function identify(key) {
    return typeof key === 'string' && key.length > 0 && key.length <= 4096
      ? JSON.stringify([namespace, key])
      : null;
  }
  function serial(action) {
    const next = queue.then(action, action);
    queue = next.catch(() => {});
    return next;
  }
  function disableDisk() {
    const current = db;
    db = null;
    current?.close();
    writable = false;
    ready = Promise.resolve(null);
  }
  function open() {
    if (disposed) return Promise.resolve(null);
    return (ready ??= new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => finish(null), openTimeoutMs);
      const finish = (connection) => {
        if (settled || disposed) {
          connection?.close();
          if (settled) return;
          connection = null;
        }
        settled = true;
        clearTimeout(timer);
        db = connection;
        diskSeen ||= !!connection;
        writable = !!connection;
        finishOpen = null;
        resolve(connection);
      };
      finishOpen = finish;
      try {
        const backend = Object.hasOwn(options, 'indexedDB')
          ? options.indexedDB
          : globalThis.indexedDB;
        if (!backend) return finish(null);
        const request = backend.open(database, 1);
        request.onupgradeneeded = () => {
          const connection = request.result;
          const entries = connection.createObjectStore('entries', { keyPath: 'id' });
          entries.createIndex('used', 'used');
          connection.createObjectStore('payloads', { keyPath: 'id' });
          connection.createObjectStore('state', { keyPath: 'id' });
        };
        request.onsuccess = () => {
          const connection = request.result;
          connection.onversionchange = () => {
            if (db === connection) disableDisk();
            else connection.close();
          };
          connection.onclose = () => {
            if (db === connection) disableDisk();
          };
          finish(connection);
        };
        request.onerror = request.onblocked = () => finish(null);
      } catch {
        finish(null);
      }
    }));
  }
  async function connection() {
    const current = await open();
    if (!current || disposed) return null;
    if (!initialized) {
      await transaction(current, 'readwrite', (stores) => {
        readTotals(stores.state, (totals) => {
          if (totals.bytes > maxBytes)
            evict(stores, totals, maxBytes, () => stores.state.put(totals));
        });
      });
      initialized = true;
    }
    return current;
  }
  function forgetMemory(id) {
    const old = memory.get(id);
    if (old) memoryBytes -= old.buffer.byteLength;
    memory.delete(id);
  }
  function remember(id, record) {
    forgetMemory(id);
    if (record.buffer.byteLength > memoryMaxBytes) return false;
    while (memoryBytes + record.buffer.byteLength > memoryMaxBytes) {
      forgetMemory(memory.keys().next().value);
    }
    memory.set(id, record);
    memoryBytes += record.buffer.byteLength;
    return true;
  }
  function blobOf(record) {
    return new Blob([record.buffer], { type: record.type });
  }
  function usable(entry, payload) {
    return (
      entry &&
      Number.isSafeInteger(entry.size) &&
      entry.size > 0 &&
      entry.size <= Math.min(maxTileBytes, maxBytes) &&
      payload?.buffer instanceof ArrayBuffer &&
      payload.buffer.byteLength === entry.size &&
      typeof payload.type === 'string'
    );
  }
  async function removeBad(current, id, expected) {
    await transaction(current, 'readwrite', (stores) => {
      const request = stores.entries.get(id);
      request.onsuccess = () => {
        const entry = request.result;
        // Another cache instance may have replaced this row after our read.
        if (entry?.used !== expected?.used) return;
        readTotals(stores.state, (totals) => {
          stores.entries.delete(id);
          stores.payloads.delete(id);
          totals.bytes = Math.max(0, totals.bytes - (entry?.size || 0));
          totals.count = Math.max(0, totals.count - (entry ? 1 : 0));
          stores.state.put(totals);
        });
      };
    });
  }

  function get(key) {
    const id = identify(key),
      epoch = generation;
    return serial(async () => {
      if (!id || disposed || epoch !== generation) return null;
      if (memory.has(id)) {
        const record = memory.get(id);
        memory.delete(id);
        memory.set(id, record);
        return blobOf(record);
      }
      try {
        const current = await connection();
        if (!current || disposed || epoch !== generation) return null;
        const pair = await transaction(current, 'readonly', (stores, result) => {
          const pair = {};
          result(pair);
          const entry = stores.entries.get(id),
            payload = stores.payloads.get(id);
          entry.onsuccess = () => (pair.entry = entry.result);
          payload.onsuccess = () => (pair.payload = payload.result);
        });
        if (disposed || epoch !== generation) return null;
        if (!usable(pair.entry, pair.payload)) {
          if (pair.entry || pair.payload) await removeBad(current, id, pair.entry);
          return null;
        }
        if (writable) {
          try {
            await transaction(current, 'readwrite', (stores) => {
              const request = stores.entries.get(id);
              request.onsuccess = () => {
                const entry = request.result;
                // Touch only the currently stored metadata, never restore a
                // payload from the earlier read after another instance cleared.
                if (!entry) return;
                readTotals(stores.state, (totals) => {
                  entry.used = ++totals.tick;
                  stores.entries.put(entry);
                  stores.state.put(totals);
                });
              };
            });
          } catch (error) {
            if (quotaError(error)) writable = false;
            else disableDisk();
          }
        }
        return disposed || epoch !== generation ? null : blobOf(pair.payload);
      } catch {
        disableDisk();
        return null;
      }
    });
  }

  async function put(key, blob) {
    const id = identify(key),
      epoch = generation;
    if (
      !id ||
      disposed ||
      !(blob instanceof Blob) ||
      blob.size <= 0 ||
      blob.size > Math.min(maxTileBytes, maxBytes)
    )
      return false;
    let buffer;
    try {
      // Outside the queue: a stalled conversion must not prevent clear().
      buffer = await blob.arrayBuffer();
    } catch {
      return false;
    }
    if (disposed || epoch !== generation || buffer.byteLength !== blob.size) return false;
    const payload = { id, buffer, type: blob.type };
    return serial(async () => {
      if (disposed || epoch !== generation) return false;
      try {
        const current = await connection();
        if (disposed || epoch !== generation) return false;
        if (current && writable) {
          await transaction(current, 'readwrite', (stores) => {
            const request = stores.entries.get(id);
            request.onsuccess = () => {
              const old = request.result;
              readTotals(stores.state, (totals) => {
                if (old) {
                  stores.entries.delete(id);
                  stores.payloads.delete(id);
                  totals.bytes -= old.size;
                  totals.count--;
                }
                evict(stores, totals, maxBytes - buffer.byteLength, () => {
                  stores.payloads.put(payload);
                  stores.entries.put({
                    id,
                    size: buffer.byteLength,
                    used: ++totals.tick,
                  });
                  totals.bytes += buffer.byteLength;
                  totals.count++;
                  stores.state.put(totals);
                });
              });
            };
          });
          forgetMemory(id);
          return !disposed && epoch === generation;
        }
      } catch (error) {
        if (quotaError(error) && db) writable = false;
        else disableDisk();
      }
      return !disposed && epoch === generation && remember(id, payload);
    });
  }

  function stats() {
    return serial(async () => {
      let totals;
      if (!disposed) {
        try {
          const current = await connection();
          if (current)
            totals = await transaction(current, 'readonly', (stores, result) => {
              readTotals(stores.state, result);
            });
        } catch {
          disableDisk();
        }
      }
      return {
        bytes: totals?.bytes ?? memoryBytes,
        count: totals?.count ?? memory.size,
        persistent: !!db,
        writable: !!db && writable,
        maxBytes,
        memoryBytes,
        memoryCount: memory.size,
        memoryMaxBytes,
      };
    });
  }

  function clear() {
    generation++;
    memory.clear();
    memoryBytes = 0;
    return serial(async () => {
      if (disposed) return false;
      try {
        const current = await open();
        if (!current) return !diskSeen;
        await transaction(current, 'readwrite', (stores) => {
          for (const store of Object.values(stores)) store.clear();
          stores.state.put(emptyTotals());
        });
        initialized = true;
        writable = true;
        return true;
      } catch {
        disableDisk();
        return false;
      }
    });
  }

  function dispose() {
    disposed = true;
    generation++;
    memory.clear();
    memoryBytes = 0;
    finishOpen?.(null);
    disableDisk();
  }

  return { get, put, stats, clear, dispose };
}
