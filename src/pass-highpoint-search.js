import { constants } from 'satellite.js';
import { earthAxes } from './earth-frame.js';
import { createOrbitContinuation } from './orbit-continuation.js';
import {
  predictionSource,
  createPassSampler,
  scanPasses,
  validateObserver,
  observerFrame,
} from './pass-prediction.js';

const DAY = 86400000,
  DEG = 180 / Math.PI,
  CHUNK_MS = DAY,
  DEFAULT_PADDING_MS = 2 * 3600000,
  PEAK_TIME_TOLERANCE_MS = 1,
  envelopes = new WeakMap();
const norm = (v) => Math.hypot(...v),
  dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
  cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];

function orbitEnvelope(data) {
  if (envelopes.has(data)) return envelopes.get(data);
  const first = data.rows[0],
    last = data.rows.at(-1),
    pole = earthAxes(first[0])[2];
  let maxLatitude = 0,
    maxRadius = 0,
    maxPeriodMs = 0,
    nearEarth = true;
  for (const row of data.rows) {
    const r = row.slice(1, 4),
      v = row.slice(4),
      radius = norm(r),
      h = cross(r, v),
      energy = dot(v, v) / 2 - constants.mu / radius,
      a = -constants.mu / (2 * energy),
      e2 = 1 - dot(h, h) / (constants.mu * a);
    if (!(energy < 0) || !(norm(h) > 0) || e2 >= 1) {
      nearEarth = false;
      break;
    }
    const e = Math.sqrt(Math.max(0, e2)),
      periodMs = 2000 * Math.PI * Math.sqrt(a ** 3 / constants.mu),
      latitude = Math.acos(Math.min(1, Math.abs(dot(h, pole)) / norm(h))) * DEG;
    maxLatitude = Math.max(maxLatitude, latitude);
    maxRadius = Math.max(maxRadius, radius, a * (1 + e));
    maxPeriodMs = Math.max(maxPeriodMs, periodMs);
    if (periodMs >= 220 * 60000) nearEarth = false;
  }
  // Only the constant-mean-element near-Earth continuation supports a useful
  // latitude envelope for arbitrarily distant dates. A fixed-pole J2 fallback
  // or unknown model gets the deliberately non-excluding 90-degree bound.
  const fitted =
    nearEarth && [first, last].every((row) => createOrbitContinuation(row)?.kind === 'sgp4');
  const envelope = {
    known: Boolean(fitted),
    maxLatitude: Math.min(90, maxLatitude + 2),
    // Generous margins cover mean/osculating and short-period differences;
    // these are an exclusion envelope, not predicted trajectory dimensions.
    maxRadius: maxRadius * 1.1 + 100,
    paddingMs: Math.max(1800000, Math.min(DAY, 1.5 * maxPeriodMs || DEFAULT_PADDING_MS)),
  };
  envelopes.set(data, envelope);
  return envelope;
}

export function highPassReachability(data, observer) {
  const site = validateObserver(observer),
    frame = observerFrame(site),
    envelope = orbitEnvelope(data);
  if (!envelope.known)
    return { upperBoundElevation: 90, paddingMs: envelope.paddingMs, basis: 'unknown' };
  const radius = norm(frame.position),
    latitude = Math.asin(frame.position[2] / radius) * DEG,
    separation = Math.max(0, Math.abs(latitude) - envelope.maxLatitude) / DEG,
    radialUpper =
      Math.atan2(
        envelope.maxRadius * Math.cos(separation) - radius,
        envelope.maxRadius * Math.sin(separation)
      ) * DEG,
    // Topocentric elevation uses the geodetic normal, not the geocentric radius.
    upperBoundElevation = Math.min(90, radialUpper + Math.abs(site.latitude - latitude));
  return {
    upperBoundElevation,
    paddingMs: envelope.paddingMs,
    maximumLatitude: envelope.maxLatitude,
    radiusUpperBoundKm: envelope.maxRadius,
    basis: 'near-earth-envelope',
  };
}

function validateQuery(start, options) {
  const { direction = 1, minimumPeakElevation = 60, daylight = 'any' } = options;
  if (
    !Number.isFinite(start) ||
    ![1, -1].includes(direction) ||
    !Number.isFinite(minimumPeakElevation) ||
    minimumPeakElevation < 0 ||
    minimumPeakElevation > 90 ||
    !['any', 'day', 'night'].includes(daylight)
  )
    throw Error('高仰角搜索参数无效');
  return {
    referenceTime: start,
    direction,
    minimumPeakElevation,
    daylight,
    timeToleranceMs: PEAK_TIME_TOLERANCE_MS,
  };
}

