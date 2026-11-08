import * as THREE from 'three';
import {
  constellationArtFrame,
  constellationArtFade,
  selectConstellationArt,
} from './constellation-art-math.js';

export const ART_GPU_BUDGET = 32 * 1024 * 1024;
const MAX_IMAGES = 48;
const bytesFor = (frame) => Math.ceil((frame.record.width * frame.record.height * 4 * 4) / 3);
const abortError = () => new DOMException('Cancelled', 'AbortError');
const cultureId = (id) => (id === 'chinese' ? 'chinese' : 'western');
export const artworkTargets = (record, targetId) =>
  !!targetId &&
  (record.targetIds || record.asterismIds || []).some(
    (id) => id === targetId || 'asterism:chinese:' + id === targetId
  );
const artworkId = (frame) =>
  frame.record.original || frame.record.artworkId || frame.record.imageId;
function overviewCandidates(frames, visible, view, explicit) {
  const visibleIds = new Set(
      visible.filter((frame) => frame.record.kind === 'symbols').map(artworkId)
    ),
    groups = new Map();
  for (const frame of frames) {
    if (frame.record.kind !== 'symbols' || !visibleIds.has(artworkId(frame))) continue;
    const id = artworkId(frame);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(frame);
  }
  // A focused overview is a loading priority, not an exclusive layer. Every
  // intersecting regional illustration may overlap when the user enables it.
  return [...groups.entries()]
    .sort((a, b) => Number(b[0] === explicit) - Number(a[0] === explicit))
    .flatMap(([, group]) => group);
}
const westernCaption =
  'Constellation illustrations: Johan Meuris / Stellarium · Free Art License · teaching overlay';

