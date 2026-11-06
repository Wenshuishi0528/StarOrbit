export const CITY_TERRAIN_CACHE_BYTES = 512 * 1024 * 1024;
export const CITY_TERRAIN_MAX_TILE_BYTES = 2_000_000;

const STORES = ['cities', 'tiles', 'payloads', 'state'];
const epochKey = (id) => `epoch:${id}`;
const tileId = (cityId, key) => JSON.stringify([cityId, key]);
const limit = (value, fallback) => (Number.isSafeInteger(value) && value >= 0 ? value : fallback);
const publicMeta = ({ _used, _epoch, ...meta }) => meta;
const nextUse = (cities) => cities.reduce((latest, city) => Math.max(latest, city._used), 0) + 1;

export class CityTerrainCacheError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name =
      code === 'quota'
        ? 'QuotaExceededError'
        : code === 'stale'
          ? 'AbortError'
          : 'CityTerrainCacheError';
    this.code = code;
  }
}

function cacheError(error) {
  if (error instanceof CityTerrainCacheError) return error;
  return new CityTerrainCacheError(
    error?.name === 'QuotaExceededError' ? 'quota' : 'storage',
    error?.name === 'QuotaExceededError'
      ? 'City terrain storage quota exceeded'
      : 'City terrain storage failed',
    error
  );
}
function cityId(value) {
  if (typeof value !== 'string' || !value.length || value.length > 256)
    throw new CityTerrainCacheError('invalid', 'A city id is required');
  return value;
}
function tileKey(value) {
  if (
    typeof value !== 'string' ||
    value.length > 64 ||
    !/^\d+\/\d+\/\d+$/.test(value) ||
    !value.split('/').every((part) => Number.isSafeInteger(Number(part)))
  )
    throw new CityTerrainCacheError('invalid', 'A z/x/y tile key is required');
  return value;
}
function validTile(tile, payload, maximum) {
  return (
    tile &&
    Number.isSafeInteger(tile.bytes) &&
    tile.bytes > 0 &&
    tile.bytes <= maximum &&
    payload?.buffer instanceof ArrayBuffer &&
    payload.buffer.byteLength === tile.bytes &&
    typeof payload.mimeType === 'string' &&
    payload.mimeType.length > 0
  );
}

/** Compressed city packages only; no decoded images, GPU resources or HTTP cache.
 * Explicit downloads must pass pinned:true from their FIRST tile, including partial
 * downloads. Take getEpoch(id) once per download and pass it to putTile/markComplete;
 * remove()/LRU eviction invalidate that token across connections. Without an epoch,
 * a callback invoked after deletion is indistinguishable from a fresh user download.
 */
export class CityTerrainCache {
  constructor(options = {}) {
    this.maxBytes = limit(options.maxBytes, CITY_TERRAIN_CACHE_BYTES);
    this.maxTileBytes = limit(options.maxTileBytes, CITY_TERRAIN_MAX_TILE_BYTES);
    this.databaseName = options.databaseName || 'starorbit-city-terrain-v1';
    this.openTimeoutMs = limit(options.openTimeoutMs, 3000);
    try {
      this.backend = Object.hasOwn(options, 'indexedDB') ? options.indexedDB : globalThis.indexedDB;
    } catch {
      this.backend = null;
    }
    this.db = null;
    this.opening = null;
    this.finishOpen = null;
    this.closed = false;
    this.transactions = new Set();
    this.generations = new Map();
    this.temporaryGeneration = 0;
    this.failure = null;
  }