function* refinePeak(
  sample,
  pass,
  known,
  referenceTime,
  lo = known.time - 30000,
  hi = known.time + 30000
) {
  lo = Math.max(pass.start, lo);
  hi = Math.min(pass.end, hi);
  let best = known;
  // Near a true zenith crossing elevation has a sharp cusp: millisecond-only
  // refinement can miss an exact 90-degree event. Refine to floating-point
  // resolution, with explicit no-progress/iteration guards at distant dates.
  for (let i = 0; i < 64 && hi - lo > 1e-4; i++) {
    const aTime = lo + (hi - lo) / 3,
      bTime = hi - (hi - lo) / 3;
    if (aTime <= lo || bTime >= hi || aTime >= bTime) break;
    const a = sample(aTime),
      b = sample(bTime);
    if (a.elevation > best.elevation) best = a;
    if (b.elevation > best.elevation) best = b;
    if (a.elevation < b.elevation) lo = a.time;
    else hi = b.time;
    yield;
  }
  for (const time of [lo, lo + (hi - lo) / 2, hi]) {
    const q = sample(time);
    if (q.elevation > best.elevation) best = q;
    yield;
  }
  // Repeating a search from a previously returned maximum must move to another
  // pass. Peaks within the refined maximum's numerical time tolerance and
  // indistinguishable in elevation represent that same maximum.
  if (
    Math.abs(best.time - referenceTime) <= PEAK_TIME_TOLERANCE_MS &&
    referenceTime >= pass.start &&
    referenceTime <= pass.end
  ) {
    const reference = sample(referenceTime);
    if (reference.elevation >= best.elevation - 1e-5) best = reference;
  }
  return best;
}

function* nearestCandidate(passes, sample, query, coreStart, coreEnd, peakBrackets) {
  let nearest = null;
  for (const pass of passes) {
    const maxima = [yield* refinePeak(sample, pass, pass.maximum, query.referenceTime)];
    // A continuously visible high orbit can contain several maxima in one
    // clipped span. Its 49-point display curve need not resolve every peak;
    // retain the scanner's actual 30-second peak brackets instead.
    for (const [a, p, b] of peakBrackets)
      if (p.time >= pass.start && p.time <= pass.end && b.time >= coreStart && a.time <= coreEnd)
        maxima.push(yield* refinePeak(sample, pass, p, query.referenceTime, a.time, b.time));
    for (const maximum of maxima) {
      if (
        (maximum.time - query.referenceTime) * query.direction <= 0 ||
        maximum.time < coreStart ||
        maximum.time > coreEnd ||
        (pass.clippedStart && maximum.time <= pass.start) ||
        (pass.clippedEnd && maximum.time >= pass.end) ||
        maximum.elevation < query.minimumPeakElevation - 1e-7 ||
        (query.daylight === 'day' && maximum.sunElevation < 0) ||
        (query.daylight === 'night' && maximum.sunElevation >= 0)
      )
        continue;
      if (!nearest || (maximum.time - nearest.maximum.time) * query.direction < 0)
        nearest = { ...pass, maximum };
    }
  }
  return nearest;
}

/**
 * Search an arbitrary prediction source. Each scan owns its sampler/cache and
 * at most 72 hours of intermediate results. Exported also for reproducible
 * synthetic-source tests and callers that already have a validated source.
 */