// All views borrow these textures. Images are local and decoded only when their
// registered celestial footprints become visible; the full atlas is never loaded.
export class ConstellationArt {
  constructor(manifest = {}, cultureManifests = {}) {
    this.cultures = new Map();
    this.invalidImages = [];
    for (const [id, provider] of Object.entries({ western: manifest, ...cultureManifests })) {
      const source = provider || {},
        frames = [];
      for (const record of source.images || []) {
        try {
          const frame = constellationArtFrame({ ...record, tint: record.tint || source.tint });
          frame.culture = id;
          // Keep existing western diagnostic IDs stable. Other providers may use
          // the same image IDs without borrowing the wrong texture or decode.
          if (id !== 'western') frame.id = id + ':' + frame.id;
          frames.push(frame);
        } catch (error) {
          if (id === 'western') throw error;
          this.invalidImages.push({ culture: id, imageId: record.imageId, error: error.message });
        }
      }
      this.cultures.set(id, {
        frames,
        version: source.version ?? null,
        source: source.source || null,
        caption:
          source.caption ||
          source.credit ||
          (id === 'western'
            ? westernCaption
            : 'Chinese asterism illustrations · modern teaching interpretation'),
      });
    }
    this.culture = 'western';
    this.frames = this.cultures.get('western').frames;
    this.views = new Map();
    this.entries = new Map();
    this.loads = new Map();
    this.failures = new Map();
    this.revision = 0;
    this.disposed = false;
  }
  setCulture(id) {
    const next = cultureId(id);
    if (this.culture !== next) {
      this.culture = next;
      this.frames = this.cultures.get(next)?.frames || [];
      this.revision++;
    }
  }
  update(
    id,
    view,
    enabled,
    priority = 1,
    {
      culture = this.culture,
      symbols = true,
      asterisms = true,
      focusTargetId = null,
      overviewArtworkId = null,
    } = {}
  ) {
    culture = cultureId(culture);
    const provider = this.cultures.get(culture);
    const signature =
      enabled && view
        ? [
            culture,
            symbols,
            asterisms,
            focusTargetId,
            overviewArtworkId,
            view.fovY,
            view.aspect,
            ...view.forward,
            ...view.up,
          ].join(',')
        : [culture, 'off', focusTargetId, overviewArtworkId, symbols, asterisms].join(',');
    const old = this.views.get(id);
    if (!old || old.signature !== signature || old.priority !== priority) {
      let candidates = [],
        chosenOverview = [];
      if (enabled && view && view.fovY > 0) {
        const eligible = (provider?.frames || []).filter((frame) =>
            frame.record.kind === 'symbols'
              ? culture !== 'chinese' || symbols
              : (culture !== 'chinese' || asterisms) && constellationArtFade(view.fovY) > 0
          ),
          visible = selectConstellationArt(eligible, view);
        chosenOverview = overviewCandidates(eligible, visible, view, overviewArtworkId);
        candidates = [
          ...visible.filter((frame) => frame.record.kind !== 'symbols'),
          ...chosenOverview,
        ];
        const rank = (frame) =>
          frame.record.kind === 'symbols' ? 1 : artworkTargets(frame.record, focusTargetId) ? 0 : 2;
        candidates.sort((a, b) => rank(a) - rank(b));
      }
      this.views.set(id, {
        signature,
        culture,
        focusTargetId,
        overviewArtworkId: chosenOverview.length ? artworkId(chosenOverview[0]) : null,
        requestedOverviewArtworkId: overviewArtworkId,
        priority,
        candidates,
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
      const visited = new Set();
      for (const frame of view.candidates) {
        const groupKey =
          frame.record.kind === 'symbols' ? frame.culture + ':' + artworkId(frame) : frame.id;
        if (visited.has(groupKey)) continue;
        visited.add(groupKey);
        const group =
            frame.record.kind === 'symbols'
              ? view.candidates.filter(
                  (other) =>
                    other.record.kind === 'symbols' && artworkId(other) === artworkId(frame)
                )
              : [frame],
          missing = group.filter((part) => !wanted.has(part.id)),
          addedBytes = missing.reduce((sum, part) => sum + bytesFor(part), 0);
        if (wanted.size + missing.length > MAX_IMAGES || bytes + addedBytes > ART_GPU_BUDGET)
          continue;
        for (const part of missing) wanted.set(part.id, part);
        bytes += addedBytes;
        view.plan.push(...group);
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
          if (controller.signal.aborted || this.disposed || this.wanted.get(frame.id) !== frame) {
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
    const plan = this.views.get(id)?.plan || [],
      incomplete = new Set(
        plan
          .filter((frame) => frame.record.kind === 'symbols' && !this.entries.has(frame.id))
          .map(artworkId)
      );
    return plan
      .filter((frame) => frame.record.kind !== 'symbols' || !incomplete.has(artworkId(frame)))
      .map((frame) => this.entries.get(frame.id))
      .filter(Boolean);
  }
  status(id) {
    const view = this.views.get(id),
      culture = view?.culture || this.culture,
      provider = this.cultures.get(culture),
      plan = view?.plan || [],
      ready = this.ready(id);
    return {
      culture,
      focusTargetId: view?.focusTargetId || null,
      overviewArtworkId: view?.overviewArtworkId || null,
      requestedOverviewArtworkId: view?.requestedOverviewArtworkId || null,
      version: provider?.version ?? null,
      requested: plan.length,
      ready: ready.length,
      complete: plan.length === ready.length,
      candidates: view?.candidates.length || 0,
      omitted: Math.max(0, (view?.candidates.length || 0) - plan.length),
      images: ready.map((e) => e.frame.id),
      caption: provider?.caption || '',
      source: provider?.source || null,
      invalidImages: this.invalidImages.filter((record) => record.culture === culture),
      gpuBytes: [...this.entries.values()].reduce((n, e) => n + bytesFor(e.frame), 0),
    };
  }
  key() {
    const now = performance.now(),
      fading = [...this.entries.values()].some((e) => now - e.born < 300);
    return this.culture + ':' + this.revision + ':' + (fading ? Math.floor(now / 75) : '');
  }
  async prepare(id, view, enabled, waitMs = 2500, options = {}) {
    this.update(id, view, enabled, 3, options);
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