  open() {
    if (this.closed) return Promise.resolve(null);
    return (this.opening ??= new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => finish(null), this.openTimeoutMs);
      const finish = (db) => {
        if (settled || this.closed) {
          db?.close();
          if (settled) return;
          db = null;
        }
        settled = true;
        clearTimeout(timer);
        this.db = db;
        this.finishOpen = null;
        if (!db)
          this.failure = new CityTerrainCacheError(
            'unavailable',
            'Persistent city storage is unavailable'
          );
        resolve(db);
      };
      this.finishOpen = finish;
      try {
        if (!this.backend) return finish(null);
        const request = this.backend.open(this.databaseName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('cities', { keyPath: 'id' });
          db.createObjectStore('tiles', { keyPath: 'id' }).createIndex('cityId', 'cityId');
          db.createObjectStore('payloads', { keyPath: 'id' });
          db.createObjectStore('state', { keyPath: 'id' });
        };
        request.onsuccess = () => {
          const db = request.result;
          const detached = () => {
            if (this.db === db) {
              this.db = null;
              this.opening = Promise.resolve(null);
              this.failure = new CityTerrainCacheError(
                'unavailable',
                'City storage connection closed'
              );
            }
          };
          db.onclose = detached;
          db.onversionchange = () => {
            detached();
            db.close();
          };
          finish(db);
        };
        request.onerror = request.onblocked = () => finish(null);
      } catch {
        finish(null);
      }
    }));
  }

  async run(mode, action) {
    const db = await this.open();
    if (this.closed) throw new CityTerrainCacheError('closed', 'City storage is closed');
    if (!db) throw this.failure;
    return new Promise((resolve, reject) => {
      let tx, failure, result;
      const fail = (error) => {
        failure = cacheError(error);
        try {
          tx.abort();
        } catch {
          reject(failure);
        }
      };
      const watch = (request, callback) => {
        request.onsuccess = () => {
          try {
            callback(request.result);
          } catch (error) {
            fail(error);
          }
        };
      };
      try {
        tx = db.transaction(STORES, mode);
        this.transactions.add(tx);
        tx.oncomplete = () => {
          this.transactions.delete(tx);
          resolve(result);
        };
        tx.onerror = () => {
          failure ||= cacheError(tx.error);
        };
        tx.onabort = () => {
          this.transactions.delete(tx);
          reject(failure || cacheError(tx.error));
        };
        const stores = Object.fromEntries(STORES.map((name) => [name, tx.objectStore(name)]));
        action({
          stores,
          watch,
          fail,
          result: (value) => {
            result = value;
          },
        });
      } catch (error) {
        if (tx) fail(error);
        else reject(cacheError(error));
      }
    });
  }

  stamp(id) {
    return this.generations.get(id) || 0;
  }
  assertCurrent(id, stamp) {
    if (stamp !== this.stamp(id))
      throw new CityTerrainCacheError('stale', 'The city was removed during this operation');
  }
  assertEpoch(actual, expected) {
    if (!Number.isSafeInteger(expected) || expected < 0)
      throw new CityTerrainCacheError('invalid', 'A valid city epoch is required');
    if (actual !== expected)
      throw new CityTerrainCacheError('stale', 'The city download was removed or evicted');
  }
  async getEpoch(id) {
    cityId(id);
    const stamp = this.stamp(id);
    return this.run('readonly', ({ stores, watch, result }) => {
      watch(stores.state.get(epochKey(id)), (record) => {
        this.assertCurrent(id, stamp);
        result(record?.value || 0);
      });
    });
  }

  // Key-only iteration never materializes unrelated compressed image bytes.
  erase(context, id, done) {
    const { stores, watch } = context;
    watch(stores.state.get(epochKey(id)), (record) => {
      stores.state.put({ id: epochKey(id), value: (record?.value || 0) + 1 });
      stores.cities.delete(id);
      const request = stores.tiles.index('cityId').openKeyCursor(id);
      watch(request, (cursor) => {
        if (!cursor) return done();
        stores.tiles.delete(cursor.primaryKey);
        stores.payloads.delete(cursor.primaryKey);
        cursor.continue();
      });
    });
  }

  async list() {
    try {
      return await this.run('readonly', ({ stores, watch, result }) => {
        watch(stores.cities.getAll(), (cities) =>
          result(cities.sort((a, b) => b._used - a._used).map(publicMeta))
        );
      });
    } catch {
      return [];
    }
  }

  async getTile(id, key) {
    cityId(id);
    tileKey(key);
    const stamp = this.stamp(id),
      rowId = tileId(id, key);
    try {
      const pair = await this.run('readonly', ({ stores, watch, result }) => {
        watch(stores.cities.get(id), (city) => {
          if (!city) return result(null);
          watch(stores.tiles.get(rowId), (tile) => {
            watch(stores.payloads.get(rowId), (payload) => result({ city, tile, payload }));
          });
        });
      });
      if (!pair || stamp !== this.stamp(id) || this.closed) return null;
      const usable = validTile(pair.tile, pair.payload, this.maxTileBytes);
      let stillPresent = true;
      try {
        stillPresent = await this.run('readwrite', ({ stores, watch, result }) => {
          watch(stores.cities.get(id), (city) => {
            if (!city || city._epoch !== pair.city._epoch || stamp !== this.stamp(id))
              return result(false);
            if (!usable) {
              watch(stores.tiles.get(rowId), (current) => {
                if (current?.written !== pair.tile?.written) return result(false);
                stores.tiles.delete(rowId);
                stores.payloads.delete(rowId);
                city.bytes = Math.max(0, city.bytes - (current?.bytes || 0));
                city.tileCount = Math.max(0, city.tileCount - (current ? 1 : 0));
                city.complete = false;
                stores.cities.put(city);
                result(false);
              });
            } else {
              watch(stores.cities.getAll(), (cities) => {
                city._used = nextUse(cities);
                city.lastUsed = Date.now();
                stores.cities.put(city);
                result(true);
              });
            }
          });
        });
      } catch {
        // Reading an existing package still works when a metadata touch hits quota.
      }
      if (!usable || !stillPresent || stamp !== this.stamp(id) || this.closed) return null;
      return { buffer: pair.payload.buffer, mimeType: pair.payload.mimeType };
    } catch {
      return null;
    }
  }

  async putTile(meta, key, payload, { pinned = false, epoch } = {}) {
    const id = cityId(meta?.id);
    tileKey(key);
    const stamp = this.stamp(id),
      temporaryStamp = this.temporaryGeneration;
    const inputBuffer = payload?.buffer,
      mimeType = payload?.mimeType;
    if (
      !(inputBuffer instanceof ArrayBuffer) ||
      !inputBuffer.byteLength ||
      inputBuffer.byteLength > this.maxTileBytes ||
      typeof mimeType !== 'string' ||
      !mimeType.length ||
      mimeType.length > 128
    )
      throw new CityTerrainCacheError(
        'invalid',
        'A bounded compressed image buffer and MIME type are required'
      );
    let metadata, buffer;
    try {
      metadata = structuredClone(meta);
      buffer = inputBuffer.slice(0);
    } catch (error) {
      throw new CityTerrainCacheError('invalid', 'City metadata or image cannot be copied', error);
    }
    const expectedEpoch = epoch ?? (await this.getEpoch(id)),
      rowId = tileId(id, key);
    return this.run('readwrite', (context) => {
      const { stores, watch, result } = context;
      watch(stores.state.get(epochKey(id)), (record) => {
        this.assertCurrent(id, stamp);
        this.assertEpoch(record?.value || 0, expectedEpoch);
        watch(stores.cities.getAll(), (cities) => {
          const old = cities.find((city) => city.id === id);
          if (temporaryStamp !== this.temporaryGeneration && !(pinned || old?.pinned))
            throw new CityTerrainCacheError('stale', 'Temporary city cache was cleared');
          watch(stores.tiles.get(rowId), (previous) => {
            const delta = buffer.byteLength - (previous?.bytes || 0);
            const used = nextUse(cities);
            let bytes = cities.reduce((sum, city) => sum + city.bytes, 0) + delta;
            const candidates = cities
              .filter((city) => city.id !== id && !city.pinned)
              .sort((a, b) => a._used - b._used);
            const commit = () => {
              if (bytes > this.maxBytes) {
                const victim = candidates.shift();
                if (!victim)
                  throw new CityTerrainCacheError(
                    'quota',
                    'City cache is full; remove a downloaded city to make room'
                  );
                bytes -= victim.bytes;
                return this.erase(context, victim.id, commit);
              }
              stores.payloads.put({ id: rowId, buffer, mimeType });
              stores.tiles.put({
                id: rowId,
                cityId: id,
                key,
                bytes: buffer.byteLength,
                written: used,
              });
              stores.cities.put({
                ...metadata,
                id,
                bytes: (old?.bytes || 0) + delta,
                tileCount: (old?.tileCount || 0) + (previous ? 0 : 1),
                pinned: !!(pinned || old?.pinned),
                complete: false,
                expectedTileCount: old?.expectedTileCount || null,
                lastUsed: Date.now(),
                _used: used,
                _epoch: expectedEpoch,
              });
              result(true);
            };
            commit();
          });
        });
      });
    });
  }

  async markComplete(id, expectedKeys, { pinned = true, epoch } = {}) {
    cityId(id);
    if (!Array.isArray(expectedKeys) && !(expectedKeys instanceof Set))
      throw new CityTerrainCacheError('invalid', 'Expected tile keys are required');
    const keys = [...new Set(expectedKeys)].map(tileKey);
    if (!keys.length)
      throw new CityTerrainCacheError('invalid', 'An empty city is not an offline package');
    const stamp = this.stamp(id),
      expectedEpoch = epoch ?? (await this.getEpoch(id));
    return this.run('readwrite', ({ stores, watch, result }) => {
      watch(stores.state.get(epochKey(id)), (record) => {
        this.assertCurrent(id, stamp);
        this.assertEpoch(record?.value || 0, expectedEpoch);
        watch(stores.cities.get(id), (city) => {
          if (!city) return result(false);
          const finish = (complete) => {
            city.complete = complete;
            city.pinned ||= !!pinned;
            city.expectedTileCount = keys.length;
            stores.cities.put(city);
            result(complete);
          };
          let index = 0;
          const next = () => {
            if (index === keys.length) return finish(true);
            const rowId = tileId(id, keys[index++]);
            watch(stores.tiles.get(rowId), (tile) => {
              if (!tile) return finish(false);
              // Validate persisted payloads one at a time: never read the whole
              // downloaded city into memory just to declare it available offline.
              watch(stores.payloads.get(rowId), (payload) => {
                if (!validTile(tile, payload, this.maxTileBytes)) return finish(false);
                next();
              });
            });
          };
          next();
        });
      });
    });
  }

  async remove(id) {
    cityId(id);
    this.generations.set(id, this.stamp(id) + 1);
    return this.run('readwrite', (context) => this.erase(context, id, () => context.result(true)));
  }
  async clearTemporary() {
    this.temporaryGeneration++;
    return this.run('readwrite', (context) => {
      const { stores, watch, result } = context;
      watch(stores.cities.getAll(), (cities) => {
        const temporary = cities.filter((city) => !city.pinned);
        let index = 0;
        const next = () =>
          index === temporary.length
            ? result(temporary.length)
            : this.erase(context, temporary[index++].id, next);
        next();
      });
    });
  }
  async stats() {
    try {
      return await this.run('readonly', ({ stores, watch, result }) => {
        watch(stores.cities.getAll(), (cities) => {
          const bytes = cities.reduce((sum, city) => sum + city.bytes, 0);
          result({
            persistent: true,
            bytes,
            maxBytes: this.maxBytes,
            cityCount: cities.length,
            tileCount: cities.reduce((sum, city) => sum + city.tileCount, 0),
            pinnedBytes: cities
              .filter((city) => city.pinned)
              .reduce((sum, city) => sum + city.bytes, 0),
            temporaryBytes: cities
              .filter((city) => !city.pinned)
              .reduce((sum, city) => sum + city.bytes, 0),
            overBudget: bytes > this.maxBytes,
            error: null,
          });
        });
      });
    } catch (error) {
      return {
        persistent: false,
        bytes: 0,
        maxBytes: this.maxBytes,
        cityCount: 0,
        tileCount: 0,
        pinnedBytes: 0,
        temporaryBytes: 0,
        overBudget: false,
        error: error.code || 'storage',
      };
    }
  }
  close() {
    this.closed = true;
    this.finishOpen?.(null);
    for (const tx of this.transactions) {
      try {
        tx.abort();
      } catch {
        /* Already committed. */
      }
    }
    const db = this.db;
    this.db = null;
    db?.close();
  }
}
