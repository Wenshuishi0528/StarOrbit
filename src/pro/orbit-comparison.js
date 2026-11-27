import { cross, dot, norm, sub } from '../orbit.js';
import { oemEpochs, sampleOem } from './oem.js';

// Displacements are prediction minus reference. Form the RTN basis from the
// reference orbit at each common epoch, including eccentric and inclined orbits.
export function rtnDisplacement(prediction, reference) {
  const r = reference.slice(0, 3),
    v = reference.slice(3, 6),
    h = cross(r, v);
  const radius = norm(r),
    momentum = norm(h);
  if (!(radius > 0 && momentum > radius * norm(v) * 1e-10) || !Number.isFinite(momentum)) {
    throw new RangeError('oemFrameDegenerate');
  }
  const radial = r.map((x) => x / radius),
    normal = h.map((x) => x / momentum);
  const delta = sub(prediction.slice(0, 3), r).map((x) => x * 1000);
  return [dot(radial, delta), dot(cross(normal, radial), delta), dot(normal, delta)];
}

// Compare also at actual delivered epochs. Interpolate the dense *numerical*
// solution locally; these statistics need no interpolation of the provider's data.
export function positionAt(orbit, step, seconds) {
  const index = Math.min(orbit.length - 1, Math.floor(seconds / step));
  const a = orbit[index],
    u = (seconds - index * step) / step;
  if (u === 0 || index === orbit.length - 1) return a.slice(0, 3);
  const b = orbit[index + 1],
    u2 = u * u,
    u3 = u2 * u;
  return [0, 1, 2].map(
    (i) =>
      (2 * u3 - 3 * u2 + 1) * a[i] +
      (u3 - 2 * u2 + u) * step * a[i + 3] +
      (3 * u2 - 2 * u3) * b[i] +
      (u3 - u2) * step * b[i + 3]
  );
}

// The velocity is the analytic time derivative of the same local PV Hermite
// polynomial used for access timing and native-epoch orbit comparisons.
export function denseStateAt(orbit, step, seconds) {
  const k = Math.min(orbit.length - 1, Math.floor(seconds / step));
  const a = orbit[k],
    u = (seconds - k * step) / step;
  if (!u || k === orbit.length - 1) return a;
  const b = orbit[k + 1];
  const v = [0, 1, 2].map(
    (i) =>
      (6 * u * (1 - u) * (b[i] - a[i])) / step +
      (3 * u * u - 4 * u + 1) * a[i + 3] +
      (3 * u * u - 2 * u) * b[i + 3]
  );
  return [...positionAt(orbit, step, seconds), ...v];
}

export function compareOrbit(orbit, step, epochMs, oem, name) {
  const series = new Array(orbit.length).fill(null),
    sums = [0, 0, 0];
  let sum3 = 0,
    sumV = 0,
    count = 0,
    maxM = -1,
    maxSec = 0,
    peakReferenceKm,
    peakRtnM;
  const endMs = epochMs + (orbit.length - 1) * step * 1000;
  const intervals = [];
  for (const segment of oem.segments) {
    const start = Math.max(epochMs, segment.startMs),
      stop = Math.min(endMs, segment.stopMs);
    if (stop < start) continue;
    const pair = [(start - epochMs) / 1000, (stop - epochMs) / 1000];
    if (intervals.length && intervals.at(-1)[1] === pair[0]) intervals.at(-1)[1] = pair[1];
    else intervals.push(pair);
  }
  let startSec, endSec;
  for (let i = 0; i < orbit.length; i++) {
    const t = i * step,
      reference = sampleOem(oem, epochMs + t * 1000);
    if (!reference) continue;
    const residual = rtnDisplacement(orbit[i], reference),
      length = norm(residual);
    series[i] = residual;
    for (let k = 0; k < 3; k++) {
      sums[k] += residual[k] ** 2;
      sumV += ((orbit[i][k + 3] - reference[k + 3]) * 1000) ** 2;
    }
    sum3 += length ** 2;
    if (count === 0) startSec = t;
    endSec = t;
    count++;
    if (length > maxM) {
      maxM = length;
      maxSec = t;
      peakRtnM = residual;
      peakReferenceKm = reference.slice(0, 3);
    }
  }
  if (!count) throw new RangeError('oemNoOverlap');
  let nativeCount = 0,
    nativeSum = 0,
    nativeMax = 0;
  for (const t of oemEpochs(oem, epochMs, endMs)) {
    const prediction = positionAt(orbit, step, (t - epochMs) / 1000);
    const reference = sampleOem(oem, t);
    const length = norm(sub(prediction, reference)) * 1000;
    nativeCount++;
    nativeSum += length ** 2;
    nativeMax = Math.max(nativeMax, length);
  }
  return {
    referenceName: name || oem.objectName,
    count,
    startSec,
    endSec,
    intervals,
    rmsM: Math.sqrt(sum3 / count),
    rmsRtnM: sums.map((s) => Math.sqrt(s / count)),
    rmsVelocityMps: Math.sqrt(sumV / count),
    maxM,
    maxSec,
    peakRtnM,
    peakReferenceKm,
    series,
    native: {
      count: nativeCount,
      rmsM: nativeCount ? Math.sqrt(nativeSum / nativeCount) : null,
      maxM: nativeCount ? nativeMax : null,
    },
  };
}
