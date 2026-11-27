import { cross, dot, earthAxes, norm, sub, sunPosition } from '../orbit.js';
import { enuFrame } from '../ground-world-math.js';
import { positionAt } from './orbit-comparison.js';

const RAD_TO_DEG = 180 / Math.PI;
// Report the feasible side of each bracket. Earth axes are evaluated at JS Date resolution.
const TIME_TOL_SEC = 0.001;

function siteFrame(site) {
  const frame = enuFrame({ latitude: site.latDeg, longitude: site.lonDeg, height: site.heightM });
  return { ...frame, origin: frame.origin.map((m) => m / 1000) };
}

function axesAt(utcMs) {
  const whole = Math.floor(utcMs),
    fraction = utcMs - whole;
  const axes = earthAxes(whole);
  if (!fraction) return axes;
  // The frame API takes Date, which discards sub-milliseconds. Interpolating this
  // single millisecond also avoids a staircase in otherwise smooth culminations.
  const next = earthAxes(whole + 1);
  return axes.map((axis, i) => axis.map((v, j) => v + fraction * (next[i][j] - v)));
}

// EME2000 position in kilometres, from geodetic degrees and WGS84 ellipsoid height in metres.
export function siteInertialKm(site, utcMs) {
  const axes = axesAt(utcMs),
    p = siteFrame(site).origin;
  return [0, 1, 2].map((i) => p[0] * axes[0][i] + p[1] * axes[1][i] + p[2] * axes[2][i]);
}

function elevation(line, frame) {
  return (
    Math.atan2(dot(line, frame.up), Math.hypot(dot(line, frame.east), dot(line, frame.north))) *
    RAD_TO_DEG
  );
}

function geometry(position, utcMs, target, station) {
  if (position.length !== 3 || !position.every(Number.isFinite))
    throw new RangeError('observation');
  const axes = axesAt(utcMs);
  const fixed = axes.map((axis) => dot(axis, position)),
    fromTarget = sub(fixed, target.origin);
  const sun = sunPosition(utcMs),
    fixedSun = axes.map((axis) => dot(axis, sun));
  // (-r) to (target-r) is the angle about the geocentric nadir at the spacecraft.
  // The angle alone would also admit targets behind Earth. Require local elevation >= 0.
  return {
    offNadir: Math.atan2(norm(cross(fixed, fromTarget)), dot(fixed, fromTarget)) * RAD_TO_DEG,
    targetElevation: elevation(fromTarget, target),
    sunElevation: elevation(sub(fixedSun, target.origin), target),
    stationElevation: elevation(sub(fixed, station.origin), station),
  };
}

// Golden-section extremum within a local bracket, retaining either clipped endpoint.
function maximum(f, start, end) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let left = start,
    right = end,
    x = right - ratio * (right - left),
    y = left + ratio * (right - left);
  let fx = f(x),
    fy = f(y);
  while (right - left > TIME_TOL_SEC) {
    if (fx < fy) {
      left = x;
      x = y;
      fx = fy;
      y = left + ratio * (right - left);
      fy = f(y);
    } else {
      right = y;
      y = x;
      fy = fx;
      x = right - ratio * (right - left);
      fx = f(x);
    }
  }
  return [start, x, y, end].reduce((best, t) => (f(t) > f(best) ? t : best));
}

function crossing(f, low, high) {
  const leftInside = f(low) >= 0;
  while (high - low > TIME_TOL_SEC) {
    const mid = (low + high) / 2;
    const midInside = f(mid) >= 0;
    if (midInside === leftInside) low = mid;
    else high = mid;
  }
  return leftInside ? low : high;
}

// Each physical inequality is located separately. Their intersection therefore
// contains short overlaps even when none of the original grid points meets all three.
function intervals(grid, margin) {
  const values = grid.map(margin),
    extra = [];
  for (let i = 0; i < grid.length; i++) {
    const lo = Math.max(0, i - 1),
      hi = Math.min(grid.length - 1, i + 1);
    const a = values[lo],
      b = values[i],
      c = values[hi],
      inside = b >= 0;
    const sameSide = inside ? a >= 0 && c >= 0 : a < 0 && c < 0;
    if (!sameSide) continue;
    // A hidden grazing pass (or a short loss of access) can occur entirely between scans.
    // Search near coarse extrema, including the first and last incomplete passes.
    if (inside ? b > a || b > c : b < a || b < c) continue;
    if (a === b && b === c && lo !== i && hi !== i) continue;
    const t = maximum(inside ? (t) => -margin(t) : margin, grid[lo], grid[hi]);
    if (margin(t) >= 0 !== inside) extra.push(t);
  }
  const times = extra.length ? [...new Set([...grid, ...extra])].sort((a, b) => a - b) : grid;
  const result = [];
  let start = margin(times[0]) >= 0 ? times[0] : null;
  for (let i = 1; i < times.length; i++) {
    const inside = margin(times[i]) >= 0;
    if (inside === (start !== null)) continue;
    const t = crossing(margin, times[i - 1], times[i]);
    if (inside) start = t;
    else {
      if (t - start > TIME_TOL_SEC) result.push([start, t]);
      start = null;
    }
  }
  if (start !== null && times.at(-1) - start > TIME_TOL_SEC) result.push([start, times.at(-1)]);
  return result;
}

function intersect(a, b) {
  const result = [];
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i][0], b[j][0]),
      end = Math.min(a[i][1], b[j][1]);
    if (end - start > TIME_TOL_SEC) result.push([start, end]);
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return result;
}

