import { CityTerrainSource } from '../../src/city-terrain-source.js';
import { allCityTiles } from '../../src/city-terrain-math.js';

const washington = {
  id: 'city:washington',
  name: '华盛顿',
  identifier: '38.9072, -77.0369',
  longitude: -77.0369,
  latitude: 38.9072,
};

function assert(value, message) {
  if (!value) throw Error(message);
}

export async function checkCityTerrainSource() {
  const source = new CityTerrainSource();
  try {
    const started = performance.now();
    const meta = await source.prepare(washington);
    assert(meta.mosaics.length > 0, 'No real Washington COG directories');
    assert(meta.pixelSizeMeters === 10, 'Oversampling was mistaken for extra optical detail');
    assert(
      meta.samplingMetersPerPixel > 7 && meta.samplingMetersPerPixel < 8,
      'Unexpected real mirror grid spacing'
    );
    assert(meta.maxLevel === 2, 'An unnecessary extra city level was retained');
    assert(meta.names.en === washington.name, 'Coordinate identifier became the city name');
    const probeMs = performance.now() - started;
    const tile = { z: 2, x: 2, y: 2 };
    const result = await source.tile(meta, tile);
    assert(result.buffer.byteLength > 1000, 'Empty city image');
    assert(result.coverage > 0.995, 'Washington tile lacks source coverage');
    const blob = new Blob([result.buffer], { type: result.mimeType });
    const bitmap = await createImageBitmap(blob);
    assert(bitmap.width === 512 && bitmap.height === 512, 'Unexpected city image dimensions');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, 512, 512).data;
    const samplePixels = [
      [64, 64],
      [256, 256],
      [400, 400],
    ].map(([x, y]) => ({ x, y, rgb: [...pixels.slice((y * 512 + x) * 4, (y * 512 + x) * 4 + 3)] }));
    assert(
      samplePixels.some((p) => p.rgb.some((v) => v > 20)),
      'City image is black'
    );
    // Independent Rasterio samples of the 2025 18SUJ mirror, checked 2026-11-06.
    // JPEG fallback is lossy, so allow encoder variation but catch a wrong
    // coordinate transform, RGB order or missing reflectance offset.
    const reference = [
      [99, 98, 79],
      [94, 85, 79],
      [53, 60, 51],
    ];
    for (let i = 0; i < samplePixels.length; i++)
      assert(
        samplePixels[i].rgb.every((value, c) => Math.abs(value - reference[i][c]) <= 10),
        'City colours or coordinates disagree with independent COG samples'
      );
    const abort = new AbortController();
    abort.abort();
    let cancelled = false;
    try {
      await source.tile(meta, tile, abort.signal);
    } catch (error) {
      cancelled = error.name === 'AbortError';
    }
    assert(cancelled, 'Pre-cancelled tile was not rejected as AbortError');
    return {
      meta,
      tile,
      probeMs,
      totalMs: performance.now() - started,
      bytes: result.buffer.byteLength,
      mimeType: result.mimeType,
      coverage: result.coverage,
      samplePixels,
      png: canvas.toDataURL('image/png'),
      cancelled,
    };
  } finally {
    source.close();
  }
}

export async function checkCityTerrainLifecycle(meta) {
  const source = new CityTerrainSource();
  const probe = { action: 'probe', mosaics: meta.mosaics, latitude: meta.center[1] };
  try {
    await source.request(probe);
    await window.armCityRange();
    const abort = new AbortController();
    const cancelledTile = source.tile(meta, { z: 2, x: 0, y: 0 }, abort.signal).then(
      () => false,
      (error) => error.name === 'AbortError'
    );
    const queuedProbe = source.request(probe);
    await window.waitCityRange();
    const started = performance.now();
    abort.abort();
    assert(await cancelledTile, 'In-flight tile did not cancel');
    const afterCancel = await Promise.race([
      queuedProbe,
      new Promise((_, reject) =>
        setTimeout(() => reject(Error('Cancelled network blocked the next job')), 2500)
      ),
    ]);
    assert(
      afterCancel.pixelSizeMeters === 10 && source.pending.size === 0,
      'Worker failed after cancellation'
    );
    const resumeMs = performance.now() - started;

    await window.armCityRange();
    const idleAbort = new AbortController();
    const finalTile = source.tile(meta, { z: 2, x: 3, y: 0 }, idleAbort.signal).then(
      () => false,
      (error) => error.name === 'AbortError'
    );
    await window.waitCityRange();
    idleAbort.abort();
    assert(await finalTile, 'Last pending tile did not cancel');
    assert(source.pending.size === 0, 'Cancelled work remained pending');
    await window.advanceCityIdleClock();
    assert(!source.worker, 'Cancellation did not release the idle worker and its COG cache');
    const restarted = await source.request(probe);
    assert(restarted.pixelSizeMeters === 10, 'Worker could not restart after idle disposal');
    return {
      inFlightCancelled: true,
      queuedProbeResumed: true,
      resumeMs,
      idleDisposed: true,
      restarted: true,
    };
  } finally {
    source.close();
  }
}

