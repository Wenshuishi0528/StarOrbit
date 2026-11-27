import { archiveColorProfile, archiveUsesSRGBTransfer } from './sky-archive-color.js';
import { validSkyImageDimensions } from './webb-plate.js';
import * as THREE from 'three';
import { loadHubbleArchive } from './hubble-gallery.js';
import { WEBB_PLATE_PROVIDERS } from './webb-gallery.js';
import { SkyOffline } from './sky-offline.js';
import { createSkyTileCache } from './sky-detail-cache.js';
import { hipsTileUrl } from './sky-detail-math.js';
import {
  planSkyDetailSelection,
  normalizeSkyDetailSource,
  normalizeWebbBackground,
  SKY_TILE_BYTES,
  SKY_TILE_LIMIT,
} from './sky-detail-plan.js';

// Opening either registered edition gives the other telescope a matching first view.
// A player-selected edition from that telescope takes precedence.
const comparisonEdition = new Map([
  ['hubble-heic1501a', 'webb-weic2216b'],
  ['webb-weic2216b', 'hubble-heic1501a'],
]);
const MAX_FILE_BYTES = 2_000_000;
const now = () => performance.now();
// Reserve decoded and mipmapped space in units of one 512px survey tile.
const textureSlots = (tile) =>
  tile.nativeImage ? Math.ceil((tile.width * tile.height) / (512 * 512)) : 1;
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
      webbGallery = false,
      decode = (blob) =>
        createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }),
    } = {}
  ) {
    this.cache = cache;
    this.offline = new SkyOffline(this, boundedBlob);
    this.fetcher = fetcher;
    this.decode = decode;
    this.providers = (manifest.providers || []).map((p) => ({
      ...p,
      revision: p.revision ?? manifest.version ?? 1,
      ...(p.id === 'jwst-carina-2022' && { archiveProfile: archiveColorProfile(p.id) }),
      tiles: p.id === manifest.local?.providerId ? manifest.local.tiles : undefined,
    }));
    if (webbGallery) this.providers.push(...WEBB_PLATE_PROVIDERS);
    // 哈勃影像档案按需加载：首次规划哈勃视图或打开图集时请求，完成后追加到 providers。
    this.hubbleGallery = webbGallery === true;
    this.hubbleArchive = null;
    this.hubbleLoading = null;
    this.hubbleRetryAt = -Infinity;
    this.artworkId = null;
    this.savedPyramidOrder = undefined;
    this.artworkBySource = { recent: null, hubble: null };
    this.webbBackground = 'galaxy';
    this.views = new Map();
    this.entries = new Map();
    this.usedTextureSlots = 0;
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
      // A ground eyepiece may explicitly select a survey even when the main
      // panorama is disabled. Keep the tile budget and in-flight work shared.
      for (const [id, entry] of this.views) if (!entry.view.detailSelection) this.views.delete(id);
      this.schedule();
      if (!this.views.size) {
        this.generation++;
        this.lastError = null;
      }
    }
    this.revision++;
  }
  setArtwork(id, savedPyramidOrder) {
    if (this.artworkId === id && this.savedPyramidOrder === savedPyramidOrder) return;
    this.savedPyramidOrder = savedPyramidOrder;
    this.artworkId = id;
    if (id) this.artworkBySource[id.startsWith('hubble-') ? 'hubble' : 'recent'] = id;
    else this.artworkBySource = { recent: null, hubble: null };
    this.replanViews();
  }
  // 加载哈勃档案并并入影像源；并发调用共享同一次加载。解析为档案，失败时为 null。
  loadHubble() {
    if (!this.hubbleGallery || this.hubbleArchive) return Promise.resolve(this.hubbleArchive);
    this.hubbleLoading ??= loadHubbleArchive().then(
      (archive) => {
        this.hubbleLoading = null;
        if (this.hubbleArchive || this.disposed) return this.hubbleArchive;
        this.hubbleArchive = archive;
        // 换用新数组：分组缓存和离线层级限制都按数组重新计算。
        this.providers = [...this.providers, ...archive.providers];
        this.offline.lastProviderLimit = null;
        for (const entry of this.views.values()) Object.assign(entry, this.plan(entry.view));
        this.schedule();
        this.revision++;
        return archive;
      },
      (error) => {
        this.hubbleLoading = null;
        this.hubbleRetryAt = now() + 30000;
        console.error('哈勃影像档案加载失败', error);
        this.revision++;
        return null;
      }
    );
    return this.hubbleLoading;
  }
  // 渲染循环中的请求：加载失败后 30 秒内不自动重试。
  requestHubble() {
    if (
      this.hubbleGallery &&
      !this.hubbleArchive &&
      !this.hubbleLoading &&
      now() >= this.hubbleRetryAt
    )
      this.loadHubble();
  }
  setSource(value, background = this.webbBackground) {
    const source = normalizeSkyDetailSource(value);
    const base = normalizeWebbBackground(background);
    if (this.source === source && this.webbBackground === base) return;
    this.hubbleRetryAt = -Infinity;
    this.source = source;
    this.webbBackground = base;
    this.failures.clear();
    this.lastError = null;
    this.replanViews();
  }
  plan(view) {
    const choice = view.detailSelection;
    const source = choice?.source ?? this.source;
    if (source === 'hubble') this.requestHubble();
    const artwork = choice
      ? choice.artworkId
      : this.artworkBySource[source === 'hubble' ? 'hubble' : 'recent'] ||
        (source !== 'auto' && comparisonEdition.get(this.artworkId));
    return planSkyDetailSelection(
      this.offline.providersForView(view),
      view,
      source,
      artwork,
      choice ? choice.background : this.webbBackground,
      (id) =>
        (this.artworkId === id ? this.savedPyramidOrder : undefined) ??
        (this.offline.failedSources.has(id) ? Infinity : undefined)
    );
  }
  replanViews(failedKey) {
    for (const entry of this.views.values()) {
      if (
        failedKey ? entry.tiles.some((tile) => tile.key === failedKey) : !entry.view.detailSelection
      )
        Object.assign(entry, this.plan(entry.view));
    }
    this.schedule();
    this.revision++;
  }
  update(id, view, enabled = true) {
    const choice = view.detailSelection;
    if (this.disposed || this.clearing || (!this.enabled && !choice) || !enabled) {
      this.release(id);
      return this.status(id);
    }
    const photo = this.rank(id) === 0;
    const signature = [
      this.offline.planRevision(),
      globalThis.navigator?.onLine === false ? 1 : 0,
      view.fovY,
      view.aspect,
      view.pixelHeight,
      view.wideField === true ? 1 : 0,
      ...view.forward,
      ...view.right,
      ...view.up,
    ]
      .map((v) => (photo ? Number(v) : Number(v).toPrecision(10)))
      .join('/');
    const old = this.views.get(id);
    const selection = choice ? [choice.source, choice.artworkId, choice.background].join('|') : '';
    // Re-evaluate at most ten times per second while dragging; texture completion
    // is immediate and does not need another geometric tile query.
    if (
      !old ||
      old.selection !== selection ||
      (old.signature !== signature && (photo || now() - old.at >= 100))
    ) {
      const snapshot = {
        ...view,
        ...(choice && { detailSelection: { ...choice } }),
        wideField: view.wideField ?? this.wideField,
        forward: [...view.forward],
        right: [...view.right],
        up: [...view.up],
      };
      this.views.set(id, {
        selection,
        signature,
        at: now(),
        view: snapshot,
        ...this.plan(snapshot),
      });
      this.schedule();
    } else this.pump();
    return this.status(id);
  }
  schedule() {
    const ranked = [...this.views].sort(([a], [b]) => this.rank(a) - this.rank(b));
    const wanted = new Map();
    let reserved = 0;
    for (const [, view] of ranked) {
      for (const t of [...view.tiles].sort((a, b) => a.priority - b.priority)) {
        if (wanted.has(t.key)) continue;
        const slots = textureSlots(t);
        if (reserved + slots <= SKY_TILE_LIMIT) {
          wanted.set(t.key, t);
          reserved += slots;
        }
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
    if (id.includes('photo')) return 0;
    return id.includes('scope') || this.views.get(id)?.view.detailSelection ? 1 : 2;
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
    if (!this.allowed.size || this.disposed || this.clearing) return;
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
    const fail = (reason) => {
      this.failures.set(t.key, now() + 60000);
      this.lastError = reason;
      if (!t.cacheOnly) this.offline.sourceFailed(t.provider);
      if (t.nativeImage) this.replanViews(t.key);
      this.revision++;
    };
    const timer = setTimeout(() => {
      if (this.current(t, request)) fail('TimeoutError: Sky image request timed out');
      request.controller.abort();
    }, 12000);
    let bitmap;
    try {
      let blob = null;
      let fetched = false;
      if (!t.provider.tiles) {
        try {
          blob = (await this.offline.get(t.key)) || (await this.cache.get(t.key));
        } catch {
          /* Cache failure is a network miss. */
        }
      }
      if (!live()) return;
      if (blob) {
        try {
          bitmap = await this.decode(blob);
          if (!validSkyImageDimensions(t, bitmap.width, bitmap.height))
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
        if (t.cacheOnly || (t.nativeImage && globalThis.navigator?.onLine === false))
          throw Error('Sky image unavailable offline');
        const url =
          t.url ||
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
        if (!validSkyImageDimensions(t, bitmap.width, bitmap.height))
          throw Error('Invalid sky tile dimensions');
      }
      if (!live()) return;
      const slots = textureSlots(t);
      // Evict before allocating the next bitmap's GPU texture.
      while (this.usedTextureSlots + slots > SKY_TILE_LIMIT) {
        const cold = [...this.entries.keys()].find((key) => !this.allowed.has(key));
        if (!cold) return;
        this.drop(cold);
      }
      const texture = new THREE.Texture(bitmap);
      texture.colorSpace = archiveUsesSRGBTransfer(t.archiveProfile ?? t.provider.archiveProfile)
        ? THREE.SRGBColorSpace
        : THREE.NoColorSpace;
      texture.flipY = false;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      this.entries.set(t.key, { ...t, texture, bitmap });
      this.usedTextureSlots += slots;
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
      if (live()) fail(errorSummary(error));
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
          (a.provider.tiles || a.provider.plate ? 2 : a.provider.id === 'panstarrs' ? 1 : 0) -
            (b.provider.tiles || b.provider.plate ? 2 : b.provider.id === 'panstarrs' ? 1 : 0) ||
          a.order - b.order
      );
  }
  status(id) {
    const entry = this.views.get(id),
      enabled = this.enabled || !!entry?.view.detailSelection,
      source = entry?.source ?? this.source,
      tiles = entry?.tiles || [],
      ready = this.ready(id);
    const failed = tiles.filter((t) => (this.failures.get(t.key) || 0) > now()).length;
    // 哈勃档案仍在加载时视为加载中，而不是“影像不可用”。
    const archiveLoading = source === 'hubble' && !!this.hubbleLoading;
    return {
      enabled,
      source,
      active: !!entry,
      webbBackground: entry?.view.detailSelection?.background ?? this.webbBackground,
      hasWebbTiles: tiles.some(
        (t) => t.provider.tiles || (t.provider.plate && t.provider.source !== 'hubble')
      ),
      hasHubbleTiles: tiles.some((t) => t.provider.source === 'hubble'),
      backgroundOutsideCoverage: !!entry?.backgroundOutsideCoverage,
      fallback: archiveLoading
        ? null
        : entry?.fallback || (source === 'galaxy' ? 'background' : null),
      requested: tiles.length,
      ready: ready.length,
      loading:
        enabled &&
        !this.clearing &&
        (archiveLoading ||
          tiles.some(
            (t) =>
              this.allowed.has(t.key) &&
              !this.entries.has(t.key) &&
              (this.failures.get(t.key) || 0) <= now()
          )),
      failed,
      lastError: this.lastError,
      limited: tiles.some((t) => !this.allowed.has(t.key)),
      complete: tiles.length > 0 && ready.length === tiles.length,
      sources: [...new Map(ready.map((t) => [t.provider.id, t.provider])).values()],
      gpuBytes: this.usedTextureSlots * SKY_TILE_BYTES,
      decodedBytes: this.usedTextureSlots * 512 * 512 * 4,
      textureCount: this.entries.size,
      revision: this.revision,
    };
  }
  async prepare(id, view, enabled, timeout = 10000) {
    this.update(id, view, enabled);
    const start = now();
    while (this.views.has(id) && !this.disposed && now() - start < timeout) {
      const status = this.status(id);
      // loading 也包含哈勃档案加载：照片等它就绪后再等待影像图块。
      if (status.complete || !status.loading) break;
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
    this.usedTextureSlots -= textureSlots(entry);
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
    this.offline.dispose();
    this.cache.dispose();
  }
}
