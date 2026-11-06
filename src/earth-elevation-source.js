export const ELEVATION_SOURCE = Object.freeze({
  id: 'cop30-2023_1',
  title: 'Copernicus GLO-30 · OpenTopography',
  release: '2023_1',
  observed: '2011–2015 为主；部分填补数据更早，非实时地形',
  verticalDatum: 'EGM2008',
  nativeResolutionMeters: 30,
  url: 'https://portal.opentopography.org/raster?opentopoID=OTSDEM.032021.4326.3',
  license: 'COP-DEM-GLO-30-F Global 30m Full, Free & Open',
  licenseUrl:
    'https://docs.sentinel-hub.com/api/latest/static/files/data/dem/resources/license/License-COPDEM-30.pdf',
  credit:
    'produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.',
  liability:
    'The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30',
  citation:
    'European Space Agency (2024). Copernicus Global Digital Elevation Model. Distributed by OpenTopography. Accessed 2026-11-06.',
  doi: 'https://doi.org/10.5069/G9028PQB',
});

export class ElevationSource {
  constructor() {
    this.pending = new Map();
    this.missing = new Set();
    this.serial = 0;
  }
  ensureWorker() {
    clearTimeout(this.idle);
    if (this.worker) return;
    this.workerUrl = URL.createObjectURL(
      new Blob([__ELEVATION_WORKER__], { type: 'text/javascript' })
    );
    try {
      this.worker = new Worker(this.workerUrl);
    } catch (error) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
      throw error;
    }
    // WebKit needs the Blob URL to remain alive while its worker loads.
    this.worker.onmessage = ({ data }) => {
      const entry = this.pending.get(data.id);
      if (!entry) return;
      entry.done();
      if (data.error) entry.reject(Error(data.error));
      else {
        for (const key of data.result.missingSourceKeys || []) this.missing.add(key);
        while (this.missing.size > 512) this.missing.delete(this.missing.values().next().value);
        entry.resolve(data.result);
      }
    };
    this.worker.onerror = ({ message }) =>
      this.close(Error(message ? `高程处理失败：${message}` : '高程处理失败，请重试'));
  }
  tile(tile, signal) {
    signal?.throwIfAborted();
    if (this.pending.size >= 2) return Promise.reject(Error('同时等待的高程块不能超过两个'));
    this.ensureWorker();
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const done = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        this.pending.delete(id);
        if (!this.pending.size && this.worker) this.idle = setTimeout(() => this.close(), 30000);
      };
      const abort = () => {
        this.worker?.postMessage({ action: 'cancel', id });
        done();
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      const timeout = setTimeout(() => {
        this.worker?.postMessage({ action: 'cancel', id });
        done();
        reject(Error('高程请求超时，可稍后重试'));
      }, 90000);
      this.pending.set(id, { resolve, reject, done });
      signal?.addEventListener('abort', abort, { once: true });
      try {
        this.worker.postMessage({ id, tile, knownMissing: [...this.missing] });
      } catch (error) {
        done();
        reject(error);
      }
    });
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
