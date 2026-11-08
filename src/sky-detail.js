import * as THREE from 'three';
import { createSkyTileCache } from './sky-detail-cache.js';
import { hipsTileUrl } from './sky-detail-math.js';
import {
  planSkyDetailSelection,
  normalizeSkyDetailSource,
  SKY_TILE_BYTES,
  SKY_TILE_LIMIT,
} from './sky-detail-plan.js';

const MAX_FILE_BYTES = 2_000_000;
const now = () => performance.now();
const errorSummary = (error) =>
  `${error?.name || 'Error'}: ${error?.message || 'Image unavailable'}`
    .replace(/(?:https?:\/\/|data:)[^\s]+/gi, '[image]')
    .slice(0, 180);

async function discardResponse(response) {
  try {
    await response.body?.cancel();
  } catch {
    /* Already aborted or closed. */
  }
}

async function boundedBlob(response) {
  const error = !response.ok
    ? `Sky image HTTP ${response.status}`
    : Number(response.headers.get('content-length')) > MAX_FILE_BYTES
      ? 'Sky image too large'
      : null;
  if (error) {
    await discardResponse(response);
    throw Error(error);
  }
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > MAX_FILE_BYTES) throw Error('Sky image too large');
    return blob;
  }
  const reader = response.body.getReader(),
    chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_FILE_BYTES) throw Error('Sky image too large');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type: response.headers.get('content-type') || 'image/jpeg' });
}

