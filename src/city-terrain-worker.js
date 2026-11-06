import { fromCustomClient } from 'geotiff';
import { tileBounds } from './city-terrain-math.js';

const ROOT = 'https://data.source.coop/earthgenome/earthindeximagery/';
const R = 6378137,
  DEG = Math.PI / 180,
  SIZE = 512,
  GUTTER = 4,
  INNER = SIZE - GUTTER * 2;
const project = (lon, lat) => [
  R * lon * DEG,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)),
];
const encode = (v) =>
  Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
const headers = new Map(),
  jobs = new Map(),
  queue = [],
  ranges = new Map();
const RANGE_CACHE_BYTES = 6 * 1024 * 1024;
let rangeBytes = 0;
let running = false;
let activeSignal;

function retryDelay(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function fetchRange(url, requestHeaders, start, end, signal) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    let retryable = false;
    try {
      let response;
      try {
        response = await fetch(url, {
          headers: { ...requestHeaders, Range: `bytes=${start}-${end}` },
          signal,
          // A retry must not reuse a truncated response from the HTTP cache.
          cache: attempt ? 'reload' : 'default',
        });
      } catch (error) {
        retryable = true;
        throw Error(`城市影像网络请求失败：${error.message}`);
      }
      if (response.status >= 500 && response.status <= 599) {
        await response.body?.cancel();
        retryable = true;
        throw Error(`城市影像源请求失败（HTTP ${response.status}）`);
      }
      const returned = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
        response.headers.get('content-range') || ''
      );
      if (
        response.status !== 206 ||
        !returned ||
        Number(returned[1]) !== start ||
        Number(returned[2]) !== Math.min(end, Number(returned[3]) - 1)
      ) {
        await response.body?.cancel();
        throw Error(
          response.ok
            ? '影像源未返回有效分段数据，已停止下载'
            : `城市影像源请求失败（HTTP ${response.status}）`
        );
      }
      let buffer;
      try {
        buffer = await response.arrayBuffer();
      } catch (error) {
        retryable = true;
        throw Error(`城市影像分段读取失败：${error.message}`);
      }
      signal?.throwIfAborted();
      const expected = Number(returned[2]) - start + 1;
      if (buffer.byteLength !== expected) {
        retryable = buffer.byteLength < expected;
        throw Error(`影像分段数据不完整（收到 ${buffer.byteLength} / ${expected} 字节）`);
      }
      return { buffer, start, total: returned[3], headers: response.headers };
    } catch (error) {
      signal?.throwIfAborted();
      // Two bounded retries cover transient network/5xx/short-body failures.
      // Permission errors, ignored ranges and oversized responses never retry.
      if (!retryable || attempt >= 2) throw error;
      await retryDelay(300 * 2 ** attempt, signal);
    }
  }
}

function rangeClient(url) {
  return {
    url,
    async request({ headers: requestHeaders, signal }) {
      // GeoTIFF's lazy IFD reads and evicted-block retries do not always pass a
      // signal. This worker runs one job at a time, so they inherit that job's
      // cancellation instead of leaving requests alive behind a cancelled tile.
      const requestSignal = signal || activeSignal;
      requestSignal?.throwIfAborted();
      const wanted = /^bytes=(\d+)-(\d+)$/.exec(requestHeaders.Range);
      if (!wanted) throw Error('不支持的影像分段请求');
      const start = Number(wanted[1]),
        end = Number(wanted[2]);
      // Coalesce small IFD/tag reads into one reusable header block. Keep large
      // compressed image blocks at their exact range, and never retain promises
      // that an aborted job could poison for the next download.
      const fetchStart = end - start < 65536 ? Math.floor(start / 65536) * 65536 : start;
      const fetchEnd = end - start < 65536 ? Math.ceil((end + 1) / 65536) * 65536 - 1 : end;
      const key = `${url}:${fetchStart}-${fetchEnd}`;
      let cached = ranges.get(key);
      if (cached) {
        ranges.delete(key);
        ranges.set(key, cached);
      } else {
        cached = await fetchRange(url, requestHeaders, fetchStart, fetchEnd, requestSignal);
        const previous = ranges.get(key);
        if (previous) rangeBytes -= previous.buffer.byteLength;
        ranges.set(key, cached);
        rangeBytes += cached.buffer.byteLength;
        while (rangeBytes > RANGE_CACHE_BYTES && ranges.size) {
          const oldest = ranges.keys().next().value;
          rangeBytes -= ranges.get(oldest).buffer.byteLength;
          ranges.delete(oldest);
        }
      }
      return {
        ok: true,
        status: 206,
        getHeader: (name) =>
          name.toLowerCase() === 'content-range'
            ? `bytes ${start}-${Math.min(end, Number(cached.total) - 1)}/${cached.total}`
            : cached.headers.get(name),
        getData: async () => {
          requestSignal?.throwIfAborted();
          return cached.buffer.slice(start - cached.start, end - cached.start + 1);
        },
      };
    },
  };
}

