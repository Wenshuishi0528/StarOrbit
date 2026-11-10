import {
  EARTH_RADIUS,
  cross,
  dot,
  earthAxes,
  norm,
  snapshot,
  stateAt,
  sunPosition,
  unit,
  MIN_TIME,
  MAX_TIME,
  validTime,
} from './orbit.js';
import { groundTrackAttitude } from './attitude.js';

export const CAMERA_PRESETS = {
  limb: {
    label: '翼展与地平线',
    anchor: 'station',
    azimuth: 50,
    pitch: -11,
    fov: 50,
    range: 1.08,
    screen: [-0.18, -0.12],
  },
  core: {
    label: '天和舱段近景',
    anchor: 'core',
    azimuth: -36,
    pitch: -18,
    fov: 48,
    range: 1.48,
    screen: [0.18, -0.22],
  },
  wide: {
    label: '全站广角',
    anchor: 'station',
    azimuth: 139,
    pitch: -16,
    fov: 69,
    range: 0.98,
    screen: [0.14, -0.15],
  },
  sky: {
    label: '仰望星野',
    anchor: 'station',
    azimuth: 61,
    pitch: 18,
    fov: 77,
    range: 1.3,
    screen: [-0.82, -1.05],
  },
};
export function presetCamera(id = 'limb', wingBearing) {
  const key = Object.hasOwn(CAMERA_PRESETS, id) ? id : 'limb',
    preset = CAMERA_PRESETS[key];
  const mountAzimuth =
    key === 'limb' && Number.isFinite(wingBearing) ? wingBearing : preset.azimuth;
  return {
    preset: key,
    x: 0,
    y: 0,
    z: 0,
    mountAzimuth,
    azimuth: mountAzimuth,
    pitch: preset.pitch,
    roll: 0,
    fov: preset.fov,
  };
}

export const PHOTO_ASPECT = 16 / 9;
export const CAMERA_OFFSET_LIMIT = 60;
export const EXPOSURE_SECONDS = [1, 5, 10, 15, 30, 60, 120, 300, 600];
const radians = Math.PI / 180;
const regions = [
  [116, 40],
  [137, 35],
  [122, 31],
  [78, 28],
  [31, 30],
  [8, 49],
  [-77, 39],
  [-98, 30],
  [-46, -23],
].map(([lon, lat]) => [
  Math.cos(lat * radians) * Math.cos(lon * radians),
  Math.cos(lat * radians) * Math.sin(lon * radians),
  Math.sin(lat * radians),
]);

// Every photograph samples the same closed simulated interval regardless of display refresh rate.
export function exposureTimes(start, seconds) {
  if (!Number.isFinite(start) || !EXPOSURE_SECONDS.includes(seconds)) throw Error('无效曝光时段');
  const steps = Math.ceil(seconds / 0.6);
  return Array.from({ length: steps + 1 }, (_, i) => start + (seconds * 1000 * i) / steps);
}

export function exposureState(data, time) {
  const state = snapshot(data, time);
  return state && groundTrackAttitude(state);
}

export function transformAxes(axes, vector) {
  return [0, 1, 2].map(
    (i) => axes[0][i] * vector[0] + axes[1][i] * vector[1] + axes[2][i] * vector[2]
  );
}

export function localVector(axes, vector) {
  return axes.map((axis) => dot(axis, vector));
}

// A virtual camera near the terrestrial limb. Body and star tracking share this
// exact pointing at shutter-open. Each ray thereafter follows its selected frame.
function localCamera(azimuth, pitch, roll = 0) {
  const bearing = azimuth * radians,
    elevation = pitch * radians;
  const forward = [
    Math.cos(bearing) * Math.cos(elevation),
    Math.sin(bearing) * Math.cos(elevation),
    Math.sin(elevation),
  ];
  const levelRight = [Math.sin(bearing), -Math.cos(bearing), 0],
    levelUp = cross(levelRight, forward);
  const c = Math.cos(roll * radians),
    s = Math.sin(roll * radians);
  // Positive roll tilts the camera's top to camera-right around the sightline.
  return [
    levelRight.map((v, i) => v * c - levelUp[i] * s),
    levelUp.map((v, i) => v * c + levelRight[i] * s),
    forward,
  ];
}

export function cameraAtOpen(state, settings = presetCamera()) {
  return localCamera(settings.azimuth, settings.pitch, settings.roll).map((axis) =>
    transformAxes(state.basis, axis)
  );
}

