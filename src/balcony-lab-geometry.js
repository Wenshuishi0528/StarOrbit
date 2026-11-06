import { cross, dot, earthAxes, norm, unit } from './orbit.js';

export const BEIJING_BALCONY = { name: '北京', latitude: 39.9042, longitude: 116.4074, height: 50 };
// An explicitly labelled example, never an inferred skyline for a real address.
export const EXAMPLE_HORIZON = [
  [0, 6],
  [25, 6],
  [27, 19],
  [55, 19],
  [57, 8],
  [93, 8],
  [96, 14],
  [134, 14],
  [137, 5],
  [195, 5],
  [198, 11],
  [240, 11],
  [243, 20],
  [268, 20],
  [271, 8],
  [318, 8],
];
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function wrapAzimuth(angle) {
  const value = angle % 360;
  return value < 0 ? value + 360 : value || 0;
}
export const azimuthOffset = (a, centre) => wrapAzimuth(a - centre + 180) - 180;
export const siteKey = (site) =>
  [site.latitude.toFixed(5), site.longitude.toFixed(5), Math.round(site.height)].join(',');

export function normalizeHorizon(points) {
  if (!Array.isArray(points)) return [];
  const bearings = new Map();
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2) continue;
    const [a, h] = point;
    if (Number.isFinite(a) && a >= 0 && a <= 360 && Number.isFinite(h) && h >= 0 && h <= 90)
      bearings.set(wrapAzimuth(Math.round(a * 10) / 10), Math.round(h * 10) / 10);
  }
  return [...bearings].sort((a, b) => a[0] - b[0]);
}
export function horizonHeight(points, bearing) {
  if (!points.length) return 0;
  const az = wrapAzimuth(bearing),
    next = points.findIndex((point) => point[0] > az);
  const upper = points[next < 0 ? 0 : next],
    lower = points[(next < 0 ? points.length - 1 : next - 1 + points.length) % points.length];
  const width = wrapAzimuth(upper[0] - lower[0]);
  return width ? lower[1] + ((upper[1] - lower[1]) * wrapAzimuth(az - lower[0])) / width : lower[1];
}
export function observationState(point, profile) {
  const horizon = horizonHeight(profile, point.azimuth);
  const shadow =
    point.illumination <= 1e-6 ? '全影' : point.illumination < 1 - 1e-6 ? '半影' : '日照';
  const blocked = point.elevation <= horizon;
  const status = blocked
    ? '楼顶或地平线遮挡'
    : point.illumination < 0.01
      ? '目标在地影中'
      : point.sunElevation > -6
        ? '当地天光较亮'
        : '候选可见';
  return {
    horizon,
    blocked,
    shadow,
    status,
    candidate: !blocked && point.sunElevation <= -6 && point.illumination >= 0.01,
  };
}
export function recommendedPass(passes, profile) {
  let best = 0,
    score = -Infinity;
  for (const [index, pass] of passes.entries()) {
    const count = pass.path.filter((point) => observationState(point, profile).candidate).length;
    const value = count * 100 + pass.maximum.elevation;
    if (value > score) {
      score = value;
      best = index;
    }
  }
  return best;
}
export function previewTime(pass, profile) {
  const usable = pass.path.filter((q) => observationState(q, profile).candidate);
  if (!usable.length) return pass.maximum.time;
  return usable.reduce((best, q) =>
    Math.abs(q.elevation - 42) < Math.abs(best.elevation - 42) ? q : best
  ).time;
}
export function groundBasis(frame, time) {
  const axes = earthAxes(time);
  const inertial = (v) =>
    axes[0].map((_, i) => axes.reduce((sum, axis, j) => sum + axis[i] * v[j], 0));
  return [inertial(frame.east), inertial(frame.north), inertial(frame.up)];
}
export function stellarAngles(vector, basis) {
  return {
    azimuth: wrapAzimuth(Math.atan2(dot(vector, basis[0]), dot(vector, basis[1])) / DEG),
    elevation: Math.asin(clamp(dot(vector, basis[2]), -1, 1)) / DEG,
  };
}
export function angularSeparation(a, b) {
  const el = a.elevation * DEG,
    other = b.elevation * DEG;
  return (
    Math.acos(
      clamp(
        Math.sin(el) * Math.sin(other) +
          Math.cos(el) * Math.cos(other) * Math.cos((a.azimuth - b.azimuth) * DEG),
        -1,
        1
      )
    ) / DEG
  );
}
export function balconyEvents(pass, profile, sample) {
  const events = [{ time: pass.maximum.time, label: '最高点' }];
  const entries = [
    ['楼顶后出现', '落到楼顶后', (p) => p.elevation - horizonHeight(profile, p.azimuth)],
    ['离开地影', '进入地影', (p) => p.illumination - (1 - 1e-6)],
  ];
  // Resample narrow gaps in the skyline and refine sign changes inside real ephemeris coverage.
  for (const [up, down, margin] of entries) {
    const steps = Math.min(600, Math.max(64, Math.ceil((pass.end - pass.start) / 5000)));
    let previous = sample(pass.start),
      positive = margin(previous) > 0;
    for (let i = 1; i <= steps; i++) {
      const point = sample(pass.start + ((pass.end - pass.start) * i) / steps);
      const current = margin(point) > 0;
      if (current !== positive) {
        let lo = previous.time,
          hi = point.time;
        while (hi - lo > 20) {
          const mid = (hi + lo) / 2;
          if (margin(sample(mid)) > 0 === positive) lo = mid;
          else hi = mid;
        }
        events.push({ time: hi, label: current ? up : down });
      }
      previous = point;
      positive = current;
    }
  }
  return events.sort((a, b) => a.time - b.time);
}
export function balconyTrack(pass, profile, sample, events) {
  const times = [
    ...new Set([
      ...pass.path.map((q) => q.time),
      ...events.map((event) => event.time),
      ...pass.visible.flatMap((span) => [span.start, span.end]),
    ]),
  ].sort((a, b) => a - b);
  const points = times.map(sample);
  return points.slice(1).map((b, i) => ({
    a: points[i],
    b,
    state: observationState(sample((points[i].time + b.time) / 2), profile),
  }));
}

// Nadir-facing perspective on a spherical Earth. The disk edge is the actual limb
// as seen from this spacecraft distance, instead of the far hemisphere of a globe.
export function reverseCamera(fixed) {
  const radial = unit(fixed),
    longitude = Math.atan2(radial[1], radial[0]),
    east = [-Math.sin(longitude), Math.cos(longitude), 0];
  const distance = norm(fixed) / 6371;
  return {
    radial,
    east,
    north: cross(radial, east),
    distance,
    k: 1 / Math.sqrt(distance * distance - 1),
  };
}
export function diskPoint(camera, unitPosition) {
  const z = dot(camera.radial, unitPosition),
    scale = 1 / ((camera.distance - z) * camera.k);
  return {
    x: dot(camera.east, unitPosition) * scale,
    y: dot(camera.north, unitPosition) * scale,
    visible: z >= 1 / camera.distance,
  };
}
export function diskSurface(camera, x, y) {
  const rho = x * x + y * y;
  if (rho > 1) return null;
  const step =
    (camera.distance - Math.sqrt(Math.max(0, 1 - rho))) / (1 + camera.k * camera.k * rho);
  return camera.radial.map(
    (z, i) =>
      (camera.distance - step) * z + step * camera.k * (x * camera.east[i] + y * camera.north[i])
  );
}
