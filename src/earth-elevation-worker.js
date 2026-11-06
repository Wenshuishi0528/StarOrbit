import { fromCustomClient } from 'geotiff';

const ROOT = 'https://opentopography.s3.sdsc.edu/raster/COP30/COP30_hh/';
const GRID_SIZE = 129;
const RANGE_CACHE_BYTES = 4 * 1024 * 1024;
const headers = new Map(),
  ranges = new Map(),
  missing = new Set();
const jobs = new Map(),
  queue = [];
let rangeBytes = 0,
  running = false,
  activeSignal;

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
        throw Error(`地形高程网络请求失败：${error.message}`);
      }
      if (response.status >= 500 && response.status <= 599) {
        await response.body?.cancel();
        retryable = true;
        throw Error(`地形高程源请求失败（HTTP ${response.status}）`);
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
        const error = Error(
          response.ok
            ? '高程源未返回有效分段数据，已停止下载'
            : `地形高程源请求失败（HTTP ${response.status}）`
        );
        error.status = response.status;
        throw error;
      }
      let buffer;
      try {
        buffer = await response.arrayBuffer();
      } catch (error) {
        retryable = true;
        throw Error(`地形高程分段读取失败：${error.message}`);
      }
      signal?.throwIfAborted();
      const expected = Number(returned[2]) - start + 1;
      if (buffer.byteLength !== expected) {
        retryable = buffer.byteLength < expected;
        throw Error(`高程分段数据不完整（收到 ${buffer.byteLength} / ${expected} 字节）`);
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
      if (!wanted) throw Error('不支持的高程分段请求');
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

function sourceCells(bounds) {
  const [w, s, e, n] = bounds || [];
  if (
    ![w, s, e, n].every(Number.isFinite) ||
    w < -180 ||
    e > 180 ||
    s < -90 ||
    n > 90 ||
    w >= e ||
    s >= n
  )
    throw Error('高程范围必须是不跨日期线的有效经纬度矩形');
  const west = Math.floor(w),
    east = Math.min(179, Math.ceil(e) - 1);
  const south = Math.floor(s),
    north = Math.min(89, Math.ceil(n) - 1);
  if ((east - west + 1) * (north - south + 1) > 16) return [];
  const cells = [];
  for (let lat = south; lat <= north; lat++)
    for (let lon = west; lon <= east; lon++) {
      const key = `${lat < 0 ? 'S' : 'N'}${String(Math.abs(lat)).padStart(2, '0')}_00_${lon < 0 ? 'W' : 'E'}${String(Math.abs(lon)).padStart(3, '0')}_00`;
      cells.push({ key, url: `${ROOT}Copernicus_DSM_10_${key}_DEM.tif` });
    }
  return cells;
}

function rememberMissing(key) {
  missing.add(key);
  while (missing.size > 512) missing.delete(missing.values().next().value);
}

async function openElevation(url, signal) {
  if (headers.has(url)) {
    const cached = headers.get(url);
    headers.delete(url);
    headers.set(url, cached);
    return cached;
  }
  const tiff = await fromCustomClient(rangeClient(url), { allowFullFile: false }, signal);
  const images = [];
  for (let i = 0, count = Math.min(8, await tiff.getImageCount()); i < count; i++)
    images.push(await tiff.getImage(i));
  const base = images[0],
    keys = base.getGeoKeys(),
    res = base.getResolution();
  if (keys.GeographicTypeGeoKey !== 4326 || !(res[0] > 0 && res[1] < 0))
    throw Error('高程坐标系与已核实的 WGS84 数据不符');
  // GeoTIFF.js returns the raw tie point. PixelIsPoint stores a sample centre;
  // normalise to the outer corner once, including for GDAL overview grids.
  const origin = base.getOrigin();
  if (keys.GTRasterTypeGeoKey === 2) {
    origin[0] -= res[0] * 0.5;
    origin[1] -= res[1] * 0.5;
  }
  const record = { tiff, base, images, origin, nodata: base.getGDALNoData() };
  signal.throwIfAborted();
  headers.set(url, record);
  while (headers.size > 8) headers.delete(headers.keys().next().value);
  return record;
}

function imageWindow(record, image, bounds) {
  const [w, s, e, n] = bounds,
    [ox, oy] = record.origin;
  const [dx, dy] = image.getResolution(record.base);
  const x0 = Math.max(0, Math.floor((w - ox) / dx - 0.5) - 1);
  const x1 = Math.min(image.getWidth(), Math.ceil((e - ox) / dx - 0.5) + 2);
  const y0 = Math.max(0, Math.floor((n - oy) / dy - 0.5) - 1);
  const y1 = Math.min(image.getHeight(), Math.ceil((s - oy) / dy - 0.5) + 2);
  return { window: [x0, y0, x1, y1], res: [dx, dy] };
}

async function readWindow(record, bounds, signal) {
  const wanted = Math.min(bounds[2] - bounds[0], bounds[3] - bounds[1]) / (GRID_SIZE - 1);
  const sorted = [...record.images].sort(
    (a, b) => Math.abs(a.getResolution(record.base)[0]) - Math.abs(b.getResolution(record.base)[0])
  );
  let index = 0;
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i].getResolution(record.base);
    if (Math.max(Math.abs(r[0]), Math.abs(r[1])) <= wanted) index = i;
  }
  let image, area;
  while (index < sorted.length) {
    image = sorted[index];
    area = imageWindow(record, image, bounds);
    if (area.window[2] - area.window[0] <= 1024 && area.window[3] - area.window[1] <= 1024) break;
    index++;
  }
  if (index === sorted.length) throw Error('高程窗口超过内存限制');
  const [x0, y0, x1, y1] = area.window;
  if (x1 <= x0 || y1 <= y0) return null;
  const data = await image.readRasters({
    window: area.window,
    samples: [0],
    interleave: true,
    signal,
  });
  return {
    data,
    width: x1 - x0,
    height: y1 - y0,
    nodata: record.nodata,
    origin: [record.origin[0] + x0 * area.res[0], record.origin[1] + y0 * area.res[1]],
    res: area.res,
  };
}

