import { Body, GeoMoon, HelioVector } from 'astronomy-engine';
import { earthAxes } from '../earth-frame.js';
import { AU, cross, dot, norm, sunlightFraction } from '../orbit.js';

// Gravity constants retain the StarOrbit v1.67 EME2000 inertial-z J2 convention.
// Sun and Moon GM: JPL DE440, https://ssd.jpl.nasa.gov/astro_par.html
const MU = 398600.4418,
  RE = 6378.1363,
  J2 = 0.00108262668;
const MU_SUN = 132712440041.279419,
  MU_MOON = 4902.800118;
const WGS_A = 6378.137,
  WGS_F = 1 / 298.257223563,
  WGS_E2 = WGS_F * (2 - WGS_F);
const EARTH_SPIN = 7.292115e-5;
const PRESSURE_1_AU = 1361 / 299792458; // W/m² divided by m/s gives N/m².

export const forceFields = {
  massKg: [12, 0.1, 100000, 'kg'],
  dragAreaM2: [0.08, 0, 1000, 'm²'],
  cd: [2.2, 0, 5, ''],
  srpAreaM2: [0.1, 0, 1000, 'm²'],
  cr: [1.3, 0, 2, ''],
  densityScale: [1, 0.01, 100, ''],
};
const switches = ['drag', 'srp', 'thirdBody'];

export function validateForces(raw = {}) {
  if (Object.prototype.toString.call(raw) !== '[object Object]') throw new RangeError('forces');
  for (const key of Object.keys(raw)) {
    if (!switches.includes(key) && !Object.hasOwn(forceFields, key)) throw new RangeError('forces');
  }
  const config = {};
  for (const key of switches) {
    const flag = Object.hasOwn(raw, key) ? raw[key] : false;
    if (typeof flag !== 'boolean') throw new RangeError(key);
    config[key] = flag;
  }
  for (const [key, [initial, min, max]] of Object.entries(forceFields)) {
    const value = Object.hasOwn(raw, key) ? raw[key] : initial;
    if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(key);
    config[key] = value;
  }
  return config;
}

// Modified Harris–Priester at mean solar activity. Table 3.8, Montenbruck & Gill,
// Satellite Orbits, doi:10.1007/978-3-642-58351-3 (data attributed to Long et al.).
// Geodetic height [km], minimum and maximum neutral mass densities [kg/m³].
// prettier-ignore
const hp = [
  [100,4.974e-7,4.974e-7], [120,2.490e-8,2.490e-8],
  [130,8.377e-9,8.710e-9], [140,3.899e-9,4.059e-9], [150,2.122e-9,2.215e-9],
  [160,1.263e-9,1.344e-9], [170,8.008e-10,8.758e-10], [180,5.283e-10,6.010e-10],
  [190,3.617e-10,4.297e-10], [200,2.557e-10,3.162e-10], [210,1.839e-10,2.396e-10],
  [220,1.341e-10,1.853e-10], [230,9.949e-11,1.455e-10], [240,7.488e-11,1.157e-10],
  [250,5.709e-11,9.308e-11], [260,4.403e-11,7.555e-11], [270,3.430e-11,6.182e-11],
  [280,2.697e-11,5.095e-11], [290,2.139e-11,4.226e-11], [300,1.708e-11,3.526e-11],
  [320,1.099e-11,2.511e-11], [340,7.214e-12,1.819e-11], [360,4.824e-12,1.337e-11],
  [380,3.274e-12,9.955e-12], [400,2.249e-12,7.492e-12], [420,1.558e-12,5.684e-12],
  [440,1.091e-12,4.355e-12], [460,7.701e-13,3.362e-12], [480,5.474e-13,2.612e-12],
  [500,3.916e-13,2.042e-12], [520,2.819e-13,1.605e-12], [540,2.042e-13,1.267e-12],
  [560,1.488e-13,1.005e-12], [580,1.092e-13,7.997e-13], [600,8.070e-14,6.390e-13],
  [620,6.012e-14,5.123e-13], [640,4.519e-14,4.121e-13], [660,3.430e-14,3.325e-13],
  [680,2.632e-14,2.691e-13], [700,2.043e-14,2.185e-13], [720,1.607e-14,1.779e-13],
  [740,1.281e-14,1.452e-13], [760,1.036e-14,1.190e-13], [780,8.496e-15,9.776e-14],
  [800,7.069e-15,8.059e-14], [840,4.680e-15,5.741e-14], [880,3.200e-15,4.210e-14],
  [920,2.210e-15,3.130e-14], [960,1.560e-15,2.360e-14], [1000,1.150e-15,1.810e-14],
];

