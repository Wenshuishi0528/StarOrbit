import * as THREE from 'three';
import { CityTerrainCache } from './city-terrain-cache.js';
import { CityTerrainSource } from './city-terrain-source.js';
import { allCityTiles, planCityTiles, planStreamedCityTiles } from './city-terrain-math.js';
import {
  planStreamingRegions,
  streamingViewKey,
  streamingAnchor,
} from './surface-streaming-plan.js';

export const CITY_GPU_LAYERS = 96,
  CITY_DRAW_LIMIT = 64;
const SIZE = 512,
  BYTES = SIZE * SIZE * 4,
  FADE_MS = 450;
const keyOf = (tile) => tile.cityId + '/' + tile.key;
const abortError = () => new DOMException('Cancelled', 'AbortError');
const fade = (entry, now) => Math.min(1, Math.max(0, (now - entry.born) / FADE_MS));
const vectors = () => Array.from({ length: CITY_DRAW_LIMIT }, () => new THREE.Vector4());

/** One bounded texture array for all observers; the shader uses one sampler.
 * Explicit offline downloads belong to the library, not this transient GPU LRU. */
export class CityTerrain {
  constructor(
    manifest = {},
    { cache = new CityTerrainCache(), source = new CityTerrainSource(), renderer } = {}
  ) {
    this.cache = cache;
    this.source = source;
    this.renderer = renderer;
    this.cities = new Map((manifest.cities || []).map((c) => [c.id, { ...c, builtin: true }]));
    this.disabled = new Set();
    this.views = new Map();
    this.entries = new Map();
    this.allowedOnline = new Set();
    this.autoDismissed = new Set();
    try {
      this.disabled = new Set(JSON.parse(localStorage.getItem('starorbit-city-disabled-v1')) || []);
      this.autoDismissed = new Set(
        JSON.parse(localStorage.getItem('starorbit-city-dismissed-v1')) || []
      );
    } catch {}
    this.loads = new Map();
    this.downloads = new Map();
    this.payloads = new Map();
    this.failures = new Map();
    this.generation = new Map();
    this.revision = 0;
    this.enabled = true;
    this.disposed = false;
    this.autoEnabled = false;
    this.streaming = { enabled: false, rangeKm: 120 };
    this.streamJobs = new Map();
    this.streamFailures = new Map();
    this.streamDismissed = new Map();
    this.streamWanted = new Map();
    this.streamPausedAt = null;
    this.streamEpoch = 0;
    this.streamError = '';
    this.streamChecked = -Infinity;
    this.catalogReady = false;
    this.lastError = '';
    this.lastPlan = -Infinity;
    this.texture = this.makeTexture(1);
    this.canvas = null;
    this.ready = this.cache
      .list()
      .then((rows) => {
        if (this.disposed) return;
        for (const row of rows)
          if (!this.cities.has(row.id) && !this.generation.has(row.id))
            this.cities.set(row.id, row);
        this.catalogReady = true;
        this.revision++;
        this.schedule(true);
      })
      .catch((error) => {
        this.lastError = error.message;
        this.catalogReady = true;
        this.schedule(true);
      });
  }
  makeTexture(depth) {
    const size = depth === 1 ? 1 : SIZE;
    const texture = new THREE.DataArrayTexture(
      new Uint8Array(size * size * 4 * depth),
      size,
      size,
      depth
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = depth === 1 ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = depth !== 1;
    texture.anisotropy = Math.min(4, this.renderer?.capabilities.getMaxAnisotropy() || 1);
    texture.needsUpdate = true;
    return texture;
  }
  uniforms(id, priority = 1) {
    if (!this.views.has(id))
      this.views.set(id, {
        id,
        priority,
        plan: [],
        input: null,
        uniforms: {
          cityMap: { value: this.texture },
          cityCount: { value: 0 },
          cityRects: { value: vectors() },
          cityBounds: { value: vectors() },
          cityParams: { value: vectors() },
          cityEdges: { value: vectors() },
        },
      });
    return this.views.get(id).uniforms;
  }
  setEnabled(value) {
    if (this.disposed) return;
    value = !!value;
    if (value === this.enabled) return;
    this.enabled = value;
    if (!value) {
      clearTimeout(this.retry);
      for (const job of this.streamJobs.values()) job.controller.abort();
      for (const load of this.loads.values()) load.controller.abort();
      this.entries.clear();
      this.texture.dispose();
      this.texture = this.makeTexture(1);
      for (const view of this.views.values()) {
        view.plan = [];
        view.uniforms.cityCount.value = 0;
        view.uniforms.cityMap.value = this.texture;
      }
    }
    this.revision++;
    this.schedule(true);
  }
  configureStreaming({ enabled = this.streaming.enabled, rangeKm = this.streaming.rangeKm } = {}) {
    if (this.disposed) return;
    const next = {
      enabled: enabled === true,
      rangeKm: Math.max(20, Math.min(400, Number(rangeKm) || 120)),
    };
    if (next.enabled === this.streaming.enabled && next.rangeKm === this.streaming.rangeKm) return;
    const enabling = next.enabled && !this.streaming.enabled;
    this.streaming = next;
    this.streamChecked = -Infinity;
    if (!next.enabled) {
      for (const job of this.streamJobs.values()) job.controller.abort();
      for (const [key, load] of this.loads)
        if (this.cities.get(key.split('/')[0])?.streaming) load.controller.abort();
    }
    if (enabling) this.resumeStreaming(false);
    this.schedule(true);
  }
  resumeStreaming(schedule = true) {
    this.streamPausedAt = null;
    this.streamDismissed.clear();
    this.streamFailures.clear();
    this.streamError = '';
    this.streamChecked = -Infinity;
    for (const [key, time] of this.failures) if (!Number.isFinite(time)) this.failures.delete(key);
    if (schedule) this.schedule(true);
  }
  async clearStreaming() {
    this.streamPausedAt = streamingViewKey([...this.views.values()]);
    this.streamEpoch++;
    for (const job of this.streamJobs.values()) job.controller.abort();
    this.streamWanted.clear();
    await this.ready;
    const ids = [...this.cities.values()].filter((meta) => meta.streaming).map((meta) => meta.id);
    for (const id of ids) await this.removeCity(id);
    this.revision++;
    return ids.length;
  }
  updateStreaming() {
    const now = performance.now();
    if (now - this.streamChecked < 500) {
      // Keep a trailing update: a camera may stop immediately after changing,
      // in which case setView has no later signature change to wake discovery.
      clearTimeout(this.streamReplan);
      this.streamReplan = setTimeout(
        () => {
          this.streamChecked = -Infinity;
          this.schedule(true);
        },
        Math.max(1, 500 - (now - this.streamChecked))
      );
      return;
    }
    clearTimeout(this.streamReplan);
    this.streamChecked = now;
    if (!this.catalogReady || !this.enabled || !this.streaming.enabled || this.disposed) return;
    const views = [...this.views.values()]
      .filter((v) => v.input)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);
    const context = streamingViewKey(views);
    if (context !== this.streamContext) {
      this.streamError = '';
      this.streamContext = context;
    }
    if (this.streamPausedAt !== null) {
      if (this.streamPausedAt === context) return;
      this.streamPausedAt = null;
    }
    const wanted = new Map();
    for (const view of views)
      for (const region of planStreamingRegions(view.input, { rangeKm: this.streaming.rangeKm })) {
        if (wanted.size >= 48 && !wanted.has(region.id)) continue;
        wanted.set(region.id, region);
      }
    for (const id of wanted.keys())
      if (!this.streamWanted.has(id))
        for (const [key, time] of this.failures)
          if (key.startsWith(id + '/') && !Number.isFinite(time)) this.failures.delete(key);
    this.streamWanted = wanted;
    for (const [key, load] of this.loads)
      if (this.cities.get(key.split('/')[0])?.streaming && !wanted.has(key.split('/')[0]))
        load.controller.abort();
    for (const [id, job] of this.streamJobs) if (!wanted.has(id)) job.controller.abort();
    for (const [id, region] of wanted) {
      if (this.streamJobs.size >= 1) break;
      if (
        this.cities.has(id) ||
        this.streamJobs.has(id) ||
        this.streamDismissed.get(id) === context ||
        (this.streamFailures.get(id) || 0) > now
      )
        continue;
      const controller = new AbortController(),
        epoch = this.streamEpoch,
        generation = this.generation.get(id) || 0;
      const job = { controller, timedOut: false };
      const timeout = setTimeout(() => {
        job.timedOut = true;
        controller.abort();
      }, 90000);
      this.streamJobs.set(id, job);
      job.work = this.source
        .prepare(region, controller.signal)
        .then((meta) => {
          if (
            controller.signal.aborted ||
            this.disposed ||
            epoch !== this.streamEpoch ||
            generation !== (this.generation.get(id) || 0) ||
            !this.streamWanted.has(id)
          )
            return;
          this.cities.set(id, { ...meta, id, streaming: true });
          this.streamError = '';
          this.revision++;
          this.schedule(true);
        })
        .catch((error) => {
          if (!controller.signal.aborted || job.timedOut) {
            this.streamError = job.timedOut ? '卫星区域准备超时，可重试' : error.message;
            this.streamFailures.set(id, performance.now() + 60000);
          }
        })
        .finally(() => {
          clearTimeout(timeout);
          if (this.streamJobs.get(id) === job) this.streamJobs.delete(id);
          this.streamChecked = -Infinity;
          if (!this.disposed) this.schedule();
        });
    }
    clearTimeout(this.streamRetry);
    const retries = [...wanted.keys()]
      .map((id) => this.streamFailures.get(id))
      .filter((time) => time > now);
    if (retries.length)
      this.streamRetry = setTimeout(
        () => {
          this.streamChecked = -Infinity;
          this.schedule(true);
        },
        Math.min(...retries) - now + 1
      );
  }
  setView(id, input, priority = 1, force = false) {
    this.uniforms(id, priority);
    const view = this.views.get(id);
    const signature = input
      ? [
          input.fovY,
          input.width,
          input.height,
          ...input.eyeKm,
          ...input.forward,
          ...input.up,
          ...input.right,
        ].join(',')
      : '';
    if (view.signature !== signature || force) {
      view.input = input;
      view.signature = signature;
      view.priority = priority;
      this.schedule(force);
    }
    this.writeUniforms();
    return this.status(id);
  }
  release(id) {
    this.views.delete(id);
    this.revision++;
    this.schedule(true);
  }
  schedule(force = false) {
    clearTimeout(this.scheduled);
    const delay = 100 - (performance.now() - this.lastPlan);
    if (force || delay <= 0) this.reconcile();
    else this.scheduled = setTimeout(() => this.reconcile(), delay);
  }
  reconcile() {
    this.lastPlan = performance.now();
    this.updateStreaming();
    const wanted = new Set(),
      available = [...this.cities.values()].filter((c) => !this.disabled.has(c.id));
    for (const view of [...this.views.values()].sort(
      (a, b) => b.priority - a.priority || a.id.localeCompare(b.id)
    )) {
      let plan = [];
      if (this.enabled && view.input) {
        for (const budget of [CITY_DRAW_LIMIT, 48, 32, 24, 16, 8, 4, 2, 1]) {
          const planner = available.some((c) => c.streaming)
            ? planStreamedCityTiles
            : planCityTiles;
          plan = planner(available, view.input, {
            maxTiles: budget,
            rangeKm: this.streaming.rangeKm,
            center: streamingAnchor(view.input)?.center,
          });
          if (new Set([...wanted, ...plan.map(keyOf)]).size <= CITY_GPU_LAYERS) break;
          plan = [];
        }
      }
      view.plan = plan;
      for (const tile of plan) wanted.add(keyOf(tile));
    }
    for (const [key, entry] of this.entries) if (!wanted.has(key)) this.entries.delete(key);
    for (const [key, load] of this.loads) if (!wanted.has(key)) load.controller.abort();
    this.revision++;
    this.writeUniforms();
    this.pump();
  }
  pendingTiles() {
    const seen = new Set(),
      out = [],
      now = performance.now();
    for (const view of [...this.views.values()].sort((a, b) => b.priority - a.priority))
      for (const tile of view.plan) {
        const key = keyOf(tile);
        if (
          !seen.has(key) &&
          !this.entries.has(key) &&
          !this.loads.has(key) &&
          (this.failures.get(key) || 0) < now
        )
          out.push(tile);
        seen.add(key);
      }
    return out.sort((a, b) => a.z - b.z);
  }
  pump() {
    if (!this.enabled) return;
    for (const tile of this.pendingTiles().slice(0, Math.max(0, 2 - this.loads.size))) {
      const key = keyOf(tile),
        controller = new AbortController(),
        generation = this.generation.get(tile.cityId) || 0;
      const work = this.load(tile, controller.signal)
        .then((pixels) => {
          if (
            !this.enabled ||
            controller.signal.aborted ||
            generation !== (this.generation.get(tile.cityId) || 0)
          )
            return;
          if (![...this.views.values()].some((v) => v.plan.some((t) => keyOf(t) === key))) return;
          if (this.texture.image.depth === 1) {
            this.texture.dispose();
            this.texture = this.makeTexture(CITY_GPU_LAYERS);
            for (const v of this.views.values()) v.uniforms.cityMap.value = this.texture;
          }
          const occupied = new Set([...this.entries.values()].map((e) => e.layer));
          let layer = 0;
          while (occupied.has(layer)) layer++;
          if (layer >= CITY_GPU_LAYERS) return;
          this.texture.image.data.set(pixels, layer * BYTES);
          this.texture.addLayerUpdate(layer);
          this.texture.needsUpdate = true;
          this.entries.set(key, { ...tile, layer, born: performance.now() });
          this.failures.delete(key);
          this.revision++;
          this.writeUniforms();
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            if (error.code !== 'offline') this.lastError = error.message;
            this.failures.set(key, error.code === 'offline' ? Infinity : performance.now() + 15000);
            this.revision++;
          }
        })
        .finally(() => {
          if (this.loads.get(key)?.controller === controller) this.loads.delete(key);
          this.pump();
        });
      this.loads.set(key, { controller, work });
    }
    clearTimeout(this.retry);
    const retryAt = [...this.views.values()]
      .flatMap((v) => v.plan.map((t) => this.failures.get(keyOf(t))))
      .filter((time) => Number.isFinite(time) && time > performance.now());
    if (retryAt.length)
      this.retry = setTimeout(
        () => this.pump(),
        Math.max(1, Math.min(...retryAt) - performance.now() + 1)
      );
  }
  async payload(meta, tile, signal, pinned = false, epoch) {
    signal?.throwIfAborted();
    if (meta.builtin) {
      const response = await fetch(meta.tiles[tile.key], { signal });
      if (!response.ok) throw Error('内置城市影像未能读取');
      return {
        buffer: await response.arrayBuffer(),
        mimeType: response.headers.get('content-type') || 'image/avif',
      };
    }
    const cached = await this.cache.getTile(meta.id, tile.key);
    if (cached) return cached;
    if (meta.streaming && (!this.streaming.enabled || !this.streamWanted.has(meta.id))) {
      const error = Error('当前仅使用已缓存卫星影像');
      error.code = 'offline';
      throw error;
    }
    if (
      !meta.streaming &&
      !this.autoEnabled &&
      !this.allowedOnline.has(meta.id) &&
      !this.downloads.has(meta.id)
    )
      throw Error('此城市仅使用已缓存影像；可在城市库下载完整区域');
    const payload = await this.sharedPayload(meta, tile, signal);
    signal?.throwIfAborted();
    try {
      await this.cache.putTile(meta, tile.key, payload, { pinned, epoch });
    } catch (error) {
      if (pinned || error.code === 'stale') throw error;
      this.lastError = error.message;
    }
    return payload;
  }
  sharedPayload(meta, tile, signal) {
    const key = meta.id + '/' + tile.key + '@' + (this.generation.get(meta.id) || 0);
    let entry = this.payloads.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, users: new Set() };
      entry.promise = this.source.tile(meta, tile, controller.signal).finally(() => {
        if (this.payloads.get(key) === entry) this.payloads.delete(key);
      });
      this.payloads.set(key, entry);
    }
    return new Promise((resolve, reject) => {
      const token = {};
      entry.users.add(token);
      const done = () => {
        signal?.removeEventListener('abort', abort);
        entry.users.delete(token);
      };
      const abort = () => {
        done();
        if (!entry.users.size) entry.controller.abort();
        reject(abortError());
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      entry.promise.then(
        (value) => {
          done();
          if (!signal?.aborted) resolve(value);
        },
        (error) => {
          done();
          reject(error);
        }
      );
    });
  }
  async load(tile, signal) {
    const meta = this.cities.get(tile.cityId);
    if (!meta) throw abortError();
    const epoch = meta.builtin
      ? undefined
      : await this.cache.getEpoch(meta.id).catch(() => undefined);
    const record = await this.payload(meta, tile, signal, false, epoch);
    signal.throwIfAborted();
    const image = await createImageBitmap(new Blob([record.buffer], { type: record.mimeType }), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    try {
      signal.throwIfAborted();
      if (image.width !== SIZE || image.height !== SIZE) throw Error('城市影像瓦片尺寸不符');
      this.canvas ??= document.createElement('canvas');
      this.canvas.width = this.canvas.height = SIZE;
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, SIZE, SIZE).data;
    } finally {
      image.close();
    }
  }
  writeUniforms() {
    const now = performance.now();
    for (const view of this.views.values()) {
      const selected = view.plan
        .map((t) => this.entries.get(keyOf(t)))
        .filter(Boolean)
        .sort(
          (a, b) =>
            Number(this.cities.get(b.cityId)?.streaming) -
              Number(this.cities.get(a.cityId)?.streaming) ||
            Number(this.cities.get(a.cityId)?.builtin) -
              Number(this.cities.get(b.cityId)?.builtin) ||
            a.cityId.localeCompare(b.cityId) ||
            a.z - b.z
        );
      const u = view.uniforms;
      u.cityCount.value = Math.min(CITY_DRAW_LIMIT, selected.length);
      let group = -1,
        previous = null;
      for (let i = 0; i < u.cityCount.value; i++) {
        const e = selected[i];
        if (previous !== e.cityId) {
          previous = e.cityId;
          group++;
        }
        u.cityRects.value[i].fromArray(e.rect);
        u.cityBounds.value[i].fromArray(e.cityRect);
        u.cityParams.value[i].set(
          e.layer,
          fade(e, now),
          group,
          this.cities.get(e.cityId)?.streaming ? -1 : e.z
        );
        const n = 2 ** e.z;
        const neighbour = (x, y) => {
          if (x < 0 || y < 0 || x >= n || y >= n) return 1;
          const other = this.entries.get(e.cityId + '/' + e.z + '/' + x + '/' + y);
          return other ? fade(other, now) : 0;
        };
        // west/east/south/north, while tile y increases towards the south.
        u.cityEdges.value[i].set(
          neighbour(e.x - 1, e.y),
          neighbour(e.x + 1, e.y),
          neighbour(e.x, e.y + 1),
          neighbour(e.x, e.y - 1)
        );
      }
    }
  }
  status(id) {
    const plan = this.views.get(id)?.plan || [],
      loaded = plan.filter((t) => this.entries.has(keyOf(t)));
    const sources = [...new Set(loaded.map((t) => t.cityId))].map((cityId) =>
      this.cities.get(cityId)
    );
    return {
      enabled: this.enabled,
      requested: plan.length,
      ready: loaded.length,
      complete: loaded.length === plan.length,
      loading: this.loads.size > 0,
      sources,
      gpuBytes: this.texture.image.depth === 1 ? 4 : (CITY_GPU_LAYERS * BYTES * 4) / 3,
      cpuBytes: this.texture.image.data.byteLength,
      error: this.lastError,
      streaming: {
        ...this.streaming,
        preparing: this.streamJobs.size,
        regionCount: [...this.cities.values()].filter((c) => c.streaming).length,
        paused: this.streamPausedAt !== null,
        error: this.streamError,
      },
    };
  }
  key(id) {
    const now = performance.now(),
      moving = [...this.entries.values()].some((e) => fade(e, now) < 1);
    return `${this.revision}:${moving ? Math.floor(now / 80) : ''}:${this.status(id).requested}`;
  }
  async prepareView(id, input, priority = 3, waitMs = 8000) {
    this.setView(id, input, priority, true);
    const until = performance.now() + waitMs;
    while (!this.status(id).complete && performance.now() < until && this.enabled) {
      const work = [...this.loads.values()].map((l) => l.work);
      if (!work.length) break;
      await Promise.race([
        Promise.allSettled(work),
        new Promise((resolve) => setTimeout(resolve, 150)),
      ]);
      this.pump();
    }
    // A freshly loaded photo tile must reach full opacity before the shutter.
    while (this.status(id).complete && performance.now() < until && this.enabled) {
      const remaining = (this.views.get(id)?.plan || []).reduce((wait, tile) => {
        const entry = this.entries.get(keyOf(tile));
        return Math.max(wait, entry ? FADE_MS - (performance.now() - entry.born) : 0);
      }, 0);
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(remaining + 1, 100)));
      this.writeUniforms();
    }
    return this.status(id);
  }
  saveDismissed() {
    try {
      localStorage.setItem('starorbit-city-dismissed-v1', JSON.stringify([...this.autoDismissed]));
    } catch {}
  }
  idFor(city) {
    const id = city.id.replace(/^city:/, '');
    if (this.cities.has(id)) return id;
    // Gazetteers can use a different identifier and city-centre landmark.
    for (const meta of this.cities.values()) {
      if (!meta.builtin) continue;
      const dy = city.latitude - meta.center[1];
      const dx = (city.longitude - meta.center[0]) * Math.cos((city.latitude * Math.PI) / 180);
      if (Math.hypot(dx, dy) * 111.2 < 5) return meta.id;
    }
    return id;
  }
  async addCity(city, signal, { automatic = false } = {}) {
    const id = this.idFor(city);
    const generation = this.generation.get(id) || 0;
    const current = () => {
      signal?.throwIfAborted();
      if (this.disposed || generation !== (this.generation.get(id) || 0)) throw abortError();
    };
    current();
    if (!automatic) {
      this.allowedOnline.add(id);
      this.autoDismissed?.delete(id);
      this.saveDismissed();
    }
    await this.ready;
    current();
    if (this.cities.has(id)) return this.cities.get(id);
    const meta = await this.source.prepare(city, signal);
    current();
    this.cities.set(id, meta);
    this.revision++;
    this.schedule(true);
    return meta;
  }
  async downloadCity(city) {
    const id = this.idFor(city);
    if (this.downloads.has(id)) return;
    const controller = new AbortController(),
      job = { id, controller, done: 0, total: 0, name: city.name, state: '准备下载' };
    this.downloads.set(id, job);
    this.lastError = '';
    this.revision++;
    try {
      if (!(await this.cache.stats()).persistent)
        throw Error('当前环境不能保存离线城市，请在普通浏览器窗口中重试');
      const meta = await this.addCity(city, controller.signal);
      if (meta.builtin) return;
      const tiles = allCityTiles(meta.maxLevel),
        epoch = await this.cache.getEpoch(id);
      job.total = tiles.length;
      job.state = '下载中';
      for (const tile of tiles) {
        controller.signal.throwIfAborted();
        const record = await this.payload(meta, tile, controller.signal, true, epoch);
        if (tile.z === 0) await this.cache.putTile(meta, tile.key, record, { pinned: true, epoch });
        job.done++;
        this.revision++;
        this.pump();
      }
      if (
        !(await this.cache.markComplete(
          id,
          tiles.map((t) => t.key),
          { pinned: true, epoch }
        ))
      )
        throw Error('城市包尚未完整下载，可继续下载');
      meta.complete = true;
      meta.pinned = true;
      job.state = '已离线保存';
      this.lastError = '';
    } catch (error) {
      job.state = controller.signal.aborted ? '已取消' : error.message;
      this.lastError = job.state;
    } finally {
      this.downloads.delete(id);
      this.revision++;
    }
  }
  cancelDownload(id) {
    this.downloads.get(id)?.controller.abort();
  }
  async removeCity(id) {
    if (this.cities.get(id)?.builtin) return;
    this.generation.set(id, (this.generation.get(id) || 0) + 1);
    this.cancelDownload(id);
    this.allowedOnline.delete(id);
    if (
      this.cities.get(id)?.streaming ||
      this.streamJobs.has(id) ||
      id.startsWith('surface-2025-')
    ) {
      this.streamDismissed.set(id, streamingViewKey([...this.views.values()]));
      this.streamJobs.get(id)?.controller.abort();
    } else {
      this.autoDismissed?.add(id);
      this.saveDismissed();
    }
    for (const [key, load] of this.loads) if (key.startsWith(id + '/')) load.controller.abort();
    this.cities.delete(id);
    this.revision++;
    this.schedule(true);
    try {
      await this.cache.remove(id);
    } catch (error) {
      this.lastError = error.message;
      this.revision++;
      throw error;
    }
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.scheduled);
    clearTimeout(this.retry);
    clearTimeout(this.streamRetry);
    clearTimeout(this.streamReplan);
    for (const l of this.loads.values()) l.controller.abort();
    for (const j of this.downloads.values()) j.controller.abort();
    for (const j of this.streamJobs.values()) j.controller.abort();
    this.enabled = false;
    this.source.close();
    this.cache.close();
    this.texture.dispose();
    this.views.clear();
    this.entries.clear();
  }
}

