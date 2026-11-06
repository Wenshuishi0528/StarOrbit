import { fetchResource, blobHash } from './resource-fetch.js';
import { CLOUD_MAX_BYTES } from './cloud-texture.js';

const GIBS = 'https://gibs.earthdata.nasa.gov';
const WMTS = 'http://www.opengis.net/wmts/1.0',
  OWS = 'http://www.opengis.net/ows/1.1';
export function historySelection(provider, date, slot, now = Date.now()) {
  if (
    !['satcorps', 'gmgsi', 'himawari', 'viirs'].includes(provider) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  )
    throw Error('请选择有效图源和日期');
  const start = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== date || start > now)
    throw Error('日期无效或位于未来');
  let minutes = 0;
  if (provider === 'viirs') {
    if (!['day', 'night'].includes(slot)) throw Error('请选择有效时次');
  } else if (provider === 'himawari') {
    if (!/^(?:[01]\d|2[0-3]):[0-5]0$/.test(slot)) throw Error('请选择有效时次');
    const [hour, minute] = slot.split(':').map(Number);
    minutes = hour * 60 + minute;
  } else {
    if (!/^(?:[0-9]|1[0-9]|2[0-3])$/.test(slot)) throw Error('请选择有效时次');
    minutes = Number(slot) * 60;
  }
  const time = start + minutes * 60000;
  if (time > now) throw Error('不能查询未来时刻');
  return { provider, date, slot, time, key: provider + ':' + date + ':' + slot };
}
export function listedDate(date, intervals) {
  return intervals.some((s) => {
    const p = s.split('/');
    return p.length === 1
      ? p[0] === date
      : p.length === 3 && p[2] === 'P1D' && p[0] <= date && date <= p[1];
  });
}
const layer = (s) => 'VIIRS_NOAA20_Clear_Sky_Confidence_' + (s.slot === 'day' ? 'Day' : 'Night');
export function viirsURL(s) {
  return (
    GIBS +
    '/wms/epsg4326/best/wms.cgi?' +
    new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.1.1',
      REQUEST: 'GetMap',
      LAYERS: layer(s),
      STYLES: '',
      SRS: 'EPSG:4326',
      BBOX: '-180,-90,180,90',
      WIDTH: '2048',
      HEIGHT: '1024',
      FORMAT: 'image/png',
      TRANSPARENT: 'TRUE',
      TIME: s.date,
    })
  );
}
let catalog;
function cancellable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('已取消', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('已取消', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
async function viirsCatalog(force = false, signal) {
  if (!force && catalog && Date.now() - catalog.time < 6 * 3600000)
    return cancellable(catalog.promise, signal);
  const promise = (async () => {
    const { blob } = await fetchResource(GIBS + '/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml', {
      max: 12e6,
      timeout: 60000,
      signal,
    });
    const xml = new DOMParser().parseFromString(await blob.text(), 'application/xml');
    if (xml.querySelector('parsererror')) throw Error('图源日期目录格式无效');
    const out = {};
    for (const el of xml.getElementsByTagNameNS(WMTS, 'Layer')) {
      const id = el.getElementsByTagNameNS(OWS, 'Identifier')[0]?.textContent;
      if (!id?.startsWith('VIIRS_NOAA20_Clear_Sky_Confidence_')) continue;
      const dim = [...el.getElementsByTagNameNS(WMTS, 'Dimension')].find(
        (d) => d.getElementsByTagNameNS(OWS, 'Identifier')[0]?.textContent === 'Time'
      );
      out[id] = dim ? [...dim.getElementsByTagNameNS(WMTS, 'Value')].map((v) => v.textContent) : [];
    }
    return out;
  })();
  catalog = { time: Date.now(), promise };
  try {
    return await promise;
  } catch (e) {
    if (catalog?.promise === promise) catalog = null;
    throw e;
  }
}
export async function historyAPI(action, selection, method = 'GET', signal) {
  const params = selection
    ? '?' +
      new URLSearchParams({
        date: selection.date,
        hour: selection.slot,
        ...(['gmgsi', 'himawari'].includes(selection.provider)
          ? {
              provider: selection.provider,
              ...(selection.revision ? { revision: String(selection.revision) } : {}),
            }
          : {}),
        ...(selection.requestId ? { requestId: selection.requestId } : {}),
      })
    : '';
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 75000);
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch('/api/cloud/history/' + action + params, {
      method,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw Error('请使用最新版桌面启动器的本机服务');
    const value = await response.json();
    if (!response.ok) throw Error(value.error || '历史数据服务暂不可用');
    return value;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
export async function queryHistory(s, signal) {
  if (s.provider === 'satcorps') return historyAPI('query', s, 'GET', signal);
  const intervals = (await viirsCatalog(false, signal))[layer(s)];
  if (!intervals?.length) throw Error('图源未返回此图层的日期目录，请稍后重试');
  const available = listedDate(s.date, intervals);
  return {
    available,
    source: viirsURL(s),
    message: available
      ? '官方目录包含此日期；2048 × 1024 科学预览，约 1–3 MB（实际大小以下载为准）。可能存在缺测区域。'
      : '官方目录未列出此日期，请选择目录范围内的日期。',
    range: intervals.join('，'),
  };
}
export async function downloadHistory(
  s,
  weather,
  onProgress = () => {},
  { signal, onJob = () => {}, onState = () => {}, resumeJob } = {}
) {
  let blob, meta, kind;
  if (s.provider === 'viirs') {
    // Recheck the advertised date even if the UI was left open overnight.
    if (!(await queryHistory(s, signal)).available) throw Error('该日期没有可下载的 VIIRS 图');
    const source = viirsURL(s);
    ({ blob } = await fetchResource(source, {
      max: 8e6,
      timeout: 90000,
      signal,
      onProgress: (p) => onProgress('下载 VIIRS：' + (p.received / 1048576).toFixed(2) + ' MB'),
    }));
    const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
    if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => header[i] === v))
      throw Error('图源没有返回 PNG，未保存');
    const image = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
    try {
      if (image.width !== 2048 || image.height !== 1024) throw Error('预览尺寸不符，未保存');
      const c = new OffscreenCanvas(256, 128),
        ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, 256, 128);
      const pixels = ctx.getImageData(0, 0, 256, 128).data;
      let valid = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) valid++;
      if (!valid) throw Error('该日期返回空白缺测图，未保存');
    } finally {
      image.close();
    }
    kind = 'cloud-preview';
    meta = {
      provider: 'viirs',
      time: s.time,
      date: s.date,
      period: s.slot,
      resolution: '2048×1024',
      release: 'GIBS 日合成科学预览',
      source,
    };
  } else {
    s = { ...s, requestId: s.requestId || crypto.randomUUID().replaceAll('-', '') };
    onJob(resumeJob?.id || s.requestId);
    let job = resumeJob || (await historyAPI('download', s, 'POST', signal));
    const id = job.id;
    onJob(id);
    const deadline = Date.now() + 20 * 60000;
    while (['running', 'cancelling'].includes(job.state)) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
      onState(job);
      onProgress(job.status || '下载并检查云图…');
      if (Date.now() > deadline) throw Error('等待历史下载超时；可重试以查看本机任务结果');
      await new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('已取消', 'AbortError'));
          return;
        }
        const abort = () => {
            clearTimeout(timer);
            reject(new DOMException('已取消', 'AbortError'));
          },
          timer = setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            resolve();
          }, 2500);
        signal?.addEventListener('abort', abort, { once: true });
      });
      job = await historyAPI('status', null, 'GET', signal);
      if (job.id !== id) throw Error('本机下载任务已变化，请重新查询');
    }
    if (job.state === 'cancelled') throw new DOMException('已取消', 'AbortError');
    if (job.state !== 'ready' || !job.result) throw Error(job.error || '云图下载未完成');
    meta = job.result;
    if (
      meta.provider !== s.provider ||
      meta.resolution !== (s.provider === 'satcorps' ? '8192×4096' : '4096×2048') ||
      !(meta.coverage > 0) ||
      !['red', 'validity'].includes(meta.channel)
    )
      throw Error('返回的云图格式或有效数据无效');
    if (meta.time !== s.time) throw Error('返回的观测时次与选择不符，未保存');
    onProgress('已保存到本机，正在校验浏览器副本…');
    ({ blob } = await fetchResource(
      '/api/cloud/history/image?' + new URLSearchParams({ id, sha256: meta.sha256 }),
      { max: CLOUD_MAX_BYTES, timeout: 60000, signal }
    ));
    if ((await blobHash(blob)) !== meta.sha256) throw Error('历史云图完整性校验失败，未保存');
    meta = { ...meta, ...(await weather.validateManualCloud({ ...meta, kind: 'cloud', blob })) };
    kind = 'cloud';
  }
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  const record = await weather.store(kind, blob, {
    ...meta,
    integrityFailed: false,
    archiveKey: s.key,
    archiveOnly: false,
  });
  weather.pendingRecords.delete(record.id);
  return record;
}

