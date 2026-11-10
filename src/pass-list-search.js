import { predictionSource, validateObserver } from './pass-prediction.js';
import { findHighPassInSource, highPassReachability } from './pass-highpoint-search.js';

// Enumerate the same refined maxima as next/previous, with an explicit end.
// Padding keeps a pass complete when its maximum falls near the selected end.
export async function findPassList(data, observer, start, options = {}) {
  const {
    end,
    minimumPeakElevation = 60,
    daylight = 'any',
    visibleOnly = false,
    signal,
    onProgress,
  } = options;
  const source = predictionSource(data),
    site = validateObserver(observer);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    start < source.start ||
    end > source.end ||
    !Number.isFinite(minimumPeakElevation) ||
    minimumPeakElevation < 0 ||
    minimumPeakElevation > 90 ||
    !['any', 'day', 'night'].includes(daylight)
  )
    throw Error('列表日期范围或筛选条件无效');
  const reachability = highPassReachability(data, site);
  const bounded = { ...source, end: Math.min(source.end, end + reachability.paddingMs) };
  const passes = [];
  let cursor = Math.max(source.start, start - 1),
    checkedPasses = 0,
    status = 'exhausted';
  while (cursor < end) {
    const result = await findHighPassInSource(bounded, site, cursor, {
      direction: 1,
      minimumPeakElevation,
      daylight,
      reachability,
      signal,
      onProgress: (p) =>
        onProgress?.({
          ...p,
          daysScanned: Math.max(0, (Math.min(end, p.searchedEnd) - start) / 86400000),
          checkedPasses: checkedPasses + p.checkedPasses,
          foundCount: passes.length,
        }),
    });
    checkedPasses += result.checkedPasses;
    status = result.status;
    const pass = result.passes[0];
    if (!pass || pass.maximum.time >= end) break;
    if (!(pass.maximum.time > cursor)) throw Error('轨道演算不可用');
    // Sub-second peak refinement jitters by a few milliseconds between scans.
    // Advance beyond its numerical neighbourhood, not beyond the whole pass.
    cursor = pass.maximum.time + 1000;
    if (!visibleOnly || (pass.maximum.sunElevation < -6 && pass.maximum.illumination > 0.01))
      passes.push(pass);
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return {
    start,
    end,
    clipped: false,
    kind: source.kind,
    mode:
      start >= source.recordStart && end <= source.recordEnd
        ? 'catalog'
        : end <= source.recordStart || start >= source.recordEnd
          ? 'estimate'
          : 'mixed',
    recordStart: source.recordStart,
    recordEnd: source.recordEnd,
    epoch: source.epoch,
    observer: site,
    minimumElevation: 0,
    passes,
    reachability,
    status: passes.length ? 'found' : status,
    query: { list: true, referenceTime: start, minimumPeakElevation, daylight, visibleOnly },
  };
}
