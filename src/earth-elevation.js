import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { createSkyTileCache } from './sky-detail-cache.js';
import { ElevationSource } from './earth-elevation-source.js';
import {
  elevationBaseMesh,
  elevationTileMesh,
  elevationTile,
  sampleElevationBase,
  sampleElevationMesh,
  planElevationTiles,
} from './earth-elevation-math.js';

export const ELEVATION_DISK_BYTES = 128 * 1024 * 1024;
export const ELEVATION_GEOMETRY_BYTES = 48 * 1024 * 1024;
export const ELEVATION_CPU_BYTES = 96 * 1024 * 1024;
const GRID = 129,
  MAX_TILES = 48,
  FADE_MS = 500;
const PATCH_VERTICES = GRID * GRID + 4 * (GRID - 1);
const PATCH_INDICES = (GRID - 1) ** 2 * 6 + 4 * (GRID - 1) * 6;
const PATCH_GPU_BYTES = PATCH_VERTICES * 44 + PATCH_INDICES * 2;
const PATCH_CPU_BYTES = PATCH_GPU_BYTES + PATCH_VERTICES * 12 + GRID * GRID * 4;

export function elevationGeometry(data) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
  geometry.setAttribute(
    'basePosition',
    new THREE.BufferAttribute(data.basePositions || data.positions, 3)
  );
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingBox();
  const point = new THREE.Vector3();
  const transition = geometry.getAttribute('basePosition');
  for (let i = 0; i < transition.count; i++) {
    geometry.boundingBox.expandByPoint(point.fromBufferAttribute(transition, i));
  }
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  geometry.boundingSphere.radius += Math.max(1e-7, geometry.boundingSphere.radius * 1e-12);
  geometry.userData.origin = data.origin || [0, 0, 0];
  geometry.userData.surfaceIndexCount = data.columns * data.rows * 6;
  geometry.userData.bodyVertexCount = data.bodyVertexCount || data.positions.length / 3;
  geometry.addEventListener('dispose', () => {
    geometry.userData.pickGeometry?.dispose();
    delete geometry.userData.pickGeometry;
    geometry.boundsTree = null;
  });
  return geometry;
}
const bytesOf = (geometry) =>
  [
    ...new Set([...Object.values(geometry.attributes).map((a) => a.array), geometry.index.array]),
  ].reduce((n, a) => n + a.byteLength, 0);

// Body-only fallback when another BVH would exceed the CPU allowance. Sampling
// the morph directly also avoids allocating a temporary full position array.
function directSurfaceHit(geometry, ray, fade) {
  const positions = geometry.getAttribute('position');
  const bases = geometry.getAttribute('basePosition');
  const uv = geometry.getAttribute('uv');
  const index = geometry.index;
  const count = geometry.userData.surfaceIndexCount || index.count;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const point = new THREE.Vector3(),
    weights = new THREE.Vector3();
  const read = (target, node) => {
    target.fromBufferAttribute(positions, node);
    if (fade < 1) {
      target.set(
        bases.getX(node) + (target.x - bases.getX(node)) * fade,
        bases.getY(node) + (target.y - bases.getY(node)) * fade,
        bases.getZ(node) + (target.z - bases.getZ(node)) * fade
      );
    }
  };
  let hit = null;
  for (let i = 0; i < count; i += 3) {
    const ia = index.getX(i),
      ib = index.getX(i + 1),
      ic = index.getX(i + 2);
    read(a, ia);
    read(b, ib);
    read(c, ic);
    if (!ray.intersectTriangle(a, b, c, true, point)) continue;
    const distance = ray.origin.distanceTo(point);
    if (hit && distance >= hit.distance) continue;
    THREE.Triangle.getBarycoord(point, a, b, c, weights);
    hit = {
      distance,
      point: point.clone(),
      uv: new THREE.Vector2(
        uv.getX(ia) * weights.x + uv.getX(ib) * weights.y + uv.getX(ic) * weights.z,
        uv.getY(ia) * weights.x + uv.getY(ib) * weights.y + uv.getY(ic) * weights.z
      ),
    };
  }
  return hit;
}
async function unzip(blob) {
  return blob.type === 'application/gzip'
    ? new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : blob.arrayBuffer();
}
async function pack(heights) {
  const blob = new Blob([heights], { type: 'application/octet-stream' });
  return typeof CompressionStream === 'function'
    ? new Blob(
        [
          await new Response(
            blob.stream().pipeThrough(new CompressionStream('gzip'))
          ).arrayBuffer(),
        ],
        { type: 'application/gzip' }
      )
    : blob;
}