const asKm = (v, scale = AU) => [v.x * scale, v.y * scale, v.z * scale];

function atmosphereHeight(r, pole) {
  const z = dot(r, pole);
  const p = Math.hypot(r[0] - z * pole[0], r[1] - z * pole[1], r[2] - z * pole[2]);
  let lat = Math.atan2(z, p * (1 - WGS_E2));
  // At LEO altitudes three iterations suffice for sub-millimetre heights.
  for (let k = 0; k < 3; k++) {
    const s = Math.sin(lat),
      n = WGS_A / Math.sqrt(1 - WGS_E2 * s * s);
    lat = Math.atan2(z + WGS_E2 * n * s, p);
  }
  const s = Math.sin(lat);
  const height = p * Math.cos(lat) + z * s - WGS_A * Math.sqrt(1 - WGS_E2 * s * s);
  if (!(height >= 100 - 1e-9 && height <= 1000 + 1e-9)) throw new RangeError('dragAltitude');
  return Math.min(1000, Math.max(100, height));
}

// Defaults to an equator-aligned frame for standalone density checks.
export function harrisPriesterDensity(r, sun, pole = [0, 0, 1]) {
  const height = atmosphereHeight(r, pole);
  let low = 0,
    high = hp.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >>> 1;
    if (hp[mid][0] < height) low = mid;
    else high = mid;
  }
  const from = hp[low],
    to = hp[high],
    f = (height - from[0]) / (to[0] - from[0]);
  const rhoMin = from[1] * (to[1] / from[1]) ** f;
  const rhoMax = from[2] * (to[2] / from[2]) ** f;

  // Rodrigues rotation of the subsolar direction 30° east about the spin pole.
  const cosLag = Math.sqrt(3) / 2,
    sinLag = 0.5;
  const cosBulge =
    (cosLag * dot(r, sun) +
      sinLag * dot(r, cross(pole, sun)) +
      (1 - cosLag) * dot(r, pole) * dot(sun, pole)) /
    (norm(r) * norm(sun));
  const cosHalfSquared = (1 + Math.min(1, Math.max(-1, cosBulge))) / 2;
  return rhoMin + (rhoMax - rhoMin) * cosHalfSquared ** 2; // n = 4
}

// Use same-time geometric vectors in J2000 mean-equatorial axes. Only slow
// celestial data are interpolated; the spacecraft, density and shadow are
// recomputed at each individual RK4 stage, including both midpoint states.
function forceEphemeris(epochMs, options) {
  function knot(seconds) {
    const ms = epochMs + seconds * 1000,
      date = new Date(ms);
    return {
      sun: asKm(HelioVector(Body.Earth, date), -AU),
      moon: options.thirdBody ? asKm(GeoMoon(date)) : null,
      pole: options.drag ? earthAxes(ms)[2] : null,
    };
  }
  let start = NaN,
    a,
    b,
    previousTime = NaN,
    previous;
  return (seconds) => {
    if (seconds === previousTime) return previous;
    const left = 60 * Math.floor(seconds / 60);
    if (left !== start) {
      a = left === start + 60 ? b : knot(left);
      b = knot(left + 60);
      start = left;
    }
    const f = (seconds - start) / 60;
    const blend = (u, v) => u.map((x, i) => x + f * (v[i] - x));
    const pole = a.pole && blend(a.pole, b.pole);
    const length = pole ? norm(pole) : 1;
    previous = {
      sun: blend(a.sun, b.sun),
      moon: a.moon && blend(a.moon, b.moon),
      pole: pole && pole.map((v) => v / length),
    };
    previousTime = seconds;
    return previous;
  };
}

