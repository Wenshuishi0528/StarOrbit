import * as THREE from 'three';
import {
  constellationArtFrame,
  constellationArtFade,
  selectConstellationArt,
} from './constellation-art-math.js';

export const ART_GPU_BUDGET = 16 * 1024 * 1024;
const MAX_IMAGES = 32;
const bytesFor = (frame) => Math.ceil((frame.record.width * frame.record.height * 4 * 4) / 3);
const abortError = () => new DOMException('Cancelled', 'AbortError');

// All views borrow these textures. Images are local and decoded only when their
// registered celestial footprints become visible; the full atlas is never loaded.
export class ConstellationArt {
  constructor(manifest = {}) {
    this.frames = (manifest.images || []).map(constellationArtFrame);
    this.views = new Map();
    this.entries = new Map();
    this.loads = new Map();
    this.failures = new Map();
    this.revision = 0;
    this.disposed = false;
  }
  update(id, view, enabled, priority = 1) {
    const signature =
      enabled && view ? [view.fovY, view.aspect, ...view.forward, ...view.up].join(',') : '';
    const old = this.views.get(id);
    if (!old || old.signature !== signature || old.priority !== priority) {
      this.views.set(id, {
        signature,
        priority,
        candidates:
          signature && constellationArtFade(view.fovY) > 0
            ? selectConstellationArt(this.frames, view)
            : [],
        plan: [],
      });
      this.reconcile();
    }
    return this.ready(id);
  }
  reconcile() {
    if (this.disposed) return;
    clearTimeout(this.retry);
    const wanted = new Map();
    let bytes = 0;
    for (const view of [...this.views.values()].sort((a, b) => b.priority - a.priority)) {
      view.plan = [];
      for (const frame of view.candidates) {
        if (!wanted.has(frame.id)) {
          if (wanted.size >= MAX_IMAGES || bytes + bytesFor(frame) > ART_GPU_BUDGET) continue;
          wanted.set(frame.id, frame);
          bytes += bytesFor(frame);
        }
        view.plan.push(frame);
      }
    }
    this.wanted = wanted;
    for (const id of this.failures.keys()) if (!wanted.has(id)) this.failures.delete(id);
    for (const [id, work] of this.loads) if (!wanted.has(id)) work.controller.abort();
    for (const [id, entry] of this.entries)
      if (!wanted.has(id)) {
        entry.texture.dispose();
        entry.image.close();
        this.entries.delete(id);
        this.revision++;
      }
    this.pump();
  }
  pump() {
    if (this.disposed) return;
    for (const frame of this.wanted?.values() || []) {
      if (this.loads.size >= 2) break;
      if (
        this.entries.has(frame.id) ||
        this.loads.has(frame.id) ||
        (this.failures.get(frame.id) || 0) > performance.now()
      )
        continue;
      const controller = new AbortController();
      const work = this.load(frame, controller.signal)
        .then(({ image, texture }) => {
          if (controller.signal.aborted || this.disposed || !this.wanted.has(frame.id)) {
            texture.dispose();
            image.close();
            return;
          }
          this.entries.set(frame.id, { frame, image, texture, born: performance.now() });
          this.failures.delete(frame.id);
          this.revision++;
        })
        .catch(() => {
          if (!controller.signal.aborted) this.failures.set(frame.id, performance.now() + 10000);
        })
        .finally(() => {
          if (this.loads.get(frame.id)?.controller === controller) this.loads.delete(frame.id);
          this.pump();
        });
      this.loads.set(frame.id, { controller, work });
    }
    clearTimeout(this.retry);
    const now = performance.now();
    const deadlines = [...(this.wanted?.keys() || [])]
      .map((id) => this.failures.get(id))
      .filter((time) => time > now);
    if (deadlines.length)
      this.retry = setTimeout(() => this.pump(), Math.max(1, Math.min(...deadlines) - now + 1));
  }
  async load(frame, signal) {
    const response = await fetch(frame.record.url, { signal });
    if (!response.ok) throw Error('Constellation artwork unavailable');
    const image = await createImageBitmap(await response.blob(), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    if (signal.aborted) {
      image.close();
      throw abortError();
    }
    if (image.width !== frame.record.width || image.height !== frame.record.height) {
      image.close();
      throw Error('Invalid constellation artwork dimensions');
    }
    const texture = new THREE.Texture(image);
    // ImageBitmap retains top-down pixels; the shared shader flips its UV once.
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return { image, texture };
  }
  ready(id) {
    return (this.views.get(id)?.plan || []).map((f) => this.entries.get(f.id)).filter(Boolean);
  }
  status(id) {
    const plan = this.views.get(id)?.plan || [],
      ready = this.ready(id);
    return {
      requested: plan.length,
      ready: ready.length,
      complete: plan.length === ready.length,
      images: ready.map((e) => e.frame.id),
      gpuBytes: [...this.entries.values()].reduce((n, e) => n + bytesFor(e.frame), 0),
    };
  }
  key() {
    const now = performance.now(),
      fading = [...this.entries.values()].some((e) => now - e.born < 300);
    return this.revision + ':' + (fading ? Math.floor(now / 75) : '');
  }
  async prepare(id, view, enabled, waitMs = 2500) {
    this.update(id, view, enabled, 3);
    const until = performance.now() + waitMs;
    while (!this.status(id).complete && performance.now() < until && !this.disposed) {
      const work = [...this.loads.values()].map((l) => l.work);
      if (!work.length) break;
      await Promise.race([Promise.allSettled(work), new Promise((r) => setTimeout(r, 80))]);
    }
    // Photos do not record the transient loading fade of a teaching overlay.
    for (const e of this.ready(id)) e.born = Math.min(e.born, performance.now() - 300);
    return this.status(id);
  }
  release(id) {
    this.views.delete(id);
    this.reconcile();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.retry);
    for (const l of this.loads.values()) l.controller.abort();
    for (const e of this.entries.values()) {
      e.texture.dispose();
      e.image.close();
    }
    this.entries.clear();
    this.views.clear();
  }
}