// Own the data and geometries once. Main, finder and photographs only borrow them.
export class EarthElevation {
  constructor(manifest, options = {}) {
    this.manifest = manifest;
    this.source = options.source || new ElevationSource();
    this.cache =
      options.cache ||
      createSkyTileCache({
        database: 'starorbit-elevation-v1',
        namespace: 'cop30-2023_1-grid129-v1',
        maxBytes: ELEVATION_DISK_BYTES,
        memoryMaxBytes: 4 * 1024 * 1024,
        maxTileBytes: 512 * 1024,
      });
    this.entries = new Map();
    this.views = new Map();
    this.pending = new Map();
    this.wanted = new Map();
    this.failures = new Map();
    this.enabled = false;
    this.disposed = false;
    this.generation = 0;
    this.revision = 0;
    this.enableRequest = 0;
    this.entrySerial = 0;
    this.activeBuild = null;
    this.lastError = '';
    this.baseTask = null;
    this.base = null;
    this.baseGeometry = null;
    this.now = options.now || (() => performance.now());
    this.loadBase =
      options.loadBase ||
      (async (signal) => {
        const meta = this.manifest.base,
          response = await fetch(meta.url, { signal });
        if (!response.ok) throw Error('全球高程底座载入失败');
        const buffer = await unzip(
          new Blob([await response.arrayBuffer()], { type: 'application/gzip' })
        );
        if (buffer.byteLength !== meta.width * meta.height * 2) throw Error('全球高程数据长度不符');
        return elevationBaseMesh(new Int16Array(buffer), {
          width: meta.width,
          height: meta.height,
          columns: 512,
          rows: 256,
        });
      });
  }
  setEnabled(enabled) {
    // Count explicit requests even if the checkbox already has that value:
    // clearCache must not later undo an intervening request to stay disabled.
    this.enableRequest++;
    enabled = !!enabled && !!this.manifest?.base && !this.disposed;
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.generation++;
    this.revision++;
    if (!enabled) {
      this.baseController?.abort();
      this.baseTask = null;
      for (const p of this.pending.values()) p.abort();
      this.pending.clear();
      this.source.close();
      for (const view of this.views.values()) {
        view.stale = true;
        for (const e of view.display || []) e.geometry.dispose();
      }
      this.views.clear();
      this.wanted.clear();
      this.failures.clear();
      for (const e of this.entries.values()) e.geometry?.dispose();
      this.entries.clear();
      this.baseGeometry?.dispose();
      this.baseGeometry = null;
      this.base = null;
      clearTimeout(this.retryTimer);
      clearTimeout(this.buildTimer);
      if (this.activeBuild) {
        for (const entry of this.activeBuild.fresh) entry.geometry.dispose();
        this.activeBuild.fresh.length = 0;
        this.activeBuild = null;
      }
      return;
    }
    const generation = this.generation,
      controller = (this.baseController = new AbortController());
    this.lastError = '';
    this.baseTask = this.loadBase(controller.signal)
      .then((data) => {
        if (controller.signal.aborted || generation !== this.generation) return;
        this.base = data;
        this.baseGeometry = elevationGeometry(data);
        this.revision++;
        this.reconcile();
      })
      .catch((error) => {
        if (!controller.signal.aborted && generation === this.generation) {
          this.lastError = error.message;
          this.revision++;
        }
      })
      .finally(() => {
        if (generation === this.generation) this.baseTask = null;
      });
  }
  setView(id, view, priority = 1, force = false) {
    if (!this.enabled || !view) {
      this.release(id);
      return;
    }
    const old = this.views.get(id),
      now = this.now();
    if (!force && old && now - old.checked < 250) return;
    const plan = planElevationTiles(view, {
      maxTiles: 12,
      minLevel: 7,
      maxLevel: 12,
      gridSize: GRID,
      minHeightMeters: -500,
      maxHeightMeters: 9000,
    });
    const signature = plan.tiles
      .map((t) => t.key)
      .sort()
      .join('|');
    if (old?.signature === signature) {
      const changedPriority = old.priority !== priority;
      old.view = view;
      old.plan = plan;
      old.checked = now;
      old.priority = priority;
      if (force || changedPriority) this.reconcile();
      return;
    }
    if (old) old.stale = true;
    this.views.set(id, {
      view,
      priority,
      checked: now,
      plan,
      signature,
      display: old?.display || [],
      displayKey: old?.displayKey,
      buildKey: null,
      building: false,
    });
    this.reconcile();
  }
  reconcile() {
    if (!this.enabled || this.disposed) return;
    const wanted = new Map();
    for (const view of [...this.views.values()].sort((a, b) => b.priority - a.priority))
      for (const tile of view.plan.tiles)
        if (wanted.size < MAX_TILES || wanted.has(tile.key)) wanted.set(tile.key, tile);
    this.wanted = wanted;
    for (const [key, controller] of this.pending)
      if (!wanted.has(key)) {
        controller.abort();
        this.pending.delete(key);
      }
    for (const [key, entry] of this.entries) {
      if (wanted.has(key)) entry.used = this.now();
    }
    this.pump();
    this.buildViews();
  }
  evict(extra = 0) {
    const bytes = () => [...this.entries.values()].reduce((n, e) => n + (e.bytes || 0), 0);
    for (const entry of [...this.entries.values()]
      .filter((e) => !this.wanted.has(e.tile.key))
      .sort((a, b) => a.used - b.used)) {
      if (this.entries.size < MAX_TILES && bytes() + extra <= ELEVATION_GEOMETRY_BYTES) break;
      entry.geometry?.dispose();
      this.entries.delete(entry.tile.key);
      this.revision++;
    }
    return this.entries.size < MAX_TILES && bytes() + extra <= ELEVATION_GEOMETRY_BYTES;
  }
  pump() {
    if (!this.enabled || !this.base || this.disposed) return;
    clearTimeout(this.retryTimer);
    for (const tile of this.wanted.values()) {
      if (this.pending.size >= 2) break;
      if (
        this.entries.has(tile.key) ||
        this.pending.has(tile.key) ||
        (this.failures.get(tile.key) || 0) > this.now()
      )
        continue;
      const controller = new AbortController(),
        generation = this.generation;
      this.pending.set(tile.key, controller);
      (async () => {
        let blob = await this.cache.get(tile.key),
          heights;
        controller.signal.throwIfAborted();
        if (blob) {
          const buffer = await unzip(blob);
          if (buffer.byteLength === GRID * GRID * 4) heights = new Float32Array(buffer);
        }
        if (!heights) {
          const result = await this.source.tile(tile, controller.signal);
          heights = result.heights;
          if (!(heights instanceof Float32Array) || heights.length !== GRID * GRID)
            throw Error('局部高程数据长度不符');
          controller.signal.throwIfAborted();
          blob = await pack(heights);
          if (generation === this.generation && !controller.signal.aborted)
            await this.cache.put(tile.key, blob);
        }
        controller.signal.throwIfAborted();
        if (generation !== this.generation || !this.wanted.has(tile.key)) return;
        const valid = heights.reduce((n, h) => n + (Number.isFinite(h) ? 1 : 0), 0);
        if (!this.evict()) {
          throw Error('地形缓存预算已满，保留全球底座');
        }
        this.entries.set(tile.key, {
          tile,
          heights,
          valid,
          bytes: heights.byteLength,
          revision: ++this.entrySerial,
          used: this.now(),
          born: this.now(),
        });
        this.failures.delete(tile.key);
        this.lastError = '';
        this.revision++;
      })()
        .catch((error) => {
          if (!controller.signal.aborted && generation === this.generation) {
            this.failures.set(tile.key, this.now() + 30000);
            this.lastError = error.message;
            this.revision++;
          }
        })
        .finally(() => {
          if (this.pending.get(tile.key) === controller) this.pending.delete(tile.key);
          if (generation === this.generation) {
            this.pump();
            this.buildViews();
          }
        });
    }
    const deadlines = [...this.wanted.keys()]
      .filter((k) => !this.entries.has(k) && !this.pending.has(k) && this.failures.has(k))
      .map((k) => this.failures.get(k));
    if (deadlines.length)
      this.retryTimer = setTimeout(
        () => this.pump(),
        Math.max(50, Math.min(...deadlines) - this.now() + 1)
      );
  }
  viewDataKey(state) {
    return state.plan.tiles
      .map((tile) => {
        const entry = this.entries.get(tile.key);
        return `${tile.key}:${entry?.revision ?? entry?.born ?? 'fallback'}`;
      })
      .sort()
      .join('|');
  }
  cpuBytes() {
    const buffers = new Set();
    const add = (value) => {
      if (ArrayBuffer.isView(value)) buffers.add(value.buffer);
      else if (value instanceof ArrayBuffer) buffers.add(value);
    };
    const data = (record) => {
      if (record) for (const value of Object.values(record)) add(value);
    };
    const geometry = (value) => {
      if (!value) return;
      for (const attribute of Object.values(value.attributes)) add(attribute.array);
      add(value.index?.array);
      if (value.boundsTree) {
        const serialized = MeshBVH.serialize(value.boundsTree, { cloneBuffers: false });
        for (const root of serialized.roots) add(root);
        add(serialized.indirectBuffer);
      }
      if (value.userData.pickGeometry) geometry(value.userData.pickGeometry);
    };
    data(this.base);
    geometry(this.baseGeometry);
    for (const entry of this.entries.values()) add(entry.heights);
    const displays = [...this.views.values()].flatMap((state) => state.display || []);
    for (const entry of [...displays, ...(this.activeBuild?.fresh || [])]) {
      data(entry.data);
      geometry(entry.geometry);
    }
    return [...buffers].reduce((bytes, buffer) => bytes + buffer.byteLength, 0);
  }
  buildViews() {
    if (!this.enabled || !this.base || this.activeBuild) return;
    clearTimeout(this.buildTimer);
    let nextFade = Infinity;
    for (const [id, state] of [...this.views].sort((a, b) => b[1].priority - a[1].priority)) {
      const tiles = state.plan.tiles;
      if (tiles.some((tile) => !this.entries.has(tile.key) && !this.failures.has(tile.key)))
        continue;
      const key = this.viewDataKey(state);
      if (state.buildKey === key) continue;
      const old = [...(state.display || [])].sort((a, b) => b.tile.z - a.tile.z);
      // Let an outgoing morph finish before taking it as the next foundation.
      // Sampling its final shape mid-fade would make the next transition jump.
      const remaining = Math.max(0, ...old.map((entry) => entry.born + FADE_MS - this.now()));
      if (remaining > 0) {
        nextFade = Math.min(nextFade, remaining);
        continue;
      }
      state.buildKey = key;
      state.building = true;
      state.buildFailed = false;
      const fresh = [],
        generation = this.generation;
      const task = (this.activeBuild = { state, fresh });
      const available = new Map(
        tiles
          .map((tile) => [tile.key, this.entries.get(tile.key)])
          .filter(([, entry]) => entry?.valid)
      );
      const current = () =>
        !state.stale &&
        generation === this.generation &&
        this.views.get(id) === state &&
        this.activeBuild === task &&
        this.viewDataKey(state) === key;
      const baseSample = (lon, lat) => {
        for (const record of old) {
          const sample = sampleElevationMesh(record.data, lon, lat);
          if (sample) return sample;
        }
        return sampleElevationBase(this.base, lon, lat);
      };
      (async () => {
        const otherBytes = [...this.views.values()]
          .filter((value) => value !== state)
          .flatMap((value) => value.display || [])
          .reduce((bytes, entry) => bytes + entry.bytes, 0);
        if (otherBytes + available.size * PATCH_GPU_BYTES > ELEVATION_GEOMETRY_BYTES) {
          throw Error('地形显示预算已满，保留可用地形');
        }
        for (const entry of available.values()) {
          if (!current()) return;
          if (this.cpuBytes() + PATCH_CPU_BYTES > ELEVATION_CPU_BYTES) {
            throw Error('地形构建内存已满，保留可用地形');
          }
          const tile = entry.tile,
            ny = 2 ** tile.z;
          const neighbour = ([dx, dy]) =>
            tile.y + dy >= 0 &&
            tile.y + dy < ny &&
            available.has(elevationTile(tile.z, tile.x + dx, tile.y + dy).key);
          const data = elevationTileMesh(tile, entry.heights, {
            gridSize: GRID,
            base: this.base,
            baseSample,
            edgeBlendCells: 3,
            edgeNeighbours: [
              [-1, 0],
              [1, 0],
              [0, 1],
              [0, -1],
            ].map(neighbour),
            cornerNeighbours: [
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ].map(neighbour),
          });
          const geometry = elevationGeometry(data),
            bytes = bytesOf(geometry);
          fresh.push({ tile, data, geometry, bytes, valid: entry.valid, born: this.now() });
          // Only one view builds at a time, and only one patch per event-loop
          // turn. Resident and staging arrays both count towards the CPU cap.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (!current()) return;
        for (const record of old) record.geometry.dispose();
        state.display = fresh;
        state.displayKey = key;
        for (const record of fresh) record.born = this.now();
        this.revision++;
      })()
        .catch((error) => {
          if (current()) {
            this.lastError = error.message;
            state.buildFailed = true;
            this.revision++;
          }
        })
        .finally(() => {
          if (state.display !== fresh) for (const record of fresh) record.geometry.dispose();
          state.building = false;
          if (this.activeBuild === task) {
            this.activeBuild = null;
            this.buildViews();
          }
        });
      return;
    }
    if (Number.isFinite(nextFade)) {
      this.buildTimer = setTimeout(() => this.buildViews(), Math.max(1, nextFade + 1));
    }
  }
  records(id) {
    return this.views.get(id)?.display || [];
  }
  fade(entry) {
    return Math.min(1, Math.max(0, (this.now() - entry.born) / FADE_MS));
  }
  status(id) {
    const state = this.views.get(id);
    const tiles = state?.plan.tiles || [],
      records = tiles.map((t) => this.entries.get(t.key));
    const ready = records.filter((e) => e?.valid).length,
      fallback = records.filter((e) => e && !e.valid).length;
    const displayed = !state || state.displayKey === this.viewDataKey(state);
    return {
      enabled: this.enabled,
      baseReady: !!this.base,
      requested: tiles.length,
      ready,
      fallback,
      loading:
        !!this.baseTask ||
        !!state?.building ||
        (!!state && !displayed && !state.buildFailed) ||
        tiles.some((t) => this.pending.has(t.key)),
      complete: !!this.base && ready === tiles.length && displayed && !state?.building,
      error: this.lastError,
      gpuBytes:
        (this.baseGeometry ? bytesOf(this.baseGeometry) : 0) +
        [...this.views.values()].flatMap((v) => v.display || []).reduce((n, e) => n + e.bytes, 0),
      cpuBytes: this.cpuBytes(),
      residentTiles: this.entries.size,
      renderedTiles: this.records(id).length,
      source: 'Copernicus DEM GLO-30 · 2023_1',
      scale: 1,
    };
  }
  key(id) {
    return `${this.enabled}|${this.revision}|${this.records(id)
      .map((e) => `${e.tile.key}:${Math.floor(this.fade(e) * 10)}`)
      .join(',')}`;
  }
  async prepareView(id, view, priority = 3, waitMs = 8000) {
    if (!this.enabled) return;
    this.setView(id, view, priority, true);
    const until = this.now() + waitMs;
    while (this.enabled && !this.disposed && this.now() < until) {
      const s = this.status(id);
      if (s.baseReady && !s.loading && (s.complete || s.error || s.fallback)) break;
      await new Promise((r) => setTimeout(r, 60));
    }
    for (const record of this.records(id))
      record.born = Math.min(record.born, this.now() - FADE_MS);
    return this.status(id);
  }
  release(id) {
    const view = this.views.get(id);
    if (!view) return;
    view.stale = true;
    for (const record of view.display || []) record.geometry.dispose();
    this.views.delete(id);
    for (const state of this.views.values()) {
      if (state.buildFailed) {
        state.buildKey = null;
        state.buildFailed = false;
      }
    }
    this.reconcile();
  }
  async clearCache() {
    const enabled = this.enabled;
    this.setEnabled(false);
    const request = this.enableRequest;
    try {
      return await this.cache.clear();
    } finally {
      if (this.enableRequest === request && !this.disposed) this.setEnabled(enabled);
    }
  }
  heightAt(longitude, latitude) {
    if (!this.enabled || !this.base) return 0;
    const all = [...this.views.values()]
      .flatMap((v) => v.display || [])
      .sort((a, b) => b.tile.z - a.tile.z);
    for (const record of all) {
      const surface = sampleElevationMesh(record.data, longitude, latitude);
      if (!surface) continue;
      const fade = this.fade(record);
      if (fade === 1) return surface.heightMeters;
      const from = sampleElevationMesh(
        { ...record.data, positions: record.data.basePositions },
        longitude,
        latitude
      );
      return (
        (Math.hypot(
          ...surface.position.map(
            (value, i) => from.position[i] + (value - from.position[i]) * fade
          )
        ) -
          this.base.radiusKm) *
        1000
      );
    }
    return sampleElevationBase(this.base, longitude, latitude)?.heightMeters ?? 0;
  }
  surfaceHit(geometry, ray, fade = 1) {
    if (!ray.intersectsSphere(geometry.boundingSphere)) return null;
    const surfaceCount = geometry.userData.surfaceIndexCount || geometry.index.count;
    const bodyCount = geometry.userData.bodyVertexCount;
    let pickGeometry = geometry.userData.pickGeometry;
    // Includes a conservative allowance for the BVH builder's temporary
    // triangle bounds, its final tree and the optional morphed position array.
    if (
      !pickGeometry &&
      this.cpuBytes() + (surfaceCount / 3) * 100 + bodyCount * 12 > ELEVATION_CPU_BYTES
    ) {
      return directSurfaceHit(geometry, ray, fade);
    }
    if (!pickGeometry) {
      pickGeometry = new THREE.BufferGeometry();
      pickGeometry.setAttribute('position', geometry.getAttribute('position'));
      pickGeometry.setAttribute('uv', geometry.getAttribute('uv'));
      pickGeometry.setIndex(
        new THREE.BufferAttribute(geometry.index.array.subarray(0, surfaceCount), 1)
      );
      pickGeometry.boundingSphere = geometry.boundingSphere.clone();
      pickGeometry.addEventListener('dispose', () => {
        pickGeometry.boundsTree = null;
      });
      geometry.userData.pickGeometry = pickGeometry;
    }
    if (pickGeometry.userData.fade !== fade) {
      if (fade < 1) {
        let attribute = pickGeometry.userData.morph;
        if (!attribute) {
          attribute = new THREE.BufferAttribute(new Float32Array(bodyCount * 3), 3);
          pickGeometry.userData.morph = attribute;
        }
        const from = geometry.getAttribute('basePosition').array;
        const to = geometry.getAttribute('position').array;
        for (let i = 0; i < attribute.array.length; i++) {
          attribute.array[i] = from[i] + (to[i] - from[i]) * fade;
        }
        pickGeometry.setAttribute('position', attribute);
      } else {
        pickGeometry.setAttribute('position', geometry.getAttribute('position'));
        delete pickGeometry.userData.morph;
      }
      pickGeometry.userData.fade = fade;
      pickGeometry.boundsTree?.refit();
    }
    pickGeometry.boundsTree ||= new MeshBVH(pickGeometry, { indirect: true, maxLeafTris: 8 });
    return pickGeometry.boundsTree.raycastFirst(ray, THREE.FrontSide);
  }
  skyOccluded(eyeFixed, directionFixed, id) {
    if (!this.enabled || !this.base || !this.baseGeometry) return false;
    const [x, y, z] = eyeFixed;
    const [dx, dy, dz] = directionFixed;
    const length = Math.hypot(dx, dy, dz);
    if (!(length > 0) || !Number.isFinite(length + x + y + z)) return false;
    // Copernicus land heights fit below 9 km; keep a larger actual global DEM
    // maximum if provided. One metre also covers Float32 vertex rounding.
    // This bound is constant-time and does not inspect the visible tile meshes.
    const radius =
      this.base.radiusKm +
      Math.max(9000, Number.isFinite(this.base.maxHeight) ? this.base.maxHeight : 0) / 1000 +
      0.001;
    const along = (x * dx + y * dy + z * dz) / length;
    const outside = x * x + y * y + z * z - radius * radius;
    if (outside > 0 && along >= 0) return false;
    const discriminant = along * along - outside;
    if (discriminant < 0 || -along + Math.sqrt(discriminant) <= 0) return false;
    return !!this.pick(eyeFixed, directionFixed, id);
  }
  pick(eye, direction, id) {
    if (!this.enabled || !this.baseGeometry) return undefined;
    const records = this.records(id),
      cast = (geometry, origin = [0, 0, 0], fade = 1) => {
        const ray = new THREE.Ray(
          new THREE.Vector3(...eye).sub(new THREE.Vector3(...origin)),
          new THREE.Vector3(...direction).normalize()
        );
        return this.surfaceHit(geometry, ray, fade);
      };
    let best = null,
      point;
    const baseHit = cast(this.baseGeometry);
    if (baseHit) {
      const lon = (baseHit.uv.x - 0.5) * 360,
        lat = (baseHit.uv.y - 0.5) * 180;
      if (
        !records.some((e) => {
          const b = e.tile.bounds;
          return lon >= b[0] && lon < b[2] && lat >= b[1] && lat < b[3];
        })
      ) {
        best = baseHit;
        point = baseHit.point;
      }
    }
    for (const record of records) {
      const hit = cast(record.geometry, record.geometry.userData.origin, this.fade(record));
      if (hit && (!best || hit.distance < best.distance)) {
        best = hit;
        point = hit.point.clone().add(new THREE.Vector3(...record.geometry.userData.origin));
      }
    }
    return best
      ? {
          kind: 'earth',
          distanceKm: best.distance,
          longitude: (best.uv.x - 0.5) * 360,
          latitude: (best.uv.y - 0.5) * 180,
          elevationMeters: (point.length() - 6371) * 1000,
        }
      : null;
  }
  retry() {
    const enabled = this.enabled;
    if (!this.base) {
      this.setEnabled(false);
      this.setEnabled(enabled);
    } else {
      this.failures.clear();
      this.lastError = '';
      for (const state of this.views.values()) {
        if (state.buildFailed) {
          state.buildKey = null;
          state.buildFailed = false;
        }
      }
      this.pump();
      this.buildViews();
    }
  }
  dispose() {
    this.setEnabled(false);
    this.disposed = true;
    this.cache.dispose();
  }
}
