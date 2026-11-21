import { createSkyOfflineStore } from './sky-offline-store.js';
import { hipsPixel, hipsTileUrl, selectHipsTiles } from './sky-detail-math.js';
import { skyTileKey } from './sky-detail-plan.js';
import { deepSkyRegionMatch, DEEP_SKY_OBJECTS } from './deep-sky-catalog.js';
import {
  offlinePlateField,
  webbPlateRay,
  webbPlateTiles,
  validSkyImageDimensions,
} from './webb-plate.js';

const degree = Math.PI / 180;
const labels = {
  dss: 'DSS 光学',
  panstarrs: 'Pan-STARRS 光学',
  webb: 'JWST 红外',
  hubble: '哈勃望远镜',
};
export const offlineSourceLabel = (source) => labels[source] || source;
const opticalId = (source) => (source === 'panstarrs' ? 'panstarrs' : 'dss-color');

function fieldKey(view) {
  // The id is also used for sky fields without a catalogue identifier. Preserve
  // roll and precision at narrow telescope FOVs, including near the poles.
  return [view.fovY, view.aspect, ...view.forward, ...view.right, ...view.up]
    .map((n) => Number(n).toPrecision(9))
    .join('/');
}
function northernField(view) {
  const half = Math.atan(Math.tan((view.fovY * degree) / 2) * Math.hypot(1, view.aspect));
  return (Math.asin(Math.max(-1, Math.min(1, view.forward[2]))) - half) / degree > -28;
}
export function planSkyOfflineField(
  providers,
  { id, title, source = 'auto', view, thumbnailUrl, thumbnailKey, thumbnailBlob, order }
) {
  if (!view || !['auto', 'dss', 'panstarrs'].includes(source)) return null;
  const north = northernField(view);
  if (source === 'auto') source = north ? 'panstarrs' : 'dss';
  if (source === 'panstarrs' && !north) return null;
  const provider = providers.find((p) => p.id === opticalId(source));
  if (!provider) return null;
  const selection = selectHipsTiles({
    ...view,
    order: order ?? provider.maxOrder,
    minOrder: provider.minOrder,
    maxOrder: provider.maxOrder,
    maxTiles: 150,
  });
  if (!selection.tiles.length) return null;
  const items = [];
  for (let level = provider.minOrder ?? 0; level <= selection.order; level++) {
    const { tiles } = selectHipsTiles({
      ...view,
      order: level,
      minOrder: level,
      maxOrder: level,
      maxTiles: 150,
    });
    for (const { order, pixel } of tiles)
      items.push({
        key: skyTileKey(provider, order, pixel),
        url: hipsTileUrl(provider.baseUrl, order, pixel, provider.format),
        width: 512,
        height: 512,
      });
  }
  return {
    id: [
      'field',
      provider.id,
      provider.revision ?? 1,
      id ?? '',
      fieldKey(view),
      selection.order,
    ].join(':'),
    title: title || '当前视野',
    source,
    providerId: provider.id,
    targetId: id,
    order: selection.order,
    view: structuredClone(view),
    estimatedBytes: items.length * (source === 'dss' ? 65000 : 110000),
    items,
    thumbnailKey: thumbnailKey || (thumbnailUrl && 'thumbnail:' + thumbnailUrl),
    thumbnailUrl,
    thumbnailBlob,
  };
}

// Look through the rendered layers in drawing order. The transparent margins
// of a HiPS tile aren't evidence that the bundled photograph covers the reticle.
function coversReticle(tile, direction) {
  const p = tile.provider;
  if (p.plate) {
    const [u0, v0, u1, v1] = tile.bounds;
    const corners = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ].map(([u, v]) => webbPlateRay(p.plate, u, v));
    const center = webbPlateRay(p.plate, (u0 + u1) / 2, (v0 + v1) / 2);
    const footprint = { direction: center, regionCos: 0, footprintDirections: corners };
    return !!deepSkyRegionMatch(footprint, direction)?.withinRegion;
  }
  if (hipsPixel(tile.order, direction).pixel !== tile.pixel) return false;
  if (!p.tiles) return true;
  const field = DEEP_SKY_OBJECTS.find((object) => object.providerId === p.id);
  return !!field && !!deepSkyRegionMatch(field, direction)?.withinRegion;
}