export function findHighPassInSource(source, observer, start, options = {}) {
  let query, site;
  try {
    query = validateQuery(start, options);
    site = validateObserver(observer);
    if (
      !Number.isFinite(source?.start) ||
      !Number.isFinite(source?.end) ||
      source.end <= source.start ||
      start < source.start ||
      start > source.end
    )
      throw Error('搜索时间超出轨道演算范围');
  } catch (error) {
    return Promise.reject(error);
  }
  const { signal, onProgress, reachability = { upperBoundElevation: 90 } } = options,
    paddingMs = Math.max(1800000, Math.min(DAY, reachability.paddingMs || DEFAULT_PADDING_MS));
  return new Promise((resolve, reject) => {
    let timer,
      settled = false,
      cursor = start,
      scan = null,
      sample,
      peakBrackets = [],
      coreStart = start,
      coreEnd = start,
      chunksScanned = 0,
      checkedPasses = 0,
      searchedStart = start,
      searchedEnd = start,
      lastProgress = -Infinity;
    const progress = (phase = 'searching') =>
      onProgress?.({
        phase,
        ...query,
        chunksScanned,
        checkedPasses,
        searchedStart,
        searchedEnd,
        daysScanned: (searchedEnd - searchedStart) / DAY,
        activeStart: coreStart,
        activeEnd: coreEnd,
        upperBoundElevation: reachability.upperBoundElevation,
      });
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      scan = null;
      sample = null;
      peakBrackets = [];
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => finish(new DOMException('Aborted', 'AbortError'));
    const result = (status, pass = null) => {
      const recordStart = source.recordStart,
        recordEnd = source.recordEnd;
      if (pass)
        pass.estimated =
          (Number.isFinite(recordStart) && pass.start < recordStart) ||
          (Number.isFinite(recordEnd) && pass.end > recordEnd);
      const outside =
        pass &&
        ((Number.isFinite(recordStart) && pass.end < recordStart) ||
          (Number.isFinite(recordEnd) && pass.start > recordEnd));
      return {
        status,
        start: pass?.start ?? searchedStart,
        end: pass?.end ?? searchedEnd,
        clipped: Boolean(pass?.clippedStart || pass?.clippedEnd),
        kind: source.kind,
        mode: pass?.estimated ? (outside ? 'estimate' : 'mixed') : 'catalog',
        recordStart,
        recordEnd,
        epoch: source.epoch,
        observer: site,
        minimumElevation: 0,
        passes: pass ? [pass] : [],
        query,
        reachability,
        searchedStart,
        searchedEnd,
        chunksScanned,
        checkedPasses,
      };
    };
    const run = () => {
      if (settled) return;
      try {
        if (signal?.aborted) return abort();
        const began = performance.now();
        do {
          if (!scan) {
            if (
              (query.direction === 1 && cursor >= source.end) ||
              (query.direction === -1 && cursor <= source.start)
            ) {
              progress('exhausted');
              return finish(null, result('exhausted'));
            }
            coreStart = query.direction === 1 ? cursor : Math.max(source.start, cursor - CHUNK_MS);
            coreEnd = query.direction === 1 ? Math.min(source.end, cursor + CHUNK_MS) : cursor;
            // Recreate the sampler per chunk so its Sun cache cannot grow with
            // an indefinitely extending search. Overlap supplies full LEO passes
            // even when a peak lies exactly on a chunk boundary.
            const scanStart = Math.max(source.start, coreStart - paddingMs),
              scanEnd = Math.min(source.end, coreEnd + paddingMs),
              rawSample = createPassSampler(source, site),
              coarse = [];
            let nextCoarseTime = scanStart,
              coarseFinished = false;
            peakBrackets = [];
            sample = (time) => {
              const q = rawSample(time);
              if (!coarseFinished && time === nextCoarseTime) {
                coarse.push(q);
                if (coarse.length === 3) {
                  const [a, p, b] = coarse;
                  if (p.elevation > a.elevation && p.elevation >= b.elevation)
                    peakBrackets.push([a, p, b]);
                  coarse.shift();
                }
                if (time === scanEnd) coarseFinished = true;
                else nextCoarseTime = Math.min(scanEnd, time + 30000);
              }
              return q;
            };
            scan = (function* () {
              const passes = yield* scanPasses(sample, scanStart, scanEnd, {
                minimumElevation: 0,
                stepMs: 30000,
              });
              checkedPasses += passes.length;
              return yield* nearestCandidate(
                passes,
                sample,
                query,
                coreStart,
                coreEnd,
                peakBrackets
              );
            })();
          }
          const step = scan.next();
          if (step.done) {
            chunksScanned++;
            searchedStart = Math.min(searchedStart, coreStart);
            searchedEnd = Math.max(searchedEnd, coreEnd);
            const pass = step.value;
            if (pass) {
              progress('found');
              return finish(null, result('found', pass));
            }
            cursor = query.direction === 1 ? coreEnd : coreStart;
            scan = null;
            sample = null;
            peakBrackets = [];
            progress();
            if (signal?.aborted) return abort();
          }
        } while (performance.now() - began < 4);
        if (performance.now() - lastProgress > 100) {
          progress();
          lastProgress = performance.now();
        }
        if (!settled) timer = setTimeout(run, 0);
      } catch (error) {
        finish(error);
      }
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (reachability.upperBoundElevation < query.minimumPeakElevation - 1e-7) {
        progress('unreachable');
        return finish(null, result('unreachable'));
      }
      progress();
      if (!settled) timer = setTimeout(run, 0);
    } catch (error) {
      finish(error);
    }
  });
}

export function findHighPass(data, observer, start, options = {}) {
  try {
    if (options.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    const source = predictionSource(data, { allowEstimate: true });
    const reachability = highPassReachability(data, observer);
    return findHighPassInSource(source, observer, start, { ...options, reachability });
  } catch (error) {
    return Promise.reject(error);
  }
}
