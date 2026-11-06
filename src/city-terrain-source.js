import { cityBounds, maxLevelFromExtent } from './city-terrain-math.js';

export const CITY_TERRAIN_SOURCE = Object.freeze({
  id: 'earthgenome-2025-mirror',
  title: 'Earth Genome · Sentinel-2 年度合成',
  year: '2025',
  observed: '2025-01-01 — 2025-12-31；具体像元日期未提供',
  url: 'https://source.coop/earthgenome/earthindeximagery',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  credit: 'Earth Genome / Source Cooperative; contains modified Copernicus Sentinel data (2025)',
});

export class CityTerrainSource {
  constructor() {
    this.pending = new Map();
    this.serial = 0;
  }
  ensureWorker() {
    clearTimeout(this.idle);
    if (this.worker) return;
    this.workerUrl = URL.createObjectURL(
      new Blob([__CITY_TERRAIN_WORKER__], { type: 'text/javascript' })
    );
    try {
      // WebKit resolves Blob workers asynchronously; keep this URL alive until
      // the worker is closed, including failure and idle cleanup paths.
      this.worker = new Worker(this.workerUrl);
    } catch (error) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
      throw error;
    }
    this.worker.onmessage = ({ data }) => {
      const entry = this.pending.get(data.id);
      if (!entry) return;
      entry.done();
      if (data.error) entry.reject(Error(data.error));
      else entry.resolve(data.result);
    };
    this.worker.onerror = ({ message }) =>
      this.close(Error(message ? `城市影像处理失败：${message}` : '城市影像解码失败，请重试'));
  }
  request(data, signal) {
    signal?.throwIfAborted();
    this.ensureWorker();
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const abort = () => {
        this.worker?.postMessage({ action: 'cancel', id });
        done();
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      const timeout = setTimeout(() => {
        this.worker?.postMessage({ action: 'cancel', id });
        done();
        reject(Error('城市影像请求超时，可稍后重试'));
      }, 90000);
      const done = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        this.pending.delete(id);
        if (!this.pending.size && this.worker) this.idle = setTimeout(() => this.close(), 30000);
      };
      this.pending.set(id, { resolve, reject, done });
      signal?.addEventListener('abort', abort, { once: true });
      try {
        this.worker.postMessage({ ...data, id });
      } catch (error) {
        done();
        reject(error);
      }
    });
  }
  async prepare(city, signal) {
    const center = [city.longitude, city.latitude],
      bounds = cityBounds(center, 20);
    if (!bounds) throw Error('暂不支持极区或跨日期线的城市包');
    const url = new URL('https://stac.earthgenome.org/search');
    url.search = new URLSearchParams({
      collections: 'sentinel2-yearly-mosaics-v4',
      bbox: bounds.join(','),
      datetime: '2025-06-01T00:00:00Z',
      limit: '30',
    });
    const response = await fetch(url, { signal });
    if (!response.ok) throw Error('城市目录暂不可用，请稍后重试');
    const data = await response.json();
    // STAC locates the MGRS directories only. The mirror's own TIFF transform,
    // reflectance scale and published year define the image actually used.
    const mosaics = [
      ...new Set(
        (data.features || [])
          .map((f) => f.id)
          .filter((id) => /^\d{2}[C-X][A-Z]{2}_2025-01-01_2026-01-01$/.test(id))
      ),
    ].sort();
    if (!mosaics.length || mosaics.length > 9) throw Error('此城市没有可用的年度影像覆盖');
    const { pixelSizeMeters, samplingMetersPerPixel } = await this.request(
      { action: 'probe', mosaics, latitude: city.latitude },
      signal
    );
    return {
      id: city.id.replace(/^city:/, ''),
      name: city.name,
      names: { zh: city.name, en: city.name },
      center,
      bounds,
      extentKm: 20,
      pixelSizeMeters,
      samplingMetersPerPixel,
      year: '2025',
      tileSize: 512,
      gutter: 4,
      maxLevel: maxLevelFromExtent(20, pixelSizeMeters),
      source: CITY_TERRAIN_SOURCE,
      mosaics,
    };
  }
  tile(meta, tile, signal) {
    return this.request({ action: 'tile', meta, tile }, signal);
  }
  close(error = new DOMException('Cancelled', 'AbortError')) {
    clearTimeout(this.idle);
    this.worker?.terminate();
    this.worker = null;
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
    this.workerUrl = null;
    for (const entry of [...this.pending.values()]) {
      entry.done();
      entry.reject(error);
    }
  }
}
