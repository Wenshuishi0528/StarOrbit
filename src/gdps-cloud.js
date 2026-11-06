// ECCC GeoMet renders a forecast field. The issue time and valid time are both
// required to identify a frame; a new run may revise the same forecast hour.
import { t } from './i18n.js';
import { readableBlobMatches } from './resource-fetch.js';

const ENDPOINT = 'https://geo.weather.gc.ca/geomet';
const LAYER = 'GDPS_15km_TotalCloudCover';
const WIDTH = 2400,
  HEIGHT = 1200;
export const GDPS_PROCESSING = 'gdps-forecast-v1';
export const GDPS_ATTRIBUTION = 'Data Source: Environment and Climate Change Canada';
export const GDPS_LICENSE = 'https://eccc-msc.github.io/open-data/licence/readme_en/';
const serviceURL = (params) =>
  ENDPOINT + '?' + new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', ...params });
const catalogURL = serviceURL({ REQUEST: 'GetCapabilities', LAYER });
const badCatalog = () => Error(t('GDPS 预报目录无效，请稍后重试'));
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

function cancelled(signal) {
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
}

function advertisedTimes(spec) {
  const times = [];
  for (const part of spec.split(',')) {
    const fields = part.trim().split('/');
    const parse = (value) =>
      /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?Z$/.test(value) ? Date.parse(value) : NaN;
    const start = parse(fields[0]);
    if (!Number.isFinite(start) || times.length >= 4000) throw badCatalog();
    if (fields.length === 1) {
      times.push(start);
      continue;
    }
    if (fields.length !== 3) throw badCatalog();
    const end = parse(fields[1]),
      period = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(fields[2]);
    if (!period || !Number.isFinite(end) || end < start) throw badCatalog();
    const step =
      (Number(period[1] || 0) * 86400 +
        Number(period[2] || 0) * 3600 +
        Number(period[3] || 0) * 60 +
        Number(period[4] || 0)) *
      1000;
    if (
      !Number.isFinite(step) ||
      step <= 0 ||
      times.length + 1 + Math.floor((end - start) / step) > 4000
    )
      throw badCatalog();
    for (let tick = start; tick <= end; tick += step) times.push(tick);
  }
  return times;
}

function selectFrame(text, now) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.getElementsByTagNameNS('*', 'parsererror').length) throw badCatalog();
  const name = [...xml.getElementsByTagNameNS('*', 'Name')].find(
    (n) => n.textContent.trim() === LAYER && n.parentElement?.localName === 'Layer'
  );
  if (!name) throw badCatalog();
  const dimensions = new Map(
    [...name.parentElement.children]
      .filter((n) => n.localName === 'Dimension')
      .map((n) => [n.getAttribute('name'), n.textContent])
  );
  const runs = advertisedTimes(dimensions.get('reference_time') || '').filter((run) => run <= now);
  const forecastRun = Math.max(...runs);
  if (!Number.isFinite(forecastRun)) throw badCatalog();
  const valid = advertisedTimes(dimensions.get('time') || '').filter((time) => time >= forecastRun);
  // Closest advertised valid time, choosing the earlier hour on an exact tie.
  valid.sort((a, b) => Math.abs(a - now) - Math.abs(b - now) || a - b);
  const time = valid[0];
  if (!Number.isFinite(time) || Math.abs(time - now) > 3 * 3600_000)
    throw Error(t('GDPS 目录没有接近当前时间的预报，请稍后重试'));
  return { forecastRun, time };
}

function mapURL({ forecastRun, time }) {
  // GeoMet treats each colour stop as a class, even for a "ramp". Sending only
  // the endpoints yields a binary map. Supply a stop for every percentage point.
  const stops = Array.from({ length: 101 }, (_, pct) => {
    const gray = Math.round((pct * 255) / 100)
      .toString(16)
      .padStart(2, '0');
    return '<ColorMapEntry color="#' + gray.repeat(3) + '" quantity="' + pct + '"/>';
  }).join('');
  const sld =
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:se="http://www.opengis.net/se"><NamedLayer><se:Name>' +
    LAYER +
    '</se:Name><UserStyle><se:FeatureTypeStyle><se:Rule><se:RasterSymbolizer><se:ColorMap type="ramp">' +
    stops +
    '</se:ColorMap></se:RasterSymbolizer></se:Rule></se:FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>';
  return serviceURL({
    REQUEST: 'GetMap',
    LAYERS: LAYER,
    STYLES: '',
    SLD_BODY: sld,
    CRS: 'EPSG:4326',
    BBOX: '-90,-180,90,180',
    WIDTH: String(WIDTH),
    HEIGHT: String(HEIGHT),
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
    TIME: iso(time),
    DIM_REFERENCE_TIME: iso(forecastRun),
  });
}