function addThirdBody(a, r, body, gm) {
  // Stable differential acceleration, including acceleration of the Earth.
  // expm1 avoids the cancellation in |body|³ / |body-r|³ - 1 near Earth.
  const rr = dot(body, body);
  const q = (dot(r, r) - 2 * dot(r, body)) / rr;
  const delta = Math.expm1(-1.5 * Math.log1p(q));
  const scale = gm / (rr * Math.sqrt(rr));
  for (let i = 0; i < 3; i++) a[i] += scale * (body[i] * delta - r[i] * (1 + delta));
}

export function createPropagator({ gravity, forces, epochMs }) {
  if (gravity !== 'j2' && gravity !== 'twoBody') throw new RangeError('gravity');
  if (!Number.isFinite(epochMs)) throw new RangeError('epochUtc');
  const config = validateForces(forces),
    j2 = gravity === 'j2';
  const ephemeris =
    config.drag || config.srp || config.thirdBody ? forceEphemeris(epochMs, config) : null;
  function acceleration(state, seconds) {
    const [x, y, z] = state,
      rr = x * x + y * y + z * z;
    const k = -MU / (rr * Math.sqrt(rr)),
      j = j2 ? (1.5 * J2 * RE * RE) / rr : 0,
      lat = (5 * z * z) / rr;
    const a = [
      k * x * (1 + j * (1 - lat)),
      k * y * (1 + j * (1 - lat)),
      k * z * (1 + j * (3 - lat)),
    ];
    if (!ephemeris) return a;
    const { sun, moon, pole } = ephemeris(seconds);
    const r = state.slice(0, 3);
    if (config.drag) {
      const rho = config.densityScale * harrisPriesterDensity(r, sun, pole);
      const rotational = cross(pole, r);
      const relative = rotational.map((w, i) => state[i + 3] - EARTH_SPIN * w);
      const scale = ((-500 * rho * config.cd * config.dragAreaM2) / config.massKg) * norm(relative);
      for (let i = 0; i < 3; i++) a[i] += scale * relative[i];
    }
    if (config.srp) {
      const away = r.map((v, i) => v - sun[i]),
        distance = norm(away);
      const pressure = PRESSURE_1_AU * (AU / distance) ** 2;
      const scale =
        (sunlightFraction(r, sun) * pressure * config.cr * config.srpAreaM2) /
        (1000 * config.massKg * distance);
      for (let i = 0; i < 3; i++) a[i] += scale * away[i];
    }
    if (config.thirdBody) {
      addThirdBody(a, r, sun, MU_SUN);
      addThirdBody(a, r, moon, MU_MOON);
    }
    return a;
  }
  function derivative(state, t) {
    return [state[3], state[4], state[5], ...acceleration(state, t)];
  }
  function advance(state, elapsedSec, dt) {
    const mid = elapsedSec + dt / 2;
    const a = derivative(state, elapsedSec);
    const b = derivative(
      state.map((v, i) => v + (dt * a[i]) / 2),
      mid
    );
    const c = derivative(
      state.map((v, i) => v + (dt * b[i]) / 2),
      mid
    );
    const d = derivative(
      state.map((v, i) => v + dt * c[i]),
      elapsedSec + dt
    );
    const next = state.map((v, i) => v + (dt * (a[i] + 2 * b[i] + 2 * c[i] + d[i])) / 6);
    if (config.drag) atmosphereHeight(next.slice(0, 3), ephemeris(elapsedSec + dt).pole);
    return next;
  }
  return { advance, acceleration };
}