// The existing main and optical Earth shaders share this exact albedo function.
// Each city's outer feather is applied once, independent of loaded LOD count.
export const cityTerrainGLSL = `
uniform highp sampler2DArray cityMap;
uniform int cityCount;
uniform vec4 cityRects[64],cityBounds[64],cityParams[64],cityEdges[64];
vec3 cityTerrainColor(vec2 uv,vec2 dx,vec2 dy,vec3 base){
 vec3 result=base,premul=vec3(0.);float opacity=0.,edge=0.,group=-1.;
 for(int i=0;i<64;i++){
  if(i>=cityCount)break;
  vec4 info=cityParams[i],rect=cityRects[i];
  if(info.z!=group){
   result=mix(result,premul/max(opacity,.00001),opacity*edge);premul=vec3(0.);opacity=0.;group=info.z;
   vec2 q=(uv-cityBounds[i].xy)/cityBounds[i].zw;
   edge=info.w<0.?1.:smoothstep(0.,.08,min(min(q.x,1.-q.x),min(q.y,1.-q.y)));
  }
  vec2 p=(uv-rect.xy)/rect.zw;if(any(lessThan(p,vec2(0.)))||any(greaterThanEqual(p,vec2(1.))))continue;
  vec2 footprint=max(2.*sqrt(dx*dx+dy*dy)/rect.zw,vec2(.000001));
  vec4 ramp=smoothstep(vec4(0.),vec4(footprint.x,footprint.x,footprint.y,footprint.y),vec4(p.x,1.-p.x,p.y,1.-p.y));
  ramp=mix(ramp,vec4(1.),cityEdges[i]);
  vec2 tuv=vec2(p.x,1.-p.y)*(504./512.)+vec2(4./512.);
  vec4 color=textureGrad(cityMap,vec3(tuv,info.x),vec2(dx.x,-dx.y)/rect.zw*(504./512.),vec2(dy.x,-dy.y)/rect.zw*(504./512.));
  float amount=info.y*color.a*ramp.x*ramp.y*ramp.z*ramp.w;
  premul=premul*(1.-amount)+color.rgb*amount;opacity=opacity*(1.-amount)+amount;
 }
 return mix(result,premul/max(opacity,.00001),opacity*edge);
}`;
