// Ground sites use degrees and metres above mean sea level (MSL). Copernicus DEM
// is EGM2008 orthometric height. ECEF requires ellipsoid height h = H + N;
// geoidUndulation is explicit so a geoid grid can be supplied without changing
// site records. With N=0 the renderer uses a shared approximate vertical datum.
export const WGS84_A = 6378137;
export const WGS84_F = 1 / 298.257223563;
const E2 = WGS84_F * (2 - WGS84_F);
const DEG = Math.PI / 180;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const wrapGroundLongitude = (v) => ((((v + 180) % 360) + 360) % 360) - 180;
export const wrapGroundAzimuth = (v) => ((v % 360) + 360) % 360;
export const MAX_GROUND_HEIGHT = 100_000_000;
export const GROUND_SPEEDS = Object.freeze({ slow: 2, normal: 25, fast: 500 });

export function normalizeGroundSite(site) {
  const latitude = Number(site?.latitude),
    longitude = Number(site?.longitude);
  const height = Number(site?.height ?? 0);
  if (![latitude, longitude, height].every(Number.isFinite) || Math.abs(latitude) > 90)
    throw new RangeError('Invalid ground location');
  return {
    name: String(site.name || '').slice(0, 100),
    latitude,
    longitude: wrapGroundLongitude(longitude),
    height,
  };
}
export function geodeticToECEF(site, geoidUndulation = 0) {
  const s = normalizeGroundSite(site),
    lat = s.latitude * DEG,
    lon = s.longitude * DEG;
  const h = s.height + geoidUndulation,
    n = WGS84_A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  return [
    (n + h) * Math.cos(lat) * Math.cos(lon),
    (n + h) * Math.cos(lat) * Math.sin(lon),
    (n * (1 - E2) + h) * Math.sin(lat),
  ];
}
export function ecefToGeodetic(position, geoidUndulation = 0) {
  if (position?.length !== 3 || !position.every(Number.isFinite))
    throw new RangeError('Invalid ECEF position');
  const [x, y, z] = position,
    p = Math.hypot(x, y);
  if (p < 1e-8)
    return {
      latitude: z >= 0 ? 90 : -90,
      longitude: 0,
      height: Math.abs(z) - WGS84_A * (1 - WGS84_F) - geoidUndulation,
    };
  let lat = Math.atan2(z, p * (1 - E2));
  for (let i = 0; i < 12; i++) {
    const n = WGS84_A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
    const next = Math.atan2(z + E2 * n * Math.sin(lat), p);
    if (Math.abs(next - lat) < 1e-14) {
      lat = next;
      break;
    }
    lat = next;
  }
  const n = WGS84_A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  const height = p * Math.cos(lat) + z * Math.sin(lat) - n * (1 - E2 * Math.sin(lat) ** 2);
  return {
    latitude: lat / DEG,
    longitude: wrapGroundLongitude(Math.atan2(y, x) / DEG),
    height: height - geoidUndulation,
  };
}
export function enuFrame(site, geoidUndulation = 0) {
  const s = normalizeGroundSite(site),
    lat = s.latitude * DEG,
    lon = s.longitude * DEG;
  return {
    origin: geodeticToECEF(s, geoidUndulation),
    east: [-Math.sin(lon), Math.cos(lon), 0],
    north: [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)],
    up: [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)],
  };
}
export function localFromECEF(position, frame) {
  const delta = position.map((v, i) => v - frame.origin[i]);
  return [dot(delta, frame.east), dot(delta, frame.north), dot(delta, frame.up)];
}
export function ecefFromLocal(position, frame) {
  return frame.origin.map(
    (v, i) =>
      v + frame.east[i] * position[0] + frame.north[i] * position[1] + frame.up[i] * position[2]
  );
}
const worldVector = (v, frame) =>
  frame.east.map((_, i) => frame.east[i] * v[0] + frame.north[i] * v[1] + frame.up[i] * v[2]);
const localVector = (v, frame) => [dot(v, frame.east), dot(v, frame.north), dot(v, frame.up)];