// Apply increments in the current viewfinder axes. Store the result in the same
// azimuth/elevation/roll fields the sliders, hull camera and exposure sampler use.
export function moveExposureCamera(
  settings,
  { yaw = 0, pitch = 0, roll = 0, forward = 0, lift = 0, right: strafe = 0 } = {}
) {
  if (![yaw, pitch, roll, forward, lift, strafe].every(Number.isFinite)) return settings;
  if (!yaw && !pitch && !roll && !forward && !lift && !strafe) return settings;
  let [right, up, sight] = localCamera(settings.azimuth, settings.pitch, settings.roll);
  const turn = (a, b, angle) => {
    const c = Math.cos(angle * radians),
      s = Math.sin(angle * radians);
    return [a.map((v, i) => c * v + s * b[i]), b.map((v, i) => c * v - s * a[i])];
  };
  // Left yaw turns towards -right; pitch-up turns towards +up.
  if (yaw) [right, sight] = turn(right, sight, yaw);
  if (pitch) [sight, up] = turn(sight, up, pitch);
  if (roll) [up, right] = turn(up, right, roll);
  const next = { ...settings };
  if (yaw || pitch || roll) {
    const horizontal = Math.hypot(sight[0], sight[1]);
    const az = horizontal < 1e-10 ? settings.azimuth : Math.atan2(sight[1], sight[0]) / radians;
    const levelRight = [Math.sin(az * radians), -Math.cos(az * radians), 0];
    next.azimuth = az;
    next.pitch = Math.atan2(sight[2], horizontal) / radians;
    next.roll = Math.atan2(dot(up, levelRight), dot(up, cross(levelRight, sight))) / radians;
  }
  if (forward || lift || strafe) {
    const delta = sight.map((v, i) => v * forward + up[i] * lift + right[i] * strafe),
      axes = ['x', 'y', 'z'];
    // Stop on the first mount limit without bending a straight view-axis move.
    let fraction = 1;
    for (const [i, axis] of axes.entries())
      if (Math.abs(delta[i]) > 1e-12) {
        const limit = Math.sign(delta[i]) * CAMERA_OFFSET_LIMIT;
        fraction = Math.min(fraction, Math.max(0, (limit - settings[axis]) / delta[i]));
      }
    for (const [i, axis] of axes.entries())
      next[axis] = Math.max(
        -CAMERA_OFFSET_LIMIT,
        Math.min(CAMERA_OFFSET_LIMIT, settings[axis] + delta[i] * fraction)
      );
  }
  return next;
}

// Anchor the virtual mount to the model. Panning, tilting and zooming change
// only the lens. The position offsets are in metres along the station axes.
export function mountPosition(settings, center, span, unitsPerMetre) {
  const preset = CAMERA_PRESETS[settings.preset],
    base = localCamera(settings.mountAzimuth, preset.pitch);
  const half = Math.tan((preset.fov * radians) / 2);
  const towards = unit(
    transformAxes(base, [preset.screen[0] * half * PHOTO_ASPECT, preset.screen[1] * half, 1])
  );
  const offsets = [settings.x, settings.y, settings.z];
  return center.map(
    (value, i) => value - preset.range * span * towards[i] + offsets[i] * unitsPerMetre
  );
}

// Choose a three-quarter view presenting the actual deployed blue cell faces.
// Once chosen, the mount stays fixed while the observer adjusts the lens.
export function preferredWingBearing(panels) {
  const area = panels.reduce((total, panel) => total + panel.area, 0);
  if (!(area > 0)) return CAMERA_PRESETS.limb.azimuth;
  let best = CAMERA_PRESETS.limb.azimuth,
    score = -Infinity;
  for (let angle = -175; angle <= 180; angle += 5) {
    const eye = unit(mountPosition(presetCamera('limb', angle), [0, 0, 0], 1, 1));
    const faces = panels.reduce(
      (total, panel) => total + panel.area * Math.max(0, dot(panel.normal, eye)),
      0
    );
    const candidate =
      faces / area +
      0.065 * Math.abs(Math.sin(2 * angle * radians)) +
      0.006 * Math.cos((angle - 50) * radians);
    if (candidate > score) {
      score = candidate;
      best = angle;
    }
  }
  return best;
}

export function trackingAxes(state, initialBody, initialCamera, mode) {
  if (mode === 'inertial') return initialCamera;
  return initialCamera.map((axis) => transformAxes(state.basis, localVector(initialBody, axis)));
}

export function earthIntercept(position, direction) {
  const along = -dot(position, direction);
  const disc = along * along - (dot(position, position) - EARTH_RADIUS * EARTH_RADIUS);
  if (along <= 0 || disc < 0) return null;
  const distance = along - Math.sqrt(disc);
  return position.map((value, i) => value + distance * direction[i]);
}

export function recommendedNight(data, preferred, seconds, azimuth = 56) {
  if (!data?.rows || data.rows.length < 8 || !validTime(preferred) || !(seconds > 0)) return null;
  const center = preferred;
  const lo = Math.max(MIN_TIME, center - 86400000),
    hi = Math.min(MAX_TIME - seconds * 1000, center + 86400000);
  if (hi < lo) return null;
  let best = lo,
    bestScore = -Infinity;
  // Look ahead and across track along the camera's ray to favour actual lit land.
  for (let time = lo; time <= hi; time += 180000) {
    const mid = time + seconds * 500,
      pv = stateAt(data, mid);
    if (!pv) continue;
    const z = unit(pv.position),
      normal = unit(cross(pv.position, pv.velocity));
    const along = cross(normal, z),
      bearing = azimuth * radians;
    const tangent = along.map((x, i) => Math.cos(bearing) * x + Math.sin(bearing) * normal[i]);
    const down = Math.acos(EARTH_RADIUS / norm(pv.position)) + 9 * radians;
    const ray = tangent.map((v, i) => v * Math.cos(down) - z[i] * Math.sin(down));
    const hit = earthIntercept(pv.position, unit(ray));
    if (!hit) continue;
    const point = unit(hit);
    const fixed = localVector(earthAxes(mid), point),
      sun = unit(sunPosition(mid));
    const night = Math.max(-1, Math.min(1, -dot(point, sun) * 3));
    const land = Math.max(...regions.map((region) => dot(region, fixed)));
    const score = night + 4 * land - (Math.abs(time - center) / 86400000) * 0.025;
    if (score > bestScore) {
      best = time;
      bestScore = score;
    }
  }
  return Number.isFinite(bestScore) ? best : null;
}