export class SkyOffline {
  constructor(manager, readResponse, store = createSkyOfflineStore()) {
    this.manager = manager;
    this.readResponse = readResponse;
    this.store = store;
    this.jobs = new Map();
    this.fields = [];
    this.fieldSignature = '';
    this.catalogueRead = null;
    this.revision = 0;
    this.failedSources = new Map();
    this.lastProviderLimit = null;
  }
  planField(spec) {
    return planSkyOfflineField(this.manager.providers, spec);
  }
  planCurrent(id = 'scope', source) {
    const viewId = this.manager.views.has(id)
      ? id
      : [...this.manager.views.keys()].reverse().find((key) => key.startsWith(id + '-'));
    const entry = this.manager.views.get(viewId);
    if (!entry) return null;
    const { view } = entry;
    source ??= entry.source ?? this.manager.source;
    const background = view.detailSelection?.background ?? this.manager.webbBackground;
    const visible = this.manager
      .ready(viewId)
      .reverse()
      .find((tile) => coversReticle(tile, view.forward));
    let provider = visible?.provider;
    const artworkSource = source === 'recent' || source === 'hubble';
    // A deliberately selected plate may still be streaming above its ready
    // background. The download button should save the work the player framed.
    const selected = artworkSource && view.detailSelection?.artworkId;
    if (selected) {
      const plate = entry.tiles?.find(
        (tile) => tile.provider.id === selected && coversReticle(tile, view.forward)
      );
      if (plate) provider = plate.provider;
    }
    if (
      artworkSource &&
      !(provider?.plate || provider?.tiles) &&
      (!background || background === 'galaxy')
    ) {
      provider = entry.tiles?.find(
        (t) => (t.provider.plate || t.provider.tiles) && coversReticle(t, view.forward)
      )?.provider;
    }
    if (artworkSource || source === 'auto') {
      if (provider?.plate)
        return this.planArtwork({
          provider,
          view,
          thumbnailUrl: provider.thumbnailUrl,
          thumbnailKey:
            provider.artworkSlug &&
            'thumbnail:' + (provider.source || 'recent') + ':' + provider.artworkSlug,
          fieldOnly: provider.source === 'hubble',
        });
      if (provider?.tiles)
        return { builtin: true, title: provider.title, source: 'webb', providerId: provider.id };
      if (artworkSource) source = background || 'galaxy';
      if (provider?.id === 'dss-color') source = 'dss';
      if (provider?.id === 'panstarrs') source = 'panstarrs';
    }
    if (!entry.tiles?.some(({ provider }) => !provider.tiles && !provider.plate)) return null;
    return this.planField({ source, view });
  }
  planArtwork({
    provider,
    title,
    thumbnailKey,
    thumbnailUrl,
    thumbnailBlob,
    view,
    fieldOnly = false,
    order,
  }) {
    if (!provider?.plate) return null;
    const source = provider.source === 'hubble' ? 'hubble' : 'webb';
    let highest = Math.min(order ?? provider.maxOrder, provider.maxOrder);
    // Whole Hubble mosaics can comprise tens of thousands of images. Limit
    // the whole-image edition before allocating a tile array; local fields
    // can still save native-resolution details.
    if (!fieldOnly && source === 'hubble') {
      while (highest > 0) {
        const level = provider.plate.levels[highest];
        if (level.offset + level.rows * level.cols <= 1024) break;
        highest--;
      }
    }
    const items = fieldOnly
      ? offlinePlateField(provider, view, highest)
      : webbPlateTiles(provider, highest);
    if (!items.length) return null;
    highest = items.at(-1).order;
    const version = provider.id + '@' + (provider.revision ?? 1);
    const id = fieldOnly
      ? 'art-field:' + version + ':' + fieldKey(view) + ':' + highest
      : 'art:' + version + (highest < provider.maxOrder ? ':' + highest : '');
    return {
      id,
      title: title || provider.title,
      source,
      providerId: provider.id,
      targetId: provider.id,
      view,
      fieldOnly,
      order: highest,
      imageWidth: provider.plate.levels[highest].width,
      imageHeight: provider.plate.levels[highest].height,
      nativeWidth: provider.plate.width,
      nativeHeight: provider.plate.height,
      items,
      estimatedBytes: items.length * 20000,
      thumbnailKey: thumbnailKey || (thumbnailUrl && 'thumbnail:' + thumbnailUrl),
      thumbnailUrl,
      thumbnailBlob,
    };
  }
  planRecord(record) {
    const provider = this.manager.providers.find((p) => p.id === record.providerId);
    const plan =
      record.source === 'webb' || record.source === 'hubble'
        ? this.planArtwork({ ...record, provider })
        : this.planField({ ...record, id: record.targetId });
    return plan?.id === record.id ? plan : null;
  }
  async list() {
    const rows = await this.store.list();
    const fields = rows.filter((row) => row.complete && row.source !== 'webb');
    const signature = fields.map((row) => row.id).join('|');
    if (signature !== this.fieldSignature) {
      this.fields = fields;
      this.fieldSignature = signature;
      this.revision++;
    }
    return rows;
  }
  // At very high magnification an offline field may end several levels below
  // the network survey. Keep rendering its finest saved level as the user zooms.
  providersForView(view) {
    const providers = this.manager.providers;
    const offline = globalThis.navigator?.onLine === false;
    if (!offline && !this.failedSources.size) return providers;
    this.catalogueRead ??= this.list().catch(() => []);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const levels = new Map();
    for (const field of this.fields) {
      if (!offline && !this.failedSources.has(field.providerId)) continue;
      if (field.source === 'hubble' && !field.fieldOnly) {
        levels.set(field.providerId, Math.max(levels.get(field.providerId) ?? 0, field.order));
        continue;
      }
      const saved = field.view;
      const axis = dot(view.forward, saved.forward);
      if (axis <= 0) continue;
      const ty = Math.tan((saved.fovY * degree) / 2);
      if (
        Math.abs(dot(view.forward, saved.right)) > axis * ty * saved.aspect ||
        Math.abs(dot(view.forward, saved.up)) > axis * ty
      )
        continue;
      levels.set(field.providerId, Math.max(levels.get(field.providerId) ?? 0, field.order));
    }
    if (!levels.size) return providers;
    const key = [...levels]
      .sort()
      .map(([id, order]) => id + ':' + order)
      .join('|');
    if (key !== this.lastProviderLimit?.key) {
      this.lastProviderLimit = {
        key,
        providers: providers.map((p) =>
          levels.has(p.id) ? { ...p, maxOrder: Math.min(p.maxOrder, levels.get(p.id)) } : p
        ),
      };
    }
    return this.lastProviderLimit.providers;
  }
  sourceFailed(provider) {
    if (provider.tiles || (provider.plate && provider.source !== 'hubble')) return;
    this.catalogueRead ??= this.list().catch(() => []);
    if (!this.failedSources.has(provider.id)) this.revision++;
    this.failedSources.set(provider.id, performance.now() + 60000);
  }
  planRevision() {
    const now = performance.now();
    for (const [id, until] of this.failedSources) {
      if (until > now) continue;
      this.failedSources.delete(id);
      this.revision++;
    }
    return this.revision;
  }
  get(key) {
    return this.store.get(key).catch(() => null);
  }
  cancel(id) {
    this.jobs.get(id)?.controller.abort();
  }
  async remove(id) {
    this.cancel(id);
    await this.store.remove(id);
    await this.list();
  }
  save(plan) {
    if (!plan?.items.length) return Promise.reject(Error('此天区暂无可保存影像'));
    const active = this.jobs.get(plan.id);
    if (active) return active.promise;
    const job = { controller: new AbortController(), count: 0, total: plan.items.length };
    this.jobs.set(plan.id, job);
    job.promise = this.download(plan, job).finally(() => this.jobs.delete(plan.id));
    return job.promise;
  }
  async download(plan, job) {
    const { items, thumbnailBlob, ...meta } = plan;
    const token = crypto.randomUUID?.() || Math.random().toString(36);
    const signal = job.controller.signal;
    const pack = await this.store.begin({ ...meta, total: items.length }, token);
    if (pack.complete) return pack;
    job.count = pack.count;
    const attach = async (item, optional = false, provided = null) => {
      signal.throwIfAborted();
      let progress = await this.store.attach(plan.id, token, item.key, null, null, optional);
      if (!progress) {
        let blob = provided || (await this.manager.cache.get(item.key));
        signal.throwIfAborted();
        // Keep just one decoded file alive. Confirm the content even if the
        // server returns a 200 error page or the transient cache is corrupt.
        const check = async (image) => {
          const bitmap = await this.manager.decode(image);
          try {
            if (item.width && !validSkyImageDimensions(item, bitmap.width, bitmap.height))
              throw Error('影像尺寸与目录不符');
          } finally {
            bitmap.close?.();
          }
        };
        if (blob) {
          try {
            await check(blob);
          } catch {
            blob = null;
          }
        }
        if (!blob) {
          if (!item.url) throw Error('影像不可用');
          const request = new AbortController();
          const cancel = () => request.abort();
          signal.addEventListener('abort', cancel, { once: true });
          const timer = setTimeout(cancel, 20000);
          try {
            signal.throwIfAborted();
            const fetcher = this.manager.fetcher;
            const response = await fetcher(item.url, {
              signal: request.signal,
              credentials: 'omit',
              mode: 'cors',
              cache: 'default',
            });
            blob = await this.readResponse(response);
          } catch (error) {
            if (request.signal.aborted && !signal.aborted) throw Error('影像下载超时');
            throw error;
          } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', cancel);
          }
          await check(blob);
        }
        const buffer = await blob.arrayBuffer();
        signal.throwIfAborted();
        progress = await this.store.attach(plan.id, token, item.key, buffer, blob.type, optional);
      }
      job.count = progress.count;
    };
    if (plan.thumbnailKey) {
      try {
        await attach({ key: plan.thumbnailKey, url: plan.thumbnailUrl }, true, thumbnailBlob);
      } catch {
        signal.throwIfAborted();
      } // A missing preview doesn't invalidate the field.
    }
    for (const item of items) await attach(item);
    signal.throwIfAborted();
    const record = await this.store.finish(plan.id, token);
    await this.list();
    return record;
  }
  dispose() {
    for (const job of this.jobs.values()) job.controller.abort();
    this.store.close();
  }
}