function forgetMosaic(id) {
  // GeoTIFF retains lazy tag/IFD promises. A failed or cancelled tile must not
  // leave a rejected promise in the parsed-image cache for the next user retry.
  for (const band of ['B04', 'B03', 'B02']) headers.delete(`${ROOT}${id}/${band}.tif`);
}

async function openBand(id, band, signal) {
  if (!/^\d{2}[C-X][A-Z]{2}_2025-01-01_2026-01-01$/.test(id)) throw Error('不支持的年度影像目录');
  const url = `${ROOT}${id}/${band}.tif`;
  if (headers.has(url)) return headers.get(url);
  // Reject full-file responses: a regional view must never download a whole COG.
  const tiff = await fromCustomClient(
    rangeClient(url),
    // GeoTIFF's optional BlockedSource retries evicted blocks without their
    // cancellation signal. The bounded range cache above avoids that path.
    { allowFullFile: false },
    signal
  );
  const images = [];
  for (let i = 0, n = Math.min(8, await tiff.getImageCount()); i < n; i++)
    images.push(await tiff.getImage(i));
  const image = images[0];
  if (image.getGeoKeys().ProjectedCSTypeGeoKey !== 3857) throw Error('影像投影与已核实的源不符');
  const metadata = await image.getGDALMetadata(0);
  const scale = Number(metadata?.SCALE),
    offset = Number(metadata?.OFFSET);
  if (!(scale > 0) || !Number.isFinite(offset)) throw Error('影像缺少可核实的反射率标定');
  signal.throwIfAborted();
  const record = {
    tiff,
    images,
    base: image,
    origin: image.getOrigin(),
    resolution: image.getResolution(),
    bbox: image.getBoundingBox(),
    scale,
    offset,
    nodata: image.getGDALNoData() ?? 0,
  };
  headers.set(url, record);
  while (headers.size > 12) headers.delete(headers.keys().next().value);
  return record;
}

async function bandWindow(record, bounds, signal) {
  const [west, south, east, north] = bounds;
  const wanted = Math.min((east - west) / SIZE, (north - south) / SIZE);
  let image = record.base;
  for (const candidate of record.images) {
    const r = candidate.getResolution(record.base);
    if (Math.abs(r[0]) <= wanted && Math.abs(r[0]) > Math.abs(image.getResolution(record.base)[0]))
      image = candidate;
  }
  const origin = record.origin,
    res = image.getResolution(record.base);
  const x0 = Math.max(0, Math.floor((west - origin[0]) / res[0]) - 1);
  const x1 = Math.min(image.getWidth(), Math.ceil((east - origin[0]) / res[0]) + 1);
  const y0 = Math.max(0, Math.floor((north - origin[1]) / res[1]) - 1);
  const y1 = Math.min(image.getHeight(), Math.ceil((south - origin[1]) / res[1]) + 1);
  if (x1 <= x0 || y1 <= y0) return null;
  const width = Math.min(1024, x1 - x0),
    height = Math.min(1024, y1 - y0);
  const data = await image.readRasters({
    window: [x0, y0, x1, y1],
    width,
    height,
    samples: [0],
    interleave: true,
    fillValue: 0,
    resampleMethod: 'bilinear',
    signal,
  });
  return {
    data,
    width,
    height,
    origin: [origin[0] + x0 * res[0], origin[1] + y0 * res[1]],
    res: [(res[0] * (x1 - x0)) / width, (res[1] * (y1 - y0)) / height],
    scale: record.scale,
    offset: record.offset,
    nodata: record.nodata,
  };
}

function sample(raster, x, y) {
  const sx = (x - raster.origin[0]) / raster.res[0] - 0.5,
    sy = (y - raster.origin[1]) / raster.res[1] - 0.5;
  if (sx < 0 || sy < 0 || sx > raster.width - 1 || sy > raster.height - 1) return null;
  const ix = Math.floor(sx),
    iy = Math.floor(sy),
    fx = sx - ix,
    fy = sy - iy;
  const p = [
    raster.data[iy * raster.width + ix],
    raster.data[iy * raster.width + Math.min(ix + 1, raster.width - 1)],
    raster.data[Math.min(iy + 1, raster.height - 1) * raster.width + ix],
    raster.data[
      Math.min(iy + 1, raster.height - 1) * raster.width + Math.min(ix + 1, raster.width - 1)
    ],
  ];
  if (p.some((v) => !Number.isFinite(v) || v === raster.nodata)) return null;
  return (p[0] * (1 - fx) + p[1] * fx) * (1 - fy) + (p[2] * (1 - fx) + p[3] * fx) * fy;
}