async function checkRangeRejected(status) {
  const fixture = `
    let attempts = 0;
    self.fetch = async () => {
      self.postMessage({ fixtureAttempt: ++attempts });
      return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(1024)); },
      cancel() { self.postMessage({ fixtureBodyCancelled: true }); }
    }), { status: ${status}, headers: {
      'Content-Length': '400000000',
      'Content-Range': 'bytes 0-399999999/400000000'
    } }); };
  `;
  const url = URL.createObjectURL(
    new Blob([fixture, __CITY_TERRAIN_WORKER__], { type: 'text/javascript' })
  );
  const worker = new Worker(url);
  try {
    return await new Promise((resolve, reject) => {
      let cancelled = 0;
      let attempts = 0;
      const timer = setTimeout(() => reject(Error('Full-file rejection stalled')), 5000);
      worker.onmessage = ({ data }) => {
        if (data.fixtureBodyCancelled) cancelled++;
        if (data.fixtureAttempt) attempts = data.fixtureAttempt;
        if (data.id === 1) {
          clearTimeout(timer);
          if (!data.error || !cancelled || attempts !== 1)
            reject(Error('A full COG response body was not cancelled'));
          else resolve({ fullFileRejected: true, bodyCancelled: true });
        }
      };
      worker.postMessage({
        id: 1,
        action: 'probe',
        mosaics: ['18SUJ_2025-01-01_2026-01-01'],
        latitude: 38.9,
      });
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

export async function checkCityTerrainRangeGuard() {
  await checkRangeRejected(200);
  await checkRangeRejected(206);
  await checkRangeRejected(403);
  return {
    fullFileRejected: true,
    oversizedRangeRejected: true,
    permissionNotRetried: true,
    bodyCancelled: true,
  };
}

async function checkRetryFixture(mode) {
  // Rasterio-generated EPSG:3857, 10 m, 512² UInt16 TIFF header. Its single
  // uncompressed strip is constant DN 2000; SCALE .0001 and OFFSET -.1 imply
  // linear reflectance .1, or sRGB 89. The image is synthetic, not source data.
  const header =
    'SUkqAAgAAAARAAABAwABAAAAAAIAAAEBAwABAAAAAAIAAAIBAwABAAAAEAAAAAMBAwABAAAAAQAAAAYBAwABAAAAAQAAABEBBAABAAAAOwIAABUBAwABAAAAAQAAABYBAwABAAAAAAIAABcBBAABAAAAAAAIABwBAwABAAAAAQAAAFMBAwABAAAAAQAAAA6DDAADAAAAkgEAAIKEDAAGAAAAqgEAAK+HAwAgAAAA2gEAALGHAgAhAAAAGgIAAICkAgC4AAAA2gAAAIGkAgACAAAAMAAAAAAAAAA8R0RBTE1ldGFkYXRhPgogIDxJdGVtIG5hbWU9Ik9GRlNFVCIgc2FtcGxlPSIwIiByb2xlPSJvZmZzZXQiPi0wLjEwMDAwMDAwMDAwMDAwMDAwNjwvSXRlbT4KICA8SXRlbSBuYW1lPSJTQ0FMRSIgc2FtcGxlPSIwIiByb2xlPSJzY2FsZSI+MC4wMDAxMDAwMDAwMDAwMDAwMDAwMDU8L0l0ZW0+CjwvR0RBTE1ldGFkYXRhPgoAAAAAAAAAJEAAAAAAAAAkQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC0QAAAAAAAAAAAAQABAAAABwAABAAAAQABAAEEAAABAAEAAgSxhxkAAAABCLGHBwAZAAYIAAABAI4jAAwAAAEAEQ8EDAAAAQApI1dHUyA4NCAvIFBzZXVkby1NZXJjYXRvcnxXR1MgODR8AA==';
  const fixture = `
    const header = Uint8Array.from(atob('${header}'), c => c.charCodeAt(0));
    const bytes = new Uint8Array(header.length + 512 * 512 * 2);
    bytes.set(header);
    for (let i = header.length; i < bytes.length; i += 2) { bytes[i] = 208; bytes[i + 1] = 7; }
    let attempts = 0;
    self.fetch = async (url, options) => {
      const [, a, b] = /^bytes=(\\d+)-(\\d+)$/.exec(options.headers.Range);
      const start = Number(a), end = Math.min(Number(b), bytes.length - 1);
      const selected = url.endsWith('/B04.tif') && start > 0;
      if (selected) self.postMessage({ fixtureAttempt: ++attempts, cache: options.cache });
      const failing = selected && attempts <= ('${mode}' === 'exhausted' ? 3 : 1);
      if (failing && '${mode}' === 'network') throw new TypeError('fixture network disconnect');
      if (failing && '${mode}' === 'server') return new Response('', { status: 503 });
      const short = failing && ['short', 'exhausted', 'cancel'].includes('${mode}');
      return new Response(bytes.slice(start, short ? end : end + 1), { status: 206, headers: {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + bytes.length,
        'Content-Length': String(end - start + 1)
      } });
    };
  `;
  const url = URL.createObjectURL(
    new Blob([fixture, __CITY_TERRAIN_WORKER__], { type: 'text/javascript' })
  );
  const worker = new Worker(url),
    pending = new Map(),
    attempts = [];
  let serial = 0,
    cancelId = 0;
  worker.onmessage = ({ data }) => {
    if (data.fixtureAttempt) {
      attempts.push({ attempt: data.fixtureAttempt, cache: data.cache });
      if (mode === 'cancel' && data.fixtureAttempt === 1)
        worker.postMessage({ action: 'cancel', id: cancelId });
    }
    pending.get(data.id)?.(data);
  };
  const request = (data) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => reject(Error(`Retry fixture ${mode} stalled`)), 10000);
      pending.set(id, (result) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(result);
      });
      if (data.action === 'tile') cancelId = id;
      worker.postMessage({ ...data, id });
    });
  try {
    const mosaics = ['18SUJ_2025-01-01_2026-01-01'];
    const probe = await request({ action: 'probe', mosaics, latitude: 0 });
    assert(probe.result?.pixelSizeMeters === 10, 'Fixture header did not decode');
    const tile = {
      action: 'tile',
      meta: { mosaics, bounds: [0.001, 0.001, 0.044, 0.044] },
      tile: { z: 0, x: 0, y: 0 },
    };
    let result = await request(tile);
    if (mode === 'cancel') {
      assert(result.error, 'Cancelled retry returned an image');
      await new Promise((resolve) => setTimeout(resolve, 700));
      assert(attempts.length === 1, 'Cancelled backoff retried a network request');
      return { mode, attempts: 1, cancelled: true };
    }
    if (mode === 'exhausted') {
      assert(result.error?.includes('收到') && attempts.length === 3, 'Retries were not bounded');
      result = await request(tile);
    }
    assert(!result.error && result.result.coverage === 1, 'Valid retry did not produce the image');
    assert(attempts.length === (mode === 'exhausted' ? 4 : 2), 'Unexpected retry count');
    assert(attempts[1].cache === 'reload', 'Retry reused the HTTP cache');
    const bitmap = await createImageBitmap(
      new Blob([result.result.buffer], { type: result.result.mimeType })
    );
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixel = [...ctx.getImageData(256, 256, 1, 1).data];
    assert(pixel.slice(0, 3).every((v) => v === 89) && pixel[3] === 255, 'Bad bytes were accepted');
    return { mode, attempts: attempts.length, pixel, recovered: true };
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

export async function checkCityTerrainRetries() {
  const results = [];
  for (const mode of ['short', 'network', 'server', 'exhausted', 'cancel'])
    results.push(await checkRetryFixture(mode));
  return results;
}

export async function checkAllCityTerrainTiles(meta) {
  const source = new CityTerrainSource();
  const results = [];
  try {
    for (const tile of allCityTiles(meta.maxLevel)) {
      const started = performance.now();
      try {
        const result = await source.tile(meta, tile);
        results.push({
          key: tile.key,
          coverage: result.coverage,
          bytes: result.buffer.byteLength,
          ms: performance.now() - started,
        });
      } catch (error) {
        results.push({ key: tile.key, error: error.message, ms: performance.now() - started });
      }
      await window.cityTileProgress?.(results[results.length - 1]);
    }
    return results;
  } finally {
    source.close();
  }
}