export class SkyDetail {
  constructor(
    manifest = {},
    {
      cache = createSkyTileCache(),
      fetcher = globalThis.fetch,
      source = 'auto',
      wideField = false,
      decode = (blob) =>
        createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }),
    } = {}
  ) {
    this.cache = cache;
    this.fetcher = fetcher;
    this.decode = decode;
    this.providers = (manifest.providers || []).map((p) => ({
      ...p,
      revision: p.revision ?? manifest.version ?? 1,
      tiles: p.id === manifest.local?.providerId ? manifest.local.tiles : undefined,
    }));
    this.views = new Map();
    this.entries = new Map();
    this.loading = new Map();
    // Aborted image decodes cannot be interrupted. Keep them in the concurrency
    // count until their promise settles, even after removing their view request.
    this.activeLoads = new Set();
    this.failures = new Map();
    this.lastError = null;
    this.allowed = new Map();
    this.source = normalizeSkyDetailSource(source);
    this.wideField = wideField === true;
    this.enabled = true;
    this.disposed = false;
    this.generation = 0;
    this.clearing = null;
    this.revision = 0;
  }
  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.generation++;
      this.views.clear();
      this.allowed.clear();
      this.cancelLoads();
      this.dropAll();
      this.failures.clear();
      this.lastError = null;
    }
    this.revision++;
  }
  setSource(value) {
    const source = normalizeSkyDetailSource(value);
    if (this.source === source) return;
    this.source = source;
    this.failures.clear();
    this.lastError = null;
    for (const view of this.views.values())
      Object.assign(view, planSkyDetailSelection(this.providers, view.view, source));
    this.schedule();
    this.revision++;
  }
  update(id, view, enabled = true) {
    if (this.disposed || this.clearing || !this.enabled || !enabled) {
      this.release(id);
      return this.status(id);
    }
    const photo = this.rank(id) === 0;
    const signature = [
      view.fovY,
      view.aspect,
      view.pixelHeight,
      ...view.forward,
      ...view.right,
      ...view.up,
    ]
      .map((v) => (photo ? Number(v) : Number(v).toPrecision(10)))
      .join('/');
    const old = this.views.get(id);
    // Re-evaluate at most ten times per second while dragging; texture completion
    // is immediate and does not need another geometric tile query.
    if (!old || (old.signature !== signature && (photo || now() - old.at >= 100))) {
      const snapshot = {
        ...view,
        wideField: this.wideField,
        forward: [...view.forward],
        right: [...view.right],
        up: [...view.up],
      };
      this.views.set(id, {
        signature,
        at: now(),
        view: snapshot,
        ...planSkyDetailSelection(this.providers, snapshot, this.source),
      });
      this.schedule();
    } else this.pump();
    return this.status(id);
  }
  schedule() {
    const ranked = [...this.views].sort(([a], [b]) => this.rank(a) - this.rank(b));
    const wanted = new Map();
    for (const [, view] of ranked) {
      for (const t of [...view.tiles].sort((a, b) => a.priority - b.priority)) {
        if (!wanted.has(t.key) && wanted.size < SKY_TILE_LIMIT) wanted.set(t.key, t);
      }
    }
    this.allowed = wanted;
    for (const key of this.entries.keys()) if (!wanted.has(key)) this.drop(key);
    for (const [key, until] of this.failures)
      if (!wanted.has(key) || until <= now()) this.failures.delete(key);
    // A photo can preempt queued lower-priority views. Reserve a local channel
    // so an offline network/cache cannot prevent bundled imagery from loading.
    const pending = this.pending();
    const next = new Set(
      [
        ...pending.filter((tile) => tile.provider.tiles).slice(0, 1),
        ...pending.filter((tile) => !tile.provider.tiles).slice(0, 2),
      ].map((tile) => tile.key)
    );
    for (const [key, request] of this.loading)
      if (!next.has(key)) {
        request.controller.abort();
        this.loading.delete(key);
      }
    this.pump();
  }
  rank(id) {
    return id.includes('photo') ? 0 : id.includes('scope') ? 1 : 2;
  }
  pending() {
    return (
      [...this.allowed.values()]
        .filter(
          (tile) => !this.entries.has(tile.key) && (this.failures.get(tile.key) || 0) <= now()
        )
        // Stable sort keeps view/LOD priority within local and remote channels.
        .sort((a, b) => Number(!!b.provider.tiles) - Number(!!a.provider.tiles))
    );
  }
  pump() {
    if (!this.enabled || this.disposed || this.clearing) return;
    for (const t of this.pending()) {
      const local = !!t.provider.tiles;
      const active = [...this.activeLoads].filter((request) => request.local === local).length;
      if (active >= (local ? 1 : 2)) continue;
      if (this.loading.has(t.key)) continue;
      const request = { controller: new AbortController(), generation: this.generation, local };
      this.loading.set(t.key, request);
      this.activeLoads.add(request);
      this.load(t, request)
        .catch(() => {})
        .finally(() => {
          this.activeLoads.delete(request);
          if (this.loading.get(t.key) === request) this.loading.delete(t.key);
          this.pump();
        });
    }
  }
  current(t, request) {
    return (
      this.enabled &&
      !this.disposed &&
      !this.clearing &&
      request.generation === this.generation &&
      this.loading.get(t.key) === request &&
      this.allowed.has(t.key)
    );
  }
  async load(t, request) {
    const signal = request.controller.signal;
    const live = () => this.current(t, request) && !signal.aborted;
    const timer = setTimeout(() => {
      if (this.current(t, request)) {
        this.failures.set(t.key, now() + 60000);
        this.lastError = 'TimeoutError: Sky image request timed out';
        this.revision++;
      }
      request.controller.abort();
    }, 12000);
    let bitmap;
    try {
      let blob = null;
      let fetched = false;
      if (!t.provider.tiles) {
        try {
          blob = await this.cache.get(t.key);
        } catch {
          /* Cache failure is a network miss. */
        }
      }
      if (!live()) return;
      if (blob) {
        try {
          bitmap = await this.decode(blob);
          if (bitmap.width !== 512 || bitmap.height !== 512)
            throw Error('Invalid sky tile dimensions');
        } catch {
          bitmap?.close?.();
          bitmap = null;
          // Repair a stale/corrupt cached image by fetching it once in this
          // request. A decode failure must not pin the view to a bad disk row.
          blob = null;
        }
      }
      if (!live()) return;
      if (!bitmap) {
        const url =
          t.provider.tiles?.[`${t.order}/${t.pixel}`] ||
          hipsTileUrl(t.provider.baseUrl, t.order, t.pixel, t.provider.format);
        // Native window.fetch rejects a SkyDetail receiver (Illegal invocation).
        const fetcher = this.fetcher;
        const response = await fetcher(url, {
          signal,
          credentials: 'omit',
          mode: 'cors',
          cache: t.provider.tiles ? 'default' : 'no-store',
        });
        if (!live()) {
          await discardResponse(response);
          return;
        }
        blob = await boundedBlob(response);
        fetched = true;
        if (!live()) return;
        bitmap = await this.decode(blob);
        if (bitmap.width !== 512 || bitmap.height !== 512)
          throw Error('Invalid sky tile dimensions');
      }
      if (!live()) return;
      // Keep at most 48 decoded 512px images and their mipmapped GPU textures.
      // Cold entries are evicted before allocating the next texture.
      while (this.entries.size >= SKY_TILE_LIMIT) {
        const cold = [...this.entries.keys()].find((key) => !this.allowed.has(key));
        if (!cold) return;
        this.drop(cold);
      }
      const texture = new THREE.Texture(bitmap);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      this.entries.set(t.key, { ...t, texture, bitmap });
      bitmap = null;
      this.failures.delete(t.key);
      this.revision++;
      clearTimeout(timer);
      if (fetched && !t.provider.tiles && live()) {
        // A quota or persistence error does not invalidate a decoded tile.
        try {
          await this.cache.put(t.key, blob);
        } catch {
          /* Keep the live texture. */
        }
      }
    } catch (error) {
      // A stale request may share its key with a replacement request. Its
      // rejection must never suppress the new request or its ready texture.
      if (live()) {
        this.failures.set(t.key, now() + 60000);
        this.lastError = errorSummary(error);
        this.revision++;
      }
    } finally {
      clearTimeout(timer);
      bitmap?.close?.();
    }
  }
  ready(id) {
    const tiles = this.views.get(id)?.tiles || [];
    return tiles
      .map((t) => this.entries.get(t.key))
      .filter(Boolean)
      .sort(
        (a, b) =>
          (a.provider.tiles ? 2 : a.provider.id === 'panstarrs' ? 1 : 0) -
            (b.provider.tiles ? 2 : b.provider.id === 'panstarrs' ? 1 : 0) || a.order - b.order
      );
  }
  status(id) {
    const tiles = this.views.get(id)?.tiles || [],
      ready = this.ready(id);
    const failed = tiles.filter((t) => (this.failures.get(t.key) || 0) > now()).length;
    return {
      enabled: this.enabled,
      source: this.source,
      active: this.views.has(id),
      fallback: this.views.get(id)?.fallback || (this.source === 'galaxy' ? 'background' : null),
      requested: tiles.length,
      ready: ready.length,
      loading:
        this.enabled &&
        !this.clearing &&
        tiles.some(
          (t) =>
            this.allowed.has(t.key) &&
            !this.entries.has(t.key) &&
            (this.failures.get(t.key) || 0) <= now()
        ),
      failed,
      lastError: this.lastError,
      limited: tiles.some((t) => !this.allowed.has(t.key)),
      complete: tiles.length > 0 && ready.length === tiles.length,
      sources: [...new Map(ready.map((t) => [t.provider.id, t.provider])).values()],
      gpuBytes: this.entries.size * SKY_TILE_BYTES,
      decodedBytes: this.entries.size * 512 * 512 * 4,
      textureCount: this.entries.size,
      revision: this.revision,
    };
  }
  async prepare(id, view, enabled, timeout = 10000) {
    this.update(id, view, enabled);
    const start = now();
    while (this.enabled && !this.disposed && now() - start < timeout) {
      const status = this.status(id);
      if (!status.requested || status.complete || !status.loading) break;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return this.status(id);
  }
  release(id) {
    if (this.views.delete(id)) this.schedule();
  }
  cancelLoads() {
    for (const r of this.loading.values()) r.controller.abort();
    this.loading.clear();
  }
  drop(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.texture.dispose();
    entry.bitmap.close?.();
    this.entries.delete(key);
    this.revision++;
  }
  dropAll() {
    for (const key of this.entries.keys()) this.drop(key);
  }
  async clear() {
    this.generation++;
    this.views.clear();
    this.allowed.clear();
    this.cancelLoads();
    this.dropAll();
    this.failures.clear();
    this.lastError = null;
    // Block update()/old finally callbacks for the full asynchronous disk clear,
    // and keep overlapping clear calls from prematurely lifting that barrier.
    const clearing = Promise.resolve()
      .then(() => this.cache.clear())
      .catch(() => false);
    this.clearing = clearing;
    try {
      return await clearing;
    } finally {
      if (this.clearing === clearing) this.clearing = null;
      this.revision++;
    }
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.cancelLoads();
    this.dropAll();
    this.views.clear();
    this.allowed.clear();
    this.cache.dispose();
  }
}
