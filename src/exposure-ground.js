import { cross, dot, earthAxes, norm, sub, unit, EARTH_RADIUS } from './orbit.js';
import {
  validateObserver,
  observerFrame,
  lookAngles,
  predictionSource,
} from './pass-prediction.js';
import {
  CAMERA_PRESETS,
  cameraAtOpen,
  exposureState,
  localVector,
  transformAxes,
} from './exposure-lab-math.js';

const DEG = Math.PI / 180;
export const exposureModes = Object.freeze({
  body: ['body'],
  inertial: ['inertial'],
  ground: ['ground'],
  'compare-stars': ['body', 'inertial'],
  'compare-ground': ['body', 'ground'],
});
export const usesGround = (mode) => exposureModes[mode]?.includes('ground') || false;
export const BEIJING_EXPOSURE = Object.freeze({
  name: '北京',
  latitude: 39.9042,
  longitude: 116.4074,
  height: 50,
});
const identity = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// The pass table uses WGS84. For imaging, place the same geodetic longitude
// and latitude on the simulator's spherical texture, with metres converted to km.
export function exposureSite(raw) {
  const site = validateObserver(raw),
    frame = observerFrame(site),
    lat = site.latitude * DEG,
    lon = site.longitude * DEG;
  const normal = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  return {
    site,
    frame,
    normal,
    surface: normal.map((x) => x * (EARTH_RADIUS + Math.max(0, site.height) / 1000)),
  };
}
export function groundCamera(state, eye, site, settings) {
  const target = transformAxes(state.earthAxes, site.surface),
    forward = unit(sub(target, eye)),
    north = transformAxes(state.earthAxes, site.frame.north);
  let right = cross(forward, north);
  if (norm(right) < 1e-7) right = transformAxes(state.earthAxes, site.frame.east);
  right = unit(right);
  const base = [right, unit(cross(right, forward)), forward];
  const nominal = {
    ...settings,
    azimuth: settings.mountAzimuth,
    pitch: CAMERA_PRESETS[settings.preset].pitch,
    roll: 0,
  };
  const nominalAxes = cameraAtOpen({ basis: identity }, nominal),
    userAxes = cameraAtOpen({ basis: identity }, settings);
  return userAxes.map((axis) => transformAxes(base, localVector(nominalAxes, axis)));
}
export function groundSource(data) {
  return predictionSource(data, { allowEstimate: true });
}
export function groundExposureState(data, source, time) {
  if (time < source.start || time > source.end) return null;
  return exposureState(data, time);
}

export function siteElevation(source, site, time) {
  const state = source.position(time, earthAxes(time));
  const geometric = lookAngles(state.fixed, site.frame).elevation;
  const line = sub(state.fixed, site.surface);
  const rendered = Math.asin(Math.max(-1, Math.min(1, dot(unit(line), site.normal)))) / DEG;
  return Math.min(geometric, rendered);
}
// Check every exposure integration interval. A loss of visibility is an error
// for the entire photograph; silently omitting hidden samples changes its shutter.
export function groundWindow(source, site, start, seconds) {
  const end = start + seconds * 1000;
  if (start < source.start || start > source.end || end > source.end)
    return {
      ok: false,
      reason: 'coverage',
      until: source.end,
      seconds: Math.max(0, Math.floor((source.end - start) / 1000)),
    };
  if (siteElevation(source, site, start) <= 0)
    return { ok: false, reason: 'hidden', until: start, seconds: 0 };
  const steps = Math.max(1, Math.ceil(seconds / 0.6));
  for (let i = 1; i <= steps; i++) {
    const time = start + ((end - start) * i) / steps;
    if (siteElevation(source, site, time) > 0) continue;
    let lo = start + ((end - start) * (i - 1)) / steps,
      hi = time;
    while (hi - lo > 16) {
      const mid = (lo + hi) / 2;
      if (siteElevation(source, site, mid) > 0) lo = mid;
      else hi = mid;
    }
    return {
      ok: false,
      reason: 'setting',
      until: lo,
      seconds: Math.max(0, Math.floor((lo - start) / 1000)),
    };
  }
  return { ok: true, estimated: start < source.recordStart || end > source.recordEnd };
}