export async function cloudJSON(path, { method = 'GET', signal } = {}) {
  const { blob } = await fetchResource('/api/cloud/' + path, {
    max: 2000000,
    timeout: 65000,
    signal,
    fetcher: (url, options) => fetch(url, { ...options, method }),
  });
  let value;
  try {
    value = JSON.parse(await blob.text());
  } catch {
    throw Error('本机云图服务未连接，请使用最新版桌面启动器');
  }
  if (value.error) throw Error(value.error.message || value.error);
  return value;
}
export async function versionCatalog(provider, month, date = '', force = false, signal) {
  if (provider === 'satcorps')
    return cloudJSON(
      'versions?' +
        new URLSearchParams({ month, ...(date ? { date } : {}), force: force ? '1' : '0' }),
      { signal }
    );
  const dates = [],
    items = [],
    catalog = await viirsCatalog(force, signal),
    first = Date.parse(month + '-01T00:00:00Z');
  if (!Number.isFinite(first) || !/^\d{4}-\d{2}$/.test(month)) throw Error('月份无效');
  for (let i = 0; i < 31; i++) {
    const value = new Date(first + i * 86400000).toISOString().slice(0, 10);
    if (!value.startsWith(month) || Date.parse(value) > Date.now()) break;
    for (const slot of ['day', 'night'])
      if (listedDate(value, catalog[layer({ slot })] || [])) {
        if (!dates.includes(value)) dates.push(value);
        if (!date || date === value)
          items.push({
            ...historySelection('viirs', value, slot),
            source: viirsURL({ date: value, slot }),
            remote: true,
            resolution: '2048×1024',
          });
      }
  }
  return {
    dates: dates.reverse(),
    items: items.sort((a, b) => b.time - a.time),
    checkedAt: Date.now(),
    message: '官方目录列出的日合成版本；白天与夜间分别下载。',
  };
}
export function versionKey(r) {
  if (r.provider === 'gdps') return 'gdps:' + r.forecastRun + ':' + r.time;
  if (r.provider === 'himawari' && Number.isFinite(r.time) && r.time > 0 && r.time < 8.64e15) {
    const iso = new Date(r.time).toISOString();
    return 'himawari:' + iso.slice(0, 10) + ':' + iso.slice(11, 16);
  }
  if (r.provider === 'viirs') return 'viirs:' + r.date + ':' + (r.period || r.slot);
  if (
    ['satcorps', 'gmgsi'].includes(r.provider) &&
    Number.isFinite(r.time) &&
    r.time > 0 &&
    r.time < 8.64e15
  ) {
    const d = new Date(r.time);
    return r.provider + ':' + d.toISOString().slice(0, 10) + ':' + d.getUTCHours();
  }
  return 'github:' + (r.id || r.sha256 || r.disk);
}
export function mergeCloudVersions(remote, records, disk) {
  const rows = new Map(),
    published = new Map(remote.map((r) => [versionKey(r), r]));
  const add = (original, field) => {
    const meta = { ...original, provider: original.provider || 'github' },
      base = versionKey(meta);
    const key = base + (meta.sha256 ? '#' + meta.sha256 : '');
    const row = rows.get(key) || { ...published.get(base), ...meta, key };
    row[field] = meta;
    rows.set(key, row);
  };
  for (const r of records.filter((r) => ['cloud', 'cloud-preview'].includes(r.kind)))
    add(r, 'record');
  for (const r of disk) add(r, 'diskRecord');
  const saved = new Set([...rows.values()].map(versionKey));
  for (const row of remote)
    if (!saved.has(versionKey(row))) rows.set(versionKey(row), { ...row, key: versionKey(row) });
  return [...rows.values()].sort(
    (a, b) => (b.time || b.record?.downloaded || 0) - (a.time || a.record?.downloaded || 0)
  );
}