function windowPeaks(spans, grid, elevationAt) {
  const windows = [];
  let next = 0;
  for (const [startSec, endSec] of spans) {
    const pts = [startSec];
    while (next < grid.length && grid[next] <= startSec) next++;
    while (next < grid.length && grid[next] < endSec) pts.push(grid[next++]);
    pts.push(endSec);
    const heights = pts.map(elevationAt);
    let peakSec = startSec;
    for (let i = 0; i < pts.length; i++) {
      const lo = Math.max(0, i - 1),
        hi = Math.min(pts.length - 1, i + 1);
      if (heights[i] < heights[lo] || heights[i] < heights[hi]) continue;
      const t = maximum(elevationAt, pts[lo], pts[hi]);
      if (elevationAt(t) > elevationAt(peakSec)) peakSec = t;
    }
    windows.push({ startSec, endSec, peakSec, peakElevationDeg: elevationAt(peakSec) });
  }
  return windows;
}

function appendWindows(result, added, continuous) {
  const previous = result.at(-1),
    first = added[0];
  if (continuous && previous && first && previous.endSec === first.startSec) {
    previous.endSec = first.endSec;
    if (first.peakElevationDeg > previous.peakElevationDeg) {
      previous.peakSec = first.peakSec;
      previous.peakElevationDeg = first.peakElevationDeg;
    }
    result.push(...added.slice(1));
  } else result.push(...added);
}

// Optional stateAt(t) takes elapsed SI seconds and returns the authoritative six-vector
// in EME2000 km, km/s. Its segmentBreaksSec may list internal OEM boundaries so
// that single-sided states, clipped windows and exposure settling handle jumps.
export function buildAccess(orbit, stepSeconds, epochMs, observation, stateAt) {
  const {
    target,
    station,
    maxOffNadirDeg,
    minSunElevationDeg,
    minStationElevationDeg,
    settlingSec,
    cadenceSec,
    exposureSec,
  } = observation;
  if (
    ![
      stepSeconds,
      epochMs,
      maxOffNadirDeg,
      minSunElevationDeg,
      minStationElevationDeg,
      settlingSec,
      cadenceSec,
      exposureSec,
    ].every(Number.isFinite) ||
    !(stepSeconds > 0 && settlingSec >= 0 && exposureSec > 0 && cadenceSec >= exposureSec) ||
    !orbit?.length
  )
    throw new RangeError('observation');
  const duration = (orbit.length - 1) * stepSeconds;
  const targetFrame = siteFrame(target),
    stationFrame = siteFrame(station);
  const position = stateAt
    ? (t) => {
        const state = stateAt(t);
        if (!state || state.length < 3) throw new RangeError('oemReplayCoverage');
        return state.slice(0, 3);
      }
    : (t) => positionAt(orbit, stepSeconds, t);
  const cuts = [
    0,
    ...new Set(
      (stateAt?.segmentBreaksSec ?? []).filter((t) => t > 0 && t < duration).sort((a, b) => a - b)
    ),
    duration,
  ];
  const scanStep = Math.min(20, Math.max(3, stepSeconds));
  const targetWindows = [],
    stationWindows = [],
    opportunities = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i],
      end = cuts[i + 1];
    if (end - start <= TIME_TOL_SEC) continue;
    const cache = new Map();
    // A point shared by two OEM segments belongs to the right one. A microsecond
    // separates representable present-day Unix epochs while changing LEO by < 1 cm.
    const leftOfEnd = end - Math.min(1e-6, (end - start) / 2);
    function at(t) {
      if (!cache.has(t))
        cache.set(
          t,
          geometry(
            position(t === end && i < cuts.length - 2 ? leftOfEnd : t),
            epochMs + t * 1000,
            targetFrame,
            stationFrame
          )
        );
      return cache.get(t);
    }
    const grid = [start];
    for (let k = 1; start + k * scanStep < end; k++) grid.push(start + k * scanStep);
    grid.push(end);
    const horizon = intervals(grid, (t) => at(t).targetElevation);
    const cone = intervals(grid, (t) => maxOffNadirDeg - at(t).offNadir);
    const light = intervals(grid, (t) => at(t).sunElevation - minSunElevationDeg);
    const stationPasses = intervals(
      grid,
      (t) => at(t).stationElevation - Math.max(0, minStationElevationDeg)
    );
    // Merge a continuous position across OEM metadata boundaries. A position jump
    // beyond the left-limit precision starts a new pointing/settling interval.
    const continuous =
      i > 0 &&
      norm(sub(position(start), position(start - Math.min(1e-6, (start - cuts[i - 1]) / 2)))) <
        0.0001;
    appendWindows(
      targetWindows,
      windowPeaks(intersect(intersect(horizon, cone), light), grid, (t) => at(t).targetElevation),
      continuous
    );
    appendWindows(
      stationWindows,
      windowPeaks(stationPasses, grid, (t) => at(t).stationElevation),
      continuous
    );
  }
  for (const [windowIndex, window] of targetWindows.entries()) {
    const first = window.startSec + settlingSec;
    const count = Math.floor((window.endSec - first - exposureSec) / cadenceSec) + 1;
    if (count > 1000000 - opportunities.length) throw new RangeError('observation');
    for (let n = 0; n < count; n++) {
      const startSec = first + n * cadenceSec;
      opportunities.push({
        id: opportunities.length + 1,
        startSec,
        endSec: startSec + exposureSec,
        windowIndex,
      });
    }
  }
  return { targetWindows, stationWindows, opportunities };
}