// Tangent displacement is projected back onto WGS84 after every small step.
// Preserving height avoids climbing away from Earth along a fixed tangent plane.
export function moveOnEarth(site, eastMeters, northMeters, upMeters = 0) {
  const s = normalizeGroundSite(site),
    frame = enuFrame(s);
  const moved = ecefToGeodetic(ecefFromLocal([eastMeters, northMeters, 0], frame));
  return {
    ...s,
    latitude: moved.latitude,
    longitude: moved.longitude,
    height: s.height + upMeters,
  };
}
export function groundViewDirection(azimuth, elevation = 0) {
  const a = azimuth * DEG,
    e = elevation * DEG;
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}
export function createGroundState(options = {}) {
  const site = normalizeGroundSite(
    options.site || { latitude: 39.9042, longitude: 116.4074, height: 50, name: '北京' }
  );
  return {
    site,
    azimuth: wrapGroundAzimuth(options.azimuth ?? 180),
    elevation: clamp(options.elevation ?? 15, -89.5, 89.5),
    mode: options.mode === 'grounded' ? 'grounded' : 'free',
    eyeHeight: Math.max(0.2, Number(options.eyeHeight) || 1.7),
    speed: Object.hasOwn(GROUND_SPEEDS, options.speed) ? options.speed : 'normal',
    speedMps: 0,
    terrainHeight: null,
    terrainReady: false,
    velocity: [0, 0, 0],
  };
}
export function groundSpeedLimit(state) {
  const base = GROUND_SPEEDS[state.speed] || GROUND_SPEEDS.normal;
  if (state.mode === 'grounded') return base;
  const clearance = Math.max(0, state.site.height - (state.terrainHeight ?? 0) - 50);
  const factor = { slow: 0.03, normal: 0.2, fast: 0.6 }[state.speed] || 0.2;
  return Math.min(1_000_000, base + clearance * factor);
}
function heightSample(sampleHeight, site) {
  const value = sampleHeight?.(site.latitude, site.longitude);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Mutates this small owned navigation state. dt is real elapsed seconds, never
// the astronomy playback multiplier. Long inactive frames are bounded to 0.25s.
export function stepGroundMotion(state, axes = {}, dt = 0, sampleHeight) {
  if (!Number.isFinite(dt) || dt < 0) return state;
  let remaining = Math.min(dt, 0.25);
  const initialHeight = heightSample(sampleHeight, state.site);
  const attached =
    state.terrainReady &&
    Number.isFinite(state.terrainHeight) &&
    Math.abs(state.site.height - state.terrainHeight - state.eyeHeight) < 0.05 &&
    state.velocity[2] <= 0.01;
  state.terrainReady = initialHeight !== null;
  if (initialHeight !== null) {
    state.terrainHeight = initialHeight;
    if (state.mode === 'grounded' || attached) state.site.height = initialHeight + state.eyeHeight;
    else state.site.height = Math.max(state.site.height, initialHeight + state.eyeHeight);
  }
  while (remaining > 1e-8) {
    const h = Math.min(remaining, 1 / 60);
    remaining -= h;
    state.azimuth = wrapGroundAzimuth(state.azimuth - (axes.yaw || 0) * 45 * h);
    state.elevation = clamp(state.elevation + (axes.pitch || 0) * 45 * h, -89.5, 89.5);
    const a = state.azimuth * DEG,
      e = (state.mode === 'grounded' ? 0 : state.elevation) * DEG;
    const f = axes.forward || 0,
      r = axes.right || 0,
      u = state.mode === 'free' ? axes.up || 0 : 0;
    const direction = [
      f * Math.sin(a) * Math.cos(e) + r * Math.cos(a),
      f * Math.cos(a) * Math.cos(e) - r * Math.sin(a),
      f * Math.sin(e) + u,
    ];
    const length = Math.hypot(...direction),
      cap = groundSpeedLimit(state);
    const desired = direction.map((v) => (length > 0 ? (v / Math.max(1, length)) * cap : 0));
    const reversing = dot(desired, state.velocity) < 0;
    const tau = length === 0 ? 0.12 : reversing ? 0.18 : 1.3;
    const blend = 1 - Math.exp(-h / tau);
    state.velocity = state.velocity.map((v, i) => v + (desired[i] - v) * blend);
    if (state.mode === 'grounded') state.velocity[2] = 0;
    if (Math.hypot(...state.velocity) < 0.001) state.velocity = [0, 0, 0];
    if (state.velocity.every((v) => v === 0)) continue;
    const beforeFrame = enuFrame(state.site),
      worldHeading = worldVector(groundViewDirection(state.azimuth), beforeFrame);
    const next = moveOnEarth(
      state.site,
      state.velocity[0] * h,
      state.velocity[1] * h,
      state.velocity[2] * h
    );
    const terrain = heightSample(sampleHeight, next);
    if (state.mode === 'grounded' && terrain === null) {
      state.velocity = [0, 0, 0];
      state.terrainReady = false;
      break;
    }
    if (terrain !== null) {
      state.terrainHeight = terrain;
      state.terrainReady = true;
      next.height =
        state.mode === 'grounded'
          ? terrain + state.eyeHeight
          : Math.max(next.height, terrain + state.eyeHeight);
      if (
        state.mode === 'free' &&
        next.height <= terrain + state.eyeHeight &&
        state.velocity[2] < 0
      )
        state.velocity[2] = 0;
    }
    if (next.height > MAX_GROUND_HEIGHT) {
      next.height = MAX_GROUND_HEIGHT;
      state.velocity[2] = Math.min(0, state.velocity[2]);
    }
    const afterFrame = enuFrame(next),
      heading = localVector(worldHeading, afterFrame);
    state.azimuth = wrapGroundAzimuth(Math.atan2(heading[0], heading[1]) / DEG);
    state.velocity = localVector(worldVector(state.velocity, beforeFrame), afterFrame);
    if (state.mode === 'grounded') state.velocity[2] = 0;
    state.site = next;
  }
  state.speedMps = Math.hypot(...state.velocity);
  return state;
}