function sample(raster, lon, lat) {
  let x = (lon - raster.origin[0]) / raster.res[0] - 0.5;
  let y = (lat - raster.origin[1]) / raster.res[1] - 0.5;
  // Overview pixel centres sit inside the source footprint. Clamp only the
  // remaining half-pixel at a real raster edge; otherwise adjacent COGs leave
  // a strip of missing samples even though their pixel footprints touch.
  if (
    x < -0.5 - 1e-6 ||
    y < -0.5 - 1e-6 ||
    x > raster.width - 0.5 + 1e-6 ||
    y > raster.height - 0.5 + 1e-6
  )
    return NaN;
  x = Math.max(0, Math.min(raster.width - 1, x));
  y = Math.max(0, Math.min(raster.height - 1, y));
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const p = [
    raster.data[iy * raster.width + ix],
    raster.data[iy * raster.width + Math.min(ix + 1, raster.width - 1)],
    raster.data[Math.min(iy + 1, raster.height - 1) * raster.width + ix],
    raster.data[
      Math.min(iy + 1, raster.height - 1) * raster.width + Math.min(ix + 1, raster.width - 1)
    ],
  ];
  if (
    p.some(
      (v) =>
        !Number.isFinite(v) ||
        v < -500 ||
        v > 9000 ||
        (raster.nodata !== null && v === raster.nodata)
    )
  )
    return NaN;
  return (p[0] * (1 - fx) + p[1] * fx) * (1 - fy) + (p[2] * (1 - fx) + p[3] * fx) * fy;
}

async function renderTile(tile, signal) {
  if (!Number.isInteger(tile?.z) || tile.z < 0 || tile.z > 12) throw Error('不支持的高程层级');
  const cells = sourceCells(tile.bounds),
    heights = new Float32Array(GRID_SIZE * GRID_SIZE).fill(NaN);
  const result = {
    heights,
    gridSize: GRID_SIZE,
    source: 'cop30-2023_1',
    verticalDatum: 'EGM2008',
    coverage: 0,
    missingSourceKeys: [],
    warnings: [],
    sourceTiles: [],
    limited: !cells.length,
  };
  const [w, s, e, n] = tile.bounds;
  for (const cell of cells) {
    signal.throwIfAborted();
    if (missing.has(cell.key)) {
      result.missingSourceKeys.push(cell.key);
      continue;
    }
    try {
      const record = await openElevation(cell.url, signal);
      const raster = await readWindow(record, tile.bounds, signal);
      if (!raster) continue;
      for (let y = 0; y < GRID_SIZE; y++) {
        const lat = n - ((n - s) * y) / (GRID_SIZE - 1);
        for (let x = 0; x < GRID_SIZE; x++) {
          const at = y * GRID_SIZE + x;
          if (Number.isFinite(heights[at])) continue;
          heights[at] = sample(raster, w + ((e - w) * x) / (GRID_SIZE - 1), lat);
        }
      }
      result.sourceTiles.push(cell.key);
    } catch (error) {
      // Reject cached lazy IFD/tag promises after failure or cancellation.
      headers.delete(cell.url);
      signal.throwIfAborted();
      if (error.status === 404) {
        rememberMissing(cell.key);
        result.missingSourceKeys.push(cell.key);
      } else result.warnings.push(`${cell.key}: ${error.message}`);
    }
  }
  let valid = 0;
  for (const height of heights) if (Number.isFinite(height)) valid++;
  result.coverage = valid / heights.length;
  if (!valid && result.warnings.length) throw Error(`高程暂不可用：${result.warnings[0]}`);
  return result;
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
        for (const key of job.knownMissing || []) rememberMissing(key);
        const result = await renderTile(job.tile, controller.signal);
        if (!controller.signal.aborted)
          self.postMessage({ id: job.id, result }, [result.heights.buffer]);
      } catch (error) {
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