async function renderTile(meta, tile, signal) {
  let [w, s, e, n] = tileBounds(meta, tile.z, tile.x, tile.y);
  const dx = (e - w) / INNER,
    dy = (n - s) / INNER;
  w -= dx * GUTTER;
  e += dx * GUTTER;
  s -= dy * GUTTER;
  n += dy * GUTTER;
  const [mx0, my0] = project(w, s),
    [mx1, my1] = project(e, n);
  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4),
    xs = new Float64Array(SIZE),
    ys = new Float64Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    xs[i] = project(w + (i + 0.5) * dx, 0)[0];
    ys[i] = project(0, n - (i + 0.5) * dy)[1];
  }
  const errors = [];
  // Directory order fixes overlap ownership; network timing cannot change colours.
  for (const id of meta.mosaics) {
    signal.throwIfAborted();
    try {
      const red = await openBand(id, 'B04', signal),
        b = red.bbox;
      if (b[0] >= mx1 || b[2] <= mx0 || b[1] >= my1 || b[3] <= my0) continue;
      const records = [red, await openBand(id, 'B03', signal), await openBand(id, 'B02', signal)];
      const rasters = [];
      for (const r of records) rasters.push(await bandWindow(r, [mx0, my0, mx1, my1], signal));
      if (rasters.some((r) => !r)) continue;
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const offset = (y * SIZE + x) * 4;
          if (pixels[offset + 3]) continue;
          const rgb = rasters.map((r) => sample(r, xs[x], ys[y]));
          if (rgb.some((v) => v === null)) continue;
          for (let c = 0; c < 3; c++)
            pixels[offset + c] = encode(
              Math.min(1, Math.max(0, rgb[c] * rasters[c].scale + rasters[c].offset))
            );
          pixels[offset + 3] = 255;
        }
    } catch (error) {
      forgetMosaic(id);
      if (signal.aborted) throw error;
      errors.push(`${id}: ${error.message}`);
    }
  }
  let valid = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) valid++;
  if (!valid || (errors.length && valid < SIZE * SIZE * 0.995))
    throw Error(
      errors.length
        ? `城市影像下载未完成（覆盖 ${((100 * valid) / (SIZE * SIZE)).toFixed(1)}%）；${errors[0]}`
        : '此区域没有可用的年度影像像元'
    );
  const canvas = new OffscreenCanvas(SIZE, SIZE),
    ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(pixels, SIZE, SIZE), 0, 0);
  let blob = await canvas.convertToBlob({ type: 'image/avif', quality: 0.85 });
  // Browser encoders currently vary. Transparent coverage must never turn black.
  if (blob.type !== 'image/avif')
    blob = await canvas.convertToBlob({
      type: valid === SIZE * SIZE ? 'image/jpeg' : 'image/png',
      quality: 0.94,
    });
  return { buffer: await blob.arrayBuffer(), mimeType: blob.type, coverage: valid / (SIZE * SIZE) };
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift(),
        controller = jobs.get(job.id);
      if (!controller) continue;
      try {
        activeSignal = controller.signal;
        let result;
        if (job.action === 'probe') {
          const spacings = [];
          let lastError;
          for (const id of job.mosaics) {
            try {
              const source = await openBand(id, 'B04', controller.signal);
              spacings.push(Math.abs(source.resolution[0]) * Math.cos(job.latitude * DEG));
            } catch (error) {
              forgetMosaic(id);
              controller.signal.throwIfAborted();
              lastError = error;
            }
          }
          if (!spacings.length) throw lastError || Error('此城市没有可用的年度影像覆盖');
          const samplingMetersPerPixel = Math.max(...spacings);
          result = {
            // The Mercator mirror can oversample the native 10 m observations.
            // Smaller grid spacing is not additional spatial information.
            pixelSizeMeters: Math.max(10, samplingMetersPerPixel),
            samplingMetersPerPixel,
          };
        } else result = await renderTile(job.meta, job.tile, controller.signal);
        if (!controller.signal.aborted)
          self.postMessage({ id: job.id, result }, result.buffer ? [result.buffer] : []);
      } catch (error) {
        // Abort any parallel GeoTIFF reads still settling after one range fails.
        controller.abort();
        self.postMessage({ id: job.id, error: error.message });
      } finally {
        activeSignal = null;
        jobs.delete(job.id);
      }
    }
  } finally {
    running = false;
  }
}
self.onmessage = ({ data }) => {
  if (data.action === 'cancel') {
    jobs.get(data.id)?.abort();
    jobs.delete(data.id);
    return;
  }
  jobs.set(data.id, new AbortController());
  queue.push(data);
  pump();
};
