import { azimuthOffset, horizonHeight, normalizeHorizon } from './balcony-lab-geometry.js';

const EPSILON_MS = 40;

function bisect(a, b, positive) {
  const from = positive(a);
  while (b - a > EPSILON_MS) {
    const mid = (a + b) / 2;
    if (positive(mid) === from) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

// Include each azimuth vertex as a knot. Otherwise a narrow opening between two
// buildings can begin and end between even closely spaced time samples.
function roofCrossings(start, end, profile, sample, peakTime) {
  if (!profile.length) return [];
  const knots = new Set([start, end]);
  if (peakTime > start && peakTime < end) knots.add(peakTime);
  const count = Math.min(900, Math.max(1, Math.ceil((end - start) / 5000)));
  for (let i = 1; i < count; i++) knots.add(start + ((end - start) * i) / count);
  const coarse = [...knots].sort((a, b) => a - b);
  for (let i = 1; i < coarse.length; i++) {
    const a = coarse[i - 1],
      b = coarse[i],
      az = sample(a).azimuth,
      move = azimuthOffset(sample(b).azimuth, az);
    for (const [bearing] of profile) {
      const delta = azimuthOffset(bearing, az);
      if (delta * move > 0 && Math.abs(delta) < Math.abs(move))
        knots.add(bisect(a, b, (time) => azimuthOffset(sample(time).azimuth, az) > delta));
    }
  }
  const above = (time) => {
    const q = sample(time);
    return q.elevation > horizonHeight(profile, q.azimuth);
  };
  const sorted = [...knots].sort((a, b) => a - b),
    cross = [];
  for (let i = 1; i < sorted.length; i++)
    if (above(sorted[i]) !== above(sorted[i - 1]))
      cross.push(bisect(sorted[i - 1], sorted[i], above));
  return cross;
}

function boundaryReason(pass, point, opening) {
  const edge = opening ? pass.start : pass.end;
  if (Math.abs(edge - point.time) <= EPSILON_MS)
    return (opening ? pass.clippedStart : pass.clippedEnd) ? 'range' : 'threshold';
  return point.illumination - 0.01 < (-6 - point.sunElevation) / 10 ? 'shadow' : 'twilight';
}

function highest(pass, start, end, sample) {
  const times = [
    ...new Set(
      [start, end, pass.maximum.time, ...pass.path.map((q) => q.time)].filter(
        (t) => t >= start && t <= end
      )
    ),
  ].sort((a, b) => a - b);
  const points = times.map(sample);
  let i = 0;
  for (let j = 1; j < points.length; j++) if (points[j].elevation > points[i].elevation) i = j;
  let best = points[i],
    a = times[Math.max(0, i - 1)],
    b = times[Math.min(i + 1, times.length - 1)];
  while (b - a > 200) {
    const left = (2 * a + b) / 3,
      right = (a + 2 * b) / 3;
    if (sample(left).elevation < sample(right).elevation) a = left;
    else b = right;
  }
  const refined = sample((a + b) / 2);
  return refined.elevation > best.elevation ? refined : best;
}

export function observationOpportunity(pass, sampler, profile = []) {
  const roof = normalizeHorizon(profile),
    cache = new Map();
  const sample = (time) => {
    if (!cache.has(time)) cache.set(time, sampler(time));
    return cache.get(time);
  };
  const windows = [];
  for (const span of pass.visible) {
    const first = Math.max(span.start, pass.start),
      last = Math.min(span.end, pass.end);
    if (last <= first) continue;
    const times = [first, ...roofCrossings(first, last, roof, sample, pass.maximum.time), last];
    for (let i = 1; i < times.length; i++) {
      const start = times[i - 1],
        end = times[i],
        mid = sample((start + end) / 2);
      if (mid.elevation <= horizonHeight(roof, mid.azimuth)) continue;
      const a = sample(start),
        b = sample(end);
      windows.push({
        start,
        end,
        first: a,
        peak: highest(pass, start, end, sample),
        last: b,
        startReason: i === 1 ? boundaryReason(pass, a, true) : 'roof',
        endReason: i === times.length - 1 ? boundaryReason(pass, b, false) : 'roof',
      });
    }
  }
  let reason = null;
  if (!windows.length) {
    if (pass.visible.length) reason = 'roof';
    else if (pass.path.every((q) => q.sunElevation > -6)) reason = 'twilight';
    else if (pass.path.every((q) => q.illumination < 0.01)) reason = 'shadow';
    else reason = 'conditions';
  }
  return { windows, duration: windows.reduce((n, w) => n + w.end - w.start, 0), reason };
}

export function preferredOpportunity(models, at) {
  const next = models.findIndex((o) => o.windows.some((w) => w.end > at));
  if (next >= 0) return next;
  const first = models.findIndex((o) => o.windows.length);
  return first >= 0 ? first : 0;
}

export function watchPhase(model, time, from = -Infinity) {
  const windows = model?.windows.filter((window) => window.end > from) ?? [];
  const next = windows.find((window) => window.end > time);
  if (!next)
    return {
      phase: windows.length ? 'ended' : 'empty',
      window: windows.at(-1) ?? null,
      remaining: 0,
    };
  if (time < next.start) return { phase: 'waiting', window: next, remaining: next.start - time };
  return { phase: 'observing', window: next, remaining: next.end - time };
}

export function durationClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)),
    pad = (n) => String(n).padStart(2, '0');
  return s >= 3600
    ? Math.floor(s / 3600) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60)
    : Math.floor(s / 60) + ':' + pad(s % 60);
}