async function inspectForecast(blob, signal) {
  const header = new Uint8Array(await blob.slice(0, 33).arrayBuffer());
  if (
    header.length !== 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => header[i] === v) ||
    String.fromCharCode(...header.slice(12, 16)) !== 'IHDR'
  )
    throw Error(t('云图格式无效'));
  const view = new DataView(header.buffer);
  if (view.getUint32(16) !== WIDTH || view.getUint32(20) !== HEIGHT) throw Error(t('云图尺寸无效'));
  cancelled(signal);
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  let canvas;
  try {
    if (bitmap.width !== WIDTH || bitmap.height !== HEIGHT) throw Error(t('云图尺寸无效'));
    const strip = 64,
      polarRows = HEIGHT / 8,
      counts = { north: 0, south: 0 };
    canvas = new OffscreenCanvas(WIDTH, strip);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let low = 255,
      high = 0,
      validPixels = 0;
    for (let y = 0; y < HEIGHT; y += strip) {
      cancelled(signal);
      const rows = Math.min(strip, HEIGHT - y);
      ctx.clearRect(0, 0, WIDTH, strip);
      ctx.drawImage(bitmap, 0, y, WIDTH, rows, 0, 0, WIDTH, rows);
      const pixels = ctx.getImageData(0, 0, WIDTH, rows).data;
      for (let row = 0; row < rows; row++) {
        let validRow = 0;
        for (let i = row * WIDTH * 4, end = i + WIDTH * 4; i < end; i += 4) {
          if (!pixels[i + 3]) continue; // Transparent is missing; black with alpha is valid 0%.
          if (pixels[i] !== pixels[i + 1] || pixels[i] !== pixels[i + 2])
            throw Error(t('GDPS 没有返回线性灰度云量图，未保存'));
          low = Math.min(low, pixels[i]);
          high = Math.max(high, pixels[i]);
          validRow++;
        }
        const latitudeRow = y + row;
        if (latitudeRow < polarRows) counts.north += validRow;
        if (latitudeRow >= HEIGHT - polarRows) counts.south += validRow;
        validPixels += validRow;
        if ((latitudeRow === 0 || latitudeRow === HEIGHT - 1) && validRow < WIDTH * 0.99)
          throw Error(t('GDPS 没有返回覆盖两极的有效全球云量图，未保存'));
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const coverage = validPixels / (WIDTH * HEIGHT),
      polarCoverage = {
        north: counts.north / (WIDTH * polarRows),
        south: counts.south / (WIDTH * polarRows),
      };
    if (coverage < 0.99 || polarCoverage.north < 0.99 || polarCoverage.south < 0.99)
      throw Error(t('GDPS 没有返回覆盖两极的有效全球云量图，未保存'));
    if (high - low < 8) throw Error(t('图源返回空白或异常的灰度云图，未保存'));
    return { validPixels, coverage, polarCoverage };
  } finally {
    bitmap.close();
    if (canvas) canvas.width = canvas.height = 1;
  }
}

export async function downloadGdpsCloud(weather, { signal, onProgress = () => {} } = {}) {
  cancelled(signal);
  onProgress(t('正在检查 GDPS 起报和有效时次…'));
  const { blob: xml } = await weather.fetch(catalogURL, 1_000_000, { signal, timeout: 30000 });
  const frame = selectFrame(await xml.text(), Date.now()),
    source = mapURL(frame);
  cancelled(signal);
  onProgress(t('正在下载 GDPS 全球总云量预报…'));
  // The WMS renders the scalar texture on demand. This global grid contains
  // only 2.88M pixels; keep its lossless PNG, with a 30 MB transfer/storage cap.
  const { blob } = await weather.fetch(source, 30_000_000, { signal, timeout: 60000 });
  if (blob.size > 30_000_000) throw Error(t('数据超过大小限制'));
  cancelled(signal);
  const digest = await weather.checkedCloudHash(blob);
  const saved = weather.items.find(
    (r) =>
      r.kind === 'cloud' &&
      r.provider === 'gdps' &&
      r.processing === GDPS_PROCESSING &&
      r.source === source &&
      r.forecastRun === frame.forecastRun &&
      r.time === frame.time &&
      r.sha256 === digest &&
      r.blob &&
      !r.integrityFailed
  );
  if (saved && (await readableBlobMatches(saved.blob, digest))) {
    cancelled(signal);
    return saved;
  }
  const { coverage, polarCoverage, validPixels } = await inspectForecast(blob, signal);
  cancelled(signal);
  const record = await weather.store('cloud', blob, {
    ...frame,
    provider: 'gdps',
    processing: GDPS_PROCESSING,
    productType: 'forecast',
    channel: 'validity',
    source,
    release: 'ECCC GDPS · Total cloud cover',
    resolution: '2400×1200',
    nativeResolution: '0.15°',
    archiveKey: 'gdps:' + frame.forecastRun + ':' + frame.time,
    attribution: GDPS_ATTRIBUTION,
    licenseURL: GDPS_LICENSE,
    integrityFailed: false,
    coverage,
    polarCoverage,
    contentHash: digest,
    manualValidation: { schema: 1, sha256: digest, validPixels },
  });
  weather.pendingRecords.delete(record.id);
  return record;
}
